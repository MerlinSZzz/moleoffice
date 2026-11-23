// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { OPERATION_NAMES } from './ops-list.ts'

/**
 * THE OPERATION VOCABULARY: WHAT A CALLER ASKED FOR, WHICH IS NOT WHICH URL IT USED.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A ROUTE IS NOT A QUESTION
 * ---------------------------------------------------------------------------------------
 *
 * A route is a URL, and URLs change. `agent.inbox` is one question — what is waiting for me —
 * whoever answers it. If the route that answers it is replaced next round by a better one, the new
 * route declares the same operation and every measurement taken before the change still counts.
 * Counting URLs instead would restart the record every time somebody tidied a path.
 *
 * So every route declares an operation beside itself, in the same `config` object it already uses
 * for its own sentence, and this file is the closed list of names it may use.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS LIST HOLDS RETIRED NAMES, AND HOW `live` IS READ
 * ---------------------------------------------------------------------------------------
 *
 * `live: true` means a route registered today declares this name. `live: false` means no route
 * does any more, and the name is kept because measurements taken before it was retired still say
 * it. Deleting a retired name would leave old rows naming something this list denies exists.
 *
 * Every name in this file is `live: true` today. Nothing has been retired yet.
 *
 * ---------------------------------------------------------------------------------------
 * `effect` IS ON THE OPERATION AND NOT ON THE ROUTE, AND THAT IS A DEPARTURE
 * ---------------------------------------------------------------------------------------
 *
 * `read` or `write` says WHAT THE ROUTE DOES, never what its HTTP method is. Three routes are
 * POSTs that change nothing, and each says so in its own sentence in GET /api:
 * `POST /api/short-forms/rows` ("Writes nothing."), `POST /api/annotations/readings` ("It is a
 * POST because the input is a list and writes nothing at all") and
 * `POST /api/agent/recipients/resolve` ("It writes nothing and addresses nothing"). Deriving the
 * effect from the method would file three reads as writes.
 *
 * `design/round-ten/design/telemetry.md` section 3.3 puts `effect` on each route and adds a test
 * (its rule 4) asserting that every route of one operation declares the same word. THIS FILE PUTS
 * IT ON THE OPERATION INSTEAD, which is the same repair CLAUDE.md prefers: an operation cannot
 * disagree with itself, so there is nothing for a test to catch. The design's own rule 3 already
 * forbids an operation whose routes differ, which is what makes the field belong here. Nothing
 * else about that section changes: the name is still declared at the route, and the effect is
 * still what the route does.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT BINDS THIS LIST TO THE ROUTES
 * ---------------------------------------------------------------------------------------
 *
 * `operationOn` in src/server/api/kinds.ts throws at registration for a route that declares no
 * operation or one this list does not hold, so the server does not start. tests/ops-vocabulary.test.ts
 * checks the other direction: a `live` name no route declares is a failing test, and so is a
 * retired name a route still declares.
 *
 * A ROUTE AND ITS NAME LAND IN THE SAME COMMIT. Adding a name here before its route exists is a
 * failing test; adding a route before its name is a server that will not start. The same commit is
 * the only one in which the tree is green, which is why this is a rule rather than a preference.
 *
 * The names below started as the assignment worked out in `design/round-ten/design/telemetry.md`
 * section 3.2, over the routes this server registers — 73 names over 144 routes on 25 August 2026,
 * when the assignment was made, and 145 routes once `GET /api/waiting` joined them later the same
 * day with `project.waiting`. `record.history` is the 74th name, added the same day with
 * `GET /api/records/:id/history`. The route total is not restated here: it was measured once by the
 * person who wrote that sentence, and a number nobody re-counted is worse than no number.
 *
 * `record.history` IS NOT `revision.history`, and the two sit next to each other so that nobody
 * folds them together. `revision.history` is the ledger of one record's own versions —
 * `GET /api/records/:id/revisions`. `record.history` is what happened to a record AND to the work
 * it carries, assembled from four kinds of stored row, and for a module it answers about blocks
 * whose own revisions belong to other records entirely.
 *
 * NOTHING HERE OPENS A DATABASE. The sole import holds operation names and no executable logic.
 * src/server/api/kinds.ts reads it at registration and stays away from the database.
 */

/** One name, whether a route still serves it, and what a route serving it does. */
export interface Operation {
  readonly name: string
  readonly live: boolean
  readonly effect: 'read' | 'write'
  /**
   * THIS OPERATION'S CALLS ARE COUNTED BY THE HOUR, NOT STORED ONE ROW EACH. Criterion U6.
   *
   * A long-poll hold repeats — the same waiter asks the same question every few seconds — so a row
   * per request measures the asking rather than the work. So a long-poll is counted by the hour
   * not stored one row a call. One small row per hour, per listener and per
   * operation carries the count, and `src/server/lib/usage.ts` reads this property at its one insert
   * to decide which of the two rows to write.
   *
   * ONE FACT IN ONE PLACE. The alternative — a list of folded operations in the recorder — would be
   * the same fact written down twice, and the two would drift the first time somebody added an
   * operation to one and not the other.
   *
   * ABSENT MEANS STORED ONE ROW EACH, which is every operation that does not carry it.
   */
  readonly countedByTheHour?: true
  /**
   * A CHECK OF ANOTHER ACT: THE WRITE THIS DOOR ASKS ABOUT, WITHOUT DOING IT. Problem jQayki_gIciU.
   *
   * A check door writes nothing, so its effect is `read` and the call log files it as one. But the
   * gates on who may ask (the role cards, a key after the window closed, an unregistered agent) must
   * answer it exactly as they answer the write, or a check would say "accepted" to a caller the write
   * refuses. Those gates read `gatedAs` through `theActAGateAsksAbout`, and nothing else does.
   */
  readonly gatedAs?: string
  /**
   * AN ACT A VISITOR MAY NOT ASK FOR, AND THE REST OF THE SENTENCE IT IS REFUSED WITH.
   *
   * A visitor's request for this act is refused with 403 before its door is reached. The sentence names
   * the credential first, and this text is the rest of it: what the visitor may not do here, and why.
   *
   * It is read by the visitor check in src/server/lib/visitorgate.ts, and nothing else reads it.
   *
   * ABSENT MEANS A VISITOR MAY ASK, which is every operation that does not carry it.
   */
  readonly refusedToVisitors?: string
}

/**
 * THE ACT A GATE ON THE CALLER ASKS ABOUT: the operation itself, or the write it is a check of.
 * Read by the role gate and the write gates in lib/http.ts, so a check is refused wherever its write is.
 */
export function theActAGateAsksAbout(name: string): Operation | undefined {
  const declared = operationNamed(name)
  if (declared?.gatedAs === undefined) return declared
  const checked = operationNamed(declared.gatedAs)
  if (checked === undefined) throw new Error(`Operation ${name} is gated as ${declared.gatedAs}, which this list does not hold.`)
  return checked
}

