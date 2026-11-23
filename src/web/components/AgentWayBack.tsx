// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAY BACK TO AN AGENT'S NEWEST RUN, ON ITS PAGE. Wave 13u, round 10. A decision says to show the command
 * wherever there is one. Another says option 2, the command and the
 * press.
 *
 * GET /api/terminals/agents/:agent/way-back gives the command (src/config/the-way-back.mjs works it out) and what the
 * press would do now. The person may copy the command, or press "Bring it back in Mole Office's terminal": the office
 * runs the same command in a terminal it holds (POST …/way-back, decision VeP_YtTzTeh5), and the view opens here.
 *
 *   ready    the command, Copy, and the press;
 *   running  the same, with the press held back, because a second copy of the same conversation would start;
 *   sandbox  the command and Copy, and one sentence that it runs inside its sandbox, which the office cannot open yet;
 *   none     one sentence that no command brings the run back.
 *
 * One sentence per place. Where the command comes from, its folder and the flags kept and left out are for Developer
 * mode.
 *
 * Its one prop is the agent. 13k places it on the agent's page.
 */

import { useState } from 'react'
import { t } from '@shared/i18n.ts'
import type { TerminalReading } from '@shared/terminals.ts'
import { Btn, ErrorNote, Loading, Panel } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { TerminalView } from './TerminalView.tsx'
import { AGENT_LIVE_CSS, DeveloperFacts, TheNewestRunIsElsewhere, theProjectOfANewestRunElsewhere } from './AgentLiveParts.tsx'
import { useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'
import { bringItBack, theWayBack, whatARefusalSays } from '../lib/terminals.ts'

export function AgentWayBack({ agentId }: { agentId: string }): React.ReactElement {
  useLanguage()
  const inspect = useInspect()
  const [reply, readAgain] = useProjectAsync(() => theWayBack(agentId), [agentId])
  const [view, setView] = useState<TerminalReading | null>(null)
  const [bringing, setBringing] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  const [copied, setCopied] = useState<boolean | null>(null)

  const copy = (command: string): void => {
    navigator.clipboard.writeText(command).then(
      () => setCopied(true),
      () => setCopied(false),
    )
  }

  const bring = async (session: string): Promise<void> => {
    setBringing(true)
    setRefused(null)
    try {
      setView((await bringItBack(agentId, session)).terminal)
    } catch (err) {
      setRefused(whatARefusalSays(err))
    } finally {
      setBringing(false)
      readAgain()
    }
  }

  const body = (() => {
    if (reply.status === 'loading') return <Loading what={t('agentLive.back.title')} rows={1} />
    if (reply.status === 'error') {
      const elsewhere = theProjectOfANewestRunElsewhere(reply.fault)
      if (elsewhere !== null) return <TheNewestRunIsElsewhere project={elsewhere} />
      return <ErrorNote message={reply.message} fault={reply.fault} label={t('agentLive.back.title')} retry={readAgain} />
    }
    const { run, way, press, says } = reply.value
    const developer = !inspect ? null : (
      <DeveloperFacts
        rows={[
          [t('agentLive.dev.why'), way.way === 'none' ? way.because : ''],
          [t('agentLive.dev.how'), says],
          [t('agentLive.dev.run'), run?.id ?? ''],
          [t('agentLive.dev.folder'), way.way === 'none' ? '' : way.folder],
          [t('agentLive.dev.conversation'), way.way === 'none' ? '' : way.sessionId],
          [t('agentLive.dev.kept'), way.way === 'host' ? way.kept.join(' ') : ''],
          [t('agentLive.dev.dropped'), way.way === 'host' ? way.dropped.join(', ') : ''],
        ]}
      />
    )
    if (run === null || way.way === 'none') {
      return (
        <>
          <p className="al-line al-back-state">{run === null ? t('agentLive.back.noRunWord') : t('agentLive.back.noneWord')}</p>
          {developer}
        </>
      )
    }
    return (
      <>
        {way.way === 'sandbox' ? <p className="al-line al-back-state">{t('agentLive.back.inItsSandbox')}</p> : null}
        <div className="al-command">
          <code className="tm-mono">{way.command}</code>
          <Btn size="sm" onClick={() => copy(way.command)}>
            {t('agentLive.back.copy')}
          </Btn>
        </div>
        {copied === null ? null : (
          <p className="al-line" role="status">
            {copied ? t('agentLive.back.copied') : t('agentLive.back.notCopied')}
          </p>
        )}
        {way.way !== 'host' ? null : (
          <div className="al-row">
            <Btn
              size="sm"
              variant="primary"
              onClick={() => void bring(run.id)}
              pending={bringing}
              disabled={press !== 'ready'}
              reason={press === 'ready' ? undefined : t('agentLive.back.running')}
            >
              {t('agentLive.back.press')}
            </Btn>
          </div>
        )}
        {refused === null ? null : (
          <p className="al-line" role="alert">
            {t('agentLive.back.refused')} {refused}
          </p>
        )}
        {view === null ? null : (
          <TerminalView
            key={view.id}
            terminal={view}
            onPutAway={() => setView(null)}
            onClosed={() => {
              setView(null)
              readAgain()
            }}
          />
        )}
        {developer}
      </>
    )
  })()

  return (
    <Panel declares={{ surface: 'profile.wayback' }} titleIs="label" title={t('agentLive.back.title')}>
      <style href="mole-office-agent-live" precedence="default">
        {AGENT_LIVE_CSS}
      </style>
      <style href="mole-office-agent-way-back" precedence="default">
        {AGENT_WAY_BACK_CSS}
      </style>
      {body}
    </Panel>
  )
}

const AGENT_WAY_BACK_CSS = `
.al-back-state { margin-bottom: 0.4rem; }
.al-command { display: flex; gap: 0.5rem; align-items: flex-start; min-width: 0; margin-bottom: 0.4rem; }
.al-command code {
  flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; word-break: break-all; padding: 0.35rem 0.5rem;
  background: var(--panel-2); border: var(--border-w, 1px) solid var(--border); border-radius: var(--radius-sm);
}
/* NARROW, Copy goes under the command at the left, so it is never in the chat button's corner (round 11). */
@media (max-width: 40rem) {
  .al-command { flex-wrap: wrap; }
  .al-command code { flex-basis: 100%; }
}
`
