// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY SETS THE PERSON'S KEYS AND THE SANDBOXES' LOGINS FOR THEM, ON THEIR WORDS OR UNDER THEIR RAISE.
 * A secretary may do these for the person without a raise when the person clearly asks it to, in as little
 * as one sentence. A user who
 * pastes a key into a chat and asks
 * for it to be set is better served by a secretary that sets it than by a refusal.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. With no words and no raise a secretary is refused each of these writes, as before, and nothing changes.
 *   2. On their words (a warrant whose `for` names the door), a secretary sets and clears an office key and a sandbox login
 *      and, until a decision of the person's took them out of the office with its mail, it also set the summons
 *      settings. Each change
 *      is written down on `setting:<which>` with their words on the row and set
 *      or not set for the value, and said to the person in one line that names what changed and who changed it; no reply, row or
 *      line carries a value.
 *   3. A worker carrying their words is refused: the card is asked before the words.
 *   4. Words whose `for` names another door are refused, and nothing changes.
 *   5. Raised, with no words, a secretary sets a login; the row names the raise and the line says it was under their raise.
 *
 * THE HOME FOLDER IS THIS TEST'S OWN, as in tests/the-sandboxes-logins-are-set-on-the-settings-page.test.ts: the templates
 * name the sandboxes' secrets file under `~`, so HOME points at a scratch folder before anything is asked. Every key,
 * login and address here is made up.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the report of the run that added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   - the secretary clause taken out of the office keys' guard: case 2 goes red;
 *   - the words not written down (writeDownAnActUnderTheRaise asking the raise only): case 2 goes red on the row;
 *   - the line to them left out of the sandbox login's set: case 2 goes red on the line;
 *   - the card not asked (actsForThePerson in place of theSecretaryActingForThePerson): case 3 goes red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apiApp, freshDb, thePersonsKeyHeader, FOR_THE_PERSON, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const A_MADE_UP_KEY = 'not-a-real-provider-key-2718'
const A_MADE_UP_LOGIN = 'not-a-real-login-3141'
/** The line the office writes to them, and its first words. */
const THE_LINE = 'A secretary changed a setting for you'

let t: TestDb
let app: FastifyInstance
let home = ''
const previousHome = process.env['HOME']

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

/** Their words, as a secretary carries them for one door: copied, never paraphrased, and naming the door they are for. */
const theirWords = (door: string): Record<string, unknown> => ({
  saidBy: THE_PERSON,
  words: 'Please set up the keys and logins I pasted.',
  where: 'terminal',
  // A DAY BEFORE THE DECISION'S OWN MOMENT, so no clock a test runs under reads it as the future (a container may be on UTC).
  when: '2026-09-26 10:00',
  for: [door],
})

async function ask(method: 'GET' | 'POST' | 'DELETE', path: string, headers: Record<string, string>, body?: unknown): Promise<{ code: number; said: any; text: string }> {
  const reply = await app.inject({ method, url: path, headers, ...(body === undefined ? {} : { payload: body as object }) })
  let said: any = null
  try {
    said = reply.json()
  } catch {
    said = null
  }
  return { code: reply.statusCode, said, text: reply.body }
}

/** The change rows written for one setting, oldest first. */
function theRowsOf(setting: string): { actor_id: string; field: string; old_value: string | null; new_value: string | null; warrant: string | null; elevation: string | null }[] {
  return t.client.sqlite
    .prepare('SELECT actor_id, field, old_value, new_value, warrant, elevation FROM changes WHERE record_id = ? ORDER BY at, rowid')
    .all(`setting:${setting}`) as never
}

/** The office's lines to them about a setting a secretary changed, oldest first. */
async function theLinesToThePerson(): Promise<string[]> {
  const read = await ask('GET', '/api/records?kind=message&shape=full', AS_THE_PERSON)
  expect(read.code, read.text.slice(0, 300)).toBe(200)
  return ((read.said?.records ?? []) as { data: { body?: string; saidInFull?: string; to?: { kind: string; id: string }[] } }[])
    .filter((one) => one.data.body === THE_LINE && (one.data.to ?? []).some((to) => to.kind === 'person' && to.id === THE_PERSON))
    .map((one) => String(one.data.saidInFull ?? ''))
}

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'mole-office-their-words-settings-'))
  process.env['HOME'] = home
  const template = JSON.parse(readFileSync(join(REPO, 'sandboxes', 'mole-office-dev', 'sandbox.json'), 'utf8')) as { secrets: { hostFile: string } }
  expect(template.secrets.hostFile.startsWith('~/'), 'the templates no longer name the secrets file under ~').toBe(true)
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const [handle, role] of [['sec-one', 'secretary'], ['a-worker', 'worker']] as const) {
    const started = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, role })
    expect(started.code, started.text.slice(0, 300)).toBe(201)
  }
})

afterAll(async () => {
  await app.close()
  t.close()
  if (previousHome === undefined) delete process.env['HOME']
  else process.env['HOME'] = previousHome
  if (home !== '') rmSync(home, { recursive: true, force: true })
})

