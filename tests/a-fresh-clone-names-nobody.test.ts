// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FRESH CLONE NAMES NOBODY: the release gate's proof for the owner's identity and the defaults.
 *
 * The release gate ZF_yVrL0INUX: a fresh clone with no .env and no data/ installs, migrates and
 * serves, and ships no private-project corpus or sensitive environment information. Problem
 * 7Mf8v88TRSi6: a fresh office writes no built-in person, "with a fresh-clone test that no private
 * name appears". This follows a decision, and FLO-02, FLO-03 and FLO-14 of
 * another.
 *
 * WHAT IT DOES. It makes a fresh clone the way `git clone` would: every file git would hand over
 * (the tracked files, and new files not yet committed but not ignored), copied from this checkout
 * into a new folder with no .git, no .env and no data/. It adds the one page build a browser test
 * already makes, because dist/ is not in git and a fresh clone builds it first. It starts the server
 * there in production mode with a clean environment: none of the office's own variables, no
 * MOLE_OFFICE_OWNER_ID and no MOLE_OFFICE_OWNER_NAME, only the port it listens on. The database is the
 * default one, which does not exist yet. Then it reads what a newcomer and a newcomer's agent read
 * first, and looks in all of it for the owner of this repository: their id or name in any case, their
 * home folder, and the name of their own project.
 *
 * THE FIRST PAGE IS READ IN DEVELOPER MODE. The browser is this test's own and stores nothing, so the
 * page opens in the person's starting mode. A new office's owner starts in Developer mode.
 *
 * WHAT IT CANNOT HOLD YET, NAMED RATHER THAN WEAKENED. `THE_LATER_PIECES` below lists each answer
 * that still carries one of those words from a piece of work that is not this round's, with the
 * reason and the round's name for it. The list is exact: a word found anywhere else is red, and an
 * exception that no longer finds its word is red too, so the list shrinks as the later pieces land.
 *
 * THE COPY (round W31). git hands over a link as the link it is, with the same target, so the copy does
 * too. Until round W31 the copy took every link with cpSync, which stops on a link to a folder ("Recursive
 * option not enabled, cannot copy a directory"), so one such link left untracked in the checkout stopped
 * the whole test. The last case makes an invented checkout with such a link and copies it.
 * MUTATION: cloneInto copies a link with cpSync again: red, the last case.
 *
 * THE PERSON'S KEY ON EVERY READ. A fresh office waits to be paired, and while it waits a request without the
 * person's key counts as the person only when the office finds the program that sent it, running as the same
 * user and in no container. On Linux it finds this test's own process. A Mac checkout outside the installed app
 * finds no program, on purpose, so there the same reads were refused and the test stopped before its first case.
 * So every read after the health check carries the person's key, as a header. The key is read from the key file
 * the clone's own server made beside its database, in this test's folder. The test makes no key, reads none from
 * anywhere else and never prints one. The case before last finds that the office refused none of the page's own
 * reads.
 * THE BROWSER IS THE PERSON IN ONE OF TWO WAYS, and the case before last names which. Where the office offers pairing
 * on this computer, as on Linux, the browser is paired by the press, with the two halves it gives, because a browser
 * holds no whole key: the old cookie is no key. Where the office offers none, as on a Mac checkout outside the
 * installed app, its press refuses every browser, because it finds no program that sent it. There the browser
 * carries the person's key in a header, once the press has answered 403. The context that carries it opens only the
 * clone's own address. tests/a-test-browser-carries-the-key-where-no-pairing-is-offered.test.ts shows both ways on
 * Linux.
 * MUTATION: the server reads carry no key: red under a probe that finds no program, at the first read that needs it.
 * MUTATION: the server reads carry a wrong key: red, at the first read.
 * MUTATION: the key file is worked out without the clone's database: red, the key is not read.
 * MUTATION: a made-up owner name planted in the clone, with a made-up list of the owner's content read: red, the case of the owner's names.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { keysPathFrom } from '../src/config/settings.mjs'
import { theBuiltPage, apiServerArguments, thePersonsKeyHeader } from './helpers.ts'
import { makeTheContextThePerson, type HowTheContextIsThePerson } from './a-paired-context.ts'
import { THE_AGENTS_VARIABLES } from './the-agents-variables.ts'
import { THE_REAL_NAME } from './the-owners-copyright-line.ts'
import { takenOutWithoutTheOwnersContent } from './the-owners-content-list.ts'
import { aWordPattern, OWNER_NAMES } from './neutral-names.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))

/**
 * The words a fresh clone must not say: the owner of this repository by name and by real name, the owner's home, the owner's
 * project. The real name is allowed in one line of LICENSE and NOTICE (tests/the-owners-copyright-line.ts), and
 * no answer read here is either file, so that allowance has nothing to excuse here. The names and the real name come
 * from the file of the owner's content, so they are looked for in a case of their own, which is taken out where no such
 * file was read and says why. The owner's home is a folder named by the owner's name, so that case finds it too.
 */
const PRIVATE = [/panelx/i] as const

/**
 * THE ANSWERS THAT STILL CARRY A PRIVATE WORD, EACH FROM A LATER PIECE. `answer` is the name the
 * test gives an answer below; `says` is a piece of text in it that carries a private word, taken out
 * before the answer is searched, or `every` to take out every mention of `word` in that one answer;
 * `why` is the piece of work that removes it. Nothing else may carry one.
 */
const THE_LATER_PIECES: readonly { answer: string; word: RegExp; says: string | 'every'; why: string }[] = [
  {
    answer: 'GET /api/kinds',
    word: /panelx/i,
    says: '"the project the record is filed in","example":"panelx"',
    why:
      "the RecordTarget shape's workspaceId example in src/shared/targets.ts is 'panelx'. src/shared/kinds.ts names " +
      'no private project now; that file is another piece.',
  },
]

/** Every answer that says one of `words` once the later pieces are taken out, with the text around it. */
function theAnswersSaying(words: readonly RegExp[]): string[] {
  const found: string[] = []
  for (const [answer, text] of answers) {
    for (const word of words) {
      const left = withoutTheLaterPieces(answer, text, word)
      if (!word.test(left)) continue
      const at = left.search(word)
      found.push(`${answer} says ${String(word)}: …${left.slice(Math.max(0, at - 120), at + 120)}…`)
    }
  }
  return found
}

/** An answer with the later pieces' text taken out, as the search below reads it. */
function withoutTheLaterPieces(answer: string, text: string, word: RegExp): string {
  let left = text
  for (const one of THE_LATER_PIECES) {
    if (one.answer !== answer || one.word.source !== word.source) continue
    left = one.says === 'every' ? left.replace(new RegExp(word.source, 'gi'), '') : left.split(one.says).join('')
  }
  return left
}

let root = ''
let server: ChildProcess | null = null
let api = ''
const said: string[] = []
const answers = new Map<string, string>()
/** The person's key as a header, read from the clone's own key file once its server answers. */
let theKey: Record<string, string> = {}
/** Each of the page's own reads the office refused, with its status. */
const refusedReads: string[] = []
/** How the browser was made the person, once it was. */
let theWay: HowTheContextIsThePerson | undefined

/** A port nothing is listening on, from the operating system. */
function aFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      probe.close(() => resolve(port))
    })
  })
}

