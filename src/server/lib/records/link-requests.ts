// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * LINK REQUESTS: A RECORD AND ITS RELATIONSHIPS, IN ONE REQUEST, IN A MODULE OF THEIR OWN.
 *
 * The types and the one reader here were moved whole out of src/server/lib/records.ts with no change
 * of behaviour: the shape a create carries its links in, the two ends it names, and the reader that
 * turns a title into the one live record it means. records.ts hands the names on with `export *`, so
 * no caller changed.
 *
 * This file imports records.ts for liveMatches, recordsByTitle and titleNamesMoreThanOne. Every
 * reference it makes to records.ts is inside a function body, so the cycle is safe.
 */
import type { LinkType, PanelRecord, RecordKind } from '@shared/types.ts'
import { theMessagesHiddenFrom, type AMessageReader } from '../messages.ts'
import { PanelError } from '../panel-error.ts'
import { liveMatches } from '@shared/live-matches.ts'
import { recordsByTitle } from '../records-by-title.ts'
import { titleNamesMoreThanOne } from '@shared/title-names-more-than-one.ts'

// ================================================ A RECORD AND ITS RELATIONSHIPS, IN ONE REQUEST
//
// THE MEASUREMENT THIS ANSWERS. Seven agents recorded this project's own development through the
// API in one night. Every relationship was a second request, because POST /api/records took no
// links, and one agent made roughly forty requests to file eleven records. The links are not
// optional decoration: a claim nothing consumes and a task waiting on a result that does not exist
// are the two queries the whole typed-link system was built for, so a record filed without its
// links is a record the product cannot answer anything about.
//
// THE CONTRACT IS ALL OR NOTHING, and that is the whole design rather than a detail of it. The
// tempting shape — store the record, try each link, report which ones worked — was ruled out
// before it was written: it answers 201 for work that did not happen, and the caller is then
// holding a record whose relationships it has to check one at a time, which is the round trip this
// endpoint exists to remove. So a single unusable relationship refuses the WHOLE request, names
// which one and why, and leaves nothing behind: no record, no links, no change rows.
//
// WHAT MAKES THAT CHEAP RATHER THAN ARCHITECTURAL. `sqlite.transaction` already wraps the two
// writes `addBlock` makes, for exactly this reason — a block record in no pipeline's order is
// invisible on every page — and better-sqlite3 nests it as a savepoint when one is already open.
// The record insert, the change rows, the session repointing and every link therefore land or
// none of them do, and the rollback is the database's rather than a compensating delete of this
// file's own. Nothing was restructured to get it.
//
// THE SEPARATE POST /api/links STAYS, and is still the way to link two records that already
// exist, to add a gate to a link somebody else made, and to say something a while after the fact.
// This is the create that carries what the caller already knows at the moment it files.

/**
 * One relationship asked for on a create: its type, and the record at the OTHER end.
 *
 * The record being created is one end and is never named — it has no id yet. Which end it is comes
 * from which key you send, and that is the whole of the direction question:
 *
 *   {"type":"about","toId":"…"}       the new record is the FROM end: it is `about` that record.
 *   {"type":"blocks","fromId":"…"}    the new record is the TO end: that record `blocks` it.
 *
 * Exactly one of the four keys, and it is refused rather than resolved when two arrive: a request
 * naming both ends says the new record is not in the link at all, and one naming neither says
 * nothing. A title is resolved to a live record or refused; an id may name a deleted record,
 * because an id is exact and a task consuming a claim somebody has since retracted is a real thing
 * to file. Both rules are `liveRecordByTitle` and `createLink`, which is where they already lived.
 */
export interface LinkRequest {
  /** One of LINK_TYPES. Left out means `relates_to`, the documented default POST /api/links uses. */
  type?: LinkType
  /** The far end, by id, with the new record as the FROM end. */
  toId?: string
  /** The far end, by title, with the new record as the FROM end. */
  toTitle?: string
  /** The far end, by id, with the new record as the TO end. */
  fromId?: string
  /** The far end, by title, with the new record as the TO end. */
  fromTitle?: string
  /**
   * How hard the dependency is, on a `blocks` link. Checked by the same `checkGate` POST /api/links
   * uses, so this route cannot accept a gate that one refuses. Read as unknown and narrowed by
   * `readGateRequest` rather than declared a second time as a wire schema.
   */
  gate?: unknown
}

/** One end of a made link, resolved: what the id and the title really are. */
export interface LinkEndRef {
  id: string
  kind: RecordKind
  title: string
}

/** A relationship that was really written, named at both ends so a typed title can be checked. */
export interface CreatedLink {
  /** The link's own id. What DELETE /api/links/:id takes. */
  id: string
  /** The type that was really stored, which is `relates_to` when the request sent none. */
  type: LinkType
  from: LinkEndRef
  to: LinkEndRef
  /** Which end of this link the new record is. */
  newRecordIs: 'from' | 'to'
  /** What it now reads as, in the wording LINK_TYPES publishes for the type. */
  note: string
}

