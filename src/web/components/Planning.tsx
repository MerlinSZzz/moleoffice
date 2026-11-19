// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLANNING SURFACES: what a month, a week and a day are made of, and the controls that change
 * them.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CHANGED IN THIS PASS, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * Two independent audits opened this page cold and came back with the same verdict — guessable, not
 * clear. Almost every finding was the same defect wearing different clothes: **the storage model was
 * on the screen**. A period was a key (`2026-W33`), a total was "planned at this horizon", capacity
 * was four unlabelled widgets in a row, and the one control that said what a week could DO was the
 * third panel down. So this file now draws the three periods as three JOBS:
 *
 *     a month   is looked back at, and its weeks are how you get into it
 *     a week    is filled — summary, then the rows, then how to add to it, top to bottom
 *     a day     is worked from, and its work comes off the week it is in
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING HERE WRITES UNTIL SOMEBODY PRESSES SOMETHING
 * ---------------------------------------------------------------------------------------
 *
 * A review is a GET. A recurrence is an offer the server computes and does not store — no row
 * exists for "Monday's standup" until a person puts it on Monday. Carrying work into next month is
 * a press per row. There is deliberately no "roll the week forward" button that writes twelve
 * allocations from one press: the person commits the week, and a surface that committed it for
 * them would be inventing intent nobody stated.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE SURFACES REFUSE TO SAY
 * ---------------------------------------------------------------------------------------
 *
 * They never add across horizons: a week's hours and a day's hours inside it are two answers to two
 * questions (see `src/shared/planning.ts`), and no total here spans them.
 *
 * They never turn an absence into a zero. No capacity means no bar and no free-hours figure — the
 * period draws the short absence mark and offers the press that sets it. No recorded actual hours
 * means planned-against-actual has no answer, drawn with the same short mark.
 *
 * ---------------------------------------------------------------------------------------
 * HOW LOUDLY THEY SAY IT: THREE TIERS, AND ONE OF THEM IS USED ONCE
 * ---------------------------------------------------------------------------------------
 *
 * `design/ROUND-FOUR.md` sorts absences by one test — does the reader have to DO something about
 * this absence — and every absence here that is drawn as a mark or a dash goes through `Absence` in
 * ui.tsx, which makes the caller name the tier. On this page:
 *
 *     ordinary       an empty week, an empty day, a month with nothing of its own, nothing left to
 *                    carry. A dimmed dash, with the press that fills it beside it. `NothingOn`.
 *                    The week board has no press there, so it draws the sentence in dimmed words.
 *     told-apart     nobody has said how many hours this period holds. A dashed mark reading
 *                    "not set", because that is not the same fact as no hours. `NoCapacitySaid`.
 *     must-act-on    ONE, and it is the day whose WEEK is empty. That day being empty BECAUSE its
 *                    week is, is a different fact from the day being empty, and a person cannot fix
 *                    it here. It keeps its sentence and its press goes to the week. `FromThisWeek`.
 *
 * QUIETENING IS NOT DELETING. Every sentence a tier drops is on the mark, where a screen reader
 * reads it out and the tooltip shows it. A blank is what the fifth invariant forbids.
 *
 * ONE SENTENCE ON THIS PAGE IS NOT AN ABSENCE AND KEEPS ITS OWN DRAWING: `PartsInsideNote`. It is
 * not about a value that is missing; it is about work planned at two levels — a piece of work with
 * hours and parts of it with hours — and what that costs the period. See its own header.
 *
 * And they never draw a press the server will refuse. Which kinds a plan may hold comes from the
 * reply (`allocatableKinds`), out of the same declaration the write path enforces, because a list
 * of kinds written down in the browser as well is the pair this repository keeps finding.
 */

import { useEffect, useRef, useState } from 'react'
// `moleOfficeRequest` IS THE TRANSPORT AND `api` IS THE TYPED SURFACE OVER IT, and the two intent calls
// below reach for the transport because `src/web/api.ts` belonged to another agent when they were
// written and could not be added to. They belong there, as `api.keepIntent` and `api.commitIntent`, next to
// `api.allocate`; the report for this slice says so. Nothing else about them is unusual: same
// headers, same project, same error handling as every other request the browser makes.
import { api, moleOfficeRequest, type ReviewReply, type TodayReply } from '../api.ts'
// THE THREE ATTRIBUTES THAT MAKE AN ELEMENT ADDRESSABLE, declared once in src/shared/targets.ts.
// Nothing here calls a hook: carrying the attribute IS the wiring, and one listener at the document
// reads it. See components/agent/pointing.ts.
import { endOfSentence, listJoined, t, writtenDay, writtenDayRange, type DayParts, type WordKey } from '@shared/i18n.ts'
import { gapBetween, wordWithSpacedValues } from '@shared/spacing.ts'
import { en } from '@shared/words/en.ts'
import { TieredPress } from './TieredPress.tsx'
import { WORKSPACE_HEADER } from '../lib/workspace.ts'
import { readParticipantsOnce } from '../lib/oneread.ts'
import type { RecordReply } from '../../server/api/records.ts'
import { targetAttributes, textAttributes } from '@shared/targets.ts'
import { declaredAttributes, declaresSomething, type Declares } from './declares.ts'
import { DRAWS_THE_NAME } from './agent/pointing.ts'
import { editingAddress, horizonsPath, planPeriodPath, recordPath, RouteLink } from './router.tsx'
import {
  Absence,
  Btn,
  ErrorNote,
  Hint,
  Loading,
  OriginMark,
  StoredState,
  Tag,
  TextArea,
  TextInput,
  useAsync,
  type AsyncState,
} from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { progressOf } from '@shared/work.ts'
// WHAT WORD FINISHES A KIND, READ FROM THE DECLARATION THAT ENFORCES WRITES. `KIND_SPECS` is the
// same table `POST /api/records` validates against and `GET /api/kinds` serves, so the Done press
// cannot offer a word the server would refuse. A list of finishing words written out here would be
// the recurring defect: two places holding one fact with nothing making them agree.
import { declaredTypeOf, KIND_SPECS, type KindSpec } from '@shared/kinds.ts'
import type { RecordKind } from '@shared/types.ts'
import { kindWord, stateWord } from '../lib/words.ts'
/** Every project, read once for the whole browser, so a row can print a name and not an id. */
import { useProjects, type ProjectRow } from '../lib/projectlist.ts'
import { useInspect } from '../lib/mode.ts'
import {
  containsPeriod,
  parsePeriod,
  periodKey,
  hoursReadingSaid,
  readHoursBox,
  readTimeWords,
  windowDays,
  type EnvelopeNode,
  type Grain,
  type HoursBoxRead,
  type Load,
  type Period,
  type WorkWindow,
} from '@shared/planning.ts'
import type { PlanReply } from '../../server/api/planning.ts'
import type { PlanGraphNode, PlanGraphReply } from '../../server/api/plan-graph.ts'
import type {
  AllocatedWork,
  AllocationWithWork,
  Capacity,
  PlanningIntent,
  PlanningIntentWithPeriodReading,
} from '../../server/lib/planning.ts'
import type { WindowWithWork } from '../../server/lib/windows.ts'
// WHOSE WINDOW IT IS. One reader of the `${actor.type}:${actor.id}` stamp, shared with the
// planning page, so the second colour and the words beside it cannot come to different answers.
import { ownerOfWindow, type WindowOwner } from '@shared/windowowner.ts'
import type { WorkListReply, WorkRow } from '../../server/lib/worklist.ts'

// ============================================================================ moving about

/**
 * The period one step either side of this one, at its own horizon.
 *
 * THE ONE COPY. The plan page's arrows and every "next week" press below come through here, so a
 * month that stepped by 30 days in one place and by a calendar month in another is not a thing
 * this page can do. `setMonth` on the first of a month is exact; the day arithmetic is local
 * wall-clock like every other date in Mole Office.
 */
export function shift(period: string, by: -1 | 1): string {
  const parsed = parsePeriod(period)
  // A period the address invented is handed back unchanged: the arrows then lead nowhere new and
  // the page's own error says what a period looks like. Guessing one would move the reader to a
  // week they never asked for.
  if (parsed === null) return period
  const at = dateOf(parsed.from)
  if (parsed.horizon === 'month') at.setMonth(at.getMonth() + by)
  else if (parsed.horizon === 'week') at.setDate(at.getDate() + by * 7)
  else at.setDate(at.getDate() + by)
  return periodKey(parsed.horizon, at)
}

/** `YYYY-MM-DD` as a local Date. Built from the parts, never parsed as an instant. */
function dateOf(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1)
}

/**
 * THE SAME MOMENT AT ANOTHER HORIZON — and "the same moment" means TODAY when today is in it.
 *
 * This used to take the period's first day, always, which made the horizon picker lie in the one
 * case it is most used in: from `2026-08` the day pill went to the 1st of August, never to the day
 * you are living in. Measured on 2026-08-13. A month contains today or it does not; when it does,
 * the day a person means by "day" is today, and when it does not there is no today to offer and the
 * first day is the honest answer.
 *
 * `todayDay` is the SERVER's day — the clock every stamp in Mole Office is written with — and `null`
 * while that has not arrived, which falls back to the first day rather than to this browser's idea
 * of what day it is.
 */
export function atGrain(period: string, horizon: Grain, todayDay: string | null): string {
  const parsed = parsePeriod(period)
  if (parsed === null) return period
  const holdsToday = todayDay !== null && todayDay >= parsed.from && todayDay <= parsed.to
  return periodKey(horizon, dateOf(holdsToday && todayDay !== null ? todayDay : parsed.from))
}

/**
 * Every day a period covers, first to last, as day keys.
 *
 * BUILT FROM `parsePeriod`, which is the one reader of a period in this product, and from
 * `periodKey`, which is the one writer of a day key. A week's seven columns are therefore the same
 * seven days every total on the page counts, and a board that walked its own calendar could put
 * Monday in a different place from the arithmetic beside it. An empty list for anything that is not
 * a period: absence, never a guessed week.
 */
export function daysOf(period: string): string[] {
  const parsed = parsePeriod(period)
  if (parsed === null) return []
  const out: string[] = []
  const at = dateOf(parsed.from)
  const last = dateOf(parsed.to)
  while (at.getTime() <= last.getTime()) {
    out.push(periodKey('day', at))
    at.setDate(at.getDate() + 1)
  }
  return out
}

/** The day `by` days after this one. Local wall clock, built from the parts, like every other date. */
export function dayPlus(day: string, by: number): string {
  const at = dateOf(day)
  at.setDate(at.getDate() + by)
  return periodKey('day', at)
}

/** Which day, week and month the server is having. `null` until it has said. */
export type TodayKeys = Pick<TodayReply, 'day' | 'week' | 'month'>

function weekdayWord(index: number): string { return t(`schedule.weekday.${index}` as WordKey) }
function unitWord(unit: string): string {
  return unit === 'day' ? t('schedule.day') : unit === 'week' ? t('schedule.week') : unit === 'month' ? t('schedule.month') : t('schedule.period')
}
function unitsWord(unit: string): string {
  return unit === 'day' ? t('schedule.days') : unit === 'week' ? t('schedule.weeks') : t('schedule.months')
}

/** What a period is CALLED, what days it covers, and whether it has been, is, or is to come. */
export interface PeriodSaid {
  /** The heading: "Today", "This week", "August 2026". Never a stored key. */
  name: string
  /** The days it covers, written out: "Thursday 13 August", "10 – 16 August". */
  range: string
  /** Where it sits against the day the server is having. `unknown` until the server has said. */
  when: 'past' | 'now' | 'ahead' | 'unknown'
  /** The word for this horizon in a sentence: month, week, day. */
  unit: string
}

/**
 * HOW A PERIOD READS TO A PERSON.
 *
 * The page title was the stored key — `2026-W33`, `2026-08-13` — with the human range demoted
 * underneath it and nothing at all saying whether a day had been or was to come. A key is what you
 * type in an address bar; it is not what a week is called.
 *
 * A pure function of the period and the server's day, so the title, the panel heading and the
 * "you are here" test are all one answer rather than three that agree today.
 */
export function periodSaid(period: string, today: TodayKeys | null): PeriodSaid {
  const p = parsePeriod(period)
  if (p === null) {
    return { name: t('schedule.unknownPeriod'), range: t('schedule.invalidPeriod'), when: 'unknown', unit: 'period' }
  }
  const here = today === null ? null : today[p.horizon]
  const when: PeriodSaid['when'] =
    today === null ? 'unknown' : here === period ? 'now' : p.to < today.day ? 'past' : 'ahead'
  return { name: nameOf(p, period, today, when), range: rangeOf(p), when, unit: p.horizon }
}

/**
 * A SENTENCE MOLE OFFICE WROTE, WITH EVERY STORED WEEK OR MONTH KEY NAMED THE WAY A PERSON SAYS IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, IN CHROMIUM, ON 17 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * A person typed "next week" into the plan table, gave the line 20 hours, and Normal mode answered
 * with the stored key three times over: *"next week" is 2026-W35, 2026-08-24 to 2026-08-30*, then
 * *One allocation written in 2026-W35*, then *20 hours in 2026-W35* under the writing box, and
 * again in the notice after the line was renamed. A person must **not be required to know an
 * internal way of writing a date.**
 *
 * `PeriodInWords` already fixed the two table cells, where a period arrives on its own. These four
 * places have it inside a sentence, so this names the keys in the sentence and leaves every other
 * word exactly as it was written.
 *
 * WHAT IT TOUCHES, AND WHAT IT LEAVES ALONE. A week key and a month key only — `2026-W35` and
 * `2026-08`. A day is written `2026-08-24` and stays, because a date is something a person reads.
 * A token nothing can place on a calendar stays exactly as stored: absence beats a guess, and the
 * key is then the true name of what is there.
 *
 * IT IS `periodSaid` AND NOT A SECOND NAMER, for the same reason `PeriodInWords` says so: a week
 * called "Week of 24 August" in a cell and something else in the sentence beneath it would be one
 * fact worked out in two places.
 *
 * THE DAY IS DELIBERATELY NOT PASSED IN, also as in `PeriodInWords`. These sentences quote the
 * words a person typed — often "next week" — and Mole Office answering "Next week" beside them would
 * put the same two words on screen meaning two different things.
 *
 * NORMAL MODE ONLY. Every caller draws the sentence exactly as it was sent when Inspect is on, so
 * nothing is destroyed and nothing becomes unreachable.
 */
export function periodsInWords(said: string): string {
  return said.replace(/(?<![\d-])\d{4}-(?:W\d{2}|\d{2})(?![\d-])/g, (key) =>
    parsePeriod(key) === null ? key : periodSaid(key, null).name,
  )
}

function nameOf(p: Period, period: string, today: TodayKeys | null, when: PeriodSaid['when']): string {
  const here = today === null ? null : today[p.horizon]
  if (when === 'now') return p.horizon === 'day' ? t('schedule.today') : p.horizon === 'week' ? t('schedule.thisWeek') : t('schedule.thisMonth')
  if (here !== null) {
    if (period === shift(here, 1)) return p.horizon === 'day' ? t('schedule.tomorrow') : p.horizon === 'week' ? t('schedule.nextWeek') : t('schedule.nextMonth')
    if (period === shift(here, -1)) return p.horizon === 'day' ? t('schedule.yesterday') : p.horizon === 'week' ? t('schedule.lastWeek') : t('schedule.lastMonth')
  }
  const from = dateOf(p.from)
  if (p.horizon === 'day') return writtenDay(from, A_DAY)
  if (p.horizon === 'week') return t('schedule.weekOf', { date: writtenDay(from, { day: 'numeric', month: 'long' }) })
  return writtenDay(from, { month: 'long', year: 'numeric' })
}

/**
 * ONE DAY ON THE SCHEDULE, with its weekday: "Sat 3 October", "10 月 3 日周六". Every day the Schedule writes
 * in words comes from the office's one day formatter, `writtenDay` in src/shared/i18n.ts (wave 13q's round 28).
 */
const A_DAY: DayParts = { weekday: 'short', day: 'numeric', month: 'long' }

/** The days a period covers, in words. The month and the year are written once when both ends share them. */
function rangeOf(p: Period): string {
  const from = dateOf(p.from)
  const to = dateOf(p.to)
  if (p.horizon === 'day') return writtenDay(from, { ...A_DAY, year: 'numeric' })
  return writtenDayRange(from, to, { day: 'numeric', month: 'long', year: 'numeric' })
}

/** The style block. Every component below renders it, so no surface can appear without its CSS. */
function PlanningStyle() {
  return (
    <style href="mole-office-planning" precedence="default">
      {PLANNING_CSS}
    </style>
  )
}

/**
 * ONE SECTION OF THE SCHEDULE: A HEADING, WHAT IT COUNTS AT THE RIGHT, AND ITS CONTENT. NO BOX.
 *
 * Every part of this page was a `Panel`, which draws a box, and the blocks on the board and the note
 * about parts planned inside work are boxes of their own, so they were boxes inside boxes. Rule R10
 * of report n9Mjk3c_sJRu, which a decision adopted, says a section is not a box, and a box never
 * holds a box. So a section here is a heading in the section style over a
 * full-width line, and the rows under it are split by thin lines.
 *
 * It keeps what a Panel gave the page: the heading is marked as a label, the section declares the
 * part of the screen it is, and that heading is the name a person pointing at it gets.
 */
export function PlanSection({
  declares,
  title,
  kind: inspectWord,
  actions,
  children,
}: {
  declares: Declares
  title: string
  /** Inspect's word for what the section is, drawn small beside the heading. */
  kind?: string
  /** What sits at the right of the heading: a count, a link, one press. */
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="px-pl-section" {...declaredAttributes(declares)}>
      <PlanningStyle />
      <header className="px-pl-section-head">
        <h2
          className="px-pl-section-title"
          data-title-is="its-label"
          {...(declaresSomething(declares) ? DRAWS_THE_NAME : {})}
        >
          {title}
        </h2>
        {inspectWord === undefined ? null : <span className="px-pl-section-kind">{inspectWord}</span>}
        {actions === undefined ? null : <div className="px-pl-section-acts">{actions}</div>}
      </header>
      {children}
    </section>
  )
}

/**
 * A panel eyebrow, which is Mole Office's own ontology printed above a heading — TIME AGAINST WORK,
 * SCHEDULED AGAINST UNSCHEDULED, OFFERED NOT WRITTEN. It says nothing a reader needs in order to
 * decide anything, so it is Inspect's, per the UX contract's list.
 */
function useEyebrow(word: string): string | undefined {
  return useInspect() ? word : undefined
}

function scheduleProjectName(rows: readonly ProjectRow[] | null, id: string, inspect: boolean): string {
  return rows?.find(row => row.id === id)?.title ?? (inspect ? id : t('schedule.unknownProject'))
}

function useWindowOwnerWords(): (owner: WindowOwner) => string {
  const inspect = useInspect()
  const [people] = useProjectAsync(readParticipantsOnce, [])
  return owner => {
    if (inspect) return owner.word
    const rows = people.status === 'ready' ? owner.kind === 'agent' ? people.value.agents : owner.kind === 'person' ? people.value.people : [] : []
    const exact = rows.find(person => person.id === owner.id)
    const handles = owner.kind === 'agent' ? rows.filter(person => person.handle === owner.id) : []
    const named = exact ?? (handles.length === 1 ? handles[0] : undefined)
    if (named !== undefined) return t('schedule.namedWindow', { name: named.name })
    return t(owner.kind === 'agent' ? 'schedule.agentWindow' : owner.kind === 'person' ? 'schedule.personWindow' : 'schedule.unknownOwner')
  }
}

// ============================================================================ naming the work

/**
 * HOW A PLAN NAMES THE WORK IT POINTS AT. One renderer, used by every row on this page.
 *
 * It exists because the plan row, the review row, the carry row and the search result all name the
 * same thing and would otherwise be four opinions about it — and the one that matters most is the
 * project. A plan legitimately spans several, so a row that did not say which project owns it would
 * turn a person's week into a merge of four of them.
 *
 * `work === null` is drawn rather than dropped: an allocation pointing at a record that has since
 * gone is a fact about the plan, and a week that quietly lost two hours would be worse than one
 * that says so.
 *
 * THE ID IS DEVELOPER MODE'S AND NOT NORMAL MODE'S. This row printed a nanoid in brackets to
 * everybody — "the record this named is gone (PiQzVdq42ufa)" — and docs/UX-CONTRACT.md puts
 * record ids in Developer mode by name. A reader in Normal mode can do nothing with the id, and the
 * fact they CAN act on is the sentence, which is unchanged in both modes. Conditionally rendered
 * rather than hidden with CSS, so a screen reader does not read out an id no screen shows.
 */
export function WorkIdent({
  work,
  recordId,
  struck,
  quiet,
}: {
  work: AllocatedWork | null
  recordId: string
  /** Draw the name as finished. The SLICE is finished; see the caller for what that does not mean. */
  struck?: boolean
  /**
   * Leave off the labels a SCHEDULED item does not need. The owner, 17 August 2026: the work row
   * carried too much — name, type, todo, estimate, the no-hours-yet text, not yet, done or didn't
   * happen, and more.
   *
   * WHAT GOES AND WHAT STAYS. The kind moves to Developer mode, where every other stored word of
   * Mole Office's own vocabulary already lives. The record's state word goes too — with one exception
   * that is the whole point of keeping any of it: **a state that says the work STOPPED SHORT stays
   * in both modes**, because blocked and failed are the two words on a schedule somebody has to act
   * on. Finished is not printed as a chip either, because the row draws a finished piece of work as
   * finished and the Done press beside it says so in a word.
   *
   * THE PROJECT NEVER GOES, in either mode. A plan legitimately spans several, so the project is
   * the difference between a person's week and a merge of four of them.
   *
   * A ROW THAT IS FINDING WORK KEEPS ALL OF IT. This is off by default: the panel that offers work
   * to add is a list somebody is CHOOSING from, and there the kind and the state are how you tell
   * two candidates apart.
   */
  quiet?: boolean
}) {
  const inspect = useInspect()
  // Every project, read once for the whole browser. See `nameOfProject` on the row below.
  const projects = useProjects()
  const stoppedShort = work !== null && progressOf(work.state) === 'stopped_short'
  return (
    <div className="px-pl-ident">
      <PlanningStyle />
      {work === null ? (
        <span className="px-pl-gone">{t('schedule.gone')}{inspect ? ` (${recordId})` : ''}</span>
      ) : (
        <RouteLink
          to={recordPath(work.id)}
          className={struck === true ? 'px-pl-title px-pl-struck' : 'px-pl-title'}
        >
          {/* The block's own name, with its pipeline beside it rather than in front of it. Three
              blocks of one pipeline in one week were three identical-looking rows until this. */}
          {work.name}
          {work.within === null ? null : <span className="px-pl-within">{t('schedule.within', { name: work.within })}</span>}
        </RouteLink>
      )}
      {work === null ? null : (
        <span className="px-pl-meta">
          {/* Project names arrive through the shared list; missing names keep a label in normal mode. */}
          <Tag tone="quiet">{scheduleProjectName(projects, work.workspaceId, inspect)}</Tag>
          {quiet === true && !inspect ? null : <Tag kind={work.kind} />}
          {/* THE RECORD'S STATE IN THE PRODUCT'S CHIP, not as a quiet tag. A tag is what this page
              draws a project and a kind with, so a state word beside them read as a third label of
              the same sort, and the same word was a chip on every other page. */}
          {work.state === null || (quiet === true && !inspect && !stoppedShort) ? null : (
            <StoredState state={work.state} source={work.stateSource} progress={progressOf(work.state)} kind={work.kind} />
          )}
          {/* NOT IN CAPITALS. docs/UX-CONTRACT.md reserves capitals for chrome — field labels,
              the appearance controls, the sidebar's family headings — and this is content. */}
          {work.deleted ? <Tag tone="warn">{t('schedule.Deleted')}</Tag> : null}
          {/* THE PRODUCT'S OWN MARK, WITH THE PRODUCT'S OWN WORD. This drew a tag reading FIXTURE,
              which is the stored value and not what anything else on screen calls it: the plan
              table, the work page and the record page all say "Made-up example". Two words for one
              idea, and the one this page used is the one only a programmer decodes.

              THE GATE STAYS. `GET /api/work` does not send an origin, so a row in the panel that
              offers work has `origin: null` — which means "this reading carries no origin", not
              "nobody recorded one". Drawing the mark for every reading would put "Origin not
              recorded" on rows about which nothing of the sort is known. The plan's own reply does
              carry the origin, so the mark appears the moment the work is on the period. */}
          {work.origin === 'fixture' ? <OriginMark record={{ origin: work.origin }} /> : null}
          {work.effortHours === null ? null : <span className="px-pl-est">{t('schedule.estimate', { n: work.effortHours })}</span>}
        </span>
      )}
    </div>
  )
}

/** One number and what it counts. The label is the whole explanation; there is no second one. */
function Fact({ n, label, tone }: { n: React.ReactNode; label: string; tone?: 'over' | 'unknown' }) {
  return (
    <div className={tone === undefined ? 'px-pl-fact' : `px-pl-fact px-pl-${tone}`}>
      <span className="px-pl-n">{n}</span>
      <span className="px-pl-l">{label}</span>
    </div>
  )
}

/**
 * WHAT BECAME OF A PERIOD, in numbers. The same strip for a week and for a month.
 *
 * THE THIRD NUMBER IS THE POINT. "Left as planned" is neither finished nor dropped: it is time
 * that was intended and nobody ever said what happened to it, which is the commonest outcome and
 * the one a review counting only successes and cancellations would lose entirely.
 *
 * Two absences are drawn as absences rather than as zeros. No capacity means nobody has said what
 * the period held. No recorded actual hours means planned-against-actual has no answer — not that
 * nothing was spent.
 */
function ReviewFacts({ review }: { review: ReviewReply }) {
  const { counts, load, capacity } = review
  const unstated = load.allocations - load.stated
  return (
    <>
      <div className="px-pl-facts">
        <Fact n={String(counts.done)} label={t('schedule.finished')} />
        <Fact n={String(counts.dropped)} label={t('schedule.dropped')} />
        {/* THE WORDS `docs/UX-CONTRACT.md` ASKS FOR. It read "left as planned — nobody said what
            became of these", which is the mechanism (the row is still at `planned`) followed by an
            apology for it. What it is to a reader is that nobody said what happened. */}
        <Fact
          n={String(counts.unfinished)}
          label={t('schedule.outcomeUnknown')}
          tone={counts.unfinished > 0 ? 'unknown' : undefined}
        />
        <Fact n={String(counts.carried)} label={t('schedule.workUnfinished')} />
        <Fact n={t('schedule.hours', { n: load.plannedHours })} label={t('schedule.planned')} />
        {/* ONE LABEL, BECAUSE BOTH BRANCHES OF THE OLD CONDITION WERE THE SAME STRING. It read
            `unstated === 1 ? 'with no hours' : 'with no hours'`, which is a plural rule somebody
            started and did not finish, and no reader could ever have seen a difference. */}
        {unstated > 0 ? <Fact n={String(unstated)} label={t('schedule.withNoHours')} tone="unknown" /> : null}
        <Fact
          n={counts.actualStated === 0 ? <Absence title={t('schedule.noSpent')} /> : t('schedule.hours', { n: load.actualHours })}
          label={
            counts.actualStated === 0
              ? t('schedule.spentLabel')
              : t('schedule.spentCount', { stated: counts.actualStated, all: counts.allocations })
          }
          tone={counts.actualStated === 0 ? 'unknown' : undefined}
        />
        <Fact
          n={capacity === null ? <Absence title={t('schedule.noPastCapacity')} /> : t('schedule.hours', { n: capacity.hours })}
          label={t('schedule.capacityHeld')}
          tone={capacity === null ? 'unknown' : undefined}
        />
      </div>
      {/* THE SAME NOTE THE PERIOD'S OWN PAGE CARRIES. A review of a week whose parts came to more
          than the work holding them is the least correctable version of that: the period has gone
          and nobody can go back and change either number. */}
      <PartsInsideNote load={load} unit={review.horizon} />
    </>
  )
}

// ============================================================================ work planned inside work

/**
 * WHAT THIS PERIOD HAS PLANNED AT TWO LEVELS: a piece of work with hours, and parts of it with
 * hours too.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS SAID UNTIL 16 AUGUST 2026, AND WHY IT WAS WRONG FROM THAT DAY
 * ---------------------------------------------------------------------------------------
 *
 * It drew "Some of these hours are one piece of work counted twice. The total beside this adds both
 * rows, and nothing has been taken away." That was true while a piece of work and its parts could
 * not both hold hours in one period: the pair could only arrive by a back door, and the total really
 * did add both rows.
 *
 * Round five removed that rule, because the owner plans coarse first and refines later — 15 hours on
 * a large piece of work this week, then 5 on one part and 4 on another. So the pair is ordinary
 * planning now, and the total counts the piece of work once: 15 hours, never 24. Left as it was,
 * this told the owner their own way of planning was a double count and then misstated the arithmetic
 * standing beside it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DRAWS NOW
 * ---------------------------------------------------------------------------------------
 *
 * For each piece of work with parts planned inside it: the hours it has here, how many of them are
 * planned on named parts, and how many are not yet broken down. That is a fact about the plan rather
 * than a warning, so it is drawn quietly.
 *
 * ONE THING HERE IS A REAL CONFLICT AND IS SAID PLAINLY: parts that add up to more than the work
 * they are inside. Both numbers cannot be right, the period costs the larger one, and a person has
 * to change one of them. That row is drawn as a conflict and the others are not.
 *
 * AND THE CONFLICT IS THE FIRST LINE IN THE BOX, IN THE HEAVIEST TYPE ON IT, WITH THE PRESS THAT
 * FIXES IT. It used to be a sentence four lines down a quiet grey box, at the same size and in the
 * same ink as the ordinary facts around it, saying "change the hours on the work or on its parts"
 * with nothing to press — which is a conflict stated rather than a conflict a person can act on.
 * While the period is being read the hours are text and the boxes are behind Edit, so the press
 * goes there. While it is being edited the boxes are already on the rows below and there is no
 * press, because a press leading to where the reader is standing is the fake affordance the UX
 * contract forbids.
 *
 * IT STILL TELLS "NOBODY LOOKED" FROM "NOTHING TO SAY". `countedTwice: null` means no caller read
 * what contains what, and the total beside it is then the plain sum of every row — which does count
 * a piece of work and its parts twice. A reading with no tree in it draws nothing at all: the
 * ordinary period must stay quiet, or the note stops being read by the time it matters.
 */
