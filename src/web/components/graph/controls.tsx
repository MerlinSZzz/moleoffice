// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY CONTROL ON A DRAWING IS DRAWN BY THIS FILE, AND THE RULE ABOUT A SILENT PRESS IS WRITTEN
 * HERE ONCE.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * A control on a drawing puts the page into a state. When the page is ALREADY in that state, the
 * press would change nothing. That is the whole check, it is `alreadyInThatState` below, and it is
 * the only copy of it: a control anywhere on a drawing states what the page is in now and what its
 * press would set, and this file decides what to do about it.
 *
 * WHAT IT DOES ABOUT IT: the control is drawn as not available, and the reason is said in words.
 * Never a press that changes nothing and says nothing. A click that changes zero pixels, returns
 * no refusal and gives no explanation is not acceptable (problem 6 on a list of faults).
 *
 * ---------------------------------------------------------------------------------------
 * FOUR LOOKS, ONE RULE
 * ---------------------------------------------------------------------------------------
 *
 * The drawing has three kinds of control and this file wears all three rather than replacing them
 * with a fourth. `button` is the app's own `Btn`. `link` is a chip in the picker at the top, which
 * is an anchor so that middle-click and copy-link-address work. `plain` is a button in the small
 * bar over the drawing. What differs between them is the markup; what does not differ is the check
 * or the fact that a refusal is said out loud.
 *
 * THERE WAS A FOURTH, `step`, one segment of the detail ladder over a drawing. Criterion D14 took
 * that control away on 6 September 2026, and a look with no caller is a
 * second implementation waiting to drift from this one, so it went with it.
 *
 * WHERE THE WORDS GO IS THE ONE THING THE LOOK DECIDES, and it is decided by geometry rather than
 * by taste:
 *
 *   - `button` hands `disabled` and `reason` to `Btn`, which has drawn a refusal beside a button
 *     since long before this file. Nothing here re-implements that.
 *   - `link` draws the reason beside the name, in the chip, because a chip that is the page you are
 *     on has nothing to reveal on a press — it is the pattern at PipelinePage.tsx, which draws the
 *     words "drawn below" where the button for the pipeline already on screen would be.
 *   - `plain` sits inside a segmented group that CLIPS what overflows it (`.gx-canvas-bar` sets
 *     `overflow: hidden`, so its corners can be rounded). A reason drawn inside one of those would
 *     be cut away, which is exactly how the detail control spent from round ten to 27 August 2026
 *     with not one pixel on screen. So it reports the reason to `DrawingControls`, which draws ONE
 *     line under the whole row of controls.
 *
 * A `plain` control outside a `DrawingControls` throws rather than swallowing its refusal, because
 * a control with nowhere to say what it did not do is the defect this file exists to prevent.
 */

import { createContext, useContext, useState, type ReactNode } from 'react'
import { Btn, type BtnVariant } from '../ui.tsx'

/**
 * IS THE PAGE ALREADY IN THE STATE THIS PRESS WOULD SET?
 *
 * The one check. Both values are states of the same thing — which view is showing, which step of
 * the ladder is chosen, where the window onto the drawing is, how far the zoom has gone. `same` is
 * for a state that is a shape rather than a value; `sameViewport` below is the only one so far.
 */
export function alreadyInThatState<T>(now: T, after: T, same?: (a: T, b: T) => boolean): boolean {
  return same === undefined ? Object.is(now, after) : same(now, after)
}

/** Where the window onto a drawing is: how far across, how far down, and how big. */
export interface DrawingViewport {
  x: number
  y: number
  zoom: number
}

/**
 * Two zooms are the same zoom when a reader could not tell them apart.
 *
 * A THOUSANDTH, because these numbers are worked out in floating point from a layout and from
 * repeated multiplication: `Fit all` pressed twice must refuse the second time, and an exact
 * comparison would let it through.
 */
export function sameZoom(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.001
}

/** Two windows onto a drawing are the same window when a reader could not tell them apart. */
export function sameViewport(a: DrawingViewport, b: DrawingViewport): boolean {
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && sameZoom(a.zoom, b.zoom)
}

/**
 * Where a refused press says what it did not do, for the controls that cannot say it beside
 * themselves. Null outside a `DrawingControls`, which is an error rather than a default.
 */
const SayWhy = createContext<((reason: string | null) => void) | null>(null)

/**
 * A row of controls over a drawing, and the one line that says why a press did nothing.
 *
 * It renders its children and, under them, the reason the last refused press gave. A press that
 * DOES something clears the line, so what is on screen is always about the press just made.
 */
export function DrawingControls({ children }: { children: ReactNode }) {
  const [refused, setRefused] = useState<string | null>(null)
  return (
    <SayWhy.Provider value={setRefused}>
      {children}
      {refused === null ? null : (
        <p className="gx-refused" role="status">
          {refused}
        </p>
      )}
    </SayWhy.Provider>
  )
}

