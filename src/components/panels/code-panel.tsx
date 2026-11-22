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
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="code-data">Content</Label>
          <Input
            id="code-data"
            value={data}
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="h-11 sm:h-9"
            onChange={(e) => setData(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="h-11 w-full sm:h-9">
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
              inputMode="numeric"
              min={1}
              max={16}
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="h-11 sm:h-9"
            />
          </div>
        </div>
        <Button
          className="h-11 w-full sm:h-9"
          disabled={disabled || !data}
          onClick={() => void print()}
        >
          Print code
        </Button>
      </CardContent>
    </Card>
  )
}
