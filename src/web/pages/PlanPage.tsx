// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { stillOnThisPage } from '../lib/pagechoice.ts'
import { t } from '@shared/i18n.ts'
import { en } from '@shared/words/en.ts'
/**
 * The plan: when this person will spend real time on work that already exists.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE PAGE THAT IS NOT ABOUT A PROJECT
 * ---------------------------------------------------------------------------------------
 *
 * Every other page in Mole Office shows one project, because every fact Mole Office stores belongs to one.
 * This page shows a person's week, and a week holds Mole Office work, greenhouse work and a dentist
 * appointment at once. That is settled owner semantics — a planning period is a person-level
 * overlay across workspace-owned canonical work — so the project switcher does not narrow it and
 * every row says which project owns the work instead.
 *
 * THAT USED TO BE A PARAGRAPH AT THE TOP OF THE PAGE and it is now a chip beside the title, because
 * a sentence explaining an interface is a failed fix: every row already names its project, so the
 * chip says the one thing the rows cannot ("hours from every project") and the rows say the rest.
 * The one place it genuinely bit — the box under a week that found work to add, which DID obey the
 * project selector while this paragraph said the page did not — is fixed where it happened: the work
 * a week is offered is every piece of work in every project, and which project to narrow it to is a
 * control on the panel. See `AddFromWork` in components/Planning.tsx.
 *
 * THE CHIP CLAIMS THE HOURS AND NOT THE WHOLE PAGE, and that is deliberate. The hours are
 * person-level: the allocations are read for the period with no project filter at all. The goal
 * drawing, which is one project's records and links, is on the Goals page and not here.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE ARITHMETIC SAYS, AND WHAT IT REFUSES TO SAY
 * ---------------------------------------------------------------------------------------
 *
 * Three numbers, and the third is the one most products leave out:
 *
 *     planned      the hours committed at THIS horizon, added one horizon at a time
 *     capacity     how many hours the period holds — or nothing, when nobody has said
 *     unstated     how many allocations gave no number at all
 *
 * They used to be three enormous numbers in a row, with the server's own sentence restating all
 * three in prose immediately above them. They are one bar now: the fill is what is planned, the
 * hatching is what allocations with no hours might still take, and an overspill sticks out in red
 * with the word "over" beside it. A bar SHOWS "this total is a floor" instead of saying it.
 *
 * When nobody has set a capacity there is no bar at all — an empty bar is a picture of a week that
 * fits, and absent is not a working week.
 *
 * TWO NUMBERS THAT ARE NOT THE SAME NUMBER, drawn so they cannot be confused: `est` is the estimate
 * on the WORK, in total, and the hours in the middle column are what THIS period gives it. A
 * twenty-hour task with eight hours this week is not a disagreement.
 *
 * ---------------------------------------------------------------------------------------
 * READING IS WHAT THIS PAGE OPENS AS
 * ---------------------------------------------------------------------------------------
 *
 * NOTHING ON A PERIOD YOU ARE READING CAN BE TYPED INTO OR CHOSEN FROM. Opening a week to see what
 * is on it put a capacity field, an hours box per row and a search box in front of the reader, so
 * arriving on the page read as "start editing". Now the facts are facts, one button at the top
 * right says Edit, and pressing it turns them into fields in the same panels in the same order.
 *
 * WHICH OF THE TWO IT IS COMES FROM THE ADDRESS — `#/plan/2026-W34` reads, `#/plan/2026-W34/edit`
 * edits — so Back leaves editing, a screenshot can name the state, and a fresh visit is always
 * reading. Nothing remembers that you were editing yesterday.
 *
 * PRESSES ARE STILL ALLOWED WHILE READING. "How it went" on each row is one press that records one
 * fact and says what it recorded. Making that cost three presses is how a person ends up living in
 * editing mode, at which point editing is the default again and this is all for nothing.
 *
 * ---------------------------------------------------------------------------------------
 * TODAY IS WHERE THE WORK GETS DONE
 * ---------------------------------------------------------------------------------------
 *
 * `#/plan/today` shows what is on today, marks it done, records what was actually spent, and offers
 * what comes round. It has no capacity field, no add section and no plan starter, because
 * the owner's brief says Today is the execution projection and not a second planning surface.
 *
 * IT IS STILL ONE SURFACE AND NOT TWO. Pressing Edit on Today gives the ordinary day surface, with
 * the capacity field and the week's work to place — the reading state and the editing state of the
 * same day, which is how every other period on this page works. `#/plan/today` and
 * `#/plan/2026-08-14` are two spellings of one day and neither holds anything the other does not.
 */

