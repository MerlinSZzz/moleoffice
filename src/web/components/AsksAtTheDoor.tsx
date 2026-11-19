// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { content, t } from '@shared/i18n.ts'
import { cardWord } from '@shared/card-words.ts'
/**
 * AN AGENT AT THE DOOR, ASKING TO COME IN OR FOR A CARD, WITH THE PERSON'S PRESS RIGHT THERE.
 * Problem NXEhOBumu5ZZ.
 *
 * An agent that registered itself waits for the person's press. The office once counted the ask in
 * the number of what waits on them and drew it nowhere they look, so the first step of a new person's
 * first agent failed without a word. The Embassy draws these rows (EmbassyPage.tsx), and so does
 * DecisionQueue.tsx. Home's Needs you draws one row per ask instead, and that row opens the ask's own
 * page, where `ThePressOnAnAsk` in TheirCard.tsx draws the press.
 *
 * WHERE THE ROWS COME FROM. The one reading of what is waiting on the person, GET /api/waiting, which
 * App.tsx fetches once. A row is drawn for every item that carries `thePress`, and for nothing else,
 * so the band's number and these rows cannot disagree about which asks are waiting.
 *
 * THE PRESS IS THE OFFICE'S OWN. `TheCardAsk` in TheirCard.tsx draws it, from the same reading the
 * ask's own page draws it from, and sends it to the project the ask was filed in, because these pages
 * draw asks from every project. After the press the row stays where it was and says what the press
 * did, and what an admitted agent can do now, in `whatThePressDid`'s words. Then the page reads the
 * waiting list again.
 */
import { useRef, useState } from 'react'
import { useInspect } from '../lib/mode.ts'
import { useLanguage } from '../lib/language.ts'
import type { WaitingItem, WaitingReply } from '../lib/waiting.ts'
import type { WhatAnAskShows } from '@shared/profile.ts'
import { TheAskItself, TheCardAsk, whatThePressDid } from './TheirCard.tsx'
import { Absence } from './ui.tsx'

/** A waiting item that carries the person's press: a card ask, a new-key ask or a self-registration. */
export type AnAskAtTheDoor = WaitingItem & { thePress: NonNullable<WaitingItem['thePress']> }

/** The asks in one waiting reply, in the order the server sent them. */
export function asksAtTheDoor(reply: WaitingReply): AnAskAtTheDoor[] {
  return reply.items.filter((item): item is AnAskAtTheDoor => item.thePress !== undefined)
}

/** What one press did, as the row says it afterwards. */
type Answered = 'grant' | 'refuse'

/**
 * EVERY ASK IN THE READING, AND EVERY ONE ANSWERED HERE SINCE THE PAGE OPENED. An answered ask leaves
 * the waiting list when it is read again, and its row stays, saying what the press did, so nothing on
 * the page jumps away from under the person's hand.
 */
export function AsksAtTheDoor({
  reply,
  onAnswered,
}: {
  reply: WaitingReply
  /** Called after a press, once the server has answered it, so the page reads what is waiting again. */
  onAnswered: () => void
}) {
  useLanguage()
  const waiting = asksAtTheDoor(reply)
  const [answered, setAnswered] = useState<ReadonlyMap<string, { ask: AnAskAtTheDoor; did: Answered }>>(new Map())
  // THE ORDER A ROW WAS FIRST SEEN IN, so an answered row keeps its place when the list is read again.
  const order = useRef<string[]>([])
  for (const ask of waiting) if (!order.current.includes(ask.id)) order.current.push(ask.id)
  const byId = new Map(waiting.map((ask) => [ask.id, ask] as const))
  const rows = order.current.flatMap((id): { ask: AnAskAtTheDoor; did: Answered | null }[] => {
    const done = answered.get(id)
    if (done !== undefined) return [done]
    const ask = byId.get(id)
    return ask === undefined ? [] : [{ ask, did: null }]
  })
  if (rows.length === 0) return null
  return (
    <ul className="door-asks" aria-label={t('doorAsks.list')}>
      <style href="mole-office-asks-at-the-door" precedence="default">
        {ASKS_AT_THE_DOOR_CSS}
      </style>
      {rows.map((row) => (
        <AskAtTheDoor
          key={row.ask.id}
          ask={row.ask}
          did={row.did}
          onPressed={(did) => {
            setAnswered((was) => new Map(was).set(row.ask.id, { ask: row.ask, did }))
            onAnswered()
          }}
        />
      ))}
    </ul>
  )
}

