// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The Mole Office server: one process that answers the JSON API and, in production, also hands the
 * browser its app.
 *
 * ---------------------------------------------------------------------------------------
 * TWO HALVES, AND WHY THEY ARE SEPARATE
 * ---------------------------------------------------------------------------------------
 *
 * `buildApp()` decides WHAT IS SERVED: the error handler, the health route, every route group
 * under /api, the browser app in production, and the 404. It returns a Fastify instance and it
 * DOES NOT LISTEN.
 *
 * `start()` decides HOW IT RUNS: it loads .env, reads and checks the ports, makes sure the database
 * is up to date — refusing to serve one that is not, rather than migrating it, for the reason
 * given at that line — calls `buildApp` and listens on a socket.
 *
 * WHY THE SPLIT EXISTS. Until it did, this file listened the moment it was loaded, so nothing
 * could import it and nothing could ask the product what it served. An audit measured the cost:
 * six of the nine route groups could be deleted from here and all 2,065 tests passed. The mutant
 * server answered 404 for /api/attention, /api/sessions, /api/resources, /api/source,
 * /api/queries and /api/layout, and the suite was green. That last group has since been deleted
 * outright -- it served the draggable panel grid, which no longer exists -- so do not go looking
 * for it below. Four separate test files each retyped the registration list by hand, so "every
 * endpoint is described" was a true statement about each author's idea of the server and said
 * nothing about the server -- which is how eight /api/presentation endpoints shipped answering
 * GET /api with `description: null` while two tests whose titles promise to prevent exactly that
 * passed.
 *
 * `tests/server-wiring.test.ts` is what now watches this file. It calls `buildApp()`, asks the
 * app what it serves, and checks that answer against the route groups on disk.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IMPORTING THIS FILE OPENS NO DATABASE, AND WHY THE IMPORTS BELOW LOOK UNUSUAL
 * ---------------------------------------------------------------------------------------
 *
 * `src/server/db/client.ts` reads MOLE_OFFICE_DB the moment it is imported and opens that file. So it
 * must not be imported before `.env` has been loaded, and every module that reaches it inherits
 * that rule -- which is most of `api/` and `lib/`.
 *
 * Static imports all run before the first line of a module's own code, so those modules are
 * pulled in with `await import()` inside `buildApp()` and `start()` instead, after the caller has
 * decided which database it is talking about. That is the only reason they look unusual, and it
 * is not decoration: `npm start` would open `./data/panelx.db` instead of the file named in .env
 * if one of them moved to the top.
 *
 * The imports that ARE at the top are exactly the ones that cannot reach a database: Node
 * builtins, Fastify and its two plugins, drizzle's query builders, `db/schema.ts` (table
 * definitions and nothing else) and `api/kinds.ts`, which deliberately imports from `src/shared/`
 * only so that the schema still answers on a server whose database will not open. `db/migrate.ts`
 * is NOT among them and is imported dynamically inside `start()`: it reaches the data migrations,
 * which read records.
 *
 * Terms used below, once:
 *   route     -- a URL pattern plus the code that answers it
 *   plugin    -- a bundle of routes registered together, here one file per group
 *   prefix    -- a path every route in a plugin sits under, "/api" for all of them
 *   CORS      -- the browser rule that stops a page on one port calling a server on another.
 *                In development the app is served by Vite on MOLE_OFFICE_WEB_PORT and this server
 *                listens on MOLE_OFFICE_PORT, which are different origins, so the rule has to be
 *                relaxed deliberately.
 */

import { privateRequestLogAddress, isPrivateInTheLog, isPrivateLoginRequest } from '../config/private-sandbox-login.mjs'
import { ROUTE_GROUPS } from './routes-list.ts'
import { withTheWayForThisJob } from '../config/the-office-tool-environment.mjs'
import { createServer, type Server } from 'node:http'
import { drain } from './lib/drain.ts'
import { join, resolve } from 'node:path'
import {
  THE_WORKER_LOG_ROOT,
  whyThisCheckoutMayNotOpenTheDatabase,
  REPO_ROOT,
  THE_DEVELOPMENT_CHECKOUT,
  THE_INSTALL,
  THE_SERVER_ENTRY,
  THE_STARTER_WATCH_THREAD_ENTRY,
  THE_THREAD_BUNDLES,
  isTheProgramRun,
  aPageOnThisMachine,
  originsAPageMayBeOn,
  portFrom,
  readSetting,
  settingValue,
  takeTheListeningDescriptor,
  settings,
  bootstrapEnvironment,
  mergedEnvironment,
  startModeFrom,
  theStableCheckoutNamedIn,
  SHUTDOWN_CONNECTION_GRACE_MS,
  SHUTDOWN_LIMIT_MS,
  theVersion,
} from '../config/settings.mjs'
// The three names a page on another origin has to be able to read. Each comes from the one place it
// is declared rather than being typed again here; the cors registration below says why.
import { WORLD_HEADER } from '../config/world-header.mjs'
import { THE_BUILT_PAGE, missingWebBuild } from '../config/the-built-page.mjs'
import { THE_STABLE_TAG_REFUSAL_EXIT_CODE, whyThisCheckoutIsNotAtADatedStableTag } from '../config/stable-tag.mjs'
import { whyAnUpgradeKeepsTheOfficeClosed } from '../config/the-upgrade-mark.mjs'
import { whyADataFolderMoveKeepsTheOfficeClosed } from '../config/the-data-folder-move.mjs'
import { keepTheMarkOfTheDatabase, whyAStartMayNotMakeTheDatabase } from '../config/may-a-start-make-the-database.mjs'
import {
  THE_SERVICE_LOCK_REFUSAL_EXIT_CODE,
  releaseTheServiceLock,
  takeTheServiceLock,
} from '../config/the-service-lock.mjs'
import { writeHowTheServerEnded } from '../config/how-the-server-ended.mjs'
import { readTheProcessAt } from '../config/session-process.mjs'
import { thisSystem } from '../config/systems/the-system.mjs'
import { FRESHNESS_HEADER } from '../config/freshness-header.mjs'
import { CALL_ID_HEADER } from '../config/call-header.mjs'
import { saysStillGoing } from '../config/still-going.mjs'
import {
  A_PAGE_MAY_SEND_ITS_COOKIE,
  HEADERS_A_PAGE_MAY_READ,
  METHODS_A_PAGE_MAY_USE,
  mayAPageOnThisOriginRead,
} from '../config/what-a-page-may-read.mjs'
import type { World } from '@shared/runtime.ts'
import { loadPanelEnv } from './lib/env.ts'
import {
  THE_START_STEPS,
  theMigrationsCheckLine,
  theMigrationsCheckTiming,
  theStartSteps,
} from './lib/start-steps.ts'
import { addressText, rememberWhatThisProcessBound, theAddressThisProcessAnswersOn, theBoundPort } from './lib/bound-address.ts'
import Fastify, {
  LogController,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import { isNull, sql } from 'drizzle-orm'
import { records } from './db/schema.ts'
// A normal import, unlike the group inside buildApp: api/kinds.ts is the one route file that
// deliberately touches nothing but src/shared/, so it cannot open the database early -- and the
// schema stays readable on a server whose database will not open.
import { isLoopback } from './lib/access.ts'
import { discoveryRoutes, noSuchEndpoint, trackApiRoutes, type ApiRoute } from './api/kinds.ts'
import { route } from './lib/route.ts'
import { watchTheLoop } from './lib/loop-watch.ts'
import { STARTER_SHUTDOWN_GRACE_MS } from './lib/starter-watch.mjs'
import { refuseADataFolderInAWorktree } from './lib/git-checkout.ts'
// The word a reader sees for a kind of world, for the line this server logs about itself.
import { worldKindWord } from '@shared/words.ts'
import { THE_SLEEP_CLOCK_SETTING, theIntervalOfTheSleepClock } from '@shared/sleep-clock.ts'

/**
 * The database handle, as a type only.
 *
 * `typeof import(...)` in a type position is erased before this file runs, so naming the module
 * here does not import it and does not open MOLE_OFFICE_DB. The value comes from the `await import`
 * inside buildApp.
 */
type Db = typeof import('./db/client.ts')['db']

// ---------------------------------------------------------------------------- what is served

/**
 * Everything about the process that `buildApp` cannot work out for itself.
 *
 * All four are required. A default for `production` or `webDir` would be a quiet guess about
 * which machine this is, and the caller -- `start()` below, or a test -- already knows.
 */
export interface AppSettings {
  /**
   * Whether this process also serves the built browser app out of `webDir`.
   *
   * In development it does not: Vite serves the app on MOLE_OFFICE_WEB_PORT and proxies /api back
   * here, which is what gives instant reload while editing.
   */
  production: boolean
  /** Where the built browser app is on disk. Read only when `production` is true. */
  webDir: string
  /** Where Vite serves the app in development. It appears in the non-/api 404 and nowhere else. */
  webAppUrl: string
  /** The log level for the request log, or false for no logger at all -- which is what tests want. */
  logLevel: string | false
  /**
   * WHERE THE REQUEST LOG LINES GO, or absent for Fastify's own destination.
   *
   * NOT A SETTING: no environment variable names it and `start()` never passes it. It exists so a
   * test can read the one-line-per-request log rather than reaching into the process's own stdout.
   * When it is absent, Fastify builds its logger exactly as it did before.
   */
  logStream?: { write(msg: string): void }
  /**
   * Whether this process records what each call was, in `api_calls`.
   *
   * DEFAULTS TO ON, INCLUDING IN TESTS. The suite is the only thing that would catch the recorder
   * breaking a request shape nobody thought of -- a 404, a stream reply, a HEAD, an OPTIONS
   * preflight, a malformed body. Turning it off in tests would mean its first real exercise is the
   * owner's own corpus. Each test builds its own scratch database, so nothing accumulates anywhere
   * that matters.
   *
   * IT EXISTS AS A SETTING FOR ONE REASON: a test has to be able to prove that recording changes
   * nothing about what the product answers, and that test needs both sides.
   */
  recordCalls?: boolean
  /**
   * The port the second listener is on, or null because there is no second listener.
   *
   * READ RATHER THAN SET HERE. `buildApp` does not listen on anything, so this is only ever passed
   * along to `GET /api/access`, which answers *is remote access on* — and the honest answer to that
   * is what a listener is actually bound to, not what an environment variable says. `start()` sets
   * it after the bind has been checked, so a configured port that failed to bind is never reported
   * as listening.
   */
  remotePort?: number | null
}

/** What `buildApp` hands back. Nothing has called `listen` on the app. */
export interface BuiltServer {
  app: FastifyInstance
  /**
   * Every /api route this app registered, read from the router rather than from a list.
   *
   * A function and not a snapshot, because plugins register routes long after `buildApp` returns
   * -- and because it is what `GET /api` and the 404 are built from on each request.
   */
  listApiRoutes: () => readonly ApiRoute[]
  /**
   * END EVERY REQUEST HELD OPEN ON PURPOSE, an event stream or a hold, by closing its connection,
   * and say how many. A stop calls it as it stops taking reads: such a request waits for something
   * to happen and is not a read being worked out, so a drain would wait its whole grace for it.
   * Before the drain these were ended after 1 s. The page and the waiter connect again.
   */
  endTheWaits: () => number
}

/**
 * One log line per request: method, path, status, milliseconds, then the three names.
 *
 * Fastify writes two by default -- one when a request arrives, one when it finishes -- which
 * is twice the volume for information the finishing line already carries. `LogController` is
 * the supported way to change those built-in lines; overriding them here rather than adding a
 * separate hook keeps request logging in one place instead of two that could disagree.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE THREE NAMES ARE ON EVERY LINE (acceptance finding 67)
 * ---------------------------------------------------------------------------------------
 *
 * On 24 September 2026 the office stopped answering for 20 to 26 seconds at a time and the log
 * said only `GET /api/resources?includeReleased=true 200 21368.4ms`. Nobody could say whose loop
 * was asking, or in which project, so nobody could stop it. The three names go AFTER the
 * milliseconds so that a reader that already reads the first four fields still finds them.
 */
interface RequestLineNames {
  project: string
  agent: string
  session: string
}

/**
 * HOW LONG A REQUEST MAY TAKE BEFORE IT GETS A LINE OF ITS OWN: three seconds.
 *
 * The reason is acceptance finding 67: on 24 September 2026 a loop asked for /api/resources for
 * 20 to 26 seconds at a time and everything else waited. Three seconds is above every ordinary
 * read and below the stall that was worth a person's attention, so a line at this level is a
 * finding rather than noise.
 */
const SLOW_REQUEST_MS = 3_000

/**
 * WHETHER THIS REQUEST WAS HELD OPEN ON PURPOSE, which is not the same as slow.
 *
 * Two shapes, and both are read off the request itself rather than guessed from how long it took:
 *
 *   - A route whose config says `waits: true` holds every request open. `request.routeOptions`
 *     carries the matched route's config, so the line reads the same declaration the recorder and
 *     GET /api read. `GET /api/events` is the only one of these today.
 *   - The waiting door, `GET /api/handles/:handle/waiting`, holds only the requests that asked it
 *     to. It marks the ones it really held by calling `thisCallIsHeld(req)` in lib/usage.ts. Its
 *     route deliberately says nothing, because its instant answers are ordinary fast calls and must
 *     keep counting as such (criterion U7). While nothing is recording, nothing is marked, so such a
 *     hold would be called slow; the office records calls unless it is told not to.
 *
 * Both are read by one predicate, `thisRequestWasAChosenWait` in lib/usage.ts, handed in by
 * `buildApp`, and the usage row's `waits` reads the same one. A held request is a wait somebody
 * chose, so it must not be reported as a slow one: the whole point of the slow line is to find the
 * loops nobody chose. Acceptance finding 67.
 */

/** One header as the request sent it, or undefined when it is absent or blank. It never refuses. */
function headerSaid(req: FastifyRequest, name: string): string | undefined {
  const raw = req.headers[name]
  const one = Array.isArray(raw) ? raw[0] : raw
  if (typeof one !== 'string') return undefined
  const value = one.trim()
  return value === '' ? undefined : value
}

class OneLinePerRequest extends LogController {
  /**
   * `namesOf` is handed in rather than imported, because the module that can answer it,
   * lib/http.ts, opens the database and so cannot be imported at the top of this file. `buildApp`
   * imports it after the caller has decided which database this is, and passes the one function.
   */
  constructor(
    private readonly namesOf: (req: FastifyRequest) => RequestLineNames,
    private readonly aChosenWait: (req: FastifyRequest) => boolean,
  ) {
    super()
  }

  override incomingRequest(): void {
    // Deliberately silent. The completed line below says everything this one would have.
  }

  override requestCompleted(error: Error | null, request: FastifyRequest, reply: FastifyReply): void {
    const names = this.namesOf(request)
    const line =
      `${request.method} ${privateRequestLogAddress(request.url)} ${reply.statusCode} ${reply.elapsedTime.toFixed(1)}ms` +
      ` project=${names.project} agent=${names.agent} session=${names.session}`
    if (error) request.log.error(isPrivateInTheLog(request.url) ? {} : { err: error }, line)
    else request.log.info(line)
    // AND A SECOND LINE OF ITS OWN WHEN IT TOOK TOO LONG, so a stalling loop is visible at a
    // glance instead of hidden among the fast lines. Acceptance finding 67.
    if (!this.aChosenWait(request) && reply.elapsedTime >= SLOW_REQUEST_MS) {
      request.log.warn(
        `slow request: ${request.method} ${privateRequestLogAddress(request.url)} took ${(reply.elapsedTime / 1000).toFixed(1)} s ` +
          `(project ${names.project}, agent ${names.agent}, session ${names.session})`,
      )
    }
  }
}

/** How many records exist, not counting deleted ones. */
function liveRecordCount(db: Db): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(records)
    .where(isNull(records.deletedAt))
    .get()
  // A count query always returns a row. If it did not, something is wrong with the database
  // and reporting zero records would be a lie that looks like an empty workspace.
  if (!row) throw new Error('the record count query returned nothing; the database is not usable')
  return row.n
}

/**
 * Why there is nothing to serve, or `null` when there is. Written once in
 * src/config/the-built-page.mjs, because the `mole-office` command asks the same question before it
 * starts a server and cannot import this file. Exported from here as well, where its callers found it.
 */
export { missingWebBuild }

// Only timer handles live here. The pending runs and once-only notice markers live in SQLite.
const endedRunResourceTimers = new WeakMap<FastifyInstance, () => void>()
/** What stops each server's minute reading of its own load (lib/office-load.ts). */
const loadReadingTimers = new WeakMap<FastifyInstance, () => void>()
/** What stops each canonical server's minute reading of storage upload receipts (lib/storage/receipts.ts). */
const storageReceiptTimers = new WeakMap<FastifyInstance, () => void>()

/**
 * Build the whole served surface: every route group, the health route, the error handler and the
 * 404. Nothing here listens on a socket.
 *
 * This is the one description of what Mole Office serves. A route group that is not registered here is
 * not part of the product, and a test that asks this function what it built is asking the product
 * rather than asking a list somebody typed.
 *
 * CALL IT ONLY AFTER THE DATABASE IS DECIDED. The `await import` group below opens MOLE_OFFICE_DB, so
 * `.env` must already be loaded (`start()` does that) or the caller must already have set it (a
 * test does that with `freshDb()`). The database must also already be migrated: checking that, and
 * migrating a database that holds nothing, is a startup step and belongs to `start()` — it can
 * write to the file on disk and refuse to come up, and building an app may do neither.
 */