import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useForegroundWait, useLoadingLight } from '../lib/waiting-light.ts'
import { consumePreparedPage, peekPreparedPage, preparePage, preparedPageKey } from '../lib/prepared-page.ts'
import { subscribeWorkspace } from '../lib/workspace.ts'
import { errorMessage, faultOf, api } from '../api.ts'
import {
  atGrain,
  DayPlan,
  MonthPlan,
  MonthReview,
  NotOnADay,
  periodSaid,
  PlanSection,
  periodsInWords,
  shift,
  TimeInWords,
  TodayPlan,
  WeekBuild,
  WorksToward,
  type PeriodSaid,
  type TodayKeys,
} from '../components/Planning.tsx'
import { editingAddress, navigate, parseRoute, planPath, planPeriodPath, planTodayPath, RouteLink, useRoute } from '../components/router.tsx'
// WHAT THIS PAGE IS CALLED, read from the rail row that opens it. Typing "Schedule" here would be
// the page's name in two places, and the rail was renamed from "Month, week, day" this pass.
import {
  Btn,
  ErrorNote,
  Field,
  Loading,
  ServerNote,
  TextInput,
  useAsync,
  type AsyncState,
} from '../components/ui.tsx'
import { useInspect } from '../lib/mode.ts'
import { periodKey, readPeriodWords, type Grain } from '@shared/planning.ts'
import type { PlanReply } from '../../server/api/planning.ts'
import type { TodayReply } from '../api.ts'

/** What the address means when it carries no period: this week. */
export function defaultPeriod(): string {
  return periodKey('week', new Date())
}

/** How the three horizons read on the picker. Sentence case, and never the word "horizon". */
const GRAIN_WORDS: Record<Grain, string> = { get month() { return t('g8.schedulePage.month') }, get week() { return t('g8.schedulePage.week') }, get day() { return t('g8.schedulePage.day') } }

/**
 * WHICH PERIOD IS ACTUALLY ON THE SCREEN: the reply that arrived, or the last one while the next is
 * in flight.
 *
 * Its own function because the two rules it keeps are the ones that could quietly make this page
 * lie, and a pure function can be tested without a browser.
 *
 *   IT NEVER SHOWS ANOTHER PERIOD'S NUMBERS. A reply carries the period it is about, so the kept
 *   one is used only while that is the period the address asks for. Pressing "next week" therefore
 *   cannot draw last week's rows under this week's heading.
 *
 *   IT IS DROPPED ON AN ERROR. A re-read that failed must not leave the old week up looking
 *   current; the page shows the server's own sentence instead.
 *
 * Why anything is kept at all: every write on this page re-reads the period, `useAsync` goes back
 * to `loading` while it does, and that unmounted the panel and everything typed into it. Adding one
 * piece of work to a week threw away the words used to find it. Measured by driving it on
 * 2026-08-14.
 */
export function periodShown(
  plan: AsyncState<PlanReply | null>,
  held: PlanReply | null,
  period: string | null,
): PlanReply | null {
  if (plan.status === 'ready') return plan.reReadError === undefined && plan.value?.period === period ? plan.value : null
  if (plan.status !== 'loading') return null
  if (held === null || period === null || held.period !== period) return null
  return held
}

