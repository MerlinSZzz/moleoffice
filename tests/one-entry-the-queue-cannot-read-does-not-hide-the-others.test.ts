// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE ENTRY THE QUEUE CANNOT READ DOES NOT HIDE THE OTHERS. The queue reads each stored merge entry strictly, and an
 * entry not in the shape the queue writes is refused. That refusal used to fail GET /api/merge-queue as a whole, so one
 * such entry left the queue page with nothing but the error. The list now answers the entries it can read, and beside
 * them names each one it cannot, with its id, its title and the queue's reason. The page draws both. The entry's own
 * door still fails on it, and so does every reader inside the office that does not ask for those names.
 *
 * Each reader of the list in the merge tool, and the timing job, acts on the lanes. A list that leaves an entry out
 * cannot tell them whether that entry holds the lane, lands or tests, so each takes such a list as it takes a list the
 * office refused, as it did while the whole list failed, and says why.
 *
 * Every entry here is made up and filed in a test database of its own. The merge tool's office is a small stand-in
 * written in this file, so nothing reaches a real office.
 *
 * MUTATION PROOF (logs named in the report of the run that added this file), each alone after a green control:
 *   - the list is not asked to name what it cannot read, so it fails as a whole again: cases 1, 2, 5 and 6 go red;
 *   - the list drops the entry it cannot read and does not name it: cases 1, 2, 5 and 6 go red;
 *   - the list names what it cannot read even when it is not asked to: case 4 goes red;
 *   - the queue reads an entry with no submitter as one submitted by nobody it can name: cases 1 to 6 go red;
 *   - the entry's own door answers the entry it cannot read instead of failing: case 3 goes red;
 *   - the page draws no part for the entries the queue cannot read: cases 5 and 6 go red;
 *   - the page says that nothing is on its way into main when the queue could read nothing: case 6 goes red;
 *   - the merge tool's readers read a list that names an entry it cannot read as a whole list: case 7 goes red.
 * The timing job's case is in tests/the-timing-job-waits-for-a-quiet-machine.test.ts. It goes red when the timing job
 * reads such a list as a whole list.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { MergeQueueReply } from '../src/shared/merge-queue-page.ts'
import { englishWords } from '../src/shared/words/joined.ts'

const en = englishWords() as unknown as Record<string, unknown>
const WORKSPACE = 'default'
const ROOT = '/synthetic/lane-of-the-unreadable-entry'
const ANOTHER_LANE = '/synthetic/another-lane'
const LIVE = 'submitted,pinned,judged,integrating,reinspecting,testing,landing,resolving'
const office = { type: 'agent' as const, id: 'mole-office/the-message-worker' }
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const UNREADABLE_TITLE = 'Made-up merge entry filed with no submitter'

/** The sentence the queue refuses an entry with no submitter in. */
const refusalOf = (id: string): string => `Merge entry ${id} does not hold what the merge queue writes: it names nobody as its submitter.`

type Answer = { status: number; body: unknown }
type UnreadableEntry = { id: string; title: string; why: string }
type Reply = MergeQueueReply & { unreadable?: UnreadableEntry[] }

const ids = { first: '', second: '', unreadable: '' }
const got: { whole: Answer | null; elsewhere: Answer | null; inAState: Answer | null; door: Answer | null; readableDoor: Answer | null } = {
  whole: null,
  elsewhere: null,
  inAState: null,
  door: null,
  readableDoor: null,
}
let readItself: unknown = null
let listedWithoutAsking: unknown = null

