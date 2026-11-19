// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REMINDER BEFORE THE SEAL AT REMIND, AND THE SEPARATE HARD MIGRATION CHECK. A decision chose office flow design B,
 * a reminder and never a gate, with point (2) of a second decision. Then
 * another decision, on the text of point 1 of a message, made a migration item the seal's own check still finds on
 * the branch a hard gate. At remind, every other item stays a
 * reminder. Wave 13j round 50 (src/server/lib/before-the-seal.ts); wave 14a round 1 added the gate, on Scope
 * 7hJCvyqbez-2: the fresh check runs at every git seal, whether or not a reminder ran.
 * This file covers remind, the default position. Block's refusal of a certain named item still found, and its counts,
 * are covered by tests/the-before-seal-gate-counts-items-and-later-judgements.test.ts. Likely items stay reminders there.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. The first write that would seal a run, sent with the run's own key, is answered with the reminder and stores
 *      nothing of the patch: the run still says running and has no sealed tip. The reminder names the changed test with
 *      no control, mutation and restore, and that no report is linked. The office keeps one quiet line about it.
 *   2. The same write sent again seals, and is not reminded again, unless the seal's own check still finds a migration
 *      item on the branch: that item refuses the seal (claim 15).
 *   3. `remindBeforeTheSeal: false` seals at once, with no reminder and no line, unless the seal's own check still finds
 *      a migration item: then the seal is refused too (claim 15).
 *   4. Another caller's finishing write (the office's own worker) seals at once: only the run itself is reminded.
 *   5. `remindBeforeTheSeal: true` is refused.
 *   6–11. The judging, from facts handed to it: the report class, test proofs, pictures, commits, a design for the person, and
 *      what is never counted as passed.
 *  12. The runs the check refused on 11 October, as facts (round 53): each refused item is among what the reminder says.
 *      A supervisor whose brief named seven chapters is still asked for the chapters its card names.
 *  13. The same supervisor as a real run (round 53b): registered with a seven-chapter brief, its run filed, and the facts
 *      read by `theFactsBeforeTheSealOf`, the reader the record door's reminder calls. They ask for the card's chapters.
 *  14. The real reader gets this run's stored named-tests uses, oldest first across default pages; a real proof clears the
 *      reminder, while no proof, another run's proof, an unrelated tool or a wrong-order proof does not.
 *  15. A migration item the seal's own check still finds on the branch refuses every git seal (a mixed one, or one that
 *      names no submission, which is read as git) before anything of the write is stored — whoever sends it, with or
 *      without a reminder, and with or without `remindBeforeTheSeal: false`: no seal, no check and no revocation, and
 *      each such item's own says sentence and What to do are kept whole in the refusal, while no other kind of item is
 *      named. A records or files submission seals no branch, so the gate is not asked for one.
 *  16. A migration item no longer found (the run amended its commit to name the whole migration) no longer stops the
 *      seal; the items of other kinds are still only reminders, and the seal's record of the reminder agrees: the
 *      migration item is no longer found and the others are still found.
 *  17. The gate reads the working directory the write would store, not the one the run held before it.
 *  18. A run filed already finished is refused at the filing door the same way when its branch holds the item.
 *
 * Every repository is made here in the system's temporary folder; every key is made up.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the hand-back of the run that added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   - `theRunsOwnRequest` answering true for every request: case 4 goes red;
 *   - the already-reminded check (`theLineThatReminded`) taken out: the case for claims 1 and 2 goes red, at the second write;
 *   - `remindBeforeTheSeal === false` not read in api/records.ts: case 3 goes red;
 *   - the green, red, green order not asked (any green counts as proved): case 7 goes red.
 *
 * Round 53: `theChaptersTheReminderWants` answering the chapters line alone, without the card's line: case 12 goes red.
 * Round 53b, the check's M3 and M4 on run AlHe0S5Kg2zQ: `theFactsBeforeTheSealOf` reading the chapters line alone, and
 * `onItsCard` in `theChaptersARunsAgentMustRead` set to an empty list: case 13 goes red under each.
 *
 * Round 56 changed what cases 7, 8, 9 and 12 expect: a commit item names each test file by its
 * path, and the commit's subject; any change to an existing file under tests/ is a criterion change, so case 7's commit
 * has a body; and a changed page's file must be named in the report, so case 8's report names Thing. The new rules have
 * their own cases in tests/mechanical-rules-are-named-before-the-seal.test.ts.
 *
 * Wave 14a round 1, the hard gate, with scope 7hJCvyqbez-2. Mutations planned, each to be
 * run after the released code and recorded here as measured then:
 *   - the gate not asked in patchRecord (lib/records.ts): cases 16, 18, 19 and 20 go red;
 *   - the gate not asked in createRecord (lib/records.ts): case 21 goes red;
 *   - the gate reading the run's stored data rather than what the write would store: case 20 goes red;
 *   - the gate judging every item rather than the migration items: case 17 goes red;
 *   - the gate asked only when a reminder was kept: cases 18 and 19 go red.
 */

import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readRemindedBeforeTheSeal } from '../src/shared/before-the-seal.ts'
import { localStamp } from '../src/shared/time.ts'
import type { RolesDeclaration } from '../src/shared/roles.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { StoredToolUse } from '../src/shared/toolset.ts'
import type { ACommitOfTheRun, TheFactsBeforeTheSeal } from '../src/server/lib/before-the-seal.ts'
import { aReportInForm } from './a-run-in-form.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const HANDLE = 'a-round-about-to-seal'
const TEST_PATH = 'work/made-up.test.ts'
const PROOF_LINES = [
  `named 1 file (${TEST_PATH}); 1 ran, exactly those; vitest exited 0; phase: control before mutation`,
  `named 1 file (${TEST_PATH}); 1 ran, exactly those; vitest exited 1; phase: mutation turns the case red`,
  `named 1 file (${TEST_PATH}); 1 ran, exactly those; vitest exited 0; phase: restore after mutation`,
]
const LATER_NAMED_LINE = 'named 1 file (work/unchanged.test.ts); 1 ran, exactly those; vitest exited 0; phase: newer receipt after unrelated pages'

