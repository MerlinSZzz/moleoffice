// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TWO HEADERS THAT SAY WHICH RUN A CALL BELONGS TO, AND THE STAMP EVERY REQUEST LEAVES BEHIND.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THESE TWO HEADERS NEEDED A RULE AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * `x-mole-office-trace` and `x-mole-office-purpose` change nothing Mole Office answers. They are read so that one
 * run's calls can be counted together afterwards. That makes them look like somebody else's
 * problem, and the first design put their shape check inside the code that does the counting. That
 * version is the one this file exists to prevent coming back: with the check in the recorder, a
 * malformed header is a 400 when recording is on and a 200 when it is off, so the caller's contract
 * depends on a setting the caller cannot see — and no test could ever assert "recording changes
 * nothing about what Mole Office answers", because recording would change this.
 *
 * So the check is `refuseBadTraceHeaders` in src/server/lib/http.ts, beside the four refusals
 * `actorFrom` already ran, called from `actorFrom` AND from `workspaceFrom`. Those two are exactly
 * the set of routes where the other header refusals already run, so nothing new is being visited.
 *
 * ---------------------------------------------------------------------------------------
 * THE SECOND HALF: BEING ON THE LIST IS WHAT MAKES A MISSPELLING REFUSED RATHER THAN IGNORED
 * ---------------------------------------------------------------------------------------
 *
 * `looksLikeActorHeader` trips on any header name carrying the product's name. So a new header of
 * this product's that is NOT added to the list of names the server reads is refused on every write
 * as a misspelt identity claim — the two new headers would have been unusable. Added to the list,
 * they work, and their own misspellings (`x-mole-office-tarce`) become refusals instead of silence.
 * Both halves are asserted here because each one alone is a broken product.
 *
 * ---------------------------------------------------------------------------------------
 * THE THIRD THING, WHICH IS NOT A HEADER: THE STAMP
 * ---------------------------------------------------------------------------------------
 *
 * `actorFrom` has 64 call sites and `workspaceOf` has 92, every one inside a handler with a local
 * result. Anything outside a handler that wants those answers must either work them out a second
 * time — the defect this repository keeps producing, and worse here because `actorFrom` REFUSES
 * things, so a second call would start refusing reads that are answered today — or read what the
 * first call worked out. So both functions stamp what they resolved.
 *
 * BOTH FUNCTIONS RETURN FROM TWO PLACES AND THE EASY ONE TO MISS IS `actorFrom`'s FIRST. A request
 * that sent no identity header at all — the person typing by hand — leaves at an early return. Miss
 * that one and a hand-typed write looks like a write nobody ever resolved an identity for. Those
 * are different facts and only one of them is true, so all four returns are asserted separately.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyRequest } from 'fastify'

import { expectPanelError, freshDb, THE_PRESS_OF_AN_UNROUTED_REQUEST, type TestDb } from './helpers.ts'

/** Loaded dynamically below, for the reason written at the top of helpers.ts. */
type Http = typeof import('../src/server/lib/http.ts')

let db: TestDb
let http: Http

beforeAll(async () => {
  // freshDb points MOLE_OFFICE_DB at a throwaway file BEFORE anything opens a database. http.ts reaches
  // one through records.ts, so a static import at the top of this file would open the real
  // ./data/panelx.db the moment the runner loaded it.
  db = await freshDb()
  http = await import('../src/server/lib/http.ts')
}, 60_000)

afterAll(() => {
  db.close()
})

/** A request that carries nothing but headers, which is the whole of what these functions read. */
function request(headers: Record<string, string | string[] | undefined>): FastifyRequest {
  return { headers } as unknown as FastifyRequest
}

/**
 * Every header this server reads, in the server's own words.
 *
 * Built from the three exported declarations rather than typed out, so a header added tomorrow is
 * covered on the day it is added rather than the day somebody remembers this file. The server keeps
 * its own list private on purpose — it is for the misspelling check and nothing else — and this is
 * the same list reached the only other way there is.
 */
function everyHeaderTheServerReads(): string[] {
  return [...Object.values(http.ACTOR_HEADERS), http.WORKSPACE_HEADER, ...Object.values(http.TRACE_HEADERS)]
}

