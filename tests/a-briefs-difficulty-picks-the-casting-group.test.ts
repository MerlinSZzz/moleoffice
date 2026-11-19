// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DIFFICULTY A BRIEF MARKS PICKS THE GROUP THE CASTING ROLL DRAWS FROM. Wave 13n round DX.
 * The owner's router decision: the difficulty, marked in the brief, picks the group of Casting rows, and the roll by the
 * Casting probabilities picks inside that group; the roll is only the default, used when no model is named. A brief
 * marks its difficulty with a line of its own that begins "Difficulty:", followed by a label of the Casting table.
 * Labels are made through the label doors, and a row carries any labels the table holds. The worker-run door,
 * `POST /api/agents/<worker>/worker-run`,
 * reads that line, and an ask that names no model rolls only among the rows that carry that label. An ask whose brief
 * marks nothing rolls among every row, as before. tests/one-roll-from-ask-to-start.test.ts proves the rest of the roll,
 * and this file copies its setup.
 *
 * EVERYTHING HERE IS MADE UP: the office, its keys, the sandbox folder, its repository
 * (tests/a-made-up-sandbox-repo.ts) and its container row, the agents, the Casting labels and rows, the briefs, and the
 * numbers the roll draws, which this file gives `Math.random`. A row's model is a name the launcher's compatibility data knows, read
 * from that data, and no model is run. No worker is started: only the ask is made.
 *
 * THE CASTING TABLE FOR THE WORKER CARD, in row order: a marked claude-code row with no label and no probability; a
 * codex row carrying the label DEEP at 50%; a dsh row carrying the label QUICK at 50%. Both labels are made through the
 * label door. Over every row, a draw below 0.5 takes the codex row and a draw from 0.5 takes the dsh row.
 *
 * WHAT IS PROVED
 *   1. A brief marked DEEP rolls among the DEEP rows only: a draw of 0.9 takes the codex row. The roll's record says the
 *      label, names the dsh row as skipped outside it, and the answer says which line marked it. The line's name and the
 *      word are read in any letter case.
 *   2. A brief marked QUICK rolls among the QUICK rows only: a draw of 0.1 takes the dsh row.
 *   3. A brief that marks nothing rolls among every row, as before, and the answer says what it said before.
 *   4. A brief marked with a word that is not a label of the table, or marked twice with two labels, or marked with the
 *      old name of a renamed label, is refused 400, saying what it read, and nothing is written. The renamed label's
 *      refusal names its name now.
 *   5. An ask that names a runtime and a model is given that row whatever its brief marks, and no roll is made.
 *   6. A row the roll gives outside the marked label is refused 409, and nothing is written: a roll an earlier ask of the
 *      same worker kept, and the marked row the roll takes when no row of the label has a probability above 0. A label
 *      no row carries is refused 409 in the roll's own words, and the marked row is not taken.
 *
 * THE WORDS ARE READ FROM THE CODE: the label names from the table's own reading, and every
 * sentence of an answer from the door's exported words (src/server/lib/worker-runs.ts) and the roll's
 * (src/shared/casting-roll.ts). The roll's reasons for skipping a row are its own words, so a skipped row is checked by
 * its id only. Round DY.
 *
 * MUTATION PROOF (after a green control, each alone, restored and checked with cmp, then green again): named in the
 * commit that adds the code.
 */

import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest'

import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { THE_PROVIDER_A_RUNTIME_RUNS } from '../src/config/runtime-native-providers.mjs'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import type { CastingLabel, CastingReading } from '../src/shared/casting.ts'
import { noRowCarriesTheLabel } from '../src/shared/casting-roll.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import type { TheWorkerRun } from '../src/shared/worker-runs.ts'
import { aMadeUpSandboxRepo } from './a-made-up-sandbox-repo.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/**
 * The two labels this file makes through the label door and gives its rows. The briefs below mark them, and the words of
 * every answer are read from the door (src/server/lib/worker-runs.ts).
 */
