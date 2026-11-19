// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
/**
 * `#/problem/<id>` — ONE PROBLEM'S OWN PAGE. Criterion E2.
 *
 * ---------------------------------------------------------------------------------------
 * THE ASK AND THE DECISION
 * ---------------------------------------------------------------------------------------
 *
 * A separate entry and interface was the answer to a report that named the
 * record kinds still without a page of their own. A decision says each of the three
 * kinds that report counted gets a page of its own, one kind at a time, after the pattern
 * the report page landed with. `message` was the second and this
 * is the third: 839 problems on 16 September.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PAGE DRAWS, AND WHY IT IS THE RECORD PAGE'S OWN COMPONENTS
 * ---------------------------------------------------------------------------------------
 *
 * A problem's page is the problem's sections as the record page draws them today — the title, what
 * breaks, what was tried, cause, why it hurts, how to tell it is back, seen in, found by, whose move
 * it is, the state and the fix, and what the problem is joined to — on a page of its own, under its
 * own breadcrumb (Everything / Work to do / title) and marked in its own row of the rail.
 *
 * `RecordDetail`, `WhatWasTried` and `WhoseMoveSays` are the record page's own components, used here
 * rather than copied. That is deliberate: a second drawing of one problem would be free to disagree
 * with the first, and a comment left on the symptom on this page would not light up on the same
 * problem's record page. So this page declares no surface of its own for those panels — the names
 * they carry are the record's own sections, `section.symptom`, `section.attempts`,
 * `section.whoseMove` — and the two addresses for one problem stay one page in two places.
 *
 * ---------------------------------------------------------------------------------------
 * THE DOORS ARE THE ONES THAT EXIST
 * ---------------------------------------------------------------------------------------
 *
 * `useAsyncRecord` is the record page's own request group, now exported rather than asked for a
 * second time. The context read is `GET /api/records/:id/context`, the same door the record page's
 * *whose move* panel reads. Nothing here writes except through the record page's own state control,
 * and the page reads `/edit` off the route the way the record page does: reading is what a fresh
 * visit gets, and `/edit` is where the state control that closes a problem appears.
 *
 * ONE PRESS IS DRAWN OUTSIDE `/edit`: THE PERSON'S CLOSE PRESS, `CloseThisProblem`, which lives in
 * src/web/components/CloseThisProblem.tsx since problem `KyoZmFiuv9ma`, because the record page draws
 * the same press at `#/r/<id>` and one press drawn by two pages must be one component. The person opened a
 * problem whose move was theirs and found no way to close it, because the state control is behind an
 * address the page does not point to (problem `QbIyPcjwZpNk`). The press writes through the same door
 * as the state control, `PATCH /api/records/:id` with a `dataPatch`, so it adds no second way to write
 * a problem's state. Beside it the page draws where the problem stands, as the state chip every page
 * draws, because the state control behind `/edit` was the only place this page said it.
 *
 * A RECORD FROM ANOTHER KIND IS STILL DRAWN PLAINLY. A `#/problem/<id>` whose id names something
 * that is not a problem draws that record: the page only differs from the record page by its header
 * and its address, and a page that hid a record because the address guessed wrong would be the
 * silent substitution the ninth rule refuses.
 */

import { ATTEMPTS_KEY, WHOSE_MOVE_KEY } from '@shared/sections.ts'
import { KIND_SPECS } from '@shared/kinds.ts'
import { stateOf } from '../components/family/read.ts'
import type { RecordKind } from '@shared/types.ts'
import { moleOfficeRequest } from '../api.ts'
import { ErrorNote, Loading, StoredState } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { WritingThisRecord } from '../components/AnotherWriter.tsx'
import { CloseThisProblem } from '../components/CloseThisProblem.tsx'
import { WhoClosedIt } from '../components/WhoClosedIt.tsx'
import { useRoute } from '../components/router.tsx'
import { sectionsOf } from '../components/sections.ts'
import { SideBySide } from '../components/SideBySide.tsx'
import type { GatedLink } from '../components/LinkPanel.tsx'
import type { OpenLoops } from '../../server/lib/openloops.ts'
import {
  bodySections,
  RecordDetail,
  useAsyncRecord,
  WhatWasTried,
  WhoseMoveSays,
  Crumbs,
  RECORD_CSS,
  type RecordPageData,
} from './RecordPage.tsx'

/**
 * THE PAGE. One problem by id, in the record page's own reading.
 *
 * A read that fails is drawn as the failure it is, with the reason on it, rather than as an empty
 * problem; criteria E4 and E5 hold that on every page.
 */
export function ProblemPage({ id }: { id: string }) {
  // WHETHER THE ADDRESS SAYS EDIT, read here as well as below, because the record page's request
  // group reads the pickers' titles only then.
  const route = useRoute()
  const [state, reload] = useAsyncRecord(id, route.name === 'problem' && route.edit === true)
  return (
    <div className="page pp">
      <style href="mole-office-problem" precedence="default">
        {PROBLEM_CSS}
      </style>
      {/* THE RECORD PAGE'S OWN STYLESHEET, because this page draws the record page's own components.
          Without it the breadcrumb, the header line and the body folds lose their layout. */}
      <style href="mole-office-record" precedence="default">
        {RECORD_CSS}
      </style>
      {state.status === 'loading' ? <Loading what={t('pageWords.ProblemPage.001')} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} retry={reload} /> : null}
      {state.status === 'ready' ? <TheProblemView key={id} id={id} data={state.value} reload={reload} /> : null}
    </div>
  )
}

/** True when this kind declares this field, so a section can be asked for without throwing. */
function declares(kind: RecordKind, key: string): boolean {
  return KIND_SPECS[kind]?.fields.some((f) => f.key === key) === true
}

