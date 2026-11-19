// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT GRAPH, DRAWN. Wave 13s round 241.
 *
 * One lane per module, read from the pure model in project-graph-model.ts. Each lane shows three times at once:
 * the past in real revision ticks and stopping points, the present in the pipelines and blocks that exist now, and
 * the futures the product stores, each as a light cubic curve. A level adds marks; it never changes what the labels
 * mean. Everything the page draws is either a record's stored words or a mark the model counted.
 *
 * A FUTURE IS A CURVE AND THE PRESENT IS A DIRECT LINE. That is the one rule that keeps this drawing from reading as
 * a pipeline: the pipeline's direct, orthogonal lines are what runs, and the light curve is what might. The curve is
 * futureCurve from the model, stroked at EVOLUTION_WEIGHT, which evolution-model.ts already declares lighter than
 * every line on a pipeline.
 *
 * NO WORDS ARE WORKED OUT HERE. The server's notes are printed as they arrive, a summary is the record's own stored
 * summary, and a paused or shelved future prints the reason it stored. The level names come from
 * PROJECT_GRAPH_LEVEL_WORD_KEYS, the same keys the page's control reads.
 *
 * NO SMALL PRINT. Wave 13u round 217: the drawing has no key strip and no line under it. How to read it and what the
 * source map gave are the page's body text, in src/web/pages/ProjectGraphPage.tsx.
 *
 * EACH STEP IS DRAWN ONCE. The model puts every step that is in no lane in `unattached.blocks`, the steps of a pipeline
 * outside every lane included, and a lane's pipeline may list a step another lane or no lane holds. So the drawing
 * works out which steps a drawn pipeline lists, and draws only the others as loose steps. The model's lists stay whole.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { parseLocalStamp } from '@shared/time.ts'
import { PROJECT_GRAPH_LEVELS, type ProjectGraphCheckpoint, type ProjectGraphFuture, type ProjectGraphLevel, type ProjectGraphNode, type ProjectGraphPlan, type ProjectGraphPlannedState, type ProjectGraphWindow } from '@shared/project-graph.ts'
import { t, type WordKey } from '@shared/i18n.ts'
import { linkWord, stateWord } from '@shared/words.ts'
import { useLanguage } from '../../lib/language.ts'
import { useMode } from '../../lib/mode.ts'
import { recordPath } from '../router.tsx'
import { EVOLUTION_WEIGHT } from './evolution-model.ts'
import { LINE_WEIGHT } from './lines.ts'
import { lineWithMaths } from '../plans/PlanMaths.tsx'
import {
  futureCurve,
  type GraphLane,
  type GraphStepLink,
  type ProjectGraphModel,
} from './project-graph-model.ts'

/** The curve's own box: a short, wide band whose endpoints are the lane's present and the future's title. */
const CURVE_FROM = { x: 1, y: 14 }
const CURVE_TO = { x: 99, y: 3 }

/**
 * THE GAP LEFT BETWEEN TWO MARKS THAT SHARE A ROW, in pixels. The requirement is only that a stopping point's target
 * and another mark's ink do not overlap and are not clipped; four pixels is the chosen margin that makes that reliable
 * when a target is 24 pixels wide and a revision number is long. It is a drawing choice, not a requirement.
 */
const RAIL_EVENT_CLEARANCE_PX = 4
/** The vertical distance between two rows of marks, in rem: more than the 24 pixel target a checkpoint link needs. */
const RAIL_ROW_STEP_REM = 1.75
/** The rail's height when its events fit on one row, in rem: the same minimum the stylesheet has always had. */
const RAIL_ONE_ROW_REM = 2.6

/** Whether a level has reached another. The order is the owner's, from the shared declaration. */
function atLevel(level: ProjectGraphLevel, which: ProjectGraphLevel): boolean {
  return PROJECT_GRAPH_LEVELS.indexOf(level) >= PROJECT_GRAPH_LEVELS.indexOf(which)
}

/** The model's own definition of words: a summary with nothing but spaces in it is no summary. */
function hasWords(words: string | null): words is string {
  return words !== null && words.trim() !== ''
}

function TitleLink({ id, title, className = 'gph-link' }: { id: string; title: string; className?: string }) {
  return (
    <a className={className} href={`#${recordPath(id)}`}>
      {title}
    </a>
  )
}

/** One reader's word for a stored plan or window state, in the page's language and mode. */
function StateText({ state }: { state: string }) {
  const mode = useMode()
  return <span className="gph-value">{stateWord(state, mode).text}</span>
}

/** A count chip. There is one of these per module, one per pipeline, and one for the page's totals. */
function CountChip({ children }: { children: ReactNode }) {
  return (
    <span className="gph-count" data-mark="count">
      {children}
    </span>
  )
}

/** A record's own summary, at the summaries level only. */
function Summary({ words }: { words: string | null }) {
  if (!hasWords(words)) return null
  return (
    <p className="gph-summary" data-mark="summary">
      {words}
    </p>
  )
}

/** One mark on a lane's past rail: a real revision row or a stopping point. */
interface PastEvent {
  key: string
  kind: 'revision' | 'checkpoint'
  at: string
  label: string
  checkpoint: ProjectGraphCheckpoint | null
  seq: number | null
}

