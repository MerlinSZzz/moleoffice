// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A ROUND GIVEN NO TITLE TAKES THE TITLE OF THE RUN IT CONTINUES. Problem EOixDf4A9Dia.
 *
 * tools/sandbox.mjs titled such a round "A round of <agent> in sandbox <sandbox> that continues run <run>". A run's
 * title becomes the title of its commits, and a commit title may carry no agent handle and no record id, so a check
 * refused a round's commits for that title alone. The round now takes the title of the run it continues, from the
 * record the launcher already reads to continue that run. When that record holds no title, the launcher refuses and
 * says to pass --title. It never makes a title out of the agent and the run.
 *
 * WHAT IS REAL. The host launcher and the helper it starts, each a process of its own, as an agent runs them. The
 * patterns that the owner-content screen, tools/merge-tool/owner-content.mjs, finds an agent handle and a record id
 * with, made from this file's made-up handle. The refusal's words, read from tools/sandbox-common.mjs, where the
 * launcher reads them.
 *
 * WHAT IS MADE UP. The office: a stand-in on a free loopback port that keeps the runs filed with it and answers them
 * back. Docker, through the shared stand-in. The Claude Code program, which reads its brief and exits. Every key. The
 * run ids, which the stand-in makes in the shape of the office's record ids, so the record-id pattern finds one where a
 * title carries it.
 *
 * A RUN FILED WITH NO TITLE AT ALL is filed under A_RUN_GIVEN_NO_TITLE, the words tools/sandbox-common.mjs defines,
 * which name nobody. The host launcher, the helper in a sandbox and tools/register-a-run.mjs each titled such a run "A run
 * of <agent>", two of them adding "in sandbox <sandbox>", and a round that continued one carried the handle on. Such a
 * run is not refused, because the message worker starts its workers with no --title (src/worker/runtimes/round.ts).
 *
 * THE CASES
 *   1. A worker run with a title of its own, then a round of it with no --title: the round is filed with that title,
 *      and the handle and record-id patterns find nothing in it. The same patterns find the handle and the run id when
 *      they are given them, so the case is not green because the patterns find nothing anywhere.
 *   2. The same, with the stand-in answering the first run with no title: the round is refused with the words that say
 *      to pass --title, and no run is filed for it.
 *   3. A worker the host launcher starts with no --title is filed under A_RUN_GIVEN_NO_TITLE.
 *   4. A run the helper files itself, as a supervisor in a sandbox starts its worker, with no --title: the same.
 *   5. A run tools/register-a-run.mjs files with no --title: the same.
 *   In 3 to 5 the handle and record-id patterns find nothing in the title.
 *
 * MUTATIONS, EACH TRIED ALONE AFTER A CONTROL RUN. The old words put back at the round's filing: case 1 goes red. The
 * refusal taken out, so the round is filed with no title of its own: case 2 goes red. The old default put back in
 * tools/sandbox.mjs, tools/sandbox-start.mjs or tools/register-a-run.mjs: case 3, 4 or 5 goes red.
 */
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'
import { thePatterns } from '../tools/merge-tool/owner-content.mjs'
import { THE_MODELS_START_VALUES } from '../src/config/model-efforts.mjs'
import { LEGACY_ROUND_CHAPTERS, writeRoundStartRules } from './round-chapters-fixture.ts'
import { FAKE_DOCKER } from './sandbox-stand-ins.ts'
import { A_RUN_GIVEN_NO_TITLE, aRunWithNoTitleARoundCanTakeWords, THE_FACTS_VARIABLE, theFactsAStartIsGiven, writeInstance } from '../tools/sandbox-common.mjs'

const key = 'b9'.repeat(32)
const starterKey = 'c4'.repeat(32)
const agent = 'synthetic-titled-worker'
/** A title of the made-up first run: no handle, no record id. */
const A_TITLE = 'A made-up piece of work on the stand-in office'
const legacyModel = Object.keys(THE_MODELS_START_VALUES)[0]!
const PATTERNS = thePatterns({ names: [], realName: null, handles: [agent] })
const THE_HANDLE = PATTERNS.find(pattern => pattern.id === 'P6')!
const A_RECORD_ID = PATTERNS.find(pattern => pattern.id === 'P10')!
/** Where the words are, for the patterns that ask: a title, which is no file and no comment. */
const IN_A_TITLE = { file: 'the title of a run', inAComment: () => false }

