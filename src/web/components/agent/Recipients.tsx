// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO THIS MESSAGE IS FOR: the ranked candidates, the reason for each, and two ways to say it
 * yourself.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE RULE THIS FILE EXISTS TO KEEP
 * ---------------------------------------------------------------------------------------
 *
 * The recipient is never guessed silently. The interpretation is visible and easy to override.
 *
 * So the top candidate is SHOWN and is never applied behind the composer. A default a person can
 * read before pressing Send is a choice they made. A default applied quietly is the guess they
 * forbade, and it would be invisible in exactly the case that matters — a message going to an agent
 * that has never heard of the work.
 *
 * ---------------------------------------------------------------------------------------
 * A RUN THAT CANNOT BE PICKED UP SAYS SO BEFORE ANYTHING IS SENT
 * ---------------------------------------------------------------------------------------
 *
 * Every candidate carries `pickUp`, which is the server's answer to "can this run be picked up
 * where it left off": `yes`, `no` with the reason, or `unknown` because the transcript could not be
 * read. `unknown` is not `no` and is not drawn as one.
 *
 * When the answer is not `yes`, the composer offers exactly two honest choices — start a new agent
 * and hand it this context, or stop — and never substitutes one agent for another. That is the
 * second engineering rule on the path most likely to break it, and the wording of the two choices
 * comes from the server so that every surface says the same thing.
 *
 * ---------------------------------------------------------------------------------------
 * SAY WHO YOU MEAN, AND THE TWO REFUSALS
 * ---------------------------------------------------------------------------------------
 *
 * Type *the agent working on controller calibration* and Mole Office matches those words against what it
 * durably holds. No language model is called. There are three outcomes and all three are drawn: one
 * agent, and it says which words matched what; more than one, which is a refusal naming every
 * candidate; and none, which is a refusal offering to start a new agent.
 *
 * A REFUSAL IS NOT AN ERROR STATE. It is this working: Mole Office would rather say "those words name
 * three agents" than pick one of them.
 *
 * ---------------------------------------------------------------------------------------
 * A CANDIDATE IS DRAWN SHORT, AND EVERY SENTENCE IS ONE PRESS AWAY
 * ---------------------------------------------------------------------------------------
 *
 * The owner, 18 August 2026: *"recipient/routing UI is too verbose"*, and *"do not show several
 * paragraphs explaining recipient provenance and resume state by default"*. A row used to carry up
 * to four paragraphs — why it is here, what else is true of it, how the record got into the corpus,
 * and whether it can be picked up — and a picker of five agents was twenty paragraphs.
 *
 * So `shortReading` gives one candidate three short lines, built from the structured fields the
 * server sends beside its prose. Nothing is deleted: every sentence the server sent is inside one
 * fold, under the list, headed by the name it belongs to. A short list with the whole archive
 * behind one press is the shape; a shorter list that has dropped what it could not fit is not.
 */

import { useRef, useState } from 'react'
import type { PickUp, RecipientCandidate, RecipientsAnswer, Resolution } from '../../../server/lib/recipients.ts'
import { t } from '@shared/i18n.ts'
import { api, errorMessage, faultOf, rankingAsk, type Fault } from '../../api.ts'
import { pathFor } from '../router.tsx'
import {
  Absence,
  Btn,
  ErrorNote,
  HiddenCount,
  Loading,
  ServerNote,
  TextInput,
  dayPhrase,
  daysSince,
  useCloseOnOutsidePress,
  type AsyncState,
} from '../ui.tsx'
import { partOfMoleOffice } from './pointing.ts'
import {
  CONNECTED_HEADING,
  DELETED_LABEL,
  ELSEWHERE_LABEL,
  GROUND_LABELS,
  NOTHING_FILED_LABELS,
  NOTHING_POINTED_AT_LABEL,
  NOTHING_RANKED_LABEL,
  NOT_CONNECTED_LABEL,
  RANKED_AGAINST_LABEL,
  RECENT_HEADING,
  NO_ORIGIN_MARK,
  ORIGIN_MARKS,
  PICK_UP_MARKS,
  objectWord,
  shortName,
  type MessageContext,
} from './context.ts'

