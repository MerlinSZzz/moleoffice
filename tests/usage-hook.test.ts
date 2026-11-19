// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RECORDER WRITES ONE ROW PER CALL, AND CHANGES NOTHING ELSE.
 *
 * Four tables were created on 25 August 2026 and nothing had ever written a row into any of them.
 * Every number the usage surface draws is a query over those tables, so this file is the test that
 * the numbers are about something.
 *
 * THE SECOND HALF MATTERS AS MUCH AS THE FIRST. A measurement layer that changed what the product
 * answered would be the worst thing this campaign could ship: the caller's contract would depend on
 * a setting the caller cannot see. So the same requests are made with recording on and off and the
 * two replies are compared.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { desc } from 'drizzle-orm'
import { apiApp, at, freshDb, type TestDb } from './helpers.ts'
import { apiCalls } from '../src/server/db/schema.ts'
import { CALL_ID_HEADER } from '../src/config/call-header.mjs'
import { originsAPageMayBeOn, settings } from '../src/config/settings.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const WORKSPACE = 'default'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }

let t: TestDb
let app: FastifyInstance

/**
 * THE RECORDER'S OWN MODULE, IMPORTED AFTER THE SCRATCH DATABASE IS NAMED.
 *
 * It reaches `db/client.ts`, and a top-level import of anything that does would open the operator's
 * real corpus before any test body runs. `freshDb()` has to get there first, which is why this is a
 * function and not an import at the head of the file.
 */
const recorder = async () => await import('../src/server/lib/usage.ts')

// The response header the recorder sets. It used to be typed again here, because reading it from
// the recorder would have opened the database at the head of the file; it now lives in
// src/config/call-header.mjs, which can be read on its own, so the name is imported like any other.

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  // THE ROWS ARE EACH CASE'S OWN: a case counts the rows its requests wrote, so it starts on none.
  t.client.sqlite.prepare('DELETE FROM api_calls').run()
})

/** Every row the recorder wrote, newest last, read straight out of the table. */
function rows() {
  return t.client.db.select().from(apiCalls).orderBy(desc(apiCalls.atMs)).all()
}

describe('one row per call, carrying what the route declared', () => {
  it('records a read with its operation, its effect, its route pattern and the status the caller got', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/records', headers: PERSON })
    expect(res.statusCode).toBe(200)
    const written = rows()
    expect(written.length).toBe(1)
    const row = written[0]!
    expect(row.operation).toBe('record.list')
    expect(row.effect).toBe('read')
    expect(row.route).toBe('/api/records')
    expect(row.method).toBe('GET')
    // THE STATUS IS WHY THE ROW IS WRITTEN ON `onResponse` AND NOT ON `onRequest`. Nothing knows
    // what the caller got until the caller has got it.
    expect(row.status).toBe(200)
    expect(row.bytes).toBeGreaterThan(0)
  })

  it('records the refusal too, because a refused call is the evidence, not a gap in it', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/records/does-not-exist', headers: PERSON })
    expect(res.statusCode).toBe(404)
    const row = rows()[0]!
    expect(row.status).toBe(404)
    expect(row.operation).toBe('record.read')
    expect(row.targetId).toBe('does-not-exist')
  })

  it('writes a row for a request that matched no route at all, with the operation, effect and route null', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope', headers: PERSON })
    expect(res.statusCode).toBe(404)
    const row = rows()[0]!
    expect(row.operation).toBeNull()
    expect(row.effect).toBeNull()
    expect(row.route).toBeNull()
    // ON A 404 THE METHOD IS THE ONLY THING LEFT, and it is still worth having: agents calling
    // routes that do not exist is exactly what this table was asked to show.
    expect(row.method).toBe('GET')
  })

  it('stores the route pattern and never the query string', async () => {
    await app.inject({ method: 'GET', url: '/api/search?q=a%20secret%20phrase', headers: PERSON })
    const row = rows()[0]!
    expect(row.route).toBe('/api/search')
    for (const value of Object.values(row)) {
      if (typeof value !== 'string') continue
      expect(value).not.toContain('?')
      expect(value).not.toContain('secret')
    }
  })

  it('hands the caller the id of the row its own request produced', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/records', headers: PERSON })
    const header = res.headers[CALL_ID_HEADER]
    expect(typeof header).toBe('string')
    expect(rows()[0]!.id).toBe(header)
  })
})

