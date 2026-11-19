// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN UNREAD COUNT FALLS WHEN THE PERSON READS THE MESSAGES, AND THE CIRCLE AGREES WITH THE ROWS UNDER IT.
 *
 * The fault: after a conversation was read, or opened again, its unread 1 stayed, and it stayed after another message was sent.
 * Criterion M19 of design/messages/ACCEPTANCE.md section 9; problem `MaRGbk3A9SL6`.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO FAULTS THIS FILE HOLDS THE FIX TO
 * ---------------------------------------------------------------------------------------
 *
 * 1. NOTHING EVER SAID THE PERSON HAD READ ANYTHING. Opening a conversation moved a message from queued to
 *    delivered, and every count asked for "not seen". So the 1 was right and permanent. The panel
 *    now says it read what it drew, and the count falls.
 *
 * 2. THE NUMBER ON THE CIRCLE WAS COUNTED TWICE. It was its own query over the delivery table and
 *    the rows under it were counted separately, so the two could disagree with nothing failing. The
 *    circle is now the sum of those rows.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * Every browser case first asserts the count is there before it asserts the count went away. A page
 * that drew no badge at all would otherwise pass "there is no badge" for free.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_AGENT = {
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'builder-unread',
}

interface Contacts {
  contacts: { who: { kind: string; id: string } | null; unread: number }[]
  /**
   * The circle's two halves since criterion M32: the contacts' unread MESSAGES, and the NUMBER OF
   * GROUPS holding anything unread. It was one number, the two sums added together on the server.
   */
  unread: { messages: number; groups: number }
}

async function say(body: string): Promise<string> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_AGENT,
    body: JSON.stringify({
      kind: 'message',
      title: body.slice(0, 30),
      data: { body, to: [{ kind: 'person', id: THE_PERSON }] },
    }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
  return ((await said.json()) as { record: { id: string } }).record.id
}

async function readTheContacts(): Promise<Contacts> {
  const got = await fetch(`${app.api}/api/messages/contacts`, { headers: AS_THE_OWNER })
  expect(got.status, await got.clone().text()).toBe(200)
  return (await got.json()) as Contacts
}

/**
 * The number on the circle as the page draws it now, or 0 when there is no badge.
 *
 * IT READS WHAT IS DRAWN NOW AND DOES NOT WAIT. It used `page.textContent`, which waits for the
 * badge to be there. When the badge was rightly gone, each read waited out Playwright's thirty
 * seconds and then answered 0. Measured on 25 September 2026: four such reads, 30.0 seconds each,
 * two minutes of the file's run spent waiting for a badge that was not owed. Every read here
 * comes after the contact rows are drawn, and the rows and the circle are drawn from the same
 * reply, so what is drawn now is what the case is about.
 */
async function theCircle(): Promise<number> {
  // DESIGN D PUTS THE COUNT IN TWO PLACES, one at a time: the circle while the chat is shut, and the sidebar's Chat
  // row while it is open. This file opens the panel, so it reads whichever is drawn.
  const badge = await app.page.$('.px-chat-circle .px-chat-unread, .shell-side .shell-chat .shell-chat-count')
  return badge === null ? 0 : Number(await badge.textContent())
}

/** Every unread number the panel draws on a row, in order. */
async function theRowMarks(): Promise<number[]> {
  return app.page.$$eval('.px-chat-contact .px-chat-unread', (all) => all.map((one) => Number(one.textContent)))
}

/**
 * Open the panel and leave it on the first screen, whatever it was showing before.
 *
 * THE WAY BACK IS PRESSED BEFORE THE TABS ARE WAITED FOR. The panel remembers the contact it was
 * last in, so after a reload it can open straight into a conversation — where there are no tabs to
 * wait for. Waiting first meant this timed out rather than pressing the one control that would have
 * fixed it.
 */
