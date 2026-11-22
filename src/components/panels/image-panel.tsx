import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { ImagePlus, RotateCcw, RotateCw, Upload } from "lucide-react"
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
  outputSize,
  previewRows,
  raster,
  toGray,
  wasClamped,
  type Dither,
  type ImageSettings,
  type Rotation,
} from "@/lib/image"
import type { PrinterClient } from "@/lib/protocol"

interface Props {
  disabled: boolean
  run: (label: string, fn: (c: PrinterClient) => Promise<void>) => Promise<void>
  onProgress: (p: { done: number; total: number } | null) => void
  busy: boolean
}

// Preview font size. Cell aspect (char width / line height) is measured from the
// rendered pre element, since it depends on the font actually in use.
const PREVIEW_FONT_PX = 6

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
    rotate: 0,
  })
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [cell, setCell] = useState({ w: 3.6, h: 6.3 })
  const bitmapRef = useRef<ImageBitmap | null>(null)
  const preRef = useRef<HTMLPreElement | null>(null)

  const load = async (next: File) => {
    const bitmap = await createImageBitmap(next)
    bitmapRef.current?.close()
    bitmapRef.current = bitmap
    setFile(next)
    setSize({ w: bitmap.width, h: bitmap.height })
  }

  // Measure the preview box and the real character cell so the preview is
  // generated to fit, with correct proportions, rather than clipped by CSS.
  useLayoutEffect(() => {
    const el = preRef.current
    if (!el) return
    const measure = () => {
      setBox({ w: el.clientWidth, h: el.clientHeight })
      const style = getComputedStyle(el)
      const probe = document.createElement("span")
      probe.textContent = "0".repeat(50)
      probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${style.font}`
      document.body.appendChild(probe)
      const charW = probe.getBoundingClientRect().width / 50
      probe.remove()
      const lineH = parseFloat(style.lineHeight) || PREVIEW_FONT_PX * 1.2
      if (charW > 0) setCell({ w: charW, h: lineH })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const render = useCallback(() => {
    const bitmap = bitmapRef.current
    // `file` is read so a newly loaded image re-renders immediately; the bitmap
    // itself lives in a ref and would otherwise not trigger this callback.
    if (!bitmap || !file) {
      setPreview("")
      return
    }
    try {
      const bits = binarize(toGray(bitmap, bitmap.width, bitmap.height, settings), settings)
      // Account for padding (p-2 = 8px each side) before budgeting cells.
      const usableW = Math.max(0, box.w - 16)
      const usableH = Math.max(0, box.h - 16)
      const maxCols = Math.floor(usableW / cell.w) || 80
      const maxRows = Math.floor(usableH / cell.h) || 40
      setPreview(previewRows(bits, maxCols, maxRows, cell.w / cell.h).join("\n"))
    } catch (err) {
      setPreview(`preview error: ${err instanceof Error ? err.message : err}`)
    }
  }, [settings, file, box.w, box.h, cell.w, cell.h])

  useEffect(() => {
    render()
  }, [render])

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

  const turn = (delta: number) =>
    patch(
      "rotate",
      (((settings.rotate + delta + 360) % 360) as Rotation),
    )

  const rendered = size
    ? outputSize(size.w, size.h, settings.width, settings.rotate)
    : null
  const clamped = size
    ? wasClamped(size.w, size.h, settings.width, settings.rotate)
    : false

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
              className="flex h-12 cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 text-sm hover:bg-accent"
            >
              <Upload className="size-4 shrink-0" />
              <span className="truncate">{file ? file.name : "Choose an image"}</span>
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

          <div className="flex items-center justify-between gap-2">
            <div>
              <Label>Rotate</Label>
              <p className="text-xs text-muted-foreground">
                {settings.rotate}° · aspect ratio kept
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="outline"
                className="size-11 sm:size-9"
                aria-label="Rotate left 90 degrees"
                title="Rotate left 90°"
                onClick={() => turn(-90)}
              >
                <RotateCcw className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="size-11 sm:size-9"
                aria-label="Rotate right 90 degrees"
                title="Rotate right 90°"
                onClick={() => turn(90)}
              >
                <RotateCw className="size-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="img-invert"
              checked={settings.invert}
              onCheckedChange={(v) => patch("invert", v)}
            />
            <Label htmlFor="img-invert">Invert</Label>
          </div>

          <Button
            className="h-11 w-full sm:h-9"
            disabled={disabled || !file}
            onClick={() => void print()}
          >
            <ImagePlus className="size-4" />
            {busy ? "Printing" : "Print image"}
          </Button>
          {size && rendered && (
            <p className="text-xs text-muted-foreground">
              Source {size.w}x{size.h} px → {rendered.width}x{rendered.height} px
              {settings.rotate ? `, rotated ${settings.rotate}°` : ""}
            </p>
          )}
          {clamped && rendered && (
            <p className="text-xs text-amber-500">
              Narrowed to {rendered.width}px so the raster fits the printer's 64 kB
              buffer. Aspect ratio kept.
            </p>
          )}
        </div>

        <div className="flex min-w-0 flex-col">
          <div className="mb-2 text-xs text-muted-foreground">Preview</div>
          <pre
            ref={preRef}
            className="min-h-40 flex-1 overflow-hidden whitespace-pre rounded-md border bg-muted p-2 font-mono leading-[1.05] tracking-tighter"
            style={{ fontSize: `${PREVIEW_FONT_PX}px` }}
          >
            {preview || "Load an image to preview"}
          </pre>
        </div>
      </CardContent>
    </Card>
  )
}
