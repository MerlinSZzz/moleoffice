// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN DOES NOT START OVER A TRACKED AGENTS.md IT WOULD CHANGE.
 *
 * `startOne` writes the generated rules into the run's folder before the model is reached
 * (`writeRulesInto`, src/worker/rules.ts). In a checkout that TRACKS `AGENTS.md`, that write leaves
 * the run's working tree holding a changed tracked file, and the run's seal then refuses it
 * (src/server/lib/sealed-tip.ts). This repository does not track `AGENTS.md`, so the fault shows
 * only in a checkout that does.
 *
 * Message sJlcSoK29PeV, item 3, decides the answer: before writing anything, when the checkout
 * tracks `AGENTS.md` and the generated text differs from it, refuse the start and write nothing.
 * When the tracked file already equals the generated text, start as today. A folder that is not in
 * a git checkout, or one that does not track the file, starts as today.
 *
 * Nine cases, in this order: three that call `writeRulesInto` directly, as
 * tests/one-set-of-rules.test.ts does; cases A, B and C, which say when git is asked; the guard case;
 * the language case; and the start case. The start case runs the same made-up start as
 * tests/a-start-that-fails-early-ends-its-record.test.ts through a stubbed fetch, with the run's
 * folder a checkout that tracks a made-up `AGENTS.md`: the start is refused with the sentence, the
 * run's record is closed as "crashed" with that sentence as `doing`, and the tracked file's bytes are
 * unchanged.
 *
 * GIT IS ASKED ONLY WHEN A .git IS IN THE RUN'S FOLDER OR IN A FOLDER ABOVE IT (message
 * 12vABSXL7-aM, answer 1). Cases A, B and C hold that:
 *   A. In a folder with no .git in it or in any folder above it, the file is written and git is not
 *      started. The case first checks that no .git is there, and fails with a sentence saying so if
 *      one is. It never skips.
 *   B. In a subfolder of a checkout that tracks a differing `AGENTS.md` at that subfolder's path, the
 *      start is refused and nothing is written. The .git is two folders up, and git finds the
 *      checkout from there, so the look goes up too.
 *   C. In a folder whose .git git refuses with "not a git repository", git is started and the start
 *      goes ahead. Two such folders are used: a .git file naming a folder that is gone, and an empty
 *      .git folder. This holds the exit-128 branch of `gitTracks`, which a plain temporary folder no
 *      longer reaches.
 * A and C see whether git was started through a stand-in program named `git`, first on PATH for the
 * one call. It writes a line into a file of the test's own, then runs the real git with the same
 * arguments, by the full path found before PATH was changed. PATH is put back, and the stand-in's
 * folder removed, in a `finally`. A's "no line" is read against C's "a line": C puts the same
 * stand-in on PATH the same way and sees its line, so in A no line means git was not started.
 * GIT_TRACE cannot show this. Measured with git 2.43 on 17 October 2026: when git stops with exit
 * 128 before it has found a repository, it writes no trace at all, and that is the path both cases
 * are about.
 *
 * The guard case asks the question in a checkout a sandboxed run could have armed. A run's folder is one
 * a sandboxed run can write, and its repository's config can name a program git then starts.
 * Measured with git 2.43 on 17 October 2026: a plain `git ls-files -z -- AGENTS.md` ran the
 * program core.fsmonitor named, and with a GIT_DIR inherited from the caller it answered for
 * another repository, so the tracked file read as untracked. So the question goes through the guard
 * of src/config/guarded-git.mjs, and this case holds that: the program leaves no marker, and the
 * answer is the folder's own with a GIT_DIR in the environment.
 *
 * The language case asks the question with LC_ALL=C (message g6vhmm6Dqobr, answer 4). `gitTracks`
 * reads git's English words "not a git repository", and git can print its words in the caller's
 * language. So `whatGuardedGitSays` starts git with LC_ALL=C, and this case holds that: while the
 * test's own LC_ALL names another language, a stand-in `git` writes down the LC_ALL it was started
 * with, and it reads C. Whether git's words change with the language was not measured: the machine
 * this was written on has only the C and POSIX locales and no translation of git.
 */

