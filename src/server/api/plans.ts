// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLANS: WRITING, BEFORE ANYTHING HAS AN HOUR ON IT.
 *
 * These routes take NO PROJECT, like the rest of the planning layer and for the same settled
 * reason: a plan spans projects, so it belongs to none of them. The one exception is filing a line
 * as work, which creates a record — and a record belongs to exactly one project, so that press says
 * which project in its own body.
 *
 * WRITING HERE MUTATES NOTHING CANONICAL. No record, no link, no change row. Three routes reach out
 * of the plan, and each is one person pressing one thing:
 *
 *   - Filing a line as work creates a record, and — when the plan says the line sits under work that
 *     already exists — one "part of" link to it, in the same transaction.
 *   - Pointing a line at work that already exists (PATCH on one line, with a `recordId`) creates
 *     nothing: it reads that record by its id and writes only the plan's own row.
 *   - Giving a line time writes one ordinary allocation.
 *
 * `src/server/lib/plans.ts` holds the rules and this file holds the addresses.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { PROJECTS_QUERY } from '@shared/across-projects.ts'
import { blocksOf, isPlanState, PLAN_STATES, type PlanState } from '@shared/plandoc.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { ALLOCATABLE_KINDS } from '../lib/planning.ts'
import {
  addLine,
  answersOnPlan,
  bindLineToWork,
  countClosedPlans,
  createPlan,
  deleteLine,
  deletePlan,
  fileLineAsWork,
  giveLineTime,
  linesWithWork,
  listPlans,
  markPlanRead,
  mustGetPlan,
  patchLine,
  patchPlan,
  planVersion,
  readLineRevisions,
  unbindLine,
  versionOfPlan,
  writeBody,
  writeLines,
} from '../lib/plans.ts'
import { PanelError } from '../lib/panel-error.ts'
import { theMessageReader } from '../lib/messages.ts'
import { route } from '../lib/route.ts'
import { theSecretarysName } from '../lib/the-persons-own-words.ts'

/**
 * The paragraph that describes the whole group, on the routes that only need that.
 *
 * The routes that do something this paragraph does not describe carry their own sentence, because
 * `GET /api` promises that every endpoint says what IT is for.
 */
/**
 * WHAT A LINE SAYS ABOUT ITSELF, said once, in the notes of every route that reads or writes lines.
 *
 * It is here rather than repeated because the syntax has exactly one reader — `src/shared/planline.ts`
 * — and a second description of it in prose would be the same fact written twice.
 */
const VALUES_NOTE =
  'A LINE MAY SAY HOW BIG IT IS, WHEN IT IS TO BE DONE, WHICH PROJECT IT IS IN AND WHAT TO REMEMBER ABOUT ' +
  'IT, in its own words, as a run of groups at the end of the line: ' +
  '`- Build the controller {size: 15h} {time: 15h this week} {project: greenhouse} {note: ask Sam}`. Only a ' +
  'run at the END of a line counts and only these four keys are read; curly brackets anywhere else are ' +
  'ordinary writing and are never touched, and a key Mole Office does not know is left alone rather than ' +
  'swallowed. NONE OF IT IS PROJECT TRUTH AND NONE OF IT ENTERS ARITHMETIC: a time written on a line ' +
  'nobody has filed as work adds nothing to that week, uses no capacity and counts as no work planned. ' +
  'FILING THE LINE AS WORK IS WHAT MOVES THEM — the size to the record\'s estimate, the project to the ' +
  'project the record is filed in, the time to an allocation — and a value that moves is taken out of the ' +
  'line\'s words and named in the reply. The note never moves: it has no other home, and being part of the ' +
  'words is what keeps it when the words are edited.'

/**
 * WHAT A LINE'S RECORD SAYS BACK, on the two routes that hand back lines.
 *
 * It is the other half of `VALUES_NOTE`: that one says filing MOVES a value out of the words, and
 * this one says every read hands it back so nothing disappears from the writing view when it moves.
 */
const DERIVED_NOTE =
  ' EVERY LINE ALSO CARRIES `derived`: the planning values that have been MOVED OFF it, read back ' +
  'from where filing put them. The size from the record\'s estimate, the hours from the time given to ' +
  'that record, the project from the project the record sits in, and any words that were kept ' +
  'without an interpretation. Each one names the record it was read from and says where the one ' +
  'stored copy is now. IT IS WORKED OUT ON EVERY READ AND NOTHING STORES IT — it is not written back ' +
  'into the line\'s text and it is not a column, because the same fact in two places is the defect ' +
  'this repository keeps finding. `canonical` false means words somebody wrote that nothing was made ' +
  'of: they are kept exactly as typed, they enter no total and they use no capacity. The invariant: ' +
  'the planning values a reader can reach from a line are exactly what is in its text plus what is in ' +
  '`derived`, so nothing about a plan is reachable from the table alone.'

/**
 * WHAT A FILED LINE SAYS ABOUT THE RECORD IT NAMES, AND WHAT IT MAY TAKE FROM IT.
 *
 * It is the other answer P2 asks of every read: the record's explanation is drawn BESIDE the line
 * and never written into it, and the record's own shorter form is there for somebody to press into
 * the line. Both are read from the record on every read and neither is stored on the line.
 */
const EXPLANATION_NOTE =
  ' EVERY LINE ALSO CARRIES `explanation` AND `shortForm`. `explanation` is the record\'s own ' +
  'conclusion where it has one and its own title where it has none: draw it BESIDE the line, never ' +
  'inside it, and never write it into the line. `shortForm` is the record\'s level-1 label where one ' +
  'is written and its title where none is, each naming which rung it came from; a line may take it ' +
  'into its own words when somebody presses for it, and it is never cut to fit. Both are null on a ' +
  'line that names no record, which is a line somebody writes by hand. NEITHER IS STORED ON THE LINE ' +
  'and neither enters any total.'

/**
 * WHAT EVERY LINE SAYS ABOUT TIME THAT MOLE OFFICE HAS NOT SCHEDULED, on the routes that hand back lines.
 *
 * It is the field a table draws in its time column, filed or not, and it is the answer to the
 * measured defect: the table read the line's own text for what it said about time, filing moved
 * that text into kept words, and the table then said nobody had given the work any time while the
 * same phrase was still on screen in Writing.
 *
 * IT OVERLAPS `derived` ON PURPOSE AND CANNOT DISAGREE WITH IT. The `time` entries there that say
 * `canonical: false` are built from this same list, in one place, so a surface may draw either.
 */
const KEPT_NOTE =
  ' EVERY LINE ALSO CARRIES `kept`: what somebody wrote about WHEN this line is to be done that ' +
  'Mole Office has not scheduled, in their own words. It is there BOTH BEFORE AND AFTER the line is ' +
  'filed or pointed at work, and it is the same list either way — filing moves where the words are ' +
  'stored and does not change what they say, so the two views of a plan cannot contradict each ' +
  'other about a phrase somebody typed once. Each entry carries `id` (send it to DELETE ' +
  '/api/planning/intents/<id> to take the words off the line), `said` (exactly as typed), `period`, ' +
  '`horizon` and `hours` (what Mole Office read, and null where it read nothing — never a guess), ' +
  '`reading` (one plain sentence saying what Mole Office made of the words, ready to draw), `recordId` ' +
  '(the work they are about, or null because the line names none yet) and `canScheduled` (true when ' +
  'committing them would work, so a screen offers that press only where it leads somewhere). NONE ' +
  'OF IT IS IN ANY TOTAL: these are words, not hours. ONE LINE HOLDS ONE ANSWER — writing time for ' +
  'a line replaces what it last said — but this is a LIST, because rows written before that rule ' +
  'exist and drawing one of two would hide the other for ever.'

