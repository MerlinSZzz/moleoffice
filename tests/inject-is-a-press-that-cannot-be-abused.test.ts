// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * INJECT IS A PRESS THAT SENDS AT ONCE, AND IT CANNOT BE ABUSED.
 *
 * Criterion M84 of design/messages/ACCEPTANCE.md section 43, which settles
 * proposal `W3FHvHM-apiL`: a press that happens once, and
 * this feature must not be abused.
 *
 * WHAT IT REPLACED. Inject was a WAY the Send button sent: it was ticked in the menu, the whole
 * control turned red, and Send sent that way until it was reset. Two presses to send an emergency,
 * and a state on the screen that meant the next Enter would send one.
 *
 * WHAT CHANGED IN WAVE 13Y. The owner found that the person's own Inject did nothing a person
 * needed, so it left the person's writing row: the triangle beside Send, its menu and its one line.
 * An agent's Inject, its bound, its count and the switch are unchanged, and cases 3 to 6 prove them.
 *
 * WHAT IS PROVED HERE.
 *
 * 1. The person's writing row has no triangle beside Send, no menu and no line that sends an
 *    emergency. Send sends what was written as an ordinary message.
 * 2. Nothing stays behind: the button still says Send, and no way to send is in force.
 * 3. Every injected message records who injected it and when — its own sender and its own stamp —
 *    and the recipient's page counts them per sender, with how many are unread.
 * 4. An agent may not inject a second message to the same person while its last is unread, and the
 *    refusal says so. Reading the first one lets the next through, which is the control.
 * 5. A person may inject without limit.
 * 6. The person can switch injecting off for every agent, on the Settings page (criterion M91), and
 *    a refused inject says which of the two refusals it met. The agent's profile says whether agents
 *    may inject and links to the switch, and carries no press of its own.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, RUN AT THE MERGE COMMIT 300ea432 ON 8 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A CONTROL RUN FIRST: 11 cases, all green. Then, in `whyThisInjectIsRefused` in
 * src/server/lib/messages.ts, the two guards at the top were
 * replaced by `return null`, so no inject is ever refused.
 *
 * THE CASES THAT WENT RED, and they are the ones this criterion is about:
 *
 *   × refuses the second, and says why and what to do instead
 *   × counts them per sender, and says how many of each are still unread
 *   × refuses its inject with the other refusal, naming the person as the only way back
 *
 * (That third case is now "refuses its inject with the other refusal, naming the Settings page";
 * it was rewritten on 25 September 2026 when the right became one setting, criterion M91, and its
 * own three runs are in the commit that rewrote it.)
 *
 * The change was put back and the control run again: 11 cases, all green. So the test holds the
 * behaviour rather than passing beside it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CHAT_WORDS, URGENT_WORDS } from '../src/shared/messages.ts'
import { INJECT_WORDS } from '../src/shared/profile.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function asAgent(handle: string): Record<string, string> {
  return { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

async function write(body: unknown, headers: Record<string, string> = AS_THE_OWNER): Promise<Response> {
  return fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
}

/** An agent's message to the owner, injected or not. Gives back the status and what was said. */
async function fromAgent(
  handle: string,
  body: string,
  urgent: boolean,
): Promise<{ status: number; said: string; id: string }> {
  const res = await write(
    {
      kind: 'message',
      title: body.slice(0, 30),
      data: { body, to: [{ kind: 'person', id: THE_PERSON }], ...(urgent ? { urgent: true } : {}) },
    },
    asAgent(handle),
  )
  const held = (await res.json()) as { record?: { id: string }; error?: string }
  return { status: res.status, said: String(held.error ?? ''), id: held.record?.id ?? '' }
}

async function markSeen(messageId: string): Promise<void> {
  const res = await fetch(`${app.api}/api/messages/${messageId}/mark`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ mark: 'seen' }),
  })
  expect(res.status, await res.text()).toBe(200)
}

