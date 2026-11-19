// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LIVE PARTS OF AN AGENT'S PAGE, DRAWN ALONE (wave 13u, round 10), so they can be looked at and photographed
 * before 13k places them on the agent's page: AgentLiveTerminal, AgentLiveSteps, AgentQuickInputs and AgentWayBack, for the one agent
 * the address names. It is the component sheet's page with `?agent-live=<agent>` before the `#/ui`. The agent and
 * what is shown of it are the office's own records: nothing here is made up.
 */

import { t } from '@shared/i18n.ts'
import { AgentLiveSteps } from './AgentLiveSteps.tsx'
import { AgentLiveTerminal } from './AgentLiveTerminal.tsx'
import { AgentQuickInputs } from './AgentQuickInputs.tsx'
import { AgentWayBack } from './AgentWayBack.tsx'
import { useLanguage } from '../lib/language.ts'

/** The agent the address names, or null when it names none. */
export function theLivePartsAgent(): string | null {
  if (typeof window === 'undefined') return null
  const named = new URLSearchParams(window.location.search).get('agent-live')
  return named === null || named === '' ? null : named
}

export function TheLivePartsSheet({ agentId }: { agentId: string }): React.ReactElement {
  useLanguage()
  return (
    <div className="al-sheet">
      <style href="mole-office-live-parts-sheet" precedence="default">
        {`.al-sheet { display: grid; gap: var(--pad); min-width: 0; max-width: 72rem; } .al-sheet-says { margin: 0; color: var(--text-2); }`}
      </style>
      <p className="al-sheet-says">{t('sheet.liveParts.says', { agent: agentId })}</p>
      <AgentLiveTerminal agentId={agentId} />
      <AgentLiveSteps agentId={agentId} />
      <AgentQuickInputs agentId={agentId} />
      <AgentWayBack agentId={agentId} />
    </div>
  )
}
