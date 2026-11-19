// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NUMBER ON THE CIRCLE IS THE PERSON'S CONTACTS' UNREAD MESSAGES PLUS THE NUMBER OF UNREAD GROUPS.
 *
 * The number on the circle is the contacts' unread messages plus the number of unread groups, and a
 * conversation between agents that the owner takes no part in is not counted. Inside, the Contacts tab
 * carries a bubble with the message total, Groups the number of unread groups, and Between agents a
 * grey bubble with its unread count when anything there is unread. Criterion M32 of
 * design/messages/ACCEPTANCE.md section 9e; problem `mq_gbQf5iacV`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CHANGED, AND WHY COUNTING IS NOT ENOUGH TO CATCH IT
 * ---------------------------------------------------------------------------------------
 *
 * The circle used to be every unread message wherever it was: the person's contacts' messages plus every
 * unread message in every group the person is in. The rule counts a GROUP once however much is unread in
 * it. So a build that still added the group's messages up would agree with this test whenever a
 * group holds exactly one unread message, which is the ordinary case — and this file therefore puts
 * TWO unread messages in one group, so the two rules give different numbers and only the new one passes.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * The first case asserts each half is bigger than nothing before it asserts what they add to. A
 * server that counted nothing at all would otherwise pass "the circle is the sum" for free, and a
 * panel drawing no bubbles would pass every "this bubble is not drawn" assertion below.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CIRCLE_BEFORE_ANYBODY_CHOOSES } from '../src/shared/participants.ts'
import { CHAT_WORDS } from '../src/shared/messages.ts'

let app: LiveApp
let groupId = ''

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

interface Contacts {
  contacts: { unread: number }[]
  unread: { messages: number; groups: number }
}

async function readTheContacts(): Promise<Contacts> {
  const got = await fetch(`${app.api}/api/messages/contacts`, { headers: AS_THE_OWNER })
  expect(got.status, await got.clone().text()).toBe(200)
  return (await got.json()) as Contacts
}

async function readTheGroups(): Promise<{ groups: { id: string; unread: number }[]; yours: string[] }> {
  const got = await fetch(`${app.api}/api/groups`, { headers: AS_THE_OWNER })
  expect(got.status, await got.clone().text()).toBe(200)
  return (await got.json()) as { groups: { id: string; unread: number }[]; yours: string[] }
}

async function file(headers: Record<string, string>, body: unknown, expected = 201): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(made.status, await made.clone().text()).toBe(expected)
  return ((await made.json()) as { record: { id: string } }).record.id
}

async function openThePanel(): Promise<void> {
  // A GOTO THAT ONLY CHANGES THE FRAGMENT DOES NOT RELOAD THE PAGE, so the panel would keep the
  // reading it already had — including how the person wants the circle drawn, which one of these cases
  // changes through the door. The reload is what makes each case read the server again.
  await app.page.goto(`${app.site}/#/`)
  await app.page.reload()
  await waitForThePage(app.page, 30_000)
  if ((await app.page.$('.px-chat')) === null) await app.page.click('.px-chat-circle')
  await app.page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
}

/** Load Home with the chat shut, so the corner circle is the thing drawn and read. */
async function loadHomeWithTheChatShut(): Promise<void> {
  await app.page.goto(`${app.site}/#/`)
  await app.page.evaluate(() => localStorage.setItem('mole-office.chat.open', 'no'))
  await app.page.reload()
  await waitForThePage(app.page, 30_000)
  await app.page.waitForSelector('.px-chat-circle', { timeout: 20_000 })
}

/** Every number the panel draws on a tab, by tab, with the ink the bubble was given. */
async function theTabs(): Promise<{ name: string; count: number; counts: string | null }[]> {
  return app.page.$$eval('.px-chat-tab', (all) =>
    all.map((one) => {
      const bubble = one.querySelector('.px-chat-unread')
      return {
        name: one.getAttribute('data-tab') ?? '',
        count: bubble === null ? 0 : Number(bubble.textContent),
        counts: bubble === null ? null : bubble.getAttribute('data-counts'),
      }
    }),
  )
}

