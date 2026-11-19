// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SEAL COSTS THE SAME HOWEVER LARGE THE OFFICE IS.
 *
 * A git seal runs its write as passes, each one transaction (`aFinishReadsItsGitApart` in
 * src/server/lib/a-finish-reads-git-apart.ts): when the git has to be read apart, the pass is rolled back, the git is
 * read, and the write runs again. A usual seal makes three. The first stops at the gate; the second and the third work
 * out every fact the reminder judges. One of those facts is the packages the run took inside and has not handed back
 * (`thePackagesTheRunHolds` in src/server/lib/before-the-seal.ts). It asked `delegationColumn` in
 * src/server/lib/delegation.ts for the whole inside column, and the column built a full row for every inside package
 * the project ever had, at 13 statements a package, though the seal keeps only the rows taken and not handed back.
 * On this file's made-up office at the cut f280e2542, the three passes of one seal ran 102, 1,011 and 1,202 statements
 * with 50 packages handed back, and 102, 6,887 and 7,078 on the office ten times larger, with 500. Each heavy pass ran
 * 5,876 more: 13 for each of the 450 packages more that name a module, 11 for each of the first seal's own two, which
 * name none, and 4 for the decisions, which are read in five pieces instead of one.
 *
 * TWO MORE COSTS GREW WITH THE RUN'S AGENT AND THE RUN ITSELF. The latest earlier run of the agent is looked for
 * (`theEarlierRefusalOf` in src/server/lib/before-the-seal.ts), and each earlier run's agent was read by a statement of
 * its own. And the agent of every revision of the run is read (`resolveCheckEligibilityFacts` in
 * src/server/lib/inspection.ts), and each one read the whole registry again. At the cut, on this file's small office, a
 * seal after 50 earlier runs ran 67 statements more in each pass after the first than a seal after 5: 45 for the runs,
 * and 22 for the earlier seal's two packages, which name no module. A seal after 50 revisions read the registry 45 times
 * more in the first pass than a seal after 5, and 90 times more in each pass after it.
 *
 * WHAT THIS FILE PROVES. The made-up office is written straight into the tables: agents, ended runs, decisions,
 * modules, notes, and tasks whose inside package was taken and handed back. The second size has ten times each of
 * those. The work in flight is the same at both sizes: five packages taken by other agents and not handed back, five
 * waiting to be taken, and for the sealing run's own agent one package taken and not handed back and one handed back.
 * A. At both sizes, one git seal makes the same passes, and each pass runs the same number of statements, within the
 *    extra statements the decisions are read in (one for every `IDS_AT_ONCE` decisions, src/server/db/in-pieces.ts).
 *    The statement that lists the tasks and the one that lists the decisions run once in each pass after the first.
 * B. The seal says the same thing about its run at both sizes, once each seal's own run, agent, folder, tip and
 *    packages are put in neutral words: the forecast's sentence, items, refusals and what it did not check, and the
 *    seal's items and what it found again at the seal. At each size the only package it names is the run's own package
 *    that is taken and not handed back: not the run's own package that is handed back, not another agent's, and not
 *    one that is waiting.
 * C. A task whose inside package cannot be read, though its data says it was taken and handed back, is still named in
 *    what the forecast did not check, and no package is named as held.
 * D. On the small office, three runs of three new agents seal one after another: after `FEW` earlier runs of the agent
 *    and `FEW` revisions of the run, after `MANY` earlier runs, and after `MANY` revisions. Each earlier run has ended
 *    and names the agent by its registry id. After each seal its run's held package is marked handed back, so every
 *    seal sees the same work in flight. The seals after few and many earlier runs run the same number of statements
 *    in each pass. The seals after few and many revisions read the registry the same number of times in each pass. A
 *    revision still costs statements of its own, so that part counts only the registry's reads.
 *    THE SAME IS EXACT, with no statement and no read allowed either way. Between the three seals the office gains only
 *    the earlier seals' own records: their runs, revisions, reports and packages, each package handed back. With the
 *    two costs above bounded, the counts on this office are exactly equal, so those records cost a pass nothing more.
 *    An allowance would hide a statement for each earlier run, which is the cost this case is for.
 *
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST (1 to 3 each one line of src/server/lib/delegation.ts):
 * 1. Build a row for every inside package again, as at the cut, by taking out the line that skips a package nobody
 *    holds: case A red, as each heavy pass runs more statements on the larger office. Case D red too, in its earlier
 *    runs' part, by 22 statements in each heavy pass: by the seal after many earlier runs, the first seal's two
 *    packages are handed back, and each costs a row of 11 statements again, as it names no module.
 * 2. Skip every inside package, the held one too: case B red, as the run's own held package is no longer named.
 * 3. Skip a package whose data says it was handed back before its package is read: case C red, as the unreadable
 *    package is no longer named.
 * 4. In `theEarlierRefusalOf`, hand `theAgentsOfTheseRuns` no reader of identities, as at the cut: case D red in its
 *    earlier runs' part, as each pass after the first runs a statement more for each earlier run.
 * 5. In `resolveCheckEligibilityFacts`, read each revision's agent with `theAgentOfARun`, as at the cut: case D red in
 *    its revisions' part, as each pass reads the registry again for each revision.
 *
 * Every repository is a made-up Git repository in this file's own temporary folder, and every agent, run, task and
 * decision is made up. The office database is this file's own, and nothing reaches the live server.
 */
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDS_AT_ONCE } from '../src/server/db/in-pieces.ts'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { aReportInForm } from './a-run-in-form.ts'
import { aRepository, asAgent, git, theOfficesCheckers, WORKSPACE } from './a-seal-read-fixture.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'

