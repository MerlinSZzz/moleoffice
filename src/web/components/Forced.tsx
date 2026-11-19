// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN EMERGENCY MESSAGE, DRAWN AS A DIALOGUE OVER A BLURRED PAGE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M62: a system dialogue in the page with the surroundings blurred,
 * sendable to one screen alone, for emergencies only.
 *
 * A message sent as an emergency, addressed to the person reading, is drawn here: over the page,
 * with everything behind it blurred, and one press dismisses it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * IT IS NOT `WrongWorld`. That one blocks the page because the page is not usable — the reader is
 * looking at the wrong database, and there is nothing safe to do until they are not. This is a
 * message. It is dismissed by one press, it takes nothing away, and the message stays in the
 * conversation afterwards for the reader to go back to.
 *
 * IT DOES NOT DECIDE WHO SEES IT. A message may be narrowed to one machine and one browser, and a
 * page cannot read the name of the computer it is running on. The server measures that on the
 * request that asks — the same measurement criterion M63 stamps on a message when it is written —
 * so what `GET /api/messages/forced` returns is exactly what this screen must draw. There is no
 * second rule here that could come to disagree with it.
 *
 * DISMISSING IS THE ORDINARY DELIVERY MARK. One press marks the message read, which is what an
 * offer to take somebody somewhere already does, so an emergency dismissed on one screen is
 * dismissed on every screen this person has open rather than only on the one they pressed.
 *
 * MORE THAN ONE AT A TIME IS ONE AT A TIME. Two emergencies are two dialogues to answer, not one
 * stack to read: the oldest is drawn, and the next appears when it is dismissed. The count is said
 * so nobody thinks they have finished when they have not.
 */

import { useCallback, useEffect, useState } from 'react'
import { URGENT_WORDS, sameParticipant, theWritersName, type KnownParticipant } from '@shared/messages.ts'
import type { ParticipantKind, ParticipantRef } from '@shared/participants.ts'
import { api, errorMessage, type ParticipantForThePage, type PoolEntry } from '../api.ts'
import { useChannel, whenEventsWereLost } from '../lib/channel.ts'
import type { EventName } from '@shared/events.ts'
import {
  aSeenMarkTouchesThisPool,
  listsAnEventChanges,
  readTheParticipantsOnce,
  useAfterTheBurst,
  whoIsReading,
} from '../lib/chatlists.ts'
import { Overlay } from './ui.tsx'

/** The events this dialogue draws: a new message may be an emergency, and a mark may end one. */
const FORCED_DRAWS: readonly EventName[] = ['message.new', 'delivery.changed', 'comment.placed', 'comment.replied']


/** The fields of a participant this dialogue reads: who it is, its name, and what a stored sender may name it by. */
type Known = Pick<ParticipantForThePage, 'kind' | 'id' | 'name' | 'handle' | 'record'>

/**
 * How an emergency reads in a sentence: who it is from, in their own name.
 *
 * THE WRITER IS NAMED AS EVERY PAGE NAMES ONE (wave 13y round 88), by `theWritersName`: the stored sender read by the
 * registry id, then the agent's own record, then the one agent with that handle (round 85). When nobody here answers,
 * or the message stored no sender, the dialogue says so in the words the chat says it in. It had two sentences of its
 * own for those, so one case was worded two ways.
 */
function nameOf(said: PoolEntry, everybody: readonly Known[]): string {
  const everyone: KnownParticipant[] = everybody.map((one) => ({
    who: { kind: one.kind as ParticipantKind, id: one.id },
    name: one.name,
    handle: one.handle,
    record: one.record,
  }))
  return theWritersName(said, everyone)
}

