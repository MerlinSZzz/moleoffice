// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPLY THAT LEAVES SOMETHING OUT SAYS HOW MANY AND OF WHAT KIND.
 *
 * ---------------------------------------------------------------------------------------------
 * THE RULE THIS SHAPE MAKES CHECKABLE
 * ---------------------------------------------------------------------------------------------
 *
 * From `design/round-ten/design/projections.md` §7.2:
 *
 *     The reader is never a reason. A reply may be narrowed by what the caller asked for, by a
 *     size budget, or by permission — and by nothing else. Every narrowing is declared in the same
 *     reply, as structure, and the arithmetic is checked rather than promised.
 *
 * Three causes are legal and one is not. `normal`, `developer` and `agent` are not causes: three
 * readers asking the same route with the same permission receive the same bytes, and what differs
 * is only what the browser draws. That is what lets an agent answer "what does the owner see on
 * this page?" — it holds both the content and the rule.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THE SHAPE IS SHARED AND THE BUCKET WORDS ARE NOT
 * ---------------------------------------------------------------------------------------------
 *
 * Three new callers subtract on purpose — a context bundle, a scoped continuation read, and any
 * reply narrowed by permission. Without one shape they would invent three, which is the addendum's
 * own instruction against parallel truth stores.
 *
 * The BUCKET is local to each read and closed within it. Each read declares its own bucket list
 * `as const` in `src/shared`, beside a total `Record<Bucket, string>` of the words, and passes the
 * union in as the type parameter here. A shared bucket list would be a taxonomy nobody asked for.
 * A bare `string` would delete a guard the product already has: `LEFT_OUT_SENTENCES`
 * (`src/server/lib/openloops.ts:119`) is total over its six buckets today, so a seventh bucket with
 * no words does not compile, and under `bucket: string` it would be `undefined` on a screen.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IS NOT HERE YET, AND WHERE IT GOES WHEN IT ARRIVES
 * ---------------------------------------------------------------------------------------------
 *
 * ONE EXISTING CALLER STILL HOLDS ITS OWN COPY OF THE ARITHMETIC. `openLoopsFor` throws on
 * `carried + leftOut !== candidates` at `src/server/lib/openloops.ts:545`, and its `LeftOutGroup`
 * at `:133` is a separate declaration of this shape: no `cause`, `ids` not nullable, and its own
 * `LeftOutBucket` alias rather than a type parameter. That is the same fact worked out in two
 * places and it is deliberate for one wave, not an oversight. **Wave 12 of
 * `design/ROUND-TEN-BUILD-PLAN.md` moves that caller onto this shape**, together with the eight
 * other replies that count without naming what they dropped. Until it does, do not add a second
 * arithmetic check anywhere: extend this one.
 *
 * THE FIELD-LEVEL RESTRICTION CHECK IS NOT BUILT AND MUST LAND IN THIS FUNCTION. §7.2 requires that
 * dropping a declared restriction path while keeping the path it restricts throws. The list of
 * `field path -> the path it restricts` is authored by the designs that own each pair —
 * `placeholder.md` §11's `allowedUses` and `disallowedClaims`, and `context-bundle.md`'s snapshot
 * pairs — and neither pair exists in this tree yet. An empty registry today would be a mechanism
 * built for a future that has not arrived, so there is none. **The check belongs in
 * `checkSubtraction` below**, added by whichever wave declares the first pair, because no count
 * over members can ever see a field come off one.
 */

import { readStoredWord } from './i18n.ts'

/**
 * THE FIELD EVERY REPLY CARRIES SAYING WHETHER PERMISSION TOOK ANYTHING OFF IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE NAME IS HERE AND NOT WRITTEN OUT AT EACH END
 * ---------------------------------------------------------------------------------------
 *
 * The server writes it (`sayWhetherPermissionNarrowedIt`, src/server/lib/http.ts), a test asserts it
 * over the whole route table, and any reader that comes to check it reads the same constant. A key
 * spelled out in three places is three chances to typo one of them, and the failure is silent in the
 * worst direction: a reader asking for `narrowedByPermision` finds `undefined` and reads it as
 * *nothing was withheld*.
 *
 * ---------------------------------------------------------------------------------------
 * NULL AND ABSENT ARE DIFFERENT, AND THIS IS THE FIELD THAT MAKES THEM DIFFERENT
 * ---------------------------------------------------------------------------------------
 *
 * `null` means MOLE OFFICE LOOKED AND PERMISSION TOOK NOTHING OFF THIS REPLY. Absent means the reply came
 * from something that does not carry the field at all — an array, a file's bytes, a refusal — and a
 * reader may conclude nothing from it. That is the same distinction `refused: null` already carries
 * on `GET /api/access` and the fifth engineering invariant, one layer down.
 */
export const NARROWED_BY_PERMISSION = 'narrowedByPermission'

