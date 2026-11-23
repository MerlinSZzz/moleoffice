// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13y. The table of the project's lines in Home's progress card, read from the people and packages door.
import { t, type WordKey } from '@shared/i18n.ts'
import { theLineIsAtRest, type PeopleAndPackages, type PeopleLine, type RunningCounts } from '@shared/project-people.ts'
import { InReach } from '../InReach.tsx'
import { ErrorNote, type AsyncState } from '../ui.tsx'
import { theNameShown } from '../../lib/department-words.ts'

/**
 * THE PROJECT'S LINES, ON HOME. Wave 13y round 175.
 *
 * One row for each line, in the order the door answers them, then a total row. Each row says the line, its department
 * and secretary, how many agents run on it now, and its packages by state.
 *
 * READ, NEVER COUNTED. Every number is the door's own: `GET /api/projects/<project>/people-and-packages`, the answer
 * the board's people and packages tab draws. The total row is the answer's `total` and its `running.all`, never a sum
 * worked out here.
 *
 * A READ THAT DID NOT ANSWER IS SAID. While it is read, the group says so, and when it failed, the group says that,
 * with a press to read again. A project with no line draws no group.
 */
export function HomeLines({ people, retry }: { people: AsyncState<PeopleAndPackages>; retry: () => void }) {
  if (people.status === 'ready' && people.value.lines.length === 0) return null
  return (
    <div className="pg-group" data-progress-group="lines">
      <style href="mole-office-home-lines" precedence="default">{HL_CSS}</style>
      <h3 className="pg-group-title">{t('progressCard.lines.title')}</h3>
      {people.status === 'loading' ? <p className="pg-reading">{t('progressCard.lines.reading')}</p> : null}
      {people.status === 'error' ? (
        <ErrorNote label={t('progressCard.lines.failed')} message={people.message} fault={people.fault ?? null} retry={retry} />
      ) : null}
      {people.status === 'ready' ? <TheLines people={people.value} /> : null}
    </div>
  )
}

/** The nine columns, in the order they are drawn. A number column holds one count of the line's packages. */
const COLUMNS = ['line', 'department', 'running', 'packages', 'notTaken', 'inProgress', 'handedBack', 'accepted', 'blocked'] as const
type Column = (typeof COLUMNS)[number]
const COUNTS = ['packages', 'notTaken', 'inProgress', 'handedBack', 'accepted', 'blocked'] as const

/** The heading of each column. */
const HEADINGS: Readonly<Record<Column, WordKey>> = {
  line: 'progressCard.lines.column.line',
  department: 'progressCard.lines.column.department',
  running: 'progressCard.lines.column.running',
  packages: 'progressCard.lines.column.packages',
  notTaken: 'progressCard.lines.column.notTaken',
  inProgress: 'progressCard.lines.column.inProgress',
  handedBack: 'progressCard.lines.column.handedBack',
  accepted: 'progressCard.lines.column.accepted',
  blocked: 'progressCard.lines.column.blocked',
}

/** What joins the parts of a running cell, and the department to its secretary. The same in both languages. */
const PART_JOIN = ' + '
const NAME_JOIN = ' · '

/** What a cell holds when the line or its department is not recorded. */
const NOTHING_RECORDED = '—'

/** The row key of the line not recorded, and of the total row. */
const NOT_RECORDED = 'not-recorded'
const TOTAL = 'total'

function TheLines({ people }: { people: PeopleAndPackages }) {
  const shape = people.lines.map((line) => line.line ?? NOT_RECORDED).join(' ')
  return (
    <InReach box="hl-box" name={t('progressCard.lines.title')} shape={shape}>
      <table className="hl-table" data-home-lines="">
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column}
                scope="col"
                className={column === 'line' ? 'hl-line' : isCount(column) ? 'hl-count-head' : undefined}
                data-home-line-column={column}
              >
                {t(HEADINGS[column])}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.lines.map((line) => {
            const key = line.line ?? NOT_RECORDED
            return <OneLine key={key} rowKey={key} line={line} />
          })}
        </tbody>
        <tfoot>
          <tr data-home-line={TOTAL}>
            <th scope="row" className="hl-line" data-home-line-cell="line">{t('progressCard.lines.total')}</th>
            <td data-home-line-cell="department" />
            <td className="hl-running" data-home-line-cell="running">{people.running.all}</td>
            <Counts counts={people.total} />
          </tr>
        </tfoot>
      </table>
    </InReach>
  )
}

function isCount(column: Column): boolean {
  return (COUNTS as readonly string[]).includes(column)
}

