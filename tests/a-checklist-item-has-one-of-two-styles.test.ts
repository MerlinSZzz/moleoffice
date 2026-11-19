// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ITEM HAS ONE OF TWO STYLES, AND ONE READER KNOWS THEM (wave 14a round 1).
 *
 * The owner's message says there are two styles, a plain item that is ticked directly or one that needs
 * evidence or words, and that the agent that creates an item chooses which. The secretary's
 * dsDfdzvwuWax and 6lZcXRq1gfPk (whole in the supervisor's 84WQhGoFug6s) settle two styles only: plain, and
 * evidence-or-words.
 *
 * WHAT IS PROVED, each by chapter 5's three runs:
 *   1. THE THREE DECLARATIONS AGREE ON EXACTLY TWO VALUES: the shared list, the shape the record gate reads, and the
 *      door take "plain" and "evidence-or-words" and nothing else — each value is created through the door, a value
 *      outside the two is refused there and by the shape, and the shape's published type names both.
 *   2. ONE READER: styleOfChecklistItem says "plain" for a style that is absent and the stored style otherwise. It is
 *      what a page draws from; the stored-row criteria are in a-checklist-keeps-requests-and-brings-them-back.test.ts.
 *   3. THE STYLE CHANGES NO RULE: an evidence-or-words item still refuses an agent's "done" with no evidence and takes
 *      the person's press, and a plain item that must be in the manual still needs its manual section.
 *
 * WHAT IS REAL: a scratch office with a real listener, the key window closed with the person's key, as the live
 * office's is. Every agent, checklist, message and key here is made up. Chapter 8 rule 3: the person is acted as only
 * inside this throwaway office.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'
import { SHAPE_SPECS, validateShape } from '../src/shared/kinds.ts'
import { CHECKLIST_ITEM_STYLES, styleOfChecklistItem } from '../src/shared/checklists.ts'

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const AS_THE_PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-key': A_MADE_UP_PERSON_KEY,
}

let t: TestDb
let app: FastifyInstance
let door = ''
const keys = new Map<string, string>()
const ids = new Map<string, string>()

