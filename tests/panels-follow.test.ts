// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The pages follow the server: nothing the server says is dropped on the way to the screen.
 *
 * ---------------------------------------------------------------------------------------
 * THE FAILURE THESE TESTS ARE ABOUT
 * ---------------------------------------------------------------------------------------
 * The server got more honest three times, and three times the browser went on drawing the old
 * answer, with nothing failing and nothing warning:
 *
 *   1. GET /api/resources/orphans gained an `unclaimed` sweep — what is running on this machine
 *      that NO session ever wrote down. readOrphansPayload read `orphans`, `searched` and
 *      `warning`, so the block never reached the browser and the panel could say "no orphans"
 *      while the server was saying five things are running that nobody claims. That is a worse
 *      silence than the one it replaced, because the page looks reassuring.
 *   2. Change rows started storing a session RECORD ID where they used to store a run name, and
 *      GET /api/changes gained a `sessions` block resolving those ids to titles. The pages went
 *      on printing the raw field, so a readable name turned into `NS6wp_rmduzo`.
 *   3. src/web/api.ts's listChanges returned `.changes` and dropped the rest, so the block in (2)
 *      never left the wrapper.
 *
 * All three are one bug: A TYPED FETCH THAT QUIETLY DISCARDS HALF THE RESPONSE. The first
 * describe below is the guard against it and is the reason this file registers real routes
 * against a real database: it takes what the SERVER ACTUALLY SENDS and fails if the wrapper
 * hands back less than that. Nothing in it is hand-written from the server's shapes, so it
 * cannot agree with a stale copy of them.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT LOOKS LIKE THIS
 * ---------------------------------------------------------------------------------------
 * The runner's environment is `node`: no DOM, and adding one would be a new dependency this
 * project has ruled out. So, as tests/sessions-ui.test.ts does it, components are rendered to
 * static markup and the pure readers are called directly. src/web/api.ts reads
 * window.localStorage at module scope and HomePage.tsx installs a hashchange listener when it is
 * imported, so the smallest stand-in for a window is installed before either is loaded.
 *
 * `fetch` is pointed at the real Fastify app through app.inject, so the wrapper's own headers,
 * query string and JSON body all go through the routes rather than past them, and the bytes it
 * reads are the bytes the server wrote.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { t } from '../src/shared/i18n.ts'
// Type-only, and erased before this file runs: it never loads the server's resource layer, it
// just fails the typecheck if the sweep the panel reads stops being the sweep the server sends.
import type { UnclaimedSweep } from '../src/server/lib/resources.ts'

type WebApi = typeof import('../src/web/api.ts')
type SP = typeof import('../src/web/components/SessionPanel.tsx')
type CL = typeof import('../src/web/components/ChangeLog.tsx')
type HP = typeof import('../src/web/pages/HomePage.tsx')

let db: TestDb
let app: FastifyInstance
let webApi: WebApi
let sp: SP
let cl: CL
let hp: HP
let mode: typeof import('../src/web/lib/mode.ts')

/** The body of the last reply the app sent, exactly as the wrapper received it. */
let lastReply: unknown = null

/** What the browser sends on every request, and what the change log records it as. */
const AS_AGENT = { type: 'agent', id: 'claude-code' } as const

/**
 * THE ONE CALL IN THIS FILE THE PERSON HAS TO MAKE, since 16 September 2026.
 *
 * Giving a plan line hours puts them on the person's own calendar, and criterion P3 with problem
 * `pOTggQdXY6AZ` says that is the person's act: every door that reaches an allocation refuses an agent now,
 * where before tonight only the intent commit did. This file's browser speaks as an agent for
 * everything else, so the give-time call switches to the person for its own length and switches
 * back, rather than the whole file changing who it is.
 */
async function asThePerson<T>(call: () => Promise<T>): Promise<T> {
  webApi.setActor({ type: 'human', id: THE_PERSON })
  try {
    return await call()
  } finally {
    webApi.setActor({ ...AS_AGENT })
  }
}

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }

  db = await freshDb()

  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { linkRoutes } = await import('../src/server/api/links.ts')
  const { queryRoutes } = await import('../src/server/api/queries.ts')
  // The plan routes and the cross-project work list, because the calls that turn a written line
  // into real work go through them and this file is where a wrapper is checked against the bytes.
  const { planRoutes } = await import('../src/server/api/plans.ts')
  const { workRoutes } = await import('../src/server/api/work.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  app = Fastify()
  installErrorHandling(app)
  // The health route is one line in src/server/index.ts, which cannot be imported because it
  // listens on a port the moment it loads. This is that line.
  app.get('/api/health', async () => ({ ok: true, records: db.api.listRecords({ workspaceId: 'default' }).length }))
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(linkRoutes, { prefix: '/api' })
  await app.register(queryRoutes, { prefix: '/api' })
  await app.register(planRoutes, { prefix: '/api' })
  await app.register(workRoutes, { prefix: '/api' })
  await app.ready()

  // Every request src/web/api.ts makes goes to the real routes from here on.
  ;(globalThis as unknown as { fetch: unknown }).fetch = async (
    input: unknown,
    init: { method?: string; headers?: HeadersInit; body?: string } = {},
  ) => {
    const res = await app.inject({
      method: (init.method ?? 'GET') as 'GET',
      url: String(input),
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      ...(init.body === undefined ? {} : { payload: init.body }),
    })
    lastReply = res.body.length === 0 ? null : (JSON.parse(res.body) as unknown)
    return {
      ok: res.statusCode >= 200 && res.statusCode < 300,
      status: res.statusCode,
      text: async () => res.body,
    }
  }

  webApi = await import('../src/web/api.ts')
  webApi.setActor({ ...AS_AGENT })
  sp = await import('../src/web/components/SessionPanel.tsx')
  mode = await import('../src/web/lib/mode.ts')
  cl = await import('../src/web/components/ChangeLog.tsx')
  hp = await import('../src/web/pages/HomePage.tsx')
})

