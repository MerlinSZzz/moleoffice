// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
/**
 * `#/horizons`, the Goals page: what needs the person, the goals at each horizon with the work that
 * serves each, where the plan and what happened differ, and the drawing of what this week works
 * toward.
 *
 * IT READS ACROSS PROJECTS, since a decision of 29 September 2026. Goals stands under All
 * projects. The page draws one choice, Every project or one project, starting at the project it was
 * opened from and shown chosen. Every door it reads is asked for what is chosen with `?projects=`,
 * every goal row and every planned-against-actual sentence names its project, the counts are counted
 * over what is chosen and say so, and Confirm writes in the goal's own project. The goal drawing is
 * one project's drawing, so it is drawn only when one project is chosen; see `TheDrawing`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PAGE IS FOR, IN THE CRITERION'S OWN WORDS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P5 of design/planning/ACCEPTANCE.md: one page draws the horizons, the clusters under
 * each, the parts under each cluster, who is on each part now and their window, and what was
 * planned against what actually happened. P5 says three horizons because it was written before the
 * fourth, `distant`, was added, and the goal kind declares four, so
 * FOUR are drawn here.
 *
 * THE ORDER IS THE ANSWER TO WAVE 13K'S PROPOSAL (report n9Mjk3c_sJRu, block b-17, adopted as
 * recommended): first what needs the person, as a group in the ask colour (an agent's goal waiting for
 * Confirm); then one grouped list, one group per horizon; then where the plan and what happened
 * differ. The answer to question 16 moved the goal drawing here from the Schedule, so it comes last.
 * A goal is in exactly one place: a goal waiting for Confirm is in the first group and not also in
 * its horizon's group.
 *
 * NO BOX HOLDS THIS PAGE'S SECTIONS (shared rule R10). A section is a heading and its rows, and rows
 * are split by one thin line. At 1100px and wider, by a review, a goal uses the width side by side:
 * what it is on the left and the work serving it on the right, so the eye does not run along one
 * long line.
 *
 * EVERY DASH ON THIS PAGE CARRIES ITS REASON, on hover and for a screen reader. A module that serves
 * a goal draws no dash at all: a module has no parts by design, so there is nothing missing to mark.
 *
 * ---------------------------------------------------------------------------------------
 * ALL THE READING IS IN @shared/horizons.ts, AND THIS FILE DRAWS IT
 * ---------------------------------------------------------------------------------------
 *
 * What a goal is, which cluster serves it, which parts a trajectory names, who is on a part and the
 * three facts that put planned beside actual are a READING of records and links. That reading is a
 * pure function in `src/shared/horizons.ts`, so it is proved without a browser; this file fetches
 * the records it reads and draws what it returns. Nothing here works out a fact a second time.
 *
 * WHO IS ON A PART NOW comes from `GET /api/work-domains/presence`, the product's own reader for
 * "who is working on this record now": a live work domain is `about` the part and the reply gives
 * each domain's age band and where the work stands. A part nobody is on says so, and a read that
 * could not run is an error rather than an empty page — the two are never the same answer.
 *
 * NOTHING ON THIS PAGE IS AN HOUR. A window says when somebody means to work on something, never
 * how long it takes, and no total here reads one.
 */

import { useState } from 'react'
import { EVERY_PROJECT, type ProjectChoice } from '@shared/across-projects.ts'
import { linkWord, stateWord } from '@shared/words.ts'
import { useMode } from '../lib/mode.ts'
import {
  HORIZON_WORDS,
  wordsOfWindow,
  againstActual,
  answersDrawn,
  goalFiledBy,
  goalIsConfirmed,
  goalNeedsConfirmation,
  noGoalAtThisHorizon,
  readHorizons,
  type AgainstActualFact,
  type HorizonGoal,
  type HorizonLevel,
  type HorizonPerson,
  type HorizonsInput,
} from '@shared/horizons.ts'
import { periodKey } from '@shared/planning.ts'
import type { WindowWithWork } from '../../server/lib/windows.ts'
import { api, errorMessage, faultOf, getActor, type ParticipantOnTheWire, type RecordListItem } from '../api.ts'
import type { ParticipantsNamed } from '../lib/participant-lookup.ts'
import { Absence, Btn, ErrorNote, Loading, OriginMark, Stamp, Tag, UnmarkedRowsNote, originReading, originSaid } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { declaredAttributes } from '../components/declares.ts'
import { PlanGraph } from '../components/graph/PlanGraph.tsx'
import { windowStateKey } from '../components/Planning.tsx'
import { recordPath, RouteLink } from '../components/router.tsx'
import { confirmAGoal } from '../lib/confirm-a-goal.ts'
import { readParticipantsOnce } from '../lib/oneread.ts'
import { theParticipantAStoredIdNames, writerNamed } from '../lib/participant-lookup.ts'
import { ParticipantName } from './NotebookPage.tsx'
import { ProjectChoiceControl, ProjectName, countedOver, useProjectChoice, useProjectTitles } from '../components/ProjectChoice.tsx'

