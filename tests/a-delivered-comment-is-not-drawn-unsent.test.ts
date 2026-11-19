// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COMMENT THAT REACHED SOMEBODY IS NEVER DRAWN "NOT SENT YET".
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED 5 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * Two different questions shared one word. The mark came from `notSentYet`, which asked only
 * whether a REVIEW had carried the comment out. A comment written straight to `POST /api/records`
 * with a recipient gets a delivery row from the door and the worker starts a run for it, and
 * neither of those touches the review's marker.
 *
 * So comment `wOMI_XCnbEcu` was delivered at 03:45:49, answered by run `l8pezZ7Imv_j` — the answer
 * is two blocks below it in the same conversation — and the panel still drew it *Not sent yet*,
 * with *Send them* offering to send it again. It told the owner the opposite of what happened. Problem
 * `pGNsLwJFMUC1`, and it is the shape of the complaint that produced criterion M28 and problem
 * `wgUEBO2o4AlI`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE, AND THE LINE IT DRAWS
 * ---------------------------------------------------------------------------------------
 *
 * `queued` is not handed over. A comment whose recipient was chosen for it, as the review column
 * chooses one, and whose row is still queued, has been written down and nobody serving the
 * recipient has read it, so it stays unsent — which is the state criterion M28 asks to be SHOWN
 * while a review collects, and this file proves that half too. A row past queued means the words
 * went, and after that the screen may not say they did not.
 *
 * A COMMENT WRITTEN STRAIGHT TO ITS RECIPIENT IS SENT WHEN IT IS WRITTEN, before anybody has read
 * it. Until 7 November 2026 it was unsent until then, as the comment chosen for its recipient is,
 * and the chat drew a comment written with the comment box's Send *Not sent yet* until its agent
 * had read it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, theAnswerToAWriteInATestOffice, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const HANDLE = 'answering-agent'

let agentRecordId = ''
let agentRegistryId = ''
let aboutId = ''
let commentId = ''
let sentId = ''

async function file(kind: string, title: string, data: unknown): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind, title, data }),
  })
  expect(made.status, await made.clone().text()).toBe(theAnswerToAWriteInATestOffice(AS_THE_OWNER, { kind, data }))
  return ((await made.json()) as { record: { id: string } }).record.id
}

/** Change one message's data as its writer, the person. */
async function change(id: string, dataPatch: Record<string, unknown>): Promise<void> {
  const changed = await fetch(`${app.api}/api/records/${id}`, { method: 'PATCH', headers: AS_THE_OWNER, body: JSON.stringify({ dataPatch }) })
  expect(changed.status, await changed.clone().text()).toBe(200)
}

/**
 * A COMMENT WRITTEN TO NOBODY, AND THEN THE AGENT CHOSEN FOR IT, with the write the review column's Choose a recipient
 * makes. The door writes the comment's `to` from that choice.
 */
async function aCommentChosenFor(agentRecord: string, title: string, body: string): Promise<string> {
  const id = await file('message', title, {
    body,
    target: { target: { kind: 'record', recordId: aboutId, workspaceId: 'default' }, place: { at: 'surface' } },
  })
  await change(id, { chosenRecipient: { kind: 'agent', agentId: agentRecord } })
  return id
}

interface Message {
  id: string
  notSentYet: boolean
  deliveries: { to: { kind: string; id: string }; mark: string; run: string | null }[]
}

async function readMessage(id: string): Promise<Message> {
  const got = await fetch(`${app.api}/api/messages/${id}`, { headers: AS_THE_OWNER })
  expect(got.status, await got.clone().text()).toBe(200)
  return ((await got.json()) as { message: Message }).message
}

/**
 * MOVE ONE RECIPIENT'S MARK FORWARD THROUGH THE DOOR THAT DOES IT.
 *
 * The route marks the row belonging to WHOEVER IS ASKING, so the request is made as the agent. That
 * is the whole point: a mark is a claim about somebody having read something, and only that
 * somebody may make it.
 */
async function mark(id: string, asHandle: string, word: string): Promise<void> {
  const moved = await fetch(`${app.api}/api/messages/${id}/mark`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': asHandle,
    },
    body: JSON.stringify({ mark: word }),
  })
  expect(moved.status, await moved.clone().text()).toBe(200)
}