afterAll(async () => {
  await app.close()
  db.close()
})

/** The markup with the hoisted style blocks removed, so a class name in the CSS is not evidence. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// ============================================================================ the wrapper audit

/**
 * What a wrapper failed to hand on from the reply it was given.
 *
 * TWO WAYS TO PASS, AND ONLY TWO. Either the wrapper returns the reply itself — every key
 * present, with the same value — or the reply has exactly ONE key and the wrapper returns that
 * key's value, which loses nothing. Anything else is a field that went in and did not come out.
 *
 * Extra keys are allowed and checked elsewhere: api.createRecord lifts the new record's `id` to
 * the top level so the create form keeps working, and `carriesEveryField` would not notice if
 * that alias ever shadowed a real field — the assertion on values is what catches that.
 */
function carriesEveryField(
  what: string,
  sent: unknown,
  got: unknown,
): { missing: string[]; changed: string[]; unwrappedTo: string | null } {
  if (!isObj(sent)) throw new Error(`${what} did not answer with a JSON object: ${JSON.stringify(sent)}`)
  const keys = Object.keys(sent)

  if (!isObj(got)) {
    // The wrapper handed back a bare value: only honest when the envelope held one thing.
    const only = keys.length === 1 ? keys[0] : undefined
    if (only === undefined) {
      return { missing: keys, changed: [], unwrappedTo: null }
    }
    const same = JSON.stringify(got) === JSON.stringify(sent[only])
    return { missing: [], changed: same ? [] : [only], unwrappedTo: only }
  }

  const missing = keys.filter((k) => !Object.prototype.hasOwnProperty.call(got, k))
  const changed = keys.filter(
    (k) =>
      Object.prototype.hasOwnProperty.call(got, k) && JSON.stringify(got[k]) !== JSON.stringify(sent[k]),
  )
  return { missing, changed, unwrappedTo: null }
}

/** One endpoint the browser calls, and the wrapper that calls it. */
interface WrapperCase {
  /** "METHOD /path", the same key the server's own route notes use. */
  what: string
  call: () => Promise<unknown>
}

