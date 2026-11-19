// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { RULES_THE_CODE_NAMES } from '@shared/chapter-check.ts'
/**
 * EVERYTHING AN ARRIVING AGENT HAS TO BE TOLD, IN ONE REPLY, SIZED TO FIT IN ITS CONTEXT.
 *
 * The aim: one command fetches a new agent everything it needs to follow a project's progress, as fast
 * as possible. Criterion I1 in `design/integration/ACCEPTANCE-DRAFT.md` is the measurable form of it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS, AND HOW IT DIFFERS FROM THE THREE READS BESIDE IT
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/project/bootstrap` answers *what is true of this project and what contradicts itself*.
 * `GET /api` answers *what can be asked for*. `GET /api/kinds` answers *what a record may hold*.
 * None of them answers *what should I work on, and how do I write here* — which is what an agent
 * actually needs before its first write, and what this answers.
 *
 * It composes; it computes nothing of its own. The modules come from the record store, the open work
 * from `openLoopsFor`, its order from the attention rule in `src/shared/attention.ts`, the decisions
 * from `readForks`, the warrants from `standsOnTheirWords`, and the writing rules from the declarations
 * that enforce them — `ACTOR_HEADERS`, `WORKSPACE_HEADER`, `HUMAN_ONLY_KINDS`, `GOVERNANCE_GUARDS`
 * and `VERBS_THE_OWNERS_WORDS_COVER`. Nothing here restates a rule in prose. A rule restated here
 * would be the same fact worked out in two places, which is the defect CLAUDE.md names as this
 * codebase's own, and it would be worked out in the one reply a cold agent trusts.
 *
 * ---------------------------------------------------------------------------------------
 * IT MEASURES ITSELF, AND IT NAMES WHAT IT DROPPED
 * ---------------------------------------------------------------------------------------
 *
 * The criterion says it has to fit in a context window and say what it left out. So the handler
 * serialises the reply, counts it, and — while it is over budget — drops one rung of `THE_LADDER`
 * at a time. Every rung it drops is named in `leftOut` with the request that would fetch the thing
 * back. A reply that fits drops nothing and `leftOut` is empty, which is a real answer and not an
 * absence.
 *
 * THE SIZE IS IN CHARACTERS AND BYTES, WHICH ARE COUNTED, AND IN TOKENS, WHICH ARE NOT. No
 * tokenizer is installed here and adding a dependency for one estimate would be worse than saying
 * so. Every token figure in this reply is characters divided by `CHARS_PER_TOKEN`, it is named
 * `tokensEstimated` wherever it appears, and `size.tokensAreAnEstimate` says it in a sentence a
 * person reads. The budget is checked against that estimate, and the reply says which it is.
 *
 * ---------------------------------------------------------------------------------------
 * THE ORDER OF THE OPEN WORK COMES FROM TWO READINGS AND THE REPLY SAYS WHICH
 * ---------------------------------------------------------------------------------------
 *
 * The attention rule ranks what is owed, stopped short or past a pause it set. It does not rank
 * everything that is open — most open work is none of those three, and inventing a score for it
 * here would be a second ranking rule disagreeing with the first one. So a loop the attention rule
 * selected carries its rank and its score; a loop it did not carries `rank: null` and the sentence
 * saying the rule did not select it. Ranked ones come first, in the rule's own order; the rest keep
 * the order `openLoopsFor` gave them, which is most-recently-changed first.
 */
import type { FastifyInstance } from 'fastify'
// WHICH DECISIONS A LATER ONE REPLACED: the one reading. Problem ZSWftCSVUP2r.
import { replacedDecisionIds } from '../lib/replaced-decisions.ts'
import { z } from 'zod'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

import { route } from '../lib/route.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import {
  theMessageReader,
  theMessagesThisReaderMayRead,
  withEachNarrowingWorkedOutOnce,
  type AMessageReader,
} from '../lib/messages.ts'
import { messagesInTheViewOf } from '../lib/message-centre.ts'
import { theRunBeforeThisOne } from '../lib/lastrun.ts'
import { ACTOR_HEADERS } from '@shared/request-headers.ts'
import { WORKSPACE_HEADER } from '@shared/request-headers.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { justThisProject } from '@shared/which-projects.ts'
import { db } from '../db/client.ts'
import { ONE_KIND_WRITTEN_OUT, STORED_FIELDS, records, workspaces } from '../db/schema.ts'
import { openLoopsFor, type OpenLoop, type OpenLoops } from '../lib/openloops.ts'
import type { ReadOnTheThread } from '../lib/attention-thread-worker.ts'
import { rankOpenWork, theReadingOpenWorkIsRankedBy, type RankedLoop } from '../lib/openwork.ts'
import { GOVERNANCE_GUARDS, getRecord, listRecords, VERBS_THE_OWNERS_WORDS_COVER, type Actor } from '../lib/records.ts'
import { thePurposeOfARound } from '../lib/the-purpose-of-a-round.ts'
import { readForks, type ForksRead } from '../lib/forks.ts'
import { standsOnTheirWords, type ActOnTheirWords } from '../lib/warrants.ts'
import { HUMAN_ONLY_KINDS } from '@shared/types.ts'
import { WARRANT_KEYS, WARRANT_PLACES, WARRANT_PLACES_WITH_AN_ID } from '@shared/warrant.ts'
import { THE_PERSON } from '@shared/person.ts'
// HOW THE PERSON WISHES TO BE ADDRESSED, read off their registry row and said in the declared words.
import { theAddressAsInWords, WHAT_ADDRESS_AS_MEANS, type AddressAs } from '@shared/address-as.ts'
import { participantForActor } from '../lib/participant-for-actor.ts'
import { readParticipant } from '../db/read-participant.ts'
// WHAT THIS AGENT'S GROUPS GAINED, worked out once for the brief and the groups door, and printed one way.
import { whatYourGroupsGained } from '../lib/group-news.ts'
import { groupNewsLines, type NewInYourGroups } from '@shared/group-news.ts'
// THE CHAPTERS OF THE OFFICE REGULATIONS, from the export of the chapter records. The opening reads the
// rule for a question from the person there and never writes its own copy (invariant 9).
import { theAbsenceOfARule, theRuleWithTheId } from '../lib/chapters.ts'
import type { ModuleData } from '@shared/types.ts'
import { theNotebookFor } from '../lib/notebook.ts'
import { listTheSpace, readAFile, residencyOf, theCallerOf } from '../lib/residents.ts'
import { MEMORY_FOLDER } from '@shared/residents.ts'
import { theNotebookOpening, type NotebookEntry } from '@shared/notebook.ts'
import { theDutiesLines, type TheDutiesPart } from '../lib/grant/secretary-duties.ts'
import { theDutiesPartFor } from '../db/the-duties-part-for.ts'
import { THE_TOOLSET_SENTENCE } from '@shared/toolset.ts'
import { SECOND_LEVEL_PARAM, SECOND_LEVEL_SHOW } from '@shared/second-level-fold.ts'
import { theOpenItemsSentenceForTheCaller } from '../lib/checklists.ts'
import {
  checkSubtraction,
  type BriefWordsBucket,
  type LeftOutCounts,
  type LeftOutGroup,
  type DroppedFields,
} from '@shared/disclosure.ts'
import {
  CHARS_PER_TOKEN,
  theTokenEstimateSentence,
  tokensEstimatedFor,
} from '../../config/token-estimate.mjs'