export async function buildApp(appSettings: AppSettings): Promise<BuiltServer> {
  // ----------------------------------------------------- modules that open the database
  //
  // Dynamic, and inside the function rather than at the top of the file, for the reason given in
  // the header: importing any of these reads MOLE_OFFICE_DB and opens that file.
  const { db, databaseFileStatus } = await import('./db/client.ts')
  const { recordCalls, usageCounters, thisRequestWasAChosenWait } = await import('./lib/usage.ts')
  const { installErrorHandling, workspaceFrom, stampArrival, refuseAnUnclassifiedDoor, readWhoSentAClaimToBeThemFirst, sayWhetherPermissionNarrowedIt, resolvedActorOf, resolvedWorkspaceOf, observedIdentity, WORKSPACE_HEADER } =
    await import('./lib/http.ts')

  /**
   * HOW ONE REQUEST NAMES ITS PROJECT, AGENT AND SESSION.
   *
   * What a door resolved comes first; what the request's own headers said comes next; `-` is the
   * last answer and it is a real one — it says nobody recorded a name, not that the request had
   * none. The project, agent and session are the three facts acceptance finding 67 was missing
   * when a loop held the office for 20 to 26 seconds and nobody could say whose it was.
   */
  const namesOf = (req: FastifyRequest): RequestLineNames => {
    if (isPrivateLoginRequest(req.url)) return { project: '-', agent: '-', session: '-' }
    const workspace = resolvedWorkspaceOf(req)
    const actor = resolvedActorOf(req)
    const said = observedIdentity(req)
    return {
      project: workspace?.id ?? headerSaid(req, WORKSPACE_HEADER) ?? '-',
      agent: actor?.id ?? said.actorId ?? '-',
      session: actor?.sessionId ?? said.sessionId ?? '-',
    }
  }

  const app: FastifyInstance =
    appSettings.logLevel === false
      ? Fastify({ logger: false })
      : Fastify({
          logger: {
            level: appSettings.logLevel,
            // A stream only when a test handed one in; otherwise Fastify's own destination, which
            // is what every real server uses.
            ...(appSettings.logStream === undefined ? {} : { stream: appSettings.logStream }),
          },
          logController: new OneLinePerRequest(namesOf, thisRequestWasAChosenWait),
        })

  /**
   * Start remembering which endpoints exist, for GET /api and for the 404 below.
   *
   * This has to be the first thing done to `app`: the hook underneath only sees routes registered
   * after it, and a route registered above this line would exist and be undiscoverable.
   */
  const listApiRoutes = trackApiRoutes(app)
  // A LINE FOR EVERY REQUEST OVER 2 s, with its time inside SQLite and its five slowest statements. First of the request
  // hooks, so every later hook and the handler run inside the request's own count. See lib/slow-requests.ts.
  {
    const { sqlite } = await import('./db/client.ts')
    const { measureTheStatementsOf, sayTheSlowRequests } = await import('./lib/slow-requests.ts')
    measureTheStatementsOf(sqlite)
    sayTheSlowRequests(app, (line) => app.log.warn(line), thisRequestWasAChosenWait)
  }
  // EVERY READ'S TIME, FOR THE OFFICE'S OWN LOAD, read by lib/office-load.ts. A GET
  // only, and not one that waits on purpose, whose time is the wait somebody asked for. Above every route
  // group, so every read is in it.
  {
    const { noteARead } = await import('./lib/office-load.ts')
    app.addHook('onResponse', async (request, reply) => {
      if (request.method === 'GET' && !thisRequestWasAChosenWait(request)) noteARead(reply.elapsedTime)
    })
  }
  const theOpenRequests = new Set<FastifyRequest>()
  const arrivedAt = new WeakMap<FastifyRequest, number>()
  const answerMadeAt = new WeakMap<FastifyRequest, number>()
  // THE REQUESTS THAT CLOSED IN THE LAST TWO MINUTES, oldest first, so the hold line can name one that held the thread
  // and closed before the line's timer ran. See lib/loop-watch.ts.
  const REMEMBERS_CLOSED_FOR_MS = 120_000
  const theRecentlyClosed: { request: FastifyRequest; closedAt: number }[] = []
  app.addHook('onRequest', async (request, reply) => {
    theOpenRequests.add(request)
    arrivedAt.set(request, performance.now())
    reply.raw.once('close', () => {
      theOpenRequests.delete(request)
      const closedAt = performance.now()
      theRecentlyClosed.push({ request, closedAt })
      while (theRecentlyClosed.length > 0 && theRecentlyClosed[0]!.closedAt < closedAt - REMEMBERS_CLOSED_FOR_MS) theRecentlyClosed.shift()
    })
  })
  app.addHook('onSend', async (request) => {
    if (!answerMadeAt.has(request)) answerMadeAt.set(request, performance.now())
  })
  const asOpenAtTheHold = (request: FastifyRequest, closedAt: number | null) => ({
    method: request.method,
    url: privateRequestLogAddress(request.url),
    route: request.routeOptions.url ?? null,
    project: namesOf(request).project,
    startedAt: arrivedAt.get(request) ?? 0,
    answerMadeAt: answerMadeAt.get(request) ?? null,
    closedAt,
    stream: thisRequestWasAChosenWait(request),
  })
  // A LINE WHEN THE THREAD WAS HELD OVER HALF A SECOND, naming what was open across it and the timers that ran in it, and
  // counting the streams held open apart. See lib/loop-watch.ts.
  const theLoopWatch = watchTheLoop({
    every: 250,
    heldOver: 500,
    open: () => [
      ...[...theOpenRequests].map((request) => asOpenAtTheHold(request, null)),
      ...theRecentlyClosed.map(({ request, closedAt }) => asOpenAtTheHold(request, closedAt)),
    ],
    log: (line) => app.log.warn(line),
    remembersClosedFor: REMEMBERS_CLOSED_FOR_MS,
  })
  // A PAGE LOAD AT ANOTHER OF THIS MACHINE'S OWN ADDRESSES IS SENT TO THE ONE ADDRESS FOR BROWSERS, so one pairing
  // covers the office. Before every other check, so a browser is sent on before anything is refused or served. Only a
  // page load: /api, loopback and an address that is not this machine's stay where they arrived.
  const { sendPageLoadsToTheAddressForBrowsers } = await import('./lib/address-for-browsers.ts')
  sendPageLoadsToTheAddressForBrowsers(app)
  const endTheWaits = (): number => {
    const waits = [...theOpenRequests].filter(thisRequestWasAChosenWait)
    for (const one of waits) one.raw.socket.destroy()
    return waits.length
  }

  const { howOldThisServersCodeIs, sayWhichWorldAnswered, theWorldThisProcessIsIn } = await import('./lib/world.ts')
  // The health rule lives apart from the world because it opens nothing, which is what lets a test
  // import it. Its own header says so.
  const { whatIsWrongWithThisServer } = await import('./lib/health.ts')
  // What the supervisor of this checkout and this port says about its own failed starts. It is read
  // out of the runtime module because the runtime record says the same thing in the same words, and
  // one fact worked out in two places is the defect CLAUDE.md names at the top of the file.
  const { theFailedStartsOfThisCheckoutsSupervisor } = await import('./lib/runtime.ts')
  const { refuseActsKeptOnThisMachine } = await import('./lib/reach.ts')
  const { refuseActsARoleMayNotPerform } = await import('./lib/rolegate.ts')
  const { takeTheReasonForThePersonOffEveryRequest, writeDownEveryPressUnderTheGrant } = await import('./lib/for-the-person.ts')
  const { refuseAgentsKeysUnderAnotherName } = await import('./lib/keyheader.ts')
  const { letARunKeyActForTheRunsItStarted } = await import('./lib/acting-for.ts')
  // ----------------------------------------------------- the role cards, read once, before serving
  //
  // WHAT AN AGENT OF EACH ROLE MAY DO IS A FILE, `design/permissions/roles.json`, and this is where
  // it is read. It is read here rather than lazily on the first request for one reason: two requests
  // one second apart must not be answered under two different sets of rules with nothing saying
  // which. A file with a part missing, an act nothing publishes, or a chapter that does not exist
  // throws out of here, and the server does not start — serving anyway would mean serving a product
  // whose refusals are whatever survived the parse, and no screen would look wrong.
  //
  // THE ACT VOCABULARY IS HANDED IN because half of it is `GOVERNANCE_GUARDS`, which lives on the
  // record write path. lib/roles.ts importing that would make a loop the first time anything on that
  // path wanted to know a role, so the shared startup reader joins them (wave 13y round 38).
  //
  // BOTH KEYS OF EVERY ENTRY, because the registry names two different things: `actKey` is the act
  // ALSO refused from another machine, and `personAct` is the declared key of the person's own act.
  // Three of the person's acts carry no `actKey` at all, and one of them is not in a guard's body.
  const { readTheRoleCardsAtStart } = await import('./lib/role-cards-at-start.ts')
  const { gateMet } = await import('./lib/gate-counts.ts')
  try { readTheRoleCardsAtStart() } catch (refusal) {
    try { gateMet('the-role-cards-file-is-usable', 'block') }
    catch (notCounted) { console.error(`The refusal below was not counted on the gate the-role-cards-file-is-usable: ${notCounted instanceof Error ? notCounted.message : String(notCounted)}`) }
    throw refusal
  }
  // THE CARDS ADDED ON THE ROLES PAGE ARE READ NOW, before anything asks for the cards. `fileTheCardWordsOnce`
  // runs after this function returns and files a words record for each card `theRoleCards` holds. Read later,
  // an added card would get no record, and its words would stay in its row.
  const { loadAddedRoles } = await import('./lib/added-roles.ts')
  loadAddedRoles()
  const { requireWorkspace } = await import('./lib/workspaces.ts')
  const { workspaceRoutes } = await import('./api/workspaces.ts')
  const { recordRoutes } = await import('./api/records.ts')
  // DYNAMIC LIKE THE REST, and it was the one that was not: until 1 October 2026 this was a static
  // import at the top of the file, and `api/access.ts` reaches `lib/records.ts`, which opens the
  // database. So importing this file opened MOLE_OFFICE_DB, against the promise in the header, and
  // `start()` could not take the service lock before the database was opened.
  const { accessRoutes } = await import('./api/access.ts')
  const { linkRoutes } = await import('./api/links.ts')
  const { queryRoutes } = await import('./api/queries.ts')
  const { searchRoutes } = await import('./api/search.ts')
  const { planningRoutes } = await import('./api/planning.ts')
  const { planRoutes } = await import('./api/plans.ts')
  const { needsYouRoutes } = await import('./api/needs-you.ts')
  const { workRoutes } = await import('./api/work.ts')
  // THE FLOW REGISTER'S READ DOOR. It is registered with the record doors, and its note feeds GET
  // /api like every other door's.
  const { flowRoutes } = await import('./api/flows.ts')
  // THE COUNTERS' OWN DOORS. A counter is written only through them (criteria CT1 and CT6), so they
  // are the whole of what can file one, add to one, change one, or pause and resume one.
  const { counterRoutes } = await import('./api/counters.ts')
  // THE HOST JOB DOOR: a running run asks for a registered host tool, and the runner on the host answers. Only these
  // doors write a host job, and only a secretary's registers a tool.
  const { hostJobRoutes } = await import('./api/host-jobs.ts')
  // THE CHECKLISTS' OWN DOORS. A checklist is written only through them, so that its owner is the
  // caller and only its owner switches an item's reminder, by a decision.
  const { checklistRoutes } = await import('./api/checklists.ts')
  const { planningFlowRoutes } = await import('./api/planning-flow.ts')
  const { enteredFlowRoutes } = await import('./api/entered-flows.ts')
  // THE BOOKINGS' OWN DOORS, and the GPU's two. A booking is written only through them, because the office
  // places it in the line, by a decision.
  const { bookingRoutes } = await import('./api/bookings.ts')
  // THE DRAFTS' OWN DOORS: the list and the send. A draft is written like any record; these are the
  // two acts that are not a record write, by a decision.
  const { draftRoutes } = await import('./api/drafts.ts')
  // THE ANSWER DOOR'S TWO ROUTES: the person keeps an answer to a question in a report, and sends what is
  // unsent, by two decisions. Registered beside the record
  // routes, whose paths they extend.
  const { answerRoutes } = await import('./api/answers.ts')
  const { criticismRoutes } = await import('./api/criticisms.ts')
  // THE CONVERSATION SYNC'S DOORS (wave 13s round 242): the per-workspace opt-in and path map, the sync, and the
  // restore of one copy on another machine.
  const { conversationRoutes } = await import('./api/conversations.ts')
  // A SECRETARY'S OWN BROADCAST SETTINGS: on or off, the reminder's lead and its words, read back with the times.
  const { broadcastSettingsRoutes } = await import('./api/broadcast-settings.ts')
  const { thePersonsLookRoutes } = await import('./api/the-persons-look.ts')
  // THE TOOLSET CATALOGUE'S DOORS: the list, one manual page, and a use written on the calling run.
  const { toolsetRoutes } = await import('./api/toolset.ts')
  const { forkRoutes } = await import('./api/forks.ts')
  const { waitingRoutes } = await import('./api/waiting.ts')
  const { restrictionRoutes } = await import('./api/restrictions.ts')
  const { planGraphRoutes } = await import('./api/plan-graph.ts')
  const { presentationRoutes } = await import('./api/presentation.ts')
  const { sessionRoutes } = await import('./api/sessions.ts')
  const { lifecycleRoutes } = await import('./api/lifecycle.ts')
  const { wakeRoutes } = await import('./api/wake.ts')
  const { agentMoveRoutes } = await import('./api/agent-move.ts')
  const { resourceRoutes } = await import('./api/resources.ts')
  const { slotRoutes } = await import('./api/slots.ts')
  const { runtimeRoutes } = await import('./api/runtime.ts')
  const { sourceRoutes } = await import('./api/source.ts')
  const { implementationRoutes } = await import('./api/implementation.ts')
  const { workDomainRoutes } = await import('./api/workdomain.ts')
  const { workingRoutes } = await import('./api/working.ts')
  const { fileRoutes } = await import('./api/files.ts')
  // A ZIP BROUGHT BACK FROM OUTSIDE, written to a file beside the pictures and pointed at by a later
  // record. Criterion F16, point 5. The rules are in lib/returnedfiles.ts; this is the route group.
  const { returnedFilesRoutes } = await import('./api/returnedfiles.ts')
  // A FILE A REPORT CARRIES AS A FILE, stored beside the database and served back by the preview
  // door above. Criterion R3. The rules are in lib/reportfiles.ts; this is the route group.
  const { reportFilesRoutes } = await import('./api/reportfiles.ts')
  const { storageRoutes } = await import('./api/storage.ts')
  // PERMANENT RESIDENTS AND THE PERSONAL SPACE EACH HAS, a folder beside the database reached only through these
  // doors. The rules are in lib/residents.ts; this is the route group.
  const { residentsRoutes } = await import('./api/residents.ts')
  const { previewRootRoutes } = await import('./api/preview-roots.ts')
  const { exportRoutes } = await import('./api/export.ts')
  const { importRoutes } = await import('./api/import.ts')
  const { agentRoutes } = await import('./api/agents.ts')
  const { recipientRoutes } = await import('./api/recipients.ts')
  const { reviewRoutes } = await import('./api/reviews.ts')
  const { annotationRoutes } = await import('./api/annotations.ts')
  const { participantRoutes } = await import('./api/participants.ts')
  const { pixelOfficeRoutes } = await import('./api/pixel-office.ts')
  const { roleRoutes } = await import('./api/roles.ts')
  const { officeRegulationRoutes } = await import('./api/office-regulations.ts')
  const { messageRoutes } = await import('./api/messages.ts')
  const { groupRoutes } = await import('./api/groups.ts')
  const { inspectionRoutes } = await import('./api/inspection.ts')
  const { mergeQueueRoutes } = await import('./api/merge-queue.ts')
  const { honourBoardRoutes } = await import('./api/honour-board.ts')
  const { claimRoutes } = await import('./api/claims.ts')
  const { handleRoutes } = await import('./api/handles.ts')
  const { workerRoutes } = await import('./api/worker.ts')
  const { shutdownRoutes } = await import('./api/shutdown.ts')
  const { interruptedRoutes } = await import('./api/interrupted.ts')
  const { nextRoundRoutes } = await import('./api/next-round.ts')
  const { workerRunRoutes } = await import('./api/worker-runs.ts')
  const { thePersonsOwnWordsRoutes } = await import('./api/the-persons-own-words.ts')
  const { terminalRoutes } = await import('./api/terminals.ts')
  const { terminalHarnessRoutes } = await import('./api/terminal-harnesses.ts')
  const { startAtLoginRoutes } = await import('./api/start-at-login.ts')
  const { dataFolderRoutes } = await import('./api/data-folder.ts')
  const { sandboxMemoryCapRoutes } = await import('./api/sandbox-memory-cap.ts')
  const { terminalAgentRoutes } = await import('./api/terminal-agents.ts')
  const { deadLetterRoutes } = await import('./api/dead-letters.ts')
  const { eventRoutes } = await import('./api/events.ts')
  const { zoomRoutes } = await import('./api/zoom.ts')
  const { compositionRoutes } = await import('./api/composition.ts')
  const { bundleRoutes } = await import('./api/bundle.ts')
  const { delegationRoutes } = await import('./api/delegation.ts')
  const { packageWorkerRoutes } = await import('./api/package-workers.ts')
  const { usageRoutes } = await import('./api/usage.ts')
  const { bootstrapRoutes } = await import('./api/bootstrap.ts')
  const { briefRoutes } = await import('./api/brief.ts')
  const { whereYouStandRoutes } = await import('./api/where-you-stand.ts')
  const { handoverRoutes } = await import('./api/handovers.ts')
  const { governsRoutes } = await import('./api/governs.ts')
  const { onboardingRoutes } = await import('./api/onboarding.ts')
  const { notebookRoutes } = await import('./api/notebook.ts')
  const { incidentRoutes } = await import('./api/incidents.ts')
  const { folderReadingRoutes } = await import('./api/folderreading.ts')
  const { officeRoutes } = await import('./api/office.ts')
  const { stableUpgradeNoticeRoutes } = await import('./api/stable-upgrade-notices.ts')
  const { visitorRoutes } = await import('./api/visitors.ts')
  const { whatIsKeptRoutes } = await import('./api/what-is-kept.ts')
  const { onePressRoutes } = await import('./api/one-press.ts')
  const { readinessRoutes } = await import('./api/readiness.ts')
  const { signingPackageRoutes } = await import('./api/signing-packages.ts')
  const { priceTableRoutes } = await import('./api/price-table.ts')
  const { quickInputRoutes } = await import('./api/quick-inputs.ts')
  const { whatTheGrantCarriesRoutes } = await import('./api/what-the-grant-carries.ts')
  const { wordsWaitingRoutes } = await import('./api/words-waiting.ts')
  const { sidebarRoutes } = await import('./api/sidebar.ts')
  const { homeLayoutRoutes } = await import('./api/home-layout.ts')
  const { sidebarPinsRoutes } = await import('./api/sidebar-pins.ts')
  const { wordSettingsRoutes } = await import('./api/word-settings.ts')
  const { addedRolesRoutes } = await import('./api/added-roles.ts')
  const { goalSpanRoutes } = await import('./api/goal-spans.ts')
  const { injectSettingRoutes } = await import('./api/inject-setting.ts')
  const { machineNamesRoutes } = await import('./api/machine-names.ts')
  const { addressForBrowsersRoutes } = await import('./api/address-for-browsers.ts')
  const { deadLetterSecretaryRoutes } = await import('./api/dead-letter-secretary.ts')
  const { deadLetterThresholdsRoutes } = await import('./api/dead-letter-thresholds.ts')
  const { runtimeSettingsRoutes } = await import('./api/runtime-settings.ts')
  const { providerKeySetupRoutes } = await import('./api/provider-key-setup.ts')
  const { noticeRulesRoutes } = await import('./api/notice-rules.ts')
  const { officeRestartRoutes } = await import('./api/office-restart.ts')
  const { mergeQueueOwnerRoutes } = await import('./api/merge-queue-owner.ts')
  const { moduleReminderSecretaryRoutes } = await import('./api/module-reminder-secretaries.ts')
  const { gpuWatcherRoutes } = await import('./api/gpu-watcher.ts')
  const { relatedTestsFirstRoutes } = await import('./api/related-tests-first.ts')
  const { checksInMergesOnlyRoutes } = await import('./api/checks-in-merges-only.ts')
  const { officeLoadRoutes } = await import('./api/office-load.ts')
  const { pluginsRoutes } = await import('./api/plugins.ts')
  const { pluginReadRoutes } = await import('./api/plugin-read.ts')
  const { officeOwnerRoutes } = await import('./api/office-owner.ts')
  const { settingChangesRoutes } = await import('./api/setting-changes.ts')
  const { workSwitchesRoutes } = await import('./api/work-switches.ts')
  const { officeKeyRoutes } = await import('./api/office-keys.ts')
  const { summonsRoutes } = await import('./api/summons.ts')
  const { pushRoutes } = await import('./api/push.ts')
  const { runModelRoutes } = await import('./api/run-models.ts')
  const { castingRoutes } = await import('./api/casting.ts')
  const { entryRoutes } = await import('./api/entry.ts')
  const { sandboxLoginRoutes } = await import('./api/sandbox-logins.ts')
  const { secretaryDutiesRoutes } = await import('./api/secretary-duties.ts')
  const { backlogRoutes } = await import('./api/backlog.ts')
  const { doneRoutes } = await import('./api/done.ts')
  const { providerRouterRoutes } = await import('./api/provider-router.ts')
  const { agentRenameRoutes } = await import('./api/agent-renames.ts')
  const { providerTableRoutes } = await import('./api/the-provider-table.ts')
  const { usageNoticeSecretaryRoutes } = await import('./api/usage-notice-secretary.ts')
  const { usageDecisionRoutes } = await import('./api/usage-decision.ts')
  const { gettingStartedRoutes } = await import('./api/getting-started.ts')
  const { projectRulesRoutes } = await import('./api/project-rules.ts')
  const { backupRoutes } = await import('./api/backups.ts')
  const { projectGraphRoutes } = await import('./api/project-graph.ts')
  const { projectBoardRoutes } = await import('./api/project-board.ts')
  const { checkVisitorCredentials } = await import('./lib/visitorgate.ts')
  const { checkWhereTheCallerIsFrom } = await import('./lib/visits.ts')

  await app.register(cors, {
    /**
     * ONLY THE ORIGINS THIS INSTALLATION DECLARES, AND IT USED TO BE ALL OF THEM.
     *
     * It was `origin: true`, which reflects whatever origin asks, and the comment defending it said
     * the server only listens on loopback so the only pages that can reach it are already on this
     * machine. That is no longer true: `MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES` opens a door on an
     * address other machines reach, and reflecting every origin there would let any page anybody
     * opened, anywhere, read this research diary through a browser that can reach that address.
     *
     * `originsAPageMayBeOn` in src/config/settings.mjs is the list and says how it is built. It is
     * READ per request rather than captured when the app is built, so it is this process's settings
     * and not a copy taken earlier.
     *
     * A REQUEST WITH NO `Origin` HEADER IS ALLOWED, and that is not a hole: it is curl, a tool, an
     * agent and every server-to-server caller. CORS is a rule browsers apply to pages. A caller that
     * is not a page is not restrained by it either way, so refusing here would inconvenience the
     * honest callers and stop nobody.
     */
    /**
     * AND ANY PAGE SERVED BY SOMETHING ON THIS MACHINE, since 4 September 2026.
     *
     * Criterion C7 lets a person enter another world, and the page then sends its requests to that
     * world's port — a different origin, which the visited world has no way of having on a list. The
     * whole argument, including why this widens nothing that matters, is on `aPageOnThisMachine` in
     * src/config/settings.mjs: anything on this machine can already reach this API with curl, and
     * the door another machine comes through still admits exactly the two declared addresses.
     */
    origin: (origin, decide) => {
      // THE SAME QUESTION THE EVENT STREAM ASKS. A hijacked reply gets no hook and writes its own
      // headers, so the decision lives in one function both call — problem `PjlpSf-hizZA`, where
      // this callback allowed a page anywhere on this machine and the stream allowed only the
      // declared origins, and a visiting page lost its live channel with nothing saying why.
      decide(null, mayAPageOnThisOriginRead(origin, originsAPageMayBeOn(settings())))
    },
    methods: [...METHODS_A_PAGE_MAY_USE],
    /**
     * A PAGE ON ANOTHER ORIGIN MAY SEND THE PAIRING COOKIE. Criterion P83, point 2.
     *
     * The rule and the reason for it are `A_PAGE_MAY_SEND_ITS_COOKIE` in
     * src/config/what-a-page-may-read.mjs. The event stream reads the same rule, because its reply
     * gets no hook and writes its own headers. When the rule is true this option writes
     * `access-control-allow-credentials: true`, and the origin callback above answers with the one
     * origin it read rather than `*`, which is the pair the browser demands.
     */
    credentials: A_PAGE_MAY_SEND_ITS_COOKIE,
    /**
     * THE HEADERS A PAGE ON ANOTHER ORIGIN HAS TO BE ABLE TO READ. Problem `a36N9Ivqf46H`.
     *
     * A browser hides every response header from a page's own JavaScript except a handful it deems
     * safe, unless the reply names the others here. Nothing did, so a page on another origin read no
     * world header at all — and `theWorldThatAnswered` never learns a first world from replies that
     * do not carry one, so the check criterion G3 exists for was not drawing a false banner: it was
     * silently never running. That is the worse of the two, because an absent check looks exactly
     * like a passing one.
     *
     * THE NAMES ARE IMPORTED, NEVER TYPED HERE, and the list itself is one module:
     * `src/config/what-a-page-may-read.mjs`. Two places send these headers — this registration, and
     * the event stream, which hijacks its reply and so gets no hook at all — and a list in each
     * would be one fact worked out twice. `tests/a-page-on-another-origin.test.ts` reads the browser
     * app's own source and fails when it starts reading a header the list omits.
     */
    exposedHeaders: [...HEADERS_A_PAGE_MAY_READ],
  })

  /**
   * How a JSON body is read, replacing Fastify's built-in parser for one reason: AN EMPTY BODY IS
   * NOT AN ERROR.
   *
   * TEN endpoints take no body at all -- the two exports, the import, three presentation DELETEs,
   * `DELETE /api/links/:id`, `DELETE /api/records/:id`, `POST /api/records/:id/restore` and
   * `DELETE /api/records/:id/blocks/:blockId` -- and `GET /api` describes each of them as taking
   * none. This list said FIVE and named the wrong ones: measured 2026-08-12, `reindex` and
   * `discover` DO parse bodies, there are three presentation DELETEs rather than two, and the
   * import and exports were missing from a list they belong at the top of. Nothing checked it, so
   * it drifted, which is why the pin in tests/server-wiring.test.ts is now derived from what
   * `GET /api` publishes rather than typed. Fastify's default parser answers a
   * request with `content-type: application/json` and nothing after it with
   * "Body cannot be empty when content-type is set to 'application/json'", which is a 400 naming
   * neither Mole Office nor the endpoint nor what to do.
   *
   * That is not a hypothetical caller. A `fetch` wrapper that sets one headers object for every
   * request sends exactly this, and so does `curl -H 'content-type: application/json' -X DELETE`.
   * Mole Office's own `tools/review.mjs` sends it, and the contact sheet recorded
   * "The arrangement could NOT be removed again (400)" on 2026-08-10 -- the product refusing a
   * correct request from its own review tool, because of a header that described a body there was
   * nothing to describe.
   *
   * MALFORMED JSON IS STILL A 400, and that is the half this must not lose. An empty body means
   * "there is no body"; `{"intent":` means "there is a body and it is broken", and those are
   * different answers. `tests/server-wiring.test.ts` pins both: the first over every no-body
   * endpoint, and the second in "still refuses a body that IS there and is broken".
   *
   * THAT ONE TEST IS THE ONLY PIN ON THE SECOND HALF, so treat it as load-bearing. This comment
   * used to name `tests/layout.test.ts` and `tests/presentation-api.test.ts` as two more pins. It
   * was wrong about both. Each of those builds a bare Fastify app and registers one route group,
   * so neither ever installed the parser above -- they were pinning Fastify's own default parser
   * under the same words. Measured on 2026-08-10 by deleting the `statusCode: 400` line: only
   * `tests/server-wiring.test.ts` went red, with "expected 500 to be 400".
   *
   * Registered before the route groups, because a content type parser only applies to routes
   * added after it.
   */
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    // Whitespace only counts as empty: a browser or a proxy that appends a newline has still sent
    // nothing, and telling that caller its JSON is malformed would send it looking for a typo.
    if (typeof body !== 'string' || body.trim() === '') {
      done(null, undefined)
      return
    }
    try {
      done(null, JSON.parse(body) as unknown)
    } catch (err) {
      // 400 and not 500: the request is wrong, not the server. `installErrorHandling` reads
      // `statusCode`, and so does Fastify's own reply path if this ever runs without it.
      const failure = err instanceof Error ? err : new Error(String(err))
      Object.assign(failure, { statusCode: 400 })
      done(failure, undefined)
    }
  })

  installErrorHandling(app)

  /**
   * MAKE THE TWO KEYS IF THIS IS THE FIRST RUN, BESIDE THE DATABASE. Criterion P83, point 1.
   *
   * The person's key and the office's own key are 32 random bytes each, made once and kept in one
   * file in the directory the database is in. `ensureKeysExist` is idempotent, so a start on a
   * database that already has them reads them and changes nothing. It is here rather than in a
   * handler so that a fresh office has its keys before it answers anything, which is what a caller
   * pairing a browser or holding the app's key is about to ask for.
   *
   * THE VALUE IS NEVER PRINTED. `ensureKeysExist` returns nothing and this line says nothing about
   * what it found.
   */
  const { ensureKeysExist } = await import('./lib/keys.ts')
  ensureKeysExist()
  // AND THE OFFICE'S PUSH SIGNING KEY, made the same way and for the same reason, so that reading it is
  // never writing it, as two decisions say.
  // See src/server/lib/push.ts.
  const { ensureThePushKeyExists } = await import('./lib/push.ts')
  ensureThePushKeyExists()

  /**
   * WHICH DOOR A REQUEST CAME THROUGH, written on the raw request before Fastify routes it.
   *
   * ---------------------------------------------------------------------------------------
   * WHY A LISTENER AND NOT A HEADER
   * ---------------------------------------------------------------------------------------
   *
   * Everything else a request says about itself is something the request said. A caller sending
   * `x-mole-office-actor-type: human` is refused by nothing, and that is right for attribution — the
   * actor answers "did I write this, or did an agent?". It is wrong for any question about what an
   * act is allowed to be asked from, because the answer would be whatever the caller typed.
   *
   * Which socket accepted the connection is not something the caller can say. So that is what is
   * recorded, here, by the code that owns the socket.
   *
   * `prependListener` puts this in front of Fastify's own request handler, so the stamp is on the
   * raw request before any routing, any hook or any handler runs. It is registered on `app.server`,
   * which is the listener Fastify built and the one `app.listen` binds — processes on this machine.
   *
   * `app.inject()` NEVER REACHES THIS, and that is a fact rather than an accident: an injected
   * request is not carried by this server, so no listener sees it and no stamp is written. That is
   * what makes an in-process caller distinguishable from a request that came through an
   * unclassified door, and it is why `arrivalOf` has no default.
   */
  app.server.prependListener('request', (raw) => {
    // The caller, not a proxy: this door is on 127.0.0.1, so the process at the other end of the
    // socket is the one that made the request.
    stampArrival(raw, 'this machine', 'the caller')
  })

  /**
   * Refuse a request that arrived on a network connection no listener of ours classified.
   *
   * ---------------------------------------------------------------------------------------
   * WHY IT IS HERE AND NOT ONE LINE LOWER
   * ---------------------------------------------------------------------------------------
   *
   * Between `installErrorHandling` and the first route group, so every route registered below
   * inherits it. A hook registered after a route group does not run for that group's routes, which
   * is the same rule `trackApiRoutes` above is placed for, and it fails the same silent way: the
   * routes registered before it would keep answering with nobody having asked the question.
   *
   * IT CANNOT FIRE TODAY. There is one listener and the lines above stamp it, and an in-process
   * caller has no socket for a listener to have missed. It exists so that the day a second listener
   * is added, a request through it is refused until that listener says which side it is on, rather
   * than being silently given whatever authority a local caller has. That is the direction this has
   * to fail in: an unstamped door is a broken assumption, not a permission question, and Mole Office
   * answers it 500 with a sentence saying the fault is Mole Office's.
   *
   * WHAT THIS DOES NOT DO. It does not decide what any caller may do. Nothing here reads the route,
   * the actor or what is being asked for. It establishes which machine asked, and nothing else.
   */
  app.addHook('onRequest', async (req) => {
    refuseAnUnclassifiedDoor(req)
  })

  /**
   * AND REFUSE AN ACT KEPT ON THIS MACHINE WHEN IT WAS ASKED FROM ANOTHER ONE.
   *
   * Immediately below the line above, because the two are one rule read in one order: first
   * establish which door the request came through, then decide whether this act may be asked
   * through that door. lib/reach.ts writes the four clauses out and says which one lives where.
   *
   * ABOVE EVERY ROUTE GROUP, for the third time in this function and for the same reason: a hook
   * registered after a route group does not run for that group's routes, and the failure is silent.
   * Here the silence would be a `local` route answering a caller from another machine.
   *
   * IT REFUSES NOTHING TODAY UNLESS THE SECOND LISTENER IS RUNNING. Every request through the
   * listener `app.listen` binds is stamped `this machine` and leaves this hook at its second
   * clause. That is not a reason to install it later: the day the second listener comes up is the
   * day every `local` route needs this, and a hook added on that day would be a hook nobody had
   * ever seen refuse anything.
   */
  refuseActsKeptOnThisMachine(app)

  /**
   * AND READ WHO SENT A CLAIM TO BE THE PERSON, BEFORE ANYTHING ASKS IT, at every door that may ask, wherever the key
   * window would count the request. Inside the installed Windows app the answer runs PowerShell, and this reads it
   * without holding the server's thread, and waits for it only so long. The handler's own question then finds the
   * answer kept on the socket. lib/http.ts says when a request is read. A door that never asks, health among them, and
   * a request the window would not count read nothing.
   *
   * It sits below the machine half, so a request refused for coming from another machine reads nothing. It sits above
   * every hook that could ask first.
   */
  app.addHook('onRequest', async (req) => {
    await readWhoSentAClaimToBeThemFirst(req)
  })

  /**
   * AND REFUSE AN AGENT'S KEY SENT UNDER ANOTHER NAME. Criterion P83 point 5 was closed by the
   * owner's decision. The refusal names both agents. lib/keyheader.ts
   * says what it refuses and what it leaves to the paths that already answer.
   *
   * Above every route group, for the same reason as the hooks around it: a hook registered after a
   * route group does not run for that group's routes, and the failure is silent. Here the silence
   * would be a door that still accepts one agent's key under another agent's name.
   *
   * Below the machine half and above the role gate, on purpose. Which machine asked is true whoever
   * asked. Who is asking has to be settled before the role gate reads that caller's role, or a
   * caller refused for its role would be told about a role that is not its own.
   *
   * THE ONE EXCEPTION IS HANDED IN FIRST: a supervisor's run key acting for a run its holder started,
   * while both runs run, as item 7 of a decision says. lib/keys.ts reads
   * every key but cannot import that rule without a loop, so lib/acting-for.ts hands it in here,
   * before any request is read. Until then no key acts for anything, and every key under another name
   * is refused.
   */
  letARunKeyActForTheRunsItStarted()
  refuseAgentsKeysUnderAnotherName(app)

  /**
   * AND REFUSE AN ACT THIS CALLER'S ROLE MAY NOT PERFORM. Criterion P3.
   *
   * Above every route group, for the fourth time in this function and for the same reason: a hook
   * registered after a route group does not run for that group's routes, and the failure is silent.
   * Here the silence would be a worker doing a supervisor's work with nobody having asked.
   *
   * It is below the machine half on purpose. Being on another machine is a fact about where the
   * request came from and is true whoever asked; a role is a fact about who asked. A caller told the
   * wrong one of the two would go and fix the wrong thing.
   */
  refuseActsARoleMayNotPerform(app)

  /**
   * AND TAKE OFF THE REASON A SECRETARY GIVES FOR PRESSING A DOOR FOR THE PERSON, before any door reads its body. The
   * flow design, section 7: each press under the person's grant gives its reason.
   * lib/for-the-person.ts says where the reason travels and what it refuses.
   *
   * Above every route group, for the reason every hook here is: a hook registered after a route group does not run
   * for that group's routes. Here the silence would be a door refusing the field in its own words, or storing it.
   */
  takeTheReasonForThePersonOffEveryRequest(app)

  /**
   * AND WRITE DOWN EVERY PRESS UNDER THE PERSON'S GRANT THAT NO CHANGE ROW WROTE DOWN, before a 2xx reply is sent.
   * lib/for-the-person.ts says why it is before the reply and what a crash between the act and the row leaves.
   */
  writeDownEveryPressUnderTheGrant(app)

  /**
   * AND CHECK THE CREDENTIAL A VISITING AGENT CARRIES. Criteria P25, P27 and P29.
   *
   * Above every route group, for the fifth time in this function and for the same reason: a hook
   * registered after a route group does not run for that group's routes, and the failure is silent.
   * Here the silence would be a pending visitor being answered, which is the one thing criterion P25
   * says must never happen.
   *
   * It is below the two above on purpose, and the order is what a refused caller is told to fix
   * first. Being on another machine and holding a role are facts about the request and the caller;
   * a credential is a thing the caller CARRIES, and a visitor told its token is not confirmed when
   * the act was never allowed from anywhere would go and wake somebody up for nothing.
   *
   * IT REFUSES NOBODY WHO SENDS NO CREDENTIAL. Every caller this product has today sends none and
   * leaves this hook at its first clause.
   */
  checkVisitorCredentials(app)

  /**
   * AND SAY, ON EVERY ANSWER, WHETHER PERMISSION TOOK ANYTHING OFF IT.
   *
   * Above every route group, for the third time in this function and for the same reason: a hook
   * registered after a route group does not run for that group's routes, and the failure is silent.
   * Here the silence would be a handful of routes that quietly stopped saying, which is exactly the
   * state this field exists to make impossible.
   *
   * lib/http.ts says why a field that is always null today is worth a hook at all.
   */
  sayWhetherPermissionNarrowedIt(app)

  /**
   * START RECORDING WHAT EACH CALL WAS.
   *
   * HERE, above every route group, for the same reason `trackApiRoutes` is at the top of this
   * function: a hook registered after a route group does not run for that group's routes, and the
   * failure is silent -- those routes go on being answered with nobody counting them.
   *
   * It is below `refuseAnUnclassifiedDoor` on purpose. A request through a door nobody classified
   * is refused, and its refusal is recorded, which is the evidence somebody would want.
   */
  // A READ THAT ANSWERS WHAT THE CALLER HOLDS IS ANSWERED 304: above `recordCalls`, which then records no bytes sent.
  ;(await import('./lib/version-tags.ts')).answerAnUnchangedReadWith304(app)

  if (appSettings.recordCalls !== false) recordCalls(app)

  /**
   * RECORD WHEN EACH AGENT KEY WAS LAST USED, after the reply has been sent. Finding 83, mend
   * b2: the page of a new-key ask shows it. Not switched off with `recordCalls`, because the page's
   * words depend on it, and it writes one column of `held_keys` at most once a minute per key.
   * src/server/lib/keys.ts says why it is this column and not a read of `api_calls`.
   */
  {
    const { beginRecordingKeyUse, recordTheUseOfTheKeyOn } = await import('./lib/keys.ts')
    beginRecordingKeyUse()
    app.addHook('onResponse', async (req) => {
      recordTheUseOfTheKeyOn(req)
    })
  }

  /**
   * SAY WHICH WORLD ANSWERED, on every reply.
   *
   * Criterion G3 of design/ground/ACCEPTANCE.md. One header, `x-mole-office-world`, carrying the
   * database, the checkout, the port, the commit and whether this stack is canonical or scratch.
   * The owner's problem 21 asks diagnostics to tell *a successful request* from *a successful
   * request to the wrong Mole Office world*, and a reply that does not say where it came from
   * cannot be told from any other.
   *
   * HERE, above every route group, for the same reason `recordCalls` is: an `onSend` hook does not
   * run for routes registered before it, and the failure is silent — those replies would simply not
   * say which world they came from, and the browser app reads that silence as a reply from
   * somewhere else and draws its banner over a page that is perfectly fine.
   */
  sayWhichWorldAnswered(app)

  /**
   * SAY WHEN A WRITE BY AN AGENT NAMES NO RUN (problem J1oPHDg-jWeY), on the answer to that write.
   * Here, above every route group, for the reason given for the world header just above.
   */
  {
    const { sayWhenAWriteNamesNoRun } = await import('./lib/a-write-that-names-no-run.ts')
    sayWhenAWriteNamesNoRun(app)
  }

  /**
   * Liveness check, and the quickest way to see whether the database has anything in it.
   *
   * It also answers the question the top entry in troubleshooting.md exists for: whether the file
   * this process is serving is still the file at MOLE_OFFICE_DB. An orphaned server holding a deleted
   * database answers every other request perfectly, which is how it once produced a wrong diagnosis
   * that was written down and acted on. `database` is absent while everything is normal, so a
   * caller only ever sees it when it means something.
   *
   * ---------------------------------------------------------------------------------------
   * IT IS NEVER GREEN ON A WRONG WORLD, AND IT USED TO BE
   * ---------------------------------------------------------------------------------------
   *
   * Criterion G7's words are *reported as a mismatch, never as a green health check*, and
   * problem 21 names the state to prevent: health checks that look green. Until
   * 4 September 2026 this answered `{"ok":true}` on a server serving a copy of the database from the
   * real address. The GROUND verifier measured it and filed `ZTDmG8IcF5wY`. The only thing on the
   * reply that told the two apart was the world header, so a page and the session hook were
   * protected and a shell check or a monitoring probe was not.
   *
   * `whatIsWrongWithThisServer` below is the check, and its own note says what it asks.
   *
   * THE WORLD IS ON THE BODY, ALWAYS, healthy or not. A caller reading a body and not a header
   * should not have to know that a header exists.
   */
  /** How long the health check waits for the terminal holder's hello. */
  const HOLDER_HEALTH_WAIT_MS = 1_000
  /** What the health check says of a holder that is not running, by state: fixed sentences, no detail. */
  const THE_HOLDER_IN_HEALTH = {
    off: 'No terminal holder runs, because MOLE_OFFICE_TERMINAL_HOLDER is off.',
    'not running': 'No terminal holder is running for this office.',
    unusable: 'Something answers where the terminal holder should be, but the office cannot use it.',
  } as const
  app.get(
    '/api/health',
    route('runtime.health', 'remote'),
    async (): Promise<{
      ok: boolean
      wrong?: string[]
      world: World
      code: { verdict: string; staleFor: number | null; grace: number }
      records: number
      path: string
      version: string | null
      database?: string
      usageRowsNotWritten?: number
      messageWorker: {started:boolean; says:string}
      terminalHolder: { running: boolean; state: string; says: string }
    }> => {
      const { theWorkerWeStarted } = await import('./lib/worker.ts')
      const worker = theWorkerWeStarted()
      // THE TERMINAL HOLDER, asked with a short wait so a stuck holder cannot slow the health check. It is
      // said, not judged: no holder leaves the office able to do everything else, so it is not in `wrong`.
      // The self-check names it when it is not running (src/config/the-self-check.mjs).
      // HEALTH IS ANSWERED TO ANY CALLER, so it carries the state and a fixed sentence and nothing more: never the
      // holder's log, whose last line can name a terminal's command and folder (that is for the person, on the
      // list door). It records nothing in the ledger, and a failure to read the holder is said, not a 500.
      const { theHolderState } = await import('./lib/terminals.ts')
      const terminalHolder = await theHolderState(HOLDER_HEALTH_WAIT_MS, 'do not record').then(
        (holder) =>
          holder.state === 'running'
            ? { running: true, state: holder.state, says: `The terminal holder is process ${String(holder.pid)}.` }
            : { running: false, state: holder.state, says: THE_HOLDER_IN_HEALTH[holder.state] },
        (err: unknown) => ({ running: false, state: 'unusable', says: `${THE_HOLDER_IN_HEALTH.unusable} (${err instanceof Error ? err.message : String(err)})` }),
      )
      const file = databaseFileStatus()
      const usage = usageCounters()
      const world = theWorldThisProcessIsIn()
      const code = howOldThisServersCodeIs()
      // THE PORT THIS PROCESS WAS CONFIGURED WITH, which is what the supervisor's file is about: a
      // supervisor names the port it is trying to serve, not the one a running server happened to
      // bind.
      const wrong = whatIsWrongWithThisServer(world, code, theBoundPort(), theFailedStartsOfThisCheckoutsSupervisor(world.port))
      return {
        ok: wrong.length === 0,
        messageWorker: {started:worker.started, says:worker.says},
        terminalHolder,
        // Absent while nothing is wrong, so a present `wrong` always means something, which is the
        // rule `database` and `usageRowsNotWritten` below already follow.
        ...(wrong.length === 0 ? {} : { wrong }),
        // WHICH WORLD ANSWERED, on the body. A scratch stack on its own port is healthy and says
        // `scratch` here; that is the difference between a throwaway server working properly and a
        // throwaway server answering on the address of the real one.
        world,
        code,
        records: liveRecordCount(db),
        // HOW MANY MEASUREMENTS THIS PROCESS LOST, and absent while it has lost none. A recorder
        // that failed quietly would leave every count on the usage page short by an unknown amount,
        // which is worse than no count at all. Absent rather than zero for the same reason `database`
        // is absent while everything is normal: a caller only ever sees it when it means something.
        ...(usage.writesFailed === 0 ? {} : { usageRowsNotWritten: usage.writesFailed }),
        // WHICH FILE, ALWAYS, and not only when something is wrong. "Where does my work actually
        // live" had exactly one answer before this: a single line of startup logging, in the
        // terminal of a process that may have been started days ago, written as the relative path
        // it was configured with. `GET /api` does not say, and `GET /api/kinds` does not say. Two
        // checkouts on one machine look identical from outside, and so do a server on the live
        // corpus and one on a scratch copy — which is a mistake worth one field.
        path: file.path,
        // WHICH VERSION THIS PROCESS RUNS, always. A service keeps running when Mole Office is replaced by a newer
        // copy, and the newer copy's window reads this to say it is talking to an older service. Null only for a
        // bundle whose stamp recorded no version (theVersion in src/config/settings.mjs).
        version: theVersion(),
        ...(file.ok ? {} : { database: file.problem }),
      }
    },
  )

  const routeRegistrations = {
    // The front door: GET /api lists the endpoints below, GET /api/kinds says what may go inside a
    // record. Registered first because it is what a caller who knows nothing should reach first.
    discoveryRoutes: () => app.register(discoveryRoutes, {
      prefix: '/api',
      listRoutes: listApiRoutes,
      // The same two steps every other route takes — read the header, check it against the registry
      // — supplied here because api/kinds.ts may not reach the database itself. So GET /api refuses
      // a misspelt workspace exactly as a write does, rather than being the one page that tells a
      // caller its header is fine.
      currentWorkspace: (req) => {
        const claim = workspaceFrom(req)
        return { current: requireWorkspace(claim.id, claim.stated).id, stated: claim.stated }
      },
    }),

    // The project boundaries, FIRST of the data routes, because every one below answers about one
    // of them and an agent that has not chosen yet has nowhere else to look. It is also the only
    // route group that answers about all the workspaces at once.
    workspaceRoutes: () => app.register(workspaceRoutes, { prefix: '/api' }),
    recordRoutes: () => app.register(recordRoutes, { prefix: '/api' }),
    moduleRequirementsRoutes: () => app.register(async instance => (await import('./api/module-requirements.ts')).moduleRequirementsRoutes(instance), { prefix: '/api' }),
    answerRoutes: () => app.register(answerRoutes, { prefix: '/api' }),
    criticismRoutes: () => app.register(criticismRoutes, { prefix: '/api' }),
    linkRoutes: () => app.register(linkRoutes, { prefix: '/api' }),
    queryRoutes: () => app.register(queryRoutes, { prefix: '/api' }),
    searchRoutes: () => app.register(searchRoutes, { prefix: '/api' }),
    // Planning, after the readers it points at. It is the one route group that takes NO workspace —
    // a plan is a person-level overlay across work that stays in its own project — and its own header
    // says why, so a reader meeting it here is not left to wonder whether the omission is a bug.
    planningRoutes: () => app.register(planningRoutes, { prefix: '/api' }),
    // The plans: the writing that comes before any of it has an hour on it. Beside the schedule
    // because they are the two halves of one idea — planning is writing, scheduling is giving hours —
    // and person-level for the same reason: a plan spans projects, so it belongs to none of them.
    planRoutes: () => app.register(planRoutes, { prefix: '/api' }),
    // What only the human can do, beside planning because it is the other person-level surface: what
    // is waiting on a person is a fact about the person rather than about one project.
    needsYouRoutes: () => app.register(needsYouRoutes, { prefix: '/api' }),
    // What there is to do, in every project at once. Beside planning and needs-you because it is the
    // third person-level surface and takes no project header for the same reason: what a person has to
    // do is a fact about the person. It reads the records, their containment and their hours, so it
    // sits after the route groups that own each of those.
    workRoutes: () => app.register(workRoutes, { prefix: '/api' }),
    flowRoutes: () => app.register(flowRoutes, { prefix: '/api' }),
    counterRoutes: () => app.register(counterRoutes, { prefix: '/api' }),
    hostJobRoutes: () => app.register(hostJobRoutes, { prefix: '/api' }),
    checklistRoutes: () => app.register(checklistRoutes, { prefix: '/api' }),
    // THE FLOW FOR PLANNING A BIG PIECE OF WORK: the plan step is done, and the plan is submitted.
    planningFlowRoutes: () => app.register(planningFlowRoutes, { prefix: '/api' }),
    // ENTERING ANY OTHER FLOW: the item on the agent's checklist that hangs there until the flow is done (wave 13j round 52).
    enteredFlowRoutes: () => app.register(enteredFlowRoutes, { prefix: '/api' }),
    bookingRoutes: () => app.register(bookingRoutes, { prefix: '/api' }),
    draftRoutes: () => app.register(draftRoutes, { prefix: '/api' }),
    toolsetRoutes: () => app.register(toolsetRoutes, { prefix: '/api' }),
    // The same forks, whole, for the person who is going to settle one. Beside the queue that lists
    // them because both are the same reading — src/server/lib/forks.ts — and neither takes a project.
    forkRoutes: () => app.register(forkRoutes, { prefix: '/api' }),
    // Everything waiting on the person, of which the forks above are one of three sources. Beside
    // them because it is the same person-level question at full width and takes no project for the
    // same reason; after them because it reads `readForks()` to find out which forks are still open.
    waitingRoutes: () => app.register(waitingRoutes, { prefix: '/api' }),

    // WHO MAY REACH MOLE OFFICE AND FROM WHERE, which today is: only this machine. It takes the same
    // route list GET /api takes, because the acts a caller on another machine may not perform are
    // read off the routes' own `reach` declarations rather than typed into a second list.
    accessRoutes: () => app.register(accessRoutes, {
      prefix: '/api',
      listRoutes: listApiRoutes,
      remotePort: appSettings.remotePort ?? null,
      production: appSettings.production,
    }),
    // What a record or a scope may not be used to claim, and the judgement somebody records after a
    // restriction has been resolved. Beside the queue reads because it answers the same shape of
    // question — what is standing in the way — and reads the same links table.
    restrictionRoutes: () => app.register(restrictionRoutes, { prefix: '/api' }),
    // The planning overview: what a goal or deadline is, what leads to it, and which of that is
    // actually allocated. Read-only, and beside planning because it reads the same layer.
    planGraphRoutes: () => app.register(planGraphRoutes, { prefix: '/api' }),
    presentationRoutes: () => app.register(presentationRoutes, { prefix: '/api' }),
    sessionRoutes: () => app.register(sessionRoutes, { prefix: '/api' }),
    // An agent's semantic lifecycle: open and close a period of participation, read whether the
    // agent can be reached, read and move what it says it is doing. Beside the session routes
    // because an attachment IS a session record — the same rows, read as the period of
    // participation they are. NOT ONE OF THESE STARTS A PROCESS, and none of them can. The Agent Host
    // in tools/ is what starts a provider, and it reaches these routes over HTTP like any other caller.
    lifecycleRoutes: () => app.register(lifecycleRoutes, { prefix: '/api' }),
    // Wanting an agent woken, and the reading that says which agents would be candidates. Beside the
    // lifecycle routes because both are about the same durable agent. NEITHER STARTS ANYTHING: one
    // writes a row saying somebody wants a wake, the other answers a question and acts on nobody.
    // There is no route that acts on a wake row, and whether Mole Office may ever start a process on this
    // machine is the owner's open question — design/round-eleven/design/the-wake-boundary.md.
    wakeRoutes: () => app.register(wakeRoutes, { prefix: '/api' }),
    agentMoveRoutes: () => app.register(agentMoveRoutes, { prefix: '/api' }),
    resourceRoutes: () => app.register(resourceRoutes, { prefix: '/api' }),
    // The machine's shared test seats, kept as `slot` rows in the same ledger (DECISIONS R7(2)).
    slotRoutes: () => app.register(slotRoutes, { prefix: '/api' }),
    // What this server IS, beside the ledger of what sessions started. The two answer different
    // questions: the ledger says what somebody wrote down, and this says what is actually true of the
    // process answering you — its checkout, its database, its commit, its freshness. Registered next
    // to the ledger because the listener list reads both.
    runtimeRoutes: () => app.register(runtimeRoutes, { prefix: '/api' }),
    // The derived source index. Registered after the rest because it is the layer that depends on
    // the others: it resolves the `claims` written on module records, which recordRoutes serves.
    sourceRoutes: () => app.register(sourceRoutes, { prefix: '/api' }),
    // The implementation map, immediately after the file index, because it resolves patterns against
    // that index and against the repositories it now belongs to. It answers a different question from
    // its neighbour — `source.read` is "what is in this checkout" and this is "where does this
    // project meaning live in the implemented world" — and it is registered second because a
    // repository is what gives a path its meaning and the index is what a pattern is resolved over.
    implementationRoutes: () => app.register(implementationRoutes, { prefix: '/api' }),
    workDomainRoutes: () => app.register(workDomainRoutes, { prefix: '/api' }),
    // The two human projections: who is working on what, and what has been said. Registered after
    // the work domains, the lifecycle and the agent routes because it reads all three and owns no
    // store of its own. Both are reads; neither starts a process, wakes an agent or writes a row.
    workingRoutes: () => app.register(workingRoutes, { prefix: '/api' }),
    // Inline preview. After the record routes because a file is previewable only while a live record
    // points at it, which is a fact those routes own; it adds no way to write anything.
    fileRoutes: () => app.register(fileRoutes, { prefix: '/api' }),
    // A returned file is stored beside the pictures and served by the same preview door above, so its
    // group is registered here. It writes no record and it never opens the archive it stores.
    returnedFilesRoutes: () => app.register(returnedFilesRoutes, { prefix: '/api' }),
    // A report's own file is stored the same way and served by the same preview door, so its group is
    // registered beside the outside return. It writes no record.
    reportFilesRoutes: () => app.register(reportFilesRoutes, { prefix: '/api' }),
    storageRoutes: () => app.register(storageRoutes, { prefix: '/api' }),
    // A resident's personal space is the third folder of files beside the database with doors of its own. It is
    // served by its own doors and never by the preview door, because only its readers may read it.
    residentsRoutes: () => app.register(residentsRoutes, { prefix: '/api' }),
    // The fence around the preview, read for one project so the Settings page can draw it. Its own
    // group because it is a read of the boundary and not of a file, and because the preview route
    // itself must stay the one endpoint it is.
    previewRootRoutes: () => app.register(previewRootRoutes, { prefix: '/api' }),
    // The durable export, last, because it reads every authored table and therefore depends on all
    // of the above having decided what those tables mean.
    exportRoutes: () => app.register(exportRoutes, { prefix: '/api' }),
    // The import, immediately after the export, because it is the same contract read the other way
    // and there is nothing between them that either depends on.
    importRoutes: () => app.register(importRoutes, { prefix: '/api' }),
    // Talking to an agent about real work: conversations, what was said, and the runs a dispatch
    // writes. After the record, plan, planning and session groups because a comment points at what
    // those own, and a recipient is a session record they already serve.
    agentRoutes: () => app.register(agentRoutes, { prefix: '/api' }),
    // Who a message is likely to be for, ranked from what Mole Office already holds. Beside the agent
    // routes because it answers one question of the same conversation, and separate from them
    // because it reads the change log and the session placement rules rather than the agent tables.
    recipientRoutes: () => app.register(recipientRoutes, { prefix: '/api' }),
    // A review: somebody started collecting remarks, from somewhere. After the agent routes because a
    // review brought forward from round seven reads the comments of the conversation it was collected
    // in, and after the record routes because what it collects is worked out from what they own.
    reviewRoutes: () => app.register(reviewRoutes, { prefix: '/api' }),
    // One remark, found from its own id, and whether a whole list of them has gone stale. Beside the
    // review routes because a review list asks both questions on every row.
    annotationRoutes: () => app.register(annotationRoutes, { prefix: '/api' }),
    participantRoutes: () => app.register(participantRoutes, { prefix: '/api', listRoutes: listApiRoutes }),
    pixelOfficeRoutes: () => app.register(pixelOfficeRoutes, { prefix: '/api' }),
    // THE ROLE CARDS AND THEIR COPIES. Criterion P12; the declaration was read at the top of this
    // function, so these routes serve what this server started with and never re-read a file.
    roleRoutes: () => app.register(roleRoutes, { prefix: '/api' }),
    // THE OFFICE REGULATIONS PAGE'S OWN DOOR, criterion G5. After the role routes, because both read
    // what governs the office rather than what is governed.
    officeRegulationRoutes: () => app.register(officeRegulationRoutes, { prefix: '/api' }),
    messageRoutes: () => app.register(messageRoutes, { prefix: '/api' }),
    // A conversation with several subscribers, beside the pool it is read out of.
    groupRoutes: () => app.register(groupRoutes, { prefix: '/api' }),
    // WHERE A RUN STANDS AND WHO RELEASED IT. Criteria C17 to C26. After the groups, because a
    // refusal opens one, and after the participants, because the check reads who started whom.
    inspectionRoutes: () => app.register(inspectionRoutes, { prefix: '/api' }),
    // THE MERGE QUEUE. Sandbox v1, piece P6. After the checks, because an entry is submitted on a run's
    // seal and the check is what judges that seal.
    mergeQueueRoutes: () => app.register(mergeQueueRoutes, { prefix: '/api' }),
    // THE HONOUR BOARD'S RECORD SIDE. Criterion HB2. After the checks, because the reading reads the
    // run's release, refusal and confirm, and because the confirm's press of it reaches the reader
    // through the lib the checks already built.
    honourBoardRoutes: () => app.register(honourBoardRoutes, { prefix: '/api' }),
    // What an agent is working on, beside the groups a conflict between two claims opens.
    claimRoutes: () => app.register(claimRoutes, { prefix: '/api' }),
    // Which live session is answering as a durable agent. BEFORE the worker's routes, because the
    // worker's queue reads a hold to decide whether to start a run at all.
    handleRoutes: () => app.register(handleRoutes, { prefix: '/api' }),
    workerRoutes: () => app.register(workerRoutes, { prefix: '/api' }),
    // What is at work, and shutting the office down with the runs paused first. Criterion W6.
    shutdownRoutes: () => app.register(shutdownRoutes, { prefix: '/api' }),
    // The interrupted runs, and the person's one press to resume one. Criterion W7.
    interruptedRoutes: () => app.register(interruptedRoutes, { prefix: '/api' }),
    // The next round of a sandbox run, and the worker's half of starting it. Wave 13j round loop-2.
    nextRoundRoutes: () => app.register(nextRoundRoutes, { prefix: '/api' }),
    // A worker run a supervisor in a sandbox asks for, and the worker's half of starting it. Wave 13j round loop-3.
    workerRunRoutes: () => app.register(workerRunRoutes, { prefix: '/api' }),
    thePersonsOwnWordsRoutes: () => app.register(thePersonsOwnWordsRoutes, { prefix: '/api' }),
    // The office's own terminals, held by the terminal holder: list, open, read, type. Wave 13u.
    terminalRoutes: () => app.register(terminalRoutes, { prefix: '/api' }),
    // The install press: the agent tools the office runs, and one terminal that installs the ticked ones. Wave 13u round 3.
    terminalHarnessRoutes: () => app.register(terminalHarnessRoutes, { prefix: '/api' }),
    // Whether a systemd user unit starts the office at the person's login, and their press. Wave 13u, piece H9.
    startAtLoginRoutes: () => app.register(startAtLoginRoutes, { prefix: '/api' }),
    // Where the office keeps its data, and the person's presses that move the folder and confirm the move. Criteria DF19 to DF21.
    dataFolderRoutes: () => app.register(dataFolderRoutes, { prefix: '/api' }),
    // One memory limit for all sandboxes together, and the person's press that sets it through pkexec.
    sandboxMemoryCapRoutes: () => app.register(sandboxMemoryCapRoutes, { prefix: '/api' }),
    // An agent opened in one of those terminals, by the person's press. Wave 13u, round 3.
    terminalAgentRoutes: () => app.register(terminalAgentRoutes, { prefix: '/api' }),
    // THE DEAD LETTERS: the wild messages, the one line per sweep to the secretary the person named (or to
    // nobody when nobody is named, problem 0WUuvB0IhRfb), and the claim. Criterion M111. After the worker's routes, because the worker is what presses the sweep once a pass.
    deadLetterRoutes: () => app.register(deadLetterRoutes, { prefix: '/api' }),
    eventRoutes: () => app.register(eventRoutes, { prefix: '/api' }),
    // The shorter forms of a record, for the lists and cards that have no room for the whole thing.
    // After the record routes because every one of these endpoints is about a record and reads its
    // revisions, and last because it is the newest group and nothing else depends on it.
    zoomRoutes: () => app.register(zoomRoutes, { prefix: '/api' }),
    compositionRoutes: () => app.register(compositionRoutes, { prefix: '/api' }),
    bundleRoutes: () => app.register(bundleRoutes, { prefix: '/api' }),
    // THE PACKAGED TASKS AND THE DOOR THAT MAKES ONE. After the bundles, because a package files a
    // context bundle and links it, and a reader following this file should meet the bundle door first.
    delegationRoutes: () => app.register(delegationRoutes, { prefix: '/api' }),
    // ONE PACKAGE'S WORKERS, AND A DAY'S PACKAGES (round FQ, point OP-3). After the delegation doors, because it reads
    // the packages they make.
    packageWorkerRoutes: () => app.register(packageWorkerRoutes, { prefix: '/api' }),
    usageRoutes: () => app.register(usageRoutes, { prefix: '/api' }),
    bootstrapRoutes: () => app.register(bootstrapRoutes, { prefix: '/api' }),
    briefRoutes: () => app.register(briefRoutes, { prefix: '/api' }),
    // THE BRIEF, THE WAITING LIST AND THE OPEN LOOPS IN ONE READ, for the session hook (wave 13n's round 39).
    whereYouStandRoutes: () => app.register(whereYouStandRoutes, { prefix: '/api' }),
    // AN AGENT'S HANDOVER, AND WHAT A SESSION NEEDS BACK FIRST AFTER A COMPACTION, in one small read (wave 13k round
    // 46). Beside where-you-stand, because the session hook sends the one read before that one.
    handoverRoutes: () => app.register(handoverRoutes, { prefix: '/api' }),
    // WHICH DECISIONS GOVERN A PLACE, AND THE CHECK OF WHAT THEY GOVERN.
    governsRoutes: () => app.register(governsRoutes, { prefix: '/api' }),
    // THE DOORS AND THE PROJECT, IN ONE SMALL READ. After the reads it points at, because it names
    // their routes and takes each door's sentence from the route's own declaration, so the table it
    // reads has to hold them by the time a request arrives.
    onboardingRoutes: () => app.register(onboardingRoutes, {
      prefix: '/api',
      listRoutes: listApiRoutes,
      // WHERE THE OFFICE'S OWN PAGE IS, for the guide's address in the onboarding read: the API serves
      // the built page itself, and in development Vite serves it at the web address.
      pageAddress: (req) => (appSettings.production ? `${req.protocol}://${req.headers.host ?? ''}` : appSettings.webAppUrl),
    }),
    // THE SECRETARY'S NOTEBOOK: its four doors. After the brief, because the brief READS a notebook and
    // these are what write one, and a reader following this file should meet the read before the writes.
    notebookRoutes: () => app.register(notebookRoutes, { prefix: '/api' }),
    // AN INCIDENT'S TWO EXTRA DOORS: appending a timeline moment, and closing. After the record
    // routes, because both act on a record that must already exist. Criteria I1, I4 and I7.
    incidentRoutes: () => app.register(incidentRoutes, { prefix: '/api' }),
    folderReadingRoutes: () => app.register(folderReadingRoutes, { prefix: '/api' }),
    // WHICH WORLDS THIS INSTALLATION HAS. Served by every world: the main world answers from its own
    // table, and any other world answers from the mirror and says so.
    officeRoutes: () => app.register(officeRoutes, { prefix: '/api' }),
    stableUpgradeNoticeRoutes: () => app.register(stableUpgradeNoticeRoutes, { prefix: '/api', webDir: appSettings.webDir }),
    // AND THE CREDENTIAL A VISITING AGENT HOLDS, at the same office and under the same prefix: an
    // agent on another machine, before that machine runs a world, is a trusted visitor and holds one
    // of its own. Criteria P24 to P30.
    visitorRoutes: () => app.register(visitorRoutes, { prefix: '/api' }),
    // WHAT THE OFFICE KEEPS: HOW MANY BACKUPS, AND THE TWO REQUEST-ROW WINDOWS. Criterion U6. Beside the
    // office routes because the three numbers are the office's own, kept on its one installation row.
    whatIsKeptRoutes: () => app.register(whatIsKeptRoutes, { prefix: '/api' }),
    // A REQUEST FOR ONE PRESS: AN AGENT ASKS, THE PERSON AGREES OR REFUSES.
    onePressRoutes: () => app.register(onePressRoutes, { prefix: '/api' }),
    // A READINESS CHECKLIST: AN OPERATION THAT REACHES OTHERS WAITS FOR THEIR
    // SIGNATURES.
    readinessRoutes: () => app.register(readinessRoutes, { prefix: '/api' }),
    signingPackageRoutes: () => app.register(signingPackageRoutes, { prefix: '/api' }),
    // THE PRICE TABLE THE PERSON SETS IN SETTINGS. Criterion U3. The person's setting, beside what the office keeps.
    priceTableRoutes: () => app.register(priceTableRoutes, { prefix: '/api' }),
    // QUICK INPUTS: THE OWNER'S LIST, AND AN AGENT'S ASK FOR ONE IN ITS OWN TERMINAL. Wave 13u round 21.
    quickInputRoutes: () => app.register(quickInputRoutes, { prefix: '/api' }),
    // WHAT THE PERSON'S GRANT CARRIES IN THIS OFFICE: the card's default, and the doors the person changed. Wave 13s round 2a.
    whatTheGrantCarriesRoutes: () => app.register(whatTheGrantCarriesRoutes, { prefix: '/api' }),
    // THE WORDS WAITING FOR TRANSLATION, worked out from the word lists.
    wordsWaitingRoutes: () => app.register(wordsWaitingRoutes, { prefix: '/api' }),
    sidebarRoutes: () => app.register(sidebarRoutes, { prefix: '/api' }),
    // EACH PERSON'S HOME LAYOUT: one row each, written only by that person.
    homeLayoutRoutes: () => app.register(homeLayoutRoutes, { prefix: '/api' }),
    // EACH PERSON'S PAGES IN FRONT OF THE SIDEBAR: one row each, written only by that person.
    sidebarPinsRoutes: () => app.register(sidebarPinsRoutes, { prefix: '/api' }),
    wordSettingsRoutes: () => app.register(wordSettingsRoutes, { prefix: '/api' }),
    addedRolesRoutes: () => app.register(addedRolesRoutes, { prefix: '/api' }),
    // THE GOAL SPANS: HOW FAR OUT SHORT, MEDIUM AND LONG REACH. Criterion P1. On the same installation
    // row as the office's own numbers, and the person's to set like them.
    goalSpanRoutes: () => app.register(goalSpanRoutes, { prefix: '/api' }),
    // WHETHER AGENTS MAY INJECT: ONE SWITCH FOR EVERY AGENT. Criterion M91. On the same installation
    // row as the office's other settings, and the person's to switch like them.
    injectSettingRoutes: () => app.register(injectSettingRoutes, { prefix: '/api' }),
    // WHICH ADDRESS IS WHICH MACHINE, in the person's own words (problem 8Kf0hCaK4lQY), on the same row, and who last
    // changed each of the settings whose every change is written down (problem 4f6oWJdzJbnk).
    machineNamesRoutes: () => app.register(machineNamesRoutes, { prefix: '/api' }),
    // THE ONE ADDRESS A BROWSER IS SENT TO, chosen by the person, on the same row (lib/address-for-browsers.ts).
    addressForBrowsersRoutes: () => app.register(addressForBrowsersRoutes, { prefix: '/api' }),
    // WHO TAKES THE DEAD LETTERS, one agent the person names (problem 0WUuvB0IhRfb), on the same row.
    deadLetterSecretaryRoutes: () => app.register(deadLetterSecretaryRoutes, { prefix: '/api' }),
    deadLetterThresholdsRoutes: () => app.register(deadLetterThresholdsRoutes, { prefix: '/api' }),
    runtimeSettingsRoutes: () => app.register(runtimeSettingsRoutes, { prefix: '/api' }),
    providerKeySetupRoutes: () => app.register(providerKeySetupRoutes, { prefix: '/api' }),
    noticeRulesRoutes: () => app.register(noticeRulesRoutes, { prefix: '/api' }),
    officeRestartRoutes: () => app.register(officeRestartRoutes, { prefix: '/api' }),
    // WHO OWNS THE MERGE QUEUE, one agent the person names, on the same row.
    mergeQueueOwnerRoutes: () => app.register(mergeQueueOwnerRoutes, { prefix: '/api' }),
    // WHO IS REMINDED ABOUT EACH PROJECT'S MODULES, set here or by the .env line (decision aZGg6gerakM1).
    moduleReminderSecretaryRoutes: () => app.register(moduleReminderSecretaryRoutes, { prefix: '/api' }),
    gpuWatcherRoutes: () => app.register(gpuWatcherRoutes, { prefix: '/api' }),
    // WHETHER THE MERGE TOOL RUNS AN ENTRY'S RELATED TESTS FIRST, on the same row. That is part B of a
    // decision.
    relatedTestsFirstRoutes: () => app.register(relatedTestsFirstRoutes, { prefix: '/api' }),
    checksInMergesOnlyRoutes: () => app.register(checksInMergesOnlyRoutes, { prefix: '/api' }),
    officeLoadRoutes: () => app.register(officeLoadRoutes, { prefix: '/api' }),
    // THE PLUGINS IN plugins/ AND A SWITCH FOR EACH, on the same row (wave 13x round 14, pipeline udGnc-Bsr15R).
    pluginsRoutes: () => app.register(pluginsRoutes, { prefix: '/api' }),
    // THE READ-ONLY INTERFACE A PLUGIN READS THROUGH, version 1: six read views and nothing that writes.
    pluginReadRoutes: () => app.register(pluginReadRoutes, { prefix: '/api' }),
    officeOwnerRoutes: () => app.register(officeOwnerRoutes, { prefix: '/api' }),
    settingChangesRoutes: () => app.register(settingChangesRoutes, { prefix: '/api' }),
    // THE FOUR WORK SWITCHES IN ONE READ, for a host script with an agent's own key (wave 13q item 17).
    workSwitchesRoutes: () => app.register(workSwitchesRoutes, { prefix: '/api' }),
    // THE OFFICE'S OWN TWO KEYS, AND EACH RUNTIME'S OWN ASKED READ-ONLY. Criterion U2. Beside the
    // office routes because the office's keys live beside its database, and on this machine because
    // that is where the file is and where each tool's own store is asked.
    officeKeyRoutes: () => app.register(officeKeyRoutes, { prefix: '/api' }),
    // THE SUMMONS. A secretary calls the person in with one fixed mail, and the
    // mail's settings are the person's, kept in the same key file. Beside the office's keys for that reason.
    summonsRoutes: () => app.register(summonsRoutes, { prefix: '/api' }),
    // PUSH, by two decisions: the devices a summons tells, and the office's signing key, kept in the same
    // key file. Beside the summons for that reason.
    pushRoutes: () => app.register(pushRoutes, { prefix: '/api' }),
    // THE MODEL EACH RUN USES, criterion U2: the office's choices and each agent's own, beside its keys.
    runModelRoutes: () => app.register(runModelRoutes, { prefix: '/api' }),
    castingRoutes: () => app.register(castingRoutes, { prefix: '/api' }),
    // THE SANDBOXES' LOGINS. Which model logins the sandboxes are handed, set by the
    // person on the same page. Beside the office's keys because both are logins, and on this machine because
    // the file is.
    sandboxLoginRoutes: () => app.register(sandboxLoginRoutes, { prefix: '/api' }),
    // THE ENTRY THAT FOLLOWS THE PERSON, F15 point 1: one press writes the skill link and the three hook
    // lines into the person's home directory at user level. Beside the office's keys because both are the
    // office's own installation facts rather than a project's, and on this machine because that is
    // where the directory is.
    entryRoutes: () => app.register(entryRoutes, { prefix: '/api' }),
    // WHAT EACH SECRETARY DOES IN THIS PROJECT, wave 13s round 92: the duties records' own doors, never in records.ts.
    secretaryDutiesRoutes: () => app.register(secretaryDutiesRoutes, { prefix: '/api' }),
    // ONE LINE'S BACKLOG, wave 13s round 142: the backlog items of one line, in the line's order.
    backlogRoutes: () => app.register(backlogRoutes, { prefix: '/api' }),
    // A RECORD MARKED DONE IN ONE CALL, wave 13s round 142: a task, a backlog item or an obligation.
    doneRoutes: () => app.register(doneRoutes, { prefix: '/api' }),
    // THE PROVIDER ROUTER'S DOORS, the key layer's step 2. Off unless MOLE_OFFICE_PROVIDER_ROUTER is on; while it is on, the
    // office does not start if a Casting row in force for the inspector uses dsh.
    providerRouterRoutes: () => app.register(providerRouterRoutes, { prefix: '/api' }),
    // AN AGENT'S NEW NAME, PROPOSED AND THEN APPROVED OR REFUSED BY ITS APPROVER, item 42. The rules are in lib/agent-renames.ts.
    agentRenameRoutes: () => app.register(agentRenameRoutes, { prefix: '/api' }),
    providerTableRoutes: () => app.register(providerTableRoutes, { prefix: '/api' }),
    // WHO TAKES THE USAGE NOTICES OF THE SANDBOXES' LOGIN, AND WHAT THEIR 80% SENTENCE SAYS TO DO (wave 13y round 136).
    usageNoticeSecretaryRoutes: () => app.register(usageNoticeSecretaryRoutes, { prefix: '/api' }),
    usageDecisionRoutes: () => app.register(usageDecisionRoutes, { prefix: '/api' }),
    // A NEW OFFICE'S FIRST ENTRY, AND THE PERSON'S PRESS THAT ENDS IT (wave 13y round 138).
    gettingStartedRoutes: () => app.register(gettingStartedRoutes, { prefix: '/api' }),
    // ONE PROJECT'S OWN RULES: a design's review, and the project's chapter (the design-first build of wave 13s's requirements).
    projectRulesRoutes: () => app.register(projectRulesRoutes, { prefix: '/api' }),
    backupRoutes: () => app.register(backupRoutes, { prefix: '/api' }),
    // ONE GRAPH OF THE PROJECT'S PAST, PRESENT AND LIVE FUTURES (wave 13s round 241): a read, and no write door.
    projectGraphRoutes: () => app.register(projectGraphRoutes, { prefix: '/api' }),
    // A PROJECT'S MASTER PIPELINE AND THE BOARD READ FROM IT.
    projectBoardRoutes: () => app.register(projectBoardRoutes, { prefix: '/api' }),
    // THE CONVERSATION SYNC: one project's opt-in, its sync, and one copy read and restored (wave 13s round 242).
    conversationRoutes: () => app.register(conversationRoutes, { prefix: '/api' }),
    // A SECRETARY'S OWN BROADCAST SETTINGS, beside its times door.
    broadcastSettingsRoutes: () => app.register(broadcastSettingsRoutes, { prefix: '/api' }),
    // ONE PERSON'S LOOK AND OWN THEMES, read and set by that person or by a secretary holding the person's grant.
    thePersonsLookRoutes: () => app.register(thePersonsLookRoutes, { prefix: '/api' }),
  } satisfies Record<(typeof ROUTE_GROUPS)[number], () => typeof app>
  for (const name of ROUTE_GROUPS) await routeRegistrations[name]()

  /**
   * AND THE ONE STANDING GROUP FOR THE OWNER AND EVERY SECRETARY, MADE BEFORE ANYTHING IS SERVED.
   *
   * Every secretary is put into the Secretariat group
   * automatically, and the person is in it too, so an office-wide notice is said there once. The group is
   * made here so that it exists on an installation that has never had a secretary, and so that a
   * server start is the one moment the office can be sure its registry has been read (the role cards
   * above) — `syncTheSecretariatGroup` reads who holds the secretary card from that declaration.
   *
   * IT WRITES NO MESSAGE AND OPENS NO RECORD. The group row and its membership rows are the group;
   * `src/server/lib/secretariat.ts` says why the two writes there are made directly rather than
   * through `openAGroup`.
   */
  const { syncTheSecretariatGroup } = await import('./lib/secretariat.ts')
  syncTheSecretariatGroup()
  /**
   * AND ONE BROADCAST SCHEDULE PER SECRETARY, MADE HERE FOR A SECRETARY THAT LACKS ONE. By a
   * decision, the schedule is made when the secretary card is given and brought in step at a server
   * start. It is the same moment and the same registry read as the group
   * above, and it writes into the agent record's existing `extra` bag rather than opening a record
   * or a table.
   */
  const { syncTheBroadcastSchedules } = await import('./lib/broadcast.ts')
  syncTheBroadcastSchedules()

  // AND THE CHECK ON EVERY REQUEST: a caller from another world needs a visit to write here, and is
  // told on a read that it holds none. Criterion C4. A caller that names no home and a caller whose
  // home is this world both pass through untouched: a local agent and the person's own curl may both
  // reach the office.
  checkWhereTheCallerIsFrom(app)

  // ----------------------------------------------------- the browser app

  if (appSettings.production) {
    const missing = missingWebBuild(appSettings.webDir)
    if (missing !== null) throw new Error(missing)
    /**
     * SERVING THE BUILT PAGE: NEVER CACHE THE PAGE, CACHE THE HASHED FILES FOR EVER.
     *
     * S3 of design/ground/ACCEPTANCE.md section 9. A build writes `index.html` and a folder of
     * assets whose names carry a content hash. The page must be revalidated on every load, because
     * it names the hashed files and a cached copy would go on naming files a rebuild has deleted;
     * a hashed file's name changes when its contents do, so holding it for a year is safe and saves
     * the browser asking again.
     *
     * `setHeaders` runs after @fastify/static has set its own headers, so this replaces whatever it
     * would have said rather than being added beside it. `no-store` for the page is stronger than
     * `no-cache`: a page that is stored at all can be shown by a browser that is offline or that
     * decides the copy is fresh, and the one file whose staleness breaks a whole load is the page.
     */
    await app.register(fastifyStatic, {
      root: appSettings.webDir,
      // THE COMPRESSED COPY, WHEN THE BROWSER ACCEPTS ONE. The build writes a brotli and a gzip copy beside every script and
      // stylesheet (`writeTheCompressedCopies` in vite.config.ts), and this sends the one the browser's Accept-Encoding
      // names, or the file itself. It also says the answer varies by Accept-Encoding. setHeaders below still sees the
      // copy's path under assets/, so the year-long cache is kept.
      preCompressed: true,
      setHeaders: (reply, path) => {
        if (/[\\/]assets[\\/]/.test(path)) {
          reply.header('cache-control', 'public, max-age=31536000, immutable')
          return
        }
        if (/[\\/]index\.html$/.test(path)) {
          reply.header('cache-control', 'no-store')
          return
        }
        // Anything else the build wrote — a favicon, a manifest — is revalidated rather than held:
        // it is not content-hashed, so a long cache would be a promise this cannot keep.
        reply.header('cache-control', 'no-cache')
      },
    })
  }

  /**
   * What to do with a URL no route matched.
   *
   * An unknown /api path is a mistake, and the answer lists every endpoint that does exist. It
   * used to say "No such endpoint" and stop there: an audit tried /api, /api/schema and
   * /api/kinds, was refused three times with no alternatives offered, and went and read 1200
   * lines of source instead. A 404 that carries the list turns that into one request.
   *
   * Anything else is a browser address: the app keeps its state in the URL, so reloading on
   * /records/abc123 must return the app itself and let it read the path, rather than 404. That is
   * the "catch-all" a single-page app needs.
   */
  app.setNotFoundHandler(async (req, reply) => {
    if (isPrivateLoginRequest(req.url)) {
      const { privateLoginRefusal } = await import('./api/sandbox-logins.ts')
      throw privateLoginRefusal('Shape')
    }
    if (req.url === '/api' || req.url.startsWith('/api/') || req.url.startsWith('/api?')) {
      return reply.status(404).send(noSuchEndpoint(req.method, req.url, listApiRoutes()))
    }
    if (appSettings.production) {
      return reply.status(200).type('text/html').sendFile('index.html')
    }
    return reply.status(404).send({
      error: `This is the Mole Office API only, and its endpoints are listed at GET /api. In development the browser app is served by Vite on ${appSettings.webAppUrl} — start it with "npm run dev".`,
    })
  })

  app.addHook('onClose', async () => {
    const { stopNoticeBatchClock } = await import('../holder/notice-batches.ts')
    stopNoticeBatchClock()
    theLoopWatch.stop()
    endedRunResourceTimers.get(app)?.()
    endedRunResourceTimers.delete(app)
    loadReadingTimers.get(app)?.()
    loadReadingTimers.delete(app)
    storageReceiptTimers.get(app)?.()
    storageReceiptTimers.delete(app)
  })
  return { app, listApiRoutes, endTheWaits }
}

