// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COMMENT IS A MESSAGE WITH A POINTER, AND IT BELONGS IN THE CONVERSATION IT WAS WRITTEN TO.
 *
 * ---------------------------------------------------------------------------------------
 * TWO FAULTS, AND THEY ARE NOT THE SAME FAULT
 * ---------------------------------------------------------------------------------------
 *
 * **A sent comment was addressed to nobody.** The composer picks a RUN and the pool addresses a
 * PARTICIPANT, and the join between them looked in the wrong id space. A durable agent is written
 * down twice: as a project record of kind `agent`, and as a row in the installation's registry
 * whose id is the handle, with `agent_records` joining them. A session says which agent it ran as
 * in `ranAs`, and what it stores there is the RECORD id. `theAgentAChoiceNames` looked in the
 * registry by id and by handle, and a record id is neither — so every comment addressed by picking
 * a run came back null and appeared in no conversation.
 *
 * Measured on the owner's live database on 4 September 2026: a comment written at 16:24,
 * stored a `chosenRecipient` naming session `sb5lkfnwYiux`, whose `ranAs` names record
 * `HFuL81sQ_YaJ`, an agent, whose registry row's id, from 2 September 2026, names that agent and the owner.
 * The words:
 * 我点击send后没有显示在我跟pointing这个agent的对话中. Problem `HtITS-9Xk_Vk`.
 *
 * **A comment nobody has sent said nothing about it.** A person writes several during a review and
 * sends them together afterwards, so between those two acts a comment exists and has gone to
 * nobody — and the conversation drew it exactly like a message that had. A comment is a message with a
 * pointer in it: it belongs in the conversation, and it shows that it is unsent. Criterion M28, problem
 * `EHCh6yPHw2t7`.
 *
 * WHAT "SENT" MEANS IS NOT WHAT THE DELIVERY MARK MEANS, and this file measures the difference. A
 * comment is addressed the moment it is written, because the write door works the address out from
 * the run its writer picked. It has gone to nobody until a review sends it. The two used to be one
 * question because a comment addressed to nobody could never be sent either — which is problem
 * `HtITS-9Xk_Vk` above.
 */

import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp, thePersonsKeyHeader, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CHAT_WORDS } from '../src/shared/messages.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const HANDLE = 'pointing-agent'
const A_SENT_COMMENT = 'Which repository is this claim written against?'
const AN_UNSENT_COMMENT = 'This paragraph and the one above say the same thing.'

/** The record id of the durable agent, which is NOT the id its registry row answers to. */
let agentRecordId = ''
/** The registry id the agent was given. It is not its handle, and a message stores this id. */
let agentId = ''
/** The session that ran as that agent, which is what the composer picks. */
let sessionId = ''
/** The record a comment points at. */
let aboutId = ''

async function file(kind: string, title: string, data: unknown): Promise<string> {
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: kind === 'session' ? { ...AS_THE_OWNER, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) } : AS_THE_OWNER,
    body: JSON.stringify({ kind, title, data }),
  })
  expect(filed.status, await filed.clone().text()).toBe(theAnswerToAWriteInATestOffice(AS_THE_OWNER, { kind, data }))
  return ((await filed.json()) as { record: { id: string } }).record.id
}

/** What the owner and that agent have said to each other, as the panel reads it. */
async function conversation(): Promise<{ id: string; body: string; notSentYet: boolean; target: unknown }[]> {
  const res = await fetch(`${app.api}/api/messages/conversation?kind=agent&id=${encodeURIComponent(HANDLE)}`, {
    headers: AS_THE_OWNER,
  })
  expect(res.status, await res.clone().text()).toBe(200)
  return ((await res.json()) as { messages: never[] }).messages
}