/** Every file `git clone` would hand over, as the checkout holds it now, copied into `into`. */
function cloneInto(checkout: string, into: string): void {
  const listed = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: checkout,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  for (const file of listed.split('\0')) {
    if (file === '') continue
    const from = join(checkout, file)
    // A file git still lists but this checkout has deleted is not in a clone of it.
    if (!existsSync(from) || lstatSync(from).isDirectory()) continue
    mkdirSync(dirname(join(into, file)), { recursive: true })
    // A link is handed over as the link it is, as git hands it over, even when it leads to a folder.
    if (lstatSync(from).isSymbolicLink()) symlinkSync(readlinkSync(from), join(into, file))
    else cpSync(from, join(into, file))
  }
}

/** The environment the clone's server gets: this machine's basics and nothing of the office's. */
function aCleanEnvironment(port: number, home: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith('MOLE_OFFICE_') || name.startsWith('VITEST') || name.startsWith('PANELX_')) continue
    if ((THE_AGENTS_VARIABLES as readonly string[]).includes(name)) continue
    env[name] = value
  }
  return { ...env, HOME: home, NODE_ENV: 'production', MOLE_OFFICE_PORT: String(port), LOG_LEVEL: 'warn' }
}

async function read(path: string): Promise<string> {
  const reply = await fetch(`${api}${path}`, { headers: theKey })
  const text = await reply.text()
  expect(reply.status, `${path} answered ${String(reply.status)}: ${text.slice(0, 400)}`).toBe(200)
  return text
}

