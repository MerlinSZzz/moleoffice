// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useInspect } from '../../lib/mode.ts'
import { useLanguage } from '../../lib/language.ts'
import { t, type WordKey } from '@shared/i18n.ts'
import { actorTypeWord } from '@shared/words.ts'
/**
 * THE MODULE EVOLUTION DRAWING — how a subsystem may evolve, drawn so it cannot be mistaken for a
 * pipeline.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH VISUAL PROPERTY CARRIES WHICH MEANING, AND WHY EACH IS THE ONE IT IS
 * ---------------------------------------------------------------------------------------
 *
 *   CURVE vs RIGHT ANGLE — the whole separation from the pipeline, and the only channel that says
 *   "this is a possible future". ELK routes a pipeline edge as straight runs meeting at right
 *   angles, which reads as something built and running; a branch that leaves its trunk on a cubic
 *   Bezier reads as something that might grow. A reader who glances at either drawing knows which
 *   one they are looking at before reading a word.
 *
 *   WEIGHT — lighter than every line on a pipeline, and `evolutionIsLighterThanPipeline` states
 *   that against lines.ts's own table so a pipeline line that got lighter cannot silently pass it.
 *   What runs stays the dominant reading; what might happen recedes.
 *
 *   MUTED — this branch has been SET ASIDE: parked with a reason, or superseded by another record.
 *   Reduced contrast on the row and on the curve into it. It is still drawn, still linked, still
 *   readable, and the reason is printed in the record's own words. A direction that was put down is
 *   the most useful thing on a drawing about what to try next, and deleting it from the picture is
 *   how a lab tries the same dead end twice.
 *
 *   DASHED — RESERVED, and NOT spent on being set aside. In this app a dash means "Mole Office worked
 *   this out and nobody confirmed it" — Canvas.tsx says so, ui.tsx says so twice, and the inferred
 *   link mark is built on it. The brief offered "muted or dashed" for a set-aside branch and this
 *   drawing takes muted, because spending the dash on a second meaning would make every inferred
 *   line in the product ambiguous. The dash appears here for exactly one thing: an `inferred` link.
 *
 *   INDENT — how many hops from the module. A branch off a branch is one level further out.
 *
 *   COLOUR — none of its own. Colour in this product is fully spent on state, and a direction has
 *   no state word at all; it has a DEPTH, on its own six-rung ladder, which is printed as a rung
 *   and a ladder length rather than inked. A colour here would sit beside the state chips on the
 *   same page and make two different things look like one.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS NOT DRAWN, AND SAYS SO
 * ---------------------------------------------------------------------------------------
 *
 * A link to a record that is not a direction, and a link whose far end is not in the workspace
 * listing. Both are counted and printed under the drawing by the model. A drawing that quietly
 * showed a subset would be worse than no drawing.
 */

import type { RecordKind } from '@shared/types.ts'
import {
  DOT_R,
  ELBOW_H,
  ELBOW_PAD,
  EVOLUTION_WEIGHT,
  buildEvolution,
  type EvolutionInput,
  type EvolutionNode,
  type EvolutionRow,
} from './evolution-model.ts'
import { recordPath } from '../router.tsx'
import type { Declares } from '../declares.ts'
import { Absence, DEPTH_MEANING_KEYS, DEPTH_WORD_KEYS, Empty, Mark, Panel, Tag } from '../ui.tsx'
import { useEffect, useState } from 'react'
import { api } from '../../api.ts'
import { COMPOSITION_MARKS, EVOLUTION_MARKS, type CompositionMark } from '@shared/composition.ts'
import { BLOCK_TITLE_SEPARATOR } from '@shared/blocks.ts'
import { UNACCOUNTED_REASONS, type UnaccountedReason } from '@shared/composition.ts'
import { targetAttributes } from '@shared/targets.ts'
import { moduleName, OriginMark } from './origin-mark.tsx'
import { CompareWithAnother } from './Against.tsx'
import { MADE_OF_KEY } from '@shared/sections.ts'
import { titleHere } from '../sections.ts'
import { DrawingControl } from './controls.tsx'

// ============================================================================ one row

function DepthLine({ node }: { node: EvolutionNode }) {
  const depth = node.depth
  if (depth === null) return null
  if (depth.depth === null) {
    // The one thing a direction must not leave out. Said as the gap it is, and still not urgent:
    // a direction nobody has taken anywhere is not work that stopped short.
    return (
      <span className="ev-depth ev-depth-none" title={t('sheet.depth.noneDetail')}>{t('g7b.Evolution.no_depth_recorded')}</span>
    )
  }
  // THE RUNG IN THE READER'S WORDS, the ones `DepthLadder` in ui.tsx draws. `depth.depth` is the stored
  // English word and `depth.note` is written in English for an agent; a Chinese row read "2/6 read".
  return (
    <span className="ev-depth" title={t('sheet.depth.detail', { meaning: t(DEPTH_MEANING_KEYS[depth.depth]) })}>
      <span className="num">
        {depth.rung}/{depth.rungs}
      </span>{' '}
      {t(DEPTH_WORD_KEYS[depth.depth])}
    </span>
  )
}

