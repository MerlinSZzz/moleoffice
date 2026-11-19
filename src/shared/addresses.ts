// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY ADDRESS THIS APP HAS, AND THE ONE READER OF THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS IN src/shared AND NOT IN THE ROUTER IT CAME OUT OF
 * ---------------------------------------------------------------------------------------
 *
 * The shell reads an address to decide which page to draw. The write door reads one to decide
 * whether a lead may point at it — criterion M97, made after a lead took a reader to a summary
 * instead of to the page with the press on it. Two readers, one grammar. A list of
 * addresses kept on the server beside the router's own would be this codebase's named defect: two
 * places that must agree with nothing making them agree, so a page added to the shell would be
 * refused by the door for as long as nobody remembered the second copy.
 *
 * IT COULD NOT STAY WHERE IT WAS. src/server may import from src/shared and src/config, and
 * tests/a-program-is-judged-on-the-files-it-is-built-from.ts names the three files it loads from
 * anywhere else. A fourth would have been src/web/components/router.tsx, which imports React — so
 * the server would have loaded React to read an address. The grammar moved instead.
 *
 * WHAT STAYED IN THE ROUTER: everything that needs a browser or React — the hooks, `navigate`, the
 * link component, and the builders that turn a page's name back into an address. It re-exports what
 * it used to declare, so every caller in the shell is untouched.
 *
 * NOTHING HERE TOUCHES THE BROWSER. `parseRoute` takes the hash as a string and answers a value;
 * there is no `window` in this file and there must not be, because the server calls it.
 */

import { parsePeriod } from '@shared/planning.ts'
import { PANELS as SETTINGS_DECLARATION } from '@shared/settings-declaration.ts'
import { isParticipantKind, type ParticipantKind } from '@shared/participants.ts'
import { PROFILE_SEGMENT } from '@shared/profile.ts'
// WHERE ONE VISITING AGENT'S CREDENTIAL LIVES. One spelling, shared with the server's refusals.
import { VISITOR_SEGMENT } from '@shared/visitors.ts'
// THE ADDRESS OF THE STATISTICS PAGE, criterion P72. One spelling, beside the shape it draws.
import { ROLE_CENSUS_SEGMENT } from '@shared/roles.ts'
import { KIND_FAMILIES, type KindFamily } from '@shared/work.ts'
// THE KIND WORD, TYPE ONLY, for the record kinds whose address is their own word. Erased before
// anything runs, so this file still holds no runtime edge into the kinds table.
import type { RecordKind } from './types.ts'
import { NOTEBOOK_SEGMENT } from './notebook.ts'
// THE ADDRESS OF ONE INCIDENT, criterion I3. One spelling, beside the shapes the page draws.
import { INCIDENT_SEGMENT } from './incident.ts'
// WHERE A QUICK NOTE OPENS. One spelling, which the window app's note window opens too.
import { THE_QUICK_NOTE_SEGMENT } from '../config/the-quick-note-address.mjs'
// THE SETTINGS PANELS' IDS, TYPE ONLY: an address names a panel by its surface id without "settings.".
import type { SurfaceId } from './surfaces.ts'

/**
 * Every address the app has. The name of a route IS the name of the page the shell draws for it
 * — App.tsx's `Page` is this union's `name`, so there is no second list of pages to keep in step.
 *
 * `home` used to be called `records`, from the phase when the root address was the records list.
 * The shell translated it back on every render, which is exactly the kind of two-places-must-agree
 * arrangement that eventually disagrees, so the router now says what it means.
 */
