// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NEW OFFICE'S FIRST ENTRY (wave 13y round 138, item 74 part b).
 *
 * While the getting-started item the office filed for its person is new (GET /api/getting-started says `shows`), one
 * layer greys the whole office and takes every press, except in the gap of one step:
 *
 *   1. the chat's way in — the sidebar's Chat row at 1024 pixels and wider, the top bar's chat press
 *      below it — with words saying this is the chat and no buttons need pressing, and Next; once the
 *      chat opens, the split it opens is in the gap too;
 *   2. after Next, the checklist press at the top right, which glows and pulses (steady when the reader asks for less
 *      motion). The gap grows to hold the checklist when it opens.
 *
 * A press on a link to the report inside the open checklist goes to the report and ends the first entry for good: the
 * office writes down that the person opened it (POST /api/getting-started/opened), and the layer is gone. Where that
 * write fails, the layer goes for this page only and the page says the steps will show again.
 *
 * THE KEYBOARD STAYS IN THE GAP AND THE WORDS. Tab moves between what can be pressed there, and focus that lands
 * anywhere else is put back.
 *
 * A BROWSER WHERE THE CHECKLIST IS SWITCHED OFF is not trapped: step two switches it on and says so, since the switch
 * may be left from an older office at the same address.
 *
 * THE GAP IS EACH PLACE OF THE STEP LEFT OPEN ALONE: the press, and the panel it opens. The grey is the rectangles of
 * the window around them, so a press in a place reaches what is under it, and a press between them lands on the grey;
 * a phone's open checklist is as wide as the window, and one rectangle around both would leave the Menu button open.
 * The places are measured again on every frame, so the gap follows the chat's way in and the open chat as they open,
 * close and move. The mark that glows is on the step's press.
 */
import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { TheFirstEntry } from '@shared/getting-started.ts'
import { t } from '@shared/i18n.ts'
import { targetAttributes } from '@shared/targets.ts'
import { api, errorMessage } from '../api.ts'
import { checklistsWindowIsOn, switchTheChecklistsWindow } from '../components/ChecklistParts.tsx'
import { recordPath } from '../components/router.tsx'

type Step = 'chat' | 'checklist'

/**
 * The sidebar's Chat row, by the surface it declares, so the selector cannot name a row nobody draws.
 * It is found as a target, the way the shortcut keys find it: only the sidebar draws the name.
 */
function theChatRow(): string {
  const [name, value] = Object.entries(targetAttributes({ kind: 'uiSurface', surfaceId: 'rail.chat' }))[0]!
  return `[${name}="${value}"]`
}

/** What each step leaves open, each place alone: the press first, which the mark is on, then the panel it opens. */
const THE_GAP: Record<Step, readonly string[]> = {
  chat: [theChatRow(), '.shell-chat-phone', '.px-chat[data-where="split"]'],
  checklist: ['.ckw-press', '.ckw-panel'],
}

/** Room around the gap, so the glow does not sit on what it shows. */
const ROOM = 6
/** The words' distance from the gap and from the window's edges. */
const MARGIN = 12

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

