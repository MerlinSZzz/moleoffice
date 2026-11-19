// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN INCIDENT: SEVERAL DEFECTS ACTING TOGETHER CAUSED A LARGE LOSS, AND THE SCENE IS RECONSTRUCTED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT AN INCIDENT IS
 * ---------------------------------------------------------------------------------------
 *
 * `design/incidents/ACCEPTANCE.md`, criteria I1 to I7, and a decision that rests on report
 * Q6PePpLDnU__. An incident is more than one problem: the scene is reconstructed, the causes
 * worked out, responsibility weighed for the person, the agents and the office, and the change that follows named. The
 * first incident is an experiment of 9 September (five starts, no trajectory), kept until now as report
 * lw8MnlO28ZxC and problem 4PJiqATNy7YH because no kind held it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT LIVES HERE, AND WHY IT IS NOT IN kinds.ts
 * ---------------------------------------------------------------------------------------
 *
 * The kind word, the state ladder, the door markers and the shapes a page and a door both need to
 * agree on, for the same reason `src/shared/notebook.ts` holds the same things for a notebook: this
 * file opens no database and is safe to import from a test that wants only a word, and the server
 * and the browser both read it so the two cannot drift apart about what an incident is.
 */

/**
 * THE KIND WORD, IN ONE PLACE. Everything that looks an incident up by kind reads this rather than
 * typing the word.
 */
export const INCIDENT_KIND = 'incident'

/** The address segment for the incidents list: `#/incidents`. */
export const INCIDENTS_SEGMENT = 'incidents'
/** The address segment for one incident: `#/incident/<id>`. */
export const INCIDENT_SEGMENT = 'incident'

/**
 * THE MARK A WRITE FROM THE TIMELINE DOOR CARRIES. Criteria I1 and I4.
 *
 * `timeline` is written by `POST /api/records/:id/timeline` and by nothing else: each moment says
 * who added it and when Mole Office wrote it down, and neither is a caller's to supply by hand, the
 * same argument `THE_NOTEBOOK_DOOR` makes for an entry. A word rather than a symbol so it survives
 * the JSON the patch path already logs, and one constant so the door and the guard cannot spell it
 * differently.
 */
export const THE_INCIDENT_TIMELINE_DOOR = 'writtenByTheIncidentTimelineDoor'

/**
 * THE MARK A WRITE FROM THE CLOSING DOOR CARRIES. Criterion I7.
 *
 * `state` moving to `closed` is refused on an ordinary patch unless this is set, so the one line
 * I7 asks for ("with one line saying so") cannot be skipped by a caller that sends `dataPatch:
 * {"state":"closed"}` directly and leaves `closedWith` empty. `POST /api/records/:id/close-incident`
 * is the only caller that sets it, and it is also where the person-or-secretary check lives.
 */
export const THE_INCIDENT_CLOSING_DOOR = 'writtenByTheIncidentClosingDoor'

/**
 * WHERE AN INCIDENT HAS GOT TO. Five words, in the order corrective work moves through them.
 *
 * `open` and absent are different, as they are for a problem: absent means nobody has said. Criteria
 * I1 and I2. THE LADDER IS NOT ENFORCED AS A ONE-WAY DOOR — nothing here refuses `verified` moving
 * back to `investigating` when a verification turns out to have been wrong — because nothing in the person's
 * words asks for that lock and a lock nobody asked for is the speculative abstraction invariant 6
 * refuses.
 */
export const INCIDENT_STATES = ['open', 'investigating', 'corrected', 'verified', 'closed'] as const
export type IncidentState = (typeof INCIDENT_STATES)[number]

