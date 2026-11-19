// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { giveFixtureSeats } from './inspector-tool-fixture.ts'
/**
 * A SCOPED CHECK JUDGES ONLY THE PATHS IT NAMES, AND THE PATHS A CHECKER TOOL HANDS ON REACH THE
 * INSPECTOR. Sandbox v1, piece P10, and the judgment side of decision R4.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROVES
 * ---------------------------------------------------------------------------------------
 *
 * Decision R2: the verdict follows file content. When the merge queue rebases a judged submission
 * and some of its files come out different, only those files are judged again. So
 * `tools/the-inspector.mjs --only <path...>` judges the named changed paths and nothing else: it
 * reads their diffs, tells the inspector the rest keep an earlier verdict, refuses a scope naming a
 * path the submission did not change, and writes `read.only` on the verdict so a verdict on some
 * paths can never be read as one on all of them.
 *
 * Decision R4: a checker tool decides what a program can, and hands the protected paths it could
 * not decide to the inspector. `--needs-judgment <file>` reads that list, reads each path's diff
 * even outside the work area, and the server writes them into the prompt under their own heading.
 *
 * A PATH ON THE LIST THAT THE SEALED CHANGE DOES NOT TOUCH IS DROPPED, NOT REFUSED (wave 13j). The secretary: "A needs-judgment
 * path the sealed change does not touch is dropped from the list, not refused ... in the check's prompt, one line:
 * \"dropped from the list, not in the sealed change: <paths>\"; on the check record, the list as asked and the list as
 * used. Only a list left with no path at all is refused, with that reason." A path a scoped check carries is still
 * refused: it is in the change, and dropping it would leave it judged by nobody.
 *
 * ---------------------------------------------------------------------------------------
 * HOW. The real tool, the real server on a port of its own (never the live office's port), a throwaway git checkout.
 * ---------------------------------------------------------------------------------------
 *
 * No model runs. The one case that goes past `--dry` puts a `claude` on PATH that is a shell
 * script, labelled as a stand-in in its own first line, which keeps the prompt it was handed and
 * prints a verdict: the same fake runtime tests/a-whole-check-reaches-its-verdict.test.ts uses.
 *
 * MUTATIONS, each after a control run, each restored (the handback records all three runs):
 *   - `insideTheScope` answering true for every path: the scoped cases go red.
 *   - the refusal of a scope naming an unchanged path removed from `theScopeOfACheck`: that case goes red.
 *   - the needs-judgment section left out of `assembleTheInspectorsPrompt`: the list cases go red.
 *   - the scope left out of `asTheReleaseSpellsIt`: the release case goes red.
 *   - the cross-check in `rememberWhatTheCheckWouldRead` removed: the contradiction case goes red.
 *   - `readTheNeedsJudgmentList` accepting an unknown key: the unreadable-list cases go red.
 *   - `whatNeedsJudgment` refusing a path outside the change again: the dropped-path cases go red.
 *   - the dropped line left out of the prompt: the dropped-path prompt and verdict cases go red.
 *   - the refusal of a list left with no path removed: that case goes red.
 *   - a carried path dropped instead of refused: the scope-disagreement case goes red.
 *   - the list as asked left off the run: the dropped-path prompt case goes red.
 *   - the tool keeping the list as asked for its `read`: the dropped-path prompt and verdict cases go red.
 */
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { thePathsAReleaseLeftUntraced, theRecordsATraceNamedThatAreNotHeld, TRACED_HOW, type TracedChange } from '../src/shared/releasing.ts'
import { readTheNeedsJudgmentList } from '../src/config/needs-judgment.mjs'
import { THE_PATHS_HANDED_ON_FOR_JUDGMENT, WHY_THE_TOOL_COULD_NOT_DECIDE_IT } from '../src/config/inspection-ending.mjs'
import { aMadeUpCheckSession, theInspectorsRowNames } from './inspector-tool-fixture.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const INSPECTOR = join(REPO, 'tools', 'the-inspector.mjs')
const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  'x-mole-office-workspace': WORKSPACE,
})

/** What the run changed: three files inside its work area, one protected file outside it. */
const A = 'work/a.txt'
const B = 'work/b.txt'
const C = 'work/c.txt'
const RULES = 'design/rules.md'
const WHY = 'A protected path (design/) that is not a generated file, so no tool can regenerate and compare it.'

let t: TestDb
let app: FastifyInstance
let api = ''
let checkout = ''
let worktrees = ''
let bin = ''
let scratch = ''
let authority = ''
const trace = (paths: string[], how: TracedChange['how'] = "the person's word"): TracedChange => ({ paths, to: authority, how, said: 'Synthetic permission for the test changes.' })

