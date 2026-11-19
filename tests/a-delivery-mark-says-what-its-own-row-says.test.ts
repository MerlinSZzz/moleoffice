// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SENTENCE BESIDE A TICK IS THE ROW'S OWN, AND THE GENERAL READING IS WHAT A SILENT ROW GETS.
 *
 * Problem `HfBVX-es5qip`. `DELIVERY.delivered` used to read *Something serving the person it is
 * addressed to has read this message*, and since 4 September 2026 that was not true of every row it
 * is drawn on: a line Mole Office wrote — a group was opened, a member was added, two claims are in
 * conflict — is marked delivered with no run behind it, because leaving it queued would put a clock
 * beside a message that is never going anywhere. So the mark's general reading says something
 * happened that did not, which is invariant 1 of USER.md broken on one hover.
 *
 * `deliveryReading` in src/shared/messages.ts draws the row's own sentence, and the general reading
 * only where the row says nothing, except that a read row also says it was read before its own
 * sentence. This file holds both readings and the two places they are drawn
 * from: the stored row a real system line leaves, and the rule that a screen reads a mark through
 * that one function.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DELIVERY, deliveryReading } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

const WEB = fileURLToPath(new URL('../src/web', import.meta.url))

let t: TestDb
let app: FastifyInstance

const AS_THE_OWNER: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: body as object })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

/** Every file under src/web, so a rule about screens can be asked of all of them. */
function everyScreen(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const here = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...everyScreen(here))
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) out.push(here)
  }
  return out
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a delivery row says what happened to it, and the mark says what the word means', () => {
  it('says a read message was read before its retained hand-over sentence', () => {
    const because = 'The session filed as record example-session was waiting for this and has been given it.'
    const reading = deliveryReading({ mark: 'seen', because })
    expect(reading.sentence).toBe(`${DELIVERY.seen.sentence} ${because}`)
    expect(reading.word).toBe('Read')
    expect(reading.shape).toBe('read')
    expect(deliveryReading({ mark: 'seen', because: null })).toEqual(DELIVERY.seen)
    expect(deliveryReading({ mark: 'seen', because: '   ' })).toEqual(DELIVERY.seen)
  })

  it.each(['queued', 'delivered', 'archived', 'posted'])('keeps only the row sentence for %s', (mark) => {
    const because = 'Mole Office wrote this line. No run was started for it.'
    expect(deliveryReading({ mark, because }).sentence).toBe(because)
  })

  it('draws the row s own sentence when the row has one', () => {
    const reading = deliveryReading({
      mark: 'delivered',
      because: 'Mole Office wrote this line to say what happened in this group. No run was started for it.',
    })
    expect(reading.sentence).toBe(
      'Mole Office wrote this line to say what happened in this group. No run was started for it.',
    )
    expect(
      reading.sentence,
      'the whole fault was that a row nothing read was told it had been read',
    ).not.toContain('has read this message')
    expect(reading.word, 'the word and the shape are still the mark s').toBe(DELIVERY.delivered.word)
    expect(reading.shape).toBe(DELIVERY.delivered.shape)
  })

  it('draws the general reading when the row says nothing', () => {
    const reading = deliveryReading({ mark: 'delivered', because: null })
    expect(reading).toEqual(DELIVERY.delivered)
  })

  it('treats a row whose sentence is blank as one that says nothing', () => {
    expect(deliveryReading({ mark: 'queued', because: '   ' })).toEqual(DELIVERY.queued)
  })

  it('keeps the general reading of a mark no table knows, and still draws the row s sentence', () => {
    const unknown = deliveryReading({ mark: 'posted', because: null })
    expect(unknown.word).toContain('posted')
    expect(unknown.sentence).toContain('cannot be said')
    expect(deliveryReading({ mark: 'posted', because: 'A person put this here by hand.' }).sentence).toBe(
      'A person put this here by hand.',
    )
  })
})

describe('a line Mole Office wrote is delivered, and the mark beside it says nothing read it', () => {
  it('draws no claim that anything read it', async () => {
    const agent = await post('/api/records', {
      kind: 'agent',
      title: 'mark-reader',
      data: { handle: 'mark-reader', state: 'active', runtime: 'claude-code' },
    })
    expect(agent['record'], 'the agent must be filed for the group to hold one').toBeDefined()
    const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
    const registryId = one(
      (listed.agents ?? []).filter((a) => a.handle === 'mark-reader'),
      'the registry row for mark-reader',
    ).id

    const opened = await post('/api/groups', {
      name: 'The mark this draws',
      because: 'a line Mole Office writes has to be delivered somewhere',
      members: [
        { who: { kind: 'agent', id: registryId }, because: 'somebody has to read it' },
        { who: { kind: 'person', id: THE_PERSON }, because: 'the owner watches' },
      ],
    })
    const groupId = (opened['group'] as { id: string }).id
    const lines = ((await get(`/api/groups/${groupId}`)) as { messages?: { id: string }[] }).messages ?? []
    const first = lines[0]
    if (first === undefined) throw new Error('opening a group wrote no line')

    // THE WORKER'S OWN DOOR MOVES THE MARK, which is the write this reading is about. It refuses any
    // message that was not written by Mole Office, so nothing else can reach this state.
    await post(`/api/worker/messages/${first.id}/needs-no-run`, { to: { kind: 'agent', id: registryId } })

    const message = (await get(`/api/messages/${first.id}`)) as {
      message?: { deliveries?: { to: { id: string }; mark: string; because: string | null }[] }
    }
    const row = one(
      (message.message?.deliveries ?? []).filter((d) => d.to.id === registryId),
      'the delivery row of the opening line for the agent in the group',
    )
    expect(row.mark, 'a line nothing will answer must not be left waiting under a clock').toBe('delivered')

    const reading = deliveryReading(row)
    expect(reading.sentence).toContain('No run was started for it')
    expect(
      reading.sentence,
      'this is the sentence problem HfBVX-es5qip is about: nothing read this line',
    ).not.toContain('has read this message')
  })
})

describe('a screen reads a delivery row through the one function that knows both halves', () => {
  it('names any screen that draws a mark without its row', () => {
    // THE CALL, NOT THE NAME. `deliveryWordOf` in shared/states.ts is a different reading — the six
    // words a dispatch row carries — and a comment naming either is not a screen drawing anything.
    const drawnRaw = everyScreen(WEB).filter((file) => /\bdeliveryWord\s*\(/.test(readFileSync(file, 'utf8')))
    expect(
      drawnRaw.map((file) => file.slice(WEB.length + 1)),
      'a screen calling deliveryWord draws the general reading of a mark and never the row s own sentence, ' +
        'which is how the chat panel came to say that a line nothing read had been read. Read the row with ' +
        'deliveryReading instead.',
    ).toEqual([])
  })
})