/** How far either side of the server's day the windows and dropped lines are read. */
const READ_AHEAD_DAYS = 366

/** A day `n` days after `day`, using the one calendar. Used only to ask for a broad reading. */
function shiftDay(day: string, by: number): string {
  const at = new Date(`${day}T12:00:00`)
  at.setDate(at.getDate() + by)
  const month = String(at.getMonth() + 1).padStart(2, '0')
  const date = String(at.getDate()).padStart(2, '0')
  return `${at.getFullYear()}-${month}-${date}`
}

/** The presence read for every id, in batches the route's own cap allows. */
async function presenceFor(ids: readonly string[], choice: ProjectChoice): Promise<Record<string, HorizonPerson[]>> {
  const out: Record<string, HorizonPerson[]> = {}
  for (let at = 0; at < ids.length; at += 100) {
    const batch = ids.slice(at, at + 100)
    const reply = await api.presenceOnThese(batch, choice)
    for (const [id, people] of Object.entries(reply.byRecord)) {
      out[id] = people.map((one) => ({
        domainId: one.domainId,
        domainTitle: one.domainTitle,
        agentTitle: one.domainTitle,
        objective: one.objective,
        presence: one.presence,
        quietForMinutes: one.quietForMinutes,
      }))
    }
  }
  return out
}

/** Everything one reading of this page needs, fetched together so the page is one clock. */
export interface HorizonsReading {
  levels: HorizonLevel[]
  actual: ReturnType<typeof againstActual>
  spans: Awaited<ReturnType<typeof api.goalSpans>>
  /** The number of parts the presence read was asked about, so an empty drawing can say what it saw. */
  partsRead: number
  /** The server's own day, `YYYY-MM-DD`, the day the page reads its windows and dropped lines about. */
  today: string
  /**
   * HOW MANY AGENT-FILED GOALS WAIT FOR CONFIRM IN THE PROJECTS NOT CHOSEN. The owner opened Goals on
   * one project and found no press, while the only goal waiting was in another
   * project. Absent when Every project is chosen, because then no project is
   * left out, and when a test draws the page without reading it.
   */
  waitingElsewhere?: number
  /**
   * Everybody registered, read once with the same shared read `ParticipantName` uses. A goal's
   * `owner` is free text ("a person or a durable agent, by name or handle", src/shared/kinds.ts),
   * and `ownerName` below looks it up here.
   */
  participants: ParticipantsNamed
  /**
   * THE PROJECT EACH ROW IS IN, by the id the page draws it under: a goal's or a part's record id, a
   * window's id, a dropped line's id. Read from the rows the doors sent, so a row names the project
   * the office stored it in. A row with no entry names no project (a window whose work is gone).
   */
  projectOf: Readonly<Record<string, string>>
}

/** Read the whole page from the server's own doors, for the projects chosen. Exported so a test can call it. */
export async function readThePage(choice: ProjectChoice): Promise<HorizonsReading> {
  const [goals, trajectories, plannedStates, modules, links, today, spans, participants, everyGoal] = await Promise.all([
    api.listRecords('goal', undefined, undefined, undefined, choice).then((reply) => reply.records),
    api.listRecords('trajectory', undefined, undefined, undefined, choice).then((reply) => reply.records),
    api.listRecords('planned_state', undefined, undefined, undefined, choice).then((reply) => reply.records),
    api.listRecords('module', undefined, undefined, undefined, choice).then((reply) => reply.records),
    api.listLinks({
      projects: choice,
      typeToKind: [['serves', 'goal'], ['realises', 'planned_state'], ['instead_of', 'planned_state']],
      shape: 'answer',
    }),
    api.today(),
    api.goalSpans(),
    readParticipantsOnce(),
    choice === EVERY_PROJECT ? Promise.resolve(null) : api.listRecords('goal', undefined, undefined, undefined, EVERY_PROJECT).then((reply) => reply.records),
  ])
  const waitingElsewhere =
    everyGoal === null
      ? undefined
      : everyGoal.filter(
          (record) => record.workspaceId !== choice && goalNeedsConfirmation({ filedBy: goalFiledBy(record), confirmed: goalIsConfirmed(record) }),
        ).length

  const titlesById: Record<string, string> = {}
  const projectOf: Record<string, string> = {}
  for (const record of [...goals, ...trajectories, ...plannedStates, ...modules]) {
    titlesById[record.id] = record.title
    projectOf[record.id] = record.workspaceId
  }

  const partIds = plannedStates.map((one) => one.id)
  const from = shiftDay(today.day, -READ_AHEAD_DAYS)
  const to = shiftDay(today.day, READ_AHEAD_DAYS)
  const [presence, windows, dropped] = await Promise.all([
    partIds.length === 0 ? Promise.resolve({}) : presenceFor(partIds, choice),
    api.windows(from, to, choice),
    api.droppedLines(from, to, choice),
  ])

  for (const one of windows.windows) {
    if (one.work !== null) {
      titlesById[one.work.id] = one.work.title
      projectOf[one.window.id] = one.work.workspaceId
    }
  }
  for (const line of dropped.lines) {
    if (typeof line.workspaceId === 'string') projectOf[line.id] = line.workspaceId
  }

  const input: HorizonsInput = {
    goals,
    trajectories,
    plannedStates,
    modules,
    links,
    presenceByRecord: presence,
    windows: windows.windows.map((one: WindowWithWork) => ({
      ...one.window,
      createdBy: windows.owners?.[one.window.id] ?? null,
    })),
    droppedLines: dropped.lines.map((one) => ({
      id: one.id,
      workTitle: one.workTitle,
      period: one.period,
      plannedHours: one.plannedHours,
      note: one.note,
      createdBy: one.createdBy,
    })),
    titlesById,
    today: today.day,
  }

  return {
    levels: readHorizons(input, 'normal'),
    actual: againstActual(input, 'normal'),
    spans,
    partsRead: partIds.length,
    today: today.day,
    ...(waitingElsewhere === undefined ? {} : { waitingElsewhere }),
    participants,
    projectOf,
  }
}