const PLANS_NOTE =
  'PLANS ARE WRITING. A plan is a document a person writes — prose, headings, bullets, tick boxes and pipe ' +
  'tables — and NOTHING in it is project truth: nothing is parsed for meaning, nothing becomes a record ' +
  'because Mole Office read it, and writing here creates no record, no link and no change row. A plan holds ' +
  'LINES, and each line is stored exactly as typed, blank lines and trailing spaces included. A LINE ' +
  'ENDING IS NOT PART OF A LINE: a document is read into lines on the carriage return and newline, the ' +
  'newline alone, or the carriage return alone, and none of those characters is stored in any line. So a ' +
  'file written on Windows keeps its words and loses only its line endings, which is what lets the same ' +
  'document be opened and saved again without every line looking changed. THESE ROUTES TAKE NO PROJECT, ' +
  'because a plan spans projects — one week of thinking is greenhouse work and Mole Office work and a deadline. A ' +
  `plan is ${PLAN_STATES.join(', ')}: "done" means the writing did what it was for, "dropped" means it did ` +
  'not and nobody will finish it, and a closed plan leaves the list. Giving hours is a different act on a ' +
  'different surface: /api/planning is where a period, a capacity and an allocation live, and nothing here ' +
  'takes an hours figure. EVERY READ OF A PLAN HANDS BACK `version`, which names exactly what the plan holds: its title, its state and its lines. Send it back as `ifVersion` when you change the plan (PATCH /api/plans/<plan>) and a change built on a copy somebody has already replaced is refused with 409 rather than written over the newer work.'

const LINES_NOTE =
  'THE WHOLE DOCUMENT, WRITTEN AT ONCE: after this the plan holds exactly the lines sent, in the order ' +
  'sent. A line sent WITH its id is the line you already have and KEEPS the record it was filed as; a line ' +
  'sent with no id is a new line; a line that is not sent is deleted. ONE LINE IS ONE LINE: text holding a ' +
  'newline or a carriage return is REFUSED rather than split for you, because you asked to write one line ' +
  'and a stored line holds no line ending. PUT /api/plans/<plan>/body is what writes several lines from one ' +
  'piece of text. It is one transaction, so a save ' +
  'cannot half happen. A LINE THAT DID NOT CHANGE IS NOT RESTAMPED, because "written since you read this" ' +
  'is computed from those stamps and restamping everything would report the whole document as changed.' +
  ' ' + VALUES_NOTE +
  ' THE TWO ROUTES HERE THAT CARRY A BODY — writing the lines and adding one — TAKE `ifVersion`, and it is optional: send back the `version` a read handed you and a save built on a copy somebody has already replaced is REFUSED with 409 instead of written over the newer work. Leave it out and the write happens as it always did. There is no merge and no collaborative editor: Mole Office detects a stale write and refuses it. REMOVING ONE LINE TAKES NO VERSION: it names one line by its id, so it can remove no other line, and DELETE /api/plans/<plan>/lines/<line> says in full what removing it left behind.'

const BODY_NOTE =
  'THE WHOLE DOCUMENT AS ONE PIECE OF TEXT: this is what the writing page saves, because a plan is ' +
  'written in one text box. The text is read into lines and NOTHING ELSE IS DONE TO IT — no trimming, no ' +
  'reformatting, no dropping of blank lines — so every word, every trailing space and every blank line ' +
  'comes back exactly as it went in. THE LINE ENDINGS ARE THE ONE THING NOT STORED, because a line ending ' +
  'is not part of a line: a carriage return and newline, a newline alone and a carriage return alone all ' +
  'end a line and none of the three is kept in the words. `carriageReturns` in the reply says how many ' +
  'line endings were written with a carriage return, so this is never done without saying so. It is not a ' +
  'convenience: the writing box cannot produce a carriage return at all, so a stored one could never be ' +
  'saved back, and every line would look changed the first time anybody typed a character. THE STORED ' +
  'ROWS ARE MATCHED TO THE NEW TEXT BY THE EXACT CHARACTERS OF THEIR WORDS, as a longest common ' +
  'subsequence: a line whose words did not change keeps its row and the record it was filed as, wherever ' +
  'it moved to; a line that was not there before is a new row; a line that is gone is deleted. THE WORDS ' +
  'OF A LINE ARE THE LINE WITHOUT ITS TRAILING RUN OF {key: value} GROUPS, so typing a note or a size ' +
  'onto a line that is filed as work does NOT unbind it — the groups are fields the line carries, not ' +
  'what makes it the line it is. AND EDITING THE WORDS OF A LINE THAT IS FILED AS WORK DOES NOT UNBIND ' +
  'IT EITHER. Rewriting one line where one line stood — the two lines around it unchanged — keeps that ' +
  'row, so it keeps its work: editing prose is normal planning behaviour and must not cost you what you ' +
  'filed. THAT IS NOT A SIMILARITY MATCH AND NOTHING HERE COMPARES TWO LINES. It is the SHAPE of the ' +
  'save: exactly one line removed and exactly one added between the same two unchanged lines. WHERE MORE ' +
  'THAN ONE LINE CHANGED IN THE SAME PLACE Mole Office cannot say which is which — the lines could have been ' +
  'swapped, merged or split — so those bindings are dropped rather than guessed at, and ' +
  '`removedBindings` says which records they were. IT ALSO SAYS WHAT THAT COST AND HOW TO UNDO IT: ' +
  '`lost` names the estimate, the hours and the project this plan reached through that binding and ' +
  'cannot reach now — none of it deleted, all of it still on the work — and `putItBack` says the same ' +
  'thing in words, with the request that points a line at it again (PATCH /api/plans/<plan>/lines/<line> ' +
  'with a recordId). THE RECORDS THEMSELVES ARE NEVER TOUCHED. THE GROUPS ARE STORED AS SENT: this box is the ' +
  'document, so a note typed into it is stored and a note deleted from it is deleted. A line whose text ' +
  'did not change is not restamped, not even when it moved, because "written since you read this" counts ' +
  'those stamps; a line whose groups changed was written, so it is.' +
  ' ' + VALUES_NOTE +
  ' EVERY WRITE HERE TAKES `ifVersion`, and it is optional: send back the `version` a read handed you and a save built on a copy somebody has already replaced is REFUSED with 409 instead of written over the newer work. Leave it out and the write happens as it always did. There is no merge and no collaborative editor: Mole Office detects a stale write and refuses it.'

const REMOVE_LINE_NOTE =
  'REMOVE ONE LINE, AND BE TOLD WHAT THAT LEFT BEHIND. The line is gone from the document and NOTHING ' +
  'CANONICAL IS TOUCHED: a record the line was filed as is project truth and was never this plan\'s to ' +
  'remove, and hours given from the line are still given, because the hours were still given. THAT IS ' +
  'WHY THE REPLY SAYS SO MUCH. Leaving real work alive is right, and until it was said the person was ' +
  'left to discover for themselves that the work they had filed was no longer on any line of the plan. ' +
  '`removedBindings` names the work this line pointed at, what the plan can no longer reach through it — ' +
  'the estimate, the hours on every period, the project, none of it deleted — and how to point a line at ' +
  'it again. `keptWordsAdrift` carries what somebody wrote about time on the line, in their own words: ' +
  'not deleted either, and now attached to no line of this plan. `stillNamesIt` names the rows that still ' +
  'hold this line\'s id — the allocations it put hours on and the words about time written on it — ' +
  'because neither column is a foreign key and Mole Office will not quietly clear a column to tidy up after ' +
  'itself. IT TAKES NO VERSION: it names one line by its id, so it can remove no other line. THAT IS A ' +
  'WEAKER GUARANTEE THAN IT WAS. A line that is filed as work now KEEPS its id when its words are ' +
  'rewritten, so a removal built on a copy of the document somebody has already replaced removes the line ' +
  'that is there now, whatever it says. Read the plan again first if that matters.'

const LINE_REVISIONS_NOTE =
  "ONE LINE'S CHANGES, OLDEST FIRST, EACH WITH ITS REASON. Criterion P3: adding, reordering or dropping " +
  'a plan line keeps a revision with the reason the writer gave and the moment they gave it. Every entry ' +
  'carries `op` (`added`, `reordered` or `dropped`), `reason` in the writer\'s own words, `at` and ' +
  '`changedBy`. A LINE THAT PREDATES THE LEDGER reads back as an empty list with a sentence saying so, ' +
  'and nothing is invented for it. A line that was dropped keeps its reasons, which is why `line_id` is ' +
  'not a foreign key; a line id that never existed and has no reasons is a 404.'

