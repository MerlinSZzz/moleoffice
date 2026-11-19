// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CONVERSATION SYNC, SCRUBBED AND RESUMED. Wave 13s round 242, on a requirement row.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office, and a made-up home folder
 * under the test's own temporary directory for the two runtimes' conversation files. No file is written into the
 * owner's home, and the office is never asked to read one.
 *
 * THE CASES, in order:
 *  1. a transcript's secret and its absolute home and checkout paths are replaced, and a restored copy puts the mapped
 *     paths back; a token with no mapping is refused by its own name;
 *  2. the runtime mark is the run's stored runtime word, and no runtime reads "runtime not recorded";
 *  3. no sync happens before the person turns it on, and an agent may not turn it on;
 *  4. a workspace with a Claude Code run and a Codex run copies both, and a read names each conversation, its runtime
 *     and the run it came from;
 *  5. the same file on a second visit is not a new copy; a deleted file is said and its last copy stands;
 *  6. a missing file and an unknown runtime are said, not guessed;
 *  7. a file over the size limit and a workspace over the file-count limit are left out with a count and a sentence;
 *  8. a second machine's checkout path is mapped, the copy is installed where its runtime looks, and the command that
 *     resumes it is returned; a missing map entry names the token and writes nothing;
 *  9. a read takes a limit and refuses one over the declared maximum;
 * 10. the run door's own reply carries a line for each run after the writes, with the sha256 the copy now holds, and
 *     a changed file's line carries the new hash rather than the one before it;
 * 11. the line's `lastChangedAt` is the moment the copy last changed: it does not move when the file did not, and it
 *     advances with the hash when the file does;
 * 12. a provider id that would leave the runtime's folder is refused by the sync and by the restore, and neither one
 *     reads or writes a file outside that folder;
 * 13. every runtime whose conversation file this release reads is a runtime the declaration names.
 *
 * MUTATIONS, each run alone after a green control and restored after. The counts are in the round's report.
 *   1. the secret scrub replaced by a marker that leaves the value (`withSecretsMarked` skipped): case 1 goes red;
 *   2. the path map's longest-first order reversed: case 1's checkout path is only partly mapped and goes red;
 *   3. the runtime mark read from the source path instead of `data.runtime`: case 2 and case 4 go red;
 *   4. the opt-in guard dropped in `runTheConversationSync`: case 3 goes red;
 *   5. a deleted file treated as a new empty copy: case 5 goes red;
 *   6. the size bound removed: case 7 goes red;
 *   7. the missing map entry replaced by the original path: case 8 goes red;
 *   8. the run door's lines built from the rows read before the loop: case 10 goes red;
 *   9. `theLines` reading `lastChangedAt` from the clock: case 11 goes red;
 *  10. the provider-id check returning its input: case 12 goes red;
 *  11. a key in `CONVERSATION_FILE_STORES` the declaration does not name: case 13 goes red.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { theTranscriptFolder } from '../src/config/claude-code-served.mjs'
import { THE_PROGRAM_A_RUNTIME_RUNS } from '../src/config/runtime-native-providers.mjs'
import {
  CONVERSATION_FILE_STORES,
  CONVERSATION_SYNC_MAX_BYTES,
  CONVERSATION_SYNC_MAX_FILES,
  conversationPathsFor,
  restoreConversation,
  scrubConversation,
  theRuntimeMark,
  type ConversationLine,
  type ConversationPath,
  type ConversationSyncReply,
} from '../src/shared/conversation-sync.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const madeUpHome = (): string => mkdtempSync(join(tmpdir(), 'conversation-sync-'))
const oldHome = process.env['HOME']
const oldCodexHome = process.env['CODEX_HOME']
let home = ''
/** The home on the other machine, which a mapped path is restored into. */
let otherHome = ''

beforeAll(() => {
  home = madeUpHome()
  otherHome = madeUpHome()
  process.env['HOME'] = home
  process.env['CODEX_HOME'] = join(home, '.codex')
})

