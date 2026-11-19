// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { theRunReportsForTheQueue } from './a-report-the-merge-queue-reads.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
/**
 * THE MERGE QUEUE'S STATE MACHINE, EVERY TRANSITION AND EVERY REFUSAL. Sandbox v1, piece P7: the
 * rest of test T5 of SPEC.md section 6, on section 5.4 and decisions R2, R3 and R4.
 *
 * WHAT IS PROVED HERE, each by a run against a real database and the real server, with the verdicts
 * posted through the real check door by an agent holding the inspector card:
 *
 *   1. H_RELEASE AT PINNED. A pinned entry waits until an inspector's release names its seal, its
 *      hash and its exact tip, and then becomes judged with `judged` set to the sealed content; the
 *      release may come before or after the pin. A starter's release does not judge it. A refusal
 *      bounces it as `refused`, tells the submitter, and gives the secretary one line. Pinned content
 *      that is not the sealed content is refused with nothing written.
 *   2. THE LANE. `integrating` takes the lane and is refused while another entry holds it. H_RELEASE
 *      is asked again there.
 *   3. THE VERDICT FOLLOWS FILE CONTENT (R2). `integrated` with every path at the judged hash goes to
 *      testing. A path whose hash differs sends the entry to reinspecting: the office files a run at
 *      the integrated tree, seals it on the main world it was put on, and asks for a scoped check
 *      whose `only` is exactly the changed paths; the worker's job carries the scope; the scoped
 *      release moves the entry to testing and widens `judged`. A scoped refusal bounces it.
 *   4. THE CHECKERS (R4). A decided failure bounces as `guard`. A path handed on goes to the
 *      inspector even at a judged hash, and once judged as handed on at that hash it is not asked
 *      about again.
 *   5. TESTING AND LANDING. Red bounces as `red` naming the tests; landing needs a green run and the
 *      main world the entry was integrated on; `main-moved` goes back to judged, frees the lane and
 *      drops the test run, and the fourth time bounces as `churn`; `landed` must name what was
 *      tested, and then the entry is merged, the receipt is on the entry and on the run, and the
 *      secretary gets one line.
 *   6. THE FILES ADAPTER'S DELETES. A pinned files entry with a delete asks
 *      the secretary; landing is refused until whoever holds the secretary card confirms through
 *      POST /api/merge-queue/<id>/confirm-deletes; a stranger and the worker are refused. Its merged
 *      line names where it landed and no tests.
 *   7. Every step is refused from any state but its own; a final entry takes no step; a withdrawal
 *      gives the secretary one line.
 *   8. A FILES ENTRY IS JUDGED ONLY ON BYTES ITS SEAL FROZE, and bounces as `unjudged` when a byte it
 *      lands is not in its seal, or when a path needs an inspector's reading that no check of a files
 *      entry can give — at the pin, and at the integrate step, where the bounce lets its lane go.
 *   9. A MERGE TOOL RUN THAT ENDED WITHOUT MOVING ITS ENTRY has the tool asked for again, counted per
 *      arrival; the third such run bounces the entry as `stalled` with that run's words, except in
 *      landing, where the entry stays in its lane and the secretary is told a person must look.
 *
 *  10. AN ENTRY ON A FILES SEAL lands only a sealed file, at its sealed path,
 *      with its sealed bytes and mode, in the folder it was sealed to land in, and bounces as
 *      `unjudged` at the pin otherwise, a rename included. Its release covers the before too: a modify
 *      must replace exactly the file the check read, and an add must land where the check saw nothing,
 *      or the entry bounces as `unjudged` when the release is heard.
 *  11. THE QUEUE'S REBASE TRIED EARLY, wave 13v round 25. When the tool reports that the rebase,
 *      with its joins, stopped on a scratch copy (`rebaseStopped`), the entry bounces at once, at the pin or after a
 *      landing, in the words its turn would have used and a sentence saying it was found early. After a landing, only an
 *      entry still pinned or judged at the replayed commit is touched. Mutations: bounceWhatCannotJoin no longer bounces on
 *      `rebaseStopped`, and the landing case goes red; the pinned step no longer bounces on it, and the pin case goes red.
 *      The commit message records the control, the mutations and the restores.
 *  12. A PLUGIN-ONLY CHANGE, plan VlQueUhVQQmi, wave 13x round 16. A green result
 *      of a plugin's own check is kept with the plugin it names, and the office says its suite did not run. The receipt
 *      of its landing names the plugin beside the tests, and the secretary's line says the plugin's check was green and
 *      not that tests were. It is refused, with nothing written, for an entry whose integrated result changes anything
 *      outside that one plugin's folder on top of the main it was integrated on, or when it names another plugin or says
 *      otherwise of the manifest. The seal is not what is read: when an earlier round of the same branch lands after the
 *      seal, its files are in the seal and not in the result that was tested (problem gy40yKomK_FQ).
 *
 * Cases 8 and 9 and the line in case 6 are the sandbox v1 fix of the queue (INTEGRATION.md section 7,
 * issues 4 to 7).
 *
 * Every fixture here is synthetic and says so: the git trees are made under `.logs/` in this checkout
 * and removed after, the records are filed as fixtures, and nothing reaches the live server.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, cpSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { ABSENT, aReleasedRunGoesInUnderANewRun } from '../src/shared/merge-queue.ts'
import { gateNamed } from '../src/config/gates.mjs'
const MAX_LANDING_ATTEMPTS = Number(gateNamed('landing-attempts').defaults.ordinary)
const MAX_TOOL_RUNS_IN_ONE_PLACE = Number(gateNamed('tool-runs-in-one-place').defaults.ordinary)
import { localStamp } from '../src/shared/time.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'

let t: TestDb
let app: FastifyInstance
let inspection: typeof import('../src/server/lib/inspection.ts')
const made: string[] = []

const WORKSPACE = 'default'
const THE_WORKER = 'mole-office/the-message-worker'
const as = (type: 'agent' | 'human', id: string) => ({
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asPerson = as('human', THE_PERSON)
const asSecretary = as('agent', THE_TEST_OFFICES_SECRETARY.handle)
const asInspector = as('agent', 'inspector-one')
const asSupervisor = as('agent', 'super-r')
const asWorker = as('agent', 'worker-w')
const asStranger = as('agent', 'a-stranger')
const asTheOffice = as('agent', THE_WORKER)

const A = 'work/a.txt'
const B = 'work/b.txt'
const RULES = 'design/rules.md'
const WHY = 'A protected path (design/) that is not a generated file.'

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** A throwaway directory inside this checkout's `.logs/`, removed after the file. */
function scratch(prefix: string): string {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', `merge-machine-${prefix}-`))
  made.push(dir)
  return dir
}

/**
 * WHERE A FILES ENTRY OF THE WORKER LANDS: a folder outside this checkout, registered as the worker's files area in
 * beforeAll through the office's door. A files entry lands only inside its agent's files area, and never inside a
 * git working tree such as this checkout (acceptance finding 52).
 */
let filesArea: string
function aFilesRoot(prefix: string): string {
  return realpathSync(mkdtempSync(join(filesArea, `${prefix}-`)))
}

/** A synthetic tree: main holds three files; `work` changes all three. The shape a worker's worktree has. */
function buildTree(dir: string): void {
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic merge machine fixture')
  mkdirSync(join(dir, 'work'), { recursive: true })
  mkdirSync(join(dir, 'design'), { recursive: true })
  for (const path of [A, B, RULES]) writeFileSync(join(dir, path), `${path} before.\n`)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-q', '-c', 'work')
  for (const path of [A, B, RULES]) writeFileSync(join(dir, path), `${path} before.\n${path} submitted.\n`)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic submission')
}

/**
 * ONE TREE BUILT ONCE AND COPIED FOR EACH CASE: the git commands are the same in every tree, so the file pays for them
 * once in beforeAll. Each copy still gets a line of its own, so that two trees are two works: identical submissions are
 * one change, and a newer entry whose commit holds the older one's change supersedes it, whatever its branch. The
 * copy's submission commit is amended to carry that line.
 */
let aTreeAlreadyMade = ''

function tree(): string {
  const dir = scratch('tree')
  cpSync(aTreeAlreadyMade, dir, { recursive: true })
  writeFileSync(join(dir, B), `${B} before.\n${B} submitted from ${basename(dir)}.\n`)
  git(dir, 'commit', '-q', '-a', '--amend', '--no-edit')
  return dir
}

interface Seal { id: string; hash: string; commit: string; forkBase: string; files: { path: string; hash: string | null }[] }

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}

/**
 * Whether aSealedRun gives its run the doing line and the report the queue reads at the pin. Only the check-again block
 * turns it off: it is about which report a check names, and it releases every run before the pin, which the pin does
 * not read a report for.
 */
let withTheQueuesReport = true

/** A finished run of the worker in its own tree, sealed at the tree's tip. */
async function aSealedRun(dir: string = tree(), records?: string[]): Promise<{ run: string; dir: string; seal: Seal }> {
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic merge machine run',
    workspaceId: WORKSPACE,
    actor: { type: 'agent', id: 'worker-w' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'worker-w', cutFrom: 'main', workingDirectory: dir,
      ...(records === undefined ? {} : { submission: { kind: 'mixed', records } }),
    },
  }).id
  if (withTheQueuesReport) theRunReportsForTheQueue(t, run, { type: 'agent', id: 'worker-w' })
  const finished = await call('PATCH', `/api/records/${run}`, asWorker, { dataPatch: { state: 'finished' } })
  expect(finished.status, finished.raw).toBe(200)
  return { run, dir, seal: theSealOf(run) }
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

/**
 * A FINISHED RUN WHOSE OWN COMMIT CARRIES STAGED FILES under `work/out/`, sealed at its tip: the shape a
 * files entry's run has when its seal holds the bytes the entry lands (INTEGRATION.md section 7, issue 4).
 * `stagedAt` is that folder, and each file's after-hash is the sha256 of its text.
 */
async function aStagedRun(staged: Record<string, string>): Promise<{ run: string; dir: string; seal: Seal; stagedAt: string }> {
  const dir = tree()
  const stagedAt = join(dir, 'work', 'out')
  mkdirSync(stagedAt, { recursive: true })
  for (const [path, text] of Object.entries(staged)) {
    mkdirSync(dirname(join(stagedAt, path)), { recursive: true })
    writeFileSync(join(stagedAt, path), text)
  }
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'Synthetic staged files')
  return { ...(await aSealedRun(dir)), stagedAt: realpathSync(stagedAt) }
}

function theSealOf(run: string): Seal {
  const id = t.api.getRecord(run)!.data['sealedTip'] as string
  const seal = t.api.getRecord(id)!.data['seal'] as { hash: string; git: { commit: string; forkBase: string; files: Seal['files'] } }
  return { id, hash: seal.hash, commit: seal.git.commit, forkBase: seal.git.forkBase, files: seal.git.files }
}

/** The sealed content as the state machine spells it: every changed path at its blob hash. */
function contentOf(seal: Seal): Record<string, string> {
  return Object.fromEntries(seal.files.map((one) => [one.path, one.hash ?? ABSENT]))
}

let mainCheckout = ''

/** A submitted git entry of a fresh sealed run, by the supervisor. */
async function anEntry(branch = 'work', records?: string[]): Promise<{ id: string; run: string; dir: string; seal: Seal }> {
  const sealed = await aSealedRun(tree(), records)
  const r = await call('POST', '/api/merge-queue', asSupervisor, { run: sealed.run, changeset: { adapter: 'git', repository: 'fixture-main', branch } })
  expect(r.status, r.raw).toBe(201)
  return { id: String(r.body['entry'].id), ...sealed }
}

async function step(id: string, step: string, facts: Record<string, unknown>) {
  return call('POST', `/api/merge-queue/${id}/step`, asTheOffice, { step, facts })
}

async function entry(id: string): Promise<Record<string, any>> {
  const r = await call('GET', `/api/merge-queue/${id}`, asStranger)
  expect(r.status, r.raw).toBe(200)
  return r.body['entry']
}

/**
 * 2zvQX2PS0BNK: THE WORDS A MERGE ENTRY IS REFUSED WITH WHEN IT IS IN A STATE WITHOUT A FIELD THE MERGE
 * QUEUE WRITES ON THE WAY INTO IT. Both describes below assert this one sentence, so the words cannot drift apart.
 */
const lacks = (id: string, state: string, what: string) =>
  `Merge entry ${id} is ${state} without ${what}, which the merge queue writes before an entry can be ${state}. The entry's record is broken, so nothing was written.`

/**
 * A verdict on a run, through the real doors: the assembly first (the check door refuses a verdict
 * with no assembly recorded), then the verdict. `read` names the run's own seal unless overridden;
 * `read.only` and `read.needsJudgment` make it a scoped check, assembled as one.
 */
async function verdict(run: string, body: Record<string, unknown>, read: Record<string, unknown> = {}, by: Record<string, string> = asInspector) {
  const seal = theSealOf(run)
  const worktree = String(t.api.getRecord(run)!.data['workingDirectory'])
  const whatWasRead = { sealId: seal.id, sealHash: seal.hash, worktree, tip: seal.commit, ofItsOwn: true, says: 'Synthetic: a check of its own detached tree.', ...read }
  const only = read['only'] as string[] | undefined
  const needsJudgment = read['needsJudgment'] as { path: string; why: string }[] | undefined
  const assembled = await call('POST', `/api/checks/${run}/assembled`, by, {
    changes: seal.files.map((one) => ({ path: one.path, changes: 'a synthetic diff' })),
    base: { ref: seal.forkBase, how: 'fork point', says: 'Synthetic: the fixed fork base of the seal.' },
    read: whatWasRead,
    ...(only === undefined ? {} : { only }),
    ...(needsJudgment === undefined ? {} : { needsJudgment: needsJudgment.map((one) => ({ ...one, changes: 'a synthetic diff' })) }),
  })
  expect(assembled.status, assembled.raw).toBe(201)
  return call('POST', `/api/checks/${run}`, by, { chaptersRead: [], read: whatWasRead, ...(body['verdict'] === 'released' ? { traced: syntheticTrace(t, only ?? seal.files.map((one) => one.path)) } : {}), ...body })
}
const release = (run: string, read: Record<string, unknown> = {}, by?: Record<string, string>) =>
  verdict(run, { verdict: 'released', check: 'Synthetic: read the changes and found nothing missing.' }, read, by)
const refuse = (run: string, read: Record<string, unknown> = {}) =>
  verdict(run, { verdict: 'refused', check: 'Synthetic: read the changes.', missing: ['The test would pass with the feature deleted.'], says: { chapter: 5 } }, read)

interface Message { id: string; title: string; to: { kind: string; id: string }[]; body: string }
function messagesAbout(run: string): Message[] {
  const rows = t.client.sqlite
    .prepare("SELECT id, title, data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? ORDER BY rowid")
    .all(run) as { id: string; title: string; data: string }[]
  return rows.map((row) => {
    const data = JSON.parse(row.data) as { to?: Message['to']; body: string }
    return { id: row.id, title: row.title, to: data.to ?? [], body: data.body }
  })
}
/** How many messages the office holds, all told. */
const everyMessage = (): number =>
  (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message'").get() as { n: number }).n
const toTheSecretary = (run: string): Message[] => messagesAbout(run).filter((one) => one.to.some((who) => who.id === idOf(THE_TEST_OFFICES_SECRETARY.handle)))

/** Take a judged entry through integrating and a clean integrate, to testing. */
async function toTesting(id: string, seal: Seal, mainAt = seal.forkBase): Promise<void> {
  const taking = await step(id, 'integrating', {})
  expect(taking.status, taking.raw).toBe(200)
  const integrated = await step(id, 'integrated', { result: seal.commit, mainAt, files: contentOf(seal) })
  expect(integrated.status, integrated.raw).toBe(200)
  expect(integrated.body['entry'].state).toBe('testing')
}

/** Take a judged entry to landing: integrate, green, landing. */
async function toLanding(id: string, seal: Seal, mainAt = seal.forkBase): Promise<void> {
  await toTesting(id, seal, mainAt)
  const green = await step(id, 'tested', { green: true, log: '/synthetic/suite.log', ran: 10, passed: 10 })
  expect(green.status, green.raw).toBe(200)
  const landing = await step(id, 'landing', { mainAt })
  expect(landing.status, landing.raw).toBe(200)
  expect(landing.body['entry'].state).toBe('landing')
}

/**
 * A clone of the worker's tree with `work` put on top of a moved main, and one file changed by that:
 * the shape the merge tool's clone has after a rebase that merged a hunk into A.
 */
function aCloneOnTopOfMain(dir: string): { clone: string; mainAt: string; result: string; files: Record<string, string> } {
  const clone = scratch('clone')
  execFileSync('git', ['clone', '-q', dir, clone])
  git(clone, 'config', 'user.email', 'fixture@example.invalid')
  git(clone, 'config', 'user.name', 'Synthetic merge clone')
  // THE CLONE CHECKS OUT `work`, because that is where the tree's HEAD is; `main` is made from origin's.
  git(clone, 'checkout', '-q', 'main')
  writeFileSync(join(clone, 'work', 'other.txt'), 'main moved on.\n')
  git(clone, 'add', '.')
  git(clone, 'commit', '-q', '-m', 'Synthetic: main moved')
  git(clone, 'checkout', '-q', 'work')
  git(clone, 'rebase', '-q', 'main')
  writeFileSync(join(clone, A), `${A} before.\n${A} submitted.\n${A} merged with main.\n`)
  git(clone, 'add', '.')
  git(clone, 'commit', '-q', '--amend', '--no-edit')
  const result = git(clone, 'rev-parse', 'HEAD')
  // THE HASH THE SEAL HOLDS: sha256 of the blob's bytes as git cat-file reads them, not git's oid.
  const files = Object.fromEntries(
    [A, B, RULES].map((path) => [path, createHash('sha256').update(execFileSync('git', ['-C', clone, 'cat-file', 'blob', `HEAD:${path}`])).digest('hex')]),
  )
  return { clone, mainAt: git(clone, 'rev-parse', 'main'), result, files }
}

/** A clone at the submitted tip itself, on the same main: nothing changed by the integration. */
function aCloneAtTheTip(dir: string): string {
  const clone = scratch('clone')
  execFileSync('git', ['clone', '-q', dir, clone])
  git(clone, 'checkout', '-q', 'work')
  return clone
}

/**
 * FREE THE LANE AFTER EACH CASE, so a case that failed half way does not refuse every case after it
 * the lane. An entry that is landing cannot be withdrawn, so it is sent back to judged first, the
 * way the main world moving would send it.
 */
async function freeTheLane(): Promise<void> {
  // BOTH LANES OF THE REPOSITORY: its code lane, and its documentation lane.
  // THE SHAPE OF IDS answers each lane's holder as the whole list does, without the page's reading of every entry.
  for (const lane of [mainCheckout, `${mainCheckout} documents`]) {
    const listed = await call('GET', `/api/merge-queue?lane=${encodeURIComponent(lane)}&shape=ids`, asStranger)
    expect(listed.status, listed.raw).toBe(200)
    const holder = listed.body['lanes']?.[0]?.occupiedBy as { entry: string; state: string } | null | undefined
    if (holder === null || holder === undefined) continue
    if (holder.state === 'landing') await step(holder.entry, 'main-moved', { mainAt: '0'.repeat(40) })
    await call('POST', `/api/merge-queue/${holder.entry}/withdraw`, asPerson, { because: 'the case is over; the lane is freed for the next one' })
  }
}

/** The registry id of the agent registered under this handle. A new agent's id is not its handle. */
function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `nothing is registered as ${handle}`).toBeDefined()
  return row!.id
}

beforeAll(async () => {
  t = await freshDb()
  // THE SMALL GIT TREE IS BUILT ONCE: every case starts from its own copy of this one.
  aTreeAlreadyMade = scratch('tree-template')
  buildTree(aTreeAlreadyMade)
  // THE DEFAULT SET, AS A NEW OFFICE COPIES IT AT ITS FIRST START: a check quotes chapter 7 rule r-8 from the
  // office's own chapter records. Imported after freshDb, which resets the modules.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  app = (await apiApp()).app
  inspection = await import('../src/server/lib/inspection.ts')
  const register = async (by: Record<string, string>, payload: Record<string, unknown>) => {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload })
    expect(r.statusCode, r.body).toBe(201)
  }
  await register(asPerson, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asPerson, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
  await register(asPerson, { handle: 'super-r', name: 'Super R', role: 'supervisor' })
  await register(asSupervisor, { handle: 'worker-w', name: 'Worker W', role: 'worker', workArea: ['work', 'design'] })
  await register(asPerson, { handle: 'a-stranger', name: 'A Stranger' })
  filesArea = realpathSync(mkdtempSync(join(tmpdir(), 'merge-machine-files-area-')))
  made.push(filesArea)
  const area = await call('POST', '/api/participants/agent/worker-w/files-area', asPerson, { filesArea: [filesArea], because: 'the files entries of these tests land here' })
  expect(area.status, area.raw).toBe(200)
  const repositories = await import('../src/server/lib/repositories.ts')
  mainCheckout = realpathSync(scratch('main'))
  repositories.registerRepository({ workspaceId: WORKSPACE, name: 'fixture-main', root: mainCheckout, actor: { type: 'human', id: THE_PERSON } })
}, 60_000)

afterEach(async () => {
  await freeTheLane()
})

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

// ============================================================================ 1. H_RELEASE at pinned