describe('the two run headers are headers the server reads', () => {
  it('lets a write through carrying both of them, which is only true because they are on the list', () => {
    // WITHOUT THE LIST ENTRY THIS IS A 400. `looksLikeActorHeader` trips on any name containing
    // `panelx`, so an unlisted `x-mole-office-trace` is refused as a misspelt identity claim and the
    // header is unusable by anybody.
    const actor = http.actorFrom(
      request({
        [http.ACTOR_HEADERS.type]: 'agent',
        [http.ACTOR_HEADERS.id]: 'claude-code',
        [http.TRACE_HEADERS.trace]: 'wave-1-step-2',
        [http.TRACE_HEADERS.purpose]: 'module-work',
      }),
    )
    expect(actor).toEqual({ type: 'agent', id: 'claude-code', sessionId: null, press: THE_PRESS_OF_AN_UNROUTED_REQUEST })
  })

  it('lets a read through carrying both of them, where the workspace is resolved and no actor is', () => {
    const claim = http.workspaceFrom(
      request({
        [http.WORKSPACE_HEADER]: 'panelx',
        [http.TRACE_HEADERS.trace]: 'wave-1-step-2',
        [http.TRACE_HEADERS.purpose]: 'module-work',
      }),
    )
    expect(claim).toEqual({ id: 'panelx', stated: true })
  })

  it('refuses a misspelling of either of them, which is what being on the list buys', () => {
    for (const name of Object.values(http.TRACE_HEADERS)) {
      // A stray character in the last segment: `x-mole-office-trace` becomes `x-mole-office-xtrace`.
      // Derived from the name rather than from a written-out prefix, which is what this line used to
      // do. It said `name.replace('mole-office-', 'panelx-x')`, and when the headers were renamed on 28
      // August 2026 that replace stopped matching, so the "misspelling" was the real name and the
      // test would have asserted that the server refuses a header it reads. The guard on the next
      // line is what caught it.
      const misspelt = name.replace(/-([a-z]+)$/, '-x$1')
      expect(misspelt, 'a misspelling must differ from the real name').not.toBe(name)
      const err = expectPanelError(db, () => http.actorFrom(request({ [misspelt]: 'anything' })), 400)
      expect(err.message, `the refusal must quote what was sent: ${err.message}`).toContain(misspelt)
    }
  })

  it('names every header the server reads when it refuses a misspelt one, and counts none of them', () => {
    // THE REFUSAL IS THE ONLY PLACE A CALLER LEARNS THE REAL NAMES, so it has to carry all of them.
    // It used to open "The four it reads are" and then list them, which is the same number
    // written twice — once as a word and once as the length of the list — with nothing making the
    // two agree. There are six now. The word is gone and the list says how many.
    const err = expectPanelError(db, () => http.actorFrom(request({ 'x-mole-office-actor': 'agent' })), 400)
    for (const name of everyHeaderTheServerReads()) {
      expect(err.message, `the refusal must name ${name}: ${err.message}`).toContain(name)
    }
    expect(err.message, 'the refusal must not count the headers in words').not.toMatch(
      /\b(three|four|five|six|seven) (?:Mole Office|Mole Office) reads\b/,
    )
  })
})

