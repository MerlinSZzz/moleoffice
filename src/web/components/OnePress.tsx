// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REQUEST FOR ONE PRESS, ON ANY PAGE AND ON HOME. Wave 13n round 45.
 *
 * An agent asks the person to agree to one act the office already knows (src/server/lib/one-press.ts). While one
 * waits, a small popup shows on every page: who asked, the one sentence the office wrote for the act, and the two
 * presses. Home's Needs you draws the same request with the same presses (`OnePressCard`), from the same reading, so
 * the number and the rows agree. The agent's own words are shown only in Developer mode.
 *
 * WHERE IT SITS. At the bottom right, above the corner chat button and above the lead card (Leading.tsx) when that is
 * open, so neither covers the other (agreed with wave 13k). Its bottom edge is measured from the lead card, so the
 * two cannot drift. "Not now" folds it into one line until another request comes, so it never covers the page's own
 * controls for longer than the person needs to read it.
 *
 * AFTER THE PRESS the popup says what was done, or why it could not be, until the person closes it. A press made on
 * Home is said here too: both surfaces write the answer into one small store below.
 */
import { content, t } from '@shared/i18n.ts'
import { ONE_PRESS_REQUEST } from '@shared/one-press.ts'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { api, errorMessage, getActor } from '../api.ts'
import type { AOnePressRequest } from '../../server/lib/one-press.ts'
import { useChannel, whenEventsWereLost } from '../lib/channel.ts'
import { useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'
import { thePersonIsLooking } from '../lib/residents.ts'
import type { WaitingItem, WaitingReply } from '../lib/waiting.ts'
import { Btn, type AsyncState } from './ui.tsx'

/** A waiting row that is a request for one press, with what the popup draws. */
export type AOnePressRow = WaitingItem & { theOnePress: NonNullable<WaitingItem['theOnePress']> }

/** The requests for one press in the waiting reading, oldest first, as the reading orders them. */
export function theOnePressRows(waiting: AsyncState<WaitingReply>): AOnePressRow[] {
  if (waiting.status !== 'ready') return []
  return waiting.value.items.filter((item): item is AOnePressRow => item.kind === ONE_PRESS_REQUEST && item.theOnePress !== undefined)
}

// ============================================================================ what a press did, said once

/** What one press did: the request as the office answered it, or why the press did not reach it. */
export type APressAnswered = { request: AOnePressRequest } | { id: string; failed: string }

let lastAnswer: APressAnswered | null = null
const listeners = new Set<() => void>()
function sayTheAnswer(answer: APressAnswered | null): void {
  lastAnswer = answer
  for (const one of listeners) one()
}
function useTheLastAnswer(): APressAnswered | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => lastAnswer,
    () => lastAnswer,
  )
}

/** The sentence after a press, in the person's language, from what the office answered. */
export function whatThePressDid(answer: APressAnswered): string {
  if ('failed' in answer) return t('onePress.failed', { why: answer.failed })
  const { request } = answer
  if (request.state === 'done') return t('onePress.done', { outcome: request.outcome ?? '' })
  if (request.state === 'could-not') return t('onePress.couldNot', { outcome: request.outcome ?? '' })
  return t('onePress.refused')
}

// ============================================================================ one request

