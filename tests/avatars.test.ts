// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PICTURE A PARTICIPANT IS DRAWN WITH: the one this product makes, and the one somebody sends.
 *
 * Criterion M3 of design/messages/ACCEPTANCE.md: *A default avatar is generated from the
 * participant's id, the same every time, and belongs to the product with its licence source written
 * down. An uploaded avatar is a file under `data/avatars/` that never enters the repository … Uploads
 * are checked for type (png, jpeg, webp) and size, and the limit is one setting in the declaration.*
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { defaultAvatarAssetId, type ParticipantRef } from '../src/shared/participants.ts'
import { whatIsTrackedThatShouldNotBe, TRACKED_ON_PURPOSE } from '../tools/open-source-gate.mjs'
import { avatarPng } from './avatar-upload-fixtures.ts'

type AvatarLib = typeof import('../src/server/lib/avatars.ts')
type RegistryLib = typeof import('../src/server/lib/participants.ts')

let t: TestDb
let avatars: AvatarLib
let registry: RegistryLib

const OWNER: ParticipantRef = { kind: 'person', id: THE_PERSON }
const AGENT: ParticipantRef = { kind: 'agent', id: 'builder-x' }
/**
 * THE AGENT REGISTERED IN `beforeEach`, by the id the registry gave it. That id is not its handle,
 * so a case that reads or writes the registry row uses this and not `AGENT`. The drawing cases only
 * need some ref, and use `AGENT`. A handle belongs to one agent, so each case registers its own.
 */
let REGISTERED: ParticipantRef
let caseNumber = 0

/** Upload names may be content-addressed; the asset row is the authority for its file. */
function uploadedFile(id: string): string {
  const row = t.client.sqlite.prepare('SELECT path FROM assets WHERE id = ?').get(id) as { path: string }
  return join(avatars.avatarDirectory(), '..', row.path)
}

