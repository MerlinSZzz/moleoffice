// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT AN AGENT SAID ABOUT A PART OF THIS PAGE, DRAWN BESIDE THAT PART, WITH A BOX TO ANSWER IN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * The agent picks out a region
 * or a passage, shows its explanation on it, the person answers, and the agent carries on. That is
 * criterion M7 of design/messages/ACCEPTANCE.md, and this component is the drawing of it.
 *
 * ---------------------------------------------------------------------------------------
 * AN AGENT'S COMMENT IS A PERSON'S COMMENT, WITH NOTHING SPECIAL ABOUT EITHER
 * ---------------------------------------------------------------------------------------
 *
 * The owner also asked that commenting and choosing a semantic block not belong to people alone. So
 * nothing here is a second kind of comment. An agent writes a message with a target through the
 * same door a person's composer uses, meets the same refusals, and the mark layer draws its mark on the same thing. What this adds is
 * the words, the face and the name beside the place, and the box to answer in — which a person's
 * own comments do not have, because a person does not need to be told what they themselves said.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE CARD IS PUT, AND WHAT HAPPENS WHEN THE THING IS NOT ON THE PAGE
 * ---------------------------------------------------------------------------------------
 *
 * Under the element carrying the thing's key, measured in the document's own coordinates, so it
 * stays with the thing when the page scrolls without anything measuring again. THE PAGE MAKES ROOM
 * FOR IT: that element is given a bottom margin as tall as the card, so what the page draws next
 * starts below the card and the card covers nothing. `theElementTheCardHangsUnder` says why that
 * is the only placement now, and `measure` says how the room is made. A card on a whole record is
 * put at the top of the record page's second column instead, with that column's top padding as its
 * room, but only when that column stands beside the first and is at least as wide as the card;
 * otherwise it hangs under the head as before, with the bottom margin.
 *
 * A COMMENT WHOSE THING THIS PAGE IS NOT DRAWING GETS NO CARD, and that is the honest answer rather
 * than a card floating at the top saying nothing about where it belongs. The mark layer already
 * says what it can about a comment drawn somewhere else.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { targetKey, type Context } from '@shared/targets.ts'
import { SAID_HERE, participantKey, targetOfRecord } from '@shared/messages.ts'
import { t } from '@shared/i18n.ts'
import type { ParticipantKind, ParticipantRef } from '@shared/participants.ts'
import { api, errorMessage, type CommentOnThePage, type ParticipantOnTheWire } from '../../api.ts'
import { TextArea } from '../ui.tsx'
import { useProjectAsync } from '../../lib/project-async.ts'
// THE REGISTRIES ARE ONE READ FOR THE WHOLE PAGE. This panel used to ask for them itself, which was
// a fourth identical request beside Chat, Forced and Leading. See src/web/lib/oneread.ts.
import { readParticipantsOnce } from '../../lib/oneread.ts'
import { useRoute } from '../router.tsx'
import { Avatar } from '../Avatar.tsx'
import { KeyQuestion, useAKeyQuestion } from '../AKeyQuestion.tsx'
import { useMarks } from './marks.ts'
import { showMeThat } from './MarkLayer.tsx'
import { isTheRecordsOwnHead, quotedKey, theBlockDrawnFor, theSideColumnBeside } from './theblock.ts'
import { theLayerFor } from '../../lib/page-scroll.ts'

/** One agent's comment, and the answers to it, about one place on this page. */
export interface SaidHere {
  /** The key of the thing all of these are about, which is what the page draws the mark on. */
  key: string
  /** The stored context of the first thing said, which is what boxes the thing. */
  context: Context
  /** The record id of the first comment, which is what `showMeThat` lights. */
  firstId: string
  /** Who said the first thing. Always an agent: a person's own comments get no card. */
  agent: ParticipantRef
  /** Everything said about this place, oldest first. */
  said: { id: string; body: string; by: ParticipantRef | null }[]
}

/** Who a record says sent it, or null when nothing in either registry answered for the writer. */
function senderOf(record: CommentOnThePage): ParticipantRef | null {
  const held = record.data['sentBy']
  if (held === null || typeof held !== 'object' || Array.isArray(held)) return null
  const ref = held as { kind?: unknown; id?: unknown }
  if (ref.kind !== 'agent' && ref.kind !== 'person') return null
  if (typeof ref.id !== 'string' || ref.id === '') return null
  return { kind: ref.kind, id: ref.id }
}