let t: TestDb
let app: FastifyInstance
let agentId = ''
let judge: typeof import('../src/server/lib/before-the-seal.ts')['whatAnInspectorWouldMostLikelyRefuse']
let wants: typeof import('../src/server/lib/before-the-seal.ts')['theChaptersTheReminderWants']
let cardLineOf: typeof import('../src/server/lib/chapters.ts')['theCardLineOf']
let factsOf: typeof import('../src/server/lib/before-the-seal.ts')['theFactsBeforeTheSealOf']
let theWriteOfTheChaptersRead: typeof import('../src/server/lib/before-the-seal-rules.ts')['theWriteOfTheChaptersRead']
const directories: string[] = []

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
}

const asTheRun = (session: string, key: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': HANDLE,
  'x-mole-office-session': session,
  'x-mole-office-key': key,
})

const git = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

/**
 * A run filed by the office's worker at commit A, with commit B on its branch adding a test file. Made-up repository.
 * `moreFiles` writes extra files into the tree before commit B, for a fixture that needs a different commit's contents.
 */
async function aRunWithACommit(title = 'Synthetic run about to seal', moreFiles: (dir: string) => void = () => {}): Promise<{ id: string; key: string; b: string; dir: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-before-the-seal-'))
  directories.push(dir)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Synthetic reminder test')
  git(dir, 'config', 'user.email', 'reminder@example.invalid')
  git(dir, 'config', 'commit.gpgsign', 'false')
  mkdirSync(join(dir, 'work'))
  writeFileSync(join(dir, 'work/a.txt'), 'before\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'Synthetic commit A')
  const a = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'switch', '-qc', 'worker')
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OFFICE_WORKER,
    payload: {
      kind: 'session',
      title,
      data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: HANDLE, doing: 'sealing', workingDirectory: dir, cutFrom: 'main', tip: a },
    },
  })
  expect(filed.statusCode, filed.body.slice(0, 300)).toBe(201)
  const body = filed.json() as { record: { id: string }; runKey?: { key?: string } }
  const key = String(body.runKey?.key)
  expect(key, 'the office minted the run no key, so this file would prove nothing').toMatch(/^[0-9a-f]{64}$/)
  writeFileSync(join(dir, 'work/a.txt'), 'after\n')
  writeFileSync(join(dir, 'work/made-up.test.ts'), 'it("is made up", () => {})\n')
  moreFiles(dir)
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'Synthetic commit B')
  return { id: body.record.id, key, b: git(dir, 'rev-parse', 'HEAD'), dir }
}

/**
 * THE BARE MIGRATION PREFIX, BUILT AT RUNTIME. A literal quoted four-digit prefix and underscore in this file's source
 * would itself be an added line under tests/ in this run's own commits, so this run's reminder would name it and the
 * gate would refuse this run's own seal. The pieces below never read as a bare prefix in the source and always do at
 * runtime.
 */
const A_MIGRATION_PREFIX = ['02', '16_'].join('')
/** A whole migration tag, built at runtime for the same reason. */
const A_WHOLE_MIGRATION_TAG = ['02', '16_a_handover_for_every_agent'].join('')
const THE_BARE_MIGRATION_FILE = 'tests/made-up-migration.test.ts'
const aLineNamingAMigrationByItsPrefix = (): string => `const before = migrationsBefore('${A_MIGRATION_PREFIX}')`
const aLineNamingTheWholeMigration = (): string => `const before = migrationsBefore('${A_WHOLE_MIGRATION_TAG}')`

/** A run like the one above whose own commit also adds a test under tests/ naming a migration by its bare prefix. */
async function aRunWithABareMigrationPrefix(title = 'Synthetic run with a bare migration prefix'): Promise<{ id: string; key: string; b: string; dir: string }> {
  return aRunWithACommit(title, (dir) => {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, THE_BARE_MIGRATION_FILE), `${aLineNamingAMigrationByItsPrefix()}\n`)
  })
}

/** Record a made-up use through the same door that writes a tool-use row in a run's history. */
async function recordUse(run: { id: string; key: string }, tool: string, said: string): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/toolset/uses',
    headers: asTheRun(run.id, run.key),
    payload: { tool, said },
  })
  expect(reply.statusCode, reply.body.slice(0, 400)).toBe(201)
  expect((reply.json() as { run?: string }).run).toBe(run.id)
}

/** Read every default page through the route, then put the newest-first pages into oldest-first order. */
async function usesThroughTheDoor(run: { id: string; key: string }): Promise<{ total: number; pageSizes: number[]; uses: StoredToolUse[] }> {
  let before: number | null = null
  let total = 0
  const pages: StoredToolUse[][] = []
  const pageSizes: number[] = []
  do {
    const place = before === null ? '' : `?before=${String(before)}`
    const reply = await app.inject({
      method: 'GET',
      url: `/api/toolset/runs/${run.id}/uses${place}`,
      headers: asTheRun(run.id, run.key),
    })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
    const page = reply.json() as { total: number; uses: StoredToolUse[]; older: number | null }
    total = page.total
    pages.push(page.uses)
    pageSizes.push(page.uses.length)
    before = page.older
  } while (before !== null)
  return { total, pageSizes, uses: pages.flat().reverse() }
}

const theFinish = (b: string) => ({ dataPatch: { state: 'finished', tip: b } })

function linesAbout(run: string): number {
  return (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'message' AND json_extract(data, '$.extra.beforeTheSeal.run') = ?").get(run) as { n: number }).n
}

beforeAll(async () => {
  t = await freshDb()
  // THE DEFAULT SET, COPIED AS A NEW OFFICE DOES AT ITS FIRST START: a chapters line is read against the office's chapter
  // records (wave 13w). Imported after freshDb, which resets the modules.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  judge = (await import('../src/server/lib/before-the-seal.ts')).whatAnInspectorWouldMostLikelyRefuse
  wants = (await import('../src/server/lib/before-the-seal.ts')).theChaptersTheReminderWants
  cardLineOf = (await import('../src/server/lib/chapters.ts')).theCardLineOf
  factsOf = (await import('../src/server/lib/before-the-seal.ts')).theFactsBeforeTheSealOf
  theWriteOfTheChaptersRead = (await import('../src/server/lib/before-the-seal-rules.ts')).theWriteOfTheChaptersRead
  const testToolCategory = t.api.createRecord({
    workspaceId: 'default',
    kind: 'tool_category',
    title: 'Synthetic test tools',
    data: { says: 'Made-up tools used by the reminder tests.' },
    actor: { type: 'agent', id: HANDLE },
  }).id
  for (const tool of [
    { slug: 'named-tests', title: 'Synthetic named tests' },
    { slug: 'data-copy', title: 'Synthetic unrelated tool' },
  ]) {
    t.api.createRecord({
      workspaceId: 'default',
      kind: 'tool',
      title: tool.title,
      data: { entry: 'tool', slug: tool.slug, forWhom: 'developers', category: testToolCategory, kept: 'in this repository', state: 'not built yet' },
      actor: { type: 'agent', id: HANDLE },
    })
  }
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: HANDLE, name: HANDLE, role: 'worker', runtime: 'claude-code', workArea: ['work'] } })
  expect(registered.statusCode, registered.body.slice(0, 300)).toBe(201)
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })).json() as { agents?: { id: string; handle: string }[] }
  agentId = one((listed.agents ?? []).filter((a) => a.handle === HANDLE), 'the registry row').id
  expect(agentId).not.toBe('')
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
})

