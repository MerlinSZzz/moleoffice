// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A note floating over the office, with a press to open it in its own window. */
import { useEffect, useRef, useState } from 'react'
import { t } from '@shared/i18n.ts'
import { isTheWindow } from '../../config/the-window-mark.mjs'
import { THE_QUICK_NOTE_WINDOW_MARKER } from '../../config/the-quick-note-address.mjs'
import { A_NOTE_WINDOWS_SIZE } from '../../desktop/the-quick-note.mjs'
import { useLanguage } from '../lib/language.ts'
import { listenForMyNotes } from '../lib/quick-note-navigation.ts'
import { closeTheNoteBeside, useTheNoteBeside } from '../lib/open-a-quick-note.ts'
import { navigate, quickNotePath } from './router.tsx'
import { QuickNote, type FlushQuickNote } from './QuickNote.tsx'
import { TheFaultBoundary } from './TheFault.tsx'

export function QuickNoteBeside() {
  useLanguage()
  const opening = useTheNoteBeside()
  const flush = useRef<FlushQuickNote | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [moving, setMoving] = useState(false)
  useEffect(() => {
    if (!isTheWindow(navigator.userAgent)) return
    return listenForMyNotes(() => navigate('/my-notes'))
  }, [])
  useEffect(() => {
    setBlocked(false)
    setMoving(false)
  }, [opening?.key])
  if (opening === null) return null

  const leave = (back: boolean) => {
    const flushNote = flush.current
    if (flushNote === null) {
      closeTheNoteBeside(opening.key)
      if (back) navigate('/my-notes')
      return
    }
    setMoving(true)
    void flushNote().then((result) => {
      if (!result.ok) {
        setMoving(false)
        return
      }
      closeTheNoteBeside(opening.key)
      if (back) navigate('/my-notes')
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
      const result = await flush.current?.()
      if (result === undefined || !result.ok) {
        noteWindow.close()
        setMoving(false)
        return
      }
      const address = new URL(window.location.href)
      address.searchParams.delete(THE_QUICK_NOTE_WINDOW_MARKER)
      address.hash = quickNotePath(result.id ?? undefined)
      noteWindow.location.href = address.href
      closeTheNoteBeside(opening.key)
    })().catch(() => {
      noteWindow.close()
      setMoving(false)
    })
  }
  return (
    <aside className="qn-beside" data-quick-note-beside="" aria-label={t('quickNote.title')}>
      <style href="mole-office-quick-note-beside" precedence="default">{CSS}</style>
      <header className="qn-beside-head">
        <button type="button" className="px-btn" data-variant="secondary" data-size="sm" disabled={moving} onClick={() => leave(true)}>
          {`← ${t('quickNote.back')}`}
        </button>
        <button type="button" className="px-btn" data-variant="secondary" data-size="sm" data-part="pop-out" disabled={moving} onClick={popOut}>
          {t('quickNotes.popOut')}
        </button>
        <button type="button" className="px-btn" data-variant="primary" data-size="sm" data-part="close" disabled={moving} onClick={() => leave(false)}>
          {t('quickNote.done')}
        </button>
      </header>
      {blocked ? <p className="qn-beside-why" role="status">{t('quickNotes.windowWasBlocked')}</p> : null}
      <div className="qn-beside-content" inert={moving}>
        <TheFaultBoundary key={opening.key} page={t('quickNote.title')}>
          <QuickNote id={opening.id} flushRef={flush} />
        </TheFaultBoundary>
      </div>
    </aside>
  )
}

const CSS = `
.qn-beside {
  position: fixed; z-index: var(--z-popover); right: 16px; top: 16px;
  display: flex; flex-direction: column; box-sizing: border-box;
  width: min(420px, calc(100vw - 32px)); height: min(640px, calc(100dvh - 32px));
  min-width: 0; border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm); background: var(--bg); box-shadow: var(--elev-2);
  padding-bottom: var(--fab-room);
}
.qn-beside-content { flex: 1; min-height: 0; display: flex; }
.qn-beside-content > .qn-note { flex: 1; height: auto; min-height: 0; }
.qn-beside-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); padding: var(--pad); border-bottom: var(--border-w) solid var(--border); }
body:has(.ckw) .qn-beside-head { padding-right: var(--ckw-room); }
.qn-beside-head [data-part='pop-out'] { margin-left: auto; }
.qn-beside-why { margin: 0; padding: var(--pad); color: var(--text-2); font-size: var(--fs-1); }
@media (max-width: 450px) { .qn-beside { top: 8px; right: 8px; width: calc(100vw - 16px); height: calc(100dvh - 16px); } }
`
