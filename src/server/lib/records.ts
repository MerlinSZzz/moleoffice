// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The core operations. Everything the API does goes through here.
 *
 * Three rules are enforced in this file rather than left to callers:
 *
 *   1. Every write records who made it, in the `changes` table. There is no way to change a
 *      record without leaving a trace, because the dated views and the session-to-page links
 *      are both built from that trace.
 *
 *   2. Deleting a record never removes it. Links pointing at a deleted record are shown as
 *      broken. A link that silently disappeared would be a silent fallback, and finding out
 *      later that a connection used to exist is exactly the failure Mole Office is built to stop.
 *
 *   3. Every write's `data` is checked against the kind's field list before it is stored, by
 *      validateRecordData in ./validate.ts. It is enforced here rather than in the route so
 *      that the seed script, the tests and any future importer get the same answer as HTTP
 *      does. Until this phase the check did not exist at all: a module posted with
 *      {"contxet":"typo","parts":"should be an array"} was answered with a 201 and rendered
 *      as a broken page nobody who wrote it would ever look at.
 *
 *      That gate is strict about WRONG and relaxed about UNFINISHED. A misspelt key, a wrong
 *      type or a broken cross-field rule throws and nothing is stored; a field that is simply
 *      not there yet is stored and REPORTED. So a write returns two things now: the record,
 *      and what that record is still missing. createRecordWithReport and patchRecord hand both
 *      back; createRecord and updateRecord are the same calls with the report dropped, for the
 *      callers that only want the row.
 *
 *      The report is never stored. There is no `incomplete` column and there must not be one:
 *      it is derived from the same specs on every read by completenessOf, so it cannot go stale
 *      behind a spec that changed. incompletenessOf below is the server's way in to that.
 */

