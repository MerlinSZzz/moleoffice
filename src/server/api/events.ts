// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE CONNECTION PER PAGE, HELD OPEN, CARRYING WHAT HAPPENED.
 *
 *   GET /api/events        server-sent events: a new message, a delivery mark moving, a presence
 *                          change. One connection per page.
 *
 * WHY THIS IS THE ONLY ROUTE HERE. Every write already goes through the API and the page only
 * listens, so the traffic is one way and a socket would be a second write door with its own rules.
 * Criterion M5 and the engineering decision under section 7.5 of design/messages/ACCEPTANCE.md.
 *
 * WHAT IS HELD, AND WHERE. The ring of recent events and the list of open pages are in
 * src/server/lib/events.ts, in memory. A connection cannot outlive the process holding it, so
 * writing one down would leave rows describing pages that are gone.
 */

import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { z } from 'zod'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { whichWorldAnswered } from '../lib/world.ts'
import { participantForActor } from '../lib/participant-for-actor.ts'
import { listParticipants } from '../db/list-participants.ts'
import {
  announce,
  channelState,
  everyPageOpen,
  pageClosed,
  pageIsStillThere,
  pageOpened,
  reachedAPageBeforeItWasCounted,
  since,
  thisRun,
  whoIsConnected,
} from '../lib/events.ts'
import { everybodysPresence, participantPresence, presenceSessionRowsForOneClock, thePresenceOf, type ParticipantPresenceReading, type PresenceSessionRows } from '../lib/presence.ts'
import { named, runNamed } from '../lib/named-timers.ts'
import { answeringLookNow } from '../lib/answering-told.ts'
import { lookOnOneReadingOfEveryProcess } from '../lib/a-look-on-one-reading-of-every-process.ts'
import { osProbe } from '../lib/resources.ts'
import { howThisRequestProvedItself } from '../lib/keys.ts'
import { THE_PRESENCE_LOOK_SETTING, theIntervalOfThePresenceLook } from '@shared/presence-clock.ts'
import { participantKey } from '@shared/messages.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import {
  CONNECTING_FOR_PARAM,
  CONNECTION_IS_COUNTED,
  CONNECTION_TAG_PARAM,
  RUN_LINE,
  RUN_PARAM,
  MACHINE_PARTS_AN_EVENT_CAN_NAME,
  type AMachinePart,
  type EventOnTheWire,
  type PresenceReadingOnTheWire,
} from '@shared/events.ts'
import { whatAPageHoldsOfTheMachine } from '../lib/runtime.ts'
import { whatToTellAPageOnAnotherOrigin } from '../../config/what-a-page-may-read.mjs'
import { HOME_MOVED_HEADER } from '../../config/visit-headers.mjs'
import { originsAPageMayBeOn, settings, settingValue } from '../../config/settings.mjs'

const STREAM_NOTE =
  'WHAT HAPPENED, AS IT HAPPENS. This request is held open and the server writes a line to it whenever there is ' +
  'something for this page to know: somebody sent a message, a message got further with somebody, what a page ' +
  'draws of somebody\'s presence changed, or a list the messages panel holds changed, or what a page compares of the machine changed. A message and a mark carry ' +
  'the change itself, so a page can apply it without reading its lists again. It is server-sent events, so a ' +
  'browser reads it with a stream reader rather than by asking again. The tabs of one browser share one ' +
  'connection. An event about a message (a new message, a mark moving on one, a comment, an offer to lead, a ' +
  'message deleted or brought back) reaches only the pages of the message\'s sender, of everybody it was ' +
  'addressed or routed to, of the members of its group when it was sent, and of the owner; no other page is sent ' +
  'it. Within that, a new message reaches those pages in every project; a mark reaches the pages ' +
  'of the one whose mark it is and the pages watching the message\'s project; a comment and an offer reach the ' +
  'pages watching the message\'s project. A presence change reaches every page, and so does a machine change: the ' +
  'server looks every fifteen seconds while a person has a page open, and says which parts of GET /api/runtime that ' +
  'a page compares or shows have moved, so the page reads it once instead of asking every thirty seconds. A list ' +
  'change reaches the pages ' +
  'of the one participant it is about, or every page when it is about nobody in particular. Every other event ' +
  'reaches only the pages watching the project named on the request, because a page watching one project must ' +
  'not be shown another project\'s work. To pick up where you ' +
  'left off after a break, send the id of the last event you saw as the Last-Event-ID header and the run id the ' +
  'stream\'s second line gave you as ?run=: everything after it that is still remembered is sent first, and the ' +
  'reply says how many are too old to be remembered so you can read the pool again rather than believing you saw ' +
  'them. A run id that is not this server\'s means it restarted, and nothing is sent from memory. This route never ' +
  'writes anything except the note that your page is open, which is what makes you read as online to everybody else.'

