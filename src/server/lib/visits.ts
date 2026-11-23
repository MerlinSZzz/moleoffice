// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A VISIT: A CITIZEN OF ONE WORLD WORKING IN ANOTHER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion C4 of design/messages/ACCEPTANCE.md section 8: a citizen may work in another world, and what
 * they came to do is registered.
 *
 * THE SECOND ANSWER SETS THE WHOLE SCOPE: registration is not needed for permission for now. A local agent
 * and the person's own curl may reach everything, and permission is limited to agents registered in other
 * worlds. Three rules follow and there is no fourth:
 *
 *   - a caller that names no home is a LOCAL. It is named and never refused (the F1 answer).
 *   - a caller whose home is this world is not checked at all.
 *   - a caller whose home is another world needs a visit: without one a WRITE is refused with a
 *     sentence naming the office, and a READ is answered in full with a warning on the reply.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE VISIT IS LOOKED UP, AND WHY THE MIRROR IS THE ANSWER
 * ---------------------------------------------------------------------------------------
 *
 * A VISIT IS REGISTERED AT THE WORLD BEING ENTERED, and that world reports it to the office. Two
 * things follow, and both are what the criteria ask for. The world that has to CHECK the visit is
 * the one that has the row, so no request waits on another server being up. And a world that cannot
 * reach the office still takes the visit and reports it later, which is criterion C8 with no second
 * mechanism.
 *
 * IT ALSO READS THE MIRROR, so a visit registered elsewhere in this installation is seen here as
 * well. That is the file criterion C2 built, and this is what it is for.
 *
 * THE MIRROR IS READ EACH TIME AND NOT HELD. A visit registered a second ago has to count, and the
 * file is small: the office writes it after every change.
 */

import { anOfficeId } from './ids.ts'
import { announce } from './events.ts'
import { sqlite } from '../db/client.ts'
import { nowStamp } from '@shared/time.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import type { Visit } from '@shared/worlds.ts'
import { PanelError } from './panel-error.ts'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { noVisitRefusal, noVisitWarning } from '@shared/worlds.ts'
import { HOME_HEADER, HOME_MOVED_HEADER, VISIT_HEADER, VISIT_WARNING_HEADER } from '../../config/visit-headers.mjs'
import { headerValue } from './header-value.ts'
import { theInstallationThisDatabaseBelongsTo, theWorldThisDatabaseIs } from './world.ts'
import {
  readTheMirror,
  theHeadersThisWorldReportsUnder,
  theMirrorThisWorldMayRead,
  theOfficeIsInThisDatabase,
  whereTheOfficeIs,
  whyTheDeclaredOfficeIsNotThisWorlds,
  worldsHere,
  writeTheMirror,
} from './office.ts'
import { howThisRequestProvedItself } from './keys.ts'
import { underATestRunner } from '@shared/under-a-test-runner.ts'
import { named } from './named-timers.ts'
import { openVisitsHere } from '../db/open-visits-here.ts'
import { asVisit } from '../db/open-visits-here.ts'

export { asVisit } from '../db/open-visits-here.ts'

/** Every visit this database holds, newest first. Ended ones included: the history is the point. */
export function visitsHere(): Visit[] {
  const rows = sqlite
    .prepare('SELECT * FROM visits ORDER BY since DESC, id DESC')
    .all() as Record<string, unknown>[]
  return rows.map(asVisit)
}

export { openVisitsHere } from '../db/open-visits-here.ts'