/** Every operation name Mole Office has ever used, in the order the areas were designed. */
const OPERATION_METADATA = {
  'project.index': { live: true, effect: 'read' },
  'project.schema': { live: true, effect: 'read' },
  'project.workspaces': { live: true, effect: 'read' },
  'project.new-workspace': { live: true, effect: 'write' },
  'project.rename-workspace': { live: true, effect: 'write' },
  'project.open-loops': { live: true, effect: 'read' },
  'project.needs-you': { live: true, effect: 'read' },
  'project.forks': { live: true, effect: 'read' },
  // A READING AND NOTHING ELSE. It compares open forks and proposes groupings with reasons;
  // nothing in it writes, which is the owner's rule that uncertain items are never merged
  // silently. `effect: 'read'` is therefore the whole truth about it, not a default.
  'project.forks.possible-duplicates': { live: true, effect: 'read' },
  'project.waiting': { live: true, effect: 'read' },
  'project.attention': { live: true, effect: 'read' },
  // A POST THAT WRITES NOTHING. It tells the attention thread to read every record again at its next ask, so the
  // office's data is the same before and after, and `effect: 'read'` is the whole truth about it.
  'project.attention-read-again': { live: true, effect: 'read' },
  'project.whose-move': { live: true, effect: 'read' },
  'project.work': { live: true, effect: 'read' },
  // THE OFFICE'S OWN FLOWS, AND WHICH ONES HAVE PROBLEMS. Proposal 1LaCQBRYRjls option A, settled
  // and started at once. Its own name and not
  // `project.link.list` or a `kind=flow` read of /records: the steward needs the count and the
  // per-flow problem counts in one call, which GET /api/records cannot assemble, and "which flows
  // have problems" is a question of its own that the answer exists to make answerable. A read.
  'project.flows': { live: true, effect: 'read' },
  // A PROJECT'S MASTER PIPELINE AND ITS BOARD. Reading which pipeline is the master and marking one are two different
  // facts, so two names; the board is a reading of its own.
  'project.master-pipeline': { live: true, effect: 'read' },
  'project.set-master-pipeline': { live: true, effect: 'write' },
  'project.board': { live: true, effect: 'read' },
  // THE BOARD'S PEOPLE AND PACKAGES: who acts on each line now, under whom, and the line's packages counted by state.
  // A reading of its own, and not the board's, because the fourth tab reads it only when it is chosen. A read.
  'project.people-and-packages': { live: true, effect: 'read' },
  // THE BIG MAP'S DICTIONARY (package BV, point BV-6): a file or a module in, its block, module and owning line out.
  'map.dictionary': { live: true, effect: 'read' },
  // ONE FLOW, AND A PAGE OF ITS RUNS. They are what the Flows page opens, in wave 13p round 33.
  // Their own
  // names, because neither is a record read: one answers a flow's main content with its latest runs, and the other
  // pages the runs that name a flow, found through migration 0212's index. Both are reads.
  'flow.read': { live: true, effect: 'read' },
  'flow.runs': { live: true, effect: 'read' },
  // THE FLOWS PAGE'S FIVE WRITES: a new flow, and a stage added, changed, moved or removed, each writing its own change
  // entry. They came in wave 13p round 34, from two decisions. Their own
  // names, because each checks a version and builds the change entry itself, which the records door does not. All five
  // are writes.
  'flow.create': { live: true, effect: 'write' },
  'flow.stage.add': { live: true, effect: 'write' },
  'flow.stage.change': { live: true, effect: 'write' },
  'flow.stage.move': { live: true, effect: 'write' },
  'flow.stage.remove': { live: true, effect: 'write' },
  // A FLOW'S TRIGGER, WHO RUNS IT AND WHOM IT IS FOR, wave 13p round 40 (proposal Ink4403JeASI part 5, gap 5). Its own
  // name beside the stage writes, because it checks the version as they do and finds the flow by ?projects=. A write.
  'flow.facts.change': { live: true, effect: 'write' },
  'flow.may-write': { live: true, effect: 'read' },
  // WHO IS WORKING ON WHAT, and WHAT HAS BEEN SAID. Two human projections over machinery that
  // already exists, and their own names rather than `project.work` or `agent.threads`: those two
  // answer "what work is there" and "which conversations exist", and these answer "who is on it
  // right now" and "how far has anything anybody said actually got". Both are reads and neither
  // starts, wakes or writes anything.
  'project.who-is-working': { live: true, effect: 'read' },
  'project.what-has-been-said': { live: true, effect: 'read' },
  'project.search': { live: true, effect: 'read' },
  'project.unconsumed': { live: true, effect: 'read' },
  'project.unmet': { live: true, effect: 'read' },
  // THE DECISIONS ON FILE WITH NO LEVEL-3 CONTEXT, criterion DC3. Its own name and not a filtered
  // `GET /api/records`: the reading carries each decision's `because`, its source and the record its
  // authority lives in beside it, and it exists so a secretary can write the missing context rather
  // than rediscover it. A read; nothing is backfilled.
  'project.decisions-without-summary': { live: true, effect: 'read' },
  'project.changes': { live: true, effect: 'read' },
  // WHAT A FRESH AGENT NEEDS BEFORE IT DOES ANYTHING, in one read. Its own name and not
  // `project.index`: that one is the endpoint catalogue, and this is the state of the work, which is
  // a different question with a different answer.
  'project.bootstrap': { live: true, effect: 'read' },
  // EVERYTHING AN AGENT HAS TO READ BEFORE ITS FIRST USEFUL WRITE, in one reply. Its own name and
  // not `project.bootstrap`: that one answers what is true of the project and what contradicts
  // itself, and this one answers what an arriving agent has to be told — the modules, the open work
  // in the order the attention rule puts it, the decisions that already settled things, the rules
  // for writing, and the owner's words that still govern. A measurement that folded the two
  // together could not say which read an agent actually arrived through.
  'project.brief': { live: true, effect: 'read' },
  // WHAT THE SESSION HOOK TELLS A SESSION AT ITS START AND AFTER A COMPACTION: the brief, the waiting list
  // and the open loops in one read, kept for a caller when the office is busy. Its own name, because an
  // answer kept from an earlier request is not what project.brief answers.
  'project.where-you-stand': { live: true, effect: 'read' },
  // WHICH DECISIONS GOVERN A PLACE, AND THE NIGHTLY CHECK OF WHAT THEY GOVERN.
  'decision.governing': { live: true, effect: 'read' },
  'decision.governs-check': { live: true, effect: 'read' },
  // THE DOORS A NEW AGENT KNOCKS ON, AND WHICH PROJECT IT IS IN, in one small read. Its own name
  // and not `project.brief`: that one answers the state of the project and costs thousands of
  // tokens, and this one answers which requests to make and which project they are about, at a
  // budget of three thousand estimated tokens. A measurement that folded the two together could not
  // say which read an agent arrived through.
  'project.onboarding': { live: true, effect: 'read' },
  'record.list': { live: true, effect: 'read' },
  // WHAT THE SETTINGS PAGE'S DETAIL GRID DRAWS, counted on the server. Its own name and not `record.list`:
  // that one answers every live record, and this one answers a few counts and eleven records.
  'record.detail-supply': { live: true, effect: 'read' },
  // THE CONVERSATIONS PAGE'S LIST OF WORK, worked out on the server. Its own name and not `record.list`: that one
  // answers every live record, and this one answers five rows and a few counts.
  'record.work-to-talk-about': { live: true, effect: 'read' },
  // WHAT A PROJECT FILED BETWEEN TWO MOMENTS, one row per record and none of the body. Its own name
  // and not `record.list`: that one answers every live record, and this one answers a window so a
  // check's model run can be counted. Acceptance finding 44, 23 September 2026.
  'record.created-between': { live: true, effect: 'read' },
  // THE REPORTS PAGE'S LIST: reports and notes of every project, grouped and paged. Its own name and not
  // `record.list`: that one answers one project's records of every kind (problem nYadrL5AnC-A).
  'record.reports-and-notes': { live: true, effect: 'read' },
  'record.report-stars': { live: true, effect: 'read' },
  'record.set-report-star': { live: true, effect: 'write' },
  // MY NOTES: the quick notes of every project, searched, counted and paged. A name of its own, as the Reports page has.
  'record.my-notes': { live: true, effect: 'read' },
  // THE NOTE ADD TO NOTE GOES INTO: the one the reader last wrote in, among the notes My notes lists for them.
  'record.my-notes-last-written-in': { live: true, effect: 'read' },
  'record.read': { live: true, effect: 'read' },
  'record.context': { live: true, effect: 'read' },
  // WHAT IS RELATED TO A MODULE OR A PIPELINE AT EVERY DEPTH: its decisions, reports and checklists. Its own name and not
  // `record.context`: that one reads one record's own loops and decisions, and this one walks its parts.
  'record.related': { live: true, effect: 'read' },
  // THE OTHER RECORDS AND LINKS ONE RECORD PAGE DRAWS. Its own name and not `record.list`: that one
  // answers every live record, and this one answers the few a page about one record reads, so a
  // measurement can tell how often the whole listing is still asked for.
  'record.around': { live: true, effect: 'read' },
  // WHAT A RECORD PICKER OFFERS: every live record's title and the note that tells two apart. Its
  // own name because it is asked only while a record is being edited.
  'record.title-options': { live: true, effect: 'read' },
  // WHAT THE LAYOUT WOULD DO WITH THE PROPORTIONS A REPORT ASKED FOR. Its own name and not
  // `record.read`: that one answers what a record holds, and this one answers what would happen to it on a
  // screen of a stated width. It reads and writes nothing.
  'record.layout': { live: true, effect: 'read' },
  'record.write': { live: true, effect: 'write' },
  // WHETHER POST /api/records WOULD ACCEPT A BODY, asked without writing it. Problem jQayki_gIciU.
  'record.check': { live: true, effect: 'read', gatedAs: 'record.write' },
  'record.change': { live: true, effect: 'write' },
  'record.remove': { live: true, effect: 'write' },
  'record.checklist': { live: true, effect: 'write' },
  'record.requirements': { live: true, effect: 'write' },
  'record.fulfil': { live: true, effect: 'write' },
  // CHANGING A DECISION THEY HAVE ALREADY MADE, criterion M83. Its own name and not `record.promote`:
  // how often they change their mind after a press is a fact about the product, and it was unmeasurable
  // while the only way to do it was to file a record and a link by hand.
  'record.choose-again': { live: true, effect: 'write' },
  'record.promote': { live: true, effect: 'write' },
  // The person files words a secretary prepared as their own.
  'record.file-as-my-words': { live: true, effect: 'write' },
  // The page of those words is look A of a decision. It holds the notes
  // still waiting, the person's "Not what I said", and their "Confirm all" over the notes the page shows.
  'record.not-what-i-said': { live: true, effect: 'write' },
  'record.confirm-all-my-words': { live: true, effect: 'write' },
  'project.the-persons-words-waiting': { live: true, effect: 'read' },
  'record.restore': { live: true, effect: 'write' },
  'record.move': { live: true, effect: 'write' },
  'record.body': { live: true, effect: 'write' },
  'record.short-forms': { live: true, effect: 'read' },
  'record.short-forms-write': { live: true, effect: 'write' },
  // WHETHER POST /api/records/:id/short-forms WOULD ACCEPT A BODY, asked without writing it.
  'record.short-forms-check': { live: true, effect: 'read', gatedAs: 'record.short-forms-write' },
  'record.history': { live: true, effect: 'read' },
  'revision.history': { live: true, effect: 'read' },
  'revision.read': { live: true, effect: 'read' },
  'revision.compare': { live: true, effect: 'read' },
  'revision.restore': { live: true, effect: 'write' },
  // Taking back an act an agent made on the owner's own quoted words. Its own name rather than a
  // second `revision.restore`, because the two answer different questions about the same table: one
  // is somebody putting an earlier version back, and this is somebody saying an agent read their
  // words wrongly. Counting them together would make the second invisible.
  'act.revoke': { live: true, effect: 'write' },
  'link.list': { live: true, effect: 'read' },
  'link.write': { live: true, effect: 'write' },
  'link.remove': { live: true, effect: 'write' },
  'structure.read': { live: true, effect: 'read' },
  'structure.write': { live: true, effect: 'write' },
  'structure.clear': { live: true, effect: 'write' },
  'structure.compare': { live: true, effect: 'read' },
  'plan.week': { live: true, effect: 'read' },
  'plan.read': { live: true, effect: 'read' },
  'plan.write': { live: true, effect: 'write' },
  // MARKING A PLAN AS READ, which moves the moment the plan's page counts new lines from. It has its own name because
  // this office's list of what the grant carries may let a secretary press it for the person, while writing a plan is a
  // door of its own on that list.
  'plan.mark-read': { live: true, effect: 'write' },
  'plan.time': { live: true, effect: 'write' },
  'agent.inbox': { live: true, effect: 'read' },
  'agent.threads': { live: true, effect: 'read' },
  'agent.thread-write': { live: true, effect: 'write' },
  'agent.dispatch': { live: true, effect: 'write' },
  'agent.runs': { live: true, effect: 'read' },
  'agent.run-claim': { live: true, effect: 'write' },
  'agent.run-result': { live: true, effect: 'write' },
  'agent.recipients': { live: true, effect: 'read' },
  'review.list': { live: true, effect: 'read' },
  'review.read': { live: true, effect: 'read' },
  'review.start': { live: true, effect: 'write' },
  'review.collect': { live: true, effect: 'write' },
  'review.organise-preview': { live: true, effect: 'read' },
  'review.organise': { live: true, effect: 'write' },
  'review.send-preview': { live: true, effect: 'read' },
  'review.send': { live: true, effect: 'write' },
  'review.comments': { live: true, effect: 'read' },
  // AN AGENT'S SEMANTIC LIFECYCLE. `attachment.*` is about one PERIOD OF PARTICIPATION and
  // `agent.*` is about the durable identity that outlives every one of them, and the split is the
  // whole point: nothing here equates a durable agent, a temporary attachment,
  // a provider session, a process and a terminal. NONE OF THESE SIX STARTS ANYTHING. There is no
  // `agent.start` and no `agent.resume`, because a route under src/ still cannot spawn a process.
  // What starts a provider
  // is a separate process — the message worker under src/worker/, whose four doors are at the foot
  // of this list, or the Agent Host in tools/ that a person runs by hand.
  'attachment.list': { live: true, effect: 'read' },
  'attachment.open': { live: true, effect: 'write' },
  // `attachment.close` IS NOT `runtime.claim` AND IS NOT A KILL. Closing an attachment ends a
  // period of participation and touches no process. Stopping a runtime is the resource ledger's
  // act, on its own surface, behind a typed phrase.
  'attachment.close': { live: true, effect: 'write' },
  // THE CHILD RUNS A PROVIDER STARTED INSIDE ANOTHER RUN. Observed, kept under the parent, and
  // never promoted: a child is not a durable agent, not a work-domain owner and not a message
  // recipient. `attachment.sweep-children` closes the ones Mole Office has stopped hearing from, which
  // is the third of the three ways a child ends and the reason each close says which one it was.
  'attachment.children': { live: true, effect: 'read' },
  'attachment.sweep-children': { live: true, effect: 'write' },
  // TWO READINGS AND NOT ONE STATUS. Presence answers whether the agent can be reached; work state
  // answers what it is supposed to be doing. All fifteen pairs occur, and one name for both would
  // have to pick a word for Offline and Working, which is what an API death looks like.
  'agent.presence': { live: true, effect: 'read' },
  'agent.work-state': { live: true, effect: 'read' },
  'agent.work-state-move': { live: true, effect: 'write' },
  // WANTING AN AGENT WOKEN IS A ROW SOMEBODY WRITES, AND NOTHING ACTS ON IT. `agent.wake-wanted`
  // records that a wake is wanted; it is not `agent.wake`, because nothing here wakes anybody and
  // a name that said otherwise would be the operation lying about what the caller gets.
  // `agent.wake-candidates` answers which agents WOULD be candidates and acts on none of them.
  // Whether Mole Office may ever start a process on this machine is the owner's open question, and
  // `design/round-eleven/design/the-wake-boundary.md` is the account of what is built and what is not.
  'agent.wake-wanted': { live: true, effect: 'write' },
  'agent.wakes': { live: true, effect: 'read' },
  'agent.wake-candidates': { live: true, effect: 'read' },
  'run.process-ended': { live: true, effect: 'read' },
  'run.closed-after-its-end': { live: true, effect: 'write' },
  // AN AGENT MOVED TO ANOTHER PROJECT BY THE PERSON'S PRESS on its page. The preview names
  // what would move and what would stay, and writes nothing. The move carries the agent's record and its ended runs in
  // one record move; a run still going stays where it is, and the answer says why.
  'agent.project-move-preview': { live: true, effect: 'read' },
  'agent.project-move': { live: true, effect: 'write' },
  'agent.starter-read': { live: true, effect: 'read' },
  'agent.starter-preview': { live: true, effect: 'read' },
  'agent.starter-move': { live: true, effect: 'write' },
  'agent.owner-move': { live: true, effect: 'write' },
  'session.list': { live: true, effect: 'read' },
  // ONE RUN'S OWN CALLS, READ BACK AS A TIMELINE. Split from `session.list` rather than folded under
  // it because it is a different question about a run, over `api_calls` and the change log rather
  // than over the machine, and its reply can be wide enough to be worth its own row in the usage
  // reading.
  'session.timeline': { live: true, effect: 'read' },
  // ONE RUN'S FLOW RUN, AND A STEP ADDED TO IT. Wave 1 of the office flow, M1. A read of one record by the run's
  // id, and a write of one step; neither reads the whole office.
  'session.flow-run': { live: true, effect: 'read' },
  'session.flow-run-step': { live: true, effect: 'write' },
  'session.discover': { live: true, effect: 'write' },
  'session.link': { live: true, effect: 'write' },
  // WHAT A SESSION NEEDS BACK FIRST AFTER A COMPACTION, IN ONE SMALL READ, in wave 13k round
  // 46.
  // Its own name and not `project.where-you-stand`, because it is the read the hook sends first and the one that must
  // stay small: a count per operation has to tell how often and how slowly it is answered apart from the big one.
  'session.after-a-compaction': { live: true, effect: 'read' },
  'runtime.health': { live: true, effect: 'read' },
  'runtime.resources': { live: true, effect: 'read' },
  // THE ORPHAN READ, WITH A NAME OF ITS OWN. `runtime.resources` is claimed by six routes that
  // read the machine and the ledger; `GET /api/resources/orphans` answers a different question —
  // what is alive whose owning session has ended — and it runs on the page's thirty-second clock
  // beside the machine sweep. While the two shared one name, a count per operation could not tell
  // the sweep from the orphan read (problem 1O_hor2KlyPY). `runtime.resources` is kept for the
  // machine sweep it fits best; this is the second door's own name. Rows written before the split
  // keep the old name for the seven days an untraced request row is kept — the `untracedRequestDays`
  // default in src/shared/what-is-kept.ts.
  'runtime.orphans': { live: true, effect: 'read' },
  'runtime.claim': { live: true, effect: 'write' },
  // WHO MAY REACH MOLE OFFICE AND FROM WHERE. It is not `runtime.*`: those three are about what is
  // running on this machine, and this is about what can arrive at it, which is a different
  // question with a different answer even on a machine running nothing.
  'machine.access': { live: true, effect: 'read' },
  'source.read': { live: true, effect: 'read' },
  'source.index': { live: true, effect: 'write' },
  // A TICKET FOR ONE FILE, SEC-2 item 3: an address a browser's own load opens one file with. It is a write because
  // it puts the ticket into the app's book, though the book is in memory and no row is written.
  'source.ticket': { live: true, effect: 'write' },
  // THE DIRECTORIES A PREVIEW MAY READ, for one project. ITS OWN NAME AND NOT `source.read`:
  // `source.read` is the bytes of one file, and this is the fence around them, which the Settings
  // page draws. A measurement that folded the two together could not tell a read of a file from a
  // read of the boundary that decides whether the file may be read at all.
  'preview.roots.read': { live: true, effect: 'read' },
  // ADDING A DIRECTORY BY HAND, criterion U4's odd case. A write, and its own name for the reason
  // the read has one: it changes the fence rather than reading it, and a measurement that folded the
  // two together could not answer how often the boundary is widened by hand.
  'preview.roots.change': { live: true, effect: 'write' },
  // THE IMPLEMENTATION MAP. `source.read` is NOT reused for these: `source.read` is "what is in
  // this checkout", and these are "where does this project meaning live in the implemented world",
  // which is a different question with a different answer even when the bytes overlap. Reusing the
  // name would make every measurement of one unreadable as a measurement of the other.
  'implementation.repositories': { live: true, effect: 'read' },
  'implementation.repository-write': { live: true, effect: 'write' },
  'implementation.record': { live: true, effect: 'read' },
  'implementation.resource': { live: true, effect: 'read' },
  'implementation.write': { live: true, effect: 'write' },
  // ITS OWN NAME AND NOT `implementation.write`, because accepting is a governance act and not an
  // ordinary write: only a person may do it, and a measurement that folded the two together could
  // not answer how often the person is being asked to settle something.
  'implementation.accept': { live: true, effect: 'write' },
  'implementation.rebuild': { live: true, effect: 'write' },
  'implementation.revisions': { live: true, effect: 'read' },
  'implementation.revisions-write': { live: true, effect: 'write' },
  'anchor.read': { live: true, effect: 'read' },
  'anchor.write': { live: true, effect: 'write' },
  // THE WORK DOMAIN. `resolve` is a POST that STORES what it concluded, so its effect is `write`
  // and not `read`: an operation's effect is what the route does and never what its method is, and
  // a recovery's "then it did something" has to stay true. `overlaps` and `list` are reads that
  // materialise nothing at all -- an overlap has no table, no row and no id anywhere.
  'workdomain.resolve': { live: true, effect: 'write' },
  'workdomain.accept': { live: true, effect: 'write' },
  'workdomain.acknowledge': { live: true, effect: 'write' },
  'workdomain.observe': { live: true, effect: 'write' },
  'workdomain.list': { live: true, effect: 'read' },
  'workdomain.read': { live: true, effect: 'read' },
  'workdomain.overlaps': { live: true, effect: 'read' },
  'workdomain.presence': { live: true, effect: 'read' },
  // WHAT AN AGENT READ IN A FOLDER, BEFORE ANY OF IT IS A RECORD. Three names and not one, because
  // filing a reading, looking at one and accepting a piece of one are three different acts by three
  // different callers, and a measurement that folded them together could not say whether anybody
  // ever pressed anything.
  'import.draft': { live: true, effect: 'write' },
  'import.drafts': { live: true, effect: 'read' },
  'import.accept': { live: true, effect: 'write' },
  'archive.plan': { live: true, effect: 'read' },
  'archive.write': { live: true, effect: 'write' },
  // WHICH RESTRICTIONS REACH A RECORD OR A SCOPE. Its own name and not `record.read`: a caller
  // asking what a result may not be claimed for is asking a different question from a caller
  // reading the result, and a measurement that folded them together could not say whether anybody
  // ever looks.
  'restriction.read': { live: true, effect: 'read' },
  // RECORDING A JUDGEMENT ABOUT ONE PIECE OF WORK AFTER A RESTRICTION WAS RESOLVED. A write, and
  // its own name for the same reason: this is the act the whole re-validation mechanism exists to
  // make somebody perform, and it has to be countable on its own.
  'restriction.judge': { live: true, effect: 'write' },
  // WHAT SOMEBODY WANTED A COPY OF. Reading the bundles filed in a project, and previewing the text
  // one produces, are the same question — what would this bundle say — asked about a stored spec or
  // about one being composed, so they share a name.
  'bundle.read': { live: true, effect: 'read' },
  // HOW AGENTS READ THIS PROJECT. Eight names and no more, and the count is held by a test: a
  // ninth `usage.` name would inherit the recorder's exemption for reads and go uncounted, which is
  // a table quietly stopping short of the thing it exists to measure.
  'usage.summary': { live: true, effect: 'read' },
  'usage.operations': { live: true, effect: 'read' },
  'usage.traces': { live: true, effect: 'read' },
  'usage.trace': { live: true, effect: 'read' },
  'usage.patterns': { live: true, effect: 'read' },
  'usage.sequences': { live: true, effect: 'read' },
  // WHICH TOOL THE AGENTS RAN IN, WHERE THEY WERE REFUSED AND HOW LONG BEFORE THEY WROTE ANYTHING.
  // Its own name and not `usage.operations`: that one counts what was called, and this one answers
  // who called it and how long they took to be useful. A call row says neither.
  'usage.agents': { live: true, effect: 'read' },
  // A CROSSED THRESHOLD BECOMES A PROPOSAL FOR THE PERSON. Its own name and a write, because it is
  // the only thing in the usage family that puts a row in the corpus; every other usage operation
  // only counts what is already there.
  'usage.propose': { live: true, effect: 'write' },
  'usage.outside': { live: true, effect: 'read' },
  // THE ONE WRITE IN THE FAMILY, AND IT IS RECORDED. An agent reporting that it went outside Mole Office
  // is part of the evidence, so the recorder's `usage.` exemption is on reads and not on the family.
  'usage.report-outside': { live: true, effect: 'write' },
  // THE ACT OF HANDING PROJECT CONTEXT TO AN AGENT MOLE OFFICE DOES NOT RUN. Its own name and its own
  // effect, because this is the only operation in the product whose whole purpose is that text
  // leaves the building, and how often it happens has to be countable on its own.
  'bundle.export': { live: true, effect: 'write' },
  // WHO TAKES PART. Their own names and not `record.*`: a person and a durable agent are rows of the
  // installation's two registries and not records of a project, so a measurement that folded them
  // together could not answer how often anybody reads or changes an identity at all.
  'participant.list': { live: true, effect: 'read' },
  'participant.read': { live: true, effect: 'read' },
  // ONE PARTICIPANT'S WHOLE PAGE, criterion M51. Its own name and not `participant.read`: it is one
  // request standing in for eight, and folding it into the plain read would hide how much of a page
  // that one call answers.
  'participant.profile': { live: true, effect: 'read' },
  // ONE AGENT'S OWN CONTEXT, RESTORED BY WHO IT IS: its card, the project it works in, what it left
  // unfinished, its last session and what changed since. Its own name and not `participant.profile`:
  // the profile is one participant's whole page read by anybody, and this is keyed by the agent's
  // own key and answers what the agent itself needs before it works. F15 point 4.
  'participant.restore': { live: true, effect: 'read' },
  'participant.change': { live: true, effect: 'write' },
  'office.scene-settings.read': { live: true, effect: 'read' },
  'office.scene-settings.change': { live: true, effect: 'write' },
  'office.appearance.read': { live: true, effect: 'read' },
  'office.appearance.change': { live: true, effect: 'write' },
  // ITS OWN NAME AND NOT `participant.change`, because this one takes bytes somebody sent and writes
  // a file. How often a picture is uploaded is the question the size limit is judged by, and folding
  // it into every name change would make it uncountable.
  'participant.avatar': { live: true, effect: 'write' },
  // HOW A PERSON OR AN AGENT WISHES TO BE ADDRESSED. Its own name
  // and not `participant.change`, because its rule is its own: the caller must be proved, a person as
  // themselves and an agent by its own key.
  'participant.address-as': { live: true, effect: 'write' },
  // WHETHER AN AGENT READS A RELEASE FROM THE CHECK'S OWN RESULT (wave 13y round 9, answer HeBxwj6QRGjS). Its own
  // name, because its rule is its own: the agent with its own key or the owner, with a reason.
  'participant.release-reading': { live: true, effect: 'write' },
  // ONE PERSON'S LOOK AND OWN THEMES, READ AND SET AT A DOOR OF THEIR OWN (src/server/api/the-persons-look.ts). Their own
  // names and not `participant.read` and `participant.change`, because their rule is their own: that person, or a
  // secretary holding the person's grant, for the person this office is for.
  'participant.look': { live: true, effect: 'read' },
  'participant.set-look': { live: true, effect: 'write' },
  // PERMANENT RESIDENTS AND THEIR PERSONAL SPACES, on the proposal GsGFiDygATd5 and a decision.
  // Their own family: a residency is a standing on top of citizenship, with its own proposal, its own press and its
  // own folder, and none of these is a change to a participant's card. `resident.one` and `resident.space` are
  // reads, and each may append a line to the resident's session-origin file, which the route's sentence says, in
  // the way `handle.list` says the tidying it does.
  'resident.list': { live: true, effect: 'read' },
  'resident.propose': { live: true, effect: 'write' },
  'resident.confirm': { live: true, effect: 'write' },
  'resident.decline': { live: true, effect: 'write' },
  'resident.one': { live: true, effect: 'read' },
  'resident.space': { live: true, effect: 'read' },
  'resident.file.read': { live: true, effect: 'read' },
  'resident.file.write': { live: true, effect: 'write' },
  'resident.void': { live: true, effect: 'write' },
  'resident.grant': { live: true, effect: 'write' },
  'resident.grant.end': { live: true, effect: 'write' },
  'resident.successor': { live: true, effect: 'write' },
  'resident.sleep': { live: true, effect: 'write' },
  'resident.wake': { live: true, effect: 'write' },
  'resident.sleep.postpone': { live: true, effect: 'write' },
  'resident.sleep.time': { live: true, effect: 'write' },
  'resident.package.reminder.every': { live: true, effect: 'write' },
  'resident.named': { live: true, effect: 'write' },

  // THE ONE MESSAGE POOL. `message.conversation` is a read that writes when a person reads it, and it
  // says so rather than being filed as a read: a person opening a conversation marks the messages in
  // it as having reached them, which is the delivery mark criterion M1 asks for. An agent's read of it
  // marks nothing (criterion M127). Filing it as a read would put a person's writes in nobody's count.
  'message.pool': { live: true, effect: 'read' },
  'message.carryable-agent-ids': { live: true, effect: 'read' },
  // THE EMERGENCY MESSAGES THIS SCREEN HAS NOT DISMISSED. Criterion M62. A read, and narrowed by
  // where the reader is, which is measured on the request rather than sent by it.
  'message.forced': { live: true, effect: 'read' },
  'message.read': { live: true, effect: 'read' },
  'message.contacts': { live: true, effect: 'read' },
  'message.notice-rules': {live:true,effect:'read'},
  'message.set-notice-rules': {live:true,effect:'write'},
  'message.restore-notice-rules': {live:true,effect:'write'},
  // THE NUMBER ON THE CHAT CIRCLE ALONE, for a closed panel. Its own name so that how often a closed
  // panel asks can be counted apart from how often an open one reads the whole contact list.
  'message.circle': { live: true, effect: 'read' },
  // THE CHAT'S CONTACT LIST A PAGE AT A TIME. Its own name so that how often the chat reads
  // a page can be counted apart from how often anything reads the whole list.
  'message.contact-list': { live: true, effect: 'read' },
  // HOW ONE PERSON HAS ARRANGED THEIR CONTACTS. Their own three names and not `message.*`: an
  // arrangement is about the reader rather than about a message, and folding these into the read
  // of the contacts list would make "how often does anybody move a contact" uncountable.
  'contact.group.make': { live: true, effect: 'write' },
  'contact.group.change': { live: true, effect: 'write' },
  'contact.placement': { live: true, effect: 'write' },
  'message.conversation': { live: true, effect: 'write' },
  // A WRITE FOR THE SAME REASON A CONVERSATION IS: opening what an unregistered writer sent hands
  // those messages to the reader, so the ones still queued for them become delivered.
  'message.unregistered': { live: true, effect: 'write' },
  'message.mark': { live: true, effect: 'write' },
  // THE SEEN MARKS FOR WHAT IS ON A SCREEN, MANY IN ONE CALL. Its own name, not `message.mark`: one call
  // marks many messages, so counting it as one mark would say fewer messages were read than were.
  'message.mark-seen': { live: true, effect: 'write' },
  // NOT NOW ON A LEAD OFFER. Its own name, not `message.mark`: it moves no mark, and how often a person
  // puts an offer off is a different count from how often anybody reads a message.
  'message.not-now': { live: true, effect: 'write' },
  // REMIND ME LATER ON A LEAD OFFER: its own name for the same reason, and it sets when a line reaches the person.
  'message.remind-me-later': { live: true, effect: 'write' },
  // "MARK BROKEN" ON AN AGENT'S REPLY: its own name, because it files a problem and tells an agent.
  'message.mark-broken': { live: true, effect: 'write' },
  'message.start-an-agent': { live: true, effect: 'write' },
  'agent.start-a-new-agent': { live: true, effect: 'write' },
  // WHETHER THAT PRESS WOULD CARRY ANYTHING, which the chat asks before it offers the press. A read.
  'agent.start-a-new-agent.would-carry': { live: true, effect: 'read' },
  'message.comments': { live: true, effect: 'read' },
  // WHAT THE GROUPS THIS AGENT IS IN HAVE GAINED SINCE IT LAST LOOKED. Criterion GM4. A write for
  // the same reason `message.conversation` is: the door moves the reader's own read point when it is
  // asked to, and filing that as a read would put the write in nobody's count.
  'message.groups-new': { live: true, effect: 'write' },
  // A PICTURE ON ITS WAY INTO A MESSAGE. Criterion M65. Its own name rather than `record.write`,
  // because it writes a FILE and no record at all: the message pointing at that file is a separate
  // write through the one message door, and folding the two together would make "how many pictures
  // were sent" uncountable.
  'message.picture': { live: true, effect: 'write' },
  // AND WHAT MAY BE SENT AS ONE, so a composer says the limit before it refuses anybody. A read.
  'message.picture.limits': { live: true, effect: 'read' },
  // ANY OTHER FILE ON ITS WAY INTO A MESSAGE, for the reason the picture has its own name: it writes a file and no record.
  'message.file': { live: true, effect: 'write' },

  // A FILE BROUGHT BACK FROM OUTSIDE. Criterion F16, point 5:
  // an outside return may be a zip, and this is the one door that takes one. Its own name and not
  // `message.picture`: this writes a FILE and no record at all, and the record that points at the
  // file is written by a later piece through the ordinary record door. Folding the two together
  // would make "how often does an outside return arrive" uncountable.
  'returned-file.store': { live: true, effect: 'write' },
  // AND WHAT MAY BE SENT AS ONE, so a person choosing a file is told the limit and the type before
  // they choose rather than refused after. A read.
  'returned-file.limits': { live: true, effect: 'read' },

  // A FILE A REPORT CARRIES AS A FILE. Criterion R3. Its own name and
  // not `returned-file.store`: that one takes a zip brought back from outside, and this takes any
  // file a report is handing to a reader. Folding the two together would make "how often does an
  // outside return arrive" and "how often does a report carry a file" one uncountable number.
  'report-file.store': { live: true, effect: 'write' },
  // AND WHAT MAY BE SENT AS ONE, so a person choosing a file is told the size limit before they
  // choose rather than refused after. A read.
  'report-file.limits': { live: true, effect: 'read' },
  'report-file.unnamed': { live: true, effect: 'read' },
  'storage.categories': { live: true, effect: 'read' },
  'report-file.named-inside': { live: true, effect: 'read' },
  // A REPORT'S PAGE PRINTED AS A PDF by the app's own window program. A read, though it is a POST:
  // it stores nothing, and the temporary folder it prints in is gone before it answers. A visitor
  // may not ask for it, because each print starts a program on this office's computer.
  'report-pdf.print': {
    live: true,
    effect: 'read',
    refusedToVisitors:
      "a visitor may not print a PDF here, because each print starts a program on this office's computer. This request was refused and nothing was printed.",
  },

  // GROUPS: A CONVERSATION WITH SEVERAL SUBSCRIBERS (M11). Opening one and adding a member each
  // write a line as Mole Office itself, so both are writes for two reasons rather than one.
  // `group.read` is a read that writes when a person reads a group they are not in, for the reason
  // `message.as-a-side` is: the read itself is recorded.
  'group.list': { live: true, effect: 'read' },
  'group.read': { live: true, effect: 'write' },
  'group.open': { live: true, effect: 'write' },
  'group.add-member': { live: true, effect: 'write' },
  'group.remove-member': { live: true, effect: 'write' },

  // WORK CLAIMS (M13). Filing one may open a group without anybody asking, so it writes twice; the
  // two reads write nothing at all.
  'claim.list': { live: true, effect: 'read' },
  'claim.on-a-record': { live: true, effect: 'read' },
  'claim.file': { live: true, effect: 'write' },
  'claim.renew': { live: true, effect: 'write' },
  'claim.release': { live: true, effect: 'write' },

  // PACKAGING A TASK, AND THE COLUMN OF PACKAGED TASKS (criterion F16). Its own family rather than
  // `record.*`: packaging is one act that files a bundle, links it and writes the package field in
  // one transaction, and how often a task is packaged for somebody else has to be countable on its
  // own. The read is the column a person opens and the place a new agent's first task is.
  // Read inside briefs.
  'delegation.inside': { live: true, effect: 'read' },
  'delegation.list': { live: true, effect: 'read' },
  // One package's workers and a day's packages, both readings of the records. Round FQ, point OP-3.
  'delegation.workers': { live: true, effect: 'read' },
  'delegation.workersDay': { live: true, effect: 'read' },
  // Take a brief inside.
  'delegation.takeInside': { live: true, effect: 'write' },
  // Restate the brief.
  'delegation.align': { live: true, effect: 'write' },
  // Answer the restatement.
  'delegation.alignAnswer': { live: true, effect: 'write' },
  // Hand back the points.
  'delegation.handBack': { live: true, effect: 'write' },
  // Check the hand-back.
  'delegation.check': { live: true, effect: 'write' },
  // Accept or return the points of the hand-back.
  'delegation.accept': { live: true, effect: 'write' },
  // Record an evidenced self-completion or reopening.
  'delegation.selfComplete': { live: true, effect: 'write' },
  // Record a planned audit verdict.
  'delegation.audit': { live: true, effect: 'write' },
  // Read calculated child progress.
  'delegation.progress': { live: true, effect: 'read' },
  'delegation.package': { live: true, effect: 'write' },
  // A PERSON'S TAKE (criterion F16, points 3 and 4). Its own name and not `delegation.package`
  // again: packaging writes the bundle and the words for an outside reader, and a take is a
  // different fact entirely — a promise to bring the work back from outside the office — written
  // onto the task's own append-only list rather than replacing anything packaging wrote.
  'delegation.take': { live: true, effect: 'write' },
  // WHAT SOMEBODY OUTSIDE THE OFFICE SENT BACK, PUT ON THE TASK BY THE PERSON. Criterion F16 point
  // 5. Its own name: a return is not a take and not a package, and it is the fact the column's
  // `returned` state is worked out from.
  'delegation.return': { live: true, effect: 'write' },
  // THE ONE RESPONSIBLE, OR THE PERSON, SAYING A TASK IS FINISHED. Criterion F16 point 5. Its own
  // name: the confirmation is the last step after the ordinary acceptance and is not a write to the
  // package, to a return or to a claim.
  'delegation.confirm': { live: true, effect: 'write' },
  // MAKING THE TEXT A PERSON COPIES INTO AN OUTSIDE CHAT, AND SCREENING IT FIRST. Criterion F16
  // points 1 and 6. Its own name: it is the one act that records that the package's text left the
  // building, through the bundle's own export entry, and how often a package was handed outside is
  // its own question separate from packaging it or taking it.
  'delegation.exportOutside': { live: true, effect: 'write' },
  // THE SAME TEXT AS A PAGE A BROWSER CAN SELECT. Criterion F16 points 1 and 6, and criterion B29's
  // shape. Its own name: it is the door that RECORDS NOTHING, so counting it beside the export would
  // say text left when the page only showed what the export would produce.
  'delegation.text': { live: true, effect: 'read' },

  // WHICH LIVE SESSION IS ANSWERING AS A DURABLE AGENT (criteria H1 to H4). Holding a handle,
  // saying the session is still there, and letting go are all writes: each changes who the next
  // message goes to. Reading who is answering is a read, and it releases a hold that went quiet —
  // which is a write, and the one place in this vocabulary where a read tidies up after itself.
  // It is `read` because that is what the caller asked for and what the reply is about; the tidying
  // is said out loud in the route's own sentence.
  'handle.list': { live: true, effect: 'read' },
  'handle.one': { live: true, effect: 'read' },
  'handle.waiter': { live: true, effect: 'read' },
  'handle.hold': { live: true, effect: 'write' },
  // A BEAT IS A WAITER SAYING IT IS STILL THERE, once every twenty seconds, so it is 180 rows an
  // hour per waiter — more than the hold itself. It is counted by the hour too
  // (report 8YeCJi-x8sBg, rq2): the beat is the same repeated liveness write, the fact it
  // carries lives on the hold record's last_heard_at and not in api_calls, and folding it
  // loses nothing a person reads.
  'handle.beat': { live: true, effect: 'write', countedByTheHour: true },
  'handle.release': { live: true, effect: 'write' },
  'handle.took': { live: true, effect: 'write' },
  // A SESSION RECORDING ITS OWN PROCESS ON THE RECORD IT HOLDS A HANDLE FOR. It is a write: the
  // process is what makes a waiting session read as answering, so what it changes is who the next
  // message goes to. Not counted by the hour — a waiter asks it once per run, after the hold.
  'handle.process': { live: true, effect: 'write' },
  // A HOLD IS ANSWERED ONCE AND ASKED AGAIN AND AGAIN. The waiting door holds a request open when
  // it is asked to and answers at once otherwise; both kinds of call are this one operation, so
  // both are counted by the hour. Criterion U6 names this operation.
  'handle.waiting': { live: true, effect: 'read', countedByTheHour: true },
  // WHICH OF THE AGENTS ONE AGENT STARTED STILL HAVE A RUN IN STATE running. Its own name, not `handle.waiting`:
  // the Stop hook asks it at every end of a supervisor's turn, and how often that question is asked has to be
  // countable apart from how often a message queue is read. A read of stored rows, changing nothing.
  'handle.running-workers': { live: true, effect: 'read' },
  'handle.knows': { live: true, effect: 'read' },

  // THE CHANNEL. `events.stream` is a request the server holds open, which is why its route also
  // declares `waits`: a connection that lasted an hour inside a median would make every median a
  // lie. It writes nothing but the note that a page is open.
  'events.stream': { live: true, effect: 'read' },
  'events.state': { live: true, effect: 'read' },

  // WHETHER ANYBODY CAN BE REACHED RIGHT NOW. A measurement taken at the moment somebody asks and
  // stored nowhere, so it is a read however much work it does.
  'presence.all': { live: true, effect: 'read' },
  'presence.one': { live: true, effect: 'read' },

  // THE OWNER READING A CONVERSATION THEY ARE NOT IN. It writes nothing on any message, and the row
  // this call leaves in `api_calls` — who asked, when, and which pair — is the record of the read.
  'message.between-agents': { live: true, effect: 'read' },
  'message.as-a-side': { live: true, effect: 'read' },
  // READING A PICTURE. Not `record.read`: an asset belongs to the installation rather than to a
  // project, and a reader asking for bytes is asking a different question with a different answer.
  'asset.read': { live: true, effect: 'read' },
  // THE PICTURES THIS PRODUCT OFFERS, so a person picks one instead of finding a file on a disk.
  // Their own two names and not `asset.read`: an asset is a picture somebody was given, and these
  // are the ones nobody has been given yet, read off the files in this checkout.
  'avatar.on-offer': { live: true, effect: 'read' },
  'avatar.on-offer.bytes': { live: true, effect: 'read' },
  // THE PICTURE ON THE ROUND CHAT BUTTON, criterion M38. Its own name and not one of the two above:
  // those are pictures offered TO a participant, and these belong to the product itself, so nobody
  // can be given one and they are not in the picker.
  'chat.circle.picture': { live: true, effect: 'read' },

  // THE MESSAGE WORKER'S DOORS. The worker is a process Mole Office starts, and it holds no
  // database path: it reads what is waiting here and says here what it did. Every one is kept on
  // this machine under `starts-work-on-this-machine`, because the runs they are about are processes
  // in this machine's own process table and a caller elsewhere would be talking about another one.
  //
  // `worker.queue` is recorded as a read; its explicit marking form uses the needs-no-run write gates.
  // `worker.runs` is a read. `worker.answered` is the one that
  // files words under an agent's name, and it is refused unless the caller can name the run those
  // words came out of — see the header of src/server/api/worker.ts.
  'worker.queue': { live: true, effect: 'read' },
  // WHAT IS ALREADY GOING, so a worker that was restarted can pick its runs back up. A worker keeps
  // the runs it is watching in memory, and the API server restarts on every merge under `tsx watch`.
  'worker.runs': { live: true, effect: 'read' },
  // WHICH RUNS ARE HOLDING A CONVERSATION OPEN FOR THE NEXT MESSAGE, and the door that ends one when
  // the wait has run out. Criterion M22, on decision `5k2UP25NnN57`. The wait's length is
  // a setting; the words the ending writes are the server's, so a caller cannot choose them.
  'worker.waits': { live: true, effect: 'read', countedByTheHour: true },
  'worker.wait-over': { live: true, effect: 'write', countedByTheHour: true },
  // WHAT THE OFFICE WANTS ITS MERGE TOOL FOR, AND WHICH MERGE TOOL RUNS ARE GOING. Sandbox v1, piece
  // P9: the worker starts tools/the-merger.mjs for a merge entry the office marked, in a slot of its
  // own. Read on every pass, as `worker.queue` is, and stored one row each as that one is: the
  // operations counted by the hour are the ones a decision names, under criterion U6.
  // Adding one to that list is the person's to decide, not a piece's.
  'worker.merges': { live: true, effect: 'read' },
  // A RESOLVING MERGE ENTRY'S HOUR IS OVER, and the queue bounces it (XHY2fVFG3Qq8, answer 2). The worker
  // asks this for each entry the merge list answers under `hourOver`; the bounce writes the entry and its notice.
  'worker.merge-hour-over': { live: true, effect: 'write' },
  'worker.gates-run-out': { live: true, effect: 'write' },
  'worker.take-back-needs-person': { live: true, effect: 'write' },
  'worker.take-back': { live: true, effect: 'write' },
  // A RESTART OF THE API CUT A RUN OFF BEFORE IT ANSWERED. Criterion M24: it is ended and said,
  // rather than left as a record saying `running` for a process that is gone and a person waiting.
  'worker.cut-off': { live: true, effect: 'write' },
  // CRITERION W6: what a shutdown would find at work, and the shutdown that pauses it first.
  'office.live-runs': { live: true, effect: 'read' },
  'office.shut-down': { live: true, effect: 'write' },
  // THE OFFICE'S OWN TERMINALS (wave 13u): the list, opening one, reading its screen and output, typing,
  // resizing and closing. Every one but the list is the person's only (src/server/api/terminals.ts).
  'terminals.list': { live: true, effect: 'read' },
  'terminals.open': { live: true, effect: 'write' },
  'terminals.read': { live: true, effect: 'read' },
  'terminals.type': { live: true, effect: 'write' },
  'terminals.resize': { live: true, effect: 'write' },
  'terminals.close': { live: true, effect: 'write' },
  // THE PERSON'S TYPING AS THEIR OWN WORDS (round 3): the last line they typed, and keeping it as a note of theirs.
  'terminals.last-line': { live: true, effect: 'read' },
  'terminals.keep-line': { live: true, effect: 'write' },
  // THE PERSON'S TYPING KEPT WITH NO PRESS (round 4): each terminal's switch, and the note its lines go in.
  'terminals.keeping': { live: true, effect: 'read' },
  'terminals.set-keeping': { live: true, effect: 'write' },
  // THE NAME, THE GROUP AND THE TAGS THE PERSON GIVES A TERMINAL, kept in the holder with it.
  'terminals.name': { live: true, effect: 'write' },
  // STARTING THE TERMINAL HOLDER FROM THE PAGE (round 3; the review of round 2, point 1).
  'terminals.start-holder': { live: true, effect: 'write' },
  // RESTARTING IT FROM SETTINGS (round 23): it ends every terminal the holder holds.
  'terminals.restart-holder': { live: true, effect: 'write' },
  // THE INSTALL PRESS (wave 13u round 3): the agent tools the office runs, and one terminal that runs their vendors'
  // installers. Both are the person's only (src/server/api/terminal-harnesses.ts).
  'harnesses.list': { live: true, effect: 'read' },
  'harnesses.install': { live: true, effect: 'write' },
  // SETTING UP AN AGENT TOOL (wave 13u round 242): whether it is signed in, as its own status says; its key given to its
  // own login on standard input; and its own account sign-in started. The key and the sign-in are the person's only; the
  // reading is the person's, or a secretary's under the person's grant where this office's list allows it.
  'harnesses.signed-in': { live: true, effect: 'read' },
  'harnesses.key': { live: true, effect: 'write' },
  'harnesses.sign-in': { live: true, effect: 'write' },
  // THE CODE A SIGN-IN PAGE SHOWED, given to the sign-in the office started for that press (round 242). The person's only.
  'harnesses.sign-in-code': { live: true, effect: 'write' },
  // THE SET UP PRESS (wave 13u round 242): the person's ask to set up one agent tool, written as his message to the
  // secretary the office picks. The person's only.
  'harnesses.set-up': { live: true, effect: 'write' },
  // START AT LOGIN (wave 13u, round 3, piece H9): the person's read of whether a systemd user unit starts the office at their
  // login, and their press that turns it on or off (src/server/api/start-at-login.ts).
  'office.start-at-login': { live: true, effect: 'read' },
  'office.set-start-at-login': { live: true, effect: 'write' },
  // THE DATA FOLDER (criteria DF19 to DF21): where the office keeps its data, the press that starts a move, and the
  // press that confirms it and removes the old folder's copied files (src/server/api/data-folder.ts).
  'office.data-folder': { live: true, effect: 'read' },
  'office.move-data-folder': { live: true, effect: 'write' },
  'office.confirm-data-folder-move': { live: true, effect: 'write' },
  // ONE MEMORY LIMIT FOR ALL SANDBOXES TOGETHER, in the owner's message. It is their read of
  // whether the sandboxes' slice is held, and their press that sets or takes away the limit through pkexec
  // (src/server/api/sandbox-memory-cap.ts).
  'office.sandbox-memory-cap': { live: true, effect: 'read' },
  'office.set-sandbox-memory-cap': { live: true, effect: 'write' },
  // An agent opened in a terminal by the person's press (wave 13u round 3, src/server/api/terminal-agents.ts).
  'terminals.open-an-agent': { live: true, effect: 'write' },
  // THE NEW AGENT DIALOG'S CREATE: the person makes an agent and opens it in a terminal, the office's own or one outside
  // (src/server/api/new-agent.ts).
  'agent.make-a-new-agent': { live: true, effect: 'write' },
  // THE WAY BACK (wave 13u round 10): the command that brings an agent's newest run back, and the person's press that runs it.
  'terminals.way-back': { live: true, effect: 'read' },
  'terminals.bring-back': { live: true, effect: 'write' },
  'terminals.agent-pane': { live: true, effect: 'read' },
  'terminals.show-pane': { live: true, effect: 'write' },
  'terminals.agent-steps': { live: true, effect: 'read' },
  // AN AGENT'S ASK FOR AN INPUT FROM THE OWNER'S LIST, typed into its own terminal (wave 13u round 21).
  'terminals.quick-input': { live: true, effect: 'write' },
  // CRITERION W7: the interrupted runs, the person's press to resume one, and the worker's half of it.
  'office.interrupted-runs': { live: true, effect: 'read' },
  'office.resume-a-run': { live: true, effect: 'write' },
  'worker.resumes': { live: true, effect: 'read' },
  'worker.resumed': { live: true, effect: 'write' },
  // WAVE 13J ROUND LOOP-2: the next round of a sandbox run, asked at one door, and the worker's half of starting it.
  'agent.next-round': { live: true, effect: 'write' },
  // `worker.rounds` writes, as the office, that an ask waits for its run's process, and fails it after the limit (wave 13u round 94).
  'worker.rounds': { live: true, effect: 'write' },
  'worker.round-held': { live: true, effect: 'write' },
  'worker.round-starting': { live: true, effect: 'write' },
  'worker.round-ended': { live: true, effect: 'write' },
  // WAVE 13J ROUND LOOP-3: a worker run a supervisor in a sandbox asks for, and the worker's half of starting it.
  'agent.hand-run': { live: true, effect: 'write' },
  'agent.worker-run': { live: true, effect: 'write' },
  'worker.worker-runs': { live: true, effect: 'read' },
  'worker.worker-run-starting': { live: true, effect: 'write' },
  'worker.worker-run-ended': { live: true, effect: 'write' },
  'worker.taken': { live: true, effect: 'write' },
  // A LINE MOLE OFFICE WROTE IS DELIVERED WITHOUT A RUN. It says a group was opened, a member was
  // added or two claims are in conflict, and a line like that is for people to read. Problem
  // `jN0TdeawNlZZ`: every one of them used to start a run of every agent in the group.
  'worker.needs-no-run': { live: true, effect: 'write' },
  // THE MESSAGE WORKER SAYING A MESSAGE IS STILL WAITING, which it does again every time it checks
  // and is still waiting. It was 2.2 million of their 4.45 million call rows, so it is counted by the
  // hour. Criterion U6 and a decision say so.
  'worker.held': { live: true, effect: 'write', countedByTheHour: true },
  'worker.answered': { live: true, effect: 'write' },

  // THE DEAD LETTERS (M111 of design/messages/ACCEPTANCE.md). A wild message — one
  // that reaches nobody — is kept, and after a time or a count the office broadcasts it to every
  // secretary, opens one group, and each secretary claims per addressee. The list is a read. The
  // sweep is the one write that checks the threshold and broadcasts; the worker presses it once a
  // pass, and it writes nothing when there is nothing to do. The claim is per addressee, once, and
  // only a registered, un-retired secretary may make it.
  'dead-letters.list': { live: true, effect: 'read' },
  'dead-letters.sweep': { live: true, effect: 'write' },
  'dead-letters.claim': { live: true, effect: 'write' },

  // THE OFFICE (C1 to C9 of design/messages/ACCEPTANCE.md section 8). Which worlds there are, a
  // world's birth and its death, and the name a person gives a world.
  //
  // NOT `runtime.*`. Those three are about what is running on THIS machine. These are about which
  // worlds this installation has, which is a different question with a different answer: a world
  // that died last week is on this list and is running nowhere.
  'office.bootstrap-stop-authority': { live: true, effect: 'read' },
  'office.upgrade-history': { live: true, effect: 'read' },
  'office.upgrade-notice': { live: true, effect: 'write', gatedAs: 'record.write' },
  'office.upgrade-judgement': { live: true, effect: 'write', gatedAs: 'record.write' },
  'office.worlds': { live: true, effect: 'read' },
  'office.register-world': { live: true, effect: 'write' },
  'office.close-world': { live: true, effect: 'write' },
  // STOP A WORLD KEPT UP FOR SOMEBODY TO LOOK AT. Criterion C32. It is its own operation and not
  // `office.close-world`: close marks a row that has already gone, and this one stops the processes
  // the office recorded for a world that is still up, through `runtime.claim`'s one release door.
  'office.stop-world': { live: true, effect: 'write' },
  'office.rename-world': { live: true, effect: 'write' },
  // A CITIZEN OF ONE WORLD WORKING IN ANOTHER. Registering a visit is a write wherever it lands: the
  // world being entered writes the row and the office writes its copy.
  'office.visits': { live: true, effect: 'read' },
  // WHO THE OFFICE KNOWS, criterion M52. Its own name and not `office.worlds`: that one answers
  // which worlds there are, and this answers who is on their rolls. They are two questions and
  // folding them together would make neither countable.
  'office.embassy': { live: true, effect: 'read' },
  // WHO HAS CALLED WITH A CLAIM AND NO KEY, criterion P83's Settings list. Its own name and not
  // `office.embassy`: that answers who the office knows, and this answers who is still calling
  // without a key. Folding them together would make "how many callers still have no key" a question
  // the call log could not answer, and that is the number the window is closed on.
  'office.header-only-calls': { live: true, effect: 'read' },
  // WHETHER THE ONE-VERSION KEY WINDOW IS STILL OPEN, and the press that closes it. Criterion P83
  // point 6. Two names and not one: how often the person checks the window and how often they close
  // it are two different facts, and the second is the one the list exists to make them able to make.
  'office.key-window': { live: true, effect: 'read' },
  'office.close-key-window': { live: true, effect: 'write' },
  // WHAT THE OFFICE KEEPS: HOW MANY BACKUPS, AND HOW LONG THE TWO KINDS OF REQUEST ROW ARE KEPT.
  // Criterion U6. Two names and not one, for the reason the window's pair above gives: how often the
  // person reads the numbers and how often they change them are two different facts.
  'office.what-is-kept': { live: true, effect: 'read' },
  'office.set-what-is-kept': { live: true, effect: 'write' },
  // A REQUEST FOR ONE PRESS. An agent files it, the person agrees or refuses, and its
  // asker may withdraw it. Each is its own name, because each is a different act by a different hand.
  'one-press.file': { live: true, effect: 'write' },
  'one-press.list': { live: true, effect: 'read' },
  'one-press.read': { live: true, effect: 'read' },
  'one-press.agree': { live: true, effect: 'write' },
  'one-press.refuse': { live: true, effect: 'write' },
  'one-press.withdraw': { live: true, effect: 'write' },
  // A READINESS CHECKLIST. Raising one, reading them, an agent's
  // signature, the person's signature, taking a signature back and cancelling are each a different act by a different hand.
  'readiness.raise': { live: true, effect: 'write' },
  'readiness.list': { live: true, effect: 'read' },
  'readiness.waiting-for': { live: true, effect: 'read' },
  'readiness.read': { live: true, effect: 'read' },
  'readiness.sign': { live: true, effect: 'write' },
  'readiness.sign-as-the-person': { live: true, effect: 'write' },
  'readiness.withdraw': { live: true, effect: 'write' },
  'readiness.cancel': { live: true, effect: 'write' },
  // A SIGNING PACKAGE, migration 0270, resting on a pair of decisions.
  'signing-packages.bring': { live: true, effect: 'write' },
  'signing-packages.list': { live: true, effect: 'read' },
  'signing-packages.read': { live: true, effect: 'read' },
  'signing-packages.sign': { live: true, effect: 'write' },
  'signing-packages.refuse': { live: true, effect: 'write' },
  'signing-packages.withdraw': { live: true, effect: 'write' },
  'signing-packages.carry-out': { live: true, effect: 'write' },
  'signing-packages.take-back': { live: true, effect: 'write' },
  'signing-packages.give-back': { live: true, effect: 'write' },
  // THE PRICE TABLE THE USAGE PAGE ESTIMATES FROM. Criterion U3. Reading it and setting it are two
  // different facts, and the setting is the person's own act.
  'office.price-table': { live: true, effect: 'read' },
  'office.set-price-table': { live: true, effect: 'write' },
  // QUICK INPUTS (wave 13u round 21): the owner's list, set by the owner alone, and one agent's asks.
  'office.quick-inputs': { live: true, effect: 'read' },
  'office.set-quick-inputs': { live: true, effect: 'write' },
  'office.quick-input-asks': { live: true, effect: 'read' },
  // WHAT THE PERSON'S GRANT CARRIES IN THIS OFFICE (wave 13s round 2a): the list, read by anyone who may read, and
  // changed by the person's own press alone.
  'office.what-the-grant-carries': { live: true, effect: 'read' },
  'office.set-what-the-grant-carries': { live: true, effect: 'write' },
  // THE WORDS WAITING FOR TRANSLATION, worked out from the word lists. A read, for
  // Settings in Developer mode and for the translation round.
  'office.effective-words': { live: true, effect: 'read' },
  // The office-wide arrangement is checked before an authorized write; preview writes nothing.
  'office.sidebar': { live: true, effect: 'read' },
  // A reader can check proposed moves without changing the office.
  'office.preview-sidebar': { live: true, effect: 'read' },
  // The configuration authority saves a checked arrangement and its complete history together.
  'office.set-sidebar': { live: true, effect: 'write' },
  // Recovery uses the same version, authority and route checks as a fresh Apply.
  'office.restore-sidebar': { live: true, effect: 'write' },
  // Complete before and after values make past arrangements reviewable and restorable.
  'office.sidebar-history': { live: true, effect: 'read' },
  // Each person reads the Home layout kept in their own row.
  'office.home-layout': { live: true, effect: 'read' },
  // Only the person keeps their own Home layout, with the change written down beside it.
  'office.set-home-layout': { live: true, effect: 'write' },
  // Each person reads the pages in front of the sidebar kept in their own row.
  'office.sidebar-pins': { live: true, effect: 'read' },
  // Only the person keeps their own pages in front, with the change written down beside it.
  'office.set-sidebar-pins': { live: true, effect: 'write' },
  // Each person reads whether they see how many reports are unread, kept in their own row.
  'office.report-count': { live: true, effect: 'read' },
  // Only the person chooses it, with the change written down beside it.
  'office.set-report-count': { live: true, effect: 'write' },
  'office.word-table': { live: true, effect: 'read' },
  'office.word-history': { live: true, effect: 'read' },
  'office.set-word': { live: true, effect: 'write' },
  'office.restore-word': { live: true, effect: 'write' },
  'office.words-waiting': { live: true, effect: 'read' },
  // THE MODEL A RUN USES, criterion U2. Reading the office's choices, the person setting them, one
  // agent's own model read and set, and what one run gets, which the tools that start runs ask.
  'office.run-models': { live: true, effect: 'read' },
  'office.set-run-models': { live: true, effect: 'write' },
  'office.agent-run-model': { live: true, effect: 'read' },
  'office.set-agent-run-model': { live: true, effect: 'write' },
  'office.run-model-for': { live: true, effect: 'read' },
  // THE CASTING TABLE (选角表), on two decisions. Reading the table, the
  // one casting the tools take for a role (which the tools that start agents ask), a role's history, and the person
  // adding, changing, removing and marking a casting.
  'office.casting': { live: true, effect: 'read' },
  'office.casting-for': { live: true, effect: 'read' },
  'office.casting-history': { live: true, effect: 'read' },
  'office.casting-selection': { live: true, effect: 'read' },
  'office.hold-casting': { live: true, effect: 'write' },
  'office.add-casting': { live: true, effect: 'write' },
  'office.change-casting': { live: true, effect: 'write' },
  'office.remove-casting': { live: true, effect: 'write' },
  'office.mark-casting': { live: true, effect: 'write' },
  // The Casting labels: making, renaming and removing one, and one label's history.
  'office.add-casting-label': { live: true, effect: 'write' },
  'office.change-casting-label': { live: true, effect: 'write' },
  'office.remove-casting-label': { live: true, effect: 'write' },
  'office.casting-label-history': { live: true, effect: 'read' },
  // THE PROVIDER TABLE beside it: every provider, one provider, and adding, changing and removing one.
  'office.providers': { live: true, effect: 'read' },
  'office.provider': { live: true, effect: 'read' },
  'office.add-provider': { live: true, effect: 'write' },
  'office.change-provider': { live: true, effect: 'write' },
  'office.remove-provider': { live: true, effect: 'write' },
  // HOW FAR OUT A SHORT, A MEDIUM AND A LONG GOAL REACH. Criterion P1. Two names for the same
  // reason as the pair above: reading the spans and setting them are two different facts, and the
  // setting is the person's own act.
  'office.goal-spans': { live: true, effect: 'read' },
  'office.set-goal-spans': { live: true, effect: 'write' },
  // WHETHER AGENTS MAY INJECT: ONE SWITCH FOR EVERY AGENT. Criterion M91. Two names for the same
  // reason as the pairs above: reading the switch and pressing it are two different facts, and the
  // press is the person's own act.
  'office.agents-may-inject': { live: true, effect: 'read' },
  'office.set-agents-may-inject': { live: true, effect: 'write' },
  // WHICH ADDRESS IS WHICH MACHINE, the person's table (problem 8Kf0hCaK4lQY). Two names for the same reason as
  // the pairs above: reading the names and writing one are two different facts, and the write is their own act.
  'office.machine-names': { live: true, effect: 'read' },
  'office.set-machine-names': { live: true, effect: 'write' },
  // THE ONE ADDRESS A BROWSER IS SENT TO, chosen by the person (src/server/lib/address-for-browsers.ts). Two names for
  // the same reason as the pairs above: reading it and choosing it are two different facts, and the choice is the
  // person's own act.
  'office.address-for-browsers': { live: true, effect: 'read' },
  'office.set-address-for-browsers': { live: true, effect: 'write' },
  // WHO TAKES THE DEAD LETTERS, one agent the person names (problem 0WUuvB0IhRfb). Two names for the same reason as
  // the pairs above: reading who is named and naming one are two different facts, and the naming is the person's act.
  'office.dead-letter-secretary': { live: true, effect: 'read' },
  'office.set-dead-letter-secretary': { live: true, effect: 'write' },
  'office.dead-letter-thresholds': { live: true, effect: 'read' },
  'office.settings': { live: true, effect: 'read' },
  'office.gates': { live: true, effect: 'read' },
  'office.set-settings': { live: true, effect: 'write' },
  'office.hand-over-gate-count-spool': { live: true, effect: 'write' },
  'office.restart-state': { live: true, effect: 'read' },
  'office.set-restart-grant': { live: true, effect: 'write' },
  'office.restart': { live: true, effect: 'write' },
  'office.pause-state': { live: true, effect: 'read' },
  'office.pause': { live: true, effect: 'write' },
  'office.resume': { live: true, effect: 'write' },
  'office.set-dead-letter-thresholds': { live: true, effect: 'write' },
  // WHO OWNS THE MERGE QUEUE, one agent the person names, which may move an entry to the front besides the person
  // . Two names for the same reason as the pairs above.
  'office.merge-queue-owner': { live: true, effect: 'read' },
  'office.set-merge-queue-owner': { live: true, effect: 'write' },
  // WHO IS REMINDED ABOUT EACH PROJECT'S MODULES, set here or by the .env line (decision aZGg6gerakM1). Two names for
  // the same reason as the pairs above: reading who is reminded and choosing one are two different facts.
  'office.module-reminder-secretaries': { live: true, effect: 'read' },
  'office.set-module-reminder-secretary': { live: true, effect: 'write' },
  // WHO IS THE GPU WATCHER, set here or by the .env line (wave 13v round 35b). Two names for the same reason as the
  // pairs above: reading who watches the card and choosing one are two different facts.
  'office.gpu-watcher': { live: true, effect: 'read' },
  'office.set-gpu-watcher': { live: true, effect: 'write' },
  // WHO TAKES THE USAGE NOTICES OF THE SANDBOXES' LOGIN, AND WHAT THEIR 80% SENTENCE SAYS TO DO (wave 13y round 136).
  // Two names each for the same reason as the pairs above.
  'office.usage-notice-secretary': { live: true, effect: 'read' },
  'office.set-usage-notice-secretary': { live: true, effect: 'write' },
  'office.usage-decision': { live: true, effect: 'read' },
  'office.set-usage-decision': { live: true, effect: 'write' },
  // A NEW OFFICE'S FIRST ENTRY, AND THE PERSON'S PRESS THAT ENDS IT (wave 13y round 138). Two names for the same reason
  // as the pairs above.
  'office.first-entry': { live: true, effect: 'read' },
  'office.end-first-entry': { live: true, effect: 'write' },
  // WHETHER THE MERGE TOOL RUNS AN ENTRY'S RELATED TESTS FIRST, by part B of a decision. Two
  // names for the same reason as the pairs above.
  'office.related-tests-first': { live: true, effect: 'read' },
  'office.set-related-tests-first': { live: true, effect: 'write' },
  // WHETHER THE WORKER STARTS CHECKS IN MERGES-ONLY MODE, AND THE STALE FORK BASES (wave 13j round loop-1). Two names each
  // for the same reason as the pairs above.
  'office.checks-in-merges-only': { live: true, effect: 'read' },
  'office.set-checks-in-merges-only': { live: true, effect: 'write' },
  'office.stale-fork-bases': { live: true, effect: 'read' },
  'office.set-stale-fork-bases': { live: true, effect: 'write' },
  'office.load': { live: true, effect: 'read' },
  // ONE OPERATION'S CALLS, GROUPED BY WHO MADE THEM (wave 13y round 78). Read only.
  'office.load.calls': { live: true, effect: 'read' },
  'office.set-load-ranges': { live: true, effect: 'write' },
  // THE PLUGINS AND THEIR SWITCHES (wave 13x round 14). Two names for the same reason as the pairs above.
  'plugins.list': { live: true, effect: 'read' },
  'plugins.switch': { live: true, effect: 'write' },
  // ONE FILE OF A SWITCHED-ON PLUGIN'S BUILT PAGES, which the office's sandboxed frame loads (wave 13x round 15).
  'plugins.files': { live: true, effect: 'read' },
  // THE READ-ONLY INTERFACE V1 A PLUGIN READS THROUGH. Every one is a read, and
  // tests/the-plugin-read-interface-v1.test.ts fails if one is not.
  'plugin-read.projects': { live: true, effect: 'read' },
  'plugin-read.people': { live: true, effect: 'read' },
  'plugin-read.work': { live: true, effect: 'read' },
  'plugin-read.talk': { live: true, effect: 'read' },
  'plugin-read.roster': { live: true, effect: 'read' },
  'plugin-read.online': { live: true, effect: 'read' },
  'plugin-read.status': { live: true, effect: 'read' },
  'plugin-read.asleep': { live: true, effect: 'read' },
  // WHO OWNS THIS OFFICE, AND THE ONE ACT THAT NAMES THEM. Two names for the same reason as
  // the pairs above: reading who owns the office and naming them are two different facts, and the naming is the
  // person's own act.
  'office.owner': { live: true, effect: 'read' },
  'office.name-owner': { live: true, effect: 'write' },
  // WHO LAST CHANGED EACH SETTING WHOSE EVERY CHANGE IS WRITTEN DOWN, and when (problem 4f6oWJdzJbnk).
  'office.setting-changes': { live: true, effect: 'read' },
  // THE FOUR WORK SWITCHES, read in one call by a host script with an agent's own key (wave 13q item 17).
  'office.work-switches': { live: true, effect: 'read' },
  // WHETHER THIS BROWSER IS PAIRED, AND THE ONE PRESS THAT PAIRS IT. Criterion P83, point 2. Two
  // names and not one: asking whether this browser holds the person's key and setting the cookie
  // that makes it hold one are two different facts, and the second is the press the page exists to
  // offer. `office.pairing` is read from anywhere so a page on another machine learns it is not
  // offered there and names the Embassy; only `office.pair` is kept on this machine.
  'office.pairing': { live: true, effect: 'read' },
  'office.pair': { live: true, effect: 'write' },
  // THE MOVE OF THE OLD COOKIE, SEC-2 item 7: a browser that sent the old cookie, which held a whole key, moves once to
  // two halves. Its own name, because how many browsers moved is a fact apart from how many were paired.
  'office.move-pairing': { live: true, effect: 'write' },
  // THE OFFICE'S OWN KEYS, AND EACH RUNTIME'S OWN ASKED READ-ONLY. Criterion U2. Three names: a
  // read of what is set, the person's write of one of the office's own, and the person's press that
  // tests one with a call that costs nothing. The test is a POST that changes nothing, so its effect
  // is `read` — the effect is what the route does, not the method it arrives on.
  'office.keys': { live: true, effect: 'read' },
  'office.set-key': { live: true, effect: 'write' },
  'office.test-key': { live: true, effect: 'read' },
  // THE SUMMONS: A SECRETARY CALLS THE PERSON INTO THE OFFICE. The call writes one
  // message to them and tells every device where they allowed notifications. The office sends no mail of its own: the
  // mail is the mail tool's, which reads the summonses below, and the three settings of the
  // office's own mail, with their read, their write and their test press, left with it on 28 September 2026.
  'office.summon': { live: true, effect: 'write' },
  // AND THE ONE READ A TOOL THAT TAKES A SUMMONS OUT ANOTHER WAY MAKES: each summons since the last one it read, with who
  // called, how urgent and the title, and nothing else of the office. The mail tool reads them with a key of its own,
  // under the one power "Reading the summonses", which only the mailer card holds. NO LONGER:
  // the mailer card and that power left design/permissions/roles.json on 1 October 2026, so no power names this act; the door asks the proof itself (src/server/api/summons.ts).
  'office.read-summonses': { live: true, effect: 'read' },
  // AND THE MAIL TOOL'S PLACE ON THIS COMPUTER: the person's read of whether it is installed and
  // runs and where its page is, and their press that registers it on the mailer card and installs it as a service of
  // their login. And by another decision, the person's press that turns it off without
  // uninstalling it.
  'office.mail-tool': { live: true, effect: 'read' },
  'office.install-mail-tool': { live: true, effect: 'write' },
  'office.take-back-mail-tool-key': { live: true, effect: 'write' },
  'office.disable-mail-tool': { live: true, effect: 'write' },
  // AND THE PERSON'S READ OF THE TOOL'S OWN SETTINGS THROUGH THE OFFICE, from any of their devices: the office asks the tool on this
  // computer and keeps nothing.
  'office.mail-tool-state': { live: true, effect: 'read' },
  // AND THE PERSON'S THREE PRESSES ON THEM, passed on the same way: each changes what the tool keeps, and is written down as their act.
  'office.mail-tool-addresses': { live: true, effect: 'write' },
  'office.mail-tool-account': { live: true, effect: 'write' },
  'office.mail-tool-test': { live: true, effect: 'write' },
  // PUSH: THE DEVICES A SUMMONS TELLS. Four names: the person's read of
  // the public key and their devices; their press that allows notifications on a device; the one that stops them; and
  // the one that sends a test to a device, whose effect is `write`: a device its push service no longer knows is taken
  // off the list by it (the inspector's note on run OGuDPi3JTLzQ).
  'office.push': { live: true, effect: 'read' },
  'office.push-allow': { live: true, effect: 'write' },
  'office.push-stop': { live: true, effect: 'write' },
  'office.push-test': { live: true, effect: 'write' },
  // THE ENTRY THAT FOLLOWS THE PERSON: ONE SKILL LINK AND THREE HOOK LINES. F15 point 1; problem
  // pHFu8nivPZ_O. Its own name and not one of the key writes: this is the one act that writes into
  // the directory every Claude Code session on this machine reads, so how often it is pressed and
  // whether it changed anything is a question of its own.
  'office.install-entry': { live: true, effect: 'write' },
  // THE SANDBOXES' LOGINS: which model logins the sandboxes are handed. Three names: a
  // read of which declared names are set, and the person's two writes, setting one and clearing one.
  'office.storage-destinations': { live: true, effect: 'read' },
  'office.set-storage-destinations': { live: true, effect: 'write' },
  'office.sandbox-logins': { live: true, effect: 'read' },
  'office.private-login-capability': { live: true, effect: 'read' },
  'office.private-login-start': { live: true, effect: 'write' },
  'office.private-login-status': { live: true, effect: 'read' },
  'office.private-login-sign-in': { live: true, effect: 'write' },
  'office.private-login-code': { live: true, effect: 'write' },
  'office.private-login-cancel': { live: true, effect: 'write' },
  'office.private-login-disconnect': { live: true, effect: 'write' },

  'office.set-sandbox-login': { live: true, effect: 'write' },
  'office.clear-sandbox-login': { live: true, effect: 'write' },
  'office.test-sandbox-login': { live: true, effect: 'write' },
  // THE SAME ENTRY, FOR CODEX AND OPENCODE. F15 point 5: the other runtimes get the
  // entry above too. The plan is a read; the write is its
  // own name for the same reason `office.install-entry` is — the directory it writes is not one a
  // count of record creations answers anything about.
  // THE STATE OF THIS COMPUTER'S ENTRY KEY, read by the Settings entry when it is drawn. It writes nothing.
  'office.install-entry.this-computers-key': { live: true, effect: 'read' },
  'office.install-entry.other-runtimes.plan': { live: true, effect: 'read' },
  'office.install-entry.other-runtimes.write': { live: true, effect: 'write' },

  'office.register-visit': { live: true, effect: 'write' },
  'office.end-visit': { live: true, effect: 'write' },

  // A FAULT ON A PAGE, FILED AS A PROBLEM. Criterion E4's filing half: a loud failure carries its
  // words. Its own name and not one of the record writes:
  // "how often did a page stop in front of them" is a question a count of record creations cannot
  // answer, and it is the one this act exists to make answerable.
  'office.file-a-fault': { live: true, effect: 'write' },

  // A VISITING AGENT'S OWN CREDENTIAL. Criteria P24 to P30 of design/permissions/ACCEPTANCE.md, on
  // answer 3: before another machine has a world of its own, an agent on it
  // registers as a trusted visitor and is issued its own credential, and the person confirms these
  // trusted agents and worlds at the Embassy, keeps count of them and supervises them.
  //
  // FOUR NAMES AND NOT ONE. Asking for a credential is an act any visitor may make; confirming one
  // and ending one are the person's; reading the list is what supervision is. Folding them together
  // would make "how often has anybody confirmed a visitor" a question the call log cannot answer,
  // and that number is what keeping count of the visitors means.
  'office.visitors': { live: true, effect: 'read' },
  'office.issue-credential': { live: true, effect: 'write' },
  // THE MACHINES THIS OFFICE TRUSTS, criterion P73. Three acts and not one: how often somebody
  // reads the list, adds to it and takes from it are three different facts about how much a person
  // is having to manage who may reach this office.
  'office.trusted-machines': { live: true, effect: 'read' },
  'office.trust-machine': { live: true, effect: 'write' },
  'office.untrust-machine': { live: true, effect: 'write' },
  'office.confirm-visitor': { live: true, effect: 'write' },
  'office.end-visitor': { live: true, effect: 'write' },
  // REVOKING A KEY ONE ROW HOLDS, criterion D3, P83 point 4. Its own name because it is its own act:
  // taking back a key is not retiring the agent and not ending the credential, and the call log
  // should be able to tell the three apart.
  'office.revoke-key': { live: true, effect: 'write' },
  // The owner brings back a key revoked at the Embassy while the undo window is open.
  'office.undo-key-revocation': { live: true, effect: 'write' },

  // A STARTER REGISTERING THE AGENT IT HAS JUST STARTED. Criterion P1: whoever starts an agent manages
  // it and answers for it. Its own name and not `record.write`, which is how an agent record
  // is filed by anybody: this one says a caller is taking responsibility for another agent, and
  // folding it into every record write would make "how often does anybody actually register what
  // they start" unanswerable — which is the number the whole reporting chain rests on.
  // RETIRING AN AGENT'S REGISTRY ROW, problem zyCcJYCLsAe7. Its own name because it is its own act:
  // how often somebody closes an agent is a fact about how much the office is churning through
  // workers, and it was invisible until this door existed.
  'agent.retire': { live: true, effect: 'write' },
  'agent.register-started': { live: true, effect: 'write' },
  // A SESSION A PERSON STARTED REGISTERS ITSELF. Its own name and not `agent.register-started`: that
  // one says a caller is taking responsibility for ANOTHER agent, and this one has no registered
  // caller at all — the agent being written is the one asking, under the person who started the
  // session. Folding the two together would make "how often does a new session register itself"
  // unanswerable, which is the number F15 exists to move.
  'agent.register-myself': { live: true, effect: 'write' },
  // A STARTER GIVES AN AGENT IT STARTED A NEW KEY. Problem x8ktQfHS5yGr and a decision.
  'agent.new-key': { live: true, effect: 'write' },
  // AN AGENT'S HANDOVER DOCUMENT, read and written, in wave 13k round 46. Two
  // names, because how often an agent writes one and how often one is read are the two numbers that say whether
  // handovers are being kept at all.
  'agent.handover': { live: true, effect: 'read' },
  'agent.handover-write': { live: true, effect: 'write' },

  // THE ROLE CARDS, AND THE COPIES OF THEM A PERSON READS IN THE PRODUCT. Criterion P12. Two
  // names, because reading the cards and copying them into a project are two acts: one answers
  // what the rules are and the other files records, and a count that folded them together could
  // not say whether anybody ever pressed anything.
  // TAKING A BLOCK OUT OF A RECORD. Its own name and not `record.body`, which is the other three
  // doors — adding a block, rewriting one, and reordering them. Criterion P41 needs the removal to
  // be nameable on a role card on its own: a worker may write blocks and may not delete one, and an
  // operation covering both could only permit both or refuse both. The same reasoning `implementation
  // .accept` is separated from `implementation.write` by, one screen up.
  //
  // THE COST, SAID RATHER THAN HIDDEN: a count of `record.body` before this build includes block
  // removals and one after it does not, so the two are not comparable across this commit.
  'record.body-remove': { live: true, effect: 'write' },
  // HAS ANYBODY USED THE HOLE IN RULE 3? Criterion P40. Its own name and
  // not `record.list`: this walks the revision ledger of a whole project looking for one shape,
  // which is a different question with a different cost, and how often anybody actually asks it is
  // the number that says whether watching a hole instead of closing it was worth anything.
  'project.rule-three-signature': { live: true, effect: 'read' },
  'role.read': { live: true, effect: 'read' },
  // THE OFFICE REGULATIONS PAGE'S DOOR, criterion G5. Its own name rather than `record.read`:
  // what it answers is what governs the office, read from the records through one mapping, and
  // how often a person asks for that is a number worth having apart from the record list reads.
  // Readers use the same selected chapter content.
  'office.rules.chapters': { live: true, effect: 'read' },
  // Preview explains chapter problems without writing.
  'office.rules.preview-chapter': { live: true, effect: 'read' },
  // The person applies checked English with a revision reason.
  'office.rules.set-chapter': { live: true, effect: 'write' },
  // The person puts back shipped or historical English after checking it.
  'office.rules.restore-chapter': { live: true, effect: 'write' },
  // Chapter history reads its record revisions.
  'office.rules.chapter-history': { live: true, effect: 'read' },
  'office.rules.read': { live: true, effect: 'read' },
  'office.rules.mark-only-this-office': { live: true, effect: 'write' },
  // WHO HOLDS EACH CARD, criterion P72. Its own name rather than `role.read`: this walks both
  // registries of the installation and the other reads a file, so how often anybody asks who holds
  // what is a number worth having apart from how often somebody reads the cards themselves.
  'role.census': { live: true, effect: 'read' },
  'role.mirror': { live: true, effect: 'write' },
  // WRITING A CARD SOMEBODY DEFINED IN MOLE OFFICE ITSELF, criterion P51. Its own name rather than
  // `role.mirror`: the mirror copies the declaration and this writes something the declaration does
  // not hold, and how often a person defines a role of their own is a fact worth being able to read.
  'role.write': { live: true, effect: 'write' },
  // Read enforced added settings apart from project cards, because they change every agent's permissions.
  'role.added': { live: true, effect: 'read' },
  // Preview grants and removals without writing so Apply's effects can be read first.
  'role.preview-added': { live: true, effect: 'read' },
  // Apply one checked office-wide card and its history together.
  'role.set-added': { live: true, effect: 'write' },
  // Check an old card again before restoring it, or remove an unheld card.
  'role.restore-added': { live: true, effect: 'write' },
  // Read complete past choices ten at a time so a card can be put back.
  'role.added-history': { live: true, effect: 'read' },
  // THE SHIPPED WORDS OF EACH CARD BESIDE THE OFFICE'S WORDS, for the Role cards page. Its own name rather
  // than `role.census`: this reads each card's words record and its history, and how often somebody looks whether the
  // shipped file moved on is a number apart from who holds which card.
  'role.shipped-words': { live: true, effect: 'read' },
  // COPYING ONE CARD'S SHIPPED WORDS ONTO THE OFFICE'S WORDS, the same decision. Its own name rather than `role.mirror`:
  // the mirror copies whole cards into a project's pages, and this writes the office's words record of one card.
  'role.copy-shipped-words': { live: true, effect: 'write' },
  // THE PERSON SAYING A SECRETARY MAY ACT FOR THEM, and an agent saying its own grant is over. Criterion P59, the person's 代管.
  // Its own name because it is their act and nobody else's: how often they hand their own acts over, and
  // for how long, is one of the few numbers about this product worth being able to read back.
  'role.elevate': { live: true, effect: 'write' },
  // ENDING A SECRETARY'S GRANT EARLY, before whichever end it was given. It has its own name because this office's
  // list of what the grant carries may let a secretary holding the person's grant press it for them, while giving a
  // grant stays the person's alone.
  'role.end-a-grant-early': { live: true, effect: 'write' },
  // GIVING AN AGENT A CARD: the person's act, and an agent's own act within its rank. Criterion P64: appointing
  // a card and choosing for how long belong on the agent's profile at the Embassy. Its own name and not `role.elevate`,
  // because they are two different acts — which card an agent holds, and whether one of them may act for the person — and
  // one name would make either number unreadable.
  'role.appoint': { live: true, effect: 'write' },
  // AN AGENT ASKING ITS STARTER FOR A HIGHER RUNG, AND THE STARTER'S ANSWER. Criterion P65. One name
  // for the ask and both answers, the way granting and ending an elevation are one name: they are
  // the halves of one thing, and a count of asks that did not count the answers would say nothing.
  'role.request': { live: true, effect: 'write' },
  // THE PORTRAITS ON A ROLE CARD, criterion P47. Two reads: what has been painted, and the bytes of
  // one. Their own names rather than `asset.read`, because the pictures are files in two folders and
  // not rows in the assets table, and how often a card's picture is actually looked at is a
  // different number from how often an avatar is.
  'portrait.on-offer': { live: true, effect: 'read' },
  'portrait.read': { live: true, effect: 'read' },
  // THE CHECK THAT ENDS A SUBAGENT'S RUN. Criteria C17 to C26. Four names, because they are four
  // different questions, and folding them together would lose the one number worth reading back:
  // how many runs said they were finished and nobody checked them.
  // `check.list` — which runs said they were finished, and which of those nobody released.
  // `check.read` — what an inspector would read about one run.
  // `check.prompt` — that same reading assembled into the prompt an inspector's run is given. It is
  //   a read that takes a body, because the changed files come from a checkout the server may not
  //   look in: nothing under src/ runs git.
  // `check.assembled` — what one assembly of that prompt measured, kept on the run so a person
  //   reads it in Mole Office rather than in the terminal it was printed to. It is a WRITE, and it
  //   is a separate door for exactly that reason: `check.prompt` is a read and has to stay one, so
  //   the thing that changes a record carries its own name instead of hiding inside a read.
  // `check.answer` — the one act. It is a write, and it is the only door to a release.
  // `check.confirm` — the supervisor accepting the report a released run made, which is what closes
  //   the run. Criterion C29. A separate door from `check.answer` because it is a separate act by a
  //   separate party: the check is the inspector's and the close is the supervisor's, and one door
  //   for both would make a release a close again.
  // `check.superseded` — the run's starter, a keyed secretary, or the owner, closing a run a later run overtook: one
  //   on the same branch, or one that was checked and merged and holds the run's commits.
  //   Two decisions are cited for it. It is a write, and its own name
  //   because it is neither a release nor a refusal: it concludes nothing about the work and rewrites nothing.
  'check.list': { live: true, effect: 'read' },
  'check.read': { live: true, effect: 'read' },
  'check.how-it-would-settle': { live: true, effect: 'read' },
  // THE HONOUR BOARD, criterion HB2 of design/honour-board/ACCEPTANCE.md. Two names, because they
  // are two different questions: `honour.read` is the reading of one run's five signals, a pure
  // read that costs records and milliseconds and nothing else; `honour.record` is that reading
  // stored on the run's own session record, a write of the office's own key `honour`.
  'honour.read': { live: true, effect: 'read' },
  'honour.record': { live: true, effect: 'write' },
  // THE BOARD ITSELF, criteria HB3 and HB5: a page of the runs whose stored reading stands at one
  // standing, and the weekly table, read from stored readings only.
  'honour.list': { live: true, effect: 'read' },
  'check.prompt': { live: true, effect: 'read' },
  'check.assembled': { live: true, effect: 'write' },
  'check.answer': { live: true, effect: 'write' },
  // A standard change released with no inspector (wave 13r round F).
  'check.standard': { live: true, effect: 'write' },
  'check.confirm': { live: true, effect: 'write' },
  'check.superseded': { live: true, effect: 'write' },
  'check.closed-unchecked': { live: true, effect: 'write' },
  // `check.landed-by-hand` — the person, or a secretary, recording that a released run's content reached main by
  //   hand, naming the commit, by point 12 of a decision. Its own name, because it concludes
  //   nothing about the work: it says where the content went, after git has found it there.
  'check.landed-by-hand': { live: true, effect: 'write' },
  // THE MERGE QUEUE. Sandbox v1, piece P6. Five names, because they are five different questions.
  // `merge.submit` — a run's supervisor or the person putting a sealed changeset in the queue.
  // `merge.list` and `merge.read` — the queue lane by lane, and one entry with what it waits on.
  // `merge.withdraw` — its submitter or the person taking it back before it lands.
  // `merge.tool` — the message worker reporting its merge tool's run and each step that tool took.
  //   The step and the tool's start and end are one name, as the check tool's start and end share
  //   `check.assembled`: all three are the office's own bookkeeping, and only the worker may knock.
  // `merge.confirm` — the secretary confirming the deletes a files entry carries. A delete in the main world waits for
  //   a secretary's confirmation. Piece P7.
  // `merge.again` — the person or a secretary-card holder asking the office to try a stalled landing
  //   again, once main is known to hold none of it (decision 28Jy1SqzzZut).
  // `merge.first` — the person or the merge queue's owner moving an entry to the front of its lane, with a reason
  //   .
  // `merge.press` — a secretary-card holder or the person pressing once so that an entry touching a sensitive path
  //   may land. These paths change how every later entry is tested and
  //   landed, what keeps the sandbox apart, or the database schema the next stable upgrade applies to the person's live
  //   database, so someone looks before they land.
  // `merge.resolve` — the entry's own line handing over the resolution of a resolving entry's conflict, within its hour:
  //   the office reads the folder's HEAD itself and records the files it changes (door (a) of xqGNR20SQ9vO).
  // `merge.nobody-started` — the secretary-card holder or the person recording that the next-round door refused to start a
  //   resolving entry's resolve brief (message XHY2fVFG3Qq8, answer 5).
  // `merge.emergency-push` — the person or the secretary-card holder starting and ending an emergency push to main, past
  //   the queue, while the emergency switch is on (wave 13u round 82, item 16). One name for both ends, as the merge tool
  //   asks both for the one push.
  'merge.submit': { live: true, effect: 'write' },
  'merge.list': { live: true, effect: 'read' },
  'merge.read': { live: true, effect: 'read' },
  'merge.withdraw': { live: true, effect: 'write' },
  'merge.tool': { live: true, effect: 'write' },
  'merge.confirm': { live: true, effect: 'write' },
  'merge.again': { live: true, effect: 'write' },
  'merge.first': { live: true, effect: 'write' },
  'merge.press': { live: true, effect: 'write' },
  'merge.resolve': { live: true, effect: 'write' },
  'merge.nobody-started': { live: true, effect: 'write' },
  'merge.emergency-push': { live: true, effect: 'write' },
  // `merge.lines` — the person or a secretary with its own key turning an agent's line on or off, so the office puts its
  //   sealed rounds in the queue itself (wave 13u round 93, item 30).
  // `merge.at-the-seal` — the person or a secretary with its own key asking the office to decide a waiting seal again.
  'merge.lines': { live: true, effect: 'write' },
  'merge.at-the-seal': { live: true, effect: 'write' },
  // DRAFTS. Two names, because they are two questions.
  // `draft.list` — the caller's own drafts, or every draft for the person, with when each reminder is due.
  // `draft.send` — the draft's writer sending it: the new record, its `derived_from` link and the
  //   draft's `sentAs`, in one write. Writing a draft is `record.write`, as for any record.
  'draft.list': { live: true, effect: 'read' },
  'draft.send': { live: true, effect: 'write' },
  'draft.turn': { live: true, effect: 'write' },
  // THE ANSWERS TO THE QUESTIONS IN A REPORT. Two names, because they are two
  // questions, and both are the person's own acts.
  // `answer.keep` — the person keeping an answer to one choice or fill-in box, not sent yet.
  // `answer.send` — the person sending what a box, a button or the whole report has not sent: the decisions, one
  //   message for each agent, and the report's answers, in one write.
  // File an independent criticism; read criticisms about a work record.
  'criticism.file': { live: true, effect: 'write' },
  'criticism.list': { live: true, effect: 'read' },
  // THE CONVERSATION SYNC: one per-workspace opt-in, its path map, the sync itself, one copy read, and one restore.
  // Turning it on or off and running it are the person's own acts; reading a copy and listing what is copied are reads.
  'conversation.sync-read': { live: true, effect: 'read' },
  'conversation.sync-set': { live: true, effect: 'write' },
  'conversation.sync-run': { live: true, effect: 'write' },
  'conversation.read': { live: true, effect: 'read' },
  'conversation.restore': { live: true, effect: 'write' },
  'conversation.export-look': { live: true, effect: 'read' },
  'conversation.export': { live: true, effect: 'read' },
  'answer.keep': { live: true, effect: 'write' },
  'answer.send': { live: true, effect: 'write' },
  // COUNTERS AND TIMED TRIGGERS. Criteria CT1 to CT7.
  // Eight names, because they are eight different questions — a counter is written only
  // through these doors, so each act that used to be a PATCH on a record needs its own name.
  // `counter.make` — whoever files one; the office writes who filed it from the caller.
  // `counter.list` and `counter.read` — the project's counters, and one with its rows and its changes.
  // `counter.add` — a party the counter allows adding to it, with a reason.
  // `counter.change` — whoever filed it, a secretary or the owner changing what it does, with a reason.
  // `counter.pause` and `counter.resume` — the two presses of CT6, apart from `counter.change`
  //   because they are a state of the counter and not a change to what it does, and because a
  //   resume can fire the counter where a change never does.
  // `counter.job` — whoever runs an office job saying what it did, which lands on the firing row.
  //   Its own name and not `counter.change`: it writes no counter, only the answer on one row.
  'counter.make': { live: true, effect: 'write' },
  'counter.list': { live: true, effect: 'read' },
  'counter.read': { live: true, effect: 'read' },
  'counter.add': { live: true, effect: 'write' },
  'counter.change': { live: true, effect: 'write' },
  'counter.pause': { live: true, effect: 'write' },
  'counter.resume': { live: true, effect: 'write' },
  'counter.job': { live: true, effect: 'write' },
  'host-tool.list': { live: true, effect: 'read' },
  'host-tool.register': { live: true, effect: 'write' },
  'host-tool.take-off': { live: true, effect: 'write' },
  'host-job.ask': { live: true, effect: 'write' },
  'host-job.read': { live: true, effect: 'read' },
  'host-job.take': { live: true, effect: 'write' },
  'host-job.answer': { live: true, effect: 'write' },
  // CHECKLISTS. Seven names, because a checklist is written only
  // through its doors, so each act needs its own.
  // `checklist.make` — anybody, people included; the office writes the caller as its owner.
  // `checklist.list` and `checklist.read` — the caller's own by default; another owner's or every one by name.
  // `checklist.change` — its title or its label.
  // `checklist.addItem` and `checklist.changeItem` — anybody, held to "done needs evidence" and the manual rule.
  // `checklist.reminder` — the checklist's owner alone switching an item's reminder on or off.
  'checklist.make': { live: true, effect: 'write' },
  'checklist.list': { live: true, effect: 'read' },
  'checklist.read': { live: true, effect: 'read' },
  'checklist.change': { live: true, effect: 'write' },
  'checklist.addItem': { live: true, effect: 'write' },
  'checklist.changeItem': { live: true, effect: 'write' },
  'checklist.reminder': { live: true, effect: 'write' },
  // THE FLOW FOR PLANNING A BIG PIECE OF WORK: the planner says the plan step is done, and the
  // planner submits the questioned plan. Two acts, at two moments, each with its own refusals.
  'module.plan-step-done': { live: true, effect: 'write' },
  'module.submit-plan': { live: true, effect: 'write' },
  // ENTERING A FLOW: the agent the run serves, or the person for it, in wave 13j round 52.
  // The item the office puts on the agent's checklist is ticked by the event the flow names, or by hand.
  'flow.enter': { live: true, effect: 'write' },
  // THE BOOKINGS OF THE HOST GPU. `GET /api/resources/gpu` reads under `runtime.resources`.
  // `booking.make` — anybody registered; a booking is placed at the time asked for.
  // `booking.program` and `booking.cancel` — its holder or the owner.
  // `booking.goFirst` — its holder; `booking.answer` — the owner, or the secretaries the request needs.
  // `booking.cutInStep` and `booking.reading` — the GPU watcher or the owner.
  // `booking.use` — its holder or the owner, from the GPU tool once the command has ended.
  // `booking.progress` — its holder or the owner; `booking.extend` — its holder or a secretary (round 37).
  'booking.make': { live: true, effect: 'write' },
  'booking.program': { live: true, effect: 'write' },
  'booking.cancel': { live: true, effect: 'write' },
  'booking.goFirst': { live: true, effect: 'write' },
  'booking.answer': { live: true, effect: 'write' },
  'booking.cutInStep': { live: true, effect: 'write' },
  'booking.use': { live: true, effect: 'write' },
  'booking.progress': { live: true, effect: 'write' },
  'booking.extend': { live: true, effect: 'write' },
  'booking.reading': { live: true, effect: 'write' },
  // THE TOOLSET CATALOGUE. Six names, because they are six different questions: `toolset.list`
  // is every category with its tools, `toolset.read` is one tool's manual page, `toolset.use` is
  // one use written as one row against the calling run (decision Vt0GdSlApWce point d; a row
  // of `tool_uses` since wave 13s round 33), and `toolset.uses` is one run's uses read back.
  // `toolset.confirm` is the person confirming a proposed category, which files the person's decision.
  // The sixth, `toolset.files`, reads named test file results and catches over local dates.
  'knowledge.query': { live: true, effect: 'read' },
  'knowledge.counts': { live: true, effect: 'read' },
  'knowledge.ratings': { live: true, effect: 'write' },
  'knowledge.queryCategories': { live: true, effect: 'read' },
  'knowledge.search': { live: true, effect: 'read' },
  'knowledge.categories': { live: true, effect: 'read' },
  'knowledge.categoryCreate': { live: true, effect: 'write' },
  'knowledge.categoryMove': { live: true, effect: 'write' },
  'knowledge.categoryRead': { live: true, effect: 'read' },
  'knowledge.create': { live: true, effect: 'write' },
  'knowledge.read': { live: true, effect: 'read' },
  'knowledge.edit': { live: true, effect: 'write' },
  'knowledge.confirm': { live: true, effect: 'write' },
  'knowledge.refuse': { live: true, effect: 'write' },
  'knowledge.bookmark': { live: true, effect: 'write' },
  'knowledge.attach': { live: true, effect: 'write' },
  'knowledge.detach': { live: true, effect: 'write' },
  'toolset.list': { live: true, effect: 'read' },
  'toolset.read': { live: true, effect: 'read' },
  'toolset.use': { live: true, effect: 'write' },
  'toolset.uses': { live: true, effect: 'read' },
  'toolset.files': { live: true, effect: 'read' },
  'toolset.confirm': { live: true, effect: 'write' },
  // WHAT EACH SECRETARY DOES IN THIS PROJECT (wave 13s round 92): every secretary's duties, one secretary's with what is
  // read live beside them, and the write, which only the person or the secretary named may make.
  'secretaries.duties': { live: true, effect: 'read' },
  'secretaries.agent-duties': { live: true, effect: 'read' },
  'secretaries.set-duties': { live: true, effect: 'write' },
  // THE DEPARTMENTS OF THIS PROJECT (wave 13s round 281): the tree, one department with its history, and the writes,
  // which only the person or a secretary on the person's words may make.
  'departments.list': { live: true, effect: 'read' },
  'departments.create': { live: true, effect: 'write' },
  'departments.one': { live: true, effect: 'read' },
  'departments.write': { live: true, effect: 'write' },
  // THE KEY ITEMS OF A PROJECT (wave 13s round 281): the list of one project or of every project, one key item with the
  // estimates it has carried, and the writes, which only the person or a secretary writing as itself may make.
  'key-items.list': { live: true, effect: 'read' },
  'key-items.create': { live: true, effect: 'write' },
  'key-items.one': { live: true, effect: 'read' },
  'key-items.change': { live: true, effect: 'write' },
  'key-items.place': { live: true, effect: 'write' },
  'key-items.close': { live: true, effect: 'write' },
  'key-items.reopen': { live: true, effect: 'write' },
  // ONE LINE'S BACKLOG (wave 13s round 142): the backlog items of one line, in the line's order.
  'backlog.line': { live: true, effect: 'read' },
  // THE PROJECT'S PROGRESS (wave 13s round 235): its points and inside briefs counted from the records, nothing stored.
  'backlog.progress': { live: true, effect: 'read' },
  // A DECISION'S POINTS (wave 13s round 234): the live backlog items whose fromDecision is that decision.
  'backlog.decisionPoints': { live: true, effect: 'read' },
  // A DECISION'S POINTS FILED IN ONE ACT (wave 13s round 234): every point or none.
  'backlog.filePoints': { live: true, effect: 'write' },
  // A RECORD MARKED DONE IN ONE CALL (wave 13s round 142): a task, a backlog item or an obligation.
  'record.done': { live: true, effect: 'write' },
  // THE PROVIDER ROUTER (the key layer, step 2): a run's credential from its Casting row, the router's admission and
  // receipt, and a run's receipts. Every one refuses while MOLE_OFFICE_PROVIDER_ROUTER is off.
  'provider-router.issue': { live: true, effect: 'write' },
  // A TOOL'S OWN CREDENTIAL for the provider and model it names (wave 13q round 80). One pair, so a tool asks for
  // exactly what it will use and nothing wider.
  'provider-router.tool-tokens': { live: true, effect: 'write' },
  // THE CARRYING ROUTE AT THE OFFICE ADDRESS (wave 13q round 82): one checked tool request, carried to the router's
  // host-only control socket. The token in its Authorization header is checked on every call.
  'provider-router.tool-request': { live: true, effect: 'write' },
  'provider-router.admit': { live: true, effect: 'read' },
  'provider-router.settle': { live: true, effect: 'write' },
  'provider-router.receipts': { live: true, effect: 'read' },
  // THE PROVIDER ROUTER'S KEY SLOTS (the key layer, step 3): the OpenCode Go slots read, and the owner's two writes,
  // adding one and removing one. Each stays on this computer and refuses while the router is off.
  'provider-router.key-slots': { live: true, effect: 'read' },
  'provider-router.add-key-slot': { live: true, effect: 'write' },
  'provider-router.remove-key-slot': { live: true, effect: 'write' },
  // AN AGENT'S NEW NAME (wave 13s round 192, item 42): proposed with a reason, read with every rename before it, and
  // approved or refused by its approver or the person, each with a reason.
  'agent-rename.propose': { live: true, effect: 'write' },
  'agent-rename.list': { live: true, effect: 'read' },
  'agent-rename.approve': { live: true, effect: 'write' },
  'agent-rename.refuse': { live: true, effect: 'write' },
  // AN AGENT'S OWNER HAND-OVERS (wave 13s round 281): every hand-over the owner door kept, newest first.
  'agent-owner-change.list': { live: true, effect: 'read' },
  // ONE PROJECT'S OWN RULES (the design-first build of wave 13s's requirements): a review of one design, by anybody
  // proved; the reviewer is written from the key, and the judge says whose review counts. The project's own chapter is
  // read and previewed by anybody, and written only by the person or a secretary of that project with its own key.
  'design.review': { live: true, effect: 'write' },
  'project.rules.chapter': { live: true, effect: 'read' },
  'project.rules.preview-chapter': { live: true, effect: 'read' },
  'project.rules.set-chapter': { live: true, effect: 'write' },
  // THE OFFICE'S BACKUPS (wave 13q round 71): the list of the backups folder, and one backup taken now. Two names,
  // because how often the list is read and how often a backup is taken are two different facts. The hand-over to
  // the lab server is a third (wave 13q round 74): it files one host job and answers at once.
  'office.backups': { live: true, effect: 'read' },
  'office.take-a-backup': { live: true, effect: 'write' },
  'office.hand-over-a-backup': { live: true, effect: 'write' },
  // A RUN'S METHOD MARK AND ITS DESIGN REMINDERS (part 6 of the same build): the mark, by the person or the agent that
  // started the run's agent; a judgement and a miss, by the person or the secretary the marker answers to; and the count
  // of one project's reminders by the day, read by anybody.
  'run.method-work': { live: true, effect: 'write' },
  'design-reminder.judge': { live: true, effect: 'write' },
  'design-reminder.miss': { live: true, effect: 'write' },
  'project.rules.design-reminders': { live: true, effect: 'read' },
  // THE FOUR FIGURES THE HOME PAGE LACKS (wave 13s round 281): packages per line, packages done per day, each package's
  // time to live, and the whole suite's minutes. Reads only.
  'figures.packages-by-line': { live: true, effect: 'read' },
  'figures.packages-done': { live: true, effect: 'read' },
  'figures.time-to-live': { live: true, effect: 'read' },
  'figures.suite-minutes': { live: true, effect: 'read' },
  // HIS DECISIONS, for home's two figures of them (wave 13s round 281). A read only.
  'figures.my-decisions': { live: true, effect: 'read' },
  // THE PIPELINES THAT STAND STILL, for home's Late or stuck (wave 13s round 281). A read only.
  'pipeline.standing-still': { live: true, effect: 'read' },
} as const satisfies Record<OperationName, Omit<Operation, 'name'>>

