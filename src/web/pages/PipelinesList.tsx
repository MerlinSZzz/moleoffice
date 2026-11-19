// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
import { stateWord } from '@shared/words.ts'
/**
 * `#/pipeline` — the pipelines of this project, as a list, in the family lists' one design.
 *
 * ---------------------------------------------------------------------------------------
 * THE DESIGN OF THIS PAGE, from report n9Mjk3c_sJRu block b-17
 * ---------------------------------------------------------------------------------------
 * The page used to open on the drawing of every module, with the pipelines in a fold under it. Now:
 *
 *   The same head as the other family pages.
 *   Needs you: the steps waiting for a person, which are the steps on the attention list. A blocked
 *     step is not among them unless it records that a person could be hurt, because no record says
 *     who a blocked step waits on (question 18). When there are none, the quiet line "Nothing needs
 *     you".
 *   The drawing, as a card with a small picture of the modules and their links. The card opens the
 *     drawing at `#/pipeline/drawing`.
 *   One list per state: the pipelines grouped by the step each is standing on. A row says "Now at
 *     step N", and at its right a small bar of the steps done. A row opens that pipeline's drawing.
 *   One closed fold at the foot on how the page is ordered.
 *
 * NOTHING HERE IS WORKED OUT A SECOND TIME. The reading, the order and the step each pipeline stands
 * on are PipelinePage.tsx's own `readPipeline`, `orderPipelines`, `standingOn` and `chipFor`, over the
 * same three requests (`loadPage`), so this list and the drawing cannot disagree about a pipeline.
 */

import { useMemo } from 'react'
import { BLOCK_KIND } from '@shared/blocks.ts'
import type { PanelRecord } from '@shared/types.ts'
import type { RecordListItem } from '../api.ts'
import { FamilyHead, PageFoot, sharedOrigin } from '../components/family/parts.tsx'
import { FamilyLists, ListGroup, ListRow, NothingNeedsYou, OrderFold, SmallBar } from '../components/family/list.tsx'
import type { GraphLink } from '../components/graph/model.ts'
import { blockLinkRows } from '../components/graph/model.ts'
import { plural, readPipeline, type FlowStep, type StepAttention } from '../components/PipelineFlow.tsx'
import { pipelineDrawingPath, pipelinePath, recordPath } from '../components/router.tsx'
import { Absence, ErrorNote, Loading, type PanelState } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { useLanguage } from '../lib/language.ts'
import { FAMILY_SHEET } from './family/FamilyPage.tsx'
import { attentionByBlocks, chipFor, loadPage, orderPipelines, type PipelineEntry } from './PipelinePage.tsx'

/** The lists, in the order they are drawn: the step a pipeline stands on, worst first. */
const STATE_GROUPS: readonly PanelState[] = ['failed', 'blocked', 'doing', 'todo', 'done', 'broken']

const GROUP_WORDS: Partial<Record<PanelState, () => string>> = {
  failed: () => t('lists.pipelines.group.failed'),
  blocked: () => t('lists.pipelines.group.blocked'),
  doing: () => t('lists.pipelines.group.doing'),
  todo: () => t('lists.pipelines.group.todo'),
  done: () => t('lists.pipelines.group.done'),
  broken: () => t('lists.pipelines.group.broken'),
}

export function PipelinesList() {
  useLanguage()
  const [state, reload] = useProjectAsync(loadPage, [])
  return (
    <div className="fam">
      <style href="mole-office-family" precedence="default">
        {FAMILY_SHEET}
      </style>
      <style href="mole-office-pipelines-list" precedence="default">
        {PIPELINES_LIST_CSS}
      </style>
      <FamilyHead title={t('g7b.PipelinePage.pipelines_140')} actions={null} />
      {state.status === 'loading' ? <Loading label={t('g7b.PipelinePage.pipelines_140')} rows={6} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} retry={reload} /> : null}
      {state.status === 'ready' ? <PipelinesBody {...state.value} /> : null}
    </div>
  )
}

/** A step waiting for a person, with the pipeline it is in. */
interface WaitingStep {
  entry: PipelineEntry
  step: FlowStep
  index: number
  attention: StepAttention
}

/**
 * THE PAGE ONCE ITS THREE REQUESTS HAVE COME BACK. Exported so a test can draw it without a server.
 */
