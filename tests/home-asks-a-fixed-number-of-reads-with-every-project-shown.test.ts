// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Criterion change (wave 13y round 175, as decided): Home asks the people and packages of the project on screen.
// Home's progress card draws a table of the project's lines, read once on the first view from
// GET /api/projects/<project>/people-and-packages, so that door's operation joins HOMES_OWN_OPERATIONS. So Home asks
// 12 doors once each, the list's fixed reads at 11 projects are 30, its rows of Home's own are 15, and HOMES_OWN_READS
// is 34. No check changes.
// Before, 11 doors, 29 fixed reads, 14 rows and 33, and the card read only the backlog progress.
// Criterion change (wave 13s round 281, decisions OQR0WDVq0FkP and M1ngfatGQcwn, F2): Home asks
// no read of the runs serving its agents.
// RUNS_SERVING_THE_AGENTS_READS is 0, so HOMES_OWN_READS is one less. Home reads the run serving each agent from the
// roster's rows, which already hand the server each active agent's open runs. Case 1 keeps its checks, and its reason
// is now that a page that went back to asking those runs in slices would ask them more than once here.
// Before, Home could ask the runs serving the first project's agents once, as one read of the project.
// Criterion change (wave 13s round 281, decision OQR0WDVq0FkP): Home asks one door
// for the pipelines that stand still.
// Home's reads of the pipelines and of the blocks, two asks of the records list, become one ask of
// GET /api/pipelines/standing-still, whose operation joins HOMES_OWN_OPERATIONS. So Home asks 11 doors once each, the
// list's fixed reads at 11 projects are 29, its rows of Home's own are 14, and HOMES_OWN_READS is 33.
// Before, 12 doors, 30 fixed reads, 15 rows and 34, the pipelines and the blocks counted as two doors.
// Criterion change (wave 13s round 281, decision OQR0WDVq0FkP): case 4's reason
// is the reading of "into memory"; its check is unchanged.
/**
 * HOME'S FIRST VIEW ASKS A FIXED NUMBER OF READS WITH EVERY PROJECT SHOWN, AND NONE OF THEM ASKS FOR A WHOLE KIND OF
 * RECORDS. Wave 13s round 281, package HD, point HD-2e: Home never freezes.
 *
 * WHAT THIS FILE HOLDS. Home is opened in a fresh browser, from a blank page, on a made-up office with the live office's
 * number of projects. Nothing is kept in the browser, so Home shows every project together. Every request to the API
 * is kept from the blank page until Home has drawn each project's bar and no request has been open for QUIET_MS. Then:
 *   1. Home's own reads are at most HOMES_OWN_READS, and its reads of the runs serving the agents are at most
 *      RUNS_SERVING_THE_AGENTS_READS, which is none.
 *   2. All the reads, Home's own and the frame's, are at most ALL_READS.
 *   3. No read asks the records list for a whole kind or a whole project.
 * A first case holds that the office is the one those numbers are written for.
 *
 * WHICH PROJECT IS ON SCREEN. A browser that has never chosen a project opens on the listed project holding the most
 * records, ties by id (`theProjectToOpenOn` in src/web/lib/workspace.ts). Here that is the build's first project, the
 * default one: it holds every agent record, most of the runs and about five in six of every other kind but messages
 * (tests/the-office-at-the-live-scale.ts). So `onScreen` is DEFAULT_WORKSPACE. The `workspace` given to liveApp names
 * only the project the server files its own rows in, and keeps nothing in the browser. The frame asks the ranked
 * attention for the project on screen alone, so had the page opened on another project, the first case would find none
 * asked for the default project and say so.
 *
 * WHERE THE NUMBERS COME FROM. A list of the first view's reads was made from the code: 15 rows of Home's own and 23 of
 * the frame's, the frame being main.tsx, App.tsx and the sidebar and chat panel it draws on every page. Seven of the
 * frame's rows were added after a run of this file asked 23 frame reads where the list had 16; the code says why each
 * is asked. Each number below names the rows it counts. A number does not grow with records, rows, agents or messages.
 * The reads Home asks once for each project are counted at the live office's 11 projects.
 *
 * HOW THE COUNT GROWS WITH PROJECTS. The roster is asked once for each project, so Home's own reads grow by one for each
 * project. The runs serving a project's agents are read from its roster's rows, so they add no read. Every other read
 * is asked once whatever the number of projects.
 *
 * WHICH READS ARE HOME'S OWN, by the operation the server's route declares (src/shared/ops.ts): the doors in
 * HOMES_OWN_OPERATIONS. Two of them are asked by the frame too, and the frame's ask is told apart by its query: the
 * ranked attention of the project on screen is the frame's, and Home asks the other projects' in a shape of their own;
 * a checklist read that names an owner is the sidebar's.
 *
 * THE WHOLE-KIND READ. The code keeps no list of the doors that read a whole kind. It says it of one door: the records
 * list "answers every live record" it is asked for (the comments beside `record.list` in src/shared/ops.ts), one kind of
 * the project with `kind`, or the whole project without, unless the ask names a page with `limit`, at most
 * RECORD_LIST_MAX_LIMIT rows, or the records it wants with `ids` (`listQuery` and RECORD_LIST_NOTE in
 * src/server/api/records.ts). So a read of that door that names neither is a whole-kind read here. Decision
 * OQR0WDVq0FkP gives the reason: such a read pulls every live record of a kind, or of the project, into the server, and
 * Home draws only some rows of each list it asks. The door is found by its operation in the server's own route table,
 * never by its address. The two words are asked of the door before the page opens: it answers each, and refuses a word
 * it does not take, so a word it stopped taking is caught.
 *
 * THE OFFICE IS MADE UP: a tenth of THE_LIVE_OFFICE_ON_13_NOVEMBER in tests/the-office-at-the-live-scale.ts, which
 * keeps its 11 projects. A tenth keeps more active agents in the first project than one read of the runs serving them
 * takes, DOING_ASKED_AT_ONCE. So a page that went back to asking that read once for each slice of the agents would ask
 * it more than once here, and the second case would see it. The first case holds that, and that the first project's
 * alarms name a run: the page asked that read only for a project whose alarms name one.
 *
 * ONE RUN IS MADE TO HAVE STOPPED SHORT. The build writes every run as finished, so no alarm named a run and Home never
 * asked the read of the runs; a run of this file showed it. So the setup sets the newest finished run of the first
 * project to A_RUN_THAT_STOPPED, a state of the run kind that the attention rule reads as stopped short
 * (`theWorkHasStoppedShort` in src/shared/work.ts). The rule reads every live record of the project, so that run is an
 * alarm, and the first case holds that the first project's alarms name it. No row is added, and only that run changes.
 *
 * NOT A TIMING TEST. It counts the reads and times none of them;
 * tests/home-answers-within-a-second-at-the-live-size.test.ts times Home's own, in the timing group. No run of this
 * file is cited as proof.
 *
 * WHAT THIS FILE DOES NOT CATCH.
 *   - A read the browser joins to the same read still in flight (`request` in src/web/api.ts). It is one request, so it
 *     is counted once, as tests/a-page-load-asks-attention-twice-whatever-the-projects.test.ts says.
 *   - A door that reads a whole kind on the server when its address does not show it. The timing file counts the rows
 *     Home's own doors hand the server; this file sees only the address.
 *   - The participants list is asked a page at a time, and its pages grow with participants. It is counted as this
 *     office asks it.
 *   - Every read after the first view: the minute's reads again, and what a press or a scroll asks.
 */
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Page, Request } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ApiRoute } from '../src/shared/api-route.ts'
import type { OperationName } from '../src/shared/ops.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { RecordKind, SessionState } from '../src/shared/types.ts'
import type { AttentionHomeReply } from '../src/server/lib/attention-shapes.ts'
import type { HomeRoster } from '../src/server/lib/working.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, liveApp, TEST_DATABASE_PREFIX, waitForThePage, type LiveApp } from './helpers.ts'
import { buildTheOfficeAtAScale, oneIn, THE_LIVE_OFFICE_ON_13_NOVEMBER } from './the-office-at-the-live-scale.ts'

