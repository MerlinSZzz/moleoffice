// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FORKS THAT MIGHT BE ONE QUESTION. A READING THAT SUGGESTS AND WRITES NOTHING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * On 27 August 2026 the owner's queue held 27 forks. Three of them — `Wq2WNIJngXtd`,
 * `CUi3VI1lsM9U` and `E4Tjt9D1Yvrs` — asked one question about which repository 152 module claims
 * belong to, and the owner would have been asked it three times. Two more asked one question about the
 * names on a drawing. Nothing in the product could see that, and the owner's brief says the deduplication
 * must not "depend only on a human noticing".
 *
 * ---------------------------------------------------------------------------------------
 * IT WRITES NOTHING. THAT IS THE WHOLE DESIGN AND NOT A LIMITATION
 * ---------------------------------------------------------------------------------------
 *
 * Their rule: *"Do not silently merge uncertain items."* So this proposes, with its reasons, and a
 * `duplicate_of` link is written afterwards by an actor that records why. There is no write path in
 * this file, no route that calls one, and nothing here can take a fork off anybody's queue.
 *
 * A SUGGESTION THAT IS WRONG COSTS A PERSON ONE GLANCE. A link that is wrong loses a question. That
 * asymmetry is why the reading is allowed to use evidence it could be fooled by — words — while
 * `src/server/lib/openloops.ts`, which decides what to CARRY, is not allowed to read prose at all.
 *
 * ---------------------------------------------------------------------------------------
 * FOUR KINDS OF EVIDENCE, AND EACH ONE SAYS WHAT IT SAW
 * ---------------------------------------------------------------------------------------
 *
 * From the list in their brief. Every signal below carries the thing it observed — the id, the shared
 * words — rather than a score, so a person can check the reason against the records.
 *
 *   1. THE SAME RECORDS. Both forks point at the same record with `about` or `blocks`. Two forks
 *      holding up the same work, or filed against the same thing, are usually one question.
 *   2. THE SAME PARENT. Both forks are `part_of` the same record — their "same parent work item".
 *   3. THE SAME WORDS. A normalised fingerprint of the question and the title: lower case, letters
 *      and digits only, common words dropped. The reason names the words that were shared, so a
 *      person can see what matched rather than being handed a number.
 *
 * THE FIRST TWO ARE STRUCTURAL AND THE THIRD IS NOT, and the reading says which is which on every
 * group. A group whose only evidence is words is marked as needing somebody to read it.
 *
 * ---------------------------------------------------------------------------------------
 * THEIR BRIEF ALSO LISTS "explicit supersedes/duplicate links", AND THAT ONE IS NOT HERE
 * ---------------------------------------------------------------------------------------
 *
 * It is not an omission and it is not silence: it is already answered one step earlier. A stored
 * `supersedes` or `duplicate_of` link between two forks takes one of them off the queue —
 * `leftTheQueueBecause` in src/server/lib/forks.ts — and this reading compares only the forks that
 * are still being asked. So two forks joined by such a link are never both in front of it, and a
 * signal for that case would be code that can never run. `tests/forks-that-might-be-one-question.
 * test.ts` holds that as a test rather than as this paragraph, so the day the queue rule changes it
 * fails here instead of leaving these sentences wrong.
 */

import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { links, records } from '../db/schema.ts'
import { readForks } from './forks.ts'

/** One reason two forks might be one question. It carries what it saw, never a score. */
export interface DuplicateSignal {
  /** Which of the three kinds of evidence this is. */
  evidence: 'the same records' | 'the same parent' | 'the same words'
  /** The two forks this reason is about. A group of three carries a reason per pair. */
  between: [string, string]
  /** What was actually observed, in plain language, naming it. */
  because: string
  /**
   * Whether this reason is about the corpus rather than about the wording.
   *
   * A structural reason — the same records, the same parent — is a fact somebody can check without
   * reading either fork. A shared-words reason is a resemblance, and a resemblance is a reason to
   * look rather than a reason to act. Neither settles anything: nothing here writes.
   */
  structural: boolean
}

/** Forks that might be one question, with every reason that put them together. */
export interface CandidateGroup {
  forks: { recordId: string; title: string; workspaceId: string; question: string | null }[]
  /** Every reason, one per pair per kind of evidence. Nothing is summed. */
  signals: DuplicateSignal[]
  /** True when the only evidence is words. Somebody has to read these before anything is written. */
  onlyWords: boolean
  /** The one sentence a person reads. Plain, and it says what would have to happen next. */
  sentence: string
}

export interface DuplicatesRead {
  groups: CandidateGroup[]
  /** How many open forks this reading compared. Every one of them, in every project. */
  looked: number
  /** What this is, and — in the same breath — what it did not do. */
  note: string
  /** How a person or an agent records a grouping, since this never will. */
  howToJoinThem: string
}