/** Who a comment is for, as the composer holds it before it is written down. */
export interface ChosenRecipient {
  /** `session` is a run already working on this. `new` is deliberately a fresh agent. */
  kind: 'session' | 'new'
  sessionId: string | null
  /** What to call it on screen. */
  title: string
  /** The words typed, when the choice came from saying who you mean. */
  said: string | null
  /**
   * The candidate this choice was made from, kept whole. Null when a person asked for a new agent,
   * because there is no candidate behind that.
   *
   * IT IS THE CANDIDATE AND NOT A COPY OF THREE OF ITS FIELDS. This used to hold `why` and `pickUp`
   * as their own fields, so the composer could draw only what had been copied across at the moment
   * of the press — and the reason and the pick-up sentence were then written out twice, once in the
   * picker and once here. One value, read by both.
   */
  from: RecipientCandidate | null
}

/**
 * Words that name more than one agent, kept on the comment.
 *
 * Stored rather than thrown away, because what somebody typed is a fact and the refusal has to be
 * readable beside the comment later. It stops the dispatch; it does not stop the writing. Only
 * offered while a review is being collected, where settling it later is the normal thing to do.
 */
export interface UnresolvedRecipient {
  kind: 'unresolved'
  said: string
  why: string
}

export type Recipient = ChosenRecipient | UnresolvedRecipient

/** A new agent, with no history of this work. The one choice that is never a substitution. */
export function aNewAgent(said: string | null): ChosenRecipient {
  return { kind: 'new', sessionId: null, title: 'A new agent', said, from: null }
}

/** What the composer sends on the comment. The server keeps all four fields. */
export function recipientForServer(recipient: Recipient): {
  kind: 'session' | 'new' | 'unresolved'
  sessionId: string | null
  said: string | null
  why: string | null
} {
  if (recipient.kind === 'unresolved') {
    return { kind: 'unresolved', sessionId: null, said: recipient.said, why: recipient.why }
  }
  return {
    kind: recipient.kind,
    sessionId: recipient.sessionId,
    said: recipient.said,
    // The server's own sentence about why this agent was offered, stored beside the choice. A new
    // agent has no candidate behind it and therefore no such sentence, which is null and not ''.
    why: recipient.from?.why ?? null,
  }
}

/** What the To control says when this is the choice. */
export function recipientWords(recipient: Recipient): string {
  if (recipient.kind === 'unresolved') return `“${recipient.said}” — nobody chosen yet`
  return recipient.title
}

/**
 * The strongest connected agent a message can reach, or null when none is connected to this.
 *
 * ONLY EVER SHOWN, NEVER APPLIED. The composer draws this beside the To control as a suggestion
 * with a press on it. Nothing anywhere reads it into the recipient by itself.
 *
 * An agent that is merely recent is deliberately not offered here. Recency is not relevance, the
 * server keeps the two lists apart for that reason, and a suggestion drawn off the recent list
 * would be exactly the accident this design is built to avoid.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT SKIPS A CONNECTED AGENT NOTHING CAN BE SENT TO
 * ---------------------------------------------------------------------------------------
 *
 * This used to be `connected[0]` — the strongest reason, and nothing else. On a corpus where most
 * runs carry no conversation that offered a one-press suggestion the composer then REFUSES to send
 * to: the row says "Needs a new run" and the Send button will not use it. Measured on a copy of the
 * owner's corpus on 19 August 2026, after the discovery sweep: 177 records had a connected agent,
 * 161 of them had a connected agent a message could reach, and the suggestion was reachable on 51.
 * So on 110 records Mole Office had somebody to offer and offered somebody else.
 *
 * IT IS NOT A SECOND RANKING AND IT DOES NOT SUBSTITUTE ONE AGENT FOR ANOTHER. Every agent it can
 * pick is on the connected list, in the server's own order, each carrying its own reason; the list
 * itself is untouched and still reads strongest-first; and the suggestion is drawn with its reason
 * beside it so the choice is one a person makes. What changes is only which of several connected
 * agents is proposed first, and the tie-break is whether the message could actually arrive.
 *
 * WHEN NOTHING CONNECTED CAN BE REACHED the strongest one is still offered, exactly as before, and
 * it still says it needs a new run. Offering nothing there would hide the agent that did the work.
 */