/**
 * The live record a typed name means, or a refusal saying which of the three ways the name failed.
 *
 * 404 — nothing goes by that name. 409 — the name belongs to a record that has been soft-deleted,
 * so the link would be broken the moment it was made. 409 — the name belongs to MORE THAN ONE
 * record, and the refusal names every one of them. The three are told apart because they are fixed
 * differently: a misspelling is fixed by typing again, a deleted record by restoring it or by
 * deciding you really did mean the deleted one, and a repeated title by naming the record by id.
 *
 * AMBIGUITY IS JUDGED OVER THE LIVE ROWS, and `liveMatches` in ../records.ts holds the whole reason. It used
 * to be judged over every row, live and deleted, and that was right only while a title could match
 * one row at most. Now that titles may repeat, deleting a record and writing it again under the
 * same name is ordinary, and judging over every row would refuse every link to the new record for
 * ever — the owner's own defect, moved from filing to linking.
 *
 * SEVERAL LIVE ROWS IS STILL A REFUSAL, before anything else is asked, because with several
 * candidates there is no "the record" whose state could be reported.
 *
 * ONE COPY OF A RULE THAT HAD TWO. `linkByTitle` in lib/records/link-by-title.ts and `startingRecord`
 * in api/links.ts each carried their own wording, and that file's own comment says the merge needs
 * the resolution lifted into this one — so here it is, and `linkByTitle` now calls it.
 * `sayHowToNameItById` is the only part that differs between callers, because the request that names
 * a record by id is a different request at each end and on each route, and a refusal that shows the
 * wrong one is worse than one that shows none. Both 409s use it: the deleted one names the one
 * record, the ambiguous one names each candidate in turn.
 */
export function liveRecordByTitle(
  title: string,
  sayHowToNameItById: (record: PanelRecord) => string,
  workspaceId: string,
  // WHO IS ASKING, when a door knows it. A message this reader may not read is
  // not counted among the records of that name at all: it is not found, not refused as deleted, and not
  // listed when several records share the name, as if it were not there. So where one record the reader
  // may read shares the name only with such messages, the name means that record, which is the only one
  // the reader can know of; the door's answer names the record it found.
  reader?: AMessageReader,
): PanelRecord {
  const every = recordsByTitle(title, workspaceId)
  const hidden = reader === undefined ? new Set<string>() : theMessagesHiddenFrom(reader, every.map((one) => one.id))
  const matches = hidden.size === 0 ? every : every.filter((one) => !hidden.has(one.id))
  const live = liveMatches(matches)
  if (live.length > 1) {
    throw new PanelError(
      titleNamesMoreThanOne(
        title,
        workspaceId,
        live,
        `Name the one you mean by its id — ${live.map(sayHowToNameItById).join(' Or ')}`,
      ),
      409,
    )
  }
  // The one live record, or — when nothing live answers to the name — the deleted rows, so that
  // the refusal below can say the name is held by something that has been deleted rather than
  // saying nothing goes by it. Oldest first, as `recordsByTitle` returns them.
  const target = live[0] ?? matches[0] ?? null
  if (!target) {
    // THE WORKSPACE IS NAMED IN THE REFUSAL, and this sentence is why the parameter above stopped
    // having a default. A title resolves inside ONE project, so "nothing here is called X" is a
    // statement about a project rather than about the installation — and a record of that name may
    // be sitting in the next workspace along, where this request has no business reaching. Saying
    // which project was searched turns a puzzling 404 into one the caller can act on.
    throw new PanelError(
      `Nothing in the workspace "${workspaceId}" is called "${title}". Titles resolve inside one project only, ` +
        `so a record of that name in another workspace is not this one and is not reached from here. Create it ` +
        `first — Mole Office will not invent a record to satisfy a link — or send x-mole-office-workspace naming the ` +
        `project the record you mean is in.`,
      404,
    )
  }
  if (target.deletedAt !== null) {
    // EVERY DELETED RECORD OF THAT NAME IS NAMED, not just the oldest. Titles may repeat, so a
    // name can be held by several deleted records at once, and a refusal that named one of them
    // would send the caller to restore a record that is not the one they remember.
    const others = matches.filter((record) => record.id !== target.id)
    throw new PanelError(
      [
        `"${title}" is a ${target.kind} that was deleted on ${target.deletedAt}, so nothing was linked.`,
        others.length === 0
          ? ''
          : `${others.length} other deleted record(s) in this project are called "${title}" too: ` +
            `${others.map((record) => `a ${record.kind} (${record.id})`).join('; ')}.`,
        `A name is how you point at a record you believe is current, and nothing current is called this: the`,
        `link would have been broken the moment it was made.`,
        `Two ways on, and only you know which you meant. If the record should be current again,`,
        `POST /api/records/${target.id}/restore and send this request again.`,
        `If you did mean the deleted record — a task that consumes a claim somebody has since retracted is a`,
        `real thing to record — name it by id, which says you have seen which record it is:`,
        sayHowToNameItById(target),
        `That is stored, and it is shown as broken on both records, which is the true state of it.`,
      ]
        .filter((sentence) => sentence !== '')
        .join(' '),
      409,
    )
  }
  return target
}
