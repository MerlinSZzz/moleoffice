// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A RUN IS TOLD, AND NOTHING ELSE REACHES IT.
 *
 * The prompt names the API, the agent, the message and its sender. The agent's key is handed over
 * separately in MOLE_AGENT_KEY. No key value is written into this string.
 *
 * THE ACTOR HEADERS ARE IN THE PROMPT AND NOT IN THE ENVIRONMENT. No agent tool reads an
 * environment variable to find out who to say it is, so putting them there would be two settings
 * nothing declares and nothing reads. The rules file in the working directory carries the rest —
 * see `src/worker/rules.ts`.
 */

import { THE_BRIEF_HEADING, THE_BRIEF_IS_A_SNAPSHOT } from '@shared/briefing.ts'
// THE EMERGENCY MARK uses the shared page word for the prompt and the handle tool.
import { firstInQueueMark, deliveryEnvelope, theMessageAnAgentReads, type TheGroupOfAHandOver } from '@shared/messages.ts'
import type { AMarkedPartOnTheWire } from '@shared/intent-mark.ts'
import type { Context } from '@shared/targets.ts'

/** What the prompt needs to know about the message being delivered. */
export interface Delivering {
  /** The handle of the agent this run is, which is the actor id it writes under. */
  agent: string
  /**
   * THE AGENT'S OWN KEY, sent as `x-mole-office-key` on every request this run makes. Criterion P83,
   * point 5 and M81.
   *
   * The value is used only to decide whether to name MOLE_AGENT_KEY; it is never printed.
   * ABSENT MEANS THE OFFICE WAS GIVEN NONE, and the prompt then says nothing about a key rather than
   * naming an empty one. It is never the key of whoever started the run: a run speaks as the agent it
   * serves and never as its starter, so the worker gives it the key bound to `agent` above.
   */
  key?: string | null
  /** The project it is working in. */
  workspace: string
  /** Where the message was written, as the queue said it, or null when it holds no mark. */
  writtenIn?: { project?: string; page?: string } | null
  /** Where the API is. */
  api: string
  /** The message record's id, so the run can read the whole thing and answer against it. */
  messageId: string
  /** What the message says. */
  body: string
  quotes?: readonly Context[]
  quotePositions?: readonly number[] | null
  /** Who sent it, in the words the office read from its registries (`DELIVERY_ENVELOPE.theSender`). */
  from: string
  /**
   * HOW THE SENDER ASKS TO BE ADDRESSED, in the words the office handed over, or null or absent
   * because the sender set no part or the office said nothing.
   */
  addressTheSender?: string | null
  /**
   * THE GROUP THE MESSAGE WAS SENT TO, as the office handed it over, or null or absent because it was sent to no group,
   * as item 5 of a decision says. With it, the envelope's first line names the group and asks
   * for the answer there.
   */
  fromGroup?: TheGroupOfAHandOver | null
  /** True when this is picking a conversation up rather than starting one. */
  carryingOn: boolean
  /**
   * TRUE WHEN THIS MESSAGE WAS SENT AS AN EMERGENCY. Criterion M62.
   *
   * It is on the queue row the worker took, so nothing here works it out. What it changes is the
   * first line of the prompt: a run that does not know it was started for an emergency answers it
   * as an ordinary message, which is the half of M62 that a runtime nobody can interrupt still gets.
   */
  urgent?: boolean
  /**
   * THE ROUTED LINE, WHEN THIS RUN'S RECIPIENT IS ONE THE ROUTING CHOSE.
   *
   * The message's addressee could not be reached, so the office also gave the words to the first
   * reachable participant up its chain of starters — and this run serves that participant. The line
   * is built once by `theRoutedLine` and read here from the queue row, so the prompt prints the
   * office's own words and never builds them again. Null when this recipient is the addressee.
   */
  routedLine?: string | null
  /**
   * THE PERSON'S MARK ON THE MESSAGE, as its record holds it, or absent. `deliveryEnvelope` turns it into the
   * envelope's last line, the one the waiter and the hooks hand over, and writes nothing for no mark.
   */
  intent?: unknown
  /** The person's own label on the message, as the message read gives it, or absent for no label. */
  label?: unknown
  /** The instruction the office handed over for the mark, or absent because there is none. */
  whatTheMarkAsks?: string
  /** The instruction the office handed over for the person's own label, or absent because there is none. */
  whatTheLabelAsks?: string
  /** The parts the office handed over, in order, or absent because the message has none. */
  markedParts?: readonly AMarkedPartOnTheWire[]
  /** The person's own name for "No mark", for the rest line a message with marked parts prints. */
  noMarkName?: string
  /**
   * HOW TO TAKE SOMEBODY TO A PAGE, in the skill's own words.
   *
   * Criterion M23. It is read out of the Mole Office skill by `howToLead` in ./rules.ts and passed
   * in rather than written here, so the skill and the prompt cannot say two different things about
   * the one act. Nothing else in this file quotes it and nothing here paraphrases it.
   */
  howToLead: string
  /**
   * WHERE THE FILE SAYING WHAT THIS AGENT ALREADY KNOWS WAS WRITTEN, and one line about it.
   *
   * Criterion H3. A run is a fresh process that has never heard of the work; this is how it finds
   * out. Null when Mole Office could not gather it, and the prompt then says so rather than naming
   * a file that is not there — a run told to read a missing file spends its first act on an error.
   */
  knows: { path: string; say: string } | null
  /**
   * THE STATE OF THE PROJECT, as `GET /api/brief` wrote its own opening. Criterion I2.
   *
   * Null when the brief could not be read, and the prompt then says so. It is here rather than in
   * the rules file because a rules file can be dropped for being too long and nothing says it was:
   * Codex 0.147.0 reads a project document only up to `project_doc_max_bytes`, 32,768 by default,
   * and the file this repository writes is 115 bytes under that. The prompt is the one thing every
   * tool the worker starts is given whatever else it reads.
   */
  brief: string | null
  /**
   * WHY THE GENERAL RULES WERE NOT WRITTEN FOR THIS RUN, as `writeRulesInto` in ./rules.ts said it.
   *
   * Set only when the run starts without them: another `CLAUDE.md` is in the folder, the folder
   * cannot be written, or the `AGENTS.md` write was refused with EACCES, EPERM or EROFS, in an
   * installation and in a developer checkout alike. Message TxINgmO9H6gu: such a run still starts,
   * and its start says plainly that the rules are missing and why. The prompt says it because the
   * rules file is the thing that is missing, so only the prompt can. Absent or null leaves the
   * prompt as it was.
   */
  rulesNotWritten?: string | null
}

