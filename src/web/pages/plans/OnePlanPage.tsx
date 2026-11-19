// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { stillOnThisPage } from '../../lib/pagechoice.ts'
import { content, endOfSentence, listJoined, t } from '@shared/i18n.ts'
/**
 * ONE PLAN.
 *
 * ---------------------------------------------------------------------------------------
 * THE WRITING IS WHAT OPENS
 * ---------------------------------------------------------------------------------------
 *
 * A plan is a document somebody wrote, so the first thing on this page is the box holding it. THE
 * PAGE FETCHES ONCE AND HANDS THE SAME LINES TO WHICHEVER VIEW IS ON SCREEN, so they can never
 * disagree about what is written or about which lines have been filed as work.
 *
 * IT OPENS WITH THE TABLE BESIDE THE WRITING, and `OPENS_ON` below says why: a box you type in
 * holds no line a person can point at, so a plan that opened on the writing alone was a plan whose
 * lines could not be talked about until somebody found the Table press.
 *
 * ---------------------------------------------------------------------------------------
 * ONE CONTROL SAYS WHAT IS ON SCREEN, AND THE SECOND COLUMN IS THE TABLE
 * ---------------------------------------------------------------------------------------
 *
 * There were two controls. This page had Writing / Table / Review, and the writing surface had a
 * second one choosing between the work in the plan, the document drawn as it reads, and nothing.
 * Two controls for one question — what am I looking at — and one of them offered a rendering of the
 * plan under a name the other also used.
 *
 * There is one now: **Writing · Writing and table · Table · Review**. The first three are the same
 * plan in one, two or one column; the fourth is the advice about it. The reason: when a person
 * wants the Table, the second pane is worth much more holding the Table than holding a second,
 * permanent rendering of the Markdown, and the writing surface must be able to go back to full width
 * when no second view is needed.
 *
 * THE CHOICE IS REMEMBERED PER PERSON, and writing alone is one press away and stays chosen once it
 * is chosen. What a plan opens on when nobody has chosen is `OPENS_ON` below. Review is never
 * remembered: it is something you go and read, not a way you leave the page set up.
 *
 * ---------------------------------------------------------------------------------------
 * THE DOCUMENT DRAWN AS IT READS IS GONE FROM THIS PAGE, AND THAT IS A DECISION
 * ---------------------------------------------------------------------------------------
 *
 * `PlanDoc` — the plan's Markdown drawn as headings, bullets, tick boxes and tables — was mounted by
 * nothing, and `src/web/components/plans/PlanDoc.tsx` and `tests/plan-doc.test.ts` have been
 * deleted. It failed to earn a place twice: first as the
 * permanent right-hand half, then as one setting of the pane that replaced it. A third try would be
 * the same component one press further away, and a component nothing mounts is a page nobody can
 * find defects in.
 *
 * TWO THINGS WENT WITH IT, SAID PLAINLY RATHER THAN GLOSSED.
 *
 * A PLAN'S INLINE MATHEMATICS WAS DRAWN NOWHERE FOR A TIME, and it was the loss that mattered. The owner
 * typed `$H_2 O$` into the first plan they ever wrote here, so this is something they do. IT IS DRAWN
 * AGAIN: in the table's words, cells and note, and in every other place below that reads a plan's own
 * words back. `src/web/components/plans/PlanMaths.tsx` is the one place that draws it, through the
 * reader and the drawing a report uses, so a formula cannot read one way here and another in a report.
 *
 * THE OFFER TO MEND A PIPE TABLE MISSING ITS ROW OF DASHES WENT WITH IT, AND IS BACK ON THIS PAGE.
 * `MissingDashRows` below names each such table by its first line and offers one press, which
 * writes the row `dashRowFor` in `src/shared/plandoc.ts` gives into the document through the same
 * path a keystroke takes. The planning table still counts the lines it could not read.
 *
 * What is not lost is the pipe table itself. The Table view turns the writer's own table headings
 * into real columns beside Mole Office's, which is more than a rendering of it ever was.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRITTEN WHILE YOU WERE AWAY
 * ---------------------------------------------------------------------------------------
 *
 * Agents write into this corpus at any hour, so "what changed since I read this" is a daily
 * question. The band above the document answers it and is careful about what it cannot say: a line
 * stores when it was last written and by whom, and nothing stores when it first appeared, so
 * Mole Office cannot tell an added line from a changed one and does not guess.
 *
 * ---------------------------------------------------------------------------------------
 * A PLAN IS ALWAYS WRITABLE, AND IT IS THE ONLY PAGE IN MOLE OFFICE THAT IS
 * ---------------------------------------------------------------------------------------
 *
 * There is no Edit button and no edit mode here. The box is on the page from the moment it opens.
 * `#/plans/<id>/edit` stays as an address so old links work, and it lands on this same page. A
 * document you have to press something to type in is not where anybody thinks, and beating a
 * Markdown file in an editor is the bar this page is held to.
 *
 * ---------------------------------------------------------------------------------------
 * THERE IS A SAVE PRESS AND A DONE PRESS, AND THEY ARE NOT AN EDIT MODE
 * ---------------------------------------------------------------------------------------
 *
 * This file used to say there were neither, and the owner reversed that themselves. They still want
 * explicit controls such as Save and Back or Done. Autosave stays, and a deliberate Save press gives
 * them confidence that they can force the write whenever they want to. An interface should not take
 * away a useful control only because the automatic way usually works.
 *
 * THE DIFFERENCE IS WHAT THE PRESS DOES TO THE PAGE. It is subtle, so it is written out here rather
 * than left to be worked out again:
 *
 *   An EDIT MODE means the page is read-only until you press something. The press is what makes the
 *   page writable. Take it away and nobody can type at all.
 *
 *   THESE TWO PRESSES SIT BESIDE A SURFACE THAT IS ALREADY WRITABLE. Save forces the write that
 *   autosave would have made a moment later. Done stores and goes back to the plans list. Take
 *   either one away and every character still types and still saves itself.
 *
 * So the half of the rule that did not change is the half the exception is about: nothing has to be
 * pressed before you can write in a plan. A press that RECORDS something is allowed everywhere in
 * Mole Office, on a page being read as much as on this one.
 *
 * Both presses are built in PlanWriting.tsx and drawn by THIS page, above every view, in
 * `PlanSaveBar`. They sit next to the autosave rather than replacing it.
 *
 * THEY ARE ABOUT THE WHOLE PLAN, WHICH IS WHY THEY MOVED HERE. The name field is on this page and
 * on every view of it, so a bar that lived inside the writing view could only ever be about the
 * words — and it said "Stored." an inch from a name nobody had stored. One save state now covers
 * the name and the words, `usePlanWriting` holds it, and this page draws it once above both.
 *
 * THIS IS THE ONE EXCEPTION TO THE PRODUCT'S READING-VERSUS-EDITING RULE, and the rule names it:
 * `design/UX-ROUND-THREE.md` section 2. The line that rule really draws is that where Mole Office is
 * telling you something you are reading, and where you are writing you are writing. A plan holds
 * your words and exists so you can type them. tests/read-before-edit.test.ts carries the exception
 * as a list of one, checked against the router, so a second page cannot quietly join it.
 *
 * Marking the plan as read stays a press, because it records one fact and says what it recorded.
 *
 * ---------------------------------------------------------------------------------------
 * MARKING IT AS READ NEVER RE-FETCHES THE PLAN, AND THAT IS A FIX
 * ---------------------------------------------------------------------------------------
 *
 * It used to. The press called the page's own reload, `useAsync` set the page back to loading, the
 * whole plan came off the screen and the writing state went with it — the characters in the box,
 * whether they were stored, and the list of bindings a save had removed. Worse, the fetch could be
 * answered BEFORE a save that was already on its way committed, so the document came back as it was
 * one keystroke ago and the next keystroke stored that older text over the newer one.
 *
 * So nothing on this page re-fetches while somebody is writing. Marking a plan as read records one
 * fact on the server and clears one band, and the band clears itself when the server says it is
 * done. The only re-fetch left is the retry on a failed first load, which has no writing to lose.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PAGE OWNS, AND WHAT THE TWO VIEWS OWN
 * ---------------------------------------------------------------------------------------
 *
 * This page owns the plan as a whole: its name, whether the plan is stored, what is on screen and
 * in how many columns, what was written while you were away, and how the plan ends — finished,
 * given up, or deleted. What can be done to one LINE belongs to the views themselves, because that
 * is where the line is.
 *
 * THE NAME AND THE WORDS ARE ONE SAVE. `usePlanWriting` holds both and answers one question about
 * both, so the word on screen cannot be true of one and false of the other. Before that they were
 * the same fact worked out in two places: the name saved itself on blur, the document saved itself
 * on a timer, and the only word on screen was the document's.
 */

