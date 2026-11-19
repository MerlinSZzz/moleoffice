// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** These cases exercise the historical eligibility boundary. Their synthetic runs are explicitly inventoried as legacy because new finishes now require a seal; new-finish sealing is tested separately. The original status and message assertions remain. */
/**
 * Eligibility is one decision on every trigger.
 * Measured before building at 1625e4a4: no shared predicate existed; only the selected
 * current inspector was excluded by automatic finish. Manual/assembly/verdict had no gate.
 * Mutation proof: after a green control, accept every facts object; all 15 refusal rows fail.
 */
import { describe, expect, it } from 'vitest'
import { THE_MODELS_START_VALUES } from '../src/config/model-efforts.mjs'
import { CHECK_FACTS, checkEligibility, noCheckSays, noCheckWords, type CheckEligibility } from '../src/shared/check-eligibility.ts'
const modelForTheLegacyInspector = Object.keys(THE_MODELS_START_VALUES)[0]!

export const combinations = Array.from({ length: 16 }, (_, bits) => ({
  bits: bits.toString(2).padStart(4, '0'),
  facts: Object.fromEntries(CHECK_FACTS.map((fact, index) => [fact, Boolean(bits & (1 << (3 - index)))])),
}))

describe('the pure eligibility decision', () => {
  it.each(combinations)('$bits', ({ facts }) => {
    const decision = checkEligibility(Object.freeze(facts))
    expect(decision.eligible).toBe(Object.values(facts).every((value) => value === true))
    expect(decision.code).toBe(decision.eligible ? 'CHECK_ELIGIBLE' : 'CHECK_NOT_ELIGIBLE')
    expect(decision.missing.map((one) => one.fact)).toEqual(CHECK_FACTS.filter((fact) => !facts[fact]))
    expect(decision.nextAct.length).toBeGreaterThan(0)
    expect(checkEligibility(facts)).toEqual(decision)
  })
  it.each([null, undefined, [], 'true', 1, {}])('refuses malformed input %j', (input) => {
    expect(checkEligibility(input).missing).toEqual(CHECK_FACTS.map((fact) => ({ fact, state: 'unknown' })))
  })
  it.each(CHECK_FACTS)('names unknown %s without treating it as false', (fact) => {
    for (const value of [null, undefined, 'true', 1, [], {}]) {
      const decision = checkEligibility({ ...combinations[15]!.facts, [fact]: value })
      expect(decision.eligible).toBe(false)
      expect(decision.missing).toEqual([{ fact, state: 'unknown' }])
      expect(decision.says).toContain('unknown')
    }
  })
})

import { afterAll, beforeAll, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { execFileSync } from 'node:child_process'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const workerActor = { type: 'agent' as const, id: 'eligibility-worker' }
const officeActor = { type: 'agent' as const, id: 'mole-office/the-api-server' }
const headers = (id: string) => ({
  'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id, 'x-mole-office-workspace': 'default',
})
const tip = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
let db: TestDb
/**
 * THE WORKER'S OWN KEY, the one the office answered when the worker was registered. A request that comes over a
 * socket ends a run as the run's own agent only with a key, even while the key window is open.
 */
let workerKey = ''

/** The registry id of the agent registered under this handle. A new agent's id is not its handle. */
function idOf(handle: string): string {
  const row = db.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `nothing is registered as ${handle}`).toBeDefined()
  return row!.id
}

let app: FastifyInstance
let inspection: typeof import('../src/server/lib/inspection.ts')
let predicate: typeof import('../src/shared/check-eligibility.ts')

async function register(handle: string, role = 'worker', workArea: string[] | null = ['src']) {
  const response = await app.inject({
    method: 'POST', url: '/api/agents/started',
    headers: { ...headers(THE_PERSON), 'x-mole-office-actor-type': 'human' },
    payload: { handle, name: handle, role, ...(workArea === null ? {} : { workArea }) },
  })
  expect(response.statusCode, response.body).toBe(201)
  return response.json().record as string
}

function run(extra: Record<string, unknown> = {}) {
  const data = Object.fromEntries(Object.entries({ state: 'running', servingAgent: workerActor.id, cutFrom: 'main', tip, ...extra }).filter(([, value]) => value !== undefined))
  // A RUN OF ANOTHER AGENT IS FILED BY THE OFFICE: since the filing door of round 30 a session for an agent is
  // filed only by that agent, those above it, the person proved, or the office, and the worker is none of them.
  const namesAnother = (data['servingAgent'] !== undefined && data['servingAgent'] !== workerActor.id) || data['ranAs'] !== undefined
  const filer = namesAnother ? officeActor : workerActor
  const made = db.api.createRecord({
    kind: 'session', title: 'Synthetic historical eligibility run', workspaceId: 'default', actor: filer, origin: 'fixture',
    data: { ...data, state: 'running' },
  })
  db.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(made.id)
  db.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), made.id)
  return made.id
}

beforeAll(async () => {
  db = await freshDb()
  inspection = await import('../src/server/lib/inspection.ts')
  predicate = await import('../src/shared/check-eligibility.ts')
  app = (await apiApp()).app
  await app.ready()
  await register('eligibility-starter', 'secretary', null)
  const response = await app.inject({
    method: 'POST', url: '/api/agents/started', headers: headers('eligibility-starter'),
    payload: { handle: workerActor.id, name: 'Eligibility worker', workArea: ['src'] },
  })
  expect(response.statusCode, response.body).toBe(201)
  workerKey = String(response.json().whatToGiveIt.key)
  await register('eligibility-inspector', 'inspector')
})
afterAll(async () => { await app.close(); db.close() })

