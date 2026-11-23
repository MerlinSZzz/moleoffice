// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HONOUR BOARD: RUNS PRAISED FOR WHAT THEY LEFT BEHIND. A decision, criteria HB3 and HB5 of
 * design/honour-board/ACCEPTANCE.md, wave 13u round 15.
 *
 *   #/honour-board   the project's exemplary runs, newest first; the noted runs folded under them; the weekly table
 *
 * Everything drawn here is one answer of GET /api/honour-board (src/server/lib/honour.ts), which reads the readings
 * stored on the runs' session records and nothing else. The line under the heading is that answer's own cost. The
 * noted runs are read only when their fold is opened, through the same door.
 */

import { content, t, type WordKey } from '@shared/i18n.ts'
import { useState } from 'react'
import type { HonourBoard, HonourBoardRow, HonourSignal, HonourTableCell } from '../../server/lib/honour.ts'
import { api } from '../api.ts'
import { declaredAttributes } from '../components/declares.ts'
import { InReach } from '../components/InReach.tsx'
import { recordPath, RouteLink } from '../components/router.tsx'
import { Absence, Btn, ErrorNote, Loading, Panel, Stamp } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { useLanguage } from '../lib/language.ts'

const SIGNAL_WORDS: Record<HonourSignal, WordKey> = {
  'corrected its brief': 'honourBoard.signal.corrected',
  'found a real defect outside its brief': 'honourBoard.signal.defect',
  'caught a blocking defect in review': 'honourBoard.signal.review',
  'needed no rework': 'honourBoard.signal.noRework',
  'proved every test by mutation': 'honourBoard.signal.mutation',
}

/** A value a runner wrote, or the words the record holds instead, in the page's language. */
function said(value: unknown): string {
  if (value === 'not reported') return t('honourBoard.notReported')
  if (value === 'not recorded') return t('honourBoard.notRecorded')
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return content(value)
  return t('honourBoard.notRecorded')
}

export function HonourBoardPage() {
  useLanguage()
  const [first] = useProjectAsync(() => api.honourBoard('exemplary'), [])
  const [notedOpen, setNotedOpen] = useState(false)
  return (
    <div className="page hb">
      <style href="mole-office-honour-board" precedence="default">
        {HONOUR_BOARD_CSS}
      </style>
      <header className="hb-head">
        {/* THE NAME, TYPED: the same words as the rail row that opens this page. */}
        <h1 className="hb-title" data-title-is="its-label">{t('nav.honourBoard')}</h1>
        {first.status === 'ready' ? (
          <p className="hb-cost" data-honour-cost={`${String(first.value.cost.records)} ${String(first.value.cost.ms)}`}>
            {t('honourBoardPage.readCost', { records: first.value.cost.records, ms: first.value.cost.ms })}
          </p>
        ) : null}
      </header>
      {first.status === 'loading' ? <Loading label={t('honourBoard.loading')} rows={2} /> : null}
      {first.status === 'error' ? <ErrorNote message={first.message} fault={first.fault ?? null} /> : null}
      {first.status === 'ready' ? (
        <>
          <Panel declares={{ surface: 'honour.exemplary' }} title={t('honourBoard.exemplaryTitle')} titleIs="label">
            <Runs standing="exemplary" first={first.value} />
          </Panel>
          <details className="hb-fold" data-honour-fold="noted" {...declaredAttributes({ surface: 'honour.noted' })} onToggle={(event) => setNotedOpen(event.currentTarget.open)}>
            <summary className="hb-fold-head">
              {t('honourBoard.notedTitle')} <span className="hb-count">{first.value.counts.noted}</span>
            </summary>
            {notedOpen ? <NotedRuns /> : null}
          </details>
          <Panel declares={{ surface: 'honour.table' }} title={t('honourBoard.tableTitle')} titleIs="label">
            <WeeklyTable board={first.value} />
          </Panel>
        </>
      ) : null}
    </div>
  )
}

/** THE NOTED RUNS, read each time the fold is opened. A closed fold holds no list and asks for nothing. */
function NotedRuns() {
  const [state, reload] = useProjectAsync(() => api.honourBoard('noted'), [])
  if (state.status === 'loading') return <Loading label={t('honourBoard.loading')} rows={1} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault ?? null} retry={reload} />
  return <Runs standing="noted" first={state.value} />
}