// Round 7 criterion: OFF retains the legacy red bounce. ON admits an observed whole-suite red only
// on original successful build and affected runs on the exact integrated tree. These are synthetic
// command observations submitted to the real server and external throwaway database, never receipts.
describe('the dormant whole-suite red gate', () => {
  async function ready() {
    const one = await anEntry()
    expect((await release(one.run)).status).toBe(201)
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    expect((await step(one.id, 'integrating', {})).status).toBe(200)
    expect((await step(one.id, 'integrated', { result: one.seal.commit, mainAt: one.seal.forkBase, clone: one.dir, files: contentOf(one.seal) })).body['entry'].state).toBe('testing')
    return one
  }
  function evidence(one: Awaited<ReturnType<typeof ready>>) {
    const tip = one.seal.commit
    const tree = git(one.dir, 'rev-parse', `${tip}^{tree}`)
    return {
      green: false, tip, redTests: ['tests/unrelated.test.ts'], log: '/synthetic/whole.log',
      wholeSuiteRed: {
        outcome: 'admitted-for-fix-round',
        build: { source: 'original', tip, tree, exit: 0, log: '/synthetic/build.log' },
        affected: { source: 'original', tip, tree, selection: 'complete', exit: 0, files: ['tests/affected.test.ts'], ran: 2, passed: 2, log: '/synthetic/affected.log', report: '/synthetic/affected.json' },
        suite: { source: 'original', tip, tree, complete: true, exit: 1, ran: 3, passed: 2, redTests: ['tests/unrelated.test.ts'], log: '/synthetic/whole.log', report: '/synthetic/whole.json' },
      },
    }
  }

  it('keeps new red admission off by default and records authorized landing completion without stale claims', async () => {
    const before = process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND']
    try {
      delete process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND']
      const off = await ready()
      const bounced = await step(off.id, 'tested', evidence(off))
      expect(bounced.status, bounced.raw).toBe(200)
      expect(bounced.body['entry'].state).toBe('bounced')
      process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND'] = '1'
      const one = await ready()
      const facts = evidence(one)
      const receiptsBefore = (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'whole_suite_receipt'").get() as { n: number }).n
      const tested = await step(one.id, 'tested', facts)
      expect(tested.status, tested.raw).toBe(200)
      expect(tested.body['entry'].state).toBe('testing')
      expect(tested.body['entry'].machine.tested).toMatchObject(facts)
      expect(tested.body['decided']).toContain('admitted for a fix round')
      process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND'] = '0'
      expect((await step(one.id, 'landing', { mainAt: one.seal.forkBase })).status).toBe(409)
      process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND'] = '1'
      expect((await step(one.id, 'landing', { mainAt: 'wrong-main' })).status).toBe(422)
      expect((await step(one.id, 'landing', { mainAt: one.seal.forkBase })).status).toBe(200)
      process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND'] = '0'
      // Landing is durable authorization obtained before main moved. Disabling future admissions
      // must not prevent the office from recording completion of this already-authorized move.
      expect((await step(one.id, 'landed', { mainAfter: 'wrong-tip' })).status).toBe(422)
      const landed = await step(one.id, 'landed', { mainAfter: one.seal.commit })
      expect(landed.status, landed.raw).toBe(200)
      expect(landed.body['entry'].state).toBe('merged')
      expect(landed.body['entry'].machine.integrated.tests).toMatchObject({ green: false, wholeSuiteRed: facts.wholeSuiteRed })
      expect((t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'whole_suite_receipt'").get() as { n: number }).n).toBe(receiptsBefore)
      const { oneLineForTheSecretary } = await import('../src/server/lib/merge-state-machine.ts')
      const { readMergeEntry } = await import('../src/server/lib/merge-queue.ts')
      expect(oneLineForTheSecretary(readMergeEntry(t.api.getRecord(one.id)!))).toContain('whole suite red; admitted for a fix round')
      // A historical malformed/null observation is not an admission claim in the actual summary reader.
      t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.tested.wholeSuiteRed', json('null'), '$.integrated.tests.wholeSuiteRed', json('null')) WHERE id = ?").run(one.id)
      const unproved = oneLineForTheSecretary(readMergeEntry(t.api.getRecord(one.id)!))
      expect(unproved).toContain('whole suite red')
      expect(unproved).not.toContain('admitted for a fix round')
      expect(unproved).not.toContain('tests green')
      process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND'] = '1'
      const later = await ready()
      expect((await step(later.id, 'tested', evidence(later))).body['entry'].state).toBe('testing')
      const replaced = await step(later.id, 'tested', { green: false, tip: later.seal.commit, log: '/synthetic/affected-red.log', redTests: ['tests/affected.test.ts'] })
      expect(replaced.body['entry'].state).toBe('bounced')
      expect(replaced.body['entry'].machine.tested.wholeSuiteRed).toBeUndefined()
      expect(oneLineForTheSecretary(readMergeEntry(t.api.getRecord(later.id)!))).not.toContain('admitted for a fix round')
    } finally {
      if (before === undefined) delete process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND']; else process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND'] = before
    }
  })

  it('refuses incomplete borrowed or mismatched admission evidence without changing the entry', async () => {
    const before = process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND']
    process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND'] = '1'
    try {
      const one = await ready()
      const original = await entry(one.id)
      const changes: ((facts: any) => void)[] = [
        f => { f.green = true },
        f => { f.wholeSuiteRed.build.exit = 1 },
        f => { f.wholeSuiteRed.build.source = 'borrowed' },
        f => { f.wholeSuiteRed.build.tip = 'wrong' },
        f => { f.wholeSuiteRed.build.tree = 'wrong' },
        f => { f.wholeSuiteRed.build.tree = f.wholeSuiteRed.affected.tree = f.wholeSuiteRed.suite.tree = 'same-wrong-tree' },
        f => { f.tip = f.wholeSuiteRed.build.tip = f.wholeSuiteRed.affected.tip = f.wholeSuiteRed.suite.tip = 'same-wrong-tip' },
        f => { f.wholeSuiteRed.affected.tree = 'wrong' },
        f => { f.wholeSuiteRed.affected.selection = 'refused' },
        f => { f.wholeSuiteRed.affected.files = [] },
        f => { f.wholeSuiteRed.affected.passed = 1 },
        f => { delete f.wholeSuiteRed.affected },
        f => { f.wholeSuiteRed.suite.source = 'borrowed' },
        f => { f.wholeSuiteRed.suite.complete = false },
        f => { f.wholeSuiteRed.suite.exit = 0 },
        f => { f.wholeSuiteRed.suite.redTests = [] },
        f => { f.wholeSuiteRed.suite.tree = 'wrong' },
        f => { f.plugin = { id: 'synthetic', manifest: false } },
        f => { f.borrowedFrom = { entry: one.id, tree: f.wholeSuiteRed.build.tree } },
      ]
      for (const change of changes) {
        const facts = evidence(one)
        change(facts)
        const refused = await step(one.id, 'tested', facts)
        expect([409, 422], refused.raw).toContain(refused.status)
        expect(await entry(one.id)).toEqual(original)
      }
    } finally {
      if (before === undefined) delete process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND']; else process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND'] = before
    }
  })

  it('persists exact bus order and measured cause indices while leaving unknown cause absent', async () => {
    const one = await ready()
    const tip = one.seal.commit
    const tree = git(one.dir, 'rev-parse', `${tip}^{tree}`)
    const busCause = {
      mainAt: one.seal.forkBase, suite: { commit: tip, tree },
      order: [{ entry: one.id, commit: tip, tree, commits: [tip] }],
      pairDecided: { still: ['tests/unrelated.test.ts'], brokeBy: { 'tests/unrelated.test.ts': 0 }, runsAlone: 1, without: null },
    }
    const kept = await step(one.id, 'tested', { green: true, tip, log: '/synthetic/bus.log', busCause })
    expect(kept.status, kept.raw).toBe(200)
    expect(kept.body['entry'].machine.tested.busCause).toEqual(busCause)
    const unknown = { ...busCause, pairDecided: { still: ['tests/unrelated.test.ts'] } }
    const again = await step(one.id, 'tested', { green: true, tip, log: '/synthetic/bus.log', busCause: unknown })
    expect(again.status, again.raw).toBe(200)
    expect(again.body['entry'].machine.tested.busCause).toEqual(unknown)
    expect(again.body['entry'].machine.tested.busCause.pairDecided).not.toHaveProperty('brokeBy')
  })
})

describe('H_RELEASE at pinned', () => {
  it('waits for the inspector, and is judged by a release that names its seal and tip, before or after the pin', async () => {
    const before = await anEntry()
    const pinned = await step(before.id, 'pinned', { files: contentOf(before.seal) })
    expect(pinned.status, pinned.raw).toBe(200)
    expect(pinned.body['entry'].state).toBe('pinned')
    expect(pinned.body['entry'].waitsOn).toContain("inspector's release")
    expect(pinned.body['entry'].machine.judged).toBeUndefined()

    const released = await release(before.run)
    expect(released.status, released.raw).toBe(201)
    expect(released.body['mergeQueue'].moved).toEqual([{ entry: before.id, state: 'judged', says: expect.stringContaining('judged') }])
    const judged = await entry(before.id)
    expect(judged.state).toBe('judged')
    expect(judged.machine.judged).toEqual(contentOf(before.seal))
    expect(judged.machine.verdict).toMatchObject({ run: before.run, by: { kind: 'agent', id: idOf('inspector-one') }, how: 'an inspector' })
    // THE RELEASE STORES THE CLOCK OBSERVATION BESIDE ITS STAMP, and the verdict copies it, so the merge tool can count a
    // bus's wait from the moment of the release even in the hour the clocks go back.
    expect(released.body['released'].time).toMatchObject({ stamp: released.body['released'].at, instant: expect.any(String), offset: expect.any(String) })
    expect(judged.machine.verdict.time).toEqual(released.body['released'].time)

    // AND WHEN THE RELEASE CAME FIRST, the pin goes straight to judged.
    const after = await anEntry()
    const early = await release(after.run)
    expect(early.status, early.raw).toBe(201)
    expect(early.body['mergeQueue']).toBeUndefined()
    const pinnedLate = await step(after.id, 'pinned', { files: contentOf(after.seal) })
    expect(pinnedLate.status, pinnedLate.raw).toBe(200)
    expect(pinnedLate.body['entry'].state).toBe('judged')
    expect(pinnedLate.body['decided']).toContain('The entry is judged')
  })

  it('refuses pinned content that is not the sealed content, and writes nothing', async () => {
    const one = await anEntry()
    const before = JSON.stringify(t.api.getRecord(one.id)!.data)
    const wrong = { ...contentOf(one.seal), [A]: 'f'.repeat(40) }
    const r = await step(one.id, 'pinned', { files: wrong })
    expect(r.status, r.raw).toBe(422)
    expect(r.body['error']).toContain(`${A} is ${'f'.repeat(40)}, not`)
    const missing = { ...contentOf(one.seal) }
    delete missing[B]
    const short = await step(one.id, 'pinned', { files: missing })
    expect(short.status, short.raw).toBe(422)
    expect(short.body['error']).toContain(`${B} is missing`)
    expect(JSON.stringify(t.api.getRecord(one.id)!.data)).toBe(before)
  })

  it('bounces on a decided failure before comparing the content, so a pin of bytes that are not the submission ends the entry', async () => {
    // THE TOOL REPORTS WHAT IT REALLY HOLDS, which here is not what was submitted, and a checker's decided
    // failure saying so: the entry bounces as a guard, naming both, rather than refusing the report and
    // leaving the entry submitted with nothing to move it (sandbox v1 integration).
    const one = await anEntry()
    const held = { ...contentOf(one.seal), [A]: 'e'.repeat(64) }
    const checker = { tool: 'tools/checks/files-changeset.mjs', decided: [{ path: A, check: 'sha256', ok: false, detail: "The blob's sha256 is not the after_hash." }], needsJudgment: [] }
    const r = await step(one.id, 'pinned', { files: held, checker })
    expect(r.status, r.raw).toBe(200)
    expect(r.body['entry'].state).toBe('bounced')
    expect(r.body['entry'].machine.bounced).toMatchObject({ reason: 'guard', files: [A] })
    expect(r.body['entry'].machine.bounced.says).toContain("The blob's sha256 is not the after_hash.")
    // THE HASH IS SAID IN ITS FIRST 12 CHARACTERS, as the other bounce sentences say one (message bDovnimMAmvu).
    // MUTATION: in the pinned step of src/server/lib/merge-state-machine.ts, call whereTheyDiffer without `true`.
    expect(r.body['entry'].machine.bounced.says).toContain(`${A} is ${'e'.repeat(12)}…, not`)
    expect(r.body['entry'].machine.bounced.says).not.toContain('e'.repeat(13))
  })

  it("is not judged by a starter's release: the merge queue merges only on an inspector's", async () => {
    const one = await anEntry()
    const pinned = await step(one.id, 'pinned', { files: contentOf(one.seal) })
    expect(pinned.status, pinned.raw).toBe(200)
    const byItsStarter = await release(one.run, {}, asSupervisor)
    expect(byItsStarter.status, byItsStarter.raw).toBe(201)
    expect(byItsStarter.body['released'].how).toBe('its starter')
    expect(byItsStarter.body['mergeQueue'].moved).toEqual([])
    expect(byItsStarter.body['mergeQueue'].waiting).toEqual([{ entry: one.id, state: 'pinned', says: expect.stringContaining("merges only on an inspector's release") }])
    const still = await entry(one.id)
    expect(still.state).toBe('pinned')
    // AND THE LANE IS NEVER TAKEN ON IT: H_RELEASE is asked again at the merge step.
    const taking = await step(one.id, 'integrating', {})
    expect(taking.status, taking.raw).toBe(409)
  })

  it('is not judged by a release that names another seal of the same run', async () => {
    const one = await anEntry()
    const pinned = await step(one.id, 'pinned', { files: contentOf(one.seal) })
    expect(pinned.status, pinned.raw).toBe(200)
    // THE RUN FINISHES AGAIN, which writes a second seal; the release names that one.
    const again = await call('PATCH', `/api/records/${one.run}`, asWorker, { dataPatch: { state: 'finished' } })
    expect(again.status, again.raw).toBe(200)
    const later = theSealOf(one.run)
    expect(later.id).not.toBe(one.seal.id)
    const released = await release(one.run)
    expect(released.status, released.raw).toBe(201)
    expect(released.body['released'].read.sealId).toBe(later.id)
    expect(released.body['mergeQueue'].moved).toEqual([])
    expect(released.body['mergeQueue'].waiting).toEqual([
      { entry: one.id, state: 'pinned', says: expect.stringContaining(`read seal ${later.id}, and this entry was submitted on seal ${one.seal.id}`) },
    ])
    expect((await entry(one.id)).state).toBe('pinned')
    const taking = await step(one.id, 'integrating', {})
    expect(taking.status, taking.raw).toBe(409)
  })

  it('bounces as refused on a refusal, tells the submitter why, and gives the secretary one line', async () => {
    const one = await anEntry()
    const pinned = await step(one.id, 'pinned', { files: contentOf(one.seal) })
    expect(pinned.status, pinned.raw).toBe(200)
    const refused = await refuse(one.run)
    expect(refused.status, refused.raw).toBe(201)
    expect(refused.body['mergeQueue'].moved).toEqual([{ entry: one.id, state: 'bounced', says: expect.stringContaining('refused') }])
    const bounced = await entry(one.id)
    expect(bounced.state).toBe('bounced')
    expect(bounced.occupies).toBeNull()
    expect(bounced.machine.bounced).toMatchObject({ reason: 'refused', files: [] })
    expect(bounced.machine.bounced.says).toContain('The test would pass with the feature deleted.')

    const told = bounced.machine.told
    const toTheSubmitter = messagesAbout(one.run).filter((m) => told.submitter.includes(m.id))
    expect(toTheSubmitter).toHaveLength(1)
    expect(toTheSubmitter[0]!.title).toBe(`Bounced (refused): merge entry ${one.id}`)
    expect(toTheSubmitter[0]!.to.map((who) => who.id).sort()).toEqual(['super-r', 'worker-w'].map(idOf).sort())
    expect(toTheSubmitter[0]!.body).toContain('submit again with POST /api/merge-queue')
    // THE NEXT STEP IS THE REFUSAL'S OWN (acceptance finding 8): answer the check, not "fix it in your sandbox".
    expect(toTheSubmitter[0]!.body).toContain("Next: read the check's refusal, answer what it names")
    expect(toTheSubmitter[0]!.body).not.toContain('fix it in your sandbox')
    // A REFUSAL OF THE WHOLE RUN IS SAID AS ONE, not as "in 0 files" (acceptance finding 10).
    const line = toTheSecretary(one.run).find((m) => m.id === told.secretary)
    expect(line?.title).toMatch(new RegExp(`^bounced [^:]+: worker-w #${one.id} refused by the check → back to worker-w$`, 'u'))
    expect(line?.body).toBe(line?.title)

    // A FINAL ENTRY TAKES NO STEP.
    const more = await step(one.id, 'integrating', {})
    expect(more.status, more.raw).toBe(409)
    expect(more.body['error']).toContain('final')
  })

  // MUTATION PROOF, 25 September 2026, alone in src/server/lib/merge-state-machine.ts: whoIsToldOfABounce's `add`
  // put back to comparing the stored strings, and this goes red, because the submitter stored as a handle is added
  // beside the same agent's registry id and the message door refuses the list.
  it('tells an agent named two ways once: a submitter stored as its handle is the starter stored by its id', async () => {
    const one = await anEntry()
    // THE SUBMITTER STORED AS A HANDLE, the way an entry written before the mint holds it. The starter of the
    // worker is the same agent, stored by its registry id.
    t.client.sqlite
      .prepare("UPDATE records SET data = json_set(data, '$.submittedBy', json(?)) WHERE id = ?")
      .run(JSON.stringify({ kind: 'agent', id: 'super-r' }), one.id)
    const pinned = await step(one.id, 'pinned', { files: contentOf(one.seal) })
    expect(pinned.status, pinned.raw).toBe(200)
    const refused = await refuse(one.run)
    expect(refused.status, refused.raw).toBe(201)
    const bounced = await entry(one.id)
    expect(bounced.state).toBe('bounced')
    const toTheSubmitter = messagesAbout(one.run).filter((m) => bounced.machine.told.submitter.includes(m.id))
    expect(toTheSubmitter).toHaveLength(1)
    expect(toTheSubmitter[0]!.to.map((who) => who.id).sort()).toEqual(['super-r', 'worker-w'].map(idOf).sort())
  })

  // ONE BOUNCE, ONE NOTICE TO EACH READER, problem 2-AtvZiEfVO9. The secretary that
  // submitted the entry, or started its run, reads the bounce notice, so its one line is not written as well.
  it('tells a secretary that is told in the bounce notice nothing more, and names that notice on the entry', async () => {
    const one = await anEntry()
    // The secretary started and owns the run's agent and submitted the entry. The run's notice goes to its owner,
    // who here is also its starter. Both fields are put back after the refusal.
    const secretary = idOf(THE_TEST_OFFICES_SECRETARY.handle)
    const worker = idOf('worker-w')
    const startedBy = t.client.sqlite.prepare('SELECT started_by_kind AS kind, started_by_id AS id, owner_id AS owner FROM agents WHERE id = ?').get(worker) as { kind: string; id: string; owner: string | null }
    t.client.sqlite.prepare('UPDATE agents SET started_by_kind = ?, started_by_id = ?, owner_id = ? WHERE id = ?').run('agent', secretary, secretary, worker)
    t.client.sqlite
      .prepare("UPDATE records SET data = json_set(data, '$.submittedBy', json(?)) WHERE id = ?")
      .run(JSON.stringify({ kind: 'agent', id: secretary }), one.id)
    const messagesBefore = everyMessage()
    let refusedReply: Record<string, unknown> = {}
    try {
      const pinned = await step(one.id, 'pinned', { files: contentOf(one.seal) })
      expect(pinned.status, pinned.raw).toBe(200)
      const refused = await refuse(one.run)
      expect(refused.status, refused.raw).toBe(201)
      refusedReply = refused.body
    } finally {
      t.client.sqlite.prepare('UPDATE agents SET started_by_kind = ?, started_by_id = ?, owner_id = ? WHERE id = ?').run(startedBy.kind, startedBy.id, startedBy.owner, worker)
    }
    const bounced = await entry(one.id)
    expect(bounced.state).toBe('bounced')
    const told = bounced.machine.told
    expect(told.submitter).toHaveLength(1)
    expect(told.secretary, 'the entry does not name the notice that told the secretary').toBe(told.submitter[0])
    expect(told.says).toContain('was told in the bounce notice')
    // The refusal's own line to the owner is not written as well: the bounce notice carries what it said, who refused
    // and the group opened about it. The check door's reply names that notice as the one that told the owner.
    expect(toTheSecretary(one.run).map((m) => m.id), 'the secretary, the starter, was told twice').toEqual([told.submitter[0]])
    const notice = messagesAbout(one.run).find((m) => m.id === told.submitter[0])!
    expect(notice.body, "the bounce notice does not carry the refusal's own line").toMatch(/refused to release worker-w\. What the refusal says is with worker-w, not here\. A group is open about it: /u)
    expect(refusedReply['toTheStarter'], 'the check door does not name the notice that told the starter').toBe(told.submitter[0])
    // AND THE REFUSAL ITSELF WROTE ITS OWN NOTICES, so the count is read about the bounce alone.
    const bounceNotices = messagesAbout(one.run).filter((m) => m.title.startsWith('Bounced (') || m.title.startsWith('bounced '))
    expect(bounceNotices, 'a bounce wrote more than one notice').toHaveLength(1)
    expect(everyMessage()).toBeGreaterThan(messagesBefore)
  })

  it('refuses every step from a state that is not its own, naming the state and what it waits on', async () => {
    const one = await anEntry()
    for (const [name, facts] of [
      ['integrating', {}],
      ['integrated', { result: one.seal.commit, mainAt: one.seal.forkBase, files: contentOf(one.seal) }],
      ['conflict', { files: [A] }],
      ['tested', { green: true, log: '/x' }],
      ['landing', { mainAt: 'x' }],
      ['main-moved', { mainAt: 'x' }],
      ['main-moved-while-testing', { mainAt: 'x' }],
      ['landed', { mainAfter: 'x' }],
    ] as [string, Record<string, unknown>][]) {
      const r = await step(one.id, name, facts)
      expect(r.status, `${name}: ${r.raw}`).toBe(409)
      expect(r.body['error']).toContain(`merge entry ${one.id} is submitted`)
    }
    expect((await entry(one.id)).state).toBe('submitted')
  })
})

// ============================================================================ 2 and 3. the lane, and the verdict following content

// A RUN IS RELEASED ONCE (decision CVfWgqGgLf1w, acceptance finding 71). On 24 September 2026 a released run bounced red,
// its notice said "finish and seal the run again, and submit again", and the new entry waited for a release the door
// will never write. A released run's remedy goes in under a new run, and nothing is filed that would wait for ever.
describe('a released run goes in again under a new run', () => {
  // MUTATION PROOF, 24 September 2026, alone in src/server/lib/merge-state-machine.ts: the notice told the run was never
  // released, and this goes red on today's words.
  it("tells the submitter of a released run that bounced to go in under a new run, and a run never released keeps today's words", async () => {
    const one = await anEntry('red')
    expect((await release(one.run)).status).toBe(201)
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    await toTesting(one.id, one.seal)
    const red = await step(one.id, 'tested', { green: false, redTests: ['tests/x.test.ts'], log: '/synthetic/suite.log' })
    expect(red.body['entry'].state, red.raw).toBe('bounced')
    const told = (await entry(one.id)).machine.told
    const toTheSubmitter = messagesAbout(one.run).filter((m) => told.submitter.includes(m.id))
    expect(toTheSubmitter).toHaveLength(1)
    expect(toTheSubmitter[0]!.body).toContain(`Next: fix the tests named above in your sandbox. ${aReleasedRunGoesInUnderANewRun(one.run)}`)
    expect(toTheSubmitter[0]!.body).not.toContain('finish and seal the run again')

    // A RUN NEVER RELEASED: a refusal bounces it, and it keeps today's words.
    const two = await anEntry()
    expect((await step(two.id, 'pinned', { files: contentOf(two.seal) })).status).toBe(200)
    expect((await refuse(two.run)).status).toBe(201)
    const toldTwo = (await entry(two.id)).machine.told
    const refusedNotice = messagesAbout(two.run).filter((m) => toldTwo.submitter.includes(m.id))
    expect(refusedNotice).toHaveLength(1)
    expect(refusedNotice[0]!.body).toContain("Next: read the check's refusal")
    expect(refusedNotice[0]!.body).not.toContain('a run is released once')
  })

  // A REFUSED REINSPECTION OF A RELEASED RUN (part (c) of the decision, acceptance finding 76). On 24 September 2026 the
  // scoped check of a released run's entry refused, and the notice said "finish the run again": finding 71's trap, since
  // the entry's run was released and the refusal was of the reinspection's run. MUTATION PROOF, 24 September 2026, alone
  // in src/server/lib/merge-state-machine.ts: `refused` put back beside churn and stalled, and this goes red on the old
  // words.
  it('tells the submitter of a released run whose reinspection was refused to go in under a new run, naming the run the check refused', async () => {
    const one = await anEntry('reinspect-refused-released')
    expect((await release(one.run)).status).toBe(201)
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    expect((await step(one.id, 'integrating', {})).status).toBe(200)
    const onTop = aCloneOnTopOfMain(one.dir)
    const integrated = await step(one.id, 'integrated', { result: onTop.result, mainAt: onTop.mainAt, clone: onTop.clone, files: onTop.files })
    expect(integrated.status, integrated.raw).toBe(200)
    const asked = integrated.body['entry'].machine.reinspection
    expect((await refuse(asked.run, { worktree: onTop.clone, only: [A] })).status).toBe(201)
    expect((await entry(one.id)).state).toBe('bounced')
    const told = (await entry(one.id)).machine.told
    const toTheSubmitter = messagesAbout(one.run).filter((m) => told.submitter.includes(m.id))
    expect(toTheSubmitter).toHaveLength(1)
    expect(toTheSubmitter[0]!.body).toContain(
      `Next: read the check's refusal and answer what it names in your sandbox. ${aReleasedRunGoesInUnderANewRun(one.run)} The new run takes the place of run ${String(asked.run)}, the reinspection the check refused`,
    )
    expect(toTheSubmitter[0]!.body).not.toContain('finish the run again')
  })

  // MUTATION PROOFS, 24 September 2026, each alone in src/server/lib/merge-queue.ts: the refusal taken out, and this goes
  // red on the new seal's filing; every released run refused, whatever its seal, and this goes red on the same seal's.
  it('refuses to file a released run on a seal its release did not read, in the same words, and files it on the seal it read', async () => {
    const one = await anEntry()
    expect((await release(one.run)).status).toBe(201)
    // THE SAME SEAL AGAIN, as a bounce for churn or a stalled tool asks for: the release still covers it, so it is filed.
    const withdrawn = await call('POST', `/api/merge-queue/${one.id}/withdraw`, asSupervisor, { because: 'To submit the same seal again.' })
    expect(withdrawn.status, withdrawn.raw).toBeLessThan(300)
    const same = await call('POST', '/api/merge-queue', asSupervisor, { run: one.run, changeset: { adapter: 'git', repository: 'fixture-main', branch: 'work' } })
    expect(same.status, same.raw).toBe(201)
    const sameWithdrawn = await call('POST', `/api/merge-queue/${String(same.body['entry'].id)}/withdraw`, asSupervisor, { because: 'The run finishes again.' })
    expect(sameWithdrawn.status, sameWithdrawn.raw).toBeLessThan(300)

    // A WRITE SAYING THE RUN IS FINISHED AGAIN NO LONGER SEALS A RELEASED RUN (wave 13s round 3): the pointer stays.
    const again = await call('PATCH', `/api/records/${one.run}`, asWorker, { dataPatch: { state: 'finished' } })
    expect(again.status, again.raw).toBe(200)
    expect(theSealOf(one.run).id).toBe(one.seal.id)
    // A NEW SEAL, as the record door made one before that change and as an older database can still hold: sealed
    // again after its release, and nothing is filed on it.
    const { sealFinishedRun } = await import('../src/server/lib/sealed-tip.ts')
    const resealed = sealFinishedRun(one.run, { ...t.api.getRecord(one.run)!.data }, { type: 'agent', id: 'worker-w' }, undefined)
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.sealedTip', ?) WHERE id = ?").run(resealed.sealedTip, one.run)
    const later = theSealOf(one.run)
    expect(later.id).not.toBe(one.seal.id)
    const refused = await call('POST', '/api/merge-queue', asSupervisor, { run: one.run, changeset: { adapter: 'git', repository: 'fixture-main', branch: 'work' } })
    expect(refused.status, refused.raw).toBe(409)
    const said = String(refused.body['error'] ?? '')
    expect(said).toContain(aReleasedRunGoesInUnderANewRun(one.run))
    expect(said).toContain(`Its release read seal ${one.seal.id}, and this submission is on seal ${later.id}. Nothing was written.`)
  })
})

describe('the lane, and the verdict following file content', () => {
  it('takes the lane at integrating, refuses a second holder, and an integrate with nothing changed goes to testing', async () => {
    const first = await anEntry('lane-a')
    const second = await anEntry('lane-b')
    for (const one of [first, second]) {
      expect((await release(one.run)).status).toBe(201)
      expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    }
    const taken = await step(first.id, 'integrating', {})
    expect(taken.status, taken.raw).toBe(200)
    expect(taken.body['entry'].occupies).toBe(mainCheckout)
    const refused = await step(second.id, 'integrating', {})
    expect(refused.status, refused.raw).toBe(409)
    expect(refused.body['error']).toContain(first.id)
    expect((await entry(second.id)).state).toBe('judged')

    const integrated = await step(first.id, 'integrated', { result: first.seal.commit, mainAt: first.seal.forkBase, files: contentOf(first.seal) })
    expect(integrated.status, integrated.raw).toBe(200)
    expect(integrated.body['entry'].state).toBe('testing')
    expect(integrated.body['decided']).toContain('3 paths keep the verdict')
    expect(integrated.body['entry'].machine.reinspection).toBeUndefined()
    // Let the lane go, so the file's later cases can take it.
    const withdrawn = await call('POST', `/api/merge-queue/${first.id}/withdraw`, asSupervisor, { because: 'the lane test is over' })
    expect(withdrawn.status, withdrawn.raw).toBe(200)
    const stillJudged = await call('POST', `/api/merge-queue/${second.id}/withdraw`, asSupervisor, { because: 'the lane test is over' })
    expect(stillJudged.status, stillJudged.raw).toBe(200)
  })

  it('asks for a scoped check of exactly the paths whose content changed, and the scoped release moves it to testing', async () => {
    const one = await anEntry('reinspect')
    expect((await release(one.run)).status).toBe(201)
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    expect((await step(one.id, 'integrating', {})).status).toBe(200)
    const onTop = aCloneOnTopOfMain(one.dir)
    expect(onTop.files[A]).not.toBe(contentOf(one.seal)[A])
    const integrated = await step(one.id, 'integrated', { result: onTop.result, mainAt: onTop.mainAt, clone: onTop.clone, files: onTop.files })
    expect(integrated.status, integrated.raw).toBe(200)
    expect(integrated.body['entry'].state).toBe('reinspecting')
    expect(integrated.body['decided']).toContain(`1 path needs judging again (${A})`)
    const asked = integrated.body['entry'].machine.reinspection
    expect(asked.only).toEqual([A])
    expect(asked.needsJudgment).toEqual([])
    expect(integrated.body['entry'].waitsOn).toContain(`on run ${asked.run}`)

    // THE CHECK-AGAIN RUN: filed by the office, serving the worker, sealed at the integrated tip on the moved main.
    const again = t.api.getRecord(asked.run)!
    expect(again.data['servingAgent']).toBe('worker-w')
    // AND THE REGISTRY ID IS WRITTEN BESIDE THE HANDLE (criterion I7). The handle stays for older
    // readers; the id is the agent's own, so a later rename cannot lose which agent the run served.
    const workerW = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get('worker-w') as { id: string }
    expect(again.data['servingAgentId']).toBe(workerW.id)
    expect(again.data['workingDirectory']).toBe(onTop.clone)
    expect(again.data['extra']).toMatchObject({ purpose: 'reinspection', mergeEntry: one.id })
    const againSeal = theSealOf(asked.run)
    expect(againSeal.commit).toBe(onTop.result)
    expect(againSeal.forkBase).toBe(onTop.mainAt)
    const theCheck = again.data['theCheck'] as { askedOf: string; message: string; only: string[]; needsJudgment: unknown[] }
    expect(theCheck.askedOf).toBe('inspector-one')
    expect(theCheck.only).toEqual([A])
    expect(theCheck.needsJudgment).toEqual([])
    // AND THE WORKER'S JOB CARRIES THE SCOPE, so the tool is started with --only.
    expect(inspection.inspectionForMessage(theCheck.message, 'inspector-one', WORKSPACE)).toEqual({ run: asked.run, checkout: onTop.clone, only: [A], needsJudgment: [] })

    const scoped = await release(asked.run, { worktree: onTop.clone, only: [A] })
    expect(scoped.status, scoped.raw).toBe(201)
    expect(scoped.body['mergeQueue'].moved).toEqual([{ entry: one.id, state: 'testing', says: expect.stringContaining('every path') }])
    const testing = await entry(one.id)
    expect(testing.state).toBe('testing')
    expect(testing.machine.judged).toEqual({ ...contentOf(one.seal), [A]: onTop.files[A] })
    expect(testing.machine.reinspected).toEqual([{ run: asked.run, only: [A], needsJudgment: [], releasedAt: expect.any(String) }])
    const withdrawn = await call('POST', `/api/merge-queue/${one.id}/withdraw`, asSupervisor, { because: 'the reinspection test is over' })
    expect(withdrawn.status, withdrawn.raw).toBe(200)
  })

  it('is not moved by a scoped release that does not cover the paths the queue asked about', async () => {
    const one = await anEntry('reinspect-elsewhere')
    expect((await release(one.run)).status).toBe(201)
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    expect((await step(one.id, 'integrating', {})).status).toBe(200)
    const onTop = aCloneOnTopOfMain(one.dir)
    const integrated = await step(one.id, 'integrated', { result: onTop.result, mainAt: onTop.mainAt, clone: onTop.clone, files: onTop.files })
    expect(integrated.status, integrated.raw).toBe(200)
    const asked = integrated.body['entry'].machine.reinspection
    expect(asked.only).toEqual([A])
    const elsewhere = await release(asked.run, { worktree: onTop.clone, only: [B] })
    expect(elsewhere.status, elsewhere.raw).toBe(201)
    expect(elsewhere.body['mergeQueue'].moved).toEqual([])
    expect(elsewhere.body['mergeQueue'].waiting).toEqual([{ entry: one.id, state: 'reinspecting', says: expect.stringContaining(`${A} is not covered`) }])
    const still = await entry(one.id)
    expect(still.state).toBe('reinspecting')
    expect(still.machine.judged[A]).toBe(contentOf(one.seal)[A])
  })

  it('bounces as refused when the scoped check refuses', async () => {
    const one = await anEntry('reinspect-refused')
    expect((await release(one.run)).status).toBe(201)
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    expect((await step(one.id, 'integrating', {})).status).toBe(200)
    const onTop = aCloneOnTopOfMain(one.dir)
    const integrated = await step(one.id, 'integrated', { result: onTop.result, mainAt: onTop.mainAt, clone: onTop.clone, files: onTop.files })
    expect(integrated.status, integrated.raw).toBe(200)
    const asked = integrated.body['entry'].machine.reinspection
    const refused = await refuse(asked.run, { worktree: onTop.clone, only: [A] })
    expect(refused.status, refused.raw).toBe(201)
    const bounced = await entry(one.id)
    expect(bounced.state).toBe('bounced')
    expect(bounced.occupies).toBeNull()
    expect(bounced.machine.bounced).toMatchObject({ reason: 'refused', files: [A], mainAt: onTop.mainAt })
  })

  // JUDGED ONCE (the queue finding, 23 September 2026, entry WOar71xCbL9D): a git entry's own release that
  // was told about a protected path, with --needs-judgment, keeps its verdict on that path while the content
  // is what it judged; only other content is asked about again, and that check is told why. MUTATION PROOF,
  // that day: the entry's own release not read at the integrate step, and the first case is red, sent to
  // reinspecting; the content condition dropped, and the second is red, its scoped check told nothing.
  it("keeps its own release's verdict on a protected path the release was told about, at the content it judged", async () => {
    const one = await anEntry('told-at-the-verdict')
    expect((await release(one.run, { needsJudgment: [{ path: RULES, why: WHY }] })).status).toBe(201)
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    expect((await step(one.id, 'integrating', {})).status).toBe(200)
    const clone = aCloneAtTheTip(one.dir)
    const checker = { tool: 'tools/checks/git-changeset.mjs', decided: [], needsJudgment: [{ path: RULES, why: WHY }] }
    const integrated = await step(one.id, 'integrated', { result: one.seal.commit, mainAt: one.seal.forkBase, clone, files: contentOf(one.seal), checker })
    expect(integrated.status, integrated.raw).toBe(200)
    expect(integrated.body['entry'].state).toBe('testing')
    expect(integrated.body['entry'].machine.reinspection).toBeUndefined()
  })

  it('asks again about a protected path its release was told about when the content is not what it judged, and tells that check why', async () => {
    const one = await anEntry('told-then-moved')
    expect((await release(one.run, { needsJudgment: [{ path: RULES, why: WHY }] })).status).toBe(201)
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    expect((await step(one.id, 'integrating', {})).status).toBe(200)
    const clone = aCloneAtTheTip(one.dir)
    const checker = { tool: 'tools/checks/git-changeset.mjs', decided: [], needsJudgment: [{ path: RULES, why: WHY }] }
    const moved = { ...contentOf(one.seal), [RULES]: 'c'.repeat(40) }
    const integrated = await step(one.id, 'integrated', { result: one.seal.commit, mainAt: one.seal.forkBase, clone, files: moved, checker })
    expect(integrated.status, integrated.raw).toBe(200)
    expect(integrated.body['entry'].state).toBe('reinspecting')
    expect(integrated.body['entry'].machine.reinspection.only).toEqual([RULES])
    expect(integrated.body['entry'].machine.reinspection.needsJudgment).toEqual([{ path: RULES, why: WHY }])
  })

  it('hands a protected path to the inspector even at a judged hash, and does not ask again once it was judged as handed on', async () => {
    const one = await anEntry('handed-on')
    expect((await release(one.run)).status).toBe(201)
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    expect((await step(one.id, 'integrating', {})).status).toBe(200)
    const clone = aCloneAtTheTip(one.dir)
    const checker = { tool: 'tools/checks/git-changeset.mjs', decided: [{ path: 'design/ground/TEST-AUDIT.md', check: 'regenerates', ok: true }], needsJudgment: [{ path: RULES, why: WHY }] }
    const integrated = await step(one.id, 'integrated', { result: one.seal.commit, mainAt: one.seal.forkBase, clone, files: contentOf(one.seal), checker })
    expect(integrated.status, integrated.raw).toBe(200)
    expect(integrated.body['entry'].state).toBe('reinspecting')
    const asked = integrated.body['entry'].machine.reinspection
    expect(asked.only).toEqual([RULES])
    expect(asked.needsJudgment).toEqual([{ path: RULES, why: WHY }])
    expect(integrated.body['entry'].machine.checked).toMatchObject({ tool: checker.tool, needsJudgment: checker.needsJudgment })
    const theCheck = t.api.getRecord(asked.run)!.data['theCheck'] as { message: string }
    expect(inspection.inspectionForMessage(theCheck.message, 'inspector-one', WORKSPACE)).toEqual({ run: asked.run, checkout: clone, only: [RULES], needsJudgment: [{ path: RULES, why: WHY }] })

    const scoped = await release(asked.run, { worktree: clone, only: [RULES], needsJudgment: [{ path: RULES, why: WHY }] })
    expect(scoped.status, scoped.raw).toBe(201)
    const testing = await entry(one.id)
    expect(testing.state).toBe('testing')
    expect(testing.machine.handedOn).toEqual({ [RULES]: contentOf(one.seal)[RULES] })

    // THE MAIN WORLD MOVES AT LANDING; the entry integrates again with the same checker report, and the
    // path it handed on is not asked about a second time at the same content.
    expect((await step(one.id, 'tested', { green: true, log: '/synthetic/suite.log' })).status).toBe(200)
    expect((await step(one.id, 'landing', { mainAt: one.seal.forkBase })).status).toBe(200)
    const moved = await step(one.id, 'main-moved', { mainAt: 'b'.repeat(40) })
    expect(moved.status, moved.raw).toBe(200)
    expect(moved.body['entry'].state).toBe('judged')
    expect((await step(one.id, 'integrating', {})).status).toBe(200)
    const again = await step(one.id, 'integrated', { result: one.seal.commit, mainAt: one.seal.forkBase, clone, files: contentOf(one.seal), checker })
    expect(again.status, again.raw).toBe(200)
    expect(again.body['entry'].state).toBe('testing')
    expect(again.body['entry'].machine.reinspected).toHaveLength(1)
    const withdrawn = await call('POST', `/api/merge-queue/${one.id}/withdraw`, asSupervisor, { because: 'the handed-on test is over' })
    expect(withdrawn.status, withdrawn.raw).toBe(200)
  })

  it('bounces as guard on a decided failure, on a conflict, and on a failed guard, naming the files', async () => {
    const decided = await anEntry('decided')
    expect((await release(decided.run)).status).toBe(201)
    expect((await step(decided.id, 'pinned', { files: contentOf(decided.seal) })).body['entry'].state).toBe('judged')
    expect((await step(decided.id, 'integrating', {})).status).toBe(200)
    const failing = { tool: 'tools/checks/git-changeset.mjs', decided: [{ path: 'design/rules/CODE.md', check: 'regenerates', ok: false, detail: '20 lines differ' }], needsJudgment: [] }
    const guard = await step(decided.id, 'integrated', { result: decided.seal.commit, mainAt: decided.seal.forkBase, files: contentOf(decided.seal), checker: failing })
    expect(guard.status, guard.raw).toBe(200)
    expect(guard.body['entry'].state).toBe('bounced')
    expect(guard.body['entry'].occupies).toBeNull()
    expect(guard.body['entry'].machine.bounced).toMatchObject({ reason: 'guard', files: ['design/rules/CODE.md'] })
    expect(guard.body['entry'].machine.bounced.says).toContain('20 lines differ')

    const conflict = await anEntry('conflict')
    expect((await release(conflict.run)).status).toBe(201)
    expect((await step(conflict.id, 'pinned', { files: contentOf(conflict.seal) })).body['entry'].state).toBe('judged')
    expect((await step(conflict.id, 'integrating', {})).status).toBe(200)
    const bounced = await step(conflict.id, 'conflict', { files: [A, B], mainAt: 'c'.repeat(40), log: '/synthetic/merge.log' })
    expect(bounced.status, bounced.raw).toBe(200)
    expect(bounced.body['entry'].state).toBe('bounced')
    expect(bounced.body['entry'].machine.bounced).toMatchObject({ reason: 'conflict', files: [A, B], log: '/synthetic/merge.log', mainAt: 'c'.repeat(40) })
    const toTheSubmitter = messagesAbout(conflict.run).find((m) => m.title === `Bounced (conflict): merge entry ${conflict.id}`)
    expect(toTheSubmitter?.body).toContain(`Files: ${A}, ${B}.`)
    expect(toTheSubmitter?.body).toContain('Log: /synthetic/merge.log')
    // REBASE, NOT A MERGE OF MAIN (acceptance finding 37; the note of 24 September 2026, message Dkd2vh03I1HL): the
    // queue lands by rebasing, so a merge commit's resolution would be dropped at landing. MUTATION PROOF, that day, alone
    // in src/server/lib/merge-state-machine.ts: the old words put back, and this goes red.
    expect(toTheSubmitter?.body).toContain('Next: rebase your branch onto main in your sandbox and resolve the conflict there.')
    expect(toTheSubmitter?.body).not.toContain('bring main into your branch')
    expect(toTheSecretary(conflict.run).some((m) => m.title.startsWith(`bounced `) && m.title.includes(`#${conflict.id} conflict in 2 files`))).toBe(true)

    const guarded = await anEntry('guarded')
    expect((await release(guarded.run)).status).toBe(201)
    expect((await step(guarded.id, 'pinned', { files: contentOf(guarded.seal) })).body['entry'].state).toBe('judged')
    expect((await step(guarded.id, 'integrating', {})).status).toBe(200)
    const failed = await step(guarded.id, 'guard-failed', { guard: 'mutation marker', files: [A], detail: 'src carries an applied mutation.' })
    expect(failed.status, failed.raw).toBe(200)
    expect(failed.body['entry'].machine.bounced).toMatchObject({ reason: 'guard', files: [A] })
    expect(failed.body['entry'].machine.bounced.says).toContain('mutation marker')
  })
})

// ============================================================================ 5. testing and landing

describe('testing and landing', () => {
  it('bounces as red naming the tests, and a red run that names none is refused', async () => {
    const one = await anEntry('red')
    expect((await release(one.run)).status).toBe(201)
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    await toTesting(one.id, one.seal)
    const unnamed = await step(one.id, 'tested', { green: false, log: '/synthetic/suite.log' })
    expect(unnamed.status, unnamed.raw).toBe(422)
    expect((await entry(one.id)).state).toBe('testing')
    const red = await step(one.id, 'tested', { green: false, redTests: ['tests/x.test.ts'], log: '/synthetic/suite.log' })
    expect(red.status, red.raw).toBe(200)
    expect(red.body['entry'].state).toBe('bounced')
    expect(red.body['entry'].machine.bounced).toMatchObject({ reason: 'red', redTests: ['tests/x.test.ts'], log: '/synthetic/suite.log' })
    expect(toTheSecretary(one.run).some((m) => m.title.includes(`#${one.id} red in 1 red test`))).toBe(true)
  })

  it('lands only after a green run, on the main world it was integrated on, and cannot be withdrawn while landing', async () => {
    const one = await anEntry('landing')
    expect((await release(one.run)).status).toBe(201)
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    await toTesting(one.id, one.seal)
    const untested = await step(one.id, 'landing', { mainAt: one.seal.forkBase })
    expect(untested.status, untested.raw).toBe(409)
    expect(untested.body['error']).toContain('no green test run')
    expect((await step(one.id, 'tested', { green: true, log: '/synthetic/suite.log' })).status).toBe(200)
    const elsewhere = await step(one.id, 'landing', { mainAt: 'd'.repeat(40) })
    expect(elsewhere.status, elsewhere.raw).toBe(422)
    expect((await entry(one.id)).state).toBe('testing')
    const landing = await step(one.id, 'landing', { mainAt: one.seal.forkBase })
    expect(landing.status, landing.raw).toBe(200)
    expect(landing.body['entry'].state).toBe('landing')
    const withdrawn = await call('POST', `/api/merge-queue/${one.id}/withdraw`, asSupervisor, { because: 'too late' })
    expect(withdrawn.status, withdrawn.raw).toBe(409)
    // Let the lane go for the cases after this one.
    const landed = await step(one.id, 'landed', { mainAfter: one.seal.commit })
    expect(landed.status, landed.raw).toBe(200)
    // A GREEN RUN WHOSE COUNTS THE TOOL DID NOT REPORT is said to be green, and its log is not in the line.
    const line = toTheSecretary(one.run).find((m) => m.id === landed.body['entry'].machine.told.secretary)
    expect(line?.title).toMatch(new RegExp(`^merged [^:]+: worker-w #${one.id} 3 files → main ${one.seal.commit.slice(0, 7)} \\(tests green, reinspected 0\\)$`, 'u'))
  })

  it('goes back to judged when the main world moved, freeing the lane and dropping the test run, and bounces as churn the fourth time', async () => {
    const one = await anEntry('churn')
    expect((await release(one.run)).status).toBe(201)
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    for (let attempt = 1; attempt <= MAX_LANDING_ATTEMPTS; attempt += 1) {
      await toLanding(one.id, one.seal)
      const moved = await step(one.id, 'main-moved', { mainAt: `${String(attempt)}`.repeat(40) })
      expect(moved.status, moved.raw).toBe(200)
      expect(moved.body['entry'].state).toBe('judged')
      expect(moved.body['entry'].occupies).toBeNull()
      expect(moved.body['entry'].machine.attempts).toBe(attempt)
      expect(moved.body['entry'].machine.tested).toBeUndefined()
    }
    await toLanding(one.id, one.seal)
    const churn = await step(one.id, 'main-moved', { mainAt: '9'.repeat(40) })
    expect(churn.status, churn.raw).toBe(200)
    expect(churn.body['entry'].state).toBe('bounced')
    expect(churn.body['entry'].machine.bounced).toMatchObject({ reason: 'churn', mainAt: '9'.repeat(40) })
    // THE SUBMITTER IS TOLD ITS WORK IS NOT AT FAULT, and to submit the same sealed run again
    // (acceptance finding 8). Churn is the main world moving, which the submitter did not do.
    const toTheSubmitter = messagesAbout(one.run).filter((m) => churn.body['entry'].machine.told.submitter.includes(m.id))
    expect(toTheSubmitter).toHaveLength(1)
    expect(toTheSubmitter[0]!.body).toContain('nothing in your work is wrong')
    expect(toTheSubmitter[0]!.body).toContain('when the main world is quieter')
    expect(toTheSubmitter[0]!.body).not.toContain('fix it in your sandbox')
  })

  // ACCEPTANCE FINDING 54, THE APPROVED STEP (message yGDKJuwi6VbE): the tool says main moved while the entry was
  // tested, before it runs red files again or compares them with main, and the office handles it as landing's
  // main-moved, counted with it toward churn.
  // MUTATION PROOF, 23 September 2026, in src/server/lib/merge-state-machine.ts: the new step not counted as an attempt
  // (attempts kept as they were), and the count and the churn below go red.
  it('goes back to judged when the main world moved while the entry was tested, and counts that with landing\'s moves toward churn', async () => {
    const one = await anEntry('moved-in-testing')
    expect((await release(one.run)).status).toBe(201)
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    await toTesting(one.id, one.seal)
    const moved = await step(one.id, 'main-moved-while-testing', { mainAt: '1'.repeat(40) })
    expect(moved.status, moved.raw).toBe(200)
    expect(moved.body['entry'].state).toBe('judged')
    expect(moved.body['entry'].occupies).toBeNull()
    expect(moved.body['entry'].machine.attempts).toBe(1)
    expect(moved.body['entry'].machine.tested).toBeUndefined()
    expect(moved.body['decided']).toContain('while its tests ran, so nothing more was run on the tree it tested')
    // NOT FROM LANDING, where main-moved is the step, and not from judged.
    const notFromJudged = await step(one.id, 'main-moved-while-testing', { mainAt: '2'.repeat(40) })
    expect(notFromJudged.status, notFromJudged.raw).toBe(409)
    await toLanding(one.id, one.seal)
    const notFromLanding = await step(one.id, 'main-moved-while-testing', { mainAt: '2'.repeat(40) })
    expect(notFromLanding.status, notFromLanding.raw).toBe(409)
    expect((await step(one.id, 'main-moved', { mainAt: '2'.repeat(40) })).body['entry'].machine.attempts).toBe(2)
    await toTesting(one.id, one.seal)
    expect((await step(one.id, 'main-moved-while-testing', { mainAt: '3'.repeat(40) })).body['entry'].machine.attempts).toBe(3)
    await toTesting(one.id, one.seal)
    const churn = await step(one.id, 'main-moved-while-testing', { mainAt: '9'.repeat(40) })
    expect(churn.status, churn.raw).toBe(200)
    expect(churn.body['entry'].state).toBe('bounced')
    expect(churn.body['entry'].machine.bounced).toMatchObject({ reason: 'churn', mainAt: '9'.repeat(40) })
  })

  it('lands only what was tested, and then is merged: the receipt is on the entry and on the run, and the secretary gets one line', async () => {
    const one = await anEntry('merged')
    expect((await release(one.run)).status).toBe(201)
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    await toLanding(one.id, one.seal)
    const other = await step(one.id, 'landed', { mainAfter: 'e'.repeat(40) })
    expect(other.status, other.raw).toBe(422)
    expect(other.body['error']).toContain('Only what was tested may land')
    expect((await entry(one.id)).state).toBe('landing')

    // ONE LANDING WRITES ONE NOTICE, to anybody, about anything, problem 2-AtvZiEfVO9.
    const messagesBefore = everyMessage()
    const landed = await step(one.id, 'landed', { mainAfter: one.seal.commit })
    expect(landed.status, landed.raw).toBe(200)
    expect(everyMessage() - messagesBefore, 'one landing wrote more than one notice').toBe(1)
    const merged = landed.body['entry']
    expect(merged.state).toBe('merged')
    expect(merged.occupies).toBeNull()
    const receipt = {
      entry: one.id,
      mainBefore: one.seal.forkBase,
      mainAfter: one.seal.commit,
      rebasedTip: one.seal.commit,
      sealId: one.seal.id,
      carriedVerdict: { run: one.run, by: { kind: 'agent', id: idOf('inspector-one') }, at: expect.any(String), how: 'an inspector', paths: 3, says: expect.stringContaining('covered the pinned content') },
      reinspected: [],
      tests: { log: '/synthetic/suite.log', ran: 10, passed: 10 },
      at: expect.any(String),
      // The clock observation beside `at`: the queue's speed counts a landing from its instant, which `at` alone
      // does not name in the hour the clocks go back.
      time: { stamp: expect.any(String), instant: expect.any(String), offset: expect.any(String), timeZone: expect.any(String) },
    }
    expect(merged.machine.integrated).toEqual(receipt)
    expect(merged.machine.integrated.time.stamp).toBe(merged.machine.integrated.at)
    expect(t.api.getRecord(one.run)!.data['integrated']).toEqual(receipt)
    const line = toTheSecretary(one.run).find((m) => m.id === merged.machine.told.secretary)
    expect(line?.title).toMatch(new RegExp(`^merged [^:]+: worker-w #${one.id} 3 files → main ${one.seal.commit.slice(0, 7)} \\(tests 10/10, reinspected 0\\)$`, 'u'))
    // ONE LINE TO THE SECRETARY AND NOBODY ELSE: an office message to one recipient would otherwise go to
    // the run's agent too, and every message to an agent is delivered by starting its tool.
    expect(line?.to).toEqual([{ kind: 'agent', id: idOf(THE_TEST_OFFICES_SECRETARY.handle) }])

    const more = await step(one.id, 'landed', { mainAfter: one.seal.commit })
    expect(more.status, more.raw).toBe(409)
  })

  it("says a push that failed after the landing on the entry itself, as well as in the secretary's one line", async () => {
    // A FAILED PUSH TO THE MIRROR OR TO THE GITHUB COPY does not undo the landing, and the entry says it (13u round 74).
    const one = await anEntry('push-failed')
    expect((await release(one.run)).status).toBe(201)
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    await toLanding(one.id, one.seal)
    const failure = 'Synthetic: the push to the mirror at /synthetic/mirror.git failed. Main was not rolled back.'
    const landed = await step(one.id, 'landed', { mainAfter: one.seal.commit, pushFailure: failure })
    expect(landed.status, landed.raw).toBe(200)
    expect(landed.body['entry'].state).toBe('merged')
    expect(landed.body['entry'].machine.told.says).toContain(failure)
    expect((await entry(one.id)).machine.told.says, 'read again from the stored entry').toContain(failure)
    const line = toTheSecretary(one.run).find((m) => m.id === landed.body['entry'].machine.told.secretary)
    expect(line?.title).toContain(failure)
  })
})

// ============================================================================ 6. the files adapter's deletes

describe("a files entry's deletes wait for the secretary", () => {
  const sha = (c: string): string => c.repeat(64)

  it('asks the secretary at pin, refuses to land until confirmed, and takes the confirmation only from the secretary or the person', async () => {
    // THE ADD'S BYTES ARE IN THE RUN'S SEAL, as a files entry's must be (case 8).
    const A_PDF = 'Synthetic: the bytes of a restored report file.\n'
    const sealed = await aStagedRun({ 'report-files/a.pdf': A_PDF })
    const root = aFilesRoot('files-root')
    const operations = [
      { op: 'add', path: 'report-files/a.pdf', before: ABSENT, after: sha256(A_PDF), source: 'recovery/originals/a.pdf' },
      { op: 'delete', path: 'old/c.txt', before: sha('d'), after: ABSENT, source: 'superseded by a.pdf' },
    ]
    const submitted = await call('POST', '/api/merge-queue', asSupervisor, { run: sealed.run, changeset: { adapter: 'files', root, stagedAt: sealed.stagedAt, operations } })
    expect(submitted.status, submitted.raw).toBe(201)
    const id = String(submitted.body['entry'].id)
    const content = { 'report-files/a.pdf': sha256(A_PDF), 'old/c.txt': ABSENT }

    const pinned = await step(id, 'pinned', { files: content, checker: { tool: 'tools/checks/files-changeset.mjs', decided: [{ path: 'report-files/a.pdf', check: 'sha256', ok: true }], needsJudgment: [{ path: 'old/c.txt', why: 'A delete waits for the secretary.' }] } })
    expect(pinned.status, pinned.raw).toBe(200)
    expect(pinned.body['entry'].state).toBe('pinned')
    expect(pinned.body['decided']).toContain('the secretary was asked to confirm')
    const deletes = pinned.body['entry'].machine.deletes
    expect(deletes.paths).toEqual(['old/c.txt'])
    const asked = toTheSecretary(sealed.run).find((m) => m.id === deletes.asked)
    expect(asked?.title).toBe(`Confirm 1 delete before merge entry ${id} lands`)
    expect(asked?.to).toEqual([{ kind: 'agent', id: idOf(THE_TEST_OFFICES_SECRETARY.handle) }])
    expect(asked?.body).toContain('- old/c.txt')
    expect(asked?.body).toContain(`POST /api/merge-queue/${id}/confirm-deletes`)
    expect(pinned.body['entry'].waitsOn).toContain('confirm-deletes')

    expect((await release(sealed.run)).status).toBe(201)
    expect((await entry(id)).state).toBe('judged')
    expect((await step(id, 'integrating', {})).status).toBe(200)
    // THE DELETE IS NOT A PATH FOR THE INSPECTOR: the checker hands it on, and the secretary answers it.
    const integrated = await step(id, 'integrated', { result: 'staged', mainAt: 'the folder before', files: content, checker: { tool: 'tools/checks/files-changeset.mjs', decided: [], needsJudgment: [{ path: 'old/c.txt', why: 'A delete waits for the secretary.' }] } })
    expect(integrated.status, integrated.raw).toBe(200)
    expect(integrated.body['entry'].state).toBe('testing')
    expect((await step(id, 'tested', { green: true, log: '/synthetic/read-back.log' })).status).toBe(200)

    const held = await step(id, 'landing', { mainAt: 'the folder before' })
    expect(held.status, held.raw).toBe(409)
    expect(held.body['error']).toContain('no secretary has confirmed')
    expect((await entry(id)).state).toBe('testing')

    const stranger = await call('POST', `/api/merge-queue/${id}/confirm-deletes`, asStranger, { because: 'not mine' })
    expect(stranger.status, stranger.raw).toBe(403)
    const worker = await call('POST', `/api/merge-queue/${id}/confirm-deletes`, asWorker, { because: 'my own delete' })
    expect(worker.status, worker.raw).toBe(403)
    const noReason = await call('POST', `/api/merge-queue/${id}/confirm-deletes`, asSecretary, {})
    expect(noReason.status, noReason.raw).toBe(400)
    const confirmed = await call('POST', `/api/merge-queue/${id}/confirm-deletes`, asSecretary, { because: 'old/c.txt is superseded by a.pdf.' })
    expect(confirmed.status, confirmed.raw).toBe(200)
    expect(confirmed.body['entry'].machine.deletes.confirmed).toMatchObject({ by: { kind: 'agent', id: idOf(THE_TEST_OFFICES_SECRETARY.handle) }, because: 'old/c.txt is superseded by a.pdf.' })
    const twice = await call('POST', `/api/merge-queue/${id}/confirm-deletes`, asPerson, { because: 'again' })
    expect(twice.status, twice.raw).toBe(409)

    const landing = await step(id, 'landing', { mainAt: 'the folder before' })
    expect(landing.status, landing.raw).toBe(200)
    const landed = await step(id, 'landed', { mainAfter: 'the folder after' })
    expect(landed.status, landed.raw).toBe(200)
    expect(landed.body['entry'].state).toBe('merged')
    expect(landed.body['entry'].machine.integrated).toMatchObject({ rebasedTip: null, mainBefore: 'the folder before', mainAfter: 'the folder after' })
    // THE LINE SAYS WHERE IT LANDED, AND NO TESTS: a files changeset ran none, and the log the tool named
    // beside its `tested` step is the tool's own (issue 7).
    const line = toTheSecretary(sealed.run).find((m) => m.id === landed.body['entry'].machine.told.secretary)
    expect(line?.title).toBe(`merged ${root.split('/').at(-1)!}: worker-w #${id} 2 files → ${root}`)
  })

  it('has nothing to confirm on an entry that deletes nothing', async () => {
    const one = await anEntry('no-deletes')
    const r = await call('POST', `/api/merge-queue/${one.id}/confirm-deletes`, asPerson, { because: 'nothing' })
    expect(r.status, r.raw).toBe(409)
    expect(r.body['error']).toContain('deletes nothing')
  })

  /**
   * MUTATION PROOF, run on 23 September 2026 in src/server/lib/merge-state-machine.ts.
   *
   * Control: both cases green, each answering 409 "deletes nothing" — the entry is a git entry, so
   * the secretary check is the only gate the press could fail. Then `maySpeakForTheSecretary` was put
   * back on `const row = agentByHandle(me.id)`: both cases answer 403 "Only whoever holds the
   * secretary card", because `me.id` is the minted id and no handle column carries it. The line was
   * restored and the control run again.
   */
  it('takes the confirmation from a secretary whose id is not its handle, by handle and by id', async () => {
    // A minted secretary written straight at the table, because the mint is piece I-1b and has not
    // landed. Its handle sorts after `the coordinator`, so `whoHoldsTheSecretaryCard` still answers the coordinator.
    const mintedId = 'Zm5nR3wXc9Yr'
    const mintedHandle = 'zz-minted-secretary'
    const avatar = `avatar-default-agent-${mintedId}`
    t.client.sqlite
      .prepare(
        'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
          "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
          "'generated') ON CONFLICT(id) DO NOTHING",
      )
      .run(avatar, '2026-09-23 10:00:00')
    t.client.sqlite
      .prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, retired, role, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)')
      .run(mintedId, 'Minted Secretary', mintedHandle, avatar, 'secretary', '2026-09-23 10:00:00')

    const one = await anEntry('minted-secretary-confirm')
    for (const who of [mintedHandle, mintedId]) {
      const r = await call('POST', `/api/merge-queue/${one.id}/confirm-deletes`, as('agent', who), { because: 'the signed-off reason' })
      expect(r.status, `${who}: ${r.raw}`).toBe(409)
      expect(r.body['error']).toContain('deletes nothing')
    }
  })
})

