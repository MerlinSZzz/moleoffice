// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The reply control follows the mark as the chat changes size, and its source stays beside it when it fits or below it when it would cross the bubble. */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { OPEN_AT } from '../src/web/lib/open-chat.ts'
import { type LiveApp, liveApp, theAnswerToAWriteInATestOffice, waitForThePage } from './helpers.ts'

const asked = 'Made-up message: please show a plan before making any changes.'
const replied = 'Made-up reply: the change is already made.'
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
    window.theAlignment = (asked, replied) => {
      const row = words => [...document.querySelectorAll('.px-chat-one')].find(node => node.querySelector('.px-chat-words')?.textContent?.includes(words));
      const label = row(asked)?.querySelector('.px-chat-intent-mark');
      const press = row(replied)?.querySelector('.px-chat-mark-broken');
      const from = row(replied)?.querySelector('.px-chat-from');
      const model = row(replied)?.querySelector('.px-chat-ranby');
      const bubble = row(replied)?.querySelector('.px-chat-bubble');
      if (!label || !press || !from || !model || !bubble) return null;
      const l = label.getBoundingClientRect(), p = press.getBoundingClientRect(), f = from.getBoundingClientRect(), m = model.getBoundingClientRect(), b = bubble.getBoundingClientRect();
      const style = getComputedStyle(bubble);
      const left = b.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
      const right = b.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
      const target = Math.max(left, Math.min(l.left, right - p.width));
      const canvas = document.createElement('canvas').getContext('2d');
      if (!canvas) return null;
      canvas.font = getComputedStyle(from).font;
      const gap = parseFloat(getComputedStyle(press.parentElement).columnGap) || 0;
      const wouldCross = target + p.width + gap + canvas.measureText(from.textContent || '').width > right + 0.5;
      const line = press.parentElement;
      const lineStyle = line.getAttribute('style'), fromStyle = from.getAttribute('style');
      line.style.flex = ''; line.style.width = ''; line.style.flexDirection = ''; line.style.alignItems = '';
      from.style.width = ''; from.style.maxWidth = ''; from.style.overflowWrap = '';
      const unwrapped = bubble.getBoundingClientRect();
      if (lineStyle === null) line.removeAttribute('style'); else line.setAttribute('style', lineStyle);
      if (fromStyle === null) from.removeAttribute('style'); else from.setAttribute('style', fromStyle);
      const overlaps = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
      const sameLine = p.right <= f.left + 0.5 && Math.abs((p.top + p.bottom - f.top - f.bottom) / 2) < 4;
      const below = f.top >= p.bottom - 0.5 && Math.abs(f.left - p.left) <= 1 && f.right <= right + 1 && from.scrollWidth <= from.clientWidth + 1;
      return { difference: Math.abs(target - p.left), sourcePlaced: wouldCross ? below : sameLine, bubbleUnchanged: Math.abs(b.left - unwrapped.left) <= 1 && Math.abs(b.width - unwrapped.width) <= 1, next: press.nextElementSibling === from, modelClear: !overlaps(p, m), fromClear: !overlaps(p, f), pressInside: p.left >= left - 1 && p.right <= right + 1, belowModel: p.top >= m.bottom - 0.5 && f.top >= m.bottom - 0.5 };
    }
  })()`
  app = await liveApp({ name: 'mark-edge-alignment', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await file(person, { kind: 'agent', title: 'Made-up alignment agent', data: { handle: 'made-up-alignment-agent', runtime: 'claude-code', state: 'active' } })
  const participants = await (await fetch(`${app.api}/api/participants`, { headers: person })).json() as { agents: { id: string; handle: string }[] }
  agentId = participants.agents.find((one) => one.handle === 'made-up-alignment-agent')?.id ?? ''
  expect(agentId).not.toBe('')
  const run = await file(person, { kind: 'session', title: 'Made-up alignment run', data: { state: 'finished', runtime: 'claude-code', model: 'claude-opus-5-5', doing: 'made-up work' } })
  const message = { kind: 'message', title: 'Made-up marked message', data: { body: asked, to: [{ kind: 'agent', id: agentId }], intent: 'proposal-first' } }
  await file(person, message, theAnswerToAWriteInATestOffice(person, message))
  await file(agent, { kind: 'message', title: 'Made-up reply', data: { body: replied, to: [{ kind: 'person', id: THE_PERSON }], fromRun: run } })
}, 240_000)

afterAll(async () => { await app?.stop() }, 60_000)

async function aligned(page: Page) {
  await expect.poll(async () => page.evaluate(([a, b]) => (window as unknown as { theAlignment: (a: string, b: string) => { difference: number; sourcePlaced: boolean; bubbleUnchanged: boolean; next: boolean; modelClear: boolean; fromClear: boolean; pressInside: boolean; belowModel: boolean } | null }).theAlignment(a, b), [asked, replied] as const), { timeout: 10_000 }).toMatchObject({ sourcePlaced: true, bubbleUnchanged: true, next: true, modelClear: true, fromClear: true, pressInside: true, belowModel: true })
  await expect.poll(async () => page.evaluate(([a, b]) => (window as unknown as { theAlignment: (a: string, b: string) => { difference: number } | null }).theAlignment(a, b)?.difference ?? Infinity, [asked, replied] as const), { timeout: 10_000 }).toBeLessThanOrEqual(1)
}

describe('the reply control follows the marked message', () => {
  it.each([[1440, 'right'], [1440, 'window'], [660, 'right'], [390, 'right'], [390, 'window']] as const)('aligns at %i with the chat %s', async (width, where) => {
    const context = await app.browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, colorScheme: 'light' })
    try {
      await context.addInitScript((open) => { localStorage.setItem('mole-office.preset.theme', 'light'); localStorage.setItem('mole-office.workspace', 'default'); localStorage.setItem('mole-office.chat.open', open); localStorage.setItem('mole-office.chat.split-side', 'right') }, where === 'window' ? 'yes' : 'split')
      const page = await context.newPage()
      await useMadeUpSource(page, 'short')
      await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await page.evaluate(([event, detail]) => window.dispatchEvent(new CustomEvent(event, { detail })), [OPEN_AT, participantKey({ kind: 'agent', id: agentId })] as const)
      const source = page.locator('.px-chat-one', { has: page.locator('.px-chat-words', { hasText: asked }) })
      await source.locator('.px-chat-intent-mark').waitFor({ timeout: 30_000 })
      await page.locator('.px-chat-mark-broken').waitFor({ timeout: 30_000 })
      await page.addScriptTag({ content: measurements })
      for (const edit of [false, true]) {
        if (edit) { await source.locator('.px-chat-edit').click(); await source.locator('.px-chat-editor-words').waitFor() }
        await aligned(page)
        await page.setViewportSize({ width: width + 50, height: width === 390 ? 844 : 1000 })
        await aligned(page)
        await page.evaluate(async () => { await document.fonts.ready; document.fonts.dispatchEvent(new Event('loadingdone')) })
        await aligned(page)
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
        await aligned(page)
      }
    } finally { await context.close() }
  }, 120_000)
})

/** Give both messages made-up sources; the long reply source exceeds the whole bubble. */
async function useMadeUpSource(page: Page, source: 'short' | 'long'): Promise<void> {
  await page.route('**/api/messages/conversation**', async (route) => {
    const response = await route.fetch()
    const answer = await response.json() as { messages: { body: string; writtenFrom: unknown }[] }
    for (const message of answer.messages) {
      if (message.body === asked) {
        message.writtenFrom = { machine: 'made-up-source', how: 'this machine', program: null }
      } else if (message.body === replied) {
        message.writtenFrom = { machine: source === 'short' ? 'x' : 'wide'.repeat(40), how: 'this machine', program: null }
      }
    }
    await route.fulfill({ response, json: answer })
  })
}

/** The test moves the label to each reply edge; this is not the product's own label layout. */
async function putTheLabelAt(page: Page, asked: string, replied: string, side: 'left' | 'right' | 'restore'): Promise<void> {
  await page.evaluate(([asked, replied, side]) => {
    const row = (words: string) => [...document.querySelectorAll<HTMLElement>('.px-chat-one')].find((one) => one.querySelector('.px-chat-words')?.textContent?.includes(words))
    const label = row(asked)?.querySelector<HTMLElement>('.px-chat-intent-mark')
    const reply = row(replied)
    const press = reply?.querySelector<HTMLElement>('.px-chat-mark-broken')
    const bubble = reply?.querySelector<HTMLElement>('.px-chat-bubble')
    if (!label || !press || !bubble) throw new Error('The made-up messages are not drawn.')
    label.style.removeProperty('left')
    label.style.removeProperty('position')
    if (side === 'restore') return
    const original = label.getBoundingClientRect().left
    const b = bubble.getBoundingClientRect(), style = getComputedStyle(bubble)
    const left = b.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)
    const right = b.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight)
    const target = side === 'left' ? left : right - press.getBoundingClientRect().width
    label.style.position = 'relative'
    label.style.left = `${target - original}px`
  }, [asked, replied, side] as const)
}

async function theReplyBubble(page: Page, replied: string): Promise<{ left: number; width: number }> {
  return page.evaluate((words) => {
    const row = [...document.querySelectorAll<HTMLElement>('.px-chat-one')].find((one) => one.querySelector('.px-chat-words')?.textContent?.includes(words))
    const bubble = row?.querySelector<HTMLElement>('.px-chat-bubble')
    if (!bubble) throw new Error('The made-up reply is not drawn.')
    const rect = bubble.getBoundingClientRect()
    return { left: rect.left, width: rect.width }
  }, replied)
}

/** Measure the hypothetical one-line source as well as the drawn foot, so each fixture proves which rule applies. */
async function sourceStaysInItsPlace(page: Page, source: 'short' | 'long', expected?: 'beside' | 'below'): Promise<void> {
  let last: unknown = null
  try {
    await expect.poll(async () => {
      last = await page.evaluate(([asked, replied]) => {
        const row = (words: string) => [...document.querySelectorAll<HTMLElement>('.px-chat-one')].find((one) => one.querySelector('.px-chat-words')?.textContent?.includes(words))
        const label = row(asked)?.querySelector<HTMLElement>('.px-chat-intent-mark')
        const reply = row(replied)
        const press = reply?.querySelector<HTMLElement>('.px-chat-mark-broken')
        const from = reply?.querySelector<HTMLElement>('.px-chat-from')
        const model = reply?.querySelector<HTMLElement>('.px-chat-ranby')
        const bubble = reply?.querySelector<HTMLElement>('.px-chat-bubble')
        if (!label || !press || !from || !model || !bubble || !press.parentElement) return null
        const l = label.getBoundingClientRect(), p = press.getBoundingClientRect(), f = from.getBoundingClientRect(), m = model.getBoundingClientRect(), b = bubble.getBoundingClientRect()
        const style = getComputedStyle(bubble)
        const left = b.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)
        const right = b.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight)
        const overlaps = (a: DOMRect, c: DOMRect) => a.left < c.right - 0.5 && a.right > c.left + 0.5 && a.top < c.bottom - 0.5 && a.bottom > c.top + 0.5
        const canvas = document.createElement('canvas').getContext('2d')
        if (!canvas) return null
        canvas.font = getComputedStyle(from).font
        const natural = canvas.measureText(from.textContent ?? '').width
        const gap = parseFloat(getComputedStyle(press.parentElement).columnGap) || 0
        const line = press.parentElement
        const lineStyle = line.getAttribute('style'), fromStyle = from.getAttribute('style')
        line.style.flex = ''; line.style.width = ''; line.style.flexDirection = ''; line.style.alignItems = ''
        from.style.width = ''; from.style.maxWidth = ''; from.style.overflowWrap = ''
        const unwrappedBubble = bubble.getBoundingClientRect()
        if (lineStyle === null) line.removeAttribute('style'); else line.setAttribute('style', lineStyle)
        if (fromStyle === null) from.removeAttribute('style'); else from.setAttribute('style', fromStyle)
        return {
          pressRight: p.right, fromRight: f.right, bubbleRight: b.right,
          wouldCross: p.right + gap + natural > right + 0.5,
          bubbleUnchanged: Math.abs(b.left - unwrappedBubble.left) <= 1 && Math.abs(b.width - unwrappedBubble.width) <= 1,
          modelClear: !overlaps(p, m), fromClear: !overlaps(p, f), pressInside: p.left >= left - 1 && p.right <= right + 1,
          belowModel: p.top >= m.bottom - 0.5 && f.top >= m.bottom - 0.5,
          aligned: Math.abs(Math.max(left, Math.min(l.left, right - p.width)) - p.left) <= 1,
          next: press.nextElementSibling === from,
          sameLine: p.right <= f.left + 0.5 && Math.abs((p.top + p.bottom - f.top - f.bottom) / 2) < 4,
          below: f.top >= p.bottom - 0.5 && Math.abs(f.left - p.left) <= 1 && f.right <= right + 1 && from.scrollWidth <= from.clientWidth + 1,
        }
      }, [asked, replied] as const)
      if (last === null) return false
      const m = last as { wouldCross: boolean; bubbleUnchanged: boolean; modelClear: boolean; fromClear: boolean; pressInside: boolean; belowModel: boolean; aligned: boolean; next: boolean; sameLine: boolean; below: boolean }
      return m.bubbleUnchanged && m.modelClear && m.fromClear && m.pressInside && m.belowModel && m.aligned && m.next && (source !== 'long' || m.wouldCross) && (expected === undefined || (expected === 'below') === m.wouldCross) && (m.wouldCross ? m.below : m.sameLine)
    }, { timeout: 10_000 }).toBe(true)
  } catch (error) {
    throw new Error(`The reply foot did not fit the ${source} source; press right, source right and bubble right: ${JSON.stringify(last)}\n${String(error)}`)
  }
}


describe('the aligned reply keeps its source inside the bubble', () => {
  const cases = ([1440, 990, 660] as const).flatMap((width) => (['right', 'window'] as const).flatMap((where) => (['short', 'long'] as const).map((source) => [width, where, source] as const)))
  it.each(cases)('aligns at %i with chat %s and a %s source', async (width, where, source) => {
    const context = await app.browser.newContext({ viewport: { width, height: 1000 }, colorScheme: 'light' })
    try {
      await context.addInitScript((open) => { localStorage.setItem('mole-office.preset.theme', 'light'); localStorage.setItem('mole-office.workspace', 'default'); localStorage.setItem('mole-office.chat.open', open); localStorage.setItem('mole-office.chat.split-side', 'right') }, where === 'window' ? 'yes' : 'split')
      const page = await context.newPage()
      await useMadeUpSource(page, source)
      await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await page.evaluate(([event, detail]) => window.dispatchEvent(new CustomEvent(event, { detail })), [OPEN_AT, participantKey({ kind: 'agent', id: agentId })] as const)
      const original = page.locator('.px-chat-one', { has: page.locator('.px-chat-words', { hasText: asked }) })
      await original.locator('.px-chat-intent-mark').waitFor({ timeout: 30_000 })
      await sourceStaysInItsPlace(page, source)
      if (source === 'short') {
        const bubble = await theReplyBubble(page, replied)
        for (const [side, expected] of [['left', 'beside'], ['right', 'below']] as const) {
          await putTheLabelAt(page, asked, replied, side)
          await sourceStaysInItsPlace(page, source, expected)
          const after = await theReplyBubble(page, replied)
          expect(Math.abs(after.left - bubble.left)).toBeLessThanOrEqual(1)
          expect(Math.abs(after.width - bubble.width)).toBeLessThanOrEqual(1)
        }
        await putTheLabelAt(page, asked, replied, 'restore')
        await sourceStaysInItsPlace(page, source)
      }
      await original.locator('.px-chat-edit').click()
      await original.locator('.px-chat-editor-words').waitFor()
      await sourceStaysInItsPlace(page, source)
    } finally { await context.close() }
  }, 120_000)
})
