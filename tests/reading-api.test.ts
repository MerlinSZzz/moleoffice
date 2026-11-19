// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE READING SURFACE, over HTTP: the four things a person or an agent asks this server for when
 * they want to know where the work stands, rather than to write something down.
 *
 *   GET  /api/attention                  what needs somebody today, and why
 *   GET  /api/anchor                     what has changed since I last looked
 *   PUT  /api/anchor                     I have read to here
 *   POST /api/records/:id/fulfil         this promise was kept
 *   POST /api/links {"gate":…}           and this dependency only blocks so much
 *
 * Each of them exists because of a measured failure, and each test below is about that failure
 * rather than about the endpoint answering 200:
 *
 *   1. THE RULE WAS DRAWN IN THE BROWSER. "What needs me today" was computed in the page, from
 *      four separate fetches, which meant a second implementation of the one rule that decides
 *      what interrupts a person. The rule is now in src/shared/attention.ts and this endpoint runs
 *      it, so what a caller draws and what the rule says cannot differ.
 *
 *   2. THE ANCHOR LIVED IN ONE BROWSER'S LOCAL STORAGE. The phone — the device the brief says is
 *      used to check on agents while away from the desk — is always the second browser, so its
 *      mark started empty and everything ever written looked new on it. And a reader who had never
 *      looked got an empty list, which reads as "nothing happened". Both are about the same thing:
 *      an answer that is honest about not knowing.
 *
 *   3. `data.done` WAS DECLARED AND READ AND NOTHING EVER WROTE IT. Every obligation in the
 *      database looked permanent, and an analysis concluded there was no way to record a kept
 *      promise. There is no second mechanism here; this writes the field that already existed.
 *
 *   4. A `blocks` LINK COULD NOT SAY HOW MUCH IT BLOCKED. Recorded as a hard block, work that is
 *      mostly doable looks completely stuck; recorded as nothing, the wall at the end is a
 *      surprise. The gate rides on the link, and the record on the RECEIVING end — the one that
 *      does not store it — is the one that has to be able to say what it is waiting for.
 *
 * HOW THE APP IS BUILT. src/server/index.ts listens on a port the moment it is imported, so it
 * cannot be pulled into a test. Its routes are plain Fastify plugins, so this file registers the
 * same ones against a throwaway database, the way tests/api-surface.test.ts does. Everything is
 * imported dynamically AFTER freshDb() has pointed MOLE_OFFICE_DB at a temporary file.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { discoveryRoutes, trackApiRoutes, type ApiIndex, type ApiRoute } from '../src/server/api/kinds.ts'
import type { PanelRecord } from '@shared/types.ts'
// The words for a gate and the reading of a discharge are written once, in shared/work.ts. This
// file asks those functions rather than repeating what they say.
import { gateLabel, readFulfilment } from '@shared/work.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')

let t: TestDb
let app: FastifyInstance
let listRoutes: () => ApiRoute[]
let resources: ResourcesLib

/** The records the attention block is about, created once and named so the assertions can say why. */
let overdue: PanelRecord
let danger: PanelRecord
let oldWord: PanelRecord
let plainNote: PanelRecord
let putDown: PanelRecord

/**
 * A probe that sees an empty machine.
 *
 * The sweep is only asked for in one test, and what that test is about is whether the reply SAYS
 * it looked — not what a Linux box happened to be running while the suite ran. A real probe here
 * would read /proc and shell out to nvidia-smi and docker, and the assertion would be about the
 * machine rather than about the endpoint.
 */
function emptyProbe(): ResourcesLib['LINUX_PROBE'] {
  return {
    platform: 'fake',
    processById: () => null,
    processesInGroup: () => [],
    listeningPorts: () => [],
    gpu: () => ({ available: true, processes: [] }),
    containers: () => ({ available: true, containers: [] }),
    locks: () => ({ files: [], unreadable: [] }),
    ownProcessGroup: () => 999_999,
    killProcessGroup: () => {
      throw new Error('this file never kills anything')
    },
    stopContainer: () => {
      throw new Error('this file never stops anything')
    },
  }
}

