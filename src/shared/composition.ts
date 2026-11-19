// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A SUBJECT WAS MADE OF AT A TIME — one projection, read by every evolution screen.
 *
 * ---------------------------------------------------------------------------------------
 * THE MEMBERSHIP FILTER, WHICH WAS WRITTEN DOWN BEFORE THIS FILE EXISTED
 * ---------------------------------------------------------------------------------------
 *
 * A composition is what the subject was MADE OF at a time. Membership is decided by exactly two
 * stored facts and by nothing else.
 *
 *   a PIPELINE — its `data.blockIds`, in the revision of the pipeline in effect at that time.
 *                `kinds.ts` calls that array "the ONLY place that says which blocks belong to this
 *                pipeline", and this projection takes it at its word.
 *   a MODULE   — the `implements` links it had made and not unmade by that time, replayed from the
 *                `link` and `unlink` rows in the change log.
 *
 * NOTHING ELSE CONFERS MEMBERSHIP, and the case that matters is a record about an intended future.
 * A `direction` is Mole Office's kind for a line of exploration somebody may take. Linking one to a
 * pipeline is an ordinary and useful thing to do, and it says nothing about what the pipeline was
 * made of. `relates_to`, `about`, `discusses`, `blocks`, `supersedes`, `produces`, `consumes`,
 * `resolves`, `measures`, `contradicts`, `part_of` and `derived_from` are read by other screens and
 * none of them is read here. A reader that walked them would present a guess about the future as
 * part of the past.
 *
 * KIND IS NOT THE FILTER, STRUCTURE IS. There is deliberately no list of "kinds allowed in a
 * pipeline" here: that would be the same fact stated in a second place, and the two would drift.
 *
 * ---------------------------------------------------------------------------------------
 * THREE SOURCES, PROVENANCE PER ELEMENT, AND AN EXPLICIT `unaccounted`
 * ---------------------------------------------------------------------------------------
 *
 * The three sources are the subject's own revisions, the members' revisions, and the link timeline.
 * Every element says which of the three accounted for each part of it, so a reader can ask "how do
 * you know" of any line on the screen. An element the sources cannot account for is RETURNED AND
 * MARKED, never omitted: an id in `blockIds` that no record answers to, or a member whose ledger
 * holds nothing at or before the asked-for time, is a hole in the evidence and a hole is a fact.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DOES NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * It stores nothing, it opens no database, and it copies no child content into a parent. It is a
 * pure function of the rows it is handed, so the server, a test and (through one route) the browser
 * all get the same answer from the same code. One fact, one identity, many useful projections.
 *
 * It also never consults the present. No live-records list, no `deletedAt` from today's row, no
 * current `blockIds`. The single unversioned thing it reads is `RecordFact`, and that is confined
 * to two questions — does a row exist at all, and how did it enter the corpus — with `origin`
 * marked in the answer as today's value rather than the value at `asOf`, because `records.origin`
 * is not carried in a revision.
 */

import { parseStoredStamp } from './time.ts'
import { blockIdsOf, blockNameIn } from './blocks.ts'

// ============================================================================ what goes in

/** One row of `revisions`, as this projection reads it. */
export interface RevisionFact {
  recordId: string
  /** 1-based and per record, gapless. This is the order authority; `at` is only a filter. */
  seq: number
  at: string
  op: string
  actorType: string
  actorId: string
  title: string
  data: Record<string, unknown>
  deletedAt: string | null
  contentHash: string
}

/** One `link` or `unlink` row of `changes`, as this projection reads it. */
export interface LinkEventFact {
  at: string
  op: 'link' | 'unlink'
  /** The link type, which the change log keeps in `field`. */
  type: string
  /** `changes.record_id`, which is the link's from-end. */
  fromId: string
  /** `new_value` on a link row, `old_value` on an unlink row. */
  toId: string
  actorType: string
  actorId: string
}

/**
 * The two unversioned facts about a row, and the only unversioned thing read here.
 *
 * `origin` is a column on `records` and is NOT carried in a revision, so it cannot be read as of a
 * past time. It is returned marked `now` so that a drawing can put Mole Office's `Made-up example` chip
 * on a made-up row without anybody believing the mark was measured at `asOf`.
 */
export interface RecordFact {
  id: string
  kind: string
  /** `authored`, `fixture`, or null where nobody stamped one — which is a real answer, not a gap. */
  origin: string | null
}