import { TieredPress } from '../../components/TieredPress.tsx'
import { PlanUndoPress, changePlanWithUndo } from '../../components/plans/PlanUndo.tsx'
import { useLayoutEffect, useRef, useState } from 'react'
import {
  api,
  errorMessage,
  faultOf,
  getActor,
  type Fault,
  type PlanBlocksReply,
  type PlanReviewsReply,
  type PlanSinceReadReply,
} from '../../api.ts'
import { PlanReview } from '../../components/plans/PlanReview.tsx'
import { PlanProgress } from '../../components/plans/PlanProgress.tsx'
import { PlanTable } from '../../components/plans/PlanTable.tsx'
import { lineWithMaths } from '../../components/plans/PlanMaths.tsx'
import { navigate, plansPath, RouteLink } from '../../components/router.tsx'
import { Btn, ErrorNote, Hint, Loading, Stamp, StoredState, useAsync } from '../../components/ui.tsx'
import { readChoice, writeStored, type StoreFault } from '../../lib/store.ts'
import { readParticipantsOnce } from '../../lib/oneread.ts'
import { type ParticipantsNamed } from '../../lib/participant-lookup.ts'
import { blocksOf, bodyOfLines, dashRowFor, linesOfBody, type PlanState } from '@shared/plandoc.ts'
import { useInspect } from '../../lib/mode.ts'
import { progressOf } from '@shared/work.ts'
import { PlanSaveBar, PlanWriting, usePlanWriting, type PlanWritingState } from './PlanWriting.tsx'
import { SideBySide } from '../../components/SideBySide.tsx'

/**
 * HOW THE PLAN IS SHOWN: in one column of writing, in two columns, or as the table alone.
 *
 * All three are remembered per person. The writing surface must be able to return
 * to full width when no second view is wanted, and it still can: `writing` is one press away and it
 * is what a person gets back on every later visit once they have chosen it.
 */
const LAYOUTS = ['writing', 'both', 'table'] as const
type Layout = (typeof LAYOUTS)[number]

/**
 * WHAT A PLAN OPENS ON WHEN NOBODY HAS CHOSEN.
 *
 * ---------------------------------------------------------------------------------------
 * IT WAS `writing`, AND THAT MADE EVERY LINE OF EVERY PLAN UNPOINTABLE
 * ---------------------------------------------------------------------------------------
 *
 * The writing surface is one box a person types in. A box you type in carries no line: there is no
 * element per line, so there is nothing for a line to say it is, and right-clicking one keeps the
 * browser's own menu because that is where paste and spelling live. Counted in Chromium on 18
 * August 2026: a plan opened on Writing carried NOUGHT elements saying what they were, and the only
 * way to comment on a line was to know to press Table first.
 *
 * The table is where a plan's lines are objects. So a plan opens with both on screen: the words on
 * the left, and the same lines as rows on the right. Nothing is hidden and nothing is one press
 * further away than it was — `writing` and `table` are both still one press, and whichever a person
 * chooses is what they get next time.
 */