// ONE DECLARATION, READ HERE RATHER THAN WRITTEN AGAIN. The rule that turns characters into a
// token estimate and the sentence saying no tokenizer ran live in `src/config/token-estimate.mjs`,
// because a context bundle and the measuring tool read the same two things. Criterion T3. The
// re-export keeps the name the brief's own tests already import, and it is the same value: a change
// to the shared declaration moves the brief and the bundle together.
export { CHARS_PER_TOKEN }

/**
 * THE SIZE THIS REPLY AIMS TO FIT IN, IN ESTIMATED TOKENS.
 *
 * Twelve thousand is criterion I1's number. It is a budget rather than a limit: a reply over it is
 * still returned, with `size.fits` false and every rung it could drop named in `leftOut`, because a
 * refusal would leave an arriving agent with nothing at all.
 */
export const BRIEF_TOKEN_BUDGET = 12000

/** How many decisions the criterion asks for. */
const DECISIONS_CARRIED = 10

/** How many of the owner's own messages the reply starts with, newest first. */
const THEIR_MESSAGES_CARRIED = 12

/** How many of the person's messages, among those the reader may read, the brief reads whole at a time while it looks for the newest it carries. */
const THEIR_MESSAGES_READ_AT_ONCE = 50

/**
 * How many of this reply's records are asked whether one of the owner's warrants still stands on
 * them. Bounded, because each ask reads that record's revisions, and an unbounded sweep of a
 * project's whole history is not a thing a session-start read may do.
 */
const RECORDS_ASKED_ABOUT_WARRANTS = 25

/** How long one of the owner's quoted messages may be before the reply cuts it. */
const THEIR_WORDS_CHARACTERS = 700

/** How long a module's one line may be. A first sentence longer than this is cut, and says so. */
const MODULE_LINE_CHARACTERS = 200

/** How long a warrant's quoted words may be once the reply has had to cut warrants. */
const WARRANT_WORDS_CHARACTERS = 300

/**
 * WHAT GOES FIRST WHEN THE REPLY IS TOO BIG, IN ORDER, AND WHERE EACH THING CAN BE FETCHED BACK.
 *
 * Declared once so `leftOut` cannot announce a rung the handler does not drop, and so the order is
 * a decision somebody made rather than whatever the code happened to do. The modules and the last
 * ten decisions are not on the ladder: those two are the parts of this reply an agent cannot get
 * cheaply anywhere else. A module is carried as its name, its state and one line, so there is no
 * summary left for a rung to cut; the whole module is one request away (`modulesSecondLevel`).
 */
const THE_LADDER: readonly { rung: string; what: string; ask: string | (() => string) }[] = [
  {
    rung: 'the-persons-words',
    what: "the person's own messages, cut to their opening and then halved, oldest first",
    // A NARROWED PAGE, NOT THE WHOLE POOL. `GET /api/messages` with no page answers one page now, and this rung is about
    // the person's own messages, so the ask names their sender, the page size the Messages page uses, and the whole
    // entry: without `full=1` the page carries only each message's id, title and window. A reader that needs more
    // follows the reply's `next`.
    ask: () => `GET /api/messages?sender=${encodeURIComponent(`person:${THE_PERSON}`)}&limit=50&offset=0&full=1`,
  },
  {
    rung: 'unranked-loops',
    what: 'the open work the attention rule does not rank, so only ranked work is left',
    ask: 'GET /api/open-loops',
  },
  {
    rung: 'warrant-words',
    what: "the owner's quoted words on each decision, cut to their opening",
    ask: 'GET /api/records/<the decision id>',
  },
]

/** A ladder rung as it is written into `leftOut`: its ask is worked out now when it is a function. */
function theRungAsWritten(rung: (typeof THE_LADDER)[number]): { rung: string; what: string; ask: string } {
  return { rung: rung.rung, what: rung.what, ask: typeof rung.ask === 'function' ? rung.ask() : rung.ask }
}

/**
 * HOW MUCH OF A RESIDENT'S MEMORY THE BRIEF CARRIES: at most this many files, and at most this many bytes in all.
 * Row 17 of report rFBoQG6mAEI0. Item 7 of a decision keeps memory short because it is
 * read at every start, so these are a ceiling and not a size anybody should reach.
 * A file past either one is named in `memory.leftOut` with the request that reads it.
 */
const MEMORY_FILES_AT_MOST = 40
const MEMORY_BYTES_AT_MOST = 40 * 1024

/** One memory file the brief carries, whole. */
interface AMemoryFile {
  path: string
  bytes: number
  text: string
}

/** One memory file the brief does not carry, why, and the request that reads it. */
interface AMemoryFileLeftOut {
  path: string
  bytes: number
  because: string
  ask: string
}

/** What the brief says about the memory of the agent it is read for. */
interface TheMemoryOfTheBrief {
  resident: boolean
  files: AMemoryFile[] | null
  leftOut: AMemoryFileLeftOut[]
  note: string
}

/**
 * THE MEMORY FILES OF THE RESIDENT THIS BRIEF IS READ FOR. Row 17 of report rFBoQG6mAEI0: the brief never
 * looked at a resident's space, so a resident started without its memory unless it went and fetched it.
 *
 * Every file under `memory/` in the space, in path order, read through the space's own doors (`listTheSpace`
 * and `readAFile`), so the same reader rule holds here as at GET /api/residents/:agentId/space: the memory is
 * handed only to the resident its key proves. A file with a void mark is left out and says why: somebody marked
 * it as not to be relied on. So is a file that is not UTF-8 text, and every file past the ceiling above. Each one
 * left out names the request that reads it.
 */
function theMemoryOf(readFor: string | null, actor: Actor): TheMemoryOfTheBrief {
  if (readFor === null) {
    return { resident: false, files: null, leftOut: [], note: 'This brief was not read for an agent, so no memory was looked for.' }
  }
  // THE SPACE'S OWN READER RULE: only a key proves which agent asks. A header that names a resident and carries no
  // key is told so, and the rest of its brief is answered as before.
  const caller = theCallerOf(actor)
  const named = participantForActor(actor)
  const residency = caller.kind === 'agent' ? residencyOf(caller.id) : null
  if (residency === null) {
    const unproved = caller.kind !== 'agent' && named !== null && named.kind === 'agent' && residencyOf(named.id) !== null
    return {
      resident: false,
      files: null,
      leftOut: [],
      note: unproved
        ? 'This request names a resident and carries no key that proves it, so its memory was not read. Ask again with ' +
          'the resident\'s own key.'
        : 'This agent is not a resident, so it has no personal space and no memory files. That is an answer, not a gap.',
    }
  }
  const ask = (path: string): string =>
    `GET /api/residents/${residency.agentId}/space/file?path=${encodeURIComponent(path)}`
  const files: AMemoryFile[] = []
  const leftOut: AMemoryFileLeftOut[] = []
  let used = 0
  const strict = new TextDecoder('utf-8', { fatal: true })
  const inMemory = listTheSpace(residency, actor)
    .filter((file) => file.path.startsWith(MEMORY_FOLDER))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  for (const one of inMemory) {
    const away = (because: string): void => {
      leftOut.push({ path: one.path, bytes: one.bytes, because, ask: ask(one.path) })
    }
    if (one.void !== null) {
      away(`It is marked void: ${one.void.because}`)
      continue
    }
    if (files.length >= MEMORY_FILES_AT_MOST) {
      away(`The brief carries at most ${String(MEMORY_FILES_AT_MOST)} memory files.`)
      continue
    }
    if (used + one.bytes > MEMORY_BYTES_AT_MOST) {
      away(`The brief carries at most ${String(MEMORY_BYTES_AT_MOST)} bytes of memory, and this file would go past that.`)
      continue
    }
    const read = readAFile(residency, one.path, actor)
    let text: string
    try {
      text = strict.decode(read.bytes)
    } catch {
      away('It is not UTF-8 text, so the brief cannot carry it as words.')
      continue
    }
    files.push({ path: read.path, bytes: read.bytes.length, text })
    used += read.bytes.length
  }
  return {
    resident: true,
    files,
    leftOut,
    note:
      files.length === 0 && leftOut.length === 0
        ? `This resident's space holds no file under ${MEMORY_FOLDER}. Its memory is not written yet.`
        : `Every file under ${MEMORY_FOLDER} in this resident's space, whole, in path order. Each file left out is ` +
          'named in `leftOut` with why and the request that reads it. Memory is read at every start, so keep it short ' +
          'and tidy it regularly.',
  }
}