export interface CompositionSources {
  subjectId: string
  subjectKind: 'pipeline' | 'module'
  /** Every revision of the subject, in any order. */
  subjectRevisions: readonly RevisionFact[]
  /** Every revision of every record that could be a member, in any order. */
  childRevisions: readonly RevisionFact[]
  /** Every `link`/`unlink` row touching the subject or a candidate member, in STORED order. */
  linkEvents: readonly LinkEventFact[]
  /** One entry per record id the corpus holds a row for. An id missing here has no record. */
  recordsNow: readonly RecordFact[]
}

// ============================================================================ what comes out

/**
 * Why an element could not be accounted for. A closed set, because a screen draws a word per case
 * and a free string would arrive at the browser as finished English.
 */
export const UNACCOUNTED_REASONS = {
  noRecord: 'no record answers to this id',
  noRevisionYet: 'the ledger holds nothing for it at or before this time',
  unreadableTime: 'a stamp on its evidence could not be read',
  beforeAnythingRecorded: 'this is earlier than the first thing anybody recorded here',
} as const
export type UnaccountedReason = keyof typeof UNACCOUNTED_REASONS

/** Which of the three sources accounted for which part of one element. */
export interface MemberProvenance {
  /** The subject's own revision that listed this member. Null when membership came from a link. */
  subject: { seq: number; at: string } | null
  /** The member's own revision in effect at `asOf`. Null when the ledger holds none. */
  child: {
    seq: number
    at: string
    op: string
    actorType: string
    actorId: string
    contentHash: string
  } | null
  /** The link event that put it where it is, when membership came from the link timeline. */
  link: { at: string; type: string; fromId: string; actorType: string; actorId: string } | null
}

/** One module that was carrying this member at `asOf`, and the event that says so. */
export interface Carrier {
  moduleId: string
  since: string
  actorType: string
  actorId: string
}

export interface CompositionMember {
  recordId: string
  /** Where it sat in the subject's own order, 0-based. Null when the subject keeps no order. */
  position: number | null
  /** What it was called at `asOf`, from its own revision. Null when nothing accounts for it. */
  title: string | null
  /** Today's `origin`, marked as today's. `fixture` is what a `Made-up example` chip draws from. */
  origin: { value: string | null; asOf: 'now' } | null
  /** Its `data` at `asOf`, straight from the revision. Nothing is copied into the subject. */
  data: Record<string, unknown> | null
  /** True when the member's own revision at `asOf` was a deletion. It stays a member; see header. */
  deletedThen: boolean
  from: MemberProvenance
  /** Which modules carried it at `asOf`, replayed from `implements` events. */
  carriers: Carrier[]
  /** Null when all three sources answered. A reason otherwise, and the element is still returned. */
  unaccounted: UnaccountedReason | null
}

export interface Composition {
  asOf: string
  subject: {
    id: string
    kind: 'pipeline' | 'module'
    /** The subject revision in effect at `asOf`, or null with a reason beside it. */
    revision: { seq: number; at: string; op: string; actorType: string; actorId: string } | null
    title: string | null
    unaccounted: UnaccountedReason | null
  }
  members: CompositionMember[]
  /** The subset of `members` carrying a reason. Same objects, listed once more so a count is free. */
  unaccounted: CompositionMember[]
  /**
   * Evidence this projection could not read, counted rather than dropped in silence.
   *
   * ORDERING TIES ARE NOT COUNTED HERE, and they used to be. A composition at a time does not care
   * which of two events in the same second came first — both are before the cut or both after it.
   * Ties matter to the WALK, which is where they are reported, on the event itself as `tied`.
   */
  ignored: { unreadableStamps: number }
}

// ============================================================================ the walk

/** One recorded change to the composition, in the order it happened. */
export interface CompositionEvent {
  /** 0-based, ascending in time. This is the step-back index. */
  order: number
  at: string
  source: 'subject' | 'child' | 'link'
  /** A closed word saying what happened. Drawn as a state word, never as a sentence. */
  what: 'created' | 'changed' | 'deleted' | 'restored' | 'linked' | 'unlinked'
  recordId: string
  seq: number | null
  linkType: string | null
  /** The other end of a link event. Null on a revision event. */
  otherId: string | null
  actorType: string
  actorId: string
  /** True when another event shares this second, so the order between them is not authoritative. */
  tied: boolean
}

const OPS_TO_WORD: Record<string, CompositionEvent['what']> = {
  create: 'created',
  update: 'changed',
  delete: 'deleted',
  restore: 'restored',
  baseline: 'changed',
}

