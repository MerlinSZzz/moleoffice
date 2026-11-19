// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HOST JOB'S RECORD PAGE SHOWS THE WHOLE JOB, AND HAS NO EDIT PRESS (wave 13q round 60). The page drew an Edit press
 * whose every save was refused, since only the host job doors write a job. It drew the job's plain fields and left out
 * what it was asked with, who asked and what came back, which are objects the body does not draw, and it never had the
 * digests in base64, which GET /api/host-jobs/<id> works out on read. Now there is no press, and each of the four is a
 * row of one panel, with an absence said in words.
 *
 * Four made-up jobs and a made-up note are filed in a test office with a database of its own, and opened at their record
 * address in a real browser, in normal mode:
 *   - one finished, asked with two arguments by a made-up agent, which returned one output, left one too large and one
 *     missing;
 *   - one still asked, with no arguments, by an agent the office cannot name;
 *   - one that could not start, so no output was read;
 *   - one finished, of a tool that declares no outputs.
 * The note is the case's control: its page draws the Edit press the host job's page must not.
 *
 * NORMAL MODE NEVER SHOWS the run's id, the agent's id or a sha256 in hex in the panel. Developer mode adds the stored
 * asker.
 *
 * A DIGEST'S "=" NEVER STANDS ALONE ON A LINE (wave 13q round 62). At 390 the page broke each digest after 43 of its 44
 * characters, so its last line held the "=" alone. A digest is drawn whole on one line, or in two halves of 22, at
 * each of the four widths every screen is looked at.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 *   - the host job taken out of the Edit press's condition in src/web/pages/RecordPage.tsx: case 1 goes red;
 *   - the panel's mount line taken out of src/web/pages/RecordPage.tsx: cases 2, 3, 4 and 5 go red;
 *   - each argument drawn as the whole stored object instead of by name and value: case 2 goes red;
 *   - the asker drawn by its stored id instead of its name: case 3 goes red;
 *   - a job still asked said to have had no outputs read: case 4 goes red;
 *   - the program's digest drawn from the record's hex instead of the door's base64: cases 3 and 5 go red, since case 3
 *     holds every sha256 in hex out of the panel in normal mode;
 *   - a digest drawn as one run that may break anywhere, as round 60 drew it: case 6 goes red at 390;
 *   - the asker read only as the run shape {run, agent}: case 7 goes red;
 *   - a program digest drawn for a job that holds none: case 5 goes red.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { freshDb, liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { sayInEnglish, type WordKey, type WordValues } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { PanelRecord } from '../src/shared/types.ts'

let app: LiveApp
let copy = ''
let PERSON_NAME = ''
const actor = { type: 'human' as const, id: THE_PERSON }
const ids = { finished: '', asked: '', unstarted: '', declaresNone: '', handoverPerson: '', handoverSecretary: '', note: '', agent: '' }
const AGENT = 'made-up-host-job-asker'
/** The name the registry gives the agent, which is what the page draws. */
const AGENT_NAME = `The made-up agent ${AGENT}`
const NOBODY = 'made-up-agent-nobody-registered'
const RUN = 'Rn3madeUp001'
const hexOf = (text: string): string => createHash('sha256').update(text).digest('hex')
const base64Of = (hex: string): string => Buffer.from(hex, 'hex').toString('base64')
const PROGRAM = hexOf('Synthetic: a made-up program')
const RESULT = '{"ok": true}'
const OUTPUTS = {
  returned: { name: 'RESULT.json', state: 'returned', size: RESULT.length, sha256: hexOf(RESULT), text: RESULT },
  tooLarge: { name: 'BIG.bin', state: 'too large', size: 2_000_000, sha256: hexOf('Synthetic: a made-up large output') },
  missing: { name: 'NOTES.txt', state: 'missing' },
}

beforeAll(async () => {
  const t = await freshDb()
  const door = await import('../src/server/lib/host-job-door.ts')
  const file = (kind: string, title: string, data: Record<string, unknown>): PanelRecord =>
    t.api.createRecord({ workspaceId: 'default', kind: kind as PanelRecord['kind'], title, data, actor })
  file('agent', AGENT_NAME, { handle: AGENT, runtime: 'claude-code', state: 'active' })
  ids.agent = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(AGENT) as { id: string }).id
  const participants = await import('../src/server/lib/participants.ts')
  PERSON_NAME = String((participants.readParticipant({ kind: 'person', id: THE_PERSON }) as { name?: unknown } | null)?.name ?? '')
  ids.note = file('note', 'A made-up note', { body: 'A made-up note, whose page draws the Edit press.' }).id
  const job = (title: string, data: Record<string, unknown>, programDigest = true): string =>
    door.asTheHostJobWriter(() => file('host_job', title, { tool: 'stand-in', ...(programDigest ? { sha256: PROGRAM } : {}), askedAt: '2026-11-07 09:00:00', ...data })).id
  ids.finished = job('A made-up host job that finished', {
    arguments: { pack: 'blue', count: 3 },
    askedBy: { run: RUN, agent: ids.agent },
    state: 'finished',
    startedAt: '2026-11-07 09:00:30',
    endedAt: '2026-11-07 09:01:10',
    exitCode: 0,
    outputs: [OUTPUTS.returned, OUTPUTS.tooLarge, OUTPUTS.missing],
    undeclaredFiles: 0,
  })
  ids.asked = job('A made-up host job still asked', { arguments: {}, askedBy: { run: RUN, agent: NOBODY }, state: 'asked' })
  ids.unstarted = job('A made-up host job that could not start', {
    arguments: { pack: 'red' },
    askedBy: { run: RUN, agent: ids.agent },
    state: 'could not start',
    endedAt: '2026-11-07 09:00:40',
    why: 'Synthetic: the made-up program was not there.',
  })
  ids.declaresNone = job('A made-up host job of a tool that declares no outputs', {
    arguments: { pack: 'green' },
    askedBy: { run: RUN, agent: ids.agent },
    state: 'finished',
    startedAt: '2026-11-07 09:00:30',
    endedAt: '2026-11-07 09:01:10',
    exitCode: 0,
    outputs: [],
  })
  ids.handoverPerson = job('A made-up hand-over job the person asked for', {
    tool: 'hand-over-a-backup',
    arguments: { backup: 'made-up.db' },
    askedBy: { kind: 'person', id: THE_PERSON },
    state: 'asked',
  }, false)
  ids.handoverSecretary = job('A made-up hand-over job a secretary asked for', {
    tool: 'hand-over-a-backup',
    arguments: { backup: 'made-up-2.db' },
    askedBy: { kind: 'agent', id: ids.agent },
    state: 'asked',
  }, false)
  copy = join(mkdtempSync(join(tmpdir(), 'mole-office-host-job-page-')), 'panelx.db')
  t.client.sqlite.exec(`VACUUM INTO '${copy}'`)
  t.close()
  app = await liveApp({ name: 'host-job-page', viewport: { width: 1440, height: 1000 }, database: copy, workspace: 'default' })
  app.page.setDefaultTimeout(20_000)
}, 300_000)