export type Route =
  | { name: 'home' }
  | { name: 'records' }
  /**
   * Modules has its own address, even though a module is stored as a record.
   *
   * Where a person thinks they are is not an implementation detail: clicking Modules used to land
   * on Records with the sidebar highlighting Records, which loses the reader on arrival. The page
   * is the records page locked to one kind — one list, one store, one component.
   */
  | { name: 'modules' }
  /**
   * One record, optionally being written in, and optionally opened at one of its named sections.
   *
   * `section` is a FIELD on the record route and not a route of its own, because a section is part
   * of the record's page rather than a second page. See `RECORD_SECTIONS` for what may follow a
   * record's id and why the list is closed.
   *
   * `kind` is what the ADDRESS says about the kind, and it is read from the address only. Criterion
   * E2: a press on a thing opens that
   * thing's own page, and for the very common kinds still without one — report in particular —
   * the thing's own page begins with its own word in the address: `#/report/<id>`. The word names
   * the kind; the page is the same record page it always was. A caller that holds only an id keeps
   * the generic `#/r/<id>`, which opens every record as it always has, and its kind is then learnt
   * by the page once the record has been read.
   */
  | { name: 'record'; id: string; edit?: true; section?: RecordSection; kind?: RecordKind }
  /**
   * `#/message/<id>` — ONE MESSAGE, READ AS ITS OWN PAGE.
   *
   * Criterion E2, point 3, gives some kinds an entry and a page of their own. A
   * message is the commonest record kind still with no real page (6,422 on 16 September), so
   * it gets an entry of its own and a page of its own, built after the pattern the report page landed with.
   *
   * IT IS A ROUTE OF ITS OWN AND NOT A `record` ROUTE CARRYING A KIND, and that is the one place it
   * parts from the report page. A report's page IS the record page, so its word only had to name the
   * kind. A message's own page draws who sent it, who it reached, when, the body the way the chat
   * draws it, the delivery marks, and the conversation or group it belongs to — none of which the
   * record page draws — so the page is a second component and the route says which one.
   *
   * A CALLER THAT HOLDS ONLY AN ID KEEPS `#/r/<id>`, exactly as for a report. That is the design:
   * the generic record page still opens a message, plainly, and this page is what a list that knows
   * the kind links to.
   */
  | { name: 'message'; id: string }
  /**
   * `#/problem/<id>` — ONE PROBLEM, READ AS ITS OWN PAGE.
   *
   * Criterion E2, point 3, gives some kinds an entry and a page of their own.
   * A problem is the third kind the decision names, 839 records on 16 September, and its page is built after
   * the pattern the message page landed with.
   *
   * IT IS A ROUTE OF ITS OWN, like a message and unlike a report. A problem's own page draws what the
   * record page draws for a problem — the symptom, what was tried, whose move it is, the state and
   * the fix, and its links — with its own breadcrumb and its own place in the rail, so the address
   * says which page it is rather than leaving a record page to be told the kind after a read.
   *
   * WRITING IN IT KEEPS THE RECORD PAGE'S RULE: the address may end in `/edit`, and reading is what
   * every fresh visit gets. The press that closes a problem is the same state control the record page
   * draws, under the same rule.
   *
   * A CALLER THAT HOLDS ONLY AN ID KEEPS `#/r/<id>`, exactly as for a report and a message. That is
   * the design: the generic record page still opens a problem, plainly, and this page is what a list
   * that knows the kind links to.
   */
  | { name: 'problem'; id: string; edit?: true }
  /**
   * `#/session/<id>` — ONE AGENT RUN, READ AS ITS OWN PAGE.
   *
   * Criterion E2, point 3, gives some kinds an entry and a page of their own.
   * A session is the third kind the decision names and the second with no entry page (2,648
   * records on 16 September), built after the work that gave a message a page of its own.
   *
   * IT IS A ROUTE OF ITS OWN AND NOT A `record` ROUTE CARRYING A KIND, the same choice the message page
   * made and for the same reason: the run's own page draws what the record page does not — who it
   * served and who started it, where it ran, what it is placed under, the check, the report and the
   * office's timeline of the run. A caller that holds only an id keeps `#/r/<id>`, which the record
   * page still opens.
   */
  | { name: 'session'; id: string }
  /**
   * `#/handbook/<id>` — ONE HANDBOOK, READ AS ITS OWN PAGE: whom it is for, where it stands and hangs, its text in each
   * language, and each version with who wrote it, when and why (src/web/pages/HandbookPage.tsx). A caller that holds
   * only an id keeps `#/r/<id>`, which the record page still opens.
   */
  | { name: 'handbook'; id: string }
  /**
   * `#/pipeline` is the list of pipelines; `#/pipeline/drawing` is the drawing of every module;
   * `#/pipeline/<id>` is the drawing with one pipeline drawn.
   *
   * ONE ROUTE FOR THE THREE, because the drawing is one page whichever scope it is at, and the list
   * is where the rail row lands. The list became the page a person opens in wave 13j's round 11 (the
   * family lists' design, report n9Mjk3c_sJRu block b-17): the drawing is a card on it with a small
   * picture, and the card opens the drawing at its own address. Which drawing is open is in the
   * address, so a drawing can be linked to, sent, or bookmarked, and the review tool can photograph
   * each one. `drawing` is never a record id: ids are twelve characters.
   */
  | { name: 'pipeline'; id?: string; drawing?: true }
  /**
   * `#/project-graph` — ONE GRAPH OF THE PROJECT'S PAST, PRESENT AND LIVE FUTURES. Wave 13s round 241.
   *
   * It is reached from the Evolution block on a module's record page and from no rail row: the page is the
   * whole project's graph, and a row would put it beside the per-pipeline drawing that answers a different
   * question. Its four levels are the owner's own, in the owner's order.
   */
  | { name: 'projectgraph' }
  | { name: 'sessions' }
  /** The interrupted runs, and one press to resume each. Criterion W7. */
  | { name: 'interrupted' }
  /** The merge queue, lane by lane, in the order entries will land, as option A sets it. */
  | { name: 'mergequeue' }
  /**
   * THE PAGES HOME'S MOVED SECTIONS WENT TO, each one press from Home: every
   * item waiting on the person, the claims, the project cards, what has been said, and the questions
   * about the records.
   */
  | { name: 'needsyou' }
  | { name: 'claims' }
  | { name: 'projects' }
  | { name: 'said' }
  | { name: 'recordquestions' }
  | { name: 'queries' }
  /**
   * `#/plan` is this week. `#/plan/<period>` is one period, at whatever horizon its key says.
   *
   * The period is in the ADDRESS for the same reasons the pipeline's id is: a week can be linked
   * to, sent and bookmarked, and the review tool can photograph a particular one rather than
   * whichever the page happened to open on. `2026-09`, `2026-W36` and `2026-09-07` are three
   * shapes of one key, and the page reads the horizon off the key rather than carrying it twice.
   */
  /**
   * `#/plan` is this week. `#/plan/<period>` is one period. `#/plan/today` is whatever today is.
   *
   * THE THIRD ONE IS A ROUTE AND NOT A BUTTON, and that is a defect being closed rather than a
   * convenience. "today" and "day" used to resolve to the identical address, so the day pill drew
   * as current and the today pill never could — the active test is `parsed.horizon === h` and
   * `today` is not a horizon. Pressing it while already on today changed no address, fired no
   * `hashchange`, and did nothing at all, on the one page it names.
   *
   * As an address it also means what a person means by it: `#/plan/2026-08-13` is a date, and
   * `#/plan/today` is the day you open it. One can be sent to somebody next week; the other cannot,
   * and that is the difference the two controls exist to express.
   */
  | { name: 'plan'; period?: string; today?: true; edit?: true }
  /**
   * `#/plans` — the plans a person has written, before anything has a date or an hour on it.
   *
   * A different place from the schedule above, and the two ROW NAMES say which: this one is Plans
   * and that one is Schedule. One is writing, the other is hours.
   *
   * THE TWO ADDRESSES ARE STILL ONE LETTER APART, AND THIS FILE USED TO CLAIM THEY WERE NOT. It
   * said "Neither address is one letter from the other" directly under `#/plan` and `#/plans`,
   * which is a sentence contradicted by the two lines above it. An address is a label — this file
   * says so at RENAMED_ADDRESSES — so `#/plan` should become `#/schedule`, with `plan: 'schedule'`
   * in that table carrying every bookmark across.
   *
   * IT IS NOT DONE HERE BECAUSE IT CANNOT BE DONE HERE ALONE. Three tests written by other agents
   * assert the literal address in rendered markup — tests/planning-surfaces.test.ts lines 669 and
   * 1029, tests/read-before-edit.test.ts line 185 — and this change does not own them. Reported
   * rather than half-done: renaming the address and leaving those failing would be worse than the
   * one-letter gap.
   */
  | { name: 'plans' }
  /**
   * `#/horizons` — the goals at each horizon, the clusters that serve them and the parts under each.
   *
   * Criterion P5. A page of its own because it is the one page that reads the plan from the goals
   * DOWN: the schedule reads a period and the plans page reads what somebody wrote, and neither can
   * say what a cluster is for. The four horizons are short, medium, long and distant, and a horizon
   * with no goal, a goal nothing serves, a cluster with no parts and a part nobody is on are all
   * drawn as the states they are rather than left empty.
   */
  | { name: 'horizons' }
  /**
   * `#/plans/<id>` — one plan, read as a document. `#/plans/<id>/edit` is the same plan being
   * written in.
   *
   * The name is `onePlan` and not `plan`, because `plan` is already the schedule's route name and
   * one word naming two places is how a reader ends up on the wrong one.
   */
  | { name: 'onePlan'; id: string; edit?: true }
  /**
   * `#/governance` — everything waiting on you, in every project, and the choices you have made.
   *
   * IT IS ONE QUEUE AND IT USED TO BE TWO IDEAS. `#/decisions` was the choices waiting on you and
   * the ones you had made; what waits on a person is more than choices, so the queue holds every
   * source `GET /api/waiting` reads — a fork only you can settle, a question an agent asked you,
   * and anything you set aside — with the decisions you have already made under them.
   *
   * `#/decisions` IS KEPT AS A REDIRECT rather than as a second page. Answering "four numbers for
   * one idea" by adding a second queue screen would ship one more surface for the idea than it
   * started with. See RENAMED_ADDRESSES.
   */
  | { name: 'governance' }
  /**
   * EVERY DELIBERATE UNRESOLVED SLOT IN THIS PROJECT, AND EVERYTHING THAT RAN INSTEAD.
   *
   * Its own address rather than the records list locked to two kinds, because the page answers a
   * question the list cannot: how bad each one is, whether it has been answered, and how much work
   * is resting on it. A `placeholder` and a `ran_instead` are two record kinds and one question.
   */
  | { name: 'placeholders' }
  /**
   * `#/bundles` — WHAT HAS LEFT THE BUILDING, AND WHAT A COPY OF THIS PROJECT'S CONTEXT WOULD SAY.
   *
   * ITS OWN ADDRESS, because a bundle is the one thing in this product whose purpose is that
   * content leaves it. The person pressing the button is the only check on what is handed to an
   * agent Mole Office does not run, and a check nobody can reach through a browser is not a check.
   */
  | { name: 'bundles' }
  /**
   * THE TASKS A PERSON OR A PASSING AGENT CAN PICK UP: `#/tasks-to-take`, criterion F16 point 2.
   *
   * THE COLUMN IS A READING OF THE RECORDS, so it is a project's list and narrows to the project in
   * the switcher: GET /api/delegation is answered with `workspaceOf(req)`. The rail row that opens it
   * is "Tasks to take", which is the owner's own name for it through a ruling, and the page's
   * own heading reads the same string.
   *
   * The address is three words joined because "tasks" alone names the record kind, and this is not a
   * list of every task — only the ones somebody has written up for somebody else.
   */
  | { name: 'tasksToTake' }
  /**
   * One family of records as a place: `#/work`, `#/decisions`, `#/findings`, `#/ideas`, `#/notes`,
   * `#/structure`.
   *
   * The sidebar used to print these five as headings with their record KINDS listed underneath in
   * grey text — "task · obligation · purchase · problem", "idea · wanna_try" — which is a schema
   * printed where navigation should be. `wanna_try` is an identifier; nobody navigates by it. Worse,
   * the headings went nowhere, so the only way into a family was Records with a filter on it.
   *
   * THE ADDRESS SEGMENT IS THE FAMILY KEY, and the set of families is `KIND_FAMILIES` in
   * src/shared/work.ts — not a list here. A family added there gets an address, a heading and a
   * place in the navigation with nothing to keep in step, which is the only arrangement this
   * codebase's recurring defect cannot get into.
   */
  | { name: 'family'; family: KindFamily }
  /**
   * `#/settings` — everything about how this browser draws Mole Office, in one place.
   *
   * IT IS A PAGE AND NOT A PANEL IN THE RAIL, and that is the point of it. The rail's job is to say
   * where you can go; a theme menu, a detail switch and a picker for who your writes are attributed
   * to are not places, and they do not sit in the list of places. Every one
   * of them is now on this page and nowhere else, so no two copies of one control can disagree.
   */
  | { name: 'settings'; panel?: SettingsPanel }
  /**
   * `#/pairing` — PAIR THIS BROWSER WITH THE OFFICE, IN ONE PRESS. Criterion P83, point 2.
   *
   * A PAIRING IS NOT A PLACE, and the page says so rather than pretending otherwise: it is the one
   * press a browser makes once so every later request from it is the person. It has an address for
   * the same reason every other one-off state does — a handback and a photograph name it, and a
   * browser sent to it cold can pair without a terminal. A browser the window made the person is
   * still sent here, because pairing is how it receives the key that outlives the window.
   */
  | { name: 'pairing' }
  /**
   * `#/welcome` — THE FIRST-RUN GUIDE, where a fresh office asks its person for their name.
   *
   * By point 1 of a decision, a fresh office writes no owner's name; it asks its first person.
   * While the office has no named owner, every address draws this guide instead of its page
   * (src/web/components/OwnerGate.tsx), so the address matters mostly to an agent that installed the office: it can
   * open this address for the person or hand them the link. Once the office has a named owner, the gate sends this
   * address to Home.
   */
  | { name: 'welcome' }
  /**
   * `#/conversations` — every conversation with an agent about this project, and what came back.
   *
   * A different place from `#/sessions`, and the two row names say which: that one is Agent runs,
   * which is every run Mole Office has ever seen, filed as records. This one is what somebody SAID to an
   * agent, what it was about, and the answer.
   *
   * THE ROUTE IS STILL CALLED `agents` AND ITS ADDRESS IS NOT. Until wave 13q's S2 the address was
   * `#/agents`; that word now names the sidebar group Agents and its category page (see
   * CATEGORY_PAGES below). The route name stayed, the way `queries` stayed behind `#/missing`, so
   * every link built with `pathFor('agents')` moved to the new address with no edit.
   */
  | { name: 'agents' }
  /**
   * `#/chat` — THE CHAT AS A PAGE. Plan row C1: the sidebar's Chat opens it, and it draws the same contacts, groups and
   * conversations as the corner panel. Like Home it is not tied to a project.
   */
  | { name: 'chat' }
  /**
   * THE CATEGORY PAGES: ONE PER SIDEBAR GROUP THAT FOLDS. Wave 13q's S2, plan 7FEOshq3mBGG, on the
   * second design draft. A press on a group's name opens a page of cards,
   * one card for each page in the group. `#/agents`, `#/office`, `#/developer` and `#/project`.
   *
   * FOUR ROUTES AND NOT ONE ROUTE WITH A FIELD, so each is a flat address in FLAT_ROUTES and
   * tools/review.mjs photographs all four without being taught a new shape.
   */
  | { name: 'agentsCategory' }
  | { name: 'officeCategory' }
  | { name: 'developerCategory' }
  | { name: 'projectCategory' }
  /**
   * `#/messages` — EVERY MESSAGE IN THIS PROJECT: who wrote it, who it went to, how far it got.
   *
   * A different place from `#/conversations` above, and the two say which. That one is what somebody said
   * to an agent through the composer, with the run that answered. This one is the pool underneath
   * every conversation, the chat panel and every comment on a page — one row per thing said,
   * whoever said it and wherever it was said. It is the one page for viewing and managing the
   * message pool, and whether a message was sent can be found again there.
   * Criterion M27.
   */
  | { name: 'messages' }
  /**
   * `#/agents-at-work` — THE AGENTS AT WORK NOW, AND WHAT EACH IS DOING.
   *
   * A different place from the three agent rows below it, and each of the four answers a different
   * question. Agent runs is every run Mole Office has ever seen. Agent conversations is what a person
   * said to an agent. Agent use is what agents read. This one is the present tense: the agents on the
   * work now, what each of them says it is doing, whether it can be reached, and which other work it
   * overlaps.
   *
   * THE ADDRESS EXISTED AS A BROKEN LINK BEFORE IT EXISTED AS A PAGE. `#/working` was written into
   * a round-ten design and typed into a browser, and it answered "There is no page at /working."
   * because the word was in no route and in no rail row. An address a person has been given and
   * that lands on the not-found page is worse than no address, which is why the route, the rail row
   * and the page land together.
   *
   * RENAMED IN WAVE 13Y ROUND 120 to "Agents at work": the rail row, the heading and the address.
   * `#/working` still lands here through RENAMED_ADDRESSES. The route keeps the name `working`, as
   * `queries` kept its name when its address became `#/missing`.
   */
  | { name: 'working' }
  /**
   * `#/agent-use` — how agents read this project: what they asked for, what it cost, what they went
   * outside Mole Office for, and how long each piece of work took.
   *
   * The address is `agent-use` and not `usage`, because "usage" on its own reads as billing. It sits
   * beside the two other agent rows: runs, conversations, and how those agents read the project.
   */
  | { name: 'usage' }
  /** Original announced upgrade events, with outcomes read from their create events. */
  | { name: 'versionHistory' }
  /** What an agent read in a folder, waiting for a person to accept or reject each piece. */
  | { name: 'folderreading' }
  /**
   * `#/runtime` — WHAT IS RUNNING RIGHT NOW: which API this page is talking to, which database is
   * behind it, which commit it was built from, and how new the code in both halves is.
   *
   * A PAGE SOMEBODY OPENS ON PURPOSE, and the only place in the browser app where any of that is
   * drawn. Every other page draws none of it, which is answer F2: nothing shows normally, and a red
   * banner shows only when something is wrong. A line that is always on
   * screen teaches a reader it is furniture, and then it says nothing on the day it matters.
   *
   * The banner is the other half and it is unchanged: when any of these facts disagrees with the
   * canonical world, `components/WrongWorld.tsx` says so on every page and blocks it.
   *
   * IT IS IN NO RAIL ROW, deliberately. The rail says where the work is; this is a page you go to
   * when you are asking what you are looking at, and there are two others like it already —
   * `record` and `unknown` are reachable and unlisted for the same kind of reason.
   */
  | { name: 'runtime' }
  /**
   * WHICH WORLDS THERE ARE, WHO IS VISITING WHOM, AND THE WAY INTO ONE.
   *
   * Criterion C7 of design/messages/ACCEPTANCE.md section 8: a page in the main world lists the
   * worlds that exist. It IS a rail row, unlike `runtime` above: this is a place
   * a person goes to work somewhere, not a page they open when they are asking what they are
   * looking at.
   */
  | { name: 'worlds' }
  /**
   * TERMINAL MANAGEMENT: every terminal the office's terminal holder holds, for developers, from wave 13u and the
   * owner's review of the design. One terminal opens on this page itself, so the page needs no
   * address of its own per terminal.
   */
  | { name: 'terminals' }
  /**
   * THIS WORLD: WHAT IT IS FOR, AND WHAT IT SAYS ABOUT BEING A COPY. Criterion C33.
   *
   * A person in a world must be able to tell what they are asked to do there. A world
   * is a copy of the corpus taken when it started, so a handback filed afterwards on the live office
   * is not in it, and nothing in the world said so. A person who has entered a world opens this page
   * to read what they are being asked to look at, that the world is a copy taken at a stated time,
   * and that records filed after that live on their office.
   *
   * IT IS A FLAT ADDRESS AND NOT TWO SEGMENTS because there is one world per server: the address
   * answers about the world this page is pointed at, which is the one answering.
   */
  | { name: 'worldhere' }
  /**
   * THE EMBASSY: WHO LIVES IN THOSE WORLDS, AND WHO IS VISITING.
   *
   * Criterion M52: under World, an Embassy shows every known resident of the worlds and every
   * visitor, contacts especially, and by default only contacts. The Worlds page says which worlds there
   * are; this says who is on their rolls. It is reached from that page rather than from the rail,
   * because it is the second question a reader asks after the first one, and the criterion puts
   * it under World.
   */
  | { name: 'embassy' }
  /**
   * THE ROLE CARDS: WHAT EACH KIND OF CITIZEN MAY AND MAY NOT DO.
   *
   * Criterion P44: the way into the role cards is at the Embassy. The Embassy
   * says who the office knows; this says what each of them may do, and each row opens the card's own
   * record. It is a rail row in the same foot group as Worlds and the Embassy, because the cards are
   * one declaration for the whole installation and narrow to no project.
   */
  | { name: 'roles' }
  /**
   * THE CASTING TABLE (选角表), `#/casting`. For each role, the program, model and effort the office casts it with,
   * beside the role cards in the Agents group.
   */
  | { name: 'casting' }
  /**
   * A NEW ROLE CARD, BEING FILLED IN. `#/roles/new`, criterion P51.
   *
   * The other fields are left empty and are filled in after pressing into the card. So the add block
   * on the Role cards page is a press, and
   * this is where the press goes: the card's own page, empty, with nothing filled in for anybody.
   *
   * IT IS TWO SEGMENTS AND NOT A FOLD ON THE LIST PAGE, because a card is a page in this product —
   * every declared card is already one — and a form that appears inside a list would be the one
   * card in the product that lives somewhere else.
   */
  | { name: 'roleNew'; addedRole?: string; roleAction?: 'history' | 'remove' }
  /**
   * WHO HOLDS EACH CARD. `#/roles/who-holds-them`, criterion P72.
   *
   * The way in is folded shut, and pressing it opens a statistics screen.
   *
   * IT IS A PAGE AND NOT A PANEL ON THE LIST, for the reason `roleNew` gives one line above: the press
   * takes the reader somewhere, and a chart that unfolded inside the list is what the criterion
   * rules out.
   */
  | { name: 'roleCensus' }
  /**
   * ONE INCIDENT, READ AS A SCENE. `#/incident/<id>`, criterion I3.
   *
   * The record page draws an incident like any record; this page draws the scene itself — the loss
   * in the person's words first, the timeline in order with its evidence one press away, the three
   * responsibility sentences with their uncertainty beside them, and the corrective actions with
   * their state read from the records they link. It is reached from the incident record's head,
   * the way a pipeline's drawing is, and from no rail row.
   */
  | { name: 'incident'; id: string }
  /**
   * THE OFFICE REGULATIONS: THE PERSON'S OWN CONSTRAINTS, AND THE CHAPTERS THE AGENTS READ.
   * `#/regulations`, criterion G5 of design/regulations/ACCEPTANCE.md.
   *
   * The page lists the person's regulations with their revocation state, and the chapters with
   * their rules, drawn from the chapter records themselves — the same records every other reader
   * of the chapters reads — so a rule on the page and a rule an agent is given are one fact and
   * cannot quietly become two.
   *
   * IT IS A RAIL ROW, in the foot group beside Worlds, the Embassy and the Role cards: the cards
   * say what each role must keep and this says what the office itself must keep, which is the
   * same kind of place rather than a part of any project. `everyProject` for that reason.
   */
  | { name: 'regulations' }
  /**
   * THE TOOLSET CATALOGUE. `#/toolset`, piece P3 of plan KP0udNekYcAo: the catalogue is its own page,
   * grouped by category, with a filter by who uses a tool. `#/toolset/<slug>` is the same
   * route with one tool's manual page open, the way `#/counters/<id>` opens one counter. The slug is optional so
   * the list is a flat address.
   */
  | { name: 'toolset'; slug?: string }
  /**
   * THE DIRECTIONS SOMEBODY STOPPED AND KEPT. `#/shelved`, criterion S2.
   *
   * A page of its own because a shelf is a place a person goes back to, and because a shelved
   * direction is deliberately not in the open loops: it is out of what is being explored, and it is
   * not finished either. The page lists every shelved direction in this project, newest shelved
   * first, with the reason it was put down and what would bring it back.
   */
  | { name: 'shelved' }
  /**
   * THE COUNTERS OF ONE PROJECT, criterion CT8 of design/counters/ACCEPTANCE.md.
   *
   * `#/counters` is the list: every counter in the project on screen, each with its count, its
   * amount, its triggers, when it last fired and why, when a timer is next due, and whether it is
   * paused or has a firing held back. `#/counters/<id>` is the same page with one counter opened,
   * drawing its rows and its changes. The id is optional so the list is a flat address like the
   * pages beside it, and the one address with an id is the one counter opened.
   */
  | { name: 'counters'; id?: string }
  /**
   * `#/quick-note` — A QUICK NOTE, the page the window app's note window opens, and a browser tab opens too. With no
   * second segment it is a new note, filed when the person first writes or draws in it. `#/quick-note/<id>` is that
   * note, which the page names once it is filed, so a reload opens it again.
   */
  | { name: 'quickNote'; id?: string }
  /**
   * `#/your-words` — THE WORDS A SECRETARY COPIED FROM WHAT THE PERSON SAID ELSEWHERE, WAITING FOR THE PERSON TO CONFIRM
   * THEM. By look A of a decision, it is its own page with its own row in the sidebar, one row per note, across every
   * project, because the person says words to a secretary whichever project is on screen.
   */
  | { name: 'yourWords' }
  /**
   * THE RESOURCES EVERY PROJECT SHARES, on report peyJSnLoz_Bk and two
   * decisions. `#/resources` is one card per resource: who holds it now and
   * until when, who is booked next, and this week's use. The owner books the GPU from it, and a request to go first is
   * granted there.
   */
  | { name: 'resources' }
  /**
   * EVERYBODY'S CHECKLISTS, part 2 of the checklists work. `#/checklists` is the list, read across
   * projects; `#/checklists/<id>` is the same page with one checklist opened.
   */
  | { name: 'checklists'; id?: string }
  /**
   * THE FLOWS PAGE, wave 13p round 35, built on two decisions. `#/flows` is a
   * page of flows read across projects; `#/flows/<id>` is one flow, its stages drawn in order and its latest runs over
   * them.
   * `#/flows/<id>/edit` is the same flow in the editor, and `#/flows/new` is the editor with nothing in it (round 36).
   */
  | { name: 'flows'; id?: string; edit?: true; isNew?: true }
  /**
   * THE READINESS CHECKLISTS, wave 13u round 13. `#/readiness` is what waits
   * for a signature and every checklist; `#/readiness/<id>` is the same page with one checklist opened.
   */
  | { name: 'readiness'; id?: string }
  | { name: 'signingPackages'; id?: string }
  /**
   * THE HONOUR BOARD, wave 13u round 15, on criteria HB3 and HB5. `#/honour-board` is the
   * project's exemplary runs, newest first, the noted runs folded under them, and the weekly table.
   */
  | { name: 'honourBoard' }
  /**
   * THE PROJECT BOARD. `#/board` is one row for each step of the project's master pipeline, with a view by line and a
   * quick view as tabs.
   */
  | { name: 'board' }
  /**
   * THREE PAGES THAT WERE PANELS ON SETTINGS, wave 13y round 125 (item 62). `#/gates` is the gates the office checks
   * work against, a row in the Office group.
   * `#/office-controls` is the office's runtime settings, a row at the end of the Developer group.
   * `#/sidebar-arrangement` is the sidebar's arrangement; it has no row, and Looks on Settings leads to it. Each
   * panel's old address, `#/settings/gates` and the other two, leads to its page: MOVED_SETTINGS_PANELS below.
   * Gates and the sidebar's arrangement open as a reading, because a page opens as a reading
   * (tests/read-before-edit.test.ts), and `/edit` on either is its editing face, as on the schedule and a record.
   */
  | { name: 'gates'; edit?: true }
  | { name: 'officeControls' }
  | { name: 'sidebarArrangement'; edit?: true }
  /** EVERY PAGE THAT IS NOT IN FRONT IN THE SIDEBAR, grouped as the sidebar's arrangement groups them. */
  | { name: 'allPages' }
  /** EVERY QUICK NOTE THE PERSON KEPT, in every project, the newest started first (src/web/pages/MyNotesPage.tsx). */
  | { name: 'myNotes' }
  /**
   * ONE PARTICIPANT'S OWN PAGE, criterion M51.
   *
   * `#/who/agent/quill`, `#/who/person/<id>`. It carries a kind and an id because that is the only
   * way a participant is ever named in this product; a bare id would need a second lookup to say
   * which registry it is in, and the two registries may hold the same id.
   */
  | { name: 'who'; kind: ParticipantKind; id: string }
  /**
   * ONE SECRETARY'S NOTEBOOK. `#/who/agent/<id>/notebook`, criteria N1 to N4.
   *
   * UNDER THE CITIZEN PAGE AND NOT BESIDE IT. A notebook belongs to exactly one agent and is kept
   * under that secretary's name, so its address is that agent's address with one
   * segment after it, and a reader who deletes the segment lands on the page it is reached from.
   *
   * IT IS A PAGE AND NOT A FOLD ON THE CITIZEN PAGE. It is a list somebody reads and writes in, with
   * a form and a press on every row; the citizen page is a page somebody reads.
   */
  | { name: 'notebook'; kind: ParticipantKind; id: string }
  /**
   * ONE VISITING AGENT'S CREDENTIAL. `#/visitor/<id>`, criteria P24, P27, P28 and P29.
   *
   * A person confirms the trusted agents and worlds at the Embassy, on either machine, and keeps
   * count of them and supervises them there. The Embassy lists them; this is the one
   * credential, its facts, every
   * request made under it, and the two presses that are theirs — confirm, and end. It has a page of its
   * own rather than a block that opens on the Embassy because it is where they act, and because
   * criterion P28's sentences about what a credential cannot prove belong beside the thing they are
   * about rather than once at the top of a list of many.
   *
   * NOT A RAIL ROW. It is reached from the Embassy, where the supervising is done.
   */
  | { name: 'visitor'; id: string }
  /**
   * ONE PAGE OF A SWITCHED-ON PLUGIN, #/plugin/<id>/<slug> (wave 13x round 15, block 3nJsBlPlYhcl). The page is drawn
   * in a sandboxed frame inside the office's own, and an address with no page says why. Whether there is one is
   * whyAPluginHasNoPage in src/shared/plugins.ts.
   *
   * NOT A ROW OF DESTINATIONS. The sidebar draws a row for each page of a switched-on plugin, read from the office.
   */
  | { name: 'plugin'; id: string; slug: string }
  | { name: 'sheet' }
  | { name: 'unknown'; path: string }