describe('their office keys and the sandboxes logins, for them', () => {
  it('1: are refused to a secretary with no words and no raise, and nothing changes', async () => {
    for (const [path, body] of [
      ['/api/office/keys/set', { provider: 'openrouter', value: A_MADE_UP_KEY }],
      ['/api/office/sandbox-logins/set', { name: 'OPENCODE_API_KEY', value: A_MADE_UP_LOGIN }],
    ] as const) {
      const refused = await ask('POST', path, asAgent('sec-one'), body)
      expect(refused.code, `${path}: ${refused.text.slice(0, 200)}`).toBe(403)
      expect(refused.text).toContain("the owner's own act")
      expect(refused.text).toContain("carries the person's words")
    }
    expect(theRowsOf('office-keys')).toEqual([])
    expect(await theLinesToThePerson()).toEqual([])
  })

  it('2: are set and cleared by a secretary on the person’s words, written down with those words, and said to the person with no value', async () => {
    const key = await ask('POST', '/api/office/keys/set', asAgent('sec-one'), { provider: 'openrouter', value: A_MADE_UP_KEY, warrant: theirWords('office.set-key') })
    expect(key.code, key.text.slice(0, 300)).toBe(200)
    expect((key.said.office as { provider: string; set: boolean }[]).find((one) => one.provider === 'openrouter')?.set).toBe(true)

    const login = await ask('POST', '/api/office/sandbox-logins/set', asAgent('sec-one'), { name: 'OPENCODE_API_KEY', value: A_MADE_UP_LOGIN, warrant: theirWords('office.set-sandbox-login') })
    expect(login.code, login.text.slice(0, 300)).toBe(200)
    const cleared = await ask('POST', '/api/office/sandbox-logins/clear', asAgent('sec-one'), { name: 'OPENCODE_API_KEY', warrant: theirWords('office.clear-sandbox-login') })
    expect(cleared.code, cleared.text.slice(0, 300)).toBe(200)

    // THE ROWS: their words on each, set or not set for the value, and the secretary as the one who acted.
    const keyRows = theRowsOf('office-keys')
    expect(keyRows).toHaveLength(1)
    expect(keyRows[0]).toMatchObject({ actor_id: 'sec-one', field: "the office's openrouter key", old_value: 'not set', new_value: 'set', elevation: null })
    expect(JSON.parse(String(keyRows[0]!.warrant))).toMatchObject({ saidBy: THE_PERSON, where: 'terminal', for: ['office.set-key'] })
    expect(theRowsOf('sandbox-logins').map((one) => [one.old_value, one.new_value])).toEqual([['not set', 'set'], ['set', 'not set']])

    // THE LINES TO THEM: one for each change, naming what and who, and on their words.
    const lines = await theLinesToThePerson()
    expect(lines).toHaveLength(3)
    for (const line of lines) {
      expect(line).toContain('by sec-one, on your words')
    }
    expect(lines.some((line) => line.startsWith("The office's openrouter key was set"))).toBe(true)
    expect(lines.some((line) => line.startsWith("The sandboxes' login OPENCODE_API_KEY was cleared"))).toBe(true)

    // NO VALUE ANYWHERE THE OFFICE WROTE OR ANSWERED. Compared, never printed.
    const everything = [key.text, login.text, cleared.text, JSON.stringify(theRowsOf('office-keys')), JSON.stringify(theRowsOf('sandbox-logins')), ...lines].join('\n')
    for (const value of [A_MADE_UP_KEY, A_MADE_UP_LOGIN]) expect(everything.includes(value), 'a value reached a reply, a row or a line').toBe(false)
  })

  it('3: are refused to a worker carrying their words, and nothing changes', async () => {
    const before = theRowsOf('office-keys').length
    const refused = await ask('POST', '/api/office/keys/set', asAgent('a-worker'), { provider: 'moonshot', value: A_MADE_UP_KEY, warrant: theirWords('office.set-key') })
    expect(refused.code, refused.text.slice(0, 300)).toBe(403)
    expect(theRowsOf('office-keys')).toHaveLength(before)
  })

  it('4: are refused on words whose `for` names another door, and nothing changes', async () => {
    const before = theRowsOf('office-keys').length
    const refused = await ask('POST', '/api/office/keys/set', asAgent('sec-one'), { provider: 'moonshot', value: A_MADE_UP_KEY, warrant: theirWords('office.clear-sandbox-login') })
    expect(refused.code, refused.text.slice(0, 300)).toBe(403)
    expect(refused.text).toContain('office.set-key')
    expect(theRowsOf('office-keys')).toHaveLength(before)
  })

  it('5: are set by a secretary the person has raised, with no words, and the row and the line name the raise', async () => {
    const pressed = await ask('POST', '/api/roles/elevation/sec-one', { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, { reason: 'Set the logins up while I am away' })
    expect(pressed.code, pressed.text.slice(0, 300)).toBe(201)
    try {
      const login = await ask('POST', '/api/office/sandbox-logins/set', asAgent('sec-one'), { ...FOR_THE_PERSON, name: 'OPENROUTER_API_KEY', value: A_MADE_UP_LOGIN })
      expect(login.code, login.text.slice(0, 300)).toBe(200)
      const row = theRowsOf('sandbox-logins').at(-1)!
      expect(row).toMatchObject({ actor_id: 'sec-one', field: "the sandboxes' login OPENROUTER_API_KEY", old_value: 'not set', new_value: 'set', warrant: null })
      expect(row.elevation).not.toBeNull()
      expect((await theLinesToThePerson()).some((line) => line.startsWith("The sandboxes' login OPENROUTER_API_KEY was set, by sec-one, under your raise"))).toBe(true)
    } finally {
      await ask('DELETE', '/api/roles/elevation/sec-one', AS_THE_PERSON)
    }
  })
})
