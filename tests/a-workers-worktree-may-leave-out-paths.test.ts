// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORKER'S WORKTREE MAY LEAVE OUT PATHS ITS SANDBOX NAMES (REQUIREMENTS.md, "a worker's worktree may leave out paths
 * its sandbox names"). A template's sandbox.json may list, under aWorkersWorktreeLeavesOut, paths of the repository
 * that a worker's new worktree does not check out. The launcher reads the list where it reads the sandbox's other
 * settings, its secrets among them: from the template the host's facts name, at each start. The worktree is a sparse
 * checkout, git's own, set in that worktree alone. A supervisor's worktree is whole. A worker that needs a left-out
 * path names it with --with-path, which the message worker passes on from the worker's ask
 * (tests/a-supervisor-starts-its-own-worker.test.ts, section 16), and it gets the path, in a new worktree or in one an
 * earlier run left sparse. The start's words say the worktree's size after the start.
 *
 * THE CASES:
 *   1. The reader. No declaration is an empty list. A declaration that is not a list of plain paths, or that names a
 *      path twice, is refused in words naming the file and the key. A plain path is folder and file names joined by
 *      single slashes, with no pattern character, no "." or "..", and no slash at either end.
 *   2. The worktree maker, on a made-up repository. A worker's new worktree leaves out the declared paths, and its
 *      status is clean. A file whose name begins with a declared name is kept, and so is a folder of that name deeper
 *      down. A second worktree of the same repository, made with nothing left out as a supervisor's is, is whole and is
 *      no sparse checkout, and so is the sandbox's own checkout. The patterns are set in steps git 2.34 takes too (Ubuntu
 *      22.04's, which the GPU sandbox image has): set is given the patterns and no option, since git 2.34 keeps an option
 *      there as a pattern, and the file holds those patterns alone. A path named for the sparse worktree comes back. A
 *      repository no worktree left anything out of is as it was: no new setting, and the same answer as before.
 *   3. The launcher: the real tools/sandbox.mjs and tools/sandbox-start.mjs, the shared docker stand-in, an office
 *      stand-in on a loopback port, and a stand-in Claude Code that ends at once. A worker started in a sandbox that
 *      declares paths has them absent, and its start's words say its worktree's size, which the case measures again.
 *      A supervisor started in the same sandbox has them. A worker that names one gets it. A worker in a sandbox with
 *      no declaration is unchanged. exec --agent leaves them out of a new worktree too. Refused, with no run filed, no
 *      hand-run asked and no worktree made: a named path the sandbox does not leave out, and one that is not plain.
 *      Refused at once: --with-path on a round, and on exec without --agent.
 *
 * THE MUTATIONS, EACH TRIED ALONE AFTER A CONTROL RUN, each turning a case red:
 *   - a template with no declaration refused by the reader;
 *   - the reader taking a path with a pattern character, a path with "..", and a repeated path;
 *   - the worktree made whole with paths to leave out;
 *   - the sparse checkout in cone mode, which takes folder names and not these patterns;
 *   - the patterns set with --no-cone on set, which git 2.34 keeps as a pattern;
 *   - the sparse setting written to the repository's shared config, not the worktree's own;
 *   - a path named for a sparse worktree not brought back;
 *   - extensions.worktreeConfig set when nothing is left out;
 *   - a supervisor's worktree left sparse as a worker's is;
 *   - a named path left out all the same;
 *   - a named path the sandbox does not leave out taken;
 *   - the size left out of the worker's start words, and the size counted with the files left out;
 *   - exec --agent's new worktree made whole;
 *   - --with-path taken on a round and on exec without --agent.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'
import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { THE_PROVIDER_A_RUNTIME_RUNS } from '../src/config/runtime-native-providers.mjs'
import { FAKE_DOCKER } from './sandbox-stand-ins.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { theAgentsWorktree, writeInstance } from '../tools/sandbox-common.mjs'

/** A Claude Code model the launcher's own table knows, so a start needs no Casting row's native selection. */
const MODEL: string = (() => {
  const found = Object.keys(LAUNCHER_MODEL_COMPATIBILITY.aliases).find((name) =>
    !name.includes('/') && Object.hasOwn(LAUNCHER_MODEL_COMPATIBILITY.aliases, `${String(THE_PROVIDER_A_RUNTIME_RUNS['claude-code'])}/${name}`))
  if (found === undefined) throw new Error("The launcher's compatibility data holds no Claude Code model this file can start a run with.")
  return found
})()