/**
 * THE SIDEBAR GROUPS THAT HAVE A CATEGORY PAGE, and the route that draws each. Wave 13q's S2.
 *
 * The key is the group's key in the sidebar (the effective arrangement read by railGroups()) and the
 * first word of the page's address. The first group, All projects, is not here: in the design draft
 * it is a caption over first-level pages and has no page of its own.
 */
export const CATEGORY_PAGES = {
  agents: 'agentsCategory',
  office: 'officeCategory',
  developer: 'developerCategory',
  project: 'projectCategory',
} as const satisfies Readonly<Record<string, Route['name']>>

/** One sidebar group that has a category page. */
export type CategoryKey = keyof typeof CATEGORY_PAGES

/** The group whose category page this route is, or null when it is not a category page. */
export function categoryOfPage(name: Route['name']): CategoryKey | null {
  for (const key of Object.keys(CATEGORY_PAGES) as CategoryKey[]) if (CATEGORY_PAGES[key] === name) return key
  return null
}

/** The six family keys, read off the shared table so this file holds no copy of them. */
const FAMILY_KEYS = Object.keys(KIND_FAMILIES) as readonly KindFamily[]

/** The family a segment names, or null. `#/workspace` is not `#/work`; the match is exact. */
function familyFrom(segment: string): KindFamily | null {
  return FAMILY_KEYS.find((key) => key === segment) ?? null
}

