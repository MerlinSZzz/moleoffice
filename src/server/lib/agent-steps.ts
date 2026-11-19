// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SANDBOXED RUN'S STEPS, read from its conversation as it is written. Wave 13u, round 10, way C: a wave
 * supervisor's page shows its live steps; a pair of decisions settled that.
 *
 * WHERE THE CONVERSATION IS. A run in a sandbox has no terminal on this computer, but Claude Code writes its
 * conversation into the home the sandbox gives it, which is a folder on this computer:
 *
 *   <home>/.claude/projects/<its working directory, flattened>/<conversation>.jsonl
 *
 * The home is the isolated run's own when there is one named by this run, and otherwise the sandbox's
 * (src/config/a-sandboxed-runs-home.mjs). The folder is theTranscriptFolder's (src/config/claude-code-served.mjs). The
 * conversation is the one the record names, when it names one. A sandbox round started with `--continue` names none,
 * and Claude Code then writes into the newest conversation in that folder, so the newest one is read, and only when it
 * was written since the run started. `says` tells which of these happened.
 *
 * ONLY INSIDE THE RUN'S OWN SANDBOX HOME (wave 13u, round 10b). The record is written by its agent, so the folder, the
 * working directory and the conversation id it names are checked, not trusted (theRunsOwnHome and isInsideTheHome in
 * a-sandboxed-runs-home.mjs). A record that leads anywhere else is refused in words with stepsOutsideTheHome, and
 * nothing is read.
 *
 * HOW IT IS READ. From the byte offset the page read up to last time (readFrom in adapters/logfile.ts), so a page
 * that asks every two seconds reads only what was written since. The first read, with no offset, reads the end of the
 * file and keeps the steps since the run started. The steps are theStepsOfALine's (adapters/claude-code.ts): what it
 * read, ran, wrote and said, and never its thinking.
 */

import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { AnAgentsSteps, ARunsStep } from '@shared/terminals.ts'
import { isInsideTheHome, theRunsOwnHome } from '../../config/a-sandboxed-runs-home.mjs'
import { theTranscriptFolder } from '../../config/claude-code-served.mjs'
import { theStepsOfALine } from './adapters/claude-code.ts'
import { isUnreadable, readFrom, TAIL_WINDOW_BYTES } from './adapters/logfile.ts'
import { theAgentAnArrivingReferenceNames } from './the-agent-an-arriving-reference-names.ts'
import { theNewestRunOfTheAgent } from './session-origins.ts'
import { aTerminalRefusal } from './terminals.ts'

/** The most steps one answer holds. A first read of a busy run keeps its newest. */
export const THE_MOST_STEPS = 200

