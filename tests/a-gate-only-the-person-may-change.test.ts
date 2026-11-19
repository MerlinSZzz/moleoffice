// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A GATE ONLY THE PERSON MAY CHANGE. Wave 13r round I.
 *
 * The who-may-act rows of the gate list name "the person" as who may change them. For such a row the settings door
 * takes:
 *   1. the person, or the owner's authority in a test world;
 *   2. a secretary whom the person's grant lets press the settings door for them, asked through the grant's own check,
 *      which refuses in its own words;
 * and it refuses a secretary with its own key and no grant, which may still change a gate of the other kind. The
 * reading says the same for each kind of row, so the page and the door agree.
 *
 * Two of these rows are then turned off and back to block at their own sites: the send of a draft by somebody who did
 * not write it (round I), and the reading of the owed runs by an agent with its own key and no secretary card (round
 * J). Every other row of the kind goes through the same switch and the same count, and only that shared path covers
 * its position at off.
 *
 * Round M (item 8, points 3 and 4) reads two more facts about the settlement rows. With the reading of the owed runs
 * off and the closing of a run as superseded at block, a caller may list an owed run, but it gets the superseded
 * door's refusal when it reads how that run would be settled. The superseded door refuses a request with no key before
 * it asks its gate, so that gate does not count it. Both gates' words must say so.
 *
 * No refusal's words are copied here, because another line may reword one while the behaviour stays right. A case
 * tells two refusals apart by asking for both and comparing what the office said. The gates' own words are the
 * exception: the sentences round M added are read, because those sentences are what the round changed.
 *
 * MUTATIONS, after a control run: let the settlement reading take the caller as it is without asking who may close
 * the run, or take the key refusal off the superseded door, and the case of that point goes red.
 *
 * Every agent, key and choice here is made up, in a fresh test database. One case listens on a port of its own on
 * 127.0.0.1, because the refusal it reads is about a request a listener carried. Nothing reaches the live office.
 */
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { GATES } from '../src/config/gates.mjs'
import { SETTING_WORDS } from '../src/config/word-sources.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, FOR_THE_PERSON, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const SECRETARY = 'made-up-gate-secretary'
// The door this test asks this office's list about. The card's own answer for it is not read here.
const THE_SETTINGS_DOOR = 'office.set-settings'
const THE_PERSONS_ROW = GATES.find((one) => one.whoMayChange === 'the-person')
// A gate of the other kind, which a secretary with its own key may change.
const ANOTHER_KIND = 'MOLE_OFFICE_CHECKS_AN_HOUR'
// The row turned off and back: only a draft's writer may send it.
const THE_DRAFTS_ROW = GATES.find((one) => one.id === 'who-sends-a-draft')
// The row of round J turned off and back: only a secretary or the person, proved by a key, reads the owed runs.
const THE_SETTLEMENT_ROW = GATES.find((one) => one.id === 'who-reads-a-settlement')
// An agent with its own key and no secretary card, so only the gate stands between it and the owed runs.
const READER = 'made-up-settlement-reader'
// The row of round M asked by the settlement reading: only a run's starter, a keyed secretary or the person close a run as superseded.
const THE_SUPERSEDED_ROW = GATES.find((one) => one.id === 'who-closes-a-run-as-superseded')
// The agent whose run is owed. The person starts it, so the reader is not its starter.
const OWING = 'made-up-owing-worker'
const BECAUSE = 'Made-up later run holds the work.'

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>
let list: typeof import('../src/server/lib/what-the-grant-carries.ts')
let inspection: typeof import('../src/server/lib/inspection.ts')
let queue: typeof import('../src/server/lib/merge-entry-door.ts')
let lanes = 0
let asPerson: Record<string, string> = {}
let asSecretary: Record<string, string> = {}
let asReader: Record<string, string> = {}
const asAgent = (id: string) => ({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })
const asTheOwnersAuthority = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

interface ARow { id: string; whoMayChange: string; value: string | null; chosen: { value: string; until: string | null } | null }
interface AReading { mayChange: boolean; mayChangeThePersonsOwn: boolean; classes: { groups: { rows: ARow[] }[] }[] }

async function ask(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: Record<string, unknown>): Promise<{ status: number; said: string; body: Record<string, any> }> {
  const reply = await app.app.inject({ method, url, headers: payload === undefined ? headers : { 'content-type': 'application/json', ...headers }, ...(payload === undefined ? {} : { payload }) })
  let body: Record<string, any> = {}
  try { body = reply.json() as Record<string, any> } catch { body = {} }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}