/** One visit by its id, or null because no row here has it. */
export function visitById(id: string): Visit | null {
  const row = sqlite.prepare('SELECT * FROM visits WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row === undefined ? null : asVisit(row)
}

/** What a caller says when registering a trip. */
export interface VisitRegistration {
  visitor: ParticipantRef
  fromWorld: string
  toWorld: string
  why: string
  /**
   * When the visit began, for one registered late. Absent means now, which is the ordinary case.
   *
   * Criterion C8: a world that could not reach the office records the visit locally and reports it
   * when the office answers again. The office then writes down when it LEARNT about the visit and
   * keeps when it BEGAN, and the difference between the two is what "registered late" means.
   */
  since?: string
  /**
   * The id the world that HOLDS this visit gave it, when that world is reporting it to the office.
   *
   * IT IS READ ONLY FOR A VISIT TO ANOTHER WORLD. A visit registered at the world being entered gets
   * a fresh id and nobody may choose it. See `registerVisitHere`, which says what went wrong when
   * the office made up an id of its own.
   */
  id?: string
}

/**
 * Register a visit in this database.
 *
 * IT REFUSES A VISIT TO THE WORLD THE VISITOR ALREADY LIVES IN, including when the visitor remembers
 * a former home of this office. Both refusals have one reason: the visitor lives here. There is nothing to register: a
 * citizen at home is not checked, and a row saying otherwise would put a visit on a list of people
 * working away from home who are not.
 *
 * IT REFUSES A VISIT WITH NO PURPOSE, because what the visitor came to do is the thing being registered.
 * A blank one would make the list a list of ids.
 */
export function registerVisitHere(said: VisitRegistration): Visit {
  const why = said.why.trim()
  if (why === '') {
    throw new PanelError(
      'A visit says what you came to do, in one plain sentence. That is what the office writes down, and a ' +
        'visit with nothing in that line is a row nobody can read afterwards.',
      400,
    )
  }
  if (said.fromWorld.trim() === '' || said.toWorld.trim() === '') {
    throw new PanelError('A visit names the world it is from and the world it is to, by database identity.', 400)
  }
  if (said.fromWorld === said.toWorld) {
    throw new PanelError(
      `The world ${said.toWorld} is where this citizen lives, so there is nothing to register. A visit is a ` +
        'citizen of one world working in another.',
      400,
    )
  }
  if (isAVisitFromThisOfficesFormerHome(said.fromWorld, said.toWorld)) {
    throw new PanelError(
      `The world ${said.fromWorld} is a former home of this office, so this citizen lives here and there is nothing to register.`,
      400,
    )
  }
  const now = nowStamp()
  /**
   * THE ID THE WORLD HOLDING THE VISIT GAVE IT, when one world is reporting to the office.
   *
   * A REPORT IS THE SAME VISIT AND NOT A SECOND ONE. It used to get a fresh id here, so the office
   * held a copy under an id the world that took the visit had never heard of: ending the trip at
   * that world ended nothing at the office, and after four Enter-and-Return-home rounds the office
   * listed eleven people away from home and nobody was. Problem `vFrn8Z7VZLhD`.
   *
   * ONLY FOR A VISIT TO SOMEWHERE ELSE, which is what a report is. A visit registered AT this world
   * gets a fresh id from here and nobody may choose it: letting a caller name the id of a row about
   * their own trip is a caller writing over somebody else's.
   */
  const reported = said.id !== undefined && said.toWorld !== theWorldThisDatabaseIs()
  const id = reported ? said.id ?? anOfficeId() : anOfficeId()
  // A SECOND REPORT OF ONE VISIT IS THE SAME ROW. `INSERT OR IGNORE` and the read-back below make
  // this idempotent, so a world that reported and did not hear back can report again without the
  // office counting the trip twice.
  const inserted = sqlite
    .prepare(
      'INSERT OR IGNORE INTO visits (id, visitor_kind, visitor_id, from_world, to_world, since, until, why, ' +
        'registered_at, reported_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)',
    )
    .run(
      id,
      said.visitor.kind,
      said.visitor.id,
      said.fromWorld,
      said.toWorld,
      said.since ?? now,
      why,
      now,
      // A ROW WRITTEN AT THE OFFICE HAS REACHED THE OFFICE. One written anywhere else has not, and
      // criterion C8's reporting is what fills this in later.
      theOfficeIsInThisDatabase() ? now : null,
    )
  writeTheMirror()
  if (inserted.changes > 0) tellThePagesTheVisitsChanged()
  const written = visitById(id)
  if (written === null) throw new PanelError('The visit was registered and could not be read back.', 500)
  return written
}

/** End a visit. The row is kept; nothing is deleted. A visit already ended is handed back unchanged. */
export function endVisitHere(id: string): Visit {
  const visit = visitById(id)
  if (visit === null) throw new PanelError(`No visit at this office has the id ${id}.`, 404)
  if (visit.until !== null) return visit
  sqlite.prepare('UPDATE visits SET until = ? WHERE id = ?').run(nowStamp(), id)
  writeTheMirror()
  tellThePagesTheVisitsChanged()
  return visitById(id) ?? visit
}

/**
 * EVERY OPEN PAGE IS TOLD WHEN A VISIT IS REGISTERED OR ENDED, so an open Embassy draws the visitor's row and the time
 * the trip ended without a reload. A visit is not a record, so no `record.changed` says it.
 */
function tellThePagesTheVisitsChanged(): void {
  announce({ name: 'list.changed', workspaceId: null, lists: ['visits'], about: null, groupId: null, because: 'A visit to this office was registered or ended.' })
}

/** Say a visit reached the office, for a row this world was holding. Criterion C8. */
export function thisVisitReachedTheOffice(id: string, at: string): void {
  sqlite.prepare('UPDATE visits SET reported_at = ? WHERE id = ? AND reported_at IS NULL').run(at, id)
}

/**
 * EVERY OPEN VISIT THIS WORLD CAN SEE, and where the list came from.
 *
 * The office reads its own rows. Every other world reads the mirror AND its own rows, because a
 * visit is registered at the world being entered and only reaches the office afterwards. The `from`
 * word travels with the list, because "here is the list" and "here is what I could still see" are
 * different sentences.
 */
export function openVisitsThisWorldCanSee(
  look: { file: string | null; why: string } = theMirrorThisWorldMayRead(),
): { visits: Visit[]; from: 'the office' | 'the mirror' | 'this world alone'; note: string } {
  const mine = openVisitsHere()
  if (theOfficeIsInThisDatabase()) return { visits: mine, from: 'the office', note: 'this world holds the office' }
  // THE SAME RULE AS THE WORLDS LIST, ASKED IN THE SAME PLACE. A world a test runner started reads
  // no list but its own, in either direction; `theMirrorThisWorldMayRead` is where that is decided.
  const mirror = readTheMirror(look.file)
  if (mirror === null) return { visits: mine, from: 'this world alone', note: look.why }
  // BOTH LISTS, WITH THIS WORLD'S OWN ROWS WINNING ON AN ID. A visit is registered at the world
  // being entered and reported to the office from there, so between those two moments this world is
  // the only place the row exists — and that gap is exactly criterion C8's, which would otherwise be
  // a visitor refused by the world it had just registered with.
  const byId = new Map<string, Visit>()
  for (const one of mirror.visits) byId.set(one.id, one)
  for (const one of mine) byId.set(one.id, one)
  return { visits: [...byId.values()].filter((one) => one.until === null), from: 'the mirror', note: look.why }
}

/**
 * DOES THIS CALLER HOLD AN OPEN VISIT TO THIS WORLD?
 *
 * The visit id the caller sends is checked when it sends one, and otherwise any open visit from that
 * home to this world counts. Both are allowed on purpose: the page carries the id it was given, and
 * a tool that registered a visit and then made a plain request has still registered it.
 *
 * @param fromWorld the database identity the caller says it lives in
 * @param toWorld the database identity of the world being asked
 * @param visitId the visit the caller claims, or null because it claimed none
 */
export function theVisitThisCallerHolds(
  fromWorld: string,
  toWorld: string,
  visitId: string | null,
): Visit | null {
  const open = openVisitsThisWorldCanSee().visits
  // NO SECOND CHECK THAT THE VISIT IS OPEN. `openVisitsThisWorldCanSee` answers with open visits and
  // nothing else — that is what its name says and what both of its sources filter for — and asking
  // again here would be the same rule in two places, free to disagree.
  const here = open.filter((one) => one.fromWorld === fromWorld && one.toWorld === toWorld)
  if (visitId === null) return here[0] ?? null
  return here.find((one) => one.id === visitId) ?? null
}

// ============================================================================ the check on a request

/**
 * WHO IS ASKING AND FROM WHERE, read off one request.
 *
 * The three states the answer names, and there is no fourth — except the one OP2 adds. `local` is a
 * caller that named no home: named, never refused. `at home` is a caller whose home is this world:
 * not checked at all. `at home, moved` is a caller whose remembered home is one of this
 * installation's own dead homes: also not refused, and the reply says which world is home now.
 * `visiting` is a caller from another world, and only that one is asked for a visit.
 */
export type WhereTheCallerIsFrom =
  | { where: 'local' }
  | { where: 'at home'; home: string }
  | { where: 'at home, moved'; home: string }
  | { where: 'visiting'; home: string; visit: Visit | null }

/**
 * IS THE WORLD THIS CALLER REMEMBERS ONE OF THIS INSTALLATION'S DEAD HOMES?
 *
 * OP2. A browser keeps the world it first met, and a restore or a move gives the office a new
 * identity, so the remembered world is the installation's old home, closed in the worlds table.
 * That is not a foreign world: it is this office's own former home, and the caller is at home here.
 *
 * THE TABLE AND NOT A LIST BESIDE IT. `worldsHere()` is where a world's kind, its death and its
 * installation already live, and asking it means a world that is renamed or closed cannot drift from
 * a second copy of the answer. `theInstallationThisDatabaseBelongsTo()` is the installation this
 * database says it is, so a home of somebody else's installation is not read as this one's.
 *
 * ONE QUESTION FOR EVERY READER OF A HOME WORLD. `isThisOfficesHome` below asks this together with
 * this database's own identity, and every reader that asks whether a stored home world is this
 * office's asks it, never this one alone and never an equality with this database's identity.
 */
function isADeadHomeOfThisInstallation(databaseIdentity: string): boolean {
  const installation = theInstallationThisDatabaseBelongsTo()
  if (installation === null || installation === '') return false
  return worldsHere().some(
    (one) =>
      one.databaseIdentity === databaseIdentity &&
      one.kind === 'home' &&
      one.diedAt !== null &&
      one.installation === installation,
  )
}

/**
 * IS THIS HOME WORLD THIS OFFICE'S HOME? A stored home world is a database identity, and a move of the
 * data folder gives the office a new one. So the answer is true for this database's own identity and
 * for a dead home of this installation, and false for every other world.
 *
 * NULL IS NOT FALSE. The answer is null when nobody recorded the home world, and when this office
 * cannot say which world it is: in both cases nobody can tell, and a caller that needs a yes treats
 * null as no and says so in its own words.
 */
export function isThisOfficesHome(databaseIdentity: string | null): boolean | null {
  if (databaseIdentity === null) return null
  const here = theWorldThisDatabaseIs()
  if (here === null) return null
  return databaseIdentity === here || isADeadHomeOfThisInstallation(databaseIdentity)
}

/**
 * Is this visit to this office from one of its former homes? The destination must be this database:
 * a world reporting a visit made elsewhere may name this office's home as the origin, and that visit
 * is real and must still be registered.
 */
export function isAVisitFromThisOfficesFormerHome(fromWorld: string, toWorld: string): boolean {
  return fromWorld !== toWorld && toWorld === theWorldThisDatabaseIs() && isThisOfficesHome(fromWorld) === true
}

/**
 * Read a request's home world and work out which of the states it is in.
 *
 * @param home the value of the home header, or null because it sent none
 * @param visitId the value of the visit header, or null
 * @param thisWorld the database identity of the world being asked, or null because it has none
 * @param theRememberedHomeDiedHere whether the home header names one of this installation's dead
 *   homes. It is a parameter rather than a table read in here because this is a pure reading of one
 *   request's headers and the table is read once by the caller. It defaults to false, so a caller
 *   that does not ask keeps the three states this had before OP2.
 */
export function whereTheCallerIsFrom(
  home: string | null,
  visitId: string | null,
  thisWorld: string | null,
  theRememberedHomeDiedHere = false,
): WhereTheCallerIsFrom {
  const said = home === null ? '' : home.trim()
  if (said === '') return { where: 'local' }
  // A WORLD THAT CANNOT IDENTIFY ITSELF CHECKS NOBODY. It has no identity to compare against, so
  // every caller would read as a visitor and every write would be refused for a fact nobody could
  // establish. Treating them as locals is the same answer an unnamed caller gets, and it is the one
  // that refuses nothing on the strength of something unread.
  if (thisWorld === null || thisWorld === '') return { where: 'local' }
  if (said === thisWorld) return { where: 'at home', home: said }
  if (theRememberedHomeDiedHere) return { where: 'at home, moved', home: said }
  return { where: 'visiting', home: said, visit: theVisitThisCallerHolds(said, thisWorld, visitId) }
}

/**
 * THE ROUTE A VISIT IS REGISTERED THROUGH, which is the one request a visitor may make without one.
 *
 * Written out here rather than in the hook, because it is the hook's own exception and the reason
 * belongs beside the rule: a visitor arrives holding nothing, so the door it knocks on cannot be a
 * door that asks whether it has already knocked.
 */
const THE_DOOR_A_VISITOR_KNOCKS_ON = '/api/office/visits'

/** True when this request is asking for something rather than changing something. */
function isARead(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
}

/**
 * REFUSE A WRITE FROM A WORLD WITH NO VISIT, AND WARN A READ. Criterion C4.
 *
 * One hook on every request. It is `preHandler` rather than `onRequest` so that a route's own
 * refusals and this one arrive through the same error path, and so that the reply Fastify sends
 * still carries the world header every other reply does.
 *
 * IT NEVER TOUCHES A LOCAL OR A CITIZEN AT HOME. Those are two of the three states the answer names,
 * and both pass through untouched: a local agent and the person's own curl may reach everything.
 *
 * A FAILURE TO WORK THE ANSWER OUT LETS THE REQUEST THROUGH. This check reads a file and a table,
 * and a fault in either would otherwise refuse every write in a visited world for a reason nobody
 * could see. The one thing it must never do is refuse on the strength of something it could not
 * read.
 */
export function checkWhereTheCallerIsFrom(app: FastifyInstance): void {
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    let from: WhereTheCallerIsFrom
    let to = ''
    let thePersonProvedIt = false
    try {
      to = theWorldThisDatabaseIs() ?? ''
      /**
       * OP1. THE PERSON'S KEY OUTRANKS THE REMEMBERED WORLD.
       *
       * A paired browser sends the person's key, and a request that proves the person is at home
       * here whatever home its page remembers. The one reader of a key is used, so there is one way
       * to prove the person and no second one here.
       */
      thePersonProvedIt = howThisRequestProvedItself(req)?.how === 'the-person-key'
      const home = headerValue(req, HOME_HEADER) ?? null
      // THE TABLE IS READ ONLY FOR A HOME THAT IS NOT THIS WORLD. A page at home — the common case —
      // would otherwise pay a worlds read on every request for a question whose answer cannot matter,
      // because `whereTheCallerIsFrom` reads an equal home as at home before it looks at this.
      const remembered = home === null ? '' : home.trim()
      from = whereTheCallerIsFrom(
        home,
        headerValue(req, VISIT_HEADER) ?? null,
        to === '' ? null : to,
        // OP2. A home header naming this installation's own former home is read as "at home, moved".
        remembered !== '' && remembered !== to && isADeadHomeOfThisInstallation(remembered),
      )
    } catch {
      // Catching to the letter of invariant 4: what is handled here is "this server could not work
      // out where the caller is from", and what is done about it is to let the request through, the
      // same answer a caller that named no home gets. Refusing on an unread fact is the one outcome
      // this check must not produce.
      return
    }
    /**
     * OP2. THIS OFFICE'S OWN FORMER HOME IS STILL HOME. The request passes, and the reply carries
     * the one header saying which world is home now, so the page can rewrite what it remembers.
     */
    if (from.where === 'at home, moved') {
      reply.header(HOME_MOVED_HEADER, to)
      return
    }
    // OP1 again, after the moved header: a request that proved the person passes whatever the home
    // header said, and it is not asked about a visit. Everything else about another machine's
    // request is unchanged.
    if (thePersonProvedIt) return
    if (from.where !== 'visiting' || from.visit !== null) return
    if (isARead(req.method)) {
      reply.header(VISIT_WARNING_HEADER, noVisitWarning(from.home, to))
      return
    }
    // THE ONE DOOR A VISITOR MAY KNOCK ON WITHOUT A VISIT is the one that registers it.
    if (req.url.split('?')[0] === THE_DOOR_A_VISITOR_KNOCKS_ON) return
    throw new PanelError(
      noVisitRefusal(from.home, to),
      403,
      undefined,
      undefined,
      undefined,
      { code: 'fromAnotherWorldWithNoVisit', values: {} },
    )
  })
}