// ============================================================================ 7. a withdrawal is an end too

describe('a withdrawal gives the secretary one line', () => {
  it('writes the line and records it on the entry', async () => {
    const one = await anEntry('withdrawn')
    const r = await call('POST', `/api/merge-queue/${one.id}/withdraw`, asSupervisor, { because: 'the run found a mistake after it submitted' })
    expect(r.status, r.raw).toBe(200)
    const told = r.body['entry'].machine.told
    const line = toTheSecretary(one.run).find((m) => m.id === told.secretary)
    expect(line?.title).toMatch(new RegExp(`^withdrawn [^:]+: worker-w #${one.id} by super-r: the run found a mistake after it submitted$`, 'u'))
  })
})

// ============================================================================ 8. a files entry's bytes, bound to its seal

describe('a files entry is judged only on bytes its seal froze, and bounces when no check can read it', () => {
  const SEALED = 'Synthetic: bytes the run committed, which its seal holds.\n'
  const UNSEALED = 'Synthetic: bytes staged somewhere the seal never saw.\n'
  const FILES_CHECKER = 'tools/checks/files-changeset.mjs'

  async function aFilesEntry(sealed: Awaited<ReturnType<typeof aStagedRun>>, operations: Record<string, unknown>[]): Promise<{ id: string; root: string }> {
    const root = aFilesRoot('files-root')
    const r = await call('POST', '/api/merge-queue', asSupervisor, { run: sealed.run, changeset: { adapter: 'files', root, stagedAt: sealed.stagedAt, operations } })
    expect(r.status, r.raw).toBe(201)
    return { id: String(r.body['entry'].id), root }
  }

  it('bounces at the pin as unjudged when a byte it lands is not in its seal, naming the path, and pins one whose bytes the seal holds', async () => {
    const sealed = await aStagedRun({ 'report-files/a.txt': SEALED })
    const add = (path: string, text: string) => ({ op: 'add', path, before: ABSENT, after: sha256(text), source: 'synthetic: tests/merge-state-machine.test.ts' })
    const mixed = await aFilesEntry(sealed, [add('report-files/a.txt', SEALED), add('report-files/b.txt', UNSEALED)])
    const content = { 'report-files/a.txt': sha256(SEALED), 'report-files/b.txt': sha256(UNSEALED) }
    const bounced = await step(mixed.id, 'pinned', { files: content, checker: { tool: FILES_CHECKER, decided: [], needsJudgment: [] } })
    expect(bounced.status, bounced.raw).toBe(200)
    expect(bounced.body['entry'].state).toBe('bounced')
    expect(bounced.body['entry'].machine.bounced).toMatchObject({ reason: 'unjudged', files: ['report-files/b.txt'] })
    expect(bounced.body['entry'].machine.bounced.says).toContain(`report-files/b.txt (sha256 ${sha256(UNSEALED).slice(0, 12)}…) are not among the files seal ${sealed.seal.id} froze`)
    expect(bounced.body['entry'].machine.bounced.says).not.toContain('report-files/a.txt')
    const line = toTheSecretary(sealed.run).find((m) => m.id === bounced.body['entry'].machine.told.secretary)
    expect(line?.title).toBe(`bounced ${mixed.root.split('/').at(-1)!}: worker-w #${mixed.id} unjudged in 1 file → back to worker-w`)

    // THE SAME RUN, LANDING ONLY WHAT IT SEALED, is pinned, and judged on the release.
    const clean = await aFilesEntry(sealed, [add('report-files/a.txt', SEALED)])
    const pinned = await step(clean.id, 'pinned', { files: { 'report-files/a.txt': sha256(SEALED) }, checker: { tool: FILES_CHECKER, decided: [], needsJudgment: [] } })
    expect(pinned.status, pinned.raw).toBe(200)
    expect(pinned.body['entry'].state).toBe('pinned')
    expect((await release(sealed.run)).status).toBe(201)
    expect((await entry(clean.id)).state).toBe('judged')
  })

  it('bounces at the pin as unjudged when the files checker hands on a path that is not a delete, and not for its delete', async () => {
    const sealed = await aStagedRun({ 'report-files/n.md': SEALED })
    const operations = [
      { op: 'add', path: 'report-files/n.md', before: ABSENT, after: sha256(SEALED), source: 'synthetic: written by a test' },
      { op: 'delete', path: 'old/c.txt', before: 'd'.repeat(64), after: ABSENT, source: 'synthetic: superseded' },
    ]
    const one = await aFilesEntry(sealed, operations)
    const why = 'No content check exists for .md files, and it is not a byte-for-byte copy of a source file on this machine.'
    const checker = { tool: FILES_CHECKER, decided: [], needsJudgment: [{ path: 'report-files/n.md', why }, { path: 'old/c.txt', why: 'A delete waits for the secretary.' }] }
    const r = await step(one.id, 'pinned', { files: { 'report-files/n.md': sha256(SEALED), 'old/c.txt': ABSENT }, checker })
    expect(r.status, r.raw).toBe(200)
    expect(r.body['entry'].state).toBe('bounced')
    expect(r.body['entry'].machine.bounced).toMatchObject({ reason: 'unjudged', files: ['report-files/n.md'] })
    expect(r.body['entry'].machine.bounced.says).toContain(`report-files/n.md needs an inspector's reading (${why})`)
    expect(r.body['entry'].machine.bounced.says).toContain('No check can read a files entry yet')
    expect(r.body['entry'].machine.checked).toMatchObject({ tool: FILES_CHECKER, needsJudgment: checker.needsJudgment })
    const told = messagesAbout(sealed.run).find((m) => m.title === `Bounced (unjudged): merge entry ${one.id}`)
    expect(told?.to.map((who) => who.id).sort()).toEqual(['super-r', 'worker-w'].map(idOf).sort())
  })

  it('bounces at the integrate step as unjudged, and lets its lane go, when a path needs a check again', async () => {
    const sealed = await aStagedRun({ 'report-files/a.txt': SEALED })
    const one = await aFilesEntry(sealed, [{ op: 'add', path: 'report-files/a.txt', before: ABSENT, after: sha256(SEALED), source: 'synthetic' }])
    const content = { 'report-files/a.txt': sha256(SEALED) }
    expect((await release(sealed.run)).status).toBe(201)
    expect((await step(one.id, 'pinned', { files: content, checker: { tool: FILES_CHECKER, decided: [], needsJudgment: [] } })).body['entry'].state).toBe('judged')
    expect((await step(one.id, 'integrating', {})).body['entry'].occupies).toBe(one.root)
    // THE MAIN WORLD'S DECLARATION PROTECTS THE PATH NOW, so the checker hands it on at the integrate step.
    const why = 'It is in a protected area ("report-files/" in .mole-office/protected.json). Read it.'
    const integrated = await step(one.id, 'integrated', { result: 'landing-plan-sha256:x', mainAt: 'folder-sha256:before', files: content, checker: { tool: FILES_CHECKER, decided: [], needsJudgment: [{ path: 'report-files/a.txt', why }] } })
    expect(integrated.status, integrated.raw).toBe(200)
    expect(integrated.body['entry'].state).toBe('bounced')
    expect(integrated.body['entry'].occupies).toBeNull()
    expect(integrated.body['entry'].machine.bounced).toMatchObject({ reason: 'unjudged', files: ['report-files/a.txt'], mainAt: 'folder-sha256:before' })
    expect(integrated.body['entry'].machine.bounced.says).toContain(why)
    expect(integrated.body['entry'].machine.reinspection).toBeUndefined()
    const lane = await call('GET', `/api/merge-queue?lane=${encodeURIComponent(one.root)}`, asStranger)
    expect(lane.body['lanes'][0].occupiedBy).toBeNull()
  })
})