export function Forced() {
  const [waiting, setWaiting] = useState<readonly PoolEntry[]>([])
  const [who, setWho] = useState<readonly Known[]>([])
  const [fault, setFault] = useState<string | null>(null)

  /** The emergencies waiting for this reader, read again and nothing else. */
  const readThePool = useCallback(async () => {
    try {
      setWaiting((await api.forcedMessages()).messages)
      setFault(null)
    } catch (err: unknown) {
      // KEPT, AND DRAWN WHERE THERE IS SOMEWHERE TO DRAW IT. The refusal appears inside the dialogue,
      // so a reader who has one on screen is told that the next read failed. With nothing on screen
      // nothing is drawn at all, and that is deliberate: a reader nobody registered would otherwise
      // meet a red box over every page in the product, saying something that is not about them.
      setFault(errorMessage(err))
    }
  }, [])

  /** The names an emergency is drawn with, read once for every panel that asks at the same moment. */
  const readTheNames = useCallback(async () => {
    const registries = await readTheParticipantsOnce.again()
    setWho([...registries.people, ...registries.agents])
  }, [])

  const readAgain = useCallback(async () => {
    try {
      // THE REGISTRIES GO THROUGH THE SHARED READ (src/web/lib/oneread.ts). The mount uses the
      // answer this page already has, so one fresh load asks them once between the three panels; an
      // event asks again, and joins the chat panel's read in the same burst.
      const [forced, registries] = await Promise.all([api.forcedMessages(), readTheParticipantsOnce()])
      setWaiting(forced.messages)
      setWho([...registries.people, ...registries.agents])
      setFault(null)
    } catch (err: unknown) {
      setFault(errorMessage(err))
    }
  }, [])

  useEffect(() => {
    void readAgain()
  }, [readAgain])

  /*
   * AND AS SOON AS ONE IS SENT, rather than on the next time this page happens to ask. An emergency
   * that arrives a minute late is not one.
   *
   * THE POOL, AND ONLY WHAT AN EVENT CAN MOVE IN IT. The pool holds messages addressed to this
   * reader and not marked seen, so it narrows by the mapping's own rule for it: a new message or a
   * mark reaching `seen` on one addressed to the reader. A mark moving on anybody else's message
   * during a run — most of what the channel carries — reads nothing here.
   *
   * THE MARK'S OWN MESSAGE IS CHECKED AGAINST THE POOL THIS PANEL HOLDS (`aSeenMarkTouchesThisPool`).
   * A message that is not an entry in the pool cannot leave it, so a `seen` mark on some other
   * message reads nothing — the one narrowing here that works from the panel's own state.
   *
   * NOBODY CAN SAY WHO IS READING YET — the contacts have not landed in the first moment of a page —
   * so the pool is read then too. Reading it once too often at page-open is one request; missing one
   * emergency is a dialogue that never appears.
   *
   * THE NAMES ride the same mapping: they are read for the same burst the chat panel reads them in,
   * through the shared read, so they cost nothing extra and a newly registered writer is drawn by
   * name in a dialogue that was already on screen.
   *
   * Reads of one burst are gathered into one (`useAfterTheBurst`), as in the chat panel.
   */
  const readThePoolAfterTheBurst = useAfterTheBurst((lists) => {
    if (lists.has('forced')) void readThePool()
    if (lists.has('participants')) void readTheNames()
  })
  useChannel(
    useCallback(
      (event) => {
        // A MESSAGE THAT IS NOT URGENT CANNOT ENTER THIS POOL, which holds only emergencies; the event
        // carries the message now, so it says which it is. An event that carries nothing is read as before.
        if (event.name === 'message.new' && event.lists !== undefined && event.lists !== null && !event.lists.entry.urgent) return
        const reader = whoIsReading()
        const lists = listsAnEventChanges(event, reader === 'notKnownYet' ? null : reader, null)
        if (!lists.has('forced') && reader !== 'notKnownYet') return
        if (!aSeenMarkTouchesThisPool(event, waiting.map((one) => one.id))) return
        readThePoolAfterTheBurst(lists)
      },
      [readThePoolAfterTheBurst, waiting],
    ),
    FORCED_DRAWS,
  )
  // AND WHEN EVENTS WERE LOST, the pool is read once, because what it holds may be missing some.
  useEffect(() => whenEventsWereLost(() => {
    void readThePool()
  }), [readThePool])

  const oldest = waiting[waiting.length - 1] ?? null

  const dismiss = useCallback(async () => {
    if (oldest === null) return
    try {
      await api.markMessage(oldest.id, 'seen')
    } catch (err: unknown) {
      setFault(errorMessage(err))
    }
    void readAgain()
  }, [oldest, readAgain])

  if (oldest === null) return null

  return (
    <Overlay>
      {/* THE BLUR IS ON A SHEET OF ITS OWN, over the page and under the dialogue. It also swallows
          presses while it is there, which is what makes this a dialogue rather than a notice: the
          page is not usable until the reader has answered it. Everything
          around it is blurred. */}
      <div className="px-forced-behind" aria-hidden="true" />
      <div className="px-forced" role="alertdialog" aria-modal="true" aria-label={URGENT_WORDS.dialogueName}>
        <p className="px-forced-mark">{URGENT_WORDS.dialogueName}</p>
        <p className="px-forced-who">{nameOf(oldest, who)}</p>
        <p className="px-forced-body">{oldest.body}</p>
        {waiting.length === 1 ? null : (
          <p className="px-forced-more">{URGENT_WORDS.moreAfterThisOne(waiting.length - 1)}</p>
        )}
        {fault === null ? null : <p className="px-forced-fault">{fault}</p>}
        <button
          type="button"
          className="px-forced-dismiss"
          onClick={() => {
            void dismiss()
          }}
        >
          {URGENT_WORDS.dismiss}
        </button>
      </div>
      <style href="px-forced" precedence="medium">
        {FORCED_CSS}
      </style>
    </Overlay>
  )
}

