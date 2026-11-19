// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A FRESH AGENT NEEDS TO KNOW, IN ONE READ, INSTEAD OF RECONSTRUCTING IT BY ARCHAEOLOGY.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY SECTION SAYS WHY IT IS HERE
 * ---------------------------------------------------------------------------------------
 *
 * A section is to be chosen by measuring how agents really read the office. Nothing has measured any
 * yet — the request log started recording on 26 August 2026 and there is no series to read. So this
 * ships the RULE and the SHAPE, and every section of the reply carries `chosen_by` saying on what
 * authority it is in here:
 *
 *   `assumed`                          nobody has measured this and it is promotable when somebody does
 *   `measured (13 of 20)`              at least half of the last twenty cold recoveries read its operation
 *   `required by the brief`            true of `open_problems` alone, whatever the evidence says
 *   `no single operation answers this` no single-purpose evidence source exists OR EVER WILL
 *   `no operation answers this yet`    an operation is expected and is not built
 *
 * THE LAST TWO ARE NOT THE SAME WORD TWICE. `now` is computed from records and links, so no single
 * route will ever answer it and it can never say `measured`; it is in the reply all the same, built
 * by the assembler out of readers that each answer something narrower. `work_domains` is waiting on
 * another thread's route. An agent reading the reply has to be able to tell a section that will
 * never be promotable from one that is waiting, or it cannot tell temporary emptiness from permanent
 * emptiness.
 *
 * TODAY NO SECTION SAYS `measured`, and that sentence is in the reply rather than only in a design
 * document.
 *
 * ---------------------------------------------------------------------------------------
 * AN ABSENT SECTION AND AN EMPTY ONE ARE DIFFERENT FACTS
 * ---------------------------------------------------------------------------------------
 *
 * A slot this read does not fill is ABSENT from the reply and named in `missing`, never returned as
 * `[]`. An empty list says *there are none*, which about a reader nobody ran is a fabricated
 * completion. `missing` is a list of OBJECTS and not of names, because *Mole Office looked and there is
 * nothing* and *Mole Office did not look* are two facts and a bare string gives them one shape.
 *
 * AND `chosen_by` AND `missing` COME FROM ONE DECLARATION, so the reply cannot announce a section it
 * does not carry. It did: twelve announced, four carried, five in neither. `BOOTSTRAP_SECTIONS`
 * below is now the only list, every row says whether it is delivered, and
 * `tests/bootstrap-shape.test.ts` walks the real reply against it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT MUST NOT DO, AND THE TEST THAT HOLDS IT
 * ---------------------------------------------------------------------------------------
 *
 * A faster bootstrap that hides contradictory durable truth is a regression. So `open_problems`
 * carries EVERY problem whose state is not `fixed`, with its state exactly as stored — including
 * null, returned as null. `tests/bootstrap-hides-nothing.test.ts` compares the id set against a
 * direct `listRecords()` call in process, with three mutations that must all go red.
 */
