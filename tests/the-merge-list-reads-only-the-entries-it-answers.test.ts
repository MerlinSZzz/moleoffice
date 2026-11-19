// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE LIST READS ONLY THE ENTRIES IT ANSWERS. An ask of GET /api/merge-queue for one lane or some states read
 * every entry of the project whole, one statement each, before it kept the lane and the states asked. On the live
 * office that was about 1,346 statements for each ask of the merge tool and of the timing job. The list now checks the
 * shape of every entry from the fields the check reads, in one statement, so that an entry the queue cannot read is
 * still named whatever was asked. It reads whole, in one statement more, only the entries the lane and states keep.
 *
 * The cases count the statements one ask runs, and the bytes its reads of the records table hand back, in a made-up
 * office and again after many more entries are filed that the ask leaves out. They read the query plan of each read of
 * the records table that the asks run.
 *
 * Every entry here is made up and filed in a test database of its own.
 *
 * MUTATION PROOF (logs named in the report of the run that added this file), each alone after a green control:
 *   - the list reads each entry whole, one statement each, as before: cases 1 and 2 go red;
 *   - the list reads every entry whole in one statement and keeps the lane and states afterwards: case 2 goes red;
 *   - the first read leaves out a field the shape check reads: case 4 goes red;
 *   - a read of the entries is kept off its index: case 3 goes red.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { DOCUMENTS_LANE, MERGE_STATES, MERGE_STATE_SPECS } from '../src/shared/merge-queue.ts'

const WORKSPACE = 'default'
const ROOT = '/synthetic/lane-the-asks-read'
const DOCS = `${ROOT} ${DOCUMENTS_LANE}`
const OTHER = '/synthetic/lane-no-ask-reads'
const LIVE = MERGE_STATES.filter((one) => !MERGE_STATE_SPECS[one].final)
/** How many entries are filed between the two counts in each lane, and how many files each judged map names. */
const CROWD = 20
const JUDGED_FILES = 300
const office = { type: 'agent' as const, id: 'mole-office/the-message-worker' }
const worker = { kind: 'agent', id: 'made-up-worker' }
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const hex = (n: number, of: string): string => of.replace(/[^0-9a-f]/gu, '').padEnd(n, 'a').slice(0, n)
const q = (parts: Record<string, string>): string => `/api/merge-queue?${new URLSearchParams(parts).toString()}`

/** The asks counted. Only the second keeps the entries filed in the asked lane between the two counts. */
const ASKS: { name: string; url: string; keepsTheCrowd: boolean }[] = [
  { name: 'the timing job', url: q({ lane: ROOT, state: 'testing,integrating,landing', shape: 'narrow' }), keepsTheCrowd: false },
  { name: 'the merge tool reading its lane', url: q({ lane: ROOT, shape: 'narrow' }), keepsTheCrowd: true },
  { name: 'the merge tool waiting for a landing', url: q({ lane: ROOT, state: 'landing', shape: 'narrow' }), keepsTheCrowd: false },
  { name: 'the merge tool moving past documentation landings', url: q({ lane: DOCS, state: 'merged', shape: 'narrow' }), keepsTheCrowd: false },
  { name: 'the queue page', url: q({ state: LIVE.join(','), shape: 'page' }), keepsTheCrowd: false },
  { name: 'the whole list of one lane\'s judged entries', url: q({ lane: ROOT, state: 'judged' }), keepsTheCrowd: false },
]

// ============================================================================ counting what an ask runs

/** One statement run: its text, what it was run with, and the bytes of the rows it handed back. */
type Run = { source: string; params: unknown[]; bytes: number }
type Counted = { status: number; body: any; runs: Run[] }