let root = ''
let dir = ''
let worktree = ''
let api = ''
let office: Server
let sequence = 0
/** The runs filed with the stand-in, by id, with the title and the data they were filed with. */
const runs = new Map<string, { title: unknown; reads: number; data?: Record<string, unknown> }>()
/** The runs the stand-in answers with no title. */
const untitled = new Set<string>()
const facts = () => ({
  instance: 'synthetic', template: 'synthetic', templateDir: join(root, 'template'),
  containerRow: 'synthetic-container', container: { name: 'synthetic-container', id: 'synthetic-container' },
  ref: 'main', from: worktree, workspace: 'default',
})

/** An id in the shape of the office's record ids, so the record-id pattern finds it wherever it is written. */
function aRecordShapedId(): string {
  for (;;) {
    const id = randomBytes(9).toString('base64url')
    if (A_RECORD_ID.find(id, IN_A_TITLE).length === 1) return id
  }
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mole-round-title-'))
  dir = join(root, 'synthetic')
  worktree = join(dir, 'worktrees', agent)
  mkdirSync(worktree, { recursive: true })
  writeRoundStartRules(dir, worktree)
  for (const folder of ['bin', 'home', 'tmp', 'repo', 'briefs']) mkdirSync(join(dir, folder), { recursive: true })
  for (const name of ['tools', 'src']) symlinkSync(join(process.cwd(), name), join(dir, 'repo', name))
  execFileSync('git', ['init', '-q', '-b', 'main', worktree])
  execFileSync('git', ['-C', worktree, '-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'synthetic'])
  mkdirSync(join(root, 'template'))
  writeFileSync(join(root, 'template', 'devcontainer.json'), '{}')
  writeFileSync(join(root, 'template', 'sandbox.json'), JSON.stringify({ template: 'synthetic' }))
  writeInstance(dir, facts())
  writeFileSync(join(dir, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
  // THE CLAUDE CODE STAND-IN reads its brief and exits, having run no model.
  writeFileSync(join(dir, 'bin', 'claude'), `#!${process.execPath}\nrequire('fs').readFileSync(0)\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)))\n`, { mode: 0o755 })
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ containers: {
    'synthetic-container': { Id: 'synthetic-container', State: { Running: true }, Mounts: [], Config: { Env: [
      `HOME=${join(dir, 'home')}`, `TMPDIR=${join(dir, 'tmp')}`, 'CLAUDE_CODE_OAUTH_TOKEN=synthetic-login-for-the-stand-in-only',
    ] } },
  }, calls: [], bugs: {} }))
  office = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json')
    const id = req.url?.split('/').pop() ?? ''
    const run = runs.get(id)
    if (req.url === '/api/participants') {
      res.end(JSON.stringify({ agents: [{ id: agent, handle: agent, name: agent, record: 'synthetic-agent-record' }] }))
    } else if (req.method === 'GET' && req.url?.startsWith('/api/office/run-models/for/')) {
      const query = new URL(req.url, 'http://synthetic.invalid').searchParams
      const model = query.get('model') ?? 'synthetic-model', runtime = query.get('runtime') ?? 'claude-code'
      res.end(JSON.stringify({ model, effort: null, effortFrom: 'none', ...(!query.has('model') || model === legacyModel ? {} : {
        selection: { runtime, model, native: { model, provider: null, variant: null, effort: null }, casting: null },
      }) }))
    } else if (req.url === `/api/participants/agent/${agent}`) {
      res.end(JSON.stringify({ participant: { id: agent, handle: agent } }))
    } else if (req.url === '/api/kinds/session') {
      res.end(JSON.stringify({ kind: { fields: [{ key: 'adaptedTool' }] } }))
    } else if (req.method === 'POST' && req.url === '/api/records') {
      let body = ''
      for await (const chunk of req) body += chunk
      const filed = JSON.parse(body) as { title?: unknown; data?: Record<string, unknown> }
      const made = aRecordShapedId()
      runs.set(made, { title: filed.title, reads: 0, ...(filed.data === undefined ? {} : { data: filed.data }) })
      res.statusCode = 201
      res.end(JSON.stringify({ record: { id: made }, runKey: { key } }))
    } else if (req.method === 'POST' && req.url === `/api/agents/${agent}/hand-run`) {
      res.end('{"cut":null}')
    } else if (req.method === 'GET' && req.url === '/api/resources') {
      res.end('{"resources":[]}')
    } else if (req.url === '/api/toolset/uses') {
      res.statusCode = 201
      res.end('{}')
    } else if (req.method === 'GET' && req.url?.startsWith('/api/checks/')) {
      res.end(JSON.stringify(LEGACY_ROUND_CHAPTERS))
    } else if (req.method === 'PATCH' && run) {
      let body = ''
      for await (const chunk of req) body += chunk
      run.data = { ...(run.data ?? {}), ...JSON.parse(body).dataPatch }
      res.end(JSON.stringify({ record: { kind: 'session', data: run.data } }))
    } else if (req.method === 'GET' && run) {
      const priorReads = run.reads
      if (req.headers['x-mole-office-session'] === id) run.reads++
      res.end(JSON.stringify({ record: { kind: 'session', ...(untitled.has(id) ? {} : { title: run.title }), data: {
        ...run.data, state: run.data?.state ?? (priorReads < (run.data ? 2 : 1) ? 'running' : 'finished'), servingAgent: agent, runtime: 'claude-code',
        workingDirectory: worktree, cutFrom: 'main', model: run.data?.model ?? 'opus', served: { model: 'synthetic' },
        sandbox: { template: 'synthetic', container: 'synthetic-container', folder: dir },
      } } }))
    } else if (req.method === 'POST' && req.url === '/api/resources') {
      let body = ''
      for await (const chunk of req) body += chunk
      const pgid = JSON.parse(body).pidInContainer as number
      res.statusCode = 201
      res.end(JSON.stringify({ resource: { id: `synthetic-process-${++sequence}`, key: String(pgid), pgid } }))
    } else if (req.url === '/api/health') res.end('{"synthetic":true}')
    else {
      res.statusCode = 404
      res.end('{"error":"No synthetic route"}')
    }
  })
  await new Promise<void>(resolve => office.listen(0, '127.0.0.1', resolve))
  api = `http://127.0.0.1:${(office.address() as AddressInfo).port}`
  expect(thePortsATestKeepsOff()).not.toContain(Number(new URL(api).port))
})