import type { FastifyInstance } from 'fastify'
import { anOfficeId } from '../lib/ids.ts'
import { resolve } from 'node:path'
import { z } from 'zod'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { actorFrom, workspaceFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { aChangeNamingNoneOf, filedInOrInTheViewOf, getRecord } from '../lib/records.ts'
import { resolveSessionRef } from '../lib/resolve-session-ref.ts'
import { PanelError } from '../lib/panel-error.ts'
import { theFlowRunOf } from '../lib/flow-runs.ts'
import { everyMessageHiddenFrom, theMessageReader } from '../lib/messages.ts'
import { resolveProject } from '../lib/onboarding.ts'
import { route } from '../lib/route.ts'
import { db } from '../db/client.ts'
import { changes, records, usageChecks } from '../db/schema.ts'
import { callIdOf } from '../lib/usage.ts'
import { contradictionsFor, type CheckReading, type UnfixedProblem } from '../lib/contradictions.ts'
import { assembleContinuation, type AssembledPart } from '../lib/continuation.ts'
import type { ScopeName } from '@shared/bundles.ts'
import type { Reference } from '@shared/reference.ts'
import { PROMOTE_OVER } from '@shared/ops.ts'
import { localStamp } from '@shared/time.ts'
import { NARROWED_BY_PERMISSION } from '@shared/disclosure.ts'

/** Why a section is in the reply. Five values, because fewer would lie. */
type ChosenBy =
  | 'assumed'
  | 'required by the brief'
  | 'no single operation answers this'
  | 'no operation answers this yet'
  | `measured (${number} of ${number})`

/**
 * WHY A SLOT IS NOT IN THE REPLY. THREE REASONS, AND THEY ARE NOT THREE SPELLINGS OF ONE.
 *
 * `reader-not-built`       nothing in this tree computes it. The kind may exist; the reader does not.
 * `reader-not-called-here` a live route answers it and THIS reply does not call it. `ask` names the
 *                          request, so an agent told this is told what to do about it.
 * `nothing-computes-it`    no reader is coming, because there is nothing to compute it from.
 *
 * The middle one is the honest word for a section this read chose not to carry, and it is a
 * different fact from the first. An agent that read `reader-not-built` against `forks` would
 * conclude Mole Office cannot answer what is waiting on a person, which is false and would send it to
 * work the answer out for itself.
 */
type MissingWhy = 'reader-not-built' | 'reader-not-called-here' | 'nothing-computes-it'

/** A slot Mole Office did not fill, and the reason, which is never the same as an empty list. */
interface MissingSlot {
  slot: string
  why: MissingWhy
  /** The request that answers it, present only when one exists. Never a guess. */
  ask?: string
}

/**
 * EVERY SECTION OF THIS REPLY, DECLARED ONCE — WHETHER IT IS DELIVERED, AND WHY IT IS IN OR OUT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY `chosen_by` AND `missing` BOTH COME FROM HERE
 * ---------------------------------------------------------------------------------------
 *
 * They used to be two lists. `chosen_by` announced twelve sections and the body carried four:
 * `now`, `owner_waiting`, `forks`, `open_loops` and `next` were announced, absent, and named in
 * neither. Three of them said `assumed`, which is the word for a section that IS in the reply. That
 * is the exact substitution `missing` exists to prevent, arriving through the field that announces
 * the reply's own honesty, on the read `.claude/skills/mole-office/SKILL.md` tells every fresh agent to
 * make first.
 *
 * Now there is one list and both are derived from it, so a section cannot be announced without
 * being either delivered or named as absent. `tests/bootstrap-shape.test.ts` walks the real reply
 * and holds that.
 *
 * ---------------------------------------------------------------------------------------
 * `measuredBy`: EACH SECTION'S ONE PROMOTABLE EVIDENCE SOURCE, OR NULL
 * ---------------------------------------------------------------------------------------
 *
 * A section whose `measuredBy` is null CAN NEVER SAY `measured`, and that is the whole of the rule's
 * input. The alternative — every section promoted from whatever read happened to be nearby — would
 * mark the not-fixed problem list *measured* because agents listed records for any reason at all.
 *
 * THE NAME MUST BE A LIVE OPERATION SERVED BY EXACTLY ONE ROUTE. `runtime.resources` is served by
 * six, so a section pointed at it would be promoted by an agent calling something else entirely.
 * A test deleted on 13 November 2026 held both halves.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIFTEEN ARE `design/round-ten/design/telemetry.md` §12.3'S FIFTEEN
 * ---------------------------------------------------------------------------------------
 *
 * The code declared twelve of them and `messages`, `runtime` and `migrations` were in no part of
 * the reply at all — not the body, not `chosen_by`, not `missing` — so an agent could not tell that
 * this read had considered them. They are declared here as absent, with the request that answers
 * each where one exists, which is a fact rather than a plan.
 */
export const BOOTSTRAP_SECTIONS: readonly {
  section: string
  measuredBy: string | null
  chosenBy: ChosenBy
  /** True when the body carries a key of this name. False means it is named in `missing`. */
  delivered: boolean
  why?: MissingWhy
  ask?: string
}[] = [
  { section: 'project', measuredBy: null, chosenBy: 'no single operation answers this', delivered: true },
  // ---- WHERE THE WORK IS NOW: the sequences of work, each with how far through it is.
  //
  // IT WAS ABSENT AND NAMED `reader-not-built` UNTIL 6 SEPTEMBER 2026, and by then the reader
  // existed. The assembler's `campaign` part counts a pipeline's steps through
  // `readOnePipelinesBlocks`, which is the reader the pipeline page uses. This reply asks for that
  // part now, so a cold start, a copy scoped to one pipeline and a whole-project copy cannot come
  // to three different views of how far a pipeline has got. Criterion B4 of
  // design/bundle/ACCEPTANCE.md, which is the owner's own acceptance sentence for problem 10.
  { section: 'now', measuredBy: null, chosenBy: 'no single operation answers this', delivered: true },
  // ---- WHAT IS WAITING ON A PERSON, COUNTED AS THIS PROJECT'S OPEN FORKS. §12.3's table names
  // `project.needs-you` because the section was to hold everything the governance queue holds.
  // The section counts this project's open forks only (the assembler's `waitingOnYou` part reads
  // `readForks`), and no operation answers that set. `project.needs-you` adds card requests and
  // admissions. `project.forks` lists the open forks of every project. `project.waiting` adds
  // everything else whose move is the person's. So by §12.2's rule the section can never say
  // `measured`: an operation that half-answers it would promote it on evidence about another
  // question. Measured in
  // tests/what-waits-is-answered-by-the-door-that-answers-it.test.ts.
  { section: 'owner_waiting', measuredBy: null, chosenBy: 'no single operation answers this', delivered: true },
  {
    section: 'forks',
    measuredBy: 'project.forks',
    chosenBy: 'assumed',
    delivered: false,
    why: 'reader-not-called-here',
    ask: 'GET /api/forks',
  },
  { section: 'open_problems', measuredBy: null, chosenBy: 'required by the brief', delivered: true },
  {
    section: 'open_loops',
    measuredBy: 'project.open-loops',
    chosenBy: 'assumed',
    delivered: false,
    why: 'reader-not-called-here',
    ask: 'GET /api/open-loops',
  },
  {
    // `measuredBy` IS NULL, FOR TWO REASONS. §12.3's table names `agent.inbox`, and §12.2's rule
    // refuses it: it is served by two routes (GET /api/agent/inbox and GET /api/agent/marks), so an
    // agent calling either would promote a section about the other one. And GET /api/agent/inbox
    // lists only conversation messages, never a message record, so it does not answer this section.
    // `handle.waiting` is one route, but it answers one agent's queued messages in every project,
    // not this project's queued count. Same reason as `project` and `runtime`.
    //
    // `ask` IS THE DOOR AN AGENT READS FOR THE MESSAGES WAITING FOR IT: the message records with a
    // delivery to it still marked queued, in every project. It used to name GET /api/agents/inbox,
    // a path no route serves. tests/a-worker-reads-its-messages-at-the-waiting-door.test.ts measures
    // which door lists a supervisor's message to a worker.
    section: 'messages',
    measuredBy: null,
    chosenBy: 'no single operation answers this',
    delivered: false,
    why: 'reader-not-called-here',
    ask: 'GET /api/handles/<your handle>/waiting',
  },
  { section: 'checks', measuredBy: null, chosenBy: 'no single operation answers this', delivered: true },
  {
    section: 'runtime',
    measuredBy: null,
    chosenBy: 'no single operation answers this',
    delivered: false,
    why: 'reader-not-called-here',
    ask: 'GET /api/resources',
  },
  {
    // NO ROUTE CALLS `previewMigration`, so there is no request to name. The slot is absent, the
    // reason says a reader exists and this reply does not reach it, and `ask` is left off rather
    // than filled with a route that does not exist.
    section: 'migrations',
    measuredBy: null,
    chosenBy: 'no single operation answers this',
    delivered: false,
    why: 'reader-not-called-here',
  },
  { section: 'recent', measuredBy: null, chosenBy: 'no single operation answers this', delivered: true },
  // ---- THE THREE THE ASSEMBLER OWNS. They were absent, and named `reader-not-built`, for as long
  // as `src/server/lib/continuation.ts` did not exist. It does, this reply calls it, and each of
  // the three names the reader the assembler called. `no single operation answers this` is the
  // right word for all three: no route answers *what a cold agent needs under this heading* — the
  // assembler composes it out of a reader that answers a narrower question.
  { section: 'work_domains', measuredBy: null, chosenBy: 'no single operation answers this', delivered: true },
  { section: 'placeholders', measuredBy: null, chosenBy: 'no single operation answers this', delivered: true },
  { section: 'checkpoint', measuredBy: null, chosenBy: 'no single operation answers this', delivered: true },
  { section: 'next', measuredBy: null, chosenBy: 'no single operation answers this', delivered: false, why: 'nothing-computes-it' },
  // ---- THE CALLING RUN'S FLOW RUN. Wave 1 of the office flow, M1 (report 4IoRUKizcZXb, section 4): the run that
  // asks reads which flow it is following and the steps recorded so far. `measuredBy` is null because
  // GET /api/sessions/<id>/flow-run answers one run by id, not "the run that is asking".
  { section: 'this_run', measuredBy: null, chosenBy: 'required by the brief', delivered: true },
]

/**
 * THE SLOTS THIS READ DID NOT FILL, EACH WITH ITS REASON, DERIVED FROM THE ONE DECLARATION ABOVE.
 *
 * THREE SLOTS LEFT THIS LIST ON 27 AUGUST 2026, and the paragraph that used to be here explaining
 * why they were in it is worth keeping as a record of what changed. `work_domains`, `placeholders`
 * and `checkpoint` were absent because *"they belong to the shared continuation assembler, and
 * THAT ASSEMBLER DOES NOT EXIST"*. The kinds existed; what was missing was the reader that decides
 * which members go in a cold-start reply, how many, and in what order. Writing that rule here
 * would have put it in two places the day the assembler landed.
 *
 * `src/server/lib/continuation.ts` is now that reader, this reply calls it, and each of the three
 * sections names the function the assembler called. Nothing here decides what goes in them.
 */
const MISSING: readonly MissingSlot[] = BOOTSTRAP_SECTIONS.filter((s) => !s.delivered).map((s) => ({
  slot: s.section,
  why: s.why ?? 'reader-not-built',
  ...(s.ask === undefined ? {} : { ask: s.ask }),
}))

/**
 * THE KEYS OF THE BODY THAT ARE NOT SECTIONS, so a gate can tell a section from the reply's own
 * bookkeeping. `of_problems` is a count that belongs to `open_problems`, and the other three are
 * this reply talking about itself.
 */
export const BOOTSTRAP_META_KEYS: readonly string[] = [
  'of_problems',
  'missing',
  'chosen_by',
  'note',
  /*
   * THE FIRST SENTENCE, AND THE REQUEST'S OWN ANSWER ABOUT WHICH PROJECT WAS NAMED. They are this
   * reply's bookkeeping rather than sections of the project, and they are here so the shape gate
   * above can tell them from a section this route forgot to announce. A caller that sends no
   * workspace header must be told in the FIRST sentence that no project
   * was named, so an answer about the empty default cannot read like an answer about a real project.
   */
  'firstSentence',
  'asked',
  /*
   * NOT THIS REPLY'S OWN BOOKKEEPING — the field EVERY reply carries, written by the
   * `sayWhetherPermissionNarrowedIt` preSerialization hook in `src/server/lib/http.ts` rather than
   * by this handler. It is here because the gate above cannot tell an envelope field from a section
   * this route forgot to announce, and it would be wrong for it to: a section arriving with no
   * `chosen_by` entry is exactly what that gate is for.
   *
   * IMPORTED RATHER THAN SPELLED OUT. `NARROWED_BY_PERMISSION` is the one declaration of the name;
   * a fifth string typed by hand here would go silently stale the day the hook renames it, and this
   * list going stale means a real unannounced section passes.
   */
  NARROWED_BY_PERMISSION,
]

/**
 * THE ONE OPTION: the working directory, when the caller did not name a project.
 *
 * A caller in a directory it has never been in before sends the directory and gets the project whose
 * registered repository root or work area holds it. Nothing matched is an absence and the read
 * refuses rather than answering about the default.
 */
const bootstrapQuery = z.strictObject({
  directory: z
    .string({ error: 'directory is the absolute path this session was started in' })
    .trim()
    .min(1, { error: 'directory must not be empty — leave it out rather than sending spaces' })
    .optional(),
})

export async function bootstrapRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/project/bootstrap',
    route(
      'project.bootstrap',
      'remote',
      'Everything a fresh agent needs before it does anything: what this project is, what is waiting on ' +
        'the owner, every problem that is not fixed, and what Mole Office has noticed contradicting itself. ' +
        'Every section says on what authority it is in the reply, and a section this read does not fill is ' +
        'ABSENT and named in `missing` rather than returned empty — with the reason, and, where a route ' +
        'answers it, the request that does. When the request names no project, the FIRST sentence says so; ' +
        'when it names a working directory instead, the answer is matched against every repository root and ' +
        'work area registered to each project, and a directory that matches nothing is refused rather than ' +
        'answered from the default.',
    ),
    async (req) => {
      const claim = workspaceFrom(req)
      const q = parse(bootstrapQuery, req.query, 'The bootstrap read takes no other options:')
      const directory = q.directory === undefined ? null : resolve(q.directory)
      const resolved = resolveProject(claim, directory)
      if (resolved.id === null) {
        // NOTHING MATCHED IS REFUSED, NOT ANSWERED. Falling back to the default project here is how a
        // new agent came to believe it was in a project that holds nothing. The refusal names no
        // project and asks which one.
        throw new PanelError(resolved.because, 400)
      }
      const workspaceId = resolved.id
      const contradictions = contradictionsFor(workspaceId)
      // ONE ROW PER CHECK PER BOOTSTRAP CALL. A check compares two durable sources as they stand and
      // neither side keeps the history that would let it be recomputed for a past date, so storing
      // the answer is the only way to have this fact at all. `passed` is stored as null when the
      // check could not run: absence here is "nobody looked", not "nothing was wrong".
      writeCheckRows(contradictions.checks, callIdOf(req), traceOf(req))

      // ONLY WHAT THIS READER MAY READ IS COUNTED OR NAMED: the messages it may
      // not read are not in the counts and not the newest change. None of the parts the assembler is
      // asked for below reads a message, so it is not handed the reader.
      const reader = theMessageReader(actorFrom(req))
      const hidden = everyMessageHiddenFrom(reader, workspaceId)
      const hiddenList = JSON.stringify(hidden)
      const counts = db
        .select({ kind: records.kind, n: sql<number>`count(*)` })
        .from(records)
        // A PROJECT'S MESSAGES ARE ITS VIEW OF THE MESSAGE CENTRE; every other kind is filed in it.
        // They are found one way into the view at a time: asked as the view's rule, SQLite tested every message of the
        // office, 102 ms on the made-up office at the 22 October scale, and 23 ms this way (wave 13y round 107).
        .where(
          and(
            filedInOrInTheViewOf(workspaceId),
            isNull(records.deletedAt),
            sql`${records.id} NOT IN (SELECT value FROM json_each(${hiddenList}))`,
          ),
        )
        .groupBy(records.kind)
        .all()
      const noneHidden = aChangeNamingNoneOf(hidden)
      const newest = db
        .select({ at: changes.at, op: changes.op, recordId: changes.recordId })
        .from(changes)
        .where(noneHidden === undefined ? eq(changes.workspaceId, workspaceId) : and(eq(changes.workspaceId, workspaceId), noneHidden))
        .orderBy(desc(changes.at))
        .limit(1)
        .get()
      const recentReports = db
        .select({ id: records.id, title: records.title, updatedAt: records.updatedAt })
        .from(records)
        .where(and(eq(records.workspaceId, workspaceId), eq(records.kind, 'report'), isNull(records.deletedAt)))
        .orderBy(desc(records.updatedAt), desc(records.id))
        .limit(3)
        .all()

      // WHAT THE SHARED ASSEMBLER ANSWERS, ASKED ONCE.
      //
      // FOUR SECTIONS OF THIS REPLY ARE PROJECTIONS OF ONE READING, and that is the change: this
      // handler used to call `readForks` itself and to declare three sections absent because the
      // assembler did not exist. Context bundles are projections of the same reading, so what a
      // cold agent is told here and what an outside agent is handed in a copy cannot come to
      // different views of what is waiting on a person.
      const assembled = assembleContinuation({
        workspaceId,
        subject: { kind: 'project' },
        parts: BOOTSTRAP_PARTS,
        budgetBytes: BOOTSTRAP_ASSEMBLER_BYTES,
      })
      const partOf = (name: ScopeName): AssembledPart => {
        const found = assembled.parts.find((part) => part.name === name)
        // A SECTION THIS REPLY ANNOUNCES AND THE ASSEMBLER DID NOT RETURN IS A FAULT, not an empty
        // section. Returning `[]` here would be the substitution the whole reply is built against.
        if (found === undefined) throw new Error(`the continuation assembler returned no part called ${name}`)
        return found
      }

      return {
        // FIRST, AND IN THE REPLY, NOT ONLY IN A DESIGN DOCUMENT:
        // a caller that sends no workspace header must meet this sentence before it meets anything
        // that reads like a normal answer, so an answer about the empty default cannot be mistaken
        // for an answer about a real project. `resolveProject` wrote the sentence and the same one
        // is the first line of the onboarding read.
        firstSentence: resolved.because,
        asked: { workspaceHeader: claim.stated, directory },
        project: {
          id: workspaceId,
          records: counts.reduce((sum, row) => sum + row.n, 0),
          byKind: Object.fromEntries(counts.map((row) => [row.kind, row.n])),
          newestChange: newest === undefined ? null : { at: newest.at, op: newest.op, recordId: newest.recordId },
        },
        // WHERE THE WORK IS NOW, and it is the assembler's campaign part under the name this reply
        // has always announced. The section names the reader it came from, which is what lets a
        // person ask why this number and the pipeline page's number are the same one.
        now: sectionOf(partOf('campaign')),
        owner_waiting: ownerWaiting(partOf('waitingOnYou')),
        work_domains: sectionOf(partOf('workDomains')),
        placeholders: sectionOf(partOf('placeholders')),
        checkpoint: sectionOf(partOf('howItStands')),
        // EVERY PROBLEM THAT IS NOT FIXED, WITH NOTHING LEFT OUT AND NO STATE GUESSED. This is the
        // one section the brief requires whatever any measurement says.
        open_problems: contradictions.problems,
        of_problems: contradictions.ofProblems,
        checks: contradictions.checks,
        recent: recentReports.map((row) => ({ id: row.id, title: row.title, at: row.updatedAt })),
        this_run: theCallingRunsFlowRun(actorFrom(req).sessionId, workspaceId),
        missing: MISSING,
        chosen_by: Object.fromEntries(BOOTSTRAP_SECTIONS.map((s) => [s.section, s.chosenBy])),
        // THE HONEST STATE OF THIS READ, in the reply and not only in a design document.
        note:
          'No section of this reply says "measured". The rule that promotes one needs at least half of the last ' +
          `${String(PROMOTE_OVER)} cold recoveries to have read that section's one operation, and the request log ` +
          'has only just started recording, so there is no series to read yet.',
      }
    },
  )
}