describe('the reminder at the door', () => {
  it('1 and 2: the run\'s own first sealing write is reminded and stores nothing; the same write again seals', async () => {
    const { id, key, b } = await aRunWithACommit()
    const first = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asTheRun(id, key), payload: theFinish(b) })
    expect(first.statusCode, first.body.slice(0, 600)).toBe(200)
    const reminded = first.json() as { beforeTheSeal?: { sealed: boolean; items: { about: string; says: string }[]; notChecked: string[] } }
    expect(reminded.beforeTheSeal?.sealed).toBe(false)
    const items = reminded.beforeTheSeal?.items ?? []
    expect(items.some((one) => one.about === 'test proof' && one.says.startsWith('work/made-up.test.ts changed'))).toBe(true)
    expect(items.some((one) => one.about === 'report' && one.says.startsWith('No report is linked'))).toBe(true)
    expect(reminded.beforeTheSeal?.notChecked.length).toBeGreaterThanOrEqual(2)
    const after = t.api.getRecord(id)!
    expect(after.data['state']).toBe('running')
    expect(after.data['sealedTip']).toBeUndefined()
    expect(linesAbout(id)).toBe(1)

    // THE REPORT THE REMINDER NAMED, filed in form, so no fault of form refuses the same write again.
    await aReportInForm(t, id, HANDLE)
    const second = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asTheRun(id, key), payload: theFinish(b) })
    expect(second.statusCode, second.body.slice(0, 600)).toBe(200)
    expect((second.json() as { beforeTheSeal?: unknown }).beforeTheSeal).toBeUndefined()
    const sealed = t.api.getRecord(id)!
    expect(sealed.data['state']).toBe('finished')
    expect(sealed.data['tip']).toBe(b)
    expect(sealed.data['sealedTip']).toEqual(expect.any(String))
    expect(linesAbout(id)).toBe(1)
  })

  it('3: remindBeforeTheSeal false seals at once', async () => {
    const { id, key, b } = await aRunWithACommit()
    await aReportInForm(t, id, HANDLE)
    const reply = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asTheRun(id, key), payload: { ...theFinish(b), remindBeforeTheSeal: false } })
    expect(reply.statusCode, reply.body.slice(0, 600)).toBe(200)
    expect((reply.json() as { beforeTheSeal?: unknown }).beforeTheSeal).toBeUndefined()
    expect(t.api.getRecord(id)!.data['state']).toBe('finished')
    expect(t.api.getRecord(id)!.data['sealedTip']).toEqual(expect.any(String))
    expect(linesAbout(id)).toBe(0)
  })

  it("4: another caller's finishing write is not reminded", async () => {
    const { id, b } = await aRunWithACommit()
    const reply = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: AS_THE_OFFICE_WORKER, payload: theFinish(b) })
    expect(reply.statusCode, reply.body.slice(0, 600)).toBe(200)
    expect((reply.json() as { beforeTheSeal?: unknown }).beforeTheSeal).toBeUndefined()
    expect(t.api.getRecord(id)!.data['state']).toBe('finished')
    expect(t.api.getRecord(id)!.data['sealedTip']).toEqual(expect.any(String))
    expect(linesAbout(id)).toBe(0)
  })

  it('5: remindBeforeTheSeal true is refused', async () => {
    const { id, key, b } = await aRunWithACommit()
    const reply = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asTheRun(id, key), payload: { ...theFinish(b), remindBeforeTheSeal: true } })
    expect(reply.statusCode).toBe(400)
    expect(reply.body).toContain('remindBeforeTheSeal may only be false, or left out.')
    expect(t.api.getRecord(id)!.data['state']).toBe('running')
  })
})

// ================================================================================================== the hard gate

type ANamedItemInAReply = { key: string; about: string; says: string; mechanical?: boolean }
const theReminderOf = (body: string): { sealed: boolean; items: ANamedItemInAReply[] } => {
  const parsed = JSON.parse(body) as { beforeTheSeal?: { sealed: boolean; items: ANamedItemInAReply[] } }
  if (parsed.beforeTheSeal === undefined) throw new Error('the reply carried no reminder')
  return parsed.beforeTheSeal
}
const theMigrationItemsOf = (items: ANamedItemInAReply[]): ANamedItemInAReply[] => items.filter((one) => one.about === 'migration')

/** What a refused seal must leave behind: the run as it was, with no seal, no check asked and no key revoked. */
function expectTheRunIsAsItWas(id: string, beforeTheWrite: { data: Record<string, unknown> }): void {
  const after = t.api.getRecord(id)!
  expect(after.data['state']).toBe(beforeTheWrite.data['state'])
  expect(after.data['tip']).toBe(beforeTheWrite.data['tip'])
  expect(after.data['sealedTip']).toBe(beforeTheWrite.data['sealedTip'])
  expect(JSON.stringify(after.data['remindedBeforeTheSeal'])).toBe(JSON.stringify(beforeTheWrite.data['remindedBeforeTheSeal']))
  expect(after.data['theCheck']).toBeUndefined()
}