/**
 * REPORT EVERY VISIT THIS WORLD IS HOLDING TO THE OFFICE. Criteria C4 and C8.
 *
 * A visit is registered at the world being entered, so this is how it reaches the list a person
 * reads. A world that could not reach the office keeps the row with nothing in `reportedAt`, and the
 * next call carries it — which is C8's *records a visit locally and reports it to the office when
 * the main world answers again*. The office writes down when it LEARNT about the visit and keeps
 * when it BEGAN, so the row it holds says the visit was registered late without anybody marking it.
 *
 * IT DOES NOTHING AT THE OFFICE ITSELF, because the row is already there.
 *
 * IT DOES NOTHING UNDER A TEST RUNNER, for the reason `reportThisWorldToTheOffice` gives in full:
 * the office's address is read from the declaration, and every server the suite starts would report
 * into whatever is answering on the declared port — which on this machine is a person's own
 * Mole Office.
 *
 * IT NEVER FAILS THE REGISTRATION. The visit is registered here whatever the office does; this says
 * in words whether the office knows about it yet.
 */
export async function reportHeldVisitsToTheOffice(): Promise<{ reported: number; why: string }> {
  if (theOfficeIsInThisDatabase()) {
    return { reported: 0, why: 'this world holds the office, so every visit here is already at the office' }
  }
  if (underATestRunner()) {
    return {
      reported: 0,
      why:
        'this server was started by a test runner, and the office the declaration names is the one a person is ' +
        'using. A test world keeps its visits in its own database and nowhere else.',
    }
  }
  const held = (
    sqlite.prepare('SELECT * FROM visits WHERE reported_at IS NULL').all() as Record<string, unknown>[]
  ).map(asVisit)
  if (held.length === 0) return { reported: 0, why: 'this world is holding no visit the office has not seen' }
  const where = `${whereTheOfficeIs()}/api/office/visits`
  // WHO THIS WORLD REPORTS AS, worked out once and before anything is sent. A key with no name to
  // go under is said here in words, and not counted below as an office that did not answer.
  let identity: Record<string, string>
  try {
    identity = theHeadersThisWorldReportsUnder()
  } catch (err) {
    return { reported: 0, why: err instanceof Error ? err.message : String(err) }
  }
  let reported = 0
  for (const one of held) {
    try {
      const res = await fetch(where, {
        method: 'POST',
        // REPORTED BY THIS SERVER, NOT AS THE VISITOR. The visitor is in the body; sending their
        // identity on the headers would file this call under them, and the call is this server's.
        // Under the starter's name and key when this world holds one, and the office's own name
        // with no key when it does not: `theHeadersThisWorldReportsUnder` in lib/office.ts says which.
        headers: { 'content-type': 'application/json', ...identity },
        body: JSON.stringify({
          visitor: one.visitor,
          fromWorld: one.fromWorld,
          // THE WORLD THE VISIT WAS TO, said out loud, because the office is not where anybody went.
          // Without it the office would write down a visit to itself.
          toWorld: one.toWorld,
          why: one.why,
          since: one.since,
          // THE ID THIS WORLD GAVE IT, so the office holds the same visit and not a second one.
          id: one.id,
        }),
        signal: AbortSignal.timeout(2000),
      })
      if (!res.ok) continue
      thisVisitReachedTheOffice(one.id, nowStamp())
      reported += 1
    } catch {
      // Catching to the letter of invariant 4: what is handled here is "the office did not answer",
      // and what is done about it is to leave the row unreported and say so in the count. Nothing is
      // hidden: `reportedAt` stays null and the next call tries again.
    }
  }
  return {
    reported,
    why:
      reported === held.length
        ? `the office at ${where} wrote down ${String(reported)} visit(s) this world was holding`
        : `${String(held.length - reported)} visit(s) are still waiting: the office at ${where} did not take them`,
  }
}