const triggers = ['finish', 'retry', 'rework', 'manual', 'prompt', 'assembled', 'verdict'] as const
const triggerCases = [
  ...combinations,
  ...CHECK_FACTS.flatMap((fact) => [null, 'yes', 1, {}].map((value, index) => ({
    bits: 'unknown-' + fact + '-' + index,
    facts: { ...combinations[15]!.facts, [fact]: value } as Record<string, unknown>,
  }))),
]


describe('sixteen combinations at every server trigger', () => {
  for (const trigger of triggers) {
    it.each(triggerCases)(`${trigger} $bits`, async ({ facts }) => {
      const id = run()
      if (trigger === 'retry' || trigger === 'rework') {
        db.api.patchRecord(id, { dataPatch: { state: 'finished' } }, workerActor)
        inspection.theOfficeStartsTheCheck({ runId: id, workspaceId: 'default', actor: workerActor })
        if (trigger === 'rework') {
          const assembled = await app.inject({ method: 'POST', url: `/api/checks/${id}/assembled`, headers: headers('eligibility-inspector'), payload: { changes: [] } })
          expect(assembled.statusCode, assembled.body).toBe(201)
          const response = await app.inject({
            method: 'POST', url: `/api/checks/${id}`, headers: headers('eligibility-inspector'),
            payload: { verdict: 'refused', check: 'Synthetic refusal for a rework test.', missing: ['A test is missing.'], says: { chapter: 5 } },
          })
          expect(response.statusCode, response.body).toBe(201)
        }
      }
      // Some rows cannot arise in today's registry (no worker but a known area). Inject facts
      // at the pure boundary, then exercise actual routes. Storage resolution is proved below.
      const decide = predicate.checkEligibility
      const spy = vi.spyOn(predicate, 'checkEligibility').mockImplementation(() => decide(facts))
      const eligible = Object.values(facts).every((value) => value === true)
      const before = db.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message'").get()
      try {
        if (trigger === 'finish') {
          const response = await app.inject({
            method: 'PATCH', url: `/api/records/${id}`, headers: headers(workerActor.id),
            payload: { dataPatch: { state: 'finished' } },
          })
          expect(response.statusCode, response.body).toBe(200)
          expect(Boolean(response.json().theCheck.askedOf)).toBe(eligible)
        } else if (trigger === 'retry' || trigger === 'rework') {
          const result = inspection.theOfficeStartsTheCheck({ runId: id, workspaceId: 'default', actor: workerActor })
          expect(Boolean(result?.askedOf)).toBe(eligible)
          if (trigger === 'rework') expect(inspection.whereARunStands(db.api.getRecord(id)!).refused?.reworked !== null).toBe(eligible)
        } else {
          if (trigger === 'verdict' && eligible) {
            const assembled = await app.inject({ method: 'POST', url: `/api/checks/${id}/assembled`, headers: headers('eligibility-inspector'), payload: { changes: [] } })
            expect(assembled.statusCode, assembled.body).toBe(201)
          }
          const suffix = trigger === 'manual' ? '/eligibility' : trigger === 'verdict' ? '' : `/${trigger}`
          const response = await app.inject({
            method: trigger === 'manual' ? 'GET' : 'POST', url: `/api/checks/${id}${suffix}`,
            headers: headers('eligibility-inspector'),
            ...(trigger === 'manual' ? {} : { payload: trigger === 'verdict'
              ? { verdict: 'released', check: 'Synthetic eligible control.' } : { changes: [] } }),
          })
          expect(response.statusCode, response.body).toBe(trigger === 'manual' ? 200 : eligible ? trigger === 'prompt' ? 200 : 201 : 409)
          if (trigger === 'manual') expect(response.json()).toMatchObject(decide(facts))
          else if (!eligible) expect(JSON.parse(response.json().detail).eligibility).toEqual(decide(facts))
        }
        expect(spy).toHaveBeenCalled()
        if (!eligible) {
          expect(db.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message'").get()).toEqual(before)
          const stored = db.api.getRecord(id)!
          if (trigger !== 'rework') expect(stored.data['whatTheCheckWouldRead']).toBeUndefined()
          expect(stored.data['released']).toBeUndefined()
          if (['finish', 'retry'].includes(trigger)) expect(inspection.whereARunStands(stored).says).toContain('No check was asked for')
        }
      } finally { spy.mockRestore() }
    })
  }
})

describe('facts resolved from storage', () => {
  it('accepts the registered worker control and the recorded directory HEAD', () => {
    expect(inspection.checkEligibilityForRun(run(), 'default').eligible).toBe(true)
    const id = run({ tip: undefined, workingDirectory: process.cwd() })
    expect(inspection.checkEligibilityForRun(id, 'default').eligible).toBe(true)
  })
  it('refuses bookkeeping with no serving agent without sending requests', () => {
    const id = run({ servingAgent: undefined, state: 'finished' })
    const result = inspection.theOfficeStartsTheCheck({ runId: id, workspaceId: 'default', actor: workerActor })
    expect(result?.eligibility?.eligible).toBe(false)
    expect(result?.message).toBeUndefined()
    expect(result?.eligibility?.missing.map((one) => one.fact)).toContain('workerServed')
  })
  it('does not accept malformed tips or a missing HEAD', () => {
    for (const value of [undefined, 'not-a-commit', 'a'.repeat(39)]) {
      const decision = inspection.checkEligibilityForRun(run({ tip: value, workingDirectory: '/no/such/check/worktree' }), 'default')
      expect(decision.eligible).toBe(false)
      expect(decision.missing.map((one) => one.fact)).toContain('submittedTip')
    }
  })
  it('refuses a checker that is the worker, independently of target eligibility', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/checks/${run()}/eligibility`, headers: headers(workerActor.id) })
    expect(response.statusCode).toBe(403)
    expect(response.body).toContain('independent checker')
  })
  it('excludes both inspector holders and a retired holder', async () => {
    await register('eligibility-second-inspector', 'inspector')
    for (const servingAgent of ['eligibility-inspector', 'eligibility-second-inspector']) {
      expect(inspection.checkEligibilityForRun(run({ servingAgent }), 'default').missing).toContainEqual({ fact: 'noInspector', state: 'missing' })
    }
    db.client.sqlite.prepare('UPDATE agents SET retired = 1 WHERE handle = ?').run('eligibility-second-inspector')
    expect(inspection.checkEligibilityForRun(run({ servingAgent: 'eligibility-second-inspector' }), 'default').eligible).toBe(false)
  })
  it('excludes a former holder after its card and serving identity change', async () => {
    // THE CASE ABOVE RETIRED IT, and `agentByHandle` answers only a LIVE agent since criterion I3, so the
    // one row bearing the handle is read straight from the table.
    const agent = { id: idOf('eligibility-second-inspector') }
    const mapped = db.client.sqlite.prepare('SELECT record_id AS id FROM agent_records WHERE agent_id = ?').get(agent.id) as { id: string }
    db.api.patchRecord(mapped.id, { dataPatch: { role: 'worker' } }, { type: 'human', id: THE_PERSON })
    const id = run({ servingAgent: 'eligibility-second-inspector' })
    expect(inspection.checkEligibilityForRun(id, 'default').eligible).toBe(false)
    db.api.patchRecord(id, { dataPatch: { servingAgent: workerActor.id } }, officeActor)
    expect(inspection.checkEligibilityForRun(id, 'default').eligible).toBe(false)
  })
  it('treats role history that is not an object as unknown', async () => {
    await register('eligibility-unknown-history')
    const mapped = db.client.sqlite.prepare('SELECT record_id AS id FROM agent_records WHERE agent_id = ?').get(idOf('eligibility-unknown-history')) as { id: string }
    const saved = db.client.sqlite.prepare('SELECT seq, data FROM revisions WHERE record_id = ?').all(mapped.id) as { seq: number; data: string }[]
    try {
      // A JSON string, not text SQLite cannot read: since migration 0277 its run-key index refuses that write.
      db.client.sqlite.prepare("UPDATE revisions SET data = '\"broken json\"' WHERE record_id = ?").run(mapped.id)
      const decision = inspection.checkEligibilityForRun(run({ servingAgent: 'eligibility-unknown-history' }), 'default')
      expect(decision.missing).toContainEqual({ fact: 'noInspector', state: 'unknown' })
    } finally {
      for (const row of saved) db.client.sqlite.prepare('UPDATE revisions SET data = ? WHERE record_id = ? AND seq = ?').run(row.data, mapped.id, row.seq)
    }
  })
})

import { sayInEnglish, createI18n } from '../src/shared/i18n.ts'
import { whyNoCheckWasStartedIn } from '../src/shared/releasing.ts'
import { ROUND_LAUNCHER_RUNTIME } from '../src/shared/next-round.ts'
import { MERGE_TOOL_RUNTIME } from '../src/shared/merge-queue.ts'

/**
 * THE NOTE ON A RUN WITH NO MODEL NAMES ONLY THE ACTS THAT APPLY TO IT.
 *
 * A launcher run and a merge tool run run no model and serve no worker, so no act can name the
 * worker they serve, register that worker's area, or submit their own run for a check. The office
 * writes their note from their runtime, the missing facts stay on it, and the check panel says the
 * same sentence again in the page's language. An ordinary run, whose runtime runs a model, keeps
 * every act of its missing facts, byte for byte as today.
 */
describe('the note on a run that runs no model', () => {
  const WORKER_SERVED_ACT = 'Name the registered worker this run serves.'
  const REGISTERED_AREA_ACT = 'Register the worker’s work area.'
  const SUBMITTED_TIP_ACT = 'Record a working directory with a resolvable Git HEAD, or a cutFrom and tip.'
  const NO_INSPECTOR_ACT = 'Submit the worker’s run; an inspector’s own run cannot be checked.'
  const ACTS_THAT_CANNOT_APPLY = [WORKER_SERVED_ACT, REGISTERED_AREA_ACT, NO_INSPECTOR_ACT]

  /** A run made by the file's own helper, finished, with the office's refusal written onto it. */
  function aRefusedFinish(extra: Record<string, unknown>): string {
    const id = run({ state: 'finished', ...extra })
    const result = inspection.theOfficeStartsTheCheck({ runId: id, workspaceId: 'default', actor: workerActor })
    expect(result?.eligibility?.eligible, JSON.stringify(result?.eligibility)).toBe(false)
    return id
  }

  function theStoredCheck(id: string): { says: string; eligibility: CheckEligibility } {
    const stored = db.api.getRecord(id)
    expect(stored, `run ${id} is not stored`).not.toBeNull()
    return stored!.data['theCheck'] as unknown as { says: string; eligibility: CheckEligibility }
  }

  it.each([
    ['a launcher run', ROUND_LAUNCHER_RUNTIME],
    ['a merge tool run', MERGE_TOOL_RUNTIME],
  ])('%s stores only the acts that apply, and the page says it again in both languages', (_name, runtime) => {
    const id = aRefusedFinish({
      servingAgent: undefined, runtime, startedByMoleOffice: true, workingDirectory: process.cwd(),
    })
    const check = theStoredCheck(id)
    // THE MISSING FACTS ARE STILL TRUE AND STILL LISTED; only their acts are left out.
    expect(check.eligibility.missing.map((one) => one.fact)).toEqual(['workerServed', 'registeredArea', 'noInspector'])
    expect(check.eligibility.nextAct).toBe('')
    for (const act of ACTS_THAT_CANNOT_APPLY) expect(check.says).not.toContain(act)
    // THE NOTE IS THE FIRST SENTENCE ALONE: no sentence gap after it and no empty act.
    expect(check.says.endsWith('.')).toBe(true)
    expect(check.says).toBe(noCheckSays(check.eligibility.missing, sayInEnglish, true))
    // THE PAGE REBUILDS THE SAME SENTENCE FROM THE RUN'S OWN DATA, in English and in Chinese.
    const data = db.api.getRecord(id)!.data
    expect(whyNoCheckWasStartedIn(data, sayInEnglish)).toEqual({ says: check.says, composed: true })
    const chinese = createI18n('zh').t
    expect(whyNoCheckWasStartedIn(data, chinese)).toEqual({
      says: noCheckSays(check.eligibility.missing, chinese, true), composed: true,
    })
    expect(whyNoCheckWasStartedIn(data, chinese)!.says).toContain('没有请求检查')
  })

  it('names the tip act and no other when a launcher run also lacks a resolvable HEAD', () => {
    const id = aRefusedFinish({
      servingAgent: undefined, runtime: ROUND_LAUNCHER_RUNTIME, startedByMoleOffice: true,
      workingDirectory: '/no/such/eligibility/worktree', tip: undefined, cutFrom: undefined,
    })
    const check = theStoredCheck(id)
    expect(check.eligibility.missing.map((one) => one.fact)).toEqual(['workerServed', 'registeredArea', 'submittedTip', 'noInspector'])
    expect(check.eligibility.nextAct).toBe(SUBMITTED_TIP_ACT)
    expect(check.says).toContain(SUBMITTED_TIP_ACT)
    for (const act of ACTS_THAT_CANNOT_APPLY) expect(check.says).not.toContain(act)
    expect(check.says).toBe(noCheckSays(check.eligibility.missing, sayInEnglish, true))
  })

  it('keeps every act on an ordinary run, byte for byte, with no kind read', () => {
    const id = aRefusedFinish({
      servingAgent: undefined, runtime: 'claude-code', model: 'synthetic-model', workingDirectory: process.cwd(),
    })
    const check = theStoredCheck(id)
    expect(check.eligibility.missing.map((one) => one.fact)).toEqual(['workerServed', 'registeredArea', 'noInspector'])
    expect(check.says).toBe(noCheckSays(check.eligibility.missing, sayInEnglish))
    expect(check.says).toContain(WORKER_SERVED_ACT)
    expect(check.says).toContain(REGISTERED_AREA_ACT)
    expect(check.eligibility.nextAct).toBe(noCheckWords(check.eligibility.missing, sayInEnglish).nextAct)
    expect(check.eligibility.nextAct.length).toBeGreaterThan(0)
  })
})

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectionApiWaitMilliseconds, inspectionOfficeBackMilliseconds } from '../src/config/inspection.mjs'
import { THE_MOST_RECORDS_A_CHECK_CARRIES } from '../src/config/check-records.mjs'
import { THE_MOST_DECISIONS_A_CHECK_CARRIES } from '../src/config/check-records.mjs'
import { NOT_READ_BY_THE_PLUGIN_RULE, thePluginRuleOf } from '../src/shared/plugin-change.ts'
import { theModelsEnvironmentOnTheHost } from '../tools/inspector-sandbox.mjs'
import { stampEachLine } from '../tools/inspector-log-times.mjs'
import { TEST_BATCH_POOL } from '../tools/test-batch-seat.mjs'
import { aCommandsStartValues } from '../tools/sandbox-common.mjs'
import { withoutTheProvider } from '../src/config/model-efforts.mjs'
import { HOW_EACH_COMMAND_TAKES_AN_EFFORT } from '../src/config/how-a-command-takes-an-effort.mjs'
import { theWorktreesFolder } from '../src/config/sandbox-folder.mjs'
import { aMadeUpCheckSession } from './inspector-tool-fixture.ts'
import { TWELVE_ID_CHARACTERS } from '../src/shared/messages.ts'
import { theCheckBeganAsking, theCheckFinishedAsking } from '../src/config/a-checks-seat-wait.mjs'
import { aCommandWithTheHarnessFeaturesOff } from '../tools/harness-features-off.mjs'
import { THE_YESES_OPTIONS, theYesesOptionsAreIgnored } from '../src/config/inspection-ending.mjs'

/**
 * EVERY NAME THE INSPECTOR IMPORTS, read from its own import lines, with the module each comes from. The case runs the
 * tool with those lines taken out, so a name it imports and the case does not bind would otherwise be a bare
 * ReferenceError in every case at once (the merge queue's bounce of 21 October 2026: 32 of them).
 */
function theNamesTheInspectorImports(source: string): { name: string; from: string }[] {
  return [...source.matchAll(/^import .* from .*$/gm)].flatMap(([line]) => {
    const named = /^import \{([^}]*)\} from '([^']+)'$/.exec(line)
    if (named === null) throw new Error(`tools/the-inspector.mjs has an import line this case cannot read: ${line}`)
    return named[1]!.split(',').map((one) => one.trim()).filter((one) => one !== '')
      .map((one) => ({ name: one.split(/\s+as\s+/).pop()!, from: named[2]! }))
  })
}

/** A STAND-IN FOR AN IMPORT THE CASE DOES NOT BIND: any use of it throws, naming the import and where to bind it. */
function notBoundHere(name: string, from: string): unknown {
  const refuse = (): never => {
    throw new Error(
      `tools/the-inspector.mjs used ${name}, which it imports from ${from}, and this synthetic boundary binds no stand-in for it. ` +
        'Bind one in the imports of "the actual manual tool before worktree and model allocation" in tests/check-eligibility.test.ts.',
    )
  }
  return new Proxy(function notBound() {}, { apply: refuse, construct: refuse, get: refuse })
}

describe('the actual manual tool before worktree and model allocation', () => {
  it.each(triggerCases)('manual allocation $bits', async ({ facts }) => {
    // Evaluate the shipped tool unchanged except for binding its imports to spies. No process,
    // network request, file write, or model call can escape this dependency boundary. An import
    // the case does not bind gets a stand-in that fails by name when the tool uses it.
    const shipped = readFileSync(new URL('../tools/the-inspector.mjs', import.meta.url), 'utf8')
    const source = shipped
      .replace(/^import .* from .*\n/gm, '')
      .replace(/\bimport\.meta\.url\b/g, 'theInspectorsOwnUrl')
    const decision = checkEligibility(facts)
    const allocatedModel = new Error('model allocation observed')
    const exited = new Error('tool exited before allocation')
    const spawn = vi.fn(() => { throw allocatedModel })
    const git = vi.fn((_program: string, args: string[]) => args.includes('rev-parse') ? tip + '\n' : '')
    const output: string[] = []
    const startCheck = vi.fn()
    const ask = vi.fn(async (url: string) => {
      let reply: unknown = {}
      if (url.endsWith('/eligibility')) reply = decision
      else if (url.endsWith('/prompt')) reply = { prompt: 'Synthetic prompt', chaptersAt: [], changes: { inside: [], outside: [] } }
      else if (url.endsWith('/assembled')) reply = { whatTheCheckWouldRead: { at: '2026-09-08 12:00:00' } }
      // THE MODEL DOOR, criterion U2: started with no --model, the tool asks the office which model
      // the check gets before it reads anything else.
      else if (url.includes('/api/office/run-models/for/')) reply = { runtime: 'claude-code', model: modelForTheLegacyInspector, says: 'The synthetic office names it.' }
      else reply = { title: 'Synthetic manual test', workArea: ['src'], checkout: { cutFrom: 'main' } }
      return { ok: true, text: async () => JSON.stringify(reply) }
    })
    const imports = {
      transientToolContext: () => ({}), theWorktreesFolder,
      // The real record-id pattern the tool anchors before it asks the office anything.
      TWELVE_ID_CHARACTERS,
      // import.meta CANNOT STAND IN A FUNCTION BODY, so the tool's own URL is bound by name as each import is: the tool
      // finds the dsh check's client beside itself with it (wave 13n). A URL only names a path, so no file is read.
      fileURLToPath, theInspectorsOwnUrl: new URL('../tools/the-inspector.mjs', import.meta.url).href,
      refuseToRemoveIfAnybodyIsIn: vi.fn(), whoStillUses: () => 'not asked in this synthetic run',
      spawn, execFileSync: git, existsSync: () => false, mkdirSync: vi.fn(), realpathSync: vi.fn(), symlinkSync: vi.fn(),
      homedir: () => '/synthetic-home', dirname, join, whereIsTheApi: () => 'http://synthetic.invalid', whichWorkspace: () => 'default',
      aCommandsStartValues, withoutTheProvider,
      // THE ONE TABLE OF HOW A COMMAND TAKES AN EFFORT, read by the check command builder (wave 13n round CC).
      HOW_EACH_COMMAND_TAKES_AN_EFFORT,
      inspectionSettings: () => ({ model: modelForTheLegacyInspector, minutes: 40 }), inspectionApiWaitMilliseconds: () => inspectionApiWaitMilliseconds({}), randomUUID: () => 'fixture-check', insideTheWorkArea: () => true, fetch: ask,
      // Tj0gSo-y1I6h: bind the new setting reader to this explicit synthetic environment too.
      inspectionOfficeBackMilliseconds: () => inspectionOfficeBackMilliseconds({}),
      // THE TWO THE TOOL GAINED WHEN IT STARTED SENDING THE OFFICE'S KEY. Criterion P83, point 5.
      // Bound to a stub rather than the real reader, so this synthetic boundary still reads no file:
      // with no key the request is exactly what it was before. `KEY_HEADER` is the name it travels on.
      theOfficeKey: () => ({ key: null, says: null }), KEY_HEADER: 'x-mole-office-key',
      // THE ENVIRONMENT THE OFFICE'S KEY FILE IS FOUND FROM, when the tool was started with no database (wave 13n): the
      // tool hands it to theOfficeKey. Bound to an empty one, because the real bootstrapEnvironment reads the checkout's
      // .env and the stub above reads nothing it is given.
      bootstrapEnvironment: () => ({}),
      // THE TWO THE TOOL GAINED WHEN IT STARTED WRITING THE RECORDS ITS MODEL READS (problem YxzFRQIpx9Pz), before the
      // prompt is assembled. Bound to spies, so this boundary still writes no file.
      rmSync: vi.fn(), writeFileSync: vi.fn(),
      THE_MOST_RECORDS_A_CHECK_CARRIES,
      THE_MOST_DECISIONS_A_CHECK_CARRIES,
      // THE MODEL'S ENVIRONMENT ON THE HOST (problem YjMHEkMQkjAX): the real one, which only reads the object it is given.
      theModelsEnvironmentOnTheHost,
      // THE STAMPER THE TOOL SWITCHES ON AT ITS TOP (round CG): the real one, over this synthetic process's plain write
      // functions. It reads the clock and writes only to those streams.
      stampEachLine,
      // THE PLUGIN RULE, in wave 13x round 17: the real one, which only reads the paths it is
      // given, so this boundary still reads no file.
      NOT_READ_BY_THE_PLUGIN_RULE, thePluginRuleOf,
      // THE YESES OPTIONS AN OLDER OFFICE GIVES, which the tool reads before the allocation to say it ignores them: the
      // real list and the real line, which only read the options they are given.
      THE_YESES_OPTIONS, theYesesOptionsAreIgnored,
      // THE MODEL'S WINDOW, which the tool notes just before it allocates the model so it can count what
      // the model wrote into the office (acceptance finding 44). Bound to a fixed
      // stamp, as every other import here is bound to a stand-in.
      nowStamp: () => '2026-09-08 12:00:00',
      // THE TWO LINES THE TOOL WRITES AROUND ITS QUESTION FOR A TEST-BATCHES SEAT (wave 13n), before the model starts:
      // the real words, which only read the instant they are given, and the tool's clock bound to the same fixed moment.
      clockStamp: () => ({ stamp: '2026-09-08 12:00:00', instant: '2026-09-08T12:00:00.000+00:00', offset: '+00:00', timeZone: 'UTC' }),
      theCheckBeganAsking, theCheckFinishedAsking,
      // THE GUARDED GIT (tools/sandbox-git.mjs), through which the tool now starts every git command on a checkout a
      // run can write. Bound to the same spy as execFileSync, so the worktree it cuts is still counted and no process
      // starts.
      guardedGit: (_at: string, args: string[]) => String(git('git', args)).trim(),
      guardedGitBytes: (_at: string, args: string[]) => Buffer.from(String(git('git', args))),
      guardedGitRun: (_at: string, args: string[]) => ({ status: 0, stdout: String(git('git', args)), stderr: '' }),
      outsideTheCommitInLines: () => '',
      // THE PHOTOGRAPHS OF THE CHECK'S TWO TREES (tools/inspector-photographs.mjs), which the tool reads before its model
      // starts. Bound to stand-ins that say each tree is the commit, as the git spy does, so no thread or process starts.
      aPhotographOf: () => ({ head: tip, dirty: '' }),
      aPhotographBegun: async () => ({ head: tip, dirty: '' }),
      // THE START CHECK (wave 13q), which stops a stable checkout started without the pairing. Bound to a spy, because
      // the real one starts git to read the checkout's tag.
      stopAnUnpairedStableStart: startCheck,
      // THE SWITCH THAT TURNS THE HARNESS'S OWN SUBAGENTS AND WORKFLOWS OFF (tools/harness-features-off.mjs), which the
      // tool puts onto the model's command: the real one, which only reads the command it is given.
      aCommandWithTheHarnessFeaturesOff,
      // THE TEST-BATCHES SEAT (tools/test-batch-seat.mjs) the check's model is started with. Bound to a stand-in that
      // answers no seat, so this boundary still asks no office and starts no process.
      TEST_BATCH_POOL,
      aTestBatchSeat: async () => ({ giveBack: () => {}, id: null, askedAt: null, grantedAt: null, givenBackAt: null, why: 'no seat is asked for here.', whyNotGivenBack: null }),
      process: {
        // --on-the-host: the allocation watched here is the host's `spawn`; a check in a sandbox is
        // tests/the-inspector-builds-and-runs-its-model-in-a-sandbox.test.ts, which asks the same question of it.
        argv: ['node', 'the-inspector.mjs', '--run', 'synthetic-run', '--as', 'checker', '--check', aMadeUpCheckSession(), '--against', 'main', '--on-the-host'],
        cwd: () => '/synthetic-worker', env: {}, on: vi.fn(),
        stdout: { write: (text: string) => output.push(text) }, stderr: { write: (text: string) => output.push(text) },
        exit: () => { throw exited },
      },
    }
    const notBound = theNamesTheInspectorImports(shipped).filter(({ name }) => !(name in imports))
    expect(theNamesTheInspectorImports(shipped).filter(({ from }) => from.endsWith('/check-records.mjs')).every(({ name }) => name in imports)).toBe(true)
    const bound = { ...Object.fromEntries(notBound.map(({ name, from }) => [name, notBoundHere(name, from)])), ...imports }
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
    const execute = new AsyncFunction(...Object.keys(bound), source)
    await expect(execute(...Object.values(bound))).rejects.toBe(exited)
    expect(startCheck).toHaveBeenCalledTimes(1)
    const worktrees = git.mock.calls.filter(([, args]) => args.includes('worktree') && args.includes('add'))
    expect(worktrees.length).toBe(decision.eligible ? 1 : 0)
    expect(spawn).toHaveBeenCalledTimes(decision.eligible ? 1 : 0)
    if (!decision.eligible) {
      expect(git).not.toHaveBeenCalled()
      expect(ask).toHaveBeenCalledTimes(1)
      expect(output.join('')).toContain('CHECK_NOT_ELIGIBLE')
      expect(output.join('')).toContain(decision.nextAct)
    }
  })
})

import { liveApp, waitForThePage } from './helpers.ts'
import { testShots } from './where-shots-go.ts'

/**
 * WHERE THE PICTURES GO: a folder of this file's own under the system's temporary folder, deleted
 * after the file's tests, or a folder under the one TEST_SHOTS names, which is kept. Never a fixed
 * path in this checkout's .logs/, where two runs would write over each other (problem x25LcNeJ7RFi).
 * Playwright makes the folder when it takes the first picture.
 */
const SHOTS = testShots('check-eligibility')

it('shows the refused finish and its next act in the browser at four widths and both themes', async () => {
  const world = await liveApp({ name: 'check-eligibility', viewport: { width: 1440, height: 1000 }, database: db.file })
  const id = run({ servingAgent: undefined, tip: undefined, cutFrom: undefined })
  const shots = SHOTS
  try {
    // ONE THEME, TWO WIDTHS. The refused finish does not change with the colour scheme.
    for (const theme of ['light'] as const) {
      for (const width of [1440, 390]) {
        await world.page.setViewportSize({ width, height: 1000 })
        await world.page.emulateMedia({ colorScheme: theme })
        await world.page.goto(`${world.site}/#/r/${id}`, { waitUntil: 'domcontentloaded' })
        await waitForThePage(world.page)
        await world.page.screenshot({ path: join(shots, `before-${width}-${theme}.png`), fullPage: true })
      }
    }
    const finished = await fetch(`${world.api}/api/records/${id}`, {
      method: 'PATCH', headers: { ...headers(workerActor.id), 'x-mole-office-key': workerKey, 'content-type': 'application/json' },
      body: JSON.stringify({ dataPatch: { state: 'finished' } }),
    })
    expect(finished.status, await finished.text()).toBe(200)
    for (const theme of ['light'] as const) {
      for (const width of [1440, 390]) {
        await world.page.setViewportSize({ width, height: 1000 })
        await world.page.emulateMedia({ colorScheme: theme })
        await world.page.reload({ waitUntil: 'domcontentloaded' })
        await waitForThePage(world.page)
        const panel = world.page.locator('.chk')
        expect(await panel.locator('.chk-word').textContent()).toBe('Check not started')
        const words = await panel.textContent()
        expect(words).toContain('No check was asked for')
        expect(words).toContain('Name the registered worker')
        expect(words).not.toContain('Nobody holds the inspector card')
        expect(await world.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await world.page.screenshot({ path: join(shots, `after-${width}-${theme}.png`), fullPage: true })
      }
    }
  } finally { await world.stop() }
}, 120_000)

