// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { stillOnThisPage } from '../../lib/pagechoice.ts'
import { t } from '@shared/i18n.ts'
/**
 * THE PLANS: THE DOCUMENTS A PERSON WRITES BEFORE ANYTHING HAS A DATE OR AN HOUR ON IT.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING ON THIS PAGE ASKS FOR HOURS, AND THAT ABSENCE IS THE TEACHING
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office has two planning surfaces and they are told apart by what is missing from each. This page
 * has no hours box anywhere. The schedule page has no writing box anywhere. A stranger who presses
 * both rail rows learns the difference from the two screens, with no sentence explaining it — so
 * there is no sentence explaining it here, and none may be added.
 *
 * A plan is writing. Nothing in it is project truth, nothing in it is parsed for meaning, and
 * nothing in it becomes a record because Mole Office read it. A line becomes a record only when a
 * person presses "File as work" on that line, one line at a time, on the plan's own page.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A STRANGER SEES FIRST
 * ---------------------------------------------------------------------------------------
 *
 * An installation with nothing written in it shows three things and no fourth: the heading, the one
 * button, and one sentence saying nothing is written yet. No panel, no count, no explanation of
 * what a plan is for. The page is a notes app opening on an empty shelf, and every stranger has
 * used one of those.
 *
 * ---------------------------------------------------------------------------------------
 * READING AND WRITING
 * ---------------------------------------------------------------------------------------
 *
 * Nothing on this page can be typed into until you press "Write a new plan". That press is the one
 * that turns a box on, which is the product's single rule about boxes: if you can see one, you
 * pressed something to get it.
 *
 * ---------------------------------------------------------------------------------------
 * THE PRESS AND THE BOX IT REVEALS ARE IN THE SAME PLACE
 * ---------------------------------------------------------------------------------------
 *
 * The owner reported that creating a new plan still looked strange: pressing Write a new plan made
 * the box for creating it appear at the top right, away from the press that had just been made.
 *
 * The report was right and the cause was one CSS declaration. The button and the naming box were both the
 * second child of a header set to `justify-content: space-between`, so at 1440 they landed against
 * the right edge, about 1150px from the heading and above the whole grid they were about to add to.
 * That header is gone. The press now sits under the heading, at the left edge of the grid, and the
 * naming box appears in the button's own place, drawn one card wide so it reads as the plan it is
 * about to add.
 *
 * THE NAME IS STILL ASKED FOR BEFORE THE WRITING STARTS, and that was a decision, not an oversight.
 * The bar this product is held to is a Markdown file in a text editor, and a text editor asks for a
 * file name too. A plan with no name is a card on this shelf that cannot be told from any other,
 * and Mole Office would have to invent one to store it. One line, in the place you pressed, then Enter.
 */

import { useState } from 'react'
import { faultOf, api, errorMessage, type PlansReply } from '../../api.ts'
import { navigate, planPath, RouteLink } from '../../components/router.tsx'
import {
  Absence,
  Btn,
  ErrorNote,
  Field,
  Loading,
  Stamp,
  StoredState,
  TextInput,
  useAsync,
} from '../../components/ui.tsx'
import { progressOf } from '@shared/work.ts'
// WHAT A CARD IS, said on the card. See the header of src/shared/targets.ts.
import { targetAttributes } from '@shared/targets.ts'
import type { PlanSummary } from '../../../server/lib/plans.ts'
import { lineWithMaths } from '../../components/plans/PlanMaths.tsx'

/**
 * How many cards are drawn before the page says it is holding some back.
 *
 * THE LIMIT IS STATED ON SCREEN when it bites — "Showing 24 of 61" — rather than the list quietly
 * ending. Nothing in this product cuts a list without saying it cut one.
 */
const SHOWN = 24

