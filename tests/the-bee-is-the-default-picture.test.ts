// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PICTURE A PARTICIPANT GETS WHEN NOBODY CHOSE ONE IS THE BEE. CRITERION M53.
 *
 * The picture chill-bee.jpg goes in the pictures folder and is the default avatar for anybody who
 * downloads Mole Office.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS MEASURES, AND WHY IT IS THE LIBRARY RATHER THAN A ROUTE
 * ---------------------------------------------------------------------------------------
 *
 * `avatarOfferedTo` is the one place that decides which picture a participant with none is offered.
 * Three callers ask it and all three get the same answer: the route the picker draws
 * (`GET /api/avatars?for=…`), the registration door that gives a new agent its picture
 * (`registerAgent` in lib/participants.ts), and the one-off script that gave the agents already in
 * an installation theirs. Measuring it here measures all three at once, with no database, no server
 * and no browser — and `tests/a-picture-is-picked-from-the-set.test.ts` measures the route over it.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * The first case reads the set of pictures on offer off the two directories, the way the picker
 * does, and checks the bee is in it before asking what is offered. Without that, "the bee is
 * offered" and "this checkout has no pictures at all" would look the same from the second case.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { AVATARS_IN_THE_CHECKOUT, moleOffice, defaultAvatarAssetId, type ParticipantRef } from '../src/shared/participants.ts'

/**
 * THE LIBRARY IS IMPORTED INSIDE A TEST AND NOT AT THE TOP, and that is not a style choice: it
 * reaches src/server/db/client.ts, and a top-level import of it under the runner would open the
 * database `.env` names — the operator's own work. tests/helpers.ts is written for this.
 */
type AvatarLib = typeof import('../src/server/lib/avatars.ts')

let t: TestDb
let avatars: AvatarLib