const READ_NOTE =
  'WHAT WAS WRITTEN TO THIS PLAN SINCE YOU LAST READ IT, by somebody who is not you — which is how an ' +
  'agent writing to your plan at two in the morning is visible. IT CANNOT SAY WHICH LINES WERE ADDED AND ' +
  'WHICH WERE CHANGED and does not guess: a line stores when it was last written and by whom, and nothing ' +
  'stores when it first appeared. `neverRead` true means nobody has ever marked this plan as read, so ' +
  'there is nothing for "since" to mean — which is not the same as nothing having been written.'

const MARK_READ_NOTE =
  'SAY THAT YOU HAVE READ THIS PLAN, now. ONLY A PERSON MAY say they have read it: this answers 403 to an agent the ' +
  'person\'s grant does not carry, and 403 to a request that sends no actor headers, because an absent header is not ' +
  'evidence that a person read anything. "I have read this" is a claim about somebody\'s eyes and nobody else can make ' +
  'it. A SECRETARY MAY MARK IT FOR THE PERSON UNDER THEIR GRANT, where this office\'s list of what the grant carries ' +
  'lets the grant press `plan.mark-read`; the secretary card keeps that door for the person. The plan then stores ' +
  'the secretary and the grant, and `since-read` and the plan\'s page say which secretary marked it, so the mark is ' +
  'never shown as the person\'s reading. A person\'s own mark clears them. It is also ' +
  'the one write that HIDES something: it moves the moment GET /api/plans/<plan>/since-read counts from, ' +
  'so every line written before now stops being reported — including the lines the caller just wrote. An ' +
  'agent that wrote to a plan and then marked it read would erase the only sign its writing had arrived. ' +
  'It stores one moment on the plan and changes no line. There is ONE of these per plan and not one per ' +
  'reader, because the whole planning layer is one person\'s.'

const FILE_NOTE =
  'FILE ONE LINE AS WORK: this creates the record and binds the line to it IN ONE TRANSACTION, so a ' +
  'half-filed line cannot exist. THE LINE\'S WORDS SEED THE RECORD\'S TITLE ONCE and nothing derives one ' +
  'from the other afterwards — they are two facts, and where they later disagree both are true and both ' +
  'are shown. The kinds a line may be filed as are the kinds a plan can give time to: ' +
  `${ALLOCATABLE_KINDS.join(', ')}. \`workspaceId\` says which project the new record goes in, and it is ` +
  'required, because a record belongs to exactly one project and a plan belongs to none. A line that is ' +
  'already filed is refused rather than filed twice. WORK IN THAT PROJECT ALREADY CALLED THIS DOES NOT ' +
  'REFUSE THE FILING and is named in the reply as `alsoCalledThis`, so a screen can ask whether you meant ' +
  'that one and take no for an answer: ID is identity, a title is presentation, and titles may repeat. ' +
  'Point this line at the other record instead with PATCH /api/plans/<plan>/lines/<line> and a recordId. ' +
  'IT KEEPS THE PLACE THE PLAN GAVE IT: the plan is read ' +
  'as a tree from the headings and bullets already typed, and when the item this line is written under is ' +
  'ALREADY filed as work, one "part of" link is written from the new record to that one, in the same ' +
  'transaction. When that item is not filed, no link is written and NO PARENT IS INVENTED. `under` in the ' +
  'reply says what is above this line, whether a link was written, and when it was not, why. The item ' +
  'above must be in the same project, because a link cannot join two — that is refused before anything is ' +
  'written. IT ALSO LOOKS DOWN: work already filed on the items written DIRECTLY under this line is made ' +
  'part of the new record in the same transaction, because people file the detail before the heading as ' +
  'often as the other way round and until this existed nothing ever went back and joined the two — the ' +
  'plan looked nested and was flat to every total that adds up a tree. Items deeper than that are NOT ' +
  'adopted: the plan says a grandchild is part of its own parent, and filing that parent adopts it in ' +
  'turn. `adopted` in the reply names every item under this line that is already work, with the link that ' +
  'made it part of this one or the reason there is none, and names an item that is not filed but has ' +
  'filed work under it, because that work stays outside this record until it is filed too. A child that ' +
  'cannot be adopted does NOT undo the filing. ' + VALUES_NOTE +
  ' `promoted` in the reply names every planning value the line was carrying, whether it moved, where it ' +
  'went and, when it did not move, why. A value that CANNOT move stays in the line and the filing still ' +
  'happens: a direction and a problem have no estimate at all, so a size on one of those stays where it ' +
  'is and is still planning intent. `whatLeftTheLine` is the same thing in ONE SENTENCE, naming each ' +
  'value that left the words and where it is now — "the estimate", "hours in the schedule", "kept as you ' +
  'wrote it" — and it is null when nothing left them. IT IS THERE BECAUSE FILING TAKES OUT OF THE WRITING ' +
  'EXACTLY THE VALUES MOLE OFFICE COULD READ: a size it cannot turn into hours stays, one it can is taken, and ' +
  'to the person editing the text that difference looks arbitrary unless somebody says it. Show it where ' +
  'the words were, not below the fold. ' +
  'THE REPLY SAYS WHAT HAPPENED TWICE, AT TWO LENGTHS. `note` is what a person reads: one or two plain ' +
  'sentences, no record ids, nothing about how any of it is stored. `detail` is the whole account — every ' +
  'id, every link, every value and where it went — for a developer view and for an agent. Both are built ' +
  'from the same fields of this one reply, so they cannot come to disagree. ' +
  'WORDS THE LINE WAS ALREADY HOLDING ABOUT TIME ARE NOT WRITTEN AGAIN. Filing attaches them to the new ' +
  'record instead of making a second copy, so one phrase typed once stays one row; `kept` in the reply is ' +
  'what the line says about time now and `keptReplaced` names anything this filing took off it.'

const POINT_AT_WORK =
  'POINT THIS LINE AT WORK THAT ALREADY EXISTS: send `recordId`. Nothing is created, no record is changed, ' +
  'and no link is written — the record already sits where somebody put it. This is how a plan names ' +
  'canonical work instead of always making new work, and it is how a binding is put back when a save ' +
  'could not follow which line was which. SEND `recordId` AS NULL TO TAKE THE WORK OFF THE LINE. The line ' +
  'stays, with its own words; the record stays, with everything it holds; and what the plan can no longer ' +
  'reach through this line is named in the reply, in the same shape a save and a removal use. Until 17 ' +
  'August 2026 there was no way to do this at all and the only way out was to delete the line. The record ' +
  'has to exist, must not be deleted, ' +
  `and must be work a plan can give time to: ${ALLOCATABLE_KINDS.join(', ')}. IF THE LINE ALREADY POINTS ` +
  'AT SOMETHING it is refused, naming what; send that id back as `replacing` to say you meant to drop it. ' +
  '`replacing` that does not match what the line points at is refused too, because then you were looking ' +
  'at a different line from the one Mole Office has. WORDS THE LINE HOLDS ABOUT TIME GO WITH IT: somebody ' +
  'writes "next week" against a line and then says which work the line means, so from then on those words ' +
  'are about that work — otherwise they would point at nothing and committing them would be refused for ' +
  'ever. `kept` in the reply is what the line says about time now. Nothing anybody wrote is changed; the ' +
  'only thing written is which piece of work the words are about.'

