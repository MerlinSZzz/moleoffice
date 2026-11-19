// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FORCED MESSAGE: A DIALOGUE FOR A PERSON, THE FRONT OF THE QUEUE FOR AN AGENT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M62 of design/messages/ACCEPTANCE.md:
 *
 *   A forced system message is a new type. For a person it is a system dialogue on the Mole Office page,
 *   with what is behind it blurred, and it can go to one screen alone (a system reminder on one machine,
 *   for instance). For an agent it is a message injected by force. It is for emergencies only: a very
 *   small downward triangle sits beside Send, and only a press on it shows the forced send, in red.
 *
 * and, on the agent side:
 *
 *   1. Where it can be done, the message jumps the queue. 2. Where it cannot, it is put first among
 *   the messages to that agent, with a mark saying that it jumps the queue.
 *
 * Four things, and each is a separate failure:
 *
 *   1. THE QUEUE PUTS AN EMERGENCY FIRST, however long it has been waiting, and leaves everything
 *      else in the order it was in.
 *   2. WHICH OF THE TWO HALVES A RUNTIME GETS IS READ FROM WHAT WAS MEASURED, not chosen. Nothing
 *      may claim a runtime can be interrupted when src/shared/waking.ts says nobody has managed it.
 *   3. A PERSON GETS A DIALOGUE with the page behind it blurred, dismissed by one press.
 *   4. THE PERSON'S WRITING ROW OFFERS NO EMERGENCY SEND (wave 13y), and an agent's emergency is drawn in the
 *      conversation with its mark in the page's language.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE QUEUE CASE IS ASSERTED ON ORDER AND NOT ON A FLAG
 * ---------------------------------------------------------------------------------------
 *
 * "Marked urgent" would pass with the ordering deleted. What is asked for is the PLACE: first. So
 * the ordinary messages are written FIRST and the emergency LAST, which is the arrangement in which
 * oldest-first and urgent-first give different answers — and then the emergency is asserted to be
 * at the head, with the ordinary ones still in the order they were sent.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CHAT_WORDS, URGENT_WORDS, whatAnUrgentMessageGets } from '../src/shared/messages.ts'
import { en } from '../src/shared/words/en.ts'
import { HOW_TO_WAKE } from '../src/shared/waking.ts'
import { AGENT_RUNTIMES } from '../src/shared/participants.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_AN_AGENT = {
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'siren',
}

/**
 * THE SECOND AGENT THIS FILE REGISTERS, so a case can inject when the first one's last injected
 * message is still unread.
 *
 * Criterion M84 bounds an agent to one unread injected message per person. The bound is per sender,
 * so writing as somebody else is not a way round it: it is what the rule says.
 */
const AS_A_SECOND_AGENT = {
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'gull',
}

async function write(headers: Record<string, string>, body: unknown): Promise<Response> {
  return fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
}

/** One message, ordinary or urgent, with an optional narrowing to one viewer. */
async function say(
  headers: Record<string, string>,
  to: { kind: string; id: string },
  body: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const res = await write(headers, { kind: 'message', title: body.slice(0, 30), data: { body, to: [to], ...extra } })
  const held = (await res.json()) as { record?: { id: string } }
  expect(res.status, JSON.stringify(held)).toBe(theAnswerToAWriteInATestOffice(headers, { kind: 'message', data: { to: [to] } }))
  return held.record?.id ?? ''
}

/** The worker's queue, in the order the worker will take it. */
async function theQueue(): Promise<{ messageId: string; body: string; urgent: boolean }[]> {
  const res = await fetch(`${app.api}/api/worker/queue?full=1`, { headers: AS_THE_OWNER })
  const held = (await res.json()) as { queue?: { messageId: string; body: string; urgent: boolean }[] }
  expect(res.status, JSON.stringify(held)).toBe(200)
  return held.queue ?? []
}

