export type Dither = "floyd-steinberg" | "atkinson" | "bayer" | "threshold"
export type Rotation = 0 | 90 | 180 | 270

export interface ImageSettings {
  width: number
  dither: Dither
  threshold: number
  brightness: number
  contrast: number
  gamma: number
  invert: boolean
  rotate: Rotation
}

export const ROTATIONS: Rotation[] = [0, 90, 180, 270]

/** Largest raster the firmware accepts (TP_BUF_SIZE in printer_protocol.h). */
export const MAX_RASTER_BYTES = 64000

/** Bytes a binarized raster will occupy, including the 8-byte GS v 0 header. */
export function rasterBytes(width: number, height: number): number {
  return 8 + Math.ceil(width / 8) * height
}

export const DITHER_LABELS: Record<Dither, string> = {
  "floyd-steinberg": "Floyd-Steinberg",
  atkinson: "Atkinson",
  bayer: "Bayer 8x8",
  threshold: "Threshold",
}

/**
 * Output size for an image rendered at `width`, after rotation.
 *
 * Rotating a quarter turn swaps which source dimension maps onto the printer's
 * width, so the height is derived from the swapped aspect ratio. In every case
 * the result preserves the source aspect ratio and fills `width`, except when
 * that would exceed the firmware's raster buffer — then the width is reduced
 * and the aspect ratio is kept, rather than letting the print fail with
 * ERR:FULL on the board.
 */
export function outputSize(
  srcW: number,
  srcH: number,
  width: number,
  rotate: Rotation,
): { width: number; height: number } {
  const maxW = Math.max(8, Math.min(384, Math.round(width)))
  const quarter = rotate === 90 || rotate === 270
  const ratio = quarter ? srcW / srcH : srcH / srcW

  let w = maxW
  let h = Math.max(1, Math.round(ratio * w))
  // Shrink to fit the buffer, keeping the exact aspect ratio.
  while (w > 8 && rasterBytes(w, h) > MAX_RASTER_BYTES) {
    w -= 1
    h = Math.max(1, Math.round(ratio * w))
  }
  return { width: w, height: h }
}

/** True when the requested width had to be reduced to fit the printer buffer. */
export function wasClamped(
  srcW: number,
  srcH: number,
  width: number,
  rotate: Rotation,
): boolean {
  const ideal = Math.max(8, Math.min(384, Math.round(width)))
  return outputSize(srcW, srcH, width, rotate).width < ideal
}

/** Maps an <img>/ImageBitmap to a grayscale matrix scaled to the target width. */
export function toGray(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  settings: ImageSettings,
): number[][] {
  const { width, height } = outputSize(srcW, srcH, settings.width, settings.rotate)

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) throw new Error("canvas 2d context unavailable")
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, width, height)

  // Draw unrotated at natural aspect, sized so that after rotation it fills the
  // canvas: a quarter turn swaps the draw dimensions.
  const quarter = settings.rotate === 90 || settings.rotate === 270
  const drawW = quarter ? height : width
  const drawH = quarter ? width : height
  ctx.save()
  ctx.translate(width / 2, height / 2)
  ctx.rotate((settings.rotate * Math.PI) / 180)
  ctx.drawImage(source, -drawW / 2, -drawH / 2, drawW, drawH)
  ctx.restore()

  const { data } = ctx.getImageData(0, 0, width, height)

  const rows: number[][] = []
  for (let y = 0; y < height; y++) {
    const row: number[] = []
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      let v = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255
      v = (v - 0.5) * settings.contrast + 0.5 + (settings.brightness - 1)
      v = Math.pow(Math.max(0, Math.min(1, v)), 1 / Math.max(0.01, settings.gamma))
      row.push(Math.max(0, Math.min(255, v * 255)))
    }
    rows.push(row)
  }
  return rows
}

const bayer8 = (() => {
  const m = [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21],
  ]
  return m.map((r) => r.map((v) => (v + 0.5) / 64))
})()