/**
 * A GOAL'S OWNER, AS THE REGISTRY KNOWS THEM, OR NOBODY.
 *
 * `owner` is free text, so this asks the lookup `ParticipantName` in NotebookPage.tsx asks,
 * `theParticipantAStoredIdNames`: by id, then by a handle exactly one participant bears. It looks in
 * both registries, because nothing on a goal says whether its owner is a person or an agent. When no
 * participant matches, or two bear the handle, it answers undefined.
 */
export function ownerRow(owner: string, participants: ParticipantsNamed): Pick<ParticipantOnTheWire, 'id' | 'handle' | 'name'> | undefined {
  return theParticipantAStoredIdNames([...participants.people, ...participants.agents], owner)
}

/**
 * A GOAL'S OWNER, BY THE NAME THE REGISTRY GIVES THEM.
 *
 * Report dbPgS8ooliII, block b-6, found the person's raw handle on each goal. When no participant
 * matches, the text is given back as it was stored. It may be a name somebody typed, and nothing
 * here can tell a typed name from a handle nobody registered, so the page draws that text in
 * quotation marks with the reason on hover (see `OwnerSaid`).
 */
export function ownerName(owner: string, participants: ParticipantsNamed): string {
  return ownerRow(owner, participants)?.name ?? owner
}

/** The week the drawing is about: the one holding the server's own day. */
export function drawingWeek(today: string): string {
  return periodKey('week', new Date(`${today}T12:00:00`))
}

export function HorizonsPage() {
  const [choice, choose] = useProjectChoice()
  const titles = useProjectTitles()
  const [state] = useProjectAsync(() => readThePage(choice), [choice])

  return (
    <div className="page hz">
      <style href="mole-office-horizons-page" precedence="default">
        {HORIZONS_CSS}
      </style>
      <header className="hz-top">
        <h1 className="hz-title" data-title-is="its-label">{t('g7a.horizons.title')}</h1>
        <ProjectChoiceControl choice={choice} onChoose={choose} titles={titles} />
      </header>
      {/* WHAT EVERY COUNT ON THE PAGE IS COUNTED OVER, said once under the choice it follows. */}
      <p className="hz-counted">{countedOver(choice, titles)}</p>
      {state.status === 'loading' ? <Loading what={t('g7a.horizons.loading')} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} /> : null}
      {state.status === 'ready' ? (
        <>
          <TheHorizons reading={state.value} titles={titles} onShowEveryProject={() => choose(EVERY_PROJECT)} />
          <TheDrawing choice={choice} today={state.value.today} />
          <UnmarkedRowsNote />
        </>
      ) : null}
    </div>
  )
}

/**
 * THE GOAL DRAWING, moved here from the Schedule by the answer to question 16. It draws the week
 * that holds the server's day, and says which days that is itself.
 *
 * IT IS ONE PROJECT'S DRAWING. GET /api/plan-graph reads one project's records and links, and names
 * the person's planned work in other projects in a list beside it rather than drawing it. So with one
 * project chosen it draws that project. With Every project chosen it draws nothing and says why in
 * one line: one project's drawing would stand for all of them without saying so, and one drawing per
 * project would name every other project's planned work again beside each drawing.
 */
function TheDrawing({ choice, today }: { choice: ProjectChoice; today: string }) {
  if (choice === EVERY_PROJECT) return null
  return (
    <section className="hz-drawing">
      <PlanGraph period={drawingWeek(today)} project={choice} />
    </section>
  )
}

/**
 * WHICH NAMED PART OF THE SCREEN EACH HORIZON IS, WRITTEN OUT RATHER THAN BUILT FROM THE WORD.
 *
 * A name assembled at run time — `horizons.${horizon}` — cannot be found by reading the source.
 * Written out, each one is found where it is used,
 * and a fifth horizon has to be given a name here before it can be drawn.
 */
