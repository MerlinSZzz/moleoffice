// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON ABOUT TO SEND WHAT LOOKS LIKE A KEY IS ASKED ONCE. This answers problems __4iR4FkFAGS
 * and UioLZafhORc4.
 *
 * The office stores a message that seems to hold a key, and only reminds its writer (src/server/lib/message-keys.ts). A
 * person on a page is asked before the send instead, so the reminder comes while the words can still be changed. Every
 * page that sends words a person typed asks here, with the office's own reading (`whereAMessageHoldsAKey` over
 * `theWordsOfAMessage`), so a page cannot ask about other words than the office reminds about.
 *
 * ASKED ONCE. The question names what was seen, the piece's first four characters and its length, never the piece, and
 * offers two presses. Send anyway sends those same words with no second question. Change it closes the question; the page
 * may select the piece in its box. Typing in the box closes it too, and the next send asks again only if a piece is still
 * there.
 *
 * SEND ANYWAY SENDS WHAT WAS HELD WHEN THE QUESTION WAS ASKED, or nothing. A draft can change while its question stays open:
 * the chat's pictures are one row for every conversation, so a picture added in another conversation is in this draft too.
 * A page that can say what it holds now passes `howItChanged`; when that names a change, Send anyway sends nothing, the
 * question stays with one line saying in words what changed (different words, or how many pictures the box holds now), and
 * the newer draft stays in the box unsent.
 *
 * A PICTURE'S NAME IS ASKED ABOUT AS ITS WORDS ARE. A page sends a picture's file name as its alt text, and QQ and many
 * phones name a picture by a 32-character hash, which has the shape of a long key. The question says it is the picture's
 * name, so the person can tell it is not something they typed, and Send anyway sends it (problem UioLZafhORc4).
 */
import { useCallback, useRef, useState, type ReactElement } from 'react'
import { t } from '@shared/i18n.ts'
import { theKeyReminder, theWordsOfAMessage, whereAMessageHoldsAKey, type AKeyReminder } from '@shared/message-keys.ts'

/**
 * What a page is about to send: the words typed, the file names of the pictures with them, and for a comment the place it is
 * about, whose quoted words the office reads as it reads the body.
 */
export interface WhatIsAboutToBeSent {
  body: string
  pictureNames?: readonly string[]
  target?: unknown
}

/** How the draft in a box differs from the draft a question was asked about. */
export interface HowTheDraftChanged {
  /** The words in the box are not the words asked about. */
  words: boolean
  /** The pictures in the box are not the pictures asked about. */
  pictures: boolean
  /** How many pictures the box holds now. */
  picturesNow: number
  /** How many pictures the question was asked about. */
  picturesHeld: number
}

/** The question one box asks, or does not. */
export interface AKeyQuestion {
  /** What the question is about while it is drawn, or null. */
  asking: AKeyReminder | null
  /** What changed, when Send anyway was pressed and found a draft other than the one asked about, so it sent nothing. */
  draftChanged: HowTheDraftChanged | null
  /**
   * Whether this send waits for the person. True draws the question and sends nothing; `sendAnyway` is what Send anyway
   * does, and it sends what was held at this asking. `howItChanged` says how the box differs from that, or null when it
   * does not; without it,
   * the page promises that nothing but typing can change what it holds, and typing closes the question. False means
   * nothing looks like a key, any question still open in this box is closed, and the page sends at once.
   */
  stopsTheSend(about: WhatIsAboutToBeSent, sendAnyway: () => void, howItChanged?: () => HowTheDraftChanged | null): boolean
  /** Send what the question was asked about and close it, as Send anyway does; or, when the draft changed, send nothing. */
  sendAnyway(): void
  /** Close the question without sending, as Change it and typing in the box do. */
  close(): void
}

/** What looks like a key in what a page is about to send, as the office reads it, or null. */
export function aKeyAboutToBeSent(about: WhatIsAboutToBeSent): AKeyReminder | null {
  const data = { body: about.body, pictures: (about.pictureNames ?? []).map((alt) => ({ alt })), target: about.target }
  const found = whereAMessageHoldsAKey(theWordsOfAMessage({ data }))
  return found === null ? null : theKeyReminder(found, false)
}

/** The key of a page that has one box, and so one question. */
const ONE_BOX = ''

/**
 * One box's question. A box that holds a draft for each conversation names the draft it shows in `belongsTo`; each draft
 * keeps its own question, so opening another conversation hides the question and coming back shows it again while that
 * draft still waits (problem wk1JsoK6mdGQ). Send anyway sends what that draft's send was about, to whom it was about.
 */