/** The made-up office is one in this many of the live office's rows, with its projects kept. */
const ONE_IN = 10

/** The live office's projects on 13 November. The reads asked once for each project are counted at this many. */
const PROJECTS = 11

/**
 * HOME'S OWN READS ON ITS FIRST VIEW, AT MOST. The list of the first view's reads counts a fixed 30 at 11 projects, the
 * first three lines below, and beside them the reads of the Needs you rows and of the runs serving the agents:
 *   - 12 doors asked once each: the projects, the pipelines standing still, the layout, the key items, the checklists,
 *     the decisions figure, the other projects' attention, today's plan, the progress, the people and packages of the
 *     project on screen, the pause and the residents;
 *   - 7 days of the week, one read each, a number fixed in the code;
 *   - 11 rosters, one for each project;
 *   - 4 reads of the records of Needs you rows: at most NEEDS_SHOWN, 2, rows, each read at most twice, the second time
 *     for its second level;
 *   - RUNS_SERVING_THE_AGENTS_READS, 0, reads of the runs serving the agents.
 * That last number is 0 because each roster's rows name the run serving each agent, and Home reads it from them. The
 * roster has already handed the server those runs, so a read of them would hand the server the same runs again
 * (decision OQR0WDVq0FkP).
 */
const RUNS_SERVING_THE_AGENTS_READS = 0
const HOMES_OWN_READS = 12 + 7 + PROJECTS + 4 + RUNS_SERVING_THE_AGENTS_READS

