// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER A HAND-OVER WAKES THE SESSION AT ONCE, AFTER A BURST, OR NOT AT ALL.
 *
 * The kit's waiter.sh wakes a session by writing "=== waiter handed over" into its out file. Before 7 November
 * 2026 it wrote that line for every hand-over, and a group's chatter woke an agent for each message. Now the
 * waiter tool, run with --kept-by-the-kit, prints one line saying which of three answers a hand-over has, and
 * waiter.sh acts on it:
 *   now            a message in it is from a person, or is an emergency, or could not be read. It wakes at once.
 *   nobody         every message in it went to a group, and none of them names this agent. It does not wake;
 *                  the session reads it at its next wake.
 *   after-a-burst  anything else. waiter.sh gathers the hand-overs that follow and wakes once, when a quiet
 *                  time passes with nothing new, or a longest time after the first.
 *
 * A MESSAGE NAMES THE AGENT by the office's own reading of an @ (whoAMessageMentions in src/shared/groups.ts),
 * the reading that decides who in a group is delivered a message: by the agent's handle, by the name the chat
 * draws, or by an @ before one of the words that name every member (EVERYONE_MENTION_WORDS in the same file). A
 * line the office delivers only to some members of a group (`deliveredOnlyTo`) names each of them.
 *
 * WHEN THE AGENT'S NAME CANNOT BE READ, every group message counts as naming it. A wake too many is better than
 * a message that wakes nobody when it should have.
 *
 * A MESSAGE THAT COULD NOT BE READ wakes at once, because nothing here knows who sent it or where it went.
 */

/** The start of the line the waiter tool prints and waiter.sh reads. The answer follows it. */
export const THE_WAKE_LINE = 'hand-over wakes: '

/**
 * @typedef {{ read: boolean, sentBy: unknown, toGroup: unknown, words: unknown, deliveredOnlyTo: unknown, urgent: boolean }} AHandedOverMessage
 * `read` is false when the office did not hand back the message's record. The rest are as the record stores them.
 */

/**
 * @param {readonly AHandedOverMessage[]} messages the messages of one hand-over
 * @param {() => Promise<{ who: { kind: 'agent', id: string }, handle: string, name: string } | null>} whoIAm
 *   the agent this hand-over is for, asked only when the answer turns on it; null when it could not be read
 * @returns {Promise<'now' | 'after-a-burst' | 'nobody'>}
 */
export async function whenAHandOverWakes(messages, whoIAm) {
  // A PERSON IS 'person' AMONG THE OFFICE'S PARTICIPANT KINDS (PARTICIPANT_KINDS in src/shared/participants.ts).
  if (messages.some((one) => !one.read || one.urgent || aKindOf(one.sentBy) === 'person')) return 'now'
  if (!messages.every((one) => typeof one.toGroup === 'string' && one.toGroup !== '')) return 'after-a-burst'
  const me = await whoIAm()
  if (me === null) return 'after-a-burst'
  // LOADED HERE AND NOT AT THE TOP, because it takes about half a second and most hand-overs never need it.
  const { whoAMessageMentions } = await import('../src/shared/groups.ts')
  const namesMe = (one) => {
    if (Array.isArray(one.deliveredOnlyTo) && one.deliveredOnlyTo.some((who) => aKindOf(who) === me.who.kind && who.id === me.who.id)) return true
    const said = whoAMessageMentions(typeof one.words === 'string' ? one.words : '', [me])
    return said.everyone || said.who.length > 0
  }
  return messages.some(namesMe) ? 'after-a-burst' : 'nobody'
}

function aKindOf(who) {
  return typeof who === 'object' && who !== null ? who.kind : undefined
}
