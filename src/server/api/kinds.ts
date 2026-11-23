// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Discovery: what this API is, and what belongs inside a record.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * An agent was asked to record a project's history through this API. It managed the writes in
 * a fifth of a second and still called the exercise a failure:
 *
 *   "It would not skip because writing is slow. It would skip because it cannot find out what
 *    to write. GET /api, /api/schema and /api/kinds are all 404. So I read about 1200 lines of
 *    source to learn that a pipeline's blocks are stored under 'steps'."
 *
 * Two separate holes, and this file fills both:
 *
 *   GET /api             -- what endpoints exist. Built from the routes this server actually
 *                           registered, so it cannot list one that is gone or hide one that is
 *                           new. Until now a wrong /api path answered "No such endpoint" and
 *                           nothing else, which tells a caller it is lost but not where to go.
 *   GET /api/kinds       -- every record kind: what it is for, when to record one, every field
 *                           with its type and whether it is required, the cross-field rules in
 *                           English, and a complete example of that kind's `data` to copy. An
 *                           example is the DATA and not a whole request, which matters for one
 *                           kind: `block` declares an example and still refuses a bare POST, and
 *                           its own `whenToRecord` says so and names the route to use instead.
 *   GET /api/kinds/:kind -- one kind, plus the nested shapes its fields mention, followed
 *                           through: ask for `module` and you get SummaryBlock, the five variants
 *                           it can be, and what a ChartSpec contains. A SummaryBlock is a piece of
 *                           a module's curated summary and is NOT the record kind `block`, which is
 *                           a step of a pipeline; the word carries both meanings and always has.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING ABOUT A KIND IS TYPED HERE
 * ---------------------------------------------------------------------------------------
 *
 * Every sentence this endpoint serves about a field comes out of KIND_SPECS in
 * src/shared/kinds.ts -- the same object `validateData` checks writes against. That is the
 * whole point: documentation kept beside the checker can describe a field the checker refuses,
 * and then the docs are worse than nothing because they are believed.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE AN ENDPOINT'S OWN SENTENCE LIVES
 * ---------------------------------------------------------------------------------------
 *
 * Two places, and the direction of travel is from the second to the first.
 *
 *   1. BESIDE THE ROUTE. A route may carry `config: { note: '...' }`. Fastify hands `config` to
 *      the onRoute hook untouched, so `trackApiRoutes` collects the sentence at the moment the
 *      endpoint becomes real, in the same statement that declared it. api/presentation.ts,
 *      api/export.ts, api/import.ts and the checklist-append route in api/records.ts do this, and
 *      every new route group should.
 *   2. ROUTE_NOTES and DERIVED_ROUTE_NOTES below, keyed by "METHOD /path", for the route groups
 *      that predate that channel -- discovery, records, links, queries, sessions, resources and
 *      source -- plus GET /api/health, which buildApp declares inline rather than in a plugin.
 *
 * The second is the defect this repository names as its own -- two places that must agree, with
 * nothing making them agree -- and it has already cost the product once: eight /api/presentation
 * endpoints shipped answering GET /api with `description: null`, because adding a route group is
 * one edit here and a second edit in a file the author was not in. The first has no second place
 * to forget, which is why a route note that can move should move.
 *
 * An endpoint must have ONE of the two and not both. `endpointsDescribedTwice` is the check, and
 * tests/server-surface.test.ts runs it over the whole registered surface.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE MUST NOT REACH THE DATABASE
 * ---------------------------------------------------------------------------------------
 *
 * It imports from src/shared/ and from fastify, and nothing else. The schema is what you read
 * when the rest is not working, so a database that will not open must not be able to take it
 * down with it. It also means these routes can be registered in a test with no database at
 * all, which is why tests/kinds-api.test.ts can check the served bytes rather than the object.
 */

import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify'
import {
  KIND_SPECS,
  SHAPE_SPECS,
  describeKinds,
  suggestKey,
  type KindSpec,
  type ShapeSpec,
} from '@shared/kinds.ts'
import { isOperationName, LIVE_OPERATIONS, type OperationName } from '@shared/ops.ts'
import { isReach, REACHES, type Reach } from '@shared/reach.ts'
import { WHY_REFUSED, type KeptHere } from '@shared/authority.ts'
import { ACTOR_HEADERS, WORKSPACE_HEADER, type ActorHeaderName } from '@shared/request-headers.ts'
import { ACTOR_TYPES, LINK_TYPES, RECORD_KINDS, type LinkType, type RecordKind } from '@shared/types.ts'
import { DEFAULT_WORKSPACE } from '@shared/workspaces.ts'
import { firstSentenceOf } from '@shared/onboarding.ts'
import { THE_PROSE_CAP_SENTENCE } from '@shared/prose-cap.ts'
import { ASK_FIRST_SENTENCE } from '@shared/ask-first.ts'
import { ATTENTION_PART_ROWS, FULL_ATTENTION_PARTS, REPORTS_SHOWN } from '@shared/attention-first-page.ts'
import type { ApiRoute } from '@shared/api-route.ts'
import { route } from '../lib/route.ts'

// ============================================================================ the route table

/** One endpoint, as the router holds it. It lives in src/shared/api-route.ts, so the checks in src/server/lib/ can name it. */
export type { ApiRoute }

/**
 * Drop a trailing slash, because `/api` and `/api/` are one endpoint and not two.
 *
 * Fastify registers both spellings for a route declared as `/` inside a prefixed plugin
 * (`prefixTrailingSlash` defaults to `'both'`), so without this the index would list its own
 * front door twice.
 */
function normalisePath(url: string): string {
  return url.length > 1 && url.endsWith('/') ? url.slice(0, -1) : url
}

/** Sort by path, then by method, so the list reads the same on every request. */
function byPathThenMethod(a: ApiRoute, b: ApiRoute): number {
  return a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)
}

/**
 * The sentence a route declared beside itself, out of the `config` Fastify hands to onRoute.
 *
 * A `note` that is present but is not a usable sentence THROWS, at registration, naming the
 * endpoint. A route that tried to describe itself and got the shape wrong must not end up looking
 * like a route that never tried -- that failure would arrive as `description: null` on GET /api,
 * weeks later, which is the whole class of bug this collects notes to end.
 */
function noteOn(config: unknown, where: string): string | undefined {
  if (typeof config !== 'object' || config === null) return undefined
  if (!('note' in config)) return undefined
  const note: unknown = (config as { note: unknown }).note
  if (typeof note !== 'string' || note.trim() === '') {
    throw new Error(
      `${where} declares config.note as ${JSON.stringify(note)}. It must be a sentence saying what the endpoint ` +
        'is for and what it refuses, because that string is what GET /api serves for this route.',
    )
  }
  return note
}

/**
 * The operation a route declared beside itself, out of the same `config`.
 *
 * UNLIKE `noteOn`, ABSENCE THROWS. A note is a sentence somebody may not have written yet; an
 * operation is what the request was, and a route that has not said cannot be counted at all. The
 * failure has to arrive at registration, naming the endpoint, rather than as a null in a table
 * six months of measurements later. So: no operation, no server.
 *
 * A name this vocabulary does not hold throws for the same reason. It is almost always a typo,
 * and the alternative is a name that quietly counts as its own thing for ever.
 */
function operationOn(config: unknown, where: string): OperationName {
  const declared: unknown =
    typeof config === 'object' && config !== null && 'operation' in config
      ? (config as { operation: unknown }).operation
      : undefined
  if (declared === undefined) {
    throw new Error(
      `${where} declares no config.operation. Every /api route says what a caller is asking for, in a word from ` +
        'src/shared/ops.ts, because routes change and a URL is not a question. Add ' +
        "`config: { operation: '<one of those names>' }` to this registration.",
    )
  }
  if (!isOperationName(declared)) {
    throw new Error(
      `${where} declares config.operation as ${JSON.stringify(declared)}, which src/shared/ops.ts does not hold. ` +
        `The ${LIVE_OPERATIONS.length} names a route may declare are in that file. A name that is not there is ` +
        'almost always a typo, and one that got through would count as its own question for ever.',
    )
  }
  return declared
}

/**
 * The reach a route declared beside itself, out of the same `config`.
 *
 * ABSENCE THROWS, and it throws whether or not Mole Office is reachable from anywhere but this machine
 * today. A route added while remote access is switched off still gets classified when it is
 * written, by the person who knows what it does — which is the only moment anybody does.
 *
 * Refusing to start is the point. Degrading to "remote access is off" would make a missing
 * declaration invisible until the day it mattered, and that day is the day the bind address
 * changes. src/shared/reach.ts is what the two words mean.
 */
function reachOn(config: unknown, where: string): Reach {
  const declared: unknown =
    typeof config === 'object' && config !== null && 'reach' in config
      ? (config as { reach: unknown }).reach
      : undefined
  if (declared === undefined) {
    throw new Error(
      `${where} declares no config.reach. Every /api route says whether another machine on the owner's private ` +
        `network may ask for it: ${REACHES.join(' or ')}. A route nobody has classified is a hole nobody has ` +
        "looked at, so add `config: { reach: 'local' }` or `'remote'` to this registration.",
    )
  }
  if (!isReach(declared)) {
    throw new Error(
      `${where} declares config.reach as ${JSON.stringify(declared)}. It must be ${REACHES.join(' or ')} — ` +
        "`local` means only this machine may ask for it, `remote` means another machine on the owner's private " +
        'network may too.',
    )
  }
  return declared
}

/**
 * Why another machine may not ask for a `local` route, out of the same `config`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS REQUIRED ON `local` AND REFUSED ON `remote`
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/access` publishes the acts a caller from another machine may not perform, and the
 * browser reads that list to decide whether to draw a control at all rather than drawing one and
 * then being refused. A published refusal with no reason is a refusal a person cannot argue with,
 * and a reason invented by the reader is the same fact worked out in two places.
 *
 * So the word is the route author's, written on the day they decide the route is `local`, by the
 * person who knows which of the three it is. `route()` in lib/route.ts makes it a type error to
 * leave out; this makes it a failed registration for anything that builds its config by hand.
 *
 * A `remote` route declaring one is refused rather than ignored: it means somebody wrote a reason
 * and the word that would have used it says the opposite, and letting that register would leave
 * the two disagreeing with nothing to notice.
 */
function refusalOn(config: unknown, reach: Reach, where: string): KeptHere | undefined {
  const declared: unknown =
    typeof config === 'object' && config !== null && 'keptHere' in config
      ? (config as { keptHere: unknown }).keptHere
      : undefined
  if (reach === 'remote') {
    if (declared === undefined) return undefined
    throw new Error(
      `${where} declares reach "remote" and also config.keptHere. A route another machine may ask for refuses ` +
        'nobody for where they are, so there is nothing for a reason to explain. Either drop it, or say ' +
        "reach: 'local' if that is what was meant.",
    )
  }
  if (declared === undefined) {
    throw new Error(
      `${where} declares reach "local" and no config.keptHere. Every act kept on this machine says which of ` +
        `the three reasons it is — ${WHY_REFUSED.join(', ')} — and what the act is in a person's words, ` +
        'because GET /api/access publishes the refusal and a caller reads it. src/shared/authority.ts is ' +
        'what the three mean.',
    )
  }
  if (typeof declared !== 'object' || declared === null) {
    throw new Error(`${where} declares config.keptHere as ${JSON.stringify(declared)}, which is not an object.`)
  }
  const { because, act } = declared as { because?: unknown; act?: unknown }
  if (typeof because !== 'string' || !(WHY_REFUSED as readonly string[]).includes(because)) {
    throw new Error(
      `${where} declares config.keptHere.because as ${JSON.stringify(because)}. It must be one of: ` +
        `${WHY_REFUSED.join(', ')}.`,
    )
  }
  // A phrase and not a key: the refusal a person reads starts with it, and `plan.write` is not what
  // anybody was trying to do. Length is checked because an empty string would register and then
  // produce a refusal that begins with a space.
  if (typeof act !== 'string' || act.trim().length < 8) {
    throw new Error(
      `${where} declares config.keptHere.act as ${JSON.stringify(act)}. It must be the act in a person's ` +
        "words, as the start of a sentence — e.g. 'Writing the durable export to disk'.",
    )
  }
  // THE PERSON FROM THEIR OTHER COMPUTER: true or left out. Any other value is a declaration
  // somebody half wrote, and a door that opened on a guess about it would be a door opened by a typo.
  const { thePersonMayFromAnotherComputer: fromThere } = declared as { thePersonMayFromAnotherComputer?: unknown }
  if (fromThere !== undefined && fromThere !== true) {
    throw new Error(
      `${where} declares config.keptHere.thePersonMayFromAnotherComputer as ${JSON.stringify(fromThere)}. It is ` +
        'true, or it is left out.',
    )
  }
  return { because, act: act.trim(), ...(fromThere === true ? { thePersonMayFromAnotherComputer: true } : {}) } as KeptHere
}

/**
 * Remember every /api route this server registers, and hand back a getter for the list.
 *
 * WHY A HOOK RATHER THAN ASKING FASTIFY LATER. `printRoutes()` returns a formatted tree meant
 * for a person to read; turning that string back into data would be a parser to maintain and a
 * second definition of the route table. The `onRoute` hook hands over the same information as
 * data, at the moment it becomes true.
 *
 * INSTALL THIS BEFORE ANY ROUTE IS REGISTERED. The hook only sees registrations that happen
 * after it, so a route added above it would exist and be undiscoverable -- exactly the failure
 * this endpoint exists to end.
 *
 * The getter is a function, not a snapshot, because it is called per request: plugins register
 * routes long after this returns.
 */
export function trackApiRoutes(app: FastifyInstance): () => ApiRoute[] {
  const seen = new Map<string, ApiRoute>()

  app.addHook('onRoute', (route) => {
    const path = normalisePath(route.url)

    // Only the JSON API is documented here. In production @fastify/static registers a catch-all
    // GET for the browser app, which is not an endpoint anyone calls by hand.
    if (path !== '/api' && !path.startsWith('/api/')) return

    const methods = Array.isArray(route.method) ? route.method : [route.method]
    // Read once per registration rather than once per method: a route declared for GET and POST
    // at the same path is one declaration and one sentence.
    const where = `${methods.join(' and ')} ${path}`
    const note = noteOn(route.config, where)
    // Both of these THROW when the route said nothing, which is what stops the server. Read here,
    // beside the note, for the same reason: one declaration per registration, not one per method.
    const operation = operationOn(route.config, where)
    const reach = reachOn(route.config, where)
    const keptHere = refusalOn(route.config, reach, where)
    for (const method of methods) {
      // HEAD is added automatically alongside every GET, and OPTIONS is the browser's CORS
      // preflight. Neither is a request a caller decides to make, so listing them would put
      // noise around the endpoints that are real choices.
      if (method === 'HEAD' || method === 'OPTIONS') continue
      const held = (route.config as { waits?: unknown } | undefined)?.waits === true
      const base: ApiRoute = {
        method,
        path,
        operation,
        reach,
        ...(keptHere === undefined ? {} : { keptHere }),
        ...(held ? { waits: true as const } : {}),
      }
      seen.set(`${method} ${path}`, note === undefined ? base : { ...base, note })
    }
  })

  return () => [...seen.values()].sort(byPathThenMethod)
}

// ============================================================================ families

