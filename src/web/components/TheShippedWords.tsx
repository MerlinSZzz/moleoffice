// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useState } from 'react'
import { t } from '@shared/i18n.ts'
import type { ACardWord } from '@shared/roles.ts'
import type { ACardsShippedWords, AWordThatDiffers, TheShippedWords as TheReply } from '@shared/the-shipped-words.ts'
import { errorMessage, faultOf, json, request, type Fault } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { ParticipantName } from '../pages/NotebookPage.tsx'
import { titleHere } from './sections.ts'
import { Btn, ErrorNote, Stamp, useAsync } from './ui.tsx'
/**
 * A ROLE CARD'S SHIPPED WORDS BESIDE THE OFFICE'S WORDS, AND THE PRESS THAT COPIES THEM. The Role cards page draws
 * this in each shipped card's block, under the link to its words record.
 *
 * The office copied each card's words from the shipped file into a record once, and nothing copies a later change
 * of that file. So for each field where the two differ this draws both texts side by side and where the office's
 * text came from: the copy, a change somebody made here after it, or a history that cannot say. The press is
 * offered only where a field differs, and it is warned before it where it would write over a change or over a text
 * nobody can trace. The server's reply decides all of it (src/server/lib/card-words.ts); this only draws it.
 *
 * THE PRESS NAMES THE VERSION THIS READ, so a change made after the read is refused rather than written over.
 */

/** What the last press here answered: the fields it copied, or the server's refusal in its own words. */
export type ThePressAnswered = { copied: ACardWord[] } | { message: string; fault: Fault | null }

/** The pages that draw a card's words, told when a press here changed them. */
const listeners = new Set<() => void>()

/** Calls `listener` after every press here that copied a card's words. Returns what stops it. */
export function whenACardsShippedWordsAreCopied(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** One card's difference, read from the server, and its press. Draws nothing while the read is out. */
export function TheShippedWords({ role }: { role: string }) {
  useLanguage()
  const [reply, readAgain] = useAsync(() => request<TheReply>(`/api/roles/shipped-words?role=${encodeURIComponent(role)}`), [role])
  const [pressing, setPressing] = useState(false)
  const [answer, setAnswer] = useState<ThePressAnswered | null>(null)
  if (reply.status === 'loading') return null
  if (reply.status === 'error') return <ErrorNote message={reply.message} fault={reply.fault} />
  const card = reply.value.cards.find((one) => one.role === role)
  if (card === undefined) {
    throw new Error(`The office answered the shipped words of ${role} with no card of that name, so there is nothing to draw.`)
  }
  const press = (): void => {
    if (card.record === null) return
    setPressing(true)
    setAnswer(null)
    void request<{ copied: ACardWord[] }>('/api/roles/shipped-words/copy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: json({ role, ifVersion: card.record.version }),
    })
      .then((copied) => {
        setAnswer({ copied: copied.copied })
        for (const listener of listeners) listener()
      })
      .catch((err: unknown) => {
        setAnswer({ message: errorMessage(err), fault: faultOf(err) })
      })
      .finally(() => {
        setPressing(false)
        // READ AGAIN AFTER EITHER ANSWER: a refused press was most often refused because the record changed.
        readAgain()
      })
  }
  return <TheShippedWordsOfACard card={card} pressing={pressing} answer={answer} onPress={press} />
}

/** Where the office's text of one field came from, in words. */
function Came({ came }: { came: AWordThatDiffers['came'] }) {
  if (came.as === 'copied') {
    return <p className="tsw-came">{t('shippedWords.cameCopied')} <Stamp at={came.at} /></p>
  }
  if (came.as === 'unknown') return <p className="tsw-came tsw-came-warn">{t('shippedWords.cameUnknown')}</p>
  return (
    <p className="tsw-came tsw-came-warn">
      {came.by === null ? t('shippedWords.cameChangedByTheOffice') : <>{t('shippedWords.cameChangedBy')} <ParticipantName kind={came.by.kind} id={came.by.id} /></>}
      {came.onTheOwnersWords ? <>, {t('shippedWords.onTheOwnersWords')}</> : null} <Stamp at={came.at} />
    </p>
  )
}

