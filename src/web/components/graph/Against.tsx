// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
/**
 * ONE PIPELINE AGAINST ANOTHER — what is in one and not in the other, drawn side by side.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A DRAWING AND NOT A DESCRIPTION
 * ---------------------------------------------------------------------------------------
 *
 * The two pipelines are two columns and one step is one row. A step both have fills both cells. A
 * step only one has fills one cell and leaves a marked gap in the other. So the difference is a
 * shape a reader sees before reading a word, and the words on the row are the step's own name and
 * the module carrying it. Nothing here summarises the difference into a sentence.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE THING THIS PANEL MUST SAY OUT LOUD
 * ---------------------------------------------------------------------------------------
 *
 * A block belongs to exactly one pipeline, so two pipelines share no block records at all and the
 * rows are paired on the step's own NAME. That is an interpretation of two records rather than an
 * identity, and the eighth rule says an interpretation is shown, never applied silently. It is
 * shown twice: the number of shared records is drawn as a numeral beside the counts, and the fold
 * says the rule in full. The numeral is read from the answer, so it stays true if the rule ever
 * changes; a sentence claiming "these never overlap" would not.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS NOT DRAWN, AND SAYS SO
 * ---------------------------------------------------------------------------------------
 *
 * Nothing. Every member of both sides is in exactly one row, including a member no revision names
 * and a name one side carries twice. The second is listed under the counts, because a reader who
 * sees the same step in two rows must be told why it was not paired.
 */
import { useEffect, useState } from 'react'
import { api } from '../../api.ts'
import { recordPath } from '../router.tsx'
import { Absence, Empty, Explain, Tag } from '../ui.tsx'
import { targetAttributes } from '@shared/targets.ts'
import type { AgainstRow, AgainstSide, CompositionAgainst } from '@shared/composition.ts'
import { moduleName, OriginMark, type CarrierNames } from './origin-mark.tsx'

/** One pipeline, as a column head knows it. */
export interface AgainstSubject {
  id: string
  title: string
  origin: string | null
}

export interface PipelinesAgainstProps {
  left: AgainstSubject
  right: AgainstSubject
  against: CompositionAgainst
  carrierNames: CarrierNames
  workspaceId: string
}

/** One filled cell: where the step sits, what it is called, how it got here, what carries it. */
function Cell({
  side,
  which,
  carrierNames,
  workspaceId,
}: {
  side: AgainstSide | null
  which: 'left' | 'right'
  carrierNames: CarrierNames
  workspaceId: string
}) {
  if (side === null) {
    return (
      <span className={`ag-cell ag-${which} ag-gap`} data-px-against-gap={which}>
        {/* A DASH, AND THE SAME WORDS READ OUT. `Absence` draws the dash and puts its `title` in an
            off-screen span, so a reader using a screen reader meets the gap instead of silence. */}
        <Absence tier="ordinary" title={t('g7b.Against.no_step_of_this_name_is_in')} />
      </span>
    )
  }
  return (
    <span
      className={`ag-cell ag-${which}`}
      data-px-against-cell={side.recordId}
      {...targetAttributes({ kind: 'record', recordId: side.recordId, workspaceId })}
    >
      <span className="ag-pos num">{side.position === null ? '·' : side.position + 1}</span>
      <a href={`#${recordPath(side.recordId)}`} className="ag-name">
        {side.name ?? side.title ?? t('g7b.notNamed')}
      </a>
      <OriginMark origin={side.origin} />
      {side.deletedThen ? (
        <Tag title={t('g7b.Against.its_own_version_at_that_time_was')}>{t('g7b.Against.deleted_then')}</Tag>
      ) : null}
      {side.name === null ? (
        <Tag title={t('g7b.Against.no_revision_at_or_before_this_time')}>{t('g7b.Against.unnamed')}</Tag>
      ) : null}
      <span className="ag-carriers">
        {side.carriers.length === 0
          ? '—'
          : t('g7b.Against.in', { v1: side.carriers.map((id) => moduleName(carrierNames, id)).join(', ') })}
      </span>
    </span>
  )
}