/**
 * ONE MOMENT ON THE TIMELINE. Criterion I1: "a list of moments, each with a time, who or what, what
 * happened, and the record that is the evidence."
 *
 * `at` IS KEPT EXACTLY AS WRITTEN AND NEVER PARSED, the same choice `TimelineItem` in
 * src/shared/kinds/report-blocks.ts makes for a report's own timeline block, for the same reason:
 * "14 August, morning" and "09:12, five minutes before the first start" are both real answers, and
 * the order of the moments is the order they were appended in — nothing sorts or counts by the text
 * of `at`.
 *
 * `who` IS THE SUBJECT OF THE SENTENCE, not the agent that is typing the moment into Mole Office now:
 * who or what did the thing `what` describes — a person, an agent by handle, or a mechanism ("the
 * EGM controller", "the fifth start"). Attribution of WHO ADDED THIS MOMENT TO MOLE OFFICE is on the
 * record's own revision history, the way every other write in this product is attributed, and is
 * not a second field here — one fact in one place, invariant 9.
 */
export interface IncidentMoment {
  /** Unique within this incident. What an evidence press and a future edit would address. */
  id: string
  /** When it happened, kept exactly as written. Order is append order, not parsed time. */
  at: string
  /** Who or what did it: a name, a handle, or a mechanism. */
  who: string
  /** What happened. */
  what: string
  /** The id of the record that is the evidence for this moment. */
  evidence: string
}

/**
 * A DIRECT CAUSE OR A CONTRIBUTING FACTOR. Criterion I1: "each a sentence, linked to the problem it
 * is where one exists." One shape for both fields — `direct_causes` and `contributing_factors` — the
 * two lists differ only in which one a cause is placed on, never in what a cause is made of.
 */
export interface IncidentCause {
  /** Unique within this incident. */
  id: string
  /** The cause, as one sentence. */
  text: string
  /** The problem this cause is, when one exists as its own record. Absent where none does. */
  problemId?: string
}

/** A sentence weighing responsibility, with its uncertainty beside it. Criterion I1. */
export interface IncidentResponsibilityPart {
  /** The sentence itself. */
  sentence: string
  /** How sure this sentence is, in words — not a number invariant 8 gives no warrant for. */
  uncertainty: string
}

/** The agents' share of responsibility: the sentence, its uncertainty, and who by handle. */
export interface IncidentAgentsResponsibilityPart extends IncidentResponsibilityPart {
  /** The agents this sentence is about, by handle. Empty where no agent bears any part of it. */
  handles: string[]
}

/**
 * RESPONSIBILITY, IN THREE PARTS. Criterion I1: "the person, the agents by handle, the office."
 *
 * CHANGING THIS FIELD IS THE SECRETARY'S OR THE PERSON'S, and nobody else's — criterion I4.
 * `checkTheIncidentResponsibility` in server/lib/records.ts is the enforcement, on the patch path,
 * because these three sentences are the office's own account of who is answerable and an agent
 * that could rewrite them could rewrite its own share of the blame.
 */
export interface IncidentResponsibility {
  person: IncidentResponsibilityPart
  agents: IncidentAgentsResponsibilityPart
  office: IncidentResponsibilityPart
}

/**
 * ONE CORRECTIVE ACTION. Criterion I1: "each linked to the decision, the problem or the criterion it
 * became."
 *
 * `becameCriterion` IS A PLAIN STRING AND NOT A RECORD ID because a criterion — I6, N5, a new chapter
 * rule — is a line in a design document, not a Mole Office record; there is nothing to link. Where a
 * corrective action became a `decision` or a `problem`, `becameRecordId` names it and
 * `becameRecordKind` says which of the two it is, because the two live in different places on a
 * page and a reader has to be told which without opening the link.
 *
 * ITS OWN "STATE" (decided, built, verified) IS NOT STORED HERE. Criterion I3: "read from the
 * records they link, never typed twice." A corrective action's state is read, at display time, off
 * the decision or problem it names — whether that record exists, and what its own state says — and
 * storing a second copy of that state on the incident is exactly the drift invariant 9 exists to
 * stop.
 */