const DEEP = 'made-up-deep-work'
const QUICK = 'made-up-quick-work'
/** A word that is no label of the table. */
const NO_LABEL = 'middling'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')

/** A model the launcher's compatibility data knows, read from that data, and not Luna, which a roll renames or skips. */
function aKnownModel(names: readonly string[]): string {
  const model = names.find((one) => !one.endsWith('gpt-6-luna'))
  if (model === undefined) throw new Error(`The launcher's compatibility data holds no model of ${names.join(', ')} this file can cast a row with.`)
  return model
}
const THE_ALIASES = Object.keys(LAUNCHER_MODEL_COMPATIBILITY.aliases)
const theModelsOf = (runtime: string): string[] =>
  THE_ALIASES.filter((name) => !name.includes('/') && Object.hasOwn(LAUNCHER_MODEL_COMPATIBILITY.aliases, `${String(THE_PROVIDER_A_RUNTIME_RUNS[runtime])}/${name}`))
const MARKED_MODEL = aKnownModel(theModelsOf('claude-code'))
const HARD_MODEL = aKnownModel(theModelsOf('codex'))
const SIMPLE_MODEL = aKnownModel(LAUNCHER_MODEL_COMPATIBILITY.dsh.models.filter((name) => !name.includes('/')))

let t: TestDb
/** The worker-run door's words, imported once the test's own database is named, because the module opens the database. */
let door: typeof import('../src/server/lib/worker-runs.ts')
let app: FastifyInstance
let scratch: string
let workerModeBefore: string | undefined
let random: MockInstance<() => number>

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string, key?: string, session?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: Record<string, any> }> {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, any> }
}

const agents = new Map<string, { id: string; key: string }>()

/** Register an agent through the starter door, by the person or by a starter's key, and keep its id and key. */
async function started(handle: string, by: Record<string, string> = AS_THE_PERSON, role?: string): Promise<void> {
  const r = await call('POST', '/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', ...(role === undefined ? {} : { role }) })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  const key = String((r.body['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(key, 'the registration answered no key').toMatch(/^[0-9a-f]{64}$/)
  agents.set(handle, { id: (r.body['agent'] as { id: string }).id, key })
}
const asOne = (handle: string): Record<string, string> => asAgent(handle, agents.get(handle)!.key)
const idOf = (handle: string): string => agents.get(handle)!.id

function dataOf(run: string): Record<string, any> {
  return JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }).data) as Record<string, any>
}
const theWorkerRunOf = (handle: string): TheWorkerRun | undefined => (dataOf(bossRun)['workerRuns'] as Record<string, TheWorkerRun> | undefined)?.[idOf(handle)]

/** Write a brief into the sandbox folder and answer its path. */
function aBrief(name: string, words: string): string {
  const path = join(folder, `${name}.md`)
  writeFileSync(path, words)
  return path
}

/** Ask for a worker run as or-boss, from its own run, with its own run key, while the roll would draw `draw`. */
async function ask(handle: string, body: Record<string, unknown>, draw: number): Promise<{ status: number; body: Record<string, any> }> {
  random.mockReturnValue(draw)
  return await call('POST', `/api/agents/${idOf(handle)}/worker-run`, asAgent('or-boss', bossRunKey, bossRun), body)
}