/** The reader, asked for when a case needs it, so the other cases run without it. */
const theReader = () => import('../src/config/a-workers-left-out-paths.mjs')

/** The made-up repository's files. design/ and docs/ are what a sandbox leaves out. */
const FILES: Record<string, string> = {
  'design/a.txt': 'a'.repeat(200_000),
  'design/deep/b.txt': 'b'.repeat(50_000),
  'docs/c.txt': 'c'.repeat(100_000),
  'designer.txt': 'a file whose name begins with a left-out one\n',
  'lib/design/kept.txt': 'a folder of a left-out name, deeper down\n',
  'README.md': '# A made-up repository\n',
  'keep.txt': 'kept\n',
}
const LEFT_OUT = ['design', 'docs']
const leftOutFiles = (paths: string[]) => Object.keys(FILES).filter(file => paths.some(path => file.startsWith(`${path}/`)))
const keptFiles = (paths: string[]) => Object.keys(FILES).filter(file => !leftOutFiles(paths).includes(file))

let root = ''
const gitEnv = () => ({
  ...process.env, HOME: join(root, 'git-home'), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(root, 'no-config'),
  GIT_AUTHOR_NAME: 'A made-up repository', GIT_AUTHOR_EMAIL: 'repository@example.invalid',
  GIT_COMMITTER_NAME: 'A made-up repository', GIT_COMMITTER_EMAIL: 'repository@example.invalid',
})
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', env: gitEnv(), stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const gitAnswers = (cwd: string, ...args: string[]) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: gitEnv() })
/** git as the worktree maker takes it. */
const gitForTheMaker = (args: string[]) => spawnSync('git', args, { encoding: 'utf8', env: gitEnv() })

/** `<folder>/repo`, a new repository with FILES committed on main. */
function aRepository(folder: string) {
  const repo = join(folder, 'repo')
  mkdirSync(repo, { recursive: true })
  git(repo, 'init', '-q', '-b', 'main')
  for (const [file, text] of Object.entries(FILES)) {
    mkdirSync(dirname(join(repo, file)), { recursive: true })
    writeFileSync(join(repo, file), text)
  }
  git(repo, 'add', '-A')
  git(repo, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'a made-up commit')
  return repo
}

/** The files of a worktree, by the measure the start's words say: regular files, links not followed, .git not counted. */
function theFilesIn(dir: string) {
  let bytes = 0, files = 0
  const walk = (folder: string, top: boolean) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (top && entry.name === '.git') continue
      if (entry.isDirectory()) walk(join(folder, entry.name), false)
      else if (entry.isFile()) {
        bytes += lstatSync(join(folder, entry.name)).size
        files++
      }
    }
  }
  walk(dir, true)
  return { bytes, files }
}

/** Every file of `files` is in the worktree with its committed words, and no other of FILES is. */
function holdsExactly(dir: string, files: string[]) {
  for (const file of Object.keys(FILES)) {
    if (files.includes(file)) expect(readFileSync(join(dir, file), 'utf8'), file).toBe(FILES[file])
    else expect(existsSync(join(dir, file)), file).toBe(false)
  }
  for (const folder of LEFT_OUT) if (!files.some(file => file.startsWith(`${folder}/`))) expect(existsSync(join(dir, folder)), folder).toBe(false)
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'mole-left-out-paths-'))
  mkdirSync(join(root, 'git-home'))
})
afterAll(() => { rmSync(root, { recursive: true, force: true }) })

