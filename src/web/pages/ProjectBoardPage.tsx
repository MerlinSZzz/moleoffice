// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT BOARD'S PAGE: the table sorted by what needs a person as the "By block" tab, with the view by line, the
 * quick view and the people and packages as the three other tabs.
 *
 * WHERE EVERYTHING ON IT COMES FROM. The first three tabs draw one answer of `GET /api/projects/<project>/board`, which
 * src/server/lib/project-board.ts works out from records, links and main's history each time it is asked. The one
 * figure that answer does not hold is the hours main was red, which the quick view reads from
 * `GET /api/merge-queue/measures`, the merge queue page's own measure, so the two pages cannot give one hour two
 * colours. The fourth tab draws `GET /api/projects/<project>/people-and-packages`, which
 * src/server/lib/project-people.ts works out, and reads it only when the tab is chosen. Nothing on this page is typed
 * by hand, and the page keeps nothing between visits.
 *
 * NO SMALL PRINT AND NO EXPLANATORY TEXT: no footnote, no mark beside a value, no list of notes and no body text. A
 * cell with no value is blank. People are shown the tabs and the rows only. The reasons are for agents, who read them
 * in the board door's answer and its note. The one plain line the fourth tab draws says what its word "accepted"
 * means, because the line's counts use that word for the package state the rest of the office calls done.
 *
 * NO WORK ON COLOURS OR BORDERS: the page uses the office's own colours and lines.
 */
import { useMemo, useState } from 'react'
import { cardWord } from '@shared/card-words.ts'
import { dayInThePageLanguage, t, type WordKey } from '@shared/i18n.ts'
import type { QueueMeasures } from '@shared/merge-queue-measures.ts'
import {
  BOARD_GROUPS,
  type BoardGroup,
  type BoardLanding,
  type BoardLine,
  type BoardRow,
  type ProjectBoard,
} from '@shared/project-board.ts'
import { theLineIsAtRest, type PeopleAgent, type PeopleLine, type PeoplePackage, type PeopleRun } from '@shared/project-people.ts'
import { packageStateWord } from '@shared/words.ts'
import { api } from '../api.ts'
import { departmentPath, pipelinePath, recordPath, RouteLink, sessionPath, whoPath } from '../components/router.tsx'
import { ErrorNote, Loading, PANEL_STATES, panelStateWord, type PanelState } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { useLanguage } from '../lib/language.ts'
import { stampToTheMinute } from '../lib/minute.ts'
import { theLevelShown, theNameShown } from '../lib/department-words.ts'
import { currentWorkspace } from '../lib/workspace.ts'

/** The four tabs, in a fixed order: by block first, then by line, then the quick view, then people and packages. */
export const BOARD_TABS = ['block', 'line', 'quick', 'people'] as const
export type BoardTab = (typeof BOARD_TABS)[number]

const TAB_WORDS: Readonly<Record<BoardTab, WordKey>> = {
  block: 'board.tab.block',
  line: 'board.tab.line',
  quick: 'board.tab.quick',
  people: 'board.tab.people',
}

const GROUP_WORDS: Readonly<Record<BoardGroup, WordKey>> = {
  'nobody-on-it': 'board.group.nobodyOnIt',
  stalled: 'board.group.stalled',
  'not-known': 'board.group.notKnown',
  'moving-or-done': 'board.group.movingOrDone',
  'no-pipeline': 'board.group.noPipeline',
}

/** The rows of the "By block" tab in their groups, in the board's own order; a group with no row is left out. */
export function theRowsInTheirGroups(board: Pick<ProjectBoard, 'rows'>): { group: BoardGroup; rows: BoardRow[] }[] {
  return BOARD_GROUPS.map((group) => ({ group, rows: board.rows.filter((row) => row.group === group) })).filter((one) => one.rows.length > 0)
}

/** The lines of a row's runs that act now, each once, in name order. A run whose handle gives no line adds nothing. */
export function theLinesOfARow(row: Pick<BoardRow, 'acting'>): string[] {
  return [...new Set(row.acting.flatMap((run) => (run.line === null ? [] : [run.line])))].sort()
}

/** The landings of the last 7 days whose files reach this row, newest first, as the answer lists them. */
function theLandingsOfARow(board: ProjectBoard, row: BoardRow): BoardLanding[] {
  return board.landings.state === 'read' ? board.landings.landings.filter((landing) => landing.rows.includes(row.id)) : []
}

/** The oldest unfinished step's age in whole days, or null when the row has no unfinished step. */
function theOldestAge(row: Pick<BoardRow, 'unfinished'>): number | null {
  return row.unfinished.length === 0 ? null : Math.max(...row.unfinished.map((step) => step.days))
}