const STATE_NOTE =
  'WHAT THE CHANNEL HOLDS RIGHT NOW: how many pages are open, how many recent events are remembered, how many have ' +
  'been forgotten since this server started, and which event names anything actually sends today. It writes ' +
  'nothing. Add ?tag=<the name a page gave its own connection> and the reply also says how many open connections ' +
  'carry that name, which is a number nobody else\u2019s page can move; without it that field is null, which says ' +
  'nobody asked rather than none. Add ?connectingFor=<milliseconds> beside the tag, the time your page took from ' +
  'starting to load to its stream listening, and the reply also says, in whileConnecting, how many events that would ' +
  'have reached your connection were announced in that many milliseconds before the server counted it. Those are ' +
  'the events your page may have missed while it was still connecting; a number above zero means read your lists ' +
  'once. whileConnecting.byName counts the same events by name: when only record.changed was missed, read again ' +
  'only what shows those records. Its count and byName are null when no open connection of yours carries the tag, ' +
  'or when some events from that time have been forgotten, and then nobody can say. Without connectingFor, ' +
  'whileConnecting is null.'

const whatThePageSaw = z.object({
  /** The id of the last event this page saw, when it is picking up after a break. */
  lastEventId: z.coerce.number().int().positive().optional(),
  /** The name this page gives its own connection, so a count can be about this page. */
  [CONNECTION_TAG_PARAM]: z.string().min(1).max(64).optional(),
  /** The run of the server the page's last event id belongs to, when it knows one. */
  [RUN_PARAM]: z.string().min(1).max(64).optional(),
})

const whichTag = z.object({
  [CONNECTION_TAG_PARAM]: z.string().min(1).max(64).optional(),
  /** How long the page took from starting to load to its stream listening, in milliseconds. */
  [CONNECTING_FOR_PARAM]: z.coerce.number().finite().nonnegative().optional(),
})

/** How often the server writes a comment line, so a proxy or a dead socket is noticed. */
const KEEP_OPEN_EVERY_MS = 25_000

// ============================================================================ presence, told only when it changed

/**
 * HOW OFTEN THE SERVER LOOKS AGAIN AT EVERYBODY'S PRESENCE, while a person has a page open.
 *
 * A dot can change colour with no write at all: an agent that stops speaking goes stale after some
 * minutes, a hold runs out, a page that died without closing stops saying it is there. Nothing
 * announces those, and a page that is only told about changes would draw the old colour for ever. So
 * the server takes the reading again once a minute, for each person with a page open and each project
 * those pages watch, and announces what changed. One reading a minute replaces the reads every open
 * page made on every presence event before (report VQw5RwL8gbCb: the owner's pages read presence 80 times in
 * half an hour).
 *
 * The interval is worked out in @shared/presence-clock.ts: a minute, unless a test office sets
 * MOLE_OFFICE_LOOK_AT_PRESENCE_AGAIN_EVERY_MS to a few seconds.
 */