const OPENS_ON: Layout = 'both'

/**
 * WHICH VIEW THIS PLAN IS SHOWING: what the person last chose, or `OPENS_ON` when they never have.
 *
 * ONE READING, so the page and the test cannot answer differently. It is exported because what a
 * plan opens on is a promise about what can be pointed at, and a test that asserted `OPENS_ON`
 * alone would pass with the page reading some other value.
 */
export function viewAPlanOpensOn(faults: StoreFault[] = []): Layout {
  return readChoice<Layout>(layoutKey(), LAYOUTS, OPENS_ON, faults)
}

/**
 * What is on screen. The three layouts, plus the advice about the plan.
 *
 * `review` is a view rather than a band above the document, because a fork with its options and its
 * change set is a page of reading and would push the writing box off the screen on every plan that
 * had one. What the other three still get is the COUNT, on the button, so advice waiting on a
 * person is visible without being in the way.
 */
type View = Layout | 'review'

/** Where the choice is kept. Per person, because two people share one browser on this machine. */
function layoutKey(): string {
  const actor = getActor()
  return `mole-office.plan.shown.${actor.type}:${actor.id}`
}

export interface OnePlanPageProps {
  id: string
  /**
   * True when the address ends in `/edit`.
   *
   * IT CHANGES NOTHING, and that is deliberate. A plan is always writable, so both addresses are
   * the same page. The parameter stays so every link written before this was built still lands
   * here rather than on a page nobody has.
   */
  edit?: boolean
}

export function OnePlanPage({ id }: OnePlanPageProps) {
  const inspect = useInspect()
  const [state, reload] = useAsync(async () => {
    // ONE MOMENT FOR ALL FOUR ANSWERS. The document and "what was written since you read this" are
    // about the same lines, and two sequential fetches could report a line as new that the first
    // reply already carried. The advice comes with them so that the count on the Review button and
    // the pane behind it are one answer rather than two. The registry comes with them so the answers
    // on this plan can name their writers; a registry that cannot be read costs the names and not
    // the plan, which is why that one read is caught.
    const [read, since, reviews, participants] = await Promise.all([
      api.planBlocks(id),
      api.planSinceRead(id),
      api.planReviews(id),
      readParticipantsOnce().catch(() => undefined),
    ])
    return { read, since, reviews, participants }
  }, [id])

  /**
   * WHAT IS ON SCREEN, AND WHAT WAS ON SCREEN LAST TIME.
   *
   * Read once, before the first paint, so the page does not open on one layout and jump to another.
   * A browser that refuses storage is TOLD TO THE PERSON rather than swallowed: the alternative is a
   * setting that quietly forgets itself on every load with nothing saying why.
   */
  const [boot] = useState(() => {
    const faults: StoreFault[] = []
    const chosen = viewAPlanOpensOn(faults)
    return { chosen, faults }
  })
  const [view, setViewShown] = useState<View>(boot.chosen)
  const [storeFault, setStoreFault] = useState<string | null>(boot.faults[0]?.message ?? null)
  const chooseView = (next: View) => {
    setViewShown(next)
    // REVIEW IS NOT REMEMBERED. It is something you go and read; leaving the page set to it would
    // mean opening a plan tomorrow on the advice about it instead of on the plan.
    if (next === 'review') return
    const wrote = writeStored(layoutKey(), next)
    setStoreFault(
      wrote.ok
        ? null
        : t('g8.onePlan.thisBrowserWillNotLetMoleOfficeRememberThis', { value1: wrote.reason }),
    )
  }

  return (
    <div className="op">
      <style href="mole-office-one-plan" precedence="default">
        {ONE_PLAN_CSS}
      </style>

      <p className="op-where">
        <RouteLink to={plansPath()} className="op-back">{t('g8.onePlan.plans')}</RouteLink>
      </p>

      {state.status === 'loading' ? <Loading label={t('g8.onePlan.thisPlan')} rows={4} /> : null}

      {/* A WAY BACK, ALWAYS. This address is one somebody reaches by following a stale link, and it
          drew the refusal and nothing else — no way out at all, which is the one thing the router's
          own not-found page gets right and this did not. Finding 10, 19 August 2026. */}
      {state.status === 'error' ? (
        <ErrorNote message={state.message} fault={state.fault} retry={reload}>
          <RouteLink to={plansPath()} className="op-back">{t('g8.onePlan.allPlans')}</RouteLink>
        </ErrorNote>
      ) : null}

      {storeFault === null ? null : <p className="op-store-fault">{inspect ? storeFault : t('g8.onePlan.thisBrowserCouldNotRememberHowYouWantThis')}</p>}

      {state.status === 'ready' ? (
        // NO RELOAD IS HANDED DOWN, on purpose. Everything below this line can write to the server
        // without the page fetching itself again, because a fetch takes the writing off the screen.
        // See the note at the top of this file.
        <PlanView
          key={id}
          reply={state.value.read}
          since={state.value.since}
          reviews={state.value.reviews}
          participants={state.value.participants}
          view={view}
          onView={chooseView}
        />
      ) : null}
    </div>
  )
}

/**
 * The plan itself, once it has arrived.
 *
 * Exported so a test can render it against the server's real reply for a real plan — the document,
 * the table and the band above them, all from the one fetch this page makes.
 */