/** The key of a row, which must survive two rows carrying one name. */
function rowKey(row: AgainstRow, index: number): string {
  return `${index}-${row.left?.recordId ?? ''}-${row.right?.recordId ?? ''}`
}

export function PipelinesAgainst(props: PipelinesAgainstProps) {
  const { against, carrierNames, left, right, workspaceId } = props
  const { inBoth, onlyLeft, onlyRight } = against.counts
  return (
    <>
      <style href="mole-office-against" precedence="default">
        {AGAINST_CSS}
      </style>
      <div className="ag" data-px-against={`${left.id}|${right.id}`}>
        <div className="ag-heads">
          <span className="ag-head ag-left" data-px-against-head="left">
            <a href={`#${recordPath(left.id)}`} className="ag-name">
              {left.title}
            </a>
            <OriginMark origin={left.origin} />
            <span className="ag-only num">{inBoth + onlyLeft}{t('g7b.Against.only_here')}{onlyLeft}</span>
          </span>
          <span className="ag-head ag-right" data-px-against-head="right">
            <a href={`#${recordPath(right.id)}`} className="ag-name">
              {right.title}
            </a>
            <OriginMark origin={right.origin} />
            <span className="ag-only num">{inBoth + onlyRight}{t('g7b.Against.only_here')}{onlyRight}</span>
          </span>
        </div>

        <p
          className="ag-counts num"
          data-px-against-counts={`${inBoth}-${onlyLeft}-${onlyRight}`}
          data-px-against-matched={against.matchedOn}
          data-px-against-shared={String(against.sharedRecordIds)}
        >{t('g7b.Against.in_both')}{inBoth}{t('g7b.Against.paired_by_name')}{against.sharedRecordIds}{t('g7b.Against.of_the_blocks_are_the_same_record')}{against.unnamed.left + against.unnamed.right === 0
            ? null
            : t('g7b.Against.with_no_name', { v1: against.unnamed.left + against.unnamed.right })}
        </p>

        {against.ambiguous.length === 0 ? null : (
          <ul className="ag-ambiguous" data-px-against-ambiguous={String(against.ambiguous.length)}>
            {against.ambiguous.map((entry) => (
              <li key={entry.name}>
                <span className="ag-name">{entry.name}</span>
                <span className="num">
                  {entry.left} · {entry.right}
                </span>
                <Tag title={t('g7b.Against.this_name_is_on_one_side_more')}>{t('g7b.Against.not_paired')}</Tag>
              </li>
            ))}
          </ul>
        )}

        <ul className="ag-rows" data-px-against-rows={String(against.rows.length)}>
          {against.rows.map((row, index) => (
            <li key={rowKey(row, index)} data-px-against-row={row.name ?? ''}>
              <Cell side={row.left} which="left" carrierNames={carrierNames} workspaceId={workspaceId} />
              <Cell side={row.right} which="right" carrierNames={carrierNames} workspaceId={workspaceId} />
            </li>
          ))}
        </ul>

        <Explain
          declares={{ surface: null }}
          meaning={t('g7b.Against.two_pipelines_never_share_a_block_a')}
          opens={t('g7b.Against.how_the_two_sides_are_paired')}
        >
          <ul className="ag-legend">
            <li>
              <strong>{t('g7b.Against.the_name_is_cut_exactly')}</strong>{t('g7b.Against.a_block_s_stored_title_begins_with')}</li>
            <li>
              <strong>{t('g7b.Against.one_name_on_one_side_twice')}</strong>{t('g7b.Against.paired_with_nothing_and_listed_above_by')}</li>
            <li>
              <strong>{t('g7b.Against.a_member_no_revision_names')}</strong>{t('g7b.Against.drawn_on_its_own_side_marked_never')}</li>
          </ul>
        </Explain>
      </div>
    </>
  )
}

