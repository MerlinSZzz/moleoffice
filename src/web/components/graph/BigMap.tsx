// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BIG MAP OF A PROJECT'S ARCHITECTURE.
 *
 * Drawn on the master pipeline's own page, from the reading in src/shared/big-map-reading.ts: one box for each step of
 * each block pipeline, in the row or side column its `tier` names, with the block it belongs to beside its name.
 * Pressing a box opens its block pipeline. A `feeds` link between two boxes is a line, labelled with what the link
 * says it carries. A step with no tier is listed under "Not placed on the map", never drawn in a guessed row.
 *
 * THE ENDS OUTSIDE MOLE OFFICE are drawn dashed and labelled, as the design picture M1 draws them, and they are not
 * records. Nothing stored can end a line at one, so no line is
 * drawn to one. The list below is the five the design picture M1 drew.
 *
 * NO SMALL PRINT: no footnote and no notes list. What the map needs explained is said
 * in the master pipeline's own body text, at the foot of the page.
 *
 * LINES ARE MEASURED AFTER LAYOUT. The boxes are laid out by the page's grid, and the lines are drawn over them from
 * where the boxes landed, again whenever the map changes size. On a narrow screen the grid is one column, where a line
 * would run over every box between its ends, so each box lists its lines in words instead.
 */
import { useLayoutEffect, useRef, useState } from 'react'

import { MAP_SIDE_COLUMNS, MAP_TIERS, type MapTier } from '@shared/big-map.ts'
import type { MapBox, MapLine, TheBigMap } from '@shared/big-map-reading.ts'
import { carriesOf } from '@shared/blocks.ts'
import { t, type WordKey } from '@shared/i18n.ts'
import { linkWord } from '@shared/words.ts'
import { useMode } from '../../lib/mode.ts'
import { carriedWords, plural } from '../PipelineFlow.tsx'
import { pipelinePath, RouteLink } from '../router.tsx'
import { LINE_WEIGHT } from './lines.ts'

/** The ends outside Mole Office, as M1 drew them: above the map, and to the right of the agents' runtime. */
const OUTSIDE_ENDS = {
  above: ['bigMap.outside.person', 'bigMap.outside.workers'],
  right: ['bigMap.outside.docker', 'bigMap.outside.git', 'bigMap.outside.models'],
} as const

/** Below this width the map is one column and lists each box's lines in words. */
const WIDE_FROM_PX = 900

const ROWS = MAP_TIERS.filter((tier) => !MAP_SIDE_COLUMNS.includes(tier))
const [LEFT, RIGHT] = MAP_SIDE_COLUMNS as [MapTier, MapTier]

/** One of a box's lines, from the box's end. */
interface BoxLine {
  line: MapLine
  direction: 'forward' | 'reverse'
  other: MapBox
}

/** One drawn line: its path, and where its words go. */
interface DrawnLine {
  id: string
  d: string
  words: string | null
  x: number
  y: number
  /** Where the words hang from their point: centred on a level stretch, or just right of a straight line down. */
  anchor: 'start' | 'middle'
}