export function PlanView({
  reply,
  since,
  reviews: fetched,
  participants,
  view,
  onView,
}: {
  reply: PlanBlocksReply
  since: PlanSinceReadReply
  reviews: PlanReviewsReply
  /** The registry the answer writers' names are read from, when the page could read it. */
  participants?: ParticipantsNamed
  view: View
  onView: (view: View) => void
}) {
  const { plan, lines } = reply
  // THE VERSION GOES WITH THE WORDS. `reply.version` names the copy of the plan the box is being
  // seeded from, and every save carries it back as `ifVersion` so a save built on this copy is
  // refused rather than written over somebody else's newer writing. Handing over the lines without
  // it would leave the page saving a document it could not name.
  const writing = usePlanWriting(plan.id, lines, plan.title, reply.version)
  /**
   * The advice about this plan, as the server last said.
   *
   * ONE COPY, HELD HERE, so the count on the Review button and the pane behind it cannot disagree.
   * Settling a fork or applying a change set re-fetches THIS AND NOTHING ELSE — the page's own
   * reload would take the document off the screen and the writing state with it, which is the fix
   * written out at the top of this file.
   */
  const [reviews, setReviews] = useState(fetched)
  const [reviewsFailed, setReviewsFailed] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const refetchReviews = () => {
    setReviewsFailed(null)
    api.planReviews(plan.id).then(setReviews, (err: unknown) => {
      // The advice on screen is now the advice from BEFORE the press, and saying so beats leaving a
      // settled fork drawn as open with nothing explaining why.
      setReviewsFailed({ message: errorMessage(err), fault: faultOf(err) })
    })
  }
  /**
   * Whether the plan is still being written, as the server last said.
   *
   * It starts as what the fetch brought and moves only when a write comes back saying it moved, so
   * it is an echo of the server's answer and never a second opinion about it. Held here rather than
   * re-fetched because a re-fetch would take the writing off the screen.
   */
  const [state, setState] = useState<PlanState>(plan.state)

  return (
    <>
      <header className="op-head">
        <div className="op-name">
          <PlanName state={writing} />
          {state === 'open' ? null : <StoredState state={state} progress={progressOf(state)} />}
        </div>
      </header>

      {/* WHETHER THIS PLAN IS STORED, ABOVE EVERYTHING THE PERSON CAN WRITE IN.
          It covers the name and the words together and is drawn on every view, because the name
          field above it is on every view. It used to live inside the writing view and be about the
          words only, which is how a rename could be lost under the word "Stored." */}
      <PlanSaveBar state={writing} />

      <WrittenSince plan={plan.id} since={since} />

      {/* ONE CONTROL, AND WHICH SETTING IS ON IS READ FROM THE ACCENT AND FROM POSITION.
          Three of the four are the same plan in one or two columns; the fourth is the advice about
          it. There used to be a second control inside the writing surface choosing what sat beside
          the box, which meant two controls answering one question. */}
      <div className="op-views" role="group" aria-label={t('g8.onePlan.whatIsOnScreen')}>
        <button
          type="button"
          className="op-view"
          aria-pressed={view === 'writing'}
          onClick={() => onView('writing')}
        >{t('g8.onePlan.writing')}</button>
        <button type="button" className="op-view" aria-pressed={view === 'both'} onClick={() => onView('both')}>{t('g8.onePlan.writingAndTable')}</button>
        <button type="button" className="op-view" aria-pressed={view === 'table'} onClick={() => onView('table')}>{t('g8.onePlan.table')}</button>
        {/* THE NUMBER IS HOW MUCH ADVICE NOBODY HAS SETTLED, not how much advice there is.
            It is not "how much still wants a press", and Mole Office cannot answer that: nothing stamps
            a proposal when its change set is applied, so a settled one may or may not still be
            waiting and there is no honest way to tell. It counts the one fact that is stored.
            Nothing is drawn when the count is zero, because a zero would be the product mentioning
            something that has not happened. */}
        <button type="button" className="op-view" aria-pressed={view === 'review'} onClick={() => onView('review')}>
          {t('g8.onePlan.review')}{reviews.waiting === 0 ? null : <span className="op-waiting">{reviews.waiting}</span>}
        </button>
      </div>

      {view === 'review' ? (
        <>
          {reviewsFailed === null ? null : (
            <ErrorNote
              message={reviewsFailed.message} fault={reviewsFailed.fault}
              label={t('g8.onePlan.thisIsTheAdviceAsItWasBeforeYour')}
              retry={refetchReviews}
            />
          )}
          <PlanReview plan={plan.id} title={plan.title} reviews={reviews} onChanged={refetchReviews} />
        </>
      ) : (
        // ONE GRID, ONE OR TWO COLUMNS, BY THE SHARED RULE. The writing is the first column and the
        // table the second; the setting that hides one leaves its column empty, and an empty column
        // is no column, so `writing` and `table` each fill the page. The writing surface does not
        // know which — it fills whatever column it is given.
        // THE OFFER TO ADD A MISSING ROW OF DASHES STANDS ABOVE THE GRID, across the whole page. It is
        // outside SideBySide because a child of that rule goes in a column or under both, and an offer
        // about the writing belongs before the plan it would change.
        <>
          <MissingDashRows state={writing} />
          <SideBySide className="op-plan" data-shown={view}>
            <div data-column="start">{view === 'table' ? null : <PlanWriting state={writing} />}</div>
            <div data-column="end" className="op-table">{view === 'writing' ? null : (
              <>
                {writing.behind ? (
                  // INVARIANT 1: THE TABLE SAYS WHICH MOMENT IT IS SHOWING. The table is built from
                  // the rows the server has confirmed, so while a save is still on its way it is a
                  // few characters behind the document and says so rather than looking current.
                  <p className="op-behind">{t('g8.onePlan.thisIsThePlanAsItWasLastStored')}</p>
                ) : null}
                {/* THE TABLE HANDS BACK WHAT IT WROTE. Without this the page kept the words it had,
                    and the next keystroke saved the old document over the table's edit -- measured in
                    a browser, with nothing said. putSaved is what makes the two views one store, and
                    behind is how the table knows not to write over a save already on its way. */}
                <PlanTable plan={plan.id} lines={writing.saved} onWrote={writing.putSaved} behind={writing.behind} versionToWriteOn={writing.versionToWriteOn} />
                {/* PLANNED AGAINST DONE, UNDER THE TABLE IT SUMMARISES. It reads the same lines the
                    table does, so the two cannot report different work. It is here and not on the
                    writing view because it is a second reading of the plan and not a second thing to
                    write in. */}
                <PlanProgress
                  lines={writing.saved}
                  planCreatedAt={plan.createdAt}
                  answers={reply.answers}
                  participants={participants}
                />
              </>
            )}</div>
          </SideBySide>
        </>
      )}

      <HowItEnds
        plan={plan.id}
        title={plan.title}
        state={state}
        onState={setState}
        storedLines={writing.saved.length}
      />
    </>
  )
}