/** Every real event one rail holds, oldest first, so the rail reads left to right. */
function pastEvents(
  revisions: GraphLane['revisions']['entries'],
  checkpoints: readonly ProjectGraphCheckpoint[],
): PastEvent[] {
  const events: PastEvent[] = revisions.map((entry) => ({
    key: `${entry.recordId}-${String(entry.seq)}`,
    kind: 'revision',
    at: entry.at,
    label: `${t('projectGraph.revision')} ${String(entry.seq)}: ${entry.title}`,
    checkpoint: null,
    seq: entry.seq,
  }))
  for (const checkpoint of checkpoints) {
    events.push({
      key: checkpoint.id,
      kind: 'checkpoint',
      at: checkpoint.at,
      label: `${t('projectGraph.checkpoint')}: ${checkpoint.title}`,
      checkpoint,
      seq: null,
    })
  }
  return events.sort((one, other) => {
    const a = parseLocalStamp(one.at) ?? 0
    const b = parseLocalStamp(other.at) ?? 0
    return a === b ? one.key.localeCompare(other.key) : a - b
  })
}

/**
 * WHICH ROW EACH EVENT IS DRAWN ON, in the order the events are drawn. Each event's real drawn width is centred on
 * its stored-time position, and it takes the first row whose last mark leaves RAIL_EVENT_CLEARANCE_PX before it.
 * A row that has no room takes a new one, so a long revision number makes its own room rather than an assumed
 * percentage, and a narrow rail is read as the width it really is. Positions stay the real stored times; a row is
 * a vertical step and never a made-up time.
 */
function pastRailRows(positions: readonly number[], widths: readonly number[], railWidth: number): number[] {
  const lastRightOnRow: number[] = []
  return positions.map((left, index) => {
    const center = (left / 100) * railWidth
    const start = center - (widths[index] ?? 0) / 2
    const end = center + (widths[index] ?? 0) / 2
    const free = lastRightOnRow.findIndex((last) => start - last >= RAIL_EVENT_CLEARANCE_PX)
    if (free !== -1) {
      lastRightOnRow[free] = end
      return free
    }
    lastRightOnRow.push(end)
    return lastRightOnRow.length - 1
  })
}

/**
 * ONE HORIZONTAL RAIL FOR A LANE OR THE PROJECT. A tick stands for a real revision row and a diamond for a stopping
 * point, each placed by the stored time between the rail's earliest and latest real event. A lone event sits at the
 * start and is labelled; the rail does not invent a second point to make a span out of one event.
 *
 * EVENTS THAT SHARE A MOMENT TAKE SEPARATE ROWS. Their horizontal place stays the stored time and their label stays
 * the stored label, so two events at one time never hide each other and a stopping point's link can still be pressed.
 * The number of rows is the number their real drawn widths need, and a rail with one event keeps the one row and the
 * one-line explanation it always had.
 */