export function PipelinesBody({
  records,
  attention: reply,
  links,
  now,
}: {
  records: RecordListItem[]
  attention: Parameters<typeof attentionByBlocks>[0]
  links: GraphLink[]
  now?: number
}) {
  const clock = useMemo(() => now ?? Date.now(), [now, records])
  const { entries, waiting, byId } = useMemo(() => {
    const blockLinks = blockLinkRows(links)
    const readings = records
      .filter((record) => record.kind === 'pipeline')
      .map((record: PanelRecord) => readPipeline(record, records, blockLinks))
    const attention = attentionByBlocks(reply)
    const ordered = orderPipelines(readings, attention, clock)
    const out: WaitingStep[] = []
    for (const entry of ordered) {
      entry.reading.steps.forEach((step, index) => {
        const on = attention.get(step.id)
        if (on === undefined) return
        // QUESTION 18: a blocked step waits on somebody no record names, so it is not something for
        // the person, unless it records that a person could be hurt.
        if (step.state === 'blocked' && !on.row.safety) return
        out.push({ entry, step, index, attention: on })
      })
    }
    out.sort((a, b) => {
      if (a.attention.row.safety !== b.attention.row.safety) return a.attention.row.safety ? -1 : 1
      return b.attention.row.score - a.attention.row.score
    })
    return { entries: ordered, waiting: out, byId: new Map(records.map((record) => [record.id, record])) }
  }, [records, reply, links, clock])

  const waitingRecords = waiting.map((one) => byId.get(one.step.id) ?? { origin: undefined })
  const waitingOrigin = sharedOrigin(waitingRecords)

  return (
    <>
      <FamilyLists>
        {waiting.length === 0 ? (
          <NothingNeedsYou />
        ) : (
          <ListGroup group="needs-you" heading={t('reports.needsYou')} count={waiting.length} records={waitingRecords} ask>
            {waiting.map((one) => (
              <WaitingRow key={one.step.id} one={one} record={byId.get(one.step.id)} sayOrigin={waitingOrigin === null} />
            ))}
          </ListGroup>
        )}

        <DrawingCard records={records} links={links} />

        {STATE_GROUPS.map((group) => {
          const list = entries.filter((entry) => chipFor(entry) === group)
          if (list.length === 0) return null
          const origin = sharedOrigin(list.map((entry) => entry.reading.record))
          return (
            <ListGroup key={group} group={group} heading={GROUP_WORDS[group]?.() ?? group} count={list.length} records={list.map((entry) => entry.reading.record)}>
              {list.map((entry) => (
                <PipelineRow key={entry.reading.record.id} entry={entry} sayOrigin={origin === null} />
              ))}
            </ListGroup>
          )
        })}
        {entries.length === 0 ? (
          <ListGroup group="none" heading={t('g7b.PipelinePage.pipelines_140')} count={0} records={[]} empty={<Absence />}>
            {[]}
          </ListGroup>
        ) : null}

        <OrderFold>
          <p>{t('lists.order.pipelines')}</p>
        </OrderFold>
      </FamilyLists>
      <PageFoot what={t('sheet.record')} exclusions={t('lists.pipelines.inspect')} />
    </>
  )
}

/** ONE STEP WAITING FOR A PERSON. The row opens the step's own record. */
function WaitingRow({ one, record, sayOrigin }: { one: WaitingStep; record: RecordListItem | undefined; sayOrigin: boolean }) {
  const pipeline = one.entry.reading.record
  return (
    <ListRow
      record={record ?? { title: one.step.title, kind: BLOCK_KIND }}
      href={`#${recordPath(one.step.id, BLOCK_KIND)}`}
      target={{ kind: 'record', recordId: one.step.id, workspaceId: pipeline.workspaceId }}
      line={`${pipeline.title} · ${t('lists.pipelines.stepOf', { n: one.index + 1, total: one.entry.total })}`}
      standing={
        one.attention.row.safety ? (
          <span className="flst-warn">{t('lists.pipelines.safety')}</span>
        ) : (
          stateWord(one.step.state).text
        )
      }
      sayOrigin={sayOrigin}
    />
  )
}

/** ONE PIPELINE. "Now at step N" on its second line, and a small bar of the steps done at its right. */
function PipelineRow({ entry, sayOrigin }: { entry: PipelineEntry; sayOrigin: boolean }) {
  const { reading } = entry
  const at = entry.standingOn
  const line =
    reading.problem !== null
      ? reading.problem
      : entry.total === 0
        ? null
        : at === null
          ? t('g7b.PipelinePage.all_done', { v1: plural(entry.total, t('g7b.PipelinePage.step_is'), t('g7b.PipelinePage.steps_are')) })
          : t('lists.pipelines.nowAt', { n: at.index + 1, total: entry.total, name: at.step.name })
  const doneWords = t('lists.pipelines.done', { done: entry.done, n: entry.total })
  return (
    <ListRow
      record={reading.record}
      href={`#${pipelinePath(reading.record.id)}`}
      target={{ kind: 'record', recordId: reading.record.id, workspaceId: reading.record.workspaceId }}
      line={line}
      standing={entry.safety ? <span className="flst-warn">{t('lists.pipelines.safety')}</span> : undefined}
      when={
        reading.problem !== null ? (
          t('g7b.PipelinePage.unreadable')
        ) : entry.total === 0 ? (
          <Absence />
        ) : (
          <SmallBar done={entry.done} total={entry.total} label={doneWords} />
        )
      }
      sayOrigin={sayOrigin}
    />
  )
}

