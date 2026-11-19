// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REFUSED RESOLUTION IS TOLD AT ONCE (wave 13u round 79, item 20 of the line's requirements). On 24 Oct 2026 the merge
 * tool's check refused the resolution of a merge entry at 14:23. Nobody knew, and the entry bounced at 15:08, when its time
 * to resolve ran out.
 *
 * WHAT THIS FILE PROVES, for a refused resolution of a conflict and for a refused fix of tests red only with the entry:
 *   1. The 'resolution-checked' step that writes the refusal writes exactly one message, in the same step, to the agent the
 *      office asked to resolve and to whoever holds the secretary card. It wakes its readers.
 *   2. The message carries the check's sentence, the refused commit in full, the end of the time to resolve, and the
 *      minutes left of it.
 *   3. The entry's reading keeps the refusal with the check's sentence and the message, beside the refused commit.
 *   4. The merge queue page draws the minutes left on the entry's row.
 *
 * AND FOR A CHECK THAT ENDS WITH NO RESULT (13u round 80, item 21): when the last of the merge tool runs an entry gets in
 * one place ends without a result, the office writes the resolution as refused. That ending writes the same one message,
 * with the refusal's sentence, which names the last run's own words, and the entry and the page say the same as above.
 * The message gives that sentence as the office's, not the check's: the speakers are read from the code's
 * `WHOSE_REFUSAL_SENTENCE`, so no sentence is copied here. The notice's words, which the notice rules page draws and the
 * table of notices gives, end with a sentence of their own about that ending (13u round 81, item 22). Both are read from
 * the word list by their keys.
 *
 * Whom it goes to is read where the office keeps it: the asked agent from the entry's own `resolving.asked`, and the
 * secretary as the agent registered here with the secretary card. The end of the time to resolve is read from the stored
 * entry by `theEndOfResolving`, the one reading of it. The minutes left are this test's own: it sets its clock to a third
 * of the time before that end.
 *
 * Every fixture here is synthetic and says so. The lane's repository, the runs' trees and the clean copies are git trees
 * made under the temporary directory and removed after; the records are filed as fixtures; nothing reaches the live
 * server. The check's refusal is sent here as the merge tool's check run sends it, because the check run is
 * tests/the-merge-tool-checks-a-resolution.test.ts's.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, writeAVerdictAsItsDoorWould, type TestDb } from './helpers.ts'
import { ABSENT, theEndOfResolving } from '../src/shared/merge-queue.ts'
import type { MergeQueueReply } from '../src/shared/merge-queue-page.ts'
import { gateNamed } from '../src/config/gates.mjs'
const MAX_TOOL_RUNS_IN_ONE_PLACE = Number(gateNamed('tool-runs-in-one-place').defaults.ordinary)

const CONFLICT_RESOLVING = 'MOLE_OFFICE_CONFLICT_RESOLVING'
const RED_FIXING = 'MOLE_OFFICE_RED_FIXING'
const A = 'work/a.txt'
const FIX = 'work/fix.txt'
const T = 'tests/synthetic-red.test.ts'
const SUPERVISOR = 'told-supervisor'
const REPOSITORY = 'told-refusals'
const STAMP = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/