/** Every bubble on the circle, in the order they are drawn, with what each counts. */
async function theCircle(): Promise<{ said: string; counts: string | null }[]> {
  return app.page.$$eval('.px-chat-circle .px-chat-unread', (all) =>
    all.map((one) => ({ said: one.textContent ?? '', counts: one.getAttribute('data-counts') })),
  )
}

beforeAll(async () => {
  app = await liveApp({ name: 'circle-counts', viewport: { width: 1440, height: 1000 } })

  // TWO AGENTS. One writes to the person; the two write to each other, so the Between agents tab has a
  // conversation in it that the person is not part of.
  await file(AS_THE_OWNER, {
    kind: 'agent',
    title: 'Builder Circle',
    data: { handle: 'builder-circle', runtime: 'claude-code', state: 'active' },
  })
  await file(AS_THE_OWNER, {
    kind: 'agent',
    title: 'Reader Circle',
    data: { handle: 'reader-circle', runtime: 'claude-code', state: 'active' },
  })

  // ONE UNREAD MESSAGE IN THE CONVERSATION WITH THE PERSON.
  await file(asAgent('builder-circle'), {
    kind: 'message',
    title: 'to the person',
    data: { body: 'The clamp holds at 11.8 N.', to: [{ kind: 'person', id: THE_PERSON }] },
  })

  // AND A GROUP THE PERSON IS IN, WITH TWO UNREAD MESSAGES IN IT. Two, so that the number of unread groups
  // (one) and the number of unread messages in groups (two) are different numbers.
  const group = await fetch(`${app.api}/api/groups`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      name: 'The wrist camera',
      because: 'so that a group holds more than one unread message',
      members: [
        { who: { kind: 'person', id: THE_PERSON }, because: 'the person opened it' },
        { who: { kind: 'agent', id: 'builder-circle' }, because: 'it is doing the work' },
      ],
    }),
  })
  expect(group.status, await group.clone().text()).toBe(201)
  groupId = ((await group.json()) as { group: { id: string } }).group.id
  await file(asAgent('builder-circle'), {
    kind: 'message',
    title: 'in the group',
    data: { body: 'The first thing said in the group.', toGroup: groupId },
  })
  await file(asAgent('builder-circle'), {
    kind: 'message',
    title: 'in the group again',
    data: { body: 'The second thing said in the group.', toGroup: groupId },
  })

  // AND ONE CONVERSATION BETWEEN THE TWO AGENTS, which is the rule's exception: the person is not in it.
  // NOTHING ANSWERS AS READER CIRCLE IN THIS TEST OFFICE, so the office stores the message and routes it,
  // and answers 409 rather than 201; the message is stored all the same, and the cases below count it.
  await file(asAgent('builder-circle'), {
    kind: 'message',
    title: 'agent to agent',
    data: { body: 'I have the camera mount.', to: [{ kind: 'agent', id: 'reader-circle' }] },
  }, 409)
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('the circle counts messages from contacts and groups, not messages in groups', () => {
  it('adds the contacts unread messages to the NUMBER of unread groups', async () => {
    const held = await readTheContacts()
    const rows = held.contacts.reduce((sum, one) => sum + one.unread, 0)
    const groups = await readTheGroups()
    const their = groups.groups.filter((one) => groups.yours.includes(one.id))
    const inGroups = their.reduce((sum, one) => sum + one.unread, 0)

    // THE CONTROL: both halves have something in them, so the arithmetic below is really adding up.
    expect(held.unread.messages, 'no message from a contact is unread, so the sum proves nothing').toBeGreaterThan(0)
    expect(held.unread.groups, 'no group holds anything unread, so the sum proves nothing').toBeGreaterThan(0)

    expect(held.unread.messages, 'the messages half is not the sum of the contact rows').toBe(rows)
    expect(held.unread.groups, 'the groups half is not the NUMBER of groups holding something unread').toBe(
      their.filter((one) => one.unread > 0).length,
    )
    // AND THE TWO RULES REALLY DO GIVE DIFFERENT ANSWERS HERE, so a build that added the group's
    // messages up cannot pass by accident.
    expect(inGroups, 'the group holds only one unread message, so the old rule and the person’s count agree').toBeGreaterThan(
      held.unread.groups,
    )
  }, 120_000)

  it('leaves a conversation between two agents out of the circle', async () => {
    const between = await fetch(`${app.api}/api/messages/between-agents`, { headers: AS_THE_OWNER })
    expect(between.status, await between.clone().text()).toBe(200)
    const listed = (await between.json()) as { conversations: { newSince: number }[]; mayRead: boolean }
    // THE CONTROL: there is such a conversation and the person may read it, so "it is not counted" is a
    // fact about something that exists.
    expect(listed.mayRead, 'the person may not read the agents conversations, so nothing below is measured').toBe(true)
    expect(listed.conversations.length, 'no conversation between two agents exists to be left out').toBeGreaterThan(0)
    expect(
      listed.conversations.reduce((sum, one) => sum + one.newSince, 0),
      'nothing in it is new to the person, so leaving it out of the circle proves nothing',
    ).toBeGreaterThan(0)

    const held = await readTheContacts()
    const groups = await readTheGroups()
    const their = groups.groups.filter((one) => groups.yours.includes(one.id))
    // The circle is the two halves and nothing else. A build that put the agents' conversations in
    // would have a third number in it.
    expect(held.unread.messages + held.unread.groups).toBe(
      held.contacts.reduce((sum, one) => sum + one.unread, 0) + their.filter((one) => one.unread > 0).length,
    )
  }, 120_000)
})