const LINE_PATCH_NOTE =
  'CHANGE ONE LINE. Two different writes live here and a request does one of them. Send `text` or `remark` ' +
  'to change the writing: stored exactly as typed, and the record the line names is not touched, because ' +
  `the words and the title are two facts. THE NOTE IS PART OF THE WORDS: sending \`remark\` writes it into ` +
  'the line as a {note: …} group, which is what keeps it when the words are edited, and the reply says what ' +
  `the line reads now. ${POINT_AT_WORK} A request sending both the words and a ` +
  'recordId is refused rather than done in two steps, so that nothing can half happen.' +
  ' EVERY WRITE HERE TAKES `ifVersion`, and it is optional: send back the `version` a read handed you and a save built on a copy somebody has already replaced is REFUSED with 409 instead of written over the newer work. Leave it out and the write happens as it always did. There is no merge and no collaborative editor: Mole Office detects a stale write and refuses it.'

const TIME_NOTE =
  'GIVE ONE LINE TIME: this writes ONE ORDINARY ALLOCATION, through the same rules every other surface ' +
  'uses — the period key has to parse, the kind has to be one a plan can give time to, and one piece of ' +
  'work has at most one allocation per period. The allocation records which line it came from. The line ' +
  'must be filed as work first: hours name a record, and a line that is only words names nothing. ' +
  'PATCH /api/planning/allocations/<id> is where the hours are changed or the slice is completed.'

/**
 * TWO ROUTES IN THIS GROUP DO SOMETHING `PLANS_NOTE` DOES NOT DESCRIBE, so they carry their own
 * sentence. `GET /api` promises that every endpoint says what IT is for and what ITS reply carries,
 * and a paragraph about writing answers that for `PUT /api/plans/:id/body` and for nothing else.
 */
const CONTEXT_NOTE =
  'THE FACTS AN AGENT NEEDS TO REVIEW ONE PLAN, and no review. The reply separates what is STORED ' +
  '(`facts` — the document as written line by line, the work its lines already point at with the state, ' +
  'size and hours of each, and what the projects it names hold besides) from what was WORKED OUT here ' +
  '(`calculated` — the plan\'s tree, read out of the headings and bullets already typed, and counts that ' +
  'each say what they could not count). IT CHANGES NOTHING. `ask` is the words to hand an agent, written ' +
  'by the server so that what Mole Office tells an agent to file and what Mole Office looks for cannot come apart. ' +
  'By default the only projects read are the ones this plan already names, through the records its lines ' +
  'point at; ?projects=<id>,<id> asks for more by name, and a project nobody has is refused rather than ' +
  'read as empty. An agent forms an opinion from this and files it as a proposal; a person settles it.'

const REVIEWS_NOTE =
  'WHAT AN AGENT HAS ADVISED ABOUT THIS PLAN: every proposal naming it, from every project, newest first, ' +
  'each with the change set it carries, what that change set would do, and whether a person has settled ' +
  'the fork yet. A PROPOSAL NAMES A PLAN THROUGH `data.extra.plan`, which is the plan\'s id — a plan is ' +
  'not a record, so no link row can join the two. NONE OF THIS HAS CHANGED ANYTHING and reading it changes ' +
  'nothing either: advice becomes a change to the project only when a person settles the fork ' +
  '(POST /api/records/<proposal>/promote) and then applies the change set ' +
  '(POST /api/planning/proposals/<proposal>/apply), and both of those answer 403 to an agent. An empty ' +
  'list means nobody has filed advice, which is NOT a review saying the plan is fine.'

const BLOCKS_NOTE =
  'THE PLAN READ FOR DISPLAY: its lines turned into headings, bullets, tick boxes, paragraphs and tables, ' +
  'with the record each filed line names beside it. NOTHING IS PARSED FOR MEANING — this decides how a ' +
  'line is DRAWN and nothing else. Anything Mole Office cannot read comes back as `notUnderstood` carrying the ' +
  'lines exactly as typed and a sentence saying why, so a table with rows that disagree is printed rather ' +
  'than guessed at. Every line comes back in exactly one block, in order, unchanged.'

const planState = z.enum(PLAN_STATES)

/**
 * THE TOKEN SAYING WHICH VERSION OF THE PLAN THIS WRITE WAS BUILT ON. Optional, on every route that
 * changes the document.
 *
 * ---------------------------------------------------------------------------------------
 * THE SCHEMAS WERE RELAXED DELIBERATELY TO LET IT THROUGH
 * ---------------------------------------------------------------------------------------
 *
 * Every write body in this file is a `z.strictObject`, which refuses a key it does not declare. So
 * before this key was declared, a caller doing the safe thing — sending back the version its read
 * handed it — was answered `400: unrecognised key "ifVersion"`, and the only way to be allowed to
 * save was to drop the one field that makes a save safe.
 *
 * THE OBJECTS ARE STILL STRICT. The relaxation is this key and nothing else, so `ifVerison` is
 * still refused rather than ignored — a mistyped precondition that is quietly dropped is worse than
 * none, because the caller believes it is protected.
 */
const ifVersion = z
  .string({ error: 'ifVersion must be the version string a read or a write handed back' })
  .trim()
  .min(1, { error: 'ifVersion must not be empty — leave the key out if you do not want the check' })
  .optional()

/** The keys of a write body that are the request rather than the document. See `ifVersion`. */
const NOT_A_CHANGE = new Set(['ifVersion'])

/** How many things a body actually asks to change, so `ifVersion` never counts as one of them. */
function asks(body: Record<string, unknown>): number {
  return Object.keys(body).filter((key) => !NOT_A_CHANGE.has(key)).length
}

const newPlan = z.strictObject({
  title: z.string({ error: 'title is required: one line saying what this plan is about' }).min(1),
  /** A whole document may arrive at once, and it is split on the newline and nothing else. */
  body: z.string().optional(),
})

const planPatch = z
  .strictObject({ title: z.string().optional(), state: planState.optional(), ifVersion })
  .refine((v) => asks(v) > 0, { error: 'Send a title or a state to change.' })

const lineInput = z.strictObject({
  /** Present when this is a line the plan already has. Absent means a new line. */
  id: z.string().min(1).optional(),
  text: z.string(),
  remark: z.string().nullable().optional(),
})

const linesBody = z.strictObject({
  lines: z.array(lineInput),
  ifVersion,
  /**
   * WHY THIS WHOLE-DOCUMENT WRITE CHANGED THE LINES.
   *
   * Required when it adds, reorders or drops a line, refused in the library in one sentence when it
   * is missing; not required when it only edits the words of a line that stays where it is, because
   * P3 names three acts and a text edit is not one of them. `reason` here and on the three
   * single-line doors are the same fact, kept in `plan_line_revisions`.
   */
  reason: z.string().optional(),
})

/** The whole document, as the one string the writing box holds. */
const documentBody = z.strictObject({ body: z.string(), ifVersion })

const newLine = z.strictObject({
  text: z.string(),
  remark: z.string().nullable().optional(),
  /** The line this one goes after. Left out, it goes at the end. */
  afterLineId: z.string().min(1).optional(),
  /**
   * WHY THIS LINE IS BEING ADDED. Required, and refused in one sentence without it: P3 says a sudden
   * task is a line added with its reason. Optional in the schema so the refusal is the office's own
   * sentence rather than a zod message about a field.
   */
  reason: z.string().optional(),
  ifVersion,
})

/**
 * THE BODY A LINE'S REMOVAL CARRIES: just the reason it is being dropped. Optional in the schema for
 * the same reason as `newLine.reason`; the library is where the refusal is spoken.
 */
const removeLine = z.strictObject({ reason: z.string().optional() })

