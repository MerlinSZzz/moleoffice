// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN INSTALLED OFFICE WRITES THE GENERAL RULES FOR EACH TOOL, NEVER OVER A CLAUDE.md IT DID NOT WRITE,
 * AND A RUN THAT STARTS WITHOUT THEM SAYS SO.
 *
 * In an installed office the worker's checkout is the install's root, and a run works in that folder:
 * `REPO_ROOT` in src/config/settings.mjs is the bundle folder, and `workerSettingsFrom` and `startOne`
 * in src/worker/index.ts take the checkout and the working directory from it. The installer carries
 * src/config/rules/USER.md and the Mole Office skill there, and no CLAUDE.md or AGENTS.md, by one of the owner's
 * decisions. The rules writer read CLAUDE.md as its one source, so before this change a
 * Codex or OpenCode start in an installation crashed, and a Claude Code run there was given no general
 * rules and nothing said so.
 *
 * Answer b to question 8, resting on AusK_Wfu4cf5, sends the general rules to an installed office.
 * Message TxINgmO9H6gu, answer a to the supervisor's question on how to carry that out, says to write a
 * marked CLAUDE.md on three conditions, and this file holds each of them:
 *   1. a CLAUDE.md the office did not write is never written over. The office marks the CLAUDE.md it
 *      writes on its first line, with the time it wrote it, and rewrites only a file with that mark.
 *      Another CLAUDE.md is left untouched, and the run's start says the general rules were not
 *      written and why;
 *   2. a folder that cannot be written does not stop the run, whatever file the tool reads. A write of
 *      AGENTS.md refused with EACCES, EPERM or EROFS is an answer like the CLAUDE.md one: the run
 *      starts without the general rules, and its start says they are missing and why;
 *   3. the CLAUDE.md text is kept under the same size limit as AGENTS.md, and the chapter preview
 *      measures it too.
 *
 * THE INSTALLATION IS MADE HERE, in a temp folder: the skill folder, USER.md and
 * default-regulations.json copied from this checkout, and no CLAUDE.md, chapters.json or CODE.md. The
 * chapters are this checkout's, passed in as a run passes the ones the office answers.
 *
 * WHAT THE RUN-START CASES CANNOT PROVE is that a real tool reads the file. Each stands in for the
 * tool's own start with a program that does nothing, so `startOne` runs to its end and no tool is
 * started; a model call is not made in a test.
 */

import { accessSync, chmodSync, constants, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_DEVELOPER_HEADING, developmentMaterialIn } from '../scripts/no-development-material.mjs'
import type { TheSelectedChapters } from '../src/shared/chapter-edit.ts'
import { contentOfChapter, rulesFileWithChapter } from '../src/shared/chapter-check.ts'
import { clockStamp, momentOfAnInstant } from '../src/shared/time.ts'
import type { OfficeChapter } from '../src/shared/office-rules.ts'
import { promptFor, type Delivering } from '../src/worker/prompt.ts'
import type { RunHandle, RunRequest } from '../src/worker/runtimes/adapter.ts'
import { endGroup, stillRunning, type Started } from '../src/worker/runtimes/os.ts'
import {
  CODEX_PROJECT_DOC_MAX_BYTES,
  GENERATED_HEADER,
  RULES_BYTES_HEADROOM,
  SKILL_SECTIONS,
  SKILL_SOURCE,
  THE_OFFICES_MARK,
  USER_PART_SOURCE,
  chapterPointerBlock,
  chaptersFrom,
  rulesSize,
  rulesTextFrom,
  theMarkedRulesText,
  writeRulesInto,
} from '../src/worker/rules.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { A_TEST_THAT_STARTS_SOMETHING } from './how-long-a-test-may-take.ts'

const CHECKOUT = process.cwd()
const THE_DEFAULT_REGULATIONS = join('src', 'config', 'rules', 'default-regulations.json')

/** What a person might keep in a CLAUDE.md of their own, made up for this file. */
const A_PERSONS_OWN_FILE = '# Made-up notes a person keeps\n'

/** The answer a Claude Code run in a developer checkout has had since before this change. */
const THE_DEVELOPER_ANSWER = 'This tool reads CLAUDE.md, which is the source these rules come from and is in the checkout already.'

let chapters: OfficeChapter[]
const made: string[] = []

beforeAll(() => {
  chapters = chaptersFrom(CHECKOUT)
})

afterAll(() => {
  for (const folder of made) {
    // A case that failed before its own `finally` could leave a folder read-only; rmSync cannot empty one.
    chmodSync(folder, 0o755)
    rmSync(folder, { recursive: true, force: true })
  }
})

