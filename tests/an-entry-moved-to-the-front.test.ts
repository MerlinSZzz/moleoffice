// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
/**
 * AN ENTRY MOVED TO THE FRONT OF ITS LANE IS THE NEXT TO TAKE IT. A decision records, from a
 * message, that a change to the merge queue itself can turn one landing an hour into eight, and it should not wait
 * its turn. Wave 13t round 26, agreed in message lOBUitZaMl1N.
 *
 * WHAT IS PROVED, through the real doors of the real app, against a throwaway database:
 *
 *   1. An entry moved to the front takes its lane before older judged entries: the merge tool is handed it alone, the
 *      older ones wait with words naming it, the lane's list puts it first, and the lane is taken by it.
 *   2. A running suite is not interrupted. The entry holding the lane in testing keeps it, the moved entry waits for
 *      it, and the holder itself cannot be moved (409).
 *   3. Two moves keep the order they were made in, whatever the order the entries were submitted in.
 *   4. Only the person, the merge queue's owner by its own key, and a secretary the person has raised by its own key
 *      may move an entry, and a reason is required. The owner is the agent the person names on the Settings page
 *      (POST /api/office/merge-queue-owner, EI3_Msuradr7). Another secretary is refused by its key (the live office's secretary,
 *      lOBUitZaMl1N), and so are an agent named only by headers, the owner's authority of a test world, and every
 *      agent when nobody is named. Once raised the other secretary may, and its entry names
 *      the raise. Who is calling is asked before the reason is read (qPmul3hThx3o): a caller without the right
 *      is answered 403 with a body, with no body and with a blank reason.
 *   5. The merge tool reads its lane in the office's order: `theLane` in tools/merge-tool/office-keeper.mjs, run in a
 *      process of its own against this app, answers the lane in the order the office lists it.
 *   6. A merged, bounced or withdrawn entry cannot be moved: 409, and its record is unchanged.
 *   7. A rider of the lane's newest bus, and an entry that bus passed over for a check, are handed to the merge tool
 *      before a moved entry of the same lane (lOBUitZaMl1N). The bus is written on a landed driver as the
 *      tested step writes it; this file runs no merge tool.
 *
 * Case 1 proves the entry takes the lane first and does not run a landing. One lane holds one entry at a time, and
 * an entry lands only from holding it, so the order the lane is taken in is the order of landing.
 *
 * MUTATION PROOF (each after a green control; each turns the case named red, and restoring it turns it green):
 *
 *   - Case 1: in src/server/lib/merge-queue.ts, `whatTheMergeToolWaitsOn`, return null where it returns
 *     `aMovedEntryGoesFirst(entry)`. The older entries are handed on beside the moved one (cases 3 and 5 go red too).
 *   - Case 2: in src/server/lib/merge-state-machine.ts, `moveToTheFront`, make the `spec.occupiesTheLane` refusal
 *     never apply. Moving the holder in testing is then answered 500, not 409: the check after the write finds that
 *     the move does not order the lane, because an entry holding its lane is already first.
 *   - Case 3: in src/server/lib/merge-state-machine.ts, `theNextTurn`, return 1. Two moves share a turn and keep the
 *     order they were submitted in (case 5 goes red too).
 *   - Case 4: in `mayMoveAnEntryFirst`, return `{ by: me }` for any agent with a key. The other secretary moves an
 *     entry. In src/server/api/merge-queue.ts, drop `.min(1, …)` from `theMoveFirst`: a blank reason is taken. In
 *     `mayMoveAnEntryFirst`, drop the raise's line: the raised secretary is refused. And in `moveToTheFront`, drop
 *     `underARaise` from what is written: the entry does not name the raise.
 *   - Case 5: in tools/merge-tool/office-keeper.mjs, `theLane`, sort the lane oldest first again, as it did before
 *     this round. The tool's order differs from the office's. Case 5 submits its entries in seconds of their own for
 *     this: before it did, this mutation stayed green.
 *   - Case 4, the order: in src/server/api/merge-queue.ts, the /first door, read the reason with `parse` before
 *     `whoMovesAnEntryFirst`. A worker with no body is then answered 400, not 403.
 *   - Case 6: in `moveToTheFront`, make the `spec.final` refusal never apply. Moving a merged entry is then answered
 *     500, not 409. In round 26 no test held this, and the inspector found the mutation green (qPmul3hThx3o).
 *   - Case 7, both entries: in src/server/lib/merge-queue.ts, ask `aMovedEntryGoesFirst` before `aRiderGoesFirst` in
 *     `whatTheMergeToolWaitsOn`, and drop `aRiderGoesFirst(one) === null` from `aMovedEntryGoesFirst`, both at once,
 *     as the inspector did. The tool is then handed nobody: the rider, or the entry passed over, waits for the moved
 *     entry, and the moved entry waits for it.
 *
 * Every fixture here is synthetic and says so: the git repositories are made under `.logs/` in this checkout and
 * removed after, the records are filed as fixtures, and nothing reaches the live server. The one child process is
 * started in its own process group, waited for, and any group still listed is killed after the file.
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, thePersonsKeyHeader, FOR_THE_PERSON, type TestDb } from './helpers.ts'
import { englishWords } from '../src/shared/words/joined.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const THE_WORKER = 'mole-office/the-message-worker'
const WORKSPACE = 'default'
/** The merge queue's owner in this file, named by the setting as the secretary is in the office. A made-up handle. */
const QUEUE_OWNER = 'queue-keeper'
/** A second secretary, which must not move an entry (the live office's secretary, lOBUitZaMl1N). A made-up handle. */
const OTHER_SECRETARY = 'other-secretary'

