// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ON REGISTRATION AND ON A CARD CHANGE THE OFFICE PUSHES THE AGENT ONE MESSAGE.
 *
 * After an agent registers or its role changes, Mole Office sends that agent a message with its
 * duties, what it may do and how to do it, and the message is pushed to it.
 *
 * An agent made secretary on 14 September was told nothing, so it had to ask another secretary what a
 * secretary does. Before this build an appointment wrote one word on the record and sent no message,
 * a registration printed its guidance to the STARTER, and the only automatic role message was the
 * idle line, hours later.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES, THROUGH THE REAL DOORS
 * ---------------------------------------------------------------------------------------
 *
 *   · `POST /api/agents/started` registers an agent and the agent's own waiter door
 *     (`GET /api/handles/<handle>/waiting`, the door `tools/hold-the-handle.mjs` uses) finds one
 *     unseen message from Mole Office;
 *   · the same for `POST /api/agents/register-myself`, the second registration door;
 *   · its `body` is the declared line naming the card, and its `saidInFull` carries the card's own
 *     duties, its powers, its first readings with their levels, its `reportsTo` and its
 *     `whatEndsIt` — all read out of `design/permissions/roles.json` here, never retyped;
 *   · `POST /api/roles/card/<handle>` writes one message whose first sentence names the old card,
 *     the new card and who moved it;
 *   · appointing the card the agent already holds writes NOTHING;
 *   · two changes write two, and a name change or a state change writes nothing at all, because
 *     neither is the card;
 *   · an answered request that raises the card writes the same change message.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   THE CONTROL: the code before this build wrote no message on registration, so the registration
 *     cases find an empty waiting list and go red.
 *   drop the `writeTheCardMessageToOne` call from POST /api/agents/started → the started case red.
 *   drop it from `registerTheSessionItself` → the register-myself case red.
 *   drop it from POST /api/roles/card/:handle → the appointment case red.
 *   write it without the `heldWord !== said` guard → the same-card case red.
 *   drop it from the grant branch of POST /api/roles/requests/:id/grant → the answered case red.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance, InjectOptions } from 'fastify'

import { apiApp, freshDb, theOfficesOwnId, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TOOLSET_SENTENCE } from '../src/shared/toolset.ts'
import { KNOWLEDGE_WORDS } from '../src/shared/words/en-wave-13u.ts'
import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { A_ROW_WITH_NO_ROLE_READS_AS } from '../src/shared/roles.ts'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

/** The declaration as this test reads it, so no card word below is typed a second time. */
interface CardInTheFile {
  name: string
  rung: number | null
  duties: string
  powers: string[] | null
  mustRead: { chapters: { chapter: number; level: string }[]; andWhatItsStarterNames: string | null }
  reportsTo: string
  whatEndsIt: string
}
interface DeclarationInTheFile {
  readingLevels: { level: string; meaning: string }[]
  chapters: { number: number; name: string }[]
  tree: { rung: number; role: string; adds: string[] }[]
  cards: CardInTheFile[]
}

function theDeclarationAsWritten(): DeclarationInTheFile {
  const file = theRoleCardsFile()
  return JSON.parse(readFileSync(file, 'utf8')) as DeclarationInTheFile
}

/** The powers a card really holds, folding the tree in for a card on it. Mirror of `powersFor`. */
function thePowersOf(decl: DeclarationInTheFile, card: CardInTheFile): string[] {
  if (card.rung === null) return card.powers ?? []
  return decl.tree.filter((step) => step.rung <= card.rung!).flatMap((step) => step.adds)
}

async function inject(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  headers: Record<string, string>,
  payload?: InjectOptions['payload'],
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const options: InjectOptions = { method, url, headers }
  if (payload !== undefined) options.payload = payload
  const reply = await app.inject(options)
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json, text: reply.body }
}