async function openThePanel(): Promise<void> {
  await app.page.goto(app.site)
  await waitForThePage(app.page, 30_000)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  await app.page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'unread-falls', viewport: { width: 1440, height: 1000 } })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Builder Unread',
      data: { handle: 'builder-unread', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.text()).toBe(201)
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe('the number on the circle is the sum of the rows under it', () => {
  it('adds up to exactly the rows in the contacts list', async () => {
    // THERE USED TO BE A BOARD BESIDE THE CONTACTS and this sum had two halves. Criterion M25
    // removed it: a writer nobody registered is now one of these rows, so the contacts are the
    // whole list and the sum has one half.
    await say('The first unread thing.')
    await say('The second unread thing.')
    const held = await readTheContacts()
    const sum = held.contacts.reduce((n, one) => n + one.unread, 0)
    expect(held.unread.messages, 'the circle disagrees with the rows under it').toBe(sum)
    expect(held.unread.messages, 'nothing was counted at all, so the sum proves nothing').toBeGreaterThan(0)
  }, 120_000)

  it('still adds up after one of them is marked read through the door', async () => {
    const id = await say('A third thing, to be marked read on its own.')
    const before = await readTheContacts()
    expect(before.unread.messages).toBeGreaterThan(0)
    const marked = await fetch(`${app.api}/api/messages/${id}/mark`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ mark: 'seen' }),
    })
    expect(marked.status, await marked.text()).toBe(200)
    const after = await readTheContacts()
    expect(after.unread.messages).toBe(before.unread.messages - 1)
    expect(after.unread.messages).toBe(after.contacts.reduce((n, one) => n + one.unread, 0))
  }, 120_000)
})

describe('reading a conversation is what makes its count fall', () => {
  it('shows a mark, then no mark once the person has opened it, and none after a reload or a reply', async () => {
    await say('Something the person has not read yet.')
    await openThePanel()

    // THE CONTROL: the mark is on the contact before the person opens it, and on the circle.
    await app.page.waitForFunction(
      () => document.querySelectorAll('.px-chat-contact .px-chat-unread').length > 0,
      undefined,
      { timeout: 20_000 },
    )
    const marksBefore = await theRowMarks()
    expect(marksBefore.reduce((n, one) => n + one, 0)).toBeGreaterThan(0)
    expect(await theCircle()).toBe(marksBefore.reduce((n, one) => n + one, 0))

    // THE PERSON OPENS IT.
    await app.page.click('.px-chat-contact')
    await app.page.waitForSelector('.px-chat-words', { timeout: 20_000 })
    await app.page.click('.px-chat-back')
    await app.page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })

    await app.page.waitForFunction(
      () => document.querySelectorAll('.px-chat-contact .px-chat-unread').length === 0,
      undefined,
      { timeout: 20_000 },
    )
    expect(await theRowMarks(), 'a mark stayed after the person read the conversation').toEqual([])
    expect(await theCircle(), 'the circle kept a number the rows no longer have').toBe(0)

    // THE PERSON OPENS IT AGAIN. The fault: after a second press the unread 1 stayed.
    await app.page.click('.px-chat-contact')
    await app.page.waitForSelector('.px-chat-words', { timeout: 20_000 })

    // AND WRITES INTO IT. The fault: the 1 stayed after another message was sent.
    await app.page.fill('.px-chat-box', 'Understood.')
    await app.page.click('.px-chat-send')
    await app.page.waitForFunction(
      () => document.body.textContent?.includes('Understood.') === true,
      undefined,
      { timeout: 20_000 },
    )
    await app.page.click('.px-chat-back')
    await app.page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
    expect(await theRowMarks(), 'writing into the conversation left a mark behind').toEqual([])
    expect(await theCircle()).toBe(0)

    // AND AFTER A RELOAD, because a mark that only went away on the screen is not a mark that fell.
    await app.page.reload()
    await waitForThePage(app.page, 30_000)
    await app.page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
    // THE CONTACTS HAVE COME BACK, so a mark that returned on this load is drawn before it is read.
    await app.page.waitForSelector('.px-chat-contact', { timeout: 20_000 })
    expect(await theRowMarks(), 'the mark came back on the next load').toEqual([])
    expect(await theCircle()).toBe(0)

    // AND THE SERVER AGREES, so this is a stored fact and not a drawing.
    const held = await readTheContacts()
    expect(held.unread.messages).toBe(0)
    expect(held.unread.groups).toBe(0)
    expect(held.contacts.every((one) => one.unread === 0)).toBe(true)
  }, 240_000)

  it('leaves a new message unread until the person opens the conversation again', async () => {
    await say('One more, after the person had read everything.')
    await app.page.waitForFunction(
      () => document.querySelectorAll('.px-chat-contact .px-chat-unread').length > 0,
      undefined,
      { timeout: 20_000 },
    )
    expect(await theCircle()).toBe(1)
    await app.page.click('.px-chat-contact')
    await app.page.waitForSelector('.px-chat-words', { timeout: 20_000 })
    await app.page.waitForFunction(
      () => document.querySelector('.px-chat-circle .px-chat-unread, .shell-side .shell-chat .shell-chat-count') === null,
      undefined,
      { timeout: 20_000 },
    )
    expect(await theCircle()).toBe(0)
  }, 180_000)
})

