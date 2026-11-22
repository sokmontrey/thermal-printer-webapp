import { useCallback, useRef, useState } from "react"
import { PrinterClient, ProtocolError } from "@/lib/protocol"
import {
  BridgeTransport,
  WebSerialTransport,
  grantedPorts,
  requestPort,
} from "@/lib/transport"
import { WebBluetoothTransport, rememberedBleDevices } from "@/lib/bluetooth"

export interface LogEntry {
  id: number
  time: string
  message: string
  level: "info" | "ok" | "error"
}

export type ConnState = "disconnected" | "connecting" | "connected"

let logId = 0

export function usePrinter() {
  const [target, setTarget] = useState("thermalprint.local:9100")
  const [state, setState] = useState<ConnState>("disconnected")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const clientRef = useRef<PrinterClient | null>(null)

  const addLog = useCallback((message: string, level: LogEntry["level"] = "info") => {
    const time = new Date().toLocaleTimeString()
    setLog((prev) => [...prev.slice(-199), { id: logId++, time, message, level }])
  }, [])

  const adopt = useCallback(
    async (client: PrinterClient) => {
      setState("connecting")
      setError(null)
      addLog(`connecting via ${client.name}`, "info")
      try {
        await client.connect()
        clientRef.current = client
        setState("connected")
        addLog(`connected via ${client.name}`, "ok")
        return client
      } catch (err) {
        await client.dispose()
        setState("disconnected")
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        addLog(`connect failed: ${msg}`, "error")
        throw err
      }
    },
    [addLog],
  )

  /** Direct USB via Web Serial, prompting for a port if needed. */
  const connectUsb = useCallback(async () => {
    const port = await requestPort()
    const transport = await WebSerialTransport.open(port)
    await adopt(new PrinterClient(transport))
  }, [adopt])

  /** Reconnect to a port the user already granted, without a prompt. */
  const connectUsbKnown = useCallback(
    async (index = 0) => {
      const ports = await grantedPorts()
      const port = ports[index]
      if (!port) throw new ProtocolError("no granted serial port")
      const transport = await WebSerialTransport.open(port)
      await adopt(new PrinterClient(transport))
    },
    [adopt],
  )

  const connectWifi = useCallback(
    async (nextTarget = target) => {
      setTarget(nextTarget)
      await adopt(new PrinterClient(new BridgeTransport(nextTarget)))
    },
    [adopt, target],
  )

  /** Bluetooth LE via the Nordic UART Service, prompting for a device. */
  const connectBluetooth = useCallback(async () => {
    const device = await WebBluetoothTransport.request()
    const transport = await WebBluetoothTransport.open(device)
    await adopt(new PrinterClient(transport))
  }, [adopt])

  /** Reconnect to a BLE device the browser already remembers, no prompt. */
  const connectBluetoothKnown = useCallback(
    async (index = 0) => {
      const devices = await rememberedBleDevices()
      const device = devices[index]
      if (!device) throw new ProtocolError("no remembered BLE device")
      const transport = await WebBluetoothTransport.open(device)
      await adopt(new PrinterClient(transport))
    },
    [adopt],
  )

  const disconnect = useCallback(async () => {
    await clientRef.current?.dispose()
    clientRef.current = null
    setState("disconnected")
    addLog("disconnected", "info")
  }, [addLog])

  /** Runs a printer job with busy/progress/log bookkeeping. */
  const run = useCallback(
    async (label: string, fn: (client: PrinterClient) => Promise<void>) => {
      const client = clientRef.current
      if (!client) {
        setError("not connected")
        addLog("not connected", "error")
        throw new ProtocolError("not connected")
      }
      setBusy(true)
      setError(null)
      addLog(`-> ${label}`, "info")
      try {
        await fn(client)
        addLog(`done ${label}`, "ok")
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        addLog(`failed ${label}: ${msg}`, "error")
        throw err
      } finally {
        setBusy(false)
        setProgress(null)
      }
    },
    [addLog],
  )

  return {
    target,
    state,
    busy,
    error,
    progress,
    log,
    setProgress,
    connectUsb,
    connectUsbKnown,
    connectWifi,
    connectBluetooth,
    connectBluetoothKnown,
    disconnect,
    run,
    addLog,
  }
}