const linePatch = z
  .strictObject({
    text: z.string().optional(),
    remark: z.string().nullable().optional(),
    /**
     * The record this line is to point at. It has to exist already; nothing here creates one.
     *
     * NULL TAKES THE WORK OFF THE LINE AND LEAVES BOTH ALIVE. It was `min(1)` and not nullable until
     * 17 August 2026, so a line could be pointed somewhere else and never unpointed: the only way to
     * undo a binding was to delete the line, which is why the owner met the collision they did. A
     * person may withdraw a claim they made.
     */
    recordId: z.string().min(1).nullable().optional(),
    /**
     * The record this line points at NOW, sent back to say that dropping it is meant.
     *
     * Not `replace: true`. A boolean proves somebody pressed something; naming the record proves
     * they were looking at the same line Mole Office has.
     */
    replacing: z.string().min(1).optional(),
    ifVersion,
  })
  .refine((v) => asks(v) > 0, {
    error:
      'Send text or a remark to change, a recordId for this line to point at, or {"recordId": null} to take ' +
      'the work off it.',
  })
  .refine((v) => v.recordId === undefined || (v.text === undefined && v.remark === undefined), {
    error:
      'Send either new words for this line or the record it points at, not both in one request. They are ' +
      'two different writes and one request doing both could half happen.',
  })
  .refine((v) => v.replacing === undefined || (v.recordId !== undefined && v.recordId !== null), {
    error:
      '`replacing` says which record this line points at now, so it only means something beside the ' +
      '`recordId` you want it to point at instead. To take the work off this line and point it at nothing, ' +
      'send {"recordId": null} on its own.',
  })

const fileAsWork = z.strictObject({
  kind: z.string({ error: `kind is required: one of ${ALLOCATABLE_KINDS.join(', ')}` }).min(1),
  workspaceId: z.string({ error: 'workspaceId is required: which project the new record goes in' }).min(1),
  summary: z.string().nullable().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
})

const giveTime = z.strictObject({
  horizon: z.string({ error: 'horizon is required: month, week or day' }).min(1),
  period: z.string({ error: 'period is required: 2026-09, 2026-W36 or 2026-09-07' }).min(1),
  plannedHours: z.number().nullable().optional(),
  note: z.string().nullable().optional(),
})

const planId = z.strictObject({ id: z.string().min(1) })
const planAndLine = z.strictObject({ id: z.string().min(1), lineId: z.string().min(1) })

/**
 * WHAT THE READER IS TOLD WHEN A DOCUMENT ARRIVED WITH WINDOWS LINE ENDINGS, in both places a whole
 * document is stored.
 *
 * IT IS WHY THIS IS NOT A SILENT CHANGE. `linesOfDocument` in lib/plans.ts stores a line's words and
 * not the characters that ended the line, and the reader hears about it in the same reply. Nothing
 * else about the text moves: no word, no trailing space and no blank line.
 *
 * Empty when the document had none, because a sentence about carriage returns in a document with no
 * carriage returns is noise on every ordinary save.
 */
/**
 * WHAT SOMEBODY WROTE ABOUT TIME ON A LINE THAT IS NO LONGER IN THE PLAN. Empty when there is none.
 *
 * Saving a document without a line, removing one line and deleting a whole plan all leave the same
 * words attached to nothing, so all three say it in this one sentence. Nothing was deleted; what
 * changed is where the words can be seen.
 */
function saidAboutTime(adrift: readonly { said: string }[]): string {
  if (adrift.length === 0) return ''
  return (
    ` ${adrift.map((one) => `"${one.said}"`).join(', ')} ` +
    `${adrift.length === 1 ? 'was written' : 'were written'} about time on ` +
    `${adrift.length === 1 ? 'a line that is' : 'lines that are'} no longer in this plan. Nothing was ` +
    'deleted: the words are still on the schedule, under what you wrote about time, and they ' +
    'are still in no total.'
  )
}

/**
 * ROWS THAT STILL NAME A LINE THAT HAS GONE. Empty when nothing does.
 *
 * Two columns hold a plan line's id and neither is a foreign key: `allocations.from_plan_line` and
 * `planning_intents.plan_line_id`. Removing the line leaves both pointing at a row that is not
 * there. Mole Office does not repair them — the hours were still given and the words were still written —
 * so it says so instead, which is the difference between a known state and a surprise.
 *
 * THIS SENTENCE IS ABOUT THE HOURS ONLY. The words are said by `saidAboutTime` beside it, and
 * saying them twice in one reply is how a reply stops being read. `stillNamesIt` in the reply
 * carries both lists in full, including words that have already become hours.
 */
function stillNamesTheLine(still: { allocations: readonly { period: string }[] }): string {
  const hours = still.allocations
  if (hours.length === 0) return ''
  return (
    ` ${hours.length} allocation${hours.length === 1 ? '' : 's'} — ` +
    `${hours.map((one) => one.period).join(', ')} — ${hours.length === 1 ? 'was' : 'were'} given from ` +
    `${hours.length === 1 ? 'that line' : 'those lines'}. The hours are still given and nothing about them ` +
    'changed. They still record the line they came from, and that line is gone, so a reader of where the ' +
    'hours came from finds nothing rather than a wrong answer. `stillNamesIt` in this reply names every one.'
  )
}

function endingsRead(carriageReturns: number): string {
  if (carriageReturns === 0) return ''
  return (
    ` ${carriageReturns} line ending${carriageReturns === 1 ? ' was' : 's were'} written with a carriage ` +
    'return, which is how a file written on Windows arrives. The carriage returns are not stored, because ' +
    'they end the lines rather than belong to them. Every word, every trailing space and every blank line ' +
    'is exactly as it was sent.'
  )
}

