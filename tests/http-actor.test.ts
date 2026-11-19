// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO A REQUEST SAYS IT IS: WHAT HAPPENS WHEN IT MISSPELLS THE HEADER NAME, AND WHAT HAPPENS WHEN IT
 * SPELLS THE NAME RIGHT AND LEAVES THE VALUE BLANK.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIRST DEFECT THIS FILE WAS WRITTEN FOR
 * ---------------------------------------------------------------------------------------
 *
 * `actorFrom` in src/server/lib/http.ts reads `x-mole-office-actor-type`. A request that sent the
 * header with the `-type` dropped arrived carrying no actor type at all, and a request with no
 * actor type is attributed to the owner. So one dropped `-type` turned an agent into the one
 * identity allowed to write `decision` records, and the reply was 201.
 *
 * The misspelling is not hypothetical — it was made by hand while testing this server, which is how
 * it was found. It was spelled `x-panelx-actor` on the day, because these headers began
 * `x-panelx-` until the product was renamed on 28 August 2026. The spellings below are derived from
 * the name they carry now, and one row keeps the old prefix on purpose: see it for why. An unrecognised VALUE (`x-mole-office-actor-type: robot`) was already refused with a 400,
 * and tests/human-only-http.ts pins that. Nothing looked at the header NAME, so the likelier of the
 * two mistakes was the silent one.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO HALVES OF THE RULE, AND WHY BOTH ARE TESTED HERE
 * ---------------------------------------------------------------------------------------
 *
 * REFUSED: a header that looks like an attempt to name the writer and is not one of the three
 * Mole Office reads. The refusal is a 400 naming all three, because a caller that misspelt one of them
 * cannot fix it from a message that only says "no".
 *
 * KEPT: a request carrying no actor headers at all still defaults to the owner. That is how a
 * person writing from the browser or a bare `curl` is filed, and refusing it would break the
 * product. It is tested here as hard as the refusal is, because "tighten the actor rule" is exactly
 * the kind of change that would quietly take it away — and `explore.md` records a proposal to do so.
 *
 * The third thing tested here is the one that would make the rule worse than the defect: ordinary
 * headers every browser sends must be untouched. `user-agent` is the trap — it carries the word
 * "agent" — and a rule that tripped on it would refuse every request the product makes.
 *
 * ---------------------------------------------------------------------------------------
 * THE SECOND DEFECT, FOUND NEXT DOOR TO THE FIRST
 * ---------------------------------------------------------------------------------------
 *
 * With the name checked, the VALUE was still read by truthiness, and an empty string is falsy. So
 * `x-mole-office-actor-type: ` — the header sent, the value blank — took the absent-header path and was
 * attributed to `human`. `design/adversarial/authorization.md` §2 got all four human-only verbs on a
 * `decision` through that way, filed as `human:nightly-sweep`: the agent's own name under the one
 * identity allowed to write decisions. This is the misspelling defect again, through the correctly
 * spelled header, and it is likelier — a client that builds headers from variables produces exactly
 * this when the variable is unset.
 *
 * All three headers now answer the same way, and the tests below state the answer for each one
 * separately, because each blank header costs something different: a blank type is a promotion to
 * the human, a blank id files an agent's work under the person's name, and a blank session loses the
 * run's writes from `GET /api/changes?session=`.
 *
 * ---------------------------------------------------------------------------------------
 * THE THIRD DEFECT, WHICH IS THE SAME MISTAKE WITH THE HEADER LEFT OUT ALTOGETHER
 * ---------------------------------------------------------------------------------------
 *
 * With the name checked and the value checked, what was left was the header that never arrived.
 * Measured on a real socket on 2026-08-11, before the fix, every line a 201:
 *
 *     x-mole-office-actor-id: nightly-sweep, nothing else  ->  human:nightly-sweep
 *     x-mole-office-session: sess-1, nothing else          ->  human:owner, in run sess-1
 *     x-mole-office-actor-type: human, no id               ->  human:owner
 *     x-mole-office-actor-type: agent, no id               ->  agent:owner
 *
 * design/DECISIONS-PENDING.md §10 raised the first line and the owner has now settled it: the human
 * default is for a request that claims NOTHING, and any of the three headers is a claim. The fourth
 * line is the one §10's own table does not list, and it is the blank-id damage reached by omission —
 * an agent that says what it is and not who it is has its work filed under **the person's name**, in
 * a log that is never rewritten.
 *
 * A fourth shape came out of the same measurement and is fixed with them: a header sent TWICE. Node
 * joins repeats of these names with ", " before this server sees them, so `a` and `b` became the
 * writer `a, b` and two run names became the run `s1, s2`. Nobody is called that.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS TESTS THE FUNCTION, THEN THE PRODUCT, THEN THE WIRE
 * ---------------------------------------------------------------------------------------
 *
 * The function tests cover the many spellings, because that is where the generosity of the rule
 * lives and one `app.inject` per spelling would be slow for no gain. The `inject` tests then prove
 * the product applies it where a caller stands — the lesson tests/human-only-http.ts encodes, where
 * a correct library guard sat behind a route that returned 200 before reaching it.
 *
 * AND THEN A REAL SOCKET, because neither of the first two can see the last two defects. Every one
 * of the four was a difference between what a caller SENT and what this server was handed, and
 * `inject` does not have a wire for that difference to happen on: it joins an array of values with
 * a comma where Node joins with ", ", and it cannot express a header sent twice at all. So the last
 * group listens on a port and drives it two ways — `fetch`, which is the browser and every
 * JavaScript agent, and hand-written request bytes, which is what `curl` puts on the socket. The
 * two clients make the unset-variable mistake in DIFFERENT SHAPES, measured rather than assumed:
 * `fetch` sends the header present and empty, and `curl -H 'name: '` deletes it and sends nothing.
 * Both now get an answer instead of a promotion, and the tests say which route each one takes.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { connect } from 'node:net'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyRequest } from 'fastify'