describe('the office', () => {
  let t: TestDb

  beforeAll(async () => {
    t = await freshDb()
    const door = await import('../src/server/lib/merge-entry-door.ts')
    const queue = await import('../src/server/lib/merge-queue.ts')
    const entry = (name: string, title: string, submittedBy: Record<string, unknown> | undefined): string =>
      door.asTheMergeQueue(() =>
        t.api.createRecord({
          kind: 'merge_entry',
          title,
          workspaceId: WORKSPACE,
          actor: office,
          origin: 'fixture',
          data: {
            run: `made-up-run-${name}`,
            seal: { id: `made-up-seal-${name}`, hash: `made-up-hash-${name}` },
            changeset: { adapter: 'files', root: ROOT, operations: [] },
            state: 'submitted',
            ...(submittedBy === undefined ? {} : { submittedBy }),
          },
        }),
      ).id
    ids.first = entry('first', 'Made-up merge entry, the first readable one', { kind: 'agent', id: 'made-up-worker' })
    ids.unreadable = entry('unreadable', UNREADABLE_TITLE, undefined)
    ids.second = entry('second', 'Made-up merge entry, the second readable one', { kind: 'agent', id: 'made-up-worker' })

    // READ HERE, BEFORE ANY CASE: the page's cases load the page's modules afresh, and the office's must stay as built.
    const app = (await apiApp()).app
    await app.ready()
    try {
      const ask = async (url: string): Promise<Answer> => {
        const reply = await app.inject({ method: 'GET', url, headers: AS_THE_PERSON })
        return { status: reply.statusCode, body: reply.json() as unknown }
      }
      got.whole = await ask(`/api/merge-queue?state=${LIVE}`)
      got.elsewhere = await ask(`/api/merge-queue?lane=${encodeURIComponent(ANOTHER_LANE)}`)
      got.inAState = await ask('/api/merge-queue?state=landing')
      got.door = await ask(`/api/merge-queue/${ids.unreadable}`)
      got.readableDoor = await ask(`/api/merge-queue/${ids.first}`)
    } finally {
      await app.close()
    }
    try {
      readItself = queue.readMergeEntry(queue.theMergeEntry(ids.unreadable, WORKSPACE))
    } catch (error) {
      readItself = error
    }
    try {
      listedWithoutAsking = queue.listMergeQueue({ workspaceId: WORKSPACE })
    } catch (error) {
      listedWithoutAsking = error
    }
  }, 120_000)

  afterAll(() => {
    t?.close()
  })

  it('1: the list answers the entries it can read, and beside them names the one it cannot, with its id, title and why', () => {
    const answer = got.whole!
    expect(answer.status, JSON.stringify(answer.body)).toBe(200)
    const reply = answer.body as Reply
    expect(reply.lanes.map((one) => one.lane)).toEqual([ROOT])
    expect(reply.lanes[0]!.entries.map((one) => one.id), 'both readable entries, in the order they were written').toEqual([ids.first, ids.second])
    expect(reply.unreadable).toEqual([{ id: ids.unreadable, title: UNREADABLE_TITLE, why: refusalOf(ids.unreadable) }])
    expect(reply.says, 'the sentence counts the entries it read').toContain('2 entries in 1 lane')
    expect(reply.says, 'the sentence names the entry it could not read').toContain(`merge entry ${ids.unreadable}`)
  })

  it('2: narrowed to another lane or to a state, the list still names it, and does not say that nothing was submitted', () => {
    for (const [asked, answer] of [['another lane', got.elsewhere!], ['a state', got.inAState!]] as const) {
      expect(answer.status, `${asked}: ${JSON.stringify(answer.body)}`).toBe(200)
      const reply = answer.body as Reply
      expect(reply.lanes.flatMap((one) => one.entries), asked).toEqual([])
      // ITS LANE AND STATE CANNOT BE READ, so whether it is in the lane or state asked for cannot be told.
      expect(reply.unreadable, asked).toEqual([{ id: ids.unreadable, title: UNREADABLE_TITLE, why: refusalOf(ids.unreadable) }])
      expect(reply.says, asked).toContain(`merge entry ${ids.unreadable}`)
      expect(reply.says, asked).not.toMatch(/^Nothing (has been )?submitted/u)
    }
  })

  it('3: the entry\'s own door still fails on it, and the queue\'s read of it still refuses it in the same words', () => {
    expect(got.readableDoor!.status, 'a readable entry\'s door answers').toBe(200)
    expect(got.door!.status, JSON.stringify(got.door!.body)).toBe(500)
    expect(readItself).toBeInstanceOf(Error)
    expect((readItself as Error).message).toBe(refusalOf(ids.unreadable))
  })

  it('4: a reader inside the office that does not ask for the names still fails on it', () => {
    expect(listedWithoutAsking).toBeInstanceOf(Error)
    expect((listedWithoutAsking as Error).message).toBe(refusalOf(ids.unreadable))
  })
})

