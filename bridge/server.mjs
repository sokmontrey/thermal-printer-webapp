// Bridge between the browser app and the printer's TCP line protocol.
//
// Browsers cannot open raw TCP sockets, so this tiny server keeps one
// persistent connection per target and relays newline-terminated commands.
// Connections must persist because IMG:<seq> chunks accumulate on the board
// until IMGDONE arrives.
//
//   npm run bridge        (defaults to 127.0.0.1:8787)
//   BRIDGE_PORT=9000 npm run bridge

import http from "node:http"
import net from "node:net"

const PORT = Number(process.env.BRIDGE_PORT || 8787)
const HOST = process.env.BRIDGE_HOST || "127.0.0.1"
const DEFAULT_TIMEOUT = 8000

const DEFAULT_TARGETS = [
  "thermalprint.local:9100",
  "192.168.4.1:9100",
]

// target -> { socket, reader, pending, connected }
const links = new Map()

function parseTarget(target) {
  const cleaned = target.replace(/^tcp:\/\//, "")
  const idx = cleaned.lastIndexOf(":")
  if (idx <= 0) throw new Error("target must be host:port")
  return { host: cleaned.slice(0, idx), port: Number(cleaned.slice(idx + 1)) }
}

function getLink(target) {
  const existing = links.get(target)
  if (existing && !existing.socket.destroyed) return existing
  const { host, port } = parseTarget(target)
  const socket = net.createConnection({ host, port })
  socket.setNoDelay(true)
  const link = { socket, buffer: "", pending: null, queue: [], ready: false }
  links.set(target, link)

  socket.on("data", (chunk) => {
    link.buffer += chunk.toString("binary")
    let idx
    while ((idx = link.buffer.indexOf("\n")) >= 0) {
      const line = link.buffer.slice(0, idx).replace(/\r$/, "").trim()
      link.buffer = link.buffer.slice(idx + 1)
      if (!line || line === "READY") continue
      const waiter = link.pending ?? link.queue.shift()
      if (waiter) {
        link.pending = null
        waiter.resolve(line)
      }
    }
  })

  socket.on("error", (err) => {
    const waiter = link.pending ?? link.queue.shift()
    if (waiter) waiter.reject(err)
    link.pending = null
    links.delete(target)
  })

  socket.on("close", () => {
    links.delete(target)
  })

  return link
}

function waitForLine(link, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false
    const entry = {
      resolve: (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      },
      reject: (err) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(err)
      },
    }
    const timer = setTimeout(() => {
      if (link.pending === entry) link.pending = null
      entry.reject(new Error("timed out waiting for printer"))
    }, timeoutMs)
    link.pending = entry
  })
}

async function sendCommand(target, command, timeoutMs) {
  const link = getLink(target)
  if (!link.ready) {
    await new Promise((resolve, reject) => {
      const onReady = () => {
        link.ready = true
        link.socket.off("error", onError)
        resolve()
      }
      const onError = (err) => {
        link.socket.off("connect", onReady)
        reject(err)
      }
      link.socket.once("connect", onReady)
      link.socket.once("error", onError)
    })
  }
  const waiting = waitForLine(link, timeoutMs)
  link.socket.write(command + "\n")
  const reply = await waiting
  if (reply.startsWith("ERR")) throw new Error(reply)
  return reply
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ""
    req.on("data", (c) => {
      raw += c
      if (raw.length > 4_000_000) {
        reject(new Error("request too large"))
        req.destroy()
      }
    })
    req.on("end", () => resolve(raw))
    req.on("error", reject)
  })
}

function json(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  })
  res.end(body)
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    json(res, 204, {})
    return
  }

  const url = new URL(req.url, `http://${req.headers.host}`)

  try {
    if (url.pathname === "/api/targets") {
      json(res, 200, { targets: DEFAULT_TARGETS, port: PORT })
      return
    }

    if (url.pathname === "/api/command" && req.method === "POST") {
      const body = JSON.parse(await readBody(req) || "{}")
      const { target, command, timeoutMs } = body
      if (!target || typeof command !== "string") {
        json(res, 400, { error: "target and command are required" })
        return
      }
      if (command.length > 9000) {
        json(res, 413, { error: "command too long" })
        return
      }
      const reply = await sendCommand(
        target,
        command,
        Number(timeoutMs) || DEFAULT_TIMEOUT,
      )
      json(res, 200, { reply })
      return
    }

    if (url.pathname === "/api/dispose" && req.method === "POST") {
      const body = JSON.parse(await readBody(req) || "{}")
      const link = links.get(body.target)
      if (link) {
        link.socket.destroy()
        links.delete(body.target)
      }
      json(res, 200, { ok: true })
      return
    }

    json(res, 404, { error: "not found" })
  } catch (err) {
    json(res, 502, { error: String(err?.message || err) })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`printer bridge listening on http://${HOST}:${PORT}`)
})