export function strongestCandidate(answer: RecipientsAnswer): RecipientCandidate | null {
  // A deleted run answers `yes` — its record keeps the conversation — and nothing can be sent to
  // it: the message is stored and then held at dispatch. So it is never the suggestion.
  const canBeReached = answer.connected.find((c) => c.pickUp.answer === 'yes' && !c.deleted)
  return canBeReached ?? answer.connected[0] ?? null
}

/** A candidate as a choice the composer can hold. */
export function chosenFrom(candidate: RecipientCandidate, said: string | null): ChosenRecipient {
  return { kind: 'session', sessionId: candidate.sessionId, title: candidate.title, said, from: candidate }
}

/**
 * Can this run be picked up where it left off, at both lengths, from one decision.
 *
 * Three answers, and `unknown` is not `no`. `short` is what a row draws by default; `whole` is the
 * server's own sentence, drawn behind the fold. THEY COME OUT OF ONE FUNCTION on purpose: two
 * functions over the same union is how the mark and the sentence come to disagree, and this is the
 * one place in the product where a disagreement about pick-up would send a message to an agent that
 * has never heard of the work.
 */
export function pickUpReading(pickUp: PickUp | null): { bad: boolean; short: string; whole: string } | null {
  if (pickUp === null) return null
  const short = PICK_UP_MARKS[pickUp.answer]
  // `yes` is the ordinary case and has nothing to say. The map above is where that is decided.
  if (short === null) return null
  return {
    bad: pickUp.answer === 'no',
    short,
    whole:
      pickUp.answer === 'no'
        ? `Cannot be picked up where it left off. ${pickUp.because}`
        : `Mole Office could not find out whether this can be picked up. ${pickUp.because}`,
  }
}

/** The pick-up answer as a sentence. Kept because two surfaces already ask for it that way. */
export function pickUpNote(pickUp: PickUp | null): { bad: boolean; words: string } | null {
  const read = pickUpReading(pickUp)
  return read === null ? null : { bad: read.bad, words: read.whole }
}

// ---------------------------------------------------------------------------- one candidate, short

/**
 * WHEN THIS RUN WAS LAST SEEN DOING ANYTHING, in the app's own words for an age.
 *
 * `daysSince` and `dayPhrase` in ui.tsx are what every other surface in this app says an age with,
 * so this is not a second reader of a stored stamp. Null when the stamp cannot be read, and a null
 * is left off the line rather than drawn as "unknown" — the line has other things to say and an age
 * nobody can work out is not one of them.
 */
function seenWords(stamp: string, now?: number): string | null {
  const days = daysSince(stamp, now)
  if (days === null) return null
  return days === 0 ? 'today' : `${dayPhrase(days * 24 * 60 * 60 * 1000)} ago`
}

/**
 * ONE CANDIDATE IN THREE SHORT LINES. This is the whole of the owner's shape for the composer.
 *
 *     Round seven build run — Plan and …     the name, cut at a word and marked as cut
 *     Created this · 2 days ago              why it is offered, and when it was last seen
 *     Needs a new run                        whether it can be picked up, when it cannot
 *
 * A fourth line appears only when the record itself is not a real run, because offering fixture
 * content as an agent without saying so would be offering a made-up agent. Whether that needs
 * saying is the server's answer, read from `originNote`; how short it is said is this file's.
 */
export interface ShortReading {
  /** What to call it, on one line, with the cut said when there was one. */
  name: string
  /** The whole title, for the pointer, so nothing is only available in a cut form. */
  wholeName: string
  /** Why it is offered and when it was last seen, in one line. */
  line: string
  /** Whether it can be picked up, in a few words. Null when it can. */
  pickUp: { bad: boolean; words: string } | null
  /** That the run has been deleted, in a few words. Null when it has not. */
  deleted: string | null
  /** What is wrong with the record itself, in a few words. Null when nothing is. */
  origin: string | null
}