/** The owner's own profile, which is where the count per sender is drawn. */
async function whatWasInjectedToThem(): Promise<{ from: { id: string }; count: number; unread: number }[]> {
  const res = await fetch(`${app.api}/api/participants/person/${THE_PERSON}/profile`, { headers: AS_THE_OWNER })
  const held = (await res.json()) as { injectedToThem?: { from: { id: string }; count: number; unread: number }[] }
  return held.injectedToThem ?? []
}

/** One agent's profile: whether agents may inject, as that agent's page says it. */
async function whatItsProfileSays(agentId: string): Promise<{ may: boolean; whereItIsSet: string }> {
  const res = await fetch(`${app.api}/api/participants/agent/${agentId}/profile`, { headers: AS_THE_OWNER })
  const held = (await res.json()) as { mayInject?: { may: boolean; whereItIsSet: string } }
  if (held.mayInject === undefined) throw new Error('the profile said nothing about injecting')
  return held.mayInject
}

/** Press the one switch for every agent, as the person. */
async function switchInjecting(may: boolean): Promise<void> {
  const res = await fetch(`${app.api}/api/office/agents-may-inject`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ may }),
  })
  expect(res.status, await res.text()).toBe(200)
}

async function theAgents(): Promise<{ id: string; handle: string }[]> {
  const res = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  return ((await res.json()) as { agents: { id: string; handle: string }[] }).agents
}

/** The registry ids the office gave the two agents. A stored sender is an id, not a handle. */
let shouter = ''
let quietOne = ''