describe('1. the reader of what a worker\'s worktree leaves out', () => {
  const FILE = '/a/template/sandbox.json'

  it('takes no declaration as nothing left out, and a list of plain paths as it is', async () => {
    const { A_WORKERS_WORKTREE_LEAVES_OUT, thePathsAWorkerLeavesOut, whyNotAPlainPath } = await theReader()
    expect(A_WORKERS_WORKTREE_LEAVES_OUT).toBe('aWorkersWorktreeLeavesOut')
    expect(thePathsAWorkerLeavesOut({ template: 'synthetic' }, FILE)).toEqual([])
    expect(thePathsAWorkerLeavesOut({ template: 'synthetic', aWorkersWorktreeLeavesOut: [] }, FILE)).toEqual([])
    expect(thePathsAWorkerLeavesOut({ aWorkersWorktreeLeavesOut: ['deploy', 'design/big-files', 'a_b-c.d'] }, FILE)).toEqual(['deploy', 'design/big-files', 'a_b-c.d'])
    for (const plain of ['deploy', 'design/big-files', '.github', 'a/b/c']) expect(whyNotAPlainPath(plain), plain).toBeNull()
  })

  it('refuses a declaration that is not a list of plain paths, or names one twice, naming the file and the key', async () => {
    const { thePathsAWorkerLeavesOut, whyNotAPlainPath } = await theReader()
    for (const notPlain of ['', '/deploy', 'deploy/', 'a//b', '.', '..', 'a/../b', 'a/./b', 'de*ploy', 'de?ploy', '[d]eploy', '!deploy', 'de ploy', 'de\\ploy', '#deploy']) {
      expect(whyNotAPlainPath(notPlain), JSON.stringify(notPlain)).toEqual(expect.any(String))
      expect(() => thePathsAWorkerLeavesOut({ aWorkersWorktreeLeavesOut: ['docs', notPlain] }, FILE), JSON.stringify(notPlain))
        .toThrow(new RegExp(`${FILE}.*aWorkersWorktreeLeavesOut`))
    }
    for (const notAList of ['deploy', { deploy: true }, null, 7, ['deploy', 7]]) {
      expect(() => thePathsAWorkerLeavesOut({ aWorkersWorktreeLeavesOut: notAList }, FILE), JSON.stringify(notAList))
        .toThrow(new RegExp(`${FILE}.*aWorkersWorktreeLeavesOut`))
    }
    expect(() => thePathsAWorkerLeavesOut({ aWorkersWorktreeLeavesOut: ['deploy', 'docs', 'deploy'] }, FILE)).toThrow(/deploy.*twice/)
  })
})