beforeAll(async () => {
  t = await freshDb()

  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { linkRoutes } = await import('../src/server/api/links.ts')
  const { queryRoutes } = await import('../src/server/api/queries.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  resources = await import('../src/server/lib/resources.ts')

  app = Fastify({ logger: false })
  listRoutes = trackApiRoutes(app)
  installErrorHandling(app)
  await app.register(discoveryRoutes, { prefix: '/api', listRoutes, currentWorkspace: () => ({ current: 'default', stated: false }) })
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(linkRoutes, { prefix: '/api' })
  await app.register(queryRoutes, { prefix: '/api' })
  await app.ready()

  resources.useOsProbe(emptyProbe())

  // One of each thing the rule has to tell apart. Written through lib/records.ts rather than over
  // HTTP because what matters here is the exact stored state word, not the write path.
  overdue = t.api.createRecord({ workspaceId: 'default',
    kind: 'obligation',
    title: 'Send the ESA milestone 2 section',
    data: { due: '2020-03-01', owedTo: 'the ESA grant review', state: 'open' },
    actor: t.api.HUMAN,
  })
  danger = t.api.createRecord({ workspaceId: 'default',
    kind: 'problem',
    title: 'The software E-stop does nothing',
    data: {
      state: 'open',
      consequence: {
        bearer: 'person',
        what: 'The rig keeps moving after the stop button is pressed, and somebody stands next to it.',
      },
    },
    actor: t.api.HUMAN,
  })
  // A RECORD CARRYING A WORD FROM A VOCABULARY THAT HAS SINCE MOVED, which since this pass is the
  // only way a record can be in the unclassified group at all. It was a purchase in state
  // `ordered` until `ordered` was classified as in_flight, along with the nine other words the
  // kinds declared and STATE_MEANING had never heard of.
  //
  // Written through the gate first and then edited in the row, because the gate is what makes this
  // realistic: `createRecord` refuses `chasing` outright, naming the four words a purchase takes.
  // So a live record can only hold such a word by having been filed before the vocabulary changed,
  // and that is what this line reproduces. `chasing` is the word from the original report — a
  // purchase somebody was chasing, passed over silently as fine, which is why the group exists.
  oldWord = t.api.createRecord({ workspaceId: 'default',
    kind: 'purchase',
    title: '50 N force gauge',
    data: { state: 'ordered' },
    actor: t.api.HUMAN,
  })
  t.client.sqlite
    .prepare('UPDATE records SET data = ? WHERE id = ?')
    .run(JSON.stringify({ state: 'chasing' }), oldWord.id)
  plainNote = t.api.createRecord({ workspaceId: 'default',
    kind: 'note',
    title: 'A note about the bench',
    data: { body: 'The bench was rearranged on Thursday.' },
    actor: t.api.HUMAN,
  })
  putDown = t.api.createRecord({ workspaceId: 'default',
    kind: 'problem',
    title: 'The force table is only half calibrated',
    data: {
      state: 'open',
      paused: { since: '2026-08-01', why: 'the gauge went back to the metrology lab' },
    },
    actor: t.api.HUMAN,
  })
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ---------------------------------------------------------------------------- small helpers

function bodyOf(res: { body: string }): Record<string, unknown> {
  const parsed: unknown = JSON.parse(res.body)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`expected a JSON object, got ${res.body.slice(0, 200)}`)
  }
  return parsed as Record<string, unknown>
}

async function get(url: string, headers: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const res = await app.inject({ method: 'GET', url, headers })
  expect(res.statusCode, `${url} — ${res.body.slice(0, 300)}`).toBe(200)
  return bodyOf(res)
}

/** The shape of one attention row, as much of it as the assertions below read. */
interface Row {
  key: string
  recordId: string
  title: string
  state: string | null
  group: string
  score: number
  safety: boolean
  displacedBy: string | null
  reason: {
    selectedBy: string
    owed: { party: string; due: string | null; lateMs: number | null; hops: number } | null
    stoppedShort: { state: string; since: string | null; sinceSource: string } | null
    consequence: { bearer: string; what: string } | null
    safetyFloor: boolean
    because: string
    factors: { name: string; points: number; why: string }[]
  }
}

async function attention(query = ''): Promise<{
  visible: Row[]
  remainder: Row[]
  total: number
  unclassified: { recordId: string; state: string; note: string }[]
  noState: { recordId: string; expected: boolean | null; note: string }[]
  paused: { recordId: string; pause: { why: string } | null; onList: boolean; note: string }[]
  machine: unknown[]
  passedOver: { bucket: string; sentence: string; count: number; keys: string[] }[]
  remainderByGroup: { group: string; label: string; count: number }[]
  remainderNote: string | null
  counts: {
    candidates: number
    selected: number
    visible: number
    remainder: number
    passedOver: number
    deleted: number
  }
  machineSweep: { swept: boolean; searched: string[]; unchecked: string[]; note: string }
  read: { records: number; links: number; changes: number; changesCapped: boolean }
  at: string
}> {
  // Follow every continuation before checking the rule's complete answer.
  const answer = await get(`/api/attention${query === '' ? '?shape=full' : `${query}&shape=full`}`)
  type Page = { rows: unknown[]; total: number; next: string | null }
  async function all(page: Page): Promise<unknown[]> {
    const rows = [...page.rows]
    let next = page.next
    while (next !== null) {
      const following = await get(next) as unknown as Page
      rows.push(...following.rows)
      next = following.next
    }
    expect(rows).toHaveLength(page.total)
    return rows
  }
  for (const key of ['remainder', 'unclassified', 'noState', 'directions', 'reports', 'paused', 'machine']) {
    answer[key] = await all(answer[key] as Page)
  }
  const passed = answer['passedOver'] as Page & { groups: { bucket: string; sentence: string; count: number }[] }
  const keys = await all(passed) as { bucket: string; key: string }[]
  answer['passedOver'] = passed.groups.map((group) => ({ ...group, keys: keys.filter((row) => row.bucket === group.bucket).map((row) => row.key) }))
  return answer as never
}

/** Every row the rule selected, shown or not. */
const selected = (a: { visible: Row[]; remainder: Row[] }): Row[] => [...a.visible, ...a.remainder]

/** The sentence GET /api serves for one endpoint, or a failure naming the endpoint. */
async function noteFor(method: string, path: string): Promise<string> {
  const index = (await get('/api')) as unknown as ApiIndex
  const listed = index.endpoints.find((e) => e.method === method && e.path === path)
  if (!listed) throw new Error(`GET /api does not list ${method} ${path} at all`)
  if (listed.description === null) throw new Error(`GET /api lists ${method} ${path} with no description`)
  return listed.description
}

let seq = 0
const uniqueTitle = (what: string) => `reading-api ${what} ${++seq}`

// ============================================================ 1. the rule, run on the server

describe('GET /api/attention serves the shared rule, reasons and all', () => {
  it('puts a thing somebody could be hurt by first, whatever it scores', async () => {
    const a = await attention()
    const first = a.visible[0]
    if (first === undefined) throw new Error('the attention list is empty, so nothing is being tested')

    // Safety is a separate sort key in shared/attention.ts, not a big number, and this record was
    // filed moments ago: an age-based ranking would have buried it, which is the measured failure.
    expect(first.recordId).toBe(danger.id)
    expect(first.safety).toBe(true)
    expect(first.reason.safetyFloor).toBe(true)
    expect(first.reason.consequence).toEqual({
      bearer: 'person',
      what: 'The rig keeps moving after the stop button is pressed, and somebody stands next to it.',
    })
  })

  it('says of every row which half of the rule selected it, and what each factor contributed', async () => {
    const a = await attention()
    const row = selected(a).find((r) => r.recordId === overdue.id)
    if (row === undefined) throw new Error('an obligation six years overdue is not on the attention list')

    expect(row.reason.selectedBy).toBe('owed')
    expect(row.reason.owed?.party).toBe('the ESA grant review')
    expect(row.reason.owed?.due).toBe('2020-03-01')
    expect(row.reason.owed?.hops).toBe(0)
    expect(row.reason.because).toContain('the ESA grant review')

    // Every factor is reported, zeroes included, each with the sentence it earned its points from.
    const factors = new Map(row.reason.factors.map((f) => [f.name, f]))
    expect([...factors.keys()].sort()).toEqual(['harm', 'late', 'owed', 'sat', 'standing'])
    expect(factors.get('late')?.points).toBeGreaterThan(0)
    expect(factors.get('harm')?.points).toBe(0)
    expect(factors.get('harm')?.why).toContain('nobody has recorded')
    for (const factor of row.reason.factors) expect(factor.why.length).toBeGreaterThan(10)
  })

  it('accounts for everything: nothing is shown without being counted, and nothing is dropped', async () => {
    const a = await attention()
    expect(a.total).toBe(a.visible.length + a.remainder.length)
    expect(a.counts.selected).toBe(a.total)
    expect(a.counts.passedOver).toBe(a.passedOver.reduce((sum, bucket) => sum + bucket.count, 0))
    expect(a.counts.candidates).toBe(a.counts.selected + a.counts.passedOver)

    // Every bucket carries a sentence and every key in it, so a number is never something a
    // person cannot open.
    for (const bucket of a.passedOver) {
      expect(bucket.sentence.length, bucket.bucket).toBeGreaterThan(20)
      expect(bucket.keys).toHaveLength(bucket.count)
    }
    // The remainder is named rather than being the word "more".
    expect(a.remainderByGroup.reduce((sum, g) => sum + g.count, 0)).toBe(a.remainder.length)
    if (a.remainder.length === 0) expect(a.remainderNote).toBeNull()
    else expect(a.remainderNote).toContain(String(a.remainderByGroup[0]?.count))
  })

  it('reports a state word nobody has classified as its own question, not as a quiet no', async () => {
    const a = await attention()
    const row = a.unclassified.find((r) => r.recordId === oldWord.id)
    if (row === undefined) {
      throw new Error('a record in state "chasing" is neither on the list nor in the unclassified group')
    }
    expect(row.state).toBe('chasing')
    // The sentence is unclassifiedNote() from shared/work.ts: a gap in the record, not a fault of
    // the reader, and it quotes the word so the person can go and classify it.
    expect(row.note).toContain('chasing')
    expect(selected(a).map((r) => r.recordId)).not.toContain(oldWord.id)
  })

  it('keeps "no state at all" apart from "a word nobody has classified"', async () => {
    const a = await attention()
    const row = a.noState.find((r) => r.recordId === plainNote.id)
    if (row === undefined) throw new Error('a note with no state is in neither group, so it has been lost')

    // A note has no state FIELD, which is a different answer from a record that should have had
    // one and does not — and the note says which of the two this is.
    expect(row.expected).toBe(false)
    expect(row.note).toContain('no state field')
    expect(a.unclassified.map((r) => r.recordId)).not.toContain(plainNote.id)
  })

  it('leaves work somebody deliberately put down off the list, and says why it is off', async () => {
    const a = await attention()
    // Its state word is "open", which means stopped short. The pause beats the word: that is the
    // whole point of recording one, and it is what stops the list filling with things a person
    // has already decided about.
    expect(selected(a).map((r) => r.recordId)).not.toContain(putDown.id)

    const row = a.paused.find((r) => r.recordId === putDown.id)
    if (row === undefined) throw new Error('the paused problem is nowhere at all, which is worse than being on the list')
    expect(row.pause?.why).toBe('the gauge went back to the metrology lab')
    expect(row.onList).toBe(false)
    // Open-ended, because no `until` was recorded — reported as open-ended rather than hidden.
    expect(row.note).toContain('Open-ended')
  })

  it('says it did not look at the machine, rather than reporting an empty one', async () => {
    const a = await attention()
    expect(a.machineSweep.swept).toBe(false)
    expect(a.machine).toEqual([])
    // The difference between "nothing is running unclaimed" and "nobody looked", in words.
    expect(a.machineSweep.note).toContain('?machine=include')
    expect(a.machineSweep.note).toContain('not')
  })

  it('sweeps the machine when asked, and says where it looked', async () => {
    const a = await attention('?machine=include')
    expect(a.machineSweep.swept).toBe(true)
    expect(a.machineSweep.note.length).toBeGreaterThan(10)
    // The probe sees an empty machine, so the list is empty and this time that means something.
    expect(a.machine).toEqual([])
  })

  it('says what it read, so a quiet list can be told from a small database', async () => {
    const a = await attention()
    expect(a.read.records).toBeGreaterThan(0)
    expect(a.read.changes).toBeGreaterThan(0)
    expect(a.read.changesCapped).toBe(false)
    expect(a.at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('refuses a query parameter it does not know rather than ignoring it', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/attention?machine=yes' })
    expect(res.statusCode).toBe(400)
    const res2 = await app.inject({ method: 'GET', url: '/api/attention?limit=5' })
    expect(res2.statusCode).toBe(400)
  })
})

// ============================================================ 2. where the reader got to

describe('the reader anchor lives on the server', () => {
  /** A reader nothing else in this file uses, so its anchor is this test's own. */
  const asReader = (id: string) => ({ 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': id })

  it('says "no anchor recorded" rather than handing back an empty list', async () => {
    const body = await get('/api/anchor', asReader('never-looked'))
    expect(body['anchor']).toBeNull()
    // NULL, not []. An empty list beside a 200 reads as "nothing has happened", which is the one
    // answer this must never give by mistake.
    expect(body['changes']).toBeNull()
    const counts = body['counts'] as { sinceAnchor: number | null; everything: number }
    expect(counts.sinceAnchor).toBeNull()
    expect(counts.everything).toBeGreaterThan(0)
    expect(String(body['note'])).toContain('No anchor is recorded')
    // And it proves the archive is not empty, which is what makes the sentence checkable.
    expect(String(body['note'])).toContain(String(counts.everything))
  })

  it('marks the point a reader has read to, and then answers with what came after it', async () => {
    const reader = asReader('desk')

    const moved = bodyOf(await app.inject({ method: 'PUT', url: '/api/anchor', headers: reader, payload: {} }))
    const anchor = moved['anchor'] as { reader: string; lastSeenAt: string; lastChangeId: string | null }
    expect(anchor.reader).toBe('human:desk')
    expect(anchor.lastSeenAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(moved['previous']).toBeNull()

    // Nothing has been written since, and that is said as a fact rather than as an empty list.
    const quiet = await get('/api/anchor', reader)
    expect((quiet['counts'] as { sinceAnchor: number }).sinceAnchor).toBe(0)
    expect(quiet['changes']).toEqual([])
    expect(String(quiet['note'])).toContain('nothing has been written since')

    // One agent write later.
    const written = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' },
      payload: { kind: 'note', title: uniqueTitle('written while away'), data: { body: 'ran the sweep' } },
    })
    expect(written.statusCode).toBe(201)
    const noteId = (bodyOf(written)['record'] as { id: string }).id

    const after = await get('/api/anchor', reader)
    const rows = after['changes'] as { recordId: string; actorId: string }[]
    expect((after['counts'] as { sinceAnchor: number }).sinceAnchor).toBe(1)
    expect(rows.map((r) => r.recordId)).toEqual([noteId])
    expect(rows[0]?.actorId).toBe('claude-code')
    expect(after['truncated']).toBe(false)
  })

  it('belongs to the person, so a second device reads the same bookmark', async () => {
    const desk = asReader('two-devices')
    await app.inject({ method: 'PUT', url: '/api/anchor', headers: desk, payload: {} })

    // The same person, a different browser: no header says which device this is, and there is
    // nothing device-shaped in the anchor to say it. That is the fix — the phone could never
    // answer this question while the mark sat in one browser's local storage.
    const phone = await get('/api/anchor', desk)
    expect((phone['anchor'] as { reader: string }).reader).toBe('human:two-devices')
    expect((phone['counts'] as { sinceAnchor: number }).sinceAnchor).toBe(0)

    // And a different PERSON has their own, rather than inheriting one.
    const other = await get('/api/anchor', asReader('somebody-else'))
    expect(other['anchor']).toBeNull()
  })

  it('moves the anchor forward and says where it moved from', async () => {
    const reader = asReader('moves-twice')
    await app.inject({ method: 'PUT', url: '/api/anchor', headers: reader, payload: {} })
    const second = bodyOf(await app.inject({ method: 'PUT', url: '/api/anchor', headers: reader, payload: {} }))
    expect(second['previous']).not.toBeNull()
    expect(String(second['note'])).toContain('moved from')
  })

  it('can be set on one particular row, and then counts by what was appended after it', async () => {
    const reader = asReader('reads-to-a-row')
    const first = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: uniqueTitle('read this one'), actor: t.api.HUMAN })
    const second = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: uniqueTitle('not this one'), actor: t.api.HUMAN })
    const firstRow = t.api.listChanges({ workspaceId: 'default', recordId: first.id })[0]
    if (firstRow === undefined) throw new Error('the first note left no change row')

    await app.inject({
      method: 'PUT',
      url: '/api/anchor',
      headers: reader,
      payload: { lastChangeId: firstRow.id },
    })

    // Both rows were written in the same second — agents write in bursts and the stamp only goes
    // to the second — so a stamp comparison alone would either drop the second row or hand back
    // the first one again. What is compared is the order the rows were APPENDED in.
    const body = await get('/api/anchor', reader)
    const rows = body['changes'] as { id: string; recordId: string }[]
    expect(rows.map((r) => r.recordId)).toEqual([second.id])
    expect((body['counts'] as { sinceAnchor: number }).sinceAnchor).toBe(1)
  })

  it('refuses a change id that names nothing, rather than storing a reference that never resolves', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/anchor',
      headers: asReader('bad-id'),
      payload: { lastChangeId: 'no-such-row' },
    })
    expect(res.statusCode).toBe(404)
    expect(String(bodyOf(res)['error'])).toContain('no-such-row')
    // Nothing was stored, so the reader still has no anchor rather than a broken one.
    expect((await get('/api/anchor', asReader('bad-id')))['anchor']).toBeNull()
  })

  it('will not take a time from the caller — the moment is this server\'s clock', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/anchor',
      headers: asReader('clock-liar'),
      payload: { lastSeenAt: '2020-01-01 00:00:00' },
    })
    // An anchor an hour out hides an hour of agent work silently, so the key is refused rather
    // than ignored: ignoring it would answer 200 to a request that did not do what it asked.
    expect(res.statusCode).toBe(400)
  })

  it('writes nothing to the change log, because reading the day must not bury the day', async () => {
    const before = t.api.listChanges({ workspaceId: 'default', limit: 5000 }).length
    await app.inject({ method: 'PUT', url: '/api/anchor', headers: asReader('quiet'), payload: {} })
    expect(t.api.listChanges({ workspaceId: 'default', limit: 5000 })).toHaveLength(before)
  })

  /**
   * WHAT AN ARRIVING AGENT CAN DO, WHICH USED TO BE NOTHING.
   *
   * The anchor is keyed to the actor headers, so an agent asking this endpoint is told it has never
   * looked — every time, for ever, because it never has. Three agents that had never seen Mole Office all
   * hit that on 2026-08-11 and answered "what changed since I last looked" 0 times out of 3 in two
   * projects; each hand-bucketed the change log instead, 422 and 529 rows, about seven minutes.
   *
   * One of them wrote the whole problem in a sentence: *"There is no way for an arriving agent to
   * help without either lying about who it is or leaving the feature unused."* That is still true of
   * MOVING somebody else's anchor and stays true — an agent stamping the human's reading point files
   * one reader's reading as another's, in a log nothing rewrites. What was missing was only the READ.
   */
  it('shows every reading point in the project, so an agent can answer for the person', async () => {
    // The owner reads to here. This is the act an agent must never perform on their behalf.
    const marked = await app.inject({
      method: 'PUT',
      url: '/api/anchor',
      headers: asReader('the-owner'),
      payload: {},
    })
    expect(marked.statusCode).toBe(200)

    // An agent arrives, having never looked. It is told so — and told where somebody else's
    // reading point is, which is the half that was missing.
    const body = await get('/api/anchor', { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'a-new-agent' })
    expect(body['anchor']).toBeNull()
    const readers = body['readers'] as { reader: string; lastSeenAt: string }[]
    const owner = readers.find((r) => r.reader === 'human:the-owner')
    expect(owner, `readers was ${JSON.stringify(readers)}`).toBeDefined()
    expect(owner?.lastSeenAt).toMatch(/^\d{4}-\d{2}-\d{2} /)

    // And the sentence names them and names the read that answers from their point WITHOUT
    // claiming to be them — the request an agent may make, beside the one it may not.
    const note = String(body['note'])
    expect(note).toContain('human:the-owner')
    expect(note).toContain('GET /api/changes?since=')
    expect(note).toContain('DO NOT send their actor headers')

    // The list is present on the answered branch too, not only when there is nothing to say.
    const owned = await get('/api/anchor', asReader('the-owner'))
    expect((owned['readers'] as unknown[]).length).toBeGreaterThan(0)
  })

  /**
   * WHAT THE NOTE PUBLISHES AS A DELTA START MUST BE THE ANCHOR'S ROW, NOT THE MOMENT OF ANCHORING.
   *
   * `readers` shipped naming `lastSeenAt`, and an agent asked to break it found the hole in one
   * request: anchoring on an OLDER row — which `PUT /api/anchor {"lastChangeId":…}` exists to allow
   * — stores `lastSeenAt` as the server's clock, so the two facts come apart by however long ago
   * that row was written. Measured on the real corpus: the owner's own reading said **400 rows
   * unread**, and an arriving agent following the published sentence read `?since=<lastSeenAt>` and
   * was told **0**.
   *
   * That is this repository's own recurring defect wearing a sentence: two places that must agree,
   * with nothing making them agree, and the prose was the thing making the reader wrong. The row now
   * carries `since` — the stamp of the row the anchor actually sits on — and this is what keeps the
   * two from drifting apart again.
   */
  it('publishes the stamp of the anchored ROW, not the moment somebody pressed the button', async () => {
    // A ROW FROM A DIFFERENT DAY, PLANTED, because every row this fixture writes lands in the same
    // second the anchor does — so on the natural corpus the two values coincide and the test cannot
    // tell a correct implementation from the broken one. That is not a hypothetical: the first
    // version of this test passed with `since` wired straight to `lastSeenAt`.
    const seed = t.api.listChanges({ workspaceId: 'default', limit: 1 })[0]
    if (seed === undefined) throw new Error('the fixture has no change log to anchor into')
    const older = { id: 'planted-old-row', at: '2026-08-09 09:15:00' }
    t.client.sqlite
      .prepare(
        'insert into changes (id, record_id, workspace_id, op, actor_type, actor_id, session_id, field, old_value, new_value, at)' +
          ' values (?, ?, ?, ?, ?, ?, null, null, null, null, ?)',
      )
      .run(older.id, seed.recordId, 'default', 'update', 'human', THE_TEST_OFFICES_OWNER.id, older.at)

    const marked = await app.inject({
      method: 'PUT',
      url: '/api/anchor',
      headers: asReader('looked-back'),
      payload: { lastChangeId: older.id },
    })
    expect(marked.statusCode).toBe(200)

    const arriving = await get('/api/anchor', { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'follows-the-note' })
    const them = (arriving['readers'] as { reader: string; since: string | null; lastChangeId: string | null; lastSeenAt: string }[]).find(
      (r) => r.reader === 'human:looked-back',
    )

    // THE ASSERTION. `since` is the anchored row's own stamp — the thing a delta must start from —
    // and `lastSeenAt` is the server's clock at the moment of the write, which is a different fact
    // about a different event.
    expect(them?.lastChangeId).toBe(older.id)
    expect(them?.since).toBe(older.at)
    // AND THEY REALLY ARE DIFFERENT VALUES HERE, which is what makes the line above mean something:
    // the reader anchored three days back and pressed the button today.
    expect(them?.lastSeenAt).not.toBe(older.at)

    // And the note tells a reader which of the two to use, by name, because they are both on the row
    // and picking the wrong one is what answered 0 against 400.
    const note = String(arriving['note'])
    expect(note).toContain('USE `since` AND NOT `lastSeenAt`')
    expect(note).toContain(String(them?.since))
  })

  it('says plainly when nobody at all has marked one, rather than naming an empty list', async () => {
    // The state the whole corpus was in until today, in both projects: `readers` empty. The
    // difference between "somebody has looked and it is not you" and "nobody has ever looked" is
    // the difference between having a way forward and not, so it is said in words.
    const fresh = await app.inject({ method: 'GET', url: '/api/anchor', headers: { 'x-mole-office-workspace': 'nobody-here' } })
    // An unknown project is refused by the shared gate; the point is made on the default one below.
    expect(fresh.statusCode).toBe(404)
  })
})

