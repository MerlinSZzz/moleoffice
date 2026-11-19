// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Startup cleanup reads this office's session records. _VDR6BJbiaoF. */
import { THE_INSTALL } from '../../config/settings.mjs'
import { sqlite } from '../db/client.ts'
import { theOfficeIsInThisDatabase } from './office.ts'
import { osProbe } from './resources.ts'
import { TERMINAL_STATES } from './terminal-states.ts'

export async function sweepCheckWorktreesAtStart(): Promise<string[]> {
  // AN INSTALLED OFFICE MAKES NO CHECK WORKTREES: only the inspector's tools make them, and an
  // installation carries no tools/ (answer IGu5sdvh7JB-). So it sweeps nothing, and says so.
  if (THE_INSTALL.from === 'bundle') {
    return ['Check worktrees were not swept: this office runs from an installation, which carries no check tools and so never makes a check worktree.']
  }
  // ONLY THE OFFICE SWEEPS. A world served from a copy of the office's data carries the office's check
  // records and runs on this machine, so without this its start would remove the machine's real check
  // worktrees on records that describe the office's checks, not its own.
  if (!theOfficeIsInThisDatabase()) {
    return ['Check worktrees were not swept: this database is not the office, so its check records are not this machine\'s.']
  }
  const probe = osProbe()
  if (probe.sweepCheckWorktrees === undefined) return ['Check worktrees were kept: this machine reader cannot sweep them.']
  const sessions = sqlite.prepare("SELECT id, data FROM records WHERE kind = 'session' AND deleted_at IS NULL").all() as { id: string; data: string }[]
  const checks = sessions.map(({ id, data }) => {
    const state = JSON.parse(data).state
    return { id, state: typeof state === 'string' ? state : 'not recorded', ended: TERMINAL_STATES.some((ended) => ended === state) }
  })
  return (await probe.sweepCheckWorktrees(checks)).lines
}