function PastRail({
  entries,
  checkpoints,
}: {
  entries: GraphLane['revisions']['entries']
  checkpoints: readonly ProjectGraphCheckpoint[]
}) {
  const rail = useRef<HTMLDivElement>(null)
  const [measured, setMeasured] = useState<{ railWidth: number; widths: number[] }>({ railWidth: 0, widths: [] })
  useLayoutEffect(() => {
    const element = rail.current
    if (element === null) return
    const read = () => {
      const railWidth = element.getBoundingClientRect().width
      const widths = [...element.querySelectorAll<HTMLElement>(':scope > [data-mark]')].map(
        (mark) => mark.getBoundingClientRect().width,
      )
      setMeasured((before) => {
        const same =
          Math.abs(before.railWidth - railWidth) < 0.1 &&
          before.widths.length === widths.length &&
          before.widths.every((one, at) => Math.abs(one - (widths[at] ?? 0)) < 0.1)
        return same ? before : { railWidth, widths }
      })
    }
    read()
    const observer = new ResizeObserver(read)
    observer.observe(element)
    for (const mark of element.querySelectorAll<HTMLElement>(':scope > [data-mark]')) observer.observe(mark)
    return () => observer.disconnect()
  })
  const events = pastEvents(entries, checkpoints)
  if (events.length === 0) return null
  const times = events.map((event) => parseLocalStamp(event.at)).filter((one): one is number => one !== null)
  const first = times.length === 0 ? 0 : Math.min(...times)
  const last = times.length === 0 ? 0 : Math.max(...times)
  const span = last - first
  const positions = events.map((event) => {
    const when = parseLocalStamp(event.at)
    return events.length === 1 || when === null || span <= 0 ? 0 : ((when - first) / span) * 100
  })
  const widths = measured.widths.length === events.length ? measured.widths : null
  const rows =
    widths !== null && measured.railWidth > 0
      ? pastRailRows(positions, widths, measured.railWidth)
      : events.map(() => 0)
  const rowCount = rows.reduce((most, row) => Math.max(most, row + 1), 1)
  const railHeight = Math.max(RAIL_ONE_ROW_REM, 0.25 + rowCount * RAIL_ROW_STEP_REM)
  return (
    <div
      ref={rail}
      className="gph-past-rail"
      role="list"
      aria-label={t('projectGraph.zone.past')}
      style={{ minHeight: `${String(railHeight)}rem` }}
    >
      <span className="gph-rail-line" aria-hidden="true" />
      {Array.from({ length: rowCount - 1 }, (_unused, at) => (
        <span
          key={`row-${String(at + 1)}`}
          className="gph-rail-line gph-rail-row-line"
          aria-hidden="true"
          style={{ top: `calc(.9rem + ${String(at + 1)} * ${String(RAIL_ROW_STEP_REM)}rem)` }}
        />
      ))}
      {events.map((event, index) => {
        const left = positions[index] ?? 0
        const row = rows[index] ?? 0
        const style = {
          left: `${String(left)}%`,
          top: `calc(.5rem + ${String(row)} * ${String(RAIL_ROW_STEP_REM)}rem)`,
        }
        if (event.checkpoint !== null) {
          return (
            <span
              key={event.key}
              role="listitem"
              className="gph-rail-event"
              data-mark="checkpoint"
              data-at={event.at}
              data-rail-row={row}
              style={style}
            >
              <a
                className="gph-rail-checkpoint"
                href={`#${recordPath(event.checkpoint.id)}`}
                title={`${event.label} (${event.at})`}
                aria-label={`${event.label} (${event.at})`}
              >
                <span className="gph-diamond" aria-hidden="true" />
              </a>
            </span>
          )
        }
        return (
          <span
            key={event.key}
            role="listitem"
            className="gph-rail-event gph-rail-revision"
            data-mark="revision"
            data-at={event.at}
            data-rail-row={row}
            style={style}
            title={`${event.label} (${event.at})`}
            aria-label={`${event.label} (${event.at})`}
          >
            <span className="gph-rail-tick" aria-hidden="true" />
            <span className="gph-rail-seq">{event.seq}</span>
          </span>
        )
      })}
      {events.length === 1 ? (
        <p className="gph-rail-single">
          {events[0]?.label} · {events[0]?.at}
        </p>
      ) : null}
    </div>
  )
}

/** The checkpoint's own words, without a mark: the rail's diamond is the one checkpoint mark in a lane. */
function CheckpointBody({ checkpoint, level }: { checkpoint: ProjectGraphCheckpoint; level: ProjectGraphLevel }) {
  return (
    <>
      <TitleLink id={checkpoint.id} title={checkpoint.title} className="gph-link gph-item-title" />
      <p className="gph-quiet">{t('projectGraph.checkpoint.doing', { doing: checkpoint.doing })}</p>
      <p className="gph-quiet">{t('projectGraph.checkpoint.next', { next: checkpoint.next })}</p>
      {checkpoint.stoppedAtRevision === null ? null : (
        <p className="gph-quiet gph-source-marker" data-source-marker={checkpoint.stoppedAtRevision}>
          {t('projectGraph.checkpoint.sourceMarker', { marker: checkpoint.stoppedAtRevision })}
        </p>
      )}
      {atLevel(level, 'summaries') ? <Summary words={checkpoint.summary} /> : null}
    </>
  )
}

function Checkpoint({ checkpoint, level }: { checkpoint: ProjectGraphCheckpoint; level: ProjectGraphLevel }) {
  return (
    <li className="gph-checkpoint" data-mark="checkpoint">
      <span className="gph-diamond" aria-hidden="true" />
      <CheckpointBody checkpoint={checkpoint} level={level} />
    </li>
  )
}

function CheckpointDetails({ checkpoints, level }: { checkpoints: readonly ProjectGraphCheckpoint[]; level: ProjectGraphLevel }) {
  if (checkpoints.length === 0) return null
  return (
    <ul className="gph-list gph-checkpoint-details">
      {checkpoints.map((checkpoint) => (
        <li className="gph-checkpoint gph-checkpoint-detail" key={checkpoint.id}>
          <CheckpointBody checkpoint={checkpoint} level={level} />
        </li>
      ))}
    </ul>
  )
}

function PlannedState({ state, level }: { state: ProjectGraphPlannedState; level: ProjectGraphLevel }) {
  return (
    <li className="gph-state" data-mark="plannedState">
      <TitleLink id={state.id} title={state.title} className="gph-link gph-item-title" />
      <p className="gph-what">{state.what}</p>
      {state.outcome === null || state.byTitle === null ? null : (
        <p className="gph-quiet">
          {state.outcome === 'realised'
            ? t('projectGraph.future.realised', { title: state.byTitle })
            : t('projectGraph.future.answeredInstead', { title: state.byTitle })}
        </p>
      )}
      {atLevel(level, 'summaries') ? <Summary words={state.summary} /> : null}
    </li>
  )
}

