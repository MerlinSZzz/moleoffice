// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CODEX WORKER IS GIVEN THE IMAGES ITS ASK NAMES (wave 13n round DM). A supervisor's ask may name files of the
 * worker's worktree as `images`, and the message worker gives the launcher `--image <path>` for each
 * (tests/a-supervisor-starts-its-own-worker.test.ts, section 17). The launcher gives codex exec each one as
 * `-i <absolute path>`. codex-cli 0.159.2 does not refuse an image it cannot read: it tells the model in words and goes
 * on, and it reads a comma in one -i as two files. So each image is checked before the start, by one rule
 * (src/config/a-workers-images.mjs), in the ask door and in the launcher.
 *
 * THE CASES:
 *   1. The rule. A file of the worktree is one. Refused, in words: nothing there, which also says nothingThere, and
 *      so does a path through a file; a folder; a link, even to a file of the worktree; and a file whose real path is
 *      outside the worktree, through a linked folder.
 *   2. The launcher: the real tools/sandbox.mjs and tools/sandbox-start.mjs, the shared docker stand-in, an office
 *      stand-in on a loopback port, and a stand-in codex that writes down what it was given and ends at once. A codex
 *      worker given two images is given each as -i with its absolute path in its worktree, in the order named, before
 *      the model, and its launch details say so. An image under a folder the template leaves out of a worker's
 *      worktree is refused, and the refusal says to give that folder with --with-path; with it, the image is given.
 *      Refused once the worktree is made, with no run filed and nothing started: an image that is not there, a link
 *      and a folder. Refused before anything is asked: --image for a runtime other than codex, an image with a comma,
 *      and one named twice. Refused at once: --image on exec and on round.
 *
 * EACH SENTENCE A CASE CHECKS IS READ FROM THE MODULE THAT MAKES IT, called with the case's values:
 * src/config/a-workers-images.mjs for the rule's reasons and the launcher's words, and
 * src/config/a-workers-left-out-paths.mjs for a path that is not plain.
 *
 * THE MUTATIONS, EACH TRIED ALONE AFTER A CONTROL RUN, each turning a case red:
 *   - the rule taking a link, a folder, and a file outside the worktree;
 *   - the rule saying nothingThere for a folder;
 *   - the launcher giving codex no -i, the path relative to the worktree, and the images after the model;
 *   - the launcher checking no image after the worktree is made;
 *   - the --with-path hint left out of a refusal for an image that is not there;
 *   - --image taken for claude-code, an image with a comma taken, and --image taken on exec.
 */
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'
import {
  AN_IMAGE_IS_ONLY_FOR_WORKER, AN_IMAGE_IS_UNDER_THE_WORKTREE, IT_IS_A_LINK, IT_IS_NOT_A_FILE, NOTHING_IS_THERE,
  anImageIsOnlyForCodex, anImageNotInTheWorktree, codexExecIsGiven, itsRealPathIsOutside, whyNotAFileOfTheWorktree,
} from '../src/config/a-workers-images.mjs'
import { whyNotPlainPaths } from '../src/config/a-workers-left-out-paths.mjs'
import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { THE_PROVIDER_A_RUNTIME_RUNS } from '../src/config/runtime-native-providers.mjs'
import { FAKE_DOCKER } from './sandbox-stand-ins.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { writeInstance } from '../tools/sandbox-common.mjs'

/** A model the launcher's own table knows under a runtime's own provider, named with that provider. */
function aKnownModelOf(runtime: string): string {
  const provider = String(THE_PROVIDER_A_RUNTIME_RUNS[runtime])
  const found = Object.keys(LAUNCHER_MODEL_COMPATIBILITY.aliases).find((name) =>
    !name.includes('/') && name !== 'gpt-6-luna' && Object.hasOwn(LAUNCHER_MODEL_COMPATIBILITY.aliases, `${provider}/${name}`))
  if (found === undefined) throw new Error(`The launcher's compatibility data holds no ${runtime} model this file can start a run with.`)
  return `${provider}/${found}`
}
const CODEX_MODEL = aKnownModelOf('codex')
const CLAUDE_MODEL = aKnownModelOf('claude-code').split('/').at(-1)!

/** The made-up repository's files. design/ is what the sandbox leaves out of a worker's worktree. */
const FILES: Record<string, string> = {
  'pictures/the-page.png': 'a made-up picture of the page\n',
  'pictures/second.png': 'a second made-up picture\n',
  'design/drawing.png': 'a made-up drawing\n',
  'README.md': '# A made-up repository\n',
}

