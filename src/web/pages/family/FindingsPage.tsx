// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { familyWord } from '@shared/words.ts'
import { t } from '@shared/i18n.ts'
/**
 * `#/findings` — what this project has measured, and what it is still exploring.
 *
 * ---------------------------------------------------------------------------------------
 * A ROW HERE EXISTS TO HELP SOMEBODY FIND ONE FINDING. THAT IS ITS WHOLE JOB
 * ---------------------------------------------------------------------------------------
 * The Findings list used to show too much. A row should help the reader find the Finding: a clear
 * title, small type and state information where useful, an important warning or context only when
 * needed, and more space between items. The numbers, the evidence and the method are on the Finding's
 * own page.
 *
 * The same rule holds for every list in the product: **lists locate, detail pages
 * explain.** It is written into docs/UX-CONTRACT.md, and the test it gives is one sentence — read
 * one row, could you pick this item out of twenty. A field that informs rather than identifies
 * belongs on the page behind the row.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PAGE WAS DRAWING, MEASURED ON THE LIVE CORPUS
 * ---------------------------------------------------------------------------------------
 * Every claim and every direction in the `panelx` workspace was rendered through this page on
 * 16 August 2026 and the text on each row counted. The worst row drew **14 separate pieces of
 * text**, six of which were the same six labels on every row — `numbers`, `How it was measured`,
 * `measured on`, `method`, `confidence`, `what it is` — carrying **2,095 characters** of somebody's
 * stored prose. Eight of those pieces were on the screen before anything was pressed.
 *
 * A label printed on all seventeen rows is furniture. It never tells one row from another, which is
 * the only thing a list row is for.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A ROW DRAWS NOW (the family lists' design, report n9Mjk3c_sJRu block b-17)
 * ---------------------------------------------------------------------------------------
 *   THE TITLE, the record's own on both kinds, as on every other list in Mole Office.
 *   A SECOND LINE ONLY WHERE SOMEBODY HAS TO ACT: a blocked direction says "Blocked", in the one
 *   warning colour this page spends. The owner, 16 August 2026: "I would rather the list primarily
 *   help me find the Finding: clear title; small type/state information where useful; genuinely
 *   important warning/context if needed." So no summary is drawn under a finding's title.
 *   AT THE RIGHT, in fixed columns: a claim's stored state word (the shared chip; said once beside
 *   the heading when every claim carries the same one), or a direction's depth as a word and six
 *   small marks; and when the record last changed.
 *   The marks every list row carries, with "Made-up example" said once at the heading when every
 *   row of the list is one.
 *
 * The summary, `method`, `measured on`, `confidence`, `numbers`, `what is next` and the reason a
 * direction is blocked are still stored, and the record's own page draws every one of them. One press on the row
 * opens it.
 */

import { useMemo } from 'react'
import { DIRECTION_DEPTHS } from '@shared/types.ts'
import type { RecordListItem } from '../../api.ts'
import { FamilyHead, PageFoot, QuickFile, sharedOrigin } from '../../components/family/parts.tsx'
import { FamilyLists, ListGroup, ListRow, OrderFold } from '../../components/family/list.tsx'
import { readClaim, readDirection, type ClaimReading, type DirectionReading } from '../../components/family/read.ts'
import { recordPath } from '../../components/router.tsx'
import { Absence, DEPTH_MEANING_KEYS, DEPTH_WORD_KEYS, Stamp, StoredState } from '../../components/ui.tsx'

/** Measured claims fold: they are the archive of what is known, read by search more than by scroll. */
const CLAIM_FOLD = 10

/**
 * THE PAGE, in the family lists' one design (components/family/list.tsx): the head, then one list
 * for the directions being explored and one for the measured claims, then the fold on the order.
 *
 * NO NEEDS YOU. Nothing on this page waits on a person. A blocked direction does not count: under
 * question 18, a blocked line of work is not shown
 * first, as something for the person, until the record says who it waits on, and no direction stores that.
 * The row still says it is blocked, on its second line.
 */