function Branch({ row, gutterWidth }: { row: EvolutionRow; gutterWidth: number }) {
  return (
    <span className="ev-gutter" style={{ width: `${gutterWidth}px` }} aria-hidden="true">
      {/* Ancestor trunks that still have a branch below this row. Plain rules: a straight vertical
          has no shape to say anything with, so it says nothing and stays out of the way. */}
      {row.throughs.map((x) => (
        <span key={x} className="ev-through" style={{ left: `${x}px` }} />
      ))}
      {row.tail ? <span className="ev-tail" style={{ left: `${row.dotX}px`, top: `${ELBOW_H}px` }} /> : null}
      <svg
        className="ev-branch"
        width={gutterWidth}
        height={ELBOW_H + ELBOW_PAD}
        viewBox={`0 0 ${gutterWidth} ${ELBOW_H + ELBOW_PAD}`}
        focusable="false"
      >
        {row.curve === null ? null : (
          <path className="ev-curve" d={row.curve} data-inferred={row.inferred ? '1' : undefined} />
        )}
        <circle className="ev-dot" cx={row.dotX} cy={ELBOW_H} r={DOT_R} />
      </svg>
    </span>
  )
}

function NodeRow({ node, row, gutterWidth }: { node: EvolutionNode; row: EvolutionRow; gutterWidth: number }) {
  const inspect = useInspect()
  return (
    <li className="ev-row" data-muted={row.muted ? '1' : undefined} data-kind={node.kind}>
      <Branch row={row} gutterWidth={gutterWidth} />
      <div className="ev-body">
        <div className="ev-head">
          {node.kind === 'module' ? (
            <>
              <Tag tone="accent">{t('g7b.Evolution.this_module')}</Tag>
              <span className="ev-title wrap-anywhere">{node.title}</span>
            </>
          ) : (
            <>
              <Tag kind="direction" />
              <a className="ev-title wrap-anywhere" href={`#${recordPath(node.id)}`}>
                {node.title}
              </a>
              <DepthLine node={node} />
              {node.viaInferred ? (
                <Tag tone="quiet" title={t('g7b.Evolution.mole_office_worked_this_link_out_itself')}>{t('g7b.Evolution.inferred')}</Tag>
              ) : null}
            </>
          )}
        </div>

        {/* The stored link's own wording, from this row's point of view, so the branch says what
            kind of branch it is rather than just that there is one — and it NAMES what it branches
            off rather than saying "the record above", which is the wrong record on every row that
            closes a branch and returns to a trunk further up. */}
        {node.viaLabel === null || node.parentTitle === null ? null : (
          <p className="ev-via">
            {node.viaLabel} <span className="wrap-anywhere">“{node.parentTitle}”</span>
          </p>
        )}

        {/* SET ASIDE, IN THE RECORD'S OWN WORDS. The mute is the signal; this is the reason, and
            without it a muted row is indistinguishable from a row somebody forgot about. */}
        {node.setAside.map((aside, i) => (
          <p className="ev-aside" key={`${aside.way}-${i}`}>
            <span className="ev-aside-word">{t('g7b.Evolution.set_aside')}</span>{' '}
            <span className="wrap-anywhere">{aside.because}</span>{' '}
            {inspect ? <span className="ev-aside-from">{t('g7b.Evolution.read_from')}{aside.from}</span> : null}
          </p>
        ))}

        {node.summary === null || node.summary.trim() === '' ? null : (
          <p className="ev-summary wrap-anywhere">{node.summary}</p>
        )}

        {node.alsoJoins.map((join) => (
          <p className="ev-also" key={join.linkId}>{t('g7b.Evolution.also')}{join.label} <span className="wrap-anywhere">“{join.otherTitle}”</span>{t('g7b.Evolution.named_here_not_drawn')}</p>
        ))}
      </div>
    </li>
  )
}

// ============================================================================ the drawing

/**
 * How this subsystem may evolve: the directions opened against it, and the branches off those.
 *
 * A PANEL AND NOT A CANVAS, deliberately. A pipeline is a canvas you pan and zoom because it is the
 * shape of a running system and the shape is the subject. This is a handful of possible futures
 * read in order, it lives in a column beside a checklist, and it has to be legible at 390px — so
 * it is a trunk with branches curving off it, laid out by flow rather than by coordinates, and
 * nothing about it needs measuring.
 */