// ============================================================================ 9. a merge tool run that ended in place

describe('a merge tool run that ended without moving its entry', () => {
  const aToolRun = (): string =>
    t.api.createRecord({ kind: 'session', title: 'Synthetic merge tool run', workspaceId: WORKSPACE, actor: { type: 'agent', id: THE_WORKER }, origin: 'fixture', data: { state: 'running', runtime: 'merge-tool' } }).id

  /** One tool run through the tool doors, as the worker records it: the start, then the ending with these words. */
  async function aRunThatEnds(id: string, reason: string): Promise<{ session: string; ended: Record<string, any> }> {
    const session = aToolRun()
    const started = await call('POST', `/api/merge-queue/${id}/tool-started`, asTheOffice, { session, log: '/synthetic/the-merger.log' })
    expect(started.status, started.raw).toBe(200)
    expect(started.body['entry'].toolWanted).toBeNull()
    const ended = await call('POST', `/api/merge-queue/${id}/tool-ended`, asTheOffice, { session, reason })
    expect(ended.status, ended.raw).toBe(200)
    return { session, ended: ended.body }
  }

  it('asks for the tool again after each, and the third bounces the entry as stalled with that run\'s words', async () => {
    const one = await anEntry('stalls')
    for (let run = 1; run < MAX_TOOL_RUNS_IN_ONE_PLACE; run += 1) {
      const { session, ended } = await aRunThatEnds(one.id, `Synthetic run ${String(run)} crashed.`)
      expect(ended['entry'].state).toBe('submitted')
      expect(ended['entry'].toolWanted).toEqual({ since: expect.any(String) })
      expect(ended['entry'].machine.stalls).toMatchObject({ runs: run })
      expect(ended['says']).toContain('asks for its merge tool again')
      // THE WORKER REPORTS THE SAME ENDING AGAIN when it finds the process gone, and it is not counted twice.
      const again = await call('POST', `/api/merge-queue/${one.id}/tool-ended`, asTheOffice, { session, reason: `Synthetic run ${String(run)} crashed.` })
      expect(again.status, again.raw).toBe(200)
      expect(again.body['entry'].machine.stalls).toMatchObject({ runs: run })
    }
    const { ended } = await aRunThatEnds(one.id, 'Synthetic: the last run could not read the staged folder.')
    expect(ended['entry'].state).toBe('bounced')
    expect(ended['entry'].toolWanted).toBeNull()
    expect(ended['entry'].machine.bounced).toMatchObject({ reason: 'stalled', files: [] })
    expect(ended['entry'].machine.bounced.says).toContain(`The merge tool ended ${String(MAX_TOOL_RUNS_IN_ONE_PLACE)} times without moving it`)
    expect(ended['entry'].machine.bounced.says).toContain('Synthetic: the last run could not read the staged folder.')
    const line = toTheSecretary(one.run).find((m) => m.id === ended['entry'].machine.told.secretary)
    expect(line?.title).toMatch(new RegExp(`^bounced [^:]+: worker-w #${one.id} stalled after ${String(MAX_TOOL_RUNS_IN_ONE_PLACE)} merge tool runs → back to worker-w$`, 'u'))
    // THE SUBMITTER IS TOLD IT IS MOST LIKELY THE OFFICE'S TROUBLE, and to resubmit the same run (acceptance finding 8).
    const toTheSubmitter = messagesAbout(one.run).filter((m) => ended['entry'].machine.told.submitter.includes(m.id))
    expect(toTheSubmitter).toHaveLength(1)
    expect(toTheSubmitter[0]!.body).toContain("most likely the office's own trouble, not your work")
    expect(toTheSubmitter[0]!.body).toContain('submit the same sealed run again')
  })

  it('counts the runs of one arrival only, and asks for nothing where somebody else moves next', async () => {
    const one = await anEntry('stalls-per-arrival')
    expect((await aRunThatEnds(one.id, 'Synthetic: crashed once.')).ended['entry'].machine.stalls).toMatchObject({ runs: 1 })
    // A RUN THAT MOVES IT: pinned, which waits on the inspector, so nothing is asked for and the count is gone.
    const moving = aToolRun()
    expect((await call('POST', `/api/merge-queue/${one.id}/tool-started`, asTheOffice, { session: moving, log: '/synthetic/the-merger.log' })).status).toBe(200)
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('pinned')
    const endedPinned = await call('POST', `/api/merge-queue/${one.id}/tool-ended`, asTheOffice, { session: moving, reason: 'Synthetic: pinned, and waits.' })
    expect(endedPinned.status, endedPinned.raw).toBe(200)
    expect(endedPinned.body['entry'].toolWanted).toBeNull()
    expect(endedPinned.body['entry'].machine.stalls).toBeUndefined()
    expect(endedPinned.body['says']).toContain('waits on')
    // JUDGED ON THE RELEASE, WHICH MARKS IT: a run ending with that mark standing is not counted either.
    expect((await release(one.run)).status).toBe(201)
    const judged = await entry(one.id)
    expect(judged.state).toBe('judged')
    expect(judged.toolWanted).toEqual({ since: expect.any(String) })
    // AND A RUN ENDING IN PLACE IN JUDGED COUNTS FROM ONE AGAIN.
    expect((await aRunThatEnds(one.id, 'Synthetic: lost the race for the lane.')).ended['entry'].machine.stalls).toMatchObject({ runs: 1 })
  })

  it('keeps a landing entry its tool could not land in its lane, stops asking, and tells the secretary a person must look', async () => {
    const one = await anEntry('stalls-landing')
    expect((await release(one.run)).status).toBe(201)
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    await toLanding(one.id, one.seal)
    for (let run = 1; run < MAX_TOOL_RUNS_IN_ONE_PLACE; run += 1) {
      const { ended } = await aRunThatEnds(one.id, `Synthetic: the health wait timed out, time ${String(run)}.`)
      expect(ended['entry'].state).toBe('landing')
      expect(ended['entry'].toolWanted).toEqual({ since: expect.any(String) })
    }
    const { session: last, ended } = await aRunThatEnds(one.id, 'Synthetic: the health wait timed out again.')
    const stuck = ended['entry']
    expect(stuck.state).toBe('landing')
    expect(stuck.occupies).toBe(mainCheckout)
    expect(stuck.toolWanted).toBeNull()
    expect(stuck.machine.bounced).toBeUndefined()
    expect(stuck.machine.stalls).toMatchObject({ runs: MAX_TOOL_RUNS_IN_ONE_PLACE, secretary: expect.any(String) })
    expect(stuck.machine.stalls.says).toContain('the main world may already hold part of it')
    expect(stuck.waitsOn).toMatch(/^a person: /u)
    const line = toTheSecretary(one.run).find((m) => m.id === stuck.machine.stalls.secretary)
    // THE LINE NAMES THE DOOR THAT ASKS AGAIN (decision 28Jy1SqzzZut), with the exact request.
    const request = `POST /api/merge-queue/${one.id}/land-again with the body {"because":"<one sentence>"}`.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    expect(line?.title).toMatch(new RegExp(`^landing stalled [^:]+: worker-w #${one.id} 3 files after ${String(MAX_TOOL_RUNS_IN_ONE_PLACE)} merge tool runs → a person must look, then ${request}$`, 'u'))
    expect(line?.to).toEqual([{ kind: 'agent', id: idOf(THE_TEST_OFFICES_SECRETARY.handle) }])
    // THE WORKER REPORTS THAT LAST ENDING AGAIN when it finds the process gone, and it is not counted again:
    // with no mark to stop it, a second count would tell the secretary a second time.
    const again = await call('POST', `/api/merge-queue/${one.id}/tool-ended`, asTheOffice, { session: last, reason: 'Synthetic: the health wait timed out again.' })
    expect(again.status, again.raw).toBe(200)
    expect(again.body['entry'].machine.stalls).toMatchObject({ runs: MAX_TOOL_RUNS_IN_ONE_PLACE, secretary: stuck.machine.stalls.secretary })
    expect(toTheSecretary(one.run).filter((m) => m.title.startsWith('landing stalled '))).toHaveLength(1)
  })

  // 2zvQX2PS0BNK: the same stalled landing, with the integration taken off it — a record the queue cannot have
  // written, and cannot mend. The person's ask is refused with 500 and words, not with an "internal error", and the
  // entry is where it was.
  it('refuses to ask a landing again when it does not hold its integration, with words and nothing written', async () => {
    const one = await anEntry('stalls-landing-no-integration')
    expect((await release(one.run)).status).toBe(201)
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    await toLanding(one.id, one.seal)
    for (let run = 1; run <= MAX_TOOL_RUNS_IN_ONE_PLACE; run += 1) {
      const { ended } = await aRunThatEnds(one.id, `Synthetic: the health wait timed out, time ${String(run)}.`)
      expect(ended['entry'].state).toBe('landing')
    }
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.integration') WHERE id = ?").run(one.id)
    const askedAgain = await call('POST', `/api/merge-queue/${one.id}/land-again`, asPerson, { because: 'Synthetic: a person asks again.' })
    expect(askedAgain.status, askedAgain.raw).toBe(500)
    expect(askedAgain.body['error']).toBe(lacks(one.id, 'landing', 'its integration'))
    const reading = await entry(one.id)
    expect(reading.state).toBe('landing')
    expect(reading.machine.stalls.asked).toBeUndefined()
  })
})

// ============================================================================ 10. an entry on a files seal

/**
 * MUTATION PROOF, each run alone on 23 September 2026 in src/server/lib/merge-state-machine.ts and
 * src/shared/releasing.ts, with what each turned red:
 *   - accept sealed bytes at any path (the hash only, as a git seal is bound): "another path" pinned;
 *   - skip the mode comparison: "another mode" pinned;
 *   - skip the root comparison: "another root" pinned;
 *   - let a rename through: "a rename" pinned;
 *   - skip the before binding where a release is heard: the modify its release did not read is judged;
 *   - drop `staged` and `before` from readWhatWasRead: the first case bounces instead of being judged,
 *     because the queue then finds no before for the modify, and the third says so in other words.
 */