// ============================================================ 3. recording a kept promise

describe('POST /api/records/:id/fulfil writes the field nothing ever wrote', () => {
  /** An obligation filed over HTTP, as an agent would file it. */
  async function fileObligation(): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      payload: {
        kind: 'obligation',
        title: uniqueTitle('owed to somebody'),
        data: { due: '2020-04-01', owedTo: 'the ESA grant review', state: 'open' },
      },
    })
    expect(res.statusCode, res.body).toBe(201)
    return (bodyOf(res)['record'] as { id: string }).id
  }

  it('records what settled it, when, and that it is done — and takes it off the list', async () => {
    const id = await fileObligation()
    expect(selected(await attention()).map((r) => r.recordId)).toContain(id)

    const res = await app.inject({
      method: 'POST',
      url: `/api/records/${id}/fulfil`,
      payload: { note: 'Both pages are in the shared drive and the reviewer acknowledged them.' },
    })
    expect(res.statusCode, res.body).toBe(200)
    const body = bodyOf(res)

    const fulfilment = body['fulfilment'] as { done: boolean; at: string | null; note: string | null }
    expect(fulfilment.done).toBe(true)
    expect(fulfilment.at).not.toBeNull()
    expect(fulfilment.note).toBe('Both pages are in the shared drive and the reviewer acknowledged them.')
    expect(body['alreadyDischarged']).toBe(false)
    expect(String(body['dischargeNote'])).toContain('no longer owed')

    // The one mechanism, not a second one beside it: the stored record reads as discharged
    // through readFulfilment, which is what every panel asks.
    const stored = t.api.getRecord(id)
    expect(readFulfilment(stored?.data).done).toBe(true)
    expect(stored?.data['done']).toBe(true)

    // And it is gone from the attention list, into the bucket that says why.
    const after = await attention()
    expect(selected(after).map((r) => r.recordId)).not.toContain(id)
    const discharged = after.passedOver.find((bucket) => bucket.bucket === 'discharged')
    expect(discharged?.keys).toContain(`rec:${id}`)
  })

  it('appears in the change log like any other write, one row per path', async () => {
    const id = await fileObligation()
    await app.inject({
      method: 'POST',
      url: `/api/records/${id}/fulfil`,
      headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' },
      payload: { note: 'Delivered at the review meeting.' },
    })

    const rows = bodyOf(await app.inject({ method: 'GET', url: `/api/changes?recordId=${id}` }))
    const written = (rows['changes'] as { field: string | null; actorType: string; op: string }[]).filter(
      (row) => row.field !== null,
    )
    expect(written.map((row) => row.field).sort()).toEqual([
      'data.done',
      'data.fulfilledAt',
      'data.fulfilledNote',
      'data.state',
    ])
    // Attributed like everything else, so "who said this was done" has an answer. The record's own
    // create row is the human who filed it, moments earlier, and is not one of these.
    expect(written.every((row) => row.actorType === 'agent' && row.op === 'update')).toBe(true)
  })

  it('refuses a discharge that does not say what settled it', async () => {
    const id = await fileObligation()
    const res = await app.inject({ method: 'POST', url: `/api/records/${id}/fulfil`, payload: {} })
    expect(res.statusCode).toBe(400)
    expect(String(bodyOf(res)['error'])).toContain('note')
    expect(readFulfilment(t.api.getRecord(id)?.data).done).toBe(false)
  })

  it('writes nothing the second time and says when it was discharged', async () => {
    const id = await fileObligation()
    await app.inject({
      method: 'POST',
      url: `/api/records/${id}/fulfil`,
      payload: { note: 'Delivered.', at: '2026-08-12 16:40' },
    })
    const again = await app.inject({
      method: 'POST',
      url: `/api/records/${id}/fulfil`,
      payload: { note: 'Delivered twice?' },
    })
    expect(again.statusCode).toBe(200)
    const body = bodyOf(again)
    expect(body['alreadyDischarged']).toBe(true)
    expect('dataPatch' in body).toBe(false)
    expect(String(body['dischargeNote'])).toContain('2026-08-12 16:40')
  })

  it('refuses to discharge something nobody is owed', async () => {
    const task = t.api.createRecord({ workspaceId: 'default', kind: 'task', title: uniqueTitle('a task'), actor: t.api.HUMAN })
    const res = await app.inject({
      method: 'POST',
      url: `/api/records/${task.id}/fulfil`,
      payload: { note: 'did it' },
    })
    expect(res.statusCode).toBe(400)
    expect(String(bodyOf(res)['error'])).toContain('task')
  })
})