/**
 * THE FAMILY A DOOR BELONGS TO, DERIVED FROM ITS PATH AND NEVER DECLARED.
 *
 * The first path segment after `/api` is the family: `/api/records/:id` is in `records`, and
 * `/api/kinds/:kind` is in `kinds`. The front door itself has no segment after `/api`, so it gets
 * its own family named `api`. Nothing a route writes down says which family it is in, which is the
 * whole point: there is no second classification beside `operation` in src/shared/ops.ts that can
 * drift from the path the router really registered.
 *
 * This is the ONE derivation, and `familiesOf`, `familyIndex`, `familyView` and `noSuchEndpoint`
 * all read it rather than splitting a path a second way.
 */
export function familyOf(path: string): string {
  if (path === '/api' || path === '/api/') return 'api'
  if (!path.startsWith('/api/')) return 'api'
  const segment = path.slice('/api/'.length).split('/')[0]
  return segment === undefined || segment === '' ? 'api' : segment
}

/**
 * ONE LINE PER FAMILY, KEYED BY FAMILY NAME, FOR EVERY FAMILY WITH MORE THAN ONE DOOR.
 *
 * The line for a family with EXACTLY ONE door is that door's own description, cut to its first
 * sentence — the same cut GET /api/onboarding makes for a door it names — because a family of one
 * has nothing to say that its only door does not already say. Every other family's line is written
 * here, ONCE, and `tests/api-families.test.ts` fails when the route table holds a family with no
 * line, so a new family cannot arrive undescribed.
 *
 * WHY THIS IS NOT ON THE ROUTES. THE DECISION THAT CREATED FAMILIES SAYS SO: a family is derived
 * from the path, and a route that declared one would be a second classification free to drift from
 * the path. The cost is this map, and the test is what keeps it in step with the route table.
 */
export const FAMILY_LINES: Readonly<Record<string, string>> = {
  sidebar: 'Read, preview, save and restore the office-wide sidebar arrangement, and read its history.',
  'home-layout': 'Read and keep the Home layout of the person asking: one row for each person, written only by that person.',
  'sidebar-pins': 'Read and keep the pages in front of the sidebar for the person asking: one row for each person, written only by that person.',
  'report-count': 'Read and keep whether the person asking sees how many reports are unread: one row for each person, written only by that person.',
  words: 'Page words: saved office-wide choices, English beside Chinese, translation freshness, shipped sources, history and restore.',
  agent: 'Reaching one durable agent: what is waiting for it, and which pages have a comment for it.',
  'agent-tags': 'Read and keep the asking person’s own coloured tags for agents.',
  agents: "A secretary's notebook — how this person works and what the secretary may settle — and its entries.",
  'provider-router': "The provider router: a run's credential from its Casting row, the router's admission and receipt for one request, a run's receipts by slot, and the OpenCode Go key slots the owner adds and removes.",
  anchor: 'The bookmark that says what you have read, kept on the server so every device shares it.',
  annotations: 'One comment, and whether the words it quoted still hold.',
  attachments: 'The periods in which one session participates as one durable agent.',
  attention: 'What needs a person now, in the shape a page asks for, and a door that makes the next read look at every record again.',
  avatars: 'The pictures on offer for a person or an agent, and the bytes of one.',
  backlog: "One line's backlog items, a decision's points and filing them in one act, and the project's progress counted from its points and inside briefs.",
  bookings: 'Bookings of the host GPU: booking it, naming the program doing the work, cancelling, and asking to go first and answering that.',
  bundles: 'What somebody wanted a copy of, and the text one produces.',
  casting: 'The Casting table: every way each role is cast (program, model, effort, when it suits, why), the one casting the tools take for a role in a project, a role\'s history, and the owner adding, changing, removing and marking a casting.',
  checks: 'Which runs said they were finished, what an inspector reads, and the release.',
  conversations: "The project's opt-in sync of its agents' conversations: the setting and path map, a run of the sync, one run's scrubbed copy, and putting a copy back to resume it.",
  checklists: 'Checklists of requests: your own by default or another owner\'s by name, making one, adding and changing an item with the evidence it was done, and switching an item\'s reminder.',
  claims: 'Who is working on what, which run is doing it, and the records and files it is about.',
  composition: 'What a pipeline or a module was made of at a time, and how two pipelines differ.',
  counters: 'Counters and their timed triggers: what each counts, adding to one, changing it, pausing it, and what it did when it fired.',
  'host-jobs': "Host jobs: a running run asking for a registered host tool, reading what came of it, and the host runner taking the oldest job and saying how it ended.",
  'host-tools': "The registered host tools: what each runs and who may ask it, and a secretary registering, changing or taking one off on a decision the owner made.",
  'dead-letters': "Messages that reached nobody, and the secretaries' claims on them.",
  decisions: 'Which decisions govern a file or a page, and the check of what the decisions say they govern.',
  drafts: 'Writing kept in the office until it is sent: your drafts with when each reminder is due, and the door that sends one.',
  delegation: 'The packaged tasks, and the marks on one: take it, return it, confirm it, export it.',
  departments: 'The departments as a tree: one page of the top departments with every department under each, one department with those directly under it and its history, and filing or changing one, by the person or a secretary on the person\'s words.',
  events: 'What happened as it happens, over a channel the server holds open, and what it holds now.',
  export: 'What a durable export would contain, and the write that puts it on disk.',
  figures: "The four figures the home page lacks: packages per line by state, packages done per day, each package's time from taken to live, and the whole suite's minutes per run.",
  file: 'One file that a live record in this project points at: reading it to preview, download or open, and an address with a ticket that opens it in a paired browser.',
  flows: 'The office\'s flows: the register with which flows have problems, a page of flows with their runs, one flow, a page of its runs, a new flow, a stage added, changed, moved or removed, and an agent entering one, which puts an item on the agent\'s checklist until the flow ends.',
  forks: 'The forks waiting on a person, and the ones that might be one question.',
  groups: 'Conversations with several subscribers, and opening one.',
  handles: 'Which session is answering as which durable agent right now.',
  knowledge: 'Read and write shared knowledge categories and entries, review changes, and bookmark entries in projects.',
  harnesses: 'The agent tools on this machine: which are installed, their versions and the newest, and the press that installs the ticked ones.',
  'honour-board': 'What the office reads about one run from the records it already holds, and the reading kept on the run itself.',
  implementation: "Where this project's meaning lives in the code: repositories, relationships and revisions.",
  import: 'What reading the durable archive back would do, and the write that does it.',
  'key-items': "A project's key items with their progress and an estimate of the time left: listing them for one project or every project, adding one, changing, moving, closing and opening one again, written only by the person or a secretary.",
  kinds: 'Every record kind, one kind in full, and one kind\'s fields cheaply.',
  links: 'Every typed relationship between records, and the write that makes or removes one.',
  'merge-queue': "The merge queue, lane by lane: submitting a sealed run's changeset, one entry and what it waits on, withdrawing it, and the merge tool's steps.",
  messages: 'Every message one participant sent another, and how far it got with each.',
  modules: "The flow for planning a module's work: the planner says the plan step is done, and submits the plan after questioning it.",
  office: "The office's own installation: runtime settings and their audit, restarting and pausing with explicit grants, worlds, keys, visitors, trusted machines, and what it keeps.",
  'office-regulations': "The office's chapters and the person's regulations, as the office's records hold them in every project, and the person's press that marks a rule as only for this office.",
  'one-press': "Requests for one press: an agent asks the person to agree to one known act, the newest requests, one request, the person's Agree and Refuse, and the asker withdrawing its own.",
  participants: "The people and durable agents of this installation, and one participant's own card.",
  planning: 'What this person will spend time on, and when: the period read and the allocations.',
  plans: 'Plans: documents a person writes, filed whole and versioned, with nothing in them parsed as truth.',
  'plugin-read': 'The read-only interface a plugin reads through, version 1: the projects, the people, the current work and who talked to whom, never the words of a message and never a key.',
  plugins: "The plugins in this repository's plugins/ folder, each one's manifest, the switch that turns one on or off, and the built files a switched-on plugin's page is drawn from.",
  portraits: 'The pictures painted for each role card, and the ones one person keeps for themselves.',
  presence: 'Whether each person and durable agent can be reached right now.',
  presentation: 'Every arrangement somebody made for a drawing, and the vocabulary an arrangement may use.',
  readiness:
    "Readiness checklists: an operation that reaches others waits for their signatures. Raising one, the newest, what waits for one signer, one checklist, an agent's signature, the person's signature, taking a signature back, and cancelling.",
  'preview-roots': 'The directories a preview may read in this project, and adding one by hand.',
  queries: 'Named readings over the whole project: what is unconsumed, what is unmet, the rule-three signature, and the decisions still missing their level-3 context.',
  records: 'The stored layer: every record, filing one, reading one, and changing or removing it.',
  renames: "Answering an agent's waiting new name: its approver approves or refuses it, each with a reason.",
  'report-files': 'A file a report carries as a file: taking its bytes in, and reading back its name, size and hash.',
  residents: "Permanent residents: the secretary's proposal, the owner's press, and each resident's personal space with its files, void marks, leave to read and successor.",
  resources: 'The ledger of what a session started, what is still alive, and releasing one; and where the host GPU stands.',
  restore: "An agent's own context, restored by who it is and what it left unfinished.",
  'returned-files': 'What may be sent back from outside as a zip, and the one door that takes it.',
  reviews: 'A review of a project: collecting comments, organising them, and sending them.',
  roles: 'The role cards, who holds each one, and the person\'s press that gives one.',
  runtime: 'What the server answering you is: its process, ports, checkout, database and listeners.',
  runs: "A run's process: whether it is known to have ended, and closing as crashed a run whose command and process have both ended.",
  sessions: 'Every agent run Mole Office can see, one session whole, and linking a run to its work.',
  'signing-packages':
    "Signing packages: a secretary brings the person several known acts to sign at once. Bringing one, the newest, one package as its receipt, the person's signature, which carries out each item not struck, the person's refusal, and the secretary taking back its own.",
  slots: "This machine's shared test seats — a whole suite, browser test files — asking for one and giving it back.",
  source: 'The source index: every file the scan covers, what no module claims, and rebuilding it.',
  terminals: "The office's own terminals on this machine: listing them, opening one or an agent's, its screen, typing into it, resizing and closing it, and keeping what the person types.",
  'the-persons-words': 'The notes a secretary prepared from words the person said elsewhere, still waiting for them, and their Confirm all.',
  toolset: "The toolset catalogue: every category with its tools, one tool's manual page, a use written as one line on the calling run, and the person's confirmation of a category.",
  usage: 'How agents read this project: calls, refusals, patterns and where they first went outside.',
  'work-domains': "The open work domains in this project, the machine's reading of one, and overlaps.",
  worker: 'The message worker\'s doors: the runs on this machine and what a run said or could not start.',
  workspaces: 'Every project boundary this installation holds, and establishing or renaming one.',
  families: "The API's own middle level: one line for each family of endpoints, and one family's doors.",
  secretaries: "What each secretary does in this project: every secretary's duties, one secretary's with its doors and the one-job settings that name it, and the write.",
  'getting-started': "A new office's first entry: its getting-started report, the checklist item that holds the report, whether the page draws the first entry, and ending it when the person opens the report from the checklist.",
  settings: "The Settings page's categories, panels and controls with their words, addresses and authority, and the private provider keys set up from it: the providers with their guides, saving a key on this computer, and trying one with a read-only request.",
  projects: "One project's master pipeline: which pipeline is marked, and marking it; and the project's board, read from the master's steps.",
}

/** The key ROUTE_NOTES uses, and the way an endpoint is written in every message below. */
function routeKey(route: ApiRoute): string {
  return `${route.method} ${route.path}`
}

// ============================================================================ what each is for

/**
 * One sentence per endpoint of the STORED layer: records, the links between them, their history,
 * the derived queries over that history, and the reader's anchor into it.
 *
 * THE SAVED PANEL POSITIONS USED TO BE ON THIS LIST AND ARE NOT. GET and PUT /api/layout/:id were
 * deleted with the draggable panel grid on 2026-08-10, along with api/layout.ts and the browser
 * reducer behind them; PanelGrid.tsx's header is the account of what went and why. The
 * `panel_layouts` table survives and is empty, because no route serves it and no route the product
 * still has can AUTHOR a row.
 *
 * This comment once said "nothing can write a row into it any more" while POST /api/import still
 * wrote whatever panel_layouts rows an archive carried. Since a decision, no backup
 * or export carries the table and an import writes none of its rows, so no route writes
 * it. A direct SQL write still can, and the tests use one.
 *
 * Keyed by the exact "METHOD /path" the router registers. tests/kinds-api.test.ts checks the
 * keys against the live route table in both directions: a line here for an endpoint that does
 * not exist is a lie, and an endpoint with no line here is undiscoverable, which is the bug.
 *
 * DO NOT ADD A NEW ROUTE GROUP'S LINES HERE. Declare the sentence beside the route, as
 * `config: { note: '...' }`, the way api/presentation.ts, api/export.ts and api/import.ts do -- see
 * the second section of this file's header. This map is what the groups written before that existed still use,
 * and every endpoint moved out of it is one fewer pair of files that have to be edited together.
 *
 * WHY THIS IS NOT THE WHOLE MAP: see DERIVED_ROUTE_NOTES below. GET /api reads ALL_ROUTE_NOTES,
 * which is the two of them joined; neither map is read directly by a route.
 */
