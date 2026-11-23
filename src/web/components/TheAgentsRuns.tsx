// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { content, sentencesJoined, t } from '@shared/i18n.ts'
import { useState } from 'react'
import { useLanguage } from '../lib/language.ts'
/**
 * THE CITIZEN'S PAGE RECORDS ITS RUNS. Criterion P91, amended 12 September 2026.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS DRAWS
 * ---------------------------------------------------------------------------------------
 *
 * The newest 10 runs, one row each: the run's title, its state and its time, and a press on a row opens the run's own
 * page, which holds its model, effort, receipt and compactions. Under them one line, "All N runs", opens every run in
 * pages of 50 with the pager. The list is cut here; the server sends every run.
 *
 * The totals over the runs are drawn by `ReceiptTotals`, the one summation `GET /api/usage/agents` already draws, so
 * this page never works the tokens out a second time. Under the totals, the compactions summed on the agent are a
 * short state of the server's counts, with which runs the count can see, and the models and efforts its runs declared
 * are counted (wave 13k round 52).
 *
 * THE SERVER DECIDES EVERYTHING AND THIS DRAWS IT. The runs, the totals and the binding are worked
 * out in `theAgentsRuns`; this file has no arithmetic and no second reading of `ranAs`.
 */

import { stateWord } from '@shared/words.ts'
import { waitingOnALimitUntil } from '../lib/a-long-wait.ts'
import { type OneOfItsRuns, type TheAgentsCompactions, type TheAgentsDeclarations, type TheAgentsRuns as Reading } from '@shared/profile.ts'
import { Pager } from './Pager.tsx'
import { recordPath, RouteLink } from './router.tsx'
import { Btn, Hint, Panel } from './ui.tsx'
import { ReceiptTotals } from './UsageReceipt.tsx'

/** How many of the newest runs are drawn before the line that opens them all. */
const NEWEST = 10
/** How many rows one page holds once every run is open. */
const PAGE_SIZE = 50

/**
 * THE RUN'S STATE, as a person reads it. `run.state` holds the word the database keeps — `running`, `finished` — and
 * `stateWord` gives the reading, and for a state no table names it says so rather than passing the raw word through.
 * Criterion P91. A running run waiting more than an hour on a usage limit is drawn as waiting until its next try.
 */
function stateOf(run: OneOfItsRuns): string {
  return run.waitsLongUntil === undefined ? stateWord(run.state, 'normal', 'session').text : waitingOnALimitUntil(run.waitsLongUntil)
}

/** One run as one row: its title, state and time. A press opens the run's own page. */
function OneRow({ run }: { run: OneOfItsRuns }) {
  return (
    <li data-testid="profile-run" data-run={run.id}>
      <RouteLink to={recordPath(run.id, 'session')} className="prof-row">
        <span className="prof-row-title">{run.title}</span>
        <span className="prof-row-state">{stateOf(run)}</span>
        <span className="prof-row-when">{run.when}</span>
      </RouteLink>
    </li>
  )
}

/** Every run as rows, in pages of 50, with the pager above the rows and its presses again below them. */
function EveryRun({ runs }: { runs: readonly OneOfItsRuns[] }) {
  const [offset, setOffset] = useState(0)
  return (
    <>
      <Pager offset={offset} pageSize={PAGE_SIZE} total={runs.length} onGo={setOffset} />
      <ul className="prof-rows">
        {runs.slice(offset, offset + PAGE_SIZE).map((run) => <OneRow key={run.id} run={run} />)}
      </ul>
      <Pager offset={offset} pageSize={PAGE_SIZE} total={runs.length} onGo={setOffset} line={false} />
    </>
  )
}

/** The newest 10 runs as rows, and under them one line that opens every run. */
function TheNewestRuns({ runs }: { runs: readonly OneOfItsRuns[] }) {
  const [all, setAll] = useState(false)
  if (all) return <EveryRun runs={runs} />
  return (
    <>
      <ul className="prof-rows">
        {runs.slice(0, NEWEST).map((run) => <OneRow key={run.id} run={run} />)}
      </ul>
      {runs.length <= NEWEST ? null : (
        <div className="prof-runs-all">
          <Btn variant="ghost" size="sm" onClick={() => setAll(true)}>
            {t('agentRuns.all', { n: runs.length })}
          </Btn>
        </div>
      )}
    </>
  )
}

