// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE QUICK INPUTS AN AGENT ASKED FOR, ON ITS PAGE. Wave 13u, round 21 (src/shared/quick-inputs.ts is
 * the contract).
 *
 * GET /api/office/quick-inputs/asks?agent=… answers the newest asks for one agent: each with its time, the input, what
 * became of it (QUICK_INPUT_OUTCOMES) and the sentence the asker was answered with, and when the next input may be typed
 * for this agent. An ask that was refused is kept and shown, because the person needs to see why nothing was typed.
 *
 * An agent that has asked for nothing says so in one sentence. An empty list is never drawn as if nothing had happened.
 * The outcome's colour, where it has one, is a state colour (`--st-*`) and never the only way the outcome is told: its
 * words are drawn in every row.
 *
 * Its one prop is the agent, by its registry id. It reads what it shows itself, once, and asks again on a press: the
 * time the next input may be typed is a moment, and the part does not keep a clock running to move it.
 */

import { content, t, type WordKey } from '@shared/i18n.ts'
import type { QuickInputOutcome } from '@shared/quick-inputs.ts'
import { Btn, ErrorNote, Loading, Panel } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { AGENT_LIVE_CSS } from './AgentLiveParts.tsx'
import { useLanguage } from '../lib/language.ts'
import { stampToTheMinute } from '../lib/minute.ts'
import { theQuickInputAsksOf } from '../lib/terminals.ts'

/** The most asks the part asks for, and so the most rows it draws. */
export const THE_MOST_ASKS_SHOWN = 25

const OUTCOME_WORD: Record<QuickInputOutcome, WordKey> = {
  typed: 'agentLive.quickInputs.outcome.typed',
  'not-the-agent': 'agentLive.quickInputs.outcome.not-the-agent',
  'no-list': 'agentLive.quickInputs.outcome.no-list',
  'not-on-the-list': 'agentLive.quickInputs.outcome.not-on-the-list',
  'too-soon': 'agentLive.quickInputs.outcome.too-soon',
  'not-typed': 'agentLive.quickInputs.outcome.not-typed',
  'typed-without-enter': 'agentLive.quickInputs.outcome.typed-without-enter',
  unknown: 'agentLive.quickInputs.outcome.unknown',
}

export function AgentQuickInputs({ agentId }: { agentId: string }): React.ReactElement {
  useLanguage()
  const [reply, readAgain] = useProjectAsync(() => theQuickInputAsksOf(agentId, THE_MOST_ASKS_SHOWN), [agentId])
  return (
    <Panel declares={{ surface: 'profile.quickinputs' }} titleIs="label" title={t('agentLive.quickInputs.title')}>
      <style href="mole-office-agent-live" precedence="default">
        {AGENT_LIVE_CSS}
      </style>
      <style href="mole-office-agent-quick-inputs" precedence="default">
        {AGENT_QUICK_INPUTS_CSS}
      </style>
      {reply.status === 'loading' ? <Loading what={t('agentLive.quickInputs.loading')} /> : null}
      {reply.status === 'error' ? (
        <ErrorNote message={reply.message} fault={reply.fault} label={t('agentLive.quickInputs.refused')} retry={readAgain} />
      ) : null}
      {reply.status === 'ready' ? (
        <div className="aqi">
          <div className="al-row">
            <p className="al-line" data-testid="agent-quick-inputs-next">
              {reply.value.nextAllowedAt === null
                ? t('agentLive.quickInputs.nextNow')
                : t('agentLive.quickInputs.nextFrom', { at: stampToTheMinute(reply.value.nextAllowedAt) })}
            </p>
            <Btn size="sm" onClick={readAgain}>
              {t('agentLive.quickInputs.readAgain')}
            </Btn>
          </div>
          {reply.value.asks.length === 0 ? (
            <p className="al-line al-none">{t('agentLive.quickInputs.none')}</p>
          ) : (
            <ol className="aqi-asks" aria-label={t('agentLive.quickInputs.listLabel')}>
              {reply.value.asks.map((ask) => (
                <li key={ask.id} className="aqi-row" data-outcome={ask.outcome}>
                  <span className="aqi-at num" title={ask.at}>
                    {stampToTheMinute(ask.at)}
                  </span>
                  <span className="aqi-input">{content(ask.input)}</span>
                  <span className="aqi-outcome">{t(OUTCOME_WORD[ask.outcome])}</span>
                  <span className="aqi-says">
                    <span className="aqi-says-key">{t('agentLive.quickInputs.answered')}</span> {content(ask.says)}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {reply.value.left > 0 ? <p className="al-line">{t('agentLive.quickInputs.older', { count: String(reply.value.left) })}</p> : null}
        </div>
      ) : null}
    </Panel>
  )
}

const AGENT_QUICK_INPUTS_CSS = `
.aqi { display: grid; gap: 0.5rem; min-width: 0; }
.aqi .al-line { overflow-wrap: anywhere; }
.aqi-asks { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.35rem; min-width: 0; }
.aqi-row {
  display: grid;
  grid-template-columns: 6em minmax(0, 1fr) minmax(9em, 14em);
  gap: 0.15rem 0.75rem;
  min-width: 0;
  padding: 0.4rem 0.6rem;
  border-inline-start: 0.25rem solid var(--border-strong);
  background: var(--panel-2);
  border-radius: var(--radius-sm);
  overflow-wrap: anywhere;
}
.aqi-row[data-outcome='typed'] { border-inline-start-color: var(--st-done); }
.aqi-row[data-outcome='typed-without-enter'], .aqi-row[data-outcome='unknown'] { border-inline-start-color: var(--st-overdue); }
.aqi-row[data-outcome='not-typed'] { border-inline-start-color: var(--st-failed); }
.aqi-at { grid-column: 1; color: var(--text-3); }
.aqi-input { grid-column: 2; min-width: 0; color: var(--text); font-family: var(--font-mono, monospace); white-space: pre-wrap; }
.aqi-outcome { grid-column: 3; min-width: 0; font-weight: 600; color: var(--text); }
.aqi-row[data-outcome='typed'] .aqi-outcome { color: var(--st-done); }
.aqi-row[data-outcome='typed-without-enter'] .aqi-outcome, .aqi-row[data-outcome='unknown'] .aqi-outcome { color: var(--st-overdue); }
.aqi-row[data-outcome='not-typed'] .aqi-outcome { color: var(--st-failed); }
.aqi-says { grid-column: 2 / -1; min-width: 0; color: var(--text-2); }
.aqi-says-key { color: var(--text-3); }
@media (max-width: 40rem) {
  .aqi-row { grid-template-columns: minmax(0, 1fr); }
  .aqi-at, .aqi-input, .aqi-outcome, .aqi-says { grid-column: 1; }
}
`