export const ROUTE_NOTES: Readonly<Record<string, string>> = {
  'POST /api/agents/:agent/hand-run':
    'CHECK A HAND START BEFORE MAKING ITS WORKTREE: {"askedBy":"<run>","brief":"<absolute path>","cutFrom":"<optional branch or commit>","worktree":"<optional directory>"}. ' +
    'Every host filing makes this extra request first, including an office launcher. With no askedBy, the office key and an agent not marked noKey answer {cut:null} at once and write nothing; askedBy on either is refused rather than ignored. ' +
    'A worker with no key of its own needs its registered starter proved by its own key, askedBy naming a running run of that starter in this project, and brief inside its vouched sandbox. ' +
    'A refusal is one sentence and writes nothing. A valid hand ask keeps a full workerRuns entry on that asking run, directly as starting with byHand:true and no launcher wrapper. ' +
    'Its cut is the asking worktree HEAD at this ask, or the commit cutFrom names, checked as at the worker-run door. ' +
    "The answer is {cut:{commit,named}}: that cut while the worker's worktree is not there, and {commit:<the commit the worktree stands at>,named:null} while it is, so the run is filed at the commit its worktree stands at. " +
    'The worktree path must stay inside that sandbox with links followed, even while it does not exist yet. A live run already serving the worker is refused by the same guard as the worker-run door before any entry can be replaced. The tool stops before making a worktree if the office refuses or cannot answer. Filing rechecks the live asking run and uses the stored cut; an abandoned hand ask stays starting and a later ask can replace it.',

  'GET /api':
    'This list: every endpoint this server registered, with one line each on what it is for and what goes in it. ' +
    'Built from the router rather than typed out, so it cannot name an endpoint that is gone or miss one that is ' +
    'new. Read GET /api/kinds next — the endpoints are useless until you know what may go inside a record.',
  'GET /api/kinds':
    'Every record kind: what it is for, when to record one, every field it takes with its type and whether ' +
    'it is required, and a complete example of its `data` to copy — the data, not a whole request, and `block` ' +
    'is the one kind that carries an example and still refuses a bare POST. Read this before writing anything. It also serves ' +
    'the link vocabulary as `linkTypes` — every typed relationship two records may have, each with how ' +
    'it reads on the record it starts from and how the same one row reads from the other end — so the ' +
    'vocabulary can be looked up rather than provoked out of a refusal.',
  'GET /api/kinds/:kind':
    'One kind in full, plus the nested shapes its fields mention — 404 with the list of kinds if the name is wrong.',
  'GET /api/health': 'Whether the server is up, and how many records it is holding.',
  'POST /api/records':
    ASK_FIRST_SENTENCE +
    ' A running session for a worker registered with no key of its own needs askedBy naming a live run of its registered starter, and brief naming its absolute brief path, beside kind and title; cutFrom optionally names the ask cut. The starter proves itself with its own key. The office key keeps its existing start path. An invalid hand start is refused before the create. askedBy is refused when no hand ask applies, and brief or cutFrom without askedBy is refused. A filing without a preflight reads data.workingDirectory as its actual existing worktree and records no worktree creation; its top-level cutFrom may still name an explicit ask cut. A valid filing sets parentAttachment to askedBy and writes the full started workerRuns entry there, plus cutAsked on the worker, with its run key in the same transaction. File a record. Body {"kind":…,"title":…,"summary":…,"data":{…},"askedBy":…,"brief":…,"cutFrom":…} — a title may repeat, and the 201 comes back ' +
    'with `sameTitle` naming anything in this project already called exactly that. Nothing is refused and nothing ' +
    'is merged: an id is what tells two records apart. The envelope `summary` is the record\'s ONE LINE: it is what the records ' +
    'list, the home cards, every link row and the top of the record\'s own page show, for every kind. A module ' +
    'also declares `data.summary`, and that is a different field doing a different job — the opening paragraph ' +
    'of the module\'s curated summary, drawn only on the module page itself, above `data.summaryBlocks`. Both ' +
    'are stored and both are read; neither is a copy of the other. Blank is refused in either of them: leave ' +
    'the key out rather than sending "  ". What may go in `data` is exactly what GET /api/kinds/<kind> lists. ' +
    'IT ALSO TAKES THE RECORD\'S RELATIONSHIPS, so filing a thing and saying what it is about is one request ' +
    'and not four: {"links":[{"type":"about","toTitle":"login page"},{"type":"blocks","fromId":"rec_…"}]}. ' +
    'The record being created is one end of each link and is never named — it has no id yet — so an entry names ' +
    'the OTHER end, and which key you use is the direction: `toId`/`toTitle` makes the new record the FROM end, ' +
    '`fromId`/`fromTitle` makes it the TO end. Exactly one of the four per entry. ALL OR NOTHING: one entry that ' +
    'cannot be made refuses the whole request, says which entry and why, and stores nothing at all — not the ' +
    'links and not the record — because a 201 for a record whose relationships half landed is a success report ' +
    'for work that did not happen. A title that names nothing is refused rather than created behind your back; ' +
    'an id may name a deleted record, because an id is exact. A `blocks` entry may carry {"gate":{…}} on the ' +
    'same terms POST /api/links states. The 201 comes back with `links`, both ends resolved to real ids and ' +
    'titles, so a name you typed can be checked without a second request. POST /api/links has not moved and is ' +
    'still how you relate two records that already exist. ' +
    'A KIND THAT HOLDS A BODY COMES BACK WITH `shortForms` TOO — a report and a module today — naming the ' +
    'shorter forms of it nobody has written yet, with each length\'s word budget, and the request that ' +
    'writes them: POST /api/records/<id>/short-forms, naming the revision they were made from, whose seq and ' +
    'contentHash come from the newest entry of GET /api/records/<id>/revisions. READING LENGTHS 2 AND 3 ARE ' +
    'NEVER NAMED THERE, because they are the record\'s OWN `title` and `summary`: filing a report is its ' +
    'title (aim at 15 words or fewer), its summary (aim at 20 to 60 words) and its blocks, and those two ' +
    'numbers are targets — nothing is refused for its length. What the short-forms request writes is level 1, ' +
    'the `label`, and levels 4, 5 and 6, which are named as one thing to write, `parts`, because they share ' +
    'one stored structure: a heading and two texts for each part of the report, and the blocks each part ' +
    'covers. It is information and never a refusal: a report with no short forms is complete, so nothing ' +
    'there is added to `incomplete`. The key is absent when the kind has no place for them or when every ' +
    'length is written. ' +
    'Three more things come back on a 201. `version` is the token this record now has: send it back as ' +
    '`ifVersion` on a PATCH built from it and a write against a copy somebody else has already replaced is ' +
    'refused instead of answered 200. `similar` and `similarNote` appear only when something very like your ' +
    'title is already filed — nothing was refused and nothing was merged, it is Mole Office saying what is there. ' +
    'It is the near miss, scored; `sameTitle` above it is the exact match. Two agents writing one fact in ' +
    'different words never produce the same title, so only `similar` can find them. A message never gets ' +
    '`similar`: its send id already keeps it from being stored twice, and in a chat a close title is ordinary. And ' +
    '`sessionBinding`, only when it happened: filing a `session` while writing under ' +
    'x-mole-office-session claims that run name for the new record and repoints every change row already stored ' +
    'under the raw name, and says how many rows moved. ' +
    THE_PROSE_CAP_SENTENCE +
    ' A create may carry forms in its top-level `shortForms`; the office names the revision they were made from. ' +
    'A message with this key is filed at once rather than held in a turn draft.',
  'GET /api/records/:id':
    'One record with everything a page needs: its links, both directions, and its history. Every link carries ' +
    'its gate — `gate` as stored, `gateLabel` as words, `gateProblem` when the stored pair cannot be read — on ' +
    'whichever end you asked about, so the record that is BLOCKED can say what it is waiting for and how much ' +
    'without storing anything of its own. A null gate means nobody has said how much it blocks; it does NOT ' +
    'mean "hard". It also carries `version`, which is the token to send back as `ifVersion` on any PATCH you ' +
    'build from this read. ON A PIPELINE IT ALSO CARRIES `blocks`, and that is the whole shape of the pipeline ' +
    'in this one request: every block in the pipeline\'s own stored order with its name, its qualified title, ' +
    'its state, what it waits on and how hard, which modules carry it, and the block record itself. Beside them ' +
    '`storedIds` counts what the order holds, `problems` names every listed id that could not be read — at its ' +
    'position, never dropped — and `undeclared` is true when the pipeline stores no `blockIds` key at all, ' +
    'which is a stub and is NOT the same as a pipeline that holds none. The key is absent on every other kind ' +
    'rather than empty. It used to be `data.blockIds` and nothing else, so reading what a pipeline held cost ' +
    'one request per block.',
  'PATCH /api/records/:id':
    'Change a record. {"title"?,"summary"?} change the envelope. {"kind":"task"} changes what KIND of thing ' +
    'the record is, which a first choice made in a hurry used to lock for ever. Nothing stored is thrown ' +
    'away: a field the new kind does not declare is moved into the new kind\'s `extra`, and `kindChange` in ' +
    'the response names every field that moved, where it is now and why it could not stay. It comes back ' +
    'even when the kind you sent is the one the record already had, with `changed` false, because that is ' +
    'the answer to a question you asked. WHAT IS REFUSED, each with the way out in the sentence: a kind ' +
    'nothing declares; a kind only a person may write, asked for by an agent; becoming a block, which cannot ' +
    'be filed on its own; a block a pipeline still lists, or a pipeline still holding steps; and a kind no ' +
    'plan can give time to while hours, a span on the schedule, a routine or a plan line still point at this ' +
    'record. Send `kind` on its own — a `data` or `dataPatch` in the same request is refused rather than ' +
    'guessed at, because nothing can tell which kind you wrote it for. For the kind-specific `data` there are TWO ' +
    'bodies and they do opposite things. {"dataPatch":{…}} MERGES key by key: only the keys you name change, ' +
    'everything else is left exactly as it is, a null DELETES its key instead of storing a null, and the ' +
    'response reports which paths changed and which keys went. {"data":{…}} REPLACES `data` whole, so every field ' +
    'you do not resend would be emptied — AND THAT IS REFUSED, with a 400 naming every field it would empty. ' +
    'Two ways past it, and the first is almost always the one you want: send the fields you are changing as ' +
    '{"dataPatch":{…}}, which empties nothing it does not name; or send the same `data` again with ' +
    '{"replace":true} to say you mean to rewrite the whole object and lose those fields. A `data` that empties ' +
    'nothing — a stub being filled in, or a record read back with a field added — needs neither and passes as ' +
    'it always did. BOTH BODIES SAY WHAT THEY DID. A replace answers with `emptied`, which names every ' +
    'field it took off the record and is there on every replace, empty when it took nothing. A merge answers ' +
    'with `dataPatch`, which says which paths changed, which keys were deleted, which already held the value ' +
    'you sent and which you asked to delete that were not there — in exact paths under `detail` and in a ' +
    'sentence a person reads under `note`. ' +
    'PREFER dataPatch for every ordinary edit: it is the one of the two that cannot lose a ' +
    'field you forgot to include. Sending both is refused, never guessed at. ' +
    'TWO WRITES ARE REFUSED RATHER THAN ANSWERED 200, and both are the one that lost an agent\'s work: a ' +
    '`parts` array that DROPS a checklist line the record holds right now, and one that REWRITES a line it ' +
    'holds — any key of it, `state`, `note`, `text`, `hours`, `consequence`, `paused`. Each is a 400 naming ' +
    'the lines and, for a rewrite, the keys, unless you also send {"ifVersion":"<the version the read handed ' +
    'you>"} to say which checklist you wrote against. The rewrite half is newer and closes the measured case: ' +
    'a stale copy written back unchanged reverted another agent\'s recorded failure and was answered 200, ' +
    'because the guard compared the SET OF IDS and every id was still there. An ADDITION, a REORDER and a ' +
    'no-op rewrite still need no version — they lose nothing, and key order is not content. `ifVersion` is ' +
    'optional on every other patch and is a compare-and-set when you send it: a 409 saying what the version ' +
    'is now, and nothing written, when the record moved since you read it. ' +
    'THREE WRITES ON THIS ROUTE ARE GOVERNANCE ACTS AND TAKE A `warrant`: closing a record the person was ' +
    'asked about, clearing or changing a question somebody else asked them, and moving a fork away from the ' +
    'classification somebody else gave it. WHAT A WARRANT IS: the person\'s own words, kept — ' +
    '{"warrant":{"saidBy":"<who>","words":"<their words, copied>","where":"terminal | ui | message:<id> | ' +
    'comment:<id>","when":"YYYY-MM-DD HH:MM","for":["<the record you are writing to>"]}}. `for` NAMES THE ' +
    'RECORDS THEIR WORDS COVER and the record in the URL has to be one of them; a sentence that covers several ' +
    'records lists all of them and may be carried once for each. A warrant that names none is refused, and so ' +
    'is a `where` citing a message or a comment Mole Office does not hold. THE WARRANT GOES IN THE BODY AND ' +
    'NOWHERE ELSE: the header x-mole-office-warrant is refused, because a header value may hold only bytes 0 ' +
    'to 255 and could not carry the person\'s own sentences at all. ' +
    'COPY THEIR WORDS. Never paraphrase them, never summarise them, ' +
    'and never write a sentence for them: the whole reason the words are kept is that they can read them ' +
    'beside the act and say it is not what they said. Carry one ONLY when they actually said it, and only ' +
    'from where they said it. Without one those three writes are refused exactly as they always were. With ' +
    'one the act is written into both ledgers with the words on it, every surface that says who did it says ' +
    'it was done on their words, and they can undo it in one press — ' +
    'POST /api/records/:id/revisions/:seq/revoke. A PERSON\'S OWN WRITE NEEDS NONE and is refused if it ' +
    'carries one. An ordinary edit that carries one stores nothing and is marked nowhere. ' +
    'THE REMINDER BEFORE THE SEAL: the first write that would seal a run, sent with the run\'s own key, is answered ' +
    '200 with `beforeTheSeal` (`sealed` false: what an inspector would most likely refuse, and what was not checked), ' +
    '`newSeq` null and the record as it was. Nothing of that write is stored. Send the same write again and it seals, ' +
    'whatever the reminder said — EXCEPT over an item the same check still finds that no seal passes, which refuses the ' +
    'write with 409, naming each item\'s own sentence, the rule it breaks and what to do, and nothing is written: a migration ' +
    'item (a test that names a migration by its first digits, a migration without its journal row, or one changed after ' +
    'the commit that added it) refuses a write that would seal the branch (a git or mixed submission, or one that names ' +
    'none, which is read as git), whoever sends it, at every position. A fault of form in the records the seal answers ' +
    'for is listed by the reminder and never refused: what a program cannot fill is listed, not refused. At block, a ' +
    'certain item the reminder named that the same check still finds refuses the seal, whether or not it is a fault of ' +
    'form. Every refusal of the hard gate is counted as a stopped write. The reminder marks each item that refuses, in ' +
    'its line and in `refuses`. {"remindBeforeTheSeal":false} skips the reminder, not the hard gate\'s refusal. The office keeps on the run what the ' +
    'reminder did, in `remindedBeforeTheSeal`: when, the chapters it asked for, the items it named (each with a `key`), and, ' +
    'at the seal, which of them the same checks still found (`atTheSeal`); or, for a seal with no reminder, why. Only the ' +
    'office writes it. A reply that sealed carries `remindedBeforeTheSeal: {kept}`; keeping it never stops the seal. ' +
    'HOW THE ROUND ENDED (wave 13j round loop-1): on a run started in a sandbox the office keeps `howTheRoundEnded`. At ' +
    'the seal it says whether the check was asked for, held or not asked. A check is asked only when the run handed ' +
    'back a package, its last message to its starter has a line beginning FEATURE READY:, bare or after a backtick, or ' +
    'it was started as a repair. It is held when that message says it will not seal, whatever else it says, or when ' +
    'none of those holds, and the starter can release it. A line of its own saying not for a check, bare or in ' +
    'backticks, asks no check and queues nothing, and the next round is still asked. Other words in quotation marks ' +
    'or backticks are not read as the run\'s own, ' +
    'and the account names the sentence the office read as the stop. When the run crashes, is orphaned or its command ' +
    'ends with no seal, it gives the reasons and what to do, and the starter is told once. A reply that sealed carries ' +
    '`howTheRoundEnded`.',
  'POST /api/records/:id/release-the-held-check':
    'Release the check the office held at a sandbox run\'s seal, and ask for it: {"because":"…"}. The run\'s starter, ' +
    'the person, or a secretary proved by its own key may release it. The reply is {howTheRoundEnded, theCheck}: the ' +
    'account with who released it and when, and the check the office asked for. A check that was not held, or was ' +
    'released already, is refused with 409.',
  'PUT /api/records/:id/check-also':
    'The items a run\'s starter asks the reminder before the seal to name: {"items":["…"]}, at most 20 sentences of at ' +
    'most 300 characters each (codes checkAlsoTooMany, checkAlsoItemTooLong). Replaces the list; [] takes it off. Stored ' +
    'on the run as `checkAlso` {items, by, at}. Refused to the run\'s own key and to a key acting for the run ' +
    '(checkAlsoByTheRunItself), so a run cannot choose what it is reminded of. The door that files a run takes ' +
    '`data.checkAlso` as a list of sentences too. The record PATCH door refuses it (checkAlsoWrittenOutsideItsDoor). The ' +
    'reminder names each item and never counts one as answered.',
  'PATCH /api/records/:id/checklist/:itemId':
    'Change ONE line of a module\'s checklist, without sending the checklist. The URL says which module and ' +
    'which item; the body holds only that item\'s own keys — {"state":"done"}, or {"state":"failed","note":"…"} ' +
    '— merged into that one item, with null deleting an optional key. This is the edit `dataPatch` cannot make: ' +
    'a merge replaces arrays whole, so `parts` is out of its reach and ticking a line otherwise means reading ' +
    'the record, rewriting the array and PATCHing all of `data` back. It writes one change row per key that ' +
    'really moved, named for the item — data.parts[#mount].items[#mount-1].state, where # means the element ' +
    'with that id rather than an index. An item id nothing holds is a 404 listing the ids that do exist and ' +
    'appends nothing; an id used twice is refused naming both parts; a key ProgressItem does not declare is ' +
    'refused naming the ones it does. `ifVersion` IS ACCEPTED and is the one key of the body that is not an ' +
    'item field: it is the version your read handed back, and a record that has moved since is a 409 that ' +
    'writes nothing. It is OPTIONAL, because this route carries one line and cannot revert a line you never ' +
    'read — send it when you are writing over a line somebody else may have just written, which is the one ' +
    'thing this path can still lose. It used to be REFUSED here, with "a checklist item has no field ' +
    'ifVersion", so the only guard against a stale write was rejected by the two routes this contract ' +
    'recommends. To ADD a line, POST /api/records/:id/checklist, which takes `ifVersion` too. To REMOVE one, ' +
    'or to write the whole array, PATCH the record with `parts` and the `ifVersion` your read handed back — ' +
    'required there whenever the array would DROP or REWRITE a line that is stored right now. ' +
    'GET /api/kinds/module describes the item fields under ProgressItem.',
  'POST /api/records/:id/blocks':
    'Add a block to a pipeline: {"name":"Close and hold","state":"doing"}, plus {"summary":"…"} for what the ' +
    'block is, {"measured":"…"} and ' +
    '{"at":2} for where in the order it goes (0-based; leave it out for the end). THIS IS THE ONLY WAY TO ' +
    'FILE A BLOCK. POST /api/records {"kind":"block"} is refused with this route in the refusal, because two ' +
    'facts about a block live on its pipeline and nowhere else: where it comes in the order, and the pipeline ' +
    'half of its title — a block is titled "<the pipeline\'s title> \u203a <its own name>", which is what lets ' +
    'two pipelines each have a block called "Plan the approach" while every block stays linkable by name. The ' +
    'record and the pipeline\'s new order are written in ONE transaction. WHICH MODULES CARRY IT and WHAT IT ' +
    'WAITS ON are not here and are not fields: they are links. A module that carries it is POST /api/links ' +
    '{"fromId":"<the module>","toId":"<this block>","type":"implements"}. A block it waits on is POST /api/links ' +
    '{"fromId":"<the block that has to move first>","toId":"<this block>","type":"blocks"}, with "gate" beside ' +
    '"type" when you know how much it blocks.',
  'POST /api/records/:id/ran-instead':
    'File what actually ran instead of this step\'s canonical method: ' +
    '{"ran":"…","because":"…","since":"2026-08-30","allowed_uses":["downstream plumbing"],' +
    '"disallowed_claims":["that SAM segmentation works"],"severity":"limits_claims"}. THIS IS THE ONLY WAY TO ' +
    'FILE ONE, and a bare POST /api/records is refused with this route in the refusal, because two facts about ' +
    'one live on its step and nowhere else: which canonical method it stands in for, and which record its ' +
    'restriction is declared against. IT NEVER WRITES `data.method` ON THE STEP — that is the canonical method ' +
    'and a fallback does not redefine it. While one of these is live, an AGENT may not patch that step\'s ' +
    'method; a person may, and the step\'s own read says so before you try. Two refusals: a target that is not ' +
    'a live step, and a step whose canonical method nobody has written down — something that ran instead of ' +
    'nothing is a restriction against an absence. `allowed_uses` and `disallowed_claims` are YOUR words and are ' +
    'carried unchanged to every record that depends on this one; `severity` is yours too and Mole Office never works ' +
    'it out. Lift it the way a placeholder is resolved: POST /api/links {"fromId":"<the record showing the ' +
    'canonical method ran>","toId":"<the id this returns>","type":"resolves"}.',
  'PATCH /api/records/:id/blocks/:blockId':
    'Change ONE block of one pipeline: {"name":"…"}, {"state":"failed"}, {"measured":"…"} — null clears what ' +
    'was measured — {"consequence":{…}} and {"paused":{…}}. `name` is the block\'s OWN name and the server ' +
    'rebuilds the qualified title from it; a PATCH to the block\'s own record carrying a title in any other ' +
    'form is refused with the exact string that would have worked, because a block\'s title carries the ' +
    'pipeline it is in and is not free text. Everything else goes through the ordinary record patch, so a ' +
    'block gets the same change rows, validation and completeness report every other record gets.',
  'PUT /api/records/:id/blocks':
    'Reorder a pipeline\'s blocks: {"blockIds":["…","…"]}, and it must be the WHOLE order — a permutation of ' +
    'the blocks the pipeline already has, none added, none dropped, none repeated. A list that leaves one out ' +
    'is refused rather than dropping it, because a caller that has not seen a block somebody added a minute ago ' +
    'would otherwise remove it by saying nothing about it and be answered 200. One write, one change row, on ' +
    'the pipeline: that is why the order lives on the pipeline rather than as a number on each block, and it ' +
    'is why a reorder cannot half-apply.',
  'DELETE /api/records/:id/blocks/:blockId':
    'Take a block out of this pipeline\'s order. Delete it in the same transaction only if no other live pipeline lists it. DELETE /api/records/<block ' +
    'id> is refused while a pipeline still lists it: that would leave the order naming a record that is gone, ' +
    'which a reader draws as a hole and a person then repairs by hand. Its links are left alone, like every ' +
    'other soft delete — a dependency somebody recorded is a fact about the archive even after the thing it ' +
    'pointed at is gone, and it is shown as broken rather than vanishing. Takes no body: which block, and which ' +
    'pipeline it comes out of, are both in the URL.',
  'POST /api/records/:id/fulfil':
    'Record that a promise was kept. Body {"note":"what settled it"} — required, because a discharge with no ' +
    'note is indistinguishable from a mis-click a year later — plus {"at":"2026-08-12 16:40"} if it was kept ' +
    'earlier than now, and {"state":"cancelled"} if it stopped being owed rather than being delivered. It ' +
    'writes `data.done` together with `fulfilledAt` and `fulfilledNote`, and the state word that agrees with ' +
    'them, as one ordinary write with one change row per path. THIS IS THE FIELD NOTHING EVER WROTE: `done` ' +
    'has been declared and read since the first slice and no interface set it, so every obligation looked ' +
    'permanent. Only an obligation may be discharged; discharging one that is already discharged writes ' +
    'nothing and says so, rather than moving the date to today for a promise kept last week.',
  'DELETE /api/records/:id':
    'Soft delete: the record stays, marked deleted, so links to it show as broken rather than vanishing. It ' +
    'reads the human-only rule that POST and PATCH read, so an agent deleting a `decision` is a 403 — for a ' +
    'week it was not, and deleting a choice is changing it. GET /api/kinds serves the kinds under `humanOnly`. ' +
    'The body is empty, or {"warrant": {…}} and nothing else: the record stays, so there is nothing to say about how ' +
    'it goes, and an agent deleting a role card\'s words sends the person\'s words it acts on, from a message a live ' +
    'decision of the owner\'s rests on.',
  'POST /api/records/:id/restore':
    'Undo a soft delete. The body is empty, or {"warrant": {…}} and nothing else: an agent restoring a role card\'s ' +
    'words sends the person\'s words it acts on, from a message a live decision of the owner\'s rests on. The record ' +
    'comes back with its completeness report, because one that was ' +
    'incomplete when it was deleted is still incomplete now and the caller who just restored it is exactly who ' +
    'needs to know. Restoring a record that was never deleted changes nothing and writes no history: an id ' +
    'nothing holds is a 404 rather than a cheerful 200.',
  'GET /api/links':
    'Every link in the workspace at once: {"links":[…]}, each with its own id, both ends by id, the type, ' +
    'whether it was inferred, and the GATE it carries — `gate`, `gateLabel`, and `gateProblem` when a stored ' +
    'gate cannot be read. `broken` is true when the record at either end is deleted or gone: a link with one ' +
    'end is returned and marked, never dropped, because a deleted record and a record that was never connected ' +
    'are different facts. This is how a page reads the link graph. Reading it through GET /api/records/:id ' +
    'means one request per record, which is how the pipeline page reached about 1,356 simultaneous requests ' +
    'and the browser — not the server — refused the rest. With no query word it answers every link, as above. ' +
    'A page that needs part of the graph narrows it with type=, toId=, typeToKind= (pairs like serves:goal, on ' +
    "the far end's kind), betweenKind= (two kinds, either direction) and touchesKind= (kinds at either end), and " +
    'with shape=draw, answer or ends, which keep only those fields. A word it does not know, or a type or kind ' +
    'this office does not have, is a 400 and nothing is read. There is no paging.',
  'POST /api/links':
    'Connect two records: {"fromId" or "fromTitle":…, "toId" or "toTitle":…, "type":…}. EITHER END may be named ' +
    'by its id or by typing its title — send exactly one spelling per end — and a title that names nothing is an ' +
    'error, never a new empty record created behind your back. The 201 names both records and says what the link ' +
    'now reads as, so a link made by typing a name can be checked without a second request; it carries the id ' +
    'the delete route takes, and the type that was really stored, which is relates_to when you sent none. The ' +
    'types are served by GET /api/kinds as linkTypes, with the forward and reverse wording of each and ' +
    'which one may be qualified. A `blocks` link may also carry a GATE saying how much ' +
    'it blocks: {"gate":{"kind":"hard"}} means the blocked record cannot proceed at all, ' +
    '{"gate":{"kind":"partial","upTo":"<a checklist item id, a block id, or a stage in words>"}} means ' +
    'it may proceed that far and no further. A partial gate with no `upTo` is a 400 saying why, not a warning ' +
    '— it would show on the blocked record as "as far as (unstated)". A `hard` gate carrying `upTo` is a 400 ' +
    'for the mirror-image reason: there is no stage to name, so the value would be stored and never shown. ' +
    'Only `blocks` may carry a gate, and THIS ROUTE IS THE ONLY WAY TO WRITE ONE — including block to block ' +
    'inside a pipeline, which is an ordinary `blocks` link between two block records. This note used to send ' +
    'a caller to a step\'s own `needs` array; that array no longer exists, because a block is a record and ' +
    'what it waits on is a link like everything else. Leaving `gate` out means ' +
    'nobody has said how much it blocks, which is what every link written before gates existed holds, and it ' +
    'is NOT read as "hard". Creating the same link twice is idempotent, but asking for a gate that differs ' +
    'from the stored one is a 409 that writes nothing: delete the link and make it again to change a gate.',
  'DELETE /api/links/:id':
    'Remove one link. The records at both ends are untouched. Takes no body — which link goes is the id in the ' +
    'URL, and changing a gate means deleting the link and making it again.',
  'GET /api/changes':
    'Every write, newest first, with who made it. ?recordId= for one record. ?since= and ?until= are the two ends ' +
    'of the window and both are INCLUSIVE — there are no stored daily pages, so a day is ' +
    '?since=2026-08-07&until=2026-08-07 23:59:59 and a week is the same pair seven days apart. Send the time on ' +
    '?until= when you mean a whole day: a bare ?until=2026-08-07 is midnight, which is the START of that day, and ' +
    '?since= on its own has no upper end at all — it is everything from that moment until now, which is four days ' +
    'if you last looked on Thursday. A ?since= later than the ?until= is refused rather than answered with an ' +
    'empty list. ?limit= caps the rows, 1000 at most, and 200 when you do not send one — so every reply carries ' +
    '`matched`, how many rows the filter selects in total, and `truncated`, true when the cap cut the list ' +
    'short. Count a day off `matched` and never off the length of `changes`. ?session= ' +
    'narrows it to one agent run, and ?sessionId= is the same filter under the spelling a caller holding an id ' +
    'would type; sending both with different values is refused rather than one of them being picked. Either ' +
    'spelling takes EITHER form of reference, the session record\'s id or the run name it wrote under, because ' +
    'rows written before a session was filed still carry the raw name and a caller should not have to know ' +
    'which of the two it is holding. The reply says what it matched: `session` gives the record it resolved ' +
    'to, how it matched, every name that session answers to, and `storedByName` — how many rows MATCHING THE ' +
    'FILTER still store a name rather than the id, counted over all of them and not over the page you asked ' +
    'for, because it is what "POST /api/sessions/discover would move N rows" is read off. `sessions` is on ' +
    'every reply, filtered or not, and is how a record answers ' +
    '"which session did this" — the runs its rows name, each resolved to its record, with the ones nothing ' +
    'answers to marked unresolved instead of dropped. A use of a tool writes no row here: since migration 0231 ' +
    'each use is one row in tool_uses, read by GET /api/toolset/runs/<run id>/uses. Rows written before that are ' +
    'kept: a row whose field is `data.toolUses[+]` is one use, its newValue the one line it added and its oldValue ' +
    'empty, and a row whose field is `data.toolUses` holds the whole list on each side. The migration wrote one ' +
    'last `data.toolUses` row on each run that held a list, its newValue empty, when it moved the list out. ' +
    '?field= and ?value= are one filter, matched exactly against the stored change field and its new value, and ' +
    'with ?since= they answer what became that value at or after the moment.',
  'GET /api/open-loops':
    'What is still open in this project, for an agent that has just arrived and knows nothing. An open loop is ' +
    'a live task, problem, idea, direction, obligation or unsettled proposal whose own stored state does not ' +
    'say it has ended; a block is reached through its pipeline, and a session, a note, a message or a report is ' +
    'a record of what happened rather than a move anybody owes. Ask with `about=<a record id>` to stand ' +
    'somewhere — the same answer GET /api/records/:id/context gives — and `reach` (default 2) for how many ' +
    'links away a loop may be. `rung` says how much each loop says and CANNOT change which loops are in the ' +
    'answer. THE WHOLE ANSWER FITS IN 16 KB: when it does not fit at the length asked for, every loop says ' +
    'less and the reply says so; only when the shortest length still does not fit is anything dropped, and ' +
    'then it is dropped by when it last changed, with every id named. Every candidate not carried is named ' +
    'with the reason, the reasons are stored facts only, and the counts add up exactly — carried plus left out ' +
    'equals every candidate. Every reply says how many of the project open loops are linked to no module at ' +
    'all, so a short list under one module is never read as a quiet module. This is a read.',
  'GET /api/whose-move':
    'Whose move it is, across this project open loops, grouped into the three words `whose_move` takes: ' +
    '"person", "agent" and "either". Leaving the field out is the fourth answer — nobody has said — and those ' +
    'are counted and named rather than folded into "either", because one is a gap and the other is somebody ' +
    'having decided it does not matter which, and a stored value Mole Office cannot read is a fifth answer counted ' +
    'and named on its own under `unreadable`. IT COUNTS THE WHOLE PROJECT AND IS NOT CUT TO A SIZE: ' +
    '`openLoopsInProject` is how many open loops there are and every group is over all of them. Until 27 ' +
    'August 2026 it counted the list GET /api/open-loops had already cut to 16 KB and wrote that length into ' +
    'its own sentence as the project total — it said 38 where the project held 143, and hid a loop whose move ' +
    'was the person\'s. IT IS NOT GET /api/needs-you. That route answers what only a ' +
    'human may DO — settling a fork, which the server refuses to every agent except the secretary carrying the ' +
    "person's authorization — from the kind and the " +
    'resolution, and it reads nothing written here: no value in this field puts anything into that queue or ' +
    'takes anything out of it. This is a read; the field is written with PATCH /api/records/<id> like any ' +
    'other field.',
  'GET /api/attention':
    'What needs a person today, and why — the shared rule in src/shared/attention.ts run over this workspace ' +
    'and served as its answer, so nothing has to re-derive it to draw it. A thing is on the list when it is ' +
    'OWED to somebody outside this project, or when its own recorded state word says the work STOPPED SHORT ' +
    'of finishing. `visible` is what to read first and `remainder` is what was cut; in the full answer ' +
    '`remainder` is a page, with its total and its continuation. The rows in `visible` and `remainder`, and only those two, ' +
    'carry `reason` — the half of the rule that selected it, who is hurt as STORED, and every rank factor with ' +
    'its points and a sentence. TWO KINDS OF ROW PASS THE GROUP CAP. A safety row — one whose recorded ' +
    'consequence is somebody being hurt — passes it always; the cap on how many rows `visible` holds still ' +
    'applies to it. An OVERDUE owed row ' +
    'passes too, but only while its group is still under its own bound, because the next overdue promise is a ' +
    'substitute for this one and a screen of nothing but promises would push everything else off; a promise ' +
    'still ahead of its date, or with no date at all, is ordinary work and is capped like the rest. Neither ' +
    'exemption hides anything: a row either bound held back is in `remainder` with `displacedBy` saying which ' +
    'cap moved it. `remainderByGroup` names the groups the remainder is made of, ' +
    'in counts rather than rows. Three ' +
    'groups are questions rather than verdicts and come back as pages: `unclassified` (nobody ' +
    'has said what that state word means), `noState` (no state at all, which is a different question) and `paused` ' +
    '(deliberately put down, with the reason). `unclassified` is now usually empty, and that is a fact about the ' +
    'product rather than about your workspace: every word a kind declares is classified, and a word its kind does ' +
    'not declare is refused on write, so a record filed through this API cannot land there. What can is a record ' +
    'filed before a vocabulary moved, or a row an import carried in. Their rows are questions, so they are shaped differently from a ' +
    'selected row: the first two carry a `note` saying what the question is, and a paused row carries the pause ' +
    'itself. Reading those three as though they carried the same keys is a mistake this sentence used to ' +
    'invite. `passedOver` accounts for everything else in named buckets ' +
    'with a sentence each, so nothing is hidden. ?machine=include also sweeps this machine for processes no ' +
    'session claims; without it `machineSweep.swept` is false and the empty `machine.rows` page means nobody ' +
    'looked, not that nothing is running. Without ?shape= the reply is the narrow answer: `visible` and ' + '`remainder` cut to `key`, `recordId`, `recordKind`, `partId`, `itemId`, `title`, `state`, `group`, ' + '`safety`, `displacedBy` and `origin`, with `total`, `counts`, `remainderByGroup`, `remainderNote`, ' + '`at` and `read`. Those narrow `visible` and `remainder` rows carry no `reason`, `factors`, `score` or ' + '`progress`, and the reply carries no question lists, directions, reports, passedOver or machine ' + 'sweep. ?shape=narrow asks the same narrow answer. ' + '?shape=full asks for the paged answer described above; each growing list has `rows`, `total` and `next`. ' +
    '`next` is null when no rows are left, and otherwise the path of GET /api/attention, with its query, that ' +
    'answers the following page of the same list: shape=part, that list\'s part name, `from` at the first row ' +
    'not yet sent, and the same `machine`. `passedOver` keeps its buckets and their sentences in `groups`, ' +
    'without their `keys`, and each of its rows is a `bucket` and a `key`. ?machine=include with no shape asks the paged answer too, ' + 'because only that answer carries the machine list, and ?machine=omit with ' + 'no shape is narrow. ' +
    '?shape=home answers the first page Home draws, in both modes: `visible`; `remainder` cut to what Home ' +
    'reads, without rank factors or scores, and to its first ' +
    `${String(ATTENTION_PART_ROWS)} rows, with \`remainderNext\` the path of its following page (part=homeRemainder) or null; ` +
    '`remainderByGroup`, `remainderNote`, `passedOver` without each ' +
    'bucket\'s `keys`, `counts` and `total`; in `reports` only the ' +
    `${String(REPORTS_SHOWN)} newest reports still waiting to be read, with \`reportCounts\` saying how many ` +
    'are waiting and how many are read; and in `questions` the counts of the three question lists and how ' +
    'each splits, with the paused records that are also on the list named, but none of their rows. It ' +
    'carries no `unclassified`, `noState`, `paused`, `directions`, `machine` or `machineSweep`. ' +
    '?shape=part&part=<list>&from=<n> answers one page of one list: `part` is one of paused (the paused ' +
    'records still holding), unclassified, noState or readReports (the reports already read), which Home ' +
    'keeps behind a fold; homeRemainder, the rest of Home\'s `remainder`; or one of the full answer\'s lists, ' +
    `${FULL_ATTENTION_PARTS.join(', ')}. \`from\` is where the page starts, counting from 0. A page holds at most ` +
    `${String(ATTENTION_PART_ROWS)} rows, with \`total\` saying how long the whole list is; a \`from\` past ` +
    'the end answers no rows and the total. A page of homeRemainder or of a full list also carries `next`, ' +
    'in the same form. shape=part without part=, a part= or from= without shape=part, ' +
    'and an unknown part are each refused with a 400 that says which. `from` is read only when it is ' +
    'written in decimal digits, 0 or more; an empty value, a space, a sign (-1, +1), hex (0x10), a ' +
    'fraction (1.5), an exponent (1e2), letters, or a number too large to count exactly is refused with a ' +
    '400 that says which of those it is, never read as some other page. ?shape=flow answers what the ' +
    'pipeline graph reads: `visible` and `remainder` whole, ' +
    '`counts`, `total` and `remainderNote`. ?shape=other-projects answers the shape=home page for every ' +
    'other project on the list GET /api/workspaces gives, in one request: `projects` holds one ' +
    '`{ workspaceId, reading }` for each project in the list\'s order, and `leftOut` names the project the ' +
    'request named, which is not in it. It fails as a whole if one project cannot be read, and it is ' +
    'refused with machine=include, because it has no machine list. Home asks shape=home in Developer mode ' +
    'and in the ordinary one, shape=other-projects for Late or stuck and the project cards, and a page of a ' +
    'list when its fold is opened; `shape=full`, or `machine=include` with no shape, answers the paged full reading.',
  'GET /api/anchor':
    'What has changed since you last looked. The anchor lives HERE and belongs to the person, not to a ' +
    'browser, so the desk and the phone read the same bookmark and move it for each other — a phone could ' +
    'never answer this while the mark sat in one browser\'s local storage. A reader who has never looked gets ' +
    '`anchor: null` and `changes: null` with a sentence saying so, never an empty list, because "nobody has ' +
    'looked yet" and "nothing has happened" must not draw the same. ?limit= caps the rows returned, 1000 at ' +
    'most; `counts.sinceAnchor` is the true number either way and `truncated` says when more were left out. ' +
    'IT ALSO CARRIES `readers` — EVERY reading point in this project, not only yours — and that is the key an ' +
    'arriving agent wants. Your own anchor is keyed to your actor headers, so an agent asking this is always ' +
    'told it has never looked; three cold agents hit exactly that and hand-bucketed four and five hundred ' +
    'change rows instead. With `readers` you can see whether the OWNER has a reading point and where it is, ' +
    'and answer from it with GET /api/changes?since=<their `since`>, which needs no anchor and claims to be ' +
    'nobody. USE `since` AND NOT `lastSeenAt`. They are different facts and they come apart: `lastSeenAt` is ' +
    'when the reader pressed the button, `since` is the stamp of the row they said they had read to, and ' +
    'anchoring on an older row — which this endpoint\'s PUT exists to allow — puts hours or days between ' +
    'them. Measured: an anchor set on a two-day-old row answered `sinceAnchor: 400` to its owner while ' +
    '?since=<lastSeenAt> answered 0 to everybody else. A stamp is coarser than a row and both ends of ' +
    '?since= are inclusive, so that read may repeat the anchored row and anything written in the same ' +
    'second — it can show a row twice and cannot hide one. Never send their actor headers to move it: that files ' +
    'one reader\'s reading as another\'s, in a log nothing rewrites.',
  'PUT /api/anchor':
    'Mark the point you have read to. No body needed; {"lastChangeId":…} anchors on one particular change row ' +
    'instead of the newest one. The moment itself is this server\'s clock and cannot be sent — an anchor an ' +
    'hour out hides an hour of agent work silently. Who it belongs to is your x-mole-office-actor-type and x-mole-office-actor-id headers. It ' +
    'writes NOTHING to the change log: an anchor moves every time a page is opened, and the change log is the ' +
    'daily view, so logging the act of reading the day would bury the day.',
  // WHAT THIS SENTENCE USED TO SAY, kept here and not in the served text: "Results nothing is
  // using". That described a query nobody can run — what a person is USING is not in this database
  // — and it stayed for a whole pass after decision 7 changed what the route computes, because the
  // rule had a test and the words did not. tests/queries-consumption.test.ts now reads this line
  // out of GET /api and fails if it drifts back.
  'GET /api/queries/unconsumed':
    'Results with no recorded downstream consumption: a claim or module that no `consumes` link points at. ' +
    'IT COUNTS ONE LINK TYPE, and that is the whole of what it means. A `measures` link does NOT take a result ' +
    'off this list: `consumes` says downstream work DEPENDS on the result and is wrong if the result is ' +
    'retracted, while `measures` says one thing EVALUATED another, which is how you found out rather than ' +
    'something built on top. Being on this list is NOT a complaint and not a judgement about whether anybody ' +
    'has read the thing — it says no work has been recorded as depending on it, which is a fact about the link ' +
    'graph and is often the honest state of a new finding.',
  'GET /api/queries/unmet': 'Work waiting on something that does not exist, or that has been deleted.',
}

