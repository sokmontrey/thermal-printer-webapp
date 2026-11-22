// What this device/browser can actually do. Transports are not
// interchangeable across platforms, so the UI gates on these:
//
//   Web Serial    - desktop Chromium only. Never on iOS or Android.
//   Web Bluetooth - Android Chrome yes; iOS Safari no (needs Bluefy);
//                   Firefox never.
//   Bridge/WiFi   - works anywhere the bridge is reachable, including a
//                   phone, but the bridge must be able to reach the printer.

export function hasSerial(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator
}

export function hasBluetooth(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator
}

export function isSecure(): boolean {
  return typeof window !== "undefined" && window.isSecureContext
}

export function userAgent(): string {
  return typeof navigator === "undefined" ? "" : navigator.userAgent
}

export function isIOS(): boolean {
  const ua = userAgent()
  if (/iPad|iPhone|iPod/.test(ua)) return true
  // iPadOS 13+ reports as Macintosh but has a touch screen.
  return /Macintosh/.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1
}

export function isAndroid(): boolean {
  return /Android/i.test(userAgent())
}

/** Coarse touch/mobile check used for layout and default transport. */
export function isMobile(): boolean {
  if (typeof window === "undefined") return false
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false
  return coarse && window.innerWidth < 1024
}

export interface Capabilities {
  serial: boolean
  bluetooth: boolean
  secure: boolean
  mobile: boolean
  ios: boolean
  android: boolean
}

export function capabilities(): Capabilities {
  return {
    serial: hasSerial(),
    bluetooth: hasBluetooth(),
    secure: isSecure(),
    mobile: isMobile(),
    ios: isIOS(),
    android: isAndroid(),
  }
}

/** Explains why a transport is unavailable, or null when it should work. */
export function unavailableReason(kind: "serial" | "bluetooth"): string | null {
  const caps = capabilities()
  if (kind === "serial") {
    if (caps.serial) return null
    if (caps.mobile) return "USB printing needs a desktop browser. On a phone, use Bluetooth or WiFi."
    return "This browser has no Web Serial support. Use Chrome or Edge on desktop."
  }
  if (caps.bluetooth) return null
  if (caps.ios) {
    return "Safari on iOS has no Web Bluetooth. Use the Bluefy browser, or connect over WiFi."
  }
  if (caps.mobile) {
    return "This browser has no Web Bluetooth. Use Chrome on Android, or connect over WiFi."
  }
  return "This browser has no Web Bluetooth. Use Chrome or Edge, or connect over WiFi."
}

/**
 * Web Bluetooth only works in a secure context. A deployed site served over
 * plain http will have the API but fail at requestDevice().
 */
export function bluetoothBlockedByOrigin(): boolean {
  return hasBluetooth() && !isSecure()
}