import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import type { TheSelectedChapters } from '../src/shared/chapter-edit.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

/** The sentence message sJlcSoK29PeV, item 3, gives, word for word. */
const THE_SENTENCE =
  'This checkout tracks AGENTS.md, and starting the run would write over it, so its seal would later ' +
  'refuse the changed file. Stop tracking the generated AGENTS.md (git rm --cached AGENTS.md, then ' +
  'add it to .gitignore) and start again.'

/** A made-up `AGENTS.md` whose bytes are not the generated text. */
const MADE_UP_AGENTS = 'A made-up AGENTS.md this test wrote, and not the generated rules.\n'

/** A temporary folder of this test's own, with the files it is given written into it. */
function aMadeUpFolder(files: Record<string, string> = {}): string {
  const folder = mkdtempSync(join(tmpdir(), 'mole-office-tracked-rules-'))
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, name)), { recursive: true })
    writeFileSync(join(folder, name), text, 'utf8')
  }
  return folder
}

/** `git init` in one of this test's folders. No setting outside the command is written. */
function gitInit(folder: string): void {
  execFileSync('git', ['init'], { cwd: folder })
}

/** `git add` of the named paths in one of this test's folders. */
function gitAdd(folder: string, paths: string[]): void {
  execFileSync('git', ['add', '--', ...paths], { cwd: folder })
}

/**
 * A commit in one of this test's folders, with a made-up name and email given to THIS command only
 * (`git -c user.name=… -c user.email=… commit`), so the real repository's settings are never read
 * or written.
 */
function gitCommit(folder: string, allowEmpty = false): void {
  execFileSync(
    'git',
    [
      '-c', 'user.name=A made-up person',
      '-c', 'user.email=made-up@example.invalid',
      'commit', '-m', 'A made-up commit',
      ...(allowEmpty ? ['--allow-empty'] : []),
    ],
    { cwd: folder },
  )
}

/** What `git status --porcelain` prints in one of this test's folders. */
function gitStatus(folder: string): string {
  return execFileSync('git', ['status', '--porcelain'], { cwd: folder, encoding: 'utf8' })
}

/** Every `.git`, a folder or a file or anything else, in a folder and in each folder above it, up to the root. */
function theGitsInOrAbove(folder: string): string[] {
  const found: string[] = []
  for (let here = folder; ; here = dirname(here)) {
    if (lstatSync(join(here, '.git'), { throwIfNoEntry: false }) !== undefined) found.push(join(here, '.git'))
    if (dirname(here) === here) return found
  }
}

/** The real git, found on PATH before a stand-in is put in front of it. */
function theRealGit(): string {
  for (const dir of (process.env['PATH'] ?? '').split(delimiter)) {
    if (dir !== '' && existsSync(join(dir, 'git'))) return join(dir, 'git')
  }
  throw new Error('No git is on PATH, so this case cannot start one.')
}

/** A stand-in's shell text: it writes one line into `record` each time it is started, then runs the real git. */
function aGitThatRecordsEachStart(record: string): string {
  return `printf 'started\\n' >> '${record}'\nexec '${theRealGit()}' "$@"\n`
}

/**
 * Runs `call` with a stand-in program named `git` first on PATH, in a new folder under `outside`,
 * and puts PATH back afterwards. `script` is the stand-in's shell text after its first line.
 */
function withAStandInGit<T>(outside: string, script: string, call: () => T): T {
  const bin = mkdtempSync(join(outside, 'stand-in-git-'))
  writeFileSync(join(bin, 'git'), `#!/bin/sh\n${script}`)
  chmodSync(join(bin, 'git'), 0o755)
  const path = process.env['PATH']
  process.env['PATH'] = path === undefined ? bin : `${bin}${delimiter}${path}`
  try {
    return call()
  } finally {
    if (path === undefined) delete process.env['PATH']
    else process.env['PATH'] = path
  }
}