function Future({ future, level }: { future: ProjectGraphFuture; level: ProjectGraphLevel }) {
  const paused = future.paused
  const shelved = future.shelved
  const muted = paused !== null || shelved !== null
  return (
    <li className="gph-future" data-mark="future" data-muted={muted ? '1' : undefined}>
      <svg
        className="gph-curve"
        viewBox="0 0 100 16"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path className="gph-curve-path" d={futureCurve(CURVE_FROM, CURVE_TO)} />
      </svg>
      <div className="gph-future-head">
        <TitleLink id={future.id} title={future.title} className="gph-link gph-item-title" />
        {future.depth === null ? null : (
          <span className="gph-quiet">
            {t('projectGraph.future.depth', { rung: future.depth.rung, rungs: future.depth.rungs })}
          </span>
        )}
      </div>
      {paused === null ? null : (
        <p className="gph-reason" data-aside="paused">
          <strong>{t('projectGraph.future.paused')}</strong> {paused.why}
        </p>
      )}
      {shelved === null ? null : (
        <p className="gph-reason" data-aside="shelved">
          <strong>{t('projectGraph.future.shelved')}</strong> {shelved.because}
        </p>
      )}
      {atLevel(level, 'summaries') ? <Summary words={future.summary} /> : null}
      {!atLevel(level, 'revisionsAndCheckpoints') || future.states.length === 0 ? null : (
        <ul className="gph-list gph-states">
          {future.states.map((state) => (
            <PlannedState key={state.id} state={state} level={level} />
          ))}
        </ul>
      )}
    </li>
  )
}

/** A pipeline's blocks and its boundary. A boundary is a plain labelled border around two or more blocks. */
function Pipeline({
  pipeline,
  blocks,
  stepLinks,
  level,
}: {
  pipeline: ProjectGraphNode
  blocks: ReadonlyMap<string, ProjectGraphNode>
  stepLinks: ProjectGraphModel['stepLinks']
  level: ProjectGraphLevel
}) {
  const bounded = pipeline.blockIds.length >= 2 && atLevel(level, 'countsAndBoundaries')
  const body = (
    <>
      <div className="gph-pipeline-head">
        <TitleLink id={pipeline.id} title={pipeline.title} className="gph-link gph-item-title" />
        {atLevel(level, 'countsAndBoundaries') ? (
          <CountChip>{t('projectGraph.count.block', { n: pipeline.blockIds.length })}</CountChip>
        ) : null}
      </div>
      {pipeline.blockIds.length === 0 ? null : (
        <ul className="gph-list gph-blocks">
          {pipeline.blockIds.map((id) => {
            const block = blocks.get(id)
            return block === undefined ? null : (
              <li className="gph-item" key={id} data-block={block.id}>
                <TitleLink id={block.id} title={block.title} />
                <StepLinks links={stepLinks.get(block.id)} />
              </li>
            )
          })}
        </ul>
      )}
      {atLevel(level, 'summaries') ? <Summary words={pipeline.summary} /> : null}
    </>
  )
  if (bounded) {
    return (
      <li className="gph-boundary" data-mark="boundary">
        {body}
      </li>
    )
  }
  return <li className="gph-pipeline">{body}</li>
}

function Blocks({ blocks, stepLinks }: { blocks: readonly ProjectGraphNode[]; stepLinks: ProjectGraphModel['stepLinks'] }) {
  if (blocks.length === 0) return null
  return (
    <ul className="gph-list gph-blocks">
      {blocks.map((block) => (
        <li className="gph-item" key={block.id} data-block={block.id}>
          <TitleLink id={block.id} title={block.title} />
          <StepLinks links={stepLinks.get(block.id)} />
        </li>
      ))}
    </ul>
  )
}

/**
 * A block's stored `feeds` and `blocks` links to other blocks of the project, each in the link's own word for this end
 * ("feeds", "fed by", "blocks", "blocked by") and the other block's title, which opens it. Wave 13u round 216, package
 * BV, point BV-5: the model in project-graph-model.ts says which links these are.
 */
function StepLinks({ links }: { links: readonly GraphStepLink[] | undefined }) {
  const mode = useMode()
  if (links === undefined || links.length === 0) return null
  return (
    <ul className="gph-step-links">
      {links.map((link) => (
        <li key={`${link.id}-${link.direction}`} data-step-link={link.type} data-direction={link.direction} data-to={link.otherId}>
          {linkWord(link.type, link.direction, mode).text} <TitleLink id={link.otherId} title={link.otherTitle} />
          {link.inferred ? ` (${t('ui.computedState.inferred')})` : null}
        </li>
      ))}
    </ul>
  )
}

/** The futures the model put in a lane. They are drawn at every level, as the page's first sentence promises. */
function Futures({ futures, level }: { futures: readonly ProjectGraphFuture[]; level: ProjectGraphLevel }) {
  if (futures.length === 0) return null
  return (
    <ul className="gph-list gph-futures">
      {futures.map((future) => (
        <Future key={future.id} future={future} level={level} />
      ))}
    </ul>
  )
}

function Checkpoints({ checkpoints, level }: { checkpoints: readonly ProjectGraphCheckpoint[]; level: ProjectGraphLevel }) {
  if (checkpoints.length === 0) return null
  return (
    <ul className="gph-list gph-checkpoints">
      {checkpoints.map((checkpoint) => (
        <Checkpoint key={checkpoint.id} checkpoint={checkpoint} level={level} />
      ))}
    </ul>
  )
}