/** One line's row. */
function OneLine({ rowKey, line }: { rowKey: string; line: PeopleLine }) {
  return (
    <tr data-home-line={rowKey}>
      <th scope="row" className="hl-line" data-home-line-cell="line">{line.line ?? t('progressCard.lines.notRecorded')}</th>
      <td data-home-line-cell="department">{theDepartment(line)}</td>
      <td className="hl-running" data-home-line-cell="running">
        {theLineIsAtRest(line) ? t('progressCard.lines.resting', { all: line.running.all }) : theRunning(line.running)}
      </td>
      <Counts counts={line.counts} />
    </tr>
  )
}

/** The six counts of a row's packages, in the columns' order. */
function Counts({ counts }: { counts: PeopleLine['counts'] }) {
  const of: Readonly<Record<(typeof COUNTS)[number], number>> = {
    packages: counts.all,
    notTaken: counts.notTaken,
    inProgress: counts.inProgress,
    handedBack: counts.handedBack,
    accepted: counts.accepted,
    blocked: counts.blocked,
  }
  return (
    <>
      {COUNTS.map((column) => (
        <td key={column} className="hl-count" data-home-line-cell={column}>{of[column]}</td>
      ))}
    </>
  )
}

/**
 * The department cell, in the board's words: the department's name and its secretary, or that the line is filed as no
 * department, or held by several. The line not recorded has no department to name.
 */
function theDepartment(line: PeopleLine): string {
  const department = line.department
  if (line.line === null || department === null) return NOTHING_RECORDED
  if (department.state === 'not-held') return t('board.line.notFiled')
  if (department.state === 'held-by-several') return t('board.line.heldBySeveral', { n: department.ids.length })
  const secretary =
    line.secretary === null ? t('board.people.secretary.none') : t('board.people.secretary', { name: line.secretary.name })
  return `${theNameShown(department.name)}${NAME_JOIN}${secretary}`
}

/**
 * The running cell of a line that is not at rest: all of them, then the supervisors, the workers and the others, each
 * left out at 0. A count with no part is drawn as its number alone.
 */
function theRunning(running: RunningCounts): string {
  const parts: string[] = []
  if (running.supervisors === 1) parts.push(t('progressCard.lines.oneSupervisor'))
  if (running.supervisors > 1) parts.push(t('progressCard.lines.supervisors', { n: running.supervisors }))
  if (running.workers > 0) parts.push(t('progressCard.lines.workers', { n: running.workers }))
  if (running.others > 0) parts.push(t('progressCard.lines.others', { n: running.others }))
  if (parts.length === 0) return String(running.all)
  return t('progressCard.lines.running', { all: running.all, parts: parts.join(PART_JOIN) })
}

/**
 * THE TABLE'S OWN SHEET. Every colour and size is a page token.
 *
 * A WORD IS NEVER BROKEN. A heading or a department wraps only between words, and a Chinese word is kept whole. The
 * line, the running count and the numbers do not wrap at all, so a running cell is never split inside its brackets.
 *
 * THE LINE COLUMN STAYS AT THE LEFT EDGE when the box scrolls sideways at a phone's width, by the rule the plan table's
 * pick column uses. The borders are drawn separately, because a collapsed border does not move with a cell that stays.
 */
const HL_CSS = `
/* The box scrolls sideways when the table is wider than the card. It has no border and no padding of its own. */
.hl-box { min-width: 0; overflow-x: auto; }
.hl-table { border-collapse: separate; border-spacing: 0; margin: 0; color: var(--text); font: var(--fs-2)/var(--lh-tight) var(--font-ui); }
.hl-table th, .hl-table td { padding: 4px var(--pad); border-bottom: var(--border-w) solid var(--border); text-align: left; vertical-align: top; font-weight: 400; white-space: normal; overflow-wrap: normal; word-break: keep-all; }
/* The headings: the page's quiet ink, set on their last line. */
.hl-table thead th { color: var(--text-3); font: var(--fs-1)/var(--lh-tight) var(--font-ui); vertical-align: bottom; }
.hl-table thead .hl-count-head { text-align: right; }
/* The line column stays at the box's left edge, on the page's own ground. */
.hl-table .hl-line { position: sticky; left: 0; z-index: 2; background: var(--bg); white-space: nowrap; }
.hl-table .hl-running { white-space: nowrap; }
.hl-table .hl-count { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
/* The total row: ruled off from the lines above it. */
.hl-table tfoot th, .hl-table tfoot td { border-top: var(--border-w) solid var(--border-strong); border-bottom: 0; }
`