/**
 * THE OFFER TO ADD A TABLE'S MISSING ROW OF DASHES, one per table that lacks it.
 *
 * A pipe table with no row of dashes under its first line is printed as typed, because nothing says
 * which line is its heading (problem ycjTSBsmrRr7). This names each such table by its first line and
 * offers one press. The press puts the row that `dashRowFor` in src/shared/plandoc.ts gives under
 * that line, through `write`, which is the same path a keystroke in the box takes, so the save line
 * above says whether it was stored. Nothing is added without the press.
 *
 * IT READS THE BOX, NOT THE STORED LINES, so the offer is about what the person sees and the line it
 * adds goes where they expect even while a save is still on its way. Nothing is drawn when every
 * table has its row.
 */
function MissingDashRows({ state }: { state: PlanWritingState }) {
  const lines = linesOfBody(state.body)
  const offers = blocksOf(lines.map((text, at) => ({ id: String(at), text })))
    .map(dashRowFor)
    .filter((offer) => offer !== null)
  if (offers.length === 0) return null
  const add = (under: number, row: string) => {
    state.write(bodyOfLines([...lines.slice(0, under + 1), row, ...lines.slice(under + 1)]))
  }
  return (
    <div className="op-dashrows">
      {offers.map((offer) => (
        <p key={offer.under.id} className="op-dashrow">
          <span>{t('planDoc.dashRow.says')}</span> <code className="op-dashrow-line">{content(offer.under.text)}</code>{' '}
          <Btn size="sm" onClick={() => add(Number(offer.under.id), offer.text)}>
            {t('planDoc.dashRow.add')}
          </Btn>
        </p>
      ))}
    </div>
  )
}

/**
 * HOW A PLAN ENDS: it is finished, it was given up, or it is deleted.
 *
 * Until this was built nothing in the browser could reach either ended state, so the shelf's
 * "Show closed plans" press was offering a state the product could not produce, and the owner
 * deleted their own scratch plan through the API instead.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS FOLDED, AND THAT IS THE ANSWER TO A HEADING WITH THREE DESTRUCTIVE PRESSES UNDER IT
 * ---------------------------------------------------------------------------------------
 *
 * This was a heading and three presses standing at the foot of every plan, under the writing:
 * "Mark it finished", "Mark it given up", "Delete this plan". None of them is what anybody came to
 * this page for, and Delete is the one press on it that cannot be undone. The owner named "repeated
 * explanations around ending a plan" in this round; the explanations went behind a mark and the
 * block itself stayed, which was half the fix.
 *
 * SO ENDING A PLAN IS ONE QUIET PRESS AND THE THREE ARE BEHIND IT. Nothing is removed and nothing
 * moves: pressing it opens exactly what used to stand there.
 *
 * A PLAN THAT HAS ALREADY ENDED OPENS THE BLOCK ITSELF, because then it is not a list of things you
 * might do to the plan — it is a fact about the plan and the one press that undoes it. The plan's
 * state is beside its name either way, so the fold hides no fact.
 *
 * FINISHED AND GIVEN UP ARE TWO DIFFERENT ANSWERS and there is no single word for both. `done`
 * means the writing did what it was for; `dropped` means it did not and nobody will finish it. A
 * reader of an old plan wants to know which. Neither is destructive and both can be undone from
 * this same block, so neither asks first.
 *
 * DELETING IS DESTRUCTIVE AND ASKS FIRST, and what it asks says the reassuring half FIRST: the
 * records that lines in this plan were filed as are not touched, and neither are the hours given to
 * them. That is the thing a person is afraid of when they read the word delete on a page whose
 * lines have become real work. What actually goes is the plan and its stored lines, and there is
 * no undo — a plan is removed from the database outright, unlike a record, which is marked as
 * deleted and can be restored.
 */