/**
 * WHAT EACH PERSON'S PAGES WERE LAST TOLD ABOUT EACH PARTICIPANT, as the parts a page draws.
 *
 * Keyed by the project, the reader and the participant. The parts are the colour, the word, the state
 * line, whether that line may be stale, the person's own choice, and a permanent resident's sleep line.
 * The sentence `says` is left out on purpose: it counts seconds, so it changes every second, and
 * announcing it would announce everything.
 */
const lastTold = new Map<string, string>()

/** The readers whose pages draw presence: one per person with a page open, in each project watched. */
function thePeopleWatching(): { workspaceId: string; reader: ParticipantRef; key: string }[] {
  const out = new Map<string, { workspaceId: string; reader: ParticipantRef; key: string }>()
  for (const page of everyPageOpen()) {
    // ONLY A PERSON'S PAGE DRAWS PRESENCE. An agent's stream (tools/hold-the-handle.mjs) waits for a
    // message and draws nothing, and working out a reading for each of them would cost a presence
    // read per agent per change. A page whose reader is not a person is still sent the event, without
    // a reading, and reads the one participant if it draws them.
    if (page.who === null || page.who.kind !== 'person') continue
    const key = `${page.workspaceId}|${participantKey(page.who)}`
    if (!out.has(key)) out.set(key, { workspaceId: page.workspaceId, reader: page.who, key })
  }
  return [...out.values()]
}

function whatAPageDraws(reading: ParticipantPresenceReading): string {
  return JSON.stringify([reading.colour, reading.word, reading.state, reading.stateMayBeStale, reading.choice, reading.residentSleep])
}

/**
 * LOOK AGAIN AT SOME PARTICIPANTS' PRESENCE, OR EVERYBODY'S, AND ANNOUNCE WHAT A PAGE DRAWS THAT CHANGED.
 *
 * For each person with a page open, in each project they watch, the reading is taken as that person is
 * told it. A participant is announced once when what any of those pages draws of them changed. Each
 * person's page is sent the reading as its own reader is told it; every other page is sent the plain
 * event. A reader seen for the first time is not announced to: their page has just read everything
 * itself, so the first reading is only remembered.
 */
export function presenceMayHaveChanged(who: readonly ParticipantRef[] | 'everybody', now: Date = new Date(), clockSessions?: PresenceSessionRows): number {
  const look = aLookAtPresence(who, now, clockSessions)
  for (const reader of look.readers) reader()
  return look.tell()
}

/**
 * THAT LOOK, IN ITS PARTS, NOT YET RUN: one reader for each person with a page open in each project they watch, and then
 * the telling. The look above runs every part at once. The presence clock runs each part as a run of its own, so the
 * server answers between two of them (wave 13y round 166). Building it forgets what nobody is watching any more.
 */
