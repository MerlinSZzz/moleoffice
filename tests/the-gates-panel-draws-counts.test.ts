// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Every count and every day in this file is made up in a fresh test office. */
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { GATES } from '../src/config/gates.mjs'
import { GATES_THE_SPOOL_WAITS_FOR } from '../src/config/gate-count-spool.mjs'
import { theWordAPageDraws } from './words-waiting-for-translation.ts'

let app: LiveApp
const panel = () => app.page.locator('[data-target="uiSurface/settings.gates"]')
const row = (id: string) => panel().locator(`[data-gate="${id}"]`)
const history = async (id: string) => row(id).locator('.gates-history').innerText()
function dayAgo(days: number): string {
  const day = new Date()
  day.setDate(day.getDate() - days)
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
}
function shownDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(year!, month! - 1, date!))
}
function withTheDatabase<T>(what: (database: Database.Database) => T): T {
  const database = new Database(join(app.dir, 'panelx.db'), { fileMustExist: true })
  try { return what(database) } finally { database.close() }
}
function writeCount(gate: string, day: string, wouldStop: number, stopped: number, reminded: number, ignored = 0, heeded = 0) {
  withTheDatabase((database) => database.prepare(`INSERT INTO gate_counts (gate, day, would_stop, stopped, reminded, ignored, heeded)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(gate, day) DO UPDATE SET would_stop = excluded.would_stop, stopped = excluded.stopped,
    reminded = excluded.reminded, ignored = excluded.ignored, heeded = excluded.heeded`)
    .run(gate, day, wouldStop, stopped, reminded, ignored, heeded))
}
async function open() {
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=en&mode=normal#/settings/gates`)
  await waitForThePage(app.page, 30_000)
  await panel().waitFor()
  await row('conflict-resolving').waitFor()
}
beforeAll(async () => {
  app = await liveApp({ name: 'gates-panel-counts', workspace: 'default', viewport: { width: 1440, height: 1100 } })
  await app.page.addInitScript((owner) => localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: owner })), THE_TEST_OFFICES_OWNER.id)
}, 240_000)
afterAll(async () => { await app?.stop() })

// Mutation: draw a row nothing counts with the sentence of a row not counted yet, or the other way round; or draw
// Not counted yet under a row the spool waits for.
it('says Not counted yet for every row when the office holds no count row, and never draws a zero', async () => {
  withTheDatabase((database) => database.prepare('DELETE FROM gate_counts').run())
  await open()
  // The rows are read from the gate list, so a new row changes no line here. A row nothing counts says so instead,
  // and its words say why. A row the gate-count spool waits for says that it is not counted (wave 13r round AG); the
  // reason after it was taken out in wave 13y round 121.
  const drawn = await panel().locator('[data-gate]').evaluateAll((nodes) => nodes.map((node) => [node.getAttribute('data-gate'), node.querySelector('.gates-history')?.textContent ?? null] as const))
  expect(drawn.map(([id]) => id).sort()).toEqual(GATES.map(({ id }) => id).sort())
  expect(await panel().locator('.gates-history').count()).toBe(GATES.length)
  const nobody = new Set(GATES.filter(({ countedBy }) => countedBy === 'nobody').map(({ id }) => id))
  expect(nobody.size, 'no row nothing counts is in the list').toBeGreaterThan(0)
  const NOTHING_COUNTS_IT = theWordAPageDraws('en', 'gates.count.nobody')!
  const NOT_COUNTED_YET = 'Not counted yet.'
  const NOT_COUNTED = theWordAPageDraws('en', 'gates.count.notCounted')!
  const waits = new Map(GATES_THE_SPOOL_WAITS_FOR.map(({ gate }) => [gate, NOT_COUNTED]))
  expect(waits.size, 'no row the spool waits for is in the list').toBeGreaterThan(0)
  for (const [id, text] of drawn) {
    const itsOwn = nobody.has(id!) ? NOTHING_COUNTS_IT : waits.get(id!) ?? NOT_COUNTED_YET
    expect(text, id!).toContain(itsOwn)
    for (const another of [NOTHING_COUNTS_IT, NOT_COUNTED_YET, NOT_COUNTED].filter((one) => !itsOwn.includes(one))) expect(text, id!).not.toContain(another)
    expect(text, id!).not.toMatch(/\b0 times?\b/)
    expect(text, id!).not.toContain('Counted since')
  }
}, 90_000)

