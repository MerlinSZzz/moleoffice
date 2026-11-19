// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A PERSON CAN DO WITH A COMMENT THEY SAVED WITHOUT SENDING: SEND IT, CHANGE ITS WORDS, REMOVE IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE OWNER MET, 1 OCTOBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * The owner right-clicked passages of a report, wrote five comments and pressed Save without sending. Each
 * became a message with a place on the report and no recipient, and nothing let such a comment be sent
 * the "1" on the right showed it in the side column, and nothing there could be
 * pressed.
 *
 * The "1" is the count beside the block (CommentCircle.tsx). Pressing it opens the review column on
 * the comments on that block, and the column drew each comment's words and nothing they could press.
 * Problem 7VI4cV5ppiFQ.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY PRESS HERE IS A DOOR THAT ALREADY EXISTS
 * ---------------------------------------------------------------------------------------
 *
 *   - SEND writes `chosenRecipient` on the comment: PATCH /api/records/:id, `api.chooseWhoItIsFor`,
 *     the write the review pane makes. The patch door works out who the message is to from that
 *     choice and writes the delivery rows in the same write (`keepTheDeliveryRowsInStep` in
 *     src/server/lib/messages.ts), so the comment joins that agent's conversation.
 *     tests/a-recipient-chosen-later-still-reaches-the-conversation.test.ts proves the door.
 *   - BUT WHERE A REVIEW LISTS THE COMMENT, the same write only says who it is for. The message
 *     worker holds a comment a review has not sent (`commentsAReviewHasNotSentYet`, problem
 *     g4M_z6965R5o), and the review's send carries it. So the column asks GET /api/reviews/holding
 *     first, which is the worker's own reading, and says which of the two will happen: on that path
 *     the press is "Save who it is for" and the row says "Goes with the review".
 *   - CHANGE THE WORDS is `api.rewriteAnnotation`. Its writer may change the words of a comment that
 *     has not gone out, at any age and with no edit mark.
 *   - REMOVE is `api.deleteRecord`, a soft delete. The record keeps its history, the change log
 *     names who removed it, and POST /api/records/:id/restore brings it back.
 *
 * A SAVED COMMENT CAN GO TO AN AGENT AND NOT TO A PERSON FROM HERE. `chosenRecipient` names an agent
 * or a run, and a writer may not set `to` on a message after it is written, so no door takes a
 * person for a comment that already exists. A press on a person says so and sends nothing.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH COMMENTS GET THE PRESSES
 * ---------------------------------------------------------------------------------------
 *
 * The reader's own message comments that the server says are addressed to nobody: no `to`, no
 * group, and not yet handed to anybody. The message is read through GET /api/messages/:id, so the
 * server's own answer decides, never a second reading of the stored fields here. Somebody else's
 * comment gets no presses, because sending it would be this page acting for its writer. An own
 * comment that is addressed and still waiting to be picked up says who it waits for.
 */

import { useEffect, useRef, useState } from 'react'
import { api, errorMessage, faultOf, type Fault, type ReviewView } from '../../api.ts'
import { participantKey } from '@shared/messages.ts'
import { t } from '@shared/i18n.ts'
import { useLanguage } from '../../lib/language.ts'
import { readContactsOnce, readParticipantsOnce } from '../../lib/oneread.ts'
import { reviewChanged, useReviewChanges } from '../../lib/review.ts'
import { aSendKeyPress, useSendKey } from '../../lib/send-key.ts'
import { ContactsInOrder, theFirstChoiceFor, type WhatThePickIsAbout } from '../ContactsInOrder.tsx'
import { Btn, ErrorNote, TextArea } from '../ui.tsx'
import { useProjectAsync } from '../../lib/project-async.ts'
import type { WaitingNote } from './marks.ts'
import { TheChosenContact, type ContactRef } from './TalkBox.tsx'

/**
 * THE FAULT A NOTE IN THE REVIEW COLUMN OR ON A SAVED COMMENT IS DRAWN BY. When the office could not be reached,
 * ErrorNote's rule for that kind says nothing on the page could be read, and puts the cannot-reach sentence where the
 * note's own heading goes. Here one act or one part of the column failed, so that sentence would be untrue and the
 * heading, such as "Not sent", would be lost. So an unreachable fault is not passed on: the note keeps its heading and
 * says the cannot-reach sentence under it, as it did before round 18. A refusal or a broken answer is passed on.
 */
