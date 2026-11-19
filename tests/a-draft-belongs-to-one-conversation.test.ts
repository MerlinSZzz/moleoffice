// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DRAFT BELONGS TO ONE CONVERSATION, AND NOT TO THE PANEL.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The owner wrote that what was typed in the chat box with one agent was kept for another as well;
 * no conversation had a draft of its own. Criterion M98 of design/messages/ACCEPTANCE.md.
 *
 * The composer held ONE string for the whole panel — `const [typed, setTyped] = useState('')` in
 * src/web/components/Chat.tsx — so every conversation drew the same box. Typing a sentence meant
 * for one agent and then opening another showed that sentence in the second conversation's box,
 * with nothing saying where it came from, and the next press of Send would have sent it there.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CHECKED
 * ---------------------------------------------------------------------------------------
 *
 * The three things the criterion asks for, as a person does them: another contact shows an empty
 * box, coming back shows the first draft again, and a reload keeps both. The reload is the half
 * that says the words are in this browser's session storage rather than only in a React state.
 *
 * And the key itself is checked without a browser, because the key is what makes two conversations
 * two: a contact, a group and an unregistered writer must not collide.
 *
 * A RELOAD BRINGS BACK THE DRAFT AS IT WAS TYPED, in wave 13w
 * round 10. From wave 13w's round 7 to round 9 the stored copy left out a last word that no space
 * or line break followed, because it might be the first part of a key (decision dl3Eqw70zeSr,
 * problem Y09hP770ywVC). The owner called that leaving-out redundant: a person is asked once before
 * a send instead (src/web/components/AKeyQuestion.tsx). So the two cases below that put in a
 * sentence with no space at the end expect it whole after a reload.
 * MUTATION: the stored copy ends at the last space again, as in rounds 7 to 9
 * (src/web/lib/the-kept-chat-draft.ts). The two reload cases go red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  CHAT_DRAFTS_KEY,
  chatDraftKey,
  chatDraftsFromStored,
  unregisteredKey,
  withTheChatDraft,
} from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}

const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

/**
 * File one agent and give back its registry id. The office gives a new agent an id of its own,
 * which is not its handle, so the id is read from the registry after the agent is filed.
 */
async function anAgent(title: string, handle: string): Promise<string> {
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title, data: { handle, runtime: 'claude-code', state: 'active' } }),
  })
  expect(filed.status, await filed.text()).toBe(201)
  const roster = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  expect(roster.status, await roster.clone().text()).toBe(200)
  const registered = ((await roster.json()) as { agents: { id: string; handle: string }[] }).agents.find(
    (one) => one.handle === handle,
  )
  if (registered === undefined) throw new Error(`the registry holds no agent with the handle ${handle}`)
  return registered.id
}

async function say(handle: string, body: string): Promise<void> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: asAgent(handle),
    body: JSON.stringify({
      kind: 'message',
      title: body.slice(0, 30),
      data: { body, to: [{ kind: 'person', id: THE_PERSON }] },
    }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
}

async function openThePanel(): Promise<void> {
  await app.page.goto(app.site)
  await waitForThePage(app.page, 30_000)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
}

/** Open one contact's conversation by the name drawn on its row. */
async function openTheContact(name: string): Promise<void> {
  // BACK TO THE LIST FIRST where a conversation is already open, because the rows are not drawn
  // while one is.
  const back = await app.page.$('.px-chat-back')
  if (back !== null) await back.click()
  await app.page.waitForSelector('.px-chat-contact', { timeout: 20_000 })
  await app.page.click(`.px-chat-contact:has(.px-chat-name:text-is("${name}"))`)
  await app.page.waitForSelector('.px-chat-box', { timeout: 20_000 })
}

/** What is in the composer right now. */
async function whatIsInTheBox(): Promise<string> {
  return app.page.$eval('.px-chat-box', (one) => (one as HTMLTextAreaElement).value)
}

async function typeIntoTheBox(words: string): Promise<void> {
  await app.page.fill('.px-chat-box', words)
  // The box is controlled, so the value is in React state the moment fill returns; this waits for
  // the render that writes it back, which is what a person would see.
  await app.page.waitForFunction(
    (want) => document.querySelector<HTMLTextAreaElement>('.px-chat-box')?.value === want,
    words,
    { timeout: 10_000 },
  )
}

/** The registry id of Draft One, which its draft is kept under. */
let draftOneId = ''