function wordFor(op: string): CompositionEvent['what'] {
  return OPS_TO_WORD[op] ?? 'changed'
}

/**
 * Every id that was EVER a member, across every revision of the subject and the whole link
 * timeline. This is what the walk needs: a block removed at revision 13 has to be walkable back to.
 */
export function everMembers(sources: CompositionSources): string[] {
  const seen = new Set<string>()
  for (const rev of sources.subjectRevisions) {
    if (sources.subjectKind === 'pipeline') for (const id of blockIdsOf({ data: rev.data })) seen.add(id)
  }
  for (const event of sources.linkEvents) {
    if (event.type === 'implements' && event.fromId === sources.subjectId) seen.add(event.toId)
  }
  return [...seen]
}

/**
 * The recorded changes to this composition, earliest first.
 *
 * THE TIE RULE IS STATED RATHER THAN HIDDEN. Events are ordered by their stamp; two events sharing
 * a second keep the order the caller handed them in, which is the order the rows are stored in, and
 * each of them is marked `tied` so a screen can say the order between those two is not evidence.
 */
export function compositionEvents(sources: CompositionSources): CompositionEvent[] {
  const members = new Set(everMembers(sources))
  const raw: Omit<CompositionEvent, 'order' | 'tied'>[] = []
  for (const rev of sources.subjectRevisions) {
    raw.push({
      at: rev.at,
      source: 'subject',
      what: wordFor(rev.op),
      recordId: rev.recordId,
      seq: rev.seq,
      linkType: null,
      otherId: null,
      actorType: rev.actorType,
      actorId: rev.actorId,
    })
  }
  for (const rev of sources.childRevisions) {
    if (!members.has(rev.recordId)) continue
    raw.push({
      at: rev.at,
      source: 'child',
      what: wordFor(rev.op),
      recordId: rev.recordId,
      seq: rev.seq,
      linkType: null,
      otherId: null,
      actorType: rev.actorType,
      actorId: rev.actorId,
    })
  }
  for (const event of sources.linkEvents) {
    // THE MEMBERSHIP FILTER APPLIES TO THE WALK TOO, and this line is the amendment's acceptance
    // case made into code. `implements` is the only link type that can change what a subject is
    // made of. A `direction` linked `about` a pipeline reached this walk while the condition read
    // "the subject is one end of it", which put a statement about an intended future into a list of
    // recorded changes to the past. Measured on 20 August 2026 against the demonstration pipeline,
    // and it is the reason the amendment asked for the case.
    const changesMembership =
      event.type === 'implements' && (members.has(event.toId) || event.fromId === sources.subjectId)
    if (!changesMembership) continue
    raw.push({
      at: event.at,
      source: 'link',
      what: event.op === 'link' ? 'linked' : 'unlinked',
      recordId: event.toId,
      seq: null,
      linkType: event.type,
      otherId: event.fromId,
      actorType: event.actorType,
      actorId: event.actorId,
    })
  }
  const withMs = raw.map((event, index) => ({ event, index, ms: parseStoredStamp(event.at) }))
  const readable = withMs.filter((row) => row.ms !== null)
  readable.sort((a, b) => (a.ms! - b.ms!) || (a.index - b.index))
  const perSecond = new Map<number, number>()
  for (const row of readable) perSecond.set(row.ms!, (perSecond.get(row.ms!) ?? 0) + 1)
  return readable.map((row, order) => ({
    ...row.event,
    order,
    tied: (perSecond.get(row.ms!) ?? 0) > 1,
  }))
}

// ============================================================================ the projection

function newest(revisions: readonly RevisionFact[], asOfMs: number): { row: RevisionFact | null; unreadable: number } {
  let best: RevisionFact | null = null
  let unreadable = 0
  for (const row of revisions) {
    const ms = parseStoredStamp(row.at)
    if (ms === null) {
      unreadable += 1
      continue
    }
    if (ms > asOfMs) continue
    if (best === null || row.seq > best.seq) best = row
  }
  return { row: best, unreadable }
}

/**
 * What the subject was made of at `asOf`.
 *
 * Never throws. A time nobody can read, a subject with no ledger and an id with no record are all
 * ANSWERS here, carried in `unaccounted`, because a screen that draws an evolution has to be able
 * to say "the evidence does not reach back that far" without pretending it does.
 */
