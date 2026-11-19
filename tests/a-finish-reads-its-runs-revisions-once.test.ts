// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FINISHING WRITE READS ITS RUN'S REVISIONS ONCE, AND ONLY THE FIELDS THE CHECK USES.
 *
 * `resolveCheckEligibilityFacts` in src/server/lib/inspection.ts reads every revision of a run to say whether an
 * inspector ever served it or wrote it (`noInspector`). A finishing write asks it again and again, through
 * `runSubmitsWork` in src/server/lib/sealed-tip.ts: once in the reminder before the seal, and at the gate and at the seal
 * of each pass. Each ask read every revision whole, so one sealing send read the run's whole history about six times.
 *
 * WHAT IS KEPT. Inside a finishing write, the first ask reads only the fields the check uses, and its rows are kept for
 * that request alone. Each later ask checks that the newest kept row is still stored, and then reads only the rows after
 * it. Outside a finishing write the facts are read as they always were.
 *
 * WHAT THIS FILE PROVES.
 * A. In the sealing send of a keyed run, the run's revisions are read once with every row, and every later ask inside
 *    the write reads only the newer rows. A whole read of the history comes only after the write's passes, where the
 *    office starts the check.
 * B. Inside a finishing write and outside one, the facts are the same, and `noInspector` is what the code before this
 *    change gave, for a run whose history holds one of these revisions: malformed JSON; JSON that is not an object;
 *    `ranAs: null`; `servingAgent` present but empty; one that names nobody, written by the worker, and one written by
 *    the inspector; the inspection purpose in `extra.purpose`; a key written twice, at the top, in `extra`, and `extra`
 *    itself; a key written with an escape; one nested deeper than SQLite reads JSON; a binding to the inspector;
 *    `servingAgentId` naming the inspector; and `deliveringMessage` naming no message. Outside the write the facts are
 *    read by the whole read and never by the kept one; inside, by the kept one alone.
 * C. A run whose revisions name no agent gains a revision written by the inspector inside the write, as a finishing
 *    write by an inspector saves one after the gate and the seal have asked. Each ask after that revision sees it, and so
 *    does the check's own read after the write, which reads the whole history as before.
 * D. A revision a nested transaction wrote and rolled back is not kept: the next ask reads the revision that took its
 *    number instead.
 *
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST:
 * 1. In `theRevisionsTheCheckReads` (src/server/lib/inspection.ts), keep nothing, so each ask reads every row: A red.
 * 2. In src/server/lib/before-the-seal.ts, ask `runSubmitsWork` without `asAStepOfThisFinish`: A red, as the reminder
 *    reads the whole history before the passes.
 * 3. Take `purpose` out of the fields of `extra` the check reads: B red.
 * 4. Build every snapshot from the fields, also when a field is written twice: B red.
 * 5. After the newest kept row is found still stored, add no newer rows: C red.
 * 6. Take out the check that the newest kept row is still stored: D red.
 *
 * Every agent, run and revision is made up, the repository is a made-up one in this file's own temporary folder, and
 * the office database is this file's own. Nothing reaches the live server.
 */
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InOnePass } from '../src/server/lib/a-finish-reads-git-apart.ts'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { aReportInForm } from './a-run-in-form.ts'
import { aRepository, asAgent, git, theOfficesCheckers, THE_INSPECTOR, WORKSPACE } from './a-seal-read-fixture.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'

/** Every statement the database is handed while `capturing` is true. */
const observed = vi.hoisted(() => ({ capturing: false, statements: [] as string[] }))
vi.mock('better-sqlite3', async (importOriginal) => {
  const actual = await importOriginal<{ default: typeof import('better-sqlite3') }>()
  return {
    default: new Proxy(actual.default, {
      construct(target, args) {
        const options = args[1] as { verbose?: (statement: string) => void } | undefined
        return Reflect.construct(target, [args[0], {
          ...options,
          verbose(statement: string) {
            if (observed.capturing) observed.statements.push(statement)
            options?.verbose?.(statement)
          },
        }])
      },
    }),
  }
})

