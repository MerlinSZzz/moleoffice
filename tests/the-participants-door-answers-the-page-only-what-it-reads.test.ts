// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The participant list keeps its whole answer and cuts only the page's explicit reading. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ParticipantsReply } from '../src/web/api.ts'

// Written independently of the shared tuple: dropping a drawn field must fail this criterion.
const DRAWN_OF_A_PARTICIPANT = [
  'id', // src/web/components/Sidebar.tsx usePersonName
  'kind', // src/web/components/Forced.tsx nameOf
  'name', // src/web/components/Sidebar.tsx usePersonName
  'handle', // src/web/components/Chat.tsx openTheNewAgent
  'avatarUrl', // src/web/components/Chat.tsx TheChat
  'state', // src/web/components/Chat.tsx TheChat
  'newerOfASharedName', // src/web/components/ContactChooser.tsx ContactRow
  'retired', // src/web/components/ContactChooser.tsx facesInAGroup
  'retiredAt', // src/web/components/ContactChooser.tsx ContactRow
  'stateBy', // src/web/components/Chat.tsx TheChat
  'circleShows', // src/web/components/Chat.tsx TheChat
  'circlePicture', // src/web/components/Chat.tsx TheChat
  'messageLinkLevel', // src/web/components/Chat.tsx TheChat
  'messageLinkLayout', // src/web/components/Chat.tsx TheChat
  'messageProjectMark', // src/web/components/Chat.tsx TheChat
  'messagePictures', // src/web/components/Chat.tsx TheChat
  'mediaLoad', // src/web/components/Chat.tsx TheChat
  'chatTextSize', // src/web/components/Chat.tsx TheChat
  'chatButtonStays', // src/web/components/Chat.tsx TheChat
  'chatOpensAs', // src/web/components/Chat.tsx TheChat
  'chatLayout', // src/web/components/Chat.tsx TheChat
  'chatLabels', // src/web/components/Chat.tsx TheChat
  'shippedFlags', // src/web/components/Chat.tsx TheChat
  'role', // src/web/components/ContactChooser.tsx ContactRow
  'shortcuts', // src/web/lib/shortcuts.ts readShortcuts
  'sendKey', // src/web/lib/send-key.ts readSendKey
  'language', // src/web/lib/language.ts readLanguage
  'record', // src/web/components/agent/TalkBox.tsx carryTheShownRecipient
  'addressAs', // src/web/components/ResidentProposals.tsx ResidentProposals
  'themes', // src/web/lib/the-look.ts readThePersonsLook
]
const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
let t: TestDb
let app: FastifyInstance
let retiredId: string
let recordId: string

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const changed = await app.inject({ method: 'PATCH', url: `/api/participants/person/${THE_PERSON}`, headers: PERSON,
    payload: { name: 'Made-up Rowan', circle: 'two', circlePicture: 'mole-at-the-sill', sendKey: 'enter', shortcuts: { singleKeys: true, off: ['theme'] }, language: 'en' } })
  expect(changed.statusCode, changed.body).toBe(200)
  for (const handle of ['made-up-lark', 'made-up-wren']) {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON,
      payload: { handle, name: handle, workArea: ['src'], role: 'worker' } })
    expect(made.statusCode, made.body).toBe(201)
    const row = made.json<{ record: string; agent: { id: string } }>()
    if (handle === 'made-up-lark') recordId = row.record
    else retiredId = row.agent.id
  }
  const retired = await app.inject({ method: 'POST', url: `/api/participants/agent/${retiredId}/retire`, headers: PERSON,
    payload: { because: 'The made-up work is finished.' } })
  expect(retired.statusCode, retired.body).toBe(200)
}, 120_000)

afterAll(async () => { await app?.close(); t?.close() })

