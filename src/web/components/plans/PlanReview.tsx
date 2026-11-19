// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
/**
 * WHAT AN AGENT SAID ABOUT THIS PLAN, and the two presses a person makes about it.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE RULE THIS SCREEN EXISTS TO KEEP
 * ---------------------------------------------------------------------------------------
 *
 * The owner set the rule: the agent advises and edits alongside the person, and never approves on
 * their behalf.
 *
 * So nothing an agent leaves changes anything by itself. What arrives here is advice — a fork, its
 * options, the reasoning, and sometimes a change set saying exactly what it would do to the project.
 * It becomes real in two presses, both the person's:
 *
 *   1. THE PERSON SETTLES THE FORK. That writes a decision, which is the one act in the whole product an
 *      agent gets a 403 on.
 *   2. THE PERSON PRESSES APPLY. The change set is listed operation by operation, above the button, before
 *      it is pressed. All of it happens in one transaction or none of it does.
 *
 * ---------------------------------------------------------------------------------------
 * IT REUSES THE PANEL THE PRODUCT ALREADY HAS, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------------------
 *
 * `ProposalGovernance` in components/Governance.tsx already draws a fork, its options, the picker
 * that settles it and the change set with its apply press. Home's decision desk and the record page
 * both mount it. Drawing a second one here would be this repository's recurring defect on the one
 * screen where being wrong changes what happens to the project: two readings of "has this been
 * settled", with nothing making them agree.
 *
 * WHAT THIS FILE ADDS is the half that panel cannot know: which advice is about THIS plan, and the
 * press that asks for advice in the first place.
 *
 * ---------------------------------------------------------------------------------------
 * ASKING FOR A REVIEW IS ONE PRESS, AND IT COPIES
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office never calls a language model — the agent is outside the product. The press therefore puts
 * the exact words on the clipboard, and the person pastes them into the agent they are already
 * talking to. The reasoning for copying rather than filing the ask as a record is written where the
 * words themselves are written, in `askForReview` in src/server/lib/planreview.ts.
 *
 * THE WORDS COME FROM THE SERVER AND ARE NOT WRITTEN HERE. They tell an agent to file its advice
 * with the plan's id in `extra.plan`, and the server looks for exactly that key. A copy of the
 * sentence in this file would drift from the code that reads it, and nothing would fail — the
 * advice would simply never appear, and the screen would say "nobody has left one", truthfully and
 * uselessly.
 *
 * THE COPY CAN FAIL and says so. A browser refuses the clipboard without permission or outside a
 * secure page. The text is on screen either way, in a box, ready to select by hand.
 */

import { useState } from 'react'
import { faultOf, api, errorMessage, type PlanReview as PlanReviewRow, type PlanReviewsReply } from '../../api.ts'
import { ProposalGovernance } from '../Governance.tsx'
// WHICH SECTION OF THE FORK EACH PART OF THAT PANEL DRAWS, worked out here and spelled there by
// nobody. See `ProposalGovernanceProps.sections`.
import { sectionsOf } from '../sections.ts'
import { InReachMark, reachBox, useReach } from '../InReach.tsx'
import { recordPath, RouteLink } from '../router.tsx'
import { Absence, Btn, ErrorNote, Panel, Stamp } from '../ui.tsx'
import { useInspect } from '../../lib/mode.ts'

export interface PlanReviewProps {
  /** The plan being reviewed. */
  plan: string
  /** Its name, so the press can say what it is asking about. */
  title: string
  /**
   * The advice, as the page fetched it. HELD BY THE PAGE, NOT HERE.
   *
   * The page counts it on the Review button, so a second copy in this component would be a second
   * answer to "how many are waiting" and the button and the pane could disagree. This draws what it
   * is given and asks the page to fetch again after a press that changed something.
   */
  reviews: PlanReviewsReply
  /** Fetch the advice again. Called after a fork is settled or a change set is applied. */
  onChanged: () => void
}