/** Names come from the plain list; effects and gate metadata stay in code. */
const declaredOperations = OPERATION_NAMES.map((name) => ({ name, ...OPERATION_METADATA[name] }))
export const OPERATIONS: readonly Readonly<(typeof declaredOperations)[number]>[] = declaredOperations

/** A name a route may declare. */
export type OperationName = (typeof OPERATION_NAMES)[number]

/** What a route serving an operation does: `read` changes nothing, `write` changes something. */
export type Effect = Operation['effect']

/** The names a route may declare today, which is every name that has not been retired. */
export const LIVE_OPERATIONS: readonly OperationName[] = OPERATIONS.filter((o) => o.live).map((o) => o.name)

/** Whether a string is a name this list holds, retired ones included. */
export function isOperationName(value: unknown): value is OperationName {
  return typeof value === 'string' && OPERATIONS.some((o) => o.name === value)
}

/**
 * The entry for one name, or undefined when the list does not hold it.
 *
 * Callers that already have a name off a registered route can rely on it being here, because
 * `operationOn` refused to register the route otherwise.
 */
export function operationNamed(name: string): Operation | undefined {
  return OPERATIONS.find((o) => o.name === name)
}

// ============================================================================ the usage vocabulary
//
// Everything below is read by the request recorder in src/server/lib/usage.ts, by the reads over
// what it wrote, and by the browser page that draws them. It is here rather than in a server file
// because the browser draws these words and a second copy of a closed list is the defect this
// campaign is about.

