// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW MANY CHECKS A MERGES-ONLY WORKER RUNS AT ONCE IS AN OFFICE SETTING, WITH 2 WHEN NOBODY SET IT. Wave 13j, the round
 * after X4FMBW2bGWp-, point 1 of the check line's brief. It was the constant 3. It is kept in the office's change log on
 * `setting:checks-at-once`, as the GPU watcher's choice is, and set through the switch's own door,
 * POST /api/office/checks-in-merges-only {"checksAtOnce": n}. The switch's reading shows it in `limits` and in `says`.
 *
 * What is proved, through the doors:
 *   1. nobody has set it: the reading says 2, from the default, and its sentence says "at most 2 at once";
 *   2. the owner sets 3: the reading says 3, set here; the change row says who, from what and to what; the switch
 *      itself is left as nobody set it;
 *   3. a null takes the choice away again, and the reading is the default again;
 *   4. an agent that is neither the owner nor a secretary is refused, and so is a number that is not a whole number
 *      within CHECKS_AT_ONCE_BOUNDS, and a body with neither on nor checksAtOnce; none of them writes a row;
 *   5. a newest row this office cannot read is refused with a 500 that names it, not read as some number, and so is a
 *      row whose number is outside the bounds.
 *
 * THE BOUNDS ARE WAVE 13q's, item 17 of its list: how many checks run at once is a small whole number with bounds, read
 * from CHECKS_AT_ONCE_BOUNDS in src/shared/checks-in-merges-only.ts. Until then it was any whole number of 1 or more.
 *
 * MUTATION, RUN ON 16 OCTOBER 2026. A control run first: 5 green. Then in `theChecksAtOnce` in
 * src/server/lib/checks-in-merges-only.ts the stored number was replaced by CHECKS_AT_ONCE_BY_DEFAULT: case 2 went red.
 * Restored with cp, checked with cmp, and the control run again: green.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { CHECKS_AT_ONCE_BOUNDS } from '../src/shared/checks-in-merges-only.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_AN_AGENT = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'nib' }
const THE_DOOR = '/api/office/checks-in-merges-only'

interface TheReading {
  on: boolean
  nobodyChose: boolean
  says: string
  limits: { checksAtOnce: number; checksAtOnceFrom: string }
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

/** The setting this case changed is put back, so the next case reads the default it starts from. */
afterEach(() => {
  t.client.sqlite.prepare("DELETE FROM changes WHERE record_id = 'setting:checks-at-once'").run()
})

async function read(): Promise<{ status: number; body: TheReading & { error?: string } }> {
  const reply = await app.inject({ method: 'GET', url: THE_DOOR, headers: AS_AN_AGENT })
  return { status: reply.statusCode, body: JSON.parse(reply.body) as TheReading & { error?: string } }
}

async function post(payload: object, headers: Record<string, string> = AS_THE_OWNER): Promise<{ status: number; body: TheReading & { error?: string } }> {
  const reply = await app.inject({ method: 'POST', url: THE_DOOR, headers, payload })
  return { status: reply.statusCode, body: JSON.parse(reply.body) as TheReading & { error?: string } }
}

function rows(): { actor_id: string; field: string | null; old_value: string | null; new_value: string | null }[] {
  return t.client.sqlite
    .prepare("SELECT actor_id, field, old_value, new_value FROM changes WHERE record_id = 'setting:checks-at-once' ORDER BY rowid")
    .all() as { actor_id: string; field: string | null; old_value: string | null; new_value: string | null }[]
}

describe('how many checks run at once', () => {
  it('1: is 2, from the default, when nobody has set it', async () => {
    const reading = await read()
    expect(reading.status).toBe(200)
    expect(reading.body.limits).toMatchObject({ checksAtOnce: 2, checksAtOnceFrom: 'the default' })
    expect(reading.body.says).toContain('at most 2 at once')
    expect(rows()).toEqual([])
  })

  it('2: is what the owner sets, written down with who, from what and to what, and leaves the switch alone', async () => {
    const set = await post({ checksAtOnce: 3 })
    expect(set.status, JSON.stringify(set.body)).toBe(200)
    expect(set.body).toMatchObject({ on: false, nobodyChose: true, limits: { checksAtOnce: 3, checksAtOnceFrom: 'set here' } })
    expect(set.body.says).toContain('at most 3 at once')
    expect((await read()).body.limits).toMatchObject({ checksAtOnce: 3, checksAtOnceFrom: 'set here' })
    expect(rows()).toEqual([
      { actor_id: THE_PERSON, field: 'how many checks run at once', old_value: null, new_value: JSON.stringify({ checksAtOnce: 3, because: null }) },
    ])
  })

  it('3: goes back to the default when the choice is taken away', async () => {
    expect((await post({ checksAtOnce: 1, because: 'Synthetic: one at a time.' })).status).toBe(200)
    const taken = await post({ checksAtOnce: null })
    expect(taken.status, JSON.stringify(taken.body)).toBe(200)
    expect(taken.body.limits).toMatchObject({ checksAtOnce: 2, checksAtOnceFrom: 'the default' })
    expect(rows().map((row) => JSON.parse(row.new_value ?? 'null'))).toEqual([
      { checksAtOnce: 1, because: 'Synthetic: one at a time.' },
      { checksAtOnce: null, because: null },
    ])
  })

  it('4: refuses an agent, a number that is not a whole number within the bounds, and a body that sets nothing, and writes nothing', async () => {
    const { fewest, most } = CHECKS_AT_ONCE_BOUNDS
    expect((await post({ checksAtOnce: 3 }, AS_AN_AGENT)).status).toBe(403)
    for (const wrong of [fewest - 1, -1, most + 1, 1.5, '2']) {
      const refused = await post({ checksAtOnce: wrong })
      expect(refused.status, JSON.stringify(wrong)).toBe(400)
      expect(refused.body.error).toContain(`checksAtOnce is a whole number from ${String(fewest)} to ${String(most)}, or null.`)
    }
    const nothing = await post({ because: 'Synthetic: nothing to set.' })
    expect(nothing.status).toBe(400)
    expect(nothing.body.error).toContain('Send on, checksAtOnce or both.')
    expect(rows()).toEqual([])
    expect((await read()).body.limits).toMatchObject({ checksAtOnce: 2, checksAtOnceFrom: 'the default' })
  })

  it('5: refuses a newest row it cannot read, and names what the row holds', async () => {
    expect((await post({ checksAtOnce: 3 })).status).toBe(200)
    for (const wrong of [0, CHECKS_AT_ONCE_BOUNDS.most + 1]) {
      const row = JSON.stringify({ checksAtOnce: wrong, because: null })
      t.client.sqlite.prepare("UPDATE changes SET new_value = ? WHERE record_id = 'setting:checks-at-once'").run(row)
      const reading = await read()
      expect(reading.status, row).toBe(500)
      expect(reading.body.error).toContain(JSON.stringify(row).slice(1, -1))
      expect(reading.body.error).toContain('Nothing was guessed and nothing was changed.')
    }
  })
})