interface Layout {
  /** The window's size, since the grey is drawn in its pixels. */
  across: number
  down: number
  /** Each place left open, with room around it, and the box that holds them all. */
  places: Box[]
  gap: Box | null
  words: { left: number; top: number }
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

function thePlacesOf(step: Step): Box[] {
  return THE_GAP[step]
    .flatMap((selector) => [...document.querySelectorAll(selector)])
    // A HIDDEN ELEMENT IS NO PLACE: below 1024 pixels the sidebar's Chat row is in the closed drawer,
    // and at 1024 and wider the phone's chat press is hidden. Either would otherwise count by its box.
    .filter((el) => el.checkVisibility())
    .map((el) => el.getBoundingClientRect())
    .filter((box) => box.width > 0 && box.height > 0)
    .map((box) => ({
      left: Math.max(0, box.left - ROOM),
      top: Math.max(0, box.top - ROOM),
      right: Math.min(window.innerWidth, box.right + ROOM),
      bottom: Math.min(window.innerHeight, box.bottom + ROOM),
    }))
}

function theBoxHolding(places: readonly Box[]): Box | null {
  if (places.length === 0) return null
  return {
    left: Math.min(...places.map((box) => box.left)),
    top: Math.min(...places.map((box) => box.top)),
    right: Math.max(...places.map((box) => box.right)),
    bottom: Math.max(...places.map((box) => box.bottom)),
  }
}

/**
 * THE GREY: the window less the places, as rectangles. The places' edges cut the window into a grid; every cell whose
 * middle is in no place is grey, and the grey cells of one row that touch are drawn as one.
 */
function theGreyAround(places: readonly Box[], across: number, down: number): Box[] {
  const edges = (all: number[]): number[] => [...new Set(all)].sort((a, b) => a - b)
  const xs = edges([0, across, ...places.flatMap((box) => [box.left, box.right])])
  const ys = edges([0, down, ...places.flatMap((box) => [box.top, box.bottom])])
  const grey: Box[] = []
  for (let row = 0; row + 1 < ys.length; row++) {
    let run = null as Box | null
    for (let column = 0; column + 1 < xs.length; column++) {
      const cell = { left: xs[column]!, top: ys[row]!, right: xs[column + 1]!, bottom: ys[row + 1]! }
      const x = (cell.left + cell.right) / 2
      const y = (cell.top + cell.bottom) / 2
      if (places.some((box) => x > box.left && x < box.right && y > box.top && y < box.bottom)) {
        if (run !== null) grey.push(run)
        run = null
      } else run = run === null ? cell : { ...run, right: cell.right }
    }
    if (run !== null) grey.push(run)
  }
  return grey
}

/** A box as a style, in the window's pixels or in those of the box it is drawn inside. */
function drawnAt(box: Box, inside?: Box): CSSProperties {
  const left = box.left - (inside?.left ?? 0)
  const top = box.top - (inside?.top ?? 0)
  return { left, top, width: box.right - box.left, height: box.bottom - box.top }
}

/** Where the words go: beside the gap, then above it, then below it, and over it only where none of those has room. */
function whereTheWordsGo(gap: Box | null, width: number, height: number): { left: number; top: number } {
  const across = window.innerWidth
  const down = window.innerHeight
  const clampX = (x: number): number => Math.max(MARGIN, Math.min(x, across - width - MARGIN))
  const clampY = (y: number): number => Math.max(MARGIN, Math.min(y, down - height - MARGIN))
  if (gap === null) return { left: clampX((across - width) / 2), top: clampY((down - height) / 2) }
  const low = (gap.top + gap.bottom) / 2 > down / 2
  if (gap.left - MARGIN - width >= MARGIN) return { left: gap.left - MARGIN - width, top: clampY(low ? gap.bottom - height : gap.top) }
  if (gap.top - MARGIN - height >= MARGIN) return { left: clampX(gap.right - width), top: gap.top - MARGIN - height }
  if (gap.bottom + MARGIN + height <= down - MARGIN) return { left: clampX(gap.right - width), top: gap.bottom + MARGIN }
  return { left: clampX(gap.right - width), top: MARGIN }
}

const sameLayout = (a: Layout | null, b: Layout): boolean => a !== null && JSON.stringify(a) === JSON.stringify(b)

/** The first entry, mounted once in the shell. It draws nothing unless the office says it shows. */
export function FirstEntry() {
  const [entry, setEntry] = useState<TheFirstEntry | null>(null)
  const [ended, setEnded] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    // A FIRST ENTRY THAT COULD NOT BE READ IS NOT DRAWN: the grey would hold the person with nothing to say why. It is
    // read again on the next page load.
    api.firstEntry().then(
      (read) => {
        if (live) setEntry(read)
      },
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [])
  const end = useCallback(() => {
    setEnded(true)
    api.endTheFirstEntry().then(
      () => undefined,
      (error: unknown) => setFailed(errorMessage(error)),
    )
  }, [])
  return (
    <>
      <style href="mole-office-first-entry" precedence="default">
        {FIRST_ENTRY_CSS}
      </style>
      {entry?.shows === true && entry.report !== null && !ended ? <TheLayer report={entry.report} onOpened={end} /> : null}
      {failed === null ? null : (
        <div className="fe-failed" role="alert">
          <span>{t('firstEntry.failed', { why: failed })}</span>
          <button type="button" className="fe-failed-close" onClick={() => setFailed(null)}>
            {t('firstEntry.close')}
          </button>
        </div>
      )}
    </>
  )
}

function TheLayer({ report, onOpened }: { report: string; onOpened: () => void }) {
  const [step, setStep] = useState<Step>('chat')
  const [switchedOn, setSwitchedOn] = useState(false)
  const [layout, setLayout] = useState<Layout | null>(null)
  const words = useRef<HTMLDivElement>(null)
  const next = useRef<HTMLButtonElement>(null)

  // THE GAP AND THE WORDS, MEASURED ON EVERY FRAME, and drawn again only when they moved.
  useLayoutEffect(() => {
    let frame = 0
    const measure = (): void => {
      const places = thePlacesOf(step)
      const gap = theBoxHolding(places)
      const box = words.current
      const now: Layout = {
        across: window.innerWidth,
        down: window.innerHeight,
        places,
        gap,
        words: whereTheWordsGo(gap, box?.offsetWidth ?? 0, box?.offsetHeight ?? 0),
      }
      setLayout((was) => (sameLayout(was, now) ? was : now))
      frame = requestAnimationFrame(measure)
    }
    measure()
    return () => cancelAnimationFrame(frame)
  }, [step])

  // WHAT THE KEYBOARD MAY REACH: what can be pressed in the words and in the gap, in the order the page has them.
  const reachable = useCallback((): HTMLElement[] => {
    const places = [words.current, ...THE_GAP[step].flatMap((selector) => [...document.querySelectorAll<HTMLElement>(selector)])].filter(
      (el): el is HTMLElement => el !== null,
    )
    const inside = places.flatMap((place) => [...(place.matches(FOCUSABLE) ? [place] : []), ...place.querySelectorAll<HTMLElement>(FOCUSABLE)])
    return [...new Set(inside)].filter((el) => el.getClientRects().length > 0)
  }, [step])

  useEffect(() => {
    const allowed = (target: EventTarget | null): boolean =>
      target instanceof Node && (words.current?.contains(target) === true || THE_GAP[step].some((selector) => [...document.querySelectorAll(selector)].some((el) => el.contains(target))))
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return
      const list = reachable()
      if (list.length === 0) return
      event.preventDefault()
      const at = list.indexOf(document.activeElement as HTMLElement)
      const to = at === -1 ? (event.shiftKey ? list.length - 1 : 0) : (at + (event.shiftKey ? list.length - 1 : 1)) % list.length
      list[to]?.focus()
    }
    const onFocus = (event: FocusEvent): void => {
      if (allowed(event.target)) return
      reachable()[0]?.focus()
    }
    // A PRESS ON A LINK TO THE REPORT INSIDE THE OPEN CHECKLIST ENDS THE FIRST ENTRY. The link is followed as it is.
    const theReport = `#${recordPath(report, 'report')}`
    const onClick = (event: MouseEvent): void => {
      const link = event.target instanceof Element ? event.target.closest('a') : null
      if (link !== null && link.closest('.ckw-panel') !== null && link.getAttribute('href') === theReport) onOpened()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('focusin', onFocus, true)
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('focusin', onFocus, true)
      document.removeEventListener('click', onClick, true)
    }
  }, [step, report, reachable, onOpened])