afterAll(async () => {
  await app?.stop()
  if (copy !== '') rmSync(dirname(copy), { recursive: true, force: true })
}, 120_000)

type Job = 'finished' | 'asked' | 'unstarted' | 'declaresNone' | 'handoverPerson' | 'handoverSecretary'
type Mode = 'normal' | 'developer'
/** One row of the job's panel: its words, and where its links go and what they say. */
interface Row { text: string; links: { href: string; text: string }[] }
/** What one page drew: the panel's rows and words, and the words of every press on the page. */
interface Drawn { rows: Record<string, Row>; panel: string; presses: string[] }

/** The words of one key, read as English. A key the words do not have yet is the case's red. */
const say = (key: string, values?: WordValues): string => sayInEnglish(key as WordKey, values)

async function opened(id: string, mode: Mode): Promise<void> {
  const page = app.page
  await page.goto(`${app.site}/${mode === 'developer' ? '?mode=inspect' : ''}#/r/${id}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('article.rp .rd-rail').waitFor({ timeout: 30_000 })
}

/** The words of every link and button on the page, so a press is found by what it says. */
async function thePresses(): Promise<string[]> {
  return app.page.locator('main a, main button').evaluateAll((all) => all.map((one) => (one as HTMLElement).innerText.trim()))
}

/** Each job's page, read once in each mode. A page that draws no panel fails every case that reads it. */
const read = new Map<string, Promise<Drawn>>()
function thePage(job: Job, mode: Mode): Promise<Drawn> {
  const key = `${job} ${mode}`
  if (!read.has(key)) read.set(key, (async () => {
    await opened(ids[job], mode)
    const page = app.page
    const presses = await thePresses()
    await page.locator('article.rp [data-host-job-facts]').waitFor({ timeout: 30_000 })
    expect(await page.locator('article.rp [data-host-job-facts]').count(), 'the page draws one panel of the job').toBe(1)
    // THE DIGESTS ARE READ ON THEIR OWN DOOR, so the row is read once they are drawn.
    await page.locator('article.rp [data-job-fact="digests"] [data-digest]').first().waitFor({ timeout: 30_000 })
    const rows = await page.locator('article.rp [data-job-fact]').evaluateAll((all) => Object.fromEntries(all.map((one) => {
      const value = one.querySelector('dd') as HTMLElement
      return [one.getAttribute('data-job-fact'), {
        text: value.innerText.trim(),
        links: [...value.querySelectorAll('a')].map((link) => ({ href: link.getAttribute('href') ?? '', text: link.innerText.trim() })),
      }]
    })))
    return { rows, presses, panel: await page.locator('article.rp .px-panel:has([data-host-job-facts])').innerText() }
  })())
  return read.get(key)!
}
async function theRow(job: Job, fact: string, mode: Mode = 'normal'): Promise<Row> {
  const row = (await thePage(job, mode)).rows[fact]
  expect(row, `the ${job} job's page draws the ${fact} row`).toBeDefined()
  return row!
}
const linesOf = (row: Row): string[] => row.text.split('\n').map((one) => one.trim()).filter((one) => one !== '')

it('1: a host job\'s page draws no Edit press, where a note\'s page draws one', async () => {
  await opened(ids.note, 'normal')
  expect(await thePresses(), 'the control: a note\'s page draws the Edit press').toContain(say('record.edit'))
  for (const job of ['finished', 'asked', 'unstarted'] as const) {
    await opened(ids[job], 'normal')
    expect(await thePresses(), `the ${job} job's page`).not.toContain(say('record.edit'))
  }
}, 120_000)

it('2: says what the job was asked with, each argument by name and value, and says so when it was asked with none', async () => {
  expect(linesOf(await theRow('finished', 'arguments'))).toEqual([
    say('hostJobPage.arguments.one', { name: 'pack', value: 'blue' }),
    say('hostJobPage.arguments.one', { name: 'count', value: '3' }),
  ])
  expect(linesOf(await theRow('asked', 'arguments'))).toEqual([say('hostJobPage.arguments.none')])
}, 120_000)

it('3: says which agent asked by its name and leads to the run that asked, and never draws either id in normal mode', async () => {
  const finished = await theRow('finished', 'askedBy')
  expect(linesOf(finished)).toEqual([AGENT_NAME, say('hostJobPage.askedBy.run')])
  expect(finished.links).toEqual([{ href: `#/r/${RUN}`, text: say('hostJobPage.askedBy.run') }])
  expect(linesOf(await theRow('asked', 'askedBy'))).toEqual([say('record.writer.unregisteredAgent'), say('hostJobPage.askedBy.run')])
  for (const job of ['finished', 'asked'] as const) {
    const { panel } = await thePage(job, 'normal')
    for (const never of [RUN, ids.agent, NOBODY, PROGRAM, OUTPUTS.returned.sha256, OUTPUTS.tooLarge.sha256]) expect(panel, `${job}: ${never}`).not.toContain(never)
  }
  // DEVELOPER MODE ADDS THE STORED ASKER, after the lines normal mode draws.
  expect(linesOf(await theRow('finished', 'askedBy', 'developer'))).toEqual([AGENT_NAME, say('hostJobPage.askedBy.run'), JSON.stringify({ run: RUN, agent: ids.agent })])
}, 120_000)

it('4: says what came back of each declared output, and says why when no output was read', async () => {
  const finished = linesOf(await theRow('finished', 'outputs'))
  expect(finished).toEqual([
    say('hostJobPage.outputs.returned', { name: OUTPUTS.returned.name, size: say('hostJobPage.size.many', { size: String(OUTPUTS.returned.size) }) }),
    RESULT,
    say('hostJobPage.outputs.tooLarge', { name: OUTPUTS.tooLarge.name, size: say('hostJobPage.size.many', { size: String(OUTPUTS.tooLarge.size) }) }),
    say('hostJobPage.outputs.missing', { name: OUTPUTS.missing.name }),
  ])
  expect(linesOf(await theRow('asked', 'outputs'))).toEqual([say('hostJobPage.outputs.waiting')])
  expect(linesOf(await theRow('unstarted', 'outputs'))).toEqual([say('hostJobPage.outputs.notRead')])
  expect(linesOf(await theRow('declaresNone', 'outputs'))).toEqual([say('hostJobPage.outputs.none')])
}, 120_000)

it('5: draws the digests the office works out in base64, the program\'s and each output\'s that has one', async () => {
  expect(linesOf(await theRow('finished', 'digests'))).toEqual([
    say('hostJobPage.digests.program', { digest: base64Of(PROGRAM) }),
    say('hostJobPage.digests.output', { name: OUTPUTS.returned.name, digest: base64Of(OUTPUTS.returned.sha256) }),
    say('hostJobPage.digests.output', { name: OUTPUTS.tooLarge.name, digest: base64Of(OUTPUTS.tooLarge.sha256) }),
    say('hostJobPage.digests.note'),
  ])
  expect(linesOf(await theRow('asked', 'digests'))).toEqual([say('hostJobPage.digests.program', { digest: base64Of(PROGRAM) }), say('hostJobPage.digests.note')])
  // A JOB FILED BEFORE ITS TOOL WAS REGISTERED HOLDS NO PROGRAM DIGEST, and the page says so in words.
  expect(linesOf(await theRow('handoverPerson', 'digests'))).toEqual([say('hostJobPage.digests.programAbsent'), say('hostJobPage.digests.note')])
}, 120_000)

it('7: draws a caller in both shapes the kind declares, without a run link, and no id in normal mode', async () => {
  const byThePerson = await theRow('handoverPerson', 'askedBy')
  expect(linesOf(byThePerson)).toEqual([PERSON_NAME])
  expect(byThePerson.links).toEqual([])
  const byTheSecretary = await theRow('handoverSecretary', 'askedBy')
  expect(linesOf(byTheSecretary)).toEqual([AGENT_NAME])
  expect(byTheSecretary.links).toEqual([])
  for (const job of ['handoverPerson', 'handoverSecretary'] as const) {
    const { panel } = await thePage(job, 'normal')
    for (const never of [THE_PERSON, ids.agent]) expect(panel, `${job}: ${never}`).not.toContain(never)
  }
  // DEVELOPER MODE ADDS THE STORED ASKER, in the shape this job holds.
  expect(linesOf(await theRow('handoverPerson', 'askedBy', 'developer'))).toEqual([PERSON_NAME, JSON.stringify({ kind: 'person', id: THE_PERSON })])
}, 120_000)

/** The four widths every screen is looked at. */
const WIDTHS = [1440, 990, 660, 390]
/** Where the four-width, two-theme pictures go when this run wants them. */
const shots = process.env.W13Q_HOST_JOB_SHOTS

it('6: draws each digest whole on one line, or in two halves, at 1440, 990, 660 and 390, so its "=" never stands alone', async () => {
  const digests = [base64Of(PROGRAM), base64Of(OUTPUTS.returned.sha256), base64Of(OUTPUTS.tooLarge.sha256)]
  try {
    for (const width of WIDTHS) {
      await app.page.setViewportSize({ width, height: 1000 })
      await opened(ids.finished, 'normal')
      const drawn = app.page.locator('article.rp [data-job-fact="digests"] [data-digest]')
      await drawn.first().waitFor({ timeout: 30_000 })
      // EACH CHARACTER OF A DIGEST IS FOUND IN THE TEXT DRAWN, and counted by the line its box is on.
      const lines = await drawn.evaluateAll((all, wanted) => all.map((one) => {
        const characters: { node: Text; at: number }[] = []
        const walker = document.createTreeWalker(one, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          for (let at = 0; at < (node as Text).length; at++) characters.push({ node: node as Text, at })
        }
        const text = characters.map((character) => character.node.data[character.at]).join('')
        const digest = wanted.find((one) => text.includes(one)) ?? ''
        const from = text.indexOf(digest)
        const onEachLine = new Map<number, number>()
        for (const character of characters.slice(from, from + digest.length)) {
          const range = document.createRange()
          range.setStart(character.node, character.at)
          range.setEnd(character.node, character.at + 1)
          const top = Math.round(range.getBoundingClientRect().top)
          onEachLine.set(top, (onEachLine.get(top) ?? 0) + 1)
        }
        return { digest, lines: [...onEachLine.entries()].sort((one, other) => one[0] - other[0]).map(([, count]) => count) }
      }), digests)
      expect(lines.map((one) => one.digest), `${String(width)}: the digests drawn`).toEqual(digests)
      for (const one of lines) expect([[44], [22, 22]], `${String(width)}: the characters of ${one.digest} on each line`).toContainEqual(one.lines)
    }
  } finally {
    await app.page.setViewportSize({ width: 1440, height: 1000 })
  }
}, 180_000)

it('8: photographs the hand-over job at 1440, 990, 660 and 390, in both themes, when asked', async () => {
  if (shots === undefined || shots === '') return
  mkdirSync(shots, { recursive: true })
  const light: Buffer[] = []
  try {
    for (const width of WIDTHS) for (const theme of ['light', 'dark']) {
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.goto(`${app.site}/#/r/${ids.handoverPerson}`, { timeout: 60_000 })
      await app.page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
      // THE LOOK IS APPLIED WHEN THE DOCUMENT LOADS, so the page is loaded again after the store is written.
      await app.page.reload({ waitUntil: 'domcontentloaded' })
      await opened(ids.handoverPerson, 'normal')
      // THE PAGE APPLIES THE STORED LOOK AS IT STARTS, so the attribute is waited for rather than read once.
      await app.page.waitForFunction((look) => document.documentElement.getAttribute('data-theme') === look, theme, { timeout: 30_000 })
      const drawn = await app.page.evaluate(() => document.documentElement.scrollWidth)
      expect(drawn, `${String(width)} ${theme} overflows`).toBeLessThanOrEqual(width)
      const shot = await app.page.screenshot({ path: join(shots, `host-job-${String(width)}-${theme}.png`), fullPage: true })
      if (theme === 'light') light.push(shot)
      // A DARK PICTURE THAT IS THE LIGHT PICTURE says the stored look was never applied.
      else expect(shot.equals(light[WIDTHS.indexOf(width)]!), `${String(width)}: the dark picture is the light picture`).toBe(false)
    }
  } finally {
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await app.page.evaluate(() => localStorage.setItem('mole-office.preset.theme', 'light'))
  }
}, 600_000)
