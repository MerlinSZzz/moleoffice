// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE MADE-UP WORLD FOR THE RUNS A PROJECT'S RULES ASK OF: part 6 of the design-first build of wave 13s's requirements,
 * on the secretary's decision bYwACBK03tGT and the supervisor's vinDV1XnZ2dG. Three test files share it:
 * tests/a-run-is-marked-as-method-work-by-whoever-answers-for-it.test.ts,
 * tests/a-method-run-is-reminded-of-its-reviewed-design-before-the-seal.test.ts and
 * tests/a-design-reminder-is-judged-once-and-counted-by-the-day.test.ts.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office, and a scratch git folder
 * under a scratch home. Every project, agent, rule, design, run and record here is made up. No worker starts.
 *
 * THE WORLD: the person registers a secretary; the secretary registers the assigner; the assigner registers the worker,
 * so the assigner is the worker's starter and answers to the secretary. A run of the worker is filed by the assigner
 * with its own key, as a launcher in a sandbox files its worker's run: the run gets a key of its own and does not say the
 * office started it. A bystander the person registered answers for nobody. The robotics project keeps a chapter of
 * three rules asked at method work: a reviewed design, the grasp_trials evidence account, and sourced thresholds.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { expect, vi } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

export const ROBOTICS = 'made-up-robotics'
export const OTHER = 'made-up-other'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Answer = { status: number; body: any; raw: string }

export interface AnAgent {
  id: string
  handle: string
  key: string
  headers: Record<string, string>
}

export interface ARun {
  id: string
  dir: string
  tip: string
  /** The run's own headers: the worker's handle and the run's own key. */
  headers: Record<string, string>
}