/**
 * HOW OFTEN A WORLD HOLDING AN UNREPORTED VISIT ASKS THE OFFICE AGAIN.
 *
 * Thirty seconds. Criterion C8 says a world *reports it to the office when the main world answers
 * again*, and something has to notice that the office is back. Until 4 September nothing did: a
 * held visit moved only when the NEXT visit was registered at that world, so a world with one
 * visitor and no more arrivals held its row for ever. The citizens verifier watched the office come
 * back up and the row still be unreported twelve seconds later, and then both go at once when a
 * second trip was registered.
 *
 * WHY A TIMER AND NOT A READ. The other place this could hang is `GET /api/office/visits`, and a
 * read that writes is a read whose answer depends on who asked it last. A world that is holding
 * nothing does one SELECT every thirty seconds and stops there.
 */
export const HOW_OFTEN_A_HELD_VISIT_IS_TRIED_AGAIN_MS = 30_000

/**
 * Keep asking the office to take the visits this world is holding, until told to stop.
 *
 * THE REPORTING IS HANDED IN so a test can count the tries without a network. Nothing in the app
 * passes it: the default is the real one, and the interval is the only thing this adds.
 *
 * IT NEVER HOLDS THE PROCESS OPEN. `unref` where the platform has it, so a server that is shutting
 * down is not kept alive by a timer about a list.
 */