describe('the migration hard gate at the door', () => {
  it("16: a migration item the seal's own check still finds refuses the seal, and only migration items are named", async () => {
    const { id, key, b } = await aRunWithABareMigrationPrefix()
    // The run's report is in form, so the only item that refuses this seal is the migration item.
    await aReportInForm(t, id, HANDLE)
    const first = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asTheRun(id, key), payload: theFinish(b) })
    expect(first.statusCode, first.body.slice(0, 600)).toBe(200)
    const reminder = theReminderOf(first.body)
    expect(reminder.sealed).toBe(false)
    const migration = theMigrationItemsOf(reminder.items)
    expect(migration).toHaveLength(1)
    expect(migration[0]!.key).toContain(':bare-prefix')
    const other = reminder.items.filter((one) => one.about !== 'migration')
    expect(other.length).toBeGreaterThan(0)
    const beforeTheWrite = t.api.getRecord(id)!

    const second = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asTheRun(id, key), payload: theFinish(b) })
    expect(second.statusCode, second.body.slice(0, 800)).toBe(409)
    const refused = second.json() as { error: string; reason?: string; theCheck?: unknown }
    for (const item of migration) expect(refused.error).toContain(item.says)
    for (const item of other) expect(refused.error).not.toContain(item.says)
    expect(refused.theCheck).toBeUndefined()
    expectTheRunIsAsItWas(id, beforeTheWrite)
    expect(linesAbout(id)).toBe(1)

    // THE RUN'S KEY STILL WRITES: the refusal sealed nothing, asked for no check and revoked nothing.
    const stillItsKey = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asTheRun(id, key), payload: { dataPatch: { doing: 'still its own key' } } })
    expect(stillItsKey.statusCode, stillItsKey.body.slice(0, 400)).toBe(200)
  })

  it('17: an amended commit that names the whole migration clears the item, and the same write then seals', async () => {
    const { id, key, b, dir } = await aRunWithABareMigrationPrefix()
    await aReportInForm(t, id, HANDLE)
    const first = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asTheRun(id, key), payload: theFinish(b) })
    const migration = theMigrationItemsOf(theReminderOf(first.body).items)
    expect(migration).toHaveLength(1)

    // THE FIX IS IN THE HISTORY, because the checks read the branch's commits: amend the run's own commit.
    writeFileSync(join(dir, THE_BARE_MIGRATION_FILE), `${aLineNamingTheWholeMigration()}\n`)
    git(dir, 'add', '.')
    git(dir, 'commit', '-q', '--amend', '--no-edit')
    const fixed = git(dir, 'rev-parse', 'HEAD')
    expect(fixed).not.toBe(b)

    const second = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asTheRun(id, key), payload: theFinish(fixed) })
    expect(second.statusCode, second.body.slice(0, 800)).toBe(200)
    const sealed = t.api.getRecord(id)!
    expect(sealed.data['state']).toBe('finished')
    expect(sealed.data['sealedTip']).toEqual(expect.any(String))
    const line = readRemindedBeforeTheSeal(sealed.data['remindedBeforeTheSeal'])
    if (line === null || !line.reminded || line.atTheSeal === null) throw new Error(`no seal on the line: ${JSON.stringify(line)}`)
    // THE SEAL'S RECORD OF THE REMINDER AGREES WITH THE GATE: the migration item is no longer found, and the test proof
    // of other kinds is still found and sealed over, because only migration items stop a seal.
    expect(line.atTheSeal.noLongerFound).toContain(migration[0]!.key)
    expect(line.atTheSeal.stillFound).toContain(`test:${THE_BARE_MIGRATION_FILE}`)
  })

  it('18: remindBeforeTheSeal false does not pass a migration item, on the run\'s first write or a launcher\'s', async () => {
    // THE RUN'S OWN FIRST SEALING WRITE, with no reminder ever kept: the fresh check refuses it.
    const own = await aRunWithABareMigrationPrefix()
    const refusedOwn = await app.inject({ method: 'PATCH', url: `/api/records/${own.id}`, headers: asTheRun(own.id, own.key), payload: { ...theFinish(own.b), remindBeforeTheSeal: false } })
    expect(refusedOwn.statusCode, refusedOwn.body.slice(0, 800)).toBe(409)
    expect((refusedOwn.json() as { error: string }).error).toContain(`${THE_BARE_MIGRATION_FILE}:1 names a migration by the bare prefix`)
    const ownAfter = t.api.getRecord(own.id)!
    expect(ownAfter.data['state']).toBe('running')
    expect(ownAfter.data['sealedTip']).toBeUndefined()
    expect(ownAfter.data['remindedBeforeTheSeal']).toBeUndefined()
    expect(linesAbout(own.id)).toBe(0)

    // THE LAUNCHER'S WRITE: the office's own worker key, the flag false, and no reminder ever kept for it.
    const launched = await aRunWithABareMigrationPrefix()
    const refusedLauncher = await app.inject({ method: 'PATCH', url: `/api/records/${launched.id}`, headers: AS_THE_OFFICE_WORKER, payload: { ...theFinish(launched.b), remindBeforeTheSeal: false } })
    expect(refusedLauncher.statusCode, refusedLauncher.body.slice(0, 800)).toBe(409)
    const launchedAfter = t.api.getRecord(launched.id)!
    expect(launchedAfter.data['state']).toBe('running')
    expect(launchedAfter.data['sealedTip']).toBeUndefined()
    expect(launchedAfter.data['remindedBeforeTheSeal']).toBeUndefined()
    expect(linesAbout(launched.id)).toBe(0)

    // AND THE SAME TWO WRITES ON A CLEAN BRANCH SEAL, so the gate refuses the item and nothing else.
    const cleanOwn = await aRunWithACommit()
    await aReportInForm(t, cleanOwn.id, HANDLE)
    const sealedOwn = await app.inject({ method: 'PATCH', url: `/api/records/${cleanOwn.id}`, headers: asTheRun(cleanOwn.id, cleanOwn.key), payload: { ...theFinish(cleanOwn.b), remindBeforeTheSeal: false } })
    expect(sealedOwn.statusCode, sealedOwn.body.slice(0, 600)).toBe(200)
    expect(t.api.getRecord(cleanOwn.id)!.data['sealedTip']).toEqual(expect.any(String))
    const cleanLauncher = await aRunWithACommit()
    const sealedLauncher = await app.inject({ method: 'PATCH', url: `/api/records/${cleanLauncher.id}`, headers: AS_THE_OFFICE_WORKER, payload: { ...theFinish(cleanLauncher.b), remindBeforeTheSeal: false } })
    expect(sealedLauncher.statusCode, sealedLauncher.body.slice(0, 600)).toBe(200)
    expect(t.api.getRecord(cleanLauncher.id)!.data['sealedTip']).toEqual(expect.any(String))
  })

  it("19: a seal sent without the run's own key is refused the same way, and a clean one seals", async () => {
    const dirty = await aRunWithABareMigrationPrefix()
    const refused = await app.inject({ method: 'PATCH', url: `/api/records/${dirty.id}`, headers: AS_THE_PERSON, payload: theFinish(dirty.b) })
    expect(refused.statusCode, refused.body.slice(0, 800)).toBe(409)
    expect((refused.json() as { error: string }).error).toContain(`${THE_BARE_MIGRATION_FILE}:1 names a migration by the bare prefix`)
    const after = t.api.getRecord(dirty.id)!
    expect(after.data['state']).toBe('running')
    expect(after.data['sealedTip']).toBeUndefined()
    expect(after.data['remindedBeforeTheSeal']).toBeUndefined()

    const clean = await aRunWithACommit()
    const sealed = await app.inject({ method: 'PATCH', url: `/api/records/${clean.id}`, headers: AS_THE_PERSON, payload: theFinish(clean.b) })
    expect(sealed.statusCode, sealed.body.slice(0, 600)).toBe(200)
    expect(t.api.getRecord(clean.id)!.data['sealedTip']).toEqual(expect.any(String))
  })

  it('20: the gate reads the working directory the write would store, not the one the run held', async () => {
    // THE RUN'S STORED TREE IS CLEAN; THE WRITE NAMES THE TREE WITH THE BARE PREFIX.
    const clean = await aRunWithACommit('Synthetic run over a clean tree')
    const dirty = await aRunWithABareMigrationPrefix('Synthetic tree with a bare migration prefix')
    const first = await app.inject({ method: 'PATCH', url: `/api/records/${clean.id}`, headers: asTheRun(clean.id, clean.key), payload: theFinish(clean.b) })
    expect(first.statusCode, first.body.slice(0, 600)).toBe(200)
    expect(theMigrationItemsOf(theReminderOf(first.body).items)).toEqual([])
    const beforeTheWrite = t.api.getRecord(clean.id)!
    const proposed = await app.inject({
      method: 'PATCH',
      url: `/api/records/${clean.id}`,
      headers: asTheRun(clean.id, clean.key),
      payload: { dataPatch: { state: 'finished', tip: dirty.b, workingDirectory: dirty.dir } },
    })
    expect(proposed.statusCode, proposed.body.slice(0, 800)).toBe(409)
    expect((proposed.json() as { error: string }).error).toContain(`${THE_BARE_MIGRATION_FILE}:1 names a migration by the bare prefix`)
    expectTheRunIsAsItWas(clean.id, beforeTheWrite)

    // THE RUN'S STORED TREE HAS THE PREFIX; THE WRITE NAMES A CLEAN TREE, AND THE SEAL GOES AHEAD.
    const held = await aRunWithABareMigrationPrefix('Synthetic run over the tree with the prefix')
    await aReportInForm(t, held.id, HANDLE)
    const cleanTree = await aRunWithACommit('Synthetic clean tree the write names')
    const heldFirst = await app.inject({ method: 'PATCH', url: `/api/records/${held.id}`, headers: asTheRun(held.id, held.key), payload: theFinish(held.b) })
    const heldMigration = theMigrationItemsOf(theReminderOf(heldFirst.body).items)
    expect(heldMigration).toHaveLength(1)
    const moved = await app.inject({
      method: 'PATCH',
      url: `/api/records/${held.id}`,
      headers: asTheRun(held.id, held.key),
      payload: { dataPatch: { state: 'finished', tip: cleanTree.b, workingDirectory: cleanTree.dir } },
    })
    expect(moved.statusCode, moved.body.slice(0, 800)).toBe(200)
    const sealed = t.api.getRecord(held.id)!
    expect(sealed.data['state']).toBe('finished')
    expect(sealed.data['workingDirectory']).toBe(cleanTree.dir)
    const line = readRemindedBeforeTheSeal(sealed.data['remindedBeforeTheSeal'])
    if (line === null || !line.reminded || line.atTheSeal === null) throw new Error(`no seal on the line: ${JSON.stringify(line)}`)
    expect(line.atTheSeal.noLongerFound).toContain(heldMigration[0]!.key)
  })

  it('21: a run filed already finished over a branch with the prefix is refused at the filing door, and a clean one is filed and sealed', async () => {
    // WHAT THE OFFICE HAS STORED, as counts a refused filing must not move. The gate stands inside the filing's
    // transaction, after the row, its baseline and its change rows are written, so the refusal rolls the whole filing
    // back: no session, no key, no history line and no notice. It does not stand before the first INSERT.
    const whatIsStored = () => ({
      sessions: t.api.listRecords({ workspaceId: 'default', kind: 'session' }).length,
      changes: t.api.countChangesMatching({ workspaceId: 'default' }),
      keys: (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM held_keys').get() as { n: number }).n,
      notices: (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'message'").get() as { n: number }).n,
    })
    const dirty = await aRunWithABareMigrationPrefix('Synthetic tree filed already finished')
    const beforeTheFiling = whatIsStored()
    const filedDirty = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_OFFICE_WORKER,
      payload: {
        kind: 'session',
        title: 'Synthetic run filed already finished over the prefix',
        data: {
          state: 'finished',
          runtime: 'claude-code',
          startedByMoleOffice: true,
          servingAgent: HANDLE,
          doing: 'filed already finished',
          workingDirectory: dirty.dir,
          cutFrom: 'main',
          tip: dirty.b,
          startedAt: localStamp(new Date(Date.now() - 30 * 60_000)),
        },
      },
    })
    expect(filedDirty.statusCode, filedDirty.body.slice(0, 800)).toBe(409)
    expect(filedDirty.body).toContain(`${THE_BARE_MIGRATION_FILE}:1 names a migration by the bare prefix`)
    expect((filedDirty.json() as { runKey?: unknown }).runKey).toBeUndefined()
    expect(t.api.listRecords({ workspaceId: 'default', kind: 'session' }).some((one) => one.title === 'Synthetic run filed already finished over the prefix')).toBe(false)
    expect(whatIsStored()).toEqual(beforeTheFiling)

    const clean = await aRunWithACommit('Synthetic clean tree filed already finished')
    const filedClean = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_OFFICE_WORKER,
      payload: {
        kind: 'session',
        title: 'Synthetic run filed already finished over a clean tree',
        data: {
          state: 'finished',
          runtime: 'claude-code',
          startedByMoleOffice: true,
          servingAgent: HANDLE,
          doing: 'filed already finished',
          workingDirectory: clean.dir,
          cutFrom: 'main',
          tip: clean.b,
          startedAt: localStamp(new Date(Date.now() - 30 * 60_000)),
        },
      },
    })
    expect(filedClean.statusCode, filedClean.body.slice(0, 800)).toBe(201)
    const created = t.api.getRecord((filedClean.json() as { record: { id: string } }).record.id)!
    expect(created.data['state']).toBe('finished')
    expect(created.data['sealedTip']).toEqual(expect.any(String))
  })
})