/**
 * The agents' comments on one record, grouped by the thing each is about.
 *
 * A group is kept only when the FIRST thing said about that place came from an agent. A person's
 * own comment with an agent's answer under it belongs in the review pane, which is where a person
 * reads their own comments; this card is for being told something.
 */
export function whatAgentsSaidOn(recordId: string | null, comments: readonly CommentOnThePage[]): SaidHere[] {
  if (recordId === null) return []
  const byPlace = new Map<string, SaidHere>()
  /** Places where somebody other than an agent spoke first. They get no card, whatever comes after. */
  const notACard = new Set<string>()
  const order: string[] = []
  // OLDEST FIRST, WORKED OUT HERE AND NOT TAKEN FROM THE ROUTE'S ORDER. The
  // route answers newest first, so a card drew the second turn above the first, and "the first
  // thing said" below read the newest. Each comment carries `writtenOrder`, its place in the order
  // the office keeps for every conversation: the stamp, then the order the rows were stored in. A
  // stamp is kept to the second, and an id is random, so sorting by the stamp and then the id put a
  // same-second answer above its remark, and the place got no card (wave 13y round 29).
  const written = [...comments].sort((a, b) => a.writtenOrder - b.writtenOrder)
  for (const record of written) {
    const body = record.data['body']
    // WHAT IT IS ABOUT. A message that offers to take somebody somewhere AND says what it is about
    // gets a card beside that place like any other comment, because it is one; a message that only
    // offers is not a comment and is drawn by components/Leading.tsx instead.
    const context = targetOfRecord(record)
    if (typeof body !== 'string' || context === null) continue
    const whole = context as Context
    const inside = (whole.target as unknown as Record<string, unknown>)['recordId']
    if (inside !== recordId) continue
    const key = targetKey(whole.target)
    const by = senderOf(record)
    if (notACard.has(key)) continue
    const held = byPlace.get(key)
    if (held === undefined) {
      // THE FIRST THING SAID DECIDES WHETHER THERE IS A CARD AT ALL, and the place is remembered
      // either way: an agent's answer to a person's comment is not a card of its own.
      if (by === null || by.kind !== 'agent') {
        notACard.add(key)
        continue
      }
      byPlace.set(key, { key, context: whole, firstId: record.id, agent: by, said: [{ id: record.id, body, by }] })
      order.push(key)
      continue
    }
    held.said.push({ id: record.id, body, by })
  }
  return order.map((key) => byPlace.get(key)).filter((one): one is SaidHere => one !== undefined)
}

/**
 * THE MESSAGE AN ANSWER TYPED INTO THIS CARD IS ANSWERING.
 *
 * The last thing the agent said about this place, because that is what the person has just read.
 * Not the last thing SAID about it: that may be the person's own earlier answer, and nobody answers
 * themselves. The first thing the agent said stands in when it has said nothing since, which cannot
 * happen today — a card exists only where an agent spoke first — and is the honest answer if it
 * ever can.
 */
export function theAgentsLastWord(group: SaidHere): string {
  const mine = group.said.filter((one) => one.by !== null && one.by.kind === 'agent' && one.by.id === group.agent.id)
  return mine[mine.length - 1]?.id ?? group.firstId
}

/** Where one card goes, and what it is drawn in: the page's own box, or the document when that is null. */
interface CardPlace {
  top: number
  left: number
  layer: HTMLElement | null
}

/** True when two measurements put every card in the same place, drawn in the same thing. */
function sameWhere(a: Record<string, CardPlace>, b: Record<string, CardPlace>): boolean {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => b[key]?.top === a[key]?.top && b[key]?.left === a[key]?.left && b[key]?.layer === a[key]?.layer)
}

/** The space left between the thing, the card, and whatever the page draws next. */
const GAP = 8