describe('an entry on a files seal', () => {
  const FILES_CHECKER = 'tools/checks/files-changeset.mjs'
  const B0 = '{"b":"the text the check saw landed"}\n'
  const B1 = '{"b":"the recovered text"}\n'
  const RUN = '#!/bin/sh\necho synthetic\n'

  /**
   * A RUN WHOSE WORK IS A FOLDER OF FILES, sealed from that folder with no git:
   * `bin/run.sh` executable and `notes/b.json` a new text, to land in a root where `notes/b.json`
   * already holds B0.
   */
  async function aFilesSealedRun(): Promise<{ run: string; root: string; stagedAt: string; seal: { id: string; hash: string } }> {
    const stagedAt = realpathSync(scratch('files-sealed-staged'))
    const root = aFilesRoot('files-sealed-root')
    mkdirSync(join(stagedAt, 'bin'), { recursive: true })
    mkdirSync(join(stagedAt, 'notes'), { recursive: true })
    mkdirSync(join(root, 'notes'), { recursive: true })
    writeFileSync(join(stagedAt, 'bin', 'run.sh'), RUN)
    chmodSync(join(stagedAt, 'bin', 'run.sh'), 0o755)
    writeFileSync(join(stagedAt, 'notes', 'b.json'), B1)
    writeFileSync(join(root, 'notes', 'b.json'), B0)
    const run = t.api.createRecord({
      kind: 'session', title: 'Synthetic files-sealed run', workspaceId: WORKSPACE, actor: { type: 'agent', id: 'worker-w' }, origin: 'fixture',
      data: { state: 'running', servingAgent: 'worker-w', submission: { kind: 'files', stagedAt, root } },
    }).id
    theRunReportsForTheQueue(t, run, { type: 'agent', id: 'worker-w' })
    const finished = await call('PATCH', `/api/records/${run}`, asWorker, { dataPatch: { state: 'finished' } })
    expect(finished.status, finished.raw).toBe(200)
    const id = t.api.getRecord(run)!.data['sealedTip'] as string
    return { run, root, stagedAt, seal: { id, hash: (t.api.getRecord(id)!.data['seal'] as { hash: string }).hash } }
  }

  const add = { op: 'add', path: 'bin/run.sh', before: ABSENT, after: sha256(RUN), mode: '100755', source: 'synthetic: tests/merge-state-machine.test.ts' }
  const modify = { op: 'modify', path: 'notes/b.json', before: sha256(B0), after: sha256(B1), source: 'synthetic: tests/merge-state-machine.test.ts' }

  async function submitted(sealed: Awaited<ReturnType<typeof aFilesSealedRun>>, operations: Record<string, unknown>[], root = sealed.root): Promise<string> {
    const r = await call('POST', '/api/merge-queue', asSupervisor, { run: sealed.run, changeset: { adapter: 'files', root, stagedAt: sealed.stagedAt, operations } })
    expect(r.status, r.raw).toBe(201)
    return String(r.body['entry'].id)
  }
  async function pinned(id: string, operations: Record<string, unknown>[], needsJudgment: { path: string; why: string }[] = []) {
    const files = Object.fromEntries(operations.map((one) => [String(one['path']), String(one['after'])]))
    return step(id, 'pinned', { files, checker: { tool: FILES_CHECKER, decided: [], needsJudgment } })
  }
  /** The inspector's release of a files seal, through the real doors: no git base, and the before it read. */
  /**
   * The inspector's release of a files seal, through the real doors. `told` is the list the check was
   * handed to judge, and `lines` the model's own line on each (A2: "named must mean judged").
   */
  async function releasedReading(sealed: Awaited<ReturnType<typeof aFilesSealedRun>>, before: Record<string, string>, told: { path: string; why: string }[] = [], lines: { path: string; concluded: string }[] = []) {
    const read = { sealId: sealed.seal.id, sealHash: sealed.seal.hash, worktree: '/synthetic/a-copy-of-its-own', ofItsOwn: true, says: 'Synthetic: a copy of the staged files, each checked against the seal.', staged: sealed.stagedAt, before, ...(told.length === 0 ? {} : { needsJudgment: told }) }
    const changes = ['bin/run.sh', 'notes/b.json'].map((path) => ({ path, changes: 'a synthetic change' }))
    const assembled = await call('POST', `/api/checks/${sealed.run}/assembled`, asInspector, { changes, base: null, read, ...(told.length === 0 ? {} : { needsJudgment: told.map((one) => ({ ...one, changes: 'a synthetic change' })) }) })
    expect(assembled.status, assembled.raw).toBe(201)
    const verdict = await call('POST', `/api/checks/${sealed.run}`, asInspector, { verdict: 'released', traced: syntheticTrace(t, changes.map((one) => one.path)), check: 'Synthetic: read the files and the text they replace.', chaptersRead: [], read, ...(lines.length === 0 ? {} : { judged: lines }) })
    expect(verdict.status, verdict.raw).toBe(201)
  }

  it('pins an entry landing each sealed file at its path, hash and mode, and is judged on a release that read the file it replaces', async () => {
    const sealed = await aFilesSealedRun()
    const id = await submitted(sealed, [add, modify])
    const pin = await pinned(id, [add, modify])
    expect(pin.status, pin.raw).toBe(200)
    expect(pin.body['entry'].state).toBe('pinned')
    await releasedReading(sealed, { 'notes/b.json': sha256(B0) })
    expect((await entry(id)).state).toBe('judged')
  })

  it('bounces at the pin as unjudged for sealed bytes at another path, with another mode, in another root, or moved by a rename', async () => {
    const cases: { name: string; operations: Record<string, unknown>[]; root?: string; says: string; files: string[] }[] = [
      { name: 'another path', operations: [{ ...add, path: 'bin/elsewhere.sh' }], says: 'bin/elsewhere.sh: seal', files: ['bin/elsewhere.sh'] },
      { name: 'another mode', operations: [{ ...add, mode: '100644' }], says: 'froze it with mode 100755, and this entry lands it with 100644', files: ['bin/run.sh'] },
      { name: 'no mode', operations: [{ ...add, mode: undefined }], says: 'lands it with 100644, because it names no mode', files: ['bin/run.sh'] },
      { name: 'another root', operations: [add], root: realpathSync(scratch('files-another-root')), says: 'froze files to land in', files: ['bin/run.sh'] },
      { name: 'a rename', operations: [{ op: 'rename', path: 'bin/run.sh', from: 'bin/old.sh', before: sha256(RUN), after: sha256(RUN), source: 'synthetic' }], says: 'it is a rename from bin/old.sh', files: ['bin/run.sh'] },
    ]
    for (const one of cases) {
      const sealed = await aFilesSealedRun()
      const id = await submitted(sealed, one.operations, one.root)
      const r = await pinned(id, one.operations)
      expect(r.status, `${one.name}: ${r.raw}`).toBe(200)
      expect(r.body['entry'].state, one.name).toBe('bounced')
      expect(r.body['entry'].machine.bounced, one.name).toMatchObject({ reason: 'unjudged', files: one.files })
      expect(r.body['entry'].machine.bounced.says, one.name).toContain(one.says)
    }
  })

  it('bounces as unjudged when the release did not read the file a modify replaces, or saw a file where an add lands', async () => {
    const replaced = await aFilesSealedRun()
    const a = await submitted(replaced, [modify])
    expect((await pinned(a, [modify])).body['entry'].state).toBe('pinned')
    await releasedReading(replaced, { 'notes/b.json': sha256('{"b":"another text the check saw"}\n') })
    const one = await entry(a)
    expect(one.state).toBe('bounced')
    expect(one.machine.bounced).toMatchObject({ reason: 'unjudged', files: ['notes/b.json'] })
    expect(one.machine.bounced.says).toContain(`the check read the landed file at sha256 ${sha256('{"b":"another text the check saw"}\n').slice(0, 12)}…, and this modify replaces ${sha256(B0).slice(0, 12)}…`)

    const covered = await aFilesSealedRun()
    const b = await submitted(covered, [add])
    expect((await pinned(b, [add])).body['entry'].state).toBe('pinned')
    await releasedReading(covered, { 'bin/run.sh': sha256('#!/bin/sh\necho what was there\n') })
    const two = await entry(b)
    expect(two.state).toBe('bounced')
    expect(two.machine.bounced.says).toContain('the check saw a file landed here')
  })

  it('bounces a path whose content changed after the verdict with that reason, and not as one the checker handed on', async () => {
    const sealed = await aFilesSealedRun()
    const id = await submitted(sealed, [modify])
    expect((await pinned(id, [modify])).body['entry'].state).toBe('pinned')
    await releasedReading(sealed, { 'notes/b.json': sha256(B0) })
    expect((await entry(id)).state).toBe('judged')
    expect((await step(id, 'integrating', {})).status).toBe(200)
    const r = await step(id, 'integrated', { result: 'landing-plan-sha256:z', mainAt: 'folder-sha256:before', files: { 'notes/b.json': sha256('{"b":"other bytes"}\n') }, checker: { tool: FILES_CHECKER, decided: [], needsJudgment: [] } })
    expect(r.status, r.raw).toBe(200)
    expect(r.body['entry'].state).toBe('bounced')
    expect(r.body['entry'].machine.bounced).toMatchObject({ reason: 'unjudged', files: ['notes/b.json'] })
    expect(r.body['entry'].machine.bounced.says).toContain('the content the integrate step reports is not what the release read')
    expect(r.body['entry'].machine.bounced.says).not.toContain('files checker handed')
  })

  // A2: A FILE THE FILES CHECKER HANDS ON IS JUDGED BY THE CHECK OF THE SEAL, with a
  // line of the model's own, and the entry waits for that release instead of bouncing at the pin.
  // MUTATION PROOF, each run alone on 23 September 2026 in src/server/lib/merge-state-machine.ts: a handed-on
  // path bounced at the pin as before A2, and the first case below is red; the release not asked to name
  // it, and the second is red; a protected one let wait for a release, and the third is red; the release
  // not asked at the integrate step, and the fourth is red.
  const WHY = 'No content check exists for .json files like this one, and it is not a byte-for-byte copy of an original.'
  const told = [{ path: 'notes/b.json', why: WHY }]
  const line = [{ path: 'notes/b.json', concluded: 'It is the recovered text, and it replaces exactly the file the check read.' }]

  it('waits at the pin for a release that judges a file the checker handed on, and is judged on one that does', async () => {
    const sealed = await aFilesSealedRun()
    const id = await submitted(sealed, [modify])
    const pin = await pinned(id, [modify], told)
    expect(pin.status, pin.raw).toBe(200)
    expect(pin.body['entry'].state).toBe('pinned')
    await releasedReading(sealed, { 'notes/b.json': sha256(B0) }, told, line)
    expect((await entry(id)).state).toBe('judged')
  })

  it('bounces where the release is heard when the release was not told about a file the checker handed on', async () => {
    const sealed = await aFilesSealedRun()
    const id = await submitted(sealed, [modify])
    expect((await pinned(id, [modify], told)).body['entry'].state).toBe('pinned')
    await releasedReading(sealed, { 'notes/b.json': sha256(B0) })
    const one = await entry(id)
    expect(one.state).toBe('bounced')
    expect(one.machine.bounced).toMatchObject({ reason: 'unjudged', files: ['notes/b.json'] })
    expect(one.machine.bounced.says).toContain('does not name it with a line of its own in `judged`')
  })

  it('bounces at the pin for a protected file the checker handed on: it never lands on a release alone', async () => {
    const sealed = await aFilesSealedRun()
    const id = await submitted(sealed, [modify])
    const files = { 'notes/b.json': sha256(B1) }
    const r = await step(id, 'pinned', { files, checker: { tool: FILES_CHECKER, decided: [{ path: 'notes/b.json', check: 'protected', ok: true, detail: 'It is in a protected area.' }], needsJudgment: [{ path: 'notes/b.json', why: 'It is in a protected area. Read it.' }] } })
    expect(r.status, r.raw).toBe(200)
    expect(r.body['entry'].state).toBe('bounced')
    expect(r.body['entry'].machine.bounced).toMatchObject({ reason: 'unjudged', files: ['notes/b.json'] })
    expect(r.body['entry'].machine.bounced.says).toContain("never lands such a path on a model's release alone")
  })

  it('goes on to testing past a file handed on at the integrate step that its release judged, and bounces on one it did not', async () => {
    const judgedIt = await aFilesSealedRun()
    const a = await submitted(judgedIt, [modify])
    expect((await pinned(a, [modify], told)).body['entry'].state).toBe('pinned')
    await releasedReading(judgedIt, { 'notes/b.json': sha256(B0) }, told, line)
    expect((await step(a, 'integrating', {})).status).toBe(200)
    const onward = await step(a, 'integrated', { result: 'landing-plan-sha256:x', mainAt: 'folder-sha256:before', files: { 'notes/b.json': sha256(B1) }, checker: { tool: FILES_CHECKER, decided: [], needsJudgment: told } })
    expect(onward.status, onward.raw).toBe(200)
    expect(onward.body['entry'].state).toBe('testing')
    expect(onward.body['decided']).toContain('the release judged notes/b.json')

    // EACH FILES RUN HERE LANDS IN A ROOT OF ITS OWN, so the entry above holding its lane holds up nothing below.
    const notJudged = await aFilesSealedRun()
    const b = await submitted(notJudged, [modify])
    expect((await pinned(b, [modify])).body['entry'].state).toBe('pinned')
    await releasedReading(notJudged, { 'notes/b.json': sha256(B0) })
    expect((await entry(b)).state).toBe('judged')
    expect((await step(b, 'integrating', {})).status).toBe(200)
    const back = await step(b, 'integrated', { result: 'landing-plan-sha256:y', mainAt: 'folder-sha256:before', files: { 'notes/b.json': sha256(B1) }, checker: { tool: FILES_CHECKER, decided: [], needsJudgment: told } })
    expect(back.body['entry'].state).toBe('bounced')
    expect(back.body['entry'].machine.bounced).toMatchObject({ reason: 'unjudged', files: ['notes/b.json'] })
  })

  // ACCEPTANCE FINDING 52 (report EnJvvsDTF_Dx, block f-52): A FILES ENTRY LANDS ONLY INSIDE ITS AGENT'S FILES AREA,
  // read on real locations with every link followed, when it is integrated and again when the tool asks to land. The
  // design approved on 23 September 2026 (messages Yzb2Vd-cKicN and 1bbshFyI-jfU).
  // MUTATION PROOF, each run alone on 23 September 2026. In src/server/lib/merge-state-machine.ts: the read at the
  // integrate step left out, and the cases of a link out, no files area, a repointed folder and a git working tree go
  // red; the read when the tool asks to land left out, and the landing case goes red; the entry's one sentence for a
  // folder that moved left out, and the repointed case goes red. In src/server/lib/inspection.ts: the refusal of an
  // assembly when a folder moved left out, and the check door case goes red; the doors sorting a files seal by the
  // work area instead, and it goes red too.

  /** A folder outside the worker's files area and outside this checkout, removed after the file. */
  function outsideTheArea(prefix: string): string {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), `merge-machine-${prefix}-`)))
    made.push(dir)
    return dir
  }
  /** A files entry of [add, modify], pinned and released, brought to its integrate step. */
  async function atItsIntegrateStep(sealed: Awaited<ReturnType<typeof aFilesSealedRun>>): Promise<string> {
    const id = await submitted(sealed, [add, modify])
    expect((await pinned(id, [add, modify])).body['entry'].state).toBe('pinned')
    await releasedReading(sealed, { 'notes/b.json': sha256(B0) })
    expect((await entry(id)).state).toBe('judged')
    expect((await step(id, 'integrating', {})).status).toBe(200)
    return id
  }
  const integrated = (id: string) =>
    step(id, 'integrated', { result: 'landing-plan-sha256:a', mainAt: 'folder-sha256:before', files: { 'bin/run.sh': sha256(RUN), 'notes/b.json': sha256(B1) }, checker: { tool: FILES_CHECKER, decided: [], needsJudgment: [] } })
  /** The worker's files area for the length of `body`, and the one of this file again after it. */
  async function withTheFilesArea(folders: string[], body: () => Promise<void>): Promise<void> {
    const set = await call('POST', '/api/participants/agent/worker-w/files-area', asPerson, { filesArea: folders, because: 'synthetic: a files area for one case' })
    expect(set.status, set.raw).toBe(200)
    try {
      await body()
    } finally {
      const back = await call('POST', '/api/participants/agent/worker-w/files-area', asPerson, { filesArea: [filesArea], because: 'the files entries of these tests land here' })
      expect(back.status, back.raw).toBe(200)
    }
  }

  it("hands the check the agent's files area, sorts a files seal's files by it, and refuses the assembly when a folder of it moved", async () => {
    const sealed = await aFilesSealedRun()
    const read = await call('GET', `/api/checks/${sealed.run}`, asInspector)
    expect(read.status, read.raw).toBe(200)
    expect(read.body['filesArea']).toEqual([{ written: filesArea, resolved: filesArea }])
    const changes = ['bin/run.sh', 'notes/b.json'].map((path) => ({ path, changes: 'a synthetic change' }))
    const away = outsideTheArea('away-check')
    symlinkSync(away, join(sealed.root, 'bin'))
    const prompt = await call('POST', `/api/checks/${sealed.run}/prompt`, asInspector, { changes, base: null })
    expect(prompt.status, prompt.raw).toBe(200)
    expect(prompt.body['changes'].inside.map((one: { path: string }) => one.path)).toEqual(['notes/b.json'])
    expect(prompt.body['changes'].outside).toEqual(['bin/run.sh'])
    expect(prompt.body['changes'].says).toContain(`1 of 2 files land inside the files area (${filesArea})`)

    const link = join(outsideTheArea('link-check'), 'the-area')
    symlinkSync(sealed.root, link)
    await withTheFilesArea([link], async () => {
      unlinkSync(link)
      symlinkSync(away, link)
      const refused = await call('POST', `/api/checks/${sealed.run}/prompt`, asInspector, { changes, base: null })
      expect(refused.status, refused.raw).toBe(409)
      expect(refused.raw).toContain(`The files area ${link} resolved to ${sealed.root} when it was registered and resolves to ${away} now`)
      expect(refused.raw).toContain('Nothing was assembled.')
    })
  })

  it('goes on to testing when every path it touches lands inside the files area', async () => {
    const r = await integrated(await atItsIntegrateStep(await aFilesSealedRun()))
    expect(r.status, r.raw).toBe(200)
    expect(r.body['entry'].state).toBe('testing')
  })

  it('bounces at the integrate step as a guard when a link in its root leads a path out of the files area, naming where it would land', async () => {
    const sealed = await aFilesSealedRun()
    const away = outsideTheArea('away')
    symlinkSync(away, join(sealed.root, 'bin'))
    const r = await integrated(await atItsIntegrateStep(sealed))
    expect(r.body['entry'].state).toBe('bounced')
    expect(r.body['entry'].machine.bounced).toMatchObject({ reason: 'guard', files: ['bin/run.sh'] })
    expect(r.body['entry'].machine.bounced.says).toContain(`bin/run.sh lands at ${join(away, 'run.sh')}, which is outside this agent's files area (${filesArea})`)
  })

  it('bounces every path at the integrate step when its agent has no files area, and says how one is registered', async () => {
    const sealed = await aFilesSealedRun()
    const id = await atItsIntegrateStep(sealed)
    await withTheFilesArea([], async () => {
      const r = await integrated(id)
      expect(r.body['entry'].state).toBe('bounced')
      expect(r.body['entry'].machine.bounced).toMatchObject({ reason: 'guard', files: ['bin/run.sh', 'notes/b.json'] })
      expect(r.body['entry'].machine.bounced.says).toContain("The run's agent worker-w has no files area in this project")
      expect(r.body['entry'].machine.bounced.says).toContain('POST /api/participants/agent/<handle>/files-area')
    })
  })

  it('bounces every path when a folder of the files area was repointed after it was registered, and never follows the new target', async () => {
    const sealed = await aFilesSealedRun()
    const id = await atItsIntegrateStep(sealed)
    const link = join(outsideTheArea('link'), 'the-area')
    symlinkSync(sealed.root, link)
    await withTheFilesArea([link], async () => {
      unlinkSync(link)
      symlinkSync(outsideTheArea('repointed'), link)
      const r = await integrated(id)
      expect(r.body['entry'].state).toBe('bounced')
      expect(r.body['entry'].machine.bounced).toMatchObject({ reason: 'guard', files: ['bin/run.sh', 'notes/b.json'] })
      expect(r.body['entry'].machine.bounced.says).toContain(`The files area ${link} resolved to ${sealed.root} when it was registered`)
      expect(r.body['entry'].machine.bounced.says).toContain('the new location is never followed')
      // ONE SENTENCE FOR THE WHOLE ENTRY, never one per path: the folder moved, not the files.
      expect(r.body['entry'].machine.bounced.says).not.toContain('paths this entry touches')
    })
  })

  it('reads the files area again when the tool asks to land, and bounces a path a link now leads out, so nothing is landing', async () => {
    const sealed = await aFilesSealedRun()
    const id = await atItsIntegrateStep(sealed)
    expect((await integrated(id)).body['entry'].state).toBe('testing')
    expect((await step(id, 'tested', { green: true, log: '/synthetic/suite.log' })).status).toBe(200)
    // AFTER THE INTEGRATE STEP, notes/ becomes a link to a folder outside the area, holding what notes/ held.
    const away = outsideTheArea('away-later')
    renameSync(join(sealed.root, 'notes'), join(away, 'notes'))
    symlinkSync(join(away, 'notes'), join(sealed.root, 'notes'))
    const r = await step(id, 'landing', { mainAt: 'folder-sha256:before' })
    expect(r.status, r.raw).toBe(200)
    expect(r.body['entry'].state).toBe('bounced')
    expect(r.body['entry'].machine.bounced).toMatchObject({ reason: 'guard', files: ['notes/b.json'] })
    expect(r.body['entry'].machine.bounced.says).toContain(`notes/b.json lands at ${join(away, 'notes', 'b.json')}`)
    expect(r.body['entry'].machine.bounced.says).toContain('It was read again when the merge tool asked to land.')
  })

  it('bounces a path whose real location lies in a git working tree inside the files area', async () => {
    const sealed = await aFilesSealedRun()
    git(sealed.root, 'init', '-q', '-b', 'main')
    const r = await integrated(await atItsIntegrateStep(sealed))
    expect(r.body['entry'].state).toBe('bounced')
    expect(r.body['entry'].machine.bounced).toMatchObject({ reason: 'guard', files: ['bin/run.sh', 'notes/b.json'] })
    expect(r.body['entry'].machine.bounced.says).toContain(`inside the git working tree ${sealed.root}; files that belong to a repository go through the git lane`)
  })
})

// ============================================================================ 9. two entries, one suite (item 4)

describe("a result borrowed from a pair's suite (the coordinator's item 4)", () => {
  // THE APPROVED LOCK (message VnYjaMjoYJxK): the second entry borrows only when the first's own facts name it, the
  // same tree, and the same result; anything else and it runs its own suite.
  // MUTATION PROOF, 23 September 2026, each alone in src/server/lib/merge-state-machine.ts: the tree left out of the
  // check, and the case of the other tree goes red; the result left out of it, and the case of the other result goes
  // red; a pair's red result not kept on the entry it bounces, and the red case goes red where nothing can be borrowed.
  const T = 'a1'.repeat(20)
  async function twoJudged(): Promise<{ a: Awaited<ReturnType<typeof anEntry>>; b: Awaited<ReturnType<typeof anEntry>> }> {
    const a = await anEntry('pair-a')
    const b = await anEntry('pair-b')
    for (const one of [a, b]) {
      expect((await release(one.run)).status).toBe(201)
      expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    }
    return { a, b }
  }

  it('is taken only when the entry that ran the suite names this one, the same tree and the same result', async () => {
    const { a, b } = await twoJudged()
    await toTesting(a.id, a.seal)
    const shared = await step(a.id, 'tested', { green: true, log: '/synthetic/pair-suite.log', tip: a.seal.commit, testedWith: { entry: b.id, tree: T, forTheOther: { tree: T, green: true, says: 'Synthetic: green with the first.' } } })
    expect(shared.status, shared.raw).toBe(200)
    expect(shared.body['decided']).toContain(`tested in one suite with merge entry ${b.id}`)
    expect((await step(a.id, 'landing', { mainAt: a.seal.forkBase })).status).toBe(200)
    expect((await step(a.id, 'landed', { mainAfter: a.seal.commit })).body['entry'].state).toBe('merged')

    await toTesting(b.id, b.seal)
    const both = await step(b.id, 'tested', { green: true, log: '/x', tip: b.seal.commit, testedWith: { entry: a.id, tree: T }, borrowedFrom: { entry: a.id, tree: T } })
    expect(both.status, both.raw).toBe(422)
    const otherTree = await step(b.id, 'tested', { green: true, log: '/x', tip: b.seal.commit, borrowedFrom: { entry: a.id, tree: 'b2'.repeat(20) } })
    expect(otherTree.status, otherTree.raw).toBe(409)
    expect(otherTree.body['error']).toContain(`holds on tree ${T.slice(0, 12)}`)
    const otherResult = await step(b.id, 'tested', { green: false, redTests: ['tests/x.test.ts'], log: '/x', borrowedFrom: { entry: a.id, tree: T } })
    expect(otherResult.status, otherResult.raw).toBe(409)
    expect(otherResult.body['error']).toContain('found this entry green')
    const notNamed = await step(b.id, 'tested', { green: true, log: '/x', tip: b.seal.commit, borrowedFrom: { entry: b.id, tree: T } })
    expect(notNamed.status, notNamed.raw).toBe(409)
    expect(notNamed.body['error']).toContain('did not test')
    expect((await entry(b.id)).state).toBe('testing')

    const borrowed = await step(b.id, 'tested', { green: true, log: '/synthetic/pair-suite.log', tip: b.seal.commit, borrowedFrom: { entry: a.id, tree: T } })
    expect(borrowed.status, borrowed.raw).toBe(200)
    expect(borrowed.body['decided']).toContain('nothing was run again')
    expect(borrowed.body['entry'].machine.tested).toMatchObject({ green: true, borrowedFrom: { entry: a.id, tree: T } })
  })

  it("keeps a pair's red result on the entry it bounces, so the other can borrow what was decided for it", async () => {
    const { a, b } = await twoJudged()
    await toTesting(a.id, a.seal)
    const onMainPlusB = 'c3'.repeat(20)
    const says = 'tests/b.test.ts is red on main plus this entry alone, so it is this entry\'s, not the first\'s.'
    const red = await step(a.id, 'tested', {
      green: false,
      redTests: ['tests/a.test.ts'],
      log: '/synthetic/pair-suite.log',
      testedWith: { entry: b.id, tree: T, forTheOther: { tree: onMainPlusB, green: false, redTests: ['tests/b.test.ts'], says } },
    })
    expect(red.body['entry'].state).toBe('bounced')
    expect(red.body['entry'].machine.tested).toMatchObject({ green: false, testedWith: { entry: b.id, forTheOther: { tree: onMainPlusB } } })

    await toTesting(b.id, b.seal)
    const borrowed = await step(b.id, 'tested', { green: false, redTests: ['tests/b.test.ts'], log: '/synthetic/pair-suite.log', says, borrowedFrom: { entry: a.id, tree: onMainPlusB } })
    expect(borrowed.status, borrowed.raw).toBe(200)
    expect(borrowed.body['entry'].state).toBe('bounced')
    expect(borrowed.body['entry'].machine.bounced).toMatchObject({ reason: 'red', redTests: ['tests/b.test.ts'] })
    expect(borrowed.body['entry'].machine.bounced.says).toContain('red on main plus this entry alone')
  })
})

// ============================================================================ 10. documentation that no test reads

