// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME'S PARTS, IN THE LAYOUT ITS PERSON KEPT. The parts are the key items, Needs you, Agents at work, Schedule and
 * the figures. src/shared/home-layout.ts says where each part may go and how a move changes the layout. This file draws
 * the places, lets the person drag a part by its handle or move it from its small menu, hide it, show a hidden part
 * again, and choose every project or one, and keeps each of these through the door in src/server/api/home-layout.ts.
 * A hidden part is not drawn, so what it reads is not asked.
 *
 * WHILE A PART IS DRAGGED, every place can take it. An empty place draws a room for it, and the place under the
 * pointer draws a mark where the part would go. The drop keeps exactly what the mark showed. A part moved from
 * the menu goes last in its new place, and the menu of the moved part keeps the focus.
 *
 * A MOVE IS DRAWN AT ONCE and kept behind it. When the office refuses it or cannot be reached, Home draws the
 * layout last kept again, and says the move was not kept.
 *
 * THE KEPT LAYOUT IS READ ONCE IN A PAGE LOAD and held, as Home's other reads are, so Home opened again draws the
 * layout it holds at once, with no loading line. A kept move reads it again (src/web/lib/home-layout.ts).
 */
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import type { ProjectChoice } from '@shared/across-projects.ts'
import {
  HOME_DRAWN_PLACES, HOME_LAYOUT_A, applyMenuMove, chooseTheProject, menuMovesFor, movePart,
  type HomeDrawnPlace, type HomeLayout, type HomeMenuMove, type HomePart,
} from '@shared/home-layout.ts'
import { t, type WordKey } from '@shared/i18n.ts'
import { errorMessage, faultOf, type Fault } from '../../api.ts'
import { keepTheHomeLayout, readTheHomeLayoutOnce } from '../../lib/home-layout.ts'
import { useSharedRead } from '../../lib/homereads.ts'
import { ProjectChoiceControl } from '../ProjectChoice.tsx'
import { SideBySide } from '../SideBySide.tsx'
import { ErrorNote, Loading } from '../ui.tsx'
import { FIGURE_NAMES } from './HomeFigures.tsx'

/** Where a dragged part would go: a place, and its position among that place's other parts. */
interface DropAt { place: HomeDrawnPlace; position: number }
interface Dragging { part: HomePart; at: DropAt | null }

/** Each part's name, as its heading says it. */
export const PART_NAMES: Record<HomePart, WordKey> = {
  keyItems: 'home.keyItems.title', needs: 'home.needsYou', agents: 'home.agentsAtWork', schedule: 'home.schedule', ...FIGURE_NAMES,
}
const ROOM_WORDS = { band: 'home.layout.room.band', first: 'home.layout.room.first', second: 'home.layout.room.second' } as const
const MOVE_WORDS = {
  up: 'home.layout.up', down: 'home.layout.down', band: 'home.layout.toBand', first: 'home.layout.toFirst', second: 'home.layout.toSecond',
  hidden: 'home.layout.hide',
} as const satisfies Record<HomeMenuMove, string>
/** The words that show a hidden part again in one of the drawn places. */
const SHOW_WORDS = { band: 'home.layout.showInBand', first: 'home.layout.showInFirst', second: 'home.layout.showInSecond' } as const satisfies Record<HomeDrawnPlace, string>

/** A pointer has to travel this far, in pixels, before a press on the handle becomes a drag. */
const DRAG_AFTER = 4