import { apiApp, expectPanelError, freshDb, THE_PRESS_OF_AN_UNROUTED_REQUEST, type TestDb } from './helpers.ts'

/** Loaded dynamically below, for the reason written at the top of helpers.ts. */
type Http = typeof import('../src/server/lib/http.ts')

let db: TestDb
let http: Http

beforeAll(async () => {
  // freshDb points MOLE_OFFICE_DB at a throwaway file BEFORE anything opens a database. http.ts reaches
  // one through records.ts, so importing it statically at the top of this file would open the real
  // ./data/panelx.db the moment the runner loaded it.
  db = await freshDb()
  http = await import('../src/server/lib/http.ts')
}, 60_000)

afterAll(() => {
  db.close()
})

/**
 * A request that carries nothing but headers.
 *
 * `actorFrom` reads `req.headers` and nothing else, so this is the whole of what it sees. The cast
 * says that in one place rather than at every call.
 */
function request(headers: Record<string, string | string[] | undefined>): FastifyRequest {
  return { headers } as unknown as FastifyRequest
}

/** The three names, in the server's own words, so this file cannot drift from the declaration. */
function names(): string[] {
  return Object.values(http.ACTOR_HEADERS)
}

/** Every refusal must be usable: it names what was sent and all three of the real headers. */
function expectRefusal(headers: Record<string, string>, sent: string): void {
  const err = expectPanelError(db, () => http.actorFrom(request(headers)), 400)
  expect(err.message, `the refusal must quote the header that was sent: ${err.message}`).toContain(sent)
  for (const name of names()) {
    expect(err.message, `the refusal must name ${name}: ${err.message}`).toContain(name)
  }
}

describe('the three headers Mole Office reads', () => {
  it('reads all three when they are spelled correctly', () => {
    const actor = http.actorFrom(
      request({
        [http.ACTOR_HEADERS.type]: 'agent',
        [http.ACTOR_HEADERS.id]: 'claude-code',
        [http.ACTOR_HEADERS.session]: 'sess-http-actor',
      }),
    )
    expect(actor).toEqual({ type: 'agent', id: 'claude-code', sessionId: 'sess-http-actor', press: THE_PRESS_OF_AN_UNROUTED_REQUEST })
  })

  it(`still files a request carrying no actor headers as human/${THE_TEST_OFFICES_OWNER.id}`, () => {
    // THIS DEFAULT IS THE PRODUCT, NOT AN OVERSIGHT. It is how a person writing from the browser or
    // a bare curl is attributed. explore.md carries a proposal to refuse the header-less write
    // instead; until that is decided by the owner, taking this away breaks writing by hand.
    // `stated: false` is owner decision §36: the identity is unchanged — this is still the person
    // typing by hand for every ordinary write — but a governance act now has to be said out loud,
    // and this is the flag `assertMayWrite` reads to tell silence from a claim.
    expect(http.actorFrom(request({}))).toEqual({ type: 'human', id: THE_TEST_OFFICES_OWNER.id, sessionId: null, stated: false })
  })

  // AN iPHONE'S MEDIA PLAYER IS NOT REFUSED (acceptance finding 74): Apple's AppleCoreMedia sends x-playback-session-id
  // with every request a <video> makes, and the rule refused it, so no report video played on the owner's iPhone. A real
  // misspelling of the session header is still refused.
  // MUTATION PROOF, 24 September 2026, alone in src/server/lib/http.ts: the exemption taken out, and this goes red.
  it("leaves the header Apple's media player sends alone, and still refuses a misspelt session header", () => {
    expect(http.actorFrom(request({ 'x-playback-session-id': '0A1B2C3D-4E5F-6789-ABCD-EF0123456789' }))).toEqual({
      type: 'human',
      id: THE_TEST_OFFICES_OWNER.id,
      sessionId: null,
      stated: false,
    })
    expect(() => http.actorFrom(request({ 'x-sessionid': 'sess-1' }))).toThrow(/is not a header Mole Office reads/)
  })

  it('leaves the headers every ordinary request carries alone', () => {
    // The rule must not cost more than the defect. `user-agent` is the trap: it contains the word
    // "agent", and a rule that tripped on it would refuse every request the browser makes.
    const ordinary = {
      host: '127.0.0.1:8787',
      connection: 'keep-alive',
      'content-type': 'application/json',
      'content-length': '42',
      accept: '*/*',
      'accept-encoding': 'gzip, deflate, br',
      'accept-language': 'en-GB,en;q=0.9',
      'user-agent': 'Mozilla/5.0',
      'x-user-agent': 'some-proxy/1.2',
      'sec-fetch-mode': 'cors',
      origin: 'http://localhost:5173',
      referer: 'http://localhost:5173/',
      cookie: 'theme=dark',
      // An invented private-network address, built from its numbers because the address scan refuses one written out.
      'x-forwarded-for': [100, 101, 3, 4].join('.'),
      'x-request-id': 'abc123',
      'cache-control': 'no-cache',
    }
    // Same shape as the header-less case above, and for the same reason: none of these is an actor
    // header, so nothing here states who is asking.
    expect(http.actorFrom(request(ordinary))).toEqual({ type: 'human', id: THE_TEST_OFFICES_OWNER.id, sessionId: null, stated: false })

    // And they ride along beside real actor headers without disturbing them.
    const withActor = http.actorFrom(
      request({ ...ordinary, [http.ACTOR_HEADERS.type]: 'agent', [http.ACTOR_HEADERS.id]: 'claude-code' }),
    )
    expect(withActor).toEqual({ type: 'agent', id: 'claude-code', sessionId: null, press: THE_PRESS_OF_AN_UNROUTED_REQUEST })
  })
})