/** A temp folder this file removes when it is done. */
function aFolder(name: string): string {
  const folder = mkdtempSync(join(tmpdir(), `mole-office-installed-rules-${name}-`))
  made.push(folder)
  return folder
}

/** A folder of an installation's shape: what the installer carries for the rules, and nothing a developer checkout has besides. */
function anInstallation(): string {
  const folder = aFolder('install')
  cpSync(join(CHECKOUT, dirname(SKILL_SOURCE)), join(folder, dirname(SKILL_SOURCE)), { recursive: true })
  for (const file of [USER_PART_SOURCE, THE_DEFAULT_REGULATIONS]) {
    mkdirSync(dirname(join(folder, file)), { recursive: true })
    copyFileSync(join(CHECKOUT, file), join(folder, file))
  }
  return folder
}

/** A text after its first line, which is the part AGENTS.md and the office's CLAUDE.md share. */
const afterTheFirstLine = (text: string): string => text.slice(text.indexOf('\n') + 1)

describe('the installed text is built from the user part, the chapters and the skill', () => {
  it('holds the user part, each chapter pointer with the door to read the chapters, and each skill section, and is not the developer file', () => {
    const installation = anInstallation()
    const text = rulesTextFrom(installation, chapters)
    const user = readFileSync(join(CHECKOUT, USER_PART_SOURCE), 'utf8').trimEnd()
    expect(text).toContain(user)
    const block = chapterPointerBlock(chapters)
    const at = text.indexOf(block)
    expect(at, 'the installed text does not carry the chapter pointer lines').toBeGreaterThan(-1)
    // THE SENTENCE BEFORE THE POINTER LINES names the door the chapters are read through, because an
    // installation carries no CODE.md and no chapters.json to read them in.
    const paragraphBefore = text.slice(0, at).trimEnd().split('\n\n').at(-1) ?? ''
    expect(paragraphBefore).toContain('GET /api/office-regulations/chapters')
    for (const heading of SKILL_SECTIONS) expect(text).toContain(heading)
    expect(text.indexOf(user)).toBeLessThan(at)
    expect(at).toBeLessThan(text.indexOf('# Writing into Mole Office'))
    expect(text).not.toContain(THE_DEVELOPER_HEADING)
    // Not the developer file by the one test the installer uses to keep that file out.
    const held = aFolder('held')
    writeFileSync(join(held, 'AGENTS.md'), text)
    expect(developmentMaterialIn({ root: CHECKOUT, folder: held })).toEqual([])
    const size = rulesSize(text)
    expect(size.tooBig, size.sentence).toBe(false)
  })

  it('writes AGENTS.md from it', () => {
    const installation = anInstallation()
    const wrote = writeRulesInto(installation, installation, 'AGENTS.md', chapters)
    const text = rulesTextFrom(installation, chapters)
    expect(wrote.written).toBe(true)
    expect(readFileSync(join(installation, 'AGENTS.md'), 'utf8')).toBe(text)
    expect(wrote.bytes).toBe(Buffer.byteLength(text, 'utf8'))
    expect(wrote.size?.tooBig).toBe(false)
  })
})