afterAll(async () => {
  await new Promise<void>(resolve => office.close(() => resolve()))
  rmSync(root, { recursive: true, force: true })
})

/** The host launcher run as a process of its own, against the stand-in office only. */
async function theLauncher(verb: 'worker' | 'round', more: string[]): Promise<{ code: number | null; out: string; err: string }> {
  const brief = join(root, `${verb}-brief.md`)
  writeFileSync(brief, `# A made-up ${verb} brief\nDo the made-up work.\n`)
  const child = spawn(process.execPath, ['tools/sandbox.mjs', verb, 'synthetic',
    '--sandboxes', root, '--api', api, '--workspace', 'default',
    '--as', 'synthetic-starter', '--session', 'synthetic-starter-session',
    '--agent', agent, '--brief', brief, ...more, '--json',
  ], { env: { ...withoutInheritedEffort(), HOME: join(dir, 'home'), MOLE_AGENT_KEY: starterKey,
    MOLE_OFFICE_COMMIT_EMAIL: 'synthetic@example.invalid', FAKE_DOCKER_DIR: dir,
    PATH: join(dir, 'bin') + ':' + process.env['PATH'],
  } })
  let out = '', err = ''
  child.stdout.on('data', chunk => { out += String(chunk) })
  child.stderr.on('data', chunk => { err += String(chunk) })
  const code = await new Promise<number | null>(resolve => child.on('close', resolve))
  return { code, out, err }
}

/** A start of the launcher that went on, once its command and the helper's cleanup have ended. Its run id. */
async function aStartThatEnded(ran: { code: number | null; out: string; err: string }): Promise<string> {
  expect(ran.code, ran.err).toBe(0)
  const start = JSON.parse(ran.out.trim()) as { run: string }
  const finished = join(dir, 'logs', start.run, 'finish.log')
  await expect.poll(() => existsSync(finished) && readFileSync(finished, 'utf8').includes('with no report'), { timeout: 30_000 }).toBe(true)
  return start.run
}

/** A program of the checkout run against the stand-in office only, as the starter in the sandbox runs it, to its end. */
async function aToolRun(args: string[]): Promise<{ code: number | null; out: string; err: string }> {
  const child = spawn(process.execPath, args, { env: { ...withoutInheritedEffort(), [THE_FACTS_VARIABLE]: theFactsAStartIsGiven(facts()),
    HOME: join(dir, 'home'), TMPDIR: join(dir, 'tmp'), MOLE_AGENT_KEY: starterKey, CLAUDE_CODE_OAUTH_TOKEN: 'synthetic-login-for-the-stand-in-only',
    MOLE_OFFICE_COMMIT_EMAIL: 'synthetic@example.invalid', PATH: join(dir, 'bin') + ':' + process.env['PATH'],
  } })
  let out = '', err = ''
  child.stdout.on('data', chunk => { out += String(chunk) })
  child.stderr.on('data', chunk => { err += String(chunk) })
  const code = await new Promise<number | null>(resolve => child.on('close', resolve))
  return { code, out, err }
}

