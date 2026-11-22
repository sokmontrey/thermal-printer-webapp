// Web Bluetooth transport for the printer_ble firmware.
//
// Talks to the Nordic UART Service: writes commands to RX, receives replies
// from TX notifications. One command line can exceed the 512-byte writeValue
// limit (an IMG: chunk is ~1800 chars), so lines are split and the firmware
// reassembles them until the newline arrives.
//
// Chrome/Edge desktop only, and only from a secure context (localhost or https).

import { TransportError, type Transport } from "./transport"

const NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
const NUS_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
const NUS_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"

const MAX_WRITE = 180
const WRITE_GAP_MS = 8

export function webBluetoothAvailable(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator
}

interface BluetoothApi {
  requestDevice(options: {
    filters: ({ services: string[] } | { name: string })[]
    optionalServices?: string[]
  }): Promise<BluetoothDeviceLike>
  getAvailability?(): Promise<boolean>
}

interface BluetoothDeviceLike {
  name?: string
  id: string
  gatt?: {
    connect(): Promise<BluetoothServerLike>
    disconnect(): void
  }
}

interface BluetoothServerLike {
  getPrimaryService(uuid: string): Promise<BluetoothServiceLike>
  connected: boolean
}

interface BluetoothServiceLike {
  getCharacteristic(uuid: string): Promise<BluetoothCharacteristicLike>
}

interface BluetoothCharacteristicLike {
  writeValueWithoutResponse?(value: BufferSource): Promise<void>
  writeValue(value: BufferSource): Promise<void>
  startNotifications(): Promise<BluetoothCharacteristicLike>
  stopNotifications(): Promise<BluetoothCharacteristicLike>
  value?: DataView
  addEventListener(type: "characteristicvaluechanged", fn: (e: Event) => void): void
  removeEventListener(type: "characteristicvaluechanged", fn: (e: Event) => void): void
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class WebBluetoothTransport implements Transport {
  readonly label: string
  private device: BluetoothDeviceLike
  private tx: BluetoothCharacteristicLike | null = null
  private rx: BluetoothCharacteristicLike | null = null
  private buffer = ""
  private pending: {
    resolve: (line: string) => void
    reject: (err: Error) => void
    timer: ReturnType<typeof setTimeout>
  } | null = null

  private constructor(device: BluetoothDeviceLike) {
    this.device = device
    this.label = device.name ? `BLE ${device.name}` : "BLE device"
  }

  /** Prompts for a BLE device advertising NUS. Must run from a user gesture. */
  static async request(): Promise<BluetoothDeviceLike> {
    if (!webBluetoothAvailable()) {
      throw new TransportError(
        "Web Bluetooth is unavailable. Use Chrome or Edge over https, or Chrome on Android.",
      )
    }
    if (!window.isSecureContext) {
      throw new TransportError(
        "Web Bluetooth needs a secure context. Serve this page over https.",
      )
    }
    const api = (navigator as unknown as { bluetooth: BluetoothApi }).bluetooth

    // Availability is a cheap pre-check; on Android it reports whether the
    // adapter is on. Without it the chooser can spin indefinitely with no
    // explanation when Bluetooth is off.
    const availability = api.getAvailability?.bind(api)
    if (availability) {
      const ok = await availability().catch(() => true)
      if (!ok) {
        throw new TransportError(
          "Bluetooth is off on this device. Turn it on, then retry.",
        )
      }
    }

    try {
      // Filter by service UUID first. Many builds also honour the name filter,
      // but some Android versions match only on the advertised name, so offer
      // both filters: a device matching either one is listed.
      return await api.requestDevice({
        filters: [{ services: [NUS_SERVICE] }, { name: "thermalprint" }],
        optionalServices: [NUS_SERVICE],
      })
    } catch (err) {
      const name = err instanceof Error ? err.name : ""
      if (name === "NotFoundError") {
        throw new TransportError(
          "No printer selected. If thermalprint is missing from the list, the board is not advertising — press its reset button and retry.",
        )
      }
      if (name === "SecurityError" || name === "NotAllowedError") {
        throw new TransportError(
          "Bluetooth permission denied. Allow it for this site, then retry.",
        )
      }
      if (name === "NetworkError") {
        throw new TransportError(
          "Could not reach the printer. It may be connected to another device — unpair it in your phone's Bluetooth settings and retry.",
        )
      }
      throw err instanceof Error ? err : new TransportError(String(err))
    }
  }

  static async open(device: BluetoothDeviceLike): Promise<WebBluetoothTransport> {
    const transport = new WebBluetoothTransport(device)
    await transport.connect()
    return transport
  }

  private async connect(): Promise<void> {
    if (!this.device.gatt) throw new TransportError("device has no GATT server")
    const server = await this.device.gatt.connect()
    const service = await server.getPrimaryService(NUS_SERVICE)
    this.rx = await service.getCharacteristic(NUS_RX)
    this.tx = await service.getCharacteristic(NUS_TX)
    await this.tx.startNotifications()
    this.tx.addEventListener("characteristicvaluechanged", this.onNotify)
  }

  private onNotify = (event: Event): void => {
    const target = event.target as unknown as BluetoothCharacteristicLike
    const value = target.value
    if (!value) return
    const bytes = new Uint8Array(
      value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
    )
    this.buffer += new TextDecoder().decode(bytes)
    let nl: number
    while ((nl = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, nl).replace(/\r$/, "").trim()
      this.buffer = this.buffer.slice(nl + 1)
      if (!line || line === "READY") continue
      this.settle(line)
    }
  }

  private settle(line: string): void {
    const waiter = this.pending
    if (!waiter) return
    this.pending = null
    clearTimeout(waiter.timer)
    waiter.resolve(line)
  }

  private settleError(err: Error): void {
    const waiter = this.pending
    if (!waiter) return
    this.pending = null
    clearTimeout(waiter.timer)
    waiter.reject(err)
  }

  async command(cmd: string, timeoutMs: number): Promise<string> {
    if (!this.rx) throw new TransportError("not connected")
    const waiting = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending?.timer === timer) this.pending = null
        reject(new TransportError("timed out waiting for printer"))
      }, timeoutMs)
      this.pending = { resolve, reject, timer }
    })

    const payload = new TextEncoder().encode(cmd + "\n")
    try {
      for (let off = 0; off < payload.length; off += MAX_WRITE) {
        const chunk = payload.subarray(off, Math.min(off + MAX_WRITE, payload.length))
        if (this.rx.writeValueWithoutResponse) {
          await this.rx.writeValueWithoutResponse(chunk)
        } else {
          await this.rx.writeValue(chunk)
        }
        await sleep(WRITE_GAP_MS)
      }
    } catch (err) {
      this.settleError(err instanceof Error ? err : new TransportError(String(err)))
    }

    const reply = await waiting
    if (reply.startsWith("ERR")) throw new TransportError(reply)
    return reply
  }

  async close(): Promise<void> {
    this.settleError(new TransportError("closed"))
    try {
      this.tx?.removeEventListener("characteristicvaluechanged", this.onNotify)
      await this.tx?.stopNotifications()
    } catch {
      // notifications already stopped
    }
    try {
      this.device.gatt?.disconnect()
    } catch {
      // already disconnected
    }
    this.tx = null
    this.rx = null
  }
}

/** Devices the browser already remembers, without prompting. */
export async function rememberedBleDevices(): Promise<BluetoothDeviceLike[]> {
  if (!webBluetoothAvailable()) return []
  const api = (navigator as unknown as {
    bluetooth?: { getDevices?: () => Promise<BluetoothDeviceLike[]> }
  }).bluetooth
  return (await api?.getDevices?.()) ?? []
}