it('checks every durable binding even when servingAgent names a worker', () => {
  const row = db.client.sqlite.prepare('SELECT record_id AS id FROM agent_records WHERE agent_id = ?').get(idOf('eligibility-inspector')) as { id: string }
  const id = run({ ranAs: [{ workspaceId: 'default', agentId: row.id }] })
  expect(inspection.checkEligibilityForRun(id, 'default').missing).toContainEqual({ fact: 'noInspector', state: 'missing' })
  const stored = db.api.getRecord(run())!
  expect(inspection.resolveCheckEligibilityFacts({ ...stored, data: { ...stored.data, ranAs: 'broken' } }).noInspector).toBeNull()
})

it('keeps a missing history unknown when another mapped record has readable history', async () => {
  await register('eligibility-partial-history')
  db.client.sqlite.prepare('INSERT INTO agent_records (record_id, agent_id) VALUES (?, ?)').run('synthetic-mapping-without-revisions', idOf('eligibility-partial-history'))
  expect(inspection.checkEligibilityForRun(run({ servingAgent: 'eligibility-partial-history' }), 'default').missing)
    .toContainEqual({ fact: 'noInspector', state: 'unknown' })
})

it('remembers the purpose of an earlier check request after its target is reworked', () => {
  const target = run({ state: 'finished' })
  const first = inspection.theOfficeStartsTheCheck({ runId: target, workspaceId: 'default', actor: workerActor })!
  expect(first.message).toBeTruthy()
  db.api.patchRecord(target, { dataPatch: { theCheck: { ...first, message: 'synthetic-later-request' } } }, officeActor)
  const id = run({ deliveringMessage: first.message })
  expect(inspection.checkEligibilityForRun(id, 'default').missing).toContainEqual({ fact: 'noInspector', state: 'missing' })
})