  // EACH STEP STARTS WITH THE KEYBOARD ON ITS FIRST PRESS: Next in step one, the checklist press in step two. A
  // checklist just switched on draws its press a moment later, so this runs again when the gap first appears.
  useEffect(() => {
    if (step === 'chat') next.current?.focus()
    else document.querySelector<HTMLElement>(THE_GAP.checklist[0]!)?.focus()
  }, [step, layout?.gap === null])

  const toTheChecklist = (): void => {
    // THE CHECKLIST SWITCHED OFF IN THIS BROWSER IS SWITCHED ON, and the words say so.
    if (!checklistsWindowIsOn() && switchTheChecklistsWindow(true)) setSwitchedOn(true)
    setStep('checklist')
  }

  const gap = layout?.gap ?? null
  const mark = layout?.places[0]
  // Before the first measure there is no place, so the grey covers the whole window.
  const grey = theGreyAround(layout?.places ?? [], layout?.across ?? window.innerWidth, layout?.down ?? window.innerHeight)
  return (
    <div className="fe-layer" data-step={step}>
      {grey.map((cell, at) => (
        <div key={at} className="fe-grey" style={drawnAt(cell)} />
      ))}
      {/* THE RING HOLDS THE WHOLE GAP, and draws its glowing mark on the step's press alone. */}
      {gap === null || mark === undefined ? null : (
        <div
          className="fe-ring"
          data-pulse={step === 'checklist' ? 'yes' : undefined}
          style={drawnAt(gap)}
        >
          <div className="fe-ring-mark" style={drawnAt(mark, gap)} />
        </div>
      )}
      <div
        ref={words}
        className="fe-words"
        role="dialog"
        aria-modal="true"
        aria-label={t('firstEntry.label')}
        style={layout === null ? { visibility: 'hidden' } : { left: layout.words.left, top: layout.words.top }}
      >
        <h2 className="fe-words-title">{step === 'chat' ? t('firstEntry.chat.title') : t('firstEntry.checklist.title')}</h2>
        {step === 'checklist' && switchedOn ? <p className="fe-words-note">{t('firstEntry.checklist.switchedOn')}</p> : null}
        <p className="fe-words-text">{step === 'chat' ? t('firstEntry.chat.text') : t('firstEntry.checklist.text')}</p>
        {step === 'chat' ? (
          <button ref={next} type="button" className="fe-next" onClick={toTheChecklist}>
            {t('firstEntry.next')}
          </button>
        ) : null}
      </div>
    </div>
  )
}