/**
 * A DELETED RUN SAYS SO ON ITS OWN ROW, in the fewest words that carry it.
 *
 * The server has always sent `deleted` and no screen read it. A soft-deleted run keeps its
 * discovery stamp, so it answers "can be picked up: yes" and was drawn as an ordinary agent with
 * nothing to tell it apart. Choosing it stored the comment and then held it at dispatch with "no
 * run has that id any more" — while the reply to "say who you mean", about the same record, said
 * plainly that the run had been deleted.
 *
 * THE MARK CARRIES THE CONSEQUENCE AND NOT ONLY THE FACT, because "deleted" alone leaves a reader
 * to work out whether they may still choose it. This is the same shape as `PICK_UP_MARKS`: a few
 * words here, the server's whole sentence on the route that answers in sentences.
 */
const DELETED_MARK = 'Deleted'

export function shortReading(candidate: RecipientCandidate, now?: number): ShortReading {
  const seen = seenWords(candidate.lastSeenAt, now)
  const why = candidate.ground === null ? NOT_CONNECTED_LABEL : GROUND_LABELS[candidate.ground]
  const read = pickUpReading(candidate.pickUp)
  return {
    name: shortName(candidate.title),
    wholeName: candidate.title,
    line: seen === null ? why : `${why} · ${seen}`,
    // AT MOST ONE URGENT MARK PER ROW, which is the colour contract. When a run has been deleted
    // that is the mark, and the pick-up line yields its ink to it: nothing can be sent to a deleted
    // run at all, so "it cannot be picked up where it left off" is the smaller of the two facts.
    pickUp: read === null ? null : { bad: read.bad && !candidate.deleted, words: read.short },
    deleted: candidate.deleted ? DELETED_MARK : null,
    // THE SERVER DECIDES WHETHER, THIS DECIDES HOW SHORT. A note is drawn only where the server sent
    // one, so the browser never invents a warning about an origin the server was happy with.
    origin:
      candidate.originNote === null
        ? null
        : candidate.origin === null
          ? NO_ORIGIN_MARK
          : ORIGIN_MARKS[candidate.origin],
  }
}

/**
 * WHAT TO CALL EACH AGENT IN ONE LIST, SO THAT NO TWO ROWS READ THE SAME.
 *
 * ---------------------------------------------------------------------------------------
 * THE MEASUREMENT
 * ---------------------------------------------------------------------------------------
 *
 * A name is cut to one line, and two names that differ after the cut come out identical. Measured
 * on a copy of the owner's corpus on 19 August 2026, on the picker for one report: ten candidates,
 * of which two drew "2026-08-13 15:52 — a session that …" — the same name, the same line beneath it
 * ("Not connected to this" and the same day, to the second) and the same pick-up mark. Nothing on
 * either row said which was which. design/UX-CONTRACT.md's rule for a list is that a row exists to
 * help somebody find the thing, and two rows nobody can tell apart help nobody.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS DOES INSTEAD, AND WHY IT IS NOT A LONGER CUT
 * ---------------------------------------------------------------------------------------
 *
 * A name whose cut form is unique in the list keeps it. A name that would collide is drawn WHOLE
 * and wraps, for those rows only. A longer cut would move the collision rather than remove it —
 * two titles that agree for their first eighty characters still draw the same — and a list where
 * every name wraps costs the line this was meant to save.
 *
 * PHASE 11 WOULD ANSWER THIS WITH A LABEL, AND THIS DOES NOT ASK FOR ONE. Since 5 September 2026
 * `shortFormsField` in src/shared/kinds.ts declares a level-1 label on EVERY kind, a `session`
 * included; before that day it was declared only on the kinds that hold a body, which is what this
 * comment used to say. A label is still there only when somebody has written one, and nothing in
 * this list asks a run for its label, so the honest name is the one the run was given. Nothing is
 * invented here.
 */
export function namesInList(candidates: readonly RecipientCandidate[]): Map<string, string> {
  const cut = new Map<string, string>()
  const seen = new Map<string, number>()
  for (const candidate of candidates) {
    const short = shortName(candidate.title)
    cut.set(candidate.sessionId, short)
    seen.set(short, (seen.get(short) ?? 0) + 1)
  }
  const names = new Map<string, string>()
  for (const candidate of candidates) {
    const short = cut.get(candidate.sessionId) ?? candidate.title
    names.set(candidate.sessionId, (seen.get(short) ?? 0) > 1 ? candidate.title : short)
  }
  return names
}