function aLookAtPresence(
  who: readonly ParticipantRef[] | 'everybody',
  now: Date,
  clockSessions: PresenceSessionRows | undefined,
): { readers: (() => void)[]; tell: () => number } {
  const watching = thePeopleWatching()
  // FORGET WHAT NOBODY IS WATCHING ANY MORE, so a person who opens a page later starts from their own
  // first read and is not compared with a reading from an hour ago.
  const stillWatched = new Set(watching.map((one) => one.key))
  for (const key of [...lastTold.keys()]) {
    if (!stillWatched.has(key.slice(0, key.lastIndexOf('#')))) lastTold.delete(key)
  }
  for (const key of [...seen]) if (!stillWatched.has(key)) seen.delete(key)
  const readings = new Map<string, ParticipantPresenceReading>()
  const changed = new Map<string, ParticipantRef>()
  // BOTH REGISTRIES, READ ONCE FOR EVERY READER OF THE LOOK. A reading writes only the holds it releases, which neither
  // registry holds. An agent registered between two of the clock's parts is in no reading of this look, and the next
  // look reads it first, as it reads any agent registered between two looks.
  let both: ReturnType<typeof listParticipants> | undefined
  const readers = watching.map((one) => (): void => {
    // A READER SEEN FOR THE FIRST TIME has everybody's reading taken once and remembered, and nothing is
    // announced to them: their page read the presence list itself when it opened.
    const first = !seen.has(one.key)
    seen.add(one.key)
    const read =
      who === 'everybody' || first
        ? everybodysPresence(one.workspaceId, now, one.reader, false, clockSessions, (both ??= listParticipants()))
        : who.map((w) => participantPresence(w, one.workspaceId, now, one.reader))
    for (const reading of read) {
      const at = `${one.key}#${participantKey(reading.who)}`
      readings.set(at, reading)
      const drawn = whatAPageDraws(reading)
      const before = lastTold.get(at)
      lastTold.set(at, drawn)
      if (!first && before !== undefined && before !== drawn) changed.set(participantKey(reading.who), reading.who)
    }
  })
  const tell = (): number => {
    if (changed.size === 0) return 0
    // EVERY CHANGED PARTICIPANT'S COLOUR IN ONE READ, as nobody, in the first project watched, as the rows a page draws
    // are read (`thePresenceOf`), and from the clock's session rows when the clock looks. Read one participant at a
    // time, each colour read the project's runs again: about 190 ms each on a made-up office of the live shape.
    const participants = [...changed.values()]
    const colours = thePresenceOf(participants, watching[0]?.workspaceId ?? 'default', now, null, false, undefined, clockSessions)
    for (const [n, participant] of participants.entries()) {
      const plain = {
        name: 'presence.changed' as const,
        who: participant,
        colour: colours[n]!.colour,
      }
      announce(plain, (page) => {
        if (page.who === null || page.who.kind !== 'person') return plain
        const at = `${page.workspaceId}|${participantKey(page.who)}#${participantKey(participant)}`
        const reading = readings.get(at)
        // A PAGE TOLD A NEWER READING SINCE THIS LOOK TOOK ITS OWN, by a look that ran between two of the clock's parts,
        // is sent the plain event, so it reads the participant itself and never draws the older reading over the newer.
        return reading === undefined || lastTold.get(at) !== whatAPageDraws(reading)
          ? plain
          : { ...plain, reading: reading as unknown as PresenceReadingOnTheWire }
      })
    }
    return changed.size
  }
  return { readers, tell }
}

/** The readers whose first reading has been taken, by the same key as `thePeopleWatching`. */
const seen = new Set<string>()

/** Take the first reading for a reader whose page has just opened, and announce nothing. */
function rememberWhatANewReaderSees(): void {
  presenceMayHaveChanged([])
}

/** Forget every reading remembered. For a test that wants to start from nothing. */
export function forgetWhatPagesWereToldOfPresence(): void {
  lastTold.clear()
  seen.clear()
}

let theClock: ReturnType<typeof setInterval> | null = null

/** A turn of the event loop: what is waiting runs before what follows this. */
const aTurn = (): Promise<void> => new Promise((done) => setImmediate(done))

/** The parts of one look of the clock, in their order: each person's reading in each project, the telling, and who is answering. */
function thePartsOfTheClocksLook(): (() => void)[] {
  const sessions = presenceSessionRowsForOneClock()
  const presence = aLookAtPresence('everybody', new Date(), sessions)
  return [
    ...presence.readers,
    () => void presence.tell(),
    // AND WHO IS ANSWERING AS EACH AGENT, which can change with no write: a hold that went quiet, a wait that ran
    // out (lib/answering-told.ts).
    () => void answeringLookNow('every agent', undefined, sessions),
  ]
}

/**
 * THE ONCE-A-MINUTE LOOK, at everybody's presence and at who is answering as each agent, ONE PART AT A TIME, WITH THE
 * THREAD GIVEN BACK BEFORE EACH PART. In one run the look held the live server for up to 2.2 s (wave 13y round 166).
 * `run` is the run each part is given, so the clock's tick makes each part a named run of its own. A part that throws
 * is said in the log, and the parts after it are not run. Exported for the tests that count its readings.
 *
 * ON WINDOWS THE LOOK STAYS ONE RUN, made after one reading of every process by the way that waits
 * (lib/a-look-on-one-reading-of-every-process.ts).
 */