export interface AWorldOfMethodRuns {
  t: TestDb
  app: FastifyInstance
  person: Record<string, string>
  secretary: AnAgent
  assigner: AnAgent
  worker: AnAgent
  bystander: AnAgent
  /** The made-up note every robotics rule names as its source. */
  source: string
  /** The made-up notes the evidence accounts name, by account, the pilot's three among them. */
  evidence: Record<string, string>
  call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown): Promise<Answer>
  /** A run of the worker, filed by the assigner with its own key, with one made-up commit on its branch. */
  aRun(project?: string, more?: Record<string, unknown>): Promise<ARun>
  /** A whole made-up design assigned by the assigner, with its three evidence accounts and a sourced threshold. */
  aDesign(more?: Record<string, unknown>, project?: string): Promise<string>
  /** Review a design at its current revision, and answer the review's id. */
  review(design: string, who: Record<string, string>, verdict?: 'approved' | 'changes-asked'): Promise<string>
  /** Replace the robotics chapter with the pilot's rules: its reviewed design, its three accounts, its threshold. */
  usePilotChapter(more?: Record<string, unknown>): Promise<void>
  /** A whole made-up pilot design: the three accounts the accepted design names, and a sourced threshold. */
  aPilotDesign(more?: Record<string, unknown>): Promise<string>
  /** A run of the worker the office started, which nobody may mark as method work. */
  anOfficeRun(): Promise<ARun>
  /** Link a run to a design with a told about link, as the person. */
  link(run: string, design: string): void
  mark(run: string, who: Record<string, string>, body?: Record<string, unknown>): Promise<Answer>
  /** The run's own write that would seal it. */
  finish(run: ARun): Promise<Answer>
  /** The records of one kind, live, in filing order. */
  recordsOfKind(kind: string): { id: string; workspaceId: string; data: Record<string, unknown> }[]
  /** The gate's counts, summed over every day, or undefined when it has none. */
  gateCounts(gate: string): { would_stop: number; stopped: number; reminded: number } | undefined
  close(): Promise<void>
}

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** An agent's own headers in a project: its handle, and its key. */
function asAgent(handle: string, key: string, project = ROBOTICS): Record<string, string> {
  return { 'x-mole-office-workspace': project, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': key }
}

/**
 * Make the world. The caller stubs nothing: the scratch home, and the reminder before the seal at remind, are stubbed
 * here and put back by `close`.
 */
export async function aWorldOfMethodRuns(): Promise<AWorldOfMethodRuns> {
  const folder = mkdtempSync(join(tmpdir(), 'method-runs-'))
  vi.stubEnv('HOME', folder)
  vi.stubEnv('MOLE_OFFICE_GATE_BEFORE_THE_SEAL', 'remind')
  const t = await freshDb()
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  copyTheDefaultRegulationsOnce()
  const app = (await apiApp()).app
  await app.ready()
  const person: Record<string, string> = {
    'x-mole-office-workspace': ROBOTICS,
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    ...thePersonsKeyHeader(join(dirname(t.file), 'keys.json')),
  }
  const actor = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

  async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown): Promise<Answer> {
    const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any = {}
    try {
      body = reply.json()
    } catch {
      body = {}
    }
    return { status: reply.statusCode, body, raw: reply.body }
  }

  // THE WORKER IS REGISTERED WITH THE WORK AREA ITS RUNS CHANGE, work/, so a run that declares no submission seals as git.
  async function register(handle: string, by: Record<string, string>, role?: string, workArea?: string[]): Promise<AnAgent> {
    const made = await call('POST', '/api/agents/started', { ...by, 'x-mole-office-workspace': 'default' }, {
      handle, name: handle, runtime: 'claude-code', ...(role === undefined ? {} : { role }), ...(workArea === undefined ? {} : { workArea }),
    })
    expect(made.status, made.raw).toBe(201)
    const key = String(made.body.whatToGiveIt?.key)
    expect(/^[0-9a-f]{64}$/.test(key), `the registration of ${handle} answered no key`).toBe(true)
    const id = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }).id
    return { id, handle, key, headers: asAgent(handle, key) }
  }

  async function aNote(title: string, project = ROBOTICS): Promise<string> {
    const made = await call('POST', '/api/records', { ...person, 'x-mole-office-workspace': project }, { kind: 'note', title, data: { body: 'Made-up.' } })
    expect(made.status, made.raw).toBe(201)
    return made.body.record.id
  }

  for (const [id, title] of [[ROBOTICS, 'Made-up robotics'], [OTHER, 'Made-up other']] as const) {
    const made = await call('POST', '/api/workspaces', { ...person, 'x-mole-office-workspace': 'default' }, { id, title })
    expect(made.status, made.raw).toBe(201)
  }
  const secretary = await register('made-up-run-secretary', person, 'secretary')
  const assigner = await register('made-up-run-assigner', secretary.headers)
  const worker = await register('made-up-run-worker', assigner.headers, undefined, ['work'])
  const bystander = await register('made-up-run-bystander', person, 'supervisor')
  const { theSecretaryAgentAnswersTo } = await import('../src/server/lib/claims.ts')
  expect(theSecretaryAgentAnswersTo(assigner.id), 'the assigner answers to no secretary, so the world is wrong').toEqual({ kind: 'agent', id: secretary.id })

  const source = await aNote('Made-up decision behind the robotics rules')
  const evidence: Record<string, string> = {}
  for (const name of ['grasp_trials', 'cloth_trials', 'failure_log', 'literature_search', 'open_implementations_search', 'owner_purpose_comparison']) {
    evidence[name] = await aNote(`Made-up evidence ${name}`)
  }
  const aRule = (id: string, check: Record<string, unknown>): Record<string, unknown> => ({
    id,
    heading: `Made-up rule ${id}`,
    text: `Made-up: the rule ${id}.`,
    reason: `Made-up: why ${id} is kept.`,
    source,
    trigger: 'method-work',
    check,
    effect: 'remind',
    on: true,
    revision: 1,
  })
  {
    const { createRecord } = await import('../src/server/lib/records.ts')
    const { asTheProjectRulesDoors } = await import('../src/server/lib/project-rules-door.ts')
    const rules = [aRule('reviewed-design', { name: 'reviewed-design-linked' }), aRule('grasp-trials', { name: 'evidence-linked', evidence: 'grasp_trials' }), aRule('sourced-thresholds', { name: 'threshold-names-its-source' })]
    asTheProjectRulesDoors(() => createRecord({ kind: 'project_chapter', title: 'Made-up rules of the robotics project', data: { rules }, workspaceId: ROBOTICS, actor }))
  }

  /**
   * The pilot's chapter: the rule that asks for a reviewed design, one rule for each of the three accounts the
   * accepted design names, and the rule that asks a threshold for its source. Each is asked at method work.
   */
  const aPilotRule = (id: string, check: Record<string, unknown>, more: Record<string, unknown> = {}): Record<string, unknown> => ({
    id,
    heading: `Made-up pilot rule ${id}`,
    text: `Made-up: the pilot rule ${id}.`,
    reason: `Made-up: why ${id} is kept.`,
    source,
    trigger: 'method-work',
    check,
    effect: 'remind',
    on: true,
    revision: 1,
    ...more,
  })
  const thePilotRules = (more: Record<string, unknown> = {}): Record<string, unknown>[] => [
    aPilotRule('reviewed-design', { name: 'reviewed-design-linked' }),
    aPilotRule('literature-search', { name: 'evidence-linked', evidence: 'literature_search' }),
    aPilotRule('open-implementations', { name: 'evidence-linked', evidence: 'open_implementations_search' }),
    aPilotRule('owner-purpose', { name: 'evidence-linked', evidence: 'owner_purpose_comparison' }),
    aPilotRule('sourced-thresholds', { name: 'threshold-names-its-source' }, more),
  ]
  /** Write rules over the robotics chapter, as its doors do: created the first time, its rules replaced after. */
  async function writeTheRoboticsRules(rules: Record<string, unknown>[]): Promise<void> {
    const { createRecord, patchRecord } = await import('../src/server/lib/records.ts')
    const { asTheProjectRulesDoors } = await import('../src/server/lib/project-rules-door.ts')
    const { theChapterOfProject } = await import('../src/server/lib/project-rules.ts')
    const { numbering } = await import('../src/server/lib/revisions.ts')
    const there = theChapterOfProject(ROBOTICS)
    // EVERY RULE TAKES THE REVISION OF THE WRITE THAT PUT IT THERE, as the chapter's door numbers it, so a review
    // written before this write can tell that the rules changed under it.
    const next = there === null ? 1 : numbering(there.id).highest + 1
    const numbered = rules.map((one) => ({ ...one, revision: next }))
    asTheProjectRulesDoors(() => {
      if (there === null) {
        createRecord({ kind: 'project_chapter', title: 'Made-up rules of the robotics project', data: { rules: numbered }, workspaceId: ROBOTICS, actor })
        return
      }
      patchRecord(there.id, { data: { rules: numbered } }, actor)
    })
  }

  let designs = 0
  let runs = 0
  const world: AWorldOfMethodRuns = {
    t,
    app,
    person,
    secretary,
    assigner,
    worker,
    bystander,
    source,
    evidence,
    call,
    async aRun(project = ROBOTICS, more = {}) {
      runs += 1
      const dir = join(folder, `tree-${String(runs)}`)
      mkdirSync(join(dir, 'work'), { recursive: true })
      git(dir, 'init', '-q', '-b', 'main')
      git(dir, 'config', 'user.name', 'Made-up fixture')
      git(dir, 'config', 'user.email', 'fixture@example.invalid')
      writeFileSync(join(dir, 'work/a.txt'), 'Made-up baseline\n')
      git(dir, 'add', '.')
      git(dir, 'commit', '-qm', 'Made-up baseline')
      const base = git(dir, 'rev-parse', 'HEAD')
      git(dir, 'switch', '-qc', 'work')
      const filed = await call('POST', '/api/records', { ...assigner.headers, 'x-mole-office-workspace': project }, {
        kind: 'session',
        title: `Made-up run ${String(runs)} of the worker`,
        data: { state: 'running', runtime: 'claude-code', servingAgent: worker.handle, workingDirectory: dir, cutFrom: 'main', tip: base, doing: 'Made-up work is ready to seal.', ...more },
      })
      expect(filed.status, filed.raw).toBe(201)
      const id = String(filed.body.record.id)
      const key = String(filed.body.runKey?.key)
      expect(/^[0-9a-f]{64}$/.test(key), `run ${id} was answered no key of its own`).toBe(true)
      writeFileSync(join(dir, 'work/a.txt'), 'Made-up change\n')
      git(dir, 'add', '.')
      git(dir, 'commit', '-qm', 'Made-up work')
      return { id, dir, tip: git(dir, 'rev-parse', 'HEAD'), headers: { ...asAgent(worker.handle, key, project), 'x-mole-office-session': id } }
    },
    async aDesign(more = {}, project = ROBOTICS) {
      designs += 1
      const data = {
        purpose: 'Made-up: teach a made-up arm to pick up cups.',
        assignedBy: { kind: 'agent', id: assigner.id },
        candidatesAsked: 2,
        candidatesWhy: 'Made-up: two ways are known.',
        candidates: [
          { name: 'A', summary: 'Made-up: learn from demonstrations.' },
          { name: 'B', summary: 'Made-up: plan from a model.' },
        ],
        chosen: 'A',
        evaluation: ['A', 'B'].map((candidate) => ({ candidate, feasibility: 'Made-up: yes.', novelty: 'Made-up: little.', difficulty: 'Made-up: two weeks.', risk: 'Made-up: few trials.', fit: 'Made-up: good.' })),
        pilot: 'Made-up: ten grasps of one cup.',
        sources: ['Made-up: a benchmark nobody wrote.'],
        thresholds: [{ what: 'Made-up: a grasp passes at 8 of 10.', source: 'Made-up: table 3.' }],
        evidence: Object.entries(evidence).map(([name, record]) => ({ name, record })),
        ...more,
      }
      const made = await call('POST', '/api/records', { ...person, 'x-mole-office-workspace': project }, { kind: 'design', title: `Made-up design ${String(designs)}`, data })
      expect(made.status, made.raw).toBe(201)
      return String(made.body.record.id)
    },
    async review(design, who, verdict = 'approved') {
      const { numbering } = await import('../src/server/lib/revisions.ts')
      const done = await call('POST', `/api/designs/${design}/reviews`, who, { designRevision: numbering(design).highest, verdict, words: 'Made-up: read through.' })
      expect(done.status, done.raw).toBe(201)
      return String(done.body.review.id)
    },
    async usePilotChapter(more = {}) {
      await writeTheRoboticsRules(thePilotRules(more))
    },
    async aPilotDesign(more = {}) {
      return world.aDesign({
        evidence: ['literature_search', 'open_implementations_search', 'owner_purpose_comparison'].map((name) => ({ name, record: evidence[name] })),
        ...more,
      })
    },
    async anOfficeRun() {
      const run = await world.aRun()
      // THE OFFICE'S OWN CLASSIFICATION, which only its server writes. A test puts it on a made-up run the way it
      // puts a broken rule into a chapter: by a hand on the database, because no ordinary door accepts it.
      t.client.sqlite.prepare(`UPDATE records SET data = json_set(data, '$.startedByMoleOffice', json('true')) WHERE id = ?`).run(run.id)
      return run
    },
    link(run, design) {
      t.api.createLink({ fromId: run, toId: design, type: 'about', actor })
    },
    mark(run, who, body = { work: 'method-work', because: 'Made-up: the run builds the grasp method.' }) {
      return call('POST', `/api/runs/${run}/method-work`, who, body)
    },
    finish(run) {
      return call('PATCH', `/api/records/${run.id}`, run.headers, { dataPatch: { state: 'finished', tip: run.tip } })
    },
    recordsOfKind(kind) {
      const rows = t.client.sqlite.prepare('SELECT id, workspace_id AS workspaceId, data FROM records WHERE kind = ? AND deleted_at IS NULL ORDER BY created_at, rowid').all(kind) as { id: string; workspaceId: string; data: string }[]
      return rows.map((row) => ({ id: row.id, workspaceId: row.workspaceId, data: JSON.parse(row.data) as Record<string, unknown> }))
    },
    gateCounts(gate) {
      const row = t.client.sqlite
        .prepare('SELECT count(*) AS n, sum(would_stop) AS would_stop, sum(stopped) AS stopped, sum(reminded) AS reminded FROM gate_counts WHERE gate = ?')
        .get(gate) as { n: number; would_stop: number; stopped: number; reminded: number }
      return row.n === 0 ? undefined : { would_stop: row.would_stop, stopped: row.stopped, reminded: row.reminded }
    },
    async close() {
      await app.close()
      t.close()
      vi.unstubAllEnvs()
      rmSync(folder, { recursive: true, force: true })
    },
  }
  return world
}
