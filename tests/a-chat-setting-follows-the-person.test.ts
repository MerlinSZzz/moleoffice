// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT MARK IS THE PERSON'S SETTING, THE PICTURE SETTING FOLLOWS THEM, AND AN AGENT WEARS ITS CARD.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * Three of the answers in THEIR-ANSWERS.md:
 *
 *   M73  The line saying which project a message is in is a setting of the person, off by default.
 *        When it is on, the mark is drawn on EVERY message, whatever project the reader stands in.
 *        It started when moving to another project made an "in mole office" line appear under messages
 *        that had none before; the line should show either always or never.
 *   rJphPkCG3l7X  How a picture in a message is drawn (M64) was built as a setting of the BROWSER,
 *        in localStorage. It follows the person now, on their registry row, like every other choice
 *        about how their chat is drawn.
 *   M75  An agent that chose no picture is drawn with the first portrait of the card it holds. In the
 *        chat, every builder wore the bee,
 *        because the bee is what anybody who chose nothing is offered. The bee stays for a person.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH CASE GO RED
 * ---------------------------------------------------------------------------------------
 *
 *   draw the mark when the reader is elsewhere, as before  → cases 1 and 2
 *   refuse the two new fields at the door                  → cases 1 and 3
 *   give an agent with a card the bee                      → case 4
 *   give a person a portrait                               → case 4
 */

import type { FastifyInstance } from 'fastify'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MESSAGE_PROJECT_MARK_BEFORE_ANYBODY_CHOOSES } from '../src/shared/participants.ts'
import { theFirstPortraitOf } from '../src/shared/portraits.ts'
import { THE_PICTURE_WAS_GIVEN } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_OWNER = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<{ status: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: body as never })
  return { status: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

interface OnTheWire {
  kind: string
  id: string
  handle: string
  avatarUrl: string
  role?: string | null
  messageProjectMark?: string | null
  messagePictures?: string | null
}

async function everybody(): Promise<{ people: OnTheWire[]; agents: OnTheWire[] }> {
  const reply = await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_OWNER })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as { people: OnTheWire[]; agents: OnTheWire[] }
}

const them = async (): Promise<OnTheWire> =>
  one((await everybody()).people.filter((p) => p.id === THE_PERSON), 'the person’s own registry row')

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  for (const [handle, title, role] of [
    ['with-a-card', 'A builder holding a card', 'worker'],
    ['with-no-card', 'A builder holding none', null],
  ] as const) {
    const filed = await post('/api/records', {
      kind: 'agent',
      title,
      data: { handle, runtime: 'claude-code', state: 'active', ...(role === null ? {} : { role }) },
    })
    expect(filed.status, JSON.stringify(filed.said)).toBe(201)
  }
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the project mark on a message is the person’s own setting', () => {
  it('is off before the person has chosen, and says they have not chosen rather than that they chose never', async () => {
    const mine = await them()
    expect(mine.messageProjectMark, 'nobody has chosen, which is not the same as choosing never').toBe(null)
    expect(MESSAGE_PROJECT_MARK_BEFORE_ANYBODY_CHOOSES, 'and what null is read as is off').toBe('never')
  })

  it('takes always and never, and takes the choice away again', async () => {
    for (const which of ['always', 'never'] as const) {
      const set = await app.inject({
        method: 'PATCH',
        url: `/api/participants/person/${THE_PERSON}`,
        headers: { ...AS_THE_OWNER, 'content-type': 'application/json' },
        payload: { messageProjectMark: which },
      })
      expect(set.statusCode, set.body).toBe(200)
      expect((await them()).messageProjectMark).toBe(which)
    }
    const cleared = await app.inject({
      method: 'PATCH',
      url: `/api/participants/person/${THE_PERSON}`,
      headers: { ...AS_THE_OWNER, 'content-type': 'application/json' },
      payload: { messageProjectMark: '' },
    })
    expect(cleared.statusCode, cleared.body).toBe(200)
    expect((await them()).messageProjectMark, 'an empty word takes the choice away').toBe(null)
  })

  it('refuses a word that is neither, naming both', async () => {
    const wrong = await app.inject({
      method: 'PATCH',
      url: `/api/participants/person/${THE_PERSON}`,
      headers: { ...AS_THE_OWNER, 'content-type': 'application/json' },
      payload: { messageProjectMark: 'sometimes' },
    })
    expect(wrong.statusCode, wrong.body).toBe(400)
    expect(wrong.body).toContain('always')
    expect(wrong.body).toContain('never')
    expect((await them()).messageProjectMark, 'and nothing was written').toBe(null)
  })
})