/** How the browser was made the person, in the words the case of the page's own reads says it. */
function theWayItWasMade(): string {
  if (theWay === undefined) return 'The browser was not made the person.'
  if (theWay.way === 'paired by the press') return 'The browser was paired by the press.'
  return `The browser carries the person's key. ${theWay.because}`
}

beforeAll(async () => {
  root = aTestDatabaseFolder('test-fresh-clone')
  const clone = join(root, 'clone')
  cloneInto(REPO, clone)
  expect(existsSync(join(clone, '.env')), 'the clone has no .env').toBe(false)
  expect(existsSync(join(clone, 'data')), 'the clone has no data folder').toBe(false)
  expect(existsSync(join(clone, '.git')), 'the clone is no git checkout, so nothing finds a .env elsewhere').toBe(false)
  symlinkSync(join(REPO, 'node_modules'), join(clone, 'node_modules'))
  cpSync(await theBuiltPage(), join(clone, 'dist', 'web'), { recursive: true })

  const port = await aFreePort()
  api = `http://127.0.0.1:${String(port)}`
  const home = join(root, 'home')
  mkdirSync(home)
  server = spawn(join(clone, 'node_modules', '.bin', 'tsx'), apiServerArguments(), {
    cwd: clone,
    env: aCleanEnvironment(port, home),
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout?.on('data', (chunk: Buffer) => said.push(chunk.toString()))
  server.stderr?.on('data', (chunk: Buffer) => said.push(chunk.toString()))
  const deadline = Date.now() + 120_000
  for (;;) {
    if (server.exitCode !== null) throw new Error(`The fresh clone's server stopped: ${said.join('')}`)
    try {
      const health = await fetch(`${api}/api/health`)
      if (health.status === 200) break
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) throw new Error(`The fresh clone's server did not answer in two minutes: ${said.join('')}`)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  // THE PERSON'S KEY, from the key file the clone's server made beside its database before it listened, and
  // from nowhere else: a key file worked out to be outside this test's folder is not read.
  const keyFile = keysPathFrom({ MOLE_OFFICE_DB: join(clone, 'data', 'mole-office.db') })
  if (!keyFile.startsWith(`${root}${sep}`)) {
    throw new Error(`The clone's key file was worked out as ${keyFile}, outside this test's folder, so it was not read.`)
  }
  theKey = thePersonsKeyHeader(keyFile)

  for (const path of ['/api/onboarding', '/api/office/owner', '/api/workspaces', '/api/participants', '/api/kinds', '/api', '/']) {
    answers.set(`GET ${path}`, await read(path))
  }

  // THE FIRST PAGE AS A BROWSER DRAWS IT, and every answer the page asked for on the way.
  const { chromium } = await import('playwright')
  const browser = await chromium.launch()
  try {
    // MADE THE PERSON. Where the office offers pairing, it is paired as the press pairs a browser: the cookie half in
    // its cookies and the header half in its pages' storage, so the page's own reads carry both. Where it offers none,
    // the press answered 403 and the context carries the person's key on every request. It opens only the clone's own
    // address.
    const asThePerson = await browser.newContext()
    theWay = await makeTheContextThePerson(asThePerson, api, theKey)
    const page = await asThePerson.newPage()
    const fetched = new Map<string, string>()
    page.on('response', (response) => {
      if (!response.url().startsWith(`${api}/api/`)) return
      const path = new URL(response.url()).pathname
      if (response.status() === 401 || response.status() === 403) refusedReads.push(`${response.request().method()} ${path}: ${String(response.status())}`)
      void response.text().then((text) => fetched.set(`the page asked GET ${path}`, `${fetched.get(`the page asked GET ${path}`) ?? ''}${text}`), () => {})
    })
    await page.goto(`${api}/`)
    await page.waitForFunction(() => (document.getElementById('root')?.childElementCount ?? 0) > 0, undefined, { timeout: 60_000 })
    // The page keeps a stream of events open, so it never goes quiet; three seconds is time for the
    // first page's own reads to answer after it has drawn.
    await page.waitForTimeout(3_000)
    answers.set('the first page as drawn', await page.locator('body').innerText())
    for (const [asked, text] of fetched) answers.set(asked, text)
  } finally {
    await browser.close()
  }
}, 300_000)

afterAll(async () => {
  // STOPPED BY THE GROUP ID RECORDED WHEN IT STARTED, and nothing else (chapter 2).
  if (server?.pid !== undefined && server.exitCode === null) {
    try {
      process.kill(-server.pid, 'SIGTERM')
    } catch {
      // Already gone.
    }
    const gone = Date.now() + 15_000
    while (server.exitCode === null && Date.now() < gone) await new Promise((resolve) => setTimeout(resolve, 100))
  }
  if (root !== '') rmSync(root, { recursive: true, force: true })
}, 60_000)

describe('a fresh clone on an empty database, with no .env', () => {
  it('owns an office whose owner is owner, with no name, and leads to the guide', () => {
    const owner = JSON.parse(answers.get('GET /api/office/owner') ?? '{}') as Record<string, unknown>
    expect(owner).toMatchObject({ id: 'owner', name: null, named: false, placeholder: 'default office owner name', guide: '#/welcome' })
    const onboarding = JSON.parse(answers.get('GET /api/onboarding') ?? '{}') as { owner?: { says?: string; guide?: string } }
    expect(Object.keys(onboarding)[0], 'the onboarding read starts with the owner').toBe('owner')
    expect(onboarding.owner?.says).toContain('This office has no owner yet.')
    expect(onboarding.owner?.guide).toBe(`${api}/#/welcome`)
  })

  it('opens the default database and the default project, and neither is the owner’s', () => {
    const workspaces = answers.get('GET /api/workspaces') ?? ''
    expect(workspaces).toContain('"default"')
    expect(said.join(''), 'the server named the database it opened').toContain(join(root, 'clone', 'data', 'mole-office.db'))
  })

  it('says the owner’s project nowhere in its first answers but the later pieces listed', () => {
    const found = theAnswersSaying(PRIVATE)
    expect(found, found.join('\n\n')).toEqual([])
  })

  it('says the owner’s names, the owner’s home and the owner’s real name nowhere in its first answers', (context) => {
    if (takenOutWithoutTheOwnersContent(context)) return
    if (THE_REAL_NAME === null) throw new Error("The file of the owner's content was read, and it gave no real name.")
    if (OWNER_NAMES.length === 0) throw new Error("The file of the owner's content was read, and it gave no names.")
    const found = theAnswersSaying([aWordPattern(OWNER_NAMES), THE_REAL_NAME])
    expect(found, found.join('\n\n')).toEqual([])
  })

  it('every later piece listed still finds its word, so the list shrinks when one lands', () => {
    for (const one of THE_LATER_PIECES) {
      const text = answers.get(one.answer) ?? ''
      const still = one.says === 'every' ? one.word.test(text) : text.includes(one.says)
      expect(still, `${one.answer} no longer says ${one.says === 'every' ? String(one.word) : one.says}: take it off THE_LATER_PIECES`).toBe(true)
    }
  })

  it('refuses none of the page’s own reads, which carry the person’s key', () => {
    const asked = [...answers.keys()].filter((one) => one.startsWith('the page asked '))
    expect(asked.length, 'the page asked the office for nothing').toBeGreaterThan(0)
    expect(refusedReads, `${theWayItWasMade()}\n${refusedReads.join('\n')}`).toEqual([])
  })
})

describe('the copy a fresh clone is made from', () => {
  it('takes an untracked link to a folder, anywhere in the checkout, as the link it is, and does not stop on it', () => {
    // AN INVENTED CHECKOUT (round W31): a folder with a file in it, and in another folder a link to the
    // first that git does not track. git lists the link as one file, as it lists any link.
    const place = aTestDatabaseFolder('test-fresh-clone-link')
    try {
      const checkout = join(place, 'checkout')
      mkdirSync(join(checkout, 'a-folder'), { recursive: true })
      writeFileSync(join(checkout, 'a-folder', 'a-file.txt'), 'Invented words.\n')
      mkdirSync(join(checkout, 'notes'))
      symlinkSync(join('..', 'a-folder'), join(checkout, 'notes', 'a-link-to-a-folder'))
      execFileSync('git', ['init', '--quiet'], { cwd: checkout, stdio: 'pipe' })
      // Not called clone: the rules-file test reads one value for each name in this file, and clone
      // is the folder the server above starts in.
      const copy = join(place, 'copy')
      cloneInto(checkout, copy)
      expect(readlinkSync(join(copy, 'notes', 'a-link-to-a-folder'))).toBe(join('..', 'a-folder'))
      expect(readFileSync(join(copy, 'a-folder', 'a-file.txt'), 'utf8')).toBe('Invented words.\n')
    } finally {
      removeThisTestFolder(place)
    }
  })
})
