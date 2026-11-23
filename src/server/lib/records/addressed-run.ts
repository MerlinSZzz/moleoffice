// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ADDRESSED RUN: the identity a run gets when something addresses it, the recipient a comment
 * stores beside its choice, and the count of the office's own binding writes. They were moved out
 * of src/server/lib/records.ts with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`, and every caller still
 * imports these names from records.ts. Nothing here imports records.ts: the writes it makes come
 * from the files that own them.
 */
// HOW AN IDENTITY IS MADE FROM A RUN: the handle, the title suffix, the key the runtime is under and
// the word for a run. Taken from the migration that mints them rather than written again, so a
// handle minted at the door and one minted by the migration cannot come out differently. That module
// opens no database — it takes a connection as an argument — so importing it here starts nothing.
import { handleFromTitle, SESSION_KIND, THE_NEW_KEY, THE_TITLE_SUFFIX, whyThatIsNotAHandle } from '../../db/agent-identity.ts'
import { isJsonObject } from '../../db/the-decision-names-this-fork.ts'
// WHO A DURABLE AGENT IS, AND WHAT IS WAITING FOR IT. The handle check reads the first. Both live in
// lib/inbox.ts because that is where the inbox query is, and a guard about stranding mail should sit
// beside the thing that reads it.
import { AGENT_KIND, handlesInUse } from '../inbox.ts'
import { theAgentASessionAnswersAs } from '../messages.ts'
import { PanelError } from '../panel-error.ts'
import { type Actor } from './actor.ts'
import { createRecord } from './creating.ts'
import { patchRecord } from './patching.ts'
import { getRecord } from './reading.ts'
import { validateData } from '@shared/kinds.ts'
import { quotedUnlessAMessage } from '@shared/message-refusal-words.ts'
import { type PanelRecord } from '@shared/types.ts'
import { kindWord } from '@shared/words.ts'

// ================================================== a run that is addressed gets its identity at once

/**
 * A RUN THAT SOMETHING ADDRESSES GETS ITS DURABLE AGENT IDENTITY AT THE MOMENT IT IS ADDRESSED.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS: CHOOSING WHO A COMMENT IS FOR USED TO STOP THE SERVER COMING UP
 * ---------------------------------------------------------------------------------------
 *
 * Measured on an isolated copy on 31 August 2026. Write a comment, choose a run for it, and the
 * next server start REFUSED TO SERVE with three things a migration would have to write:
 *
 *     agents:    mint 1 durable agent identity out of the 1 run something in this corpus addressed
 *     revisions: write 1 BASELINE revision and 1 CATCH-UP revision
 *     dispatch:  file 1 under the durable identity their run worked as
 *
 * All three are the same hole. `src/server/db/agent-identity.ts` mints an identity for every run
 * the corpus addresses, binds the run to it, and files the message under it — and nothing did any
 * of that at the moment of the write, so every choice a person made left work for a migration, and
 * a database with work waiting for a migration is one a server start refuses. Under `tsx watch`
 * the next start is the next time anybody saves a server file, so one ordinary choice through one
 * ordinary door left Mole Office unable to come up. Nothing warned at the moment of the write.
 *
 * THE COMPLETING VALUES ARE ALL KNOWN AT WRITE TIME, which is why this is a door and not a
 * migration: the run is in front of us, its title makes the handle, and its `runtime` is the
 * identity's runtime.
 *
 * ---------------------------------------------------------------------------------------
 * IT WRITES THROUGH `createRecord` AND `patchRecord`, WHICH IS THE WHOLE OF THE REVISION FIX
 * ---------------------------------------------------------------------------------------
 *
 * The migration writes both records with raw SQL and leaves `migrateRevisions` to catch them up —
 * a BASELINE for the agent it made and a CATCH-UP for the run it rewrote. Both doors here keep a
 * revision themselves, because that is what those doors do. So the second condition closes without
 * anything being said about revisions at all.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT REFUSES TO INVENT
 * ---------------------------------------------------------------------------------------
 *
 * A choice naming a record that is not there, or naming something that is not a run, or naming a
 * run whose title makes no handle, gets `addressable: false` and a sentence. THE CALLER STORES
 * THAT SENTENCE AND KEEPS THE WORDS — it never refuses the write, because who a comment is for is
 * a property a person corrects afterwards and refusing throws away what they just typed. What it
 * must not do is store the choice as a run: the migration REFUSES A WHOLE CORPUS over a choice
 * naming a run that is not there, and that refusal reaches `prepareToServe` as a thrown error
 * rather than a refusal anybody can read. Measured, same day: a recipient naming `nosuchrecid`
 * made a server start throw.
 */
export type AddressedRun =
  /** What was named is itself a durable agent. Nothing was minted; it already is one. */
  | { addressable: true; namedKind: 'agent'; agentId: string; minted: false }
  /** What was named is a run, and this is the identity it works as in its own project. */
  | { addressable: true; namedKind: 'session'; sessionId: string; agentId: string; minted: boolean }
  /** Nothing durable can stand behind this choice, and this says why in one sentence. */
  | { addressable: false; why: string }

/**
 * Which durable agent a run says it worked as IN ITS OWN PROJECT, or null because none does.
 *
 * The same entry `migrateAgentIdentities` writes and `identitiesBySession` reads, read here so the
 * door and the migration agree about what "already bound" means.
 */
export function durableIdentityOfRun(session: PanelRecord): string | null {
  const ranAs = session.data['ranAs']
  if (!Array.isArray(ranAs)) return null
  for (const entry of ranAs) {
    if (!isJsonObject(entry)) continue
    if (entry['workspaceId'] !== session.workspaceId) continue
    const agentId = entry['agentId']
    if (typeof agentId === 'string' && agentId !== '') return agentId
  }
  return null
}

/**
 * The handle this run's identity takes: made from its title, with a number on the end if that one
 * is taken. `handlesInUse` is the same reader the uniqueness refusal uses, so a handle minted here
 * cannot collide with one an agent already holds or has ever held.
 */
function freeHandleFor(title: string, workspaceId: string): string {
  const base = handleFromTitle(title)
  const taken = handlesInUse(workspaceId)
  let handle = base
  let n = 1
  while (taken.has(handle)) {
    n += 1
    handle = `${base.slice(0, 40 - String(n).length - 1)}-${String(n)}`
  }
  return handle
}

/** What a run already says it ran as, in every project. Appended to, never replaced. */
function whatItRanAs(session: PanelRecord): unknown[] {
  const ranAs = session.data['ranAs']
  return Array.isArray(ranAs) ? [...ranAs] : []
}

/** Said on the identity a door made, and it names the run rather than a date. */
function summaryForAnIdentityMadeAtTheDoor(sessionId: string): string {
  return (
    `Made when something in this project was addressed to run ${sessionId}. A run that is addressed gets a ` +
    `durable identity at that moment, so what is said to it survives the run ending. Rename it if this is not ` +
    `what you meant.`
  )
}

/**
 * HOW MANY WRITES ARE THE OFFICE BINDING A RUN TO THE IDENTITY IT HAS JUST MADE FOR IT. Opened only by
 * `identityForAddressedRun`, around its one patch, and closed in a `finally`. See `whyThisCallerMayNotFileASessionFor`.
 */
export let theOfficeIsBindingARunToAnIdentityItMade = 0

export function identityForAddressedRun(sessionId: string, actor: Actor): AddressedRun {
  const record = getRecord(sessionId)
  if (record === null || record.deletedAt !== null) {
    return {
      addressable: false,
      why: `No record has the id ${sessionId}, so there is no run behind this choice.`,
    }
  }
  // ALREADY A DURABLE IDENTITY. Nothing is minted for it, and the caller stores it as the agent it
  // is. `planIdentities` reads this case the same way and calls it `already_minted`.
  if (record.kind === AGENT_KIND) {
    return { addressable: true, namedKind: 'agent', agentId: record.id, minted: false }
  }
  if (record.kind !== SESSION_KIND) {
    return {
      addressable: false,
      why: `${sessionId} is a ${kindWord(record.kind).text}${quotedUnlessAMessage(record, ' — ', ' —')} and not a run.`,
    }
  }
  // THE AGENT THIS RUN ALREADY ANSWERS AS, worked out in one place. A live handle beats a binding
  // in `ranAs`, because a run holding a live handle was once minted a
  // new identity from its title because this read only `ranAs` and the live hold was never asked.
  const answered = theAgentASessionAnswersAs(record, record.workspaceId)
  if (answered !== null) {
    return {
      addressable: true,
      namedKind: 'session',
      sessionId,
      // THE AGENT RECORD WHERE THERE IS ONE, because `ranAs` and the agent_messages columns store a
      // record id; the registry id is the fallback for a handle whose agent has no record here.
      agentId: answered.record ?? answered.agent.id,
      minted: false,
    }
  }

  const title = record.title.trim()
  const handle = freeHandleFor(title, record.workspaceId)
  const whyNot = whyThatIsNotAHandle(handle)
  if (whyNot !== null) {
    // A TITLE THAT MAKES NO ADDRESS. The migration refuses the whole corpus here; a door may not,
    // because somebody has just typed words. It says so instead, and the words are kept.
    return {
      addressable: false,
      why:
        `Run "${record.title}" (${sessionId}) cannot be given a durable identity, so nothing can be filed under ` +
        `it. ${whyNot} Rename the run and choose it again.`,
    }
  }

  // CAN THIS RUN BE WRITTEN TO AT ALL, ASKED BEFORE ANYTHING IS MINTED.
  //
  // Binding the run means merge-patching `data.ranAs` onto it, and `patchRecord` validates the WHOLE
  // record a merge produces. A run still holding a key no kind declares — `data.agent`, which window
  // B renames to `data.runtime` — cannot be merge-patched at all, which the migration's own header
  // spends a paragraph on. Without this the person choosing that run met "unknown key agent — did
  // you mean runtime?" from a request that was about who a comment is for, and their words went with
  // it. Asked here, the words are kept and the sentence says what is actually in the way.
  //
  // `validateData` AND NOT A try/catch AROUND THE WRITE. This is a question, asked before anything
  // is written; catching the refusal afterwards would be a decision to hide it.
  // The id in the probe entry is a stand-in and is never stored: the real one does not exist until
  // the identity is created, and what is being asked is whether the RECORD can take a write at all.
  const asItWouldBe = {
    ...record.data,
    ranAs: [...whatItRanAs(record), { workspaceId: record.workspaceId, agentId: sessionId }],
  }
  const canBeWritten = validateData(SESSION_KIND, asItWouldBe)
  if (!canBeWritten.ok) {
    return {
      addressable: false,
      why:
        `Run "${record.title}" (${sessionId}) cannot be written to as it stands, so it cannot be bound to a ` +
        `durable identity: ${canBeWritten.errors.map((e) => e.message).join('; ')} Migrate that record and choose ` +
        `it again.`,
    }
  }

  const data: Record<string, unknown> = { handle, state: 'active' }
  // A RUNTIME IS COPIED WHERE THE RUN HAS ONE AND LEFT OUT WHERE IT DOES NOT, exactly as the
  // migration does it. Absent is a real answer, drawn as "Runtime not set".
  const runtime = record.data[THE_NEW_KEY]
  if (typeof runtime === 'string' && runtime !== '') data[THE_NEW_KEY] = runtime

  const agent = createRecord({
    kind: AGENT_KIND,
    title: `${title}${THE_TITLE_SUFFIX}`,
    summary: summaryForAnIdentityMadeAtTheDoor(sessionId),
    data,
    workspaceId: record.workspaceId,
    actor,
  })
  // AND THE RUN SAYS WHICH AGENT IT WORKED AS. One fact with the identity, not two: the only reason
  // the identity exists is that this run was addressed, and a corpus holding one without the other
  // mints a second identity the next time anybody addresses the same run.
  //
  // THIS ONE WRITE IS THE OFFICE'S OWN ACT. The caller only chose who a message is for; the office made the identity
  // above and binds the run to it here. So the door on who may file a session for an agent reads this write as the
  // office. The change log still names the caller.
  theOfficeIsBindingARunToAnIdentityItMade += 1
  try {
    patchRecord(
      sessionId,
      { dataPatch: { ranAs: [...whatItRanAs(record), { workspaceId: record.workspaceId, agentId: agent.id }] } },
      actor,
    )
  } finally {
    theOfficeIsBindingARunToAnIdentityItMade -= 1
  }

  return { addressable: true, namedKind: 'session', sessionId, agentId: agent.id, minted: true }
}

// ================================================== a message to a run that answers as nobody

/**
 * THE SENTENCE A MESSAGE TO A RUN THAT ANSWERS AS NOBODY IS REFUSED WITH, on every door that refuses one: the
 * message record (`chosenRecipientAsStored` below) and a conversation's comment, written or changed
 * (`refuseAMessageToARunThatAnswersAsNobody`).
 */
export function whyAMessageToThisRunWouldReachNobody(title: string, sessionId: string): string {
  return (
    `The run "${title}" (${sessionId}) names no agent: nothing is holding a handle for it just now, and ` +
    'its record does not say which agent it worked as. A message addressed to it would reach nobody, so ' +
    'nothing was written. Choose an agent that exists, or start one for this run.'
  )
}

/**
 * A COMMENT IN A CONVERSATION ADDRESSED TO A RUN THAT ANSWERS AS NOBODY IS REFUSED, before anything is written.
 *
 * `identityForAddressedRun` mints an agent from such a run's title and writes it into the run's `ranAs`. The agent
 * that filed the run was then refused the runs it filed under it. A message record addressed to the same run is
 * refused with 422 (`chosenRecipientAsStored` below), and the thread doors in lib/agents.ts ask this so they refuse
 * it the same way. Only a live session record is asked. A recipient naming anything else is stored with a sentence,
 * as before.
 */
export function refuseAMessageToARunThatAnswersAsNobody(sessionId: string): void {
  const record = getRecord(sessionId)
  if (record === null || record.deletedAt !== null || record.kind !== SESSION_KIND) return
  if (theAgentASessionAnswersAs(record, record.workspaceId) !== null) return
  throw new PanelError(whyAMessageToThisRunWouldReachNobody(record.title, sessionId), 422)
}

/**
 * WHO A COMMENT IS FOR, AS IT WILL BE STORED BESIDE THE CHOICE.
 *
 * `data.chosenRecipient` is what the composer writes when somebody picks an agent for a comment,
 * and a `session` choice stored bare is one of the rows the start-up gate counts.
 *
 * IT COMPLETES THE CHOICE RATHER THAN CHANGING IT. A run stays `kind: "session"` — that is what
 * the person picked, it is what `chosenOn` in lib/reviews.ts sends the comment to, and sending it
 * still resumes that run. What is added is `agentId`: the durable identity the run works as, which
 * is the value `migrateAgentDispatch` would otherwise have to write.
 *
 * THE KIND DECIDES WHAT HAPPENS WHEN NO AGENT IS NAMED. A `message` — what the composer writes now
 * — is REFUSED with a sentence, because delivering it to an agent invented from the run's title would invent a
 * recipient the person did not choose. A legacy `annotation` still completes its choice the
 * old way, and the migration still mints for it: those comments predate durable agents.
 *
 * Returns the value to store, or null when there is nothing here to complete.
 */
export function chosenRecipientAsStored(
  data: Record<string, unknown>,
  actor: Actor,
  kind: string,
): Record<string, unknown> | null {
  const held = data['chosenRecipient']
  if (!isJsonObject(held)) return null
  if (held['kind'] !== SESSION_KIND) return null
  const sessionId = held['sessionId']
  if (typeof sessionId !== 'string' || sessionId === '') return null

  /**
   * A MESSAGE WRITTEN NOW IS REFUSED WHEN THE RUN IT NAMES ANSWERS AS NOBODY.
   *
   * The Ask agent box writes a `message`, and until 12 September 2026 this door minted a durable
   * agent from the run's TITLE when it found none. So the person's message to the secretary's live session
   * was delivered to an identity made from a slug of the session's title,
   * while the session itself held the secretary's live handle and was answering the whole time.
   * `theAgentASessionAnswersAs` is the one place that works out the agent a run
   * answers as: the handle it holds now, the agent record it names, or the worker's `servingAgent`.
   * When none of the three is there, the write is refused with a sentence rather than delivered to
   * an invented id, and the words are handed back to the person to address again.
   *
   * THE LEGACY `annotation` KIND STILL COMPLETES ITS CHOICE THE OLD WAY. Those comments were
   * written before durable agents existed and the migration still mints for them, so this door does
   * not take that path away. What changed is the comment kind the composer writes now.
   */
  if (kind === 'message') {
    const record = getRecord(sessionId)
    if (record !== null && record.deletedAt === null && record.kind === AGENT_KIND) {
      return {
        kind: AGENT_KIND,
        agentId: record.id,
        ...(typeof held['said'] === 'string' ? { said: held['said'] } : {}),
        ...(typeof held['why'] === 'string' ? { why: held['why'] } : {}),
      }
    }
    if (record !== null && record.deletedAt === null && record.kind === SESSION_KIND) {
      const answered = theAgentASessionAnswersAs(record, record.workspaceId)
      if (answered !== null) return { ...held, agentId: answered.record ?? answered.agent.id }
      throw new PanelError(whyAMessageToThisRunWouldReachNobody(record.title, sessionId), 422)
    }
    throw new PanelError(
      `This message is addressed to the run ${sessionId}, and no run with that id is here, so it names no agent ` +
        'and nothing was written. Choose an agent that exists, or start one for this run.',
      422,
    )
  }

  const answer = identityForAddressedRun(sessionId, actor)
  if (!answer.addressable) {
    // NOT A RUN ANYTHING CAN BE FILED UNDER, so it is not stored as one. The words somebody typed
    // about who they meant are kept in `said`, and `why` is the sentence saying what is wrong.
    return {
      kind: 'unresolved',
      ...(typeof held['said'] === 'string' ? { said: held['said'] } : {}),
      why: answer.why,
    }
  }
  if (answer.namedKind === AGENT_KIND) {
    return {
      kind: AGENT_KIND,
      agentId: answer.agentId,
      ...(typeof held['said'] === 'string' ? { said: held['said'] } : {}),
      ...(typeof held['why'] === 'string' ? { why: held['why'] } : {}),
    }
  }
  return { ...held, agentId: answer.agentId }
}