import { mkdtempSync, writeFileSync, rmSync, readdirSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { recordedHead } from '../src/server/lib/check-tip.ts'

function gitFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'mole-office-eligibility-git-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Synthetic test')
  git('config', 'user.email', 'test@example.invalid')
  writeFileSync(join(directory, 'work.txt'), 'Synthetic submitted work.\n')
  git('add', 'work.txt')
  git('commit', '-qm', 'Synthetic submitted commit')
  return { directory, git, head: git('rev-parse', 'HEAD'), close: () => rmSync(directory, { recursive: true, force: true }) }
}

it('resolves Git loose, packed, and detached worktree HEADs without starting a server process', () => {
  const repo = gitFixture()
  try {
    expect(recordedHead(repo.directory)).toBe(repo.head)
    const detached = join(repo.directory, 'detached')
    repo.git('worktree', 'add', '--detach', detached, repo.head)
    expect(recordedHead(detached)).toBe(repo.head)
    repo.git('worktree', 'remove', detached)
    repo.git('gc', '--prune=now')
    expect(recordedHead(repo.directory)).toBe(repo.head)
    const packDirectory = join(repo.directory, '.git', 'objects', 'pack')
    const pack = join(packDirectory, readdirSync(packDirectory).find((name) => name.endsWith('.pack'))!)
    const bytes = readFileSync(pack)
    chmodSync(pack, 0o600)
    writeFileSync(pack, bytes.subarray(0, 24))
    expect(() => recordedHead(repo.directory)).toThrow(`Git object ${repo.head} could not be read`)
    const decision = inspection.checkEligibilityForRun(run({ workingDirectory: repo.directory, tip: repo.head }), 'default')
    expect(decision.eligible).toBe(false)
    expect(decision.says).toContain(`Git object ${repo.head} could not be read`)
  } finally { repo.close() }
})