/**
 * The same thing, for the three plugins whose subject is something OUTSIDE the records table:
 * agent session logs on disk, the processes and ports on this machine, and the files in this
 * repository. Every endpoint below reports on the world and is right only as of when it looked.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THESE ARE NOT IN ROUTE_NOTES, AND THE REASON IS NOT THE ONE THAT WAS WRITTEN HERE
 * ---------------------------------------------------------------------------------------
 * The split was made because tests/kinds-api.test.ts used to build an app out of the stored-layer
 * plugins only, so a line in ROUTE_NOTES for GET /api/sessions failed a test that was right about
 * what it was looking at. THAT REASON IS GONE. That file now builds the product's own surface
 * through `apiApp()`, and checks ROUTE_NOTES against every endpoint the server really registers,
 * so either map could hold any line.
 *
 * What is left is a reason to group by subject rather than a reason to split: every endpoint below
 * reports on the world outside the database, api/source.ts derives its own SOURCE_ROUTE_NOTES from
 * THIS map rather than keeping a second copy, and tests/surface-fixes.test.ts requires the two maps
 * to stay disjoint so one endpoint cannot end up with two sentences. Merging them is allowed and is
 * not free: the merge has to keep ALL_ROUTE_NOTES as the thing apiIndex reads, and keep source.ts
 * reading whatever map its three lines end up in. What must NOT happen is a third copy of a
 * sentence. tests/surface-fixes.test.ts fails if any registered route has no sentence at all,
 * whichever map it is supposed to be in.
 */