const as = (type: 'agent' | 'human', id: string) => ({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': type, 'x-mole-office-actor-id': id })
const asPerson = as('human', THE_TEST_OFFICES_OWNER.id)
const asWorker = as('agent', 'front-worker')
const asInspector = as('agent', 'front-inspector')
const asTheOffice = as('agent', THE_WORKER)
/** A key and nothing else, so who is asking can only come from the key. */
const byKey = (key: string) => ({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-key': key })

let t: TestDb
let app: FastifyInstance
let api: string
let base: string
let main: string
let repository: string
let queue: typeof import('../src/server/lib/merge-queue.ts')
let machine: typeof import('../src/server/lib/merge-state-machine.ts')
let door: typeof import('../src/server/lib/merge-entry-door.ts')
const keys: Record<string, string> = {}
const groups = new Set<number>()

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

const SYNTHETIC_AUTHOR = { GIT_AUTHOR_NAME: 'Synthetic', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Synthetic', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' }

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}

/** A worker's clone of main with one commit on `work`, sealed as a finished run, and submitted. */
async function anEntry(name: string): Promise<{ id: string; run: string }> {
  const dir = join(base, `worker-${name}`)
  execFileSync('git', ['clone', '-q', main, dir], { stdio: 'ignore' })
  git(dir, 'switch', '-q', '-c', 'work')
  writeFileSync(join(dir, 'src', `${name}.txt`), `Synthetic change ${name}.\n`)
  git(dir, 'add', '-A')
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', `Synthetic submission ${name}`], { stdio: 'ignore', env: { ...process.env, ...SYNTHETIC_AUTHOR } })
  const run = t.api.createRecord({
    kind: 'session',
    title: `Synthetic run ${name}`,
    workspaceId: WORKSPACE,
    actor: { type: 'agent', id: 'front-worker' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'front-worker', cutFrom: 'main', workingDirectory: realpathSync(dir) },
  }).id
  const finished = await call('PATCH', `/api/records/${run}`, asWorker, { dataPatch: { state: 'finished' } })
  expect(finished.status, finished.raw).toBe(200)
  const submitted = await call('POST', '/api/merge-queue', asWorker, { run, changeset: { adapter: 'git', repository, branch: `work-${name}` } })
  expect(submitted.status, submitted.raw).toBe(201)
  return { id: String(submitted.body['entry'].id), run }
}

/** The inspector releases the run, through the real check doors, naming its seal, the seal's hash and its tip. */
async function release(run: string): Promise<void> {
  const sealId = String(t.api.getRecord(run)!.data['sealedTip'])
  const seal = t.api.getRecord(sealId)!.data['seal'] as { hash: string; git: { commit: string; forkBase: string; files: { path: string }[] } }
  const read = { sealId, sealHash: seal.hash, worktree: String(t.api.getRecord(run)!.data['workingDirectory']), tip: seal.git.commit, ofItsOwn: true, says: 'Synthetic: a check of its own detached tree.' }
  const assembled = await call('POST', `/api/checks/${run}/assembled`, asInspector, {
    changes: seal.git.files.map((one) => ({ path: one.path, changes: 'a synthetic diff' })),
    base: { ref: seal.git.forkBase, how: 'fork point', says: 'Synthetic: the fixed fork base of the seal.' },
    read,
  })
  expect(assembled.status, assembled.raw).toBe(201)
  const verdict = await call('POST', `/api/checks/${run}`, asInspector, { verdict: 'released', traced: syntheticTrace(t, seal.git.files.map((one) => one.path)), check: 'Synthetic: read the changes and found nothing missing.', chaptersRead: [], read })
  expect(verdict.status, verdict.raw).toBe(201)
}

/** The sealed content of a run, as the pin step reports it. */
function contentOf(run: string): Record<string, string> {
  const sealId = String(t.api.getRecord(run)!.data['sealedTip'])
  const files = (t.api.getRecord(sealId)!.data['seal'] as { git: { files: { path: string; hash: string }[] } }).git.files
  return Object.fromEntries(files.map((one) => [one.path, one.hash]))
}

/** An entry submitted, released and pinned through the office's own doors, so it is judged and waits for its lane. */
async function aJudgedEntry(name: string): Promise<string> {
  const made = await anEntry(name)
  await release(made.run)
  const pinned = await call('POST', `/api/merge-queue/${made.id}/step`, asTheOffice, { step: 'pinned', facts: { files: contentOf(made.run) } })
  expect(pinned.status, pinned.raw).toBe(200)
  expect(pinned.body['entry'].state).toBe('judged')
  return made.id
}

function entry(id: string): Record<string, any> {
  return queue.withWhatTheToolWaitsOn(queue.readMergeEntry(t.api.getRecord(id)!)) as unknown as Record<string, any>
}

const wantedByTheWorker = (): string[] => queue.theMergeToolWork(WORKSPACE).wanted.map((one) => one.id)

/** The lane as the office lists it to anybody who asks, without the entries earlier cases left final. */
async function theOfficesLane(): Promise<string[]> {
  const listed = await call('GET', `/api/merge-queue?lane=${encodeURIComponent(main)}`, asWorker)
  expect(listed.status, listed.raw).toBe(200)
  const lane = (listed.body['lanes'] as { lane: string; entries: { id: string }[] }[]).find((one) => one.lane === main)
  return waitingIn((lane?.entries ?? []).map((one) => one.id))
}

/** Waits until the clock is in the next second, so the next record's stamp differs from the last one's. */
async function theNextSecond(): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  while (Math.floor(Date.now() / 1000) === now) await new Promise((ok) => setTimeout(ok, 50))
}

const waitingIn = (ids: readonly string[]): string[] => ids.filter((id) => !['merged', 'bounced', 'withdrawn', 'superseded'].includes(String(entry(id).state)))

beforeAll(async () => {
  t = await freshDb()
  mkdirSync(join(REPO, '.logs'), { recursive: true })
  base = realpathSync(mkdtempSync(join(REPO, '.logs', 'moved-first-')))
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  queue = await import('../src/server/lib/merge-queue.ts')
  machine = await import('../src/server/lib/merge-state-machine.ts')
  door = await import('../src/server/lib/merge-entry-door.ts')
  for (const one of [
    { handle: 'front-worker', name: 'Synthetic front-worker', workArea: ['src'] },
    { handle: 'front-inspector', name: 'Synthetic front-inspector', role: 'inspector' },
    { handle: QUEUE_OWNER, name: 'Synthetic queue keeper', role: 'secretary' },
    { handle: OTHER_SECRETARY, name: 'Synthetic other secretary', role: 'secretary' },
  ]) {
    const started = await call('POST', '/api/agents/started', asPerson, one)
    expect(started.status, started.raw).toBe(201)
    keys[one.handle] = String(started.body['whatToGiveIt']?.key)
  }
  // THE PERSON NAMES THE QUEUE'S OWNER, through the Settings page's own door, as the person names the secretary in the office.
  const named = await call('POST', '/api/office/merge-queue-owner', asPerson, { agent: QUEUE_OWNER })
  expect(named.status, named.raw).toBe(200)
  main = join(base, 'main')
  mkdirSync(join(main, 'src'), { recursive: true })
  git(main, 'init', '-q', '-b', 'main')
  writeFileSync(join(main, 'src', 'a.txt'), 'Synthetic baseline.\n')
  git(main, 'add', '-A')
  execFileSync('git', ['-C', main, 'commit', '-q', '-m', 'Synthetic baseline'], { stdio: 'ignore', env: { ...process.env, ...SYNTHETIC_AUTHOR } })
  main = realpathSync(main)
  const repositories = await import('../src/server/lib/repositories.ts')
  repository = repositories.registerRepository({ workspaceId: WORKSPACE, name: 'fixture-moved-first', root: main, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } }).id
}, 60_000)

/** EVERY ENTRY STILL IN THE LINE IS WITHDRAWN AFTER EACH CASE, so a move in one case does not order the next. */
afterEach(async () => {
  const rows = t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'merge_entry' AND deleted_at IS NULL").all() as { id: string }[]
  for (const id of waitingIn(rows.map((row) => row.id))) {
    await call('POST', `/api/merge-queue/${id}/withdraw`, asPerson, { because: 'Synthetic: the case is over.' })
  }
})

afterAll(async () => {
  for (const group of groups) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Gone already.
    }
  }
  await app?.close()
  t?.close()
  if (base !== undefined) rmSync(base, { recursive: true, force: true })
})