/** Cast one row of the worker card, by the person, carrying these labels, and answer its id. */
async function aCastingRow(program: string, model: string, probability: string | null, labels: readonly string[]): Promise<number> {
  const r = await call('POST', '/api/casting/worker', AS_THE_PERSON, {
    program: { value: program }, model: { value: model },
    ...(probability === null ? {} : { probability: { value: probability } }),
    ...(labels.length === 0 ? {} : { labels: { value: labels.join(', ') } }),
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return Number(r.body['casting'].id)
}

/** Make a label through the label door, by the person, and answer it. */
async function aLabel(name: string): Promise<CastingLabel> {
  const r = await call('POST', '/api/casting/labels', AS_THE_PERSON, { name })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return r.body['label'] as CastingLabel
}

/** The names of the table's labels, in the order its reading gives them. */
async function theLabelNames(): Promise<string[]> {
  const r = await call('GET', '/api/casting', AS_THE_PERSON)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return (r.body as unknown as CastingReading).labels.map((one) => one.name)
}

let folder = ''
let bossRun = ''
let bossRunKey = ''
const row = { marked: 0, hard: 0, simple: 0 }

beforeAll(async () => {
  // THE DOOR ASKS WHETHER THE OFFICE'S WORKER IS ON. Set here, so the answer does not depend on a .env.
  workerModeBefore = process.env['MOLE_OFFICE_MESSAGE_WORKER']
  process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
  random = vi.spyOn(Math, 'random')
  t = await freshDb()
  door = await import('../src/server/lib/worker-runs.ts')
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-a-briefs-group-'))

  await started('or-quill', AS_THE_PERSON, 'secretary')
  await started('or-boss', asOne('or-quill'))
  // THE WORKERS ARE GIVEN NO ROLE, and an agent with none holds the worker card.
  for (const handle of ['or-hard', 'or-simple', 'or-plain', 'or-word', 'or-twice', 'or-renamed', 'or-named', 'or-kept', 'or-none-left', 'or-unserved']) await started(handle, asOne('or-boss'))

  // THE LABELS, made through the label door, and THE WORKER CARD'S CASTING TABLE. The first row cast is the marked one.
  await aLabel(DEEP)
  await aLabel(QUICK)
  row.marked = await aCastingRow('claude-code', MARKED_MODEL, null, [])
  row.hard = await aCastingRow('codex', HARD_MODEL, '50%', [DEEP])
  row.simple = await aCastingRow('dsh', SIMPLE_MODEL, '50%', [QUICK])

  // A MADE-UP SANDBOX FOLDER for the briefs, and the container row `tools/sandbox.mjs up` registers for it.
  folder = join(realpathSync(scratch), 'sandboxes', 'or-boss-sandbox')
  mkdirSync(folder, { recursive: true })
  aMadeUpSandboxRepo(folder, CHECKOUT)
  const container = `row-${randomBytes(5).toString('hex')}`
  t.client.sqlite
    .prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-10-14 10:00:00', 'agent:fixture')")
    .run(container, 'mole-office-sandbox-or-boss-sandbox', `Sandbox or-boss-sandbox, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`)

  // A RUN OF or-boss IN THE SANDBOX, filed by its starter's key from the starter's own terminal, so the office mints the
  // run its own key (tests/one-roll-from-ask-to-start.test.ts says why).
  const terminal = await call('POST', '/api/records', asOne('or-quill'), { kind: 'session', title: 'or-quill in a terminal', data: { state: 'running', runtime: 'claude-code' } })
  expect(terminal.status, JSON.stringify(terminal.body)).toBe(201)
  const run = await call('POST', '/api/records', asAgent('or-quill', agents.get('or-quill')!.key, String(terminal.body['record'].id)), {
    kind: 'session',
    title: 'A made-up supervisor run of or-boss',
    data: {
      state: 'running', servingAgent: 'or-boss', servingAgentId: idOf('or-boss'), runtime: 'claude-code', model: 'claude-made-up-boss-0',
      workingDirectory: CHECKOUT, cutFrom: 'main', sandbox: { template: 'mole-office-dev', container, folder },
    },
  })
  expect(run.status, JSON.stringify(run.body)).toBe(201)
  bossRun = String(run.body['record'].id)
  bossRunKey = String(run.body['runKey']?.key)
}, 60_000)

afterAll(async () => {
  random?.mockRestore()
  if (workerModeBefore === undefined) delete process.env['MOLE_OFFICE_MESSAGE_WORKER']
  else process.env['MOLE_OFFICE_MESSAGE_WORKER'] = workerModeBefore
  await app?.close()
  t?.close()
  if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true })
})

