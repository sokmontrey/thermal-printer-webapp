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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BARCODE_TYPES, type BarcodeKind, type PrinterClient } from "@/lib/protocol"

interface Props {
  disabled: boolean
  run: (label: string, fn: (c: PrinterClient) => Promise<void>) => Promise<void>
}

export function CodePanel({ disabled, run }: Props) {
  const [data, setData] = useState("https://example.com")
  const [kind, setKind] = useState<string>("QR")
  const [size, setSize] = useState("6")

  const print = () =>
    run(`print ${kind}`, async (c) => {
      const n = Number(size) || 6
      if (kind === "QR") await c.qr(data, n)
      else await c.barcode(kind as BarcodeKind, data, 80, Math.max(2, Math.min(6, n)))
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Code</CardTitle>
        <CardDescription>
          QR plus nine 1-D symbologies. Barcodes are ASCII only.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1 space-y-1.5">
          <Label htmlFor="code-data">Content</Label>
          <Input id="code-data" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="QR">QR</SelectItem>
              {Object.keys(BARCODE_TYPES).map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="code-size">Size</Label>
          <Input
            id="code-size"
            type="number"
            min={1}
            max={16}
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="w-24"
          />
        </div>
        <Button disabled={disabled || !data} onClick={() => void print()}>
          Print code
        </Button>
      </CardContent>
    </Card>
  )
}