/** What the real server answered the real tool at POST /api/checks/<run>/prompt, per run. */
interface PromptReply {
  prompt: string
  changes: { inside: { path: string; changes: string }[]; outside: string[]; only?: string[]; carried?: string[]; says: string }
}
const answered = new Map<string, PromptReply>()
/** Every request that reached the server, by URL, so a case can prove none did. */
const reached: string[] = []
const PROMPT_ROUTE = /^\/api\/checks\/([^/]+)\/prompt$/u

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** A worker of its own and a finished run, sealed at the checkout's tip. One per case. */
let workers = 0
async function aFinishedRun(title: string, directory = checkout): Promise<string> {
  workers += 1
  const handle = `a-scoped-worker-${String(workers)}`
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle, name: `A Scoped Worker ${String(workers)}`, role: 'worker', workArea: ['work'] })
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle),
    payload: {
      kind: 'session',
      title,
      data: { state: 'finished', servingAgent: handle, workingDirectory: directory, doing: 'the work under check', cutFrom: 'main' },
    },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}

function inspect(run: string, flags: string[]): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((done) => {
    const child: ChildProcess = spawn(
      process.execPath,
      [INSPECTOR, '--run', run, '--as', 'inspector-one', '--api', api, '--workspace', WORKSPACE, '--checkout', checkout, '--model', 'none', ...flags],
      { cwd: REPO, env: { ...process.env, MOLE_OFFICE_CHECK_WORKTREES: worktrees, PATH: `${bin}:${process.env.PATH ?? ''}` }, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let out = ''
    let err = ''
    child.stdout?.on('data', (d) => { out += String(d) })
    child.stderr?.on('data', (d) => { err += String(d) })
    child.on('close', (code) => { done({ code, out, err }) })
  })
}

function aListFile(name: string, body: unknown): string {
  const file = join(scratch, name)
  writeFileSync(file, JSON.stringify(body))
  return file
}

interface TheCheckRead {
  whatTheCheckWouldRead: {
    inside: string[]
    outside: string[]
    says: string
    needsJudgment?: { asked: string[]; used: string[] }
    read?: { only?: string[]; needsJudgment?: { path: string; why: string }[]; says: string }
  } | null
  submission: { id: string; seal: { hash: string; git?: { commit: string; forkBase: string; directory: string } } } | null
  stands: { released: { read: { only?: string[]; needsJudgment?: { path: string; why: string }[]; says: string } | null } | null }
}
async function theCheckOf(run: string): Promise<TheCheckRead> {
  const read = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
  expect(read.statusCode, read.body).toBe(200)
  return read.json() as TheCheckRead
}

function whatTheServerAnswered(run: string): PromptReply {
  const it = answered.get(run)
  if (it === undefined) throw new Error(`the server answered no prompt for run ${run}`)
  return it
}

beforeAll(async () => {
  t = await freshDb()
  // THE DEFAULT SET, AS A NEW OFFICE COPIES IT AT ITS FIRST START: a check quotes chapter 7 rule r-8 from the
  // office's own chapter records. Imported after freshDb, which resets the modules.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  app = (await apiApp()).app
  giveFixtureSeats(app)
  app.addHook('onRequest', (request, _reply, done) => {
    reached.push(request.url)
    done()
  })
  app.addHook('onSend', (request, _reply, payload, done) => {
    const at = PROMPT_ROUTE.exec(request.url.split('?')[0] ?? '')
    if (at !== null && request.method === 'POST' && typeof payload === 'string') {
      const said = JSON.parse(payload) as Partial<PromptReply>
      if (typeof said.prompt === 'string' && said.changes !== undefined) answered.set(at[1] ?? '', said as PromptReply)
    }
    done(null, payload)
  })
  await app.ready()
  api = await app.listen({ port: 0, host: '127.0.0.1' })
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(AS_THE_PERSON, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
  // THE OFFICE IS ONE OF THIS BRANCH: the inspector's Casting row names the model --model names below, none, with native
  // data, so the check starts from the row's selection and not from the compatibility list, which names no such model.
  await theInspectorsRowNames(app, 'none', AS_THE_PERSON)
  authority = t.api.createRecord({ kind: 'note', title: 'Synthetic permission for trace tests', origin: 'fixture', workspaceId: WORKSPACE, data: {}, actor: { type: 'human', id: THE_PERSON } }).id

  checkout = mkdtempSync(join(tmpdir(), 'mole-office-a-scoped-check-'))
  worktrees = mkdtempSync(join(tmpdir(), 'mole-office-scoped-check-worktrees-'))
  bin = mkdtempSync(join(tmpdir(), 'mole-office-a-stand-in-claude-'))
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-needs-judgment-lists-'))
  const git = (...argv: string[]): void => { execFileSync('git', argv, { cwd: checkout, stdio: 'ignore' }) }
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'a-test@example.invalid')
  git('config', 'user.name', 'A test')
  mkdirSync(join(checkout, 'work'))
  mkdirSync(join(checkout, 'design'))
  for (const path of [A, B, C, RULES]) writeFileSync(join(checkout, path), `${path} before.\n`)
  git('add', '-A')
  git('commit', '-q', '-m', 'Before the work')
  git('checkout', '-q', '-b', 'the-work')
  writeFileSync(join(checkout, A), `${A} before.\nA CHANGED IN THE REBASE.\n`)
  writeFileSync(join(checkout, B), `${B} before.\nB WAS JUDGED BEFORE.\n`)
  writeFileSync(join(checkout, C), `${C} before.\nC WAS JUDGED BEFORE.\n`)
  writeFileSync(join(checkout, RULES), `${RULES} before.\nA CHANGED RULE.\n`)
  git('commit', '-qam', 'The work under check')
})

afterAll(async () => {
  await app.close()
  t.close()
  for (const dir of [checkout, worktrees, bin, scratch]) rmSync(dir, { recursive: true, force: true })
})

describe('--only: a scoped check judges only the paths it names', () => {
  it('reads the named path, names the rest as keeping an earlier verdict, and keeps the scope on the run', async () => {
    const run = await aFinishedRun('A run checked again for one file')
    const ran = await inspect(run, ['--dry', '--only', A])
    expect(ran.code, ran.err).toBe(0)
    expect(ran.out).toContain(`This is a scoped check of ${A}; 3 other changed paths keep an earlier verdict and are not read.`)

    const said = whatTheServerAnswered(run)
    expect(said.changes.only).toEqual([A])
    expect(said.changes.inside.map((one) => one.path)).toEqual([A])
    expect(said.changes.outside).toEqual([])
    expect([...(said.changes.carried ?? [])].sort()).toEqual([RULES, B, C].sort())
    expect(said.prompt).toContain('THIS IS A SCOPED CHECK')
    expect(said.prompt).toContain('+A CHANGED IN THE REBASE.')
    // THE CARRIED FILES ARE NAMED AND NEVER READ: not into the prompt and not into the request.
    expect(said.prompt).toContain(`named here, not read: ${said.changes.carried?.join(', ') ?? ''}`)
    expect(said.prompt).not.toContain('WAS JUDGED BEFORE')
    expect(JSON.stringify(said.changes)).not.toContain('WAS JUDGED BEFORE')

    const onTheRun = (await theCheckOf(run)).whatTheCheckWouldRead
    expect(onTheRun?.inside).toEqual([A])
    expect(onTheRun?.read?.only).toEqual([A])
    expect(onTheRun?.says).toContain(`This is a scoped check of ${A}; 3 other changed paths keep an earlier verdict`)
  })

  it('leaves a check of the whole submission as it was: every change read, no scope said', async () => {
    const run = await aFinishedRun('A run checked whole')
    const ran = await inspect(run, ['--dry'])
    expect(ran.code, ran.err).toBe(0)
    const said = whatTheServerAnswered(run)
    expect(said.changes.only).toBe(undefined)
    expect(said.changes.carried).toBe(undefined)
    expect(said.changes.inside.map((one) => one.path)).toEqual([A, B, C])
    expect(said.prompt).not.toContain('THIS IS A SCOPED CHECK')
    expect((await theCheckOf(run)).whatTheCheckWouldRead?.read?.only).toBe(undefined)
  })

  it('refuses a scope naming a path the submission did not change, and writes nothing', async () => {
    const run = await aFinishedRun('A run checked for a file it never changed')
    const ran = await inspect(run, ['--dry', '--only', A, 'work/never-changed.txt'])
    expect(ran.code).toBe(1)
    expect(ran.err).toContain('422')
    expect(ran.err).toContain('work/never-changed.txt, which this submission did not change')
    expect((await theCheckOf(run)).whatTheCheckWouldRead).toBe(null)
  })
})

describe('--needs-judgment: the paths a checker tool could not decide reach the inspector', () => {
  it('writes each path, why, and its diff into the prompt, even outside the work area', async () => {
    const run = await aFinishedRun('A run that changed a protected file')
    const list = aListFile('from-a-checker.json', {
      decided: [{ path: 'design/ground/TEST-AUDIT-2026-09-03.md', regenerated: 'identical' }],
      needsJudgment: [{ path: RULES, why: WHY }],
    })
    const ran = await inspect(run, ['--dry', '--needs-judgment', list])
    expect(ran.code, ran.err).toBe(0)
    expect(ran.out).toContain("The report's other keys were not read: decided.")
    expect(ran.out).toContain(`${THE_PATHS_HANDED_ON_FOR_JUDGMENT} ${RULES}.`)

    const said = whatTheServerAnswered(run)
    // Outside the work area it is still named and not read in the changes section...
    expect(said.changes.outside).toEqual([RULES])
    // ...and it is read in the section of its own, because judging it is the inspector's job.
    expect(said.prompt).toContain('## Paths a checker tool handed to you')
    expect(said.prompt).toContain(`### ${RULES}\n\n${WHY_THE_TOOL_COULD_NOT_DECIDE_IT} ${WHY}`)
    expect(said.prompt).toContain('+A CHANGED RULE.')

    const onTheRun = (await theCheckOf(run)).whatTheCheckWouldRead
    expect(onTheRun?.read?.needsJudgment).toEqual([{ path: RULES, why: WHY }])
    expect(onTheRun?.says).toContain(`A checker tool handed on 1 path that needs judgment, and the check reads it: ${RULES}.`)
  })

  it('says so when a checker ran and handed nothing on, which is not the same as no checker', async () => {
    const run = await aFinishedRun('A run a checker found nothing to hand on in')
    const ran = await inspect(run, ['--dry', '--needs-judgment', aListFile('nothing.json', [])])
    expect(ran.code, ran.err).toBe(0)
    expect(whatTheServerAnswered(run).prompt).toContain('handed on no path that needs judgment')
    expect((await theCheckOf(run)).whatTheCheckWouldRead?.read?.needsJudgment).toEqual([])
  })

  it('refuses a path handed on that the scope does not judge, and writes nothing', async () => {
    const run = await aFinishedRun('A run whose list and scope disagree')
    const ran = await inspect(run, ['--dry', '--only', A, '--needs-judgment', aListFile('outside-the-scope.json', [{ path: RULES, why: WHY }])])
    expect(ran.code).toBe(1)
    expect(ran.err).toContain(`${RULES} is on the needs-judgment list, but this scoped check does not judge it`)
    expect((await theCheckOf(run)).whatTheCheckWouldRead).toBe(null)
  })

  it('stops before it asks the office anything when the list cannot be read', async () => {
    const run = await aFinishedRun('A run handed an unreadable list')
    const before = reached.length
    const ran = await inspect(run, ['--dry', '--needs-judgment', aListFile('unreadable.json', [{ path: RULES, why: WHY, rule: 'design/' }])])
    expect(ran.code).toBe(2)
    expect(ran.err).toContain('carries "rule", which this reader does not read')
    expect(reached.slice(before).filter((url) => url.includes(run))).toEqual([])
    // AND NO WORKTREE WAS CUT FOR IT: the list is read before anything else happens.
    expect(readdirSync(worktrees).filter((name) => name.includes(run))).toEqual([])
  })
})

/** A path no change of the fixture touches: a list that names a file at the wrong folder. */
const ELSEWHERE = 'design/elsewhere/rules.md'

describe('a needs-judgment path the sealed change does not touch is dropped, and only an empty list is refused', () => {
  it('drops it, says so in one line of the prompt, and keeps the list as asked and as used on the run', async () => {
    const run = await aFinishedRun('A run handed a list that names a path it did not change')
    const ran = await inspect(run, ['--dry', '--needs-judgment', aListFile('one-path-elsewhere.json', [{ path: RULES, why: WHY }, { path: ELSEWHERE, why: WHY }])])
    expect(ran.code, ran.err).toBe(0)
    expect(ran.out).toContain(`dropped from the needs-judgment list, not in the sealed change: ${ELSEWHERE}`)
    expect(ran.out).toContain(`${THE_PATHS_HANDED_ON_FOR_JUDGMENT} ${RULES}.`)

    const said = whatTheServerAnswered(run)
    expect(said.prompt).toContain(`\ndropped from the list, not in the sealed change: ${ELSEWHERE}\n`)
    expect(said.prompt).toContain(`### ${RULES}\n\n${WHY_THE_TOOL_COULD_NOT_DECIDE_IT} ${WHY}`)
    expect(said.prompt).not.toContain(`### ${ELSEWHERE}`)

    const onTheRun = (await theCheckOf(run)).whatTheCheckWouldRead
    expect(onTheRun?.needsJudgment).toEqual({ asked: [RULES, ELSEWHERE], used: [RULES] })
    expect(onTheRun?.read?.needsJudgment).toEqual([{ path: RULES, why: WHY }])
    expect(onTheRun?.says).toContain(`1 path on the needs-judgment list was dropped, not in the sealed change: ${ELSEWHERE}.`)
  })

  it('answers at the prompt door which paths it used and which it dropped', async () => {
    const run = await aFinishedRun('A run whose list is answered at the prompt door')
    const changes = [A, B, C, RULES].map((path) => ({ path, changes: 'Synthetic diff.' }))
    const listed = await app.inject({ method: 'POST', url: `/api/checks/${run}/prompt`, headers: asAgent('inspector-one'),
      payload: { changes, needsJudgment: [RULES, ELSEWHERE].map((path) => ({ path, why: WHY, changes: '' })) } })
    expect(listed.statusCode, listed.body).toBe(200)
    expect(listed.json().needsJudgment).toEqual({ used: [RULES], dropped: [ELSEWHERE] })
    const none = await app.inject({ method: 'POST', url: `/api/checks/${run}/prompt`, headers: asAgent('inspector-one'), payload: { changes } })
    expect(none.statusCode, none.body).toBe(200)
    expect(none.json().needsJudgment).toBe(null)
  })

  it('refuses a list left with no path at all, with that reason, and writes nothing', async () => {
    const run = await aFinishedRun('A run handed a list of paths it did not change')
    const ran = await inspect(run, ['--dry', '--needs-judgment', aListFile('every-path-elsewhere.json', [{ path: ELSEWHERE, why: WHY }])])
    expect(ran.code).toBe(1)
    expect(ran.err).toContain(`Every path on the needs-judgment list is outside the sealed change, so the list is left with no path: ${ELSEWHERE}.`)
    expect((await theCheckOf(run)).whatTheCheckWouldRead).toBe(null)
  })

  it('hands the model the line, and the release carries only the list as used', async () => {
    const run = await aFinishedRun('A run with a path dropped from its list, to its verdict')
    const kept = join(scratch, `the-prompt-${run}.txt`)
    const answer = { verdict: 'released', traced: [trace([A, B, C, RULES])], check: `Judged every change, ${RULES} among them.`, chaptersRead: [] }
    const envelope = JSON.stringify({ result: JSON.stringify(answer) }).replace(/'/gu, "'\\''")
    writeFileSync(join(bin, 'claude'), `#!/bin/sh\n# A STAND-IN FOR THE claude COMMAND, written by a test. It runs no model.\ncat > '${kept}'\nprintf '%s' '${envelope}'\n`)
    chmodSync(join(bin, 'claude'), 0o755)

    const ran = await inspect(run, ['--on-the-host', '--check', aMadeUpCheckSession(), '--needs-judgment', aListFile('one-path-elsewhere-to-a-verdict.json', [{ path: RULES, why: WHY }, { path: ELSEWHERE, why: WHY }])])
    expect(ran.code, ran.err).toBe(0)
    expect(ran.out).toContain('The check answered: released.')
    expect(readFileSync(kept, 'utf8')).toContain(`dropped from the list, not in the sealed change: ${ELSEWHERE}`)
    const released = (await theCheckOf(run)).stands.released
    expect(released?.read?.needsJudgment).toEqual([{ path: RULES, why: WHY }])
  })
})

describe('the scoped verdict, through the fake runtime', () => {
  it('hands the model the scope and the list, and the release says it covers only those paths', async () => {
    const run = await aFinishedRun('A run checked again, to its verdict')
    const kept = join(scratch, `the-prompt-${run}.txt`)
    const answer = { verdict: 'released', traced: [trace([A, RULES])], check: `Judged ${A} and ${RULES}; the rule change is the one the brief asked for.`, chaptersRead: [] }
    const envelope = JSON.stringify({ result: JSON.stringify(answer) }).replace(/'/gu, "'\\''")
    writeFileSync(join(bin, 'claude'), `#!/bin/sh\n# A STAND-IN FOR THE claude COMMAND, written by a test. It runs no model.\ncat > '${kept}'\nprintf '%s' '${envelope}'\n`)
    chmodSync(join(bin, 'claude'), 0o755)

    // THE STAND-IN claude IS ON THIS MACHINE'S PATH, so the model is run here: --on-the-host. The sandbox
    // path is tests/the-inspector-builds-and-runs-its-model-in-a-sandbox.test.ts.
    const ran = await inspect(run, ['--on-the-host', '--check', aMadeUpCheckSession(), '--only', A, RULES, '--needs-judgment', aListFile('in-the-scope.json', { needsJudgment: [{ path: RULES, why: WHY }] })])
    expect(ran.code, ran.err).toBe(0)
    expect(ran.out).toContain('The check answered: released.')

    // THE BRIEF THE JUDGING AGENT WAS GIVEN, as it arrived on its standard input.
    const brief = readFileSync(kept, 'utf8')
    expect(brief).toContain('THIS IS A SCOPED CHECK')
    expect(brief).toContain(`Judge these 2 and nothing else: ${A}, ${RULES}.`)
    expect(brief).toContain(`${WHY_THE_TOOL_COULD_NOT_DECIDE_IT} ${WHY}`)
    expect(brief).toContain('+A CHANGED RULE.')
    expect(brief).not.toContain('WAS JUDGED BEFORE')

    // THE RELEASE ITSELF SAYS WHAT IT COVERS, so it can never be read as a verdict on everything.
    const released = (await theCheckOf(run)).stands.released
    expect(released?.read?.only).toEqual([A, RULES])
    expect(released?.read?.needsJudgment).toEqual([{ path: RULES, why: WHY }])
    expect(released?.read?.says).toContain('It was a scoped check')
  })
})

describe('the record cannot contradict the prompt it describes', () => {
  it('refuses an assembly whose read names a scope the body was not assembled with', async () => {
    const run = await aFinishedRun('A run whose assembly would contradict itself')
    const check = await theCheckOf(run)
    const seal = check.submission
    expect(seal?.seal.git, 'the fixture run was not sealed at a git tip').toBeTruthy()
    const reply = await app.inject({
      method: 'POST',
      url: `/api/checks/${run}/assembled`,
      headers: asAgent('inspector-one'),
      payload: {
        changes: [A, B, C, RULES].sort().map((path) => ({ path, changes: 'a diff' })),
        base: { ref: seal?.seal.git?.forkBase ?? '', how: 'fork point', says: 'The fixed fork base of the seal.' },
        read: { sealId: seal?.id, sealHash: seal?.seal.hash, worktree: checkout, tip: seal?.seal.git?.commit, ofItsOwn: false, says: 'A read that claims a scope.', only: [A] },
      },
    })
    expect(reply.statusCode, reply.body).toBe(409)
    expect(reply.body).toContain('does not match what was assembled')
    expect((await theCheckOf(run)).whatTheCheckWouldRead).toBe(null)
  })
})

describe('readTheNeedsJudgmentList: one declaration of the list a checker tool writes', () => {
  it('reads the bare list and the checker report form alike', () => {
    expect(readTheNeedsJudgmentList([{ path: RULES, why: WHY }]).list).toEqual([{ path: RULES, why: WHY }])
    const fromAReport = readTheNeedsJudgmentList({ needsJudgment: [{ path: RULES, why: WHY }], decided: [] })
    expect(fromAReport.list).toEqual([{ path: RULES, why: WHY }])
    expect(fromAReport.says).toContain('not read: decided')
  })

  it('refuses what it cannot read with certainty, saying what is wrong', () => {
    expect(() => readTheNeedsJudgmentList({ paths: [] })).toThrow('no "needsJudgment" key')
    expect(() => readTheNeedsJudgmentList([{ path: RULES }])).toThrow('does not say why')
    expect(() => readTheNeedsJudgmentList([{ path: RULES, why: WHY, rule: 'design/' }])).toThrow('carries "rule"')
    expect(() => readTheNeedsJudgmentList([{ path: RULES, why: WHY }, { path: RULES, why: 'again' }])).toThrow('named twice')
  })
})

/** This follows item 6, step 3, of a decision, the secretary's oj9CRzzB2_8m and chapter 7 rule 5. */
describe('every check traces every judged change to the person', () => {
  // MUTATION: omit the trace section from scoped checks; the scoped case goes red.
  // MUTATION: omit the section entirely; both cases go red.
  for (const scope of ['whole', 'scoped'] as const) {
    it(`quotes the office's chapter 7 rule r-8 and asks for traced in a ${scope} check`, async () => {
      const run = await aFinishedRun(`Synthetic ${scope} trace prompt`)
      const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}/prompt`, headers: asAgent('inspector-one'),
        payload: { changes: [A, B, C, RULES].map((path) => ({ path, changes: 'Synthetic diff.' })), ...(scope === 'scoped' ? { only: [A] } : {}) } })
      expect(reply.statusCode, reply.body).toBe(200)
      // THE RULE AS THE OFFICE'S CHAPTER RECORD HOLDS IT, read back from the door. Until wave 13w this read the
      // export, src/config/rules/chapters.json, of the office this repository is developed in.
      const held = await app.inject({ method: 'GET', url: '/api/office-regulations', headers: AS_THE_PERSON })
      expect(held.statusCode, held.body).toBe(200)
      const chapter = (held.json() as { chapters: { n: number; outline: { id: string; name: string; text: string }[] }[] }).chapters.find((one) => one.n === 7)
      expect(chapter, 'the office holds no chapter 7').toBeDefined()
      const at = chapter!.outline.findIndex((one) => one.id === 'r-8')
      expect(at, 'chapter 7 holds no rule r-8').toBeGreaterThan(-1)
      const rule = chapter!.outline[at]!
      const section = reply.json().prompt.split('## Trace each change to the person')[1]?.split('\n\n---')[0] ?? ''
      expect(section).toContain(`Chapter 7 rule ${String(at + 1)}: ${rule.name}`)
      expect(section).toContain(`> ${rule.text}`)
      for (const word of ['`traced`', '"paths"', '"to"', '"how"', '"said"', ...TRACED_HOW, '`missing`', '`says` {"chapter":7}']) expect(section).toContain(word)
    })
  }

  async function reading(run: string, only?: string[], paths = [A, B, C, RULES]) {
    const seal = (await theCheckOf(run)).submission!
    const read = { sealId: seal.id, sealHash: seal.seal.hash, tip: seal.seal.git!.commit, worktree: seal.seal.git!.directory, ofItsOwn: false, says: 'Synthetic reading.', ...(only === undefined ? {} : { only }) }
    const assembled = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`, headers: asAgent('inspector-one'),
      payload: { read, changes: paths.map((path) => ({ path, changes: 'Synthetic diff.' })),
        base: { ref: seal.seal.git!.forkBase, how: 'fork point', says: 'Synthetic fixed base.' }, ...(only === undefined ? {} : { only }) } })
    expect(assembled.statusCode, assembled.body).toBe(201)
    return read
  }
  // LEAVING OUT THE RUN'S FLOW RUN, the one record a refused verdict does change since wave 1 of the office flow: the
  // refusal is recorded there as a step (tests/the-office-writes-a-runs-steps.test.ts measures it).
  const FLOW_RUNS = "SELECT id FROM records WHERE kind = 'flow_run'"
  const changesWritten = () =>
    JSON.stringify([
      t.client.sqlite.prepare("SELECT * FROM records WHERE kind != 'flow_run' ORDER BY rowid").all(),
      t.client.sqlite.prepare(`SELECT * FROM revisions WHERE record_id NOT IN (${FLOW_RUNS}) ORDER BY rowid`).all(),
      t.client.sqlite.prepare(`SELECT * FROM links WHERE from_id NOT IN (${FLOW_RUNS}) AND to_id NOT IN (${FLOW_RUNS}) ORDER BY rowid`).all(),
    ])

  // The prompt lists the paths the door asks a line for, from the one function both read (the secretary's equQKUk4-QyL: on
  // 3 October 2026 a check traced a round's source files and none of its test files, and the door refused the release).
  // MUTATION: leave the list out of the trace section; both cases go red.
  // MUTATION: list in the prompt only the changes inside the work area, a second list; the whole case goes red.
  // MUTATION: leave out the sentence that a test file needs its line too; both cases go red.
  for (const scope of ['whole', 'scoped'] as const) {
    it(`lists in a ${scope} check's trace section exactly the paths the door asks a line for`, async () => {
      const run = await aFinishedRun(`Synthetic ${scope} listed trace paths`)
      const only = scope === 'scoped' ? [A, RULES] : undefined
      const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}/prompt`, headers: asAgent('inspector-one'),
        payload: { changes: [A, B, C, RULES].map((path) => ({ path, changes: 'Synthetic diff.' })), ...(only === undefined ? {} : { only }) } })
      expect(reply.statusCode, reply.body).toBe(200)
      const section = reply.json().prompt.split('## Trace each change to the person')[1]?.split('\n\n---')[0] ?? ''
      const listed = section.split('\n').filter((line: string) => line.startsWith('- ')).map((line: string) => line.slice(2))
      expect([...listed].sort()).toEqual((scope === 'whole' ? [A, B, C, RULES] : [A, RULES]).sort())
      expect(section).toContain('a test file as much as the code it tests')
      const read = await reading(run, only)
      const short = await app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asAgent('inspector-one'),
        payload: { verdict: 'released', check: 'Synthetic check.', read, traced: [trace(listed.slice(1))] } })
      expect(short.statusCode, short.body).toBe(400)
      expect(short.body).toContain(listed[0])
      const whole = await app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asAgent('inspector-one'),
        payload: { verdict: 'released', check: 'Synthetic check.', read, traced: [trace(listed)] } })
      expect(whole.statusCode, whole.body).toBe(201)
    })
  }

  // MUTATION: remove the coverage check at the door; both whole and scoped cases go red.
  // MUTATION (wave 13y round 23): the door writes its sentence by hand again, a word changed; both cases go red on the
  // inspector's reading of it, which is what asks the check's session once for the missing lines.
  for (const scope of ['whole', 'scoped'] as const) {
    it(`refuses a ${scope} release without a trace for a judged path, names it, and writes nothing`, async () => {
      const run = await aFinishedRun(`Synthetic ${scope} missing trace`)
      const read = await reading(run, scope === 'scoped' ? [A, RULES] : undefined)
      const before = changesWritten()
      const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asAgent('inspector-one'),
        payload: { verdict: 'released', check: 'Synthetic check.', read, traced: [trace([A, B, C])] } })
      expect(reply.statusCode, reply.body).toBe(400)
      expect(reply.body).toContain(RULES)
      expect(reply.body).toContain('Nothing was written; the check can be asked again')
      expect(thePathsAReleaseLeftUntraced(String(reply.json().error))).toEqual([RULES])
      expect(changesWritten()).toBe(before)
      expect((await theCheckOf(run)).stands.released).toBeNull()
    })
  }

  // MUTATION: remove the record existence check; this case goes red.
  // MUTATION (wave 13v round 33): the door writes its sentence by hand again, a word changed; this goes red on the
  // inspector's reading of it, which is what asks the check's session once for the records its trace names.
  it('refuses a release whose trace names no record in the office and writes nothing', async () => {
    const run = await aFinishedRun('Synthetic unknown trace record')
    const read = await reading(run)
    const before = changesWritten()
    const traced = [{ ...trace([A, B, C, RULES]), to: 'no-such-record' }]
    const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asAgent('inspector-one'),
      payload: { verdict: 'released', check: 'Synthetic check.', read, traced } })
    expect(reply.statusCode, reply.body).toBe(400)
    expect(reply.body).toContain('no-such-record')
    expect(reply.body).toContain(RULES)
    expect(reply.body).toContain('Nothing was written; the check can be asked again')
    expect(theRecordsATraceNamedThatAreNotHeld(String(reply.json().error), traced)).toEqual(['no-such-record'])
    expect(changesWritten()).toBe(before)
    expect((await theCheckOf(run)).stands.released).toBeNull()
  })

  // MUTATION: look up traced.to only in the check's own project; this case goes red.
  it('accepts a trace naming a record in another project and writes the release', async () => {
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    createWorkspace({ id: 'trace-authority', title: 'Synthetic project holding trace permission' })
    const elsewhere = t.api.createRecord({ kind: 'note', title: 'Synthetic permission in another project', origin: 'fixture',
      workspaceId: 'trace-authority', data: {}, actor: { type: 'human', id: THE_PERSON } })
    expect(elsewhere.workspaceId).not.toBe(WORKSPACE)
    const run = await aFinishedRun('Synthetic trace across projects')
    const traced = [{ ...trace([A, B, C, RULES]), to: elsewhere.id }]
    const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asAgent('inspector-one'),
      payload: { verdict: 'released', check: 'Synthetic check.', read: await reading(run), traced } })
    expect(reply.statusCode, reply.body).toBe(201)
    expect(reply.json().released.traced).toEqual(traced)
    expect(t.api.getRecord(run)!.data['released']).toMatchObject({ traced })
    const kept = (await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })).json().stands.released
    expect(kept.traced).toEqual(traced)
    expect(t.api.getRecord(kept.check)!.data['body']).toContain('You are released.')
  })

  // MUTATION: leave traced out of release storage or its reader; this case goes red.
  // MUTATION: leave the path counts out of the release message; this case goes red.
  for (const scope of ['whole', 'scoped'] as const) {
    it(`writes a ${scope} release tracing every judged path, keeps the lines, and counts paths by authority`, async () => {
      const run = await aFinishedRun(`Synthetic ${scope} complete trace`)
      const traced = scope === 'whole'
        ? [trace([A, B]), trace([C, RULES], 'an engineering choice left to the agents')]
        : [trace([A, RULES], 'an engineering choice left to the agents')]
      const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asAgent('inspector-one'),
        payload: { verdict: 'released', check: 'Synthetic check.', read: await reading(run, scope === 'scoped' ? [A, RULES] : undefined), traced } })
      expect(reply.statusCode, reply.body).toBe(201)
      expect(reply.json().released.traced).toEqual(traced)
      expect(t.api.getRecord(run)!.data['released']).toMatchObject({ traced })
      const kept = (await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })).json().stands.released
      expect(kept.traced).toEqual(traced)
      const body = t.api.getRecord(kept.check)!.data['body']
      expect(body).toContain(`${scope === 'whole' ? 2 : 0} paths traced to the person's word and 2 paths to an engineering choice left to the agents.`)
    })
  }

  // MUTATION: say "paths" for one path, in either count; this case goes red.
  it('counts one traced path as "1 path" in the release message', async () => {
    const run = await aFinishedRun('Synthetic release with one path of each kind')
    const traced = [trace([A]), trace([RULES], 'an engineering choice left to the agents')]
    const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asAgent('inspector-one'),
      payload: { verdict: 'released', check: 'Synthetic check.', read: await reading(run, [A, RULES]), traced } })
    expect(reply.statusCode, reply.body).toBe(201)
    const kept = (await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })).json().stands.released
    const body = t.api.getRecord(kept.check)!.data['body']
    expect(body).toContain("1 path traced to the person's word and 1 path to an engineering choice left to the agents.")
  })

  // MUTATION: trim traced.paths at the strict door; this case goes red on the real filename.
  it('keeps the exact changed path when its filename ends in a space', async () => {
    const directory = join(scratch, 'a-space-in-the-name')
    execFileSync('git', ['clone', '-q', checkout, directory])
    const git = (...args: string[]) => execFileSync('git', ['-C', directory, ...args], { stdio: 'ignore' })
    git('config', 'user.email', 'fixture@example.invalid')
    git('config', 'user.name', 'Synthetic filename fixture')
    git('branch', 'main', 'origin/main')
    const path = 'work/a name ending in a space '
    writeFileSync(join(directory, path), 'Synthetic changed file.\n')
    git('add', '.')
    git('commit', '-qm', 'Synthetic change with a space in its name')
    const run = await aFinishedRun('Synthetic exact path trace', directory)
    const traced = [trace([path])]
    const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asAgent('inspector-one'),
      payload: { verdict: 'released', check: 'Synthetic check.', read: await reading(run, [path], [A, B, C, RULES, path]), traced } })
    expect(reply.statusCode, reply.body).toBe(201)
    expect(reply.json().released.traced).toEqual(traced)
    const kept = (await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })).json().stands.released
    expect(kept.traced).toEqual(traced)
  })

  // MUTATION: require full tracing for refusals too, or drop refusal trace storage; this case goes red.
  it('writes a refusal naming an untraced path in missing with says chapter 7, and keeps its other trace lines', async () => {
    const run = await aFinishedRun('Synthetic untraced change refused')
    const traced = [trace([A, B, C])]
    const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asAgent('inspector-one'),
      payload: { verdict: 'refused', check: 'Synthetic change lacks permission.', read: await reading(run), traced, missing: [RULES], says: { chapter: 7 } } })
    expect(reply.statusCode, reply.body).toBe(201)
    expect(reply.json().refused).toMatchObject({ missing: [RULES], chapter: 7, traced })
    const kept = (await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })).json().stands.refused
    expect(kept).toMatchObject({ missing: [RULES], chapter: 7, traced })
  })
})