export function HomeParts({ contents, titles, onProject }: {
  /** What each part draws, for the projects the layout shows. A hidden part's is never drawn. */
  contents: (project: ProjectChoice) => Record<HomePart, ReactNode>
  /** Every project's title by its id, for the choice of project. */
  titles: ReadonlyMap<string, string>
  /** Told the projects the layout shows, each time they change, for what Home draws outside its parts. */
  onProject?: (project: ProjectChoice) => void
}) {
  const [reading, readAgain] = useSharedRead(readTheHomeLayoutOnce, [], { startFromHeld: true })
  /** The layout after the person's last move, drawn before the office answers. */
  const [moved, setMoved] = useState<HomeLayout | null>(null)
  /** True once a move was kept: the note about the layout read at the start no longer holds. */
  const [keptSince, setKeptSince] = useState(false)
  const [notKept, setNotKept] = useState<{ message: string; fault: Fault | null } | null>(null)
  const [dragging, setDragging] = useState<Dragging | null>(null)
  const places = useRef<Record<HomeDrawnPlace, HTMLDivElement | null>>({ band: null, first: null, second: null })
  const menus = useRef(new Map<HomePart, HTMLElement>())
  const focusAfter = useRef<HomePart | null>(null)
  const saves = useRef(0)
  /** The layout the office last said it keeps, which a refused move falls back to. */
  const lastKept = useRef<HomeLayout | null>(null)
  const stopDragging = useRef<(() => void) | null>(null)

  const read = reading.status === 'ready' ? reading.value : null
  const layout = moved ?? read?.layout ?? HOME_LAYOUT_A
  const shown = useRef(layout)
  useLayoutEffect(() => { shown.current = layout })
  useEffect(() => {
    const part = focusAfter.current
    if (part === null) return
    focusAfter.current = null
    menus.current.get(part)?.focus()
  })
  useEffect(() => () => stopDragging.current?.(), [])
  useEffect(() => { onProject?.(layout.project) }, [layout.project, onProject])

  function keep(next: HomeLayout) {
    if (JSON.stringify(next) === JSON.stringify(shown.current)) return
    const save = ++saves.current
    setMoved(next)
    setNotKept(null)
    keepTheHomeLayout(next).then(
      (answer) => {
        lastKept.current = answer.layout
        setKeptSince(true)
      },
      (err: unknown) => {
        if (save !== saves.current) return
        setMoved(lastKept.current ?? read?.layout ?? HOME_LAYOUT_A)
        setNotKept({ message: errorMessage(err), fault: faultOf(err) })
      },
    )
  }

  /** The place under the pointer, and how many of its other parts stand above the pointer. */
  function dropAt(x: number, y: number, part: HomePart): DropAt | null {
    for (const place of HOME_DRAWN_PLACES) {
      const element = places.current[place]
      if (element === null) continue
      const box = element.getBoundingClientRect()
      if (box.width === 0 || box.height === 0 || x < box.left || x > box.right || y < box.top || y > box.bottom) continue
      const others = [...element.querySelectorAll<HTMLElement>(':scope > [data-home-part]')].filter(one => one.dataset.homePart !== part)
      const above = others.filter((one) => { const own = one.getBoundingClientRect(); return own.top + own.height / 2 < y })
      return { place, position: above.length }
    }
    return null
  }

  function startDragging(part: HomePart, down: ReactPointerEvent<HTMLElement>) {
    if (down.button !== 0 || stopDragging.current !== null) return
    down.preventDefault()
    const pointer = down.pointerId
    const fromX = down.clientX, fromY = down.clientY
    let started = false
    let at: DropAt | null = null
    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return
      if (!started) {
        if (Math.hypot(event.clientX - fromX, event.clientY - fromY) < DRAG_AFTER) return
        started = true
        // The rooms of the empty places are drawn before the pointer is placed, so a room can be under it.
        flushSync(() => { setDragging({ part, at: null }) })
      }
      const next = dropAt(event.clientX, event.clientY, part)
      if (next?.place === at?.place && next?.position === at?.position) return
      at = next
      flushSync(() => { setDragging({ part, at: next }) })
    }
    const finish = (drop: boolean) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      stopDragging.current = null
      if (!started) return
      setDragging(null)
      if (drop && at !== null) keep(movePart(shown.current, part, at.place, at.position))
    }
    const onUp = (event: PointerEvent) => { if (event.pointerId === pointer) finish(true) }
    const onCancel = (event: PointerEvent) => { if (event.pointerId === pointer) finish(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') finish(false) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
    stopDragging.current = () => finish(false)
  }

  function moveFromTheMenu(part: HomePart, move: HomeMenuMove, menu: HTMLDetailsElement | null) {
    if (menu !== null) menu.open = false
    focusAfter.current = part
    keep(applyMenuMove(shown.current, part, move))
  }

  if (reading.status === 'loading') return <Loading label={t('home.layout.reading')} rows={3} />

  const kept = keptSince ? 'kept' : reading.status === 'error' ? 'not-read' : reading.value.kept
  const note = notKept !== null
    ? <div className="hm-layout-state" data-home-layout-note><ErrorNote label={t('home.layout.moveNotKept')} message={notKept.message} fault={notKept.fault} /></div>
    : keptSince ? null
    : reading.status === 'error'
      ? <div className="hm-layout-state" data-home-layout-note><ErrorNote label={t('home.layout.keptNotRead')} message={reading.message} fault={reading.fault ?? null} retry={readAgain} /></div>
      : reading.value.kept === 'unreadable' ? <p className="hm-layout-state" data-home-layout-note>{t('home.layout.keptNotRead')}</p> : null

  const drawnContents = contents(layout.project)

  function drawPart(part: HomePart): ReactNode {
    const name = t(PART_NAMES[part])
    return (
      <div key={part} className="hm-part" data-home-part={part} data-dragged={dragging?.part === part ? true : undefined}>
        <div className="hm-part-bar">
          <span
            className="hm-part-handle"
            data-home-drag
            aria-hidden="true"
            title={t('home.layout.drag', { part: name })}
            onPointerDown={(event) => { startDragging(part, event) }}
          />
          <details className="hm-move" onKeyDown={(event) => {
            if (event.key !== 'Escape' || !event.currentTarget.open) return
            event.currentTarget.open = false
            menus.current.get(part)?.focus()
          }}>
            <summary
              className="hm-move-open"
              data-home-move-menu
              aria-label={t('home.layout.moveThePart', { part: name })}
              ref={(element) => { if (element === null) menus.current.delete(part); else menus.current.set(part, element) }}
            >{t('home.layout.move')}</summary>
            <div className="hm-move-list" role="group" aria-label={t('home.layout.moveThePart', { part: name })}>
              {menuMovesFor(layout, part).map(move => (
                <button
                  key={move}
                  type="button"
                  className="hm-move-button"
                  data-home-move={move}
                  onClick={(event) => { moveFromTheMenu(part, move, event.currentTarget.closest('details')) }}
                >{t(MOVE_WORDS[move])}</button>
              ))}
            </div>
          </details>
        </div>
        <div className="hm-part-body">{drawnContents[part]}</div>
      </div>
    )
  }

  /** A place's parts in order, with the mark where a dragged part would go, or a room when the place is empty. */
  function drawPlace(place: HomeDrawnPlace): ReactNode[] {
    const parts = layout[place]
    const others = parts.filter(part => part !== dragging?.part)
    const markAt = dragging?.at?.place === place ? dragging.at.position : null
    const mark = dragging === null ? null : <div key="mark" className="hm-drop-mark" data-home-drop-mark>{t('home.layout.goesHere', { part: t(PART_NAMES[dragging.part]) })}</div>
    const drawn: ReactNode[] = []
    let index = 0
    for (const part of parts) {
      if (part !== dragging?.part) {
        if (markAt === index) drawn.push(mark)
        index += 1
      }
      drawn.push(drawPart(part))
    }
    if (markAt !== null && markAt >= others.length) drawn.push(mark)
    else if (dragging !== null && markAt === null && others.length === 0) drawn.push(<div key="room" className="hm-room">{t(ROOM_WORDS[place])}</div>)
    return drawn
  }

  const placeRef = (place: HomeDrawnPlace) => (element: HTMLDivElement | null) => { places.current[place] = element }
  return (
    <div className="hm-layout" data-home-layout data-home-layout-kept={kept} data-home-project={layout.project} data-dragging={dragging === null ? undefined : true}>
      <style href="mole-office-home-layout" precedence="default">{HOME_LAYOUT_CSS}</style>
      {note}
      <div className="hm-project-choice" data-home-project-choice>
        <ProjectChoiceControl choice={layout.project} titles={titles} onChoose={(choice) => { keep(chooseTheProject(shown.current, choice)) }} />
      </div>
      <div className="hm-band" data-home-place="band" ref={placeRef('band')}>{drawPlace('band')}</div>
      <SideBySide className="hm-board" data-home-grid>
        <div className="hm-main-column" data-column="start" data-home-place="first" ref={placeRef('first')}>{drawPlace('first')}</div>
        <div className="hm-side-column" data-column="end" data-home-place="second" ref={placeRef('second')}>{drawPlace('second')}</div>
      </SideBySide>
      {/* THE HIDDEN PARTS, by name only, each with the presses that show it again. Nothing of theirs is read. */}
      {layout.hidden.length === 0 ? null : (
        <section className="hm-hidden" data-home-place="hidden" aria-label={t('home.layout.hiddenParts')}>
          <h2 className="hm-hidden-title">{t('home.layout.hiddenParts')}</h2>
          <ul className="hm-hidden-list">
            {layout.hidden.map(part => (
              <li key={part} className="hm-hidden-part" data-home-hidden-part={part}>
                <span className="hm-hidden-name">{t(PART_NAMES[part])}</span>
                {HOME_DRAWN_PLACES.map(place => (
                  <button
                    key={place}
                    type="button"
                    className="hm-move-button hm-show-button"
                    data-home-show={place}
                    onClick={() => { keep(applyMenuMove(shown.current, part, place)) }}
                  >{t(SHOW_WORDS[place])}</button>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

// The band and the columns take no space when empty: SideBySide hides an empty column, and the band hides itself.
const HOME_LAYOUT_CSS = `
.hm-layout { display: grid; gap: var(--pad-lg); min-width: 0; }
.hm-layout[data-dragging], .hm-layout[data-dragging] * { cursor: grabbing; user-select: none; }
.hm-layout-state { margin: 0; color: var(--text-2); font: var(--fs-2)/var(--lh-body) var(--font-ui); }
.hm-band { display: grid; gap: var(--pad-lg); min-width: 0; }
/* THE TWO COLUMNS FOLLOW THE PRODUCT'S ONE WIDTH RULE, components/SideBySide.tsx: side by side on a wide screen,
   five to three, when both hold a part. */
.hm-board { --sbs-columns: minmax(0, 5fr) minmax(0, 3fr); gap: var(--pad-lg); }
.hm-main-column, .hm-side-column { display: grid; align-content: start; gap: var(--pad-lg); min-width: 0; }
.hm-band:empty { display: none; }
.hm-part { display: grid; gap: var(--gut); min-width: 0; transition: opacity var(--move); }
.hm-part[data-dragged] { opacity: .45; }
.hm-part-body { display: grid; gap: var(--pad-lg); min-width: 0; }
.hm-part-bar { display: flex; align-items: center; justify-content: flex-end; gap: var(--gut); min-height: 1.75rem; }
.hm-part-handle { flex: none; box-sizing: border-box; width: 1.75rem; height: 1.75rem; padding: 5px 8px; border-radius: var(--radius); color: var(--text-3); cursor: grab; touch-action: none; background-image: radial-gradient(circle, currentColor 1.25px, transparent 1.6px); background-size: 6px 6px; background-origin: content-box; background-clip: content-box; }
.hm-part-handle:hover { color: var(--text); }
.hm-move { position: relative; }
.hm-move-open { display: block; padding: 2px var(--gut); border-radius: var(--radius); color: var(--text-3); font: var(--fs-1)/var(--lh-tight) var(--font-ui); list-style: none; cursor: pointer; }
.hm-move-open::-webkit-details-marker { display: none; }
.hm-move-open:hover, .hm-move[open] > .hm-move-open { background: var(--hover); color: var(--text); }
.hm-move-list { position: absolute; z-index: 5; top: calc(100% + 4px); right: 0; display: grid; min-width: 13rem; padding: 4px; border: var(--border-w) solid var(--border-strong); border-radius: var(--radius); background: var(--panel); box-shadow: var(--elev-2); }
.hm-move-button { display: block; width: 100%; padding: var(--gut) var(--pad); border: 0; border-radius: var(--radius); background: none; color: var(--text); font: var(--fs-2)/var(--lh-tight) var(--font-ui); text-align: left; cursor: pointer; }
.hm-move-button:hover, .hm-move-button:focus-visible { background: var(--hover); }
.hm-room, .hm-drop-mark { display: grid; place-items: center; min-height: 3rem; padding: var(--gut); border: var(--border-w) dashed var(--border-strong); border-radius: var(--radius); color: var(--text-3); font: var(--fs-2)/var(--lh-body) var(--font-ui); text-align: center; }
.hm-drop-mark { border: var(--focus-w) solid var(--accent); background: var(--accent-soft); color: var(--accent); }
.hm-project-choice { display: flex; justify-content: flex-end; min-width: 0; }
.hm-hidden { display: grid; gap: var(--gut); min-width: 0; padding-top: var(--gut); border-top: var(--border-w) solid var(--border-strong); }
.hm-hidden-title { margin: 0; color: var(--text-2); font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui); }
.hm-hidden-list { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.hm-hidden-part { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gut); min-width: 0; }
.hm-hidden-name { flex: 1 1 12rem; color: var(--text-2); font: var(--fs-2)/var(--lh-body) var(--font-ui); }
.hm-show-button { display: inline-block; width: auto; color: var(--accent); }
`