export const DERIVED_ROUTE_NOTES: Readonly<Record<string, string>> = {
  // ------------------------------------------------------------------ the implementation map
  //
  // WHERE THIS PROJECT'S MEANING LIVES IN THE IMPLEMENTED WORLD. It sits with the derived notes
  // because, like the file index above it, it reports on the world outside the database — a tree of
  // code on this machine — rather than on the records somebody typed.
  'GET /api/implementation/repositories':
    'Which repositories this project is implemented in, each with the root it resolves paths against on this ' +
    'machine, whether it has been scanned, and how many files are indexed. A repository with NO root is a real ' +
    'state and not a fault: it is named, there is no checkout of it here, it can hold relationships and be read, ' +
    'and it cannot be scanned.',
  'POST /api/implementation/repositories':
    'Register a repository: a name, and optionally the absolute root of a checkout on this machine. It does NOT ' +
    'scan — a scan started by a write would make the index\'s own date mean "when somebody last saved a form" — ' +
    'so the reply names the rebuild route. A root that is set and is not a directory is refused rather than ' +
    'treated as "no checkout here".',
  'PATCH /api/implementation/repositories/:id':
    'Rename a repository, change its note, or re-point its root. Re-pointing is the highest-consequence write ' +
    'here: it deletes every indexed file, every content hash and every resolver finding of the tree it is ' +
    'leaving, in the same transaction, because nothing derived from a tree may outlive the pointer to that tree. ' +
    'It touches nothing anybody stated — relationships are repository-relative — and it is refused to an agent ' +
    'once the repository has been scanned.',
  'DELETE /api/implementation/repositories/:id':
    'Delete a repository. Refused while any relationship or code revision somebody wrote still names it, with the ' +
    'count. Derived rows never block it: the index and the findings are deleted with it.',
  'GET /api/implementation/record/:id':
    'What code a module, block or pipeline is implemented by, in three lists that are three different things to ' +
    'do: what people STATED, which you read and change if it is wrong; what a resolver SUGGESTS, which is a ' +
    'question — nobody has claimed this file and this record\'s code imports it; and what an agent has PROPOSED, ' +
    'which is accept or delete. Matched files are folded to their deepest common directory with a count, so a ' +
    'pattern covering 577 files is one line. The reply also carries every provenance nothing in this build ' +
    'produces, so an absent relationship can never be read as "there is none".',
  'GET /api/implementation/resource':
    'What one file serves: which records state it as theirs, which a resolver has suggested it for, and how many ' +
    'other records share it. "Not indexed" is a real answer and not an error — the scan skips what .gitignore ' +
    'names and anything that is not a source extension — and a file the index has never seen still answers with ' +
    'every relationship stated about it.',
  'POST /api/implementation':
    'Say that a record is implemented, tested or configured by some code, as a repository-relative pattern. Send ' +
    '"proposing": true to file it as a guess a person still has to accept; an agent may do either, because an ' +
    'agent that has read the code and is stating a fact is not guessing. The reply says how many files the ' +
    'pattern covers right now, so you see at once whether it hit anything.',
  'DELETE /api/implementation/:id':
    'Soft-delete one relationship, keeping its author and its date, because a relationship somebody wrote and ' +
    'somebody else removed is a thing that happened. An agent may not delete what a person stated; it writes its ' +
    'own row beside theirs instead, which is how a disagreement is preserved rather than resolved.',
  'POST /api/implementation/:id/accept':
    'Accept a guess, which is what turns it into ownership. ONLY A PERSON MAY DO THIS, and it is refused at the ' +
    'write: without that, two calls by one agent would turn its own inference into a stated row. It does not ' +
    'alter the provenance, so the row goes on saying an agent proposed it AND that a named person accepted it on ' +
    'a named day — it will never say you declared it, because you did not.',
  'POST /api/implementation/rebuild':
    'Rebuild the file index and the resolver findings of one repository, or of every repository with a checkout ' +
    'here. It reports what changed file by file, which stated patterns went stale and which came back. Nothing ' +
    'anybody stated is written or deleted: a rebuild reads that table and cannot write it. After a root has moved ' +
    'it reports neither list, because comparing a build of one tree with a build of another would report the ' +
    'difference between two checkouts as a change inside one.',
  'GET /api/implementation/revisions':
    'The code revisions recorded against one repository, exactly as they were supplied. Mole Office resolves none of ' +
    'them and cannot say whether one is an ancestor of another, because Git owns implementation history.',
  'POST /api/implementation/revisions':
    'Record a code revision identifier against a repository — a commit hash, a tag, a build number, whatever your ' +
    'tooling uses. There is no column saying which of those it is: those are Git\'s words, Mole Office cannot check ' +
    'any of them, and a column holding an unverifiable classification would be worse than none. Say what it is ' +
    'in the note.',
  // ------------------------------------------------------------------ sessions
  'GET /api/sessions/:id/timeline':
    'One run rewound: every call Mole Office recorded for it, in time order, from `api_calls`, with its `changes` ' +
    'rows beside them. Each call carries the time rendered local, its operation and effect, the record it reached at ' +
    '(kind, id, title, where the record still exists), the purpose the caller declared, how long it took, how many ' +
    'bytes came back and what status. POLLS FOLD: consecutive calls of one operation, all answered 200 and asking the ' +
    'same question of the same target for the same purpose, become one entry with a count and the first and last ' +
    'time, so a run that polled 3,000 times reads as one line; anything between two polls — a refusal, a different ' +
    'question — closes the run and is carried whole, because a refused call is the evidence. The reply names the run ' +
    'as its session record holds it (`runtime`, `model`, `ranAs`, when it started and last ended) and carries the ' +
    'totals: calls, folded calls, bytes and milliseconds, counts and sums over what is stored. It also carries the ' +
    "run's `flow` — which flow it ran, as its starter wrote on the session record's summary, the field the kind " +
    "serves elsewhere as the session's purpose; null when nobody said. The id resolves exactly " +
    'as GET /api/sessions/:id resolves one, and the answer 404s in the same words when nothing in this project answers.',
  'GET /api/sessions/:id':
    'One session, the last lines of its own log, and what it actually did. The tail is read from the tool\'s ' +
    'file as this is answered and never copied into Mole Office; ?lines=N asks for more or fewer, up to 500. Beside ' +
    'it, `work` answers the other half of the question from the change log: the records this session created ' +
    '(`wrote`), the ones it changed without creating (`touched`), its own change rows newest first, and ' +
    '`counts.storedByName` — rows that still store its run name rather than its record id, which is the ' +
    'difference between "this joins to the record" and "this happens to be a matching string". `work` is null ' +
    'when the session has no record, because a session Mole Office has never filed cannot have written anything, ' +
    'and an empty list would read as "it did nothing". `startThisOfficeRead` is when this office read the run\'s own ' +
    'process as starting: not null only when the record names its process and the ledger read that same start time for ' +
    'that process, registered against this run, on a row the run did not withdraw as a mistake, and the run\'s ' +
    '`itsProcess` does not say its process is not shown to be its own. The run\'s page shows it when the record holds ' +
    'no start time of its own. The id is either the session\'s own "<tool>:<session>" or the id of its record; ' +
    'GET /api/sessions lists both.',
  'POST /api/sessions/discover':
    'File the sessions found on disk as records, and point the change log at them. Two halves, reported ' +
    'separately. `report` is the sweep: sessions created, updated and already current. Each conversation is filed ' +
    'into the project its own working directory matches (deepest first), never into the project that asked; one ' +
    'that already has a record is written onto where that record is; one no project holds is listed in ' +
    '`report.where` and filed nowhere. It never touches a ' +
    'title, a summary or a link, and a second run over an unchanged machine changes nothing about any session ' +
    '— but it does write to them: the discovery stamp carries the moment it was taken, so every session it ' +
    'saw is re-stamped and its `updated_at` moves. `report.stampOnly` counts those, and is normally equal to ' +
    '`report.unchanged`. The state ' +
    'filed is the one that was observed and never a guess — including "orphaned" for a session that stopped ' +
    'without saying so and "unknown" where the evidence does not reach a conclusion, both of which a record may ' +
    'hold, because a cheerful "finished" is the silence this endpoint exists against. `changeLog` is the migration: rows stored under a ' +
    'raw run name are repointed at the session record that name means, and every name nothing answers to is ' +
    'listed with its row count and the sessions it might have meant rather than being guessed at. Body ' +
    '{"dryRun":true} writes nothing at all: the sweep answers in `report.where` what it would file and where, and the ' +
    'migration is worked out and none of it written. The body may be left out entirely and then nothing is held back.',
  'POST /api/sessions/:id/link':
    'Connect a session to a record it worked on. Body {"toId" or "toTitle":…, "type"?:…} — send exactly one of ' +
    'toId and toTitle, and `type` defaults to relates_to. There is no fromId: the session in the URL is the from. ' +
    'Answers 201. A session that has been seen but never filed is filed by this call rather than refused, and the ' +
    'answer says so in `createdSessionRecord`.',

  // ------------------------------------------------------------------ resources
  'POST /api/resources':
    'Write down something this session started, so it can be found again if the session dies. Body ' +
    '{"type":…,"key":…,"detail"?:…} — `type` is one of process, port, gpu, container, lock, and `key` is the ' +
    'pid, the port number, the container name or the lock\'s absolute path. The owner is the session in your ' +
    'x-mole-office-session header, which may be the session record\'s id or a run name bound to it; add ' +
    '{"sessionRecordId":…} only to register something on behalf of a session that is not the one you are ' +
    'writing as. Neither present is a refusal, not a default — a row with a guessed owner would answer "has ' +
    'the session that started this ended" about the wrong session. A pid that is not running is refused with a ' +
    '400, so an orphan that was never true cannot be created. So is a pid that started before the owning session ' +
    'was filed, in words naming both times: register the pid you read from your own start, or, if the session is ' +
    'taking on a process it did not start, send {"adopting":"<why>"} and the row\'s detail begins with it. ' +
    'A process inside a container may send ' +
    '{"container":<name or full id>,"pidInContainer":<its pid there>} in place of `key`: the row then holds the ' +
    'same process as this machine numbers it, so a release stops it by group across the container boundary. ' +
    '201 with the ledger row.',
  'GET /api/runtime':
    'What the server answering you IS, read at the moment you ask and nothing cached: its process id and group, ' +
    'the port it was told to take and the ports it is actually holding, the checkout and its HEAD and whether ' +
    'the tree is dirty, the database file it has open and whether that is the canonical one, who registered it ' +
    'and when or that nobody did, whether it is scratch or canonical WITH the reasons, and whether the code it ' +
    'loaded is as new as the checkout. `couldNotRead` names anything it could not answer and why, rather than ' +
    'guessing. This is how a successful request to the WRONG Mole Office is told from a successful request.',
  'GET /api/runtime/freshness':
    'Whether the code this server is serving is as new as the checkout on disk, with both times and a plain ' +
    'verdict, plus the world it is a verdict about. The measuring tools ask this before they measure and refuse ' +
    'to measure a stale world.',
  'GET /api/runtime/listeners':
    'Every listener on this machine that looks like a Mole Office — a port the settings declare, a port a live ' +
    'ledger row names, or a process on loopback running this repository\'s server or its Vite — with, for each, ' +
    'who registered it and the world it serves, or UNOWNED. It NAMES and it never stops anything: the owner\'s ' +
    'rule of 3 September 2026 is that nothing the product did not start is ever stopped by it.',
  'POST /api/runtime/register':
    'The server answering you writes ITSELF into the “Running on this machine” list: one row for its process and one for each ' +
    'port it is really listening on, each carrying the world it serves. You say who owns it (the ' +
    'x-mole-office-session header, or {"sessionRecordId":…}); the server says what it is, because only it can ' +
    'honestly read its own checkout, database and commit. {"startedByTheProduct":true} only if Mole Office ' +
    'really started it — that is what makes it stoppable later. 201 with the world and the rows.',
  'POST /api/runtime/stop':
    '{"resourceId":…,"why":…} — stop a process Mole Office started, whose owning session has ended, because a ' +
    'person pressed. Four things must be true and the refusal says which one was not: the row is live, the row ' +
    'says Mole Office started it, the session that started it has ended, and somebody pressed with a reason. ' +
    'Anything unregistered is never stopped by the product, and no clock reaches a process.',
  'POST /api/runtime/runs/:id/stop':
    '{"why":…} — stop a run that will not stop. Only the agent that started the run, its supervisor or a ' +
    'secretary may, each proved by its own key. In one call it revokes the run\'s key, so the run\'s writes stop at ' +
    'once; stops the process group the ledger recorded for the run, never one found by name or port; and, when it ' +
    'signalled that group, writes on the run who stopped it and why. Of a group it signalled, the run is written ' +
    'crashed only when the group has gone after the signal. When nothing was signalled it is refused, saying what ' +
    'was found: with 409 when no group is recorded, its row is closed or its group had ended already, with 503 ' +
    'when nothing was ended and its program may still run, and with the release\'s own status when the release ' +
    'refused. On Windows the group is ' +
    'the Job Object the run\'s starter made, and it is ended at once. The key is revoked all the same. The run then ' +
    'says only that its key was revoked, with what it said before kept after it. When its group had ended already, ' +
    'the run is written crashed as well. A call that revoked no key either writes nothing on the run.',
  'GET /api/resources':
    'The ledger: what sessions have registered. Live rows only by default; ?includeReleased=true adds the ones ' +
    'already let go, ?sessionRecordId=<id> narrows it to one session and ?pgid=<n> to one process group. A live ' +
    'row carries a reading of this machine taken as you asked. A row already let go does not: it is closed, so ' +
    'its liveness and its session both say that nothing was looked at.',
  'GET /api/resources/orphans':
    'What is still alive whose owning session has ended, and exactly what releasing each one would do: the group, ' +
    'the signal, and every other process that would go with it. It also carries what is running that no ledger ' +
    'row claims, where it looked, and a warning saying what could not be checked and what is still open — ' +
    'reading an empty list as "all clear" is the mistake this endpoint exists to prevent. It sends only the ' +
    'fields the running column reads. It changes nothing.',
  'GET /api/resources/scan':
    'The machine as it is, whether or not anything was ever registered: every listening port with the process ' +
    'group holding it, the GPU, the containers, and the lock files under the configured paths. This is the view ' +
    'that catches a session which died before it wrote anything down, which the ledger alone cannot.',
  'GET /api/resources/servers':
    'Every Mole Office dev-stack process running on this machine, and who owns each one: the server answering you, ' +
    'that server\'s own group, a session that is still going, a session that has ended, a ledger row that has ' +
    'stopped describing what is running, or nobody. Each row carries the ports it holds, the database files it ' +
    'has open, whether the process that started it has gone, and whether the directory it is running in still ' +
    'exists. `answering` says which corpus THIS server is serving, so two servers on one machine can be told ' +
    'apart. It changes nothing and signals nothing — where a person could end something the command is printed ' +
    'with everything it would end. Read `couldNotLook` first: when the process table could not be read this says ' +
    'so and refuses to describe the machine as clear.',
  'GET /api/resources/holding':
    '?ports=<n>,<n>&database=<absolute path> — does a live world hold this port or this database file? A cleanup ' +
    'asks this before it frees a port or removes a database, and refuses for each row in `holders`. ' +
    'A row holds a port when it is a port row for that number or its world serves on that port, ' +
    'and a database when its world names that file by its path or its identity. Every project is read. The machine is asked about each row ' +
    'found: one whose process has gone is in `openButGone` and holds nothing; one the machine could not answer ' +
    'about is a holder. It signals nothing and closes no row.',
  'POST /api/resources/sweep':
    'Close open process rows of runs recorded as finished, crashed or orphaned, only after checking that the ' +
    'recorded process is gone or its pid belongs to a different process. Available to the person, a secretary ' +
    'or the ledger’s own tending. Names every row closed or left open and why. Signals nothing. This explicit ' +
    'write removes stale rows while keeping real leftovers visible; reading the ledger never closes a row.',
  'POST /api/resources/:id/release':
    'Kill one registered resource, by process GROUP, and record who asked and what they confirmed. Body ' +
    '{"expect":"<the confirmPhrase you were shown>","signal"?:"SIGTERM"|"SIGKILL","force"?:true,"note"?:…}. The ' +
    'machine is read again HERE and the sentence rebuilt from that reading: 400 if the phrase does not match what ' +
    'this release would act on now (the current sentence comes back in the message), 409 if it moved in between — ' +
    'pid recycled, port changed hands, session came back to life. Nothing is signalled in either case. A row whose ' +
    'process is already GONE is closed instead of killed, including one whose pid or port is now held by a ' +
    'different process: nothing is signalled, any caller the door already ' +
    'admits may close it whether or not it registered the row and while the session is still running, and the ' +
    'row says who closed it, that the process was found gone, and whether a different process now holds its number. ' +
    'With {"signalNothing":true} (and no expect, signal or force) NOTHING is signalled. A row whose process is ' +
    'gone is closed as above. A row whose process is still running, or cannot be read, is closed only for the ' +
    'session that registered it (403 otherwise), and the row says that session closed it and nothing was ' +
    'signalled. Use it to stop tracking something you leave running, such as a process in Mole Office\'s own ' +
    'group or the process sending the request.',
  'POST /api/resources/:id/withdraw':
    'Take back a row that should never have been written. It signals NOTHING: the thing the row names is left ' +
    'exactly as it is, and only the row is closed. Body {"because":"…"}, required and not blank, saying in your ' +
    'own words why the row was wrong — it goes on the row after the words "withdrawn as a mistake by the session ' +
    'that registered it, and nothing was signalled", so a reader can tell it from a row somebody stopped. Only ' +
    'the session named on the row may withdraw it (403 otherwise), and only while the row is still live (409 once ' +
    'it has ended). It is refused for a row Mole Office wrote for itself — one that says the product started the ' +
    'process AND whose session record says the session IS that process — because that pair really does say the ' +
    'process is this session\'s own work; release those instead. NOTHING ELSE IS CHECKED, and the reply says so ' +
    'in `notChecked`: nothing stored says who caused a process to exist, so a withdrawal is a session taking back ' +
    'its own claim and not Mole Office agreeing the claim was wrong. Use release, not this, to stop something.',

  // ------------------------------------------------------------------ source
  'GET /api/source':
    'The source index: every file in the repository the scan covers, with its language, size, line count, what it ' +
    'imports and exports, and when it last changed. Two optional query parameters, and no others — an unknown one ' +
    'is refused rather than ignored. ?module=<record id> narrows it to the files that module claims, each claim ' +
    'resolved and the stale ones listed separately; in a project with registered repositories, each stated row is ' +
    'counted against the stored scan of the repository it names, and every file and count names that repository. ' +
    '?path=<prefix> narrows it to one directory or one file, ' +
    'matched on whole path segments from the repository root ("src/server" gives src/server/... and not ' +
    'src/serverless.ts). The two may be combined. DERIVED — rebuilt by scanning, never edited, and every answer ' +
    'says when it was built and how old that makes it. 404 until the first POST /api/source/reindex.',
  'GET /api/source/coverage':
    'Which files no module has taken responsibility for, which claims point at paths that no longer exist, and the ' +
    'percentage of the index that is claimed. Computed on read from the index and the live module records. In a ' +
    'project with registered repositories, each repository is counted against its own stored scan, as ' +
    'GET /api/source?module= counts it: `repositories` gives each one\'s counts or says it was not counted and how ' +
    'to scan it, and every stale claim names its repository. A 409 says how to scan when none of them has a scan.',
  'GET /api/source/where':
    'Where a name is, answered from the source index before any search of the repository. ?name=<X> is a file ' +
    'name with or without its extension, a path end such as "api/source.ts" (matched on whole segments), an ' +
    'exported name, or a module\'s title or id; ?limit= caps each list, 20 unless sent, at most 100. The answer ' +
    'gives each matching file with its repository, how it matched and the modules whose claims match it, and each ' +
    'matching module with the files its claims match in the scan now and its stale claims, which are never given ' +
    'as files. Each list cut at the limit says what it left out in subtraction and leftOutGroups, on the answer ' +
    'and on each module, naming every file left out by its path, after its repository\'s name and a colon when it ' +
    'is from a repository\'s scan. A name nothing matches is a 200 with ' +
    'answered false and noAnswer saying so: search the repository then. The scan can be older than a checkout, so ' +
    'check each path. 404 or 409 when no scan is stored.',
  'POST /api/source/reindex':
    'Rebuild the index from the repository and report what changed since the last scan: files added, files ' +
    'removed, and for each file that moved, what differs. It also scans every registered repository that has a ' +
    'checkout on this machine into its own slot, and names each one it could not scan. Takes NO BODY — there is nothing to configure, and a ' +
    'body is refused rather than ignored. This is the ONLY write: there is no PUT or PATCH for a source file, ' +
    'because anything typed into a derived index is deleted by the next scan. What a module is responsible for is ' +
    'stated as rows of the implementation map, through POST /api/implementation.',
}