const FIRST_ENTRY_CSS = `
.fe-layer { position: fixed; inset: 0; z-index: var(--z-first-entry); pointer-events: none; }
.fe-grey { position: fixed; background: rgba(0, 0, 0, .45); pointer-events: auto; }
.fe-ring { position: fixed; pointer-events: none; }
.fe-ring-mark {
  position: absolute; box-sizing: border-box; border-radius: var(--radius);
  border: 2px solid var(--accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 35%, transparent);
}
.fe-ring[data-pulse='yes'] > .fe-ring-mark {
  border: 3px solid var(--button-primary-bg);
  box-shadow: 0 0 0 4px var(--button-primary-bg), 0 0 18px 8px color-mix(in srgb, var(--button-primary-bg) 70%, transparent);
  animation: fe-pulse 1.2s ease-in-out infinite;
}
@keyframes fe-pulse {
  0%, 100% { box-shadow: 0 0 0 1px var(--button-primary-bg), 0 0 0 0 transparent; }
  50% { box-shadow: 0 0 0 7px var(--button-primary-bg), 0 0 28px 16px color-mix(in srgb, var(--button-primary-bg) 85%, transparent); }
}
@media (prefers-reduced-motion: reduce) {
  .fe-ring[data-pulse='yes'] > .fe-ring-mark { animation: none; }
}
.fe-words {
  position: fixed; box-sizing: border-box; width: min(22rem, calc(100vw - 24px)); pointer-events: auto;
  padding: var(--pad) var(--gut) var(--gut); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius);
  background: var(--panel); color: var(--text); box-shadow: var(--elev-2);
}
.fe-words-title { margin: 0 0 4px 0; font-size: var(--fs-3); }
.fe-words-text, .fe-words-note { margin: 0 0 var(--pad) 0; line-height: var(--lh-body); }
.fe-words-note { color: var(--text-2); }
.fe-words-text:last-child { margin-bottom: 0; }
.fe-next {
  min-height: 2.25rem; padding: 0 var(--gut); border: var(--border-w) solid var(--accent); border-radius: var(--radius-sm);
  background: var(--accent); color: var(--panel); font: inherit; font-weight: 600; cursor: pointer;
}
.fe-failed {
  position: fixed; left: var(--fab-inset); bottom: var(--fab-inset); z-index: var(--z-first-entry); max-width: min(28rem, calc(100vw - 24px));
  display: flex; gap: var(--pad); align-items: flex-start; padding: var(--pad) var(--gut);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius); background: var(--panel); box-shadow: var(--elev-2);
}
.fe-failed-close { flex: none; border: none; background: none; color: var(--text-2); font: inherit; cursor: pointer; }
@media (max-width: 480px) {
  .fe-next { min-height: 44px; }
}
`