/**
 * WHAT A REPLY SAYS WHEN PERMISSION DID TAKE SOMETHING OFF IT.
 *
 * `null` is *nothing was withheld*. A group is the same shape every other subtraction in this file
 * uses, with `cause: 'permission'` and therefore `ids: null` — the ids ARE the thing being withheld,
 * and `checkSubtraction` refuses a permission group that hands them over.
 *
 * Nothing in the product returns the non-null form today, and that is the honest state rather than
 * an omission: context scope in this phase has one value — another machine may work in every
 * project — so no read is narrowed by permission and every reply says `null`. The shape is declared
 * with the field so that the first read that DOES narrow has one to fill in rather than one to
 * invent.
 */
export type NarrowedByPermission<Bucket extends string = string> = LeftOutGroup<Bucket>[] | null

/**
 * Why a reply is smaller than the whole answer. The reader is never one of these.
 *
 * - `selection` — the caller asked a narrower question. Only a route whose question IS a selection.
 * - `budget` — the answer did not fit a declared ceiling.
 * - `permission` — the caller may not have it. The one cause that reaches a route that already
 *   exists, which is why its obligation sits on the reply rather than on a list of routes.
 */
export const LEFT_OUT_CAUSES = ['selection', 'budget', 'permission'] as const
export type LeftOutCause = (typeof LEFT_OUT_CAUSES)[number]

/*
 * WHAT EACH CAUSE MEANS TO A PERSON is one sentence per cause in src/shared/words/en.ts, under
 * `g2b.impl.leftOutMeans.<cause>`, with its Chinese in zh.ts. The page that draws a left-out group
 * reads it there through `t()`, and its key table is typed by `LeftOutCause`, so a fourth cause
 * without a sentence does not compile. A server reader would use `readStoredWord` on the same key.
 * There is no English copy here: the one this file held was read by nothing and was a second place
 * for the same three sentences (problem qdtawpOHQh-B).
 */

/** Members that are not on the reply at all, in one named bucket, with a cause. */
export interface LeftOutGroup<Bucket extends string = string> {
  cause: LeftOutCause
  /**
   * Which rule of that cause. THE CAUSE IS SHARED; THE BUCKET IS LOCAL — and local does not mean
   * loose. See BUCKET WORDS at the top of this file.
   */
  bucket: Bucket
  count: number
  /**
   * Every id in the bucket, so nothing is a number a person cannot open.
   *
   * NULL, NEVER `[]`, UNDER `permission`: the ids are the thing being withheld, and an empty array
   * reads as "none were left out" when the truth is "you are not being told which". Absence beats a
   * guess, and the two have to be different values. `checkSubtraction` refuses either mistake.
   */
  ids: string[] | null
}

/**
 * A SUBTRACTION THAT TOOK FIELDS OFF A MEMBER IT CARRIED, rather than dropping the member.
 *
 * This is a second kind of narrowing and it needs its own shape, because `LeftOutGroup`'s `ids` are
 * members that are GONE and its arithmetic is member arithmetic.
 * `design/round-ten/design/agent-coordination.md` §6.3 rule 3 already ships this over its share as
 * `"droppedFields": ["learned","drifted"]`, so the spelling is adopted rather than invented.
 */
export interface DroppedFields {
  cause: LeftOutCause
  /** Which carried members were shortened. Never null: these members ARE on the reply. */
  ids: string[]
  /** The field paths taken off each of them, relative to the member. */
  droppedFields: string[]
}

/** Carried beside the groups by every reply that can subtract. */
export interface LeftOutCounts {
  /** What the question could have carried, before any narrowing. */
  candidates: number
  carried: number
  /** The sum of every group's `count`, exactly, always. Members only — see `shortened`. */
  leftOut: number
  /**
   * How many CARRIED members were shortened. Deliberately outside the arithmetic above, because a
   * shortened member is carried: counting it as left out would make `carried + leftOut` wrong.
   */
  shortened: number
  /**
   * True when the read stopped at a scan limit before it reached every candidate, so `candidates` and `leftOut` are the
   * least there could be, not all there is; false when it saw every candidate. Left out by a read that never stops
   * early. Said in the counts themselves and not only in a note, so a reader of the numbers cannot take them as whole
   * (check FwwgzHBjpErx).
   */
  atLeast?: boolean
}

/**
 * The one check every subtracting read calls before it replies. It throws; it does not report.
 *
 * A reader that quietly dropped one member would otherwise report a shorter list as a complete
 * answer, which is the whole failure this shape exists to prevent. `openLoopsFor` has thrown on the
 * first of these rules since before this file existed, with the same reasoning written beside it.
 *
 * `where` names the read, so a throw says which reply was wrong rather than only that one was.
 */
