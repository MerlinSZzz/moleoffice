// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp
const carryReads: string[] = []
beforeAll(async () => {
  app = await liveApp({ name: 'menu-press-reading', viewport: { width: 1440, height: 1000 } })
  // The menu's candidate reader still asks for whole rows, separately from the mounted page cache.
  await app.page.route('**/api/participants', async route => route.fulfill({ response: await route.fetch({ url: `${app.api}/api` }), json: { people: [], agents: [
    { kind: 'agent', id: 'empty-agent', handle: 'empty-agent', name: 'Empty Agent', avatarUrl: '', state: null, stateAt: null, createdAt: '2026-09-01 09:00:00', homeWorld: null, addressAs: {}, addressAsSetBy: null },
    { kind: 'agent', id: 'carrying-agent', handle: 'carrying-agent', name: 'Carrying Agent', avatarUrl: '', state: null, stateAt: null, createdAt: '2026-09-01 09:00:00', homeWorld: null, addressAs: {}, addressAsSetBy: null },
    { kind: 'agent', id: 'unwaiting-agent', handle: 'unwaiting-agent', name: 'Unwaiting Agent', avatarUrl: '', state: null, stateAt: null, createdAt: '2026-09-01 09:00:00', homeWorld: null, addressAs: {}, addressAsSetBy: null },
    { kind: 'agent', id: 'answering-agent', handle: 'answering-agent', name: 'Answering Agent', avatarUrl: '', state: null, stateAt: null, createdAt: '2026-09-01 09:00:00', homeWorld: null, addressAs: {}, addressAsSetBy: null },
  ] } }))
  await app.page.route('**/api/participants?shape=page', async route => route.fulfill({ response: await route.fetch({ url: `${app.api}/api` }), json: { people: [], agents: [
    { id: 'empty-agent', handle: 'empty-agent', name: 'Empty Agent' },
    { id: 'carrying-agent', handle: 'carrying-agent', name: 'Carrying Agent' },
  ] } }))
  await app.page.route('**/api/presence', async route => route.fulfill({ response: await route.fetch({ url: `${app.api}/api` }), json: { presence: [
    ...['empty-agent', 'carrying-agent', 'unwaiting-agent'].map(id => ({ who: { kind: 'agent', id }, colour: 'grey' })),
    { who: { kind: 'agent', id: 'answering-agent' }, colour: 'green' },
  ] } }))
  await app.page.route('**/api/messages/carryable-agent-ids', async route => route.fulfill({ response: await route.fetch({ url: `${app.api}/api` }), json: { agentIds: ['empty-agent', 'carrying-agent', 'answering-agent'] } }))
  await app.page.route('**/api/agents/*/start-a-new-agent', async route => {
    const id = new URL(route.request().url()).pathname.split('/')[3]!
    carryReads.push(id)
    await route.fulfill({ response: await route.fetch({ url: `${app.api}/api` }), json: { wouldCarry: id === 'carrying-agent' } })
  })
}, 240_000)
// THE ROUTES ARE TAKEN DOWN FIRST: a route still fetching when the page closes throws after the cases have passed.
afterAll(async () => { await app?.page.unrouteAll({ behavior: 'ignoreErrors' }); await app?.stop() }, 60_000)

it('lists and counts grey agents in the carry reading, then reads only the pressed agent', async () => {
  await app.page.goto(`${app.site}/#/records`)
  await waitForThePage(app.page, 60_000)
  await app.page.click('body', { button: 'right' })
  await app.page.click('.px-talk-more-btn')
  await app.page.getByText(t('talk.notAnswering', { n: 2 }), { exact: true }).waitFor()
  await app.page.click('.px-talk-more-line')
  await app.page.waitForSelector('.px-start-agent[data-agent="carrying-agent"]')
  expect(await app.page.$$eval('.px-start-agent-here-name', all => all.map(el => el.textContent))).toEqual(['Empty Agent', 'Carrying Agent'])
  expect(carryReads).toEqual([])
  await app.page.locator('.px-start-agent[data-agent="empty-agent"]').click()
  await app.page.getByText(t('newAgentKeys.nothingToCarry' as Parameters<typeof t>[0]), { exact: true }).waitFor()
  expect(carryReads).toEqual(['empty-agent'])
  expect(await app.page.locator('.px-start-agent-yes').count()).toBe(0)
}, 120_000)

it('names the agent when its reading fails', async () => {
  carryReads.length = 0
  await app.page.route('**/api/agents/empty-agent/start-a-new-agent', async route => {
    carryReads.push('empty-agent')
    await route.fulfill({ response: await route.fetch({ url: `${app.api}/api` }), status: 500, json: { error: 'reading unavailable' } })
  })
  await app.page.reload()
  await waitForThePage(app.page, 60_000)
  await app.page.click('body', { button: 'right' })
  await app.page.click('.px-talk-more-btn')
  await app.page.locator('.px-talk-more-line').click()
  await app.page.locator('.px-start-agent[data-agent="empty-agent"]').click()
  const fault = app.page.locator('.px-start-agent-ask .px-start-agent-fault')
  await fault.waitFor()
  expect(await fault.innerText()).toBe(t('newAgentKeys.readingFailed', { who: 'Empty Agent', handle: 'empty-agent', why: 'reading unavailable' }))
  expect(carryReads).toEqual(['empty-agent'])
}, 120_000)

it('keeps the chat usable while the new agent dialog\'s reading is still out', async () => {
  let release = () => {}
  const held = new Promise<void>((resolve) => { release = resolve })
  let completed = () => {}
  const finished = new Promise<void>((resolve) => { completed = resolve })
  let started = false
  // THE CHAT'S NEW AGENT PRESS OPENS THE NEW AGENT DIALOG, and the dialog's agent tool list is the
  // Casting reading. That reading is held here, so the dialog is open while its list is still out.
  await app.page.route('**/api/casting', async (route) => {
    started = true
    try {
      await held
      await route.fulfill({ json: { roles: [], programs: [], labels: [], rules: [], officeTimeZone: 'UTC' } })
    } finally { completed() }
  })
  try {
    await app.page.goto(`${app.site}/#/records`)
    await app.page.reload()
    await waitForThePage(app.page, 60_000)
    await openTheChat(app.page)
    await app.page.locator('.px-chat-new-agent').waitFor()
    const request = app.page.waitForRequest('**/api/casting')
    await app.page.locator('.px-chat-new-agent').click()
    await request
    await app.page.locator('.px-new-agent-dialog').waitFor()
    await app.page.locator('.px-new-agent-dialog-state', { hasText: t('newAgentDialog.reading') }).first().waitFor()
    expect(await app.page.locator('.px-chat').isVisible()).toBe(true)
    await app.page.locator('.px-new-agent-dialog-cancel').click()
    expect(await app.page.locator('.px-new-agent-dialog').count()).toBe(0)
    expect(await app.page.locator('.px-chat').isVisible()).toBe(true)
  } finally {
    release()
    if (started) await finished
  }
}, 120_000)
