// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE QUEUE PAGE SAYS NAMES, SHORT TIMES, AND THE PRESS ONLY WHERE IT MOVES SOMETHING (wave 13p round 31),
 * AND WHAT A RESOLVING ENTRY WAITS FOR (tier 2 of the owner's decision; XHY2fVFG3Qq8, answer 7;
 * N9xbH7cM6HPB).
 *
 * Every record here is a synthetic fixture in a throwaway database; nothing reaches the live server. The moved entry is
 * moved by wave 13t's own door, `moveToTheFront` in src/server/lib/merge-state-machine.ts, as the person. Case 5 draws a
 * reply made up for it, typed from the shared types; tests/a-conflict-no-rule-joins-goes-to-its-supervisor.test.ts
 * drives an entry to resolving in a test database and proves the server sends such a row.
 *
 * WHAT IS PROVED
 *
 *   1. NAMES. The server names each entry the page mentions by its wave, read off the git branch, and its run's title
 *      without a leading "Wave 13p, ": the lane holder, the bus's driver (a merged entry not in the reply), a rider
 *      whose run has no record (its own title), an entry with no branch (its title alone), and an entry of another
 *      project (said as that, not named). The page's sentences say those names and no entry id; each row still has its
 *      id small beside its title.
 *   3. SHORT TIMES. The bus box says "It passed at 01:24." on the bus's own day and adds the day on another; no sentence
 *      carries a stored stamp.
 *   4. THE PRESS. The server offers it only on entries a move to the front would move: not on the lane's holder, the
 *      moved entry, a rider, the entry the bus passed over (the tool hands the bus's seats on before a moved entry), an
 *      entry with only those ahead of it, nor the first of a lane, and the page draws it on exactly those.
 *   5. A RESOLVING ENTRY. Its chip says "with its supervisor". Its row says the conflict's files and the end of its
 *      supervisor's hour, worked out from `since` and `timeZone` and drawn on the reader's clock, or that the end cannot
 *      be read; that no resolve brief was written; that nobody started the brief, with no status number and none of the
 *      door's words; a resolution handed over, or refused by the merge tool. A pinned or judged entry says its
 *      resolution passed the check. No row says the brief's path, the agent asked or the stored sentences.
 *   6. A RESOLVING ENTRY HANDED ON FOR TESTS RED ONLY WITH IT (wave 13u round 63). Its row says the red tests and the end
 *      of its time to fix, or that the end cannot be read; that no fix brief was written; that nobody started it; a fix
 *      handed over, or refused by the merge tool; and a pinned entry says its fix passed the check. None of it says
 *      "conflict" or "resolution".
 *
 * WHAT WOULD MAKE EACH CASE GO RED, each run after a control run and restored; the round's report says the results.
 *   the page's holder line says `holder.entry` instead of its name             → case 1, the page
 *   theWaveOf hands the branch back whole                                      → case 1, the server
 *   shortTime hands the stored stamp back                                      → case 3
 *   theMovable drops the test for an entry ahead that does not stay ahead     → case 4, both
 *   theMovable leaves the bus's seats out of what stays ahead                  → case 4, both
 *   the page draws the press on every row a person sees                        → case 4, the page
 *   the page draws `since` as the hour's end instead of an hour after it       → case 5, the hour
 *   the nobody-started line carries the door's status                          → case 5, nobody started
 *   the refused line is never chosen                                           → case 5, refused
 *   the passed line is not said on a judged entry                              → case 5, passed
 *   the page reads a red hand-on as a conflict                                 → case 6
 *   the fix's passed line is never chosen                                      → case 6, passed
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { MergeQueueReply, QueueEntryRow } from '../src/shared/merge-queue-page.ts'
import type { Resolution, Resolving } from '../src/shared/merge-queue.ts'
import { clockStamp } from '../src/shared/time.ts'
import { englishWords } from '../src/shared/words/joined.ts'

// The page's English words: en.ts joined with every wave's file, where this wave's words are.
const en = englishWords()
const WORKSPACE = 'default'
const LANE_A = '/synthetic/lane-a'
const LANE_B = '/synthetic/lane-b'
const office = { type: 'agent' as const, id: 'mole-office/the-message-worker' }
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const LIVE = 'submitted,pinned,judged,integrating,reinspecting,testing,landing,resolving'
/** The page is drawn as of noon on the bus's own day, and as of noon the day after. */
const THE_BUS_DAY = new Date(2026, 9, 8, 12, 0, 0)
const THE_DAY_AFTER = new Date(2026, 9, 9, 12, 0, 0)

let t: TestDb
let reply: MergeQueueReply
const id: Record<string, string> = {}

/** A merge entry written as the queue writes it, in `workspaceId`. Synthetic. */
async function anEntry(name: string, state: string, more: Record<string, unknown>, workspaceId = WORKSPACE): Promise<string> {
  const door = await import('../src/server/lib/merge-entry-door.ts')
  id[name] = door.asTheMergeQueue(() =>
    t.api.createRecord({
      kind: 'merge_entry',
      title: `Synthetic merge entry ${name}`,
      workspaceId,
      actor: office,
      origin: 'fixture',
      data: {
        run: `synthetic-run-${name}`,
        seal: { id: `synthetic-seal-${name}`, hash: `synthetic-hash-${name}` },
        changeset: { adapter: 'files', root: LANE_A, operations: [] },
        state,
        submittedBy: { kind: 'agent', id: 'synthetic-worker' },
        ...more,
      },
    }),
  ).id
  return id[name]
}

/** A git changeset from `branch`, landing in `root`. Synthetic. */
const fromBranch = (branch: string, root: string) => ({
  adapter: 'git',
  root,
  repository: 'synthetic-repository',
  branch,
  commit: 'synthetic-commit',
  base: 'synthetic-base',
})

/** A run record titled `title`, the run an entry names. Synthetic. */
function aRun(title: string): string {
  return t.api.createRecord({
    kind: 'session',
    title,
    workspaceId: WORKSPACE,
    actor: { type: 'agent', id: 'synthetic-runner' },
    origin: 'fixture',
    data: { state: 'finished' },
  }).id
}

beforeAll(async () => {
  t = await freshDb()
  const queue = await import('../src/server/lib/merge-queue.ts')
  const machine = await import('../src/server/lib/merge-state-machine.ts')
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'synthetic-other', title: 'Synthetic other project' })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 8, 1, 0, 0))
  const markAt = (entry: string, at: Date): void => {
    vi.setSystemTime(at)
    queue.moveEntry({ id: entry, to: 'judged', actor: office })
  }

  // LANE A: the holder testing now, an entry moved to the front, two riders of the last bus, an entry that bus passed
  // over, and one still being checked. The last bus was driven by an entry that has landed since. The second rider has
  // the first ahead of it, so only the rider rule keeps the press off it.
  const sidebar = aRun('Wave 13p, round 31: draw the docs sidebar')
  const clock = aRun('Wave 9h: fix the clock')
  await anEntry('holder', 'testing', { occupies: LANE_A, run: sidebar, changeset: fromBranch('wave-13p-supervisor', LANE_A) })
  const rider = await anEntry('rider', 'submitted', { changeset: fromBranch('my-own-branch', LANE_A) })
  const secondRider = await anEntry('second-rider', 'submitted', {})
  const passedOver = await anEntry('passed-over', 'submitted', {})
  await anEntry('checking', 'submitted', {})
  const moved = await anEntry('moved', 'judged', { verdict: { at: '2026-10-08 01:00:00' } })
  vi.setSystemTime(new Date(2026, 9, 8, 1, 30, 0))
  machine.moveToTheFront({ workspaceId: WORKSPACE, id: moved, because: 'it unblocks the release', actor: { type: 'human', id: THE_PERSON } })
  await anEntry('driver', 'merged', {
    run: clock,
    changeset: fromBranch('wave-9h-builder', LANE_A),
    integrated: { at: '2026-10-08 01:30:00' },
    tested: { at: '2026-10-08 01:24:48', green: true, testedWith: { bus: [{ entry: rider }, { entry: secondRider }], passedForACheck: [passedOver] } },
  })
  markAt(rider, new Date(2026, 9, 8, 2, 0, 0))
  markAt(secondRider, new Date(2026, 9, 8, 2, 2, 0))
  markAt(passedOver, new Date(2026, 9, 8, 2, 5, 0))

  // LANE B: held by an entry of another project; one waiting entry first in this project's list, one behind it.
  await anEntry('elsewhere', 'testing', { occupies: LANE_B, changeset: fromBranch('wave-7a-other', LANE_B) }, 'synthetic-other')
  const first = await anEntry('first-in-b', 'submitted', { changeset: fromBranch('wave-13p-supervisor', LANE_B) })
  await anEntry('second-in-b', 'submitted', { changeset: fromBranch('wave-13p-supervisor', LANE_B) })
  markAt(first, new Date(2026, 9, 8, 3, 0, 0))
  vi.useRealTimers()

  const app = (await apiApp()).app
  await app.ready()
  try {
    const got = await app.inject({ method: 'GET', url: `/api/merge-queue?state=${LIVE}`, headers: AS_THE_PERSON })
    expect(got.statusCode, got.body).toBe(200)
    reply = got.json() as MergeQueueReply
  } finally {
    await app.close()
  }
}, 180_000)