describe('a header that looks like an actor header and is not one is refused', () => {
  /**
   * Each spelling with the reason somebody would send it. The first is the one that was actually
   * sent by hand here; the rest are the same slip in the other places it can happen.
   */
  const misspellings: { sent: string; because: string }[] = [
    { sent: 'x-mole-office-actor', because: 'the -type dropped — the slip that was really made' },
    { sent: 'x-mole-office-actorid', because: 'the hyphen inside actor-id dropped' },
    { sent: 'x-mole-office-actor_id', because: 'an underscore where the hyphen belongs' },
    { sent: 'x_mole_office_actor_type', because: 'underscores throughout, the shape of an environment variable' },
    { sent: 'x-mole-office-agent', because: 'the word an agent reaches for instead of actor' },
    { sent: 'x-mole-office-actor-kind', because: 'kind as a synonym for type' },
    { sent: 'x-mole-office-type', because: 'actor dropped from the middle' },
    { sent: 'mole-office-actor-type', because: 'the x- prefix dropped' },
    { sent: 'x-mole-officesession', because: 'the hyphen before session dropped' },
    { sent: 'x-mole-office-sessionid', because: 'session id where the header is just session' },
    { sent: 'x-mole-office-session-id', because: 'the same slip, hyphenated' },
    // THE NEXT THREE DID NOT EXIST BEFORE 28 AUGUST 2026, and they are the reason this table was
    // re-derived by hand rather than run through a replace. The old name was `panelx`: one word,
    // with nothing inside it to get wrong. `mole-office` is two words with a hyphen holding them
    // together, so the name itself now has three new ways to come out wrong, and each of them is a
    // header this server would otherwise read as absence.
    { sent: 'x-moleoffice-actor-type', because: 'the hyphen inside the product name dropped' },
    { sent: 'x-mole_office-actor-type', because: 'an underscore inside the product name' },
    { sent: 'x-office-actor-type', because: 'half the product name, which a one-word name could not lose' },
    { sent: 'x-mole-ofice-actor-type', because: 'the product name misspelt and the rest right' },
    { sent: 'x-actor-id', because: 'the product name left out altogether' },
    { sent: 'x-sessionid', because: 'the product name left out and session run together' },
    { sent: 'X-Mole-Office-Actor-Type', because: 'the right name in a case this server never looks up' },
    // AND THE NAME FROM BEFORE THE RENAME, which is not a misspelling but a caller that has not been
    // told. Every agent that read the old skill sends this. It must be refused rather than ignored
    // for exactly the reason the whole rule exists: ignored means attributed to the owner.
    { sent: 'x-panelx-actor-type', because: 'the header name this product used until 28 August 2026' },
    { sent: 'x-panelx-agent', because: 'the old name, misspelt the way agents misspelt it' },
  ]

  for (const { sent, because } of misspellings) {
    it(`refuses ${sent} — ${because}`, () => {
      expectRefusal({ [sent]: 'agent' }, sent)
    })
  }

  it('refuses rather than promoting the sender to human, which is what used to happen', () => {
    // The whole point, said once in the terms of the damage: before this rule, THIS request was
    // answered as the owner typing by hand, and the owner is the only writer allowed to file a decision.
    expectRefusal({ 'x-mole-office-actor': 'agent', 'x-mole-office-actor-id': 'claude-code' }, 'x-mole-office-actor')
  })

  it('refuses even when the correctly spelled headers are there too', () => {
    // A caller sending both spellings does not know which one this server reads, so its attribution
    // is a coin toss. Reading the correct one and ignoring the other would hide that.
    expectRefusal(
      { [http.ACTOR_HEADERS.type]: 'agent', [http.ACTOR_HEADERS.id]: 'claude-code', 'x-mole-office-agent': 'yes' },
      'x-mole-office-agent',
    )
  })

  it('names every misspelt header when more than one was sent', () => {
    const err = expectPanelError(
      db,
      () => http.actorFrom(request({ 'x-mole-office-actor': 'agent', 'x-mole-office-sessionid': 'sess-1' })),
      400,
    )
    expect(err.message).toContain('x-mole-office-actor')
    expect(err.message).toContain('x-mole-office-sessionid')
  })

  it('refuses a mangling of any of the three, taken from the server’s own declaration', () => {
    // Derived from ACTOR_HEADERS rather than typed out, so a fourth header added tomorrow is
    // covered on the day it is added rather than the day somebody remembers this file.
    for (const name of names()) {
      const mangled = [
        name.slice(0, -1), // a dropped last character
        name.replaceAll('-', '_'), // underscores for hyphens
        `${name}-id`, // a suffix that is not read
        name.toUpperCase(), // a case this server does not look up
      ]
      for (const sent of mangled) {
        expect(sent, 'a mangling must differ from the real name').not.toBe(name)
        expectRefusal({ [sent]: 'agent' }, sent)
      }
    }
  })
})

describe('the two ways of getting the actor wrong are told apart', () => {
  it('a wrong VALUE still names the header and the three types', () => {
    // Unchanged behaviour, kept honest here beside the new rule: these two refusals must not be
    // mistakable for each other, because the caller fixes them in different places.
    const err = expectPanelError(db, () => http.actorFrom(request({ [http.ACTOR_HEADERS.type]: 'robot' })), 400)
    expect(err.message).toContain(http.ACTOR_HEADERS.type)
    expect(err.message).toContain('robot')
    expect(err.message).toContain('agent')
  })

  it('a wrong NAME names all three headers', () => {
    const err = expectPanelError(db, () => http.actorFrom(request({ 'x-mole-office-actor': 'agent' })), 400)
    for (const name of names()) expect(err.message).toContain(name)
  })
})

