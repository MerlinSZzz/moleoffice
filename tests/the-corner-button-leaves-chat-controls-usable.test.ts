// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The corner button remains usable without covering the chat's own controls. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, openRecordPagesAt, waitForThePage, type LiveApp } from './helpers.ts'

const PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
let app: LiveApp
let report: string

beforeAll(async () => {
  app = await liveApp({ name: 'the-corner-button-leaves-chat-controls-usable', viewport: { width: 390, height: 844 }, workspace: 'default', opensAt: 'full' })
  const agent = await fetch(`${app.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify({ kind: 'agent', title: 'Made-up Button Agent', data: { handle: 'made-up-button-agent', runtime: 'claude-code', state: 'active' } }) })
  expect(agent.status, await agent.clone().text()).toBe(201)
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify({ kind: 'report', title: 'Made-up report', data: { for: 'Made-up reader', date: '2026-11-14', blocks: [{ id: 'one', type: 'text', heading: 'Made-up part', text: 'Made-up words.' }] } }) })
  expect(made.status, await made.clone().text()).toBe(201)
  report = ((await made.json()) as { record: { id: string } }).record.id
  const chosen = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { method: 'PATCH', headers: PERSON, body: JSON.stringify({ chatButtonStays: 'always', chatOpensAs: 'window' }) })
  expect(chosen.status, await chosen.clone().text()).toBe(200)
}, 300_000)
afterAll(async () => { await app?.stop() }, 60_000)

for (const theme of ['light', 'dark'] as const) {
  it(`the ${theme} phone window and full window leave every control uncovered`, async () => {
    const context = await app.browser.newContext({ viewport: { width: 390, height: 844 } })
    try {
      await openRecordPagesAt(context, 'full')
      await context.addInitScript((look) => {
        localStorage.setItem('mole-office.preset.theme', look)
        localStorage.setItem('mole-office.language', 'en')
        localStorage.setItem('mole-office.workspace', 'default')
        localStorage.setItem('mole-office.chat.open', 'no')
        localStorage.setItem('mole-office.chat.full', 'no')
      }, theme)
      const page = await context.newPage()
      await page.goto(`${app.site}/?lang=en#/r/${report}`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      const circle = page.locator('.px-chat-circle')
      await circle.waitFor({ state: 'visible', timeout: 30_000 })
      await circle.click()
      await page.locator('.px-chat-contact').filter({ hasText: 'Made-up Button Agent' }).click({ timeout: 30_000 })
      const send = page.locator('aside.px-chat .px-chat-send').last()
      await send.waitFor({ state: 'visible', timeout: 30_000 })
      for (const size of ['phone-foot', 'full']) {
        if (size === 'full') await page.locator('aside.px-chat .px-chat-fill').click()
        const overlaps = await page.evaluate(() => {
          const circle = document.querySelector('.px-chat-circle')!.getBoundingClientRect()
          return Array.from(document.querySelectorAll<HTMLElement>('aside.px-chat button, aside.px-chat input, aside.px-chat textarea, aside.px-chat select, aside.px-chat a[href]')).flatMap((control) => {
            const rect = control.getBoundingClientRect()
            const style = getComputedStyle(control)
            if (!rect.width || !rect.height || style.visibility === 'hidden' || style.display === 'none') return []
            if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= innerWidth || rect.top >= innerHeight) return []
            if (rect.left < circle.right && rect.right > circle.left && rect.top < circle.bottom && rect.bottom > circle.top) return [control.outerHTML.slice(0, 200)]
            return []
          })
        })
        expect(overlaps, `${size} controls covered by the corner button`).toEqual([])
        const hit = await send.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
          return top === element || element.contains(top)
        })
        expect(hit, `${size} Send is hit at its center`).toBe(true)
      }
      await circle.click()
      expect(await page.locator('aside.px-chat').count()).toBe(0)
    } finally { await context.close() }
  }, 180_000)
}

it('the unchosen button follows the reader kind', async () => {
  const shared = await import('../src/shared/participants.ts')
  expect(shared.chatButtonStaysBeforeAnybodyChooses('person')).toBe('always')
  expect(shared.chatButtonStaysBeforeAnybodyChooses('agent')).toBe('when-unread')
})

it('an unchosen person sees the unread count on the button beside the open chat', async () => {
  // THE BUTTON IS UNCHOSEN, AND THE PERSON LAST HAD THE CHAT BESIDE THE PAGE, so the sidebar's Chat row opens it there.
  const cleared = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { method: 'PATCH', headers: PERSON, body: JSON.stringify({ chatButtonStays: '', chatOpensAs: 'split' }) })
  expect(cleared.status, await cleared.clone().text()).toBe(200)
  const peopleReply = await fetch(`${app.api}/api/participants`, { headers: PERSON })
  expect(peopleReply.status, await peopleReply.clone().text()).toBe(200)
  const people = ((await peopleReply.json()) as { people: Record<string, unknown>[] }).people
  expect(people.find((person) => person.id === THE_PERSON)?.chatButtonStays).toBeNull()
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-button-agent' },
    body: JSON.stringify({ kind: 'message', title: 'Made-up unread line', data: { body: 'Made-up unread line.', to: [{ kind: 'person', id: THE_PERSON }] } }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
  try {
    await openRecordPagesAt(context, 'full')
    await context.addInitScript(() => {
      if (sessionStorage.getItem('corner-test-set') === 'yes') return
      sessionStorage.setItem('corner-test-set', 'yes')
      localStorage.setItem('mole-office.language', 'en')
      localStorage.setItem('mole-office.workspace', 'default')
      localStorage.setItem('mole-office.chat.open', 'no')
      localStorage.setItem('mole-office.chat.full', 'no')
    })
    const page = await context.newPage()
    await page.goto(`${app.site}/?lang=en#/r/${report}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.locator('.px-chat-circle .px-chat-unread').waitFor({ state: 'visible', timeout: 30_000 })
    await page.locator('.shell-side .shell-chat').click()
    await page.locator('.px-chat[data-where="split"]').waitFor({ state: 'visible', timeout: 30_000 })
    await expect.poll(async () => page.locator('.px-chat-circle .px-chat-unread').textContent(), { timeout: 20_000 }).toBe('1')
    expect(await page.locator('.px-chat-circle').isVisible()).toBe(true)
    expect(await page.locator('.shell-side .shell-chat .shell-chat-count').count()).toBe(0)
  } finally { await context.close() }
}, 180_000)
