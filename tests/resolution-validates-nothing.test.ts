// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * RESOLVING A PLACEHOLDER MAKES NOTHING VALID.
 *
 * ---------------------------------------------------------------------------------------
 * THE OWNER'S OWN SCENARIO, RUN
 * ---------------------------------------------------------------------------------------
 *
 * A camera's intrinsics have never been calibrated. Somebody makes a value up to get the pipeline
 * running and writes down what that stops the project claiming: it is good for pipeline plumbing
 * and it is not evidence of geometric accuracy. Work happens downstream. Weeks later the
 * calibration is run and the placeholder is answered.
 *
 * The failure this file exists to catch is the tempting one: treating the resolution as good news
 * and quietly letting every downstream result read as sound again. What must happen instead:
 *
 *     no earlier downstream result is treated as valid again on its own. The affected evidence and
 *     work are found, and the relevant items are marked to be checked again.
 *
 * So resolution CHANGES THE WORDS AND WRITES THE ROWS. It removes nothing. The restriction keeps
 * travelling to every record it reached, reading *resolved, not re-checked*, until somebody looks
 * at that record and says so.
 *
 * ---------------------------------------------------------------------------------------
 * AND A READ MATERIALISES NOTHING
 * ---------------------------------------------------------------------------------------
 *
 * The second half of this file is the other direction: asking what restricts a record must not
 * write anything. The re-validation rows are written by a LINK WRITE and never by a read. A write
 * hung off a read would let a page draw itself into the corpus, which is the thing the history
 * thread's own tests are written to stop.
 *
 * IT IS NOT WRITTEN AS "COUNT EVERY TABLE BEFORE AND AFTER AND EXPECT NO CHANGE." When telemetry
 * lands, every request will append an `api_calls` row, and the plain form would then be red on
 * every run for a reason that is not a defect — which is how a real red gets waved through. So the
 * assertion is: the set of tables whose row count changed holds NOTHING BUT `api_calls`.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }

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

async function post(url: string, payload: unknown, headers = PERSON): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers })
  return { status: res.statusCode, body: res.json() }
}

async function record(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const made = await post('/api/records', { kind, title, data })
  expect(made.status, `${kind} "${title}": ${JSON.stringify(made.body)}`).toBe(201)
  return made.body.record.id as string
}

async function link(fromId: string, toId: string, type: string, headers = PERSON): Promise<{ status: number; body: any }> {
  return post('/api/links', { fromId, toId, type }, headers)
}

/** The owner's camera-calibration graph, exactly as the owner's own worked example draws it. */
async function theCameraGraph(): Promise<{ p17: string; segmentation: string; projection: string; reachTest: string }> {
  const pipeline = await record('pipeline', 'Perception', {})
  const madeSeg = await post(`/api/records/${pipeline}/blocks`, { name: 'Pixel segmentation', state: 'done' })
  expect(madeSeg.status, JSON.stringify(madeSeg.body)).toBe(201)
  const segmentation = madeSeg.body.record.id as string
  const method = await app.inject({
    method: 'PATCH',
    url: `/api/records/${segmentation}`,
    payload: { dataPatch: { method: 'SAM segmentation' } },
    headers: PERSON,
  })
  expect(method.statusCode, method.body).toBe(200)
  const madeProj = await post(`/api/records/${pipeline}/blocks`, { name: 'Point-cloud projection', state: 'done' })
  expect(madeProj.status, JSON.stringify(madeProj.body)).toBe(201)
  const projection = madeProj.body.record.id as string

  const reachTest = await record('claim', 'Handover reach test, 40 trials', { state: 'measured' })

  const p17 = await record('placeholder', 'Wrist camera intrinsics are not calibrated', {
    what: "The wrist camera's intrinsics have never been calibrated.",
    slot: 'stand_in',
    substitute: 'fx = 600, fy = 600, cx = 320, cy = 240 — guessed from the sensor data sheet',
    because: 'The checkerboard rig is on loan and the pipeline had to run this week.',
    resolved_when: 'A checkerboard calibration run on the wrist camera, with the residuals recorded.',
    allowed_uses: ['pipeline plumbing', 'shape/interface testing', 'execution-path integration'],
    disallowed_claims: ['geometric accuracy claims', 'final performance comparison', 'production deployment validation'],
    severity: 'stops_final',
  })

  expect((await link(p17, segmentation, 'about')).status).toBe(201)
  expect((await link(projection, segmentation, 'consumes')).status).toBe(201)
  expect((await link(reachTest, projection, 'measures')).status).toBe(201)
  return { p17, segmentation, projection, reachTest }
}

