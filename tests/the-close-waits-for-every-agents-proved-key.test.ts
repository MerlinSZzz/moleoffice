// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRESS THAT CLOSES THE KEY WINDOW REFUSES WHILE A LIVE AGENT HOLDS NO PROVED KEY. Point 3 of one of the
 * owner's decisions rests on the owner's condition in a second decision: the window closes when every agent path
 * holds a key. src/server/lib/keywindow.ts, src/server/lib/provedkeys.ts.
 *
 * In a test office of its own, driven through the doors over a real listener. Nothing here closes any
 * window but this test's own.
 *
 *   1. Two agents whose keys were given by name. The page the owner reads names both before the owner presses.
 *   2. One is re-keyed through a proved path: it asks for a new key, the owner's press grants it, it collects.
 *   3. The press refuses while the other holds no proved key. The refusal names it, the count, and
 *      both ways out, and nothing is written: the window is open and no ledger row was added.
 *   4. It is retired. The reading says nothing refuses the press, and the press closes the window.
 *
 * AND, WHEN PROVED_KEY_SHOTS NAMES A FOLDER, the Settings panel a paired browser is drawn while one
 * agent holds no proved key: the sentence where the press would be, and no press. Four widths, both
 * themes (chapter 6 rule 1). It runs in a stack of its own, never against the office.
 *
 * WHAT MAKES IT GO RED (proved after a control run; see the commit message):
 *   closeTheKeyWindow skips the check                                 → 3
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let here = ''

const PERSON_KEY = randomBytes(32).toString('hex')
const OFFICE_KEY = randomBytes(32).toString('hex')
const DIR = `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`

/** A reply shown in a failure message with every key in it replaced, so no log ever carries a key. */
const hidden = (text: string): string => text.replace(/[0-9a-f]{64}/g, '<a secret>')

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-key': PERSON_KEY,
}
const THEIR_NAME_WITH_NO_KEY = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

interface Reply {
  status: number
  json: Record<string, unknown>
  text: string
}

async function call(method: string, url: string, headers: Record<string, string>, body?: unknown): Promise<Reply> {
  const res = await fetch(`${here}${url}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: res.status, json, text: hidden(text) }
}

const register = (handle: string, extra: Record<string, unknown> = {}): Promise<Reply> =>
  call(
    'POST',
    '/api/agents/register-myself',
    {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': handle,
    },
    { handle, name: `The agent ${handle}`, workingDirectory: DIR, ...extra },
  )

/** How many rows both ledgers and the installation's close columns hold, to prove nothing was written. */
function whatIsWritten(): { changes: number; revisions: number; closedAt: string | null } {
  const n = (sql: string): number => (t.client.sqlite.prepare(sql).get() as { n: number }).n
  const row = t.client.sqlite.prepare('SELECT window_closed_at AS at FROM installation WHERE only_row = 1').get() as {
    at: string | null
  }
  return {
    changes: n('SELECT COUNT(*) AS n FROM changes'),
    revisions: n('SELECT COUNT(*) AS n FROM revisions'),
    closedAt: row.at,
  }
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: PERSON_KEY, office: OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  here = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the close waits for every live agent to hold a proved key', () => {
  it('names the agents, refuses while one holds no proved key, and closes once it is retired', async () => {
    // 1. TWO AGENTS GIVEN KEYS BY NAME, while the window is open.
    for (const handle of ['rekey-me', 'retire-me']) {
      const made = await call('POST', '/api/agents/started', THEIR_NAME_WITH_NO_KEY, { handle, name: handle })
      expect(made.status, made.text).toBe(201)
    }
    const before = await call('GET', '/api/office/key-window', AS_THE_PERSON)
    expect(before.status, before.text).toBe(200)
    const namedBefore = before.json['closeIsRefusedBecause'] as { count: number; says: string }
    expect(namedBefore.count).toBe(2)
    expect(namedBefore.says).toContain('2 live agents hold no proved key')
    expect(namedBefore.says).toContain('"rekey-me"')
    expect(namedBefore.says).toContain('"retire-me"')

    // 2. ONE IS RE-KEYED THROUGH A PROVED PATH: its new-key ask, the owner's press, and its collection.
    const asked = await register('rekey-me', { newKey: true })
    expect(asked.status, asked.text).toBe(202)
    const granted = await call('POST', `/api/roles/requests/${String(asked.json['request'])}/grant`, AS_THE_PERSON, {})
    expect(granted.status, granted.text).toBe(200)
    const collected = await register('rekey-me', { newKey: true, askSecret: asked.json['askSecret'] })
    expect(collected.status, collected.text).toBe(200)

    // 3. THE PRESS REFUSES WHILE THE OTHER HOLDS NO PROVED KEY, AND WRITES NOTHING.
    const written = whatIsWritten()
    expect(written.closedAt).toBe(null)
    const refused = await call('POST', '/api/office/key-window/close', AS_THE_PERSON)
    expect(refused.status, refused.text).toBe(409)
    const says = String(refused.json['error'])
    expect(says).toContain('1 live agent holds no proved key')
    expect(says).toContain('"retire-me" (its keys were given to a request that carried no key)')
    expect(says).not.toContain('"rekey-me"')
    expect(says).toContain("the person's press on its new-key ask")
    expect(says).toContain('a re-key by the agent that started it, sending its own proved key')
    expect(says).toContain('Or retire it.')
    expect(says).toContain('Nothing was changed.')
    expect(whatIsWritten(), 'the refused press wrote something').toEqual(written)
    const still = await call('GET', '/api/office/key-window', AS_THE_PERSON)
    expect(still.json['open']).toBe(true)
    expect((still.json['closeIsRefusedBecause'] as { count: number }).count).toBe(1)

    // 4. RETIRED, IT NO LONGER COUNTS, AND THE PRESS CLOSES THE WINDOW.
    const retired = await call('POST', '/api/participants/agent/retire-me/retire', AS_THE_PERSON, { because: 'the test retires it' })
    expect(retired.status, retired.text).toBe(200)
    const ready = await call('GET', '/api/office/key-window', AS_THE_PERSON)
    expect(ready.json['closeIsRefusedBecause']).toBe(null)
    const closed = await call('POST', '/api/office/key-window/close', AS_THE_PERSON)
    expect(closed.status, closed.text).toBe(200)
    expect((closed.json['window'] as { open: boolean }).open).toBe(false)
  })
})

