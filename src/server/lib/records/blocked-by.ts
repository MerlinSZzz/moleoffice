// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE `blocked_by` READING: the report that names a real record behind a `blocked_by` string when no `blocks` link says
 * so, the shape that report takes, and `blockedByReport`. They were moved whole out of src/server/lib/records.ts, with no
 * change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`, and every caller still imports these names from
 * records.ts.
 *
 * THIS FILE IMPORTS records.ts FOR FIVE HELPERS: `GATED_LINK_TYPE`, `isJsonObject`, `liveMatches`, `named` and
 * `recordsByTitle`. Every reference it makes to that file is inside a function body, so the cycle is safe and nothing of
 * records.ts is read while it is still being evaluated.
 */
import { and, eq } from 'drizzle-orm'
import type { PanelRecord, RecordKind } from '@shared/types.ts'
import { db } from '../../db/client.ts'
import { links } from '../../db/schema.ts'
import { onlyTheMessagesThisReaderMayRead, type AMessageReader } from '../messages.ts'
import { GATED_LINK_TYPE } from '@shared/gated-link-type.ts'
import { liveMatches } from '@shared/live-matches.ts'
import { named } from '@shared/named.ts'
import { recordsByTitle } from '../records-by-title.ts'
import { isJsonObject } from '../../db/the-decision-names-this-fork.ts'

// ============================================== `blocked_by` AND A `blocks` LINK ARE ONE FACT
//
// THE HOUSE RULE IS ONE STATEMENT PER FACT, and this is the clearest place the product breaks it.
// `task.blocked_by` is published as "The TITLE of the record blocking it. Link it with a `blocks`
// link as well, so the graph knows." — a field that asks you to write the same thing twice, in the
// same request, and says so out loud.
//
// WHICH ONE IS CANONICAL: THE LINK. That is not a preference, it is a measurement. The `blocks`
// link is read by the gate rule, by the attention rule, by `unmetDependencies`, by the record page
// and by the graph. `data.blocked_by` is read by NOTHING — grep the repository and the only hits
// are the field's own declaration and the seed that fills it in. It is `session.workspace` again: a
// field an agent naturally reaches for, accepted with a 201, that reaches no reading surface.
//
// WHAT IS DONE ABOUT IT HERE, AND WHAT IS NOT. What this file can do, and now does, is refuse to
// let the field be a silent dead end: when `blocked_by` names a record that really exists and no
// `blocks` link says so, the write answers with the one request that files the fact where it is
// read. It does not write the link itself — a link carries its own author and its own date, and
// inventing one from a string would put a dependency in the graph that nobody stated.
//
// REMOVING the field from the published schema is the other half, and it is not this file's: the
// declaration is in src/shared/kinds.ts and there are stored values to migrate. It is written up as
// section 10 of design/DECISIONS-PENDING.md.

/** A `blocked_by` string that names a real record with no `blocks` link to back it up. */
export interface BlockedByReport {
  /**
   * The record named by the string, when the name means exactly one live record.
   *
   * NULL WHEN THE NAME MEANS SEVERAL. Titles may repeat, so a `blocked_by` string can answer to
   * more than one record, and there is then no blocker to name — `candidates` holds them instead.
   * It is not null in any other case: this whole report is absent when the name means nothing.
   */
  blocker: { id: string; kind: RecordKind; title: string } | null
  /**
   * Every live record the string names, when it names more than one. Absent otherwise.
   *
   * The reader is the one who knows which was meant, so all of them are handed over rather than one
   * being picked. `blocker` is null exactly when this is present.
   */
  candidates?: { id: string; kind: RecordKind; title: string }[]
  /** The sentence, and the request that files the fact where the graph reads it. */
  note: string
}

/**
 * Look at a record's stored `blocked_by`, and say so when it is the only statement of the fact.
 *
 * Silent in every case where there is nothing true to say: no `blocked_by`, a `blocked_by` that
 * names no live record — `obligation.blocked_by` is published as "a record title OR prose", so
 * prose is a correct answer there and scolding it would be wrong — or a `blocks` link already
 * filed.
 *
 * IT NEVER THROWS, AND THAT IS A REQUIREMENT RATHER THAN A HABIT. It runs on every record read and
 * on every write reply. It used to resolve the name with `getRecordByTitle`, which refuses a title
 * that names more than one record — so once titles may repeat, one ambiguous `blocked_by` string
 * would have turned `GET /api/records/:id` into a 409 for a record that is perfectly readable. The
 * ambiguity is REPORTED here instead, which is the only place it can be acted on.
 *
 * IT NAMES ONLY WHAT `reader` MAY READ. A title may be
 * a message's, and a message this reader may not read is left out of the matches before anything is
 * said, through `onlyTheMessagesThisReaderMayRead`. So such a message gets the answer a title naming
 * no record gets: its id and title are not in the report, and nothing says it was left out.
 */
export function blockedByReport(
  record: Pick<PanelRecord, 'id' | 'title' | 'data' | 'workspaceId'>,
  reader: AMessageReader,
): BlockedByReport | null {
  const data = record.data
  if (!isJsonObject(data)) return null
  const asked = data['blocked_by']
  if (typeof asked !== 'string' || asked.trim() === '') return null

  // The blocker is looked up in the record's OWN workspace. A title resolves inside one project,
  // so asking the default one about a record filed elsewhere would answer about a different record.
  const matches = onlyTheMessagesThisReaderMayRead(
    reader,
    liveMatches(recordsByTitle(asked.trim(), record.workspaceId)).filter((found) => found.id !== record.id),
  )
  if (matches.length === 0) return null

  if (matches.length > 1) {
    // NO LINK IS SUGGESTED, because the request would have to name one of them and choosing is the
    // thing this cannot do. The ids are here so the reader can choose in one step.
    return {
      blocker: null,
      candidates: matches.map(named),
      note:
        `\`blocked_by\` says "${asked.trim()}", and ${matches.length} live records in this project are called ` +
        `that: ${matches.map((found) => `${found.kind} ${found.id}`).join('; ')}. A title says what a record is ` +
        `called and an id says which record it is, so Mole Office will not pick one of them for you, and no link was ` +
        `written. File the dependency where the graph reads it, naming the one you mean: ` +
        `POST /api/links {"fromId":"<the id above>","toId":"${record.id}","type":"blocks"}.`,
    }
  }

  const blocker = matches[0] as PanelRecord
  const already = db
    .select({ id: links.id })
    .from(links)
    .where(and(eq(links.fromId, blocker.id), eq(links.toId, record.id), eq(links.type, GATED_LINK_TYPE)))
    .get()
  if (already) return null

  return {
    blocker: named(blocker),
    note:
      `\`blocked_by\` names a record that really exists — ${blocker.kind} ${blocker.id} "${blocker.title}" — but ` +
      `nothing links them, so the dependency is prose here and no reading surface can see it. A \`blocks\` link is ` +
      `where Mole Office keeps that fact: the attention rule, the gate, the record page and the graph all read it, and ` +
      `\`data.blocked_by\` is read by none of them. File it with ` +
      `POST /api/links {"fromId":"${blocker.id}","toId":"${record.id}","type":"blocks"} — and add ` +
      `{"gate":{"kind":"hard"}} if it stops this work completely. No link was written for you: a link carries its ` +
      `own author and date, and one invented from a string would be a dependency nobody stated.`,
  }
}