export function PlanPage({ period: fromRoute, today: wantToday }: { period?: string; today?: boolean }) {
  const [wrote, setWrote] = useState(0)
  /**
   * WHETHER THIS PERIOD IS BEING READ OR WRITTEN IN, out of the address and nowhere else.
   *
   * Read here rather than handed down as a prop, because the shell hands this page its period and
   * not its editing state, and src/web/App.tsx belongs to another change in flight. `useRoute` is
   * the one parser either way, so this is the same answer the shell would have passed — not a
   * second reading of the address. A later pass should hand it down beside the period.
   */
  const route = useRoute()
  const editing = route.name === 'plan' && route.edit === true
  // THE SERVER'S OWN DAY, read once for the whole page. Everything that says "today" on this page —
  // the jump button, the day pill, the title, what comes round — reads this one answer, so the page
  // cannot be on the 13th and offer routines for the 14th. It is the same clock every stamp in
  // Mole Office is written with; computing it from this browser is how a day boundary gets read wrong.
  const [todayState] = useAsync(() => api.today(), [wrote])
  const today: TodayReply | null = todayState.status === 'ready' ? todayState.value : null
  const keys: TodayKeys | null = today === null ? null : { day: today.day, week: today.week, month: today.month }

  // `#/plan/today` is a route rather than a link to a date — see the router. The day it means is the
  // server's, so the page has nothing to show until that has arrived, and shows a loading state
  // rather than this browser's guess at what day it is.
  const period = wantToday === true ? (today?.day ?? null) : (fromRoute ?? defaultPeriod())

  /**
   * THE ADDRESS THIS PERIOD IS AT, in the spelling the reader arrived by.
   *
   * `#/plan/today` stays "today" through an Edit and back, because a day you are having and a date
   * you named are two different things to send somebody — which is why the router has both. One
   * const, read by the horizon picker's Edit button and by Today's own presses, so the way back to
   * planning cannot end up at a different address from the button at the top of the page.
   */
  const here = wantToday === true ? planTodayPath() : period === null ? null : planPeriodPath(period)

  /**
   * TRUE WHEN THIS IS TODAY BEING WORKED, rather than any day being planned.
   *
   * `#/plan/today` is the execution surface: what is on today, marking it done, what was spent,
   * what comes round. `#/plan/today/edit` is the same day being PLANNED, and it is the ordinary day
   * surface — the one place a day's capacity is set and the week's work is placed. So Today is
   * never a second way to plan: it is the reading state of the one surface that plans a day.
   */
  const doing = wantToday === true && !editing

  const usedPrepared = useRef(false)
  const prepared = period === null || usedPrepared.current ? undefined : peekPreparedPage<PlanReply>(planPeriodPath(period))
  const [plan, readAgain] = useAsync(() => {
    if (period === null) return Promise.resolve(null)
    if (prepared !== undefined && !usedPrepared.current) {
      usedPrepared.current = true
      consumePreparedPage(prepared)
      return Promise.resolve(prepared.value)
    }
    usedPrepared.current = true
    return api.plan(period)
  }, [period, wrote], prepared === undefined ? {} : { startFrom: { value: prepared.value } })

  /**
   * THE LAST REPLY, KEPT ON SCREEN WHILE THE NEXT ONE IS IN FLIGHT.
   *
   * THE DEFECT THIS CLOSES. Every write on this page re-reads the period, and `useAsync` goes back
   * to `loading` while it does — which unmounted the whole panel and everything inside it. So
   * adding one piece of work to a week threw away the words typed to find it, the project and the
   * level, and put a loading block where the week had been. Filling a week from one list meant
   * typing the same words again for every row. Measured by driving it on 2026-08-14: the narrowing
   * box was empty again the moment a press landed.
   *
   * IT IS NEVER ANOTHER PERIOD'S NUMBERS. The reply carries the period it is about, and it is only
   * kept while that matches the period on screen, so pressing "next week" cannot draw last week's
   * rows under this week's heading. And it is dropped on an error rather than left up beside it:
   * a failed re-read must not leave a stale week looking current.
   */
  const [held, setHeld] = useState<PlanReply | null>(null)
  useEffect(() => {
    if (plan.status === 'ready' && plan.value !== null) setHeld(plan.value)
  }, [plan])
  const showing = periodShown(plan, held, period)
  const serial = useRef(0)
  const destinationHash = useRef<string | null>(null)
  const [wait, setWait] = useState<{ element: HTMLElement; hash: string; status: 'loading' | 'error'; failure?: { message: string; fault: ReturnType<typeof faultOf> } } | null>(null)
  useEffect(() => {
    const cancel = () => { serial.current += 1; destinationHash.current = null; setWait(null) }
    const changed = () => { if (window.location.hash !== destinationHash.current) cancel() }
    window.addEventListener('hashchange', changed)
    const unsubscribe = subscribeWorkspace(cancel)
    return () => { serial.current += 1; window.removeEventListener('hashchange', changed); unsubscribe() }
  }, [])
  const capturePeriodPress = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.detail === 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]')
    if (link === null || link.hash === window.location.hash) return
    const destination = parseRoute(link.hash)
    if (destination.name !== 'plan') return
    const target = destination.today ? today?.day : destination.period
    if (target === undefined) return
    event.preventDefault()
    destinationHash.current = null
    const sequence = ++serial.current, originalHash = window.location.hash, hash = link.hash
    const keyPath = planPeriodPath(target), key = preparedPageKey(keyPath)
    setWait({ element: link, hash, status: 'loading' })
    void api.plan(target).then(value => {
      if (serial.current !== sequence || window.location.hash !== originalHash || preparedPageKey(keyPath) !== key) return
      preparePage(keyPath, key, value)
      destinationHash.current = hash
      navigate(hash.slice(1))
    }, (error: unknown) => {
      if (serial.current !== sequence || window.location.hash !== originalHash || preparedPageKey(keyPath) !== key) return
      setWait({ element: link, hash, status: 'error', failure: { message: errorMessage(error), fault: faultOf(error) } })
    })
  }
  const failed = plan.status === 'error' ? plan : plan.status === 'ready' ? plan.reReadError : undefined

  const said = period === null ? null : periodSaid(period, keys)
  const onWrote = () => setWrote((n) => n + 1)

  return (
    <>
      <style href="mole-office-plan" precedence="default">
        {PLAN_CSS}
      </style>

      <PlanHead period={period} said={said} editing={editing} here={here} today={wantToday === true} />
      <PeriodBar period={period} todayDay={today?.day ?? null} editing={editing} onPress={capturePeriodPress} />
      {wait === null ? null : <PeriodWait key={wait.hash} element={wait.element} status={wait.status} />}
      {wait?.failure === undefined ? null : <ErrorNote message={wait.failure.message} fault={wait.failure.fault} />}

      {/* Only when there is nothing to show. A re-read after a write keeps the period on screen —
          see `held` above — so a press no longer replaces the week with a loading block. */}
      {failed === undefined && (period === null || showing === null) ? (
        <PlanSection declares={{ surface: 'plan.period' }} title={said?.name ?? t('g8.schedulePage.thePlan')}>
          <Loading label={t('g8.schedulePage.thisPeriodSAllocationsAndTheWorkTheyName')} rows={3} light={wait?.status !== 'loading'} />
        </PlanSection>
      ) : null}

      {failed !== undefined ? (
        <PlanSection declares={{ surface: 'plan.period' }} title={t('g8.schedulePage.thePlan')}>
          {/* The server's own words. A period the address invented reaches here as the sentence
              that says what a period looks like, rather than as an empty week. */}
          <ErrorNote message={failed.message} fault={failed.fault} retry={readAgain} />
        </PlanSection>
      ) : null}

      {showing !== null && said !== null ? (
        <PlanView
          reply={showing}
          said={said}
          today={today}
          wrote={wrote}
          editing={editing}
          doing={doing}
          planHere={here === null ? null : editingAddress(here)}
          onWrote={onWrote}
        />
      ) : null}

      {/* WHAT THIS PERIOD WORKS TOWARD, as a short list. The goal drawing itself is on the Goals
          page, #/horizons (settled under question 16 of report n9Mjk3c_sJRu); this list links there.
          Not while today is being worked: Today is for doing, and this list is for planning. */}
      {doing || period === null ? null : <WorksToward period={period} />}

      {/* THINKING, BEFORE IT IS ANYTHING. Under the plan rather than above it: the plan is what you
          came for, and this is where a week gets worked out before it has a shape.

          NOT WHILE TODAY IS BEING WORKED. Starting a plan is planning. It is on every other period,
          and on today the moment somebody presses the plan press, which is the day being planned. */}
      {doing ? null : <StartPlan />}

      {/* TIME IN WORDS, AT THE FOOT. Going to a period in your own words is the date field in the
          control row now. What only this section does is keep words Mole Office could not read as a
          time, and list the words already kept. Those are planning, so Today does not draw it. */}
      {doing ? null : <TimeWords editing={editing} today={keys} onWrote={onWrote} />}
    </>
  )
}

