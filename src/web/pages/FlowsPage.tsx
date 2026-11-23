// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useLayoutEffect, useRef, useState } from 'react'
import { content, LANGUAGES, t } from '@shared/i18n.ts'
import type { FlowAppliesTo } from '@shared/flow-applies-to.ts'
import { DEFAULT_FLOW_SORT, FLOW_PAGE_LIMIT, FLOW_SORTS, type FlowListPage, type FlowListRow, type FlowReplacedRow, type FlowRead, type FlowRunRead, type FlowSort, type FlowStageRead } from '@shared/flows.ts'
import type { FlowRunOutcome } from '@shared/flow-run.ts'
import type { FlowHandbookRead } from '@shared/handbooks.ts'
import { api } from '../api.ts'
import { ProjectName, useProjectTitles } from '../components/ProjectChoice.tsx'
import { Absence, ErrorNote, Loading, Stamp, WordsAroundAStamp } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { flowsPath, handbookPath, newFlowPath, recordPath, RouteLink } from '../components/router.tsx'
import { declaredAttributes } from '../components/declares.ts'
import { OUTCOME_WORD } from '../components/FlowRunSteps.tsx'
import { InReach } from '../components/InReach.tsx'
import { FlowEditor, useMayWriteFlows } from './FlowEditor.tsx'
import { handbookStateKey, NewHandbookOnAFlow } from './HandbookPage.tsx'
/**
 * `#/flows` — THE FLOWS PAGE, every project's flows; `#/flows/<id>` — one flow. Two decisions made it in
 * wave 13p round 35. That was the third of the five rounds of proposal report
 * 4mwraeIStEe8 (its blocks "page" and "one").
 *
 * THE LIST READS ONE REQUEST, `GET /api/flows?limit=25&offset=&q=&sort=&projects=all`. It stands under All projects, so
 * it reads every project and each row names its own. It never reads flow runs: the server counts them for the page's
 * flows, and says in the same reply how many runs named no flow.
 *
 * CURRENT FLOWS FIRST, wave 13p round 40. The general flows stand under General, then
 * each project's own. A flow a newer one supersedes is replaced, and is folded: the heading line counts them, and one
 * press reads them with `&replaced=show` and draws each with what replaced it. Nothing is deleted.
 *
 * ONE FLOW READS ONE REQUEST, `GET /api/flows/<id>?projects=all`: its facts, its stages and its latest runs. Each
 * stage's why and sources and the record of changes are the second level. They are asked for
 * with a second request, made only when the fold that holds them is opened.
 *
 * A LIMIT THAT IS TRUE TODAY. The office's own steps carry no stage number, so most runs recorded none. Such a run is
 * drawn as one line that says so, and the stage tallies count only the runs that recorded stage numbers.
 */

export function FlowsPage({ id, edit, isNew }: { id?: string; edit?: true; isNew?: true }) {
  if (isNew === true) return <TheEditor id={null} />
  if (id !== undefined && edit === true) return <TheEditor id={id} />
  return id === undefined ? <TheList /> : <OneFlow id={id} />
}

/** `#/flows/<id>/edit` and `#/flows/new`: the editor (round 36), which holds this page's own look as well as its own. */
function TheEditor({ id }: { id: string | null }) {
  const titles = useProjectTitles()
  return (
    <>
      <style href="mole-office-flows-page" precedence="default">{FLOWS_PAGE_CSS}</style>
      <FlowEditor id={id} titles={titles} />
    </>
  )
}

// ============================================================================ the list

/** THE READER'S SEARCH, ORDER AND PAGE OUTLIVE OPENING A FLOW, so the way back lands where they were. Kept for this tab only. */
const kept: { q: string; sort: FlowSort; offset: number; replaced: boolean } = { q: '', sort: DEFAULT_FLOW_SORT, offset: 0, replaced: false }

const SORT_WORD: Record<FlowSort, () => string> = {
  runs: () => t('flows.sort.runs'),
  last: () => t('flows.sort.last'),
  name: () => t('flows.sort.name'),
}

function TheList() {
  const [asked, setAskedHere] = useState(kept)
  const [typed, setTyped] = useState(kept.q)
  const setAsked = (next: typeof kept): void => {
    Object.assign(kept, next)
    setAskedHere({ ...next })
  }
  const titles = useProjectTitles()
  const [reading, reload] = useProjectAsync(() => api.listFlows({ ...asked, replaced: false }), [asked.q, asked.sort, asked.offset])
  const mayWrite = useMayWriteFlows()

  return (
    <div className="page flw">
      <style href="mole-office-flows-page" precedence="default">{FLOWS_PAGE_CSS}</style>
      <div className="flw-head">
        <h1 className="flw-title" data-title-is="its-label">{t('flows.title')}</h1>
        {mayWrite === 'yes' || mayWrite === 'unknown' ? (
          <RouteLink className="flw-press flw-head-press" to={newFlowPath()}>
            {t('flows.new')}
          </RouteLink>
        ) : null}
      </div>
      {reading.status === 'ready' ? <CountLine page={reading.value} /> : null}
      <div className="flw-controls">
        <form
          className="flw-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            setAsked({ ...asked, q: typed.trim(), offset: 0 })
          }}
        >
          <input type="search" className="px-input flw-search-box" aria-label={t('flows.search')} placeholder={t('flows.search')} value={typed} onChange={(event) => setTyped(event.target.value)} />
          <button type="submit" className="flw-press">{t('flows.searchPress')}</button>
        </form>
        <span className="flw-switch" role="group" aria-label={t('flows.sortBy')}>
          <span className="flw-switch-label">{t('flows.sortBy')}</span>
          {FLOW_SORTS.map((sort) => (
            <button key={sort} type="button" className="flw-switch-one" aria-pressed={asked.sort === sort} onClick={() => setAsked({ ...asked, sort, offset: 0 })}>
              {SORT_WORD[sort]()}
            </button>
          ))}
        </span>
      </div>
      {reading.status === 'loading' ? (
        <Loading what={t('flows.loading')} />
      ) : reading.status === 'error' ? (
        <ErrorNote message={reading.message} fault={reading.fault} retry={reload} />
      ) : (
        <>
          <TheGeneral page={reading.value} titles={titles} />
          <TheRows page={reading.value} titles={titles} offset={asked.offset} onPage={(offset) => setAsked({ ...asked, offset })} />
          <TheReplaced
            matched={reading.value.replaced.matched}
            retired={reading.value.replaced.retired}
            open={asked.replaced}
            asked={asked}
            titles={titles}
            onPress={() => setAsked({ ...asked, replaced: !asked.replaced })}
          />
        </>
      )}
    </div>
  )
}