// ==================================================== choosing the other pipeline

interface AgainstReply {
  left: AgainstSubject & { workspaceId?: string }
  right: AgainstSubject
  carrierNames: CarrierNames
  against: CompositionAgainst
}

/**
 * The control a person presses: choose another pipeline, and the comparison is drawn under it.
 *
 * The list is the live pipelines of the project this browser is looking at, minus this one. It is
 * asked for once, when the panel first draws, and `api.listRecords` is what carries the project on
 * the wire — a fetch written here would ask about whichever project the last screen was about.
 */
export function CompareWithAnother({ recordId, workspaceId }: { recordId: string; workspaceId: string }) {
  const [others, setOthers] = useState<{ id: string; title: string }[] | null>(null)
  const [chosen, setChosen] = useState<string>('')
  const [reply, setReply] = useState<AgainstReply | null>(null)
  const [fault, setFault] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api
      .listRecords('pipeline')
      .then(({ records: rows }) => {
        if (alive) setOthers(rows.filter((row) => row.id !== recordId).map((row) => ({ id: row.id, title: row.title })))
      })
      .catch((error: unknown) => {
        if (alive) setFault(String((error as Error).message))
      })
    return () => {
      alive = false
    }
  }, [recordId])

  useEffect(() => {
    let alive = true
    if (chosen === '') {
      setReply(null)
      return
    }
    setFault(null)
    api
      .compositionAgainst(recordId, chosen)
      .then((answer) => {
        if (alive) setReply(answer as AgainstReply)
      })
      .catch((error: unknown) => {
        if (alive) {
          setReply(null)
          setFault(String((error as Error).message))
        }
      })
    return () => {
      alive = false
    }
  }, [recordId, chosen])

  return (
    <div className="ag-choose" data-px-against-choose={recordId}>
      <label className="ag-label">
        <span className="ag-labelword">{t('g7b.Against.compare_with')}</span>
        <select
          className="px-select"
          value={chosen}
          aria-label={t('g7b.Against.compare_this_pipeline_with_another_one')}
          onChange={(event) => setChosen(event.target.value)}
        >
          <option value="">—</option>
          {(others ?? []).map((other) => (
            <option key={other.id} value={other.id}>
              {other.title}
            </option>
          ))}
        </select>
      </label>
      {others !== null && others.length === 0 ? (
        <Absence />
      ) : null}
      {fault === null ? null : <Empty message={fault} />}
      {reply === null ? null : (
        <PipelinesAgainst
          left={reply.left}
          right={reply.right}
          against={reply.against}
          carrierNames={reply.carrierNames}
          workspaceId={workspaceId}
        />
      )}
    </div>
  )
}

const AGAINST_CSS = `
.ag-choose { margin-top: .6rem; padding-top: .5rem; border-top: 1px solid var(--hairline); }
.ag-label { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; }
.ag-labelword { font-size: .85rem; color: var(--muted); }
.ag { margin-top: .5rem; }
.ag-heads, .ag-rows li { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
.ag-heads { padding-bottom: .3rem; border-bottom: 1px solid var(--hairline); }
.ag-head, .ag-cell { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; min-width: 0; }
.ag-head { font-weight: 600; }
.ag-only, .ag-carriers, .ag-counts { color: var(--muted); font-size: .82rem; }
.ag-pos { min-width: 1.4rem; color: var(--muted); font-size: .82rem; }
.ag-name { font-weight: 500; }
.ag-counts { margin: .35rem 0; }
.ag-rows, .ag-ambiguous { list-style: none; padding: 0; margin: 0; }
.ag-rows li { padding: .2rem 0; border-top: 1px solid var(--hairline); }
.ag-ambiguous li { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; padding: .2rem 0; }
.ag-gap { opacity: .55; }
@container panel (max-width: 30rem) {
  .ag-heads, .ag-rows li { grid-template-columns: 1fr; }
  .ag-rows li { padding: .35rem 0; }
}
`