export async function thePresenceClocksLook(log: (line: string) => void, run: (part: () => void) => void = (part) => part()): Promise<void> {
  if (thePeopleWatching().length === 0) return
  const name = 'the presence clock\'s look'
  if (osProbe().readEveryProcessFirst !== undefined) {
    lookOnOneReadingOfEveryProcess(name, log, () => {
      for (const part of thePartsOfTheClocksLook()) part()
    })
    return
  }
  const finished = (part: () => void): boolean => {
    let done = false
    lookOnOneReadingOfEveryProcess(name, log, () => run(() => {
      part()
      done = true
    }))
    return done
  }
  let parts: (() => void)[] = []
  if (!finished(() => (parts = thePartsOfTheClocksLook()))) return
  for (const part of parts) {
    await aTurn()
    if (!finished(part)) return
  }
}

/** The clock's tick: its look, with each part a run named "the presence clock", and the look's promise, which ends with the look. */
export function thePresenceClocksTick(log: (line: string) => void): () => Promise<void> {
  return () => runNamed('the presence clock', log, () => thePresenceClocksLook(log, (part) => runNamed('the presence clock', log, part)))
}

/** Start the presence look, every minute unless the setting gives another interval, when a server registers `eventRoutes` and no look runs. */
function startTheClock(log: (line: string) => void): void {
  if (theClock !== null) return
  // ITS INTERVAL IS READ HERE, ONCE. A value the setting cannot mean throws, and the server does not start.
  const every = theIntervalOfThePresenceLook(settingValue(THE_PRESENCE_LOOK_SETTING))
  // NAMED, so a long run is a line in the log and the loop watch can say whose a hold was (lib/named-timers.ts).
  theClock = setInterval(thePresenceClocksTick(log), every)
  // THE CLOCK DOES NOT HOLD THE PROCESS OPEN, for the reason the stream's own beat gives below.
  theClock.unref()
}

// ============================================================================ the machine, told only when it changed

/**
 * HOW OFTEN THE SERVER LOOKS AGAIN AT WHAT A PAGE COMPARES OR SHOWS OF THE MACHINE, while a person has a page open.
 *
 * Wave 13w round 25. Until then every open page read the whole machine reading every thirty
 * seconds: on the owner's office that was 1,149 reads a day, each taking 439 ms at the median. Now the server takes the
 * small part of it a page compares (`whatAPageHoldsOfTheMachine` in lib/runtime.ts) on this clock, once for every page
 * at once, and announces `machine.changed` only when a part moved. A page reads the whole reading once when told.
 *
 * WHY A LOOK AND NOT ONLY AN ANNOUNCEMENT AT A WRITE. Nothing writes when a source file is saved, when a supervisor's
 * failed start is written by another process, or when .env is edited by hand, and each of those changes what a page
 * must show. Fifteen seconds is half the wait a page had before for the same change.
 */
const LOOK_AT_THE_MACHINE_AGAIN_EVERY_MS = 15_000

/** What the last look found, part by part, or null before the first look. */
let theMachineAsLastSeen: Record<AMachinePart, string> | null = null

/**
 * LOOK AT WHAT A PAGE HOLDS OF THE MACHINE AND ANNOUNCE THE PARTS THAT MOVED SINCE THE LAST LOOK.
 *
 * The first look only remembers, because every page reads the machine itself when it loads. Returns the parts
 * announced, which is empty when nothing moved.
 */
export function theMachineMayHaveChanged(): AMachinePart[] {
  const now = whatAPageHoldsOfTheMachine()
  const before = theMachineAsLastSeen
  theMachineAsLastSeen = now
  if (before === null) return []
  const changed = MACHINE_PARTS_AN_EVENT_CAN_NAME.filter((part) => before[part] !== now[part])
  if (changed.length > 0) announce({ name: 'machine.changed', changed })
  return changed
}