/**
 * THE DRAWING, AS A CARD WITH A SMALL PICTURE. The whole card opens the drawing of every module.
 *
 * The picture is drawn from the same records and links the drawing reads: one small box per module,
 * in order of title on a grid, and a line between two modules for each link that joins them. It is
 * not the drawing's own layout, which is worked out on the drawing page; it shows how many modules
 * there are and how joined they are, and the words beside it say what the card opens.
 */
export function DrawingCard({ records, links }: { records: readonly RecordListItem[]; links: readonly GraphLink[] }) {
  const modules = records.filter((record) => record.kind === 'module').sort((a, b) => a.title.localeCompare(b.title))
  return (
    <a className="ppl-card" href={`#${pipelineDrawingPath()}`}>
      <span className="ppl-card-picture">{modules.length === 0 ? <Absence /> : <ModulesPicture modules={modules} links={links} />}</span>
      <span className="ppl-card-words">
        <span className="ppl-card-title">{t('lists.pipelines.drawing')}</span>
        <span className="ppl-card-line">{t('lists.pipelines.drawingLine', { n: modules.length })}</span>
      </span>
    </a>
  )
}

const PICTURE_W = 160
const PICTURE_H = 90

function ModulesPicture({ modules, links }: { modules: readonly RecordListItem[]; links: readonly GraphLink[] }) {
  const n = modules.length
  const cols = Math.max(1, Math.ceil(Math.sqrt((n * PICTURE_W) / PICTURE_H)))
  const rows = Math.max(1, Math.ceil(n / cols))
  const cw = PICTURE_W / cols
  const ch = PICTURE_H / rows
  const at = new Map<string, { x: number; y: number }>()
  modules.forEach((module, i) => {
    at.set(module.id, { x: (i % cols) * cw + cw / 2, y: Math.floor(i / cols) * ch + ch / 2 })
  })
  const lines = links.filter((link) => !link.broken && at.has(link.fromId) && at.has(link.toId) && link.fromId !== link.toId)
  const bw = Math.min(cw * 0.6, 22)
  const bh = Math.min(ch * 0.5, 12)
  return (
    <svg className="ppl-picture" viewBox={`0 0 ${PICTURE_W} ${PICTURE_H}`} aria-hidden="true" focusable="false">
      {lines.map((link) => {
        const a = at.get(link.fromId)!
        const b = at.get(link.toId)!
        return <line key={link.linkId} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="ppl-picture-line" />
      })}
      {modules.map((module) => {
        const p = at.get(module.id)!
        return <rect key={module.id} x={p.x - bw / 2} y={p.y - bh / 2} width={bw} height={bh} rx={2} className="ppl-picture-box" />
      })}
    </svg>
  )
}

/** This page's own sheet (ppl-*). NO BACKTICK ANYWHERE IN THIS STRING, including in a comment. */
const PIPELINES_LIST_CSS = `
.ppl-card {
  display: flex; align-items: center; gap: var(--gut); flex-wrap: wrap;
  padding: var(--pad) var(--gut); min-height: 44px;
  border: var(--border-w) solid var(--border); border-radius: var(--radius);
  background: var(--panel); color: var(--text); text-decoration: none;
  align-self: flex-start; max-width: 100%;
}
.ppl-card:hover { background: var(--hover); }
.ppl-card:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: 2px; }
.ppl-card-picture { flex: none; display: inline-flex; width: 160px; height: 90px; align-items: center; justify-content: center; }
.ppl-picture { width: 160px; height: 90px; }
.ppl-picture-line { stroke: var(--text-3); stroke-width: 1; }
.ppl-picture-box { fill: var(--panel-2); stroke: var(--text-2); stroke-width: 1; }
.ppl-card-words { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ppl-card-title { font-size: var(--fs-2); font-weight: 600; }
.ppl-card-line { font-size: var(--fs-1); color: var(--text-2); }
`