export function theFaultANoteDraws(fault: Fault | null | undefined): Fault | null | undefined {
  return fault != null && fault.kind === 'unreachable' ? null : fault
}

/** Why a press on a contact did not choose it, or null when nothing was refused. */
type NotChosen = 'a person' | 'no record here' | null

/** What the pick of a recipient is about, for the list's one order: the place the comment is on, and the review holding it. */
function whatThePickIsAbout(note: WaitingNote, holding: ReviewView | null): WhatThePickIsAbout {
  return { about: note.context, review: holding === null ? null : { id: holding.id } }
}

export function WhatASavedCommentCanDo({ note }: { note: WaitingNote }) {
  useLanguage()
  const changes = useReviewChanges()
  // ONLY A MESSAGE IS READ THROUGH THE MESSAGE DOOR. A comment written before comments and messages
  // became one thing is an annotation; the message door refuses it, and nothing here can address one.
  // WHICH REVIEW HOLDS IT is asked only of the reader's own comment that has not been sent.
  const [read] = useProjectAsync(
    async () => {
      if (note.entry !== 'message') return null
      const [message, contacts] = await Promise.all([api.getMessage(note.id), readContactsOnce()])
      const me = contacts.me
      const sentBy = message.message.sentBy
      const mine = sentBy !== null && sentBy.kind === me.kind && sentBy.id === me.id
      if (!mine || !message.message.notSentYet || message.message.toGroup !== null) return null
      const holding = (await api.reviewHolding(note.id)).review
      return { message: message.message, holding }
    },
    [note.id, note.entry, changes],
  )
  const [chosen, setChosen] = useState<ContactRef | null>(null)
  // WHETHER THE PERSON HAS CHOSEN BY HAND. A choice of theirs is never replaced by the one made in advance.
  const choseByHand = useRef(false)
  // THE CONTACT CHOSEN IN ADVANCE, by the list's one rule (`theFirstChoiceFor` in ContactsInOrder.tsx, which asks
  // wave 13q's `theAgentToPreselect`), as the right-click composer chooses one. Nothing is stored until the person presses.
  // NOT WHERE A REVIEW HOLDS THE COMMENT: review.md section 5.2 keeps the ranking from choosing for a review ("The
  // ranking's job is to make choosing fast, not to choose"), so there the list is ranked and nobody is chosen.
  const asked = read.status === 'ready' && read.value !== null ? whatThePickIsAbout(note, read.value.holding) : null
  const askedKey = asked === null ? '' : JSON.stringify(asked)
  useEffect(() => {
    if (asked === null || asked.review !== null) return
    let live = true
    theFirstChoiceFor(asked).then(
      (first) => {
        if (live && !choseByHand.current) setChosen(first)
      },
      // A FAILED READ CHOOSES NOBODY. The list makes the same read when it opens, and draws the fault there.
      () => {},
    )
    return () => {
      live = false
    }
  }, [askedKey])
  const [picking, setPicking] = useState(false)
  const [notChosen, setNotChosen] = useState<NotChosen>(null)
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(note.body)
  /** WHICH PRESS IS WAITING. One press at a time: only that press draws the light, and the others are off. */
  const [busy, setBusy] = useState<'save' | 'send' | 'remove' | null>(null)
  const [failed, setFailed] = useState<{ label: string; message: string; fault: Fault | null } | null>(null)
  /**
   * WHAT THE LAST PRESS PROVED, for the waiting light. A refused write is `failed`. A write that resolved
   * after doing its work is `worked`. The one path that resolves without writing anything is `plain`, because
   * "the agent has no record here" is neither a success nor a failure of the press.
   */
  const [outcome, setOutcome] = useState<'worked' | 'failed' | 'plain' | null>(null)
  const sendKey = useSendKey()
  // WHETHER THE LIST STAYS OPEN AFTER THIS PRESS. `ContactsInOrder` calls `onDecideToLeave` straight
  // after `onChoose`, and a press that chose nobody leaves the list open with the reason under it.
  const stayOpen = useRef(false)

  if (read.status === 'error') return <ErrorNote message={read.message} fault={theFaultANoteDraws(read.fault)} />
  if (read.status !== 'ready' || read.value === null || asked === null) return null
  const { message, holding } = read.value
  const goesWithTheReview =
    holding === null ? null : <span className="px-saved-held">{t('savedComment.goesWithTheReview')}</span>

  // ADDRESSED AND NOT YET HANDED TO ANYBODY: who it is for, and whether a review holds it. Nothing to press.
  if (message.to.length > 0) {
    return (
      <p className="px-saved-to">
        <style href="mole-office-saved-comment" precedence="default">
          {CSS_RULES}
        </style>
        <span className="px-saved-unsent">{t('savedComment.notSent')}</span>
        {`${t('talk.to')} `}
        {message.to.map((who) => (
          <TheChosenContact key={participantKey(who)} who={who} />
        ))}
        {goesWithTheReview}
      </p>
    )
  }

  /** Run one write; on success the column reads again, on failure the server's words are drawn. */
  const act = (press: 'save' | 'send' | 'remove', label: string, write: () => Promise<unknown>, after: () => void = () => {}) => {
    setBusy(press)
    setFailed(null)
    setOutcome(null)
    write().then(
      (answer) => {
        setBusy(null)
        // A WRITE THAT RESOLVED WITH `false` DID NOT WRITE ANYTHING. Send's missing record is that path.
        setOutcome(answer === false ? 'plain' : 'worked')
        after()
        reviewChanged()
      },
      (err: unknown) => {
        setBusy(null)
        setOutcome('failed')
        setFailed({ label, message: errorMessage(err), fault: faultOf(err) })
      },
    )
  }

  /**
   * SAY WHO IT IS FOR, WHICH SENDS IT WHERE NO REVIEW HOLDS IT, OR ASK WHO IT IS FOR.
   *
   * A comment is addressed to an agent by the id of the agent's record (`chosenRecipient.agentId`
   * in GET /api/kinds), and a contact names the agent by its registry id. The two are joined by the
   * `record` field of GET /api/participants, the read the contacts list draws its names from.
   */
  const send = () => {
    if (busy !== null) return
    if (chosen === null) {
      setPicking(true)
      return
    }
    if (chosen.kind !== 'agent') {
      setNotChosen('a person')
      setPicking(true)
      return
    }
    const agentId = chosen.id
    act('send', t('review.pane.note.notStored'), async () => {
      const registries = await readParticipantsOnce()
      const record = registries.agents.find((one) => one.id === agentId)?.record ?? null
      if (record === null) {
        setNotChosen('no record here')
        setPicking(true)
        // THIS PATH WROTE NOTHING, so its resolved promise proves nothing and the light ends plainly.
        return false
      }
      await api.chooseWhoItIsFor(note.id, { kind: 'agent', agentId: record, sessionId: null, said: null, why: null })
    })
  }

  const save = () => {
    if (busy !== null || body.trim() === '') return
    act('save', t('review.pane.note.notMade'), () => api.rewriteAnnotation(note.id, body), () => setEditing(false))
  }

  // THE PRESS SAYS WHAT IT DOES ON THIS PATH. With nobody chosen it opens the list on both.
  const pressWords =
    holding === null
      ? t('review.pane.note.send')
      : chosen === null
        ? t('review.pane.note.choose')
        : t('savedComment.saveTheChoice')

  return (
    <div className="px-saved" data-saved-comment={note.id} data-unsent="1">
      <style href="mole-office-saved-comment" precedence="default">
        {CSS_RULES}
      </style>
      {/* A COMMENT SAVED AND NOT SENT SAYS SO, in the same shape the composer uses, so the two cannot be mistaken for
          a comment that has gone (decided on 8 November 2026). */}
      <p className="px-saved-unsent">{t('savedComment.notSent')}</p>
      {editing ? (
        <div className="px-saved-edit">
          <TextArea
            value={body}
            onChange={setBody}
            rows={2}
            growTo={10}
            aria-label={t('review.pane.note.saysLabel')}
            onKeyDown={aSendKeyPress<HTMLTextAreaElement>(sendKey, save)}
          />
          <Btn
            size="sm"
            pending={busy === 'save'}
            pendingFailed={outcome === 'failed'}
            onClick={save}
            {...(body.trim() === ''
              ? { disabled: true, reason: t('review.pane.note.mustSay') }
              : busy !== null && busy !== 'save'
                ? { disabled: true, reason: t('sheet.button.waitsForTheLastAnswer') }
                : {})}
          >
            {t('review.pane.note.save')}
          </Btn>
        </div>
      ) : null}

      <div className="px-saved-acts">
        {goesWithTheReview}
        {chosen === null ? null : (
          <button
            type="button"
            className="px-saved-chosen"
            aria-haspopup="listbox"
            aria-expanded={picking}
            onClick={() => setPicking((v) => !v)}
          >
            {`${t('talk.to')} `}
            <TheChosenContact who={chosen} />
            <span aria-hidden="true">{' ▾'}</span>
          </button>
        )}
        <Btn
          size="sm"
          pending={busy === 'send'}
          pendingFailed={outcome === 'failed'}
          pendingSucceeded={outcome === 'worked'}
          onClick={send}
          {...(busy !== null && busy !== 'send' ? { disabled: true, reason: t('sheet.button.waitsForTheLastAnswer') } : {})}
        >
          {pressWords}
        </Btn>
        <Btn
          size="sm"
          variant="ghost"
          onClick={() => {
            setBody(note.body)
            setEditing((v) => !v)
          }}
        >
          {editing ? t('review.pane.note.stopEditing') : t('review.pane.note.edit')}
        </Btn>
        <Btn
          size="sm"
          variant="danger"
          pending={busy === 'remove'}
          pendingFailed={outcome === 'failed'}
          pendingSucceeded={outcome === 'worked'}
          onClick={() => act('remove', t('review.pane.note.notMade'), () => api.deleteRecord(note.id))}
          {...(busy !== null && busy !== 'remove' ? { disabled: true, reason: t('sheet.button.waitsForTheLastAnswer') } : {})}
        >
          {t('review.pane.note.remove')}
        </Btn>
      </div>

      {/* WHO IT GOES TO: the one picker, `ContactsInOrder`, in its one order, by option B of one
          decision and item 5 of another. A press on an
          agent chooses it and closes the list.
          A press on a person chooses nobody and says why: no door addresses an existing comment to a
          person. */}
      <ContactsInOrder
        open={picking}
        chosen={chosen}
        asked={asked}
        onChoose={(who) => {
          if (who.kind !== 'agent') {
            stayOpen.current = true
            setNotChosen('a person')
            return
          }
          choseByHand.current = true
          setChosen(who)
          setNotChosen(null)
        }}
        onDecideToLeave={() => {
          if (!stayOpen.current) setPicking(false)
          stayOpen.current = false
        }}
      />
      {notChosen === 'a person' ? <p className="px-pane-note" role="status">{t('savedComment.aPerson')}</p> : null}
      {notChosen === 'no record here' ? (
        <p className="px-pane-note" role="status">{t('savedComment.noRecord')}</p>
      ) : null}
      {failed === null ? null : <ErrorNote message={failed.message} fault={theFaultANoteDraws(failed.fault)} label={failed.label} />}
    </div>
  )
}