beforeAll(async () => {
  app = await liveApp({ name: 'comment-in-conversation', viewport: { width: 1440, height: 1000 } })

  agentRecordId = await file('agent', 'The POINTING agent', {
    handle: HANDLE,
    runtime: 'claude-code',
    state: 'active',
  })
  const listed = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await listed.json()) as { agents?: { id: string; handle: string }[] }).agents ?? []
  agentId = agents.find((one) => one.handle === HANDLE)?.id ?? ''
  expect(agentId, 'the pointing agent has no registry row').not.toBe('')
  // A RUN THAT WORKED AS THAT AGENT. `ranAs` carries the RECORD id, which is the whole of the fault:
  // the registry answers to the handle and knows nothing about record ids without the join table.
  sessionId = await file('session', 'A run of the POINTING agent', {
    state: 'running',
    runtime: 'claude-code',
    workspace: 'default',
    ranAs: [{ workspaceId: 'default', agentId: agentRecordId }],
  })
  aboutId = await file('note', 'The mount claim', { body: 'Where the claim is written down.' })
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe('a comment addressed by picking a run reaches the agent that run worked as', () => {
  it('addresses it to the registry row the run’s record id maps to, not to nobody', async () => {
    const id = await file('message', A_SENT_COMMENT.slice(0, 40), {
      body: A_SENT_COMMENT,
      target: { target: { kind: 'record', recordId: aboutId, workspaceId: 'default' }, place: { at: 'surface' } },
      chosenRecipient: { kind: 'session', sessionId, why: 'It filed this report.', agentId: agentRecordId },
    })

    const read = await fetch(`${app.api}/api/messages/${id}`, { headers: AS_THE_OWNER })
    expect(read.status, await read.clone().text()).toBe(200)
    const message = (await read.json()) as {
      message: { to: { kind: string; id: string }[]; deliveries: { to: { id: string } }[] }
    }
    expect(
      message.message.to.map((one) => one.id),
      'the comment was addressed to nobody, so no run can ever answer it',
    ).toContain(agentId)
    expect(message.message.deliveries.length, 'no delivery row was written for it').toBeGreaterThan(0)
  }, 120_000)

  it('draws it in that conversation with its pointer, which is the half the person can see', async () => {
    const said = await conversation()
    expect(said.map((one) => one.body), 'the comment is in no conversation').toContain(A_SENT_COMMENT)
    const drawn = said.find((one) => one.body === A_SENT_COMMENT)
    expect(drawn?.target, 'the comment lost the pointer that makes it a comment').not.toBeNull()
  }, 120_000)
})

describe('a comment nobody has sent yet is in the conversation too, marked unsent', () => {
  it('puts it there from the choice its writer made, with nothing delivered', async () => {
    const id = await file('message', AN_UNSENT_COMMENT.slice(0, 40), {
      body: AN_UNSENT_COMMENT,
      target: { target: { kind: 'record', recordId: aboutId, workspaceId: 'default' }, place: { at: 'surface' } },
      chosenRecipient: { kind: 'session', sessionId, why: 'It filed this report.', agentId: agentRecordId },
      // NO `to`, so nothing is delivered — which is what a comment written during a review holds.
    })
    expect(id).not.toBe('')

    const said = await conversation()
    const drawn = said.find((one) => one.body === AN_UNSENT_COMMENT)
    expect(drawn, 'an unsent comment is in no conversation at all').toBeDefined()
    expect(drawn?.notSentYet, 'an unsent comment is not marked as unsent').toBe(true)
    // AND IT IS ADDRESSED, so a run can be started for it the moment it is sent. The write door
    // works the address out from the run its writer picked; being unsent is a separate fact from
    // being addressed to nobody, and the two used to be one because of problem HtITS-9Xk_Vk.
    expect(drawn?.target, 'the unsent comment lost the pointer that makes it a comment').not.toBeNull()
  }, 120_000)

  it('leaves a plain message alone: writing one is sending it', async () => {
    // NOT EVERY MESSAGE IS A COMMENT. A message with no pointer was sent the moment it was written,
    // so marking it unsent would put a mark on every line in every conversation.
    await file('message', 'A plain line', {
      body: 'A plain line with no pointer.',
      to: [{ kind: 'agent', id: HANDLE }],
    })
    const said = await conversation()
    const plain = said.find((one) => one.body === 'A plain line with no pointer.')
    expect(plain, 'the plain message is not in the conversation').toBeDefined()
    expect(plain?.notSentYet, 'a message that is not a comment is marked unsent').toBe(false)
  }, 120_000)

  it('draws it in the panel with the words saying nothing has been sent', async () => {
    await app.page.goto(`${app.site}/#/`)
    await openTheChat(app.page)
    await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
    if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
    await app.page.waitForFunction(
      () => document.querySelector('.px-chat')?.textContent?.includes('The POINTING agent') === true,
      undefined,
      { timeout: 20_000 },
    )
    await app.page.click('.px-chat-contact:has-text("The POINTING agent")')
    await app.page.waitForFunction(
      (words: string) => document.querySelector('.px-chat')?.textContent?.includes(words) === true,
      AN_UNSENT_COMMENT,
      { timeout: 20_000 },
    )

    const panel = (await app.page.textContent('.px-chat')) ?? ''
    expect(panel, 'a comment is not in the conversation on the page').toContain(A_SENT_COMMENT)
    expect(panel, 'the second comment is not in the conversation on the page').toContain(AN_UNSENT_COMMENT)
    expect(panel, 'nothing says the comment has not been sent').toContain(CHAT_WORDS.notSentYet)

    // THE MARK IS ON THE COMMENTS AND NOT ON THE PLAIN MESSAGE. Writing a message is sending it, so
    // a mark on every line would say nothing.
    const marked = await app.page.$$eval('.px-chat-one', (all) =>
      all
        .filter((one) => one.querySelector('.px-chat-unsent') !== null)
        .map((one) => one.querySelector('.px-chat-words')?.textContent ?? ''),
    )
    expect(marked, 'a comment nobody has sent carries no unsent mark').toContain(AN_UNSENT_COMMENT)
    expect(marked, 'a plain message is marked unsent').not.toContain('A plain line with no pointer.')

    // A COMMENT CARRIES THE SAME DELIVERY MARK A MESSAGE DOES. Criterion M28: a comment is a
    // message with a pointer, so the tick and the clock are drawn on it exactly as on any line the
    // reader sent. Two shapes for one fact would be the panel saying a comment is a different kind
    // of thing after all.
    const withAMark = await app.page.$$eval('.px-chat-one', (all) =>
      all
        .filter((one) => one.querySelector('.px-chat-mark') !== null)
        .map((one) => one.querySelector('.px-chat-words')?.textContent ?? ''),
    )
    expect(withAMark, 'a comment the reader sent carries no delivery mark').toContain(AN_UNSENT_COMMENT)
    expect(withAMark, 'a plain message the reader sent carries no delivery mark').toContain(
      'A plain line with no pointer.',
    )

    // AND ONE PRESS OFFERS TO SEND THEM, saying how many there are.
    const bar = (await app.page.textContent('.px-chat-unsent-bar')) ?? ''
    expect(bar, 'the panel offers no press to send the unsent comments').toContain(CHAT_WORDS.sendThemAll)
    expect(bar, 'the panel does not say how many are waiting').toContain(CHAT_WORDS.unsentHere(marked.length))
  }, 120_000)
})