it('refuses Git missing objects, cyclic refs, blobs and malformed storage as unknown', () => {
  const repo = gitFixture()
  try {
    const headFile = join(repo.directory, '.git', 'HEAD')
    writeFileSync(headFile, 'a'.repeat(40) + '\n')
    expect(recordedHead(repo.directory)).toBeNull()
    writeFileSync(headFile, 'ref: refs/heads/loop\n')
    writeFileSync(join(repo.directory, '.git', 'refs', 'heads', 'loop'), 'ref: refs/heads/loop\n')
    expect(recordedHead(repo.directory)).toBeNull()
    const blob = repo.git('hash-object', '-w', 'work.txt')
    writeFileSync(headFile, blob + '\n')
    expect(recordedHead(repo.directory)).toBeNull()
    writeFileSync(headFile, 'not a ref\n')
    expect(recordedHead(repo.directory)).toBeNull()
    expect(recordedHead('relative/path')).toBeNull()
    expect(recordedHead(join(repo.directory, 'missing'))).toBeNull()
  } finally { repo.close() }
})

/**
 * THE HOOK'S OWN FILING. A session record is written before the session knows which agent it works
 * as, and the agent's name is patched in later. Run gn3WRiJlyfvU on 9 September 2026 had 38
 * revisions, the first naming no servingAgent and no ranAs, every one of them written by that agent; the
 * check read that first revision as "nobody" and the whole history as unknown, and never started.
 * The writer of a revision is a recorded fact, and a nameless revision is read by its writer.
 */