describe('documentation that no test reads', () => {
  // THE RULE AND THE APPROVED DESIGN (GIxHaLdp_dyo,
  // _aRNsGwY2e2m, AXACEkwE3AK4): a documentation entry queues in a lane of its own, main moves one landing at a time,
  // an entry under test is carried past documentation landings only, link by link. What is under test is on the entry's
  // reading and in the submission door's answer, and no longer in the Secretariat group.
  // MUTATION PROOF, 23 September 2026, each alone in the office: laneOf ignoring the documentation mark, and the lane
  // case goes red; one move of main at a time left out, and the landing case goes red; the receipts' chain not
  // checked, and the carrying case goes red on the code entry in between.
  const T = 'd0'.repeat(20)
  async function aJudgedEntry(branch: string, documents: boolean) {
    const one = await anEntry(branch)
    expect((await release(one.run)).status).toBe(201)
    const pinned = await step(one.id, 'pinned', { files: contentOf(one.seal), ...(documents ? { documents: { tree: T, files: [A] } } : {}) })
    expect(pinned.status, pinned.raw).toBe(200)
    expect(pinned.body['entry'].state).toBe('judged')
    return one
  }
  /** Take a judged entry through to merged on `from`, landing it at `to`; its receipt joins the two. */
  async function landed(one: Awaited<ReturnType<typeof aJudgedEntry>>, from: string, to: string) {
    expect((await step(one.id, 'integrating', {})).status).toBe(200)
    expect((await step(one.id, 'integrated', { result: to, mainAt: from, files: contentOf(one.seal) })).body['entry'].state).toBe('testing')
    expect((await step(one.id, 'tested', { green: true, log: '/synthetic/nothing-to-run.log', tip: to })).status).toBe(200)
    expect((await step(one.id, 'landing', { mainAt: from })).body['entry'].state).toBe('landing')
    expect((await step(one.id, 'landed', { mainAfter: to })).body['entry'].state).toBe('merged')
  }

  it('queues in a lane of its own, which it takes while a code entry holds the code lane', async () => {
    const code = await aJudgedEntry('docs-lane-code', false)
    const note = await aJudgedEntry('docs-lane-note', true)
    expect((await entry(note.id)).lane).toBe(`${mainCheckout} documents`)
    expect((await entry(code.id)).lane).toBe(mainCheckout)
    await toTesting(code.id, code.seal)
    const takes = await step(note.id, 'integrating', {})
    expect(takes.status, takes.raw).toBe(200)
    expect(takes.body['entry'].occupies).toBe(`${mainCheckout} documents`)
    expect((await entry(code.id)).occupies).toBe(mainCheckout)
  })

  it('lands only while no other entry of its repository is landing, whichever lane that one is in', async () => {
    const code = await aJudgedEntry('docs-one-move-code', false)
    const note = await aJudgedEntry('docs-one-move-note', true)
    await toLanding(code.id, code.seal)
    expect((await step(note.id, 'integrating', {})).status).toBe(200)
    expect((await step(note.id, 'integrated', { result: note.seal.commit, mainAt: note.seal.forkBase, files: contentOf(note.seal) })).status).toBe(200)
    expect((await step(note.id, 'tested', { green: true, log: '/synthetic/nothing-to-run.log', tip: note.seal.commit })).status).toBe(200)
    const refused = await step(note.id, 'landing', { mainAt: note.seal.forkBase })
    expect(refused.status, refused.raw).toBe(409)
    expect(refused.body['error']).toContain(`Merge entry ${code.id} lands in ${mainCheckout} now`)
    expect((await entry(note.id)).state).toBe('testing')
    expect((await step(code.id, 'landed', { mainAfter: code.seal.commit })).body['entry'].state).toBe('merged')
    expect((await step(note.id, 'landing', { mainAt: note.seal.forkBase })).body['entry'].state).toBe('landing')
    expect((await step(note.id, 'landed', { mainAfter: note.seal.commit })).body['entry'].state).toBe('merged')
  })

  // ITEM 16 OF THE 13U REQUIREMENTS: an emergency fix goes straight to main, past the queue, and its push takes the
  // lock a landing takes, so a landing waits while a push moves main. The push record is made here as its door writes
  // it, with no door: the push's own doors are proved in tests/an-emergency-push-to-main.test.ts.
  it('lands only while no emergency push of its repository is moving main', async () => {
    const code = await aJudgedEntry('push-holds-main', false)
    await toTesting(code.id, code.seal)
    expect((await step(code.id, 'tested', { green: true, log: '/synthetic/nothing-to-run.log', tip: code.seal.commit })).status).toBe(200)
    const door = await import('../src/server/lib/merge-entry-door.ts')
    const push = door.asTheMergeQueue(() => t.api.createRecord({ workspaceId: WORKSPACE, kind: 'emergency_push', title: 'Synthetic emergency push', actor: t.api.HUMAN,
      data: { state: 'pushing', root: mainCheckout, repository: 'fixture-main', commit: '7e'.repeat(20), mainBefore: code.seal.forkBase,
        message: { id: 'synthetic-message', seq: 1, contentHash: 'synthetic-hash' }, by: { kind: 'person', id: THE_PERSON },
        switch: { value: '1', unreadable: null, chosen: null, ranOut: null, lastChange: null }, startedAt: new Date().toISOString(), ended: null } }))
    const refused = await step(code.id, 'landing', { mainAt: code.seal.forkBase })
    expect(refused.status, refused.raw).toBe(409)
    expect(refused.body['error']).toContain(`Emergency push ${push.id} moves main in ${mainCheckout} now`)
    expect((await entry(code.id)).state).toBe('testing')
    door.asTheMergeQueue(() => t.api.patchRecord(push.id, { dataPatch: { state: 'stopped', ended: { at: new Date().toISOString(), mainAfter: code.seal.forkBase, says: 'Synthetic: stopped.', onward: null } } }, t.api.HUMAN))
    expect((await step(code.id, 'landing', { mainAt: code.seal.forkBase })).body['entry'].state).toBe('landing')
    expect((await step(code.id, 'landed', { mainAfter: code.seal.commit })).body['entry'].state).toBe('merged')
  })

  it('carries a tested entry past documentation landings, link by link, and past nothing else', async () => {
    const M = '1a'.repeat(20)
    const afterTheNote = '1b'.repeat(20)
    const afterTheCode = '1c'.repeat(20)
    const code = await aJudgedEntry('docs-carry-code', false)
    await toTesting(code.id, code.seal, M)
    expect((await step(code.id, 'tested', { green: true, log: '/synthetic/suite.log', tip: code.seal.commit })).status).toBe(200)
    const note = await aJudgedEntry('docs-carry-note', true)
    await landed(note, M, afterTheNote)
    const files = contentOf(code.seal)
    // NOT PAST A CHAIN THAT DOES NOT JOIN THE TWO MAINS.
    const gap = await step(code.id, 'moved-past-documents', { mainAt: afterTheCode, result: '2a'.repeat(20), documents: [note.id], files })
    expect(gap.status, gap.raw).toBe(409)
    expect(gap.body['error']).toContain('end at')
    // NOT PAST AN ENTRY THAT IS NOT DOCUMENTATION.
    const other = await aJudgedEntry('docs-carry-other', false)
    const notDocuments = await step(code.id, 'moved-past-documents', { mainAt: afterTheNote, result: '2a'.repeat(20), documents: [other.id], files })
    expect(notDocuments.status, notDocuments.raw).toBe(409)
    expect(notDocuments.body['error']).toContain('is not a merged documentation entry')
    await call('POST', `/api/merge-queue/${other.id}/withdraw`, asPerson, { because: 'the case needed it judged only' })
    // NOT WHEN THE ENTRY'S FILES ARE NOT WHAT WAS TESTED.
    const changed = await step(code.id, 'moved-past-documents', { mainAt: afterTheNote, result: '2a'.repeat(20), documents: [note.id], files: { ...files, [A]: sha256('other bytes') } })
    expect(changed.status, changed.raw).toBe(409)
    // PAST THE NOTE: the integration and the tested tip move to the new main, with nothing to test again.
    const carried = await step(code.id, 'moved-past-documents', { mainAt: afterTheNote, result: '2a'.repeat(20), documents: [note.id], files })
    expect(carried.status, carried.raw).toBe(200)
    expect(carried.body['decided']).toContain('with nothing to test again')
    expect(carried.body['entry'].machine.integration).toMatchObject({ mainAt: afterTheNote, result: '2a'.repeat(20) })
    expect(carried.body['entry'].machine.tested).toMatchObject({ green: true, tip: '2a'.repeat(20) })
    expect((await step(code.id, 'landing', { mainAt: afterTheNote })).body['entry'].state).toBe('landing')
    expect((await step(code.id, 'landed', { mainAfter: '2a'.repeat(20) })).body['entry'].state).toBe('merged')
  })

  // NO LINE IN THE SECRETARIAT GROUP WHEN AN ENTRY STARTS ITS TEST: what is under test is on the
  // entry's reading, and the submission door answers it. Every group line is a message with `toGroup`, so none is counted.
  // MUTATION PROOF, 27 September 2026, alone in src/server/lib/merge-state-machine.ts: the Secretariat line written again
  // when the integrated step moves the entry to testing, and this goes red on the count.
  it('writes no line in the Secretariat group when an entry starts its test, and the entry carries what is under test', async () => {
    const code = await aJudgedEntry('docs-announce', false)
    const record = join(scratch('reads'), 'reads', `${T}.json`)
    mkdirSync(dirname(record), { recursive: true })
    // SYNTHETIC: kept before 24 September 2026, when the merge tool stamped its records in UTC (acceptance finding 61).
    const UTC = '2026-09-24T01:09:02.659Z'
    writeFileSync(record, JSON.stringify({ tree: T, files: ['work/a.txt', 'tests/x.test.ts'], folders: ['design/avatars'], at: UTC }))
    expect((await step(code.id, 'integrating', {})).status).toBe(200)
    const groupLines = (): number => t.api.listRecords({ workspaceId: WORKSPACE, kind: 'message' }).filter((one) => one.data['toGroup'] !== undefined).length
    const before = groupLines()
    const testing = await step(code.id, 'integrated', { result: code.seal.commit, mainAt: code.seal.forkBase, files: contentOf(code.seal), reads: { tree: T, files: 2, folders: 1, record } })
    expect(testing.body['entry'].state).toBe('testing')
    expect(testing.body['entry'].underTest).toMatchObject({ files: Object.keys(contentOf(code.seal)).sort(), reads: { tree: T, files: 2, folders: 1 } })
    expect(groupLines(), 'no group line is written when an entry starts its test').toBe(before)
    expect(String(testing.body['decided'])).not.toContain('Secretariat')
    const reads = await call('GET', `/api/merge-queue/${code.id}/reads`, asStranger)
    expect(reads.status, reads.raw).toBe(200)
    expect(reads.body).toMatchObject({ entry: code.id, tree: T, files: ['work/a.txt', 'tests/x.test.ts'], folders: ['design/avatars'] })
    // THE RECORD'S TIME IS ANSWERED IN THE OFFICE'S OWN FORM, local wall clock, as the moment the UTC stamp states
    // (chapter 4 rule 8; acceptance finding 61), and a value that is no moment is answered as itself.
    // MUTATION PROOF, 24 September 2026, alone in src/server/api/merge-queue.ts: the record's time answered as it was
    // kept, and this goes red on the UTC stamp.
    expect(reads.body['at']).toBe(localStamp(new Date(UTC)))
    writeFileSync(record, JSON.stringify({ tree: T, files: ['work/a.txt'], folders: [], at: 'not a moment' }))
    const unread = await call('GET', `/api/merge-queue/${code.id}/reads`, asStranger)
    expect(unread.body['at']).toBe('not a moment')
  })

  /** A files change landing in `root`: it modifies work/a.txt and adds work/c.txt. Submitted on a fresh sealed run. */
  async function aFilesChangeIn(root: string) {
    const sealed = await aSealedRun()
    const source = 'synthetic: tests/merge-state-machine.test.ts'
    const operations = [
      { op: 'modify', path: A, before: sha256('a before'), after: sha256('a after'), source },
      { op: 'add', path: 'work/c.txt', before: ABSENT, after: sha256('c'), source },
    ]
    return call('POST', '/api/merge-queue', asSupervisor, { run: sealed.run, changeset: { adapter: 'files', root, stagedAt: sealed.dir, operations } })
  }

  // THE SUBMISSION DOOR SAYS WHICH OF A CHANGE'S FILES A TEST UNDER WAY HAS: the files of the
  // testing entry's `underTest` that the change also touches, one by one, and that the change cannot land before that
  // test is over, since the testing entry holds the lane the change queues in.
  // MUTATION PROOF, 27 September 2026, alone in src/server/lib/merge-queue.ts: the overlap filtered to nothing, and this
  // goes red where work/a.txt is named.
  it('answers a change submitted while a test has one of its files with that file named, and that it lands after the test', async () => {
    const code = await aJudgedEntry('door-under-test', false)
    await toTesting(code.id, code.seal)
    const root = String((await entry(code.id)).changeset.root)
    const submitted = await aFilesChangeIn(root)
    expect(submitted.status, submitted.raw).toBe(201)
    const says = String(submitted.body['says'])
    expect(says).toContain(`Merge entry ${String(submitted.body['entry'].id)} is queued`)
    expect(says).toContain(`A test is under way in ${root}: merge entry ${code.id}.`)
    expect(says).toContain(`That entry also changes 1 of them: ${A}.`)
    expect(says).toContain(`This change cannot land before that test is over: merge entry ${code.id} holds the lane ${root} until it lands or bounces`)
    expect(says).not.toContain('work/c.txt')
  })

  /** A files change landing in `root` that touches exactly these paths, each added. Submitted on a fresh sealed run. */
  async function aFilesChangeTouching(root: string, paths: readonly string[]) {
    const sealed = await aSealedRun()
    const source = 'synthetic: tests/merge-state-machine.test.ts'
    const operations = paths.map((path) => ({ op: 'add', path, before: ABSENT, after: sha256(path), source }))
    return call('POST', '/api/merge-queue', asSupervisor, { run: sealed.run, changeset: { adapter: 'files', root, stagedAt: sealed.dir, operations } })
  }

  /** Take a judged entry to testing with a record of what the suite reads, kept where the merge tool keeps one. */
  async function toTestingWithReads(one: Awaited<ReturnType<typeof aJudgedEntry>>, kept: Record<string, unknown> | null): Promise<string> {
    const record = join(scratch('door-reads'), 'reads', `${T}.json`)
    mkdirSync(dirname(record), { recursive: true })
    if (kept !== null) writeFileSync(record, JSON.stringify({ tree: T, ...kept }))
    expect((await step(one.id, 'integrating', {})).status).toBe(200)
    const testing = await step(one.id, 'integrated', { result: one.seal.commit, mainAt: one.seal.forkBase, files: contentOf(one.seal), reads: { tree: T, files: 1, folders: 1, record } })
    expect(testing.body['entry'].state, testing.raw).toBe('testing')
    return String((await entry(one.id)).changeset.root)
  }

  // THE DOOR NAMES THE FILES THE TEST UNDER WAY READS, from its record of what the suite reads (check aPfgJfPfv-wM): a
  // file the suite read, and every file under a folder it read whole, each named, even where the testing entry does not
  // change it. What the testing entry changes is said beside it. The paths are made up.
  // MUTATION PROOFS, 28 September 2026, alone in src/server/lib/merge-queue.ts, whatATestUnderWayHasOf:
  //   a. only underTest.files compared (the read overlap filtered to nothing): the first case goes red;
  //   b. whole folders left out (theSuiteReads given folders: []): the second case goes red;
  //   c. an unreadable record said as "reads none": the fourth case goes red.
  it('names a file the test under way reads, which the testing entry does not change', async () => {
    const code = await aJudgedEntry('door-reads-file', false)
    const root = await toTestingWithReads(code, { files: ['notes/read-by-a-test.md'], folders: [] })
    const says = String((await aFilesChangeTouching(root, ['notes/read-by-a-test.md', 'notes/nobody-reads.md'])).body['says'])
    expect(says).toContain('that test reads 1 of the files this change touches: notes/read-by-a-test.md.')
    expect(says).not.toContain('nobody-reads.md')
    expect(says).not.toContain('That entry also changes')
  })

  it('names a file under a folder the test under way read whole', async () => {
    const code = await aJudgedEntry('door-reads-folder', false)
    const root = await toTestingWithReads(code, { files: [], folders: ['fixtures/whole'] })
    const says = String((await aFilesChangeTouching(root, ['fixtures/whole/deep/one.json', 'fixtures/wholesome.json'])).body['says'])
    expect(says).toContain('that test reads 1 of the files this change touches: fixtures/whole/deep/one.json.')
    expect(says).not.toContain('fixtures/wholesome.json')
  })

  it('answers that nothing of a change is under test when the test neither reads nor changes its files', async () => {
    const code = await aJudgedEntry('door-reads-nothing', false)
    const root = await toTestingWithReads(code, { files: ['notes/read-by-a-test.md'], folders: ['fixtures/whole'] })
    const says = String((await aFilesChangeTouching(root, ['notes/untouched-by-any-test.md'])).body['says'])
    expect(says).toContain('that test reads none of the files this change touches.')
    expect(says).toContain('So nothing of this change is under test.')
  })

  it('says it cannot tell which files the test reads when its record cannot be read, and never that it reads none', async () => {
    const code = await aJudgedEntry('door-reads-unreadable', false)
    const root = await toTestingWithReads(code, null)
    const says = String((await aFilesChangeTouching(root, ['notes/read-or-not.md'])).body['says'])
    expect(says).toContain('Mole Office cannot tell which files that test reads:')
    expect(says).toContain('is not there any more.')
    expect(says).not.toContain('reads none')
    expect(says).not.toContain('nothing of this change is under test')
  })

  // AND WHEN NO TEST IS UNDER WAY, THE ANSWER SAYS SO, naming no file. Every lane is freed after
  // each case, so nothing of this repository is testing here.
  // MUTATION PROOF, 27 September 2026, alone in src/server/lib/merge-queue.ts: the sentence for no test names the
  // change's paths anyway, and this goes red on work/a.txt.
  it('answers a change submitted while nothing is under test that nothing is', async () => {
    const root = mainCheckout
    const submitted = await aFilesChangeIn(root)
    expect(submitted.status, submitted.raw).toBe(201)
    const says = String(submitted.body['says'])
    expect(says).toContain(`No test is under way in ${root}, so none of this change's files is under test.`)
    expect(says).not.toContain(A)
    expect(says).not.toContain('work/c.txt')
  })
})

// ============================================================================ 11. a secretary's design/-only entry