describe('nothing is marked sent that was not sent', () => {
  it('leaves every comment unsent when the review refuses to send them, and says why', async () => {
    // WHERE THE FLIP TO SENT IS MEASURED. `notSentYet` is the negation of `commentsGoneOut` in
    // src/server/lib/dispatch.ts, which is the reader the review column already draws from, and
    // tests/review-send.test.ts measures that reader against real sends. What this file adds is the
    // other half of the same rule: a send that did NOT happen must not move the mark.
    const started = await fetch(`${app.api}/api/reviews`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({
        entry: { target: { kind: 'record', recordId: aboutId, workspaceId: 'default' }, place: { at: 'surface' } },
      }),
    })
    expect(started.status, await started.clone().text()).toBe(201)
    const reviewId = ((await started.json()) as { review: { id: string } }).review.id

    const finished = await fetch(`${app.api}/api/reviews/${reviewId}/finish-collecting`, {
      method: 'POST',
      headers: AS_THE_OWNER,
    })
    expect(finished.status, await finished.clone().text()).toBe(200)

    // THESE COMMENTS NAME A RUN NOBODY RECORDED A TRANSCRIPT FOR, so the product refuses to start
    // an agent that has never heard of the work. That refusal is the honest answer and this is what
    // must not silently change the mark.
    const sent = await fetch(`${app.api}/api/reviews/${reviewId}/send`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ to: [] }),
    })
    expect(sent.status, 'a send that could not happen answered as though it had').toBe(409)
    const refusal = (await sent.json()) as { error: string }
    expect(refusal.error, 'the refusal does not say which comments are still here').toContain('nothing is lost')

    const after = await conversation()
    for (const body of [A_SENT_COMMENT, AN_UNSENT_COMMENT]) {
      const one = after.find((row) => row.body === body)
      expect(one?.notSentYet, `${body} was marked sent by a send that was refused`).toBe(true)
    }
  }, 120_000)
})