beforeAll(async () => {
  app = await liveApp({ name: 'inject-press', viewport: { width: 1440, height: 1000 } })
  for (const [handle, name] of [
    ['shouter', 'Shouter'],
    ['quiet-one', 'Quiet One'],
  ]) {
    const made = await write({ kind: 'agent', title: name, data: { handle, runtime: 'claude-code', state: 'active' } })
    expect(made.status, await made.text()).toBe(201)
  }
  const agents = await theAgents()
  shouter = agents.find((one) => one.handle === 'shouter')?.id ?? ''
  quietOne = agents.find((one) => one.handle === 'quiet-one')?.id ?? ''
  expect(shouter).not.toBe('')
  expect(quietOne).not.toBe('')
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** The stored messages that say these words, with whether each was sent as an emergency. */
async function storedWith(body: string): Promise<{ body: string; urgent: boolean }[]> {
  const res = await fetch(`${app.api}/api/messages?full=1`, { headers: AS_THE_OWNER })
  expect(res.status, await res.clone().text()).toBe(200)
  const held = (await res.json()) as { messages?: { body: string; urgent: boolean }[] }
  return (held.messages ?? []).filter((one) => one.body === body).map((one) => ({ body: one.body, urgent: one.urgent }))
}

describe("the person's writing row has no triangle, menu or Inject, and Send sends an ordinary message", () => {
  it('sends what was written as an ordinary message, and offers no other way to send it', async () => {
    await app.page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    while ((await app.page.$('.px-forced')) !== null) {
      await app.page.click('.px-forced-dismiss')
      await app.page.waitForTimeout(300)
    }
    await openTheChat(app.page)
    await app.page.waitForSelector('.px-chat', { timeout: 30_000 })
    await app.page.click('.px-chat-contact')
    await app.page.waitForSelector('.px-chat-write textarea', { timeout: 30_000 })

    // SEND SENDS WHAT WAS WRITTEN, AS AN ORDINARY MESSAGE, and the row is empty after it.
    const words = 'The gripper is still holding.'
    await app.page.fill('.px-chat-write textarea', words)
    await app.page.click('.px-chat-send')
    await app.page.waitForFunction(
      () => (document.querySelector('.px-chat-write textarea') as HTMLTextAreaElement | null)?.value === '',
      { timeout: 30_000 },
    )
    await expect.poll(() => storedWith(words), { timeout: 30_000 }).toEqual([{ body: words, urgent: false }])

    // NOTHING STAYS BEHIND. The button says Send, and no way to send is in force for the next message.
    expect(await app.page.$eval('.px-chat-send', (el) => el.textContent ?? '')).toBe(CHAT_WORDS.send)
    expect(await app.page.$('.px-chat-sender[data-way="inject"]')).toBeNull()

    // AND THE ROW OFFERS NO OTHER WAY TO SEND: no triangle beside Send, and no press or name that sends an
    // emergency. The words are read off what the row draws and off its presses' names, so a press under
    // another class name still fails this.
    await app.page.fill('.px-chat-write textarea', 'The gripper is holding again.')
    expect(await app.page.$$('.px-chat-write .px-chat-more'), 'a triangle is drawn beside Send').toHaveLength(0)
    expect(await app.page.$$('.px-chat-inject'), 'an Inject line is drawn').toHaveLength(0)
    const said = await app.page.$eval('.px-chat-write', (row) =>
      [row.textContent ?? '', ...[...row.querySelectorAll('button')].map((one) => `${one.getAttribute('aria-label') ?? ''} ${one.getAttribute('title') ?? ''}`)].join(' | '),
    )
    expect(said).not.toContain(URGENT_WORDS.sendItUrgently)
    expect(said).not.toContain(URGENT_WORDS.onlyForAnEmergency)
    await app.page.fill('.px-chat-write textarea', '')
  }, 120_000)
})

describe('an agent may not inject a second message while its last is unread', () => {
  beforeAll(async () => {
    // The open conversation marks incoming messages seen. These API cases set and read their own
    // delivery marks, so leave the app before sending any of them. The profile case opens it again.
    await app.page.goto('about:blank')
  })

  let first = ''

  it('takes the first one', async () => {
    const sent = await fromAgent('shouter', 'The arm is about to hit the frame.', true)
    expect(sent.status, sent.said).toBe(201)
    first = sent.id
  })

  it('refuses the second, and says why and what to do instead', async () => {
    const no = await fromAgent('shouter', 'And again.', true)
    expect(no.status).toBe(403)
    expect(no.said).toContain('already has an injected message')
    expect(no.said).toContain(first)
    expect(no.said).toContain('Nothing was written')
    expect(no.said).toContain('Send it as an ordinary message')
  })

  it('takes an ORDINARY message from the same agent, so only the emergency is bounded', async () => {
    const fine = await fromAgent('shouter', 'And here it is as an ordinary one.', false)
    expect(fine.status, fine.said).toBe(201)
  })

  it('takes an injected message from a DIFFERENT agent, so one shouting does not silence another', async () => {
    const fine = await fromAgent('quiet-one', 'Something else is on fire.', true)
    expect(fine.status, fine.said).toBe(201)
  })

  it('takes the next one once the person has read the first, which is the control', async () => {
    await markSeen(first)
    const fine = await fromAgent('shouter', 'Now the frame really is bent.', true)
    expect(fine.status, fine.said).toBe(201)
  })
})

describe('the count on the page of whoever was injected to', () => {
  /**
   * THE UNREAD HALF IS SET DELIBERATELY RATHER THAN INHERITED.
   *
   * The API cases leave the browser on a blank page, so no open conversation can mark a new
   * message seen between its creation and the count read. This case marks the earlier emergencies
   * read, checks those counts, then creates exactly one unread emergency and checks both counts.
   */
  it('counts them per sender, and says how many of each are still unread', async () => {
    // ONLY THE ONES ADDRESSED TO THE OWNER. A message somebody else was sent has no delivery of theirs to
    // mark, and the mark door says so rather than writing one.
    const pool = (await (await fetch(`${app.api}/api/messages?full=1`, { headers: AS_THE_OWNER })).json()) as {
      messages?: { id: string; urgent: boolean; deliveries: { to: { kind: string; id: string } }[] }[]
    }
    for (const message of pool.messages ?? []) {
      const their = message.deliveries.some((one) => one.to.kind === 'person' && one.to.id === THE_PERSON)
      if (message.urgent && their) await markSeen(message.id)
    }

    const read = await whatWasInjectedToThem()
    // TWO FROM THE SHOUTER: the first, and the one it was allowed to send once the owner had read that.
    expect(read.find((row) => row.from.id === shouter)).toEqual({
      from: { kind: 'agent', id: shouter },
      count: 2,
      unread: 0,
    })
    expect(read.find((row) => row.from.id === quietOne)).toEqual({
      from: { kind: 'agent', id: quietOne },
      count: 1,
      unread: 0,
    })

    // AND ONE MORE, UNREAD, so the second number is measured and not only the first.
    const again = await fromAgent('quiet-one', 'One more thing.', true)
    expect(again.status, again.said).toBe(201)
    expect((await whatWasInjectedToThem()).find((row) => row.from.id === quietOne)).toEqual({
      from: { kind: 'agent', id: quietOne },
      count: 2,
      unread: 1,
    })
  })
})

describe('the person can switch injecting off for every agent', () => {
  it('says yes on the profile before the person presses, which is the control', async () => {
    const before = await whatItsProfileSays(shouter)
    expect(before.may).toBe(true)
    expect(before.whereItIsSet).toBe(INJECT_WORDS.whereItIsSet)
  })

  it('switches it off, and the profile says so', async () => {
    await switchInjecting(false)
    expect((await whatItsProfileSays(shouter)).may).toBe(false)
  })

  it('refuses its inject with the other refusal, naming the Settings page', async () => {
    // ITS LAST INJECTED MESSAGE IS READ FIRST, so what is measured here is the switch and not the
    // unread rule. Two refusals that could both be true would make this case say nothing.
    const counted = await whatWasInjectedToThem()
    expect(counted.find((row) => row.from.id === shouter)?.count).toBe(2)
    const pool = (await (await fetch(`${app.api}/api/messages?full=1`, { headers: AS_THE_OWNER })).json()) as {
      messages?: { id: string; sentBy: { id: string } | null; urgent: boolean }[]
    }
    for (const message of pool.messages ?? []) {
      if (message.urgent && message.sentBy?.id === shouter) await markSeen(message.id)
    }

    const no = await fromAgent('shouter', 'Please, one more.', true)
    expect(no.status).toBe(403)
    expect(no.said).toContain('may not inject')
    expect(no.said).toContain('the switch that lets agents inject is off')
    expect(no.said).toContain(INJECT_WORDS.whereItIsSet)
    expect(no.said).toContain('Nothing was written')

    // AND AN ORDINARY MESSAGE FROM IT IS UNAFFECTED, which is what the refusal told it to send.
    const fine = await fromAgent('shouter', 'Ordinary, then.', false)
    expect(fine.status, fine.said).toBe(201)
  })

  it('draws the state and a link to the switch on the profile page, and no press', async () => {
    await app.page.goto(`${app.site}/#/who/agent/${shouter}`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await app.page.waitForSelector('.inject-state', { timeout: 30_000 })
    expect(await app.page.$eval('.inject-state', (el) => el.textContent ?? '')).toBe(INJECT_WORDS.no)
    // THE PANEL IS FOUND BY THE MARK IT DECLARES, which is `data-target` and carries the surface
    // id: that is the one spelling of a key in this product, and the same string a comment on the
    // panel would carry.
    const goes = await app.page.$eval('[data-target*="profile.inject"] a', (el) => el.getAttribute('href') ?? '')
    expect(goes).toContain('settings')
    expect(await app.page.$$('[data-target*="profile.inject"] button')).toHaveLength(0)
    expect(await app.page.$$('[data-target*="profile.inject"] [role="switch"]')).toHaveLength(0)
  }, 120_000)
})