/** A day of the answer's `perDay`, "2026-11-13", written in the page's language. */
function aDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return year === undefined || month === undefined || date === undefined ? day : dayInThePageLanguage(new Date(year, month - 1, date), false)
}

function aCount(count: number, one: WordKey, many: WordKey): string {
  return count === 1 ? t(one) : t(many, { count: String(count) })
}

/** A step's age, "1 day" or "5 days". */
function anAge(days: number): string {
  return aCount(days, 'board.step.age.one', 'board.step.age.many')
}

/** A step's state in the reader's words, the same word its chip on the pipeline page says. */
function aStateWord(state: string): string {
  return (PANEL_STATES as readonly string[]).includes(state) ? panelStateWord(state as PanelState) : state
}

/**
 * WHY A ROW IS IN ITS GROUP, in one line under its name: the runs on it and its open and stalled steps, the three
 * things its group is worked out from. A row of the "not known" group has no run filed under it, which is not the
 * same as no run being on it, since a run under no row may be.
 */
export function theReasonOfARow(row: BoardRow): string {
  if (row.group === 'no-pipeline') return t('board.reason.noPipeline')
  const runs =
    row.acting.length > 0
      ? aCount(row.acting.length, 'board.reason.runs.one', 'board.reason.runs.many')
      : t(row.group === 'not-known' ? 'board.reason.runs.noneFiled' : 'board.reason.runs.none')
  if (row.unfinished.length === 0) return row.acting.length === 0 ? t('board.reason.allDone') : t('board.reason.doneWithRuns', { runs })
  const open = aCount(row.unfinished.length, 'board.reason.steps.one', 'board.reason.steps.many')
  const stalled = row.unfinished.filter((step) => step.stalled).length
  return stalled === 0
    ? t('board.reason.open', { runs, open })
    : t('board.reason.openStalled', { runs, open, stalled: aCount(stalled, 'board.reason.stalled.one', 'board.reason.stalled.many') })
}

export function ProjectBoardPage() {
  useLanguage()
  const project = currentWorkspace()
  const [tab, setTab] = useState<BoardTab>('block')
  const [read, reload] = useProjectAsync(() => api.projectBoard(project), [project])
  return (
    // The master's state, once the board is read, tells a read board with no master from one still loading, because
    // such a board draws no text.
    <div className="page pb" data-board-tab={tab} data-board-master={read.status === 'ready' ? read.value.master.state : undefined}>
      <style href="mole-office-project-board" precedence="default">
        {PROJECT_BOARD_CSS}
      </style>
      {/* THE NAME, TYPED: the same words as the rail row that opens this page. */}
      <h1 className="pb-title" data-title-is="its-label">{t('nav.board')}</h1>
      {read.status === 'loading' ? <Loading what={t('nav.board')} /> : null}
      {read.status === 'error' ? <ErrorNote message={read.message} fault={read.fault} retry={reload} /> : null}
      {read.status === 'ready' ? <TheBoard project={project} board={read.value} tab={tab} onTab={setTab} /> : null}
    </div>
  )
}

function TheBoard({ project, board, tab, onTab }: { project: string; board: ProjectBoard; tab: BoardTab; onTab: (tab: BoardTab) => void }) {
  // A board whose master is not marked draws nothing under its title. Why it has no rows is in the door's answer.
  if (board.master.state !== 'marked') return null
  return (
    <>
      <div className="pb-tabs" role="tablist" aria-label={t('board.tabs')}>
        {BOARD_TABS.map((one) => (
          <button
            key={one}
            type="button"
            role="tab"
            className="pb-tab"
            data-tab={one}
            id={`pb-tab-${one}`}
            aria-selected={tab === one}
            aria-controls="pb-under-tabs"
            onClick={() => onTab(one)}
          >
            {t(TAB_WORDS[one])}
          </button>
        ))}
      </div>
      <div className="pb-under-tabs" id="pb-under-tabs" role="tabpanel" aria-labelledby={`pb-tab-${tab}`}>
        {tab === 'block' ? <ByBlock board={board} /> : null}
        {tab === 'line' ? <ByLine board={board} /> : null}
        {tab === 'quick' ? <QuickView board={board} /> : null}
        {tab === 'people' ? <ByPeople project={project} /> : null}
      </div>
    </>
  )
}

const COLUMNS: readonly WordKey[] = [
  'board.col.acting',
  'board.col.lines',
  'board.col.agents',
  'board.col.packages',
  'board.col.backlog',
  'board.col.unfinished',
  'board.col.stalled',
  'board.col.oldest',
  'board.col.landings',
  'board.col.lastLanding',
]