export interface IncidentCorrectiveAction {
  /** Unique within this incident. */
  id: string
  /** What the corrective action is, as one sentence. */
  text: string
  /** The record it became, when it became a decision or a problem. */
  becameRecordId?: string
  /** Which of the two `becameRecordId` names. Present exactly when `becameRecordId` is. */
  becameRecordKind?: 'decision' | 'problem'
  /** The criterion it became, e.g. "I6" or a rule's short name, when it became one of those instead. */
  becameCriterion?: string
}

/** How the fix will be shown to hold, and whether it has been. Criterion I1. */
export interface IncidentVerification {
  /** How the fix will be shown to hold: the check, the measurement, the test. */
  how: string
  /** Whether it has been verified yet. */
  verified: boolean
}

/** Where it happened: the project, the experiment or module, the machine. Criterion I1. */
export interface IncidentWhere {
  /** The project this incident belongs to. */
  project: string
  /** The experiment or module, when the incident is about one. */
  experimentOrModule?: string
  /** The machine, when the incident happened on one in particular. */
  machine?: string
}

/**
 * A SPAN OF TIME, FROM AND TO. Criterion I1's `happened_at`.
 *
 * NOT the `Span` shape src/shared/kinds/drawn-on.ts declares — that Span is a quoted passage's position inside a
 * block of text (a `quote`, a character `from` and `to`, and the `field` it is a position within),
 * an entirely different thing that happens to share two field names. Reusing it here would make a
 * reader of GET /api/kinds/incident hunt through a shape built for annotating prose to understand a
 * time range.
 *
 * `to` IS OPTIONAL. An incident still being investigated may have no known end yet, and absence
 * beats a guess — invariant 5.
 */
export interface IncidentSpan {
  /** When it started, kept exactly as written. */
  from: string
  /** When it ended, kept exactly as written. Absent where that is not yet known. */
  to?: string
}

/** What the closing door writes. Criterion I7: "with one line saying so." */
export interface IncidentClosedWith {
  /** The one line saying the corrective decisions are done. */
  note: string
  /** Who closed it: the person, or the secretary's handle. */
  by: string
  /** When it was closed. */
  at: string
}

/**
 * NEWEST OR OLDEST FIRST? NEITHER — TIMELINE ORDER IS APPEND ORDER. Criterion I1, and the same
 * choice `TimelineItem` makes: "the order of the items is the order you write them in." A notebook's
 * entries are read newest-first because a notebook is a log a reader dips into; an incident's
 * timeline is a story, and a story read out of order is a different, wrong story. `timelineInOrder`
 * exists so a page never has to remember this and never reaches for `.sort()` on `at`, which a
 * free-text field cannot honestly support anyway.
 */
export function timelineInOrder(moments: readonly IncidentMoment[]): readonly IncidentMoment[] {
  return moments
}

/** What a page says beside an incident with no timeline moments yet. Criterion I1's door refuses this at creation, so this is met only on a record written before that door existed, or read mid-write. */
export const NO_TIMELINE_YET_SAYS =
  'No timeline has been written for this incident. An incident record is refused at the door without one, so ' +
  'this is a record from before that door, or one being read while it is still being written.'

/** What a page says beside an incident whose responsibility sentences are not yet written. */
export const RESPONSIBILITY_NOT_WRITTEN_SAYS =
  'The secretary or the person has not weighed responsibility for this yet. That is an absence and not a ' +
  'finding: nobody has said, which is different from nobody being responsible.'

/** What a page says beside an incident with no corrective actions yet. */
export const NO_CORRECTIVE_ACTIONS_YET_SAYS =
  'No corrective action has been named for this incident yet. That is expected while it is still open or ' +
  'being investigated, and is itself a fact worth reading: nothing has been decided to change.'

/** What a page says where a corrective action names no decision, problem or criterion yet. */
export const CORRECTIVE_ACTION_UNLINKED_SAYS = 'Not yet linked to a decision, a problem or a criterion'