/**
 * THIS ONE IS LAST BECAUSE IT LEAVES MESSAGES NOBODY READS.
 *
 * Every describe in this file shares one live app, and the two above count exact numbers. Opening a
 * group and writing into it here would move theirs.
 */
describe('every part of the circle can be found from one screen', () => {
  it('puts a number on each tab, and the three add up to the circle', async () => {
    // WHAT WENT WRONG. The circle read 24 while the contacts tab showed 3, and the other 21 were
    // behind the Groups tab, which carried no number of its own. The person was left with a total they could
    // not account for — the complaint of 4 September in a smaller form. Problem `LZXb_D1SxvNg`.
    // LEAVE THE CONVERSATION FIRST. The case before this one ends inside it, and a conversation on
    // the screen is one the panel says it has read — so a message written now would be marked read
    // the moment it arrived, and the contacts tab would sit at nothing through no fault of the
    // count.
    await openThePanel()

    const group = await fetch(`${app.api}/api/groups`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({
        name: 'The mount claim',
        because: 'Two claims cover the same files.',
        members: [
          { who: { kind: 'person', id: THE_PERSON }, because: 'The person settles it.' },
          { who: { kind: 'agent', id: 'builder-unread' }, because: 'It holds one claim.' },
        ],
      }),
    })
    expect(group.status, await group.clone().text()).toBe(201)
    const groupId = ((await group.json()) as { group: { id: string } }).group.id

    const inTheGroup = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_AGENT,
      body: JSON.stringify({
        kind: 'message',
        title: 'Something in the group',
        data: { body: 'Something said in the group.', toGroup: groupId },
      }),
    })
    expect(inTheGroup.status, await inTheGroup.clone().text()).toBe(201)
    await say('And something in the conversation.')

    // THE SERVER FIRST, so a failure here names whether the count or the drawing is wrong.
    const theGroups = await fetch(`${app.api}/api/groups`, { headers: AS_THE_OWNER })
    expect(theGroups.status, await theGroups.clone().text()).toBe(200)
    const listed = (await theGroups.json()) as { groups: { id: string; unread: number }[] }
    expect(listed.groups.length, 'the group the person was put in is not in their list of groups').toBeGreaterThan(0)
    expect(
      listed.groups.reduce((sum, one) => sum + one.unread, 0),
      'nothing in the group counts as unread for the person, so the tab has nothing to draw',
    ).toBeGreaterThan(0)

    await openThePanel()
    // WAIT FOR THE CIRCLE, which is what both lists feed. A tab can be drawn with no number simply
    // because its own list has not come back yet.
    await app.page.waitForFunction(
      () => Number(document.querySelector('.px-chat-circle .px-chat-unread, .shell-side .shell-chat .shell-chat-count')?.textContent ?? '0') > 0,
      undefined,
      { timeout: 20_000 },
    )
    const onTheTabs = await app.page.$$eval('.px-chat-tab', (all) =>
      all.map((one) => ({
        name: one.getAttribute('data-tab') ?? '',
        count: Number(one.querySelector('.px-chat-unread')?.textContent ?? '0'),
      })),
    )
    expect(onTheTabs.length, 'the panel does not draw three tabs').toBe(3)

    const circle = await theCircle()
    expect(circle, 'nothing is unread at all, so the sum below proves nothing').toBeGreaterThan(0)
    const saidOnTabs = onTheTabs.map((one) => `${one.name}=${String(one.count)}`).join(', ')
    // THE CONTACTS TAB AND THE GROUPS TAB ADD UP TO THE CIRCLE, and Between agents is in neither.
    // Criterion M32 changed what each of the three counts: Contacts counts messages, Groups counts
    // GROUPS holding anything unread, and the agents' own conversations are left out of the total
    // altogether: conversations between agents are not counted.
    const countedTabs = onTheTabs.filter((one) => one.name !== 'between')
    expect(
      countedTabs.reduce((sum, one) => sum + one.count, 0),
      `the tabs do not add up to the circle, so part of it can be found nowhere: circle ${String(circle)}, tabs ${saidOnTabs}`,
    ).toBe(circle)
    // AND BOTH OF THOSE TWO CARRY A NUMBER, so the sum above is really adding something up.
    expect(
      countedTabs.filter((one) => one.count > 0).length,
      `only one tab carries a number, so nothing is being added up: ${saidOnTabs}`,
    ).toBe(2)
  }, 120_000)
})