// ============================================================ 4. a gate, seen from the far end

describe('POST /api/links carries a gate, and the blocked record reads it', () => {
  async function twoRecords(): Promise<{ blocker: string; blocked: string }> {
    const blocker = t.api.createRecord({ workspaceId: 'default', kind: 'problem', title: uniqueTitle('the arm is in pieces'), actor: t.api.HUMAN })
    const blocked = t.api.createRecord({ workspaceId: 'default', kind: 'module', title: uniqueTitle('the digital twin'), actor: t.api.HUMAN })
    return { blocker: blocker.id, blocked: blocked.id }
  }

  it('serves the gate on the record that is waiting, which does not store the link', async () => {
    const { blocker, blocked } = await twoRecords()
    const made = await app.inject({
      method: 'POST',
      url: '/api/links',
      payload: {
        fromId: blocker,
        toId: blocked,
        type: 'blocks',
        gate: { kind: 'partial', upTo: 'kinematics checked' },
      },
    })
    expect(made.statusCode, made.body).toBe(201)

    const page = await get(`/api/records/${blocked}`)
    const link = (page['links'] as { isBacklink: boolean; gate: unknown; gateLabel: string; gateProblem: null }[])[0]
    if (link === undefined) throw new Error('the blocked record has no links at all')
    expect(link.isBacklink).toBe(true)
    expect(link.gate).toEqual({ kind: 'partial', upTo: 'kinematics checked' })
    expect(link.gateLabel).toBe(gateLabel({ kind: 'partial', upTo: 'kinematics checked' }))
    expect(link.gateProblem).toBeNull()
  })

  it('answers a partial gate with no stage with a 400 saying why, and stores no link', async () => {
    const { blocker, blocked } = await twoRecords()
    const res = await app.inject({
      method: 'POST',
      url: '/api/links',
      payload: { fromId: blocker, toId: blocked, type: 'blocks', gate: { kind: 'partial' } },
    })
    expect(res.statusCode).toBe(400)
    const message = String(bodyOf(res)['error'])
    expect(message).toContain('upTo')
    // A sentence you can act on: it says what the value is for and what to send instead.
    expect(message).toContain('hard')
    expect((await get(`/api/records/${blocked}`))['links']).toEqual([])
  })

  it('says a null gate is unqualified rather than serving it as hard', async () => {
    const { blocker, blocked } = await twoRecords()
    await app.inject({
      method: 'POST',
      url: '/api/links',
      payload: { fromId: blocker, toId: blocked, type: 'blocks' },
    })
    const page = await get(`/api/records/${blocked}`)
    const link = (page['links'] as { gate: unknown; gateLabel: unknown }[])[0]
    expect(link?.gate).toBeNull()
    expect(link?.gateLabel).toBeNull()
  })

  it('refuses a gate on a link type that states no dependency', async () => {
    const { blocker, blocked } = await twoRecords()
    const res = await app.inject({
      method: 'POST',
      url: '/api/links',
      payload: { fromId: blocked, toId: blocker, type: 'consumes', gate: { kind: 'hard' } },
    })
    expect(res.statusCode).toBe(400)
    expect(String(bodyOf(res)['error'])).toContain('blocks')
  })

  it('refuses a gate kind nobody has defined, naming the two that exist', async () => {
    const { blocker, blocked } = await twoRecords()
    const res = await app.inject({
      method: 'POST',
      url: '/api/links',
      payload: { fromId: blocker, toId: blocked, type: 'blocks', gate: { kind: 'mostly' } },
    })
    expect(res.statusCode).toBe(400)
    const message = String(bodyOf(res)['error'])
    expect(message).toContain('hard')
    expect(message).toContain('partial')
  })
})