describe('2. the worktree maker', () => {
  /** A sandbox folder of its own, with its repository. */
  function aSandboxFolder() {
    const folder = mkdtempSync(join(root, 'sandbox-'))
    return { folder, repo: aRepository(folder) }
  }

  it("makes a worker's new worktree without the paths it is given to leave out, and keeps the others whole", () => {
    const { folder, repo } = aSandboxFolder()
    const dir = join(folder, 'worktrees', 'a-worker')
    const made = theAgentsWorktree({ instanceDir: folder, from: repo, branch: 'a-worker', value: dir, cutFrom: 'main', leaveOut: LEFT_OUT, git: gitForTheMaker })
    expect(made).toEqual({
      dir, branchAfterRun: null,
      made: `--worktree ${dir} did not exist, so it was made: git worktree add from ${repo}, cut from main, on branch a-worker, as a sparse checkout that leaves out design, docs.`,
    })
    holdsExactly(dir, keptFiles(LEFT_OUT))
    expect(git(dir, 'status', '--porcelain')).toBe('')
    expect(git(dir, 'config', '--type=bool', '--get', 'core.sparseCheckout')).toBe('true')
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(git(repo, 'rev-parse', 'main'))

    const whole = join(folder, 'worktrees', 'a-supervisor')
    const second = theAgentsWorktree({ instanceDir: folder, from: repo, branch: 'a-supervisor', value: whole, cutFrom: 'main', git: gitForTheMaker })
    expect(second.made).toBe(`--worktree ${whole} did not exist, so it was made: git worktree add from ${repo}, cut from main, on branch a-supervisor.`)
    holdsExactly(whole, Object.keys(FILES))
    expect(git(whole, 'status', '--porcelain')).toBe('')
    expect(gitAnswers(whole, 'config', '--type=bool', '--get', 'core.sparseCheckout').status, 'the setting is not there').toBe(1)
    holdsExactly(repo, Object.keys(FILES))
    expect(gitAnswers(repo, 'config', '--type=bool', '--get', 'core.sparseCheckout').status, 'the setting is not there').toBe(1)
  })

  it('sets the patterns with no option git 2.34 would keep as a pattern, and stores those patterns alone', () => {
    const { folder, repo } = aSandboxFolder()
    const dir = join(folder, 'worktrees', 'a-worker')
    const asked: string[][] = []
    theAgentsWorktree({
      instanceDir: folder, from: repo, branch: 'a-worker', value: dir, cutFrom: 'main', leaveOut: LEFT_OUT,
      git: (args: string[]) => { asked.push(args); return gitForTheMaker(args) },
    })
    const sets = asked.filter(args => args.join(' ').includes('sparse-checkout set'))
    expect(sets.length, JSON.stringify(asked)).toBe(1)
    expect(sets[0]!.slice(sets[0]!.indexOf('set') + 1)).toEqual(['/*', '!/design', '!/docs'])
    expect(readFileSync(join(repo, '.git', 'worktrees', 'a-worker', 'info', 'sparse-checkout'), 'utf8')).toBe('/*\n!/design\n!/docs\n')
    holdsExactly(dir, keptFiles(LEFT_OUT))
  })

  it('brings back a path named for a worktree an earlier run left sparse, and leaves the rest out', () => {
    const { folder, repo } = aSandboxFolder()
    const dir = join(folder, 'worktrees', 'a-worker')
    theAgentsWorktree({ instanceDir: folder, from: repo, branch: 'a-worker', value: dir, cutFrom: 'main', leaveOut: LEFT_OUT, git: gitForTheMaker })
    const again = theAgentsWorktree({ instanceDir: folder, from: repo, branch: 'a-worker', value: dir, cutFrom: 'main', leaveOut: ['docs'], bringBack: ['design'], git: gitForTheMaker })
    expect(again).toEqual({ dir, made: null, branchAfterRun: null, brought: `--worktree ${dir} was there, as a sparse checkout, so design was checked out in it.` })
    holdsExactly(dir, keptFiles(['docs']))
    expect(git(dir, 'status', '--porcelain')).toBe('')

    const whole = join(folder, 'worktrees', 'a-whole-one')
    theAgentsWorktree({ instanceDir: folder, from: repo, branch: 'a-whole-one', value: whole, cutFrom: 'main', git: gitForTheMaker })
    const named = theAgentsWorktree({ instanceDir: folder, from: repo, branch: 'a-whole-one', value: whole, cutFrom: 'main', bringBack: ['design', 'docs'], git: gitForTheMaker })
    expect(named).toEqual({ dir: whole, made: null, branchAfterRun: null, brought: `--worktree ${whole} was there and leaves nothing out, so design, docs were in it already.` })
    expect(gitAnswers(whole, 'config', '--type=bool', '--get', 'core.sparseCheckout').status).toBe(1)
  })

  it('leaves a repository as it was when nothing is left out', () => {
    const { folder, repo } = aSandboxFolder()
    const dir = join(folder, 'worktrees', 'a-worker')
    const made = theAgentsWorktree({ instanceDir: folder, from: repo, branch: 'a-worker', value: dir, cutFrom: 'main', git: gitForTheMaker })
    expect(Object.keys(made).sort()).toEqual(['branchAfterRun', 'dir', 'made'])
    expect(made.made).toBe(`--worktree ${dir} did not exist, so it was made: git worktree add from ${repo}, cut from main, on branch a-worker.`)
    expect(gitAnswers(repo, 'config', '--get', 'extensions.worktreeConfig').status, 'the setting is not there').toBe(1)
    expect(existsSync(join(repo, '.git', 'worktrees', 'a-worker', 'config.worktree'))).toBe(false)
    expect(existsSync(join(repo, '.git', 'worktrees', 'a-worker', 'info', 'sparse-checkout'))).toBe(false)
    holdsExactly(dir, Object.keys(FILES))
    expect(theAgentsWorktree({ instanceDir: folder, from: repo, branch: 'a-worker', value: dir, cutFrom: 'main', git: gitForTheMaker })).toEqual({ dir, made: null, branchAfterRun: null })
  })
})