export function BigMap({ map }: { map: TheBigMap }) {
  const mode = useMode()
  const frame = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState(true)
  const [drawn, setDrawn] = useState<DrawnLine[]>([])
  const boxes = new Map(map.boxes.map((box) => [box.id, box]))
  const wordsOf = (carries: string | null | undefined) => carriedWords(carriesOf(carries))

  useLayoutEffect(() => {
    const element = frame.current
    if (element === null) return
    const measure = () => {
      const isWide = element.clientWidth >= WIDE_FROM_PX
      setWide(isWide)
      if (!isWide) {
        setDrawn([])
        return
      }
      const origin = element.getBoundingClientRect()
      const rectOf = (id: string) => element.querySelector(`[data-box="${CSS.escape(id)}"]`)?.getBoundingClientRect()
      const lines: DrawnLine[] = []
      for (const line of map.lines) {
        const from = rectOf(line.fromId)
        const to = rectOf(line.toId)
        if (from === undefined || to === undefined) continue
        lines.push({ id: line.id, ...route(from, to, origin), words: wordsOf(line.carries) })
      }
      setDrawn(lines)
    }
    measure()
    const watcher = new ResizeObserver(measure)
    watcher.observe(element)
    return () => watcher.disconnect()
  }, [map])

  const placed = (tier: MapTier) => map.boxes.filter((box) => box.tier === tier)
  const notPlaced = map.boxes.filter((box) => box.tier === null)
  const linesOf = (box: MapBox) =>
    map.lines.flatMap((line): BoxLine[] => {
      if (line.fromId === box.id) return [{ line, direction: 'forward', other: boxes.get(line.toId)! }]
      if (line.toId === box.id) return [{ line, direction: 'reverse', other: boxes.get(line.fromId)! }]
      return []
    })

  const drawBox = (box: MapBox) => (
    <li key={box.id} className="bm-box" data-box={box.id} data-block-pipeline={box.pipeline.id}>
      <RouteLink to={pipelinePath(box.pipeline.id)} className="bm-box-name wrap-anywhere">
        {box.name}
      </RouteLink>
      <span className="bm-place" title={map.blocks[box.block]?.title}>
        {t('bigMap.place', { n: box.block })}
      </span>
      {wide ? null : (
        <ul className="bm-box-lines">
          {linesOf(box).map(({ line, direction, other }) => {
            const words = wordsOf(line.carries)
            return (
              <li key={`${line.id}-${direction}`} data-map-line={line.id} data-direction={direction}>
                {linkWord('feeds', direction, mode).text} {other.name}
                {words === null ? null : `: ${words}`}
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
  const tierPart = (tier: MapTier) => (
    <section key={tier} className="bm-tier" data-tier={tier}>
      <h4 className="bm-tier-name">{t(`bigMap.tier.${tier}`)}</h4>
      <ul className="bm-boxes">{placed(tier).map(drawBox)}</ul>
    </section>
  )
  const outside = (keys: readonly WordKey[], where: string) => (
    <ul className="bm-outside" data-outside={where}>
      {keys.map((key) => (
        <li key={key} className="bm-outside-end">{t(key)}</li>
      ))}
    </ul>
  )

  return (
    <section className="bm" data-big-map="">
      <style href="mole-office-big-map" precedence="default">
        {BIG_MAP_CSS}
      </style>
      <h3 className="bm-heading">{t('bigMap.heading')}</h3>
      {map.boxes.length === 0 ? <p className="bm-none">{t('absence.none')}</p> : null}
      <div ref={frame} className="bm-frame" data-wide={wide ? '1' : '0'}>
        {wide ? (
          <svg className="bm-lines" aria-hidden="true">
            <defs>
              <marker id="bm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M0,0 L8,4 L0,8 z" className="bm-arrow" />
              </marker>
            </defs>
            {drawn.map((line) => (
              <g key={line.id} data-map-line={line.id}>
                <path d={line.d} className="bm-line" strokeWidth={LINE_WEIGHT.plain} markerEnd="url(#bm-arrow)" />
                {line.words === null ? null : (
                  <text x={line.x} y={line.y} className="bm-line-words" textAnchor={line.anchor} dominantBaseline="middle">
                    {line.words}
                  </text>
                )}
              </g>
            ))}
          </svg>
        ) : null}
        <div className="bm-above">{outside(OUTSIDE_ENDS.above, 'above')}</div>
        <div className="bm-left">{tierPart(LEFT)}</div>
        <div className="bm-rows">{ROWS.map(tierPart)}</div>
        <div className="bm-right">
          {tierPart(RIGHT)}
          {outside(OUTSIDE_ENDS.right, 'right')}
        </div>
      </div>

      {notPlaced.length === 0 ? null : (
        <section className="bm-not-placed">
          <h4 className="bm-tier-name">{t('bigMap.notPlaced')}</h4>
          <ul className="bm-boxes">{notPlaced.map(drawBox)}</ul>
        </section>
      )}

      <BigMapBlocks map={map} />
    </section>
  )
}

/**
 * THE LIST OF BLOCKS ("The N blocks"), ON ITS OWN. The big map draws it under its boxes, and a page that draws the
 * master's boxes some other way draws it alone, with the same words. It brings the map's styles itself, so it is laid
 * out the same either way; where the map is drawn too, React keeps one copy of them.
 *
 * A BOX WITH NO TIER is off the big map, which lists it apart, so the list counts it as not on the map. A page that
 * draws every box, tier or none, as the master's lanes do, passes `everyBoxDrawn`: there no box is off the drawing, so
 * the list counts them all and says nothing about the map.
 */
export function BigMapBlocks({ map, everyBoxDrawn = false }: { map: TheBigMap; everyBoxDrawn?: boolean }) {
  return (
    <>
      <style href="mole-office-big-map" precedence="default">
        {BIG_MAP_CSS}
      </style>
      <section className="bm-blocks">
        <h4 className="bm-tier-name">{t('bigMap.blocks', { n: map.blocks.length })}</h4>
        <ul className="bm-block-list">
          {map.blocks.map((block) => {
            const own = map.boxes.filter((box) => box.block === block.place)
            const off = everyBoxDrawn ? 0 : own.filter((box) => box.tier === null).length
            return (
              <li key={block.id} data-map-block={block.id}>
                <span className="bm-place">{t('bigMap.place', { n: block.place })}</span>{' '}
                {block.pipelines.length === 0 ? (
                  <span className="wrap-anywhere">{block.title}</span>
                ) : (
                  block.pipelines.map((pipeline, at) => (
                    <span key={pipeline.id}>
                      {at === 0 ? null : ', '}
                      <RouteLink to={pipelinePath(pipeline.id)} className="wrap-anywhere">
                        {pipeline.title}
                      </RouteLink>
                    </span>
                  ))
                )}
                {': '}
                {block.pipelines.length === 0
                  ? t('bigMap.block.noPipeline')
                  : plural(own.length - off, t('bigMap.block.box'), t('bigMap.block.boxes')) +
                    (off === 0 ? '' : t('bigMap.block.andNotPlaced', { n: off }))}
              </li>
            )
          })}
        </ul>
      </section>
    </>
  )
}

/**
 * ONE LINE FROM BOX TO BOX, ORTHOGONAL, as the pipeline's own lines are. Between rows it leaves the bottom of the upper
 * box and enters the top of the lower one; between boxes side by side it leaves one side and enters the other. Its
 * words sit at the middle of its middle stretch. A line straight down has no level stretch, so its words stand just to
 * its right rather than on it.
 */
function route(from: DOMRect, to: DOMRect, origin: DOMRect): { d: string; x: number; y: number; anchor: 'start' | 'middle' } {
  const at = (rect: DOMRect) => ({
    left: rect.left - origin.left,
    right: rect.right - origin.left,
    top: rect.top - origin.top,
    bottom: rect.bottom - origin.top,
    cx: rect.left - origin.left + rect.width / 2,
    cy: rect.top - origin.top + rect.height / 2,
  })
  const a = at(from)
  const b = at(to)
  if (b.top >= a.bottom || a.top >= b.bottom) {
    const down = b.top >= a.bottom
    const sy = down ? a.bottom : a.top
    const ey = down ? b.top : b.bottom
    const mid = (sy + ey) / 2
    if (Math.abs(a.cx - b.cx) < 1) return { d: `M${a.cx},${sy} V${ey}`, x: a.cx + 6, y: mid, anchor: 'start' }
    return { d: `M${a.cx},${sy} V${mid} H${b.cx} V${ey}`, x: (a.cx + b.cx) / 2, y: mid, anchor: 'middle' }
  }
  const right = b.left >= a.cx
  const sx = right ? a.right : a.left
  const ex = right ? b.left : b.right
  const mid = (sx + ex) / 2
  return { d: `M${sx},${a.cy} H${mid} V${b.cy} H${ex}`, x: mid, y: (a.cy + b.cy) / 2 - 8, anchor: 'middle' }
}

const BIG_MAP_CSS = `
.bm { display: flex; flex-direction: column; gap: var(--pad); margin: var(--pad-lg) 0; }
.bm-heading { margin: 0; font-size: var(--fs-3); }
.bm-none { margin: 0; color: var(--text-2); }
.bm-frame { position: relative; display: grid; gap: var(--pad-lg); }
.bm-frame[data-wide='1'] {
  grid-template-columns: minmax(0, 1fr) minmax(0, 3fr) minmax(0, 1fr);
  grid-template-areas: 'above above above' 'left rows right';
}
.bm-above { grid-area: above; }
.bm-left { grid-area: left; }
.bm-rows { grid-area: rows; display: flex; flex-direction: column; gap: var(--pad-lg); }
.bm-right { grid-area: right; display: flex; flex-direction: column; gap: var(--pad-lg); }
.bm-frame[data-wide='0'] { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'above' 'left' 'rows' 'right'; }
.bm-lines { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.bm-line { fill: none; stroke: var(--text-2); }
.bm-arrow { fill: var(--text-2); }
.bm-line-words { font-size: var(--fs-1); fill: var(--text); paint-order: stroke; stroke: var(--bg); stroke-width: 4px; }
.bm-tier { display: flex; flex-direction: column; gap: calc(var(--pad) / 2); }
.bm-tier-name { margin: 0; font-size: var(--fs-1); color: var(--text-2); text-transform: uppercase; letter-spacing: 0.06em; }
.bm-boxes, .bm-outside, .bm-block-list, .bm-box-lines { list-style: none; margin: 0; padding: 0; }
.bm-boxes { display: flex; flex-wrap: wrap; gap: var(--pad); }
.bm-left .bm-boxes, .bm-right .bm-boxes { flex-direction: column; }
.bm-box {
  position: relative; display: flex; flex-direction: column; gap: 4px; min-width: 9rem; flex: 1 1 9rem;
  padding: var(--pad); background: var(--panel); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
}
.bm-box-name { font-weight: 600; overflow-wrap: anywhere; }
.bm-place { align-self: flex-start; font-family: var(--font-mono); font-size: var(--fs-1); padding: 0 4px; border: var(--border-w) solid var(--border); border-radius: var(--radius-sm); }
.bm-box-lines { font-size: var(--fs-1); color: var(--text-2); overflow-wrap: anywhere; }
.bm-outside { display: flex; flex-wrap: wrap; gap: var(--pad); justify-content: center; }
.bm-right .bm-outside { flex-direction: column; }
.bm-outside-end { padding: calc(var(--pad) / 2) var(--pad); border: var(--border-w) dashed var(--border-strong); border-radius: var(--radius-sm); color: var(--text-2); font-size: var(--fs-1); text-align: center; }
.bm-not-placed { display: flex; flex-direction: column; gap: calc(var(--pad) / 2); }
.bm-blocks { display: flex; flex-direction: column; gap: calc(var(--pad) / 2); }
.bm-block-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr)); gap: 4px var(--pad-lg); overflow-wrap: anywhere; }
`