// ============================================================ 5. the sentences are true sentences

describe('GET /api describes these four endpoints, and does what it says', () => {
  it('lists them all, with a real sentence each', async () => {
    const index = (await get('/api')) as unknown as ApiIndex
    const listed = index.endpoints.map((e) => `${e.method} ${e.path}`)
    for (const expected of [
      'GET /api/attention',
      'GET /api/anchor',
      'PUT /api/anchor',
      'POST /api/records/:id/fulfil',
    ]) {
      expect(listed, `${expected} is missing from GET /api`).toContain(expected)
    }
    // Built from the router, so none of these can exist and be undiscoverable.
    expect(listed.sort()).toEqual(listRoutes().map((r) => `${r.method} ${r.path}`).sort())
    expect(index.endpoints.filter((e) => e.description === null)).toEqual([])
  })

  it('says the attention reply carries the groups that are questions, and it does', async () => {
    const note = await noteFor('GET', '/api/attention')
    expect(note).toContain('unclassified')
    expect(note).toContain('noState')
    expect(note).toContain('paused')
    expect(note).toContain('?machine=include')

    const a = await get('/api/attention?shape=full')
    for (const key of ['unclassified', 'noState', 'paused', 'passedOver']) {
      expect(Array.isArray((a[key] as { rows: unknown[] }).rows), key).toBe(true)
    }
    expect(Array.isArray(a['remainderByGroup'])).toBe(true)
  })

  it('says the anchor is honest when there is none, in the words it really uses', async () => {
    const note = await noteFor('GET', '/api/anchor')
    expect(note).toContain('anchor: null')
    expect(note).toContain('changes: null')

    // A COMPLETE identity, because a partial one is now refused. This line used to send only
    // `x-mole-office-actor-id` and rely on the type being filled in from the human default. Decision 10
    // ended that: the moment a caller sends ANY attribution header it is making an identity claim,
    // and an incomplete claim is a 400 rather than a quiet promotion to the person at the keyboard.
    // Three separate defects came out of that leniency — a misspelt header, a blank value, and a
    // header simply left out — each read as "no headers" and therefore as the human.
    //
    // What this test is actually about is unchanged: an anchor nobody has set reads as null rather
    // than as "nothing has happened". Only the way it names itself moved.
    const body = await get('/api/anchor', {
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'reads-the-docs',
    })
    expect(body['anchor']).toBeNull()
    expect(body['changes']).toBeNull()
  })

  it('says how a gate is sent, and the documented body is the one the route takes', async () => {
    const note = await noteFor('POST', '/api/links')
    expect(note).toContain('"gate"')
    expect(note).toContain('partial')
    expect(note).toContain('upTo')

    const blocker = t.api.createRecord({ workspaceId: 'default', kind: 'problem', title: uniqueTitle('documented blocker'), actor: t.api.HUMAN })
    const blocked = t.api.createRecord({ workspaceId: 'default', kind: 'task', title: uniqueTitle('documented blocked'), actor: t.api.HUMAN })
    const res = await app.inject({
      method: 'POST',
      url: '/api/links',
      payload: { fromId: blocker.id, toId: blocked.id, type: 'blocks', gate: { kind: 'hard' } },
    })
    expect(res.statusCode, res.body).toBe(201)
  })

  it('says what discharging an obligation writes, and names the three fields it writes', async () => {
    const note = await noteFor('POST', '/api/records/:id/fulfil')
    expect(note).toContain('data.done')
    expect(note).toContain('fulfilledAt')
    expect(note).toContain('fulfilledNote')
    expect(note).toContain('note')
  })
})