/**
 * ONE MODULE IN THE BRIEF: ITS NAME, ITS STATE AND ONE LINE.
 *
 * The whole module was carried here until round 47 of wave 13q: its context, its curated summary and
 * two counts. On the live office that was 43 KB, and it pushed the brief past the 60,000 characters
 * a reply is cut at, so an agent lost the brief's size, its opening and the owner's words. The rest
 * of the module is `GET /api/records/<id>`, and `modulesSecondLevel` says so in the reply.
 */
interface BriefModule {
  id: string
  title: string
  state: string | null
  /**
   * The first sentence of what somebody curated about the module, or null because it has no summary
   * and no written block in its long form. It is never taken from `context`, which is not a summary.
   */
  line: string | null
  /** Which curated field the line is from: the summary paragraph, or the long form's first written block. */
  lineFrom: 'summary' | 'summaryBlocks' | null
  /** True when the first sentence was longer than the line may be, and was cut. */
  lineWasCut?: true
}

/**
 * ONE OPEN LOOP, WITH THE ATTENTION RULE'S PLACE FOR IT OR THE SENTENCE SAYING IT HAS NONE.
 *
 * IT IS THE SHARED SHAPE NOW, from `src/server/lib/openwork.ts`. The ranking was written inside
 * this file's route closure, so nothing else could reach it and a context copy put the same open
 * work in a different order. Criterion B20 of design/bundle/ACCEPTANCE.md; the reader moved and the
 * brief's own reply did not change a field.
 */
type BriefLoop = RankedLoop

/** One decision, with the fork it settled and the owner's words it stands on. */
interface BriefDecision {
  id: string
  title: string
  question: string | null
  optionTaken: string | null
  decidedOn: string | null
  createdAt: string
  proposalId: string | null
  /** The warrant nobody has taken back, or null because this was not an act on quoted words. */
  onThePersonsWords: ActOnTheirWords | null
  /** True when the quoted words above were cut to make this reply fit. */
  wordsWereCut?: true
}

/** One thing the owner wrote that still governs. */
interface TheirWordsInTheBrief {
  where: 'a message the person wrote' | 'a warrant an agent is still acting on'
  id: string
  at: string
  words: string
  /** True when the words above were cut to make this reply fit. */
  wasCut?: true
  /** The record ids the words are about. Empty for a message, which is about the project. */
  about: readonly string[]
}

/** What this reply says about its own size. */
interface BriefSize {
  characters: number
  bytes: number
  tokensEstimated: number
  charsPerTokenAssumed: number
  budgetTokensEstimated: number
  fits: boolean
  /**
   * How long the opening in `head` is, counted separately.
   *
   * The opening is a short rendering of what is above it, for a hook or a rules file that has room
   * for a paragraph and not for the whole thing. It is counted apart from the brief because it
   * quotes the brief's own size, and a count that included it would be a number quoting itself.
   */
  openingCharacters: number
  tokensAreAnEstimate: string
}

function isModuleData(data: Record<string, unknown>): data is ModuleData & Record<string, unknown> {
  return typeof data === 'object'
}

/** The first sentence of a curated text: up to its first full stop, question or exclamation mark, within its first paragraph. */
function firstSentence(text: string): string {
  const paragraph = text.trim().split(/\n\s*\n/)[0]!
  const end = /[。！？]|[.!?](?=\s|$)/.exec(paragraph)
  return (end === null ? paragraph : paragraph.slice(0, end.index + end[0].length)).replace(/\s+/g, ' ').trim()
}

/** The text of a module's first written summary block, or null because it has none. */
function firstWrittenBlock(blocks: unknown): string | null {
  if (!Array.isArray(blocks)) return null
  for (const block of blocks) {
    const text = typeof block === 'object' && block !== null ? (block as { text?: unknown }).text : undefined
    if (typeof text === 'string' && text.trim() !== '') return text
  }
  return null
}

/** The modules of one project, newest change first, each with what somebody curated about it. */
function modulesIn(workspaceId: string): BriefModule[] {
  const rows = db
    .select()
    .from(records)
    .where(and(eq(records.workspaceId, workspaceId), eq(records.kind, 'module'), isNull(records.deletedAt)))
    .orderBy(desc(records.updatedAt), desc(records.id))
    .all()
  return rows.map((row) => {
    const data = (row.data ?? {}) as Record<string, unknown>
    const module = isModuleData(data) ? data : ({} as ModuleData)
    const summary = typeof module.summary === 'string' && module.summary.trim() !== '' ? module.summary : null
    const block = summary === null ? firstWrittenBlock(module.summaryBlocks) : null
    const curated = summary ?? block
    const sentence = curated === null ? null : firstSentence(curated)
    return {
      id: row.id,
      title: row.title,
      state: typeof data.state === 'string' ? data.state : null,
      line: sentence === null ? null : sentence.slice(0, MODULE_LINE_CHARACTERS),
      lineFrom: summary !== null ? 'summary' : block !== null ? 'summaryBlocks' : null,
      ...(sentence !== null && sentence.length > MODULE_LINE_CHARACTERS ? { lineWasCut: true as const } : {}),
    }
  })
}

/**
 * The last decisions of one project, newest filed first, each with the warrant that stands on it.
 *
 * EVERY DECISION, NOT ONLY THE ONES THAT SETTLED A FORK. `readForks` answers which proposal each
 * decision settled, and it only knows about decisions linked to one; a decision the owner wrote by
 * hand settles nothing and would be invisible in a list built from that reading alone. So the list
 * is the decision records themselves, and the fork reading is joined on where it has something to
 * add — the question that was open, and which option was taken.
 */
function decisionsIn(workspaceId: string, forks: ForksRead, since: string | null = null): BriefDecision[] {
  const settled = new Map(
    forks
      .decisions.filter((one) => one.workspaceId === workspaceId)
      .map((one) => [one.recordId, one]),
  )
  // A DECISION A LATER ONE REPLACED IS NOT BRIEFED (problem ZSWftCSVUP2r): an agent reads the one that stands, and the
  // replaced one stays on its own page, naming its replacement. The count below leaves out the same ones.
  const replaced = replacedDecisionIds(workspaceId)
  return listRecords({ workspaceId, kind: 'decision' })
    .filter((one) => !replaced.has(one.id))
    // FROM THE SECOND THAT RUN OPENED, INCLUSIVE. Stamps here are wall-clock to the second, so a
    // decision filed in the same second as the boundary run cannot be told from one filed just
    // before it. Naming a decision you had already seen costs a reader one line; leaving one out
    // costs them the thing this section exists to tell them, so the boundary is inclusive.
    .filter((one) => since === null || one.createdAt >= since)
    // Newest first, and the id breaks a tie. Stamps here are wall-clock to the second, so a dozen
    // decisions written in the same second would otherwise come back in whatever order the store
    // happened to give, and "the last ten" would mean a different ten on each read.
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    .slice(0, DECISIONS_CARRIED)
    .map((record) => {
      const fork = settled.get(record.id) ?? null
      const data = record.data
      return {
        id: record.id,
        title: record.title,
        question: fork?.question ?? null,
        optionTaken: fork?.optionTaken ?? (typeof data.option_taken === 'string' ? data.option_taken : null),
        decidedOn: fork?.decidedOn ?? null,
        createdAt: record.createdAt,
        proposalId: fork?.proposalId ?? null,
        onThePersonsWords: standsOnTheirWords(record.id),
      }
    })
}