describe('a header that is present and blank is refused, not read as absence', () => {
  /**
   * The honest request, which every case below breaks in exactly one place.
   *
   * Built from the server's own declaration so a renamed header cannot leave these tests passing
   * against a header nobody sends.
   */
  function honest(): Record<string, string> {
    return {
      [http.ACTOR_HEADERS.type]: 'agent',
      [http.ACTOR_HEADERS.id]: 'nightly-sweep',
      [http.ACTOR_HEADERS.session]: 'sess-http-actor',
    }
  }

  /**
   * Blanking one header must be a 400 that names THAT header.
   *
   * `expectPanelError` fails if the call returns instead of throwing, and prints what it returned —
   * so a regression to the old behaviour reports the actor it silently invented, which is the
   * sentence somebody reading the failure needs.
   *
   * Whitespace-only is checked beside the empty string in the same test rather than in a second one:
   * it is not a different rule, it is the same header with a space in it, and a caller cannot see
   * the difference between the two on its own screen.
   */
  function expectBlankRefusal(header: string): void {
    for (const blank of ['', '   ', '\t']) {
      const headers = { ...honest(), [header]: blank }
      const err = expectPanelError(db, () => http.actorFrom(request(headers)), 400)
      expect(err.message, `the refusal must name the blank header: ${err.message}`).toContain(header)
      expect(err.message, `the refusal must say what was wrong with it: ${err.message}`).toContain('empty')
    }
  }

  it('refuses a blank actor type, which used to be promoted to human', () => {
    // THE ONE THAT COST THE MOST. `human` is the only actor allowed to write a `decision`, so the
    // blank value did not merely mislabel the write — it granted it.
    expectBlankRefusal(http.ACTOR_HEADERS.type)
  })

  it(`refuses a blank actor id, which used to be filed under ${THE_TEST_OFFICES_OWNER.id}`, () => {
    // Not a promotion — the type is still `agent` — but the change log would read `agent:` and the owner's id,
    // naming the person as the writer of work they never did. The log is permanent, so a wrong name
    // in it is not recoverable by fixing the client afterwards.
    expectBlankRefusal(http.ACTOR_HEADERS.id)
  })

  it('refuses a blank session, which used to file the write under no session at all', () => {
    // The cheapest of the three and the same shape. The run's writes would be stored with no
    // session, and `GET /api/changes?session=…` — how the human asks what a run did — would answer
    // "nothing" about a run that did plenty.
    expectBlankRefusal(http.ACTOR_HEADERS.session)
  })

  it('still reads the honest request the blank ones were built from', () => {
    // The guard must cost nothing when every value is really there. Without this, all three tests
    // above would pass against a function that refused everything.
    expect(http.actorFrom(request(honest()))).toEqual({
      type: 'agent',
      id: 'nightly-sweep',
      sessionId: 'sess-http-actor',
      press: THE_PRESS_OF_AN_UNROUTED_REQUEST,
    })
  })
})