import { and, or } from 'drizzle-orm'
import { db } from '../db/client.ts'
// THE REFUSAL CLASS IS IN ITS OWN FILE, which opens no database, so lib/export.ts can name it without loading the client.
// It is exported from here as before.
import { PanelError } from './panel-error.ts'
export { PanelError }
// The planning tables a kind change has to ask about are here beside the rest. They are read
// and never written by this file: see `plannedAgainst`, which asks what a plan already points at
// before a record is allowed to stop being work a plan may give time to.
import {
  links,
  records,
} from '../db/schema.ts'
// How a pipeline's own drawing is keyed, borrowed rather than built here for the reason that
// declaration gives: two spellings of one scope would be two drawings. Read only — see
// `drawingLeftBehind`, which warns when a kind change puts a saved drawing out of reach.
import { localStamp } from '@shared/time.ts'
// HOW LONG A MESSAGE'S WRITER MAY CHANGE ITS WORDS. See `whatAChangeToAMessageMustCarry`.
import {
  type PanelRecord,
  type GatedLink,
  type LinkGate,
  RESOLVES_PROPOSAL,
} from '@shared/types.ts'
// THE CONTENT OF A RECORD AND THE TOKEN THAT NAMES IT. Declared in a file that opens no database, so
// that the revision backfill — a migration, which may not import this one — reads the same hash.
// `versionOf` is re-exported below, where every caller has always read it.
import { versionOf } from './version.ts'
// WHETHER WHAT A NOTE POINTS AT IS REALLY THERE. It is the only kind-specific check this file cannot
// answer for itself, because the vocabulary of things a person can point at is declared once, in
// src/shared/targets.ts, and looking one up is that file's server half.
//
// THAT MODULE IMPORTS THIS ONE, so the two are a cycle. It is safe and it is not accidental: every
// reference lib/targets.ts makes to this file is INSIDE a function body, so nothing of this module
// is read while it is still being evaluated. The alternative was a second copy of "is that record
// there, in this project" living here, which is the defect this repository names as its own.
import {
  onlyTheMessagesThisReaderMayRead,
  refuseAMessageThisReaderMayNotRead,
  type AMessageReader,
} from './messages.ts'
// WHERE A MESSAGE GOES WHEN ITS ADDRESSEE CANNOT BE REACHED.
// READ ONLY INSIDE A FUNCTION BODY AND NEVER WHILE THIS MODULE IS BEING EVALUATED:
// lib/superiors.ts imports lib/worker.ts, which imports this file, so the three are a cycle — the
// same safe shape the import of lib/messages.ts below this line already has, and for the same reason.
import { MESSAGE_CENTRE } from '@shared/workspaces.ts'
// READ ONLY INSIDE A FUNCTION BODY: lib/move.ts imports this file.
// WHERE A WRITE CAME FROM, measured from the connection. Nothing here measures it; `asAMessageStoresIt` puts the
// person's name on a measured address they have named.
// A SHORT FORM'S STAMP AND ITS AUTHOR, settled on both write paths. `data.shortForms` has two doors
// — POST /api/records/<id>/short-forms and an ordinary write of the field — and until 19 August 2026
// only the first checked the revision the words name or worked out who wrote them. See the note on
// `settleShortForms` for what an agent could store through the second.
//
// THAT MODULE IMPORTS THIS ONE, exactly as lib/targets.ts and lib/revisions.ts above do, and it is
// safe for the same reason: every reference it makes to this file is inside a function body, so
// nothing of this module is read while it is still being evaluated.
export * from './records/reading.ts'
import { getRecord } from './records/reading.ts'
export * from './records/page-reads.ts'
export * from './records/queries.ts'
export * from './records/territory.ts'
export * from './records/run-writes.ts'
export * from './records/change-log.ts'
export * from './records/filed-from.ts'
export * from './records/anchors.ts'
export * from './records/attention.ts'
export * from './records/delete-restore.ts'
export * from './records/creating.ts'
export * from './records/patching.ts'
export * from './records/updating.ts'
export * from './records/obligations.ts'
export * from './records/created-between.ts'
export * from './records/blocked-by.ts'
export * from './records/setting-changes.ts'
export * from './records/decisions-naming-a-fork.ts'
export * from './records/pipeline-membership.ts'
export * from './records/registration-doors.ts'
export * from './records/file-records-in-workspace.ts'
export * from './records/the-other-ends-of.ts'
export * from './records/link-by-title.ts'
export * from './records/unregistered-agent.ts'
export * from './records/near-duplicate-titles.ts'
export { readLinkGate } from './records/stored-link-gates.ts'
export * from './records/link-readers.ts'
export * from './records/main-suite-fix-checks.ts'
export * from './records/link-requests.ts'
export * from './records/notebook-entries.ts'
export * from './records/who-files-an-incident.ts'
export * from './records/pipeline-blocks.ts'
export * from './records/who-recorded-it.ts'
export * from './records/export-list-guards.ts'
export * from './records/implementation-map-gates.ts'
export * from './records/actor.ts'
import { type Actor } from './records/actor.ts'
export * from './records/session-names.ts'
export * from './records/save-revision.ts'
export * from './records/merge-data.ts'
export * from './records/record-by-title.ts'
export * from './records/same-agent.ts'
export * from './records/own-words.ts'
export * from './records/human-only.ts'
export * from './records/fork-settled.ts'
export * from './records/fork-settling.ts'
export * from './records/restrictions.ts'
export * from './records/link-gates.ts'
export * from './records/decision-core.ts'
export * from './records/planning-guards.ts'
export * from './records/asks-and-commitments.ts'
export * from './records/taking-back.ts'
export * from './records/the-persons-own-acts.ts'
export * from './records/may-write.ts'
export * from './records/checklist-items.ts'
export * from './records/addressed-run.ts'
export * from './records/links.ts'
export * from './records/what-a-decision-files.ts'
export * from './records/governance-guards.ts'
export * from './records/served-doors.ts'
export * from './records/broadcast-settings.ts'
import { now } from '@shared/now.ts'
import { thePersonIsProved, theWordsAllowThis } from '@shared/the-person-proved.ts'
import { readLinkGate } from './records/stored-link-gates.ts'
import { DECISION_KIND } from '@shared/decision-kind.ts'
import { isJsonObject } from '../db/the-decision-names-this-fork.ts'
import { toRecord } from './to-record.ts'
import { liveMatches } from '@shared/live-matches.ts'
import { recordsByTitle } from './records-by-title.ts'
import { logChange } from './log-change.ts'
import { named } from '@shared/named.ts'
import { noRecordHasThisId } from './no-record-has-this-id.ts'
import { incompletenessOf } from '@shared/incompleteness-of.ts'
import { resolveSessionRef } from './resolve-session-ref.ts'

// Declared in @shared/time.ts and handed on here, where its callers import it.
export { localStamp }

export { now }