/**
 * The heading line: how many flows match, how many are folded, and how many runs named no flow, which is a real answer
 * and not a gap. The folded ones are counted as replaced and as retired apart, so the two add up to the fold (round 40b).
 */
function CountLine({ page }: { page: FlowListPage }) {
  const replaced = page.replaced.matched - page.replaced.retired
  return (
    <p className="flw-count">
      <span>{t('flows.count', { n: page.matched + page.general.matched })}</span>
      {replaced > 0 ? (
        <>
          <span aria-hidden="true"> · </span>
          <span data-counts="replaced">{t('flows.countReplaced', { n: replaced })}</span>
        </>
      ) : null}
      {page.replaced.retired > 0 ? (
        <>
          <span aria-hidden="true"> · </span>
          <span data-counts="retired">{t('flows.countRetired', { n: page.replaced.retired })}</span>
        </>
      ) : null}
      <span aria-hidden="true"> · </span>
      <span data-counts="runs-naming-no-flow">{t('flows.noFlowRuns', { n: page.runsNamingNoFlow })}</span>
    </p>
  )
}

function ColumnHeads() {
  return (
    <div className="flw-colhead" aria-hidden="true">
      <span>{t('flows.col.flow')}</span>
      <span>{t('flows.fact.trigger')}</span>
      <span>{t('flows.fact.runsBy')}</span>
      <span>{t('flows.col.stages')}</span>
      <span>{t('flows.col.runs30d')}</span>
      <span>{t('flows.col.lastRun')}</span>
    </div>
  )
}

