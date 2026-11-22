import { useEffect, useRef, useState } from "react"
import { ImagePlus, Upload } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DITHER_LABELS,
  binarize,
  previewRows,
  raster,
  toGray,
  type Dither,
  type ImageSettings,
} from "@/lib/image"
import type { PrinterClient } from "@/lib/protocol"

interface Props {
  disabled: boolean
  run: (label: string, fn: (c: PrinterClient) => Promise<void>) => Promise<void>
  onProgress: (p: { done: number; total: number } | null) => void
  busy: boolean
}

export function ImagePanel({ disabled, run, onProgress, busy }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string>("")
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [settings, setSettings] = useState<ImageSettings>({
    width: 384,
    dither: "floyd-steinberg",
    threshold: 128,
    brightness: 1,
    contrast: 1,
    gamma: 1,
    invert: false,
  })
  const bitmapRef = useRef<ImageBitmap | null>(null)

  const load = async (next: File) => {
    const bitmap = await createImageBitmap(next)
    bitmapRef.current?.close()
    bitmapRef.current = bitmap
    setFile(next)
    setSize({ w: bitmap.width, h: bitmap.height })
  }

  useEffect(() => {
    const bitmap = bitmapRef.current
    if (!bitmap) {
      setPreview("")
      return
    }
    try {
      const bits = binarize(toGray(bitmap, bitmap.width, bitmap.height, settings), settings)
      setPreview(previewRows(bits).join("\n"))
    } catch (err) {
      setPreview(`preview error: ${err instanceof Error ? err.message : err}`)
    }
  }, [settings, file])

  const print = () =>
    run("print image", async (c) => {
      const bitmap = bitmapRef.current
      if (!bitmap) throw new Error("no image loaded")
      const bits = binarize(toGray(bitmap, bitmap.width, bitmap.height, settings), settings)
      const data = raster(bits)
      onProgress({ done: 0, total: data.length })
      await c.printRaster(data, (done, total) => onProgress({ done, total }))
    })

  const patch = <K extends keyof ImageSettings>(key: K, value: ImageSettings[K]) =>
    setSettings((prev) => ({ ...prev, [key]: value }))

  const numbers: Array<[keyof ImageSettings, string, number, number]> = [
    ["width", "Width", 8, 384],
    ["threshold", "Threshold", 0, 255],
    ["brightness", "Brightness", 0.1, 3],
    ["contrast", "Contrast", 0.1, 3],
    ["gamma", "Gamma", 0.1, 3],
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Image</CardTitle>
        <CardDescription>
          Decoded in the browser, dithered here, then streamed as a raster. The
          same pipeline as the TUI clients.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="image-file">Image file</Label>
            <label
              htmlFor="image-file"
              className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm hover:bg-accent"
            >
              <Upload className="size-4" />
              {file ? file.name : "Choose an image"}
            </label>
            <input
              id="image-file"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const next = e.target.files?.[0]
                if (next) void load(next)
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Dither</Label>
            <Select
              value={settings.dither}
              onValueChange={(v) => patch("dither", v as Dither)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DITHER_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {numbers.map(([key, label, min, max]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`img-${key}`}>{label}</Label>
                <Input
                  id={`img-${key}`}
                  type="number"
                  min={min}
                  max={max}
                  step={key === "width" || key === "threshold" ? 1 : 0.05}
                  value={settings[key] as number}
                  onChange={(e) => patch(key, Number(e.target.value) as never)}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="img-invert"
              checked={settings.invert}
              onCheckedChange={(v) => patch("invert", v)}
            />
            <Label htmlFor="img-invert">Invert</Label>
          </div>

          <Button className="w-full" disabled={disabled || !file} onClick={() => void print()}>
            <ImagePlus className="size-4" />
            {busy ? "Printing" : "Print image"}
          </Button>
          {size && (
            <p className="text-xs text-muted-foreground">
              Source {size.w}x{size.h} px, rendered at {settings.width} px wide.
            </p>
          )}
        </div>

        <div className="min-w-0">
          <div className="mb-2 text-xs text-muted-foreground">Preview</div>
          <pre className="max-h-[28rem] overflow-auto rounded-md border bg-muted p-3 text-[6px] leading-[1.05] tracking-tighter">
            {preview || "Load an image to preview"}
          </pre>
        </div>
      </CardContent>
    </Card>
  )
}