export function compositionAt(sources: CompositionSources, asOf: string): Composition {
  const asOfMs = parseStoredStamp(asOf)
  const facts = new Map(sources.recordsNow.map((row) => [row.id, row]))
  const empty: Composition = {
    asOf,
    subject: { id: sources.subjectId, kind: sources.subjectKind, revision: null, title: null, unaccounted: null },
    members: [],
    unaccounted: [],
    ignored: { unreadableStamps: 0 },
  }
  if (asOfMs === null) {
    empty.subject.unaccounted = 'unreadableTime'
    return empty
  }

  const subjectPick = newest(sources.subjectRevisions, asOfMs)
  let unreadable = subjectPick.unreadable
  if (subjectPick.row === null) {
    empty.subject.unaccounted = 'noRevisionYet'
    empty.ignored.unreadableStamps = unreadable
    return empty
  }
  const subjectRevision = subjectPick.row

  // ---------------------------------------------------------------- the link timeline, replayed
  //
  // One pass over the events in the order the caller handed them, which is stored order. A `link`
  // row adds the pair, an `unlink` row removes it. Nothing is inferred from the links table itself:
  // the events ARE the source, which is what makes an answer about a past time possible at all.
  const carriersOf = new Map<string, Map<string, Carrier>>()
  const carriedBySubject = new Map<string, Carrier>()
  for (const event of sources.linkEvents) {
    const ms = parseStoredStamp(event.at)
    if (ms === null) {
      unreadable += 1
      continue
    }
    if (ms > asOfMs) continue
    if (event.type !== 'implements') continue
    const forMember = carriersOf.get(event.toId) ?? new Map<string, Carrier>()
    if (event.op === 'link') {
      forMember.set(event.fromId, {
        moduleId: event.fromId,
        since: event.at,
        actorType: event.actorType,
        actorId: event.actorId,
      })
    } else {
      forMember.delete(event.fromId)
    }
    carriersOf.set(event.toId, forMember)
    if (event.fromId === sources.subjectId) {
      if (event.op === 'link') {
        carriedBySubject.set(event.toId, {
          moduleId: event.fromId,
          since: event.at,
          actorType: event.actorType,
          actorId: event.actorId,
        })
      } else {
        carriedBySubject.delete(event.toId)
      }
    }
  }

  // ---------------------------------------------------------------- membership, by the filter
  const membership: { id: string; position: number | null; viaLink: Carrier | null }[] =
    sources.subjectKind === 'pipeline'
      ? blockIdsOf({ data: subjectRevision.data }).map((id, position) => ({ id, position, viaLink: null }))
      : [...carriedBySubject.entries()].map(([id, carrier]) => ({ id, position: null, viaLink: carrier }))

  const members: CompositionMember[] = membership.map((entry) => {
    const fact = facts.get(entry.id) ?? null
    const own = sources.childRevisions.filter((row) => row.recordId === entry.id)
    const pick = newest(own, asOfMs)
    unreadable += pick.unreadable
    const child = pick.row
    const reason: UnaccountedReason | null =
      fact === null ? 'noRecord' : child === null ? 'noRevisionYet' : null
    return {
      recordId: entry.id,
      position: entry.position,
      title: child?.title ?? null,
      origin: fact === null ? null : { value: fact.origin, asOf: 'now' },
      data: child?.data ?? null,
      deletedThen: child?.deletedAt !== null && child?.deletedAt !== undefined,
      from: {
        subject:
          entry.position === null ? null : { seq: subjectRevision.seq, at: subjectRevision.at },
        child:
          child === null
            ? null
            : {
                seq: child.seq,
                at: child.at,
                op: child.op,
                actorType: child.actorType,
                actorId: child.actorId,
                contentHash: child.contentHash,
              },
        link:
          entry.viaLink === null
            ? null
            : {
                at: entry.viaLink.since,
                type: 'implements',
                fromId: entry.viaLink.moduleId,
                actorType: entry.viaLink.actorType,
                actorId: entry.viaLink.actorId,
              },
      },
      carriers: [...(carriersOf.get(entry.id)?.values() ?? [])],
      unaccounted: reason,
    }
  })

  return {
    asOf,
    subject: {
      id: sources.subjectId,
      kind: sources.subjectKind,
      revision: {
        seq: subjectRevision.seq,
        at: subjectRevision.at,
        op: subjectRevision.op,
        actorType: subjectRevision.actorType,
        actorId: subjectRevision.actorId,
      },
      title: subjectRevision.title,
      unaccounted: null,
    },
    members,
    unaccounted: members.filter((member) => member.unaccounted !== null),
    ignored: { unreadableStamps: unreadable },
  }
}

