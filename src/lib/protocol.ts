import { TransportError, type Transport } from "./transport"

export const PRINT_WIDTH = 384
export const CHUNK_BYTES = 900

export const BARCODE_TYPES = {
  "UPC-A": 0,
  "UPC-E": 1,
  EAN13: 2,
  EAN8: 3,
  CODE39: 4,
  ITF: 5,
  CODABAR: 6,
  CODE93: 7,
  CODE128: 8,
} as const

export type BarcodeKind = keyof typeof BARCODE_TYPES

export class ProtocolError extends TransportError {}

const hex = (bytes: Uint8Array | number[]) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")

/** Client for the firmware line protocol over any transport. */
export class PrinterClient {
  readonly transport: Transport

  constructor(transport: Transport) {
    this.transport = transport
  }

  get name() {
    return this.transport.label
  }

  command(cmd: string, timeoutMs = 8000): Promise<string> {
    return this.transport.command(cmd, timeoutMs)
  }

  dispose() {
    return this.transport.close()
  }

  async connect(): Promise<void> {
    const reply = await this.command("PING", 3000)
    if (reply !== "PONG") throw new ProtocolError(`unexpected reply: ${reply}`)
  }
  init() {
    return this.command("INIT", 5000)
  }

  setDensity(value: number) {
    return this.command(`DENSITY:${Math.max(0, Math.min(255, Math.round(value)))}`, 5000)
  }

  getDensity() {
    return this.command("DENSITY", 5000)
  }

  status() {
    return this.command("STATUS", 5000)
  }

  async raw(bytes: Uint8Array | number[]) {
    if (bytes.length === 0) return
    await this.command(`RAW:${hex(bytes)}`, 8000)
  }

  text(line: string) {
    return this.command(`TEXT:${line}`, 8000)
  }

  async printText(
    lines: string[],
    opts: {
      align?: number
      double?: boolean
      bold?: boolean
      underline?: boolean
      invert?: boolean
    } = {},
  ) {
    await this.raw(
      styleBytes(opts.align, opts.double, opts.bold, opts.underline, opts.invert),
    )
    for (const line of lines) await this.text(line)
    await this.raw(styleBytes())
  }

  async feedDots(dots: number) {
    let remaining = Math.max(0, Math.floor(dots))
    while (remaining > 0) {
      const n = Math.min(remaining, 255)
      await this.raw([0x1b, 0x4a, n])
      remaining -= n
    }
  }

  async feedLines(lines: number) {
    let remaining = Math.max(0, Math.floor(lines))
    while (remaining > 0) {
      const n = Math.min(remaining, 255)
      await this.raw([0x1b, 0x64, n])
      remaining -= n
    }
  }

  async qr(data: string, module = 6, ec = 1) {
    const m = Math.max(1, Math.min(16, Math.round(module)))
    const payload = new TextEncoder().encode(data)
    const out: number[] = [
      0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00,
      0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, m,
      0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30 + Math.max(0, Math.min(3, ec)),
    ]
    const n = payload.length + 3
    out.push(0x1d, 0x28, 0x6b, n & 0xff, (n >> 8) & 0xff, 0x31, 0x50, 0x30)
    out.push(...payload)
    out.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30)
    await this.raw(out)
  }

  async barcode(kind: BarcodeKind, data: string, height = 80, width = 2, hri = 2) {
    const out: number[] = [
      0x1d, 0x68, Math.max(1, Math.min(255, height)),
      0x1d, 0x77, Math.max(2, Math.min(6, width)),
      0x1d, 0x48, Math.max(0, Math.min(3, hri)),
      0x1d, 0x6b, BARCODE_TYPES[kind],
    ]
    for (const ch of data) out.push(ch.charCodeAt(0) & 0x7f)
    out.push(0x00)
    await this.raw(out)
  }

  /** Streams an image raster in acknowledged chunks, then waits for the print. */
  async printRaster(
    raster: Uint8Array,
    onProgress?: (done: number, total: number) => void,
  ) {
    const total = raster.length
    let seq = 0
    for (let off = 0; off < total; off += CHUNK_BYTES) {
      const chunk = raster.subarray(off, Math.min(off + CHUNK_BYTES, total))
      const line = `IMG:${seq}:${hex(chunk)}`
      let acked = false
      for (let attempt = 0; attempt < 6 && !acked; attempt++) {
        try {
          const reply = await this.command(line, 10000)
          acked = reply === `ACK:${seq}`
        } catch {
          // retry the same sequence number; the board re-ACKs duplicates
        }
      }
      if (!acked) throw new ProtocolError(`chunk ${seq} was not acknowledged`)
      seq++
      onProgress?.(Math.min(off + chunk.length, total), total)
    }
    const timeout = 60_000 + (total / 800) * 1000
    const reply = await this.command(`IMGDONE:${total}`, timeout)
    if (reply !== "OK") throw new ProtocolError(reply)
  }
}


export function styleBytes(
  align = 0,
  double = false,
  bold = false,
  underline = false,
  invert = false,
): Uint8Array {
  return new Uint8Array([
    0x1b, 0x61, align & 0xff,
    0x1d, 0x21, double ? 0x11 : 0x00,
    0x1b, 0x45, bold ? 1 : 0,
    0x1b, 0x2d, underline ? 1 : 0,
    0x1d, 0x42, invert ? 1 : 0,
  ])
}
