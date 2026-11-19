// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION P80: THE WORLD'S OWN PAGE SAYS WHY ITS FACES DIFFER, IN THE WORDS OF WHAT ACTUALLY HAPPENS.
 *
 * Criterion P80 of design/permissions/ACCEPTANCE.md. The faces in a test world looked randomly made, like
 * generated avatars, and nothing said why. A copied world has the database and
 * not the picture files, and the world's own page (C33) says so.
 *
 * MEASURED FIRST, ON A REAL UPLOADED PICTURE IN A COPIED WORLD'S CONDITION. src/server/lib/avatars.ts
 * has two cases and they are not the same:
 *
 *   - a face Mole Office DREW is worked out from the participant, not stored, so it still appears;
 *   - a picture somebody UPLOADED names a file a copy did not bring, and `avatarBytesFor` REFUSES
 *     LOUDLY with a 410 — "Nothing was drawn in its place" (lines 189-196). It does not quietly
 *     draw a generated face over somebody's own picture.
 *
 * SO THE SENTENCE MUST SAY THE REFUSAL, and this test holds it to the measurement rather than to a
 * memory of it. THE MUTATION IT IS WRITTEN AGAINST: change `THE_FACES_SENTENCE` to "faces fall back
 * to generated ones" and the first case fails, naming the mismatch. Control run first.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_FACES_SENTENCE } from '../src/shared/worldcopy.ts'
import { avatarPng } from './avatar-upload-fixtures.ts'

type AvatarsLib = typeof import('../src/server/lib/avatars.ts')

let t: TestDb
let avatars: AvatarsLib

beforeEach(async () => {
  t = await freshDb()
  avatars = await import('../src/server/lib/avatars.ts')
})

afterEach(() => {
  t.close()
})

/** A complete small PNG, kept unchanged by the reviewed avatar upload policy. */
const A_PNG = avatarPng()

/** What the sentence may not claim, because the measurement says the opposite. */
const A_CLAIM_OF_A_FALLBACK = /fall(s|) back|falls back|generated face|drawn in its place|draws a face/i

describe('what a copied world really does with an uploaded picture', () => {
  it('refuses loudly rather than drawing a face in its place', () => {
    const id = avatars.storeUploadedAvatar(A_PNG, { kind: 'person', id: THE_TEST_OFFICES_OWNER.id })
    const row = t.client.sqlite.prepare('SELECT path FROM assets WHERE id = ?').get(id) as { path: string }
    const file = join(dirname(resolve(t.file)), row.path)
    expect(existsSync(file), 'the upload wrote no file to remove').toBe(true)
    rmSync(file, { force: true })

    let refused: unknown = null
    try {
      avatars.avatarBytesFor(id)
    } catch (err) {
      refused = err
    }
    expect(refused, 'the missing uploaded picture was served anyway').not.toBeNull()
    expect(String(refused)).toContain('Nothing was drawn in its place')
    expect(String(refused)).toMatch(/410|not there/)
  })

  it('says the refusal in the sentence, and never the fallback the measurement rules out', () => {
    expect(THE_FACES_SENTENCE, `the sentence claims a fallback the measurement rules out: ${THE_FACES_SENTENCE}`).not.toMatch(
      A_CLAIM_OF_A_FALLBACK,
    )
    expect(THE_FACES_SENTENCE).toContain('not copied into this world')
    expect(THE_FACES_SENTENCE).toMatch(/reports it missing|does not draw a face in its place/)
    expect(THE_FACES_SENTENCE, 'the sentence does not say that a drawn face still appears').toMatch(
      /drew still appears|worked out from the citizen/,
    )
  })
})