function save(headers: Record<string, string>, value: string | null, extra: Record<string, unknown> = {}, name = THE_PERSONS_ROW!.setting) {
  return ask('POST', '/api/office/settings', headers, { changes: [{ name, value }], because: 'Made-up reason for a gate', ...extra })
}
async function reading(headers: Record<string, string>): Promise<AReading> {
  const read = await ask('GET', '/api/office/gates', headers)
  expect(read.status, read.said).toBe(200)
  return read.body as AReading
}
function theRow(read: AReading): ARow | undefined {
  return read.classes.flatMap((one) => one.groups.flatMap((group) => group.rows)).find((row) => row.id === THE_PERSONS_ROW!.id)
}
function answer(said: 'kept' | 'ask-first' | 'may-press' | 'default'): void {
  list.setThisOfficesAnswer(THE_SETTINGS_DOOR, said, { type: 'human', id: THE_PERSON } as never)
}
function counted(gate: string): { would_stop: number; stopped: number; reminded: number } {
  const row = t.client.sqlite.prepare('SELECT SUM(would_stop) AS would_stop, SUM(stopped) AS stopped, SUM(reminded) AS reminded FROM gate_counts WHERE gate = ?').get(gate) as Record<string, number | null>
  return { would_stop: row['would_stop'] ?? 0, stopped: row['stopped'] ?? 0, reminded: row['reminded'] ?? 0 }
}
/** A draft the person writes, which becomes a note, so the secretary is somebody who did not write it. */
async function aDraftOfThePersons(): Promise<string> {
  const made = await ask('POST', '/api/records', asPerson, { kind: 'draft', title: 'Made-up draft for a gate', data: { body: 'Made-up words.', for: [], becomes: 'note' } })
  expect(made.status, made.said).toBe(201)
  return String(made.body['record']?.id ?? '')
}
/**
 * A run of OWING whose report waits to be confirmed, and a later run in the same made-up directory that the merge queue
 * merged after it. The settlement reading tries the later run, so it asks who may close the run as superseded. Only the
 * office writes a run's end, its release and its merge, so the fixture puts those facts in its own database.
 */
async function anOwedRunWithALaterMergedRun(): Promise<{ run: string; later: string }> {
  const directory = `/made/up/lane-${++lanes}`
  const session = async (title: string): Promise<string> => {
    const made = await ask('POST', '/api/records', asAgent(OWING), { kind: 'session', title, data: { state: 'running', servingAgent: OWING, workingDirectory: directory } })
    expect(made.status, made.said).toBe(201)
    const id = String(made.body['record']?.id ?? '')
    t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(id)
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished') WHERE id = ?").run(id)
    return id
  }
  const secretary = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(SECRETARY) as { id: string }).id
  const run = await session('Made-up owed run')
  const released = { by: { kind: 'agent', id: secretary }, how: 'an inspector', at: '2026-10-15 09:30:00' }
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.released', json(?)) WHERE id = ?").run(JSON.stringify(released), run)
  const later = await session('Made-up later merged run')
  // Merged when the later run was made, which is after the owed run was made. The reading compares the two times.
  const mergedAt = (t.client.sqlite.prepare('SELECT created_at AS at FROM records WHERE id = ?').get(later) as { at: string }).at
  const entry = queue.asTheMergeQueue(() => t.api.createRecord({ kind: 'merge_entry', title: 'Made-up merged entry', workspaceId: WORKSPACE, origin: 'fixture', actor: inspection.THE_OFFICE, data: {
    run: later, seal: { id: 'made-up-seal', hash: 'made-up' },
    changeset: { adapter: 'git', root: directory, repository: 'made-up', branch: 'made-up', commit: 'made-up-commit', base: 'made-up-base' },
    state: 'merged', submittedBy: { kind: 'agent', id: secretary },
  } }))
  t.api.patchRecord(later, { dataPatch: { integrated: { entry: entry.id, mainBefore: 'made-up-before', mainAfter: 'made-up-after', rebasedTip: null, sealId: 'made-up-seal', at: mergedAt } } }, inspection.THE_OFFICE)
  return { run, later }
}

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  list = await import('../src/server/lib/what-the-grant-carries.ts')
  inspection = await import('../src/server/lib/inspection.ts')
  queue = await import('../src/server/lib/merge-entry-door.ts')
  asPerson = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...thePersonsKeyHeader() }
  const made = await ask('POST', '/api/agents/started', asPerson, { handle: SECRETARY, name: 'Made-up gate secretary', role: 'secretary' })
  expect(made.status, made.said).toBe(201)
  asSecretary = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': SECRETARY, 'x-mole-office-key': String(made.body['whatToGiveIt']?.key ?? '') }
  const reader = await ask('POST', '/api/agents/started', asPerson, { handle: READER, name: 'Made-up settlement reader', role: 'worker' })
  expect(reader.status, reader.said).toBe(201)
  asReader = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': READER, 'x-mole-office-key': String(reader.body['whatToGiveIt']?.key ?? '') }
  const owing = await ask('POST', '/api/agents/started', asPerson, { handle: OWING, name: 'Made-up owing worker', role: 'worker' })
  expect(owing.status, owing.said).toBe(201)
}, 60_000)