export { MIGRATION_ROUTE, SESSION_NAME_FIELD, resolvedSessions, sessionCacheKey, sessionNamesOf, boundToName, sessionRefFor, sessionFiledElsewhere, resolveSessionRef } from './resolve-session-ref.ts'

export { sessionsIn, modelOfTheRun } from './sessions-in.ts'

export { logChange, thePressRowOf, writeThePressRow, provedByWritten, warrantWritten, elevationWritten, signedItemWritten, provedHolderWritten, theProjectARecordsRowsAreFiledIn, attributionFor, theSessionARowNames } from './log-change.ts'

export { theReasonsOfThePresses } from '../db/the-reasons-of-the-presses.ts'

export { toRecord } from './to-record.ts'

import { theCallersAgentRow } from './records/the-callers-agent-row.ts'
export { theCallersAgentRow } from './records/the-callers-agent-row.ts'

export { newestFirstBy } from '@shared/newest-first-by.ts'

export { named } from '@shared/named.ts'

// Declared in src/server/db/version.ts and handed on here, where its callers import it.
export { versionOf }

// ---------------------------------------------------------------------------- records

export { incompletenessOf } from '@shared/incompleteness-of.ts'

/**
 * The record with this id IN THIS PROJECT, or a refusal that names where it actually is.
 *
 * ---------------------------------------------------------------------------------------
 * WHY AN ID IS NOT ENOUGH, EVEN THOUGH IT IS UNIQUE
 * ---------------------------------------------------------------------------------------
 *
 * A nanoid is unique across the whole database, so `getRecord` can always find the row. That is
 * exactly the problem: it made every by-id route — GET, PATCH, DELETE, restore, promote, discharge,
 * the checklist, the blocks — answer about any project from a request that named none. Measured
 * before this existed: `GET /api/records/<a greenhouse record>` with no workspace header served the
 * record in full, 200, with `workspaceId` in the body and nothing anywhere saying a boundary had
 * been crossed.
 *
 * A read has to answer about ONE workspace, so a record in another one is NOT FOUND HERE — and the
 * refusal says where it is rather than pretending it does not exist. There is no access model in
 * Mole Office and nothing is being hidden: a person who reads this needs to know that the id is real and
 * that they are standing in the wrong project, because the fix is one header and the alternative is
 * hunting for a record that is right there.
 *
 * 404 AND NOT 403. 403 would be a claim about permission, and there is none: the same caller may
 * send the same request with the workspace named and get the record. It is not found HERE.
 */
export function recordInWorkspace(
  id: string,
  workspaceId: string,
  // WHO IS ASKING, when a door knows it. A message this reader may not read is
  // refused before anything is read, written or quoted, whichever project it is in, with the refusal an
  // id naming nothing gets, so the answer does not say the message is there and the refusal below never
  // gives such a reader the message's title. Left out by a caller that answers no request.
  reader?: AMessageReader,
): PanelRecord {
  if (reader !== undefined) refuseAMessageThisReaderMayNotRead(reader, id, () => noRecordHasThisId(id))
  const record = getRecord(id)
  if (record === null) throw noRecordHasThisId(id)
  // A MESSAGE BELONGS TO NO PROJECT: it is kept in the message centre and reached from any
  // project, and who may read it is the reader rule above, asked whatever project the request named.
  if (record.workspaceId !== workspaceId && record.workspaceId !== MESSAGE_CENTRE) {
    // WHAT TO DO, NOT WHAT TO SEND, AND NOW NOT EVEN THAT. The sentence used to end "Send
    // x-mole-office-workspace: greenhouse to work in the project that record belongs to", which is
    // an instruction to a program; then "Switch to greenhouse and open it there", which is an
    // instruction to a person naming the project by its stored id. Both told somebody in words to
    // do a thing the product could do for them, and both put an id where a name belongs — the
    // sidebar in the same screenshot said Greenhouse and Mole Office.
    //
    // So the sentence says only what is true, the ids go to `elsewhere` where the browser turns
    // them into a name and a button, and the exact header stays in `detail`, which is where the
    // wire belongs. See ErrorNote and WrongTurn in src/web/components/ui.tsx.
    throw new PanelError(
      `"${record.title}" is in another project.`,
      404,
      `No record with id ${id} in the workspace "${workspaceId}". That id names "${record.title}", which is in ` +
        `"${record.workspaceId}" — a different project. Every read and every write answers about one workspace, ` +
        `so this request was answered about "${workspaceId}" and found nothing. Send ` +
        `x-mole-office-workspace: ${record.workspaceId} to work in the project that record belongs to.`,
      { title: record.title, workspaceId: record.workspaceId, recordId: record.id },
    )
  }
  return record
}