// ---------------------------------------------------------------------------- how it runs


/**
 * WRITE THIS SERVER INTO THE LEDGER OF WHAT IS RUNNING, WITH THE WORLD IT SERVES.
 *
 * The writing is `registerThisServer` in lib/register-this-server.ts, which
 * `POST /api/runtime/register` also calls — one spelling of what a server says about itself. This
 * function is the other half: the session record to own the rows, and the promise that none of it
 * can stop the server starting.
 *
 * THE SESSION RECORD IS FILED FRESH ON EVERY START, and that is the honest shape rather than a
 * tidy one. A resource is owned by the session that started it, and "has the owner ended" is the
 * whole question the ledger answers; a process that has just started is a new run of the server,
 * and its rows belong to that run. A `tsx watch` restart is a new process, so it files one and its
 * old rows are closed by the registration itself.
 *
 * IT IS ONE TRY AND IT NEVER RETRIES. A ledger that is not answering is a fault worth printing, not
 * a reason to keep asking.
 */

/**
 * THE ID THE OFFICE GAVE THIS WORLD, or null because it was never told.
 *
 * A module variable rather than a return value, because the two ends of the fact are in two
 * different functions: the boot writes it and the shutdown reads it, and nothing between them needs
 * it. Null is the ordinary case for the main world, which holds the office itself and has no second
 * row anywhere to close.
 */