function Lane({
  lane,
  model,
  level,
  blocks,
  listed,
}: {
  lane: GraphLane
  model: ProjectGraphModel
  level: ProjectGraphLevel
  blocks: ReadonlyMap<string, ProjectGraphNode>
  listed: ReadonlySet<string>
}) {
  const loose = lane.blocks.filter((block) => !listed.has(block.id))
  const baselineOnly = lane.revisions.summaries.filter((summary) => summary.baselineOnly)
  return (
    <article className="gph-lane" data-mark="module">
      <header className="gph-lane-head">
        <h2 className="gph-lane-title">
          <TitleLink id={lane.module.id} title={lane.module.title} className="gph-link gph-lane-link" />
        </h2>
        {atLevel(level, 'countsAndBoundaries') ? (
          <CountChip>
            {t('projectGraph.count.block', { n: lane.counts.blocks })}
            {' · '}
            {t('projectGraph.count.pipeline', { n: lane.counts.pipelines })}
            {' · '}
            {t('projectGraph.count.future', { n: lane.counts.futures })}
            {' · '}
            {t('projectGraph.count.otherRecord', { n: lane.counts.otherRecords })}
          </CountChip>
        ) : null}
      </header>
      {atLevel(level, 'summaries') ? <Summary words={lane.module.summary} /> : null}
      <div className="gph-zones">
        <section className="gph-zone gph-past">
          <h3 className="gph-zone-title">{t('projectGraph.zone.past')}</h3>
          {!atLevel(level, 'revisionsAndCheckpoints') ? null : (
            <>
              <PastRail entries={lane.revisions.entries} checkpoints={lane.checkpoints} />
              {baselineOnly.map((summary) => (
                <p className="gph-quiet" data-baseline-only="1" key={summary.recordId}>
                  {t('projectGraph.noRealRevision')}
                </p>
              ))}
              <CheckpointDetails checkpoints={lane.checkpoints} level={level} />
            </>
          )}
        </section>
        <section className="gph-zone gph-now">
          <h3 className="gph-zone-title">{t('projectGraph.zone.now')}</h3>
          {!atLevel(level, 'countsAndBoundaries') ? null : (
            <>
              <span className="gph-present" aria-hidden="true" />
              {lane.pipelines.length === 0 ? null : (
                <ul className="gph-list gph-pipelines">
                  {lane.pipelines.map((pipeline) => (
                    <Pipeline key={pipeline.id} pipeline={pipeline} blocks={blocks} stepLinks={model.stepLinks} level={level} />
                  ))}
                </ul>
              )}
              <Blocks blocks={loose} stepLinks={model.stepLinks} />
            </>
          )}
        </section>
        <section className="gph-zone gph-future-zone">
          <h3 className="gph-zone-title">{t('projectGraph.zone.futures')}</h3>
          <Futures futures={lane.futures} level={level} />
        </section>
      </div>
    </article>
  )
}

/** What the model could not put under a module is still drawn, named, and never folded into a lane it does not have. */
function Outside({
  model,
  level,
  blocks,
  listed,
}: {
  model: ProjectGraphModel
  level: ProjectGraphLevel
  blocks: ReadonlyMap<string, ProjectGraphNode>
  listed: ReadonlySet<string>
}) {
  const showCheckpoints = atLevel(level, 'revisionsAndCheckpoints')
  const showPresent = atLevel(level, 'countsAndBoundaries')
  const loose = model.unattached.blocks.filter((block) => !listed.has(block.id))
  const any =
    (showPresent && (model.unattached.pipelines.length > 0 || loose.length > 0)) ||
    (showCheckpoints && (model.unattached.checkpoints.length > 0 || model.projectCheckpoints.length > 0)) ||
    model.unattached.futures.length > 0
  if (!any) return null
  return (
    <section className="gph-outside" aria-label={t('projectGraph.outside')}>
      <h2 className="gph-outside-title">{t('projectGraph.outside')}</h2>
      {!showPresent || model.unattached.pipelines.length === 0 ? null : (
        <ul className="gph-list gph-pipelines">
          {model.unattached.pipelines.map((pipeline) => (
            <Pipeline key={pipeline.id} pipeline={pipeline} blocks={blocks} stepLinks={model.stepLinks} level={level} />
          ))}
        </ul>
      )}
      {!showPresent ? null : <Blocks blocks={loose} stepLinks={model.stepLinks} />}
      {!showCheckpoints ? null : <Checkpoints checkpoints={model.unattached.checkpoints} level={level} />}
      {!showCheckpoints || model.projectCheckpoints.length === 0 ? null : (
        <div className="gph-project-checkpoints">
          <h3 className="gph-zone-title">{t('projectGraph.aboutProject')}</h3>
          <Checkpoints checkpoints={model.projectCheckpoints} level={level} />
        </div>
      )}
      {model.unattached.futures.length === 0 ? null : (
        <div className="gph-outside-futures">
          <h3 className="gph-zone-title">{t('projectGraph.zone.futures')}</h3>
          <Futures futures={model.unattached.futures} level={level} />
        </div>
      )}
    </section>
  )
}

