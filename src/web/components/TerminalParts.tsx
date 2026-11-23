// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE TERMINAL PAGES SHARE: where the holder stands, and a terminal's state in words. Wave 13u.
 *
 * Terminal management (src/web/pages/TerminalsPage.tsx) and an agent's terminals on its profile page
 * (src/web/components/AgentTerminals.tsx) both draw these, so the two say the same thing the same way.
 *
 * A HOLDER THAT IS NOT RUNNING IS SAID WHERE THE PERSON SEES IT (the decision for round 2): the
 * office's own words for the state, then the office's sentence about why, then the holder's own last line
 * from its log, as it wrote it. Nothing is drawn as an empty list when there is no holder to ask.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'
import { t } from '@shared/i18n.ts'
import type { HolderState, ListedTerminal, TerminalReading } from '@shared/terminals.ts'
import { Btn, ServerNote } from './ui.tsx'
import { startTheHolder, whatARefusalSays } from '../lib/terminals.ts'
import { useInspect } from '../lib/mode.ts'

/**
 * The holder's state: one plain line when it runs, and when it does not, a notice that says what is wrong and what to do,
 * with a press that starts it again (the review of round 2's pictures, point 1). The office's raw sentence, the
 * holder's last log line and its process number are for developers, behind a fold, because they are in English and
 * name paths (point 7).
 *
 * A HOLDER THAT RUNS IS NEVER OFFERED A START (round 109). Only a holder that is not running gets the start press. One
 * that runs but answered too late gets Look again, and its words say that nothing has ended. A program that answers
 * where the holder should be gets no press, because a start would find it there and do nothing.
 */
export function HolderSays({ holder, onChanged }: { holder: HolderState; onChanged?: () => void }): React.ReactElement {
  const inspect = useInspect()
  if (holder.state === 'running') {
    return (
      <div className="tm-holder tm-holder-running">
        <p className="tm-holder-line">{t('terminals.holder.running')}</p>
        <details className="tm-dev">
          <summary>{t('terminals.developers')}</summary>
          <dl className="tm-holder-why">
            <div>
              <dt>{t('terminals.dev.process')}</dt>
              <dd className="tm-mono num">{holder.pid}</dd>
            </div>
          </dl>
        </details>
      </div>
    )
  }
  const headline =
    holder.state === 'off'
      ? t('terminals.holder.off')
      : holder.state === 'unusable'
        ? holder.noAnswerWithinMs === null
          ? t('terminals.holder.unusable')
          : t('terminals.holder.noAnswer', { n: holder.noAnswerWithinMs / 1000 })
        : t('terminals.holder.notRunning')
  return (
    <div className="tm-holder tm-holder-down" role="status">
      <p className="tm-holder-headline">{headline}</p>
      {holder.state === 'not running' ? (
        <StartTheHolder onChanged={onChanged} />
      ) : holder.state === 'unusable' && holder.noAnswerWithinMs !== null && onChanged !== undefined ? (
        <div className="tm-holder-todo">
          <Btn size="sm" onClick={onChanged}>
            {t('agentLive.terminal.lookAgain')}
          </Btn>
        </div>
      ) : null}
      {holder.state !== 'not running' && !inspect ? null : (
        <details className="tm-dev">
          <summary>{t('terminals.developers')}</summary>
          {holder.state === 'not running' ? (
            <dl className="tm-holder-why">
              <div>
                <dt>{t('terminals.holder.lastWord')}</dt>
                <dd className="tm-mono">
                  {holder.lastWord ?? (holder.logUnread === null ? t('terminals.holder.noLastWord') : t('terminals.holder.logUnread', { reason: holder.logUnread }))}
                </dd>
              </div>
            </dl>
          ) : null}
          <ServerNote text={holder.says} />
        </details>
      )}
    </div>
  )
}

/** The press that starts a holder that does not run. */
function StartTheHolder({ onChanged }: { onChanged?: () => void }): React.ReactElement {
  const [step, setStep] = useState<{ kind: 'idle' } | { kind: 'starting' } | { kind: 'refused'; sentence: string }>({ kind: 'idle' })
  const start = (): void => {
    setStep({ kind: 'starting' })
    startTheHolder().then(
      () => {
        setStep({ kind: 'idle' })
        onChanged?.()
      },
      (err: unknown) => setStep({ kind: 'refused', sentence: whatARefusalSays(err) }),
    )
  }
  return (
    <div className="tm-holder-todo">
      <Btn size="sm" variant="primary" onClick={start} pending={step.kind === 'starting'}>
        {step.kind === 'starting' ? t('terminals.holder.starting') : t(settingsControlWord('settings.terminalholder', 'terminals.holder.start'))}
      </Btn>
      {step.kind === 'refused' ? <p className="tm-holder-line" role="status">{step.sentence}</p> : null}
    </div>
  )
}

/**
 * A TERMINAL'S PLAIN TITLE: whose it is, not its command line. Terminal management
 * and the terminal holder's restart in Settings both name a terminal by it. `agentLabel` names an agent by its id.
 */
export function terminalTitle(one: ListedTerminal, agentLabel: (id: string) => string): string {
  const agent = one.agent ?? (one.who?.kind === 'agent' ? one.who : null)
  // A VIEW OF AN AGENT'S TMUX PANE (round 11) is said as one, not as the agent's own terminal.
  if (one.paneView !== null && one.agent !== null) return t('terminals.title.paneView', { name: agentLabel(one.agent.id) })
  return agent === null ? t('terminals.title.yours') : t('terminals.title.agents', { name: agentLabel(agent.id) })
}

/** Whether a terminal runs, or how it ended. */
export function terminalStateWord(terminal: TerminalReading): string {
  if (terminal.state === 'running') return t('terminals.state.running')
  // SAID AS A PERSON WOULD (the review, point 7): the exit code is for developers, behind their fold.
  if (terminal.exit === null || terminal.exit.signal) return t('terminals.state.stopped')
  return terminal.exit.code === 0 ? t('terminals.state.finished') : t('terminals.state.failed')
}

/** The command line, worked out in src/shared/terminals.ts and drawn by every terminal page. */
export { theCommandLine } from '@shared/terminals.ts'

/** The styles the terminal pieces share; drawn once by whichever page shows them. */
export const TERMINAL_PARTS_CSS = `
.tm-holder-line { margin: 0 0 0.5em 0; }
.tm-holder-todo { display: grid; gap: 0.4rem; justify-items: start; margin: 0 0 0.5em 0; }
.tm-dev { margin: 0.25em 0 0 0; color: var(--text-2); }
.tm-dev > summary { cursor: pointer; font-size: 0.9em; }
.tm-dev .tm-mono { overflow-wrap: anywhere; word-break: break-all; }
.tm-mono { font-family: var(--font-mono); overflow-wrap: anywhere; }
.tm-holder { margin: 0 0 var(--pad) 0; }
.tm-holder-running { color: var(--text-2); }
.tm-holder-down {
  border: var(--border-w, 1px) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
  padding: var(--pad);
}
.tm-holder-headline { margin: 0 0 0.5em 0; font-weight: 600; color: var(--text); }
.tm-holder-why { margin: 0; display: grid; gap: 0.5em; }
.tm-holder-why dt { color: var(--text-2); font-size: 0.9em; }
.tm-holder-why dd { margin: 0; color: var(--text); }
`