/** One standing's runs, the first page as it came and each next page appended on a press. */
function Runs({ standing, first }: { standing: 'exemplary' | 'noted'; first: HonourBoard }) {
  const [rows, setRows] = useState<HonourBoardRow[]>(first.rows)
  const [next, setNext] = useState<number | null>(first.next)
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<string | null>(null)
  if (rows.length === 0) {
    const word = first.counts.read === 0 ? t('honourBoard.noneRead') : standing === 'exemplary' ? t('honourBoard.noneExemplary') : t('honourBoard.noneNoted')
    return <Absence looked tier="told-apart" title={standing === 'exemplary' ? t('honourBoard.exemplaryTitle') : t('honourBoard.notedTitle')} word={word} />
  }
  const more = async (): Promise<void> => {
    if (next === null) return
    setBusy(true)
    setFault(null)
    try {
      const page = await api.honourBoard(standing, next)
      setRows((had) => [...had, ...page.rows])
      setNext(page.next)
    } catch (error) {
      setFault(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="hb-runs">
      <ul className="hb-rows">
        {rows.map((row) => (
          <RunRow key={row.run} row={row} />
        ))}
      </ul>
      {first.total > rows.length || next !== null ? (
        <div className="hb-more">
          <span className="hb-shown">{t('honourBoard.shown', { shown: rows.length, total: first.total })}</span>
          {next === null ? null : (
            <Btn onClick={() => void more()} pending={busy} disabled={busy} reason={t('sheet.button.waitsForTheLastAnswer')}>
              {t('honourBoard.more')}
            </Btn>
          )}
        </div>
      ) : null}
      {fault === null ? null : <ErrorNote message={fault} />}
    </div>
  )
}

/** One run: its title, its agent, the model it started with, its signals with their evidence, its conditions, its brief and report. */
function RunRow({ row }: { row: HonourBoardRow }) {
  const agent = row.agent.name ?? row.agent.handle ?? t('honourBoard.agentUnnamed')
  return (
    <li className="hb-row" data-honour-run={row.run} data-standing={row.standing}>
      <div className="hb-row-head">
        <RouteLink className="hb-row-title" to={recordPath(row.run, 'session')}>
          {content(row.title)}
        </RouteLink>
        <span className="hb-row-when">
          <Stamp at={row.startedAt} />
        </span>
      </div>
      <dl className="hb-facts">
        <dt>{t('honourBoard.agent')}</dt>
        <dd>{content(agent)}</dd>
        <dt>{t('honourBoard.startedWith')}</dt>
        <dd>{said(row.startedWith ?? 'not recorded')}</dd>
        <dt>{t('honourBoard.signals')}</dt>
        <dd>
          <ul className="hb-signals">
            {row.signals.map((one) => (
              <li key={one.signal} className="hb-signal" data-signal={one.signal}>
                <span className="hb-signal-name">{t(SIGNAL_WORDS[one.signal])}</span>
                <span className="hb-evidence">
                  {one.evidence.length === 0
                    ? t('honourBoard.noEvidenceShown')
                    : one.evidence.map((id) => (
                        <RouteLink key={id} className="hb-evidence-link" to={recordPath(id)}>
                          {id}
                        </RouteLink>
                      ))}
                </span>
              </li>
            ))}
          </ul>
        </dd>
        <dt>{t('honourBoard.conditions')}</dt>
        <dd>{row.served === null ? <span className="hb-absent">{t('g6a.common.notRecorded')}</span> : <Conditions served={row.served} />}</dd>
        <dt>{t('honourBoard.brief')}</dt>
        <dd>
          {row.brief === null ? (
            <span className="hb-absent">{t('honourBoard.noBrief')}</span>
          ) : (
            <RouteLink to={recordPath(row.brief.id, 'note')}>{content(row.brief.title)}</RouteLink>
          )}
        </dd>
        <dt>{t('honourBoard.report')}</dt>
        <dd>
          {row.report === null ? (
            <span className="hb-absent">{t('honourBoard.noReport')}</span>
          ) : (
            <RouteLink to={recordPath(row.report.id, 'report')}>{content(row.report.title)}</RouteLink>
          )}
        </dd>
        <dt>{t('honourBoard.readAt')}</dt>
        <dd>
          <Stamp at={row.read_at} />
        </dd>
      </dl>
    </li>
  )
}

/** The run's conditions as its runner wrote them, criterion HB1: each field, or the words the runner wrote instead. */
function Conditions({ served }: { served: Record<string, unknown> }) {
  const context = typeof served['contextTokens'] === 'object' && served['contextTokens'] !== null ? (served['contextTokens'] as Record<string, unknown>) : {}
  return (
    <span className="hb-conditions">
      <span>
        {t('honourBoard.servedModel')}: {said(served['model'])}
      </span>
      <span>
        {t('honourBoard.temperature')}: {said(served['temperature'])}
      </span>
      <span>
        {t('honourBoard.briefBytes')}: {typeof served['briefBytes'] === 'number' ? t('honourBoard.bytes', { n: served['briefBytes'] }) : said(served['briefBytes'])}
      </span>
      <span>
        {t('honourBoard.context')}: {t('honourBoard.contextValue', { largest: said(context['largestTurn']), total: said(context['total']) })}
      </span>
    </span>
  )
}

/** THE WEEKLY TABLE, criterion HB5: signals per model and temperature band, this week and in all, and what it counts by. */
function WeeklyTable({ board }: { board: HonourBoard }) {
  const { table } = board
  if (table.lines.length === 0) return <Absence looked tier="told-apart" title={t('honourBoard.tableTitle')} word={t('honourBoard.noneRead')} />
  const cells = (cell: HonourTableCell) => (
    <>
      <td>{cell.runs}</td>
      <td>{cell.signals}</td>
      <td>{cell.exemplary}</td>
      <td>{cell.noted}</td>
    </>
  )
  return (
    <div className="hb-table-wrap">
      {/* ON A PHONE THE TABLE SCROLLS SIDEWAYS IN ITS OWN BOX, and InReach marks the edge it carries on past. */}
      <InReach box="hb-scroll" name={t('honourBoard.tableTitle')} shape={table.lines.map((line) => `${line.model}:${line.temperature}`).join(',')}>
        <table className="hb-table">
          <thead>
            <tr>
              <th rowSpan={2} scope="col">{t('honourBoard.col.model')}</th>
              <th rowSpan={2} scope="col">{t('honourBoard.col.temperature')}</th>
              <th colSpan={4} scope="colgroup">{t('honourBoard.col.week')}</th>
              <th colSpan={4} scope="colgroup">{t('honourBoard.col.all')}</th>
            </tr>
            <tr>
              {[0, 1].map((half) => (
                <HalfHead key={half} />
              ))}
            </tr>
          </thead>
          <tbody>
            {table.lines.map((line) => (
              <tr key={`${line.model}\u0000${line.temperature}`} data-honour-line={`${line.model} ${line.temperature}`}>
                <th scope="row">{said(line.model)}</th>
                <td>{said(line.temperature)}</td>
                {cells(line.lastSevenDays)}
                {cells(line.allTime)}
              </tr>
            ))}
          </tbody>
        </table>
      </InReach>
    </div>
  )
}

function HalfHead() {
  return (
    <>
      <th scope="col">{t('honourBoard.col.runs')}</th>
      <th scope="col">{t('honourBoard.col.signals')}</th>
      <th scope="col">{t('honourBoard.col.exemplary')}</th>
      <th scope="col">{t('honourBoard.col.noted')}</th>
    </>
  )
}

export const HONOUR_BOARD_CSS = `
.hb { display: grid; gap: var(--gut); min-width: 0; }
.hb-head { display: grid; gap: var(--pad); min-width: 0; }
.hb-title { margin: 0; color: var(--text); font: 600 var(--fs-4)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.hb-cost { margin: 0; max-width: 70ch; color: var(--text-3); font: var(--fs-1)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.hb-runs { display: grid; gap: var(--pad); min-width: 0; }
.hb-rows { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; min-width: 0; }
.hb-row { display: grid; gap: 6px; padding: 10px 12px; border: var(--border-w) solid var(--border); border-radius: var(--radius-sm); min-width: 0; }
.hb-row-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px var(--gut); min-width: 0; }
.hb-row-title { color: var(--text); font: 600 var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.hb-row-when { color: var(--text-3); font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.hb-facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px var(--gut); margin: 0; font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.hb-facts dt { color: var(--text-3); }
.hb-facts dd { margin: 0; color: var(--text); min-width: 0; overflow-wrap: anywhere; }
.hb-signals { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.hb-signal { display: flex; flex-wrap: wrap; gap: 2px 8px; align-items: baseline; }
.hb-signal-name { color: var(--text); font-weight: 600; }
.hb-evidence { display: inline-flex; flex-wrap: wrap; gap: 2px 8px; color: var(--text-3); }
.hb-evidence-link { font-family: var(--font-mono); }
.hb-conditions { display: flex; flex-wrap: wrap; gap: 2px var(--gut); color: var(--text-2); }
.hb-absent { color: var(--text-3); font-style: italic; }
.hb-more { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); color: var(--text-3); font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.hb-fold { border: var(--border-w) solid var(--border); border-radius: var(--radius-sm); padding: 8px 12px; min-width: 0; }
.hb-fold[open] { display: grid; gap: var(--pad); }
.hb-fold-head { cursor: pointer; color: var(--text); font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui); }
.hb-count { margin-left: 6px; color: var(--text-3); font-weight: 400; }
.hb-table-wrap { display: grid; gap: var(--pad); min-width: 0; }
.hb-scroll { overflow-x: auto; min-width: 0; }
.hb-table { border-collapse: collapse; font: var(--fs-1)/var(--lh-read) var(--font-ui); color: var(--text); }
.hb-table th, .hb-table td { padding: 4px 10px; border-bottom: var(--border-w) solid var(--border); text-align: right; white-space: nowrap; }
.hb-table th[scope='row'], .hb-table thead th:first-child, .hb-table td:nth-child(2) { text-align: left; }
.hb-table thead th { color: var(--text-3); font-weight: 600; }
.hb-table th[scope='colgroup'] { text-align: center; }
@media (max-width: 480px) {
  .hb-facts { grid-template-columns: minmax(0, 1fr); }
  .hb-facts dt { margin-top: 4px; }
}
`