export function Evolution({ declares, ...input }: EvolutionInput & { declares: Declares }) {
  useLanguage()
  const graph = buildEvolution(input)
  const branches = graph.nodes.length - 1
  const aside = graph.nodes.filter((node) => node.setAside.length > 0).length

  return (
    <>
      <style href="mole-office-evolution" precedence="default">
        {EVOLUTION_CSS}
      </style>
      <Panel titleIs="label" declares={declares}
        title={t('g7b.Evolution.how_this_subsystem_may_evolve')}
        actions={
          branches > 0 ? (
            <span className="ev-count num">
              {t('g7b.branchCount', { n: branches })}
              {aside > 0 ? t('g7b.Evolution.set_aside_1598', { v1: aside }) : ''}
            </span>
          ) : undefined
        }
      >
        {branches === 0 ? (
          <>
            <Absence />
          </>
        ) : (
          <>
            <ol className="ev-rows">
              {graph.nodes.map((node, i) => (
                <NodeRow
                  key={node.id}
                  node={node}
                  row={graph.rows[i] as EvolutionRow}
                  gutterWidth={graph.gutterWidth}
                />
              ))}
            </ol>
          </>
        )}

        {graph.notes.map((note, i) => (
          <p className="ev-note" key={i}>
            {note}
          </p>
        ))}
      </Panel>
    </>
  )
}

// ============================================================================ styles

/**
 * This drawing's own rules.
 *
 * Every value is a token from tokens.css or a number this file's model derived, so a preset swap
 * re-skins all of it. There is no colour written out and no state token used: a direction has no
 * state, and colour in this product is spent on state alone.
 */
/* NO READING MEASURE ANYWHERE IN THIS DRAWING, and that is a decision rather than an omission.
   Every string here is a note, a via line, a reason a branch was set aside or a legend entry --
   the panel talking about the links, not a record's own prose -- and each one already sits inside
   something narrower than the panel: a row indented by its gutter, or a fold. Capping those at the
   reading measure as well was a second constraint inside the first, and it is what made a branch's
   reason break at 489px against a row 742px wide. */
const EVOLUTION_CSS = `
.ev-note {
  margin: var(--gut) 0 0;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-3);
}
.ev-note:first-child { margin-top: 0; }
.ev-note code { font-family: var(--font-mono); font-size: 0.94em; }
.ev-count { font-size: var(--fs-1); font-weight: 600; color: var(--text-3); white-space: nowrap; }

.ev-rows { list-style: none; margin: var(--gut) 0 0; padding: 0; }
/* THE SPACE UNDER A ROW IS THE BODY'S, NOT THE ROW'S. The gutter stretches to the row's content box, so
   padding on the row left a gap of that height in every trunk between two rows, and a branch did not
   reach the trunk it came from (round 40, tests/the-evolution-drawing-curves-each-branch-from-its-own-trunk). */
.ev-row {
  display: flex;
  align-items: stretch;
  gap: var(--pad);
  min-width: 0;
}

/* ------------------------------------------------------------ the gutter */
.ev-gutter { position: relative; flex: none; align-self: stretch; }
/* An ancestor trunk with another branch still to come below this row. A straight rule, so it
   says nothing beyond "this line continues" -- which is all it is for. */
.ev-through,
.ev-tail {
  position: absolute;
  width: 0;
  border-left: ${EVOLUTION_WEIGHT}px solid var(--border-strong);
  opacity: .55;
}
.ev-through { top: 0; bottom: 0; }
.ev-tail { bottom: 0; }

.ev-branch { position: absolute; top: 0; left: 0; overflow: visible; }
/* THE ONE PROPERTY THAT SEPARATES THIS DRAWING FROM A PIPELINE. Curved, and lighter than every
   line lines.ts declares for a pipeline -- evolutionIsLighterThanPipeline states that rule. */
.ev-curve {
  fill: none;
  stroke: var(--border-strong);
  stroke-width: ${EVOLUTION_WEIGHT};
  stroke-linecap: round;
  opacity: .75;
  vector-effect: non-scaling-stroke;
}
/* RESERVED. A dash means "Mole Office worked this out" in this app and is spent on nothing else. */
.ev-curve[data-inferred="1"] { stroke-dasharray: 3 3; }
.ev-dot { fill: var(--panel); stroke: var(--border-strong); stroke-width: ${EVOLUTION_WEIGHT}; }

/* ------------------------------------------------------------ the row */
.ev-body { min-width: 0; flex: 1 1 auto; padding-top: calc(${ELBOW_H}px - 0.62em); padding-bottom: var(--pad); }
.ev-head { display: flex; align-items: baseline; gap: var(--pad); flex-wrap: wrap; min-width: 0; }
.ev-title { font-size: var(--fs-2); font-weight: 600; color: var(--text); min-width: 0; }
a.ev-title { text-decoration: none; }
a.ev-title:hover, a.ev-title:focus-visible { text-decoration: underline; }

.ev-depth {
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-3);
  white-space: nowrap;
}
.ev-depth .num { font-family: var(--font-mono); }
.ev-depth-none { font-weight: 500; font-style: italic; }

.ev-via,
.ev-summary,
.ev-also,
.ev-aside {
  margin: 2px 0 0;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-3);
  min-width: 0;
}
.ev-summary { color: var(--text-2); }
.ev-aside-word {
  font-weight: 700;
  letter-spacing: .04em;
  text-transform: uppercase;
  font-size: 0.94em;
  color: var(--text-2);
}
.ev-aside-from { opacity: .8; }
.ev-aside-from,
.ev-also { font-style: italic; }

/* MUTED, NOT HIDDEN, AND NOT DASHED. Contrast only: everything on the row is still there and
   still readable, and the reason it was set aside is printed beside it. */
.ev-row[data-muted="1"] .ev-title,
.ev-row[data-muted="1"] .ev-summary { color: var(--text-3); font-weight: 500; }
.ev-row[data-muted="1"] .ev-curve,
.ev-row[data-muted="1"] .ev-dot { opacity: .4; }
.ev-row[data-muted="1"] .ev-aside-word { color: var(--text-3); }
`