/**
 * Every endpoint's sentence, in one lookup. This is what GET /api reads, and the only thing that
 * should be: a route file asking which map its line is in would be asking about the split rather
 * than about the endpoint.
 */
export const ALL_ROUTE_NOTES: Readonly<Record<string, string>> = { ...ROUTE_NOTES, ...DERIVED_ROUTE_NOTES }

/**
 * Endpoints that carry a sentence beside the route AND have a line in the maps above.
 *
 * One endpoint, one sentence. Two means one of them is dead prose that nobody serves and nobody
 * will ever correct, which is worse than none: the map is what a person greps, and the route is
 * what the server answers with. This is reported rather than thrown, because it is a mistake in
 * the source that a test must catch at build time, and GET /api -- the thing you read when the
 * rest is broken -- must not be the request that fails because of it.
 */
export function endpointsDescribedTwice(routes: readonly ApiRoute[]): string[] {
  return routes.filter((route) => route.note !== undefined && routeKey(route) in ALL_ROUTE_NOTES).map(routeKey)
}

// ============================================================================ the /api index

/** One endpoint in the index. `description` is null when nobody has written a line for it. */
export interface ApiEndpoint {
  method: string
  path: string
  description: string | null
  /**
   * TRUE WHEN THE SERVER HOLDS THIS REQUEST OPEN instead of answering and closing it. Absent on an
   * ordinary endpoint. A caller that waits for a held-open reply to finish waits for ever.
   */
  waits?: true
}