describe('no wrapper in src/web/api.ts drops what the server sent', () => {
  /** What each call sent and got back, collected once: the calls are real writes. */
  const audits: { what: string; missing: string[]; changed: string[]; unwrappedTo: string | null }[] = []

  beforeAll(async () => {
    for (const one of await everyCall()) {
      const got = await one.call()
      audits.push({ what: one.what, ...carriesEveryField(one.what, lastReply, got) })
    }
  })

  /**
   * One of every call the browser makes, against real routes and a real database.
   *
   * The cases are built here rather than in a fixture because several need each other: a record
   * to patch, a link to delete, a session to attribute a change to.
   */
  async function everyCall(): Promise<WrapperCase[]> {
    // An incomplete module, so the create reply carries `incomplete` AND `incompleteNote` —
    // exactly the pair the old wrapper dropped, and the one that only appears when there is news.
    const created = await webApi.api.createRecord({ kind: 'module', title: 'the wrist camera' })
    const other = await webApi.api.createRecord({ kind: 'claim', title: 'the gripper slips at 40N' })
    const { id: linkId } = await webApi.api.createLink({ fromId: created.id, toId: other.id, type: 'relates_to' })
    const doomed = await webApi.api.createRecord({ kind: 'note', title: 'a note to delete' })

    // A session record, and a write attributed to it, so GET /api/changes has something to
    // resolve in its `sessions` block.
    const session = await webApi.api.createRecord({
      kind: 'session',
      title: 'the checkpoint 3 run',
      data: { state: 'finished' },
    })
    webApi.setActor({ ...AS_AGENT, sessionId: session.id })
    await webApi.api.updateRecord(created.id, { dataPatch: { context: 'the wrist camera on the left arm' } })

    // A PLAN, ITS LINES, AND THE THREE WRITES THAT TURN ONE INTO REAL WORK. Written here rather
    // than in a fixture for the same reason the records above are: each of these calls needs the
    // one before it, and a line has to be filed as work before it can be given time.
    const plan = await webApi.api.newPlan('the plan the wrappers are audited against', 'the gripper\nreplace it')
    const firstLine = plan.lines[0]
    const secondLine = plan.lines[1]
    if (firstLine === undefined || secondLine === undefined) {
      throw new Error('the plan came back with fewer lines than were sent, so there is nothing to file')
    }
    const filed = await webApi.api.fileLineAsWork(plan.plan.id, firstLine.id, {
      kind: 'task',
      workspaceId: 'default',
    })
    // Work that already exists, for the line that will be pointed at it rather than filed anew.
    const standing = await webApi.api.createRecord({ kind: 'task', title: 'work that was already filed' })
    // A second plan, so that DELETE has something to delete without taking the one above with it.
    const doomedPlan = await webApi.api.newPlan('a plan written only to be deleted')

    return [
      { what: 'GET /api/health', call: () => webApi.api.health() },
      { what: 'GET /api/records', call: () => webApi.api.listRecords() },
      {
        what: 'POST /api/records',
        call: () => webApi.api.createRecord({ kind: 'module', title: `audited ${Date.now()}` }),
      },
      { what: 'GET /api/records/:id', call: () => webApi.api.getRecord(created.id) },
      {
        what: 'PATCH /api/records/:id',
        // A merge, so the reply carries `dataPatch` — the report that says which paths moved and
        // which keys a null deleted, and the half of a PATCH reply that used to be thrown away.
        call: () => webApi.api.updateRecord(created.id, { dataPatch: { context: 'now on the right arm' } }),
      },
      { what: 'DELETE /api/records/:id', call: () => webApi.api.deleteRecord(doomed.id) },
      { what: 'POST /api/records/:id/restore', call: () => webApi.api.restoreRecord(doomed.id) },
      {
        what: 'POST /api/links',
        call: () => webApi.api.createLink({ fromId: other.id, toId: created.id, type: 'relates_to' }),
      },
      { what: 'DELETE /api/links/:id', call: () => webApi.api.deleteLink(linkId) },
      { what: 'GET /api/changes', call: () => webApi.api.listChanges({ limit: 50 }) },
      { what: 'GET /api/changes?session=', call: () => webApi.api.listChanges({ session: session.id }) },
      { what: 'GET /api/queries/unconsumed', call: () => webApi.api.unconsumed() },
      { what: 'GET /api/queries/unmet', call: () => webApi.api.unmet() },

      // ----- what a person has to do, and the plan that turns writing into it
      { what: 'GET /api/work', call: () => webApi.api.work() },
      { what: 'GET /api/plans', call: () => webApi.api.plans('every') },
      { what: 'GET /api/plans/:id/blocks', call: () => webApi.api.planBlocks(plan.plan.id) },
      {
        what: 'POST /api/plans/:id/lines/:lineId/file-as-work',
        call: () =>
          webApi.api.fileLineAsWork(plan.plan.id, secondLine.id, { kind: 'task', workspaceId: 'default' }),
      },
      {
        what: 'PATCH /api/plans/:id/lines/:lineId (the remark)',
        call: () => webApi.api.saveLine(plan.plan.id, firstLine.id, { remark: 'ask about the mount first' }, null),
      },
      {
        what: 'PATCH /api/plans/:id/lines/:lineId (pointing it at work)',
        // `replacing` names the record the line points at NOW — the one it was filed as a moment
        // ago — because a line that already points somewhere is refused without it.
        call: () =>
          webApi.api.pointLineAtWork(plan.plan.id, firstLine.id, {
            recordId: standing.id,
            replacing: filed.recordId,
          }),
      },
      {
        what: 'POST /api/plans/:id/lines/:lineId/give-time',
        call: () =>
          asThePerson(() =>
            webApi.api.giveLineTime(plan.plan.id, firstLine.id, {
              horizon: 'month',
              period: '2026-09',
              plannedHours: 3,
            }),
          ),
      },
      {
        what: 'PATCH /api/records/:id (the estimate)',
        call: () => webApi.api.setEstimateHours(standing.id, 4, 'default'),
      },
      { what: 'PATCH /api/plans/:id (closing it)', call: () => webApi.api.savePlan(doomedPlan.plan.id, { state: 'done' }, null) },
      { what: 'DELETE /api/plans/:id', call: () => webApi.api.deletePlan(doomedPlan.plan.id) },
    ]
  }

  const endpointOf = (what: string) => what.split('?')[0] ?? what

  it('hands on every field of every reply, or unwraps a one-key envelope and nothing else', () => {
    expect(audits.length).toBeGreaterThan(10)
    for (const audit of audits) {
      expect(audit.missing, `${audit.what} dropped ${audit.missing.join(', ')}`).toEqual([])
      expect(audit.changed, `${audit.what} changed the value of ${audit.changed.join(', ')}`).toEqual([])

      // An unwrap is only ever the declared one, and only where a single key was declared. This
      // is what fails the day a one-key reply grows a second key: the unwrap silently becomes a
      // drop, and there is no other moment at which anybody would notice.
      const declared = webApi.UNWRAPPED_ENVELOPES[endpointOf(audit.what)] ?? null
      expect(audit.unwrappedTo, `${audit.what} unwrapping`).toBe(declared)
    }
  })

  it('lists every unwrapped envelope, and nothing that is not one', () => {
    const unwrapped = audits.filter((a) => a.unwrappedTo !== null).map((a) => endpointOf(a.what))
    expect([...new Set(unwrapped)].sort()).toEqual(Object.keys(webApi.UNWRAPPED_ENVELOPES).sort())
  })

  it('catches a wrapper that drops a field — the guard itself, checked', () => {
    const sent = { changes: [], sessions: [{ stored: 'x' }] }
    const dropped = carriesEveryField('GET /api/changes', sent, { changes: [] })
    expect(dropped.missing).toEqual(['sessions'])

    // And a two-key reply handed back as one value is a drop, not an unwrap.
    const unwrapped = carriesEveryField('GET /api/changes', sent, [])
    expect(unwrapped.missing).toEqual(['changes', 'sessions'])
    expect(unwrapped.unwrappedTo).toBeNull()

    // A wrapper that renamed or rebuilt a value is caught as well as one that lost it.
    const rebuilt = carriesEveryField('GET /api/changes', sent, { changes: [], sessions: [] })
    expect(rebuilt.changed).toEqual(['sessions'])
  })

  it('lifts the created record id to the top level without shadowing anything the server sent', async () => {
    const created = await webApi.api.createRecord({ kind: 'note', title: 'the alias is the record' })
    expect(created.id).toBe(created.record.id)
    expect(isObj(lastReply) && Object.prototype.hasOwnProperty.call(lastReply, 'id')).toBe(false)
  })

  it('keeps the fields the create form was missing: what the record still wants, in words', async () => {
    const created = await webApi.api.createRecord({ kind: 'module', title: 'the left gripper' })
    expect(created.incomplete.length).toBeGreaterThan(0)
    expect(created.incompleteNote ?? '').toContain('incomplete')
  })

  /**
   * The 201 carries one more thing, and only sometimes: what filing a session did to the log.
   *
   * This is the same failure as a dropped key, one layer earlier. The bytes were arriving —
   * `carriesEveryField` above would have said so — but src/web/api.ts's RecordReply did not
   * DECLARE `sessionBinding`, so no code in the browser could name the field, and the refusal
   * case in it (the name already belongs to another session, nothing was bound) was unreachable
   * from the screen. Reading it off the reply here is what pins the mirror: delete the field
   * from the interface and this file stops compiling.
   */
  it('carries what filing a session under a run name did to the change log', async () => {
    const runName = `wrapper-run-${Date.now()}`
    webApi.setActor({ ...AS_AGENT, sessionId: runName })
    // Two writes under the raw name, before anything answers to it. These are the rows a binding
    // has to move; without them the report would be true and empty, which proves nothing.
    await webApi.api.createRecord({ kind: 'note', title: `written under ${runName}` })

    const filed = await webApi.api.createRecord({
      kind: 'session',
      title: `the run called ${runName}`,
      data: { state: 'running' },
    })

    const binding = filed.sessionBinding
    if (binding === undefined) throw new Error('the 201 carried no sessionBinding')
    expect(binding.name).toBe(runName)
    expect(binding.recordId).toBe(filed.record.id)
    expect(binding.repointed).toBeGreaterThan(0)
    expect(binding.alreadyBoundTo).toBeNull()
    expect(binding.note).toContain(runName)

    // A second session cannot take a name that already means the first one — and the refusal is
    // the other thing this field carries, with `repointed` 0 and `alreadyBoundTo` naming the
    // session that has it. That is the case this mirror exists for: it is unreachable from the
    // screen unless src/web/api.ts declares the field.
    const second = await webApi.api.createRecord({
      kind: 'session',
      title: `another run also calling itself ${runName}`,
      data: { state: 'running' },
    })
    const refused = second.sessionBinding
    if (refused === undefined) throw new Error('the 201 carried no sessionBinding for the refused name')
    expect(refused.alreadyBoundTo).toBe(filed.record.id)
    expect(refused.repointed).toBe(0)

    // And the key really is OPTIONAL, so reading it always means testing for it: writing as a
    // session RECORD ID claims nothing and says nothing. tests/session-binding.test.ts is where
    // the whole rule is pinned.
    webApi.setActor({ ...AS_AGENT, sessionId: filed.record.id })
    const byId = await webApi.api.createRecord({
      kind: 'session',
      title: `filed while writing as ${filed.record.id}`,
      data: { state: 'running' },
    })
    expect(byId.sessionBinding).toBeUndefined()

    webApi.setActor({ ...AS_AGENT })
  })
})