/**
 * THE PARTS OF THE SHARED READING THIS REPLY IS A PROJECTION OF.
 *
 * `howItStands` IS THE CHECKPOINT. The assembler's name for the part is what the part is — where
 * the work stopped last — and `checkpoint` is the name this reply has always used for the section.
 * They are the same fact under two names, and the mapping is here, once, rather than a second
 * reader being written under the second name.
 */
const BOOTSTRAP_PARTS: readonly ScopeName[] = [
  'waitingOnYou',
  'workDomains',
  'placeholders',
  'howItStands',
  // `campaign` IS `now`. It is the part that says which sequences of work this project has and how
  // far through each one is, and `now` is the name this reply has always announced for that.
  'campaign',
]

/**
 * HOW MUCH OF THE 32 KB CEILING THE ASSEMBLED SECTIONS MAY SPEND, measured rather than chosen.
 *
 * The reply's ceiling is 32,768 bytes and `tests/bootstrap-shape.test.ts` holds it against a corpus
 * of fifty unfixed problems. These four sections carry ids, counts and one sentence each — not the
 * members' own words — so 8,192 is what they are given and each of them says what it left out.
 */
const BOOTSTRAP_ASSEMBLER_BYTES = 8 * 1024

/** One assembled section, as this reply carries it: what was found, named, and what answered it. */
interface AssembledSection {
  /** How many the reader found, before anything was cut. */
  found: number
  /**
   * EVERY ONE OF THEM, NAMED IN THE OWNER'S FOUR WORDS — kind, id, title and what it means here.
   *
   * IT WAS A LIST OF BARE IDS, and the comment above it argued for that: ids cost about four
   * hundred bytes where the members' own words cost fifteen kilobytes. The argument was about the
   * members' WORDS and it was right; it was read as an argument for an id with nothing beside it,
   * which is the owner's own counter-example — `93 records finished (id1, id2, id3...)`, register section 7.
   * A title and a kind cost tens of bytes each, not kilobytes. Criterion B18.
   */
  references: Reference[]
  /** The function the assembler called. A section that named none would be one nothing answered. */
  reader: string | null
  /** What it found and what it left out, in the assembler's own sentence. */
  note: string
}