/** How many decisions this project has filed since a stamp. Counted, never estimated from the list. */
function howManyDecisionsSince(workspaceId: string, since: string): number {
  const replaced = replacedDecisionIds(workspaceId)
  return listRecords({ workspaceId, kind: 'decision' }).filter((one) => one.createdAt >= since && !replaced.has(one.id)).length
}

/**
 * WHAT WAS DECIDED SINCE THIS CALLER LAST RAN, and a sentence when nothing was.
 *
 * Criterion P36: an agent that joins later is told the decisions already made about the project.
 * An agent that arrives after a fork was settled met the answer nowhere.
 *
 * THE TEN NEWEST STAY WHERE THEY ARE. `decisions` above is unchanged and is what a first-time reader
 * has — it has no last run, so there is nothing to measure from. This is a second, narrower reading
 * beside it, and it says out loud when it could not be taken.
 */
function decidedSinceYouLastRan(
  workspaceId: string,
  actor: Actor,
  forks: ForksRead,
): {
  measuredFrom: { run: string; title: string; openedAt: string } | null
  decisions: BriefDecision[]
  howMany: number
  note: string
} {
  const before = theRunBeforeThisOne({ workspaceId, actor })
  if (before.before === null) {
    return {
      measuredFrom: null,
      decisions: [],
      howMany: 0,
      note:
        `${before.because ?? 'Nothing said why.'} The ten newest decisions this project has made are in ` +
        '`decisions` above, which is what a first-time reader gets.',
    }
  }
  const since = before.before.openedAt
  const howMany = howManyDecisionsSince(workspaceId, since)
  const carried = decisionsIn(workspaceId, forks, since)
  const measuredFrom = { run: before.before.id, title: before.before.title, openedAt: since }
  if (howMany === 0) {
    return {
      measuredFrom,
      decisions: [],
      howMany: 0,
      note:
        `Nothing has been decided in this project since ${since}, when the run before this one — ` +
        `"${before.before.title}" (${before.before.id}) — opened. That is measured over the runs filed under ` +
        `the name you are writing under, "${actor.id}", so a name several runs share will answer about the ` +
        'newest of them.',
    }
  }
  return {
    measuredFrom,
    decisions: carried,
    howMany,
    note:
      `${String(howMany)} decision${howMany === 1 ? ' was' : 's were'} made in this project since ${since}, when ` +
      `the run before this one — "${before.before.title}" (${before.before.id}) — opened${
        howMany > carried.length
          ? `; the ${String(carried.length)} newest are here and GET /api/records?kind=decision has the rest`
          : ''
      }. That is measured over the runs filed under the name you are writing under, "${actor.id}", so a name ` +
      'several runs share will answer about the newest of them.',
  }
}

/**
 * WHAT THE OWNER HAS SAID THAT STILL GOVERNS, from the two places the person's words are kept.
 *
 * A message the person wrote, and a warrant an agent is still acting on. Both are the person's words; neither is a
 * summary of them. A message whose sender nobody recorded is not counted and the count of those is
 * reported, because *there are none* and *nobody looked* are different facts.
 */
function hisWords(workspaceId: string, askAbout: readonly string[], reader: AMessageReader): {
  words: TheirWordsInTheBrief[]
  messagesWithNoRecordedSender: number
} {
  // ONLY THE MESSAGES THE READER MAY READ: an agent's brief carries what the person said
  // to it, and to a group it was in, and not what they said to somebody else. Both numbers below count
  // only those.
  //
  // ONLY THE MESSAGES THESE TWO ANSWERS NEED ARE READ: the person's own, newest first and a page at a
  // time until enough are found, and the ids of those that stored no sender. Before, every message of
  // the project was read whole for them: 12,500 on an office of the live shape (round 34 of wave 13n).
  // THIS PROJECT'S VIEW OF THE MESSAGE CENTRE.
  const inView = and(messagesInTheViewOf(justThisProject(workspaceId)), ONE_KIND_WRITTEN_OUT.message, isNull(records.deletedAt))
  // THE IDS FIRST, IN ONE READ, AND THEN ONLY THE READABLE ONES WHOLE. It read the person's messages whole
  // a page of fifty at a time, each page a walk of the message centre, until twelve the reader may read were
  // found. An agent may read few of them, so on the made-up office of the live size an agent's brief read
  // 105 pages, 2.7 s of the office's one thread (wave 13y round 22). Now the ids come in one walk, the
  // reader's rule keeps the ones it may read, and those are read whole in the same order until twelve with
  // words are found. The same messages, in the same order, as before.
  const theirIds = db
    .select({ id: records.id })
    .from(records)
    .where(
      and(
        inView,
        eq(STORED_FIELDS.messageSentById(records.data), THE_PERSON),
        eq(sql`json_extract(${records.data}, '$.sentBy.kind')`, 'person'),
      ),
    )
    .orderBy(desc(records.createdAt), sql`rowid`)
    .all()
    .map((row) => row.id)
  const mayRead = theMessagesThisReaderMayRead(reader, theirIds)
  const readable = theirIds.filter((id) => mayRead.has(id))
  const fromMessages: TheirWordsInTheBrief[] = []
  for (let at = 0; at < readable.length && fromMessages.length < THEIR_MESSAGES_CARRIED; at += THEIR_MESSAGES_READ_AT_ONCE) {
    const ids = readable.slice(at, at + THEIR_MESSAGES_READ_AT_ONCE)
    const byId = new Map(db.select().from(records).where(inArray(records.id, ids)).all().map((row) => [row.id, row]))
    for (const id of ids) {
      const row = byId.get(id)
      if (row === undefined) continue
      const data = (row.data ?? {}) as Record<string, unknown>
      const body = typeof data.body === 'string' ? data.body : ''
      if (body.trim() === '') continue
      fromMessages.push({
        where: 'a message the person wrote',
        id: row.id,
        at: row.createdAt,
        words: body,
        about: [],
      })
      if (fromMessages.length >= THEIR_MESSAGES_CARRIED) break
    }
  }
  // A MESSAGE THAT STORED NO SENDER, or stored null. Such a message has no stored sender id, so the
  // index on that id finds every one of them, and `json_type` then keeps the ones with no sender at all.
  // THE INDEX IS NAMED, because SQLite did not pick it and walked every message instead: 66 ms on a
  // made-up office at the scale of 22 October 2026, and under 0.1 ms this way (wave 13y round 65).
  const withNoSender = db
    .all<{ id: string }>(
      sql`SELECT ${records.id} AS id FROM ${records} INDEXED BY records_message_sent_by_idx WHERE ${and(
        inView,
        isNull(STORED_FIELDS.messageSentById(records.data)),
        sql`coalesce(json_type(${records.data}, '$.sentBy'), 'null') = 'null'`,
      )}`,
    )
    .map((row) => row.id)
  const noSender = theMessagesThisReaderMayRead(reader, withNoSender).size
  const fromWarrants: TheirWordsInTheBrief[] = []
  const seen = new Set<string>()
  for (const id of askAbout.slice(0, RECORDS_ASKED_ABOUT_WARRANTS)) {
    const stands = standsOnTheirWords(id)
    if (stands === null) continue
    const key = `${stands.warrant.when}:${stands.warrant.words}`
    if (seen.has(key)) continue
    seen.add(key)
    fromWarrants.push({
      where: 'a warrant an agent is still acting on',
      id: stands.recordId,
      at: stands.warrant.when,
      words: stands.warrant.words,
      about: stands.warrant.for,
    })
  }
  return { words: [...fromWarrants, ...fromMessages], messagesWithNoRecordedSender: noSender }
}

