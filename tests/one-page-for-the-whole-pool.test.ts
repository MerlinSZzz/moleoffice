// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE PAGE HOLDING EVERY MESSAGE IN THE PROJECT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The owner left a comment, landed on a page telling them whether a message had been sent, and could not
 * find it again. A page of its own is needed for reading and managing the message pool.
 *
 * That page was the Agent conversations page.
 * That page reads a different store — the threads a person opens from the composer. This page reads
 * the pool. Criterion M27, problem `UPb5lRtU-Z5X`.
 *
 * EVERYTHING HERE IS READ OFF A REAL PAGE, because the page is a drawing of the pool and the only
 * way to know it draws the pool is to write into the pool and look.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { MESSAGES_PAGE, CHAT_WORDS, DELIVERY } from '../src/shared/messages.ts'
import { t } from '../src/shared/i18n.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const asAgent = (id: string): Record<string, string> => ({
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

const FROM_THE_BUILDER = 'The wrist camera fit is holding at 0.4 px.'
const FROM_THE_CHECKER = 'The calibration table is short a row at effort 18.'
const THE_PERSONS_COMMENT = 'Which repository is this claim written against?'

/** One message, written the way anything writes one. */
async function say(from: Record<string, string>, body: string, to: { kind: string; id: string }): Promise<string> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: from,
    body: JSON.stringify({ kind: 'message', title: body.slice(0, 40), data: { body, to: [to] } }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
  return ((await said.json()) as { record: { id: string } }).record.id
}

/**
 * Go to the Messages page and wait for its list to be drawn.
 *
 * IT GOES SOMEWHERE ELSE FIRST. Going to the address the browser is already on does not reload the
 * page, so the filters would be wherever the last test left them.
 *
 * It waits until the page there is drawn, not for a part that every page draws. The frame holds a
 * move to another page until it has read whether a review is collecting, so a move straight back
 * would find the Messages page never left.
 */
async function openThePage(): Promise<void> {
  await app.page.goto(`${app.site}/#/`)
  await waitForThePage(app.page)
  await app.page.goto(`${app.site}/#/messages`)
  await app.page.waitForSelector('.px-ms-list', { timeout: 20_000 })
  // THE FILTERS ARE BEHIND A PRESS, because a page being read draws no box until somebody asks for
  // one. Every case below narrows the list, so every case starts by asking.
  await app.page.click('.px-ms-narrow-open')
  await app.page.waitForSelector('.px-ms-filters select', { timeout: 20_000 })
}

/** Every message row's words, as the page draws them. */
async function rows(): Promise<string[]> {
  return await app.page.$$eval('.px-ms-one', (all) => all.map((one) => one.textContent ?? ''))
}

