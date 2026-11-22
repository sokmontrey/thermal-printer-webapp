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
import type { ConnState } from "@/hooks/use-printer"
import { grantedPorts, webSerialAvailable } from "@/lib/transport"
import { rememberedBleDevices, webBluetoothAvailable } from "@/lib/bluetooth"
import { unavailableReason, type Capabilities } from "@/lib/platform"
import { cn } from "@/lib/utils"

type Mode = "usb" | "bluetooth" | "wifi"

interface Props {
  target: string
  state: ConnState
  busy: boolean
  caps: Capabilities
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

const MODES = [
  { value: "usb", label: "USB", icon: Usb },
  { value: "bluetooth", label: "Bluetooth", icon: Bluetooth },
  { value: "wifi", label: "WiFi", icon: Wifi },
] as const

export function ConnectionPanel({
  target,
  state,
  busy,
  caps,
  onConnectUsb,
  onConnectUsbKnown,
  onConnectBluetooth,
  onConnectBluetoothKnown,
  onConnectWifi,
  onDisconnect,
  onStatus,
  onInit,
}: Props) {
  // USB is impossible on a phone, so start on Bluetooth there.
  const [mode, setMode] = useState<Mode>(caps.mobile ? "bluetooth" : "usb")
  const [value, setValue] = useState(target)
  const [granted, setGranted] = useState(0)
  const [remembered, setRemembered] = useState(0)
  const connected = state === "connected"
  const serialReady = webSerialAvailable()
  const bluetoothReady = webBluetoothAvailable()
  const serialWhy = unavailableReason("serial")
  const bluetoothWhy = unavailableReason("bluetooth")

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
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Cable className="size-4" />
          Connection
        </CardTitle>
        <CardDescription>
          USB and Bluetooth connect straight from the browser. WiFi goes through
          the bridge.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {MODES.map(({ value: m, label, icon: Icon }) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "flex min-h-10 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium transition-colors",
                mode === m
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {mode === "usb" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {serialWhy ??
                "Chrome or Edge will ask which serial device to open. Pick the XIAO (usbm or ttyACM)."}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                className="h-11 sm:h-9"
                disabled={!serialReady || busy || state === "connecting"}
                onClick={() => void attempt(onConnectUsb, "over USB")}
              >
                {state === "connecting" ? "Connecting" : "Connect USB"}
              </Button>
              {granted > 0 && (
                <Button
                  className="h-11 sm:h-9"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void attempt(() => onConnectUsbKnown(0), "over USB")}
                >
                  Reconnect last port
                </Button>
              )}
              <Button
                className="h-11 sm:h-9"
                variant="outline"
                disabled={!connected}
                onClick={() => void onDisconnect()}
              >
                Disconnect
              </Button>
            </div>
          </div>
        )}

        {mode === "bluetooth" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {bluetoothWhy ??
                "Needs the printer_ble firmware. The browser will ask which device to connect; pick thermalprint."}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                className="h-11 sm:h-9"
                disabled={!bluetoothReady || busy || state === "connecting"}
                onClick={() => void attempt(onConnectBluetooth, "over Bluetooth")}
              >
                {state === "connecting" ? "Connecting" : "Connect Bluetooth"}
              </Button>
              {remembered > 0 && (
                <Button
                  className="h-11 sm:h-9"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void attempt(() => onConnectBluetoothKnown(0), "over Bluetooth")}
                >
                  Reconnect remembered
                </Button>
              )}
              <Button
                className="h-11 sm:h-9"
                variant="outline"
                disabled={!connected}
                onClick={() => void onDisconnect()}
              >
                Disconnect
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Images take a few seconds over BLE (one acknowledge per 900-byte
              chunk). Text, QR and barcodes are quick.
            </p>
          </div>
        )}

        {mode === "wifi" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="target">Printer address</Label>
              <Input
                id="target"
                value={value}
                placeholder="host:port"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="h-11 sm:h-9"
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void attempt(() => onConnectWifi(value), "over WiFi")
                }}
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                className="h-11 sm:h-9"
                disabled={busy || state === "connecting"}
                onClick={() => void attempt(() => onConnectWifi(value), "over WiFi")}
              >
                Connect WiFi
              </Button>
              <Button
                className="h-11 sm:h-9"
                variant="outline"
                disabled={!connected}
                onClick={() => void onDisconnect()}
              >
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
              Needs the bridge reachable from this device and the printer_wifi
              firmware flashed.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Badge variant={connected ? "default" : "secondary"} className="capitalize">
            {connected ? "connected" : state}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            disabled={!connected || busy}
            onClick={() => void onStatus()}
          >
            <RefreshCw className="size-3.5" />
            Status
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            disabled={!connected || busy}
            onClick={() => void onInit()}
          >
            Re-init
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