describe('1 and 2. a marked brief rolls among the rows of its label', () => {
  it('rolls among the DEEP rows only for a brief marked DEEP, in any letter case', async () => {
    const brief = aBrief('hard', `# A made-up brief\n\ndifficulty:  ${DEEP.toUpperCase()} \n\nDo the made-up deep work.\n`)
    const r = await ask('or-hard', { brief }, 0.9)
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    const roll = theWorkerRunOf('or-hard')!.castingRoll!
    expect(roll).toMatchObject({
      choice: 'rolled', group: DEEP, keptFrom: null,
      selected: { rowId: row.hard, program: 'codex', model: HARD_MODEL, probability: 0.5, share: 1, number: 0.9 },
      candidates: [{ rowId: row.hard, share: 1 }],
    })
    // The marked row and the simple row are skipped; the roll's reasons are its own words (src/shared/casting-roll.ts).
    expect(roll.skipped.map((one) => one.rowId)).toEqual([row.marked, row.simple])
    expect(theWorkerRunOf('or-hard')!.row?.id).toBe(row.hard)
    expect(r.body['says']).toContain(door.theDifficultyTheBriefMarks({ label: DEEP, line: 3 }, row.hard, [DEEP]))
  })

  it('rolls among the QUICK rows only for a brief marked QUICK', async () => {
    const brief = aBrief('simple', `Difficulty: ${QUICK}\n\nDo the made-up quick work.\n`)
    const r = await ask('or-simple', { brief }, 0.1)
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    expect(theWorkerRunOf('or-simple')!.castingRoll).toMatchObject({
      choice: 'rolled', group: QUICK, selected: { rowId: row.simple, program: 'dsh', model: SIMPLE_MODEL, share: 1, number: 0.1 },
    })
    expect(r.body['says']).toContain(door.theDifficultyTheBriefMarks({ label: QUICK, line: 1 }, row.simple, [QUICK]))
  })
})

describe('3. a brief that marks nothing rolls among every row, as before', () => {
  it('draws over both labels and says what it said before', async () => {
    const brief = aBrief('plain', '# A made-up brief\n\nDo the made-up work. Its difficulty is not marked.\n')
    const r = await ask('or-plain', { brief }, 0.9)
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    const roll = theWorkerRunOf('or-plain')!.castingRoll!
    expect(roll).toMatchObject({ choice: 'rolled', selected: { rowId: row.simple, share: 0.5, number: 0.9 } })
    expect([DEEP, QUICK]).not.toContain(roll.group)
    expect(roll.candidates.map((one) => one.rowId)).toEqual([row.hard, row.simple])
    // The roll's words follow the row given, with no sentence on a difficulty between them and the next sentence.
    expect(r.body['says']).toContain(door.aRolledRowSays('dsh', SIMPLE_MODEL, row.simple, roll.says))
  })
})