let theRowAtTheOffice: string | null = null

/**
 * THE SESSION ROWS THIS PROCESS FILED FOR ITSELF, so the way out can say how they ended.
 *
 * A server filed a session record for itself at every start and nothing ever wrote a state on it,
 * because nothing outlives a process to correct what it last said. So a stopped server left a row
 * reading `running` for ever: nine of them were on the Agent runs screen on 5 September 2026, on a
 * machine running one. Problem `uYjxMB6JETEq`.
 */
let theServersOwnSession: string | null = null
let theWorkersSession: string | null = null

/**
 * SAY HOW A SESSION ENDED, on the way out or at the next start, and never guess.
 *
 * `finished` is written by the shutdown, which knows the server stopped cleanly. `crashed` is
 * written at the next start about a row whose ledger entry that start has just closed — the ledger
 * closes a row because the process it named has gone, so "gone, and nothing wrote a state" is a
 * measurement and not a guess. It is the kind's own word for stopped without finishing. A message
 * worker whose start threw after its row was filed is written `crashed` too, by the start that saw
 * it throw (wave 13y round 33).
 *
 * IT NEVER FAILS A START OR HOLDS UP A STOP. A record that cannot be written is a line in the log.
 *
 * THE PROCESSES THE ENDING READS ARE READ FIRST. A run that ends has its process rows closed in the same write, and
 * each is read from the machine; `readFirst` reads them without holding the thread (Windows), and the write is then
 * answered from those readings. Exported so a test can drive it.
 */