describe('CLAUDE.md in an installation is written only where the office wrote it before', () => {
  it('writes CLAUDE.md where there is none, with the mark and the time on its first line and the same rules as AGENTS.md after it', () => {
    const installation = anInstallation()
    const before = Date.now()
    const wrote = writeRulesInto(installation, installation, 'CLAUDE.md', chapters)
    const after = Date.now()
    expect(wrote.written, wrote.because).toBe(true)
    expect(wrote.startsWithoutTheRules).not.toBe(true)
    const written = readFileSync(join(installation, 'CLAUDE.md'), 'utf8')
    const first = written.slice(0, written.indexOf('\n'))
    expect(typeof THE_OFFICES_MARK).toBe('string')
    expect(first.startsWith(THE_OFFICES_MARK)).toBe(true)
    const stamp = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}/.exec(first)?.[0] ?? ''
    const at = momentOfAnInstant(stamp)
    expect(at, `the first line does not carry a stamp with an offset: ${first}`).not.toBeNull()
    expect(at!).toBeGreaterThanOrEqual(before - 1)
    expect(at!).toBeLessThanOrEqual(after + 1)
    expect(afterTheFirstLine(written)).toBe(afterTheFirstLine(rulesTextFrom(installation, chapters)))
    expect(wrote.bytes).toBe(Buffer.byteLength(written, 'utf8'))
    expect(wrote.size?.tooBig, wrote.size?.sentence).toBe(false)
  })

  it('writes over a CLAUDE.md that carries the mark, older words and all', () => {
    const installation = anInstallation()
    const path = join(installation, 'CLAUDE.md')
    writeFileSync(path, `${String(THE_OFFICES_MARK)}2026-01-01T00:00:00.000Z from words nobody reads now. -->\n\nAn older made-up rule.\n`)
    const wrote = writeRulesInto(installation, installation, 'CLAUDE.md', chapters)
    expect(wrote.written, wrote.because).toBe(true)
    const written = readFileSync(path, 'utf8')
    expect(written).not.toContain('An older made-up rule.')
    expect(written.startsWith(String(THE_OFFICES_MARK))).toBe(true)
    expect(written).not.toContain('2026-01-01T00:00:00.000Z')
    expect(afterTheFirstLine(written)).toBe(afterTheFirstLine(rulesTextFrom(installation, chapters)))
  })

  it('leaves another CLAUDE.md untouched, and says the run goes on without the general rules and why', () => {
    const installation = anInstallation()
    const path = join(installation, 'CLAUDE.md')
    writeFileSync(path, A_PERSONS_OWN_FILE)
    const wrote = writeRulesInto(installation, installation, 'CLAUDE.md', chapters)
    expect(readFileSync(path)).toEqual(Buffer.from(A_PERSONS_OWN_FILE, 'utf8'))
    expect(wrote.written).toBe(false)
    expect(wrote.because).toContain(path)
    expect(wrote.startsWithoutTheRules).toBe(true)
    // NOT A REFUSAL: the run still starts. A refusal closes the start (src/worker/index.ts).
    expect(wrote.refused).not.toBe(true)
  })

  it('does not stop the run where the folder cannot be written, and says why', (context) => {
    const installation = anInstallation()
    chmodSync(installation, 0o555)
    try {
      let writable = true
      try {
        accessSync(installation, constants.W_OK)
      } catch {
        writable = false
      }
      if (writable) {
        // AS ROOT, A FOLDER WITH MODE 0o555 CAN STILL BE WRITTEN, so this case would prove nothing.
        console.warn('This process can write a folder with mode 0o555, as root can, so the case for a folder that cannot be written is skipped.')
        context.skip('This process can write a folder with mode 0o555, as root can, so a folder that cannot be written cannot be made here.')
        return
      }
      let wrote: ReturnType<typeof writeRulesInto> | undefined
      expect(() => { wrote = writeRulesInto(installation, installation, 'CLAUDE.md', chapters) }).not.toThrow()
      expect(wrote?.written).toBe(false)
      expect(wrote?.because).toMatch(/EACCES|EPERM|EROFS/)
      expect(wrote?.because).toContain(installation)
      expect(wrote?.startsWithoutTheRules).toBe(true)
      expect(existsSync(join(installation, 'CLAUDE.md'))).toBe(false)
    } finally {
      chmodSync(installation, 0o755)
    }
  })
})

describe("the office's mark carries the office's own time, with its offset", () => {
  it('writes the stamp on the clock the machine reads, with its offset and not in UTC', () => {
    // A ZONE WHOSE OFFSET IS NOT ZERO, so a machine set to UTC cannot hide the difference.
    const earlierZone = process.env.TZ
    process.env.TZ = 'Asia/Shanghai'
    try {
      const at = new Date(Date.UTC(2026, 9, 18, 5, 30, 0, 0))
      const written = theMarkedRulesText('The first line of the text.\n\nRules after that line.\n', at)
      const first = written.slice(0, written.indexOf('\n'))
      const stamp = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}/.exec(first)?.[0] ?? ''
      expect(stamp, `the first line does not carry a stamp with an offset: ${first}`).not.toBe('')
      expect(stamp).toBe(clockStamp(() => at).instant)
      expect(first).not.toContain(at.toISOString())
      expect(stamp.endsWith('+08:00')).toBe(true)
    } finally {
      if (earlierZone === undefined) delete process.env.TZ
      else process.env.TZ = earlierZone
    }
  })
})

