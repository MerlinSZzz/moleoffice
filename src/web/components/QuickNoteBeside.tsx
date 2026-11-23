// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A note floating over the office, with a press to open it in its own window.
 *
 * BACK SHOWS MY NOTES IN THIS SAME WINDOW, where it stands and at its size, and the page behind it stays where it is. A
 * note opened from that list is drawn in the window too.
 */
import { useEffect, useRef, useState, type PointerEvent as APointer } from 'react'
import { t } from '@shared/i18n.ts'
import { isTheWindow } from '../../config/the-window-mark.mjs'
import { THE_QUICK_NOTE_WINDOW_MARKER } from '../../config/the-quick-note-address.mjs'
import { A_NOTE_WINDOWS_SIZE } from '../../desktop/the-quick-note.mjs'
import { useLanguage } from '../lib/language.ts'
import { listenForMyNotes } from '../lib/quick-note-navigation.ts'
import { closeTheNoteBeside, openTheLinkedNoteInItsWindow, useTheNoteBeside } from '../lib/open-a-quick-note.ts'
import { MyNotesPage } from '../pages/MyNotesPage.tsx'
import { navigate, quickNotePath } from './router.tsx'
import { QuickNote, type FlushQuickNote } from './QuickNote.tsx'
import { TheFaultBoundary } from './TheFault.tsx'

/** Where an opened note stands and how big it is, once a person has moved or resized it. */
type NoteBox = { left: number; top: number; width: number; height: number }

/** The smallest a person may make a note: its head's three presses and a few lines of the note still fit. */
const A_NOTE_IS_AT_LEAST = { width: 260, height: 240 } as const

/** How far one press of an arrow key on the corner resizes the note. */
const A_KEY_RESIZES_BY_PX = 16

/** How long Open in a window waits for a save underway before it opens the note as the office keeps it. */
const A_SAVE_IS_WAITED_FOR_MS = 5_000

/**
 * THE SHADOW AROUND A NOTE'S WINDOW, in the light theme and the dark one: a thin line at its edge. The office's raised
 * panels cast a deeper one (--elev-2 in tokens.css), which read as a thick halo around a note.
 */
const A_NOTES_SHADOW = { light: '2px 2px 0 #1c293c', dark: '0 2px 8px rgba(0, 0, 0, .5)' } as const

/** The note held inside the window, no bigger than it and with no edge past it, so its head and its corner can be reached. */
function heldInside(box: NoteBox): NoteBox {
  const width = Math.min(box.width, window.innerWidth)
  const height = Math.min(box.height, window.innerHeight)
  return {
    left: Math.min(Math.max(box.left, 0), window.innerWidth - width),
    top: Math.min(Math.max(box.top, 0), window.innerHeight - height),
    width,
    height,
  }
}

/**
 * THE CORNER IS AT THE FOOT ON THE LEFT, away from the chat button, so the note's right edge and its top stay where they
 * are: a drag left makes it wider and a drag down makes it taller. It stops at the window's left edge and its foot.
 */
function resizedFrom(from: NoteBox, dx: number, dy: number): NoteBox {
  const right = from.left + from.width
  const width = Math.min(Math.max(from.width - dx, A_NOTE_IS_AT_LEAST.width), right)
  const height = Math.min(Math.max(from.height + dy, A_NOTE_IS_AT_LEAST.height), window.innerHeight - from.top)
  return { left: right - width, top: from.top, width, height }
}

