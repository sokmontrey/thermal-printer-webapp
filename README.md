# thermal printer web app

Browser front end for the DP thermal printer on the XIAO ESP32-C6, built with
React, Vite, Tailwind v4 and shadcn/ui. Works on desktop and mobile. It speaks
the same line protocol as the firmware in `../sketch`.

## Run (development)

```sh
cd web
npm install
npm run dev        # app at http://localhost:5173
```

USB and Bluetooth need no extra process. WiFi needs the bridge:

```sh
npm run bridge     # relay to TCP 9100 on 127.0.0.1:8787
```

## Deploy

Build, then run the bridge as the app server. One process serves the SPA and
the TCP relay, and binds to all interfaces so phones on the same network can
reach it:

```sh
npm run build
npm start          # http://<this-machine>:8787
```

Environment:

| Variable | Purpose |
| --- | --- |
| `BRIDGE_HOST` | bind address, `0.0.0.0` for LAN (default `127.0.0.1`) |
| `BRIDGE_PORT` | port (default `8787`) |
| `PRINTER_TARGET` | pin the printer, e.g. `192.168.1.60:9100` |
| `BRIDGE_STATIC=1` | serve `dist/` too (set by `npm start`) |
| `VITE_BRIDGE_URL` | build-time: point the app at a bridge on another host |

For a public deployment, terminate TLS in front of it (Caddy, nginx, a tunnel).
Both Web Serial and Web Bluetooth require a secure context, so **https is
mandatory** except on `localhost`.

## Platform support

Transports are gated by what the device can actually do:

| | USB (Web Serial) | Bluetooth (Web Bluetooth) | WiFi (bridge) |
| --- | --- | --- | --- |
| Desktop Chrome/Edge | yes | yes | yes |
| Desktop Firefox/Safari | no | no | yes |
| Android Chrome | no | yes | yes |
| iOS Safari | no | no | yes |
| iOS Bluefy | no | yes | yes |

USB is impossible on any mobile browser — there is no Web Serial there. iOS
Safari has no Web Bluetooth either, so on iPhone the WiFi/bridge path is the
only option. If Helium (ungoogled chromium) is the browser, Web Bluetooth is
off by default; add `--enable-features=WebBluetooth` to
`~/.config/helium-browser-flags.conf` and relaunch.

Mobile UI notes: the tab rail becomes a bottom bar under 640px, controls are
44px tall for touch, inputs use 16px text so iOS does not zoom on focus, and
the layout respects `env(safe-area-inset-*)`.

## Tabs

- **Connect** — USB, Bluetooth or WiFi, with unavailable transports disabled and
  an explanation. Mobile defaults to Bluetooth.
- **WiFi setup** — the XIAO does not discover networks; credentials are compiled
  in. Writes `wifi_config.h` (with optional static IP) and lists flash commands.
- **Text / Image / Code / Feed & density** — the printing features.
- **Log** — job history with errors.

## Image pipeline

Images are decoded with `createImageBitmap`, scaled to 384 px, adjusted and
dithered in a canvas, then packed as a `GS v 0` raster. Given the same gray
matrix, `threshold`, Floyd-Steinberg and Atkinson produce byte-identical output
to the original Go renderer.

## Layout

```
bridge/server.mjs         TCP relay + static server for deployment
src/lib/platform.ts       capability detection and gating messages
src/lib/transport.ts      Web Serial and bridge transports
src/lib/bluetooth.ts      Web Bluetooth transport (Nordic UART Service)
src/lib/protocol.ts       line protocol client
src/lib/image.ts          grayscale, dithering, raster packing, preview
src/lib/wifi.ts           wifi_config.h generation, flash steps, troubleshooting
src/hooks/use-printer.ts  connection and job state
src/components/panels/    one component per tab
src/components/ui/        shadcn components
```