let db: TestDb, app: FastifyInstance, scratch: string
let choice: TheSelectedChapters

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-tracked-rules-start-'))
  const person = {
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    'x-mole-office-workspace': 'default',
    ...thePersonsKeyHeader(),
  }
  const answered = await app.inject({ url: '/api/office-regulations/chapters', headers: person })
  expect(answered.statusCode, answered.body).toBe(200)
  choice = answered.json() as TheSelectedChapters
}, 60_000)

afterAll(async () => {
  await app.close()
  db.close()
  rmSync(scratch, { recursive: true, force: true })
})

it('refuses when the folder tracks an AGENTS.md that differs, and writes nothing', async () => {
  const { writeRulesInto } = await import('../src/worker/rules.ts')
  const folder = aMadeUpFolder({ 'AGENTS.md': MADE_UP_AGENTS })
  try {
    gitInit(folder)
    gitAdd(folder, ['AGENTS.md'])
    gitCommit(folder)
    const before = readFileSync(join(folder, 'AGENTS.md'), 'utf8')
    const wrote = writeRulesInto(folder, process.cwd(), 'AGENTS.md')
    expect(wrote.refused).toBe(true)
    expect(wrote.written).toBe(false)
    expect(wrote.because).toBe(THE_SENTENCE)
    expect(readFileSync(join(folder, 'AGENTS.md'), 'utf8')).toBe(before)
    expect(gitStatus(folder)).toBe('')
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})

it('starts when the tracked AGENTS.md already holds exactly the generated text', async () => {
  const { rulesTextFrom, writeRulesInto } = await import('../src/worker/rules.ts')
  const generated = rulesTextFrom(process.cwd())
  const folder = aMadeUpFolder({ 'AGENTS.md': generated })
  try {
    gitInit(folder)
    gitAdd(folder, ['AGENTS.md'])
    gitCommit(folder)
    const wrote = writeRulesInto(folder, process.cwd(), 'AGENTS.md')
    expect(wrote.refused).toBeUndefined()
    expect(wrote.written).toBe(true)
    expect(readFileSync(join(folder, 'AGENTS.md'), 'utf8')).toBe(generated)
    expect(gitStatus(folder)).toBe('')
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})

it('starts as today when the folder does not track the file, or is not a checkout', async () => {
  const { rulesTextFrom, writeRulesInto } = await import('../src/worker/rules.ts')
  const generated = rulesTextFrom(process.cwd())
  // A checkout that holds a made-up AGENTS.md but tracks nothing, and a folder in no checkout.
  const checkout = aMadeUpFolder({ 'AGENTS.md': MADE_UP_AGENTS })
  const plain = aMadeUpFolder({ 'AGENTS.md': MADE_UP_AGENTS })
  try {
    gitInit(checkout)
    gitCommit(checkout, true)
    for (const folder of [checkout, plain]) {
      const wrote = writeRulesInto(folder, process.cwd(), 'AGENTS.md')
      expect(wrote.refused, folder).toBeUndefined()
      expect(wrote.written, folder).toBe(true)
      expect(readFileSync(join(folder, 'AGENTS.md'), 'utf8'), folder).toBe(generated)
    }
  } finally {
    rmSync(checkout, { recursive: true, force: true })
    rmSync(plain, { recursive: true, force: true })
  }
})

it('A: writes the file and does not start git in a folder with no .git in it or above it', async () => {
  const { rulesTextFrom, writeRulesInto } = await import('../src/worker/rules.ts')
  const folder = aMadeUpFolder({ 'AGENTS.md': MADE_UP_AGENTS })
  const outside = aMadeUpFolder()
  const record = join(outside, 'git-was-started')
  try {
    expect(
      theGitsInOrAbove(folder),
      `A .git is in ${folder} or in a folder above it, so this case cannot show that git is not asked where there is none`,
    ).toEqual([])
    const wrote = withAStandInGit(outside, aGitThatRecordsEachStart(record), () => writeRulesInto(folder, process.cwd(), 'AGENTS.md'))
    expect(existsSync(record), 'git was started in a folder with no .git in it or above it').toBe(false)
    expect(wrote.refused).toBeUndefined()
    expect(wrote.written).toBe(true)
    expect(readFileSync(join(folder, 'AGENTS.md'), 'utf8')).toBe(rulesTextFrom(process.cwd()))
  } finally {
    rmSync(folder, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})

it('B: refuses in a subfolder of a checkout that tracks a differing AGENTS.md there, and writes nothing', async () => {
  const { writeRulesInto } = await import('../src/worker/rules.ts')
  const checkout = aMadeUpFolder({ 'a/b/AGENTS.md': MADE_UP_AGENTS })
  const subfolder = join(checkout, 'a', 'b')
  try {
    gitInit(checkout)
    gitAdd(checkout, ['a/b/AGENTS.md'])
    gitCommit(checkout)
    expect(theGitsInOrAbove(subfolder)).toContain(join(checkout, '.git'))
    expect(existsSync(join(subfolder, '.git')), 'the subfolder holds a .git of its own').toBe(false)
    const wrote = writeRulesInto(subfolder, process.cwd(), 'AGENTS.md')
    expect(wrote.refused).toBe(true)
    expect(wrote.written).toBe(false)
    expect(wrote.because).toBe(THE_SENTENCE)
    expect(readFileSync(join(subfolder, 'AGENTS.md'), 'utf8')).toBe(MADE_UP_AGENTS)
    expect(gitStatus(checkout)).toBe('')
  } finally {
    rmSync(checkout, { recursive: true, force: true })
  }
})

it('C: starts git in a folder whose .git git refuses with "not a git repository", and goes ahead', async () => {
  const { rulesTextFrom, writeRulesInto } = await import('../src/worker/rules.ts')
  const generated = rulesTextFrom(process.cwd())
  const outside = aMadeUpFolder()
  // Git 2.43 answers both with exit 128 and "not a git repository" (measured 17 October 2026).
  const aGoneFolder = aMadeUpFolder({ 'AGENTS.md': MADE_UP_AGENTS, '.git': `gitdir: ${join(outside, 'a-folder-that-is-gone')}\n` })
  const anEmptyGitFolder = aMadeUpFolder({ 'AGENTS.md': MADE_UP_AGENTS })
  mkdirSync(join(anEmptyGitFolder, '.git'))
  try {
    for (const folder of [aGoneFolder, anEmptyGitFolder]) {
      const record = join(outside, `git-was-started-in-${basename(folder)}`)
      const wrote = withAStandInGit(outside, aGitThatRecordsEachStart(record), () => writeRulesInto(folder, process.cwd(), 'AGENTS.md'))
      expect(existsSync(record), `git was not started in ${folder}, which holds a .git`).toBe(true)
      expect(readFileSync(record, 'utf8'), folder).toBe('started\n')
      expect(wrote.refused, folder).toBeUndefined()
      expect(wrote.written, folder).toBe(true)
      expect(readFileSync(join(folder, 'AGENTS.md'), 'utf8'), folder).toBe(generated)
    }
  } finally {
    rmSync(outside, { recursive: true, force: true })
    rmSync(aGoneFolder, { recursive: true, force: true })
    rmSync(anEmptyGitFolder, { recursive: true, force: true })
  }
})

it('asks git with the guard, so a program the checkout names does not run and an inherited GIT_DIR changes nothing', async () => {
  const { writeRulesInto } = await import('../src/worker/rules.ts')
  const folder = aMadeUpFolder({ 'AGENTS.md': MADE_UP_AGENTS })
  const outside = aMadeUpFolder()
  const marker = join(outside, 'the-fsmonitor-ran')
  const monitor = join(outside, 'made-up-fsmonitor.sh')
  const another = join(outside, 'another-checkout')
  try {
    gitInit(folder)
    gitAdd(folder, ['AGENTS.md'])
    gitCommit(folder)
    writeFileSync(monitor, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`)
    chmodSync(monitor, 0o755)
    // ARMED. From here on only the rules writer runs git in this folder.
    execFileSync('git', ['config', 'core.fsmonitor', monitor], { cwd: folder })
    const wrote = writeRulesInto(folder, process.cwd(), 'AGENTS.md')
    expect(existsSync(marker), 'the fsmonitor the checkout names ran').toBe(false)
    expect(wrote.refused).toBe(true)

    mkdirSync(another)
    gitInit(another)
    const inherited = process.env['GIT_DIR']
    process.env['GIT_DIR'] = join(another, '.git')
    let underAnotherGitDir: { refused?: boolean; written: boolean }
    try {
      underAnotherGitDir = writeRulesInto(folder, process.cwd(), 'AGENTS.md')
    } finally {
      if (inherited === undefined) delete process.env['GIT_DIR']
      else process.env['GIT_DIR'] = inherited
    }
    expect(underAnotherGitDir.refused, 'a GIT_DIR in the environment changed the answer').toBe(true)
    expect(underAnotherGitDir.written).toBe(false)
    expect(readFileSync(join(folder, 'AGENTS.md'), 'utf8')).toBe(MADE_UP_AGENTS)
    expect(existsSync(marker), 'the fsmonitor the checkout names ran').toBe(false)
  } finally {
    rmSync(folder, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})

it('asks git with LC_ALL=C, so the words gitTracks reads are English whatever language the caller set', async () => {
  const { rulesTextFrom, writeRulesInto } = await import('../src/worker/rules.ts')
  // An empty .git folder, so that git is asked.
  const folder = aMadeUpFolder({ 'AGENTS.md': MADE_UP_AGENTS })
  mkdirSync(join(folder, '.git'))
  const outside = aMadeUpFolder()
  const record = join(outside, 'the-lc-all-git-was-started-with')
  const inherited = process.env['LC_ALL']
  try {
    process.env['LC_ALL'] = 'de_DE.UTF-8'
    // The stand-in writes down its LC_ALL and answers as `git ls-files` does where nothing is tracked.
    const wrote = withAStandInGit(outside, `printf '%s' "\${LC_ALL-unset}" > '${record}'\nexit 0\n`, () =>
      writeRulesInto(folder, process.cwd(), 'AGENTS.md'),
    )
    expect(readFileSync(record, 'utf8'), 'the LC_ALL git was started with').toBe('C')
    expect(wrote.refused).toBeUndefined()
    expect(wrote.written).toBe(true)
    expect(readFileSync(join(folder, 'AGENTS.md'), 'utf8')).toBe(rulesTextFrom(process.cwd()))
  } finally {
    if (inherited === undefined) delete process.env['LC_ALL']
    else process.env['LC_ALL'] = inherited
    rmSync(folder, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})

const MADE_UP_SESSION = 'made-up-tracked-rules-run'

/** The made-up message the start case starts a run from. */
function theWaitingMessage(): unknown {
  return {
    messageId: 'made-up-tracked-rules-message',
    workspaceId: 'default',
    to: { kind: 'agent', id: 'made-up-tracked-rules-reader' },
    handle: 'made-up-tracked-rules-reader',
    runtime: 'codex',
    model: 'made-up-tracked-rules-model',
    body: 'A made-up message for a run whose rules file is tracked.',
    sentBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
    sentAt: '2026-10-16 05:00',
    resume: null,
    hops: 0,
  }
}

interface Asked {
  method: string
  path: string
  body: unknown
}

/**
 * The stub the start case starts its run through, as tests/a-start-that-fails-early-ends-its-record.test.ts
 * does. It records every request, answers the doors the start needs, and leaves the chapters door
 * to the caller.
 */
function theStub(asked: Asked[], order: string[], chapters: () => Response): (url: string, init?: RequestInit) => Promise<Response> {
  return async (url, init) => {
    const path = new URL(url).pathname
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null
    asked.push({ method, path, body })
    if (method === 'PATCH' && path === `/api/records/${MADE_UP_SESSION}`) {
      if ((body as { dataPatch?: { state?: string } } | null)?.dataPatch?.state === 'crashed') order.push('the record was closed')
      return new Response(JSON.stringify({ record: { id: MADE_UP_SESSION } }), { status: 200 })
    }
    if (method === 'POST' && path === '/api/records') {
      return new Response(JSON.stringify({ record: { id: MADE_UP_SESSION }, runKey: { key: 'made-up-tracked-rules-key' } }), { status: 201 })
    }
    if (path === '/api/brief') return new Response(JSON.stringify({ head: 'A made-up brief.' }), { status: 200 })
    if (path === '/api/office-regulations/chapters') return chapters()
    return new Response('Made-up unavailable door', { status: 503 })
  }
}

/** The one PATCH that closes the run's record, and not the start's earlier writes about itself. */
function theClose(asked: Asked[]): Asked[] {
  return asked.filter(
    (one) =>
      one.method === 'PATCH' &&
      one.path === `/api/records/${MADE_UP_SESSION}` &&
      (one.body as { dataPatch?: { state?: string } } | null)?.dataPatch?.state === 'crashed',
  )
}

it('startOne says the sentence whole and ends the record as crashed, changing nothing', async () => {
  const rules = await import('../src/worker/rules.ts')
  const { startOne } = await import('../src/worker/index.ts')
  // The run reads its rules from this folder and writes into the same folder, so the three sources
  // are copied there from this checkout. A made-up AGENTS.md is tracked there and differs.
  const folder = aMadeUpFolder()
  try {
    for (const file of ['CLAUDE.md', 'src/config/rules/USER.md', '.claude/skills/mole-office/SKILL.md']) {
      mkdirSync(dirname(join(folder, file)), { recursive: true })
      copyFileSync(join(process.cwd(), file), join(folder, file))
    }
    writeFileSync(join(folder, 'AGENTS.md'), MADE_UP_AGENTS, 'utf8')
    gitInit(folder)
    gitAdd(folder, ['AGENTS.md'])
    gitCommit(folder)
    const before = readFileSync(join(folder, 'AGENTS.md'), 'utf8')
    const asked: Asked[] = [], order: string[] = []
    // The refusal returns before the words on taking somebody to a page are read, so a broken
    // reader there proves the start never reached a tool: no made-up run is ever started.
    const leader = vi.spyOn(rules, 'howToLead').mockImplementation(() => {
      throw new Error('Made up: this test never starts a tool.')
    })
    vi.stubGlobal('fetch', theStub(asked, order, () => new Response(JSON.stringify(choice), { status: 200 })))
    try {
      const settings = {
        api: 'http://made-up-office.invalid', workspace: 'default', session: null, stopWithPid: null,
        checkout: folder, runs: 1, hops: 4, outputRoot: scratch, env: { PATH: '/usr/bin', MOLE_OFFICE_DB: db.file },
      }
      const result = await startOne(theWaitingMessage() as Parameters<typeof startOne>[0], settings as Parameters<typeof startOne>[1], [])
      order.push('startOne returned')
      expect(result.ok).toBe(false)
      const because = (result as { ok: false; because: string }).because
      expect(because).toBe(THE_SENTENCE)
      const closes = theClose(asked)
      expect(closes).toHaveLength(1)
      expect(closes[0]?.body).toEqual({ dataPatch: { state: 'crashed', doing: THE_SENTENCE } })
      expect(order).toEqual(['the record was closed', 'startOne returned'])
      expect(readFileSync(join(folder, 'AGENTS.md'), 'utf8')).toBe(before)
    } finally {
      leader.mockRestore()
      vi.unstubAllGlobals()
    }
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})