afterAll(() => {
  vi.useRealTimers()
  t?.close()
})

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

/** The page's text as a reader reads it, the small ids beside titles and seats left out, entities read back. */
function theWords(html: string): string {
  return html
    .replace(/<code class="mq-id">[^<]*<\/code>/gu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&#x27;/gu, "'")
    .replace(/\s+/gu, ' ')
}

/** Each lane's rows, by entry id, with whether each offers the press. */
function thePresses(html: string): string[] {
  return [...html.matchAll(/<li class="mq-row" data-entry="([^"]+)"[^>]*>([\s\S]*?)<\/li>/gu)]
    .filter((m) => m[2]!.includes(en['mergeQueuePage.press.open']))
    .map((m) => m[1]!)
}

describe('names, not ids, in sentences', () => {
  it('the server names each entry by its wave and its run title, and says which it cannot name', () => {
    const names = reply.page.names
    expect(names[id['holder']!]).toEqual({ wave: '13p', work: 'round 31: draw the docs sidebar' })
    expect(names[id['driver']!]).toEqual({ wave: '9h', work: 'fix the clock' })
    expect(names[id['rider']!]).toEqual({ wave: 'my-own-branch', work: 'Synthetic merge entry rider' })
    expect(names[id['passed-over']!]).toEqual({ wave: null, work: 'Synthetic merge entry passed-over' })
    expect(names[id['elsewhere']!]).toBe('another-project')
  })

  it('the page says the names and no entry id, and keeps each row’s id small beside its title', async () => {
    const page = await thePage()
    const html = renderToStaticMarkup(h(page.TheMergeQueue, { reply, now: THE_BUS_DAY }))
    const words = theWords(html)
    expect(words).toContain('13p\'s “round 31: draw the docs sidebar” holds this lane.')
    expect(words).toContain('Testing now: 13p\'s “round 31: draw the docs sidebar”.')
    expect(words).toContain('Last bus: driven by 9h\'s “fix the clock”, 3 entries aboard.')
    expect(words).toContain('Waits for the lane, which 13p\'s “round 31: draw the docs sidebar” holds.')
    expect(words).toContain('An entry of another project holds this lane.')
    expect(words).toContain('Waits for the lane, which an entry of another project holds.')
    for (const one of Object.values(id)) expect(words, `the id ${one} is in a sentence`).not.toContain(one)
    for (const row of reply.page.lanes.flatMap((one) => one.order)) expect(html).toContain(`<code class="mq-id">${row}</code>`)
  })
})

describe('short times', () => {
  it('says the hour and minute on the bus’s own day, the day as well on another, and no stored stamp', async () => {
    const page = await thePage()
    const sameDay = theWords(renderToStaticMarkup(h(page.TheMergeQueue, { reply, now: THE_BUS_DAY })))
    expect(sameDay).toContain('It passed at 01:24.')
    expect(sameDay).not.toMatch(/\d{4}-\d{2}-\d{2}/u)
    const dayAfter = theWords(renderToStaticMarkup(h(page.TheMergeQueue, { reply, now: THE_DAY_AFTER })))
    expect(dayAfter).toMatch(/It passed at 01:24 on 8 Oct\w*\./u)
    expect(dayAfter).not.toMatch(/\d{4}-\d{2}-\d{2}/u)
  })
})

describe('the press only where it moves something', () => {
  it('the server offers it on the entries a move would move, and the page draws it on exactly those', async () => {
    const lanes = Object.fromEntries(reply.page.lanes.map((one) => [one.lane, one]))
    expect(lanes[LANE_A]!.order).toEqual([id['holder'], id['moved'], id['rider'], id['second-rider'], id['passed-over'], id['checking']])
    // NOTHING IN LANE A: behind the holder and the move, the bus's seats go first, and a move of the entry still being
    // checked would put it behind them all the same.
    expect(lanes[LANE_A]!.movable).toEqual([])
    expect(lanes[LANE_B]!.order).toEqual([id['first-in-b'], id['second-in-b']])
    expect(lanes[LANE_B]!.movable).toEqual([id['second-in-b']])
    const page = await thePage()
    const html = renderToStaticMarkup(h(page.TheMergeQueue, { reply, now: THE_BUS_DAY }))
    expect(thePresses(html)).toEqual([id['second-in-b']])
  })
})

// ---- 5. A RESOLVING ENTRY'S ROW, drawn from a reply made up for it ----

const LANE_R = '/synthetic/lane-r'
/** The supervisor's hour starts at 10:20 on the reader's own clock, so it ends there at 11:20. */
const THE_HOUR_STARTS = clockStamp(() => new Date(2026, 9, 8, 10, 20, 0))

/** A conflict in two files handed to the entry's own supervisor at 10:20, asked with a brief. Synthetic. */
function aConflict(more: Partial<Resolving> = {}): Resolving {
  return {
    files: ['src/a.ts', 'src/b.ts'],
    says: 'Synthetic: the words the bounce would have used.',
    since: THE_HOUR_STARTS.instant,
    timeZone: THE_HOUR_STARTS.timeZone,
    asked: { agent: 'synthetic-supervisor', brief: '/synthetic/sandbox/briefs/resolve-synthetic.md', message: 'synthetic-asking-message' },
    ...more,
  }
}

/** A resolution handed over at `at`. Synthetic. */
function aResolution(at: string, more: Partial<Resolution> = {}): Resolution {
  return {
    commit: 'synthetic-resolution-commit',
    workingDirectory: '/synthetic/resolution-copy',
    mainAt: 'synthetic-main',
    files: [{ path: 'src/a.ts', hash: null, mode: null }],
    by: { kind: 'agent', id: 'synthetic-supervisor' },
    at,
    ...more,
  }
}

/** A reply of GET /api/merge-queue with one free lane holding `rows` in this order. Made up for this case. */
function aReplyOf(rows: { id: string; state: string; machine: { resolving?: Resolving; resolution?: Resolution } }[]): MergeQueueReply {
  const entries: QueueEntryRow[] = rows.map((one) => ({
    id: one.id,
    title: `Synthetic entry ${one.id}`,
    state: one.state,
    lane: LANE_R,
    occupies: null,
    submittedAt: '2026-10-08 09:00:00',
    submittedBy: { kind: 'agent', id: 'synthetic-worker' },
    machine: one.machine,
  }))
  return {
    lanes: [{ lane: LANE_R, occupiedBy: null, entries }],
    // No emergency push in this lane (wave 13u round 82): the reply always carries the list, empty or not.
    emergencyPushes: [],
    says: `${rows.length} entries in 1 lane; 0 lanes are held right now.`,
    workspaceId: WORKSPACE,
    speed: {
      at: '2026-10-08 12:00:00',
      since: '2026-10-07 12:00:00',
      landed: 0,
      landedUnreadable: 0,
      buses: { ran: 0, aboardEach: null, unreadable: 0 },
      judgedToLanded: { medianMinutes: null, measured: 0, unreadable: 0 },
    },
    page: {
      lanes: [{ lane: LANE_R, bus: null, order: rows.map((one) => one.id), movable: [] }],
      movers: {},
      pressers: {},
      submitters: Object.fromEntries(rows.map((one) => [one.id, 'synthetic-worker'])),
      names: Object.fromEntries(rows.map((one) => [one.id, { wave: '13p', work: `Synthetic work ${one.id}` }])),
    },
  }
}

const RESOLVING_ROWS = aReplyOf([
  { id: 'synthetic-r-waiting', state: 'resolving', machine: { resolving: aConflict() } },
  {
    id: 'synthetic-r-no-brief',
    state: 'resolving',
    machine: { resolving: aConflict({ asked: { noBrief: 'Synthetic: the agent has no sandboxed run.', noMessage: 'Synthetic: nobody to ask.' } }) },
  },
  {
    id: 'synthetic-r-nobody-started',
    state: 'resolving',
    machine: {
      resolving: aConflict({
        nobodyStarted: { by: { kind: 'human', id: THE_PERSON }, at: '2026-10-08 10:30:00', status: 409, said: 'Synthetic: the next-round door refused it.' },
      }),
    },
  },
  { id: 'synthetic-r-no-hour', state: 'resolving', machine: { resolving: aConflict({ since: 'not a time' }) } },
  { id: 'synthetic-r-unread', state: 'resolving', machine: {} },
  { id: 'synthetic-r-handed-over', state: 'resolving', machine: { resolving: aConflict(), resolution: aResolution('2026-10-08 10:40:00') } },
  {
    id: 'synthetic-r-refused',
    state: 'resolving',
    machine: {
      resolving: aConflict(),
      resolution: aResolution('2026-10-08 10:45:00', { refused: { at: '2026-10-08 10:50:00', says: 'Synthetic: the check refused it.' } }),
    },
  },
  {
    id: 'synthetic-r-pinned',
    state: 'pinned',
    machine: { resolution: aResolution('2026-10-08 10:55:00', { checked: { at: '2026-10-08 11:05:00', ref: 'refs/mole-office/resolved/synthetic-r-pinned', places: [] } }) },
  },
  {
    id: 'synthetic-r-judged',
    state: 'judged',
    machine: { resolution: aResolution('2026-10-08 10:58:00', { checked: { at: '2026-10-08 11:10:00', ref: 'refs/mole-office/resolved/synthetic-r-judged', places: [] } }) },
  },
])

/** Tests red only with the entry, handed to its own supervisor at 10:20, asked with a brief. Synthetic. */
function aRed(more: Partial<Resolving> = {}): Resolving {
  return aConflict({ files: [], red: { tests: ['tests/synthetic-a.test.ts', 'tests/synthetic-b.test.ts'] }, mainAt: 'synthetic-main', ...more })
}

const FIXING_ROWS = aReplyOf([
  { id: 'synthetic-f-waiting', state: 'resolving', machine: { resolving: aRed() } },
  { id: 'synthetic-f-no-brief', state: 'resolving', machine: { resolving: aRed({ asked: { noBrief: 'Synthetic: no sandboxed run.', noMessage: 'Synthetic: nobody.' } }) } },
  {
    id: 'synthetic-f-nobody-started',
    state: 'resolving',
    machine: { resolving: aRed({ nobodyStarted: { by: { kind: 'human', id: THE_PERSON }, at: '2026-10-08 10:30:00', status: 409, said: 'Synthetic: refused.' } }) },
  },
  { id: 'synthetic-f-no-hour', state: 'resolving', machine: { resolving: aRed({ since: 'not a time' }) } },
  { id: 'synthetic-f-handed-over', state: 'resolving', machine: { resolving: aRed(), resolution: aResolution('2026-10-08 10:40:00') } },
  {
    id: 'synthetic-f-refused',
    state: 'resolving',
    machine: { resolving: aRed(), resolution: aResolution('2026-10-08 10:45:00', { refused: { at: '2026-10-08 10:50:00', says: 'Synthetic: refused.' } }) },
  },
  {
    id: 'synthetic-f-pinned',
    state: 'pinned',
    machine: { resolution: aResolution('2026-10-08 10:55:00', { checked: { at: '2026-10-08 11:05:00', ref: 'refs/mole-office/resolved/synthetic-f-pinned', places: [], fixed: ['src/a.ts'] } }) },
  },
])

/** One row of the drawn page, by entry id: its markup and its words as a reader reads them. */
function theRow(html: string, entry: string): { html: string; words: string } {
  const found = html.match(new RegExp(`<li class="mq-row" data-entry="${entry}"[^>]*>[\\s\\S]*?</li>`, 'u'))
  expect(found, `no row for ${entry}`).not.toBeNull()
  return { html: found![0], words: theWords(found![0]) }
}

describe('a resolving entry’s row (a reply made up for this case)', () => {
  it('says “with its supervisor”, the files and the end of the hour, and none of the brief’s path, the agent or the stored words', async () => {
    const page = await thePage()
    const html = renderToStaticMarkup(h(page.TheMergeQueue, { reply: RESOLVING_ROWS, now: THE_BUS_DAY }))
    const row = theRow(html, 'synthetic-r-waiting')
    expect(row.html).toContain('data-says="resolving"')
    expect(row.words).toContain('with its supervisor')
    expect(row.words).toContain('Waits for its own supervisor to resolve a conflict in src/a.ts, src/b.ts, until 11:20.')
    for (const kept of ['/synthetic/sandbox', 'synthetic-supervisor', 'synthetic-asking-message', 'Synthetic: the words', 'No resolve brief was written.']) {
      expect(row.words).not.toContain(kept)
    }
    expect(theWords(html)).not.toMatch(/\d{4}-\d{2}-\d{2}/u)
    const dayAfter = theRow(renderToStaticMarkup(h(page.TheMergeQueue, { reply: RESOLVING_ROWS, now: THE_DAY_AFTER })), 'synthetic-r-waiting')
    expect(dayAfter.words).toMatch(/until 11:20 on 8 Oct\w*\./u)
  })

  it('says when no brief was written, when nobody started it with no status number, and when the hour or the conflict cannot be read', async () => {
    const page = await thePage()
    const html = renderToStaticMarkup(h(page.TheMergeQueue, { reply: RESOLVING_ROWS, now: THE_BUS_DAY }))
    const noBrief = theRow(html, 'synthetic-r-no-brief').words
    expect(noBrief).toContain('No resolve brief was written.')
    expect(noBrief).not.toContain('Synthetic: the agent has no sandboxed run.')
    const nobody = theRow(html, 'synthetic-r-nobody-started').words
    expect(nobody).toContain(en['mergeQueuePage.why.nobodyStarted'])
    expect(nobody).not.toContain('409')
    expect(nobody).not.toContain('Synthetic: the next-round door refused it.')
    expect(nobody).not.toContain('No resolve brief was written.')
    expect(theRow(html, 'synthetic-r-no-hour').words).toContain(
      'Waits for its own supervisor to resolve a conflict in src/a.ts, src/b.ts. When its time to resolve ends cannot be read.',
    )
    expect(theRow(html, 'synthetic-r-unread').words).toContain('Waits for its own supervisor to resolve a conflict. Which files, and until when, cannot be read.')
  })

  it('says a resolution handed over, or refused by the merge tool, and that one passed the check on a pinned or judged entry', async () => {
    const page = await thePage()
    const html = renderToStaticMarkup(h(page.TheMergeQueue, { reply: RESOLVING_ROWS, now: THE_BUS_DAY }))
    const handed = theRow(html, 'synthetic-r-handed-over').words
    expect(handed).toContain('A resolution was handed over at 10:40, and the merge tool checks it next.')
    expect(handed).not.toContain('refused')
    const refused = theRow(html, 'synthetic-r-refused').words
    expect(refused).toContain('The merge tool refused the resolution handed over at 10:45.')
    expect(refused).not.toContain('checks it next')
    expect(refused).not.toContain('Synthetic: the check refused it.')
    expect(theRow(html, 'synthetic-r-pinned').words).toContain('Its resolution passed the check at 11:05.')
    expect(theRow(html, 'synthetic-r-judged').words).toContain('Its resolution passed the check at 11:10.')
    for (const one of ['synthetic-r-handed-over', 'synthetic-r-refused']) expect(theRow(html, one).words).not.toContain('passed the check')
  })
})

describe('a resolving entry handed on for tests red only with it (a reply made up for this case)', () => {
  it('6. says the red tests, the end of the time to fix, the brief, a fix handed over, refused or passed, and never a conflict', async () => {
    const page = await thePage()
    const html = renderToStaticMarkup(h(page.TheMergeQueue, { reply: FIXING_ROWS, now: THE_BUS_DAY }))
    const tests = 'tests/synthetic-a.test.ts, tests/synthetic-b.test.ts'
    const waiting = theRow(html, 'synthetic-f-waiting')
    expect(waiting.words).toContain('with its supervisor')
    expect(waiting.words).toContain(`Waits for its own supervisor to fix the tests red only with it, ${tests}, until 11:20.`)
    expect(theRow(html, 'synthetic-f-no-brief').words).toContain('No fix brief was written.')
    const nobody = theRow(html, 'synthetic-f-nobody-started').words
    expect(nobody).toContain(en['mergeQueuePage.why.nobodyStartedTheFix'])
    expect(nobody).not.toContain('409')
    expect(theRow(html, 'synthetic-f-no-hour').words).toContain(`Waits for its own supervisor to fix the tests red only with it, ${tests}. When its time to fix ends cannot be read.`)
    expect(theRow(html, 'synthetic-f-handed-over').words).toContain('A fix was handed over at 10:40, and the merge tool checks it next.')
    expect(theRow(html, 'synthetic-f-refused').words).toContain('The merge tool refused the fix handed over at 10:45.')
    expect(theRow(html, 'synthetic-f-pinned').words).toContain('Its fix passed the check at 11:05.')
    for (const one of ['synthetic-f-waiting', 'synthetic-f-no-brief', 'synthetic-f-nobody-started', 'synthetic-f-no-hour', 'synthetic-f-handed-over', 'synthetic-f-refused', 'synthetic-f-pinned']) {
      const words = theRow(html, one).words
      expect(words, one).not.toContain('conflict')
      expect(words, one).not.toContain('resolution')
      expect(words, one).not.toContain('resolve brief')
    }
  })
})