// ============================================================================ writing becomes work

/**
 * The three calls that turn a written line into real work, and the fields a screen cannot see for
 * itself.
 *
 * WHY THESE ARE READ RATHER THAN COUNTED. `carriesEveryField` above proves the BYTES are handed on;
 * it cannot prove the browser can NAME them, because a wrapper returns the whole body whatever its
 * declared type says. That is the failure `sessionBinding` had: the field was on the wire for weeks
 * and no code in the browser could read it. So each assertion below reads the field off the reply,
 * and deleting it from the type in src/web/api.ts stops this file compiling.
 */
describe('the calls that turn a plan line into work carry what a screen cannot see for itself', () => {
  it('says whether filing wrote a "part of" link, and why not when it did not', async () => {
    const plan = await webApi.api.newPlan('the gripper plan', '- the wrist rebuild\n  - reprint the mount')
    const outer = plan.lines[0]
    const inner = plan.lines[1]
    if (outer === undefined || inner === undefined) throw new Error('the plan lost a line on the way in')

    // The item above this one is written but is not filed as work, so NO link is written and the
    // reply says which of the reasons it was. This is the half a caller cannot see: the absence of
    // a link looks exactly like a link nobody asked about.
    const orphaned = await webApi.api.fileLineAsWork(plan.plan.id, inner.id, {
      kind: 'task',
      workspaceId: 'default',
    })
    expect(orphaned.under.linkId).toBeNull()
    expect(orphaned.under.why ?? '').not.toBe('')
    expect(orphaned.recordId).not.toBe('')

    // Now file the item above it, and a fresh line under that one is linked in the same write.
    const parent = await webApi.api.fileLineAsWork(plan.plan.id, outer.id, {
      kind: 'task',
      workspaceId: 'default',
    })
    const third = await webApi.api.writePlanBody(
      plan.plan.id,
      '- the wrist rebuild\n  - reprint the mount\n  - measure it',
    )
    const measured = third.lines[2]
    if (measured === undefined) throw new Error('the third line was not stored')
    const placed = await webApi.api.fileLineAsWork(plan.plan.id, measured.id, {
      kind: 'task',
      workspaceId: 'default',
    })
    expect(placed.under.recordId).toBe(parent.recordId)
    expect(placed.under.linkId).not.toBeNull()
    expect(placed.under.why).toBeNull()
  })

  /**
   * FILING A LINE WHOSE WORDS ARE ALREADY ON FILE OFFERS THE WORK AND FILES THE LINE ANYWAY.
   *
   * ---------------------------------------------------------------------------------------
   * THE OWNER REVERSED THIS ON 17 AUGUST 2026
   * ---------------------------------------------------------------------------------------
   *
   * This test used to hold down a REFUSAL: a line whose words matched a record's title in that
   * project could not be filed, because titles could not repeat. The owner overturned that — "ID is
   * identity. Title is presentation. Titles may repeat. A same-title record may be worth showing as
   * a possible existing object to link to, but title equality must not make Mole Office assume identity
   * or forbid a genuinely distinct record."
   *
   * WHAT THE TEST STILL HOLDS IS THE HALF THAT WAS RIGHT. A person filing a plan must not be shown a
   * sentence about unique titles, and the work that is already there must be named with the request
   * that points this line at it instead — the owner's "become OR link to canonical work", offered at
   * the moment it is useful. That is now an offer beside a filing rather than a refusal.
   */
  it('offers the work that already has these words, and files this line as its own', async () => {
    const plan = await webApi.api.newPlan('two lines saying one thing', '- tune the gains\n- tune the gains')
    const first = plan.lines[0]
    const second = plan.lines[1]
    if (first === undefined || second === undefined) throw new Error('the plan lost a line on the way in')

    const filed = await webApi.api.fileLineAsWork(plan.plan.id, first.id, {
      kind: 'task',
      workspaceId: 'default',
    })
    const again = await webApi.api.fileLineAsWork(plan.plan.id, second.id, {
      kind: 'task',
      workspaceId: 'default',
    })

    // TWO RECORDS, because only the person can say whether two lines saying one thing are one piece
    // of work. Nothing was refused and nothing was assumed.
    expect(again.recordId).not.toBe(filed.recordId)
    // It names the work that was already there, so the reader knows what they have already got.
    const said = (again as unknown as { note: string }).note
    expect(said).toContain('tune the gains')
    expect(said).toContain(filed.recordId)
    // It does not explain Mole Office's storage to somebody who was filing a plan.
    expect(said).not.toContain('Titles are unique')

    // AND THE OTHER ANSWER IS STILL REACHABLE: this line can be pointed at the work that was already
    // there instead, saying which record it is dropping.
    const pointed = await webApi.api.pointLineAtWork(plan.plan.id, second.id, {
      recordId: filed.recordId,
      replacing: again.recordId,
    })
    expect(pointed.work?.id).toBe(filed.recordId)
  })

  it('says what a line pointed at before, and refuses to drop it without being told', async () => {
    const plan = await webApi.api.newPlan('pointing at work that exists', '- calibrate the wrist')
    const line = plan.lines[0]
    if (line === undefined) throw new Error('the plan lost its line on the way in')
    const already = await webApi.api.createRecord({ kind: 'task', title: 'the calibration that exists' })
    const other = await webApi.api.createRecord({ kind: 'task', title: 'a different calibration' })

    const bound = await webApi.api.pointLineAtWork(plan.plan.id, line.id, { recordId: already.id })
    expect(bound.was).toBeNull()
    expect(bound.work.id).toBe(already.id)
    expect(bound.work.title).toBe('the calibration that exists')

    // A line that already points somewhere is refused, and the refusal NAMES what it points at, so
    // the reader can see what they would be dropping. The sentence is the server's own.
    let refusal = ''
    try {
      await webApi.api.pointLineAtWork(plan.plan.id, line.id, { recordId: other.id })
    } catch (err) {
      refusal = webApi.errorMessage(err)
    }
    expect(refusal).toContain(already.id)
    expect(refusal).toContain('replacing')

    // Sending back the id it points at NOW is how Mole Office knows the drop was meant.
    const moved = await webApi.api.pointLineAtWork(plan.plan.id, line.id, {
      recordId: other.id,
      replacing: already.id,
    })
    expect(moved.was).toBe(already.id)
    expect(moved.work.id).toBe(other.id)
  })

  it('refuses hours the line cannot hold, and says why in a sentence worth showing', async () => {
    const plan = await webApi.api.newPlan('hours before filing', '- nobody has filed this line')
    const line = plan.lines[0]
    if (line === undefined) throw new Error('the plan lost its line on the way in')

    let refusal = ''
    try {
      await asThePerson(() => webApi.api.giveLineTime(plan.plan.id, line.id, { horizon: 'month', period: '2026-10' }))
    } catch (err) {
      refusal = webApi.errorMessage(err)
    }
    expect(refusal).toContain('has not been filed')
  })
})