// ============================================================================ the six marks

/**
 * THE LEGEND, DRAWN BEFORE THE VIEW WAS DESIGNED.
 *
 * Six marks, each a shape and a word, and the shapes are told apart with the colour gone. The
 * amendment to step 46 makes this the gate on the whole drawing: if any two were confusable in
 * grey, planned and actual could not share a spine and the graph would need two lanes. The
 * measurement at 390 px is in `design/round-nine/step45-49-evolution.md`.
 *
 * EACH GLYPH IS A DIFFERENT PICTURE, NOT A DIFFERENT COLOUR OF THE SAME ONE:
 *   added        a solid square           it is here now and was not before
 *   removed      a square struck through  it was here and is not now
 *   changed      a square with a gap      the same thing, edited
 *   moved        two bars swapping        it changed places with something that stayed
 *   regrouped    two squares side by side the grouping around it moved
 *   unaccounted  a dashed square          the sources cannot say
 */
/** The word for each hole in the evidence. The sentence behind it is `UNACCOUNTED_REASONS`. */
const UNACCOUNTED_WORDS: Readonly<Record<UnaccountedReason, string>> = {
  get noRecord() { return t('g7b.Evolution.no_record') },
  get noRevisionYet() { return t('g7b.Evolution.nothing_recorded_yet') },
  get unreadableTime() { return t('g7b.Evolution.time_unreadable') },
  get beforeAnythingRecorded() { return t('g7b.Evolution.earlier_than_anything_recorded') },
}

/** A phrase, not a sentence: the three sources, named. The gate holds this file at zero sentences. */
const READ_SOURCES_NOTE = () => t('g7b.Evolution.three_sources_this_record_s_versions_its')