beforeAll(async () => {
  app = await liveApp({ name: 'pool-page', viewport: { width: 1440, height: 1000 } })
  for (const [handle, title] of [
    ['builder-x', 'Builder X'],
    ['checker-y', 'Checker Y'],
  ] as const) {
    const filed = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ kind: 'agent', title, data: { handle, runtime: 'claude-code', state: 'active' } }),
    })
    expect(filed.status, await filed.text()).toBe(201)
  }

  // A RECORD FOR A COMMENT TO POINT AT.
  const about = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'note', title: 'The mount claim', data: { body: 'Where the claim is written down.' } }),
  })
  expect(about.status, await about.clone().text()).toBe(201)
  const aboutId = ((await about.json()) as { record: { id: string } }).record.id

  await say(asAgent('builder-x'), FROM_THE_BUILDER, { kind: 'person', id: THE_PERSON })
  await say(asAgent('checker-y'), FROM_THE_CHECKER, { kind: 'person', id: THE_PERSON })

  // AND ONE COMMENT: a message that says what on a page it is about.
  const comment = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'message',
      title: THE_PERSONS_COMMENT.slice(0, 40),
      data: {
        body: THE_PERSONS_COMMENT,
        to: [{ kind: 'agent', id: 'builder-x' }],
        target: { target: { kind: 'record', recordId: aboutId, workspaceId: 'default' }, place: { at: 'surface' } },
      },
    }),
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(comment.status, await comment.clone().text()).toBe(409)
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe('the page holds every message in the project', () => {
  it('draws one row per message, with who wrote it, when, and who it reached', async () => {
    await openThePage()
    const drawn = await rows()
    expect(drawn.length, 'the page draws no messages at all, so nothing below proves anything').toBeGreaterThanOrEqual(3)

    const builder = drawn.find((one) => one.includes(FROM_THE_BUILDER))
    expect(builder, 'a message an agent wrote is not on the page').toBeDefined()
    expect(builder, 'the page does not say who wrote it').toContain('Builder X')
    expect(builder, 'the page does not say who it reached').toContain(THE_TEST_OFFICES_OWNER.name)

    expect(drawn.some((one) => one.includes(FROM_THE_CHECKER)), 'the other agent’s message is missing').toBe(true)
    expect(drawn.some((one) => one.includes(THE_PERSONS_COMMENT)), 'the person’s comment is not in the pool page').toBe(true)
  }, 120_000)

  it('says how far each message got, in the words the panel uses for the same mark', async () => {
    await openThePage()
    const drawn = await rows()
    const builder = drawn.find((one) => one.includes(FROM_THE_BUILDER)) ?? ''
    // ONE READER FOR THE MARK. The page must not word a delivery mark its own way: a second wording
    // of one fact is how the page and the panel come to disagree about the same message.
    const said = [DELIVERY.queued.word, DELIVERY.delivered.word, DELIVERY.seen.word]
    expect(said.some((word) => builder.includes(word)), 'no delivery mark is drawn on the row').toBe(true)
  }, 120_000)

  it('says a comment is a comment and what it is about', async () => {
    await openThePage()
    const drawn = await rows()
    const comment = drawn.find((one) => one.includes(THE_PERSONS_COMMENT)) ?? ''
    expect(comment, 'a comment is not marked as one').toContain(MESSAGES_PAGE.isAComment)
    expect(comment, 'a comment does not say what it is about').toContain(CHAT_WORDS.aboutThePlace('The mount claim'))
  }, 120_000)
})

describe('the page can be narrowed, and always says what it is hiding', () => {
  it('narrows by who wrote it and says how many rows are hidden', async () => {
    await openThePage()
    const before = (await rows()).length

    // THE SENDER FILTER, chosen by the name the registry holds.
    const senderBox = (await app.page.$$('.px-ms-filters select'))[0]
    expect(senderBox, 'the sender filter is not drawn').toBeDefined()
    await senderBox?.selectOption({ label: 'Builder X' })

    await app.page.waitForFunction(
      (words: string) =>
        !Array.from(document.querySelectorAll('.px-ms-one')).some((one) =>
          (one.textContent ?? '').includes(words),
        ),
      FROM_THE_CHECKER,
      { timeout: 20_000 },
    )
    const after = await rows()
    expect(after.some((one) => one.includes(FROM_THE_BUILDER)), 'the writer’s own message was hidden too').toBe(true)
    expect(after.length, 'nothing was narrowed, so the filter did nothing').toBeLessThan(before)

    // AND IT SAYS SO. A filter somebody has forgotten they set is a lie about the data.
    const hiding = (await app.page.textContent('.px-ms-hiding')) ?? ''
    expect(hiding, 'the page does not say it is hiding rows').toContain(
      t('messages.hiding.some', { hidden: before - after.length, total: before }),
    )

    // AND ONE PRESS CLEARS IT.
    await app.page.click('.px-ms-clear')
    await app.page.waitForFunction(
      (words: string) =>
        Array.from(document.querySelectorAll('.px-ms-one')).some((one) => (one.textContent ?? '').includes(words)),
      FROM_THE_CHECKER,
      { timeout: 20_000 },
    )
    expect((await rows()).length).toBe(before)
  }, 120_000)

  it('narrows to comments alone', async () => {
    await openThePage()
    const boxes = await app.page.$$('.px-ms-filters select')
    // The fourth select is how far it got, which is where "is a comment" lives.
    await boxes[3]?.selectOption({ label: MESSAGES_PAGE.onlyComments })
    await app.page.waitForFunction(
      (words: string) =>
        !Array.from(document.querySelectorAll('.px-ms-one')).some((one) =>
          (one.textContent ?? '').includes(words),
        ),
      FROM_THE_BUILDER,
      { timeout: 20_000 },
    )
    const drawn = await rows()
    expect(drawn.every((one) => one.includes(MESSAGES_PAGE.isAComment)), 'a row that is not a comment survived').toBe(
      true,
    )
    expect(drawn.some((one) => one.includes(THE_PERSONS_COMMENT)), 'the comment itself was hidden').toBe(true)
  }, 120_000)
})