describe('the participants door', () => {
  it('still answers whole rows when shape is left out', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/participants', headers: PERSON })
    expect(reply.statusCode, reply.body).toBe(200)
    const whole = reply.json<ParticipantsReply & { next: string | null }>()
    // This fixture fits in one page; the cursor criterion exercises multiple pages.
    expect(whole.next).toBeNull()
    expect(whole.people.find(one => one.id === THE_PERSON)).toMatchObject({ circleShows: 'two', circlePicture: 'mole-at-the-sill', sendKey: 'enter', language: 'en', shortcuts: { singleKeys: true, off: ['theme'] } })
    expect(whole.people.find(one => one.id === THE_PERSON)).toHaveProperty('chatLayout', null)
    expect(whole.agents.some(one => one.record === recordId)).toBe(true)
    expect(whole.agents.find(one => one.id === retiredId)).toMatchObject({ retired: true, retiredAt: expect.any(String) })
    for (const row of [...whole.people, ...whole.agents]) {
      expect(row).toHaveProperty('createdAt')
      expect(row).toHaveProperty('homeWorld')
      expect(row).toHaveProperty('addressAsSetBy')
    }
    const again = await app.inject({ method: 'GET', url: '/api/participants', headers: PERSON })
    expect(again.body).toBe(reply.body)
  })

  it('answers the same rows in order, with exactly the drawn fields that each whole row carries', async () => {
    const whole = await app.inject({ method: 'GET', url: '/api/participants', headers: PERSON })
    const short = await app.inject({ method: 'GET', url: '/api/participants?shape=page', headers: PERSON })
    expect(whole.statusCode, whole.body).toBe(200)
    expect(short.statusCode, short.body).toBe(200)
    type Page = { people: Record<string, unknown>[]; agents: Record<string, unknown>[]; next: string | null; total: number; says: string }
    const collect = async (initial: Page) => {
      const joined = { ...initial, people: [...initial.people], agents: [...initial.agents] }
      let next = initial.next
      while (next !== null) {
        const reply = await app.inject({ method: 'GET', url: next, headers: PERSON })
        expect(reply.statusCode, reply.body).toBe(200)
        const following = reply.json<Page>()
        joined.people.push(...following.people)
        joined.agents.push(...following.agents)
        next = following.next
      }
      return joined
    }
    const fullFirst = whole.json<Page>()
    const cutFirst = short.json<Page>()
    // This fixture fits in one page. The separate continuation test inserts a row between pages.
    expect(fullFirst.next).toBeNull()
    expect(cutFirst.next).toBeNull()
    const full = await collect(fullFirst)
    const cut = await collect(cutFirst)
    expect(cut.people.find(one => one['id'] === THE_PERSON)).toHaveProperty('chatLayout', null)
    for (const side of ['people', 'agents'] as const) {
      expect(cut[side].map(one => one['id'])).toEqual(full[side].map(one => one['id']))
      for (const [index, row] of cut[side].entries()) {
        const original = full[side][index]!
        const kept = DRAWN_OF_A_PARTICIPANT.filter(field => Object.hasOwn(original, field))
        expect(Object.keys(row).sort(), `${side} row ${index}`).toEqual(kept.sort())
        for (const field of kept) expect(row[field], field).toEqual(original[field])
      }
    }
    // Paging metadata describes each shape's pages; the remaining top-level keys are identical.
    const contentKeys = (row: Page) => Object.keys(row).filter(key => !['next', 'total', 'says'].includes(key)).sort()
    expect(contentKeys(cut)).toEqual(contentKeys(full))
  })

  it('refuses unknown shapes with the same refusal as the groups door', async () => {
    for (const shape of ['whole', '']) {
      const wrong = await app.inject({ method: 'GET', url: `/api/participants?shape=${shape}`, headers: PERSON })
      const group = await app.inject({ method: 'GET', url: `/api/groups?shape=${shape}`, headers: PERSON })
      expect(wrong.statusCode).toBe(400)
      expect(wrong.json<{ error: string }>().error).toBe(group.json<{ error: string }>().error)
    }
  })
})