describe('named-test uses in a real run', () => {
  it('14: reads the exact run oldest first across all default pages, and its complete proof clears the reminder', async () => {
    const run = await aRunWithACommit()
    for (const said of PROOF_LINES) await recordUse(run, 'named-tests', said)
    // Three proof lines come first; these unrelated rows fill more than two default pages.
    for (let n = 1; n <= 101; n += 1) await recordUse(run, 'data-copy', `copy: unrelated tool-use line ${String(n)}`)
    await recordUse(run, 'named-tests', LATER_NAMED_LINE)

    const stored = await usesThroughTheDoor(run)
    expect(stored.total).toBe(105)
    expect(stored.pageSizes).toEqual([50, 50, 5])
    expect(stored.uses.filter((use) => use.tool === 'named-tests').map((use) => ({ seq: use.seq, tool: use.tool, said: use.said }))).toEqual(
      [...PROOF_LINES, LATER_NAMED_LINE].map((said, index) => ({ seq: index < 3 ? index + 1 : 105, tool: 'named-tests', said })),
    )

    const facts = factsOf(t.api.getRecord(run.id)!)
    expect(facts.testRuns).toEqual([...PROOF_LINES, LATER_NAMED_LINE])
    // Control, red and restore in order clear the test's own item. These lines were written by hand with the run's key,
    // so the one test-proof item left says they are not shown to have come through the tool (item 2i).
    expect(judge(facts).items.filter((item) => item.about === 'test proof').map((item) => item.key)).toEqual(['test-lines:not-from-the-tool'])

    const reply = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: asTheRun(run.id, run.key), payload: theFinish(run.b) })
    expect(reply.statusCode, reply.body.slice(0, 600)).toBe(200)
    const reminder = (reply.json() as { beforeTheSeal?: { sealed: boolean; items: { key: string; about: string; says: string }[] } }).beforeTheSeal
    expect(reminder?.sealed).toBe(false)
    expect(reminder?.items.filter((item) => item.about === 'test proof').map((item) => item.key)).toEqual(['test-lines:not-from-the-tool'])
    expect(t.api.getRecord(run.id)?.data['state']).toBe('running')
  })

  it('15: no matching uses, another run, an unrelated tool and an incomplete order leave proof missing', async () => {
    const other = await aRunWithACommit('Synthetic run with proof for a different run')
    for (const said of PROOF_LINES) await recordUse(other, 'named-tests', said)
    const otherUses = await usesThroughTheDoor(other)
    expect(otherUses.uses.filter((use) => use.tool === 'named-tests').map((use) => use.said)).toEqual(PROOF_LINES)

    const empty = await aRunWithACommit('Synthetic run with no named-tests uses')
    const emptyFacts = factsOf(t.api.getRecord(empty.id)!)
    expect(emptyFacts.testRuns).toEqual([])
    expect(judge(emptyFacts).items.filter((item) => item.key === `test:${TEST_PATH}`).map((item) => item.about)).toEqual(['test proof'])
    const emptyReply = await app.inject({ method: 'PATCH', url: `/api/records/${empty.id}`, headers: asTheRun(empty.id, empty.key), payload: theFinish(empty.b) })
    expect(emptyReply.statusCode, emptyReply.body.slice(0, 600)).toBe(200)
    const emptyReminder = (emptyReply.json() as { beforeTheSeal?: { items: { about: string; says: string }[] } }).beforeTheSeal
    expect(emptyReminder?.items.some((item) => item.about === 'test proof' && item.says.startsWith(`${TEST_PATH} changed`))).toBe(true)

    const unrelated = await aRunWithACommit('Synthetic run with unrelated tool uses')
    for (const said of PROOF_LINES) await recordUse(unrelated, 'data-copy', said)
    const unrelatedFacts = factsOf(t.api.getRecord(unrelated.id)!)
    expect(unrelatedFacts.testRuns).toEqual([])
    expect(judge(unrelatedFacts).items.some((item) => item.key === `test:${TEST_PATH}`)).toBe(true)

    const wrongOrder = await aRunWithACommit('Synthetic run with a wrong-order proof')
    const wrongOrderLines = [PROOF_LINES[1]!, PROOF_LINES[0]!, PROOF_LINES[2]!]
    for (const said of wrongOrderLines) await recordUse(wrongOrder, 'named-tests', said)
    const wrongOrderFacts = factsOf(t.api.getRecord(wrongOrder.id)!)
    expect(wrongOrderFacts.testRuns).toEqual(wrongOrderLines)
    expect(judge(wrongOrderFacts).items.some((item) => item.key === `test:${TEST_PATH}`)).toBe(true)
  })
})

