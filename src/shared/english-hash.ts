// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HASH A CHINESE HALF NAMES AS ITS SOURCE: WHICH ENGLISH IT WAS WRITTEN FROM.
 *
 * The office's own languages (Chinese and English now) change together, and an out-of-date translation
 * never passes for the current one. So each Chinese half of a chapter,
 * of a chapter's rule and of a regulation carries `from`, the hash of the English it translates. The
 * record door refuses a write that leaves a `from` that is not the hash of the English after the
 * write, and the page draws a Chinese half only while its `from` still matches.
 *
 * THIS IS THE ONE DEFINITION OF THAT HASH. The server's refusal, the page's reading and the command a
 * person runs to compute a `from` all call `englishHash`, so the three cannot come to disagree.
 *
 * The definition, in full:
 *   1. The English parts, in a fixed order, as an array of strings:
 *        - a rule (one summary block of a chapter): [heading, text];
 *        - a chapter record: [title, summary, label], the label being data.shortForms.label.text;
 *        - a regulation record: [title].
 *      A heading, a summary or a label the record does not hold is the empty string.
 *   2. JSON.stringify of that array, with no spaces, encoded as UTF-8.
 *   3. SHA-256 of those bytes, written in lower-case hex, and the first 16 characters of it.
 *
 * To print the hash of an English from a checkout (the parts in the order above, one argument each):
 *   node --import tsx -e "import('./src/shared/english-hash.ts').then((m) => console.log(m.englishHash(process.argv.slice(1))))" "<heading>" "<text>"
 *
 * WRITTEN HERE IN PLAIN TYPESCRIPT, WITH NO node:crypto, because src/shared is imported by the server,
 * the tools and the browser alike, and nothing in it touches node. The test
 * tests/the-regulations-in-both-languages.test.ts checks it against node:crypto's SHA-256.
 */

/** How many hex characters of the SHA-256 a `from` keeps. */
export const ENGLISH_HASH_LENGTH = 16

/** The hash of one English, as a Chinese half's `from` names it. See the definition above. */
export function englishHash(parts: readonly string[]): string {
  return sha256Hex(new TextEncoder().encode(JSON.stringify(parts))).slice(0, ENGLISH_HASH_LENGTH)
}

/** The 64 round constants of SHA-256 (FIPS 180-4, section 4.2.2). */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

/** SHA-256 of some bytes, as lower-case hex (FIPS 180-4). */
function sha256Hex(bytes: Uint8Array): string {
  // The message, padded: a 1 bit, zeros, then the length in bits as 64 bits, to a multiple of 64 bytes.
  const blocks = Math.ceil((bytes.length + 9) / 64)
  const padded = new Uint8Array(blocks * 64)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  const bits = bytes.length * 8
  view.setUint32(padded.length - 8, Math.floor(bits / 0x100000000))
  view.setUint32(padded.length - 4, bits >>> 0)

  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const w = new Uint32Array(64)
  const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n))
  for (let block = 0; block < blocks; block++) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block * 64 + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3)
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10)
      w[i] = w[i - 16]! + s0 + w[i - 7]! + s1
    }
    let [a, b, c, d, e, f, g, hh] = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!]
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i]! + w[i]!) >>> 0
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
      hh = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    h[0] = h[0]! + a
    h[1] = h[1]! + b
    h[2] = h[2]! + c
    h[3] = h[3]! + d
    h[4] = h[4]! + e
    h[5] = h[5]! + f
    h[6] = h[6]! + g
    h[7] = h[7]! + hh
  }
  return [...h].map((word) => word.toString(16).padStart(8, '0')).join('')
}
