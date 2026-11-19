// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KEY RULE READS NO CHINESE AS A PASSWORD GLUED TO -p, AND STILL CATCHES ONE OF TEN ID CHARACTERS (wave 13w round 6b,
 * problems 57EQjUX6s7kA and k82AM7IZmPV8, decision cvQAUoJTDYbB).
 *
 * The message door refused "（claude -p），根本没有终端画面可看", on a piece beginning "-p），", 24 characters long. Full-width
 * punctuation and Chinese after -p are not a password. Since round 10 the door stores every message and reminds instead
 * of refusing, so "stored" below means stored with no reminder. A password glued to
 * -p is still reminded about, including one of exactly
 * ten id characters, which has the shape of an office id beginning with -p: the shape cannot tell the two apart, so an id
 * is let through only when the office holds it (tests/no-finish-fails-on-a-record-id.test.ts), and no new id begins with
 * a dash (tests/no-new-id-begins-with-a-dash.test.ts).
 *
 * EVERY PIECE HERE IS MADE UP, and each -p piece is put together when the test runs, so this file holds nothing of a
 * password's shape.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND THE MUTATION THAT TURNS IT RED
 * ---------------------------------------------------------------------------------------
 *
 *   · a message with Chinese or full-width punctuation right after -p, and a port followed by a Chinese comma, is stored
 *     with no reminder.
 *     CONTROL on main before this change: refused with 400 messageHoldsPasswordAfterP.
 *     MUTATION: let the password's characters be any but white space and "=" again, [^\s=-][^\s=]{3,}, in place of
 *     printable ASCII (src/shared/terminals.ts). Red.
 *   · a message with a password glued to -p is reminded about: one of 6 characters, one of exactly 10 id characters, one of 12,
 *     one with a "!" in it, one with Chinese after it, and an id-shaped piece that no table holds.
 *     MUTATION: read -p and exactly 10 id characters as an id by its shape, as round 6's 7a3c03458 did, with
 *     (?![A-Za-z0-9_-]{10}(?![A-Za-z0-9_-])) after -p. Red.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let agentId = ''

const AS_THE_OWNER = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** -p and what follows it, put together here, so nothing in this file is a password glued to -p. */
const dashP = (rest: string): string => '-' + 'p' + rest

async function send(body: string): Promise<{ status: number; reply: Record<string, unknown> }> {
  const sent = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OWNER,
    payload: { kind: 'message', title: 'Test: the -p shape', data: { body, to: [{ kind: 'agent', id: agentId }] } },
  })
  return { status: sent.statusCode, reply: sent.json() as Record<string, unknown> }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_OWNER, payload: { kind: 'agent', title: 'reader', data: { handle: 'reader', state: 'active', runtime: 'claude-code' } } })
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_OWNER })).json() as { agents?: { id: string; handle: string }[] }
  agentId = one((listed.agents ?? []).filter((a) => a.handle === 'reader'), 'the registry row for reader').id
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a message with -p in it', () => {
  it('is stored when Chinese or full-width punctuation follows -p', async () => {
    for (const body of [
      `（claude ${dashP('')}），根本没有终端画面可看`,
      `用 claude ${dashP('')}，没有终端画面`,
      `ssh ${dashP('2222')}，然后看日志`,
      `参数是 ${dashP('')}：不打开终端`,
    ]) {
      const { status, reply } = await send(body)
      // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
      expect(status, `${body} ${JSON.stringify(reply)}`).toBe(409)
      expect(reply['keyReminder'], body).toBeUndefined()
    }
  })

  it('is reminded about when a password is glued to -p, ten id characters included', async () => {
    for (const body of [
      `mysql -u root ${dashP('S3cret')}`,
      `mysql -u root ${dashP('S3cretPass')}`,
      `Test: please read ${dashP('hNobodyHas')}.`,
      `mysql -u root ${dashP('S3cretPass99')} -h db`,
      `mysql ${dashP('Hunter2!xy')}`,
      `密码是 ${dashP('S3cretPa')}，别外传`,
    ]) {
      const { status, reply } = await send(body)
      // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
      expect(status, body).toBe(409)
      expect((reply['keyReminder'] as { shape?: string } | undefined)?.shape, body).toBe('passwordAfterP')
    }
  })
})