beforeAll(async () => {
  app = await liveApp({ name: 'delivered-not-unsent', viewport: { width: 1440, height: 900 } })

  agentRecordId = await file('agent', 'Answering agent', { handle: HANDLE, runtime: 'claude-code', state: 'active' })
  const registry = await fetch(`${app.api}/api/participants/agent/${HANDLE}`, { headers: AS_THE_OWNER })
  expect(registry.status, await registry.clone().text()).toBe(200)
  agentRegistryId = ((await registry.json()) as { participant: { id: string } }).participant.id

  aboutId = await file('note', 'A page with a comment on it', { body: 'One paragraph.' })
  commentId = await aCommentChosenFor(agentRecordId, 'A comment its agent was chosen for', 'Which repository is this claim written against?')
  sentId = await file('message', 'A comment written straight to the door', {
    body: 'Which branch is this claim written against?',
    to: [{ kind: 'agent', id: agentRegistryId }],
    target: { target: { kind: 'record', recordId: aboutId, workspaceId: 'default' }, place: { at: 'surface' } },
  })
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('a comment its agent was chosen for, which nobody has picked up', () => {
  it('is drawn unsent while its only row is still waiting', async () => {
    const one = await readMessage(commentId)
    expect(one.deliveries.map((row) => row.mark), 'the comment did not start queued').toEqual(['queued'])
    expect(one.notSentYet, 'a comment nobody has been handed was drawn as sent').toBe(true)
  })
})

describe('a comment written straight to its recipient, which nobody has picked up', () => {
  it('is sent when it is written, though its only row is still waiting', async () => {
    const one = await readMessage(sentId)
    expect(one.deliveries.map((row) => row.mark), 'the comment did not start queued').toEqual(['queued'])
    expect(one.notSentYet, 'a comment written straight to its recipient was drawn "Not sent yet"').toBe(false)
  })
})

describe('a comment something serving its recipient has read', () => {
  it('is not drawn unsent any more', async () => {
    await mark(commentId, HANDLE, 'delivered')
    const one = await readMessage(commentId)
    expect(one.deliveries.map((row) => row.mark)).toEqual(['delivered'])
    expect(one.notSentYet, 'a comment that reached its recipient is still drawn "Not sent yet"').toBe(false)
  })

  it('stays sent once the recipient says they read it', async () => {
    await mark(commentId, HANDLE, 'seen')
    const one = await readMessage(commentId)
    expect(one.notSentYet, 'a comment somebody read went back to unsent').toBe(false)
  })

  it('is gone from the conversation’s list of comments waiting to be sent', async () => {
    const got = await fetch(
      `${app.api}/api/messages/conversation?kind=agent&id=${encodeURIComponent(agentRegistryId)}`,
      { headers: AS_THE_OWNER },
    )
    expect(got.status, await got.clone().text()).toBe(200)
    const held = ((await got.json()) as { messages: Message[] }).messages
    const one = held.find((row) => row.id === commentId)
    expect(one, 'the comment is not in the conversation at all').toBeDefined()
    expect(one?.notSentYet, 'the panel would still offer to send a comment that has gone').toBe(false)
  })
})

describe('one message with two recipients', () => {
  it('is unsent only while nobody at all has been handed it', async () => {
    const second = await file('agent', 'A second answering agent', {
      handle: 'second-answering-agent',
      runtime: 'claude-code',
      state: 'active',
    })
    expect(second).not.toBe('')
    const registry = await fetch(`${app.api}/api/participants/agent/second-answering-agent`, { headers: AS_THE_OWNER })
    const secondId = ((await registry.json()) as { participant: { id: string } }).participant.id

    // THE SECOND RECIPIENT IS ADDED BY THE COMMENT'S WRITER, which a comment that has not gone out may gain beside the
    // agent chosen for it.
    const id = await aCommentChosenFor(second, 'A comment to two recipients', 'Both of you should read this paragraph.')
    await change(id, { to: [{ kind: 'agent', id: secondId }, { kind: 'person', id: THE_PERSON }] })
    expect((await readMessage(id)).deliveries.map((row) => [row.to.kind, row.mark]).sort(), 'the comment does not wait for two recipients').toEqual([['agent', 'queued'], ['person', 'queued']])
    expect((await readMessage(id)).notSentYet, 'a comment nobody has been handed was drawn as sent').toBe(true)

    await mark(id, 'second-answering-agent', 'delivered')
    expect(
      (await readMessage(id)).notSentYet,
      'a comment one of its two recipients has read is still drawn as sent by nobody',
    ).toBe(false)
  })
})
