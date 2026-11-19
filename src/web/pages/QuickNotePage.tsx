// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE QUICK NOTE PAGE AT `#/quick-note`: ONE NOTE, WITH THE WHOLE WINDOW TO ITSELF.
 *
 * The window app opens it in a small window of its own from the tray or its key (src/desktop/the-quick-note.mjs), and
 * a browser tab opens it at the same address. The note itself, its tools and its saving are the note part
 * (src/web/components/QuickNote.tsx), which a box beside another page draws too. This page adds what a whole window
 * needs around it.
 *
 * EACH OPENING WITH NO NOTE NAMED IS A NEW NOTE. From the note's first save the address names it, `#/quick-note/<id>`,
 * so a reload opens the same note again.
 *
 * IT IS DRAWN WITHOUT THE SIDEBAR. Its header offers Back and Done in a browser and in the window app.
 */
import { useEffect, useRef, useState } from 'react'
import { t } from '@shared/i18n.ts'
import { THE_PERSON } from '@shared/person.ts'
import { isTheWindow } from '../../config/the-window-mark.mjs'
import { THE_QUICK_NOTE_WINDOW_MARKER } from '../../config/the-quick-note-address.mjs'
import { api } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { askForMyNotes, listenForMyNotes } from '../lib/quick-note-navigation.ts'
import { mediaLoadWasRead, sayMediaLoad } from '../lib/mediaload.ts'
import { theShellDrewTheAddress } from '../lib/ready.ts'
import { QuickNote, type FlushQuickNote } from '../components/QuickNote.tsx'
import { navigate, quickNotePath, useRoute } from '../components/router.tsx'
import { TheFaultBoundary } from '../components/TheFault.tsx'
import { Btn } from '../components/ui.tsx'

/**
 * The page reads the address itself, rather than being handed it, because it names its own new note in the address
 * without a hashchange (`history.replaceState`), and a page handed the address would still hold the one from before.
 */
export function QuickNotePage() {
  useLanguage()
  const route = useRoute()
  const id = route.name === 'quickNote' ? route.id : undefined
  // ONE OPENING OF THE PAGE: the note it opened, or none for a new one. A new opening draws a new note.
  const [opening, setOpening] = useState({ key: 0, id })
  if (id !== opening.id) setOpening({ key: opening.key + 1, id })
  const [title, setTitle] = useState<string | null>(null)
  const flush = useRef<FlushQuickNote | null>(null)
  const [returning, setReturning] = useState(false)
  const [returnFailed, setReturnFailed] = useState(false)
  const inTheWindow = isTheWindow(navigator.userAgent)

  useEffect(() => {
    theShellDrewTheAddress()
  }, [opening.key])

  // THE PERSON'S CHOICE OF WHETHER MEDIA LOAD, read here because this page is drawn in place of the shell, whose chat
  // reads it on every other page (Chat.tsx). Until it is read, a picture added from a report loads nothing.
  useEffect(() => {
    if (mediaLoadWasRead()) return
    api.participant('person', THE_PERSON).then(
      (answer) => sayMediaLoad(answer.participant.mediaLoad ?? null),
      // A failed read leaves it not read: a picture says "not fetched", as on any page before the chat's read answers.
      () => undefined,
    )
  }, [])

  useEffect(() => {
    if (!inTheWindow || new URLSearchParams(window.location.search).has(THE_QUICK_NOTE_WINDOW_MARKER)) return
    return listenForMyNotes(() => navigate('/my-notes'))
  }, [inTheWindow])

  const startANewNote = () => {
    setOpening((now) => ({ key: now.key + 1, id: undefined }))
    navigate(quickNotePath())
  }
  // A note window closes itself; an ordinary office tab remains in the office on My notes.
  const ownWindow = window.opener !== null || (inTheWindow && new URLSearchParams(window.location.search).has(THE_QUICK_NOTE_WINDOW_MARKER))
  const backAfterSaving = () => {
    if (!ownWindow) {
      navigate('/my-notes')
      return
    }
    if (window.opener !== null) {
      window.opener.location.hash = '/my-notes'
      window.opener.focus()
    } else {
      if (returning) return
      setReturning(true)
      setReturnFailed(false)
      void askForMyNotes().then((answered) => {
        if (answered) window.close()
        else {
          setReturning(false)
          setReturnFailed(true)
        }
      }).catch(() => {
        setReturning(false)
        setReturnFailed(true)
      })
      return
    }
    window.close()
  }
  const doneAfterSaving = () => {
    if (ownWindow) window.close()
    else navigate('/my-notes')
  }

  const afterSaving = (leave: () => void) => {
    const flushNote = flush.current
    if (flushNote === null) {
      leave()
      return
    }
    void flushNote().then((result) => { if (result.ok) leave() })
  }
  const back = () => afterSaving(backAfterSaving)
  const done = () => afterSaving(doneAfterSaving)

  return (
    <main className="page qn-page" id="main" tabIndex={-1} data-in-the-window={inTheWindow ? '1' : undefined}>
      <style href="mole-office-quick-note-page" precedence="default">{CSS}</style>
      <header className="qn-head">
        <Btn size="sm" onClick={back} disabled={returning}>
          {`← ${t('quickNote.back')}`}
        </Btn>
        <h1 className="qn-title">{opening.id === undefined ? t('quickNote.newNote') : (title ?? t('quickNote.title'))}</h1>
        <span className="qn-head-right">
          <Btn size="sm" onClick={startANewNote}>
            {t('quickNote.newNote')}
          </Btn>
          <Btn size="sm" variant="primary" onClick={done}>
            {t('quickNote.done')}
          </Btn>
        </span>
      </header>
      {returnFailed ? <p className="qn-return-failed" role="status">{t('quickNote.returnFailed')}</p> : null}
      {/* A FAULT WHILE DRAWING IS SAID WHERE THE NOTE WAS, as the shell does for its pages. The boundary is keyed by
          the opening and not by the address, because naming a new note in the address is the same opening. */}
      <TheFaultBoundary key={opening.key} page={t('quickNote.title')}>
        <QuickNote
          id={opening.id}
          flushRef={flush}
          titled={setTitle}
          filed={(own) => {
            // THE NEW NOTE IS NAMED IN THE ADDRESS, in place of the address it opened at, so a reload opens it again
            // and Back does not lead to a second new note.
            history.replaceState(history.state, '', `#${quickNotePath(own)}`)
            setOpening((now) => ({ ...now, id: own }))
          }}
        />
      </TheFaultBoundary>
    </main>
  )
}

const CSS = `
.qn-page {
  display: flex; flex-direction: column; height: 100vh; height: 100dvh; margin: 0; padding: 0; max-width: none;
  background: var(--bg); color: var(--text);
}
.qn-page > .qn-note { flex: 1; height: auto; }
.qn-head {
  display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-bottom: var(--border-w) solid var(--border);
}
.qn-title { flex: 1; margin: 0; font-size: var(--fs-3); text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qn-head-right { display: flex; gap: 8px; }
.qn-return-failed { margin: 0; padding: 8px 12px; color: var(--text-2); }
@media (max-width: 560px) {
  .qn-head-right .px-btn[data-variant='secondary'] { display: none; }
}
`
