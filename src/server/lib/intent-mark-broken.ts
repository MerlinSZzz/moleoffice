// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE "MARK BROKEN" PRESS: THE PERSON SAYS AN AGENT'S REPLY BROKE THE MARK ON THEIR MESSAGE.
 * The marks are in src/shared/intent-mark.ts: "just ask" asks the agent to answer and
 * change nothing, "proposal first" asks it to come back with a proposal and build nothing until the person says yes.
 *
 * The press is on the agent's reply, and it names the marked message the reply answers. Nothing here works out which
 * message a reply answers: the person's page knows which one it drew the reply under, and a guess could file a problem
 * about a message the person never meant.
 *
 * ONE PRESS FILES ONE PROBLEM AND TELLS THE AGENT ONCE. The problem names the message, the mark and the reply, in its
 * words and in `extra.intentMarkBroken`, and is filed as the person's own record. The agent is told in a line from
 * Mole Office to it alone, which wakes it, so its next hand-over carries it. Both are written together or not at all.
 * A second press on the same reply files nothing and answers with the problem the first one filed.
 *
 * A SECRETARY HOLDING THE PERSON'S GRANT MAY PRESS IT FOR THEM where this office's list of what the grant carries says
 * so (src/server/api/messages.ts asks). The mark is still the person's, so the press is about their message; the
 * problem is filed by the secretary under the grant, and its words and the agent's line say the secretary pressed it
 * for the person, never that the person did.
 */