// These tests cite a decision.
describe("a secretary's design/-only entry", () => {
  // THE OFFICE FILES AND SEALS THE SECRETARY'S RUN, AND ITS RULE COVERS THE SEAL IN PLACE OF A RELEASE: the entry is
  // judged at the pin with no inspector, a design/ path the git checker hands on asks for no check again, the receipt
  // names the rule, and a bounce tells the secretary what it can do rather than to finish a run nobody ran.
  // MUTATION PROOF, each alone in src/server/lib/merge-state-machine.ts: the rule answers "covers" for every run, and
  // the claiming run's case goes red where it is judged; the rule taken out of whatNeedsACheckAgain, and the check-again
  // case goes red where the entry is reinspecting.
  const NOTE = 'design/notes/new.md'

  /** A secretary's checkout: main holds design/rules.md, and `notes` changes it and adds a note, checked out. */
  function aDesignTree(): string {
    const dir = scratch('secretary')
    git(dir, 'init', '-q', '-b', 'main')
    git(dir, 'config', 'user.email', 'fixture@example.invalid')
    git(dir, 'config', 'user.name', 'Synthetic secretary fixture')
    mkdirSync(join(dir, 'design', 'notes'), { recursive: true })
    writeFileSync(join(dir, RULES), `${RULES} before.\n`)
    git(dir, 'add', '.')
    git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
    git(dir, 'switch', '-q', '-c', 'notes')
    writeFileSync(join(dir, RULES), `${RULES} before.\n${RULES} by the secretary.\n`)
    writeFileSync(join(dir, NOTE), 'A new note.\n')
    git(dir, 'add', '.')
    git(dir, 'commit', '-q', '-m', 'Synthetic secretary change')
    return realpathSync(dir)
  }

  async function aSecretarysEntry(): Promise<{ id: string; run: string; dir: string; seal: Seal }> {
    const dir = aDesignTree()
    const r = await call('POST', '/api/merge-queue', asSecretary, { changeset: { adapter: 'git', repository: 'fixture-main', branch: 'notes' }, workingDirectory: dir })
    expect(r.status, r.raw).toBe(201)
    const run = String(r.body['entry'].run)
    return { id: String(r.body['entry'].id), run, dir, seal: theSealOf(run) }
  }

  const sessions = (): number => (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'session'").get() as { n: number }).n

  it('is judged at the pin with no release, and its verdict says the rule it rested on', async () => {
    const one = await aSecretarysEntry()
    const pinned = await step(one.id, 'pinned', { files: contentOf(one.seal) })
    expect(pinned.status, pinned.raw).toBe(200)
    expect(pinned.body['entry'].state).toBe('judged')
    expect(pinned.body['decided']).toContain("The secretary's rule covers seal")
    const judged = await entry(one.id)
    expect(judged.machine.judged).toEqual(contentOf(one.seal))
    expect(judged.machine.verdict).toMatchObject({ run: one.run, by: { kind: 'agent', id: 'mole-office/the-api-server' }, message: null })
    expect(judged.machine.verdict.time).toMatchObject({ stamp: judged.machine.verdict.at, instant: expect.any(String), offset: expect.any(String) })
    expect(judged.machine.verdict.how).toContain("the secretary's rule: a secretary's design/-only entry")
    expect(judged.machine.verdict.how).not.toContain('an inspector')
    expect(t.api.getRecord(one.run)!.data['theCheck']).toBeUndefined()
  })

  it('does not cover a run that claims the purpose but was not filed by the office', async () => {
    const dir = aDesignTree()
    const run = t.api.createRecord({
      kind: 'session',
      title: 'Synthetic run claiming the secretary purpose',
      workspaceId: WORKSPACE,
      actor: { type: 'agent', id: 'worker-w' },
      origin: 'fixture',
      data: { state: 'running', servingAgent: 'worker-w', cutFrom: 'main', workingDirectory: dir, extra: { purpose: 'secretary-documents' } },
    }).id
    theRunReportsForTheQueue(t, run, { type: 'agent', id: 'worker-w' })
    const finished = await call('PATCH', `/api/records/${run}`, asWorker, { dataPatch: { state: 'finished' } })
    expect(finished.status, finished.raw).toBe(200)
    const seal = theSealOf(run)
    const submitted = await call('POST', '/api/merge-queue', asSupervisor, { run, changeset: { adapter: 'git', repository: 'fixture-main', branch: 'notes' } })
    expect(submitted.status, submitted.raw).toBe(201)
    const id = String(submitted.body['entry'].id)
    const pinned = await step(id, 'pinned', { files: contentOf(seal) })
    expect(pinned.status, pinned.raw).toBe(200)
    expect(pinned.body['entry'].state).toBe('pinned')
    expect(pinned.body['entry'].waitsOn).toContain("inspector's release")
    expect((await entry(id)).machine.verdict).toBeUndefined()
  })

  it('asks no check again for the design/ paths the checker hands on, goes to testing, and lands with a receipt that names the rule', async () => {
    const one = await aSecretarysEntry()
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    expect((await step(one.id, 'integrating', {})).status).toBe(200)
    // PUT ON TOP OF A MOVED MAIN, THE RULES FILE CAME OUT WITH CONTENT THE SEAL DID NOT HOLD, and the checker hands both
    // design/ paths on as protected.
    const mainAt = 'c'.repeat(40)
    const result = 'd'.repeat(40)
    const files = { ...contentOf(one.seal), [RULES]: 'e'.repeat(64) }
    const checker = { tool: 'tools/checks/git-changeset.mjs', decided: [], needsJudgment: [{ path: RULES, why: WHY }, { path: NOTE, why: WHY }] }
    const before = sessions()
    const integrated = await step(one.id, 'integrated', { result, mainAt, clone: one.dir, files, checker })
    expect(integrated.status, integrated.raw).toBe(200)
    expect(integrated.body['entry'].state).toBe('testing')
    expect(integrated.body['decided']).toContain('nothing needs judging again')
    expect((await entry(one.id)).machine.reinspection).toBeUndefined()
    expect(sessions()).toBe(before)

    expect((await step(one.id, 'tested', { green: true, log: '/synthetic/suite.log', ran: 3, passed: 3 })).status).toBe(200)
    expect((await step(one.id, 'landing', { mainAt })).status).toBe(200)
    const landed = await step(one.id, 'landed', { mainAfter: result })
    expect(landed.status, landed.raw).toBe(200)
    const merged = await entry(one.id)
    expect(merged.state).toBe('merged')
    const says = String(merged.machine.integrated.carriedVerdict.says)
    expect(says).toContain("The secretary's rule covered the pinned content")
    expect(says).not.toContain('The release of run')
    expect(t.api.getRecord(one.run)!.data['integrated']).toMatchObject({ carriedVerdict: { says } })
  })

  it("tells the secretary of a conflict what it can do, and never to finish and seal a run the office filed", async () => {
    const one = await aSecretarysEntry()
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    expect((await step(one.id, 'integrating', {})).status).toBe(200)
    const bounced = await step(one.id, 'conflict', { files: [RULES], mainAt: 'c'.repeat(40), log: '/synthetic/merge.log' })
    expect(bounced.status, bounced.raw).toBe(200)
    expect(bounced.body['entry'].state).toBe('bounced')
    const notice = toTheSecretary(one.run).find((m) => m.title.startsWith('Bounced (conflict)'))
    expect(notice, JSON.stringify(toTheSecretary(one.run))).toBeDefined()
    expect(notice!.body).not.toContain('finish and seal the run again')
    expect(notice!.body).toContain(`Next: rebase the branch notes onto main in the working folder ${one.dir}, resolving each conflict as it stops`)
    expect(notice!.body).toContain("submit the secretary's body again with POST /api/merge-queue")
  })
})

// ============================================================================ a refused check-again run (finding 76)

// A REFUSED CHECK AGAIN IS TOLD THE TRUTH, OPENS NO GROUP, AND IS ENDED WITH ITS ENTRY (decision yH7W1sXTRY5q,
// Q3 (a) and Q4; acceptance finding 76). The office files a check-again run itself, in the merge tool's clone, and nobody
// works in it. Before this its refusal told the worker "go back to work", opened a group for a talk with nowhere to lead,
// and left the run in rebuttal for ever.
describe('a check-again run names its entry’s report and a refusal ends it with its entry', () => {
  beforeAll(() => {
    withTheQueuesReport = false
  })
  afterAll(() => {
    withTheQueuesReport = true
  })
  const releasing = import('../src/shared/releasing.ts')
  /** How many groups carry this name: the refusal groups of one worker. */
  const refusalGroups = (name: string): number =>
    (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM groups WHERE name = ?').get(name) as { n: number }).n

  /** A released entry put on top of a moved main, reinspecting on a check-again run the office filed. */
  async function reinspecting(branch: string, records?: string[]): Promise<{ id: string; run: string; checkAgain: string; clone: string }> {
    const one = await anEntry(branch, records)
    expect((await release(one.run)).status).toBe(201)
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    expect((await step(one.id, 'integrating', {})).status).toBe(200)
    const onTop = aCloneOnTopOfMain(one.dir)
    const integrated = await step(one.id, 'integrated', { result: onTop.result, mainAt: onTop.mainAt, clone: onTop.clone, files: onTop.files })
    expect(integrated.status, integrated.raw).toBe(200)
    expect(integrated.body['entry'].state).toBe('reinspecting')
    return { id: one.id, run: one.run, checkAgain: String(integrated.body['entry'].machine.reinspection.run), clone: onTop.clone }
  }

  /**
   * Waits until the wall clock reads another second than when it was called. The office stamps a record to the second,
   * so a report filed after this is a second later than every report filed before it: strictly newer.
   */
  async function aNewSecond(): Promise<void> {
    const before = localStamp(new Date())
    while (localStamp(new Date()) === before) await new Promise((done) => setTimeout(done, 10))
  }

  /** A synthetic report, written by the worker and optionally linked to a run through the real door. */
  async function report(title: string, run?: string): Promise<string> {
    const filed = await call('POST', '/api/records', asWorker, {
      kind: 'report', title, summary: 'Synthetic: the entry’s work was checked.',
      data: { blocks: [{ id: 'done', type: 'text', text: 'Synthetic report content.' }], for: 'Super R', date: '2026-10-01' },
    })
    expect(filed.status, filed.raw).toBe(201)
    const id = String(filed.body['record'].id)
    if (run !== undefined) {
      const linked = await call('POST', '/api/links', asWorker, { fromId: id, toId: run, type: 'about' })
      expect(linked.status, linked.raw).toBe(201)
    }
    return id
  }

  function resultForTheStarter(run: string): string {
    const told = messagesAbout(run).filter((m) => m.title.startsWith('Checked and released:'))
    expect(told).toHaveLength(1)
    expect(told[0]!.to).toEqual([{ kind: 'agent', id: idOf('super-r') }])
    return told[0]!.body
  }

  // 18U9KvRM3DDj, aTKkeulCgIVm: askForACheckAgain’s report belongs to the entry’s own run.
  // MUTATION: read the check-again run's reports with finding 57's agent-newest fallback again (main's code).
  it('releases with the entry’s linked report and names the entry and its run, though another run’s report is newer', async () => {
    const one = await reinspecting('check-again-own-report')
    const own = await report('Synthetic: this merge entry’s own report', one.run)
    const other = await aSealedRun()
    // Strictly newer: the office orders reports by a wall-clock second.
    await aNewSecond()
    const newer = await report('Synthetic: another run’s newer report', other.run)
    const released = await release(one.checkAgain, { worktree: one.clone, only: [A] })
    expect(released.status, released.raw).toBe(201)
    const said = resultForTheStarter(one.checkAgain)
    expect(said).toContain('Synthetic: this merge entry’s own report')
    expect(said).toContain(`This is the report of merge entry ${one.id}'s run ${one.run}.`)
    expect(said).not.toContain('Synthetic: another run’s newer report')
    expect(said).not.toContain('Not linked about this run.')
    const reads = inspection.whatTheInspectorReads(one.checkAgain, WORKSPACE)
    expect(reads.reports.map((r) => r.record.id)).toEqual([own])
    expect(reads.reports.map((r) => r.record.id)).not.toContain(newer)
    expect(reads.reportOfMergeEntry).toEqual({ entry: one.id, run: one.run, agent: 'worker-w' })
  })

  // MUTATION: read the check-again run's reports with finding 57's agent-newest fallback again (main's code).
  it('reads the report revision pinned by the entry’s seal before a later about-linked report', async () => {
    const own = await report('Synthetic: the report revision this entry sealed')
    const one = await reinspecting('check-again-pinned-report', [own])
    const edited = await call('PATCH', `/api/records/${own}`, asWorker, { title: 'Synthetic: a later revision the entry did not seal' })
    expect(edited.status, edited.raw).toBe(200)
    await report('Synthetic: a later report linked about the entry’s run', one.run)
    const released = await release(one.checkAgain, { worktree: one.clone, only: [A] })
    expect(released.status, released.raw).toBe(201)
    const said = resultForTheStarter(one.checkAgain)
    expect(said).toContain('Synthetic: the report revision this entry sealed')
    expect(said).toContain(`This is the report of merge entry ${one.id}'s run ${one.run}.`)
    expect(said).not.toContain('Synthetic: a later revision the entry did not seal')
    expect(said).not.toContain('Synthetic: a later report linked about the entry’s run')
    expect(said).not.toContain('Not linked about this run.')
    expect(inspection.whatTheInspectorReads(one.checkAgain, WORKSPACE).reports.map((r) => r.record.id)).toEqual([own])
  })

  // Wave 13s round 26: report Qj2_JbZpQMjU was filed in its entry's run and linked to it only as `relates_to`, and the
  // starter was told the run had no report. MUTATION: read only the reports linked `about` the entry's run again.
  it('releases with the report filed in the entry’s run, though it is linked only as relates_to', async () => {
    const one = await reinspecting('check-again-filed-report')
    const filed = await call('POST', '/api/records', { ...asWorker, 'x-mole-office-session': one.run }, {
      kind: 'report', title: 'Synthetic: the report filed in this entry’s run', summary: 'Synthetic: the entry’s work was checked.',
      data: { blocks: [{ id: 'done', type: 'text', text: 'Synthetic report content.' }], for: 'Super R', date: '2026-10-08' },
    })
    expect(filed.status, filed.raw).toBe(201)
    const own = String(filed.body['record'].id)
    const related = await call('POST', '/api/links', asWorker, { fromId: own, toId: one.run, type: 'relates_to' })
    expect(related.status, related.raw).toBe(201)
    const released = await release(one.checkAgain, { worktree: one.clone, only: [A] })
    expect(released.status, released.raw).toBe(201)
    const said = resultForTheStarter(one.checkAgain)
    expect(said.split('\n\n')[0]).toBe('Synthetic: the report filed in this entry’s run')
    expect(said).toContain(`This is the report of merge entry ${one.id}'s run ${one.run}.`)
    expect(said).not.toContain('has no report')
    expect(inspection.whatTheInspectorReads(one.checkAgain, WORKSPACE).reports.map((r) => r.record.id)).toEqual([own])
  })

  // MUTATION: put back the agent-newest fallback when the entry's run has no linked report.
  it('releases saying the entry’s run has no report, without falling back to the agent’s newest report', async () => {
    const one = await reinspecting('check-again-no-report')
    const other = await aSealedRun()
    await report('Synthetic: a report that belongs to another entry’s run', other.run)
    const released = await release(one.checkAgain, { worktree: one.clone, only: [A] })
    expect(released.status, released.raw).toBe(201)
    const said = resultForTheStarter(one.checkAgain)
    expect(said.split('\n\n')[0]).toBe(`Merge entry ${one.id}'s run ${one.run} has no report by its agent worker-w: none of that agent's reports is linked about it, and none was filed in it.`)
    expect(said).not.toContain('Synthetic: a report that belongs to another entry’s run')
    expect(said).not.toContain('Not linked about this run.')
    expect(inspection.whatTheInspectorReads(one.checkAgain, WORKSPACE).reports).toEqual([])
  })

  // Check 7W5vPJyw686I, wave 13s round 26b: a report linked `about` the entry's run by somebody other than its agent is
  // not read, so the line may not say that none is linked. MUTATION: say "none is linked to it" without naming whose.
  it('says the entry’s run has no report by its agent, though another author’s report is linked about it', async () => {
    const one = await reinspecting('check-again-another-authors-report')
    const filed = await call('POST', '/api/records', asSupervisor, {
      kind: 'report', title: 'Synthetic: a report by the supervisor about this entry’s run', summary: 'Synthetic: not the worker’s.',
      data: { blocks: [{ id: 'done', type: 'text', text: 'Synthetic report content.' }], for: 'Super R', date: '2026-10-08' },
    })
    expect(filed.status, filed.raw).toBe(201)
    const linked = await call('POST', '/api/links', asSupervisor, { fromId: String(filed.body['record'].id), toId: one.run, type: 'about' })
    expect(linked.status, linked.raw).toBe(201)
    const released = await release(one.checkAgain, { worktree: one.clone, only: [A] })
    expect(released.status, released.raw).toBe(201)
    const said = resultForTheStarter(one.checkAgain)
    expect(said.split('\n\n')[0]).toBe(`Merge entry ${one.id}'s run ${one.run} has no report by its agent worker-w: none of that agent's reports is linked about it, and none was filed in it.`)
    expect(said).not.toContain('Synthetic: a report by the supervisor about this entry’s run')
    expect(inspection.whatTheInspectorReads(one.checkAgain, WORKSPACE).reports).toEqual([])
  })

  // Check 7W5vPJyw686I, wave 13s round 26b: a run naming no agent has nobody's reports read for it, so its absence is
  // unknown, not "none". MUTATION: say the no-report sentence whether or not the run names an agent.
  it('says it is not known whether the entry’s run has a report, when the run names no agent', async () => {
    const one = await reinspecting('check-again-run-names-no-agent')
    await report('Synthetic: the worker’s report about this entry’s run', one.run)
    const original = t.api.getRecord(one.run)!.data
    t.client.sqlite.prepare("UPDATE records SET data = json_set(json_remove(data, '$.servingAgentId'), '$.servingAgent', json('null')) WHERE id = ?").run(one.run)
    try {
      expect(inspection.theAgentOfARun(t.api.getRecord(one.run)!)).toBeNull()
      const released = await release(one.checkAgain, { worktree: one.clone, only: [A] })
      expect(released.status, released.raw).toBe(201)
      const said = resultForTheStarter(one.checkAgain)
      expect(said.split('\n\n')[0]).toBe(`It is not known whether merge entry ${one.id}'s run ${one.run} has a report: the run names no agent, so nobody can tell whose reports to look for.`)
      expect(said).not.toContain('none is linked')
      expect(inspection.whatTheInspectorReads(one.checkAgain, WORKSPACE).reportOfMergeEntry).toEqual({ entry: one.id, run: one.run, agent: null })
    } finally {
      t.client.sqlite.prepare('UPDATE records SET data = json(?) WHERE id = ?').run(JSON.stringify(original), one.run)
    }
  })

  /** A synthetic note by the worker: a record a seal can pin that is not a report. */
  async function aNote(title: string): Promise<string> {
    const filed = await call('POST', '/api/records', asWorker, { kind: 'note', title, data: { body: 'Synthetic note content.' } })
    expect(filed.status, filed.raw).toBe(201)
    return String(filed.body['record'].id)
  }

  /** Runs `then` with the run naming no agent, and puts its data back after. */
  async function namingNoAgent(run: string, then: () => Promise<void>): Promise<void> {
    const original = t.api.getRecord(run)!.data
    t.client.sqlite.prepare("UPDATE records SET data = json_set(json_remove(data, '$.servingAgentId'), '$.servingAgent', json('null')) WHERE id = ?").run(run)
    try {
      expect(inspection.theAgentOfARun(t.api.getRecord(run)!)).toBeNull()
      await then()
    } finally {
      t.client.sqlite.prepare('UPDATE records SET data = json(?) WHERE id = ?').run(JSON.stringify(original), run)
    }
  }

  // Check QbN8K1qeQrnV, wave 13s round 26c: where the entry's run's seal pins records, only the seal is read; no links and
  // no filings. MUTATION: drop the seal's sentence, and the "by its agent" sentence returns.
  it('says only that the entry’s run’s seal names no report, though the worker’s report is linked about the run', async () => {
    const note = await aNote('Synthetic: the one record this entry’s seal pins')
    const one = await reinspecting('check-again-seal-names-no-report', [note])
    await report('Synthetic: the worker’s report about this entry’s run, not in its seal', one.run)
    const released = await release(one.checkAgain, { worktree: one.clone, only: [A] })
    expect(released.status, released.raw).toBe(201)
    const said = resultForTheStarter(one.checkAgain)
    expect(said.split('\n\n')[0]).toBe(`Merge entry ${one.id}'s run ${one.run} names no report in its seal. Only the seal was read, so a report linked to the run but not named in its seal was not looked for.`)
    expect(said).not.toContain("none of that agent's reports")
    const reads = inspection.whatTheInspectorReads(one.checkAgain, WORKSPACE)
    expect(reads.reports).toEqual([])
    expect(reads.reportsReadFrom).toBe('seal')
  })

  // Check QbN8K1qeQrnV, wave 13s round 26c: a seal that pins records was read, so its run naming no agent does not make
  // the answer unknown. MUTATION: test for a missing agent before the seal.
  it('says the entry’s run’s seal names no report, when the run names no agent', async () => {
    const note = await aNote('Synthetic: the one record this agentless entry’s seal pins')
    const one = await reinspecting('check-again-seal-and-no-agent', [note])
    await namingNoAgent(one.run, async () => {
      const released = await release(one.checkAgain, { worktree: one.clone, only: [A] })
      expect(released.status, released.raw).toBe(201)
      const said = resultForTheStarter(one.checkAgain)
      expect(said.split('\n\n')[0]).toBe(`Merge entry ${one.id}'s run ${one.run} names no report in its seal. Only the seal was read, so a report linked to the run but not named in its seal was not looked for.`)
      expect(said).not.toContain('nobody can tell')
      expect(inspection.whatTheInspectorReads(one.checkAgain, WORKSPACE).reportOfMergeEntry).toEqual({ entry: one.id, run: one.run, agent: null })
    })
  })

  // Wave 13s round 26c, found listing every branch: an ordinary run whose seal pins records has only its seal read.
  // MUTATION: drop the seal's sentence, and "filed no report" returns.
  it('says an ordinary run’s seal names no report, not that the run filed none', async () => {
    const note = await aNote('Synthetic: the one record an ordinary run’s seal pins')
    const one = await aSealedRun(tree(), [note])
    await report('Synthetic: the worker’s report about an ordinary run, not in its seal', one.run)
    const released = await release(one.run)
    expect(released.status, released.raw).toBe(201)
    const said = resultForTheStarter(one.run)
    expect(said.split('\n\n')[0]).toBe("The run's seal names no report, and the run wrote no line saying what it did.")
    expect(said).not.toContain('filed no report')
  })

  // A CHECK AGAIN IS HANDED THE LINKS ITS ENTRY RUN'S SEAL PINNED. Its own seal is the integrated git tree, which pins
  // none, so the reading must come from the entry run the reports already come from.
  // MUTATION: read the check-again run's own seal for its pinned links again. This goes red on the GET reply and the prompt.
  it('is handed the one link its entry run’s mixed seal pinned, in its reading and its prompt', async () => {
    const first = await report('Synthetic: the first record the entry’s mixed seal pins')
    const second = await report('Synthetic: the second record the entry’s mixed seal pins')
    const linked = await call('POST', '/api/links', asWorker, { fromId: first, toId: second, type: 'relates_to' })
    expect(linked.status, linked.raw).toBe(201)
    const one = await reinspecting('check-again-pinned-links', [first, second])
    const read = await call('GET', `/api/checks/${one.checkAgain}`, asInspector)
    expect(read.status, read.raw).toBe(200)
    expect(read.body['pinnedLinks']).toMatchObject({ links: [{ id: String(linked.body['id']) }] })
    const asked = await call('POST', `/api/checks/${one.checkAgain}/prompt`, asInspector, { changes: [] })
    expect(asked.status, asked.raw).toBe(200)
    expect(String(asked.body['prompt'])).toContain('## The links of this submission')
    expect(String(asked.body['prompt'])).toContain(String(linked.body['id']))
  })

  // CHECK yB8OJ-SUBQRd (wave 13y, round 9b). A check-again release keeps its kinds for both its readers, because the
  // queue goes on by itself (message CPeOoo0w8SyD). The worker's line would otherwise say the starter is told, and the
  // starter's would say it reads the check, since the starter here says so.
  // MUTATION PROOF: `aCheckAgain ? line :` removed from `kindFor` in `releaseOrRefuse`, and this goes red on both lines.
  it('keeps the kinds released and checkedAndReleased on a check-again release, for the worker and the starter', async () => {
    const noticeOf = (id: string): unknown =>
      (t.client.sqlite.prepare("SELECT json_extract(data, '$.notice') AS notice FROM records WHERE id = ?").get(id) as { notice: unknown }).notice
    const one = await reinspecting('check-again-kinds')
    // THE ENTRY'S OWN RUN, released above, shows the starter differs from the worker, so the kinds below are not vacuous.
    const ownLine = messagesAbout(one.run).filter((m) => m.title.startsWith('Released:'))
    expect(ownLine).toHaveLength(1)
    expect(noticeOf(ownLine[0]!.id)).toBe('releasedAndTheStarterIsTold')
    const said = await call('POST', '/api/participants/agent/super-r/reads-releases-from-the-check', asPerson,
      { on: true, because: 'Test: the starter reads the check itself.' })
    expect(said.status, said.raw).toBe(200)
    try {
      const released = await release(one.checkAgain, { worktree: one.clone, only: [A] })
      expect(released.status, released.raw).toBe(201)
      const toTheWorker = messagesAbout(one.checkAgain).filter((m) => m.title.startsWith('Released:'))
      expect(toTheWorker).toHaveLength(1)
      expect(toTheWorker[0]!.to).toEqual([{ kind: 'agent', id: idOf('worker-w') }])
      expect(noticeOf(toTheWorker[0]!.id)).toBe('released')
      const toTheStarter = messagesAbout(one.checkAgain).filter((m) => m.title.startsWith('Checked and released:'))
      expect(toTheStarter).toHaveLength(1)
      expect(toTheStarter[0]!.to).toEqual([{ kind: 'agent', id: idOf('super-r') }])
      expect(noticeOf(toTheStarter[0]!.id)).toBe('checkedAndReleased')
    } finally {
      const off = await call('POST', '/api/participants/agent/super-r/reads-releases-from-the-check', asPerson,
        { on: false, because: 'Test: the case is over.' })
      expect(off.status, off.raw).toBe(200)
    }
  })

  // MUTATION: name the ordinary run's newest unlinked report again.
  it('names no report for an ordinary run whose newest agent report is not linked about it.', async () => {
    const one = await aSealedRun()
    // Strictly newer than every report the cases above filed: the office orders reports by a wall-clock second, and
    // in the same second the agent's newest is either of two (a proof of 1 October 2026, control red once).
    await aNewSecond()
    await report('Synthetic: an ordinary run’s unlinked newest report')
    const released = await release(one.run)
    expect(released.status, released.raw).toBe(201)
    const said = resultForTheStarter(one.run)
    expect(said).toContain('The run filed no report linked about it, so there is no report to name.')
    expect(said).not.toContain('Synthetic: an ordinary run’s unlinked newest report')
    expect(inspection.whatTheInspectorReads(one.run, WORKSPACE).reportOfMergeEntry).toBeNull()
  })

  /** A synthetic report by the worker, filed outside the run and linked to it as `relates_to`, which is not read. */
  async function aReportRelatedTo(title: string, run: string): Promise<string> {
    const id = await report(title)
    const related = await call('POST', '/api/links', asWorker, { fromId: id, toId: run, type: 'relates_to' })
    expect(related.status, related.raw).toBe(201)
    return id
  }

  // Check Yf80xrwatx1C, wave 13s round 26d (row S3): only `about` links are read, so a report of the agent linked
  // `relates_to` may not be called not linked. MUTATION: say "is linked to it" again.
  it('says no report by the agent is linked about the entry’s run, though one is linked relates_to', async () => {
    const one = await reinspecting('check-again-related-report')
    await aReportRelatedTo('Synthetic: the worker’s report filed elsewhere, related to this entry’s run', one.run)
    const released = await release(one.checkAgain, { worktree: one.clone, only: [A] })
    expect(released.status, released.raw).toBe(201)
    const said = resultForTheStarter(one.checkAgain)
    expect(said.split('\n\n')[0]).toBe(`Merge entry ${one.id}'s run ${one.run} has no report by its agent worker-w: none of that agent's reports is linked about it, and none was filed in it.`)
    expect(said).not.toContain('is linked to it')
    expect(inspection.whatTheInspectorReads(one.checkAgain, WORKSPACE).reports).toEqual([])
  })

  // Check Yf80xrwatx1C, wave 13s round 26d (row S6): the agent's newest report, linked `relates_to` to an ordinary run,
  // is not linked about it, which is all that was read. MUTATION: name the agent's newest report again.
  it('names no report for an ordinary run whose newest agent report is linked relates_to', async () => {
    const one = await aSealedRun()
    // Strictly newer than every report the cases above filed (the office orders reports by a wall-clock second).
    await aNewSecond()
    const related = await aReportRelatedTo('Synthetic: an ordinary run’s newest report, related to it', one.run)
    const released = await release(one.run)
    expect(released.status, released.raw).toBe(201)
    const said = resultForTheStarter(one.run)
    expect(said).toContain('The run filed no report linked about it, so there is no report to name.')
    expect(said).not.toContain('Synthetic: an ordinary run’s newest report, related to it')
    expect(said).not.toContain('Not linked to this run.')
    expect(inspection.whatTheInspectorReads(one.run, WORKSPACE).reports[0]!.record.id).toBe(related)
  })

  // MUTATION: read the check-again run's reports with finding 57's agent-newest fallback again (main's code),
  // bypassing its entry and entry-run readers.
  it('refuses unreadable check-again entries and their runs, naming the unreadable id', async () => {
    const one = await reinspecting('check-again-broken-source')
    const original = t.api.getRecord(one.checkAgain)!.data['extra']
    const broken = 'synthetic-entry-that-does-not-exist'
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.extra.mergeEntry', ?) WHERE id = ?").run(broken, one.checkAgain)
    try {
      expect(() => inspection.whatTheInspectorReads(one.checkAgain, WORKSPACE)).toThrow(broken)
    } finally {
      t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.extra', json(?)) WHERE id = ?").run(JSON.stringify(original), one.checkAgain)
    }
    const brokenRun = 'synthetic-run-that-does-not-exist'
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.run', ?) WHERE id = ?").run(brokenRun, one.id)
    try {
      expect(() => inspection.whatTheInspectorReads(one.checkAgain, WORKSPACE)).toThrow(`No run with id ${brokenRun}.`)
    } finally {
      t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.run', ?) WHERE id = ?").run(one.run, one.id)
    }
  })

  // MUTATION PROOF: the purpose test in `releaseOrRefuse` (`theMergeEntryACheckAgainIsFor`) made always false, and this
  // goes red on the worker's words.
  it("tells the worker the run is the merge queue's check again and nobody works in it, opens no group, and stores none; a worker's own run keeps its words and its group", async () => {
    const { NO_GROUP_FOR_A_CHECK_AGAIN, theGroupForARefusal } = await releasing
    const groupName = theGroupForARefusal('worker-w')
    const one = await reinspecting('check-again-words')
    const groupsBefore = refusalGroups(groupName)
    const refused = await refuse(one.checkAgain, { worktree: one.clone, only: [A] })
    expect(refused.status, refused.raw).toBe(201)
    expect(refused.body['group']).toBeNull()
    expect(refused.body['refused']).not.toHaveProperty('group')
    expect(refusalGroups(groupName)).toBe(groupsBefore)
    expect(t.api.getRecord(one.checkAgain)!.data['refused']).not.toHaveProperty('group')

    const toTheWorker = messagesAbout(one.checkAgain).filter((m) => m.title.startsWith('Refused release'))
    expect(toTheWorker).toHaveLength(1)
    const body = toTheWorker[0]!.body
    expect(body).toContain(`The check refused to release run ${one.checkAgain}.`)
    expect(body).toContain(`the merge queue's check again for merge entry ${one.id}, cut in the merge tool's clone, and nobody works in it.`)
    expect(body).toContain(`What happens to the entry is recorded on merge entry ${one.id}, not here.`)
    expect(body).toContain(NO_GROUP_FOR_A_CHECK_AGAIN)
    // THE REFUSAL'S POINTS STILL REACH THE WORKER.
    expect(body).toContain('What is missing:\n- The test would pass with the feature deleted.')
    expect(body).toContain('What was checked: Synthetic: read the changes.')
    expect(body).not.toContain('go back to work')
    expect(body).not.toContain('bounced')
    expect(body).not.toContain('A group is open')
    // THE STARTER IS TOLD ONCE, IN THE BOUNCE NOTICE (check FtAaQVz8KES9): no "A refusal: …" beside it, and the
    // notice carries what that line said, here that no group was opened.
    expect(messagesAbout(one.checkAgain).filter((m) => m.title.startsWith('A refusal:'))).toEqual([])
    const told = (await entry(one.id)).machine.told
    expect(told.submitter).toHaveLength(1)
    expect(refused.body['toTheStarter']).toBe(told.submitter[0])
    const toTheStarter = messagesAbout(one.run).find((m) => m.id === told.submitter[0])!
    expect(toTheStarter.to.map((who) => who.id)).toContain(idOf('super-r'))
    expect(toTheStarter.body).toContain(NO_GROUP_FOR_A_CHECK_AGAIN)
    expect(toTheStarter.body).not.toContain('A group is open')

    // A WORKER'S OWN RUN, REFUSED AT THE PIN: the same words as always, and a group.
    const two = await anEntry()
    expect((await step(two.id, 'pinned', { files: contentOf(two.seal) })).status).toBe(200)
    const ownBefore = refusalGroups(groupName)
    const own = await refuse(two.run)
    expect(own.status, own.raw).toBe(201)
    expect(typeof own.body['group']).toBe('string')
    expect(own.body['refused'].group).toBe(own.body['group'])
    expect(refusalGroups(groupName)).toBe(ownBefore + 1)
    expect(t.api.getRecord(two.run)!.data['refused']).toMatchObject({ group: own.body['group'] })
    const ownWords = messagesAbout(two.run).filter((m) => m.title.startsWith('Refused release'))
    expect(ownWords).toHaveLength(1)
    expect(ownWords[0]!.body).toContain(`You are not released. Your run ${two.run} does not end; go back to work.`)
    expect(ownWords[0]!.body).toContain(`The refusal stands while it is talked out. A group is open: ${String(own.body['group'])}.`)
    expect(ownWords[0]!.body).not.toContain(NO_GROUP_FOR_A_CHECK_AGAIN)
  })

  // MUTATION PROOF: the write of the ending dropped from `testOrBounce`, and this goes red on the standing.
  it('ends the check-again run with the bounce: it stands closed, waits on nobody, is no unreleased finish, and says so naming the entry', async () => {
    const { ENDED_WITH_ITS_MERGE_ENTRY, endedWithItsMergeEntrySays, readEndedWithItsMergeEntry } = await releasing
    const one = await reinspecting('check-again-ended')
    expect((await refuse(one.checkAgain, { worktree: one.clone, only: [A] })).status).toBe(201)
    expect((await entry(one.id)).state).toBe('bounced')

    const read = await call('GET', `/api/checks/${one.checkAgain}`, asStranger)
    expect(read.status, read.raw).toBe(200)
    const stands = read.body['stands']
    expect(stands.standing).toBe('closed')
    expect(stands.waitingFor).toBeNull()
    expect(stands.unreleasedFinish).toBe(false)
    expect(stands.says).toContain(`merge entry ${one.id}`)
    const ended = readEndedWithItsMergeEntry(t.api.getRecord(one.checkAgain)!.data[ENDED_WITH_ITS_MERGE_ENTRY])
    expect(ended).toMatchObject({ entry: one.id, because: `Ended with merge entry ${one.id}, which its refusal bounced; nobody works in a check-again run.` })
    expect(stands.says).toBe(endedWithItsMergeEntrySays(ended!, sayInEnglish))
    // THE REFUSAL IS STILL READ ON THE RUN: the run's page draws it.
    expect(stands.refused).toMatchObject({ missing: ['The test would pass with the feature deleted.'] })
    // AND THE STARTER'S LIST DOES NOT COUNT IT AS A FINISH NOBODY RELEASED.
    expect(inspection.whereARunStands(t.api.getRecord(one.checkAgain)!).unreleasedFinish).toBe(false)
  })

  // EVERY PATH OF THE WORKER'S SENTENCE: `testOrBounce` bounces only an entry still reinspecting on this run, so an entry
  // withdrawn first does not bounce, and the ending, written with the bounce and only with it, is not written either.
  it('says the same to the worker when the entry was withdrawn first, and neither bounces the entry nor ends the run', async () => {
    const { ENDED_WITH_ITS_MERGE_ENTRY, NO_GROUP_FOR_A_CHECK_AGAIN } = await releasing
    const one = await reinspecting('check-again-withdrawn')
    const withdrawn = await call('POST', `/api/merge-queue/${one.id}/withdraw`, asPerson, { because: 'synthetic: withdrawn before the check again answered' })
    expect(withdrawn.status, withdrawn.raw).toBe(200)
    const refused = await refuse(one.checkAgain, { worktree: one.clone, only: [A] })
    expect(refused.status, refused.raw).toBe(201)
    expect(refused.body['group']).toBeNull()
    expect((await entry(one.id)).state).toBe('withdrawn')
    const toTheWorker = messagesAbout(one.checkAgain).filter((m) => m.title.startsWith('Refused release'))
    expect(toTheWorker).toHaveLength(1)
    expect(toTheWorker[0]!.body).toContain(`the merge queue's check again for merge entry ${one.id}, cut in the merge tool's clone, and nobody works in it.`)
    expect(toTheWorker[0]!.body).toContain(NO_GROUP_FOR_A_CHECK_AGAIN)
    expect(toTheWorker[0]!.body).not.toContain('go back to work')
    expect(t.api.getRecord(one.checkAgain)!.data).not.toHaveProperty(ENDED_WITH_ITS_MERGE_ENTRY)
    const stands = (await call('GET', `/api/checks/${one.checkAgain}`, asStranger)).body['stands']
    expect(stands.standing).toBe('rebuttal')
    expect(stands.waitingFor).toBe(NO_GROUP_FOR_A_CHECK_AGAIN)
  })
})

// ============================================================================ 11. the queue's rebase tried early

describe("the queue's rebase tried early (wave 13v round 25)", () => {
  const stopped = (mainAt: string) => ({
    files: [A],
    log: '/synthetic/early-trial/conflict.log',
    says: `git rebase ${mainAt.slice(0, 12)} stopped on a conflict it does not resolve in ${A}. The migration journal was not joined: synthetic.`,
  })
  /** The words a bounce at the entry's turn gives for the same conflict (the `conflict` step), and the early sentence. */
  const atItsTurn = (mainAt: string) => `It could not be put on top of the main world: a conflict the tool does not resolve. Files: ${A}. ${stopped(mainAt).says}`
  const foundEarly = (mainAt: string) => `This was found early, while the entry waited: the queue's rebase, with its joins, was run on a scratch copy against main ${mainAt.slice(0, 12)} before the entry's turn. The entry was never tested: no suite ran on it.`

  it('bounces an entry at the pin when the rebase stopped early, in the words of its turn and saying it was found early', async () => {
    const one = await anEntry('early-at-pin')
    const mainAt = 'a1'.repeat(20)
    const pinned = await step(one.id, 'pinned', { files: contentOf(one.seal), rebaseStopped: { mainAt, ...stopped(mainAt) } })
    expect(pinned.status, pinned.raw).toBe(200)
    expect(pinned.body['entry'].state).toBe('bounced')
    expect((await entry(one.id)).machine.bounced).toMatchObject({ reason: 'conflict', files: [A], mainAt, log: '/synthetic/early-trial/conflict.log', says: `${atItsTurn(mainAt)} ${foundEarly(mainAt)}` })
  })

  it('after a landing, bounces a judged entry whose rebase stopped early, and leaves an entry that is not pinned or judged where it is', async () => {
    const waiting = await anEntry('early-after-landing-waiting')
    expect((await step(waiting.id, 'pinned', { files: contentOf(waiting.seal) })).status).toBe(200)
    expect((await release(waiting.run)).status).toBe(201)
    expect((await entry(waiting.id)).state).toBe('judged')
    const notYetPinned = await anEntry('early-after-landing-submitted')
    expect((await entry(notYetPinned.id)).state).toBe('submitted')
    const lander = await anEntry('early-after-landing-lander')
    expect((await step(lander.id, 'pinned', { files: contentOf(lander.seal) })).status).toBe(200)
    expect((await release(lander.run)).status).toBe(201)
    await toLanding(lander.id, lander.seal)
    const mainAfter = lander.seal.commit
    const landed = await step(lander.id, 'landed', {
      mainAfter,
      earlyConflicts: [
        { entry: waiting.id, tip: waiting.seal.commit, files: [A], commit: waiting.seal.commit, rebaseStopped: stopped(mainAfter) },
        { entry: notYetPinned.id, tip: notYetPinned.seal.commit, files: [A], rebaseStopped: stopped(mainAfter) },
      ],
    })
    expect(landed.status, landed.raw).toBe(200)
    expect(landed.body['entry'].state).toBe('merged')
    const bounced = await entry(waiting.id)
    expect(bounced.state).toBe('bounced')
    expect(bounced.machine.bounced).toMatchObject({ reason: 'conflict', files: [A], mainAt: mainAfter, log: '/synthetic/early-trial/conflict.log', says: `${atItsTurn(mainAfter)} ${foundEarly(mainAfter)}` })
    expect((await entry(notYetPinned.id)).state, 'an entry that is not waiting at the replayed commit is not touched').toBe('submitted')
    expect(landed.body['entry'].machine.told.says).toContain(`Merge entry ${waiting.id} was sent back: the queue's rebase, tried early on a scratch copy, stopped in ${A}, and it was never tested.`)
  })
})

// ============================================================================ 12. a plugin-only change (plan VlQueUhVQQmi)

// These tests cite a decision.
describe("a plugin-only change, tested by the plugin's own check (plan VlQueUhVQQmi)", () => {
  // WAVE 13X ROUND 16, STEP 4 OF THE PLUGIN PIPELINE (block 1Asl25_3DvQM). A change that touches only one plugin's folder
  // is tested by that plugin's own check and the privacy gates, and not by the office's suite. The merge tool says so
  // with `plugin` on its tested step; the office takes that only for an entry whose integrated result changes that
  // plugin's folder and nothing else on top of the main it was integrated on, worked out by the one rule
  // `aPluginOnlyChange` from the paths of the integrate step, and keeps it on the entry. The plugin is made up.
  /** A synthetic tree whose `work` branch changes only the files `paths` of the made-up plugin. */
  function aPluginTree(paths: string[]): string {
    const dir = scratch('plugin-tree')
    git(dir, 'init', '-q', '-b', 'main')
    git(dir, 'config', 'user.email', 'fixture@example.invalid')
    git(dir, 'config', 'user.name', 'Synthetic merge machine fixture')
    writeFileSync(join(dir, 'README.md'), 'Synthetic baseline.\n')
    git(dir, 'add', '.')
    git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
    git(dir, 'switch', '-q', '-c', 'work')
    for (const path of paths) {
      mkdirSync(dirname(join(dir, 'plugins', 'made-up', path)), { recursive: true })
      writeFileSync(join(dir, 'plugins', 'made-up', path), `Synthetic ${path} of a made-up plugin, from ${basename(dir)}.\n`)
    }
    git(dir, 'add', '.')
    git(dir, 'commit', '-q', '-m', 'Synthetic plugin change')
    return dir
  }
  /** A judged entry taken to testing: of the made-up plugin's `paths`, or of the ordinary synthetic tree. */
  async function atTesting(branch: string, paths: string[] | null) {
    const sealed = await aSealedRun(paths === null ? tree() : aPluginTree(paths))
    const submitted = await call('POST', '/api/merge-queue', asSupervisor, { run: sealed.run, changeset: { adapter: 'git', repository: 'fixture-main', branch } })
    expect(submitted.status, submitted.raw).toBe(201)
    const one = { id: String(submitted.body['entry'].id), ...sealed }
    expect((await release(one.run)).status).toBe(201)
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    await toTesting(one.id, one.seal)
    return one
  }
  const byItsOwnCheck = (plugin: { id: string; manifest: boolean }) => ({ green: true, log: '/synthetic/plugin-check.log', says: "Synthetic: the plugin's own check passed.", plugin })
  /** The entry is where it was, and holds no test result: nothing was written. */
  async function nothingWritten(id: string): Promise<void> {
    const reading = await entry(id)
    expect(reading.state).toBe('testing')
    expect(reading.machine.tested).toBeUndefined()
  }

  it("keeps a green result of the plugin's own check, says the office's suite did not run, and says so again when it lands", async () => {
    const one = await atTesting('plugin-green', ['main.ts', 'plugin.json'])
    const green = await step(one.id, 'tested', { ...byItsOwnCheck({ id: 'made-up', manifest: true }), tip: one.seal.commit })
    expect(green.status, green.raw).toBe(200)
    expect(green.body['entry'].machine.tested).toMatchObject({ green: true, plugin: { id: 'made-up', manifest: true } })
    expect(green.body['decided']).toContain("It changes only plugins/made-up, so it was tested by that plugin's own check and the privacy gates, and not by the office's suite")
    expect((await step(one.id, 'landing', { mainAt: one.seal.forkBase })).status).toBe(200)
    const landed = await step(one.id, 'landed', { mainAfter: one.seal.commit })
    expect(landed.status, landed.raw).toBe(200)
    expect(t.api.getRecord(one.id)!.data['integrated']).toMatchObject({ tests: { log: '/synthetic/plugin-check.log', plugin: { id: 'made-up', manifest: true } } })
    const line = toTheSecretary(one.run).find((m) => m.id === landed.body['entry'].machine.told.secretary)
    expect(line?.title).toMatch(new RegExp(`^merged [^:]+: worker-w #${one.id} 2 files → main ${one.seal.commit.slice(0, 7)} \\(plugin check green, reinspected 0\\)$`, 'u'))
  })

  it("refuses that result for an entry that changes anything outside one plugin's folder", async () => {
    const code = await atTesting('plugin-not-only', null)
    const refused = await step(code.id, 'tested', byItsOwnCheck({ id: 'made-up', manifest: false }))
    expect(refused.status, refused.raw).toBe(409)
    expect(refused.body['error']).toContain(`Merge entry ${code.id} changes files outside one plugin's folder`)
    await nothingWritten(code.id)
  })

  it('refuses it when it names another plugin, or says otherwise of the manifest', async () => {
    const one = await atTesting('plugin-other', ['main.ts'])
    for (const plugin of [{ id: 'another-one', manifest: false }, { id: 'made-up', manifest: true }]) {
      const refused = await step(one.id, 'tested', byItsOwnCheck(plugin))
      expect(refused.status, refused.raw).toBe(409)
      expect(refused.body['error']).toContain(`Merge entry ${one.id} changes plugins/made-up and not its manifest`)
      await nothingWritten(one.id)
    }
  })

  // PROBLEM gy40yKomK_FQ: AN EARLIER ROUND OF THE SAME BRANCH LANDS BETWEEN THE SEAL AND THE INTEGRATION. The office
  // map's round 8 was sealed on a fork base from before its round 6c landed, so its seal still held 6c's manifest change.
  // The tree the plugin's own check tested, round 8 on top of the main that already held 6c, did not change the manifest,
  // and the office refused that true result until the entry bounced. The claim is read against the base the tested
  // result has: the paths the integrate step says the result changes on top of the main it was integrated on.
  // MUTATION, after a control run: in src/server/lib/merge-state-machine.ts, make whyAPluginsCheckCannotStandFor read
  // the paths off the seal again, `Object.keys(theSubmittedContentOf(entry))`, and this case goes red.
  /** A synthetic branch of two rounds of the made-up plugin: the earlier changes its manifest, the later adds a page. */
  function twoRoundsOfOnePlugin(): { dir: string; earlier: string; later: string } {
    const dir = scratch('plugin-rounds')
    git(dir, 'init', '-q', '-b', 'main')
    git(dir, 'config', 'user.email', 'fixture@example.invalid')
    git(dir, 'config', 'user.name', 'Synthetic merge machine fixture')
    mkdirSync(join(dir, 'plugins', 'made-up'), { recursive: true })
    for (const path of ['plugin.json', 'main.ts']) writeFileSync(join(dir, 'plugins', 'made-up', path), `Synthetic ${path} of a made-up plugin, before.\n`)
    git(dir, 'add', '.')
    git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
    git(dir, 'switch', '-q', '-c', 'work')
    for (const path of ['plugin.json', 'main.ts']) writeFileSync(join(dir, 'plugins', 'made-up', path), `Synthetic ${path} of a made-up plugin, from the earlier round of ${basename(dir)}.\n`)
    git(dir, 'add', '.')
    git(dir, 'commit', '-q', '-m', 'Synthetic earlier round: the manifest and main.ts')
    const earlier = git(dir, 'rev-parse', 'HEAD')
    writeFileSync(join(dir, 'plugins', 'made-up', 'page.ts'), `Synthetic page.ts of a made-up plugin, from the later round of ${basename(dir)}.\n`)
    git(dir, 'add', '.')
    git(dir, 'commit', '-q', '-m', 'Synthetic later round: a page')
    return { dir, earlier, later: git(dir, 'rev-parse', 'HEAD') }
  }

  it('reads the claim against the main it was integrated on, when an earlier round of its branch landed after the seal', async () => {
    const { dir, earlier, later } = twoRoundsOfOnePlugin()
    const sealed = await aSealedRun(dir)
    const PAGE = 'plugins/made-up/page.ts'
    expect(sealed.seal.files.map((one) => one.path).sort(), "the seal, cut before the earlier round landed, still holds that round's manifest").toEqual([
      'plugins/made-up/main.ts',
      PAGE,
      'plugins/made-up/plugin.json',
    ])
    const submitted = await call('POST', '/api/merge-queue', asSupervisor, { run: sealed.run, changeset: { adapter: 'git', repository: 'fixture-main', branch: 'plugin-rounds' } })
    expect(submitted.status, submitted.raw).toBe(201)
    const id = String(submitted.body['entry'].id)
    expect((await release(sealed.run)).status).toBe(201)
    expect((await step(id, 'pinned', { files: contentOf(sealed.seal) })).body['entry'].state).toBe('judged')
    expect((await step(id, 'integrating', {})).status).toBe(200)
    // THE EARLIER ROUND LANDED FIRST, so main is at its commit, and the later round's own commit is the integrated result:
    // the one file it changes on top of that main is its page.
    const integrated = await step(id, 'integrated', { result: later, mainAt: earlier, files: { [PAGE]: contentOf(sealed.seal)[PAGE] } })
    expect(integrated.status, integrated.raw).toBe(200)
    expect(integrated.body['entry'].state).toBe('testing')

    const refused = await step(id, 'tested', byItsOwnCheck({ id: 'made-up', manifest: true }))
    expect(refused.status, `a result that says the manifest changed, when the integrated result leaves it alone: ${refused.raw}`).toBe(409)
    expect(refused.body['error']).toContain(`Merge entry ${id} changes plugins/made-up and not its manifest on top of main ${earlier}`)
    await nothingWritten(id)

    const green = await step(id, 'tested', { ...byItsOwnCheck({ id: 'made-up', manifest: false }), tip: later })
    expect(green.status, `the true result of the plugin's own check on the tested tree: ${green.raw}`).toBe(200)
    expect(green.body['entry'].machine.tested).toMatchObject({ green: true, plugin: { id: 'made-up', manifest: false } })
  })

  // WAVE 13X ROUND 17: THE QUEUE'S HALF OF THE PLUGIN RULE. A check does not read a plugin-only change that
  // leaves the manifest alone, so a file of it whose content changed on top of main asks for no check again; one that
  // changes the manifest is read, and asks as before. The integrate step says which way the rule went. The inspector's
  // half is proved in tests/an-inspector-reads-a-plugin-change-only-when-its-manifest-changes.test.ts.
  // MUTATIONS, each alone, after a control run: in src/server/lib/merge-state-machine.ts, make `notReadByThePluginRule`
  // answer false, and the first case goes to reinspecting; make `thePluginRuleSays` answer '', and both go red on what
  // the step decided.
  /** A judged entry of the made-up plugin's `paths`, holding its lane at integrating, with a clone at its tip. */
  async function atIntegrating(branch: string, paths: string[]) {
    const sealed = await aSealedRun(aPluginTree(paths))
    const submitted = await call('POST', '/api/merge-queue', asSupervisor, { run: sealed.run, changeset: { adapter: 'git', repository: 'fixture-main', branch } })
    expect(submitted.status, submitted.raw).toBe(201)
    const one = { id: String(submitted.body['entry'].id), ...sealed }
    expect((await release(one.run)).status).toBe(201)
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    expect((await step(one.id, 'integrating', {})).status).toBe(200)
    return { ...one, clone: aCloneAtTheTip(one.dir) }
  }
  const MAIN = 'plugins/made-up/main.ts'

  it('asks for no check again of a file a plugin-only change that leaves its manifest alone changed on top of main, and says so', async () => {
    const one = await atIntegrating('plugin-not-read', ['main.ts', 'page.ts'])
    const files = { ...contentOf(one.seal), [MAIN]: 'c'.repeat(40) }
    const integrated = await step(one.id, 'integrated', { result: one.seal.commit, mainAt: one.seal.forkBase, clone: one.clone, files })
    expect(integrated.status, integrated.raw).toBe(200)
    expect(integrated.body['entry'].state).toBe('testing')
    expect(integrated.body['entry'].machine.reinspection).toBeUndefined()
    expect(integrated.body['decided']).toContain('1 path keeps the verdict, and nothing needs judging again.')
    expect(integrated.body['decided']).toContain(
      `1 changed file asks for no check again by the plugin rule (${MAIN}). A plugin-only change to plugins/made-up that leaves its manifest alone, so its code is not read`,
    )
    expect(integrated.body['decided']).toContain("The secret scan of plugins/made-up and the privacy gate run as always, at the merge queue's test step. The entry is testing.")
  })

  it('asks for a check again of a file a plugin-only change that changes its manifest changed on top of main, and says why', async () => {
    const one = await atIntegrating('plugin-read', ['main.ts', 'plugin.json'])
    const files = { ...contentOf(one.seal), [MAIN]: 'c'.repeat(40) }
    const integrated = await step(one.id, 'integrated', { result: one.seal.commit, mainAt: one.seal.forkBase, clone: one.clone, files })
    expect(integrated.status, integrated.raw).toBe(200)
    expect(integrated.body['entry'].state).toBe('reinspecting')
    expect(integrated.body['entry'].machine.reinspection.only).toEqual([MAIN])
    expect(integrated.body['decided']).toContain(`1 path needs judging again (${MAIN}).`)
    expect(integrated.body['decided']).toContain('A plugin-only change to plugins/made-up that changes its manifest plugins/made-up/plugin.json, so it is read as any change')
    expect(integrated.body['decided']).not.toContain('asks for no check again')
  })

  // THE CHECK AGAIN READS THE RULE ON THE SAME BASE AS THE TESTED STEP (message wqd6E-wVJHSr, after problem
  // gy40yKomK_FQ). The seal still holds the earlier round's manifest, and the integrated result changes only the page, so
  // no check reads that page by the plugin rule and none is asked for it again.
  // MUTATION, after a control run: in src/server/lib/merge-state-machine.ts, make whatNeedsACheckAgain read the plugin
  // rule off the seal again, `Object.keys(theSubmittedContentOf(entry))`, and this case goes to reinspecting.
  it('asks for no check again by the plugin rule of the integrated result, when an earlier round of its branch landed after the seal', async () => {
    const { dir, earlier, later } = twoRoundsOfOnePlugin()
    const sealed = await aSealedRun(dir)
    const PAGE = 'plugins/made-up/page.ts'
    const submitted = await call('POST', '/api/merge-queue', asSupervisor, { run: sealed.run, changeset: { adapter: 'git', repository: 'fixture-main', branch: 'plugin-rounds-again' } })
    expect(submitted.status, submitted.raw).toBe(201)
    const id = String(submitted.body['entry'].id)
    expect((await release(sealed.run)).status).toBe(201)
    expect((await step(id, 'pinned', { files: contentOf(sealed.seal) })).body['entry'].state).toBe('judged')
    expect((await step(id, 'integrating', {})).status).toBe(200)
    const integrated = await step(id, 'integrated', { result: later, mainAt: earlier, clone: aCloneAtTheTip(dir), files: { [PAGE]: 'c'.repeat(40) } })
    expect(integrated.status, integrated.raw).toBe(200)
    expect(integrated.body['entry'].state, `the page changed on top of main, and no check reads it by the plugin rule: ${String(integrated.body['decided'])}`).toBe('testing')
    expect(integrated.body['entry'].machine.reinspection).toBeUndefined()
    expect(integrated.body['decided']).toContain(
      `1 changed file asks for no check again by the plugin rule (${PAGE}). A plugin-only change to plugins/made-up that leaves its manifest alone, so its code is not read`,
    )
  })
})

// ============================================================================ 13. an entry without what its state holds

/**
 * 2zvQX2PS0BNK. FIVE PLACES REFUSED BECAUSE A MERGE ENTRY WAS IN A STATE WITHOUT A FIELD THE MERGE QUEUE
 * ALWAYS WRITES ON THE WAY INTO IT, AND NOTHING WRITES THOSE FIELDS BACK TO NULL: the office's own record is
 * broken, so no caller can mend it by waiting or asking again. That is a 500 with words, not a 409, which would
 * blame the request, and not a bare "internal error", which tells nobody anything. Each case below builds the
 * entry through the real doors, takes the field out with SQL `json_remove` (never a JSON null, which is the
 * other, malformed fact at lines 344 and 346), makes the call, and asserts the status, the exact words and that
 * nothing changed. The land-again case is above, in case 9 beside the stall it belongs to.
 *
 * THE FIFTH PLACE, theVerdictOnTheReinspection at line 961, has no case: its only caller is testOrBounce, which
 * the queue calls only when `held.reinspection.run` is this run, and its type now says `asked: Reinspection`, so
 * the impossible branch is gone rather than refused.
 *
 * MUTATION PROOF, each run alone after a control run in src/server/lib/merge-state-machine.ts:
 *   - the helper's 500 becomes 409: all five cases red;
 *   - the landed case always names all three fields: the "no test run" case red, the others green;
 *   - askAStalledLandingAgain throws a plain Error again: the land-again case red.
 */
describe('an entry without what the queue writes on the way into its state (record 2zvQX2PS0BNK)', () => {
  it('refuses the tested step of a testing entry without its integration, with words and nothing written', async () => {
    const one = await anEntry('holds-none-testing')
    expect((await release(one.run)).status).toBe(201)
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    await toTesting(one.id, one.seal)
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.integration') WHERE id = ?").run(one.id)
    const refused = await step(one.id, 'tested', {
      green: true,
      log: '/synthetic/plugin-check.log',
      says: "Synthetic: the plugin's own check passed.",
      plugin: { id: 'made-up', manifest: true },
    })
    expect(refused.status, refused.raw).toBe(500)
    expect(refused.body['error']).toBe(lacks(one.id, 'testing', 'its integration'))
    const reading = await entry(one.id)
    expect(reading.state).toBe('testing')
    expect(reading.machine.tested).toBeUndefined()
  })

  it('refuses the integrated step of an integrating entry without its judged content, with words and nothing written', async () => {
    const one = await anEntry('holds-none-integrating')
    expect((await release(one.run)).status).toBe(201)
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    const taking = await step(one.id, 'integrating', {})
    expect(taking.status, taking.raw).toBe(200)
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.judged') WHERE id = ?").run(one.id)
    const refused = await step(one.id, 'integrated', { result: one.seal.commit, mainAt: one.seal.forkBase, files: contentOf(one.seal) })
    expect(refused.status, refused.raw).toBe(500)
    expect(refused.body['error']).toBe(lacks(one.id, 'integrating', 'its judged content'))
    const reading = await entry(one.id)
    expect(reading.state).toBe('integrating')
    expect(reading.machine.integration).toBeUndefined()
  })

  it('refuses the landed step of a landing entry without its test run, with words and nothing written', async () => {
    const one = await anEntry('holds-none-landing-tested')
    expect((await release(one.run)).status).toBe(201)
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    await toLanding(one.id, one.seal)
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.tested') WHERE id = ?").run(one.id)
    const refused = await step(one.id, 'landed', { mainAfter: one.seal.commit })
    expect(refused.status, refused.raw).toBe(500)
    expect(refused.body['error']).toBe(lacks(one.id, 'landing', 'its test run'))
    expect((await entry(one.id)).state).toBe('landing')
  })

  it('refuses the landed step of a landing entry holding none of the three, naming all three', async () => {
    const one = await anEntry('holds-none-landing-all')
    expect((await release(one.run)).status).toBe(201)
    expect((await step(one.id, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
    await toLanding(one.id, one.seal)
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.integration', '$.tested', '$.verdict') WHERE id = ?").run(one.id)
    const refused = await step(one.id, 'landed', { mainAfter: one.seal.commit })
    expect(refused.status, refused.raw).toBe(500)
    expect(refused.body['error']).toBe(lacks(one.id, 'landing', 'its integration, its test run and its verdict'))
    expect((await entry(one.id)).state).toBe('landing')
  })
})