// ============================================================================ how big is this work

/**
 * The browser writes the estimate into the field the server reads it out of.
 *
 * THIS IS THE TEST THAT KEEPS TWO PLACES FROM DRIFTING. `ESTIMATE_FIELD` in src/web/api.ts is the
 * browser's name for the field; `resolveAllocated` on the server is what fills `estimateHours` on
 * every row of the work list. Nothing but this round trip makes the two agree — rename the field on
 * either side and the number written here stops coming back.
 */
describe('the estimate a person types is the estimate the work list reads', () => {
  const rowFor = async (id: string) => {
    const work = await webApi.api.work()
    return work.rows.find((row) => row.id === id) ?? null
  }

  it('writes hours onto the record, and clearing them is not writing zero', async () => {
    const task = await webApi.api.createRecord({ kind: 'task', title: 'size the wrist camera mount' })

    // NOBODY HAS SIZED IT, and that is null rather than 0. A cell drawing this as zero would say
    // somebody looked and said it takes no time.
    const before = await rowFor(task.id)
    expect(before?.estimateHours).toBeNull()

    await webApi.api.setEstimateHours(task.id, 2.5, 'default')
    const sized = await rowFor(task.id)
    expect(sized?.estimateHours).toBe(2.5)

    await webApi.api.setEstimateHours(task.id, null, 'default')
    const cleared = await rowFor(task.id)
    expect(cleared?.estimateHours).toBeNull()
  })

  it('names the project the record is really in when the wrong one is sent', async () => {
    const task = await webApi.api.createRecord({ kind: 'task', title: 'work that lives in default' })
    let refusal = ''
    try {
      await webApi.api.setEstimateHours(task.id, 1, 'a-project-that-is-not-here')
    } catch (err) {
      refusal = webApi.errorMessage(err)
    }
    // The refusal is loud and it says where to look. It is never a silently ignored write.
    expect(refusal).not.toBe('')
    expect(refusal.toLowerCase()).toContain('project')
  })
})