export function FindingsPage({
  records,
  onFiled,
}: {
  records: readonly RecordListItem[]
  onFiled: () => void
}) {
  const { claims, directions } = useMemo(
    () => ({
      claims: records.filter((r) => r.kind === 'claim').map(readClaim).sort(newestFirst),
      directions: records.filter((r) => r.kind === 'direction').map(readDirection).sort(newestFirst),
    }),
    [records],
  )
  const directionOrigin = sharedOrigin(directions.map((d) => d.record))
  const claimOrigin = sharedOrigin(claims.map((c) => c.record))
  // THE ONE WORD ALL THE CLAIMS SHARE, WHEN THEY SHARE ONE, said once beside the heading instead of
  // on every row (rule R11). See `oneWordForAll`.
  const shared = oneWordForAll(claims)

  return (
    <div className="fam-findings">
      <style href="mole-office-findings" precedence="default">
        {FINDINGS_CSS}
      </style>
      <FamilyHead
        // THE TITLE IS THE FAMILY'S OWN LABEL, READ FROM THE DECLARATION, so the rail row and this
        // heading are one string and not two.
        title={familyWord('findings').text}
        actions={
          <QuickFile
            kind="claim"
            label={t('g7a.findings.recordClaim')}
            fieldLabel={t('g7a.findings.claimField')}
            variant="primary"
            onFiled={onFiled}
          />
        }
      />

      <FamilyLists>
        {directions.length === 0 ? null : (
          <ListGroup declares={{ surface: 'findings.explored' }} group="explored" heading={t('g7a.findings.explored')} count={directions.length} records={directions.map((d) => d.record)}>
            {directions.map((d) => (
              <DirectionRow key={d.record.id} reading={d} sayOrigin={directionOrigin === null} />
            ))}
          </ListGroup>
        )}

        {/* The one list this page always has. Empty, it says so in one line. */}
        <ListGroup
          declares={{ surface: 'findings.measured' }}
          group="measured"
          heading={t('g7a.findings.measured')}
          count={claims.length}
          records={claims.map((c) => c.record)}
          foldPast={CLAIM_FOLD}
          empty={<Absence />}
          {...(shared === null ? {} : { shared: <StoredState state={shared.state.word ?? ''} progress={shared.state.progress} kind="claim" /> })}
        >
          {claims.map((c) => (
            <ClaimRow key={c.record.id} reading={c} sayOrigin={claimOrigin === null} sayState={shared === null} />
          ))}
        </ListGroup>

        <OrderFold>
          <p>{t('lists.order.findings', { n: CLAIM_FOLD })}</p>
        </OrderFold>
      </FamilyLists>

      <PageFoot what={t('sheet.record')} exclusions={t('g7a.findings.inspect')} />
    </div>
  )
}

/**
 * ONE DIRECTION. Its second line says "Blocked" when it is, and is not drawn otherwise. At the right:
 * how deep it has been taken, and when it last changed.
 */
function DirectionRow({ reading, sayOrigin }: { reading: DirectionReading; sayOrigin: boolean }) {
  return (
    <ListRow
      record={reading.record}
      href={`#${recordPath(reading.record.id, reading.record.kind)}`}
      target={{ kind: 'record', recordId: reading.record.id, workspaceId: reading.record.workspaceId }}
      // THE ONE WARNING A ROW HERE MAY CARRY, and only the rows that earn it carry it. The stored
      // reason is not printed: it is prose, and the record's own page prints it in full.
      line={reading.blockedOn === null ? null : <span className="flst-warn">{t('g7a.family.blocked')}</span>}
      standing={<DepthMarks depth={reading.depth} />}
      when={<Stamp at={reading.record.updatedAt} />}
      sayOrigin={sayOrigin}
    />
  )
}

/**
 * ONE CLAIM. No second line: what it measured and how are on its own page. At the right: its stored
 * state word, unless every claim shares one and the heading says it, and when it last changed.
 */
function ClaimRow({ reading, sayOrigin, sayState }: { reading: ClaimReading; sayOrigin: boolean; sayState: boolean }) {
  return (
    <ListRow
      record={reading.record}
      href={`#${recordPath(reading.record.id, reading.record.kind)}`}
      target={{ kind: 'record', recordId: reading.record.id, workspaceId: reading.record.workspaceId }}
      line={null}
      // THE STORED WORD THROUGH THE ONE COMPONENT THAT DRAWS A STORED WORD, so this row and every
      // other page draw one fact one way. A claim with no word draws the short mark, not a chip.
      standing={
        !sayState ? undefined : reading.state.word === null ? (
          <Absence title={t('sheet.state.noneStored')} />
        ) : (
          <StoredState state={reading.state.word} progress={reading.state.progress} kind="claim" />
        )
      }
      when={<Stamp at={reading.record.updatedAt} />}
      sayOrigin={sayOrigin}
    />
  )
}

