// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER A STORED WRITER STAMP NAMES THIS CALLER: the two halves of a stamp, `sameAgent`, the writer a stamp
 * names, and the names a caller may write. They were moved out of src/server/lib/records.ts with no change of
 * behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`. This file does not import records.ts.
 */
import { named } from '@shared/named.ts'
import { everyAgentAStoredStampCouldName } from '../../db/every-agent-a-stored-stamp-could-name.ts'
import { participantForActor } from '../participant-for-actor.ts'
// WHICH AGENTS ONE STRING COULD NAME, AND WHICH AGENT ONE STORED ID NAMES. Piece I-1's two
// readings, read here rather than written again: `sameAgent` below is the whole of this file's
// identity work and it is built out of them. Taken from lib/participants.ts, which re-exports the
// row read from lib/agent-references.ts, as a type only, so it is no import edge at run time.
import type { AgentIdentity } from '../participants.ts'
import { theAgentAStoredIdNames } from '../the-agent-a-stored-id-names.ts'
import type { Actor } from './actor.ts'

/**
 * A STORED ACTOR STAMP: the two halves a `changes` or `revisions` row keeps, exactly as they arrived.
 *
 * ---------------------------------------------------------------------------------------
 * A STAMP IS FREE TEXT, AND THAT IS THE WHOLE REASON THIS SECTION EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * `changes.actor_id` and `revisions.actor_id` are never resolved against the registry before they
 * are stored. Migration 0168 says so in its own words: *"`changes.actor_id` and `revisions.actor_id`
 * keep exactly what they are: the name the request's headers gave."* So a stamp holds an agent's id
 * on one row and the same agent's handle on the next, and which of the two it is cannot be told by
 * looking at it.
 *
 * THIS IS NOT WHAT `message_delivery.recipient_id` OR `group_members.member_id` ARE. Those really
 * are always ids, and criterion I2's first sentence is that a stored id resolves by exact id and by
 * nothing else, for ever. `theAgentAStoredIdNames` in lib/participants.ts is that reading and this
 * one is not it. Nothing here touches those columns.
 */
export interface StoredActorStamp {
  actorType: string
  actorId: string
}

/**
 * THE TWO HALVES OF A `"<type>:<id>"` STAMP, split at the FIRST colon.
 *
 * `whoWroteRecord` in lib/revisions.ts joins the two halves into one string, and the annotation
 * guard in records/patching.ts is the caller that needs them apart again. The split is at the first
 * colon because an actor id may hold one — `tools/isolated-mole-office.mjs` is on the list of ids
 * that need no registration, and a path-shaped id with a colon in it would be cut in the wrong place
 * by a split that took the last one. A string with no colon at all is a type of `''`, which matches
 * no actor type, so it can never be read as somebody.
 */
export function theTwoHalvesOfAStamp(stamp: string): StoredActorStamp {
  const at = stamp.indexOf(':')
  if (at < 0) return { actorType: '', actorId: stamp }
  return { actorType: stamp.slice(0, at), actorId: stamp.slice(at + 1) }
}

/**
 * IS THE ACTOR ASKING THE ONE A STORED STAMP NAMES? The one reader the five guards in records.ts share.
 *
 * ---------------------------------------------------------------------------------------
 * WHY `===` WAS NOT ENOUGH, AND IT BROKE IN TWO DIRECTIONS
 * ---------------------------------------------------------------------------------------
 *
 * Five guards compared a stored stamp with `actor.id` by exact string. That worked only while every
 * agent's id was its own handle, so the name on an old row and the name on today's request were the
 * same characters. Criterion I2 ends that, and both breakages are silent:
 *
 *   AN AGENT LOSES ITS OWN PAST. It wrote under its handle `bar`; it comes back under its minted id
 *   `m9y`; `===` says no; it can no longer withdraw its own ask or reclassify its own fork. The
 *   refusal reads exactly like an ordinary permission refusal, so nobody looks.
 *
 *   AN AGENT INHERITS SOMEBODY ELSE'S PAST. After piece I-2 frees a handle, a new agent registers
 *   under a retired agent's name `foo` and sends it as `x-mole-office-actor-id`. That string is
 *   exactly the retired agent's legacy id — the string stored on everything it ever wrote — so
 *   `===` says yes, and the new agent could withdraw the retired one's ask and reclassify its fork
 *   by nothing more than taking its name. Durable identity must therefore be checked before such writes are allowed.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIVE ANSWERS, IN ORDER
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE LIVE SIDE RESOLVES THROUGH I-1'S RESOLVER, by way of `participantForActor`. Where the
 *      caller's own name means two agents that reader raises I-1's 409, and this lets it through:
 *      a caller that is ambiguous about itself is not somebody a guard may guess at.
 *   2. THE STORED SIDE RESOLVES BY `everyAgentAStoredStampCouldName` above.
 *   3. EXACTLY ONE AGENT ON THE STORED SIDE AND IT IS THE LIVE ONE: the same.
 *   4. EXACTLY ONE AGENT AND IT IS A DIFFERENT ONE: not the same.
 *   5. MORE THAN ONE ON THE STORED SIDE: not the same. FAIL CLOSED. A question that grants a right is
 *      answered no when it is ambiguous — invariant 2, no silent semantic fallback, and invariant 5,
 *      absence beats a guess. It is the opposite of a READ door, which may draw a retired agent with
 *      its retirement date, because a read shows something and this grants something.
 *   6. NONE ON THE STORED SIDE: not the same, unless the caller is nobody the office can place
 *      either — the named last resort in the body below, which is the one branch of this function
 *      that does not resolve.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE OFFICE CAN PLACE NEITHER SIDE, TWO NAMES ARE TWO STRINGS
 * ---------------------------------------------------------------------------------------
 *
 * THE RULE IN ONE SENTENCE: if the office can place either side it must place both, and they must be
 * the same agent; if it can place neither, the two names are compared as the strings they are —
 * both halves, the actor TYPE as well as the id, because that is what these guards compared before
 * an agent's id stopped being its handle.
 *
 * WHY THE EXCEPTION IS NOT A HOLE. Every way an agent can inherit somebody else's past runs through a
 * REGISTRY ROW — a freed handle is a registry thing — so the stored side names exactly one agent and
 * the comparison above is a resolved one. A caller the office cannot place can never send a string
 * that names an agent, because naming an agent is what being placed means. And a caller it CAN place
 * can never claim a stamp it cannot place, because the stored side is empty and the live side is not.
 * So *an unregistered writer owns nothing* stays true of everybody the office can place, in both
 * directions, which is the half of it that guards anything.
 *
 * WHY THE EXCEPTION IS NEEDED. `AGENT_IDS_THAT_NEED_NO_REGISTRATION` in @shared declares nine writers
 * that no registry row holds, on purpose: this server's own writer, its message worker, the session
 * hook, the browser app, the dev supervisor, the isolated-world tool, the agent worker, the world
 * sweep and the browser test harness of this checkout. Without this line the office's own writer
 * could put a question on the person's queue and never withdraw it, and the message worker could not
 * name itself in a decision it made. That is the
 * F1 rule applied to identity — name the identity, never refuse it solely for that reason — and it
 * is what main does today.
 *
 * IT IS DECLARED RATHER THAN SILENT, which is what invariant 2 asks: the fallback is named here, it
 * is one line, and it fires only when BOTH readings come back empty.
 *
 * THIS IS A RULED CHANGE, NOT A CONVENIENCE. The brief for this piece said *no agent at all on the
 * stored side: not the same*, with no exception. Building that sentence literally turned twelve tests
 * in four files red, every one of them an ordinary write by a writer on the list above rather than an
 * attack. The sentence was replaced with the rule above after clarification was asked, under
 * chapter 7's rule 3 as it stood then, which had an agent ask before it interpreted.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO CASES, WORKED
 * ---------------------------------------------------------------------------------------
 *
 *   An agent minted after I-1, handle `bar`, id `m9y`, wrote under `bar` and returns under `m9y`.
 *   No agent has the id `bar`; one agent has the handle `bar`; it is the live one. THE SAME. That
 *   is the case this whole piece exists for.
 *
 *   After I-2: a retired agent whose id and handle are both `foo`, and a new agent with the handle
 *   `foo` and a minted id. The stored `foo` is the retired agent's EXACT ID, so the stored side is
 *   the retired agent alone and the new one is not it. NOT THE SAME.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT ANSWERS ABOUT A PERSON TOO, THOUGH IT IS CALLED `sameAgent`
 * ---------------------------------------------------------------------------------------
 *
 * The annotation guard in records/patching.ts asks this about whoever wrote a note, and a person
 * writes notes. There is one question — *is the caller the one that wrote this* — and one place that
 * answers it, which is invariant 9. A person is compared by id alone, exactly as `participantForActor` compares one:
 * there is one person, and the id on their rows is the constant this product has always had for them.
 * The name says `agent` because the agent half is the one that needed a rule.
 *
 * @throws PanelError 409 when the CALLER's own name means two agents.
 */
export function sameAgent(stored: StoredActorStamp, actor: Actor): boolean {
  // TWO ACTOR TYPES ARE TWO ASKERS. An agent and the person may share an id
  // and are still different writers, which is the reason all four ledger guards compared
  // the type as well as the id before this function existed.
  if (stored.actorType !== actor.type) return false
  if (actor.type !== 'agent') return stored.actorId.trim() === actor.id.trim()
  const live = participantForActor(actor)
  const named = everyAgentAStoredStampCouldName(stored.actorId)

  /**
   * THE LAST RESORT, AND IT IS NAMED RATHER THAN FALLEN INTO.
   *
   * WHEN IT FIRES. Only when the office can place NEITHER name: the stored stamp answers to no
   * registry row, and neither does the name the caller is asking under. If it can place either one,
   * the branches below run and both sides must resolve to one agent.
   *
   * WHAT IT MEANS. The rule these guards had before an agent's id stopped being its handle: two
   * names are two strings, compared whole — the actor TYPE as well as the id, which the check at the
   * head of this function has already done, so a person and an agent carrying one id string never
   * meet here.
   *
   * WHO IT IS FOR, BY NAME. The nine writers on `AGENT_IDS_THAT_NEED_NO_REGISTRATION` in @shared, which
   * no registry row holds on purpose: `mole-office/the-api-server`, `mole-office/the-message-worker`,
   * `claude-code`, `vite/the-browser-app`, `mole-office/the-dev-supervisor`,
   * `tools/isolated-mole-office.mjs`, `mole-office-agent-worker`, `mole-office/the-world-sweep` and
   * `vitest/liveApp`.
   * Without this branch this server's own writer could put a question on the person's queue and never
   * withdraw it, and the message worker could not name itself in a decision it made. The F1 identity rule
   * names the identity without refusing it solely because it has no registration.
   *
   * AND NOTHING ELSE CAN REACH IT ON A WRITE. `whyAnUnregisteredAgentMayNotWrite` in
   * `records/unregistered-agent.ts` refuses every other unregistered agent id at the door, so the
   * callers that arrive here are those eight and the in-process ones the door does not ask.
   */
  if (named.length === 0 && live === null) return stored.actorId.trim() === actor.id.trim()

  if (named.length !== 1 || live === null) return false
  return named[0]!.id === live.id
}

/**
 * WHO A STORED STAMP NAMES, FOR SOMEBODY TO READ. Chapter 10 rule 1: name the agent, not the string
 * the ledger holds.
 *
 * The annotation refusal used to print the stamp itself at a reader. While every agent's id was its
 * handle that read as a name; after the mint it is a nanoid of 12, which names nobody. So an agent
 * is named by its own name and handle, and the three answers are kept apart because they are three
 * different facts and a reader has to be able to tell them:
 *
 *   ONE AGENT — the agent, named.
 *   TWO AGENTS — both of them, named, and the stored string that could mean either. The refusal that
 *     follows is a refusal BECAUSE it is ambiguous, so saying which two is the whole of the reason.
 *   NONE — nothing is hidden and nothing is invented: the stored string, said to be a string no
 *     registry row answers to.
 *
 * A PERSON AND A SYSTEM WRITER KEEP THE `<type>:<id>` FORM they have always had, and this takes the
 * JOINED stamp rather than its two halves so that form is handed back UNCHANGED rather than built
 * again out of an actor type. There is one person and their id is their name; a system writer's id is
 * the piece of machinery that wrote. Rebuilding the string here would also put an actor type into a
 * sentence with nothing reading it, which tests/the-machine-word-gate.test.ts catches and is right
 * to catch.
 */
export function theWriterAStampNames(stamp: string): string {
  const stored = theTwoHalvesOfAStamp(stamp)
  if (stored.actorType !== 'agent') return stamp
  const named = everyAgentAStoredStampCouldName(stored.actorId)
  const asName = (one: AgentIdentity): string => `${one.name} (${one.handle})`
  if (named.length === 0) {
    return `The agent "${stored.actorId}", which no registry row answers to,`
  }
  if (named.length === 1) return `The agent ${asName(named[0]!)}`
  return (
    `One of two agents — ${named.map(asName).join(' and ')}, both of which the stored name ` +
    `"${stored.actorId}" could mean —`
  )
}

/**
 * THE NAMES THIS CALLER MAY WRITE FOR ITSELF, for a refusal that has to say what would be accepted.
 *
 * An agent may name itself by its id or by its handle and be believed for either, because
 * `sameAgent` above resolves both. A refusal that offered only the string the request arrived under
 * would be true and would hide half the answer. Where the two are one string — every agent
 * registered before the mint — it is said once rather than twice.
 *
 * THE HANDLE IS OFFERED ONLY WHEN `sameAgent` TAKES IT. A handle a retired agent also bears names two
 * agents, and `sameAgent` answers no to it. Offered anyway, it sent the agent back to be refused for
 * the same name. The id is not asked: an id names one agent, so `sameAgent` always takes the caller's own.
 */
export function theNamesTheCallerMayWrite(actor: Actor): string {
  const live = participantForActor(actor)
  const row = live === null ? null : theAgentAStoredIdNames(live.id)
  if (row === null || row.handle === row.id) return `"${actor.id}"`
  if (!sameAgent({ actorType: actor.type, actorId: row.handle }, actor)) return `"${row.id}"`
  return `"${row.id}" or "${row.handle}", both of which are your own name`
}