/**
 * The one word in an address that is not a period key. Written once, read by the parser and by the
 * builder below, so the page and the router cannot disagree about how today is spelt.
 */
export const TODAY_SEGMENT = 'today'

/**
 * The last word of an address that is being written in rather than read.
 *
 * WHETHER YOU ARE READING OR EDITING IS IN THE ADDRESS, on the three pages that can be edited: the
 * schedule, one plan, and one record. So Back leaves editing, a screenshot can name which state it
 * caught, and the review tool can photograph both. It is spelt once, here, and read by the parser
 * and by the builder below.
 *
 * THREE ROUTES TAKE IT AND THE REST REFUSE IT. "#/records/edit" is not the records page being
 * edited; it is an address nobody has, and it lands on the not-found page like any other typo.
 */
export const EDIT_SEGMENT = 'edit'

/** The first segment of a plugin page's address, #/plugin/<id>/<slug>. */
export const PLUGIN_SEGMENT = 'plugin'

/**
 * WHAT MAY FOLLOW A RECORD'S ID, DECIDED ONCE.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * A record's address may take ONE trailing segment, and only a word from this closed list. Nothing
 * else. `#/r/abc/extra` still lands on the not-found page, because `extra` is not in the list.
 *
 * A section is a part of the record's page. It is not a second page, and it adds no member to the
 * `Route` union — one optional field on the record route carries it. So the review tool asks for no
 * new photograph and the shell's page map does not grow.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS DECIDED HERE AND NOT WHERE THE FIRST SECTION IS BUILT
 * ---------------------------------------------------------------------------------------
 *
 * Two things want it and they arrive in different waves: the History section, and any address that
 * names a part of a report. Deciding it twice is how one routing rule gets two shapes, so the shape
 * is settled once, in this file, and each section that is later built adds its word to this list
 * and nothing else.
 *
 * The record address used to be `parts.length === 2` exactly, for a reason worth keeping: with no
 * rule at all, `#/r/abc/extra` quietly opened record `abc`, so one record had unlimited addresses
 * and a link with junk on the end went on working. This is NOT that rule relaxed. It is the same
 * rule the trailing `edit` already follows: a named word out of a fixed list, checked, and anything
 * else refused.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS NOT A SECTION
 * ---------------------------------------------------------------------------------------
 *
 * A part of a report — a paragraph, a table, a cell — is not a section and never becomes a segment.
 * If a report region is ever made linkable, it is a FRAGMENT (`#/r/<id>#<regionId>`), so it never
 * reaches this parser and cannot collide with a word in this list.
 *
 * A WORD IS IN THIS LIST ONLY WHEN SOMETHING ON THE RECORD PAGE OPENS AT IT. An address that opens
 * nothing is a broken link that looks like a working one, so the list holds what exists: `history`
 * opens the versions of this record, which the page already draws as a fold.
 */
export const RECORD_SECTIONS = ['history'] as const satisfies readonly string[]

