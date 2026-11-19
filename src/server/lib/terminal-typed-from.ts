// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE THE TYPING INTO EACH TERMINAL CAME FROM, AND THE LINE TO THE PERSON WHEN A TERMINAL IS USED FROM ANOTHER
 * COMPUTER. As point (d) of a decision says, wave 13u round 14.
 *
 * Typing from another computer is checked by account and machine, and its source is recorded
 * as the chat records where a message was written. The doors in api/terminals.ts declare
 * `thePersonMayFromAnotherComputer`, so from another computer only the person's own key over an encrypted door reaches
 * them (`thePersonMayAskFromThere` in ./reach.ts), and every door still asks that the caller is the person. Every
 * input the input door takes is counted here against its source: the level, the machine as a message stores it
 * (./machines.ts), the program, and the account with how it was proved.
 *
 * KEPT IN MEMORY, AND SAID TO BE. The sources live in this server's memory and are lost when it restarts, though the
 * terminals live on in the holder. So every reading says `since`, the time this server started, and the page says that
 * typing before then was not recorded. A run of typing from another computer is also said to the person as a line from
 * the office, and that line is a message, which is kept.
 *
 * ONE LINE PER ACT, TERMINAL AND DEVICE IN TEN MINUTES. A line for every key typed from another computer would bury the
 * conversation it is written in. Reading, typing into and closing a terminal from another computer are each said once,
 * and again only after ten minutes. Resizing is not said: it changes what every reader sees and nothing in the terminal.
 */
import type { FastifyRequest } from 'fastify'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { moleOffice } from '@shared/participants.ts'
import { THE_PERSON } from '@shared/person.ts'
import { theCommandLine, type TerminalReading, type TypedFrom, type TypedFromLevel, type TypedFromProof, type TypedFromRun } from '@shared/terminals.ts'
import { writeASystemLineToOne } from './groups.ts'
import { arrivalOf } from '@shared/arrival-of.ts'
import { howThisRequestProvedItself } from './keys.ts'
import { asAMessageStoresIt, writtenFrom } from './machines.ts'
import type { Actor } from './records.ts'
import { workspaceOf } from './workspaces.ts'

/** When this server started: the sources of typing before it were not recorded. */
const SINCE = new Date().toISOString()

/** How many runs one terminal keeps. The oldest are let go first, and counted. */
export const THE_MOST_RUNS_KEPT = 20

/** How long a line about one act on one terminal from one device keeps the next one back. */
export const ONE_LINE_PER_MS = 10 * 60_000

/** Mole Office itself, as the office's other lines to one participant are written. */
function theOffice(): Actor { return { type: 'system', id: moleOffice().id } }
/** A run's source, without its times and count. */
export type TypedFromSource = Omit<TypedFromRun, 'firstAt' | 'lastAt' | 'inputs'>

const kept = new Map<string, { runs: TypedFromRun[]; forgotten: number }>()
const watchers = new Map<string, Set<(now: TypedFrom) => void>>()
const lastSaid = new Map<string, number>()

/**
 * WHERE THIS REQUEST TYPES FROM. The door has already let the caller through: the person, or a secretary it lets type one
 * line (api/terminals.ts). A secretary is a source of its own, never the person: its account is the agent its key
 * proved, or the name it sent where no key proved it, and the proof says which. An agent reaches these doors only on
 * this computer, so a secretary's source has no machine.
 */
export function theSourceOf(req: FastifyRequest, actor: Actor): TypedFromSource {
  if (actor.type === 'agent') {
    const proved = actor.provedBy === 'an-agent-key' ? actor.keyHolder : undefined
    return {
      level: 'a secretary',
      machine: null,
      how: 'a secretary',
      program: null,
      account: { id: proved ?? actor.id, proof: proved === undefined ? "the secretary's name, with no key" : "the secretary's own key", device: null },
      agentHandle: actor.id,
    }
  }
  const level: TypedFromLevel = arrivalOf(req) === 'another machine' ? 'another computer' : 'this computer'
  const where = asAMessageStoresIt(writtenFrom(req))
  const proof = howThisRequestProvedItself(req)
  // A KEY THAT PROVED THE PERSON UNDER ANOTHER HOLDER'S NAME is a paired device's key, and that name is the device's.
  const device = proof?.how === 'the-person-key' && proof.whoseId !== THE_PERSON ? proof.whoseId : null
  const how: TypedFromProof = proof?.how !== 'the-person-key' ? 'no key, from this computer' : device === null ? "the person's key" : "a device's key"
  return {
    level,
    machine: where.machine,
    how: where.how,
    ...(where.how !== 'this machine' && 'address' in where && typeof where.address === 'string' ? { address: where.address } : {}),
    program: where.program,
    account: { id: actor.id, proof: how, device },
  }
}