beforeAll(async () => {
  t = await freshDb()
  avatars = await import('../src/server/lib/avatars.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

/** A participant nobody has ever chosen a picture for still points at the drawing made from its id. */
function stillOnTheDrawing(who: ParticipantRef): string {
  return defaultAvatarAssetId(who)
}

const AN_AGENT: ParticipantRef = { kind: 'agent', id: 'builder-x' }
const ANOTHER_AGENT: ParticipantRef = { kind: 'agent', id: 'builder-y' }
const A_PERSON: ParticipantRef = { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }

describe('the bee is the picture nobody had to choose', () => {
  it('has the bee among the pictures this checkout offers, so the cases below measure something', () => {
    const onOffer = avatars.avatarsOnOffer()
    const bee = onOffer.find(
      (one) => one.set === avatars.THE_DEFAULT_PICTURE.set && one.name === avatars.THE_DEFAULT_PICTURE.name,
    )
    expect(bee, `${AVATARS_IN_THE_CHECKOUT}/png/chill-bee.png is not on offer, so nothing below is measured`).toBeDefined()
    expect(bee?.url).toBe(avatars.offeredAvatarUrl(avatars.THE_DEFAULT_PICTURE.set, avatars.THE_DEFAULT_PICTURE.name))
  })

  it('offers the bee to a fresh agent, to a second fresh agent, and to a person', () => {
    const onOffer = avatars.avatarsOnOffer()
    // ONE PICTURE FOR EVERYBODY, which is what changed. Until 6 September this was worked out from
    // the participant's id, so these three were offered three different animals.
    for (const who of [AN_AGENT, ANOTHER_AGENT, A_PERSON]) {
      const offered = avatars.avatarOfferedTo(who, stillOnTheDrawing(who), onOffer)
      expect(offered, `${who.kind}:${who.id} was offered nothing`).not.toBeNull()
      expect({ set: offered?.set, name: offered?.name }, `${who.kind}:${who.id} was offered another picture`).toEqual({
        set: avatars.THE_DEFAULT_PICTURE.set,
        name: avatars.THE_DEFAULT_PICTURE.name,
      })
    }
  })

  it('offers nothing to a participant whose picture somebody chose, so a chosen one is kept', () => {
    // A CHOSEN PICTURE IS AN UPLOADED ASSET, whose id is minted per upload and is therefore not the
    // drawing's. That is the whole of what "somebody has chosen" means here, and it is the same
    // test the picker, the registration door and the script apply.
    expect(avatars.avatarOfferedTo(AN_AGENT, 'an-uploaded-id', avatars.avatarsOnOffer())).toBeNull()
  })

  it('offers Mole Office itself nothing, because its picture is not anybody\'s to change', () => {
    // Criterion M11. The upload door has always refused it, and offering a picture that can only
    // ever be refused is a press with nothing behind it.
    expect(avatars.avatarOfferedTo(moleOffice(), stillOnTheDrawing(moleOffice()), avatars.avatarsOnOffer())).toBeNull()
  })

  it('offers nothing at all when this checkout holds no pictures, rather than an animal instead', () => {
    // NOT A HYPOTHETICAL. `avatarsOnOffer` reads two directories on every request, so an
    // installation without them offers nothing — and recommending a different picture in the
    // default's place would be a stand-in served under the default's name.
    const nothing: ReturnType<AvatarLib['avatarsOnOffer']> = []
    expect(avatars.avatarOfferedTo(AN_AGENT, stillOnTheDrawing(AN_AGENT), nothing)).toBeNull()

    // AND NOT ANY PICTURE THAT HAPPENS TO BE THERE EITHER: a set holding everything but the bee
    // offers nothing, which is what says the name is being read rather than a first entry taken.
    const withoutTheBee = avatars.avatarsOnOffer().filter((one) => one.name !== avatars.THE_DEFAULT_PICTURE.name)
    expect(withoutTheBee.length, 'the set without the bee is empty, so this case measures nothing').toBeGreaterThan(0)
    expect(avatars.avatarOfferedTo(AN_AGENT, stillOnTheDrawing(AN_AGENT), withoutTheBee)).toBeNull()
  })
})

// ================================================ and the address every screen is actually given

/**
 * THE BEE IS OFFERED AND IT IS ALSO WHAT THE SCREENS DRAW. THE SECOND HALF OF M53.
 *
 * Being offered a picture only reaches somebody who opens the picker. An agent got past that by
 * taking the picture at its registration door, so its row really holds the bee; a person's row is
 * written by the participants migration and no door gives a person a picture, so the owner's own
 * face in a fresh installation was still the pattern drawn from the owner's id. Problem `wO9DpHLtXts_`.
 *
 * `pictureShownFor` is where that is answered now: the address a screen is given for somebody who
 * has chosen nothing is the picture they are offered. It reads `avatarOfferedTo` and decides
 * nothing itself, so these cases and the ones above cannot come apart.
 */
describe('the address a screen is given for a participant', () => {
  const beeUrl = (): string =>
    avatars.offeredAvatarUrl(avatars.THE_DEFAULT_PICTURE.set, avatars.THE_DEFAULT_PICTURE.name)

  it('is the bee for a person nobody has chosen a picture for, and the same for an agent', () => {
    const onOffer = avatars.avatarsOnOffer()
    for (const who of [A_PERSON, AN_AGENT, ANOTHER_AGENT]) {
      expect(
        avatars.pictureShownFor(who, stillOnTheDrawing(who), onOffer),
        `${who.kind}:${who.id} is still drawn with the pattern made from its id`,
      ).toBe(beeUrl())
    }
  })

  it('is the picture the row holds once somebody has chosen one', () => {
    // A CHOSEN PICTURE IS KEPT. The row points at an uploaded asset, so the address is that asset's
    // and the bee is nowhere in the answer.
    const chosen = avatars.pictureShownFor(A_PERSON, 'an-uploaded-id', avatars.avatarsOnOffer())
    expect(chosen).toBe('/api/assets/an-uploaded-id')
    expect(chosen).not.toBe(beeUrl())
  })

  it('is the drawing for Mole Office itself, whose picture is not anybody’s to change', () => {
    // Criterion M11, and it is the same answer `avatarOfferedTo` gives, read through one function.
    expect(avatars.pictureShownFor(moleOffice(), stillOnTheDrawing(moleOffice()), avatars.avatarsOnOffer())).toBe(
      `/api/assets/${stillOnTheDrawing(moleOffice())}`,
    )
  })

  it('is the drawing when this checkout holds no pictures, rather than an address with nothing behind it', () => {
    const nothing: ReturnType<AvatarLib['avatarsOnOffer']> = []
    expect(avatars.pictureShownFor(A_PERSON, stillOnTheDrawing(A_PERSON), nothing)).toBe(
      `/api/assets/${stillOnTheDrawing(A_PERSON)}`,
    )
  })
})