export { noRecordHasThisId, NO_SUCH_RECORD } from './no-record-has-this-id.ts'

export { recordsByTitle } from './records-by-title.ts'

export { liveMatches } from '@shared/live-matches.ts'

export { titleNamesMoreThanOne } from '@shared/title-names-more-than-one.ts'

/**
 * THE LIVE RECORDS ALREADY CALLED THIS, oldest first, that this reader may know of: the `sameTitle` list a
 * create answers with, and the rename on PATCH /api/records/:id. A message the reader may not read is not
 * in it, because the list gives each record's id and title. `reader` is absent for
 * a caller whose answer no agent reads, which then gets every record of the name.
 */
export function theRecordsAlreadyCalled(
  title: string,
  workspaceId: string,
  reader: AMessageReader | undefined,
): PanelRecord[] {
  const live = liveMatches(recordsByTitle(title, workspaceId))
  return reader === undefined ? live : onlyTheMessagesThisReaderMayRead(reader, live)
}

// ------------------------------------------------------------------ merging one key into data

export { isJsonObject, theDecisionNamesThisFork, aLinkFromTheDecisionToTheFork } from '../db/the-decision-names-this-fork.ts'
export { type RecordPatch, THE_START_AN_AGENT_DOOR, THE_OFFICES_OWN_LINE, THE_OFFICE_FOLDS_ITS_LINES, THE_DEAD_LETTER_SWEEP, checklistLines } from './records/record-patch.ts'

/**
 * Soft delete. Links pointing here become broken, and stay visible.
 *
 * HUMAN-ONLY KINDS ARE REFUSED HERE, as they are in the four other functions that write a record.
 * Deleting is a write: `listRecords` filters deleted rows out, so the record leaves GET
 * /api/records and every page built from it, and only the change log still says it existed. An
 * agent that could do that could take away a decision it is not allowed to write one word of,
 * which is the same guarantee broken from the other end.
 *
 * The guard runs BEFORE the already-deleted early return, on purpose. That return means "nothing
 * to do", and answering it to an agent would tell the agent it was allowed — the next decision it
 * meets, the live one, would be deleted on that belief. Whether a request is permitted and whether
 * it would change anything are two separate questions and this answers the first one first.
 */

// ------------------------------------------- is the agent asking the agent that wrote this already

import { everyAgentAStoredStampCouldName } from '../db/every-agent-a-stored-stamp-could-name.ts'
export { everyAgentAStoredStampCouldName } from '../db/every-agent-a-stored-stamp-could-name.ts'

export { THE_AGENT_WORKER_ID, AGENT_IDS_THAT_NEED_NO_REGISTRATION } from '@shared/agent-ids-that-need-no-registration.ts'

// ---------------------------------------------------------------- acting on the person's own words

export { theWordsAllowThis }

export { thePersonIsProved }

// ---------------------------------------------------------------------------------------

export { DECISION_KIND } from '@shared/decision-kind.ts'

/** The link that marks a proposal resolved, declared in src/shared/types.ts so the proposal page names the same type. */
export { RESOLVES_PROPOSAL }

// ---------------------------------------------------------------------------- gates on links

export { GATED_LINK_TYPE } from '@shared/gated-link-type.ts'

/**
 * A gate as it is SERVED, on either end of the link. Declared in src/shared/types.ts and re-exported
 * here, so that this file's callers do not have to move and the browser reads the same declaration.
 *
 * It used to be declared here, mirrored as OPTIONAL in the browser's LinkPanel.tsx, and left out of
 * `RecordDetail` in web/api.ts altogether — one fact in three places, two of which could go wrong
 * with nothing failing. See the note on `LinkGate` in shared/types.ts for what the three fields mean
 * and why they are required.
 */
export type { GatedLink, LinkGate }

// `countChanges` and `toSharedChange` are declared in their own files and handed on here, once.
export { countChanges } from '../db/count-changes.ts'

export { toSharedChange } from '@shared/to-shared-change.ts'