/** One side of a field: its text, or a plain mark that this side has none. */
function Side({ side, text }: { side: 'office' | 'shipped'; text: string | null }) {
  return (
    <div className="tsw-side" data-side={side}>
      <h5 className="tsw-side-name">{t(side === 'office' ? 'shippedWords.office' : 'shippedWords.shipped')}</h5>
      {text === null ? <p className="tsw-none">{t('shippedWords.noText')}</p> : <p className="tsw-text">{text}</p>}
    </div>
  )
}

/**
 * ONE CARD, GIVEN WHAT WAS READ. Exported so a test draws it without a server: this half is a pure function of the
 * reply and of the last press's answer.
 */
export function TheShippedWordsOfACard({ card, pressing, answer, onPress }: { card: ACardsShippedWords; pressing: boolean; answer: ThePressAnswered | null; onPress: () => void }) {
  useLanguage()
  const said = answer === null ? null : 'copied' in answer
    ? <p className="tsw-done" role="status">{t('shippedWords.copiedNow')}</p>
    : <ErrorNote label={t('shippedWords.notCopied')} message={answer.message} fault={answer.fault} />
  if (card.differ.length === 0) {
    return (
      <section className="tsw" data-shipped-words={card.role}>
        <style href="mole-office-shipped-words" precedence="default">{CSS}</style>
        <p className="tsw-same" data-shipped-words-same="">{t('shippedWords.same')}</p>
        {said}
      </section>
    )
  }
  // A FIELD THAT IS NOT AS COPIED IS ONE THE PRESS WOULD WRITE OVER UNSEEN, unless the page says so before it.
  const overAChange = card.differ.some((one) => one.came.as !== 'copied')
  return (
    <section className="tsw" data-shipped-words={card.role}>
      <style href="mole-office-shipped-words" precedence="default">{CSS}</style>
      <h4 className="tsw-title" data-title-is="its-label">{t('shippedWords.title')}</h4>
      {card.differ.map((one) => (
        <div key={one.field} className="tsw-field" data-field={one.field} data-came={one.came.as}>
          <h5 className="tsw-field-name">{titleHere('role_card_words', one.field)}</h5>
          <Came came={one.came} />
          <div className="tsw-pair">
            <Side side="office" text={one.office} />
            <Side side="shipped" text={one.shipped} />
          </div>
        </div>
      ))}
      {overAChange ? <p className="tsw-warn" role="note" data-writes-over-a-change="">{t('shippedWords.writesOverAChange')}</p> : null}
      <div className="tsw-press" data-press-shipped-words="">
        <Btn variant="primary" size="sm" onClick={onPress} pending={pressing}>{t('shippedWords.press')}</Btn>
      </div>
      {said}
    </section>
  )
}

const CSS = `
.tsw { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; margin: 0; }
.tsw-title, .tsw-field-name, .tsw-side-name {
  margin: 0;
  font-size: var(--fs-1); font-weight: 600; color: var(--text-3);
  letter-spacing: .06em; text-transform: uppercase;
}
.tsw-same, .tsw-done { margin: 0; font-size: var(--fs-1); color: var(--text-2); }
.tsw-field {
  display: flex; flex-direction: column; gap: calc(var(--pad) / 2); min-width: 0;
  padding: var(--pad); border: var(--border-w) solid var(--border); border-radius: var(--radius-sm);
}
.tsw-came { margin: 0; font-size: var(--fs-1); color: var(--text-2); overflow-wrap: anywhere; }
.tsw-came-warn { color: var(--text); font-weight: 600; }
/* THE TWO TEXTS SIDE BY SIDE WHERE THERE IS ROOM, and one above the other in a narrow block. 9rem a side keeps them
   side by side in the narrow text column of a card at 1440, where the page draws the cards two to a row. */
.tsw-pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr)); gap: var(--pad); min-width: 0; }
.tsw-side { min-width: 0; }
.tsw-text, .tsw-none { margin: 0; font-size: var(--fs-2); line-height: var(--lh-read); color: var(--text); overflow-wrap: anywhere; white-space: pre-wrap; }
.tsw-none { color: var(--text-3); }
.tsw-warn {
  margin: 0; padding: var(--pad);
  border: var(--border-w) solid var(--ask-line); border-radius: var(--radius-sm);
  background: var(--ask-bg); color: var(--text); font-size: var(--fs-1); overflow-wrap: anywhere;
}
.tsw-press { display: flex; }
`