describe('what is not a call', () => {
  it('writes no row for a CORS preflight, which is nothing anybody decided to ask for', async () => {
    // MEASURED, AND THE REASON IS NOT A GUARD IN THE RECORDER. The CORS plugin is registered above
    // the recorder and answers a preflight in its own `onRequest`, which ends the request before the
    // recorder's hook runs. Installing the recorder above that plugin is what turns this red.
    //
    // THE ORIGIN IS READ FROM THE DECLARATION, NEVER TYPED HERE. `originsAPageMayBeOn` is the list
    // the server checks a preflight against, and it is built from MOLE_OFFICE_WEB_PORT. This line
    // used to say `http://localhost:5173`. In any checkout whose `.env` names a web port of its own
    // — which is what CLAUDE.md's worktree recipe produces — that origin is not on the list, the
    // preflight is refused, and the reply is 404 rather than 204. Problem `C_2c-1ldADN5`.
    const anOriginAPageMayBeOn = at(originsAPageMayBeOn(settings()), 0, 'an origin a page of this installation may be on')
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/api/records',
      headers: { origin: anOriginAPageMayBeOn, 'access-control-request-method': 'GET' },
    })
    expect(preflight.statusCode).toBe(204)
    expect(rows().length).toBe(0)
  })

  it('writes a row for a HEAD, carrying the GET route it shares', async () => {
    await app.inject({ method: 'HEAD', url: '/api/records', headers: PERSON })
    const written = rows()
    expect(written.length).toBe(1)
    expect(written[0]!.method).toBe('HEAD')
    expect(written[0]!.operation).toBe('record.list')
  })
})

describe('the recorder does not feed itself, and the exemption is exactly one rule wide', () => {
  it('exempts a usage read and does not exempt the write an agent performs', async () => {
    const { skipsRecording } = await recorder()
    // THE RULE IS `usage.` PLUS `read`, NOT THE `usage.` FAMILY. Exempting the family would drop the
    // one row in it that is evidence: an agent reporting that it went outside Mole Office.
    expect(skipsRecording('usage.summary')).toBe(true)
    expect(skipsRecording('usage.traces')).toBe(true)
    expect(skipsRecording('usage.report-outside')).toBe(false)
    expect(skipsRecording('record.list')).toBe(false)
    expect(skipsRecording(null)).toBe(false)
  })

  it('writes no row when the page reads the telemetry, and one when an agent reports going outside', async () => {
    await app.inject({ method: 'GET', url: '/api/usage/summary', headers: PERSON })
    // WITHOUT THIS RULE the page reads the summary, the read writes a row, the row changes the
    // summary, and within a day the largest operation in the telemetry is reading the telemetry.
    expect(rows().length).toBe(0)

    await app.inject({
      method: 'POST',
      url: '/api/usage/outside-reads',
      headers: { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' },
      payload: { source: 'shell', what: 'git rev-parse HEAD', wanted: 'repo-head', verdict: 'boundary' },
    })
    const written = rows()
    expect(written.length).toBe(1)
    expect(written[0]!.operation).toBe('usage.report-outside')
  })
})

describe('the two measurements taken while the reply is still an object', () => {
  it('reads the longest list on the reply, and null when the reply holds no list at all', async () => {
    const { listLengthOf } = await recorder()
    // 0 AND NULL ARE DIFFERENT ANSWERS. "This read returned nothing" and "this read has no list in
    // it" are not the same fact, and a 0 for the second would read as an empty answer.
    expect(listLengthOf({ ok: true, records: 4 })).toBeNull()
    expect(listLengthOf({ items: [], counts: {} })).toBe(0)
    expect(listLengthOf({ items: [1, 2], others: [1, 2, 3] })).toBe(3)
    expect(listLengthOf([1, 2, 3, 4])).toBe(4)
    expect(listLengthOf('a string the hook never sees')).toBeNull()
  })

  it('takes the outer path parameter as the target, and never the unmatched-route wildcard', async () => {
    const { targetIdOf } = await recorder()
    expect(targetIdOf({ id: 'abc' })).toBe('abc')
    expect(targetIdOf({})).toBeNull()
    // A `*` IS A PATH, NOT AN ID. Storing it would put a URL in the column that holds references.
    expect(targetIdOf({ '*': 'api/nope' })).toBeNull()
  })

  it('measures a real reply, so the two rules above are about rows and not only about functions', async () => {
    // A PROJECT OF ITS OWN, holding no records, so the list this case measures is the empty list it means.
    const emptyProject = 'usage-hook-empty'
    await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: emptyProject, title: 'An empty test project' } })
    await app.inject({ method: 'GET', url: '/api/records', headers: { ...PERSON, 'x-mole-office-workspace': emptyProject } })
    expect(rows()[0]!.listLen).toBe(0)
    await app.inject({ method: 'GET', url: '/api/health' })
    expect(rows()[0]!.listLen).toBeNull()
  })
})