/** One request: who asked, the sentence, the agent's words in Developer mode, and for the person the two presses. */
export function OnePressCard({ row, onAnswered }: { row: AOnePressRow; onAnswered?: () => void }) {
  useLanguage()
  const inspect = useInspect()
  const [busy, setBusy] = useState(false)
  const thePerson = thePersonIsLooking(getActor())
  const asker = row.theOnePress.askedByHandle ?? t('onePress.anAgent')
  const press = (run: (id: string) => Promise<{ request: AOnePressRequest }>): void => {
    setBusy(true)
    run(row.id)
      .then((answered) => sayTheAnswer({ request: answered.request }))
      .catch((err: unknown) => sayTheAnswer({ id: row.id, failed: errorMessage(err) }))
      .finally(() => {
        setBusy(false)
        onAnswered?.()
      })
  }
  return (
    <div className="one-press-card" data-one-press={row.id}>
      <style href="mole-office-one-press" precedence="default">
        {ONE_PRESS_CSS}
      </style>
      <p className="one-press-who">{t('onePress.asks', { agent: content(asker) })}</p>
      <p className="one-press-shows">{content(row.theOnePress.shows)}</p>
      {inspect && row.theOnePress.because !== null ? (
        <p className="one-press-because">{t('onePress.theAgentSays', { because: content(row.theOnePress.because) })}</p>
      ) : null}
      {thePerson ? (
        <div className="one-press-presses">
          <Btn variant="primary" size="sm" pending={busy} onClick={() => press(api.agreeToARequest)}>
            {t('onePress.agree')}
          </Btn>
          <Btn size="sm" pending={busy} onClick={() => press(api.refuseARequest)}>
            {t('onePress.refuse')}
          </Btn>
        </div>
      ) : (
        <p className="one-press-only">{t('onePress.onlyThePerson')}</p>
      )}
    </div>
  )
}

// ============================================================================ the popup