describe('4. a mark that is not one label is refused', () => {
  it("refuses a word that is not a label, naming the word, the line and the table's labels", async () => {
    const labels = await theLabelNames()
    expect(labels).toEqual(expect.arrayContaining([DEEP, QUICK]))
    expect(labels).not.toContain(NO_LABEL)
    const brief = aBrief('middling', `# A made-up brief\nDifficulty: ${NO_LABEL}\n`)
    const r = await ask('or-word', { brief }, 0.1)
    expect(r.status, JSON.stringify(r.body)).toBe(400)
    expect(String(r.body['error'])).toBe(door.aDifficultyThatIsNoLabel(brief, NO_LABEL, 2, labels))
    expect(theWorkerRunOf('or-word')).toBeUndefined()
  })

  it('refuses a brief that marks two labels, naming both lines', async () => {
    const brief = aBrief('twice', `Difficulty: ${DEEP}\nDo the work.\nDifficulty: ${QUICK}\n`)
    const r = await ask('or-twice', { brief }, 0.1)
    expect(r.status, JSON.stringify(r.body)).toBe(400)
    expect(String(r.body['error'])).toBe(door.aDifficultyMarkedTwice(brief, { label: DEEP, line: 1 }, { label: QUICK, line: 3 }))
    expect(theWorkerRunOf('or-twice')).toBeUndefined()
  })

  it('refuses the old name of a renamed label, naming its name now', async () => {
    const label = await aLabel('made-up-old-name')
    const renamed = await call('PATCH', `/api/casting/labels/${String(label.id)}`, AS_THE_PERSON, { name: 'made-up-new-name' })
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200)
    const brief = aBrief('renamed', `Difficulty: Made-Up-Old-Name\n`)
    const r = await ask('or-renamed', { brief }, 0.1)
    expect(r.status, JSON.stringify(r.body)).toBe(400)
    expect(String(r.body['error'])).toBe(door.aDifficultyThatWasRenamed(brief, 'Made-Up-Old-Name', 1, 'made-up-new-name'))
    expect(theWorkerRunOf('or-renamed')).toBeUndefined()
  })
})

describe('5. a named model is given whatever the brief marks', () => {
  it('gives the named QUICK row to a brief marked DEEP, with no roll', async () => {
    const brief = aBrief('named', `Difficulty: ${DEEP}\n`)
    const r = await ask('or-named', { brief, runtime: 'dsh', model: SIMPLE_MODEL }, 0.1)
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    const entry = theWorkerRunOf('or-named')!
    expect(entry.row?.id).toBe(row.simple)
    expect(entry.chosen).toMatchObject({ runtime: 'dsh', model: SIMPLE_MODEL })
    expect(entry).not.toHaveProperty('castingRoll')
  })
})

