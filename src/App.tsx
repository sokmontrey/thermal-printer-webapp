import { usePrinter } from "@/hooks/use-printer"
import { toast } from "sonner"
import { Printer } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ConnectionPanel } from "@/components/panels/connection-panel"
import { WifiPanel } from "@/components/panels/wifi-panel"
import { TextPanel } from "@/components/panels/text-panel"
import { ImagePanel } from "@/components/panels/image-panel"
import { CodePanel } from "@/components/panels/code-panel"
import { HardwarePanel } from "@/components/panels/hardware-panel"

export default function App() {
  const p = usePrinter()
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
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4 lg:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Printer className="size-5" />
            <h1 className="text-lg font-semibold">thermal printer</h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={connected ? "default" : "secondary"}>{p.state}</Badge>
            {connected && (
              <span className="text-xs text-muted-foreground">{p.target}</span>
            )}
          </div>
        </header>

        {p.progress && (
          <div className="space-y-1">
            <Progress value={(p.progress.done / Math.max(1, p.progress.total)) * 100} />
            <p className="text-xs text-muted-foreground">
              {p.progress.done} / {p.progress.total} bytes
            </p>
          </div>
        )}

        <Tabs defaultValue="connect" className="flex-1">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="connect">Connect</TabsTrigger>
            <TabsTrigger value="wifi">WiFi setup</TabsTrigger>
            <TabsTrigger value="text">Text</TabsTrigger>
            <TabsTrigger value="image">Image</TabsTrigger>
            <TabsTrigger value="code">Code</TabsTrigger>
            <TabsTrigger value="hardware">Feed &amp; density</TabsTrigger>
            <TabsTrigger value="log">Log</TabsTrigger>
          </TabsList>

          <TabsContent value="connect" className="space-y-4">
            <ConnectionPanel
              target={p.target}
              state={p.state}
              busy={p.busy}
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
          </TabsContent>

          <TabsContent value="wifi">
            <WifiPanel />
          </TabsContent>

          <TabsContent value="text">
            <TextPanel disabled={disabled} run={(label, fn) => p.run(label, fn)} />
          </TabsContent>

          <TabsContent value="image">
            <ImagePanel
              disabled={disabled}
              busy={p.busy}
              run={(label, fn) => p.run(label, fn)}
              onProgress={p.setProgress}
            />
          </TabsContent>

          <TabsContent value="code">
            <CodePanel disabled={disabled} run={(label, fn) => p.run(label, fn)} />
          </TabsContent>

          <TabsContent value="hardware">
            <HardwarePanel disabled={disabled} run={(label, fn) => p.run(label, fn)} />
          </TabsContent>

          <TabsContent value="log">
            <div className="rounded-lg border">
              <ScrollArea className="h-[60vh]">
                <div className="space-y-1 p-3 font-mono text-xs">
                  {p.log.length === 0 && (
                    <p className="text-muted-foreground">No activity yet.</p>
                  )}
                  {p.log.map((entry) => (
                    <div key={entry.id} className="flex gap-2">
                      <span className="text-muted-foreground">{entry.time}</span>
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
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>

        <Separator />
        <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Firmware: <code>sketch/printer_wifi</code> · protocol over TCP 9100
          </span>
          {p.error && <span className="text-destructive">{p.error}</span>}
        </footer>
        <Toaster position="bottom-right" />
      </div>
    </TooltipProvider>
  )
}