/**
 * WHY A CALLER SAID IT WAS CALLING, out of a closed list of eight.
 *
 * Seven are fixed words, with *normal execution* shortened. The eighth is `handover`, for
 * one agent picking up where another stopped, and the word is `handover` because that is the name
 * the agent-coordination thread settled for the same idea.
 *
 * CLOSED ON PURPOSE. Free text would give a hundred spellings of "recovery" and no aggregate worth
 * reading. A caller sends one of these in `x-mole-office-purpose` or sends nothing, and nothing is a
 * real answer rather than a defect.
 */
export const PURPOSES = [
  'cold-recovery',
  'task-resume',
  'handover',
  'module-work',
  'pipeline-work',
  'review-handling',
  'message-handling',
  'normal',
] as const

/** One of the eight words a caller may send as its purpose. */
export type Purpose = (typeof PURPOSES)[number]

/** Whether a string is one of the eight. */
export function isPurpose(value: unknown): value is Purpose {
  return typeof value === 'string' && (PURPOSES as readonly string[]).includes(value)
}

/**
 * EVERY TIME WINDOW THIS MEASUREMENT LAYER HAS, IN ONE PLACE, so no reader restates a number.
 *
 * `FOLLOWED_BY` is deliberately ONE constant serving two measurements stated as different
 * questions — a read after a read, and a read after a write. They mean the same thing, *immediately
 * afterwards*, and two constants with one meaning is the defect this campaign is about. If evidence
 * ever shows the two need different windows, that is one change in one file, with a reason.
 */

