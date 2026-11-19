// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE READER AND THE ONE WRITER OF QUICK INPUTS: THE OWNER'S LIST, AND EVERY ASK FOR ONE. Wave 13u, round 21.
 *
 * -----------------------------------------------------------------------------------------
 * WHAT THIS IS
 * -----------------------------------------------------------------------------------------
 *
 * The rules, the shapes and the sentence for "there is no list" are declared once in `src/shared/quick-inputs.ts`. This
 * file is the one place in the server that reads and writes the two tables of migration 0272: the singleton row
 * `quick_input_list`, in the shape `price_table` uses, and `quick_input_asks`, one row for every ask that named a run in
 * an office terminal. Nothing is cached: every call reads the rows.
 *
 * -----------------------------------------------------------------------------------------
 * A CLEARED LIST KEEPS ITS ROW
 * -----------------------------------------------------------------------------------------
 *
 * A clear writes the row with `inputs` NULL, stamped with who cleared it and when. Migration 0272 writes a starting
 * list, and an import never deletes a row, so a clear that removed the row would come back from a restore as the
 * starting list: the office would then type from a list the person had cleared.
 * No row at all is still read as no list, with nobody named, as it was before 0272 ran.
 *
 * -----------------------------------------------------------------------------------------
 * A ROW THAT CANNOT BE READ IS NOT "NONE"
 * -----------------------------------------------------------------------------------------
 *
 * The writer only stores a list `readQuickInputList` accepted, so a row that fails the same check later is a broken
 * assumption. It throws and names the table. Reading it as "none" would hide a list the person set behind the sentence
 * saying there is none.
 *
 * -----------------------------------------------------------------------------------------
 * THE THREE CONDITIONS AND THE ROW THEY KEEP ARE ONE SYNCHRONOUS STEP
 * -----------------------------------------------------------------------------------------
 *
 * `decideAnAsk` asks the three conditions in their order and writes the ask, in one transaction with no await inside
 * it. A typed ask is written as `typed` BEFORE anything is typed, so a second ask from the same agent that arrives while
 * the first is still being typed finds the ten minutes started and is refused. The door then types, and changes the
 * row with `changeTheOutcome` if the holder refuses.
 */