describe('a developer checkout is read as it always was', () => {
  it("writes no CLAUDE.md for Claude Code, with the answer it gave before, and reads this repository's own CLAUDE.md as the developer file", () => {
    const run = aFolder('developer-run')
    expect(writeRulesInto(run, CHECKOUT, 'CLAUDE.md', chapters)).toEqual({
      file: 'CLAUDE.md',
      path: join(run, 'CLAUDE.md'),
      written: false,
      because: THE_DEVELOPER_ANSWER,
    })
    expect(existsSync(join(run, 'CLAUDE.md'))).toBe(false)
    // THIS REPOSITORY'S CLAUDE.md IS THE DEVELOPER FILE, by the test the installer uses to keep it out.
    const held = aFolder('developer-held')
    copyFileSync(join(CHECKOUT, 'CLAUDE.md'), join(held, 'CLAUDE.md'))
    expect(developmentMaterialIn({ root: CHECKOUT, folder: held })).toEqual([`CLAUDE.md (the developer CLAUDE.md or AGENTS.md, in ${held})`])
    // AND THE RULES GENERATOR READS IT AS THAT: its text is CLAUDE.md under the developer header.
    expect(rulesTextFrom(CHECKOUT, chapters).startsWith(`${GENERATED_HEADER}\n\n${THE_DEVELOPER_HEADING}\n`)).toBe(true)
  })
})

describe('a missing source is named, and the preview measures every text the office would write', () => {
  it('refuses to build the installed text without USER.md, and the preview says it was not measured, naming it', () => {
    const installation = anInstallation()
    rmSync(join(installation, USER_PART_SOURCE))
    expect(() => rulesTextFrom(installation, chapters)).toThrow(/src\/config\/rules\/USER\.md/)
    const first = chapters[0]!
    const size = rulesFileWithChapter(first.n, contentOfChapter(first), chapters, installation)
    expect(size).toEqual({ notMeasured: expect.stringContaining(USER_PART_SOURCE) })
  })

  it('answers the larger of the AGENTS.md and the CLAUDE.md sizes in an installation', () => {
    const installation = anInstallation()
    const first = chapters[0]!
    const size = rulesFileWithChapter(first.n, contentOfChapter(first), chapters, installation)
    const agents = Buffer.byteLength(rulesTextFrom(installation, chapters), 'utf8')
    const wrote = writeRulesInto(installation, installation, 'CLAUDE.md', chapters)
    const claude = Buffer.byteLength(readFileSync(join(installation, 'CLAUDE.md'), 'utf8'), 'utf8')
    expect(wrote.written, wrote.because).toBe(true)
    // THE TWO DIFFER, so the larger is a real choice and a preview that measured one text would be caught.
    expect(claude).not.toBe(agents)
    expect(size).toEqual({ bytes: Math.max(agents, claude), most: CODEX_PROJECT_DOC_MAX_BYTES - RULES_BYTES_HEADROOM })
  })
})

describe('a run that starts without the general rules is told so in its prompt', () => {
  const delivering: Delivering = {
    agent: 'made-up-reader',
    workspace: 'default',
    api: 'http://made-up-office.invalid',
    messageId: 'made-up-message',
    body: 'A made-up message the run is asked to answer.',
    from: `person ${THE_TEST_OFFICES_OWNER.id}`,
    carryingOn: false,
    howToLead: '## When somebody asks you to take them to a page\n\nMade-up words on leading.',
    knows: null,
    brief: 'A made-up brief.',
  }
  const because = 'A made-up reason the general rules were not written.'

  it('holds a paragraph saying so, with why and the door to the chapters, above the message', () => {
    const prompt = promptFor({ ...delivering, rulesNotWritten: because } as Delivering)
    expect(prompt).toContain('MOLE OFFICE DID NOT WRITE THE GENERAL RULES')
    expect(prompt).toContain(because)
    const paragraph = prompt.slice(prompt.indexOf('MOLE OFFICE DID NOT WRITE THE GENERAL RULES'), prompt.indexOf(delivering.body))
    expect(paragraph).toContain(because)
    expect(paragraph).toContain('GET /api/office-regulations/chapters')
    expect(prompt.indexOf('MOLE OFFICE DID NOT WRITE THE GENERAL RULES')).toBeLessThan(prompt.indexOf(delivering.body))
  })

  it('is the same prompt, byte for byte, when the field is not set', () => {
    expect(promptFor({ ...delivering, rulesNotWritten: null } as Delivering)).toBe(promptFor(delivering))
  })
})