// ============================================================================ the page

/** The page module, loaded under a window whose stored actor is the person, in English. */
async function thePage(): Promise<typeof import('../src/web/pages/MergeQueuePage.tsx')> {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  vi.resetModules()
  const i18n = await import('../src/shared/i18n.ts')
  i18n.setWordLanguage('en')
  return import('../src/web/pages/MergeQueuePage.tsx')
}

/** The page's text as a reader reads it, tags left out and entities read back. */
function theWords(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&#x27;/gu, "'")
    .replace(/&quot;/gu, '"')
    .replace(/&amp;/gu, '&')
    .replace(/\s+/gu, ' ')
}

/** The html of the part the page draws for one entry it cannot read, or null when it draws none. */
function theUnreadableLine(html: string, id: string): string | null {
  const found = new RegExp(`<(\\w+)[^>]*data-unreadable="${id}"[^>]*>([\\s\\S]*?)</\\1>`, 'u').exec(html)
  return found === null ? null : found[2]!
}

/** A word of the page, read by its key so this file type-checks before the word is there. */
function theWord(key: string): string {
  const word = en[key]
  expect(word, `the English word ${key}`).toBeTypeOf('string')
  return word as string
}

describe('the merge queue page', () => {
  afterAll(() => {
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('5: the page draws the entries the queue can read in their lane, and apart from the lanes each one it cannot, with its title and why', async () => {
    expect(got.whole!.status).toBe(200)
    const page = await thePage()
    const html = renderToStaticMarkup(h(page.TheMergeQueue, { reply: got.whole!.body as Reply, now: new Date() }))
    for (const id of [ids.first, ids.second]) expect(html, `the row of ${id}`).toContain(`data-entry="${id}"`)
    expect(html, 'the entry the queue cannot read is not drawn as a row of a lane').not.toContain(`data-entry="${ids.unreadable}"`)
    const line = theUnreadableLine(html, ids.unreadable)
    expect(line, 'the page draws the entry the queue cannot read').not.toBeNull()
    expect(theWords(line!)).toContain(UNREADABLE_TITLE)
    expect(theWords(line!)).toContain(refusalOf(ids.unreadable))
    const words = theWords(html)
    expect(words, 'the part is named').toContain(theWord('surfaceWords.mergequeue.unreadable'))
    expect(words, 'the part says what it is').toContain(theWord('mergeQueuePage.unreadable.says'))
  })

  it('6: when the queue could read no entry, the page does not say that nothing is on its way into main', async () => {
    expect(got.elsewhere!.status).toBe(200)
    const page = await thePage()
    const html = renderToStaticMarkup(h(page.TheMergeQueue, { reply: got.elsewhere!.body as Reply, now: new Date() }))
    const words = theWords(html)
    expect(words).not.toContain(theWord('mergeQueuePage.none'))
    expect(words).toContain(theWord('mergeQueuePage.noneReadable'))
    expect(theUnreadableLine(html, ids.unreadable), 'the page still draws the entry the queue cannot read').not.toBeNull()
  })
})

// ============================================================================ the merge tool

describe('the merge tool', () => {
  const WHY = 'Merge entry made-up-unreadable does not hold what the merge queue writes: it names nobody as its submitter.'
  const UNREADABLE = [{ id: 'made-up-unreadable', title: 'A made-up entry the queue cannot read', why: WHY }]
  /** A readable entry of the lane, in the shape the list answers it: one that lands. */
  const LANDING = { id: 'made-up-landing', state: 'landing', lane: ROOT, changeset: { adapter: 'files', root: ROOT, operations: [] }, movedFirst: null, machine: {} }
  const aReply = (entries: unknown[]): Record<string, unknown> => ({
    lanes: [{ lane: ROOT, occupiedBy: null, entries }],
    unreadable: UNREADABLE,
    emergencyPushes: [],
    says: 'A made-up reply of the merge queue.',
  })
  let stand: Server
  let reply: Record<string, unknown> = aReply([LANDING])
  let scratch = ''
  let main = ''
  let keeper: typeof import('../tools/merge-tool/office-keeper.mjs')
  let push: typeof import('../tools/merge-tool/emergency-push.mjs')
  let failure: typeof import('../tools/merge-tool/log-and-state.mjs').MergerFailure

  beforeAll(async () => {
    stand = createServer((request, answer) => {
      request.resume()
      const found = request.method === 'GET' && (request.url ?? '').startsWith('/api/merge-queue?')
      answer.writeHead(found ? 200 : 404, { 'content-type': 'application/json' })
      answer.end(JSON.stringify(found ? reply : { error: 'This made-up office answers only the merge queue\'s list.' }))
    })
    await new Promise<void>((ok) => stand.listen(0, '127.0.0.1', ok))
    const at = `http://127.0.0.1:${String((stand.address() as AddressInfo).port)}`
    scratch = mkdtempSync(join(tmpdir(), 'mole-office-unreadable-entry-'))
    main = join(scratch, 'main')
    const made = spawnSync('git', ['init', '-q', '-b', 'main', main], { encoding: 'utf8' })
    expect(made.status, made.stderr).toBe(0)
    const argv = process.argv
    process.argv = [argv[0]!, argv[1]!, '--entry', 'made-up-entry', '--session', 'made-up-session', '--workdir', scratch, '--api', at, '--office-for', '6']
    try {
      keeper = await import('../tools/merge-tool/office-keeper.mjs')
      push = await import('../tools/merge-tool/emergency-push.mjs')
      failure = (await import('../tools/merge-tool/log-and-state.mjs')).MergerFailure
    } finally {
      process.argv = argv
    }
  })

  afterAll(async () => {
    stand?.closeAllConnections()
    await new Promise<void>((ok) => (stand === undefined ? ok() : stand.close(() => ok())))
    if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
  })

  it('7: each reader of the list takes a list that names an entry it cannot read as a list it could not read, and says why', async () => {
    reply = aReply([LANDING])
    expect(await keeper.theLane(ROOT), 'the lane is read as when the office refuses the list').toEqual([])

    const queued = await keeper.theMigrationsQueued(ROOT, { id: 'made-up-entry' })
    expect(queued.lane, 'the migrations queued say why the lane could not be read').toContain(WHY)

    expect(await keeper.conflictsAfterLanding(ROOT, 'main')).toEqual([])
    expect(readFileSync(join(scratch, 'the-merger.log'), 'utf8'), 'the early conflict probe says it is incomplete, and why').toMatch(
      new RegExp(`early conflict warnings are incomplete: .*${WHY.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`, 'u'),
    )

    // AN EMERGENCY PUSH ASKS WHO MOVES MAIN, and an entry whose state cannot be read may be landing.
    reply = aReply([])
    const asked: string[] = []
    const ask = async (method: string, path: string): Promise<{ status: number; body: unknown }> => {
      asked.push(`${method} ${path}`)
      if (method === 'GET' && path.startsWith('/api/merge-queue?')) return { status: 200, body: reply }
      return { status: 418, body: { error: 'This made-up office takes no emergency push.' } }
    }
    const ended = await push
      .runTheEmergencyPush({
        root: main,
        commit: 'a'.repeat(40),
        message: { id: 'made-up-message', seq: 1, contentHash: 'made-up-hash' },
        ask,
        sleep: keeper.sleep,
        whatAboutTheOffice: async () => ({ mainOnly: true, says: 'A made-up office that runs from another folder.' }),
        waitMs: 0,
        everyMs: 10,
      })
      .then(() => null, (error: unknown) => error)
    expect(ended).toBeInstanceOf(failure)
    expect((ended as Error).message).toContain(WHY)
    expect(asked.filter((one) => one.startsWith('POST')), 'no emergency push was asked for').toEqual([])
  }, 30_000)
})