function HowItEnds({ plan, title, state, onState, storedLines }: {
  plan: string; title: string; state: PlanState; onState: (state: PlanState) => void; storedLines: number
}) {
  const [open, setOpen] = useState(state !== 'open')
  const [busy, setBusy] = useState(false)
  // A REFUSED PRESS, and whether the page has since read the stored state and shows it (problem GR4LcaNI-XZk).
  const [failed, setFailed] = useState<{ why: string; fault: Fault | null; readAgain: boolean } | null>(null)
  const end = async (next: PlanState) => {
    const previous = state
    setBusy(true)
    try {
      const undo = await changePlanWithUndo(plan, previous, next)
      onState(next)
      return async () => { await undo(); onState(previous) }
    } finally { setBusy(false) }
  }
  return <section className="op-end">
    <div className="op-end-head">
      <button type="button" className="op-end-open" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span aria-hidden="true" className="op-end-arrow">{open ? '▾' : '▸'}</span>{t('g8.onePlan.endingThisPlan')}</button>
      <Hint label={t('g8.onePlan.whatHappensToAPlanThatHasEnded')}>{t('g8.onePlan.itLeavesTheListOnThePlansPageAnd')}</Hint>
    </div>
    <div hidden={!open}>
      <div className="op-end-acts">
        <PlanUndoPress press={t('g8.onePlan.markItFinished')} done={t('g8.onePlan.markedFinished')} available={state === 'open'} disabled={busy} onPress={() => end('done')} />
        <PlanUndoPress press={t('g8.onePlan.markItGivenUp')} done={t('g8.onePlan.markedGivenUp')} available={state === 'open'} disabled={busy} onPress={() => end('dropped')} />
      </div>
      {state === 'open' ? null : <>
        <p className="op-end-say">{t('g8.onePlan.thisPlanHasEndedYouCanStillWriteIn')}</p>
        <Btn size="sm" pending={busy} onClick={() => {
          setBusy(true); setFailed(null)
          // BUILT ON THE STATE THIS PAGE SHOWS (problem GR4LcaNI-XZk). The write reads the plan, is refused when its state
          // is not the one shown here, and otherwise carries the version it read. After a refusal the page reads the
          // stored state and shows it, which is the way on: the presses then match the plan as it is.
          void changePlanWithUndo(plan, state, 'open').then(() => onState('open'), async (err: unknown) => {
            setFailed({ why: errorMessage(err), fault: faultOf(err), readAgain: false })
            try {
              const now = await api.planBlocks(plan)
              onState(now.plan.state)
              setFailed({ why: errorMessage(err), fault: faultOf(err), readAgain: true })
            } catch {
              // The stored state could not be read. The refusal stays on screen as it is, and says nothing more.
            }
          }).finally(() => setBusy(false))
        }}>{t('g8.onePlan.putItBackInTheList')}</Btn>
      </>}
      <TieredPress tier="confirm" size="sm" press={t('g8.onePlan.deleteThisPlan')} pending={t('g8.onePlan.deleting')} cancel={t('g8.onePlan.keepIt')} confirm={t('g8.onePlan.yesDeleteIt')}
        question={t('g8.onePlan.deleteThisPlanAndItsStoredLines')} quote={title}
        warning={t('g8.onePlan.whatGoesIsAndTheStoredInItThere', { title, n: storedLines })}
        disabled={busy} onPress={async () => { const stillHere = stillOnThisPage(); await api.deletePlan(plan); if (stillHere()) navigate(plansPath()) }} />
    </div>
    {failed === null ? null : (
      <ErrorNote message={failed.why} fault={failed.fault}>
        {failed.readAgain ? <span>{t('planStores.stateShownNow')}</span> : null}
      </ErrorNote>
    )}
  </section>
}

/**
 * THE PLAN'S NAME. It is a labelled field and it looks like one.
 *
 * ---------------------------------------------------------------------------------------
 * IT WAS A TRAP AND THREE PEOPLE FELL IN IT
 * ---------------------------------------------------------------------------------------
 *
 * It used to be an unlabelled text area sitting exactly where a page heading goes, drawn at heading
 * size and weight with no border, no background and nothing beside it saying what it was. Three
 * separate people who had never seen Mole Office typed their whole plan into it. One lost 1,081
 * characters and every newline they typed, because Enter in that box saved the name instead of
 * starting a line — and the status line an inch away said "Stored." throughout, because it was
 * about the document.
 *
 * FOUR THINGS CHANGED AND ALL FOUR ARE LOAD-BEARING:
 *
 *   1. It has a visible label — "Name of this plan" — above it, not only a label for screen
 *      readers. A control nobody can name is a control people guess about.
 *   2. It is drawn as a field: a border, the field background, and reading size rather than
 *      heading size. The plan's name is still the biggest thing on the page, but it no longer
 *      pretends to be static text.
 *   3. The save state is shared with the document, so the bar above says "Not stored yet." from
 *      the first keystroke in here and the browser now asks before the tab closes on it.
 *      `usePlanWriting` holds it; this component holds nothing about saving at all.
 *   4. When what is in it stops looking like a name, it says so and points at the writing box.
 *      That is the last catch for the person who is already typing their plan into it.
 *
 * IT IS STILL A TEXT AREA THAT GROWS, NOT A ONE-LINE BOX. Measured at 390: a one-line box cut
 * "Getting the arm to hand something over" off at "somet", with the rest of the name reachable only
 * by scrolling inside a control nobody can see the edges of. Nothing you typed is ever hidden is the
 * rule this page is built on, and it applies to the name as much as to the lines.
 */
function PlanName({ state }: { state: PlanWritingState }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const name = state.name

  useLayoutEffect(() => {
    const el = ref.current
    if (el === null) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [name])

  return (
    <div className="op-name-box">
      <label className="op-title-label" htmlFor="op-plan-name">{t('g8.onePlan.nameOfThisPlan')}</label>
      <textarea
        ref={ref}
        id="op-plan-name"
        className="op-title"
        rows={1}
        value={name}
        onChange={(event) => state.writeName(event.currentTarget.value)}
        // ENTER DOES NOT START A LINE, because a name is one line. It is not a save either any
        // more: the save is the same 600ms timer the writing is on, so Enter here means "I have
        // finished the name" and the only honest thing to do with it is nothing.
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.preventDefault()
        }}
      />
      <NotAName name={name} />
    </div>
  )
}

/** How long a name has to get before Mole Office says something. A long title is fine; a plan is not. */
const LONG_FOR_A_NAME = 120

/**
 * SAID WHEN WHAT IS IN THE NAME FIELD HAS STOPPED LOOKING LIKE A NAME.
 *
 * It is a note and not a refusal. Mole Office does not know that a 300-character name is wrong, and a
 * product that refused one would be guessing on the person's behalf — so it says what it noticed,
 * says where the writing box is, and stores exactly what was typed either way.
 */