/**
 * THE FRAME'S READS ON THE FIRST VIEW, from the same list: the ranked attention of the project on screen, the waiting
 * list, the person's words, the owner, the participants, the circle, the forced messages, the offers, the sidebar, the
 * plugins, the reviews, the marks, the comments, the first entry, the event stream and its state; and, from the seven
 * rows added after a run, the page's words, the sidebar's pins and the count of reports, asked before the app loads
 * (src/web/main.tsx), the office's own participant row, asked there too, the machine, asked by the frame's check of
 * which office it is on (src/web/components/WrongWorld.tsx), the checklists the sidebar shows while Checklists is pinned,
 * which it is when nothing is kept (SHIPPED_PINS in src/shared/sidebar-pins.ts), and the picture of the closed chat's
 * circle (src/web/components/Chat.tsx). The participants are counted as one page; the list says their pages grow with
 * participants.
 */
const FRAMES_READS = 23

/** ALL THE READS OF THE FIRST VIEW, AT MOST: Home's own and the frame's 23, as the list counts them. */
const ALL_READS = HOMES_OWN_READS + FRAMES_READS

/** How long no request is open, and none is started, before the first view counts as over, in milliseconds. */
const QUIET_MS = 1_500

/** How long the first view may take to be drawn and to fall quiet before the file says it did not, in milliseconds. */
const THE_VIEW_WITHIN_MS = 300_000

/** The records list. Typed by the closed list of operations, so a renamed operation stops the type check. */
const THE_RECORD_LIST: OperationName = 'record.list'

/**
 * THE TWO WORDS THAT NARROW THE RECORDS LIST to fewer than a whole kind: a page, and the records named. The door's query
 * (`listQuery` in src/server/api/records.ts) is not exported, so the door is asked with each word before the page opens.
 */
const NARROWINGS = ['limit', 'ids'] as const

/** A word the records list does not take. The door's query is strict, so it refuses it; a word it answers is one it takes. */
const NOT_A_NARROWING = 'a-word-the-records-list-does-not-take'

/** The status of an answer, and of a refusal of a query the door does not take. */
const ANSWERED = 200
const REFUSED = 400