async function ask(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; body: Record<string, any>; error: string }> {
  const res = await fetch(`${door}${path}`, {
    method,
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const read = (await res.json()) as Record<string, any>
  return { status: res.status, body: read, error: typeof read['error'] === 'string' ? read['error'] : JSON.stringify(read) }
}

function as(handle: string): Record<string, string> {
  return { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': keys.get(handle) ?? '' }
}

let list = ''

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  forgetTheWorldsOwnAuthority()
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  door = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  for (const [handle, name, role] of [
    ['quill', 'Quill', 'worker'],
    ['lark', 'Lark', 'worker'],
  ] as const) {
    const made = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle, name, role })
    expect(made.status, made.error).toBe(201)
    keys.set(handle, String(made.body['whatToGiveIt']?.key ?? ''))
    ids.set(handle, String(made.body['agent']?.id ?? ''))
  }
  const closed = await ask('POST', '/api/office/key-window/close', AS_THE_PERSON)
  expect(closed.status, closed.error).toBe(200)
  const made = await ask('POST', '/api/checklists', AS_THE_PERSON, { title: 'Kiln checklist' })
  expect(made.status, made.error).toBe(201)
  list = made.body['checklist'].id as string
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

/** One item's whole stored body, read back through the door. */
async function itemOf(item: string): Promise<Record<string, any>> {
  const read = await ask('GET', `/api/checklists/${list}`, AS_THE_PERSON)
  expect(read.status, read.error).toBe(200)
  const found = (read.body['checklist'].items as Record<string, any>[]).find((one) => one.id === item)
  if (found === undefined) throw new Error(`the checklist has no item ${item}`)
  return found
}

describe('the two styles, and the one reader', () => {
  it('1. the shared list, the record shape and the door agree on exactly two values', async () => {
    expect([...CHECKLIST_ITEM_STYLES]).toEqual(['plain', 'evidence-or-words'])
    const style = SHAPE_SPECS['ChecklistRequest']?.fields.find((field) => field.key === 'style')
    expect(style, 'the ChecklistRequest shape declares no style field').toBeDefined()
    expect(style?.type, 'the published type does not name both values').toBe("'plain' | 'evidence-or-words'")
    // THE SHAPE TAKES EACH VALUE AND REFUSES A THIRD.
    for (const one of CHECKLIST_ITEM_STYLES) {
      expect(validateShape('ChecklistRequest', { id: 'i-1', words: 'x', state: 'open', style: one }).ok, one).toBe(true)
    }
    const wrong = validateShape('ChecklistRequest', { id: 'i-1', words: 'x', state: 'open', style: 'fancy' })
    expect(wrong.ok).toBe(false)
    // AND SO DOES THE DOOR, ON BOTH CREATION PATHS.
    for (const one of CHECKLIST_ITEM_STYLES) {
      const added = await ask('POST', `/api/checklists/${list}/items`, as('quill'), { words: 'A styled item', style: one })
      expect(added.status, added.error).toBe(201)
      expect((await itemOf(added.body['item'].id)).style).toBe(one)
      const made = await ask('POST', '/api/checklists', as('quill'), { title: `Made with ${one}`, items: [{ words: 'A styled item', style: one }] })
      expect(made.status, made.error).toBe(201)
      expect(made.body['checklist'].items[0].style).toBe(one)
    }
    const refused = await ask('POST', `/api/checklists/${list}/items`, as('quill'), { words: 'A fancy item', style: 'fancy' })
    expect(refused.status, refused.error).toBe(400)
    expect(refused.error).toContain('plain')
    expect(refused.error).toContain('evidence-or-words')
  })

  it('2. one reader says plain for a style that is absent, and the stored style otherwise', () => {
    expect(styleOfChecklistItem({}), 'an item stored before styles existed reads as plain').toBe('plain')
    expect(styleOfChecklistItem({ style: 'plain' })).toBe('plain')
    expect(styleOfChecklistItem({ style: 'evidence-or-words' })).toBe('evidence-or-words')
  })

  it('3. the style changes no rule the item already had', async () => {
    const special = await ask('POST', `/api/checklists/${list}/items`, as('quill'), { words: 'Glaze the second batch', style: 'evidence-or-words' })
    expect(special.status, special.error).toBe(201)
    const specialId = special.body['item'].id as string
    // AN AGENT'S "DONE" STILL NEEDS EVIDENCE, WHATEVER THE STYLE.
    const noEvidence = await ask('PATCH', `/api/checklists/${list}/items/${specialId}`, as('lark'), { state: 'done' })
    expect(noEvidence.status, noEvidence.error).toBe(400)
    expect(noEvidence.error).toContain('is "done" with no evidence')
    // THE PERSON'S PRESS STILL MARKS IT DONE WITH NO EVIDENCE.
    const pressed = await ask('PATCH', `/api/checklists/${list}/items/${specialId}`, AS_THE_PERSON, { state: 'done' })
    expect(pressed.status, pressed.error).toBe(200)

    // A PLAIN ITEM THAT MUST BE IN THE MANUAL STILL NEEDS ITS MANUAL SECTION.
    const manual = await ask('POST', `/api/checklists/${list}/items`, as('quill'), { words: 'Write the firing curve in my manual', style: 'plain', mustBeInManual: true })
    expect(manual.status, manual.error).toBe(201)
    const manualId = manual.body['item'].id as string
    const commitOnly = await ask('PATCH', `/api/checklists/${list}/items/${manualId}`, as('quill'), { state: 'done', addEvidence: [{ kind: 'commit', commit: 'abcdef1' }] })
    expect(commitOnly.status, commitOnly.error).toBe(400)
    expect(commitOnly.error).toContain('must be in the manual')
  })
})
