import { useMemo, useState } from "react"
import { AlertTriangle, Download, Info } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
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
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  DEFAULT_WIFI,
  WIFI_TROUBLESHOOTING,
  flashSteps,
  wifiHeader,
  type WifiForm,
} from "@/lib/wifi"

export function WifiPanel() {
  const [form, setForm] = useState<WifiForm>(DEFAULT_WIFI)
  const [port, setPort] = useState("/dev/ttyACM0")
  const [staticIp, setStaticIp] = useState(false)

  const header = useMemo(() => wifiHeader(form), [form])
  const steps = useMemo(() => flashSteps(port, form.ssid), [port, form.ssid])

  const set = <K extends keyof WifiForm>(key: K, value: WifiForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copied`)
    } catch {
      toast.error("clipboard unavailable")
    }
  }

  const download = () => {
    const blob = new Blob([header], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "wifi_config.h"
    a.click()
    URL.revokeObjectURL(url)
    toast.success("wifi_config.h downloaded")
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Network</CardTitle>
            <CardDescription>
              The XIAO ESP32-C6 joins WiFi at boot using credentials compiled into
              the sketch. It is 2.4 GHz only.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ssid">SSID</Label>
              <Input
                id="ssid"
                value={form.ssid}
                placeholder="home-24ghz"
                onChange={(e) => set("ssid", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                WPA2-PSK only. Leave blank for an open network.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hostname">mDNS hostname</Label>
              <Input
                id="hostname"
                value={form.hostname}
                onChange={(e) => set("hostname", e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <div>
                <Label htmlFor="static-ip">Static IP</Label>
                <p className="text-xs text-muted-foreground">
                  Otherwise the router assigns one over DHCP.
                </p>
              </div>
              <Switch id="static-ip" checked={staticIp} onCheckedChange={setStaticIp} />
            </div>

            {staticIp && (
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ip">Address</Label>
                  <Input
                    id="ip"
                    value={form.staticIp}
                    placeholder="192.168.1.50"
                    onChange={(e) => set("staticIp", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gw">Gateway</Label>
                  <Input
                    id="gw"
                    value={form.gateway}
                    placeholder="192.168.1.1"
                    onChange={(e) => set("gateway", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="mask">Subnet mask</Label>
                  <Input
                    id="mask"
                    value={form.subnet}
                    onChange={(e) => set("subnet", e.target.value)}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>No network available?</CardTitle>
            <CardDescription>
              Without credentials — or if the join fails — the board becomes an
              access point instead.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Join <Badge variant="secondary">thermalprint</Badge> from your
              laptop, then connect the app to{" "}
              <code className="rounded bg-muted px-1">192.168.4.1:9100</code>.
            </p>
            <p className="text-muted-foreground">
              Open AP, no password. The USB serial link keeps working at the same
              time, so you can always fall back to that.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Generated header</CardTitle>
            <CardDescription>
              Save as <code>sketch/printer_wifi/wifi_config.h</code>. It is
              gitignored.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <pre className="max-h-52 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
              {header}
            </pre>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void copy(header, "header")}>
                Copy
              </Button>
              <Button size="sm" variant="outline" onClick={download}>
                <Download className="size-3.5" />
                Download
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Flash it</CardTitle>
            <CardDescription>Run these from the repo root.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="port">Board port</Label>
              <Input
                id="port"
                value={port}
                onChange={(e) => setPort(e.target.value)}
              />
            </div>
            <ol className="space-y-3">
              {steps.map((step, i) => (
                <li key={step.title} className="space-y-1">
                  <div className="flex items-baseline gap-2 text-sm font-medium">
                    <span className="text-muted-foreground">{i + 1}.</span>
                    {step.title}
                  </div>
                  <p className="pl-5 text-xs text-muted-foreground">{step.detail}</p>
                  {step.command && (
                    <button
                      type="button"
                      onClick={() => void copy(step.command!, "command")}
                      className="ml-5 block w-[calc(100%-1.25rem)] rounded bg-muted px-2 py-1.5 text-left font-mono text-xs hover:bg-accent"
                      title="Click to copy"
                    >
                      {step.command}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4" />
              When it does not connect
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {WIFI_TROUBLESHOOTING.map((item) => (
              <div key={item.problem} className="space-y-1 text-sm">
                <div className="font-medium">{item.problem}</div>
                <div className="text-xs text-muted-foreground">
                  <Info className="mr-1 inline size-3" />
                  {item.cause}
                </div>
                <div className="text-xs">Fix: {item.fix}</div>
                <Separator className="mt-2" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