/** Forget the last look. For a test that wants to start from nothing. */
export function forgetWhatPagesWereToldOfTheMachine(): void {
  theMachineAsLastSeen = null
}

let theMachineClock: ReturnType<typeof setInterval> | null = null

/** Start the look at the machine, the first time any server in this process serves a stream. */
function startTheMachineClock(log: (line: string) => void): void {
  if (theMachineClock !== null) return
  theMachineClock = setInterval(
    named('the machine clock', log, () => {
      if (thePeopleWatching().length === 0) return
      theMachineMayHaveChanged()
    }),
    LOOK_AT_THE_MACHINE_AGAIN_EVERY_MS,
  )
  theMachineClock.unref()
}

/**
 * THE CLOCK'S LOG LINE, HOLDING THE SERVER'S LOG ONLY WEAKLY, and made out here rather than inside `eventRoutes`. A
 * function made in `eventRoutes`, or one holding `app.log`, kept its whole server alive while the clock ran, and by-id-
 * boundary ran out of memory holding over two thousand servers (round 16). A served office keeps its one server, so its
 * log is there.
 */
function warningsTo(logger: FastifyBaseLogger): (line: string) => void {
  const held = new WeakRef(logger)
  return (line) => held.deref()?.warn(line)
}

/**
 * THE SERVERS IN THIS PROCESS THAT SERVE THE STREAM. The two clocks stop when the last of them closes. A clock that ran
 * on after its server closed held this module and everything it imports. A test file that imports this module afresh
 * for each test kept one copy of the whole server's code per test that way, and by-id-boundary ran out of memory near
 * 4 GB after 162 tests (wave 13s round 61).
 */
let serversServingTheStream = 0