afterEach(async () => {
  answer('default')
  for (const name of new Set([THE_PERSONS_ROW, THE_DRAFTS_ROW, THE_SETTLEMENT_ROW, THE_SUPERSEDED_ROW].flatMap((row) => row === undefined ? [] : [row.setting]))) {
    const back = await save(asPerson, null, {}, name)
    expect(back.status, back.said).toBe(200)
  }
})

afterAll(async () => {
  await app?.app.close()
  t?.close()
})

it('refuses a secretary with its own key and no grant a gate only the person may change, and lets it change a gate of the other kind', async () => {
  expect(THE_PERSONS_ROW, 'the gate list has no row only the person may change').toBeDefined()
  const refused = await save(asSecretary, 'off')
  expect(refused.status, refused.said).toBe(403)
  const control = await save(asSecretary, '3', {}, ANOTHER_KIND)
  expect(control.status, control.said).toBe(200)
  const theirs = await reading(asSecretary)
  expect(theirs.mayChange).toBe(true)
  expect(theirs.mayChangeThePersonsOwn).toBe(false)
  expect(theRow(theirs)).toMatchObject({ whoMayChange: 'the-person', chosen: null })
})

it('lets the person, and the owner\'s authority in a test world, change it and put it back, and the reading says so', async () => {
  for (const headers of [asPerson, asTheOwnersAuthority]) {
    const read = await reading(headers)
    expect(read.mayChangeThePersonsOwn).toBe(true)
    const changed = await save(headers, 'off')
    expect(changed.status, changed.said).toBe(200)
    expect(theRow(await reading(headers))).toMatchObject({ value: 'off', chosen: { value: 'off', until: null } })
    const back = await save(headers, null)
    expect(back.status, back.said).toBe(200)
    expect(theRow(await reading(headers))).toMatchObject({ chosen: null })
  }
})

it('asks the grant\'s own check for a secretary the person raised, and lets it through only where this office lets the grant press the settings door', async () => {
  // The door's own refusal, asked before the raise, so the refusals after it can be told apart from it.
  const theDoorsOwn = await save(asSecretary, 'off')
  expect(theDoorsOwn.status, theDoorsOwn.said).toBe(403)
  const raised = await ask('POST', `/api/roles/elevation/${SECRETARY}`, asPerson, { reason: 'A test raises it.', endsWhen: 'when you say' })
  expect(raised.status, raised.said).toBe(201)
  const grant = String(raised.body['elevation']?.id ?? '')
  expect(grant).not.toBe('')
  for (const said of ['kept', 'ask-first'] as const) {
    answer(said)
    const refused = await save(asSecretary, 'off', { ...FOR_THE_PERSON })
    expect(refused.status, `${said}: ${refused.said}`).toBe(403)
    expect(refused.said, `${said}: the door gave its own refusal, so the grant's check was not asked`).not.toBe(theDoorsOwn.said)
    expect(refused.said).toContain(THE_SETTINGS_DOOR)
    expect((await reading(asSecretary)).mayChangeThePersonsOwn, said).toBe(false)
  }
  answer('may-press')
  expect((await reading(asSecretary)).mayChangeThePersonsOwn).toBe(true)
  const pressed = await save(asSecretary, 'off', { ...FOR_THE_PERSON })
  expect(pressed.status, pressed.said).toBe(200)
  expect(theRow(await reading(asPerson))).toMatchObject({ value: 'off', chosen: { value: 'off', until: null } })
  const presses = t.client.sqlite.prepare('SELECT operation, grant_id AS grant FROM presses_for_the_person WHERE operation = ?').all(THE_SETTINGS_DOOR)
  expect(presses, 'the change under the grant wrote no press row naming the grant').toContainEqual({ operation: THE_SETTINGS_DOOR, grant })
})