/**
 * WHY THE CARD IS NOT PUT BESIDE THE THING ANY MORE.
 *
 * It used to go to the right of the thing when the window looked wide enough, and under it
 * otherwise. Both branches covered the page's own words. A block of a report is as wide as the
 * page, so the right-hand branch never ran on a report; and a passage of words inside a paragraph
 * IS narrow enough for it to run, and then the card sat on the rest of that paragraph. Under the
 * thing was worse: the space under a block is the next block, and the card hid its heading and the
 * left of three of its lines. Measured at 1440, 990, 660 and 390 in both themes on 4 September
 * 2026: every one of the five cards on one report covered between 3,400 and 84,500 square pixels of
 * report text. Problem `wj_-d8h0PAOM`.
 *
 * So there is one placement now: under the thing, in room the page makes for it. `measure` below
 * puts a bottom margin the height of the card on this element, so what the page draws next starts
 * below the card instead of under it. A card on a whole record stands at the top of the record
 * page's second column instead, with that column's top padding as its room, but only when that
 * column stands beside the first and is at least as wide as the card; otherwise it hangs under the
 * head as before, with the bottom margin.
 *
 * WHICH ELEMENT THAT IS is `theBlockDrawnFor` in `theblock.ts`, which the circle carrying the count
 * asks the same question of. A card hanging under one element while the circle points at another
 * would be two answers to one question.
 */
const theElementTheCardHangsUnder = theBlockDrawnFor

/**
 * Where the card for this key goes, in the document's own coordinates, or in the page's own box when
 * the page scrolls in one (`theLayerFor` in src/web/lib/page-scroll.ts), so it scrolls with the thing.
 *
 * UNDER THE BLOCK'S LEFT EDGE, WHERE ITS WORDS START — except under the head that stands for a whole
 * record, where the card goes under the block's RIGHT edge, because that is where the count is drawn
 * and the words belong beside the number. `isTheRecordsOwnHead` says which, and
 * `wide` is the card's own measured width, so the two edges line up whatever the card holds.
 * There is a third place, which this function does not give: on a wide screen, a card on the whole
 * record stands at the top of the record page's second column, in `whereItStandsInTheColumn` below.
 */
function whereItIs(host: HTMLElement, wide: number): CardPlace | null {
  const box = host.getBoundingClientRect()
  if (box.width === 0 && box.height === 0) return null
  const left = isTheRecordsOwnHead(host) && wide > 0 ? box.right - wide : box.left
  const { layer, x, y } = theLayerFor(host)
  return { top: box.bottom + GAP + y, left: Math.max(8, left) + x, layer }
}

/**
 * Where a card on the whole record goes when it stands in the record page's second column, in the
 * same coordinates as `whereItIs`. `theSideColumnBeside` in `theblock.ts` says when that is.
 *
 * AT THE COLUMN'S OWN TOP, AGAINST ITS RIGHT EDGE. The room `measure` makes here is the column's top
 * padding, which leaves the column's top where it is, so the card does not move when the room is
 * made. The card's right edge is the column's right edge once `wide` is known. Before the card has
 * been drawn, `wide` is 0 and the card starts at the column's left edge, as `whereItIs` does.
 */
function whereItStandsInTheColumn(column: HTMLElement, wide: number): CardPlace {
  const box = column.getBoundingClientRect()
  const { layer, x, y } = theLayerFor(column)
  return { top: box.top + y, left: Math.max(8, wide > 0 ? box.right - wide : box.left) + x, layer }
}