/**
 * WORDS THAT SAY NOTHING ABOUT WHAT A FORK IS ABOUT.
 *
 * Written out rather than computed from the corpus, because a list computed from the corpus changes
 * every time somebody files a record and two runs of this reading would then disagree about what
 * matched. It is short on purpose: the threshold below does the work, and a long stop list is a
 * second place where a real word can be lost.
 */
const NOT_ABOUT_ANYTHING = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'can', 'do', 'does', 'for', 'from',
  'has', 'have', 'how', 'if', 'in', 'is', 'it', 'its', 'may', 'not', 'of', 'on', 'one', 'or', 'should',
  'so', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'to', 'was', 'we',
  'what', 'when', 'where', 'which', 'who', 'why', 'will', 'with', 'would', 'you', 'your',
])

/** The words a fork is about: lower case, letters and digits, common words and short ones dropped. */
function wordsOf(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((word) => word.length > 2 && !NOT_ABOUT_ANYTHING.has(word)),
  )
}

/**
 * HOW MANY WORDS TWO FORKS HAVE TO SHARE BEFORE THIS SUGGESTS ANYTHING.
 *
 * Four, and at least half of the shorter fork's words. Both conditions, because either alone is
 * wrong in a way that was easy to reach: four shared words out of eighty is two long questions that
 * happen to mention the same module, and half the words of a four-word title is two words.
 *
 * MEASURED AGAINST THE THREE REPOSITORY FORKS. *"Which repository do the 152 module claims belong
 * to"*, *"Which repository do the 152 module claims belong to, when the only index is in another
 * project"* and *"Which repository are the 152 module claims relative to"* share `repository`,
 * `152`, `module`, `claims`. The numbers are here rather than inside the function because they are
 * the part somebody will want to argue with.
 */
export const SHARED_WORDS_NEEDED = 4
export const SHARE_OF_THE_SHORTER = 0.5

/** Every open fork, and what it is joined to, read once. */
interface ForkFacts {
  recordId: string
  title: string
  workspaceId: string
  question: string | null
  words: Set<string>
  /** Records this fork points at with `about` or `blocks`. What it is about, or holding up. */
  points: Set<string>
  /** Records this fork is `part_of`. Their "same parent work item". */
  parents: Set<string>
}

/**
 * FORKS THAT MIGHT BE ONE QUESTION.
 *
 * It reads. It writes nothing, and there is no code path from here to a write.
 */