describe('a refused resolution, or a refused fix of red tests, is told at once', () => {
  let t: TestDb
  let app: FastifyInstance
  let root: string
  let mainAt: string
  let secretary: string
  const made: string[] = []
  const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
  const asPerson = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
  const asTheOffice = { ...asPerson, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker' }
  async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown) {
    const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
    return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
  }
  function git(dir: string, ...args: string[]) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, HOME: dir } }).trim() }
  function scratch(prefix: string) {
    const dir = mkdtempSync(join(tmpdir(), `told-${prefix}-`))
    made.push(dir)
    return realpathSync(dir)
  }
  function asTheFixture(dir: string) { git(dir, 'config', 'user.email', 'fixture@example.invalid'); git(dir, 'config', 'user.name', 'Synthetic refused-resolution fixture') }
  const stored = (id: string) => t.api.getRecord(id)!.data as Record<string, any>
  const step = (id: string, name: string, facts: Record<string, unknown>) => call('POST', `/api/merge-queue/${id}/step`, asTheOffice, { step: name, facts })
  /** Every message about this run, by id, oldest first. */
  const messagesAbout = (run: string) =>
    (t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? ORDER BY created_at, rowid").all(run) as { id: string }[]).map((row) => row.id)
  async function entry(id: string): Promise<Record<string, any>> {
    const read = await call('GET', `/api/merge-queue/${id}`, asPerson)
    expect(read.status, read.raw).toBe(200)
    return read.body.entry
  }
  async function withTheSetting<T>(name: string, run: () => Promise<T>): Promise<T> {
    const before = process.env[name]
    process.env[name] = '1'
    try { return await run() } finally { if (before === undefined) delete process.env[name]; else process.env[name] = before }
  }

  interface Seal { id: string; commit: string; files: { path: string; hash: string | null }[] }
  interface One { id: string; run: string; dir: string; seal: Seal }
  const contentOf = (seal: Seal) => Object.fromEntries(seal.files.map((one) => [one.path, one.hash ?? ABSENT]))

  /** A SUBMITTED GIT ENTRY: a finished run of the entry's own supervisor whose `work` branch changes work/a.txt, sealed, and released by an inspector. */
  async function anEntry(): Promise<One> {
    const dir = scratch('tree')
    git(dir, 'clone', '-q', root, '.'); asTheFixture(dir)
    git(dir, 'switch', '-q', '-c', 'work')
    writeFileSync(join(dir, A), `before\nafter, from ${basename(dir)}\n`); git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'Synthetic work whose resolution is refused')
    const run = t.api.createRecord({ kind: 'session', title: 'Synthetic run whose resolution is refused', workspaceId: 'default', actor: { type: 'agent', id: SUPERVISOR }, origin: 'fixture', data: { state: 'running', servingAgent: SUPERVISOR, workingDirectory: dir, cutFrom: 'main' } }).id
    t.api.patchRecord(run, { dataPatch: { state: 'finished' } }, person)
    const sealId = t.api.getRecord(run)!.data['sealedTip'] as string
    const seal = t.api.getRecord(sealId)!.data['seal'] as { hash: string; git: { commit: string; files: Seal['files'] } }
    writeAVerdictAsItsDoorWould(t, run, { released: { by: { kind: 'agent', id: 'synthetic-inspector' }, at: '2026-10-24 01:00:00', how: 'an inspector', check: 'synthetic-check', read: { sealId, sealHash: seal.hash, worktree: dir, tip: seal.git.commit, ofItsOwn: true, says: 'Synthetic check fixture.' } } })
    const queued = await call('POST', '/api/merge-queue', asPerson, { run, changeset: { adapter: 'git', repository: REPOSITORY } })
    expect(queued.status, queued.raw).toBe(201)
    return { id: String(queued.body.entry.id), run, dir, seal: { id: sealId, commit: seal.git.commit, files: seal.git.files } }
  }
  /** A clean copy of `from` at `at` with `path` committed, handed over by the person; its commit. */
  async function aHandOver(one: One, at: string, from: string, path: string, content: string): Promise<string> {
    const folder = scratch('clean-copy')
    git(folder, 'clone', '-q', from, '.'); asTheFixture(folder)
    git(folder, 'switch', '-q', '--detach', at)
    writeFileSync(join(folder, path), content); git(folder, 'add', '.'); git(folder, 'commit', '-q', '-m', 'Synthetic hand-over the check refuses')
    const handed = await call('POST', `/api/merge-queue/${one.id}/resolution`, asPerson, { workingDirectory: folder })
    expect(handed.status, handed.raw).toBe(200)
    return git(folder, 'rev-parse', 'HEAD')
  }
  /** One merge tool run on the entry through the tool doors, as the worker records it: its start, then its ending with `reason`. */
  async function aToolRunThatEnds(one: One, reason: string): Promise<Record<string, any>> {
    const session = t.api.createRecord({ kind: 'session', title: 'Synthetic merge tool run that gives no result', workspaceId: 'default', actor: { type: 'agent', id: 'mole-office/the-message-worker' }, origin: 'fixture', data: { state: 'running', runtime: 'merge-tool' } }).id
    const started = await call('POST', `/api/merge-queue/${one.id}/tool-started`, asTheOffice, { session, log: '/synthetic/the-merger.log' })
    expect(started.status, started.raw).toBe(200)
    const ended = await call('POST', `/api/merge-queue/${one.id}/tool-ended`, asTheOffice, { session, reason })
    expect(ended.status, ended.raw).toBe(200)
    return ended.body
  }

  /** The queue page's module, in English, under a stand-in window it reads who is looking from. */
  async function theQueuePage(): Promise<typeof import('../src/web/pages/MergeQueuePage.tsx')> {
    const kept = new Map<string, string>()
    const storage = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) }
    ;(globalThis as unknown as { window: unknown }).window = { localStorage: storage, sessionStorage: storage, location: { hash: '', search: '' }, addEventListener: () => {}, removeEventListener: () => {} }
    ;(await import('../src/shared/i18n.ts')).setWordLanguage('en')
    return import('../src/web/pages/MergeQueuePage.tsx')
  }
  /** One row of the drawn page, by entry id, as a reader reads it. */
  function theRowsWords(html: string, entry: string): string {
    const found = html.match(new RegExp(`<li class="mq-row" data-entry="${entry}"[^>]*>[\\s\\S]*?</li>`, 'u'))
    expect(found, `the page draws no row for ${entry}`).not.toBeNull()
    return found![0].replace(/<code class="mq-id">[^<]*<\/code>/gu, ' ').replace(/<[^>]+>/gu, ' ').replace(/&#x27;/gu, "'").replace(/\s+/gu, ' ')
  }

  /**
   * THE REFUSAL AND WHAT IT TOLD. The test's clock is set so that a third of the entry's time to resolve is left, rounded
   * up to a whole minute. Then `commit` is refused: the merge tool's check refuses it as its check run reports a refusal,
   * with `says`, or the last check run the entry gets in one place ends with no result, saying `says`. Then: the one
   * message the refusal wrote, whom it went to and what it says; the entry's reading; and the page's row.
   */
  async function refusedAndTold(one: One, commit: string, says: string, how: 'the check refuses' | 'the last check run gives no result' = 'the check refuses') {
    const resolving = stored(one.id)['resolving'] as { since: string; timeZone: string; minutes?: number; asked?: { agent?: string } }
    const asked = resolving.asked?.agent
    expect(asked, 'the office asked no agent to resolve this entry, so the case proves nothing about the asked agent').toBeDefined()
    const hour = theEndOfResolving(resolving)
    expect(hour?.untilMs ?? null, `the end of merge entry ${one.id}'s time to resolve cannot be read`).not.toBeNull()
    const left = Math.ceil(hour!.minutes / 3)
    const now = hour!.untilMs! - left * 60_000
    const before = new Set(messagesAbout(one.run))
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)

    if (how === 'the check refuses') {
      const r = await step(one.id, 'resolution-checked', { commit, ok: false, says })
      expect(r.status, r.raw).toBe(200)
    } else {
      const ended = await aToolRunThatEnds(one, says)
      expect(ended['entry'].machine.resolution.refused, `the last check run did not write the resolution as refused: ${String(ended['says'])}`).toBeDefined()
    }
    // THE REFUSAL'S SENTENCE: the check's own, or, for a check that gave no result, the office's, naming the last run's words.
    const sentence = String(stored(one.id)['resolution']['refused']['says'])
    if (how === 'the check refuses') expect(sentence).toBe(says)
    else expect(sentence).toContain(says)

    // EXACTLY ONE MESSAGE, to the asked agent and the secretary, and it wakes them.
    const written = messagesAbout(one.run).filter((id) => !before.has(id))
    expect(written, 'the refusal wrote no message, or more than one').toHaveLength(1)
    const message = t.api.getRecord(written[0]!)!
    expect(message.kind).toBe('message')
    const to = message.data['to'] as { kind: string; id: string }[]
    expect(to).toHaveLength(2)
    expect(to).toEqual(expect.arrayContaining([{ kind: 'agent', id: asked }, { kind: 'agent', id: secretary }]))
    const { NOTICES } = await import('../src/server/lib/notices.ts')
    const notice = message.data['notice'] as string | undefined
    expect(notice, 'the message carries no notice kind').toBeDefined()
    expect((NOTICES as Record<string, { wakes: boolean } | undefined>)[notice!]?.wakes, `the notice ${String(notice)} does not wake its reader`).toBe(true)

    // THE REFUSAL'S SENTENCE, THE REFUSED COMMIT, AND THE TIME LEFT.
    const body = String(message.data['body'])
    expect(body).toContain(sentence)
    // WHOSE SENTENCE IT IS: the check's when the check refused, the office's when the check gave no result.
    const whose = Reflect.get(await import('../src/server/lib/merge-state-machine.ts'), 'WHOSE_REFUSAL_SENTENCE') as Record<'theCheck' | 'theOffice', string> | undefined
    expect(whose, "the office names no speaker for a refusal's sentence").toBeDefined()
    expect(whose!.theCheck).not.toBe(whose!.theOffice)
    expect(body).toContain(`${how === 'the check refuses' ? whose!.theCheck : whose!.theOffice}: ${sentence}`)
    expect(body).toContain(commit)
    expect(body).toContain(hour!.until!)
    expect(body).toMatch(new RegExp(`\\b${String(left)} minutes\\b`, 'u'))

    // THE ENTRY'S READING keeps the refusal, its sentence and the message, beside the refused commit.
    const read = await entry(one.id)
    expect(read).toMatchObject({ state: 'resolving', toolWanted: null })
    expect(read.machine.resolution.commit).toBe(commit)
    expect(read.machine.resolution.refused).toEqual({ at: expect.stringMatching(STAMP), says: sentence, message: written[0] })

    // THE PAGE draws the minutes left on the entry's row.
    const page = await theQueuePage()
    try {
      const listed = await call('GET', `/api/merge-queue?state=${page.LIVE_STATES.join(',')}`, asPerson)
      expect(listed.status, listed.raw).toBe(200)
      const row = theRowsWords(renderToStaticMarkup(h(page.TheMergeQueue, { reply: listed.body as unknown as MergeQueueReply, now: new Date(now) })), one.id)
      expect(row).toMatch(new RegExp(`\\b${String(left)} minutes\\b`, 'u'))
    } finally {
      delete (globalThis as { window?: unknown }).window
    }
  }

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    root = scratch('main')
    git(root, 'init', '-q', '-b', 'main'); asTheFixture(root)
    mkdirSync(join(root, 'work')); writeFileSync(join(root, A), 'before\n'); git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic baseline')
    mainAt = git(root, 'rev-parse', 'HEAD')
    const repositories = await import('../src/server/lib/repositories.ts')
    repositories.registerRepository({ workspaceId: 'default', name: REPOSITORY, root, actor: { ...person, provedBy: 'the-person-key' } })
    const supervisor = await call('POST', '/api/agents/started', asPerson, { handle: SUPERVISOR, name: 'Synthetic supervisor whose resolution is refused', workArea: ['work'], role: 'supervisor' })
    expect(supervisor.status, supervisor.raw).toBe(201)
    const card = await call('POST', '/api/agents/started', asPerson, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
    expect(card.status, card.raw).toBe(201)
    secretary = String(card.body['agent'].id)
  }, 60_000)
  // A CASE THAT FAILED HALF WAY DOES NOT HOLD THE LANE FOR THE NEXT ONE.
  afterEach(async () => {
    vi.useRealTimers()
    const listed = await call('GET', `/api/merge-queue?lane=${encodeURIComponent(root)}`, asPerson)
    const holder = listed.body['lanes']?.[0]?.occupiedBy as { entry: string; state: string } | null | undefined
    if (holder === null || holder === undefined) return
    await call('POST', `/api/merge-queue/${holder.entry}/withdraw`, asPerson, { because: 'Synthetic: the case is over, so the lane is freed.' })
  })
  afterAll(async () => { await app?.close(); t?.close(); for (const dir of made) rmSync(dir, { recursive: true, force: true }) })

  it('1. tells the asked agent and the secretary in one message when the check refuses a resolution of a conflict', async () => {
    const one = await anEntry()
    const pinned = await withTheSetting(CONFLICT_RESOLVING, () =>
      step(one.id, 'pinned', { files: contentOf(one.seal), cannotJoin: { mainAt, commit: one.seal.commit, files: [A], lines: [{ path: A, ranges: '1-5' }] } }),
    )
    expect(pinned.status, pinned.raw).toBe(200)
    expect(stored(one.id)['state']).toBe('resolving')
    const commit = await aHandOver(one, mainAt, one.dir, A, 'before\nresolved, keeping both sides\n')
    await refusedAndTold(one, commit, 'Synthetic: the resolution changed a line outside the places git left in conflict.')
  })

  it('2. tells the asked agent and the secretary in one message when the check refuses a fix of tests red only with the entry', async () => {
    const one = await anEntry()
    for (const [name, facts] of [
      ['pinned', { files: contentOf(one.seal) }],
      ['integrating', {}],
      ['integrated', { result: one.seal.commit, mainAt, files: contentOf(one.seal) }],
    ] as const) {
      const r = await step(one.id, name, facts)
      expect(r.status, `${name}: ${r.raw}`).toBe(200)
    }
    const red = await withTheSetting(RED_FIXING, () => step(one.id, 'tested', { green: false, log: '/synthetic/suite.log', redTests: [T], redOnlyWithIt: [T], ran: 2, passed: 1 }))
    expect(red.status, red.raw).toBe(200)
    expect(stored(one.id)['state']).toBe('resolving')
    expect(stored(one.id)['resolving']['red']).toEqual({ tests: [T] })
    const commit = await aHandOver(one, one.seal.commit, one.dir, FIX, 'Synthetic: the fix of the red test.\n')
    await refusedAndTold(one, commit, 'Synthetic: the fix changed a replayed commit.')
  })

  it('3. tells the asked agent and the secretary in one message when the check of a resolution ends with no result', async () => {
    const one = await anEntry()
    const pinned = await withTheSetting(CONFLICT_RESOLVING, () =>
      step(one.id, 'pinned', { files: contentOf(one.seal), cannotJoin: { mainAt, commit: one.seal.commit, files: [A], lines: [{ path: A, ranges: '1-5' }] } }),
    )
    expect(pinned.status, pinned.raw).toBe(200)
    expect(stored(one.id)['state']).toBe('resolving')
    const commit = await aHandOver(one, mainAt, one.dir, A, 'before\nresolved, keeping both sides\n')
    // EVERY RUN BUT THE LAST has the office ask for the check again.
    for (let run = 1; run < MAX_TOOL_RUNS_IN_ONE_PLACE; run += 1) {
      const ended = await aToolRunThatEnds(one, `Synthetic: check run ${String(run)} crashed.`)
      expect(ended['entry']).toMatchObject({ state: 'resolving', toolWanted: { since: expect.stringMatching(STAMP) } })
    }
    await refusedAndTold(one, commit, 'Synthetic: the last check run crashed too.', 'the last check run gives no result')
  })

  it("4. the notice's words end with a sentence of their own for a check that ended with no result", async () => {
    const { englishWords } = await import('../src/shared/words/joined.ts')
    const words = englishWords() as Record<string, unknown>
    const whole = words['noticeWords.aResolutionWasRefused']
    const ofNoResult = words['noticeWords.aResolutionWasRefusedWithNoResult']
    expect(typeof whole).toBe('string')
    expect(typeof ofNoResult, 'no words of their own say what the notice tells when the check ended with no result').toBe('string')
    expect(String(ofNoResult).trim()).not.toBe('')
    // A SENTENCE OF ITS OWN: the notice's words end with it, after the words about the check's refusal, which do not say it.
    expect(String(whole).endsWith(`. ${String(ofNoResult)}`), "the notice's words do not end with the sentence for a check that gave no result").toBe(true)
    const ofTheCheck = String(whole).slice(0, String(whole).length - String(ofNoResult).length - 1)
    expect(ofTheCheck).not.toContain(String(ofNoResult))
    const { NOTICES } = await import('../src/server/lib/notices.ts')
    expect(NOTICES.aResolutionWasRefused.because).toBe(whole)
  })
})