/** Whether two sources are the same, so an input joins the run before it. */
function theSame(a: TypedFromSource, b: TypedFromSource): boolean {
  return (
    a.level === b.level &&
    a.machine === b.machine &&
    a.how === b.how &&
    a.address === b.address &&
    a.program === b.program &&
    a.account.id === b.account.id &&
    a.account.proof === b.account.proof &&
    a.account.device === b.account.device
  )
}

/** What one terminal's typing is known to have come from. A terminal nobody has typed into since `since` has no runs. */
export function typedFromOf(terminal: string): TypedFrom {
  const held = kept.get(terminal)
  return { since: SINCE, runs: held === undefined ? [] : held.runs.map((run) => ({ ...run, account: { ...run.account } })), forgotten: held?.forgotten ?? 0 }
}

/**
 * COUNT ONE INPUT AGAINST ITS SOURCE, and tell every reader of the terminal. Answers whether the input began a new run,
 * which is when a run from another computer is said to the person.
 */
export function recordAnInput(terminal: string, source: TypedFromSource, at: Date = new Date()): { began: boolean } {
  const held = kept.get(terminal) ?? { runs: [], forgotten: 0 }
  kept.set(terminal, held)
  const stamp = at.toISOString()
  const last = held.runs.at(-1)
  let began = false
  if (last !== undefined && theSame(last, source)) {
    last.lastAt = stamp
    last.inputs += 1
  } else {
    held.runs.push({ ...source, account: { ...source.account }, firstAt: stamp, lastAt: stamp, inputs: 1 })
    began = true
    while (held.runs.length > THE_MOST_RUNS_KEPT) {
      held.runs.shift()
      held.forgotten += 1
    }
  }
  const now = typedFromOf(terminal)
  for (const watcher of watchers.get(terminal) ?? []) watcher(now)
  return { began }
}

/** Be told each time the terminal's typing is counted. Answers the way to stop. */
export function watchTypedFrom(terminal: string, onChange: (now: TypedFrom) => void): () => void {
  const set = watchers.get(terminal) ?? new Set()
  watchers.set(terminal, set)
  set.add(onChange)
  return () => {
    set.delete(onChange)
    if (set.size === 0) watchers.delete(terminal)
  }
}

/** Forget a closed terminal's sources. Its readers were told it closed. */
export function forgetTypedFrom(terminal: string): void {
  kept.delete(terminal)
  for (const key of lastSaid.keys()) if (key.startsWith(`${terminal}\u0000`)) lastSaid.delete(key)
}

/** The act a line names. */
export type ActFromAnotherComputer = 'read' | 'typed into' | 'closed'

/**
 * SAY TO THE PERSON THAT A TERMINAL WAS USED FROM ANOTHER COMPUTER, when this request came from one and the same act on
 * the same terminal from the same device was not said in the last ten minutes. Answers the line's id, or null because
 * nothing was said. `terminal` is the reading when the door has it; the line then names the command and the folder.
 */
export function sayATerminalWasUsedFromAnotherComputer(
  req: FastifyRequest,
  source: TypedFromSource,
  id: string,
  act: ActFromAnotherComputer,
  terminal: TerminalReading | null,
  at: number = Date.now(),
): string | null {
  if (source.level !== 'another computer') return null
  const key = `${id}\u0000${act}\u0000${source.account.device ?? ''}`
  const before = lastSaid.get(key)
  if (before !== undefined && at - before < ONE_LINE_PER_MS) return null
  lastSaid.set(key, at)
  const which = terminal === null ? `The terminal ${id}` : `The terminal "${theCommandLine(terminal)}" in ${terminal.folder}`
  const line = SYSTEM_LINES.aTerminalUsedFromAnotherComputer(`${which} was ${act}`, source.account.device)
  return writeASystemLineToOne({ kind: 'person', id: THE_PERSON }, workspaceOf(req), line, theOffice()).id
}