/** The read that hands back the rules for writing with what the brief holds one level down. */
export const THE_WRITING_RULES_IN_FULL = `GET /api/brief?${SECOND_LEVEL_PARAM}=${SECOND_LEVEL_SHOW}`

/**
 * THE RULES FOR WRITING, DERIVED FROM THE DECLARATIONS THAT ENFORCE THEM.
 *
 * Not one sentence of this is a restatement. The header names come from the reader that reads them,
 * the human-only kinds from the list the gate checks, the acts from the guard registry, and the
 * verbs a warrant covers from the constant the gate compares against. Change any of those and this
 * reply changes with it.
 *
 * THE FACTS FIRST, AND THE REST ONE LEVEL DOWN. Unasked, it
 * carries the headers, the kinds, the warrant's fields and verbs, and how many acts are governed. The note on what the
 * headers prove, the act-by-act list and what a warrant is come back with ?secondLevel=show, and `secondLevel` names
 * each one and that read. In round 46 the three were about 820 of the brief's 1707 words on a small office.
 */
function theRulesForWriting(asked: boolean): Record<string, unknown> {
  const headersNote =
    'Send the actor type and actor id on every write. They are ATTRIBUTION: they name the person or agent ' +
    'the write is filed under, and they prove nothing. What makes a caller the person is the key the office ' +
    'made at first run, sent as x-mole-office-key or as the pairing cookie; a request with no key is ' +
    'not the person at the person\'s own doors. For one version a header claim with no key still counts on ' +
    'this machine and from a machine the office trusts, and every such request is written to the list ' +
    'at GET /api/office/header-only-calls on the Settings page.'
  const whatAWarrantIs =
    "The person's own words, kept and acted on, when the person has already said yes. An agent carrying " +
    'one may make a governance write that is otherwise refused to it.'
  return {
    headers: {
      whichProject: WORKSPACE_HEADER,
      whoIsWriting: ACTOR_HEADERS,
      ...(asked ? { note: headersNote } : {}),
    },
    governedActs: GOVERNANCE_GUARDS.length,
    ...(asked
      ? {
          whoMayDoWhat: GOVERNANCE_GUARDS.map((guard) => ({
            act: guard.act,
            onTheseRoutes: guard.route,
            refusedFromAnotherMachineAs: guard.actKey,
            // THE DECLARED KEY OF ONE OF THE PERSON'S OWN ACTS, or null when this guard is not one of
            // them. `refusedFromAnotherMachineAs` above is the other key and answers where the refusal
            // bites; this one answers whose act it is, and names it in design/permissions/roles.json.
            thePersonsAct: guard.personAct,
          })),
        }
      : {}),
    kindsOnlyAPersonMayWrite: HUMAN_ONLY_KINDS,
    warrant: {
      ...(asked ? { whatItIs: whatAWarrantIs } : {}),
      fields: WARRANT_KEYS,
      wherePeopleSayThings: [...WARRANT_PLACES, ...WARRANT_PLACES_WITH_AN_ID.map((place) => `${place}:<id>`)],
      verbsItCovers: VERBS_THE_OWNERS_WORDS_COVER,
      sentInTheBody: 'A warrant is a field on the request body. The header of that name is refused.',
    },
    readTheShapesFrom: 'GET /api/kinds, or GET /api/kinds/<kind> for the one you are about to write.',
    ...(asked
      ? {}
      : {
          secondLevel: {
            held: [
              'headers.note: what the actor headers prove, and what makes a caller the person',
              `whoMayDoWhat: each of the ${String(GOVERNANCE_GUARDS.length)} governed acts, its routes and whose act it is`,
              'warrant.whatItIs: what a warrant is',
            ],
            ask: THE_WRITING_RULES_IN_FULL,
          },
        }),
  }
}

/**
 * THE PERSON THIS OFFICE IS FOR, AND HOW THEY WISH TO BE ADDRESSED. Agents address people as they wish,
 * so an arriving agent is told how before it writes to them.
 *
 * NULL WHEN NO PEOPLE ROW ANSWERS TO THE PERSON'S ID, which a migrated database never is; the body
 * then says so rather than drawing a person nobody registered. `addressAs` holds only the parts they
 * set, each as they wrote it.
 */
interface ThePerson {
  id: string
  name: string
  addressAs: AddressAs
}

function thePersonThisOfficeIsFor(): ThePerson | null {
  const row = readParticipant({ kind: 'person', id: THE_PERSON })
  return row === null ? null : { id: row.id, name: row.name, addressAs: row.addressAs }
}

/**
 * THE LINE OF THE OPENING THAT SAYS HOW THE PERSON WISHES TO BE ADDRESSED, or null for no line.
 *
 * Null when there is no person row and when they have set no part: the opening then says nothing about
 * it, the same as the hand-over of a message does. The values are the person's own words, shown as written.
 */
function howToAddressThePersonLine(person: ThePerson | null): string | null {
  if (person === null) return null
  const words = theAddressAsInWords(person.addressAs)
  return words === null ? null : `How the person ${person.name} wishes to be addressed: ${words}.`
}

// ============================================================================ what the groups gained

/**
 * WHAT THE GROUPS THIS AGENT IS IN GAINED SINCE ITS READ POINT IN EACH. Item 5, step 3, of
 * a decision says an agent reads its groups' new messages when it wakes, and the brief is what a
 * starting session and a started run are handed.
 *
 * `whatYourGroupsGained` in src/server/lib/group-news.ts works the summary out, and GET
 * /api/messages/groups serves the same one. The brief never moves the read point, because it is a
 * read. A brief read for anybody but an agent reads no group.
 */
function theGroupNewsOfTheBrief(actor: Actor, reader: AMessageReader): NewInYourGroups {
  if (actor.type !== 'agent') {
    return {
      readFor: null,
      registered: false,
      readPointMoved: false,
      onlyTheUndelivered: false,
      groupsYouAreIn: 0,
      groups: [],
      moreGroups: 0,
      note: 'This brief was not read for an agent, so no group was read.',
    }
  }
  return whatYourGroupsGained(actor.id, participantForActor(actor), reader, false).news
}

// ============================================================================ the rule for a question

/**
 * WHERE THE RULE FOR A QUESTION FROM THE PERSON IS: chapter 7, the rule whose id is r-8. Item 6 of one of
 * the owner's decisions says the first brief the office gives at each start carries
 * it. It is found by its id in the chapter, so a rule moved to another number is
 * still the one read. It is read from the office's chapter records, the same in every project (wave 13w).
 */
const THE_RULE_FOR_A_QUESTION = RULES_THE_CODE_NAMES[0]

/** The rule for a question from the person, read from the chapter, or a sentence saying it is not there. */
interface TheRuleForAQuestion {
  found: boolean
  /** The chapter of the office regulations the rule is looked for in. */
  chapter: number
  /** The rule's number in its chapter, 1 upwards, or null because it is not there. */
  number: number | null
  name: string | null
  text: string | null
  says: string
}