/**
 * THE FIRST WORD OF A REPORT'S OWN ADDRESS, criterion E2. `#/report/<id>` opens the report.
 *
 * Not one entry per kind: only the very common kinds that have no entry yet, report in
 * particular. Allen pressed a thing in a list and the left rail ran to Everything (design
 * report SLKHRVIOUI5-); the kind's own word in the address is what makes the thing's own page a place the rail can
 * name, and what keeps ONE spelling of their complaint live.
 *
 * THE WORD IS DECIDED HERE AND NOT WHERE IT IS FIRST BUILT, for the same reason every address word
 * is: the write door reads this file too (criterion M97), so a lead may point at `#/report/<id>`
 * and one table both readers parse is what keeps a page refused and a lead dead apart.
 *
 * IT IS NOT IN RENAMED_ADDRESSES, because nothing was renamed: there is no `#/report` page behind
 * this word to unseat, and the record page it opens is the page `#/r/<id>` already opened. Both
 * addresses open the same page; the new one says the kind in the words a person reads and copies.
 */
export const REPORT_SEGMENT = 'report'

/**
 * THE FIRST WORD OF A MESSAGE'S OWN ADDRESS, criterion E2. `#/message/<id>` opens the message.
 *
 * By point 3 of a decision, some kinds get an entry and a page of their own. A message is the
 * next kind after report to get an entry of its own, because it is the commonest kind with no page yet (6,422 records
 * on 16 September). The word is the kind's own, singular, so the page's address and the record kind are one spelling.
 *
 * IT IS NOT IN RENAMED_ADDRESSES, for the reason the report word gives: nothing was renamed. A
 * message still opens at `#/r/<id>` when a caller holds only an id, and the word adds a place a
 * list that knows the kind can send somebody, not a replacement for the address that already works.
 */
export const MESSAGE_SEGMENT = 'message'

/**
 * THE FIRST WORD OF A PROBLEM'S OWN ADDRESS, criterion E2. `#/problem/<id>` opens the problem.
 *
 * By point 3 of a decision, some kinds get an entry and a page of their own. A problem is the
 * third kind that decision names (839 records on 16 September) and it gets a page of its own, after message. The word
 * is the kind's own, singular, so the page's address and the record kind are one spelling.
 *
 * IT IS NOT IN RENAMED_ADDRESSES, for the reason the report and message words give: nothing was
 * renamed. A problem still opens at `#/r/<id>` when a caller holds only an id, and the word adds a
 * place a list that knows the kind can send somebody, not a replacement for the address that already
 * works.
 */
export const PROBLEM_SEGMENT = 'problem'

/**
 * THE FIRST WORD OF A RUN'S OWN ADDRESS, criterion E2. `#/session/<id>` opens the run's page.
 *
 * By point 3 of a decision, some kinds get an entry and a page of their own. A session is the
 * third kind that decision names, after report and message. The word is the kind's own, singular, so the page's address
 * and the record kind are one spelling.
 *
 * IT IS NOT IN RENAMED_ADDRESSES: nothing was renamed. A run still opens at `#/r/<id>` when a caller
 * holds only an id, and the word adds a place a list that knows the kind can send somebody.
 */
export const SESSION_SEGMENT = 'session'

/** THE FIRST WORD OF A HANDBOOK'S OWN ADDRESS. `#/handbook/<id>` opens the handbook. The word is the kind's own, singular. */
export const HANDBOOK_SEGMENT = 'handbook'

/** The second segment of `#/pipeline/drawing`, the drawing of every module. See the pipeline route. */
export const PIPELINE_DRAWING_SEGMENT = 'drawing'

/**
 * THE RECORD KINDS WHOSE OWN PAGE THEIR ADDRESS CARRIES, and the word in the address that says so.
 *
 * Criterion E2 names the kinds one at a time. `report` was the first, and a
 * worker built it. `message` is the second, and it is the first kind whose
 * page is a page of its own rather than the record page with the kind in the address. `problem` is
 * the third, and it is a page of its own too. `session` is the fourth, on the same decision, and it
 * too has a page of its own. `handbook` is the fifth, a kind of 7 November 2026, and its page is one of
 * its own from the start.
 *
 * The kinds that already have a page of their own by a first segment built elsewhere — `pipeline` in
 * FLAT_ROUTES, an `incident` by INCIDENT_SEGMENT, an `agent` by the profile segment and its kind —
 * are reached through `recordPath` by kind as well, but each of those pages has its own route and
 * its own parser branch; they are named there, and this table adds nothing for them. A further kind
 * gains its word HERE, its `parseRoute` branch beside the `r` branch, and its builder in the
 * router's own switch — which is why the list is read once here and never at a call site.
 */
export const KINDS_WITH_THEIR_OWN_ADDRESS: ReadonlySet<RecordKind> = new Set(['report', 'message', 'session', 'problem', 'handbook'])

/** One named section of a record's page. */
export type RecordSection = (typeof RECORD_SECTIONS)[number]

/** True when this word is one of the record sections this build has. */
export function isRecordSection(word: string): word is RecordSection {
  return (RECORD_SECTIONS as readonly string[]).includes(word)
}

/** The first segment of the Settings page's address, in one place: the route table and the builder below read it. */
export const SETTINGS_SEGMENT = 'settings'

/**
 * EVERY PANEL ON THE SETTINGS PAGE, BY ITS SURFACE ID. "#/settings/<word>" opens one, the
 * word being the id without "settings.". The list comes from src/shared/settings-declaration.ts, which the page and
 * the Settings structure reading also use.
 */
export const SETTINGS_PANELS = SETTINGS_DECLARATION.map((panel) => panel.key)

export type SettingsPanel = (typeof SETTINGS_PANELS)[number]

/** The panel an address word names, or null when no panel has that word. */
export function settingsPanelFrom(word: string): SettingsPanel | null {
  return SETTINGS_PANELS.find((panel) => panel === `settings.${word}`) ?? null
}

/** The address of the Settings page, or, given a panel, of that panel opened on it. The one builder of either. */
export function settingsPath(panel?: SettingsPanel): string {
  return panel === undefined ? `/${SETTINGS_SEGMENT}` : `/${SETTINGS_SEGMENT}/${panel.slice('settings.'.length)}`
}

/** The routes that are one segment and carry nothing else. Written out because they have no id. */
export type FlatRoute = Extract<
  Route,
  {
    name:
      | 'records'
      | 'modules'
      | 'pipeline'
      | 'projectgraph'
      | 'sessions'
      | 'interrupted'
      | 'mergequeue'
      | 'needsyou'
      | 'claims'
      | 'projects'
      | 'said'
      | 'recordquestions'
      | 'queries'
      | 'plan'
      | 'sheet'
      | 'plans'
      | 'horizons'
      | 'governance'
      | 'placeholders'
      | 'bundles'
      | 'tasksToTake'
      | 'agents'
      | 'agentsCategory'
      | 'officeCategory'
      | 'developerCategory'
      | 'projectCategory'
      | 'messages'
      | 'chat'
      | 'working'
      | 'usage'
      | 'versionHistory'
      | 'folderreading'
      | 'runtime'
      | 'worlds'
      | 'terminals'
      | 'worldhere'
      | 'embassy'
      | 'roles'
      | 'casting'
      | 'regulations'
      | 'toolset'
      | 'shelved'
      | 'counters'
      | 'quickNote'
      | 'yourWords'
      | 'resources'
      | 'checklists'
      | 'flows'
      | 'readiness'
      | 'signingPackages'
      | 'honourBoard'
      | 'board'
      | 'gates'
      | 'officeControls'
      | 'sidebarArrangement'
      | 'allPages'
      | 'myNotes'
      | 'settings'
      | 'pairing'
      | 'welcome'
  }
>

/**
 * Address segment -> route, in ONE place.
 *
 * The shell used to recognise "#/records" and "#/ui" itself, out of the `unknown` route's path,
 * because parseRoute had no case for them. That meant the set of pages was written down twice and
 * the two copies were kept in step by hand. This map is the only copy; App.tsx derives its
 * navigation from the same names and a test parses every header link back through here.
 */