/**
 * A SECTION MADE OF REFERENCES AND A SENTENCE, NEVER OF THE MEMBERS' OWN WORDS.
 *
 * The same choice `owner_waiting` made and for the same measured reason: twenty-six forks with
 * their questions, options and evidence is about fifteen kilobytes against a 32 KB ceiling. What
 * is carried is a reference each — the assembler's uncapped list, so no member is dropped without
 * being nameable — and `note` is the assembler's own sentence about what it carried and left out.
 */
function sectionOf(part: AssembledPart): AssembledSection {
  return { found: part.considered, references: part.allReferences, reader: part.reader, note: part.says }
}

/** What the governance queue holds, as this reply carries it. */
export interface OwnerWaiting {
  /** How many acts only a person can perform are waiting. Zero is a real answer and good news. */
  waiting: number
  /** How many of those are holding other work up, which is what says whether it matters today. */
  holdingWorkUp: number
  /** Every one of them, named in the owner's four words, so nothing here is a number a reader cannot open. */
  references: Reference[]
  note: string
}

/**
 * WHAT IS WAITING ON A PERSON, FROM THE ONE READING THAT ANSWERS IT.
 *
 * IT IS THE ASSEMBLER'S OWN READING NOW, not a second call to `readForks` from this file. The
 * sentence a person reads was written twice — once here and once for a context bundle — and the two
 * were free to disagree about what is waiting. `waitingSentence` in `src/server/lib/continuation.ts`
 * is the one place it is written.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS SECTION IS DELIVERED AND THE FOUR AROUND IT ARE NOT
 * ---------------------------------------------------------------------------------------
 *
 * It was announced as `assumed` — the word for a section that is IN the reply — and it was not in
 * the reply. An agent told `owner_waiting: assumed` and handed nothing cannot tell *nobody is
 * waiting* from *nobody looked*, which is the fifth invariant broken on the read built to uphold it.
 * A count of zero and an absent section are different facts, and this is the one of the five that
 * can be computed here, so it is computed.
 *
 * IDS AND NOT TITLES, DELIBERATELY. Twenty-six forks with their titles, questions and options is
 * about fifteen kilobytes on a reply with a 32 KB ceiling, and it would be a second copy of what
 * `GET /api/needs-you` already carries whole. Ids cost about four hundred bytes for the same corpus,
 * nothing here is a number a reader cannot open, and `note` names the request that carries the rest.
 * NOTHING IS CAPPED, so no fork is dropped without saying so.
 *
 * IT IS `readForks()` AND NOT A SECOND READING. `GET /api/needs-you` and `GET /api/forks` both
 * answer out of that function, and a third opinion about what is waiting on a person is exactly the
 * defect that would send an owner to an empty queue.
 */