export async function sayHowThisSessionEnded(id: string, state: 'finished' | 'crashed', detail: string): Promise<boolean> {
  try {
    const { patchRecord, getRecord, theProcessesAWriteReads } = await import('./lib/records.ts')
    const { readFirst } = await import('./lib/resources.ts')
    // A MERGE, so `doing`, `runtime` and everything else on the row stay exactly as they are.
    const patch = { dataPatch: { state, detail } }
    return await readFirst(() => theProcessesAWriteReads(id, patch), () => {
      const held = getRecord(id)
      if (held === undefined || held === null || held.kind !== 'session') return false
      // ONLY A ROW THAT STILL SAYS IT IS GOING. A session somebody has already said something about
      // is theirs, and overwriting it would be this replacing an answer with its own.
      if (!saysStillGoing(held.data['state'])) return false
      patchRecord(id, patch, { type: 'agent', id: 'mole-office/the-api-server' })
      return true
    })
  } catch {
    return false
  }
}

/**
 * WHETHER THE MESSAGE WORKER HAS STOPPED, read by the group number recorded when it was started. On Windows the reading
 * runs PowerShell, and it is made by the way that waits without holding the thread. Exported so a test can drive it.
 */
export async function theMessageWorkerHasStopped(pgid: number): Promise<boolean> {
  const { readAProcess } = await import('./lib/resources.ts')
  return (await readAProcess(pgid)) === null
}

/**
 * THE SERVICE LOCK OF THIS SERVER, with the group it was started in. Both read processes: on Windows the group is the
 * answer of the starter's Job Object, and the lock reads this server's own process and its starter. Each is read by
 * the way that waits for PowerShell without holding the thread. `system` is this machine's system layer unless a test
 * hands in its own, and `theGroupWasRead` lets the start say that step apart. Exported so a test can drive it.
 */
export async function takeTheServiceLockOfThisServer(
  the: { lockPath: string; databasePath: string; port: number; checkout: string; starter: number | null },
  system: Pick<ReturnType<typeof thisSystem>, 'groups' | 'processes'> = thisSystem(),
  theGroupWasRead: () => void = () => {},
): ReturnType<typeof takeTheServiceLock> {
  // THE GROUP THIS SERVER RUNS IN, ON WINDOWS, where the process table names none: the one the system layer's
  // starter put it in, which the layer answers only when the starter's mark and its Job Object both say so. On
  // Linux and the Mac the lock reads the process group with the process.
  const group = (await system.groups.jobObjects?.readTheOneThisProgramWasStartedIn()) ?? null
  theGroupWasRead()
  return takeTheServiceLock({
    ...the,
    pid: process.pid,
    readProcess: (pid) => readTheProcessAt(pid, system.processes),
    group,
  })
}

/**
 * THE MESSAGE WORKER'S ROW IN THE LEDGER, filed once the process exists. The registration reads the process for its
 * start; it is read first, without holding the thread (Windows). Exported so a test can drive it.
 */
export async function registerTheMessageWorkersProcess(the: { workspaceId: string; sessionRecordId: string; pid: number }) {
  const { readFirst, registerResource, theProcessesARegistrationReads } = await import('./lib/resources.ts')
  const { worldNow } = await import('./lib/runtime.ts')
  const input = {
    workspaceId: the.workspaceId,
    sessionRecordId: the.sessionRecordId,
    type: 'process',
    key: String(the.pid),
    detail: 'the Mole Office message worker',
    world: worldNow(),
    startedByTheProduct: true,
    actor: { type: 'agent', id: 'mole-office/the-api-server' },
  } as const
  return readFirst(() => theProcessesARegistrationReads(input), () => registerResource(input))
}

/**
 * Exported, and the standing can be given, so a test can run this write at canonical standing on a listening server:
 * the world a test runs in is always scratch. The server's own start gives none, and the world's standing is used.
 *
 * THE SLEEP CLOCK'S INTERVAL CAN BE GIVEN TOO, because this write is after the socket and its try steps over a
 * failure: the server's start reads the setting before the socket and passes it here, so a bad value stops the start
 * before it answers. Without it, the clock reads the setting at the call, as it did.
 */
export async function writeThisServerIntoTheLedger(
  app: FastifyInstance,
  standing?: 'canonical' | 'scratch',
  sleepClockEvery?: number,
): Promise<void> {
  const workspaceId = settings().workspace
  const actor = { type: 'agent', id: 'mole-office/the-api-server' } as const
  try {
    const { createRecord } = await import('./lib/records.ts')
    const { registerThisServer, theProcessesRegisteringThisServerReads } = await import('./lib/register-this-server.ts')
    const { localStamp } = await import('@shared/time.ts')
    const {
      closeTheEarlierOwnRows,
      closeTheOwnRowsWhoseProcessIsGone,
      theOwnPartBlock,
      theOwnPartUsageReceipt,
      theProcessesTheEarlierOwnRowsCloseReads,
      theProcessesTheOwnRowsCloseReads,
      THE_API_SERVER,
      THE_MESSAGE_WORKER,
    } = await import('./lib/own-rows.ts')
    const { runtimeRecord } = await import('./lib/runtime.ts')
    const { readFirst } = await import('./lib/resources.ts')
    const { recordTheAddressTheEnvironmentNamed } = await import('./lib/trustedmachines.ts')
    const checkout = REPO_ROOT.replace(/\/$/, '')
    const now = new Date()
    // The port the runtime record names is the declared one, read here without the record, which reads processes.
    const port = theBoundPort() ?? settings().apiPort
    /**
     * THE PROCESSES THIS WRITE READS ARE READ FIRST, without holding the thread (Windows), and the write below is
     * answered from them: the process rows of every run an earlier row's close ends, each own row's recorded process,
     * and what `registerThisServer` reads, this server's own process among them.
     */
    const theWrite = await readFirst(
      () => [
        ...[THE_API_SERVER, THE_MESSAGE_WORKER].flatMap((role) =>
          theProcessesTheEarlierOwnRowsCloseReads({ workspaceId, part: { role, port, checkout }, now }),
        ),
        ...theProcessesTheOwnRowsCloseReads({ workspaceId, now }),
        ...theProcessesRegisteringThisServerReads(workspaceId),
      ],
      () => {
        /**
         * THE ROWS THIS START REPLACES ARE CLOSED BEFORE THE NEW ONE IS FILED.
         *
         * Both roles, here, because the worker's row is the office's own too and this is the one place
         * every start runs. It runs BEFORE `registerThisServer` below, which can also reach a session
         * row through the process row it closes: the cause this start knows is `replaced`, and the row
         * must say that rather than the crash the ledger would otherwise infer. Problem `2G9jNsuJwJf4`.
         */
        const closedOwnRows: string[] = []
        for (const role of [THE_API_SERVER, THE_MESSAGE_WORKER]) {
          closedOwnRows.push(
            ...closeTheEarlierOwnRows({ workspaceId, part: { role, port, checkout }, actor, now }),
          )
        }
        if (closedOwnRows.length > 0) {
          app.log.info(
            `${String(closedOwnRows.length)} earlier row(s) of the office's own parts said they were still going; ` +
              'each now says it was replaced by this start',
          )
        }
        /**
         * AND THE ROWS WHOSE PROCESS IS GONE, WHICH NO LATER START WILL COME TO REPLACE.
         *
         * The replaced-rows close above only reaches a row when the same part starts again on the same
         * port and checkout. A browser app a check worktree started is never started again, so its row
         * said running for ever; a row killed without a word is the same shape. This reads each row's
         * recorded pid against the machine and closes the ones that are not there. It never writes
         * `crashed`: the row was found by a reading that the process is absent, not by seeing how it
         * ended. Problem `1p-pQxYe0RLB`.
         *
         * IT RUNS AFTER THE REPLACED-ROWS CLOSE, so a row a later start of the same part replaces says
         * `replaced by the start of …` — the cause this start really knows — rather than being closed as
         * gone a moment earlier. The row this start is about to file is not in the list yet.
         */
        const closedGoneRows = closeTheOwnRowsWhoseProcessIsGone({ workspaceId, actor, now })
        if (closedGoneRows.length > 0) {
          app.log.info(
            `${String(closedGoneRows.length)} row(s) of the office's own parts named a process that is gone; ` +
              'each now says so, with the pid and the time it was looked for',
          )
        }
        const filed = createRecord({
          kind: 'session',
          title: THE_API_SERVER,
          workspaceId,
          data: {
            state: 'running',
            runtime: 'mole-office',
            usageReceipt: theOwnPartUsageReceipt(THE_API_SERVER, process.env),
            startedAt: localStamp(now),
            doing: `serving the Mole Office API from ${checkout}`,
            workingDirectory: checkout,
            // THE PID AND START TIME, so a later reading can check what this row stands for instead of
            // believing the word `running`.
            extra: theOwnPartBlock(
              { role: THE_API_SERVER, port, checkout },
              process.pid,
              runtimeRecord().process.startedAt,
            ),
          },
          actor,
        })
        theServersOwnSession = filed.id
        /**
         * AND THE ADDRESS THE ENVIRONMENT NAMED GOES ON THE TRUSTED LIST. Criterion P73.
         *
         * The list of machines this office trusts is set by presses at the world's page, and the one
         * machine nobody presses for is the one the environment names and this process binds. A list
         * that did not hold it would contradict the server it belongs to: the door is open and the list
         * would say it was shut. Nothing is written when the environment names none, which is the
         * ordinary state, and a machine already on the list is left exactly as it is.
         */
        recordTheAddressTheEnvironmentNamed()
        const written = registerThisServer({ workspaceId, sessionRecordId: filed.id, actor })
        return { filed, written }
      },
    )
    const { filed, written } = theWrite
    /**
     * AND THE RUNS THIS START FOUND STOPPED ARE SAID TO HAVE STOPPED.
     *
     * `closedSessions` names the sessions whose ledger rows this start has just closed, and the
     * ledger closes a row because the process it was about has gone. Those rows still say `running`
     * because nothing outlives a process to correct what it last said. Problem `uYjxMB6JETEq`: nine
     * rows titled "The API server" and "The message worker" said running on a machine running one,
     * and the Agent runs screen read as nine live servers.
     *
     * THIS SESSION'S OWN ROW IS NEVER TOUCHED HERE, because it was filed a moment ago and its
     * process is this one.
     */
    let saidStopped = 0
    for (const earlier of written.closedSessions) {
      if (earlier === filed.id) continue
      const said = await sayHowThisSessionEnded(
        earlier,
        'crashed',
        'This run was still marked as going when a new API server started. The process it was about ' +
          'is gone and nothing wrote a state on it, so it stopped without saying how.',
      )
      if (said) saidStopped += 1
    }
    if (saidStopped > 0) {
      app.log.info(
        `${String(saidStopped)} earlier session row(s) said they were still going and their process is gone; ` +
          'each now says it stopped without finishing',
      )
    }
    // AND THE WORLD IT SERVES, AT THE OFFICE. Criterion C3 of design/messages/ACCEPTANCE.md section
    // 8. The row is already in this world's own table; this carries it to the main world so the list
    // a person reads holds every world. It is awaited rather than left running, so the line below
    // says what really happened, and it never fails the start.
    /**
     * AND A VISIT THIS WORLD IS HOLDING REACHES THE OFFICE WHEN THE OFFICE ANSWERS AGAIN.
     *
     * Criterion C8, and something has to notice the office is back. Until 4 September nothing did:
     * a held visit moved only when the NEXT visit was registered at this world. Problem
     * `vFrn8Z7VZLhD`. The timer is unref'd, so it never holds this process open, and it does one
     * SELECT when there is nothing to report.
     */
    const { keepTryingHeldVisits } = await import('./lib/visits.ts')
    keepTryingHeldVisits(undefined, undefined, (line) => app.log.info(line))
    /**
     * AND THE FLOW REMINDERS, F10 AND F13, THE OWNER'S DESIGN OF 11 SEPTEMBER 2026. One unref'd minute
     * timer that reads what is idle and what has passed its typed expected time and writes the
     * office's reminders through the one door a line Mole Office writes may use. It never holds
     * this process open and one bad tick is a line in the log; see src/server/lib/reminders.ts for
     * what each reminder carries and what is deliberately not built.
     */
    const { startTheReminders } = await import('./lib/reminders.ts')
    startTheReminders(workspaceId, (line) => app.log.info(line))
    /**
     * AND THE COUNTERS, CT3 AND CT7. A second unref'd minute timer, beside the reminders and for the
     * same reasons: it never holds this process open and one bad tick is a line in the log. It is
     * its own timer rather than a row of the reminder pass because a counter is not a reminder —
     * what it does when it fires is its own, and a tick of it can write a task or ask for a job.
     * THE FIRST TICK RUNS AT ONCE, so a trigger that fell due while the office was down fires when
     * the office is back rather than up to a minute later, and it fires once.
     */
    const { startTheCounters } = await import('./lib/counters.ts')
    startTheCounters((line) => app.log.info(line))
    /**
     * AND REMIND ME LATER. An unref'd minute timer brings each message the
     * person put off back once, at the time they chose. The time is in the database, and the first
     * tick runs at once, so a time that
     * fell due while the office was down is kept when it is back. See src/server/lib/remind-me-later.ts.
     */
    const { startBringingMessagesBack } = await import('./lib/remind-me-later.ts')
    startBringingMessagesBack((line) => app.log.info(line))
    const { startNoticeBatchClock } = await import('../holder/notice-batches.ts')
    startNoticeBatchClock((line) => app.log.info(line))
    /**
     * AND EACH PERMANENT RESIDENT'S SESSION-ORIGIN FILE. A third unref'd minute timer, for the same reasons: it never
     * holds this process open and one file that cannot be brought up to date is a line in the log. Each session of a
     * resident that started since the last line gets one line, so the file says where to find the resident
     * again, at item 4 of a decision. See src/server/lib/session-origins.ts.
     */
    const { startTheOriginWatcher } = await import('./lib/residents.ts')
    startTheOriginWatcher((line) => app.log.info(line))
    /**
     * AND EACH PERMANENT RESIDENT'S SLEEP TIME. An unref'd minute timer, for the same reasons. It begins a resident's sleep
     * when the sleep time it set opens, and ends that sleep when the time is over. See src/server/lib/sleep-windows.ts.
     */
    const { startTheSleepClock } = await import('./lib/sleep-windows.ts')
    startTheSleepClock(
      (line) => app.log.info(line),
      sleepClockEvery ?? theIntervalOfTheSleepClock(settingValue(THE_SLEEP_CLOCK_SETTING)),
    )
    /**
     * AND THE DEAD-LETTER SWEEP, ON THE SERVER'S OWN TIMER. Another unref'd
     * timer, for the same reasons. It sweeps when five minutes have passed since the last sweep, whatever the
     * worker's mode, because a worker in merges-only mode never presses the sweep. See src/server/lib/deadletters.ts.
     */
    const { startTheDeadLetterSweep } = await import('./lib/deadletters.ts')
    startTheDeadLetterSweep((line) => app.log.info(line))
    /**
     * AND THE GATE-COUNT SPOOL, where the sandbox tools count their gates without a key (wave 13r round O). A fifth
     * unref'd minute timer, in a canonical office only, so a scratch office never counts the machine's spool. See
     * src/server/lib/gate-count-spool.ts.
     */
    const { startReadingTheGateCountSpool } = await import('./lib/gate-count-spool.ts')
    const { theWorldThisProcessIsIn } = await import('./lib/world.ts')
    const theStanding = standing ?? theWorldThisProcessIsIn().standing.kind
    app.log.info(startReadingTheGateCountSpool(theStanding, (line) => app.log.info(line)).line)
    await tendTheStorageReceipts(app, theStanding)
    const { reportThisWorldToTheOffice } = await import('./lib/office.ts')
    const toldTheOffice = written.atTheOffice === null
      ? { told: false, why: 'this database has no identity, so there is no world to register' }
      : await reportThisWorldToTheOffice(written.atTheOffice)
    // KEPT SO THE DEATH CAN BE REPORTED AGAINST THE SAME ROW. The office keeps its own table, so
    // its id for this world is not the one this world knows itself by, and a close sent against the
    // wrong id would end somebody else's world. Null when nothing was told, which is the ordinary
    // case for a world that holds the office itself.
    theRowAtTheOffice = toldTheOffice.atTheOffice ?? null
    app.log.info(
      `written into the ledger: ${String(written.resources.length)} row(s) — ` +
        `${written.resources.map((one) => `${one.type} ${one.key}`).join(', ')}` +
        `${written.filledIn.length === 0 ? '' : `; ${String(written.filledIn.length)} already there and given a world`}` +
        `${written.handedBack.length === 0 ? '' : `; ${String(written.handedBack.length)} already described this process and were left as they are`}` +
        `${written.closed.length === 0 ? '' : `; ${String(written.closed.length)} closed, the process they named has gone`}`,
    )
    app.log.info(
      written.atTheOffice === null
        ? 'this world could not be registered at the office: this database has no identity'
        : `this world is registered as "${written.atTheOffice.name}" (${worldKindWord(written.atTheOffice.kind).text}); ` +
          `${toldTheOffice.told ? 'and' : 'not reported to the main world:'} ${toldTheOffice.why}`,
    )
  } catch (err) {
    app.log.warn(
      `This server could not write itself into the ledger of what is running in project "${workspaceId}" ` +
        `(${err instanceof Error ? err.message : String(err)}). It is serving normally; nothing on any list ` +
        'will say this process is here. Register it by hand with POST /api/runtime/register.',
    )
  }
}

/**
 * START THE MESSAGE WORKER, AND WRITE DOWN WHAT HAPPENED EITHER WAY.
 *
 * The worker is a separate process that delivers a message to an agent by starting a run of that
 * agent's tool. Criterion M9 of design/messages/ACCEPTANCE.md, on a decision that processes may be
 * started on this machine.
 *
 * IT IS NOT STARTED UNDER A TEST RUNNER. Fifty-two browser tests spawn a real server of their own,
 * and each one starting a worker would be fifty-two workers reading fifty-two queues. The tests
 * that are about the worker start one themselves and stop it themselves. The runtime page says in
 * plain words that there is no worker and why, so this is never a silence.
 *
 * IT NEVER STOPS THE SERVER FROM STARTING, for the same reason writing this server into the ledger
 * does not: a product that will not serve because a worker would not start is a worse outcome than
 * a queue nobody is taking, and the page says which of the two you have.
 */