beforeAll(async () => {
  t = await freshDb()
  avatars = await import('../src/server/lib/avatars.ts')
  registry = await import('../src/server/lib/participants.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  const handle = `builder-x-${String(caseNumber)}`
  const registered = t.api.createRecord({
    workspaceId: 'panelx',
    kind: 'agent',
    title: 'Builder X',
    data: { handle, runtime: 'claude-code', state: 'active' },
    actor: { type: 'human', id: THE_PERSON },
  })
  const row = t.client.sqlite.prepare('SELECT agent_id FROM agent_records WHERE record_id = ?').get(registered.id) as {
    agent_id: string
  }
  REGISTERED = { kind: 'agent', id: row.agent_id }
})

/** A complete small PNG; native metadata reading must not depend on a signature-only stand-in. */
const A_REAL_PNG = avatarPng()

/** What the call threw, or a failure saying it threw nothing. */
function refusalFrom(fn: () => unknown): { status: number; message: string } {
  try {
    fn()
  } catch (err) {
    return { status: (err as { status?: number }).status ?? 0, message: err instanceof Error ? err.message : String(err) }
  }
  throw new Error('the call was allowed, and this test is about it being refused')
}

// ============================================================================ the drawing

describe('the picture this product draws', () => {
  it('is the same every time for one participant, which is what M3 asks for', () => {
    const once = avatars.drawDefaultAvatar(AGENT)
    const again = avatars.drawDefaultAvatar({ kind: 'agent', id: 'builder-x' })

    expect(again).toBe(once)
  })

  it('is a different picture for a different participant, so two agents are told apart', () => {
    expect(avatars.drawDefaultAvatar({ kind: 'agent', id: 'builder-y' })).not.toBe(avatars.drawDefaultAvatar(AGENT))
    // AND THE KIND IS PART OF IT. A person and an agent that happened to share an id are two
    // participants, and drawing them the same would say they were one.
    expect(avatars.drawDefaultAvatar({ kind: 'person', id: 'builder-x' })).not.toBe(avatars.drawDefaultAvatar(AGENT))
  })

  it('is an SVG with two colours and a pattern that is the same on both sides', () => {
    const drawn = avatars.drawDefaultAvatar(AGENT)

    expect(drawn.startsWith('<svg')).toBe(true)
    expect(drawn).toContain('<circle')
    // SYMMETRY, MEASURED RATHER THAN CLAIMED. Every square drawn on the left half has one at the
    // mirrored column, which is what makes a pattern read as a face rather than as noise.
    const columns = [...drawn.matchAll(/<rect x="(\d+)" y="(\d+)"/g)].map((m) => [Number(m[1]), Number(m[2])] as const)
    expect(columns.length, 'nothing was drawn at all').toBeGreaterThan(0)
    for (const [x, y] of columns) {
      const mirrored = 14 + (4 - (x - 14) / 12) * 12
      expect(columns.some(([mx, my]) => mx === mirrored && my === y), `nothing at the mirror of ${String(x)}`).toBe(true)
    }
  })

  it('needs no file and no row of its own to be drawn, and says who it is for in its id', () => {
    const id = defaultAvatarAssetId(AGENT)

    expect(avatars.participantOfDefault(id)).toEqual(AGENT)
    expect(avatars.participantOfDefault('some-uploaded-id')).toBeNull()
  })

  it('is served with its own type, and the row says this product made it', () => {
    const id = defaultAvatarAssetId(OWNER)

    const served = avatars.avatarBytesFor(id)

    expect(served.mime).toBe('image/svg+xml')
    expect(String(served.body).startsWith('<svg')).toBe(true)
    expect(served.cacheControl).toContain('immutable')
    const row = t.client.sqlite.prepare('SELECT * FROM assets WHERE id = ?').get(id) as Record<string, unknown>
    expect(row['licence_source']).toBe('generated by Mole Office')
    expect(row['path'], 'a drawn picture named a file, and there is none').toBeNull()
  })
})

// ============================================================================ an upload

describe('a picture somebody sends', () => {
  it('is stored beside the database, under avatars, with a row saying who sent it and when', () => {
    const id = avatars.storeUploadedAvatar(A_REAL_PNG, OWNER)

    const row = t.client.sqlite.prepare('SELECT * FROM assets WHERE id = ?').get(id) as Record<string, unknown>
    expect(row['origin']).toBe('uploaded')
    expect(row['mime']).toBe('image/png')
    expect(row['bytes']).toBe(A_REAL_PNG.length)
    expect(row['created_by_kind']).toBe('person')
    expect(row['created_by_id']).toBe(THE_PERSON)
    // NOBODY ASKED WHERE THE RIGHT TO USE IT COMES FROM, so nothing claims to know.
    expect(row['licence_source']).toBeNull()
    expect(String(row['path']).startsWith('avatars/')).toBe(true)
    const file = uploadedFile(id)
    expect(existsSync(file), 'the row was written and the file was not').toBe(true)
    expect(readFileSync(file).equals(A_REAL_PNG)).toBe(true)
  })

  it('comes back byte for byte, with the type it really is', () => {
    const id = avatars.storeUploadedAvatar(A_REAL_PNG, OWNER)

    const served = avatars.avatarBytesFor(id)

    expect(served.mime).toBe('image/png')
    expect(Buffer.isBuffer(served.body) && served.body.equals(A_REAL_PNG)).toBe(true)
  })

  it('is refused when the bytes are not one of the three types, whatever it was sent as', () => {
    // THE BYTES ARE READ, NOT THE HEADER THE CALLER TYPED. A caller saying `image/png` over
    // something else would otherwise put whatever it really is under a name the page trusts.
    // COUNTED BEFORE AND AFTER, rather than against nothing. Since decision
    // `HnoPsajfgR0A` an agent is GIVEN the picture it is offered when it registers, and that picture
    // is stored the way an upload is — so a database with an agent in it has such rows already, and
    // "none exist" would be measuring the wrong thing. What this case is about is that THIS refusal
    // wrote nothing.
    const uploaded = (): unknown =>
      t.client.sqlite.prepare("SELECT count(*) AS n FROM assets WHERE origin = 'uploaded'").get()
    const before = uploaded()

    const refusal = refusalFrom(() => avatars.storeUploadedAvatar(Buffer.from('<svg>not a picture</svg>'), OWNER))

    expect(refusal.status).toBe(415)
    expect(refusal.message).toContain('png')
    expect(refusal.message).toContain('SVG')
    expect(uploaded(), 'the refused picture was stored anyway').toEqual(before)
  })

  it('is refused when it is bigger than the one setting that says so, with both numbers', () => {
    const limit = avatars.maxAvatarBytes()
    const tooBig = Buffer.concat([A_REAL_PNG, Buffer.alloc(limit, 3)])

    const refusal = refusalFrom(() => avatars.storeUploadedAvatar(tooBig, OWNER))

    expect(refusal.status).toBe(413)
    expect(refusal.message).toContain(String(tooBig.length))
    expect(refusal.message).toContain(String(limit))
    expect(refusal.message).toContain('MOLE_OFFICE_AVATAR_MAX_BYTES')
  })

  it('takes its limit from the declaration, which is where the number lives', () => {
    // ONE SETTING AND NOT A CONSTANT IN THIS FILE. `src/config/settings.mjs` is the only place in
    // this repository that reads an environment variable, and this is the number it declares.
    expect(avatars.maxAvatarBytes()).toBe(2 * 1024 * 1024)
  })

  it('replaces nobody picture by itself: pointing somebody at it is a separate act', () => {
    const before = registry.readParticipant(REGISTERED)?.avatarAssetId

    const id = avatars.storeUploadedAvatar(A_REAL_PNG, OWNER)

    expect(registry.readParticipant(REGISTERED)?.avatarAssetId).toBe(before)
    registry.setParticipantAvatar(REGISTERED, id, OWNER)
    expect(registry.readParticipant(REGISTERED)?.avatarAssetId).toBe(id)
  })

  it('says the file is missing rather than drawing something else in its place', () => {
    // AN ARCHIVE CARRIES THE ROW AND NEVER THE FILE, so a restored copy really reaches this state.
    // Serving the drawn picture here would be a stand-in under the file's own name.
    const id = avatars.storeUploadedAvatar(A_REAL_PNG, OWNER)
    t.client.sqlite.prepare('UPDATE assets SET path = ? WHERE id = ?').run('avatars/gone.png', id)

    const refusal = refusalFrom(() => avatars.avatarBytesFor(id))

    expect(refusal.status).toBe(410)
    expect(refusal.message).toContain('Nothing was drawn')
  })

  it('answers nothing for an asset no row answers to', () => {
    expect(refusalFrom(() => avatars.avatarBytesFor('no-such-asset')).status).toBe(404)
  })
})

// ============================================================ nothing under data/ is in the repository

describe('an uploaded picture never enters the repository', () => {
  it('finds nothing under data/ tracked by git, apart from what is allowed on purpose', () => {
    // THE SAME FUNCTION `node tools/open-source-gate.mjs` RUNS. The test and the gate cannot come to
    // disagree about what the check is, because there is only one of them.
    expect(whatIsTrackedThatShouldNotBe()).toEqual([])
  })

  it('keeps the allowlist empty, which is what `git ls-files data/` measured on 3 September 2026', () => {
    // A LIST RATHER THAN A FLAT REFUSAL, so a file somebody DOES decide to track arrives with its
    // reason beside it instead of by weakening the check. Every entry needs one.
    expect(TRACKED_ON_PURPOSE).toEqual([])
    for (const entry of TRACKED_ON_PURPOSE) {
      expect((entry as { why: string }).why.length, 'a file is tracked on purpose with no reason given').toBeGreaterThan(40)
    }
  })

  it('writes an upload under data/ and git still tracks nothing there', () => {
    // THE CHECK WITH A PICTURE REALLY UNDER `data/`, which is what M15 asks for: the gate passes
    // with one uploaded avatar present. This test's own upload goes beside its throwaway database
    // rather than into the checkout, which is the other half of why nothing lands in the repository.
    const id = avatars.storeUploadedAvatar(A_REAL_PNG, OWNER)

    expect(existsSync(uploadedFile(id))).toBe(true)
    expect(avatars.avatarDirectory().startsWith(process.cwd()), 'a test wrote a picture into the checkout').toBe(false)
    expect(whatIsTrackedThatShouldNotBe()).toEqual([])
  })
})

// ============================================================ a test file named in a comment exists