/** The ranked attention, which the frame asks for the project on screen and Home for the other projects. */
const THE_ATTENTION: OperationName = 'project.attention'

/** The shape Home asks the other projects' attention in (src/server/api/queries.ts). */
const OTHER_PROJECTS = 'other-projects'

/** The checklists, which Home asks for every project and the sidebar asks for its pinned lists with an owner. */
const THE_CHECKLISTS: OperationName = 'checklist.list'

/** The roster, which Home asks once for each project. */
const THE_ROSTER: OperationName = 'project.who-is-working'

/** The roster's query word that names the agents whose runs are asked. Home no longer asks it: its roster rows name them. */
const DOING = 'doing'

/** A run, as its kind is stored. */
const A_RUN: RecordKind = 'session'

/** The state every run of the build is written with. */
const A_FINISHED_RUN: SessionState = 'finished'

/** The state one run of the first project is set to: a state of the run kind the attention rule reads as stopped short. */
const A_RUN_THAT_STOPPED: SessionState = 'crashed'

/** The doors of Home's own reads, by the rows of the list. */
const HOMES_OWN_OPERATIONS: readonly OperationName[] = [
  'project.workspaces',
  'pipeline.standing-still',
  THE_RECORD_LIST,
  'record.read',
  'office.home-layout',
  'key-items.list',
  THE_CHECKLISTS,
  'figures.my-decisions',
  THE_ATTENTION,
  THE_ROSTER,
  'plan.week',
  'backlog.progress',
  'project.people-and-packages',
  'office.pause-state',
  'resident.list',
]

interface Asked {
  method: string
  path: string
  query: URLSearchParams
  project: string | null
  /** The operation of the route that answers it, or null when no route of the server's table fits it. */
  operation: OperationName | null
  request: Request
}

let app: LiveApp
let remove: () => void = () => {}
let routes: readonly ApiRoute[] = []
let doingAtOnce = 0
let onScreen = ''
/** The run the setup made to have stopped short. */
let stoppedRun = ''
/** What the records list answered to each narrowing word, and to a word it does not take. */
const answered: Record<string, number> = {}
let asked: Asked[] = []
let barsDrawn = 0

/**
 * The route that answers a request, as the router chooses one: the same method, the same number of segments, each
 * `:name` segment fitting any one, and of those that fit, the one with the most fixed segments.
 */
function theRouteOf(method: string, path: string): ApiRoute | null {
  const parts = path.split('/')
  let best: { route: ApiRoute; fixed: number } | null = null
  for (const route of routes) {
    const pattern = route.path.split('/')
    if (route.method !== method || pattern.length !== parts.length) continue
    const fixed = pattern.filter((one, i) => one === parts[i]).length
    const fits = pattern.every((one, i) => one === parts[i] || one.startsWith(':'))
    if (fits && (best === null || fixed > best.fixed)) best = { route, fixed }
  }
  return best?.route ?? null
}

/**
 * Opens Home from a blank page and keeps every request to the API until Home has drawn each project's bar and no
 * request has been open, or been started, for QUIET_MS. A request the server holds open on purpose, the event stream,
 * is kept and counted, and is not waited for.
 */