describe('3. the launcher', () => {
  const key = 'e5'.repeat(32)
  const starterKey = 'f6'.repeat(32)
  const AGENTS = {
    worker: 'synthetic-leaving-worker',
    supervisor: 'synthetic-leaving-supervisor',
    naming: 'synthetic-naming-worker',
    plain: 'synthetic-plain-worker',
    unknown: 'synthetic-unknown-path-worker',
    exec: 'synthetic-exec-worker',
  }
  const ROLES: Record<string, string> = Object.fromEntries(Object.values(AGENTS).map(agent => [agent, agent === AGENTS.supervisor ? 'supervisor' : 'worker']))
  let dir = ''
  let api = ''
  let office: Server
  let sequence = 0
  const runs = new Map<string, { reads: number; title?: string; data: Record<string, unknown> }>()
  /** What the office was asked to write: every run filed, and every hand-run asked, by the agent it was for. */
  const filedFor: string[] = []
  const handRunsFor: string[] = []
  const template = () => join(root, 'template')
  const facts = () => ({
    instance: 'synthetic', template: 'synthetic', templateDir: template(),
    containerRow: 'synthetic-container', container: { name: 'synthetic-container', id: 'synthetic-container' },
    ref: 'main', from: join(dir, 'repo'), workspace: 'default',
  })
  const declaring = (paths: string[] | null) => writeFileSync(join(template(), 'sandbox.json'), JSON.stringify({ template: 'synthetic', ...(paths === null ? {} : { aWorkersWorktreeLeavesOut: paths }) }))

  beforeAll(async () => {
    dir = join(root, 'synthetic')
    for (const folder of ['bin', 'home', 'tmp', 'briefs', 'worktrees']) mkdirSync(join(dir, folder), { recursive: true })
    aRepository(dir)
    // THE SANDBOX'S TOOLS AND SOURCE, links to this checkout's, and not committed: a worktree holds only FILES.
    symlinkSync(join(process.cwd(), 'tools'), join(dir, 'repo', 'tools'))
    symlinkSync(join(process.cwd(), 'src'), join(dir, 'repo', 'src'))
    mkdirSync(template())
    writeFileSync(join(template(), 'devcontainer.json'), '{}')
    declaring(LEFT_OUT)
    writeInstance(dir, facts())
    writeFileSync(join(dir, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
    writeFileSync(join(dir, 'bin', 'claude'), `#!${process.execPath}\nrequire('fs').readFileSync(0, 'utf8')\nprocess.stdout.write('{}')\n`)
    chmodSync(join(dir, 'bin', 'claude'), 0o755)
    office = createServer(async (req, res) => {
      res.setHeader('content-type', 'application/json')
      const url = req.url ?? ''
      const run = runs.get(url.split('/').pop() ?? '')
      let body = ''
      for await (const chunk of req) body += chunk
      const agentAsked = /^\/api\/participants\/agent\/([^/?]+)$/.exec(url)?.[1]
      const handRun = /^\/api\/agents\/([^/]+)\/hand-run$/.exec(url)?.[1]
      if (url === '/api/participants') {
        res.end(JSON.stringify({ agents: Object.values(AGENTS).map(agent => ({ id: agent, handle: agent, name: agent, record: `${agent}-record` })) }))
      } else if (req.method === 'GET' && url.startsWith('/api/office/run-models/for/')) {
        res.end(JSON.stringify({ model: MODEL, effort: null, effortFrom: 'none' }))
      } else if (agentAsked !== undefined) {
        const agent = decodeURIComponent(agentAsked)
        res.end(JSON.stringify({ participant: { id: agent, handle: agent, roleReadAs: ROLES[agent] } }))
      } else if (url === '/api/kinds/session') {
        res.end(JSON.stringify({ kind: { fields: [{ key: 'adaptedTool' }] } }))
      } else if (req.method === 'POST' && url === '/api/records') {
        const { title, data } = JSON.parse(body)
        const id = `synthetic-run-${++sequence}`
        runs.set(id, { reads: 0, title, data: data ?? {} })
        filedFor.push(String(data?.servingAgent))
        res.statusCode = 201
        res.end(JSON.stringify({ record: { id }, runKey: { key } }))
      } else if (req.method === 'POST' && handRun !== undefined) {
        handRunsFor.push(decodeURIComponent(handRun))
        res.end('{"cut":null}')
      } else if (req.method === 'GET' && url === '/api/resources') {
        res.end('{"resources":[]}')
      } else if (url === '/api/toolset/uses') {
        res.statusCode = 201
        res.end('{}')
      } else if (req.method === 'PATCH' && run) {
        run.data = { ...run.data, ...JSON.parse(body).dataPatch }
        res.end(JSON.stringify({ record: { kind: 'session', data: run.data } }))
      } else if (req.method === 'GET' && run) {
        const priorReads = run.reads
        if (req.headers['x-mole-office-session'] === url.split('/').pop()) run.reads++
        res.end(JSON.stringify({ record: { kind: 'session', title: run.title, data: {
          ...run.data, state: run.data['state'] ?? (priorReads < 2 ? 'running' : 'finished'), runtime: 'claude-code',
          cutFrom: 'main', model: MODEL, served: { model: 'synthetic' },
          sandbox: { template: 'synthetic', container: 'synthetic-container', folder: dir },
        } } }))
      } else if (req.method === 'POST' && url === '/api/resources') {
        const pgid = JSON.parse(body).pidInContainer as number
        res.statusCode = 201
        res.end(JSON.stringify({ resource: { id: 'synthetic-process', key: String(pgid), pgid } }))
      } else if (url === '/api/health') res.end('{"synthetic":true}')
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
  })

  /** The real launcher, through the docker stand-in: how it ended and what it wrote. */
  async function theLauncher(args: string[]) {
    writeFileSync(join(dir, 'state.json'), JSON.stringify({ containers: {
      'synthetic-container': { Id: 'synthetic-container', State: { Running: true }, Mounts: [], Config: { Env: [
        `HOME=${join(dir, 'home')}`, `TMPDIR=${join(dir, 'tmp')}`, 'CLAUDE_CODE_OAUTH_TOKEN=synthetic-login-for-the-stand-in-only',
      ] } },
    }, calls: [], bugs: {} }))
    const [verb, ...rest] = args
    const child = spawn(process.execPath, ['tools/sandbox.mjs', verb!, 'synthetic',
      '--sandboxes', root, '--api', api, '--workspace', 'default',
      '--as', 'synthetic-starter', '--session', 'synthetic-starter-session', ...rest,
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

  /**
   * A worker started by the launcher's worker command, after its run has finished: its worktree, its start's words, and
   * its launch details, where the launcher writes how it made the worktree.
   */
  async function aWorkerStarted(agent: string, more: string[] = []) {
    const brief = join(root, `${agent} brief.md`)
    writeFileSync(brief, 'A synthetic brief.\n')
    const { code, out, err } = await theLauncher(['worker', '--agent', agent, '--brief', brief, '--runtime', 'claude-code', '--model', MODEL, ...more])
    expect(code, err).toBe(0)
    const run = /^worker: run (\S+) of /m.exec(out)?.[1]
    expect(run, out).toBeDefined()
    await theRunHasFinished(run!)
    return { worktree: join(dir, 'worktrees', agent), out, details: theDetailsOf(run!) }
  }

  /** The launch details of a run the launcher filed. */
  const theDetailsOf = (run: string) => readFileSync(join(dir, 'logs', run, 'launch.txt'), 'utf8')

  /** Its last line: every run here ends with no commits and no report, and that line is written after its last request. */
  async function theRunHasFinished(run: string) {
    const finished = join(dir, 'logs', run, 'finish.log')
    await expect.poll(() => existsSync(finished) && readFileSync(finished, 'utf8').includes('with no report'), { timeout: 30_000 }).toBe(true)
  }

  /** The size a start's words say of a worktree, and the same measured again. */
  function theSizeSaid(words: string, worktree: string) {
    const said = new RegExp(`worktree ${worktree.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}, (\\d+) bytes in (\\d+) files after the start[;\\n]`).exec(words)
    expect(said, words).not.toBeNull()
    const measured = theFilesIn(worktree)
    expect({ bytes: Number(said![1]), files: Number(said![2]) }).toEqual(measured)
    return measured
  }

  it('starts a worker in a sandbox that declares paths without them, and says its worktree\'s size', async () => {
    const { worktree, out, details } = await aWorkerStarted(AGENTS.worker)
    holdsExactly(worktree, keptFiles(LEFT_OUT))
    expect(git(worktree, 'status', '--porcelain')).toBe('')
    expect(details).toContain(`on branch ${AGENTS.worker}, as a sparse checkout that leaves out design, docs.`)
    const size = theSizeSaid(out, worktree)
    const theKept = keptFiles(LEFT_OUT).reduce((sum, file) => sum + Buffer.byteLength(FILES[file]!), 0)
    expect(size.bytes, 'the size counts the files that were checked out').toBeGreaterThanOrEqual(theKept)
    expect(size.bytes, 'and not the files left out').toBeLessThan(theKept + 50_000)
  })

  it("starts a supervisor in the same sandbox with its worktree whole, and says so and its size", async () => {
    const { worktree, out, details } = await aWorkerStarted(AGENTS.supervisor)
    holdsExactly(worktree, Object.keys(FILES))
    expect(gitAnswers(worktree, 'config', '--type=bool', '--get', 'core.sparseCheckout').status).toBe(1)
    expect(details).toContain(`${AGENTS.supervisor} is a supervisor, so its worktree is whole`)
    const size = theSizeSaid(out, worktree)
    expect(size.bytes).toBeGreaterThanOrEqual(Object.values(FILES).reduce((sum, text) => sum + Buffer.byteLength(text), 0))
  })

  it('gives a worker that names a left-out path that path, and leaves the rest out', async () => {
    const { worktree, out, details } = await aWorkerStarted(AGENTS.naming, ['--with-path', 'design'])
    holdsExactly(worktree, keptFiles(['docs']))
    expect(git(worktree, 'status', '--porcelain')).toBe('')
    expect(details).toContain(`on branch ${AGENTS.naming}, as a sparse checkout that leaves out docs.`)
    theSizeSaid(out, worktree)
  })

  it('starts a worker in a sandbox with no declaration as before, with its worktree whole', async () => {
    declaring(null)
    onTestFinished(() => declaring(LEFT_OUT))
    const { worktree, out, details } = await aWorkerStarted(AGENTS.plain)
    holdsExactly(worktree, Object.keys(FILES))
    expect(gitAnswers(worktree, 'config', '--type=bool', '--get', 'core.sparseCheckout').status).toBe(1)
    expect(details).toContain(`on branch ${AGENTS.plain}.`)
    expect(details).not.toContain('sparse checkout')
    expect(details).not.toContain('its worktree is whole')
    theSizeSaid(out, worktree)
  })

  it('leaves the paths out of a new worktree exec --agent makes for a worker', async () => {
    const worktree = join(dir, 'worktrees', AGENTS.exec)
    const { code, out, err } = await theLauncher(['exec', '--agent', AGENTS.exec, '--runtime', 'claude-code', '--model', MODEL,
      '--worktree', worktree, '--with-path', 'docs', '--', 'claude', '-p', 'a synthetic prompt'])
    expect(code, err).toBe(0)
    const run = /^run (\S+) of /m.exec(out)?.[1]
    expect(run, out).toBeDefined()
    await theRunHasFinished(run!)
    holdsExactly(worktree, keptFiles(['design']))
    expect(theDetailsOf(run!)).toContain(`on branch ${AGENTS.exec}, as a sparse checkout that leaves out design.`)
    theSizeSaid(out, worktree)
  })

  it('refuses a named path the sandbox does not leave out, with nothing filed and no worktree made', async () => {
    const brief = join(root, 'unknown path brief.md')
    writeFileSync(brief, 'A synthetic brief.\n')
    const { code, out, err } = await theLauncher(['worker', '--agent', AGENTS.unknown, '--brief', brief, '--runtime', 'claude-code', '--model', MODEL, '--with-path', 'deploy'])
    expect(code, out).toBe(2)
    expect(err).toContain('--with-path deploy names a path this sandbox does not leave out of a worker\'s worktree')
    expect(err).toContain(`${join(template(), 'sandbox.json')} leaves out design, docs`)
    // THE WHOLE REFUSAL IS IN THE DETAILS IT NAMES; standard error keeps its first sentence.
    const details = /Details: (\S+)\n/.exec(err)?.[1]
    expect(details, err).toBeDefined()
    expect(readFileSync(details!, 'utf8')).toContain(`leaves out design, docs. Nothing was filed or started.\n`)
    expect(filedFor).not.toContain(AGENTS.unknown)
    expect(handRunsFor).not.toContain(AGENTS.unknown)
    expect(existsSync(join(dir, 'worktrees', AGENTS.unknown))).toBe(false)
    const plain = await theLauncher(['worker', '--agent', AGENTS.unknown, '--brief', brief, '--runtime', 'claude-code', '--model', MODEL, '--with-path', 'design/../docs'])
    expect(plain.code).toBe(2)
    expect(plain.err).toContain('--with-path design/../docs is not a plain path')
    expect(filedFor).not.toContain(AGENTS.unknown)
  })

  it('refuses --with-path at once on a round, and on exec without --agent', async () => {
    const round = await theLauncher(['round', '--agent', AGENTS.worker, '--brief', join(root, 'a round brief.md'), '--runtime', 'claude-code', '--with-path', 'design'])
    expect(round.code).toBe(2)
    expect(round.err).toContain("--with-path is only for worker and exec --agent, which make an agent's worktree. Nothing was done.")
    const plain = await theLauncher(['exec', '--with-path', 'design', '--', 'true'])
    expect(plain.code).toBe(2)
    expect(plain.err).toContain("--with-path is only for worker and exec --agent, which make an agent's worktree. Nothing was done.")
  })
})