interface Common<T> {
  /** The state the page is in. */
  now: T
  /** The state a press would put the page into. */
  after: T
  /** How two of these states are compared. Left out, they are compared as values. */
  same?: (a: T, b: T) => boolean
  /**
   * Why a press would change nothing, in words that name the state the page is in.
   *
   * Leave it out only for a control that can never be in its own state — a toggle always changes
   * something — and it throws if one turns out to be in it after all, because a control that will
   * not say why it is off is a dead end. `Btn` threw for the same reason until November 2026; it now
   * draws such a press off, with a line saying that the page does not say why.
   * For a `link` the words are drawn beside the name, so write two or three; for the rest a
   * sentence.
   */
  reason?: string
  /**
   * Why this control cannot act AT ALL, whatever state the page is in — a missing prerequisite
   * rather than a state already reached. Absent when it can act.
   *
   * `Graph` on a drawing with no card is the case this exists for: there is no state to be
   * already in, and the press would still change nothing anybody asked for.
   */
  unavailable?: string
  title?: string
  children: ReactNode
}

/** What a press does when it would change something. A link needs none: its address is what it does. */
interface Press {
  onPress: () => void
}

export type DrawingControlProps<T> = Common<T> &
  (
    | ({ look: 'button'; variant?: BtnVariant; size?: 'sm' | 'md' } & Press)
    | { look: 'link'; href: string; className: string }
    | ({ look: 'plain'; className?: string; label?: string } & Press)
  )

/**
 * ONE CONTROL ON A DRAWING.
 *
 * It says what the page is in and what its press would set. Everything else — whether the press is
 * silent, how a control that would do nothing is drawn, and where the reason is said — is this
 * file's answer and not the caller's.
 */
export function DrawingControl<T>(props: DrawingControlProps<T>) {
  return (
    <>
      {/* The two class names this file draws, hoisted into the head by href and de-duplicated
          there, so a control carries its own look wherever it is used. */}
      <style href="mole-office-drawing-controls" precedence="default">
        {CONTROLS_CSS}
      </style>
      <OneControl {...props} />
    </>
  )
}

function OneControl<T>(props: DrawingControlProps<T>) {
  const { now, after, same, reason, unavailable, title, children } = props
  const sayWhy = useContext(SayWhy)
  // TWO WAYS TO BE UNAVAILABLE AND ONE WAY TO SAY SO. A prerequisite that is missing is checked
  // first, because a control that cannot act at all is not in any state to be already in.
  const already = unavailable !== undefined || alreadyInThatState(now, after, same)
  const why = unavailable ?? reason
  if (already && why === undefined) {
    throw new Error(
      'A drawing control is in the state its press would set and has no reason to give. Say what did not happen and why.',
    )
  }

  if (props.look === 'button') {
    return (
      <Btn
        variant={props.variant ?? 'secondary'}
        {...(props.size === undefined ? {} : { size: props.size })}
        {...(title === undefined ? {} : { title })}
        disabled={already}
        {...(why === undefined ? {} : { reason: why })}
        onClick={props.onPress}
      >
        {children}
      </Btn>
    )
  }

  if (props.look === 'link') {
    // A CHIP FOR THE DRAWING ALREADY ON SCREEN IS NOT A LINK. Its address is the address the reader
    // is at, so the press is the one press in the picker that goes nowhere. It keeps the chip's own
    // look and `aria-current`, and says in words that this is the drawing on screen.
    if (already) {
      return (
        <span className={props.className} data-current="1" aria-current="page">
          {children} <span className="gx-on-screen">· {why}</span>
        </span>
      )
    }
    return (
      <a className={props.className} href={props.href} {...(title === undefined ? {} : { title })}>
        {children}
      </a>
    )
  }

  if (sayWhy === null) {
    throw new Error(
      `A drawing control drawn as "${props.look}" is outside DrawingControls, so a refused press would have nowhere to say what it did not do.`,
    )
  }
  const onPress = props.onPress
  const press = (): void => {
    if (already) {
      sayWhy(why ?? null)
      return
    }
    sayWhy(null)
    onPress()
  }
  return (
    <button
      type="button"
      {...(props.className === undefined ? {} : { className: props.className })}
      {...(props.label === undefined ? {} : { 'aria-label': props.label })}
      aria-disabled={already ? true : undefined}
      {...(title === undefined ? {} : { title })}
      onClick={press}
    >
      {children}
    </button>
  )
}

/**
 * The two things this file draws that nothing else does.
 *
 * It is hoisted into the head by href, like every other stylesheet in this app, so a drawing that
 * uses these controls carries their look with it rather than depending on the page it is on.
 */
const CONTROLS_CSS = `
/* WHY THE LAST PRESS DID NOTHING. Its own row under the controls over the drawing: the row is a
   wrapping flex, and a line that took a share of it would squeeze the controls it is about. */
.gx-refused {
  flex: 1 0 100%;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
}
/* "on screen", in the chip for the drawing you are looking at. The middle dot is the separator this
   product already uses between two facts on one line, and it is here because without it the chip
   read as one name: "Every module on screen".

   NOT .gx-here, WHICH IS TAKEN. That class is the presence marker a card draws for whoever is
   working on it (Presence.tsx, styled in Canvas.tsx), so this span was picking up its colour and
   its inline-flex — which is why "on screen" was the least readable text on the page — and
   tests/graph-presence-in-the-browser then counted two presence markers where one person was
   working. Two meanings on one class name, found by a browser test written for the other one. */
.gx-on-screen { font-weight: 400; }
`
