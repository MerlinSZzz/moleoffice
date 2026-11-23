// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13s. Home's figures as data entries: which read answers each, the shape its answer is drawn in, and the
// picture part that draws it. A figure is read only while it is drawn, for every project or the one chosen.
import type { ProjectChoice } from '@shared/across-projects.ts'
import type { MyDecisions, PackagesByLine, PackagesDonePerDay, TimeToLive, TimeToLiveStage, WholeSuiteMinutes } from '@shared/figures.ts'
import type { HomeFigure } from '@shared/home-layout.ts'
import { t, type WordKey } from '@shared/i18n.ts'
import type { BigNumberData, PartName, PartState, PointsByDayData, TableData } from '@shared/picture-parts.ts'
import type { ChecklistsAcrossReply } from '../../api.ts'
import { readMyDecisions, readPackagesByLine, readPackagesDone, readSuiteMinutes, readTimeToLive } from '../../lib/home-figures.ts'
import { readMyChecklistsOnce, theseProjectsOf, useMyChecklists } from '../../lib/my-checklists.ts'
import type { Figure } from '../picture-parts/figures.tsx'
import { theStateOf } from '../picture-parts/figures.tsx'
import { partDrawn } from '../picture-parts/parts.tsx'
import { useAsync } from '../ui.tsx'

/** Minutes as hours to one decimal place, the unit Home's times are drawn in. */
export function hoursOf(minutes: number): number {
  return Math.round(minutes / 6) / 10
}

/**
 * HIS OPEN CHECKLIST ITEMS: the open items of the person's own checklists, in the projects shown. They are counted from
 * the page's one read of his checklists of every project, which the checklists window draws too.
 */
export const MY_CHECKLIST: Figure<'big-number', ChecklistsAcrossReply> = {
  label: 'home.figure.myChecklist',
  read: (project) => readMyChecklistsOnce().then((reply) => theseProjectsOf(reply, project)),
  shape: ({ checklists }): PartState<BigNumberData> => ({
    status: 'ready',
    data: { value: checklists.reduce((open, checklist) => open + checklist.counts.open, 0), unit: t('home.figure.openItems') },
  }),
  part: 'big-number',
}

/** HIS DECISIONS: the forks he settled over the door's span of days. */
export const MY_DECISIONS: Figure<'big-number', MyDecisions> = {
  label: 'home.figure.myDecisions',
  read: readMyDecisions,
  shape: ({ settled }): PartState<BigNumberData> => ({ status: 'ready', data: { value: settled, unit: t('home.figure.forksSettled') } }),
  part: 'big-number',
}

/**
 * THE TIME A DECISION TAKES HIM, as a line over the days: on each day, the average hours from a fork starting to wait on
 * him to his settling it, over the forks he settled that day. With none settled in the span, nobody can say, and the
 * part says not recorded rather than drawing a line of nothing.
 */
export const MY_DECISION_TIME: Figure<'line-over-days', MyDecisions> = {
  label: 'home.figure.myDecisionTime',
  read: readMyDecisions,
  shape: ({ averageMinutes, days }): PartState<PointsByDayData> => averageMinutes === null
    ? { status: 'not-recorded' }
    : { status: 'ready', data: { points: days.map(({ day, averageMinutes: minutes }) => ({ day, value: minutes === null ? null : hoursOf(minutes) })) } },
  part: 'line-over-days',
}

/** THE PACKAGES OF EACH LINE: one row for each line the packages carry, and the row of no line last. */
export const PACKAGES_BY_LINE: Figure<'table', PackagesByLine> = {
  label: 'home.figure.packagesByLine',
  read: readPackagesByLine,
  shape: ({ lines }): PartState<TableData> => ({
    status: 'ready',
    data: {
      columns: [t('home.figure.line'), t('home.figure.packages')],
      rows: lines.map(({ line, total }) => [line ?? t('home.figure.noLine'), total]),
    },
  }),
  part: 'table',
}

/** THE PACKAGES FINISHED ON EACH DAY of the span. A day the records do not cover has no point. */
export const PACKAGES_DONE: Figure<'line-over-days', PackagesDonePerDay> = {
  label: 'home.figure.packagesDone',
  read: readPackagesDone,
  shape: ({ days }): PartState<PointsByDayData> => ({ status: 'ready', data: { points: days.map(({ day, done }) => ({ day, value: done })) } }),
  part: 'line-over-days',
}

