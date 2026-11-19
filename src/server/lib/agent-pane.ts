// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S TMUX PANE, FOUND AND SHOWN IN A TERMINAL THE OFFICE HOLDS. Wave 13u, round 10, way B, in
 * which a secretary's page shows its own tmux pane, by two decisions.
 *
 * HOW THE PANE IS FOUND, as it was measured on the owner's machine (an agent's process on pts/9, its pane recover:1.3):
 *
 *   1. the agent's newest run, and the process it runs as now (theProcessOfTheRun in lib/terminal-agents.ts: the
 *      process its record names, or one whose arguments name its conversation);
 *   2. that process's terminal, from `ps -o tty= -p <pid>` (theTerminalOfAProcess in src/config/process-reader.mjs);
 *   3. the tmux pane on that terminal, from `tmux list-panes -a` (tmuxPanes on the OsProbe in lib/resources.ts).
 *
 * This file starts no process and reads no process file itself; those two are the operating-system layer's.
 *
 * Each step that finds nothing is its own answer (AnAgentsPane's state), and is never filled in with a guess.
 *
 * HOW IT IS SHOWN. The person's press opens a terminal in the holder that runs src/config/tmux-pane-view.mjs, which
 * watches the pane through a grouped session of its own, attached in control mode with ignore-size, so nothing in the
 * owner's own tmux client is resized or switched. A second press while a view of the same pane is open answers that
 * view and opens no other.
 *
 * WHAT IS MEASURED WHERE. The view is measured against a real tmux 3.4 (tests/the-pane-view-moves-nothing-in-a-real-tmux.test.ts).
 * Finding the pane follows the tmux 3.4 manual and is proved against a stand-in tmux
 * (tests/an-agents-tmux-pane-is-watched-without-moving-the-persons.test.ts).
 */

import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import type { AnAgentsPane, ListedTerminal, TerminalParty, TerminalReading } from '@shared/terminals.ts'
import { theTerminalOfAProcess } from '../../config/process-reader.mjs'
import { REPO_ROOT, theInstallsNode } from '../../config/settings.mjs'
import { THE_LARGEST_SIDE } from '../../config/the-terminal-holder.mjs'
import { theAgentAnArrivingReferenceNames } from './the-agent-an-arriving-reference-names.ts'
import { osProbe } from './resources.ts'
import { theNewestRunOfTheAgent } from './session-origins.ts'
import { type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { theOfficeTerminalOfTheRun, theProcessOfTheRun, whoOpensIt } from './terminal-agents.ts'
import { theRunHasEnded } from '@shared/run-has-ended.ts'
import { aTerminalRefusal, askTheHolderFor, theEnvironmentATerminalGets, theHolder } from './terminals.ts'

/** The program the holder runs to show a pane. */
export const THE_PANE_VIEW = join(REPO_ROOT, 'src', 'config', 'tmux-pane-view.mjs')
/** What list-panes is asked to say of each pane, one pane to a line. aPaneLine reads it. */
const PANE_FORMAT = '#{pane_id} #{session_name}:#{window_index}.#{pane_index} #{pane_tty} #{pane_width} #{pane_height}'

/** The agent a reference names, refused in words when none does. */
function theAgent(reference: string): { id: string; handle: string } {
  const named = theAgentAnArrivingReferenceNames(reference, 'writing')
  if (named === null) throw aTerminalRefusal('terminalAgentNotFound', `No agent answers to "${reference}". Nothing was opened.`, 404)
  return { id: named.agent.id, handle: named.agent.handle }
}

/** One line of list-panes, read; null for a line not in the asked shape. */
export function aPaneLine(line: string): NonNullable<AnAgentsPane['pane']> | null {
  const [id, target, tty, cols, rows] = line.trim().split(' ')
  if (id === undefined || !/^%\d+$/.test(id) || target === undefined || tty === undefined || !/^\d+$/.test(cols ?? '') || !/^\d+$/.test(rows ?? '')) return null
  const session = target.slice(0, target.lastIndexOf(':'))
  if (session === '') return null
  return { id, target, session, tty, cols: Number(cols), rows: Number(rows) }
}

/**
 * WHICH PANE A TERMINAL SHOWS, when it is the office's view of an agent's tmux pane, and null for any other terminal
 * (round 11). A view is a terminal that runs THE_PANE_VIEW. The pane door and the terminals list both ask this, so the
 * view the door finds open and the view the list names cannot differ.
 */
export function thePaneAViewShows(one: TerminalReading): ListedTerminal['paneView'] {
  if (one.args[0] !== THE_PANE_VIEW) return null
  const flag = (name: string): string | undefined => (one.args.includes(name) ? one.args[one.args.indexOf(name) + 1] : undefined)
  const pane = flag('--pane')
  const session = flag('--session')
  return pane === undefined || session === undefined ? null : { pane, session }
}

/** Every terminal the holder holds, as the list door gives it, with the pane each view shows. */
export function asListed(all: readonly TerminalReading[]): ListedTerminal[] {
  return all.map((one) => ({ ...one, paneView: thePaneAViewShows(one) }))
}

/** The view terminals the holder holds now, of this pane and agent. */
async function theOpenViewOf(agentId: string, pane: string): Promise<TerminalReading | null> {
  const listed = (await askTheHolderFor({ op: 'list' }))['terminals'] as TerminalReading[]
  return listed.find((one) => one.state === 'running' && one.agent?.id === agentId && thePaneAViewShows(one)?.pane === pane) ?? null
}

/** WHERE AN AGENT'S PANE IS, step by step, without the view. */
async function findThePane(reference: string, workspaceId: string): Promise<AnAgentsPane> {
  const agent = theAgent(reference)
  const newest = theNewestRunOfTheAgent(agent.id, agent.handle, workspaceId)
  const answer = (state: AnAgentsPane['state'], says: string, pane: AnAgentsPane['pane'] = null) => ({
    agent,
    run: newest === undefined ? null : { id: newest.id },
    state,
    pane,
    view: null,
    says,
  })
  if (newest === undefined) return answer('no-run', 'No session record serves this agent.')
  const data = newest.data
  if (typeof data['sandbox'] === 'object' && data['sandbox'] !== null) {
    return answer('sandbox', `Its newest run ${newest.id} works in a sandbox, which has no tmux pane on this computer.`)
  }
  if (!theRunHasEnded(data['state']) && theOfficeTerminalOfTheRun(data) !== null) {
    try {
      const holder = await theHolder()
      const id = theOfficeTerminalOfTheRun(data, holder)
      if (id !== null) {
        const listed = (await askTheHolderFor({ op: 'list' }))['terminals'] as TerminalReading[]
        const view = listed.find(one => one.id === id && one.state === 'running' && one.project === workspaceId && one.agent?.kind === 'agent' && one.agent.id === agent.id && thePaneAViewShows(one) === null)
        if (view !== undefined) return { ...answer('shown', `Its newest run is in terminal ${view.id}, held by this office.`), view }
      }
    } catch (err) {
      if (!(err instanceof PanelError)) throw err
      // A holder that cannot be read does not establish a screen; process and tmux discovery still apply.
    }
  }
  const conversation = typeof data['providerSession'] === 'string' && data['providerSession'] !== '' ? data['providerSession'] : null
  const process = theProcessOfTheRun(data, conversation)
  if (process.pid === null) return answer('not-running', `Its newest run ${newest.id}: ${process.says}.`)

  const tty = await theTerminalOfAProcess(process.pid)
  if (!tty.ok || tty.terminal === null) {
    return answer('not-in-a-terminal', `Its newest run ${newest.id}: ${process.says}, and ps gives that process no terminal${tty.ok ? '' : ` (${tty.out})`}.`)
  }
  const probe = osProbe()
  if (probe.tmuxPanes === undefined) return answer('no-tmux', `This server's probe for ${probe.platform} cannot ask tmux for panes.`)
  const panes = await probe.tmuxPanes(PANE_FORMAT)
  if (!panes.ok && panes.missing) return answer('no-tmux', 'tmux is not on the PATH of this server.')
  if (!panes.ok) return answer('not-in-tmux', `Its process ${String(process.pid)} is on ${tty.device}, and tmux listed no panes: ${panes.out}`)
  const pane = panes.out.split('\n').map(aPaneLine).find((one) => one !== null && one.tty === tty.device) ?? null
  if (pane === null) return answer('not-in-tmux', `Its process ${String(process.pid)} is on ${tty.device}, and no tmux pane is on that terminal.`)
  return answer('shown', `${process.says}; that process is on ${tty.device}, which is tmux pane ${pane.id} (${pane.target}), ${String(pane.cols)}×${String(pane.rows)}.`, pane)
}

/** AN AGENT'S PANE, as its page reads it: where it is, and the office's view of it when one is open. */
export async function thePaneOfTheAgent(reference: string, workspaceId: string): Promise<AnAgentsPane> {
  const found = await findThePane(reference, workspaceId)
  if (found.state !== 'shown' || found.pane === null) return found
  // A HOLDER THAT DOES NOT RUN IS NOT A REFUSAL HERE: the pane was found, and no view is open.
  const view = await theOpenViewOf(found.agent.id, found.pane.id).catch(() => null)
  return { ...found, view }
}

const REFUSED: Record<Exclude<AnAgentsPane['state'], 'shown'>, Parameters<typeof aTerminalRefusal>[0]> = {
  'no-run': 'paneNoRun',
  sandbox: 'paneInASandbox',
  'not-running': 'paneNotRunning',
  'not-in-a-terminal': 'paneNotInATerminal',
  'not-in-tmux': 'paneNotInTmux',
  'no-tmux': 'paneNoTmux',
}

/**
 * SHOW AN AGENT'S PANE IN A TERMINAL THE OFFICE HOLDS, as the person's press asks. The caller has checked that the
 * person pressed, or the secretary under the person's grant, and the view names that secretary as who opened it
 * (`whoOpensIt` in lib/terminal-agents.ts). A view of the same pane that is open already is answered, and no second one
 * is opened.
 */
export async function showThePane(input: { reference: string; workspaceId: string; actor: Actor }): Promise<{ opened: boolean; view: TerminalReading; pane: AnAgentsPane['pane'] }> {
  const found = await findThePane(input.reference, input.workspaceId)
  if (found.state === 'shown' && found.view !== null) return { opened: false, view: found.view, pane: null }
  if (found.state !== 'shown' || found.pane === null) {
    throw aTerminalRefusal(REFUSED[found.state as Exclude<AnAgentsPane['state'], 'shown'>], `${found.says} Nothing was opened.`, found.state === 'no-run' ? 404 : 409)
  }
  await theHolder()
  const open = await theOpenViewOf(found.agent.id, found.pane.id)
  if (open !== null) return { opened: false, view: open, pane: found.pane }
  const view = `mole-office-view-${found.pane.id.slice(1)}-${randomBytes(3).toString('hex')}`
  const node = theInstallsNode()
  const answer = await askTheHolderFor({
    op: 'open',
    who: whoOpensIt(input.actor),
    agent: { kind: 'agent', id: found.agent.id } satisfies TerminalParty,
    project: input.workspaceId,
    command: node.program,
    args: [THE_PANE_VIEW, '--session', found.pane.session, '--pane', found.pane.id, '--view', view],
    folder: REPO_ROOT,
    // THE PANE VIEW IS AN OFFICE PROGRAM, so it alone is given what the install's Node needs set, and it removes that
    // again at its own start (src/config/tmux-pane-view.mjs).
    env: { ...theEnvironmentATerminalGets(), ...node.environment },
    // THE PANE'S OWN SIZE, so its screen is drawn as the agent's program drew it.
    cols: Math.min(Math.max(found.pane.cols, 1), THE_LARGEST_SIDE),
    rows: Math.min(Math.max(found.pane.rows, 1), THE_LARGEST_SIDE),
    // ON WHEN IT OPENS, as in every terminal the person opens (decision YLv8grhgilBV, point 1).
    keeping: true,
  })
  return { opened: true, view: answer['terminal'] as TerminalReading, pane: found.pane }
}
