// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SESSION PLACEMENT READS WHO WROTE WHERE AND NO VALUE, AND A HELD SERVER SAYS WHAT WAS OPEN ACROSS THE HOLD.
 * Wave 13y round 15, finding 3.
 *
 * MEASURED FIRST: on 9 October 2026 GET /api/messages/comments and GET /api/plan-graph each took 37 to 40 s, and the
 * serve log was silent for 37.6 s. On a copy of the live office, GET /api/sessions spent about 2 s turning the old
 * and new values of the newest 100,001 change rows (269 MB) into strings, to use three columns of each.
 *
 * WHAT THIS HOLDS:
 *   - `readSessionEvidence` asks the changes table for no old or new value;
 *   - `sayTheHold` names every request that was open across a hold and still making its answer, says when the work
 *     was not a request's, and says that which function held the thread is not known;
 *   - `watchTheLoop` writes that line when the thread is held past `heldOver`, and not when it is not;
 *   - the server writes it to its own log;
 *   - GET /api/messages/comments reads the sessions' evidence once, however many comments say in their own words who
 *     they are for. It read it once for each such comment.
 *
 * CONTROL: every test passes at the tip. MUTATIONS, each run and each red:
 *   1. `readSessionEvidence` reads `listChanges` again (src/server/lib/sessions.ts): a statement selects the values.
 *   2. `sayTheHold` counts a request that arrived after the hold ended (src/server/lib/loop-watch.ts): it is named.
 *      Not run since this case changed from a request that arrived after the hold began.
 *   3. `watchTheLoop` compares the histogram's delay with `every` instead of `heldOver`: a short hold writes a line.
 *   4. the server's threshold raised from 0.5 s to 1,000 s (src/server/index.ts): its log has no line.
 *   5. `withinOneRead` no longer holds one reading of the sessions (src/server/lib/reviews.ts): three comments read
 *      the evidence three times.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { sayTheHold, watchTheLoop, type OpenAtTheHold } from '../src/server/lib/loop-watch.ts'
import { localStamp } from '../src/shared/time.ts'

const PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

let db: TestDb
let app: Awaited<ReturnType<typeof apiApp>>['app']

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
}, 60000)

afterAll(async () => {
  await app.close()
  db.close()
})

it('the session placement asks the changes table for no old or new value', async () => {
  const filed = await app.inject({ method: 'POST', url: '/api/records', headers: PERSON, payload: { kind: 'note', title: 'Test placement', data: {} } })
  expect(filed.statusCode, filed.body).toBe(201)
  const { readSessionEvidence } = await import('../src/server/lib/sessions.ts')
  // EVERY STATEMENT THE READ PREPARES, by wrapping the connection's own `prepare` for the length of the call.
  const sqlite = db.client.sqlite
  const prepare = sqlite.prepare.bind(sqlite)
  const asked: string[] = []
  sqlite.prepare = ((source: string) => {
    asked.push(source)
    return prepare(source)
  }) as typeof sqlite.prepare
  try {
    readSessionEvidence('default')
  } finally {
    sqlite.prepare = prepare as typeof sqlite.prepare
  }
  const ofChanges = asked.filter((source) => /from "changes"/i.test(source))
  expect(ofChanges.length, 'the placement reads the changes table').toBeGreaterThan(0)
  for (const source of ofChanges) expect(source, 'a statement of the placement').not.toMatch(/old_value|new_value/)
})

// A MADE ANSWER WAS MADE AS IT ARRIVED, before any hold these cases draw.
const open = (url: string, startedAt: number, answerMade: boolean): OpenAtTheHold => ({ method: 'GET', url, route: null, project: 'panelx', startedAt, answerMadeAt: answerMade ? startedAt : null, closedAt: null, stream: false })

