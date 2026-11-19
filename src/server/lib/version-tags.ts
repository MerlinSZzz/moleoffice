// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A READ THAT ANSWERS WHAT THE CALLER ALREADY HOLDS IS ANSWERED 304, WITH NO BODY.
 *
 * Round 17 of wave 13w, on a decision, layer 1. The owner's page asked its
 * heaviest doors on every open and every reload, and each answer came over in full: 1 MB of
 * participants, 1.4 MB of conversations between agents, 3.5 MB of attention. Most of those answers
 * were byte for byte the answer before.
 *
 * WHAT THIS DOES. Every successful GET to a door whose operation is declared a read
 * (`effect: 'read'` in src/shared/ops.ts) carries an ETag: a digest of the exact bytes of its answer.
 * A request that sends that tag back in If-None-Match is answered 304 with no body. The browser
 * sends the tag by itself, because the answer also carries `Cache-Control: private, no-cache`: the
 * browser may keep the answer, but must ask before using it, every time.
 *
 * WHAT IT DOES NOT DO.
 *   - It does not skip the work. The door runs and builds its whole answer, and only then is the
 *     answer compared, so a 304 is never a guess about whether anything changed. What it saves is the
 *     body on the wire and the browser's work of reading it.
 *   - It touches no door declared a write, even a GET. Those GETs change something as they answer
 *     (GET /api/messages/conversation marks messages delivered), and their answers are left as they were.
 *   - It sets no Cache-Control on an answer that already has one (a picture's bytes say their own).
 *   - It tags no answer sent from a file as the file is read: `GET /api/file`, a portrait, an uploaded picture and
 *     a file in a resident's space (wave 13y round 34). Their bytes are not in hand to be digested without reading
 *     the whole file first, which is what those doors stopped doing. `GET /api/file` tags a file by its inode
 *     instead and answers its own 304, and the other three answer no 304.
 *
 * WHY THE TAG IS SAFE ACROSS READERS. Two callers asking one address can be answered differently
 * (another actor, another project). The tag is the digest of the bytes THIS caller is answered, so
 * a tag kept from another caller's answer matches only an answer identical to it, and then the
 * bytes the browser holds are this caller's answer exactly.
 *
 * REGISTERED IN `buildApp` ABOVE `recordCalls`, so that the request recorder, whose `onSend` runs
 * after this one, writes the 304 with the bytes that were sent, which is none.
 */
import { createHash } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { VERSION_TAG_HEADER } from '../../config/version-tag-header.mjs'
import { theOperationThisRouteDeclared } from './http.ts'

/** The version tag of these exact bytes: a strong ETag, since equal tags mean equal bytes. */
export function versionTagOf(payload: string | Buffer): string {
  return `"${createHash('sha1').update(payload).digest('base64url')}"`
}

/** True when an If-None-Match header names this tag. A weak tag sent back is compared by its value. */
export function theCallerHoldsIt(ifNoneMatch: string | undefined, tag: string): boolean {
  if (ifNoneMatch === undefined || ifNoneMatch === '') return false
  return ifNoneMatch.split(',').some((one) => {
    const said = one.trim()
    return said === '*' || said === tag || said === `W/${tag}`
  })
}

/** Whether this answer gets a version tag: a successful GET of a declared read, with its bytes in hand. */
function taggable(req: FastifyRequest, reply: FastifyReply, payload: unknown): payload is string | Buffer {
  if (req.method !== 'GET' || reply.statusCode !== 200) return false
  if (typeof payload !== 'string' && !Buffer.isBuffer(payload)) return false
  return theOperationThisRouteDeclared(req)?.effect === 'read'
}

export function answerAnUnchangedReadWith304(app: FastifyInstance): void {
  app.addHook('onSend', async (req: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    if (!taggable(req, reply, payload)) return payload
    const tag = versionTagOf(payload)
    void reply.header(VERSION_TAG_HEADER, tag)
    if (!reply.hasHeader('cache-control')) void reply.header('cache-control', 'private, no-cache')
    if (!theCallerHoldsIt(req.headers['if-none-match'], tag)) return payload
    void reply.code(304)
    reply.removeHeader('content-length')
    return ''
  })
}