describe('each tab carries its own kind of number', () => {
  it('draws messages on Contacts, groups on Groups and no number on Between agents', async () => {
    await openThePanel()
    await app.page.waitForFunction(
      () => document.querySelectorAll('.px-chat-tab .px-chat-unread').length === 2,
      undefined,
      { timeout: 20_000 },
    )
    const tabs = await theTabs()
    const held = await readTheContacts()
    const contacts = tabs.find((one) => one.name === 'contacts')
    const groups = tabs.find((one) => one.name === 'groups')
    const between = tabs.find((one) => one.name === 'between')
    if (contacts === undefined || groups === undefined || between === undefined) {
      throw new Error('the panel does not draw the three tabs')
    }
    expect(contacts.count, 'the Contacts tab does not carry the unread message total').toBe(held.unread.messages)
    expect(groups.count, 'the Groups tab does not carry the NUMBER of unread groups').toBe(held.unread.groups)
    // AND BETWEEN AGENTS DRAWS NO NUMBER, though a conversation there has something new (the case above
    // proves it has): what agents say to each other is not pushed to the owner as new.
    expect(between.count, 'the Between agents tab draws a number').toBe(0)
    expect(between.counts, 'the Between agents tab draws a bubble').toBeNull()
    expect(
      await app.page.$eval('.px-chat-tab[data-tab="between"]', (tab) => tab.getAttribute('aria-label')),
      'the Between agents tab says a count to a screen reader',
    ).toBeNull()
    expect(contacts.counts, 'the Contacts bubble is drawn as the grey one').not.toBe('new')
  }, 120_000)
})