/** How long a silence has to be before it ends a stretch. Ten minutes. */
export const IDLE_GAP = 10 * 60 * 1000

/** What *immediately afterwards* means, for a read following a read and for a read following a write. */
export const FOLLOWED_BY = 10 * 1000

/** How long after a stretch's last row a durable write still counts as that stretch's own. */
export const THEN_WROTE_WINDOW = 15 * 60 * 1000

/** How many recent cold recoveries the bootstrap's promotion rule looks back over. */
export const PROMOTE_OVER = 20

/** The share of those recoveries that promotes a bootstrap section from assumed to measured. */
export const PROMOTE_AT = 0.5

/** The share below which a promoted section falls back to assumed. */
export const DEMOTE_AT = 0.25

/**
 * THE QUESTION AN AGENT HAD WHEN IT WENT OUTSIDE MOLE OFFICE, and the operation that answers it.
 *
 * THE THRESHOLDS COUNT THIS AND NEVER THE FILE. Three agents wanting to know which round is running
 * — one reading `design/CURRENT-CAMPAIGN.md`, one reading the brief, one running `ls design/` —
 * would otherwise produce three keys with one occurrence each, and the single case the owner named
 * by name would produce no evidence at all.
 *
 * `answeredBy` is the operation Mole Office already has for that question, or null where it has none.
 * That one column is the whole of the cross-check: an agent calling something a boundary when
 * Mole Office has an operation for it lands in a different column from an agent who met a real gap, and
 * neither is overruled. `tests/usage-outside.test.ts` binds every non-null name to OPERATIONS,
 * because an unbound second list of operation names is exactly what this file exists to prevent.
 *
 * THE NAME IS THE OPERATION THAT ANSWERS THE QUESTION, NOT ONE NEAR IT. `owner-waiting` is answered
 * by `project.waiting` (GET /api/waiting), the person's whole set, which the session hook and
 * GET /api/needs-you count from; needs-you lists only forks, card requests and admissions.
 * `messages-waiting` is answered by `handle.waiting` (GET /api/handles/<handle>/waiting), which
 * lists the message records with a delivery to the agent still marked queued. `agent.inbox` lists
 * only conversation messages, never a message record, and two routes serve it (GET /api/agent/inbox
 * and GET /api/agent/marks). tests/what-waits-is-answered-by-the-door-that-answers-it.test.ts holds
 * both names. A stored claim keeps only the question's name, and this list is read when the claims
 * are read. Only whether `answeredBy` is null changes how a claim is counted, and neither entry was
 * null before or after, so no stored claim is counted differently; a stored claim is now shown
 * beside the new operation name.
 */
