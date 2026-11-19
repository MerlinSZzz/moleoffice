// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * START A NEW AGENT IS ONE PRESS AND ONE DIALOGUE, DRAWN IN TWO PLACES.
 *
 * Criterion M78. The press to start a new agent has to work in several places: in the chat, on the
 * contact row and in the right-click menu.
 *
 * A CONTACT ROW IS NO LONGER ONE OF THEM. Criterion M100: a contact row says only whether the agent is
 * online, and the press to start a new run is shown once its conversation is opened. This file was called
 * start-a-new-agent-is-one-press-in-three-places.test.ts until 11 September 2026, and the case that
 * read the row now reads it for the ABSENCE of the press. M78's own wording still says three
 * places, and nothing here changed a criterion.
 *
 * WHAT IS PROVED HERE, in a real browser against a real server.
 *
 * 1. The Cannot reach line and its press are drawn in the conversation with an agent nothing is
 *    answering as, and NOT in a conversation with one that is.
 * 2. That agent's contact row carries no such press, and pressing the row opens the conversation
 *    where the press is.
 * 3. The same press is in the right-click menu, which in this product is the composer that opens on
 *    a right-click anywhere.
 * 4. Both open ONE dialogue: the same words, the same two presses. That is measured by opening each
 *    of them in turn and reading the dialogue's own text, not by trusting that they share a
 *    component.
 * 5. Pressing it in the dialogue writes the press, and the message that was waiting says so.
 * 6. Criterion M88 (problem T-BOMReZU_Lg): after that press the dialogue closes by itself, no second
 *    window shows the server's words, and the conversation open is the new agent's.
 * 7. Problem hqbovBMnTu-z: after the page is loaded again, the old conversation draws the same
 *    carried line on the waiting message that the open page drew. The case opens the old agent's
 *    contact row by its key, because the new agent's name can hold the old name. It still says the
 *    agent cannot be reached, and no longer offers the press, because nothing waits for one. The line
 *    on the waiting message says no copy was made when it was sent, which stays true after the press.
 *    And the row says in visible words, in English and in Chinese, that the press carried the message
 *    to the newer agent of that name, in the line's own words and with no mark beside it, and offers a
 *    press that opens its conversation.
 * 8. The new agent keeps the old five-word name, and the newer of the two carries a small mark, new or
 *    新, in its contact row and its conversation head, and the older one carries none. Its conversation's
 *    first line says it branched from another conversation, in English and in Chinese.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, RUN AT THE MERGE COMMIT 300ea432 ON 8 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A CONTROL RUN FIRST: 4 cases, all green. Then, in src/web/components/StartANewAgent.tsx, the
 * data-where attribute was written as a constant rather than from the property, so every place
 * claimed to be the conversation.
 *
 * THE CASES THAT WENT RED, and they are the ones this criterion is about:
 *
 *   × is on the contact row, and opens the same dialogue with the same words
 *   × is in the right-click menu, and opens the same dialogue again
 *
 * The change was put back and the control run again: 4 cases, all green. So the test holds the
 * behaviour rather than passing beside it. The first of those two cases is now the M100 case, whose
 * own mutation is recorded in tests/the-contact-list-says-online-or-offline.test.ts.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CANNOT_REACH_WORDS, theNewConversationCameFrom } from '../src/shared/messages.ts'
import { TEST_SHOTS, testShots } from './where-shots-go.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp
/** Where the pictures of the carried line after a reload go. */
const SHOTS = testShots('carried-after-a-reload')

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function write(body: unknown): Promise<Response> {
  return fetch(`${app.api}/api/records`, { method: 'POST', headers: AS_THE_OWNER, body: JSON.stringify(body) })
}

/** Every agent in the registry, so a test can address one by its id rather than by its handle. */
async function theAgents(): Promise<{ id: string; handle: string; name: string }[]> {
  const res = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  return ((await res.json()) as { agents: { id: string; handle: string; name: string }[] }).agents
}

async function say(toId: string, body: string): Promise<string> {
  const res = await write({ kind: 'message', title: body.slice(0, 30), data: { body, to: [{ kind: 'agent', id: toId }] } })
  const held = (await res.json()) as { record?: { id: string } }
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(res.status, JSON.stringify(held)).toBe(409)
  return held.record?.id ?? ''
}