/**
 * THE PROBLEM, GIVEN WHAT WAS READ.
 *
 * The page's own heading is the title, as the record page's is; everything under it is the record
 * page's own drawing, so a fix to how a problem's symptom or attempts are drawn reaches both pages.
 */
function TheProblemView({
  id,
  data,
  reload,
}: {
  id: string
  data: RecordPageData
  reload: () => void
}) {
  const route = useRoute()
  // THE RECORD PAGE'S OWN RULE, read off this route: reading unless the address says the reader
  // asked to write. The state control that closes a problem lives behind this, exactly as it does
  // on the record page.
  const editing = route.name === 'problem' && route.edit === true
  const record = data.detail.record
  const standing = stateOf(record)
  const links = data.detail.links as readonly GatedLink[]
  const relationsHere = links.map((l) => l.label)
  // AND THE PICKERS' TITLES IN HAND, the record page's own third condition; see `writable` there.
  const writable = editing && record.deletedAt === null && data.titles !== null

  // WHAT IS STILL OPEN AROUND THIS RECORD, fetched once for *whose move*, which reads who filed it
  // from the same reply. `updatedAt` is a dependency for the reason the record page gives: a write to
  // this record is exactly what can change the answer.
  const [openLoops] = useProjectAsync(
    () => moleOfficeRequest<OpenLoops>(`/api/records/${encodeURIComponent(id)}/context`),
    [id, record.updatedAt],
  )

  const sectionHere = sectionsOf({ ...record, relations: relationsHere })

  return (
    // EVERY FORM ON THIS PAGE WRITES ON THE VERSION THE PAGE DRAWS, as on the record page, so the close form and the
    // forms behind /edit ask when another writer changed the problem since.
    <WritingThisRecord recordId={record.id} kind={record.kind} drawn={{ version: data.detail.version, seq: data.detail.revisionSeq }}
      editing={editing} participants={data.participants}>
      <Crumbs record={record} />
      {/* THE PROBLEM'S OWN TITLE IS THE HEADING, as a record's is, and not a typed name. */}
      <h1 className="pp-title wrap-anywhere">{record.title}</h1>

      {/* WHERE THE PROBLEM STANDS, AND THE PERSON'S CLOSE PRESS BESIDE IT, under the title so both
          are in view at every width. The record page's own state control is drawn only behind /edit,
          so before this line a reader of this page could not see whether the problem was open or
          fixed (problem QbIyPcjwZpNk). The chip is the product's one drawing of a stored state.
          The press draws nothing for an agent, for a problem whose move is not the person's, and for one that
          has already ended. On a problem that has ended, WhoClosedIt says who closed it, read from
          the change log, so the person can see a close a secretary made and reopen it. */}
      <div className="pp-standing">
        <StoredState
          state={standing.word}
          progress={standing.progress}
          kind={record.kind}
        />
        <CloseThisProblem record={record} onChanged={reload} />
        <WhoClosedIt record={record} log={data.log} participants={data.participants} />
      </div>

      {/* THE RECORD PAGE'S OWN TWO COLUMNS, rp-sides, drawn by the product's one width rule in
          components/SideBySide.tsx. The problem itself is the first column and who made it and whose
          move it is is the second, in the order the record page writes them. So a problem reads the
          same at both of its addresses: side by side on a wide screen, and the second column under
          the first on a narrower one. */}
      <SideBySide className="rp-sides">
      <div className="rp-main" data-column="start">
      {/* WHAT WAS ALREADY TRIED, in the order it was written. `WhatWasTried` draws nothing when
          nothing has been recorded, which is the record page's own rule. */}
      {declares(record.kind, ATTEMPTS_KEY) ? (
        <WhatWasTried record={record} declares={sectionHere(ATTEMPTS_KEY)} />
      ) : null}

      {/* EVERYTHING ELSE A RECORD IS: the symptom, the body folds — cause, why it hurts, how to tell
          it is back, seen in, found by, the fix — the state control, and the links both ways. It is
          the record page's own component so the two cannot come to two answers about one problem. */}
      <RecordDetail
        record={record}
        editable={writable}
        deleted={record.deletedAt !== null}
        records={data.records}
        detailLinks={links}
        relations={relationsHere}
        evolutionLinks={data.links}
        log={data.log}
        participants={data.participants}
        titles={data.titles}
        titleById={data.titleById}
        unfilledByRecord={data.unfilledByRecord}
        body={bodySections(record)}
        onChanged={reload}
        pickUpCost={data.detail.pickUpCost ?? null}
      />
      </div>

      <div className="rp-side" data-column="end">
      {/* WHO MADE THIS AND WHOSE MOVE IT IS, on the kinds that declare the field. A problem declares
          it; a record reached here from another kind that does not would otherwise take the page
          down, which is why the declaration is asked before the section is. */}
      {declares(record.kind, 'whose_move') ? (
        <WhoseMoveSays
          record={record}
          context={openLoops}
          question={data.detail.whereTheQuestionIs}
          declares={sectionHere(WHOSE_MOVE_KEY)}
          participants={data.participants}
        />
      ) : null}
      </div>
      </SideBySide>
    </WritingThisRecord>
  )
}

/**
 * THIS PAGE'S OWN RULES. Stylesheets for one page live with the page, the way the incident page's and
 * the message page's do; every value is a token and no colour or type size is written out here.
 */
const PROBLEM_CSS = `
.pp { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }
.pp-title { margin: 0; font-size: var(--fs-6); font-weight: 600; line-height: var(--lh-tight); overflow-wrap: anywhere; }
.pp-standing { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad) var(--gut); min-width: 0; }
`