const OFFICE_KEY = randomBytes(32).toString('hex')
const AS_THE_OFFICE_WORKER = { ...asAgent(THE_MESSAGE_WORKER_ID), 'x-mole-office-key': OFFICE_KEY }
/** One more level of nesting than SQLite's JSON functions read: `json_valid` says no, and `JSON.parse` reads it. */
const TOO_DEEP = 1001

/**
 * THE TIME A CASE IS GIVEN. Case A files a keyed run and seals it through the server, and case B reads sixteen runs
 * twice each. Nothing is started outside the test process, so each gets the hooks' budget for a file that imports the
 * server.
 */
const A_CASE = A_HOOK_THAT_IMPORTS_THE_SERVER

let t: TestDb, app: FastifyInstance, scratch: string
let inspection: typeof import('../src/server/lib/inspection.ts')
let finish: typeof import('../src/server/lib/a-finish-reads-git-apart.ts')
let agentsMade = 0, revisionsMade = 0

describe('a finishing write reads its run\'s revisions once', () => {
  beforeEach(async () => {
    observed.capturing = false
    scratch = mkdtempSync(join(tmpdir(), 'a-finish-reads-its-revisions-once-'))
    t = await freshDb()
    const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
    copyTheDefaultRegulationsOnce()
    writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: randomBytes(32).toString('hex'), office: OFFICE_KEY, providers: {} })}\n`, { mode: 0o600 })
    const { buildApp } = await import('../src/server/index.ts')
    app = (await buildApp({ production: false, webDir: '/nonexistent', webAppUrl: 'http://localhost:5173', logLevel: false })).app
    await app.ready()
    await theOfficesCheckers(app)
    // AFTER THE SERVER, so this file asks the same modules the server's write does.
    inspection = await import('../src/server/lib/inspection.ts')
    finish = await import('../src/server/lib/a-finish-reads-git-apart.ts')
  }, A_HOOK_THAT_IMPORTS_THE_SERVER)

  afterEach(async () => {
    observed.capturing = false
    await app?.close()
    t?.close()
    rmSync(scratch, { recursive: true, force: true })
  })

  it('A. the sealing send reads every row of the run once, and each later ask inside it only the newer rows', async () => {
    const run = await aKeyedRunReadyToSeal(await anAgent())
    const first = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: run.headers, payload: theSealingWrite(run.tip) })
    expect(first.statusCode, first.body).toBe(200)
    expect(asBag(asBag(first.json())['beforeTheSeal'])['sealed'], first.body).toBe(false)
    const sealing = await readsOf(run.id, () => app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: run.headers, payload: theSealingWrite(run.tip) }))
    expect(sealing.value.statusCode, sealing.value.body).toBe(200)
    expect(asBag(asBag(asBag(sealing.value.json())['record'])['data'])['state'], sealing.value.body).toBe('finished')
    // ONE READ OF EVERY ROW, then one of the newer rows for each ask of the reminder and the passes. The check the office
    // starts after the passes is no part of them, and reads the history whole, as it did.
    expect(sealing.reads.join(' ')).toMatch(/^all( newer)+( whole)*$/)
  }, A_CASE)

  it('B. the facts are the same inside a finishing write and outside one, for every shape of revision', async () => {
    const worker = await anAgent()
    const inspectorId = idOf(THE_INSPECTOR)
    const inspectorsRecord = (t.client.sqlite.prepare('SELECT record_id FROM agent_records WHERE agent_id = ?').get(inspectorId) as { record_id: string }).record_id
    const named = { state: 'running', servingAgent: worker }
    const as = JSON.stringify(worker)
    const cases: { what: string; data: string; by: string; noInspector: boolean | null }[] = [
      { what: 'malformed JSON', data: '{"servingAgent": ', by: worker, noInspector: null },
      { what: 'a JSON string', data: '"a revision that is a string"', by: worker, noInspector: null },
      { what: 'a JSON array', data: '[1, 2]', by: worker, noInspector: null },
      { what: 'ranAs null', data: JSON.stringify({ ...named, ranAs: null }), by: worker, noInspector: null },
      { what: 'servingAgent present and empty', data: JSON.stringify({ state: 'running', servingAgent: '' }), by: worker, noInspector: true },
      { what: 'nobody named, written by the worker', data: JSON.stringify({ state: 'running' }), by: worker, noInspector: true },
      { what: 'nobody named, written by the inspector', data: JSON.stringify({ state: 'running' }), by: THE_INSPECTOR, noInspector: false },
      { what: 'the inspection purpose in extra.purpose', data: JSON.stringify({ ...named, extra: { purpose: 'inspection' } }), by: worker, noInspector: false },
      { what: 'role written twice, the last copy the inspection', data: `{"state":"running","servingAgent":${as},"role":"worker","role":"inspection"}`, by: worker, noInspector: false },
      { what: 'extra.purpose written twice, the last copy no inspection', data: `{"state":"running","servingAgent":${as},"extra":{"purpose":"inspection","purpose":"none"}}`, by: worker, noInspector: true },
      { what: 'extra written twice, the last copy empty', data: `{"state":"running","servingAgent":${as},"extra":{"purpose":"inspection"},"extra":{}}`, by: worker, noInspector: true },
      { what: 'purpose written with an escape', data: `{"state":"running","servingAgent":${as},"purp\\u006fse":"inspection"}`, by: worker, noInspector: false },
      { what: 'nested deeper than SQLite reads JSON', data: `{"state":"running","servingAgent":${as},"purpose":"inspection","deep":${'['.repeat(TOO_DEEP)}${']'.repeat(TOO_DEEP)}}`, by: worker, noInspector: false },
      { what: 'a binding to the inspector', data: JSON.stringify({ ...named, ranAs: [{ workspaceId: WORKSPACE, agentId: inspectorsRecord }] }), by: worker, noInspector: false },
      { what: 'servingAgentId naming the inspector', data: JSON.stringify({ state: 'running', servingAgentId: inspectorId }), by: worker, noInspector: false },
      { what: 'deliveringMessage naming no message', data: JSON.stringify({ ...named, deliveringMessage: 'no-such-message' }), by: worker, noInspector: null },
    ]
    const found: unknown[] = [], expected: unknown[] = []
    const factsInside: unknown[] = [], factsOutside: unknown[] = []
    for (const one of cases) {
      const id = aRun(named, worker)
      await withARevision(id, one.data, one.by, async () => {
        const run = t.api.getRecord(id)!
        const outside = await readsOf(id, () => inspection.resolveCheckEligibilityFacts(run, true))
        const inside = await readsOf(id, () => inAFinish((pass) => pass(() => inspection.resolveCheckEligibilityFacts(run, true))))
        found.push({ what: one.what, noInspector: [outside.value.noInspector, inside.value.noInspector], reads: [outside.reads, inside.reads] })
        expected.push({ what: one.what, noInspector: [one.noInspector, one.noInspector], reads: [['whole'], ['all']] })
        factsOutside.push({ what: one.what, facts: outside.value })
        factsInside.push({ what: one.what, facts: inside.value })
      })
    }
    // EVERY CASE IS READ BEFORE ANY IS JUDGED, so a red run names each case that differs and not only the first.
    expect(found).toEqual(expected)
    expect(factsInside).toEqual(factsOutside)
  }, A_CASE)

  it('C. a revision the inspector writes inside the write is seen by each later ask, and by the check after the write', async () => {
    // FILED BY A PROGRAM THAT IS NO AGENT RECORD, NAMING NOBODY, as the hook files a run before it knows its agent. No
    // revision names an agent, so the inspector's own revision is the only one that can make `noInspector` false.
    const id = aRun({ state: 'running' }, 'claude-code')
    const ask = () => inspection.resolveCheckEligibilityFacts(t.api.getRecord(id)!, true).noInspector
    const outside = ask()
    const asked = await readsOf(id, () => inAFinish((pass) => [
      pass(ask),
      pass(() => {
        aRevision(id, JSON.stringify({ state: 'running' }), THE_INSPECTOR)
        return ask()
      }),
      pass(ask),
    ]))
    const after = await readsOf(id, () => inspection.checkEligibilityForRun(id, WORKSPACE))
    expect({
      outside,
      asked: asked.value,
      reads: asked.reads,
      after: after.value.missing.filter((one) => one.fact === 'noInspector'),
      readsAfter: [...new Set(after.reads)],
    }).toEqual({
      outside: null,
      asked: [null, false, false],
      reads: ['all', 'newer', 'newer'],
      after: [{ fact: 'noInspector', state: 'missing' }],
      readsAfter: ['whole'],
    })
  }, A_CASE)

  it('D. a revision a nested transaction rolled back is not kept, and the revision that takes its number is read', async () => {
    const worker = await anAgent()
    const id = aRun({ state: 'running', servingAgent: worker }, worker)
    const ask = () => inspection.resolveCheckEligibilityFacts(t.api.getRecord(id)!, true).noInspector
    const ROLLED_BACK = 'the nested write is rolled back'
    const asked = await readsOf(id, () => inAFinish((pass) => pass(() => {
      const before = ask()
      let inTheNestedWrite: boolean | null | undefined
      try {
        t.client.sqlite.transaction(() => {
          aRevision(id, JSON.stringify({ state: 'running', servingAgent: worker, extra: { purpose: 'inspection' } }), worker)
          inTheNestedWrite = ask()
          throw new Error(ROLLED_BACK)
        })()
      } catch (err) {
        if (!(err instanceof Error) || err.message !== ROLLED_BACK) throw err
      }
      aRevision(id, JSON.stringify({ state: 'running', servingAgent: worker }), worker)
      return [before, inTheNestedWrite, ask()]
    })))
    expect({ asked: asked.value, reads: asked.reads }).toEqual({ asked: [true, false, true], reads: ['all', 'newer', 'all'] })
  }, A_CASE)
})

function asBag(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/** The registry id of the agent registered under this handle. A new agent's id is not its handle. */
function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

/** A made-up worker registered through the door, with the work area `work`. */
async function anAgent(): Promise<string> {
  agentsMade += 1
  const handle = `a-finishing-agent-${String(agentsMade)}`
  const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle), payload: { handle, name: handle, role: 'worker', runtime: 'claude-code', workArea: ['work'] } })
  expect(r.statusCode, r.body).toBe(201)
  return handle
}

/** A made-up run with `data`, filed by `by`, in the inventory of runs the check reads without a seal. */
function aRun(data: Record<string, unknown>, by: string): string {
  const made = t.api.createRecord({ kind: 'session', title: 'A made-up run whose history the check reads', workspaceId: WORKSPACE, actor: { type: 'agent', id: by }, origin: 'fixture', data })
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(made.id)
  return made.id
}

/**
 * A revision of `record` with `data` as it is stored, written by the agent `by`: the newest revision with the next
 * number, its own id, and `data` in place of its data. It is written straight into the table, so `data` may be what no
 * write of the office stores.
 */
function aRevision(record: string, data: string, by: string): string {
  const newest = t.client.sqlite.prepare('SELECT * FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').get(record) as Record<string, unknown>
  revisionsMade += 1
  const id = `a-made-up-revision-${String(revisionsMade)}`
  const row: Record<string, unknown> = { ...newest, id, seq: Number(newest['seq']) + 1, op: 'update', data, parts: null, actor_type: 'agent', actor_id: by }
  const columns = Object.keys(row)
  t.client.sqlite.prepare(`INSERT INTO revisions (${columns.map((one) => `"${one}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).run(...columns.map((one) => row[one] ?? null))
  return id
}

/**
 * A revision `aRevision` writes, held while `work` runs and then taken out. The indexes of the revisions that read their
 * JSON are dropped while it is held, as an index would refuse JSON that SQLite cannot read, and put back after it.
 */
async function withARevision(record: string, data: string, by: string, work: () => Promise<void>): Promise<void> {
  const indexes = t.client.sqlite.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'revisions' AND sql LIKE '%json%'").all() as { name: string; sql: string }[]
  for (const one of indexes) t.client.sqlite.exec(`DROP INDEX "${one.name}"`)
  const id = aRevision(record, data, by)
  try {
    await work()
  } finally {
    t.client.sqlite.prepare('DELETE FROM revisions WHERE id = ?').run(id)
    for (const one of indexes) t.client.sqlite.exec(one.sql)
  }
}

/** `write` run as a finishing write of a request of its own, as the record door runs one. */
function inAFinish<T>(write: (inside: InOnePass) => T): Promise<T> {
  return finish.aFinishReadsItsGitApart({} as FastifyRequest, write)
}

/** What `work` gave, and how it read the revisions of `record`, in order. */
async function readsOf<T>(record: string, work: () => T | Promise<T>): Promise<{ value: T; reads: string[] }> {
  observed.statements = []
  observed.capturing = true
  try {
    const value = await work()
    return { value, reads: theReadsOf(record, observed.statements) }
  } finally {
    observed.capturing = false
  }
}

/**
 * How each statement read the revisions of `record`: `all` for the kept read of every row, `newer` for the kept read of
 * the rows after the newest one kept, and `whole` for the read of every revision whole, which is the read outside a
 * finishing write. Statements of other records, and the read of one revision by its id, are not counted.
 */
function theReadsOf(record: string, statements: readonly string[]): string[] {
  const quoted = `'${record.replace(/'/g, "''")}'`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const kept = new RegExp(`^SELECT seq, id, actor_type, actor_id, .+ FROM revisions WHERE record_id = ${quoted}( AND seq > \\S+)? ORDER BY seq$`, 's')
  const whole = new RegExp(`ELSE data END AS data, actor_type, actor_id FROM revisions WHERE record_id = ${quoted}$`)
  return statements.flatMap((one) => {
    const read = kept.exec(one)
    if (read !== null) return [read[1] === undefined ? 'all' : 'newer']
    return whole.test(one) ? ['whole'] : []
  })
}

/** A keyed run of `handle` filed by the office's worker, with three doing-line writes, a report and one commit. */
async function aKeyedRunReadyToSeal(handle: string): Promise<{ id: string; tip: string; headers: Record<string, string> }> {
  const dir = aRepository(join(scratch, `tree-${handle}`))
  git(dir, 'switch', '-qc', 'worker')
  const now = new Date()
  const startedAt = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${now.toTimeString().slice(0, 8)}`
  const filed = await app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_OFFICE_WORKER, payload: { kind: 'session', title: 'A keyed run to seal', data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, startedAt, servingAgent: handle, doing: 'the work under test', workingDirectory: dir, cutFrom: 'main', tip: git(dir, 'rev-parse', 'HEAD') } } })
  expect(filed.statusCode, filed.body).toBe(201)
  const body = filed.json() as { record: { id: string }; runKey?: { key?: string } }
  const id = body.record.id
  const headers = { ...asAgent(handle), 'x-mole-office-session': id, 'x-mole-office-key': String(body.runKey?.key) }
  for (let i = 0; i < 3; i++) {
    const r = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload: { dataPatch: { doing: `the work under test, step ${String(i)}` } } })
    expect(r.statusCode, r.body).toBe(200)
  }
  await aReportInForm(t, id, handle)
  writeFileSync(join(dir, 'work', 'b.txt'), 'b\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-qm', 'B')
  return { id, tip: git(dir, 'rev-parse', 'HEAD'), headers }
}

function theSealingWrite(tip: string): Record<string, unknown> {
  return { dataPatch: { state: 'finished', submission: { kind: 'git' }, tip } }
}