/** The title a run was filed with names no handle and no record id, and it is the words for a run given none. */
function itIsTheTitleOfARunGivenNone(run: string): void {
  const title = runs.get(run)?.title
  expect(title).toBe(A_RUN_GIVEN_NO_TITLE)
  expect(THE_HANDLE.find(String(title), IN_A_TITLE)).toEqual([])
  expect(A_RECORD_ID.find(String(title), IN_A_TITLE)).toEqual([])
}

/** A refusal as it was written down whole: the short line on stderr, and the detail file it names. */
function theRefusal(ran: { err: string }): string {
  const details = /Details: ([^\n]+)/.exec(ran.err)?.[1]
  return ran.err + (details !== undefined && existsSync(details) ? readFileSync(details, 'utf8') : '')
}

describe('a round given no --title takes the title of the run it continues', () => {
  it('files the round with the title of the run it continues, which names no handle and no record id', async () => {
    const first = await aStartThatEnded(await theLauncher('worker', ['--model', 'opus', '--title', A_TITLE]))
    expect(runs.get(first)?.title).toBe(A_TITLE)
    const round = await aStartThatEnded(await theLauncher('round', []))
    expect(round).not.toBe(first)
    const title = runs.get(round)?.title
    expect(title).toBe(A_TITLE)
    expect(THE_HANDLE.find(String(title), IN_A_TITLE)).toEqual([])
    expect(A_RECORD_ID.find(String(title), IN_A_TITLE)).toEqual([])
    // THE PATTERNS FIND WHAT THEY ARE FOR, so the two empty finds above are not empty for want of a pattern.
    expect(THE_HANDLE.find(`a title naming ${agent}`, IN_A_TITLE).map(hit => hit.words)).toEqual([agent])
    expect(A_RECORD_ID.find(`a title naming ${first}`, IN_A_TITLE).map(hit => hit.words)).toEqual([first])
  }, 90_000)

  it('refuses the round, saying to pass --title, when the run it continues has no title', async () => {
    const first = await aStartThatEnded(await theLauncher('worker', ['--model', 'opus', '--title', A_TITLE]))
    untitled.add(first)
    const filed = runs.size
    const ran = await theLauncher('round', [])
    expect(ran.code, ran.err).not.toBe(0)
    expect(theRefusal(ran)).toContain(aRunWithNoTitleARoundCanTakeWords(first, agent))
    expect(runs.size, 'a run was filed for the refused round').toBe(filed)
  }, 90_000)
})

describe('a run filed with no --title is filed under words that name nobody', () => {
  it('3: the host launcher files a worker given no --title so', async () => {
    itIsTheTitleOfARunGivenNone(await aStartThatEnded(await theLauncher('worker', ['--model', 'opus'])))
  }, 90_000)

  it('4: the helper in a sandbox files a run it is given with no --title so', async () => {
    const brief = join(root, 'helper-brief.md')
    writeFileSync(brief, '# A made-up brief for the helper\nDo the made-up work.\n')
    const ran = await aToolRun(['tools/sandbox-start.mjs', '--in-background', '--instance', dir, '--cwd', worktree,
      '--as', 'synthetic-starter', '--session', 'synthetic-starter-session', '--workspace', 'default', '--api', api,
      '--agent', agent, '--runtime', 'claude-code', '--model', 'opus', '--worktree', worktree, '--cut-from', 'main', '--brief', brief,
      '--', join(dir, 'bin', 'claude'), '-p', '--model', 'opus'])
    expect(ran.code, ran.err).toBe(0)
    const start = ran.out.trim().split('\n').find(line => line.startsWith('{'))
    expect(start, ran.out + ran.err).toBeDefined()
    const run = String((JSON.parse(start!) as { run?: unknown }).run)
    const finished = join(dir, 'logs', run, 'finish.log')
    await expect.poll(() => existsSync(finished) && readFileSync(finished, 'utf8').includes('with no report'), { timeout: 30_000 }).toBe(true)
    itIsTheTitleOfARunGivenNone(run)
  }, 90_000)

  it('5: tools/register-a-run.mjs files a run given no --title so', async () => {
    const ran = await aToolRun(['tools/register-a-run.mjs', '--handle', agent, '--worktree', worktree, '--cut-from', 'main',
      '--runtime', 'claude-code', '--model', 'opus', '--as', 'synthetic-starter', '--session', 'synthetic-starter-session',
      '--workspace', 'default', '--api', api])
    expect(ran.code, ran.err).toBe(0)
    itIsTheTitleOfARunGivenNone(ran.out.split('\n')[0]!.trim())
  }, 30_000)
})
