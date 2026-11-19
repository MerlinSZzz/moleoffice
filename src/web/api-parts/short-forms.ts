// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13y, pages and speed. The browser's doors to short forms (zoom). Wave 13y's round 68 moved them here
// out of the one `api` object in src/web/api.ts; a line adds its new doors to its own part, and
// src/web/api-parts/join.ts joins every part into `api`.
import { json, request } from '../api.ts'
import type { ShortFormForRow, ShortFormsReading } from '../../server/lib/zoom.ts'
import type { ShortFormLevel } from '@shared/zoom.ts'

export const shortFormsDoors = {

  // -------------------------------------------------------------------------- shorter forms

  /**
   * EVERY READING LENGTH OF ONE RECORD, AND WHERE EACH ONE STANDS.
   *
   * All seven come back whether or not anybody has written them, each with one of six state words:
   * written and still current, written and the record has moved past it, written against a revision
   * this ledger does not hold, nobody has written one, this record cannot have that level at all, or
   * Full, which is the record itself. `why` carries the shared reason a position has no words:
   * `noPlace`, `tooShort` or `notWritten`. A screen draws the state; it never works one out, because
   * "has the record changed since these words were written" is a comparison against the revision
   * ledger and no read of the record does it.
   *
   * NOTHING IS SHORTENED TO FILL A GAP, here or on any screen that draws this. A length nobody has
   * written comes back empty with a sentence saying so.
   */
  shortForms: (recordId: string) =>
    request<ShortFormsReading>(`/api/records/${encodeURIComponent(recordId)}/short-forms`),

  /**
   * ONE LENGTH, FOR A WHOLE LIST OF RECORDS, IN ONE REQUEST.
   *
   * A list that asked per row would be a request per row, and what goes wrong then is not that it is
   * slow: a list that cannot afford to ask stops asking, and every row draws the same thing. Rows
   * come back for the records that are in this project; a shorter answer than the question means
   * some of the ids are elsewhere.
   */
  shortFormRows: (recordIds: readonly string[], level: ShortFormLevel) =>
    request<{ level: ShortFormLevel; rows: ShortFormForRow[]; asked: number; note: string }>(
      '/api/short-forms/rows',
      { method: 'POST', body: json({ recordIds: [...recordIds], level }) },
    ),

  /**
   * WRITE OR CLEAR SOME OF ONE RECORD'S SHORTER FORMS.
   *
   * `madeFrom` is the revision the words were written from and it is CHECKED against the ledger, so
   * it is never made up here: `revisions` below is where it comes from. A length named with `null`
   * is cleared; a length not named is left alone, so adding a brief does not drop a label.
   *
   * WHO WROTE IT IS NOT SENT. The route reads it off the actor headers this transport already
   * carries, so a person writing one from a browser is recorded as a person and marked on every
   * screen as an override of a form that is otherwise derived from the body. A field for it would
   * be the writer's own claim about themselves.
   */
  writeShortForms: (
    recordId: string,
    input: {
      madeFrom: { seq: number; contentHash: string }
      forms: Partial<Record<ShortFormLevel, string | null>>
    },
  ) =>
    request<ShortFormsReading>(`/api/records/${encodeURIComponent(recordId)}/short-forms`, {
      method: 'POST',
      body: json(input),
    }),
}
