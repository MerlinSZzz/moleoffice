// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE PROOF THAT tools/use-line.mjs SENT A USE LINE. Wave 13n round R, item 2i.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A LINE CARRIES ONE
 * ---------------------------------------------------------------------------------------
 *
 * A run's key proves which run wrote a use line. It does not prove that the tool wrote it, because a shell that holds
 * the key can send POST /api/toolset/uses by hand. So the tool sends a proof beside each line, in USE_LINE_PROOF_HEADER.
 * The proof is an HMAC-SHA256 over the line's words, keyed with the SHA-256 of the key the line is sent with. The use
 * door works it out again from the key on the request and the words it is about to store, and keeps what it found on
 * the line's row: `matches`, `none` (no proof was sent) or `does not match`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT PROVES, AND WHAT IT CANNOT
 * ---------------------------------------------------------------------------------------
 *
 * A proof that matches says that whoever sent the line held the key it was sent with and made the proof the way this
 * file makes it. Nothing more. A program with the same key and this file can make the same proof, and so can anyone who
 * reads the key's hash from the office's database. The same line sent twice carries the same proof. It never says that
 * the line's words are true. What it does catch: a line written by hand with a key and no proof, a proof copied onto
 * other words, and a proof sent under another key.
 *
 * IT IS JAVASCRIPT FOR THE SAME REASON src/config/key-header.mjs IS: the tool and the server both make the proof, and
 * two copies of how it is made would drift.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/**
 * THE HEADER THE PROOF TRAVELS IN. IT IS NOT AN x-mole-office- NAME, on purpose. An office refuses with 400 every
 * header whose name holds "mole-office" and that it does not read (refuseMisspeltActorHeaders in
 * src/server/lib/http.ts), and so would every office older than this file: the live office refused a use line sent with
 * `x-mole-office-use-proof` on 24 October 2026. This name is ignored by an office that does not check proofs, so the
 * line is still written there. A near-miss of it is not silent either: the line arrives without a proof and is marked.
 */
export const USE_LINE_PROOF_HEADER = 'x-use-line-proof'

/**
 * @typedef {{
 *   session: string,
 *   tool: string,
 *   said: string,
 *   files?: ReadonlyArray<{ file: string, result: string, seconds: number | null, testFileHash: string | null }> | null,
 *   tree?: { commit: string | null, change: string | null } | null,
 * }} AUseLinesWords
 */

/**
 * The words a proof covers, as one string: the run the session header names, the tool, the line as sent, and the test
 * file results and tree when they are sent. Files and tree are lists in a fixed order, so the order of an object's
 * keys never changes the proof.
 * @param {AUseLinesWords} use
 */
function theWordsProved(use) {
  return JSON.stringify([
    'mole-office use line',
    use.session.trim(),
    use.tool,
    use.said,
    use.files === undefined || use.files === null ? null : use.files.map((one) => [one.file, one.result, one.seconds, one.testFileHash]),
    use.tree === undefined || use.tree === null ? null : [use.tree.commit, use.tree.change],
  ])
}

/**
 * The proof of one line, from the SHA-256 of the key it is sent with, in lowercase hex. The office has that hash for
 * the key on a request, and never needs the key itself.
 * @param {string} keysHash
 * @param {AUseLinesWords} use
 */
export function aUseLinesProofFromTheKeysHash(keysHash, use) {
  return createHmac('sha256', keysHash).update(theWordsProved(use)).digest('hex')
}

/**
 * The proof of one line sent with `key`. The key is trimmed first, as the office trims the key header it reads.
 * @param {string} key
 * @param {AUseLinesWords} use
 */
export function aUseLinesProof(key, use) {
  return aUseLinesProofFromTheKeysHash(createHash('sha256').update(key.trim()).digest('hex'), use)
}

/**
 * WHAT THE PROOF SENT WITH A LINE SHOWS: `none` when none was sent, `matches` when it is the proof of these words with
 * the key the request carried, and `does not match` otherwise, which includes a proof sent with no key at all.
 * @param {string | null | undefined} sent
 * @param {string | null} keysHash
 * @param {AUseLinesWords} use
 * @returns {'matches' | 'none' | 'does not match'}
 */
export function whatAUseLinesProofShows(sent, keysHash, use) {
  const proof = typeof sent === 'string' ? sent.trim() : ''
  if (proof === '') return 'none'
  if (keysHash === null || !/^[0-9a-f]{64}$/u.test(proof)) return 'does not match'
  const made = Buffer.from(aUseLinesProofFromTheKeysHash(keysHash, use), 'hex')
  return timingSafeEqual(made, Buffer.from(proof, 'hex')) ? 'matches' : 'does not match'
}