import type { CodedRefusal, QuickInputRefusalCode } from '../../shared/refusal-codes.ts'
import {
  AQuickInputListTheOfficeWillNotKeep,
  ONE_QUICK_INPUT_EVERY_MS,
  QUICK_INPUT_OUTCOMES_THAT_START_THE_TEN_MINUTES,
  readQuickInputList,
  theNoQuickInputListSentence,
  theSentenceForARefusedQuickInputList,
  type AnAgentsQuickInputs,
  type ARefusedQuickInputList,
  type QuickInputAsk,
  type QuickInputListReading,
  type QuickInputOutcome,
} from '../../shared/quick-inputs.ts'
import { localStamp, nowStamp } from '../../shared/time.ts'
import { sqlite } from '../db/client.ts'
import { anOfficeId } from './ids.ts'
import { agentsWithTheseIds } from '../db/agents-with-these-ids.ts'
import { type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { isOneOf, theFiledAliasesReadOnce } from './registry-aliases/runs.ts'

/** The list as stored, and who last set or cleared it and when. Both are null only when there is no row. */
export interface TheQuickInputListAsStored {
  reading: QuickInputListReading
  setAt: string | null
  /** The kind and id the last write was stamped with, exactly as stored. */
  setBy: { kind: string; id: string } | null
}

/** The row, read fresh, or the honest absence. Throws, naming the table, when it cannot be read. */
export function theQuickInputListAsStored(): TheQuickInputListAsStored {
  const held = sqlite
    .prepare('SELECT inputs, updated_at, updated_by_kind, updated_by_id FROM quick_input_list WHERE only_row = 1')
    .get() as { inputs: string | null; updated_at: string; updated_by_kind: string; updated_by_id: string } | undefined
  if (held === undefined) return { reading: readQuickInputList(undefined), setAt: null, setBy: null }
  const stamped = { setAt: held.updated_at, setBy: { kind: held.updated_by_kind, id: held.updated_by_id } }
  // A CLEARED LIST: SQL NULL, which only a clear writes.
  if (held.inputs === null) return { reading: { state: 'none' }, ...stamped }
  let reading: QuickInputListReading
  try {
    reading = readQuickInputList(JSON.parse(held.inputs))
  } catch (err) {
    throw new Error(
      `The list of quick inputs stored in the quick_input_list row cannot be read: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  // A JSON null is not what a clear writes, so it is a row this file did not write.
  if (reading.state !== 'set') throw new Error('The quick_input_list row holds a JSON null, and a clear stores no inputs at all rather than a null.')
  return { reading, ...stamped }
}

/**
 * EACH BROKEN RULE'S CODE, one code for each. The page draws a refusal's sentence from its code alone, so the code
 * says which rule was broken and the values say which input it was. A table rather than a switch because the refusal
 * inventory (`tests/server-refusal-inventory.ts`) reads a code chosen from a table typed as refusal codes as a coded
 * refusal, which is what this is.
 */
const THE_CODE_OF_A_REFUSED_LIST: Record<ARefusedQuickInputList['code'], QuickInputRefusalCode> = {
  quickInputListNotAList: 'quickInputListNotAList',
  quickInputListEmpty: 'quickInputListEmpty',
  quickInputListTooMany: 'quickInputListTooMany',
  quickInputListItemNotWords: 'quickInputListItemNotWords',
  quickInputListItemEmpty: 'quickInputListItemEmpty',
  quickInputListItemTooLong: 'quickInputListItemTooLong',
  quickInputListItemHoldsAKey: 'quickInputListItemHoldsAKey',
  quickInputListItemNoSlash: 'quickInputListItemNoSlash',
  quickInputListItemTwice: 'quickInputListItemTwice',
}

/**
 * The refusal for a list `readQuickInputList` refused, or for a body that sent none: the reader's English sentence
 * with the code and values of the rule it broke. Nothing has been written.
 */
function aListThatIsNotOne(refused: ARefusedQuickInputList): PanelError {
  return new PanelError(
    `${theSentenceForARefusedQuickInputList(refused)} Nothing was written.`,
    400,
    undefined,
    undefined,
    undefined,
    { code: THE_CODE_OF_A_REFUSED_LIST[refused.code], values: refused.values } as CodedRefusal,
  )
}

/** Write the one row, replacing whatever it held. */
function writeTheRow(inputs: string | null, who: Actor): void {
  sqlite
    .prepare(
      'INSERT INTO quick_input_list (only_row, inputs, updated_at, updated_by_kind, updated_by_id) VALUES (1, ?, ?, ?, ?) ' +
        'ON CONFLICT(only_row) DO UPDATE SET inputs=excluded.inputs, updated_at=excluded.updated_at, ' +
        'updated_by_kind=excluded.updated_by_kind, updated_by_id=excluded.updated_by_id',
    )
    .run(inputs, nowStamp(), who.type, who.id)
}

/**
 * SET THE LIST, replacing any list set before.
 *
 * The list is checked with `readQuickInputList` BEFORE anything is written, so a refused list leaves the row exactly as
 * it was. What is stored is what the check kept, each input trimmed, so the reply shows back what the office made of
 * the person's words.
 */
export function setTheQuickInputList(raw: unknown, who: Actor): TheQuickInputListAsStored {
  let reading: QuickInputListReading
  try {
    reading = readQuickInputList(raw)
  } catch (err) {
    if (!(err instanceof AQuickInputListTheOfficeWillNotKeep)) throw err
    throw aListThatIsNotOne(err.refused)
  }
  // WHAT THE READER ANSWERS FOR `undefined` AND `null`: the honest absence, and no list can be set from it.
  if (reading.state !== 'set') throw aListThatIsNotOne({ code: 'quickInputListNotAList', values: {} })
  writeTheRow(JSON.stringify(reading.inputs), who)
  return theQuickInputListAsStored()
}

/** CLEAR THE LIST, so nothing is typed for any agent. The row stays, saying who cleared it and when. */
export function clearTheQuickInputList(who: Actor): TheQuickInputListAsStored {
  writeTheRow(null, who)
  return theQuickInputListAsStored()
}

// ------------------------------------------------------------------------------------------------- the asks

interface AnAskRow {
  id: string
  at_ms: number
  agent_id: string
  run: string
  terminal: string
  input: string
  outcome: QuickInputOutcome
  says: string
  asked_by_kind: string
  asked_by_id: string
  proved_by: string | null
}

/** The outcomes that start the ten minutes, as SQL placeholders. */
const STARTING_PLACEHOLDERS = QUICK_INPUT_OUTCOMES_THAT_START_THE_TEN_MINUTES.map(() => '?').join(', ')

/**
 * When the next input may be typed for this agent, or null when it may be typed now, with the ask that started the wait:
 * when it was made, and whether the office knows it typed (`unknown` is the one outcome where it does not). `ids` are
 * the agent's canonical id and every old id filed for it, because an ask kept before an alias was filed holds the old one.
 */
function theNextTimeFor(ids: readonly string[], nowMs: number): { atMs: number; lastMs: number; known: boolean } | null {
  const last = sqlite
    .prepare(`SELECT at_ms, outcome FROM quick_input_asks WHERE agent_id ${isOneOf(ids)} AND outcome IN (${STARTING_PLACEHOLDERS}) ORDER BY at_ms DESC, rowid DESC LIMIT 1`)
    .get(...ids, ...QUICK_INPUT_OUTCOMES_THAT_START_THE_TEN_MINUTES) as { at_ms: number; outcome: QuickInputOutcome } | undefined
  if (last === undefined || nowMs - last.at_ms >= ONE_QUICK_INPUT_EVERY_MS) return null
  return { atMs: last.at_ms + ONE_QUICK_INPUT_EVERY_MS, lastMs: last.at_ms, known: last.outcome !== 'unknown' }
}

/**
 * A time as a stamp an agent may ask at. A stamp holds whole seconds, so it is rounded up: an ask made at the second it
 * names is never refused for the milliseconds the stamp left out.
 */
function asAStampNotBefore(ms: number): string {
  return localStamp(new Date(Math.ceil(ms / 1000) * 1000))
}

/** The minutes between quick inputs, in words, from the one number. */
const THE_MINUTES = `${String(ONE_QUICK_INPUT_EVERY_MS / 60_000)} minutes`

/** One row as an ask, naming its agent as the registry holds it now. */
function asAnAsk(row: AnAskRow, agent: { id: string; handle: string | null }): QuickInputAsk {
  return {
    id: row.id,
    at: localStamp(new Date(row.at_ms)),
    agent,
    run: row.run,
    terminal: row.terminal,
    input: row.input,
    outcome: row.outcome,
    askedBy: { kind: row.asked_by_kind, id: row.asked_by_id, provedBy: row.proved_by },
    says: row.says,
  }
}

function theAskWithId(id: string): QuickInputAsk {
  const row = sqlite.prepare('SELECT * FROM quick_input_asks WHERE id = ?').get(id) as AnAskRow | undefined
  if (row === undefined) throw new Error(`The quick input ask ${id} was written and cannot be read back.`)
  return asAnAsk(row, { id: row.agent_id, handle: agentsWithTheseIds([row.agent_id]).get(row.agent_id)?.handle ?? null })
}

/**
 * One agent's asks, newest first, at most `limit` of them, with how many older ones were left out. An ask kept under an
 * old id of the agent is one of them.
 */
export function theQuickInputsOf(agent: { id: string; handle: string | null }, limit: number): AnAgentsQuickInputs {
  const ids = theFiledAliasesReadOnce(sqlite).everyIdOf(agent.id)
  const rows = sqlite
    .prepare(`SELECT * FROM quick_input_asks WHERE agent_id ${isOneOf(ids)} ORDER BY at_ms DESC, rowid DESC LIMIT ?`)
    .all(...ids, limit) as AnAskRow[]
  const { total } = sqlite.prepare(`SELECT count(*) AS total FROM quick_input_asks WHERE agent_id ${isOneOf(ids)}`).get(...ids) as { total: number }
  const next = theNextTimeFor(ids, Date.now())
  return {
    agent,
    asks: rows.map((row) => asAnAsk(row, agent)),
    left: total - rows.length,
    nextAllowedAt: next === null ? null : asAStampNotBefore(next.atMs),
  }
}

/** Whether the ask carried the run's own key: condition 1, worked out by the door from the request. */
export type TheRunsKey = 'the-runs-own' | 'the-run-has-none' | 'another'

/** One ask, as the door read it from the request and the run's record. */
export interface AnAsk {
  agentId: string
  run: string
  terminal: string
  /** The input as sent, trimmed. */
  input: string
  key: TheRunsKey
  askedBy: { kind: string; id: string; provedBy: string | null }
}

/** What the three conditions made of an ask, which is now kept. */
export interface TheAskDecided {
  ask: QuickInputAsk
  /** When the next input may be typed for this agent, or null when it may be typed now. */
  nextAllowedAt: string | null
}

/**
 * ASK THE THREE CONDITIONS, IN ORDER, AND KEEP THE ASK. One transaction, so the ten minutes are read and started in one
 * step. The outcome is `typed` when all three hold, and the door must then type the input and change the outcome if
 * the holder refuses. Each refused outcome carries the sentence the asker is answered with.
 */
export function decideAnAsk(asked: AnAsk, now: Date = new Date()): TheAskDecided {
  const nowMs = now.getTime()
  // A run written before an alias was filed may name the agent by its old id. The ask is kept under the canonical id.
  const aliases = theFiledAliasesReadOnce(sqlite)
  const agentId = aliases.canonicalOf(asked.agentId)
  const decide = (): { outcome: QuickInputOutcome; says: string; next: string | null } => {
    const into = `terminal ${asked.terminal}`
    // CONDITION 1: THE RUN'S OWN KEY. A supervisor acting for the run does not count, and a run with no key never asks.
    if (asked.key === 'the-run-has-none') {
      return {
        outcome: 'not-the-agent',
        says:
          `Run ${asked.run} was given no run key, so no ask can be proved to come from it, and nothing was typed into ${into}. ` +
          "Only a run the person opened with the person's key holds a key of its own; ask the person in the chat instead.",
        next: null,
      }
    }
    if (asked.key === 'another') {
      return {
        outcome: 'not-the-agent',
        says:
          `This ask did not carry run ${asked.run}'s own key, so nothing was typed into ${into}. Only the agent working in ` +
          'that run may ask for a quick input, with the key the office gave its terminal as MOLE_AGENT_KEY.',
        next: null,
      }
    }
    // CONDITION 2: THE INPUT IS ON THE OWNER'S LIST, EXACTLY AS WRITTEN THERE.
    const list = theQuickInputListAsStored().reading
    if (list.state !== 'set') {
      return {
        outcome: 'no-list',
        says: `${theNoQuickInputListSentence()} Nothing was typed into ${into}. Only the person sets the list; until there is one, ask the person in the chat.`,
        next: null,
      }
    }
    if (!list.inputs.includes(asked.input)) {
      return {
        outcome: 'not-on-the-list',
        says:
          `"${asked.input}" is not on the owner's list of quick inputs, so nothing was typed into ${into}. The list holds ` +
          `${list.inputs.map((one) => `"${one}"`).join(', ')}, and an input is typed only exactly as it is written there.`,
        next: null,
      }
    }
    // CONDITION 3: NOTHING TYPED FOR THIS AGENT IN THE LAST TEN MINUTES.
    const waiting = theNextTimeFor(aliases.everyIdOf(agentId), nowMs)
    if (waiting !== null) {
      const next = asAStampNotBefore(waiting.atMs)
      return {
        outcome: 'too-soon',
        says:
          `${waiting.known ? 'An input was typed' : 'An input may have been typed (the office cannot tell)'} for this agent at ` +
          `${localStamp(new Date(waiting.lastMs))}, less than ${THE_MINUTES} ago, so nothing was typed into ${into}. Ask ` +
          `again at ${next} or later.`,
        next,
      }
    }
    const next = asAStampNotBefore(nowMs + ONE_QUICK_INPUT_EVERY_MS)
    return {
      outcome: 'typed',
      says: `"${asked.input}" was typed into ${into}, and Enter after it. The next input may be typed for this agent at ${next}.`,
      next,
    }
  }
  const id = anOfficeId()
  const kept = sqlite.transaction(() => {
    const { outcome, says, next } = decide()
    sqlite
      .prepare(
        'INSERT INTO quick_input_asks (id, at_ms, agent_id, run, terminal, input, outcome, says, asked_by_kind, asked_by_id, proved_by) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, nowMs, agentId, asked.run, asked.terminal, asked.input, outcome, says, asked.askedBy.kind, asked.askedBy.id, asked.askedBy.provedBy)
    return next
  })()
  return { ask: theAskWithId(id), nextAllowedAt: kept }
}

/** The outcomes a typed ask can be changed to once the holder has answered, or has given no answer the office can read. */
export type WhatTheHolderMadeOfIt = Extract<QuickInputOutcome, 'not-typed' | 'typed-without-enter' | 'unknown'>

/** CHANGE A TYPED ASK'S OUTCOME after the holder did not type it all, with the sentence the asker is answered with. */
export function changeTheOutcome(id: string, outcome: WhatTheHolderMadeOfIt, says: string): QuickInputAsk {
  const changed = sqlite.prepare("UPDATE quick_input_asks SET outcome = ?, says = ? WHERE id = ? AND outcome = 'typed'").run(outcome, says, id)
  if (changed.changes !== 1) throw new Error(`The quick input ask ${id} is not a typed ask, so its outcome was not changed to ${outcome}.`)
  return theAskWithId(id)
}