async function theFirstView(page: Page): Promise<Asked[]> {
  await page.goto('about:blank')
  const kept: Asked[] = []
  const open = new Set<Request>()
  let lastMove = Date.now()
  const onRequest = (request: Request): void => {
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/api/')) return
    const route = theRouteOf(request.method(), url.pathname)
    kept.push({
      method: request.method(),
      path: url.pathname,
      query: url.searchParams,
      project: request.headers()['x-mole-office-workspace'] ?? null,
      operation: route?.operation ?? null,
      request,
    })
    if (route?.waits !== true) open.add(request)
    lastMove = Date.now()
  }
  const onEnd = (request: Request): void => {
    if (open.delete(request)) lastMove = Date.now()
  }
  page.on('request', onRequest)
  page.on('requestfinished', onEnd)
  page.on('requestfailed', onEnd)
  try {
    await page.goto(`${app.site}/?first-view=${String(Date.now())}&lang=en#/`, { timeout: THE_VIEW_WITHIN_MS })
    await waitForThePage(page, THE_VIEW_WITHIN_MS)
    // EVERY PROJECT'S BAR IS COUNTED, which waits for its roster and its attention.
    await page.waitForFunction(() => {
      const bars = Array.from(document.querySelectorAll('[data-home-bar]'))
      return bars.length > 0 && bars.every((one) => one.getAttribute('data-bar-read') === 'yes')
    }, undefined, { timeout: THE_VIEW_WITHIN_MS })
    const until = Date.now() + THE_VIEW_WITHIN_MS
    while (open.size > 0 || Date.now() - lastMove < QUIET_MS) {
      if (Date.now() > until) throw new Error(`the first view did not fall quiet; still open: ${[...open].map((one) => one.url()).join(' ')}`)
      await page.waitForTimeout(100)
    }
    barsDrawn = await page.locator('[data-home-bar]').count()
  } finally {
    page.removeListener('request', onRequest)
    page.removeListener('requestfinished', onEnd)
    page.removeListener('requestfailed', onEnd)
  }
  return kept
}

/** Whether a read is Home's own, by its door and, for the two doors the frame asks too, by its query. */
function isHomesOwn(one: Asked): boolean {
  if (one.operation === null || !HOMES_OWN_OPERATIONS.includes(one.operation)) return false
  if (one.operation === THE_ATTENTION) return one.query.get('shape') === OTHER_PROJECTS
  if (one.operation === THE_CHECKLISTS) return !one.query.has('owner')
  return true
}

/** A read, as a failure lists it. */
function named(one: Asked): string {
  const query = one.query.toString()
  return `${one.operation ?? '(no route fits)'} ${one.method} ${one.path}${query === '' ? '' : `?${query}`}`
}