/**
 * THE PAGE'S OWN NAME, ITS ONE LINE, AND ITS ONE PRIMARY PRESS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS UP HERE, AND WHY IT IS THE SAME HEAD EVERY PAGE HAS
 * ---------------------------------------------------------------------------------------
 *
 * The head is the shared rule R9 of report n9Mjk3c_sJRu (adopted in a decision): the page's title,
 * one line under it, and one primary press at the right of the title.
 *
 *   THE TITLE is the page's name, from the word list, on the same left edge as everything under it.
 *   It used to name the period instead, so the rail said "Schedule" and the page said "This week".
 *
 *   THE ONE LINE says which period is on screen, the days it covers, and that the hours come from
 *   every project. The period used to be a second heading in the control row; it is content, and
 *   the line is where a page says what it is showing.
 *
 *   THE PRIMARY PRESS is "Plan this week" (or this month, this day, today). It is the page's
 *   editing address, the one that used to be the press called Edit: pressing it turns the same
 *   sections into fields. While planning, the same place says "Stop editing". Rule R5: one primary
 *   press per page. "Today" moved into the control row, because it changes which period is shown.
 *
 * The primary press is drawn only once the page knows which period it is on. A press that plans
 * "the period the server has not named yet" would be a press with no destination.
 */
export function PlanHead({
  period,
  said: given,
  editing,
  here: address,
  today = false,
}: {
  period: string | null
  /** The period in words, as the page reads it. Left out, it is read here without the server's day. */
  said?: PeriodSaid | null
  /** The server's own day. Kept for the callers that pass it; the head no longer draws a Today press. */
  todayDay?: string | null
  /** True when the address ends in `/edit`. */
  editing: boolean
  /** This period's own address, or null while the server has not said what day it is. */
  here: string | null
  /** True on `#/plan/today`, where the press reads "Plan today". */
  today?: boolean
}) {
  const said = given ?? (period === null ? null : periodSaid(period, null))
  const inspect = useInspect()
  const unit = said?.unit ?? null
  const planWord =
    today ? t('schedule.planToday') : unit === 'month' ? t('scheduleDesign.planMonth') : unit === 'day' ? t('scheduleDesign.planDay') : t('schedule.planWeek')

  return (
    <header className="px-plan-head">
      <div className="px-plan-titles">
        <h1 className="px-plan-page" data-title-is="its-label">{t('g8.schedulePage.schedule')}</h1>
        <p className="px-plan-line">
          <span className="px-plan-name">{said?.name ?? t('g8.schedulePage.thePlan')}</span>
          {said === null || said.when === 'unknown' || said.when === 'now' ? null : (
            <span className="px-plan-when">{said.when === 'past' ? t('g8.schedulePage.hasBeen') : t('g8.schedulePage.stillToCome')}</span>
          )}
          <span className="px-plan-sep" aria-hidden="true">·</span>
          <span className="px-plan-range">
            {said?.range ?? t('g8.schedulePage.askingTheServerWhatDayItIs')}
            {!inspect || period === null ? null : <code className="px-plan-key">{period}</code>}
          </span>
          <span className="px-plan-sep" aria-hidden="true">·</span>
          {/* THE ONE THING THE ROWS CANNOT SAY, AND IT IS A CLAIM ABOUT THE HOURS ONLY. The
              allocations are read for the period with no project filter at all, so every total
              and every row of hours covers every project. The goals further down are one
              project's, and their own line says which. */}
          <span className="px-plan-scope">
            {t('g8.schedulePage.hoursFromEveryProject')}
          </span>
        </p>
      </div>
      {address === null ? null : editing ? (
        <RouteLink to={address} className="px-plan-primary px-plan-edit-stop">{t('g8.schedulePage.stopEditing')}</RouteLink>
      ) : (
        <RouteLink to={editingAddress(address)} className="px-plan-primary">{planWord}</RouteLink>
      )}
    </header>
  )
}