function ownerWaiting(part: AssembledPart): OwnerWaiting {
  return {
    waiting: part.considered,
    holdingWorkUp: part.figures['holdingWorkUp'] ?? 0,
    references: part.allReferences,
    // THE PART COUNTS THIS PROJECT'S FORKS ONLY, and its sentence names no request because a copy
    // carries it too. This reply's reader has an API, so the note says where everything is.
    note: `${part.says} Everything waiting on the person is at GET /api/waiting.`,
  }
}

/** The trace this request named, or null. Read off the header because no handler resolves it. */
function traceOf(req: { headers: Record<string, unknown> }): string | null {
  const raw = req.headers['x-mole-office-trace']
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null
}

/** Store what each check said, at the moment it said it. The bootstrap handler is the only writer. */
function writeCheckRows(checks: readonly CheckReading[], callId: string | null, traceId: string | null): void {
  const atMs = Date.now()
  for (const check of checks) {
    db.insert(usageChecks)
      .values({
        id: anOfficeId(),
        atMs,
        callId,
        traceId,
        checkId: check.id,
        // NULL WHEN THE CHECK COULD NOT RUN, AND NEVER 0. A 0 says the check ran and found nothing
        // wrong; null says nobody looked. Storing 0 for an unrunnable check turns "nobody looked"
        // into "nothing was wrong", which is the one substitution this column exists to prevent.
        passed: check.passed === null ? null : check.passed ? 1 : 0,
        leftN: check.leftN,
        rightN: check.rightN,
      })
      .run()
  }
}