describe('the run start in an installation', () => {
  const RUN = 'made-up-installed-run'
  let db: TestDb, app: FastifyInstance, choice: TheSelectedChapters

  beforeAll(async () => {
    db = await freshDb()
    app = (await apiApp()).app
    await app.ready()
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
  })

  /** The office, stood in for: it answers each door the start asks, and the chapters door with this office's answer. */
  function theOffice(): (url: string, init?: RequestInit) => Promise<Response> {
    return async (url, init) => {
      const path = new URL(url).pathname
      const method = init?.method ?? 'GET'
      if (method === 'POST' && path === '/api/records') return new Response(JSON.stringify({ record: { id: RUN }, runKey: { key: 'made-up-installed-run-key' } }), { status: 201 })
      if (path === `/api/records/${RUN}`) return new Response(JSON.stringify({ record: { id: RUN } }), { status: 200 })
      if (path === '/api/records/made-up-installed-message') return new Response(JSON.stringify({ record: { data: {} } }), { status: 200 })
      if (path === '/api/brief') return new Response(JSON.stringify({ head: 'A made-up brief.' }), { status: 200 })
      if (path === '/api/office-regulations/chapters') return new Response(JSON.stringify(choice), { status: 200 })
      if (method === 'POST' && path === '/api/resources') return new Response(JSON.stringify({ resource: { id: 'made-up-installed-resource' } }), { status: 201 })
      if (method === 'POST') return new Response(JSON.stringify({ ok: true }), { status: 200 })
      return new Response('Made-up unavailable door', { status: 503 })
    }
  }

  /** The message and the worker's settings, with the installation as the checkout, as an installed office has it. */
  function theStart(runtime: string, installation: string): [unknown, unknown] {
    return [
      {
        messageId: 'made-up-installed-message',
        workspaceId: 'default',
        to: { kind: 'agent', id: 'made-up-installed-reader' },
        handle: 'made-up-installed-reader',
        runtime,
        model: 'made-up-installed-model',
        body: 'A made-up message for a run in an installed office.',
        sentBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
        sentAt: '2026-10-18 05:00',
        resume: null,
        hops: 0,
      },
      {
        api: 'http://made-up-office.invalid',
        workspace: 'default',
        session: null,
        stopWithPid: null,
        checkout: installation,
        runs: 1,
        hops: 4,
        outputRoot: aFolder('output'),
        env: { PATH: '/usr/bin', MOLE_OFFICE_DB: db.file },
      },
    ]
  }

  /**
   * THE TOOL'S OWN START, STOOD IN FOR: the case keeps what the tool would have been started with, and this starts
   * a program that does nothing and ends at once, the way every tool is started. On Linux that start goes behind
   * the startup gate, as a tool's does, so the gate `startOne` releases is the one this start opened. The handle
   * carries the program's pid and group and a made-up start time, so the worker reads the run as already ended and
   * `startOne` goes on to its end. Each group goes on `groups`, for the case's `finally` to wait for.
   * The case hands in the group start from the copy of os.ts that `startOne` loaded after `freshDb()` reset the
   * modules, because the startup gate is kept in that copy and the copy imported at the top of this file has none.
   */
  const aHandleFor = (runtime: string, groups: Started[], startInItsOwnGroup: typeof import('../src/worker/runtimes/os.ts').startInItsOwnGroup): RunHandle => {
    const group = startInItsOwnGroup({
      command: process.execPath,
      args: ['-e', ''],
      cwd: aFolder('stand-in'),
      env: { PATH: '/usr/bin' },
      outputPath: join(aFolder('stand-in-output'), 'output'),
    })
    groups.push(group)
    return { runtime, pid: group.pid, pgid: group.pgid, startedAt: '2026-10-18 05:00', providerSession: null } as RunHandle
  }

  /**
   * WHETHER EVERY STAND-IN HAS ENDED. It waits up to 5 s for each pid on `groups`, stops a group still there with
   * SIGKILL, and answers a sentence saying so. It answers null when all have ended, or when none was started; then
   * the case's own expectations say why.
   */
  async function theStandInsEndedOrWereStopped(groups: Started[]): Promise<string | null> {
    const until = Date.now() + 5_000
    while (groups.some((group) => stillRunning(group.pid)) && Date.now() < until) await new Promise((done) => setTimeout(done, 25))
    const left = groups.filter((group) => stillRunning(group.pid))
    if (left.length === 0) return null
    for (const group of left) endGroup(group.pgid, 'SIGKILL')
    return `The stand-in for the tool's start had not ended after 5 s, so its process group was stopped with SIGKILL: ${left.map((group) => String(group.pgid)).join(', ')}.`
  }

  /**
   * WHETHER THIS PROCESS CAN STILL WRITE A FOLDER WITH MODE 0o555, as root can. When it can, a case
   * that needs a folder that cannot be written proves nothing, so it says so and skips itself.
   */
  function skippedBecauseTheFolderCanStillBeWritten(installation: string, context: { skip: (reason: string) => void }): boolean {
    try {
      accessSync(installation, constants.W_OK)
    } catch {
      return false
    }
    console.warn('This process can write a folder with mode 0o555, as root can, so the case for a folder that cannot be written is skipped.')
    context.skip('This process can write a folder with mode 0o555, as root can, so a folder that cannot be written cannot be made here.')
    return true
  }

  it('starts a Claude Code run in an installation holding another CLAUDE.md, leaves that file untouched, and puts the paragraph in its prompt', async () => {
    const { ClaudeCodeAdapter } = await import('../src/worker/runtimes/claude-code.ts')
    const { startOne } = await import('../src/worker/index.ts')
    const { startInItsOwnGroup } = await import('../src/worker/runtimes/os.ts')
    const installation = anInstallation()
    const path = join(installation, 'CLAUDE.md')
    writeFileSync(path, A_PERSONS_OWN_FILE)
    const started: RunRequest[] = [], said: string[] = [], groups: Started[] = []
    const start = vi.spyOn(ClaudeCodeAdapter.prototype, 'start').mockImplementation(async (run: RunRequest) => { started.push(run); return aHandleFor('claude-code', groups, startInItsOwnGroup) })
    const output = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => { said.push(String(chunk)); return true })
    vi.stubGlobal('fetch', theOffice())
    let theCaseFailedWith: Error | null = null
    try {
      const [waiting, settings] = theStart('claude-code', installation)
      const result = await startOne(waiting as Parameters<typeof startOne>[0], settings as Parameters<typeof startOne>[1], [])
      output.mockRestore()
      expect(result, JSON.stringify(result)).toMatchObject({ ok: true, started: { runtime: 'claude-code', session: RUN } })
      expect(readFileSync(path)).toEqual(Buffer.from(A_PERSONS_OWN_FILE, 'utf8'))
      expect(started).toHaveLength(1)
      expect(started[0]?.cwd).toBe(installation)
      const prompt = started[0]?.prompt ?? ''
      expect(prompt).toContain('MOLE OFFICE DID NOT WRITE THE GENERAL RULES')
      expect(prompt).toContain(path)
      expect(prompt.indexOf('MOLE OFFICE DID NOT WRITE THE GENERAL RULES')).toBeLessThan(prompt.indexOf('A made-up message for a run in an installed office.'))
      // AND THE WORKER'S OWN LOG SAYS IT, as it says a missing brief.
      expect(said.join('')).toContain(`made-up-installed-reader: `)
      expect(said.filter((line) => line.includes(path))).toHaveLength(1)
    } catch (err) {
      theCaseFailedWith = err instanceof Error ? err : new Error(String(err))
    } finally {
      // THE STAND-IN IS WAITED FOR WHETHER THE CASE PASSED OR NOT, before anything is restored.
      const theStandInsSay = await theStandInsEndedOrWereStopped(groups)
      output.mockRestore()
      start.mockRestore()
      vi.unstubAllGlobals()
      if (theStandInsSay !== null) throw new Error(theCaseFailedWith === null ? theStandInsSay : `${theCaseFailedWith.message}\nThe stand-in check failed as well: ${theStandInsSay}`)
    }
    if (theCaseFailedWith !== null) throw theCaseFailedWith
  }, A_TEST_THAT_STARTS_SOMETHING)

  it('starts a Codex run in an installation, with AGENTS.md written from the installed text', async () => {
    const { CodexAdapter } = await import('../src/worker/runtimes/codex.ts')
    const { startOne } = await import('../src/worker/index.ts')
    const { startInItsOwnGroup } = await import('../src/worker/runtimes/os.ts')
    const { chaptersSelectedForRun } = await import('../src/worker/rules.ts')
    const installation = anInstallation()
    const started: RunRequest[] = [], groups: Started[] = []
    const start = vi.spyOn(CodexAdapter.prototype, 'start').mockImplementation(async (run: RunRequest) => { started.push(run); return aHandleFor('codex', groups, startInItsOwnGroup) })
    vi.stubGlobal('fetch', theOffice())
    let theCaseFailedWith: Error | null = null
    try {
      const [waiting, settings] = theStart('codex', installation)
      const result = await startOne(waiting as Parameters<typeof startOne>[0], settings as Parameters<typeof startOne>[1], [])
      expect(result, JSON.stringify(result)).toMatchObject({ ok: true, started: { runtime: 'codex', session: RUN } })
      expect(started).toHaveLength(1)
      expect(readFileSync(join(installation, 'AGENTS.md'), 'utf8')).toBe(rulesTextFrom(installation, chaptersSelectedForRun(choice, installation)))
      expect(started[0]?.prompt).not.toContain('MOLE OFFICE DID NOT WRITE THE GENERAL RULES')
    } catch (err) {
      theCaseFailedWith = err instanceof Error ? err : new Error(String(err))
    } finally {
      // THE STAND-IN IS WAITED FOR WHETHER THE CASE PASSED OR NOT, before anything is restored.
      const theStandInsSay = await theStandInsEndedOrWereStopped(groups)
      start.mockRestore()
      vi.unstubAllGlobals()
      if (theStandInsSay !== null) throw new Error(theCaseFailedWith === null ? theStandInsSay : `${theCaseFailedWith.message}\nThe stand-in check failed as well: ${theStandInsSay}`)
    }
    if (theCaseFailedWith !== null) throw theCaseFailedWith
  }, A_TEST_THAT_STARTS_SOMETHING)

  it('starts a Codex run in an installation whose folder cannot be written, and says in its prompt that the general rules were not written and why', async (context) => {
    const { CodexAdapter } = await import('../src/worker/runtimes/codex.ts')
    const { startOne } = await import('../src/worker/index.ts')
    const { startInItsOwnGroup } = await import('../src/worker/runtimes/os.ts')
    const installation = anInstallation()
    const path = join(installation, 'AGENTS.md')
    chmodSync(installation, 0o555)
    const started: RunRequest[] = [], said: string[] = [], groups: Started[] = []
    const start = vi.spyOn(CodexAdapter.prototype, 'start').mockImplementation(async (run: RunRequest) => { started.push(run); return aHandleFor('codex', groups, startInItsOwnGroup) })
    const output = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => { said.push(String(chunk)); return true })
    vi.stubGlobal('fetch', theOffice())
    let theCaseFailedWith: Error | null = null
    try {
      if (skippedBecauseTheFolderCanStillBeWritten(installation, context)) return
      const [waiting, settings] = theStart('codex', installation)
      const result = await startOne(waiting as Parameters<typeof startOne>[0], settings as Parameters<typeof startOne>[1], [])
      output.mockRestore()
      expect(result, JSON.stringify(result)).toMatchObject({ ok: true, started: { runtime: 'codex', session: RUN } })
      expect(existsSync(path), 'the refused AGENTS.md write left a file behind').toBe(false)
      expect(started).toHaveLength(1)
      const prompt = started[0]?.prompt ?? ''
      const paragraph = prompt.slice(prompt.indexOf('MOLE OFFICE DID NOT WRITE THE GENERAL RULES'), prompt.indexOf('A made-up message for a run in an installed office.'))
      expect(paragraph).toContain('MOLE OFFICE DID NOT WRITE THE GENERAL RULES')
      expect(paragraph).toContain(path)
      expect(paragraph).toMatch(/EACCES|EPERM|EROFS/)
      expect(said.join('')).toContain(`made-up-installed-reader: `)
      expect(said.filter((line) => line.includes(path))).toHaveLength(1)
    } catch (err) {
      theCaseFailedWith = err instanceof Error ? err : new Error(String(err))
    } finally {
      // THE STAND-IN IS WAITED FOR WHETHER THE CASE PASSED OR NOT, before anything is restored.
      const theStandInsSay = await theStandInsEndedOrWereStopped(groups)
      chmodSync(installation, 0o755)
      output.mockRestore()
      start.mockRestore()
      vi.unstubAllGlobals()
      if (theStandInsSay !== null) throw new Error(theCaseFailedWith === null ? theStandInsSay : `${theCaseFailedWith.message}\nThe stand-in check failed as well: ${theStandInsSay}`)
    }
    if (theCaseFailedWith !== null) throw theCaseFailedWith
  }, A_TEST_THAT_STARTS_SOMETHING)

  it('starts an OpenCode run in an installation whose folder cannot be written, and says in its prompt that the general rules were not written and why', async (context) => {
    const { OpenCodeAdapter } = await import('../src/worker/runtimes/opencode.ts')
    const { startOne } = await import('../src/worker/index.ts')
    const { startInItsOwnGroup } = await import('../src/worker/runtimes/os.ts')
    const installation = anInstallation()
    const path = join(installation, 'AGENTS.md')
    chmodSync(installation, 0o555)
    const started: RunRequest[] = [], said: string[] = [], groups: Started[] = []
    const start = vi.spyOn(OpenCodeAdapter.prototype, 'start').mockImplementation(async (run: RunRequest) => { started.push(run); return aHandleFor('opencode', groups, startInItsOwnGroup) })
    const output = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => { said.push(String(chunk)); return true })
    vi.stubGlobal('fetch', theOffice())
    let theCaseFailedWith: Error | null = null
    try {
      if (skippedBecauseTheFolderCanStillBeWritten(installation, context)) return
      const [waiting, settings] = theStart('opencode', installation)
      const result = await startOne(waiting as Parameters<typeof startOne>[0], settings as Parameters<typeof startOne>[1], [])
      output.mockRestore()
      expect(result, JSON.stringify(result)).toMatchObject({ ok: true, started: { runtime: 'opencode', session: RUN } })
      expect(existsSync(path), 'the refused AGENTS.md write left a file behind').toBe(false)
      expect(started).toHaveLength(1)
      const prompt = started[0]?.prompt ?? ''
      const paragraph = prompt.slice(prompt.indexOf('MOLE OFFICE DID NOT WRITE THE GENERAL RULES'), prompt.indexOf('A made-up message for a run in an installed office.'))
      expect(paragraph).toContain('MOLE OFFICE DID NOT WRITE THE GENERAL RULES')
      expect(paragraph).toContain(path)
      expect(paragraph).toMatch(/EACCES|EPERM|EROFS/)
      expect(said.join('')).toContain(`made-up-installed-reader: `)
      expect(said.filter((line) => line.includes(path))).toHaveLength(1)
    } catch (err) {
      theCaseFailedWith = err instanceof Error ? err : new Error(String(err))
    } finally {
      // THE STAND-IN IS WAITED FOR WHETHER THE CASE PASSED OR NOT, before anything is restored.
      const theStandInsSay = await theStandInsEndedOrWereStopped(groups)
      chmodSync(installation, 0o755)
      output.mockRestore()
      start.mockRestore()
      vi.unstubAllGlobals()
      if (theStandInsSay !== null) throw new Error(theCaseFailedWith === null ? theStandInsSay : `${theCaseFailedWith.message}\nThe stand-in check failed as well: ${theStandInsSay}`)
    }
    if (theCaseFailedWith !== null) throw theCaseFailedWith
  }, A_TEST_THAT_STARTS_SOMETHING)

  it('starts a Kimi run in an installation whose folder cannot be written, and says in its prompt that the general rules were not written and why', async (context) => {
    const { KimiAdapter } = await import('../src/worker/runtimes/kimi.ts')
    const { startOne } = await import('../src/worker/index.ts')
    const { startInItsOwnGroup } = await import('../src/worker/runtimes/os.ts')
    const installation = anInstallation()
    const path = join(installation, 'AGENTS.md')
    chmodSync(installation, 0o555)
    const started: RunRequest[] = [], said: string[] = [], groups: Started[] = []
    const start = vi.spyOn(KimiAdapter.prototype, 'start').mockImplementation((run: RunRequest) => { started.push(run); return aHandleFor('kimi', groups, startInItsOwnGroup) })
    const output = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => { said.push(String(chunk)); return true })
    vi.stubGlobal('fetch', theOffice())
    let theCaseFailedWith: Error | null = null
    try {
      if (skippedBecauseTheFolderCanStillBeWritten(installation, context)) return
      const [waiting, settings] = theStart('kimi', installation)
      const result = await startOne(waiting as Parameters<typeof startOne>[0], settings as Parameters<typeof startOne>[1], [])
      output.mockRestore()
      expect(result, JSON.stringify(result)).toMatchObject({ ok: true, started: { runtime: 'kimi', session: RUN } })
      expect(existsSync(path), 'the refused AGENTS.md write left a file behind').toBe(false)
      expect(started).toHaveLength(1)
      const prompt = started[0]?.prompt ?? ''
      const paragraph = prompt.slice(prompt.indexOf('MOLE OFFICE DID NOT WRITE THE GENERAL RULES'), prompt.indexOf('A made-up message for a run in an installed office.'))
      expect(paragraph).toContain('MOLE OFFICE DID NOT WRITE THE GENERAL RULES')
      expect(paragraph).toContain(path)
      expect(paragraph).toMatch(/EACCES|EPERM|EROFS/)
      expect(said.join('')).toContain(`made-up-installed-reader: `)
      expect(said.filter((line) => line.includes(path))).toHaveLength(1)
    } catch (err) {
      theCaseFailedWith = err instanceof Error ? err : new Error(String(err))
    } finally {
      // THE STAND-IN IS WAITED FOR WHETHER THE CASE PASSED OR NOT, before anything is restored.
      const theStandInsSay = await theStandInsEndedOrWereStopped(groups)
      chmodSync(installation, 0o755)
      output.mockRestore()
      start.mockRestore()
      vi.unstubAllGlobals()
      if (theStandInsSay !== null) throw new Error(theCaseFailedWith === null ? theStandInsSay : `${theCaseFailedWith.message}\nThe stand-in check failed as well: ${theStandInsSay}`)
    }
    if (theCaseFailedWith !== null) throw theCaseFailedWith
  }, A_TEST_THAT_STARTS_SOMETHING)
})