describe('a first revision that names nobody', () => {
  const fileARun = (actor: { type: 'agent'; id: string }) => {
    const made = db.api.createRecord({
      kind: 'session', title: 'A run filed before it knew its agent', workspaceId: 'default', actor, origin: 'fixture',
      data: { state: 'running', cutFrom: 'main', tip },
    })
    db.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(made.id)
    db.api.patchRecord(made.id, { dataPatch: { servingAgent: workerActor.id } }, officeActor)
    return db.api.getRecord(made.id)!
  }
  it('is read by its writer: the worker wrote it, and the worker is no inspector', () => {
    expect(inspection.resolveCheckEligibilityFacts(fileARun(workerActor)).noInspector).toBe(true)
  })
  it('says nothing when a program that is no agent record wrote it, as the hook does', () => {
    expect(inspection.resolveCheckEligibilityFacts(fileARun({ type: 'agent', id: 'claude-code' })).noInspector).toBe(true)
  })
  it('is read by its binding when ranAs names the agent before servingAgent does, as the hold writes it', () => {
    // seq 2 to 6 of that run: the handle hold had written ranAs, the name was not yet patched in, and the
    // absent name was read as "nobody" beside the binding, which made those revisions unknown.
    const bound = db.client.sqlite.prepare('SELECT record_id FROM agent_records WHERE agent_id = ?').get(idOf(workerActor.id)) as { record_id: string }
    // FILED BY A PROGRAM THAT IS NO AGENT RECORD, NAMING NOBODY; THE OFFICE THEN WRITES THE BINDING, AND THEN THE NAME.
    // The agent's program wrote the binding itself; since the filing door of round 30 a program that is no agent may not
    // write an agent onto a session, so the binding's revision is the office's here. It is still a revision that
    // names the agent only through ranAs, which is what this case reads.
    const made = db.api.createRecord({
      kind: 'session', title: 'A run bound before it was named', workspaceId: 'default', actor: { type: 'agent', id: 'claude-code' }, origin: 'fixture',
      data: { state: 'running', cutFrom: 'main', tip },
    })
    db.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(made.id)
    db.api.patchRecord(made.id, { dataPatch: { ranAs: [{ workspaceId: 'default', agentId: bound.record_id }] } }, officeActor)
    db.api.patchRecord(made.id, { dataPatch: { servingAgent: workerActor.id } }, officeActor)
    expect(inspection.resolveCheckEligibilityFacts(db.api.getRecord(made.id)!).noInspector).toBe(true)
  })
  it('still turns the history unknown when the writer is no better known than the snapshot', () => {
    const made = db.api.createRecord({
      kind: 'session', title: 'A run bound to an agent nothing answers to', workspaceId: 'default', actor: workerActor, origin: 'fixture',
      data: { state: 'running', cutFrom: 'main', tip, ranAs: [{ workspaceId: 'default', agentId: 'no-such-agent-record' }] },
    })
    db.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(made.id)
    db.api.patchRecord(made.id, { dataPatch: { servingAgent: workerActor.id } }, officeActor)
    expect(inspection.resolveCheckEligibilityFacts(db.api.getRecord(made.id)!).noInspector).toBeNull()
  })
})