let root = ''
const gitEnv = () => ({
  ...process.env, HOME: join(root, 'git-home'), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(root, 'no-config'),
  GIT_AUTHOR_NAME: 'A made-up repository', GIT_AUTHOR_EMAIL: 'repository@example.invalid',
  GIT_COMMITTER_NAME: 'A made-up repository', GIT_COMMITTER_EMAIL: 'repository@example.invalid',
})
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', env: gitEnv(), stdio: ['ignore', 'pipe', 'pipe'] }).trim()

/** `<folder>/repo`, a new repository with FILES, a link and a folder committed on main. */
function aRepository(folder: string) {
  const repo = join(folder, 'repo')
  mkdirSync(repo, { recursive: true })
  git(repo, 'init', '-q', '-b', 'main')
  for (const [file, text] of Object.entries(FILES)) {
    mkdirSync(dirname(join(repo, file)), { recursive: true })
    writeFileSync(join(repo, file), text)
  }
  symlinkSync('the-page.png', join(repo, 'pictures', 'a-link.png'))
  git(repo, 'add', '-A')
  git(repo, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'a made-up commit')
  return repo
}

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'mole-codex-images-')))
  mkdirSync(join(root, 'git-home'))
})
afterAll(() => { rmSync(root, { recursive: true, force: true }) })

describe('1. the rule an image is checked by', () => {
  it('takes a file of the worktree, and refuses what is not one, in words', () => {
    const dir = join(root, 'a-worktree')
    mkdirSync(join(dir, 'pictures', 'a-folder'), { recursive: true })
    writeFileSync(join(dir, 'pictures', 'the-page.png'), 'a made-up picture\n')
    symlinkSync('the-page.png', join(dir, 'pictures', 'a-link.png'))
    const outside = join(root, 'outside-the-worktree')
    mkdirSync(outside)
    writeFileSync(join(outside, 'elsewhere.png'), 'a made-up picture outside\n')
    symlinkSync(outside, join(dir, 'linked'))
    expect(whyNotAFileOfTheWorktree(dir, 'pictures/the-page.png')).toBeNull()
    expect(whyNotAFileOfTheWorktree(dir, 'pictures/no-such.png')).toEqual({ why: NOTHING_IS_THERE, nothingThere: true })
    expect(whyNotAFileOfTheWorktree(dir, 'pictures/the-page.png/inside.png')).toEqual({ why: NOTHING_IS_THERE, nothingThere: true })
    expect(whyNotAFileOfTheWorktree(dir, 'pictures/a-folder')).toEqual({ why: IT_IS_NOT_A_FILE, nothingThere: false })
    expect(whyNotAFileOfTheWorktree(dir, 'pictures/a-link.png')).toEqual({ why: IT_IS_A_LINK, nothingThere: false })
    expect(whyNotAFileOfTheWorktree(dir, 'linked/elsewhere.png')).toEqual({
      why: itsRealPathIsOutside(join(outside, 'elsewhere.png')), nothingThere: false,
    })
  })
})