export function PlanReview({ plan, title, reviews, onChanged }: PlanReviewProps) {
  return (
    <section className="pr">
      <style href="mole-office-plan-review" precedence="default">
        {PLAN_REVIEW_CSS}
      </style>

      <AskForReview plan={plan} title={title} />

      {reviews.reviews.length === 0 ? (
        // 7FEOshq3mBGG gives ordinary emptiness the short mark. The tooltip and accessible
        // reason still distinguish no advice from advice saying the plan is fine.
        <p className="pr-none">
          <Absence
            title={t('g8.review.nobodyHasLeftAdviceAboutThisPlanThatIs')}
          />
        </p>
      ) : (
        <>
          <p className="pr-count">{t('g8.review.aboutThisPlanNoneOfItHasChangedAnything', { value1: reviews.reviews.length === 1 ? t('g8.review.onePieceOfAdvice') : t('g8.review.piecesOfAdvice', { value1: reviews.reviews.length }) })}</p>
          <ol className="pr-list">
            {reviews.reviews.map((review) => (
              <li key={review.proposal.id}>
                <OneReview review={review} onChanged={onChanged} />
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}

/**
 * One piece of advice: what it is called, when it arrived, and the fork itself with the acts on it.
 *
 * The fork, the options, the picker and the change set are all `ProposalGovernance`. What is drawn
 * here around it is the part that belongs to the plan rather than to the fork: the name, the stamp,
 * a way to open the record, and the note about a proposal that also names a draft.
 */
function OneReview({ review, onChanged }: { review: PlanReviewRow; onChanged: () => void }) {
  const inspect = useInspect()
  const { proposal } = review

  return (
    <article className="pr-one">
      <header className="pr-one-head">
        <h3 className="pr-one-name">{proposal.title}</h3>
        <p className="pr-one-when">
          {t('g8.review.left')}<Stamp at={proposal.createdAt} />
          {proposal.summary === null ? null : <span className="pr-one-say"> · {proposal.summary}</span>}
        </p>
      </header>

      {/* A PROPOSAL MAY NAME A DRAFT AS WELL AS THIS PLAN, and that is shown rather than dropped.
          Mole Office has two stores for rough thinking today: this plan, and the older plain-text draft.
          An agent that read both would be advising from something this page cannot show, and a
          reader told only about the plan would not know to go and look. */}
      {review.alsoNamesDraft === null ? null : (
        <p className="pr-one-draft">{t('g8.review.thisAdviceAlsoNamesAPieceOfRoughPlanning')}</p>
      )}

      <ProposalGovernance
        recordId={proposal.id}
        title={proposal.title}
        data={proposal.data}
        resolved={review.resolved}
        settledBy={review.settledBy}
        decisionData={new Map(Object.entries(review.decisions))}
        workspaceId={proposal.workspaceId}
        // WHICH SECTION EACH PART OF THE PANEL DRAWS. `relations: []` is a statement about this
        // surface: it draws no link rows, so this fork has no relation section on it.
        sections={sectionsOf({
          id: proposal.id,
          kind: 'proposal',
          data: proposal.data,
          title: proposal.title,
          summary: proposal.summary,
          relations: [],
        })}
        onSettled={onChanged}
      />

      {/* THE WAY TO THE RECORD, in Developer presentation only. A Normal reader has the whole fork
          on this page already and the id tells them nothing they can act on. */}
      {inspect ? (
        <p className="pr-one-where">
          <RouteLink to={recordPath(proposal.id)}>{t('g8.review.openThisOnItsOwnPage')}</RouteLink>
        </p>
      ) : null}
    </article>
  )
}

/**
 * The one press that hands this plan to an agent.
 *
 * It fetches the plan's facts and copies the `ask` out of that reply. Two things follow from where
 * the words live:
 *
 *   - The press is a request, so it can fail, and a failure says what the server said.
 *   - The text is shown after the copy, so the person can see what they are about to paste and can
 *     select it by hand if the clipboard refused.
 */
function AskForReview({ plan, title }: { plan: string; title: string }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const [words, setWords] = useState<string | null>(null)
  /** Null until a copy has been tried. True when the clipboard took it, false when it refused. */
  const [copied, setCopied] = useState<boolean | null>(null)

  const ask = async () => {
    setBusy(true)
    setFailed(null)
    try {
      const context = await api.planContext(plan)
      setWords(context.ask)
      try {
        await navigator.clipboard.writeText(context.ask)
        setCopied(true)
      } catch {
        // A REFUSED CLIPBOARD IS NOT A FAILED REQUEST. The words are here either way, so this says
        // which of the two happened rather than reporting one as the other.
        setCopied(false)
      }
    } catch (err) {
      setFailed({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel titleIs="label" declares={{ surface: 'plans.review' }} title={t('g8.review.askAnAgentToLookAtThis')} rank={1}>
      <p className="pr-ask-say">{t('g8.review.thisCopiesAShortMessageAskingAnAgentTo', { value1: title })}</p>
      <div className="pr-ask-acts">
        <Btn variant="primary" size="sm" pending={busy} onClick={() => void ask()}>
          {words === null ? t('g8.review.copyTheMessage') : t('g8.review.copyItAgain')}
        </Btn>
      </div>

      {copied === null ? null : copied ? (
        <p className="pr-ask-done">{t('g8.review.theMessageIsOnYourClipboardItIsBelow')}</p>
      ) : (
        <p className="pr-ask-done">{t('g8.review.yourBrowserWouldNotLetMoleOfficeUseThe')}</p>
      )}

      {words === null ? null : (
        <>
          {/* LABELLED AS MACHINE TEXT. It names a web address and an instruction written for a
              program, which is not how anything else in Mole Office talks to a person, so the label says
              who it is for rather than leaving the reader to work it out. */}
          <p className="pr-ask-label">{t('g8.review.theMessageItIsWrittenForAnAgentNot')}</p>
          {/* IT SCROLLS SIDEWAYS RATHER THAN WRAPPING, AND THAT IS NOT SETTLED HERE. Whether machine
              text at `white-space: pre` should wrap is contract open question 16 and belongs to this
              surface's owner. What is settled is that a box may not take words off its edge in
              silence, so the edges are marked and the words are left as they are. */}
          <AskedText words={words} />
        </>
      )}

      {failed === null ? null : <ErrorNote message={failed.message} fault={failed.fault} label={t('g8.review.nothingWasCopied')} />}
    </Panel>
  )
}

/** The message written for an agent, read-only, with the edges it carries on past marked. */
function AskedText({ words }: { words: string }) {
  const reach = useReach(words)
  return (
    <InReachMark reach={reach}>
      {/* The box's own name is written after the spread, so it keeps it whether or not there is
          anything off the edge: a textarea with no name is unusable from a screen reader. */}
      <textarea
        className="pr-ask-text"
        readOnly
        rows={12}
        value={words}
        {...reachBox(reach, t('g8.review.theMessageToAnAgent'))}
        aria-label={t('g8.review.theMessageToAnAgent')}
      />
    </InReachMark>
  )
}

const PLAN_REVIEW_CSS = `
.pr { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }

.pr-none, .pr-count {
  margin: 0;
  max-width: var(--measure-in-box);
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text-2);
}

.pr-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--gut);
  min-width: 0;
}

/* One piece of advice. Enclosed, because two forks running together on one page is how a reader
   settles the wrong one. */
.pr-one {
  display: flex;
  flex-direction: column;
  gap: var(--pad);
  min-width: 0;
  padding-top: var(--pad);
  border-top: var(--border-w) solid var(--border);
}
.pr-list > li:first-child .pr-one { border-top: 0; padding-top: 0; }

.pr-one-head { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pr-one-name {
  margin: 0;
  font-size: var(--fs-3);
  font-weight: 600;
  line-height: var(--lh-tight);
  color: var(--text);
  overflow-wrap: anywhere;
}
.pr-one-when { margin: 0; font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-3); }
.pr-one-say { color: var(--text-2); }

/* The other store for rough thinking, named where it can be met. Quiet: it is a fact about where
   the advice came from, not a fault. */
.pr-one-draft {
  margin: 0;
  max-width: var(--measure-in-box);
  padding: var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
}

.pr-one-where { margin: 0; font-size: var(--fs-1); color: var(--text-3); }

/* Asking for a review. */
.pr-ask-say {
  margin: 0 0 var(--pad);
  max-width: var(--measure-in-box);
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text-2);
}
.pr-ask-acts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); min-width: 0; }
.pr-ask-done {
  margin: var(--pad) 0 0;
  max-width: var(--measure-in-box);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
}
.pr-ask-label {
  margin: var(--pad) 0 4px;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-3);
}
/* Monospaced and scrollable inside itself, because it is a block of machine text and a page that
   scrolls sideways is the one thing this product does not do anywhere. */
.pr-ask-text {
  display: block;
  width: 100%;
  box-sizing: border-box;
  padding: var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  white-space: pre;
  overflow: auto;
  resize: vertical;
  min-width: 0;
}
`