function NotAName({ name }: { name: string }) {
  const lines = name.includes('\n')
  const long = name.length > LONG_FOR_A_NAME
  if (!lines && !long) return null
  return (
    <p className="op-title-note" role="status">{t('g8.onePlan.itIsStoredExactlyAsYouTypedItThe', { value1: lines
        ? t('g8.onePlan.thisNameHasMoreThanOneLineInIt')
        : t('g8.onePlan.thisNameIsCharactersLong', { value1: name.length }) })}</p>
  )
}

/**
 * What was written to this plan since you read it, and the one press that clears it.
 *
 * IT CANNOT SAY WHICH LINES WERE ADDED AND WHICH WERE CHANGED, so it says "written" for both. The
 * brief asked for "6 lines added, 1 changed"; nothing stores when a line first appeared, and the
 * sentence that would need that field is the sentence this refuses to write.
 *
 * Nothing is drawn when nobody has marked the plan as read. That is not "nothing was written" — it
 * is that "since" has no moment to count from, and saying so would put a sentence on every plan
 * nobody has read yet.
 *
 * A SECRETARY'S MARK IS SAID AS THE SECRETARY'S. Where this office's list lets the person's grant press marking a plan
 * as read, a secretary may mark it for them, and the plan stores which secretary did. The person did not read the plan
 * then, so the band names the secretary, says the lines were written "since then" and not "since you read this", and
 * stays while that mark stands, even with no line written since. The person's own press replaces it.
 *
 * THE PRESS CLEARS THIS BAND AND NOTHING ELSE. It used to re-fetch the whole page, which took the
 * document off the screen and the writing state with it — the full account is at the top of this
 * file. The band is the only thing on the page the press changes, so the band is the only thing
 * that changes, and it changes when the server has answered rather than when the button was hit.
 */