/** Binarizes a gray matrix; true means a printed (black) dot. */
export function binarize(rows: number[][], settings: ImageSettings): boolean[][] {
  const h = rows.length
  const w = rows[0]?.length ?? 0
  const out: boolean[][] = Array.from({ length: h }, () => new Array(w).fill(false))
  const t = settings.threshold

  if (settings.dither === "threshold") {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) out[y][x] = rows[y][x] < t
  } else if (settings.dither === "bayer") {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        out[y][x] = rows[y][x] / 255 < bayer8[y % 8][x % 8]
  } else if (settings.dither === "atkinson") {
    const buf = rows.map((r) => r.slice())
    const spread = (x: number, y: number, err: number) => {
      if (y >= 0 && y < h && x >= 0 && x < w) buf[y][x] += err
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const old = buf[y][x]
        const black = old < t
        out[y][x] = black
        const err = (old - (black ? 0 : 255)) / 8
        spread(x + 1, y, err)
        spread(x + 2, y, err)
        spread(x - 1, y + 1, err)
        spread(x, y + 1, err)
        spread(x + 1, y + 1, err)
        spread(x, y + 2, err)
      }
    }
  } else {
    const buf = rows.map((r) => r.slice())
    const spread = (x: number, y: number, err: number, f: number) => {
      if (y >= 0 && y < h && x >= 0 && x < w) buf[y][x] += err * f
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const old = buf[y][x]
        const black = old < t
        out[y][x] = black
        const err = old - (black ? 0 : 255)
        spread(x + 1, y, err, 7 / 16)
        spread(x - 1, y + 1, err, 3 / 16)
        spread(x, y + 1, err, 5 / 16)
        spread(x + 1, y + 1, err, 1 / 16)
      }
    }
  }

  if (settings.invert) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) out[y][x] = !out[y][x]
  }
  return out
}

/** GS v 0 raster: 8-byte header, then one bit per dot packed MSB first. */
export function raster(bits: boolean[][]): Uint8Array {
  const h = bits.length
  const w = bits[0]?.length ?? 0
  const rowBytes = Math.ceil(w / 8)
  const out = new Uint8Array(8 + rowBytes * h)
  out[0] = 0x1d
  out[1] = 0x76
  out[2] = 0x30
  out[3] = 0x00
  out[4] = rowBytes & 0xff
  out[5] = (rowBytes >> 8) & 0xff
  out[6] = h & 0xff
  out[7] = (h >> 8) & 0xff
  let o = 8
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x += 8) {
      let b = 0
      for (let i = 0; i < 8; i++) {
        const xx = x + i
        if (xx < w && bits[y][xx]) b |= 0x80 >> i
      }
      out[o++] = b
    }
  }
  return out
}

/**
 * Half-block preview strings, mirroring the TUI renderers.
 *
 * A monospace preview at 384 columns is much wider than its container, so this
 * downsamples to fit `maxCols` x `maxRows`.
 *
 * Half-block cells are not square: a character is `cellAspect` times wider than
 * a code line is tall. Sampling therefore uses different steps per axis, chosen
 * so the rendered preview has the same aspect ratio as the image. `cellAspect`
 * is measured from the DOM (`charWidth / lineHeight`) by the caller.
 */
export function previewRows(
  bits: boolean[][],
  maxCols = Infinity,
  maxRows = Infinity,
  cellAspect = 0.6,
): string[] {
  const h = bits.length
  const w = bits[0]?.length ?? 0
  if (h === 0 || w === 0) return []

  const colsBudget = Math.max(1, Math.min(w, maxCols))
  const rowsBudget = Math.max(1, Math.min(Math.ceil(h / 2), maxRows))

  // A character covers stepX dots across and 2*stepY dots down. Undistorted
  // rendering needs stepX / (2*stepY) = cellAspect, i.e. stepX = 2*cellAspect*stepY.
  // Pick the smallest step that satisfies both budgets.
  const stepY = Math.max(
    0.5,
    h / (2 * rowsBudget),
    w / (2 * Math.max(0.05, cellAspect) * colsBudget),
  )
  const stepX = 2 * cellAspect * stepY

  const outCols = Math.max(1, Math.floor(w / stepX))
  const outRows = Math.max(1, Math.floor(h / (2 * stepY)))

  const out: string[] = []
  for (let ry = 0; ry < outRows; ry++) {
    const yTop = Math.min(h - 1, Math.floor(ry * 2 * stepY))
    const yBottom = Math.min(h - 1, Math.floor(ry * 2 * stepY + stepY))
    let line = ""
    for (let rx = 0; rx < outCols; rx++) {
      const x = Math.min(w - 1, Math.floor(rx * stepX))
      const t = bits[yTop]?.[x] ?? false
      const b = bits[yBottom]?.[x] ?? false
      line += t && b ? "█" : t ? "▀" : b ? "▄" : " "
    }
    out.push(line)
  }
  return out
}