async function whatTheRowSays(messageId: string): Promise<string> {
  const res = await fetch(`${app.api}/api/messages/${messageId}`, { headers: AS_THE_OWNER })
  const held = (await res.json()) as { message?: { deliveries?: { because: string | null }[] } }
  return String(held.message?.deliveries?.[0]?.because ?? '')
}

/**
 * WHY THE QUEUE IS HOLDING ONE MESSAGE, or the empty string because it is not.
 *
 * The delivery row's sentence is written by the message worker, and this file drives a browser
 * rather than a worker. This is the same fact one step earlier: the server's own answer about
 * whether a run may start, which is what the worker then writes down.
 */
async function whyTheQueueHoldsIt(messageId: string): Promise<string> {
  const res = await fetch(`${app.api}/api/worker/queue`, { headers: AS_THE_OWNER })
  const held = (await res.json()) as { queue?: { messageId: string; nobodyIsAnsweringAsIt: string | null }[] }
  const row = (held.queue ?? []).find((one) => one.messageId === messageId)
  return String(row?.nobodyIsAnsweringAsIt ?? '')
}

/**
 * Open the chat panel and the conversation with one contact. Every case here opens the agent that
 * could not be reached, so the row is chosen by its key, which says which agent it is, as well as by
 * its words: after the press two agents bear this name, and a match on words alone took whichever row
 * came first (problem hqbovBMnTu-z, message p_04qFPdNmoQ).
 */
async function openTheConversationWith(name: string): Promise<void> {
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 30_000 })
  // THE PANEL DRAWS THE CONTACTS OR ONE CONVERSATION, NEVER BOTH, so a conversation left open by an
  // earlier case is closed before the row is looked for.
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  await app.page.waitForSelector('.px-chat-contact', { timeout: 30_000 })
  const rows = await app.page.$$('.px-chat-contact')
  for (const row of rows) {
    const said = await row.evaluate((el) => el.textContent ?? '')
    if (said.includes(name) && (await row.getAttribute('data-contact')) === `agent:${unreachable}`) {
      await row.click()
      await app.page.waitForSelector('.px-chat-write textarea', { timeout: 30_000 })
      return
    }
  }
  throw new Error(`no contact row named ${name}`)
}

/** What the one dialogue says, read off the screen. */
async function whatTheDialogueSays(): Promise<{ who: string; presses: string[] }> {
  await app.page.waitForSelector('.px-start-agent-ask', { timeout: 30_000 })
  return {
    who: await app.page.$eval('.px-start-agent-who', (el) => el.textContent ?? ''),
    presses: await app.page.$$eval('.px-start-agent-presses button', (all) =>
      all.map((el) => el.textContent ?? ''),
    ),
  }
}

async function closeTheDialogue(): Promise<void> {
  await app.page.click('.px-start-agent-no')
  await app.page.waitForFunction(() => document.querySelector('.px-start-agent-ask') === null, { timeout: 30_000 })
}

let unreachable = ''
let waiting = ''

