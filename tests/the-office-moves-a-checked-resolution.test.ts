// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE MOVES A RESOLUTION THE MERGE TOOL CHECKED (tier 2 of the owner's decision, round B; XHY2fVFG3Qq8,
 * answers 1 and 2, with answer 1 as v06FDSPuiPc9 corrects it). Nothing of it is live: the
 * setting MOLE_OFFICE_CONFLICT_RESOLVING is off by default, and these cases turn it on only around the step that hands
 * an entry on.
 *
 * The rule first: the merge tool acts on a resolving entry only while its resolution waits for the check.
 *
 * Then the 'resolution-checked' step, as the merge tool's check run sends it:
 *   1. A pass moves the entry to pinned, and the pin step's own judging follows. An entry whose run an inspector released
 *      is judged; one whose run nobody released waits in pinned for its release, wherever its conflict was found: at the
 *      pin by its lines or by the rebase tried early, or after another entry landed. Each of main's commits in a place is
 *      named with the merge entry that landed it, or with none. A pass after the hour counts.
 *   2. The pin hands a conflict on only where it would have pinned the entry: content that is not the seal's is refused
 *      with 422, and an incomplete report bounces, as with the setting off.
 *   3. A refusal keeps the entry resolving and takes the tool's mark off, and a new hand-over drops the refusal and asks
 *      for the check again. A check of another commit or another ref, or a ref that does not hold the commit, writes
 *      nothing.
 *   4. A check run that ends without a result has the tool asked again, and at the limit the resolution is written as
 *      refused, in resolving.
 *   5. The entry's reader refuses the tool's mark on a resolving entry with nothing to check.
 *   6. A conflict met after a pass goes back to the supervisor in the hour of the first conflict, never started again
 *      (Eikutg3bgXRr and PJwS954g6cHS). The files to resolve are the earlier ones and the new ones, and the
 *      resolution that met it is kept as a help (way (3) of jmghLKcXenGW). The office asks again: it writes the
 *      brief, which names that help and replays the entry's own commit, and sends a second message. The supervisor has
 *      no run going, so the office also asks the next-round door for its round itself and keeps the door's answer on
 *      the ask (wave 13u round 90; mutation: that ask left out of the hand-on turns this case red). After the hour
 *      nobody is asked, and nothing of the first asking is kept.
 *
 * Then the scoped check before the suite (round B, part 6):
 *   7. At the integrate step every file the supervisor resolved goes to a scoped check, even where its content is what the
 *      verdict read, as one needs-judgment item that sets out each place with the five things the inspector reads, and
 *      the inspector's prompt asks of such a file whether it keeps what both sides meant. An entry with no resolution
 *      and nothing changed since its verdict goes straight to testing. The integrate step and a released scoped check
 *      are the only two moves into testing, so no hand-over reaches the suite without a check of each file it resolved
 *      that the integrated tree changes on main. A place whose entry's
 *      commit git dropped, because the resolution took main's side and so left it with no change, names no commit of the
 *      resolution, and the item says so.
 *   8. A release sends the entry to testing. Every later integration asks about each resolved file again, even at the
 *      content a release already read. A red suite bounces it as "not green". A refusal bounces it as "changes what one
 *      side meant" when the check was asked only about resolved files, and with no word otherwise.
 *   9. A resolved file the integrated tree leaves as main has it lands as main's own (problem PRHvQV6YyGQ1): no scoped
 *      check is asked about it, the entry does not bounce for it, and the check is asked about what the resolution
 *      changed. A refusal of that check is not read as one about the resolution.
 *  10. The item of a file an earlier resolution resolved says so, and that it is judged again in full (as in
 *      jmghLKcXenGW, addition 1). The item of a file met only at the later conflict does not.
 *  11. The item sets out the supervisor's own run of the related tests as it declared it with its own key, and a run
 *      that failed decides nothing (XHY2fVFG3Qq8, answer 3). Without one, the item says none was declared.
 *
 * Every fixture here is synthetic and says so. The lane's repository, the runs' trees and the clean copies are git trees
 * made under the temporary directory and removed after; the records are filed as fixtures; nothing reaches the live
 * server. Case 6's sandbox folder is made under the temporary directory and removed after; a container row written as
 * `tools/sandbox.mjs up` writes one vouches for it, and a run filed as its launcher files one names it. The tool's own work before a pass, fetching the commit and pointing the ref at it, is done here by git in the
 * test, because the check run is tests/the-merge-tool-checks-a-resolution.test.ts's. Case 5 breaks its entry by a direct
 * write of the stored field, because no door writes one, and puts the field back after. The hour's end is reached by
 * setting the test's clock, not by waiting. The scoped check's verdict in cases 7 to 9 is written on the check-again run
 * by the helper that writes a verdict as its door would, and the queue is told by the function the check door calls.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { theRunReportsForTheQueue } from './a-report-the-merge-queue-reads.ts'
import { apiApp, freshDb, writeAVerdictAsItsDoorWould, type TestDb } from './helpers.ts'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { WHY_THE_TOOL_COULD_NOT_DECIDE_IT } from '../src/config/inspection-ending.mjs'
import { ABSENT, pinnedRefOf, resolvedRefOf, theMergeToolActsOn } from '../src/shared/merge-queue.ts'
import { gateNamed } from '../src/config/gates.mjs'
const MAX_TOOL_RUNS_IN_ONE_PLACE = Number(gateNamed('tool-runs-in-one-place').defaults.ordinary)
import { theHourAfter } from '../src/shared/time.ts'

const THE_SETTING = 'MOLE_OFFICE_CONFLICT_RESOLVING'
const A = 'work/a.txt'
const AUTHOR = 'checked-author'
const SUPERVISOR = 'checked-supervisor'
const REPOSITORY = 'checked-resolutions'
const STAMP = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/

describe('the rule: the merge tool acts on a resolving entry only while its resolution waits for the check', () => {
  it('reads the state and the resolution together', () => {
    const handed = { commit: 'c'.repeat(40) }
    expect(theMergeToolActsOn('resolving', undefined)).toBe(false)
    expect(theMergeToolActsOn('resolving', handed)).toBe(true)
    expect(theMergeToolActsOn('resolving', { ...handed, refused: null })).toBe(true)
    expect(theMergeToolActsOn('resolving', { ...handed, refused: { at: '2026-10-17 06:00:00', says: 'Synthetic: refused.' } })).toBe(false)
    expect(theMergeToolActsOn('pinned', handed)).toBe(false)
    expect(theMergeToolActsOn('judged', undefined)).toBe(true)
  })
})