describe('6. a row outside the marked label is refused', () => {
  it('refuses a kept roll of the QUICK row for a brief marked DEEP, and keeps the entry as it was', async () => {
    const first = await ask('or-kept', { brief: aBrief('kept-plain', 'Do the work.\n') }, 0.9)
    expect(first.status, JSON.stringify(first.body)).toBe(202)
    const before = theWorkerRunOf('or-kept')!
    expect(before.castingRoll).toMatchObject({ choice: 'rolled', selected: { rowId: row.simple } })
    const r = await ask('or-kept', { brief: aBrief('kept-hard', `Difficulty: ${DEEP}\n`) }, 0.1)
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(String(r.body['error'])).toBe(
      door.noWorkerRunCouldBeStarted(
        `${before.castingRoll!.says} ${door.theDifficultyTheBriefMarks({ label: DEEP, line: 1 }, row.simple, [QUICK])} ${door.A_WORKER_IS_GIVEN_A_ROW_OF_ITS_LABEL}`,
        'or-kept',
      ),
    )
    expect(theWorkerRunOf('or-kept')).toEqual(before)
    // The same kept roll is given to a brief marked with its own label.
    const again = await ask('or-kept', { brief: aBrief('kept-simple', `Difficulty: ${QUICK}\n`) }, 0.1)
    expect(again.status, JSON.stringify(again.body)).toBe(202)
    expect(theWorkerRunOf('or-kept')!.castingRoll).toEqual(before.castingRoll)
  })

  it('refuses a repeated worker ask while its kept row is out and keeps the roll when the time has passed', async () => {
    const before = theWorkerRunOf('or-kept')!
    const future = await call('PATCH', `/api/casting/rows/${String(row.simple)}`, AS_THE_PERSON, { out_until: { value: '2099-01-02 09:30' } })
    expect(future.status, JSON.stringify(future.body)).toBe(200)
    const brief = aBrief('kept-out', `Difficulty: ${QUICK}\n`)
    const refused = await ask('or-kept', { brief }, 0.1)
    expect(refused.status, JSON.stringify(refused.body)).toBe(409)
    expect(String(refused.body['error'])).toContain('2099-01-02')
    expect(theWorkerRunOf('or-kept')).toEqual(before)
    const past = await call('PATCH', `/api/casting/rows/${String(row.simple)}`, AS_THE_PERSON, { out_until: { value: '2020-01-02 09:30' } })
    expect(past.status, JSON.stringify(past.body)).toBe(200)
    const available = await ask('or-kept', { brief }, 0.1)
    expect(available.status, JSON.stringify(available.body)).toBe(202)
    expect(theWorkerRunOf('or-kept')!.castingRoll).toEqual(before.castingRoll)
  })

  it('refuses a repeated worker ask while the kept roll is provider limited', async () => {
    const before = theWorkerRunOf('or-kept')!
    const stopped = t.api.createRecord({ kind: 'session', title: 'Synthetic: limit after the worker ask', workspaceId: 'default',
      actor: { type: 'agent', id: idOf('or-boss') }, origin: 'fixture', data: {
        state: 'crashed', runtime: 'dsh', model: SIMPLE_MODEL, closedHow: 'provider-event', closedAt: '2026-11-10 06:00:00',
        stopCause: { kind: 'session-limit', said: 'Synthetic: limit after the worker ask.', at: new Date().toISOString(), resetsAt: new Date(Date.now() + 18_000_000).toISOString() },
      } }).id
    const brief = aBrief('kept-limit', `Difficulty: ${QUICK}\n`)
    try {
      const refused = await ask('or-kept', { brief }, 0.1)
      expect(refused.status, JSON.stringify(refused.body)).toBe(409)
      expect(String(refused.body['error'])).toContain(`Run ${stopped} reports session limit`)
      expect(theWorkerRunOf('or-kept')).toEqual(before)
    } finally {
      t.api.deleteRecord(stopped, { type: 'agent', id: idOf('or-boss') })
    }
    const available = await ask('or-kept', { brief }, 0.1)
    expect(available.status, JSON.stringify(available.body)).toBe(202)
    expect(theWorkerRunOf('or-kept')!.castingRoll).toEqual(before.castingRoll)
  })

  it('refuses the marked row, with no label, when no row of the marked label has a probability above 0', async () => {
    const zero = await call('PATCH', `/api/casting/rows/${String(row.simple)}`, AS_THE_PERSON, { probability: { value: '0' } })
    expect(zero.status, JSON.stringify(zero.body)).toBe(200)
    const r = await ask('or-none-left', { brief: aBrief('none-left', `Difficulty: ${QUICK}\n`) }, 0.1)
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    // The roll's own sentence comes first, in its own words (src/shared/casting-roll.ts), and the door's words follow it.
    const error = String(r.body['error'])
    const after = door.noWorkerRunCouldBeStarted(
      `${door.theDifficultyTheBriefMarks({ label: QUICK, line: 1 }, row.marked, [])} ${door.A_WORKER_IS_GIVEN_A_ROW_OF_ITS_LABEL}`,
      'or-none-left',
    )
    expect(error.endsWith(` ${after}`), error).toBe(true)
    expect(error.slice(0, -after.length - 1), error).toContain(String(row.marked))
    expect(theWorkerRunOf('or-none-left')).toBeUndefined()
  })

  it('refuses a label no row carries in the roll\'s own words, and does not take the marked row', async () => {
    const label = await aLabel('made-up-unserved-work')
    const r = await ask('or-unserved', { brief: aBrief('unserved', `Difficulty: ${label.name}\n`) }, 0.1)
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(String(r.body['error'])).toBe(door.noWorkerRunCouldBeStarted(noRowCarriesTheLabel(THE_WORKER, 'default', label.name), 'or-unserved'))
    expect(theWorkerRunOf('or-unserved')).toBeUndefined()
  })
})