/** The bytes of what a statement hands back: each text and blob by its length, each number as eight. */
function bytesOf(value: unknown): number {
  if (typeof value === 'string') return Buffer.byteLength(value)
  if (Buffer.isBuffer(value)) return value.length
  if (typeof value === 'number' || typeof value === 'bigint') return 8
  if (Array.isArray(value)) return value.reduce((n: number, one) => n + bytesOf(one), 0)
  if (typeof value === 'object' && value !== null) return Object.values(value).reduce((n: number, one) => n + bytesOf(one), 0)
  return 0
}
/** A statement that reads the records table, as drizzle writes it and as the queue's own statements write it. */
const readsRecords = (source: string): boolean => /^\s*select\b/iu.test(source) && /\bfrom\s+"?records"?(?![\w"])/iu.test(source)
/** The office's log of the requests it answers, written once for each request whatever it asked. */
const isTheRequestLog = (source: string): boolean => /\bapi_calls\b/u.test(source)

let runs: Run[] | null = null
const restore: (() => void)[] = []

/** Counts every statement any code of this process runs, through the statement type of better-sqlite3. */
function countTheStatements(sqlite: { prepare: (source: string) => object }): void {
  const statement = Object.getPrototypeOf(sqlite.prepare('SELECT 1')) as Record<string, (...args: unknown[]) => unknown>
  for (const name of ['all', 'get', 'run', 'iterate']) {
    const original = statement[name]!
    statement[name] = function (this: { source: string }, ...args: unknown[]) {
      const answer = original.apply(this, args)
      if (runs === null || isTheRequestLog(this.source)) return answer
      const run: Run = { source: this.source, params: args, bytes: 0 }
      runs.push(run)
      if (name === 'run') return answer
      if (name !== 'iterate') {
        run.bytes = bytesOf(answer)
        return answer
      }
      return (function* () {
        for (const row of answer as Iterable<unknown>) {
          run.bytes += bytesOf(row)
          yield row
        }
      })()
    }
    restore.push(() => {
      statement[name] = original
    })
  }
}

const theRecordsBytes = (counted: Counted): number => counted.runs.filter((one) => readsRecords(one.source)).reduce((n, one) => n + one.bytes, 0)
/** The statements one count ran that the other did not, by their text, for the message of a failing expectation. */
function theDifference(a: Run[], b: Run[]): string[] {
  const count = (list: Run[]) => list.reduce((m, one) => m.set(one.source, (m.get(one.source) ?? 0) + 1), new Map<string, number>())
  const [left, right] = [count(a), count(b)]
  return [...new Set([...left.keys(), ...right.keys()])].filter((source) => left.get(source) !== right.get(source)).map((source) => `${String(left.get(source) ?? 0)} then ${String(right.get(source) ?? 0)}: ${source.slice(0, 300)}`)
}

// ============================================================================ the office

const ids: Record<string, string> = {}
/**
 * Each made-up entry out of shape, by the field the check finds wrong in it: the state it is filed in, and the value
 * then stored in that field. Undefined takes the field out.
 */
const BROKEN: Record<string, { state: string; stored: unknown; occupies?: true }> = {
  state: { state: 'merged', stored: 'not-a-state-of-the-queue' },
  run: { state: 'merged', stored: 7 },
  seal: { state: 'merged', stored: { id: 'made-up-seal-without-a-hash' } },
  changeset: { state: 'merged', stored: { adapter: 'git', repository: 'made-up-repository' } },
  submittedBy: { state: 'merged', stored: undefined },
  occupies: { state: 'merged', stored: '/synthetic/lane-of-an-entry-broken-in-occupies' },
  documents: { state: 'testing', stored: { tree: hex(40, 'd0c'), files: ['docs/made-up.md'] }, occupies: true },
  toolWanted: { state: 'merged', stored: { since: 7 } },
  resolution: { state: 'resolving', stored: { commit: 7 } },
  suiteWorkers: { state: 'merged', stored: { count: 'three', by: worker } },
  movedFirst: { state: 'merged', stored: { by: worker } },
  fixRound: { state: 'merged', stored: { problem: 'made-up-problem', kind: 'neither' } },
  takeBackOf: { state: 'merged', stored: { problem: 'made-up-problem' } },
  repairOf: { state: 'merged', stored: { problem: 'made-up-problem', files: [] } },
  takesOut: { state: 'merged', stored: [] },
}
const first = new Map<string, Counted>()
const second = new Map<string, Counted>()
let theWholeList: Counted | null = null
/** What one entry of the crowd holds as stored, in bytes, the smallest of them. */
let aCrowdEntry = Infinity

describe('the merge list', () => {
  let t: TestDb

  beforeAll(async () => {
    t = await freshDb()
    countTheStatements(t.client.sqlite)
    const door = await import('../src/server/lib/merge-entry-door.ts')
    const file = (name: string, state: string, more: Record<string, unknown>, root: string, how: { occupies?: true; documents?: true; judged?: number } = {}): number => {
      const files = Array.from({ length: how.judged ?? 2 }, (_, at) => `src/made-up/${name}/file-${String(at)}.ts`)
      const data: Record<string, unknown> = {
        state,
        run: `made-up-run-${name}`,
        seal: { id: `made-up-seal-${name}`, hash: hex(64, `5ea1${name}`) },
        changeset: { adapter: 'git', repository: 'made-up-repository', root, branch: `made-up-${name}`, commit: hex(40, `c0${name}`), base: hex(40, `ba5e${name}`) },
        submittedBy: worker,
        ...(how.documents ? { documents: { tree: hex(40, `d0c${name}`), files: files.slice(0, 2) } } : {}),
        ...(how.occupies ? { occupies: root } : {}),
        ...(['submitted', 'pinned'].includes(state) ? {} : { judged: Object.fromEntries(files.map((path) => [path, hex(64, `${name}${path}`)])), verdict: { at: '2026-10-29 07:00:00', released: true, says: 'A made-up verdict.' } }),
        ...more,
      }
      ids[name] = door.asTheMergeQueue(() => t.api.createRecord({ kind: 'merge_entry', title: `Made-up merge entry ${name}`, workspaceId: WORKSPACE, actor: office, origin: 'fixture', data })).id
      return Buffer.byteLength(JSON.stringify(data))
    }
    const integrated = (n: number) => ({ integrated: { at: '2026-10-29 07:30:00', mainBefore: hex(40, `a${String(n)}`), mainAfter: hex(40, `b${String(n)}`) } })
    file('merged', 'merged', integrated(1), ROOT)
    file('judged', 'judged', {}, ROOT)
    file('pinned', 'pinned', {}, ROOT)
    file('testing', 'testing', { occupies: ROOT }, ROOT)
    file('docs-merged', 'merged', integrated(2), ROOT, { documents: true })
    file('docs-landing', 'landing', { ...integrated(3), occupies: DOCS }, ROOT, { documents: true })
    file('other-judged', 'judged', {}, OTHER)
    // READABLE ONLY THROUGH ITS RESOLUTION: a resolving entry may ask for the tool while its resolution waits for the check.
    file('resolving', 'resolving', { toolWanted: { since: '2026-10-29 08:00:00' }, resolution: { commit: hex(40, 'f1x') } }, '/synthetic/lane-of-a-resolving-entry')
    // STORED OUT OF SHAPE IN THE TEST'S OWN DATABASE, as an entry an older office wrote would be: the records door
    // refuses some of these values on the way in.
    for (const [field, broken] of Object.entries(BROKEN)) {
      const root = `/synthetic/lane-of-an-entry-broken-in-${field}`
      const asked = field === 'resolution' ? { toolWanted: { since: '2026-10-29 08:00:00' }, resolution: { commit: hex(40, 'f1x') } } : {}
      file(`broken-${field}`, broken.state, { ...asked, ...(broken.occupies ? { occupies: root } : {}) }, root)
      const update = broken.stored === undefined ? 'json_remove(data, ?)' : 'json_set(data, ?, json(?))'
      t.client.sqlite.prepare(`UPDATE records SET data = ${update} WHERE id = ?`).run(...[`$.${field}`, ...(broken.stored === undefined ? [] : [JSON.stringify(broken.stored)]), ids[`broken-${field}`]])
    }

    const app = (await apiApp()).app
    await app.ready()
    try {
      const ask = async (url: string): Promise<Counted> => {
        runs = []
        const reply = await app.inject({ method: 'GET', url, headers: AS_THE_PERSON })
        const counted = { status: reply.statusCode, body: reply.json() as unknown, runs }
        runs = null
        return counted
      }
      // ONCE BEFORE COUNTING, so that what the office reads once and keeps is not counted in one count and not the other.
      for (const one of ASKS) await ask(one.url)
      for (const one of ASKS) first.set(one.url, await ask(one.url))
      for (let n = 0; n < CROWD; n += 1) {
        aCrowdEntry = Math.min(aCrowdEntry, file(`crowd-other-${String(n)}`, 'merged', integrated(10 + n), OTHER, { judged: JUDGED_FILES }))
        aCrowdEntry = Math.min(aCrowdEntry, file(`crowd-root-${String(n)}`, 'merged', integrated(40 + n), ROOT, { judged: JUDGED_FILES }))
      }
      for (const one of ASKS) second.set(one.url, await ask(one.url))
      theWholeList = await ask('/api/merge-queue')
    } finally {
      await app.close()
    }
  }, 120_000)

  afterAll(() => {
    for (const one of restore) one()
    t?.close()
  })

  const answered = (counted: Counted | undefined, name: string): Counted => {
    expect(counted?.status, `${name}: ${JSON.stringify(counted?.body).slice(0, 400)}`).toBe(200)
    return counted!
  }

  it('1: the statements an ask runs do not grow with the entries it leaves out, nor, for a narrow ask, with the entries it keeps', () => {
    for (const one of ASKS) {
      const [before, after] = [answered(first.get(one.url), one.name), answered(second.get(one.url), one.name)]
      expect(after.runs.length, `${one.name}: ${JSON.stringify(theDifference(before.runs, after.runs), null, 1)}`).toBe(before.runs.length)
    }
    const kept = answered(second.get(ASKS[1]!.url), ASKS[1]!.name).body.lanes.flatMap((lane: any) => lane.entries)
    expect(kept.length, 'the narrow ask of the lane keeps the entries filed in it between the two counts').toBe(first.get(ASKS[1]!.url)!.body.lanes.flatMap((lane: any) => lane.entries).length + CROWD)
  })

  it('2: an entry an ask leaves out is not read whole: the rows read for it hold less than a twentieth of what it holds', () => {
    expect(aCrowdEntry, 'each entry filed between the two counts holds its judged map').toBeGreaterThan(JUDGED_FILES * 64)
    for (const one of ASKS.filter((ask) => !ask.keepsTheCrowd)) {
      const grew = theRecordsBytes(answered(second.get(one.url), one.name)) - theRecordsBytes(answered(first.get(one.url), one.name))
      const leftOut = 2 * CROWD
      expect(grew / leftOut, `${one.name}: the rows read grew by ${String(grew)} bytes for ${String(leftOut)} entries left out, each holding at least ${String(aCrowdEntry)}`).toBeLessThan(aCrowdEntry / 20)
    }
  })

  it('3: each read of the records table an ask runs searches it by an index, and scans no table', () => {
    const plans = new Map<string, string[]>()
    for (const one of ASKS) {
      for (const run of answered(second.get(one.url), one.name).runs.filter((each) => readsRecords(each.source))) {
        if (plans.has(run.source)) continue
        plans.set(run.source, (t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${run.source}`).all(...(run.params as never[])) as { detail: string }[]).map((line) => line.detail))
      }
    }
    expect(plans.size, 'the asks read the records table').toBeGreaterThan(0)
    for (const [source, plan] of plans) {
      const said = `${source.slice(0, 400)}\n${plan.join('\n')}`
      expect(plan.some((line) => /^SEARCH records USING (?:COVERING )?INDEX /u.test(line)), said).toBe(true)
      // A TABLE-VALUED FUNCTION IS SCANNED, such as json_each over one record's data or over the ids the statement was
      // handed. SQLite names it a virtual table, and it is not a table of the database.
      expect(plan.filter((line) => /^SCAN /u.test(line) && !/^SCAN \S+ VIRTUAL TABLE\b/u.test(line)), said).toEqual([])
    }
  })

  it('4: an entry out of shape in any field the check reads is named by every ask, whatever lane or states it asked', () => {
    const named = (counted: Counted) => (counted.body.unreadable as { id: string; why: string }[]).map((one) => one.id).sort()
    const broken = Object.keys(BROKEN).map((field) => ids[`broken-${field}`]!).sort()
    const whole = answered(theWholeList!, 'the whole list')
    expect(named(whole), JSON.stringify(whole.body.unreadable, null, 1)).toEqual(broken)
    for (const one of ASKS) {
      const counted = answered(second.get(one.url), one.name)
      expect(counted.body.unreadable, one.name).toEqual(whole.body.unreadable)
    }
    for (const one of whole.body.unreadable as { id: string; why: string }[]) expect(one.why).toMatch(new RegExp(`^Merge entry ${one.id} does not hold what the merge queue writes: `, 'u'))
    expect(named(whole), 'an entry the check reads through its resolution is read').not.toContain(ids['resolving'])
  })
})