export const WANTED = [
  { name: 'repo-head', question: 'which commit the checkout is at', answeredBy: null },
  { name: 'repo-changes', question: 'what changed in the checkout recently', answeredBy: null },
  { name: 'working-tree', question: 'what is uncommitted or unpushed', answeredBy: null },
  { name: 'file-contents', question: 'what a particular file says', answeredBy: null },
  { name: 'build-or-test-result', question: 'whether the tests or the typecheck pass', answeredBy: null },
  { name: 'processes-and-ports', question: 'what is running on this machine', answeredBy: 'runtime.resources' },
  { name: 'which-campaign', question: 'which campaign is running and where it stands', answeredBy: 'project.bootstrap' },
  { name: 'what-remains', question: 'what unfinished work there is', answeredBy: 'project.open-loops' },
  { name: 'owner-waiting', question: 'what is waiting on the owner', answeredBy: 'project.waiting' },
  { name: 'messages-waiting', question: 'messages queued for me', answeredBy: 'handle.waiting' },
  { name: 'other', question: 'anything else, and `wanted_other` must say what', answeredBy: null },
] as const satisfies readonly { name: string; question: string; answeredBy: string | null }[]

/** One of the eleven questions. */
export type WantedName = (typeof WANTED)[number]['name']

/** Whether a string is one of the eleven. */
export function isWantedName(value: unknown): value is WantedName {
  return typeof value === 'string' && WANTED.some((w) => w.name === value)
}

