// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** This finished conversation attachment predates seals and is explicitly inventoried; all recipient and sending assertions remain. */
import Database from 'better-sqlite3'
/**
 * WHO A MESSAGE IS TO IS WORKED OUT WHENEVER THE RECORD IS WRITTEN, NOT ONLY WHEN IT IS BORN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED 5 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A conversation is built from delivery rows. The create door wrote them, and nothing else ever
 * did. The review column chooses who a comment is for AFTERWARDS — a `PATCH` writing
 * `chosenRecipient` onto a record that already exists — so a comment addressed that way had no
 * recipient, no delivery row, and sat in no conversation at all, while the column said *Sent · 2
 * sent*. Two comments on the verifier's stack, `qvZZMtfziJO8` and `L1oLIBZudcp0`, came back with
 * `to: []` and the conversation with the agent the column named held nothing.
 *
 * Problem `fhxBfI7wb1nz`. It is problem `HtITS-9Xk_Vk` arriving by a second door, and it is the
 * clause of criterion M28 that says a review leaving several comments for one agent shows every
 * one of them.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 * 1. A comment written with nobody chosen is addressed to nobody, and has no rows. That is the
 *    honest state and this file is not asking for it to change.
 * 2. Choosing a recipient afterwards writes the delivery rows THEN, and the comment is in that
 *    agent's conversation.
 * 3. Choosing again writes no second row for a recipient that already has one, so pressing twice
 *    does not make a message look like two.
 * 4. A recipient somebody wrote outright is never overruled by a choice.
 * 5. `scripts/deliver-what-was-addressed-and-never-delivered.ts` writes the rows that were never
 *    written while the doors were broken, and running it a second time writes nothing. That script
 *    is what the person's own comment needs, and it calls the same reader both doors call.
 */

import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, thePersonsKeyHeader, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const HANDLE = 'later-chosen-agent'
const CHOSEN_LATER = 'The third paragraph contradicts the table above it.'
const OTHER_HANDLE = 'somebody-else-entirely'
const NAMED_OUTRIGHT = 'This one says who it is for as it is written.'

/** The durable agent's RECORD id, which is not the id its registry row answers to. */
let agentRecordId = ''
/** The registry row's id, which is what a delivery row is addressed to. */
let agentRegistryId = ''
/** The session that ran as that agent — what a person picks in the composer. */
let sessionId = ''
/** The record a comment points at. */
let aboutId = ''
/** The comment that gets its recipient afterwards. */
let laterId = ''

async function file(kind: string, title: string, data: unknown, status = 201): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: kind === 'session' ? { ...AS_THE_OWNER, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) } : AS_THE_OWNER,
    body: JSON.stringify({ kind, title, data }),
  })
  expect(made.status, await made.clone().text()).toBe(status)
  return ((await made.json()) as { record: { id: string } }).record.id
}

interface Message {
  id: string
  to: { kind: string; id: string }[]
  deliveries: { to: { kind: string; id: string }; mark: string }[]
}

async function readMessage(id: string): Promise<Message> {
  const got = await fetch(`${app.api}/api/messages/${id}`, { headers: AS_THE_OWNER })
  expect(got.status, await got.clone().text()).toBe(200)
  return ((await got.json()) as { message: Message }).message
}

async function conversation(): Promise<Message[]> {
  const got = await fetch(
    `${app.api}/api/messages/conversation?kind=agent&id=${encodeURIComponent(agentRegistryId)}`,
    { headers: AS_THE_OWNER },
  )
  expect(got.status, await got.clone().text()).toBe(200)
  return ((await got.json()) as { messages: Message[] }).messages
}

/** The review column's own act: `PATCH /api/records/:id {"dataPatch":{"chosenRecipient":…}}`. */
async function chooseWhoItIsFor(commentId: string, session: string): Promise<Response> {
  return fetch(`${app.api}/api/records/${commentId}`, {
    method: 'PATCH',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      dataPatch: { chosenRecipient: { kind: 'session', sessionId: session, why: 'It reviewed this page.' } },
    }),
  })
}