describe("the 'resolution-checked' step", () => {
  let t: TestDb
  let app: FastifyInstance
  let root: string
  let mainAt: string
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
    const dir = mkdtempSync(join(tmpdir(), `checked-${prefix}-`))
    made.push(dir)
    return realpathSync(dir)
  }
  function asTheFixture(dir: string) { git(dir, 'config', 'user.email', 'fixture@example.invalid'); git(dir, 'config', 'user.name', 'Synthetic checked-resolution fixture') }
  const stored = (id: string) => t.api.getRecord(id)!.data
  const ids: Record<string, string> = {}
  /** Every message the office wrote that asks for a resolution about this run, oldest first. */
  const askingAbout = (run: string) =>
    (t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'message' AND json_extract(data, '$.notice') = 'askedToResolve' AND json_extract(data, '$.aboutRun') = ? ORDER BY created_at, rowid").all(run) as { id: string }[]).map((row) => row.id)
  function rawData(id: string, data: Record<string, unknown>) { t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), id) }
  const step = (id: string, name: string, facts: Record<string, unknown>) => call('POST', `/api/merge-queue/${id}/step`, asTheOffice, { step: name, facts })
  async function entry(id: string): Promise<Record<string, any>> {
    const read = await call('GET', `/api/merge-queue/${id}`, asPerson)
    expect(read.status, read.raw).toBe(200)
    return read.body.entry
  }
  async function withTheSetting<T>(run: () => Promise<T>): Promise<T> {
    const before = process.env[THE_SETTING]
    process.env[THE_SETTING] = '1'
    try { return await run() } finally { if (before === undefined) delete process.env[THE_SETTING]; else process.env[THE_SETTING] = before }
  }

  interface Seal { id: string; commit: string; files: { path: string; hash: string | null }[] }
  interface One { id: string; run: string; dir: string; seal: Seal }
  const contentOf = (seal: Seal) => Object.fromEntries(seal.files.map((one) => [one.path, one.hash ?? ABSENT]))

  /**
   * A SUBMITTED GIT ENTRY: a finished run in a clone of the lane's repository whose `work` branch changes work/a.txt with
   * a line of its own, sealed, and released by an inspector when `released`. A run nobody released carries the report
   * the queue reads at the pin, unless `report` is false. The run is `servedBy`'s, the author's unless it says.
   */
  async function anEntry(how: { released: boolean; report?: false; servedBy?: string }): Promise<One> {
    const servedBy = how.servedBy ?? AUTHOR
    const dir = scratch('tree')
    git(dir, 'clone', '-q', root, '.'); asTheFixture(dir)
    git(dir, 'switch', '-q', '-c', 'work')
    writeFileSync(join(dir, A), `before\nafter, from ${basename(dir)}\n`); git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'Synthetic work that conflicts')
    const run = t.api.createRecord({ kind: 'session', title: 'Synthetic run whose entry conflicts', workspaceId: 'default', actor: { type: 'agent', id: servedBy }, origin: 'fixture', data: { state: 'running', servingAgent: servedBy, workingDirectory: dir, cutFrom: 'main' } }).id
    if (!how.released && how.report !== false) theRunReportsForTheQueue(t, run, { type: 'agent', id: servedBy })
    t.api.patchRecord(run, { dataPatch: { state: 'finished' } }, person)
    const sealId = t.api.getRecord(run)!.data['sealedTip'] as string
    const seal = t.api.getRecord(sealId)!.data['seal'] as { hash: string; git: { commit: string; files: Seal['files'] } }
    if (how.released) {
      writeAVerdictAsItsDoorWould(t, run, { released: { by: { kind: 'agent', id: 'synthetic-inspector' }, at: '2026-10-17 01:00:00', how: 'an inspector', check: 'synthetic-check', read: { sealId, sealHash: seal.hash, worktree: dir, tip: seal.git.commit, ofItsOwn: true, says: 'Synthetic check fixture.' } } })
    }
    const queued = await call('POST', '/api/merge-queue', asPerson, { run, changeset: { adapter: 'git', repository: REPOSITORY } })
    expect(queued.status, queued.raw).toBe(201)
    return { id: String(queued.body.entry.id), run, dir, seal: { id: sealId, commit: seal.git.commit, files: seal.git.files } }
  }
  const cannotJoin = (one: One) => ({ files: contentOf(one.seal), cannotJoin: { mainAt, commit: one.seal.commit, files: [A], lines: [{ path: A, ranges: '1-5' }] } })
  /** The pin, with the setting on, hands the entry on by these facts. */
  async function handedOnAtThePin(one: One, facts: Record<string, unknown>) {
    const pinned = await withTheSetting(() => step(one.id, 'pinned', facts))
    expect(pinned.status, pinned.raw).toBe(200)
    expect(stored(one.id)['state']).toBe('resolving')
  }

  interface Copy { folder: string; commit: string }
  /** A CLEAN COPY of `from` at `at`, with the resolution committed in work/a.txt, handed over by the person. */
  async function aHandOver(one: One, at: string, from: string = one.dir, content = 'before\nresolved, keeping both sides\n', path = A): Promise<Copy> {
    const folder = scratch('clean-copy')
    git(folder, 'clone', '-q', from, '.'); asTheFixture(folder)
    git(folder, 'switch', '-q', '--detach', at)
    writeFileSync(join(folder, path), content); git(folder, 'add', '.'); git(folder, 'commit', '-q', '-m', 'Synthetic work that conflicts')
    const commit = git(folder, 'rev-parse', 'HEAD')
    const handed = await call('POST', `/api/merge-queue/${one.id}/resolution`, asPerson, { workingDirectory: folder })
    expect(handed.status, handed.raw).toBe(200)
    return { folder, commit }
  }
  /** WHAT THE CHECK RUN DOES BEFORE IT REPORTS A PASS: the commit fetched into the lane's repository, and the ref pointed at it. */
  function heldAtTheRef(one: One, copy: Copy) {
    git(root, 'fetch', '-q', copy.folder, 'HEAD')
    git(root, 'update-ref', resolvedRefOf(one.id), copy.commit)
  }
  /** One place as the check reports it, with synthetic lines. */
  const aPlace = (one: One, copy: Copy, mainCommits: string[]) => ({
    path: A,
    at: 1,
    entryCommit: one.seal.commit,
    resolvedIn: copy.commit,
    ancestor: { lines: ['before'], more: 0 },
    main: { lines: ['before'], more: 0 },
    entry: { lines: ['before', `after, from ${basename(one.dir)}`], more: 0 },
    resolution: { lines: ['before', 'resolved, keeping both sides'], more: 0 },
    mainCommits,
    mainBy: 'lines',
  })
  const passed = (one: One, copy: Copy, mainCommits: string[] = []) =>
    step(one.id, 'resolution-checked', { commit: copy.commit, ok: true, ref: resolvedRefOf(one.id), places: [aPlace(one, copy, mainCommits)] })
  const passedSays = (copy: Copy, ref: string) =>
    `The merge tool's check passed the resolution, commit ${copy.commit.slice(0, 12)}, which resolves 1 place, and ${ref} holds it. The entry is pinned again, to be judged as the pin step judges. `
  function theHourOf(id: string) {
    const { since, timeZone } = stored(id)['resolving'] as { since: string; timeZone: string }
    const hour = theHourAfter(since, timeZone, 60)
    expect(hour.untilMs, `the hour of merge entry ${id} cannot be read`).not.toBeNull()
    return { since, timeZone, until: hour.until!, untilMs: hour.untilMs! }
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
    const registered = await call('POST', '/api/agents/started', asPerson, { handle: AUTHOR, name: 'Synthetic author whose entries conflict', workArea: ['work'] })
    expect(registered.status, registered.raw).toBe(201)
    ids[AUTHOR] = String(registered.body['agent'].id)
    const supervisor = await call('POST', '/api/agents/started', asPerson, { handle: SUPERVISOR, name: 'Synthetic supervisor whose entries conflict', workArea: ['work'], role: 'supervisor' })
    expect(supervisor.status, supervisor.raw).toBe(201)
    ids[SUPERVISOR] = String(supervisor.body['agent'].id)
  }, 60_000)
  // A CASE THAT FAILED HALF WAY DOES NOT HOLD THE LANE FOR THE NEXT ONE. A landing entry cannot be withdrawn, so main moves first.
  afterEach(async () => {
    vi.useRealTimers()
    const listed = await call('GET', `/api/merge-queue?lane=${encodeURIComponent(root)}`, asPerson)
    const holder = listed.body['lanes']?.[0]?.occupiedBy as { entry: string; state: string } | null | undefined
    if (holder === null || holder === undefined) return
    if (holder.state === 'landing') await step(holder.entry, 'main-moved', { mainAt: '0'.repeat(40) })
    await call('POST', `/api/merge-queue/${holder.entry}/withdraw`, asPerson, { because: 'Synthetic: the case is over, so the lane is freed.' })
  })
  afterAll(async () => { await app?.close(); t?.close(); for (const dir of made) rmSync(dir, { recursive: true, force: true }) })

  it('judges a released entry handed on at the pin once the check passed, and keeps each place with who landed main\'s side', async () => {
    const one = await anEntry({ released: true })
    await handedOnAtThePin(one, cannotJoin(one))
    const copy = await aHandOver(one, mainAt)
    heldAtTheRef(one, copy)
    const r = await passed(one, copy, [mainAt])
    expect(r.status, r.raw).toBe(200)
    const read = await entry(one.id)
    expect(read).toMatchObject({ state: 'judged', occupies: null, toolWanted: { since: expect.stringMatching(STAMP) } })
    expect(read.machine.judged).toEqual(contentOf(one.seal))
    // NO MERGE ENTRY LANDED THE BASELINE, so its commit is named with none.
    expect(read.machine.resolution.checked).toEqual({
      at: expect.stringMatching(STAMP),
      ref: resolvedRefOf(one.id),
      places: [{ ...aPlace(one, copy, []), mainCommits: [{ commit: mainAt, entry: null }] }],
    })
    expect(r.body.decided).toMatch(new RegExp(`^${passedSays(copy, resolvedRefOf(one.id)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.* The entry is judged: 1 path covered\\.$`))
  })

  it('leaves an entry nobody released in pinned, waiting for its release, whether the pin found the conflict by its lines or by the rebase tried early', async () => {
    const byTheRebase = (one: One) => ({
      files: contentOf(one.seal),
      rebaseStopped: { mainAt, files: [A], log: '/synthetic/early-trial/conflict.log', says: `git rebase ${mainAt.slice(0, 12)} stopped on a conflict it does not resolve in ${A}. Synthetic.` },
    })
    for (const facts of [cannotJoin, byTheRebase]) {
      const one = await anEntry({ released: false })
      await handedOnAtThePin(one, facts(one))
      const copy = await aHandOver(one, mainAt)
      heldAtTheRef(one, copy)
      const r = await passed(one, copy)
      expect(r.status, r.raw).toBe(200)
      const read = await entry(one.id)
      expect(read, facts.name).toMatchObject({ state: 'pinned', occupies: null, toolWanted: null })
      expect(read.waitsOn).toContain("inspector's release")
      expect(read.machine.judged).toBeUndefined()
      expect(read.machine.resolution.checked).toMatchObject({ ref: resolvedRefOf(one.id) })
      expect(r.body.decided.startsWith(passedSays(copy, resolvedRefOf(one.id)))).toBe(true)
      expect(r.body.decided.endsWith('The entry stays pinned.')).toBe(true)
    }
  })

  it('leaves an entry nobody released, handed on from pinned after another entry landed, in pinned, and names the entry that landed main\'s commit', async () => {
    const waiting = await anEntry({ released: false })
    const pinned = await step(waiting.id, 'pinned', { files: contentOf(waiting.seal) })
    expect(pinned.status, pinned.raw).toBe(200)
    expect(pinned.body.entry.state).toBe('pinned')
    const lander = await anEntry({ released: true })
    expect((await step(lander.id, 'pinned', { files: contentOf(lander.seal) })).body.entry.state).toBe('judged')
    for (const [name, facts] of [
      ['integrating', {}],
      ['integrated', { result: lander.seal.commit, mainAt, files: contentOf(lander.seal) }],
      ['tested', { green: true, log: '/synthetic/suite.log', ran: 1, passed: 1 }],
      ['landing', { mainAt }],
    ] as const) expect((await step(lander.id, name, facts)).status, name).toBe(200)
    const mainAfter = lander.seal.commit
    const landed = await withTheSetting(() => step(lander.id, 'landed', {
      mainAfter,
      earlyConflicts: [{ entry: waiting.id, tip: waiting.seal.commit, files: [A], commit: waiting.seal.commit, lines: [{ path: A, ranges: '1-5' }] }],
    }))
    expect(landed.status, landed.raw).toBe(200)
    expect(stored(waiting.id)['state']).toBe('resolving')

    const copy = await aHandOver(waiting, mainAfter, lander.dir)
    heldAtTheRef(waiting, copy)
    const r = await passed(waiting, copy, [mainAfter, mainAt])
    expect(r.status, r.raw).toBe(200)
    const read = await entry(waiting.id)
    expect(read).toMatchObject({ state: 'pinned', toolWanted: null })
    expect(read.waitsOn).toContain("inspector's release")
    expect(read.machine.resolution.checked.places[0].mainCommits).toEqual([{ commit: mainAfter, entry: lander.id }, { commit: mainAt, entry: null }])
  })

  it('hands a conflict on only where the pin would have pinned the entry: other content is refused and an incomplete report bounces', async () => {
    const differs = await anEntry({ released: true })
    const before = stored(differs.id)
    const refused = await withTheSetting(() => step(differs.id, 'pinned', { ...cannotJoin(differs), files: { ...contentOf(differs.seal), [A]: 'f'.repeat(64) } }))
    expect(refused.status, refused.raw).toBe(422)
    expect(refused.body.error).toContain(`The pinned content is not what merge entry ${differs.id} was submitted on`)
    expect(stored(differs.id)).toEqual(before)

    const unreported = await anEntry({ released: false, report: false })
    const bounced = await withTheSetting(() => step(unreported.id, 'pinned', cannotJoin(unreported)))
    expect(bounced.status, bounced.raw).toBe(200)
    const read = await entry(unreported.id)
    expect(read).toMatchObject({ state: 'bounced', occupies: null, toolWanted: null })
    expect(read.machine.bounced).toMatchObject({ reason: 'incomplete' })
    expect(read.machine.resolving).toBeUndefined()
  })

  it('keeps a refused resolution resolving without the mark, refuses a second answer on it, and asks for the check again at the next hand-over', async () => {
    const one = await anEntry({ released: true })
    await handedOnAtThePin(one, cannotJoin(one))
    const first = await aHandOver(one, mainAt)
    const handedAt = (stored(one.id)['resolution'] as { at: string }).at
    const says = 'Synthetic: the resolution changed a line outside the places git left in conflict.'
    const r = await step(one.id, 'resolution-checked', { commit: first.commit, ok: false, says })
    expect(r.status, r.raw).toBe(200)
    expect(r.body.decided).toBe(
      `The merge tool's check refused the resolution, commit ${first.commit.slice(0, 12)}, handed over at ${handedAt}: ${says} The entry stays resolving. ` +
        `Its own supervisor may hand over another resolution until its 60 minutes end at ${theHourOf(one.id).until}.`,
    )
    const read = await entry(one.id)
    expect(read).toMatchObject({ state: 'resolving', toolWanted: null })
    // NOBODY HOLDS THE SECRETARY CARD HERE AND NO AGENT WAS ASKED, so the refusal says why no message went
    // (tests/a-refused-resolution-is-told-at-once.test.ts proves the message).
    expect(read.machine.resolution.refused).toEqual({ at: expect.stringMatching(STAMP), says, noMessage: expect.any(String) })

    const before = stored(one.id)
    const again = await step(one.id, 'resolution-checked', { commit: first.commit, ok: false, says })
    expect(again.status, again.raw).toBe(409)
    expect(again.body.error).toBe(`Merge entry ${one.id} holds no resolution that waits for its check: the check already refused commit ${first.commit.slice(0, 12)} at ${read.machine.resolution.refused.at}. Nothing was written.`)
    expect(stored(one.id)).toEqual(before)

    const second = await aHandOver(one, mainAt, one.dir, 'before\nresolved again, keeping both sides\n')
    const after = await entry(one.id)
    expect(after).toMatchObject({ state: 'resolving', toolWanted: { since: expect.stringMatching(STAMP) } })
    expect(after.machine.resolution.commit).toBe(second.commit)
    expect(Object.keys(stored(one.id)['resolution'] as object)).not.toContain('refused')
  })

  it('writes nothing for a check of another commit, of another ref, or of a ref that does not hold the commit', async () => {
    const one = await anEntry({ released: true })
    await handedOnAtThePin(one, cannotJoin(one))
    const copy = await aHandOver(one, mainAt)
    const handedAt = (stored(one.id)['resolution'] as { at: string }).at
    const ref = resolvedRefOf(one.id)
    const pass = { commit: copy.commit, ok: true, ref, places: [aPlace(one, copy, [])] }
    async function refusedWith(facts: Record<string, unknown>, status: number, error: string | RegExp) {
      const before = stored(one.id)
      const r = await step(one.id, 'resolution-checked', facts)
      expect(r.status, r.raw).toBe(status)
      if (typeof error === 'string') expect(r.body.error).toBe(error)
      else expect(r.body.error).toMatch(error)
      expect(stored(one.id)).toEqual(before)
    }
    await refusedWith({ ...pass, commit: mainAt }, 409, `The check was of commit ${mainAt}, and merge entry ${one.id} holds the resolution commit ${copy.commit}, handed over at ${handedAt}: a later hand-over replaced the one checked. Nothing was written.`)
    await refusedWith({ ...pass, ref: `refs/mole-office/queue/${one.id}` }, 422, `The check names the ref refs/mole-office/queue/${one.id}, and a resolution the check passed is held at ${ref}. Nothing was written.`)
    await refusedWith(pass, 409, new RegExp(`^The office could not read ${ref} in ${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: .+ Nothing was written\\.$`, 's'))
    git(root, 'update-ref', ref, mainAt)
    await refusedWith(pass, 409, `${ref} in ${root} points at ${mainAt}, not at the resolution's commit ${copy.commit}. Nothing was written.`)
    expect(stored(one.id)['state']).toBe('resolving')
  })

  it('counts a pass that comes after the hour, and says of a refusal then that no other resolution can be handed over', async () => {
    const late = await anEntry({ released: true })
    await handedOnAtThePin(late, cannotJoin(late))
    const copy = await aHandOver(late, mainAt)
    heldAtTheRef(late, copy)
    const refusedLate = await anEntry({ released: true })
    await handedOnAtThePin(refusedLate, cannotJoin(refusedLate))
    const refusedCopy = await aHandOver(refusedLate, mainAt)
    const hour = theHourOf(refusedLate.id)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Math.max(hour.untilMs, theHourOf(late.id).untilMs) + 60_000)
    const r = await passed(late, copy)
    expect(r.status, r.raw).toBe(200)
    expect(r.body.entry.state).toBe('judged')
    const refused = await step(refusedLate.id, 'resolution-checked', { commit: refusedCopy.commit, ok: false, says: 'Synthetic: refused.' })
    expect(refused.status, refused.raw).toBe(200)
    expect(refused.body.decided.endsWith(`Its 60 minutes ended at ${hour.until}, so no other resolution can be handed over, and it bounces as "could not be read".`)).toBe(true)
  })

  it('asks for the check again after a run that gave no result, and at the limit writes the resolution as refused, in resolving', async () => {
    const one = await anEntry({ released: true })
    await handedOnAtThePin(one, cannotJoin(one))
    await aHandOver(one, mainAt)
    /** One tool run through the tool doors, as the worker records it: the start, then the ending with these words. */
    async function aRunThatEnds(reason: string): Promise<Record<string, any>> {
      const session = t.api.createRecord({ kind: 'session', title: 'Synthetic merge tool run', workspaceId: 'default', actor: { type: 'agent', id: 'mole-office/the-message-worker' }, origin: 'fixture', data: { state: 'running', runtime: 'merge-tool' } }).id
      const started = await call('POST', `/api/merge-queue/${one.id}/tool-started`, asTheOffice, { session, log: '/synthetic/the-merger.log' })
      expect(started.status, started.raw).toBe(200)
      expect(started.body['entry'].toolWanted).toBeNull()
      const ended = await call('POST', `/api/merge-queue/${one.id}/tool-ended`, asTheOffice, { session, reason })
      expect(ended.status, ended.raw).toBe(200)
      return ended.body
    }
    for (let run = 1; run < MAX_TOOL_RUNS_IN_ONE_PLACE; run += 1) {
      const ended = await aRunThatEnds(`Synthetic check run ${String(run)} crashed.`)
      expect(ended['entry']).toMatchObject({ state: 'resolving', toolWanted: { since: expect.stringMatching(STAMP) } })
      expect(ended['entry'].machine.stalls).toMatchObject({ runs: run })
      expect(ended['says']).toContain('so the office asks for its merge tool again')
    }
    const last = await aRunThatEnds('Synthetic: the last check run crashed too.')
    expect(last['entry']).toMatchObject({ state: 'resolving', toolWanted: null })
    expect(last['says']).toContain(`so the office stopped asking for its merge tool and wrote the resolution as refused. The merge tool's check of a resolution ended ${String(MAX_TOOL_RUNS_IN_ONE_PLACE)} times without a result. The last run said: Synthetic: the last check run crashed too.`)
    // THE REFUSAL KEEPS THE STATE MACHINE'S WORDS, which the door's answer says after the run's own ending.
    const refused = last['entry'].machine.resolution.refused as { at: string; says: string }
    expect(refused.at).toMatch(STAMP)
    expect(refused.says.startsWith('The entry is ')).toBe(true)
    expect(last['says'].endsWith(refused.says)).toBe(true)
    expect(last['entry'].machine.stalls).toMatchObject({ runs: MAX_TOOL_RUNS_IN_ONE_PLACE })
    // NOTHING WAITS FOR THE CHECK NOW, so a further run asks for nothing.
    const after = await aRunThatEnds('Synthetic: a run with nothing to check.')
    expect(after['entry']).toMatchObject({ state: 'resolving', toolWanted: null })
    expect(after['says']).toContain('and it waits on')
  })

  it("refuses, in the entry's reader, the tool's mark on a resolving entry whose resolution waits for nothing", async () => {
    const one = await anEntry({ released: true })
    await handedOnAtThePin(one, cannotJoin(one))
    const copy = await aHandOver(one, mainAt)
    expect((await step(one.id, 'resolution-checked', { commit: copy.commit, ok: false, says: 'Synthetic: refused.' })).status).toBe(200)
    const sound = stored(one.id)
    rawData(one.id, { ...sound, toolWanted: { since: '2026-10-17 06:00:00' } })
    try {
      const read = await call('GET', `/api/merge-queue/${one.id}`, asPerson)
      expect(read.status, read.raw).toBe(500)
    } finally { rawData(one.id, sound) }
    await entry(one.id)
  })

  it('sends a conflict met after a pass back to its supervisor in the hour of the first conflict, which is never started again', async () => {
    const elsewhere = 'd4'.repeat(20)
    const B = 'work/b.txt'
    /** A released entry of `servedBy` handed on at the pin, resolved, passed, judged and integrating. */
    async function integratingAfterAPass(servedBy?: string): Promise<{ one: One; copy: Copy; hour: ReturnType<typeof theHourOf> }> {
      const one = await anEntry({ released: true, servedBy })
      await handedOnAtThePin(one, cannotJoin(one))
      const hour = theHourOf(one.id)
      const copy = await aHandOver(one, mainAt)
      heldAtTheRef(one, copy)
      expect((await passed(one, copy)).body.entry.state).toBe('judged')
      const integrating = await step(one.id, 'integrating', {})
      expect(integrating.status, integrating.raw).toBe(200)
      return { one, copy, hour }
    }
    const metAgain = (copy: Copy, met: string) => `Conflict in ${met}. The resolution its check passed, commit ${copy.commit.slice(0, 12)}, met this conflict, so it goes back to its own supervisor in the 60 minutes of its first conflict, which are never started again: `
    const askedOf = (id: string) => (stored(id)['resolving'] as { asked: { message?: string; round?: { said: string } } }).asked
    /**
     * A SANDBOX OF `handle`: its folder, the container row that vouches for it, and the agent's run started in it. The
     * run names its runtime and model, as a launcher's run does, because the next-round door refuses at the ask a round
     * whose start could not continue the run.
     */
    function aSandbox(handle: string): { folder: string; run: string } {
      const folder = realpathSync(mkdtempSync(join(tmpdir(), 'checked-resolutions-sandbox-')))
      made.push(folder)
      for (const one of ['briefs', 'worktrees', 'repo']) mkdirSync(join(folder, one))
      const container = `row-${randomBytes(5).toString('hex')}`
      t.client.sqlite
        .prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-10-17 07:00:00', 'agent:fixture')")
        .run(container, `mole-office-sandbox-${basename(folder)}`, `Sandbox ${basename(folder)}, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`)
      const run = t.api.createRecord({
        kind: 'session',
        title: `Synthetic round of ${handle} in its sandbox`,
        workspaceId: 'default',
        actor: person,
        origin: 'fixture',
        data: { state: 'running', servingAgent: handle, servingAgentId: ids[handle], runtime: 'claude-code', model: 'claude-made-up-resolve-0', workingDirectory: join(folder, 'repo'), cutFrom: 'main', sandbox: { template: 'mole-office-dev', container, folder } },
      }).id
      return { folder, run }
    }

    // THE ENTRY'S OWN SUPERVISOR had no sandbox at the first conflict, so no brief was written then. It has one now.
    const inside = await integratingAfterAPass(SUPERVISOR)
    const first = askedOf(inside.one.id)
    expect(first).toEqual({ agent: ids[SUPERVISOR], noBrief: `${SUPERVISOR} has no run in this project that was started in a sandbox, so there is no sandbox folder to write the brief into. No brief was written.`, message: expect.any(String) })
    const { folder, run } = aSandbox(SUPERVISOR)
    const r = await withTheSetting(() => step(inside.one.id, 'conflict', { files: [B], mainAt: elsewhere }))
    expect(r.status, r.raw).toBe(200)
    const brief = join(folder, 'briefs', `resolve-${inside.one.id}.md`)
    const second = askedOf(inside.one.id)
    expect(r.body.decided).toBe(
      `${metAgain(inside.copy, B)}it ends at ${inside.hour.until}. The files to resolve are ${A}, ${B}, the earlier ones included, because the check replays the entry's own commit again. ` +
        `The office wrote the resolve brief at ${brief}. It asked in message ${second.message}. It asked for the round itself, and the door answered: ${second.round?.said}`,
    )
    const held = stored(inside.one.id)
    expect(held['state']).toBe('resolving')
    expect(held['resolution']).toBeUndefined()
    expect(held['toolWanted']).toBeUndefined()
    // WAY (3): THE EARLIER FILES AND THE NEW ONE, and the resolution that met the conflict kept as a help. Whom the office
    // asked is this hand-over's alone: nothing of the first asking is left in it.
    expect(held['resolving']).toEqual({
      files: [A, B],
      mainAt: elsewhere,
      says: `It could not be put on top of the main world: a conflict the tool does not resolve. Files: ${B}.`,
      since: inside.hour.since,
      timeZone: inside.hour.timeZone,
      minutes: 60,
      resolvedBefore: { files: [A], commit: inside.copy.commit, mainAt },
      asked: { agent: ids[SUPERVISOR], brief, message: expect.any(String), round: { at: expect.any(String), status: 202, said: expect.any(String), run } },
    })
    expect(askingAbout(inside.one.run)).toEqual([first.message, second.message])
    // THE BRIEF NAMES THE HELP, and its clean copy replays the entry's own commit onto the main this conflict met, for both files.
    const text = readFileSync(brief, 'utf8')
    expect(text).toContain(`- The files to resolve: ${A}, ${B}\n`)
    expect(text).toContain(
      `## What was resolved before\n\nA resolution of ${A}, commit ${inside.copy.commit}, passed the merge tool's check against main ${mainAt}, and then met main moving. ` +
        `${root} still holds it at ${resolvedRefOf(inside.one.id)}. You may reuse what it did with those files. It is a help, not the entry's side: the clean copy below replays the entry's own commit again, ` +
        'and the check judges every file above again, in full, against the main this conflict met.\n',
    )
    expect(text).toContain(`--ref ${pinnedRefOf(inside.one.id)} --commit ${inside.one.seal.commit} --main-at ${elsewhere} --files ${A},${B} --into ${join(folder, 'worktrees', `resolve-${inside.one.id}`)}\n`)
    const message = t.api.getRecord(second.message!)!
    expect(message.data['askedToResolve']).toEqual({ entry: inside.one.id, files: [A, B], brief, agent: ids[SUPERVISOR], until: new Date(inside.hour.untilMs).toISOString() })
    expect(String(message.data['body'])).toContain(`\n${A} was resolved before, in commit ${inside.copy.commit}, which ${resolvedRefOf(inside.one.id)} still holds as a help; it is resolved and judged again.\n`)

    // AFTER THE HOUR NOBODY IS ASKED, and the first asking's message is not kept as if it were this one's.
    const late = await integratingAfterAPass()
    const firstLate = askedOf(late.one.id).message
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(late.hour.untilMs + 60_000)
    const lateR = await withTheSetting(() => step(late.one.id, 'conflict', { files: [A], mainAt: elsewhere }))
    expect(lateR.status, lateR.raw).toBe(200)
    expect(lateR.body.decided).toBe(`${metAgain(late.copy, A)}it ended at ${late.hour.until}, so the entry bounces as "the hour ran out".`)
    const lateWords = `The 60 minutes ended at ${late.hour.until}, before this conflict was met, so nobody is asked to resolve it.`
    expect(askedOf(late.one.id)).toEqual({ noBrief: lateWords, noMessage: lateWords })
    expect(askingAbout(late.one.run)).toEqual([firstLate])
    const listed = await call('GET', '/api/worker/merges', asTheOffice)
    expect(listed.status, listed.raw).toBe(200)
    expect(listed.body['hourOver']).toContainEqual({ entry: late.one.id, until: late.hour.until, resolution: 'the hour ran out' })
  })

  describe('the scoped check of a checked resolution, before the suite', () => {
    const B = 'work/b.txt'
    const INSPECTOR = { kind: 'agent', id: 'synthetic-inspector' } as const
    interface Integrated { clone: string; result: string; files: Record<string, string> }
    /** The hash the seal and the integrate step hold: sha256 of the blob's bytes at the tree's HEAD. */
    const hashAt = (dir: string, path: string) => createHash('sha256').update(execFileSync('git', ['-C', dir, 'cat-file', 'blob', `HEAD:${path}`])).digest('hex')
    /**
     * THE INTEGRATED TREE AS THE ENTRY'S TURN LEAVES IT: a clone of the lane's repository at the resolution held at the
     * ref, which stands on main, and `more` committed on top when a case needs a path the integration changed that no
     * conflict touched. Its files are every path it changes on main, as the integrate step reports them.
     */
    function integratedAt(one: One, copy: Copy, more?: { path: string; text: string }): Integrated {
      const clone = scratch('integrated')
      git(clone, 'clone', '-q', root, '.'); asTheFixture(clone)
      git(clone, 'fetch', '-q', 'origin', resolvedRefOf(one.id))
      git(clone, 'switch', '-q', '--detach', copy.commit)
      if (more !== undefined) { writeFileSync(join(clone, more.path), more.text); git(clone, 'add', '.'); git(clone, 'commit', '-q', '-m', 'Synthetic: a path no conflict touched') }
      const changed = git(clone, 'diff', '--name-only', mainAt, 'HEAD').split('\n').filter((one) => one !== '')
      return { clone, result: git(clone, 'rev-parse', 'HEAD'), files: Object.fromEntries(changed.map((path) => [path, hashAt(clone, path)])) }
    }
    /** A released entry handed on at the pin, resolved by `content` in `path`, passed, judged and integrating. */
    async function integratingAfterAPass(content?: (one: One) => string, path = A): Promise<{ one: One; copy: Copy }> {
      const one = await anEntry({ released: true })
      await handedOnAtThePin(one, cannotJoin(one))
      const copy = await aHandOver(one, mainAt, one.dir, content?.(one), path)
      heldAtTheRef(one, copy)
      expect((await passed(one, copy, [mainAt])).body.entry.state).toBe('judged')
      const integrating = await step(one.id, 'integrating', {})
      expect(integrating.status, integrating.raw).toBe(200)
      return { one, copy }
    }
    const integrated = (one: One, at: Integrated) => step(one.id, 'integrated', { result: at.result, mainAt, clone: at.clone, files: at.files })
    /**
     * THE SCOPED CHECK'S VERDICT, written on the check-again run as the check door writes it, and the queue told as the
     * check door tells it. The verdict is the fixture's own and synthetic.
     */
    async function theScopedCheck(asked: { run: string; only: string[] }, at: Integrated, verdict: 'released' | 'refused') {
      const sealId = t.api.getRecord(asked.run)!.data['sealedTip'] as string
      const sealHash = (t.api.getRecord(sealId)!.data['seal'] as { hash: string }).hash
      const read = { sealId, sealHash, worktree: at.clone, tip: at.result, ofItsOwn: true, only: asked.only, says: 'Synthetic scoped check fixture.' }
      writeAVerdictAsItsDoorWould(t, asked.run, verdict === 'released'
        ? { released: { by: INSPECTOR, at: '2026-10-17 08:00:00', how: 'an inspector', check: 'synthetic-check', read } }
        : { refused: { by: INSPECTOR, at: '2026-10-17 08:00:00', missing: ['Synthetic: keeping both lines changes what the entry meant in place 1.'], check: 'synthetic-check', read } })
      const { theMergeQueueHearsAVerdict } = await import('../src/server/lib/merge-state-machine.ts')
      return theMergeQueueHearsAVerdict({ runId: asked.run, workspaceId: 'default', actor: { type: 'agent', id: INSPECTOR.id } })
    }
    const indented = (lines: string[]) => lines.map((line) => `    ${line}`).join('\n')
    /** The one needs-judgment item for work/a.txt, with the one place `passed` reports and the five things the inspector reads. */
    const theItemFor = (one: One, copy: Copy) => ({
      path: A,
      why: [
        `Merge entry ${one.id} met a conflict in this file, and its own supervisor resolved it by hand. The merge tool's check found that the resolution changes nothing outside the places git left in conflict. ` +
          'It cannot tell whether what the resolution put inside each place keeps what both sides meant: that is the judgment asked here. If keeping both sides changes what one side meant, refuse, and name the place.',
        `Place 1 of 1, from line 1 of the conflicted file: the conflict met the entry's commit ${one.seal.commit.slice(0, 12)}, and commit ${copy.commit.slice(0, 12)} resolved it.`,
        `The ancestor's lines:\n${indented(['before'])}`,
        `Main's side:\n${indented(['before'])}\nMain's commits that wrote these lines: ${mainAt.slice(0, 12)}, which no merge entry landed.`,
        `The entry's side:\n${indented(['before', `after, from ${basename(one.dir)}`])}`,
        `The resolution:\n${indented(['before', 'resolved, keeping both sides'])}`,
        "Related tests, the supervisor's own run, as declared: none was declared with this hand-over.",
      ].join('\n\n'),
    })
    const byHand = `The supervisor resolved ${A} by hand, so it is in the scoped check whatever content the verdict read: a hand-over reaches the suite only after one.`

    it('asks a scoped check of each resolved file before the suite, even where the integrated content is what the verdict read, and an entry with no resolution goes straight to testing', async () => {
      // AN ENTRY WITH NO RESOLUTION, integrated with the content its verdict read, needs no check again.
      const plain = await anEntry({ released: true })
      expect((await step(plain.id, 'pinned', { files: contentOf(plain.seal) })).body.entry.state).toBe('judged')
      expect((await step(plain.id, 'integrating', {})).status).toBe(200)
      const straight = await step(plain.id, 'integrated', { result: plain.seal.commit, mainAt, files: contentOf(plain.seal) })
      expect(straight.status, straight.raw).toBe(200)
      expect(straight.body.entry.state).toBe('testing')
      expect((await call('POST', `/api/merge-queue/${plain.id}/withdraw`, asPerson, { because: 'Synthetic: the control is over, so the lane is freed.' })).status).toBe(200)

      // A RESOLUTION THAT KEPT THE ENTRY'S OWN CONTENT leaves the file as the verdict read it, and is judged all the same.
      const { one, copy } = await integratingAfterAPass((entry) => `before\nafter, from ${basename(entry.dir)}\n`)
      const at = integratedAt(one, copy)
      expect(at.files).toEqual({ [A]: contentOf(one.seal)[A] })
      const r = await integrated(one, at)
      expect(r.status, r.raw).toBe(200)
      expect(r.body.entry.state).toBe('reinspecting')
      expect(r.body.decided).toContain(`0 paths keep the verdict, and 1 path needs judging again (${A}). ${byHand}`)
      const asked = r.body.entry.machine.reinspection
      expect(asked.only).toEqual([A])
      expect(asked.needsJudgment).toEqual([theItemFor(one, copy)])
      expect(t.api.getRecord(asked.run)!.data['workingDirectory']).toBe(at.clone)
      // AND THE INSPECTOR IS ASKED THAT QUESTION: the prompt's section of handed-on paths says what a resolved file asks.
      const { theNeedsJudgmentSection } = await import('../src/server/lib/inspection.ts')
      const section = theNeedsJudgmentSection(asked.needsJudgment.map((item: { path: string; why: string }) => ({ ...item, changes: 'a synthetic diff' })), { workArea: ['work'], inside: [], outside: [], says: '' })
      expect(section).toContain('For a file whose conflict its supervisor resolved by hand, decide whether the resolution keeps what both sides meant. If it does not, refuse and name the path and the place in `missing`.')
      expect(section).toContain(`### ${A}\n\n${WHY_THE_TOOL_COULD_NOT_DECIDE_IT} ${theItemFor(one, copy).why}\n\na synthetic diff`)
      expect(section).not.toContain('Each is a protected path')
    })

    it('sends a hand-over to testing once its scoped check released, asks again at the next integration, and bounces it as "not green" when the suite is red', async () => {
      const { one, copy } = await integratingAfterAPass()
      const at = integratedAt(one, copy)
      const r = await integrated(one, at)
      expect(r.status, r.raw).toBe(200)
      expect(r.body.decided).toContain(byHand)
      const asked = r.body.entry.machine.reinspection
      expect(asked.needsJudgment).toEqual([theItemFor(one, copy)])
      const heard = await theScopedCheck(asked, at, 'released')
      expect(heard.moved).toEqual([{ entry: one.id, state: 'testing', says: expect.stringContaining('every path') }])
      const testing = await entry(one.id)
      expect(testing.machine.handedOn).toEqual({ [A]: at.files[A] })
      // MAIN MOVES WHILE IT IS TESTED, and the next integration asks about the resolved file again at the content that
      // release read: what `handedOn` holds does not say which question the release that wrote it answered.
      const moved = await step(one.id, 'main-moved-while-testing', { mainAt: '1'.repeat(40) })
      expect(moved.status, moved.raw).toBe(200)
      expect(moved.body.entry.state).toBe('judged')
      expect((await step(one.id, 'integrating', {})).status).toBe(200)
      const again = await integrated(one, at)
      expect(again.status, again.raw).toBe(200)
      expect(again.body.entry.state).toBe('reinspecting')
      const askedAgain = again.body.entry.machine.reinspection
      expect(askedAgain.only).toEqual([A])
      expect(askedAgain.needsJudgment).toEqual([theItemFor(one, copy)])
      expect((await theScopedCheck(askedAgain, at, 'released')).moved).toEqual([{ entry: one.id, state: 'testing', says: expect.stringContaining('every path') }])
      const red = await step(one.id, 'tested', { green: false, log: '/synthetic/suite.log', redTests: ['tests/synthetic.test.ts'], ran: 1, passed: 0 })
      expect(red.status, red.raw).toBe(200)
      const read = await entry(one.id)
      expect(read).toMatchObject({ state: 'bounced', occupies: null })
      expect(read.machine.bounced).toMatchObject({ reason: 'red', redTests: ['tests/synthetic.test.ts'], resolution: 'not green' })
    })

    it('bounces a refused hand-over as "changes what one side meant" when its check was asked only about resolved files, and with no word when it was asked about other paths too', async () => {
      const only = await integratingAfterAPass()
      const at = integratedAt(only.one, only.copy)
      const asked = (await integrated(only.one, at)).body.entry.machine.reinspection
      expect(asked.only).toEqual([A])
      const heard = await theScopedCheck(asked, at, 'refused')
      expect(heard.moved).toEqual([{ entry: only.one.id, state: 'bounced', says: expect.any(String) }])
      const bounced = (await entry(only.one.id)).machine.bounced
      expect(bounced).toMatchObject({ reason: 'refused', files: [A], mainAt, resolution: 'changes what one side meant' })
      expect(bounced.says).toContain(`The scoped check was asked only about the files its supervisor resolved by hand, so its refusal is read as "changes what one side meant".`)

      const more = await integratingAfterAPass()
      const atMore = integratedAt(more.one, more.copy, { path: B, text: 'Synthetic: changed by no conflict.\n' })
      const askedMore = (await integrated(more.one, atMore)).body.entry.machine.reinspection
      expect(askedMore.only).toEqual([A, B])
      expect(askedMore.needsJudgment).toEqual([theItemFor(more.one, more.copy)])
      await theScopedCheck(askedMore, atMore, 'refused')
      const bouncedMore = (await entry(more.one.id)).machine.bounced
      expect(bouncedMore).toMatchObject({ reason: 'refused', files: [A, B] })
      expect(bouncedMore.resolution).toBeUndefined()
      expect(bouncedMore.says).toContain(`The scoped check was also asked about ${B}, which no conflict touched, so its refusal is not read as one about the resolution alone, and no resolution word is written.`)
    })

    it('asks about every further file place and counts the file as resolved by hand when its scoped check refuses', async () => {
      const one = await anEntry({ released: true })
      await handedOnAtThePin(one, cannotJoin(one))
      const folder = scratch('later-stop-copy')
      git(folder, 'clone', '-q', one.dir, '.'); asTheFixture(folder)
      git(folder, 'switch', '-q', '--detach', mainAt)
      writeFileSync(join(folder, A), 'before\nresolved, keeping both sides\n')
      writeFileSync(join(folder, B), 'Synthetic: further file, keeping both sides.\n')
      git(folder, 'add', '.'); git(folder, 'commit', '-q', '-m', 'Synthetic resolution of both stops')
      const copy = { folder, commit: git(folder, 'rev-parse', 'HEAD') }
      const handed = await call('POST', `/api/merge-queue/${one.id}/resolution`, asPerson, { workingDirectory: folder })
      expect(handed.status, handed.raw).toBe(200)
      heldAtTheRef(one, copy)
      const further = [3, 9].map((at) => ({
        ...aPlace(one, copy, [mainAt]), path: B, at,
        ancestor: { lines: [`Synthetic ancestor at ${String(at)}`], more: 0 },
        main: { lines: [`Synthetic main at ${String(at)}`], more: 0 },
        entry: { lines: [`Synthetic entry at ${String(at)}`], more: 0 },
        resolution: { lines: [`Synthetic both at ${String(at)}`], more: 0 },
      }))
      const checked = await step(one.id, 'resolution-checked', {
        commit: copy.commit, ok: true, ref: resolvedRefOf(one.id), places: [aPlace(one, copy, [mainAt]), ...further],
      })
      expect(checked.status, checked.raw).toBe(200)
      expect(checked.body.entry.state).toBe('judged')
      expect(stored(one.id)['resolving']).toMatchObject({ files: [A] })
      expect((await step(one.id, 'integrating', {})).status).toBe(200)
      const at = integratedAt(one, copy)
      const r = await integrated(one, at)
      expect(r.status, r.raw).toBe(200)
      expect(r.body.entry.state).toBe('reinspecting')
      const asked = r.body.entry.machine.reinspection
      expect(asked.only).toEqual([A, B])
      expect(asked.needsJudgment.map((item: { path: string }) => item.path)).toEqual([A, B])
      expect(asked.needsJudgment[0]).toEqual(theItemFor(one, copy))
      const why = asked.needsJudgment[1].why as string
      for (const [n, place] of further.entries()) {
        expect(why).toContain(`Place ${String(n + 1)} of 2, from line ${String(place.at)} of the conflicted file:`)
        for (const side of [place.ancestor, place.main, place.entry, place.resolution]) expect(why).toContain(indented(side.lines))
      }
      expect(why).not.toContain('The check listed no place in this file.')
      expect(why).toContain('Main\'s commits that wrote these lines:')
      expect(why).toContain("Related tests, the supervisor's own run, as declared: none was declared with this hand-over.")
      await theScopedCheck(asked, at, 'refused')
      const bounced = (await entry(one.id)).machine.bounced
      expect(bounced).toMatchObject({ reason: 'refused', files: [A, B], resolution: 'changes what one side meant' })
      expect(bounced.says).toContain('The scoped check was asked only about the files its supervisor resolved by hand, so its refusal is read as "changes what one side meant".')
    })

    it("sets out a place whose entry's commit git dropped, when the resolution took main's side, and names no commit of the resolution for it", async () => {
      const one = await anEntry({ released: true })
      await handedOnAtThePin(one, cannotJoin(one))
      const copy = await aHandOver(one, mainAt)
      heldAtTheRef(one, copy)
      // THE CHECK FOUND NO COMMIT OF THE RESOLUTION FOR THIS STOP: main's side left the entry's commit with no change, and
      // git dropped it. A later commit of the entry changed the file, so the integrated tree changes it on main.
      const dropped = { ...aPlace(one, copy, [mainAt]), resolvedIn: null, resolution: { lines: ['before'], more: 0 } }
      const checked = await step(one.id, 'resolution-checked', { commit: copy.commit, ok: true, ref: resolvedRefOf(one.id), places: [dropped] })
      expect(checked.status, checked.raw).toBe(200)
      expect(checked.body.entry.state).toBe('judged')
      expect((await step(one.id, 'integrating', {})).status).toBe(200)
      const r = await integrated(one, integratedAt(one, copy))
      expect(r.status, r.raw).toBe(200)
      const parts = theItemFor(one, copy).why.split('\n\n')
      expect(r.body.entry.machine.reinspection.needsJudgment).toEqual([{
        path: A,
        why: [
          parts[0],
          `Place 1 of 1, from line 1 of the conflicted file: the conflict met the entry's commit ${one.seal.commit.slice(0, 12)}, and no commit of the resolution resolved it. ` +
            'The resolution took main\'s side, which left that commit with no change, so git dropped it.',
          ...parts.slice(2, 5),
          `The resolution:\n${indented(['before'])}`,
          parts.at(-1),
        ].join('\n\n'),
      }])
    })

    it("lets a resolved file the integrated tree leaves as main has it land as main's own, and asks the scoped check about what the resolution changed", async () => {
      // THE RESOLUTION TAKES MAIN'S SIDE WHOLE IN work/a.txt, the file in conflict, and changes work/b.txt, which no
      // conflict touched. Until problem PRHvQV6YyGQ1 the entry bounced as unjudged here, because no scoped check can be
      // asked about a path the integrated tree does not change.
      const { one, copy } = await integratingAfterAPass(() => 'Synthetic: the resolution changed this file and left work/a.txt as main has it.\n', B)
      const at = integratedAt(one, copy)
      expect(Object.keys(at.files)).toEqual([B])
      const r = await integrated(one, at)
      expect(r.status, r.raw).toBe(200)
      expect(r.body.entry.state).toBe('reinspecting')
      expect(r.body.entry.machine.bounced ?? null).toBeNull()
      const asked = r.body.entry.machine.reinspection
      expect(asked.only).toEqual([B])
      expect(asked.needsJudgment.map((item: { path: string }) => item.path)).not.toContain(A)
      expect(r.body.decided).toContain(`The resolution its check passed, commit ${copy.commit.slice(0, 12)}, leaves ${A} as main has it, so it lands as main's own and no scoped check is asked about it. `)
      expect(r.body.decided).not.toContain(byHand)
      // A REFUSAL OF THAT CHECK was asked about no file its supervisor resolved, so it carries no resolution word and does
      // not say the check was asked about other paths "also".
      await theScopedCheck(asked, at, 'refused')
      const bounced = (await entry(one.id)).machine.bounced
      expect(bounced).toMatchObject({ reason: 'refused', files: [B], mainAt })
      expect(bounced.resolution).toBeUndefined()
      expect(bounced.says).not.toContain('also asked')
      expect(bounced.says).not.toContain('changes what one side meant')
    })

    it('says in the item of a file resolved before that it is judged again in full, and not in the item of a file met only at the later conflict', async () => {
      const { one, copy } = await integratingAfterAPass()
      // A SECOND CONFLICT AT THE SAME MAIN, in work/b.txt: both files are to be resolved, and the first resolution is a help.
      const again = await withTheSetting(() => step(one.id, 'conflict', { files: [B], mainAt }))
      expect(again.status, again.raw).toBe(200)
      expect(stored(one.id)['resolving']).toMatchObject({ files: [A, B], resolvedBefore: { files: [A], commit: copy.commit, mainAt } })
      // THE SECOND HAND-OVER resolves both files in one commit on main.
      const folder = scratch('clean-copy')
      git(folder, 'clone', '-q', one.dir, '.'); asTheFixture(folder)
      git(folder, 'switch', '-q', '--detach', mainAt)
      writeFileSync(join(folder, A), 'before\nresolved, keeping both sides\n'); writeFileSync(join(folder, B), 'Synthetic: resolved at the second hand-over.\n')
      git(folder, 'add', '.'); git(folder, 'commit', '-q', '-m', 'Synthetic resolution of both files')
      const both = { folder, commit: git(folder, 'rev-parse', 'HEAD') }
      const handed = await call('POST', `/api/merge-queue/${one.id}/resolution`, asPerson, { workingDirectory: folder })
      expect(handed.status, handed.raw).toBe(200)
      heldAtTheRef(one, both)
      expect((await passed(one, both, [mainAt])).body.entry.state).toBe('judged')
      expect((await step(one.id, 'integrating', {})).status).toBe(200)
      const at = integratedAt(one, both)
      expect(Object.keys(at.files).sort()).toEqual([A, B])
      const r = await integrated(one, at)
      expect(r.status, r.raw).toBe(200)
      const asked = r.body.entry.machine.reinspection
      expect(asked.only).toEqual([A, B])
      const [opening, ...rest] = theItemFor(one, both).why.split('\n\n')
      const resolvedBefore =
        `This file was resolved before, in commit ${copy.commit.slice(0, 12)} against main ${mainAt.slice(0, 12)}, which the merge tool's check passed and which then met main moving. ` +
        'Its supervisor may have reused that resolution here. It is judged again, in full: no earlier judgment of it stands in for this one.'
      expect(asked.needsJudgment).toEqual([
        { path: A, why: [opening, resolvedBefore, ...rest].join('\n\n') },
        { path: B, why: [opening, 'The check listed no place in this file.', rest.at(-1)].join('\n\n') },
      ])
    })

    it("sets out in the item the supervisor's own run of the related tests as it declared it, a failure included, and the entry is judged all the same", async () => {
      const one = await anEntry({ released: true, servedBy: SUPERVISOR })
      await handedOnAtThePin(one, cannotJoin(one))
      // THE ENTRY'S OWN SUPERVISOR HANDS OVER WITH ITS OWN KEY, and declares a run with one failure at the resolution's commit.
      const folder = scratch('clean-copy')
      git(folder, 'clone', '-q', one.dir, '.'); asTheFixture(folder)
      git(folder, 'switch', '-q', '--detach', mainAt)
      writeFileSync(join(folder, A), 'before\nresolved, keeping both sides\n'); git(folder, 'add', '.'); git(folder, 'commit', '-q', '-m', 'Synthetic resolution with a declared run')
      const copy = { folder, commit: git(folder, 'rev-parse', 'HEAD') }
      const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
      const keyed = { ...asPerson, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': SUPERVISOR, 'x-mole-office-key': makeAnAgentKey(ids[SUPERVISOR]!, null) }
      const handed = await call('POST', `/api/merge-queue/${one.id}/resolution`, keyed, { workingDirectory: folder, tests: { commit: copy.commit, exit: 1, counts: { passed: 6, failed: 1 }, log: `${folder}.tests.log` } })
      expect(handed.status, handed.raw).toBe(200)
      const declaredAt = (stored(one.id)['resolution'] as { at: string }).at
      heldAtTheRef(one, copy)
      expect((await passed(one, copy, [mainAt])).body.entry.state).toBe('judged')
      expect((await step(one.id, 'integrating', {})).status).toBe(200)
      const r = await integrated(one, integratedAt(one, copy))
      expect(r.status, r.raw).toBe(200)
      expect(r.body.entry.state).toBe('reinspecting')
      const parts = theItemFor(one, copy).why.split('\n\n')
      expect(r.body.entry.machine.reinspection.needsJudgment).toEqual([{
        path: A,
        why: [
          ...parts.slice(0, -1),
          `Related tests, the supervisor's own run, as declared: it ran at commit ${copy.commit.slice(0, 12)}, which the merge tool's check found is the resolution's, ` +
            `exited with 1, and counted 6 passed and 1 failed. Its log is at ${folder}.tests.log. It was declared by agent ${ids[SUPERVISOR]} at ${declaredAt}. ` +
            'The office did not run these tests or read the log. This is evidence for your judgment, never a pass or a fail.',
        ].join('\n\n'),
      }])
    })
  })
})