async function startTheMessageWorker(app: FastifyInstance, resume = false): Promise<{ pgid: number } | null> {
  const {officePauseState}=await import('./lib/office-pause.ts')
  if(!resume && officePauseState().paused)return null
  const workspaceId = settings().workspace
  const actor = { type: 'agent', id: 'mole-office/the-api-server' } as const
  const { noteTheWorker, theWorkerLogPath, whatTheStartedWorkerSaid, whatTheStartedWorkerSays, whatTheWorkerIsStartedToDo } = await import('./lib/worker.ts')
  const { inEnglish, saying } = await import('@shared/dev-sayings.ts')
  /** A sentence about the worker in English, with the same sentence as a code for the runtime page. */
  const theWorkerSays = (said: ReturnType<typeof saying>) => ({ says: inEnglish(said), said })
  const { underATestRunner } = await import('@shared/under-a-test-runner.ts')
  const { osProbe } = await import('./lib/resources.ts')
  const faked = settingValue('MOLE_OFFICE_FAKE_RUNTIME')
  const checkout = REPO_ROOT.replace(/\/$/, '')

  // ONE READING OF THE MODE, which decides whether a worker starts and what its rows say it does. The
  // worker reads the same declaration when it starts (`workerSettingsFrom`), from the environment this
  // server hands it.
  const mode = settingValue('MOLE_OFFICE_MESSAGE_WORKER')
  const mergesOnly = mode === 'merges-only'
  if (mode === 'off') {
    noteTheWorker({
      started: false,
      ...theWorkerSays(saying('workerOff', {})),
      pid: null,
      pgid: null,
      sessionRecordId: null,
      resourceId: null,
      runsAreFaked: faked,
    })
    return null
  }

  if (underATestRunner()) {
    noteTheWorker({
      started: false,
      ...theWorkerSays(saying('workerUnderATestRunner', {})),
      pid: null,
      pgid: null,
      sessionRecordId: null,
      resourceId: null,
      runsAreFaked: faked,
    })
    return null
  }

  const probe = osProbe()
  if (probe.startTheMessageWorker === undefined) {
    noteTheWorker({
      started: false,
      ...theWorkerSays(saying('workerCannotStartAProcess', {})),
      pid: null,
      pgid: null,
      sessionRecordId: null,
      resourceId: null,
      runsAreFaked: faked,
    })
    return null
  }

  // THE ROW THIS START FILES, so a start that throws after filing it can say so on it.
  let filedId: string | null = null
  try {
    const { createRecord } = await import('./lib/records.ts')
    const { localStamp } = await import('@shared/time.ts')
    const { theOwnPartBlock, theOwnPartUsageReceipt, THE_MESSAGE_WORKER } = await import('./lib/own-rows.ts')
    const filed = createRecord({
      kind: 'session',
      title: THE_MESSAGE_WORKER,
      workspaceId,
      data: {
        state: 'running',
        runtime: 'mole-office',
        usageReceipt: theOwnPartUsageReceipt(THE_MESSAGE_WORKER, process.env),
        startedAt: localStamp(new Date()),
        doing: whatTheWorkerIsStartedToDo(mergesOnly),
        workingDirectory: checkout,
        startedByMoleOffice: true,
        // THE IDENTITY OF THE PART, so the next start can recognise this row as its predecessor.
        // The pid is filled in below, after the worker really exists: this row is filed before the
        // process is spawned, and a pid written before there is a process would be a guess.
        extra: theOwnPartBlock({ role: THE_MESSAGE_WORKER, port: theBoundPort(), checkout }, null, null),
      },
      actor,
    })
    filedId = filed.id
    theWorkersSession = filed.id
    // THE LOG PATH CARRIES THE PORT, so two stacks on one checkout keep their workers' lines apart.
    // The rule is `theWorkerLogPath` and it is written there with what it is for.
    // Under THE_WORKER_LOG_ROOT: the serving install's data root, not the paired development checkout.
    const logPath = theWorkerLogPath(THE_WORKER_LOG_ROOT, theBoundPort(), filed.id)
    const child = probe.startTheMessageWorker({
      // THE WORKER WATCHES THIS PROCESS, so it stops when this server is killed outright rather
      // than polling an address nothing answers for ever. The shutdown below stops it the ordinary
      // way; this is the half that covers a SIGKILL, where no shutdown runs.
      // THE WORKER IS TOLD THE ADDRESS THIS SERVER ANSWERS ON, not left to read the declaration:
      // in a checkout whose .env names the canonical API, a scratch server's worker would otherwise
      // deliver to the canonical one (measured 4 September 2026, tests/the-worker-delivers-a-message).
      // When the socket is not bound yet the flag is left off and the worker falls back to the
      // derived address.
      args: [
        '--session',
        filed.id,
        `--stop-with-pid=${String(process.pid)}`,
        ...(() => {
          const bound = theAddressThisProcessAnswersOn()
          return bound === null ? [] : ['--api', addressText(bound)]
        })(),
      ],
      cwd: checkout,
      logPath,
    })
    const row = await registerTheMessageWorkersProcess({ workspaceId, sessionRecordId: filed.id, pid: child.pid })
    noteTheWorker({
      started: true,
      says: whatTheStartedWorkerSays(mergesOnly, child, logPath),
      said: mergesOnly ? null : whatTheStartedWorkerSaid(child, logPath),
      pid: child.pid,
      pgid: child.pgid,
      sessionRecordId: filed.id,
      resourceId: row.id,
      runsAreFaked: faked,
    })
    /**
     * AND THE WORKER'S PID AND START TIME GO ON ITS SESSION ROW, now that there is a process to
     * name. The row was filed before the process existed, so this is the only moment the fact can
     * be written. A failure here is a line in the log: the worker is running, and that is the fact
     * the reader needs, not the state of one field.
     */
    try {
      const { patchRecord } = await import('./lib/records.ts')
      patchRecord(
        filed.id,
        {
          dataPatch: {
            extra: {
              discovered: {
                pid: child.pid,
                ...(row.osStartedAt === null ? {} : { pidStartedAt: row.osStartedAt }),
              },
            },
          },
        },
        actor,
      )
    } catch (err) {
      app.log.warn(
        `The message worker is running, but its pid could not be written on its session row ` +
          `(${err instanceof Error ? err.message : String(err)}).`,
      )
    }
    app.log.info(`the message worker is process ${String(child.pid)} in group ${String(child.pgid)}${mergesOnly ? ', in merges-only mode' : ''}`)
    return { pgid: child.pgid }
  } catch (err) {
    const because = err instanceof Error ? err.message : String(err)
    noteTheWorker({
      started: false,
      ...theWorkerSays(saying('workerDidNotStart', { because })),
      pid: null,
      pgid: null,
      sessionRecordId: null,
      resourceId: null,
      runsAreFaked: faked,
    })
    app.log.warn(`the message worker could not be started (${because}). The API is serving; nothing is taking the queue.`)
    /**
     * AND THE ROW FILED FOR IT SAYS SO. Until wave 13y round 33 it read `running` until a later
     * start on the same port and checkout replaced it, and the shutdown wrote on it that the worker
     * had stopped. `crashed` is the kind's word for stopped without finishing; the sentence says
     * the worker did not start and why, in the words this start saw.
     */
    if (filedId !== null) {
      const said = await sayHowThisSessionEnded(filedId, 'crashed', `The message worker did not start: ${because}.`)
      if (!said) app.log.warn(`The message worker's session row ${filedId} was left as it was.`)
    }
    return null
  }
}

/** The same timer wiring is exercised without a listening socket in the ended-run tests. */
export async function tendTheEndedRunsResources(app: FastifyInstance): Promise<void> {
  const { startTheEndedRunResourceTimers } = await import('./lib/resources.ts')
  endedRunResourceTimers.get(app)?.()
  const stop = startTheEndedRunResourceTimers((line) => app.log.warn(line))
  endedRunResourceTimers.set(app, stop)
}

/**
 * The storage receipt reading starts after the server listens, and Fastify refuses a hook then, so its stop is kept here
 * for the close hook buildApp added. Exported so a test can start it at canonical standing on a listening server.
 */
export async function tendTheStorageReceipts(app: FastifyInstance, standing: 'canonical' | 'scratch'): Promise<void> {
  const { startReadingStorageReceipts } = await import('./lib/storage/receipts.ts')
  storageReceiptTimers.get(app)?.()
  storageReceiptTimers.delete(app)
  const watch = startReadingStorageReceipts(standing, (line) => app.log.info(line))
  if (watch) storageReceiptTimers.set(app, () => { clearInterval(watch) })
}

/**
 * Load .env, open the database and check it is up to date, build the app and listen.
 *
 * Everything that reads the environment is in here rather than at the top of the file, so that
 * importing this module has no effect at all: no file read, no port parsed, no database opened.
 * That is what makes `buildApp` callable from a test.
 */