/** The rules for the presses under a saved comment. Every value is a token. */
const CSS_RULES = `
.px-saved { display: flex; flex-direction: column; gap: var(--gut); padding: 0 var(--gut) var(--gut); }
.px-saved[data-unsent="1"] { border-left: var(--rail) dashed var(--border-strong); }
/* THE SAME WORD THE COMPOSER USES FOR WORDS THAT HAVE NOT GONE. */
.px-saved-unsent {
  margin: 0;
  align-self: flex-start;
  padding: 2px 6px;
  border: var(--border-w) dashed var(--border-strong);
  border-radius: var(--radius-sm);
  font-size: var(--fs-1); font-weight: 600; color: var(--text-2);
}
.px-saved-unsent::before { content: "✎ "; }
.px-saved-acts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gut); }
.px-saved-edit { display: flex; flex-direction: column; align-items: flex-start; gap: var(--gut); }
.px-saved-edit textarea { width: 100%; }
.px-saved-chosen {
  font: inherit;
  font-size: var(--fs-1);
  color: var(--text);
  background: none;
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  padding: 2px var(--gut);
  cursor: pointer;
  max-width: 100%;
}
.px-saved-chosen:focus-visible { outline: var(--focus-w) solid var(--accent); outline-offset: 2px; }
.px-saved-held { color: var(--text-2); font-size: var(--fs-1); }
.px-saved-to { margin: 0; padding: 0 var(--gut) var(--gut); color: var(--text-2); font-size: var(--fs-1); display: flex; flex-wrap: wrap; gap: 0 var(--gut); }
`
