import { useState } from "react"
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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { PrinterClient } from "@/lib/protocol"

interface Props {
  disabled: boolean
  run: (label: string, fn: (c: PrinterClient) => Promise<void>) => Promise<void>
}

export function TextPanel({ disabled, run }: Props) {
  const [body, setBody] = useState("Hello from the browser")
  const [align, setAlign] = useState("0")
  const [double, setDouble] = useState(false)
  const [bold, setBold] = useState(false)
  const [underline, setUnderline] = useState(false)
  const [invert, setInvert] = useState(false)
  const [feed, setFeed] = useState("2")

  const print = () =>
    run("print text", async (c) => {
      const lines = body.split("\n")
      await c.printText(lines, {
        align: Number(align),
        double,
        bold,
        underline,
        invert,
      })
      await c.feedLines(Number(feed) || 0)
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Text</CardTitle>
        <CardDescription>
          Plain text, printed with the selected styling and a trailing feed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="min-h-40 font-mono"
          placeholder="Type the text to print..."
        />
        <div className="flex flex-wrap items-center gap-4">
          {[
            ["Bold", bold, setBold],
            ["Underline", underline, setUnderline],
            ["Double", double, setDouble],
            ["Invert", invert, setInvert],
          ].map(([label, value, setter]) => (
            <div key={label as string} className="flex items-center gap-2">
              <Switch
                id={`text-${label}`}
                checked={value as boolean}
                onCheckedChange={setter as (v: boolean) => void}
              />
              <Label htmlFor={`text-${label}`}>{label as string}</Label>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Align</Label>
            <Select value={align} onValueChange={setAlign}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Left</SelectItem>
                <SelectItem value="1">Center</SelectItem>
                <SelectItem value="2">Right</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="feed">Feed lines</Label>
            <Input
              id="feed"
              type="number"
              min={0}
              max={255}
              value={feed}
              onChange={(e) => setFeed(e.target.value)}
              className="w-28"
            />
          </div>
          <Button disabled={disabled} onClick={() => void print()}>
            Print text
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
