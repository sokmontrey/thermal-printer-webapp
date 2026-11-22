// Two ways for the browser to reach the printer:
//   WebSerialTransport - direct USB CDC to the board, Chrome/Edge desktop only,
//                        no extra process, works with printer_serial firmware.
//   BridgeTransport    - local relay to TCP 9100, any browser, needs the
//                        printer_wifi firmware and `npm run bridge`.
//
// Both move newline-terminated protocol lines and resolve one reply per command.

export interface Transport {
  readonly label: string
  command(cmd: string, timeoutMs: number): Promise<string>
  close(): Promise<void>
}

export class TransportError extends Error {}

interface SerialPortInfoLike {
  usbVendorId?: number
  usbProductId?: number
}

type SerialPort = {
  open(options: { baudRate: number }): Promise<void>
  close(): Promise<void>
  readonly readable: ReadableStream<Uint8Array> | null
  readonly writable: WritableStream<Uint8Array> | null
  getInfo(): SerialPortInfoLike
}

type SerialApi = {
  requestPort(): Promise<SerialPort>
  getPorts(): Promise<SerialPort[]>
}

export function webSerialAvailable(): boolean {
  return "serial" in navigator
}

function serialApi(): SerialApi {
  if (!webSerialAvailable()) {
    throw new TransportError(
      "Web Serial is unavailable. Use Chrome or Edge on desktop over http://localhost.",
    )
  }
  return (navigator as unknown as { serial: SerialApi }).serial
}

/** Ports the user already granted, without prompting. */
export async function grantedPorts(): Promise<SerialPort[]> {
  if (!webSerialAvailable()) return []
  return serialApi().getPorts()
}

/** Prompts the user to pick a port. Must run from a user gesture. */
export async function requestPort(): Promise<SerialPort> {
  return serialApi().requestPort()
}

export class WebSerialTransport implements Transport {
  readonly label: string
  private port: SerialPort
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private buffer = ""
  private pending: {
    resolve: (line: string) => void
    reject: (err: Error) => void
    timer: ReturnType<typeof setTimeout>
  } | null = null
  private closed = false

  private constructor(port: SerialPort, label: string) {
    this.port = port
    this.label = label
  }

  static async open(port: SerialPort, baudRate = 115200): Promise<WebSerialTransport> {
    const info = port.getInfo()
    const label =
      info.usbVendorId != null
        ? `USB ${info.usbVendorId.toString(16)}:${(info.usbProductId ?? 0).toString(16)}`
        : "USB serial"
    const transport = new WebSerialTransport(port, label)
    await transport.connect(baudRate)
    return transport
  }

  private async connect(baudRate: number): Promise<void> {
    await this.port.open({ baudRate })
    if (!this.port.readable || !this.port.writable) {
      throw new TransportError("port opened without streams")
    }
    this.reader = this.port.readable.getReader()
    this.writer = this.port.writable.getWriter()
    void this.pump()
  }

  private async pump(): Promise<void> {
    const decoder = new TextDecoder()
    try {
      while (!this.closed && this.reader) {
        const { value, done } = await this.reader.read()
        if (done) break
        if (!value) continue
        this.buffer += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = this.buffer.indexOf("\n")) >= 0) {
          const line = this.buffer.slice(0, nl).replace(/\r$/, "").trim()
          this.buffer = this.buffer.slice(nl + 1)
          if (!line || line === "READY") continue
          this.settle(line)
        }
      }
    } catch {
      this.settleError(new TransportError("serial link closed"))
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
    if (!this.writer) throw new TransportError("not open")
    const waiting = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending?.timer === timer) this.pending = null
        reject(new TransportError("timed out waiting for printer"))
      }, timeoutMs)
      this.pending = { resolve, reject, timer }
    })
    await this.writer.write(new TextEncoder().encode(cmd + "\n"))
    const reply = await waiting
    if (reply.startsWith("ERR")) throw new TransportError(reply)
    return reply
  }

  async close(): Promise<void> {
    this.closed = true
    this.settleError(new TransportError("closed"))
    try {
      await this.reader?.cancel()
    } catch {
      // reader already released
    }
    try {
      this.writer?.releaseLock()
    } catch {
      // writer already released
    }
    try {
      await this.port.close()
    } catch {
      // port already closed
    }
  }
}

export class BridgeTransport implements Transport {
  readonly label: string
  readonly target: string
  private base: string

  constructor(target: string, base = "/api") {
    this.target = target
    this.base = base
    this.label = target
  }

  async command(cmd: string, timeoutMs: number): Promise<string> {
    const res = await fetch(`${this.base}/command`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: this.target, command: cmd, timeoutMs }),
    })
    const data = await res.json().catch(() => ({ error: res.statusText }))
    if (!res.ok) throw new TransportError(data.error ?? "bridge error")
    return data.reply as string
  }

  async close(): Promise<void> {
    await fetch(`${this.base}/dispose`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: this.target }),
    }).catch(() => {})
  }
}