export const FLAT_ROUTES: Readonly<Record<string, FlatRoute['name']>> = {
  records: 'records',
  modules: 'modules',
  // Singular, matching the record kind `pipeline` and the component PipelinePage, so that an
  // agent writing a link by hand and an agent calling pathFor('pipeline') land on the same
  // address. Pipelines were a first-class kind with no page of their own until this phase; they
  // appeared as one panel on Home and as a record view, and nothing else.
  pipeline: 'pipeline',
  // THE PROJECT GRAPH, wave 13s round 241. Its address is the words a reader says: the whole project's past,
  // present and live futures on one page.
  'project-graph': 'projectgraph',
  sessions: 'sessions',
  interrupted: 'interrupted',
  // THE MERGE QUEUE PAGE: #/merge-queue, the words of the API door it reads.
  'merge-queue': 'mergequeue',
  // THE PAGES HOME'S MOVED SECTIONS WENT TO.
  'needs-you': 'needsyou',
  claims: 'claims',
  projects: 'projects',
  said: 'said',
  'record-questions': 'recordquestions',
  // "Missing and unused" is what the page holds: results nothing is using, and work waiting on a
  // result that does not exist yet. The address said `queries`, which named how the page is worked
  // out and promised a search box it does not have. The ROUTE is still called `queries`, because
  // that is the page's name in the code and renaming it would reach files this change does not own.
  // An address and a page name are allowed to differ; this file is the one place they meet.
  missing: 'queries',
  // The plan: when this person will spend real time on work that already exists. Its own page
  // rather than a panel, because it is the only surface that legitimately spans every project.
  plan: 'plan',
  // The plans a person has written. Writing, not hours: nothing on that page asks for an hour, and
  // that absence is how a stranger learns the difference between it and the address above.
  plans: 'plans',
  // The goals at each horizon, the clusters serving them and the parts under each. Criterion P5.
  // The address is the plural of the horizon word because the page is named after its four bands,
  // and the rail row carries the words a person reads.
  horizons: 'horizons',
  // Everything waiting on a person, and the choices already made. It spans every project, because
  // what is waiting on somebody does, and because Home's number has to be followable to all of it.
  // The word is what the queue is FOR rather than what it is made of: it holds forks, questions
  // agents have asked, and kept words about time, and "decisions" named one of the three.
  governance: 'governance',
  // What has deliberately been left unresolved, and what ran when the agreed method could not. The
  // word is what a person filing one calls it; `ran_instead` records are on the same page because
  // they answer the same question — what this work may not be used to claim.
  placeholders: 'placeholders',
  // What a copy of this project's context would say, and what has actually been handed over. The
  // word is what a person calls the thing they are about to paste somewhere.
  bundles: 'bundles',
  // THE PACKAGED TASKS, criterion F16 point 2. "tasks" alone names the record kind and this list
  // holds only the tasks somebody has written up for somebody else, so the address says the act:
  // the tasks a person or a passing agent can take. The rail row and the page heading say it too.
  'tasks-to-take': 'tasksToTake',
  // Talking to an agent about this project's work, and what came back. The word is what the rail
  // row says, Agent conversations. It was `#/agents` until the word went to the group below.
  conversations: 'agents',
  // THE CATEGORY PAGES, wave 13q's S2. The segment is the group's key in CATEGORY_PAGES, and
  // tests/the-category-pages.test.ts checks that each builds back to it.
  agents: 'agentsCategory',
  office: 'officeCategory',
  developer: 'developerCategory',
  project: 'projectCategory',
  // EVERY MESSAGE IN THE PROJECT. The word is what a person calls the things, not what the store
  // calls the rows, and it is the same word the circle at the bottom right already uses.
  messages: 'messages',
  // THE CHAT, ACROSS EVERY PROJECT. The word the sidebar row and the corner button already use.
  chat: 'chat',
  // THE AGENTS AT WORK, right now. The address is the page's name as the rail row and the heading
  // say it, since wave 13y round 120. It is the present tense of the three rows around it: runs is
  // history, conversations is what was said, use is what was read, and this is the work going on now.
  'agents-at-work': 'working',
  // How agents read this project. The address says "agent use" rather than "usage" because usage on
  // its own reads as billing, and this page is about reading rather than about spending.
  'agent-use': 'usage',
  'version-history': 'versionHistory',
  'folder-reading': 'folderreading',
  // How this browser draws Mole Office: the theme, how much detail is shown, and who a write is
  // attributed to. The word is the one everybody types into a search box looking for exactly this,
  // so the address, the rail row and the page heading are all "Settings".
  [SETTINGS_SEGMENT]: 'settings',
  // PAIR THIS BROWSER, ONCE. Criterion P83, point 2. The word is the act, and it is the word a
  // person is looking for when the office has offered them the page.
  pairing: 'pairing',
  // THE FIRST-RUN GUIDE. The word is what the page does for a newcomer, and the address an agent that
  // installed the office hands its person (GET /api/office/owner names it as `guide`).
  welcome: 'welcome',
  // What is running: the API this page talks to, the database behind it, the commit it was built
  // from, and how new the code is. One word, and it is the word a person types when they are asking
  // what they are looking at.
  runtime: 'runtime',
  // WHICH WORLDS THERE ARE. One word, for the worlds that exist now. The office is what
  // the desk is called; "worlds" is what a person is looking for when they open it.
  worlds: 'worlds',
  // TERMINAL MANAGEMENT, the developer page for every terminal the office holds (wave 13u).
  terminals: 'terminals',
  // WHAT THIS WORLD IS FOR, AND THAT IT IS A COPY. Criterion C33. The segment is "here" because
  // the page is about the world the address answers from — where the reader is standing.
  here: 'worldhere',
  // WHO LIVES IN THOSE WORLDS, AND WHO IS VISITING. The page is the office that handles callers from
  // elsewhere, and "embassy" is what that is in the product's language. It is
  // what a reader is looking for when they want to know who the office knows, which is a different
  // question from which worlds there are.
  embassy: 'embassy',
  // WHAT EACH ROLE MAY DO. The address is the word on the row and on the page, which is what a
  // person types when they are looking for exactly this. Criterion P44.
  roles: 'roles',
  // THE CASTING TABLE. The address is the English word for the table.
  casting: 'casting',
  // WHAT THE OFFICE ITSELF MUST KEEP: the person's regulations, and the chapters the agents read.
  // One word, G1's word for it in what a reader sees, and the same word the rail row carries.
  regulations: 'regulations',
  // THE TOOLSET CATALOGUE, piece P3. One word, and the same word the rail row and the page heading
  // carry. `#/toolset/<slug>` opens one tool's manual page and is parsed below.
  toolset: 'toolset',
  // THE DIRECTIONS SOMEBODY STOPPED AND KEPT, criterion S2. One word, and the same word the rail row
  // and the page heading carry.
  shelved: 'shelved',
  // THE COUNTERS OF THIS PROJECT, criterion CT8. One word, and the same word the rail row and the
  // page heading carry. `#/counters/<id>` opens one counter and is parsed below, the way the
  // pipelines address takes an optional id.
  counters: 'counters',
  // THE WORDS WAITING FOR THE PERSON TO CONFIRM. Whose words they are, said in two words.
  'your-words': 'yourWords',
  // THE RESOURCES EVERY PROJECT SHARES (report peyJSnLoz_Bk). One word, and the same word the rail row and
  // the page heading carry.
  resources: 'resources',
  // EVERYBODY'S CHECKLISTS. `#/checklists/<id>` opens one checklist and is parsed below.
  checklists: 'checklists',
  // THE FLOWS PAGE. `#/flows/<id>` opens one flow and is parsed below.
  flows: 'flows',
  // THE READINESS CHECKLISTS. `#/readiness/<id>` opens one checklist and is parsed below.
  readiness: 'readiness',
  'signing-packages': 'signingPackages',
  // THE HONOUR BOARD. One address, no second segment.
  'honour-board': 'honourBoard',
  // THE PROJECT BOARD (wave 13u round 216). One address, no second segment.
  board: 'board',
  // THREE PAGES THAT WERE PANELS ON SETTINGS (wave 13y round 125). Each has one address, with no second segment.
  gates: 'gates',
  'office-controls': 'officeControls',
  'sidebar-arrangement': 'sidebarArrangement',
  'all-pages': 'allPages',
  // A NEW QUICK NOTE. The segment is THE_QUICK_NOTE_SEGMENT, which the window app opens; it is written out here because
  // tools/review.mjs reads this table as text. A second segment is one note, read below.
  'quick-note': 'quickNote',
  // EVERY QUICK NOTE ON A PAGE OF ITS OWN (wave 13y round 167). A note opens from here; none is listed under Reports.
  'my-notes': 'myNotes',
  // The component sheet's address is "#/ui" and its page is called the sheet. The address is what
  // people type; the name is what the code calls it. They are allowed to differ, here, once.
  ui: 'sheet',
}

/**
 * The id out of an address segment, or null when that segment is not an id at all.
 *
 * TWO ADDRESSES IN THIS APP CARRY AN ID, AND THEY USED TO BE THE ONLY TWO THAT COULD TAKE THE PAGE
 * DOWN. `decodeURIComponent` THROWS a URIError on "%zz" and on a truncated escape like "%E4%B8" —
 * which is what a link to a Chinese-titled record looks like after a chat client wraps it. This
 * function is called from a `useState` initialiser and from the `hashchange` handler, and there is
 * no error boundary in the shell, so the throw was not a route that failed: it was the whole page
 * failing to render on load, or the address bar changing with the page silently refusing to follow.
 *
 * The catch is narrow and it is not a decision to hide anything, which is the only reason it is
 * allowed here: an id that is not a valid escape sequence is not the id of any record, the caller
 * turns it into the not-found route, and that page prints the address back and offers two ways out.
 * That is the answer every OTHER bad address in this app already gets — "#/recordz" does not throw —
 * so this is the id-carrying routes joining the contract rather than a new behaviour.
 */
function idFrom(segment: string): string | null {
  try {
    return decodeURIComponent(segment)
  } catch {
    return null
  }
}

/**
 * Addresses that were renamed, old first segment to new first segment.
 *
 * ---------------------------------------------------------------------------------------
 * AN ADDRESS IS A LABEL TOO, AND RENAMING ONE COSTS SOMEBODY THEIR BOOKMARK
 * ---------------------------------------------------------------------------------------
 *
 * An address is what a person pastes to a colleague, so it is held to the same rule as a word on
 * the screen. `#/queries` named how the page is computed; `#/missing` names what is on it.
 *
 * BOTH HALVES ARE NEEDED AND NEITHER IS ENOUGH ALONE. The old address still parses, so every
 * bookmark and every link already sent goes on landing on the right page. And the shell then
 * REWRITES the address bar, so the next time that person copies it they copy the new one — a
 * redirect that leaves the old address in the bar teaches the old address for ever.
 *
 * A key here must never also be a value, or the rewrite would have somewhere to go next; the
 * function below refuses that rather than looping.
 */
export const RENAMED_ADDRESSES: Readonly<Record<string, string>> = {
  queries: 'missing',
  // `#/decisions` WAS A PAGE AND IS NOW A DOOR ONTO THE QUEUE THAT ABSORBED IT. The choices waiting
  // on you are one of the three things `GET /api/waiting` reads, so they are drawn there with the
  // other two rather than on a page of their own. Every bookmark, and every link already sent, goes
  // on landing on the right place — and the bar is rewritten afterwards, so the next person to be
  // sent one is sent the new address.
  decisions: 'governance',
  // The family keys are the addresses, and three of them named nothing a reader could use.
  // `#/belief` held four kinds under one word; it is now two pages, and the old address lands on
  // the governance queue because that is the half a person is sent to — a proposal waiting on them
  // is the only thing in the old family that was ever urgent. Somebody looking for a measurement
  // arrives there and the rail row Findings is two rows below the row they are on.
  //
  // IT POINTS AT THE QUEUE AND NOT AT `decisions`, because a key here may never also be a value:
  // `renamedAddress` refuses a rename whose destination is itself renamed rather than sending a
  // reader round a loop.
  belief: 'governance',
  maybe: 'ideas',
  happened: 'notes',
  // The page's name became "Agents at work" in wave 13y round 120, and its address went with it.
  working: 'agents-at-work',
}