function theRuleForAQuestion(): TheRuleForAQuestion {
  const { chapter, rule: id } = THE_RULE_FOR_A_QUESTION
  const rule = theRuleWithTheId(chapter, id)
  if (rule === null) {
    return {
      found: false,
      chapter,
      number: null,
      name: null,
      text: null,
      says:
        `${theAbsenceOfARule(chapter, id)}, so the rule for a question from the person could not be read ` +
        `here. GET /api/office-regulations shows what this office's regulations hold.`,
    }
  }
  return {
    found: true,
    chapter,
    number: rule.number,
    name: rule.name,
    text: rule.text,
    says: `Chapter ${String(chapter)} rule ${String(rule.number)}, ${rule.name}: ${rule.text}`,
  }
}

/**
 * WHERE A THING THE END OF A CONVERSATION WOULD LOSE GOES: chapter 9, the rule whose id is r-8, read from the office's
 * chapter records like the rule above. The opening names it and points at the regulations page for its words.
 */
const THE_RULE_FOR_WHAT_WOULD_BE_LOST = RULES_THE_CODE_NAMES[1]

function theLineForWhatWouldBeLost(): string {
  const { chapter, rule: id } = THE_RULE_FOR_WHAT_WOULD_BE_LOST
  const rule = theRuleWithTheId(chapter, id)
  return rule === null
    ? `If the end of this conversation would lose a thing, put it in the office. ${theAbsenceOfARule(chapter, id)}, ` +
        'the rule that says how, so GET /api/office-regulations shows what they hold instead.'
    : `If the end of this conversation would lose a thing, put it in the office: chapter ${String(chapter)} rule ` +
        `${String(rule.number)}, ${rule.name}. GET /api/office-regulations has its words.${rule.selectionNotice ? ' ' + rule.selectionNotice : ''}`
}

/**
 * THE RULE AS THE BODY CARRIES IT. When the rule is found, `says` is its chapter, number, name and text again,
 * word for word, so the body leaves it out and the opening prints it. When it is not found, `says` is the only
 * sentence saying so, and it stays.
 */
function theRuleInTheBody(rule: TheRuleForAQuestion): Omit<TheRuleForAQuestion, 'says'> & { says?: string } {
  if (!rule.found) return rule
  const { says: _printedByTheOpening, ...rest } = rule
  return rest
}

/** How many modules, open loops and quoted words the opening carries. */
const HEAD_MODULES = 6
const HEAD_LOOPS = 4
const HEAD_WORDS = 1

/**
 * THE OPENING OF THE BRIEF, AS PLAIN SENTENCES, BUILT HERE AND NOWHERE ELSE.
 *
 * Criterion I2 needs the same few paragraphs in three places: printed by the session-start hook,
 * written into the rules file the other tools read, and printed by `tools/brief.mjs --head`. Built
 * in each of those it would be the same reading written out three times, and the three would drift.
 * So the reply carries it, and all three print what the server said.
 *
 * IT IS THE OPENING AND NOT THE WHOLE THING, and the last line says where the whole thing is. The
 * whole brief is tens of thousands of characters; a start hook a person also reads, and a rules
 * file a tool may cut short, both need something that fits.
 */
function briefHead(body: {
  project: { title: string } | null
  modules: BriefModule[]
  loops: BriefLoop[]
  words: TheirWordsInTheBrief[]
  size: BriefSize
  leftOut: readonly unknown[]
  notebook: { agent: string | null; entries: readonly NotebookEntry[] | null }
  duties: TheDutiesPart
  purpose: string | null
  person: ThePerson | null
  aQuestionFromThePerson: TheRuleForAQuestion
  whatWouldBeLost: string
  newInYourGroups: NewInYourGroups
  openItems: string | null
}): string {
  const lines: string[] = []
  // THE NOTEBOOK FIRST, BEFORE THE PROJECT'S OWN NAME. Criterion N4: even when the model changes, a
  // secretary quickly gets back how it works with the person and its own character. A block further
  // down is a block a run on a small context window or a tool that cuts the opening short can miss,
  // and what has to survive a change of model must not be missable. `theNotebookOpening` in
  // shared/notebook.ts writes the words; nothing about them is written here, so the hook, the
  // worker's prompt and this opening cannot come apart.
  lines.push(theNotebookOpening({ agent: body.notebook.agent, entries: body.notebook.entries }))
  lines.push('')
  // AND BESIDE IT, WHAT EACH SECRETARY DOES IN THIS PROJECT (wave 13s round 92): a reader a duties record names gets its
  // own duties whole and every other secretary's area in one line. A reader with no record gets no lines here and reads
  // the same part in the reply's JSON. `theDutiesLines` in lib/grant/secretary-duties.ts writes the words.
  const dutiesLines = theDutiesLines(body.duties)
  if (dutiesLines.length > 0) {
    lines.push(...dutiesLines)
    lines.push('')
  }
  if (body.purpose !== null) {
    lines.push(body.purpose)
    lines.push('')
  }
  lines.push(
    body.project === null
      ? 'Mole Office holds no project by this name, so this brief is about nothing.'
      : `${body.project.title} — the state of this project, from GET /api/brief.`,
  )
  lines.push(
    body.modules.length === 0
      ? 'No module has been written in this project, so nothing says what its parts are.'
      : `${String(body.modules.length)} module${body.modules.length === 1 ? '' : 's'}: ${body.modules
          .slice(0, HEAD_MODULES)
          .map((module) => module.title)
          .join('; ')}${body.modules.length > HEAD_MODULES ? `; and ${String(body.modules.length - HEAD_MODULES)} more` : ''}.`,
  )
  if (body.loops.length === 0) {
    lines.push('Nothing in this project is open: no task, problem, idea, direction, obligation or unsettled fork.')
  } else {
    lines.push(`${String(body.loops.length)} open, in the order the attention rule puts them:`)
    for (const loop of body.loops.slice(0, HEAD_LOOPS)) {
      lines.push(`  ${loop.rank === null ? 'not ranked' : `#${String(loop.rank)}`}  ${loop.kind} ${loop.id} — ${loop.says}`)
    }
    if (body.loops.length > HEAD_LOOPS) {
      lines.push(`  and ${String(body.loops.length - HEAD_LOOPS)} more.`)
    }
  }
  // THE RULE FOR A QUESTION FROM THE PERSON, read from the chapter, by item 6 of a decision.
  lines.push(body.aQuestionFromThePerson.says)
  // WHAT THE GROUPS THIS AGENT IS IN GAINED, by item 5, step 3, of a decision.
  lines.push(...groupNewsLines(body.newInYourGroups))
  // THE CALLER'S OPEN CHECKLIST ITEMS, so that a run that lost its context to a compaction is told what
  // it was asked and has not finished, by point 4 of a decision.
  // The sentence is `theOpenItemsSentence` in shared/checklists.ts, the one the report and idle reminders print.
  if (body.openItems !== null) lines.push(body.openItems)
  // HOW TO ADDRESS THE PERSON, just before what they said, and only when they have set a
  // part. The session-start hook prints this opening as it is, so the hook says it too.
  const address = howToAddressThePersonLine(body.person)
  if (address !== null) lines.push(address)
  for (const one of body.words.slice(0, HEAD_WORDS)) {
    lines.push(`The person said, and it still governs: ${one.words.replace(/\s+/g, ' ').slice(0, 300)}`)
  }
  lines.push(
    `The whole brief is ${String(body.size.characters)} characters, about ${String(body.size.tokensEstimated)} tokens by estimate, ` +
      'at GET /api/brief.' +
      (body.leftOut.length > 0
        ? ` It left ${String(body.leftOut.length)} thing${body.leftOut.length === 1 ? '' : 's'} out and names each one.`
        : ' Nothing was left out.'),
  )
  lines.push(body.whatWouldBeLost)
  // THE TOOLSET SENTENCE, from src/shared/toolset.ts and never typed here.
  lines.push(THE_TOOLSET_SENTENCE)
  lines.push('What contradicts itself is GET /api/project/bootstrap.')
  return lines.join('\n')
}

const briefQuery = z.strictObject({ [SECOND_LEVEL_PARAM]: z.literal(SECOND_LEVEL_SHOW).optional() })

export async function briefRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/brief',
    route(
      'project.brief',
      'remote',
      'EVERYTHING AN ARRIVING AGENT HAS TO BE TOLD, IN ONE READ: this project\'s modules, each with its ' +
        'name, state and first curated sentence (GET /api/records/<id> reads the whole module), the open work in the order the attention rule puts it, ' +
        'the last ten decisions with the fork each settled and the words it stands on, WHAT WAS ' +
        'DECIDED SINCE THIS CALLER LAST RAN, the rules for writing here, and what the owner has said ' +
        'that still governs. The since-you-last-ran reading is measured over the runs filed under the ' +
        'name you are writing under, and needs x-mole-office-session naming your own run; without it, ' +
        'and on a first run, it says so and the ten newest stand. It measures itself in ' +
        'characters and in estimated tokens, and when it is over budget it drops the least valuable ' +
        'part and names in `leftOut` what it dropped and the request that fetches it back. It is not ' +
        'GET /api/project/bootstrap, which answers what is true of the project and what contradicts ' +
        'itself; this answers what to work on and how to write. The rules for writing give the facts; ' +
        `?${SECOND_LEVEL_PARAM}=${SECOND_LEVEL_SHOW} adds what the headers prove, every governed act and what a warrant is.`,
    ),
    async (req) => {
      const query = parse(briefQuery, req.query, `The brief takes one option, ${SECOND_LEVEL_PARAM}=${SECOND_LEVEL_SHOW}:`)
      const workspaceId = workspaceOf(req)
      const actor = actorFrom(req, { proveOwnRun: true })
      // THE ATTENTION RULE RUNS FIRST, ON ITS OWN THREAD, and the rest is read after it (`theReadingOpenWorkIsRankedBy`).
      const ranking = await theReadingOpenWorkIsRankedBy(workspaceId)
      // EVERY PROPOSAL OF EVERY PROJECT, READ ONCE for the three parts of the brief that ask which forks
      // are settled. Each read it for itself before, three times in one brief.
      const forks = readForks()
      // THE OPEN LOOPS AND THE BRIEF EACH NARROW A LONG LIST OF MESSAGES FOR AN AGENT, and the narrowing is worked out once.
      return withEachNarrowingWorkedOutOnce(() =>
        theBriefFor(workspaceId, actor, forks, openLoopsFor({ workspaceId, reader: theMessageReader(actor), forks }), ranking, query[SECOND_LEVEL_PARAM] === SECOND_LEVEL_SHOW),
      )
    },
  )
}

