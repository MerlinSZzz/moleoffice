// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t, content, type WordKey } from '@shared/i18n.ts'
import { gapBetween } from '@shared/spacing.ts'
/**
 * SETTLING A FORK, ON THE PROPOSAL ITSELF, BY THE PERSON IT BELONGS TO.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Promoting a proposal into a decision is the one act Mole Office refuses to every agent, and until this
 * file it was also the one act the product offered no way to do. The owner settled two forks in
 * writing, went to record them, and had to know two opaque nanoids, search for them, tell apart the
 * records that MENTION an id from the record whose id it is, open an agent's message and copy a
 * `curl` line out of it.
 *
 * So: `DecisionQueue` (its own file) says on Home that something is waiting, with a link straight
 * to it, and `ProposalGovernance` here sits on the proposal and settles it. No id is typed or seen.
 *
 * ---------------------------------------------------------------------------------------
 * THE FOUR REGIONS, AND WHY THEY ARE DRAWN APART
 * ---------------------------------------------------------------------------------------
 *
 * A review of this surface found the question, the options, the recommendation and the human action
 * set in one size and one weight, one after another, so that none of them could be told from the
 * others without reading every sentence. They are now four regions with different STRUCTURE, in the
 * order a person needs them:
 *
 *   1  THE ASK          the question, in the largest type on the panel. Its background folds away.
 *   2  THE CHOICES      one bordered card per option, each with its own letter in a left gutter.
 *   3  THE PICK         a monochrome chip in the card the recommendation names, and nowhere else.
 *   4  WHAT YOU DO      an `--ask` band holding the two real answers: decide, or leave it open.
 *
 * ENCLOSURE IS THE CHANNEL THIS SPENDS, NOT COLOUR. Three options are three peers and a border is
 * what says so; a hue on each would say they are three states, which is the only thing colour means
 * in this product. The panel carries exactly two hues: `--ask` on the human action — the contract's
 * one permitted home for it — and `--st-blocked` on an unresolved operation, which genuinely is a
 * blocked state. The agent's pick is a monochrome chip, because an opinion is not a state and a hue
 * would make it read as an instruction.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * IT IS NOT A SECOND WRITE PATH. The button posts to `POST /api/records/<id>/promote`, the same
 * route an agent is refused at, with the same guard on the other side. What makes this work is that
 * the browser is acting as the human — who you are writing as, which is set on the Settings page —
 * and nothing here weakens, spoofs or bypasses that. Set it to an agent and press the button and
 * the server refuses it, which is the correct behaviour and is what the refusal below shows.
 *
 * IT DOES NOT CARRY THE AGENT'S REASONING ACROSS. The promote route has no key for it, deliberately:
 * a decision is the person's words about why, and copying an agent's paragraph into a human-only
 * record would make the change log say something that is not true. The fork's reasoning stays on the
 * fork, which the decision links back to. The option picker therefore stores LETTERS in
 * `alternatives_rejected` — the person's own act of rejection — and never the agent's sentences.
 *
 * Home can mount this in a reading pane and settle a fork without leaving the page. Record inputs
 * are props; the settled panel reads participant names when the caller has not supplied them.
 */

import { useState } from 'react'
import { api, errorMessage, faultOf, getActor, type Fault, type ParticipantOnTheWire, type ParticipantsReply, type RecordDetail } from '../api.ts'
import { theAgentAStoredSenderNames } from '@shared/messages.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { RESOLVES_PROPOSAL, type ActorType } from '@shared/types.ts'
import type { ResolvingDecision } from '../../server/lib/records.ts'
import { useInspect } from '../lib/mode.ts'
import { Absence, Btn, ErrorNote, Field, Hint, Panel, Stamp, Tag, TextArea, WordsAroundAStamp, type PanelTone } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { useWriteThisRecord } from './AnotherWriter.tsx'
// WHAT A CARD IS, said on the card. See the header of src/shared/targets.ts.
import { targetAttributes, textAttributes } from '@shared/targets.ts'
// WHICH SECTION OF THE FORK EACH PART OF THE PANEL DRAWS. The keys are declared once, beside the
// table that says a fork's panel draws them; the writer of the attribute is `declaredAttributes`,
// which is the one function in this product that writes a `data-target`.
import {
  BECAUSE_KEY,
  EVIDENCE_KEY,
  OPTIONS_KEY,
  QUESTION_KEY,
  RECOMMENDATION_KEY,
  RESULT_WILL_BE_USED_TO_KEY,
  REVISIT_WHEN_KEY,
  datedWordsIn,
  titleOfSection,
} from '@shared/sections.ts'
// WHICH HALF OF A DECISION EACH FIELD IS. Criterion P76: the split is declared on the fields, so the
// page and the guard cannot come to different answers about what the decision itself is.
import { decisionFieldsIn, THE_OWNER, type FieldSpec } from '@shared/kinds.ts'
import { declaredAttributes, type Declares } from './declares.ts'
import { sectionsOf, theRegion, titleHere } from './sections.ts'
import { DRAWS_THE_NAME } from './agent/pointing.ts'
import type { Decision } from './home/decisions.ts'
// THE ONE COMPONENT THAT DECIDES WHERE A RECORD ID SITS. Consumed, never copied: their section 9
// wants one placement across every card in the product, and six copies of "monospace, small,
// quiet, bottom right" is six things that drift with nothing failing when one of them does.
import { RecordId } from './RecordId.tsx'
import { recordPath, RouteLink } from './router.tsx'
import { kindWord } from '@shared/words.ts'
import { en } from '@shared/words/en.ts'
import { deltaIn, summariseDelta, type Delta, type DeltaOp } from '@shared/delta.ts'
// The fork reading is shared with GET /api/needs-you, so Home's badge and this page cannot
// disagree about whether an agent picked an option. See src/shared/proposal.ts.
import {
  optionCards,
  pickedOption,
  rejectedBy,
  takenOption,
  TAKE_NONE,
  type OptionCard,
  type TakenOption,
} from '@shared/proposal.ts'

// ============================================================================ reading the options

/**
 * One option, with the letter it is known by.
 *
 * THE AUTHOR'S OWN LETTER WINS WHERE THERE IS ONE. Three of the four forks in this corpus label
 * their options `a — …`, `b — …`, and their recommendation then says "(a)". If this component
 * numbered the cards itself and left the author's prefix in the text, one option would carry two
 * labels — the defect this repository keeps finding, in miniature. So a leading `x — ` becomes the
 * option's name, moves into the gutter, and is taken out of the body; an option with no such prefix
 * is given the letter of its position instead, and nothing is removed from it.
 */
/**
 * How long a question has to be before it is set as a paragraph rather than as a headline.
 *
 * Measured rather than guessed: at `--fs-5` inside the reading measure this is about three lines,
 * which is where a headline stops looking like one. It lives beside the component that reads it and
 * nowhere else, so there is no second copy to disagree with it.
 */
const LONG_QUESTION = 240

/**
 * WHERE THE OWNER'S ANTI-WASTE FIELD LIVES ON A PROPOSAL. One spelling, read by the card that draws
 * it and by the composer that asks for it, so the two cannot come to name different keys.
 *
 * The FIELD itself is declared in src/shared/kinds.ts, which is what `GET /api/kinds` serves and
 * what a `POST` validates against. This is the key, not a second declaration of the field.
 *
 * THE SPELLING MOVED TO src/shared/sections.ts ON 31 AUGUST 2026 and this is a re-export of it.
 * `IN_HEADLINE` and `DRAWN_BY_THE_HEADLINE` there both name the field now, and a table naming one
 * key while this panel read another is precisely the drift the const was made to stop. The name is
 * kept because the composer imports it from here and `tests/a-proposal-says-what-the-answer-is-for`
 * reads it off this module.
 */
export const RESULT_WILL_BE_USED_TO = RESULT_WILL_BE_USED_TO_KEY


// ============================================================================ reading a change set

/**
 * WHAT A CHANGE SET WOULD DO, in one line, with no term dropped and no term invented.
 *
 * The line this replaces read: *"If you agree, this would **9** things to the project: 9 created, 0
 * changed, 0 joined, 0 given time"* — a missing verb, the same 9 twice, three zeros, and a total
 * that disagreed with the eleven rows listed under it. Only non-zero counts are named here, because
 * a zero is the absence of a statement rather than a statement; what IS said, when nothing that
 * already exists would move, is that nothing that already exists would move — which is the
 * reassurance the three zeros were failing to give. The unresolved operations are deliberately not
 * in this line: they are drawn above it, loudly, because they are the whole of what a person can
 * currently do about the change set.
 */
const DELTA_KEYS = {
  create_record: 'decisions.delta.create_record',
  set_field: 'decisions.delta.set_fields',
  link: 'decisions.delta.link',
  allocate: 'decisions.delta.allocate',
  reuse_record: 'decisions.delta.reuse',
  unresolved: 'decisions.delta.unresolved',
} satisfies Record<DeltaOp['op'], WordKey>

/**
 * Which project a waiting row belongs to. A name nobody could read is never quoted as if it were the
 * project's name: in normal mode it is the short mark, with the sentence on its tooltip (problem
 * Ab1IFMIvEYAf); developer mode shows the stored id instead.
 */
export function whereItWaits(row: Pick<Decision, 'workspaceId' | 'workspaceTitle'>, inspect: boolean): React.ReactNode {
  if (row.workspaceTitle) return t('decisions.inProject', { project: row.workspaceTitle })
  return inspect ? t('decisions.inProject', { project: row.workspaceId }) : <Absence title={t('decisions.unnamedProject')} />
}

export function deltaOutcome(delta: Delta): string {
  const s = summariseDelta(delta)
  const clauses: string[] = []
  if (s.creates > 0) {
    const kinds = new Map<string, number>()
    for (const op of delta.ops) if (op.op === 'create_record') kinds.set(op.kind, (kinds.get(op.kind) ?? 0) + 1)
    const named = [...kinds].map(([kind, n]) => t('decisions.delta.named', { n, kind: kindWord(kind).text })).join(', ')
    clauses.push(t('decisions.delta.creates', { n: s.creates }) + (named === '' ? '' : ` — ${named}`))
  }
  if (s.fields > 0) clauses.push(t('decisions.delta.fields', { n: s.fields }))
  if (s.links > 0) clauses.push(t('decisions.delta.links', { n: s.links }))
  if (s.allocations > 0) clauses.push(t('decisions.delta.allocations', { n: s.allocations }))
  if (clauses.length === 0) return s.reuses > 0
    ? t('decisions.delta.reusesOnly', { n: s.reuses }) : t('decisions.delta.noChange')
  let outcome = clauses.join(t('decisions.delta.separator')) + t('decisions.delta.stop')
  if (s.fields === 0 && s.links === 0 && s.allocations === 0) outcome += ' ' + t('decisions.delta.untouched')
  if (s.reuses > 0) outcome += ' ' + t('decisions.delta.reuses', { n: s.reuses })
  return outcome
}

/** Some callers carry the decision without the link that settled the fork. */
export type SettlingDecision = Pick<ResolvingDecision, 'id' | 'title' | 'deleted'> &
  Partial<Pick<ResolvingDecision, 'linkedBy' | 'linkedByType' | 'linkedAt' | 'replacedBy'>>

export interface ProposalGovernanceProps {
  recordId: string
  /**
   * The fork's own title, as the page above this one draws it.
   *
   * NOTHING HERE READS IT ANY MORE, and that is the change rather than an oversight. It used to be
   * the example under a box asking the person to write a title for their decision, and that box is
   * gone: the decision's title is written from the option taken. The prop stays because both
   * callers pass it and because a panel that draws a fork should be able to say which fork.
   */
  title: string
  /** The fork's own fields, as stored. Read here rather than restated. */
  data: Record<string, unknown>
  /** Whether a decision already links back to it. Settled forks show what settled them instead. */
  resolved: boolean
  /**
   * The decisions that settled it, when the caller has them. OPTIONAL, and its absence is drawn AS
   * absence: a settled fork whose caller did not pass this says it is settled and does not pretend
   * to know by what. `GET /api/records/:id` sends it as `resolution.by`.
   */
  settledBy?: readonly SettlingDecision[]
  /** Names already read by the caller, when available. */
  participants?: ParticipantsReply
  /**
   * What each settling decision itself STORES, by its id, when the caller has the record loaded.
   *
   * It is what says which option was taken: `takenOption` reads that back out of the decision's
   * `alternatives_rejected`. OPTIONAL for the same reason `settledBy` is — Home mounts this panel
   * from a queue that has not loaded the decision — and a caller without it gets a panel that says
   * the option is not known here rather than one that guesses.
   */
  decisionData?: ReadonlyMap<string, Record<string, unknown>>
  /**
   * WHICH PROJECT THE FORK IS IN, when the caller knows it is not the one on screen.
   *
   * The record page leaves it out: it is already reading that project, so the request says nothing
   * and is answered about it, like every other write on the page. Home's decision desk passes it,
   * because the queue it draws spans projects and the decision belongs where the fork is.
   */
  workspaceId?: string
  /**
   * TRUE WHERE THE READER HAS ALREADY PRESSED "Decide it" — the decisions band on Home.
   *
   * Two things follow, and they are one situation rather than two settings. The panel drops its own
   * title and the mark saying why only a person may decide, because the band above it carries both
   * and the same rule explained twice a few inches apart is the duplication this pass was asked to
   * remove — with four cards open it was five copies on one screen. And the choices open at once,
   * because the press that mounted this WAS the press that asks for them.
   *
   * WHAT THIS SETTING NO LONGER DECIDES. It used to be the reason there was no second press at all:
   * the reader had pressed "Decide it" to get here, so asking them to press again read as the same
   * question twice. That no longer holds: a decision takes two steps, pressing Decide it and then
   * confirming, and criterion P89 puts the confirm press on every surface, this one included. The
   * two presses are not one question asked twice: the first says WHICH, the second says YES.
   */
  inline?: boolean
  /**
   * WHICH SECTION OF THE FORK EACH PART OF THIS PANEL DRAWS, worked out by the surface that mounts
   * it and spelled by nobody here.
   *
   * It is `sectionsOf(record)` from src/web/components/sections.ts. This panel draws the question,
   * the options and the recommendation — three of the fork's own stored fields, and three of the
   * parts the owner's second dogfood screenshot right-clicked and was answered the whole proposal
   * about, six presses out of six on 30 August 2026. Each now says which section it is, so a press
   * on *3 options* answers the options.
   *
   * THE READER IS PASSED IN RATHER THAN BUILT HERE, for the reason `Implementation` and `Evolution`
   * take a `declares` prop: `sectionsOf` needs the record's kind, its stored data, its one-line
   * summary and the relation of every link on it, and the surface that mounts this panel has all
   * four. Working them out here would be a second reading of what this page is made of.
   */
  sections: (key: string) => Declares
  /**
   * THE DECISIONS ALREADY MADE THAT NAME THIS FORK, from `decisionsThatNameIt` on the record's own reply. OPTIONAL:
   * Home's queue does not read it, and a caller without it draws no press to close the fork by one.
   */
  alreadyDecided?: readonly DecisionThatNamesIt[]
  onSettled: () => void
}

/** One decision the fork may be closed by. Mirrors `decisionsThatNameIt` in src/web/api.ts. */
export type DecisionThatNamesIt = NonNullable<RecordDetail['decisionsThatNameIt']>[number]

/**
 * THE OWNER'S PIN, AND THE PRESS THAT PUTS IT ON OR TAKES IT OFF. Criterion M118.
 *
 * A PIN IS THE OWNER'S OWN STATEMENT that a fork matters more than its other facts say, so
 * `assertMayPinAFork` in src/server/lib/records.ts refuses the write to every agent, on create and
 * on change. The press is therefore drawn to the person and to nobody else, in the same way every
 * other human-only control in this product is drawn: `getActor().type === 'human'`.
 *
 * IT WRITES THE ONE FIELD the kind declares for it, `data.pinned`, through the door that already
 * exists — the same PATCH /api/records/:id the rest of this panel settles a fork with. Taking it
 * off is the same write with the other value, because their own rule says taking a pin off is pinning
 * in the other direction.
 */
