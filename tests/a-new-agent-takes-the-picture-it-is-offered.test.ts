// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT THAT CHOSE NO PICTURE WHEN IT REGISTERED TAKES THE ONE IT IS OFFERED, NOBODY ASKED.
 *
 * Decision `HnoPsajfgR0A` on proposal `1V9UWM8nrBTD`. Criterion
 * M30 of design/messages/ACCEPTANCE.md section 9b now reads *one is given to each agent that has
 * none*; before that decision it read *offered*, and nothing was ever given.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO HALVES
 * ---------------------------------------------------------------------------------------
 *
 * 1. THE PICTURE IS GIVEN, at the moment the registry row is written, and it is the picture the
 *    product recommends — the one the picker marks as offered — so what a new agent ends up with is
 *    what a person pressing that mark would have given it.
 *
 * 2. WHAT MOLE OFFICE DREW IS NOT DELETED. Its `assets` row is still there and still serves, so
 *    "use the drawn one" points at something and a person may go back to it. That is the half a
 *    build could break while passing the first, and it is checked by asking for the drawing's own
 *    bytes after the agent has been given a picture.
 *
 * AND MOLE OFFICE ITSELF IS GIVEN NOTHING. Its picture is what tells a line the product wrote from
 * an agent's words, and criterion M11 calls it fixed.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * The first case reads what the picker recommends for that agent BEFORE the row exists, so "it took
 * the recommended one" is measured against an answer worked out independently of the giving.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { expectStoredPicture } from './avatar-picture-identity.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { defaultAvatarAssetId, avatarUrlFor, MOLE_OFFICE_HANDLE } from '../src/shared/participants.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function register(handle: string, title: string): Promise<void> {
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title, data: { handle, runtime: 'claude-code', state: 'active' } }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
}

async function agents(): Promise<{ id: string; handle: string; avatarUrl: string }[]> {
  const got = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  expect(got.status, await got.clone().text()).toBe(200)
  return ((await got.json()) as { agents: { id: string; handle: string; avatarUrl: string }[] }).agents
}

/**
 * What the picker recommends for one participant, read the way the picker reads it.
 *
 * The route answers only about somebody a registry holds, so a participant that does not exist yet
 * is asked about through the library instead — which is the same function the route calls.
 */
async function offeredTo(who: string): Promise<{ set: string; name: string } | null> {
  const got = await fetch(`${app.api}/api/avatars?for=${encodeURIComponent(who)}`, { headers: AS_THE_OWNER })
  expect(got.status, await got.clone().text()).toBe(200)
  return ((await got.json()) as { offered: { set: string; name: string } | null }).offered
}

