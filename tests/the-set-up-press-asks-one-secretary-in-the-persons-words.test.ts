// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SET UP PRESS ASKS ONE SECRETARY, IN THE PERSON'S OWN WORDS. Wave 13u, round 242.
 *
 * POST /api/harnesses/:id/set-up (src/server/api/terminal-harnesses.ts) writes the person's ask to set up one agent tool
 * as his message to one secretary, and answers which secretary and why (src/server/lib/the-set-up-press.ts). The person
 * is never asked to pick:
 *   1. With no secretary it is refused 409 harnessNoSecretary, and nothing is written.
 *   2. With one secretary it goes to that one.
 *   3. With several, it goes to the one whose recorded duties name the door harnesses.install. Duties that say the same
 *      in free words, and name no door, are not read as the duty.
 *   4. With several and none holding the duty, it goes to the secretary of his newest message to one secretary alone. A
 *      later message of his to two secretaries, and a later one to a group, are not counted.
 *   5. With several, none holding the duty and no message of his to one of them, it goes to the one registered first.
 *   6. With two holding the duty, the duty decides nothing, and the rules after it decide.
 *   7. A retired secretary registered first is passed over.
 *   8. A secretary pressing under the person's grant is refused 403 harnessSetUpIsThePersons, and nothing is written.
 *   9. The message is his, to that secretary alone, and names the tool as the office declares it, in the language the
 *      press asked for. The secretary's install press carrying its id opens the tool's first install once.
 *
 * HOW EACH CASE STANDS ALONE. A case retires every secretary of the cases before it and registers its own, each a
 * minute after the last, so "registered first" is the order the case names. A message to a retired secretary is not
 * counted, and the duties of one are not read. The cases run in order: the first has no secretary at all, and the last
 * two use the secretaries of the seventh.
 *
 * HOW CASE 9 TELLS AN OPENED INSTALL, as tests/the-persons-own-message-opens-a-first-install-once.test.ts does. This
 * server has no HOME while the install is pressed, so an install the message opens at once is refused 400
 * harnessNoHome by the install itself, before any terminal opens. A press the message does not open waits for the
 * readiness signatures: 409 readinessWaits.
 *
 * WHAT IS MADE UP. The secretaries, the decision their duties rest on, the duties and the group are written through the
 * real doors as the person, proved by a key made for this run; the person's other messages through the office's own
 * record writer, as the person. The PATH is one folder holding a made-up claude (tests/made-up-agent-tools.ts), so Codex
 * and OpenCode are not installed. No real tool runs and nothing is installed.
 */

import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n, sayInEnglish } from '../src/shared/i18n.ts'
import { THE_OWNER } from '../src/shared/kinds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, FOR_THE_PERSON, type TestDb, governsTheWholeProject } from './helpers.ts'
import { withThePath, writeTheMadeUpTools, type MadeUpTools } from './made-up-agent-tools.ts'

let t: TestDb
let app: FastifyInstance
let tools: MadeUpTools
const PERSON_KEY = randomBytes(32).toString('hex')
const before = {
  sandbox: process.env['SANDBOX_DIR'],
  gate: process.env['MOLE_OFFICE_GATE_HELD_FOR_READINESS_SIGNATURES'],
  startedBy: process.env['MOLE_OFFICE_WORLD_STARTED_BY'],
  secretaries: process.env['MOLE_OFFICE_WORLD_SECRETARIES'],
}
let forgetTheWorldsOwnAuthority: () => void = () => undefined

/** Put one variable back as it was before this file, or remove it where it was not set. */
function putBack(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

/** The person, proved by the key made for this run. */
const THE_PERSON_PROVED = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-key': PERSON_KEY,
}
const asAgent = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: object) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown>, raw: reply.body }
}

// ------------------------------------------------------------------------------------------------- the secretaries

const MINUTE = 60 * 1000
const FIRST_REGISTERED = Date.now() - 10 * 60 * MINUTE
let registered = 0
/** Each secretary's registry id and key, by handle. */
const ids = new Map<string, string>()
const keys = new Map<string, string>()
const retired = new Set<string>()
let theDecisionDutiesRestOn = ''