/**
 * THE ONE CONTROL ROW: WHICH PERIOD IS ON SCREEN, AND EVERY WAY TO CHANGE IT.
 *
 * In this order, on one line at 1440: Day / Week / Month, back and forward, Today, and at the right
 * the date field. That is the proposal the owner adopted (report n9Mjk3c_sJRu, block b-13).
 *
 * DAY · WEEK · MONTH IS ONE CONTROL, and Today is not part of it. On `#/plan/2026-08-13` the
 * "today" and "day" pills once resolved to the IDENTICAL address, so "day" drew as current and
 * "today" never could: the test is which horizon you are on, and today is not a horizon. Today is a
 * jump, so it sits after the arrows and is drawn as where you are when you are on it.
 *
 * THE DATE FIELD IS STILL A PRESS WHILE THE PERIOD IS BEING READ. It is drawn in the shape of a
 * field and says what it takes, and the box opens where it was. See `SayWhen` for why.
 */
function PeriodWait({ element, status }: { element: HTMLElement; status: 'loading' | 'ready' | 'error' }) {
  const target = useRef<HTMLElement | null>(element)
  useForegroundWait(status === 'loading')
  useLoadingLight(target, status, 2)
  return null
}

export function PeriodBar({
  onPress,
  period,
  todayDay,
  editing = false,
  now,
}: {
  period: string | null
  onPress?: (event: MouseEvent<HTMLDivElement>) => void
  /** The period in words. The head draws it now; kept so every caller can still pass it. */
  said?: PeriodSaid | null
  todayDay: string | null
  /**
   * True when the address ends in `/edit`. Left out it is false, because reading is what every
   * fresh visit gets — that is the page's rule, stated at the head of this file, not a convenient
   * default chosen here.
   */
  editing?: boolean
  /** The day words are read against. The browser's own, which is the person's own. Fixed in tests. */
  now?: Date
}) {
  const at = period === null ? null : periodSaid(period, null)
  const onToday = at !== null && at.unit === 'day' && period === todayDay
  return (
    <div className="px-plan-bar" onClickCapture={onPress}>
      <div className="px-plan-nav">
        <div className="px-plan-move">
          <div className="px-plan-horizons" role="group" aria-label={t('g8.schedulePage.howMuchTimeToShow')}>
            {(['day', 'week', 'month'] as const).map((h) => {
              const to = period === null ? null : atGrain(period, h, todayDay)
              const current = at?.unit === h
              if (to === null) {
                return (
                  <span key={h} className="px-plan-h" aria-disabled="true">
                    {GRAIN_WORDS[h]}
                  </span>
                )
              }
              return (
                <RouteLink
                  key={h}
                  to={planPeriodPath(to)}
                  className={current ? 'px-plan-h px-plan-h-now' : 'px-plan-h'}
                >
                  {GRAIN_WORDS[h]}
                </RouteLink>
              )
            })}
          </div>
          {period === null ? (
            <span className="px-plan-step px-plan-step-off">{t('g8.schedulePage.previous')}</span>
          ) : (
            <RouteLink to={planPeriodPath(shift(period, -1))} className="px-plan-step">{t('g8.schedulePage.previous')}</RouteLink>
          )}
          {period === null ? (
            <span className="px-plan-step px-plan-step-off">{t('g8.schedulePage.next')}</span>
          ) : (
            <RouteLink to={planPeriodPath(shift(period, 1))} className="px-plan-step">{t('g8.schedulePage.next')}</RouteLink>
          )}
          {onToday ? (
            <span className="px-plan-today px-plan-today-now" aria-current="date" title={t('g8.schedulePage.thisIsTodayThePageYouAreOnIs')}>
              {t('scheduleDesign.today')}
            </span>
          ) : (
            <RouteLink to={planTodayPath()} className="px-plan-today">{t('scheduleDesign.today')}</RouteLink>
          )}
        </div>
        <SayWhen editing={editing} {...(now === undefined ? {} : { now })} />
      </div>
    </div>
  )
}

/**
 * SAY WHEN YOU MEAN, IN THE CONTROLS THAT CHANGE THE PERIOD.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The only place on this page you could write a period in your own words was a shut fold at the
 * bottom of a panel, headed "Another day, week or month". A first-time user took forty seconds to
 * find it, and two never looked there at all, because everything that changes the period — the two
 * arrows and Month, Week, Day — is up here. The owner's rule for this page is that the person can say
 * when they mean, and a way of saying it that lives somewhere else is not that.
 *
 * So writing the period is one of the period controls now, at the same size and in the same row as
 * Month, Week and Day. Nothing was taken away: the arrows and the three horizons are untouched.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS STILL ONE PRESS AWAY WHILE THE PAGE IS BEING READ
 * ---------------------------------------------------------------------------------------
 *
 * No page in Mole Office draws a box until you ask for one; `tests/read-before-edit.test.ts` opens every
 * address in a real browser and counts them, and the schedule is one of the pages it counts. So
 * while the period is being read this draws a press — a plain one, in the period controls, saying
 * what you get — and the box appears where the press was. While the period is being planned the box
 * is already open, because the page is drawing boxes anyway.
 *
 * THE PRESS IS THE PART THAT HAD TO CHANGE, not the box. What made the old fold undiscoverable was
 * where it sat and what it was called, and both of those are fixed here whether the box is open or
 * shut. **A permanently visible box on a page being read is a product decision that belongs to the
 * owner**: it would mean the schedule joining the one page in Mole Office exempt from that rule, and
 * that exemption is checked, deliberate and written into the design documents.
 *
 * ---------------------------------------------------------------------------------------
 * IT NEVER GUESSES AND IT NEVER THROWS THE WORDS AWAY
 * ---------------------------------------------------------------------------------------
 *
 * `readPeriodWords` is the one reader — the same one the plan table and the kept-words panel use —
 * and what it made of the words is printed underneath in its own sentence. When it read nothing,
 * "next Tuesday afternoon", "sometime next week", there is no press to open anything, because a
 * press that would land nowhere is a lie about what Mole Office understood. The words stay in the box.
 *
 * NOTHING HERE WRITES ANYTHING. Going to another period is reading, so this makes no allocation and
 * keeps no intent. Keeping words Mole Office could not read is a separate act, and it stays where it is:
 * behind Edit, in "Time in words".
 */