/** The popup on every page. The shell hands it the one waiting reading and the way to read it again. */
export function OnePressPopup({ waiting, readWaitingAgain }: { waiting: AsyncState<WaitingReply>; readWaitingAgain: () => void }) {
  useLanguage()
  const rows = theOnePressRows(waiting)
  const answer = useTheLastAnswer()
  // FOLDED UNTIL ANOTHER REQUEST COMES: the newest id seen when the person pressed Not now.
  const [foldedAt, setFoldedAt] = useState<string | null>(null)
  const newest = rows.length === 0 ? null : (rows[rows.length - 1]?.id ?? null)
  const folded = foldedAt !== null && foldedAt === newest

  // READ AGAIN WHEN THE OFFICE SAYS A REQUEST WAS FILED, ANSWERED OR WITHDRAWN, and once when events were lost.
  useChannel(
    useCallback(
      (event) => {
        if (event.name === 'list.changed' && event.lists.includes('needsYou')) readWaitingAgain()
      },
      [readWaitingAgain],
    ),
    ONE_PRESS_HEARS,
  )
  useEffect(() => whenEventsWereLost(readWaitingAgain), [readWaitingAgain])

  const bottom = useTheRoomAboveTheLeadCard()
  const first = rows[0]
  const aside = useRef<HTMLElement>(null)
  useTheRoomAtThePageFoot(aside, answer === null && first === undefined ? null : `${String(answer !== null)}:${first?.id ?? ''}:${folded ? 'folded' : 'open'}:${bottom}`)
  if (answer === null && first === undefined) return null
  return (
    <aside ref={aside} className="one-press" aria-label={t('onePress.label')} style={{ bottom }} data-folded={folded ? 'yes' : 'no'}>
      <style href="mole-office-one-press" precedence="default">
        {ONE_PRESS_CSS}
      </style>
      {answer !== null ? (
        <div className="one-press-card one-press-after" role="status">
          <p className="one-press-shows">{whatThePressDid(answer)}</p>
          <div className="one-press-presses">
            <Btn size="sm" onClick={() => sayTheAnswer(null)}>
              {t('onePress.close')}
            </Btn>
          </div>
        </div>
      ) : null}
      {first === undefined || answer !== null ? null : folded ? (
        <button type="button" className="one-press-folded" onClick={() => setFoldedAt(null)}>
          {t('onePress.folded', { n: rows.length })}
        </button>
      ) : (
        <div className="one-press-one">
          <OnePressCard row={first} onAnswered={readWaitingAgain} />
          <div className="one-press-foot">
            {rows.length > 1 ? <span className="one-press-more">{t('onePress.more', { n: rows.length - 1 })}</span> : null}
            <button type="button" className="one-press-not-now" onClick={() => setFoldedAt(newest)}>
              {t('onePress.notNow')}
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}

const ONE_PRESS_HEARS = ['list.changed'] as const

/**
 * THE POPUP'S HEIGHT IS ROOM AT THE PAGE'S FOOT. The request is fixed over the corner of the page, and a page's last
 * line was drawn under it. Its top edge is measured from the window's foot whenever its words, its folded state or the
 * lead card's height changes, and the shell keeps that much room under the page.
 */
function useTheRoomAtThePageFoot(aside: { current: HTMLElement | null }, whatIsDrawn: string | null): void {
  useLayoutEffect(() => {
    const root = document.documentElement
    const node = aside.current
    if (node === null) { root.style.removeProperty('--one-press-room'); return }
    const measure = (): void => {
      root.style.setProperty('--one-press-room', `${String(Math.ceil(window.innerHeight - node.getBoundingClientRect().top))}px`)
    }
    measure()
    const sizes = new ResizeObserver(measure)
    sizes.observe(node)
    window.addEventListener('resize', measure)
    return () => {
      sizes.disconnect()
      window.removeEventListener('resize', measure)
      root.style.removeProperty('--one-press-room')
    }
  }, [aside, whatIsDrawn])
}

/**
 * THE POPUP'S BOTTOM EDGE: above the corner chat button, and above the lead card when that is open. The lead card's
 * own box is measured, so whatever it grows to, the popup starts above it.
 */
function useTheRoomAboveTheLeadCard(): string {
  const [leadHeight, setLeadHeight] = useState(0)
  useEffect(() => {
    let watched: Element | null = null
    const sizes = new ResizeObserver(() => setLeadHeight(watched?.getBoundingClientRect().height ?? 0))
    const look = (): void => {
      const lead = document.querySelector('.px-lead-here')
      if (lead === watched) return
      if (watched !== null) sizes.unobserve(watched)
      watched = lead
      if (lead !== null) sizes.observe(lead)
      setLeadHeight(lead?.getBoundingClientRect().height ?? 0)
    }
    look()
    const appears = new MutationObserver(look)
    appears.observe(document.body, { childList: true, subtree: true })
    return () => {
      appears.disconnect()
      sizes.disconnect()
    }
  }, [])
  // 5rem clears the chat button (Leading.tsx says why); the lead card sits there, so the popup goes 0.5rem above it.
  return leadHeight > 0 ? `calc(5rem + ${String(Math.ceil(leadHeight))}px + 0.5rem)` : '5rem'
}

const ONE_PRESS_CSS = `
.one-press {
  position: fixed;
  right: var(--fab-inset);
  z-index: var(--z-drawer);
  width: min(22rem, calc(100vw - 2 * var(--fab-inset)));
  max-height: min(60dvh, calc(100dvh - 6rem));
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.one-press[data-folded='yes'] { width: auto; max-width: calc(100vw - 2 * var(--fab-inset)); }
.one-press-one,
.one-press-after {
  background: var(--panel);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius);
  padding: var(--pad);
  box-shadow: var(--elev-2);
}
.one-press-card { display: flex; flex-direction: column; gap: 0.4rem; }
.one-press-who { margin: 0; font-size: var(--fs-1); color: var(--text-2); }
.one-press-shows { margin: 0; font-size: var(--fs-2); color: var(--text); overflow-wrap: anywhere; }
.one-press-because { margin: 0; font-size: var(--fs-1); color: var(--text-2); overflow-wrap: anywhere; }
.one-press-only { margin: 0; font-size: var(--fs-1); color: var(--text-2); }
.one-press-presses { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.one-press-foot { display: flex; align-items: center; justify-content: flex-end; gap: 0.5rem; margin-top: 0.4rem; }
.one-press-more { margin-right: auto; font-size: var(--fs-1); color: var(--text-2); }
.one-press-not-now,
.one-press-folded {
  font: inherit;
  font-size: var(--fs-1);
  color: var(--text);
  background: var(--panel);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius);
  padding: 0.25rem 0.6rem;
  cursor: pointer;
}
.one-press-folded { box-shadow: var(--elev-2); align-self: flex-end; }
.one-press-not-now { background: transparent; border-color: transparent; text-decoration: underline; }
/* ON A PHONE the popup is the window's width less the two insets, the same as the chat panel's edge. */
@media (max-width: 40rem) {
  .one-press { left: var(--fab-inset); width: auto; }
  .one-press[data-folded='yes'] { left: auto; }
}
`