/** The prompt for one run. */
export function promptFor(what: Delivering): string {
  const lines: string[] = []
  // AN EMERGENCY SAYS SO IN THE FIRST LINE OF THE PROMPT. Criterion M62: this run was started for a
  // message that went in front of everything else
  // waiting for this agent, and the run is the only thing that can act on knowing that.
  if (what.urgent === true) {
    lines.push(`${firstInQueueMark()} — AN EMERGENCY MESSAGE, put in front of everything else waiting for you.`)
    lines.push('')
  }
  // THE BRIEF FIRST, AND IT OPENS WITH THIS AGENT'S OWN NOTEBOOK. Criterion N4: a run on another model
  // gets back how to work with the person and its own character at once. `theNotebookOpening` in
  // src/shared/notebook.ts is the first thing inside the brief's opening, so this is where a
  // started run meets its notebook: before the message, before the headers, before anything.
  //
  // IT WAS FOURTH UNTIL 11 SEPTEMBER 2026, under the message framing and the headers. Both are
  // still here, one paragraph lower. The emergency mark above stays first because it is one line
  // saying this message jumped the queue (criterion M62) rather than content.
  if (what.brief === null) {
    lines.push('MOLE OFFICE DID NOT ANSWER THE BRIEF for this run, so nothing here says what this project is,')
    lines.push('and nothing handed you your notebook. Ask GET /api/brief yourself before you answer, and say so')
    lines.push('if it does not answer you either.')
  } else {
    lines.push(THE_BRIEF_HEADING)
    lines.push('')
    lines.push(THE_BRIEF_IS_A_SNAPSHOT)
    lines.push('')
    for (const line of what.brief.split('\n')) lines.push(`  ${line}`)
  }
  lines.push('')
  // AND WHEN THE GENERAL RULES WERE NOT WRITTEN, the same place says so, with the worker's reason. No door
  // serves the user part, so the one named is the door to the chapters.
  if (typeof what.rulesNotWritten === 'string' && what.rulesNotWritten !== '') {
    lines.push('MOLE OFFICE DID NOT WRITE THE GENERAL RULES for this run, so you were not given them. Why, as the worker said it:')
    lines.push(`  ${what.rulesNotWritten}`)
    lines.push('The chapters of the office regulations can still be read: ask GET /api/office-regulations/chapters, and read')
    lines.push('the chapter your work touches before you do it.')
    lines.push('')
  }
  lines.push(
    what.carryingOn
      ? 'A new message has arrived for you in Mole Office, in the conversation you are already in.'
      : 'Somebody has sent you a message in Mole Office, the tracker this project runs on.',
  )
  lines.push('')
  lines.push(`Mole Office is at ${what.api}. Read GET /api first, then GET /api/kinds before you write anything.`)
  lines.push('Send these headers on every request, reads included:')
  lines.push(`  x-mole-office-workspace: ${what.workspace}`)
  lines.push('  x-mole-office-actor-type: agent')
  lines.push(`  x-mole-office-actor-id: ${what.agent}`)
  // THE AGENT'S OWN KEY, WHEN THE OFFICE WAS GIVEN ONE. Criterion P83, point 5 and M81. The run is
  // the agent it serves and nobody else: this is that agent's key and never the key of whoever
  // started the run. A request carrying it is this agent and no more, so it may not act as the
  // person and may not give itself a card.
  if (what.key !== undefined && what.key !== null && what.key !== '') {
    lines.push('  x-mole-office-key: read your own key from the MOLE_AGENT_KEY environment variable.')
  }
  lines.push('')
  if (what.key !== undefined && what.key !== null && what.key !== '') {
    lines.push('That key is your own agent\'s and never the key of whoever started you. Send it on every')
    lines.push('request, reads included. Never print it or put it in a command line, .env, a record or a file in this repository.')
    lines.push('')
  }
  // THE ENVELOPE, DECLARED ONCE IN shared/messages.ts AND COPIED BY EVERY HAND-OVER. Criterion M34
  // says what it holds: who sent it, which project it is in, and which message it is.
  // A FOURTH LINE SAYS WHEN THIS RUN GOT THE WORDS BECAUSE THE ADDRESSEE COULD NOT BE REACHED.
  // AND A LINE SAYING HOW THE SENDER ASKS TO BE ADDRESSED, right after who sent it, only when the
  // sender set a part.
  lines.push(
    ...deliveryEnvelope({
      // THE GROUP LINE FIRST, when the message was sent to a group, as item 5 of a decision
      // says.
      fromGroup: what.fromGroup ?? null,
      from: what.from,
      addressTheSender: what.addressTheSender ?? null,
      // WHERE THE MESSAGE WAS WRITTEN. The worker's own project is not where it was said.
      writtenIn: what.writtenIn ?? null,
      message: what.messageId,
      routedLine: what.routedLine,
      intent: what.intent,
      label: what.label,
      whatTheMarkAsks: what.whatTheMarkAsks,
      whatTheLabelAsks: what.whatTheLabelAsks,
      body: what.body,
      markedParts: what.markedParts,
      noMarkName: what.noMarkName,
    }),
  )
  lines.push('')
  for (const line of theMessageAnAgentReads(what.body, what.quotes ?? [], what.quotePositions ?? null).split('\n')) lines.push(`  ${line}`)
  lines.push('')
  // WHAT THIS AGENT ALREADY KNOWS, BEFORE WHAT IT IS BEING ASKED TO DO. Criterion H3, and the order
  // matters: a run that reads the question first answers from nothing, because nothing else has
  // arrived yet.
  if (what.knows === null) {
    lines.push('MOLE OFFICE COULD NOT GATHER WHAT YOU ALREADY KNOW for this run, so you are starting from this')
    lines.push('message alone. Say so if the answer needed something you have no way to see.')
  } else {
    lines.push('WHAT YOU ALREADY KNOW is in this file, and reading it first is the point of it being here:')
    lines.push('')
    lines.push(`  ${what.knows.path}`)
    lines.push('')
    lines.push(`  ${what.knows.say}`)
  }
  lines.push('')
  lines.push('WHAT HAPPENS TO WHAT YOU SAY. The last thing you print is filed as your reply in this')
  lines.push('conversation and the person sees it in the chat panel. So write it for them to read: plain')
  lines.push('language, one idea per sentence, the conclusion first. A record id the office knows or a page path')
  lines.push('in it becomes a link they can follow with one press, so name the record rather than describing it.')
  lines.push('')
  lines.push('IF YOU DID SOMETHING, PUT IT IN MOLE OFFICE. Work left only in this run is lost when the run')
  lines.push('ends. Your reply says what you did; the records are where it lives.')
  lines.push('')
  lines.push('IF YOU COULD NOT DO IT, SAY SO. An answer that describes what would probably have happened is')
  lines.push('worse than one that says what stopped you.')
  lines.push('')
  // AND HOW TO TAKE SOMEBODY TO A PAGE, in the skill's words and not in this file's.
  lines.push(what.howToLead)
  return lines.join('\n')
}