export function useAKeyQuestion(belongsTo: string | null = ONE_BOX): AKeyQuestion {
  const here = belongsTo ?? ONE_BOX
  const [questions, setQuestions] = useState<Record<string, { seen: AKeyReminder; draftChanged: HowTheDraftChanged | null }>>({})
  const thenSend = useRef<Record<string, { send: () => void; howItChanged?: () => HowTheDraftChanged | null }>>({})
  const forget = useCallback((key: string): void => {
    delete thenSend.current[key]
    setQuestions((now) => {
      if (!(key in now)) return now
      const { [key]: _gone, ...rest } = now
      return rest
    })
  }, [])
  const stopsTheSend = useCallback((about: WhatIsAboutToBeSent, sendAnyway: () => void, howItChanged?: () => HowTheDraftChanged | null): boolean => {
    const seen = aKeyAboutToBeSent(about)
    if (seen === null) {
      forget(here)
      return false
    }
    thenSend.current[here] = { send: sendAnyway, howItChanged }
    setQuestions((now) => ({ ...now, [here]: { seen, draftChanged: null } }))
    return true
  }, [forget, here])
  const close = useCallback((): void => forget(here), [forget, here])
  const sendAnyway = useCallback((): void => {
    const held = thenSend.current[here]
    if (held === undefined) return
    const changed = held.howItChanged?.() ?? null
    if (changed !== null) {
      setQuestions((now) => {
        const open = now[here]
        return open === undefined ? now : { ...now, [here]: { seen: open.seen, draftChanged: changed } }
      })
      return
    }
    forget(here)
    held.send()
  }, [forget, here])
  const question = questions[here]
  return { asking: question?.seen ?? null, draftChanged: question?.draftChanged ?? null, stopsTheSend, sendAnyway, close }
}

/** The words the question says, in the page's language. */
export function theKeyQuestionSays(asking: AKeyReminder): string {
  const values = { what: t(`w13w.keyQuestion.shape.${asking.shape}`), begins: asking.begins, n: asking.n }
  return asking.where.endsWith('.alt') ? t('w13w.keyQuestion.inAPictureName', values) : t('w13w.keyQuestion.inTheWords', values)
}

/**
 * The line that says a draft changed and what changed in it: different words, or how many pictures the box holds now. Two
 * pictures that took the place of two others are "different pictures", since their number did not change.
 */
export function theDraftChangeSays(change: HowTheDraftChanged): string {
  const n = change.picturesNow
  const andWords = change.words
  if (!change.pictures) return t('w13w.keyQuestion.changed.words')
  if (n === 0) return t(andWords ? 'w13w.keyQuestion.changed.noPicturesAndWords' : 'w13w.keyQuestion.changed.noPictures')
  if (n === change.picturesHeld) return t(andWords ? 'w13w.keyQuestion.changed.otherPicturesAndWords' : 'w13w.keyQuestion.changed.otherPictures', { n })
  return t(andWords ? 'w13w.keyQuestion.changed.picturesAndWords' : 'w13w.keyQuestion.changed.pictures', { n })
}

/**
 * The question, drawn where the page puts it, or nothing when nothing is asked. `onChangeIt` is called after the question
 * closes, with what was seen, so the page can select the piece in its box.
 */
export function KeyQuestion({ question, onChangeIt }: { question: AKeyQuestion; onChangeIt?: (seen: AKeyReminder) => void }): ReactElement | null {
  const { asking } = question
  if (asking === null) return null
  return (
    <div className="px-key-question" role="alertdialog" aria-live="polite" data-shape={asking.shape} data-where={asking.where}>
      <style href="mole-office-key-question" precedence="default">
        {KEY_QUESTION_CSS}
      </style>
      <p className="px-key-question-says">{theKeyQuestionSays(asking)}</p>
      {question.draftChanged !== null ? <p className="px-key-question-changed">{theDraftChangeSays(question.draftChanged)}</p> : null}
      <div className="px-key-question-acts">
        <button
          type="button"
          className="px-key-question-send"
          onClick={question.sendAnyway}
        >
          {t('w13w.keyQuestion.sendAnyway')}
        </button>
        <button
          type="button"
          className="px-key-question-change"
          onClick={() => {
            question.close()
            onChangeIt?.(asking)
          }}
        >
          {t('w13w.keyQuestion.changeIt')}
        </button>
      </div>
    </div>
  )
}

/**
 * The question's rules. Every value is a token, so a preset swap reaches it.
 *
 * NO BACKTICK ANYWHERE IN HERE, comments included: this is a template literal inside a .tsx file.
 */
const KEY_QUESTION_CSS = `
.px-key-question {
  display: flex; flex-direction: column; gap: 6px; min-width: 0;
  margin: 0 0 6px; padding: var(--pad);
  background: var(--panel-2); color: var(--text);
  border: var(--border-w) solid var(--ask); border-radius: var(--radius);
}
.px-key-question-says { margin: 0; font: var(--fs-1)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.px-key-question-changed { margin: 0; font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.px-key-question-acts { display: flex; flex-wrap: wrap; gap: 6px; }
.px-key-question-acts button {
  min-height: var(--row-h); padding: 0 var(--pad);
  font: var(--fs-1) var(--font-ui); color: var(--text);
  background: var(--panel); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius);
  cursor: pointer;
}
.px-key-question-acts .px-key-question-change { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
`
