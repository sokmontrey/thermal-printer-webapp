import { useEffect, useState } from "react"
import { Bluetooth, Cable, RefreshCw, Usb, Wifi } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ConnState } from "@/hooks/use-printer"
import { grantedPorts, webSerialAvailable } from "@/lib/transport"
import { rememberedBleDevices, webBluetoothAvailable } from "@/lib/bluetooth"

type Mode = "usb" | "bluetooth" | "wifi"

interface Props {
  target: string
  state: ConnState
  busy: boolean
  onConnectUsb: () => Promise<unknown>
  onConnectUsbKnown: (index?: number) => Promise<unknown>
  onConnectBluetooth: () => Promise<unknown>
  onConnectBluetoothKnown: (index?: number) => Promise<unknown>
  onConnectWifi: (target: string) => Promise<unknown>
  onDisconnect: () => Promise<void>
  onStatus: () => Promise<void>
  onInit: () => Promise<void>
}

const SUGGESTIONS = ["thermalprint.local:9100", "192.168.4.1:9100"]

export function ConnectionPanel({
  target,
  state,
  busy,
  onConnectUsb,
  onConnectUsbKnown,
  onConnectBluetooth,
  onConnectBluetoothKnown,
  onConnectWifi,
  onDisconnect,
  onStatus,
  onInit,
}: Props) {
  const [mode, setMode] = useState<Mode>("usb")
  const [value, setValue] = useState(target)
  const [granted, setGranted] = useState(0)
  const [remembered, setRemembered] = useState(0)
  const connected = state === "connected"
  const serialReady = webSerialAvailable()
  const bluetoothReady = webBluetoothAvailable()

  useEffect(() => {
    grantedPorts().then((ports) => setGranted(ports.length)).catch(() => setGranted(0))
    rememberedBleDevices()
      .then((devices) => setRemembered(devices.length))
      .catch(() => setRemembered(0))
  }, [state])

  const attempt = async (fn: () => Promise<unknown>, label: string) => {
    try {
      await fn()
      toast.success(`connected ${label}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cable className="size-4" />
          Connection
        </CardTitle>
        <CardDescription>
          USB and Bluetooth talk to the board directly from the browser. WiFi
          goes through the local bridge to TCP 9100.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList>
            <TabsTrigger value="usb">
              <Usb className="size-3.5" />
              USB
            </TabsTrigger>
            <TabsTrigger value="bluetooth">
              <Bluetooth className="size-3.5" />
              Bluetooth
            </TabsTrigger>
            <TabsTrigger value="wifi">
              <Wifi className="size-3.5" />
              WiFi
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === "usb" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {serialReady
                ? "Chrome or Edge will ask which serial device to open. Pick the XIAO (usually usbmodem or ttyACM)."
                : "Web Serial is not available in this browser. Use Chrome or Edge on desktop, served from localhost or https."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!serialReady || busy || state === "connecting"}
                onClick={() => void attempt(onConnectUsb, "over USB")}
              >
                {state === "connecting" ? "Connecting" : "Connect USB"}
              </Button>
              {granted > 0 && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void attempt(() => onConnectUsbKnown(0), "over USB")}
                >
                  Reconnect last port
                </Button>
              )}
              <Button variant="outline" disabled={!connected} onClick={() => void onDisconnect()}>
                Disconnect
              </Button>
            </div>
          </div>
        )}

        {mode === "bluetooth" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {bluetoothReady
                ? "Needs the printer_ble firmware. Chrome or Edge will ask which device to pair; pick thermalprint."
                : "Web Bluetooth is not available in this browser. Use Chrome or Edge on desktop."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!bluetoothReady || busy || state === "connecting"}
                onClick={() => void attempt(onConnectBluetooth, "over Bluetooth")}
              >
                {state === "connecting" ? "Connecting" : "Connect Bluetooth"}
              </Button>
              {remembered > 0 && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void attempt(() => onConnectBluetoothKnown(0), "over Bluetooth")}
                >
                  Reconnect remembered
                </Button>
              )}
              <Button variant="outline" disabled={!connected} onClick={() => void onDisconnect()}>
                Disconnect
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Images are slow over BLE (about one acknowledge round trip per 900-byte
              chunk). Text and codes are fine.
            </p>
          </div>
        )}

        {mode === "wifi" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-64 flex-1 space-y-1.5">
                <Label htmlFor="target">Printer address</Label>
                <Input
                  id="target"
                  value={value}
                  placeholder="host:port"
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void attempt(() => onConnectWifi(value), "over WiFi")
                  }}
                />
              </div>
              <Button
                disabled={busy || state === "connecting"}
                onClick={() => void attempt(() => onConnectWifi(value), "over WiFi")}
              >
                Connect WiFi
              </Button>
              <Button variant="outline" disabled={!connected} onClick={() => void onDisconnect()}>
                Disconnect
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Try:</span>
              {SUGGESTIONS.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setValue(s)
                    void attempt(() => onConnectWifi(s), "over WiFi")
                  }}
                >
                  {s}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Needs <code className="rounded bg-muted px-1">npm run bridge</code> running and
              the printer_wifi firmware flashed.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Badge variant={connected ? "default" : "secondary"}>
            {connected ? "connected" : state}
          </Badge>
          <Button size="sm" variant="outline" disabled={!connected || busy} onClick={() => void onStatus()}>
            <RefreshCw className="size-3.5" />
            Status
          </Button>
          <Button size="sm" variant="outline" disabled={!connected || busy} onClick={() => void onInit()}>
            Re-init
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