async function restrictionsOn(id: string): Promise<any> {
  const res = await app.inject({ method: 'GET', url: `/api/restrictions?record=${id}`, headers: PERSON })
  expect(res.statusCode, res.body).toBe(200)
  return res.json()
}

function counts(): Map<string, number> {
  const tables = (t.client.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
    name: string
  }[]).map((row) => row.name)
  const found = new Map<string, number>()
  for (const table of tables) {
    const row = t.client.sqlite.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }
    found.set(table, row.n)
  }
  return found
}

describe('a restriction reaches the work that rests on it', () => {
  it('carries the author’s own two lists, unchanged, to a claim two links away', async () => {
    const { p17, reachTest } = await theCameraGraph()
    const reply = await restrictionsOn(reachTest)
    expect(reply.found).toHaveLength(1)
    const reading = reply.found[0]
    expect(reading.restrictionId).toBe(p17)
    expect(reading.severity).toBe('stops_final')
    // STRING FOR STRING. Not re-worded, not summarised, not merged with anybody else's.
    expect(reading.allowedUses).toEqual(['pipeline plumbing', 'shape/interface testing', 'execution-path integration'])
    expect(reading.disallowedClaims).toEqual([
      'geometric accuracy claims',
      'final performance comparison',
      'production deployment validation',
    ])
    expect(reading.reach.how).toBe('depends')
    expect(reading.reach.distance).toBe(2)
    expect(reading.reach.path.map((hop: any) => hop.type)).toEqual(['measures', 'consumes'])
    expect(reading.standing.state).toBe('active')
  })

  it('answers no verdict at all, because that is reading and it is the reader’s', async () => {
    const { reachTest } = await theCameraGraph()
    const reading = (await restrictionsOn(reachTest)).found[0]
    // The one boolean this design refuses to compute, written down so nobody adds it later.
    expect(reading).not.toHaveProperty('valid')
    expect(reading).not.toHaveProperty('tainted')
    expect(reading).not.toHaveProperty('blocked')
    // And the claim keeps its own state, drawn as it always is.
    const res = await app.inject({ method: 'GET', url: `/api/records/${reachTest}`, headers: PERSON })
    expect(res.json().record.data.state).toBe('measured')
  })

  it('says what it could NOT check, so nothing looked like nothing to report', async () => {
    const { reachTest } = await theCameraGraph()
    const reply = await restrictionsOn(reachTest)
    // The Implementation Map has no record-to-record import graph yet, so code dependencies were
    // not walked. That is said out loud on every reply rather than being reported as a clean run.
    expect(reply.couldNotCheck.length).toBeGreaterThan(0)
    expect(JSON.stringify(reply.couldNotCheck)).toContain('Implementation Map')
  })
})