/**
 * A CARD THAT REGISTERS NOTHING IS NOT HELD BACK FOR WANT OF AN AREA — problem XivYfQN8RLQz.
 *
 * Three doors ask whether an agent needs a registered work area. The claims door and the work-area
 * door were mended first; this gate was the third, and until it was mended a secretary's run was
 * held back for want of an area its own card forbids it to register, with `nextAct` telling somebody
 * to go and register one. Nothing could carry that act out, so the run could never be checked.
 *
 * The answer is read from the card, in `aRoleNeedsARegisteredWorkArea`, which is the one place all
 * three doors now ask. `eligibility-starter` is registered in this file's `beforeAll` as a secretary
 * with no area at all, so it is the real row and not a synthetic one.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, AFTER A GREEN CONTROL
 * ---------------------------------------------------------------------------------------
 * Control: both cases green on the unmutated tree.
 *   · force `cardNeedsNoArea` to false in src/server/lib/inspection.ts → the first case goes red,
 *     because the secretary's run is held back again for a missing area.
 * The second case is what stops that mutation being fixed by satisfying the fact for everybody: a
 * worker with no area must still be held back, and that is the behaviour P93 is built on.
 */
describe('a card that registers nothing needs no work area to be checked', () => {
  it('does not hold back a run served by a secretary that registered no area', async () => {
    const facts = inspection.resolveCheckEligibilityFacts(db.api.getRecord(run({ servingAgent: 'eligibility-starter' }))!)
    expect(facts.registeredArea, 'the card requires no area, so the fact is satisfied and not missing').toBe(true)
    const decision = inspection.checkEligibilityForRun(run({ servingAgent: 'eligibility-starter' }), 'default')
    expect(decision.missing.map((one) => one.fact)).not.toContain('registeredArea')
    expect(decision.nextAct).not.toContain('Register the worker’s work area.')
  })
  it('still holds back a worker that registered no area, so this is no blanket weakening', async () => {
    await register('eligibility-worker-no-area', 'worker', null)
    const facts = inspection.resolveCheckEligibilityFacts(db.api.getRecord(run({ servingAgent: 'eligibility-worker-no-area' }))!)
    expect(facts.registeredArea, 'a worker card requires an area, and none was registered').not.toBe(true)
    const decision = inspection.checkEligibilityForRun(run({ servingAgent: 'eligibility-worker-no-area' }), 'default')
    expect(decision.missing.map((one) => one.fact)).toContain('registeredArea')
  })
})