/** One agent a message could go to, as a press. Three lines, and the sentences are under the list. */
function Candidate({
  candidate,
  said,
  name,
  onChoose,
}: {
  candidate: RecipientCandidate
  said: string | null
  /**
   * What to call it in THIS list, from `namesInList`, or left out where the row stands alone.
   *
   * A name is cut to one line, and two names that differ after the cut draw the same. The list is
   * what can see that, so the list decides; a row on its own -- the one answer to "say who you
   * mean" -- has nothing to collide with and keeps the cut.
   */
  name?: string
  onChoose: (choice: ChosenRecipient) => void
}) {
  const reading = shortReading(candidate)
  return (
    <button type="button" className="px-pick-one" onClick={() => onChoose(chosenFrom(candidate, said))}>
      <span className="px-pick-name" title={reading.wholeName}>
        {name ?? reading.name}
      </span>
      <span className="px-pick-why">{reading.line}</span>
      {/* A DELETED RUN IS DRAWN AS ONE. It is still on the list, because the change log still names
          it and dropping it would take a real reason off the list with nothing saying why — but a
          row that says nothing about it is a row offering an agent nothing can be sent to. */}
      {reading.deleted === null ? null : (
        <span className="px-pick-warn" data-bad="1">
          {reading.deleted}
        </span>
      )}
      {reading.pickUp === null ? null : (
        <span className="px-pick-warn" data-bad={reading.pickUp.bad ? '1' : undefined}>
          {reading.pickUp.words}
        </span>
      )}
      {/* NO URGENCY INK ON THIS ONE, and that is the contract rather than taste: at most one urgent
          mark per row, and the pick-up answer above is the one that decides whether the message can
          go anywhere. The words carry it. */}
      {reading.origin === null ? null : <span className="px-pick-warn">{reading.origin}</span>}
    </button>
  )
}

/**
 * WHAT THE COMPOSER DRAWS BESIDE THE `To` CONTROL: the owner's three lines, and nothing else.
 *
 *     Round seven build run — Plan and …        the name, when it is not already on the control
 *     Created this · 2 days ago    why this agent ▸
 *     Needs a new run
 *
 * THE SHORT LINE IS THE FOLD'S OWN SUMMARY, which is what keeps this to three lines rather than
 * four. `Explain` shows one line of meaning and hides the rest, so the line that says why this
 * agent is offered IS the handle for the sentences that say it at length. Drawing the short line
 * and then a separate press underneath would say the same thing twice.
 *
 * THE PICK-UP MARK IS OUTSIDE THE FOLD, deliberately. It changes what the composer will let you do
 * — a run that cannot be picked up refuses the send — so it is never something a reader has to open
 * something to find out.
 */
export function RecipientReading({ candidate, withName }: { candidate: RecipientCandidate; withName: boolean }) {
  const reading = shortReading(candidate)
  return (
    <>
      {withName ? (
        <p className="px-talk-suggest-who" title={reading.wholeName}>
          {reading.name}
        </p>
      ) : null}
      <div {...partOfMoleOffice({ surface: 'composer.detail' })}>
        <span className="px-talk-suggest-why">{reading.line}</span>
      </div>
      {candidate.ground === null ? null : <ServerNote text={candidate.why} />}
      {/* OUTSIDE THE FOLD, for the same reason the pick-up mark is: it changes what the composer
          will let you do, so it is never something a reader has to open something to find out. */}
      {reading.deleted === null ? null : (
        <p className="px-talk-warn" data-bad="1">
          {reading.deleted}
        </p>
      )}
      {reading.pickUp === null ? null : (
        <p className="px-talk-warn" data-bad={reading.pickUp.bad ? '1' : undefined}>
          {reading.pickUp.words}
        </p>
      )}
      {reading.origin === null ? null : <p className="px-talk-warn">{reading.origin}</p>}
    </>
  )
}

// ---------------------------------------------------------------------------- say who you mean