async function start(): Promise<void> {
  // WHAT EACH STEP OF THIS START TOOK, said in one line once it listens (lib/start-steps.ts says why).
  const steps = theStartSteps()
  steps.ended(THE_START_STEPS.theCode)
  /**
   * Read .env before anything else runs.
   *
   * Node can do this itself since v20.6, so there is no dotenv dependency. Values already set
   * in the real environment win, so `MOLE_OFFICE_PORT=9000 npm start` still works.
   *
   * The load itself is `lib/env.ts`, which `db/client.ts` also calls so that every command opening
   * a database reads the same settings. It is called HERE as well because this file needs the ports
   * before there is any question of opening a database, and it is idempotent.
   */
  const env = loadPanelEnv()

  /**
   * THE STABLE OFFICE STARTS ONLY AT A DATED TAG OF ITS OWN CLONE (src/config/stable-tag.mjs says what
   * it reads). Only a server given its development checkout is the stable office, so only it is asked.
   *
   * IT IS ASKED HERE, before anything below opens the database, takes the service lock or reads a
   * port. The sentence the owner's window shows for this refusal says their data was not touched, and
   * this place is what makes that true (tests/the-stable-office-checks-its-tag-before-the-database.test.ts).
   * It exits with its own code, as the lock's refusal does, so serve-dev does not count it as a crash.
   */
  if (THE_DEVELOPMENT_CHECKOUT !== null) {
    const tagRefusal = whyThisCheckoutIsNotAtADatedStableTag(REPO_ROOT)
    if (tagRefusal !== null) {
      console.error(tagRefusal)
      process.exit(THE_STABLE_TAG_REFUSAL_EXIT_CODE)
    }
  }

  const databaseRefusal = whyThisCheckoutMayNotOpenTheDatabase(settings().databasePath)
  // npm start names the service command after the refusal (wave 13q, part d).
  if (databaseRefusal !== null) throw Object.assign(new Error(withTheWayForThisJob(databaseRefusal)), { code: 'STABLE_OFFICE_DATABASE' })

  // A STABLE UPGRADE THAT CLOSED THIS DATABASE AND DID NOT FINISH leaves a mark beside it, and no ordinary start serves
  // it until that upgrade is resumed or rolled back (src/config/the-upgrade-mark.mjs). The start mode is never a stored
  // choice, so it is read without opening the database.
  const upgradeRefusal = whyAnUpgradeKeepsTheOfficeClosed(settings().databasePath, theStableCheckoutNamedIn(), startModeFrom(bootstrapEnvironment()))
  if (upgradeRefusal !== null) {
    console.error(upgradeRefusal)
    process.exit(1)
  }

  // A DATA FOLDER MOVE THAT IS STILL COPYING keeps the office closed, as the service command's start does.
  const moveRefusal = whyADataFolderMoveKeepsTheOfficeClosed()
  if (moveRefusal !== null) { console.error(moveRefusal); process.exit(1) }
  // A DATABASE THAT IS NOT THERE WHERE THE OFFICE HAS KEPT IT keeps the office closed too, before anything is made.
  const missingRefusal = whyAStartMayNotMakeTheDatabase(settings().databasePath)
  if (missingRefusal !== null) { console.error(missingRefusal); process.exit(1) }

  const startMode = startModeFrom(mergedEnvironment())
  if (startMode === 'release-check' || startMode === 'release-check-live') {
    await (await import('./lib/release-check.ts')).startReleaseCheck()
    return
  }
  if (!env.found) {
    const declared = settings()
    console.warn(
      `no .env file at ${env.file}; using built-in defaults (port ${String(declared.apiPort)}, ${declared.databasePath})`,
    )
  }

  /**
   * Read `--stop-with-pid` HERE, before anything is opened or any port is taken.
   *
   * It is used at the bottom of this function, where the watchdog is set up. It is READ here
   * because a mistyped pid is refused, and a refusal that arrived after the server was listening
   * would be a command that failed with a port already held.
   */
  const starter = starterPid()
  /**
   * STOP WHEN THE PROCESS THAT STARTED THIS SERVER IS GONE.
   *
   * Eight browser tests start a server detached so one signal can take it and its children. Detaching
   * also takes it out of its parent's group: if teardown is skipped, it receives nothing. Eleven were
   * left here on 18 August 2026, holding ports and databases. A parent killed with SIGKILL cannot run
   * teardown, so the server watches for itself. The separate thread asks the same process reader the
   * resource ledger uses once a second and knows the starter by its start time as well as its pid.
   *
   * This is a flag, not a setting: a pid belongs to one invocation and makes no sense in .env. It is
   * passed by the starter and visible in ps to somebody wondering why the server stopped.
   *
   * A stuck close still holds a port for a server nobody awaits. The main thread ends the process
   * after the shutdown grace, running the exit handler; the independent thread sends SIGKILL later
   * if the main thread cannot run at all.
   */
  let starterGone = false
  let onStarterGone: (() => void) | null = null
  if (starter !== null) {
    // Start before opening the database or listeners, so a later main-thread stall cannot prevent
    // the watch itself from starting. Preloads belong to the server, not to its watchdog thread.
    const { Worker } = await import('node:worker_threads')
    const entry = THE_INSTALL.from === 'bundle' ? THE_THREAD_BUNDLES[THE_STARTER_WATCH_THREAD_ENTRY] : THE_STARTER_WATCH_THREAD_ENTRY
    const watch = new Worker(join(REPO_ROOT, entry), {
      workerData: { starterWatchPid: starter },
      execArgv: [],
    })
    watch.on('message', (answer: { state: 'gone' | 'unreadable'; why?: string }) => {
      if (answer.state === 'unreadable') {
        // Could not look is not gone. The worker stands down after this one warning rather than
        // treating an unreadable process as dead or repeating a permanent failure every second.
        console.error(`--stop-with-pid=${starter}: Mole Office cannot tell whether that process is still running (${answer.why}), so this server will not stop itself.`)
        return
      }
      starterGone = true
      const lastResort = setTimeout(() => {
        console.error('The starter is gone and shutdown has not finished; ending without closing the database.')
        process.exit(0)
      }, STARTER_SHUTDOWN_GRACE_MS)
      lastResort.unref()
      onStarterGone?.()
    })
    watch.on('error', (error) => console.error(`The starter watch failed: ${error instanceof Error ? error.message : String(error)}`))
    watch.unref()
  }

  // The port, its default and the refusal all come from src/config/settings.mjs, which is the same
  // declaration vite.config.ts reads. Until 3 September 2026 this line carried its own `?? '8787'`
  // and Vite carried another; moving one moved half of `npm run dev`.
  const port = portFrom(process.env, 'MOLE_OFFICE_PORT')

  /**
   * Where the browser app is in development, for the two messages that name it.
   *
   * The server does not SERVE the app in development — Vite does — but it is the thing a lost
   * caller is talking to, so both its 404 and its startup line point at the app. They used to point
   * at 5173 in hardcoded text while MOLE_OFFICE_WEB_PORT was a documented setting, so a person who had
   * moved Vite off 5173 (because something else on this machine holds it) was sent to a dead
   * address by the only process that could have told them the right one.
   *
   * Parsed the same way as MOLE_OFFICE_PORT and refused rather than defaulted, because a message that
   * quietly falls back is exactly the message this replaces.
   */
  const remotePort = remotePortFromEnv()

  const webAppUrl = settings().webAddress

  // Loopback only. This holds a research diary; it has no login, so it must not be reachable
  // from the network.
  const host = '127.0.0.1'
  const isProduction = process.env.NODE_ENV === 'production'
  const webDir = THE_BUILT_PAGE

  /**
   * IS THERE ANYTHING TO SERVE — asked BEFORE the database is opened, not after.
   *
   * `buildApp` asks the same question, and until this line it was the only one that did. `dist/` is
   * gitignored, so a fresh clone has no built browser app, so `npm start` failed — correctly, with
   * a message naming the path and the command. But by then it had already created and migrated a
   * database, because the migration gate ran first. A command that fails is allowed to leave
   * nothing behind, and a first-run database at a path the operator has not thought about yet is
   * exactly the thing that later makes two checkouts disagree about where the work is.
   *
   * The check is cheap and it has no dependencies, so it belongs first. `missingWebBuild` is one
   * function with two callers rather than two spellings of the same sentence.
   */
  if (isProduction) {
    const missing = missingWebBuild(webDir)
    if (missing !== null) throw new Error(missing)
  }
  steps.ended(THE_START_STEPS.theSettings)

  /**
   * THE SERVICE LOCK OF THIS DATABASE, TAKEN BEFORE THE DATABASE IS OPENED OR MIGRATED.
   *
   * Criteria W1, W2(c) and W9 of design/window/ACCEPTANCE.md: one service per database, and a second
   * start finds the first rather than becoming a second. A second server must never migrate a
   * database another server serves, so this comes before the line below that first opens it — the
   * import of `api/files.ts` reaches the database client. src/config/the-service-lock.mjs says how a
   * lock is taken, when one is stale, and why two starters cannot both win.
   *
   * A REFUSAL EXITS WITH ITS OWN CODE, so whatever started this server can tell it from every other
   * ending. Nothing has been opened yet, so there is nothing to close.
   */
  const theDeclaration = settings()
  /**
   * NOTHING IS WRITTEN IN A DATA FOLDER INSIDE A GIT WORKTREE, not even the lock below. The lock and the
   * note this server writes as it ends both go in the database's folder, and the database's opener asks
   * only after both, so the folder is refused here first. src/server/lib/git-checkout.ts says why.
   */
  refuseADataFolderInAWorktree(theDeclaration.databasePath)
  const serviceLock = await takeTheServiceLockOfThisServer(
    {
      lockPath: theDeclaration.serviceLockPath,
      databasePath: theDeclaration.databasePath,
      port,
      checkout: REPO_ROOT,
      // WHO WATCHES THIS SERVER, written into the lock so that a later stop can follow the process that
      // started it instead of signalling the server's group and letting that process start a new one.
      starter,
    },
    thisSystem(),
    () => {
      steps.ended(THE_START_STEPS.theGroup)
    },
  )
  if (!serviceLock.taken) {
    console.error(serviceLock.said)
    process.exit(THE_SERVICE_LOCK_REFUSAL_EXIT_CODE)
  }
  if (serviceLock.tookOver !== null) console.log(serviceLock.tookOver)
  console.log(serviceLock.said)
  /**
   * LET IT GO ON EVERY WAY OUT THAT RUNS CODE: the end of `shutdown()` below, a refusal thrown later
   * in this function, a crash and the watchdog's exit all end in `process.exit` or an uncaught error,
   * and both emit `exit`. A SIGKILL runs nothing; the lock then names a process that has gone, and the
   * next start takes it over as stale. Only this server's own lock is deleted, told by its token.
   *
   * AND WRITE HOW IT ENDED FIRST, beside the lock (src/config/how-the-server-ended.mjs): this server's
   * token, whether a stop was asked of it and why, and its exit code. Once the lock is gone, that note
   * is the only thing that tells a server that was stopped from one that ended on its own. `shutdown()`
   * says why a stop was asked, as its first act; until then it is null.
   */
  const ourToken = serviceLock.lock.token
  const letTheLockGo = (): string => releaseTheServiceLock(theDeclaration.serviceLockPath, ourToken).said
  let theStopAskedFor: string | null = null
  process.once('exit', (code) => {
    const ended = writeHowTheServerEnded(theDeclaration.serviceLockPath, { token: ourToken, pid: process.pid, stopAskedFor: theStopAskedFor, exitCode: code })
    if (ended.written) console.log(ended.said)
    else console.error(ended.said)
    letTheLockGo()
  })
  steps.ended(THE_START_STEPS.theServiceLock)

  /**
   * And is the file preview configured in a way this server can honour.
   *
   * `configuredPreviewRoots()` throws a written, actionable refusal for a relative path or one that
   * does not resolve — and until this line it was only ever called by a request, so the refusal
   * arrived on the day somebody happened to open a record pointing at a real file. Worse, the route
   * checks that a record points at the path BEFORE it checks the roots, so the usual reply to a
   * misconfigured `MOLE_OFFICE_PREVIEW_ROOTS` was a 403 about the record, and the actual mistake
   * never surfaced at all. Measured on 2026-08-12, when the setting was spelled
   * `PANELX_PREVIEW_ROOTS`, with the value `projects/docs`.
   *
   * THE SETTING ALONE, BECAUSE THE DATABASE IS NOT OPEN YET. The roots in force also include
   * directories derived from this project's registered repositories and work areas, and reading
   * those needs the database, which this check deliberately runs before. The request path reads the
   * whole union; this checks that what the operator typed can be honoured at all.
   *
   * Called for its refusal and the result thrown away: this is a configuration check, and the
   * request path reads the variable itself. Imported dynamically like everything else below,
   * because `api/files.ts` reaches `lib/records.ts` and so opens the database — importing it at the
   * top of this file would break the promise the header makes about importing this module.
   */
  const { configuredPreviewRoots } = await import('./api/files.ts')
  configuredPreviewRoots()

  // Now that .env has been read, the database may be opened. See the file header.
  const { db, sqlite } = await import('./db/client.ts')
  // The database is open, so its place is marked as one where the office has kept it. A mark that cannot
  // be written ends the start in words, as the missing-database refusal above does.
  const markRefusal = keepTheMarkOfTheDatabase(theDeclaration.databasePath)
  if (markRefusal !== null) { console.error(markRefusal); process.exit(1) }
  steps.ended(THE_START_STEPS.openingTheDatabase)

  /**
   * THE SERVICE CLAIM IS TAKEN ONCE, HERE, before this server starts anything. `mole-office start` hands
   * the server MOLE_OFFICE_STARTED_BY; the runtime keeps what it said and takes it out of this
   * process's environment, so the message worker, agent runs and anything they start do not inherit a
   * claim to be the service (criterion W8; the review of H3). Loaded here, after the database,
   * because lib/runtime.ts reaches the database through lib/resources.ts.
   */
  ;(await import('./lib/runtime.ts')).takeTheServiceClaim()
  steps.ended(THE_START_STEPS.theServiceClaim)

  /**
   * A SERVER A TEST STARTED WITHOUT THE SUITE'S MARK IS REFUSED, before it serves or reports anything
   * (problem `mZdrckWiS8hc`). Only Linux can see that a test started it without the mark; a Mac
   * cannot, and the mark is all a Mac reads. lib/runtime.ts holds the question and the sentence.
   */
  {
    const refusal = (await import('./lib/runtime.ts')).whyATestsServerMayNotStart()
    if (refusal !== null) throw new Error(refusal)
  }
  steps.ended(THE_START_STEPS.theTestCheck)

  /**
   * Make sure the database is up to date before serving anything — WITHOUT MIGRATING IT UNASKED.
   *
   * TWO DEFECTS MEET AT THIS LINE AND IT HAS TO MISS BOTH.
   *
   * The first: this used to call drizzle's `migrate` directly, which applied the SCHEMA files under
   * ./drizzle and none of the four DATA migrations that `npm run db:migrate` also runs. A database
   * brought up to date by starting the server had a `records.origin` column with nothing in it and
   * `task.blocked_by` values in a field no write path reads. Nothing failed and nothing said so —
   * two places that must agree about what "migrated" means, with nothing making them agree.
   *
   * The second, which the fix for the first caused: `npm run dev` runs this file under `tsx watch`,
   * so EVERY SAVE OF A SERVER FILE RESTARTS IT AND RAN THE MIGRATIONS AGAIN. On 11 August a dev
   * server was left running against the live corpus overnight and the workspace migration — which
   * MOVES 394 records into three projects — ran unattended, triggered by a file save, with no backup
   * taken at that moment. Nothing was lost, by luck.
   *
   * `prepareToServe` is both fixes at once and it is stated once, in db/migrate.ts, rather than
   * here: a database that can lose nothing — nothing in it at all, or every record stamped as
   * having come from the seed, which is a fresh clone, a test's file and the database
   * tools/review.mjs photographs — is migrated in place as before, and one that holds work is
   * CHECKED against a throwaway copy and never written to. If anything is pending it refuses to
   * serve and names the command. If nothing is, it serves, quietly.
   *
   * The report is printed on every start and not only when there was work: "nothing to migrate" and
   * "nobody checked" are different facts, and the operator can only tell them apart if the quiet
   * case says something too.
   *
   * Whether this was a first run is worth saying out loud, because an empty Mole Office and a Mole Office
   * pointed at the wrong file look identical otherwise.
   */
  const tablesBefore = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as { name: string }[]
  const firstRun = !tablesBefore.some((t) => t.name === 'records')

  // THE MIGRATIONS FOLDER IS migrate.ts's, which reads it from the install's root, so a bundle finds its own.
  const { MIGRATIONS_FOLDER, prepareToServe } = await import('./db/migrate.ts')
  // THE TWO MARKER LINES tell serve-dev that this server is migrating and not stuck, so the time
  // between them does not count against its limit for a new server to answer (migration-markers.mjs).
  const { THE_MIGRATIONS_BEGIN, THE_MIGRATIONS_END } = await import('../config/migration-markers.mjs')
  console.log(THE_MIGRATIONS_BEGIN)
  // WHAT EACH PART OF THE MIGRATIONS CHECK TOOK, from the same clock as the start line (lib/start-steps.ts). It is
  // printed in the `finally`, so a check that serves, refuses or throws all leave the same line behind. Nothing in
  // the recorder or in the printing can change what the check decided or what it threw.
  const checkTiming = theMigrationsCheckTiming()
  let decision: ReturnType<typeof prepareToServe>
  try {
    decision = prepareToServe(sqlite, MIGRATIONS_FOLDER, checkTiming)
  } finally {
    console.log(THE_MIGRATIONS_END)
    try {
      console.log(theMigrationsCheckLine(checkTiming))
    } catch (notPrinted) {
      // A TIMING LINE THAT CANNOT BE PRINTED IS SAID ON STDERR, and the start goes on as the check decided. Saying it
      // is guarded too: a throw from this `finally` would replace what the check decided or threw, and stderr can fail
      // where stdout did.
      try {
        const reason = notPrinted instanceof Error && notPrinted.message !== '' ? ` (${notPrinted.message})` : ''
        console.error(`The migrations check's timing line could not be printed${reason}.`)
      } catch {
        // Stderr failed as well, or the reason could not be read. There is nowhere left to say it, so nothing is said.
      }
    }
  }
  /**
   * AN INSTALLED OFFICE OFFERS ITS OWNER "BACK UP AND UPDATE" INSTEAD OF STOPPING (round 58). Only for the
   * refusal of a database that holds work and is not up to date, and only in a bundle: a checkout keeps the
   * refusal below, and its command, word for word. Nothing is written until the owner presses; the press
   * backs up, updates and checks, and then this start goes on and the check is asked again before serving.
   * lib/the-update.ts says what the reduced mode serves meanwhile, and why the update runs here.
   */
  if (!decision.serve) {
    const { theUpdateIsOffered, waitForThePress } = await import('./lib/the-update.ts')
    if (theUpdateIsOffered(decision, THE_INSTALL.from)) {
      const { whichWorldAnswered } = await import('./lib/world.ts')
      await waitForThePress({
        sqlite,
        offer: { file: resolve(sqlite.name), holds: decision.update.holds, wouldWrite: decision.update.wouldWrite, backups: settings().backupsDirectory },
        migrationsFolder: MIGRATIONS_FOLDER,
        port,
        host,
        headers: whichWorldAnswered,
        whenAStopIsAsked: (why) => {
          theStopAskedFor = why
        },
      })
      decision = prepareToServe(sqlite, MIGRATIONS_FOLDER)
    }
  }
  // Thrown rather than logged, and thrown BEFORE `buildApp` opens anything else: a refusal that
  // went on to listen would be a server telling the truth in a line nobody reads while serving a
  // database it has just said it will not serve.
  if (!decision.serve) throw new Error(decision.refusal)
  console.log(decision.report)

  // WHO OWNS THIS OFFICE, read once from its database before anything answers a request, so that
  // `THE_PERSON` in @shared/person.ts is the owner's id for every request this process serves.
  steps.ended(THE_START_STEPS.theMigrationsCheck)
  const { theOfficeOwner } = await import('./lib/owner.ts')
  const owner = theOfficeOwner()
  console.log(
    owner.name === null
      ? `This office is owned by "${owner.id}", who has not given a name yet: the pages lead them to #/welcome.`
      : `This office is owned by "${owner.id}", named ${JSON.stringify(owner.name)}.`,
  )

  // THE GPU WATCHER IS TAKEN FROM THE READINGS THIS OFFICE ACCEPTED, once, when neither the .env line nor the setting
  // names one. Before the prune below, so it reads every reading the request log still holds. lib/gpu-watcher.ts says
  // why and how, and the line says what it did.
  const { takeTheGpuWatcherFromItsReadings } = await import('./lib/gpu-watcher.ts')
  console.log(takeTheGpuWatcherFromItsReadings())

  /**
   * PRUNE THE MEASURED TABLES ONCE, HERE, BEFORE ANYTHING LISTENS.
   *
   * Every request this server answers writes a row into `api_calls`, so the table grows for as long
   * as Mole Office runs. Two windows bound it — fourteen days for a row that named no piece of work, a
   * hundred and eighty for a whole trace — and both were published on `GET /api/usage/summary` for a
   * fortnight while NOTHING CALLED THE PRUNE: the code was written, tested and never reached, so the
   * windows the summary promised were enforced by nothing and no stretch summary would ever have
   * been written. That is worse than an unbuilt feature, because the summary said otherwise.
   *
   * AT START AND NOT ON A TIMER. One trigger, no scheduler and no second process. A server that
   * never restarts never prunes, and that is visible as the oldest row's age on the usage page
   * rather than as a surprise.
   *
   * IMPORTED HERE AND NOT AT THE TOP. `lib/usage-reads.ts` imports the database client, and this
   * file's header promises that importing it opens nothing.
   *
   * ---------------------------------------------------------------------------------------
   * THESE SIX LINES HAVE NOW BEEN DELETED TWICE, BY TWO COMMITS OF ANOTHER WAVE
   * ---------------------------------------------------------------------------------------
   *
   * d3eb699 and b016e32, both subjected to wave 15, both carrying a stale copy of `start()` over the
   * top of this one. The second deletion took this paragraph's first version with it, which said it
   * had happened once. Neither commit meant to: this function is where the second listener is being
   * built, and a whole-function replacement takes whatever else lives here.
   *
   * IF YOU ARE REWRITING `start()`: `tests/usage-prune.test.ts` reads THIS FILE'S TEXT for
   * `pruneAtStart()` and asserts it falls between `prepareToServe(` and `await app.listen(`. It is
   * the only instrument that can answer *is it called*, because every other test calls the prune
   * directly. It went red both times and both times the commit landed anyway. Run it.
   */
  const { pruneAtStart } = await import('./lib/usage-reads.ts')
  console.log(pruneAtStart().line)
  const { gateCountsBegin } = await import('./lib/gate-counts.ts')
  console.log(gateCountsBegin().line)

  const { sweepCheckWorktreesAtStart } = await import('./lib/check-worktrees.ts')
  for (const line of await sweepCheckWorktreesAtStart()) console.log(line)

  /**
   * A CREDENTIAL ALREADY CONFIRMED WHEN THIS VERSION LANDS RECEIVES ITS KEY WITHOUT A SECOND
   * CONFIRMATION. Criterion D2 rests on P83 point 4 and on a decision.
   *
   * The key a person's device holds is the token it was shown when it asked; confirming registers
   * that token's hash in `held_keys`. A credential confirmed before the confirm door learned that
   * holds no key, and asking the person to confirm it again is what that decision forbids. So the
   * pass runs here, at first start, and the line below names every key it registered rather than
   * doing it silently. It is idempotent: a key row of any standing, including a revoked one, stops
   * the pass re-issuing, so revoking a key is never undone by the next restart.
   */
  const { giveAlreadyConfirmedCredentialsTheirKeysOnce } = await import('./lib/visitors.ts')
  const keysGiven = giveAlreadyConfirmedCredentialsTheirKeysOnce()
  if (keysGiven.length > 0) {
    console.log(
      `Keys registered for ${String(keysGiven.length)} credential(s) confirmed before this version: ` +
        keysGiven.map((one) => `${one.whoseKind} ${one.whoseId}`).join(', '),
    )
  }

  // EACH START COPIES THE DEFAULT CHAPTERS THIS OFFICE HAS NEVER HELD; lib/default-regulations.ts says why and how.
  const { copyTheDefaultRegulationsOnce } = await import('./lib/default-regulations.ts')
  console.log(copyTheDefaultRegulationsOnce().line)

  // AN APPIMAGE'S OFFICE WRITES ITS SKILL'S COPY AND ITS HOOK LAUNCHER AGAIN AT EVERY START, because its skill link
  // points at that copy, its three hook lines run that launcher, and the AppImage's folder both name can be another one
  // at the next start (src/config/install-the-entry.mjs says why). Outside an AppImage it writes nothing and says
  // nothing. One that could not be written is said on the error stream, and the office still starts: the entry's press
  // says the same refusal in words.
  const { keepTheAppImagesHookLauncher, keepTheAppImagesSkillCopy, keepTheOlderHookLines, theOwnersHome } = await import('../config/install-the-entry.mjs')
  for (const kept of [await keepTheAppImagesSkillCopy(REPO_ROOT), await keepTheAppImagesHookLauncher(REPO_ROOT)]) {
    if (kept !== null) (kept.written ? console.log : console.error)(kept.line)
  }

  // AN INSTALLED OFFICE WRITES AGAIN THE HOOK LINES AND THE LOGIN UNIT AN OLDER LINUX VERSION WROTE, once the Node they
  // name is gone, because a Linux office now runs on the app's own program and the person may have no terminal to change
  // them in (`keepTheOlderHookLines` in src/config/install-the-entry.mjs, `keepTheOlderUnit` in
  // src/config/start-at-login.mjs). Where there is nothing to write again, neither writes or says anything.
  if (THE_INSTALL.from === 'bundle') {
    const { keepTheOlderUnit, theOfficeThisServerIs } = await import('../config/start-at-login.mjs')
    const home = theOwnersHome()
    for (const kept of [await keepTheOlderHookLines(REPO_ROOT, undefined, home), keepTheOlderUnit({ home, office: theOfficeThisServerIs(), checkout: REPO_ROOT })]) {
      if (kept !== null) (kept.written ? console.log : console.error)(kept.line)
    }
  }

  steps.ended(THE_START_STEPS.theFirstWrites)
  void import('./lib/attention-thread.ts').then(({ startAttentionThreadEarly }) => startAttentionThreadEarly()).catch((error: unknown) => console.error('The attention thread could not start early:', error))
  const { app, listApiRoutes, endTheWaits } = await buildApp({
    production: isProduction,
    webDir,
    webAppUrl,
    logLevel: process.env.LOG_LEVEL ?? 'info',
    remotePort,
  })
  steps.ended(THE_START_STEPS.theRoutes)

  // THE WORDS OF EACH ROLE CARD BECOME A RECORD THE PERSON MAY CHANGE, filed once per card from the cards
  // `buildApp` has just read. A card that has ever had one is not touched. lib/card-words.ts says why and how.
  {
    const { fileTheCardWordsOnce } = await import('./lib/card-words.ts')
    const { theCommitTheCardWordsComeFrom } = await import('./lib/role-cards-at-start.ts')
    console.log(fileTheCardWordsOnce(theCommitTheCardWordsComeFrom()).line)
  }
  steps.ended(THE_START_STEPS.theCardWords)

  // A MOVED OFFICE ENDS THE ROWS ITS FORMER PLACE LEFT, so its first reply can say it moved. The lib file says what it reads.
  {
    const { endTheRowsAFormerPlaceLeft } = await import('./lib/a-moved-office-ends-its-former-rows.ts')
    const said = await endTheRowsAFormerPlaceLeft({ workspaceId: settings().workspace, port, actor: { type: 'agent', id: 'mole-office/the-api-server' } })
    if (said !== null) (said.ok ? console.log : console.error)(said.line)
  }
  steps.ended(THE_START_STEPS.theFormerRows)

  /**
   * Take the port, and if something else has it, say so in Mole Office's own words.
   *
   * Node's own message is `Error: listen EADDRINUSE: address already in use 127.0.0.1:8787` under a
   * stack trace, which names neither this product nor what to do — and this is the commonest daily
   * failure there is, because the usual cause is a Mole Office that is already running, or one that was
   * orphaned and is still holding the port. troubleshooting.md has the recipe; nothing pointed
   * anybody at it from here.
   */
  /**
   * THE SOCKET THE DEV SUPERVISOR HOLDS, WHEN IT HANDED ONE OVER (problem `xGeC_iM6jxYl`).
   *
   * tools/serve-dev.mjs opens 127.0.0.1:<port> once and keeps it open across restarts, so a request
   * made while one server stops and the next starts waits in the socket's queue instead of being
   * refused. `holdThePort` there says why. This server listens on that descriptor rather than
   * opening the port itself. Read once and taken out of the environment, so nothing this server
   * starts is told about a descriptor it does not have.
   *
   * THE ADDRESS IS CHECKED AFTER, because a descriptor is not an address: a socket that was never
   * bound listens on a port the kernel picks, and this server would then answer somewhere nobody
   * asks. Anything but the declared host and port stops the start, in words.
   */
  /**
   * THE SLEEP CLOCK'S INTERVAL, READ BEFORE THE SOCKET. The clock itself starts after the socket, in
   * `writeThisServerIntoTheLedger` and inside its try, which steps over a failure. Read here, a value the setting
   * cannot mean throws before the server answers, as the setting's own sentence says, and the start stops.
   */
  const sleepClockEvery = theIntervalOfTheSleepClock(settingValue(THE_SLEEP_CLOCK_SETTING))
  const listenFd = takeTheListeningDescriptor()
  try {
    if (listenFd === null) {
      await app.listen({ port, host })
    } else {
      const fd = Number(listenFd)
      if (!Number.isInteger(fd) || fd < 3) {
        throw new Error(`MOLE_OFFICE_LISTEN_FD is "${listenFd}", and it must be a file descriptor of 3 or more. This server did not start.`)
      }
      // Fastify hands these options to node's own `server.listen`, which takes `fd` before `port`.
      await app.listen({ fd, host } as unknown as { port: number; host: string })
      const got = app.server.address()
      if (got === null || typeof got === 'string' || got.address !== host || got.port !== port) {
        throw new Error(
          `The socket the dev supervisor handed over as descriptor ${String(fd)} answers on ` +
            `${got === null ? 'no address' : typeof got === 'string' ? got : `${got.address}:${String(got.port)}`}, ` +
            `not ${host}:${String(port)}. This server did not start.`,
        )
      }
    }
    // WHAT THIS PROCESS REALLY BOUND, written down by the one line that binds it, and read off the
    // socket rather than off the `port` above. `GET /api/health` asks whether a throwaway is
    // answering on the address the declaration calls the real one, and `GET /api/runtime` says
    // which address it answers on at all; only a socket can answer either. A server built for a
    // test and driven with `inject` reaches this file's `buildApp` and never this line, so it stays
    // null and both readers say so. lib/bound-address.ts holds it.
    rememberWhatThisProcessBound(app.server)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err
    /**
     * ONE SUPERVISOR PER PORT, AND THE REFUSAL SAYS WHOSE THE PORT IS.
     *
     * Vite already refuses a port it cannot have — `strictPort` in vite.config.ts, with the reason
     * beside it. This half refused too, but it could only say that something was there. Criterion
     * G5 of design/ground/ACCEPTANCE.md asks it to say WHO: four `tsx watch` supervisors raced for
     * one port in a single session on 2 September 2026 and the port changed hands three times, and
     * "something else is listening" is the same sentence whichever of the four you are.
     *
     * The ledger is asked, not the machine, because the ledger is what can name a session. A port
     * nobody registered gets the sentence below and nothing more, which is honest: it is exactly
     * the state that has cost this project days.
     */
    let holder = ''
    try {
      const { registrationOfPort } = await import('./lib/resources.ts')
      const row = registrationOfPort(port)
      if (row !== null) {
        const world = row.entry.world
        holder =
          `\n\nThat port is registered to ${row.session.title ?? row.session.recordId}` +
          (row.session.ended === true ? ', whose session has ended' : '') +
          (world === null
            ? ', and the row does not record which world it serves.'
            : `, serving ${world.database} from ${world.repository}` +
              `${world.head === null ? '' : ` at ${world.head}`} (${world.standing.kind}).`) +
          `\nAsk it what it is: GET http://${host}:${port}/api/runtime`
      }
    } catch {
      // The ledger could not be asked — most likely this server never opened its database, which is
      // the case when the refusal happens before the migration gate. The sentence below still holds.
    }
    throw new Error(
      // NOT "nothing has been changed", which is what this said first and was not true: the
      // database has already been opened by this point — which creates the -wal file — and a
      // database that holds nothing anybody would miss has already been migrated in place, as the
      // migration report printed above says. The refusal above this one may make that claim
      // because it is made before any of that; this one may not.
      `MOLE_OFFICE_PORT is ${port} and something else is already listening on ${host}:${port}, so this server did ` +
        `not start. Whatever the migration report above says was done, was done; nothing else was.\n\n` +
        `  See what holds it:   ss -ltnp | grep :${port}\n` +
        `  If it is an old Mole Office, stop it by process GROUP (an orphan survives killing the pid):\n` +
        `                       kill -- -$(ps -o pgid= -p <pid> | tr -d ' ')\n` +
        `  To run a second one: MOLE_OFFICE_PORT=<another port> npm run dev\n\n` +
        `A Mole Office already serving this database is the likely answer, and it is not a problem — ` +
        `http://${host}:${port}/api/runtime says which checkout, which database and which commit it is ` +
        `serving, and who registered it.` +
        holder,
      { cause: err },
    )
  }
  steps.ended(THE_START_STEPS.theSocket)
  console.log(steps.line())

  /**
   * THE SECOND LISTENER, AND IT IS ON LOOPBACK TOO.
   *
   * ---------------------------------------------------------------------------------------
   * THE BIND ADDRESS NEVER CHANGES, AND THAT IS THE WHOLE ARRANGEMENT
   * ---------------------------------------------------------------------------------------
   *
   * `const host = '127.0.0.1'` above still holds for both. Nothing on the house network, nothing on
   * the office network and nothing on `docker0` can reach either of them, before or after this.
   * What reaches the second one is `tailscaled`, which the owner points at it with one command, and
   * any process on this machine that chooses to.
   *
   * A LOCAL PROCESS REACHING THE SECOND LISTENER GETS LESS AUTHORITY, NOT MORE, so nothing is lost
   * by that being possible — and it is what lets the whole of the authority model be driven and
   * proved on one machine, before anything is reachable from anywhere.
   *
   * ---------------------------------------------------------------------------------------
   * ABSENT MEANS OFF, AND ABSENT IS THE STATE EVERY INSTALLATION IS IN
   * ---------------------------------------------------------------------------------------
   *
   * There is no default port. Turning this on is naming a number in `.env`. A default would be
   * Mole Office deciding to listen for other machines because nobody said not to.
   */
  const otherMachines = remotePort === null ? null : await listenForOtherMachines(app, remotePort, host)
  if (otherMachines !== null) app.log.info(whatTheSecondListenerSays(otherMachines))

  /**
   * AND THE OTHER WAY TO REACH THIS COMPUTER FROM ANOTHER ONE: THE ADDRESS ITSELF, BOUND DIRECTLY.
   *
   * `MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES` names it and unset means off, which is the state every
   * installation is in. Nothing is passed through by anything, so what can reach this listener is
   * exactly what can reach that address — a private network's, when that is the address you give it.
   *
   * A SCRATCH STACK STAYS ON 127.0.0.1, and it stays there without anybody remembering to say so:
   * a test, a worktree or a throwaway database gets this listener only if its OWN environment names
   * an address, and none of them does. The `.env` of a checkout a scratch server is started from
   * would name one — so a test that starts a server proves the socket, not the intention.
   *
   * THE ADDRESS IS READ OFF THE SOCKET FOR THE LOG LINE, not off the setting, as the second
   * listener's line above is and as `lib/bound-address.ts` does for the first listener.
   */
  const forOtherMachines = settings().otherMachines
  /**
   * A DOOR THAT WILL NOT OPEN STOPS THIS SERVER, and it says so in Mole Office's own words.
   *
   * That is the whole reason the runtime record may report the declared address as the address other
   * machines reach this one at: there is no state in which this process is answering AND the address
   * its settings name is not bound. Carrying on without the door would put the product in exactly
   * that state — a page saying it is reachable from another machine while nothing is listening —
   * which is the shape of every fault this cluster exists to remove.
   *
   * The message is Mole Office's rather than Node's for the reason the port message above is: the
   * commonest cause is a name that does not resolve or an address this computer does not have, and
   * `Error: listen EADDRNOTAVAIL` under a stack trace names neither the setting nor what to do.
   */
  const theAddressDoor =
    forOtherMachines === null
      ? null
      : await serveTheAddressForOtherMachines(app, port, forOtherMachines.host).catch((err: unknown) => {
          throw new Error(
            `MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES is ${forOtherMachines.host}, and this computer could not ` +
              `listen on ${forOtherMachines.host} port ${String(port)}: ` +
              `${err instanceof Error ? err.message : String(err)}. ` +
              'Either that name or address is not one this computer has, or something else is already on that ' +
              'port there. Fix it in .env, or delete the line, which means nothing is served to another machine. ' +
              'This server is NOT running: it will not answer on 127.0.0.1 while claiming an address it never took.',
            { cause: err },
          )
        })
  if (theAddressDoor !== null && forOtherMachines !== null) {
    const bound = theAddressDoor.address()
    const took = bound === null || typeof bound === 'string' ? forOtherMachines.host : bound.address
    app.log.info(
      `other machines: also listening on ${took} port ${String(port)}, which is what ` +
        `MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES names — same app, and a request through it is stamped as coming ` +
        `from another machine unless it comes from one of this computer's own addresses. The browser app for them ` +
        `is ${forOtherMachines.webAddress}.`,
    )
  }

  const count = liveRecordCount(db)
  // The path ABSOLUTE, not as configured. `./data/panelx.db` is a different file depending on where
  // the process was started, and this line is the one place an operator can find out which one this
  // is — so it must not be the answer that needs a second question. The version leads it, so a
  // tester's log says which build they ran (decision sKPFWjOuQVEe).
  app.log.info(
    `Mole Office ${theVersion() ?? '(version not recorded in this bundle)'} API on http://${host}:${port} — database ${resolve(sqlite.name)}`,
  )
  // Said on every start because it is the answer to "what can I call?", and the person or agent
  // reading this line is the one asking.
  app.log.info(
    `${listApiRoutes().length} endpoints — GET http://${host}:${port}/api lists them, GET /api/kinds says what goes in a record`,
  )
  if (firstRun) {
    app.log.info(
      'first run: the database was empty, the tables have just been created, and there is nothing recorded yet',
    )
  } else {
    app.log.info(`${count} record${count === 1 ? '' : 's'} stored`)
  }
  // In production this process serves the app itself, so the address is this one. It used to name
  // the DIRECTORY the files came from, which is true and is not what the reader wants: development
  // mode handed you a URL to open and production handed you a path on disk.
  app.log.info(
    isProduction
      ? `browser app on http://${host}:${port} — served from ${webDir}`
      : `development mode: Vite serves the browser app on ${webAppUrl}`,
  )

  /**
   * THIS SERVER WRITES ITSELF INTO THE LEDGER OF WHAT IS RUNNING, ONCE, HERE.
   *
   * ---------------------------------------------------------------------------------------
   * WHY, MEASURED
   * ---------------------------------------------------------------------------------------
   *
   * Problem `1urksZld8CQQ`. Act 1 of section 4 of design/ground/ACCEPTANCE.md asks for the canonical
   * server and the canonical browser app both registered and both saying the same world. On the
   * owner's own stack on 4 September 2026 only the browser app's row carried one: the Vite plugin
   * registers itself every time Vite starts, and nothing registered the API. Its row had been
   * written by an agent through `POST /api/resources` before servers could say anything about
   * themselves, and nothing rewrites an existing row.
   *
   * AFTER THE SOCKET, so the ports written down are the ports it is really holding rather than the
   * ports it was told to take. `registerThisServer` reads the listening sockets.
   *
   * IT NEVER STOPS THE SERVER FROM STARTING. A server that will not start because the ledger is
   * down is a worse outcome than an unregistered process, and it is the rule the Vite plugin and
   * tests/helpers.ts already follow: every failure here is printed and stepped over.
   */
  await writeThisServerIntoTheLedger(app, undefined, sleepClockEvery)

  // R7aRhbpnKrRO, inspector wK2To2zvH02U: a bad resource delay is the watcher's failure.
  // Start it outside the ledger's try so the ledger and world report keep their own outcome.
  try {
    await tendTheEndedRunsResources(app)
  } catch (err) {
    app.log.warn(`The ended-run resource watcher could not start: ${err instanceof Error ? err.message : String(err)}`)
  }

  // THE MINUTE READING OF THE OFFICE'S OWN READ TIME, CPU AND MEMORY. Here, with the other
  // timers of a serving server, so a test that builds the app without listening takes no readings it did not ask for.
  {
    const { startTheLoadReadings } = await import('./lib/office-load.ts')
    loadReadingTimers.set(app, startTheLoadReadings((line) => app.log.warn(line)))
  }

  // AND THE WORKER THAT TAKES THE MESSAGE QUEUE. After the ledger, so it is registered under a
  // server that is already on the list, and never under a test runner.
  let theWorker = await startTheMessageWorker(app)

  // AND THE HOST JOB RUNNER, in a process group of its own, filed under this server's own session, while a host tool
  // is registered (src/server/lib/host-job-runner.ts). Like the worker, never under a test runner.
  const theHostJobRunner = await (async () => {
    const { keepTheHostJobRunner } = await import('./lib/host-job-runner.ts')
    const bound = theAddressThisProcessAnswersOn()
    return keepTheHostJobRunner({
      workspaceId: settings().workspace,
      sessionRecordId: theServersOwnSession,
      api: bound === null ? null : addressText(bound),
      checkout: REPO_ROOT,
      say: (line) => app.log.warn(line),
    })
  })()

  // AND THE TERMINAL HOLDER, if one runs for this database. The service command started it; this
  // server only records it in the ledger. It never stops the server from starting.
  {
    const { recordTheHolderAtStart } = await import('./lib/terminals.ts')
    await recordTheHolderAtStart(app.log)
  }

  /**
   * ONE WAY OUT, WITH TWO THINGS THAT CAN ASK FOR IT.
   *
   * The SQLite file is closed on the way out so the write-ahead log is checkpointed rather than
   * left for the next start to recover. Both the signals below and the watchdog further down want
   * exactly that, so it is written once here rather than once each.
   */
  let stopping = false
  const shutdown = async (why: string, how: { andTheHolder?: boolean } = {}): Promise<void> => {
    if (stopping) return
    stopping = true
    theStopAskedFor = why
    app.log.info(`${why}, shutting down`)
    /**
     * EVERY LISTENER STOPS TAKING READS FIRST, and answers what it holds while the rest of the stop
     * runs (message n5g0uTda98in). Until round 6f of wave 13x the local listener was closed
     * last, after the office was told, the worker was stopped and the session rows were written. On a
     * loaded machine those steps took longer than serve-dev waited, so this server went on taking
     * reads it never answered, and serve-dev's kill reset them: 3 of 3 runs of case 4 of
     * tests/the-office-answers-while-it-restarts.test.ts at load 46-75. A read still in the socket's
     * queue now waits there for the next server.
     */
    const drained = Promise.all([app.server, otherMachines, theAddressDoor].map((one) => (one === null ? null : drain(one))))
    const waits = endTheWaits()
    process.stdout.write(`shutdown: this server takes no new reads, ended the ${String(waits)} held open on purpose, and answers the rest for at most ${String(SHUTDOWN_CONNECTION_GRACE_MS / 1000)}s.\n`)
    let step = 'starting'
    const waitingOn = (next: string): void => {
      step = next
      app.log.info(`shutdown: ${step}`)
    }
    const limitMs = Number(readSetting('MOLE_OFFICE_TEST_SHUTDOWN_LIMIT_MS', process.env).value ?? SHUTDOWN_LIMIT_MS)
    const deadline = setTimeout(() => {
      app.log.error(`shutdown: the ${limitMs} ms limit expired while ${step}; exiting with unfinished work`)
      process.exit(1)
    }, limitMs)
    try {
      /**
       * THE SECOND LISTENER IS CLOSED FIRST, AND BEFORE THE APP.
       *
       * `app.close()` closes only the server Fastify built. Without this line the second listener
       * would keep accepting connections and keep handing them to an instance that is closing and a
       * database that is about to close, and the symptom is an occasional unexplained error on the
       * other machine during a restart — the hardest kind of thing to diagnose from somewhere else.
       */
      /**
       * AND THE OFFICE IS TOLD THIS WORLD HAS ENDED, before anything else is closed.
       *
       * A world that reported its birth and never its death is a row that lives for ever, and nine of
       * them were sitting in the owner's office when this was written — problem `JTdajUUs23_M`. The
       * report is one try with a short timeout and it never holds the shutdown up: an office that is
       * not answering is exactly the case `tools/close-worlds-nobody-serves.mjs` exists for.
       */
      if (theRowAtTheOffice !== null) {
        waitingOn('reporting this world has ended')
        const { reportThisWorldsDeathToTheOffice } = await import('./lib/office.ts')
        const said = await reportThisWorldsDeathToTheOffice(theRowAtTheOffice, why)
        app.log.info(said.told ? `the office was told this world has ended: ${said.why}` : `the office was not told this world has ended: ${said.why}`)
      }
      /**
       * AND THE WORKER THIS SERVER STARTED, BY THE GROUP ID IT WROTE DOWN.
       *
       * By the group, so the worker and anything still inside its group go together, and by the id
       * recorded at the moment it was started rather than by anything matched against a command
       * line — chapter 2 rule 1 of the office regulations, written after a builder's pattern match
       * killed the owner's own API.
       *
       * THE RUNS ARE NOT KILLED WITH IT. Each run is registered under its own session and is a
       * person's to stop; ending them because the server is restarting would throw away work nobody
       * asked to throw away.
       */
      if (theWorker !== null) {
        waitingOn('stopping the message worker')
        try {
          const { askAProcessGroupToStop } = await import('./lib/resources.ts')
          // The shutdown door stops the worker before it pauses the runs (criterion W6), so it may be gone.
          if (await theMessageWorkerHasStopped(theWorker.pgid)) {
            app.log.info(`the message worker in group ${String(theWorker.pgid)} had already stopped`)
          } else {
            await askAProcessGroupToStop(theWorker.pgid)
            app.log.info(`the message worker in group ${String(theWorker.pgid)} was asked to stop`)
          }
        } catch (err) {
          app.log.warn(`the message worker in group ${String(theWorker.pgid)} could not be signalled: ${String(err)}`)
        }
      }
      // AND THE HOST JOB RUNNER, by the group recorded at its start. It ends a tool that is running by that tool's own
      // group and keeps its answer for the next runner, since no listener takes it by now.
      waitingOn('stopping the host job runner')
      await theHostJobRunner.stop()
      /**
       * AND THE TWO SESSION ROWS THIS PROCESS FILED SAY HOW THEY ENDED.
       *
       * Nothing else can say it: a session record holds whatever it last said about itself, and a
       * process that stops writes nothing. Until 5 September 2026 these rows read `running` for ever
       * and the Agent runs screen read as several servers going on a machine running one. Problem
       * `uYjxMB6JETEq`.
       *
       * THE WORKER'S ROW TOO, because this is what stops it: the signal above went to its group, and
       * this process is the only one that knows both that it asked and which row to say it on.
       *
       * WRITTEN BEFORE THE DATABASE IS CLOSED, and it never holds the stop up — a row that cannot be
       * written is a line in the log and the server still goes.
       */
      waitingOn('writing the session rows')
      for (const [id, what] of [
        [theServersOwnSession, 'The API server'],
        [theWorkersSession, 'The message worker'],
      ] as const) {
        if (id === null) continue
        const said = await sayHowThisSessionEnded(id, 'finished', `${what} stopped: ${why}.`)
        app.log.info(said ? `${what}'s session row says it finished` : `${what}'s session row was left as it was`)
      }
      // THE READS ALREADY TAKEN ARE ANSWERED BEFORE THE APP AND THE DATABASE CLOSE, because they need both.
      waitingOn('answering the reads this server had already taken')
      const answered = (await drained).filter((one) => one !== null)
      const took = Math.max(0, ...answered.map((one) => one.took))
      const unanswered = answered.reduce((sum, one) => sum + one.endedUnanswered, 0)
      process.stdout.write(unanswered === 0
        ? `shutdown: every read this server had taken was answered, ${String(took)} ms after it stopped taking reads.\n`
        : `shutdown: ${String(unanswered)} connection(s) were still open ${String(SHUTDOWN_CONNECTION_GRACE_MS / 1000)}s after this server stopped taking reads, and were ended unanswered.\n`)
      waitingOn('closing the app')
      await app.close()
      // A SEARCH THREAD STILL LOADING IS STOPPED ONLY ONCE IT HAS LOADED, and the app's close does not wait for that
      // (lib/search-thread.ts). The exit below would stop it at once, which ends the process with a fatal error.
      waitingOn('stopping the search thread once it has loaded')
      const { theSearchThreadsHaveStopped } = await import('./lib/search-thread.ts')
      await theSearchThreadsHaveStopped()
      waitingOn('closing the database')
      sqlite.close()
      clearTimeout(deadline)
      /**
       * AND THE TERMINAL HOLDER, WHEN THE OWNER SHUT THE OFFICE DOWN, as the stop command ends it and with the stop
       * command's own function, which says what it did on this server's output. The window hands its Shut down to
       * this door, and before this way out ended the holder, that press left it running. Outside the limit above:
       * that function waits for the holder by its own limit. A restart keeps the holder, as before. On a signal this
       * server keeps it too: the stop command that sent the signal ends the holder itself once this server has gone.
       *
       * BEFORE THE LOCK GOES, so a start made the moment the lock is gone never finds the holder this server is
       * ending, and the window, which waits for the lock to go, then asks the stop command what is left
       * (src/desktop/what-the-shut-down-left.mjs). A holder left running is a warning that says why, and this
       * server then exits with the stop command's code for it, not 0.
       */
      let theHolderWasLeft: { code: number; warning: string } | null = null
      if (how.andTheHolder === true) {
        waitingOn('ending the terminal holder')
        const { endTheTerminalHolder, theShutDownLeftTheHolderWords } = await import('../config/the-service-command.mjs')
        const said: string[] = []
        const code = await endTheTerminalHolder({ databasePath: settings().databasePath }, (line) => {
          said.push(line)
          process.stdout.write(`${line}\n`)
        })
        if (code !== 0) theHolderWasLeft = { code, warning: theShutDownLeftTheHolderWords(said.join(' ')) }
      }
      // THE LOCK LAST, once the database is closed, so a server started the moment it is gone never
      // finds this one still writing.
      waitingOn('letting the service lock go')
      app.log.info(`shutdown: ${letTheLockGo()}`)
      if (theHolderWasLeft !== null) {
        app.log.warn(theHolderWasLeft.warning)
        process.exit(theHolderWasLeft.code)
      }
      app.log.info('shutdown: finished')
      process.exit(0)
    } catch (error) {
      app.log.error({ err: error }, `shutdown: failed while ${step}`)
      process.exit(1)
    }
  }

  /**
   * AND THE SHUTDOWN DOOR'S WAY OUT (criterion W6, src/server/lib/pausing.ts).
   *
   * The door pauses the runs at work before the server goes, and it cannot reach the worker's group
   * or this one way out by itself, so they are handed to it here. The worker is stopped by the group
   * recorded when it was started, and waited for, because a worker still running would write
   * `crashed` over a run the door has just paused. A worker that will not stop is a refusal: the door
   * then pauses nothing.
   */
  const { askTheMessageWorkerToStop, thisServerShutsDownWith } = await import('./lib/pausing.ts')
  const { installRestartManager } = await import('./lib/office-restart-manager.ts')
  await installRestartManager(theServersOwnSession, settings().workspace)
  // THE DATA FOLDER DOOR'S WAYS, handed to it once this server knows its own session and project. Without a session there
  // is no ledger row to file the mover under, so the door is given none and both presses refuse in their own words.
  const { thisOfficeMovesItsDataFolderWith, theRealWaysToMove } = await import('./api/data-folder.ts')
  thisOfficeMovesItsDataFolderWith(
    theServersOwnSession === null ? null : theRealWaysToMove(theServersOwnSession, settings().workspace),
  )
  const { PanelError } = await import('./lib/panel-error.ts')
  const stopTheWorker = async () => {
      if (theWorker === null) return 'No message worker was running, so there was none to stop.'
      if (await theMessageWorkerHasStopped(theWorker.pgid)) return `The message worker in group ${String(theWorker.pgid)} had already stopped.`
      await askTheMessageWorkerToStop(theWorker.pgid)
      for (let i = 0; i < 50; i += 1) {
        await new Promise((done) => setTimeout(done, 100))
        if (await theMessageWorkerHasStopped(theWorker.pgid)) return `The message worker in group ${String(theWorker.pgid)} was stopped.`
      }
      throw new PanelError(
        `The message worker in group ${String(theWorker.pgid)} was asked to stop and is still running five seconds later, ` +
          'so no run was paused and Mole Office was not shut down. A worker still running would write over a pause.',
        409,
      )
    }
  thisServerShutsDownWith({
    stopTheWorker,
    shutDown: (why) => {
      if (process.connected) process.send?.({ officeControl: 'pause' })
      void shutdown(why, { andTheHolder: true })
    },
  })

  const {thisOfficePausesWith}=await import('./lib/office-pause.ts')
  thisOfficePausesWith({stopWorker:stopTheWorker,startWorker:async()=>{
    if(theWorker!==null && !(await theMessageWorkerHasStopped(theWorker.pgid)))return 'The message worker is already running.'
    theWorker=await startTheMessageWorker(app,true)
    if(theWorker===null && settingValue('MOLE_OFFICE_MESSAGE_WORKER')!=='off')throw new PanelError('The message worker did not start. The office remains paused.',503,undefined,undefined,undefined,{code:'officePauseNotReady',values:{reason:'The message worker did not start. The office remains paused.'}})
    return theWorker===null?'The configured message worker is off. No worker was started.':'The message worker started. Paused runs still wait for their usual press.'
  }})

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void shutdown(`${signal} received`)
    })
  }
  // ON WINDOWS THERE IS NO SIGTERM, so a stop asked of this server comes as a request on its group's pipe and is heard
  // here. On Linux and the Mac this listens for nothing: SIGTERM above is the request.
  const { listenForAStopRequest } = await import('./lib/resources.ts')
  listenForAStopRequest(() => {
    void shutdown('a stop request received')
  }, (sentence) => {
    app.log.warn(sentence)
  })

  // A starter that died during startup is remembered until shutdown is ready. The independent
  // watch also enforces the deadline if this thread cannot run the shutdown callback.
  onStarterGone = () => { void shutdown(`the process that started this server (pid ${starter}) is gone`) }
  if (starterGone) onStarterGone()
}

