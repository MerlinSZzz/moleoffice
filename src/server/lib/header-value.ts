// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `headerValue` was moved byte for byte out of src/server/lib/http.ts, with no change of behaviour.
 * `fromLatin1` was moved byte for byte out of src/server/lib/http.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { FastifyRequest } from 'fastify'
import { PanelError } from './panel-error.ts'

/**
 * Read one header.
 *
 * Node hands back an array for a header it does not join, and silently picking one of two different
 * actor identities would attribute a change to the wrong person, so that case is an error rather
 * than a choice. MEASURED, because the shape matters: the three names here are NOT among the ones
 * Node keeps separate, so off a real socket a repeat arrives as one comma-joined string and never
 * reaches this branch — `refuseRepeatedActorHeaders` above is what catches that, from the raw wire.
 * What is left for this branch is a request object assembled in-process, which is what a caller
 * inside this repository builds, and it is kept because that caller can still get it wrong.
 *
 * Every value goes through `fromLatin1` HERE rather than at each call site, so a header this
 * function is asked for cannot arrive mangled and a new header added later gets the same
 * treatment without anyone remembering to ask for it.
 */
export function headerValue(req: FastifyRequest, name: string): string | undefined {
  const raw = req.headers[name]
  if (raw === undefined) return undefined
  if (Array.isArray(raw)) {
    if (new Set(raw).size > 1) {
      throw new PanelError(
        `The header ${name} was sent more than once, with different values (${raw.join(', ')}). Send it once.`,
      )
    }
    const first = raw[0]
    return first === undefined ? undefined : fromLatin1(first)
  }
  return fromLatin1(raw)
}
/**
 * Undo Node's latin-1 reading of a header value.
 *
 * HTTP header values arrive as bytes and Node decodes every one of them as latin-1, one byte to
 * one character. An agent that sends `x-mole-office-session: 夹具标定-run` therefore hands us
 * `å¤¹å85·æ 87å®9a-run` -- and the change log is permanent, so that name is stored mangled, the
 * session it names can never be bound to it, and GET /api/changes?session=<the real name> answers
 * "nothing is filed as that" about the agent's own work. It happened here: one run left a row in
 * `dangling` that no title will ever match.
 *
 * Re-reading those same bytes as UTF-8 is exact for anything a caller actually sends: a value that
 * really was ASCII is unchanged, and a value that was UTF-8 comes back as it was written. A value
 * that is neither -- genuine latin-1 -- would not survive, which is why the round trip is checked
 * rather than assumed, and the original is kept when it does not hold.
 */
export function fromLatin1(value: string): string {
  // A latin-1 decoding maps one byte to one character, so every character it can produce is at
  // most U+00FF. A value holding anything above that did NOT come from the wire that way — it was
  // handed to us already decoded, which is what happens in-process (Fastify's inject, and the
  // tests) — and re-reading it would corrupt it: "夹具-agent" is all ASCII in its low bytes and
  // would round-trip cleanly into "9w-agent".
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code > 0xff) return value
  }
  const bytes = Buffer.from(value, 'latin1')
  const utf8 = bytes.toString('utf8')
  // Buffer.toString('utf8') substitutes U+FFFD for bytes that are not valid UTF-8 and never
  // fails, so the only honest test is whether the decoding round-trips back to the same bytes.
  // A genuine latin-1 value — a lone 0xE9 for "é" — does not, and is kept exactly as sent.
  return Buffer.from(utf8, 'utf8').equals(bytes) ? utf8 : value
}