function SayWhoYouMean({
  context,
  reviewOn,
  onChoose,
}: {
  context: MessageContext | null
  reviewOn: boolean
  onChoose: (choice: Recipient) => void
}) {
  const [said, setSaid] = useState('')
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState<Resolution | null>(null)
  /** WHY THE ASK FAILED: the caught error's message and its fault, so ErrorNote draws it by its one rule. */
  const [failed, setFailed] = useState<{ message: string; fault: Fault | null } | null>(null)
  /**
   * WHAT THE ANSWER PROVED. `one` names the single agent the words reach, so the press found who they name.
   * `many` and `none` are the two refusals this press draws; they are the product working, and they are not a
   * success of "find them".
   */
  const [outcome, setOutcome] = useState<'worked' | 'failed' | null>(null)

  const ask = () => {
    if (said.trim() === '') return
    setAsking(true)
    setFailed(null)
    setOutcome(null)
    api.resolveAgentRecipient(said, context).then(
      (reply) => {
        setAnswer(reply)
        setOutcome(reply.outcome === 'one' ? 'worked' : 'failed')
        setAsking(false)
      },
      (err: unknown) => {
        setOutcome('failed')
        setFailed({ message: errorMessage(err), fault: faultOf(err) })
        setAsking(false)
      },
    )
  }

  // WHAT TO CALL EACH AGENT THOSE WORDS NAMED. Only the refusal draws a list; one match and no
  // match each draw at most one row, and a row on its own has nothing to collide with.
  const matchNames =
    answer !== null && answer.outcome === 'many'
      ? namesInList(answer.candidates.map((match) => match.candidate))
      : new Map<string, string>()

  return (
    <div className="px-pick-say">
      <p className="px-pick-head">{t('pageWords.Recipients.002')}</p>
      <div className="px-pick-say-row">
        <TextInput
          value={said}
          onChange={setSaid}
          placeholder={t('pageWords.Recipients.003')}
          aria-label={t('pageWords.Recipients.004')}
        />
        <Btn
          size="sm"
          onClick={ask}
          {...(said.trim() === '' ? { disabled: true, reason: t('agentWords.recipients.writeFirst') } : {})}
          pending={asking}
          pendingFailed={outcome === 'failed'}
          pendingSucceeded={outcome === 'worked'}
        >{t('pageWords.Recipients.005')}</Btn>
      </div>

      {failed === null ? null : <ErrorNote message={failed.message} fault={failed.fault} label={t('pageWords.Recipients.006')} />}

      {answer === null ? null : answer.outcome === 'one' ? (
        <div className="px-pick-answer">
          <p className="px-pick-matched">{t('recipients.say.matches', { n: 1 })}</p>
          <ServerNote text={answer.note} />
          <Candidate candidate={answer.recipient} said={said} onChoose={onChoose} />
        </div>
      ) : answer.outcome === 'many' ? (
        <div className="px-pick-answer">
          {/* A REFUSAL, DRAWN AS THE PRODUCT WORKING. Those words name several agents, so Mole Office
              names all of them and lets a person choose, rather than picking one of them. */}
          <p className="px-pick-refused">{t('recipients.say.matches', { n: answer.candidates.length })}</p>
          <ServerNote text={answer.note} />
          {/* THE SAME RULE FOR THE OTHER LIST IN THIS FILE. Words that name three agents draw three
              rows, and three rows nobody can tell apart are a refusal a person cannot settle. */}
          {answer.candidates.map((match) => (
            <Candidate
              key={match.candidate.sessionId}
              candidate={match.candidate}
              said={said}
              name={matchNames.get(match.candidate.sessionId) ?? undefined}
              onChoose={onChoose}
            />
          ))}
          {reviewOn ? (
            <Btn
              variant="ghost"
              size="sm"
              onClick={() => onChoose({ kind: 'unresolved', said, why: answer.note })}
            >{t('pageWords.Recipients.007')}</Btn>
          ) : null}
        </div>
      ) : (
        <div className="px-pick-answer">
          <p className="px-pick-refused">{t('recipients.say.noMatch')}</p>
          <ServerNote text={answer.note} />
          <Btn variant="secondary" size="sm" onClick={() => onChoose(aNewAgent(said))}>{t('pageWords.Recipients.008')}</Btn>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------- the picker

export interface RecipientPickerProps {
  context: MessageContext | null
  /**
   * The ranked answer, READ BY THE COMPOSER AND HANDED DOWN.
   *
   * The composer shows the strongest candidate beside the To control, and this list shows all of
   * them. Both are the same read: two requests would be two rankings, and the one on the button
   * could name a different agent from the one at the top of the list.
   */
  recipients: AsyncState<RecipientsAnswer>
  onChoose: (choice: Recipient) => void
  onClose: () => void
  /** True while comments are being collected, where words that name nobody yet can wait. */
  reviewOn: boolean
}

/**
 * The list: ranked candidates with their reasons, then the rule, then agents that are merely
 * recent, then a new agent, then saying who you mean.
 *
 * THE TWO LISTS ARE KEPT APART AND SO ARE THEIR HEADINGS, both of which are the server's own
 * sentences. Recency is not relevance, and a list that mixed the two would be claiming it is.
 */
export function RecipientPicker({ context, recipients, onChoose, onClose, reviewOn }: RecipientPickerProps) {
  const box = useRef<HTMLDivElement>(null)
  useCloseOnOutsidePress(box, onClose)
  const state = recipients

  return (
    <div
      className="px-pick"
      ref={box}
      role="group"
      aria-label={t('pageWords.Recipients.009')}
      {...partOfMoleOffice({ surface: 'composer.recipient.list' })}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onClose()
        }
      }}
    >
      {state.status === 'loading' ? <Loading what={t('pageWords.Recipients.010')} rows={2} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} label={t('agentWords.recipients.readFailed')} /> : null}
      {state.status === 'ready' ? <Ranked answer={state.value} context={context} onChoose={onChoose} /> : null}

      <Btn variant="secondary" size="sm" onClick={() => onChoose(aNewAgent(null))}>{t('pageWords.Recipients.011')}</Btn>

      <SayWhoYouMean context={context} reviewOn={reviewOn} onChoose={onChoose} />
    </div>
  )
}

