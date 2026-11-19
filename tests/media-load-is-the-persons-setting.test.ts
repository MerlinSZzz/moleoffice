// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER MEDIA A RECORD POINTS AT ARE LOADED IS A SETTING OF THE PERSON. Criterion U5.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * A setting with three answers: transfer by
 * default, do not transfer by default, and transfer after a click and then show. Three choices on
 * the Settings page, the person's own, and they follow the person to every machine.
 *
 *   1. THE ROW HOLDS NO CHOICE UNTIL THE PERSON CHOOSES, and a reader is told that rather than handed the
 *      default word. `null` is a third answer, not `with-page`.
 *   2. THE DOOR TAKES ALL THREE DECLARED WORDS, and an empty word takes the choice away again.
 *   3. A FOURTH WORD IS REFUSED AND THE REFUSAL NAMES ALL THREE, and nothing is written.
 *   4. THE CHOICE IS READ BACK FROM A SECOND READ, which is what "it follows the person" means for
 *      a setting kept on their registry row.
 *   5. IT IS NOT THE MESSAGE-PICTURES SETTING. Both can hold different words at once, either can be
 *      changed alone, and neither reads the other.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH CASE GO RED
 * ---------------------------------------------------------------------------------------
 *
 *   answer `MEDIA_LOAD_BY_DEFAULT` for a NULL column   → case 1, and case 5's control
 *   refuse `never` or `on-press` at the door            → case 2
 *   accept a word that is not one of the three          → case 3
 *   keep the choice only for the request that set it    → case 4
 *   make this and message_pictures one column           → case 5
 */

import type { FastifyInstance } from 'fastify'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MEDIA_LOAD_BY_DEFAULT, MEDIA_LOAD_CHOICES } from '../src/shared/mediaload.ts'
import { MESSAGE_PICTURE_CHOICES } from '../src/shared/messagepictures.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

interface OnTheWire {
  id: string
  mediaLoad?: string | null
  messagePictures?: string | null
}

/** The person's own registry row, as GET /api/participants answers it. */
async function them(): Promise<OnTheWire> {
  const reply = await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_OWNER })
  expect(reply.statusCode, reply.body).toBe(200)
  const said = reply.json() as { people: OnTheWire[] }
  return one(
    said.people.filter((p) => p.id === THE_PERSON),
    'the person’s own registry row',
  )
}

/** One PATCH through the one door, and the reply. */
async function setMediaLoad(word: string): Promise<{ status: number; said: Record<string, unknown> }> {
  const reply = await app.inject({
    method: 'PATCH',
    url: `/api/participants/person/${THE_PERSON}`,
    headers: AS_THE_OWNER,
    payload: { mediaLoad: word },
  })
  return { status: reply.statusCode, said: reply.json() as Record<string, unknown> }
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

describe('whether media a record points at are loaded is a setting of the person', () => {
  it('is nobody-having-chosen before any choice, and is not the default word', async () => {
    // THE CONTROL: the row holds no choice, so a stored word cannot pass for free below.
    expect((await them()).mediaLoad, 'nobody has chosen yet').toBe(null)
    // AND NULL IS NOT THE DEFAULT. The two are different words, so a reader handed the default
    // instead of null would be told the person chose something they did not.
    expect(MEDIA_LOAD_BY_DEFAULT).toBe('with-page')
    expect(MEDIA_LOAD_BY_DEFAULT).not.toBe(null)
  })

  it('takes all three declared words through the one door, and takes the choice away again', async () => {
    for (const which of MEDIA_LOAD_CHOICES) {
      const set = await setMediaLoad(which)
      expect(set.status, JSON.stringify(set.said)).toBe(200)
      expect((await them()).mediaLoad, `the door did not keep "${which}"`).toBe(which)
    }
    const cleared = await setMediaLoad('')
    expect(cleared.status, JSON.stringify(cleared.said)).toBe(200)
    expect((await them()).mediaLoad, 'an empty word takes the choice away').toBe(null)
  })

  it('refuses a fourth word, names all three, and writes nothing', async () => {
    // THE CONTROL: the case above left nobody having chosen, so a refusal that wrote anyway shows.
    expect((await them()).mediaLoad).toBe(null)
    const wrong = await setMediaLoad('sometimes')
    expect(wrong.status, JSON.stringify(wrong.said)).toBe(400)
    for (const word of MEDIA_LOAD_CHOICES) {
      expect(wrong.said['error'] ?? wrong.said['message'] ?? JSON.stringify(wrong.said)).toContain(word)
    }
    expect((await them()).mediaLoad, 'and nothing was written').toBe(null)
  })

  it('is read back by a browser that did not set it', async () => {
    const set = await setMediaLoad('never')
    expect(set.status).toBe(200)
    // A SECOND READ OF THE SAME ROW, which is all "another browser" can mean for a value kept on
    // the server: nothing about the answer depends on who asked.
    const read = await app.inject({
      method: 'GET',
      url: `/api/participants/person/${THE_PERSON}`,
      headers: AS_THE_OWNER,
    })
    expect(read.statusCode, read.body).toBe(200)
    const participant = (read.json() as { participant: OnTheWire }).participant
    expect(participant.mediaLoad, 'the single-participant reply carries it too').toBe('never')
    // PUT IT BACK, so a second run of this file starts from the same place.
    expect((await setMediaLoad('')).status).toBe(200)
    expect((await them()).mediaLoad).toBe(null)
  })

  it('is not the message-pictures setting: both hold different words at once', async () => {
    // THE CONTROL: both are nobody-having-chosen, so neither value below can come from the other.
    expect((await them()).mediaLoad).toBe(null)
    expect((await them()).messagePictures).toBe(null)

    const media = await setMediaLoad('never')
    expect(media.status).toBe(200)
    const pictures = await app.inject({
      method: 'PATCH',
      url: `/api/participants/person/${THE_PERSON}`,
      headers: AS_THE_OWNER,
      payload: { messagePictures: 'path' },
    })
    expect(pictures.statusCode, pictures.body).toBe(200)

    const both = await them()
    expect(both.mediaLoad, 'the media setting kept its own word').toBe('never')
    expect(both.messagePictures, 'the message setting kept its own word').toBe('path')
    // AND THE TWO VOCABULARIES DO NOT MEET: a word from one list is not a word from the other.
    for (const word of MESSAGE_PICTURE_CHOICES) {
      expect(MEDIA_LOAD_CHOICES).not.toContain(word)
    }

    // PUT BOTH BACK.
    expect((await setMediaLoad('')).status).toBe(200)
    const cleared = await app.inject({
      method: 'PATCH',
      url: `/api/participants/person/${THE_PERSON}`,
      headers: AS_THE_OWNER,
      payload: { messagePictures: '' },
    })
    expect(cleared.statusCode, cleared.body).toBe(200)
  })
})