/**
 * Whether this reader is the person a message is addressed to. Exported for a test with no browser.
 *
 * It is here rather than in the component because "who is this for" is a question worth being able
 * to ask without starting a browser, and because the server answers the same question and the two
 * should be readable side by side.
 */
export function isAddressedTo(said: PoolEntry, me: ParticipantRef): boolean {
  return said.deliveries.some((one) => sameParticipant(one.to, me))
}

const FORCED_CSS = `
/* THE BLURRED PAGE. The backdrop filter blurs what is BEHIND this element, which is the page, so
   nothing about the page itself has to change and nothing is drawn twice. The tint underneath it
   is what makes the blur read as deliberate rather than as a rendering fault on a light theme.

   AND IT SWALLOWS PRESSES. Nothing behind it can be pressed while it is there, which is the
   difference between a dialogue and a notice. */
.px-forced-behind {
  position: fixed;
  inset: 0;
  z-index: var(--z-blocked);
  backdrop-filter: blur(6px);
  background: rgba(0, 0, 0, .25);
}

.px-forced {
  position: fixed;
  z-index: var(--z-wrong-world);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(28rem, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: .5rem;
  padding: 1rem;
  border: var(--border-w) solid var(--st-broken);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: 0 1rem 3rem rgba(0, 0, 0, .35);
}

/* WHAT IT IS, SAID FIRST AND IN THE COLOUR THE PRODUCT USES FOR SOMETHING WRONG. A reader meeting
   a dialogue they did not ask for needs to know what kind of thing it is before they read it. */
.px-forced-mark {
  margin: 0;
  font-size: .75rem;
  font-weight: 700;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: var(--st-broken);
}

.px-forced-who { margin: 0; font-weight: 600; }
.px-forced-body { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.px-forced-more { margin: 0; font-size: .8rem; color: var(--text-3); }
.px-forced-fault { margin: 0; font-size: .8rem; color: var(--st-broken); }

.px-forced-dismiss {
  align-self: flex-end;
  padding: .35rem .9rem;
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text-1);
  cursor: pointer;
}
.px-forced-dismiss:hover { background: var(--surface-3); }
`
