// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SMALL SHAPES DESIGN D DRAWS: one stroke of the text's own colour, 24 by 24, and no word on
 * the screen. A press made of one of them carries its word in three places instead: the title a
 * pointer resting on it shows, the label a screen reader announces, and the word only a screen
 * reader reads inside the press. The visual is the shape, and the words never take room in the
 * seam, the bar or the row they sit in.
 *
 * The brief for the split is that every words-press becomes a shape. These are those shapes; a
 * press is drawn only by `AShapePress`, so no caller can give one a sighted word by accident.
 */
import type { ReactNode } from 'react'

/** The one stroke every shape is drawn with. The colour is the press's own text colour. */
const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

function ShapePicture({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} aria-hidden="true" focusable="false" {...STROKE}>
      {children}
    </svg>
  )
}

/** Two arrows trading places: the chat and the page swap sides. */
export function SwapSidesShape() {
  return (
    <ShapePicture>
      <path d="M4 8h13" />
      <path d="M14 5l3 3-3 3" />
      <path d="M20 16H7" />
      <path d="M10 13l-3 3 3 3" />
    </ShapePicture>
  )
}

/** A window with an arrow leaving it: the chat is sent to a window of its own. */
export function ItsOwnWindowShape() {
  return (
    <ShapePicture>
      <rect x="3" y="6" width="14" height="13" rx="2" />
      <path d="M14 4h6v6" />
      <path d="M20 4l-7 7" />
    </ShapePicture>
  )
}

/** A cross: the chat is put away. */
export function PutItAwayShape() {
  return (
    <ShapePicture>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </ShapePicture>
  )
}

/** An arrow back to the left: the phone's whole-screen chat returns to the page. */
export function BackToThePageShape() {
  return (
    <ShapePicture>
      <path d="M20 12H5" />
      <path d="M10 7l-5 5 5 5" />
    </ShapePicture>
  )
}

/** A page cut by a seam, the chat taking its right part: the chat goes back beside the page. */
export function BesideThePageShape() {
  return (
    <ShapePicture>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </ShapePicture>
  )
}

/** A speech bubble: open the chat from the phone's bar. */
export function OpenTheChatShape() {
  return (
    <ShapePicture>
      <path d="M4 5h16v11H9l-5 4z" />
      <path d="M8 9h8" />
      <path d="M8 12h5" />
    </ShapePicture>
  )
}

/** A curly opening quotation mark, two marks each with a round head and a tail curving up to the right: take the words selected on the page into the next message. */
export function QuoteShape() {
  return (
    <ShapePicture>
      <path d="M10.5 6.5C8.4 7.2 7.6 9.4 8.63 12.12A2.75 2.75 0 1 1 4.5 14.5C4.5 10.6 6.9 7.3 10.5 6.5z" />
      <path d="M19.5 6.5C17.4 7.2 16.6 9.4 17.63 12.12A2.75 2.75 0 1 1 13.5 14.5C13.5 10.6 15.9 7.3 19.5 6.5z" />
    </ShapePicture>
  )
}


/** Two people: the contacts tab. */
export function ContactsShape() {
  return (
    <ShapePicture>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c.7-3.2 2.7-5 5.5-5s4.8 1.8 5.5 5" />
      <circle cx="17" cy="9" r="2.2" />
      <path d="M15.5 14.4c2.3.1 3.9 1.6 4.5 4.1" />
    </ShapePicture>
  )
}

/** A group of people: the groups tab. */
export function GroupsShape() {
  return (
    <ShapePicture>
      <circle cx="8" cy="8" r="2.6" />
      <circle cx="16" cy="8" r="2.6" />
      <path d="M3.5 19c.6-3.2 2.3-5 4.5-5s3.9 1.8 4.5 5" />
      <path d="M11.5 19c.6-3.2 2.3-5 4.5-5s3.9 1.8 4.5 5" />
    </ShapePicture>
  )
}

/** Two arrows facing each other: the conversations between agents. */
export function BetweenShape() {
  return (
    <ShapePicture>
      <path d="M4 9h13" />
      <path d="M14 6l3 3-3 3" />
      <path d="M20 15H7" />
      <path d="M10 12l-3 3 3 3" />
    </ShapePicture>
  )
}

/** An arrow up out of a tray: send. */
export function SendShape() {
  return (
    <ShapePicture>
      <path d="M12 20V4" />
      <path d="M6 10l6-6 6 6" />
      <path d="M5 20h14" />
    </ShapePicture>
  )
}

/** A paper clip: attach a file, a picture or any other, to the message. */
export function AttachShape() {
  return (
    <ShapePicture>
      <path d="M15.5 7v8.5a3.5 3.5 0 0 1-7 0V6a2.5 2.5 0 0 1 5 0v9a1 1 0 0 1-2 0V8" />
    </ShapePicture>
  )
}

/** A person with a plus: add a group. */
export function AddGroupShape() {
  return (
    <ShapePicture>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c.7-3.2 2.7-5 5.5-5 1.2 0 2.3.4 3.2 1" />
      <path d="M18 13v6" />
      <path d="M15 16h6" />
    </ShapePicture>
  )
}


/** A flag on a pole: the label the next message carries. */
export function FlagShape() {
  return (
    <ShapePicture>
      <path d="M7 20V4" />
      <path d="M7 5h11l-3 4 3 4H7" />
    </ShapePicture>
  )
}

export interface AShapePressProps {
  className: string
  /** The press's word, in all three places: title, label and the word only a screen reader reads. */
  words: string
  onPress?: () => void
  /** A press whose work is done on the way down, before focus moves the page's selection away. */
  onPointerDown?: () => void
  /** A press that stays down while what it turns on is on; left out, the press is not a switch. */
  pressed?: boolean
  children: ReactNode
}

/** One shape as a press, with its word where a pointer and a screen reader find it and nowhere on the picture. */
export function AShapePress({ className, words, onPress, onPointerDown, pressed, children }: AShapePressProps) {
  return (
    <button type="button" className={className} title={words} aria-label={words} aria-pressed={pressed} onClick={onPress} onPointerDown={onPointerDown}>
      {children}
      <span className="sr-only">{words}</span>
    </button>
  )
}