/** The general flows, from every project, under General. Drawn only when there are some. */
function TheGeneral({ page, titles }: { page: FlowListPage; titles: ReadonlyMap<string, string> }) {
  if (page.general.flows.length === 0) return null
  return (
    <section className="flw-list flw-group" data-group="general">
      <h2 className="flw-h2">{t('flows.group.general')}</h2>
      <div className="flw-table">
        <ColumnHeads />
        <ul className="flw-rows">
          {page.general.flows.map((row) => (
            <li key={row.id}>
              <FlowRow row={row} titles={titles} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function TheRows({ page, titles, offset, onPage }: { page: FlowListPage; titles: ReadonlyMap<string, string>; offset: number; onPage: (offset: number) => void }) {
  const withGeneral = page.general.flows.length > 0
  if (page.flows.length === 0) {
    if (withGeneral) return null
    return <p className="flw-says">{t('absence.none')}</p>
  }
  return (
    <section className="flw-list flw-group" data-group="own" {...declaredAttributes({ surface: 'flows.list' })}>
      {withGeneral ? <h2 className="flw-h2">{t('flows.group.own')}</h2> : null}
      <div className="flw-table">
        <ColumnHeads />
        <ul className="flw-rows">
          {page.flows.map((row) => (
            <li key={row.id}>
              <FlowRow row={row} titles={titles} />
            </li>
          ))}
        </ul>
      </div>
      <nav className="flw-pages" aria-label={t('flows.shown', { from: offset + 1, to: offset + page.returned, n: page.matched })}>
        <span className="flw-shown">{t('flows.shown', { from: offset + 1, to: offset + page.returned, n: page.matched })}</span>
        {offset > 0 ? (
          <button type="button" className="flw-press" onClick={() => onPage(Math.max(0, offset - FLOW_PAGE_LIMIT))}>
            {t('flows.earlier')}
          </button>
        ) : null}
        {page.next !== null ? (
          <button type="button" className="flw-press" onClick={() => onPage(offset + page.returned)}>
            {t('flows.later')}
          </button>
        ) : null}
      </nav>
    </section>
  )
}

/**
 * THE REPLACED AND RETIRED FLOWS, FOLDED. The press reads them only when it opens them, so the list is read without
 * them; a replaced one says what replaced it, as a link to that flow, and a retired one says why (round 40b).
 */
function TheReplaced({ matched, retired, open, asked, titles, onPress }: { matched: number; retired: number; open: boolean; asked: typeof kept; titles: ReadonlyMap<string, string>; onPress: () => void }) {
  if (matched === 0) return null
  const press = retired > 0
    ? open ? t('flows.replaced.hideWithRetired') : t('flows.replaced.showWithRetired', { n: matched })
    : open ? t('flows.replaced.hide') : t('flows.replaced.show', { n: matched })
  return (
    <section className="flw-group flw-replaced" data-group="replaced">
      <button type="button" className="flw-press flw-fold" aria-expanded={open} onClick={onPress}>
        {press}
      </button>
      {open ? <TheReplacedRows asked={asked} titles={titles} /> : null}
    </section>
  )
}

function TheReplacedRows({ asked, titles }: { asked: typeof kept; titles: ReadonlyMap<string, string> }) {
  const [reading, reload] = useProjectAsync(() => api.listFlows({ ...asked, replaced: true }), [asked.q, asked.sort, asked.offset])
  if (reading.status === 'loading') return <Loading what={t('flows.replaced.loading')} />
  if (reading.status === 'error') return <ErrorNote message={reading.message} fault={reading.fault} retry={reload} />
  return (
    <>
      <ul className="flw-rows">
        {(reading.value.replaced.flows ?? []).map((row) => (
          <li key={row.id}>
            <ReplacedRow row={row} titles={titles} />
          </li>
        ))}
      </ul>
    </>
  )
}

function ReplacedRow({ row, titles }: { row: FlowReplacedRow; titles: ReadonlyMap<string, string> }) {
  return (
    <div className="flw-replaced-row">
      <RouteLink className="flw-replaced-name" to={flowsPath(row.id)}>
        <span className="flw-row-title">{content(row.title)}</span>
        <ProjectName id={row.project} titles={titles} />
      </RouteLink>
      {row.retired === null ? null : <TheRetiredMark retired={row.retired} />}
      {row.replacedBy.length === 0 ? null : <p className="flw-replaced-by">
        <span>{t('flows.replacedBy')} </span>
        {row.replacedBy.map((by, i) => (
          <span key={by.id}>
            {i > 0 ? ', ' : null}
            <RouteLink to={flowsPath(by.id)}>{content(by.title)}</RouteLink>
            {by.project === row.project ? null : (
              <>
                {' '}
                <ProjectName id={by.project} titles={titles} />
              </>
            )}
          </span>
        ))}
      </p>}
    </div>
  )
}

/** Why a flow was retired, and what took its place: a record, as a link, or a file and a line (round 40b). */
function TheRetiredMark({ retired }: { retired: NonNullable<FlowReplacedRow['retired']> }) {
  return (
    <p className="flw-retired">
      <span>{t('flows.retired')} </span>
      {content(retired.why)}
      <span> {t('flows.retired.inPlace')} </span>
      {retired.record !== undefined ? (
        <RouteLink className="flw-source" to={recordPath(retired.record)}>{retired.record}</RouteLink>
      ) : (
        <code className="flw-source">{t('flows.retired.fileLine', { file: retired.file ?? '', line: retired.line ?? 0 })}</code>
      )}
      <span> · {t('flows.retired.atBy', { at: retired.at, by: retired.by })}</span>
    </p>
  )
}

function FlowRow({ row, titles }: { row: FlowListRow; titles: ReadonlyMap<string, string> }) {
  return (
    <RouteLink className="flw-row" to={flowsPath(row.id)}>
      <span className="flw-row-name">
        <span className="flw-row-title">{content(row.title)}</span>
        <ProjectName id={row.project} titles={titles} />
      </span>
      <span className="flw-row-cell">
        <span className="flw-cell-label">{t('flows.fact.trigger')}: </span>
        {row.trigger === null ? <Absence word={t('flows.notRecorded')} /> : content(row.trigger)}
      </span>
      <span className="flw-row-cell">
        <span className="flw-cell-label">{t('flows.fact.runsBy')}: </span>
        {row.runsBy === null ? <Absence word={t('flows.notRecorded')} /> : content(row.runsBy)}
      </span>
      <span className="flw-row-fact">{t('flows.stages', { n: row.stages })}</span>
      <span className="flw-row-fact">{t('flows.runs30d', { n: row.runs30d })}</span>
      <span className="flw-row-fact" data-run-recorded={row.lastRunAt === null ? 'no' : 'yes'}>
        {row.lastRunAt === null ? t('flows.noRunRecorded') : <WordsAroundAStamp words={(when) => t('flows.lastRun', { when })} at={row.lastRunAt} />}
      </span>
    </RouteLink>
  )
}

// ============================================================================ one flow

function OneFlow({ id }: { id: string }) {
  const titles = useProjectTitles()
  const [flow, reload] = useProjectAsync(() => api.readFlow(id), [id])
  return (
    <div className="page flw flw-one">
      <style href="mole-office-flows-page" precedence="default">{FLOWS_PAGE_CSS}</style>
      <RouteLink className="flw-back" to={flowsPath()}>
        ← {t('flows.back')}
      </RouteLink>
      {flow.status === 'loading' ? (
        <Loading what={t('flows.loadingOne')} />
      ) : flow.status === 'error' ? (
        <ErrorNote message={flow.message} fault={flow.fault} retry={reload} />
      ) : (
        <TheFlow flow={flow.value} titles={titles} />
      )}
    </div>
  )
}

/** How a mark is drawn: a glyph as well as a colour, so it reads without colour (tokens.css). */
type MarkKind = 'done' | 'failed' | 'open' | 'none'
const GLYPH: Record<MarkKind, string> = { done: '✓', failed: '✕', open: '○', none: '·' }
const MARK_OF: Record<FlowRunOutcome, MarkKind> = { done: 'done', failed: 'failed', 'refused by the verdict door': 'failed', 'still open': 'open' }

/** The mark an outcome is drawn with, and its words. An outcome outside the closed list is drawn as it was written. */
function markOf(outcome: string | undefined): { kind: MarkKind; word: string } {
  if (outcome === undefined) return { kind: 'none', word: t('flows.runs.notReached') }
  const known = outcome in MARK_OF ? (outcome as FlowRunOutcome) : null
  return known === null ? { kind: 'none', word: content(outcome) } : { kind: MARK_OF[known], word: OUTCOME_WORD[known]() }
}

function Mark({ outcome }: { outcome: string | undefined }) {
  const { kind, word } = markOf(outcome)
  return (
    <span className="flw-mark" data-mark={kind} title={word}>
      <span aria-hidden="true">{GLYPH[kind]}</span>
      <span className="px-sr">{word}</span>
    </span>
  )
}

/** The place a stage is drawn at: its own number when it holds one, otherwise its place in the list. */
const placeOf = (stage: FlowStageRead, i: number): number => stage.n ?? i + 1

/** Each stage's outcome in one run, the last step recorded at that stage number winning. */
function outcomesOf(run: FlowRunRead): Map<number, string> {
  const at = new Map<number, string>()
  for (const step of run.stagesRecorded ?? []) at.set(step.n, step.outcome)
  return at
}

function TheFlow({ flow, titles }: { flow: FlowRead; titles: ReadonlyMap<string, string> }) {
  const places = flow.stages.map(placeOf)
  const marked = flow.latestRuns.filter((run) => run.stagesRecorded !== null)
  const mayWrite = useMayWriteFlows()
  return (
    <>
      <div className="flw-head">
        <h1 className="flw-title" data-title-is="its-label">{content(flow.title)}</h1>
        {mayWrite === 'yes' || mayWrite === 'unknown' ? (
          <RouteLink className="flw-press flw-head-press" to={flowsPath(flow.id, { edit: true })}>
            {t('flows.edit')}
          </RouteLink>
        ) : null}
      </div>
      <p className="flw-where">
        <ProjectName id={flow.project} titles={titles} />
        <span aria-hidden="true"> · </span>
        <span>{t('flows.runsInAll', { n: flow.runs.count })}</span>
        <span aria-hidden="true"> · </span>
        <span>{t('flows.runs30d', { n: flow.runs.runs30d })}</span>
        <span aria-hidden="true"> · </span>
        <span>{flow.runs.lastRunAt === null ? t('flows.noRunRecorded') : <WordsAroundAStamp words={(when) => t('flows.lastRun', { when })} at={flow.runs.lastRunAt} />}</span>
      </p>
      <dl className="flw-facts" {...declaredAttributes({ surface: 'flows.facts' })}>
        <Fact name={t('flows.fact.trigger')} value={flow.trigger} />
        <Fact name={t('flows.fact.runsBy')} value={flow.runsBy} />
        <Fact name={t('flows.fact.leavesBehind')} value={flow.leavesBehind} />
        <Fact name={t('flows.fact.declaredIn')} value={flow.declaredIn} />
        <div className="flw-fact" data-fact="for">
          <dt>{t('flows.fact.for')}</dt>
          <dd>{flow.appliesTo === null ? <Absence word={t('flows.notRecorded')} /> : whomItIsFor(flow.appliesTo, titles)}</dd>
        </div>
      </dl>

      <section {...declaredAttributes({ surface: 'flows.stages' })}>
        <h2 className="flw-h2">{t('flows.stagesHeading')}</h2>
        {flow.stages.length === 0 ? (
          <p className="flw-says">{t('absence.none')}</p>
        ) : (
          <>
            {marked.length === 0 ? null : <p className="flw-note">{t('flows.tally.counted', { n: marked.length })}</p>}
            <TheStages stages={flow.stages} places={places} runs={marked} handbooks={flow.handbooks} />
          </>
        )}
      </section>

      <TheHandbooks flow={flow} />

      <TheRuns flow={flow} places={places} />

      <TheReasons flow={flow} />
    </>
  )
}

/** Whom a flow is for, in one line: general or special to a project, its roles, and the rung from which every role follows it. */
function whomItIsFor(to: FlowAppliesTo, titles: ReadonlyMap<string, string>): string {
  const where = to.scope === 'general' ? t('flows.for.general') : t('flows.for.special', { project: titles.get(to.project ?? '') ?? to.project ?? '' })
  return [where, to.roles.join(', '), ...(to.rung === undefined ? [] : [t('flows.for.rung', { n: to.rung })])].join(' · ')
}

function Fact({ name, value }: { name: string; value: string | null }) {
  return (
    <div className="flw-fact">
      <dt>{name}</dt>
      <dd>{value === null ? <Absence word={t('flows.notRecorded')} /> : content(value)}</dd>
    </div>
  )
}

/**
 * The narrowest a stage box is let to be, in rem. Below it the words of a stage break a letter to a line.
 *
 * THE ROW IS AS MANY BOXES AS FIT AT THIS WIDTH, AND NEVER MORE THAN THERE ARE STAGES. Round 35 put every stage in one row
 * at 60rem and wider, and a flow of 30 stages became 30 columns too narrow to read, pushing the page sideways by 19, 154
 * and 472px at 1440, 990 and 660.
 */
const STAGE_MIN_REM = 16

/** Where the arrow after a box points: along the row, back to the start of the next row, or down the one column. */
type StageNext = 'right' | 'wrap' | 'down' | 'none'

const nextOf = (i: number, n: number, columns: number): StageNext =>
  i === n - 1 ? 'none' : columns === 1 ? 'down' : (i + 1) % columns === 0 ? 'wrap' : 'right'

/**
 * How many boxes stand in a row, worked out from the width of the list itself and its own gap. It is measured rather than
 * set by a media query because the gap follows the density setting and the width follows the sidebar, so no breakpoint on
 * the window can say how many boxes fit. Until the list has been measured it is one column, which never runs off the page.
 */
function useStageColumns(n: number) {
  const ref = useRef<HTMLOListElement>(null)
  const [columns, setColumns] = useState(1)
  useLayoutEffect(() => {
    const list = ref.current
    if (list === null) return
    const measure = () => {
      const gap = parseFloat(getComputedStyle(list).columnGap) || 0
      const least = STAGE_MIN_REM * parseFloat(getComputedStyle(document.documentElement).fontSize)
      setColumns(Math.max(1, Math.min(n, Math.floor((list.clientWidth + gap) / (least + gap)))))
    }
    measure()
    const watcher = new ResizeObserver(measure)
    watcher.observe(list)
    return () => watcher.disconnect()
  }, [n])
  return { ref, columns }
}

function TheStages({ stages, places, runs, handbooks }: { stages: FlowStageRead[]; places: number[]; runs: FlowRunRead[]; handbooks: FlowHandbookRead[] }) {
  const { ref, columns } = useStageColumns(stages.length)
  return (
    <ol ref={ref} className="flw-stages" data-columns={columns} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {stages.map((stage, i) => (
        <StageBox key={i} stage={stage} place={places[i]!} runs={runs} handbooks={handbooks.filter((one) => one.steps.includes(places[i]!)).length} next={nextOf(i, stages.length, columns)} />
      ))}
    </ol>
  )
}

function StageBox({ stage, place, runs, handbooks, next }: { stage: FlowStageRead; place: number; runs: FlowRunRead[]; handbooks: number; next: StageNext }) {
  const tally = { done: 0, failed: 0, open: 0 }
  for (const run of runs) {
    const kind = markOf(outcomesOf(run).get(place)).kind
    if (kind !== 'none') tally[kind] += 1
  }
  return (
    <li className="flw-stage" data-next={next}>
      <span className="flw-stage-n">{t('flows.stage', { n: place })}</span>
      <span className="flw-stage-does">{content(stage.does)}</span>
      <span className="flw-stage-leaves">{stage.evidence === null ? t('flows.stage.leavesNothing') : t('flows.stage.leaves', { evidence: content(stage.evidence) })}</span>
      {handbooks === 0 ? null : <span className="flw-stage-handbooks">{t('flows.handbooks.onTheStep', { n: handbooks })}</span>}
      {runs.length === 0 ? null : (
        <span className="flw-tally">
          <span className="flw-mark" data-mark="done"><span aria-hidden="true">{GLYPH.done}</span> {t('flows.tally.done', { n: tally.done })}</span>
          <span className="flw-mark" data-mark="failed"><span aria-hidden="true">{GLYPH.failed}</span> {t('flows.tally.failed', { n: tally.failed })}</span>
          <span className="flw-mark" data-mark="open"><span aria-hidden="true">{GLYPH.open}</span> {t('flows.tally.open', { n: tally.open })}</span>
        </span>
      )}
    </li>
  )
}

/** Where on the flow a handbook hangs, in one line: the whole flow, its steps, or both. */
function whereOnTheFlow(handbook: FlowHandbookRead): string {
  const steps = handbook.steps.join(', ')
  if (handbook.steps.length === 0) return t('flows.handbooks.onTheFlow')
  const onSteps = t('flows.handbooks.onSteps', { n: handbook.steps.length, steps })
  return handbook.onTheFlow ? t('flows.handbooks.onTheFlowAnd', { steps: onSteps }) : onSteps
}

/**
 * THE FLOW'S HANDBOOKS, every live one on the flow or on one of its steps, in any state, in the order they were filed.
 * Each names where it stands, its languages and where on the flow it hangs, and links to its own page. A new one is
 * added here as a draft on the whole flow. All records lists every handbook in the office when its kind is chosen.
 */
function TheHandbooks({ flow }: { flow: FlowRead }) {
  const [adding, setAdding] = useState(false)
  return (
    <section className="flw-handbooks">
      <div className="flw-handbooks-head">
        <h2 className="flw-h2">{t('flows.handbooks.heading')}</h2>
        {adding ? null : (
          <button type="button" className="flw-press" onClick={() => setAdding(true)}>
            {t('flows.handbooks.add')}
          </button>
        )}
      </div>
      {flow.handbooks.length === 0 ? (
        <p className="flw-says">{t('absence.none')}</p>
      ) : (
        <ul className="flw-handbook-list">
          {flow.handbooks.map((handbook) => (
            <li key={handbook.id} className="flw-handbook" data-state={handbook.state ?? 'unknown'}>
              <RouteLink to={handbookPath(handbook.id)}>{content(handbook.title)}</RouteLink>
              <span className="flw-handbook-facts">
                <span>{t(handbookStateKey(handbook.state))}</span>
                <span aria-hidden="true"> · </span>
                <span>{handbook.languages.length === 0 ? t('flows.handbooks.noLanguage') : handbook.languages.map((one) => LANGUAGES[one]).join(', ')}</span>
                <span aria-hidden="true"> · </span>
                <span>{whereOnTheFlow(handbook)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {adding ? <NewHandbookOnAFlow flow={flow.id} project={flow.project} onCancel={() => setAdding(false)} /> : null}
    </section>
  )
}

/** Where a run is read: the run's own page when the flow run names one, otherwise the flow run record. */
const runPath = (run: FlowRunRead): string => (run.run === null ? recordPath(run.id) : recordPath(run.run, 'session'))

/** The latest runs: a grid at 40rem and wider, one row per run and one column per stage; below that, one line of marks per run. */
function TheRuns({ flow, places }: { flow: FlowRead; places: number[] }) {
  const runs = flow.latestRuns
  return (
    <section {...declaredAttributes({ surface: 'flows.runs' })}>
      <h2 className="flw-h2">{t('flows.runsHeading')}</h2>
      {runs.length === 0 ? (
        <p className="flw-says">{t('flows.noRunRecorded')}</p>
      ) : (
        <>
          <p className="flw-note">{t('flows.runs.shown', { n: flow.runs.count, shown: runs.length })}</p>
          <InReach className="flw-grid-reach" box="flw-grid-box" name={t('flows.runsHeading')} shape={`${String(runs.length)}:${String(places.length)}`}>
            <table className="flw-grid">
              <thead>
                <tr>
                  <th scope="col">{t('flows.runs.run')}</th>
                  {places.map((place) => (
                    <th key={place} scope="col" title={t('flows.stage', { n: place })}>
                      {place}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const at = outcomesOf(run)
                  return (
                    <tr key={run.id} data-stage-numbers={run.stagesRecorded === null ? 'none' : 'some'}>
                      <th scope="row">
                        <RouteLink to={runPath(run)}>
                          <Stamp at={run.at} />
                        </RouteLink>
                      </th>
                      {run.stagesRecorded === null ? (
                        <td colSpan={Math.max(1, places.length)} className="flw-grid-none">
                          {t('word.notRecorded')}
                        </td>
                      ) : (
                        places.map((place) => (
                          <td key={place}>
                            <Mark outcome={at.get(place)} />
                          </td>
                        ))
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </InReach>
          <ul className="flw-runlist">
            {runs.map((run) => {
              const at = outcomesOf(run)
              return (
                <li key={run.id} data-stage-numbers={run.stagesRecorded === null ? 'none' : 'some'}>
                  <RouteLink to={runPath(run)}>
                    <Stamp at={run.at} />
                  </RouteLink>
                  {run.stagesRecorded === null ? (
                    <span className="flw-runlist-none">{t('word.notRecorded')}</span>
                  ) : (
                    <span className="flw-runlist-marks">
                      {places.map((place) => (
                        <span key={place} className="flw-runlist-one">
                          <span className="flw-runlist-n">{place}</span>
                          <Mark outcome={at.get(place)} />
                        </span>
                      ))}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}

/**
 * THE SECOND LEVEL, ONE CLOSED FOLD: each stage's why and sources, and the record of changes. Nothing is asked for until
 * the fold is opened; then `GET /api/flows/<id>?secondLevel=show` is asked once.
 */
function TheReasons({ flow }: { flow: FlowRead }) {
  const [opened, setOpened] = useState(false)
  return (
    <details className="flw-reasons" {...declaredAttributes({ surface: 'flows.reasons' })} onToggle={(event) => { if (event.currentTarget.open) setOpened(true) }}>
      <summary>{t('flows.reasons.fold')}</summary>
      {opened ? <TheReasonsRead id={flow.id} /> : null}
    </details>
  )
}

function TheReasonsRead({ id }: { id: string }) {
  const [read, reload] = useProjectAsync(() => api.readFlow(id, true), [id])
  if (read.status === 'loading') return <Loading what={t('flows.reasons.loading')} rows={2} />
  if (read.status === 'error') return <ErrorNote message={read.message} fault={read.fault} retry={reload} />
  const flow = read.value
  const changes = flow.stepChanges ?? []
  return (
    <div className="flw-reasons-body">
      <ol className="flw-reasons-stages">
        {flow.stages.map((stage, i) => (
          <li key={i}>
            <b className="flw-reasons-label">{t('flows.stage', { n: placeOf(stage, i) })}</b>
            <p className="flw-reasons-value flw-reasons-head">{content(stage.does)}</p>
            <span className="flw-reasons-label">{t('flowEditor.goingWhy')}</span>
            <p className="flw-reasons-value">{stage.why === null || stage.why === undefined || stage.why.trim() === '' ? <Absence word={t('word.notRecorded')} /> : content(stage.why)}</p>
            <span className="flw-reasons-label">{t('flows.reasons.sources')}</span>
            <p className="flw-reasons-value flw-reasons-sources">
              {(stage.sources ?? []).length === 0 ? (
                <Absence word={t('absence.none')} />
              ) : (
                (stage.sources ?? []).map((source) => (
                  <RouteLink key={source} className="flw-source" to={recordPath(source)}>
                    {source}
                  </RouteLink>
                ))
              )}
            </p>
          </li>
        ))}
      </ol>
      <h3 className="flw-h3">{t('flows.reasons.changes')}</h3>
      {changes.length === 0 ? (
        <p className="flw-says">{t('absence.none')}</p>
      ) : (
        <ul className="flw-changes">
          {changes.map((change, i) => (
            <ChangeEntry key={i} change={change} />
          ))}
        </ul>
      )}
    </div>
  )
}

const textIn = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null)

/** One entry of the record of changes, as the flow holds it: when, what, why and the record that caused it. */
function ChangeEntry({ change }: { change: unknown }) {
  const entry = change !== null && typeof change === 'object' && !Array.isArray(change) ? (change as Record<string, unknown>) : {}
  const at = textIn(entry['at'])
  const what = textIn(entry['what'])
  const why = textIn(entry['why'])
  const cause = textIn(entry['cause'])
  return (
    <li className="flw-change">
      {at === null ? null : <span className="flw-change-at">{content(at)}</span>}
      <span>{what === null ? <Absence word={t('flows.notRecorded')} /> : content(what)}</span>
      {why === null ? null : <span>{t('flows.reasons.because', { why: content(why) })}</span>}
      {cause === null ? null : (
        <span>
          {t('flows.reasons.cause')}{' '}
          <RouteLink className="flw-source" to={recordPath(cause)}>
            {cause}
          </RouteLink>
        </span>
      )}
    </li>
  )
}

export const FLOWS_PAGE_CSS = `
.flw-title { margin: 0 0 4px 0; overflow-wrap: anywhere; }
.flw-head { display: flex; flex-wrap: wrap; gap: var(--pad) var(--gut); align-items: baseline; justify-content: space-between; }
.flw-head-press { display: inline-flex; align-items: center; text-decoration: none; white-space: nowrap; }
.flw-count, .flw-where { margin: 0 0 var(--gut) 0; color: var(--text-2); display: flex; flex-wrap: wrap; gap: 0 4px; align-items: baseline; }
.flw-says { margin: 0 0 var(--gut) 0; color: var(--text-2); max-width: var(--measure-in-box); }
.flw-note { margin: 0 0 var(--pad) 0; color: var(--text-2); font-size: var(--fs-1); }
.flw-controls { display: flex; flex-wrap: wrap; gap: var(--pad) var(--gut); align-items: center; margin: 0 0 var(--gut) 0; }
.flw-search { display: inline-flex; gap: var(--pad); align-items: center; flex: 1 1 18rem; max-width: 32rem; }
.flw-search-box { flex: 1 1 auto; min-width: 0; }
.flw-press {
  border: var(--border-w) solid var(--border-strong); background: var(--panel); color: var(--text);
  padding: 4px 12px; min-height: 2rem; cursor: pointer; font: inherit; border-radius: var(--radius-sm);
}
.flw-switch { display: inline-flex; align-items: center; flex-wrap: wrap; }
.flw-switch-label { color: var(--text-2); margin-right: var(--pad); }
.flw-switch-one {
  border: var(--border-w) solid var(--border-strong); background: var(--panel); color: var(--text);
  padding: 4px 12px; min-height: 2rem; cursor: pointer; font: inherit;
}
.flw-switch-one + .flw-switch-one { border-left: none; }
.flw-switch-one:first-of-type { border-radius: var(--radius-sm) 0 0 var(--radius-sm); }
.flw-switch-one:last-of-type { border-radius: 0 var(--radius-sm) var(--radius-sm) 0; }
.flw-switch-one[aria-pressed='true'] { background: var(--accent); color: var(--accent-text); font-weight: 600; }

/* THE LIST. Six columns when the list's own box is wider than 60rem, under one heading row; below that each value
   carries its own label. The box is asked and not the window, so the chat or the sidebar beside the page narrows the
   list as a narrow window does. */
.flw-list { min-width: 0; container-type: inline-size; container-name: flw-list; }
/* Round 40: General, each project's own, and the replaced ones folded, one group under the other. */
.flw-group + .flw-group { margin-top: var(--gut); }
.flw-group > .flw-h2 { margin-top: 0; }
.flw-replaced { min-width: 0; }
.flw-fold { margin-bottom: var(--pad); }
.flw-replaced-row { padding: 10px var(--gut); display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.flw-replaced-name { display: flex; flex-wrap: wrap; gap: 2px 8px; align-items: baseline; color: var(--text-2); text-decoration: none; min-width: 0; }
.flw-replaced-name:hover .flw-row-title { text-decoration: underline; }
.flw-replaced-name .flw-row-title { font-weight: 400; }
.flw-replaced-name .pch-name, .flw-replaced-by .pch-name { font-size: var(--fs-1); color: var(--text-3); }
.flw-replaced-by { margin: 0; font-size: var(--fs-2); color: var(--text-2); overflow-wrap: anywhere; }
.flw-retired { margin: 0; font-size: var(--fs-2); color: var(--text-2); overflow-wrap: anywhere; }
/* ONE SET OF COLUMNS FOR THE HEADINGS AND EVERY ROW. A column is never narrower than its longest word, and the
   headings, the list, each item and each row take the table's columns, so they stand in line. */
.flw-table {
  display: grid; column-gap: var(--gut); min-width: 0;
  grid-template-columns: minmax(min-content, 2.2fr) minmax(min-content, 2.4fr) minmax(min-content, 1.4fr) minmax(5.5rem, auto) minmax(8rem, auto) minmax(9rem, auto);
}
.flw-table > .flw-rows, .flw-table > .flw-rows > li { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; }
.flw-colhead, .flw-row { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; gap: 4px var(--gut); align-items: baseline; min-width: 0; }
.flw-colhead { padding: 0 var(--gut) 6px var(--gut); font-size: var(--fs-1); color: var(--text-2); font-weight: 600; }
.flw-rows { list-style: none; margin: 0; padding: 0; border: var(--border-w) solid var(--border); border-radius: var(--radius); background: var(--panel); }
.flw-rows > li + li { border-top: var(--border-w) solid var(--border); }
.flw-row { padding: 10px var(--gut); color: var(--text); text-decoration: none; }
.flw-row:hover { background: var(--hover); }
.flw-row-name { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.flw-row-title { font-weight: 600; }
.flw-row-name .pch-name { font-size: var(--fs-1); color: var(--text-2); }
.flw-row-cell { font-size: var(--fs-2); color: var(--text-2); min-width: 0; white-space: pre-wrap; }
.flw-row-fact { font-size: var(--fs-2); color: var(--text-2); }
.flw-row-fact[data-run-recorded='no'] { color: var(--text-3); }
.flw-cell-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.flw-pages { display: flex; flex-wrap: wrap; gap: var(--pad) var(--gut); align-items: center; margin: var(--gut) 0 0 0; }
.flw-shown { color: var(--text-2); font-size: var(--fs-1); }
@container flw-list (max-width: 60rem) {
  .flw-table, .flw-table > .flw-rows, .flw-table > .flw-rows > li { display: block; }
  .flw-colhead { display: none; }
  .flw-row { grid-template-columns: repeat(3, auto) 1fr; }
  .flw-row-name, .flw-row-cell { grid-column: 1 / -1; }
  .flw-cell-label { position: static; width: auto; height: auto; overflow: visible; clip: auto; white-space: normal; color: var(--text-3); }
}
@container flw-list (max-width: 40rem) {
  .flw-row { grid-template-columns: minmax(min-content, 1fr); }
}
/* The search and the presses stand outside the list, so they still follow the window. */
@media (max-width: 40rem) {
  .flw-search { flex-basis: 100%; max-width: none; }
  .flw-press, .flw-switch-one { min-height: 44px; }
}

/* ONE FLOW. */
.flw-back { display: inline-block; margin: 0 0 var(--pad) 0; }
.flw-h2 { font-size: var(--fs-3); margin: var(--gut) 0 6px 0; }
.flw-h3 { font-size: var(--fs-2); margin: var(--gut) 0 6px 0; }
.flw-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: var(--pad) var(--gut); margin: 0 0 var(--gut) 0; }
.flw-fact { border: var(--border-w) solid var(--border); border-radius: var(--radius-sm); background: var(--panel); padding: 8px 12px; min-width: 0; }
.flw-fact dt { font-size: var(--fs-1); color: var(--text-2); font-weight: 600; margin: 0 0 2px 0; }
.flw-fact dd { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }

/* THE STAGES: as many boxes to a row as fit at 16rem each, worked out by useStageColumns, which sets the columns. An
   arrow after each box says where the next one is: along the row, back to the start of the next row, or down. */
.flw-stages { list-style: none; margin: 0; padding: 0; display: grid; gap: calc(var(--gut) * 1.5); grid-template-columns: minmax(0, 1fr); }
.flw-stage {
  position: relative; display: flex; flex-direction: column; gap: 6px; min-width: 0;
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius); background: var(--panel); padding: 10px 12px;
}
.flw-stage-n { font-size: var(--fs-1); font-weight: 700; color: var(--text-2); }
.flw-stage-does { font-weight: 600; overflow-wrap: anywhere; white-space: pre-wrap; }
.flw-stage-leaves { font-size: var(--fs-1); color: var(--text-2); overflow-wrap: anywhere; white-space: pre-wrap; }
.flw-tally { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: var(--fs-1); }
.flw-stage-handbooks { font-size: var(--fs-1); font-weight: 600; }

/* A FLOW'S HANDBOOKS: one row each, its title a link and its facts after it, wrapping under it on a narrow window. */
.flw-handbooks-head { display: flex; flex-wrap: wrap; gap: var(--pad) var(--gut); align-items: center; justify-content: space-between; margin: var(--gut) 0 var(--pad) 0; }
.flw-handbooks-head > .flw-h2 { margin: 0; }
.flw-handbook-list { list-style: none; margin: 0 0 var(--pad) 0; padding: 0; border: var(--border-w) solid var(--border); border-radius: var(--radius); background: var(--panel); }
.flw-handbook-list > li + li { border-top: var(--border-w) solid var(--border); }
.flw-handbook { display: flex; flex-wrap: wrap; gap: 2px var(--gut); align-items: baseline; padding: 8px var(--gut); min-width: 0; }
.flw-handbook > a { font-weight: 600; overflow-wrap: anywhere; }
.flw-handbook-facts { color: var(--text-2); font-size: var(--fs-1); display: flex; flex-wrap: wrap; gap: 0 4px; }
.flw-stage[data-next='down']::after,
.flw-stage[data-next='right']::after,
.flw-stage[data-next='wrap']::after { position: absolute; text-align: center; color: var(--text-2); font-weight: 700; }
.flw-stage[data-next='down']::after {
  content: '↓'; left: 50%; bottom: calc(var(--gut) * -1.5); width: 2ch; margin-left: -1ch; line-height: calc(var(--gut) * 1.5);
}
.flw-stage[data-next='right']::after {
  content: '→'; right: calc(var(--gut) * -1.5); top: 50%; width: calc(var(--gut) * 1.5); margin-top: -0.75em; line-height: 1.5em;
}
.flw-stage[data-next='wrap']::after {
  content: '↙'; left: calc(var(--gut) * -1.5); bottom: calc(var(--gut) * -1.5); width: calc(var(--gut) * 1.5); line-height: calc(var(--gut) * 1.5);
}

/* A MARK IS A GLYPH AS WELL AS A COLOUR, so it reads without colour. */
.flw-mark { font-weight: 600; white-space: nowrap; }
.flw-mark[data-mark='done'] { color: var(--st-done); }
.flw-mark[data-mark='failed'] { color: var(--st-failed); }
.flw-mark[data-mark='open'] { color: var(--st-doing); }
.flw-mark[data-mark='none'] { color: var(--text-3); }

/* THE LATEST RUNS: a grid at 40rem and wider, a list of marks below. The grid has one column per stage, so it may
   scroll sideways, and InReach marks the edge it carries on past, fading into the box's own background.
   THE BOX IS POSITIONED SO THAT IT HOLDS THE WORDS ONLY A SCREEN READER HEARS. Each cell's label and each mark's word is
   absolute and 1px; with the box unpositioned they belonged to the InReach wrapper outside the scroll, so the box did not
   clip them, and on a flow of 30 stages they pushed the page sideways by 154px at 990 and 472px at 660. */
.px-reach.flw-grid-reach { --reach-fade: var(--panel); }
.flw-grid-box { position: relative; overflow-x: auto; border: var(--border-w) solid var(--border); border-radius: var(--radius); background: var(--panel); }
.flw-grid { border-collapse: collapse; width: 100%; font-size: var(--fs-2); }
.flw-grid th, .flw-grid td { padding: 6px 10px; text-align: center; border-top: var(--border-w) solid var(--border); }
.flw-grid thead th { border-top: none; color: var(--text-2); font-size: var(--fs-1); }
.flw-grid th[scope='row'], .flw-grid thead th:first-child { text-align: left; white-space: nowrap; font-weight: 400; }
.flw-grid-none { text-align: left !important; color: var(--text-2); }
.flw-runlist { display: none; list-style: none; margin: 0; padding: 0; border: var(--border-w) solid var(--border); border-radius: var(--radius); background: var(--panel); }
.flw-runlist > li { display: flex; flex-direction: column; gap: 4px; padding: 8px 12px; }
.flw-runlist > li + li { border-top: var(--border-w) solid var(--border); }
.flw-runlist-none { color: var(--text-2); font-size: var(--fs-2); }
.flw-runlist-marks { display: flex; flex-wrap: wrap; gap: 4px 12px; }
.flw-runlist-one { display: inline-flex; gap: 4px; align-items: baseline; }
.flw-runlist-n { color: var(--text-2); font-size: var(--fs-1); }
@media (max-width: 40rem) {
  .flw-grid-reach { display: none; }
  .flw-runlist { display: block; }
}

/* THE SECOND LEVEL. */
.flw-reasons { margin: var(--gut) 0 0 0; border: var(--border-w) solid var(--border); border-radius: var(--radius); background: var(--panel); padding: 8px 12px; }
.flw-reasons > summary { cursor: pointer; font-weight: 600; padding: 4px 0; display: list-item; }
.flw-reasons-stages { list-style: none; margin: var(--pad) 0 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--pad); }
/* Labels in one column and the words in the next, so a stage's lines and its reason's lines do not run together. */
.flw-reasons-stages > li { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 2px 10px; align-items: baseline; }
.flw-reasons-label { font-size: var(--fs-1); color: var(--text-2); }
.flw-reasons-stages b.flw-reasons-label { font-size: inherit; color: inherit; }
.flw-reasons-stages p { margin: 0; max-width: var(--measure-in-box); overflow-wrap: anywhere; white-space: pre-wrap; }
.flw-reasons-sources { font-size: var(--fs-1); color: var(--text-2); display: flex; flex-wrap: wrap; gap: 2px 8px; }
.flw-source { font-family: var(--font-mono); }
.flw-changes { margin: 0; padding: 0 0 0 1.2rem; display: flex; flex-direction: column; gap: 6px; }
.flw-change { display: flex; flex-direction: column; gap: 2px; max-width: var(--measure-in-box); overflow-wrap: anywhere; white-space: pre-wrap; }
.flw-change-at { font-size: var(--fs-1); color: var(--text-2); }
`