// ================================================================================================== the judging

const commit = (sha: string, files: ACommitOfTheRun['files'], body = ''): ACommitOfTheRun => ({ commit: sha.padEnd(40, '0'), subject: `commit ${sha}`, body, files })

const facts = (over: Partial<TheFactsBeforeTheSeal>): TheFactsBeforeTheSeal => ({
  runTitle: 'Round 1',
  testRuns: [],
  git: { commits: [], existedAtTheForkBase: () => false },
  reports: [{ id: 'report-1', title: 'What round 1 did', data: { chaptersRead: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], blocks: [{ type: 'prose', text: 'audit table left for the merger' }] } }],
  sameTitleElsewhere: {},
  mustRead: [1, 9],
  checkAlso: [],
  ...over,
})

const abouts = (over: Partial<TheFactsBeforeTheSeal>): string[] => judge(facts(over)).items.map((one) => `${one.about}: ${one.says}`)

describe('what an inspector would most likely refuse', () => {
  it('6: the report: chapters read, a title copied from the run or another report', () => {
    expect(abouts({})).toEqual([])
    expect(abouts({ reports: [{ id: 'r', title: 'Done', data: { chaptersRead: [1], blocks: [] } }] })).toEqual(['report: Report r does not list chapter 9 in chaptersRead. They are the chapters the run had to read, with chapter 5 when test files changed and chapter 6 when page files changed. ' + `The write replaces the whole list: ${theWriteOfTheChaptersRead('r')}.`])
    expect(abouts({ reports: [{ id: 'r', title: 'Done', data: { blocks: [] } }] })).toEqual([expect.stringMatching(/^report: Report r has no chaptersRead/u)])
    expect(abouts({ reports: [{ id: 'r', title: 'Round 1', data: { chaptersRead: [1, 9] } }] })).toEqual([expect.stringMatching(/same title as the run/u)])
    expect(abouts({ sameTitleElsewhere: { 'report-1': ['old-report'] } })).toEqual([expect.stringMatching(/same title as old-report/u)])
    expect(abouts({ reports: [] })).toEqual([expect.stringMatching(/^report: No report is linked/u)])
  })

  it('7: a changed test needs green, then red, then green, in the lines that name it', () => {
    const changed = { commits: [commit('a1', [{ path: 'tests/old.test.ts', status: 'M', removed: 0 }], 'was a, is b, because c')], existedAtTheForkBase: () => true }
    const line = (exit: number) => `named 2 files (old, other); 2 ran, exactly those; vitest exited ${String(exit)}`
    expect(abouts({ git: changed, testRuns: [line(0), line(1), line(0)] })).toEqual([])
    expect(abouts({ git: changed, testRuns: [line(0), line(0)] })).toEqual([expect.stringMatching(/^test proof: tests\/old\.test\.ts changed.*in that order\. Chapter 5/u)])
    expect(abouts({ git: changed, testRuns: [line(1), line(0)] })).toHaveLength(1)
    const hidden = abouts({ git: changed, testRuns: ['named 30 files (a, b, and 28 more); 30 ran, exactly those; vitest exited 0'] })
    expect(hidden).toEqual([expect.stringMatching(/may be among those/u)])
  })

  it('8: a changed page needs image blocks naming the four widths and both themes', () => {
    const page = { commits: [commit('a1', [{ path: 'src/web/pages/Thing.tsx', status: 'M', removed: 2 }])], existedAtTheForkBase: () => true }
    expect(abouts({ git: page, reports: [{ id: 'r', title: 'Done', data: { chaptersRead: [1, 6, 9], blocks: [] } }] })).toEqual([expect.stringMatching(/^pictures: .*has no image blocks/u)])
    const someWidths = [{ type: 'image', path: 'a.png', alt: '1440 light' }, { type: 'prose', text: 'Thing at 990 and 660, dark' }]
    expect(abouts({ git: page, reports: [{ id: 'r', title: 'Done', data: { chaptersRead: [1, 6, 9], blocks: someWidths } }] })).toEqual([expect.stringMatching(/does not name 390\./u)])
    const all = [...someWidths, { type: 'prose', text: 'and 390' }]
    expect(abouts({ git: page, reports: [{ id: 'r', title: 'Done', data: { chaptersRead: [1, 6, 9], blocks: all } }] })).toEqual([])
  })

  it('9: a criterion change mixed with code, after code, or with a one-line message', () => {
    const existed = (path: string) => path === 'tests/old.test.ts'
    const mixed = { commits: [commit('m1', [{ path: 'tests/old.test.ts', status: 'M', removed: 1 }, { path: 'src/a.ts', status: 'M', removed: 0 }], 'old and new')], existedAtTheForkBase: existed }
    expect(abouts({ git: mixed, testRuns: ['named 1 file (old); 1 ran, exactly those; vitest exited 0', 'named 1 file (old); 1 ran, exactly those; vitest exited 1', 'named 1 file (old); 1 ran, exactly those; vitest exited 0'] }))
      .toEqual([expect.stringMatching(/^commit: Commit m10000000 \("commit m1"\) changes tests\/old\.test\.ts, which existed before this run, and also changes code \(src\/a\.ts\)/u)])
    const late = {
      commits: [commit('c1', [{ path: 'src/a.ts', status: 'M', removed: 0 }], 'x'), commit('c2', [{ path: 'tests/old.test.ts', status: 'M', removed: 3 }])],
      existedAtTheForkBase: existed,
    }
    const said = judge(facts({ git: late, testRuns: ['named 1 file (old); 1 ran, exactly those; vitest exited 0', 'named 1 file (old); 1 ran, exactly those; vitest exited 1', 'named 1 file (old); 1 ran, exactly those; vitest exited 0'] })).items
    expect(said.map((one) => one.says)).toEqual([
      expect.stringMatching(/^Commit c20000000 \("commit c2"\) changes tests\/old\.test\.ts, which existed before this run, after code commit c10000000/u),
      expect.stringMatching(/^Commit c20000000 \("commit c2"\) changes tests\/old\.test\.ts, which existed before this run, and its message is one line/u),
    ])
    const ownTest = { commits: [commit('c1', [{ path: 'src/a.ts', status: 'M', removed: 0 }, { path: 'tests/mine.test.ts', status: 'M', removed: 4 }])], existedAtTheForkBase: () => false }
    expect(judge(facts({ git: ownTest })).items.filter((one) => one.about === 'commit')).toEqual([])
  })

  it('10: a design for the person asks one question and shows each whole option', () => {
    const report = (blocks: unknown[]) => [{ id: 'r', title: 'Done', data: { chaptersRead: [1, 9], blocks } }]
    const choice = { type: 'choice', question: 'Which?', options: ['A', 'B'] }
    expect(abouts({ reports: report([choice, { type: 'fillin', question: 'And?' }, { type: 'image' }, { type: 'image' }]) })).toEqual([expect.stringMatching(/^design: Report r asks 2 questions/u)])
    expect(abouts({ reports: report([choice, { type: 'image' }]) })).toEqual([expect.stringMatching(/^design: Report r offers 2 options and holds 1 pictures/u)])
    expect(abouts({ reports: report([choice, { type: 'image' }, { type: 'image' }]) })).toEqual([])
  })

  it('11: what was not looked at is said, and git that could not be read is never counted as passed', () => {
    const { items, notChecked } = judge(facts({ git: { couldNotRead: 'no such directory' } }))
    expect(items).toEqual([])
    expect(notChecked).toHaveLength(3)
    expect(notChecked[2]).toBe("The run's commits, its test files and its page files: git could not be read (no such directory).")
  })

  it('12: the refused runs of 11 October, as facts, are each reminded of what the check refused', () => {
    // 13q ROUND 48, refusal 7t7cCna1f9PI: a supervisor, its brief named seven chapters, its report listed 6 and 10.
    const declared = JSON.parse(readFileSync(new URL('../src/config/roles.json', import.meta.url), 'utf8')) as RolesDeclaration
    const expected = declared.cards.find((card) => card.name === 'supervisor')!.mustRead.chapters.map((one) => one.chapter).sort((a, b) => a - b)
    const supervisor = wants({ chapters: { mustRead: [2, 3, 5, 6, 7, 9, 10].map((chapter) => ({ chapter })) }, onItsCard: cardLineOf('supervisor') })
    expect(supervisor).toEqual(expected)
    const listed = (chaptersRead: unknown[]) => [{ id: 'r', title: 'Done', data: { chaptersRead, blocks: [{ type: 'prose', text: 'audit table left for the merger' }] } }]
    expect(abouts({ mustRead: supervisor, reports: listed([6, 10]) })).toEqual([expect.stringMatching(new RegExp(`^report: Report r does not list chapters ${expected.filter((n) => ![6, 10].includes(n)).join(', ')} in chaptersRead`, 'u'))])
    // 13v ROUND 18b, refusal FyPoZSvM-fiD: chapters 6, 8 and 10 missing.
    expect(abouts({ mustRead: supervisor, reports: listed([1, 2, 3, 4, 5, 7, 9]) })).toEqual([expect.stringMatching(new RegExp(`does not list chapters ${expected.filter((n) => ![1, 2, 3, 4, 5, 7, 9].includes(n)).join(', ')} in chaptersRead`, 'u'))])
    // 13t ROUND 32, refusal 02Z-6gpa5MGd: a page changed, and the report names the widths only to say none was looked at.
    const page = { commits: [commit('t1', [{ path: 'src/web/components/Panel.tsx', status: 'M', removed: 3 }])], existedAtTheForkBase: () => true }
    const noPictures = [{ type: 'prose', text: 'No picture was taken at 1440, 990, 660 or 390, light or dark.' }]
    expect(abouts({ git: page, reports: [{ id: 'r', title: 'Done', data: { chaptersRead: [1, 6, 9], blocks: noPictures } }] })).toEqual([expect.stringMatching(/^pictures: .*has no image blocks/u)])
    // 13w ROUND 25, refusal LLJxa8ZackoC: an existing test's expectation changed in the same commit as code.
    const proved = (name: string) => [0, 1, 0].map((exit) => `named 1 file (${name}); 1 ran, exactly those; vitest exited ${String(exit)}`)
    const shared = (path: string) => path === 'tests/the-machine-reading-is-shared.test.ts'
    const mixed = { commits: [commit('d9a35e9fe', [{ path: 'tests/the-machine-reading-is-shared.test.ts', status: 'M', removed: 2 }, { path: 'src/server/lib/reading.ts', status: 'M', removed: 5 }], 'x\n\ny')], existedAtTheForkBase: shared }
    expect(abouts({ git: mixed, testRuns: proved('the-machine-reading-is-shared') })).toEqual([expect.stringMatching(/^commit: .*changes tests\/the-machine-reading-is-shared\.test\.ts, which existed before this run, and also changes code/u)])
    // 13r ROUND 27, refusal dqiGTffQYIcc: an existing test's expectation changed after the code.
    const stops = (path: string) => path === 'tests/a-shutdown-pauses-the-runs-at-work.test.ts'
    const late = {
      commits: [commit('e9c680ba4', [{ path: 'src/server/lib/shutdown.ts', status: 'M', removed: 1 }], 'x'), commit('8f904a1dd', [{ path: 'tests/a-shutdown-pauses-the-runs-at-work.test.ts', status: 'M', removed: 6 }], 'x\n\ny')],
      existedAtTheForkBase: stops,
    }
    expect(abouts({ git: late, testRuns: proved('a-shutdown-pauses-the-runs-at-work') })).toEqual([expect.stringMatching(/^commit: Commit 8f904a1dd \("commit 8f904a1dd"\) changes tests\/a-shutdown-pauses-the-runs-at-work\.test\.ts, which existed before this run, after code commit e9c680ba4\./u)])
  })

  it('13: a supervisor run whose brief named seven chapters is asked for its card chapters, as the door reads it', async () => {
    const SUPERVISOR = 'a-supervisor-about-to-seal'
    const registered = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: AS_THE_PERSON,
      payload: { handle: SUPERVISOR, name: SUPERVISOR, role: 'supervisor', runtime: 'claude-code', chapters: ['2', '3', '5', '6', '7', '9', '10'] },
    })
    expect(registered.statusCode, registered.body.slice(0, 300)).toBe(201)
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_OFFICE_WORKER,
      payload: { kind: 'session', title: 'Synthetic supervisor run about to seal', data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: SUPERVISOR, doing: 'sealing' } },
    })
    expect(filed.statusCode, filed.body.slice(0, 300)).toBe(201)
    const run = t.api.getRecord((filed.json() as { record: { id: string } }).record.id)!
    // The check reads the recorded brief. The reminder also asks for the card's chapters.
    const { theChaptersARunsAgentMustRead } = await import('../src/server/lib/inspection.ts')
    expect(theChaptersARunsAgentMustRead(run).chapters.mustRead.map((one) => one.chapter)).toEqual([2, 3, 5, 6, 7, 9, 10])
    const declared = JSON.parse(readFileSync(new URL('../src/config/roles.json', import.meta.url), 'utf8')) as RolesDeclaration
    expect(factsOf(run).mustRead).toEqual(declared.cards.find((card) => card.name === 'supervisor')!.mustRead.chapters.map((one) => one.chapter).sort((a, b) => a - b))
  })
})