/**
 * THE SECOND LISTENER'S PORT, OUT OF `.env`, OR NULL BECAUSE THERE IS NOT ONE.
 *
 * ---------------------------------------------------------------------------------------
 * UNSET AND BLANK ARE DIFFERENT FACTS
 * ---------------------------------------------------------------------------------------
 *
 * Unset is off, and nobody who has not set a variable has made a mistake — it is the state every
 * installation of Mole Office is in. Present and blank is a mistake, and it is refused rather than read
 * as absence, which is the same rule `MOLE_OFFICE_PORT` already has in this file and in `vite.config.ts`.
 * The comment in `vite.config.ts` records what it cost the one time only half of a pair fell back: a
 * scratch checkout's browser app proxied to the live corpus and could have written to it.
 *
 * THERE IS NO DEFAULT. Turning this on is naming a number.
 */
export function remotePortFromEnv(): number | null {
  // Declared in src/config/settings.mjs with no default, which is what makes absence mean off. The
  // name and the default are the declaration's; the two refusals below stay here because they say
  // what turning this on means, which is this file's subject rather than the declaration's.
  const raw = readSetting('MOLE_OFFICE_REMOTE_PORT', process.env).value
  if (raw === null) return null
  if (raw.trim() === '') {
    throw new Error(
      'MOLE_OFFICE_REMOTE_PORT is set to an empty value in .env, and an empty setting is not a port. Give it a ' +
        'number to let other machines reach Mole Office, or delete the line to keep Mole Office to this machine — ' +
        'those are different things and this cannot guess which you meant.',
    )
  }
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`MOLE_OFFICE_REMOTE_PORT is "${raw}", which is not a port number. Fix it in .env, or delete the line.`)
  }
  return port
}

/**
 * OPEN THE SECOND DOOR: one more listener, the same app, and every request through it stamped as
 * having come from another machine.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A PLAIN NODE SERVER AND NOT A SECOND FASTIFY
 * ---------------------------------------------------------------------------------------
 *
 * `app.routing` is Fastify's own request handler. Handing a raw request to it puts that request
 * through exactly the same routes, hooks, guards and error handling as one that arrived on the
 * first listener — there is one app and one set of rules, and a second Fastify instance would be a
 * second set that could come to disagree with the first.
 *
 * ---------------------------------------------------------------------------------------
 * THE STAMP IS WRITTEN HERE AND NOWHERE ELSE, BEFORE ANY ROUTING HAPPENS
 * ---------------------------------------------------------------------------------------
 *
 * `stampArrival` is the only thing that writes the arrival, and each listener calls it with its own
 * word. A caller cannot set it: headers arrive as strings in `req.headers` and this is a
 * symbol-keyed property on the raw request object, written by our own code before Fastify has seen
 * it. That is the one fact the authority model is allowed to read, and it is why.
 *
 * ---------------------------------------------------------------------------------------
 * AND THEN IT CHECKS WHAT IT ACTUALLY BOUND, BECAUSE A COMMENT IS NOT A CHECK
 * ---------------------------------------------------------------------------------------
 *
 * A wider bind puts this research diary on the house network, which is exactly what the line above
 * `const host` says must never happen. Asking the socket what it bound costs nothing and it is the
 * only way to know. The refusal says what was bound, why it is wrong, and that nothing is being
 * served for other machines.
 */
export async function listenForOtherMachines(
  app: FastifyInstance,
  port: number,
  host: string,
): Promise<Server> {
  // A proxy on this computer: this door is on 127.0.0.1 and the thing at the other end of the socket
  // is the daemon that carried the request, never the machine that made it.
  const server = await aDoorForOtherMachines(app, port, host, 'a proxy on this computer')

  /**
   * WHAT IT BOUND IS ASKED OF THE SOCKET, AND THE TEST IS LOOPBACK RATHER THAN "WHAT WAS ASKED FOR".
   *
   * Comparing the bound address against the `host` argument would pass anything a caller asked for,
   * including `0.0.0.0` — which is the one outcome this check exists to stop. The rule is a property
   * of the listener and not of the call: the second door is on loopback or it is not open.
   */
  const bound = server.address()
  if (bound === null || typeof bound === 'string' || !isLoopback(bound.address)) {
    await drain(server)
    throw new Error(
      `The listener for other machines bound ${JSON.stringify(bound)}, which is not this computer. It must be on ` +
        `loopback: the private network reaches it from there, and a wider bind puts this research diary on the ` +
        `house network. Nothing is being served for other machines and the local server is unaffected.`,
    )
  }
  return server
}

/**
 * The second listener's startup line, with the address read off its socket.
 *
 * It names what the socket took, not the host and port it was asked for (problem 2QCiuBNESHbk), so
 * the line cannot name a port nothing listens on. listenForOtherMachines has already refused a
 * socket with no host and port, so a server without one here is a broken assumption and throws.
 *
 * @param otherMachines the second listener, already listening
 */
export function whatTheSecondListenerSays(otherMachines: Server): string {
  const bound = otherMachines.address()
  if (bound === null || typeof bound === 'string') {
    throw new Error(`The listener for other machines reports no host and port: ${JSON.stringify(bound)}.`)
  }
  return (
    `other machines: a second listener on ${addressText({ host: bound.address, port: bound.port })} — same app, ` +
    'and every request through it is stamped as coming from another machine'
  )
}

/**
 * OPEN THE THIRD DOOR: the address other machines reach this computer at, bound directly.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS THE SAME DOOR AS THE SECOND ONE WITH A DIFFERENT ADDRESS AND A DIFFERENT SOCKET RULE
 * ---------------------------------------------------------------------------------------
 *
 * Same app and same routing, so another machine that comes through here is refused exactly what a
 * machine that comes through the second door is refused. What differs is whose address the socket
 * carries: nothing stands between this door and the caller, so `req.ip` is the caller.
 * `stampArrival` takes that as its second word and `callerAddressOf` reads it. And because the
 * socket's address is the caller's, a connection from one of this computer's own addresses is
 * stamped this machine, as a decision says. `aDoorForOtherMachines` below
 * says how.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE CHECK IS THAT IT DID NOT BIND EVERY ADDRESS
 * ---------------------------------------------------------------------------------------
 *
 * The second door's rule — loopback or nothing — cannot be this one's, because binding an address
 * that is not loopback is the entire point. The rule that still holds, and the only one that
 * matters, is that it must not have bound EVERY address: that is what would put a research diary
 * with no login on the house network. `src/config/settings.mjs` refuses the four spellings of it
 * before anything is bound, and this asks the socket afterwards, because a refusal in a declaration
 * is not a reading of what happened.
 */
export async function serveTheAddressForOtherMachines(
  app: FastifyInstance,
  port: number,
  host: string,
): Promise<Server> {
  const server = await aDoorForOtherMachines(app, port, host, 'the caller')
  const bound = server.address()
  if (bound === null || typeof bound === 'string' || isEveryAddress(bound.address)) {
    await drain(server)
    throw new Error(
      `The listener on the address for other machines bound ${JSON.stringify(bound)}, which is every address this ` +
        `computer has rather than the one MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES names. Mole Office has no login, so ` +
        `it will not serve on all of them. Nothing is being served for other machines and the local server is ` +
        `unaffected.`,
    )
  }
  return server
}

/** Every address this computer has, in the two spellings a socket reports it in. */
function isEveryAddress(address: string): boolean {
  return address === '0.0.0.0' || address === '::'
}

/**
 * The part both doors for other machines share: one Node server handing raw requests to the one
 * Fastify app, stamped before any routing happens, listening or refusing. The stamp is another
 * machine, except on the door bound directly for a connection from one of this computer's own
 * addresses, which is this machine.
 *
 * What it does NOT do is check what it bound. That rule is different for the two doors — loopback
 * for the one a daemon passes requests through, not-every-address for the one bound directly — and
 * each caller states its own, so that neither can be read off the other.
 */
async function aDoorForOtherMachines(
  app: FastifyInstance,
  port: number,
  host: string,
  socketCarries: 'the caller' | 'a proxy on this computer',
): Promise<Server> {
  const { stampArrival } = await import('./lib/http.ts')
  const { anAddressOfThisMachine } = await import('./lib/machines.ts')
  const server = createServer((raw, res) => {
    /**
     * WHICH MACHINE ASKED. On the door bound directly, the socket's own
     * address is the caller's, so a connection from one of this machine's own addresses is this
     * machine: that is the owner opening the office at this machine's tailnet address.
     *
     * THE PROXY DOOR NEVER DOES THIS. Its socket's address is the daemon that carried the request,
     * and the caller's address is only in a forwarded header, which the caller could have written.
     * An address in a header never makes a caller this machine, so every request through that door
     * stays another machine.
     */
    const arrival =
      socketCarries === 'the caller' && anAddressOfThisMachine(raw.socket.remoteAddress)
        ? 'this machine'
        : 'another machine'
    stampArrival(raw, arrival, socketCarries)
    app.routing(raw, res)
  })
  await new Promise<void>((ok, fail) => {
    server.once('error', fail)
    server.listen({ port, host }, () => {
      server.removeListener('error', fail)
      ok()
    })
  })
  return server
}


/**
 * The pid named by `--stop-with-pid=<pid>` on the command line, or null when it was not given.
 *
 * Refused rather than ignored when it is not a number: a caller that meant to be watched and
 * mistyped the pid would otherwise get a server that never stops, which is the exact fault the
 * flag exists to prevent.
 */
function starterPid(): number | null {
  const flag = '--stop-with-pid='
  const given = process.argv.find((arg) => arg.startsWith(flag))
  if (given === undefined) return null
  const pid = Number(given.slice(flag.length))
  if (!Number.isInteger(pid) || pid < 1) {
    throw new Error(`${given} does not name a process id. Write --stop-with-pid=<pid>, or leave it off.`)
  }
  return pid
}

/**
 * Whether this file was RUN, rather than imported by something else.
 *
 * `npm start` and `npm run dev:server` both hand this path to tsx as the script to execute, so
 * `process.argv[1]` is this file and the server starts. A test that imports this module to call
 * `buildApp` is not the script being executed, so nothing starts and no port is taken -- which is
 * the whole point of the split above.
 *
 * The comparison is `isTheProgramRun` in src/config/settings.mjs: by path, then by real path,
 * because `realpathSync` throws on a path that is not on disk and argv[1] is not guaranteed to be
 * one under every runner. Inside a bundle it compares argv[1] with the server's bundle instead.
 */
function startedDirectly(): boolean {
  // The one rule, which also holds inside a bundle: src/config/settings.mjs `isTheProgramRun`.
  return isTheProgramRun(import.meta.url, THE_SERVER_ENTRY)
}

if (startedDirectly()) {
  await start()
}
