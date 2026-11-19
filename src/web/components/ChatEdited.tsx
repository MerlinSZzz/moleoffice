// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE WHOSE WORDS WERE CHANGED SAYS SO, AND ITS WRITER MAY CHANGE THEM WHILE THE WINDOW IS OPEN, as point 2
 * of a decision says. It dates from wave 13u round 14. Another decision says who may change
 * a message: its writer, its words only, and only within the edit window after it went out.
 *
 * `EditedMark` draws "edited" in a message's foot when the message carries an edit mark, and one press shows the words
 * as first written under the foot. `EditPress` draws Edit on the reader's own message until the time the server sent
 * (`wordsMayChangeUntil`), and goes away at that time by a timer of its own. Saving goes through the record door, which
 * asks the window again and refuses after it; its refusal is shown in words beside the editor. After a save the chat
 * reads the conversation again, and the message comes back with its mark.
 */

import { useEffect, useState } from 'react'
import { t } from '@shared/i18n.ts'
import type { MessageEdited } from '@shared/messages.ts'
import type { AMarkedPart } from '@shared/intent-mark.ts'
import { drawnStamp, localStamp } from '@shared/time.ts'
import { api, errorMessage } from '../api.ts'
import { markedPartsAfterATypedChange } from '../lib/marking-the-words.ts'

/** The rules for both, put on the page once by whichever is drawn first. */
function TheStyle(): React.ReactElement {
  return (
    <style href="mole-office-chat-edited" precedence="default">
      {CHAT_EDITED_CSS}
    </style>
  )
}

/** "edited", and one press away the words as first written. Nothing when the words were never changed. */
export function EditedMark({ edited }: { edited: MessageEdited | null }): React.ReactElement | null {
  const [open, setOpen] = useState(false)
  if (edited === null) return null
  const at = drawnStamp(edited.at)
  return (
    <>
      <TheStyle />
      <button
        type="button"
        className="px-chat-edited"
        aria-expanded={open}
        title={t('chat.edited.when', { at })}
        onClick={() => {
          setOpen(!open)
        }}
      >
        {t('chat.edited.mark')}
      </button>
      {open ? (
        <span className="px-chat-original">
          <span className="px-chat-original-head">{t('chat.edited.firstWritten', { at })}</span>
          <span className="px-chat-original-words">{edited.original.body ?? t('chat.edited.noOriginal')}</span>
        </span>
      ) : null}
    </>
  )
}

/** Whether the window is still open now. A time the browser cannot read is a closed window. */
function stillOpen(until: string | null): boolean {
  if (until === null) return false
  const ends = Date.parse(until)
  return Number.isFinite(ends) && Date.now() < ends
}

/**
 * Edit, on the reader's own message while the window is open. `onSaved` is asked after the record door took the new
 * words, so the conversation is read again.
 */
export function EditPress({
  id,
  body,
  markedParts = [],
  until,
  onSaved,
}: {
  id: string
  body: string
  markedParts?: readonly AMarkedPart[]
  until: string | null
  onSaved: () => void
}): React.ReactElement | null {
  const [open, setOpen] = useState(stillOpen(until))
  const [editing, setEditing] = useState(false)
  const [words, setWords] = useState(body)
  const [parts, setParts] = useState<readonly AMarkedPart[]>(markedParts)
  const [partsIntact, setPartsIntact] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)

  // THE PRESS GOES AWAY WHEN THE WINDOW CLOSES, by one timer for this message. An editor already open stays, so the
  // writer's words are not lost; the record door answers its save.
  useEffect(() => {
    setOpen(stillOpen(until))
    if (until === null) return
    const left = Date.parse(until) - Date.now()
    if (!Number.isFinite(left) || left <= 0) return
    const timer = setTimeout(() => {
      setOpen(false)
    }, left + 50)
    return () => {
      clearTimeout(timer)
    }
  }, [until])

  if (!open && !editing) return null
  const ends = until === null ? '' : drawnStamp(localStamp(new Date(until)))
  if (!editing) {
    return (
      <>
        <TheStyle />
        <button
          type="button"
          className="px-chat-edit"
          title={t('chat.edit.until', { at: ends })}
          onClick={() => {
            setWords(body)
            setParts(markedParts)
            setPartsIntact(true)
            setRefused(null)
            setEditing(true)
          }}
        >
          {t('chat.edit.press')}
        </button>
      </>
    )
  }
  return (
    <span className="px-chat-editor">
      <TheStyle />
      <textarea
        className="px-chat-editor-words"
        aria-label={t('chat.edit.wordsLabel')}
        value={words}
        rows={Math.min(8, Math.max(2, words.split('\n').length))}
        onChange={(event) => {
          const next = event.target.value
          const moved = partsIntact ? markedPartsAfterATypedChange(words, next, parts) : markedPartsAfterATypedChange(body, next, markedParts)
          setParts(moved.kept)
          setPartsIntact(moved.dropped.length === 0 && (partsIntact || moved.kept.length === markedParts.length))
          setWords(next)
        }}
      />
      <span className="px-chat-editor-presses">
        <button
          type="button"
          className="px-btn px-chat-editor-save"
          data-size="sm"
          data-variant="primary"
          disabled={saving || words.trim() === '' || words === body}
          onClick={() => {
            setSaving(true)
            setRefused(null)
            const movedParts = parts.map(({ from, to, quote, intent, label }) => ({ from, to, quote, ...(intent === undefined ? {} : { intent }), ...(label === undefined ? {} : { label }) }))
            api.rewriteAnnotation(id, words, partsIntact && parts.length > 0 && parts.some((part, i) => part.from !== markedParts[i]?.from || part.to !== markedParts[i]?.to) ? movedParts : undefined).then(
              () => {
                setSaving(false)
                setEditing(false)
                onSaved()
              },
              (err: unknown) => {
                setSaving(false)
                setRefused(errorMessage(err))
              },
            )
          }}
        >
          {saving ? t('chat.edit.saving') : t('chat.edit.save')}
        </button>
        <button
          type="button"
          className="px-btn px-chat-editor-cancel"
          data-size="sm"
          disabled={saving}
          onClick={() => {
            setEditing(false)
            setRefused(null)
          }}
        >
          {t('chat.edit.cancel')}
        </button>
        {open ? <span className="px-chat-editor-until">{t('chat.edit.until', { at: ends })}</span> : null}
      </span>
      {refused === null ? null : (
        <span className="px-chat-editor-refused" role="alert">
          {refused}
        </span>
      )}
    </span>
  )
}

export const CHAT_EDITED_CSS = `
.px-chat-edited, .px-chat-edit {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 0.85em;
  color: var(--text-2);
  text-decoration: underline dotted;
  cursor: pointer;
}
.px-chat-edited[aria-expanded='true'] { color: var(--text); }
.px-chat-original, .px-chat-editor {
  flex-basis: 100%;
  display: grid;
  gap: 0.2rem;
  min-width: 0;
  text-align: start;
  overflow-wrap: anywhere;
}
.px-chat-original {
  padding: 0.3rem 0.5rem;
  border-inline-start: 0.2rem solid var(--text-2);
  background: var(--panel-2);
  border-radius: var(--radius-sm);
}
.px-chat-original-head, .px-chat-editor-until { color: var(--text-2); font-size: 0.85em; }
.px-chat-original-words { white-space: pre-wrap; color: var(--text); }
.px-chat-editor-words { width: 100%; box-sizing: border-box; font: inherit; resize: vertical; }
.px-chat-editor-presses { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
.px-chat-editor-refused { color: var(--st-overdue, var(--text)); font-size: 0.9em; }
`