/** One window's own days and state, with a bar whose length follows the days it covers. */
function Window({ window, level }: { window: ProjectGraphWindow; level: ProjectGraphLevel }) {
  const start = Date.parse(`${window.startsOn}T00:00:00`)
  const end = Date.parse(`${window.endsOn}T00:00:00`)
  const days = Number.isNaN(start) || Number.isNaN(end) ? 1 : Math.max(1, Math.round((end - start) / 86_400_000) + 1)
  return (
    <li className="gph-window" data-mark="window">
      <div className="gph-window-head">
        {window.recordTitle === null ? (
          <span className="gph-quiet">{t('projectGraph.workGone')}</span>
        ) : (
          <TitleLink id={window.recordId} title={window.recordTitle} className="gph-link gph-item-title" />
        )}
        <StateText state={window.state} />
      </div>
      <span className="gph-window-bar" aria-hidden="true">
        <span className="gph-window-fill" style={{ width: `${String(Math.min(100, 12 + days * 4))}%` }} />
      </span>
      <p className="gph-quiet">{t('projectGraph.window.days', { from: window.startsOn, to: window.endsOn })}</p>
      {atLevel(level, 'summaries') && window.note !== null ? <p className="gph-summary">{window.note}</p> : null}
    </li>
  )
}

function Plan({ plan, level }: { plan: ProjectGraphPlan; level: ProjectGraphLevel }) {
  return (
    <li className="gph-plan" data-mark="plan">
      <div className="gph-plan-head">
        <h3 className="gph-plan-title">{plan.title}</h3>
        <StateText state={plan.state} />
      </div>
      {atLevel(level, 'countsAndBoundaries') ? (
        <p className="gph-quiet">
          {t('projectGraph.plan.lines')}: {t('projectGraph.count.line', { n: plan.lines.length })}
        </p>
      ) : null}
      {atLevel(level, 'summaries') && plan.lines.length > 0 ? (
        <ul className="gph-list gph-plan-lines">
          {plan.lines.map((line) => (
            <li className="gph-line" key={line.id}>
              {lineWithMaths(line.text)}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/** Plans and the work windows that put work in time. Counts arrive at level three and the words at level four. */
function PlansAndTime({ model, level }: { model: ProjectGraphModel; level: ProjectGraphLevel }) {
  if (!atLevel(level, 'countsAndBoundaries')) return null
  if (model.plans.length === 0 && model.windows.length === 0) return null
  return (
    <section className="gph-band" aria-label={t('projectGraph.plans.title')}>
      <h2 className="gph-band-title">{t('projectGraph.plans.title')}</h2>
      {model.plans.length === 0 ? null : (
        <ul className="gph-list gph-plans">
          {model.plans.map((plan) => (
            <Plan key={plan.id} plan={plan} level={level} />
          ))}
        </ul>
      )}
      {model.windows.length === 0 ? null : (
        <ul className="gph-list gph-windows">
          {model.windows.map((window) => (
            <Window key={window.id} window={window} level={level} />
          ))}
        </ul>
      )}
    </section>
  )
}

function Notes({ model }: { model: ProjectGraphModel }) {
  const notes = model.notes.length > 0 ? model.notes : model.empty ? [t('projectGraph.emptyFallback')] : []
  if (notes.length === 0) return null
  return (
    <section className="gph-notes" aria-label={t('projectGraph.notes.title')}>
      <h2 className="gph-notes-title">{t('projectGraph.notes.title')}</h2>
      <ul className="gph-notes-list">
        {notes.map((note, at) => (
          <li key={at}>{note}</li>
        ))}
      </ul>
    </section>
  )
}

/**
 * THE PROJECT'S OWN PAST, under the lanes. The model puts the real revisions of every record no lane holds in
 * `unattached.revisions`; drawing them here is what makes the level-2 revision count the model states true on the page.
 * Stopping points drawn nowhere are already shown by Outside, so this rail carries no checkpoint of its own. A project
 * whose past is only migration baselines has no entry here and says so in its notes instead.
 */
function TheProjectPastRail({ model, level }: { model: ProjectGraphModel; level: ProjectGraphLevel }) {
  const entries = model.unattached.revisions.entries
  if (!atLevel(level, 'revisionsAndCheckpoints') || entries.length === 0) return null
  return (
    <section className="gph-project-past" aria-label={t('projectGraph.projectPast')}>
      <h2 className="gph-project-past-title">{t('projectGraph.projectPast')}</h2>
      <p className="gph-quiet">{t('projectGraph.projectPast.why')}</p>
      <PastRail entries={entries} checkpoints={[]} />
    </section>
  )
}

export function ProjectGraph({ model, level }: { model: ProjectGraphModel; level: ProjectGraphLevel }) {
  useLanguage()
  const blocks = new Map<string, ProjectGraphNode>()
  for (const lane of model.lanes) for (const block of lane.blocks) blocks.set(block.id, block)
  for (const block of model.unattached.blocks) blocks.set(block.id, block)
  // Every step a drawn pipeline lists, in a lane or outside every lane. Such a step is drawn on that list and not again.
  const listed = new Set(
    [...model.lanes.flatMap((lane) => lane.pipelines), ...model.unattached.pipelines].flatMap((pipeline) => pipeline.blockIds),
  )
  return (
    <>
      <style href="mole-office-project-graph" precedence="default">
        {PROJECT_GRAPH_CSS}
      </style>
      {atLevel(level, 'countsAndBoundaries') ? (
        <p className="gph-totals">
          <span className="gph-totals-label">{t('projectGraph.totals')}</span>
          <CountChip>
            {t('projectGraph.count.module', { n: model.counts.modules })}
            {' · '}
            {t('projectGraph.count.pipeline', { n: model.counts.pipelines })}
            {' · '}
            {t('projectGraph.count.block', { n: model.counts.blocks })}
            {' · '}
            {t('projectGraph.count.revision', { n: model.counts.realRevisions })}
            {' · '}
            {t('projectGraph.count.checkpoint', { n: model.counts.checkpoints })}
            {' · '}
            {t('projectGraph.count.future', { n: model.counts.trajectories + model.counts.directions })}
            {' · '}
            {t('projectGraph.count.plannedState', { n: model.counts.plannedStates })}
            {' · '}
            {t('projectGraph.count.plan', { n: model.counts.plans })}
            {' · '}
            {t('projectGraph.count.window', { n: model.counts.windows })}
          </CountChip>
        </p>
      ) : null}
      {model.lanes.length === 0 ? (
        model.empty ? null : <p className="gph-nolanes">{t('projectGraph.noLanes')}</p>
      ) : (
        <div className="gph-lanes">
          {model.lanes.map((lane) => (
            <Lane key={lane.module.id} lane={lane} model={model} level={level} blocks={blocks} listed={listed} />
          ))}
        </div>
      )}
      <TheProjectPastRail model={model} level={level} />
      <Outside model={model} level={level} blocks={blocks} listed={listed} />
      <Notes model={model} />
      <PlansAndTime model={model} level={level} />
    </>
  )
}

/**
 * The drawing's own rules. Every colour is a token, so the dark look is a different picture and not the same
 * picture dimmed. The only numbers written here are geometry and the two line weights the graph's model and
 * lines.ts already declare.
 */
const PROJECT_GRAPH_CSS = `
.gph-totals {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--pad);
  margin: 0 0 var(--gut);
  min-width: 0;
}
.gph-totals-label {
  font: 700 var(--fs-1)/var(--lh-tight) var(--font-ui);
  letter-spacing: .05em;
  text-transform: uppercase;
  color: var(--text-3);
}
.gph-count {
  display: inline-block;
  max-width: 100%;
  padding: 1px var(--pad);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--panel-2);
  color: var(--text-3);
  font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
  overflow-wrap: anywhere;
}
.gph-lanes { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }
.gph-lane {
  min-width: 0;
  padding: var(--pad-lg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
  overflow-wrap: anywhere;
}
.gph-lane-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--pad);
  min-width: 0;
}
.gph-lane-title {
  margin: 0;
  min-width: 0;
  font: 600 var(--fs-4)/var(--lh-tight) var(--font-ui);
}
.gph-lane-link { font: inherit; }
.gph-zones {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr) minmax(0, 1.1fr);
  gap: var(--gut);
  margin-top: var(--gut);
  min-width: 0;
}
.gph-zone { min-width: 0; padding-top: var(--pad); border-top: 1px solid var(--border); }
.gph-zone-title {
  margin: 0 0 calc(var(--pad) * 0.5);
  font: 700 var(--fs-1)/var(--lh-tight) var(--font-ui);
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--text-3);
}
.gph-list {
  display: flex;
  flex-direction: column;
  gap: calc(var(--pad) * 0.5);
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
}
.gph-item, .gph-pipeline, .gph-boundary, .gph-future, .gph-plan, .gph-window { min-width: 0; overflow-wrap: anywhere; }
.gph-link {
  color: var(--text);
  text-decoration: underline;
  text-decoration-color: var(--border);
  text-underline-offset: .15em;
  overflow-wrap: anywhere;
}
.gph-link:hover, .gph-link:focus-visible { text-decoration-color: var(--text); }
.gph-item-title { font: 600 var(--fs-2)/var(--lh-body) var(--font-ui); }
.gph-value { color: var(--text-2); font: var(--fs-1)/var(--lh-body) var(--font-ui); }
.gph-quiet, .gph-what, .gph-reason, .gph-summary, .gph-line, .gph-notes-list, .gph-nolanes {
  margin: 2px 0 0;
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
  color: var(--text-3);
  min-width: 0;
  overflow-wrap: anywhere;
}
.gph-what, .gph-summary, .gph-line { color: var(--text-2); }
.gph-summary {
  margin-top: var(--pad);
  padding-left: var(--pad);
  border-left: 2px solid var(--border);
  color: var(--text-2);
}
.gph-reason { color: var(--text-2); }
.gph-reason strong { color: var(--text-3); }
.gph-past-rail {
  position: relative;
  min-height: 2.6rem;
  margin: 0 6px var(--pad);
  padding-top: .55rem;
}
.gph-rail-line {
  position: absolute;
  left: 0;
  right: 0;
  top: .9rem;
  border-top: 1px solid var(--border-strong);
  opacity: .55;
}
.gph-rail-event {
  position: absolute;
  top: .5rem;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.gph-rail-revision { color: var(--text-3); }
.gph-rail-checkpoint {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  text-decoration: none;
}
.gph-rail-checkpoint .gph-diamond { margin-top: .25rem; }
.gph-rail-row-line { opacity: .3; }
.gph-rail-tick {
  display: block;
  width: 2px;
  height: 1rem;
  background: var(--border-strong);
  opacity: .75;
}
.gph-rail-seq { font: var(--fs-1)/1 var(--font-mono); }
.gph-rail-single {
  margin: .7rem 0 0;
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
  color: var(--text-2);
  overflow-wrap: anywhere;
}
.gph-checkpoint { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: var(--pad); }
.gph-checkpoint-detail { display: block; }
.gph-checkpoint > :not(.gph-diamond) { grid-column: 2; }
.gph-diamond {
  grid-column: 1;
  grid-row: 1;
  width: 8px;
  height: 8px;
  margin-top: .35em;
  border: 1.5px solid var(--border-strong);
  transform: rotate(45deg);
}
.gph-source-marker { font-family: var(--font-mono); }
.gph-present {
  display: block;
  height: 0;
  margin: 2px 0 var(--pad);
  border-top: ${LINE_WEIGHT.plain}px solid var(--border-strong);
}
.gph-pipelines { gap: var(--pad); }
.gph-pipeline-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: calc(var(--pad) * 0.5);
  min-width: 0;
}
.gph-boundary {
  padding: var(--pad);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.gph-blocks { margin-top: calc(var(--pad) * 0.5); }
.gph-step-links {
  margin: 2px 0 0;
  padding: 0 0 0 var(--pad);
  list-style: none;
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
  color: var(--text-2);
  min-width: 0;
  overflow-wrap: anywhere;
}
.gph-futures { gap: var(--pad); }
.gph-future {
  padding: var(--pad) 0 0;
  border-top: 1px solid var(--border);
}
.gph-future[data-muted="1"] { opacity: .55; }
.gph-curve {
  display: block;
  width: 100%;
  max-width: 100%;
  height: 1.6rem;
  overflow: visible;
}
.gph-curve-path {
  fill: none;
  stroke: var(--border-strong);
  stroke-width: ${EVOLUTION_WEIGHT};
  stroke-linecap: round;
  opacity: .75;
  vector-effect: non-scaling-stroke;
}
.gph-future-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: calc(var(--pad) * 0.5);
  min-width: 0;
}
.gph-states { margin-top: var(--pad); padding-left: var(--pad); border-left: 1px solid var(--border); }
.gph-outside, .gph-project-past {
  margin-top: calc(var(--gut) * 2);
  padding-top: var(--gut);
  border-top: 1px solid var(--border);
  min-width: 0;
}
.gph-outside-title, .gph-project-past-title, .gph-band-title, .gph-notes-title {
  margin: 0 0 var(--pad);
  font: 600 var(--fs-4)/var(--lh-tight) var(--font-ui);
  color: var(--text);
}
.gph-project-checkpoints { margin-top: var(--pad); }
.gph-notes { margin-top: calc(var(--gut) * 2); padding-top: var(--gut); border-top: 1px solid var(--border); }
.gph-notes-list { margin: 0; padding-left: 1.1em; }
.gph-notes-list li { margin: 0 0 calc(var(--pad) * 0.5); }
.gph-band {
  margin-top: calc(var(--gut) * 2);
  padding-top: var(--gut);
  border-top: 1px solid var(--border);
  min-width: 0;
}
.gph-plans, .gph-windows {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
  gap: var(--gut);
}
.gph-plan, .gph-window {
  padding: var(--pad);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
}
.gph-plan-head, .gph-window-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: calc(var(--pad) * 0.5);
  min-width: 0;
}
.gph-plan-title { margin: 0; min-width: 0; font: 600 var(--fs-2)/var(--lh-body) var(--font-ui); color: var(--text); overflow-wrap: anywhere; }
.gph-plan-lines { margin-top: var(--pad); }
.gph-window-bar {
  display: block;
  height: 8px;
  margin: var(--pad) 0 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--panel-3);
  overflow: hidden;
}
.gph-window-fill {
  display: block;
  height: 100%;
  background: var(--accent);
  opacity: .55;
}
@media (max-width: 60rem) {
  .gph-zones { grid-template-columns: minmax(0, 1fr); }
  .gph-zone + .gph-zone { margin-top: var(--pad); }
}
@media (max-width: 40rem) {
  .gph-lane { padding: var(--pad); }
  .gph-plans, .gph-windows { grid-template-columns: minmax(0, 1fr); }
  .gph-lane-head, .gph-pipeline-head, .gph-future-head, .gph-plan-head, .gph-window-head { flex-direction: column; align-items: flex-start; }
}
`
