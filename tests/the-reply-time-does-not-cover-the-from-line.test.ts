// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The reply time and from line stay readable when the aligned control reaches them. */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { OPEN_AT } from '../src/web/lib/open-chat.ts'
import { type LiveApp, liveApp, theAnswerToAWriteInATestOffice, waitForThePage } from './helpers.ts'

const asked = 'Made-up long ask: before you change anything, write down the plan in a few lines. Say which files you would open, which presses would move, and what the page would look like at the narrowest width. Then wait for my answer, because I may want a different order, and I would rather read the plan than undo the work.'
const replied = 'Made-up short reply: done.'
const person = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const agent = { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-alignment-agent' }
let app: LiveApp
let agentId = ''
let measurements = ''

async function file(headers: Record<string, string>, body: { kind: string; title: string; data: Record<string, unknown> }, status = 201) {
  const response = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(response.status, await response.clone().text()).toBe(status)
  return ((await response.json()) as { record: { id: string } }).record.id
}

beforeAll(async () => {
  measurements = `(() => {
    window.theTimeAndEdges = (asked, replied) => {
      const row = words => [...document.querySelectorAll('.px-chat-one')].find(node => node.querySelector('.px-chat-words')?.textContent?.includes(words));
      const source = row(asked), reply = row(replied);
      const press = reply?.querySelector('.px-chat-mark-broken');
      const from = reply?.querySelector('.px-chat-from');
      const time = reply?.querySelector('.px-chat-when');
      const mark = source?.querySelector('.px-chat-intent-mark');
      const sb = source?.querySelector('.px-chat-bubble'), rb = reply?.querySelector('.px-chat-bubble');
      if (!press || !from || !time || !mark || !sb || !rb) return null;
      const rect = node => { const r = node.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width }; };
      return { press:rect(press), from:rect(from), time:rect(time), mark:rect(mark), bubbles:[rect(sb),rect(rb)] };
    }
  })()`
  app = await liveApp({ name: 'mark-edge-alignment', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await file(person, { kind: 'agent', title: 'Made-up alignment agent', data: { handle: 'made-up-alignment-agent', runtime: 'claude-code', state: 'active' } })
  const participants = await (await fetch(`${app.api}/api/participants`, { headers: person })).json() as { agents: { id: string; handle: string }[] }
  agentId = participants.agents.find((one) => one.handle === 'made-up-alignment-agent')?.id ?? ''
  expect(agentId).not.toBe('')
  const message = { kind: 'message', title: 'Made-up marked message', data: { body: asked, to: [{ kind: 'agent', id: agentId }], intent: 'proposal-first' } }
  await file(person, message, theAnswerToAWriteInATestOffice(person, message))
  await file(agent, { kind: 'message', title: 'Made-up reply', data: { body: replied, to: [{ kind: 'person', id: THE_PERSON }] } })
}, 240_000)

afterAll(async () => { await app?.stop() }, 60_000)

type Rect = { left: number; right: number; top: number; bottom: number; width: number }
type Reading = { press: Rect; from: Rect; time: Rect; mark: Rect; bubbles: [Rect, Rect] }
async function read(page: Page): Promise<Reading | null> {
  return page.evaluate(([a, b]) => (window as unknown as { theTimeAndEdges: (a: string, b: string) => Reading | null }).theTimeAndEdges(a, b), [asked, replied] as const)
}

describe('the reply time when the aligned from line reaches it', () => {
  it.each([990, 660])('keeps both lines readable at %i with Edit open', async (width) => {
    const context = await app.browser.newContext({ viewport: { width, height: 1000 }, colorScheme: 'light' })
    try {
      await context.addInitScript(() => { localStorage.setItem('mole-office.preset.theme', 'light'); localStorage.setItem('mole-office.workspace', 'default'); localStorage.setItem('mole-office.chat.open', 'split'); localStorage.setItem('mole-office.chat.split-side', 'right') })
      const page = await context.newPage()
      await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await page.evaluate(([event, detail]) => window.dispatchEvent(new CustomEvent(event, { detail })), [OPEN_AT, participantKey({ kind: 'agent', id: agentId })] as const)
      const source = page.locator('.px-chat-one', { has: page.locator('.px-chat-words', { hasText: asked }) })
      await source.locator('.px-chat-intent-mark').waitFor({ timeout: 30_000 })
      await page.locator('.px-chat-mark-broken').waitFor({ timeout: 30_000 })
      await page.addScriptTag({ content: measurements })
      const before = await read(page)
      expect(before).not.toBeNull()
      await source.locator('.px-chat-edit').click()
      await source.locator('.px-chat-editor-words').waitFor()
      await expect.poll(async () => {
        const v = await read(page)
        if (v === null) return false
        return Math.abs(v.press.left - v.mark.left) <= 1 && v.time.top >= Math.max(v.press.bottom, v.from.bottom) - 0.5 && v.from.right <= v.bubbles[1].right + 0.5 && v.from.top >= v.press.bottom - 0.5 && Math.abs(v.from.left - v.press.left) <= 1
      }, { timeout: 10_000 }).toBe(true)
      const after = await read(page)
      expect(after).not.toBeNull()
      for (let i = 0; i < 2; i += 1) {
        expect(Math.abs(after!.bubbles[i]!.left - before!.bubbles[i]!.left)).toBeLessThanOrEqual(0.5)
        expect(Math.abs(after!.bubbles[i]!.width - before!.bubbles[i]!.width)).toBeLessThanOrEqual(0.5)
      }
    } finally { await context.close() }
  }, 120_000)
})