describe('a caller that names itself halfway has not named itself', () => {
  /**
   * Every half-claim, with the identity this server used to invent for it.
   *
   * The `was` column is not decoration and it is not guessed: each one was measured against a
   * listening socket on 2026-08-11, and each was a 201. It is written into the assertion because it
   * is the thing that went wrong — a caller reading `human:nightly-sweep` in the refusal can see
   * that the person's name was about to go on its work, which "a header is missing" does not say.
   */
  const halves: { sent: Record<string, string>; was: string; because: string }[] = [
    {
      sent: { 'x-mole-office-actor-id': 'nightly-sweep' },
      was: 'human:nightly-sweep',
      because: 'an agent naming itself and forgetting the type — a curl template with one unset variable',
    },
    {
      sent: { 'x-mole-office-session': 'sess-1' },
      was: `human:${THE_TEST_OFFICES_OWNER.id}`,
      because: 'a run that says which run it is and never says who is running it',
    },
    {
      sent: { 'x-mole-office-actor-id': 'nightly-sweep', 'x-mole-office-session': 'sess-1' },
      was: 'human:nightly-sweep',
      because: 'the same, with the run named too, which makes it look more careful and is not',
    },
    {
      sent: { 'x-mole-office-actor-type': 'agent' },
      was: `agent:${THE_TEST_OFFICES_OWNER.id}`,
      because: 'THE ONE NOBODY WROTE DOWN: an agent whose work is filed under the person’s name',
    },
    {
      sent: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-session': 'sess-1' },
      was: `agent:${THE_TEST_OFFICES_OWNER.id}`,
      because: 'the same, and the run name makes the wrong writer look filed rather than invented',
    },
    {
      sent: { 'x-mole-office-actor-type': 'human' },
      was: `human:${THE_TEST_OFFICES_OWNER.id}`,
      because: 'a tool claiming humanity without saying which human, and inheriting the only one there is',
    },
    {
      sent: { 'x-mole-office-actor-type': 'system' },
      was: `system:${THE_TEST_OFFICES_OWNER.id}`,
      because: 'a script, filed under the person, for work no person did',
    },
  ]

  for (const { sent, was, because } of halves) {
    it(`refuses ${Object.keys(sent).join(' + ')} — ${because}`, () => {
      const err = expectPanelError(db, () => http.actorFrom(request(sent)), 400)
      for (const name of Object.keys(sent)) {
        expect(err.message, `the refusal must quote what was sent: ${err.message}`).toContain(name)
      }
      expect(err.message, `the refusal must quote the identity it would have invented: ${err.message}`).toContain(was)
    })
  }

  it('names the header that is missing, not just the one that was sent', () => {
    // The caller has to be able to fix this from the sentence alone. It knows what it sent.
    const noType = expectPanelError(db, () => http.actorFrom(request({ 'x-mole-office-actor-id': 'a' })), 400)
    expect(noType.message).toContain(http.ACTOR_HEADERS.type)

    const noId = expectPanelError(db, () => http.actorFrom(request({ 'x-mole-office-actor-type': 'agent' })), 400)
    expect(noId.message).toContain(http.ACTOR_HEADERS.id)
  })

  it('treats a header as sent because it is THERE, not because it has a value', () => {
    // THE SHAPE OF ALL THREE DEFECTS IN THIS FILE: a presence test done by looking at a value. The
    // name check answered "absent" for a header that was sent misspelt; the value check answered
    // "absent" for a header that was sent empty. So presence is now the key, and a key carrying
    // nothing readable is still a claim — the caller sent it, and it meant something by it.
    //
    // Both of these would default to the owner under a value-based test, which is exactly the
    // regression this pins.
    for (const empty of [undefined, [] as string[]]) {
      const claimed = expectPanelError(
        db,
        () => http.actorFrom(request({ [http.ACTOR_HEADERS.type]: empty })),
        400,
      )
      expect(claimed.message).toContain(http.ACTOR_HEADERS.type)

      const session = expectPanelError(
        db,
        () => http.actorFrom(request({ [http.ACTOR_HEADERS.session]: empty })),
        400,
      )
      expect(session.message).toContain(http.ACTOR_HEADERS.session)
    }
  })

  it('leaves the session header optional for a caller that has said who it is', () => {
    // The rule tightens who may omit what; it does not make the session compulsory. A run that has
    // not filed a session record yet still has to be able to write, and that is most first writes.
    expect(http.actorFrom(request({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' }))).toEqual({
      type: 'agent',
      id: 'claude-code',
      sessionId: null,
      press: THE_PRESS_OF_AN_UNROUTED_REQUEST,
    })
  })

  it('still lets a request that claims nothing at all be the person at the keyboard', () => {
    // Said again here, beside the rule that could take it away, rather than only in the describe
    // above. This is the one case the default exists for and the only one left.
    // `stated: false` is owner decision §36: the identity is unchanged — this is still the person
    // typing by hand for every ordinary write — but a governance act now has to be said out loud,
    // and this is the flag `assertMayWrite` reads to tell silence from a claim.
    expect(http.actorFrom(request({}))).toEqual({ type: 'human', id: THE_TEST_OFFICES_OWNER.id, sessionId: null, stated: false })
  })
})

describe('the product applies the rule, over HTTP', () => {
  let built: Awaited<ReturnType<typeof apiApp>>
  let app: Awaited<ReturnType<typeof apiApp>>['app']

  beforeAll(async () => {
    built = await apiApp()
    app = built.app
  }, 60_000)

  afterAll(async () => {
    await app.close()
  })

  /**
   * How many records hold this title, counted from the listing.
   *
   * WHAT THIS REPLACES, AND WHY THE OLD PROOF WAS NO PROOF. Both tests below used to prove "and
   * stores nothing" by filing the same title again and asserting 201, on the ground that titles were
   * unique so a second create would 409 if the refusal had written the record. `records_title_idx`
   * stopped being UNIQUE on 17 August 2026 — an id is identity, a title is presentation — so that
   * create answers 201 whether or not the record is there, and the assertion could no longer fail.
   * A test that cannot fail reads as coverage and is worse than no test.
   *
   * Counting is the direct question and does not depend on any rule about titles.
   */
  async function holdingTitle(title: string): Promise<string[]> {
    const res = await app.inject({ method: 'GET', url: '/api/records' })
    expect(res.statusCode, res.body).toBe(200)
    const rows = (JSON.parse(res.body) as { records: { id: string; title: string }[] }).records
    return rows.filter((row) => row.title === title).map((row) => row.id)
  }

  it('refuses a decision written behind a misspelt actor header, and stores nothing', async () => {
    // The sharpest case there is. `decision` is the one kind an agent may not write; the refusal
    // that stops it reads the actor; and the misspelling made the actor the owner. So this exact
    // request used to answer 201 and file an agent's decision as the person's.
    const title = 'A decision behind a misspelt header'
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { 'x-mole-office-actor': 'agent', 'x-mole-office-actor-id': 'claude-code' },
      payload: { kind: 'decision', title },
    })

    expect(res.statusCode, res.body).toBe(400)
    const message = (JSON.parse(res.body) as { error: string }).error
    expect(message).toContain('x-mole-office-actor')
    for (const name of names()) expect(message).toContain(name)

    // And the record really is absent — counted, not inferred. See `holdingTitle` for what this
    // replaces and why the old proof stopped being one.
    expect(await holdingTitle(title), 'a refusal that wrote the record anyway would leave it here').toEqual([])
  })

  it('refuses a decision written behind a blank actor type, and stores nothing', async () => {
    // The adversarial reproduction, at the point where it cost the most. This exact request — the
    // header spelled correctly, the value blank, the agent naming itself honestly in the other
    // header — answered 200/201 and filed the decision as `human:nightly-sweep`.
    const title = 'A decision behind a blank actor type'
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { 'x-mole-office-actor-type': '', 'x-mole-office-actor-id': 'nightly-sweep' },
      payload: { kind: 'decision', title },
    })

    expect(res.statusCode, res.body).toBe(400)
    const message = (JSON.parse(res.body) as { error: string }).error
    expect(message).toContain('x-mole-office-actor-type')

    // And nothing was stored — counted, not inferred. See `holdingTitle` above.
    expect(await holdingTitle(title), 'a refusal that wrote the record anyway would leave it here').toEqual([])
  })

  it('still accepts a write with the three spelled correctly', async () => {
    // The guard must not have spread. This is the ordinary agent write the whole API is built for.
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: {
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'claude-code',
        'x-mole-office-session': 'sess-http-actor',
      },
      payload: { kind: 'note', title: 'A note an agent wrote properly', data: { body: 'ran the sweep' } },
    })
    expect(res.statusCode, res.body).toBe(201)

    const id = (JSON.parse(res.body) as { record: { id: string } }).record.id
    const changes = await app.inject({ method: 'GET', url: `/api/changes?recordId=${id}` })
    const rows = (JSON.parse(changes.body) as { changes: { actorType: string; actorId: string }[] }).changes
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]?.actorType).toBe('agent')
    expect(rows[0]?.actorId).toBe('claude-code')
  })

  it(`still accepts a write carrying no actor headers, and files it as human/${THE_TEST_OFFICES_OWNER.id}`, async () => {
    // The browser and a bare curl both write this way. If this ever goes red, the product has lost
    // hand-written writing, whatever the refusal rule gained.
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      payload: { kind: 'note', title: 'A note typed by hand', data: { body: 'no headers at all' } },
    })
    expect(res.statusCode, res.body).toBe(201)

    const id = (JSON.parse(res.body) as { record: { id: string } }).record.id
    const changes = await app.inject({ method: 'GET', url: `/api/changes?recordId=${id}` })
    const rows = (JSON.parse(changes.body) as { changes: { actorType: string; actorId: string }[] }).changes
    expect(rows[0]?.actorType).toBe('human')
    expect(rows[0]?.actorId).toBe(THE_TEST_OFFICES_OWNER.id)
  })
})