describe('recording changes nothing about what the product answers', () => {
  it('gives the same status, the same body and the same headers with it off, apart from the call id', async () => {
    const { buildApp } = await import('../src/server/index.ts')
    const quiet = await buildApp({
      production: false,
      webDir: '/nonexistent',
      webAppUrl: 'http://localhost:5173',
      logLevel: false,
      recordCalls: false,
    })
    await quiet.app.ready()
    try {
      for (const url of ['/api/records', '/api/nope', '/api/health']) {
        const loud = await app.inject({ method: 'GET', url, headers: PERSON })
        const silent = await quiet.app.inject({ method: 'GET', url, headers: PERSON })
        expect(silent.statusCode, url).toBe(loud.statusCode)
        expect(silent.body, url).toBe(loud.body)
        expect(silent.headers[CALL_ID_HEADER], url).toBeUndefined()
        expect(loud.headers[CALL_ID_HEADER], url).toBeDefined()
      }
      // AND THE MALFORMED TRACE HEADER IS REFUSED THE SAME WAY ON BOTH. This is the case that would
      // break if the shape check ever moved back into the recorder: the same request would be a 400
      // with recording on and a 200 with it off.
      const bad = { ...PERSON, 'x-mole-office-trace': 'two words' }
      const loud = await app.inject({ method: 'POST', url: '/api/records', headers: bad, payload: { kind: 'note', title: 'x' } })
      const silent = await quiet.app.inject({
        method: 'POST',
        url: '/api/records',
        headers: bad,
        payload: { kind: 'note', title: 'x' },
      })
      expect(loud.statusCode).toBe(400)
      expect(silent.statusCode).toBe(400)
      expect(silent.body).toBe(loud.body)
    } finally {
      await quiet.app.close()
    }
  })
})

describe('what the caller said, and how far anything checked it', () => {
  it('says `checked` on a write, `header` on a read that sent them, and `none` on one that did not', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' },
      payload: { kind: 'note', title: 'a note' },
    })
    // A WRITE RESOLVES ITS ACTOR, so something judged the claim and the row says so.
    expect(rows()[0]!.identitySource).toBe('checked')

    await app.inject({ method: 'GET', url: '/api/kinds', headers: PERSON })
    // A READ THAT DOES NOT ASK WHO IS READING. The headers were there and nothing validated them,
    // which is a third state and not either of the other two. GET /api/records asks since the owner's decision, because
    // which messages it lists depends on who reads.
    expect(rows()[0]!.identitySource).toBe('header')

    await app.inject({ method: 'GET', url: '/api/health' })
    expect(rows()[0]!.identitySource).toBe('none')
  })

  it('says `checked` for the person typing by hand, who sends no identity header at all', async () => {
    // THE EARLY RETURN. `actorFrom` leaves at its first exit for a request carrying none of the
    // three headers, and stamping only its second exit would file a hand-typed write as one nobody
    // ever resolved. Those are different facts and only one of them is true.
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { 'x-mole-office-workspace': WORKSPACE },
      payload: { kind: 'note', title: 'typed by hand' },
    })
    expect(res.statusCode).toBe(201)
    const row = rows()[0]!
    expect(row.identitySource).toBe('checked')
    expect(row.actorType).toBe('human')
  })

  it('says whether the caller named the project, so a bare curl and a deliberate default differ', async () => {
    await app.inject({ method: 'GET', url: '/api/records', headers: PERSON })
    expect(rows()[0]!.workspaceStated).toBe(1)
    await app.inject({ method: 'GET', url: '/api/records' })
    expect(rows()[0]!.workspaceStated).toBe(0)
  })
})

describe('the trace and the purpose come off the request and are judged by the product, not by the recorder', () => {
  it('stores both when they are sent', async () => {
    await app.inject({
      method: 'GET',
      url: '/api/records',
      headers: { ...PERSON, 'x-mole-office-trace': 'run-7', 'x-mole-office-purpose': 'cold-recovery' },
    })
    const row = rows()[0]!
    expect(row.traceId).toBe('run-7')
    expect(row.purpose).toBe('cold-recovery')
  })

  it('leaves both null when nobody said, which is a real answer', async () => {
    await app.inject({ method: 'GET', url: '/api/records', headers: PERSON })
    expect(rows()[0]!.traceId).toBeNull()
    expect(rows()[0]!.purpose).toBeNull()
  })

  it('refuses a purpose outside the closed list, on the route and not in the recorder', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...PERSON, 'x-mole-office-purpose': 'having-a-think' },
      payload: { kind: 'note', title: 'x' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('cold-recovery')
  })
})

describe('which machine, and it is never guessed', () => {
  it('records the address an injected request arrived from, and leaves the door null', async () => {
    await app.inject({ method: 'GET', url: '/api/records', headers: PERSON })
    const row = rows()[0]!
    expect(row.clientAddr).toBe('127.0.0.1')
    // AN IN-PROCESS CALLER CAME THROUGH NO LISTENER, so no listener stamped it, so the door is
    // null. Null is read as "recorded before Mole Office could tell" and never as this machine.
    expect(row.clientOrigin).toBeNull()
  })
})