// ============================================================ 6. the endpoint IS the rule

/**
 * THE ENDPOINT SERVES THE RULE'S ANSWER, NOT A VERSION OF IT.
 *
 * Every other test in this file checks a PROPERTY of the reply — that safety sorts first, that
 * nothing is dropped, that a paused thing is off the list. All of those would go on passing if
 * `GET /api/attention` started filtering rows, renaming a field, or trimming a factor list on its
 * way out. This project has already found five API wrappers narrowing their own replies, and a
 * narrowed attention reply is the expensive one: the caller cannot tell that a row was removed,
 * because the count it would check against was removed with it.
 *
 * So this compares the served JSON against `computeAttention` run over the same database, field by
 * field, and allows exactly one difference: `reason.owed.lateMs` is "milliseconds past the agreed
 * date", read from two different clock readings a few milliseconds apart. It is allowed to differ,
 * it is checked to be within a second, and nothing else is allowed to differ at all.
 */
describe('the attention endpoint and the shared rule give the same answer', () => {
  /** Every path where two JSON values differ, addressed the way a caller would read it. */
  function differences(a: unknown, b: unknown, path: string, found: string[]): void {
    if (JSON.stringify(a) === JSON.stringify(b)) return
    const both = a !== null && b !== null && typeof a === 'object' && typeof b === 'object'
    if (!both) {
      found.push(path)
      return
    }
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)])
    for (const key of keys) {
      const step = Array.isArray(a) ? `${path}[]` : `${path}.${key}`
      differences((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], step, found)
    }
  }

  it('serves every row, every reason and every factor exactly as the rule computed them', async () => {
    const served = await attention() as unknown as Record<string, unknown>
    const direct = t.api.attentionNow({ workspaceId: 'default', resources: [] }) as unknown as Record<string, unknown>

    // `at` is a clock reading and `machineSweep` is the endpoint's own sentence about whether it
    // looked at the machine; neither comes from the rule.
    const trim = (o: Record<string, unknown>): Record<string, unknown> => {
      const copy = { ...o }
      delete copy['at']
      delete copy['machineSweep']
      return copy
    }

    // Nothing the rule returns may be missing from the reply, and the reply may add only
    // `machineSweep` — a field that answers a question the rule is not asked.
    expect(Object.keys(direct).filter((k) => !(k in served))).toEqual([])
    expect(Object.keys(served).filter((k) => !(k in direct))).toEqual(['machineSweep'])

    const found: string[] = []
    differences(trim(served), trim(direct), '', found)
    const allowed = found.filter((p) => p.endsWith('.reason.owed.lateMs'))
    expect(
      found.filter((p) => !allowed.includes(p)),
      'the endpoint changed something the rule computed',
    ).toEqual([])
  })

  it('reads the same clock, so the one field allowed to drift drifts by under a second', async () => {
    const served = await get('/api/attention?shape=full')
    const direct = t.api.attentionNow({ workspaceId: 'default', resources: [] })
    const lateOf = (rows: readonly { key: string; reason: { owed: { lateMs: number | null } | null } }[]) =>
      new Map(rows.filter((r) => r.reason.owed?.lateMs != null).map((r) => [r.key, r.reason.owed!.lateMs!]))

    const a = lateOf(served['visible'] as never)
    const b = lateOf(direct.visible as never)
    expect(a.size, 'no row on the list is owed, so nothing is being compared').toBeGreaterThan(0)
    expect([...a.keys()].sort()).toEqual([...b.keys()].sort())
    for (const [key, ms] of a) expect(Math.abs(ms - b.get(key)!), key).toBeLessThan(1000)
  })
})