export interface ApiIndex {
  name: string
  purpose: string
  startHere: string
  /** Who a write is attributed to. Sent as headers; enforced in src/server/lib/http.ts. */
  attribution: Record<ActorHeaderName, string>
  /**
   * WHICH PROJECT a request is about. Beside `attribution` because it is the same shape of fact —
   * a header, read on every route, refused when it arrives present and blank — and a different
   * one: attribution says who is writing, this says which project they are writing in.
   *
   * Three sentences and not a document: which workspace this request was answered from, how to
   * name a different one, and where the list is. An agent that reads only GET /api can work in
   * the right project from that alone.
   */
  workspace: {
    /** The workspace THIS request was answered from, so the answer is about the reader. */
    current: string
    /** Whether the request said so, or took the default. */
    stated: boolean
    [WORKSPACE_HEADER]: string
    listing: string
  }
  endpoints: ApiEndpoint[]
}

/**
 * The answer to GET /api, built from the routes the server really has.
 *
 * A route's own note wins over the maps, because it is the one that cannot be left behind when the
 * route moves. Neither is not fatal: an endpoint nobody has described is still listed, with
 * `description: null`. Hiding it would be the original bug in miniature -- a caller cannot ask
 * about an endpoint it has never been told exists, whereas "this exists and nobody has described
 * it" is at least true and actionable. It is not, however, acceptable: an audit found twelve
 * endpoints answering null here, including the rebuild one an agent had to guess the body of, and
 * a later one found eight more, so tests/server-surface.test.ts builds the whole registered
 * surface and fails the suite if any route on it has no sentence.
 */
export function apiIndex(routes: readonly ApiRoute[], workspace: { current: string; stated: boolean }): ApiIndex {
  return {
    name: 'Mole Office',
    purpose:
      'A record of research done with AI agents: what is being built, what has been measured, what is owed and what is still unknown.',
    startHere:
      'GET /api/families — the cheap way in: one line for every family of doors, and GET /api/families/<name> ' +
      'opens one family. Use it when the door you want is not the handful GET /api/onboarding names, so you ' +
      'never have to read this whole list to find one. GET /api/kinds — every kind of record with its fields ' +
      'and a worked example of its `data`, and the link vocabulary beside them as `linkTypes`. A record whose ' +
      '`data` does not match its kind is refused, and so is a link whose `type` is not one of those words, so ' +
      'read it before you POST. EVERY EXAMPLE HERE IS SAFE ' +
      'TO COPY, which is worth saying because one was not: `pipeline`\'s listed four block ids no record held, ' +
      'and POST /api/records checked none of them, so copying it verbatim was answered 201 with ' +
      '`incomplete: []` and left a pipeline that POST /api/records/<id>/blocks then refused to add a block to. ' +
      'The create path now runs the same three rules PATCH does and the example is an empty order. Still create ' +
      'a pipeline empty and add each block through that route — it is the only way to file a block anyway.',
    attribution: {
      [ACTOR_HEADERS.type]:
        `who the write is ATTRIBUTED to: ${ACTOR_TYPES.join(', ')}. A word outside that list is refused. ` +
        'PRESENT AND BLANK is refused rather than read as absent, because an unset variable in a client\'s header ' +
        'template produces exactly that. THESE HEADERS ARE ATTRIBUTION, NOT IDENTITY: what makes a caller the person ' +
        'is the key the office made at first run, sent as x-mole-office-key or as the pairing cookie, and a key sent ' +
        'with none of these headers is filed as whoever it proves. So an agent sends its own key with these headers. ' +
        'While the person\'s key window is open, a claim with no key still counts from this computer and from a ' +
        'machine the office trusts, but a claim to be the person, or a request with none of these headers, counts ' +
        'from this computer only when its own programs sent it, never a sandbox; from anywhere else a claim with no ' +
        'key is nobody at the person\'s own doors. A request with none of these headers and no key is filed as human ' +
        'there and inside the office\'s own program; anywhere else it is refused with 403, outside the doors a caller ' +
        'uses to get a key and the pairing page. Once the person has closed the key window, a write with no key is ' +
        'refused with 403 whatever these headers say, outside the doors a caller uses to get a key, and the one of ' +
        'them that registers an agent takes only an agent\'s name.',
      [ACTOR_HEADERS.id]:
        'a name for whoever is writing, e.g. claude-code. Present and blank is refused, for the same reason as the ' +
        'type above. Absent means the office\'s owner only on a request that sends none of the three headers and no ' +
        'key, and only where the type above says such a request is answered. A write that sends ' +
        `${ACTOR_HEADERS.type} or ${ACTOR_HEADERS.session} and leaves this one off is refused with 400, and ` +
        'nothing is written: sending any of the three is a claim to be somebody, and the claim must say both who ' +
        'and what. Like the type, this names the write and does not prove the caller; the key is what proves the ' +
        'person.',
      [ACTOR_HEADERS.session]:
        'which run this write belongs to: the id of the run\'s `session` record. Optional: a write by an agent ' +
        'without it is still written, and its answer carries a notice that it named no run. Present and blank is ' +
        'refused, and on a write so is the id of a record that is not a `session`. A write that carries a key may ' +
        'name only a run that key holds; the office\'s key and the person\'s own keys name any run. An agent\'s own ' +
        'key holds its run by the id of the session record, or by a run name already bound to that record, so an ' +
        'agent FILES ITS SESSION RECORD FIRST, sending no session header, and sends that record\'s id from then on. ' +
        'A run name sent with an agent\'s key before its session record is filed is refused with 403, and nothing ' +
        'is written. A run name comes to mean a session record when a write that sends the name, and is allowed to ' +
        'send it, files that record; the 201 says so. What is stored on the change row is the resolved record id ' +
        'wherever one can be found, so the log joins to records rather than to strings.',
    },
    workspace: {
      current: workspace.current,
      stated: workspace.stated,
      [WORKSPACE_HEADER]:
        'which PROJECT this request is about. One Mole Office installation holds several isolated projects and every ' +
        'record, link, change, session, resource and export belongs to exactly one of them. ABSENT means ' +
        `"${DEFAULT_WORKSPACE}" — a stated default, not a guess — and present-and-blank is refused, for the same ` +
        'reason as the actor headers above. An id that names no workspace is REFUSED rather than created, because ' +
        'a misspelt one would file the write into a project nobody has and nothing spelling it right would find it ' +
        'again. Every read answers about one workspace, every write lands in one, a title resolves within one, and ' +
        'a link whose two ends are in different workspaces is refused with a sentence naming both. It is not a ' +
        'user, a role or an access rule: nothing here authenticates anybody.',
      listing:
        'GET /api/workspaces — every project this installation holds, with how many live records are in each and ' +
        'which one your requests are being answered from. POST /api/workspaces establishes a new one.',
    },
    endpoints: routes.map((route) => ({
      ...(route.waits === true ? { waits: true as const } : {}),
      method: route.method,
      path: route.path,
      description: route.note ?? ALL_ROUTE_NOTES[routeKey(route)] ?? null,
    })),
  }
}

// ============================================================================ one family, and the index of them

/** One family in the middle level: its name, how many doors it holds, and the one line saying what it is for. */
export interface FamilySummary {
  name: string
  doors: number
  line: string | null
}

/** What GET /api/families answers. `opening` says how to open one family. */
export interface FamilyIndexResponse {
  families: FamilySummary[]
  opening: string
}

/** One family's own reply: the family's line, and its doors in the shape GET /api already uses. */
export interface FamilyView {
  name: string
  line: string | null
  doors: number
  endpoints: ApiEndpoint[]
}

/** What GET /api/families/:name answers when the name is not a family. Same `error` field as every refusal. */
export interface UnknownFamilyResponse {
  error: string
  families: FamilySummary[]
}

/** The sentence saying how to open one family, shared by the index and the two 404s. */
const OPENING_ONE_FAMILY =
  'Open one family with GET /api/families/<name> or GET /api?family=<name>; GET /api lists every door with a ' +
  'line each.'

/** A route's own sentence, the same lookup GET /api makes: the note beside the route, or the map, or null. */
function descriptionOf(route: ApiRoute): string | null {
  return route.note ?? ALL_ROUTE_NOTES[routeKey(route)] ?? null
}

/**
 * WHAT THE ROUTES THAT DECLARE ONE OPERATION SAY THEY DO, read as GET /api reads each: the one sentence where every one
 * of them says the same, and null where none says anything or two say different things, since then no one sentence is
 * what the operation does. The page of a grant's acts names a door the list has no words for by it.
 */
export function whatTheRoutesOfAnOperationSay(operation: string, routes: readonly ApiRoute[]): string | null {
  const said = new Set(routes.filter((route) => route.operation === operation).map(descriptionOf))
  if (said.size !== 1) return null
  return [...said][0] ?? null
}