/**
 * THE SETTINGS PANELS THAT BECAME PAGES, the panel's word to the page's first segment (wave 13y round 125, item 62).
 * `#/settings/gates` was the Gates panel on Settings and is now the Gates page, so the old address leads there and
 * the bar is rewritten, as for a renamed address above. Only the whole two-segment address is moved: these words
 * are no longer panels, so `#/settings/gates/x` is a typo and lands on the not-found page.
 */
export const MOVED_SETTINGS_PANELS: Readonly<Record<string, string>> = {
  gates: 'gates',
  officecontrols: 'office-controls',
  sidebar: 'sidebar-arrangement',
}

/**
 * The address this one has been renamed to, or null when it has not been renamed.
 *
 * Only the FIRST segment is renamed, and everything after it is carried across untouched: a rename
 * changes which place an address names, never what it says about the thing inside that place. The one
 * exception is a Settings panel that became a page, MOVED_SETTINGS_PANELS above, where the panel's word is
 * the place.
 */
export function renamedAddress(hash: string): string | null {
  const path = hash.replace(/^#/, '')
  const parts = path.split('/').filter((s) => s.length > 0)
  const head = parts[0]
  if (head === undefined) return null
  const word = head === SETTINGS_SEGMENT && parts.length === 2 ? parts[1]! : null
  if (word !== null && Object.hasOwn(MOVED_SETTINGS_PANELS, word)) return `/${MOVED_SETTINGS_PANELS[word]}`
  const to = RENAMED_ADDRESSES[head]
  if (to === undefined) return null
  // A rename whose destination is itself renamed would send a reader round a loop, and the address
  // bar would flicker rather than settle. Say so instead: it is a programming mistake in the table
  // above, not something a reader can cause.
  if (RENAMED_ADDRESSES[to] !== undefined) {
    throw new Error(`The address "${head}" is renamed to "${to}", which is itself renamed.`)
  }
  return `/${[to, ...parts.slice(1)].join('/')}`
}

/**
 * ONE PARTICIPANT'S OWN PAGE, AS AN ADDRESS: `#/who/agent/<id>`. The one place a sentence that sends
 * somebody to a participant's page writes the address; `parseRoute` reads the same segment back, and a
 * test holds that the two agree. The raise's press is drawn there, so a refusal that names the press names
 * this page, as chapter 8, rule 4 and a decision say. The kind written into it is the router's
 * own path segment, a route the secretary follows and never a word a person reads as prose, so
 * tests/machine-word-allowlist.json lists it for the machine-word gate rather than reading it through
 * the word lists, which would break the address.
 */
export function participantPagePath(kind: ParticipantKind, id: string): string {
  return `#/${PROFILE_SEGMENT}/${kind}/${encodeURIComponent(id)}`
}

export function parseRoute(hash: string): Route {
  // The old address is turned into the new one before anything else looks at it, so there is one
  // parser and not two: a page reached by its old address is the same route in every respect.
  const renamed = renamedAddress(hash)
  if (renamed !== null) return parseRoute(`#${renamed}`)
  const path = hash.replace(/^#/, '')
  const written = path.split('/').filter((s) => s.length > 0)
  // A TRAILING "edit" IS TAKEN OFF BEFORE ANYTHING ELSE READS THE ADDRESS, and `editing` carries
  // what it said. Every branch below then matches on the address without it, and each branch says
  // for itself whether it accepts one — so "#/plans/abc/edit" is one plan being written in, and
  // "#/pipeline/abc/edit" is a typo and lands on the not-found page.
  //
  // The first segment can never be the word: "#/edit" is a page nobody has, not the home page
  // being edited.
  const editing = written.length > 1 && written[written.length - 1] === EDIT_SEGMENT
  const parts = editing ? written.slice(0, -1) : written
  const [head, second] = parts
  if (head === undefined) return { name: 'home' }
  // TWO SEGMENTS EXACTLY, the same rule the pipeline address below and every flat address further
  // down are held to. This one was the exception and it was the most-linked address in the product:
  // "#/r/abc/extra" quietly opened record abc, so one record had unlimited addresses and a link
  // with junk on the end went on working — which is how a broken link survives for months, written
  // down twice in this file as the reason for the rule the record address did not follow.
  if (head === 'r' && second !== undefined && parts.length === 2) {
    const id = idFrom(second)
    if (id === null) return { name: 'unknown', path }
    return editing ? { name: 'record', id, edit: true } : { name: 'record', id }
  }
  // ONE TRAILING SEGMENT, AND ONLY A NAMED SECTION. See RECORD_SECTIONS for the rule and for why it
  // is decided here rather than where the first section is built. `#/r/abc/extra` still lands on the
  // not-found page, and so does `#/r/abc/history/edit`: a section is a place in a record you are
  // READING, and this branch says so for itself rather than letting the trailing word through.
  if (head === 'r' && second !== undefined && parts.length === 3 && !editing) {
    const word = parts[2]
    if (word === undefined || !isRecordSection(word)) return { name: 'unknown', path }
    const id = idFrom(second)
    if (id === null) return { name: 'unknown', path }
    return { name: 'record', id, section: word }
  }
  /**
   * THE KIND WORD TAKES AN ID AND OPENS THE SAME RECORD PAGE. Criterion E2.
   *
   * `#/report/<id>` is the record page, with the address whole. It is the same two-or-three rule
   * the `r` branches hold: two segments exactly for the plain page and for writing in it, and a
   * named section out of the closed list for the third — so `#/report/abc/extra` lands on the
   * not-found page for the same reason `#/r/abc/extra` does, and the same rule is not being
   * relaxed here, it is being joined.
   *
   * THE KIND IS IN THE ROUTE because the rail asks one question of whatever is on screen — which
   * row this record belongs to — and an address that carries the word answers it at once, with none
   * of the beat the fetched record would take. A caller that holds only an id keeps `#/r/<id>`,
   * which opens the report exactly as it always did and learns the kind from the record itself.
   */
  if (head === REPORT_SEGMENT && second !== undefined && parts.length === 2) {
    const id = idFrom(second)
    if (id === null) return { name: 'unknown', path }
    return editing ? { name: 'record', id, edit: true, kind: 'report' } : { name: 'record', id, kind: 'report' }
  }
  if (head === REPORT_SEGMENT && second !== undefined && parts.length === 3 && !editing) {
    const word = parts[2]
    if (word === undefined || !isRecordSection(word)) return { name: 'unknown', path }
    const id = idFrom(second)
    if (id === null) return { name: 'unknown', path }
    return { name: 'record', id, section: word, kind: 'report' }
  }
  /**
   * ONE MESSAGE'S OWN PAGE. Criterion E2.
   *
   * `#/message/<id>` is a page of its own — not the record page with the kind in the address, the
   * way `#/report/<id>` is — because the page draws more than the record page does: the sender, the
   * people or group it reached, the marks, the conversation it belongs to, and what it is about.
   * The two-segment rule is the one every id-carrying address holds: a third segment is a typo and
   * lands on the not-found page rather than opening a working page, and `idFrom` is what keeps a
   * truncated escape from taking the whole app down. A caller that holds only an id keeps
   * `#/r/<id>`, which the record page still opens, exactly as the design says.
   */
  if (head === MESSAGE_SEGMENT && second !== undefined && parts.length === 2 && !editing) {
    const id = idFrom(second)
    return id === null ? { name: 'unknown', path } : { name: 'message', id }
  }
  /**
   * ONE PROBLEM'S OWN PAGE. Criterion E2.
   *
   * `#/problem/<id>` is a page of its own, like a message's, because it draws the problem's own
   * sections — what breaks, what was tried, whose move it is, the state and the fix, and what it is
   * joined to — with its own breadcrumb and its own row in the rail. The two-or-three rule is the one
   * `#/report/<id>` holds: two segments exactly for the plain page and for writing in it, and a
   * caller that holds only an id keeps `#/r/<id>`, which the record page still opens. A third
   * segment that is not `/edit` is a typo and lands on the not-found page rather than opening a
   * working page, and `idFrom` is what keeps a truncated escape from taking the whole app down.
   */
  if (head === PROBLEM_SEGMENT && second !== undefined && parts.length === 2) {
    const id = idFrom(second)
    if (id === null) return { name: 'unknown', path }
    return editing ? { name: 'problem', id, edit: true } : { name: 'problem', id }
  }
  /**
   * ONE AGENT RUN'S OWN PAGE, by criterion E2 and a decision. `#/session/<id>` is a page of its
   * own, built after the message page, and the two-segment rule is the one every id-carrying address holds: a third
   * segment is a typo and lands on the not-found page, `idFrom` keeps a truncated escape from taking the app down, and
   * a caller that holds only an id keeps `#/r/<id>`, which the record page still opens.
   */
  if (head === SESSION_SEGMENT && second !== undefined && parts.length === 2 && !editing) {
    const id = idFrom(second)
    return id === null ? { name: 'unknown', path } : { name: 'session', id }
  }
  // ONE HANDBOOK'S OWN PAGE. Two segments exactly, as for a run: a third is a typo and lands on the not-found page.
  if (head === HANDBOOK_SEGMENT && second !== undefined && parts.length === 2 && !editing) {
    const id = idFrom(second)
    return id === null ? { name: 'unknown', path } : { name: 'handbook', id }
  }
  // One plan, read or written in. Two segments exactly, plus the optional word, for the reason the
  // record address above gives.
  if (head === 'plans' && second !== undefined && parts.length === 2) {
    const id = idFrom(second)
    if (id === null) return { name: 'unknown', path }
    return editing ? { name: 'onePlan', id, edit: true } : { name: 'onePlan', id }
  }
  // The one page that takes an id and is still the same page. Two segments exactly: "#/pipeline/a/b"
  // is a typo, and sending a typo to a working page is how a broken link survives for months.
  if (head === 'pipeline' && second !== undefined && parts.length === 2 && !editing) {
    if (second === PIPELINE_DRAWING_SEGMENT) return { name: 'pipeline', drawing: true }
    const id = idFrom(second)
    return id === null ? { name: 'unknown', path } : { name: 'pipeline', id }
  }
  // ONE COUNTER OPENED, and still the counters page. Two segments exactly: "#/counters/a/b" is a
  // typo, and sending a typo to a working page is how a broken link survives for months. The flat
  // one-segment address below is the list; this is the same route with a counter open.
  if (head === 'counters' && second !== undefined && parts.length === 2 && !editing) {
    const id = idFrom(second)
    return id === null ? { name: 'unknown', path } : { name: 'counters', id }
  }
  // ONE QUICK NOTE, by its id, for the reason the counters address gives.
  if (head === THE_QUICK_NOTE_SEGMENT && second !== undefined && parts.length === 2 && !editing) {
    const id = idFrom(second)
    return id === null ? { name: 'unknown', path } : { name: 'quickNote', id }
  }
  // ONE CHECKLIST OPENED, and still the checklists page, for the reason the counters address gives.
  if (head === 'checklists' && second !== undefined && parts.length === 2 && !editing) {
    const id = idFrom(second)
    return id === null ? { name: 'unknown', path } : { name: 'checklists', id }
  }
  // A NEW FLOW, the editor with nothing in it, as a new role card is `#/roles/new`. Asked before the id below.
  if (head === 'flows' && second === 'new' && parts.length === 2 && !editing) return { name: 'flows', isNew: true }
  // ONE FLOW, and still the flows page, for the reason the counters address gives. With the trailing word, the editor.
  if (head === 'flows' && second !== undefined && parts.length === 2) {
    const id = idFrom(second)
    if (id === null) return { name: 'unknown', path }
    return editing ? { name: 'flows', id, edit: true } : { name: 'flows', id }
  }
  // ONE READINESS CHECKLIST OPENED, and still the readiness page. Its id is the table's own, not a record's.
  if (head === 'readiness' && second !== undefined && parts.length === 2 && !editing) {
    const id = idFrom(second)
    return id === null ? { name: 'unknown', path } : { name: 'readiness', id }
  }
  if (head === 'signing-packages' && second !== undefined && parts.length === 2 && !editing) {
    const id = idFrom(second)
    return id === null ? { name: 'unknown', path } : { name: 'signingPackages', id }
  }
  // ONE TOOL'S MANUAL PAGE, and still the toolset route. Two segments exactly, for the reason the
  // counters address above gives.
  if (head === 'toolset' && second !== undefined && parts.length === 2 && !editing) {
    const slug = idFrom(second)
    return slug === null ? { name: 'unknown', path } : { name: 'toolset', slug }
  }
  // The plan takes a period rather than an id, and the period is checked here rather than by the
  // page: "#/plan/next-week" is a typo, and sending a typo to a working page is how a broken link
  // survives for months. `parsePeriod` is the same reader the server uses, so the address and the
  // API cannot disagree about what a week is called.
  if (head === 'plan' && second !== undefined && parts.length === 2) {
    // Checked before `parsePeriod`, which knows nothing about the word and would call it a typo.
    if (second === TODAY_SEGMENT) return editing ? { name: 'plan', today: true, edit: true } : { name: 'plan', today: true }
    if (parsePeriod(second) === null) return { name: 'unknown', path }
    return editing ? { name: 'plan', period: second, edit: true } : { name: 'plan', period: second }
  }
  /**
   * ONE PARTICIPANT'S PAGE. THREE SEGMENTS EXACTLY, and the kind has to be one of the two.
   *
   * `#/who/agent/<id>/extra` lands on the not-found page for the reason the record address gives
   * above: sending a typo to a working page is how a broken link survives for months. A kind that is
   * neither `person` nor `agent` is a typo too — the registries are two and only two — so it is
   * refused here rather than handed to a page that would ask the server about a kind it has no
   * registry for.
   */
  /**
   * ONE SECRETARY'S NOTEBOOK, four segments exactly. Criteria N1 to N4.
   *
   * Before the three-segment case below, because both start `#/who/<kind>/<id>` and the longer one
   * has to be tried first or the last segment would be dropped and the reader would land on the
   * citizen page with nothing saying why.
   */
  if (
    head === PROFILE_SEGMENT &&
    second !== undefined &&
    parts.length === 4 &&
    parts[3] === NOTEBOOK_SEGMENT &&
    !editing
  ) {
    const third = parts[2]
    if (third === undefined || !isParticipantKind(second)) return { name: 'unknown', path }
    const id = idFrom(third)
    if (id === null) return { name: 'unknown', path }
    return { name: 'notebook', kind: second, id }
  }
  if (head === PROFILE_SEGMENT && second !== undefined && parts.length === 3 && !editing) {
    const third = parts[2]
    if (third === undefined || !isParticipantKind(second)) return { name: 'unknown', path }
    const id = idFrom(third)
    if (id === null) return { name: 'unknown', path }
    return { name: 'who', kind: second, id }
  }
  // A NEW ROLE CARD, criterion P51. Two segments exactly, for the reason the record address gives:
  // sending a typo to a working page is how a broken link survives for months.
  if (head === 'roles' && second === 'new' && parts.length === 2 && !editing) return { name: 'roleNew' }
  // The same card form edits an added office setting; the built-in cards have no editing address.
  if (head === 'roles' && second === 'added' && (parts.length === 3 || parts.length === 4) && !editing) {
    const addedRole = idFrom(parts[2]!)
    const action = parts[3]
    if (addedRole !== null && (action === undefined || action === 'history' || action === 'remove')) return { name: 'roleNew', addedRole, roleAction: action }
  }
  // WHO HOLDS EACH CARD, criterion P72. Two segments exactly, for the same reason.
  if (head === 'roles' && second === ROLE_CENSUS_SEGMENT && parts.length === 2 && !editing) {
    return { name: 'roleCensus' }
  }
  /**
   * ONE VISITING AGENT'S CREDENTIAL. TWO SEGMENTS EXACTLY, criteria P24 and P28.
   *
   * `idFrom` is what makes a truncated escape land on the not-found page rather than taking the
   * whole app down, which is the failure that function's own comment was written after.
   */
  // ONE PAGE OF A PLUGIN. Three segments exactly, for the reason the record address gives. A plugin page is never
  // edited, and the manifest refuses a page called "edit", so "#/plugin/<id>/edit" is a typo and not a page.
  if (head === PLUGIN_SEGMENT && second !== undefined && parts.length === 3 && !editing) {
    const id = idFrom(second)
    const slug = idFrom(parts[2] ?? '')
    return id === null || slug === null ? { name: 'unknown', path } : { name: 'plugin', id, slug }
  }
  if (head === VISITOR_SEGMENT && second !== undefined && parts.length === 2 && !editing) {
    const id = idFrom(second)
    return id === null ? { name: 'unknown', path } : { name: 'visitor', id }
  }
  // ONE INCIDENT'S SCENE, criterion I3. Two segments exactly, for the reason the pipeline address
  // above gives: sending a typo to a working page is how a broken link survives for months.
  if (head === INCIDENT_SEGMENT && second !== undefined && parts.length === 2 && !editing) {
    const id = idFrom(second)
    return id === null ? { name: 'unknown', path } : { name: 'incident', id }
  }
  // ONE SETTINGS PANEL, OPENED, and still the Settings page. Two segments exactly, and
  // only a panel's own word: "#/settings/nothing" is a typo, and it lands on the not-found page like any other.
  if (head === SETTINGS_SEGMENT && second !== undefined && parts.length === 2 && !editing) {
    const panel = settingsPanelFrom(second)
    return panel === null ? { name: 'unknown', path } : { name: 'settings', panel }
  }
  const flat = FLAT_ROUTES[head]
  // Only when the address is exactly that one segment. "#/records/extra" is a typo, and sending a
  // typo to a working page is how a broken link survives for months.
  if (flat !== undefined && parts.length === 1) {
    // THE CAST IS A TYPESCRIPT LIMIT, NOT A LOOSENED RULE. `flat` is a union of twenty-six names
    // and `{ name: flat }` is a real `Route`; TypeScript stops distributing a union-valued property
    // across a union of object types once the union passes twenty-five members, and it is the
    // flat route that crossed it. The value is built from `FLAT_ROUTES`, which is `FlatRoute['name']`
    // by its own type, so nothing outside the registry can reach this line.
    if (!editing) return { name: flat } as Route
    // Three pages have an editing address that carries no id: "#/plan/edit" is this week being written
    // in, and "#/gates/edit" and "#/sidebar-arrangement/edit" are those two pages' controls. Every other
    // flat address refuses the word rather than ignoring it.
    if (flat === 'plan' || flat === 'gates' || flat === 'sidebarArrangement') return { name: flat, edit: true }
    return { name: 'unknown', path }
  }
  // Checked AFTER the flat map, so that if a family key were ever also a page name the explicit
  // page would win — and the collision would show up as a family with no address rather than as a
  // page silently replaced. `tests/app-routes.test.ts` asserts there is no such collision.
  const family = parts.length === 1 && !editing && head !== undefined ? familyFrom(head) : null
  if (family !== null) return { name: 'family', family }
  return { name: 'unknown', path }
}