// ============================================================================ the sessions block

describe('GET /api/changes carries the sessions block, and the wrapper carries it on', () => {
  it('resolves the id stored on a change row to the session record and its title', async () => {
    const session = await webApi.api.createRecord({
      kind: 'session',
      title: 'the force-table collation run',
      data: { state: 'running' },
    })
    webApi.setActor({ ...AS_AGENT, sessionId: session.id })
    const note = await webApi.api.createRecord({ kind: 'note', title: 'written during that run' })

    const log = await webApi.api.listChanges({ recordId: note.id })
    expect(log.changes.length).toBeGreaterThan(0)
    // The row stores the record ID, which is the thing that used to be printed on screen.
    expect(log.changes[0]?.sessionId).toBe(session.id)

    const block = log.sessions.find((s) => s.stored === session.id)
    expect(block?.title).toBe('the force-table collation run')
    expect(block?.recordId).toBe(session.id)
    expect(block?.unresolved).toBe(false)
  })

  it('reports the filter it was given, which only arrives when one is asked for', async () => {
    const plain = await webApi.api.listChanges({ limit: 5 })
    expect(plain.session).toBeUndefined()

    const filtered = await webApi.api.listChanges({ session: 'a name nothing answers to' })
    expect(filtered.session?.asked).toBe('a name nothing answers to')
    expect(filtered.session?.matchedBy).toBe('unresolved')
  })
})

// ============================================================================ naming a session

describe('a change row names its session instead of printing an id', () => {
  const change = (over: Partial<Parameters<CL['sessionOf']>[0]> = {}) => ({
    id: 'chg-1',
    recordId: 'rec-1',
    origin: 'authored' as const,
    op: 'create' as const,
    actorType: 'agent' as const,
    actorId: 'claude-code',
    sessionId: 'NS6wp_rmduzo',
    field: null,
    oldValue: null,
    newValue: null,
    at: '2026-08-08 11:00:00',
    ...over,
  })

  const resolved = [
    {
      stored: 'NS6wp_rmduzo',
      recordId: 'NS6wp_rmduzo',
      title: 'the checkpoint 3 run',
      matchedBy: 'recordId' as const,
      rows: 4,
      unresolved: false, elsewhereIn: null,
    },
  ]

  it('shows the title, linked to the session record', () => {
    const previous = mode.currentMode()
    try {
      mode.setMode('normal')
      const normal = body(h(cl.SessionRef, { change: change(), sessions: resolved }))
      expect(normal).toContain('the checkpoint 3 run')
      expect(normal).toContain('href="#/r/NS6wp_rmduzo"')
      expect(normal).toContain('title="the checkpoint 3 run"')
      expect(normal).not.toContain('title="session record NS6wp_rmduzo')
      expect(normal).not.toContain('>NS6wp_rmduzo<')

      // The identifier remains available in the developer tooltip, where it is useful for logs.
      mode.setMode('inspect')
      const inspect = body(h(cl.SessionRef, { change: change(), sessions: resolved }))
      expect(inspect).toContain('title="session record NS6wp_rmduzo')
    } finally {
      mode.setMode(previous)
    }
  })

  it('says a stored run name is unresolved rather than dressing it up as a title', () => {
    const sessions = [
      { stored: 'checkpoint3', recordId: null, title: null, matchedBy: 'unresolved' as const, rows: 2, unresolved: true, elsewhereIn: null },
    ]
    const previous = mode.currentMode()
    try {
      mode.setMode('normal')
      const normal = body(h(cl.SessionRef, { change: change({ sessionId: 'checkpoint3' }), sessions }))
      expect(normal).toContain('Mole Office could not find a name for this run.')
      expect(normal).not.toContain('checkpoint3')
      expect(normal).not.toContain('href=')

      mode.setMode('inspect')
      const inspect = body(h(cl.SessionRef, { change: change({ sessionId: 'checkpoint3' }), sessions }))
      expect(inspect).toContain('checkpoint3')
      expect(inspect).toContain('no session record answers to this name')
    } finally {
      mode.setMode(previous)
    }
  })

  it('says the titles were not fetched when there is no block, which is a different sentence', () => {
    const previous = mode.currentMode()
    try {
      mode.setMode('normal')
      const normal = body(h(cl.SessionRef, { change: change(), sessions: null }))
      expect(normal).toContain("The run&#x27;s name was not loaded with these changes.")
      expect(normal).not.toContain('NS6wp_rmduzo')

      mode.setMode('inspect')
      const inspect = body(h(cl.SessionRef, { change: change(), sessions: null }))
      expect(inspect).toContain('titles were not fetched')
      expect(inspect).toContain('NS6wp_rmduzo')
    } finally {
      mode.setMode(previous)
    }
    expect(cl.sessionOf(change(), null).at).toBe('unjoined')
    // A row whose stored value nobody resolved is the same sentence: this page cannot name it.
    expect(cl.sessionOf(change(), []).at).toBe('unjoined')
  })

  it('says nothing at all when a person did the write', () => {
    expect(cl.sessionOf(change({ sessionId: null }), resolved).at).toBe('none')
    expect(body(h(cl.SessionRef, { change: change({ sessionId: null }), sessions: resolved }))).toBe('')
  })

  it('draws the name in the change log and in the home page’s row, from one resolution', () => {
    const log = body(h(cl.ChangeLog, { changes: [change()], sessions: resolved }))
    expect(log).toContain('the checkpoint 3 run')
    expect(log).not.toContain('>NS6wp_rmduzo<')

    const meta = body(h(hp.ChangeMeta, { change: change(), sessions: resolved }))
    expect(meta).toContain('the checkpoint 3 run')
    expect(meta).toContain('href="#/r/NS6wp_rmduzo"')
    expect(meta).not.toContain('session NS6wp_rmduzo')
  })
})