describe('2. the launcher', () => {
  const key = 'c7'.repeat(32)
  const starterKey = 'd8'.repeat(32)
  const AGENTS = {
    imaged: 'synthetic-imaged-worker',
    leftOut: 'synthetic-left-out-image-worker',
    missing: 'synthetic-missing-image-worker',
    other: 'synthetic-other-runtime-worker',
  }
  let dir = ''
  let api = ''
  let office: Server
  let sequence = 0
  const runs = new Map<string, { reads: number; title?: string; data: Record<string, unknown> }>()
  /** Every run the office was asked to file, by the agent it was for. */
  const filedFor: string[] = []
  const template = () => join(root, 'template')
  const facts = () => ({
    instance: 'synthetic', template: 'synthetic', templateDir: template(),
    containerRow: 'synthetic-container', container: { name: 'synthetic-container', id: 'synthetic-container' },
    ref: 'main', from: join(dir, 'repo'), workspace: 'default',
  })
  /** What the stand-in codex was given, one line for each start: its arguments after the program. */
  const theCodexArgv = (): string[][] => {
    const file = join(dir, 'codex-argv.jsonl')
    return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as string[]) : []
  }

  beforeAll(async () => {
    dir = join(root, 'synthetic')
    for (const folder of ['bin', 'home/.codex', 'tmp', 'briefs', 'worktrees']) mkdirSync(join(dir, folder), { recursive: true })
    aRepository(dir)
    // THE SANDBOX'S TOOLS AND SOURCE, links to this checkout's, and not committed: a worktree holds only what was.
    symlinkSync(join(process.cwd(), 'tools'), join(dir, 'repo', 'tools'))
    symlinkSync(join(process.cwd(), 'src'), join(dir, 'repo', 'src'))
    mkdirSync(template())
    writeFileSync(join(template(), 'devcontainer.json'), '{}')
    writeFileSync(join(template(), 'sandbox.json'), JSON.stringify({ template: 'synthetic', aWorkersWorktreeLeavesOut: ['design'] }))
    writeInstance(dir, facts())
    // A MADE-UP CODEX LOGIN: the launcher checks only that the file is there, and the stand-in reads nothing from it.
    writeFileSync(join(dir, 'home', '.codex', 'auth.json'), '{}\n')
    writeFileSync(join(dir, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
    writeFileSync(join(dir, 'bin', 'codex'),
      `#!${process.execPath}\nprocess.getBuiltinModule('node:fs').appendFileSync(${JSON.stringify(join(dir, 'codex-argv.jsonl'))}, JSON.stringify(process.argv.slice(2)) + '\\n')\n`)
    chmodSync(join(dir, 'bin', 'codex'), 0o755)
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
        res.end(JSON.stringify({ model: CODEX_MODEL, effort: null, effortFrom: 'none' }))
      } else if (agentAsked !== undefined) {
        const agent = decodeURIComponent(agentAsked)
        res.end(JSON.stringify({ participant: { id: agent, handle: agent, roleReadAs: 'worker' } }))
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
          ...run.data, state: run.data['state'] ?? (priorReads < 2 ? 'running' : 'finished'), runtime: 'codex',
          cutFrom: 'main', model: CODEX_MODEL, served: { model: 'synthetic' },
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
        `HOME=${join(dir, 'home')}`, `TMPDIR=${join(dir, 'tmp')}`,
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

  /** A brief file for an agent. */
  function aBrief(agent: string): string {
    const brief = join(root, `${agent} brief.md`)
    writeFileSync(brief, 'A synthetic brief.\n')
    return brief
  }
  const aCodexWorker = (agent: string, more: string[]) => theLauncher(['worker', '--agent', agent, '--brief', aBrief(agent), '--runtime', 'codex', '--model', CODEX_MODEL, ...more])

  /** The launch details of a run the launcher filed. */
  const theDetailsOf = (run: string) => readFileSync(join(dir, 'logs', run, 'launch.txt'), 'utf8')

  /** Its last line: every run here ends with no commits and no report, and that line is written after its last request. */
  async function theRunHasFinished(run: string) {
    const finished = join(dir, 'logs', run, 'finish.log')
    await expect.poll(() => existsSync(finished) && readFileSync(finished, 'utf8').includes('with no report'), { timeout: 30_000 }).toBe(true)
  }

  /** The -i pairs in what codex was given, and where they stand against its model. */
  function theImagesIn(argv: string[]): { given: string[]; beforeTheModel: boolean } {
    const given = argv.flatMap((word, at) => (word === '-i' ? [argv[at + 1]!] : []))
    return { given, beforeTheModel: argv.lastIndexOf('-i') < argv.indexOf('-m') }
  }

  it('gives a codex worker each image as -i with its absolute path in its worktree, in the order named, before the model', async () => {
    const images = ['pictures/second.png', 'pictures/the-page.png']
    const { code, out, err } = await aCodexWorker(AGENTS.imaged, images.flatMap((image) => ['--image', image]))
    expect(code, err).toBe(0)
    const run = /^worker: run (\S+) of /m.exec(out)?.[1]
    expect(run, out).toBeDefined()
    await theRunHasFinished(run!)
    const worktree = join(dir, 'worktrees', AGENTS.imaged)
    const argv = theCodexArgv().at(-1)!
    // THE HELPER ADDS ITS OWN OPTIONS around exec (tests/a-codex-sandbox-run-gets-the-office-tool.test.ts); the images follow --json.
    expect(argv.indexOf('exec'), JSON.stringify(argv)).toBeLessThan(argv.indexOf('--json'))
    expect(argv.indexOf('-i'), JSON.stringify(argv)).toBe(argv.indexOf('--json') + 1)
    expect(theImagesIn(argv)).toEqual({ given: images.map((image) => join(worktree, image)), beforeTheModel: true })
    expect(theDetailsOf(run!)).toContain(codexExecIsGiven(images, worktree))
  })

  it('refuses an image under a folder the template leaves out unless --with-path gives that folder, and then gives it', async () => {
    const before = theCodexArgv().length
    const worktree = join(dir, 'worktrees', AGENTS.leftOut)
    const left = await aCodexWorker(AGENTS.leftOut, ['--image', 'design/drawing.png'])
    expect(left.code, left.out).toBe(1)
    expect(left.err).toContain(anImageNotInTheWorktree('design/drawing.png', worktree, { why: NOTHING_IS_THERE, nothingThere: true }))
    expect(filedFor).not.toContain(AGENTS.leftOut)
    expect(theCodexArgv()).toHaveLength(before)
    const given = await aCodexWorker(AGENTS.leftOut, ['--image', 'design/drawing.png', '--with-path', 'design'])
    expect(given.code, given.err).toBe(0)
    const run = /^worker: run (\S+) of /m.exec(given.out)?.[1]
    await theRunHasFinished(run!)
    expect(theImagesIn(theCodexArgv().at(-1)!)).toEqual({ given: [join(worktree, 'design/drawing.png')], beforeTheModel: true })
  })

  it('refuses, once the worktree is made, an image that is not there, a link and a folder, with no run filed and nothing started', async () => {
    const before = theCodexArgv().length
    const worktree = join(dir, 'worktrees', AGENTS.missing)
    for (const [image, not] of [
      ['pictures/no-such.png', { why: NOTHING_IS_THERE, nothingThere: true }],
      ['pictures/a-link.png', { why: IT_IS_A_LINK, nothingThere: false }],
      ['pictures', { why: IT_IS_NOT_A_FILE, nothingThere: false }],
    ] as const) {
      const r = await aCodexWorker(AGENTS.missing, ['--image', 'pictures/the-page.png', '--image', image])
      expect(r.code, r.out).toBe(1)
      expect(r.err).toContain(anImageNotInTheWorktree(image, worktree, not))
      const details = /Details: (\S+)\n/.exec(r.err)?.[1]
      expect(details, r.err).toBeDefined()
      expect(readFileSync(details!, 'utf8')).toContain(`${AN_IMAGE_IS_UNDER_THE_WORKTREE}\n`)
    }
    expect(filedFor).not.toContain(AGENTS.missing)
    expect(theCodexArgv()).toHaveLength(before)
  })

  it('refuses before anything is asked: --image for another runtime, an image with a comma, and one named twice', async () => {
    const other = await theLauncher(['worker', '--agent', AGENTS.other, '--brief', aBrief(AGENTS.other), '--runtime', 'claude-code', '--model', CLAUDE_MODEL, '--image', 'pictures/the-page.png'])
    expect(other.code, other.out).toBe(2)
    expect(other.err).toContain(anImageIsOnlyForCodex('claude-code'))
    const comma = await aCodexWorker(AGENTS.other, ['--image', 'pictures/the-page.png,pictures/second.png'])
    expect(comma.code, comma.out).toBe(2)
    const notPlain = whyNotPlainPaths(['pictures/the-page.png,pictures/second.png'], '--image')
    expect(notPlain).not.toBeNull()
    expect(comma.err).toContain(notPlain!)
    const twice = await aCodexWorker(AGENTS.other, ['--image', 'pictures/the-page.png', '--image', 'pictures/the-page.png'])
    expect(twice.code, twice.out).toBe(2)
    const namedTwice = whyNotPlainPaths(['pictures/the-page.png', 'pictures/the-page.png'], '--image')
    expect(namedTwice).not.toBeNull()
    expect(twice.err).toContain(namedTwice!)
    expect(filedFor).not.toContain(AGENTS.other)
    expect(existsSync(join(dir, 'worktrees', AGENTS.other))).toBe(false)
  })

  it('refuses --image at once on exec and on round', async () => {
    const says = AN_IMAGE_IS_ONLY_FOR_WORKER
    const exec = await theLauncher(['exec', '--agent', AGENTS.other, '--runtime', 'codex', '--model', CODEX_MODEL, '--worktree', join(dir, 'worktrees', AGENTS.other), '--image', 'pictures/the-page.png', '--', 'codex', 'exec', 'a synthetic prompt'])
    expect(exec.code).toBe(2)
    expect(exec.err).toContain(says)
    const round = await theLauncher(['round', '--agent', AGENTS.imaged, '--brief', aBrief(AGENTS.imaged), '--runtime', 'codex', '--image', 'pictures/the-page.png'])
    expect(round.code).toBe(2)
    expect(round.err).toContain(says)
  })
})