/** VIEW A3: one row for each block, in the groups of what most needs a person. A row opens to what is under it. */
function ByBlock({ board }: { board: ProjectBoard }) {
  const groups = theRowsInTheirGroups(board)
  return (
    <div className="pb-block" data-board-view="block">
      <div className="pb-grid pb-head" aria-hidden="true">
        <span>{t('board.col.block')}</span>
        {COLUMNS.map((column) => (
          <span key={column}>{t(column)}</span>
        ))}
      </div>
      {groups.map(({ group, rows }) => (
        <section key={group} className="pb-group" data-board-group={group}>
          <h2 className="pb-group-title">
            {t(GROUP_WORDS[group])} <span className="pb-count">{aCount(rows.length, 'board.blocks.one', 'board.blocks.many')}</span>
          </h2>
          {rows.map((row) => (
            <ARow key={row.id} board={board} row={row} />
          ))}
        </section>
      ))}
      {board.actingUnderNoRow.length === 0 ? null : (
        <section className="pb-group" data-board-group="under-no-row">
          <h2 className="pb-group-title">
            {aCount(board.actingUnderNoRow.length, 'board.underNoRow.one', 'board.underNoRow.many')}
          </h2>
          <ul className="pb-list">
            {board.actingUnderNoRow.map((run) => (
              <li key={run.id}>
                <RouteLink to={sessionPath(run.id)}>{run.title}</RouteLink>
                {run.agent === null ? null : <span className="pb-quiet"> {run.agent}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function ARow({ board, row }: { board: ProjectBoard; row: BoardRow }) {
  const [open, setOpen] = useState(false)
  const oldest = theOldestAge(row)
  const cells: [WordKey, string][] = [
    ['board.col.acting', String(row.acting.length)],
    ['board.col.lines', theLinesOfARow(row).join(', ')],
    ['board.col.agents', String(row.agents.length)],
    ['board.col.packages', String(row.packages.length)],
    ['board.col.backlog', String(row.backlog.length)],
    ['board.col.unfinished', String(row.unfinished.length)],
    ['board.col.stalled', String(row.unfinished.filter((step) => step.stalled).length)],
    ['board.col.oldest', oldest === null ? '' : String(oldest)],
    ['board.col.landings', row.landings7Days === null ? '' : String(row.landings7Days)],
    ['board.col.lastLanding', row.lastLanding === null ? '' : stampToTheMinute(row.lastLanding)],
  ]
  return (
    <details className="pb-row" data-board-row={row.id} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="pb-grid pb-summary">
        <span className="pb-block-head">
          <span className="pb-block-name">{row.title}</span>
          <span className="pb-reason" data-board-reason="">
            {theReasonOfARow(row)}
          </span>
        </span>
        {cells.map(([column, value]) => (
          <span key={column} className="pb-cell" data-column={column}>
            <span className="pb-cell-label">{t(column)}</span>
            <span className="pb-cell-value">{value}</span>
          </span>
        ))}
      </summary>
      {open ? <WhatIsUnderARow board={board} row={row} /> : null}
    </details>
  )
}

/** What a row holds, drawn only once it is opened. Each part is left out when it is empty. */
function WhatIsUnderARow({ board, row }: { board: ProjectBoard; row: BoardRow }) {
  const landings = theLandingsOfARow(board, row)
  return (
    <div className="pb-under">
      <p className="pb-step-link">
        <RouteLink to={recordPath(row.id)}>{t('board.row.theStep')}</RouteLink>
      </p>
      {row.pipelines.length === 0 ? null : (
        <APart title={t('board.part.pipelines')}>
          {row.pipelines.map((pipeline) => (
            <li key={pipeline.id}>
              <RouteLink to={pipelinePath(pipeline.id)}>{pipeline.title}</RouteLink>
            </li>
          ))}
        </APart>
      )}
      {row.unfinished.length === 0 ? null : (
        <APart title={t('board.part.unfinished')}>
          {row.unfinished.map((step) => (
            <li key={step.id} data-board-step={step.id} data-state={step.state}>
              <RouteLink to={recordPath(step.id)}>{step.title}</RouteLink>{' '}
              <span className="pb-quiet">
                {t(step.stalled ? 'board.step.factsStalled' : 'board.step.facts', { state: aStateWord(step.state), age: anAge(step.days), pipeline: step.pipeline.title })}
              </span>
            </li>
          ))}
        </APart>
      )}
      {row.acting.length === 0 ? null : (
        <APart title={t('board.part.acting')}>
          {row.acting.map((run) => (
            <li key={run.id}>
              <RouteLink to={sessionPath(run.id)}>{run.title}</RouteLink>{' '}
              <span className="pb-quiet">
                {run.agent === null
                  ? t('board.run.factsNoAgent', { at: stampToTheMinute(run.newestRequest) })
                  : t('board.run.facts', { agent: run.agent, at: stampToTheMinute(run.newestRequest) })}
              </span>
            </li>
          ))}
        </APart>
      )}
      {row.packages.length === 0 ? null : (
        <APart title={t('board.part.packages')}>
          {row.packages.map((one) => (
            <li key={one.id}>
              <RouteLink to={recordPath(one.id)}>{one.title}</RouteLink>
              {one.lines.length === 0 ? null : <span className="pb-quiet"> {one.lines.join(', ')}</span>}
            </li>
          ))}
        </APart>
      )}
      {row.backlog.length === 0 ? null : (
        <APart title={t('board.part.backlog')}>
          {row.backlog.map((item) => (
            <li key={item.id}>
              <RouteLink to={recordPath(item.id)}>{item.title}</RouteLink> <span className="pb-quiet">{item.line}</span>
            </li>
          ))}
        </APart>
      )}
      {landings.length === 0 ? null : (
        <APart title={t('board.part.landings')}>
          {landings.map((landing) => (
            <li key={landing.commit}>
              {landing.subject} <span className="pb-quiet">{stampToTheMinute(landing.at)}</span>
            </li>
          ))}
        </APart>
      )}
    </div>
  )
}

function APart({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pb-part">
      <h3 className="pb-part-title">{title}</h3>
      <ul className="pb-list">{children}</ul>
    </div>
  )
}

/**
 * VIEW B: one lane for each line, with what it landed, what acts now, what is next and how much is later. It leads to the
 * departments page, where the departments the lanes are titled by are read and changed.
 */
function ByLine({ board }: { board: ProjectBoard }) {
  const toTheDepartments = (
    <p className="pb-step-link">
      <RouteLink to={departmentPath()}>{t('board.line.departments')}</RouteLink>
    </p>
  )
  if (board.lines.length === 0) {
    return (
      <>
        {toTheDepartments}
        <p className="pb-body">{t('board.line.none')}</p>
      </>
    )
  }
  return (
    <div className="pb-lanes" data-board-view="line">
      {toTheDepartments}
      {board.lines.map((line) => (
        <ALane key={line.line ?? ''} board={board} line={line} />
      ))}
    </div>
  )
}

/**
 * A LANE'S TITLE. A code a department holds is titled by that department: its name in the reader's language and its
 * level word. A code no department holds keeps the title it had, with the mark that it is not filed as a department,
 * and so does a code merged departments ending in different places hold. The line not recorded keeps its title.
 */
export function theTitleOfALine(line: Pick<BoardLine, 'line' | 'department'>): string {
  if (line.line === null) return t('board.line.notRecorded')
  const department = line.department
  if (department?.state === 'held') {
    return t('board.line.department', { name: theNameShown(department.name), level: theLevelShown(department.level, department.teams) })
  }
  const named = t('board.line.named', { line: line.line })
  if (department === null) return named
  const mark = department.state === 'not-held' ? t('board.line.notFiled') : t('board.line.heldBySeveral', { n: department.ids.length })
  return t('board.line.marked', { title: named, mark })
}

function ALane({ board, line }: { board: ProjectBoard; line: BoardLine }) {
  const department = line.department
  return (
    <section className="pb-lane" data-board-line={line.line ?? ''}>
      <h2 className="pb-lane-title">
        {department?.state === 'held' ? <RouteLink to={departmentPath(department.id)}>{theTitleOfALine(line)}</RouteLink> : theTitleOfALine(line)}
      </h2>
      <div className="pb-lane-columns">
        <ALaneColumn title={t('board.lane.landed')}>
          {board.landings.state === 'read'
            ? line.landed.map((landing) => (
                <li key={landing.commit}>
                  {landing.subject} <span className="pb-quiet">{stampToTheMinute(landing.at)}</span>
                </li>
              ))
            : null}
        </ALaneColumn>
        <ALaneColumn title={t('board.lane.now')}>
          {line.now.map((run) => (
            <li key={run.id}>
              <RouteLink to={sessionPath(run.id)}>{run.title}</RouteLink>
              {run.agent === null ? null : <span className="pb-quiet"> {run.agent}</span>}
            </li>
          ))}
        </ALaneColumn>
        <ALaneColumn title={t('board.lane.next')}>
          {line.next.map((one) => (
            <li key={one.id}>
              <RouteLink to={recordPath(one.id)}>{one.title}</RouteLink>
            </li>
          ))}
        </ALaneColumn>
        <div className="pb-lane-column">
          <h3 className="pb-part-title">{t('board.lane.later')}</h3>
          {line.later.length === 0 ? null : <TheLater line={line} />}
        </div>
      </div>
    </section>
  )
}

function ALaneColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pb-lane-column">
      <h3 className="pb-part-title">{title}</h3>
      <ul className="pb-list">{children}</ul>
    </div>
  )
}

/** "Later" is a count of the line's backlog items to do, which opens to their titles. */
function TheLater({ line }: { line: BoardLine }) {
  const [open, setOpen] = useState(false)
  return (
    <details className="pb-later" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{aCount(line.later.length, 'board.lane.laterCount.one', 'board.lane.laterCount.many')}</summary>
      {open ? (
        <ul className="pb-list">
          {line.later.map((item) => (
            <li key={item.id}>
              <RouteLink to={recordPath(item.id)}>{item.title}</RouteLink>
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  )
}

// ============================================================================ the people and packages tab

/** An agent's post in the reader's words, or the word for no card. */
function aPostWord(post: string | null): string {
  if (post === null) return t('board.people.post.none')
  if (post === 'supervisor') return t('board.people.post.supervisor')
  if (post === 'worker') return t('board.people.post.worker')
  return cardWord(post)
}

/** A package's state in the reader's words: the word the task's package panel says, or "not read". */
function aPackageStateWord(state: string): string {
  return state === 'not-read' ? t('board.people.state.notRead') : packageStateWord(state).text
}

/**
 * A LINE'S SUMMARY ROW: its packages counted by state, and its acting agents by card, or that it is at rest.
 * The counts are the door's own, so the row cannot disagree with the answer.
 */
export function theSummaryOfALine(line: PeopleLine): string {
  const { counts } = line
  const packages =
    counts.all === 0
      ? t('board.people.counts.none')
      : t('board.people.counts', {
          all: aCount(counts.all, 'board.people.packages.one', 'board.people.packages.many'),
          notTaken: String(counts.notTaken),
          inProgress: String(counts.inProgress),
          handedBack: String(counts.handedBack),
          accepted: String(counts.accepted),
          blocked: String(counts.blocked),
        })
  const kinds: string[] = []
  if (line.running.supervisors > 0) kinds.push(aCount(line.running.supervisors, 'board.people.supervisors.one', 'board.people.supervisors.many'))
  if (line.running.workers > 0) kinds.push(aCount(line.running.workers, 'board.people.workers.one', 'board.people.workers.many'))
  for (const { card, count } of line.running.otherCards) {
    if (card === 'inspector') kinds.push(aCount(count, 'board.people.inspectors.one', 'board.people.inspectors.many'))
    else if (card === 'secretary') kinds.push(aCount(count, 'board.people.secretaries.one', 'board.people.secretaries.many'))
    else if (card === 'administrator') kinds.push(aCount(count, 'board.people.administrators.one', 'board.people.administrators.many'))
    else if (card === null) kinds.push(aCount(count, 'board.people.noCard.one', 'board.people.noCard.many'))
    else kinds.push(t('board.people.otherCard', { count: String(count), card: cardWord(card) }))
  }
  const last = kinds.pop()
  const words = last === undefined ? '' : kinds.length === 0 ? last : t('board.people.listAnd', { list: kinds.join(t('board.people.listComma')), last })
  const running = theLineIsAtRest(line) ? t('board.people.atRest') : t('board.people.running', { kinds: words })
  return t('board.people.summary', { packages, running })
}

/**
 * VIEW C: one lane for each line, with who acts on it now, under whom, and the packages each one holds. It reads
 * `GET /api/projects/<project>/people-and-packages` when the tab is chosen, and not before, and is drawn as the "By
 * line" tab is, with the same parts.
 */
function ByPeople({ project }: { project: string }) {
  const [read, reload] = useProjectAsync(() => api.peopleAndPackages(project), [project])
  if (read.status === 'loading') return <Loading what={t('board.tab.people')} />
  if (read.status === 'error') return <ErrorNote message={read.message} fault={read.fault} retry={reload} />
  return (
    <div className="pb-lanes" data-board-view="people">
      <p className="pb-body">{t('board.people.accepted')}</p>
      {read.value.lines.length === 0 ? <p className="pb-body">{t('board.people.none')}</p> : null}
      {read.value.lines.map((line) => (
        <APeopleLane key={line.line ?? ''} line={line} />
      ))}
    </div>
  )
}

function APeopleLane({ line }: { line: PeopleLine }) {
  const department = line.department
  const title = theTitleOfALine(line)
  return (
    <section className="pb-lane" data-board-line={line.line ?? ''}>
      <h2 className="pb-lane-title">
        {department?.state === 'held' ? <RouteLink to={departmentPath(department.id)}>{title}</RouteLink> : title}{' '}
        <span className="pb-quiet">
          {line.secretary === null ? t('board.people.secretary.none') : t('board.people.secretary', { name: line.secretary.name })}
        </span>
      </h2>
      <p className="pb-reason" data-people-summary="">
        {theSummaryOfALine(line)}
      </p>
      {line.supervisors.length === 0 && line.workersUnderNoSupervisor.length === 0 ? null : (
        <div className="pb-lane-columns">
          {line.supervisors.map((agent) => (
            <div key={agent.runs[0]!.id} className="pb-lane-column">
              <AnAgent agent={agent} />
            </div>
          ))}
          {line.workersUnderNoSupervisor.length === 0 ? null : (
            <div className="pb-lane-column" data-people-under-no-supervisor="">
              <h3 className="pb-part-title">{t('board.people.underNoSupervisor')}</h3>
              {line.workersUnderNoSupervisor.map((agent) => (
                <AnAgent key={agent.runs[0]!.id} agent={agent} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/** One agent, with one run in the original presentation or several distinct run parts. */
function AnAgent({ agent }: { agent: PeopleAgent }) {
  const single = agent.runs.length === 1
  const supervisor = agent.post === 'supervisor'
  const first = agent.runs[0]!
  return (
    <div className="pb-part" data-people-agent={agent.id} data-post={agent.post ?? ''}>
      <h3 className="pb-part-title">
        <RouteLink to={single ? sessionPath(first.id) : whoPath('agent', agent.id)}>
          {single && agent.handle === '' ? first.title : agent.handle}
        </RouteLink>
      </h3>
      {single ? (
        <RunContents agent={agent} run={first} showPackages />
      ) : (
        <>
          {supervisor ? (
            <div className="pb-part" data-people-packages="">
              <h3 className="pb-part-title">{t('board.people.packagesHeading')}</h3>
              <ul className="pb-list"><PackageList packages={agent.packages} supervisor /></ul>
            </div>
          ) : null}
          {agent.runs.map((run) => (
            <div className="pb-people-run" data-people-run={run.id} key={run.id}>
              <h3 className="pb-part-title">
                <RouteLink to={sessionPath(run.id)}>
                  {run.startedAt === null ? t('board.people.run.startNotRecorded') : t('board.people.run.since', { time: stampToTheMinute(run.startedAt) })}
                </RouteLink>
              </h3>
              <RunContents agent={agent} run={run} showPackages={!supervisor} />
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function PackageList({ packages, supervisor }: { packages: PeoplePackage[]; supervisor: boolean }) {
  return packages.length === 0 ? (
    <li className="pb-quiet">{t(supervisor ? 'board.people.package.none' : 'board.people.package.notNamed')}</li>
  ) : packages.map((one) => <APackage key={one.id} one={one} />)
}

function RunContents({ agent, run, showPackages }: { agent: PeopleAgent; run: PeopleRun; showPackages: boolean }) {
  const supervisor = agent.post === 'supervisor'
  return (
    <>
      <ul className="pb-list">
        <li>{t('board.people.facts', { post: aPostWord(agent.post), model: run.model ?? t('board.people.model.none') })}</li>
        {showPackages ? <PackageList packages={supervisor ? agent.packages : run.packages} supervisor={supervisor} /> : null}
      </ul>
      {run.workers.length === 0 ? null : (
        <div className="pb-under">
          {run.workers.map((worker) => <AnAgent key={worker.runs[0]!.id} agent={worker} />)}
        </div>
      )}
    </>
  )
}

function APackage({ one }: { one: PeoplePackage }) {
  const points = aCount(one.points.length, 'board.people.points.one', 'board.people.points.many')
  return (
    <li data-people-package={one.id} data-state={one.state}>
      <RouteLink to={recordPath(one.id)}>{one.title === '' ? one.id : one.title}</RouteLink>{' '}
      <span className="pb-quiet">{t('board.people.package.facts', { state: aPackageStateWord(one.state), points })}</span>
    </li>
  )
}

/** One bar of the quick view: a label, a bar as long as its share of the largest, and the number in words. */
interface ABar {
  key: string
  label: string
  value: number
  words: string
  /** A day whose figure nobody knows: it is drawn blank, with no length and no words. */
  notKnown?: boolean
}

function Bars({ bars, view }: { bars: readonly ABar[]; view: string }) {
  const most = Math.max(0, ...bars.map((bar) => bar.value))
  return (
    <ul className="pb-bars" data-board-chart={view}>
      {bars.map((bar) => (
        <li key={bar.key} className="pb-bar-row" data-not-known={bar.notKnown === true ? '' : undefined}>
          <span className="pb-bar-label">{bar.label}</span>
          <span className="pb-bar-track" aria-hidden="true">
            <span className="pb-bar" style={{ width: most === 0 ? '0%' : `${String((bar.value / most) * 100)}%` }} />
          </span>
          <span className="pb-bar-words">{bar.words}</span>
        </li>
      ))}
    </ul>
  )
}

/** VIEW C: four small charts from the same answer, and the red hours from the merge queue's measure. */
function QuickView({ board }: { board: ProjectBoard }) {
  const [measures, reloadMeasures] = useProjectAsync(() => api.mergeQueueMeasures(7), [])
  const blocks = useMemo(() => [...board.rows], [board])
  const most = Math.max(0, ...blocks.flatMap((row) => row.unfinished.map((step) => step.days)))
  return (
    <div className="pb-quick" data-board-view="quick">
      {/* Landings that could not be read get no chart: the door's answer says why, and an empty chart would say nothing. */}
      {board.landings.state === 'read' ? (
        <section className="pb-chart">
          <h2 className="pb-chart-title">{t('board.quick.landings')}</h2>
          <Bars
            view="landings"
            bars={board.landings.perDay.map((day) => ({ key: day.day, label: aDay(day.day), value: day.landings, words: String(day.landings) }))}
          />
        </section>
      ) : null}
      <section className="pb-chart">
        <h2 className="pb-chart-title">{t('board.quick.red')}</h2>
        {measures.status === 'loading' ? <Loading what={t('board.quick.red')} rows={1} /> : null}
        {measures.status === 'error' ? <ErrorNote message={measures.message} fault={measures.fault} retry={reloadMeasures} /> : null}
        {measures.status === 'ready' ? <RedHours measures={measures.value} /> : null}
      </section>
      <section className="pb-chart">
        <h2 className="pb-chart-title">{t('board.quick.acting')}</h2>
        <Bars view="acting" bars={blocks.map((row) => ({ key: row.id, label: row.title, value: row.acting.length, words: String(row.acting.length) }))} />
      </section>
      <section className="pb-chart">
        <h2 className="pb-chart-title">{t('board.quick.ages')}</h2>
        <ul className="pb-bars" data-board-chart="ages">
          {blocks.map((row) => {
            const oldest = theOldestAge(row)
            return (
              <li key={row.id} className="pb-bar-row">
                <span className="pb-bar-label">{row.title}</span>
                <span className="pb-ages" aria-hidden="true">
                  {row.unfinished.map((step) => (
                    <span key={step.id} className="pb-age" style={{ left: most === 0 ? '0%' : `${String((step.days / most) * 100)}%` }} />
                  ))}
                </span>
                <span className="pb-bar-words">
                  {oldest === null
                    ? ''
                    : t('board.quick.agesWords', {
                        steps: aCount(row.unfinished.length, 'board.quick.steps.one', 'board.quick.steps.many'),
                        age: anAge(oldest),
                      })}
                </span>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

/**
 * The hours main was red each day, as the merge queue's measure gives them. The board door's note says where they come
 * from. A day with no known hour is left blank: "0 h red" would claim a green day nobody measured.
 */
function RedHours({ measures }: { measures: QueueMeasures }) {
  return (
    <Bars
      view="red"
      bars={measures.measures.map((day) =>
        day.mainRed.unknown >= day.hours
          ? { key: day.day, label: aDay(day.day), value: 0, words: '', notKnown: true }
          : {
              key: day.day,
              label: aDay(day.day),
              value: day.mainRed.red,
              words:
                t('mergeQueueMeasures.mainRed', { red: String(day.mainRed.red), hours: String(day.hours) }) +
                (day.mainRed.unknown > 0 ? `, ${t('mergeQueueMeasures.mainUnknown', { unknown: String(day.mainRed.unknown) })}` : ''),
            },
      )}
    />
  )
}

export const PROJECT_BOARD_CSS = `
.pb { display: grid; gap: var(--gut); min-width: 0; }
.pb-title { margin: 0; color: var(--text); font: 600 var(--fs-4)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.pb-body { display: grid; gap: 6px; margin: 0; max-width: 80ch; color: var(--text-2); font: var(--fs-2)/var(--lh-read) var(--font-ui); }
.pb-tabs { display: flex; flex-wrap: wrap; gap: 6px; border-bottom: var(--border-w) solid var(--border); }
.pb-tab { padding: 6px 12px; border: var(--border-w) solid var(--border); border-bottom: none; border-radius: var(--radius-sm) var(--radius-sm) 0 0; background: none; color: var(--text-2); font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui); cursor: pointer; }
.pb-tab[aria-selected='true'] { color: var(--text); background: var(--surface-2, transparent); }
.pb-under-tabs { min-width: 0; }
.pb-grid { display: grid; grid-template-columns: minmax(12rem, 2.2fr) repeat(10, minmax(0, 1fr)); gap: 4px 10px; align-items: baseline; }
.pb-head { padding: 6px 12px; color: var(--text-3); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.pb-head span:not(:first-child) { text-align: right; }
.pb-group { display: grid; gap: 0; min-width: 0; margin-top: var(--pad); }
.pb-group-title { margin: 0; padding: 6px 12px; border-bottom: var(--border-w) solid var(--border); color: var(--text); font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui); }
.pb-count { margin-left: 6px; color: var(--text-3); font-weight: 400; }
.pb-row { border-bottom: var(--border-w) solid var(--border); min-width: 0; }
.pb-summary { padding: 8px 12px; cursor: pointer; list-style: none; color: var(--text); font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.pb-summary::-webkit-details-marker { display: none; }
.pb-block-head { display: grid; gap: 2px; min-width: 0; }
.pb-block-name { font-weight: 600; overflow-wrap: anywhere; }
.pb-reason { color: var(--text-2); font: var(--fs-1)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.pb-cell { text-align: right; min-width: 0; overflow-wrap: anywhere; }
.pb-cell-label { display: none; }
.pb-under { display: grid; gap: var(--pad); padding: 4px 12px 12px; min-width: 0; }
.pb-step-link { margin: 0; font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.pb-part { display: grid; gap: 4px; min-width: 0; }
.pb-people-run { display: grid; gap: 4px; min-width: 0; }
.pb-people-run + .pb-people-run { border-top: var(--border-w) solid var(--border); padding-top: 4px; }
.pb-part-title { margin: 0; color: var(--text-3); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.pb-list { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; color: var(--text); font: var(--fs-1)/var(--lh-read) var(--font-ui); min-width: 0; overflow-wrap: anywhere; }
.pb-quiet { color: var(--text-3); }
.pb-lanes { display: grid; gap: var(--gut); min-width: 0; }
.pb-lane { display: grid; gap: 6px; min-width: 0; padding-bottom: var(--pad); border-bottom: var(--border-w) solid var(--border); }
.pb-lane-title { margin: 0; color: var(--text); font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui); }
.pb-lane-columns { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--gut); min-width: 0; }
.pb-lane-column { display: grid; gap: 4px; align-content: start; min-width: 0; }
.pb-later summary { cursor: pointer; color: var(--text); font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.pb-quick { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gut); min-width: 0; }
.pb-chart { display: grid; gap: 6px; align-content: start; min-width: 0; }
.pb-chart-title { margin: 0; color: var(--text); font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui); }
.pb-bars { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; min-width: 0; }
.pb-bar-row { display: grid; grid-template-columns: minmax(6rem, 1.2fr) minmax(0, 2fr) minmax(4rem, 1fr); gap: 8px; align-items: center; color: var(--text); font: var(--fs-1)/var(--lh-read) var(--font-ui); min-width: 0; }
.pb-bar-label { overflow-wrap: anywhere; }
.pb-bar-track { position: relative; height: 10px; min-width: 0; }
.pb-bar { position: absolute; inset: 0 auto 0 0; background: var(--text-3); border-radius: 2px; }
.pb-bar-words { color: var(--text-2); overflow-wrap: anywhere; }
.pb-ages { position: relative; height: 12px; min-width: 0; border-bottom: var(--border-w) solid var(--border); }
.pb-age { position: absolute; top: 1px; width: 2px; height: 10px; background: var(--text-2); }
@media (max-width: 900px) {
  .pb-head { display: none; }
  .pb-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .pb-block-head { grid-column: 1 / -1; }
  .pb-cell { display: flex; justify-content: space-between; gap: 8px; text-align: left; }
  .pb-cell-label { display: inline; color: var(--text-3); }
  .pb-lane-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pb-quick { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 480px) {
  .pb-grid { grid-template-columns: minmax(0, 1fr); }
  .pb-lane-columns { grid-template-columns: minmax(0, 1fr); }
  .pb-bar-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .pb-bar-label { grid-column: 1 / -1; }
}
`
