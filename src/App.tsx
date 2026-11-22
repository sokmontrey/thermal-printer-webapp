import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Cable,
  Image as ImageIcon,
  Printer,
  QrCode,
  ScrollText,
  SlidersHorizontal,
  Type,
  Wifi,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ConnectionPanel } from "@/components/panels/connection-panel"
import { WifiPanel } from "@/components/panels/wifi-panel"
import { TextPanel } from "@/components/panels/text-panel"
import { ImagePanel } from "@/components/panels/image-panel"
import { CodePanel } from "@/components/panels/code-panel"
import { HardwarePanel } from "@/components/panels/hardware-panel"
import { usePrinter } from "@/hooks/use-printer"
import { capabilities } from "@/lib/platform"

const TABS = [
  { value: "connect", label: "Connect", short: "Connect", icon: Cable },
  { value: "text", label: "Text", short: "Text", icon: Type },
  { value: "image", label: "Image", short: "Image", icon: ImageIcon },
  { value: "code", label: "Code", short: "Code", icon: QrCode },
  { value: "hardware", label: "Feed & density", short: "Feed", icon: SlidersHorizontal },
  { value: "wifi", label: "WiFi setup", short: "WiFi", icon: Wifi },
  { value: "log", label: "Log", short: "Log", icon: ScrollText },
] as const

type TabValue = (typeof TABS)[number]["value"]

export default function App() {
  const p = usePrinter()
  const [tab, setTab] = useState<TabValue>("connect")
  const caps = useMemo(() => capabilities(), [])
  const connected = p.state === "connected"
  const disabled = !connected || p.busy

  const guard =
    (fn: () => Promise<void>) => async () => {
      try {
        await fn()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      }
    }

  return (
    <TooltipProvider>
      <div className="flex min-h-dvh flex-col bg-background">
        <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-3 py-2.5 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <Printer className="size-5 shrink-0" />
              <h1 className="truncate text-base font-semibold sm:text-lg">
                <span className="sm:hidden">{TABS.find((t) => t.value === tab)?.label}</span>
                <span className="hidden sm:inline">thermal printer</span>
              </h1>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <Badge
                variant={connected ? "default" : "secondary"}
                className="shrink-0 capitalize"
              >
                {p.state}
              </Badge>
              {connected && (
                <span className="hidden max-w-40 truncate text-xs text-muted-foreground sm:inline">
                  {p.target}
                </span>
              )}
            </div>
          </div>
          {p.progress && (
            <div className="mx-auto w-full max-w-6xl px-3 pb-2 sm:px-6">
              <Progress
                value={(p.progress.done / Math.max(1, p.progress.total)) * 100}
                className="h-1.5"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {p.progress.done} / {p.progress.total} bytes
              </p>
            </div>
          )}
        </header>

        {/* Desktop tab rail; on phones the bottom bar takes over. */}
        <nav className="mx-auto hidden w-full max-w-6xl gap-1 overflow-x-auto px-3 pt-3 sm:flex sm:px-6">
          {TABS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                tab === value
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>

        <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-3 pb-24 sm:px-6 sm:pb-6">
          {!caps.secure && (
            <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Not a secure context. Web Serial and Web Bluetooth need https or
              localhost.
            </div>
          )}

          <div className={tab === "connect" ? "block" : "hidden"}>
            <ConnectionPanel
              target={p.target}
              state={p.state}
              busy={p.busy}
              caps={caps}
              onConnectUsb={p.connectUsb}
              onConnectUsbKnown={p.connectUsbKnown}
              onConnectBluetooth={p.connectBluetooth}
              onConnectBluetoothKnown={p.connectBluetoothKnown}
              onConnectWifi={p.connectWifi}
              onDisconnect={p.disconnect}
              onStatus={guard(async () => {
                await p.run("status", async (c) => {
                  const reply = await c.status()
                  p.addLog(reply, "ok")
                  toast.message(reply)
                })
              })}
              onInit={guard(async () => {
                await p.run("init printer", async (c) => {
                  await c.init()
                })
                toast.success("printer re-initialised")
              })}
            />
          </div>
          <div className={tab === "text" ? "block" : "hidden"}>
            <TextPanel disabled={disabled} run={(label, fn) => p.run(label, fn)} />
          </div>
          <div className={tab === "image" ? "block" : "hidden"}>
            <ImagePanel
              disabled={disabled}
              busy={p.busy}
              run={(label, fn) => p.run(label, fn)}
              onProgress={p.setProgress}
            />
          </div>
          <div className={tab === "code" ? "block" : "hidden"}>
            <CodePanel disabled={disabled} run={(label, fn) => p.run(label, fn)} />
          </div>
          <div className={tab === "hardware" ? "block" : "hidden"}>
            <HardwarePanel disabled={disabled} run={(label, fn) => p.run(label, fn)} />
          </div>
          <div className={tab === "wifi" ? "block" : "hidden"}>
            <WifiPanel />
          </div>
          <div className={tab === "log" ? "block" : "hidden"}>
            <div className="rounded-lg border">
              <div className="max-h-[70dvh] space-y-1 overflow-auto p-3 font-mono text-xs">
                {p.log.length === 0 && (
                  <p className="text-muted-foreground">No activity yet.</p>
                )}
                {p.log.map((entry) => (
                  <div key={entry.id} className="flex gap-2 break-all">
                    <span className="shrink-0 text-muted-foreground">{entry.time}</span>
                    <span
                      className={
                        entry.level === "error"
                          ? "text-destructive"
                          : entry.level === "ok"
                            ? "text-emerald-500"
                            : ""
                      }
                    >
                      {entry.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Separator className="mt-4 hidden sm:block" />
          <footer className="mt-3 hidden flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground sm:flex">
            <span>
              Firmware: <code>sketch/printer_ble</code> · BLE and WiFi 9100
            </span>
            {p.error && <span className="text-destructive">{p.error}</span>}
          </footer>
        </main>

        {/* Phone bottom bar: thumb-reachable, safe-area aware. */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)] sm:hidden">
          <div className="grid grid-cols-7">
            {TABS.map(({ value, short, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                aria-current={tab === value ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[10px] transition-colors",
                  tab === value
                    ? "text-foreground"
                    : "text-muted-foreground active:bg-accent/50",
                )}
              >
                <Icon className={cn("size-5", tab === value && "text-primary")} />
                <span className="truncate">{short}</span>
              </button>
            ))}
          </div>
        </nav>

        <Toaster position={caps.mobile ? "top-center" : "bottom-right"} richColors />
      </div>
    </TooltipProvider>
  )
}