/** The brief's words for a person whose form of address is not set. Exported so that a test reads them here (round 130). */
export const HOW_TO_ADDRESS_THE_PERSON_IS_NOT_SET = 'How this person wishes to be addressed is not set.'

/**
 * THE BRIEF FOR ONE CALLER, worked out from what is stored now. `GET /api/brief` answers it, and
 * `GET /api/where-you-stand` answers it beside the waiting list and the open loops, from the same
 * `loops` it hands back as the open loops, so the two cannot disagree (src/server/api/where-you-stand.ts).
 * `ranking` is the attention rule's reading, worked out on its own thread before `loops` was read.
 */
export function theBriefFor(workspaceId: string, actor: Actor, forks: ForksRead, loops: OpenLoops, ranking: ReadOnTheThread, secondLevel = false) {
  const project = db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).get() ?? null
  const ranked = rankOpenWork(loops, ranking)
  const modules = modulesIn(workspaceId)
  const decisions = decisionsIn(workspaceId, forks)
  const sinceYouRan = decidedSinceYouLastRan(workspaceId, actor, forks)

  // THE NOTEBOOK OF THE AGENT THIS BRIEF IS BEING READ FOR. Criterion N1.
  //
  // WHO THAT IS COMES FROM THE ACTOR HEADERS AND FROM NOTHING ELSE. The brief takes no options
  // on purpose, and adding one naming an agent would be a second way to say who is reading —
  // two facts about one thing, free to disagree. A caller that is not an agent (the person in a
  // browser, a tool writing under its own tool name) has no notebook, and the block says that
  // rather than drawing an empty one.
  const readFor = actor.type === 'agent' ? actor.id : null
  const notebook = readFor === null ? null : theNotebookFor(workspaceId, readFor)
  // AND ITS MEMORY, WHEN IT IS A RESIDENT. Not on the ladder either, for the notebook's reason.
  const memory = theMemoryOf(readFor, actor)
  // AND WHAT EACH SECRETARY DOES IN THIS PROJECT, read in one statement (wave 13s round 92). The reader's own duties are
  // the record naming its registry id. Not on the ladder, for the notebook's reason.
  const dutiesReader = readFor === null ? null : participantForActor(actor)
  const duties = theDutiesPartFor(workspaceId, dutiesReader?.kind === 'agent' ? dutiesReader.id : null)
  // Without a named or proved run this is not a run's start, so no purpose part is added.
  const runId = actor.ownKeyRun ?? actor.sessionId
  const run = runId === null || runId === undefined ? null : getRecord(runId)
  const purpose = run === null || run.kind !== 'session' || run.workspaceId !== workspaceId || run.deletedAt !== null ? null : thePurposeOfARound(run)
  const askAbout = [...decisions.map((one) => one.id), ...ranked.map((one) => one.id)]
  const their = hisWords(workspaceId, askAbout, theMessageReader(actor))
  const person = thePersonThisOfficeIsFor()
  const aQuestionFromThePerson = theRuleForAQuestion()
  const newInYourGroups = theGroupNewsOfTheBrief(actor, theMessageReader(actor))

  // ---- the body, and then the ladder, and then the body's own size.
  const leftOut: { rung: string; what: string; ask: string; howMany: number }[] = []
  let words = their.words
  let carriedLoops = ranked
  let carriedDecisions = decisions

  const wordDisclosure = (): {
    subtraction: LeftOutCounts
    leftOutGroups: LeftOutGroup<BriefWordsBucket>[]
  } => {
    const count = their.words.length - words.length
    const leftOutGroups: LeftOutGroup<BriefWordsBucket>[] = [{
      cause: 'budget',
      bucket: 'word_list_budget',
      count,
      ids: their.words.slice(words.length).map((one) => one.id),
    }]
    const shortenedIds = words.filter((one) => one.wasCut === true).map((one) => one.id)
    const shortened: DroppedFields[] = shortenedIds.length === 0
      ? []
      : [{ cause: 'budget', ids: shortenedIds, droppedFields: ['words'] }]
    const subtraction: LeftOutCounts = {
      candidates: their.words.length,
      carried: words.length,
      leftOut: count,
      shortened: shortenedIds.length,
    }
    checkSubtraction('brief the person\'s words', subtraction, leftOutGroups, shortened)
    return { subtraction, leftOutGroups }
  }

  const bodyNow = (): Record<string, unknown> => ({
    // FIRST, AND NOT ON THE LADDER BELOW. The three things this brief drops when it is too long
    // are the person's words, unranked loops and warrant words; the notebook is not
    // among them and must never be. A brief that quietly dropped the secretary's character
    // would hand back a different secretary with nothing saying so.
    notebook: {
      agent: readFor,
      isThere: notebook !== null,
      recordId: notebook === null ? null : notebook.id,
      entries: notebook === null ? null : notebook.entries,
      note:
        readFor === null
          ? 'This brief was not read for an agent, so no notebook was looked for. Send ' +
            'x-mole-office-actor-type: agent and x-mole-office-actor-id: <your handle>.'
          : notebook === null
            ? 'No notebook has been written for this agent. That is an absence and not an answer: ' +
              'how this person works and what this agent is like are not recorded, so do not invent them.'
            : 'The whole notebook, newest entry first in the opening. It is what makes this agent ' +
              'this person\'s secretary, and it is handed over before anything else on every run and ' +
              'on every model.',
    },
    memory,
    secretaryDuties: duties,
    ...(purpose === null ? {} : { purpose }),
    project:
      project === null
        ? null
        : { id: project.id, title: project.title, note: project.note, modules: modules.length },
    modules,
    // WHERE THE REST OF EACH MODULE IS. The brief carries a module's name, state and one line; this
    // says what it holds besides, and the requests that read it.
    modulesSecondLevel: {
      line:
        'A module\'s line is the first sentence of its curated summary, or of the first written block of its long ' +
        'form when it has no summary; `lineFrom` says which. Null means it has no summary and no written block in its long form. A line is never ' +
        `taken from the module's context, and one longer than ${String(MODULE_LINE_CHARACTERS)} characters is cut and says so.`,
      held: ['context', 'the whole summary', 'summaryBlocks, the long form', 'parts, the checklist', 'paths'],
      ask: {
        oneModule: 'GET /api/records/<the module id>',
        everyModule: 'GET /api/records?kind=module&limit=25, then &offset=25 for the next page',
      },
    },
    openWork: {
      order:
        'The attention rule first, in its own order, then the rest by when they last changed. ' +
        'Every row says which of the two put it where it is.',
      loops: carriedLoops,
      leftOutByTheOpenLoopsReading: {
        groups: loops.leftOut.map((group) => ({
          bucket: group.bucket,
          sentence: group.sentence,
          count: group.count,
        })),
        note:
          'The ids in each group are not carried here. There were more of them than the rest of ' +
          'this reply put together, and an arriving agent that wants one asks GET /api/open-loops, ' +
          'which carries every id in every bucket.',
      },
      counts: loops.counts,
      whoseMove: loops.whoseMove,
    },
    decisions: carriedDecisions,
    decidedSinceYouLastRan: sinceYouRan,
    // NOT ON THE LADDER: one rule, read from the chapter, and the opening prints it.
    aQuestionFromThePerson: theRuleInTheBody(aQuestionFromThePerson),
    // NOT ON THE LADDER EITHER, because it is already cut to a few groups and a few messages.
    newInYourGroups,
    writing: theRulesForWriting(secondLevel),
    // HOW THE PERSON WISHES TO BE ADDRESSED. Not on the ladder: it is a few words, and an agent
    // that was not told would address them however it guessed.
    thePerson:
      person === null
        ? { isThere: false, note: `No person in this installation answers to "${THE_PERSON}".` }
        : {
            isThere: true,
            ...person,
            note:
              Object.keys(person.addressAs).length === 0
                ? `${HOW_TO_ADDRESS_THE_PERSON_IS_NOT_SET} That is an absence, so do not invent a form of address.`
                : `\`addressAs\` is ${WHAT_ADDRESS_AS_MEANS}`,
          },
    hisWords: {
      words,
      messagesWithNoRecordedSender: their.messagesWithNoRecordedSender,
      note:
        'The person\'s messages and the warrants agents are still acting on. Messages filed before Mole ' +
        'Office stored a message\'s sender carry no sender, so they are not counted here; their number ' +
        'is beside this sentence, because not counted is not the same as none.',
    },
    leftOut,
    ...wordDisclosure(),
    alsoAsk: {
      whatIsTrueAndWhatContradictsItself: 'GET /api/project/bootstrap',
      everyEndpoint: 'GET /api',
      theShapeOfAKind: 'GET /api/kinds',
      theWholeOfOneRecord: 'GET /api/records/<id>',
    },
  })

  const measure = (body: Record<string, unknown>): { characters: number; bytes: number; tokens: number } => {
    const text = JSON.stringify(body)
    return {
      characters: text.length,
      bytes: Buffer.byteLength(text, 'utf8'),
      tokens: tokensEstimatedFor(text.length),
    }
  }

  const fits = (): boolean => measure(bodyNow()).tokens <= BRIEF_TOKEN_BUDGET
  for (const rung of THE_LADDER) {
    if (fits()) break
    if (rung.rung === 'the-persons-words') {
      const before = words.length
      words = words.map((one) =>
        one.words.length > THEIR_WORDS_CHARACTERS
          ? { ...one, words: one.words.slice(0, THEIR_WORDS_CHARACTERS), wasCut: true as const }
          : one,
      )
      if (!fits()) words = words.slice(0, Math.max(1, Math.floor(words.length / 2)))
      leftOut.push({ ...theRungAsWritten(rung), howMany: before - words.length })
      continue
    }
    if (rung.rung === 'unranked-loops') {
      const before = carriedLoops.length
      carriedLoops = carriedLoops.filter((one) => one.rank !== null)
      leftOut.push({ ...theRungAsWritten(rung), howMany: before - carriedLoops.length })
      continue
    }
    const before = carriedDecisions.filter(
      (one) => one.onThePersonsWords !== null && one.onThePersonsWords.warrant.words.length > WARRANT_WORDS_CHARACTERS,
    ).length
    carriedDecisions = carriedDecisions.map((one) =>
      one.onThePersonsWords === null || one.onThePersonsWords.warrant.words.length <= WARRANT_WORDS_CHARACTERS
        ? one
        : {
            ...one,
            onThePersonsWords: {
              ...one.onThePersonsWords,
              warrant: {
                ...one.onThePersonsWords.warrant,
                words: one.onThePersonsWords.warrant.words.slice(0, WARRANT_WORDS_CHARACTERS),
              },
            },
            wordsWereCut: true as const,
          },
    )
    leftOut.push({ ...theRungAsWritten(rung), howMany: before })
  }

  // The size of this reply, counted on this reply. Two passes, because writing the count into
  // the body changes the body's length by the digits of the count; the second pass measures the
  // body the caller actually receives. When the two disagree the reply says so rather than
  // publishing a number that is not the one on the wire.
  const body = bodyNow()
  const first = measure(body)
  const size: BriefSize = {
    characters: first.characters,
    bytes: first.bytes,
    tokensEstimated: first.tokens,
    charsPerTokenAssumed: CHARS_PER_TOKEN,
    budgetTokensEstimated: BRIEF_TOKEN_BUDGET,
    fits: first.tokens <= BRIEF_TOKEN_BUDGET,
    openingCharacters: 0,
    tokensAreAnEstimate: theTokenEstimateSentence(),
  }
  const withSize = { ...body, size }
  const second = measure(withSize)
  size.characters = second.characters
  size.bytes = second.bytes
  size.tokensEstimated = second.tokens
  size.fits = second.tokens <= BRIEF_TOKEN_BUDGET
  const head = briefHead({
    project: project === null ? null : { title: project.title },
    modules,
    loops: carriedLoops,
    words,
    size,
    leftOut,
    notebook: { agent: readFor, entries: notebook === null ? null : notebook.entries },
    duties,
    purpose,
    person,
    aQuestionFromThePerson,
    whatWouldBeLost: theLineForWhatWouldBeLost(),
    newInYourGroups,
    openItems: readFor === null ? null : theOpenItemsSentenceForTheCaller(actor),
  })
  size.openingCharacters = head.length
  return { ...withSize, head }
}