const STAGE_WORDS = {
  taken: 'home.figure.stage.taken',
  handedBack: 'home.figure.stage.handedBack',
  onMain: 'home.figure.stage.onMain',
  live: 'home.figure.stage.live',
} as const satisfies Record<TimeToLiveStage, WordKey>

/** THE LEAD TIME: for each stretch from one stage to another, the median hours and how many packages it is over. */
export const TIME_TO_LIVE: Figure<'table', TimeToLive> = {
  label: 'home.figure.timeToLive',
  read: readTimeToLive,
  shape: ({ medians }): PartState<TableData> => ({
    status: 'ready',
    data: {
      columns: [t('home.figure.stretch'), t('home.figure.medianHours'), t('home.figure.packages')],
      rows: medians.map(({ from, to, minutes, over }) => [
        t('home.figure.fromTo', { from: t(STAGE_WORDS[from]), to: t(STAGE_WORDS[to]) }),
        minutes === null ? null : hoursOf(minutes),
        over,
      ]),
    },
  }),
  part: 'table',
}

/** THE WHOLE SUITE'S TEST TIME: the median minutes of the whole-suite runs that ended in the span. */
export const SUITE_MINUTES: Figure<'big-number', WholeSuiteMinutes> = {
  label: 'home.figure.suiteMinutes',
  read: readSuiteMinutes,
  shape: ({ median }): PartState<BigNumberData> => median.minutes === null
    ? { status: 'not-recorded' }
    : { status: 'ready', data: { value: Math.round(median.minutes), unit: t('home.figure.minutes') } },
  part: 'big-number',
}

/** Draws one entry for the projects shown, read again when the choice changes. */
function drawnFigure<P extends PartName, A>(figure: Figure<P, A>) {
  return function DrawnHomeFigure({ project }: { project: ProjectChoice }) {
    const [reading] = useAsync(() => figure.read(project), [project])
    return partDrawn(figure.part, t(figure.label), theStateOf(reading, figure.shape))
  }
}

/** EACH FIGURE HOME CAN DRAW, by its part's name in the layout, with its entry. */
const HOME_FIGURE_ENTRIES = {
  myChecklist: MY_CHECKLIST,
  myDecisions: MY_DECISIONS,
  myDecisionTime: MY_DECISION_TIME,
  packagesByLine: PACKAGES_BY_LINE,
  packagesDone: PACKAGES_DONE,
  timeToLive: TIME_TO_LIVE,
  suiteMinutes: SUITE_MINUTES,
} as const satisfies Record<HomeFigure, { label: WordKey }>

/** Each figure's name, as its label says it, for the layout's menus and the list of hidden parts. */
export const FIGURE_NAMES = Object.fromEntries(
  Object.entries(HOME_FIGURE_ENTRIES).map(([figure, entry]) => [figure, entry.label]),
) as Record<HomeFigure, WordKey>

/** His open checklist items, drawn from the one read and following its changes, for the projects shown. */
function DrawnMyChecklist({ project }: { project: ProjectChoice }) {
  const reading = useMyChecklists()
  return partDrawn(MY_CHECKLIST.part, t(MY_CHECKLIST.label), theStateOf(reading, (reply) => MY_CHECKLIST.shape(theseProjectsOf(reply, project))))
}

const DRAWN: Record<HomeFigure, (props: { project: ProjectChoice }) => ReturnType<typeof partDrawn>> = {
  myChecklist: DrawnMyChecklist,
  myDecisions: drawnFigure(MY_DECISIONS),
  myDecisionTime: drawnFigure(MY_DECISION_TIME),
  packagesByLine: drawnFigure(PACKAGES_BY_LINE),
  packagesDone: drawnFigure(PACKAGES_DONE),
  timeToLive: drawnFigure(TIME_TO_LIVE),
  suiteMinutes: drawnFigure(SUITE_MINUTES),
}

/** One of Home's figures, as a part of Home, for the projects shown. */
export function HomeFigureDrawn({ figure, project }: { figure: HomeFigure; project: ProjectChoice }) {
  const Drawn = DRAWN[figure]
  return <section className="hm-section hm-figure" data-home-section={figure}><Drawn project={project} /></section>
}