function AskAtTheDoor({
  ask,
  did,
  onPressed,
}: {
  ask: AnAskAtTheDoor
  /** Which press answered this ask here, or null while it waits. */
  did: Answered | null
  onPressed: (did: Answered) => void
}) {
  const inspect = useInspect()
  const press = ask.thePress
  return (
    <li className="door-ask" data-door-ask={press.handle} data-answered={did === null ? 'no' : did}>
      <div className="door-ask-top">
        <span className="door-ask-who">{content(press.handle)}</span>
        <span className="door-ask-key">{t('doorAsks.card')}</span>
        <span className="door-ask-value" data-fact="card">{cardWord(press.asking)}</span>
      </div>
      <div className="door-ask-where">
        <span className="door-ask-key">{t('doorAsks.from')}</span>
        <span className="door-ask-value" data-fact="from-where">
          {ask.theAsk === undefined ? <Absence /> : fromWhereWords(ask.theAsk.fromWhere)}
        </span>
        <span className="door-ask-key">{t('doorAsks.project')}</span>
        <span className="door-ask-value" data-fact="project">
          {ask.workspaceTitle !== null ? content(ask.workspaceTitle) : inspect ? content(ask.workspaceId) : <Absence />}
        </span>
      </div>
      {/* THE WHOLE SENTENCE OF WHERE IT CAME FROM, in developer mode only: it holds the connection's
          address and the session the ask named. TheAskItself draws it. */}
      {inspect && ask.theAsk !== undefined ? <TheAskItself shows={ask.theAsk} /> : null}
      {did !== null ? (
        <p className="door-ask-done" role="status">
          {whatThePressDid(press, did)}
        </p>
      ) : (
        <TheCardAsk
          ask={press}
          project={ask.workspaceId}
          onChanged={onPressed}
        />
      )}
    </li>
  )
}

/** Which computer the ask came from, in the page's words. The fact is the server's. */
function fromWhereWords(where: WhatAnAskShows['fromWhere']): string {
  switch (where) {
    case 'this computer':
      return t('doorAsks.from.thisComputer')
    case 'another computer':
      return t('doorAsks.from.anotherComputer')
    case 'inside the office':
      return t('doorAsks.from.insideTheOffice')
    case 'not recorded':
      return t('doorAsks.from.notRecorded')
  }
}

/**
 * One row per ask, with the press under its facts. A label above a value wraps as one piece at 390.
 * No backtick in this string.
 */
const ASKS_AT_THE_DOOR_CSS = `
.door-asks { list-style: none; margin: 0 0 var(--pad); padding: 0; display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.door-ask {
  display: flex; flex-direction: column; gap: 6px; min-width: 0;
  padding: var(--pad);
  border-left: var(--rail) solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--hover);
}
.door-ask:not([data-answered='no']) { border-left-color: var(--border-strong); }
.door-ask-top, .door-ask-where { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; min-width: 0; }
.door-ask-who { font-size: var(--fs-3); font-weight: 700; color: var(--text); overflow-wrap: anywhere; }
.door-ask-key {
  font-size: var(--fs-1); font-weight: 600; color: var(--text-3);
  letter-spacing: .06em; text-transform: uppercase;
}
.door-ask-value { font-size: var(--fs-2); color: var(--text-2); overflow-wrap: anywhere; }
.door-ask-done { margin: 0; max-width: var(--measure-in-box); color: var(--text); font: var(--fs-2)/var(--lh-read) var(--font-ui); }
`