export function QuickNoteBeside() {
  useLanguage()
  const opening = useTheNoteBeside()
  const flush = useRef<FlushQuickNote | null>(null)
  const aside = useRef<HTMLElement | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [moving, setMoving] = useState(false)
  // NULL IS WHERE A NOTE OPENS, from the stylesheet; a move or a resize gives it a box of its own.
  const [box, setBox] = useState<NoteBox | null>(null)
  // THE OPENING WHOSE WINDOW SHOWS MY NOTES, after Back. A note opened from that list is a new opening, and is drawn.
  const [listFor, setListFor] = useState<number | null>(null)
  const dragFrom = useRef<{ what: 'move' | 'resize'; x: number; y: number; from: NoteBox } | null>(null)
  useEffect(() => {
    if (!isTheWindow(navigator.userAgent)) return
    return listenForMyNotes(() => navigate('/my-notes'))
  }, [])
  useEffect(() => {
    setBlocked(false)
    setMoving(false)
    if (opening?.inItsWindow !== true) setBox(null)
    dragFrom.current = null
  }, [opening?.key])
  // A WINDOW MADE SMALLER takes a moved note with it, so it is never left out of reach.
  useEffect(() => {
    const holdIt = (): void => setBox((now) => (now === null ? null : heldInside(now)))
    window.addEventListener('resize', holdIt)
    return () => window.removeEventListener('resize', holdIt)
  }, [])
  if (opening === null) return null
  const listing = listFor === opening.key

  const boxNow = (): NoteBox | null => {
    if (box !== null) return box
    const drawn = aside.current?.getBoundingClientRect()
    return drawn === undefined ? null : { left: drawn.left, top: drawn.top, width: drawn.width, height: drawn.height }
  }
  // A PRESS ON THE HEAD MOVES THE NOTE, except one on its presses, which stay presses.
  const startDragging = (what: 'move' | 'resize') => (e: APointer<HTMLElement>): void => {
    if (e.button !== 0) return
    if (what === 'move' && (e.target as Element).closest('button, a, input, select, textarea') !== null) return
    const from = boxNow()
    if (from === null) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragFrom.current = { what, x: e.clientX, y: e.clientY, from }
  }
  const keepDragging = (e: APointer<HTMLElement>): void => {
    const held = dragFrom.current
    if (held === null) return
    const dx = e.clientX - held.x
    const dy = e.clientY - held.y
    setBox(held.what === 'move' ? heldInside({ ...held.from, left: held.from.left + dx, top: held.from.top + dy }) : resizedFrom(held.from, dx, dy))
  }
  const stopDragging = (e: APointer<HTMLElement>): void => {
    if (dragFrom.current === null) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    dragFrom.current = null
  }

  const leave = (back: boolean) => {
    const left = (): void => {
      if (back) setListFor(opening.key)
      else closeTheNoteBeside(opening.key)
    }
    const flushNote = flush.current
    if (flushNote === null) {
      left()
      return
    }
    setMoving(true)
    void flushNote().then((result) => {
      setMoving(false)
      if (result.ok) left()
    }).catch(() => setMoving(false))
  }
  const popOut = () => {
    // Open while the press still has browser permission; the note must be saved before navigating it.
    const { width, height } = A_NOTE_WINDOWS_SIZE
    let windowForNote: Window | null
    try {
      windowForNote = window.open('', '_blank', `popup,width=${String(width)},height=${String(height)}`)
    } catch {
      setBlocked(true)
      return
    }
    if (windowForNote === null) {
      setBlocked(true)
      return
    }
    const noteWindow = windowForNote
    setBlocked(false)
    setMoving(true)
    void (async () => {
      const result = await flush.current?.(A_SAVE_IS_WAITED_FOR_MS)
      // A SAVE REFUSED, OR ONE THAT DOES NOT END, STILL LETS A KEPT NOTE OPEN IN ITS WINDOW, which draws the note as the
      // office keeps it. The note stays open here as well, with the change that was not kept and what was said of it, so
      // nothing is lost without being said. A note the office never kept has nothing to open.
      if (result === undefined || (!result.ok && result.id === null)) {
        noteWindow.close()
        setMoving(false)
        return
      }
      const address = new URL(window.location.href)
      address.searchParams.delete(THE_QUICK_NOTE_WINDOW_MARKER)
      address.hash = quickNotePath(result.id ?? undefined)
      noteWindow.location.href = address.href
      if (result.ok) closeTheNoteBeside(opening.key)
      else setMoving(false)
    })().catch(() => {
      noteWindow.close()
      setMoving(false)
    })
  }
  return (
    <aside
      ref={aside}
      className="qn-beside"
      data-quick-note-beside=""
      aria-label={t('quickNote.title')}
      style={box === null ? undefined : { left: box.left, top: box.top, width: box.width, height: box.height, right: 'auto' }}
    >
      <style href="mole-office-quick-note-beside" precedence="default">{CSS}</style>
      <header
        className="qn-beside-head"
        onPointerDown={startDragging('move')}
        onPointerMove={keepDragging}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
      >
        {listing ? null : (
          <button type="button" className="px-btn" data-variant="secondary" data-size="sm" disabled={moving} onClick={() => leave(true)}>
            {`← ${t('quickNote.back')}`}
          </button>
        )}
        {listing ? null : (
          <button type="button" className="px-btn" data-variant="secondary" data-size="sm" data-part="pop-out" disabled={moving} onClick={popOut}>
            {t('quickNotes.popOut')}
          </button>
        )}
        <button type="button" className="px-btn" data-variant="primary" data-size="sm" data-part="close" disabled={moving} onClick={() => leave(false)}>
          {t('quickNote.done')}
        </button>
      </header>
      {blocked ? <p className="qn-beside-why" role="status">{t('quickNotes.windowBlocked')}</p> : null}
      <div className="qn-beside-content" data-shows={listing ? 'my-notes' : 'note'} inert={moving}>
        {listing ? (
          <TheFaultBoundary key={`my-notes-${String(opening.key)}`} page={t('myNotes.title')}>
            <MyNotesPage opens={openTheLinkedNoteInItsWindow} />
          </TheFaultBoundary>
        ) : (
          <TheFaultBoundary key={opening.key} page={t('quickNote.title')}>
            <QuickNote id={opening.id} flushRef={flush} />
          </TheFaultBoundary>
        )}
      </div>
      <button
        type="button"
        className="qn-beside-corner"
        data-part="resize-note"
        aria-label={t('quickNote.resizeNote')}
        title={t('quickNote.resizeNote')}
        onPointerDown={startDragging('resize')}
        onPointerMove={keepDragging}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onKeyDown={(event) => {
          const dx = event.key === 'ArrowRight' ? A_KEY_RESIZES_BY_PX : event.key === 'ArrowLeft' ? -A_KEY_RESIZES_BY_PX : 0
          const dy = event.key === 'ArrowDown' ? A_KEY_RESIZES_BY_PX : event.key === 'ArrowUp' ? -A_KEY_RESIZES_BY_PX : 0
          const from = boxNow()
          if ((dx === 0 && dy === 0) || from === null) return
          event.preventDefault()
          setBox(resizedFrom(from, dx, dy))
        }}
      />
    </aside>
  )
}