it('the line names the requests open across the hold, and says what it cannot know', () => {
  // A hold of 30 s that ended at 100 s: it began at 70 s.
  const line = sayTheHold(30_000, 100_000, [
    open('/api/messages/comments', 69_000, false),
    open('/api/plan-graph', 60_000, true),
    open('/api/arrived-after', 100_500, false),
  ])
  expect(line).toContain('held for at least 30.0 s')
  expect(line).toContain(`Making an answer across it: GET /api/messages/comments (no route matched, started ${localStamp(new Date(performance.timeOrigin + 69_000))}, project panelx, open 31.0 s, still making its answer)`)
  expect(line).toContain('Also open, answer made: GET /api/plan-graph')
  expect(line, 'a request that arrived after the hold ended was not open across it').not.toContain('/api/arrived-after')
  expect(line).toContain('Which function held it is not known')

  expect(sayTheHold(2_000, 10_000, [])).toContain("No request was open across it, so the work was not a request's.")
  expect(sayTheHold(2_000, 10_000, [open('/api/x', 1_000, true)])).toContain('No request was making its answer')
})

it('the watch writes a line when the thread is held past the threshold, and not otherwise', async () => {
  const lines: string[] = []
  const watch = watchTheLoop({ every: 20, heldOver: 300, open: () => [], log: (line) => lines.push(line) })
  try {
    // Short waits that leave the thread free: no line.
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(lines, 'a free thread writes nothing').toEqual([])
    // THE THREAD HELD FOR 600 MS.
    const until = performance.now() + 600
    while (performance.now() < until) {
      // held
    }
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/held for at least 0\.[5-9] s/)
  } finally {
    watch.stop()
  }
})

it('the server it is built into writes the line to its own log', async () => {
  const lines: string[] = []
  const warn = app.log.warn.bind(app.log)
  app.log.warn = ((line: unknown) => {
    if (typeof line === 'string' && line.startsWith('the server was held')) lines.push(line)
  }) as typeof app.log.warn
  try {
    // THE THREAD HELD FOR 1.4 S, past the server's threshold of half a second.
    const until = performance.now() + 1_400
    while (performance.now() < until) {
      // held
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/held for at least 1\.[1-9] s/)
  } finally {
    app.log.warn = warn
  }
})

it('the comments door reads the sessions\' evidence once, however many comments name who they are for', async () => {
  const page = await app.inject({ method: 'POST', url: '/api/records', headers: PERSON, payload: { kind: 'note', title: 'Test page for comments', data: {} } })
  expect(page.statusCode, page.body).toBe(201)
  const target = { target: { kind: 'record', recordId: (page.json() as { record: { id: string } }).record.id, workspaceId: 'default' } }
  const comments: string[] = []
  for (const hint of ['the kiln run', 'the glaze run', 'the shelf run']) {
    const filed = await app.inject({ method: 'POST', url: '/api/records', headers: PERSON, payload: { kind: 'message', title: 'Test comment', data: { body: 'Test comment.', target, recipientHint: hint } } })
    expect(filed.statusCode, filed.body).toBe(201)
    comments.push((filed.json() as { record: { id: string } }).record.id)
  }
  const sqlite = db.client.sqlite
  const prepare = sqlite.prepare.bind(sqlite)
  const asked: string[] = []
  sqlite.prepare = ((source: string) => {
    asked.push(source)
    return prepare(source)
  }) as typeof sqlite.prepare
  let reply: Awaited<ReturnType<typeof app.inject>>
  try {
    reply = await app.inject({ method: 'GET', url: '/api/messages/comments', headers: PERSON })
  } finally {
    sqlite.prepare = prepare as typeof sqlite.prepare
  }
  expect(reply.statusCode, reply.body).toBe(200)
  // EACH COMMENT IS IN THE ANSWER. The words name no run here, so each is named nobody, which JSON leaves out.
  const shown = (reply.json() as { comments: { id: string }[] }).comments.map((one) => one.id)
  for (const id of comments) expect(shown).toContain(id)
  // THE PLACEMENT'S OWN STATEMENT: who wrote where, from the changes table.
  const placements = asked.filter((source) => /select "session_id", "record_id", "at" from "changes"/i.test(source))
  expect(placements).toHaveLength(1)
})