function PartsInsideNote({
  load,
  unit,
  period,
  editing,
}: {
  load: Load
  unit: string
  /**
   * The period this note is about, so a conflict can offer the way to the hours that make it.
   *
   * Left out on a review of a period that has already gone: nobody can go back and change either
   * number there, so a press offering to would be a fake affordance.
   */
  period?: string
  /** True when the hours boxes are already on the rows below, so no press is needed to reach them. */
  editing?: boolean
}) {
  const inspect = useInspect()
  if (load.envelopes === null) {
    return (
      <p className="px-pl-inside">
        {t('schedule.containmentUnknown', { unit: unitWord(unit) })}
      </p>
    )
  }
  const { trees, couldNotPlace } = load.envelopes
  if (trees.length === 0 && couldNotPlace.length === 0) return null
  const conflicted = trees.some((tree) => hasOverAssigned(tree))
  return (
    <div className="px-pl-inside" data-conflict={conflicted ? 'yes' : undefined}>
      <PlanningStyle />
      {/* THE ONE THING IN THIS BOX SOMEBODY HAS TO ACT ON, at the top of it and in the heaviest type
          on it. Everything else here is a fact about an ordinary plan and is drawn quietly, so a
          conflict left at the same weight as the rest was a sentence four lines into a grey box.
          The press is what makes it actionable: while the period is being read the hours are text,
          and the boxes that change them are behind Edit. While it is being edited they are already
          on the rows below and a press to reach them would lead where the reader is standing. */}
      {conflicted ? (
        <p className="px-pl-inside-clash">
          <strong>{t('schedule.partsConflict')}</strong>{' '}
          {editing === true || period === undefined ? null : (
            <EditThisPeriod period={period} label={t('schedule.changeHours')} />
          )}
        </p>
      ) : null}
      {trees.length === 0 ? null : (
        <>
          <p className="px-pl-inside-lede">
            {t('schedule.twoLevels', { unit: unitWord(unit), total: load.plannedHours, rows: load.rowHours })}
          </p>
          <ul className="px-pl-inside-list">
            {trees.map((tree) => (
              <WorkWithPartsInside key={tree.recordId} node={tree} unit={unit} />
            ))}
          </ul>
        </>
      )}
      {couldNotPlace.length === 0 ? null : (
        <>
          <p className="px-pl-inside-lede">
            {t('schedule.unplacedParts', { n: couldNotPlace.length })}
          </p>
          <ul className="px-pl-inside-list">
            {couldNotPlace.map((row) => (
              <li key={row.recordId}>
                “{row.title}”: {inspect ? row.why : t('schedule.parentUnread')}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/** Does this piece of work, or anything inside it, hold more on its parts than on itself? */
function hasOverAssigned(node: EnvelopeNode): boolean {
  return node.overAssignedByHours !== null || node.inside.some(hasOverAssigned)
}

/**
 * One piece of work in the tree, with whatever is planned inside it under it.
 *
 * FOUR SENTENCES, ONE PER SHAPE THE ARITHMETIC CAN BE IN, and none of them works a number out for
 * itself: the hours, what is assigned, what is left and what this costs the period all come from
 * `envelopesOf` in shared/planning.ts. A second arithmetic here could disagree with the total drawn
 * a line above it.
 */
function WorkWithPartsInside({ node, unit }: { node: EnvelopeNode; unit: string }) {
  return (
    <li data-conflict={node.overAssignedByHours === null ? undefined : 'yes'}>
      “{node.title}” {partsSentence(node, unit)}
      {node.inside.length === 0 ? null : (
        <ul className="px-pl-inside-list">
          {node.inside.map((part) => (
            <WorkWithPartsInside key={part.recordId} node={part} unit={unit} />
          ))}
        </ul>
      )}
    </li>
  )
}

/** What one piece of work in the tree has, in a sentence. */
function partsSentence(node: EnvelopeNode, unit: string): string {
  if (node.inside.length === 0) return node.hours === null
    ? t('schedule.partsNoHours') : t('schedule.partsHours', { hours: node.hours })
  const values = { unit: unitWord(unit), hours: node.hours ?? 0, assigned: node.assignedHours,
    extra: node.overAssignedByHours ?? 0, total: node.contributesHours, left: node.notYetBrokenDownHours ?? 0 }
  if (node.hours === null) return t('schedule.partsOnly', values)
  if (node.overAssignedByHours !== null) return t('schedule.partsOver', values)
  return t(node.notYetBrokenDownHours === null ? 'schedule.partsAssigned' : 'schedule.partsLeft', values)
}

// ============================================================================ how full it is

/**
 * HOW FULL THIS PERIOD IS, AS A BAR.
 *
 * It replaces three enormous numbers with the shape of the answer, and it is drawn only when
 * somebody has said how many hours the period holds — an empty bar for an unknown capacity would be
 * a picture of a week that fits, which is the one thing nobody knows.
 *
 * THE HATCHING IS THE HONEST PART. Allocations that gave no number are real commitments with no
 * size, so what is left is not solidly free: the remainder is drawn hatched while any of them
 * exist, and the reading beside it says "at most", because the total is a floor and the free figure
 * is a ceiling. Every band is also stated in words underneath, so nothing here is carried by colour.
 */
function CapacityBar({
  plannedHours,
  capacityHours,
  freeHours,
  overcommitted,
  unstated,
  subject,
}: {
  plannedHours: number
  capacityHours: number
  freeHours: number | null
  overcommitted: boolean | null
  unstated: number
  /**
   * What this total counts, in words: "this week", or "on the week itself" when days inside it hold
   * hours of their own. Written by `ownTotalCalled` and never by this component — the caller is the
   * one that knows whether anything is inside the period.
   */
  subject: string
}) {
  const scale = Math.max(capacityHours, plannedHours, 1)
  const within = Math.min(plannedHours, capacityHours)
  const fill = (within / scale) * 100
  const over = (Math.max(0, plannedHours - capacityHours) / scale) * 100
  const rest = Math.max(0, 100 - fill - over)
  const overBy = Math.round((plannedHours - capacityHours) * 100) / 100

  return (
    <div className="px-pl-gauge">
      <PlanningStyle />
      {/* THREE ENDINGS, THREE DIFFERENT NEXT ACTS, AND ONLY ONE OF THEM TAKES A HUE. Over is a
          fault and keeps the alarm ink it always had, on the line with the number it is about.
          Room left is the figure a person is reading for — it says "you may still commit
          something" — so it carries the accent, with the word "left" beside it, on the line under
          the bar. Nothing left is neither: it is the word "full", in the ordinary ink, because a
          full week is not a fault. */}
      <p className="px-pl-read">
        <strong className="px-pl-big">{t('schedule.hours', { n: plannedHours })}</strong>{' '}
        {t('schedule.plannedOf', { n: capacityHours, subject })}
        {overcommitted === true ? (
          <span className="px-pl-overword">{t('schedule.overBy', { n: Math.abs(overBy) })}</span>
        ) : null}
      </p>
      {/* THE BAR COMES UNDER THE NUMBER IT DRAWS. The number is what a person reads first. */}
      <div
        className="px-pl-meter"
        role="img"
        aria-label={t('schedule.barLabel', { planned: plannedHours, capacity: capacityHours, subject })}
      >
        <span className="px-pl-fill" style={{ width: `${fill}%` }} />
        {over > 0 ? <span className="px-pl-overfill" style={{ width: `${over}%` }} /> : null}
        {rest > 0 ? (
          <span className={unstated > 0 ? 'px-pl-rest px-pl-hatch' : 'px-pl-rest'} style={{ width: `${rest}%` }} />
        ) : null}
      </div>
      {overcommitted === true && unstated === 0 ? null : (
        <p className="px-pl-read px-pl-after">
          {overcommitted === true ? null : (freeHours ?? 0) > 0 ? (
            <><strong className="px-pl-free">{t('schedule.hours', { n: freeHours! })}</strong>{' '}{t('schedule.left')}</>
          ) : (
            <><strong>{t('schedule.full')}</strong>{t('schedule.zeroLeft')}</>
          )}
          {unstated > 0 ? (
            // NOT "a floor" AND NOT "the hatching". A floor is a term of art, and naming a visual
            // texture in prose is the drawing failing to explain itself with a sentence stepping in.
            // The hatched bar can be read without being narrated. Finding 25, 19 August 2026.
            <span className="px-pl-hint">
              {' '}
              {t('schedule.unstatedTotal', { n: unstated })}
            </span>
          ) : null}
        </p>
      )}
    </div>
  )
}

/**
 * HOW MANY HOURS THIS PERIOD HOLDS, SAID IN ONE FIELD.
 *
 * It was four unlabelled widgets in a row — a sentence, an hours box, a note box clipped to six
 * characters, a save and a destructive clear called "nobody has said" — and an independent reviewer
 * read the clipped note as a button. So: one inline field with its unit, the purpose on its own
 * full-width line under it, and taking the answer back moved into a menu where it cannot be pressed
 * by mistake.
 *
 * TAKING IT BACK IS STILL REACHABLE, and that is the whole doctrine of this field: absent is a real
 * answer, it is not zero, and it was once the one answer a person could not get back to. Emptying
 * the box does it too, because that is what emptying a box means.
 */
function CapacityLine({
  horizon,
  period,
  capacity,
  unit,
  onWrote,
}: {
  horizon: Grain
  period: string
  capacity: Capacity | null
  unit: string
  onWrote: () => void
}) {
  const [open, setOpen] = useState(false)
  const [hours, setHours] = useState(capacity === null ? '' : String(capacity.hours))
  const [note, setNote] = useState(capacity?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  // WHAT MOLE OFFICE MAKES OF THE BOX AS IT IS TYPED IN. See the note in HoursCell: derived, never
  // remembered, so it is on the screen while there is still a typo to fix.
  const said = hoursReadingSaid(hours)

  const write = async (run: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    setFailed(null)
    try {
      await run()
      onWrote()
    } catch (err) {
      setFailed(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const commitHours = (): void => {
    const text = hours.trim()
    const read = readHoursBox(text)
    if (read.said === 'nothing') {
      // Emptying the box is taking the answer back, which is the same act as the menu item below.
      // Not a write when there was nothing there: absent to absent is no change.
      if (capacity !== null) void write(() => api.clearCapacity(horizon, period))
      return
    }
    if (read.said === 'words') {
      setFailed(t('schedule.nothingWritten', { why: read.why }))
      return
    }
    if (capacity !== null && read.hours === capacity.hours) return
    setFailed(null)
    // The box then holds the number that was written, because that is what is stored.
    if (text !== String(read.hours)) setHours(String(read.hours))
    void write(() => api.setCapacity(horizon, period, read.hours, note.trim() === '' ? null : note.trim()))
  }

  if (capacity === null && !open) {
    return (
      <div className="px-pl-capline">
        <PlanningStyle />
        {/* THE SENTENCE STAYS WHERE THE ANSWER IS TYPED. This is the one place on the page a
            person can answer it, so the question is worth its own words here; every place that
            only REPORTS the absence draws the quiet mark instead. Same writer, both times. */}
        <Absence title={hoursNotSaid(t('schedule.thisUnit', { unit: unitWord(unit) }))} />
        <Btn size="sm" variant="primary" onClick={() => setOpen(true)}>
          {t('schedule.setCapacity', { unit: unitWord(unit) })}
        </Btn>
        {failed === null ? null : <span className="px-pl-failed">{failed}</span>}
      </div>
    )
  }

  return (
    <div className="px-pl-capline">
      <PlanningStyle />
      <label className="px-pl-caplab">
        <span className="px-pl-capword">
          {t('schedule.capacityLabel', { unit: unitWord(unit).replace(/^./, (letter) => letter.toUpperCase()) })}
        </span>
        <span className="px-pl-capbox">
          <input
            className="px-pl-caph"
            type="text"
            /* NO DECIMAL KEYPAD, because the box reads words as well as numbers. */
            value={hours}
            disabled={busy}
            placeholder="—"
            onChange={(e) => setHours(e.target.value)}
            onBlur={commitHours}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitHours()
            }}
          />
          <span className="px-pl-unit">{t('schedule.hourUnit')}</span>
        </span>
      </label>
      {capacity === null ? null : (
        <details className="px-pl-menu">
          <summary aria-label={t('schedule.moreCapacity', { unit: unitWord(unit) })}>⋯</summary>
          <div className="px-pl-menu-body">
            <Btn
              size="sm"
              variant="ghost"
              disabled={busy}
              reason={t('schedule.busy')}
              onClick={() => {
                setHours('')
                setNote('')
                void write(() => api.clearCapacity(horizon, period))
              }}
            >{t('schedule.notDecided')}</Btn>
          </div>
        </details>
      )}
      {capacity === null ? null : (
        <label className="px-pl-purpose">
          <span className="px-pl-hint">{t('schedule.optional', { label: capacityNoteCalled(unit) })}</span>
          <TextInput
            value={note}
            onChange={setNote}
            placeholder={t('schedule.capacityExample')}
            aria-label={t('schedule.capacityNoteInput', { unit: unitWord(unit) })}
          />
          {note === (capacity.note ?? '') ? null : (
            <Btn
              size="sm"
              disabled={busy}
              reason={t('schedule.busy')}
              pending={busy}
              onClick={() => {
                void write(() =>
                  api.setCapacity(horizon, period, capacity.hours, note.trim() === '' ? null : note.trim()),
                )
              }}
            >{t('schedule.save')}</Btn>
          )}
        </label>
      )}
      {failed === null ? null : <span className="px-pl-failed">{failed}</span>}
      {said === null ? null : (
        <span className="px-pl-hint" aria-live="polite">
          {said}
        </span>
      )}
    </div>
  )
}

/**
 * NOBODY HAS SAID HOW MANY HOURS THIS PERIOD HOLDS, said as a label and a quiet mark.
 *
 * It was this sentence, whole, on a page that is mostly quiet facts — and it is the owner's own
 * example of an absence paying sentence weight for something a reader does nothing about here.
 * There is no capacity field while a period is being read, so the sentence had no answer beside it
 * to be a question about.
 *
 * IT IS THE TOLD-APART TIER AND NOT THE QUIET DASH. Nobody has said is not the same fact as zero
 * hours, and a period drawn as "0h free" off a capacity nobody set reports an empty week as a full
 * one. The dashed mark says nobody has said, the label names what is missing, and the sentence
 * survives on the mark — read out to a screen reader and on the tooltip. Home draws this same fact
 * the same way, from the same writer.
 */
function NoCapacitySaid({ period }: { period: string }) {
  return (
    <p className="px-pl-holds">
      <PlanningStyle />
      {t('schedule.hoursIn', { period })}{' '}<Absence tier="told-apart" looked={false} word={t('schedule.notSet')} title={hoursNotSaid(period)} />
    </p>
  )
}

/**
 * NOBODY HAS SAID HOW MANY HOURS A PERIOD HOLDS, WRITTEN ONCE.
 *
 * Three surfaces say it: the capacity field on a period being planned, the quiet mark on one being
 * read, and Home's day band. It was typed out in all three, so a change to the wording reached one
 * of them and left the other two saying something slightly different about the same absence.
 *
 * IT TAKES THE PERIOD AS THE READER SAYS IT — "today", "this week", "this month" — and not a unit,
 * because Home's columns are today and this week and the schedule's are this week and this day.
 * A writer that took a unit would make Home build the phrase itself, which is the same fact worked
 * out in two places wearing a smaller costume.
 */
export function hoursNotSaid(period: string): string {
  return t('schedule.capacityUnknown', { period })
}

/**
 * WHAT THE CAPACITY NOTE IS CALLED, IN ONE PLACE.
 *
 * The field that writes it and every line that reads it back use this, so the question a person is
 * answering and the question the answer is printed under cannot drift apart.
 *
 * IT NAMES THE HOURS IT IS ABOUT. It said "these hours", on a card whose line above reads "40h
 * planned of 10h this week" — two sets of hours, and "these" pointed at the nearer one, which is the
 * wrong one. The note belongs to the hours the period HOLDS.
 */
function capacityNoteCalled(unit: string): string {
  return t('schedule.capacityNoteLabel', { unit: unitWord(unit) })
}

/**
 * What somebody said those hours are for, when they said. Nothing at all when they did not.
 *
 * A LABEL AND THE WORDS, NOT A SENTENCE BUILT AROUND THEM. This read "These hours are for {note}."
 * and the note on the live corpus is "do something", so the page said "These hours are for do
 * something." — broken English out of a perfectly good note that a person typed.
 *
 * A template that puts somebody's words in the middle of its own sentence has to guess what shape
 * those words are, and it cannot. "development" fits and "do something" does not, and both are
 * things a person would reasonably write. So the label ends and the person's words begin, and any
 * note reads correctly: a noun, a phrase, or a whole sentence.
 *
 * THE SAME SENTENCE WAS ONCE WRITTEN OUT TWICE. A second week-building screen said "You have 10
 * hours this week for do something." until 2026-08-14, so the fix above reached one of the two
 * places. That screen is gone and this component is the only one that writes the sentence.
 */
function CapacityFor({ capacity, unit }: { capacity: Capacity | null; unit: string }) {
  if (capacity === null || capacity.note === null) return null
  return (
    <p className="px-pl-hint">
      {capacityNoteCalled(unit)}: {capacity.note}
    </p>
  )
}

/**
 * THE WAY INTO EDITING, FROM WHERE THE MISSING CONTROL WOULD HAVE BEEN.
 *
 * A press, so it is allowed while reading, and it goes to this period's editing address rather than
 * flipping a switch this component holds — the state is in the address, so Back leaves editing.
 */
function EditThisPeriod({ period, label }: { period: string; label: string }) {
  return (
    <RouteLink to={editingAddress(planPeriodPath(period))} className="px-pl-step">
      {label}
    </RouteLink>
  )
}

// ============================================================================ nothing is here yet

/**
 * NOTHING IS ON THIS PERIOD: a dash and the press that fixes it, or the sentence in words.
 *
 * ---------------------------------------------------------------------------------------
 * WHY MOST OF THESE ARE A DASH, AND WHY THE WEEK BOARD IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * An empty period is ordinary. Where a press sits beside the dash, the press is the whole of what
 * the reader came to do, so there is nothing for them to work out. That is `design/ROUND-FOUR.md`'s
 * test — does the reader have to do something ABOUT this absence — and the answer there is no, so
 * the sentence goes and the press stays.
 *
 * THE WEEK BOARD HAS NO PRESS BESIDE IT, so a dash there taught a reader nothing: the sentence was
 * only on a tooltip and in screen-reader text. It passes `said` and the sentence is drawn in words,
 * in the same dimmed ink as the dash. It is still the quiet tier: no box and no second weight.
 *
 * Where it is a dash, THE SENTENCE IS NOT DELETED. It is on the mark, which reads it out to a screen
 * reader and shows it on the tooltip. Quietening an absence is not the same act as deleting one, and
 * the tier below this one does not exist: a blank cell is what the fifth invariant forbids.
 */
function NothingOn({ sentence, action, said }: { sentence: string; action?: React.ReactNode; said?: boolean }) {
  return (
    <p className="px-pl-none">
      <PlanningStyle />
      {said === true ? <span className="px-pl-nonesaid">{sentence}</span> : <Absence title={sentence} />}
      {action}
    </p>
  )
}

/**
 * "No hours are on this week yet", for whichever period is on screen. ONE WRITER.
 *
 * Three periods said it in three places and the day's copy had lost the word "yet". It is one fact
 * about one period, so it is one clause with the period's own name in it.
 *
 * ---------------------------------------------------------------------------------------
 * IT USED TO SAY "NOTHING IS ON THIS WEEK YET" AND THAT WAS FALSE ON A WEEK WITH A BLOCK ON IT
 * ---------------------------------------------------------------------------------------
 *
 * Measured on `#/plan/2026-W35` on 18 August 2026, on one screen: the board drew one block, `Mon 24
 * – Thu 27 August, 4 days`, and this sentence said nothing was on that week. A tester said it was
 * the defect that would stop them trusting the numbers.
 *
 * **A window carries no hours by design** — an estimate, a window, an allocation and a deadline are
 * four different facts, and the head of this file says so. So "0h planned this week" was true. The
 * false one was this: it counts ALLOCATIONS and it claimed the whole week.
 *
 * SO IT NOW SAYS WHAT IT COUNTS, WHICH IS HOURS. Every caller of this is a panel of hours, and none
 * of them can see the board at all. A sentence about a block belongs where the blocks are counted,
 * which is `BlocksGiveNoHours` below, drawn in the panel where the hours are.
 */
function noHoursOn(name: string): string {
  return t('schedule.noHoursOn', { period: name })
}

/** The same clause as a whole sentence, which is what every panel of hours wants. */
function noHoursOnYet(name: string): string {
  return `${noHoursOn(name)}${endOfSentence()}`
}

/**
 * THE BLOCKS ON THE BOARD GIVE NO HOURS, SAID IN THE PANEL WHERE THE HOURS ARE.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT, MEASURED ON `#/plan/2026-W35` ON 18 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * One screen said all three of these at once:
 *
 *     When work happens this week   1 block, Mon 24 – Thu 27 August, 4 days
 *     Hours on this week            0, and "0h planned this week"
 *                                   "Nothing is on next week yet"
 *
 * A tester said this was the one that would stop them trusting the numbers. Two of the three were
 * true: **a window carries no hours by design**, so a week with a block and no allocation really
 * does hold no hours. The third was false and `noHoursOn` above is where that was fixed.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A TRUE SENTENCE WAS STILL NOT ENOUGH
 * ---------------------------------------------------------------------------------------
 *
 * "0h planned this week" beside a block covering four days is two facts with nothing joining them,
 * and a reader who cannot join them concludes the product is broken. So this says the joining fact
 * where the total is, in one sentence: what the board shows is not hours and this panel counts
 * hours. The board says the same thing about itself in `BOARD_HELP`; a reader who came in at the
 * hours panel never met that line.
 *
 * IT SAYS NOTHING WHILE THE BLOCKS HAVE NOT BEEN READ, and nothing when there are none. There is no
 * defect to explain on a week with no blocks, and a page cannot honestly say how many blocks it has
 * before it knows — see `placedOnTheBoard`.
 */
export function BlocksGiveNoHours({ placed }: { placed: number | null }) {
  if (placed === null || placed === 0) return null
  return (
    <p className="px-pl-hint">
      {t(placed === 1 ? 'schedule.blockNoHours' : 'schedule.blocksNoHours', { n: placed })}
    </p>
  )
}

/**
 * NOTHING IS ON THE PERIOD ITSELF, WHILE THE PERIODS INSIDE IT HOLD SOMETHING.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS SENTENCE EXISTS, AND IT IS A DEFECT THE OWNER FOUND
 * ---------------------------------------------------------------------------------------
 *
 * A week holding a 3h allocation on a day inside it drew "0h planned this week" at the top and
 * "Nothing is on this week yet" below, with "3h is already on the days inside this week" between
 * them. All three were true and two of them read as flat denials of the middle one. Measured by a
 * first-time user on 16 August 2026.
 *
 * The month has said it correctly since 2026-08-14 — "Nothing has been given time by August itself"
 * — because a month with empty weeks is a different fact from a month with nothing in it. A week is
 * the same shape one horizon down, so it takes the same sentence, from this one writer.
 *
 * `noHoursOnYet` above is still the sentence for a period whose finer periods hold nothing either.
 * The two are different facts and are never collapsed: one says no hours are on the period at all,
 * the other says the period's own line is empty and points at where the hours are.
 */
function nothingOnItself(name: string): string {
  return t('schedule.emptyOwnPeriod', { period: name })
}

/**
 * WHAT A PERIOD'S OWN TOTAL COUNTS, IN WORDS. ONE WRITER for the bar and the bare line.
 *
 * "12h planned this week" is a true sentence only while nothing inside the week holds hours. The
 * moment a day inside it does, those words claim to cover the whole week and the page reads as two
 * opposite statements about one week — see `nothingOnItself` above for the measurement. So when
 * something finer holds hours, the total says what it counts: the week itself.
 *
 * Nothing here decides WHETHER anything is inside. That is `insideOf`, which the week and the month
 * both read, and the caller passes its answer in.
 */
function ownTotalCalled(unit: string, holdsFiner: boolean): string {
  return holdsFiner ? t('schedule.onUnitItself', { unit: unitWord(unit) }) : t('schedule.thisUnit', { unit: unitWord(unit) })
}

/**
 * THE HOURS PLANNED ON A PERIOD THAT STATES NO HOURS IT HOLDS, as one sentence: "0h planned this week.",
 * "0 小时已安排 · 这周。". The week, a day and today draw it from here, and its end is the page language's own
 * (`endOfSentence`, wave 13q's round 29); it was a "." typed after the words in three places. The hours and the
 * words after them are joined by the office's spacing rule, so Chinese takes no space between two characters.
 */
function HoursPlannedLine({ hours, period, unstated }: { hours: number; period: string; unstated: number }) {
  const amount = t('schedule.hours', { n: hours })
  const planned = t('schedule.plannedIn', { period })
  return (
    <p className="px-pl-read">
      <strong className="px-pl-big">{amount}</strong>{gapBetween(amount, planned)}{planned}
      {unstated === 0 ? '' : t('schedule.moreUnstated', { n: unstated })}{endOfSentence()}
    </p>
  )
}

/** The press that fills a period, named the same way wherever it appears. */
function addWorkTo(unit: string): string {
  return t('schedule.addWork', { unit: unitWord(unit) })
}

/**
 * WHAT THE HOURS PANEL IS CALLED, ON ALL FOUR PERIODS.
 *
 * IT WAS "What is on it" AND THE PRONOUN WAS THE PROBLEM. "it" meant the period in the heading
 * above, which is not in the panel, so a reader had to work out what "it" was before they could
 * read the panel — and once the board arrived above it, a person could reasonably think "it" meant
 * the board. `docs/UX-CONTRACT.md` says to name a thing for what it is to the reader.
 *
 * WHAT IS IN THIS PANEL IS HOURS: how many the period holds, how many are committed, and which work
 * has them. So that is what it is called, and the period's own name stays in the heading above,
 * where it is not printed twice.
 */
function hoursPanelTitle(said: PeriodSaid): string {
  return t('schedule.hoursTitle', { unit: unitWord(said.unit) })
}

/** What one press in an add panel does, in the period's own words: "add to this week". */
function addTo(said: PeriodSaid): string {
  return t('schedule.addTo', { period: said.name.toLowerCase() })
}

/**
 * Everything a period planned names work that is already finished, so there is nothing to carry.
 *
 * The week's builder and the month's review both say it about their own period. One sentence, and
 * both draw it as ordinary emptiness: the section above it is named for what would have been in it.
 */
function nothingToCarry(period: string): string {
  return t('schedule.nothingToCarryPeriod', { period })
}

// ============================================================================ the rows

/**
 * THE HOURS THIS SLICE IS GIVING, CHANGED WHERE THEY ARE READ.
 *
 * Planning a week means changing these numbers repeatedly, so the number IS the control: type over
 * it and press Enter or move on.
 *
 * IT NOW LOOKS LIKE THE EDITABLE THING. It had no visible label, no column heading and no unit —
 * its only naming was an aria-label — and it sat immediately left of a state dropdown, so "give
 * this three hours" read as "open the dropdown". The unit is drawn inside the control, the column
 * is headed, and the box is filled rather than outlined.
 *
 * EMPTY IS A REAL ANSWER AND IT IS NOT ZERO. Clearing the box writes `null` — somebody committed to
 * this work in this period without saying for how long — which every total then counts as unstated
 * rather than as no time. Writing 0 says something different: no time at all. So the placeholder is
 * an em dash and never a nought.
 *
 * TEXT THAT IS NOT A NUMBER IS REFUSED HERE AND SAYS SO. A `number` input would have swallowed it
 * silently as an empty value, which is the "no hours" answer above and a different fact from a typo.
 *
 * AND A NUMBER THE SERVER REFUSED MARKS THE BOX. This box takes any number — the rules about which
 * numbers are hours live on the server, in one place, and are not restated here — so `-3` leaves
 * here, comes back a 400, and the box goes on showing `-3` as though it were stored. `refused` is
 * what tells the reader that what they are looking at is not what Mole Office kept. The sentence saying
 * why is drawn by the caller directly under this box: a refusal a person has to go looking for is
 * one they will not find.
 */
function HoursField({
  hours,
  busy,
  label,
  refused,
  describedBy,
  onCommit,
}: {
  hours: number | null
  busy: boolean
  label: string
  /** True when the last thing typed here was sent and refused. Marks the box; never clears it. */
  refused?: boolean
  /** The id of the sentence saying why it was refused, so a screen reader reads the two together. */
  describedBy?: string
  onCommit: (next: number | null) => void
}) {
  const [text, setText] = useState(hours === null ? '' : String(hours))
  const [bad, setBad] = useState<string | null>(null)
  // WHAT MOLE OFFICE MAKES OF THE BOX AS IT IS TYPED IN, worked out on every draw rather than remembered.
  // Remembering it would put the sentence on the screen AFTER the write, which is the moment it is
  // least use, and the row is redrawn from the server when the write lands so a remembered one would
  // be wiped anyway.
  const said = hoursReadingSaid(text)

  const commit = (): void => {
    const trimmed = text.trim()
    const read = readHoursBox(trimmed)
    if (read.said === 'nothing') {
      setBad(null)
      // Only when it is a change. Blurring a box nobody touched must not write a change row.
      if (hours !== null) onCommit(null)
      return
    }
    if (read.said === 'words') {
      // NOTHING IS WRITTEN AND THE CHARACTERS STAY IN THE BOX. An allocation carrying no hours is
      // how this product says somebody committed without saying how long, so writing one here would
      // turn a typo into a sentence nobody said.
      setBad(t('schedule.nothingWritten', { why: read.why }))
      return
    }
    setBad(null)
    // The box then holds the number that was written, because that is what is stored.
    if (trimmed !== String(read.hours)) setText(String(read.hours))
    if (read.hours !== hours) onCommit(read.hours)
  }

  return (
    <>
      <span className={refused === true || bad !== null ? 'px-pl-hwrap px-pl-hwrap-refused' : 'px-pl-hwrap'}>
        <input
          className="px-pl-hin"
          type="text"
          /* NO DECIMAL KEYPAD, because the box reads words as well as numbers. */
          value={text}
          disabled={busy}
          placeholder="—"
          aria-label={label}
          aria-invalid={refused === true || bad !== null ? true : undefined}
          {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
          }}
        />
        <span className="px-pl-unit">{t('schedule.hourUnit')}</span>
      </span>
      {bad === null ? null : <span className="px-pl-badh">{bad}</span>}
      {said === null ? null : (
        <span className="px-pl-readh" aria-live="polite">
          {said}
        </span>
      )}
    </>
  )
}

/**
 * The three words an allocation can be at, as presses. Lighter than the hours field beside them.
 *
 * THE STORED WORD AND THE WORD ON SCREEN ARE NOT THE SAME STRING, and this table is the only place
 * they meet. "planned" is what the server stores for an allocation nobody has finished or dropped;
 * "not yet" is what that is to a person looking at last week.
 */
const ALLOCATION_WORDS = [
  { state: 'planned', word: 'schedule.notYet' },
  { state: 'done', word: 'schedule.doneLower' },
  { state: 'dropped', word: 'schedule.didNotHappen' },
] as const

/**
 * HOW IT WENT — one press, and it is allowed while a period is being read.
 *
 * A press records one fact and says what it recorded, so it does not break the reading rule: what
 * that rule forbids is a box or a dropdown, because those can be typed into by accident and can
 * hold half a change. Making "done" cost three presses — enter editing, press done, leave editing —
 * is what would make a person live in editing mode, and then reading is not the default any more.
 *
 * IT HAS ITS OWN COLUMN, AWAY FROM THE HOURS. While reading, the hours beside it are plain text, so
 * this is the only thing on the row that can be pressed and there is nothing to confuse it with.
 */
function HowItWent({
  state,
  busy,
  label,
  onPick,
}: {
  state: string
  busy: boolean
  /**
   * What this group of presses is about, said in words a screen reader gets first.
   *
   * IT NAMES THE HOURS AND NOT THE WORK, wherever a caller passes one. Since 17 August 2026 the row
   * beside this has its own Done press, and that one completes THE WORK. Two completions on one row
   * that did not say which was which would be the worst possible version of §34.
   */
  label: string
  onPick: (next: 'planned' | 'done' | 'dropped') => void
}) {
  return (
    <span className="px-pl-states" role="group" aria-label={label}>
      {ALLOCATION_WORDS.map((s) => (
        <button
          key={s.state}
          type="button"
          className="px-pl-state"
          aria-pressed={state === s.state}
          disabled={busy}
          onClick={() => {
            if (state !== s.state) onPick(s.state)
          }}
        >
          {t(s.word)}
        </button>
      ))}
    </span>
  )
}

/**
 * One allocation: what it gives time to, how much, and how it went.
 *
 * THE SAME ROW BOTH WAYS. While the period is being read the hours are the number, as text; while
 * it is being edited the same number is a box in the same place. Nothing else about the row moves,
 * which is the whole of the reading-and-editing rule in one component: a person learns that a box
 * means "you pressed Edit" and never has to learn anything else.
 *
 * "How it went" is drawn in both, because it is a press. See `HowItWent`.
 *
 * ---------------------------------------------------------------------------------------
 * A REFUSAL IS DRAWN WHERE THE THING THAT WAS REFUSED IS
 * ---------------------------------------------------------------------------------------
 *
 * Every write this row makes can be refused, and until 16 August 2026 all of them said so in one
 * line across the foot of the row — under the work's title, at the far left, up to a thousand pixels
 * from the box that had just been typed into. A tester typed `-3` into the hours box, pressed Tab,
 * read the row's total still saying 4h, and reported that nothing had said no. The sentence was
 * there and it was in the wrong place, which on a wide row is close enough to absent.
 *
 * So a refusal now knows which press it came from. The hours box and the hours-spent box keep
 * theirs directly underneath themselves, with the box marked; everything else — a state press,
 * taking the row off the period — keeps the line at the foot of the row, which is where those
 * controls are. `about` is what carries that, and it is set at the one place a write starts.
 */
function PlanRow({
  entry,
  unit,
  editing,
  spent,
  onWrote,
}: {
  entry: AllocationWithWork
  unit: string
  /** True when the address ends in `/edit`. Reading is what every fresh visit gets. */
  editing: boolean
  /**
   * Draw a field for the hours actually spent. Today only — see `TodayPlan`.
   *
   * IT IS NOT THE EDITING SWITCH AND MUST NOT BE CONFUSED WITH IT. What a period PLANS is changed
   * where planning happens, behind Edit. What was SPENT is a fact about a day that has happened, it
   * is recorded while doing the work, and Today is the surface for doing.
   */
  spent?: boolean
  onWrote: () => void
}) {
  const { allocation, work } = entry
  const [busy, setBusy] = useState(false)
  /** The last refusal, and which control it belongs under. `null` while nothing has been refused. */
  const [failed, setFailed] = useState<{ about: 'hours' | 'spent' | 'row'; message: string } | null>(null)
  /**
   * Whether this row's hours-spent FIELD is on. Off until somebody presses for it.
   *
   * READING IS THE RESTING STATE, AND TODAY IS NO EXCEPTION. Today opens showing what is on it and
   * draws no box at all — `tests/read-before-edit.test.ts` walks the real page and fails if one is
   * there. So recording what you spent is a press that turns a field on for one row, which is the
   * same doctrine as Edit and is per row because the fact is per row.
   */
  const [saying, setSaying] = useState(false)

  const change = async (
    body: Parameters<typeof api.changeAllocation>[1],
    about: 'hours' | 'spent' | 'row',
  ): Promise<void> => {
    setBusy(true)
    setFailed(null)
    try {
      await api.changeAllocation(allocation.id, body)
      onWrote()
    } catch (err) {
      setFailed({ about, message: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  /**
   * A REFUSED WRITE, SAID IN PLAIN WORDS AND THEN IN THE SERVER'S OWN.
   *
   * The plain sentence first, because it is the one a person needs: nothing was written, and the
   * period still gives this work whatever it gave it before. The server's sentence follows it whole,
   * because that sentence is the authority on WHY and shortening it would be this page inventing a
   * reason.
   */
  const refusal = (about: 'hours' | 'spent', kept: number | null, what: string) =>
    failed === null || failed.about !== about ? null : (
      <p className="px-pl-refused" role="status" id={`refused-${about}-${allocation.id}`}>
        <strong>{t('schedule.notSaved')}</strong> {what}{' '}
        {kept === null ? t('schedule.stillNoHours') : t('schedule.stillHours', { n: kept })}{endOfSentence(failed.message)}{failed.message}
      </p>
    )

  return (
    <li className={workIsDone(work) ? 'px-pl-arow px-pl-donerow' : 'px-pl-arow'}>
      {/* ONE RENDERER FOR "WHICH WORK IS THIS", shared with every other row on this page — see
          WorkIdent. Which project owns it is the part that must never go missing: on a page that
          legitimately spans several, it is the difference between a week and a merge. */}
      {/* THE NAME IS STRUCK WHEN THE WORK IS FINISHED, and it used to be struck when the SLICE was.
          Those are two different facts and the row now has a press for each: Done says the work is
          finished, and the row menu says what became of this period's hours. A row struck because
          five of its hours were used up, on work that is still open, was the page telling a person
          the task was over. */}
      <WorkIdent work={work} recordId={allocation.recordId} struck={workIsDone(work)} quiet />

      <div className="px-pl-hours">
        {editing ? (
          <>
            <HoursField
              // Remounted when the stored number changes, so the box shows what the server kept rather
              // than what was typed at it. Typing does not re-render the parent, so nothing is lost.
              key={String(allocation.plannedHours)}
              hours={allocation.plannedHours}
              busy={busy}
              label={t('schedule.workHoursInput', { unit: unitWord(unit), work: work === null ? t('schedule.thisWork') : work.name })}
              refused={failed !== null && failed.about === 'hours'}
              describedBy={
                failed !== null && failed.about === 'hours' ? `refused-hours-${allocation.id}` : undefined
              }
              onCommit={(next) => void change({ plannedHours: next }, 'hours')}
            />
          </>
        ) : allocation.plannedHours === null ? null : (
          // THE SAME NUMBER, AS TEXT, AND NOTHING AT ALL WHEN THERE IS NO NUMBER.
          //
          // It read "no hours yet". Phrases such as no hours yet go when they
          // do not help the person make a decision — and `docs/UX-CONTRACT.md` now lists that
          // exact phrase under "say nothing". The fact is not lost and is not a blank standing for
          // a number: the period's own headline counts these rows out loud ("2 more with no hours
          // yet, so that is a floor") because there it changes what the total MEANS, and the box
          // that fills one in is one press away behind Edit.
          <span className="px-pl-planned">{t('schedule.hours', { n: allocation.plannedHours })}</span>
        )}
        {/* WHAT WAS ACTUALLY SPENT. Text everywhere but Today, where a press turns it into a field.
            Empty is a real answer and it is not zero: nobody has said how long this took, which is
            what every total then reports as uncounted rather than as no time at all. */}
        {spent !== true ? (
          allocation.actualHours === null ? null : (
            <span className="px-pl-actual">{t('schedule.spentHours', { n: allocation.actualHours })}</span>
          )
        ) : saying ? (
          <span className="px-pl-spent">
            <span className="px-pl-hint">{t('schedule.spent')}</span>
            <HoursField
              key={String(allocation.actualHours)}
              hours={allocation.actualHours}
              busy={busy}
              label={t('schedule.spentInput', { work: work === null ? t('schedule.thisWork') : work.name })}
              refused={failed !== null && failed.about === 'spent'}
              describedBy={
                failed !== null && failed.about === 'spent' ? `refused-spent-${allocation.id}` : undefined
              }
              onCommit={(next) => {
                void change({ actualHours: next }, 'spent')
                setSaying(false)
              }}
            />
          </span>
        ) : allocation.actualHours === null ? (
          <button type="button" className="px-pl-say" onClick={() => setSaying(true)}>{t('schedule.saySpent')}</button>
        ) : (
          // The figure reads as a figure, in the same place and the same ink as everywhere else,
          // and the press beside it is the offer to change it. One control saying
          // "spent 1.5h — change" was one object doing two jobs and wrapped over three lines.
          <>
            <span className="px-pl-actual">{t('schedule.spentHours', { n: allocation.actualHours })}</span>
            <button type="button" className="px-pl-say" onClick={() => setSaying(true)}>{t('schedule.change')}</button>
          </>
        )}
      </div>

      {/* ONE PRESS, AND IT COMPLETES THE WORK. The owner: for ordinary completion, one Done press is
          enough, and work that is not done stays in its normal state. So there is no
          three-way control here any more: a row that is not finished shows Done and nothing else,
          and a finished one says so. What became of the HOURS is a different fact and is in the
          menu beside it, where "didn't happen" also lives. */}
      <DoneForWork work={work} recordId={allocation.recordId} onWrote={onWrote} />

      {/* THE MENU IS DRAWN WHILE THE PERIOD IS BEING READ TOO, and that is a change. It holds the
          exceptional outcomes for this period's hours, which are presses that record one fact — the
          same reason the three-way control was allowed while reading. Taking the row off the period
          is planning and stays behind Edit, exactly as it was. */}
      <details className="px-pl-menu">
        <summary aria-label={t('schedule.moreWork', { work: work === null ? t('schedule.thisRow') : work.name })}>⋯</summary>
        <div className="px-pl-menu-body">
          <span className="px-pl-hint">{t('schedule.hoursOutcome', { unit: unitWord(unit) })}</span>
          <HowItWent
            state={allocation.state}
            busy={busy}
            label={t('schedule.sliceOutcomeInput', { unit: unitWord(unit), work: work === null ? t('schedule.thisWork') : work.name })}
            onPick={(next) => void change({ state: next }, 'row')}
          />
          {editing ? (
            <Btn
              size="sm"
              variant="ghost"
              disabled={busy}
              reason={t('schedule.allocationBusy')}
              pending={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true)
                  try {
                    await api.unallocate(allocation.id)
                    onWrote()
                  } catch (err) {
                    setFailed({ about: 'row', message: err instanceof Error ? err.message : String(err) })
                    setBusy(false)
                  }
                })()
              }}
            >
              {t('schedule.takeOff', { unit: unitWord(unit) })}
            </Btn>
          ) : null}
        </div>
      </details>

      {allocation.state === 'done' && !workIsDone(work) ? (
        <p className="px-pl-said">
          {/* STILL TRUE, AND SHORTER, BECAUSE THE WAY OUT IS NOW ON THE ROW. It used to end "Open
              the record to say the work itself is done", which was the only way to do it. Done is
              two centimetres to the left of this sentence now, so the sentence points at it. */}
          {t('schedule.sliceDone', { unit: unitWord(unit), work: work === null ? t('schedule.theWork') : `“${work.title}”` })}
        </p>
      ) : null}

      {/* THE TWO BOX REFUSALS, ON THE LINE UNDER THE BOXES AND AT THAT END OF THE ROW.
          They are the LAST children on purpose: the row is a grid, and a full-width item placed
          between two cells pushes everything after it onto a line of its own. So the sentence sits
          under the hours column, right-aligned, beside the box it marks — see `.px-pl-refused`. */}
      {refusal('hours', allocation.plannedHours, t('schedule.thisUnitCapital', { unit: unitWord(unit) }))}
      {refusal('spent', allocation.actualHours, t('schedule.spentLabel'))}
      {/* WHAT IS LEFT: a refusal from a press that is not one of the two boxes — a state press, or
          taking this work off the period. Those controls live across the row, so their sentence
          does too. */}
      {failed === null || failed.about !== 'row' ? null : <p className="px-pl-failed">{failed.message}</p>}
    </li>
  )
}

/**
 * What this period holds, with its columns named.
 *
 * The headings are the fix for a measured misreading: with no column heading and no unit, the hours
 * box read as part of the control beside it. They are real headings rather than placeholders, so
 * they are there whether a row is filled in or not.
 */
export function PlanRows({
  entries,
  unit,
  editing,
  spent,
  onWrote,
}: {
  entries: AllocationWithWork[]
  unit: string
  /** True when the address ends in `/edit`. Reading is what every fresh visit gets. */
  editing: boolean
  /** Draw the hours-spent field on every row. Today only — see `PlanRow`. */
  spent?: boolean
  onWrote: () => void
}) {
  if (entries.length === 0) return null
  // THE HOURS COLUMN IS WIDER WHERE IT HOLDS TWO FACTS. On Today it carries what was planned, what
  // was spent and the press that changes it; at the width the other periods use, "say what you
  // spent" wrapped over three lines. Photographed at 1440.
  const table = editing ? 'px-pl-table' : 'px-pl-table px-pl-reading'
  return (
    <div className={spent === true ? `${table} px-pl-spending` : table}>
      <PlanningStyle />
      {/* TWO HEADINGS AND TWO UNNAMED COLUMNS, and the two that are unnamed say their own words.
          The hours box is the reason this row exists at all — it had no visible name, no heading
          and no unit — while the Done press and the row menu are a word and a mark that name
          themselves. A heading over a button reading Done would be the word printed twice.

          The menu column exists in both states now, because what became of this period's hours is a
          press and presses are allowed while reading. */}
      <div className="px-pl-colhead" aria-hidden="true">
        <span>{t('schedule.work')}</span>
        <span>{t('schedule.hoursLabel')}</span>
        <span />
        <span />
      </div>
      <ul className="px-pl-rows">
        {entries.map((entry) => (
          <PlanRow
            key={entry.allocation.id}
            entry={entry}
            unit={unit}
            editing={editing}
            {...(spent === true ? { spent: true } : {})}
            onWrote={onWrote}
          />
        ))}
      </ul>
    </div>
  )
}

// ============================================================================ adding work

/**
 * A REFUSAL, WHOLE, IN THE SERVER'S OWN WORDS.
 *
 * The sentence is printed exactly as it arrived and never shortened or summarised. It is the
 * authority on why the hours were not written, it names the row that stopped them, and it says what
 * to do about it — a refusal a person cannot act on is a wall.
 *
 * IT SPANS THE WHOLE ROW. It used to be printed inside the row's last column, which is capped at
 * 16rem, so the one sentence a person most needs to read was a four-word-wide ribbon.
 *
 * NOTHING HERE READS THE SENTENCE, and that is the change of 16 August 2026. `waysOutOf` used to
 * take an allocation id out of the clause `take the hours off "<work>" (allocation <id>)` and draw a
 * press that deleted that row. The refusal holding that clause was the one that stopped a piece of
 * work and its parts both having hours in one period, and round five removed it: planning coarse
 * first and refining later is how the owner plans. No refusal in the product writes that clause any
 * more, so the reader matched nothing and the press could never appear. A reader kept alive against
 * a sentence nobody writes is dead machinery that reads like a working feature, so it is gone rather
 * than left in place.
 *
 * The refusals a person still meets here — this work already has an allocation in this period, this
 * kind cannot be given time, this is not a period — each say what to do in words, and none of them
 * asks for a row to be deleted.
 */
export function Refusal({ message }: { message: string }) {
  return (
    <div className="px-pl-refusal">
      <p className="px-pl-failed">{message}</p>
    </div>
  )
}

/**
 * Give this work time in this period. One press, and nothing until it.
 *
 * A REFUSAL IS SHOWN, NOT SWALLOWED. The server owns whether the work still exists and whether this
 * period already names it; each refusal arrives as the server's own sentence and is printed on the
 * row that caused it, whole, with its way out as a press. What is NOT left to a refusal any more is
 * the kind: the reply says which kinds a plan may hold, so a press that would certainly be refused
 * is not drawn at all.
 */
function AddPress({
  horizon,
  period,
  recordId,
  hours,
  already,
  label,
  onWrote,
}: {
  horizon: Grain
  period: string
  recordId: string
  /**
   * What the hours box beside this press says, read by the product's one hours reader.
   *
   * IT USED TO BE `number | null | 'bad'`, AND `'bad'` BECAME `null` ON THE WAY TO THE SERVER —
   * `const asked = hours === 'bad' ? null : hours`. Nothing pressed it, because the press was
   * disabled on the same condition, which means the substitution was defended by a second place
   * agreeing with it rather than by being impossible. `null` is this route's real answer for
   * "somebody committed to this work here without saying for how long", so a typo would have
   * arrived as a sentence somebody meant. The three-answer shape has nowhere to put a guess.
   */
  hours: HoursBoxRead
  /** True when this period already names this work, `null` when the plan has not been read. */
  already: boolean | null
  label: string
  onWrote: () => void
}) {
  const [busy, setBusy] = useState(false)
  /** What was written, when this press wrote it. `null` until it has. */
  const [added, setAdded] = useState<{ hours: number | null } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  // WHAT YOU JUST DID IS NOT THE SAME FACT AS WHAT WAS ALREADY TRUE, and this said the same four
  // words for both. Measured in a browser on 2026-08-14: putting work on August with no hours was
  // answered "already on it", and the month's headline read exactly what it had read before the
  // press, so nothing on the screen said a row had been written. The hours are the press's own,
  // reported rather than read back, because an unstated allocation changes no total and the person
  // needs to know that is what they asked for.
  if (added !== null) {
    return (
      <span className="px-pl-on px-pl-justdid">
        {added.hours === null
          ? t('schedule.addedWithoutHours', { unit: unitWord(horizon) })
          : t('schedule.addedWithHours', { unit: unitWord(horizon), n: added.hours })}
      </span>
    )
  }
  if (already === true) {
    return <span className="px-pl-on">{t('schedule.alreadyOn')}</span>
  }

  return (
    <>
      <Btn
        size="sm"
        disabled={busy || hours.said === 'words'}
        // THE REASON IS THE READER'S OWN SENTENCE, so a press that will not go says what the box
        // would have to hold instead. It said "the hours box is not a number", which is true of
        // "5h" and was the wrong thing to tell somebody who had written a number of hours.
        reason={busy ? t('schedule.writeBusy') : hours.said === 'words' ? hours.why : t('schedule.noHoursReading')}
        pending={busy}
        onClick={() => {
          // WORDS MOLE OFFICE COULD NOT READ WRITE NOTHING AT ALL. The press is already disabled on this
          // condition and says why; this is the same answer given where the write would happen, so
          // no path through this function turns unreadable words into a number or into "no number
          // was stated". Nothing here decides what they meant.
          if (hours.said === 'words') return
          void (async () => {
            setBusy(true)
            setFailed(null)
            try {
              // AN EMPTY BOX IS THE ONLY WAY THE HOURS ARE LEFT OUT. That is a real answer and it
              // means somebody committed to this work here without saying for how long.
              const asked = hours.said === 'nothing' ? null : hours.hours
              await api.allocate({ horizon, period, recordId, plannedHours: asked })
              setAdded({ hours: asked })
              onWrote()
            } catch (err) {
              setFailed(err instanceof Error ? err.message : String(err))
            } finally {
              setBusy(false)
            }
          })()
        }}
      >
        {label}
      </Btn>
      {failed === null ? null : <Refusal message={failed} />}
    </>
  )
}

/**
 * How many search results the panel draws. The count beside them is always the true one, so this
 * caps what is DRAWN and never what was found — the difference is stated in the sentence above them.
 */
const RESULTS_SHOWN = 10

/**
 * A NUMBER OF HOURS SOMEBODY ALREADY STATED, in the shape every hours box on this page speaks.
 *
 * It is not a reading of anything: the recurrence's own `hoursEach` is a stored number, and `null`
 * on it means nobody said. This turns that stored answer into the same three-answer shape a typed
 * box produces, so a press takes one kind of thing however the hours reached it.
 */
function hoursAlreadyStated(hours: number | null): HoursBoxRead {
  return readHoursBox(hours === null ? '' : String(hours))
}

/** The hours every press in a panel will commit. One box, so filling a week is type-once-press-many. */
function HoursBox({ value, onChange, unit }: { value: string; onChange: (next: string) => void; unit: string }) {
  const read = readHoursBox(value)
  return (
    <div className="px-pl-hoursbox">
      <label className="px-pl-caplab">
        <span className="px-pl-capword">{t('schedule.hoursEach')}</span>
        <span className="px-pl-capbox">
          <input
            className="px-pl-caph"
            type="text"
            /* NO DECIMAL KEYPAD, because the box reads words as well as numbers. */
            value={value}
            placeholder="—"
            aria-label={t('schedule.eachHoursInput', { unit: unitWord(unit) })}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="px-pl-unit">{t('schedule.hourUnit')}</span>
        </span>
      </label>
      <span className="px-pl-hint">
        {read.said === 'words'
          ? read.why
          : read.said === 'nothing'
            ? t('schedule.emptyHours')
            : t('schedule.eachHours', { n: read.hours })}
      </span>
    </div>
  )
}

/** Rows of work to carry, each one press from being on the period being built. */
function CarryRows({
  entries,
  horizon,
  period,
  hours,
  planned,
  label,
  onWrote,
}: {
  entries: AllocationWithWork[]
  horizon: Grain
  period: string
  hours: HoursBoxRead
  planned: readonly string[] | null
  label: string
  onWrote: () => void
}) {
  return (
    <ul className="px-pl-rows">
      {entries.map((entry) => (
        <li key={entry.allocation.id} className="px-pl-row">
          <WorkIdent work={entry.work} recordId={entry.allocation.recordId} />
          <span className="px-pl-was">
            {entry.allocation.plannedHours === null ? <Absence title={t('schedule.noHours')} /> : t('schedule.hours', { n: entry.allocation.plannedHours })}
            {' · '}
            {/* A planned time slice has no outcome yet; it is a known allocation state. */}
            {entry.allocation.state === 'planned' ? t('schedule.leftPlanned') : (
              <StoredState state={entry.allocation.state} progress={progressOf(entry.allocation.state)} />
            )}
          </span>
          <div className="px-pl-acts">
            {entry.work === null ? (
              // Nothing to carry: the record it named is gone, and the row says so above.
              <Absence title={t('schedule.nothingToCarry')} />
            ) : (
              <AddPress
                horizon={horizon}
                period={period}
                recordId={entry.allocation.recordId}
                hours={hours}
                already={planned === null ? null : planned.includes(entry.allocation.recordId)}
                label={label}
                onWrote={onWrote}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * WHAT A PERIOD CAN BE FILLED WITH: every piece of work in every project, at every level.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS REPLACES, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * A week had exactly two sources of work: last week's unfinished rows, and a free-text search of
 * ONE project. Neither could offer a piece of work at a chosen level, so a week filled from them
 * mostly held whole pipeline blocks, which
 * is too coarse. A block's parts were reachable only by knowing their names and typing them.
 *
 * So the offer is now `GET /api/work`, which is one reading of every piece of work in every project
 * with what each is part of. Three controls narrow it and none of them changes what a row MEANS:
 * which project owns it, how deep it sits, and words in its name.
 *
 * ---------------------------------------------------------------------------------------
 * THE WORDS BOX IS NOT THE OLD SEARCH AND DOES NOT PRETEND TO BE
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/search` reads a whole project's records and ranks them. This narrows a list that is
 * already in hand, by the words on the row: the name, the full title, the one-line summary, and
 * what the work sits inside. It says so under the box. A person who typed two words gets the rows
 * carrying both.
 *
 * The list also holds work only, which is the point rather than a limitation: a plan gives hours to
 * work, and a search that offered a session and a message made the way to find that out pressing
 * one and reading the refusal.
 */

/**
 * The work list, read once for the panel that offers it.
 *
 * THE WHOLE REPLY AND NOT THE ROWS, because `leftOut` is how this panel knows whether it is offering
 * all of the work or the first two thousand pieces of it, and a panel that could not say so would be
 * a list quietly claiming to be everything.
 */
function useWorkList(): AsyncState<WorkListReply> {
  return useAsync(() => api.work(), [])[0]
}

/** One thing a control offers, with how many pieces of work it would leave. */
export interface OfferChoice {
  /** What the control stores. `any` means the control is not narrowing anything. */
  key: string
  /** What it says on screen. Plain words, never a stored key. */
  label: string
  count: number
}

/** `any`, spelt once, because the two controls and the filter all have to mean the same thing by it. */
export const ANY = 'any'

/**
 * HOW DEEP EACH PIECE OF WORK SITS, AS A CHOICE.
 *
 * Depth is the length of the chain above a row, which `GET /api/work` already worked out across all
 * three containment stores. Nothing here re-derives it.
 *
 * THE OPTIONS COME FROM THE ROWS, so the control can never offer a level the corpus does not hold,
 * and every option carries the true count. On the live corpus that is 107 pieces of work that are
 * part of nothing, 95 one level in, and 1 two levels in.
 */
export function levelsOf(rows: readonly WorkRow[]): OfferChoice[] {
  const counts = new Map<number, number>()
  for (const row of rows) counts.set(row.above.length, (counts.get(row.above.length) ?? 0) + 1)
  const depths = [...counts.keys()].sort((a, b) => a - b)
  return [
    { key: ANY, label: t('schedule.everyLevel'), count: rows.length },
    ...depths.map((depth) => ({
      key: String(depth),
      label: depth === 0 ? t('schedule.noParent') : depth === 1 ? t('schedule.oneLevel') : t('schedule.levelsIn', { n: depth }),
      count: counts.get(depth) ?? 0,
    })),
  ]
}

/** Which projects the work is in, as a choice. Built the same way and for the same reason. */
export function projectsOf(rows: readonly WorkRow[]): OfferChoice[] {
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.workspaceId, (counts.get(row.workspaceId) ?? 0) + 1)
  return [
    { key: ANY, label: t('schedule.everyProject'), count: rows.length },
    ...[...counts.keys()].sort().map((id) => ({ key: id, label: id, count: counts.get(id) ?? 0 })),
  ]
}

/** What the three controls are set to. */
export interface Narrowing {
  project: string
  level: string
  words: string
}

/**
 * The rows those three controls leave, in the order the reply put them in.
 *
 * EVERY WORD HAS TO MATCH, and a word matches the name, the full title, what the work sits inside,
 * and the one line it was filed with. Two words therefore narrow rather than widen, which is what a
 * person typing a second word means by typing it.
 */
export function offered(rows: readonly WorkRow[], narrowing: Narrowing): WorkRow[] {
  const words = narrowing.words.toLowerCase().split(/\s+/).filter((w) => w !== '')
  return rows.filter((row) => {
    if (narrowing.project !== ANY && row.workspaceId !== narrowing.project) return false
    if (narrowing.level !== ANY && String(row.above.length) !== narrowing.level) return false
    if (words.length === 0) return true
    const text = [row.name, row.title, row.summary ?? '', ...row.above.map((s) => s.title)]
      .join(' ')
      .toLowerCase()
    return words.every((word) => text.includes(word))
  })
}

/**
 * A piece of work drawn the way every other row on this page draws one.
 *
 * ONE DRAWING, NOT TWO. `WorkIdent` is what a plan row, a carried row and a review row all use, and
 * a candidate that looked different would be a second opinion about how a piece of work is named.
 * The chain is drawn beside it rather than inside it, because `within` and the chain are the same
 * fact for a block and drawing both would say it twice.
 *
 * WHAT THIS READING DOES NOT CARRY: how the record entered the corpus. `GET /api/work` does not
 * send it, so `origin` here is "nobody said" and not "not a fixture" — and the FIXTURE mark appears
 * on the row the moment the work is on the period, because the plan's own reply does carry it.
 */
function asAllocated(row: WorkRow): AllocatedWork {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    name: row.name,
    within: row.above.length > 0 ? null : row.within,
    workspaceId: row.workspaceId,
    state: row.state,
    stateSource: row.stateSource,
    effortHours: row.estimateHours,
    origin: null,
    // Deleted records are left out of the work list, so this is a fact rather than a default.
    deleted: false,
  }
}

/** What one piece of work is part of, outermost first. Nothing at all when it is part of nothing. */
function AboveIt({ row }: { row: WorkRow }) {
  const inspect = useInspect()
  const projects = useProjects()
  if (row.above.length === 0 && row.aboveStopped === null && row.parentsInOtherProjects.length === 0) return null
  return (
    <span className="px-pl-chain">
      {row.above.length === 0
        ? null
        : t('schedule.inWork', { work: row.above.map(step => step.title + (step.deleted === true ? t('schedule.deletedSuffix') : '')).join(' › ') })}
      {row.parentsInOtherProjects.length === 0
        ? null
        : t('schedule.inProjects', { projects: listJoined(row.parentsInOtherProjects.map(id => scheduleProjectName(projects, id, inspect))) })}
      {/* WHY THE CHAIN IS NOT THE WHOLE CHAIN, in the server's own words. A row whose containment
          could not be read is still offered — the hours are about the work, not about its chain —
          and saying nothing would draw it as though it sat under what is shown. */}
      {row.aboveStopped === null ? null : <span className="px-pl-stopped"> · {inspect ? row.aboveStopped : t('schedule.parentUnread')}</span>}
    </span>
  )
}

/**
 * ONE PIECE OF WORK, ONE PRESS FROM THE PERIOD.
 *
 * Its own component so it can be drawn without a server, because the rule it keeps is one a
 * screenshot cannot show: **never draw a press the server will reject.** The kinds a plan may hold
 * come from the plan's own reply, out of the declaration the write path enforces.
 */
export type WorkOfferProps = {
  row: WorkRow
  /** Kinds a plan may hold. `null` while the plan has not been read — see below. */
  allocatable: readonly string[] | null
} & (
  | {
      /**
       * What this row offers, when the caller is not giving hours.
       *
       * THE SCHEDULE HAS TWO THINGS TO DO WITH A PIECE OF WORK and they are different facts: put it
       * across some days, and give it hours in a period. One panel finds the work for both, so what
       * the press DOES belongs to the caller. The kind gate above is shared, because both writes
       * refuse the same kinds out of the same declaration.
       */
      action: React.ReactNode
    }
  | {
      horizon: Grain
      period: string
      hours: HoursBoxRead
      planned: readonly string[] | null
      label: string
      onWrote: () => void
    }
)

export function WorkOffer(props: WorkOfferProps) {
  const { row, allocatable } = props
  return (
    <li className="px-pl-row">
      {/* Its own class rather than a second `px-pl-ident` around the one WorkIdent draws: the same
          class nested inside itself works and reads as a mistake. */}
      <div className="px-pl-offer">
        <WorkIdent work={asAllocated(row)} recordId={row.id} />
        <AboveIt row={row} />
      </div>
      <span className="px-pl-was" />
      <div className="px-pl-acts">
        {allocatable !== null && !allocatable.includes(row.kind) ? (
          <span className="px-pl-hint">{t('schedule.allocatableKinds', { kinds: listJoined(allocatable.map(kind => kindWord(kind).text.toLowerCase())) })}</span>
        ) : 'action' in props ? (
          props.action
        ) : (
          // `allocatable === null` means the plan has not been read, which is not the same as "this
          // kind is fine": the press is drawn, and the server's refusal is printed on the row if it
          // comes. Guessing either way here would be inventing an answer.
          <AddPress
            horizon={props.horizon}
            period={props.period}
            recordId={row.id}
            hours={props.hours}
            already={props.planned === null ? null : props.planned.includes(row.id)}
            label={props.label}
            onWrote={props.onWrote}
          />
        )}
      </div>
    </li>
  )
}

/** One narrowing control: a plain select whose options carry their own counts. */
function Narrow({
  label,
  value,
  choices,
  onChange,
}: {
  label: string
  value: string
  choices: OfferChoice[]
  onChange: (next: string) => void
}) {
  return (
    <label className="px-pl-narrow">
      <span className="px-pl-hint">{label}</span>
      <select
        className="px-pl-inproject"
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      >
        {choices.map((choice) => (
          <option key={choice.key} value={choice.key}>
            {choice.label} ({choice.count})
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * FIND WORK AND PUT IT ON THE PERIOD.
 *
 * The whole list is read once and narrowed in the browser, so changing a control shows the answer
 * at once and adding a row does not throw the narrowing away. That last part is a defect this page
 * has had before: a search panel drawn inside its own loading state was unmounted by its own
 * success, and everything typed into it went with it.
 */
function AddFromWork({
  allocatable,
  offer,
}: {
  allocatable: readonly string[] | null
  /**
   * What each row offers once it has been found. Given the row, because the two callers do two
   * different things with the same piece of work: the board places it across days, and the hours
   * panel gives it a number. One list, one narrowing, two presses — rather than two lists.
   */
  offer: (row: WorkRow) => React.ReactNode
}) {
  const list = useWorkList()
  const projects = useProjects()
  const inspect = useInspect()
  const [project, setProject] = useState(ANY)
  const [level, setLevel] = useState(ANY)
  const [words, setWords] = useState('')

  if (list.status === 'loading') return <Loading label={t('schedule.allWork')} rows={3} />
  if (list.status === 'error') return <ErrorNote message={list.message} fault={list.fault} />

  const all = list.value.rows
  const shown = offered(all, { project, level, words })
  const narrowed = project !== ANY || level !== ANY || words.trim() !== ''

  return (
    <>
      <PlanningStyle />
      <div className="px-pl-narrowing">
        <TextInput
          value={words}
          onChange={setWords}
          placeholder={t('schedule.narrowWords')}
          aria-label={t('schedule.narrowWork')}
        />
        <Narrow label={t('schedule.project')} value={project} choices={projectsOf(all).map(choice => choice.key === ANY ? choice : { ...choice, label: scheduleProjectName(projects, choice.key, inspect) })} onChange={setProject} />
        <Narrow label={t('schedule.level')} value={level} choices={levelsOf(all)} onChange={setLevel} />
      </div>
      <p className="px-pl-hint">
        {/* WHAT THE WORDS BOX MATCHES, said where it is typed. It narrows this list; it does not
            read the text of records the way the project search does. */}{t('schedule.searchHelp')}</p>

      {/* THE CUT IS NEVER SILENT, and neither is a cut the server made. `leftOut` is how many
          pieces of work did not fit in the reply at all, which is a different absence from the
          rows this panel is not drawing. */}
      {list.value.leftOut === 0 ? null : (
        <p className="px-pl-failed">
          {t('schedule.workListCut', { n: list.value.leftOut, cap: list.value.cap })}
        </p>
      )}

      <p className="px-pl-hint">
        {/* WHAT IS BEING COUNTED CHANGES WITH THE CONTROLS, so the sentence does too: "219 of 219
            match" is a strange thing to say to somebody who has not narrowed anything.

            AND THE CUT SAYS IT IS NOT A RANKING. Ten of two hundred, drawn without a word about the
            order, reads as the ten that matter most, and nothing in this list knows that. */}
        {shown.length === 0 ? <Absence title={t('schedule.noMatch', { n: all.length })} /> : <>
          {narrowed ? t('schedule.matches', { shown: shown.length, total: all.length }) : t('schedule.workCount', { n: all.length })}
          {shown.length > RESULTS_SHOWN ? t('schedule.firstResults', { n: RESULTS_SHOWN }) : ''}
        </>}
      </p>

      <ul className="px-pl-rows">
        {shown.slice(0, RESULTS_SHOWN).map((row) => (
          <WorkOffer key={row.id} row={row} allocatable={allocatable} action={offer(row)} />
        ))}
      </ul>
    </>
  )
}

// ============================================================================ time in words

/**
 * WHAT A BOX OF WORDS ABOUT TIME CAME TO: a period, a number of hours, and Mole Office's own sentences
 * about both.
 *
 * ---------------------------------------------------------------------------------------
 * THE WORDS ARE READ IN ONE PLACE AND THIS IS NOT IT
 * ---------------------------------------------------------------------------------------
 *
 * `readTimeWords` in src/shared/planning.ts is the only reader of loose time words in Mole Office, and
 * the server calls the same function when it keeps an intent. So the sentence on the screen before
 * you press and the sentence stored afterwards cannot disagree: there is one reader and this hands
 * its answers straight through. Nothing here writes a sentence of its own about an interpretation.
 *
 * `now` is handed in because a reading of "today" is about the person's own day, and in a browser
 * the person's own day is this machine's clock — the same clock `defaultPeriod` on the plan page
 * already uses to decide which week you land on.
 *
 * IT NEVER GUESSES. A period comes back only when the reader read one. "sometime next week" comes
 * back with no period and the reader's own sentence saying which word stopped it.
 */
export interface TimeSaid {
  /** The period read from the words, or null when none was read. */
  period: Period | null
  /** The hours read from the words, or null when none were read. */
  hours: number | null
  /** Mole Office's sentence about when: what it read, or why it read nothing. Always something. */
  aboutWhen: string
  /**
   * Its sentence about how long, or null when no hours were read.
   *
   * WHY THE NULL. Somebody typing "next week" to go and look at next week has said nothing about
   * hours, and answering them with "Mole Office could not read a number of hours from these words" is a
   * complaint about a question they did not ask.
   *
   * AND NOTHING IS HIDDEN BY IT. A number Mole Office cannot read as hours also stops the period being
   * read — "5 next week" and "2h30 next week" both come back with no period — so the sentence about
   * WHEN carries the refusal in every case where a number was written and not taken.
   */
  aboutHours: string | null
}

/** Read one box of words. `null` means the box is empty, which is not a failed reading. */
export function timeSaid(words: string, now: Date): TimeSaid | null {
  if (words.trim() === '') return null
  const read = readTimeWords(words, now)
  return {
    period: read.period.read ? read.period.period : null,
    hours: read.hours.read ? read.hours.hours : null,
    aboutWhen: read.period.read ? read.period.how : read.period.why,
    aboutHours: read.hours.read ? read.hours.how : null,
  }
}

/**
 * The three periods that were the whole of the old control, kept as what they always were: the
 * commonest three things to type. They fill the box rather than acting on their own, so a person
 * sees the words the box takes and can edit them into "next week" or "Tuesday".
 */
const SHORTCUTS = ['today', 'this week', 'this month'] as const

/** Everything the intents route sends back. Mirrors `GET /api/planning/intents` in api/planning.ts. */
interface IntentsReply {
  intents: PlanningIntentWithPeriodReading[]
  counts: { all: number; kept: number; offered: number; committed: number }
  note: string
}

/**
 * WORDS SOMEBODY WROTE ABOUT TIME, AND NOTHING THAT COUNTS AS A PLAN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PANEL IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Two jobs, and they are the same box because they are the same act — writing when you mean:
 *
 *     going somewhere      "2026-09-07", "next week", "September", "monday to sunday". The
 *                          period is read and a press opens it. This is how a person reaches a
 *                          period that is not today, this week or this month without knowing that
 *                          Mole Office spells a week 2026-W36.
 *     keeping what could   "sometime next week" is not a date and never becomes one. The words are
 *     not be read          kept, they are listed here where they can be found again, and they are
 *                          in no total anywhere.
 *
 * ---------------------------------------------------------------------------------------
 * THE BOX IS BEHIND A PRESS WHILE THE PERIOD IS BEING READ
 * ---------------------------------------------------------------------------------------
 *
 * A page being read draws no box, no dropdown and no text area. That is not a habit of this file:
 * `tests/read-before-edit.test.ts` opens every address in a browser and counts them, and it says in
 * its own words that adding a second always-writable page is a product decision that belongs in the
 * design documents before it belongs in the test. THIS PANEL WAS WRITTEN WITH THE BOX ON THE
 * READING VIEW AND THAT TEST CAUGHT IT.
 *
 * So while the period is being read, the box is inside a closed fold. That is the "expanded" tier
 * of the UX contract — behind a press — and it is the tier the same test names as allowed, because
 * a control nobody has pressed to reveal is a control the page did not draw. The fold is open while
 * the period is being planned, where boxes belong anyway.
 *
 * IT IS NOT BEHIND EDIT, AND THE REASON MATTERS. Going to another day, week or month is reading,
 * not planning, and the presses on this page that go somewhere — the arrows, the horizon picker,
 * the month's week rows — are all drawn while reading. What is behind Edit is the press that WRITES:
 * keeping the words, and giving a kept intent its hours.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING HERE IS IN ANY TOTAL
 * ---------------------------------------------------------------------------------------
 *
 * A kept intent adds nothing to a week, uses no capacity and counts as no work planned. That is the
 * load-bearing half of the eighth rule and it is stated on the list rather than left to be inferred
 * from how the rows are drawn.
 */
export function TimeInWords({
  said,
  onSaid,
  editing,
  today,
  now,
  onWrote,
}: {
  /** What is in the box. Held by the surface, like the hours box beside the add section. */
  said: string
  onSaid: (next: string) => void
  /** True when the address ends in `/edit`. The presses that write are drawn only then. */
  editing: boolean
  /** The server's day, week and month, so a period can be called "next week" and not a key. */
  today: TodayKeys | null
  /** The day the words are read against. The browser's own, which is the person's own. */
  now?: Date
  onWrote: () => void
}) {
  const [wrote, setWrote] = useState(0)
  const [kept, readAgain] = useAsync(() => moleOfficeRequest<IntentsReply>('/api/planning/intents'), [wrote])
  const [keeping, setKeeping] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  /** Confirmation of the last successful write, kept outside the fold. */
  const [understood, setUnderstood] = useState<string | null>(null)
  const eyebrow = useEyebrow('intent, not a fact')
  const inspect = useInspect()
  const read = timeSaid(said, now ?? new Date())

  const keep = (): void => {
    void (async () => {
      setKeeping(true)
      setFailed(null)
      try {
        await moleOfficeRequest<{ intent: PlanningIntent; interpretation: string; note: string }>(
          '/api/planning/intents',
          { method: 'POST', body: JSON.stringify({ said }) },
        )
        // Saving an intent keeps its words without writing an allocation.
        setUnderstood(t('schedule.wordsSaved'))
        onSaid('')
        setWrote((n) => n + 1)
      } catch (err) {
        setFailed(err instanceof Error ? err.message : String(err))
      } finally {
        setKeeping(false)
      }
    })()
  }

  return (
    <PlanSection declares={{ surface: 'plan.words' }} title={t('schedule.timeInWords')} {...(eyebrow === undefined ? {} : { kind: eyebrow })}>
      <PlanningStyle />
      {/* OPEN WHILE THE PERIOD IS BEING PLANNED, shut while it is being read — see the head of this
          component. The summary says what pressing it gets you, which is the whole of what the three
          buttons could not do. */}
      <details className="px-pl-fold" open={editing}>
        <summary>{t('schedule.anotherPeriod')}</summary>
        <div className="px-pl-words">
          <TextInput
            value={said}
            onChange={(next) => {
              setUnderstood(null)
              onSaid(next)
            }}
            // EVERY EXAMPLE HERE IS READ BY THE READER BELOW, AND THAT IS CHECKED BY A TEST.
            // It used to read "next week, 7 September, 5h on Tuesday" and `readTimeWords` reads
            // neither of the last two: "7 September" is not a date shape it knows, and "on Tuesday"
            // is not "Tuesday". So the box promised three things and delivered one. A placeholder
            // is a promise, and the honest fix is to name what the product actually reads —
            // "2026-09-07" is the date shape, and a weekday is read on its own.
            placeholder={t('schedule.timeExample')}
            aria-label={t('schedule.timeInput')}
          />
          <span className="px-pl-states" role="group" aria-label={t('schedule.commonTimes')}>
            {SHORTCUTS.map((word) => (
              <button
                key={word}
                type="button"
                className="px-pl-state"
                aria-pressed={said.trim().toLowerCase() === word}
                onClick={() => {
                  setUnderstood(null)
                  onSaid(word)
                }}
              >
                {t(word === 'today' ? 'schedule.todayLower' : word === 'this week' ? 'schedule.thisWeekLower' : 'schedule.thisMonthLower')}
              </button>
            ))}
          </span>
        </div>

        {read === null ? null : (
          <div className="px-pl-said">
            {/* WHAT MOLE OFFICE MADE OF THE WORDS, with the week it landed on named the way a person
                says it. Inspect keeps the sentence exactly as the reader wrote it, key and all. */}
            <p className="px-pl-saidwhen">{inspect ? read.aboutWhen : read.period === null ? t('schedule.noPeriodRead') : t('schedule.readPeriod', { period: periodSaid(read.period.key, null).range })}</p>
            {read.aboutHours === null ? null : <p className="px-pl-hint">{inspect ? read.aboutHours : t('schedule.readHours', { n: read.hours! })}</p>}
            <div className="px-pl-saidacts">
              {read.period === null ? null : (
                <RouteLink to={planPeriodPath(read.period.key)} className="px-pl-step">
                  {t('schedule.openPeriod', { period: periodSaid(read.period.key, today).name })}
                </RouteLink>
              )}
              {/* KEEPING IS A WRITE, so it is behind Edit like every other write on this page. What
                  it writes is not a plan: it is the words, and the reply says what was made of
                  them. */}
              {editing ? (
                <Btn size="sm" pending={keeping} onClick={keep}>{t('schedule.keepWords')}</Btn>
              ) : null}
            </div>
          </div>
        )}

        {failed === null ? null : <Refusal message={failed} />}
      </details>
      {/* The confirmation stays visible when the fold is shut or the scheduled row leaves. */}
      {understood === null ? null : <p className="px-pl-on px-pl-justdid">{understood}</p>}

      {kept.status === 'loading' ? <Loading label={t('schedule.readKeptWords')} rows={2} /> : null}
      {kept.status === 'error' ? <ErrorNote message={kept.message} fault={kept.fault} retry={readAgain} /> : null}
      {kept.status === 'ready' ? (
        <WordsKept
          reply={kept.value}
          today={today}
          editing={editing}
          onCommitted={(note) => {
            // THE ROW THAT WAS PRESSED IS ABOUT TO GO. A committed intent leaves this list, so its
            // own confirmation would be unmounted by its own success — which is how a person ends
            // up pressing a button and seeing nothing. The server's sentence is kept up here.
            setUnderstood(note)
            setWrote((n) => n + 1)
            onWrote()
          }}
        />
      ) : null}
    </PlanSection>
  )
}

/**
 * THE WORDS ALREADY KEPT, drawn so that not one of them can be mistaken for a commitment.
 *
 * Only the words nothing has been scheduled from are listed. A committed intent became an ordinary
 * allocation and is on the period's own rows, so listing it here as well would be the same hours in
 * two places on one screen; the count of them is stated instead, because "none of these is
 * scheduled" beside a list of five reads as "nothing you ever wrote was scheduled".
 */
export function WordsKept({
  reply,
  today,
  editing,
  onCommitted,
}: {
  reply: IntentsReply
  today: TodayKeys | null
  editing: boolean
  /** Takes the server's own sentence about what was scheduled, because this row is about to go. */
  onCommitted: (note: string) => void
}) {
  // NOT `waiting`, WHICH IS WHAT THIS WAS CALLED. These are kept words nobody has turned into
  // hours. They are step-one things under the eighth rule: in no total, and not facts. The fold's
  // summary said "5 waiting on you", which was the fifth claim of that form in the product and the
  // one place the phrase must never mean — a phrase Mole Office has not read a commitment out of is not
  // a thing a person has been asked for. What IS waiting on the person is one reading,
  // GET /api/waiting, and it is drawn on Home and on the rail.
  const kept = reply.intents.filter((one) => one.state !== 'committed')
  if (kept.length === 0) {
    // NOTHING WRITTEN IS NOT AN ABSENCE ANYBODY ACTS ON, so it is drawn as nothing at all. The box
    // above is the whole of what a person came here to do.
    return null
  }
  return (
    // ONE LINE UNTIL SOMEBODY ASKS FOR MORE. The owner, 17 August 2026: the section "Words you wrote
    // about time" is a surface for interpreting, debugging and reviewing, not the primary schedule;
    // where unresolved time phrases exist they are to be summarized lightly, and a large explanatory
    // section is not to be printed by default. So the section is a fold, the summary counts what is waiting, and everything that
    // was here is one press away.
    //
    // IT IS OPEN WHILE THE WEEK IS BEING PLANNED. Shut is the state of the page a person opens to
    // READ their week, which is the surface the owner's sentence is about; the moment they press Edit they
    // are working on the week, and a kept phrase is one of the things they came to resolve.
    <details className="px-pl-keptfold" open={editing}>
      <summary>
        {t('schedule.keptCount', { n: kept.length })}
      </summary>
      {/* THE ONE PLACE THIS IS SAID, AND IT NAMES WHAT IT IS ABOUT: the words. It used to be said
          here AND again on every row, and the row's copy stood a few lines under a total reading
          "12h planned this week" — so a person read "nothing has been scheduled" beside hours that
          were scheduled. The second sentence is what lets both be true at once: these words are not
          on the plan, and the work they name may have hours that came from somewhere else. */}
      <p className="px-pl-hint">{t('schedule.keptWordsHelp')}{reply.counts.committed === 0 ? '' : t('schedule.scheduledMore', { n: reply.counts.committed })}
      </p>
      <ul className="px-pl-kept">
        {kept.map((intent) => (
          <KeptWords key={intent.id} intent={intent} today={today} editing={editing} onCommitted={onCommitted} />
        ))}
      </ul>
    </details>
  )
}

/**
 * WHAT ONE KEPT PHRASE IS WAITING ON, IN WORDS A PERSON WOULD USE.
 *
 * Two of the three words `docs/UX-CONTRACT.md` supplies belong here and the third does not.
 * **Not placed yet** is exactly a phrase Mole Office read no time from. **Needs a day** is a phrase that
 * named a time and a piece of work, so the only thing left is a person pressing. The third state a
 * kept phrase can be in has no supplied word: a time was read and the words name no piece of work,
 * so hours from them would point at nothing — that is **Names no work**, and calling it either of
 * the other two would be wrong about which half is missing.
 */
export function stateOfKeptWords(intent: Pick<PlanningIntent, 'period' | 'recordId'>): string {
  if (intent.period === null) return t('schedule.notPlaced')
  if (intent.recordId === null) return t('schedule.namesNoWork')
  return t('schedule.readyToSchedule')
}

/**
 * One row of words somebody wrote, with what Mole Office made of them beside it — never instead of them.
 *
 * THREE SHAPES, AND EACH SAYS WHAT IS TRUE OF IT:
 *
 *     nothing read          the words are kept and no date was invented. There is nothing to press.
 *     read, about work      a period was read and the work is named, so it can be scheduled.
 *     read, about no work   a period was read and nothing says which piece of work it is about, so
 *                           hours from it would point at nothing. The press is NOT drawn, because a
 *                           press the server would certainly refuse is a fake affordance; the row
 *                           says what is missing and offers the period instead.
 *
 * ---------------------------------------------------------------------------------------
 * THE ROW SAYS WHAT MOLE OFFICE READ. IT NO LONGER SAYS WHAT WAS NOT SCHEDULED.
 * ---------------------------------------------------------------------------------------
 *
 * Every row ended "Nothing has been scheduled from it yet", and the panel above the list says the
 * same thing once, for all of them. That repetition was not merely wordy: on a week whose total read
 * "12h planned this week" it put a denial of that total eleven lines under it, about the very work
 * the hours were on. The owner read the two as opposite statements about one item, which is exactly
 * what they look like. The list's own sentence now carries it, once, and says how both can be true.
 *
 * THERE IS NO FOURTH SHAPE SAYING "THIS HAS JUST BEEN SCHEDULED", AND THAT WAS SETTLED IN A BROWSER.
 * One was written for this pass and then taken out again. The press makes the panel above ask the
 * server for the list again; `useAsync` goes to its loading state on every re-run, so the whole list
 * — this row with it — is replaced by a loading block before any such sentence could be read.
 * Driven at 1440 on 17 August 2026: after the press the row is gone and what stands in its place is
 * the panel's own confirmation, in the server's words. A branch nothing can reach is a claim nobody
 * can check, and `scheduled` below survives only for what it always did — not offering the press
 * twice while the reply is in flight.
 */
function KeptWords({
  intent,
  today,
  editing,
  onCommitted,
}: {
  intent: PlanningIntentWithPeriodReading
  today: TodayKeys | null
  editing: boolean
  onCommitted: (note: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  /**
   * True once this row's words have been scheduled. It only stops the press being offered twice.
   *
   * WHAT IT DOES NOT DO IS SAY WHAT HAPPENED. The server's sentence goes up to the panel, because
   * a committed intent leaves this list and a confirmation drawn here would be unmounted by its own
   * success — and drawing it in both places would put one sentence on the screen twice.
   */
  const [scheduled, setScheduled] = useState(false)

  const commit = (): void => {
    void (async () => {
      setBusy(true)
      setFailed(null)
      try {
        const done = await moleOfficeRequest<{ note: string }>(`/api/planning/intents/${intent.id}/commit`, {
          method: 'POST',
        })
        setScheduled(true)
        onCommitted(t('schedule.intentScheduled'))
      } catch (err) {
        setFailed(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(false)
      }
    })()
  }

  return (
    <li className="px-pl-keptrow">
      <span className="px-pl-keptsaid">“{intent.said}”</span>
      {/* WHAT THIS ROW IS WAITING ON, said as a state rather than left to be worked out from the
          two sentences under it. */}
      <span className="px-pl-keptstate">{stateOfKeptWords(intent)}</span>
      {intent.period === null ? (
        <span className="px-pl-on">
          {intent.periodReading.period === null
            ? t('schedule.noPeriodRead')
            : t('planKept.periodNamedWithoutAssignment', {
                period: periodSaid(intent.periodReading.period, today).range,
              })}
        </span>
      ) : (
        intent.periodReading.namesStoredPeriod ? (
          // THE DAYS IT COVERS, NOT THE PERIOD'S NAME. A day is called "Tue 18 August" and covers
          // "Tue, 18 August 2026", so a sentence carrying both said the same thing twice. The press
          // below carries the name, where it is short and it is what you are opening.
          <span className="px-pl-on">
            {t(intent.hours === null ? 'schedule.readPeriodOnly' : 'schedule.readPeriodHours', {
              period: periodSaid(intent.period, today).range,
              n: intent.hours ?? 0,
            })}
          </span>
        ) : (
          <>
            <span className="px-pl-on">
              {t('planKept.periodGiven', { period: periodSaid(intent.period, today).range })}
            </span>
            <span className="px-pl-on">
              {intent.periodReading.period === null
                ? t('planKept.wordsNameNoPeriod')
                : t('planKept.wordsNamePeriod', {
                    period: periodSaid(intent.periodReading.period, today).range,
                  })}
            </span>
            <span className="px-pl-on">
              {intent.hours === null ? t('planKept.noHoursHeld') : t('planKept.hoursHeld', { n: intent.hours })}
            </span>
          </>
        )
      )}
      {intent.period !== null && intent.recordId === null ? (
        <span className="px-pl-on">{t('schedule.noNamedWork')}</span>
      ) : null}
      <span className="px-pl-keptacts">
        {intent.period === null ? null : (
          <RouteLink to={planPeriodPath(intent.period)} className="px-pl-step">
            {t('schedule.openPeriod', { period: periodSaid(intent.period, today).name })}
          </RouteLink>
        )}
        {editing && !scheduled && intent.period !== null && intent.recordId !== null ? (
          <Btn size="sm" pending={busy} onClick={commit}>{t('schedule.giveTime')}</Btn>
        ) : null}
      </span>
      {failed === null ? null : <Refusal message={failed} />}
    </li>
  )
}

// ============================================================================ the week as a board

/**
 * THE WEEK AS SEVEN COLUMNS, WITH WORK DRAWN ACROSS THE DAYS SOMEBODY MEANS TO DO IT ON.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * If a piece of work (for example Test clamp) will be worked on from this Thursday until
 * next Wednesday, the person should be able to place it across that span without first working out
 * exactly how many hours belong on each day. The schedule was a ledger of hours: the only way to say when was to write a number
 * on every day. So the coarse answer now has a place of its own, and the fine one is still there
 * beside it.
 *
 * ---------------------------------------------------------------------------------------
 * A BLOCK CARRIES NO HOURS AND IS IN NO TOTAL
 * ---------------------------------------------------------------------------------------
 *
 * One block is one row of `work_windows`: a first day and a last day, both included. **A span means
 * "I mean to work on this then". It does not mean the work fills those days**, nothing here returns
 * a number of hours, and no total on this page reads it — the hours panel below counts
 * `allocations` and nothing else. The schema comment, the route's note and
 * `tests/work-windows.test.ts` all say the same thing, and this surface is the fourth place it has
 * to stay true.
 *
 * ---------------------------------------------------------------------------------------
 * A SPAN THAT LEAVES THE WEEK IS DRAWN AS LEAVING IT
 * ---------------------------------------------------------------------------------------
 *
 * The route answers with every window that OVERLAPS these seven days, so a Thursday-to-next-
 * Wednesday span is on two boards. Each board draws the part inside its own days and says in words
 * that the rest is outside — clipping it silently would draw a four-day span as a four-day plan.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY GESTURE HAS A KEYBOARD EQUIVALENT AND THE INTERFACE SAYS SO
 * ---------------------------------------------------------------------------------------
 *
 * A block can be dragged between days with a pointer. The same two changes are the arrow keys on a
 * focused block, and the same two changes again are named presses in the block's own panel — so
 * nothing on this board needs a mouse, and nothing needs a manual either: the sentence above the
 * board is where the keys are written down.
 */

/** What the board panel is called. One string, so a test cannot check a second one. */
// The English export supports callers that need a fixed label. The heading reads the current language.
export const BOARD_TITLE = en['schedule.boardTitle']

/**
 * WHAT `GET /api/planning/windows` ANSWERS WITH, taken from the one typed surface that asks for it.
 *
 * Read off `api.windows` rather than written out again here, so the day this route answers with one
 * more field the shape in this file cannot come to disagree with the shape in `src/web/api.ts`.
 */
export type WindowsOnDays = Awaited<ReturnType<typeof api.windows>>

/**
 * HOW MANY BLOCKS ARE DRAWN ON THESE DAYS, or null while nobody knows yet.
 *
 * NULL IS "NOT READ", AND IT IS NOT ZERO. A panel that said "no blocks give hours here" before the
 * blocks had come back would be answering a question nobody had the facts for, which is the fifth
 * invariant. Every caller draws nothing at all while this is null.
 *
 * It counts what `boardOf` DRAWS, so the sentence in the hours panel and the number on the board's
 * own heading are one count read once.
 *
 * IT IS HANDED THE ANSWER THE BOARD IS DRAWING, NOT THE STATE OF THE REQUEST, and that is a fix
 * rather than a tidy-up. It used to read the request state directly while the board drew the answer
 * it was holding, and the two came apart: measured in Chromium on 18 August 2026, for one frame
 * after a block was moved off the week, the board drew one block and this sentence said there were
 * two. One answer, counted once, is what stops that.
 */
export function placedOnTheBoard(answer: WindowsOnDays | null, days: readonly string[]): number | null {
  if (answer === null) return null
  return boardOf(days, answer.windows, answer.owners ?? {}).length
}

/**
 * HOW TO WORK THE BOARD, IN THE INTERFACE RATHER THAN IN A MANUAL.
 *
 * It says the keys because a board that can only be driven with a mouse fails this repository's
 * accessibility standard, and a keyboard equivalent nobody can find is the same failure with an
 * extra step. It says the narrow shape because seven columns do not fit a phone and a reader who
 * met the list without being told would think the board had gone.
 */
export const BOARD_HELP = en['schedule.boardHelp']

/** What one span is called, in days a person reads. Nothing here turns days into hours. */
export function windowSaid(window: Pick<WorkWindow, 'startsOn' | 'endsOn'>): string {
  const from = dateOf(window.startsOn)
  const to = dateOf(window.endsOn)
  const left = from.getMonth() === to.getMonth() && window.startsOn !== window.endsOn
    ? writtenDay(from, { weekday: 'short', day: 'numeric' })
    : writtenDay(from, A_DAY)
  if (window.startsOn === window.endsOn) return t('schedule.oneDayWindow', { date: left })
  // SPACED BY THE OFFICE'S RULE where a day meets the Chinese around it: "至 10 月 5 日", "共 3 天".
  return wordWithSpacedValues(t, 'schedule.windowRange', { from: left, to: writtenDay(to, A_DAY), n: String(windowDays(window)) })
}

/** Where a span sits inside a run of days, and whether it carries on outside them. */
export interface BlockPlace {
  /** The first column it is drawn in, counting from 1. */
  from: number
  /** The last column it is drawn in, counting from 1. Never before `from`. */
  to: number
  /** True when the span begins before the first of these days. */
  startsBefore: boolean
  /** True when the span ends after the last of these days. */
  endsAfter: boolean
}

/**
 * Where one window is drawn on a run of days, or `null` because it does not touch them at all.
 *
 * OVERLAP, NOT CONTAINMENT, exactly as `windowsOverlapping` on the server reads it. A span that
 * began last week is on this week's board, clamped to the columns that exist, with `startsBefore`
 * telling the caller to draw it as continuing.
 *
 * A day the run does not hold comes back as `null` rather than as a nearby column: absence beats a
 * guess, and a block drawn one day out is a lie a reader cannot see.
 */
export function placeOn(days: readonly string[], window: Pick<WorkWindow, 'startsOn' | 'endsOn'>): BlockPlace | null {
  if (days.length === 0) return null
  const first = days[0] as string
  const last = days[days.length - 1] as string
  if (window.endsOn < first || window.startsOn > last) return null
  const from = window.startsOn <= first ? 0 : days.indexOf(window.startsOn)
  const to = window.endsOn >= last ? days.length - 1 : days.indexOf(window.endsOn)
  if (from === -1 || to === -1 || to < from) return null
  return {
    from: from + 1,
    to: to + 1,
    startsBefore: window.startsOn < first,
    endsAfter: window.endsOn > last,
  }
}

/** One block on the board: the window, the work it names, where it is drawn, and on which row. */
export interface PlacedBlock {
  window: WorkWindow
  work: AllocatedWork | null
  place: BlockPlace
  /** Which row of the board it takes, counting from 0. Two blocks that overlap never share one. */
  lane: number
  /**
   * WHOSE WINDOW THIS IS, read from the stamp the reply carries beside the windows, or `null` when
   * the caller had no owner to give. It is `WindowOwner`, not a word and not a colour: the block
   * draws the person's windows exactly as it always has and an agent's in the second colour.
   */
  owner: WindowOwner | null
}

/**
 * Lay the windows out on the board: which column each starts and ends in, and which row it takes.
 *
 * A PURE FUNCTION, so the layout can be checked without a browser — the same reason `periodShown`
 * and `whenSaid` on the plan page are pure. The packing is the dullest one that works: sort by the
 * day a span starts, then by the longer span, then by id so the answer never depends on the order
 * rows came back in, and put each block on the first row whose last block has already ended.
 *
 * A WINDOW THAT DOES NOT TOUCH THESE DAYS IS LEFT OUT, not drawn at column zero. The route answers
 * about overlap, so that should not happen; if it ever does, the board draws one block fewer rather
 * than one block in the wrong place.
 */
export function boardOf(
  days: readonly string[],
  windows: readonly WindowWithWork[],
  /**
   * The owner stamp per window id, from the reply's `owners`. OPTIONAL: a caller that only counts
   * or lays out blocks has no owner to give, and inventing one would be a claim about who placed a
   * window that nothing read. A window with no stamp comes back with `owner: null`, which is
   * absence rather than the person's own.
   */
  owners: Readonly<Record<string, string | null>> = {},
): PlacedBlock[] {
  const sorted = [...windows].sort((a, b) => {
    if (a.window.startsOn !== b.window.startsOn) return a.window.startsOn < b.window.startsOn ? -1 : 1
    if (a.window.endsOn !== b.window.endsOn) return a.window.endsOn < b.window.endsOn ? 1 : -1
    return a.window.id.localeCompare(b.window.id)
  })
  const out: PlacedBlock[] = []
  /** The last column each row is occupied to. A row is free again once its block has ended. */
  const lanes: number[] = []
  for (const one of sorted) {
    const place = placeOn(days, one.window)
    if (place === null) continue
    let lane = lanes.findIndex((end) => end < place.from)
    if (lane === -1) {
      lane = lanes.length
      lanes.push(place.to)
    } else {
      lanes[lane] = place.to
    }
    const stamp = owners[one.window.id]
    out.push({
      window: one.window,
      work: one.work,
      place,
      lane,
      owner: stamp === undefined || stamp === null ? null : ownerOfWindow(stamp),
    })
  }
  return out
}

/**
 * WHERE A BLOCK WENT WHEN A CHANGE TOOK IT OFF THIS WEEK, or `null` because it is still on it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS, MEASURED ON 18 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * A tester stretched a block and moved it right until it crossed Sunday. The board answered
 * "Nothing is placed across this week yet." The block was on the next week, and it was correct, and
 * nothing on the screen said so — the person had to guess where to look for their own work.
 *
 * IT IS THE BOARD'S OWN READING OF WHERE A SPAN SITS. `placeOn` is what decides whether a block is
 * drawn, so a block this says has gone is exactly a block the board did not draw. The two cannot
 * come to different answers about the same span.
 *
 * THE WEEK IT LANDED ON IS NAMED AGAINST THE WEEK ON SCREEN, never against today. "The week after
 * this one" is true whichever week you are reading; "next week" would be false the moment you are
 * looking at October, and this component is not told what day it is.
 */
export function wentOffTheWeek(
  period: string,
  window: Pick<WorkWindow, 'startsOn' | 'endsOn'>,
  called: string | null,
): { said: string; period: string } | null {
  const days = daysOf(period)
  if (days.length === 0) return null
  if (placeOn(days, window) !== null) return null
  const landed = periodKey('week', dateOf(window.startsOn))
  const where =
    landed === shift(period, 1)
      ? t('schedule.weekAfter')
      : landed === shift(period, -1)
        ? t('schedule.weekBefore')
        : periodSaid(landed, null).name
  return {
    said: t('schedule.movedWeek', { work: called ?? t('schedule.thatBlock'), where, range: periodSaid(landed, null).range }),
    period: landed,
  }
}

/**
 * WHAT THE WORK ITSELF SAYS WHEN IT IS FINISHED, READ FROM THE KIND'S OWN DECLARATION.
 *
 * A task and a block finish at `done`. An obligation ends `fulfilled` or `cancelled`. A problem
 * ends `fixed`, `worked_around` or `accepted`. A direction has no state field at all — it records
 * how far it has been taken, on a different ladder. **So there is no one word that finishes a piece
 * of work, and a Done press that wrote `done` on all five would be writing a value the server
 * refuses on three of them.**
 *
 * The words come from `KIND_SPECS`, which is the declaration `POST /api/records` validates against,
 * and the choice of which of them mean finished comes from `progressOf`, which is the one function
 * in this product that says what a state word means. Nothing about the vocabulary is written here,
 * so a kind that gains a word gains it on this press too.
 *
 * An empty answer is a real answer: it means this kind has no word for finished, and the caller
 * draws no Done rather than inventing one.
 */
export function endingWordsOf(kind: string): string[] {
  const spec: KindSpec | undefined = KIND_SPECS[kind as RecordKind]
  const field = spec?.fields?.find((one) => one.key === 'state')
  if (field === undefined) return []
  const declared = declaredTypeOf(field)
  if (declared.kind !== 'literals') return []
  return declared.values.filter((word) => progressOf(word) === 'finished')
}

/** True when this piece of work's own state says it is finished. Never inferred from a slice. */
function workIsDone(work: AllocatedWork | null): boolean {
  return work !== null && progressOf(work.state) === 'finished'
}

/**
 * SAY THE WORK ITSELF IS DONE. One press, on the row and on the block.
 *
 * ---------------------------------------------------------------------------------------
 * THIS COMPLETES THE WORK, NOT THE SLICE, AND THAT IS NOT AN INFERENCE
 * ---------------------------------------------------------------------------------------
 *
 * Settled decision §34 says finishing an allocation finishes THAT SLICE OF TIME and nothing else,
 * and that whole-work completion is never INFERRED from a finished slice. It is not inferred here:
 * a person pressed a button whose word is Done, on a row naming a piece of work, which is them
 * saying the work is finished. So this writes the record's own state through the ordinary record
 * route, and it writes nothing else — what became of this week's hours stays its own fact, in the
 * row's overflow, where "didn't happen" also lives.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE A KIND ENDS MORE THAN ONE WAY, THE PERSON CHOOSES
 * ---------------------------------------------------------------------------------------
 *
 * One press for a task and for a block, because `done` is the only word either of them finishes at.
 * An obligation and a problem end several ways and Mole Office will not pick one: the press opens the
 * words that kind declares, each as its own press. That is still one decision, and it is the
 * person's rather than this component's.
 */
function DoneForWork({ work, recordId, onWrote }: {
  work: AllocatedWork | null
  recordId: string
  onWrote: () => void
}) {
  const [choosing, setChoosing] = useState(false)
  const [ended, setEnded] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  // A reread replaces the temporary result, including when another write changed the work again.
  useEffect(() => setEnded(null), [work])
  if (work === null) return null
  const endings = endingWordsOf(work.kind)
  const complete = ended !== null || workIsDone(work)
  const windowMs = 10_000

  // Both writes name the version they replace. Undo uses the first write's answer, never a fresh read.
  const finish = async (word: string) => {
    if (inFlight.current) throw new Error(t('schedule.busy'))
    inFlight.current = true
    setBusy(true)
    const address = `/api/records/${encodeURIComponent(recordId)}`
    const headers = { [WORKSPACE_HEADER]: work.workspaceId }
    try {
      const before = await moleOfficeRequest<RecordReply>(address, { headers })
      if (!endingWordsOf(before.record.kind).includes(word) || progressOf(before.record.data.state) === 'finished') {
        throw new Error(t('schedule.workChanged'))
      }
      const prior = before.record.data.state ?? null
      const after = await moleOfficeRequest<RecordReply>(address, {
        method: 'PATCH', headers, body: JSON.stringify({ dataPatch: { state: word }, ifVersion: before.version }),
      })
      setEnded(word)
      onWrote()
      return {
        remainingMs: windowMs,
        undo: async () => {
          await moleOfficeRequest<RecordReply>(address, {
            method: 'PATCH', headers, body: JSON.stringify({ dataPatch: { state: prior }, ifVersion: after.version }),
          })
          setEnded(null)
          onWrote()
        },
      }
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  if (endings.length === 0) return (
    <span className="px-pl-hint">
      {t('schedule.noEnding', { kind: kindWord(work.kind).text })}{' '}
      <RouteLink to={recordPath(recordId)} className="px-pl-step">{t('schedule.openWork')}</RouteLink>
    </span>
  )

  return (
    <div className="px-pl-donewrap">
      {complete ? <span className="px-pl-isdone">{stateWord(ended ?? work.state).text}</span> : null}
      {endings.length > 1 && !choosing && !complete ? (
        <Btn size="sm" onClick={() => setChoosing(true)}>{t('schedule.done')}</Btn>
      ) : null}
      {/* The row and its presses stay mounted when the reread says the work has ended. */}
      {endings.length === 1 || choosing ? (
        <div className="px-pl-ending-choices" role="group" aria-label={t('schedule.endingLabel', { work: work.name })}>
          {endings.map(word => (
            <TieredPress key={word} tier="undo" size="sm" available={!complete} disabled={busy}
              windowMs={windowMs} press={endings.length === 1 ? t('schedule.done') : stateWord(word).text}
              pending={t('schedule.endingBusy')} done={t('schedule.endedWork', { work: work.name, state: stateWord(word).text })}
              undo={seconds => t('schedule.undo', { n: seconds })} undoing={t('schedule.undoing')}
              onPress={() => finish(word)} />
          ))}
        </div>
      ) : null}
      {choosing && !complete ? <span className="px-pl-hint">{t('schedule.chooseEnding', { kind: kindWord(work.kind).text })}</span> : null}
    </div>
  )
}

/**
 * The three words a WINDOW can be at, as presses. A separate table from `ALLOCATION_WORDS`.
 *
 * THE SAME THREE WORDS AND A SEPARATE DECLARATION ON PURPOSE, which is the reason `WINDOW_STATES`
 * in shared/planning.ts gives for being its own array: a span somebody meant to work in and hours
 * given to a period are two facts about two different things, and one of them may gain a word
 * without the other having to.
 */
const WINDOW_WORDS = [
  { state: 'planned', word: 'schedule.stillToDo' },
  { state: 'done', word: 'schedule.happened' },
  { state: 'dropped', word: 'schedule.didNotHappen' },
] as const

/** What a window's stored state is called on screen. The Goals page reads it here too. */
export function windowStateKey(state: string): WordKey {
  return WINDOW_WORDS.find(one => one.state === state)?.word ?? 'schedule.unknownState'
}

/**
 * ONE BLOCK, OPEN: what it is, when it runs, the note, and the presses that change all three.
 *
 * The board itself is deliberately small — a name, when it runs, and the note if there is one — so
 * everything a person does to a block happens here, under it, once. That is the same shape the rest
 * of this page uses: the list locates, and the thing you opened explains.
 *
 * THE MOVE AND STRETCH PRESSES ARE THE KEYBOARD'S ARROW KEYS UNDER ANOTHER NAME. Both go through
 * `onMove` and `onStretch` on the board above, so a drag, an arrow key and a press are one write
 * and cannot come to three different answers.
 *
 * EXPORTED SO A TEST CAN DRAW ONE WITHOUT A SERVER, the same reason `RunLine` on the agent page is.
 * The board itself reads the week before it can draw a block, so a test of the board draws its
 * loading state and nothing else — and what is worth pinning here is a property of this panel: the
 * press that talks to an agent is on it at rest, and its note says which stored field it is.
 */
export function OpenBlock({
  block,
  editing,
  busy,
  failed,
  onMove,
  onStretch,
  onNote,
  onState,
  onRemove,
  onWrote,
}: {
  block: PlacedBlock
  editing: boolean
  busy: boolean
  failed: string | null
  onMove: (by: -1 | 1) => void
  onStretch: (by: -1 | 1) => void
  onNote: (next: string | null) => void
  onState: (next: string) => void
  onRemove: () => void
  onWrote: () => void
}) {
  const { window: win, work } = block
  const [note, setNote] = useState(win.note ?? '')
  // The stored note is what the box shows again when the server answers, so a note written on one
  // block does not survive into the next one somebody opens.
  useEffect(() => setNote(win.note ?? ''), [win.id, win.note])
  const oneDay = win.startsOn === win.endsOn
  const owner = useWindowOwnerWords()

  /**
   * WRITING THE NOTE WHILE THE WEEK IS BEING READ, WITHOUT TURNING THE PAGE INTO A FORM.
   *
   * ---------------------------------------------------------------------------------------
   * WHAT WAS WRONG, MEASURED ON 18 AUGUST 2026
   * ---------------------------------------------------------------------------------------
   *
   * The box was drawn only while the address ended in /edit. With no note stored and the week being
   * read, nothing was drawn at all. A tester opened a block, found Done, the press that talks to an
   * agent, four move presses and a menu holding three words, concluded a scheduled block had nowhere
   * to keep a note, and wrote theirs into the record's summary instead — a different object from the
   * thing they had scheduled. The opposite is needed: a scheduled task should have an
   * obvious, lightweight place for this kind of note, and the note should not be buried in a
   * separate technical record page.
   *
   * ---------------------------------------------------------------------------------------
   * WHAT IS HERE NOW, AND WHY IT IS A PRESS AND NOT A BOX
   * ---------------------------------------------------------------------------------------
   *
   * At rest there is a press and no box. That is the page's own rule, and
   * `tests/read-before-edit.test.ts` counts it in a browser: while the address does not say edit,
   * no surface on the page draws a field. A
   * press that records one fact is allowed at rest and this page already has one — Done. So the
   * capability is visible and the rule is kept.
   *
   * The press opens the box IN PLACE, where the note is read, and it is the same box the editing
   * view draws with the same write behind it. One box, one write, one place.
   *
   * THE BOX CLOSES WHEN THE SERVER HAS THE WORDS, not when the press was made. `asked` holds what
   * was sent, and the box goes back to being a note when the stored note is that. A refused write
   * leaves the box open with the words still in it, because closing it would throw away what
   * somebody wrote and tell them it had landed.
   */
  const [writing, setWriting] = useState(false)
  const [asked, setAsked] = useState<string | null>(null)
  useEffect(() => {
    setWriting(false)
    setAsked(null)
  }, [win.id])
  useEffect(() => {
    if (asked !== null && (win.note ?? '') === asked) {
      setWriting(false)
      setAsked(null)
    }
  }, [win.note, asked])
  return (
    /* THE BLOCK ON THE WEEK IS THE THING, and saying so is the whole wiring: one listener at the
       document reads this attribute. The note below carries which stored string it is and where it
       starts, so selecting words in it comments on those words. */
    <div
      className="px-pl-open"
      data-owner={block.owner?.kind === 'agent' ? 'agent' : undefined}
      {...targetAttributes({ kind: 'scheduleBlock', windowId: win.id })}
    >
      <PlanningStyle />
      <div className="px-pl-openhead">
        {/* QUIET, LIKE THE SCHEDULED ROW, AND FOR A MEASURED REASON. Drawn with the full identity
            this read "<project> block done done" the moment the work was finished: the state chip and
            the word beside the Done press are the same fact, and the press's own word is the one a
            person is looking at when they press it. Measured in Chromium on 18 August 2026. */}
        <WorkIdent work={work} recordId={win.recordId} struck={workIsDone(work)} quiet />
        <DoneForWork work={work} recordId={win.recordId} onWrote={onWrote} />
      </div>
      {/* WHOSE WINDOW THIS IS, IN WORDS. Criterion P5: an agent's window draws its own rail and its
          own name, so the second colour is never the only channel. The person's window says so
          too, because a reader opening a block is asking whose time it is. Absent, whether null or
          missing, draws nothing rather than the person: a caller that built a block with no owner
          must not have one invented for it. */}
      {block.owner == null ? null : <p className="px-pl-bowner">{owner(block.owner)}</p>}
      <p className="px-pl-openwhen">
        <strong>{windowSaid(win)}</strong>
        {/* THE ONE SENTENCE THIS SURFACE MUST NEVER STOP SAYING. A span is when, not how much, and
            a reader who took it for hours would think the week was full. */}
        <span className="px-pl-hint">{t('schedule.windowMeaning')}</span>
      </p>
      {win.state === 'planned' ? null : (
        <p className="px-pl-hint">
          {t('schedule.spanState', { state: t(windowStateKey(win.state)) })}
        </p>
      )}

      <div className="px-pl-openacts">
        <Btn size="sm" disabled={busy} reason={t('schedule.busy')} onClick={() => onMove(-1)}>{t('schedule.moveEarlier')}</Btn>
        <Btn size="sm" disabled={busy} reason={t('schedule.busy')} onClick={() => onMove(1)}>{t('schedule.moveLater')}</Btn>
        <Btn
          size="sm"
          disabled={busy || oneDay}
          reason={oneDay ? t('schedule.minimumSpan') : t('schedule.busy')}
          onClick={() => onStretch(-1)}
        >{t('schedule.endEarlier')}</Btn>
        <Btn size="sm" disabled={busy} reason={t('schedule.busy')} onClick={() => onStretch(1)}>{t('schedule.endLater')}</Btn>
      </div>

      {/* WHAT TO KNOW WHEN YOU COME BACK TO THIS BLOCK. The owner's example is "Grip starts slipping
          above 15N; recalibrate before the next test." It is stored on the window, it is shown on
          the block on the board, and it is not on some other page. The box grows with what is in
          it, which is the rule ui.tsx keeps for every multiline box a person writes in. */}
      {editing || writing ? (
        <label className="px-pl-opennote">
          <span className="px-pl-hint">{t('schedule.windowNote')}</span>
          <TextArea
            value={note}
            onChange={setNote}
            rows={2}
            growTo={6}
            placeholder={t('schedule.noteExample')}
            aria-label={t('schedule.noteInput', { work: work === null ? t('schedule.thisBlock') : work.name })}
          />
          {note === (win.note ?? '') ? null : (
            <Btn
              size="sm"
              disabled={busy}
              reason={t('schedule.busy')}
              pending={busy}
              onClick={() => {
                const next = note.trim() === '' ? null : note.trim()
                setAsked(next ?? '')
                onNote(next)
              }}
            >{t('schedule.saveNote')}</Btn>
          )}
        </label>
      ) : (
        <div className="px-pl-notewhenread">
          {win.note === null ? null : (
            // `data-text-field` NAMES THE STORED FIELD, NOT THE CLASS ON THE ELEMENT. The server
            // looks the quoted words up in the window's own `note`, so this element holds that
            // string and nothing else — no label, no punctuation of its own. A wrapper carrying any
            // other character would move every offset and the comment would be reported as pointing
            // at text that had changed, about a note nobody had touched.
            <p className="px-pl-opennoteread" {...textAttributes('note', 0)}>
              {win.note}
            </p>
          )}
          {/* THE PRESS THE WHOLE NOTE HANGS ON. With nothing written it is the only sign that a
              block can hold a note at all, which is what a tester went looking for and did not
              find. With something written it is how that gets corrected without turning the whole
              week into a form. */}
          <Btn size="sm" variant="ghost" onClick={() => setWriting(true)}>
            {win.note === null ? t('schedule.addNote') : t('schedule.changeNote')}
          </Btn>
        </div>
      )}

      <details className="px-pl-menu px-pl-openmore">
        <summary aria-label={t('schedule.moreWork', { work: work === null ? t('schedule.thisBlock') : work.name })}>⋯</summary>
        <div className="px-pl-menu-body">
          <span className="px-pl-hint">{t('schedule.windowOutcome')}</span>
          <span className="px-pl-states" role="group" aria-label={t('schedule.windowOutcome')}>
            {WINDOW_WORDS.map((one) => (
              <button
                key={one.state}
                type="button"
                className="px-pl-state"
                aria-pressed={win.state === one.state}
                disabled={busy}
                onClick={() => {
                  if (win.state !== one.state) onState(one.state)
                }}
              >
                {t(one.word)}
              </button>
            ))}
          </span>
          {editing ? (
            <Btn size="sm" variant="ghost" disabled={busy} reason={t('schedule.busy')} onClick={onRemove}>{t('schedule.removeWindow')}</Btn>
          ) : null}
        </div>
      </details>

      {failed === null ? null : <Refusal message={failed} />}
    </div>
  )
}

/**
 * THE ANSWER THE BOARD MAY DRAW: the last one the server gave, while it is about the days on screen.
 *
 * A reply carries the days it was asked about, so this compares them rather than trusting that the
 * board has not been handed another week in the meantime. `null` means nobody has read THESE days
 * yet, which is not the same fact as a week with nothing on it — the caller draws its loading state
 * for the first and an empty week for the second.
 */
export function boardAnswerFor(held: WindowsOnDays | null, days: readonly string[]): WindowsOnDays | null {
  if (held === null || days.length === 0) return null
  return held.from === days[0] && held.to === days[days.length - 1] ? held : null
}

/**
 * THE BOARD: Monday to Sunday, with work drawn across the days it is meant to happen on.
 *
 * It draws the blocks `WeekBuild` read for this week. It computes no hours, reads no allocation and
 * adds nothing to any total — see the head of this section.
 *
 * IT USED TO DO THE READING ITSELF, and that is why the hours panel below it could say a week with
 * a block on it held nothing: no other panel on the page could see what the board had. The read
 * moved one level up so both panels are drawn from the same answer.
 */
export function WeekBoard({
  period,
  windows,
  board,
  onBlockChanged,
  onBlockUnplaced,
  readWindowsAgain,
  editing,
  todayDay,
  allocatable,
  onWrote,
}: {
  period: string
  /**
   * How the read of this week is going, which is what the board draws when it cannot draw blocks:
   * the error, with the way to try again.
   */
  windows: AsyncState<WindowsOnDays | null>
  /**
   * THE WEEK THIS BOARD DRAWS: the last answer the server gave about these days, or null because
   * nobody has read them yet. It is `WeekBuild` that holds it, so the panel of hours below counts
   * exactly what this draws — see the note on `held` there.
   */
  board: WindowsOnDays | null
  /** Say the server has just answered about one block, with the window it answered with. */
  onBlockChanged: (next: WorkWindow) => void
  /** Say a block has been taken off the board. */
  onBlockUnplaced: (id: string) => void
  /** Read them again, after this board has changed one. */
  readWindowsAgain: () => void
  /** True when the address ends in `/edit`. The note box and taking a block off are drawn only then. */
  editing: boolean
  /** The server's own day, so today's column can say so. `null` until it has answered. */
  todayDay: string | null
  /**
   * Kinds the schedule can hold, from the plan's own reply. `null` while it has not been read.
   *
   * A WINDOW AND AN ALLOCATION REFUSE THE SAME KINDS, out of the same declaration — `windows.ts`
   * reads `ALLOCATABLE_KINDS` and its own test holds it to that. So the drawer draws no press the
   * board would refuse, for the same reason the hours panel draws none the allocation would.
   */
  allocatable: readonly string[] | null
  onWrote: () => void
}) {
  const days = daysOf(period)
  const owner = useWindowOwnerWords()
  const state = windows
  const readAgain = readWindowsAgain
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  /** Which day a dragged block is over, so the column it would land on can say so. */
  const [over, setOver] = useState<string | null>(null)
  /** Where the last change put a block, when it put it off this week. Null when none has. */
  const [gone, setGone] = useState<{ said: string; period: string } | null>(null)
  // IT IS ABOUT THE WEEK IT WAS SAID ON, AND IT DOES NOT TRAVEL. The sentence says "the week after
  // this one", so carried onto the next week it would be a false statement about the week you are
  // now reading — where the block in fact is. Today the board is unmounted on the way between weeks
  // and this never fires; that is the plan page's loading behaviour and not a promise to this one.
  useEffect(() => setGone(null), [period])

  /** The sentence saying where a block went, so focus can land on it when the block has gone. */
  const goneSaid = useRef<HTMLParagraphElement | null>(null)

  /*
   * THERE IS NO CODE HERE PUTTING THE FOCUS BACK ON A MOVED BLOCK, AND THAT WAS MEASURED.
   *
   * One was written first: a map of block buttons by window id, and an effect that put the focus
   * back on the button for the id the arrow key was pressed on. Then it was deleted, because with
   * the board no longer coming off the screen there is nothing left for it to repair.
   *
   * WHAT WAS MEASURED, IN CHROMIUM 151 ON 18 AUGUST 2026, with that effect taken out. Three arrow
   * presses walked a block from Friday to Tuesday, past the other block on the board, so the list
   * really did change order — the moved block's row went from index 1 to index 0, which is React
   * moving that element in the document. Focus stayed on the same button through all of it:
   * `document.activeElement === the same node` after every press. A browser that dropped focus when
   * an element is moved would need the effect back; this one does not, and this repository does not
   * keep code against a failure it has never seen.
   */

  /**
   * WHEN A BLOCK LEAVES THE WEEK, FOCUS LANDS ON THE SENTENCE SAYING WHERE IT WENT.
   *
   * The thing that was being pressed went with it — the block, or the move press in the panel under
   * the board — so without this a keyboard is left at the top of the document with no idea what
   * happened. The sentence takes focus and the way to follow the work is the next thing in the tab
   * order. Only when focus was dropped, never when the person moved it themselves.
   */
  useEffect(() => {
    if (gone === null) return
    const now = document.activeElement
    if (now !== null && now !== document.body) return
    goneSaid.current?.focus()
  }, [gone])

  const change = (id: string, body: Parameters<typeof api.changeWindow>[1], called: string | null): void => {
    void (async () => {
      setBusy(true)
      setFailed(null)
      setGone(null)
      try {
        const answer = await api.changeWindow(id, body)
        // THE SERVER'S OWN ANSWER FOR THIS BLOCK, on the week before the read comes back. See the
        // note on the week this board is handed, in `WeekBuild`.
        onBlockChanged(answer.window)
        setGone(wentOffTheWeek(period, answer.window, called))
        onWrote()
        readAgain()
      } catch (err) {
        setFailed(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(false)
      }
    })()
  }

  const moveBy = (block: PlacedBlock, by: number): void =>
    change(
      block.window.id,
      { startsOn: dayPlus(block.window.startsOn, by), endsOn: dayPlus(block.window.endsOn, by) },
      block.work?.name ?? null,
    )

  const stretchBy = (block: PlacedBlock, by: number): void => {
    const next = dayPlus(block.window.endsOn, by)
    // REFUSED HERE RATHER THAN CLAMPED, and the press that would do it is already disabled with the
    // same sentence. A span is at least one day; silently leaving it where it was would be a press
    // that reports success and changes nothing.
    if (next < block.window.startsOn) {
      setFailed(t('schedule.invalidSpan'))
      return
    }
    change(block.window.id, { endsOn: next }, block.work?.name ?? null)
  }

  const moveTo = (block: PlacedBlock, day: string): void => {
    const length = windowDays(block.window)
    change(
      block.window.id,
      { startsOn: day, endsOn: dayPlus(day, length - 1) },
      block.work?.name ?? null,
    )
  }

  if (state.status === 'error') {
    return (
      <PlanSection declares={{ surface: 'plan.board' }} title={t('schedule.boardTitle')}>
        <ErrorNote message={state.message} fault={state.fault} retry={readAgain} />
      </PlanSection>
    )
  }
  if (days.length === 0 || (state.status === 'ready' && state.value === null)) {
    return (
      <PlanSection declares={{ surface: 'plan.board' }} title={t('schedule.boardTitle')}>
        <ErrorNote message={t('schedule.invalidWeek')} />
      </PlanSection>
    )
  }
  const reply = board
  if (reply === null) {
    // NOBODY HAS READ THESE DAYS YET, which is not the same fact as a week with nothing on it. The
    // board says so and draws no columns, rather than an empty week nobody has looked at.
    return (
      <PlanSection declares={{ surface: 'plan.board' }} title={t('schedule.boardTitle')}>
        <Loading label={t('schedule.readBoard')} rows={2} />
      </PlanSection>
    )
  }

  const blocks = boardOf(days, reply.windows, reply.owners ?? {})
  const open = blocks.find((one) => one.window.id === openId) ?? null
  const lanes = blocks.reduce((n, one) => Math.max(n, one.lane + 1), 0)

  return (
    <PlanSection declares={{ surface: 'plan.board' }} title={t('schedule.boardTitle')} actions={<span className="px-pl-section-count">{t('scheduleDesign.blocks', { n: blocks.length })}</span>}>
      <PlanningStyle />
      {/* HOW TO WORK THE BOARD, ONLY WHERE THERE IS SOMETHING TO WORK. With nothing placed, this
          was fifty-five words about a control the reader cannot see, above the sentence saying
          there is nothing to see — including a description of what happens at 390px, read by
          somebody sitting at 1440. Absence has almost no weight unless it needs action.
          Finding 27, 19 August 2026. Nothing is deleted: the moment one block exists, the help is
          back, above the block it is about. */}

      <div className="px-pl-board">
        {/* WHERE THE WORK WENT, AT THE MOMENT IT WENT THERE. A move that crosses Sunday takes a
            block off this board, and until this the board simply had one block fewer. It is a live
            region so a screen reader hears it, it takes focus when the press that moved it has gone
            with it, and the week it landed on is one press away. */}
        {gone === null ? null : (
          <p className="px-pl-wentto" role="status" tabIndex={-1} ref={goneSaid}>
            <span>{gone.said}</span>
            <RouteLink to={planPeriodPath(gone.period)} className="px-pl-wenttolink">{t('schedule.goWeek')}</RouteLink>
          </p>
        )}
        {/* HOW MANY COLUMNS THERE ARE COMES FROM THE DAYS, in both grids, and not from a number in
            the stylesheet. Seven is what a week has; a count written in the CSS as well would be the
            same fact in two places, and the day this board is ever handed a period of another length
            the headings and the blocks would disagree about which column is which. */}
        <div className="px-pl-bhead" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((day) => {
            const at = dateOf(day)
            return (
              <span
                key={day}
                className="px-pl-bday"
                data-today={day === todayDay ? 'yes' : undefined}
                data-over={day === over ? 'yes' : undefined}
                onDragOver={(e) => {
                  e.preventDefault()
                  setOver(day)
                }}
                onDragLeave={() => setOver((now) => (now === day ? null : now))}
                onDrop={(e) => {
                  e.preventDefault()
                  setOver(null)
                  const id = e.dataTransfer.getData('text/plain')
                  const found = blocks.find((one) => one.window.id === id)
                  if (found !== undefined) moveTo(found, day)
                }}
              >
                {/* THE DAY AND ITS NUMBER AS TWO ELEMENTS RATHER THAN ONE RUN OF TEXT, so a phone
                    can stack them. At 1440 they sit on one line and nothing about them changed.
                    One fact each, written once: nothing here holds a second spelling of a day. */}
                <span className="px-pl-bdow">{weekdayWord(at.getDay())}</span>{' '}
                <span className="px-pl-bnum">{at.getDate()}</span>
                {day === todayDay ? <span className="px-pl-bnow">{' '}{t('schedule.todayLower')}</span> : null}
              </span>
            )
          })}
        </div>

        {blocks.length === 0 ? (
          <NothingOn
            sentence={t('schedule.emptyWeek')}
            // THE EMPTY WEEK SAYS SO IN WORDS. There is no press beside it here, so a dash alone
            // would leave the reader to guess what the empty board means.
            said
          />
        ) : (
          <ul
            className="px-pl-blanes"
            style={{
              gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${lanes}, auto)`,
            }}
          >
            {blocks.map((one) => (
              <li
                key={one.window.id}
                className="px-pl-blane"
                style={{ gridColumn: `${one.place.from} / ${one.place.to + 1}`, gridRow: one.lane + 1 }}
                // THE BLOCK ON THE BOARD IS THE BLOCK ON THE WEEK. It used to say so only once it
                // had been opened, so the whole board carried nothing a person could point at.
                {...targetAttributes({ kind: 'scheduleBlock', windowId: one.window.id })}
              >
                <button
                  type="button"
                  className="px-pl-block"
                  draggable
                  data-open={one.window.id === openId ? 'yes' : undefined}
                  data-before={one.place.startsBefore ? 'yes' : undefined}
                  data-after={one.place.endsAfter ? 'yes' : undefined}
                  data-state={one.window.state}
                  // WHOSE WINDOW THIS IS, AND IT IS A SECOND CHANNEL BESIDE THE COLOUR. An agent's
                  // window draws in --plan-agent and says the agent's name; the person's window is
                  // drawn exactly as it always was. Criterion P5, and tests/what-the-browser-draws.ts
                  // holds the token to every palette.
                  data-owner={one.owner?.kind === 'agent' ? 'agent' : undefined}
                  aria-expanded={one.window.id === openId}
                  aria-label={`${one.work === null ? t('schedule.workGone') : one.work.name} — ${windowSaid(one.window)}${one.owner === null ? '' : ` — ${owner(one.owner)}`}`}
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', one.window.id)}
                  onClick={() => setOpenId(one.window.id === openId ? null : one.window.id)}
                  onKeyDown={(e) => {
                    // THE KEYBOARD EQUIVALENT OF THE DRAG, on the block that has focus. Shift moves
                    // the last day, which is how a span is stretched across several days without a
                    // pointer. Both go through the same two writes the presses below use.
                    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
                    e.preventDefault()
                    // THE BLOCK KEEPS THE FOCUS BY NEVER LEAVING THE SCREEN. The board draws the
                    // answer it already has while the next one is in flight, so this button is the
                    // same element after the write as before it and the next press lands on it.
                    const by = e.key === 'ArrowLeft' ? -1 : 1
                    if (e.shiftKey) stretchBy(one, by)
                    else moveBy(one, by)
                  }}
                >
                  <span className="px-pl-bname">
                    {one.work === null ? t('schedule.gone') : one.work.name}
                  </span>
                  {/* WHOSE WINDOW IT IS, IN WORDS. The second colour is never the only channel: an
                      agent's block draws in --plan-agent AND carries the agent's own name. */}
                  {one.owner === null ? null : <span className="px-pl-bowner">{owner(one.owner)}</span>}
                  <span className="px-pl-bwhen">{windowSaid(one.window)}</span>
                  {one.place.startsBefore ? <span className="px-pl-bcont">{t('schedule.fromBefore')}</span> : null}
                  {one.place.endsAfter ? <span className="px-pl-bcont">{t('schedule.pastWeek')}</span> : null}
                  {workIsDone(one.work) ? <span className="px-pl-bdone">{t('schedule.workDone')}</span> : null}
                  {one.window.state === 'planned' ? null : (
                    <span className="px-pl-bcont">
                      {t(windowStateKey(one.window.state))}
                    </span>
                  )}
                  {one.window.note === null ? null : <span className="px-pl-bnote">{one.window.note}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {open === null ? (
        failed === null ? null : <Refusal message={failed} />
      ) : (
        <OpenBlock
          block={open}
          editing={editing}
          busy={busy}
          failed={failed}
          onMove={(by) => moveBy(open, by)}
          onStretch={(by) => stretchBy(open, by)}
          onNote={(next) => change(open.window.id, { note: next }, open.work?.name ?? null)}
          onState={(next) => change(open.window.id, { state: next }, open.work?.name ?? null)}
          onRemove={() => {
            void (async () => {
              setBusy(true)
              setFailed(null)
              setGone(null)
              try {
                await api.unplaceWindow(open.window.id)
                // Off the board, so it goes out of the week on screen as well. The read below says
                // the same thing; this is what keeps the two from disagreeing in between.
                onBlockUnplaced(open.window.id)
                setOpenId(null)
                onWrote()
                readAgain()
              } catch (err) {
                setFailed(err instanceof Error ? err.message : String(err))
              } finally {
                setBusy(false)
              }
            })()
          }}
          onWrote={() => {
            onWrote()
            readAgain()
          }}
        />
      )}

      <BacklogDrawer
        label={t('schedule.findToPlace')}
        allocatable={allocatable}
        offer={(row) => (
          <PlaceOnDay
            recordId={row.id}
            days={days}
            todayDay={todayDay}
            placed={reply.windows.map((one) => one.window.recordId)}
            onWrote={() => {
              onWrote()
              readAgain()
            }}
          />
        )}
      />
      {/* HOW TO WORK THE BOARD, AS A CLOSED FOLD AT THE FOOT, AND ONLY WHERE THERE IS SOMETHING TO
          WORK. Rule R7 of report n9Mjk3c_sJRu: an explanation is a closed one-line fold at the foot of
          its section. With nothing placed there is no control to explain (finding 27, 19 August 2026). */}
      {blocks.length === 0 ? null : (
        <details className="px-pl-foot">
          <summary>{t('scheduleDesign.howBlocksMove')}</summary>
          <p className="px-pl-hint px-pl-boardhelp">{t('schedule.boardHelp')}</p>
        </details>
      )}
    </PlanSection>
  )
}

/**
 * WHAT IS PLACED ACROSS THIS DAY, on the day's own page.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS: A VALUE THAT WORKS IN ONE VIEW AND DISAPPEARS FROM THE OTHER
 * ---------------------------------------------------------------------------------------
 *
 * `docs/UX-CONTRACT.md` lists that exact failure under *Done means usable from the ordinary
 * surface*. A span placed on the week's board covers particular days, and without this a person
 * opening one of those days would see no sign of it — the fact would exist and be invisible from
 * the page it is about.
 *
 * IT IS READ-ONLY AND IT IS NOT A SECOND BOARD. A span is a week-shaped fact: moving and stretching
 * one belongs where the seven days are, and a second place to change it would be two surfaces with
 * two ideas of when the work happens. So this says what covers today and where to change it.
 *
 * NOTHING HERE IS IN A TOTAL, and the sentence says so, because this line sits under a panel whose
 * whole subject is hours.
 */
function PlacedAcrossThisDay({
  day,
  wrote = 0,
}: {
  day: string
  /**
   * How many writes the page has made, so this reads again after one.
   *
   * Left out on Today, which has no control that writes a window: it reads once and the board is
   * where a span changes. A counter passed in from a page that cannot change the answer would be a
   * dependency that never fires, which reads like a feature and is not one.
   */
  wrote?: number
}) {
  const [state, readAgain] = useAsync(() => api.windows(day, day), [day, wrote])
  const week = atGrain(day, 'week', null)

  if (state.status === 'loading') return null
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault} retry={readAgain} />
  if (state.value.windows.length === 0) return null

  return (
    <>
      <span data-title-is="its-label" className="px-pl-sub">{t('schedule.placedDay')}</span>
      <p className="px-pl-hint">{t('schedule.placedDayHelp')}</p>
      <ul className="px-pl-rows">
        {state.value.windows.map(({ window: win, work }) => (
          <li key={win.id} className="px-pl-row">
            <WorkIdent work={work} recordId={win.recordId} struck={workIsDone(work)} quiet />
            <span className="px-pl-was">{windowSaid(win)}</span>
            <div className="px-pl-acts">
              <RouteLink to={planPeriodPath(week)} className="px-pl-step">{t('schedule.changeOnWeek')}</RouteLink>
            </div>
            {win.note === null ? null : <p className="px-pl-said">{win.note}</p>}
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * PUT THIS PIECE OF WORK ON A DAY. One press, and the day it lands on is on the control.
 *
 * IT SAYS WHICH DAY BEFORE IT WRITES ONE. A press that quietly chose Monday would be this surface
 * deciding when somebody meant to work, so the day is a control the person can see and change, and
 * it opens on today when today is in this week. A span of one day, because stretching it is two
 * arrow keys and guessing a length would be the same defect one size larger.
 */
function PlaceOnDay({
  recordId,
  days,
  todayDay,
  placed,
  onWrote,
}: {
  recordId: string
  days: readonly string[]
  todayDay: string | null
  /** Record ids already on the board. A second span is allowed; this only says one exists. */
  placed: readonly string[]
  onWrote: () => void
}) {
  const opening = todayDay !== null && days.includes(todayDay) ? todayDay : (days[0] as string)
  const [day, setDay] = useState(opening)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [made, setMade] = useState<string | null>(null)

  if (made !== null) return <span className="px-pl-on px-pl-justdid">{made}</span>

  return (
    <>
      <label className="px-pl-narrow">
        <span className="px-pl-hint">{t('schedule.dayLabel')}</span>
        <select
          className="px-pl-inproject"
          value={day}
          aria-label={t('schedule.chooseDay')}
          onChange={(e) => setDay(e.target.value)}
        >
          {days.map((one) => {
            const at = dateOf(one)
            return (
              <option key={one} value={one}>
                {writtenDay(at, A_DAY)}
              </option>
            )
          })}
        </select>
      </label>
      <Btn
        size="sm"
        disabled={busy}
        reason={t('schedule.writeBusy')}
        pending={busy}
        onClick={() => {
          void (async () => {
            setBusy(true)
            setFailed(null)
            try {
              await api.placeWindow({ recordId, startsOn: day, endsOn: day })
              const at = dateOf(day)
              setMade(
                wordWithSpacedValues(t, 'schedule.placedOn', { date: writtenDay(at, A_DAY) }),
              )
              onWrote()
            } catch (err) {
              setFailed(err instanceof Error ? err.message : String(err))
            } finally {
              setBusy(false)
            }
          })()
        }}
      >{t('schedule.place')}</Btn>
      {placed.includes(recordId) ? <span className="px-pl-on">{t('schedule.alreadyBoard')}</span> : null}
      {failed === null ? null : <Refusal message={failed} />}
    </>
  )
}

/**
 * THE WHOLE WORK LIST, BEHIND ONE PRESS.
 *
 * Anything else, the entire 244-record corpus, must not dominate the normal Schedule
 * page. The person needs a practical backlog, search or unscheduled area from which to find work and
 * place it into the week, and the schedule itself should stay the visual centre of the page.
 *
 * So the searching and the narrowing are unchanged — this is `AddFromWork`, the one panel that
 * offers work, with a shut fold around it. What the press on each row DOES is the caller's, because
 * the board places work across days and the hours panel gives it hours, and those are two different
 * facts about the same piece of work.
 *
 * ---------------------------------------------------------------------------------------
 * IT NOW LOOKS LIKE THE PRESS IT IS, AND ALL THREE TESTERS SAID IT DID NOT
 * ---------------------------------------------------------------------------------------
 *
 * "Find work and place it on this week" was quiet grey text in a thin outline. One tester lost a
 * minute looking for a way to add work to the week, another never found the drawer at all, and the
 * work list behind it is the only way into the board. `docs/UX-CONTRACT.md` calls this a control
 * a person cannot see is a control.
 *
 * IT BORROWS `.px-btn` RATHER THAN RESTATING IT, exactly as the family pages do for their link that
 * looks like a button, so a change to the buttons beside it reaches this too. What it adds is the
 * mark saying it opens: a summary with `display` set to anything but `list-item` loses the
 * browser's own triangle, so the drawing that says "this unfolds" has to be put back by hand.
 */
function BacklogDrawer({
  label,
  allocatable,
  offer,
}: {
  label: string
  allocatable: readonly string[] | null
  offer: (row: WorkRow) => React.ReactNode
}) {
  return (
    <details className="px-pl-drawer">
      <summary className="px-btn px-pl-drawersum">
        <span className="px-pl-drawermark" aria-hidden="true" />
        {label}
      </summary>
      <div className="px-pl-drawerbody">
        <AddFromWork allocatable={allocatable} offer={offer} />
      </div>
    </details>
  )
}

// ============================================================================ 6A — the week

/**
 * EVERYTHING A WEEK SURFACE IS GIVEN.
 *
 * `WeekBuild` below fetches, sorts and counts exactly once and hands this to whichever surface it
 * draws, so the week being read and the week being built cannot come to different conclusions about
 * the same numbers. No surface taking these props works anything out for itself.
 *
 * There were once two ways of building a week, offered side by side to be compared.
 * This one was chosen and the other was deleted; this interface stayed because it is still what
 * keeps the reading view and the building view honest about the same week.
 */
export interface WeekProps {
  reply: PlanReply
  said: PeriodSaid
  /** The week before this one, whose leftovers are the commonest thing a week is built from. */
  before: string
  review: AsyncState<ReviewReply>
  retryReview: () => void
  /** Record ids this week already names. */
  planned: readonly string[]
  /** Kinds a plan may hold, from the reply — never a second list written here. */
  allocatable: readonly string[]
  /**
   * How many blocks are on this week's board, or null while nobody has read them yet.
   *
   * IT IS NEVER ADDED TO ANYTHING. It exists so the panel of hours can say, in one sentence, that
   * the blocks above it give no hours — see `BlocksGiveNoHours`.
   */
  placed: number | null
  hoursText: string
  setHoursText: (next: string) => void
  hours: HoursBoxRead
  onWrote: () => void
}

/**
 * 6A — BUILD THIS WEEK, TOP TO BOTTOM.
 *
 * ONE PANEL, IN THE ORDER THE WORK HAPPENS. The build surface used to be the third panel down, under
 * a summary and a table of finer periods, on the page whose job is putting work on a week; and the
 * empty state of the panel above it was the sentence "Nothing is planned in this period", which is
 * a dead end on a page whose whole purpose is to change that. Now the week is one panel — how full
 * it is, what is in it, then how to add to it — and when it holds nothing, the add section IS the
 * empty state.
 *
 * It reviews the week BEFORE and fills the one on screen, so "plan next week" is: press next, and
 * the week you were looking at becomes the facts you are planning against. No date is ever typed.
 */
export function WeekBuild({
  reply,
  said,
  wrote,
  editing,
  todayDay = null,
  onWrote,
}: {
  reply: PlanReply
  said: PeriodSaid
  wrote: number
  /** True when the address ends in `/edit`. Reading is what every fresh visit gets. */
  editing: boolean
  /** The server's own day, so the board can mark today's column. `null` until it has answered. */
  todayDay?: string | null
  onWrote: () => void
}) {
  const period = reply.period
  const before = shift(period, -1)
  const [review, retryReview] = useAsync(() => api.review(before), [before, wrote])
  const [hoursText, setHoursText] = useState('')
  const eyebrow = useEyebrow('time against work')

  /**
   * THE BLOCKS ON THIS WEEK, READ ONCE FOR BOTH PANELS THAT NEED THEM.
   *
   * The board used to read them itself and nothing else on the page could see them, so the hours
   * panel underneath said "Nothing is on next week yet" with a block drawn an inch above it. The
   * two panels answer different questions about the same week — when the work happens, and how many
   * hours it has — and neither may deny the other. One read, handed to both, so they cannot come to
   * different ideas of what is placed on this week.
   *
   * NOTHING HERE TURNS A BLOCK INTO HOURS. No total below reads this; the hours panel counts
   * allocations exactly as it always did, and what it gains is one sentence saying so.
   */
  const days = daysOf(period)
  const [windows, readWindowsAgain] = useAsync(() => {
    const from = days[0]
    const to = days[days.length - 1]
    if (from === undefined || to === undefined) return Promise.resolve(null)
    return api.windows(from, to)
  }, [period, wrote])

  /**
   * THE ANSWER BOTH PANELS DRAW, KEPT WHILE THE NEXT ONE IS IN FLIGHT.
   *
   * ---------------------------------------------------------------------------------------
   * WHY IT IS KEPT, MEASURED IN CHROMIUM ON 18 AUGUST 2026
   * ---------------------------------------------------------------------------------------
   *
   * Every change to a block reads the week again, and `useAsync` goes back to `loading` while it
   * does — which took the whole board off the screen for about fifteen milliseconds, and with it
   * the block that had focus. `document.activeElement` was the block before an arrow key and BODY
   * after it, so the second and third presses reached nothing and a keyboard user got one nudge per
   * mouse click. The plan page already keeps its reply for the same reason: see `held` in
   * `src/web/pages/PlanPage.tsx`, where a write used to throw away the words somebody had typed.
   *
   * ---------------------------------------------------------------------------------------
   * WHY IT IS HERE AND NOT IN THE BOARD
   * ---------------------------------------------------------------------------------------
   *
   * It was in the board first, and that put what is on this week in two places: the board drew what
   * it was holding and the sentence below counted the request. Measured, they came apart — for one
   * frame after a block was moved off the week the board drew one block and the sentence said two.
   * One answer, held once, handed to both panels.
   *
   * IT IS NEVER ANOTHER WEEK'S BLOCKS. The reply says which days it is about and `boardAnswerFor`
   * only hands it back while those are the days on screen. The board still draws the read's own
   * error, so a failed re-read cannot leave a stale week looking current.
   */
  const [held, setHeld] = useState<WindowsOnDays | null>(null)
  useEffect(() => {
    if (windows.status === 'ready' && windows.value !== null) setHeld(windows.value)
  }, [windows])
  const board = boardAnswerFor(held, days)

  /**
   * THE SERVER'S ANSWER TO A CHANGE OF ONE BLOCK, FOLDED IN BEFORE THE READ COMES BACK.
   *
   * It is not a guess about what the write did: it is the window the write returned. Without it the
   * week on screen would go on saying what it said before for as long as the read takes, and a
   * second arrow key pressed straight after the first would compute its move from days that had
   * already been replaced — two presses, one day moved, and nothing saying one was thrown away.
   */
  const blockChanged = (next: WorkWindow): void =>
    setHeld((was) =>
      was === null
        ? was
        : { ...was, windows: was.windows.map((one) => (one.window.id === next.id ? { ...one, window: next } : one)) },
    )
  /** A block taken off the board, out of the week on screen as well. The read says the same thing. */
  const blockUnplaced = (id: string): void =>
    setHeld((was) => (was === null ? was : { ...was, windows: was.windows.filter((one) => one.window.id !== id) }))

  const props: WeekProps = {
    reply,
    said,
    before,
    review,
    retryReview,
    planned: reply.entries.map((e) => e.allocation.recordId),
    allocatable: reply.allocatableKinds,
    placed: placedOnTheBoard(board, days),
    hoursText,
    setHoursText,
    hours: readHoursBox(hoursText),
    onWrote,
  }

  return (
    <>
    {/* HOURS FIRST, THEN WHEN THE WORK HAPPENS, THEN THE WORK. The owner adopted this order with
        an earlier proposal (report n9Mjk3c_sJRu, block b-13): the hours answer "will this fit", the
        board answers "when", and the list is what the week holds. Neither of the first two reads
        the other: a block carries no hours and no total here counts one. */}
    <PlanSection declares={{ surface: 'plan.hours' }}
      title={hoursPanelTitle(said)}
      {...(eyebrow === undefined ? {} : { kind: eyebrow })}
    >
      {/* READING A WEEK AND BUILDING ONE ARE DIFFERENT JOBS AND DIFFERENT COMPONENTS. A fresh visit
          reads; the address ending in /edit builds. Both are handed the same props above, so they
          cannot disagree about the same week. */}
      {editing ? <BuildWeek {...props} part="hours" /> : <ReadWeek {...props} part="hours" />}
    </PlanSection>
    <WeekBoard
      period={period}
      windows={windows}
      board={board}
      onBlockChanged={blockChanged}
      onBlockUnplaced={blockUnplaced}
      readWindowsAgain={readWindowsAgain}
      editing={editing}
      todayDay={todayDay}
      allocatable={reply.allocatableKinds}
      onWrote={onWrote}
    />
    <PlanSection declares={{ surface: 'plan.work' }}
      title={t('scheduleDesign.workTitle', { unit: unitWord(said.unit) })}
      actions={<span className="px-pl-section-count">{t('scheduleDesign.pieces', { n: reply.entries.length })}</span>}
    >
      {editing ? <BuildWeek {...props} part="work" /> : <ReadWeek {...props} part="work" />}
    </PlanSection>
    </>
  )
}

/**
 * THE WEEK AS IT READS: what is on it, how full it is, and nothing that can be typed into.
 *
 * The same panels in the same order as the editing view, with the capacity field, the hours boxes,
 * the row menus and the whole add section left out — left OUT, not hidden with CSS, because a
 * screen reader would otherwise read out every field on a page that shows none.
 *
 * The two presses that survive are "how it went" on each row and the one way in to editing.
 */
function ReadWeek(props: WeekProps & { part: 'hours' | 'work' }) {
  const { reply, said } = props
  // THE SAME READING THE GAUGE ABOVE MAKES, from the same pure function over the same reply. A week
  // whose days hold hours is not an empty week, and the empty sentence has to know that or it denies
  // the line printed three inches above it. See `nothingOnItself`.
  const inside = insideOf(reply)
  if (props.part === 'hours') {
    return (
      <>
        <WeekGauge reply={reply} said={said} editing={false} />
        {/* WHY THE BOARD AND THIS TOTAL DISAGREE, said where the total is. */}
        <BlocksGiveNoHours placed={props.placed} />
        {/* WHAT THE WEEK HOLDS, OR THAT NOBODY HAS SAID — the same pair the month and the day draw,
            in the same order. The field that answers it is behind the plan press, so while reading
            this is a quiet mark and never a second sentence about the gauge above. */}
        {reply.capacity === null ? (
          <NoCapacitySaid period={t('schedule.thisWeekLower')} />
        ) : (
          <CapacityFor capacity={reply.capacity} unit="week" />
        )}
        <ProjectSplit entries={reply.entries} load={reply.fit.load} />
      </>
    )
  }
  return (
    <>
      <PlanRows entries={reply.entries} unit="week" editing={false} onWrote={props.onWrote} />
      {reply.entries.length === 0 ? (
        <NothingOn
          sentence={
            inside === null
              ? noHoursOnYet(said.name.toLowerCase())
              : nothingOnItself(said.name.toLowerCase())
          }
          action={<EditThisPeriod period={reply.period} label={addWorkTo('week')} />}
        />
      ) : null}
    </>
  )
}

/**
 * WHAT THE PERIODS INSIDE THIS ONE ALREADY HOLD — the hours, how many rows gave no number, and how
 * many pieces of work hold more inside than this period gives them.
 *
 * ONE WRITER FOR TWO SURFACES. The month has drawn "5h given to the month itself · 10h given to its
 * weeks" since 2026-08-14; the week drew nothing of the kind, so hours booked on a Tuesday were
 * invisible on the week holding that Tuesday. A tester gave a piece of work 5h in a week and 8h on
 * a day inside it: the day said 23h, the week said 28.5h of 10h and never mentioned the 8h. Both
 * surfaces now read this, so they cannot come to different figures for the same containment.
 *
 * IT IS NOT ADDED TO ANYTHING, and every caller says so beside it. A week's hours and a day's hours
 * inside it are two answers to two questions — see the head of this file and `spreadOf` in
 * shared/planning.ts — and adding them would count the same work twice.
 *
 * `null` when this period has nothing finer, or when nothing inside it holds anything. A day has no
 * finer periods at all and the reply says so with `finer: null`.
 */
function insideOf(reply: PlanReply): { hours: number; unstated: number; overPlaced: number } | null {
  const finer = reply.finer
  if (finer === null || finer.length === 0) return null
  return {
    hours: round2(finer.reduce((n, load) => n + load.plannedHours, 0)),
    unstated: finer.reduce((n, load) => n + (load.allocations - load.stated), 0),
    // A NEGATIVE REMAINDER IS THIS AND NOTHING ELSE: the finer periods hold more of this work than
    // this period ever gave it. `spreadOf` reports it rather than clamping it, and this counts the
    // rows so the headline can say how many there are before the panel below names them.
    overPlaced: (reply.spread ?? []).filter(
      (row) => row.unscheduledHours !== null && row.unscheduledHours < 0,
    ).length,
  }
}

/**
 * THE SECOND NUMBER A COARSER PERIOD HAS TO SAY: what is already committed inside it.
 *
 * Drawn under the headline, in the headline's own ink, because a person reading "28.5h planned of
 * 10h this week" is asking what this week costs and eight hours booked on a Wednesday is part of
 * the answer. The clause saying the two are not added together is what stops it being read as a
 * total, which is the one way this line could do harm.
 */
function InsideThisPeriod({
  inside,
  unit,
  finerWord,
}: {
  inside: NonNullable<ReturnType<typeof insideOf>>
  /** What this period is called: week, month. */
  unit: string
  /** What the periods inside it are called: day, week. */
  finerWord: string
}) {
  return (
    /* SEPARATED, NOT EXPLAINED. This line used to end "— this and the total above are not added
       together", a sentence whose only job was to stop somebody adding two numbers eight pixels
       apart. The comment above it said as much. `docs/UX-CONTRACT.md` forbids fixing a layout
       with a sentence, so the layout is fixed: a rule and a gap between the two, and each one
       labelled by where its hours sit — the line above says "on the week itself", this one says
       "on particular days". Nobody adds two numbers under two different headings.
       Finding 26, 19 August 2026. */
    <p className="px-pl-read px-pl-particular">
      <span className="px-pl-inside-of">{t('schedule.particularInside', { finer: unitsWord(finerWord), unit: unitWord(unit) })}</span>
      <strong>{t('schedule.hours', { n: inside.hours })}</strong>
      {inside.unstated === 0 ? '' : t('schedule.moreUnstated', { n: inside.unstated })}
      {inside.overPlaced === 0 ? null : (
        <>
          {' · '}
          {t('schedule.moreInside', { n: inside.overPlaced, finer: unitsWord(finerWord), unit: unitWord(unit) })}
        </>
      )}
    </p>
  )
}

/** How full it is, said the same way wherever it is said. */
function WeekGauge({ reply, said, editing }: { reply: PlanReply; said: PeriodSaid; editing: boolean }) {
  const { fit, capacity } = reply
  // WHAT IS ON THE DAYS INSIDE THIS WEEK. It is a second number and never part of the first: see
  // `insideOf`, which the month reads too.
  const inside = insideOf(reply)
  const insideLine =
    inside === null ? null : <InsideThisPeriod inside={inside} unit={said.unit} finerWord="day" />
  // WHAT IS PLANNED INSIDE WHAT GOES WITH THE TOTAL, in both branches. A week whose capacity nobody
  // has stated can still hold a piece of work with parts planned inside it, and the note is about
  // the total rather than about the bar.
  const twice = <PartsInsideNote load={fit.load} unit={said.unit} period={reply.period} editing={editing} />
  if (capacity === null) {
    return (
      <>
        {/* NO BAR, BECAUSE NOBODY HAS SAID WHAT THE WEEK HOLDS. An empty bar would be a picture of
            a week that fits, which is the one thing nobody knows. What is missing is said under
            this line as a quiet mark, in the same place and the same words the month and the day
            say it — it used to be a second sentence here, and this line and that mark would then
            be two drawings of one absence on one panel. */}
        <HoursPlannedLine hours={fit.load.plannedHours} period={ownTotalCalled(said.unit, inside !== null)} unstated={fit.unstated} />
        {insideLine}
        {twice}
      </>
    )
  }
  return (
    <>
      <CapacityBar
        plannedHours={fit.load.plannedHours}
        capacityHours={capacity.hours}
        freeHours={fit.freeHours}
        overcommitted={fit.overcommitted}
        unstated={fit.unstated}
        subject={ownTotalCalled(said.unit, inside !== null)}
      />
      {insideLine}
      {twice}
    </>
  )
}

/** The carried rows and the work list, which is what "add to this week" is made of. */
function WeekAdd(props: WeekProps) {
  const { reply, said, before, review, retryReview, planned, allocatable, hours, onWrote } = props
  // The week before had something in it, so there is a list to carry from and the work list below is
  // the second of two ways in. With nothing to carry there is only one way in and no heading over
  // it, because a heading reading "anything else" above the only thing there is says nothing.
  const carrying = review.status === 'ready' && review.value.counts.allocations > 0
  return (
    <>
      {review.status === 'loading' ? <Loading label={t('schedule.readingReview', { period: periodSaid(before, null).name })} rows={2} /> : null}
      {review.status === 'error' ? <ErrorNote message={review.message} fault={review.fault} retry={retryReview} /> : null}
      {review.status === 'ready' && carrying ? (
        <>
          <span data-title-is="its-label" className="px-pl-sub">{t('schedule.leftLastWeek')}</span>
          {review.value.carried.length === 0 ? (
            <NothingOn sentence={nothingToCarry(t('schedule.lastWeekLower'))} />
          ) : (
            <CarryRows
              entries={review.value.carried}
              horizon="week"
              period={reply.period}
              hours={hours}
              planned={planned}
              label={addTo(said)}
              onWrote={onWrote}
            />
          )}
        </>
      ) : null}

      {/* OUTSIDE THE REVIEW'S LOADING STATE, ON PURPOSE. Every add re-reads the week, and while that
          request is in flight the review is `loading` — so a panel drawn inside it was unmounted by
          its own success: the rows and everything typed into them vanished on the first press, and a
          person filling a week from one list had to start again for every row. Found by driving it,
          not by reading it. Nothing here depends on the review anyway.

          AND IT IS BEHIND A PRESS NOW. This was two hundred and forty-four pieces of work under a
          heading reading "Anything else", on the page whose subject is the week. A backlog
          is a thing you open, so the list is a drawer and the heading that said nothing is gone with
          it. Nothing was taken away: the searching, the narrowing and the counts are the same panel. */}
      <BacklogDrawer
        label={t('schedule.findToGiveHours')}
        allocatable={allocatable}
        offer={(row) => (
          <AddPress
            horizon="week"
            period={reply.period}
            recordId={row.id}
            hours={hours}
            already={planned === null ? null : planned.includes(row.id)}
            // ONE WORD, TEN TIMES, INSTEAD OF FOUR WORDS TEN TIMES. Measured on the live corpus:
            // "add to this week" was on the screen ten times, under a section heading reading "Add
            // work to this week". The heading says which period; the row says which work; the press
            // only has to say what it does.
            label={t('schedule.add')}
            onWrote={onWrote}
          />
        )}
      />
    </>
  )
}

/**
 * BUILDING A WEEK: it is a container with capacity, and you press work into it.
 *
 * Read top to bottom it is the job — how full it is, what is in it, what else could go in — and the
 * summary is the smallest thing that answers "will this fit".
 *
 * A second arrangement was built beside this one, asking three questions in a numbered order
 * instead, to compare them on the real corpus. This one was chosen and the
 * other was deleted.
 */
function BuildWeek(props: WeekProps & { part: 'hours' | 'work' }) {
  const { reply, said, hoursText, setHoursText, onWrote } = props
  if (props.part === 'hours') {
    return (
      <>
        <WeekGauge reply={reply} said={said} editing />
        {/* WHY THE BOARD AND THIS TOTAL DISAGREE, said where the total is. */}
        <BlocksGiveNoHours placed={props.placed} />
        <CapacityLine
          horizon="week"
          period={reply.period}
          capacity={reply.capacity}
          unit="week"
          onWrote={onWrote}
        />
        <ProjectSplit entries={reply.entries} load={reply.fit.load} />
      </>
    )
  }
  return (
    <>
      <PlanRows entries={reply.entries} unit="week" editing onWrote={onWrote} />
      <span data-title-is="its-label" className="px-pl-sub">{addWorkTo('week')}</span>
      <div className="px-pl-bar">
        <HoursBox value={hoursText} onChange={setHoursText} unit="week" />
      </div>
      <WeekAdd {...props} />
    </>
  )
}

// ============================================================================ what the period works toward

/**
 * WHAT THIS PERIOD WORKS TOWARD, AS A SHORT LIST: the goals and deadlines that work on this period
 * is linked to.
 *
 * The goal drawing left the Schedule for the Goals page in round 11 (the answer to question 16 of
 * report n9Mjk3c_sJRu). What stays here is the short list the adopted proposal names, block b-13:
 * one row per goal or deadline, and the press to the Goals page, where the drawing is.
 *
 * IT READS THE DRAWING'S OWN REPLY, `GET /api/plan-graph/<horizon>/<period>`, so this list and the
 * drawing cannot disagree about which work leads where. A goal or deadline is a row here when at
 * least one record one stored link from it has time in this period (an allocation at any horizon
 * that covers it). The rest are counted in one line, not listed, so the list stays short.
 *
 * IT IS ONE PROJECT'S LIST, AND IT SAYS WHICH. The hours on this page come from every project; a
 * structure is owned by one, so the reply draws the project the browser is in and names it. The line
 * under the heading says that name, so the list never reads as covering every project.
 *
 * NOTHING HERE IS ADDED TO ANY TOTAL, and a block on the board is not counted as time: only an
 * allocation is.
 */
export function WorksToward({ period }: { period: string }) {
  const parsed = parsePeriod(period)
  const [state, readAgain] = useProjectAsync(
    () =>
      parsed === null
        ? Promise.reject(new Error(t('g8.graph.isNotAPeriodAMonthIsAWeek', { value1: period })))
        : moleOfficeRequest<PlanGraphReply>(`/api/plan-graph/${parsed.horizon}/${period}`),
    [period],
  )
  const unit = unitWord(parsed?.horizon ?? 'week')
  return (
    <PlanSection declares={{ surface: 'plan.goals' }}
      title={t('scheduleDesign.towardTitle', { unit })}
      actions={<RouteLink to={horizonsPath()} className="px-pl-step">{t('scheduleDesign.openGoals')}</RouteLink>}
    >
      {state.status === 'loading' ? <Loading label={t('g8.graph.readingWhatThisPeriodIsWorkingToward')} rows={2} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} retry={readAgain} /> : null}
      {state.status === 'ready' ? <TowardRows reply={state.value} unit={unit} /> : null}
    </PlanSection>
  )
}

/** One goal or deadline, and how much of the work linked to it has time in this period. */
export interface TowardRow {
  node: PlanGraphNode
  linked: number
  onPeriod: number
}

/**
 * WHICH GOALS AND DEADLINES GET A ROW, AND WHICH ARE ONLY COUNTED. A pure function over the reply,
 * so a test can hold it without a browser.
 *
 * Rows: every goal or deadline the reply draws as an anchor, with at least one record one stored link
 * from it (either way) that has an allocation covering the period. Most linked work with time first, then by title.
 * The rest are the second list, which is only counted.
 */
export function towardRows(reply: Pick<PlanGraphReply, 'nodes' | 'edges'>): { rows: TowardRow[]; rest: number } {
  const byId = new Map(reply.nodes.map((one) => [one.recordId, one] as const))
  const anchors = reply.nodes.filter((one) => one.drawn === 'anchor' && (one.role === 'goal' || one.role === 'deadline'))
  const read = anchors.map((node) => {
    // THE RECORDS ONE STORED LINK FROM IT, in either direction, each counted once. A piece of work
    // this period allocates time to is in the reply for that reason and is drawn as an anchor of its
    // own, so the link is what joins it to the goal, not the card's own note of how it got drawn.
    const ends = new Set<string>()
    for (const edge of reply.edges) {
      if (edge.from === node.recordId && edge.to !== node.recordId) ends.add(edge.to)
      if (edge.to === node.recordId && edge.from !== node.recordId) ends.add(edge.from)
    }
    const linked = [...ends].map((id) => byId.get(id)).filter((one): one is PlanGraphNode => one !== undefined)
    return { node, linked: linked.length, onPeriod: linked.filter((one) => one.allocations.length > 0).length }
  })
  const rows = read
    .filter((one) => one.onPeriod > 0)
    .sort((a, b) => b.onPeriod - a.onPeriod || a.node.name.localeCompare(b.node.name))
  return { rows, rest: read.length - rows.length }
}

/** An obligation's due, as a short date when it is a date, and as nothing when it is not one. */
function dueWords(due: unknown): string | null {
  if (typeof due !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(due)
  if (m === null) return null
  return wordWithSpacedValues(t, 'scheduleDesign.due', { date: writtenDay(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), { day: 'numeric', month: 'long' }) })
}

function TowardRows({ reply, unit }: { reply: PlanGraphReply; unit: string }) {
  const { rows, rest } = towardRows(reply)
  return (
    <>
      <p className="px-pl-hint px-pl-toward-line">{wordWithSpacedValues(t, 'scheduleDesign.towardLine', { project: reply.workspaceTitle })}</p>
      {rows.length === 0 ? (
        <NothingOn sentence={t('scheduleDesign.towardNone', { unit })} />
      ) : (
        <ul className="px-pl-toward">
          {rows.map(({ node, linked, onPeriod }) => {
            const due = node.role === 'deadline' ? dueWords(node.due) : null
            return (
              <li key={node.recordId}>
                <RouteLink to={recordPath(node.recordId)} className="px-pl-trow">
                  <span className="px-pl-tmain">
                    <span className="px-pl-ttitle">{node.name}</span>
                    <span className="px-pl-tfacts">
                      {node.role === 'goal' ? t('scheduleDesign.goal') : t('scheduleDesign.deadline')}
                      {due === null ? null : <> · {due}</>}
                      {node.settled === null ? null : <> · {t('scheduleDesign.settled')}</>}
                      {' · '}
                      {t('scheduleDesign.linkedOn', { on: onPeriod, n: linked, unit })}
                    </span>
                  </span>
                  {node.record.origin === 'fixture' ? <OriginMark record={{ origin: node.record.origin }} /> : null}
                </RouteLink>
              </li>
            )
          })}
        </ul>
      )}
      {rest === 0 ? null : <p className="px-pl-hint px-pl-tmore">{t('scheduleDesign.towardMore', { n: rest, unit })}</p>}
    </>
  )
}

// ============================================================================ 6B — the month

/**
 * A MONTH IS ITS WEEKS.
 *
 * THE CONTRADICTION THIS FIXES, measured on 2026-08-13: `2026-08` headlined "0h planned at this
 * horizon / Nothing is planned in this period" while the panel directly below it listed ten hours
 * placed in the weeks inside it. Both were true and the page never said so. A month's own
 * allocations and its weeks' are two answers to two questions — adding them would count the same
 * hour twice — so they are drawn as one line that names both, and the weeks are the month's primary
 * content because they are how a person gets into it.
 *
 * A MONTH CAN NOW BE ADDED TO. It had no add control of any kind: the only way to give a month
 * hours was to review the month before it and carry a row forward, so a piece of work nobody had
 * planned last month could not be put on this one at all. The section is the same one the week
 * uses, at this horizon, and it appears while the month is being edited like every other control
 * that writes.
 */
export function MonthPlan({
  reply,
  said,
  today,
  editing,
  onWrote,
}: {
  reply: PlanReply
  said: PeriodSaid
  /** The server's day, week and month, so the strip can say which week you are in. */
  today: TodayKeys | null
  /** True when the address ends in `/edit`. Reading is what every fresh visit gets. */
  editing: boolean
  onWrote: () => void
}) {
  const eyebrow = useEyebrow('time against work')
  const [hoursText, setHoursText] = useState('')
  const weeks = weeksOf(reply.period)
  // WHAT THE WEEKS INSIDE THIS MONTH HOLD, from the one reader of that fact — `insideOf`, which the
  // week reads as well. It used to be two `reduce`s written here, and the week had none at all.
  const inside = insideOf(reply)
  const inWeeks = inside?.hours ?? 0
  const unstatedInWeeks = inside?.unstated ?? 0

  return (
    <>
    <PlanSection declares={{ surface: 'plan.hours' }}
      title={hoursPanelTitle(said)}
      {...(eyebrow === undefined ? {} : { kind: eyebrow })}
      actions={<span className="px-pl-section-count">{t('schedule.weekCount', { n: weeks.length })}</span>}
    >
      <PlanningStyle />
      {/* BOTH HALVES SAY HOW MANY OF THEIR OWN ROWS GAVE NO NUMBER. The month's own count was
          missing, so putting work on the month with no hours changed nothing on this line at all —
          the same 5h before the press and after it, with nothing anywhere saying a row had been
          added. Measured in a browser on 2026-08-14. */}
      {/* TWO NUMBERS ABOUT DIFFERENT THINGS, SEPARATED RATHER THAN EXPLAINED. They sat on one line
          joined by a middle dot, with "— these are not added together" after them; a reader who
          reads a dot as "and" has already added them by the time they reach the disclaimer. Each is
          on its own line under its own heading now. Finding 26, 19 August 2026. */}
      <p className="px-pl-read">
        <span className="px-pl-inside-of">{t('schedule.monthItself')}</span>
        <strong>{reply.fit.load.plannedHours}{t('schedule.hourUnit')}</strong>
        {reply.fit.unstated === 0 ? '' : t('schedule.plusUnstated', { n: reply.fit.unstated })}
      </p>
      <p className="px-pl-read px-pl-particular">
        <span className="px-pl-inside-of">{t('schedule.weeksInside')}</span>
        <strong>{inWeeks}{t('schedule.hourUnit')}</strong>
        {unstatedInWeeks === 0 ? '' : t('schedule.plusUnstated', { n: unstatedInWeeks })}
      </p>
      <PartsInsideNote load={reply.fit.load} unit="month" period={reply.period} editing={editing} />

      {reply.capacity === null ? null : (
        <CapacityBar
          plannedHours={reply.fit.load.plannedHours}
          capacityHours={reply.capacity.hours}
          freeHours={reply.fit.freeHours}
          overcommitted={reply.fit.overcommitted}
          unstated={reply.fit.unstated}
          subject={ownTotalCalled('month', inside !== null)}
        />
      )}
      {editing ? (
        <CapacityLine
          horizon="month"
          period={reply.period}
          capacity={reply.capacity}
          unit="month"
          onWrote={onWrote}
        />
      ) : reply.capacity === null ? (
        <NoCapacitySaid period={t('schedule.thisMonthLower')} />
      ) : (
        <CapacityFor capacity={reply.capacity} unit="month" />
      )}

      <span data-title-is="its-label" className="px-pl-sub">{t('schedule.weekByWeek')}</span>
      <ul className="px-pl-weekrows">
        {weeks.map((week) => {
          const load = (reply.finer ?? []).find((l) => l.period === week.key) ?? null
          const weekSaid = periodSaid(week.key, today)
          return (
            <li key={week.key} className="px-pl-weekrow">
              <RouteLink to={planPeriodPath(week.key)} className="px-pl-weeklink">
                {weekSaid.range}
                {weekSaid.when === 'now' ? <span className="px-pl-nowword">{' '}{t('schedule.currentWeek')}</span> : null}
                {week.whole ? '' : <span className="px-pl-hint">{' '}{t('schedule.crossMonth')}</span>}
              </RouteLink>
              <span className="px-pl-was">
                {/* A WEEK WITH NOTHING ON IT IS A DASH. It read "nothing planned", once per week,
                    which on a month whose weeks are empty is the same two words five times down
                    the panel. Ordinary emptiness: the sentence is on the mark. */}
                {load === null ? (
                  <Absence title={noHoursOnYet(weekSaid.range)} />
                ) : (
                  t('schedule.hours', { n: load.plannedHours }) + (load.allocations - load.stated === 0 ? '' : t('schedule.unstatedSuffix', { n: load.allocations - load.stated }))
                )}
              </span>
            </li>
          )
        })}
      </ul>

      <ProjectSplit entries={reply.entries} load={reply.fit.load} />
      {reply.entries.length === 0 ? null : (
        <>
          {/* IT WAS "Given time by the month itself", which named the mechanism — an allocation
              whose horizon is the month — and left the reader to work out what that was not. What
              it IS to a person is work planned on the month as a whole rather than on one of its
              weeks, and the line at the top of this panel already keeps the two numbers apart. */}
          <span data-title-is="its-label" className="px-pl-sub">{t('schedule.monthWithoutWeek')}</span>
          <PlanRows entries={reply.entries} unit="month" editing={editing} onWrote={onWrote} />
        </>
      )}

      {/* GIVING THE MONTH ITSELF HOURS, which is a different act from planning its weeks and is
          said so on the row above: the two are never added. While the month is being read there is
          no add section at all, and a month holding nothing offers the one press that leads here. */}
      {editing ? (
        <>
          <span data-title-is="its-label" className="px-pl-sub">{addWorkTo('month')}</span>
          <div className="px-pl-bar">
            <HoursBox value={hoursText} onChange={setHoursText} unit="month" />
          </div>
          <BacklogDrawer
            label={t('schedule.findToGiveHours')}
            allocatable={reply.allocatableKinds}
            offer={(row) => (
              <AddPress
                horizon="month"
                period={reply.period}
                recordId={row.id}
                hours={readHoursBox(hoursText)}
                already={reply.entries.some((e) => e.allocation.recordId === row.id)}
                label={t('schedule.add')}
                onWrote={onWrote}
              />
            )}
          />
        </>
      ) : reply.entries.length === 0 ? (
        // ITS OWN SENTENCE AND NOT `noHoursOnYet`. A month with nothing of its own is not a month
        // with nothing on it: the weeks above may be full, and the line at the top of this panel
        // says both numbers. The mark is the quiet one because the reader acts on the press.
        <NothingOn
          sentence={nothingOnItself(said.name.toLowerCase())}
          action={<EditThisPeriod period={reply.period} label={addWorkTo('month')} />}
        />
      ) : null}
    </PlanSection>
    </>
  )
}

/**
 * 6B — WHAT BECAME OF A MONTH, AND THE DECISION ABOUT THE NEXT ONE.
 *
 * The product of this surface is the facts, the list of what changed, and one act: carrying work
 * into next month. There is no generated paragraph about how the month went — that judgement is
 * the person's, and a page that wrote it for them would be putting words in their mouth that the
 * next reader would take for a record.
 *
 * IT COUNTS THE MONTH'S OWN ALLOCATIONS AND NOTHING ELSE. A month that was planned week by week
 * reviews as empty here, and that is the horizon rule rather than a bug — the panel above says how
 * much is in its weeks, which is the other half of the same sentence.
 */
export function MonthReview({
  period,
  said,
  wrote,
  editing,
  onWrote,
}: {
  period: string
  said: PeriodSaid
  wrote: number
  /** True when the address ends in `/edit`. Reading is what every fresh visit gets. */
  editing: boolean
  onWrote: () => void
}) {
  const next = shift(period, 1)
  const [review, readAgain] = useAsync(() => api.review(period), [period, wrote])
  // WHAT NEXT MONTH ALREADY NAMES, read rather than remembered. A carried row can then say "already
  // on it" because the plan says so — including work carried a week ago, which no local memory of
  // this page's own presses could know about.
  const [nextPlan] = useAsync(() => api.plan(next), [next, wrote])
  const [hoursText, setHoursText] = useState('')
  const hours = readHoursBox(hoursText)
  const eyebrow = useEyebrow('what became of it')
  const nextSaid = periodSaid(next, null)

  return (
    <PlanSection declares={{ surface: 'plan.became' }}
      title={t('schedule.reviewTitle', { period: said.name.toLowerCase() })}
      {...(eyebrow === undefined ? {} : { kind: eyebrow })}
      actions={
        <RouteLink to={planPeriodPath(next)} className="px-pl-step">
          {t('schedule.planPeriod', { period: nextSaid.name.toLowerCase() })}
        </RouteLink>
      }
    >
      <PlanningStyle />

      {review.status === 'loading' ? <Loading label={t('schedule.readingReview', { period: periodSaid(period, null).name })} rows={2} /> : null}
      {review.status === 'error' ? <ErrorNote message={review.message} fault={review.fault} retry={readAgain} /> : null}
      {review.status === 'ready' ? (
        <>
          {review.value.counts.allocations === 0 ? (
            // The month's own allocations are normally empty — a month is usually planned week by
            // week — so this is ordinary emptiness. The word says which of the two levels is being
            // reviewed, because that is the part a reader could get wrong, and the whole sentence
            // is on the mark.
            <NothingOn sentence={t('schedule.emptyMonthReview')} />
          ) : (
            <ReviewFacts review={review.value} />
          )}

          {review.value.counts.allocations > 0 ? (
            <>
              <span data-title-is="its-label" className="px-pl-sub">{t('schedule.outcomes')}</span>
              <ul className="px-pl-rows">
                {[
                  ...review.value.done.map((e) => ({ e, outcome: 'finished' })),
                  ...review.value.dropped.map((e) => ({ e, outcome: 'dropped' })),
                  ...review.value.unfinished.map((e) => ({ e, outcome: t('schedule.leftPlanned') })),
                ].map(({ e, outcome }) => (
                  <li key={e.allocation.id} className="px-pl-row">
                    <WorkIdent
                      work={e.work}
                      recordId={e.allocation.recordId}
                      struck={e.allocation.state === 'done'}
                    />
                    <span className="px-pl-was">
                      {e.allocation.plannedHours === null ? <Absence title={t('schedule.noHours')} /> : t('schedule.hours', { n: e.allocation.plannedHours })}
                      {e.allocation.actualHours === null ? '' : t('schedule.spentSuffix', { n: e.allocation.actualHours })}
                    </span>
                    <span className={outcome === 'finished' ? 'px-pl-out px-pl-out-done' : 'px-pl-out'}>
                      {outcome === 'finished' ? t('schedule.finished') : outcome === 'dropped' ? t('schedule.dropped') : outcome}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {/* A month with nothing in it has nothing to carry, and the line above has said so.

              CARRYING IS PART OF BUILDING THE NEXT MONTH, so it belongs to editing: it has an hours
              box in it, and putting work on a period is what the add sections do. While reading,
              this section is not drawn at all and the way to it is the Edit button at the top. */}
          {review.value.counts.allocations === 0 || !editing ? null : (
            <>
              <span data-title-is="its-label" className="px-pl-sub">
                {t('schedule.carryInto', { period: nextSaid.name.toLowerCase() })}
                {/* THE SURPRISE THIS LIST HOLDS, kept but taken out of the reading line: the same
                    row can be in the list above as finished and in this one as still to carry,
                    because the hours and the work they were spent on are two different things. */}
                <Hint label={t('schedule.carryReason')}>{t('schedule.carryHelp')}</Hint>
              </span>
              {review.value.carried.length === 0 ? (
                <NothingOn sentence={nothingToCarry(t('schedule.thisMonthLower'))} />
              ) : (
                <>
                  <div className="px-pl-bar">
                    <HoursBox value={hoursText} onChange={setHoursText} unit="month" />
                  </div>
                  <CarryRows
                    entries={review.value.carried}
                    horizon="month"
                    period={next}
                    hours={hours}
                    label={addTo(nextSaid)}
                    planned={
                      nextPlan.status === 'ready'
                        ? nextPlan.value.entries.map((e) => e.allocation.recordId)
                        : null
                    }
                    onWrote={onWrote}
                  />
                </>
              )}
            </>
          )}
        </>
      ) : null}
    </PlanSection>
  )
}

/**
 * The ISO weeks a month touches, and whether each is wholly inside it.
 *
 * A WEEK IS NOT OWNED BY A MONTH. Weeks straddle month boundaries, and nothing here rounds one into
 * the month holding most of it — `containsPeriod` answers whether it is wholly inside, and the ones
 * that are not say so. Walking the days is deliberately the dullest possible implementation: 31
 * iterations, and the week keys come from the shared function every other reader uses.
 */
export function weeksOf(month: string): { key: string; whole: boolean }[] {
  const parsed = parsePeriod(month)
  if (parsed === null || parsed.horizon !== 'month') return []
  const [y, m] = parsed.from.split('-').map(Number)
  const first = new Date(y ?? 2026, (m ?? 1) - 1, 1)
  const out: { key: string; whole: boolean }[] = []
  const at = new Date(first)
  while (periodKey('month', at) === month) {
    const key = periodKey('week', at)
    if (!out.some((w) => w.key === key)) {
      const week = parsePeriod(key)
      out.push({ key, whole: week !== null && containsPeriod(parsed, week) })
    }
    at.setDate(at.getDate() + 1)
  }
  return out
}

// ============================================================================ 6C — the day

/**
 * A DAY IS WHERE THE WEEK'S WORK GETS PUT.
 *
 * THE DEFECT THIS CLOSES. Every day that was not today had no control on it that could change
 * anything at all: the one day-level add lived inside "Comes round today", which draws nothing
 * unless the day on screen is the server's own day. So a person opening Friday to plan Friday was
 * shown "Nothing is planned in this period" and no way to plan it. Measured on 2026-08-13.
 *
 * This is also what makes a day a page rather than a filtered week: the week is where work is
 * committed, and a day is where some of those hours are placed. The rows are the week's own
 * allocations with the hours it has not placed on any day yet, and each is one press from this day.
 */
export function FromThisWeek({
  day,
  onDay,
  wrote,
  onWrote,
}: {
  day: string
  /** What is already on this day. Its ids are what this must not offer a second time. */
  onDay: readonly AllocationWithWork[]
  wrote: number
  onWrote: () => void
}) {
  const weekKey = atGrain(day, 'week', null)
  const [week, readAgain] = useAsync(() => api.plan(weekKey), [weekKey, wrote])
  const weekSaid = periodSaid(weekKey, null)
  const planned = onDay.map((e) => e.allocation.recordId)

  if (week.status === 'loading') return <Loading label={t('schedule.readingWeek', { period: weekSaid.range })} rows={2} />
  if (week.status === 'error') return <ErrorNote message={week.message} fault={week.fault} retry={readAgain} />

  const rows = week.value.entries.filter((e) => e.work !== null && !planned.includes(e.allocation.recordId))
  const unplacedOf = (recordId: string): number | null =>
    week.value.spread?.find((s) => s.recordId === recordId)?.unscheduledHours ?? null

  if (week.value.entries.length === 0) {
    return (
      // The mark names the empty source week; its link opens that week.
      <NothingOn
        // THE CLAUSE COMES FROM THE ONE WRITER, because what this counts is what that one counts:
        // the week's own allocations. A block placed across the week is not one of them and never
        // was, so the sentence may not claim the week holds nothing at all.
        sentence={t('schedule.emptyWeekForDay', { period: weekSaid.range })}
        action={
          <RouteLink to={planPeriodPath(weekKey)} className="px-pl-step">{t('schedule.planThatWeek')}</RouteLink>
        }
      />
    )
  }
  if (rows.length === 0) {
    // The week has work and every piece of it is already on this day. Ordinary emptiness: nothing
    // is missing and there is nothing to do about it, so the word says what the state is and the
    // sentence is on the mark.
    return (
      <NothingOn sentence={t('schedule.allOnDay')} />
    )
  }

  return (
    <ul className="px-pl-rows">
      {rows.map((entry) => (
        <PlaceRow
          key={entry.allocation.id}
          entry={entry}
          day={day}
          unplaced={unplacedOf(entry.allocation.recordId)}
          onWrote={onWrote}
        />
      ))}
    </ul>
  )
}

/** One piece of the week's work, with its own hours box, one press from this day. */
function PlaceRow({
  entry,
  day,
  unplaced,
  onWrote,
}: {
  entry: AllocationWithWork
  day: string
  /** Hours the week committed that no day has taken yet, or null when the week gave no number. */
  unplaced: number | null
  onWrote: () => void
}) {
  const [text, setText] = useState('')
  const hours = readHoursBox(text)
  const said = periodSaid(day, null)

  return (
    <li className="px-pl-row">
      <WorkIdent work={entry.work} recordId={entry.allocation.recordId} />
      <span className="px-pl-was">
        {entry.allocation.plannedHours === null ? <Absence title={t('schedule.noWeekHours')} /> : t('schedule.hoursThisWeek', { n: entry.allocation.plannedHours })}
        {' · '}
        {unplaced === null ? t('schedule.unknownRest') : t('schedule.hoursNeedDay', { n: unplaced })}
      </span>
      <div className="px-pl-acts">
        <span className={hours.said === 'words' ? 'px-pl-hwrap px-pl-hwrap-refused' : 'px-pl-hwrap'}>
          <input
            className="px-pl-hin"
            type="text"
            /* NO DECIMAL KEYPAD, because the box reads words as well as numbers. */
            value={text}
            placeholder="—"
            aria-label={wordWithSpacedValues(t, 'schedule.dayHoursInput', { work: entry.work?.name ?? t('schedule.thisWork'), date: said.range })}
            aria-invalid={hours.said === 'words' ? true : undefined}
            onChange={(e) => setText(e.target.value)}
          />
          <span className="px-pl-unit">{t('schedule.hourUnit')}</span>
        </span>
        {/* WHAT THE BOX SAYS BEFORE THE PRESS, which is where this row said nothing at all. Typing
            words Mole Office could not read left an ordinary-looking box beside a press that quietly
            would not go, and the reason only appeared after somebody pressed it. A reading that
            matches what was typed says nothing: repeating "5" back as "5h" is noise. */}
        {hours.said === 'words' ? <span className="px-pl-badh">{hours.why}</span> : null}
        {hoursReadingSaid(text) === null ? null : (
          <span className="px-pl-readh" aria-live="polite">
            {hoursReadingSaid(text)}
          </span>
        )}
        <AddPress
          horizon="day"
          period={day}
          recordId={entry.allocation.recordId}
          hours={hours}
          already={false}
          label={t('schedule.putOnDay')}
          onWrote={onWrote}
        />
      </div>
    </li>
  )
}

/**
 * 6C — WHAT COMES ROUND TODAY AND IS NOT ON TODAY.
 *
 * THESE ARE OFFERS, NOT ROWS. Nothing is materialised on a schedule: the server computes which
 * recurrences fall today, drops the ones whose occurrence is already on the plan, and hands back
 * the rest. Putting one on today creates an ORDINARY allocation naming the canonical work — no
 * copy of the task is made, and finishing that allocation finishes today's slice and never the
 * recurring work itself.
 *
 * WHICH DAY IS TODAY COMES FROM THE SERVER, whose clock writes every stamp in Mole Office — and it is
 * now read once by the page and handed down, rather than fetched again here, so the day on screen
 * and the day this offers for are one answer.
 */
export function ComesRoundToday({
  today,
  hoursBox,
  onWrote,
}: {
  today: TodayReply
  /**
   * Draw the box that says how many hours each press commits.
   *
   * OFF ON TODAY, ON WHEN THE DAY IS BEING PLANNED. Today is where the work is done, and putting
   * what comes round on it is one press: the hours are the recurrence's own, or nobody said. The
   * box is a planning control and it lives where planning does.
   */
  hoursBox: boolean
  onWrote: () => void
}) {
  const [hoursText, setHoursText] = useState('')
  const typed = hoursText.trim()
  const planned = today.allocations.map((e) => e.allocation.recordId)

  if (today.recurring.length === 0) return null

  return (
    <>
      <PlanningStyle />
      <span data-title-is="its-label" className="px-pl-sub">{t('schedule.recurringToday')}</span>
      {hoursBox ? (
        <div className="px-pl-bar">
          <HoursBox value={hoursText} onChange={setHoursText} unit="day" />
        </div>
      ) : null}
      <ul className="px-pl-rows">
        {today.recurring.map(({ recurrence, work }) => (
          <li key={recurrence.id} className="px-pl-row">
            <WorkIdent work={work} recordId={recurrence.recordId} />
            <span className="px-pl-was">
              {recurrenceWord(recurrence.every)}
              {recurrence.days === null ? '' : ` · ${listJoined(recurrence.days.map(isoDayName))}`} ·{' '}
              {recurrence.hoursEach === null ? <Absence title={t('schedule.noHoursEach')} /> : t('schedule.hoursEachValue', { n: recurrence.hoursEach })}
            </span>
            <div className="px-pl-acts">
              <AddPress
                horizon="day"
                period={today.day}
                recordId={recurrence.recordId}
                // The box wins when it has been filled in; otherwise the recurrence's own hours,
                // which may themselves be null — nobody said, and that stays nobody said.
                hours={typed === '' ? hoursAlreadyStated(recurrence.hoursEach) : readHoursBox(hoursText)}
                already={planned.includes(recurrence.recordId)}
                label={t('schedule.putOnToday')}
                onWrote={onWrote}
              />
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * The day, as one panel: how full it is, what is on it, and what could go on it.
 */
export function DayPlan({
  reply,
  said,
  today,
  wrote,
  editing,
  onWrote,
}: {
  reply: PlanReply
  said: PeriodSaid
  /** The server's own day, or null while it has not answered. */
  today: TodayReply | null
  wrote: number
  /** True when the address ends in `/edit`. Reading is what every fresh visit gets. */
  editing: boolean
  onWrote: () => void
}) {
  const eyebrow = useEyebrow('time against work')
  const isToday = today !== null && today.day === reply.period

  return (
    <>
    <PlanSection declares={{ surface: 'plan.hours' }}
      title={hoursPanelTitle(said)}
      {...(eyebrow === undefined ? {} : { kind: eyebrow })}
      actions={<span className="px-pl-section-count">{t('scheduleDesign.pieces', { n: reply.entries.length })}</span>}
    >
      <PlanningStyle />
      {reply.capacity === null ? (
        <HoursPlannedLine hours={reply.fit.load.plannedHours} period={isToday ? t('schedule.todayLower') : t('schedule.onThisDay')} unstated={reply.fit.unstated} />
      ) : (
        <CapacityBar
          plannedHours={reply.fit.load.plannedHours}
          capacityHours={reply.capacity.hours}
          freeHours={reply.fit.freeHours}
          overcommitted={reply.fit.overcommitted}
          unstated={reply.fit.unstated}
          subject={t('schedule.thisDay')}
        />
      )}
      <PartsInsideNote load={reply.fit.load} unit="day" period={reply.period} editing={editing} />
      {editing ? (
        <CapacityLine horizon="day" period={reply.period} capacity={reply.capacity} unit="day" onWrote={onWrote} />
      ) : reply.capacity === null ? (
        <NoCapacitySaid period={t('schedule.thisDay')} />
      ) : (
        <CapacityFor capacity={reply.capacity} unit="day" />
      )}

      <ProjectSplit entries={reply.entries} load={reply.fit.load} />
      <PlanRows entries={reply.entries} unit="day" editing={editing} onWrote={onWrote} />

      {/* THE SPANS THAT COVER THIS DAY, so a block placed on the week's board is not invisible from
          the day it covers. Read-only: the board is where a span is moved. */}
      <PlacedAcrossThisDay day={reply.period} wrote={wrote} />

      {/* PUTTING THE WEEK'S WORK ON THIS DAY IS EDITING. Each row of it carries its own hours box,
          and every one of those boxes is exactly what a page being read may not draw. While reading,
          a day with nothing on it says so and offers the one press that leads to the boxes. */}
      {editing ? (
        <>
          {/* THE STATE, NOT THE MECHANISM. These rows are the week's own work whose hours have not
              been given a day, which is the state `docs/UX-CONTRACT.md` names "Needs a day". */}
          <span data-title-is="its-label" className="px-pl-sub">{t('schedule.weekNeedsDay')}</span>
          <FromThisWeek day={reply.period} onDay={reply.entries} wrote={wrote} onWrote={onWrote} />
        </>
      ) : reply.entries.length === 0 ? (
        <NothingOn
          sentence={noHoursOnYet(said.name.toLowerCase())}
          action={<EditThisPeriod period={reply.period} label={addWorkTo('day')} />}
        />
      ) : null}

      {editing && isToday && today !== null ? (
        <ComesRoundToday today={today} hoursBox onWrote={onWrote} />
      ) : null}
    </PlanSection>
    </>
  )
}

// ============================================================================ 6E — today

/**
 * TODAY IS WHERE WORK GETS DONE, NOT A SECOND PLACE TO PLAN IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CHANGED AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * `#/plan/today` used to be the day surface with a different address: it could set the day's
 * capacity, place the week's work onto days, and add work — every planning control the dated day
 * has. The owner's brief says what it should be instead: Today is where the plan is carried out,
 * not a second planning surface. Two surfaces that both plan is how a person ends up with two ideas of
 * what a day holds and no way to tell which one they last used.
 *
 * SO TODAY KEEPS WHAT BELONGS TO DOING and nothing else:
 *
 *     what is on today          the rows, as facts
 *     marking it done           one press per row, which is what "how it went" already is
 *     what was actually spent   a press per row that turns one field on, so the page opens with none
 *     what comes round today    one press each, at the recurrence's own hours
 *
 * AND IT LOSES EVERY CONTROL THAT PLANS: no capacity field, no placing the week's work, no add
 * section and no rough planning panel under it.
 *
 * WHERE THOSE WENT. `#/plan/today/edit` is the same day being PLANNED, and it is the ordinary day
 * surface with everything it has always had. So Today is not a second surface at all: it is the
 * READING state of the one surface that plans a day, and the Edit button at the top of the page is
 * the way in, exactly as it is on every other period. `#/plan/today` and `#/plan/2026-08-13` are two
 * spellings of one day and neither can hold anything the other does not.
 *
 * WHAT IT STILL SHOWS is how full today is, because that is what you read before deciding what to
 * do next. Reading is not planning.
 */
export function TodayPlan({
  reply,
  said,
  today,
  planHere,
  onWrote,
}: {
  reply: PlanReply
  said: PeriodSaid
  /** The server's own day. Today is the one surface that cannot be drawn without it. */
  today: TodayReply
  /**
   * Where this day is planned, in the spelling the reader arrived by.
   *
   * Handed down rather than built here, so this and the Edit button at the top of the page lead to
   * one address. Built twice they could differ, and one of them would take a person off `today` and
   * onto a date that stops meaning today at midnight.
   */
  planHere: string
  onWrote: () => void
}) {
  const eyebrow = useEyebrow('what is on today')
  const week = atGrain(reply.period, 'week', today.day)

  return (
    <PlanSection declares={{ surface: 'plan.hours' }}
      title={hoursPanelTitle(said)}
      {...(eyebrow === undefined ? {} : { kind: eyebrow })}
      actions={<span className="px-pl-section-count">{t('scheduleDesign.pieces', { n: reply.entries.length })}</span>}
    >
      <PlanningStyle />
      {reply.capacity === null ? (
        <HoursPlannedLine hours={reply.fit.load.plannedHours} period={t('schedule.todayLower')} unstated={reply.fit.unstated} />
      ) : (
        <CapacityBar
          plannedHours={reply.fit.load.plannedHours}
          capacityHours={reply.capacity.hours}
          freeHours={reply.fit.freeHours}
          overcommitted={reply.fit.overcommitted}
          unstated={reply.fit.unstated}
          subject={t('schedule.thisDay')}
        />
      )}
      {/* TODAY IS READ, NEVER EDITED HERE, so a conflict gets the press to the day being planned —
          which is the same day at its editing address, where the hours boxes are. */}
      <PartsInsideNote load={reply.fit.load} unit="day" period={reply.period} editing={false} />
      {/* HOW MANY HOURS TODAY HOLDS, OR THAT NOBODY HAS SAID. A fact, not a control: the field
          that answers it is on the day being planned, one press away, and Today drew nothing at
          all here — so the same day read as "no capacity mentioned" at one address and "not set"
          at the other. Home draws this fact this way too. */}
      {reply.capacity === null ? (
        <NoCapacitySaid period={t('schedule.todayLower')} />
      ) : (
        <CapacityFor capacity={reply.capacity} unit="day" />
      )}

      <ProjectSplit entries={reply.entries} load={reply.fit.load} />
      {/* THE ONE THING ON A ROW THAT CAN BE TYPED INTO IS WHAT YOU SPENT. The planned hours are
          text here, so nothing on this surface changes what today was supposed to be. */}
      <PlanRows entries={reply.entries} unit="day" editing={false} spent onWrote={onWrote} />
      {/* THE SPANS THAT COVER TODAY. Read-only here for the same reason everything else on Today is:
          this is the day being worked, and the week's board is where a span is placed and moved. */}
      <PlacedAcrossThisDay day={reply.period} />
      {reply.entries.length === 0 ? (
        <NothingOn
          sentence={noHoursOnYet(said.name.toLowerCase())}
          action={
            <RouteLink to={planHere} className="px-pl-step">{t('schedule.planToday')}</RouteLink>
          }
        />
      ) : null}

      <ComesRoundToday today={today} hoursBox={false} onWrote={onWrote} />

      {/* WHERE PLANNING LIVES, said as presses rather than as a sentence about the design.
          "Plan today" is the same address the Edit button at the top of the page leads to — one
          const, handed down, because two of them could point at two different days.

          IT IS NOT DRAWN TWICE. With nothing on today the empty state above is already offering it,
          and the same two words in two places three lines apart is the repeated text the owner
          counted on other pages. */}
      <div className="px-pl-elsewhere">
        {reply.entries.length === 0 ? null : (
          <RouteLink to={planHere} className="px-pl-step">{t('schedule.planToday')}</RouteLink>
        )}
        <RouteLink to={editingAddress(planPeriodPath(week))} className="px-pl-step">{t('schedule.planWeek')}</RouteLink>
      </div>
    </PlanSection>
  )
}

/**
 * ISO weekday numbers as names. 1 = Monday, which is the ISO-8601 convention `shared/planning.ts`
 * states and the same one `dueOn` counts with on the server.
 */
function recurrenceWord(every: string): string {
  return t(every === 'daily' ? 'schedule.daily' : every === 'weekly' ? 'schedule.weekly' : every === 'weekdays' ? 'schedule.weekdays' : 'schedule.repeating')
}

function isoDayName(n: number): string { return weekdayWord(n % 7) }

// ============================================================================ 6D — one person

/**
 * 6D — ONE PERSON'S HOURS, CUT BY THE PROJECTS SHARING THEM.
 *
 * The total above answers "does this period fit". This answers "what is it full of", and on this
 * page that is not the same question: a plan spans projects by design, so the constraint a person
 * is actually under is that Mole Office work, greenhouse work and a dentist appointment all come out of
 * one set of hours.
 *
 * ONE HORIZON, THE PAGE'S OWN. It sums the entries this reply carries and no others, so it can
 * never add a week's hours to a Monday's inside it.
 *
 * AND IT COUNTS WHAT IT CANNOT COUNT. Every project line says how many of its allocations gave no
 * number, because a project showing 4h over five allocations is a floor and reads as a whole.
 *
 * ---------------------------------------------------------------------------------------
 * IT SAYS WHY IT DOES NOT ADD UP TO THE HEADLINE, WHEN IT DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * These lines count every row on its own. The headline two lines above counts a piece of work with
 * parts planned inside it ONCE — the envelope, not the sum — so on a period planned at two levels
 * the two numbers differ by design. Until 16 August 2026 nothing on the screen said so: a week read
 * "28.5h planned of 10h this week" and the project lines under it added up to 37.5h, and all three
 * testers who drove the eleven-step loop worked that out for themselves and none of them trusted it
 * afterwards.
 *
 * SO THE ROW SUM IS NAMED HERE, BESIDE THE ROWS, and it is `load.rowHours` rather than a sum worked
 * out again in this component: the same fact worked out in two places is the defect this repository
 * keeps producing, and a total that disagreed with its own rows would be that defect arriving
 * inside the fix for it. `load` is optional because a caller with no reading of the period cannot
 * say anything about the difference, and a made-up one would be worse than silence.
 */
export function ProjectSplit({ entries, load }: { entries: AllocationWithWork[]; load?: Load }) {
  // WHAT EACH PROJECT IS CALLED, from the registry the server serves, and drawn through the one
  // function in the browser that names a project.
  //
  // IT USED TO PRINT THE ID. Measured on 16 August 2026: the sidebar said "Default" and the line
  // under the week's hours said "default", on the same screen, about the same project. Round five
  // named this as one of the two sites that "pass no title at all and would fall back to printing
  // the raw id". A page that reads the registry and one that does not are two names for one thing,
  // which is this repository's recurring defect.
  //
  // Totals draw while project names are loading; normal mode labels an unavailable name.
  const inspect = useInspect()
  const projects = useProjects()

  // KEYED ON THE PROJECT ITSELF, `null` INCLUDED, because a Map takes null as a key and it cannot
  // collide with a project. A record that has gone takes its project with it, and it is counted
  // under its own heading rather than dropped, so the lines still add up to the total above them.
  // `sharesOf` on the server keys the same way and says why at more length.
  const rows = new Map<string | null, { hours: number; allocations: number; unstated: number }>()
  for (const entry of entries) {
    const key = entry.work === null ? null : entry.work.workspaceId
    const row = rows.get(key) ?? { hours: 0, allocations: 0, unstated: 0 }
    row.allocations++
    if (entry.allocation.plannedHours === null) row.unstated++
    else row.hours = round2(row.hours + entry.allocation.plannedHours)
    rows.set(key, row)
  }
  const ordered = [...rows.entries()].sort((a, b) => b[1].hours - a[1].hours)
  if (ordered.length === 0) return null

  // The two numbers differ exactly when this period plans at two levels. Compared rather than
  // recomputed: both come from the one reading of the period the page was handed.
  const countedOnce = load === undefined || load.rowHours === load.plannedHours ? null : load

  return (
    <div className="px-pl-split">
      <PlanningStyle />
      {ordered.length > 1 ? <p className="px-pl-hint">{t('schedule.oneCapacity')}</p> : null}
      {countedOnce === null ? null : (
        <p className="px-pl-hint px-pl-splitsum">
          {t('schedule.projectSum', { rows: countedOnce.rowHours, total: countedOnce.plannedHours })}
        </p>
      )}
      <ul className="px-pl-projects">
        {ordered.map(([project, row]) => (
          <li key={project ?? t('schedule.recordGone')} className="px-pl-project">
            <Tag tone={project === null ? 'warn' : 'quiet'}>
              {project === null ? t('schedule.recordGoneShort') : scheduleProjectName(projects, project, inspect)}
            </Tag>
            <span className="px-pl-hint">
              {t('schedule.projectHours', { hours: row.hours, n: row.allocations })}
              {row.unstated === 0 ? '' : t('schedule.projectUnstated', { n: row.unstated })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * THIS PERIOD AGAINST THE PERIODS INSIDE IT: what has reached one, and what has not.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE HEADING IS NOT "NOT YET ON A DAY" ANY MORE
 * ---------------------------------------------------------------------------------------
 *
 * (And why it says HOURS rather than WORK: see the note on the heading itself, from a tester who
 * looked here for a block that had been placed across four days and did not find it.)
 *
 * It was, and the heading was wrong about some of its own rows. A row here can be in three
 * different states and only one of them is "not yet on a day":
 *
 *     some of it is not on a day yet        5h this week, 3h on a day, 2h left to place
 *     more is on days than the week gives   5h this week, 8h on days — the two disagree
 *     the week never gave it hours          nothing this week, 8h on a day
 *
 * A tester gave a piece of work 5h in a week and 8h on a day inside it, and this panel printed
 * "5h this week · 8h on a day · -3h to place" under a heading saying it was not on a day yet. They
 * could not tell whether the minus was a signal or a bug. A negative remainder is a real answer and
 * `spreadOf` reports it rather than clamping it — so it is drawn as what it is, in words, in its
 * own group, above the ordinary rows.
 *
 * NOT A SUM ACROSS GRAINS: eight hours this week with three of them on a Monday is eight hours of
 * work, and this compares the two rather than adding them.
 *
 * NOTHING IS WORKED OUT TWICE. Which rows disagree is the same test `insideOf` counts for the
 * headline, and both read `unscheduledHours` from the reply rather than subtracting again here.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE HEADING IS NOT "ON A DAY, AND NOT ON ONE YET" ANY MORE EITHER
 * ---------------------------------------------------------------------------------------
 *
 * The owner named that string on 17 August 2026: labels such as "On a day, and not on one yet" are
 * not acceptable Normal-mode language when the reader cannot tell what they mean. It was two states
 * joined by a comma and it did not say which rows were in which.
 *
 * So the panel is named for its subject — which days this week's hours are on — and **every row now
 * carries the state it is actually in**, from `stateOfSpread` below. That is the harder half: the
 * three words `docs/UX-CONTRACT.md` supplies are for three states, and a row here can be in five.
 * A row whose week gave it no number at all cannot be called "Needs a day", because nobody knows how
 * much of it there is to place; a row whose week gave it nothing and no day holds it either has
 * nothing to place at all. Both get their own words rather than the nearest supplied one.
 */
export function NotOnADay({ reply }: { reply: PlanReply }) {
  const finerWord = reply.horizon === 'month' ? 'week' : 'day'
  const unit = reply.horizon
  const eyebrow = useEyebrow('scheduled against unscheduled')
  const rows = reply.spread ?? []
  if (rows.length === 0) return null
  const overPlaced = rows.filter((row) => row.unscheduledHours !== null && row.unscheduledHours < 0)
  const ordinary = rows.filter((row) => !(row.unscheduledHours !== null && row.unscheduledHours < 0))

  /** One row's three figures, in the words that fit the state it is in. */
  const figures = (row: (typeof rows)[number]): string => {
    // "no hours yet" said nothing a reader could act on and is gone from the rows on this page. Here
    // the fact still matters, because it is WHY the third figure cannot be worked out — so it is
    // said as what it is: the week committed to this work without saying how much.
    const given = row.plannedHours === null ? t('schedule.noUnitHours', { unit: unitWord(unit) }) : t('schedule.unitHours', { n: row.plannedHours, unit: unitWord(unit) })
    const placed = t(row.finer === 1 ? 'schedule.oneFinerHours' : 'schedule.finerHours', { n: row.scheduledHours, finer: row.finer === 1 ? unitWord(finerWord) : unitsWord(finerWord) })
    if (row.unscheduledHours === null) return t('schedule.spreadUnknown', { given, placed })
    if (row.unscheduledHours < 0) {
      return t('schedule.spreadOver', { given, placed, n: Math.abs(row.unscheduledHours), unit: unitWord(unit) })
    }
    return t('schedule.spreadLeft', { given, placed, n: row.unscheduledHours })
  }

  return (
    <PlanSection declares={{ surface: 'plan.days' }}
      // WHAT IT COUNTS IS HOURS, AND THE HEADING NOW SAYS SO. It read "Which days this week's work
      // is on", and a tester reported that it left out the only thing on a day that week — a block,
      // placed across four days on the board above. A block is when work happens and carries no
      // hours, so it is not in this panel and never was. The heading was claiming a subject wider
      // than the panel's own arithmetic; the board is where the other answer is drawn.
      title={t('schedule.spreadTitle', { finer: unitsWord(finerWord), unit: unitWord(unit) })}
      {...(eyebrow === undefined ? {} : { kind: eyebrow })}
    >
      <PlanningStyle />
      {overPlaced.length === 0 ? null : (
        <div className="px-pl-inside" data-conflict="yes">
          <p className="px-pl-inside-clash">
            <strong>
              {t(overPlaced.length === 1 ? 'schedule.finerConflictOne' : 'schedule.finerConflict', { n: overPlaced.length, finer: unitsWord(finerWord), unit: unitWord(unit) })}
            </strong>{' '}
            {t('schedule.changeConflictingHours', { finer: unitsWord(finerWord) })}
          </p>
          <ul className="px-pl-rows">
            {overPlaced.map((row) => (
              <li key={row.recordId} className="px-pl-spread">
                <SpreadName reply={reply} recordId={row.recordId} />
                <span className="px-pl-nums">{figures(row)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {ordinary.length === 0 ? null : (
        <ul className="px-pl-rows">
          {ordinary.map((row) => (
            <li key={row.recordId} className="px-pl-spread">
              <SpreadName reply={reply} recordId={row.recordId} />
              <span className="px-pl-spreadstate">{row.unscheduledHours === 0 && row.finer === 0 ? <Absence title={stateOfSpread(row, finerWord)} /> : stateOfSpread(row, finerWord)}</span>
              <span className="px-pl-nums">{figures(row)}</span>
            </li>
          ))}
        </ul>
      )}
    </PlanSection>
  )
}

/**
 * WHAT STATE ONE ROW OF THE SPREAD IS ACTUALLY IN, IN WORDS A PERSON WOULD USE.
 *
 * `docs/UX-CONTRACT.md` supplies three: **Needs a day** when a period is known and no day is
 * chosen, **Not placed yet** when words were kept and nothing was read from them, **Placed, no
 * duration** when it is on a day and nobody said how long. Only the first of those is a state a
 * spread row can be in, so the other four are named here rather than borrowed — a wrong plain word
 * is worse than an obscure true one, which is the whole reason the old heading had to go.
 *
 * The five, and what each really is:
 *
 *     Needs a day        the period gave it hours and some of them are on no finer period yet.
 *     All on days        every hour the period gave it has a day.
 *     Nothing to place   the period gave it no hours at all and no day holds any either.
 *     Partly on days     the period committed to it without saying how much, and some IS on a day,
 *                        so nobody can say whether any is left. Never "all on days".
 *     Needs a day        the period committed without saying how much and no day holds any of it.
 *
 * A negative remainder never reaches here: it is a conflict, it has its own group and its own
 * sentence above these rows, and calling it a state would file a contradiction as a status.
 */
export function stateOfSpread(
  row: Pick<NonNullable<PlanReply['spread']>[number], 'plannedHours' | 'scheduledHours' | 'finer' | 'unscheduledHours'>,
  finerWord: string,
): string {
  if (row.unscheduledHours === null) {
    return row.finer === 0 ? t('schedule.needsFiner', { finer: unitWord(finerWord) }) : t('schedule.partlyFiner', { finer: unitsWord(finerWord) })
  }
  if (row.unscheduledHours > 0) return t('schedule.needsFiner', { finer: unitWord(finerWord) })
  if (row.finer > 0) return t('schedule.allFiner', { finer: unitsWord(finerWord) })
  return t('schedule.nothingToPlace')
}

/**
 * What one row of the spread is called.
 *
 * THE NAME COMES FROM THE REPLY, and it took two agents driving the product to get it there. The
 * spread is computed over the FINER periods inside this one, so a record with time on a Tuesday and
 * none on the week appears there and in no entry — and the page had nothing to call it but its id.
 *
 * A row STILL has no name when the record is gone, and that is said in words rather than by printing
 * the identifier: docs/UX-CONTRACT.md puts record ids in Developer mode, where this row does print
 * the id, because there it is the only handle left on a row nothing else can name. The link is drawn
 * in both modes, so the record page is one press away either way and nothing became unreachable.
 */
function SpreadName({ reply, recordId }: { reply: PlanReply; recordId: string }) {
  const inspect = useInspect()
  const named =
    reply.entries.find((e) => e.allocation.recordId === recordId)?.work?.name ??
    reply.alsoNamed.find((w) => w.id === recordId)?.name ??
    null
  return (
    <RouteLink
      to={recordPath(recordId)}
      className={named === null ? 'px-pl-title px-pl-unnamed' : 'px-pl-title'}
      title={named === null ? t('schedule.gone') : undefined}
    >
      {named ?? (inspect ? recordId : t('schedule.gone'))}
    </RouteLink>
  )
}

/**
 * Two decimal places on a sum, for the same reason `round2` in `shared/planning.ts` exists: 0.1 and
 * 0.2 planned is 0.30000000000000004 hours and no reader can be shown that. Restated here because
 * that one is private to the module; it is applied to sums only, never to what somebody typed.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// The stylesheet's comments give their reasons in words. An agent's window drawn beside the person's
// hours is criterion P5.
const PLANNING_CSS = `
/* ONE SECTION: a heading in the look's section style, what it counts at the right, and one strong
   line under the heading. NO BORDER ROUND IT AND NO GROUND: a section is not a box (rule R10), so
   the blocks and the one note box inside it are one box deep. 32px between sections (rule R1). */
.px-pl-section { display: flex; flex-direction: column; min-width: 0; margin: 0 0 32px 0; }
.px-pl-section-head {
  display: flex; align-items: baseline; gap: 8px 16px; flex-wrap: wrap;
  padding: 0 0 8px 0; margin: 0 0 8px 0; border-bottom: 2px solid var(--text);
}
.px-pl-section-title {
  margin: 0; font-family: var(--section-font); font-size: var(--panel-title-size); font-weight: var(--section-weight);
  text-transform: var(--section-case); letter-spacing: var(--section-space); line-height: var(--lh-tight); color: var(--text);
}
.px-pl-section-kind { font-size: var(--fs-1); color: var(--text-3); }
.px-pl-section-acts { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.px-pl-section-count { font-size: var(--fs-1); color: var(--text-3); font-variant-numeric: tabular-nums; }
/* THE ONE LARGE NUMBER: what is planned. Tabular figures, the size of a page title. */
.px-pl-read strong.px-pl-big { font-size: var(--fs-6); font-weight: 600; line-height: var(--lh-tight); color: var(--text); }
.px-pl-after { margin-top: 0; }
/* THE SECOND NUMBER, ON PARTICULAR DAYS OR WEEKS, behind a dashed rule and under its own words, so
   it is never read as part of the first. */
.px-pl-particular { padding-top: 8px; border-top: var(--border-w) dashed var(--border-strong); max-width: var(--measure-in-box); }
/* AN EXPLANATION, AS A CLOSED ONE-LINE FOLD AT THE FOOT OF ITS SECTION (rule R7). */
.px-pl-foot { margin-top: 8px; font-size: var(--fs-1); color: var(--text-2); }
.px-pl-foot > summary { cursor: pointer; color: var(--text-2); text-decoration: underline; min-height: 24px; }
.px-pl-foot > p { margin: 8px 0 0 0; max-width: var(--measure-in-box); }
/* WHAT THE PERIOD WORKS TOWARD: rows split by a thin line, the whole row opens the goal (rule R11). */
.px-pl-toward-line { margin: 0 0 4px 0; }
.px-pl-toward { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.px-pl-toward > li { border-bottom: var(--border-w) solid var(--border); }
.px-pl-trow { display: flex; align-items: center; justify-content: space-between; gap: 8px 16px; padding: 8px 0; min-height: 44px; color: var(--text); text-decoration: none; }
.px-pl-trow:hover { background: var(--hover); }
.px-pl-tmain { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.px-pl-ttitle { font-size: var(--fs-3); overflow-wrap: anywhere; }
.px-pl-tfacts { font-size: var(--fs-1); color: var(--text-2); font-variant-numeric: tabular-nums; }
.px-pl-tmore { margin: 8px 0 0 0; }
.px-pl-hint { font-size: var(--fs-1); color: var(--text-3); line-height: var(--lh-body); margin: 0; }
/* WHERE A SECTION STARTS. The rule across the top separates; the 3px accent rail is what makes the
   heading findable when you are scrolling for the place to add work. Identity, per the contract:
   a rail plus a sentence-case word, and no contrast obligation because nothing is carried by it.

   THE RAIL IS IN THE PANEL'S OWN PADDING NOW, AND THE WORDS ARE ON THE SAME EDGE AS THE ROWS. It
   was a real left border with a pad of text after it, which put every section heading 11px right of
   every row under it: measured at 1440 on 15 August, headings at x=282 over rows at x=271. A
   heading indented from the rows it names reads as a step in, and nothing on this page is a step in.
   Drawn as a mark in the gutter, the rail keeps its job and the text keeps the page's one edge. */
.px-pl-sub { position: relative; display: block; font-size: var(--fs-2); font-weight: 600; color: var(--text); margin: var(--pad-lg) 0 var(--pad); padding: var(--pad-lg) 0 0 0; border-top: var(--border-w) solid var(--border); }
.px-pl-sub[data-title-is="its-label"] { text-transform: var(--section-case); letter-spacing: var(--section-space); }
.px-pl-sub::before { content: ""; position: absolute; left: calc(0px - var(--rail) - 2px); top: var(--pad-lg); bottom: 0; width: var(--rail); background: var(--accent); border-radius: var(--radius-sm); }
.px-pl-facts { display: flex; flex-wrap: wrap; gap: var(--pad-lg) calc(var(--pad-lg) * 2); margin-bottom: var(--pad-lg); }
.px-pl-fact { display: flex; flex-direction: column; gap: 2px; }
.px-pl-n { font-size: var(--fs-4); line-height: var(--lh-tight); font-variant-numeric: tabular-nums; }
.px-pl-l { font-size: var(--fs-1); color: var(--text-3); max-width: 11rem; line-height: var(--lh-tight); }
.px-pl-unknown .px-pl-n { color: var(--st-blocked); }
.px-pl-over .px-pl-n { color: var(--st-failed); }
.px-pl-bar { display: flex; gap: var(--pad) var(--pad-lg); align-items: center; flex-wrap: wrap; padding: var(--pad) 0; }

/* HOW FULL THE PERIOD IS. TWO HUES AND THEY MEAN DIFFERENT THINGS, which is why they are allowed
   on one object: the fill is the QUANTITY committed and carries the accent, and the overspill is a
   FAULT and carries the alarm ink with the word "over" printed beside it. Neither is a state word
   about a record. The fill was --text-2 and the bar read as a rule somebody had drawn across the
   panel — the owner's whole note on this page was that nothing on it is lit. */
.px-pl-gauge { display: flex; flex-direction: column; gap: var(--pad); margin-bottom: var(--pad-lg); }
.px-pl-meter { display: flex; width: 100%; height: 14px; border-radius: var(--radius-sm); overflow: hidden; background: var(--panel-3); border: var(--border-w) solid var(--border); }
.px-pl-fill { background: var(--accent); }
.px-pl-overfill { background: var(--st-failed); }
.px-pl-rest { background: transparent; }
/* The hatch says "some of this is already claimed by allocations that never said how much". Two
   neutral tokens, so it reads as texture rather than as a state. */
.px-pl-hatch { background: repeating-linear-gradient(135deg, var(--panel-2) 0 5px, var(--panel-3) 5px 10px); }
.px-pl-read { font-size: var(--fs-2); color: var(--text-2); line-height: var(--lh-body); margin: 0 0 var(--pad-lg); }
/* THE SECOND NUMBER, UNDER ITS OWN HEADING AND BEHIND A RULE. See InsideThisPeriod: the two totals
   are about different things and were adjacent with nothing between them but a sentence saying not
   to add them. */
.px-pl-inside {
  margin-top: calc(var(--pad-lg) * -0.5);
  padding-top: var(--gut);
  border-top: var(--border-w) solid var(--border);
}
.px-pl-inside-of { display: block; font-size: var(--fs-1); color: var(--text-3); }
.px-pl-read strong { color: var(--text); font-variant-numeric: tabular-nums; }
/* THE ONE FIGURE ON THIS LINE THAT CHANGES WHAT HAPPENS NEXT: hours still uncommitted. The word
   "left" is beside it, so the meaning survives greyscale and the monochrome palette. */
.px-pl-read strong.px-pl-free { color: var(--accent); }
.px-pl-overword { color: var(--st-failed); font-weight: 600; }

/* WHAT IS PLANNED INSIDE WHAT, beside the total. Planning a piece of work and then parts of it is
   ordinary since round five, so the ordinary case is ordinary ink on a quiet ground with a plain
   rule down its left edge — a warning colour every week would teach a reader to skip it. The rule
   turns to the blocked colour only where something has to be acted on: parts that come to more than
   the work holding them, or rows Mole Office could not place at all. */
.px-pl-inside { margin: calc(0px - var(--pad)) 0 var(--pad-lg); padding: var(--pad) var(--pad-lg); background: var(--panel-2); border-left: var(--rail) solid var(--border-strong); border-radius: var(--radius-sm); max-width: var(--measure-in-box); font-size: var(--fs-1); color: var(--text-2); line-height: var(--lh-body); }
.px-pl-inside[data-conflict='yes'] { border-left-color: var(--st-blocked); }
/* THE CONFLICT LINE. Weight, size and position carry it — the heaviest thing in the box, at the top
   of it — and the rail beside it is the one hue this box spends. No second hue on the words: the
   contract allows one urgency mark per object and the rail is it. */
.px-pl-inside-clash { margin: 0 0 var(--pad); display: flex; align-items: center; gap: var(--pad-lg); flex-wrap: wrap; font-size: var(--fs-2); color: var(--text); line-height: var(--lh-body); }
.px-pl-inside-lede { margin: 0; color: var(--text); }
.px-pl-inside-list { margin: var(--pad) 0 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: 2px; }
.px-pl-inside-list li[data-conflict='yes'] { color: var(--text); }
.px-pl-inside-list .px-pl-inside-list { margin-top: 2px; }
.px-pl-inside-list + .px-pl-inside-lede { margin-top: var(--pad-lg); }

/* ONE INLINE FIELD, not four widgets in a row. The unit lives inside the control's border so the
   box and its "h" read as one object; the purpose gets its own full-width line under it. */
.px-pl-capline { display: flex; align-items: center; gap: var(--pad) var(--pad-lg); flex-wrap: wrap; padding: var(--pad) 0 var(--pad-lg); border-bottom: var(--border-w) solid var(--border); margin-bottom: var(--pad-lg); }
.px-pl-caplab { display: flex; align-items: center; gap: var(--pad); font-size: var(--fs-2); color: var(--text); }
.px-pl-capword { white-space: nowrap; }
.px-pl-capbox { display: inline-flex; align-items: baseline; gap: 2px; border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel-3); padding: 2px var(--pad); }
.px-pl-capbox:focus-within { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.px-pl-caph { width: 3.5rem; text-align: right; border: 0; background: none; color: var(--text); font-family: var(--font-mono); font-size: var(--fs-2); font-variant-numeric: tabular-nums; padding: 0; }
.px-pl-caph:focus { outline: none; }
.px-pl-unit { font-size: var(--fs-1); color: var(--text-3); }
.px-pl-purpose { flex: 1 1 100%; display: flex; flex-direction: column; gap: 3px; }
.px-pl-purpose input { width: 100%; }

/* A row's less-used acts, behind one press. <details> so it is keyboard-reachable and needs no
   state of its own; a menu that only opens on hover is a menu a keyboard cannot find. */
.px-pl-menu { position: relative; }
.px-pl-menu > summary { list-style: none; cursor: pointer; padding: 2px var(--pad); border-radius: var(--radius-sm); color: var(--text-3); font-size: var(--fs-2); }
.px-pl-menu > summary::-webkit-details-marker { display: none; }
.px-pl-menu > summary:hover { background: var(--hover); color: var(--text); }
/* A COLUMN, because the row menu now holds a label, a group of presses and sometimes a button. It
   was one button and nowrap; three things in a row would have run off the panel. */
.px-pl-menu-body { position: absolute; right: 0; z-index: 3; margin-top: 2px; padding: var(--pad); background: var(--panel); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); box-shadow: var(--elev-2); white-space: nowrap; display: flex; flex-direction: column; gap: var(--pad); align-items: flex-start; }

.px-pl-find { display: flex; gap: var(--pad); align-items: center; flex-wrap: wrap; margin-bottom: var(--pad); }
.px-pl-find > *:first-child { flex: 1 1 14rem; }
.px-pl-inproject { font-size: var(--fs-1); background: var(--panel); color: var(--text-2); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); padding: 3px var(--pad); }
.px-pl-rows { list-style: none; margin: 0; padding: 0; }
/* THE LAST COLUMN IS CAPPED, AND THAT IS A BUG FIX. A refusal from the server is printed inside it,
   and an uncapped auto track took its whole sentence as its width: six refused rows in one search
   squeezed the title column to about one character wide and rendered every record's name as a
   vertical stack of letters. Photographed at 1440. fit-content keeps the press narrow and makes the
   sentence wrap instead of the name. (No backticks in this block: it is a template literal, and a
   stray one ends the string and takes the whole module down.) */
.px-pl-row { display: grid; grid-template-columns: minmax(0, 1fr) auto fit-content(16rem); gap: var(--pad) var(--pad-lg); align-items: center; padding: var(--pad) 0; border-bottom: var(--border-w) solid var(--border); }
.px-pl-row:last-child { border-bottom: 0; }
.px-pl-ident { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.px-pl-title { color: var(--text); text-decoration: none; font-size: var(--fs-2); overflow-wrap: anywhere; }
.px-pl-title:hover { text-decoration: underline; }
.px-pl-struck { text-decoration: line-through; text-decoration-thickness: 1px; color: var(--text-3); }
.px-pl-within { color: var(--text-3); font-size: var(--fs-1); }
.px-pl-meta { display: flex; gap: 3px var(--pad); flex-wrap: wrap; align-items: center; }
.px-pl-est { font-size: var(--fs-1); color: var(--text-3); font-variant-numeric: tabular-nums; }
.px-pl-gone { color: var(--st-failed); font-size: var(--fs-2); }
.px-pl-was { font-size: var(--fs-1); color: var(--text-3); font-variant-numeric: tabular-nums; text-align: right; }
.px-pl-out { font-size: var(--fs-1); color: var(--text-3); }
.px-pl-out-done { color: var(--st-done); }
.px-pl-acts { display: flex; gap: var(--pad); align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.px-pl-on { font-size: var(--fs-1); color: var(--text-3); }
/* WHAT THIS PRESS JUST DID, told apart from what was already true. Ordinary ink rather than the
   quiet grey the "already on it" case gets: one of these is news and the other is furniture. */
.px-pl-justdid { color: var(--text); font-weight: 600; }
.px-pl-failed { flex-basis: 100%; margin: 2px 0 0; font-size: var(--fs-1); color: var(--st-failed); line-height: var(--lh-body); }

/* A row offering a piece of work: its name, then what it sits inside. */
.px-pl-offer { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
/* WHAT A PIECE OF WORK SITS INSIDE, on a row offering it. Quiet, because the name is what the eye
   is looking for and the chain is how it tells two rows of one pipeline apart. */
.px-pl-chain { font-size: var(--fs-1); color: var(--text-3); line-height: var(--lh-body); overflow-wrap: anywhere; }
/* Why the chain is not the whole chain. It is a fault in stored data, so it takes the alarm ink and
   the sentence beside it is the server's own. */
.px-pl-stopped { color: var(--st-failed); }

/* A REFUSAL, WHOLE, WITH ITS WAY OUT UNDER IT. The double-counting refusal is four sentences and
   names the row already holding the hours, so it is the one thing on the row a person has to be
   able to read. The rule under it is what gives it the room: a row holding a refusal stops being
   three columns, so the sentence has the width of the panel rather than the width of a button. */
.px-pl-refusal { display: flex; flex-direction: column; gap: var(--pad); align-items: flex-start; flex-basis: 100%; max-width: var(--measure-in-box); }
.px-pl-row:has(.px-pl-refusal) { grid-template-columns: minmax(0, 1fr); }
/* The press, then the refusal under it, then the way out under that: one column, so the sentence is
   read as the answer to the press above it rather than as a note beside it. */
.px-pl-row:has(.px-pl-refusal) .px-pl-acts { flex-direction: column; align-items: flex-start; justify-content: flex-start; }
/* The same for an allocation row, whose refusals are its own children rather than a button's. */
.px-pl-arow > .px-pl-failed { grid-column: 1 / -1; }

/* THE THREE CONTROLS THAT NARROW THE WORK. The words box takes the room; the two selects carry
   their own counts, so choosing one is a decision made with the number in front of you. */
.px-pl-narrowing { display: flex; gap: var(--pad) var(--pad-lg); align-items: flex-end; flex-wrap: wrap; margin-bottom: var(--pad); }
.px-pl-narrowing > *:first-child { flex: 1 1 14rem; }
.px-pl-narrow { display: flex; flex-direction: column; gap: 2px; }

/* HOURS ACTUALLY SPENT, on Today. Under the planned number, in the same cell, with its own word:
   the two are different facts and a bare second box beside the first would be unreadable. */
.px-pl-spent { display: inline-flex; align-items: center; gap: var(--pad); }
/* The press that turns the field on. Quiet, because it is an offer rather than a thing to do: on a
   day where nothing has been spent yet it appears on every row. */
.px-pl-say { font-size: var(--fs-1); font-family: inherit; color: var(--text-3); background: none; border: 0; padding: 0; cursor: pointer; text-align: right; }
.px-pl-say:hover { color: var(--text); text-decoration: underline; }

/* WHERE PLANNING LIVES, at the foot of Today. A rule above it, because it is not part of the day's
   rows: it is the way out to the two surfaces that write the plan. */
.px-pl-elsewhere { display: flex; gap: var(--pad-lg); flex-wrap: wrap; margin-top: var(--pad-lg); padding-top: var(--pad-lg); border-top: var(--border-w) solid var(--border); }

/* THE ALLOCATION TABLE. Four columns, headed, because the hours box had no visible name at all and
   sat immediately left of a control — so "give this three hours" read as "open the dropdown". */
.px-pl-table { display: flex; flex-direction: column; }
.px-pl-colhead, .px-pl-arow { display: grid; grid-template-columns: minmax(0, 1fr) 6rem auto 1.75rem; gap: var(--pad) var(--pad-lg); align-items: center; }
.px-pl-colhead { font-size: var(--fs-1); color: var(--text-3); padding-bottom: 3px; border-bottom: var(--border-w) solid var(--border-strong); }
.px-pl-colhead > *:nth-child(2) { text-align: right; }
.px-pl-arow { padding: var(--pad) 0; border-bottom: var(--border-w) solid var(--border); }
.px-pl-arow:last-child { border-bottom: 0; }
/* THE SAME FOUR COLUMNS WHETHER THE PERIOD IS BEING READ OR PLANNED. It used to drop the menu
   column while reading, because the menu was an editing-only control; the menu now holds what became
   of this period's hours, which is a press and is allowed while reading. So the grid stops moving
   between the two states, which is what the reading-and-editing rule wanted all along. */
/* Today's rows: the hours cell holds the planned figure, what was spent and the press that changes
   it, so it gets the room those three need. */
.px-pl-spending .px-pl-colhead, .px-pl-spending .px-pl-arow { grid-template-columns: minmax(0, 1fr) 8.5rem auto 1.75rem; }
.px-pl-hours { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
/* The hours while reading. Same place, same alignment and same numerals as the box that replaces it
   while editing, so pressing Edit moves nothing. */
.px-pl-planned { font-size: var(--fs-2); color: var(--text); font-variant-numeric: tabular-nums; }
.px-pl-hwrap { display: inline-flex; align-items: baseline; gap: 2px; border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel-3); padding: 2px var(--pad); }
.px-pl-hwrap:focus-within { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.px-pl-hin { width: 3rem; text-align: right; border: 0; background: none; color: var(--text); font-family: var(--font-mono); font-size: var(--fs-2); font-variant-numeric: tabular-nums; padding: 0; }
.px-pl-hin:focus { outline: none; }
.px-pl-hin:disabled { color: var(--text-dis); }
/* A NUMBER THAT WAS SENT AND REFUSED. The box goes on holding what was typed — losing it would lose
   the person's work — so the box itself has to say that what is in it is not what Mole Office kept. The
   ink and the edge are the alarm colour, and the sentence under the row says the same thing in
   words, so nothing here is carried by colour alone. */
.px-pl-hin[aria-invalid="true"] { color: var(--st-failed); }
.px-pl-hwrap-refused { border-color: var(--st-failed); }
.px-pl-badh { font-size: var(--fs-1); color: var(--st-failed); text-align: right; max-width: 14rem; line-height: var(--lh-body); }
/* WHAT MOLE OFFICE READ OUT OF WORDS IT COULD READ. It is not a fault and carries no alarm ink: the
   number was written, and this says which number, beside the characters that produced it. Same size
   and alignment as the refusal above so the two do not fight for the same corner of the row. */
.px-pl-readh { font-size: var(--fs-1); color: var(--text-3); text-align: right; max-width: 14rem; line-height: var(--lh-body); }
/* WHY A NUMBER WAS NOT KEPT, on the line under the box it was typed into and at that end of the row.
   Full width so it is a sentence rather than a four-word ribbon, and pushed to the right so it sits
   under the hours column instead of a thousand pixels away under the work's title — which is where
   it used to be, and where a tester driving the product missed it entirely.

   IT ENDS WHERE THE BOX ENDS. The span is the work column and the hours column, pushed right, so
   the last word of the sentence sits directly under the box and the sentence still has a sentence's
   width to be read in. Ending at the row's right edge instead would put it under the how-it-went
   control, which is not what was refused. */
.px-pl-refused { grid-column: 1 / 3; justify-self: end; max-width: min(28rem, 100%); margin: 2px 0 0; text-align: right; font-size: var(--fs-1); color: var(--st-failed); line-height: var(--lh-body); }
.px-pl-actual { font-size: var(--fs-1); color: var(--text-3); font-variant-numeric: tabular-nums; }
/* Lighter than the hours field beside it: the hours are the thing being changed here, and three
   equally loud controls in a row is what made the row ambiguous. */
.px-pl-states { display: inline-flex; border: var(--border-w) solid var(--border); border-radius: var(--radius-pill); overflow: hidden; }
.px-pl-state { font-size: var(--fs-1); font-family: inherit; color: var(--text-3); background: none; border: 0; padding: 2px var(--pad); cursor: pointer; }
.px-pl-state:hover { background: var(--hover); color: var(--text); }
/* THE ONE THAT IS ON. A pressed segment in --panel-2 was a shade of grey against three shades of
   grey, and which state a slice was at could not be read without stopping to compare. The accent
   here is a CONTROL state, not a claim about the record: it says which of the three is chosen, the
   word is inside it and aria-pressed says the same thing to a reader who cannot see either. */
.px-pl-state[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); font-weight: 700; }
.px-pl-said { grid-column: 1 / -1; margin: 2px 0 0; font-size: var(--fs-1); color: var(--text-2); line-height: var(--lh-body); }
.px-pl-donerow .px-pl-title { color: var(--text-3); }

/* --border-strong: this is a link drawn as a button, and its edge is the only thing saying so.
   The decorative hairline measures 1.26:1 in the light theme; a control boundary is held to 3:1. */
/* TIME IN WORDS. The box and the three commonest phrases on one line, then what Mole Office made of the
   words under it, then the words already kept. Nothing here is tinted: an interpretation is neither
   a fault nor a thing waiting on somebody, and a kept phrase least of all. */
.px-pl-fold > summary { cursor: pointer; font-size: var(--fs-2); color: var(--text-2); padding: 2px 0; border-radius: var(--radius-sm); }
.px-pl-fold > summary:hover { color: var(--text); }
.px-pl-fold[open] > summary { color: var(--text); margin-bottom: var(--pad); }
.px-pl-words { display: flex; align-items: center; gap: var(--pad) var(--pad-lg); flex-wrap: wrap; padding-bottom: var(--pad); }
.px-pl-words > :first-child { flex: 1 1 14rem; min-width: 0; }
.px-pl-said { display: flex; flex-direction: column; gap: var(--pad); max-width: var(--measure-in-box); padding-bottom: var(--pad); }
.px-pl-saidwhen { margin: 0; font-size: var(--fs-2); color: var(--text); line-height: var(--lh-body); }
.px-pl-saidacts { display: flex; align-items: center; gap: var(--pad) var(--pad-lg); flex-wrap: wrap; }
.px-pl-kept { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.px-pl-keptrow { display: flex; flex-direction: column; gap: 3px; padding: var(--pad) 0; border-top: var(--border-w) solid var(--border); max-width: var(--measure-in-box); }
.px-pl-keptrow:first-child { border-top: 0; }
/* WHAT SOMEBODY WROTE IS THE ROW, so it is the row's title weight. What Mole Office made of it is under
   it in the quiet ink every other secondary line on this page uses. */
.px-pl-keptsaid { font-size: var(--fs-3); color: var(--text); line-height: var(--lh-body); }
.px-pl-keptacts { display: flex; align-items: center; gap: var(--pad) var(--pad-lg); flex-wrap: wrap; }
.px-pl-step { font-size: var(--fs-1); color: var(--text-2); text-decoration: none; padding: 2px var(--pad); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-pill); white-space: nowrap; }
.px-pl-step:hover { background: var(--hover); }
.px-pl-weekrows { list-style: none; margin: 0; padding: 0; }
.px-pl-weekrow { display: flex; justify-content: space-between; gap: var(--pad-lg); align-items: baseline; flex-wrap: wrap; padding: var(--pad) 0; border-bottom: var(--border-w) solid var(--border); }
.px-pl-weekrow:last-child { border-bottom: 0; }
.px-pl-weeklink { font-size: var(--fs-2); color: var(--text); text-decoration: none; }
.px-pl-weeklink:hover { text-decoration: underline; }
.px-pl-nowword { font-size: var(--fs-1); color: var(--text-2); font-weight: 600; }
.px-pl-split { padding: var(--pad) 0; display: flex; flex-direction: column; gap: var(--pad); }
/* WHY THESE LINES DO NOT ADD UP TO THE HEADLINE, held to the reading width so it is a sentence and
   not a ribbon down the side of the panel. Quiet, because it is a fact about the arithmetic and
   nobody has to do anything about it — but never absent, which is what it was. */
.px-pl-splitsum { max-width: var(--measure-in-box); }
.px-pl-projects { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
/* ONE COLUMN FOR THE PROJECT, SO ITS FIGURES MAKE A COLUMN TOO. The project was a chip and the
   hours were whatever came after it, so the sentence a reader compares between rows started at a
   different x on every row — one edge per project name. A fixed first column is what the work
   page does with its state chips, and for the same reason. */
.px-pl-project { display: grid; grid-template-columns: 8rem minmax(0, 1fr); gap: var(--pad); align-items: baseline; }
.px-pl-project > .px-tag { justify-self: start; }
/* THREE THINGS ON A SPREAD ROW NOW: what it is, what state it is in, and the figures. The state
   used to be the panel heading, which said one thing about rows that were in five different states. */
.px-pl-spread { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: var(--pad) var(--pad-lg); align-items: baseline; font-size: var(--fs-2); padding: var(--pad) 0; border-bottom: var(--border-w) solid var(--border); }
.px-pl-spread:last-child { border-bottom: 0; }
/* The state a person reads to decide what to do with the row. Ordinary ink, because it is the
   answer they came for; the figures beside it are the working. */
.px-pl-spreadstate { font-size: var(--fs-1); color: var(--text-2); white-space: nowrap; }
.px-pl-nums { color: var(--text-3); font-size: var(--fs-1); font-variant-numeric: tabular-nums; }
.px-pl-unnamed { font-family: var(--font-mono); font-size: var(--fs-1); color: var(--text-3); }
.px-pl-hoursbox { display: flex; gap: var(--pad) var(--pad-lg); align-items: center; flex-wrap: wrap; }

/* ============================================================ the week as a board

   SEVEN EQUAL COLUMNS AND NOTHING THAT SCROLLS SIDEWAYS. Every column is minmax(0, 1fr), which is
   what stops a long record name pushing the grid wider than the panel — an auto track would take
   the name as its width and the whole board would run off the screen at 1440. Names wrap instead.

   The whole board becomes a list at 40rem, in the media block at the foot of this file. Seven
   columns do not fit a phone, and a board that scrolled sideways would fail the one layout rule
   this product measures on every page. */
.px-pl-board { display: flex; flex-direction: column; gap: var(--pad); margin-bottom: var(--pad-lg); }
.px-pl-boardhelp { max-width: var(--measure-in-box); margin-bottom: var(--pad); }
/* WHERE A BLOCK WENT WHEN IT LEFT THIS WEEK. It sits at the top of the board because that is where
   the block was, and it is drawn in the accent so it is not read as one more line of help. It takes
   focus when the press that moved the block has gone with it, so the outline is deliberate: it is
   the mark saying where the keyboard now is.

   IT IS NOT CALLED px-pl-gone, AND THAT NAME WAS TAKEN BY MISTAKE FOR AN HOUR. There is already a
   px-pl-gone in this stylesheet — the red words a plan row prints when the record it names has been
   deleted — and a second rule under that name, further down the same sheet, quietly drew every one
   of those into a bordered accent box. Two different facts wanted the same word. */
.px-pl-wentto { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--pad); margin: 0;
  padding: var(--pad) var(--pad-lg); border: var(--border-w) solid var(--accent); border-radius: var(--radius-sm);
  background: var(--accent-soft); color: var(--text); font-size: var(--fs-2); line-height: var(--lh-body); }
.px-pl-wentto:focus { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.px-pl-wenttolink { font-weight: 600; }
/* HOW MANY COLUMNS IS SET IN THE COMPONENT, from the days it is drawing. There is no count here on
   purpose: written in both places, the headings and the blocks could come to disagree about which
   column is which and nothing would fail. */
.px-pl-bhead { display: grid; gap: var(--pad); }
.px-pl-bday { font-size: var(--fs-1); color: var(--text-3); padding-bottom: 3px; border-bottom: var(--border-w) solid var(--border-strong); min-width: 0; }
/* TODAY'S COLUMN. Role 16 of the colour role register, and it carries NO HUE: today is not a
   quantity and it is not the segment you picked, which are the accent's only two licensed jobs
   (docs/UX-CONTRACT.md:191 and :198). It used to draw a 2px accent rule here. Three channels
   instead — a heavier rule at the edge, the day at weight 700, and the word "today" beside it. */
.px-pl-bday[data-today='yes'] { color: var(--text); font-weight: 700; border-bottom-width: 2px; border-bottom-color: var(--border-strong); }
/* The column a dragged block is over. It is feedback during a gesture rather than a state of the
   day, so it goes when the pointer does. */
.px-pl-bday[data-over='yes'] { background: var(--hover); }
/* The word "today" beside the date. Weight and the word itself, with no hue of its own: the column
   rule above already spends the one accent this mark is allowed. */
.px-pl-bnow { font-weight: 600; color: var(--text); }
.px-pl-blanes { display: grid; gap: var(--pad); list-style: none; margin: 0; padding: 0; }
.px-pl-blane { min-width: 0; }
/* ONE BLOCK. A button, so it is in the tab order, it takes Enter and Space with no handler of its
   own, and the arrow keys that move it land on something focusable. A div with a click handler is
   the version of this that a keyboard cannot reach. */
.px-pl-block { display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left; font: inherit; cursor: pointer;
  padding: var(--pad); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel-2); color: var(--text); min-width: 0; }
.px-pl-block:hover { background: var(--hover); }
.px-pl-block:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.px-pl-block[data-open='yes'] { border-color: var(--accent); background: var(--accent-soft); }
/* A SPAN THAT LEAVES THIS WEEK IS DRAWN AS LEAVING IT. The square edge and the dashed border say
   the block is cut off here; the words inside it say where it really runs to, so nothing about this
   is carried by the drawing alone. */
.px-pl-block[data-before='yes'] { border-left-style: dashed; border-top-left-radius: 0; border-bottom-left-radius: 0; }
.px-pl-block[data-after='yes'] { border-right-style: dashed; border-top-right-radius: 0; border-bottom-right-radius: 0; }
.px-pl-block[data-state='dropped'] { background: var(--panel-3); }
/* AN AGENT'S WINDOW, BESIDE THE PERSON'S HOURS. The person's own windows are drawn
   exactly as before; an agent's gets a --plan-agent rail down its leading edge and its own name in
   the same ink, so the second channel is a word and not a hue alone. The token is declared in every
   palette in tokens.css; tests/what-the-browser-draws.ts fails when one is missed. NOTHING HERE IS
   IN A TOTAL: a window has no hours and no arithmetic on this page reads it. */
.px-pl-block[data-owner='agent'] { border-left: var(--rail) solid var(--plan-agent); }
.px-pl-open[data-owner='agent'] { border-left: var(--rail) solid var(--plan-agent); }
.px-pl-bowner { font-size: var(--fs-1); color: var(--plan-agent); font-weight: 600; overflow-wrap: anywhere; }
.px-pl-bname { font-size: var(--fs-2); overflow-wrap: anywhere; }
.px-pl-bwhen { font-size: var(--fs-1); color: var(--text-3); overflow-wrap: anywhere; }
.px-pl-bcont { font-size: var(--fs-1); color: var(--text-2); }
.px-pl-bdone { font-size: var(--fs-1); color: var(--st-done); font-weight: 600; }
/* THE NOTE, ON THE BLOCK. It is readable when you come back to the block
   rather than buried on a record page, so the first two lines are here and all of it is in the
   panel that opens under the board. */
.px-pl-bnote { font-size: var(--fs-1); color: var(--text-2); line-height: var(--lh-body); overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

/* THE BLOCK YOU OPENED, under the board. The list locates and this explains, which is the shape
   the rest of the product uses. */
.px-pl-open { display: flex; flex-direction: column; gap: var(--pad); padding: var(--pad-lg); margin-bottom: var(--pad-lg);
  background: var(--panel-2); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); }
.px-pl-openhead { display: flex; justify-content: space-between; gap: var(--pad-lg); align-items: flex-start; flex-wrap: wrap; }
.px-pl-openwhen { margin: 0; font-size: var(--fs-2); color: var(--text-2); line-height: var(--lh-body); max-width: var(--measure-in-box); }
.px-pl-openacts { display: flex; gap: var(--pad); flex-wrap: wrap; align-items: center; }
.px-pl-opennote { display: flex; flex-direction: column; gap: 3px; max-width: var(--measure-in-box); align-items: flex-start; }
.px-pl-opennote > .px-input { width: 100%; }
.px-pl-opennoteread { margin: 0; font-size: var(--fs-2); color: var(--text-2); line-height: var(--lh-body); max-width: var(--measure-in-box); white-space: pre-wrap; }
/* THE NOTE WHILE THE WEEK IS BEING READ: what is written, then the press that writes or changes it.
   The press is the only thing here when nothing is written, because a block that can hold a note and
   shows no sign of it is a capability nobody finds. */
.px-pl-notewhenread { display: flex; flex-direction: column; gap: var(--pad); align-items: flex-start; max-width: var(--measure-in-box); }
.px-pl-openmore { align-self: flex-start; }
/* The work is finished, said as a word in the place the Done press was. Not a press, because there
   is nothing left to do to it here. */
.px-pl-isdone { font-size: var(--fs-1); color: var(--st-done); font-weight: 600; white-space: nowrap; }
.px-pl-ending-choices { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; max-width: 16rem; }
.px-pl-donewrap { min-width: 0; max-width: 16rem; display: flex; flex-direction: column; gap: 3px; align-items: flex-end; }

/* THE BACKLOG, BEHIND ONE PRESS. Two hundred and forty-four pieces of work used to be printed under
   the week; the summary is a control and is drawn like the other presses on this page. */
.px-pl-drawer > summary { cursor: pointer; }
/* NO LIST MARKER OF THE BROWSER'S, because the button drawing supplies its own. Both spellings are
   needed: the standard property and the one WebKit still reads. */
.px-pl-drawer > summary { list-style: none; }
.px-pl-drawer > summary::-webkit-details-marker { display: none; }
/* THE WORDS OF THE DRAWER'S OWN PRESS WRAP. The press borrows px-btn, which says nowrap, so a
   long translation ran past the drawer and made the whole page scroll sideways. The press is a
   sentence rather than a short label, so it takes as many lines as its words need and stays on the
   drawer's left edge. */
.px-pl-drawersum.px-pl-drawersum { max-width: 100%; white-space: normal; text-align: left; }
/* THE MARK THAT SAYS IT OPENS. A triangle drawn in borders rather than a character, so it turns
   with the fold and needs no font to contain it. */
.px-pl-drawermark {
  flex: none;
  width: 0; height: 0;
  border-left: 5px solid currentColor;
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
  transition: transform 120ms ease;
}
.px-pl-drawer[open] > summary .px-pl-drawermark { transform: rotate(90deg); }
.px-pl-drawerbody { padding-top: var(--pad-lg); }
/* Kept time phrases, summarised. One line until somebody asks for the rest. */
.px-pl-keptfold > summary { cursor: pointer; font-size: var(--fs-2); color: var(--text-2); padding: 2px 0; border-radius: var(--radius-sm); }
.px-pl-keptfold > summary:hover { color: var(--text); }
.px-pl-keptfold[open] > summary { color: var(--text); margin-bottom: var(--pad); }
.px-pl-keptstate { font-size: var(--fs-1); color: var(--text-2); }

/* NOTHING IS HERE YET: the mark, then the press that changes it. On the row's own edge, at the
   row's own height, so an empty period is the same shape as a full one and the page does not jump
   when the first piece of work lands on it. */
.px-pl-none { display: flex; align-items: center; gap: var(--pad-lg); flex-wrap: wrap; margin: 0; padding: var(--pad) 0; }
/* The sentence an empty week board draws in words. The dash's own ink, --text-2, and it wraps,
   because at 390 a sentence on one line would run off the screen. */
.px-pl-nonesaid { color: var(--text-2); font-size: var(--fs-1); line-height: var(--lh-body); }
/* HOW MANY HOURS THE PERIOD HOLDS, or that nobody has said. A label and a value, the same size and
   ink as the other quiet facts on the panel, and the mark beside it carries the whole sentence. */
.px-pl-holds { display: flex; align-items: center; gap: var(--pad); flex-wrap: wrap; margin: 0 0 var(--pad-lg); font-size: var(--fs-1); color: var(--text-2); line-height: var(--lh-body); }
@media (max-width: 40rem) {
  /* ONE COLUMN, NOT TWO. At 390 the right-hand cell is a whole phrase — "weekdays · Wed, Fri · no
     hours each" — and as an auto track it took most of the width, wrapping a four-word record name
     down five lines beside it. Stacked, the name gets the screen. Photographed at 390. */
  .px-pl-row { grid-template-columns: minmax(0, 1fr); }
  .px-pl-was { text-align: left; }
  .px-pl-acts { grid-column: 1 / -1; justify-content: flex-start; }
  .px-pl-l { max-width: none; }
  .px-pl-colhead { display: none; }
  /* Two columns and ordinary auto placement: name and hours on one line, then the state chips and
     the row menu on the next. The menu used to be given a row of its own by an explicit span. */
  .px-pl-arow { grid-template-columns: minmax(0, 1fr) auto; }
  .px-pl-reading .px-pl-arow { grid-template-columns: minmax(0, 1fr) auto; }
  .px-pl-states { justify-self: start; }
  .px-pl-menu { justify-self: end; }
  /* A fixed project column costs more than it buys at this width: the figures wrap anyway, so the
     name goes above them and both sit on the row's one edge. */
  .px-pl-project { grid-template-columns: minmax(0, 1fr); gap: 2px; }
  /* THE WEEK BOARD EXISTS AT 390, AND UNTIL AN EARLIER ROUND IT DID NOT. This rule was
     display none, so all seven day headings measured 0 by 0 on a phone and the week a person
     was planning had no visible axis at all — the board was named in the help line above it and
     was not on the screen. The reason given was that seven 40px columns are unreadable, and that
     reason was about a heading written as one run of text, Wed 24, which needs about 45px.

     WHAT MAKES SEVEN COLUMNS FIT: the day and its number are two elements, so they stack. Measured
     in Chromium at 390 on 26 August 2026: 360px of content, seven columns, about 51px each, and
     each column draws three characters over two. The blocks below stay a list, because a lane per
     day at this width really is unreadable — the axis is what was missing, not the lanes.

     TODAY still carries its word as well as its rule, so nothing here is held by hue or position
     alone. */
  .px-pl-bhead { gap: 2px; }
  .px-pl-bday { display: flex; flex-direction: column; align-items: center; text-align: center; padding-bottom: 2px; }
  .px-pl-bnow { font-size: var(--fs-1); }
  .px-pl-blanes { display: flex; flex-direction: column; }
  .px-pl-spread { grid-template-columns: minmax(0, 1fr); gap: 2px; }
  .px-pl-openhead { flex-direction: column; }
  .px-pl-donewrap { align-items: flex-start; }
}
`