export async function planRoutes(app: FastifyInstance): Promise<void> {
  app.get('/plans', route('plan.read', 'remote', PLANS_NOTE), async (req) => {
    const query = parse(
      z.strictObject({ state: z.string().optional() }),
      req.query,
      'That is not a way to ask for plans:',
    )
    let state: PlanState | undefined
    if (query.state !== undefined && query.state !== 'every') {
      if (!isPlanState(query.state)) {
        throw new PanelError(
          `A plan is one of: ${PLAN_STATES.join(', ')}. Ask for ?state=every to get all of them. ` +
            `You asked for "${query.state}".`,
        )
      }
      state = query.state
    }
    const plans = listPlans(state === undefined ? {} : { state })
    const closed = countClosedPlans()
    return {
      plans,
      closed,
      note:
        plans.length === 0
          ? 'Nothing is written yet. A plan is a document you write before anything has a date or an hour on ' +
            'it, and writing one changes no record.'
          : `${plans.length} plan${plans.length === 1 ? '' : 's'}, most recently written in first. ` +
            `${closed} of the plans on file ${closed === 1 ? 'is' : 'are'} closed. None of this is project ` +
            'truth: a line becomes a record only when somebody files it as work.',
    }
  })

  app.post('/plans', route('plan.write', 'remote', PLANS_NOTE), async (req, reply) => {
    const body = parse(newPlan, req.body, 'That is not a plan Mole Office can store:')
    const written = createPlan(body, actorFrom(req))
    reply.code(201)
    return {
      ...written,
      note:
        `The plan is stored with ${written.lines.length} line${written.lines.length === 1 ? '' : 's'}, each ` +
        'exactly as typed. No record was created and nothing canonical changed.' +
        endingsRead(written.carriageReturns),
    }
  })

  app.get('/plans/:id', route('plan.read', 'remote', PLANS_NOTE + DERIVED_NOTE + KEPT_NOTE + EXPLANATION_NOTE), async (req) => {
    const { id } = parse(planId, req.params, 'That is not a plan id:')
    const plan = mustGetPlan(id)
    const lines = linesWithWork(id)
    const filed = lines.filter((line) => line.line.recordId !== null).length
    const moved = lines.reduce((count, line) => count + line.derived.length, 0)
    return {
      plan,
      version: versionOfPlan(plan, lines.map((one) => one.line)),
      lines,
      note:
        `${lines.length} line${lines.length === 1 ? '' : 's'}, in the order they are written; ${filed} of ` +
        'them have been filed as work. Each line carries the record it names, if it names one, WITH THAT ' +
        "RECORD'S LIVE TITLE — which may differ from the line's own words, because filing seeded the title " +
        'once and nothing has kept them equal since. Show both; Mole Office will not repair either.' +
        ' A FILED LINE ALSO CARRIES `explanation` — that record\'s own conclusion, or its title where it ' +
        'has no conclusion — to be drawn BESIDE the line and never written into it, and `shortForm`, the ' +
        'label or title the line may take into its own words when somebody presses for it.' +
        ` ${moved} planning value${moved === 1 ? '' : 's'} across these lines ${moved === 1 ? 'is' : 'are'} ` +
        'in `derived`: moved out of the words when the line was filed, read back here from where it went, ' +
        'and stored nowhere else. Show those beside the line rather than in it.' +
        ' `version` names what this plan holds now: send it back as `ifVersion` on a write and a save ' +
        'built on an older copy is refused rather than written over the newer one.',
    }
  })

  app.get('/plans/:id/blocks', route('plan.read', 'remote', BLOCKS_NOTE + DERIVED_NOTE + KEPT_NOTE + EXPLANATION_NOTE), async (req) => {
    const { id } = parse(planId, req.params, 'That is not a plan id:')
    const plan = mustGetPlan(id)
    const lines = linesWithWork(id)
    const answers = answersOnPlan(lines)
    const blocks = blocksOf(lines.map(({ line }) => ({ id: line.id, text: line.text })))
    const unread = blocks.filter((block) => block.kind === 'notUnderstood').length
    return {
      plan,
      version: versionOfPlan(plan, lines.map((one) => one.line)),
      blocks,
      lines,
      answers,
      note:
        `${blocks.length} block${blocks.length === 1 ? '' : 's'} over ${lines.length} line` +
        `${lines.length === 1 ? '' : 's'}` +
        (unread === 0
          ? '. Every line was read.'
          : `, and ${unread} of them Mole Office could not read. Those carry their lines exactly as typed and a ` +
            'sentence saying why: print them, do not guess at them.') +
        ' `answers` carries every `realises` or `instead_of` answer on the work this plan’s lines name, with the ' +
        'planned state’s title, the moment the answer was written and who wrote it. Work no line of this plan ' +
        'names is not read.',
    }
  })

  /**
   * EVERYTHING AN AGENT NEEDS TO REVIEW THIS PLAN, in one request. It changes nothing.
   *
   * The third step of the owner's loop is an agent reviewing the owner's writing, and Mole Office does not
   * call a language model — the agent is outside. So the product's part is to hand over the facts
   * an honest review needs, already separated into the two things a reader must never confuse, and
   * to take the answer back as a proposal a person settles. `src/server/lib/planreview.ts` holds
   * the reading, the decision about which store for rough thinking wins, and the words handed over.
   *
   * NO WORKSPACE HEADER, like every other route in this group and for the same settled reason: a
   * plan spans projects, so it belongs to none. Which projects get read is answered from the plan's
   * own bindings and from what the caller asks for by name, and every row says which project owns it.
   */
  app.get('/plans/:id/context', route('plan.read', 'remote', CONTEXT_NOTE), async (req) => {
    const { id } = parse(planId, req.params, 'That is not a plan id:')
    const query = parse(
      z.strictObject({ [PROJECTS_QUERY]: z.string().optional() }),
      req.query,
      'That is not a way to ask for a plan\'s context:',
    )
    // `?projects=<id>,<id>`: projects to read besides the plan's own, under the one query word (src/shared/across-projects.ts).
    const named = query[PROJECTS_QUERY]
    const projects =
      named === undefined
        ? []
        : named
            .split(',')
            .map((one) => one.trim())
            .filter((one) => one !== '')
    // WHERE MOLE OFFICE ANSWERED THIS REQUEST, so the words handed to an agent name an address that was
    // just reached rather than one this file guessed at. A request with no host header gets the
    // path on its own and a sentence saying the host is not known from here — see `askForReview`.
    const host = req.headers.host
    const origin = typeof host === 'string' && host !== '' ? `${req.protocol}://${host}` : null
    const { readPlanContext } = await import('../lib/planreview.ts')
    return readPlanContext(id, { projects, origin })
  })

  /**
   * WHAT AN AGENT HAS ADVISED ABOUT THIS PLAN. It changes nothing, and neither does anything in it.
   *
   * Separate from the context route on purpose. That one is the facts going out and promises "no
   * critique"; folding the critiques into it would break that promise on the first line of the
   * reply. This one is the advice coming back.
   */
  app.get('/plans/:id/reviews', route('plan.read', 'remote', REVIEWS_NOTE), async (req) => {
    const { id } = parse(planId, req.params, 'That is not a plan id:')
    const { readPlanReviews } = await import('../lib/planreview.ts')
    return readPlanReviews(id)
  })

  app.get('/plans/:id/since-read', route('plan.read', 'remote', READ_NOTE), async (req) => {
    const { id } = parse(planId, req.params, 'That is not a plan id:')
    const { writtenSinceRead } = await import('../lib/plans.ts')
    const since = writtenSinceRead(id, actorFrom(req))
    return {
      ...since,
      note: since.neverRead
        ? 'Nobody has marked this plan as read, so nothing can be said about what changed since. That is ' +
          'not the same as nothing having changed.'
        : `${since.written.length} line${since.written.length === 1 ? '' : 's'} written since ` +
          (since.markedUnderTheGrant === null
            ? 'you read this'
            : `the secretary "${since.markedUnderTheGrant.secretary}" marked this plan as read under the person's grant`) +
          `${since.writtenBy.length === 0 ? '' : `, by ${since.writtenBy.join(', ')}`}. Mole Office cannot say ` +
          'which of them were added and which were changed, because nothing stores when a line first appeared.',
    }
  })

  app.patch('/plans/:id', route('plan.write', 'remote', PLANS_NOTE), async (req) => {
    const { id } = parse(planId, req.params, 'That is not a plan id:')
    const patch = parse(planPatch, req.body, 'That is not a change Mole Office can make to a plan:')
    const plan = patchPlan(id, patch, actorFrom(req), patch.ifVersion)
    return {
      plan,
      version: planVersion(id),
      note:
        plan.state === 'open'
          ? 'Stored. No line was touched and nothing canonical changed.'
          : `This plan is ${plan.state}, so it leaves the list of plans being written. Its lines are still ` +
            'here and the records they were filed as are untouched.',
    }
  })

  app.post('/plans/:id/read', route('plan.mark-read', 'remote', MARK_READ_NOTE), async (req) => {
    const { id } = parse(planId, req.params, 'That is not a plan id:')
    const plan = markPlanRead(id, actorFrom(req))
    return {
      plan,
      note:
        plan.readByAgent === null
          ? `Marked as read at ${plan.readAt}. No line was changed.`
          : `Marked as read at ${plan.readAt} for the person, under their grant ${plan.readUnderGrant}, by the ` +
            `secretary "${theSecretarysName({ id: plan.readByAgent })}". The plan's page says which secretary marked ` +
            'it. No line was changed.',
    }
  })

  app.delete('/plans/:id', route('plan.write', 'remote', PLANS_NOTE), async (req) => {
    const { id } = parse(planId, req.params, 'That is not a plan id:')
    const gone = deletePlan(id)
    const filed = gone.removedBindings
    return {
      ...gone,
      note:
        `The plan and its ${gone.lines} line${gone.lines === 1 ? '' : 's'} are gone. NOTHING CANONICAL WAS ` +
        'TOUCHED: records that lines were filed as are still there, and hours that came from those lines ' +
        'are still given.' +
        // WHICH WORK IS NOW NAMED BY NOTHING, three of them in words and a count for the rest, for
        // the reason the body route gives: a dozen paragraphs is a receipt nobody reads, and every
        // one of them is in `removedBindings` in full.
        (filed.length === 0
          ? ' No line of it was filed as work.'
          : ` ${filed.length} of its lines ${filed.length === 1 ? 'was' : 'were'} filed as work.` +
            filed.slice(0, 3).map((one) => ` ${one.putItBack}`).join('') +
            (filed.length <= 3
              ? ''
              : ` ${filed.length - 3} more of them pointed at work. Every one is in \`removedBindings\`.`)) +
        saidAboutTime(gone.keptWordsAdrift) +
        stillNamesTheLine(gone.stillNamesIt),
    }
  })

  app.put('/plans/:id/lines', route('plan.write', 'remote', LINES_NOTE), async (req) => {
    const { id } = parse(planId, req.params, 'That is not a plan id:')
    const body = parse(linesBody, req.body, 'That is not a document Mole Office can store:')
    const lines = writeLines(id, body.lines, actorFrom(req), body.ifVersion, body.reason)
    return {
      lines,
      version: planVersion(id),
      note:
        `The plan now holds ${lines.length} line${lines.length === 1 ? '' : 's'}, exactly as sent. Nothing ` +
        'was parsed and no record was created or changed.',
    }
  })

  app.put('/plans/:id/body', route('plan.write', 'remote', BODY_NOTE), async (req) => {
    const { id } = parse(planId, req.params, 'That is not a plan id:')
    const sent = parse(documentBody, req.body, 'That is not a document Mole Office can store:')
    const written = writeBody(id, sent.body, actorFrom(req), sent.ifVersion)
    const lost = written.removedBindings
    // WORDS ABOUT TIME THAT WERE WRITTEN ON A LINE THIS SAVE REMOVED. Nothing was deleted, and the
    // one thing the writer cannot see for themselves is that those words are no longer attached to
    // anything in this plan. The same sentence the two removal routes use, from one place.
    const wordsAdrift = saidAboutTime(written.keptWordsAdrift)
    return {
      ...written,
      version: planVersion(id),
      note:
        `The plan now holds ${written.lines.length} line${written.lines.length === 1 ? '' : 's'}, exactly as ` +
        `sent. ${written.kept} kept the row they already had, ${written.added} ` +
        `${written.added === 1 ? 'is new' : 'are new'} and ${written.removed} ` +
        `${written.removed === 1 ? 'was' : 'were'} removed.` +
        // WHAT EACH LOST BINDING COST AND HOW TO PUT IT BACK. The sentence per record is the
        // server's own `putItBack`, so the note and the field cannot come to say different things,
        // and it names the values that left the plan's reach — an estimate and the hours on a
        // period are what a reader watches fall out of the plan's total with nothing said.
        (lost.length === 0
          ? ' No line that was filed as work was removed.'
          : ` ${lost.length} of the removed lines ${lost.length === 1 ? 'was' : 'were'} filed as work. ` +
            'THOSE RECORDS STILL EXIST and nothing about them was changed.' +
            // THREE OF THEM IN WORDS, AND A COUNT FOR THE REST. Emptying a plan can drop a dozen
            // bindings, and a dozen paragraphs is a receipt nobody reads — which is how the loss
            // became invisible in the first place. `removedBindings` carries every one of them in
            // full, so nothing is dropped here; what is capped is only how much of it is prose.
            // `refuseStaleWrite` in lib/plans.ts shows three and counts the rest for this reason.
            lost.slice(0, 3).map((one) => ` ${one.putItBack}`).join('') +
            (lost.length <= 3
              ? ''
              : ` ${lost.length - 3} more removed line${lost.length - 3 === 1 ? '' : 's'} pointed at ` +
                'work. Every one is in `removedBindings`, with what it lost and how to put it back.')) +
        wordsAdrift +
        endingsRead(written.carriageReturns),
    }
  })

  app.post('/plans/:id/lines', route('plan.write', 'remote', LINES_NOTE), async (req, reply) => {
    const { id } = parse(planId, req.params, 'That is not a plan id:')
    const body = parse(newLine, req.body, 'That is not a line Mole Office can store:')
    const line = addLine(id, body, actorFrom(req), body.ifVersion)
    reply.code(201)
    return {
      line,
      version: planVersion(id),
      note:
        line.remark === null
          ? 'Stored exactly as typed. Nothing canonical changed.'
          : 'Stored. The note is in the line\'s own words, which is what keeps it when the words are edited. ' +
            'Nothing canonical changed.',
    }
  })

  app.patch('/plans/:id/lines/:lineId', route('plan.write', 'remote', LINE_PATCH_NOTE), async (req) => {
    const { id, lineId } = parse(planAndLine, req.params, 'That is not a line of a plan:')
    const patch = parse(linePatch, req.body, 'That is not a change Mole Office can make to a line:')

    if (patch.recordId === null) {
      const done = unbindLine(id, lineId, actorFrom(req), patch.ifVersion)
      // WHAT THE PLAN CAN NO LONGER REACH THROUGH THIS LINE, in the server's own sentence — the same
      // one a save and a removal answer with, so that taking work off a line means one thing however
      // it was done.
      const words =
        done.kept.length === 0
          ? ''
          : ` What you wrote about time on this line — ${done.kept.map((one) => `"${one.said}"`).join(', ')} — is ` +
            'still there and is still about that work. Nothing rewrote it, because taking the record off the ' +
            'line is not a statement that those words were about something else. DELETE ' +
            '/api/planning/intents/<id> takes a phrase off the line.'
      return {
        ...done,
        version: planVersion(id),
        note:
          `This line points at nothing now. ${done.removed.putItBack} The line keeps its own words and the ` +
          'record keeps everything it holds — nothing was deleted and nothing about the work was changed.' +
          words,
      }
    }

    if (patch.recordId !== undefined) {
      const point =
        patch.replacing === undefined
          ? { recordId: patch.recordId }
          : { recordId: patch.recordId, replacing: patch.replacing }
      const bound = bindLineToWork(id, lineId, point, actorFrom(req), patch.ifVersion)
      // Read off the two facts the answer already carries rather than stored beside them, so the
      // sentence cannot say "stored" for a write that did not happen.
      const already = bound.was === bound.work.id
      return {
        ...bound,
        version: planVersion(id),
        note: already
          ? `This line already pointed at ${bound.work.id} ("${bound.work.title}"), so NOTHING WAS WRITTEN. ` +
            'The line was not restamped either, because nothing about it changed.'
          : `This line now points at ${bound.work.id} ("${bound.work.title}"), in the project ` +
            `"${bound.work.workspaceId}". ` +
            (bound.was === null
              ? ''
              : `It pointed at ${bound.was} before, and that record still exists and was not changed. `) +
            'Nothing was created and nothing about the work was touched. The line keeps its own words: what ' +
            'you wrote and what the record is called are two facts, and Mole Office shows the difference rather ' +
            'than repairing it.',
      }
    }

    const line = patchLine(id, lineId, patch, actorFrom(req), patch.ifVersion)
    // WHAT THE WORDS ARE NOW, when a note was written, because a note is part of the words and the
    // caller's copy of this line is out of date the moment one is stored.
    const noteSaid =
      !('remark' in patch)
        ? ''
        : line.remark === null
          ? ' The note has been taken off the line.'
          : ` The note is in the line's own words now — it reads ${JSON.stringify(line.text)} — which is what ` +
            'keeps it when the words are edited.'
    return {
      line,
      version: planVersion(id),
      note:
        (line.recordId === null
          ? 'Stored exactly as typed. Nothing canonical changed.'
          : `Stored exactly as typed. The record this line names (${line.recordId}) was NOT changed — the ` +
            'words and the title are two separate facts.') + noteSaid,
    }
  })

  app.delete('/plans/:id/lines/:lineId', route('plan.write', 'remote', REMOVE_LINE_NOTE), async (req) => {
    const { id, lineId } = parse(planAndLine, req.params, 'That is not a line of a plan:')
    // A DELETE MAY CARRY A BODY, and this one does: the reason the line is being dropped. The body
    // is optional in the schema, so a request with none reaches the library's own refusal instead of
    // a parser message about a field.
    const sent = parse(removeLine, req.body ?? {}, 'That is not a reason Mole Office can keep:')
    const removed = deleteLine(id, lineId, actorFrom(req), sent.reason)
    return {
      ...removed,
      version: planVersion(id),
      note:
        'The line is gone.' +
        // WHAT WENT WITH IT AND WHAT DID NOT, in the server's own sentences. Until 17 August 2026
        // this said only that the record was untouched, which is true and is half the story: the
        // work was left alive with nothing in the plan naming it and nobody was told what that cost.
        (removed.removedBindings.length === 0
          ? ' It was not filed as work.'
          : removed.removedBindings.map((one) => ` ${one.putItBack}`).join('')) +
        saidAboutTime(removed.keptWordsAdrift) +
        stillNamesTheLine(removed.stillNamesIt),
    }
  })

  app.get(
    '/plans/:id/lines/:lineId/revisions',
    route('plan.read', 'remote', LINE_REVISIONS_NOTE),
    async (req) => {
      const { id, lineId } = parse(planAndLine, req.params, 'That is not a line of a plan:')
      return readLineRevisions(id, lineId)
    },
  )

  app.post('/plans/:id/lines/:lineId/file-as-work', route('plan.write', 'remote', FILE_NOTE), async (req, reply) => {
    const { id, lineId } = parse(planAndLine, req.params, 'That is not a line of a plan:')
    const body = parse(fileAsWork, req.body, 'That is not something Mole Office can file as work:')
    const filed = fileLineAsWork(id, lineId, body, actorFrom(req), theMessageReader(actorFrom(req)))
    reply.code(201)
    // WHAT HAPPENED TO THE PLACE THIS LINE HAD, said in the same breath as the filing, because a
    // caller cannot see a link it did not ask for and cannot see the absence of one at all.
    const under = filed.under
    const place =
      under.linkId === null
        ? ` NO "part of" link was written. ${under.why}`
        : ` It is written under "${under.text}", so it was also made part of ${under.recordId}: one "part ` +
          `of" link (${under.linkId}), written in the same transaction.`
    // WHAT WAS ALREADY FILED UNDER THIS LINE AND IS NOW PART OF IT. A person who filed the detail
    // before the heading cannot see that the two have been joined, and the join is the difference
    // between a plan that adds up and a plan that only looks nested.
    const took = filed.adopted.filter((one) => one.linkId !== null)
    const missed = filed.adopted.filter((one) => one.linkId === null)
    const adoption =
      (took.length === 0
        ? ''
        : ` ${took.length} item${took.length === 1 ? '' : 's'} already filed under this line ` +
          `${took.length === 1 ? 'is' : 'are'} now part of it: ` +
          `${took.map((one) => `"${one.text}" (${one.recordId}), link ${one.linkId}`).join('; ')}. ` +
          `Every total that adds up a tree now counts ${took.length === 1 ? 'it' : 'them'} inside this one ` +
          'rather than beside it.') +
      (missed.length === 0 ? '' : ` ${missed.map((one) => one.why).join(' ')}`)
    // WHAT THE LINE SAID ABOUT ITSELF, AND WHERE EACH OF THOSE THINGS IS NOW. A value that moved has
    // left the line's words, so a caller told nothing about it is holding a document Mole Office has
    // changed under it.
    const moved = filed.promoted.filter((one) => one.moved)
    const stayed = filed.promoted.filter((one) => !one.moved)
    const promotion =
      filed.promoted.length === 0
        ? ''
        : (moved.length === 0
            ? ' Nothing the line said about itself was moved.'
            : ` ${moved.length} of the things this line said moved out of its words: ` +
              `${moved.map((one) => `${one.key} (${JSON.stringify(one.said)}) to ${one.wentTo}`).join('; ')}. ` +
              `The line now reads ${JSON.stringify(filed.line.text)}.`) +
          (stayed.length === 0
            ? ''
            : ` ${stayed.length} stayed on the line: ` +
              `${stayed.map((one) => `${one.key} (${JSON.stringify(one.said)}) — ${one.stayed}`).join(' ')}`)
    // WHAT A PERSON READS AFTER PRESSING THE BUTTON. One or two plain sentences, no record ids, and
    // nothing about how any of it is stored.
    //
    // THIS USED TO BE THE PARAGRAPH BELOW. The owner measured the receipt at about 950 characters
    // of ids and capitals after filing one line, and the owner's rule for it is: say what happened, and let
    // the detail live where a developer view can find it. So the long account is `detail` now and
    // this is what the browser prints. Both are built from the same fields of one reply, so they
    // cannot come to disagree about what happened.
    const joined =
      took.length === 0
        ? ''
        : ` ${took.map((one) => `"${one.text}"`).join(' and ')} ${took.length === 1 ? 'is' : 'are'} now part of it.`
    const notJoined = missed.map((one) => ` ${one.plainly ?? ''}`).join('')
    // WHAT LEFT THE WORDS THE PERSON IS LOOKING AT, said in the second they vanish. The server
    // builds this sentence from the same `promoted` list `detail` accounts for, so the short
    // answer and the long one cannot disagree. It is null when nothing left the line.
    const whatLeft = filed.whatLeftTheLine === null ? '' : ` ${filed.whatLeftTheLine}`
    // WHAT THE LINE STILL SAYS ABOUT TIME THAT NOTHING WAS SCHEDULED FROM — words that were already
    // held against this line before it was filed, from the table's own "keep these words" box. A
    // phrase the two sentences below have already named is left out here: saying one phrase twice in
    // one receipt is how a receipt stops being read.
    const alreadySaid = new Set(filed.promoted.map((one) => one.said))
    const stillKept = filed.kept.filter((one) => !alreadySaid.has(one.said))
    const time =
      stillKept.length === 0
        ? ''
        : ` ${stillKept.map((one) => `"${one.said}"`).join(' and ')} stays as you wrote it, and nothing ` +
          'has been scheduled from it.'
    // WHAT STAYED IN THE WORDS THE PERSON IS LOOKING AT. Time is named as not scheduled in the same
    // breath, because "it stayed" beside a phrase about a week reads as hours somebody now has.
    // Filing takes time out of the line only when it became an allocation, so anything left here is
    // time nothing was made of — see `fileLineAsWork` in lib/plans.ts for why it stays.
    const stillYours = filed.promoted.filter((one) => !one.moved && one.key !== 'note')
    const timeStayed = stillYours.some((one) => one.key === 'time')
    const left =
      stillYours.length === 0
        ? ''
        : ` ${stillYours.map((one) => `"${one.said}"`).join(' and ')} stayed in the line as your own words` +
          (timeStayed
            ? `, and nothing has been scheduled from ${stillYours.length === 1 ? 'it' : 'the time'}.`
            : '.')
    // WORK IN THIS PROJECT THAT WAS ALREADY CALLED THIS. Filing is no longer refused for it, so the
    // person is asked rather than stopped: only they can say whether the two are one thing. It is in
    // `note` and not only in `detail`, because the moment to ask is the moment they pressed.
    const named = filed.alsoCalledThis
    const sameName =
      named.length === 0
        ? ''
        : ` ${named.length === 1 ? 'Work in this project was' : `${named.length} other pieces of work in this project were`} ` +
          `already called "${filed.title}": ${named.map((one) => `${one.kind} ${one.id}`).join(', ')}. This is ` +
          'a separate record. If you meant that one, point this line at it instead and delete this record.'
    return {
      ...filed,
      version: planVersion(id),
      note: `Filed as work, called "${filed.title}".` + joined + notJoined + whatLeft + time + left + sameName,
      detail:
        `Filed as ${filed.recordId}, titled "${filed.title}", and the line now names it. That title was ` +
        'taken from the line once and is now its own fact: editing either one from here on leaves the other ' +
        'exactly as it is, and Mole Office shows the difference rather than repairing it.' +
        place +
        adoption +
        promotion,
    }
  })

  app.post('/plans/:id/lines/:lineId/give-time', route('plan.write', 'remote', TIME_NOTE), async (req, reply) => {
    const { id, lineId } = parse(planAndLine, req.params, 'That is not a line of a plan:')
    const body = parse(giveTime, req.body, 'That is not time Mole Office can give:')
    const given = giveLineTime(id, lineId, body, actorFrom(req))
    reply.code(201)
    return {
      ...given,
      version: planVersion(id),
      note:
        `One allocation written (${given.allocationId}) in ${body.period}, and it records that it came from ` +
        `this line. ${body.plannedHours === undefined || body.plannedHours === null ? 'No hours were stated, which means somebody committed to the work here without saying for how long — it is never filled in from the estimate.' : `${body.plannedHours}h.`} ` +
        'The work itself was not changed.',
    }
  })
}