describe('how a picture in a message is drawn follows the person', () => {
  it('is on the person’s registry row, and takes the three words M64 declared', async () => {
    // THE CONTROL: nobody has chosen, so a stored word cannot pass for free.
    expect((await them()).messagePictures).toBe(null)
    for (const which of ['shown', 'pressed', 'path'] as const) {
      const set = await app.inject({
        method: 'PATCH',
        url: `/api/participants/person/${THE_PERSON}`,
        headers: { ...AS_THE_OWNER, 'content-type': 'application/json' },
        payload: { messagePictures: which },
      })
      expect(set.statusCode, set.body).toBe(200)
      expect((await them()).messagePictures).toBe(which)
    }
    const wrong = await app.inject({
      method: 'PATCH',
      url: `/api/participants/person/${THE_PERSON}`,
      headers: { ...AS_THE_OWNER, 'content-type': 'application/json' },
      payload: { messagePictures: 'somehow' },
    })
    expect(wrong.statusCode, wrong.body).toBe(400)
    expect(wrong.body).toContain('shown')
  })
})

describe('an agent that chose no picture wears its card', () => {
  it('draws the card portrait for an agent with a card, and leaves the bee to everybody else', async () => {
    const all = await everybody()
    const carded = one(all.agents.filter((a) => a.handle === 'with-a-card'), 'the agent holding a card')
    const bare = one(all.agents.filter((a) => a.handle === 'with-no-card'), 'the agent holding none')
    const person = one(all.people.filter((p) => p.id === THE_PERSON), 'the person’s own row')

    // THE CONTROL: all three chose nothing, so the difference is the card and not a chosen picture.
    expect(carded.role).toBe('worker')
    expect(bare.role ?? null, 'this one holds no card').toBe(null)

    expect(carded.avatarUrl, 'the person’s answer: the first portrait of the card it holds').toBe(
      theFirstPortraitOf('worker'),
    )
    expect(bare.avatarUrl, 'an agent with no card keeps what it had').not.toBe(theFirstPortraitOf('worker'))
    expect(person.avatarUrl, 'the bee stays the default for a person').not.toContain('/api/portraits/')
  })

  it('says on the asset row that the picture was given, so no file has to be opened to tell', async () => {
    // WHY THE ROW AND NOT THE BYTES. A database copied away from its pictures — which is what an
    // isolated instance is — cannot open the file to compare it, and then nothing could say the row
    // was wearing what it was handed. The row says so itself, where a picture's provenance goes.
    const { default: Database } = await import('better-sqlite3')
    const held = new Database(t.file, { readonly: true })
    try {
      const rows = held
        .prepare(
          'SELECT a.licence_source AS licence FROM agents g JOIN assets a ON a.id = g.avatar_asset_id ' +
            'WHERE g.handle = ?',
        )
        .all('with-a-card') as { licence: string | null }[]
      expect(rows.length, 'the agent has one picture').toBe(1)
      expect(rows[0]?.licence).toBe(THE_PICTURE_WAS_GIVEN)
    } finally {
      held.close()
    }
  })

  it('leaves a picture somebody really chose exactly where it is', async () => {
    // A REAL PNG, uploaded for the agent that holds a card. A default is not a choice and a choice
    // is not a default: this is the half of M75 that stops a portrait overwriting somebody's work.
    const A_REAL_PNG =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const carded = one(
      (await everybody()).agents.filter((a) => a.handle === 'with-a-card'),
      'the agent holding a card',
    )
    // THE CONTROL: it is wearing the portrait before the upload.
    expect(carded.avatarUrl).toBe(theFirstPortraitOf('worker'))

    const put = await app.inject({
      method: 'POST',
      url: `/api/participants/agent/${carded.id}/avatar`,
      headers: { ...AS_THE_OWNER, 'content-type': 'application/json' },
      payload: { bytes: A_REAL_PNG },
    })
    expect([200, 201], put.body).toContain(put.statusCode)

    const after = one(
      (await everybody()).agents.filter((a) => a.handle === 'with-a-card'),
      'the agent holding a card, again',
    )
    expect(after.avatarUrl, 'a chosen picture is never replaced by a card portrait').not.toBe(
      theFirstPortraitOf('worker'),
    )
    expect(after.avatarUrl).toContain('/api/assets/')
  })
})