export function SayWhen({ editing, now }: { editing: boolean; now?: Date }) {
  /** True once the press has been made. `editing` opens it as well, and neither closes the other. */
  const [asked, setAsked] = useState(false)
  const [said, setSaid] = useState('')
  const inspect = useInspect()
  const open = editing || asked

  if (!open) {
    return (
      <button type="button" className="px-plan-when-open" onClick={() => setAsked(true)}>
        {t('g8.schedulePage.goToADateOrPeriod')}
      </button>
    )
  }

  const offer = whenSaid(said, now ?? new Date())

  return (
    <div className="px-plan-when-box">
      <form
        className="px-plan-when-row"
        onSubmit={(e) => {
          e.preventDefault()
          if (offer.offer === 'open') navigate(planPeriodPath(offer.key))
        }}
      >
        <TextInput
          value={said}
          onChange={setSaid}
          // EVERY EXAMPLE HERE IS ONE `readPeriodWords` READS, and a test holds it to that. A
          // placeholder is a promise about what the box takes, and the box beside this one promised
          // three things and delivered one until somebody measured it.
          placeholder={t('g8.schedulePage.dateExamples')}
          aria-label={t('g8.schedulePage.aDateOrPeriodInYourOwnWords')}
          autoFocus={asked}
        />
        {/* NO PRESS WHEN NOTHING WAS READ. A press Mole Office would refuse is a fake affordance, and
            the sentence under the box already says which word stopped it. */}
        {offer.offer === 'open' ? (
          <Btn size="sm" type="submit">{t('g8.schedulePage.open', { value1: periodSaid(offer.key, null).name })}</Btn>
        ) : null}
      </form>
      {/* WHAT MOLE OFFICE READ, with the week or month named the way a person says it. The press above
          already says "Open Week of 24 August"; this sentence used to answer the same question with
          the stored key. Inspect keeps the reader's sentence as it was written. */}
      {offer.offer === 'nothing' ? null : (
        <p className="px-plan-when-said">
          {offer.offer === 'open' ? (inspect ? offer.how : periodsInWords(offer.how)) : offer.why}
        </p>
      )}
    </div>
  )
}

/** What the press says while the box is shut. One string, so the test cannot check a second one. */
export const SAY_WHEN_PRESS = en['g8.schedulePage.goToADateOrPeriod']

/**
 * The examples in the box, and the whole of what it promises.
 *
 * EVERY ONE OF THEM IS READ BY `readPeriodWords`, which `tests/schedule-say-when.test.ts` checks
 * word by word. The other box on this page once offered "next week, 7 September, 5h on Tuesday" and
 * the reader took neither of the last two, so the box promised three things and delivered one.
 */
export const SAY_WHEN_EXAMPLES = ['next week', 'Tuesday', 'September', '2026-09-07'] as const

/** What the box has to offer for the words in it: nowhere yet, somewhere to go, or nowhere at all. */
export type WhenSaid =
  | { offer: 'nothing' }
  | { offer: 'open'; key: string; how: string }
  | { offer: 'none'; why: string }

/**
 * What to offer for what somebody has typed. A pure function, so what the box does with a phrase can
 * be checked without a browser — the same reason `periodShown` above is one.
 *
 * IT NEVER RETURNS A PERIOD IT DID NOT READ. An empty box offers nothing, because being handed
 * nothing is not a failed reading and answering it with the reader's complaint is noise. Words the
 * reader refused come back as the refusal it wrote, never as a nearby period: turning "sometime next
 * week" into next week would be Mole Office claiming an interpretation it did not make.
 */
export function whenSaid(said: string, now: Date): WhenSaid {
  if (said.trim() === '') return { offer: 'nothing' }
  const read = readPeriodWords(said, now)
  return read.read ? { offer: 'open', key: read.period.key, how: read.how } : { offer: 'none', why: read.why }
}

/** Time in words, holding what is typed in its box. */
function TimeWords({ editing, today, onWrote }: { editing: boolean; today: TodayKeys | null; onWrote: () => void }) {
  const [said, setSaid] = useState('')
  return <TimeInWords said={said} onSaid={setSaid} editing={editing} today={today} onWrote={onWrote} />
}