/** Register one secretary through the real door, a minute after the one before. */
async function register(handle: string): Promise<void> {
  const made = await call('POST', '/api/agents/started', THE_PERSON_PROVED, { handle, name: handle, role: 'secretary' })
  expect(made.status, made.raw).toBe(201)
  const id = (made.body['agent'] as { id?: string } | undefined)?.id ?? ''
  const key = (made.body['whatToGiveIt'] as { key?: string } | undefined)?.key ?? ''
  expect(id, `no registry id was given to ${handle}`).not.toBe('')
  expect(key, `no key was given to ${handle}`).not.toBe('')
  registered += 1
  t.client.sqlite.prepare('UPDATE agents SET created_at = ? WHERE id = ?').run(localStamp(new Date(FIRST_REGISTERED + registered * MINUTE)), id)
  ids.set(handle, id)
  keys.set(handle, key)
}

/** Retire one secretary through the real door. */
async function retire(handle: string): Promise<void> {
  const done = await call('POST', `/api/participants/agent/${handle}/retire`, THE_PERSON_PROVED, { because: 'A made-up end of its work.' })
  expect(done.status, done.raw).toBe(200)
  retired.add(handle)
}

/** Retire every secretary the cases before registered, then register these, first named first. */
async function onlyTheseSecretaries(...handles: string[]): Promise<void> {
  for (const handle of ids.keys()) if (!retired.has(handle)) await retire(handle)
  for (const handle of handles) await register(handle)
}

/** File a secretary's duties through the records door, as the person, resting on the made-up decision. */
async function duties(handle: string, duty: { area: string; doors?: string[] }): Promise<void> {
  const filed = await call('POST', '/api/records', THE_PERSON_PROVED, {
    kind: 'secretary_duties',
    title: `Made-up duties of ${handle}`,
    data: { secretary: { kind: 'agent', id: ids.get(handle) }, ...duty, restsOn: [theDecisionDutiesRestOn] },
  })
  expect(filed.status, filed.raw).toBe(201)
}

/** One message of the person's, written by the office's own record writer, to these secretaries or to a group. */
function hisMessage(body: string, to: { secretaries: string[] } | { group: string }): void {
  const data = 'group' in to ? { body, toGroup: to.group } : { body, to: to.secretaries.map((handle) => ({ kind: 'agent', id: ids.get(handle) })) }
  t.api.createRecord({ workspaceId: 'default', kind: 'message', title: body, data, actor: { type: 'human', id: THE_PERSON } })
}

// ------------------------------------------------------------------------------------------------- the presses

/** The person's Set up press for one tool, proved by his key. */
function setUp(tool: string, language?: string) {
  return call('POST', `/api/harnesses/${tool}/set-up`, THE_PERSON_PROVED, language === undefined ? {} : { language })
}

/** The press went to this secretary, for this reason, and wrote one message to it. */
function itWentTo(pressed: Awaited<ReturnType<typeof setUp>>, handle: string, why: string): void {
  expect(pressed.status, pressed.raw).toBe(201)
  expect(pressed.body['secretary'], pressed.raw).toEqual({ id: ids.get(handle), name: handle })
  expect(pressed.body['why'], pressed.raw).toBe(why)
  expect(typeof pressed.body['message'], pressed.raw).toBe('string')
}

/** How many messages and change rows the office holds: what a refused press must leave as it was. */
function whatIsWritten(): { messages: number; changes: number } {
  const count = (query: string): number => (t.client.sqlite.prepare(query).get() as { n: number }).n
  return { messages: count("SELECT count(*) AS n FROM records WHERE kind = 'message'"), changes: count('SELECT count(*) AS n FROM changes') }
}

/** A secretary's install press under the grant, on the made-up PATH and with no HOME, so an install that opens goes no further. */
async function install(handle: string, body: { harnesses: string[]; message: string }) {
  const home = process.env['HOME']
  delete process.env['HOME']
  try {
    return await withThePath(tools.dir, () => call('POST', '/api/harnesses/install', asAgent(handle), { ...body, ...FOR_THE_PERSON }))
  } finally {
    if (home !== undefined) process.env['HOME'] = home
  }
}

/** The message stored, as the records door answers it to the person. */
async function theMessage(id: string): Promise<{ kind: string; data: Record<string, unknown> }> {
  const read = await call('GET', `/api/records/${id}`, THE_PERSON_PROVED)
  expect(read.status, read.raw).toBe(200)
  return read.body['record'] as { kind: string; data: Record<string, unknown> }
}

