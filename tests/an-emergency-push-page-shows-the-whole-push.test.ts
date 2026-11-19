// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN EMERGENCY PUSH'S RECORD PAGE SHOWS THE WHOLE PUSH (wave 13u round 88, item 23). The page drew a push's plain
 * fields and left out every field that holds an object: who pushed, the line the fix came from, the chat message, the
 * emergency switch and how the push ended. The follow-up run is worked out on read and is stored nowhere, so the page
 * never had it. Each is now a row of one panel, and an absence is said in words, never a blank or a dash.
 *
 * Three made-up pushes are filed in a test office with a database of its own, and opened at their record address in a
 * real browser, in normal mode:
 *   - one still moving main, pushed by a made-up secretary, naming a made-up line, with the switch's end time and its
 *     throw recorded;
 *   - one stopped, pushed by an agent the office cannot name, naming no line, with neither recorded;
 *   - one pushed, naming a line the office cannot name, whose onward push failed and which no whole-suite run tested.
 * Who pushed and the line, the message, the switch, how it ended and the follow-up are one case each. A red follow-up,
 * which needs a real receipt in a real repository, is in tests/an-emergency-push-to-main.test.ts.
 *
 * NORMAL MODE NEVER SHOWS what the merge tool said, nor the push's id, its checkout's path, the message's id or the
 * switch's change id. The tool's sentences can name paths, so they are drawn in developer mode only.
 *
 * CASE PROOF MAP. Each case was red on the page before this change, which drew no such row. Each is turned red by
 * undoing its own part in src/web/components/MergeQueuePush.tsx:
 *   - who pushed and the line: the line's handle read from `who` instead of `lineWho`;
 *   - the message: the row drawing the message's id instead of a link to it;
 *   - the switch: the end time left out;
 *   - how it ended: the tool's sentence drawn in normal mode too;
 *   - the follow-up: a push that has not ended said to owe none.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { freshDb, liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { sayInEnglish, type WordKey, type WordValues } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { PanelRecord } from '../src/shared/types.ts'

let app: LiveApp
let copy = ''
const actor = { type: 'human' as const, id: THE_PERSON }
const ids = { message: '', pushing: '', stopped: '', pushed: '' }
const SECRETARY = 'made-up-push-secretary'
const LINE = 'made-up-push-line'
const ROOT = '/tmp/made-up-push-checkout'
const COMMIT = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const BEFORE = '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c'
const CHANGE = 'made-up-switch-change'
const TOOL_SAID = { stopped: 'Synthetic: the made-up tool left main where it was.', pushed: 'Synthetic: the made-up tool moved main.' }
const ONWARD_SAID = `Synthetic: the made-up mirror at ${ROOT}-mirror refused the push.`

beforeAll(async () => {
  const t = await freshDb()
  const mergeQueue = await import('../src/server/lib/merge-entry-door.ts')
  const file = (kind: string, title: string, data: Record<string, unknown>): PanelRecord =>
    t.api.createRecord({ workspaceId: 'default', kind: kind as PanelRecord['kind'], title, data, actor })
  const agent = (handle: string): string => {
    file('agent', `The made-up agent ${handle}`, { handle, runtime: 'claude-code', state: 'active' })
    return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
  }
  const secretary = agent(SECRETARY)
  const line = agent(LINE)
  ids.message = file('message', 'A made-up chat message naming the commit', { body: 'A made-up message: this commit goes to main.', to: [{ kind: 'person', id: THE_PERSON }] }).id
  const push = (title: string, data: Record<string, unknown>): string =>
    mergeQueue.asTheMergeQueue(() => file('emergency_push', title, {
      root: ROOT,
      repository: 'made-up-repository',
      commit: COMMIT,
      mainBefore: BEFORE,
      message: { id: ids.message, seq: 1, contentHash: '0123456789abcdef' },
      startedAt: '2026-10-25 08:55:00',
      ...data,
    })).id
  ids.pushing = push('A made-up push still moving main', {
    state: 'pushing',
    by: { kind: 'agent', id: secretary },
    line: { kind: 'agent', id: line },
    switch: {
      value: '1', unreadable: null, chosen: { value: '1', until: '2026-10-25 12:00:00' }, ranOut: null,
      lastChange: { id: CHANGE, appendOrder: 1, at: '2026-10-25 08:50:00', to: '1', until: '2026-10-25 12:00:00', ranOut: false },
    },
    ended: null,
  })
  ids.stopped = push('A made-up push that stopped', {
    state: 'stopped',
    by: { kind: 'agent', id: 'made-up-agent-nobody-registered' },
    line: null,
    switch: { value: '1', unreadable: null, chosen: { value: '1', until: null }, ranOut: null, lastChange: null },
    ended: { at: '2026-10-25 09:01:00', mainAfter: BEFORE, says: TOOL_SAID.stopped, onward: null },
  })
  ids.pushed = push('A made-up push that moved main', {
    state: 'pushed',
    by: { kind: 'agent', id: secretary },
    line: { kind: 'agent', id: 'made-up-line-nobody-registered' },
    switch: { value: '1', unreadable: null, chosen: { value: '1', until: '2026-10-25 12:00:00' }, ranOut: null, lastChange: null },
    ended: { at: '2026-10-25 09:02:00', mainAfter: COMMIT, says: TOOL_SAID.pushed, onward: { ok: false, says: ONWARD_SAID } },
  })
  copy = join(mkdtempSync(join(tmpdir(), 'mole-office-push-page-')), 'panelx.db')
  t.client.sqlite.exec(`VACUUM INTO '${copy}'`)
  t.close()
  app = await liveApp({ name: 'push-page', viewport: { width: 1440, height: 1000 }, database: copy, workspace: 'default' })
  app.page.setDefaultTimeout(20_000)
}, 300_000)

afterAll(async () => {
  await app?.stop()
  if (copy !== '') rmSync(dirname(copy), { recursive: true, force: true })
}, 120_000)

type Push = 'pushing' | 'stopped' | 'pushed'
type Mode = 'normal' | 'developer'
/** One row of the push's panel: its words, where its links go and what they say, and whether it is marked red. */
interface Row { text: string; links: { href: string; text: string }[]; red: boolean }

/** Each push's panel, read once in each mode. A page that draws no panel fails every case that reads it. */
const read = new Map<string, Promise<{ rows: Record<string, Row>; panel: string }>>()
function thePanel(push: Push, mode: Mode): Promise<{ rows: Record<string, Row>; panel: string }> {
  const key = `${push} ${mode}`
  if (!read.has(key)) read.set(key, (async () => {
    const page = app.page
    await page.goto(`${app.site}/${mode === 'developer' ? '?mode=inspect' : ''}#/r/${ids[push]}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.locator('article.rp .rd-rail').waitFor({ timeout: 30_000 })
    await page.locator('article.rp [data-push-facts]').waitFor({ timeout: 30_000 })
    expect(await page.locator('article.rp [data-push-facts]').count(), 'the page draws one panel of the push').toBe(1)
    const rows = await page.locator('article.rp [data-push-fact]').evaluateAll((all) => Object.fromEntries(all.map((one) => {
      const value = one.querySelector('dd') as HTMLElement
      return [one.getAttribute('data-push-fact'), {
        text: value.innerText.trim(),
        links: [...value.querySelectorAll('a')].map((link) => ({ href: link.getAttribute('href') ?? '', text: link.innerText.trim() })),
        red: value.querySelector('.mq-follow-red') !== null,
      }]
    })))
    return { rows, panel: await page.locator('article.rp .px-panel:has([data-push-facts])').innerText() }
  })())
  return read.get(key)!
}
async function theRow(push: Push, fact: string, mode: Mode = 'normal'): Promise<Row> {
  const row = (await thePanel(push, mode)).rows[fact]
  expect(row, `the ${push} push's page draws the ${fact} row`).toBeDefined()
  return row!
}
/** The words of one key, read as English. A key the words do not have yet is the case's red. */
const say = (key: string, values?: WordValues): string => sayInEnglish(key as WordKey, values)
/** The words of one key with a time in them, as a pattern matching any time drawn there. */
function sayWithATime(key: string, name: string): RegExp {
  const marked = say(key, { [name]: '\u0000' })
  return new RegExp(`^${marked.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\u0000', '.+')}$`)
}
const linesOf = (row: Row): string[] => row.text.split('\n').map((one) => one.trim()).filter((one) => one !== '')

it('says who pushed and the line the fix came from, and says it in words when the office cannot name either or the push named none', async () => {
  expect(linesOf(await theRow('pushing', 'by'))).toEqual([SECRETARY])
  expect(linesOf(await theRow('pushing', 'line'))).toEqual([LINE])
  expect(linesOf(await theRow('stopped', 'by'))).toEqual([say('pushPage.whoUnknown')])
  expect(linesOf(await theRow('stopped', 'line'))).toEqual([say('pushPage.line.none')])
  expect(linesOf(await theRow('pushed', 'by'))).toEqual([SECRETARY])
  expect(linesOf(await theRow('pushed', 'line'))).toEqual([say('pushPage.line.unknown')])
}, 120_000)

it('leads to the chat message that told the owner, in words, and never draws its id', async () => {
  const row = await theRow('pushing', 'message')
  expect(row.links).toEqual([{ href: `#/r/${ids.message}`, text: say('pushPage.message.open') }])
  expect(row.text).not.toContain(ids.message)
}, 120_000)

it('says the switch was on, until when, and when it was thrown, and says so in words when neither was recorded', async () => {
  const set = linesOf(await theRow('pushing', 'switch'))
  expect(set).toHaveLength(3)
  expect(set[0]).toBe(say('pushPage.switch.on'))
  expect(set[1]).toMatch(sayWithATime('pushPage.switch.until', 'until'))
  expect(set[2]).toMatch(sayWithATime('pushPage.switch.thrown', 'at'))
  expect(set.join(' ')).not.toContain(CHANGE)
  expect(linesOf(await theRow('stopped', 'switch'))).toEqual([say('pushPage.switch.on'), say('pushPage.switch.noUntil'), say('pushPage.switch.notThrown')])
}, 120_000)

it('says a push has not ended yet, says when one ended without moving main, and draws what the tool said in developer mode only', async () => {
  expect(linesOf(await theRow('pushing', 'ended'))).toEqual([say('pushPage.ended.not'), say('mergeQueuePage.push.moving')])
  const stopped = linesOf(await theRow('stopped', 'ended'))
  expect(stopped).toHaveLength(2)
  expect(stopped[0]).toMatch(sayWithATime('mergeQueuePage.push.ended', 'at'))
  expect(stopped[1]).toBe(say('mergeQueuePage.push.onward.none'))
  const pushed = linesOf(await theRow('pushed', 'ended'))
  expect(pushed).toHaveLength(2)
  expect(pushed[1]).toBe(say('pushPage.onward.failed'))
  // NORMAL MODE SHOWS NO MACHINE WORD anywhere in the panel: the tool's sentences, the push's id, its checkout's path.
  for (const push of ['pushing', 'stopped', 'pushed'] as const) {
    const { panel } = await thePanel(push, 'normal')
    for (const never of [TOOL_SAID.stopped, TOOL_SAID.pushed, ONWARD_SAID, ids[push], ids.message, ROOT, COMMIT, CHANGE]) expect(panel, `${push}: ${never}`).not.toContain(never)
  }
  // DEVELOPER MODE ADDS WHAT THE MERGE TOOL SAID, after the lines normal mode draws.
  expect(linesOf(await theRow('stopped', 'ended', 'developer'))).toEqual([...stopped, say('pushPage.ended.toolSaid', { says: TOOL_SAID.stopped })])
  expect(linesOf(await theRow('pushed', 'ended', 'developer'))).toEqual([
    pushed[0], say('mergeQueuePage.push.onward.failed', { says: ONWARD_SAID }), say('pushPage.ended.toolSaid', { says: TOOL_SAID.pushed }),
  ])
}, 120_000)

it('says what the follow-up run found, or in words why there is none', async () => {
  expect(linesOf(await theRow('pushing', 'followUp'))).toEqual([say('pushPage.followUp.notYet')])
  expect(linesOf(await theRow('stopped', 'followUp'))).toEqual([say('pushPage.followUp.notOwed')])
  const pushed = await theRow('pushed', 'followUp')
  expect(linesOf(pushed)).toEqual([say('mergeQueuePage.push.followUp.missing')])
  expect(pushed.red).toBe(false)
}, 120_000)