afterAll(() => {
  if (oldHome === undefined) delete process.env['HOME']
  else process.env['HOME'] = oldHome
  if (oldCodexHome === undefined) delete process.env['CODEX_HOME']
  else process.env['CODEX_HOME'] = oldCodexHome
  rmSync(home, { recursive: true, force: true })
  rmSync(otherHome, { recursive: true, force: true })
})

/** The two path entries a made-up copy is scrubbed with: a checkout inside a home. */
function theMadeUpPaths(): ConversationPath[] {
  return [
    { token: '<home>', original: home, mapped: otherHome },
    { token: '<checkout:1>', original: join(home, 'project'), mapped: join(otherHome, 'work', 'project') },
  ]
}

describe('the scrub and the path map', () => {
  it('replaces a secret and the absolute paths, restores the mapped paths, and refuses a token with no mapping', () => {
    const text = `The key is sk-ABCDEFGHIJKLMNOPQRSTUV and the folder is ${join(home, 'project')}, under ${home}.`
    const scrubbed = scrubConversation(text, theMadeUpPaths())

    expect(scrubbed.text).not.toContain('sk-ABCDEFGHIJKLMNOPQRSTUV')
    expect(scrubbed.text).not.toContain(home)
    expect(scrubbed.text).toContain('<checkout:1>')
    expect(scrubbed.text).toContain('<home>')
    expect(scrubbed.secretsRemoved).toBeGreaterThan(0)
    expect(scrubbed.pathsMapped).toBe(2)

    const restored = restoreConversation(scrubbed.text, theMadeUpPaths())
    expect(restored.missing).toBeNull()
    expect(restored.text).toContain(join(otherHome, 'work', 'project'))
    expect(restored.text).toContain(otherHome)

    const missing = restoreConversation(scrubbed.text, [
      { token: '<home>', original: home, mapped: otherHome },
      { token: '<checkout:1>', original: join(home, 'project'), mapped: null },
    ])
    expect(missing.missing).toBe('<checkout:1>')
    expect(missing.text).toBe(scrubbed.text)
  })

  it('reads the runtime mark from the stored word, and says no runtime was recorded without guessing', () => {
    expect(theRuntimeMark('claude-code')).toEqual({ word: 'claude-code', known: true })
    expect(theRuntimeMark('codex')).toEqual({ word: 'codex', known: true })
    expect(theRuntimeMark(null)).toEqual({ word: 'runtime not recorded', known: false })
    expect(theRuntimeMark('a-tool-this-office-does-not-know')).toEqual({ word: 'a-tool-this-office-does-not-know', known: false })
  })

  it('puts a checkout before the home that holds it in the path map', () => {
    const paths = conversationPathsFor({ HOME: home }, [join(home, 'project'), join(home, 'project'), '/opt/other'])
    expect(paths.map((one) => one.token)).toEqual(['<home>', '<checkout:1>', '<checkout:2>'])
    const scrubbed = scrubConversation(`${join(home, 'project')} and /opt/other`, paths)
    expect(scrubbed.text).toBe('<checkout:1> and <checkout:2>')
  })

  it('reads only the runtimes the runtime declaration names', () => {
    // THE PROMISE THE COMMENT ON CONVERSATION_FILE_STORES MAKES: it is which of the declared runtimes have a store this
    // release reads, not a second list of runtimes. A key the declaration does not name is a runtime this office cannot
    // explain, and a run of it would be given a store this release invented.
    for (const runtime of Object.keys(CONVERSATION_FILE_STORES)) {
      expect(
        Object.hasOwn(THE_PROGRAM_A_RUNTIME_RUNS, runtime),
        `CONVERSATION_FILE_STORES names ${runtime}, which THE_PROGRAM_A_RUNTIME_RUNS does not`,
      ).toBe(true)
    }
  })
})