it('draws the last 30 days, the total and the day counting began from rows written by hand', async () => {
  const today = dayAgo(0), tenDaysAgo = dayAgo(10), fortyDaysAgo = dayAgo(40)
  writeCount('house-rule-reds', today, 2, 1, 1)
  writeCount('house-rule-reds', tenDaysAgo, 3, 2, 1)
  writeCount('house-rule-reds', fortyDaysAgo, 4, 3, 2)
  writeCount('conflict-resolving', today, 2, 0, 0)
  writeCount('conflict-resolving', tenDaysAgo, 1, 0, 0)
  writeCount('conflict-resolving', fortyDaysAgo, 4, 0, 0)
  writeCount('before-the-seal', today, 1, 1, 0, 2, 1)
  writeCount('before-the-seal', tenDaysAgo, 2, 1, 1, 3, 0)
  writeCount('before-the-seal', fortyDaysAgo, 3, 2, 1, 1, 4)
  writeCount('release-spacing', today, 2, 0, 0)
  writeCount('release-spacing', fortyDaysAgo, 1, 0, 0)
  await open()
  const house = await history('house-rule-reds')
  expect(house).toContain(`Counted since ${shownDay(fortyDaysAgo)}.`)
  expect(house).toContain('Last 30 days: would have stopped work 5 times, stopped work 3 times, reminded 2 times.')
  expect(house).toContain('Since counting began: would have stopped work 9 times, stopped work 6 times, reminded 4 times.')
  const conflict = await history('conflict-resolving')
  expect(conflict).toContain('Last 30 days: Met a merge conflict 3 times.')
  expect(conflict).toContain('Since counting began: Met a merge conflict 7 times.')
  expect(conflict).not.toContain('stopped work')
  const seal = await history('before-the-seal')
  expect(seal).toContain(`Counted since ${shownDay(fortyDaysAgo)}.`)
  expect(seal).toContain('Last 30 days: would have stopped work 3 times, stopped work 2 times, reminded 1 time.')
  expect(seal).toContain('Since counting began: would have stopped work 6 times, stopped work 4 times, reminded 2 times.')
  expect(seal).toContain('Last 30 days: Still found at the seal: 5. Gone by the seal: 1.')
  expect(seal).toContain('Since counting began: Still found at the seal: 6. Gone by the seal: 5.')
  expect(seal).toContain('Each item the reminder named counts once: still found at the seal, or gone.')
  const spacing = await history('release-spacing')
  expect(spacing).toContain('Last 30 days: Refused a stable release 2 times.')
  expect(spacing).toContain('Since counting began: Refused a stable release 3 times.')
  expect(spacing).not.toContain('stopped work')
}, 90_000)

it('says ignored cannot be told where nothing looks again, and says how the merge tool and the release tool count', async () => {
  await open()
  const house = await history('house-rule-reds')
  expect(house).toContain('Ignored: cannot be counted.')
  expect(house).not.toContain('Still found at the seal')
  const merge = await history('whole-suite-fix-round')
  expect(merge).toContain('Not counted yet.')
  expect(merge).toContain('Counted by the merge tool.')
  expect(merge).not.toContain('would have stopped work')
  expect(merge).not.toContain('release tool')
  // Mutation: draw the merge tool's line for every row an outside tool counts, and the release row names the office key.
  const spacing = await history('release-spacing')
  expect(spacing).toContain('Counted by the release tool.')
  expect(spacing).not.toContain('merge tool')
}, 90_000)

// Each of the nine numbers says in its own words what it did, as checks-an-hour does, and never as stopped work.
// Mutation: give any of them another row's count words, or none, and its line below is not there.
it('draws each number that makes work wait or sends it back in its own count words', async () => {
  const today = dayAgo(0), fortyDaysAgo = dayAgo(40)
  const said: [string, string, string][] = [
    ['broadcast-pause', "Paused a secretary's broadcast reminders 1 time.", "Paused a secretary's broadcast reminders 3 times."],
    ['worker-runs', 'Made a message wait for a free run 1 time.', 'Made a message wait for a free run 3 times.'],
    ['agent-hops', 'Made a message to an agent wait for a person 1 time.', 'Made a message to an agent wait for a person 3 times.'],
    ['browser-test-seats', 'Made a browser test file wait for a seat 1 time.', 'Made a browser test file wait for a seat 3 times.'],
    ['counter-spacing', "Held back a counter's firing 1 time.", "Held back a counter's firing 3 times."],
    ['run-messages', "Refused a run's message 1 time.", "Refused a run's message 3 times."],
    ['conflict-minutes', 'Sent an entry back when its time to resolve ran out 1 time.', 'Sent an entry back when its time to resolve ran out 3 times.'],
    ['landing-attempts', 'Sent an entry back after main moved too often 1 time.', 'Sent an entry back after main moved too often 3 times.'],
    ['tool-runs-in-one-place', 'Stopped running the merge tool again 1 time.', 'Stopped running the merge tool again 3 times.'],
  ]
  for (const [gate] of said) { writeCount(gate, today, 1, 0, 0); writeCount(gate, fortyDaysAgo, 2, 0, 0) }
  await open()
  for (const [gate, lately, always] of said) {
    const text = await history(gate)
    expect(text, gate).toContain(`Last 30 days: ${lately}`)
    expect(text, gate).toContain(`Since counting began: ${always}`)
    expect(text, gate).not.toContain('stopped work')
  }
}, 90_000)