/** Which panels a period gets. Three horizons, three jobs — see components/Planning.tsx. */
function PlanView({
  reply,
  said,
  today,
  wrote,
  editing,
  doing,
  planHere,
  onWrote,
}: {
  reply: PlanReply
  said: PeriodSaid
  today: TodayReply | null
  wrote: number
  /** True when the address ends in `/edit`. Reading is what every fresh visit gets. */
  editing: boolean
  /** True on `#/plan/today` while it is being read: the day being worked. See the head of this file. */
  doing: boolean
  /** Where this period is planned, or null while the page does not know which period it is on. */
  planHere: string | null
  onWrote: () => void
}) {
  const inspect = useInspect()
  const keys: TodayKeys | null =
    today === null ? null : { day: today.day, week: today.week, month: today.month }
  return (
    <>
      {reply.horizon === 'week' ? (
        // THE SERVER'S OWN DAY, handed down so the board can mark today's column. Read once by the
        // page, like everything else on it that says "today" — a board working the day out from
        // this browser could put the mark on a different column from the button at the top.
        <WeekBuild
          reply={reply}
          said={said}
          wrote={wrote}
          editing={editing}
          todayDay={today?.day ?? null}
          onWrote={onWrote}
        />
      ) : null}
      {reply.horizon === 'month' ? (
        <MonthPlan reply={reply} said={said} today={keys} editing={editing} onWrote={onWrote} />
      ) : null}
      {reply.horizon === 'day' ? (
        // Today needs the server's own day and cannot be drawn without it. On `#/plan/today` the
        // page has no period at all until that reply arrives, so this is never the loading state
        // wearing the day surface: it is the dated day, which is a different address.
        doing && today !== null && planHere !== null ? (
          <TodayPlan reply={reply} said={said} today={today} planHere={planHere} onWrote={onWrote} />
        ) : (
          <DayPlan reply={reply} said={said} today={today} wrote={wrote} editing={editing} onWrote={onWrote} />
        )
      ) : null}

      {reply.horizon === 'week' ? <NotOnADay reply={reply} /> : null}
      {reply.horizon === 'month' ? (
        <MonthReview period={reply.period} said={said} wrote={wrote} editing={editing} onWrote={onWrote} />
      ) : null}

      {/* THE SERVER'S OWN SENTENCE, kept and moved. It restates in prose exactly what the bar and
          the rows above already show — "3 allocations, 10 hours planned, but 2 of them do not say
          how long… It holds 10, so 0 hours are free" — which is the API's note doing the page's
          job. It is the authority on the arithmetic, so it is one press away rather than gone. */}
      {inspect ? (
        <PlanSection declares={{ surface: 'plan.server' }} title={t('g8.schedulePage.whatTheServerSaysThisPeriodAddsUpTo')}>
          <ServerNote text={reply.note} />
        </PlanSection>
      ) : null}
    </>
  )
}