function WrittenSince({ plan, since }: { plan: string; since: PlanSinceReadReply }) {
  const inspect = useInspect()
  const [open, setOpen] = useState(false)
  const [marking, setMarking] = useState(false)
  const [failed, setFailed] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  /** True once the server has recorded the read. Set from the reply, never from the press. */
  const [read, setRead] = useState(false)

  const marked = since.markedUnderTheGrant
  if (since.neverRead || read || (since.written.length === 0 && !marked)) return null

  const count = since.written.length
  const counted = count === 0 ? null : t(marked ? 'onePlan.linesWrittenSinceItWasMarked' : 'g8.onePlan.linesWrittenSinceRead', { n: count })
  const mark = async () => {
    setMarking(true)
    setFailed(null)
    try {
      await api.markPlanRead(plan)
      setRead(true)
    } catch (err) {
      setFailed({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setMarking(false)
    }
  }

  return (
    <div className="op-since">
      {/* WHAT MOLE OFFICE CANNOT SAY IS BEHIND THE MARK, AND IT IS STILL SAID. Nothing stores when a
          line first appeared, so added and changed cannot be told apart. That is a caveat on the
          count rather than the news, and the reader does nothing differently either way. */}
      {/* A DIV AND NOT A PARAGRAPH, because the mark is a `details` and a browser's parser closes an
          open `p` when it meets one. React building the DOM by hand hides that; the markup would
          still be wrong. */}
      <div className="op-since-say">
        {marked ? <>{t('onePlan.markedUnderYourGrant', { secretary: marked.secretary })}{endOfSentence(counted ?? undefined)}</> : null}
        {counted === null ? null : (
          <>
            {counted}{!inspect || since.writtenBy.length === 0 ? '' : t('g8.onePlan.by', { value1: listJoined(since.writtenBy) })}{endOfSentence('?')}
            <Hint label={t('g8.onePlan.whyItDoesNotSayAddedOrChanged')}>{t('g8.onePlan.nothingStoresWhenALineFirstAppearedSoMole')}</Hint>
          </>
        )}
      </div>
      <div className="op-since-acts">
        {count === 0 ? null : (
          <button type="button" className="op-fold" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? t('g8.onePlan.hideWhichLines') : t('g8.onePlan.which', { value1: count === 1 ? t('g8.onePlan.line') : t('g8.onePlan.lines') })}
          </button>
        )}
        <Btn variant="secondary" size="sm" onClick={mark} pending={marking}>{t('g8.onePlan.markAsRead')}</Btn>
      </div>
      {open ? (
        <ul className="op-since-list">
          {since.written.map((line) => (
            <li key={line.id}>
              <span className="op-since-text">{line.text === '' ? '—' : lineWithMaths(line.text)}</span>
              <span className="op-since-who">
                {inspect ? `${line.updatedBy} · ` : null}<Stamp at={line.updatedAt} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {failed === null ? null : <ErrorNote message={failed.message} fault={failed.fault} label={t('g8.onePlan.notStored')} />}
    </div>
  )
}

// The stylesheet's comments give their reasons in words. Where the two columns switch is item 2 of a
// decision.
const ONE_PLAN_CSS = `
.op { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }

.op-where { margin: 0; font-size: var(--fs-1); color: var(--text-3); }
.op-back { color: var(--text-2); text-decoration: none; }
.op-back:hover { text-decoration: underline; }

.op-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--gut);
  min-width: 0;
}
.op-name { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--pad); min-width: 0; flex: 1 1 20rem; }
.op-name-box { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1 1 auto; max-width: var(--measure-in-box); }
/* THE NAME IS A FIELD AND IT LOOKS LIKE ONE. It used to be borderless heading-sized text with no
   label, and three people typed their whole plan into it. The label is visible, the edges are
   visible, and the size is a size you read rather than the size of a page heading. */
.op-title-label { font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-2); }
.op-title {
  display: block;
  margin: 0;
  width: 100%;
  box-sizing: border-box;
  padding: 6px var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  font: inherit;
  font-size: var(--fs-3);
  font-weight: 600;
  line-height: var(--lh-tight);
  color: var(--text);
  overflow-wrap: anywhere;
  overflow: hidden;
  resize: none;
  min-width: 0;
}
.op-title:focus { outline: var(--border-w) solid var(--accent); outline-offset: 2px; }
/* When what is in the field has stopped looking like a name. Reading ink, not a fault colour: it is
   a thing Mole Office noticed, and what is typed is stored either way. */
.op-title-note {
  margin: 0;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text);
  max-width: var(--measure-in-box);
}

/* HOW MANY COLUMNS THE PLAN IS IN. One grid, so the writing surface fills whatever it is given and
   does not have to know which setting is on. Where the two columns switch is the shared rule's, in
   components/SideBySide.tsx: at 1180 pixels and below the writing
   goes first and the table under it. This page gives only the widths of its two columns.

   THE TABLE GETS THE LARGER SHARE AND THAT IS A DECISION. The two used to be exactly half each,
   which at a 1400px window gave 557px to a monospace document and 557px to a planning table with
   nine columns. A document does not get better past its reading measure and a table does. Measured
   at the same window: the writing goes from 557px to 477px, which its fixed-width font draws 54
   characters a line in — inside the range an editor is read at — and the table goes from 557px to
   637px. When the writing is the point there is a Writing setting that gives it the whole page.

   IT NEVER FALLS BELOW 20rem, so on a narrow desktop window the box stays a box you can write in
   rather than a ribbon, and where the two stack the question does not arise. */
.op-plan { gap: var(--gut); --sbs-columns: minmax(20rem, 3fr) minmax(0, 4fr); }
.op-table { display: flex; flex-direction: column; gap: 6px; min-width: 0; }

/* A browser that will not remember the setting. Said, never swallowed. */
.op-store-fault { margin: 0; font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-2); }

/* A table missing its row of dashes, and the press that adds it. A quiet line: an offer, not a fault. */
.op-dashrows { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.op-dashrow {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px var(--pad);
  margin: 0;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
  min-width: 0;
}
.op-dashrow-line { color: var(--text); overflow-wrap: anywhere; min-width: 0; }

/* The table is built from the rows the server has confirmed, so it says when it is behind. */
.op-behind {
  margin: 0;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
}

/* What was written while you were away. A band above the document, quiet: it is news, not a fault. */
.op-since {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
  min-width: 0;
  max-width: var(--measure-in-box);
}
.op-since-say { margin: 0; font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text); }
.op-since-acts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); }
.op-fold {
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  font-size: var(--fs-1);
  color: var(--text-2);
  text-decoration: underline;
  cursor: pointer;
}
.op-since-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--fs-1);
}
.op-since-list li { display: flex; flex-wrap: wrap; gap: 4px var(--pad); min-width: 0; }
.op-since-text { color: var(--text); overflow-wrap: anywhere; }
.op-since-who { color: var(--text-3); }

/* How this plan ends. At the foot, quiet, and never the first thing read: it is what you do when
   you have finished with the plan, not what you came here for. */
.op-end {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
  max-width: var(--measure-in-box);
  margin-top: var(--gut);
  padding-top: var(--pad);
  border-top: var(--border-w) solid var(--border);
}
/* The press that opens the block, and the mark that says what ending a plan does. One row, and the
   press is quiet: it is not what anybody came to this page for. */
.op-end-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; }
.op-end-open {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  font-size: var(--fs-2);
  font-weight: 600;
  line-height: var(--lh-tight);
  color: var(--text-2);
  cursor: pointer;
}
.op-end-open:hover { color: var(--text); }
.op-end-arrow { color: var(--text-3); font-weight: 400; }
.op-end-say, .op-end-keep, .op-end-lose {
  margin: 0;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-3);
}
/* The half a person is afraid of, answered first and in reading ink rather than in quiet grey. */
.op-end-keep { color: var(--text); font-size: var(--fs-2); }
.op-end-lose { color: var(--text-2); font-size: var(--fs-2); }
.op-end-acts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); min-width: 0; }
.op-end-ask {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
  padding: var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
}

/* Which view. The chosen one is marked by position and by weight, and the accent says which. */
.op-views { display: flex; flex-wrap: wrap; gap: 0; }
.op-view {
  border: var(--border-w) solid var(--border-strong);
  background: var(--panel);
  color: var(--text-2);
  font: inherit;
  font-size: var(--fs-2);
  padding: 4px var(--pad-lg);
  cursor: pointer;
}
.op-view:first-child { border-radius: var(--radius-sm) 0 0 var(--radius-sm); }
.op-view:last-child { border-radius: 0 var(--radius-sm) var(--radius-sm) 0; border-left: 0; }
.op-view[aria-pressed='true'] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 600;
}
/* WHERE THE FOUR DO NOT FIT ON ONE LINE THEY BECOME FOUR BUTTONS RATHER THAN A BROKEN STRIP.
   Measured at 390: three sat joined on the first line and Review dropped to the second with no
   left edge and one rounded end, which reads as a piece that fell off. Only the width and style of
   the left edge are set here, so the accent still colours the chosen one's edge. */
@media (max-width: 60rem) {
  .op-views { gap: 6px; }
  .op-views .op-view,
  .op-views .op-view:first-child,
  .op-views .op-view:last-child {
    border-radius: var(--radius-sm);
    border-left-width: var(--border-w);
    border-left-style: solid;
  }
}
/* How many pieces of advice are waiting on a person. It takes the colour that means "a person is
   waiting" everywhere else in the product, and nothing else on this page carries it. */
.op-waiting {
  display: inline-block;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--ask-bg);
  color: var(--ask);
  border: var(--border-w) solid var(--ask);
  font-size: var(--fs-1);
  font-weight: 600;
  line-height: 1.4;
}
`