/**
 * ONE STOP OF THE STEP-BACK WALK: a stamp, and everything recorded at it.
 *
 * THE WALK MOVES BETWEEN STAMPS AND NOT BETWEEN ROWS, because a single product action writes more
 * than one row in the same second — adding a block writes the block's own `create` revision and the
 * pipeline's `update` revision — and nothing stored says which came first. Stepping through rows
 * would draw an order Mole Office does not know. Stepping through stamps draws only what is recorded,
 * and a stop holding more than one event says so.
 */
export interface CompositionStop {
  /** 0-based, earliest first. This is the step-back index. */
  order: number
  at: string
  events: CompositionEvent[]
}

/** The distinct stamps of a walk, earliest first, each carrying what happened at it. */
export function compositionStops(events: readonly CompositionEvent[]): CompositionStop[] {
  const byStamp = new Map<string, CompositionEvent[]>()
  for (const event of events) {
    const held = byStamp.get(event.at) ?? []
    held.push(event)
    byStamp.set(event.at, held)
  }
  return [...byStamp.entries()].map(([at, held], order) => ({ order, at, events: held }))
}

/**
 * The composition as it stood JUST BEFORE a recorded stop — the step-back of step 48.
 *
 * It is expressed as a time and not as a copy: the answer is `compositionAt` at the stamp of the
 * previous event, so nothing about a composition is ever stored twice. Stepping back from the
 * earliest event answers with the subject's `unaccounted` reason rather than with an empty picture.
 */
export function compositionBefore(
  sources: CompositionSources,
  stops: readonly CompositionStop[],
  order: number,
): Composition {
  const earlier = stops.filter((stop) => stop.order < order)
  const last = earlier[earlier.length - 1]
  if (last === undefined) {
    // BEFORE THE FIRST RECORDED EVENT IS A REAL PLACE TO STAND, and it is not an empty picture and
    // not a broken stamp. It is the honest answer that the evidence does not reach back this far.
    const nothing = compositionAt(sources, '')
    nothing.subject.unaccounted = 'beforeAnythingRecorded'
    return nothing
  }
  return compositionAt(sources, last.at)
}

// ============================================================================ before and after

/**
 * THE SIX MARKS, and there are six because the sixth is the one an honest drawing needs.
 *
 * Five of them are the differences the plan names. `unaccounted` is the sixth, and it is not a
 * decoration: a member the sources could not account for on either side is a hole in the evidence,
 * and a diff that drew it as `removed` would be asserting something nobody recorded.
 *
 * PLANNED IS NOT ONE OF THEM, deliberately. Nothing in this corpus stores what a pipeline was
 * PLANNED to become — plan lines have no history (step 42's written decision), so a `planned` mark
 * would have nothing behind it. The legend has six marks, not seven, and step 46 says so in words.
 */
export const COMPOSITION_MARKS = ['added', 'removed', 'changed', 'moved', 'regrouped', 'unaccounted'] as const
export type CompositionMark = (typeof COMPOSITION_MARKS)[number]

export interface CompositionSide {
  position: number | null
  /** Rank among the members present on BOTH sides. Null when this member is on one side only. */
  rank: number | null
  seq: number | null
  at: string | null
  title: string | null
  carriers: string[]
  deletedThen: boolean
  unaccounted: UnaccountedReason | null
}

export interface CompositionChange {
  recordId: string
  /** The best title anybody recorded, after first. Null when nothing accounts for the member. */
  title: string | null
  origin: string | null
  /** One member can carry more than one mark: a block can be changed AND regrouped. */
  marks: CompositionMark[]
  before: CompositionSide | null
  after: CompositionSide | null
}

export interface CompositionDiff {
  from: string
  to: string
  changes: CompositionChange[]
  counts: Record<CompositionMark, number>
  /** Members that carry no mark at all. Counted, so "nothing changed here" is a number. */
  unchanged: number
}