export function checkSubtraction<Bucket extends string>(
  where: string,
  counts: LeftOutCounts,
  groups: readonly LeftOutGroup<Bucket>[],
  shortened: readonly DroppedFields[] = [],
): void {
  for (const [name, value] of [
    ['candidates', counts.candidates],
    ['carried', counts.carried],
    ['leftOut', counts.leftOut],
    ['shortened', counts.shortened],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${where}: ${name} is ${String(value)}, and a count of things is a whole number that is not negative.`)
    }
  }

  // THE ARITHMETIC. Every candidate is either carried or in exactly one group.
  if (counts.carried + counts.leftOut !== counts.candidates) {
    throw new Error(
      `${where} lost a record: ${String(counts.candidates)} candidates, ${String(counts.carried)} carried, ` +
        `${String(counts.leftOut)} left out.`,
    )
  }

  const inGroups = groups.reduce((sum, group) => sum + group.count, 0)
  if (inGroups !== counts.leftOut) {
    throw new Error(
      `${where} says ${String(counts.leftOut)} were left out and its groups account for ${String(inGroups)}. ` +
        'A count that no group explains is a number nobody can open.',
    )
  }

  for (const group of groups) {
    if (!Number.isInteger(group.count) || group.count < 0) {
      throw new Error(`${where}: bucket "${group.bucket}" has a count of ${String(group.count)}, which is not a whole number of things.`)
    }
    if (group.cause === 'permission') {
      // The ids ARE the thing being withheld. An empty array would read as "none were left out".
      if (group.ids !== null) {
        throw new Error(
          `${where}: bucket "${group.bucket}" was left out by permission and names its ids. ` +
            'A caller who may not have these records may not have their ids either. Send null.',
        )
      }
      continue
    }
    if (group.ids === null) {
      throw new Error(
        `${where}: bucket "${group.bucket}" was left out by ${group.cause} and names no ids. ` +
          'Only permission withholds ids; a selection and a budget both name every one.',
      )
    }
    if (group.ids.length !== group.count) {
      throw new Error(
        `${where}: bucket "${group.bucket}" says ${String(group.count)} were left out and names ` +
          `${String(group.ids.length)} of them.`,
      )
    }
  }

  const shortenedMembers = new Set<string>()
  for (const entry of shortened) {
    if (entry.ids.length === 0) {
      throw new Error(`${where}: a ${entry.cause} shortening names no member it shortened.`)
    }
    if (entry.droppedFields.length === 0) {
      throw new Error(
        `${where}: a ${entry.cause} shortening names no field it took off ${String(entry.ids.length)} member(s).`,
      )
    }
    for (const id of entry.ids) shortenedMembers.add(id)
  }
  if (shortenedMembers.size !== counts.shortened) {
    throw new Error(
      `${where} says ${String(counts.shortened)} carried members were shortened and names ` +
        `${String(shortenedMembers.size)}.`,
    )
  }
}

/**
 * The sentence one bucket's words make for the rows it left out. Each map below writes `{count}` where the
 * number goes, after a colon, so the sentence reads right for one row and for many.
 */
export function leftOutWords(words: string, count: number): string {
  return words.replace('{count}', String(count))
}

/** Why pieces of work are not on this read's reply. */
export const WORK_LIST_BUCKETS = ['row_limit'] as const
export type WorkListBucket = (typeof WORK_LIST_BUCKETS)[number]
export const WORK_LIST_BUCKET_WORDS: Readonly<Record<WorkListBucket, string>> = {
  row_limit: 'Pieces of work left out beyond this reply’s row limit: {count}.',
}

/** Why reviews are not on this read's reply. */
export const REVIEW_LIST_BUCKETS = ['row_limit'] as const
export type ReviewListBucket = (typeof REVIEW_LIST_BUCKETS)[number]
export const REVIEW_LIST_BUCKET_WORDS: Readonly<Record<ReviewListBucket, string>> = {
  row_limit: 'Reviews left out beyond this reply’s row limit: {count}.',
}

/** Why comments are not on this read's reply. */
export const COMMENTS_NOT_IN_BUCKETS = ['row_limit'] as const
export type CommentsNotInBucket = (typeof COMMENTS_NOT_IN_BUCKETS)[number]
export const COMMENTS_NOT_IN_BUCKET_WORDS: Readonly<Record<CommentsNotInBucket, string>> = {
  row_limit: 'Comments left out beyond this reply’s row limit: {count}.',
}

/** Why conversations are not on this read's reply. */
export const THREAD_LIST_BUCKETS = ['row_limit'] as const
export type ThreadListBucket = (typeof THREAD_LIST_BUCKETS)[number]
export const THREAD_LIST_BUCKET_WORDS: Readonly<Record<ThreadListBucket, string>> = {
  row_limit: 'Conversations left out beyond this reply’s row limit: {count}.',
}

/** Why marks are not on this read's reply. */
export const MARKS_BUCKETS = ['row_limit'] as const
export type MarksBucket = (typeof MARKS_BUCKETS)[number]
export const MARKS_BUCKET_WORDS: Readonly<Record<MarksBucket, string>> = {
  row_limit: 'Marks left out beyond this reply’s row limit: {count}.',
}

/** Why runs are not on this read's reply. */
export const RUN_LIST_BUCKETS = ['row_limit'] as const
export type RunListBucket = (typeof RUN_LIST_BUCKETS)[number]
export const RUN_LIST_BUCKET_WORDS: Readonly<Record<RunListBucket, string>> = {
  row_limit: 'Runs left out beyond this reply’s row limit: {count}.',
}

/** Why counter rows are not on this read's reply. */
export const COUNTER_ROWS_BUCKETS = ['row_limit'] as const
export type CounterRowsBucket = (typeof COUNTER_ROWS_BUCKETS)[number]
export const COUNTER_ROWS_BUCKET_WORDS: Readonly<Record<CounterRowsBucket, string>> = {
  row_limit: 'Rows of this counter left out beyond this reply’s row limit: {count}.',
}

/** Why versions of a record are not on the reply of its version history (listRevisions). */
export const REVISION_ROWS_BUCKETS = ['row_limit'] as const
export type RevisionRowsBucket = (typeof REVISION_ROWS_BUCKETS)[number]
export const REVISION_ROWS_BUCKET_WORDS: Readonly<Record<RevisionRowsBucket, string>> = {
  row_limit: 'Older versions of this record left out beyond this reply’s row limit: {count}.',
}

/** Why search results are not on this read's reply. */
export const SEARCH_RESULTS_BUCKETS = ['row_limit'] as const
export type SearchResultsBucket = (typeof SEARCH_RESULTS_BUCKETS)[number]
export const SEARCH_RESULTS_BUCKET_WORDS: Readonly<Record<SearchResultsBucket, string>> = {
  row_limit: 'Matching records left out beyond this reply’s row limit: {count}.',
}

/** Why recent recipients are not on this reply. */
export const RECIPIENTS_BUCKETS = ['recent_limit'] as const
export type RecipientsBucket = (typeof RECIPIENTS_BUCKETS)[number]
export const RECIPIENTS_BUCKET_WORDS: Readonly<Record<RecipientsBucket, string>> = {
  recent_limit: readStoredWord('g2b.impl.recipients.leftOut'),
}

/** Why session change rows are not on this reply. */
export const SESSION_WORK_BUCKETS = ['change_limit'] as const
export type SessionWorkBucket = (typeof SESSION_WORK_BUCKETS)[number]
export const SESSION_WORK_BUCKET_WORDS: Readonly<Record<SessionWorkBucket, string>> = {
  change_limit: readStoredWord('g2b.impl.sessionWork.leftOut'),
}

/** Why conversation messages are not on this inbox reply. */
export const INBOX_BUCKETS = ['message_limit'] as const
export type InboxBucket = (typeof INBOX_BUCKETS)[number]
export const INBOX_BUCKET_WORDS: Readonly<Record<InboxBucket, string>> = {
  message_limit: readStoredWord('g2b.impl.inbox.leftOut'),
}

/** Why owner-word entries are not on the brief's word list. */
export const BRIEF_WORDS_BUCKETS = ['word_list_budget'] as const
export type BriefWordsBucket = (typeof BRIEF_WORDS_BUCKETS)[number]
export const BRIEF_WORDS_BUCKET_WORDS: Readonly<Record<BriefWordsBucket, string>> = {
  word_list_budget: readStoredWord('g2b.impl.brief.wordsLeftOut'),
}

/** Why messages are not on an answer of the plugin read interface's talk view (src/server/lib/plugin-read.ts). */
export const PLUGIN_TALK_BUCKETS = ['message_limit'] as const
export type PluginTalkBucket = (typeof PLUGIN_TALK_BUCKETS)[number]
export const PLUGIN_TALK_BUCKET_WORDS: Readonly<Record<PluginTalkBucket, string>> = {
  message_limit: readStoredWord('pluginRead.talk.leftOut'),
}

/** Why withdrawals are not named on an answer of the plugin read interface's talk view (src/server/lib/plugin-read.ts). */
export const PLUGIN_TALK_WITHDRAWAL_BUCKETS = ['withdrawal_limit'] as const
export type PluginTalkWithdrawalBucket = (typeof PLUGIN_TALK_WITHDRAWAL_BUCKETS)[number]
export const PLUGIN_TALK_WITHDRAWAL_BUCKET_WORDS: Readonly<Record<PluginTalkWithdrawalBucket, string>> = {
  withdrawal_limit: readStoredWord('pluginRead.talk.withdrawalsLeftOut'),
}
