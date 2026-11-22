# thermal printer web app

Browser front end for the DP thermal printer on the XIAO ESP32-C6, built with
React, Vite, Tailwind v4 and shadcn/ui. It speaks the same line protocol as the
firmware in `../sketch`.

## Run

```sh
cd web
npm install
npm run dev        # app at http://localhost:5173
```

That is enough for USB printing. `npm run bridge` is only needed for the WiFi
path (see below).

## Connecting

Three transports, all from the browser:

**USB (recommended).** Web Serial — the browser opens the board directly. No
bridge, no firmware change; works with the `printer_serial` firmware already
flashed. Chrome/Edge desktop, page served from `localhost` or `https`.

**Bluetooth LE.** Web Bluetooth against the Nordic UART Service. Needs the
`printer_ble` firmware flashed. Chrome/Edge desktop only. Commands are split
into 180-byte writes and replies are reassembled from notifications, so long
`IMG:` lines work. Images are slow (~one round trip per 900-byte chunk); text,
QR and barcodes are fine.

**WiFi.** Needs the `printer_wifi` firmware flashed and the bridge running:

```sh
npm run bridge     # local relay to TCP 9100, 127.0.0.1:8787
npm run dev        # proxies /api to the bridge
```

The bridge keeps one persistent TCP connection per address, which image jobs
require since `IMG:<seq>` chunks accumulate until `IMGDONE`.

## Tabs

- **Connect** — USB, Bluetooth or WiFi, status and re-init.
- **WiFi setup** — the XIAO does not discover networks; credentials are compiled
  in. This tab writes `wifi_config.h` (with optional static IP) and lists the
  flash commands.
- **Text / Image / Code / Feed & density** — the printing features.
- **Log** — job history with errors.

## Image pipeline

Images are decoded with `createImageBitmap`, scaled to 384 px, adjusted and
dithered in a canvas, then packed as a `GS v 0` raster. Given the same gray
matrix, `threshold`, Floyd-Steinberg and Atkinson produce byte-identical output
to the original Go renderer.

## Layout

```
bridge/server.mjs         HTTP -> TCP relay, WiFi path only
src/lib/transport.ts      Web Serial and bridge transports
src/lib/bluetooth.ts      Web Bluetooth transport (Nordic UART Service)
src/lib/protocol.ts       line protocol client
src/lib/image.ts          grayscale, dithering, raster packing, preview
src/lib/wifi.ts           wifi_config.h generation, flash steps, troubleshooting
src/hooks/use-printer.ts  connection and job state
src/components/panels/    one component per tab
src/components/ui/        shadcn components
```
