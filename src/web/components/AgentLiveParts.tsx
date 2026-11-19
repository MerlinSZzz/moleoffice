// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE THREE LIVE PARTS OF AN AGENT'S PAGE SHARE (wave 13u, round 10): AgentLiveTerminal, AgentLiveSteps and
 * AgentWayBack. Their look is report _fDqIaN2y2OE's, which was kept, and each place is cut
 * to one sentence. What a developer reads, such as how a pane was found, is drawn by DeveloperFacts only in
 * Developer mode.
 */

import { t } from '@shared/i18n.ts'
import { wordWithSpacedValues } from '@shared/spacing.ts'
import { TERMINAL_PARTS_CSS } from './TerminalParts.tsx'
import { Btn } from './ui.tsx'
import { navigate } from './router.tsx'
import type { Fault } from '../api.ts'
import { nameOfProject, useProjects } from '../lib/projectlist.ts'

/** Rows a developer reads, as a term and its value. A row whose value is empty is left out. */
export function DeveloperFacts({ rows }: { rows: Array<[string, string]> }): React.ReactElement {
  return (
    <dl className="al-dev">
      {rows
        .filter(([, value]) => value !== '')
        .map(([term, value]) => (
          <div key={term} className="al-dev-row">
            <dt>{term}</dt>
            <dd className="tm-mono">{value}</dd>
          </div>
        ))}
    </dl>
  )
}

/**
 * THE PROJECT THE AGENT'S NEWEST RUN IS FILED IN, when a part's read was refused because that run is in another
 * project, or null for any other refusal. The server names the project (src/server/lib/session-origins.ts).
 */
export function theProjectOfANewestRunElsewhere(fault: Fault | null | undefined): string | null {
  return fault !== null && fault !== undefined && fault.kind === 'elsewhere' && fault.elsewhere !== null ? fault.elsewhere.workspaceId : null
}

/**
 * ONE SENTENCE THAT THE AGENT'S NEWEST RUN IS IN ANOTHER PROJECT, AND A PRESS THAT SHOWS THIS PAGE THERE (round 109).
 * An older run of this project is never shown in its place, and the page does not move until the press.
 */
export function TheNewestRunIsElsewhere({ project }: { project: string }): React.ReactElement {
  const name = nameOfProject(useProjects(), project)
  return (
    <div className="al-row">
      <p className="al-line al-elsewhere">{wordWithSpacedValues(t, 'agentLive.elsewhere', { project: name })}</p>
      <Btn size="sm" onClick={() => navigate(window.location.hash.slice(1), project)}>
        {wordWithSpacedValues(t, 'agentLive.elsewhere.press', { project: name })}
      </Btn>
    </div>
  )
}

/** The terminal parts' own rules (its monospace, among them), then these parts'. */
export const AGENT_LIVE_CSS = TERMINAL_PARTS_CSS + `
.al-line { margin: 0; color: var(--text-2); }
.al-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; min-width: 0; }
.al-dev { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 0.2rem 0.75rem; margin: 0.5rem 0 0 0; font-size: 0.9em; }
.al-dev-row { display: contents; }
.al-dev dt { color: var(--text-3); }
.al-dev dd { margin: 0; min-width: 0; overflow-wrap: anywhere; color: var(--text-2); }
@media (max-width: 40rem) {
  .al-dev { grid-template-columns: minmax(0, 1fr); }
  .al-dev dd { margin-bottom: 0.25rem; }
}
`