function sideOf(member: CompositionMember | undefined, rank: number | null): CompositionSide | null {
  if (member === undefined) return null
  return {
    position: member.position,
    rank,
    seq: member.from.child?.seq ?? null,
    at: member.from.child?.at ?? null,
    title: member.title,
    carriers: member.carriers.map((carrier) => carrier.moduleId).sort(),
    deletedThen: member.deletedThen,
    unaccounted: member.unaccounted,
  }
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/**
 * What changed between two compositions of the same subject.
 *
 * `moved` IS RELATIVE, AND THAT IS THE WHOLE DESIGN OF IT. Two blocks put in at the front of a
 * pipeline shift the absolute position of every block behind them, and marking nine untouched
 * blocks as `moved` would drown the two real insertions. So `moved` compares each member's rank
 * among the members that are on BOTH sides: a member is moved when it changed places with a
 * neighbour that stayed, and not when the list grew in front of it.
 */
export function compositionDiff(before: Composition, after: Composition): CompositionDiff {
  const beforeById = new Map(before.members.map((member) => [member.recordId, member]))
  const afterById = new Map(after.members.map((member) => [member.recordId, member]))
  const common = before.members.filter((member) => afterById.has(member.recordId)).map((member) => member.recordId)
  const commonAfter = after.members.filter((member) => beforeById.has(member.recordId)).map((member) => member.recordId)
  const rankBefore = new Map(common.map((id, index) => [id, index]))
  const rankAfter = new Map(commonAfter.map((id, index) => [id, index]))

  const ids: string[] = []
  for (const member of before.members) ids.push(member.recordId)
  for (const member of after.members) if (!beforeById.has(member.recordId)) ids.push(member.recordId)

  const counts: Record<CompositionMark, number> = {
    added: 0,
    removed: 0,
    changed: 0,
    moved: 0,
    regrouped: 0,
    unaccounted: 0,
  }
  let unchanged = 0
  const changes: CompositionChange[] = ids.map((id) => {
    const was = beforeById.get(id)
    const is = afterById.get(id)
    const marks: CompositionMark[] = []
    if (was === undefined && is !== undefined) marks.push('added')
    if (was !== undefined && is === undefined) marks.push('removed')
    if (was !== undefined && is !== undefined) {
      if ((was.from.child?.seq ?? null) !== (is.from.child?.seq ?? null)) marks.push('changed')
      const rankWas = rankBefore.get(id) ?? null
      const rankIs = rankAfter.get(id) ?? null
      if (rankWas !== null && rankIs !== null && rankWas !== rankIs) marks.push('moved')
      const carriedWas = was.carriers.map((carrier) => carrier.moduleId).sort()
      const carriedIs = is.carriers.map((carrier) => carrier.moduleId).sort()
      if (!sameSet(carriedWas, carriedIs)) marks.push('regrouped')
    }
    if ((was?.unaccounted ?? null) !== null || (is?.unaccounted ?? null) !== null) marks.push('unaccounted')
    for (const mark of marks) counts[mark] += 1
    if (marks.length === 0) unchanged += 1
    return {
      recordId: id,
      title: is?.title ?? was?.title ?? null,
      origin: (is ?? was)?.origin?.value ?? null,
      marks,
      before: sideOf(was, rankBefore.get(id) ?? null),
      after: sideOf(is, rankAfter.get(id) ?? null),
    }
  })
  return { from: before.asOf, to: after.asOf, changes, counts, unchanged }
}

// ==================================================== one pipeline against another
//
// TWO PIPELINES SHARE NO BLOCK RECORDS AT ALL, and that single stored rule decides everything
// below. `kinds.ts` refuses a block id that another pipeline already lists, so a block belongs to
// exactly one pipeline for ever. Comparing two pipelines by record id would therefore report that
// every step of each is missing from the other. That answer is true and it tells a reader nothing.
//
// So the two sides are paired on the step's own name inside its pipeline, which is what a person
// reads and what they mean when they ask whether both routes read the camera. That is an
// INTERPRETATION of two records, not an identity, and the eighth rule says an interpretation is
// always shown: `matchedOn` names the rule on every answer and `sharedRecordIds` is counted beside
// it, so the screen can print the number rather than repeat a claim somebody might leave behind
// after the rule changes.
//
// NOTHING IS DROPPED. A member the ledger cannot name is drawn on its own side with no name, a
// name carried twice on one side is reported by name instead of being paired arbitrarily, and
// every member of both sides appears in exactly one row.

/** One pipeline's side of one row. */
export interface AgainstSide {
  recordId: string
  /** Where it sat in that pipeline's own order, 0-based. */
  position: number | null
  /** The stored title, which is `<its pipeline's title> › <its own name>`. */
  title: string | null
  /** Its own name inside its pipeline, cut exactly. Null when the ledger holds no title for it. */
  name: string | null
  origin: string | null
  /** The modules carrying it, as ids. The names are looked up once, by the route. */
  carriers: string[]
  deletedThen: boolean
  unaccounted: UnaccountedReason | null
}

/** One step name, and what each pipeline has under it. A null side is a gap, and it is drawn. */
export interface AgainstRow {
  /** Null for a member the ledger cannot name, which is never paired with anything. */
  name: string | null
  left: AgainstSide | null
  right: AgainstSide | null
}

export interface CompositionAgainst {
  /** What the two sides were paired on. One value today; it is on the wire so a screen can say it. */
  matchedOn: 'stepName'
  /** Block records listed by both pipelines. The stored rule makes this zero; it is counted, not assumed. */
  sharedRecordIds: number
  /** The left's own order first, then whatever only the right has, in the right's order. */
  rows: AgainstRow[]
  counts: { inBoth: number; onlyLeft: number; onlyRight: number }
  /** Members no revision names, per side. They are in `rows` and they are never paired. */
  unnamed: { left: number; right: number }
  /** A name on both sides that one side carries more than once, so nothing says which pairs with which. */
  ambiguous: { name: string; left: number; right: number }[]
}

/** One member of one composition, read as a side of a comparison. */
function againstSide(member: CompositionMember, subjectTitle: string | null): AgainstSide {
  return {
    recordId: member.recordId,
    position: member.position,
    title: member.title,
    // EXACT, and never a cut at the last separator. `blockNameIn` strips the prefix only when the
    // title really begins with this pipeline's title, so a pipeline whose own name holds the
    // separator is not mis-cut and a title that has come apart is returned whole instead of
    // truncated into something that reads fine and is wrong.
    name: member.title === null || subjectTitle === null ? null : blockNameIn(member.title, subjectTitle),
    origin: member.origin?.value ?? null,
    carriers: member.carriers.map((carrier) => carrier.moduleId).sort(),
    deletedThen: member.deletedThen,
    unaccounted: member.unaccounted,
  }
}

/**
 * What is in one pipeline and not in the other, paired by step name.
 *
 * The left's order is the reading order, because a person opens one pipeline and asks about
 * another. Whatever only the right has follows, in the right's own order, so nothing is buried.
 */
export function compositionAgainst(left: Composition, right: Composition): CompositionAgainst {
  const leftSides = left.members.map((member) => againstSide(member, left.subject.title))
  const rightSides = right.members.map((member) => againstSide(member, right.subject.title))

  const byName = (sides: readonly AgainstSide[]): Map<string, AgainstSide[]> => {
    const out = new Map<string, AgainstSide[]>()
    for (const side of sides) {
      if (side.name === null) continue
      const held = out.get(side.name)
      if (held === undefined) out.set(side.name, [side])
      else held.push(side)
    }
    return out
  }
  const leftByName = byName(leftSides)
  const rightByName = byName(rightSides)

  // A name is ambiguous when both sides carry it AND one of them carries it more than once. That
  // is exactly the case where pairing would have to pick, and picking would be a guess.
  const ambiguous: CompositionAgainst['ambiguous'] = []
  for (const [name, mine] of leftByName) {
    const theirs = rightByName.get(name)
    if (theirs === undefined) continue
    if (mine.length > 1 || theirs.length > 1) ambiguous.push({ name, left: mine.length, right: theirs.length })
  }
  ambiguous.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const ambiguousNames = new Set(ambiguous.map((entry) => entry.name))

  const pairedRight = new Set<string>()
  const rows: AgainstRow[] = []
  for (const side of leftSides) {
    const partner =
      side.name === null || ambiguousNames.has(side.name) ? undefined : rightByName.get(side.name)?.[0]
    if (partner !== undefined) pairedRight.add(partner.recordId)
    rows.push({ name: side.name, left: side, right: partner ?? null })
  }
  for (const side of rightSides) {
    if (pairedRight.has(side.recordId)) continue
    rows.push({ name: side.name, left: null, right: side })
  }

  const counts = { inBoth: 0, onlyLeft: 0, onlyRight: 0 }
  for (const row of rows) {
    if (row.left !== null && row.right !== null) counts.inBoth += 1
    else if (row.left !== null) counts.onlyLeft += 1
    else counts.onlyRight += 1
  }

  const rightIds = new Set(rightSides.map((side) => side.recordId))
  return {
    matchedOn: 'stepName',
    sharedRecordIds: leftSides.filter((side) => rightIds.has(side.recordId)).length,
    rows,
    counts,
    unnamed: {
      left: leftSides.filter((side) => side.name === null).length,
      right: rightSides.filter((side) => side.name === null).length,
    },
    ambiguous,
  }
}

// ============================================================================ the six marks
//
// THE LEGEND WAS DRAWN AND MEASURED BEFORE THE VIEW WAS DESIGNED. The amendment to step 46 asks for
// that order and gives the reason: a legend that only works in colour fails the rule that no
// semantic state is carried by hue alone. The measurement at 390 px in grey is in
// `design/round-nine/step46-legend-390.json`.
//
// THIS TABLE HAS THE SHAPE OF EVERY OTHER STATE TABLE, on purpose. `VocabularyEntry` is the
// declaration from `./states.ts` — a word, a mark with four channels and no colour among them, and
// a sentence that is never drawn beside the word. Its honest home is `VOCABULARY` in that file,
// which this step does not own; `design/round-nine/step45-49-vocabulary.patch` moves it there and
// a test deleted on 13 November 2026 held the greyness check meanwhile.

import { withoutHue, type VocabularyEntry } from './states.ts'
import { readStoredWord } from './i18n.ts'

// THE WORD AND THE DETAIL OF EACH MARK ARE WRITTEN ONCE, in src/shared/words/en.ts under
// `g2b.composition.<mark>` and `g2b.composition.<mark>Detail`, because the evolution panel draws
// them through `t()`. The entries read them with `readStoredWord`: English on the server and in a
// test, the page's language in a browser.

export const EVOLUTION_MARKS: Readonly<Record<CompositionMark, VocabularyEntry>> = {
  added: {
    // NOT `Added`, and not `Changed` below either. A test deleted on 13 November 2026 caught both:
    // the review family already draws `Added` for a record joining a review, and the composer draws
    // `Changed` for words that moved inside a field. A reader meets those on the same screens as
    // this panel, and one word with two meanings is the collision rule of A4.
    get word() { return readStoredWord('g2b.composition.added') },
    mark: { form: 'outline', glyph: 'filled', edge: 'solid', where: 'inline' },
    get detail() { return readStoredWord('g2b.composition.addedDetail') },
    section: '46',
    labels: 'added',
  },
  removed: {
    get word() { return readStoredWord('g2b.composition.removed') },
    mark: { form: 'text', glyph: 'struck', edge: 'none', where: 'inline' },
    get detail() { return readStoredWord('g2b.composition.removedDetail') },
    section: '46',
    labels: 'removed',
  },
  changed: {
    get word() { return readStoredWord('g2b.composition.changed') },
    mark: { form: 'outline', glyph: 'broken', edge: 'solid', where: 'inline' },
    get detail() { return readStoredWord('g2b.composition.changedDetail') },
    section: '46',
    labels: 'changed',
  },
  moved: {
    get word() { return readStoredWord('g2b.composition.moved') },
    mark: { form: 'outline', glyph: 'barred', edge: 'dashed', where: 'inline' },
    get detail() { return readStoredWord('g2b.composition.movedDetail') },
    section: '46',
    labels: 'moved',
  },
  regrouped: {
    get word() { return readStoredWord('g2b.composition.regrouped') },
    mark: { form: 'outline', glyph: 'doubled', edge: 'solid', where: 'inline' },
    get detail() { return readStoredWord('g2b.composition.regroupedDetail') },
    section: '46',
    labels: 'regrouped',
  },
  unaccounted: {
    get word() { return readStoredWord('g2b.composition.unaccounted') },
    mark: { form: 'outline', glyph: 'hollow', edge: 'dashed', where: 'inline' },
    get detail() { return readStoredWord('g2b.composition.unaccountedDetail') },
    section: '46',
    labels: 'unaccounted',
  },
}

/**
 * Every pair of the six, with what tells them apart once the colour is gone.
 *
 * A pair whose four channels read the same string is confusable, and the amendment says what then
 * follows: planned and actual do not share a spine and the graph needs two lanes. The check was
 * run by a test deleted on 13 November 2026 and by eye at 390 px, and both are recorded.
 */
export function markPairs(): { a: CompositionMark; b: CompositionMark; same: boolean }[] {
  const out: { a: CompositionMark; b: CompositionMark; same: boolean }[] = []
  for (let i = 0; i < COMPOSITION_MARKS.length; i += 1) {
    for (let j = i + 1; j < COMPOSITION_MARKS.length; j += 1) {
      const a = COMPOSITION_MARKS[i]!
      const b = COMPOSITION_MARKS[j]!
      out.push({ a, b, same: withoutHue(EVOLUTION_MARKS[a].mark) === withoutHue(EVOLUTION_MARKS[b].mark) })
    }
  }
  return out
}