/**
 * THE COMPACTIONS SUMMED ON THE AGENT, as a short state of the server's counts: how many are recorded and on how many
 * Claude Code runs, and how many runs the count cannot see. With no Claude Code run there is no number, never a zero.
 */
function compactionsState(counted: TheAgentsCompactions): string {
  const parts = [
    counted.recorded === null
      ? t('agentRuns.compactions.noClaudeCodeRun')
      : t('agentRuns.compactions.counted', { n: counted.recorded, runs: counted.claudeCodeRuns }),
  ]
  if (counted.otherRuntimeRuns > 0) parts.push(t('agentRuns.compactions.otherRuntime', { n: counted.otherRuntimeRuns }))
  if (counted.noRuntimeRuns > 0) parts.push(t('agentRuns.compactions.noRuntime', { n: counted.noRuntimeRuns }))
  return sentencesJoined(parts)
}

/** A value the runs declared, or the word for one they did not. Never a default. */
function declaredOrNot(value: string | null): string {
  return value === null ? t('g6b.runs.notSaid') : content(value)
}

/** THE MODELS AND EFFORTS THE RUNS DECLARED, each with how many runs declared it, as the server counted them. */
function TheDeclared({ declared }: { declared: TheAgentsDeclarations }) {
  return (
    <div className="prof-summed" data-testid="agent-declared">
      <p className="prof-label">{t('g6b.runs.declaredTitle')}</p>
      {declared.pairs.length === 0 ? null : (
        <ul className="prof-declared">
          {declared.pairs.map((pair) => (
            <li key={JSON.stringify([pair.model, pair.effort])}>
              {t('g6b.runs.declaredRow', { model: declaredOrNot(pair.model), effort: declaredOrNot(pair.effort), n: pair.runs })}
            </li>
          ))}
        </ul>
      )}
      {declared.neither === 0 ? null : <p className="prof-runs-count">{t('g6b.runs.declaredNeither', { n: declared.neither })}</p>}
    </div>
  )
}

export function TheAgentsRuns({ reading }: { reading: Reading }) {
  useLanguage()
  return (
    <Panel titleIs="label" declares={{ surface: 'profile.runs' }} title={t('g6b.runs.title')}>
      <style href="mole-office-the-agents-runs" precedence="default">
        {THE_AGENTS_RUNS_CSS}
      </style>
      {reading.runs.length === 0 ? null : <TheNewestRuns runs={reading.runs} />}
      <div data-testid="agent-receipt-totals">
        <ReceiptTotals reading={reading.totals} />
      </div>
      {reading.runs.length === 0 ? null : (
        <>
          <div className="prof-summed" data-testid="agent-compactions-counted">
            <div className="prof-label prof-summed-head">
              {t('g6b.runs.compactionsSummed')}
              <Hint>{t('devWords.said.agentCompactionsOnlyClaudeCode')}</Hint>
            </div>
            <p className="prof-runs-count">{compactionsState(reading.compactionsCounted)}</p>
          </div>
          <TheDeclared declared={reading.declared} />
        </>
      )}
    </Panel>
  )
}

/**
 * A row is the title, then the state and the time at its right; the line under the rows opens them all.
 *
 * NO BACKTICK ANYWHERE IN HERE, comments included: this is a template literal inside a .tsx file.
 */
const THE_AGENTS_RUNS_CSS = `
.prof-rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; min-width: 0; border-top: 1px solid var(--border); }
.prof-rows > li { min-width: 0; border-bottom: 1px solid var(--border); }
.prof-row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: baseline; gap: 1rem;
  padding: 6px var(--pad); min-width: 0;
  color: var(--text); text-decoration: none; font-size: var(--fs-1); line-height: var(--lh-body);
}
a.prof-row:hover { background: var(--hover); }
a.prof-row:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.prof-row-title { min-width: 0; font-weight: 600; overflow-wrap: anywhere; }
.prof-row-state { color: var(--text-2); white-space: nowrap; }
.prof-row-when { color: var(--text-2); white-space: nowrap; font-variant-numeric: tabular-nums; }
.prof-runs-all { margin-top: 4px; }
.prof-summed-head { display: flex; align-items: center; gap: 6px; margin: 0; }
.prof-runs-count { margin: 0; max-width: var(--measure-in-box); font-size: var(--fs-1); color: var(--text-2); overflow-wrap: anywhere; }
`