/** Register through the starter door, as the person, and return the handle it wrote. */
async function started(handle: string): Promise<void> {
  const reply = await inject('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle })
  expect(reply.status, reply.text).toBe(201)
}

/**
 * A MADE-UP PERSON KEY, sent with the self-registration: a new handle whose request proves nobody
 * waits for the owner’s press (decision Nc9QRT9R_IvF), and this case is about one admitted at once.
 */
const PERSON_KEY = randomBytes(32).toString('hex')

/** Register a session through the self-registration door, proved by the person's key. */
async function registeredItself(handle: string): Promise<void> {
  const reply = await inject('POST', '/api/agents/register-myself', { ...asAgent(handle), 'x-mole-office-key': PERSON_KEY }, {
    handle,
    name: handle,
    runtime: 'codex',
    workingDirectory: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
  })
  expect(reply.status, reply.text).toBe(201)
}

/** Every message waiting for the agent, through the door the waiter really uses. */
async function waitingFor(handle: string): Promise<{ messageId: string }[]> {
  const reply = await inject('GET', `/api/handles/${handle}/waiting`, AS_THE_PERSON)
  expect(reply.status, reply.text).toBe(200)
  return (reply.json as { waiting: { messageId: string }[] }).waiting
}

/** One waiting message's own words, read the way the waiter reads them. */
interface AWaitingMessage {
  messageId: string
  body: string
  saidInFull: string
  sentById: string
}

/** Every message waiting for the agent, each read the way the waiter reads them. */
async function messagesFor(handle: string): Promise<AWaitingMessage[]> {
  const waiting = await waitingFor(handle)
  const out: AWaitingMessage[] = []
  for (const one of waiting) {
    // A MESSAGE IS READ FROM ANY PROJECT: it is kept in the message centre and belongs to none.
    const reply = await inject('GET', `/api/records/${one.messageId}`, AS_THE_PERSON)
    expect(reply.status, reply.text).toBe(200)
    const record = reply.json['record'] as { data: { body: string; saidInFull?: string; sentBy?: { id?: string } } }
    out.push({
      messageId: one.messageId,
      body: record.data.body,
      saidInFull: record.data.saidInFull ?? '',
      sentById: record.data.sentBy?.id ?? '',
    })
  }
  return out
}

/** Appoint a card, as the person. */
async function appoint(handle: string, role: string): Promise<number> {
  const reply = await inject('POST', `/api/roles/card/${handle}`, AS_THE_PERSON, { role })
  return reply.status
}

/**
 * ONE OFFICE FOR THE FILE. The made-up person key is in the key file before the server starts, and
 * every case registers agents under handles of its own, so the waiting list a case reads is that
 * agent's own.
 */
beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: PERSON_KEY, office: randomBytes(32).toString('hex'), providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ 1. one message on registration

describe('a registration writes the new agent one message about its card', () => {
  it('writes exactly one, from the office, naming the worker card and carrying its own words', async () => {
    await started('w-one')
    const messages = await messagesFor('w-one')
    // THE CONTROL: before this build this list was empty, which is what the first run measured.
    expect(messages.length, 'a registration wrote no message at all').toBe(1)

    const decl = theDeclarationAsWritten()
    const card = decl.cards.find((one) => one.name === A_ROW_WITH_NO_ROLE_READS_AS)
    expect(card, 'the worker card is not in the declaration').toBeDefined()

    const message = messages[0]!
    // THE LINE NAMES THE CARD, from the declaration's own word rather than a second spelling.
    expect(message.body).toBe(SYSTEM_LINES.youHoldACard(card!.name, '').line)
    expect(message.sentById, 'the message is not from the office').toBe(theOfficesOwnId(t))
    // AND THE SENTENCE CARRIES THE CARD'S OWN WORDS, read from the file here and never retyped.
    expect(message.saidInFull, 'the card’s duties are not in the message').toContain(card!.duties)
    expect(message.saidInFull).toContain(`${THE_TOOLSET_SENTENCE} ${KNOWLEDGE_WORDS.introduction}`)
    for (const power of thePowersOf(decl, card!)) {
      expect(message.saidInFull, `the power "${power}" is not in the message`).toContain(power)
    }
    for (const one of card!.mustRead.chapters) {
      expect(message.saidInFull, `chapter ${String(one.chapter)} is not in the message`).toContain(
        `chapter ${String(one.chapter)}`,
      )
      expect(message.saidInFull, `chapter ${String(one.chapter)} does not carry its level`).toContain(`at ${one.level}`)
    }
    expect(message.saidInFull, 'reportsTo is not in the message').toContain(card!.reportsTo)
    expect(message.saidInFull, 'whatEndsIt is not in the message').toContain(card!.whatEndsIt)
    expect(message.saidInFull, 'the door where the first task is is not named').toContain('GET /api/delegation')
  })

  it('writes one through the self-registration door too, for the card that session holds', async () => {
    await registeredItself('self-one')
    const messages = await messagesFor('self-one')
    expect(messages.length, 'the self-registration door wrote no message').toBe(1)
    const decl = theDeclarationAsWritten()
    const card = decl.cards.find((one) => one.name === A_ROW_WITH_NO_ROLE_READS_AS)!
    const message = messages[0]!
    expect(message.body).toBe(SYSTEM_LINES.youHoldACard(card.name, '').line)
    expect(message.saidInFull).toContain(card.duties)
    expect(message.sentById).toBe(theOfficesOwnId(t))
  })
})

// ============================================================ 2. the same message on a card change

describe('a card change writes the same message, with who moved it', () => {
  it('names the old card, the new card and who did it, and writes nothing when the card is unchanged', async () => {
    await started('w-one-change')
    expect((await waitingFor('w-one-change')).length, 'the registration wrote no message').toBe(1)

    expect(await appoint('w-one-change', 'supervisor')).toBe(201)
    const afterOne = await waitingFor('w-one-change')
    expect(afterOne.length, 'the appointment wrote no message').toBe(2)

    const decl = theDeclarationAsWritten()
    const supervisor = decl.cards.find((one) => one.name === 'supervisor')!
    const changed = (await messagesFor('w-one-change')).find((one) =>
      one.saidInFull.startsWith('Your card changed'),
    )
    expect(changed, 'the appointment wrote no change message').toBeDefined()
    const message = changed!
    expect(message.body).toBe(SYSTEM_LINES.youHoldACard('supervisor', '').line)
    expect(message.saidInFull, 'the change does not name the card it held').toContain(
      `Your card changed from the ${A_ROW_WITH_NO_ROLE_READS_AS} card to the supervisor card`,
    )
    expect(message.saidInFull, 'the change does not say who moved it').toContain(`by ${THE_PERSON}`)
    expect(message.saidInFull, 'the same card message is not carried on a change').toContain(supervisor.duties)

    // THE SAME CARD AGAIN WRITES NOTHING. Mutation: write without the `heldWord !== said` guard.
    expect(await appoint('w-one-change', 'supervisor')).toBe(201)
    expect((await waitingFor('w-one-change')).length, 'appointing the same card again wrote a message').toBe(2)

    // AND TWO CHANGES WRITE TWO.
    expect(await appoint('w-one-change', 'secretary')).toBe(201)
    expect((await waitingFor('w-one-change')).length, 'a second change wrote no message').toBe(3)
  })

  it('writes one when an answered request raises the card, and not on a refusal', async () => {
    await started('w-ask')
    const asked = await inject('POST', '/api/roles/requests', asAgent('w-ask'), {
      asking: 'supervisor',
      because: 'The module is large.',
    })
    expect(asked.status, asked.text).toBe(201)
    const request = String(asked.json['request'])

    const granted = await inject('POST', `/api/roles/requests/${request}/grant`, AS_THE_PERSON, {})
    expect(granted.status, granted.text).toBe(200)
    const waiting = await waitingFor('w-ask')
    expect(waiting.length, 'the answered request wrote no change message').toBe(2)
    const changed = (await messagesFor('w-ask')).find((one) => one.saidInFull.startsWith('Your card changed'))
    expect(changed, 'the answered request wrote no change message').toBeDefined()
    expect(changed!.saidInFull).toContain(
      `Your card changed from the ${A_ROW_WITH_NO_ROLE_READS_AS} card to the supervisor card, by ${THE_PERSON}.`,
    )
  })
})

// ============================================================ 3. nothing for what is not the card

describe('nothing is written for a name change or a state change', () => {
  it('leaves the waiting list exactly as it was', async () => {
    await started('w-two')
    const before = (await waitingFor('w-two')).length
    expect(before, 'the registration wrote no message').toBe(1)
    const changed = await inject('PATCH', '/api/participants/agent/w-two', AS_THE_PERSON, {
      name: 'Worker Two',
      state: 'busy on the mount',
    })
    expect(changed.status, changed.text).toBe(200)
    expect((await waitingFor('w-two')).length, 'a name or state change wrote a message').toBe(before)
  })
})