/** Every statement run inside a named part of a write, kept by the part, while `capturing` is true. */
const observed = vi.hoisted(() => ({ capturing: false, part: null as string | null, byPart: new Map<string, string[]>() }))
vi.mock('better-sqlite3', async (importOriginal) => {
  const actual = await importOriginal<{ default: typeof import('better-sqlite3') }>()
  return {
    default: new Proxy(actual.default, {
      construct(target, args) {
        const options = args[1] as { verbose?: (statement: string) => void } | undefined
        return Reflect.construct(target, [args[0], {
          ...options,
          verbose(statement: string) {
            if (observed.capturing && observed.part !== null) {
              const list = observed.byPart.get(observed.part) ?? []
              list.push(statement)
              observed.byPart.set(observed.part, list)
            }
            options?.verbose?.(statement)
          },
        }])
      },
    }),
  }
})
/** How the name of each pass of a finishing write begins. */
const A_PASS = vi.hoisted(() => 'the write, pass ')
// EACH PASS IS A PART OF THE WRITE'S PARTS, and its work runs inside one transaction with no wait, so the part's name
// is set while the work runs and the statements are kept under it. A part inside a pass keeps its statements under the
// pass, as `countedApart` in src/server/lib/slow-requests.ts keeps the pass's own count whole.
vi.mock('../src/server/lib/the-parts-of-a-check-door.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/server/lib/the-parts-of-a-check-door.ts')>()
  return {
    ...actual,
    thePartsOf(...args: Parameters<typeof actual.thePartsOf>) {
      const parts = actual.thePartsOf(...args)
      return {
        ...parts,
        part<T>(name: string, work: () => T): T {
          if (!name.startsWith(A_PASS)) return parts.part(name, work)
          const was = observed.part
          observed.part = name
          try {
            return parts.part(name, work)
          } finally {
            observed.part = was
          }
        },
      }
    },
  }
})

const OFFICE_KEY = randomBytes(32).toString('hex')
const AS_THE_OFFICE_WORKER = { ...asAgent(THE_MESSAGE_WORKER_ID), 'x-mole-office-key': OFFICE_KEY }

/** The small office. The larger one has `TIMES` as many of each. */
const SMALL = { agents: 40, sessions: 200, decisions: 215, notes: 300, modules: 10, tasks: 50 }
const TIMES = 10
/** How many doing-line writes the sealing run has before it seals, the same at both sizes. */
const REVISIONS = 3
/** The work in flight, the same at both sizes: packages taken by other agents and not handed back, and waiting ones. */
const TAKEN_BY_OTHERS = 5
const WAITING = 5
/** Case D's few and many: earlier runs of the sealing run's agent, and doing-line writes of the sealing run. */
const FEW = 5
const MANY = 50