beforeAll(async () => {
  app = await liveApp({ name: 'recipient-chosen-later', viewport: { width: 1440, height: 900 } })

  agentRecordId = await file('agent', 'Later chosen agent', { handle: HANDLE, runtime: 'claude-code', state: 'active' })
  const registry = await fetch(`${app.api}/api/participants/agent/${HANDLE}`, { headers: AS_THE_OWNER })
  expect(registry.status, await registry.clone().text()).toBe(200)
  agentRegistryId = ((await registry.json()) as { participant: { id: string } }).participant.id

  sessionId = await file('session', 'A run of the later chosen agent', {
    state: 'running',
    runtime: 'claude-code',
    ranAs: [{ workspaceId: 'default', agentId: agentRecordId }],
  })
  const historical = new Database(join(app.dir, 'panelx.db'))
  try { historical.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(sessionId) } finally { historical.close() }
  // ENDED WITH THE PERSON'S KEY: a claim to be the person with no key does not end a run (problem FZQflYp1vHuY).
  const finished = await fetch(`${app.api}/api/records/${sessionId}`, { method: 'PATCH', headers: { ...AS_THE_OWNER, ...thePersonsKeyHeader(app.dir + '/keys.json') }, body: JSON.stringify({ dataPatch: { state: 'finished' } }) })
  expect(finished.status, await finished.clone().text()).toBe(200)

  aboutId = await file('note', 'A page worth reviewing', { body: 'Two paragraphs and a table.' })
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('a comment written with nobody chosen', () => {
  it('is addressed to nobody and has no delivery row, which is the truth about it', async () => {
    laterId = await file('message', 'A comment with nobody chosen', {
      body: CHOSEN_LATER,
      target: { target: { kind: 'record', recordId: aboutId, workspaceId: 'default' }, place: { at: 'surface' } },
    })
    const one = await readMessage(laterId)
    expect(one.to, 'a comment nobody addressed came back addressed to somebody').toEqual([])
    expect(one.deliveries, 'a comment addressed to nobody has a mark about somebody').toEqual([])
  })

  it('is in no conversation yet, because a conversation is built from delivery rows', async () => {
    const held = await conversation()
    expect(held.map((row) => row.id)).not.toContain(laterId)
  })
})

describe('choosing who it is for afterwards — what the review column does', () => {
  it('writes the delivery rows then, so the comment reaches the agent', async () => {
    const chose = await chooseWhoItIsFor(laterId, sessionId)
    expect(chose.status, await chose.clone().text()).toBe(200)

    const one = await readMessage(laterId)
    expect(one.to, 'a recipient chosen after the comment was written reached nobody').toEqual([
      { kind: 'agent', id: agentRegistryId },
    ])
    expect(one.deliveries.map((row) => row.to.id), 'no delivery row was written for the chosen agent').toEqual([
      agentRegistryId,
    ])
  })

  it('draws it in that agent’s conversation, which is the half the person can see', async () => {
    const held = await conversation()
    expect(held.map((row) => row.id), 'the conversation with the chosen agent does not hold the comment').toContain(
      laterId,
    )
  })

  it('writes no second row when the same choice is made again', async () => {
    const again = await chooseWhoItIsFor(laterId, sessionId)
    expect(again.status, await again.clone().text()).toBe(200)
    const one = await readMessage(laterId)
    expect(one.deliveries.length, 'choosing twice made one message look like two').toBe(1)
  })
})

describe('a recipient somebody wrote outright', () => {
  it('is never overruled by a choice arriving afterwards', async () => {
    await file('agent', 'Somebody else entirely', { handle: OTHER_HANDLE, runtime: 'claude-code', state: 'active' })
    const other = await fetch(`${app.api}/api/participants/agent/${OTHER_HANDLE}`, { headers: AS_THE_OWNER })
    expect(other.status, await other.clone().text()).toBe(200)
    const otherId = ((await other.json()) as { participant: { id: string } }).participant.id

    const id = await file('message', 'A comment addressed as it was written', {
      body: NAMED_OUTRIGHT,
      to: [{ kind: 'agent', id: otherId }],
      target: { target: { kind: 'record', recordId: aboutId, workspaceId: 'default' }, place: { at: 'surface' } },
    }, 409)
    const chose = await chooseWhoItIsFor(id, sessionId)
    expect(chose.status, await chose.clone().text()).toBe(200)
    const one = await readMessage(id)
    expect(one.to.map((row) => row.id), 'a choice overruled a recipient somebody wrote outright').toEqual([otherId])
  })
})

describe('the rows that were never written while the doors were broken', () => {
  /**
   * THE SCRIPT IS RUN AS A PERSON WOULD RUN IT, against this test's own database. It is the act
   * owed to the person's comment, on problem `HtITS-9Xk_Vk`. What makes it safe to run is
   * that it calls the same reader the doors call rather than SQL of its own.
   */
  const TSX = join(process.cwd(), 'node_modules', '.bin', 'tsx')
  const run = (dbFile: string, args: string[]): string =>
    execFileSync(TSX, ['scripts/deliver-what-was-addressed-and-never-delivered.ts', ...args], {
      encoding: 'utf8',
      env: { ...process.env, MOLE_OFFICE_DB: dbFile },
    })

  it('writes the row a comment should have had, and nothing the second time', async () => {
    const dbFile = join(app.dir, 'panelx.db')
    const stranded = await file('message', 'A comment stranded by the old door', {
      body: 'This one lost its rows when the door was broken.',
      chosenRecipient: { kind: 'session', sessionId, why: 'It reviewed this page.' },
      target: { target: { kind: 'record', recordId: aboutId, workspaceId: 'default' }, place: { at: 'surface' } },
    }, 409)
    // THE STATE THE OLD DOOR LEFT BEHIND, made here by taking the rows away again. No door in this
    // build produces it any more, which is the whole point of the fix above, so the only way to put
    // a database into it is to reach past the doors — which is what this one line does and nothing
    // else in this file does.
    execFileSync(
      TSX,
      [
        '-e',
        "import { sqlite } from './src/server/db/client.ts'; " +
          `sqlite.prepare('DELETE FROM message_delivery WHERE message_id = ?').run(${JSON.stringify(stranded)})`,
      ],
      { encoding: 'utf8', env: { ...process.env, MOLE_OFFICE_DB: dbFile } },
    )
    expect((await readMessage(stranded)).deliveries, 'the stranded state was not reached').toEqual([])

    const said = run(dbFile, [])
    expect(said, 'the dry run does not name the message it would deliver').toContain(stranded)
    expect(said, 'the dry run wrote something').toContain('Nothing was written')
    expect((await readMessage(stranded)).deliveries, 'the dry run wrote a row').toEqual([])

    const did = run(dbFile, ['--do-it'])
    expect(did, 'the run does not say how many rows it wrote').toContain('1 delivery row(s) written')
    expect((await readMessage(stranded)).deliveries.map((row) => row.to.id)).toEqual([agentRegistryId])

    const twice = run(dbFile, ['--do-it'])
    expect(twice, 'a second run found work to do').toContain('Nothing to write')
  }, 240_000)
})