const MARK_GLYPHS: Readonly<Record<CompositionMark, React.ReactNode>> = {
  added: <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="currentColor" stroke="none" />,
  removed: (
    <>
      <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="none" strokeWidth="1.7" />
      <path d="M2.4 13.6L13.6 2.4" strokeWidth="1.7" strokeLinecap="round" />
    </>
  ),
  changed: (
    <>
      <path d="M8 3.5h4.5v9H8" fill="none" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M6 3.5H3.5v9H6" fill="none" strokeWidth="1.7" strokeLinejoin="round" />
    </>
  ),
  moved: (
    <>
      <path d="M2.6 5.4h7.2" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7.6 3.2l2.4 2.2-2.4 2.2" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.4 10.6H6.2" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.4 8.4L6 10.6l2.4 2.2" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  regrouped: (
    <>
      <rect x="1.6" y="4.4" width="5.2" height="7.2" rx="1.2" fill="none" strokeWidth="1.7" />
      <rect x="9.2" y="4.4" width="5.2" height="7.2" rx="1.2" fill="none" strokeWidth="1.7" strokeDasharray="2.2 1.8" />
      <path d="M7.2 8h1.6" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  unaccounted: (
    <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="none" strokeWidth="1.7" strokeDasharray="2.4 2" />
  ),
}

/** One mark, drawn the way every other state in this product is drawn. */
export function CompositionMarkChip({ mark }: { mark: CompositionMark }) {
  const entry = EVOLUTION_MARKS[mark]
  // THE WORD AND ITS MEANING IN THE PAGE'S LANGUAGE. The English is `EVOLUTION_MARKS` in
  // src/shared/composition.ts, word for word; the shape still comes from there.
  return (
    <Mark
      glyph={MARK_GLYPHS[mark]}
      word={t(COMPOSITION_MARK_WORDS[mark].word)}
      mark={entry.mark}
      detail={t(COMPOSITION_MARK_WORDS[mark].detail)}
      // ONE TONE FOR ALL SIX, which is the strongest form of the rule rather than a compromise
      // with it. `tone` inks a mark from the state token family; giving each mark its own would
      // let a reader learn the colours and stop reading the shapes, and the shapes are what
      // survive a grey screen. So every mark here is inked the same and only the picture differs.
      tone="todo"
    />
  )
}

const COMPOSITION_MARK_WORDS = {
  added: { word: 'g2b.composition.added', detail: 'g2b.composition.addedDetail' },
  removed: { word: 'g2b.composition.removed', detail: 'g2b.composition.removedDetail' },
  changed: { word: 'g2b.composition.changed', detail: 'g2b.composition.changedDetail' },
  moved: { word: 'g2b.composition.moved', detail: 'g2b.composition.movedDetail' },
  regrouped: { word: 'g2b.composition.regrouped', detail: 'g2b.composition.regroupedDetail' },
  unaccounted: { word: 'g2b.composition.unaccounted', detail: 'g2b.composition.unaccountedDetail' },
} as const satisfies Record<CompositionMark, { word: WordKey; detail: WordKey }>

/** All six, in one row, for the legend and for the proof that photographs it at 390 px. */
export function CompositionLegend() {
  return (
    <ul className="ev-marks" data-px-legend="composition">
      {COMPOSITION_MARKS.map((mark) => (
        <li key={mark} data-mark={mark}>
          <CompositionMarkChip mark={mark} />
        </li>
      ))}
    </ul>
  )
}

// ============================================================================ what it was made of

/**
 * WHAT A PIPELINE OR A MODULE WAS MADE OF, AND WHAT CHANGED — the evolution reading of steps 45–48.
 *
 * Every number and every name on this panel comes from `GET /api/composition/<id>`, which is one
 * pure projection over three sources. This component decides nothing about membership: it draws
 * what the projection returned, including the elements the projection could not account for.
 *
 * THE ORIGIN MARK IS ON EVERY ROW THAT NAMES A RECORD, and that is step 44's acceptance line handed
 * forward: a made-up example drawn in an evolution view without its mark is made-up content
 * presented as observed history.
 */
interface CompositionReadingShape {
  subject: { id: string; kind: string; title: string; origin: string | null; workspaceId?: string }
  carrierNames: Record<string, { title: string; origin: string | null; deleted: boolean }>
  at: {
    asOf: string
    subject: {
      revision: { seq: number; at: string; op: string; actorType: string; actorId: string } | null
      title: string | null
      unaccounted: UnaccountedReason | null
    }
    members: {
      recordId: string
      position: number | null
      title: string | null
      origin: { value: string | null } | null
      deletedThen: boolean
      from: {
        subject: { seq: number; at: string } | null
        child: { seq: number; at: string; op: string; actorType: string; actorId: string } | null
        link: { at: string; type: string; fromId: string } | null
      }
      carriers: { moduleId: string; since: string }[]
      unaccounted: string | null
    }[]
    unaccounted: unknown[]
  }
  events: {
    order: number
    at: string
    source: string
    what: string
    recordId: string
    seq: number | null
    linkType: string | null
    otherId: string | null
    actorType: string
    actorId: string
    tied: boolean
  }[]
  stops: { order: number; at: string; events: CompositionReadingShape['events'] }[]
  lineage: {
    ancestorId: string
    ancestorTitle: string
    ancestorOrigin: string | null
    at: string
    actorType: string
    actorId: string
    ancestorRevision: { seq: number; at: string } | null
    how: string
    storedRevision: null
  } | null
}

interface ChangeShape {
  carrierNames: CompositionReadingShape['carrierNames']
  diff: {
    from: string
    to: string
    unchanged: number
    counts: Record<CompositionMark, number>
    changes: {
      recordId: string
      title: string | null
      origin: string | null
      marks: CompositionMark[]
      before: { position: number | null; carriers: string[]; seq: number | null } | null
      after: { position: number | null; carriers: string[]; seq: number | null } | null
    }[]
  }
}

function nameOf(title: string | null, recordId: string): string {
  if (title === null) return t('g7b.notNamed')
  const cut = title.lastIndexOf(BLOCK_TITLE_SEPARATOR)
  return cut === -1 ? title : title.slice(cut + 1).trim()
}

export function CompositionEvolution({
  recordId,
  kind,
  declares,
}: {
  recordId: string
  /** The record's kind, so this panel's heading is the one the declaration holds and not a literal. */
  kind: RecordKind
  /**
   * `sectionsOf(record)(MADE_OF_KEY)` — worked out by the page, spelled by nobody here.
   *
   * THIS PANEL USED TO BE SEE-THROUGH, in all three of the states below. The argument was that its
   * rows come from other records, so the record around it answers *what is this* better. That is
   * right about a ROW and wrong about the PANEL: measured on 30 August 2026, right-clicking this
   * heading on module `cegP4HnIk9nd` put the whole module in the composer, so a remark about how
   * the record was assembled was filed as a remark about its subject matter. *Sources and history*
   * is one of the six meaningful sections the owner's own acceptance names on a module page.
   */
  declares: Declares
}) {
  const inspect = useInspect()
  useLanguage()
  const [reading, setReading] = useState<CompositionReadingShape | null>(null)
  const [change, setChange] = useState<ChangeShape | null>(null)
  const [fault, setFault] = useState<string | null>(null)
  const [stop, setStop] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    setFault(null)
    api
      .composition(recordId, stop === null ? undefined : stopAt(reading, stop))
      .then((answer) => {
        if (alive) setReading(answer as CompositionReadingShape)
      })
      .catch((error: unknown) => {
        if (alive) setFault(String((error as Error).message))
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId, stop])

  const stops = reading?.stops ?? []
  const here = stop === null ? stops.length - 1 : stop

  useEffect(() => {
    let alive = true
    if (reading === null || here <= 0) {
      setChange(null)
      return
    }
    const from = stops[here - 1]?.at
    const to = stops[here]?.at
    if (from === undefined || to === undefined) return
    api
      .compositionChange(recordId, from, to)
      .then((answer) => {
        if (alive) setChange(answer as ChangeShape)
      })
      .catch(() => {
        if (alive) setChange(null)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId, reading, here])

  if (fault !== null) {
    return (
      <Panel titleIs="label" declares={declares} title={titleHere(kind, MADE_OF_KEY)} kind={t('g7b.Evolution.composition')}>
        <Empty message={fault} />
      </Panel>
    )
  }
  if (reading === null) {
    return (
      <Panel titleIs="label" declares={declares} title={titleHere(kind, MADE_OF_KEY)} kind={t('g7b.Evolution.composition')}>
        <Absence tier="ordinary" word={t('g7b.Evolution.reading')} title={READ_SOURCES_NOTE()} />
      </Panel>
    )
  }

  const composition = reading.at
  const revision = composition.subject.revision
  const boundary = (change?.diff.changes ?? []).filter((row) => row.marks.includes('regrouped'))

  return (
    <>
      <style href="mole-office-composition" precedence="default">
        {COMPOSITION_CSS}
      </style>
      <div data-px-composition={reading.subject.id}>
      <Panel
        titleIs="label"
        declares={declares}
        title={titleHere(kind, MADE_OF_KEY)}
        kind={t('g7b.Evolution.composition')}
        actions={
          <span className="cp-where num">
            {t('g7b.historyStop', { version: revision === null ? t('g7b.Evolution.no_version') : t('g7b.Evolution.version', { v1: revision.seq }), n: here + 1, total: stops.length })}
          </span>
        }
      >
        <div className="cp-head">
          <span className="cp-subject">{composition.subject.title ?? reading.subject.title}</span>
          <OriginMark origin={reading.subject.origin} />
          <span className="cp-stamp num">{composition.asOf}</span>
          {revision === null || !inspect ? null : (
            <span className="cp-who">
              {revision.actorType} · {revision.actorId}
            </span>
          )}
        </div>

        <div className="cp-walk" data-px-walk="composition">
          {/* THE THREE STEPS GO THROUGH THE SHARED CONTROL, so a step that would change nothing
              says why instead of being a grey button that says nothing. They were raw buttons with
              `disabled` until 30 September 2026 (problem _b3XYAYKrZsC). A step forward onto the
              newest stop is the same as Now, so it sets Now: the two cannot disagree about where
              the reader is. */}
          <DrawingControl
            look="button"
            now={here}
            after={Math.max(0, here - 1)}
            reason={t('g7b.Evolution.alreadyFirst')}
            onPress={() => setStop(Math.max(0, here - 1))}
          >{t('g7b.Evolution.step_back')}</DrawingControl>
          <DrawingControl
            look="button"
            now={here}
            after={Math.min(stops.length - 1, here + 1)}
            reason={t('g7b.Evolution.alreadyLast')}
            onPress={() => setStop(here + 1 >= stops.length - 1 ? null : here + 1)}
          >{t('g7b.Evolution.step_forward')}</DrawingControl>
          <DrawingControl
            look="button"
            now={stop}
            after={null}
            reason={t('g7b.Evolution.alreadyNow')}
            onPress={() => setStop(null)}
          >{t('g7b.Evolution.now')}</DrawingControl>
          {stops[here] === undefined ? null : (
            <span className="cp-stopwords">
              {stops[here]!.events.map((event) => (
                <span key={`${event.source}-${event.recordId}-${event.seq ?? event.otherId ?? ''}`} className="cp-stopword">
                  {inspect ? `${event.what} · ${actorTypeWord(event.actorType).text} ${event.actorId}` : t('g7b.historyChange')}
                  {event.tied ? <span className="cp-tied" title={t('g7b.Evolution.two_things_were_recorded_in_this_second')}>{t('g7b.Evolution.order_not_recorded')}</span> : null}
                </span>
              ))}
            </span>
          )}
        </div>

        <CompositionLegend />

        {change === null ? null : (
          <div className="cp-change" data-px-change="composition">
            <span className="cp-counts num">
              {COMPOSITION_MARKS.filter((mark) => change.diff.counts[mark] > 0).map((mark) => (
                <span key={mark} className="cp-count">
                  <CompositionMarkChip mark={mark} /> {change.diff.counts[mark]}
                </span>
              ))}
              <span className="cp-count">{t('g7b.Evolution.unchanged', { n: change.diff.unchanged })}</span>
            </span>
            <ul className="cp-rows">
              {change.diff.changes
                .filter((row) => row.marks.length > 0)
                .map((row) => (
                  <li
                    key={row.recordId}
                    data-px-diffrow={row.recordId}
                    {...targetAttributes({ kind: 'record', recordId: row.recordId, workspaceId: reading.subject.workspaceId ?? '' })}
                  >
                    {row.marks.map((mark) => (
                      <CompositionMarkChip key={mark} mark={mark} />
                    ))}
                    <a href={`#${recordPath(row.recordId)}`} className="cp-name">
                      {nameOf(row.title, row.recordId)}
                    </a>
                    <OriginMark origin={row.origin} />
                  </li>
                ))}
            </ul>
          </div>
        )}

        {boundary.length === 0 ? null : (
          <div className="cp-boundary" data-px-boundary="three-things">
            <h4 data-title-is="label">{t('g7b.Evolution.the_boundary_moved')}</h4>
            <ul>
              {boundary.map((row) => (
                <li key={row.recordId}>
                  <span className="cp-name">{nameOf(row.title, row.recordId)}</span>
                  <span className="cp-was">{t('g7b.Evolution.was_in')}{' '}
                    {(row.before?.carriers ?? []).map((id) => moduleName(change?.carrierNames ?? {}, id)).join(', ') ||
                      <Absence />}
                  </span>
                  <span className="cp-arrow">→</span>
                  <span className="cp-is">{t('g7b.Evolution.now_in')}{' '}
                    {(row.after?.carriers ?? []).map((id) => moduleName(change?.carrierNames ?? {}, id)).join(', ') ||
                      <Absence />}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {composition.subject.unaccounted === null ? null : (
          // AN EMPTY LIST IS NOT AN ANSWER. Standing before the first recorded event, or before the
          // ledger reaches back, the honest reading is that nothing was recorded YET — which is a
          // different fact from "it was made of nothing", and the walk can reach both.
          <span className="cp-nothing" data-px-nothing={composition.subject.unaccounted}>
            <Absence tier="told-apart" looked word={UNACCOUNTED_WORDS[composition.subject.unaccounted]} title={UNACCOUNTED_REASONS[composition.subject.unaccounted]} />
          </span>
        )}

        {composition.members.length === 0 && composition.subject.unaccounted === null ? <Absence /> : null}
        <ul className="cp-members" data-px-members="composition">
          {composition.members.map((member) => (
            <li
              key={member.recordId}
              data-px-member={member.recordId}
              {...targetAttributes({ kind: 'record', recordId: member.recordId, workspaceId: reading.subject.workspaceId ?? '' })}
            >
              <span className="cp-pos num">{member.position === null ? '·' : member.position + 1}</span>
              <a href={`#${recordPath(member.recordId)}`} className="cp-name">
                {nameOf(member.title, member.recordId)}
              </a>
              <OriginMark origin={member.origin?.value ?? null} />
              {member.deletedThen ? <Tag title={t('g7b.Evolution.its_own_version_at_that_time_was')}>{t('g7b.Evolution.deleted_then')}</Tag> : null}
              {member.unaccounted === null ? null : <CompositionMarkChip mark="unaccounted" />}
              <span className="cp-from num" data-px-provenance={member.recordId}>
                {member.from.subject === null ? '' : t('g7b.Evolution.listed_by_version', { v1: member.from.subject.seq })}
                {member.from.subject === null ? '' : '\u00a0· '}
                {member.from.child === null
                  ? t('g7b.Evolution.no_version_of_its_own')
                  : inspect ? t('g7b.Evolution.its_version', { v1: member.from.child.seq, v2: member.from.child.at, v3: member.from.child.actorType, v4: member.from.child.actorId }) : t('g7b.historyVersion', { n: member.from.child.seq, when: member.from.child.at })}
                {member.from.link === null ? '' : t('g7b.Evolution.linked', { v1: member.from.link.at })}
              </span>
              <span className="cp-carriers">
                {member.carriers.length === 0
                  ? <Absence />
                  : t('g7b.Evolution.in', { v1: member.carriers.map((carrier) => moduleName(reading.carrierNames, carrier.moduleId)).join(t('record.links.listSeparator')) })}
              </span>
            </li>
          ))}
        </ul>

        {composition.unaccounted.length === 0 ? null : (
          <p className="cp-unaccounted num">{t('g7b.Evolution.unaccounted', { n: composition.unaccounted.length })}</p>
        )}

        {reading.lineage === null ? null : (
          <div className="cp-lineage" data-px-lineage={reading.lineage.ancestorId}>
            <span>{t('g7b.Evolution.created_from')}</span>
            <a href={`#${recordPath(reading.lineage.ancestorId)}`} className="cp-name">
              {reading.lineage.ancestorTitle}
            </a>
            <OriginMark origin={reading.lineage.ancestorOrigin} />
            <span className="cp-rev num">
              {reading.lineage.ancestorRevision === null
                ? t('g7b.Evolution.version_unknown')
                : t('g7b.Evolution.version_1730', { v1: reading.lineage.ancestorRevision.seq })}
            </span>
            <Tag title={t('g7b.Evolution.no_column_stores_the_version_a_descendant')}>{t('g7b.Evolution.worked_out_not_stored')}</Tag>
            <span className="cp-stamp num">{reading.lineage.at}</span>
          </div>
        )}

        {/* ONE PIPELINE AGAINST ANOTHER. Only a pipeline gets this, because the two sides are
            paired on each block's own name inside its pipeline and a module's members carry other
            pipelines' names in their titles. The route refuses a module by name; this is the same
            rule, applied so the control is not offered where it cannot answer. */}
        {reading.subject.kind === 'pipeline' ? (
          <CompareWithAnother recordId={reading.subject.id} workspaceId={reading.subject.workspaceId ?? ''} />
        ) : null}
      </Panel>
      </div>
    </>
  )
}

function stopAt(reading: CompositionReadingShape | null, order: number): string {
  return reading?.stops[order]?.at ?? ''
}

const COMPOSITION_CSS = `
.cp-head { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; margin-bottom: .5rem; }
.cp-subject { font-weight: 600; }
.cp-stamp, .cp-who, .cp-from, .cp-carriers { color: var(--text-3); font-size: .82rem; }
.cp-walk { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; margin: .35rem 0 .55rem; }
/* A REFUSED STEP SAYS WHY ON ITS OWN LINE, under the three steps and above the words about this
   stop, the same decision the drawing's own button row makes. As a flex item beside the button it
   split the steps, and at 390 it pushed Now onto a line of its own. */
.cp-walk > .px-why { order: 1; flex: 1 0 100%; }
.cp-walk > .cp-stopwords { order: 2; }
.cp-stopwords { display: flex; flex-wrap: wrap; gap: .4rem; }
.cp-stopword { font-size: .8rem; color: var(--text-3); }
.cp-tied { margin-left: .3rem; border-bottom: 1px dashed currentColor; }
.ev-marks { display: flex; flex-wrap: wrap; gap: .35rem; list-style: none; padding: 0; margin: .3rem 0 .6rem; }
.cp-change { margin: .3rem 0 .6rem; }
.cp-counts { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
.cp-count { display: inline-flex; align-items: center; gap: .25rem; }
.cp-rows, .cp-members, .cp-boundary ul { list-style: none; padding: 0; margin: .35rem 0 0; }
.cp-rows li, .cp-members li, .cp-boundary li { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; padding: .2rem 0; border-top: 1px solid var(--border); }
.cp-pos { min-width: 1.4rem; color: var(--text-3); }
.cp-name { font-weight: 500; }
.cp-boundary h4 { margin: .6rem 0 .2rem; font-size: .9rem; }
.cp-lineage { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; margin-top: .6rem; padding-top: .4rem; border-top: 1px solid var(--border); }
.cp-nothing { color: var(--text-3); font-size: .85rem; margin: .4rem 0; }
.cp-unaccounted { color: var(--text-3); font-size: .82rem; margin: .35rem 0 0; }
@container panel (max-width: 30rem) {
  .cp-members li, .cp-rows li { align-items: flex-start; }
}
`