describe('a run header that cannot mean what it was sent to mean is refused', () => {
  it('refuses a blank trace, which would have counted this call under no run at all', () => {
    const err = expectPanelError(
      db,
      () => http.actorFrom(request({ [http.TRACE_HEADERS.trace]: '' })),
      400,
    )
    expect(err.message).toContain(http.TRACE_HEADERS.trace)
    expect(err.message).toContain('empty value')
  })

  it('refuses a blank purpose the same way', () => {
    const err = expectPanelError(
      db,
      () => http.actorFrom(request({ [http.TRACE_HEADERS.purpose]: '  ' })),
      400,
    )
    expect(err.message).toContain(http.TRACE_HEADERS.purpose)
    expect(err.message).toContain('empty value')
  })

  it('refuses a trace holding anything a name cannot hold, and quotes the value back', () => {
    // Each of these groups nothing: a value with a space, a comma or a line break in it is not one
    // name, and the hole it leaves would be found months later as a gap in a count.
    for (const bad of ['wave 1', 'a,b', 'trace\nname', 'a'.repeat(65), 'trace/one']) {
      const err = expectPanelError(db, () => http.actorFrom(request({ [http.TRACE_HEADERS.trace]: bad })), 400)
      expect(err.message, `the refusal must quote what was sent: ${err.message}`).toContain(bad)
      expect(err.message).toContain(http.TRACE_HEADERS.trace)
    }
  })

  it('accepts the shapes a trace name is allowed to have, so the rule costs nothing real', () => {
    for (const good of ['a', 'wave-1_step-2', 'A'.repeat(64), '2026-08-25T08-00-00']) {
      expect(
        http.actorFrom(request({ [http.ACTOR_HEADERS.type]: 'agent', [http.ACTOR_HEADERS.id]: 'x', [http.TRACE_HEADERS.trace]: good })),
      ).toEqual({ type: 'agent', id: 'x', sessionId: null, press: THE_PRESS_OF_AN_UNROUTED_REQUEST })
    }
  })

  it('refuses on a READ as well, which is the half that stops the rule depending on a setting', () => {
    // workspaceFrom is what every read goes through. If the check only ran in actorFrom it would
    // never see a GET, and a malformed trace on a read would be silently dropped.
    const err = expectPanelError(
      db,
      () => http.workspaceFrom(request({ [http.TRACE_HEADERS.trace]: 'two words' })),
      400,
    )
    expect(err.message).toContain(http.TRACE_HEADERS.trace)
  })
})

describe('what a request resolved is stamped where something outside the handler can read it', () => {
  it('stamps the actor on the return for a caller that named itself', () => {
    const req = request({ [http.ACTOR_HEADERS.type]: 'agent', [http.ACTOR_HEADERS.id]: 'claude-code' })
    const actor = http.actorFrom(req)
    expect(http.resolvedActorOf(req)).toBe(actor)
  })

  it('stamps the actor on the EARLY return too, for the person typing by hand', () => {
    // THE ONE THAT IS EASY TO MISS. A request sending none of the three actor headers leaves
    // actorFrom at its first return, before anything is read. Missing the stamp there would make a
    // hand-typed write indistinguishable from a request nobody ever resolved an identity for.
    const req = request({})
    const actor = http.actorFrom(req)
    expect(actor.stated).toBe(false)
    expect(http.resolvedActorOf(req)).toBe(actor)
  })

  it('stamps the project on the return for a caller that named one', () => {
    const req = request({ [http.WORKSPACE_HEADER]: 'panelx' })
    const claim = http.workspaceFrom(req)
    expect(claim).toEqual({ id: 'panelx', stated: true })
    expect(http.resolvedWorkspaceOf(req)).toBe(claim)
  })

  it('stamps the project on the return for a caller that named none, where the default was taken', () => {
    const req = request({})
    const claim = http.workspaceFrom(req)
    expect(claim.stated).toBe(false)
    expect(http.resolvedWorkspaceOf(req)).toBe(claim)
  })

  it('reads back as nobody-resolved-one when nothing on the path asked, which is every ordinary read', () => {
    // UNDEFINED IS AN ANSWER AND IT IS NOT THE OWNER. A reader that turned an unstamped request
    // into the person would be inventing an identity for a request that made no claim.
    const req = request({ [http.ACTOR_HEADERS.type]: 'agent', [http.ACTOR_HEADERS.id]: 'claude-code' })
    expect(http.resolvedActorOf(req)).toBeUndefined()
    expect(http.resolvedWorkspaceOf(req)).toBeUndefined()
  })

  it('leaves no stamp when the request was refused, because nothing was resolved to stamp', () => {
    const req = request({ [http.ACTOR_HEADERS.type]: '' })
    expectPanelError(db, () => http.actorFrom(req), 400)
    expect(http.resolvedActorOf(req)).toBeUndefined()
  })

  it('keeps the two stamps apart on one request that resolved both', () => {
    const req = request({
      [http.ACTOR_HEADERS.type]: 'agent',
      [http.ACTOR_HEADERS.id]: 'claude-code',
      [http.WORKSPACE_HEADER]: 'panelx',
    })
    const actor = http.actorFrom(req)
    const claim = http.workspaceFrom(req)
    expect(http.resolvedActorOf(req)).toBe(actor)
    expect(http.resolvedWorkspaceOf(req)).toBe(claim)
  })
})