export function AgentSaidHere() {
  const route = useRoute()
  const recordId = route.name === 'record' ? route.id : null
  const marks = useMarks()
  const read = marks.state === 'read' ? marks.comments : null
  /**
   * THE LAST READ IS KEPT WHILE THE NEXT ONE IS IN FLIGHT.
   *
   * The store answers "asking" while it re-reads, and it re-reads every time a comment is placed or
   * answered anywhere. Drawn straight from the store, every card would be taken off the page and put
   * back for a moment each time somebody said anything — and a card taken off the page loses what
   * the person had typed into it. This is not a fallback: it is the same rows the page was already
   * drawing, kept until newer ones arrive.
   */
  const [comments, setComments] = useState<readonly CommentOnThePage[]>([])
  useEffect(() => {
    if (read !== null) setComments(read)
  }, [read])
  const [who] = useProjectAsync(() => readParticipantsOnce(), [])
  const groups = useMemo(() => whatAgentsSaidOn(recordId, comments), [recordId, comments])
  /** Where each card goes, remeasured when the page changes shape. Empty until measured. */
  const [places, setPlaces] = useState<Record<string, CardPlace>>({})
  /**
   * THE ROOM MADE FOR EACH CARD, AND WHAT THE ELEMENT SAID BEFORE IT WAS MADE.
   *
   * For each element given room, the property that holds the room and that property's own value
   * before the room was made. The property is `style.marginBottom` on the element a card hangs
   * under, and `style.paddingTop` on the record page's second column when a card stands at its top.
   * The value is almost always the empty string, kept so the page can be put back exactly as it was
   * when the card goes.
   */
  const roomMade = useRef(new Map<HTMLElement, { property: 'marginBottom' | 'paddingTop'; was: string }>())

  const measure = useCallback(() => {
    const next: Record<string, CardPlace> = {}
    const hosts = new Map<string, { host: HTMLElement; column: HTMLElement | null }>()
    for (const group of groups) {
      const host = theElementTheCardHangsUnder(group.key)
      if (host === null) continue
      // HOW WIDE THIS CARD IS DRAWN, read off the card itself, so the card can be lined up with the
      // block's right edge where it hangs under a record's own head. Nought before one is drawn,
      // and the first measurement then places it at the left edge; the card's own watcher measures
      // again as soon as it has a size, which is the same two-pass shape the room below is made in.
      const drawn = document.querySelector(`.px-said[data-said-on="${quotedKey(group.key)}"]`)
      const wide = drawn === null ? 0 : drawn.getBoundingClientRect().width
      // THE SIDE COLUMN IS ASKED FOR ONCE, and that one answer gives both the card's place and where
      // the room is made, so the two cannot disagree.
      const column = theSideColumnBeside(host, wide)
      const at = column === null ? whereItIs(host, wide) : whereItStandsInTheColumn(column, wide)
      if (at === null) continue
      hosts.set(group.key, { host, column })
      next[group.key] = at
    }
    /**
     * THE PAGE MAKES ROOM FOR THE CARD, SO THE CARD COVERS NOTHING.
     *
     * The card is drawn over the page rather than in it, because it has to line up with something
     * the page's own components drew and this component cannot reach inside them. So the room it
     * needs is made the only other way there is, in one of two places. Where the card hangs under an
     * element, the room is a bottom margin on that element, as tall as the card and the gap either
     * side of it. What the page draws next then starts below the card instead of underneath it.
     *
     * WHERE THE CARD STANDS AT THE TOP OF THE RECORD PAGE'S SECOND COLUMN, the room is that column's
     * own top padding, as tall as the card and the gap under it, and the head gets no margin. So the
     * record's first column starts right under the head. It is padding and not a margin because
     * padding keeps the column's own top where it is, and the card is placed from that top, so the
     * card does not move when the room is made.
     *
     * THE HEIGHT IS THE CARD'S OWN, MEASURED, and there is no card to measure until one has been
     * drawn once. So the first measurement places the card, the card's own watcher in `OneCard`
     * fires as soon as it has a size, and the second measurement makes the room. A card that grows
     * — another remark arrives, or the person types a long answer — fires that same watcher, and
     * the room grows with it. That is why a long exchange can no longer reach the card below it.
     */
    const kept = new Set<HTMLElement>()
    for (const [key, { host, column }] of hosts) {
      const card = document.querySelector(`.px-said[data-said-on="${quotedKey(key)}"]`)
      const height = card === null ? 0 : card.getBoundingClientRect().height
      if (height === 0) continue
      const element = column ?? host
      const property = column === null ? 'marginBottom' : 'paddingTop'
      kept.add(element)
      if (!roomMade.current.has(element)) roomMade.current.set(element, { property, was: element.style[property] })
      const want = `${String(Math.ceil(column === null ? height + GAP * 2 : height + GAP))}px`
      if (element.style[property] !== want) element.style[property] = want
    }
    // AN ELEMENT NO LONGER GIVEN ROOM GETS ITS OWN PROPERTY PUT BACK. So a window made narrower puts
    // the column's padding back and gives the head its margin, and a window made wider does the opposite.
    for (const [element, { property, was }] of roomMade.current) {
      if (kept.has(element)) continue
      element.style[property] = was
      roomMade.current.delete(element)
    }
    // THE OLD OBJECT IS KEPT WHEN NOTHING MOVED, AND THAT IS NOT AN OPTIMISATION.
    //
    // Measuring makes a new object every time. A new object is a new state, a new state is a
    // render, a render changes the page, and the watcher below fires on that and measures again.
    // Written without this the page died with "maximum update depth exceeded" the moment a card was
    // drawn — measured in Chromium on 4 September 2026.
    setPlaces((was) => (sameWhere(was, next) ? was : next))
  }, [groups])

  useEffect(() => {
    if (typeof document === 'undefined') return
    let asked = 0
    const soon = () => {
      if (asked !== 0) return
      asked = window.requestAnimationFrame(() => {
        asked = 0
        measure()
      })
    }
    soon()
    /**
     * MEASURED AGAIN WHENEVER THE DOCUMENT CHANGES, AND WATCHING THE SIZE WAS NOT ENOUGH.
     *
     * This watched `document.body` for a resize and nothing else, and that is not a reading of when
     * the block appears. The card is placed the moment the comments arrive; if the record's own
     * fetch has not drawn the block yet, there is no element to hang it under, and nothing brings
     * this back — a page shorter than the window never changes the body's size at all, because the
     * shell is `min-height: 100dvh`.
     *
     * MEASURED ON 4 SEPTEMBER 2026. A report 928 pixels tall in a 1000 pixel window drew no card
     * for either of the two comments an agent had left on it. It had been drawing them, and only
     * because the mark layer put a `::before` on each commented block: on a block laid out as a
     * grid that pseudo-element took a row of its own, made the page taller than the window, and
     * the resize that followed is what measured the cards. When the mark became a circle beside the
     * block, the page stopped growing and the cards stopped being placed. The card was resting on a
     * side effect of another component's stylesheet.
     *
     * So the document itself is watched, the way the mark layer watches it, coalesced into one pass
     * per frame. It cannot chase itself: placing a card and reserving room both change the document,
     * the next pass finds everything where it already was, `sameWhere` keeps the old object, and
     * React renders nothing.
     */
    const watching = new MutationObserver(soon)
    watching.observe(document.body, { childList: true, subtree: true, attributes: true })
    const sized = new ResizeObserver(soon)
    sized.observe(document.body)
    window.addEventListener('resize', soon)
    return () => {
      watching.disconnect()
      sized.disconnect()
      window.removeEventListener('resize', soon)
      if (asked !== 0) window.cancelAnimationFrame(asked)
    }
  }, [measure])

  // THE PAGE IS PUT BACK WHEN THE LAST CARD GOES. A page navigated away from, left with a hand's
  // width of empty space under one of its blocks, would be this component still changing a page it
  // is no longer drawing anything on.
  const made = roomMade.current
  useEffect(
    () => () => {
      for (const [element, { property, was }] of made) element.style[property] = was
      made.clear()
    },
    [made],
  )

  if (groups.length === 0) return null

  const registry = new Map<string, Pick<ParticipantOnTheWire, 'kind' | 'id' | 'name' | 'avatarUrl'>>()
  for (const one of who.status === 'ready' ? who.value.agents : []) registry.set(participantKey({ kind: 'agent', id: one.id }), one)
  for (const one of who.status === 'ready' ? who.value.people : []) registry.set(participantKey({ kind: 'person', id: one.id }), one)

  return (
    <>
      <style href="mole-office-said-here" precedence="default">
        {CSS_RULES}
      </style>
      {groups.map((group) => {
        const at = places[group.key]
        if (at === undefined) return null
        const card = <OneCard key={group.key} group={group} at={at} registry={registry} onSized={measure} />
        return at.layer === null ? card : createPortal(card, at.layer, group.key)
      })}
    </>
  )
}