function PinTheFork({
  recordId,
  pinned,
  onChanged,
}: {
  recordId: string
  pinned: boolean
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<{ message: string; fault: Fault | null } | null>(null)
  const write = useWriteThisRecord(recordId, 'drawn')
  if (getActor().type !== 'human') return null

  async function setPin(next: boolean): Promise<void> {
    setBusy(true)
    setFailed(null)
    try {
      // ON THE RECORD PAGE THE PRESS ASKS FIRST when another writer changed the fork since the page drew it, as the
      // edit form does (src/web/components/AnotherWriter.tsx), so a pin is not set on a fork the person has not seen.
      const written = await write({ dataPatch: { pinned: next } })
      if (!('notNow' in written)) onChanged()
    } catch (err) {
      setFailed({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-pin">
      <Btn
        size="sm"
        variant={pinned ? 'secondary' : 'ghost'}
        pending={busy}
        onClick={() => void setPin(!pinned)}
        title={
          pinned
            ? t('decisions.unpinReason')
            : t('decisions.pinReason')
        }
      >
        {pinned ? t('decisions.unpin') : t('decisions.pin')}
      </Btn>
      {failed === null ? null : <ErrorNote message={failed.message} fault={failed.fault} label={t('decisions.pinFailed')} />}
    </div>
  )
}

/** The fork, readable, with the act attached. */
export function ProposalGovernance({
  recordId,
  data,
  resolved,
  settledBy,
  participants,
  decisionData,
  workspaceId,
  inline = false,
  sections,
  alreadyDecided,
  onSettled,
}: ProposalGovernanceProps) {
  const options = Array.isArray(data['options']) ? (data['options'] as unknown[]).map(String) : []
  const question = typeof data['question'] === 'string' ? data['question'] : null
  const because = typeof data['because'] === 'string' ? data['because'] : null
  const revisit = typeof data['revisit_when'] === 'string' ? data['revisit_when'] : null
  const evidence = Array.isArray(data['evidence']) ? (data['evidence'] as unknown[]).map(String) : []
  const recommendation = typeof data['recommendation'] === 'string' ? data['recommendation'] : null
  // WHAT THE ANSWER WILL BE USED TO DO. Read off the record like every other field on this panel;
  // the key is declared in src/shared/kinds.ts and served by GET /api/kinds, never spelled a second
  // time anywhere a reader could change one copy and not the other.
  const usedTo = typeof data[RESULT_WILL_BE_USED_TO] === 'string' && data[RESULT_WILL_BE_USED_TO].trim() !== ''
    ? (data[RESULT_WILL_BE_USED_TO] as string)
    : null

  const cards = optionCards(options)
  const picked = pickedOption(recommendation, cards)
  const delta = deltaIn(data)
  // ONE WRITE SETTLES THIS FORK AT A TIME. A decision written from the form and a close by a decision already made
  // each settle it, from two blocks drawn one above the other. Each block kept its own saving state, so while one
  // write was saved the other block's presses stayed on. A decision pressed during a close was written, and then the
  // close was written too: the fork was settled by two decisions that took different options. A close pressed during
  // a decision was written, and then the decision was refused, with nothing on the page saying so. Both states are
  // kept here, so each block can see the other's.
  const settling = useSettling(recordId, workspaceId, onSettled)
  const [closing, setClosing] = useState(false)
  const [replaceRead, reloadReplaceRead] = useProjectAsync(
    () => resolved ? Promise.resolve([]) : api.forkReplaceCandidates(recordId, workspaceId),
    [recordId, workspaceId, resolved],
  )

  // A SETTLED FORK KEEPS ITS PANEL, AND KEEPS THE FORK IN IT. Before this the panel named the
  // decision and nothing else, and the record page draws no other reading of a proposal — every
  // one of its fields is claimed by `IN_HEADLINE`, and `KindLead` has no proposal case — so
  // settling a fork took the question, the options and what would reopen it off the screen
  // entirely. The owner settled one and could not find it again.
  if (resolved) {
    return (
      <>
        <SettledPanel
          recordId={recordId}
          settledBy={settledBy}
          participants={participants}
          decisionData={decisionData}
          question={content(question)}
          usedTo={content(usedTo)}
          cards={cards}
          picked={picked}
          recommendation={content(recommendation)}
          revisit={content(revisit)}
          sections={sections}
          {...(workspaceId === undefined ? {} : { workspaceId })}
          onSettled={onSettled}
        />
        {delta === null ? null : <ApplyPanel recordId={recordId} delta={delta} onApplied={onSettled} />}
      </>
    )
  }

  const body = (
    <>
      {/* THE OWNER'S PIN, at the top of the fork it is about. It draws nothing for an agent, and
          the button says which way it will write: Pin when it is not, Unpin when it is. */}
      <PinTheFork recordId={recordId} pinned={data['pinned'] === true} onChanged={onSettled} />

      {/* ---------------------------------------------------------------- 1. the ask */}
      {question === null ? (
        // The title of the fork is directly above this, on the card and on the record page both, so
        // the sentence that used to say so has gone. What is left is the absence itself.
        <p className="px-gov-q px-gov-none"><Absence title={t('decisions.noQuestion')} /></p>
      ) : (
        // A HEADLINE AND A PARAGRAPH ARE NOT SET THE SAME WAY, and a fork's question is sometimes
        // both. Two of the four in this corpus are one line; one is twelve, and at headline size and
        // weight it was a wall of bold that nobody would read to the end of — which matters here
        // more than anywhere, because on that record the sentence actually being ASKED is the last
        // one. Nothing is split, clamped, reordered or hidden: the whole question is on screen
        // either way, and only how it is set changes. It is still the largest reading matter on
        // the panel in both cases.
        <h3
          className="px-gov-q"
          data-long={question.length > LONG_QUESTION ? '1' : undefined}
          {...declaredAttributes(sections(QUESTION_KEY))}
          {...textAttributes(`data.${QUESTION_KEY}`, 0)}
        >
          {content(question)}
        </h3>
      )}

      {/* ------------------------------------------------- 1b. what the answer will be used to do
          THE OWNER'S OWN FIELD, drawn whether or not it is filled in: *"A Proposal should make the
          human answer, explicitly or structurally: Result will be used to: ______"*. A fork whose
          answer nobody would act on is a fork worth not asking, and that is only visible if the
          blank is on the card. It sits directly under the question, above everything behind a
          press, because it is what the person about to decide is spending their afternoon on. */}
      {/* THIS COPY OWNS THE FIELD, AND IT IS THE ONLY ONE. The fold stack used to print the same
          sentence again below the options, and the two answered different things — see the long
          note on `DRAWN_BY_THE_HEADLINE` in src/shared/sections.ts, which is where the decision is
          written down. `IN_HEADLINE` now claims the key, so the stack no longer draws it. */}
      <p className="px-gov-for" {...declaredAttributes(sections(RESULT_WILL_BE_USED_TO_KEY))}>
        <span className="px-gov-for-lead">{t('decisions.usedTo')}</span>
        {usedTo === null ? (
          /* NOBODY LOOKED, NOT "THERE IS NONE". An unanswered box means the writer did not say what
             the answer would be spent on; it never means the answer is for nothing, and Mole Office does
             not fill it in. The dashed mark keeps that distinction; its explanation uses the page
             language. */
          <Absence
            tier="told-apart" looked={false} word={t('absence.mark')}
            title={t('decisions.noUse')}
          />
        ) : (
          <span className="px-gov-for-said" {...textAttributes(`data.${RESULT_WILL_BE_USED_TO_KEY}`, 0)}>
            {content(usedTo)}
          </span>
        )}
      </p>

      {/* THE TWO FOLDS ARE THE AUTHOR'S OWN WRITING AND EACH IS A SECTION OF THE FORK. Measured on
          `0YUEycqbpimi` and `h6O_RMpeYBTD`, 31 August 2026: a press on either summary, on the
          paragraph under the first, or on any of the three evidence lines answered the whole
          proposal. Each evidence line is a region of its own — `data.evidence[0]` — which is the
          id `recordRegionsOf` derives for a list drawn by a kind's own panel, so a comment left on
          one line is found again on that line and not on the list. */}
      <div className="px-gov-folds">
        {because === null ? null : (
          <details className="px-gov-fold" {...declaredAttributes(sections(BECAUSE_KEY))}>
            <summary>{t('decisions.whyCameUp')}</summary>
            <p {...textAttributes(`data.${BECAUSE_KEY}`, 0)}>{content(because)}</p>
          </details>
        )}
        {evidence.length === 0 ? null : (
          <details className="px-gov-fold" {...declaredAttributes(sections(EVIDENCE_KEY))}>
            <summary>{t('decisions.evidenceCount', { n: evidence.length })}</summary>
            <ul className="px-gov-ev">
              {evidence.map((line, i) => (
                <li key={i} {...theRegion(recordId, `data.${EVIDENCE_KEY}[${String(i)}]`)}>
                  {content(line)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* ------------------------------------------ 2, 3 and 4. the choices, and the act beside them
          The options ARE the picker, and the fields sit in a column beside them at a desk width.
          They used to be a list of cards and then, under a button, the same three options again as
          radios with two text boxes and a submit below THOSE — so settling a three-option fork meant
          reading every option twice and scrolling past the second copy to reach the control. */}
      <Decide
        settling={settling}
        closing={closing}
        replacesCandidates={replaceRead.status === 'ready' ? replaceRead.value : undefined}
        replacesLoading={replaceRead.status === 'loading'}
        onRetryReplacements={reloadReplaceRead}
        cards={cards}
        picked={picked}
        recommendation={content(recommendation)}
        revisit={content(revisit)}
        inline={inline}
        sections={sections}
      />

      {/* ------------------------------------------ 5. or close it by a decision already made */}
      {alreadyDecided === undefined || alreadyDecided.length === 0 ? null : (
        <CloseByADecisionAlreadyMade
          recordId={recordId}
          decisions={alreadyDecided}
          closing={closing}
          onClosing={setClosing}
          deciding={settling.busy}
          onSettled={onSettled}
        />
      )}

      {/* --------------------------------------------- what one of them would do to the project */}
      {delta === null ? null : (
        <ChangeSet delta={delta} under={picked === null ? null : (cards[picked] as OptionCard).letter} />
      )}
    </>
  )

  // MOUNTED ON HOME, THIS PANEL HAS NO TITLE AND NO CHROME OF ITS OWN. The band it sits in is
  // already called "Decisions waiting on you" and already says why only a person may do this, so a
  // second panel called "Waiting on you" with the same rule under it was one fork explained twice
  // on one screen, a few inches apart.
  if (inline) {
    return (
      <div className="px-gov-inline">
        <style href="mole-office-governance" precedence="default">
          {GOVERNANCE_CSS}
        </style>
        {body}
      </div>
    )
  }

  return (
    // NO EYEBROW. It read "only a person may settle this" — the word settle, the word person and
    // the whole sentence were the page explaining its own rule above a title that already says
    // "Waiting on you". The rule that is worth knowing is behind the small round question mark
    // beside the buttons, in plain words.
    //
    // SEE-THROUGH ON PURPOSE, AND THIS PANEL IS THE CASE `Declares` NAMES FOR IT: *a panel drawn
    // inside a record's own page, where the record around it is the better answer and stays the
    // answer*. This panel IS the fork — the question, what the answer is for, why it came up, what
    // it rests on, the options and the act — and the fork is the record. Each of those parts now
    // carries its own section, so the record answers only a press on the panel's own title, which
    // is a press on the whole fork. A section keyed on the panel would be a second name for the
    // record.
    <Panel titleIs="label" declares={{ surface: null }} title={t('decisions.title')} rank={0} tone="ask">
      <style href="mole-office-governance" precedence="default">
        {GOVERNANCE_CSS}
      </style>
      {body}
    </Panel>
  )
}

// ============================================================================ the card

/**
 * ONE FORK, AS A CARD YOU CAN DECIDE IN. THE ONE PLACE A DECISION CARD IS DRAWN.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS HERE AND NOT IN THE BAND THAT MOUNTS IT
 * ---------------------------------------------------------------------------------------
 *
 * It was in `home/DecisionTiles.tsx`, and the panel it opens — the question, the options, the
 * reasoning box and the act — has always been in this file. So a decision card was drawn in two
 * files, and two of this campaign's waves each named a third file, `DecisionCard.tsx`, that does not
 * exist. Whichever of the two an implementer edited, the other went on drawing the old card, and a
 * dogfood asking somebody to "open a decision and press option B" passed or failed depending on
 * which surface the tester opened.
 *
 * ONE OWNER FROM THIS COMMIT: this file. `DecisionTiles` renders this rather than drawing its own,
 * the governance queue renders `DecisionTiles`, and the record page mounts `ProposalGovernance`
 * directly — so there is one card, at three addresses, and a change to it lands once.
 *
 * WHAT IT DRAWS THAT THE PANEL DOES NOT: the author's own title, which project this belongs to,
 * what it is holding up by name, and anything the server could not read on it. The question, the
 * options, the reasoning and the act itself are `ProposalGovernance`'s and are not repeated — two
 * drawings of one fork on one screen is what the band was rebuilt to stop.
 *
 * A CARD AT REST IS ITS TITLE, and the owner's review is why: *"Only the title is needed, the
 * descriptions below could be expanded when mouse on or click but not by default."* Four short cues
 * sit under it — how many ways there are to go, whether one is recommended, how long it has sat,
 * and which project it is in — and everything else is behind the one press.
 *
 * PRESS, NOT HOVER. Hover opens nothing on the phone the owner photographed this on. A native
 * `details` works from the keyboard with no handler, survives find-in-page, and a screen reader
 * announces it.
 */
export function DecisionCard({
  row,
  here,
  onOpen,
  onSettled,
  inspect,
}: {
  row: Decision
  here: string
  onOpen: (row: Decision) => void
  onSettled: () => void
  inspect: boolean
}) {
  return (
    <li
      className="dq-tile"
      data-pinned={row.pinned ? '1' : undefined}
      {...targetAttributes({ kind: 'record', recordId: row.recordId, workspaceId: row.workspaceId })}
    >
      {/* THE PIN, AS A STAR IN THE CORNER AND NEVER AS A COLOUR. Their brief asks for exactly this and
          says why: colour in this product already carries state, and "priority emphasis must remain
          coherent". The word is on the element, so a screen reader and a pointer both get the
          sentence rather than a shape. */}
      {row.pinned ? (
        <span className="dq-pin" title={t('decisions.pinned')}>
          <span className="sr-only">{t('decisions.pinned')}</span>
          <span aria-hidden="true">★</span>
        </span>
      ) : null}
      {/* THE FIRST THING ON THE CARD IS THE THING. Everything else on it is a cue about this
          sentence, so nothing may stand above it. */}
      <button type="button" className="dq-title" onClick={() => onOpen(row)} title={t('decisions.openRecord')}>
        {content(row.title)}
      </button>

      {/* ABOUT A LINE OF THE QUESTION, WHICH IS WHAT LOCATES THE FORK — their section 8: *"show only
          about 1–1.5 lines of the question/summary"*. A title alone locates a fork only for
          somebody who already knows it.

          IT IS THE AUTHOR'S WORDS AND NOT THE INTERFACE'S, and the class says so: `px-fork-words`
          is what tests/drawn.ts reads to tell a screen's own prose from stored content.

          CLAMPED BY CSS, NEVER CUT IN THE DATA, and hidden altogether once the card is open, so the
          full question below it is never the same sentence twice. */}
      {row.lede === null ? null : (
        <p className="dq-lede px-fork-words" title={content(row.lede)}>
          {content(row.lede)}
        </p>
      )}

      {/* THE CUES, IN ONE LINE. Which group this is in and why it is where it is (the chip), how
          long it has sat (two characters — see `waitedOf`), how much is behind it, what could not
          be read on it, how many other questions it now stands for, and where it lives. None of
          them is a sentence and none of them repeats the title. */}
      <div className="dq-cues">
        <span className="dq-chip" data-rec={row.namesAnOption ? '1' : row.recommendationWritten ? 'words' : '0'}>
          {row.chip}
        </span>
        {/* THE AGE, SHORT AND AWAY FROM THE TITLE. The whole phrase is on the element, so a screen
            reader and a pointer both get "waiting 2 days" rather than "2d". */}
        <span className="dq-age" title={row.waited}>
          <span className="sr-only">{row.waited}</span>
          <span aria-hidden="true">{row.waitedShort}</span>
        </span>
        {/* SOMEBODY COULD BE HURT. The server reads this off the WORK the fork is holding up, not off
            the fork's own words — `priority.safety` in src/server/lib/forks.ts — and it is the one
            fact that outranks everything below the owner's own pin. A mark and a word, no hue: the
            colours on this surface already mean "waiting on a person". */}
        {row.priority.safety ? (
          <span className="dq-mark" data-mark="safety" title={t('decisions.safetyReason')}>
            {t('decisions.safety')}</span>
        ) : null}
        {row.blocking > 0 ? (
          <span className="dq-blocking">
            {t('decisions.holdingUp', { n: row.blocking })}
          </span>
        ) : null}
        {/* HOW MANY OTHER QUESTIONS THIS ONE NOW CARRIES. Their section 7 asks for a duplicate or
            superseded count on the row where it is relevant. The server's own sentence for each is
            on the element and the whole list is inside the card. */}
        {row.standsFor.length === 0 ? null : (
          <span
            className="dq-mark"
            data-mark="stands-for"
            title={inspect ? row.standsFor.map((gone) => gone.sentence).join(' ') : undefined}
          >
            {t('decisions.standsFor', { n: row.standsFor.length })}
          </span>
        )}
        {/* WHAT MOLE OFFICE COULD NOT READ, COUNTED ON THE CLOSED ROW. The sentences themselves are
            inside, but a fork missing one of its options must not look complete from the outside. */}
        {row.unreadable.length === 0 ? null : (
          <span className="dq-mark" data-mark="unread" title={inspect ? row.unreadable.join(' ') : undefined}>
            {t('decisions.unreadable', { n: row.unreadable.length })}
          </span>
        )}
        {/* SOMETHING HERE WAS DONE ON THE OWNER'S OWN WORDS. Four words and their sentence on the
            element, because this is the one mark on the row that says an agent did something only they
            may do. The words are drawn whole on the record's own page, with the press that takes the
            act back; here they are what the pointer and a screen reader get, so the row does not
            grow a paragraph. `ON_THE_OWNERS_WORDS` is written once, in @shared/warrant.ts, and the
            waiting list draws the same four words from the same place. */}
        {row.onThePersonsWords === null ? null : (
          <span
            className="dq-mark"
            data-mark="the-persons-words"
            title={content(row.onThePersonsWords.warrant.words)}
          >
            {t('decisions.onYourWords')}
          </span>
        )}
        {/* THE NAME IS QUOTED, and src/web/lib/projects.ts says why: the catch-all project is
            called "Not in a project", so this chip read "in Not in a project". */}
        {(
          <span className="dq-where">{whereItWaits(row, inspect)}</span>
        )}
      </div>

      {/* Inspect keeps the stored reference in the shared RecordId placement. */}
      {inspect ? <RecordId id={row.recordId} where="card" /> : null}
      {/* THE TWO WAYS ON, TOGETHER: settle it here, or go to the record. */}
      <div className="dq-acts">
        <DecideHere row={row} onSettled={onSettled} inspect={inspect} here={here} />
        {/* THE WAY OUT IS STILL THERE, QUIETLY, AND IT IS NOW ON THE CLOSED ROW. Deciding is not the
            only thing a person does with a fork — the record page holds its links, its history and
            everything else about it — and it used to be reachable only after opening the form. */}
        <button type="button" className="dq-decide-open" onClick={() => onOpen(row)}>
          {t('decisions.openFull')}</button>
      </div>
    </li>
  )
}

/**
 * THE PRESS THAT STARTS DEALING WITH IT, AND EVERYTHING THAT PRESS OPENS.
 *
 * ---------------------------------------------------------------------------------------
 * THE FORM IS BUILT WHEN IT IS ASKED FOR, NOT WHEN THE PAGE IS DRAWN
 * ---------------------------------------------------------------------------------------
 *
 * Measured in a browser at 1440 on 27 August 2026: Home held 162 closed `details` elements, 98
 * radio buttons, 26 text boxes and 26 "Record this decision" buttons before anybody pressed
 * anything. Every one of the twenty-six decision forms was fully built and folded away. Their brief,
 * section 8: *"Home should not render every Waiting on you item as a full Decision form."*
 *
 * So the body is mounted the first time this fold is opened and not before. `built` is what says it
 * has been opened; the `details` element still owns whether it is showing, so the keyboard, the
 * browser's own find-in-page and a screen reader all work exactly as they did.
 *
 * IT STAYS MOUNTED ONCE IT HAS BEEN OPENED. Closing a card must not throw away a half-written
 * reason, and a person who opens the same fork twice is not asking for a blank box.
 *
 * WHAT IS DRAWN HERE is what `ProposalGovernance` does not draw: the author's own line where it
 * says something the question does not, which project this belongs to, what it is holding up by
 * name, which other questions it now stands for, and anything the server could not read on it.
 *
 * THE WORDS ON THE CONTROL ARE WHAT IT DOES. It opens the choices and records the decision, here,
 * so there is no ellipsis on it: an ellipsis means "you will finish this somewhere else" and
 * nobody goes anywhere now.
 */
function DecideHere({
  row,
  here,
  onSettled,
  inspect,
}: {
  row: Decision
  here: string
  onSettled: () => void
  inspect: boolean
}) {
  const [built, setBuilt] = useState(false)
  return (
    <details
      className="dq-decide"
      onToggle={(event) => {
        if (event.currentTarget.open) setBuilt(true)
      }}
    >
      <summary className="dq-decide-sum" title={t('decisions.decideHint')}>
        <span className="dq-decide-word">{t('decisions.decide')}</span>
      </summary>
      {built ? <DecideBody row={row} here={here} onSettled={onSettled} inspect={inspect} /> : null}
    </details>
  )
}

/**
 * WHAT THE PRESS OPENS. Its own component, and that is what makes the lazy mount checkable.
 *
 * `DecideHere` above builds this the first time its fold is opened. A test can then ask two
 * questions that a single component could not answer apart: does a card at first paint hold none of
 * this, and does this hold everything a person needs to settle a fork. A lazy mount nobody can
 * render on its own is a lazy mount whose contents no test can assert.
 */
export function DecideBody({
  row,
  here,
  onSettled,
  inspect,
}: {
  row: Decision
  here: string
  onSettled: () => void
  inspect: boolean
}) {
  const elsewhere = row.workspaceId !== here
  // THE DECISIONS ALREADY MADE THAT NAME THIS FORK, asked when the card is opened and not when the page is drawn (this
  // body is mounted only then). Without them the card offered only a new decision, which asks what it replaces, for a
  // fork the person had already decided (problem lZ8mjvbb4fxl).
  const [named] = useProjectAsync(() => api.decisionsThatNameIt(row.recordId, row.workspaceId), [row.recordId, row.workspaceId])
  return (
    <div className="dq-decide-body">
      {/* WHICH PROJECT THE DECISION WILL LAND IN. Named for every fork and not only the ones from
          elsewhere: this is where somebody is about to write a decision, and where it lands is
          the one thing they cannot afford to assume. */}
      {/* SAID IN WORDS (wave 13q's round 31): the project's name stood alone on its line, "Default", and nothing said
          what it was. One sentence, read whole, with the name in quotation marks, which take no space either side in
          Chinese, so the same word is right for a Latin name and a Chinese one. */}
      <p className="dq-decide-meta">
        <span className="dq-decide-project">
          {row.workspaceTitle || inspect ? (
            t('decisions.recordedIn', { project: row.workspaceTitle || row.workspaceId })
          ) : (
            <Absence tier="told-apart" looked word={t('decisions.recordedInUnnamed')} title={t('decisions.unnamedProject')} />
          )}
          {elsewhere ? t('decisions.elsewhere') : ''}
        </span>
      </p>

      {/* THE AUTHOR'S OWN LINE, ONLY WHERE IT SAYS SOMETHING THE QUESTION DOES NOT.
          `summaryAdds` in home/decisions.ts is the whole of that test and it is exact: equal
          after trimming, or wholly inside the question, means one sentence printed twice. This
          card printed exactly that, word for word, until 27 August 2026. */}
      {row.summaryAdds === null ? null : <p className="dq-sum px-fork-words">{content(row.summaryAdds)}</p>}

      {/* WHAT IS WAITING ON THIS, BY NAME. The count is on the closed card; the names are here,
          because "holding up 2" and "holding up the calibration bench" are different reasons to
          decide something today. They are text and not links: this band reads across projects and
          opening one of them is a different act, which the record page already offers. */}
      {row.blocks.length === 0 ? null : (
        <div className="dq-decide-holds">
          <h4 className="dq-decide-holds-head">
            {t('decisions.waitingOnAnswer', { n: row.blocks.length })}
          </h4>
          <ul className="dq-decide-holds-list">
            {row.blocks.map((held) => (
              <li key={held.recordId}>
                {/* A KIND THE PAGE HAS NO WORD FOR draws no cue: "Kind unavailable" told the reader nothing (wave 13n round 33). */}
                {content(held.title)}{kindWord(held.kind).standing === 'known' ? <> <span className="dq-decide-kind">{kindWord(held.kind).text}</span></> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Inspect carries the server's account of the joined questions, including stored references.
          The normal card keeps their count. */}
      {!inspect || row.standsFor.length === 0 ? null : (
        <ul className="dq-decide-joined">
          {row.standsFor.map((gone) => (
            <li key={gone.proposalId}>{gone.sentence}</li>
          ))}
        </ul>
      )}

      {/* WHAT MOLE OFFICE COULD NOT READ ON THIS FORK. Never dropped quietly: a fork missing one of its
          options would otherwise look like a fork that only ever had the rest. */}
      {!inspect || row.unreadable.length === 0 ? null : (
        <ul className="dq-decide-unread">
          {row.unreadable.map((line) => (
            <li key={line}>{content(line)}</li>
          ))}
        </ul>
      )}

      <ProposalGovernance
        recordId={row.recordId}
        title={content(row.title)}
        data={row.fields}
        resolved={false}
        workspaceId={row.workspaceId}
        inline
        // WHICH SECTION EACH PART OF THE PANEL DRAWS. `relations: []` is a statement about this
        // surface: it draws no link rows, so this fork has no relation section on it.
        sections={sectionsOf({
          id: row.recordId,
          kind: 'proposal',
          data: row.fields,
          title: row.title,
          summary: row.summary,
          relations: [],
        })}
        {...(named.status === 'ready' ? { alreadyDecided: named.value } : {})}
        onSettled={onSettled}
      />
      {/* A FAILED READ IS SAID, so a card with no "Decided already" list is never a card whose list could not be read. */}
      {named.status === 'error' ? (
        <ErrorNote label={t('decisions.closeBy.unread')} message={named.message} fault={named.fault ?? null} />
      ) : null}

      {/* WHY THIS FORK IS WHERE IT IS IN THE QUEUE, in the server's own words and never as a
          score. `priority.because` names the facts that put it there, each of which is drawn on
          the row above, so a reader who disagrees with the order can see what to argue with.
          UNDER THE FORM AND NOT OVER IT: the question is what a person opened this to read, so
          nothing that merely explains the running order may stand above it. */}
      {inspect ? <p className="dq-why">{row.priority.because}</p> : null}

      {inspect ? (
        <p className="dq-raw">
          <code>{row.recordId}</code>{t('pageWords.Governance.001')}<code>{row.workspaceId}</code>{t('pageWords.Governance.002')}{' '}
          <code>{row.createdAt}</code> · <code>options</code> {row.options} ·{' '}
          <code>recommendationWritten</code> {String(row.recommendationWritten)} ·{' '}
          <code>namesAnOption</code> {String(row.namesAnOption)}
        </p>
      ) : null}
      {inspect ? <p className="dq-raw">{row.because}</p> : null}
    </div>
  )
}

// ============================================================================ 2 and 3. the choices

/**
 * WHAT A CARD DOES WHILE SOMEBODY IS DECIDING.
 *
 * `taking` is the option this reader has pressed — a card's letter, or `TAKE_NONE` for the card
 * that takes none of them. It is empty until somebody presses.
 *
 * `busy` is true while a press is being written. Every card is unpressable then, because a second
 * press would be a second decision on one fork and the server refuses that anyway.
 *
 * `onTake` IS THE PRESS ITSELF, AND WHAT IT DOES BELONGS TO WHOEVER PASSED IT IN. On an open fork
 * it marks the choice and a confirm press below writes it (criterion P89); on a fork that is already
 * settled it posts and the server refuses it, which is the whole of what that panel is teaching; on
 * a decision being made again it marks the choice for the press that supersedes. The card knows none
 * of that. It knows which option it is and that it has been pressed.
 */
interface Choosing {
  taking: string
  busy: boolean
  onTake: (next: string) => void
}

/**
 * The options, as cards.
 *
 * NOTHING IS SPLIT OUT OF AN OPTION'S TEXT. Every option in this corpus states a cost, and a review
 * asked for that cost on a line of its own — but no field stores it, so finding it means deciding
 * where a sentence stops meaning "the option" and starts meaning "what it costs". That is a rule
 * prose can fool, on the one screen in the product where being fooled changes what somebody
 * decides. The option is drawn whole.
 */
function Options({
  cards,
  picked,
  recommendation,
  sections,
  choosing,
}: {
  cards: readonly OptionCard[]
  picked: number | null
  recommendation: string | null
  /** Which sections of the fork this draws: the options, and the recommendation under them. */
  sections: (key: string) => Declares
  /**
   * Given while a person is deciding: the same cards become the buttons, in place.
   *
   * The card that takes none of them is one of the choices here and not an escape hatch beside
   * them, because a decision that took none of the recorded options has still made a recorded
   * choice and §38 says so.
   */
  choosing?: Choosing
}) {
  if (cards.length === 0) {
    return <p className="px-gov-none px-gov-noopts"><Absence title={t('decisions.noOptions')} /></p>
  }
  const heading =
    choosing === undefined ? (t('decisions.optionsCount', { n: cards.length })) : t('decisions.yourDecision')
  return (
    // THE OPTIONS ARE A SECTION OF THE FORK, and this is the element the owner's own screenshot
    // right-clicked: *3 options*. The heading, the cards and the recommendation are all inside it,
    // so a press anywhere in here that finds nothing smaller answers the options rather than the
    // whole proposal.
    <section
      className="px-gov-choices"
      data-choosing={choosing === undefined ? undefined : '1'}
      {...declaredAttributes(sections(OPTIONS_KEY))}
    >
      <h4 className="px-gov-h">
        {/* THE HEADING IS THE NAME OF THIS SECTION, so the chip above the composer reads *3
            options* rather than sweeping in the note beside it and every card below. Same mark and
            same reason as the one `Panel` puts on its title. */}
        <span {...DRAWS_THE_NAME}>{heading}</span>
        {picked === null ? null : (
          <span className="px-gov-h-note">{t('decisions.agentPicks', { letter: (cards[picked] as OptionCard).letter })}</span>
        )}
      </h4>
      <ol className="px-gov-opts">
        {cards.map((card, i) => (
          <OptionCardView
            key={card.letter}
            letter={card.letter}
            body={content(card.body)}
            agentPick={i === picked}
            choosing={choosing}
          />
        ))}
        {choosing === undefined ? null : (
          <OptionCardView
            key={TAKE_NONE}
            letter="—"
            value={TAKE_NONE}
            body={t('decisions.takeNone')}
            agentPick={false}
            choosing={choosing}
          />
        )}
      </ol>
      {/* THE RECOMMENDATION IS A SECTION OF ITS OWN, drawn inside the options because it is about
          which of them to take. A press on it answers the recommendation; a press on a card or on
          the heading walks past nothing and answers the options.
          THE MARKS ARE ON THE WORDS AND NOT ON THE PARAGRAPH. The label in front — *Why B.* — is
          characters this record does not hold, so a `data-text-field` on the paragraph would shift
          every offset by the length of the label and Mole Office would report a recommendation
          nobody had touched as changed. Same care as the summary line in the page header. */}
      {recommendation === null ? (
        // Said out loud. An agent that recommended nothing is a different thing from one that had
        // no view, and the reader deciding this should know which they are looking at. It declares
        // nothing: the record has no `section.recommendation`, and a target here would name a
        // region the server would answer `gone` about.
        <p className="px-gov-rec px-gov-none"><Absence title={t('decisions.noRecommendation')} /></p>
      ) : picked === null ? (
        <p className="px-gov-rec" {...declaredAttributes(sections(RECOMMENDATION_KEY))}>
          {/* JOINED BY THE OFFICE'S SPACING RULE: no space after 。 in Chinese (wave 13q's round 30). */}
          <span className="px-gov-rec-lab">{t('decisions.noNamedOption')}</span>{gapBetween(t('decisions.noNamedOption'), recommendation)}
          <span {...DRAWS_THE_NAME} {...textAttributes(`data.${RECOMMENDATION_KEY}`, 0)}>{content(recommendation)}</span>
        </p>
      ) : (
        <p className="px-gov-rec" {...declaredAttributes(sections(RECOMMENDATION_KEY))}>
          <span className="px-gov-rec-lab">{t('decisions.whyOption', { letter: (cards[picked] as OptionCard).letter })}</span>{gapBetween(t('decisions.whyOption', { letter: (cards[picked] as OptionCard).letter }), recommendation)}
          <span {...DRAWS_THE_NAME} {...textAttributes(`data.${RECOMMENDATION_KEY}`, 0)}>{content(recommendation)}</span>
        </p>
      )}
    </section>
  )
}

/**
 * One option card, which is a `<li>` while it is being read and a `<button>` while somebody is
 * deciding. The same card, the same words, the same letter in the same gutter — the only thing
 * that changes is that the card becomes the control, which is what stops the picker being a second
 * copy of the list it sits under.
 *
 * ---------------------------------------------------------------------------------------
 * THE CARD IS THE PRESS, AND A CONFIRM PRESS BELOW IT IS THE DECISION
 * ---------------------------------------------------------------------------------------
 *
 * The A, B, C, D of a decision are directly pressable, and pressing one changes its colour.
 * Criterion M57, and it still holds: the card is a button and the pressed one changes colour.
 *
 * WHAT CHANGED LATER IS WHAT THE PRESS WRITES, WHICH IS NOTHING. A decision takes two steps:
 * press Decide it, then confirm. Criterion P89. The press marks the choice; a confirm press
 * under the cards names the option and writes the decision, and a press beside it puts the choice
 * back. The card used to be a `<label>` around a radio, then it became the write, and it is now the
 * button that chooses — which is the first of two presses rather than the whole act.
 *
 * A RADIO CANNOT DO THIS. It is a control for choosing among things without committing to one, and
 * what it draws — a small circle beside the words — says so. A button is the element for an act.
 * The whole card is the button, so the hit target is the option rather than a 16px circle in the
 * corner of it, and a screen reader hears the letter and the option as the button's name.
 *
 * THE PRESS STILL GOES TO THE SERVER. Nothing here decides whether this reader may settle a fork:
 * the press posts to the one promote route, and an agent's actor is refused there in the words it
 * has always been refused in. A card that is pressable on a settled fork is pressable for the same
 * reason — the server says it is settled, and the page draws what the server said.
 */
function OptionCardView({
  letter,
  value,
  body,
  agentPick,
  taken,
  choosing,
}: {
  letter: string
  /** What the press stores. The card's letter unless it is the take-none choice. */
  value?: string
  body: string
  agentPick: boolean
  /** Drawn on a settled fork: this is the option the decision took. */
  taken?: boolean
  choosing?: Choosing
}) {
  const stored = value ?? letter
  // A CARD IS NEVER BOTH AT ONCE. `taken` is the option a decision went to and `chosen` is the one
  // somebody is pressing now; they are two different colours meaning two different things — role 13
  // and role 12 of src/shared/colourroles.ts — and a card carrying both would draw one over the
  // other. What is taken is settled, so it wins.
  const chosen = taken !== true && choosing !== undefined && choosing.taking === stored
  const inner = (
    <>
      <span className="px-gov-letter" aria-hidden="true">
        {letter}
      </span>
      <div className="px-gov-opt-body">
        <p className="px-gov-opt-text">
          {/* THE LETTER, IN WORDS, FOR SOMEBODY WHO CANNOT SEE THE GUTTER. It is drawn whether or
              not the card is a control now: the gutter is `aria-hidden`, so without this the
              button's name would be the option's sentence with no letter in it, and the refusal a
              reader hears back names a letter. */}
          {/* NOT FOR THE TAKE-NONE CARD, whose letter is a dash: a screen reader read "选项 —。" / "Option —." aloud before
              "None of these — …", which says what it is itself (wave 13q's round 31). */}
          {stored === TAKE_NONE ? null : <span className="px-sr">{t('decisions.optionLabel', { letter })}</span>}
          {content(body)}
        </p>
        {agentPick ? <span className="px-gov-pick">{t('decisions.agentPick')}</span> : null}
        {taken === true ? <span className="px-gov-taken">{t('decisions.taken')}</span> : null}
      </div>
    </>
  )
  return (
    <li
      className="px-gov-opt"
      data-picked={agentPick ? '1' : undefined}
      data-taken={taken === true ? '1' : undefined}
      data-chosen={chosen ? '1' : undefined}
    >
      {/* A `button` while it is a control and a `div` while it is not: an element that looks
          pressable and does nothing is worse than plain text. */}
      {choosing === undefined ? (
        <div className="px-gov-opt-inner">{inner}</div>
      ) : (
        <button
          type="button"
          className="px-gov-opt-inner"
          // UNPRESSABLE WHILE ONE PRESS IS BEING WRITTEN, and only then. A fork takes one decision,
          // so a second press before the first has landed is a request the server would refuse; the
          // card says so by not taking it rather than by sending it and drawing the refusal.
          disabled={choosing.busy}
          aria-busy={choosing.busy && chosen ? true : undefined}
          onClick={() => {
            choosing.onTake(stored)
          }}
        >
          {inner}
        </button>
      )}
    </li>
  )
}

// ============================================================================ the change set

/**
 * A CHANGE SET IS THE CONSEQUENCE OF ONE OPTION, NOT A DOCUMENT.
 *
 * It was eleven undifferentiated rows with the two questions that make it unappliable at the
 * bottom, under nine writes nobody can do anything about. Here the questions come first and
 * loudest, the outcome is one line, and the writes are folded — because "what would this do" is
 * answered by the outcome line, and "which nine records exactly" is a second question that a person
 * asks after they have decided they care.
 */
function ChangeSet({ delta, under }: { delta: Delta; under: string | null }) {
  const inspect = useInspect()
  const open = delta.ops.filter((op): op is Extract<DeltaOp, { op: 'unresolved' }> => op.op === 'unresolved')
  const writes = delta.ops.length - open.length

  return (
    <section className="px-delta">
      <h4 className="px-gov-h">{under === null ? t('decisions.changes') : t('decisions.ifChoose', { letter: under })}</h4>
      <p className="px-delta-out">{deltaOutcome(delta)}</p>

      {open.length === 0 ? null : (
        <div className="px-delta-open">
          <p className="px-delta-open-head">
            {t('decisions.unanswered', { n: open.length })}
          </p>
          <ol className="px-delta-qs">
            {open.map((op, i) => (
              <li key={i}>
                <span className="px-delta-q">{content(op.says)}</span>
                {/* "Why it was not guessed" — the owner: *"'why' is already enough if it is for
                    explanation of the questions"*. The question is directly above it. */}
                <details className="px-gov-fold">
                  <summary>{t('decisions.why')}</summary>
                  <p>{content(op.why)}</p>
                </details>
              </li>
            ))}
          </ol>
        </div>
      )}

      <details className="px-gov-fold px-delta-all">
        <summary>
          {t('decisions.allSteps', { n: delta.ops.length })}
        </summary>
        <ol className="px-delta-ops">
          {delta.ops.map((op, i) => (
            <li key={i} className={op.op === 'unresolved' ? 'px-delta-op px-delta-op-open' : 'px-delta-op'}>
              {/* The stored word for a step that is a question is `unresolved`, which is not a word
                  a person would say. Every other one already reads as English. */}
              <span className="px-delta-kind">
                {t(DELTA_KEYS[op.op])}
              </span>
              <span className="px-delta-says">{content(op.says)}</span>
              {op.op === 'unresolved' ? <span className="px-delta-why">{content(op.why)}</span> : null}
            </li>
          ))}
        </ol>
        <p className="px-delta-count">
          {t('decisions.stepCount', { writes, n: open.length })}
        </p>
      </details>

      {/* The draft this came from was parsed by shared/delta.ts and rendered nowhere, so the only
          way to reach it was to read the raw JSON further down the page. It is a record id, so it
          goes behind Inspect: nothing here has loaded the title it points at, and printing an id in
          normal mode is what this pass exists to stop. */}
      {inspect && delta.fromDraft ? (
        <p className="px-delta-src">{t('pageWords.Governance.003')}<RouteLink to={recordPath(delta.fromDraft)}>{delta.fromDraft}</RouteLink>
        </p>
      ) : null}
    </section>
  )
}

// ============================================================================ 4. what you do

/**
 * WHAT MOLE OFFICE WRITES DOWN WHEN A PERSON DECIDES, worked out here and nowhere else.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A FUNCTION AND NOT FOUR EXPRESSIONS INSIDE THE SUBMIT HANDLER
 * ---------------------------------------------------------------------------------------
 *
 * It is the whole of §38 in one place, it can be proved without a browser, and it is the only
 * writer of these four fields. What it returns is exactly what goes on the wire.
 *
 * ---------------------------------------------------------------------------------------
 * THE FOUR FIELDS, AND WHY THE PAIR IS TWO FIELDS
 * ---------------------------------------------------------------------------------------
 *
 *   option_taken           the WORDS of what was taken: the option's own text, or the person's
 *                          own line, verbatim.
 *   option_index           WHICH recorded option that was, counted from 0. Absent when the person
 *                          wrote their own answer, and that absence is the stored difference
 *                          between "none of these" and "I took option B". §38 was settled as
 *                          exactly that pair.
 *   alternatives_rejected  the letters of everything turned down, as before.
 *   because                the optional paragraph.
 *
 * ---------------------------------------------------------------------------------------
 * THE TITLE IS WRITTEN HERE. THE FORM NEVER ASKS FOR ONE
 * ---------------------------------------------------------------------------------------
 *
 * The owner did not understand why they were asked to title a decision they had just made by pressing a
 * lettered option, and they were right: Mole Office has the words already. The live corpus shows what the
 * box produced — three decisions titled "As you recommended", and two whole paragraphs of reasoning
 * crammed into a one-line input.
 *
 * Nothing is lost by shortening it, and that is why the title may be cut: `option_taken` holds
 * every word of what was taken, on the same record, and the title is the line that has to fit in a
 * list. This is a seed, not a copy — after this write the two are separate facts and nothing
 * derives one from the other, the same rule a filed plan line follows.
 */
export interface DecisionWrite {
  title: string
  data: Record<string, unknown>
}

/** How long a decision's written title may be before it is cut at a word. Measured on a row. */
export const TITLE_LIMIT = 110

/** The title Mole Office writes from the words of what was taken: one line, and never a bare cut word. */
/**
 * WHAT THE CONFIRM PRESS SAYS, AND WHY IT SAYS THE OPTION RATHER THAN "Confirm". Criterion P89.
 *
 * The reader has marked one card and is about to write a decision nobody can undo for them. A press
 * reading "Confirm" would make them look back up at the cards to find out what they were confirming
 * — and not seeing which option was about to be written is exactly how a fork was settled by
 * accident on 9 September 2026 (problem `fV-w1Boj9kjM`).
 *
 * THE LETTER AND THE FIRST WORDS. The letter, because that is what the fork, the cards and the
 * stored decision all call the option; the first words, because at 390 a whole option does not fit
 * on a button and a button whose words are cut mid-sentence says less than one that stops on a word.
 * `CONFIRM_WORDS` is the cap in characters, chosen so the press fits one line at 390.
 */
export const CONFIRM_WORDS = 28

/** The words on the confirm press: `Decide A: close on force`. */
export function confirmPressWords(card: OptionCard): string {
  const said = card.body.replace(/\s+/g, ' ').trim()
  if (said.length <= CONFIRM_WORDS) return t('decisions.confirm', { letter: card.letter, said: content(said) })
  const cut = said.slice(0, CONFIRM_WORDS)
  const lastSpace = cut.lastIndexOf(' ')
  const short = (lastSpace > CONFIRM_WORDS / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()
  return t('decisions.confirm', { letter: card.letter, said: content(`${short}…`) })
}

/** The press that puts the choice back, so a reader can mark another card. Criterion P89. */
export const CHANGE_THE_CHOICE = en['decisions.changeChoice']

export function titleFromChoice(taken: string): string {
  const oneLine = taken.replace(/\s+/g, ' ').trim()
  if (oneLine.length <= TITLE_LIMIT) return oneLine
  const cut = oneLine.slice(0, TITLE_LIMIT)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > TITLE_LIMIT / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/**
 * What the form would send, or NULL when nothing has been chosen yet.
 *
 * Null rather than a half-filled write: a decision with no choice on it is the record §38 was
 * settled to stop producing, so there is no shape of this function that returns one.
 */
export function decisionWrite({
  cards,
  taking,
  ownAnswer,
  because,
  replaces,
}: {
  cards: readonly OptionCard[]
  /** A card's letter, `TAKE_NONE`, or empty while nobody has chosen. */
  taking: string
  /** What the person typed when they took none of the recorded options. */
  ownAnswer: string
  because: string
  replaces?: readonly string[]
}): DecisionWrite | null {
  const own = ownAnswer.trim()
  const chosen = cards.find((card) => card.letter === taking)
  const index = chosen === undefined ? -1 : cards.indexOf(chosen)
  // A fork with no recorded options can only be answered in the person's own words, so that line
  // IS the choice there and the picker is not drawn at all.
  const takingOwn = taking === TAKE_NONE || (cards.length === 0 && own !== '')
  if (chosen === undefined && !(takingOwn && own !== '')) return null

  const taken = chosen === undefined ? own : chosen.body.trim()
  const rejected = rejectedBy(cards, taking)
  return {
    title: titleFromChoice(taken),
    data: {
      option_taken: taken,
      ...(replaces === undefined ? {} : { replaces }),
      // ONLY WHEN A RECORDED OPTION WAS TAKEN. Sending it for a custom answer would say the person
      // took an option they explicitly refused, and the server refuses an index with no words.
      ...(chosen === undefined ? {} : { option_index: index }),
      ...(rejected.length === 0 ? {} : { alternatives_rejected: rejected }),
      ...(because.trim() === '' ? {} : { because: because.trim() }),
    },
  }
}

/**
 * WHY ONLY A PERSON MAY DECIDE, WRITTEN ONCE AND MOUNTED ONCE PER SURFACE.
 *
 * This sentence used to be typed three times: in both branches of `Decide` below, and again in the
 * band on Home in slightly different words. On Home that put it on screen once per open card plus
 * once on the band — the same rule explained four times on one screen. Three copies of one fact can
 * disagree with nothing failing, which is the defect this repository names as its own.
 *
 * IT STAYS BEHIND A PRESS. It is a fact about the system rather than a description of the screen,
 * so no arrangement of pixels can say it; `Hint` is the mark that holds it. The band on Home and the
 * band on the decisions page each mount it once, and the form drops it when it is mounted inside one
 * of them.
 */
export const WHY_ONLY_YOU = en['decisions.whyOnlyYou']

export function WhyOnlyYou() {
  return <Hint label={t('decisions.whyOnlyYouLabel')}>{t('decisions.whyOnlyYou')}</Hint>
}

/**
 * THE ONE WRITE ON THIS PANEL: settle the proposal with what the person chose.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A HOOK AND NOT TWO COPIES OF THE SAME REQUEST
 * ---------------------------------------------------------------------------------------
 *
 * Two surfaces post it now — the open panel, where the CONFIRM press settles the proposal (criterion
 * P89; the press on a card only marks the choice), and the settled panel, where a press on a
 * different option is refused. They send the same request and draw the same refusal, so the request
 * is written once. Two copies would be this codebase's own recurring defect: one could learn to send
 * the project and the other not, with nothing failing.
 *
 * NOTHING HERE DECIDES WHETHER THE PRESS IS ALLOWED. It posts, and the server answers. An agent's
 * actor gets the 403 it has always got; a proposal that is already settled gets the 409. Both are
 * drawn as the server wrote them, and the page never works the answer out for itself.
 *
 * BUSY STAYS TRUE AFTER A PRESS THAT WORKED. The panel is about to be redrawn as a settled
 * proposal, and letting the cards go pressable again in between would offer a second decision on a
 * proposal that now has one.
 */
function useSettling(
  recordId: string,
  workspaceId: string | undefined,
  onSettled: () => void,
): {
  busy: boolean
  /**
   * THE REFUSAL, WHOLE, WHEN THE WRITE WAS REFUSED.
   *
   * The fault is kept beside the sentence because the door writes the refusal in two lengths and
   * the short one is on the fault. Keeping only the message would leave the box shortening a
   * paragraph itself, which is a second answer to *why was this refused*.
   */
  failed: { message: string; fault: Fault | null } | null
  settle: (write: DecisionWrite) => void
} {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<{ message: string; fault: Fault | null } | null>(null)
  const settle = (write: DecisionWrite) => {
    if (busy) return
    setBusy(true)
    setFailed(null)
    void (async () => {
      try {
        await api.promoteProposal(
          recordId,
          { title: write.title, data: write.data },
          // THE PROPOSAL'S OWN PROJECT, when the caller knows it. The decision belongs where the
          // proposal is, and Home settles proposals from projects it is not reading.
          workspaceId,
        )
        onSettled()
      } catch (err) {
        // The server's own words, including the refusal when "who you are writing as" is set to an
        // agent — which is the guard working, not a bug on this page.
        setFailed({ message: errorMessage(err), fault: faultOf(err) })
        setBusy(false)
      }
    })()
  }
  return { busy, failed, settle }
}

/**
 * THE CHOICE AND THE ACT, SIDE BY SIDE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT ASKS, IN ORDER, AND WHAT IT NO LONGER ASKS
 * ---------------------------------------------------------------------------------------
 * 1  WHICH ONE. The recorded options, lettered, one radio each, plus "None of these", which reveals
 *    one line for what the person is doing instead. §38 is settled: a decision selects a recorded
 *    option or an explicit custom one, so the choice is required and "none of these" is one of the
 *    choices rather than an escape hatch beside them.
 * 2  WHY, IF YOU WANT TO SAY. A paragraph box, and nothing written inside it. The owner: *"the
 *    optional explanation box in a Decision is already understandable from context and does not need
 *    a paragraph inside it"*. Its label says it is optional and the button beside it never asks for
 *    it, which is what carries that. What the box held was a copy of the schema's own words for
 *    `because` in src/shared/kinds.ts — one sentence in two places, and the copy was the one on
 *    screen.
 *
 * IT NEVER ASKS FOR A TITLE. `decisionWrite` above writes it from the option taken, and says why.
 *
 * ---------------------------------------------------------------------------------------
 * "LEAVE IT OPEN" IS GONE
 * ---------------------------------------------------------------------------------------
 * It was a link to Home. It recorded nothing, deferred nothing, and on Home it navigated to the
 * page the reader was already on, so it read as a dead control. Its own header claimed it carried
 * `revisit_when`; it did not, and that field is not writable from this panel. `revisit_when` is
 * drawn while the fork is being read AND while it is being decided — it used to disappear at the
 * exact moment it became relevant.
 */
function Decide({
  settling,
  closing,
  replacesCandidates,
  replacesLoading,
  onRetryReplacements,
  cards,
  picked,
  recommendation,
  revisit,
  inline,
  sections,
}: {
  /** This form's write, kept by `ProposalGovernance` so the close block beside it can see that it is being saved. */
  settling: ReturnType<typeof useSettling>
  /** True while a close by a decision already made is being saved. Nothing on this form may write then. */
  closing: boolean
  replacesCandidates: RecordDetail['replacesCandidates']
  replacesLoading: boolean
  /** Reads the earlier decisions this fork could replace again, after that read failed. */
  onRetryReplacements: () => void
  cards: readonly OptionCard[]
  picked: number | null
  recommendation: string | null
  revisit: string | null
  /** Handed straight to `Options`, which draws two of the fork's sections. */
  sections: (key: string) => Declares
  /** True on Home, where the press that mounted this panel was already the press for the choices. */
  inline: boolean
}) {
  const [open, setOpen] = useState(inline)
  const [taking, setTaking] = useState<string>('')
  const [ownAnswer, setOwnAnswer] = useState('')
  const [because, setBecause] = useState('')
  const [replaced, setReplaced] = useState<string[]>([])
  const [replacesNone, setReplacesNone] = useState(false)
  const inspect = useInspect()
  // A WRITE THAT SETTLES THIS FORK IS BEING SAVED, from this form or from the close block beside it.
  const busy = settling.busy || closing

  // A fork nobody wrote options on can only be answered in the person's own words. There is no
  // picker to draw and nothing to reject, so the line below is the choice and it is required.
  const ownOnly = cards.length === 0
  // THE FORM IS FOR THE ANSWER THAT HAS WORDS IN IT, and only for that. The card that takes none of
  // the recorded options, and a fork that recorded none, are answered by typing; this is the flag
  // that draws that line and the press under it.
  const writtenAnswer = taking === TAKE_NONE || ownOnly
  const replacementReason = replacesLoading ? t('decisions.loading')
    : replacesCandidates === undefined ? t('decisions.replaces.unread')
      : replacesCandidates.length > 0 && replaced.length === 0 && !replacesNone ? t('decisions.replaces.chooseFirst')
        : null
  const writing = decisionWrite({ cards, taking, ownAnswer, because, replaces: replaced })
  const unready = busy || writing === null || replacementReason !== null
  /**
   * THE RECORDED OPTION THIS READER HAS CHOSEN AND NOT YET CONFIRMED, or null because none is.
   *
   * It is what turns the second press into a sentence naming what it will write, and it is read off
   * `cards` rather than kept in a second piece of state — one fact in one place. `TAKE_NONE` finds
   * no card, which is right: that answer is written in the person's own words and goes through the
   * form below.
   */
  const chosen = cards.find((card) => card.letter === taking) ?? null

  /**
   * THE PRESS ON A CARD, WHICH MARKS THE CHOICE AND WRITES NOTHING.
   *
   * ---------------------------------------------------------------------------------------
   * IT USED TO BE THE DECISION, AND NOW IT IS NOT
   * ---------------------------------------------------------------------------------------
   *
   * Two steps: press Decide it, then confirm. A single press once
   * settled `_zwf321rD3Dx` with a choice that was not meant to be final (problem
   * `fV-w1Boj9kjM`). Criterion P89.
   *
   * The old rule was M57, cards that are pressed directly and change colour when pressed, and
   * it is not undone: the cards are still buttons and the pressed one still
   * changes colour. What the press no longer does is post. A confirm press below names the option it
   * will write, and a press beside it puts the choice back.
   *
   * A decision is the one act only they may do and no agent may undo it. That is why the cost of the
   * extra press is worth paying here and nowhere else in the product.
   */
  const take = (next: string) => {
    setTaking(next)
  }

  /** The confirm press: write the decision the choice above names. Nothing else posts on this panel. */
  const confirm = () => {
    if (unready || writing === null) return
    settling.settle(writing)
  }

  return (
    <div className="px-gov-decide" data-deciding={open ? '1' : undefined}>
      <Options
        cards={cards}
        picked={picked}
        recommendation={content(recommendation)}
        sections={sections}
        {...(open ? { choosing: { taking, busy: settling.busy, onTake: take } } : {})}
      />

      {/* THE REFUSAL SITS UNDER THE CARDS, WHERE THE PRESS WAS. It used to be at the bottom of the
          column beside them, which is where the button that wrote the decision used to be; now the
          card is the button, so this is where a reader looks after pressing one. */}
      {open && settling.failed !== null ? (
        <div className="px-gov-refused">
          {/* HEADED "Error", WITH ONE SHORT REASON UNDER IT. The heading used to read
              "Nothing was recorded.", which was odd for a fault. The old
              heading did not say it was an error and the box carried five sentences where one line
              does. The short reason is the door's own, off the fault, and the whole refusal is one
              press away inside the box. Criterion M43. */}
          <ErrorNote label={t('decisions.error')} message={settling.failed.message} fault={settling.failed.fault} />
        </div>
      ) : null}

      {open ? (
        <div className="px-gov-act">
          <form
            className="px-gov-form"
            // ONE PATH POSTS, AND BOTH PRESSES ARE ON IT. The written answer's press and the confirm
            // press are both `type="submit"`, so this is the only place on the panel that writes a
            // decision — a second handler beside it could learn to send something different with
            // nothing failing.
            onSubmit={(e) => {
              e.preventDefault()
              confirm()
            }}
          >
            {/* THE LINE THAT APPEARS WHEN NONE OF THE OPTIONS IS TAKEN, and the only field on a
                fork that recorded no options at all. It is the choice, so it is the first thing
                asked for, above the reasoning. */}
            {writtenAnswer ? (
              <Field label={ownOnly ? t('decisions.decided') : t('decisions.ownAnswer')}>
                {/* HOW LONG, AND NOTHING ELSE. The second half of this used to read "instead of the
                    options above", which the label already says and which was cut off mid-word at
                    390px anyway. */}
                <TextArea value={ownAnswer} onChange={setOwnAnswer} rows={2} placeholder={t('decisions.oneLine')} />
              </Field>
            ) : null}
            {replacesCandidates === undefined && !replacesLoading ? (
              <ErrorNote message={t('decisions.replaces.unread')} retry={onRetryReplacements} />
            ) : null}
            {replacesCandidates !== undefined && replacesCandidates.length > 0 ? (
              <fieldset className="px-gov-replaces">
                <legend>{t('decisions.replaces.heading')}</legend>
                <p>{t('decisions.replaces.why')}</p>
                {replacesCandidates.map((candidate) => (
                  <label key={candidate.id}>
                    <input type="checkbox" checked={replaced.includes(candidate.id)} onChange={(event) => {
                      const checked = event.target.checked
                      setReplaced((current) => checked ? [...current, candidate.id] : current.filter((id) => id !== candidate.id))
                      if (checked) setReplacesNone(false)
                    }} />
                    <span>{candidate.title} ({candidate.id}) — {candidate.sharedSubject}</span>
                  </label>
                ))}
                <label>
                  <input type="checkbox" checked={replacesNone} onChange={(event) => {
                    setReplacesNone(event.target.checked)
                    if (event.target.checked) setReplaced([])
                  }} />
                  <span>{t('decisions.replaces.none')}<small>{t('decisions.replaces.noneWhy')}</small></span>
                </label>
              </fieldset>
            ) : null}
            {/* NOTHING IS WRITTEN IN THIS BOX AND NOTHING IS WRITTEN BESIDE IT. The label says
                what it is for and says it is optional, and no control on this form asks for it, so
                a paragraph inside it was the product explaining a box a reader had already
                understood.
                A SENTENCE SAYING "write this before you press an option" WAS DRAFTED HERE AND
                TAKEN OUT. docs/UX-CONTRACT.md 8.10: a fix that amounts to adding a sentence
                explaining the interface is a failed fix. At a desk the box is beside the options rather
                than after them, which is the owner's own arrangement and asks nothing of the
                reader. On a phone the two stack, box under cards, because the press that WRITES the
                decision is under this box (criterion P89) and nothing is settled before a reader
                reaches it. The rule on `.px-gov-decide` says the whole of why. */}
            <Field label={t('decisions.optionalReason')}>
              <TextArea value={content(because)} onChange={setBecause} rows={4} />
            </Field>
            {inspect && writing !== null ? (
              <p className="px-gov-stored">{JSON.stringify(writing.data)}</p>
            ) : null}
            {inspect && writing !== null ? <p className="px-gov-stored">{t('pageWords.Governance.004')}{writing.title}</p> : null}
            {writtenAnswer || chosen !== null || !inline ? (
              <div className="px-gov-acts">
                {writtenAnswer ? (
                  <Btn
                    type="submit"
                    variant="primary"
                    disabled={unready}
                    // WHY IT CANNOT BE PRESSED, on the control, where the question is asked. It is
                    // never refused in silence: `Btn` keeps a disabled control in the tab order and
                    // says this.
                    reason={
                      busy
                        ? t('decisions.savingReason')
                        : replacementReason !== null ? replacementReason
                        : ownOnly
                          ? t('decisions.writeOwnOnly')
                          : t('decisions.writeOwn')
                    }
                    pending={settling.busy}
                  >
                    {t('decisions.recordDecision')}</Btn>
                ) : null}
                {/* THE SECOND PRESS, AND THE WAY BACK FROM THE FIRST. Criterion P89.
                    The press NAMES the option it will write, because a button
                    reading "Confirm" beside four cards is a button whose meaning is a guess about
                    which card is still marked — and the card they had marked is the exact thing they
                    could not see when they settled a fork by accident. */}
                {chosen === null ? null : (
                  <>
                    <Btn
                      type="submit"
                      variant="primary"
                      disabled={unready}
                      reason={busy ? t('decisions.savingReason') : replacementReason ?? t('decisions.replaces.chooseFirst')}
                      pending={settling.busy}
                    >
                      {confirmPressWords(chosen)}
                    </Btn>
                    <Btn
                      variant="ghost"
                      onClick={() => {
                        setTaking('')
                      }}
                    >
                      {t('decisions.changeChoice')}
                    </Btn>
                  </>
                )}
                {inline ? null : (
                  <Btn variant="ghost" onClick={() => setOpen(false)}>
                    {t('decisions.back')}</Btn>
                )}
                {/* NOT INSIDE A CARD ON HOME. The band these cards sit in carries this same rule,
                    two inches above, and four open cards carried four more copies of it. */}
                {inline ? null : <WhyOnlyYou />}
              </div>
            ) : null}
          </form>
          {/* WHAT WOULD REOPEN THIS, WHILE IT IS BEING DECIDED. The fork's author wrote it for
              exactly this moment, and it used to vanish the instant the form opened. */}
          {revisit === null ? null : (
            <p className="px-gov-defer" {...declaredAttributes(sections(REVISIT_WHEN_KEY))}>
              {t('decisions.revisit')}{gapBetween(t('decisions.revisit'), revisit)}<span {...textAttributes(`data.${REVISIT_WHEN_KEY}`, 0)}>{content(revisit)}</span>
            </p>
          )}
        </div>
      ) : (
        <div className="px-gov-act">
          <div className="px-gov-acts">
            <Btn variant="primary" disabled={closing} reason={t('decisions.savingReason')} onClick={() => setOpen(true)}>
              {t('decisions.decide')}</Btn>
            <WhyOnlyYou />
          </div>
          {/* The stored sentence starts with a capital, so it is on its own line rather than run
              on: "…revisiting when The owner names…" was a word in the wrong case in the middle of
              a sentence, and lowering somebody else's first letter is editing their words. */}
          {revisit === null ? null : (
            <p className="px-gov-defer" {...declaredAttributes(sections(REVISIT_WHEN_KEY))}>
              {t('decisions.revisit')}{gapBetween(t('decisions.revisit'), revisit)}<span {...textAttributes(`data.${REVISIT_WHEN_KEY}`, 0)}>{content(revisit)}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * CLOSE THE FORK BY A DECISION ALREADY MADE. Problem lZ8mjvbb4fxl: the person pressed to close proposal
 * jvFnqONCGikw by a decision they had made, and the only press the panel had wrote a NEW decision, so the office asked
 * which earlier decisions it replaced and wrote nothing.
 *
 * This press writes no decision. It joins the chosen one to the fork with the settling link, POST /api/links, the same
 * door a secretary uses under a decision. The list is the server's: every live decision that
 * names this fork, by `theDecisionsThatNameThisFork`.
 *
 * TWO PRESSES, like every other way of settling a fork on this panel (criterion P89): the first picks the decision,
 * the second names it and closes the fork. Nothing here decides whether the press is allowed; the server answers.
 */
function CloseByADecisionAlreadyMade({
  recordId,
  decisions,
  closing,
  onClosing,
  deciding,
  onSettled,
}: {
  recordId: string
  decisions: readonly DecisionThatNamesIt[]
  /** True while this block's close is being saved. Kept by `ProposalGovernance`, so the form beside it can see it. */
  closing: boolean
  onClosing: (closing: boolean) => void
  /** True while a decision from the form beside this block is being saved. Nothing here may write then. */
  deciding: boolean
  onSettled: () => void
}) {
  const [chosen, setChosen] = useState<DecisionThatNamesIt | null>(null)
  const busy = closing || deciding
  const [failed, setFailed] = useState<{ message: string; fault: Fault | null } | null>(null)

  const close = (decision: DecisionThatNamesIt) => {
    if (busy) return
    onClosing(true)
    setFailed(null)
    void (async () => {
      try {
        await api.createLink({ fromId: decision.id, toId: recordId, type: RESOLVES_PROPOSAL })
        // CLOSING STAYS TRUE, as busy does in `useSettling`: the panel is about to be redrawn as settled.
        onSettled()
      } catch (err) {
        setFailed({ message: errorMessage(err), fault: faultOf(err) })
        onClosing(false)
      }
    })()
  }

  return (
    <section className="px-gov-already" data-testid="close-by-a-decision">
      <h4 className="px-gov-h">{t('decisions.closeBy.heading')}</h4>
      <ul className="px-gov-already-list">
        {decisions.map((d) => (
          <li key={d.id} data-chosen={chosen?.id === d.id ? '1' : undefined}>
            <RouteLink to={recordPath(d.id)}>{content(d.title)}</RouteLink>
            <span className="px-gov-already-who">
              {d.decidedBy === null
                ? t('decisions.closeBy.byNobodySaid')
                : d.decidedBy === THE_OWNER
                  ? t('decisions.closeBy.byThePerson')
                  : t('decisions.closeBy.byOther', { who: d.decidedBy })}
            </span>
            {chosen?.id === d.id ? null : (
              <Btn size="sm" variant="secondary" disabled={busy} reason={t('decisions.savingReason')} onClick={() => setChosen(d)}>
                {t('decisions.closeBy.pick')}
              </Btn>
            )}
          </li>
        ))}
      </ul>
      {chosen === null ? null : (
        <div className="px-gov-acts">
          <Btn
            variant="primary"
            disabled={deciding}
            reason={t('decisions.savingReason')}
            pending={closing}
            onClick={() => close(chosen)}
          >
            {t('decisions.closeBy.confirm', { title: content(shortTitle(chosen.title)) })}
          </Btn>
          <Btn variant="ghost" disabled={busy} reason={t('decisions.savingReason')} onClick={() => setChosen(null)}>
            {t('decisions.changeChoice')}
          </Btn>
        </div>
      )}
      {failed === null ? null : (
        <div className="px-gov-refused">
          <ErrorNote label={t('decisions.error')} message={failed.message} fault={failed.fault} />
        </div>
      )}
    </section>
  )
}

/** A decision's title cut for the confirm press, at the length `confirmPressWords` cuts an option to. */
function shortTitle(title: string): string {
  const said = title.replace(/\s+/g, ' ').trim()
  if (said.length <= CONFIRM_WORDS) return said
  const cut = said.slice(0, CONFIRM_WORDS)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > CONFIRM_WORDS / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

// ============================================================================ after it is settled

/**
 * WHICH OPTION A DECISION TOOK — the one reader, and the one place `option_index` is read.
 *
 * ---------------------------------------------------------------------------------------
 * THREE ENCODINGS, NEWEST FIRST, AND NONE OF THEM IS A GUESS
 * ---------------------------------------------------------------------------------------
 *
 *   option_index    the position of the option taken. Written from 2026-08-13. It answers outright.
 *   alternatives_rejected   the older encoding: the choice as its complement. Taking B rejects A
 *                   and C; taking none of them rejects all three. Every decision already in this
 *                   corpus is this kind, and `takenOption` reads it, refusing whenever the stored
 *                   letters do not line up with this fork's own.
 *
 * ---------------------------------------------------------------------------------------
 * THE WORDS NEVER DECIDE WHICH OPTION WAS TAKEN, AND THAT IS THE COLLISION §38 CLOSED
 * ---------------------------------------------------------------------------------------
 *
 * `option_taken` holds the words of what was taken, and matching those words back against the
 * option list is how a person who took "none of these" — in wording that happened to match option B
 * — had B drawn with a "taken" mark, the fork claiming they chose the thing they explicitly
 * refused. So the words are read to be SHOWN and never to be matched. What is left is a position,
 * or a complete statement of what was rejected, and neither can collide.
 *
 * IT IS THE ONLY CALLER OF `takenOption` in the product, so there is no second reading of this
 * anywhere to disagree with it.
 */
export function whatWasTaken(cards: readonly OptionCard[], stored: Record<string, unknown> | undefined): TakenOption {
  const index = stored?.['option_index']
  if (typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < cards.length) {
    return { at: 'named', index, letter: cards[index]?.letter ?? '' }
  }
  // AN INDEX THAT DOES NOT ADDRESS THIS FORK IS NOT AN ANSWER ABOUT IT — it happens when a fork's
  // options are edited after somebody decided, and drawing whatever now stands in that position
  // would put a "taken" mark on words nobody chose. The complement is asked instead, and it says
  // "not-said" whenever it cannot answer honestly.
  return takenOption(cards, stored?.['alternatives_rejected'])
}

/**
 * WHAT A FORK LOOKS LIKE ONCE SOMEBODY HAS SETTLED IT, AND WHY IT IS THE WHOLE FORK.
 *
 * ---------------------------------------------------------------------------------------
 * THE THING THAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 * Settling took the fork off the screen. This panel named the decision and stopped; the record
 * page draws no other reading of a proposal — `IN_HEADLINE` claims every one of its fields, and
 * `KindLead` has no proposal case — so after a promote the question, the three options, the
 * agent's reasoning and `revisit_when` were all reachable only through Inspect's raw field dump.
 * The owner settled a fork, went looking for it, and found a panel with a link in it.
 *
 * So the settled fork keeps everything a reader needs to CHECK the decision or change their mind:
 * what was decided, by whom, when, the question it answered, every option including the ones
 * nobody took, which one was taken, and what would reopen it.
 *
 * WHICH OPTION WAS TAKEN IS READ, NOT ASSUMED. `takenOption` works it out from the decision's own
 * `alternatives_rejected` and refuses to answer when that does not line up with this fork's
 * letters — a decision filed by hand, or filed before the picker recorded a complete rejection,
 * says nothing about which option it took, and the panel says so rather than marking one.
 *
 * ---------------------------------------------------------------------------------------
 * THE CARDS ARE STILL BUTTONS HERE, AND THE SERVER IS WHAT REFUSES THE SECOND PRESS
 * ---------------------------------------------------------------------------------------
 * Criterion M57 asks for the option pressed to change colour and STAY coloured on the decision
 * that results, which is what the card taken draws below. It leaves a reader who has just settled
 * a proposal looking at the same cards they pressed one of, so the obvious next act is to press a
 * different one. Drawing those cards as dead text would answer that press with nothing at all.
 *
 * So they stay pressable and the press goes to the same route. The server answers 409 — already
 * settled, naming the decision that settled it — and the page draws that refusal under the heading
 * "Error" with the door's own short sentence. The page never decides for itself that a press would
 * be refused; it asks, and reports what it was told.
 */
function SettledPanel({
  recordId,
  settledBy,
  participants,
  decisionData,
  question,
  usedTo,
  cards,
  picked,
  recommendation,
  revisit,
  sections,
  workspaceId,
  onSettled,
}: {
  recordId: string
  settledBy: readonly SettlingDecision[] | undefined
  participants: ParticipantsReply | undefined
  decisionData: ReadonlyMap<string, Record<string, unknown>> | undefined
  question: string | null
  /**
   * WHAT THE ANSWER WAS GOING TO BE USED TO DO, WHICH A SETTLED FORK NOW KEEPS ON THE SCREEN.
   *
   * IT WAS NOT DRAWN HERE AT ALL BEFORE 31 AUGUST 2026, and it had to become a prop in the same
   * change that let the open panel own the field. `IN_HEADLINE` now claims the key, so the fold
   * stack no longer prints it anywhere — and this panel replaces the open one outright when a fork
   * is settled. Without this the sentence would have left the page at the moment somebody settled
   * the fork, while `section.resultWillBeUsedTo` went on being derived for it: a region on a place
   * that is on no screen.
   *
   * IT IS ALSO WORTH READING AFTERWARDS. It is what the fork claimed the answer was for, and the
   * person checking a decision is the person who can see whether that happened.
   */
  usedTo: string | null
  cards: readonly OptionCard[]
  picked: number | null
  /**
   * WHAT THE AGENT RECOMMENDED, WHICH A SETTLED FORK NOW KEEPS ON THE SCREEN.
   *
   * IT USED NOT TO BE DRAWN HERE AT ALL, and that is the change. A settled fork kept the question
   * and the cards and dropped the reasoning behind the mark reading *agent's pick*, so the one
   * sentence saying WHY that card carries the mark left the page at the moment the fork was
   * decided. It is also what keeps this panel and the region tree agreeing: `section.recommendation`
   * is derived for any proposal that stores one, and a section on no element is a target that
   * resolves to nothing a reader can see.
   */
  recommendation: string | null
  revisit: string | null
  /** Which section each part of this draws. See `ProposalGovernanceProps.sections`. */
  sections: (key: string) => Declares
  /** The project the proposal is in, when the caller knows it is not the one on screen. */
  workspaceId?: string
  /** Re-read the record. A press here is refused, and the refusal is what the reader sees. */
  onSettled: () => void
}) {
  const inspect = useInspect()
  const [readNames] = useProjectAsync(async () => participants ?? api.participants(), [participants])
  const names = participants ?? (readNames.status === 'ready' ? readNames.value : undefined)
  const settling = useSettling(recordId, workspaceId, onSettled)
  // The live decision no later one replaced is the one whose choice this fork is drawn against (problem ZSWftCSVUP2r):
  // choosing again settles the fork a second time, and the first decision then stands replaced. A deleted one has
  // stopped settling anything.
  const deciding = settledBy?.find((d) => !d.deleted && (d.replacedBy ?? null) === null) ?? settledBy?.find((d) => !d.deleted)
  const taken = deciding === undefined ? { at: 'not-said' as const } : whatWasTaken(cards, decisionData?.get(deciding.id))
  /**
   * THE PRESS ON A CARD OF A PROPOSAL THAT IS ALREADY SETTLED.
   *
   * It sends the promotion the open panel sends, and the server refuses it. Nothing here checks
   * first: the page holds no rule about when a proposal may be settled, and inventing one would be
   * a second copy of a rule the server already owns.
   */
  const take = (next: string) => {
    if (next === TAKE_NONE) return
    const write = decisionWrite({ cards, taking: next, ownAnswer: '', because: '' })
    if (write === null) throw new Error(`${next} is not one of this proposal's own options`)
    settling.settle(write)
  }

  return (
    <Panel titleIs="label" declares={{ surface: null }} title={t('decisions.settled')} rank={0} tone="done">
      <style href="mole-office-governance" precedence="default">
        {GOVERNANCE_CSS}
      </style>

      {settledBy === undefined ? (
        // A decision not loaded by the caller differs from a settled proposal with no known
        // deciding record. Both are gaps in the reading, beyond ordinary emptiness.
        <p className="px-gov-settled">{t('decisions.decisionNotLoaded')}</p>
      ) : settledBy.length === 0 ? (
        <p className="px-gov-settled px-gov-none">{t('decisions.settlerUnknown')}</p>
      ) : (
        <ul className="px-gov-settled-list">
          {settledBy.map((d) => (
            <li key={d.id}>
              <RouteLink to={recordPath(d.id)}>{d.title}</RouteLink>
              {d.deleted ? <Tag tone="warn">{t('decisions.deleted')}</Tag> : null}
              {/* A FORK CHOSEN AGAIN LISTS TWO DECISIONS. The replaced one says so, with the word its own page uses. */}
              {(d.replacedBy ?? null) === null ? null : <Tag tone="warn">{M83_WORDS.superseded}</Tag>}
              <span className="px-gov-settled-who">
                <Settler id={d.linkedBy} type={d.linkedByType ?? null} at={d.linkedAt} participants={names} inspect={inspect} />
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* THE QUESTION ITSELF, STILL READABLE. Not a copy of it — this is the same question and the
          same cards the open panel draws, from the same stored fields. */}
      {question === null ? null : (
        <h3
          className="px-gov-q"
          data-long={question.length > LONG_QUESTION ? '1' : undefined}
          {...declaredAttributes(sections(QUESTION_KEY))}
          {...textAttributes(`data.${QUESTION_KEY}`, 0)}
        >
          {content(question)}
        </h3>
      )}

      {/* WHAT THE ANSWER WAS FOR. The same sentence the open panel draws, from the same stored
          field, and drawn here only because this panel REPLACES that one. The blank is not drawn
          when nobody filled it in: on an open fork an empty box is a prompt to the writer, and on a
          settled one it is a prompt nobody can answer any more. */}
      {usedTo === null ? null : (
        <p className="px-gov-for" {...declaredAttributes(sections(RESULT_WILL_BE_USED_TO_KEY))}>
          <span className="px-gov-for-lead">{t('decisions.usedTo')}</span>
          <span className="px-gov-for-said" {...textAttributes(`data.${RESULT_WILL_BE_USED_TO_KEY}`, 0)}>
            {content(usedTo)}
          </span>
        </p>
      )}

      {cards.length === 0 ? null : (
        <section className="px-gov-choices" {...declaredAttributes(sections(OPTIONS_KEY))}>
          <h4 className="px-gov-h">
            {/* THE NAME OF THIS SECTION, exactly as the open panel marks it. */}
            <span {...DRAWS_THE_NAME}>{t('decisions.optionsCount', { n: cards.length })}</span>
            {taken.at === 'own' ? <span className="px-gov-h-note">{t('decisions.noneTaken')}</span> : null}
            {taken.at === 'not-said' ? (
              <span className="px-gov-h-note">{t('decisions.choiceUnknown')}</span>
            ) : null}
          </h4>
          <ol className="px-gov-opts">
            {cards.map((card, i) => (
              <OptionCardView
                key={card.letter}
                letter={card.letter}
                body={content(card.body)}
                agentPick={i === picked}
                taken={taken.at === 'named' && taken.index === i}
                // STILL PRESSABLE, AND THE SERVER IS WHAT SAYS NO. See the header of this
                // component. Nothing is "being chosen" here — the choice is made, and `taken`
                // above is what colours the card it went to — so `taking` names no card.
                choosing={{ taking: '', busy: settling.busy, onTake: take }}
              />
            ))}
          </ol>
          {/* THE REFUSAL FROM A PRESS ON A PROPOSAL THAT IS ALREADY SETTLED, in the server's own
              words, under an "Error" heading. Criterion M43. */}
          {settling.failed === null ? null : (
            <div className="px-gov-refused">
              <ErrorNote label={t('decisions.error')} message={settling.failed.message} fault={settling.failed.fault} />
            </div>
          )}
          {/* WHY THE AGENT PICKED WHAT IT PICKED, WHICH A SETTLED FORK USED TO DROP. The card
              above already carries the mark reading *agent's pick*; this is the sentence saying
              why, and settling took it off the page entirely — the same loss `SettledPanel` was
              built to stop for the question and the options.
              NO LABEL IN FRONT OF IT, and that is not an omission. The label on the open panel
              tells a reader which option the words are about while they are still choosing. Here
              the choice is made and the card is already marked, so a label would be a sentence
              explaining something the reader can see. */}
          {recommendation === null ? null : (
            <p className="px-gov-rec" {...declaredAttributes(sections(RECOMMENDATION_KEY))}>
              <span {...DRAWS_THE_NAME} {...textAttributes(`data.${RECOMMENDATION_KEY}`, 0)}>{content(recommendation)}</span>
            </p>
          )}
        </section>
      )}

      {revisit === null ? null : (
        <p className="px-gov-settled-note" {...declaredAttributes(sections(REVISIT_WHEN_KEY))}>
          {t('decisions.revisit')}{gapBetween(t('decisions.revisit'), revisit)}<span {...textAttributes(`data.${REVISIT_WHEN_KEY}`, 0)}>{content(revisit)}</span>
        </p>
      )}
      {inspect ? <p className="px-gov-stored">{t('pageWords.Governance.005')}{recordId}</p> : null}
    </Panel>
  )
}

/** The fields read when naming a stored actor, from either form of the participant list. */
export type StoredActorParticipants = {
  people: readonly Pick<ParticipantOnTheWire, 'kind' | 'id' | 'name' | 'handle'>[]
  agents: readonly Pick<ParticipantOnTheWire, 'kind' | 'id' | 'name' | 'handle'>[]
}

/**
 * WHO A STORED ACTOR ID NAMES, as the registries read it: one person or one agent with a name, one agent the registry
 * holds no name for, or nobody (no single participant answers to it). Link rows store no actor kind, so an ambiguous
 * name stays unknown.
 */
export type StoredActor = { name: string } | { anAgentWithNoName: { handle: string } } | null

export function storedActor(id: string | undefined, participants: StoredActorParticipants | undefined, kind?: ParticipantRef['kind']): StoredActor {
  const people = kind === 'agent' ? [] : participants?.people.filter(one => one.id === id) ?? []
  const agents = kind === 'person' ? [] : participants?.agents ?? []
  const reference = id === undefined ? null : theAgentAStoredSenderNames({ kind: 'agent', id }, agents.map(one => ({
    who: { kind: 'agent' as const, id: one.id }, name: one.name, handle: one.handle,
  })))
  const agent = reference === null ? undefined : agents.find(one => one.id === reference.id)
  const matches = agent === undefined ? people : [...people, agent]
  const actor = matches.length === 1 ? matches[0] : undefined
  if (actor === undefined) return null
  const name = actor.name.trim()
  return name !== '' ? { name } : actor.kind === 'agent' ? { anAgentWithNoName: { handle: actor.handle.trim() } } : null
}

/** The name a stored actor id names, or, for an agent with no name, its handle; null when nobody single answers. */
export function storedActorName(id: string | undefined, participants: StoredActorParticipants | undefined, kind?: ParticipantRef['kind']): string | null {
  const actor = storedActor(id, participants, kind)
  if (actor === null) return null
  // AN AGENT WITH NO NAME is named here by its handle, for the callers that draw a name in a line of their own (who
  // closed a problem, who passed a decision on, who wrote an unread message). The settled line uses `storedActor`
  // itself and never draws the handle.
  return 'name' in actor ? actor.name : actor.anAgentWithNoName.handle || null
}

function Settler({ id, type, at, participants, inspect }: {
  id: string | undefined
  /** When the decision was linked, or undefined when the row does not say. */
  at: string | undefined
  /**
   * Whether the link's maker was a person or an agent, as the link row stores it. Null when the row
   * never recorded it (a link written before migration 0193); then the name is looked up among both.
   */
  type: ActorType | null
  participants: ParticipantsReply | undefined
  inspect: boolean
}) {
  const actor = storedActor(id, participants, type === 'human' ? 'person' : type === 'agent' ? 'agent' : undefined)
  // WHO DECIDED AND WHEN, with the time where the word puts it: "by Avery 3 days ago", "3天前由 Avery 决定". The
  // settler is never named by an internal handle (round 32 review): an agent the registry holds no name for is said to
  // be one. A link row that names nobody is said plainly in two ways: nobody recorded who decided, or the row names
  // somebody Mole Office cannot tell (no single person or agent answers to it). The ids are developer mode's.
  const [withTime, alone] =
    actor === null
      ? id === undefined || id.trim() === ''
        ? (['decisions.settlerNotRecordedWhen', 'decisions.settlerNotRecorded'] as const)
        : (['decisions.settlerNotKnownWhen', 'decisions.settlerNotKnown'] as const)
      : 'name' in actor
        ? (['decisions.byWhen', 'decisions.by'] as const)
        : (['decisions.byNamelessWhen', 'decisions.byNameless'] as const)
  const name = actor !== null && 'name' in actor ? content(actor.name) : ''
  return <>
    {at !== undefined ? <WordsAroundAStamp at={at} words={(when) => t(withTime, { name, when })} /> : t(alone, { name })}
    {inspect && id !== undefined ? <> <code>{id}</code></> : null}
  </>
}

/** The second human act: the fork is decided, and the change set has not been made yet. */
function ApplyPanel({ recordId, delta, onApplied }: { recordId: string; delta: Delta; onApplied: () => void }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<{ message: string; fault: Fault | null } | null>(null)
  const [done, setDone] = useState(false)
  const summary = summariseDelta(delta)
  // A change set nobody can apply is genuinely blocked; one that is only waiting for a person is
  // waiting. Two different facts, and they were both drawn in the alarm colour.
  const tone: PanelTone = summary.unresolved > 0 ? 'blocked' : 'ask'

  if (done) {
    return (
      <Panel titleIs="label" declares={{ surface: null }} title={t('decisions.applied')} rank={0} tone="done">
        <style href="mole-office-governance" precedence="default">
          {GOVERNANCE_CSS}
        </style>
        <p className="px-gov-settled">{t('decisions.applied')}</p>
      </Panel>
    )
  }

  return (
    <Panel titleIs="label" declares={{ surface: null }} title={t('decisions.notAppliedYet')} rank={0} tone={tone}>
      <style href="mole-office-governance" precedence="default">
        {GOVERNANCE_CSS}
      </style>
      <ChangeSet delta={delta} under={null} />
      <div className="px-gov-act">
        <div className="px-gov-acts">
          <Btn
            variant="primary"
            disabled={busy || summary.unresolved > 0}
            // The reason lives ON the button rather than in a red paragraph three inches below it:
            // it is the answer to "why can I not press this", and that is where the question is
            // asked. Btn keeps a disabled control in the tab order and says this when pressed.
            reason={
              busy
                ? t('decisions.savingReason')
                : t('decisions.answerFirst', { n: summary.unresolved })
            }
            pending={busy}
            onClick={() => {
              void (async () => {
                setBusy(true)
                setFailed(null)
                try {
                  await api.applyProposal(recordId)
                  setDone(true)
                  onApplied()
                } catch (err) {
                  // The server's own words, including which operation refused and why.
                  setFailed({ message: errorMessage(err), fault: faultOf(err) })
                  setBusy(false)
                }
              })()
            }}
          >
            {t('decisions.apply')}</Btn>
          <Hint label={t('decisions.applyHint')}>
            {t('decisions.applyTogether')}</Hint>
        </div>
      </div>
      {failed === null ? null : <ErrorNote label={t('decisions.applyFailed')} message={failed.message} fault={failed.fault} />}
    </Panel>
  )
}

/**
 * EVERY VALUE HERE IS A TOKEN THAT EXISTS IN tokens.css. An invented custom property is dropped at
 * computed-value time with no warning, and a panel styled with one renders as run-together words.
 *
 * `--ask` appears on exactly two things: the band the human action sits in, and the button that
 * settles the fork. `--st-blocked` appears on the unresolved questions, which are a blocked state.
 * Nothing else here carries a hue — the options are told apart by enclosure and a letter.
 *
 * THE BUTTON IS REPAINTED RATHER THAN GIVEN A VARIANT because `BtnVariant` has no `ask` and belongs
 * to another agent's file this phase. It is scoped to this band, it takes `--ask-bg` and `--ask` in
 * the same relationship `data-variant="danger"` takes `--st-failed-bg` and `--st-failed` — the pair
 * the legibility tool already measures — and if the rule were ever dropped the control degrades to
 * the accent-filled primary, which is still the strongest button on the page.
 */
const GOVERNANCE_CSS = `
/* THE OWNER'S PIN, quiet at the top of the fork it is about. It is one press and a word, not a
   band: the pin is a fact about how the queue is ordered, not an instruction. */
.px-pin { margin: 0 0 var(--pad); }
/* ---------------------------------------------------------------- 1. the ask */
/* The largest type on this panel, and larger than the panel's own title, because the question is
   what the page is for. A fork's question is sometimes a paragraph; it is drawn whole rather than
   clamped, because the sentence actually being asked is not always the first one. */
.px-gov-q {
  margin: 0 0 var(--pad-lg);
  font-size: var(--fs-5);
  font-weight: 600;
  line-height: var(--lh-tight);
  color: var(--text);
  overflow-wrap: anywhere;
}
/* WHAT THE ANSWER WILL BE USED TO DO. One line under the question, quiet: it is a fact about the
   fork rather than part of the question, and it is drawn whether or not anybody wrote it. The lead
   is set like a small caption so that the blank reads as a blank rather than as an empty row. */
.px-gov-for {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px;
  margin: calc(0px - var(--pad)) 0 var(--pad-lg);
  min-width: 0;
}
.px-gov-for-lead {
  color: var(--text-3);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
  letter-spacing: .04em; text-transform: uppercase;
}
.px-gov-for-said { color: var(--text-2); font: var(--fs-2)/var(--lh-body) var(--font-ui); overflow-wrap: anywhere; }

/* A question that is a paragraph is set as one: still the largest reading matter on the panel, and
   no longer twelve lines of bold at headline size. */
.px-gov-q[data-long="1"] {
  max-width: 46rem;
  font-size: var(--fs-4);
  font-weight: 500;
  line-height: var(--lh-body);
}
.px-gov-none { color: var(--text-3); font-weight: 400; font-size: var(--fs-2); }
.px-gov-noopts { margin: 0 0 var(--pad-lg); }

.px-gov-folds { display: flex; flex-direction: column; gap: 2px; margin: 0 0 var(--gut); }
/* A reason in a fold keeps the line breaks it was written with. */
.px-gov-fold > p { white-space: pre-line; }
/* A closed fold has to look like a control; styles.css strips every list marker in the app, so the
   triangle is drawn. Block rather than flex: a flex container drops the whitespace-only text nodes
   between its children, and these summaries are built out of text around inline elements. */
.px-gov-fold > summary {
  cursor: pointer;
  display: block;
  list-style: none;
  padding: var(--pad) 0 var(--pad) 1.1rem;
  text-indent: -1.1rem;
  font-size: var(--fs-3);
  font-weight: 600;
  color: var(--text-2);
}
.px-gov-fold > summary::-webkit-details-marker { display: none; }
.px-gov-fold > summary::before {
  content: "▸";
  display: inline-block;
  width: 1.1rem;
  text-indent: 0;
  color: var(--text-3);
}
.px-gov-fold[open] > summary::before { content: "▾"; }
.px-gov-fold > summary:hover { color: var(--text); }
.px-gov-fold > summary:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
/* The one place on this panel that keeps the reading measure: a fork's stored reasoning is
   genuinely long-form prose and is the only thing here that runs to a paragraph. */
.px-gov-fold > p, .px-gov-fold > ul, .px-gov-fold > ol {
  margin: 0 0 var(--pad);
  max-width: var(--measure-in-box);
  font-size: var(--fs-3);
  line-height: var(--lh-body);
  color: var(--text-2);
  overflow-wrap: anywhere;
}
.px-gov-ev { padding-left: var(--pad-lg); list-style: disc outside; display: flex; flex-direction: column; gap: var(--pad); }

/* ---------------------------------------------------------------- mounted on Home
   NO PANEL, NO BORDER, NO GROUND OF ITS OWN. It is drawn inside a decision card that already has
   all three, and a second enclosure inside the first is what made one fork read as two things. The
   question shrinks by one step for the same reason: on Home the card's title is above it, so this
   is the second line of one object rather than the headline of a page. */
/* THE WIDTH THE FORM MEASURES ITSELF AGAINST IS THIS ONE. Without this line the nearest thing
   Chromium measures for the query below is the PANEL, which on Home is the whole band -- so a form
   inside a 560px card was told it had 1140px and split into two columns. Photographed at 1440 on
   15 August: the option cards were about 55px wide and every option read one character per line.
   The stacking the query already describes was never wrong; it was measuring the wrong box. */
.px-gov-inline { display: flex; flex-direction: column; min-width: 0; container-type: inline-size; container-name: panel; }
.px-gov-inline .px-gov-q { font-size: var(--fs-4); margin-bottom: var(--gut); }
.px-gov-inline .px-gov-q[data-long="1"] { font-size: var(--fs-3); }
.px-gov-inline .px-gov-opt-text { font-size: var(--fs-2); }
.px-gov-inline .px-gov-act { background: transparent; border-left: 0; padding: 0; margin-top: var(--gut); }

/* ---------------------------------------------------------------- 2. the choices */
.px-gov-h {
  margin: 0 0 var(--pad);
  display: flex; align-items: baseline; gap: var(--pad) var(--gut); flex-wrap: wrap;
  font-size: var(--fs-3);
  font-weight: 600;
  color: var(--text);
}
.px-gov-h-note { font-size: var(--fs-2); font-weight: 400; color: var(--text-3); }
.px-gov-choices { margin: 0; min-width: 0; }

/* THE CHOICE AND THE ACT, SIDE BY SIDE AT A DESK AND STACKED ON A PHONE.
   The deciding controls sit beside the options rather than under them, so that
   settling a fork is one screen and not a scroll. The form asks the width of the panel it is in,
   and never the window's, because the same form is drawn in a Home card, in the first column of a
   record's page and across a whole page.
   40rem IS THE PANEL WIDTH AT WHICH BOTH COLUMNS STAY READABLE: a form of 20rem, the gap, and about
   19rem for the options. It was 56rem until a record's page set its facts beside the record (the
   one width rule, components/SideBySide.tsx). That left a fork's panel about 700 pixels wide at a
   1440 window, and at 56rem its box for a reason fell under the options again. A Home card of 560
   pixels still stacks.
   THE FORM TAKES AT MOST 40 PER CENT OF A NARROW PANEL, so the options keep the larger share. From a
   panel of 60rem up the form is 24rem, as it always was. */
.px-gov-decide { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gut); margin: 0 0 var(--gut); min-width: 0; }

/* STACKED, THE FORM COMES AFTER THE OPTIONS AGAIN, AND THAT IS P89 UNDOING ITS OWN REASON.

   IT USED TO COME FIRST, and the argument held while its premise did: a press on an option WAS the
   decision, so somebody who scrolled to the cards on a phone and pressed one had settled the fork
   without ever reaching the box that asks why (a sentence saying "write this
   first" is what UX-CONTRACT 8.10 forbids, so order was the answer a sentence stood in for).

   THE PREMISE WENT ON 9 SEPTEMBER 2026. A press on a card writes nothing now, and the
   decision is written by a confirm press that lives inside this form. Leaving the form above meant
   that at 390 the reader pressed a card and the press naming what it would write was off the top of
   the screen — measured in the handback pictures for ui-fix-1, where "Decide B: Close on force…" sat
   above four cards with the marked one below the fold. That is this rule's own fault one press
   further on: what you are about to do, out of sight at the moment you do it.

   SO THE ORDER IS THE MARKUP'S AT EVERY WIDTH. A phone reads the question, then the cards, then the
   box for a reason with the confirm press under it — the order the act happens in: choose, say why
   if you want to, write it. Nothing can be settled before the box is reached, because nothing is
   settled until the press below the box. Side by side at a desk the box was always already in
   view. */
.px-gov-decide[data-deciding="1"] > .px-gov-act { order: 0; }

@container panel (min-width: 40rem) {
  .px-gov-decide[data-deciding="1"] { grid-template-columns: minmax(0, 1fr) minmax(20rem, min(24rem, 40%)); align-items: start; }
  /* THE THREE PARTS ARE PLACED BY HAND HERE, because the refusal sits between the cards and the
     rest of the form in the markup — under the press it is about, which is where a phone reads it —
     and letting the grid place it would push the form column onto a second row. */
  .px-gov-decide[data-deciding="1"] > .px-gov-choices,
  .px-gov-decide[data-deciding="1"] > .px-gov-noopts { grid-column: 1; grid-row: 1; }
  .px-gov-decide[data-deciding="1"] > .px-gov-refused { grid-column: 1; grid-row: 2; }
  /* THE ORDER GOES BACK TO THE MARKUP'S at a desk. The three parts here are placed by hand, so the
     order property cannot move them; it is put back anyway, because a reader of this rule should
     not have to work out that it is dead. */
  .px-gov-decide[data-deciding="1"] > .px-gov-act { grid-column: 2; grid-row: 1 / span 2; order: 0; }
}

/* ENCLOSURE, NOT COLOUR. Three bordered cards is what makes three things read as three peers, and
   enclosure is the channel this product had not been spending. A hue per option would say each
   option is a different state, which is the one thing colour means here. */
.px-gov-opts { list-style: none; margin: 0 0 var(--pad-lg); padding: 0; display: flex; flex-direction: column; gap: var(--pad); }
.px-gov-opt {
  min-width: 0;
  background: var(--panel-2);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius);
}
/* The card's own row. It is a button while somebody is deciding, so the whole card is the hit
   target rather than a 16px circle in the corner of it. */
.px-gov-opt-inner {
  display: flex; align-items: flex-start; gap: var(--gut);
  min-width: 0;
  padding: var(--pad-lg);
  border-radius: var(--radius);
}
/* A BUTTON THAT LOOKS LIKE THE CARD IT IS. The browser's own button styling is taken off — the
   background, the border, the centred one-line text — and what is left is the card, which is what
   a person is choosing between. Everything a button gives that matters is kept: the press, the
   keyboard, the focus ring and the announcement. */
button.px-gov-opt-inner {
  width: 100%;
  appearance: none;
  border: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
button.px-gov-opt-inner:hover:not(:disabled) { background: var(--hover); }
button.px-gov-opt-inner:focus-visible {
  outline: var(--focus-w) solid var(--focus);
  outline-offset: calc(0px - var(--focus-w));
}
/* WHILE ONE PRESS IS BEING WRITTEN. Quieter and unpressable, and it says which one it is waiting
   on by leaving that card at full strength. */
button.px-gov-opt-inner:disabled { cursor: default; opacity: .55; }
.px-gov-opt[data-chosen="1"] button.px-gov-opt-inner:disabled { opacity: 1; }
/* The picked one is drawn by weight and by the chip inside it, never by a tint: an agent's opinion
   is not a state, and a coloured card would read as an instruction. */
.px-gov-opt[data-picked="1"] { border-color: var(--text-3); box-shadow: var(--elev-1); }
/* What the reader is choosing right now, and what was chosen a month ago. The first is selection
   and takes the app's selection fill; the second carries the word "taken" beside it, so neither is
   held by colour alone. */
/* ROLE 12 OF THE COLOUR ROLE REGISTER: the choice you are considering, not yet committed. It is
   --ask-line rather than --ask, because --ask is role 11 — the panel around the fork, which is
   waiting on you — and a card inside that panel drawing the panel's own ink says the same thing
   twice. Two more channels beside the ink: 2px where every other card is 1px, and the word. */
.px-gov-opt[data-chosen="1"] { border-color: var(--ask-line); border-width: 2px; }
.px-gov-opt[data-chosen="1"] .px-gov-opt-inner { background: var(--ask-row); }
/* ROLE 13 OF THE COLOUR ROLE REGISTER: this reached its end — a decision that was committed. Since 6
   September 2026 a card changes colour when it is chosen, and criterion M57 asks for the colour to STAY on the
   decision that results. It used to be drawn in --text, which is the ink of body copy, so the one
   card in the list that had been chosen was the one drawn in no colour at all.
   THREE CHANNELS AND ONLY ONE IS THE HUE: the word "taken" beside the option, a 2px edge where
   every other card has 1px, and the ink. */
.px-gov-opt[data-taken="1"] {
  border-color: var(--st-done-line);
  border-width: 2px;
  box-shadow: var(--elev-1);
}
.px-gov-opt[data-taken="1"] .px-gov-opt-inner { background: var(--st-done-row); }
.px-gov-opt[data-taken="1"] button.px-gov-opt-inner:hover:not(:disabled) { background: var(--st-done-bg); }
/* THE WORD, WHICH IS THE CHANNEL THAT IS NOT COLOUR. It draws the same ink as the card's edge
   because they say one thing, and a reader who cannot tell the two greens apart still reads it. */
.px-gov-taken {
  align-self: flex-start;
  padding: 1px 8px;
  border: var(--border-w) solid var(--st-done-line);
  border-radius: var(--radius-pill);
  font-size: var(--fs-1);
  font-weight: 700;
  color: var(--st-done);
  background: var(--panel);
}
/* THE REFUSAL FROM A PRESS, UNDER THE CARDS. It spans both columns of the deciding layout, so it
   is under the option that was pressed rather than at the foot of the column beside them. */
.px-gov-refused { min-width: 0; }
.px-gov-letter {
  flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  width: 1.9rem; height: 1.9rem;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-pill);
  font-family: var(--font-ui);
  font-size: var(--fs-2);
  font-weight: 600;
  color: var(--text);
  background: var(--panel);
}
.px-gov-opt[data-picked="1"] .px-gov-letter { border-color: var(--text); }
.px-gov-opt-body { min-width: 0; display: flex; flex-direction: column; gap: var(--pad); }
/* 16px, not 14. The owner: *"the design and text mount is very good. We could make the text size
   bigger."* This is the reading matter somebody settles a fork on — it is the last thing in the
   product that should be set at the size of a caption. */
.px-gov-opt-text {
  margin: 0;
  font-size: var(--fs-3);
  line-height: var(--lh-body);
  color: var(--text);
  overflow-wrap: anywhere;
}
.px-gov-pick {
  align-self: flex-start;
  padding: 1px 8px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-pill);
  font-size: var(--fs-1);
  font-weight: 600;
  letter-spacing: .04em;
  color: var(--text-2);
  background: var(--panel);
}
.px-gov-rec {
  margin: 0;
  font-size: var(--fs-3);
  line-height: var(--lh-body);
  color: var(--text-2);
  overflow-wrap: anywhere;
}
.px-gov-rec-lab { font-weight: 600; color: var(--text); }

/* ---------------------------------------------------------------- the change set */
.px-delta { margin: 0 0 var(--gut); }
.px-delta-out {
  margin: 0 0 var(--gut);
  font-size: var(--fs-3);
  line-height: var(--lh-body);
  color: var(--text);
  overflow-wrap: anywhere;
}
/* THE GATE, FIRST AND LOUDEST. These are two rows of eleven and one hundred per cent of what a
   person can do about the change set, and they used to sit under the other nine. */
.px-delta-open {
  margin: 0 0 var(--gut);
  padding: var(--pad-lg);
  border-left: 3px solid var(--st-blocked);
  border-radius: var(--radius-sm);
  background: var(--st-blocked-row);
  min-width: 0;
}
.px-delta-open-head {
  margin: 0 0 var(--pad);
  font-size: var(--fs-3);
  font-weight: 600;
  line-height: var(--lh-body);
  color: var(--text);
}
.px-delta-qs {
  margin: 0; padding-left: 1.3em;
  display: flex; flex-direction: column; gap: var(--pad);
  list-style: decimal outside;
  min-width: 0;
}
.px-delta-qs li { min-width: 0; }
.px-delta-q {
  display: block;
  font-size: var(--fs-3);
  line-height: var(--lh-body);
  color: var(--text);
  overflow-wrap: anywhere;
}
.px-delta-all { margin: 0; }
/* STACKED, NOT COLUMNED. A 7.5rem label column beside an 8.2rem indent left the sentence a 209px
   ravine at 390 — about 32 characters, 113px tall for one question. */
.px-delta-ops { list-style: none; margin: var(--pad) 0 0; padding: 0; display: flex; flex-direction: column; }
.px-delta-op {
  display: flex; flex-direction: column; gap: 2px;
  padding: var(--pad) 0;
  border-bottom: var(--border-w) solid var(--border);
  min-width: 0;
}
.px-delta-op:last-child { border-bottom: 0; }
.px-delta-kind { font-size: var(--fs-1); font-weight: 600; letter-spacing: .04em; color: var(--text-3); }
.px-delta-op-open .px-delta-kind { color: var(--st-blocked); }
.px-delta-says { font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text); overflow-wrap: anywhere; }
.px-delta-why { font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-2); overflow-wrap: anywhere; }
.px-delta-count, .px-delta-src { margin: var(--pad) 0 0; font-size: var(--fs-1); color: var(--text-3); }

/* ---------------------------------------------------------------- 4. what you do */
/* THE ONE PLACE --ask IS SPENT HERE, with the button inside it. A band rather than a chip: the
   human action is the region a reader has to be able to find without reading, and somebody
   arriving from Home's decision queue should land on the colour they were sent by. */
.px-gov-act {
  margin: var(--gut) 0 0;
  padding: var(--pad-lg);
  background: var(--ask-row);
  border-left: 3px solid var(--ask-line);
  border-radius: var(--radius-sm);
  min-width: 0;
}
.px-gov-acts { display: flex; gap: var(--pad) var(--gut); align-items: center; flex-wrap: wrap; }
.px-gov-act .px-btn[data-variant="primary"] {
  background: var(--ask-bg);
  border-color: var(--ask);
  color: var(--ask);
}
.px-gov-act .px-btn[data-variant="primary"]:hover,
.px-gov-act .px-btn[data-variant="primary"][data-force="hover"] {
  background: var(--ask-bg); border-color: var(--ask); filter: brightness(.94);
}
.px-gov-act .px-btn[aria-disabled="true"] {
  background: var(--panel-2); border-color: var(--border-strong); color: var(--text-3); filter: none;
}
/* The three rules that used to sit here dressed the "Leave it open" link, which this file's own
   header says was deleted for recording nothing. Nothing draws that class. */
.px-gov-defer {
  margin: var(--pad) 0 0;
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text-2);
  overflow-wrap: anywhere;
}
.px-gov-form { display: flex; flex-direction: column; gap: var(--pad-lg); min-width: 0; }
.px-gov-replaces { min-width: 0; margin: 0; padding: var(--pad); border: 1px solid var(--border-strong); overflow-wrap: anywhere; }
.px-gov-replaces legend { font-weight: 600; }
.px-gov-replaces p { margin: 0 0 var(--pad); color: var(--text-2); }
.px-gov-replaces label { display: flex; align-items: flex-start; gap: var(--pad); margin: var(--pad) 0; }
.px-gov-replaces label span { min-width: 0; }
.px-gov-replaces small { display: block; color: var(--text-2); }
.px-gov-stored { margin: 0; font-family: var(--font-mono); font-size: var(--fs-1); color: var(--text-3); overflow-wrap: anywhere; }

/* ---------------------------------------------------------------- after it is settled */
.px-gov-settled { margin: 0; font-size: var(--fs-3); line-height: var(--lh-body); color: var(--text); overflow-wrap: anywhere; }
.px-gov-settled-list {
  list-style: none; margin: 0 0 var(--gut); padding: 0;
  display: flex; flex-direction: column; gap: var(--pad);
  font-size: var(--fs-4);
  min-width: 0;
}
.px-gov-settled-list li { display: flex; align-items: baseline; gap: var(--pad) var(--gut); flex-wrap: wrap; min-width: 0; }
.px-gov-settled-list a { color: var(--accent); font-weight: 600; text-decoration: underline; text-underline-offset: .16em; overflow-wrap: anywhere; }
/* Who settled it and when. A fact about the decision, at caption size beside its title, because
   the title is what a reader is looking for and this is what they check once they have found it. */
.px-gov-settled-who { display: inline; font-size: var(--fs-1); color: var(--text-3); overflow-wrap: anywhere; }
.px-gov-settled-note { margin: var(--gut) 0 0; font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text-2); overflow-wrap: anywhere; }

/* ---------------------------------------------------------------- closing it by a decision already made */
.px-gov-already { display: flex; flex-direction: column; gap: var(--pad); margin-top: var(--gut); min-width: 0; }
.px-gov-already-list {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-direction: column; gap: var(--pad);
  font-size: var(--fs-3);
  min-width: 0;
}
.px-gov-already-list li { display: flex; align-items: baseline; gap: var(--pad) var(--gut); flex-wrap: wrap; min-width: 0; }
.px-gov-already-list li[data-chosen] a { font-weight: 700; }
/* NO COLOUR IS NAMED HERE, as on .px-gov-superseded a below: the register in src/shared/colourroles.ts has no row for a
   link, and naming --accent would add a selector to ACCENT_OUTSIDE_ITS_JOBS. The link takes its ink from the product's
   own anchor rule (src/web/styles.css). This rule only sets its weight, its underline and its wrapping. */
.px-gov-already-list a { font-weight: 600; text-decoration: underline; text-underline-offset: .16em; overflow-wrap: anywhere; min-width: 0; }
.px-gov-already-who { font-size: var(--fs-1); color: var(--text-3); white-space: nowrap; }

/* ---------------------------------------------------------------- changing a decision (M83)

   THESE RULES WERE MISSING AND THE HANDBACK PICTURE FOUND THEM. Every line of this panel drew with
   no rule of its own, so the stamp and the words written after it ran together with no gap at all:
   "just nowStill right a day later". A class with no rule is not a small fault here — the panel was
   leaning on whatever happened to be set around it, at every width and in both themes. */
.px-gov-superseded { margin: 0 0 var(--pad); display: flex; align-items: baseline; gap: var(--pad); flex-wrap: wrap; min-width: 0; }
/* THE LINK IS LEFT TO THE STYLESHEET'S OWN ANCHOR RULE, which already spends --accent on every link
   in the product (src/web/styles.css:92). Saying it again here would add a seventh row to
   ACCENT_OUTSIDE_ITS_JOBS in src/shared/colourroles.ts, a debt register whose own words are that the
   list shrinking is the repair — and it would buy nothing, because the link was already drawn right
   when this whole panel had no stylesheet at all. All this rule does is let a long title wrap. */
.px-gov-superseded a { overflow-wrap: anywhere; }
/* THE DECISIONS THAT REPLACED THIS ONE DIRECTLY, under the mark and laid out as it is (wave 13s round 104, item 15). */
.px-gov-replaced-directly { margin: 0 0 var(--pad); display: flex; align-items: baseline; gap: var(--pad); flex-wrap: wrap; min-width: 0; }
.px-gov-replaced-directly a { overflow-wrap: anywhere; }
.px-gov-took, .px-gov-because {
  margin: 0 0 var(--pad);
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text);
  overflow-wrap: anywhere;
}
.px-gov-because { color: var(--text-2); }
/* What was taken may hold the person's own words from a report's question, line breaks and all,
   so it is shown as written; so is the reason. */
.px-gov-took, .px-gov-because { white-space: pre-wrap; }
/* The label before a value, never a sentence: small, quiet, and not the thing being read. */
.px-gov-key { font-size: var(--fs-1); letter-spacing: .04em; text-transform: uppercase; color: var(--text-3); margin-right: 4px; }
.px-gov-since { list-style: none; margin: var(--gut) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
/* THE GAP THAT WAS MISSING. Baseline, so the stamp sits on the line of the first word beside it. */
.px-gov-since-row { display: flex; align-items: baseline; gap: var(--gut); flex-wrap: wrap; min-width: 0; }
.px-gov-since-words { font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text); overflow-wrap: anywhere; min-width: 0; flex: 1 1 16rem; }
.px-gov-m83 { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad) var(--gut); margin-top: var(--gut); min-width: 0; }
.px-gov-m83-form { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; flex: 1 1 20rem; }
.px-gov-m83-says { margin: 0; font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text-2); overflow-wrap: anywhere; }
.px-gov-m83-none { margin: 0; }
/* THE TWO HALVES OF A DECISION, criterion P76. Named in plain words, with who may change each and
   which fields belong to it. The values themselves stay where they were; the history below says who
   changed a note and when. */
.px-gov-halves { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.px-gov-half { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.px-gov-half-name { margin: 0; font-size: var(--fs-2); font-weight: 600; color: var(--text); }
.px-gov-half-who { margin: 0; font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-3); }
.px-gov-half-fields { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px var(--gut); min-width: 0; }
/* FILLED AND GREY NAMES DIFFER AT A GLANCE IN BOTH THEMES (a review of round 34, point 3): a filled name is bold
   in the text colour, and a grey name is plain and a step lighter than --text-3, which the help sentences use. The
   lighter grey is --text-3 mixed with the panel, 85 to 15, and still reads at 4.5:1 or more in both themes. */
.px-gov-half-field { font-size: var(--fs-1); font-weight: 700; color: var(--text); }
.px-gov-half-missing { font-weight: 400; color: color-mix(in srgb, var(--text-3) 85%, var(--panel)); }
.px-gov-halves-key { margin: 6px 0 0; color: var(--text-2); font-size: var(--fs-1); }
`

// ============================================================================ a decision they can change

/**
 * A DECISION THEY HAVE MADE, ON ITS OWN PAGE: the words they can add, and the press to choose again.
 * Criterion M83.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * On proposal t29v9sRzAAFT, a press on option A became the decision at once. There was no Decide
 * it button, the option could not be changed afterwards and no comment could be added, even when
 * the decision was not yet carried out and could still have changed.
 *
 * MEASURED: the press became the decision under criterion M57 (commit
 * 149d0101), and the reason box sits beside the options and is saved WITH the press. So words had to
 * be typed before the press, and once it landed nothing changed the option or added a word.
 *
 * THE PRESS ON AN OPTION STAYS THE DECISION. M57 is not undone here: what changes is that it is not
 * final. Two presses are added and none is taken away.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH PRESS DOES
 * ---------------------------------------------------------------------------------------
 *
 * SAY MORE appends to `words_since`, each entry with when it was written. It never touches
 * `because`: what they thought while deciding and what they thought a week later are two facts.
 *
 * CHOOSE AGAIN draws the fork's options and writes a NEW decision that supersedes this one, with their
 * words why. Nothing is edited: a decision that could be rewritten in place would take the record of
 * what they decided last week and leave nothing saying it had ever said otherwise.
 *
 * A DECISION ALREADY SUPERSEDED CARRIES NEITHER PRESS. It carries the mark and the way to the one
 * that stands, which is where the presses are.
 */
export function DecisionGovernance({
  recordId,
  data,
  supersededBy,
  replacedDirectlyBy,
  fork,
  onChanged,
}: {
  recordId: string
  /** The decision's own fields. */
  data: Record<string, unknown>
  /** The decision that stands in its place, as the server answers it (`replacedBy`), or null because none replaced it. */
  supersededBy: { id: string; title: string } | null
  /**
   * The decisions that replaced this one directly, filed first first, as the server answers them (`replacedDirectlyBy`).
   * Left out, nothing is drawn for them: nobody said which they are.
   */
  replacedDirectlyBy?: readonly { id: string; title: string }[]
  /** The fork this was made from with its options, or null because it was written on its own. */
  fork: { id: string; title: string; options: readonly string[] } | null
  onChanged: () => void
}) {
  const [saying, setSaying] = useState(false)
  const [words, setWords] = useState('')
  const [choosing, setChoosing] = useState(false)
  const [taking, setTaking] = useState('')
  const [ownAnswer, setOwnAnswer] = useState('')
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: Fault | null } | null>(null)
  // THE WORDS SINCE ARE WRITTEN ON THE VERSION THE PAGE DRAWS, since the page draws the list as it changes while the
  // person types. The new entry is added to the stored list again when a newer version is stored.
  const write = useWriteThisRecord(recordId, 'drawn')

  const said = wordsSince(data)
  const cards = optionCards(fork === null ? [] : [...fork.options])

  const run = (what: Promise<unknown>): void => {
    setFault(null)
    setBusy(true)
    void what
      .then((written) => {
        setBusy(false)
        // BACK TO THE FORM, from the question asked when another writer changed the decision: nothing was stored, and
        // the words stay in the box.
        if (typeof written === 'object' && written !== null && 'notNow' in written) return
        setSaying(false)
        setChoosing(false)
        setWords('')
        setWhy('')
        setTaking('')
        setOwnAnswer('')
        onChanged()
      })
      .catch((err: unknown) => {
        setBusy(false)
        setFault({ message: errorMessage(err), fault: faultOf(err) })
      })
  }

  const sayMore = (): void => {
    const now = new Date()
    const at =
      `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}-` +
      `${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:` +
      `${String(now.getMinutes()).padStart(2, '0')}`
    // APPENDED AND NEVER REPLACED. Every earlier entry is sent back with the new one, so nothing they
    // wrote before is lost; and the record keeps a revision of each write, so even a lost race is
    // readable afterwards. On a newer version the list is built again from that version's entries.
    const adding = { at, words: words.trim() }
    run(write({ dataPatch: { words_since: [...said, adding] } }, (theirs) => ({ dataPatch: { words_since: [...wordsSince(theirs.data), adding] } })))
  }

  const chooseAgain = (): void => {
    const write = decisionWrite({ cards, taking, ownAnswer, because: why })
    if (write === null) return
    run(api.chooseAgain(recordId, write))
  }

  return (
    <Panel titleIs="label" declares={{ surface: 'decision.change' }} title={M83_WORDS.title} rank={0}>
      <style href="mole-office-governance" precedence="default">
        {GOVERNANCE_CSS}
      </style>

      {/* WHETHER THIS IS STILL THE DECISION THAT STANDS. First, because it changes what everything
          under it means: a superseded decision is history and not an answer. */}
      {supersededBy === null ? null : (
        <p className="px-gov-superseded">
          <Tag tone="warn">{M83_WORDS.superseded}</Tag>{' '}
          <span className="px-gov-key">{M83_WORDS.standsNow}</span>{' '}
          <RouteLink to={recordPath(supersededBy.id)}>{supersededBy.title}</RouteLink>
        </p>
      )}
      {/* AND WHICH DECISIONS REPLACED IT DIRECTLY, because those are what its links name (item 15). Not drawn when the
          one that replaced it directly is the one that stands, which the mark already names. */}
      {supersededBy === null ||
      replacedDirectlyBy === undefined ||
      replacedDirectlyBy.length === 0 ||
      (replacedDirectlyBy.length === 1 && replacedDirectlyBy[0]?.id === supersededBy.id) ? null : (
        <p className="px-gov-replaced-directly">
          <span className="px-gov-key">{M83_WORDS.replacedDirectly}</span>
          {replacedDirectlyBy.map((one) => (
            <span key={one.id}>
              {' '}
              <RouteLink to={recordPath(one.id)}>{one.title}</RouteLink>
            </span>
          ))}
        </p>
      )}

      {/* WHAT WAS TAKEN, in the words of the option itself. */}
      {typeof data['option_taken'] !== 'string' || data['option_taken'].trim() === '' ? null : (
        <p className="px-gov-took">
          <span className="px-gov-key">{M83_WORDS.took}</span> {data['option_taken']}
        </p>
      )}

      {/* WHAT THE PERSON SAID WHILE DECIDING, AND EVERYTHING THEY HAVE SAID SINCE. Two lists, because they are
          two facts: `because` was written with the press and these were written after it. */}
      {typeof data['because'] !== 'string' || data['because'].trim() === '' ? null : (
        <p className="px-gov-because">{data['because']}</p>
      )}
      {said.length === 0 ? null : (
        <ul className="px-gov-since">
          {said.map((one, i) => (
            <li key={`${one.at}/${String(i)}`} className="px-gov-since-row">
              <Stamp at={one.at} />
              <span className="px-gov-since-words">{content(one.words)}</span>
            </li>
          ))}
        </ul>
      )}

      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}

      {/* A DECISION THAT HAS BEEN SUPERSEDED CARRIES NO PRESS. The one that stands is where they are,
          and the link above is the way to it. */}
      {supersededBy !== null ? null : (
        <div className="px-gov-m83">
          {saying ? (
            <div className="px-gov-m83-form">
              <TextArea value={words} onChange={setWords} rows={3} />
              <Btn onClick={sayMore} disabled={busy || words.trim() === ''} reason={busy ? M83_WORDS.saving : M83_WORDS.writeWordsFirst}>
                {M83_WORDS.sayMore}
              </Btn>
              <Btn variant="ghost" onClick={() => setSaying(false)}>
                {M83_WORDS.leaveIt}
              </Btn>
            </div>
          ) : (
            <Btn variant="ghost" onClick={() => setSaying(true)}>
              {M83_WORDS.sayMore}
            </Btn>
          )}

          {/* CHOOSING AGAIN NEEDS THE FORK'S OPTIONS, so it is offered only on a decision made from
              one. A decision written on its own has no options to draw again, and a press that
              opened an empty list would be a press that does nothing. */}
          {fork === null ? (
            <p className="px-gov-m83-none">
              <Absence title={M83_WORDS.noForkSays} />
            </p>
          ) : choosing ? (
            <div className="px-gov-m83-form">
              <p className="px-gov-m83-says">{M83_WORDS.chooseSays}</p>
              <Options
                cards={cards}
                picked={null}
                recommendation={null}
                sections={() => ({ surface: null })}
                choosing={{ taking, busy, onTake: setTaking }}
              />
              {/* NONE OF THESE IS ANSWERED IN THE PERSON'S OWN WORDS, so taking it draws the line for them. */}
              {taking !== TAKE_NONE ? null : (
                <Field label={M83_WORDS.ownAnswer}>
                  <TextArea value={ownAnswer} onChange={setOwnAnswer} rows={2} placeholder={t('decisions.oneLine')} />
                </Field>
              )}
              <TextArea value={why} onChange={setWhy} rows={3} />
              <Btn
                onClick={chooseAgain}
                disabled={busy || taking === '' || (taking === TAKE_NONE && ownAnswer.trim() === '')}
                reason={busy ? M83_WORDS.saving : taking === '' ? M83_WORDS.chooseFirst : M83_WORDS.writeOwn}
              >
                {M83_WORDS.chooseAgain}
              </Btn>
              <Btn variant="ghost" onClick={() => setChoosing(false)}>
                {M83_WORDS.leaveIt}
              </Btn>
            </div>
          ) : (
            <Btn variant="ghost" onClick={() => setChoosing(true)}>
              {M83_WORDS.chooseAgain}
            </Btn>
          )}
        </div>
      )}
    </Panel>
  )
}

/** Every word this panel draws. Criterion M83. */
export const M83_WORDS = {
  get title() { return t('decisions.thisDecision') },
  // ONE NAME FOR option_taken, the record page's own (wave 13q's round 33): this band said "you took" for it.
  get took() { return t('record.section.option_taken') },
  get superseded() { return t('decisions.superseded') },
  get standsNow() { return t('decisions.standsNow') },
  get replacedDirectly() { return t('decisions.replacedDirectly') },
  get sayMore() { return t('decisions.addWords') },
  get writeWordsFirst() { return t('decisions.addWordsFirst') },
  get saving() { return t('decisions.saving') },
  get leaveIt() { return t('decisions.leave') },
  get chooseAgain() { return t('decisions.chooseAgain') },
  get chooseSays() { return t('decisions.chooseSays') },
  get chooseFirst() { return t('decisions.chooseAgainFirst') },
  get ownAnswer() { return t('decisions.ownAnswer') },
  get writeOwn() { return t('decisions.writeOwn') },
  /** Why there are no choices to draw again, behind the short absence mark. */
  get noFork() { return t('decisions.noFork') },
  get noForkSays() { return t('decisions.noForkSays') },
} as const

/**
 * The words added since the press, read defensively off the stored list. Criterion M83. `datedWordsIn` in
 * src/shared/sections.ts is the one reader, so this band and the record page's fold read the list alike.
 */
export function wordsSince(data: Record<string, unknown>): { at: string; words: string }[] {
  return datedWordsIn(data['words_since']).map(({ at, words }) => ({ at, words }))
}

// ============================================================================ the two halves, named

/** Every word the two halves of a decision are named by. Criterion P76. */
export const P76_WORDS = {
  get title() { return t('decisions.halves') },
  get decision() { return t('decisions.decisionHalf') },
  get notes() { return t('decisions.notesHalf') },
  get whoMayChangeTheDecision() { return t('decisions.changeDecisionRule') },
  get whoMayChangeTheNotes() { return t('decisions.changeNotesRule') },
} as const

/**
 * A DECISION HAS A CORE AND NOTES, AND THE PAGE NAMES THEM IN PLAIN WORDS. Criterion P76.
 *
 * Whoever made the decision may change it, and the
 * administrator may too. The split is declared on the fields themselves (`FieldSpec.half`), so this
 * panel, the kind's own notes and the write guard all read one answer rather than three.
 *
 * IT DOES NOT BUILD A SECOND HISTORY. Who changed what, and when, is the record's own change log,
 * drawn by `ChangeLog` and `RecordHistory` from the revisions ledger that already holds it. This
 * panel names the two parts and says who may change which; the history says who did.
 */
const NOT_A_SECTION: Readonly<Record<string, WordKey>> = {
  decided_on: 'decisions.field.decided_on',
  source: 'decisions.field.source',
  extra: 'decisions.field.extra',
}

/**
 * WHAT THE BAND CALLS ONE FIELD: the record page's own word for it, wherever the decision declares the field as a
 * section (wave 13q's round 34). The fold, the missing-detail panel and the box that writes the field read that word
 * through `titleHere`, so a field has one name on the page and the band cannot drift from it. Before round 34 the band
 * kept words of its own and five fields had two names: Who decided / Decided by, Other options / Alternatives
 * rejected, Later words / Words since, Source of authority / Authority reference, and 依据 / 授权依据 (the
 * review of round 33). The three fields the record page draws in no section of their own keep the band's words.
 */
export function decisionFieldName(key: string): string {
  if (titleOfSection('decision', key) !== null) return titleHere('decision', key)
  const word = NOT_A_SECTION[key]
  return word === undefined ? content(key) : t(word)
}

export function DecisionHalves({ data, summary }: { data: Record<string, unknown>; summary?: string | null }) {
  const halves = [
    { half: 'core' as const, heading: P76_WORDS.decision, who: P76_WORDS.whoMayChangeTheDecision },
    { half: 'notes' as const, heading: P76_WORDS.notes, who: P76_WORDS.whoMayChangeTheNotes },
  ]
  // AN EMPTY LIST IS NOT FILLED IN: `replaces: []` names nothing, and its name was drawn as filled over an empty box
  // (the review of round 34, point 8h).
  const filledIn = (key: string) => {
    const value = data[key]
    return value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0)
  }
  // THE SUMMARY IS LISTED WITH THE NOTES (wave 13k round 39). It is not a field of `data`, so the field list leaves it
  // out, and the missing-details box named a field this box did not list (the review of wave 13q's round 35
  // pictures). Any agent may change it (theDecisionItselfWouldChange in src/server/lib/records.ts does not read it), so
  // it is a note. A caller that passes no summary is not drawing the record's page, and this box then lists no summary.
  const summaryHere = summary === undefined ? null : { filled: summary !== null && summary.trim() !== '' }
  const anyGrey =
    summaryHere?.filled === false ||
    halves.some(({ half }) => decisionFieldsIn(half).some((field: FieldSpec) => !filledIn(field.key)))
  return (
    <Panel titleIs="label" declares={{ surface: 'decision.halves' }} title={P76_WORDS.title} rank={0}>
      <style href="mole-office-governance" precedence="default">
        {GOVERNANCE_CSS}
      </style>
      <div className="px-gov-halves">
        {halves.map(({ half, heading, who }) => (
          <div key={half} className={`px-gov-half px-gov-half-${half}`}>
            <p className="px-gov-half-name">{heading}</p>
            <p className="px-gov-half-who">{who}</p>
            <ul className="px-gov-half-fields">
              {half === 'notes' && summaryHere !== null ? (
                <li className={summaryHere.filled ? 'px-gov-half-field' : 'px-gov-half-field px-gov-half-missing'}>
                  {t('decisions.field.summary')}
                </li>
              ) : null}
              {decisionFieldsIn(half).map((field: FieldSpec) => {
                // WHETHER THE RECORD HOLDS THIS FIELD, by `filledIn`, the test the grey-name line uses too. Never
                // the value itself: the value is drawn where it always was, and printing it here would be a second
                // copy that can drift.
                return (
                  <li
                    key={field.key}
                    className={filledIn(field.key) ? 'px-gov-half-field' : 'px-gov-half-field px-gov-half-missing'}
                  >
                    {decisionFieldName(field.key)}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
      {/* WHY SOME NAMES ARE GREY, said where they are (wave 13r's review of round 32): a grey name is a field this
          decision has not filled in. Drawn only when a name is grey. */}
      {anyGrey ? <p className="px-gov-halves-key">{t('decisions.halvesGreyKey')}</p> : null}
    </Panel>
  )
}