it('lets somebody who did not write a draft send it while its gate is off, and counts what the gate would have stopped', async () => {
  expect(THE_DRAFTS_ROW, 'the gate list has no row for the send of a draft').toMatchObject({ whoMayChange: 'the-person' })
  const off = await save(asPerson, 'off', {}, THE_DRAFTS_ROW!.setting)
  expect(off.status, off.said).toBe(200)
  const before = counted(THE_DRAFTS_ROW!.id)
  const sent = await ask('POST', `/api/drafts/${await aDraftOfThePersons()}/send`, asSecretary)
  expect(sent.status, sent.said).toBe(201)
  expect(sent.body['became']).toMatchObject({ kind: 'note' })
  expect(counted(THE_DRAFTS_ROW!.id)).toEqual({ ...before, would_stop: before.would_stop + 1 })
})

it('refuses that send again once its gate is back at block, and counts the stop', async () => {
  const off = await save(asPerson, 'off', {}, THE_DRAFTS_ROW!.setting)
  expect(off.status, off.said).toBe(200)
  const block = await save(asPerson, 'block', {}, THE_DRAFTS_ROW!.setting)
  expect(block.status, block.said).toBe(200)
  const draft = await aDraftOfThePersons()
  const before = counted(THE_DRAFTS_ROW!.id)
  const refused = await ask('POST', `/api/drafts/${draft}/send`, asSecretary)
  expect(refused.status, refused.said).toBe(403)
  expect(counted(THE_DRAFTS_ROW!.id)).toEqual({ ...before, would_stop: before.would_stop + 1, stopped: before.stopped + 1 })
  const left = await ask('GET', `/api/records/${draft}`, asPerson)
  expect(left.body['record']?.data?.['sentAs'], 'the refused send marked the draft sent').toBeUndefined()
})

it('lets an agent with its own key and no secretary card read the owed runs while their gate is off, still refuses a caller with no key, and counts only what the gate would have stopped', async () => {
  expect(THE_SETTLEMENT_ROW, 'the gate list has no row for the reading of the owed runs').toMatchObject({ whoMayChange: 'the-person' })
  const off = await save(asPerson, 'off', {}, THE_SETTLEMENT_ROW!.setting)
  expect(off.status, off.said).toBe(200)
  const before = counted(THE_SETTLEMENT_ROW!.id)
  const read = await ask('GET', `/api/checks/owed?agent=${READER}`, asReader)
  expect(read.status, read.said).toBe(200)
  expect(read.body['runs']).toEqual([])
  const { 'x-mole-office-key': _key, ...withNoKey } = asReader
  const refused = await ask('GET', `/api/checks/owed?agent=${READER}`, withNoKey)
  expect(refused.status, refused.said).toBe(403)
  expect(counted(THE_SETTLEMENT_ROW!.id)).toEqual({ ...before, would_stop: before.would_stop + 1 })
})

it('refuses that reading again once its gate is back at block, counts the stop, and refuses a caller with no key at off in words of its own', async () => {
  const off = await save(asPerson, 'off', {}, THE_SETTLEMENT_ROW!.setting)
  expect(off.status, off.said).toBe(200)
  const { 'x-mole-office-key': _key, ...withNoKey } = asReader
  const withNoKeyAtOff = await ask('GET', `/api/checks/owed?agent=${READER}`, withNoKey)
  expect(withNoKeyAtOff.status, withNoKeyAtOff.said).toBe(403)
  const block = await save(asPerson, 'block', {}, THE_SETTLEMENT_ROW!.setting)
  expect(block.status, block.said).toBe(200)
  const before = counted(THE_SETTLEMENT_ROW!.id)
  const refused = await ask('GET', `/api/checks/owed?agent=${READER}`, asReader)
  expect(refused.status, refused.said).toBe(403)
  // At off a caller with a key may read, so the words that say only a secretary or the person may read are not true there.
  expect(withNoKeyAtOff.said, 'a caller with no key at off was refused in the words of the block').not.toBe(refused.said)
  expect(counted(THE_SETTLEMENT_ROW!.id)).toEqual({ ...before, would_stop: before.would_stop + 1, stopped: before.stopped + 1 })
})