beforeAll(async () => {
  const t = await freshDb()
  const sqlite = t.client.sqlite
  doingAtOnce = (await import('../src/shared/working.ts')).DOING_ASKED_AT_ONCE
  onScreen = (await import('../src/shared/workspaces.ts')).DEFAULT_WORKSPACE
  buildTheOfficeAtAScale(sqlite, THE_TEST_OFFICES_OWNER.id, oneIn(THE_LIVE_OFFICE_ON_13_NOVEMBER, ONE_IN), new Date())
  // ONE RUN STOPPED SHORT: the newest finished run of the first project, so an alarm names a run there.
  const newest = sqlite
    .prepare(
      `select id from records where kind = ? and workspace_id = ? and deleted_at is null and json_extract(data, '$.state') = ?
       order by created_at desc, id desc limit 1`,
    )
    .get(A_RUN, onScreen, A_FINISHED_RUN) as { id: string } | undefined
  if (newest === undefined) throw new Error(`the made-up office holds no ${A_FINISHED_RUN} run in ${onScreen}`)
  stoppedRun = newest.id
  sqlite.prepare(`update records set data = json_set(data, '$.state', ?) where id = ?`).run(A_RUN_THAT_STOPPED, stoppedRun)
  // RECORDS WRITTEN BY SQL HAVE NO REVISION YET, and a server refuses a database a migration would still write to.
  const { migrateInPlace } = await import('../src/server/db/migrate.ts')
  migrateInPlace(sqlite)

  // THE SERVER'S OWN ROUTE TABLE, and the records list asked with each narrowing word and with one it does not take.
  const built = await apiApp()
  await built.app.ready()
  routes = [...built.listApiRoutes()]
  const list = routes.find((one) => one.method === 'GET' && one.operation === THE_RECORD_LIST)
  if (list === undefined) throw new Error(`no GET route of the server declares ${THE_RECORD_LIST}`)
  const someRecord = (sqlite.prepare(`select id from records where deleted_at is null limit 1`).get() as { id: string }).id
  const asPerson = { 'x-mole-office-workspace': onScreen, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
  const aValueFor: Record<(typeof NARROWINGS)[number], string> = { limit: '1', ids: someRecord }
  const asks: [string, string][] = [...Object.entries(aValueFor), [NOT_A_NARROWING, '1']]
  for (const [word, value] of asks) {
    const reply = await built.app.inject({ method: 'GET', url: `${list.path}?${new URLSearchParams({ [word]: value }).toString()}`, headers: asPerson })
    answered[word] = reply.statusCode
  }
  await built.app.close()

  // THE FILE OUTLIVES THE CONNECTION: everything is folded into the main file before it is copied.
  sqlite.pragma('wal_checkpoint(TRUNCATE)')
  const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}home-first-view-reads-`)
  remove = () => rmSync(dir, { recursive: true, force: true })
  const file = join(dir, 'panelx.db')
  copyFileSync(t.file, file)
  t.close()

  app = await liveApp({ name: 'home-first-view-reads', viewport: { width: 1440, height: 1000 }, workspace: onScreen, database: file })
  asked = await theFirstView(app.page)
}, 1_200_000)

afterAll(async () => {
  await app?.stop()
  remove()
}, 60_000)

describe("Home's first view with every project shown", () => {
  it('is drawn on the office the numbers are written for', async () => {
    expect(barsDrawn, 'one bar for each project of the live office').toBe(PROJECTS)
    const roster = asked.find((one) => one.operation === THE_ROSTER && one.project === onScreen && !one.query.has(DOING))
    if (roster === undefined) throw new Error(`no roster was asked for ${onScreen}: ${asked.map(named).join(' | ')}`)
    const rows = ((await (await roster.request.response())?.json()) as HomeRoster).rows.length
    expect(rows, 'the first project holds more active agents than one read of the runs serving them takes').toBeGreaterThan(doingAtOnce)
    const attention = asked.find((one) => one.operation === THE_ATTENTION && one.project === onScreen && one.query.get('shape') !== OTHER_PROJECTS)
    if (attention === undefined) throw new Error(`no ranked attention was asked for ${onScreen}: ${asked.map(named).join(' | ')}`)
    const alarms = ((await (await attention.request.response())?.json()) as AttentionHomeReply).alarms.sessionIds
    expect(alarms, 'the first project\'s alarms name the run the setup stopped, so a page asking the runs would ask them here').toContain(stoppedRun)
  }, 60_000)

  it(`asks at most ${String(HOMES_OWN_READS)} reads of its own, ${String(RUNS_SERVING_THE_AGENTS_READS)} of them of the runs serving the agents`, () => {
    const own = asked.filter(isHomesOwn)
    expect(own.length, own.map(named).join('\n')).toBeLessThanOrEqual(HOMES_OWN_READS)
    // THAT READ ALONE, because the other rows leave room under HOMES_OWN_READS: an ask of it could hide there.
    const runs = own.filter((one) => one.operation === THE_ROSTER && one.query.has(DOING))
    expect(runs.length, runs.map(named).join('\n')).toBeLessThanOrEqual(RUNS_SERVING_THE_AGENTS_READS)
  })

  it(`asks at most ${String(ALL_READS)} reads in all, its own and the frame's`, () => {
    expect(asked.length, asked.map(named).join('\n')).toBeLessThanOrEqual(ALL_READS)
  })

  it('asks the records list for no whole kind and no whole project', () => {
    for (const word of NARROWINGS) expect(answered[word], `the records list answers ${word}`).toBe(ANSWERED)
    expect(answered[NOT_A_NARROWING], 'the records list refuses a word it does not take').toBe(REFUSED)
    const whole = asked.filter((one) => one.operation === THE_RECORD_LIST && NARROWINGS.every((word) => !one.query.has(word)))
    expect(whole.map(named), 'a read of the records list that names no page and no records').toEqual([])
  })
})