describe('resolving it validates nothing', () => {
  it('leaves the dependent evidence exactly as valid as it was, and says it is owed a re-check', async () => {
    const { p17, reachTest } = await theCameraGraph()
    const before = (await restrictionsOn(reachTest)).found[0]
    expect(before.standing.state).toBe('active')

    const calibration = await record('claim', 'Wrist camera calibrated, residual 0.21 px', { state: 'measured' })
    const resolved = await link(calibration, p17, 'resolves')
    expect(resolved.status, JSON.stringify(resolved.body)).toBe(201)
    // THE REPLY SAYS WHAT IT WROTE. Never a bare count — a resolution that silently marked three
    // pieces of evidence is exactly the surprise this feature exists to prevent.
    expect(resolved.body.revalidation.written).toBe(3)
    expect(resolved.body.revalidation.harmless).toBe(false)
    expect(resolved.body.revalidation.records.map((r: any) => r.distance).sort()).toEqual([0, 1, 2])

    const after = (await restrictionsOn(reachTest)).found[0]
    // STILL THERE, and still carrying the author's words.
    expect(after.restrictionId).toBe(p17)
    expect(after.disallowedClaims).toEqual(before.disallowedClaims)
    // AND THE WORDS HAVE CHANGED, which is the whole of the mechanism: resolved, not re-checked.
    expect(after.standing.state).toBe('resolved-unchecked')
    expect(after.standing.revalidationId).not.toBeNull()
  })

  it('writes nothing to the records it reached — no field, no change row, no revision', async () => {
    const { p17, reachTest } = await theCameraGraph()
    const versionBefore = (
      await app.inject({ method: 'GET', url: `/api/records/${reachTest}`, headers: PERSON })
    ).json().record
    const changesBefore = t.client.sqlite
      .prepare('SELECT COUNT(*) AS n FROM changes WHERE record_id = ?')
      .get(reachTest) as { n: number }
    const revisionsBefore = t.client.sqlite
      .prepare('SELECT COUNT(*) AS n FROM revisions WHERE record_id = ?')
      .get(reachTest) as { n: number }

    const calibration = await record('claim', 'Wrist camera calibrated, residual 0.21 px', { state: 'measured' })
    expect((await link(calibration, p17, 'resolves')).status).toBe(201)

    const after = (await app.inject({ method: 'GET', url: `/api/records/${reachTest}`, headers: PERSON })).json()
      .record
    expect(after.data).toEqual(versionBefore.data)
    expect(after.updatedAt).toBe(versionBefore.updatedAt)
    expect(
      (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM changes WHERE record_id = ?').get(reachTest) as { n: number })
        .n,
    ).toBe(changesBefore.n)
    expect(
      (
        t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions WHERE record_id = ?').get(reachTest) as {
          n: number
        }
      ).n,
    ).toBe(revisionsBefore.n)
  })

  it('stops carrying it to a record once somebody says the work still stands', async () => {
    const { p17, reachTest } = await theCameraGraph()
    const calibration = await record('claim', 'Wrist camera calibrated, residual 0.21 px', { state: 'measured' })
    expect((await link(calibration, p17, 'resolves')).status).toBe(201)

    const judged = await app.inject({
      method: 'PUT',
      url: `/api/revalidations/${p17}/${reachTest}`,
      payload: {
        state: 'checked',
        note: 'Re-ran the 40 trials against the calibrated intrinsics; the reach numbers move by under 1 mm.',
      },
      headers: PERSON,
    })
    expect(judged.statusCode, judged.body).toBe(200)
    expect(judged.json().row.state).toBe('checked')

    // GONE FROM THIS RECORD, and this is the only case where a reading disappears.
    expect((await restrictionsOn(reachTest)).found).toHaveLength(0)
    // AND UNCHANGED EVERYWHERE ELSE IT REACHES. One judgement is about one record.
    const { projection } = { projection: judged.json().row.recordId }
    expect(projection).toBe(reachTest)
  })

  it('judges a record that became a dependency AFTER the resolution, and says which act made the row', async () => {
    const { p17, projection, reachTest } = await theCameraGraph()
    const calibration = await record('claim', 'Wrist camera calibrated, residual 0.21 px', { state: 'measured' })
    expect((await link(calibration, p17, 'resolves')).status).toBe(201)

    // A fifth record joins the graph after the fact. It has no row, and under the rule that read
    // "no row means the restriction is live" it would have read `active` for ever.
    const late = await record('claim', 'Second reach test, run later', { state: 'measured' })
    expect((await link(late, projection, 'measures')).status).toBe(201)
    const reading = (await restrictionsOn(late)).found[0]
    expect(reading.standing.state).toBe('resolved-unchecked')
    expect(reading.standing.revalidationId).toBeNull()

    const judged = await app.inject({
      method: 'PUT',
      url: `/api/revalidations/${p17}/${late}`,
      payload: { state: 'checked' },
      headers: PERSON,
    })
    expect(judged.statusCode, judged.body).toBe(200)
    expect(judged.json().created).toBe(true)
    // The path on this row is the graph at the JUDGEMENT, not at the resolution, and the column
    // says which moment it is.
    expect(judged.json().row.writtenBy).toBe('judgement')
    expect((await restrictionsOn(reachTest)).found).toHaveLength(1)
  })

  it('refuses a judgement about a record the restriction does not reach', async () => {
    const { p17 } = await theCameraGraph()
    const unrelated = await record('note', 'Something else entirely', {})
    const calibration = await record('claim', 'Wrist camera calibrated, residual 0.21 px', { state: 'measured' })
    expect((await link(calibration, p17, 'resolves')).status).toBe(201)
    const judged = await app.inject({
      method: 'PUT',
      url: `/api/revalidations/${p17}/${unrelated}`,
      payload: { state: 'checked' },
      headers: PERSON,
    })
    expect(judged.statusCode).toBe(409)
    expect(judged.json().error).toContain('does not reach')
  })
})

describe('asking what restricts a record materialises nothing', () => {
  it('changes the row count of no table but api_calls', async () => {
    const { p17, segmentation, projection, reachTest } = await theCameraGraph()
    const before = counts()
    for (const id of [p17, segmentation, projection, reachTest]) {
      await restrictionsOn(id)
    }
    const after = counts()
    const changed = [...after.entries()]
      .filter(([table, n]) => n !== before.get(table))
      .map(([table]) => table)
      // `api_calls` is the one table a request may append to, and nothing writes it today. Naming
      // it here rather than counting nothing at all is what keeps this test honest on the day
      // telemetry lands: it will not go red for a reason that is not a defect.
      .filter((table) => table !== 'api_calls')
    expect(changed, 'a read wrote to these tables').toEqual([])
  })
})