/** What the bootstrap says about a problem, exported so a test can hold the shape. */
export type BootstrapProblem = UnfixedProblem

/** When a stamp is wanted for a reply, it is made in one place. */
export const stampFor = (ms: number): string => localStamp(new Date(ms))

/**
 * THE FLOW RUN OF THE RUN THAT IS ASKING, by the run the request named. Wave 1 of the office flow, M1. One record
 * by the run's id. A request that named no run, a name that is no run, and a run with no flow run are each said
 * in a sentence, never answered with an empty record or with another run's.
 *
 * THE RUN IS FOUND ONLY BY `resolveSessionRef`, which reads it in the request's project, the rule every other door
 * that reads a run by its id keeps. A run of another project is answered with a sentence and nothing of it: until
 * wave 13p round 25b a bare id was taken before that check, and served another project's flow run (check
 * UD7dt6P3ISh6).
 */
function theCallingRunsFlowRun(sessionId: string | null | undefined, workspaceId: string): Record<string, unknown> {
  const asked = (sessionId ?? '').trim()
  if (asked === '') {
    return { run: null, flowRun: null, says: 'This request named no run, so there is no flow run to show. A run names itself with its session id.' }
  }
  const found = resolveSessionRef(asked, workspaceId)
  if (found.elsewhereIn !== null) {
    return {
      run: null,
      flowRun: null,
      says: `This request named the run "${asked}", which is a run of another project, "${found.elsewhereIn}". This read answers about "${workspaceId}" only, so it shows no flow run.`,
    }
  }
  const run = found.recordId
  if (run === null) {
    return { run: null, flowRun: null, says: `This request named the run "${asked}", and no session record answers to it, so there is no flow run to show.` }
  }
  const held = theFlowRunOf(run)
  if (held === null) {
    return {
      run,
      flowRun: null,
      says:
        `Run ${run} has no flow run. The office files one beside every run it files since wave 1 of the office flow; a ` +
        'run filed before that has none, and a run whose flow run could not be written has an open problem about it.',
    }
  }
  const record = getRecord(held.id)
  return { run, flowRun: record === null ? null : { id: record.id, ...record.data }, ask: `GET /api/sessions/${run}/flow-run` }
}