function stopTheClocks(): void {
  if (theClock !== null) clearInterval(theClock)
  if (theMachineClock !== null) clearInterval(theMachineClock)
  theClock = null
  theMachineClock = null
}

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  startTheClock(warningsTo(app.log))
  startTheMachineClock(warningsTo(app.log))
  serversServingTheStream += 1
  app.addHook('onClose', async () => {
    serversServingTheStream -= 1
    if (serversServingTheStream === 0) stopTheClocks()
  })
  app.get('/events/state', route('events.state', 'remote', STATE_NOTE), async (req) => {
    const asked = parse(whichTag, req.query ?? {}, 'Which connection to count')
    const tag = asked[CONNECTION_TAG_PARAM] ?? null
    const connectingFor = asked[CONNECTING_FOR_PARAM] ?? null
    if (connectingFor !== null && tag === null) {
      throw new PanelError(
        `?${CONNECTING_FOR_PARAM}= asks about one connection, and names it with ?${CONNECTION_TAG_PARAM}=, which is missing. ` +
          'Nothing was counted.',
        400,
      )
    }
    const whileConnecting =
      connectingFor === null || tag === null
        ? null
        : {
            ms: connectingFor,
            ...(reachedAPageBeforeItWasCounted(tag, participantForActor(actorFrom(req)), connectingFor) ?? { reached: null, byName: null }),
          }
    return { ...channelState(tag), whileConnecting }
  })

  app.get(
    '/events',
    // `waits: true` SAYS THIS IS HELD OPEN. Without it every measurement of how long a request takes
    // would carry a connection that lasted an hour, and every median in the usage report would be a
    // lie. src/server/lib/usage.ts reads this flag off the route's own declaration.
    { config: { ...route('events.stream', 'remote', STREAM_NOTE).config, waits: true } },
    async (req, reply) => {
      const workspaceId = workspaceOf(req)
      const asked = parse(whatThePageSaw, req.query ?? {}, 'What this page last saw')
      const headerSaid = req.headers['last-event-id']
      // AN ID FROM ANOTHER RUN OF THE SERVER MEANS NOTHING HERE. Ids count from 1 again at every start,
      // so id 500 from before a restart would skip this run's first 500 events, or none. A page that
      // names another run is sent nothing from memory, and the run line below tells it to read again.
      const fromAnotherRun = asked[RUN_PARAM] !== undefined && asked[RUN_PARAM] !== thisRun()
      const lastSeen = fromAnotherRun
        ? null
        : (asked.lastEventId ??
          (typeof headerSaid === 'string' && /^[0-9]+$/.test(headerSaid) ? Number(headerSaid) : null))
      const actor = actorFrom(req)
      const who = participantForActor(actor)
      const proof = howThisRequestProvedItself(req)?.how ?? null

      reply.raw.setHeader('content-type', 'text/event-stream')
      reply.raw.setHeader('cache-control', 'no-cache, no-transform')
      reply.raw.setHeader('connection', 'keep-alive')
      // THE WORLD HEADER AND THE FRESHNESS HEADER, set here rather than by the hook: `reply.hijack()`
      // takes this reply out of Fastify's hands and the onSend hook never runs on it. Both come from
      // `whichWorldAnswered`, which the hook reads too, so a stream cannot say a different world
      // from every other reply. Criterion G3 of design/ground/ACCEPTANCE.md does not stop applying
      // to a request that stays open: a page must be able to refuse a stream from another world.
      for (const [name, value] of Object.entries(whichWorldAnswered())) reply.raw.setHeader(name, value)
      // AND THE CORS HEADERS, for the same reason and from the same difficulty: `reply.hijack()`
      // below means the CORS plugin's hook never runs on this reply either. A page on another
      // origin — which every page is in development, since Vite serves it on its own port — would
      // have its stream refused by the browser before a line of it arrived, and the page would say
      // it could not reach the server while every other request worked.
      // `src/config/what-a-page-may-read.mjs` is the one declaration; it reads the same list of
      // allowed origins the plugin does, and the same rule on whether a page may send its cookie
      // (`A_PAGE_MAY_SEND_ITS_COOKIE`), so an admitted page gets `access-control-allow-credentials`
      // here exactly as it does on every other reply.
      const toThatOrigin = whatToTellAPageOnAnotherOrigin(req.headers.origin, originsAPageMayBeOn(settings()))
      for (const [name, value] of Object.entries(toThatOrigin)) {
        reply.raw.setHeader(name, value)
      }
      // AND THE MOVED-HOME HEADER, for criterion DF28, when the visit hook set it. That hook
      // (`checkWhereTheCallerIsFrom`) runs before this handler, and sets the header on `reply` when the
      // home this request sent is this installation's own former home. Fastify writes a header set on
      // `reply` only when it sends the reply itself, and after `reply.hijack()` below it never does.
      // Copied here, the stream carries the header whenever an ordinary reply to the same request
      // would. The stream works nothing out itself: the hook alone decides.
      const movedHome = reply.getHeader(HOME_MOVED_HEADER)
      if (movedHome !== undefined) reply.raw.setHeader(HOME_MOVED_HEADER, movedHome)
      reply.hijack()
      reply.raw.flushHeaders()

      const write = (one: EventOnTheWire): void => {
        reply.raw.write(`id: ${String(one.id)}\nevent: ${one.event.name}\ndata: ${JSON.stringify(one.event)}\n\n`)
      }

      const caught = since(lastSeen, workspaceId, who)
      // WHAT THIS PAGE CANNOT BE GIVEN, SAID FIRST. A page that was away longer than the server
      // remembers is told the number rather than handed the tail and left believing it saw
      // everything. It is a comment line, so it reaches a reader that logs the stream and is not
      // mistaken for an event.
      reply.raw.write(`: open ${String(caught.missed)} missed\n\n`)
      // AND WHICH RUN OF THE SERVER THIS IS, AND THE ID OF ITS NEWEST EVENT. See `RUN_LINE`.
      reply.raw.write(`: ${RUN_LINE} ${thisRun()} at ${String(channelState().lastId)}\n\n`)
      for (const one of caught.events) write(one)

      // WHETHER THIS IS THE FIRST PAGE THIS PARTICIPANT HOLDS OPEN. Only the first page opening and the
      // last one closing can change what the connection says about them.
      const theFirstOfTheirs = who !== null && whoIsConnected(who) === null
      const listenerId = pageOpened({ workspaceId, who, send: write, tag: asked[CONNECTION_TAG_PARAM] ?? null, proof })
      // AND THE PAGE IS TOLD IT IS COUNTED, which is the moment `GET /api/events/state` can answer
      // about it. The first line above is written before this, because what a page missed has to be
      // worked out before anything is sent; a caller that read that line and immediately asked how
      // many pages were open could be told a number taken before its own connection joined the list.
      reply.raw.write(`: ${CONNECTION_IS_COUNTED}\n\n`)
      // AND EVERYBODY ELSE IS TOLD THAT THIS PARTICIPANT IS THERE. A page opening is what turns a
      // person's dot green, so the dot on everybody else's screen changes at the same moment rather
      // than the next time they happen to read the page.
      //
      // ONLY WHEN WHAT A PAGE DRAWS OF THEM CHANGED. A page opening for somebody who already had one
      // open changes nothing anybody draws, and nor does a page opening for somebody whose hold was
      // already keeping them green; before 26 September both were announced, and on the owner's office 90 of
      // 95 such events said the same green as the one before. A new person's page is remembered first,
      // so what it has just read is what the next change is compared with.
      //
      // ON WINDOWS THESE LOOKS ARE MADE AFTER THE PROCESSES THEY ASK ABOUT ARE READ, by the way that waits, so they run
      // later than the page was counted by the time those scripts take (lib/a-look-on-one-reading-of-every-process.ts).
      lookOnOneReadingOfEveryProcess('the looks of a page that opened', (line) => app.log.warn(line), () => {
        rememberWhatANewReaderSees()
        if (who !== null && theFirstOfTheirs) presenceMayHaveChanged([who])
        // AND THE FIRST LOOK AT WHO IS ANSWERING AS EACH AGENT IN THIS PAGE'S PROJECT, when no page watched it before,
        // so a change after this page read the conversation is compared with what it read (lib/answering-told.ts).
        answeringLookNow([])
      })
      // THE FIRST LOOK AT THE MACHINE IS TAKEN WHEN THE FIRST PAGE OPENS, as that page reads the machine itself, so a
      // change between its read and the clock's first look is not missed. After a server's start, and never again.
      if (theMachineAsLastSeen === null) setImmediate(named('the first look at the machine', (line) => app.log.warn(line), () => {
        if (theMachineAsLastSeen === null) theMachineMayHaveChanged()
      }))

      // A COMMENT LINE EVERY SO OFTEN, so a connection that has quietly died is noticed by both
      // ends. It also counts as this page saying it is still there, which is what makes the person
      // at it read as online.
      const beat = setInterval(
        named('a stream\'s beat', (line) => app.log.warn(line), () => {
          pageIsStillThere(listenerId)
          reply.raw.write(': still here\n\n')
        }),
        KEEP_OPEN_EVERY_MS,
      )
      // THE INTERVAL DOES NOT HOLD THE PROCESS OPEN. Without this a server whose last page has gone
      // would refuse to exit, which is the orphan this repository has five incidents of.
      beat.unref()

      const close = (): void => {
        clearInterval(beat)
        pageClosed(listenerId)
        if (who !== null && whoIsConnected(who) === null) {
          lookOnOneReadingOfEveryProcess('the look of a page that closed', (line) => app.log.warn(line), () => {
            presenceMayHaveChanged([who])
          })
        }
      }
      req.raw.on('close', close)
      req.raw.on('error', close)
    },
  )
}