function Ranked({
  answer,
  context,
  onChoose,
}: {
  answer: RecipientsAnswer
  context: MessageContext | null
  onChoose: (choice: ChosenRecipient) => void
}) {
  // WHETHER THE RANKING WAS ASKED ABOUT ANYTHING. Read from the same function that built the
  // request, so this panel cannot describe a request that was not made.
  const asked = rankingAsk(context)
  // WHAT TO CALL EACH OF THEM, DECIDED OVER BOTH LISTS AT ONCE, because a person reads the picker
  // as one list of agents and two rows drawing the same name are as useless in different sections
  // as they are in the same one.
  const names = namesInList([...answer.connected, ...answer.recent])
  return (
    <>
      {/* WHAT MOLE OFFICE THINKS YOU POINTED AT, AT THE TOP, WHETHER OR NOT ANYTHING IS RANKED.
          The eighth rule: what Mole Office made of somebody's input is shown back to them, always. It
          used to be drawn only when the ranked list was empty, so a person choosing between three
          agents was never told which object the three were ranked against.
          IT IS A LABEL AND A VALUE, NOT A SENTENCE. The server sent `You pointed at the module
          “X”.` and this drew it word for word; the words were the server's and the reader's eye
          had to cross a sentence to reach a title it already knew. The kind and the title are
          fields, so the label names them and the reader reads two words and a title.
          WHEN THE RANKING COULD NOT BE ASKED ABOUT THIS THING, this says so in its own words. The
          server was asked about nothing and its own reading would tell somebody looking at the chip
          above that they pointed at nothing. */}
      <PointedAt answer={answer} asked={asked} context={context} />

      <p className="px-pick-head">{CONNECTED_HEADING}</p>
      {answer.connected.length === 0 ? (
        // ABSENCE, SAID OUT LOUD, THROUGH THE ONE COMPONENT THAT DRAWS ONE. `looked` is true: Mole Office
        // read the change log and the placements and found nothing, which is an ANSWER and not a
        // gap. It used to be the sentence "No agent is on this list.", which said less than the
        // word does — a reader could not tell it from "nobody has looked" — and cost a line.
        <Absence tier="told-apart" looked />
      ) : (
        answer.connected.map((candidate) => (
          <Candidate
            key={candidate.sessionId}
            candidate={candidate}
            said={null}
            name={names.get(candidate.sessionId) ?? undefined}
            onChoose={onChoose}
          />
        ))
      )}

      {answer.recent.length === 0 ? null : (
        <>
          <p className="px-pick-head">{RECENT_HEADING}</p>
          {answer.recent.map((candidate) => (
            <Candidate
              key={candidate.sessionId}
              candidate={candidate}
              said={null}
              name={names.get(candidate.sessionId) ?? undefined}
              onChoose={onChoose}
            />
          ))}
          {/* WHAT IS NOT ON THE LIST, THROUGH THE ONE COMPONENT THAT IS ALLOWED TO SHORTEN ONE.
              It states the count, names what the hidden part is made of, and gives the route to all
              of them — approved decision 7 — and it refuses to draw a line that does not balance.
              The sentence it replaces ended "Say who you mean below", which named the control
              directly underneath it, and that control carries its own heading. */}
          {answer.recentLeftOut === 0 ? null : (
            <HiddenCount
              shown={answer.recent.length}
              total={answer.recent.length + answer.recentLeftOut}
              groups={[{ label: 'active in this project, connected to nothing you pointed at', count: answer.recentLeftOut }]}
              href={pathFor('agents')}
              what="agents"
            />
          )}
        </>
      )}

      {/* RUNS THAT WROTE TO THIS AND ARE FILED SOMEWHERE ELSE. A count and the projects, because
          that is what the fact is; the reason they cannot be reached from here is the same on every
          reply and is under the pointer rather than on the page. */}
      {answer.context.elsewhere === null ? null : (
        <p className="px-pick-warn">
          <span className="px-pick-warn-word">{ELSEWHERE_LABEL}</span>{' '}
          <span className="num">{String(answer.context.elsewhere.runs)}</span>{' '}
          <span className="px-pick-warn-where">{answer.context.elsewhere.projects.join(', ')}</span>
        </p>
      )}
    </>
  )
}