// ============================================================================ the unclaimed sweep

/**
 * GET /api/resources/orphans, with the sweep the ledger now runs on every report.
 *
 * Typed as the server's own `UnclaimedSweep`, so a field renamed on the server is a failed
 * typecheck here rather than a block that quietly stops being drawn — which is the whole
 * subject of this file.
 */
function sweep(over: Partial<UnclaimedSweep> = {}): UnclaimedSweep {
  return {
    summary:
      '2 live things are running on this machine that no session claims: gpu 118822, port 8787. That is a ' +
      'different and worse statement than "no orphans".',
    searched: ['every listening socket on this machine — 41 sockets', 'GPU compute processes (nvidia-smi) — 1 process'],
    resources: [
      {
        type: 'gpu',
        key: '118822',
        detail: 'python sim.py — holding 9042 MiB of GPU memory',
        holder: { pid: 118822, pgid: 118800, ppid: 1, command: 'python sim.py', startedAt: '2026-07-28 09:12:00' },
        upFor: { seconds: 950400, human: '11 days' },
        note: 'Pid 118822 is holding 9042 MiB of GPU memory, up 11 days, and no session in the ledger claims it.',
      },
      {
        type: 'port',
        key: '8787',
        detail: 'node src/server/index.ts — 0.0.0.0:8787/tcp',
        holder: { pid: 3302512, pgid: 3302496, ppid: 1, command: 'node src/server/index.ts', startedAt: '2026-08-08 08:00:00' },
        upFor: { seconds: 14400, human: '4 hours' },
        note: 'Port 8787 is held by pid 3302512, process group 3302496, up 4 hours, and no session in the ledger claims it. Kill it by hand if it is yours: kill -TERM -3302496',
      },
    ],
    skipped: [{ what: '3 listening sockets — 22, 53, 631', reason: 'held by a process this user may not inspect.' }],
    unchecked: [],
    ...over,
  }
}

const orphansPayload = (over: Record<string, unknown> = {}) => ({
  checkedAt: '2026-08-08 12:18:17',
  platform: 'linux',
  orphans: [],
  stillOwned: [],
  unchecked: [],
  searched: ['the “Running on this machine” list — 0 live rows written down by sessions'],
  unclaimed: sweep(),
  ...over,
})

describe('readOrphansPayload reads the unclaimed sweep, which is the louder half', () => {
  it('reads every row, with the server’s own note kept whole', () => {
    const read = sp.readOrphansPayload(orphansPayload())
    expect(read.problems).toEqual([])
    expect(read.unclaimed?.resources).toHaveLength(2)
    const gpu = read.unclaimed?.resources.find((r) => r.key === '118822')
    expect(gpu?.kind).toBe('gpu')
    expect(gpu?.upFor).toBe('11 days')
    expect(gpu?.pid).toBe(118822)
    expect(gpu?.pgid).toBe(118800)
    expect(gpu?.note).toContain('no session in the ledger claims it')
    expect(read.unclaimed?.summary).toContain('worse statement than "no orphans"')
    expect(read.unclaimed?.skipped[0]?.reason).toContain('may not inspect')
  })

  it('answers null when the reply carries no sweep, which is not "nothing unclaimed"', () => {
    const { unclaimed, ...withoutSweep } = orphansPayload()
    void unclaimed
    const read = sp.readOrphansPayload(withoutSweep)
    expect(read.unclaimed).toBeNull()
    // Not filed as a row-level problem: it is a whole question left unanswered, and it is drawn
    // where the answer would have been. The panel test below is what pins that.
    expect(read.problems).toEqual([])
  })

  it('refuses a row of a kind it cannot name, and says which one it dropped', () => {
    const payload = orphansPayload({ unclaimed: sweep({ resources: [{ ...sweep().resources[0]!, type: 'thread' as never }] }) })
    const read = sp.readOrphansPayload(payload)
    expect(read.unclaimed?.resources).toEqual([])
    expect(read.problems.join(' ')).toContain('port, gpu, container')
  })

  it('keeps a row whose note or detail is missing, and says which is missing', () => {
    const bare = { ...sweep().resources[0]!, detail: '', note: '' }
    const read = sp.readOrphansPayload(orphansPayload({ unclaimed: sweep({ resources: [bare] }) }))
    expect(read.unclaimed?.resources).toHaveLength(1)
    expect(read.problems.join(' ')).toContain('carries no `detail`')
    expect(read.problems.join(' ')).toContain('carries no `note`')
  })

  it('says so when the sweep itself is unreadable, rather than reporting a clean machine', () => {
    const read = sp.readOrphansPayload(orphansPayload({ unclaimed: 'nothing running' }))
    expect(read.unclaimed).toBeNull()
    expect(read.problems.join(' ')).toContain('not an object')
  })
})