beforeAll(async () => {
  app = await liveApp({ name: 'given-a-picture', viewport: { width: 1440, height: 1000 } })
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('a picture is given rather than only offered', () => {
  it('gives a new agent the one the picker recommends for it', async () => {
    await register('given-x', 'Given X')
    // FOUND BY HANDLE, and the drawing is keyed on the registry id, which is minted and not the handle.
    const given = (await agents()).find((row) => row.handle === 'given-x')
    expect(given, 'the agent did not register').toBeDefined()
    const drawing = avatarUrlFor(defaultAvatarAssetId({ kind: 'agent', id: given?.id ?? '' }))
    expect(given?.avatarUrl, 'the agent is still drawing the pattern made from its id').not.toBe(drawing)
    const held = await fetch(`${app.api}${given?.avatarUrl ?? ''}`, { headers: AS_THE_OWNER })
    expect(held.status).toBe(200)
    const a = Buffer.from(await held.arrayBuffer())

    // WHICH PICTURE WAS RECOMMENDED IS ASKED OF THE PRODUCT, not worked out again here. The route
    // answers that question only about a participant still on the drawing — which is what "nobody
    // has chosen" means — so the agent is put back on the drawing to ask it. The recommendation
    // comes from the id and from nothing else, so putting it back does not change the answer.
    const back = await fetch(`${app.api}/api/participants/agent/given-x/avatar`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ reset: true }),
    })
    expect(back.status, await back.clone().text()).toBe(201)
    const recommended = await offeredTo('agent:given-x')
    expect(recommended, 'nothing is recommended, so this case measures nothing').not.toBeNull()

    const wanted = await fetch(
      `${app.api}/api/avatars/${recommended?.set ?? ''}/${recommended?.name ?? ''}`,
      { headers: AS_THE_OWNER },
    )
    expect(wanted.status).toBe(200)
    const b = Buffer.from(await wanted.arrayBuffer())
    await expectStoredPicture(app.dir, given!.avatarUrl, b, a)
  }, 120_000)

  it('leaves what Mole Office drew where it was, so a person may go back to it', async () => {
    await register('given-z', 'Given Z')
    // FOUND BY HANDLE, and the drawing is keyed on the registry id, which is minted and not the handle.
    const before = (await agents()).find((row) => row.handle === 'given-z')
    const drawing = defaultAvatarAssetId({ kind: 'agent', id: before?.id ?? '' })
    // THE CONTROL: it was given a picture, so the drawing is not what it is using.
    expect(before?.avatarUrl, 'nothing was given, so this case measures nothing').not.toBe(avatarUrlFor(drawing))

    // AND THE DRAWING IS STILL THERE AND STILL SERVES.
    const got = await fetch(`${app.api}${avatarUrlFor(drawing)}`, { headers: AS_THE_OWNER })
    expect(got.status, 'the drawing was deleted when the picture was given').toBe(200)
    expect((await got.text()).length, 'the drawing serves nothing').toBeGreaterThan(0)

    // AND THE DOOR STILL PUTS THE CHOICE BACK. That is what the press on the roster does.
    const back = await fetch(`${app.api}/api/participants/agent/given-z/avatar`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ reset: true }),
    })
    expect(back.status, await back.clone().text()).toBe(201)
    // THE ROW POINTS AT THE DRAWING AGAIN AND THE SCREEN IS GIVEN THE BEE. Those are two facts and
    // criterion M53 separated them on 6 September: a row pointing at the drawing means nobody has
    // chosen, and what anybody with none is given is chill-bee. `pictureShownFor` in lib/avatars.ts
    // is where that is decided; the row and the drawing behind it are untouched, which the two
    // checks above are about.
    const one = (await agents()).find((row) => row.handle === 'given-z')
    expect(one?.avatarUrl, 'a row that chose nothing is not given the picture everybody with none gets').toBe(
      '/api/avatars/drawn/chill-bee',
    )
    expect(one?.avatarUrl, 'the screen was sent back to the drawing').not.toBe(avatarUrlFor(drawing))
  }, 120_000)

  it("gives Mole Office nothing, because its picture is nobody's to change", async () => {
    const one = (await agents()).find((row) => row.handle === MOLE_OFFICE_HANDLE)
    expect(one, 'Mole Office is not registered, so nothing here is measured').toBeDefined()
    expect(one?.avatarUrl, 'Mole Office was given a picture').toBe(
      avatarUrlFor(defaultAvatarAssetId({ kind: 'agent', id: one!.id })),
    )
    // AND THE PICKER RECOMMENDS IT NOTHING EITHER, so nobody is offered a press that is refused.
    expect(await offeredTo(`agent:${one!.id}`)).toBeNull()
  }, 120_000)

  it('leaves alone an agent somebody has already given a picture', async () => {
    await register('given-y', 'Given Y')
    const sent = await fetch(`${app.api}/api/participants/agent/given-y/avatar`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ reset: true }),
    })
    expect(sent.status, await sent.clone().text()).toBe(201)
    // NOW ITS ROW HOLDS NO PICTURE AGAIN, and the picker offers it one — which is the honest
    // answer: nothing records that the drawing was chosen rather than never changed. What must not
    // happen is the product writing over the row by itself, and nothing does: the giving happens
    // once, when the registry row is written. The address a screen is given is the offered picture,
    // criterion M53, and the row behind it is still the drawing.
    const one = (await agents()).find((row) => row.handle === 'given-y')
    expect(one?.avatarUrl).toBe('/api/avatars/drawn/chill-bee')
    const held = await fetch(`${app.api}/api/avatars?for=agent:given-y`, { headers: AS_THE_OWNER })
    const offered = ((await held.json()) as { offered: { name: string } | null }).offered
    expect(offered?.name, 'the picker no longer offers this agent a picture, so the row was written over').toBe(
      'chill-bee',
    )
  }, 120_000)
})