function OneCard({
  group,
  at,
  registry,
  onSized,
}: {
  group: SaidHere
  at: { top: number; left: number }
  registry: ReadonlyMap<string, Pick<ParticipantOnTheWire, 'kind' | 'id' | 'name' | 'avatarUrl'>>
  /** Said when this card has a size, and again every time that size changes. */
  onSized: () => void
}) {
  const [typed, setTyped] = useState('')
  /**
   * THE CARD'S OWN ELEMENT, SO ITS HEIGHT CAN BE MEASURED.
   *
   * Held as state rather than in a ref because the watcher below has to be set up the moment the
   * element exists, and a ref changing does not run an effect.
   */
  const [element, setElement] = useState<HTMLElement | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [fault, setFault] = useState<string | null>(null)
  // Asked once before an answer that seems to hold a key is sent.
  const keyQuestion = useAKeyQuestion()

  // HOW TALL THIS CARD IS, SAID TO THE COMPONENT THAT MAKES ROOM FOR IT. It is nought before the
  // card is drawn, so the first thing this says is what turns the reserved room on at all.
  useEffect(() => {
    if (element === null) return
    const watching = new ResizeObserver(() => {
      onSized()
    })
    watching.observe(element)
    return () => {
      watching.disconnect()
    }
  }, [element, onSized])

  const answer = async (askedAboutAKey = false): Promise<void> => {
    const words = typed.trim()
    if (words === '') return
    if (!askedAboutAKey && keyQuestion.stopsTheSend({ body: words, target: group.context }, () => void answer(true))) return
    setSending(true)
    setFault(null)
    try {
      await api.replyWhereItWasSaid(group.agent, words, group.context, theAgentsLastWord(group))
      setTyped('')
      setSent(true)
    } catch (err: unknown) {
      setFault(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <aside ref={setElement} className="px-said" style={{ top: at.top, left: at.left }} data-said-on={group.key}>
      {group.said.map((one) => {
        const known = one.by === null ? undefined : registry.get(participantKey(one.by))
        return (
          <div key={one.id} className="px-said-one">
            <span className="px-said-who">
              {known === undefined ? null : (
                <Avatar
                  kind={known.kind as ParticipantKind}
                  id={known.id}
                  name={known.name}
                  url={known.avatarUrl}
                  size={22}
                />
              )}
              <span className="px-said-name">{known?.name ?? t('saidHere.writerUnknown')}</span>
            </span>
            <p className="px-said-words">{one.body}</p>
          </div>
        )
      })}
      <div className="px-said-acts">
        <button
          type="button"
          className="px-said-show"
          onClick={() => {
            showMeThat({ key: group.key, context: group.context, annotationId: group.firstId })
          }}
        >
          {SAID_HERE.showMe}
        </button>
      </div>
      <div className="px-said-write">
        {/* A BOX OF SEVERAL LINES. Enter makes a new line and sends nothing;
            the answer goes only when its button is pressed. */}
        <TextArea
          value={typed}
          rows={2}
          placeholder={SAID_HERE.answerPlaceholder}
          aria-label={SAID_HERE.answerPlaceholder}
          onChange={(next) => {
            keyQuestion.close()
            setTyped(next)
            setSent(false)
          }}
        />
        <button
          type="button"
          className="px-said-send"
          disabled={typed.trim() === '' || sending}
          onClick={() => {
            void answer()
          }}
        >
          {SAID_HERE.answer}
        </button>
      </div>
      <KeyQuestion question={keyQuestion} />
      {sent ? <p className="px-said-note">{t('talk.sent')}</p> : null}
      {fault === null ? null : <p className="px-said-fault">{fault}</p>}
    </aside>
  )
}

/**
 * The card's own rules.
 *
 * Every value is a token, so a preset swap re-skins it with everything else. No colour and no type
 * size is written out here.
 */
const CSS_RULES = `
.px-said {
  position: absolute;
  width: min(16rem, calc(100vw - 1rem));
  z-index: var(--z-popover);
  background: var(--panel);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius);
  padding: var(--pad);
  box-shadow: var(--elev-2);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.px-said-one { display: flex; flex-direction: column; gap: 0.25rem; }

.px-said-who { display: flex; align-items: center; gap: 0.5rem; }

.px-said-name { font-size: var(--fs-2); font-weight: 600; color: var(--text); }

.px-said-words { margin: 0; font-size: var(--fs-2); color: var(--text); white-space: pre-wrap; }

.px-said-acts { display: flex; gap: 0.5rem; }

.px-said-show {
  font: inherit;
  font-size: var(--fs-1);
  color: var(--text-2);
  background: none;
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.125rem 0.5rem;
  cursor: pointer;
}

.px-said-show:hover { color: var(--text); border-color: var(--border-strong); }

.px-said-write { display: flex; align-items: flex-end; gap: 0.5rem; }

/* The answer box is the office's own box of several lines. Here it shares the row with its button,
   in the card's smaller type. */
.px-said-write .px-textarea {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
  font-size: var(--fs-2);
}

.px-said-send {
  font: inherit;
  font-size: var(--fs-1);
  color: var(--accent-text);
  background: var(--accent);
  border: var(--border-w) solid transparent;
  border-radius: var(--radius-sm);
  padding: 0.125rem 0.5rem;
  cursor: pointer;
}

.px-said-send:disabled { opacity: 0.5; cursor: default; }

.px-said-note { margin: 0; font-size: var(--fs-1); color: var(--text-2); }

.px-said-fault { margin: 0; font-size: var(--fs-1); color: var(--alarm-urgent-ink); }
`