/** The Plans page's title-and-write flow, also offered while a period is being planned. */
function StartPlan() {
  const [naming, setNaming] = useState(false)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const start = async () => {
    const stillHere = stillOnThisPage()
    setBusy(true)
    setFailed(null)
    try {
      const made = await api.newPlan(title)
      if (stillHere()) navigate(planPath(made.plan.id))
    } catch (err) {
      setFailed({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="px-plan-start">
      {naming ? (
        <form onSubmit={event => { event.preventDefault(); if (!busy) void start() }}>
          <Field label={t('g8.shelf.whatIsThisPlanAbout')}>
            <TextInput value={title} onChange={setTitle} placeholder={t('g8.shelf.oneLine')} autoFocus />
          </Field>
          <div className="px-gov-acts">
            <Btn type="submit" pending={busy}>{t('g8.shelf.startWriting')}</Btn>
            <Btn variant="ghost" disabled={busy} reason={t('g8.schedulePage.theWriteIsInFlight')} onClick={() => { setNaming(false); setFailed(null) }}>{t('g8.shelf.cancel')}</Btn>
          </div>
          {failed === null ? null : <ErrorNote message={failed.message} fault={failed.fault} />}
        </form>
      ) : <Btn onClick={() => setNaming(true)}>{t('g8.shelf.writeANewPlan')}</Btn>}
    </div>
  )
}

const PLAN_CSS = `

.px-plan-start { margin-block: var(--pad-lg); }
.px-plan-start form { display: flex; flex-direction: column; gap: var(--pad); max-width: var(--measure-in-box); }
.px-plan-start .px-gov-acts { display: flex; flex-wrap: wrap; gap: var(--pad); }

/* EVERY VALUE HERE IS A TOKEN FROM tokens.css, and the first version of this file was written with
   invented names — --space-1, --ink-3, --surface-2 — none of which exist. CSS drops a declaration
   whose custom property is undefined, silently, so the page rendered with every gap at zero and
   read "monthweekdaytoday". Found by photographing it, not by reading it. */
/* THE HEAD (rule R9): the title and its one line at the left, the one primary press at the right of
   the title. On a phone the press takes the full width under the head (rule R5). */
.px-plan-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px 24px; flex-wrap: wrap; margin-bottom: 24px; }
.px-plan-titles { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.px-plan-page { margin: 0; font-size: var(--fs-6); font-weight: 600; line-height: var(--lh-tight); color: var(--text); }
.px-plan-line { margin: 0; display: flex; align-items: baseline; flex-wrap: wrap; gap: 0 8px; font-size: var(--fs-2); color: var(--text-2); }
.px-plan-name { color: var(--text); }
.px-plan-when { color: var(--text-3); }
.px-plan-sep { color: var(--text-3); }
.px-plan-range { display: inline-flex; align-items: baseline; gap: 8px; flex-wrap: wrap; font-variant-numeric: tabular-nums; }
.px-plan-scope { color: var(--text-2); }
/* THE ONE PRIMARY PRESS. It is an anchor, because reading and planning is an address. At least
   44px tall, like every press a finger has to hit (rule R8). */
.px-plan-primary { display: inline-flex; align-items: center; min-height: 44px; font-size: var(--fs-2); font-weight: 600; color: var(--button-primary-ink); background: var(--button-primary-bg); text-decoration: none; padding: 0 16px; border: var(--border-w) solid var(--button-primary-border); border-radius: var(--radius-sm); white-space: nowrap; }
.px-plan-primary:hover { background: var(--button-primary-hover); }
/* Stop editing stays in the same place and the same fill: it is still the page's one primary press,
   drawn by the rule above. */
/* THE ONE CONTROL ROW: Day / Week / Month, back, forward, Today, and the date field at the right. */
.px-plan-bar { margin-bottom: 32px; }
.px-plan-nav { display: flex; align-items: center; justify-content: space-between; gap: 8px 16px; flex-wrap: wrap; min-width: 0; }
.px-plan-move { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.px-plan-key { font-family: var(--font-mono); font-size: var(--fs-1); color: var(--text-3); background: var(--panel-2); border-radius: var(--radius-sm); padding: 1px 8px; }
.px-plan-step { display: inline-flex; align-items: center; min-height: 36px; font-size: var(--fs-2); color: var(--text-2); text-decoration: none; padding: 0 12px; border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); white-space: nowrap; }
.px-plan-step:hover { background: var(--hover); }
.px-plan-step-off { color: var(--text-dis); }
/* ONE CONTROL, THREE CHOICES. --border-strong, not --border: a control boundary is held to 3:1 (see
   the header of tokens.css) and the decorative hairline measures 1.26:1 in the light theme. */
.px-plan-horizons { display: inline-flex; border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); overflow: hidden; }
.px-plan-h { display: inline-flex; align-items: center; min-height: 36px; font-size: var(--fs-2); color: var(--text-2); text-decoration: none; padding: 0 16px; border-right: var(--border-w) solid var(--border-strong); }
.px-plan-h:last-child { border-right: 0; }
.px-plan-h:hover { background: var(--hover); }
.px-plan-h-now { color: var(--accent-text); background: var(--accent); font-weight: 600; }
.px-plan-today { display: inline-flex; align-items: center; min-height: 36px; font-size: var(--fs-2); color: var(--text-2); padding: 0 8px; text-decoration: underline; white-space: nowrap; }
.px-plan-today-now { color: var(--text-3); text-decoration: none; }
/* THE DATE FIELD WHILE THE PERIOD IS BEING READ: a press drawn in the shape of a field, so it reads as
   the place to write a date. The box opens where it was (see SayWhen). */
.px-plan-when-open { font: inherit; font-size: var(--fs-2); color: var(--text-3); background: var(--panel);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  min-height: 36px; min-width: 18rem; padding: 0 12px; text-align: left; cursor: text; white-space: nowrap; }
.px-plan-when-open:hover { border-color: var(--text-2); }
.px-plan-when-box { display: flex; flex-direction: column; align-items: stretch; gap: 2px; width: min(24rem, 100%); max-width: 100%; }
.px-plan-when-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; min-width: 0; }
.px-plan-when-row .px-input { flex: 1 1 18rem; min-width: 0; width: auto; }
/* What Mole Office made of the words, in the reader's own sentence. Quiet, because it is an answer to
   something you just typed and not a warning. */
.px-plan-when-said { margin: 0; font-size: var(--fs-1); color: var(--text-3); line-height: var(--lh-body);
  max-width: 24rem; text-align: right; }
@media (max-width: 40rem) {
  /* One step down, so the page name is still the biggest thing on the screen. Nothing here centres. */
  .px-plan-page { font-size: var(--fs-5); }
  /* THE PRIMARY PRESS TAKES THE FULL WIDTH UNDER THE HEAD (rule R5), and every press is 44px. */
  .px-plan-primary { width: 100%; justify-content: center; }
  .px-plan-step, .px-plan-h, .px-plan-today, .px-plan-when-open { min-height: 44px; }
  /* THE CONTROL ROW ON A PHONE: Day / Week / Month take a full-width row of their own, three equal
     segments, then back, forward and Today, then the date field across the whole width. */
  .px-plan-nav { align-items: stretch; }
  .px-plan-move { width: 100%; }
  .px-plan-horizons { display: flex; width: 100%; }
  .px-plan-h { flex: 1 1 0; justify-content: center; }
  .px-plan-when-open { width: 100%; min-width: 0; }
  .px-plan-when-box { align-items: stretch; width: 100%; }
  .px-plan-when-row { justify-content: flex-start; }
  .px-plan-when-said { text-align: left; max-width: none; }
}
`