describe('the page is reachable by name, and a message opens in its conversation', () => {
  it('has no row in the sidebar, and opens at its own address under its own name', async () => {
    // CRITERION CHANGE, wave 13q round 44: this case was "is on the rail
    // under its own name" and pressed the sidebar's Messages row in the project block. Messages
    // belong to no project, so the row is gone; the page is reached from the chat's foot (the next
    // case) and at its own address.
    await app.page.goto(`${app.site}/#/`)
    await app.page.waitForSelector('#shell-side', { timeout: 20_000 })
    expect(await app.page.locator('#shell-side a[href="#/messages"]').count(), 'the sidebar still has a Messages row').toBe(0)
    await app.page.goto(`${app.site}/#/messages`)
    await app.page.waitForSelector('.px-ms-list', { timeout: 20_000 })
    expect(await app.page.textContent('h1')).toBe('Messages')
  }, 120_000)

  it('is linked from the messages panel', async () => {
    await app.page.goto(`${app.site}/#/`)
    await openTheChat(app.page)
    await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
    if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
    await app.page.waitForSelector('.px-chat-foot-link', { timeout: 20_000 })
    const link = (await app.page.textContent('.px-chat-foot-link')) ?? ''
    expect(link, 'the panel does not link to the page').toContain(CHAT_WORDS.everyMessage)
    await app.page.click('.px-chat-foot-link a')
    await app.page.waitForSelector('.px-ms-list', { timeout: 20_000 })
  }, 120_000)

  it('does not repeat the Messages link on Agent conversations', async () => {
    // CRITERION CHANGE, 29 September 2026: Messages is in the sidebar, so Agent conversations no
    // longer links to it from the page body. The page has one short lede instead of the old link
    // paragraph. Since wave 13q round 44 the pool is reachable from the
    // chat's foot and from its own route, and no longer from the sidebar.
    await app.page.goto(`${app.site}/#/conversations`)
    await app.page.waitForSelector('.px-ag-title', { timeout: 20_000 })
    const page = app.page.locator('main.page')
    expect(await page.locator('.px-ag-lead').count(), 'the page does not have one lede').toBe(1)
    expect(await page.locator('a[href="#/messages"]').count(), 'the page repeats the Messages link').toBe(0)
  }, 120_000)

  it('opens a message in the conversation it belongs to', async () => {
    await openThePage()
    // THE PRESS OPENS THE CONVERSATION WITH THE OTHER SIDE. The reader received this one, so the
    // other side is the agent that wrote it — not the reader themself, who has no conversation
    // with themselves to open.
    const row = await app.page.$('.px-ms-one:has-text("' + FROM_THE_BUILDER + '") .px-ms-open')
    expect(
      await app.page.textContent('.px-ms-one:has-text("' + FROM_THE_BUILDER + '") .px-ms-open'),
      'the press names the wrong side of the conversation',
    ).toBe(MESSAGES_PAGE.openItWhereItIsRead('Builder X'))
    expect(row, 'a message row offers nothing to press').not.toBeNull()
    await row?.click()
    await app.page.waitForSelector('.px-chat-said', { timeout: 20_000 })
    await app.page.waitForFunction(
      (words: string) => document.querySelector('.px-chat')?.textContent?.includes(words) === true,
      FROM_THE_BUILDER,
      { timeout: 20_000 },
    )
    const panel = (await app.page.textContent('.px-chat')) ?? ''
    expect(panel, 'the conversation that opened does not hold the message').toContain(FROM_THE_BUILDER)
  }, 120_000)
})
