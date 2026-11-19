// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRESETS `GET /api/kinds/context_bundle` PUBLISHES ARE THE PRESETS A BUNDLE IS ACCEPTED WITH.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `l2FKzRcOdhzf`. `BUNDLE_PRESETS` in src/shared/bundles.ts declares seven presets and the
 * bundle routes refuse against all seven. The `context_bundle` kind published a union of six,
 * typed out by hand, missing `owner_governance` — the governance pack, added on 27 August 2026.
 * So an agent building a bundle from `GET /api/kinds`, which is the way this project tells every
 * agent to build a record, could not learn the seventh preset existed, and filing one with it was
 * refused by a schema narrower than the check.
 *
 * That breaks the rule the whole schema layer rests on: the declaration that ANSWERS a caller is
 * the declaration that CHECKS its write, so the two cannot drift. Here they had drifted, and
 * nothing failed.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. The set published on the kind is exactly `BUNDLE_PRESET_NAMES`. Not a superset, not a
 *      subset, and read out of the served type rather than typed out here — a test holding its own
 *      copy of the list is a third place for the same fact.
 *   2. Every published preset is accepted on a write, `owner_governance` included.
 *   3. A preset that is not one of them is refused, and the refusal names every accepted word.
 *   4. The bundle route's own refusal names the same words, so a caller learns one list wherever
 *      it meets the refusal.
 *
 * Proved by mutation with a control run of this file first: putting the six-preset union back in
 * src/shared/kinds.ts turns cases 1, 2 and 3 red.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { BUNDLE_PRESET_NAMES } from '../src/shared/bundles.ts'

const HEADERS = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)
afterAll(async () => {
  await app.close()
  t.close()
})

async function get(url: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url, headers: HEADERS })
  return { status: res.statusCode, body: res.json() }
}
async function fileABundle(preset: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HEADERS,
    payload: {
      kind: 'context_bundle',
      title: `A copy of this project for somebody else — ${preset}`,
      data: { scope: 'project', preset },
    },
  })
  return { status: res.statusCode, body: res.json() }
}

/** The words the served `preset` type is made of, read out of the type rather than out of a list. */
async function presetsPublishedOnTheKind(): Promise<string[]> {
  const served = await get('/api/kinds/context_bundle')
  expect(served.status, JSON.stringify(served.body)).toBe(200)
  const fields = served.body.kind.fields as { key: string; type: string }[]
  const preset = fields.find((one) => one.key === 'preset')
  expect(preset, 'the context bundle kind has no `preset` field at all').toBeDefined()
  return [...String(preset?.type).matchAll(/'([^']+)'/g)].map((m) => m[1] as string)
}

/** Every word in one refusal message, however the reply nests its errors. */
function refusalWords(body: unknown): string {
  return JSON.stringify(body)
}

describe('the presets a bundle publishes are the presets it takes', () => {
  it('publishes exactly the presets the product declares', async () => {
    expect(await presetsPublishedOnTheKind()).toEqual([...BUNDLE_PRESET_NAMES])
  })

  it('accepts every one of them on a write, the governance pack included', async () => {
    // THE CONTROL FOR THE CASE BELOW. A refusal test proves nothing if everything is refused.
    for (const preset of BUNDLE_PRESET_NAMES) {
      const filed = await fileABundle(preset)
      expect(filed.status, `preset "${preset}": ${JSON.stringify(filed.body)}`).toBe(201)
    }
    expect(BUNDLE_PRESET_NAMES, 'the governance pack is the one that was missing').toContain('owner_governance')
  })

  it('refuses a preset that is not one of them, naming every accepted word', async () => {
    const filed = await fileABundle('owner_governence')
    expect(filed.status, JSON.stringify(filed.body)).toBe(400)
    const said = refusalWords(filed.body)
    for (const preset of BUNDLE_PRESET_NAMES) {
      expect(said, `the refusal does not name "${preset}"`).toContain(preset)
    }
  })

  it('says the same words when the bundle route refuses one', async () => {
    // ONE LIST WHEREVER THE REFUSAL IS MET. The two routes are different code and the same set.
    const preview = await get('/api/bundles/preview?preset=owner_governence')
    expect(preview.status).toBe(400)
    const said = refusalWords(preview.body)
    for (const preset of BUNDLE_PRESET_NAMES) {
      expect(said, `the bundle route's refusal does not name "${preset}"`).toContain(preset)
    }
  })
})