it('lets a caller list an owed run while the settlement gate is off, gives it the superseded door\'s refusal when it reads that run with the superseded gate at block, and both gates\' words say so', async () => {
  expect(THE_SUPERSEDED_ROW, 'the gate list has no row for closing a run as superseded').toMatchObject({ whoMayChange: 'the-person' })
  const { run, later } = await anOwedRunWithALaterMergedRun()
  const off = await save(asPerson, 'off', {}, THE_SETTLEMENT_ROW!.setting)
  expect(off.status, off.said).toBe(200)
  const block = await save(asPerson, 'block', {}, THE_SUPERSEDED_ROW!.setting)
  expect(block.status, block.said).toBe(200)
  const listed = await ask('GET', `/api/checks/owed?agent=${OWING}`, asReader)
  expect(listed.status, listed.said).toBe(200)
  expect(listed.body['runs']).toContainEqual(expect.objectContaining({ run, standing: 'reporting' }))
  const before = counted(THE_SUPERSEDED_ROW!.id)
  const read = await ask('GET', `/api/checks/${run}/how-it-would-settle`, asReader)
  expect(read.status, read.said).toBe(403)
  expect(counted(THE_SUPERSEDED_ROW!.id), 'the reading did not ask the superseded gate once').toEqual({ ...before, would_stop: before.would_stop + 1, stopped: before.stopped + 1 })
  // The superseded door's own refusal of the same caller, asked for so that the two can be compared.
  const door = await ask('POST', `/api/checks/${run}/superseded`, asReader, { by: later, because: BECAUSE })
  expect(door.status, door.said).toBe(403)
  expect(read.said, 'the reading was refused in words other than the superseded door\'s').toBe(door.said)
  expect(SETTING_WORDS.MOLE_OFFICE_GATE_WHO_READS_A_SETTLEMENT).toContain("With that gate at block, a caller that may not close the run still sees it in the list of owed runs, but is refused when it reads how that run would be settled, with that gate's refusal.")
  expect(SETTING_WORDS.MOLE_OFFICE_GATE_WHO_CLOSES_A_RUN_AS_SUPERSEDED).toContain("At block, a caller that may not close the run is refused that reading with this gate's refusal, even when the gate on reading a settlement is off.")
})

it('refuses a request with no key at the superseded door at both positions before its gate is asked, so the gate does not count it, and the gate\'s words say so', async () => {
  const { run, later } = await anOwedRunWithALaterMergedRun()
  // A real listener, because the key refusal is about a request a listener carried. An injected request is on no socket.
  const address = await app.app.listen({ port: 0, host: '127.0.0.1' })
  const { 'x-mole-office-key': _key, ...withNoKey } = asReader
  for (const position of ['block', 'off'] as const) {
    const set = await save(asPerson, position, {}, THE_SUPERSEDED_ROW!.setting)
    expect(set.status, set.said).toBe(200)
    const before = counted(THE_SUPERSEDED_ROW!.id)
    const response = await fetch(`${address}/api/checks/${run}/superseded`, { method: 'POST', headers: { ...withNoKey, 'content-type': 'application/json' }, body: JSON.stringify({ by: later, because: BECAUSE }) })
    const refused = { status: response.status, said: String(((await response.json()) as Record<string, unknown>)['error'] ?? '') }
    expect(refused.status, `${position}: ${refused.said}`).toBe(403)
    expect(counted(THE_SUPERSEDED_ROW!.id), `${position}: the gate counted a request the door refused for its missing key`).toEqual(before)
    if (position === 'block') {
      // The same caller and body in-process, which no listener carried, reaches the gate and is refused in the gate's words.
      const gate = await ask('POST', `/api/checks/${run}/superseded`, withNoKey, { by: later, because: BECAUSE })
      expect(gate.status, gate.said).toBe(403)
      expect(refused.said, 'the request with no key was refused in the gate\'s words, so the gate was asked').not.toBe(gate.said)
      expect(counted(THE_SUPERSEDED_ROW!.id)).toEqual({ ...before, would_stop: before.would_stop + 1, stopped: before.stopped + 1 })
    }
  }
  expect(SETTING_WORDS.MOLE_OFFICE_GATE_WHO_CLOSES_A_RUN_AS_SUPERSEDED).toContain('A request that came with no key, or with a key the office does not know, is refused at the door at both positions, before this gate is asked, so the gate does not count it.')
})