export function keepTryingHeldVisits(
  everyMs: number = HOW_OFTEN_A_HELD_VISIT_IS_TRIED_AGAIN_MS,
  tryNow: () => Promise<{ reported: number; why: string }> = reportHeldVisitsToTheOffice,
  say: (line: string) => void = () => {},
): () => void {
  // NAMED, so a long run is a line in the log and the loop watch can say whose a hold was (lib/named-timers.ts).
  const timer = setInterval(
    named('the held-visit retry', say, () => {
      void tryNow().then((said) => {
        if (said.reported > 0) say(`${String(said.reported)} visit(s) this world was holding reached the office`)
      })
    }),
    everyMs,
  )
  if (typeof timer.unref === 'function') timer.unref()
  return () => clearInterval(timer)
}

/**
 * TELL THE OFFICE A VISIT HAS ENDED, when this world is not the office.
 *
 * The other half of a trip. The office holds its own copy of the row — the same id since
 * `vFrn8Z7VZLhD` — and a trip ended at the world being visited left the office's copy open, so the
 * list of who is away from home only ever grew.
 *
 * IT NEVER FAILS THE ENDING. The visit is ended here whatever the office does, and the sentence
 * says whether the office knows.
 */
export async function reportThisVisitEndedToTheOffice(id: string): Promise<{ told: boolean; why: string }> {
  if (theOfficeIsInThisDatabase()) {
    return { told: false, why: 'this world holds the office, so the row that ended is the office\u2019s own' }
  }
  const notMine = whyTheDeclaredOfficeIsNotThisWorlds()
  if (notMine !== null) return { told: false, why: notMine }
  const where = `${whereTheOfficeIs()}/api/office/visits/${encodeURIComponent(id)}/end`
  try {
    const res = await fetch(where, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...theHeadersThisWorldReportsUnder() },
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return { told: false, why: `the office at ${where} answered ${String(res.status)}` }
    return { told: true, why: `the office at ${where} marked it ended` }
  } catch (err) {
    return { told: false, why: `nothing answered at ${where} (${err instanceof Error ? err.message : String(err)})` }
  }
}