/**
 * The claim whose word every claim on this page carries, or null when they do not all carry the same
 * one. A label every row carries is said once at the heading (rule R11 of report n9Mjk3c_sJRu).
 *
 * A CLAIM WITH NO STATE WORD MAKES THIS NULL, so every row draws its own answer and the empty one
 * draws the short mark. A record nobody finished is exactly such a difference (USER.md invariant 5).
 * One claim alone is not "all of them", so it keeps its word on its row.
 */
function oneWordForAll(claims: readonly ClaimReading[]): ClaimReading | null {
  const first = claims[0]
  if (claims.length < 2 || first === undefined || first.state.word === null) return null
  const word = first.state.word.trim().toLowerCase()
  return claims.every((c) => c.state.word !== null && c.state.word.trim().toLowerCase() === word) ? first : null
}

/**
 * HOW FAR A DIRECTION HAS BEEN TAKEN: the rung's word and six small marks, one per rung of the
 * ladder, filled up to this one. It replaces the depth box the page drew before (report
 * n9Mjk3c_sJRu, block b-17). The words are the ladder's own, read from the same keys `DepthLadder`
 * reads, and the hover says what the rung means.
 *
 * No depth recorded, and a word the ladder does not hold, are two answers. The first says so and
 * draws six empty marks; the second prints the stored word, because a word nobody can read is shown
 * and never swallowed.
 */
export function DepthMarks({ depth }: { depth: string | null }) {
  const stored = depth === null ? null : depth.trim()
  const rung = stored === null ? -1 : (DIRECTION_DEPTHS as readonly string[]).indexOf(stored)
  const known = rung < 0 ? null : DIRECTION_DEPTHS[rung]
  const word =
    known !== undefined && known !== null
      ? t(DEPTH_WORD_KEYS[known])
      : stored === null
        ? t('sheet.depth.none')
        : `${t('sheet.depth.unknown')}: ${stored}`
  const title =
    known !== undefined && known !== null
      ? t('sheet.depth.detail', { meaning: t(DEPTH_MEANING_KEYS[known]) })
      : stored === null
        ? t('sheet.depth.noneDetail')
        : t('sheet.depth.unknownDetail', { depths: DIRECTION_DEPTHS.map((one) => t(DEPTH_WORD_KEYS[one])).join(', ') })
  return (
    <span className="fnd-depth" title={title} data-rung={rung < 0 ? 'none' : String(rung + 1)}>
      <span className="fnd-depth-word">{word}</span>
      <span className="fnd-depth-marks" aria-hidden="true">
        {DIRECTION_DEPTHS.map((one, i) => (
          <span key={one} className="fnd-depth-mark" data-on={i <= rung ? '1' : undefined} />
        ))}
      </span>
    </span>
  )
}

function newestFirst(a: { record: RecordListItem }, b: { record: RecordListItem }): number {
  if (a.record.updatedAt !== b.record.updatedAt) return a.record.updatedAt < b.record.updatedAt ? 1 : -1
  return a.record.id < b.record.id ? -1 : 1
}

// ============================================================================ styles

/**
 * Hoisted by this page itself, after the family sheet, because it is one rule for one surface.
 *
 * NO BACKTICK ANYWHERE IN THIS STRING, including inside a comment — a backtick would close the
 * template literal and the type error would point at a line of prose. It has happened three times
 * in this repository.
 */
export const FINDINGS_CSS = `
/* The wrapper takes part in no layout: the page's column and its gaps are the family shell's. */
.fam-findings { display: contents; }
/* ROOM BETWEEN ONE FINDING AND THE NEXT. More whitespace between items, since 16 August 2026:
   this page is an archive somebody scans slowly. Two classes, so it outweighs the
   list's own one-class rule rather than tying with it. */
.fam-findings .flst-row { padding-top: var(--gut); padding-bottom: var(--gut); }
/* How far a direction has been taken: the rung's word, then six small marks. */
.fnd-depth { display: inline-flex; align-items: center; gap: var(--pad); flex-wrap: wrap; }
.fnd-depth-word { color: var(--text-2); }
.fnd-depth-marks { display: inline-flex; gap: 3px; }
.fnd-depth-mark { width: 7px; height: 7px; border-radius: 50%; border: 1px solid var(--text-3); }
.fnd-depth-mark[data-on="1"] { background: var(--text-2); border-color: var(--text-2); }
`