/** The doors grouped by family, in family-name order, so the answer reads the same on every request. */
function familiesOf(routes: readonly ApiRoute[]): { name: string; doors: ApiRoute[] }[] {
  const byFamily = new Map<string, ApiRoute[]>()
  for (const route of routes) {
    const name = familyOf(route.path)
    const held = byFamily.get(name) ?? []
    held.push(route)
    byFamily.set(name, held)
  }
  return [...byFamily.entries()]
    .map(([name, doors]) => ({ name, doors }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * THE ONE LINE FOR ONE FAMILY. A family with exactly one door speaks with that door's own
 * description, cut to its first sentence; every other family's line is the one written in
 * FAMILY_LINES. A family with no door and no line is a null and never an invented sentence — the
 * test in tests/api-families.test.ts is what keeps that from ever being the state of the table.
 */
export function familyLineOf(name: string, doors: readonly ApiRoute[]): string | null {
  if (doors.length === 1) {
    const only = doors[0]
    const description = only === undefined ? null : descriptionOf(only)
    return description === null ? null : firstSentenceOf(description)
  }
  return FAMILY_LINES[name] ?? null
}

/** Every family with its count and its line. */
export function familyIndexOf(routes: readonly ApiRoute[]): FamilyIndexResponse {
  return {
    families: familiesOf(routes).map(({ name, doors }) => ({
      name,
      doors: doors.length,
      line: familyLineOf(name, doors),
    })),
    opening: OPENING_ONE_FAMILY,
  }
}

/** One family's doors, or null when the name is not a family. */
export function familyView(routes: readonly ApiRoute[], name: string): FamilyView | null {
  const found = familiesOf(routes).find((family) => family.name === name)
  if (found === undefined) return null
  return {
    name,
    line: familyLineOf(name, found.doors),
    doors: found.doors.length,
    endpoints: found.doors.map((route) => ({
      ...(route.waits === true ? { waits: true as const } : {}),
      method: route.method,
      path: route.path,
      description: descriptionOf(route),
    })),
  }
}

/** What an unknown family name answers, offering the families that do exist. */
export function unknownFamily(name: string, routes: readonly ApiRoute[]): UnknownFamilyResponse {
  const known = familiesOf(routes).map((family) => family.name)
  const suggestion = suggestKey(name, known)
  return {
    error:
      `There is no family "${name}".` +
      (suggestion !== null ? ` Did you mean "${suggestion}"?` : '') +
      ` GET /api/families lists all ${String(known.length)} families with a line each.`,
    families: familyIndexOf(routes).families,
  }
}

// ============================================================================ the 404 body

/** What an unknown /api path answers with. `error` is the field the browser client reads. */
export interface NoSuchEndpoint {
  error: string
  opening: string
  /** Every family, when the path named none of them. The cheap catalogue, never 370 door names. */
  families?: FamilySummary[]
  /**
   * The doors of the family the caller was close to, when the unknown path's first segment IS a
   * family. Door names rather than the whole catalogue, because a caller that got the family right
   * needs the doors inside it.
   */
  endpoints?: string[]
}

/**
 * The body for a request to an /api path that matched no route.
 *
 * It carries the FAMILIES, not all 370 door names: the caller is lost, and a middle level of
 * sixty-odd lines is something it can read where the whole catalogue is not. When the unknown
 * path's first segment IS a family the caller was close, so it names that family's doors instead,
 * which is the one thing that finishes the request.
 *
 * The audit tried /api, /api/schema and /api/kinds, was told "No such endpoint" three times with
 * no alternatives, and went and read the source instead. A 404 that names what does exist turns
 * three dead ends into one request.
 */
export function noSuchEndpoint(method: string, url: string, routes: readonly ApiRoute[]): NoSuchEndpoint {
  // Compare paths without the query string: /api/recordz?kind=module was a wrong path, not a
  // wrong filter, and matching the whole string would find nothing to suggest.
  const path = normalisePath(url.split('?')[0] ?? url)
  const suggestion = suggestKey(
    path,
    routes.map((r) => r.path),
  )

  const didYouMean = suggestion !== null && suggestion !== path ? ` Did you mean ${suggestion}?` : ''
  const near = familyOf(path)

  // THE CALLER WAS CLOSE. The first segment is a family this server has, so the useful answer is
  // that family's doors, not the list of families the caller already found.
  const family = familyView(routes, near)
  if (family !== null && near !== 'api') {
    return {
      error:
        `No such endpoint: ${method} ${url}.${didYouMean} ` +
        `"${near}" is a family this server has; its ${String(family.doors)} doors are listed below, and ` +
        `GET /api lists every door with a line each.`,
      opening: OPENING_ONE_FAMILY,
      endpoints: family.endpoints.map((endpoint) => `${endpoint.method} ${endpoint.path}`),
    }
  }

  return {
    error:
      `No such endpoint: ${method} ${url}.${didYouMean} ` +
      `This server has ${String(familyIndexOf(routes).families.length)} families of endpoints; they are listed ` +
      'below with a line each, and GET /api lists every door with a line each.',
    opening: OPENING_ONE_FAMILY,
    families: familyIndexOf(routes).families,
  }
}

// ============================================================================ nested shapes

/** The declared shape names, in declaration order, so output is stable. */
const SHAPE_NAMES = Object.keys(SHAPE_SPECS)

/**
 * The shape names a declared type mentions.
 *
 * A type is written for a person and parsed by the checker in shared/kinds/type-reader.ts: `string`,
 * `ModulePart[]`, `Record<string, number>`, `'todo' | 'doing'`. This does NOT re-implement that
 * grammar -- it looks for words that are names in SHAPE_SPECS, which is a lookup and cannot
 * disagree with the parser about what a type means. Quoted values are removed first so a union
 * of strings can never be mistaken for a shape.
 */
function shapeNamesIn(type: string): string[] {
  const withoutLiterals = type.replace(/'[^']*'/g, ' ')
  const words = withoutLiterals.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []
  // hasOwnProperty rather than `in`, which would also match inherited names like `toString`.
  return words.filter((word) => Object.prototype.hasOwnProperty.call(SHAPE_SPECS, word))
}

/**
 * Every shape a kind's fields reach, following nesting all the way down.
 *
 * Followed rather than listed one level deep because one level is not enough to write the field
 * that broke: `module.summaryBlocks` is a `SummaryBlock[]`, a SummaryBlock has no fields of its
 * own but five variants chosen by `type`, a ChartBlock holds a ChartSpec, and a ChartSpec holds
 * axes, series and points. Stopping early would hand back a shape with an empty field list,
 * which reads as "nothing goes in here".
 */
export function shapesFor(spec: KindSpec): ShapeSpec[] {
  const found = new Set<string>()
  const queue: string[] = spec.fields.flatMap((field) => shapeNamesIn(field.type))

  while (queue.length > 0) {
    const name = queue.pop()
    // The loop condition already guarantees this; the check is here because the compiler cannot
    // see that, and an assertion would be a lie waiting to become true.
    if (name === undefined) break
    if (found.has(name)) continue

    const shape = SHAPE_SPECS[name]
    if (!shape) {
      // Only reachable when a discriminator in shared/kinds.ts names a variant that was never
      // declared. Loud, because the alternative is telling a caller a chart block exists and
      // then never saying what is in it.
      throw new Error(
        `src/shared/kinds.ts refers to a shape named "${name}", but SHAPE_SPECS has no such entry.`,
      )
    }
    found.add(name)

    for (const field of shape.fields) queue.push(...shapeNamesIn(field.type))
    // A discriminated shape names its variants nowhere else; without this, asking about a module
    // returns SummaryBlock with `fields: []` and no way to find out what a chart block contains.
    if (shape.discriminator) queue.push(...Object.values(shape.discriminator.variants))
  }

  return SHAPE_NAMES.filter((name) => found.has(name)).map((name) => {
    const shape = SHAPE_SPECS[name]
    if (!shape) throw new Error(`unreachable: ${name} came from Object.keys(SHAPE_SPECS)`)
    return shape
  })
}

// ============================================================================ the routes

// ============================================================================ the link vocabulary

/**
 * One link type, with everything needed to choose it and to read it back.
 *
 * `forward` is how the link reads on the record that STORES it and `reverse` is how the same one
 * row reads from the other end. There is no second row: see LINK_TYPES in shared/types.ts.
 */
export interface LinkTypeSpec {
  type: LinkType
  forward: string
  reverse: string
  /** True when both ends read the same, so which way round it was written carries no meaning. */
  symmetric: boolean
  /** True when this type may carry a gate saying how much it blocks. Exactly one type may. */
  mayCarryGate: boolean
  /**
   * WHICH FACT THIS TYPE ASSERTS, AND WHEN TO REACH FOR A DIFFERENT ONE.
   *
   * `forward`/`reverse` are the words a record draws; this is the judgement a caller has to make
   * before choosing between two types that can look interchangeable — `about` and `blocks`,
   * `duplicate_of` and `supersedes`, `consumes` and `measures`. It used to live only as a comment
   * beside `LINK_TYPES` in src/shared/types.ts, so an agent reading nothing but the API could see
   * the eleven words and never the reason to pick one over another. Declared once on `LINK_TYPES`
   * itself, so this and the served list cannot disagree.
   */
  description: string
}

/**
 * The one link type that may carry a gate.
 *
 * WRITTEN A SECOND TIME HERE, AND THIS IS THE ONLY PLACE IT COULD BE. The server's copy is
 * `GATED_LINK_TYPE` in src/server/lib/records.ts, and importing that opens the database at import
 * time, which this file must never do -- see the header. So the two are pinned by a test instead:
 * tests/kinds-api.test.ts imports both and fails if what is published stops matching what is
 * enforced.
 */
const GATE_CARRYING_LINK_TYPE = 'blocks'

/**
 * The link types, served rather than discovered by being refused.
 *
 * Until this was published the only way to learn the vocabulary from a running server was to send
 * a wrong one and read the list back out of the 400. Seven agents recorded this pass through the
 * API and four of them looked for these words; `supersedes` appeared nowhere in GET /api or
 * GET /api/kinds, which are the two endpoints the README sends a caller to.
 *
 * Derived from LINK_TYPES, so a type added or renamed there is served here without anybody
 * remembering to come back.
 */
export const LINK_TYPE_SPECS: readonly LinkTypeSpec[] = Object.entries(LINK_TYPES).map(
  ([type, labels]) => ({
    type: type as LinkType,
    forward: labels.forward,
    reverse: labels.reverse,
    symmetric: labels.symmetric,
    mayCarryGate: type === GATE_CARRYING_LINK_TYPE,
    description: labels.description,
  }),
)

/** What GET /api/kinds answers: describeKinds(), plus the sentences on how to use it. */
export interface KindsResponse {
  /** Which project a record is filed in, and how a request says so. See the route for why. */
  workspace: string
  kinds: KindSpec[]
  shapes: ShapeSpec[]
  humanOnly: readonly string[]
  writing: string
  /**
   * The typed relationships records may have with each other.
   *
   * The second of the three tables Mole Office is made of. It is served beside the kinds because the
   * two questions are one question -- what may I write, and how may I connect it -- and because
   * this is the endpoint every caller is told to read first.
   */
  linkTypes: readonly LinkTypeSpec[]
  linking: string
}

/** What GET /api/kinds/:kind answers when the name is one. */
export interface KindResponse {
  kind: KindSpec
  shapes: ShapeSpec[]
}

/** What it answers when the name is not one. Same `error` field as every other failure here. */
export interface UnknownKindResponse {
  error: string
  kinds: readonly RecordKind[]
}

const isRecordKind = (value: string): value is RecordKind =>
  (RECORD_KINDS as readonly string[]).includes(value)

export interface DiscoveryOptions {
  /**
   * The live route table, as a function because it is read per request: most routes are
   * registered after this plugin is.
   */
  listRoutes: () => readonly ApiRoute[]

  /**
   * Which project this request is being answered from, and whether the request said so.
   *
   * PASSED IN RATHER THAN READ HERE, and required rather than defaulted. Resolving a workspace
   * means checking it against the registry, which means reaching the database — and this file may
   * not, for the reason in the header: the schema is what you read when the rest is broken, so a
   * database that will not open must not take it down. src/server/index.ts supplies it from the
   * same gate every other route uses, so the index cannot answer cheerfully for a misspelt
   * workspace that a write would refuse.
   *
   * No default, because a default would be this codebase's own recurring defect: GET /api would go
   * on saying `default` while every write landed somewhere else, and nothing would fail.
   */
  currentWorkspace: (req: FastifyRequest) => { current: string; stated: boolean }
}

/**
 * The three discovery routes, registered together under /api because they answer one question at
 * three depths: what families there are, what is in one family, and what goes in a record.
 */

/** What GET /api/families declares about itself, in the route table and on GET /api. */
const FAMILY_INDEX_NOTE =
  'THE MIDDLE LEVEL OF THIS API: every family the doors fall into, by the first segment of its path, each ' +
  'with how many doors it holds and one line saying what it is for. Families are DERIVED from the path and ' +
  'never declared, so a new door joins its family with nothing to keep in step. One family\'s line is its ' +
  'single door\'s own description; the rest are written once in src/server/api/kinds.ts, and a test fails ' +
  'when a family arrives without one. Open one with GET /api/families/<name> or GET /api?family=<name>. ' +
  'Use this when the door you want is not one GET /api/onboarding names, so you never have to read the ' +
  'whole list to find it.'

/** What GET /api/families/:name declares about itself. */
const FAMILY_NOTE =
  'ONE FAMILY OF DOORS, each in the shape GET /api already uses for a door — its method, its path and its ' +
  'one-line description — plus the family\'s own line and how many doors it holds. 404 with the list of ' +
  'families when the name is not one. The same answer comes from GET /api?family=<name>, for a caller that ' +
  'only knows the front door.'

export const discoveryRoutes: FastifyPluginAsync<DiscoveryOptions> = async (app, opts) => {
  /** The index. Registered as '/' under the /api prefix, so it answers on /api and /api/. */
  //
  // IT READS THE WORKSPACE HEADER through the same gate every other route uses, so the index
  // refuses an unknown project exactly as a write would. An index that answered cheerfully for a
  // misspelt workspace would be the one page telling a caller its header was fine.
  app.get('/', route('project.index', 'remote'),
    async (req, reply): Promise<ApiIndex | FamilyView | UnknownFamilyResponse> => {
      // THE WORKSPACE HEADER IS READ HERE TOO, through the same gate, so the index refuses an
      // unknown project exactly as a write does whether or not a family was asked for.
      const workspace = opts.currentWorkspace(req)
      const routes = opts.listRoutes()
      const asked = (req.query as { family?: unknown } | undefined)?.family
      if (asked === undefined) return apiIndex(routes, workspace)
      // ?family=<name> ANSWERS WHAT GET /api/families/:name ANSWERS, so a caller that only knows
      // the front door never has to learn a second path to open one family.
      const name = typeof asked === 'string' ? asked : ''
      const family = familyView(routes, name)
      if (family === null) {
        reply.status(404)
        return unknownFamily(name, routes)
      }
      return family
    })

  // THE MIDDLE LEVEL. One line for every family of doors, and one family's doors in full. Both
  // derive the family from the path, so neither can drift from the route table.
  app.get('/families', route('project.index', 'remote', FAMILY_INDEX_NOTE),
    async (req): Promise<FamilyIndexResponse> => {
      opts.currentWorkspace(req)
      return familyIndexOf(opts.listRoutes())
    })

  app.get<{ Params: { name: string } }>('/families/:name', route('project.index', 'remote', FAMILY_NOTE),
    async (req, reply): Promise<FamilyView | UnknownFamilyResponse> => {
      opts.currentWorkspace(req)
      const routes = opts.listRoutes()
      const family = familyView(routes, req.params.name)
      if (family === null) {
        reply.status(404)
        return unknownFamily(req.params.name, routes)
      }
      return family
    })

  app.get('/kinds', route('project.schema', 'remote'), async (): Promise<KindsResponse> => {
    // describeKinds() is served whole rather than picked over: `shapes` is what makes a field
    // like `parts: ModulePart[]` writable, and `humanOnly` is the difference between a 403 an
    // agent can predict and one it walks into.
    const described = describeKinds()
    return {
      ...described,
      writing:
        'POST /api/records with {"kind":…,"title":…,"data":{…}}. `data` is checked against the fields below: an ' +
        'unknown key is refused with the declared key it was probably meant to be, and nothing is trimmed, ' +
        'defaulted or rewritten. Anything a kind has no field for goes in its `extra` object. ' +
        // NAMING THE THREE KEYS, AND NOTHING ELSE ABOUT THEM. What a `share` and a `measure` mean,
        // what they may hold and what Mole Office does when it cannot give what was asked for are
        // written once, in the BesideBlock and BesidePart shapes served on this same page. A second
        // account of them here would be the one fact worked out in two places, and the two would
        // drift. This sentence exists because an agent that never learns the block exists never
        // reads those shapes at all.
        'Things drawn beside each other are written as a `beside` block: each part is named, may say what it is ' +
        'worth beside the other parts with `share`, and — where the part holds writing — may say how wide ' +
        'that writing reads with `measure`. The BesideBlock and BesidePart shapes below say what those take. ' +
        'A block that holds writing may say `measure` on itself too, with no `beside` block anywhere near it, ' +
        'and that is the ordinary way to ask for a reading width: most reports draw nothing beside anything. ' +
        ASK_FIRST_SENTENCE,
      // BESIDE `writing`, because it is the other half of "what does a POST need". Every kind
      // below is filed into ONE project, and the sentence that says which is a header rather than
      // a field — so a caller that read only this page would otherwise learn every field a record
      // takes and nothing about the boundary its record lands behind.
      workspace:
        'Every record is filed in exactly ONE workspace — a project boundary, not a user and not an access ' +
        'rule. Send `x-mole-office-workspace: <id>` to say which; a request that sends none is answered from the ' +
        'default workspace, and an id naming no workspace is refused rather than created. A `title` typed ' +
        'anywhere below — a link\'s `toTitle`, a session reference — resolves inside that workspace ONLY, so ' +
        'two projects may each hold a record called "Tray clamp" and neither can reach the other\'s. A link whose ' +
        'two ends are in different workspaces is refused, naming both. GET /api/workspaces lists them with how ' +
        'many records are in each; GET /api says which one your requests are being answered from.',
      linkTypes: LINK_TYPE_SPECS,
      linking:
        'POST /api/links with {"fromId" or "fromTitle":…, "toId" or "toTitle":…, "type":…}. Either end may be ' +
        'named by its id or by typing its title, and a title that names nothing is refused rather than created ' +
        'behind your back. `type` is one of the words in `linkTypes` below and defaults to relates_to, which ' +
        'says two things are related without saying how. A link is stored ONCE, in the direction you wrote it: ' +
        '`forward` is how it reads on the record the link starts from, `reverse` is how the same single row ' +
        'reads on the record at the other end, and the reverse is shown rather than stored. A type whose ' +
        '`mayCarryGate` is true may also say how much it blocks; GET /api describes that under POST /api/links.',
    }
  })

  app.get<{ Params: { kind: string } }>(
    '/kinds/:kind',
    route('project.schema', 'remote'),
    async (req, reply): Promise<KindResponse | UnknownKindResponse> => {
      const name = req.params.kind

      if (!isRecordKind(name)) {
        // The list goes in the body, not just the message: a caller that got the name wrong is
        // exactly the caller that cannot see the source and has nowhere else to read it.
        const suggestion = suggestKey(name, RECORD_KINDS)
        reply.status(404)
        return {
          error:
            `There is no record kind "${name}".` +
            (suggestion !== null ? ` Did you mean "${suggestion}"?` : '') +
            ` The kinds are: ${RECORD_KINDS.join(', ')}. GET /api/kinds describes all of them.`,
          kinds: RECORD_KINDS,
        }
      }

      const spec = KIND_SPECS[name]
      return { kind: spec, shapes: shapesFor(spec) }
    },
  )
}