/** The entry for one question, or undefined when the list does not hold it. */
export function wantedNamed(name: string): (typeof WANTED)[number] | undefined {
  return WANTED.find((w) => w.name === name)
}

/**
 * WHAT THE AGENT ITSELF JUDGED, and Mole Office never overrules it.
 *
 * THREE, NOT A BOOLEAN. `unsure` is a real answer and better than a coin toss, and it is counted
 * separately and never merged into either of the other two.
 */
export const VERDICTS = ['boundary', 'gap', 'unsure'] as const

/** One of the three judgements. */
export type Verdict = (typeof VERDICTS)[number]

/** Whether a string is one of the three. */
export function isVerdict(value: unknown): value is Verdict {
  return typeof value === 'string' && (VERDICTS as readonly string[]).includes(value)
}

/** Where an agent got what it did not get from Mole Office. Running a command and reading a file differ. */
export const OUTSIDE_SOURCES = ['shell', 'file'] as const

/** One of the two. */
export type OutsideSource = (typeof OUTSIDE_SOURCES)[number]

/** Whether a string is one of the two. */
export function isOutsideSource(value: unknown): value is OutsideSource {
  return typeof value === 'string' && (OUTSIDE_SOURCES as readonly string[]).includes(value)
}

/**
 * WHAT A PROBLEM FILED FROM A CROSSED PATTERN PUTS IN `data.found_by`, declared once.
 *
 * `found_by` exists on exactly one kind — `problem` — and is described there as *how it came to
 * light*. The surface's lookup and the string are bound to this function by a test so the two
 * cannot spell it differently.
 */
export function patternFoundBy(key: string): string {
  return `mole office usage · ${key}`
}
