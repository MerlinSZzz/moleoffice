// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S LIVE TERMINAL, ON ITS PAGE. Wave 13u, round 10, way B. Under a decision, a secretary's page shows
 * its own tmux pane, live.
 *
 * GET /api/terminals/agents/:agent/pane finds the pane from the agent's newest run. The press shows it in a terminal
 * the office holds (POST …/pane), drawn by the same TerminalView as the Terminals page, at the pane's own size: Fit is
 * not offered, because it would resize the view and never the pane. The view is opened only by the press, so a page
 * never starts reading a terminal, or moves to one, by itself.
 *
 * When the pane cannot be shown, one sentence says why, one sentence per place.
 * When the agent's newest run works in a sandbox there is no pane here, and this part draws nothing: AgentLiveSteps
 * shows that run. How the pane was found, and its size, are for Developer mode.
 *
 * Its one prop is the agent. 13k places it on the agent's page.
 */

import { useState } from 'react'
import { t, type WordKey } from '@shared/i18n.ts'
import type { AnAgentsPane, TerminalReading } from '@shared/terminals.ts'
import { Btn, ErrorNote, Panel } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { TerminalView } from './TerminalView.tsx'
import { AGENT_LIVE_CSS, DeveloperFacts, TheNewestRunIsElsewhere, theProjectOfANewestRunElsewhere } from './AgentLiveParts.tsx'
import { useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'
import { showThePaneOf, thePaneOf, whatARefusalSays } from '../lib/terminals.ts'

/** The sentence for each state that shows no pane, by its refusal code's words (src/shared/words, server.pane*). */
const WHY_NO_PANE: Record<Exclude<AnAgentsPane['state'], 'shown'>, WordKey> = {
  'no-run': 'server.paneNoRun',
  // Never drawn: this part draws nothing for a run in a sandbox. Here so every state has its sentence.
  sandbox: 'server.paneInASandbox',
  'not-running': 'server.paneNotRunning',
  'not-in-a-terminal': 'server.paneNotInATerminal',
  'not-in-tmux': 'server.paneNotInTmux',
  'no-tmux': 'server.paneNoTmux',
}

export function AgentLiveTerminal({ agentId }: { agentId: string }): React.ReactElement | null {
  useLanguage()
  const inspect = useInspect()
  const [reply, readAgain] = useProjectAsync(() => thePaneOf(agentId), [agentId])
  const [view, setView] = useState<TerminalReading | null>(null)
  const [showing, setShowing] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)

  // NOTHING WHILE IT IS READ, and nothing for a run in a sandbox: a panel that appears and then goes would move the page.
  if (reply.status === 'loading') return null
  if (reply.status === 'ready' && reply.value.state === 'sandbox') return null

  const showIt = async (): Promise<void> => {
    setShowing(true)
    setRefused(null)
    try {
      setView(reply.status === 'ready' && reply.value.view !== null ? reply.value.view : (await showThePaneOf(agentId)).view)
    } catch (err) {
      setRefused(whatARefusalSays(err))
      readAgain()
    } finally {
      setShowing(false)
    }
  }

  const body = (() => {
    if (reply.status === 'error') {
      const elsewhere = theProjectOfANewestRunElsewhere(reply.fault)
      if (elsewhere !== null) return <TheNewestRunIsElsewhere project={elsewhere} />
      return <ErrorNote message={reply.message} fault={reply.fault} label={t('agentLive.terminal.refused')} retry={readAgain} />
    }
    const { state, pane, says } = reply.value
    const developer = inspect ? (
      <DeveloperFacts
        rows={[
          [t('agentLive.dev.how'), says],
          [t('agentLive.dev.pane'), pane === null ? '' : `${pane.target} (${pane.id}, ${pane.tty})`],
          [t('agentLive.dev.size'), pane === null ? '' : `${String(pane.cols)} × ${String(pane.rows)}`],
        ]}
      />
    ) : null
    if (state !== 'shown') {
      return (
        <>
          <div className="al-row">
            <p className="al-line al-why">{t(WHY_NO_PANE[state])}</p>
            <Btn size="sm" onClick={readAgain}>
              {t('agentLive.terminal.lookAgain')}
            </Btn>
          </div>
          {developer}
        </>
      )
    }
    return (
      <>
        {view === null ? (
          <div className="al-row">
            <Btn size="sm" onClick={() => void showIt()} pending={showing}>
              {t('agentLive.terminal.show')}
            </Btn>
          </div>
        ) : (
          <TerminalView
            key={view.id}
            terminal={view}
            heading={t('agentLive.terminal.heading')}
            canFit={pane === null}
            onPutAway={() => setView(null)}
            onClosed={() => {
              setView(null)
              readAgain()
            }}
          />
        )}
        {refused === null ? null : (
          <p className="al-line" role="alert">
            {t('agentLive.terminal.refused')} {refused}
          </p>
        )}
        {developer}
      </>
    )
  })()

  return (
    <Panel declares={{ surface: 'profile.pane' }} titleIs="label" title={t('agentLive.terminal.title')}>
      <style href="mole-office-agent-live" precedence="default">
        {AGENT_LIVE_CSS}
      </style>
      {body}
    </Panel>
  )
}