beforeAll(async () => {
  app = await liveApp({ name: 'start-a-new-agent', viewport: { width: 1440, height: 1000 } })
  const made = await write({
    kind: 'agent',
    title: 'Codex on the other machine',
    data: { handle: 'codex-elsewhere', runtime: 'claude-code', state: 'active' },
  })
  expect(made.status, await made.text()).toBe(201)
  unreachable = (await theAgents()).find((one) => one.handle === 'codex-elsewhere')?.id ?? ''
  expect(unreachable).not.toBe('')
  waiting = await say(unreachable, 'Can you read the loquat logs for me?')
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the press is drawn in two places and both open one dialogue', () => {
  it('is in the conversation, under a line saying the agent cannot be reached', async () => {
    await app.page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await openTheConversationWith('Codex on the other machine')

    await app.page.waitForSelector('.px-chat-cannot-reach', { timeout: 30_000 })
    const line = await app.page.$eval('.px-chat-cannot-reach', (el) => el.textContent ?? '')
    expect(line).toContain(CANNOT_REACH_WORDS.cannotReach('Codex on the other machine'))
    expect(await app.page.$('.px-start-agent[data-where="the conversation"]')).not.toBeNull()

    await app.page.click('.px-start-agent[data-where="the conversation"]')
    const said = await whatTheDialogueSays()
    expect(said.who).toBe(CANNOT_REACH_WORDS.cannotReach('Codex on the other machine'))
    expect(said.presses).toEqual([CANNOT_REACH_WORDS.startANewAgent, CANNOT_REACH_WORDS.notNow])
    await closeTheDialogue()
  }, 120_000)

  it('is NOT on the contact row, and the row opens the conversation where it is', async () => {
    // BACK TO THE LIST, because the case above left a conversation open over it.
    await app.page.click('.px-chat-back')
    await app.page.waitForSelector('.px-chat-contact', { timeout: 30_000 })

    // Criterion M100. The row carries the presence mark and nothing about starting a run.
    const press = await app.page.$(`.px-start-agent[data-agent="${unreachable}"]`)
    expect(press, 'the contact list still offers to start a run').toBeNull()

    // AND PRESSING THE ROW OPENS THE CONVERSATION, which is where the offer is.
    expect(await app.page.$('.px-chat-write textarea')).toBeNull()
    await openTheConversationWith('Codex on the other machine')
    expect(await app.page.$('.px-chat-write textarea')).not.toBeNull()
    // The panel reads who is answering after the conversation opens, so the offer arrives with that
    // read rather than with the first paint.
    await app.page.waitForSelector('.px-start-agent[data-where="the conversation"]', { timeout: 30_000 })
  }, 120_000)

  it('is in the right-click menu, and opens the same dialogue again', async () => {
    // THE RIGHT-CLICK MENU IN THIS PRODUCT IS THE COMPOSER that opens on a right-click anywhere.
    await app.page.click('body', { button: 'right' })
    // BEHIND MORE, AS ONE LINE WITH A COUNT, AND THE LIST OPENS ON A PRESS. Criterion change on 27
    // September 2026, by a decision. The press in the list is the same press as before.
    await app.page.click('.px-talk-more-btn')
    await app.page.click('.px-talk-more-line')
    await app.page.waitForSelector('.px-start-agent[data-where="the right-click menu"]', { timeout: 30_000 })

    await app.page.click(`.px-start-agent[data-where="the right-click menu"][data-agent="${unreachable}"]`)
    const said = await whatTheDialogueSays()
    expect(said.who).toBe(CANNOT_REACH_WORDS.cannotReach('Codex on the other machine'))
    expect(said.presses).toEqual([CANNOT_REACH_WORDS.startANewAgent, CANNOT_REACH_WORDS.notNow])

    // AND THE SCREEN IS PUT BACK. The dialogue swallows presses, which is what makes it a dialogue,
    // so the case after this one could not reach anything underneath it.
    await closeTheDialogue()
    await app.page.keyboard.press('Escape')
    await app.page.waitForFunction(() => document.querySelector('.px-talk') === null, { timeout: 30_000 })
  }, 120_000)

  it('makes a new agent when the person presses it, and leaves the old conversation whole', async () => {
    // THE CONTROL: before the press, the queue is holding it because nothing is answering.
    expect(await whyTheQueueHoldsIt(waiting)).toContain('Nothing is answering as "codex-elsewhere"')

    // THE DIALOGUE IS OPENED HERE rather than left over from the case above, so this case says on
    // its own what it did. Any of the three places would do; the conversation is the one criterion M78
    // names first.
    await openTheConversationWith('Codex on the other machine')
    await app.page.click('.px-start-agent[data-where="the conversation"]')
    await app.page.waitForSelector('.px-start-agent-ask', { timeout: 30_000 })

    await app.page.click('.px-start-agent-yes')
    // M88: ONE CONFIRMATION, THEN THE CONVERSATION FOLLOWS. The dialogue closes by itself, and no
    // second window shows the server's words.
    await app.page.waitForFunction(
      () => document.querySelector('.px-start-agent-ask') === null || document.querySelector('.px-start-agent-fault') !== null,
      { timeout: 30_000 },
    )
    const fault = await app.page.$('.px-start-agent-fault')
    if (fault !== null) throw new Error(`the press failed: ${await fault.evaluate((el) => el.textContent ?? '')}`)
    expect(await app.page.$('.px-start-agent-said'), 'a second window shows the server\'s words').toBeNull()
    // THE PRESS MADE A NEW AGENT, not a run of the one that could not be reached (criterion M80). The
    // whole of what it does is in tests/a-new-agent-branches-the-conversation.test.ts; here the point
    // is that the press in the chat is the act that does it, and that the chat follows to it.
    const made = (await theAgents()).find((one) => one.handle === 'codex-elsewhere-2')
    expect(made, 'the press made no agent called codex-elsewhere-2').toBeDefined()
    await app.page.waitForFunction(
      (id) => window.localStorage.getItem('mole-office.chat.with')?.endsWith(`:${id}`) === true,
      made!.id,
      { timeout: 30_000 },
    )
    await app.page.waitForFunction(
      (name) => document.querySelector('.px-chat-them')?.textContent?.includes(name) === true,
      made!.name,
      { timeout: 30_000 },
    )
    // AND THE NEW CONVERSATION SAYS WHERE IT CAME FROM, in its own first line.
    const cameFrom = theNewConversationCameFrom('codex-elsewhere', 'Codex on the other machine')
    await app.page.waitForFunction(
      (sentence) => [...document.querySelectorAll('.px-chat-said .px-chat-system-block')].some((one) => one.getAttribute('title') === sentence),
      cameFrom,
      { timeout: 30_000 },
    )

    // M78, round 14: the old message stays in the conversation and no longer waits for a press.
    expect(await whyTheQueueHoldsIt(waiting)).toBe('')
    const because = await whatTheRowSays(waiting)
    expect(because).toContain('carried this message to "codex-elsewhere-2"')
    expect(because).toContain('"codex-elsewhere" did not read it.')
    expect(because).not.toContain('has read this message')
    await openTheConversationWith('Codex on the other machine')
    const mark = app.page.getByTitle(because, { exact: true })
    await mark.waitFor()
    expect(await mark.isVisible()).toBe(true)

    const shots = process.env['NEW_AGENT_SHOTS']
    if (shots !== undefined) {
      mkdirSync(shots, { recursive: true })
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await mark.scrollIntoViewIfNeeded()
          await app.page.screenshot({ path: join(shots, `carried-chat-${width}-${theme}.png`) })
        }
      }
    }
  }, 120_000)

  it('draws the same carried line on the waiting message after the page is loaded again', async () => {
    // PROBLEM hqbovBMnTu-z. A fresh read of the old conversation has to draw the row the live events
    // drew. The page is loaded again, so everything drawn below comes from a fresh read.
    const because = await whatTheRowSays(waiting)
    expect(because).toContain('carried this message to "codex-elsewhere-2"')
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await app.page.emulateMedia({ colorScheme: 'light' })
    await app.page.reload({ timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await openTheOldConversation()
    const mark = theWaitingMessagesMark(because)
    await mark.waitFor({ timeout: 30_000 })
    expect(await mark.isVisible()).toBe(true)
    // AND NO PRESS IS OFFERED HERE ANY MORE, because nothing waits for one. The agent still cannot be
    // reached, and the line says so.
    // The page asks whether the press would carry anything once the line is drawn, so the press may be
    // drawn for a moment before the answer takes it away.
    await app.page.waitForSelector('.px-chat-cannot-reach', { timeout: 30_000 })
    await app.page.waitForFunction(() => document.querySelector('.px-chat-cannot-reach .px-start-agent') === null, undefined, { timeout: 30_000 })
    expect(await app.page.$('.px-chat-cannot-reach'), 'the Cannot reach line is gone too').not.toBeNull()
    // AND THE LINE ON THE WAITING MESSAGE SAYS WHEN NO COPY WAS MADE. It was written when the message was
    // sent, and the press has made a copy since, so it says the time it is about. The long line is behind
    // the short mark now: Developer detail opens it, and the page is loaded again so this is a fresh read.
    await app.page.goto(`${app.site}/?mode=inspect#/`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await openTheOldConversation()
    const markToOpen = app.page
      .locator(`.px-chat .px-chat-one[data-target^="record/${waiting}/"] button.px-chat-not-delivered-mark`)
      .first()
    await markToOpen.waitFor({ state: 'visible', timeout: 30_000 })
    await markToOpen.click()
    const routed = await app.page
      .locator(`.px-chat .px-chat-one[data-target^="record/${waiting}/"] .px-chat-routed-line`)
      .first()
      .textContent()
    expect(routed ?? '').toContain('so no copy was made when it was sent.')

    // AND THE CARRIED FACT IS DRAWN IN WORDS ON THE ROW, not only in the mark's hover text (problem
    // hqbovBMnTu-z, the review of round 34b). The new agent keeps the old name, so the words say it is
    // the newer agent of that name (the review of round 35, point 7), and a press opens its conversation.
    const made = (await theAgents()).find((one) => one.handle === 'codex-elsewhere-2')
    expect(made, 'the press made no agent called codex-elsewhere-2').toBeDefined()
    for (const [lang, said] of [
      ['en', 'The press to start a new agent carried this message to the newer agent named Codex on the other machine'],
      ['zh', '启动一个新智能体时，这条消息被转给了较新的同名智能体 Codex on the other machine'],
    ] as const) {
      await app.page.goto(`${app.site}/?lang=${lang}#/records`, { timeout: 60_000 })
      await waitForThePage(app.page, 60_000)
      await openTheOldConversation()
      const carried = theCarriedLine()
      await carried.waitFor({ state: 'visible', timeout: 30_000 })
      expect(await carried.innerText(), `the carried line in ${lang}`).toContain(said)
      expect(await carried.locator('.px-chat-newer').count(), 'a mark repeats what the words say').toBe(0)
      // THE WORDS THEMSELVES TAKE ROOM ON THE SCREEN. A line hidden for screen readers only is one pixel
      // wide and still has text, which is how the carried sentence hid before this case read it here.
      const words = await carried.locator('.px-chat-carried-words').boundingBox()
      expect(words !== null && words.height >= 8 && words.width >= 60, `the carried words take no room on the screen: ${JSON.stringify(words)}`).toBe(true)
      // THE PICTURES, only when TEST_SHOTS names a folder to keep them in, taken the way this case reads the row.
      if (process.env[TEST_SHOTS] !== undefined && process.env[TEST_SHOTS] !== '') {
        for (const width of [1440, 990, 660, 390]) {
          for (const theme of ['light', 'dark'] as const) {
            await app.page.setViewportSize({ width, height: 1000 })
            await app.page.emulateMedia({ colorScheme: theme })
            await theCarriedLine().scrollIntoViewIfNeeded()
            await app.page.screenshot({ path: join(SHOTS, `carried-after-a-reload-${lang}-${width}-${theme}.png`) })
          }
        }
        await app.page.setViewportSize({ width: 1440, height: 1000 })
        await app.page.emulateMedia({ colorScheme: 'light' })
      }
    }
    await theCarriedLine().locator('.px-chat-carried-open').click()
    await app.page.waitForFunction(
      (id) => window.localStorage.getItem('mole-office.chat.with')?.endsWith(`:${id}`) === true,
      made!.id,
      { timeout: 30_000 },
    )
  }, 180_000)

  it('marks the newer of the two agents that share a name, in its contact row and its conversation head', async () => {
    // DECISION p_04qFPdNmoQ, problem hqbovBMnTu-z. The new agent keeps the old five-word name,
    // so the difference is drawn beside the name: a small mark on the newer one, in both languages.
    const made = (await theAgents()).find((one) => one.handle === 'codex-elsewhere-2')
    expect(made, 'the press made no agent called codex-elsewhere-2').toBeDefined()
    expect(made!.name, 'the new agent does not share the old name').toBe('Codex on the other machine')
    const newRow = `.px-chat-contact[data-contact="agent:${made!.id}"]`
    const oldRow = `.px-chat-contact[data-contact="agent:${unreachable}"]`
    for (const [lang, word] of [['en', 'new'], ['zh', '新']] as const) {
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.emulateMedia({ colorScheme: 'light' })
      await app.page.goto(`${app.site}/?lang=${lang}#/records`, { timeout: 60_000 })
      await waitForThePage(app.page, 60_000)
      await openTheChat(app.page)
      await app.page.waitForSelector('.px-chat', { timeout: 30_000 })
      if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
      await app.page.waitForSelector(`${newRow} .px-chat-newer`, { timeout: 30_000 })
      expect((await app.page.$eval(`${newRow} .px-chat-newer`, (el) => el.textContent ?? '')).trim()).toBe(word)
      expect(await app.page.$(`${oldRow} .px-chat-newer`), 'the older agent carries the mark too').toBeNull()
      await shoot(`two-same-named-contacts-${lang}`, newRow)
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.click(newRow)
      await app.page.waitForSelector('.px-chat-them .px-chat-newer', { timeout: 30_000 })
      expect((await app.page.$eval('.px-chat-them .px-chat-newer', (el) => el.textContent ?? '')).trim()).toBe(word)
      await shoot(`the-newer-ones-conversation-${lang}`, '.px-chat-them')
      // ITS FIRST LINE SAYS IT BRANCHED, in the page's language, with the sentence naming the old agent (the
      // review of wave 13n round 35, point 5). The words are read back from the English the server stored. The few
      // words are read only in Chinese: in English the chat's linker takes "conversation", twelve letters, for a
      // record id and draws "Open the record" in its place, which is reported for a later round and not held here.
      const sentence =
        lang === 'en'
          ? 'This conversation was opened because Codex on the other machine ("codex-elsewhere")'
          : '打开这个对话，是因为联系不上 Codex on the other machine（“codex-elsewhere”）'
      const first = `.px-chat-said .px-chat-system-block[title^='${sentence}']`
      await app.page.waitForSelector(first, { timeout: 30_000 })
      if (lang === 'zh') expect(await app.page.locator(first).innerText(), 'the branched line in Chinese').toBe('从另一个对话分出')
      await shoot(`the-branched-conversation-${lang}`, first)
      await app.page.click('.px-chat-back')
      await app.page.waitForSelector(oldRow, { timeout: 30_000 })
      await app.page.click(oldRow)
      await app.page.waitForSelector('.px-chat-them', { timeout: 30_000 })
      await app.page.waitForFunction(() => document.querySelector('.px-chat-cannot-reach') !== null, undefined, { timeout: 30_000 })
      expect(await app.page.$('.px-chat-them .px-chat-newer'), 'the older agent\'s conversation carries the mark').toBeNull()
    }
  }, 180_000)
})

/** Pictures of what is on screen at four widths in both themes, only when TEST_SHOTS names a folder. */
async function shoot(name: string, inView: string): Promise<void> {
  if (process.env[TEST_SHOTS] === undefined || process.env[TEST_SHOTS] === '') return
  for (const width of [1440, 990, 660, 390]) {
    for (const theme of ['light', 'dark'] as const) {
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.emulateMedia({ colorScheme: theme })
      await app.page.locator(inView).first().scrollIntoViewIfNeeded()
      await app.page.screenshot({ path: join(SHOTS, `${name}-${width}-${theme}.png`) })
    }
  }
}

/**
 * OPEN THE CONVERSATION WITH THE AGENT THAT COULD NOT BE REACHED, by its contact row's key.
 *
 * The new agent's row holds the old name too when its name is built from it (`theNameOfANewAgentFor`
 * in src/server/lib/worker.ts), so a row is found by the key that says which agent it is, not by its
 * words.
 */
async function openTheOldConversation(): Promise<void> {
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 30_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  const row = `.px-chat-contact[data-contact="agent:${unreachable}"]`
  await app.page.waitForSelector(row, { timeout: 30_000 })
  await app.page.click(row)
  await app.page.waitForSelector('.px-chat-write textarea', { timeout: 30_000 })
}

/** The line on the waiting message's own row saying the press carried it to the new agent. */
function theCarriedLine() {
  return app.page.locator(`.px-chat .px-chat-one[data-target^="record/${waiting}/"] .px-chat-carried`)
}

/** The delivery mark on the waiting message's own row in the open conversation, by its title. */
function theWaitingMessagesMark(because: string) {
  return app.page.locator(`.px-chat .px-chat-one[data-target^="record/${waiting}/"]`).getByTitle(because, { exact: true })
}