describe('an entry moved to the front of its lane', () => {
  it('takes the lane before older judged entries, and they wait with words naming it', async () => {
    const older = await aJudgedEntry('older')
    const old = await aJudgedEntry('old')
    const newest = await aJudgedEntry('newest')
    // THE CONTROL: unmoved, the lane is in the order of submission, and every judged entry is handed on.
    expect(await theOfficesLane()).toEqual([older, old, newest])
    expect(wantedByTheWorker()).toEqual([older, old, newest])

    const moved = await call('POST', `/api/merge-queue/${newest}/first`, asPerson, { because: 'Synthetic: this entry changes the merge queue itself.' })
    expect(moved.status, moved.raw).toBe(200)
    expect(moved.body['entry'].movedFirst).toMatchObject({ by: { kind: 'person' }, because: 'Synthetic: this entry changes the merge queue itself.', turn: expect.any(Number) })
    expect(moved.body['says']).toContain(`Merge entry ${newest} was moved to the front of its lane by the person`)
    expect(moved.body['says']).toContain('Its lane is free')

    expect(await theOfficesLane()).toEqual([newest, older, old])
    expect(wantedByTheWorker()).toEqual([newest])
    for (const waiting of [older, old]) {
      expect(entry(waiting).toolWaits).toMatchObject({ because: 'a-moved-entry-goes-first', first: newest })
      expect(entry(waiting).toolWaits.says).toContain('Synthetic: this entry changes the merge queue itself.')
    }
    // THE QUEUE'S READING SAYS IT TOO, by whom.
    const listed = await call('GET', `/api/merge-queue?lane=${encodeURIComponent(main)}`, asWorker)
    expect(listed.body['says']).toContain(`Moved to the front of its lane: merge entry ${newest}, by the person`)

    // IT TAKES THE LANE, and the older ones wait for the lane held, in the order they were submitted.
    const taken = await call('POST', `/api/merge-queue/${newest}/step`, asTheOffice, { step: 'integrating', facts: {} })
    expect(taken.status, taken.raw).toBe(200)
    expect(queue.whoOccupies(main)?.entry).toBe(newest)
    expect(entry(newest).movedFirst.says).toContain('It holds its lane now, so the move no longer orders the lane.')
    expect(entry(older).toolWaits).toMatchObject({ because: 'the-lane-is-held', holder: newest })
    expect(await theOfficesLane()).toEqual([older, old, newest])
  }, 120_000)

  it('does not interrupt a running suite, and the entry holding the lane cannot be moved', async () => {
    const holder = await aJudgedEntry('holder')
    expect((await call('POST', `/api/merge-queue/${holder}/step`, asTheOffice, { step: 'integrating', facts: {} })).status).toBe(200)
    queue.moveEntry({ id: holder, to: 'testing', actor: { type: 'agent', id: THE_WORKER } })
    expect(entry(holder).state).toBe('testing')
    const waiting = await aJudgedEntry('waiting')

    const moved = await call('POST', `/api/merge-queue/${waiting}/first`, asPerson, { because: 'Synthetic: it should not wait its turn.' })
    expect(moved.status, moved.raw).toBe(200)
    expect(moved.body['says']).toContain(`Merge entry ${holder} holds the lane and keeps it until it is done.`)
    // THE SUITE GOES ON: the holder keeps its state and its lane, and the moved entry waits for it.
    expect(entry(holder).state).toBe('testing')
    expect(queue.whoOccupies(main)?.entry).toBe(holder)
    expect(entry(waiting).toolWaits).toMatchObject({ because: 'the-lane-is-held', holder })
    expect(wantedByTheWorker()).not.toContain(waiting)

    // THE ENTRY HOLDING THE LANE IS ALREADY FIRST, and moving it is refused with nothing written.
    const refused = await call('POST', `/api/merge-queue/${holder}/first`, asPerson, { because: 'Synthetic: jump the lane.' })
    expect(refused.status, refused.raw).toBe(409)
    expect(refused.body['error']).toContain('holds its lane now, so it is already first')
    expect(entry(holder).movedFirst).toBeUndefined()

    // A MOVE IS MADE ONCE.
    const again = await call('POST', `/api/merge-queue/${waiting}/first`, asPerson, { because: 'Synthetic: again.' })
    expect(again.status, again.raw).toBe(409)
    expect(again.body['error']).toContain('It cannot be moved again')

    // THE LANE LET GO: the moved entry is handed on.
    expect((await call('POST', `/api/merge-queue/${holder}/withdraw`, asPerson, { because: 'Synthetic: the suite is over.' })).status).toBe(200)
    expect(wantedByTheWorker()).toContain(waiting)
  }, 120_000)

  it('keeps two moves in the order they were made', async () => {
    const first = await aJudgedEntry('first')
    const second = await aJudgedEntry('second')
    const third = await aJudgedEntry('third')
    // MOVED NEWEST FIRST, so the order of the moves is not the order of submission.
    expect((await call('POST', `/api/merge-queue/${third}/first`, asPerson, { because: 'Synthetic: moved first.' })).status).toBe(200)
    expect((await call('POST', `/api/merge-queue/${first}/first`, asPerson, { because: 'Synthetic: moved second.' })).status).toBe(200)
    expect(entry(first).movedFirst.turn).toBeGreaterThan(entry(third).movedFirst.turn)

    expect(await theOfficesLane()).toEqual([third, first, second])
    expect(wantedByTheWorker()).toEqual([third])
    expect(entry(first).toolWaits).toMatchObject({ because: 'a-moved-entry-goes-first', first: third })
    expect(entry(second).toolWaits).toMatchObject({ because: 'a-moved-entry-goes-first', first: third })

    // THE FIRST MOVED TAKES THE LANE AND LEAVES IT: the second moved is next.
    expect((await call('POST', `/api/merge-queue/${third}/withdraw`, asPerson, { because: 'Synthetic: done with it.' })).status).toBe(200)
    expect(wantedByTheWorker()).toEqual([first])
    expect(entry(second).toolWaits).toMatchObject({ because: 'a-moved-entry-goes-first', first })
  }, 120_000)

  it('lets only the person, the queue owner by its own key and a raised secretary move an entry, and only with a reason', async () => {
    const one = await aJudgedEntry('who-one')
    const two = await aJudgedEntry('who-two')
    const three = await aJudgedEntry('who-three')
    const because = 'Synthetic: a change to the queue itself.'
    const refusedAs = async (headers: Record<string, string>, payload: unknown, status: number): Promise<string> => {
      const refused = await call('POST', `/api/merge-queue/${one}/first`, headers, payload)
      expect(refused.status, refused.raw).toBe(status)
      expect(entry(one).movedFirst, 'a refused move was written').toBeUndefined()
      return String(refused.body['error'])
    }

    // ANOTHER SECRETARY, BY ITS OWN KEY (lOBUitZaMl1N).
    expect(await refusedAs(byKey(keys[OTHER_SECRETARY]!), { because }, 403)).toContain('Synthetic queue keeper owns the merge queue.')
    // THE QUEUE'S OWNER BY NAME ONLY, without its key.
    expect(await refusedAs(as('agent', QUEUE_OWNER), { because }, 403)).toContain('sent no key of its own')
    // A WORKER.
    await refusedAs(asWorker, { because }, 403)
    // WHO IS ASKED BEFORE THE REASON IS READ (qPmul3hThx3o): a caller without the right and with no body, or a
    // blank reason, is told it may not, and not that its reason is missing.
    expect(await refusedAs(asWorker, {}, 403)).toContain('is none of these')
    expect(await refusedAs(byKey(keys[OTHER_SECRETARY]!), undefined, 403)).toContain('Synthetic queue keeper owns the merge queue.')
    expect(await refusedAs(as('agent', QUEUE_OWNER), { because: '   ' }, 403)).toContain('sent no key of its own')
    // NO REASON, OR A BLANK ONE, FROM THE PERSON.
    expect(await refusedAs(asPerson, {}, 400)).toContain('says why')
    expect(await refusedAs(asPerson, { because: '   ' }, 400)).toContain('says why')
    // THE OWNER'S AUTHORITY OF A TEST WORLD IS NOT THE PERSON, and it does not open this door.
    let world: unknown
    try {
      machine.moveToTheFront({ workspaceId: WORKSPACE, id: one, because, actor: { type: 'agent', id: OTHER_SECRETARY, theOwnersAuthority: { holds: true, because: 'Synthetic: a test world.' } } as never })
    } catch (error) {
      world = error
    }
    expect((world as { status?: number } | undefined)?.status, 'the owner’s authority of a test world moved an entry').toBe(403)
    expect(entry(one).movedFirst).toBeUndefined()

    // THE QUEUE'S OWNER BY ITS KEY MAY.
    const byOwner = await call('POST', `/api/merge-queue/${one}/first`, byKey(keys[QUEUE_OWNER]!), { because })
    expect(byOwner.status, byOwner.raw).toBe(200)
    expect(byOwner.body['entry'].movedFirst).toMatchObject({ by: { kind: 'agent' }, because })
    expect(byOwner.body['says']).toContain(`by the agent ${QUEUE_OWNER}`)

    // WITH NOBODY NAMED, NO AGENT MAY, the queue's owner included; the person still may. Nobody is the product's
    // default: it names no agent of any office.
    expect((await call('POST', '/api/office/merge-queue-owner', asPerson, { agent: null })).status).toBe(200)
    try {
      const none = await call('POST', `/api/merge-queue/${two}/first`, byKey(keys[QUEUE_OWNER]!), { because })
      expect(none.status, none.raw).toBe(403)
      expect(none.body['error']).toContain(englishWords()['mergeQueueOwner.nobody.nobodyChose'])
      const byPerson = await call('POST', `/api/merge-queue/${two}/first`, asPerson, { because })
      expect(byPerson.status, byPerson.raw).toBe(200)
    } finally {
      expect((await call('POST', '/api/office/merge-queue-owner', asPerson, { agent: QUEUE_OWNER })).status).toBe(200)
    }

    // A SECRETARY THE PERSON HAS RAISED MAY, by its own key, and the entry says the move came through the
    // raise. This follows a decision and the secretary's EI3_Msuradr7.
    const raised = await call('POST', `/api/roles/elevation/${OTHER_SECRETARY}`, { ...asPerson, ...thePersonsKeyHeader() }, { reason: 'Synthetic: mind the queue tonight' })
    expect(raised.status, raised.raw).toBe(201)
    const grant = String(raised.body['elevation'].id)
    try {
      const byRaise = await call('POST', `/api/merge-queue/${three}/first`, byKey(keys[OTHER_SECRETARY]!), { ...FOR_THE_PERSON, because })
      expect(byRaise.status, byRaise.raw).toBe(200)
      expect(entry(three).movedFirst).toMatchObject({ by: { kind: 'agent' }, because, underARaise: grant })
      expect(byRaise.body['says']).toContain(`under the raise ${grant} the person gave it`)
    } finally {
      await call('DELETE', `/api/roles/elevation/${OTHER_SECRETARY}`, asPerson)
    }
    // THE QUEUE'S OWNER IS NOT MARKED AS RAISED: its move came through the setting.
    expect(entry(one).movedFirst?.underARaise).toBeUndefined()
  }, 120_000)

  it('is read in the same order by the merge tool as by the office', async () => {
    // EACH SUBMITTED IN A SECOND OF ITS OWN. A stamp counts seconds, and entries that share one keep the order they
    // are listed in under any sort by time, so a tool sorting by time alone would agree with the office by luck.
    const a = await aJudgedEntry('order-a')
    await theNextSecond()
    const b = await aJudgedEntry('order-b')
    await theNextSecond()
    const c = await aJudgedEntry('order-c')
    await theNextSecond()
    const d = await aJudgedEntry('order-d')
    expect(new Set([a, b, c, d].map((id) => entry(id).submittedAt)).size, 'two entries share a second').toBe(4)
    expect((await call('POST', `/api/merge-queue/${c}/first`, asPerson, { because: 'Synthetic: moved first.' })).status).toBe(200)
    expect((await call('POST', `/api/merge-queue/${b}/first`, asPerson, { because: 'Synthetic: moved second.' })).status).toBe(200)
    const office = (await theOfficesLane()).filter((id) => [a, b, c, d].includes(id))
    expect(office).toEqual([c, b, a, d])

    // THE MERGE TOOL'S OWN READER, in a process of its own, as the tool runs it. The first argument stands where the
    // tool's script path stands, so the tool's argument reader reads the rest.
    const session = t.api.createRecord({ kind: 'session', title: 'Synthetic merge tool run', workspaceId: WORKSPACE, actor: { type: 'agent', id: THE_WORKER }, origin: 'fixture', data: { state: 'running', runtime: 'merge-tool' } }).id
    const reader = `const { theLane } = await import(${JSON.stringify(join(REPO, 'tools', 'merge-tool', 'office-keeper.mjs'))}); process.stdout.write(JSON.stringify((await theLane(${JSON.stringify(main)})).map((one) => one.id)))`
    const child = spawn(
      process.execPath,
      ['--input-type=module', '-e', reader, '--', 'the-lane-reader', '--entry', a, '--session', session, '--api', api, '--workspace', WORKSPACE, '--workdir', join(base, 'reader'), '--office-for', '30'],
      { cwd: REPO, env: { ...process.env, MOLE_OFFICE_API: api }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    groups.add(child.pid!)
    let out = ''
    let err = ''
    child.stdout!.on('data', (chunk: Buffer) => (out += chunk.toString()))
    child.stderr!.on('data', (chunk: Buffer) => (err += chunk.toString()))
    const code = await new Promise<number | null>((resolve) => child.on('exit', resolve))
    groups.delete(child.pid!)
    expect(code, out + err).toBe(0)
    const tool = (JSON.parse(out) as string[]).filter((id) => [a, b, c, d].includes(id))
    expect(tool).toEqual(office)
    expect(queue.theMergeToolWork(WORKSPACE).wanted.map((one) => one.id)).toEqual([c])
  }, 120_000)

  it('refuses to move an entry that is merged, bounced or withdrawn, with a 409 and nothing written', async () => {
    const merged = await aJudgedEntry('final-merged')
    const bounced = await aJudgedEntry('final-bounced')
    const withdrawn = await aJudgedEntry('final-withdrawn')
    // MADE FINAL THE WAY EACH IS: withdrawn by the person through its door; merged and bounced written by the merge
    // queue, as a landing and a bounce write them, since this file runs no merge tool.
    expect((await call('POST', `/api/merge-queue/${withdrawn}/withdraw`, asPerson, { because: 'Synthetic: not wanted.' })).status).toBe(200)
    queue.moveEntry({ id: merged, to: 'merged', actor: { type: 'agent', id: THE_WORKER } })
    queue.moveEntry({ id: bounced, to: 'bounced', actor: { type: 'agent', id: THE_WORKER } })
    for (const [id, state] of [[merged, 'merged'], [bounced, 'bounced'], [withdrawn, 'withdrawn']] as const) {
      expect(entry(id).state).toBe(state)
      const before = t.api.getRecord(id)!
      const refused = await call('POST', `/api/merge-queue/${id}/first`, asPerson, { because: 'Synthetic: move a final entry.' })
      expect(refused.status, refused.raw).toBe(409)
      expect(refused.body['error']).toContain('which is final, so it is in no line to move up in. Nothing was written.')
      const after = t.api.getRecord(id)!
      expect(after.data['movedFirst'], `a move was written on the ${state} entry`).toBeUndefined()
      expect(after.data).toEqual(before.data)
    }
  }, 120_000)

  // THE RIDERS OF THE LANE'S NEWEST BUS, AND THE ENTRIES IT PASSED OVER FOR A CHECK, GO BEFORE A MOVED ENTRY (the live office's secretary,
  // lOBUitZaMl1N). Their suite has already been run on a tree, so handing the lane to a moved entry first would throw
  // that run away. The bus is the driver's own `tested.testedWith`, written as the tested step writes it, on a driver
  // that has landed; this file runs no merge tool, and the-merger-bus.test.ts makes a real bus.
  async function aBusThatLanded(name: string, testedWith: { bus: string[]; passedForACheck?: string[] }): Promise<string> {
    const driver = await aJudgedEntry(name)
    const tested = {
      green: true,
      log: `Synthetic: the bus of ${name}.`,
      at: new Date().toISOString(),
      testedWith: {
        entry: testedWith.bus[0]!,
        tree: 'synthetic-tree',
        bus: testedWith.bus.map((one) => ({ entry: one })),
        ...(testedWith.passedForACheck === undefined ? {} : { passedForACheck: testedWith.passedForACheck }),
      },
    }
    door.asTheMergeQueue(() => t.api.patchRecord(driver, { dataPatch: { tested } }, { type: 'agent', id: THE_WORKER }))
    queue.moveEntry({ id: driver, to: 'merged', actor: { type: 'agent', id: THE_WORKER } })
    return driver
  }

  it('hands a rider of the lane\'s newest bus to the merge tool before a moved entry', async () => {
    const rider = await aJudgedEntry('bus-rider')
    const moved = await aJudgedEntry('bus-moved')
    const driver = await aBusThatLanded('bus-driver', { bus: [rider] })
    // THE CONTROL: unmoved, the rider is handed on, and the entry that did not ride waits for it.
    expect(wantedByTheWorker()).toEqual([rider])
    expect(entry(moved).toolWaits).toMatchObject({ because: 'a-rider-goes-first', first: rider, driver })

    expect((await call('POST', `/api/merge-queue/${moved}/first`, asPerson, { because: 'Synthetic: a change to the queue itself.' })).status).toBe(200)
    expect(wantedByTheWorker()).toEqual([rider])
    expect(entry(rider).toolWaits).toBeUndefined()
    expect(entry(moved).toolWaits).toMatchObject({ because: 'a-rider-goes-first', first: rider, driver })
    expect(entry(moved).toolWaits.says).toContain(`Merge entry ${moved} was moved to the front of its lane, and the lane's newest bus still lets ${rider} go first.`)

    // THE RIDER LANDS, and the moved entry is next.
    queue.moveEntry({ id: rider, to: 'merged', actor: { type: 'agent', id: THE_WORKER } })
    expect(wantedByTheWorker()).toEqual([moved])
  }, 120_000)

  it('hands an entry the lane\'s newest bus passed over for a check to the merge tool before a moved entry', async () => {
    const passed = await aJudgedEntry('check-passed')
    // MARKED FOR THE TOOL IN A LATER SECOND than the entry passed over, as a bus's rider is: the office lets an entry
    // passed over go ahead of the riders marked after it, and a stamp counts seconds.
    await theNextSecond()
    const rider = await aJudgedEntry('check-rider')
    const moved = await aJudgedEntry('check-moved')
    const driver = await aBusThatLanded('check-driver', { bus: [rider], passedForACheck: [passed] })
    // THE CONTROL: unmoved, the entry passed over is handed on first, and the rider and the other entry wait for it.
    expect(wantedByTheWorker()).toEqual([passed])
    expect(entry(moved).toolWaits).toMatchObject({ because: 'an-entry-passed-over-for-a-check-goes-first', first: passed, driver })

    expect((await call('POST', `/api/merge-queue/${moved}/first`, asPerson, { because: 'Synthetic: a change to the queue itself.' })).status).toBe(200)
    expect(wantedByTheWorker()).toEqual([passed])
    expect(entry(passed).toolWaits).toBeUndefined()
    expect(entry(rider).toolWaits).toMatchObject({ because: 'an-entry-passed-over-for-a-check-goes-first', first: passed, driver })
    expect(entry(moved).toolWaits).toMatchObject({ because: 'an-entry-passed-over-for-a-check-goes-first', first: passed, driver })

    // THE ENTRY PASSED OVER LANDS, then the rider, and the moved entry is next.
    queue.moveEntry({ id: passed, to: 'merged', actor: { type: 'agent', id: THE_WORKER } })
    expect(wantedByTheWorker()).toEqual([rider])
    queue.moveEntry({ id: rider, to: 'merged', actor: { type: 'agent', id: THE_WORKER } })
    expect(wantedByTheWorker()).toEqual([moved])
  }, 120_000)
})