function said(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** The conversation file of a sandboxed run, or the sentence that says why there is none. */
export function theConversationOf(run: string, data: Record<string, unknown>): { file: string; says: string } | { file: null; says: string } {
  const sandbox = data['sandbox'] as Record<string, unknown>
  const folder = said(sandbox['folder'])
  if (folder === null) return { file: null, says: `Its newest run ${run} names no sandbox folder.` }
  const cwd = said(data['workingDirectory'])
  if (cwd === null) return { file: null, says: `Its newest run ${run} names no working directory, so its conversation folder is not known.` }
  const own = theRunsOwnHome(folder, run)
  if ('outside' in own) throw aTerminalRefusal('stepsOutsideTheHome', `${own.outside} Its steps are read only from inside its own sandbox home. Nothing was read.`, 400)
  if (own.home === null) return { file: null, says: own.missing }
  const home = own.home
  const where = theTranscriptFolder({ HOME: home }, cwd)
  if (where === null) return { file: null, says: `The home ${home} gives Claude Code no folder.` }
  const refuseOutside = (path: string): never => {
    throw aTerminalRefusal('stepsOutsideTheHome', `Its record leads to ${path}, which is not inside its own sandbox home ${home}. Nothing was read.`, 400)
  }
  if (!isInsideTheHome(home, where)) refuseOutside(where)

  const named = said(data['providerSession'])
  if (named !== null) {
    const file = join(where, `${named}.jsonl`)
    if (!isInsideTheHome(home, file)) refuseOutside(file)
    return { file, says: `its conversation ${named} in ${where}` }
  }

  let newest: { name: string; at: number } | null = null
  try {
    for (const name of readdirSync(where)) {
      if (!name.endsWith('.jsonl')) continue
      const at = statSync(join(where, name)).mtimeMs
      if (newest === null || at > newest.at) newest = { name, at }
    }
  } catch (err) {
    return { file: null, says: `Its conversation folder ${where} could not be read: ${(err as Error).message}` }
  }
  if (newest === null) return { file: null, says: `There is no conversation in ${where}.` }
  const started = said(data['startedAt'])
  const startedMs = started === null ? Number.NaN : new Date(started.replace(' ', 'T')).getTime()
  if (Number.isNaN(startedMs) || newest.at < startedMs) {
    return { file: null, says: `The newest conversation in ${where}, ${newest.name}, was not written since its run ${run} started${started === null ? ' (the run gives no start)' : ` at ${started}`}.` }
  }
  if (!isInsideTheHome(home, join(where, newest.name))) refuseOutside(join(where, newest.name))
  return {
    file: join(where, newest.name),
    says: `the newest conversation in ${where}, ${newest.name}, which a run started with --continue writes into, because the run names none`,
  }
}

/** A SANDBOXED AGENT'S STEPS since an offset, or from the start of its newest run when there is none. */
export function theStepsOfTheAgent(reference: string, workspaceId: string, after: number | null): AnAgentsSteps {
  const named = theAgentAnArrivingReferenceNames(reference, 'writing')
  if (named === null) throw aTerminalRefusal('terminalAgentNotFound', `No agent answers to "${reference}".`, 404)
  const agent = { id: named.agent.id, handle: named.agent.handle }
  const newest = theNewestRunOfTheAgent(agent.id, agent.handle, workspaceId)
  const answer = (state: AnAgentsSteps['state'], says: string, read: Partial<Pick<AnAgentsSteps, 'steps' | 'next' | 'earlier'>> = {}): AnAgentsSteps => ({
    agent,
    run: newest === undefined ? null : { id: newest.id },
    state,
    steps: read.steps ?? [],
    next: read.next ?? null,
    earlier: read.earlier ?? false,
    says,
  })
  if (newest === undefined) return answer('no-run', 'No session record serves this agent.')
  const data = newest.data
  if (typeof data['sandbox'] !== 'object' || data['sandbox'] === null) {
    return answer('not-in-a-sandbox', `Its newest run ${newest.id} does not work in a sandbox.`)
  }
  if (data['state'] !== 'running') return answer('ended', `Its newest run ${newest.id} works in a sandbox and is ${String(data['state'] ?? 'not marked running')}.`)

  const conversation = theConversationOf(newest.id, data)
  if (conversation.file === null) return answer('no-log', conversation.says)

  let size: number
  try {
    size = statSync(conversation.file).size
  } catch (err) {
    return answer('no-log', `Read ${conversation.says}: ${(err as Error).message}.`)
  }
  // A FILE SHORTER THAN THE OFFSET is not the file the page read; it is read again from its end, and said so.
  const restarted = after !== null && after > size
  const first = after === null || restarted
  const start = first ? Math.max(0, size - TAIL_WINDOW_BYTES) : after
  const read = readFrom(conversation.file, start)
  if (isUnreadable(read)) return answer('no-log', `Read ${conversation.says}: ${read.reason}.`)

  // ON A FIRST READ, THE STEPS OF THIS RUN ONLY: a conversation continued by --continue holds earlier rounds too. Both
  // stamps are local time in the same form, so they compare as strings.
  const started = said(data['startedAt'])
  const all: ARunsStep[] = []
  let beforeTheRun = false
  for (const line of read.lines) {
    for (const step of theStepsOfALine(line)) {
      if (first && started !== null && step.at !== null && step.at < started) beforeTheRun = true
      else all.push(step)
    }
  }
  const steps = all.slice(-THE_MOST_STEPS)
  // EARLIER STEPS MAY BE MISSING when the answer was cut, or when a first read began inside the file and saw nothing
  // from before the run, so the run may have started before the window did.
  const earlier = all.length > steps.length || (first && start > 0 && !beforeTheRun)
  return answer(
    'shown',
    `Read ${conversation.says}, from byte ${String(start)} to ${String(read.next)} of ${String(read.fileSize)}.` +
      (read.skipped > 0 ? ` ${String(read.skipped)} bytes were passed over: the rest of a line the read began inside, or a line longer than one read.` : '') +
      (restarted ? ` The file is shorter than the offset ${String(after)}, so it was read again from its end.` : ''),
    { steps, next: read.next, earlier },
  )
}