/** The statement `listRecords` runs to list the project's tasks, as the database is handed it. */
const THE_TASK_LIST = /from "records" where \("records"\."deleted_at" is null and "records"\."kind" = 'task' and "records"\."workspace_id" = 'default'.*\) order by/
/** The statement `theDecisionsOfTheRun` runs to list the project's decisions. */
const THE_DECISION_LIST = /FROM records r LEFT JOIN revisions v ON v\.record_id = r\.id AND v\.seq = 1 WHERE r\.workspace_id = 'default' AND r\.kind = 'decision'/
/** The statement `listParticipants` runs to read every agent of the registry. */
const THE_REGISTRY_READ = /^SELECT \* FROM agents ORDER BY handle, rowid$/

/**
 * THE TIME A CASE THAT SEALS AT TWO SIZES IS GIVEN. Such a case writes about 4,000 and then about 36,000 rows and makes
 * about a dozen writes through the server, two of them finishing writes on the larger office, and a case keeps five
 * seconds otherwise. Nothing is started outside the test process, so it gets the hooks' budget for a file that imports
 * the server, not the long one.
 */
const A_CASE_THAT_SEALS_AT_TWO_SIZES = A_HOOK_THAT_IMPORTS_THE_SERVER

let t: TestDb, app: FastifyInstance, scratch: string
let agentsMade = 0, rowsMade = 0

/** What one sealing run is: its record, its agent, its folder, its tip, its two own packages and its headers. */
type ARun = { id: string; handle: string; dir: string; tip: string; held: string; handedBack: string; headers: Record<string, string> }
/** What one seal answered, and the statements of each pass of its second, sealing send. */
type ASeal = { run: ARun; forecast: Record<string, unknown>; sealed: Record<string, unknown>; passes: Map<string, string[]> }