describe('the machine surface draws what nobody claims, louder than an orphan', () => {
  // The surface alone, which is what the sessions page draws under "This machine".
  const surface = (unclaimed: Parameters<SP['MachineSurface']>[0]['unclaimed']) => body(h(sp.MachineSurface, { unclaimed }))
  // The whole sessions page in the inspect projection, for what only the page can show: the order of
  // its two machine panels, and what it draws when a caller leaves the sweep out.
  let pg: typeof import('../src/web/pages/SessionsPage.tsx')
  beforeAll(async () => {
    pg = await import('../src/web/pages/SessionsPage.tsx')
  })
  const page = (over: Partial<Parameters<typeof pg.SessionsView>[0]> = {}) => {
    const previous = mode.currentMode()
    mode.setMode('inspect')
    try {
      return body(
        h(pg.SessionsView, {
          lines: [],
          orphans: [],
          problems: [],
          now: new Date(2026, 7, 8, 12, 0, 0).getTime(),
          read: {
            at: new Date(2026, 7, 8, 12, 0, 0).getTime(),
            inFlight: false,
            inFlightFromAPress: false,
            theLastReadWasFromAPress: false,
            failed: null,
            onReadAgain: () => {
              throw new Error('the test never re-reads')
            },
          },
          onRelease: async () => {
            throw new Error('the test never releases anything')
          },
          onReread: () => {
            throw new Error('the test never re-reads')
          },
          ...over,
        }),
      )
    } finally {
      mode.setMode(previous)
    }
  }

  it('names every unclaimed thing, with its age and what to run by hand', () => {
    const html = surface(sp.readOrphansPayload(orphansPayload()).unclaimed)
    expect(html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ')).toContain('2 resources running that no session claims')
    expect(html).toContain('9042 MiB of GPU memory')
    expect(html).toContain('11 days')
    expect(html).toContain('kill -TERM -3302496')
  })

  it('says nobody can be blamed for it, which is what makes it worse than an orphan', () => {
    const html = surface(sp.readOrphansPayload(orphansPayload()).unclaimed)
    expect(html).toContain(t('g6a.sessions.nobodyClaimsIt', { value1: ' · pid 3302512', value2: ', process group 3302496' }))
    expect(html).toContain('No session registered these resources, so their ownership is unknown.')
    // Never the orphan row's sentence: there is no session to have left it.
    expect(html).not.toContain('left by')
  })

  it('offers no release button, because the server can describe no release for these', () => {
    const html = surface(sp.readOrphansPayload(orphansPayload()).unclaimed)
    expect(html).not.toContain('Release…')
  })

  it('draws it ABOVE the orphans, so the unattributable is read first', () => {
    const orphans = sp.readOrphansPayload({
      orphans: [
        {
          id: 'orph-proc',
          kind: 'process',
          describe: 'node src/server/index.ts — pid 3302512, group 3302496, up 10d20h',
          ageSeconds: 936000,
          sessionId: 'rec-done',
          sessionTitle: 'seed rewrite',
          releaseAction: null,
        },
      ],
      unclaimed: sweep(),
    })
    const html = page({ orphans: orphans.orphans, unclaimed: orphans.unclaimed })
    // Read inside the machine section, so the one-line summary above the runs is not what is found.
    const machine = html.indexOf('id="machine"')
    const unclaimedAt = html.indexOf('no session claims', machine)
    const orphanAt = html.indexOf('1 thing still running after its session ended', machine)
    expect(machine).toBeGreaterThan(-1)
    expect(unclaimedAt).toBeGreaterThan(-1)
    expect(orphanAt).toBeGreaterThan(-1)
    expect(unclaimedAt).toBeLessThan(orphanAt)
  })

  it('says the question was not answered when the reply carried no sweep', () => {
    const html = surface(null)
    expect(html).toContain(t('g6a.sessions.thisReplyDoesNotSayWhatIsRunning'))
    expect(html).toContain(t('g6a.sessions.sweepSoNothingHereCanTellYouWhether2'))
  })

  it('leaving the prop out says exactly the same thing, so the question cannot be hidden', () => {
    const html = page()
    expect(html.slice(html.indexOf('id="machine"'))).toContain(t('g6a.sessions.thisReplyDoesNotSayWhatIsRunning'))
  })

  it('says the machine was read and was clear, without the alarm', () => {
    const clear = sp.readOrphansPayload(
      orphansPayload({ unclaimed: sweep({ resources: [], summary: 'Nothing is running on this machine that a live ledger row does not claim.' }) }),
    )
    const html = surface(clear.unclaimed)
    expect(html).toContain('Nothing is running on this machine that a live ledger row does not claim.')
    expect(html).not.toContain('running that no session claims')
  })

  it('prints what the sweep could not look at, even when it found nothing', () => {
    const partial = sp.readOrphansPayload(
      orphansPayload({
        unclaimed: sweep({
          resources: [],
          summary: 'Nothing is running that a live ledger row does not claim.',
          unchecked: ['nvidia-smi is not installed, so GPU memory could not be read at all.'],
        }),
      }),
    )
    const html = surface(partial.unclaimed)
    expect(html).toContain('nvidia-smi is not installed')
  })
})