export function PlansPage() {
  const [open, reloadOpen] = useAsync(() => api.plans('open'), [])
  const [showClosed, setShowClosed] = useState(false)
  // Asked for only when somebody presses for them. `null` is "nobody asked", which is a different
  // fact from "there are none" and is what the press below is reading.
  const [closed] = useAsync(async () => (showClosed ? await api.plans('every') : null), [showClosed])

  return (
    <div className="pl">
      <style href="mole-office-plans" precedence="default">
        {PLANS_CSS}
      </style>

      <h1 className="pl-title" data-title-is="its-label">{t('g8.onePlan.plans')}</h1>

      {/* THE PRESS, WHERE THE THING IT MAKES WILL APPEAR: under the heading, at the left edge of
          the grid below. It is drawn before the plans and never after them, so it is in one place
          whether there are none or sixty. */}
      <StartPlan onStarted={reloadOpen} />

      {open.status === 'loading' ? <Loading label={t('g8.shelf.yourPlans')} rows={3} /> : null}

      {open.status === 'error' ? (
        <ErrorNote message={open.message} fault={open.fault} retry={reloadOpen} />
      ) : null}

      {open.status === 'ready' ? <PlansGrid reply={open.value} /> : null}

      {open.status === 'ready' && open.value.closed > 0 ? (
        <div className="pl-closed">
          {showClosed ? null : (
            <Btn variant="ghost" onClick={() => setShowClosed(true)}>{t('g8.shelf.showClosedPlans', { value1: open.value.closed })}</Btn>
          )}
          {showClosed && closed.status === 'loading' ? <Loading label={t('g8.shelf.theClosedPlans')} rows={1} /> : null}
          {showClosed && closed.status === 'error' ? <ErrorNote message={closed.message} fault={closed.fault} /> : null}
          {showClosed && closed.status === 'ready' && closed.value !== null ? (
            <ClosedPlans plans={closed.value.plans.filter((row) => row.plan.state !== 'open')} />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The open plans, or the sentence a stranger meets.
 *
 * The empty screen is three elements and the third one is in the header above. It says what is
 * true and stops: a page that explains itself at length is a page whose design did not work.
 *
 * Exported so a test can render it against the server's real reply, which is the only way to check
 * that the empty screen is the empty screen.
 */
export function PlansGrid({ reply }: { reply: PlansReply }) {
  if (reply.plans.length === 0) {
    return <p className="pl-nothing"><Absence title={t('g8.shelf.noOpenPlan')} /></p>
  }
  const shown = reply.plans.slice(0, SHOWN)
  return (
    <>
      <div className="pl-grid">
        {shown.map((row) => (
          <PlanCard key={row.plan.id} summary={row} />
        ))}
      </div>
      {reply.plans.length > shown.length ? (
        <p className="pl-limit">{t('g8.shelf.showingOfPlansNewestFirst', { value1: shown.length, value2: reply.plans.length })}</p>
      ) : null}
    </>
  )
}

/** The plans that have ended. They leave the list above and are reachable from here. */
export function ClosedPlans({ plans }: { plans: PlanSummary[] }) {
  if (plans.length === 0) {
    return <p className="pl-nothing"><Absence title={t('g8.shelf.noEndedPlan')} /></p>
  }
  return (
    <div className="pl-grid">
      {plans.map((row) => (
        <PlanCard key={row.plan.id} summary={row} />
      ))}
    </div>
  )
}

/**
 * One plan as a card.
 *
 * WHAT IT CARRIES AND WHY EACH ONE IS HERE. The name, because that is what you came for. Its first
 * two lines, because a name alone does not remind you what is in it. When it was last written in,
 * because a plan you have not touched for a month is a different object from one you wrote in this
 * morning. How much of what you filed as work has hours on a week, because that is the one number
 * that says what is left to do with it. And a mark when somebody has written in it since you read it.
 *
 * ---------------------------------------------------------------------------------------
 * THE COUNT USED TO INCLUDE A HEADING AND A BLANK LINE, AND THAT IS WHY IT CHANGED
 * ---------------------------------------------------------------------------------------
 *
 * It read "3 lines with no time on any week" on a plan where three of five rows had just been
 * scheduled. `withNoTimeOnAnyPeriod` counts EVERY line no allocation names, and a heading, a blank
 * line and a paragraph of prose are all such lines — none of them can ever hold hours, so none of
 * them can ever leave the count. As printed it read as work still to schedule and was not.
 *
 * The card now counts only lines somebody filed as work, which is a set a heading cannot be in.
 * Both numbers come out of the summary the server already sends and neither is a second arithmetic:
 * `lines - withNoTimeOnAnyPeriod` is exactly the lines whose record an allocation names, because
 * that count is the complement of it over the same lines. See `scheduledLines`.
 *
 * A PLAN WITH NOTHING FILED AS WORK DRAWS NOTHING HERE. That is the ordinary state of writing and
 * nobody acts on it, which is docs/UX-CONTRACT.md's rule about weight. The number of lines is not
 * a substitute: a card saying "6 lines" would be the length of the document dressed as progress.
 *
 * WHO LAST WROTE IN IT IS NOT DRAWN, because the list does not carry it. The plan stores who
 * STARTED it and each line stores who last wrote that line; "who last wrote in this plan" is
 * neither of those. Printing the starter's name under the word "last" would be a guess, and the
 * plan's own page answers the question properly.
 */
/**
 * How many lines of a plan have hours on some week, out of the lines somebody filed as work.
 *
 * ONE READING OF THE SUMMARY, exported so a test can state the summary and check the sentence
 * against it. `withNoTimeOnAnyPeriod` counts every line no allocation names — filed or not, blank or
 * not — so subtracting it from the line count leaves exactly the lines that ARE named by one, and
 * every one of those was filed as work. Nothing is added up here that the server did not already
 * count.
 */
export function scheduledLines(summary: Pick<PlanSummary, 'lines' | 'withNoTimeOnAnyPeriod'>): number {
  return summary.lines - summary.withNoTimeOnAnyPeriod
}

function PlanCard({ summary }: { summary: PlanSummary }) {
  const { plan, filedAsWork, firstLines } = summary
  const scheduled = scheduledLines(summary)
  // "Written in since you read it" and nothing about who: the list carries the moment the plan was
  // last written in and the moment you read it, and those two are enough to say that much
  // honestly. The plan's own page asks the server who it was.
  const writtenSinceRead = plan.readAt !== null && plan.updatedAt >= plan.readAt

  return (
    // THE CARD IS THE PLAN. The plans list carried nothing addressable at all, so a person could
    // not say a word to an agent about a plan without opening it first.
    <article className="pl-card" {...targetAttributes({ kind: 'plan', planId: plan.id })}>
      <RouteLink to={planPath(plan.id)} className="pl-card-name">
        {plan.title}
      </RouteLink>

      {plan.state === 'open' ? null : (
        <span className="pl-card-state">
          <StoredState state={plan.state} progress={progressOf(plan.state)} />
        </span>
      )}

      {firstLines.length === 0 ? (
        <p className="pl-card-empty"><Absence /></p>
      ) : (
        <div className="pl-card-opening">
          {firstLines.map((text, at) => (
            // The words as typed, with only their maths drawn, as everywhere a plan's own words are
            // read; see PlanMaths.tsx. Nothing else in them is read for meaning. A blank first line is
            // drawn as the blank line it is rather than being skipped, because the spacing
            // somebody typed is part of what they wrote.
            <p key={at} className="pl-card-line">
              {text === '' ? ' ' : lineWithMaths(text)}
            </p>
          ))}
        </div>
      )}

      <div className="pl-card-foot">
        <span className="pl-card-when">
          {t('g8.shelf.written')}<Stamp at={plan.updatedAt} />
        </span>
        {filedAsWork === 0 ? null : (
          <span className="pl-card-count">{t('g8.shelf.ofTrackedTimeOnAWeek', { scheduled, n: filedAsWork })}</span>
        )}
        {writtenSinceRead ? (
          <span className="pl-card-fresh">{t('g8.shelf.writtenInSinceYouReadIt')}</span>
        ) : null}
      </div>
    </article>
  )
}

/**
 * The one button, and the one line it turns on IN THE BUTTON'S OWN PLACE.
 *
 * A plan needs a name before it can exist, so the press reveals one box and nothing else. That is
 * the product's rule about boxes working the way it is meant to: the box is there because you
 * pressed for it, and pressing Cancel takes it away again.
 *
 * THE BOX REPLACES THE BUTTON RATHER THAN APPEARING SOMEWHERE ELSE. Both are the only child of this
 * one element, so they start at the same point on the screen and the box cannot drift away from the
 * press again. tests/plan-shelf.test.ts measures both in a real browser and fails when they are
 * more than a few pixels apart, which is the owner's complaint written as a number.
 *
 * IT IS A FORM, so Enter in the name box starts the plan. It was a div, and Enter did nothing at
 * all — measured, and the reason a person types a name and then has to find a button with the
 * mouse. The new plan lands on its own address with the cursor in its first empty line, because
 * somebody who just pressed "Write a new plan" wants to write.
 */
function StartPlan({ onStarted }: { onStarted: () => void }) {
  const [naming, setNaming] = useState(false)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)

  if (!naming) {
    return (
      <div className="pl-start">
        <Btn variant="primary" onClick={() => setNaming(true)}>{t('g8.shelf.writeANewPlan')}</Btn>
      </div>
    )
  }

  const start = async () => {
    const stillHere = stillOnThisPage()
    setSaving(true)
    setFailed(null)
    try {
      const written = await api.newPlan(title)
      onStarted()
      // NOT THE /edit ADDRESS. A plan is always writable, so there is one address and it is this
      // one. The old one still parses and lands on the same page for the links already written.
      if (stillHere()) navigate(planPath(written.plan.id))
      setNaming(false)
      setTitle('')
    } catch (err) {
      // The server's own sentence, not a friendlier one. An empty name is refused there and the
      // refusal says what a name is for.
      setFailed({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pl-start">
      <form
        className="pl-new"
        onSubmit={(event) => {
          event.preventDefault()
          void start()
        }}
      >
        <Field label={t('g8.shelf.whatIsThisPlanAbout')}>
          <TextInput value={title} onChange={setTitle} placeholder={t('g8.shelf.oneLine')} autoFocus />
        </Field>
        <div className="pl-new-acts">
          <Btn variant="primary" type="submit" pending={saving}>{t('g8.shelf.startWriting')}</Btn>
          <Btn
            variant="ghost"
            type="button"
            onClick={() => {
              setNaming(false)
              setFailed(null)
            }}
          >{t('g8.shelf.cancel')}</Btn>
        </div>
        {failed === null ? null : <ErrorNote message={failed.message} fault={failed.fault} label={t('g8.onePlan.notStored')} />}
      </form>
    </div>
  )
}

/**
 * The page's own geometry.
 *
 * Three columns at 1440 and one at 390, from one auto-fill rule rather than two media queries, so
 * the middle widths are covered by the same declaration. No colour is written out: every value is
 * a token, so a preset swap re-skins the page.
 */
const PLANS_CSS = `
.pl { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }

.pl-title {
  margin: 0;
  font-size: var(--fs-6);
  font-weight: 600;
  line-height: var(--lh-tight);
  color: var(--text);
  min-width: 0;
}

/* The one sentence a stranger meets. Set at reading size, with nothing drawn around it. */
.pl-nothing {
  margin: 0;
  font-size: var(--fs-3);
  line-height: var(--lh-read);
  color: var(--text-2);
}

.pl-limit {
  margin: 0;
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text-3);
}

/* Three across at 1440 and one at 390, from one rule: 27rem is the widest card that still fits
   three of them inside the shell's own maximum width. */
.pl-grid {
  display: grid;
  gap: var(--gut);
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 27rem), 1fr));
  min-width: 0;
}

.pl-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: var(--pad-lg);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
}
.pl-card-name {
  font-size: var(--fs-4);
  font-weight: 600;
  line-height: var(--lh-tight);
  color: var(--text);
  text-decoration: none;
  overflow-wrap: anywhere;
}
.pl-card-name:hover { text-decoration: underline; }
.pl-card-state { display: flex; }

.pl-card-opening { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
/* The first two lines as written. Two lines each at most, then the text ends in an ellipsis --
   the card is a reminder of what is inside, and the plan itself is one press away. */
.pl-card-line {
  margin: 0;
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text-2);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pl-card-empty { margin: 0; font-size: var(--fs-2); color: var(--text-3); }

.pl-card-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px var(--pad);
  margin-top: auto;
  padding-top: 6px;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-3);
  min-width: 0;
}
/* The one number on the card. Ordinary ink: it is a count, not an alarm. */
.pl-card-count { color: var(--text-2); }
.pl-card-fresh {
  color: var(--text);
  font-weight: 600;
}

/* The press keeps its own width. Stretched across the page it read as a band rather than a
   button, which is the loudest thing on a quiet page pointing at the least urgent thing on it. */
.pl-closed { display: flex; flex-direction: column; align-items: flex-start; gap: var(--gut); min-width: 0; }
/* The closed plans themselves still take the whole width: they are a grid of cards like the one
   above, and only the press that reveals them is sized to its words. */
.pl-closed .pl-grid { align-self: stretch; }

/* THE PRESS AND THE BOX IT REVEALS SHARE ONE PLACE. This element holds whichever of the two is on
   screen, so both start at the left edge of the grid below and the box appears where the press was.
   The header this used to live in was set to space-between and put both against the right edge of a
   1440px page, which is the strangeness the owner reported. */
.pl-start { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }

/* One card wide, and drawn like a card, because that is what it is about to add to the grid. */
.pl-new {
  display: flex;
  flex-direction: column;
  gap: var(--pad);
  width: min(100%, 27rem);
  box-sizing: border-box;
  padding: var(--pad-lg);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--panel);
  min-width: 0;
}
.pl-new-acts { display: flex; flex-wrap: wrap; gap: var(--pad); }
`