describe('one git seal on a made-up office, and on one ten times its size', () => {
  beforeEach(async () => {
    observed.capturing = false
    scratch = mkdtempSync(join(tmpdir(), 'a-seal-costs-the-same-'))
    t = await freshDb()
    const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
    copyTheDefaultRegulationsOnce()
    writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: randomBytes(32).toString('hex'), office: OFFICE_KEY, providers: {} })}\n`, { mode: 0o600 })
    const { buildApp } = await import('../src/server/index.ts')
    app = (await buildApp({ production: false, webDir: '/nonexistent', webAppUrl: 'http://localhost:5173', logLevel: false })).app
    await app.ready()
    await theOfficesCheckers(app)
  }, A_HOOK_THAT_IMPORTS_THE_SERVER)

  afterEach(async () => {
    observed.capturing = false
    await app?.close()
    t?.close()
    rmSync(scratch, { recursive: true, force: true })
  })

  it('A. each pass runs the same number of statements on the small office and on the larger one', async () => {
    const { small, large } = await aSealAtTwoSizes()
    const names = [...small.passes.keys()]
    expect(names.length, 'the seal made fewer than two passes, so no heavy pass was counted').toBeGreaterThan(1)
    expect([...large.passes.keys()]).toEqual(names)
    for (const name of names.slice(1)) {
      for (const [seal, size] of [[small, 'small'], [large, 'larger']] as const) {
        const statements = seal.passes.get(name)!
        expect(statements.filter((one) => THE_TASK_LIST.test(one)), `the tasks listed in ${name} on the ${size} office`).toHaveLength(1)
        expect(statements.filter((one) => THE_DECISION_LIST.test(one)), `the decisions listed in ${name} on the ${size} office`).toHaveLength(1)
      }
    }
    // THE DECISIONS ARE READ BY ID IN PIECES, so ten times the decisions may add a statement for each piece more.
    const pieces = (decisions: number) => Math.ceil(decisions / IDS_AT_ONCE)
    const allowed = pieces(SMALL.decisions * TIMES) - pieces(SMALL.decisions)
    // EVERY PASS IS COUNTED BEFORE ANY IS JUDGED, so a red run names the two counts of each pass and not only the first.
    const counts = names.map((name) => ({ name, small: small.passes.get(name)!.length, larger: large.passes.get(name)!.length }))
    const said = counts.map((one) => `${one.name}: ${String(one.small)} and ${String(one.larger)}`).join('; ')
    const grown = counts.filter((one) => one.larger - one.small > allowed || one.larger < one.small)
    expect(grown, `the statements of each pass on the small office and on the larger one, ${said}`).toEqual([])
  }, A_CASE_THAT_SEALS_AT_TWO_SIZES)

  it('B. the seal says the same about its run at both sizes, and names only the package the run holds', async () => {
    const { small, large } = await aSealAtTwoSizes()
    for (const seal of [small, large]) {
      expect(thePackagesNamed(seal.forecast['items'])).toEqual([`package:${seal.run.held}:hand-back`])
      const reminded = asBag(asBag(asBag(seal.sealed['record'])['data'])['remindedBeforeTheSeal'])
      expect(thePackagesNamed(reminded['items'])).toEqual([`package:${seal.run.held}:hand-back`])
      expect(asBag(reminded['atTheSeal'])['stillFound']).toContain(`package:${seal.run.held}:hand-back`)
    }
    expect(whatTheSealSaid(large)).toEqual(whatTheSealSaid(small))
  }, A_CASE_THAT_SEALS_AT_TWO_SIZES)

  it('C. a package that cannot be read is named in what the forecast did not check, though its data says it was handed back', async () => {
    const template = await anAgent()
    const others = grow(template, 1)
    const run = await aRunReadyToSeal(others)
    const unreadable = aPackagedTask(others[0]!, null, run.handle, true, false)
    writeTheMadeRecords()
    const forecast = await theForecastOf(run)
    const notChecked = forecast['notChecked'] as string[]
    expect(notChecked.filter((one) => one.includes(unreadable)), JSON.stringify(notChecked)).toHaveLength(1)
    expect(thePackagesNamed(forecast['items'])).toEqual([])
  }, A_CASE_THAT_SEALS_AT_TWO_SIZES)

  it('D. each pass runs as many statements after few and many earlier runs of the agent, and reads the registry as often after few and many revisions of the run', async () => {
    const { few, moreRuns, moreRevisions } = await threeSealsOnTheSmallOffice()
    const names = [...few.passes.keys()]
    expect(names.length, 'the seal made fewer than two passes, so no heavy pass was counted').toBeGreaterThan(1)
    expect([...moreRuns.passes.keys()]).toEqual(names)
    expect([...moreRevisions.passes.keys()]).toEqual(names)
    const registryReads = (seal: ASeal, name: string) => seal.passes.get(name)!.filter((one) => THE_REGISTRY_READ.test(one)).length
    expect(names.reduce((sum, name) => sum + registryReads(few, name), 0), 'no pass read the registry, so counting its reads proves nothing').toBeGreaterThan(0)
    // BOTH PARTS ARE COUNTED BEFORE EITHER IS JUDGED, so a red run names each pass whose count grew, in its own part.
    const grown = (fewer: ASeal, more: ASeal, count: (seal: ASeal, name: string) => number, what: string) =>
      names.flatMap((name) => count(fewer, name) === count(more, name) ? [] : [`${name}: ${String(count(fewer, name))} and ${String(count(more, name))} ${what}`])
    expect({
      earlierRuns: grown(few, moreRuns, (seal, name) => seal.passes.get(name)!.length, 'statements'),
      revisions: grown(few, moreRevisions, registryReads, 'registry reads'),
    }).toEqual({ earlierRuns: [], revisions: [] })
  }, A_CASE_THAT_SEALS_AT_TWO_SIZES)
})

function asBag(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/** The keys of the package items among a reminder's items. */
function thePackagesNamed(items: unknown): string[] {
  return (items as { key: string }[]).map((one) => one.key).filter((key) => key.startsWith('package:'))
}

/** What a seal says about its run, with its own run, agent, folder, tip and packages in neutral words, and no times. */
function whatTheSealSaid(seal: ASeal): unknown {
  const reminded = asBag(asBag(asBag(seal.sealed['record'])['data'])['remindedBeforeTheSeal'])
  const atTheSeal = asBag(reminded['atTheSeal'])
  const said = {
    forecast: Object.fromEntries(['sealed', 'says', 'purpose', 'items', 'refuses', 'notChecked', 'again'].map((key) => [key, seal.forecast[key]])),
    sealed: {
      incomplete: seal.sealed['incomplete'],
      changed: asBag(seal.sealed['dataPatch'])['changed'],
      check: asBag(seal.sealed['theCheck'])['says'],
      reminded: reminded['reminded'],
      chapters: reminded['chapters'],
      items: reminded['items'],
      atTheSeal: Object.fromEntries(['stillFound', 'noLongerFound', 'notJudged', 'machineWideScans'].map((key) => [key, atTheSeal[key]])),
    },
  }
  const own: [string, string][] = [
    [seal.run.id, 'the-run'], [seal.run.handle, 'the-agent'], [seal.run.dir, 'the-folder'], [seal.run.tip, 'the-tip'],
    [seal.run.held, 'the-held-package'], [seal.run.handedBack, 'the-handed-back-package'],
  ]
  let words = JSON.stringify(said)
  for (const [mine, neutral] of own) {
    words = words.replace(new RegExp(`(?<![\\w-])${mine.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![\\w-])`, 'g'), neutral)
  }
  return JSON.parse(words) as unknown
}

/** A made-up agent registered through the door, with the work area `work`. */
async function anAgent(): Promise<string> {
  agentsMade += 1
  const handle = `a-sealing-agent-${String(agentsMade)}`
  const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle), payload: { handle, name: handle, role: 'worker', runtime: 'claude-code', workArea: ['work'] } })
  expect(r.statusCode, r.body).toBe(201)
  return handle
}

function columnsOf(table: string): Set<string> {
  return new Set((t.client.sqlite.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((one) => one.name))
}

function insertAll(table: string, rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return
  const kept = columnsOf(table)
  const columns = Object.keys(rows[0]!).filter((one) => kept.has(one))
  const statement = t.client.sqlite.prepare(`INSERT INTO "${table}" (${columns.map((one) => `"${one}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
  t.client.sqlite.transaction(() => {
    for (const row of rows) statement.run(...columns.map((one) => row[one] ?? null))
  })()
}

function stampOf(n: number): string {
  return `2026-11-10 ${String(Math.floor(n / 3600) % 24).padStart(2, '0')}:${String(Math.floor(n / 60) % 60).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
}

/** The records made so far and not yet written, each with its first revision and its create row. */
const made = { records: [] as Record<string, unknown>[], revisions: [] as Record<string, unknown>[], changes: [] as Record<string, unknown>[] }

function aRecord(kind: string, title: string, data: Record<string, unknown>, by: string): string {
  rowsMade += 1
  const id = `made-up-${kind}-${String(rowsMade)}`
  const at = stampOf(rowsMade)
  const body = JSON.stringify(data)
  made.records.push({ id, workspace_id: WORKSPACE, owner_id: 'owner', created_at: at, updated_at: at, kind, title, summary: null, data: body, deleted_at: null, origin: 'fixture' })
  made.revisions.push({ id: `made-up-revision-${String(rowsMade)}`, record_id: id, workspace_id: WORKSPACE, seq: 1, op: 'create', content_hash: randomBytes(8).toString('hex'), kind, title, summary: null, data: body, at, actor_type: 'agent', actor_id: by })
  made.changes.push({ id: `made-up-change-${String(rowsMade)}`, record_id: id, workspace_id: WORKSPACE, op: 'create', actor_type: 'agent', actor_id: by, at })
  return id
}

function writeTheMadeRecords(): void {
  insertAll('records', made.records)
  insertAll('revisions', made.revisions)
  insertAll('changes', made.changes)
  made.records = []; made.revisions = []; made.changes = []
}

/** The data of an inside package `who` made, taken by `taker` unless null, and handed back when `handedBack`. */
function aPackage(who: string, module: string | null, taker: string | null, handedBack: boolean, readable = true): Record<string, unknown> {
  const at = stampOf(rowsMade)
  const took = taker === null ? [] : [{ by: { actorType: 'agent', actorId: taker }, at }]
  return {
    package: {
      bundleId: 'made-up-bundle', forTheOutside: 'Made up.', acceptance: 'Made up.', moduleIds: module === null ? [] : [module],
      // AN INSIDE PACKAGE WITH NO PARENT CANNOT BE READ: the package reader asks an inside package for its parent.
      ...(readable ? { parent: { kind: 'task', id: 'made-up-parent' } } : {}),
      lines: ['made-up'], pointIds: ['made-up-point'],
      takenInside: took,
      handedBack: handedBack && taker !== null ? [{ by: { actorType: 'agent', actorId: taker }, at, points: [{ pointId: 'made-up-point', outcome: 'done', words: 'Made up.' }] }] : [],
      at, by: { actorType: 'agent', actorId: who },
    },
  }
}

/** A task holding an inside package, made and kept to be written. */
function aPackagedTask(who: string, module: string | null, taker: string | null, handedBack: boolean, readable = true): string {
  return aRecord('task', 'A made-up packaged task', aPackage(who, module, taker, handedBack, readable), who)
}

/**
 * Grow the office by `times` the small size, in every dimension written straight into the tables, and answer the
 * made-up agents' handles. The agents are copies of `template`, each with its own agent record.
 */
function grow(template: string, times: number): string[] {
  const sqlite = t.client.sqlite
  const templateRow = sqlite.prepare('SELECT * FROM agents WHERE handle = ?').get(template) as Record<string, unknown>
  const templateRecord = sqlite.prepare('SELECT r.* FROM agent_records m JOIN records r ON r.id = m.record_id WHERE m.agent_id = ?').get(templateRow['id']) as Record<string, unknown>
  const agents: Record<string, unknown>[] = [], agentRecords: Record<string, unknown>[] = [], handles: string[] = []
  for (let i = 0; i < SMALL.agents * times; i++) {
    rowsMade += 1
    const handle = `made-up-agent-${String(rowsMade)}`
    handles.push(handle)
    agents.push({ ...templateRow, id: handle, handle, name: handle })
    agentRecords.push({ agent_id: handle, record_id: aRecord('agent', handle, { ...(JSON.parse(String(templateRecord['data'])) as Record<string, unknown>), handle }, handle) })
  }
  const by = (i: number) => handles[i % handles.length]!
  for (let i = 0; i < SMALL.sessions * times; i++) aRecord('session', 'A made-up ended run', { state: 'finished', servingAgentId: by(i), runtime: 'claude-code', doing: 'made-up work' }, by(i))
  for (let i = 0; i < SMALL.decisions * times; i++) aRecord('decision', 'A made-up decision', { decided_by: by(i), decided_on: '2026-11-10', authority: 'reversible engineering judgement', because: 'made up', revisit_when: 'never' }, by(i))
  const modules: string[] = []
  for (let i = 0; i < SMALL.modules * times; i++) modules.push(aRecord('module', 'A made-up module', {}, by(i)))
  for (let i = 0; i < SMALL.tasks * times; i++) aPackagedTask(by(i), modules[i % modules.length]!, by(i), true)
  for (let i = 0; i < SMALL.notes * times; i++) aRecord('note', 'A made-up note', { body: 'Made up.' }, by(i))
  insertAll('agents', agents)
  writeTheMadeRecords()
  insertAll('agent_records', agentRecords)
  return handles
}

/** The work in flight: packages other agents took and have not handed back, and packages nobody has taken. */
function theWorkInFlight(others: string[]): void {
  for (let i = 0; i < TAKEN_BY_OTHERS; i++) aPackagedTask(others[i]!, null, others[i]!, false)
  for (let i = 0; i < WAITING; i++) aPackagedTask(others[i]!, null, null, false)
  writeTheMadeRecords()
}

/**
 * A keyed run of a new agent, ready to seal: it holds one package it took and has not handed back and one it handed
 * back, has `revisions` doing-line writes and a report, and has committed one change. Before it was filed, its agent
 * had `earlierRuns` ended runs, each naming the agent by its registry id.
 */
async function aRunReadyToSeal(others: string[], { earlierRuns = 0, revisions = REVISIONS } = {}): Promise<ARun> {
  const handle = await anAgent()
  const held = aPackagedTask(others[0]!, null, handle, false)
  const handedBack = aPackagedTask(others[0]!, null, handle, true)
  const agentId = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
  for (let i = 0; i < earlierRuns; i++) aRecord('session', 'A made-up earlier run', { state: 'finished', servingAgentId: agentId, runtime: 'claude-code', doing: 'made-up work' }, agentId)
  writeTheMadeRecords()
  const dir = aRepository(join(scratch, `tree-${handle}`))
  git(dir, 'switch', '-qc', 'worker')
  const now = new Date()
  const startedAt = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${now.toTimeString().slice(0, 8)}`
  const filed = await app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_OFFICE_WORKER, payload: { kind: 'session', title: 'A keyed run to seal', data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, startedAt, servingAgent: handle, doing: 'the work under test', workingDirectory: dir, cutFrom: 'main', tip: git(dir, 'rev-parse', 'HEAD') } } })
  expect(filed.statusCode, filed.body).toBe(201)
  const body = filed.json() as { record: { id: string }; runKey?: { key?: string } }
  const id = body.record.id
  const headers = { ...asAgent(handle), 'x-mole-office-session': id, 'x-mole-office-key': String(body.runKey?.key) }
  for (let i = 0; i < revisions; i++) {
    const r = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload: { dataPatch: { doing: `the work under test, step ${String(i)}` } } })
    expect(r.statusCode, r.body).toBe(200)
  }
  await aReportInForm(t, id, handle)
  writeFileSync(join(dir, 'work', 'b.txt'), 'b\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-qm', 'B')
  return { id, handle, dir, tip: git(dir, 'rev-parse', 'HEAD'), held, handedBack, headers }
}

function theSealingWrite(run: ARun): Record<string, unknown> {
  return { dataPatch: { state: 'finished', submission: { kind: 'git' }, tip: run.tip } }
}

/** The first finishing send, which seals nothing and answers what the reminder found under `beforeTheSeal`. */
async function theForecastOf(run: ARun): Promise<Record<string, unknown>> {
  const first = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: run.headers, payload: theSealingWrite(run) })
  expect(first.statusCode, first.body).toBe(200)
  const forecast = asBag(asBag(first.json())['beforeTheSeal'])
  expect(forecast['sealed'], first.body).toBe(false)
  return forecast
}

/** The forecast, and then the second finishing send with every statement of each of its passes kept. */
async function aSeal(run: ARun): Promise<ASeal> {
  const forecast = await theForecastOf(run)
  observed.byPart = new Map()
  observed.capturing = true
  const second = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: run.headers, payload: theSealingWrite(run) })
  observed.capturing = false
  expect(second.statusCode, second.body).toBe(200)
  const passes = new Map([...observed.byPart].filter(([name]) => name.startsWith(A_PASS)))
  return { run, forecast, sealed: second.json() as Record<string, unknown>, passes }
}

/**
 * One seal on the small office, and one on the office grown to ten times its size. The work in flight stays the same:
 * after the first seal, its run's held package is marked handed back, so the second seal sees as many open packages.
 */
async function aSealAtTwoSizes(): Promise<{ small: ASeal; large: ASeal }> {
  const template = await anAgent()
  const others = grow(template, 1)
  theWorkInFlight(others)
  const small = await aSeal(await aRunReadyToSeal(others))
  const handedBackNow = aPackage(others[0]!, null, small.run.handle, true)
  t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(handedBackNow), small.run.held)
  grow(template, TIMES - 1)
  const large = await aSeal(await aRunReadyToSeal(others))
  return { small, large }
}

/**
 * Three seals on the small office, each by a run of a new agent: after `FEW` earlier runs of the agent and `FEW`
 * revisions of the run, after `MANY` earlier runs, and after `MANY` revisions. After each seal its run's held package
 * is marked handed back, so every seal sees as many open packages.
 */
async function threeSealsOnTheSmallOffice(): Promise<{ few: ASeal; moreRuns: ASeal; moreRevisions: ASeal }> {
  const template = await anAgent()
  const others = grow(template, 1)
  theWorkInFlight(others)
  const seals: ASeal[] = []
  for (const shape of [{ earlierRuns: FEW, revisions: FEW }, { earlierRuns: MANY, revisions: FEW }, { earlierRuns: FEW, revisions: MANY }]) {
    const seal = await aSeal(await aRunReadyToSeal(others, shape))
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(aPackage(others[0]!, null, seal.run.handle, true)), seal.run.held)
    seals.push(seal)
  }
  const [few, moreRuns, moreRevisions] = seals as [ASeal, ASeal, ASeal]
  return { few, moreRuns, moreRevisions }
}