export function candidateDuplicates(): DuplicatesRead {
  const open = readForks().open
  const byId = new Map(open.map((fork) => [fork.recordId, fork]))
  const ids = [...byId.keys()]

  const facts = new Map<string, ForkFacts>()
  for (const fork of open) {
    facts.set(fork.recordId, {
      recordId: fork.recordId,
      title: fork.title,
      workspaceId: fork.workspaceId,
      question: fork.question,
      words: wordsOf(`${fork.title} ${fork.question ?? ''}`),
      points: new Set<string>(),
      parents: new Set<string>(),
    })
  }

  // WHAT EACH FORK IS JOINED TO, in one query rather than one per fork. Only live records at the far
  // end: a link to something deleted is a fact about the archive, which is the same view
  // `shared/attention.ts` and `readForks` already take.
  if (ids.length > 0) {
    const far = records
    // IN PIECES (src/server/db/in-pieces.ts): this is every open fork in the office, and nothing caps that. Every
    // link from one fork is in the piece that names it, and the rows are folded per fork.
    const rows = readInPieces(ids, (piece) =>
      db
        .select({ from: links.fromId, to: links.toId, type: links.type, farDeleted: far.deletedAt })
        .from(links)
        .innerJoin(far, eq(links.toId, far.id))
        .where(and(inArray(links.fromId, piece), isNull(far.deletedAt)))
        .all(),
    )
    for (const row of rows) {
      const fact = facts.get(row.from)
      if (fact === undefined) continue
      if (row.type === 'about' || row.type === 'blocks') fact.points.add(row.to)
      if (row.type === 'part_of') fact.parents.add(row.to)
    }
  }

  // ------------------------------------------------------------------ every pair, and its reasons

  const signals: DuplicateSignal[] = []
  const shared = (a: Set<string>, b: Set<string>): string[] => [...a].filter((one) => b.has(one))

  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const one = facts.get(ids[i] as string) as ForkFacts
      const two = facts.get(ids[j] as string) as ForkFacts
      const pair: [string, string] = [one.recordId, two.recordId]

      const sameRecords = shared(one.points, two.points)
      if (sameRecords.length > 0) {
        signals.push({
          evidence: 'the same records',
          between: pair,
          because:
            `Both forks point at ${sameRecords.map((id) => titleOf(id)).join(', ')} — ` +
            `${sameRecords.length === 1 ? 'the same record' : 'the same records'} — with an "about" or a ` +
            `"blocks" link.`,
          structural: true,
        })
      }

      const sameParent = shared(one.parents, two.parents)
      if (sameParent.length > 0) {
        signals.push({
          evidence: 'the same parent',
          between: pair,
          because: `Both forks are part of ${sameParent.map((id) => titleOf(id)).join(', ')}.`,
          structural: true,
        })
      }

      const words = shared(one.words, two.words)
      const smaller = Math.min(one.words.size, two.words.size)
      if (words.length >= SHARED_WORDS_NEEDED && smaller > 0 && words.length / smaller >= SHARE_OF_THE_SHORTER) {
        signals.push({
          evidence: 'the same words',
          between: pair,
          because:
            `They share ${String(words.length)} of the ${String(smaller)} words the shorter one is about: ` +
            `${words.sort().join(', ')}. That is a resemblance and not a fact — somebody has to read both.`,
          structural: false,
        })
      }
    }
  }

  // ------------------------------------------------------------------ pairs into groups

  // CONNECTED PAIRS BECOME ONE GROUP, and every pair's own reason stays on it. Three forks that are
  // one question arrive as three pairs, and joining them into one group is what stops a person being
  // shown the same thing three times. Where the chain is weak — A resembles B, B resembles C, A and
  // C do not — the group carries no reason joining A and C, and that gap is visible rather than
  // absorbed into a group-level claim.
  const home = new Map<string, string>(ids.map((id) => [id, id]))
  const rootOf = (id: string): string => {
    let at = id
    while ((home.get(at) as string) !== at) at = home.get(at) as string
    return at
  }
  for (const signal of signals) {
    const [a, b] = signal.between
    const ra = rootOf(a)
    const rb = rootOf(b)
    if (ra !== rb) home.set(ra, rb)
  }

  const members = new Map<string, string[]>()
  for (const id of ids) {
    const root = rootOf(id)
    members.set(root, [...(members.get(root) ?? []), id])
  }

  const groups: CandidateGroup[] = []
  for (const [root, ofThisGroup] of members) {
    if (ofThisGroup.length < 2) continue
    const mine = signals.filter((signal) => rootOf(signal.between[0]) === root)
    const onlyWords = mine.every((signal) => signal.evidence === 'the same words')
    groups.push({
      forks: ofThisGroup.map((id) => {
        const fork = byId.get(id)
        return {
          recordId: id,
          title: fork?.title ?? id,
          workspaceId: fork?.workspaceId ?? '',
          question: fork?.question ?? null,
        }
      }),
      signals: mine,
      onlyWords,
      sentence:
        `${String(ofThisGroup.length)} forks that may be one question. ` +
        (onlyWords
          ? 'The only thing joining them is the words they use, so somebody has to read them before anything is ' +
            'recorded.'
          : 'They point at the same records, which is a fact about the corpus rather than about the wording.') +
        ' NOTHING HAS BEEN WRITTEN AND NOTHING WILL BE.',
    })
  }

  // The ones with a structural reason first, then the largest, then by id so two reads agree.
  groups.sort(
    (a, b) =>
      Number(a.onlyWords) - Number(b.onlyWords) ||
      b.forks.length - a.forks.length ||
      (a.forks[0]?.recordId ?? '').localeCompare(b.forks[0]?.recordId ?? ''),
  )

  return {
    groups,
    looked: ids.length,
    note:
      `${String(ids.length)} open forks compared, ${String(groups.length)} group` +
      `${groups.length === 1 ? '' : 's'} of possible duplicates found. THIS READING WRITES NOTHING. It is a ` +
      'suggestion with its reasons, and every reason names what it saw so you can check it against the records. ' +
      'A group whose only evidence is the words two forks use is marked, because words are a resemblance and ' +
      'not a fact. Nothing here takes a fork off any queue.',
    howToJoinThem:
      'When you have read them and agree they are one question, record it: POST /api/links ' +
      '{"fromId":"<the repeat>","toId":"<the one to answer>","type":"duplicate_of"}. The direction matters — the ' +
      'fork you send as `fromId` is the one that leaves the queue, and the other is the one still to be ' +
      'answered. Say why in a record and link it, because a grouping nobody can account for is worse than two ' +
      'questions. If one REPLACED the other rather than repeating it, the link is `supersedes` instead, from the ' +
      'newer to the older.',
  }
}

/** What a record is called, for a reason a person reads. The id when nothing answers to it. */
function titleOf(id: string): string {
  const row = db.select({ title: records.title }).from(records).where(eq(records.id, id)).get()
  return row === undefined ? id : `"${row.title}" (${id})`
}