const CSS = `
/* THE NOTE ENDS ABOVE THE CHAT BUTTON'S ROOM where it opens, so the line at its foot is the note's last line and no
   empty band is kept under it. */
.qn-beside {
  position: fixed; z-index: var(--z-note); right: 16px; top: 16px;
  display: flex; flex-direction: column; box-sizing: border-box;
  width: min(420px, calc(100vw - 32px)); height: min(640px, calc(100dvh - 16px - var(--fab-room)));
  min-width: 0; border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm); background: var(--bg); box-shadow: ${A_NOTES_SHADOW.light};
}
:root[data-boot-theme='dark']:not([data-theme]) .qn-beside, :root[data-theme='dark'] .qn-beside { box-shadow: ${A_NOTES_SHADOW.dark}; }
@media (prefers-color-scheme: dark) { :root:not([data-theme]):not([data-boot-theme]) .qn-beside { box-shadow: ${A_NOTES_SHADOW.dark}; } }
.qn-beside-content { flex: 1; min-height: 0; display: flex; }
.qn-beside-content[data-shows='my-notes'] { display: block; overflow: auto; }
.qn-beside-content > .qn-note { flex: 1; height: auto; min-height: 0; }
.qn-beside-head {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); padding: var(--pad); border-bottom: var(--border-w) solid var(--border);
  cursor: move; touch-action: none; user-select: none;
}
.qn-beside-head [data-part='pop-out'], .qn-beside-head [data-part='close']:first-child { margin-left: auto; }
.qn-beside-why { margin: 0; padding: var(--pad); color: var(--text-2); font-size: var(--fs-1); }
.qn-beside-corner {
  position: absolute; left: 0; bottom: 0; width: 24px; height: 24px; padding: 0;
  border: 0; background: transparent; cursor: nesw-resize; touch-action: none;
}
.qn-beside-corner::after {
  content: ''; position: absolute; left: 4px; bottom: 4px; width: 7px; height: 7px;
  border-left: 2px solid var(--text); border-bottom: 2px solid var(--text);
}
.qn-beside-corner:focus-visible { outline: 2px solid var(--text); outline-offset: -2px; }
@media (max-width: 450px) { .qn-beside { top: 8px; right: 8px; width: calc(100vw - 16px); height: calc(100dvh - 8px - var(--fab-room)); } }
`