describe('the circle draws one number by default and two bubbles when the person says so', () => {
  it('starts merged, because nobody has chosen', async () => {
    const held = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { headers: AS_THE_OWNER })
    expect(held.status, await held.clone().text()).toBe(200)
    const person = ((await held.json()) as { participant: { circleShows: string | null } }).participant
    expect(person.circleShows, 'somebody has already chosen, so the default is not what is measured').toBeNull()
    expect(CIRCLE_BEFORE_ANYBODY_CHOOSES).toBe('merged')

    await loadHomeWithTheChatShut()
    const bubbles = await theCircle()
    expect(bubbles, 'the circle does not draw exactly one number').toHaveLength(1)
    const said = bubbles[0]
    if (said === undefined) throw new Error('one bubble expected')
    const waiting = await readTheContacts()
    expect(Number(said.said), 'the merged number is not the two halves added together').toBe(
      waiting.unread.messages + waiting.unread.groups,
    )
  }, 120_000)

  it('draws two bubbles after the person chooses two, and stores the choice for the person', async () => {
    const set = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
      method: 'PATCH',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ circle: 'two' }),
    })
    expect(set.status, await set.clone().text()).toBe(200)
    // IT IS STORED, not held on a screen: it is read back from the door on a fresh request.
    const held = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { headers: AS_THE_OWNER })
    expect(((await held.json()) as { participant: { circleShows: string | null } }).participant.circleShows).toBe('two')

    await loadHomeWithTheChatShut()
    await app.page.waitForFunction(
      () => document.querySelectorAll('.px-chat-circle .px-chat-unread').length === 2,
      undefined,
      { timeout: 20_000 },
    )
    const bubbles = await theCircle()
    expect(bubbles.map((one) => one.counts), 'the two bubbles do not say what each counts').toEqual([
      'messages',
      'groups',
    ])
    const waiting = await readTheContacts()
    expect(bubbles.map((one) => Number(one.said))).toEqual([waiting.unread.messages, waiting.unread.groups])

    // AND THE TWO INKS DIFFER, which is what M32 asks for. They are read off the page rather than
    // off the stylesheet, so a rule that never reached the element fails here.
    const inks = await app.page.$$eval('.px-chat-circle .px-chat-unread', (all) =>
      all.map((one) => {
        const seen = window.getComputedStyle(one)
        return `${seen.backgroundColor}|${seen.color}`
      }),
    )
    expect(inks[0], 'the two bubbles are drawn in the same ink').not.toBe(inks[1])

    // AND SOMEBODY LISTENING HEARS BOTH NUMBERS, criterion M32 and problem eeKpZbIXd9Gt.
    //
    // A BUTTON'S OWN LABEL REPLACES EVERYTHING INSIDE IT, so the bubbles' own words never reach a
    // screen reader and the button's label is the whole of what is announced. It said "Messages, 3
    // unread" — the merged total — while the circle drew 2 and 1, so for a reader who is listening
    // the setting did nothing and colour was all that separated the two.
    const spoken = await app.page.getAttribute('.px-chat-circle', 'aria-label')
    expect(spoken, 'the circle says nothing to somebody listening').not.toBeNull()
    expect(spoken, 'the circle still announces one merged number under two bubbles').toBe(
      CHAT_WORDS.unreadNameInTwo(waiting.unread.messages, waiting.unread.groups),
    )
    expect(spoken, 'the spoken name does not say what the first number counts').toContain(
      CHAT_WORDS.unreadMessagesBubble(waiting.unread.messages),
    )
    expect(spoken, 'the spoken name does not say what the second number counts').toContain(
      CHAT_WORDS.unreadGroupsBubble(waiting.unread.groups),
    )
    expect(spoken, 'the spoken name is the merged total the setting was meant to replace').not.toBe(
      CHAT_WORDS.unreadName(waiting.unread.messages + waiting.unread.groups),
    )
  }, 120_000)

  it('refuses a word that is not one of the two, and refuses to set it on an agent', async () => {
    const wrong = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
      method: 'PATCH',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ circle: 'three' }),
    })
    expect(wrong.status).toBe(400)
    expect(await wrong.text()).toContain('merged, two')

    const onAnAgent = await fetch(`${app.api}/api/participants/agent/builder-circle`, {
      method: 'PATCH',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ circle: 'two' }),
    })
    expect(onAnAgent.status).toBe(403)
    expect(await onAnAgent.text()).toContain('Only a person has a chat circle')
  }, 120_000)
})