// ---------------------------------------------------------------------------- on a real socket

/**
 * THE SAME RULE, THROUGH A PORT, IN THE TWO SHAPES A CALLER REALLY HAS.
 *
 * Everything above this line goes through `app.inject`, which builds the request object itself. Two
 * of the four defects cannot be reproduced that way, and both were found by measuring bytes:
 *
 *   - a header SENT TWICE. Node joins repeats of these three names with ", " before this server sees
 *     them; `inject` joins an array of values with "," and records one arrival. So the shape that
 *     produced the writer `a, b` only exists on a socket.
 *   - the SHELL form of the unset variable. `curl -H 'name: '` sends nothing at all — measured, the
 *     bytes below are copied from a sniffed request — so that slip arrives as an absent header while
 *     the same slip in `fetch` arrives as an empty one. Two different doors, and until this decision
 *     only one of them was locked.
 *
 * So this group listens and drives the port two ways. `wire()` writes the request by hand, in the
 * bytes `curl/8.5.0` was observed to write, down to the `User-Agent` and `Accept` it adds; `web()`
 * uses the real `fetch`, which is what the browser app and every JavaScript agent uses. Nothing here
 * shares a code path with the tests above.
 */
describe('the same rule on a real socket, as a shell writes it and as fetch writes it', () => {
  let built: Awaited<ReturnType<typeof apiApp>>
  let app: Awaited<ReturnType<typeof apiApp>>['app']
  let port: number

  beforeAll(async () => {
    built = await apiApp()
    app = built.app
    // Port 0 asks the operating system for a free one. A fixed port would collide with the other
    // test files the runner has in flight, and with anything already serving on this machine.
    await app.listen({ port: 0, host: '127.0.0.1' })
    const address = app.server.address()
    if (address === null || typeof address === 'string') throw new Error('the test server did not bind a port')
    port = address.port
  }, 60_000)

  afterAll(async () => {
    await app.close()
  })

  interface Reply {
    status: number
    /** The `error` field of the reply, or null when the reply is not a refusal. */
    error: string | null
    body: string
  }

  /**
   * A POST written as bytes, exactly the way curl writes it.
   *
   * `headers` is a list of pairs because a NAME MAY REPEAT, which is the whole reason this exists
   * and which no object or `Headers` can express. A pair whose value is the empty string is written
   * `name:` with nothing after the colon — measured as what `curl -H 'name;'` puts on the wire.
   */
  async function wire(headers: [string, string][], payload: unknown): Promise<Reply> {
    const body = JSON.stringify(payload)
    const lines = [
      'POST /api/records HTTP/1.1',
      `Host: 127.0.0.1:${port}`,
      'User-Agent: curl/8.5.0',
      'Accept: */*',
      'content-type: application/json',
      ...headers.map(([name, value]) => (value === '' ? `${name}:` : `${name}: ${value}`)),
      `Content-Length: ${Buffer.byteLength(body)}`,
      'Connection: close',
      '',
      body,
    ]

    const raw = await new Promise<string>((resolve, reject) => {
      const socket = connect(port, '127.0.0.1', () => socket.write(lines.join('\r\n')))
      let out = ''
      socket.setEncoding('utf8')
      socket.on('data', (chunk) => (out += chunk))
      socket.on('end', () => resolve(out))
      socket.on('error', reject)
    })

    const status = Number(raw.split(' ')[1])
    const text = raw.slice(raw.indexOf('\r\n\r\n') + 4)
    return { status, body: text, error: errorIn(text) }
  }

  /** The same POST through the real `fetch`, which is the browser and every JavaScript agent. */
  async function web(headers: Record<string, string>, payload: unknown): Promise<Reply> {
    const res = await fetch(`http://127.0.0.1:${port}/api/records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(payload),
    })
    const text = await res.text()
    return { status: res.status, body: text, error: errorIn(text) }
  }

  /** The refusal sentence, or null when the reply is not one. Chunked replies are not JSON lines. */
  function errorIn(text: string): string | null {
    try {
      const parsed = JSON.parse(text.trim().split('\n').pop() ?? '') as { error?: unknown }
      return typeof parsed.error === 'string' ? parsed.error : null
    } catch {
      return null
    }
  }

  interface AChangeRow {
    id: string
    actorType: string
    actorId: string
  }

  /**
   * THE WHOLE CHANGE LOG, with its own statement that it was not cut. A reading over every row stays
   * over every row; a case compares the rows it found at its start with the rows there at the end.
   */
  async function theWholeChangeLog(): Promise<{ rows: AChangeRow[]; truncated: boolean }> {
    const res = await fetch(`http://127.0.0.1:${port}/api/changes?limit=1000`)
    const body = (await res.json()) as { changes: AChangeRow[]; truncated: boolean }
    return { rows: body.changes, truncated: body.truncated }
  }

  /** Every actor named in the whole change log, as `type:id`. */
  async function everyWriter(): Promise<string[]> {
    const { rows } = await theWholeChangeLog()
    return rows.map((row) => `${row.actorType}:${row.actorId}`)
  }

  /**
   * The ids of every record holding this title.
   *
   * THE OLD PROOF COULD NOT FAIL. The test below used to file the same title again and assert 201,
   * on the ground that titles were unique. `records_title_idx` stopped being UNIQUE on 17 August
   * 2026, so that create answers 201 whether or not the refused record is there. Counting asks the
   * question directly and does not rest on any rule about titles.
   */
  async function holdingTitle(title: string): Promise<string[]> {
    const res = await fetch(`http://127.0.0.1:${port}/api/records`)
    const rows = ((await res.json()) as { records: { id: string; title: string }[] }).records
    return rows.filter((row) => row.title === title).map((row) => row.id)
  }

  const decision = (title: string) => ({ kind: 'decision', title })
  const note = (title: string) => ({ kind: 'note', title, data: { body: 'written by a probe' } })

  it('a shell script with one unset variable cannot file a decision as the human', async () => {
    // THE MEASURED CASE, in the bytes that produced it. `curl -H "x-mole-office-actor-type: $TYPE"` with
    // TYPE unset sends NO type header — curl reads a blank right-hand side as "delete this" — so
    // the request arrives naming itself in one header and nothing else, and used to be answered 201
    // and filed as `human:nightly-sweep`. `human` is the only actor allowed to write a decision.
    const title = 'A decision from a shell script with an unset variable'
    const refused = await wire([['x-mole-office-actor-id', 'nightly-sweep']], decision(title))

    expect(refused.status, refused.body).toBeGreaterThanOrEqual(400)
    expect(refused.status).toBeLessThan(500)
    expect(refused.error).toContain('x-mole-office-actor-type')
    expect(refused.error, 'the refusal must say what it was about to invent').toContain('human:nightly-sweep')

    // Nothing was written under anybody — counted, not inferred. See `holdingTitle` above.
    expect(await holdingTitle(title), 'a refusal that filed the record on its way out would leave it here').toEqual([])
  })

  it('an agent that says what it is and not who it is is not filed under the person', async () => {
    // The variant nobody had written down, and the one that does not look dangerous: the type is
    // honest, so this is not a promotion. It is worse in a quieter way — `agent:` with the owner's id puts the
    // person's name on work they did not do, in a log that is never rewritten.
    const refused = await wire([['x-mole-office-actor-type', 'agent']], note('A note from a nameless agent'))
    expect(refused.status, refused.body).toBe(400)
    expect(refused.error).toContain('x-mole-office-actor-id')
    expect(refused.error).toContain(`agent:${THE_TEST_OFFICES_OWNER.id}`)

    // The product meaning, checked where it would show: the person's name must appear on nothing
    // that an agent wrote. This reads the whole log rather than one row, because the damage was
    // never about one request.
    expect(await everyWriter()).not.toContain(`agent:${THE_TEST_OFFICES_OWNER.id}`)
  })

  it('a run cannot write as the person just by naming its run', async () => {
    // `x-mole-office-session` stays optional, and it is still an attribution header: sending it alone
    // used to buy the owner's identity plus a session, which is a whole run's work filed as the person's.
    const refused = await wire([['x-mole-office-session', 'sess-nightly']], decision('A decision from a session alone'))
    expect(refused.status, refused.body).toBe(400)
    expect(refused.error).toContain(`human:${THE_TEST_OFFICES_OWNER.id}`)

    // And the optional half is really optional: type and id with no session is an ordinary write.
    const ok = await wire(
      [
        ['x-mole-office-actor-type', 'agent'],
        ['x-mole-office-actor-id', 'claude-code'],
      ],
      note('A note from an agent that has not filed a session yet'),
    )
    expect(ok.status, ok.body).toBe(201)
  })

  it('gives the shell slip and the JavaScript slip the same answer, by their two different routes', async () => {
    // The same mistake — one unset variable in a header template — arrives in two shapes, and both
    // were measured rather than assumed. Neither may end in a promotion, and the test says which
    // door each one comes through, because a later reader will otherwise "simplify" one of them.
    const shell = await wire(
      [
        ['x-mole-office-actor-type', ''], // curl -H 'name;' — the header really sent, and empty
        ['x-mole-office-actor-id', 'nightly-sweep'],
      ],
      decision('A decision behind an empty type on the wire'),
    )
    expect(shell.status, shell.body).toBe(400)
    expect(shell.error, 'an empty value is refused for being empty').toContain('empty')

    const javascript = await web(
      { 'x-mole-office-actor-type': '', 'x-mole-office-actor-id': 'nightly-sweep' },
      decision('A decision behind an empty type from fetch'),
    )
    expect(javascript.status, javascript.body).toBe(400)
    expect(javascript.error).toContain('empty')

    // And the third shape of the same slip: the variable was unset and curl sent nothing at all, so
    // the header is ABSENT rather than empty. Different door, same answer.
    const absent = await wire(
      [['x-mole-office-actor-id', 'nightly-sweep']],
      decision('A decision behind a type curl deleted'),
    )
    expect(absent.status, absent.body).toBe(400)
  })

  it('an identity claimed twice is not one identity', async () => {
    // MEASURED, and only visible on a socket: Node joins repeats with ", " before this server sees
    // them, so these two claims used to be answered 201 and logged as the writer `a, b`. Nobody is
    // called that, and the change log is never rewritten.
    const refused = await wire(
      [
        ['x-mole-office-actor-type', 'agent'],
        ['x-mole-office-actor-id', 'first-agent'],
        ['x-mole-office-actor-id', 'second-agent'],
      ],
      note('A note from two agents at once'),
    )
    expect(refused.status, refused.body).toBe(400)
    expect(refused.error).toContain('x-mole-office-actor-id')

    // The same for the run name, where the cost is different: `s1, s2` is a run nobody can ask
    // about, so the run's own writes vanish from GET /api/changes?session=s1.
    const sessions = await wire(
      [
        ['x-mole-office-actor-type', 'agent'],
        ['x-mole-office-actor-id', 'claude-code'],
        ['x-mole-office-session', 'sess-one'],
        ['x-mole-office-session', 'sess-two'],
      ],
      note('A note from one agent in two runs'),
    )
    expect(sessions.status, sessions.body).toBe(400)
    expect(sessions.error).toContain('x-mole-office-session')

    // Nobody with a comma in their name reached the log.
    for (const writer of await everyWriter()) expect(writer).not.toContain(',')
  })

  it('refuses a misspelt header name on the wire as well as in the harness', async () => {
    const refused = await wire(
      [
        ['x-mole-office-actor', 'agent'],
        ['x-mole-office-actor-id', 'claude-code'],
      ],
      decision('A decision behind a misspelt header on the wire'),
    )
    expect(refused.status, refused.body).toBe(400)
    for (const name of names()) expect(refused.error).toContain(name)
  })

  it('refuses an actor type nobody recognises, in both shapes', async () => {
    const shell = await wire(
      [
        ['x-mole-office-actor-type', 'robot'],
        ['x-mole-office-actor-id', 'whoever'],
      ],
      decision('A decision from a robot on the wire'),
    )
    expect(shell.status, shell.body).toBe(400)
    expect(shell.error).toContain('robot')

    const javascript = await web(
      { 'x-mole-office-actor-type': 'robot', 'x-mole-office-actor-id': 'whoever' },
      decision('A decision from a robot through fetch'),
    )
    expect(javascript.status, javascript.body).toBe(400)
    expect(javascript.error).toContain('robot')
  })

  it('still lets the browser write with no actor headers at all', async () => {
    // THE ONE CASE THE DEFAULT EXISTS FOR, tested through a real socket in both shapes because it
    // is what this rule could most easily take away. `fetch` here carries the same ordinary headers
    // a browser sends, including the `user-agent` that a wider rule would trip on.
    const start = await theWholeChangeLog()
    expect(start.truncated, 'the change log was cut, so this case cannot see every write').toBe(false)
    const javascript = await web({}, note('A note typed into the browser'))
    expect(javascript.status, javascript.body).toBe(201)

    const shell = await wire([], note('A note from a bare curl'))
    expect(shell.status, shell.body).toBe(201)

    // And both were filed as the person, which is what the default is FOR — a 201 that filed them
    // as somebody else would pass the two assertions above and still be wrong. THE WHOLE CHANGE LOG
    // IS READ, before and after, and the writers of the rows this case added are exactly the person.
    const end = await theWholeChangeLog()
    expect(end.truncated, 'the change log was cut, so this case cannot see every write').toBe(false)
    const held = new Set(start.rows.map((row) => row.id))
    const writers = end.rows.filter((row) => !held.has(row.id)).map((row) => `${row.actorType}:${row.actorId}`)
    expect(writers.length, 'the two notes left no change row, so this proves nothing').toBeGreaterThan(0)
    expect(new Set(writers)).toEqual(new Set([`human:${THE_TEST_OFFICES_OWNER.id}`]))
  })

  it('still lets an agent that names itself properly write, and files it under its own name', async () => {
    const start = await theWholeChangeLog()
    expect(start.truncated, 'the change log was cut, so this case cannot see every write').toBe(false)
    const ok = await wire(
      [
        ['x-mole-office-actor-type', 'agent'],
        ['x-mole-office-actor-id', 'claude-code'],
        ['x-mole-office-session', 'sess-on-the-wire'],
      ],
      note('A note from an agent that read the documentation'),
    )
    expect(ok.status, ok.body).toBe(201)
    // THE ROWS THIS CASE ADDED, from the whole log read before and after, name the agent.
    const end = await theWholeChangeLog()
    expect(end.truncated, 'the change log was cut, so this case cannot see every write').toBe(false)
    const held = new Set(start.rows.map((row) => row.id))
    const writers = end.rows.filter((row) => !held.has(row.id)).map((row) => `${row.actorType}:${row.actorId}`)
    expect(writers).toContain('agent:claude-code')
  })
})