/**
 * WHAT THE RANKING WAS ASKED ABOUT, IN A LABEL AND A VALUE.
 *
 * Four answers and they are different things, which is why this is not one sentence with branches
 * in it:
 *
 *   the ranking could not be asked about this at all — a page, a message, an unsent instruction;
 *   nothing was pointed at, so the list below is the whole project by recency;
 *   a record was found, and its kind and its title are what the list is ranked against;
 *   nothing is filed behind what was pointed at, and `nothingFiled.code` says which case that is.
 *
 * EVERY ONE OF THEM KEEPS ITS SENTENCE, under the pointer and in the off-screen span, which is the
 * channel contract 8.10.2 names for exactly this. What changed is that the sentence is no longer
 * the thing on the page.
 */
function PointedAt({
  answer,
  asked,
  context,
}: {
  answer: RecipientsAnswer
  asked: unknown
  context: MessageContext | null
}) {
  if (asked === null && context !== null) {
    return (
      <p className="px-pick-none">
        <span className="px-pick-none-word">{NOTHING_RANKED_LABEL}</span>{' '}
        <span className="px-pick-none-what">{objectWord(context)}</span>
      </p>
    )
  }
  const reading = answer.context
  if (reading.record !== null) {
    return (
      <p className="px-pick-none">
        <span className="px-pick-none-word">{RANKED_AGAINST_LABEL}</span>{' '}
        <span className="px-pick-none-what">{reading.record.kind}</span>{' '}
        <span className="px-pick-none-title">{reading.record.title}</span>
        {reading.record.deleted ? <span className="px-pick-none-word"> {DELETED_LABEL}</span> : null}
      </p>
    )
  }
  if (reading.nothingFiled !== null) {
    const said = reading.nothingFiled
    return (
      <>
        <p className="px-pick-none">
          <span className="px-pick-none-word">{NOTHING_FILED_LABELS[said.code]}</span>
        </p>
        <ServerNote text={said.detail} />
      </>
    )
  }
  // NOTHING WAS POINTED AT, so nothing is ranked and the list below is the whole project by
  // recency. The second half of that used to be a sentence here; it is the heading over the list
  // it describes, which is where a reader meets it anyway.
  return (
    <p className="px-pick-none">
      <span className="px-pick-none-word">{NOTHING_POINTED_AT_LABEL}</span>
    </p>
  )
}