const SURFACE_OF_HORIZON = {
  short: { surface: 'horizons.short' },
  medium: { surface: 'horizons.medium' },
  long: { surface: 'horizons.long' },
  distant: { surface: 'horizons.distant' },
} as const

/** Whether every goal given is a made-up example, so the mark is said once at the heading. */
function everyOneIsAnExample(goals: readonly HorizonGoal[]): boolean {
  return goals.length > 0 && goals.every((goal) => originSaid(originReading(goal)).key === 'fixture')
}

/** The drawn page, with no fetching, so a test can render it with plain data. */
export function TheHorizons({
  reading,
  titles = new Map(),
  onShowEveryProject,
}: {
  reading: HorizonsReading
  titles?: ReadonlyMap<string, string>
  /** Choose Every project, for the press under the line that says goals wait in other projects. */
  onShowEveryProject?: () => void
}) {
  const spanWords = new Map<string, string>(reading.spans.spans.map((one) => [one.horizon, one.inForce === null ? t('g7a.horizons.unreadableSpan') : t('g7a.horizons.span', { n: one.inForce })]))
  // DISTANT HAS NO SPAN, so its sentence comes from the office's own reply rather than from a
  // number. The page never writes a limit for it.
  spanWords.set('distant', t('g7a.horizons.noLimit'))
  // THE COUNT IS OF THE ANSWER ROWS THE PAGE DRAWS, from the same part lists it draws below.
  const drawnAnswers = answersDrawn(reading.levels)

  // THE CONFIRM PRESS IS THE PERSON'S, drawn the way this product's other person-only controls are
  // drawn: `getActor().type === 'human'`. The server still refuses the patch to every agent — the
  // browser-side check only decides whether the press is on the screen, and the door under it holds
  // the rule. Criterion P1 and the guard `assertMayConfirmAGoal`.
  const canConfirm = getActor().type === 'human'
  const [confirmedHere, setConfirmedHere] = useState<ReadonlySet<string>>(new Set())
  const [busyOn, setBusyOn] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<{ on: string; said: string; fault: ReturnType<typeof faultOf> } | null>(null)

  // CONFIRM WRITES IN THE GOAL'S OWN PROJECT, which may not be the one in the switcher now that the
  // page reads across projects. The goal's own page presses the same `confirmAGoal`.
  const confirm = async (goalId: string): Promise<void> => {
    setBusyOn(goalId)
    setRefusal(null)
    try {
      await confirmAGoal(goalId, reading.projectOf[goalId])
      setConfirmedHere((held) => new Set(held).add(goalId))
    } catch (err) {
      setRefusal({ on: goalId, said: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusyOn(null)
    }
  }

  const waiting = reading.levels.flatMap((level) =>
    level.goals
      .filter((goal) => goalNeedsConfirmation(goal) && !confirmedHere.has(goal.id))
      .map((goal) => ({ goal, horizon: level.horizon })),
  )

  return (
    <>
      <p className="hz-answers-count">{t('g7a.horizons.answers', { n: drawnAnswers })}</p>
      <NeedsYou
        waiting={waiting}
        elsewhere={reading.waitingElsewhere ?? 0}
        onShowEveryProject={onShowEveryProject}
        projectOf={reading.projectOf}
        titles={titles}
        participants={reading.participants}
        canConfirm={canConfirm}
        busyOn={busyOn}
        refusal={refusal}
        onConfirm={confirm}
      />

      {reading.levels.map((level) => {
        const goals = level.goals.filter((goal) => !goalNeedsConfirmation(goal) || confirmedHere.has(goal.id))
        const saidOnce = everyOneIsAnExample(goals)
        return (
          <section key={level.horizon} className="hz-group" {...declaredAttributes(SURFACE_OF_HORIZON[level.horizon])}>
            <h2 className="hz-head">
              <span>{t('g7a.horizons.level', { horizon: HORIZON_WORDS[level.horizon] })}</span>
              <span className="hz-count num">{goals.length}</span>
              <span className="hz-span">{spanWords.get(level.horizon) ?? ''}</span>
              {saidOnce ? <OriginMark record={goals[0]!} /> : null}
            </h2>
            {goals.length === 0 ? (
              <p className="hz-none">
                <Absence tier="ordinary" title={level.goals.length === 0 ? noGoalAtThisHorizon(level.horizon) : t('goals.onlyWaiting')} />
              </p>
            ) : (
              <ul className="hz-goals">
                {goals.map((goal) => (
                  <GoalItem
                    key={goal.id}
                    goal={goal}
                    project={reading.projectOf[goal.id]}
                    titles={titles}
                    participants={reading.participants}
                    markEach={!saidOnce}
                  />
                ))}
              </ul>
            )}
          </section>
        )
      })}

      <AgainstActualSection actual={reading.actual} projectOf={reading.projectOf} titles={titles} />
    </>
  )
}

/**
 * FIRST ON THE PAGE, IN THE ASK COLOUR: THE GOALS AN AGENT FILED THAT ARE WAITING FOR CONFIRM.
 *
 * Shared rule R6. The person reads "Needs you" and a Confirm press on each row; when nothing waits,
 * the quiet line "Nothing needs you". An agent reading the page cannot confirm, so for an agent the
 * group is named for whom it waits on, and an empty group draws nothing.
 *
 * GOALS WAITING IN PROJECTS NOT CHOSEN ARE SAID HERE, with a press that shows every project, for the
 * person and an agent alike. "Nothing needs you" is then not drawn, because it would not be true.
 */
function NeedsYou({
  waiting,
  elsewhere,
  onShowEveryProject,
  projectOf,
  titles,
  participants,
  canConfirm,
  busyOn,
  refusal,
  onConfirm,
}: {
  waiting: { goal: HorizonGoal; horizon: HorizonLevel['horizon'] }[]
  elsewhere: number
  onShowEveryProject: (() => void) | undefined
  projectOf: Readonly<Record<string, string>>
  titles: ReadonlyMap<string, string>
  participants: ParticipantsNamed
  canConfirm: boolean
  busyOn: string | null
  refusal: { on: string; said: string; fault: ReturnType<typeof faultOf> } | null
  onConfirm: (goalId: string) => Promise<void>
}) {
  const elsewhereLine =
    elsewhere === 0 ? null : (
      <p className="hz-needs-elsewhere">
        <span className="hz-elsewhere-said">
          {elsewhere === 1 ? t('goals.waitingElsewhere.one') : t('goals.waitingElsewhere.many', { n: elsewhere })}
        </span>
        {onShowEveryProject === undefined ? null : (
          <Btn variant="secondary" onClick={onShowEveryProject}>
            {t('goals.showEveryProject')}
          </Btn>
        )}
      </p>
    )
  if (waiting.length === 0) {
    if (elsewhereLine !== null) return <section className="hz-group hz-needs" data-group="needs-you">{elsewhereLine}</section>
    return canConfirm ? <p className="hz-quiet hz-needs-none" data-group="needs-you">{t('goals.nothingNeedsYou')}</p> : null
  }
  return (
    <section className="hz-group hz-needs" data-group="needs-you">
      <h2 className="hz-head">
        <span>{canConfirm ? t('goals.needsYou') : t('goals.waitingForThePerson')}</span>
        <span className="hz-count num">{waiting.length}</span>
      </h2>
      <ul className="hz-needlist">
        {waiting.map(({ goal, horizon }) => {
          const filer = goal.filedBy === null ? undefined : theParticipantAStoredIdNames(participants.agents, goal.filedBy)
          return (
            <li key={goal.id} className="hz-needrow">
              <RouteLink to={recordPath(goal.id)} className="hz-needlink">{goal.title}</RouteLink>
              <span className="hz-needfacts">
                <RowProject id={projectOf[goal.id]} titles={titles} />
                <span>{t('goals.atHorizon', { horizon: HORIZON_WORDS[horizon] })}</span>
                {filer === undefined ? null : <span>{t('goals.filedBy', { name: filer.name })}</span>}
                <OriginMark record={goal} only="exceptions" />
              </span>
              {canConfirm ? (
                <span className="hz-needpress">
                  <Btn variant="secondary" onClick={() => void onConfirm(goal.id)} pending={busyOn === goal.id}>
                    {t('g7a.horizons.confirm')}</Btn>
                </span>
              ) : null}
              {refusal === null || refusal.on !== goal.id ? null : <ErrorNote message={refusal.said} fault={refusal.fault} />}
            </li>
          )
        })}
      </ul>
      {elsewhereLine}
    </section>
  )
}

/**
 * WHO OWNS A GOAL, SAID AS A LABELLED FACT.
 *
 * The registry's name when a registered participant matches. Otherwise the stored text in quotation
 * marks, with the reason on hover, because it may be a name somebody typed and nothing here can
 * tell. A goal with no owner recorded draws the short mark with its reason.
 */
function OwnerSaid({ goal, participants }: { goal: HorizonGoal; participants: ParticipantsNamed }) {
  if (goal.ownerMissing) {
    return (
      <span className="hz-owner">
        <Absence title={t('g7a.horizons.noOwner')} />
      </span>
    )
  }
  const row = ownerRow(goal.owner, participants)
  if (row !== undefined) return <span className="hz-owner">{t('goals.owner', { name: row.name })}</span>
  return (
    <span className="hz-owner" title={t('goals.ownerNotRegistered')}>
      {t('goals.ownerAsWritten', { name: goal.owner })}
    </span>
  )
}

/**
 * WHERE A GOAL STANDS, in words a person says: not met yet, met on a day, or dropped on a day. The
 * stored words are "open", "met" and "dropped" (GOAL_STATES in src/shared/goal.ts). A stored word
 * outside those three goes through `stateWord`, which says out loud that it cannot read it.
 */
function GoalState({ goal }: { goal: HorizonGoal }) {
  const mode = useMode()
  const said =
    goal.state === 'open'
      ? t('goals.notMetYet')
      : goal.state === 'met' && goal.stateAt !== null
        ? t('goals.metOn', { date: goal.stateAt })
        : goal.state === 'dropped' && goal.stateAt !== null
          ? t('goals.droppedOn', { date: goal.stateAt })
          : stateWord(goal.state, mode, 'goal').text
  return (
    <span className="hz-state" data-state={goal.state}>
      {said}
    </span>
  )
}

/** The project a row is in, by its title, or nothing when the row names no project. */
function RowProject({ id, titles }: { id: string | undefined; titles: ReadonlyMap<string, string> }) {
  return id === undefined ? null : <ProjectName id={id} titles={titles} />
}

function GoalItem({
  goal,
  project,
  titles,
  participants,
  markEach,
}: {
  goal: HorizonGoal
  project: string | undefined
  titles: ReadonlyMap<string, string>
  participants: ParticipantsNamed
  markEach: boolean
}) {
  return (
    <li className="hz-goal">
      <div className="hz-goal-main">
        <h3 className="hz-goalname">
          <RouteLink to={recordPath(goal.id)}>{goal.title}</RouteLink>
        </h3>
        <p className="hz-what">
          {goal.whatUnreadable ? t('word.notRecorded') : goal.what}
        </p>
        <p className="hz-facts">
          <RowProject id={project} titles={titles} />
          <OwnerSaid goal={goal} participants={participants} />
          <GoalState goal={goal} />
          {markEach ? <OriginMark record={goal} only="exceptions" /> : null}
        </p>
        {goal.stateBecause === null ? null : <p className="hz-because">{t('goals.because', { because: goal.stateBecause })}</p>}
      </div>
      <div className="hz-goal-work">
        {goal.clusters.length === 0 ? (
          <p className="hz-none">
            <Absence title={t('goals.nothingServes')} />
          </p>
        ) : (
          <ul className="hz-clusters">
            {goal.clusters.map((cluster) => (
              <ClusterItem key={cluster.id} cluster={cluster} participants={participants} />
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}

function ClusterItem({ cluster, participants }: { cluster: HorizonGoal['clusters'][number]; participants: ParticipantsNamed }) {
  const mode = useMode()
  return (
    <li className="hz-cluster">
      <h4 className="hz-clustername">
        <RouteLink to={recordPath(cluster.id)}>{cluster.title}</RouteLink>
        <span className="hz-kind"><Tag kind={cluster.kind} tone="quiet" /></span>
      </h4>
      {/* A MODULE HAS NO PARTS BY DESIGN, so nothing is missing and nothing is drawn. Only a
          trajectory can name parts, and one that names none says so on hover. */}
      {!cluster.isTrajectory ? null : cluster.parts.length === 0 ? (
        <p className="hz-none">
          <Absence title={t('goals.noParts')} />
        </p>
      ) : (
        <ol className="hz-parts">
          {cluster.parts.map((part) => (
            <li key={part.id} className="hz-part">
              <p className="hz-partwhat">
                {part.whatUnreadable ? t('word.notRecorded') : part.what}
              </p>
              {part.people.length === 0 ? (
                <p className="hz-none">
                  <Absence title={t('goals.nobodyOnPart')} />
                </p>
              ) : (
                <ul className="hz-people">
                  {part.people.map((person) => (
                    <li key={person.domainId} className="hz-person">
                      <span className="hz-who">{person.agentTitle}</span>
                      <span className="hz-doing">{presenceSaid(person)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {part.answers.length === 0 ? null : (
                <ul className="hz-answers">
                  {part.answers.map((answer) => (
                    <li key={`${answer.type}:${answer.workId}`} className="hz-answer">
                      <Tag tone="quiet">{linkWord(answer.type, 'forward').text}</Tag>
                      <RouteLink to={recordPath(answer.workId)}>{answer.title}</RouteLink>
                      <span className="hz-answer-said">
                        {answer.by === null
                          ? t('g7a.horizons.answerAuthorUnknown')
                          : t('g7a.horizons.answerBy', { who: writerNamed(answer.by, participants) })}
                      </span>
                      <span className="hz-answer-when">
                        {answer.at === null ? t('g7a.horizons.answerTimeUnknown') : <Stamp at={answer.at} />}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {part.windows.length === 0 ? (
                <p className="hz-none">
                  <Absence title={t('goals.noWindow')} />
                </p>
              ) : (
                <ul className="hz-windows">
                  {part.windows.map((window) => (
                    <li key={window.id} className="hz-window">
                      <span className="hz-when">
                        {window.startsOn === window.endsOn
                          ? window.startsOn
                          : t('g7a.horizons.days', { start: window.startsOn, end: window.endsOn })}
                      </span>
                      {/* WHO IS ON A PART IS WHAT THIS PAGE SHOWS (criterion P5): an agent's window is named by the
                          agent's name, never its handle or id, which normal mode may not show (7FEOshq3mBGG b-6). */}
                      <span className="hz-windowowner">{mode !== 'inspect' && window.owner.kind === 'agent' && window.owner.id !== ''
                        ? <><ParticipantName kind="agent" id={window.owner.id} />{t('g7a.horizons.afterAnAgentsName')}</>
                        : wordsOfWindow(window.owner, mode)}</span>
                      <span className="hz-windowstate">{t(windowStateKey(window.state))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </li>
  )
}

/**
 * WHAT ONE PERSON IS DOING ON A PART, in one sentence built from the two dimensions the presence
 * read keeps apart: whether anybody is here, and where the work stands.
 */
export function presenceSaid(person: HorizonPerson): string {
  const quiet = person.quietForMinutes === null
    ? t('absence.mark')
    : person.quietForMinutes < 60
      ? t('g7a.horizons.working')
      : person.quietForMinutes < 60 * 24
        ? t('g7a.horizons.quietHours', { n: Math.round(person.quietForMinutes / 60) })
        : t('g7a.horizons.quietDays', { n: Math.round(person.quietForMinutes / (60 * 24)) })
  return person.objective.trim() === '' ? quiet : t('g7a.horizons.presence', { quiet, objective: person.objective.trim() })
}

/**
 * WHERE THE PLAN AND WHAT HAPPENED DIFFER: three lists side by side where the width allows, each a
 * list of sentences a person can check against the record. An empty list is the short mark, and its
 * reason on hover says what was looked at.
 */
function AgainstActualSection({
  actual,
  projectOf,
  titles,
}: {
  actual: ReturnType<typeof againstActual>
  projectOf: Readonly<Record<string, string>>
  titles: ReadonlyMap<string, string>
}) {
  const lists: { title: string; none: string; facts: AgainstActualFact[] }[] = [
    {
      get title(): string { return t('g7a.horizons.late') },
      get none(): string { return t('goals.noLate') },
      facts: actual.lateWindows,
    },
    {
      get title(): string { return t('g7a.horizons.dropped') },
      get none(): string { return t('goals.noDropped') },
      facts: actual.droppedLines,
    },
    {
      get title(): string { return t('g7a.horizons.unplanned') },
      get none(): string { return t('goals.noBuilt') },
      facts: actual.partsBuilt,
    },
  ]
  return (
    <section className="hz-group hz-differ" {...declaredAttributes({ surface: 'horizons.against' })}>
      <h2 className="hz-head">
        <span>{t('goals.differ')}</span>
      </h2>
      <div className="hz-differ-cols">
        {lists.map((list) => (
          <section key={list.title} className="hz-actual">
            <h3 className="hz-actualtitle" data-title-is="its-label">{list.title}</h3>
            {list.facts.length === 0 ? (
              <p className="hz-none"><Absence title={list.none} /></p>
            ) : (
              <ul className="hz-actuallist">
                {list.facts.map((fact) => (
                  <li key={fact.id} className="hz-actualfact">
                    {fact.said}
                    {projectOf[fact.id] === undefined ? null : (
                      <span className="hz-actualproject">
                        <ProjectName id={projectOf[fact.id]!} titles={titles} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </section>
  )
}

/**
 * The page's own sheet. Every value is a token from tokens.css; no backtick appears anywhere in
 * this string, including inside a comment, because a backtick would close the template literal.
 *
 * Every class here begins with hz- and no other page or component uses one. A section is not a box:
 * a heading in the look's label style, then rows split by one thin line. The page answers to its own
 * width, not the window's, so a goal goes side by side only when the page itself is wide.
 */
export const HORIZONS_CSS = `
.hz { container-type: inline-size; container-name: hz; display: flex; flex-direction: column; gap: var(--gut); }
.hz-top { display: flex; align-items: center; justify-content: space-between; gap: var(--gut); flex-wrap: wrap; }
.hz-title { margin: 0; font-size: var(--fs-6); font-weight: 600; line-height: var(--lh-tight); }
.hz-group { display: flex; flex-direction: column; min-width: 0; margin-top: var(--pad); }
.hz-head {
  margin: 0 0 var(--pad); display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--pad);
  font-family: var(--section-font); font-size: var(--panel-title-size); font-weight: var(--section-weight);
  text-transform: var(--section-case); letter-spacing: var(--section-space); line-height: var(--lh-tight);
  color: var(--text);
}
.hz-needs .hz-head { color: var(--ask); }
.hz-count { font-size: var(--fs-1); font-weight: 600; color: var(--text-3); letter-spacing: 0; text-transform: none; font-variant-numeric: tabular-nums; }
.hz-span { font-family: var(--font-ui); font-size: var(--fs-1); font-weight: 400; color: var(--text-3); letter-spacing: 0; text-transform: none; }
.hz-quiet { margin: 0; color: var(--text-3); font-size: var(--fs-2); }
.hz-none { margin: 0; color: var(--text-2); }
.hz-needs-elsewhere { margin: var(--pad) 0 0; display: flex; align-items: center; flex-wrap: wrap; gap: var(--pad) var(--gut); color: var(--text-2); font-size: var(--fs-2); }
.hz-elsewhere-said { max-width: var(--measure-in-box); }

.hz-needlist, .hz-goals, .hz-clusters, .hz-parts, .hz-people, .hz-windows, .hz-actuallist { list-style: none; margin: 0; padding: 0; }
.hz-needlist, .hz-goals { border-top: var(--border-w) solid var(--border); }
.hz-needrow {
  display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: var(--pad) var(--gut);
  min-height: 44px; padding: var(--pad); border-bottom: var(--border-w) solid var(--border); background: var(--ask-row);
}
.hz-needlink { font-size: var(--fs-2); font-weight: 600; color: var(--text); overflow-wrap: anywhere; }
.hz-needfacts { display: flex; align-items: center; flex-wrap: wrap; gap: 4px var(--gut); color: var(--text-2); font-size: var(--fs-1); }
.hz-needrow > .px-error, .hz-needrow > [role="alert"] { grid-column: 1 / -1; }

.hz-goal { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--pad) var(--gut); padding: var(--pad-lg) 0; border-bottom: var(--border-w) solid var(--border); }
.hz-goal-main, .hz-goal-work { min-width: 0; }
.hz-goalname { margin: 0 0 2px 0; font-size: var(--fs-3); font-weight: 600; line-height: var(--lh-tight); }
.hz-what { margin: 0 0 var(--pad) 0; max-width: var(--measure-in-box); line-height: var(--lh-body); }
.hz-facts { display: flex; align-items: center; gap: 4px var(--gut); flex-wrap: wrap; margin: 0; color: var(--text-2); font-size: var(--fs-1); }
.hz-state { color: var(--text-2); }
.hz-because { margin: var(--pad) 0 0 0; color: var(--text-2); font-size: var(--fs-1); max-width: var(--measure-in-box); line-height: var(--lh-body); }

.hz-cluster { padding: 0 0 var(--pad) var(--pad-lg); border-left: var(--rail) solid var(--border-strong); margin-bottom: var(--pad); }
.hz-cluster:last-child { margin-bottom: 0; }
.hz-clustername { margin: 0 0 4px 0; font-size: var(--fs-2); font-weight: 600; display: flex; align-items: baseline; gap: var(--pad); flex-wrap: wrap; }
.hz-kind { color: var(--text-3); font-size: var(--fs-1); }
.hz-part { padding: var(--pad) 0; border-top: var(--border-w) solid var(--border); display: flex; flex-direction: column; gap: 4px; }
.hz-part:first-child { border-top: none; padding-top: 0; }
.hz-partwhat { margin: 0; max-width: var(--measure-in-box); line-height: var(--lh-body); font-size: var(--fs-2); }
.hz-person, .hz-window { display: flex; align-items: baseline; gap: var(--pad); flex-wrap: wrap; font-size: var(--fs-1); }
.hz-who { font-weight: 600; }
.hz-doing, .hz-windowstate { color: var(--text-2); font-size: var(--fs-1); }
.hz-answers-count { margin: 0; color: var(--text-3); font-size: var(--fs-1); }
.hz-answers { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.hz-answer { display: flex; align-items: baseline; gap: 4px var(--pad); flex-wrap: wrap; color: var(--text-2); font-size: var(--fs-1); }
.hz-answer-said, .hz-answer-when { color: var(--text-2); }
.hz-when { font-variant-numeric: tabular-nums; }

.hz-differ-cols { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--pad-lg) var(--gut); border-top: var(--border-w) solid var(--border); padding-top: var(--pad); }
.hz-actual { min-width: 0; }
.hz-actualtitle { margin: 0 0 4px 0; font-size: var(--fs-2); font-weight: 600; }
.hz-actuallist { display: flex; flex-direction: column; gap: 4px; }
.hz-actualfact { max-width: var(--measure-in-box); line-height: var(--lh-body); font-size: var(--fs-2); }
.hz-drawing { min-width: 0; margin-top: var(--pad); }
.hz-counted { margin: 0; color: var(--text-3); font-size: var(--fs-1); }
.hz-actualproject { display: block; font-size: var(--fs-1); }

@container hz (width >= 60rem) {
  .hz-goal { grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); }
  .hz-differ-cols { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@container hz (width < 40rem) {
  .hz-title { font-size: var(--fs-5); }
  .hz-needrow { grid-template-columns: minmax(0, 1fr); }
  .hz-cluster { padding-left: var(--pad); }
}
`
