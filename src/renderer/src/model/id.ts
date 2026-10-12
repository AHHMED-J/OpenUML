/**
 * Element ID generation.
 *
 * IDs are opaque strings; only uniqueness matters. For consistency with files written by other
 * tools we produce the common shape: base64 of 14 bytes = 2 zero bytes, 8-byte big-endian
 * millisecond timestamp, 2-byte process-wide counter, 2 random bytes (20 characters, ending in `=`).
 */

function randomUint16(): number {
  const buf = new Uint16Array(1)
  globalThis.crypto.getRandomValues(buf)
  return buf[0] ?? 0
}

let counter = randomUint16()

export function generateId(now: number = Date.now()): string {
  const bytes = new Uint8Array(14)
  let t = Math.max(0, Math.floor(now))
  for (let i = 9; i >= 2; i--) {
    bytes[i] = t % 256
    t = Math.floor(t / 256)
  }
  counter = (counter + 1) & 0xffff
  bytes[10] = counter >> 8
  bytes[11] = counter & 0xff
  const rnd = randomUint16()
  bytes[12] = rnd >> 8
  bytes[13] = rnd & 0xff
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}