beforeAll(async () => {
  app = await liveApp({ name: 'forced-message', viewport: { width: 1440, height: 1000 } })
  for (const [handle, name] of [
    ['siren', 'Siren'],
    ['gull', 'Gull'],
  ]) {
    const made = await write(AS_THE_OWNER, {
      kind: 'agent',
      title: name,
      data: { handle, runtime: 'claude-code', state: 'active' },
    })
    expect(made.status, await made.text()).toBe(201)
  }
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('what an emergency gets for one runtime is read from what was measured', () => {
  it('says wake for every runtime a running session can be reached in, and the queue for the rest', () => {
    // THE CONTROL: at least one runtime of each kind, so this cannot pass by everything agreeing.
    const canBeWoken = AGENT_RUNTIMES.filter((one) => HOW_TO_WAKE[one].canBeWoken)
    const cannot = AGENT_RUNTIMES.filter((one) => !HOW_TO_WAKE[one].canBeWoken)
    expect(canBeWoken.length).toBeGreaterThan(0)
    expect(cannot.length).toBeGreaterThan(0)

    for (const one of canBeWoken) expect(whatAnUrgentMessageGets(one)).toBe('wake the session')
    for (const one of cannot) expect(whatAnUrgentMessageGets(one)).toBe('first in the queue')
  })

  it('gives an agent whose runtime nobody set the front of the queue rather than a refusal', () => {
    expect(whatAnUrgentMessageGets(null)).toBe('first in the queue')
    expect(whatAnUrgentMessageGets('a-tool-nobody-has')).toBe('first in the queue')
  })
})

describe('the queue puts an emergency in front of everything else waiting for that agent', () => {
  it('takes the emergency first, and leaves the ordinary ones in the order they were sent', async () => {
    // A SECOND BETWEEN THEM, ON PURPOSE. A delivery row's stamp has second precision and its
    // tie-break is a random id, so two messages written inside one second come back in no
    // particular order. Waiting is what makes "the ordinary ones are still oldest first" a claim
    // about the ordering rather than about which nanoid happened to sort lower.
    const first = await say(AS_THE_OWNER, { kind: 'agent', id: 'gull' }, 'The first ordinary message.')
    await new Promise((r) => setTimeout(r, 1_100))
    const second = await say(AS_THE_OWNER, { kind: 'agent', id: 'gull' }, 'The second ordinary message.')
    await new Promise((r) => setTimeout(r, 1_100))
    const emergency = await say(AS_THE_OWNER, { kind: 'agent', id: 'gull' }, 'Stop what you are doing.', {
      urgent: true,
    })

    const queue = (await theQueue()).filter((one) => [first, second, emergency].includes(one.messageId))
    expect(queue.map((one) => one.messageId)).toEqual([emergency, first, second])
    expect(queue[0]?.urgent).toBe(true)
    expect(queue[1]?.urgent).toBe(false)
  })
})

describe('a person is shown a dialogue over a blurred page', () => {
  it('draws it, blurs what is behind it, and one press dismisses it', async () => {
    await say(AS_AN_AGENT, { kind: 'person', id: THE_PERSON }, 'The stack is on fire. Come and look.', {
      urgent: true,
    })

    await app.page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await app.page.waitForSelector('.px-forced', { timeout: 30_000 })

    const said = await app.page.$eval('.px-forced', (el) => el.textContent ?? '')
    expect(said).toContain('The stack is on fire')
    expect(said).toContain(URGENT_WORDS.dialogueName)

    // WHAT IS BEHIND IT IS BLURRED. M62 asks for that. Read off the computed style rather than off
    // the class name, so a rule deleted from the stylesheet fails this.
    const blur = await app.page.$eval('.px-forced-behind', (el) => getComputedStyle(el).backdropFilter)
    expect(blur).toContain('blur')

    // ONE PRESS.
    await app.page.click('.px-forced-dismiss')
    await app.page.waitForFunction('document.querySelector(".px-forced") === null', { timeout: 30_000 })
  }, 120_000)

  it('shows nothing to a screen the message was narrowed away from', async () => {
    await say(AS_AN_AGENT, { kind: 'person', id: THE_PERSON }, 'Only for the browser on loquat.', {
      urgent: true,
      onlyOn: { machine: 'loquat' },
    })
    await app.page.reload({ timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    // A moment for the read to land, so "nothing is drawn" is not "nothing has been asked yet".
    await new Promise((r) => setTimeout(r, 1_000))
    expect(await app.page.$('.px-forced')).toBeNull()
  }, 120_000)

  it('shows one narrowed to the machine this browser really is on', async () => {
    const machine = process.env['HOSTNAME'] ?? (await import('node:os')).hostname()
    // FROM THE SECOND AGENT, because the first one's message above was narrowed away from this
    // browser and so was never read. Criterion M84: an agent may not inject a second message to a
    // person while its last injected one is unread, and a message nobody was shown is unread. The
    // bound is per sender, which is what lets this case use another one.
    await say(AS_A_SECOND_AGENT, { kind: 'person', id: THE_PERSON }, 'For this machine alone.', {
      urgent: true,
      onlyOn: { machine },
    })
    await app.page.reload({ timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await app.page.waitForSelector('.px-forced', { timeout: 30_000 })
    expect(await app.page.$eval('.px-forced', (el) => el.textContent ?? '')).toContain('For this machine alone')
    await app.page.click('.px-forced-dismiss')
    await app.page.waitForFunction('document.querySelector(".px-forced") === null', { timeout: 30_000 })
  }, 120_000)
})

describe("the person's writing row offers no emergency send, and an agent's emergency keeps its mark", () => {
  /**
   * WHAT THIS CASE ASSERTED BEFORE WAVE 13Y, and why it changed.
   *
   * It pressed the small triangle joined to Send, read the one red Inject line in the menu that opened above it, and
   * pressed that line to send the person's own emergency. It was then decided that sending first did nothing a
   * person needed, and it left the person's row: the triangle, its menu and its line are gone. The row is the
   * attach press, the quote press, the box, the label flag and Send.
   *
   * WHAT IS STILL PROVED: an emergency an agent sends the person is drawn in the conversation with its mark, in the
   * page's language, and nothing in the person's row sends one. The dialogue cases above prove the rest of M62 for the
   * person, and the queue case proves it for an agent.
   */
  it("draws an agent's emergency with the English mark, and no triangle or Inject in the person's row", async () => {
    await app.page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    // ANY EMERGENCY LEFT ON THE SCREEN IS DISMISSED FIRST. The dialogue swallows presses, which is
    // the point of it, so the composer cannot be reached underneath one.
    while ((await app.page.$('.px-forced')) !== null) {
      await app.page.click('.px-forced-dismiss')
      await app.page.waitForTimeout(300)
    }
    await openTheChat(app.page)
    await app.page.waitForSelector('.px-chat', { timeout: 30_000 })
    // THE CONVERSATION WITH THE AGENT THAT SENT THE PERSON AN EMERGENCY in the dialogue case above.
    await app.page.locator('.px-chat-contact', { hasText: 'Siren' }).first().click()
    await app.page.waitForSelector('.px-chat-write textarea', { timeout: 30_000 })

    // THE MARK IS IN THE PAGE'S LANGUAGE. An English page once drew the Chinese mark. Criterion M90 put the whole UI
    // in English first, so the English page draws the English word list's mark, and the Chinese list keeps the Chinese.
    await app.page.waitForSelector('.px-chat-urgent', { timeout: 30_000 })
    const marks = await app.page.$$eval('.px-chat-urgent', (all) => all.map((el) => el.textContent ?? ''))
    expect(marks.length).toBeGreaterThan(0)
    expect(marks.every((one) => one === en['chat.urgent.mark'])).toBe(true)
    expect(marks.some((one) => /[一-鿿]/.test(one)), `the English page drew ${marks.join(', ')}`).toBe(false)

    // AND NOTHING IN THE PERSON'S ROW SENDS AN EMERGENCY: no triangle beside Send, no Inject line, and no
    // press or name that offers one. The words are read off the row and its presses' names, so a press
    // under another class name still fails this.
    await app.page.fill('.px-chat-write textarea', 'Everything has stopped.')
    expect(await app.page.$$('.px-chat-write .px-chat-more'), 'a triangle is drawn beside Send').toHaveLength(0)
    expect(await app.page.$$('.px-chat-inject'), 'an Inject line is drawn').toHaveLength(0)
    const said = await app.page.$eval('.px-chat-write', (row) =>
      [row.textContent ?? '', ...[...row.querySelectorAll('button')].map((one) => `${one.getAttribute('aria-label') ?? ''} ${one.getAttribute('title') ?? ''}`)].join(' | '),
    )
    expect(said).not.toContain(URGENT_WORDS.sendItUrgently)
    expect(said).not.toContain(URGENT_WORDS.onlyForAnEmergency)
    expect(await app.page.$eval('.px-chat-send', (el) => el.textContent ?? '')).toBe(CHAT_WORDS.send)
    expect(await app.page.$('.px-chat-sender[data-way="inject"]')).toBeNull()
    await app.page.fill('.px-chat-write textarea', '')
  }, 120_000)
})