beforeAll(async () => {
  delete process.env['SANDBOX_DIR']
  process.env['MOLE_OFFICE_GATE_HELD_FOR_READINESS_SIGNATURES'] = 'block'
  // NO SECRETARY OF THE WORLD THIS TEST RUNS IN, so the registry's own cards are the ones the office reads.
  delete process.env['MOLE_OFFICE_WORLD_STARTED_BY']
  delete process.env['MOLE_OFFICE_WORLD_SECRETARIES']
  t = await freshDb()
  forgetTheWorldsOwnAuthority = (await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority
  forgetTheWorldsOwnAuthority()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: PERSON_KEY, office: randomBytes(32).toString('hex'), providers: {} }, null, 2)}\n`, { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  // THE CARDS ON DISK, read as the server reads them at start, so the office can say who holds the secretary card.
  const { readTheRoleCards, forgetTheRoleCards } = await import('../src/server/lib/roles.ts')
  const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
  forgetTheRoleCards()
  readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  const decision = await call('POST', '/api/records', THE_PERSON_PROVED, {
    kind: 'decision',
    title: 'Made-up decision the duties rest on',
    data: { option_taken: 'A made-up secretary sets up the coding tools.', because: 'A made-up reason.', decided_by: THE_OWNER, ...governsTheWholeProject(), replaces: [] },
  })
  expect(decision.status, decision.raw).toBe(201)
  theDecisionDutiesRestOn = (decision.body['record'] as { id: string }).id
  tools = writeTheMadeUpTools(join(dirname(t.file), 'made-up-path'), { programs: ['claude'] })
}, 60_000)

afterAll(async () => {
  putBack('SANDBOX_DIR', before.sandbox)
  putBack('MOLE_OFFICE_GATE_HELD_FOR_READINESS_SIGNATURES', before.gate)
  await app?.close()
  t?.close()
  putBack('MOLE_OFFICE_WORLD_STARTED_BY', before.startedBy)
  putBack('MOLE_OFFICE_WORLD_SECRETARIES', before.secretaries)
  forgetTheWorldsOwnAuthority()
})

describe('the Set up press asks one secretary, and says which one and why', () => {
  it('1. refuses with no secretary, and writes nothing', async () => {
    const written = whatIsWritten()
    const pressed = await setUp('codex')
    expect(pressed.status, pressed.raw).toBe(409)
    expect(pressed.body['code'], pressed.raw).toBe('harnessNoSecretary')
    expect(whatIsWritten()).toEqual(written)
  })

  it('2. goes to the only secretary', async () => {
    await onlyTheseSecretaries('example-only-one')
    itWentTo(await setUp('codex'), 'example-only-one', 'theOnlySecretary')
  })

  it('3. goes to the one secretary whose duties name the install door, and reads no duty from free words', async () => {
    await onlyTheseSecretaries('example-words-only', 'example-holder', 'example-no-duties')
    await duties('example-words-only', { area: 'Installs the coding tools and keeps their keys.' })
    await duties('example-holder', { area: 'Looks after the machine.', doors: ['harnesses.install'] })
    itWentTo(await setUp('codex'), 'example-holder', 'holdsTheDuty')
  })

  it('4. with none holding the duty, goes to his newest message to one secretary alone, not a later one to two or to a group', async () => {
    await onlyTheseSecretaries('example-first', 'example-written-to', 'example-third')
    hisMessage('A made-up message to the first alone.', { secretaries: ['example-first'] })
    hisMessage('A made-up message to one alone.', { secretaries: ['example-written-to'] })
    hisMessage('A made-up message to two.', { secretaries: ['example-third', 'example-first'] })
    const { openAGroup } = await import('../src/server/lib/groups.ts')
    const person = { kind: 'person' as const, id: THE_PERSON }
    const group = openAGroup({
      workspaceId: 'default',
      name: 'A made-up group',
      openedBy: person,
      because: 'A made-up group for this test.',
      members: [person, ...['example-third', 'example-first'].map((handle) => ({ kind: 'agent' as const, id: ids.get(handle) ?? '' }))].map((who) => ({ who, because: 'A made-up member.' })),
    })
    hisMessage('A made-up message to the group.', { group: group.id })
    itWentTo(await setUp('codex'), 'example-written-to', 'writtenToLast')
  })

  it('5. with none holding the duty and no message of his to one of them, goes to the one registered first', async () => {
    await onlyTheseSecretaries('example-registered-first', 'example-registered-second')
    itWentTo(await setUp('codex'), 'example-registered-first', 'registeredFirst')
  })

  it('6. with two holding the duty, the duty decides nothing, and the one registered first is asked', async () => {
    await onlyTheseSecretaries('example-no-duty', 'example-holder-one', 'example-holder-two')
    await duties('example-holder-one', { area: 'Sets up the coding tools.', doors: ['harnesses.install'] })
    await duties('example-holder-two', { area: 'Sets up the coding tools too.', doors: ['harnesses.install'] })
    itWentTo(await setUp('codex'), 'example-no-duty', 'registeredFirst')
  })

  it('7. passes over a retired secretary registered first', async () => {
    await onlyTheseSecretaries('example-retired-first', 'example-asked', 'example-last')
    await retire('example-retired-first')
    itWentTo(await setUp('codex'), 'example-asked', 'registeredFirst')
  })

  it('8. refuses a secretary pressing under the grant, and writes nothing', async () => {
    const raised = await call('POST', '/api/roles/elevation/example-asked', THE_PERSON_PROVED, { reason: 'A test raises it.', endsWhen: 'when you say' })
    expect(raised.status, raised.raw).toBe(201)
    const written = whatIsWritten()
    const pressed = await call('POST', '/api/harnesses/codex/set-up', asAgent('example-asked'), { language: 'en', ...FOR_THE_PERSON })
    expect(pressed.status, pressed.raw).toBe(403)
    expect(pressed.body['code'], pressed.raw).toBe('harnessSetUpIsThePersons')
    expect(whatIsWritten()).toEqual(written)
  })
})

describe("the ask is the person's message naming the tool, and it opens the tool's first install once", () => {
  beforeAll(async () => {
    // THE CARD KEEPS THE INSTALL DOOR FOR THE PERSON, so the person lets the grant press it on this office's list.
    const answered = await call('POST', '/api/office/what-the-grant-carries', THE_PERSON_PROVED, { changes: [{ door: 'harnesses.install', answer: 'may-press' }] })
    expect(answered.status, answered.raw).toBe(200)
  }, 60_000)

  it('9a. writes his message in English to that secretary alone, naming Codex, and its id opens the first install once', async () => {
    const pressed = await setUp('codex', 'en')
    itWentTo(pressed, 'example-asked', 'writtenToLast')
    const id = String(pressed.body['message'])
    const message = await theMessage(id)
    expect(message.kind).toBe('message')
    expect(message.data['sentBy']).toEqual({ kind: 'person', id: THE_PERSON })
    expect(message.data['to']).toEqual([{ kind: 'agent', id: ids.get('example-asked') }])
    expect(message.data['body']).toBe(sayInEnglish('harnessSetUp.message', { tool: 'Codex' }))
    expect(String(message.data['body'])).toContain('Codex')
    const opened = await install('example-asked', { harnesses: ['codex'], message: id })
    expect(opened.status, opened.raw).toBe(400)
    expect(opened.body['code'], opened.raw).toBe('harnessNoHome')
    const again = await install('example-asked', { harnesses: ['codex'], message: id })
    expect(again.status, again.raw).toBe(409)
    expect(again.body['code'], again.raw).toBe('readinessWaits')
    expect(String(again.body['detail']), again.raw).toContain('has already opened a first install of Codex')
  })

  it('9b. writes it in Chinese when the press asks for Chinese, naming OpenCode, and its id opens that first install', async () => {
    const pressed = await setUp('opencode', 'zh')
    itWentTo(pressed, 'example-asked', 'writtenToLast')
    const id = String(pressed.body['message'])
    const body = String((await theMessage(id)).data['body'])
    expect(body).toBe(createI18n('zh').t('harnessSetUp.message', { tool: 'OpenCode' }))
    expect(body).not.toBe(sayInEnglish('harnessSetUp.message', { tool: 'OpenCode' }))
    expect(body).toContain('OpenCode')
    const opened = await install('example-asked', { harnesses: ['opencode'], message: id })
    expect(opened.status, opened.raw).toBe(400)
    expect(opened.body['code'], opened.raw).toBe('harnessNoHome')
  })
})