beforeAll(async () => {
  app = await liveApp({ name: 'chat-drafts', viewport: { width: 1440, height: 1000 } })
  draftOneId = await anAgent('Draft One', 'draft-one')
  await anAgent('Draft Two', 'draft-two')
  await say('draft-one', 'The first agent said something.')
  await say('draft-two', 'The second agent said something.')
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe('the key that makes two conversations two', () => {
  it('spells a contact, a group and an unregistered writer apart', () => {
    const contact = chatDraftKey({ what: 'contact', who: { kind: 'agent', id: 'a1' } })
    const group = chatDraftKey({ what: 'group', id: 'a1' })
    const writer = chatDraftKey({ what: 'unregistered', key: unregisteredKey({ typed: 'a1', said: null }) })
    expect(new Set([contact, group, writer]).size, 'two of the three keys are the same string').toBe(3)
    // The person and the agent of one id are two contacts, which is what participantKey already says.
    expect(chatDraftKey({ what: 'contact', who: { kind: 'person', id: 'a1' } })).not.toBe(contact)
  })

  it('takes a row out when the box is emptied, and keeps the others', () => {
    const held = withTheChatDraft(withTheChatDraft({}, 'contact:agent:a', 'for A'), 'contact:agent:b', 'for B')
    expect(held).toEqual({ 'contact:agent:a': 'for A', 'contact:agent:b': 'for B' })
    expect(withTheChatDraft(held, 'contact:agent:a', '')).toEqual({ 'contact:agent:b': 'for B' })
  })

  it('refuses a stored set it cannot read rather than reading half of it', () => {
    expect(chatDraftsFromStored('{"contact:agent:a":"for A"}')).toEqual({ 'contact:agent:a': 'for A' })
    expect(chatDraftsFromStored('not json at all')).toBeNull()
    expect(chatDraftsFromStored('["for A"]')).toBeNull()
    expect(chatDraftsFromStored('{"contact:agent:a":7}')).toBeNull()
  })
})

describe('what is typed to one contact stays with that contact', () => {
  it('shows an empty box on another contact, and the first draft again on coming back', async () => {
    await openThePanel()
    await openTheContact('Draft One')
    await typeIntoTheBox('This is for the first agent.')

    await openTheContact('Draft Two')
    expect(await whatIsInTheBox(), 'the second conversation drew the first one’s draft').toBe('')
    await typeIntoTheBox('And this is for the second.')

    await openTheContact('Draft One')
    expect(await whatIsInTheBox()).toBe('This is for the first agent.')
    await openTheContact('Draft Two')
    expect(await whatIsInTheBox()).toBe('And this is for the second.')
  }, 180_000)

  it('keeps both drafts through a reload, which is what session storage is for', async () => {
    await openThePanel()
    await openTheContact('Draft One')
    await typeIntoTheBox('Kept through a reload.')

    // WHAT THE BROWSER ITSELF HOLDS, read before the reload so the test says WHERE the words are
    // and not only that they came back.
    const stored = await app.page.evaluate((key) => window.sessionStorage.getItem(key), CHAT_DRAFTS_KEY)
    expect(stored, 'nothing was written to this browser’s session storage').not.toBeNull()
    // THE LAST WORD, with no space after it, is kept too.
    expect(JSON.parse(stored ?? '{}')).toMatchObject({ [`contact:agent:${draftOneId}`]: 'Kept through a reload.' })

    await openThePanel()
    await openTheContact('Draft One')
    expect(await whatIsInTheBox(), 'the draft came back whole').toBe('Kept through a reload.')
    await openTheContact('Draft Two')
    expect(await whatIsInTheBox(), 'the draft came back whole').toBe('And this is for the second.')
  }, 180_000)

  it('forgets a draft once it has been sent, and leaves the other one alone', async () => {
    await openThePanel()
    await openTheContact('Draft One')
    await typeIntoTheBox('This one is going out.')
    // THE SEND BESIDE THE BOX, named through its own control: the bar that sends every unsent
    // review comment draws a press of the same class.
    await app.page.click('.px-chat-sender .px-chat-send')
    await app.page.waitForFunction(
      () => document.querySelector<HTMLTextAreaElement>('.px-chat-box')?.value === '',
      undefined,
      { timeout: 20_000 },
    )
    expect(await whatIsInTheBox()).toBe('')

    // Draft Two's box is what the reload above brought back, whole.
    await openTheContact('Draft Two')
    expect(await whatIsInTheBox(), 'sending to one contact cleared another contact’s draft').toBe('And this is for the second.')
  }, 180_000)

  it('brings a sentence that ends in a space back whole after a reload', async () => {
    await openThePanel()
    await openTheContact('Draft One')
    await typeIntoTheBox('Every word of this comes back. ')
    const stored = await app.page.evaluate((key) => window.sessionStorage.getItem(key), CHAT_DRAFTS_KEY)
    expect(JSON.parse(stored ?? '{}')).toMatchObject({ [`contact:agent:${draftOneId}`]: 'Every word of this comes back. ' })

    await openThePanel()
    await openTheContact('Draft One')
    expect(await whatIsInTheBox(), 'a word with a space after it was lost on the reload').toBe('Every word of this comes back. ')
  }, 180_000)
})