import { sqlite } from '../db/client.ts'
import { moleOffice, type ParticipantRef } from '@shared/participants.ts'
import { sameParticipant } from '@shared/messages.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { anIntentThatAsks, theFlagsOf, theNameOfTheMark, THE_PART_NAMED_IS_NOT_ON_THE_MESSAGE, whatTheMarkAsks, type AnIntentThatAsks, type AMarkedPartOnTheWire, type IntentMark, type TheFlagsOfAPerson } from '@shared/intent-mark.ts'
import { writeASystemLineToOne } from './groups.ts'
import { readMessageWhereverItIs } from './messages.ts'
import { readParticipant } from '../db/read-participant.ts'
import { createRecordWithReport, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'

/** Mole Office, writing its line to the agent. The problem itself is the person's. */
function theOffice(): Actor { return { type: 'system', id: moleOffice().id } }
/** The key under the problem's `extra` that holds the press's facts. */
export const THE_PRESS_ON_A_PROBLEM = 'intentMarkBroken'

/** What the press did. */
export interface TheMarkBrokenPress {
  problem: string
  filed: boolean
  /** The line that told the agent, or null because this press told nobody (a second press). */
  told: string | null
  says: string
}

/** The problem an earlier press on this reply filed, or null because none has. */
function theProblemThisReplyAlreadyHas(reply: string): string | null {
  const row = sqlite
    .prepare(
      "SELECT id FROM records WHERE kind = 'problem' AND deleted_at IS NULL " +
        `AND json_extract(data, '$.extra.${THE_PRESS_ON_A_PROBLEM}.reply') = ? ORDER BY created_at, rowid LIMIT 1`,
    )
    .get(reply) as { id: string } | undefined
  return row === undefined ? null : row.id
}

/** An agent's handle, for the problem's words, or its stored id when no row answers to it. */
function theAgentsName(agent: ParticipantRef): string {
  const row = readParticipant(agent)
  return row !== null && 'handle' in row && typeof row.handle === 'string' ? row.handle : agent.id
}

/** The secretary that pressed it for the person under their grant, or null because the person pressed it. */
function theSecretaryUnderTheGrant(actor: Actor): string | null {
  return actor.elevationUsed === true ? actor.id : null
}

/**
 * FILE THE PRESS. `actor` is the person, already proved by the door, or a secretary the person's grant carried there.
 * `workspaceId` is the project the problem is filed in: the one the page stands in. Every refusal is asked before
 * anything is written.
 */
export function fileAMarkBrokenPress(replyId: string, markedId: string, actor: Actor, workspaceId: string, part?: number): TheMarkBrokenPress {
  const reply = readMessageWhereverItIs(replyId)
  const marked = readMessageWhereverItIs(markedId).message
  const agent = reply.message.sentBy
  if (agent === null || agent.kind !== 'agent') {
    throw new PanelError(
      `"Mark broken" is pressed on an agent's reply, and message ${replyId} was not written by an agent. Nothing was written.`,
    )
  }
  if (marked.sentBy === null || marked.sentBy.kind !== 'person') {
    throw new PanelError(
      `Message ${markedId} was not written by the person, so it carries no mark of theirs. Nothing was written.`,
    )
  }
  // A PRESS MAY NAME ONE PART BY ITS PLACE. It names the run the person marked and the flag that run carries; the
  // message's own mark need not ask anything, because a message with parts has no whole mark. A place with no part is
  // refused, and a press with no place works as it always did.
  const parts = Array.isArray(marked.markedParts) ? marked.markedParts : []
  const named: AMarkedPartOnTheWire | null = part === undefined ? null : parts[part] ?? null
  if (part !== undefined && named === null) throw new PanelError(THE_PART_NAMED_IS_NOT_ON_THE_MESSAGE, 400)
  const intent = marked.intent ?? null
  if (named === null && !anIntentThatAsks(intent)) {
    throw new PanelError(
      `Message ${markedId} carries no mark that asks anything ("just ask" or "proposal first"), so no reply can break ` +
        'one. Nothing was written.',
    )
  }
  if (!marked.deliveries.some((one) => sameParticipant(one.to, agent))) {
    throw new PanelError(
      `Message ${markedId} was not given to the agent that wrote ${replyId}, so ${replyId} is not a reply to it. ` +
        'Nothing was written.',
    )
  }
  if (reply.message.sentAt < marked.sentAt) {
    throw new PanelError(
      `Message ${replyId} was written before message ${markedId}, so it is not a reply to it. Nothing was written.`,
    )
  }
  const already = theProblemThisReplyAlreadyHas(replyId)
  if (already !== null) {
    return {
      problem: already,
      filed: false,
      told: null,
      says: `"Mark broken" was already pressed on this reply, so nothing new was written. The problem is ${already}.`,
    }
  }
  // THE PERSON'S OWN WORDS FOR THE FLAG, and the instruction this message was actually handed with (reading 1).
  // The message read carries both; the flag's name is read from the sender's row once here.
  const flags = theSendersFlags(marked.sentBy)
  const flagName = named === null
    ? theNameOfTheMark(intent as AnIntentThatAsks, flags)
    : named.name
  const asks = named === null
    ? marked.whatTheMarkAsks ?? whatTheMarkAsks(intent, flags) ?? ''
    : named.whatItAsks ?? ''
  return sqlite.transaction((): TheMarkBrokenPress => {
    const problem = fileTheProblem(replyId, markedId, intent, flagName, asks, agent, actor, workspaceId, named, part)
    const line = writeASystemLineToOne(
      agent,
      reply.inProject,
      SYSTEM_LINES.theIntentMarkWasBroken(replyId, markedId, asks, problem, theSecretaryUnderTheGrant(actor)),
      theOffice(),
      { message: replyId },
      { [THE_PRESS_ON_A_PROBLEM]: { message: markedId, intent, reply: replyId, problem } },
    )
    return {
      problem,
      filed: true,
      told: line.id,
      says: `Filed problem ${problem}, and Mole Office told ${theAgentsName(agent)} in a line to it alone.`,
    }
  })()
}

/**
 * THE SENDER'S FLAGS, read from their own row once for this press, or null because their row no longer answers. The
 * press names the flag by the person's words for it, so a renamed flag is named as the person sees it.
 */
function theSendersFlags(sentBy: ParticipantRef): TheFlagsOfAPerson | null {
  if (sentBy.kind !== 'person') return null
  const row = readParticipant(sentBy)
  return row !== null && 'chatLabels' in row ? theFlagsOf(row.shippedFlags, row.chatLabels) : null
}

/** The problem record, as the person's own, or as the secretary's under the person's grant. Its id. */
function fileTheProblem(
  replyId: string,
  markedId: string,
  intent: IntentMark | null,
  flagName: string,
  asks: string,
  agent: ParticipantRef,
  actor: Actor,
  workspaceId: string,
  named: AMarkedPartOnTheWire | null,
  part: number | undefined,
): string {
  const name = theAgentsName(agent)
  const secretary = theSecretaryUnderTheGrant(actor)
  const made = createRecordWithReport({
    workspaceId,
    kind: 'problem',
    title: `${name}'s reply broke the person's "${flagName}" mark`,
    data: {
      symptom: [
        named === null
          ? `The person marked message ${markedId} "${flagName}".${asks === '' ? '' : ` The mark said: ${asks}`}`
          : `The person marked the words "${named.quote}" at characters ${String(named.from)} to ${String(named.to)} in message ${markedId} "${flagName}".${asks === '' ? '' : ` The mark said: ${asks}`}`,
        `Agent ${name} answered it with message ${replyId}.`,
        secretary === null
          ? 'The person pressed "mark broken" on that reply.'
          : `The secretary "${secretary}" pressed "mark broken" on that reply for the person, under their grant.`,
      ].join('\n'),
      state: 'open',
      found_by:
        secretary === null
          ? 'the person, with the "mark broken" press on the reply'
          : `the secretary "${secretary}", pressing "mark broken" for the person under their grant`,
      whose_move: 'agent',
      extra: {
        [THE_PRESS_ON_A_PROBLEM]: {
          message: markedId,
          intent,
          reply: replyId,
          agent: { kind: agent.kind, id: agent.id },
          ...(named === null
            ? {}
            : {
                part: {
                  index: part,
                  from: named.from,
                  to: named.to,
                  quote: named.quote,
                  ...(named.intent === undefined ? {} : { intent: named.intent }),
                  ...(named.label === undefined ? {} : { label: named.label }),
                  name: named.name,
                  asks,
                },
              }),
        },
      },
    },
    actor,
  })
  return made.record.id
}