describe('the conversation sync over the doors', () => {
  let t: TestDb
  let app: FastifyInstance
  let workspace = ''
  let caseNumber = 0

  const human = (): Record<string, string> => ({
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    'x-mole-office-workspace': workspace,
  })

  const asAgent = (): Record<string, string> => ({
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'made-up-agent',
    'x-mole-office-workspace': workspace,
  })

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    await app.ready()
  }, 60_000)

  afterAll(async () => {
    await app.close()
    t.close()
  })

  beforeEach(async () => {
    caseNumber += 1
    workspace = `conversation-sync-case-${String(caseNumber)}`
    const made = await app.inject({ method: 'POST', url: '/api/workspaces', headers: human(), payload: { id: workspace, title: 'Conversation sync' } })
    expect(made.statusCode, made.body).toBe(201)
  })

  afterEach(() => {
    // Each case's checkout is under the one made-up home; nothing outside it is touched.
    for (const name of ['project', 'other-project', 'other-home']) rmSync(join(home, name), { recursive: true, force: true })
  })

  async function createRun(runtime: string, providerSession: string, workingDirectory: string, title: string): Promise<string> {
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: human(),
      payload: { kind: 'session', title, data: { state: 'finished', runtime, providerSession, workingDirectory } },
    })
    expect(made.statusCode, made.body).toBe(201)
    return (made.json() as { record: { id: string } }).record.id
  }

  /** A made-up Claude Code transcript where the runtime looks for it. */
  function writeClaude(workingDirectory: string, providerSession: string, text: string): string {
    const folder = theTranscriptFolder(process.env, workingDirectory)
    expect(folder).not.toBeNull()
    mkdirSync(folder as string, { recursive: true })
    const file = join(folder as string, `${providerSession}.jsonl`)
    writeFileSync(file, text, 'utf8')
    return file
  }

  /** A made-up Codex rollout where the runtime looks for it. */
  function writeCodex(providerSession: string, text: string): string {
    const file = join(home, '.codex', 'sessions', '2026', '11', '10', `rollout-2026-11-10T00-00-00-${providerSession}.jsonl`)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, text, 'utf8')
    return file
  }

  async function setSync(body: Record<string, unknown>, headers: Record<string, string> = human()): Promise<ConversationSyncReply> {
    const res = await app.inject({ method: 'POST', url: '/api/conversations/sync', headers, payload: body })
    expect(res.statusCode, res.body).toBe(200)
    return res.json() as ConversationSyncReply
  }

  async function readSync(limit?: number): Promise<ConversationSyncReply> {
    const res = await app.inject({ method: 'GET', url: `/api/conversations/sync${limit === undefined ? '' : `?limit=${String(limit)}`}`, headers: human() })
    expect(res.statusCode, res.body).toBe(200)
    return res.json() as ConversationSyncReply
  }

  async function runSync(): Promise<{
    outcome: { synced: number; missing: number; unreadable: number; tooLarge: number; deleted: number; overCount: number; notSynced: number; says: string }
    lines: ConversationLine[]
  }> {
    const res = await app.inject({ method: 'POST', url: '/api/conversations/sync/run', headers: human() })
    expect(res.statusCode, res.body).toBe(200)
    return res.json() as {
      outcome: { synced: number; missing: number; unreadable: number; tooLarge: number; deleted: number; overCount: number; notSynced: number; says: string }
      lines: ConversationLine[]
    }
  }

  /** The copy the office stored on one run, through the door that reads it. */
  async function readCopy(run: string): Promise<{ state: string; sha256: string; providerSession: string; capturedAt: string; lastChangedAt: string; text?: string }> {
    const one = await app.inject({ method: 'GET', url: `/api/conversations/${run}`, headers: human() })
    expect(one.statusCode, one.body).toBe(200)
    return (one.json() as { copy: { state: string; sha256: string; providerSession: string; capturedAt: string; lastChangedAt: string; text?: string } }).copy
  }

  /** The line the sync's own reply or read carries for one run. */
  const lineOf = (reply: { conversations?: ConversationLine[]; lines?: ConversationLine[] }, run: string): ConversationLine | undefined =>
    (reply.conversations ?? reply.lines ?? []).find((one) => one.runId === run)

  const transcript = '{"type":"user","message":"my key is sk-ABCDEFGHIJKLMNOPQRSTUV and the folder is '

  it('does not sync before the person turns it on, and an agent may not turn it on', async () => {
    await createRun('claude-code', 'made-up-session', join(home, 'project'), 'Made-up run')
    const off = await readSync()
    expect(off.enabled).toBe(false)
    expect(off.conversations).toEqual([])

    const refused = await app.inject({ method: 'POST', url: '/api/conversations/sync/run', headers: human() })
    expect(refused.statusCode, refused.body).toBe(409)
    expect(refused.body).toContain('No conversation is synced before the person turns the sync on')

    // A ROW THAT SAYS OFF IS STILL OFF: the guard is not the absence of a row.
    await setSync({ enabled: false })
    const refusedAgain = await app.inject({ method: 'POST', url: '/api/conversations/sync/run', headers: human() })
    expect(refusedAgain.statusCode, refusedAgain.body).toBe(409)

    const byAgent = await app.inject({ method: 'POST', url: '/api/conversations/sync', headers: asAgent(), payload: { enabled: true } })
    expect(byAgent.statusCode, byAgent.body).toBe(403)

    const on = await setSync({ enabled: true })
    expect(on.enabled).toBe(true)
    expect(on.paths.some((one) => one.token === '<home>')).toBe(true)
  })

  it('copies a Claude Code run and a Codex run, and a read names the conversation, its runtime and its run', async () => {
    const claude = await createRun('claude-code', 'made-up-claude', join(home, 'project'), 'Made-up Claude Code run')
    const codex = await createRun('codex', 'made-up-codex', join(home, 'project'), 'Made-up Codex run')
    writeClaude(join(home, 'project'), 'made-up-claude', `${transcript}${join(home, 'project')}. My home is ${home}."}\n`)
    writeCodex('made-up-codex', `${transcript}${join(home, 'project')}. My home is ${home}."}\n`)
    await setSync({ enabled: true })

    const ran = await runSync()
    expect(ran.outcome.synced, ran.outcome.says).toBe(2)

    const reply = await readSync()
    expect(reply.enabled).toBe(true)
    expect(reply.conversations).toHaveLength(2)
    const byRun = new Map(reply.conversations.map((one) => [one.runId, one]))
    expect(byRun.get(claude)?.runtime).toEqual({ word: 'claude-code', known: true })
    expect(byRun.get(codex)?.runtime).toEqual({ word: 'codex', known: true })
    expect(byRun.get(claude)?.providerSession).toBe('made-up-claude')
    expect(byRun.get(claude)?.state).toBe('synced')

    for (const run of [claude, codex]) {
      const one = await app.inject({ method: 'GET', url: `/api/conversations/${run}`, headers: human() })
      expect(one.statusCode, one.body).toBe(200)
      const copy = (one.json() as { copy: { text: string; secretsRemoved: number; pathsMapped: number; source: string } }).copy
      expect(copy.text).not.toContain('sk-ABCDEFGHIJKLMNOPQRSTUV')
      expect(copy.text).not.toContain(home)
      expect(copy.text).toContain('<home>')
      expect(copy.text).toContain('<checkout:1>')
      expect(copy.secretsRemoved).toBeGreaterThan(0)
      expect(copy.pathsMapped).toBeGreaterThan(0)
      expect(copy.source).not.toContain(home)
    }

    // THE COPY IS ON THE RUN'S OWN SESSION RECORD, where the project's export carries it.
    const record = await app.inject({ method: 'GET', url: `/api/records/${claude}`, headers: human() })
    expect(record.statusCode, record.body).toBe(200)
    const data = (record.json() as { record: { data: Record<string, unknown> } }).record.data
    expect(typeof (data['conversationSync'] as Record<string, unknown>)['text']).toBe('string')
  })

  it('says a deleted file and keeps the copy from the last read', async () => {
    const run = await createRun('claude-code', 'made-up-deleted', join(home, 'project'), 'Made-up deleted run')
    const file = writeClaude(join(home, 'project'), 'made-up-deleted', `${transcript}${join(home, 'project')}."}\n`)
    await setSync({ enabled: true })
    expect((await runSync()).outcome.synced).toBe(1)

    rmSync(file)
    const second = await runSync()
    expect(second.outcome.deleted, second.outcome.says).toBe(1)
    const reply = await readSync()
    expect(reply.conversations[0]?.state).toBe('deleted')
    const one = await app.inject({ method: 'GET', url: `/api/conversations/${run}`, headers: human() })
    expect(one.statusCode, one.body).toBe(200)
    const copy = (one.json() as { copy: { text: string; secretsRemoved: number } }).copy
    expect(copy.text).toContain('<checkout:1>')
    expect(copy.text).not.toContain('sk-ABCDEFGHIJKLMNOPQRSTUV')
  })

  it('says a missing file and an unknown runtime, and guesses neither', async () => {
    await createRun('claude-code', 'made-up-missing', join(home, 'project'), 'Made-up missing run')
    await createRun('a-tool-this-office-does-not-know', 'made-up-unknown', join(home, 'project'), 'Made-up unknown run')
    await setSync({ enabled: true })
    const ran = await runSync()
    expect(ran.outcome.missing, ran.outcome.says).toBe(1)
    expect(ran.outcome.notSynced, ran.outcome.says).toBe(1)

    const reply = await readSync()
    const states = reply.conversations.map((one) => one.state).sort()
    expect(states).toEqual(['missing', 'not-synced'])
    const unknown = reply.conversations.find((one) => one.runtime.word === 'a-tool-this-office-does-not-know')
    expect(unknown?.runtime.known).toBe(false)
    expect(unknown?.state).toBe('not-synced')
  })

  it('leaves out a file over the size limit and a workspace over the file-count limit, with counts and a sentence', async () => {
    const huge = await createRun('claude-code', 'made-up-huge', join(home, 'project'), 'Made-up huge run')
    writeClaude(join(home, 'project'), 'made-up-huge', 'x'.repeat(CONVERSATION_SYNC_MAX_BYTES + 1))
    await setSync({ enabled: true })
    const one = await runSync()
    expect(one.outcome.tooLarge, one.outcome.says).toBe(1)
    const tooLarge = await app.inject({ method: 'GET', url: `/api/conversations/${huge}`, headers: human() })
    expect(tooLarge.statusCode, tooLarge.body).toBe(200)
    expect((tooLarge.json() as { copy: { state: string; text?: string } }).copy.state).toBe('too-large')
    expect((tooLarge.json() as { copy: { text?: string } }).copy.text).toBeUndefined()

    // A SECOND WORKSPACE, so the earlier huge run does not consume this one's file count.
    caseNumber += 1
    workspace = `conversation-sync-case-${String(caseNumber)}`
    const made = await app.inject({ method: 'POST', url: '/api/workspaces', headers: human(), payload: { id: workspace, title: 'Conversation sync many' } })
    expect(made.statusCode, made.body).toBe(201)
    for (let i = 0; i < CONVERSATION_SYNC_MAX_FILES + 1; i += 1) {
      const id = `made-up-many-${String(i)}`
      await createRun('claude-code', id, join(home, 'project'), `Made-up many run ${String(i)}`)
      writeClaude(join(home, 'project'), id, `${transcript}${join(home, 'project')}."}\n`)
    }
    await setSync({ enabled: true })
    const many = await runSync()
    expect(many.outcome.synced, many.outcome.says).toBe(CONVERSATION_SYNC_MAX_FILES)
    expect(many.outcome.overCount, many.outcome.says).toBe(1)
    expect(many.outcome.says).toContain(`${String(CONVERSATION_SYNC_MAX_FILES)}-file limit`)
  }, 60_000)

  it('maps a second machine’s checkout, installs the copy where the runtime looks and returns its resume command', async () => {
    const checkout = join(home, 'project')
    const otherCheckout = join(home, 'other-project')
    const run = await createRun('claude-code', 'made-up-moved', checkout, 'Made-up moved run')
    writeClaude(checkout, 'made-up-moved', `${transcript}${checkout}."}\n`)
    const on = await setSync({ enabled: true })
    expect((await runSync()).outcome.synced).toBe(1)

    const paths = on.paths.map((one) => (one.token === '<checkout:1>' ? { ...one, mapped: otherCheckout } : one.token === '<home>' ? { ...one, mapped: join(home, 'other-home') } : one))
    await setSync({ enabled: true, paths })

    const restored = await app.inject({ method: 'POST', url: `/api/conversations/${run}/restore`, headers: human(), payload: { to: otherCheckout } })
    expect(restored.statusCode, restored.body).toBe(200)
    const answer = restored.json() as { command: string; folder: string; installedAt: string; says: string }
    expect(answer.folder).toBe(otherCheckout)
    expect(answer.command).toContain('claude --resume')
    expect(answer.command).toContain(otherCheckout)
    expect(existsSync(answer.installedAt)).toBe(true)
    expect(answer.installedAt).toContain(join(home, '.claude', 'projects'))
    const installed = readFileSync(answer.installedAt, 'utf8')
    expect(installed).toContain(otherCheckout)
    expect(installed).not.toContain('<checkout:1>')
    expect(installed).not.toContain('<home>')

    // THE MISSING MAP ENTRY IS NAMED AND NOTHING IS WRITTEN.
    const unmapped = on.paths.map((one) => (one.token === '<checkout:1>' ? { ...one, mapped: null } : one.token === '<home>' ? { ...one, mapped: null } : one))
    await setSync({ enabled: true, paths: unmapped })
    const before = readFileSync(answer.installedAt, 'utf8')
    const refused = await app.inject({ method: 'POST', url: `/api/conversations/${run}/restore`, headers: human(), payload: { to: null } })
    expect(refused.statusCode, refused.body).toBe(409)
    expect(refused.body).toContain('<checkout:1>')
    expect(readFileSync(answer.installedAt, 'utf8')).toBe(before)
  })

  it('reads a page and refuses a limit over the declared maximum', async () => {
    await createRun('claude-code', 'made-up-page', join(home, 'project'), 'Made-up page run')
    writeClaude(join(home, 'project'), 'made-up-page', `${transcript}${join(home, 'project')}."}\n`)
    await setSync({ enabled: true })
    await runSync()
    const page = await readSync(1)
    expect(page.conversations).toHaveLength(1)
    const over = await app.inject({ method: 'GET', url: '/api/conversations/sync?limit=500', headers: human() })
    expect(over.statusCode, over.body).toBe(400)
  })

  it('returns the lines after the writes, with the hash the copy now holds', async () => {
    const run = await createRun('claude-code', 'made-up-lines', join(home, 'project'), 'Made-up lines run')
    const file = writeClaude(join(home, 'project'), 'made-up-lines', `${transcript}${join(home, 'project')}."}\n`)
    await setSync({ enabled: true })

    // THE FIRST SYNC'S OWN REPLY. The copies are written by the loop, so a line read from the rows as they were before
    // the loop has nothing to name.
    const first = await runSync()
    expect(first.outcome.synced, first.outcome.says).toBe(1)
    const firstLine = lineOf(first, run)
    expect(firstLine?.state).toBe('synced')
    const firstCopy = await readCopy(run)
    expect(firstLine?.sha256).toBe(firstCopy.sha256)

    // THE SECOND REPLY CARRIES THE HASH THE SECOND COPY HOLDS, not the one before it.
    writeFileSync(file, `${transcript}${join(home, 'project')}. The file changed."}\n`, 'utf8')
    const second = await runSync()
    expect(second.outcome.synced, second.outcome.says).toBe(1)
    const secondLine = lineOf(second, run)
    expect(secondLine?.state).toBe('synced')
    const secondCopy = await readCopy(run)
    expect(secondCopy.sha256).not.toBe(firstCopy.sha256)
    expect(secondLine?.sha256).toBe(secondCopy.sha256)
    expect(secondLine?.sha256).not.toBe(firstLine?.sha256)
  })

  it('names the moment the copy last changed, and leaves it alone when the file did not', async () => {
    const run = await createRun('claude-code', 'made-up-last-changed', join(home, 'project'), 'Made-up last changed run')
    const file = writeClaude(join(home, 'project'), 'made-up-last-changed', `${transcript}${join(home, 'project')}."}\n`)
    await setSync({ enabled: true })
    expect((await runSync()).outcome.synced).toBe(1)

    const first = lineOf(await readSync(), run)
    expect(first?.lastChangedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(first?.capturedAt).not.toBeNull()

    // A WHOLE SECOND PASSES BEFORE THE SECOND READ, so a field read from the clock rather than from the stored copy
    // would show it. An honest last-changed moment cannot move for a file nothing has changed.
    await new Promise((resolve) => setTimeout(resolve, 1_100))
    expect((await runSync()).outcome.synced).toBe(1)
    const unchanged = lineOf(await readSync(), run)
    expect(unchanged?.lastChangedAt).toBe(first?.lastChangedAt)
    expect(unchanged?.capturedAt).toBe(first?.capturedAt)
    const unchangedCopy = await readCopy(run)
    expect(unchangedCopy.lastChangedAt).toBe(first?.lastChangedAt)
    expect(unchangedCopy.capturedAt).toBe(first?.capturedAt)

    writeFileSync(file, `${transcript}${join(home, 'project')}. The file changed."}\n`, 'utf8')
    expect((await runSync()).outcome.synced).toBe(1)
    const changed = lineOf(await readSync(), run)
    expect(changed?.sha256).not.toBe(first?.sha256)
    expect((changed?.lastChangedAt ?? '') > (first?.lastChangedAt ?? '')).toBe(true)
    const changedCopy = await readCopy(run)
    expect(changedCopy.lastChangedAt).toBe(changed?.lastChangedAt)
    expect(changedCopy.sha256).toBe(changed?.sha256)
  })

  it('refuses a provider id that would leave the runtime’s folder, in the sync and in the restore', async () => {
    const checkout = join(home, 'project')
    const outside = join(home, 'outside.jsonl')
    const escapingRun = await createRun('claude-code', '../outside', checkout, 'Made-up escaping run')
    writeFileSync(outside, `${transcript}${checkout}."}\n`, 'utf8')
    // WHERE THE OLD JOIN LANDED. The transcript folder is `<home>/.claude/projects/<the checkout>`, so
    // `${providerSession}.jsonl` with `../outside` resolves one folder up and is still outside the transcript folder.
    // The same transcript sits at both places: the brief's `join(home, 'outside.jsonl')` and the file the escaped join
    // names, so neither may reach a copy.
    const transcriptFolder = theTranscriptFolder(process.env, checkout) as string
    const whereTheJoinLanded = join(transcriptFolder, '..', 'outside.jsonl')
    writeFileSync(whereTheJoinLanded, readFileSync(outside, 'utf8'), 'utf8')

    await setSync({ enabled: true })
    const escaping = await runSync()
    expect(escaping.outcome.notSynced, escaping.outcome.says).toBe(1)
    const refusedCopy = await readCopy(escapingRun)
    expect(refusedCopy.state).toBe('not-synced')
    expect(refusedCopy.providerSession).toBe('../outside')
    expect(refusedCopy.text).toBeUndefined()
    expect(readFileSync(whereTheJoinLanded, 'utf8')).toBe(readFileSync(outside, 'utf8'))
    // REMOVED, so whether the restore writes one is a fact about the restore rather than about this plant.
    rmSync(whereTheJoinLanded)

    // A VALID COPY ON ANOTHER RUN, with its provider id replaced on the stored record through the patch door.
    const validRun = await createRun('claude-code', 'made-up-restored', checkout, 'Made-up restored run')
    writeClaude(checkout, 'made-up-restored', `${transcript}${checkout}."}\n`)
    expect((await runSync()).outcome.synced).toBe(1)
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/records/${validRun}`,
      headers: human(),
      payload: { dataPatch: { conversationSync: { providerSession: '../outside' } } },
    })
    expect(patched.statusCode, patched.body).toBe(200)

    const restoredTo = join(home, 'other-project')
    const restoreFolder = theTranscriptFolder(process.env, restoredTo) as string
    const wouldHaveBeenWritten = join(restoreFolder, '..', 'outside.jsonl')
    const restored = await app.inject({ method: 'POST', url: `/api/conversations/${validRun}/restore`, headers: human(), payload: { to: restoredTo } })
    expect(restored.statusCode, restored.body).toBe(409)
    expect(restored.body).toContain('../outside')
    expect(existsSync(wouldHaveBeenWritten)).toBe(false)
    expect(existsSync(outside)).toBe(true)
  })
})
