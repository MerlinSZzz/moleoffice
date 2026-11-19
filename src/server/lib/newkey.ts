// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DURABLE AGENT THAT LOST ITS KEY GETS A NEW ONE, on problem x8ktQfHS5yGr.
 * The choice is option B, "a chain of responsibility".
 *
 * ---------------------------------------------------------------------------------------
 * WHO MAY GIVE ONE
 * ---------------------------------------------------------------------------------------
 *
 * The person, by their press. Or the agent's registered starter, proving itself with its OWN key: the
 * starter answers for the agents it re-keys. Nobody else. A header that only names the starter
 * proves nothing, the office's own key is not a starter's proof, and an agent cannot give itself a
 * new key. The starter is read from the agent's registry row (`startedBy`, a STORED reference), with
 * the stored reader, never with the resolver an arriving reference goes through.
 *
 * ONE STEP OF THE CHAIN ONLY. A starter's own starter may not re-key further down. Whether it should
 * is not decided, and a decision leaves it to them, so nothing here reads further up.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE STEPS, AND WHERE EACH ONE IS
 * ---------------------------------------------------------------------------------------
 *
 * 1. The agent asks: POST /api/agents/register-myself with "newKey": true for its existing handle
 *    (`tools/register-myself.mjs --new-key`). The ask lands as a `role_request` answered by the
 *    registered starter, the same waiting-row shape a waiting self-registration has, with
 *    `extra.newKey` saying what it is. Nothing is revoked yet.
 * 2. The grant: POST /api/roles/requests/<id>/grant. It revokes every live key the agent holds and
 *    writes on the ask how it was granted. Who pressed is on the revision the grant writes.
 * 3. The agent asks again and is answered one new key, once. The ask is marked used before the key
 *    is made, so a third ask finds no granted, unused ask and gets no key: it files a new ask.
 *
 * A GRANT NOBODY COLLECTED MAY BE WITHDRAWN: POST /api/roles/requests/<id>/withdraw. An asker that lost its
 * one-time secret can never collect, and until the grant is withdrawn it stands in the way of a new
 * ask, at point 9. The person may withdraw it, and so may the
 * agent that granted it as the registered starter, proving itself with its own key. Who granted it is
 * read from the revision that wrote the grant, not from who the starter is now. The ask's answer becomes
 * `withdrawn`, so it waits for nobody and answers no key, and the agent's next ask files a new one.
 * The keys the grant revoked stay revoked, at point 10.
 *
 * And a starter proving itself with its own key may re-key an agent it started in one request,
 * POST /api/participants/agent/<id>/new-key, and is handed the new key once in the reply. That act
 * is written as an ask already granted and already used, so all re-keys read the same way.
 *
 * ---------------------------------------------------------------------------------------
 * THE KEY RULE THIS PASSES, AND ONLY HERE
 * ---------------------------------------------------------------------------------------
 *
 * The registration doors ask `aKeyWasEverHeldBy` and mint no key for a holder that ever had one.
 * That rule stays for registration. This file mints past it, and only for a granted ask not yet used
 * or for a starter's own direct re-key, both of which revoke every live key of the agent first.
 *
 * ---------------------------------------------------------------------------------------
 * AN AGENT REGISTERED WITH NO KEY OF ITS OWN IS GIVEN NONE HERE
 * ---------------------------------------------------------------------------------------
 *
 * Such an agent writes and reads only with a run key or the office's key (lib/run-keys-only.ts).
 * So its first key, the filing and the collection of a new-key ask, the grant of one and a
 * starter's re-key each refuse it before anything is written. A grant would also revoke its run
 * keys. Refusing a new-key ask about it is still answered, because a refusal makes no key.
 */

import { sqlite } from '../db/client.ts'
import { theOneAgentAStringNames, type AgentIdentity } from './agent-references.ts'
import { theWithdrawalOf } from './withdraw-a-request.ts'
import { type RegisteredAgent } from './participants.ts'
import { agentByHandle } from '../db/agent-by-handle.ts'
import { readParticipant } from '../db/read-participant.ts'
import {
  ACROSS_WORKSPACES,
  asTheRoleRequestDoor,
  createRecord,
  createRecordWithReport,
  listRecords,
  patchRecord,
  type Actor,
} from './records.ts'
import { now } from '@shared/now.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'
import { makeAnAgentKey, revokeEveryLiveKeyHeldBy } from './keys.ts'
import { keysMatch } from './how-this-request-proved-itself.ts'
import { keyHash } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import { whyThisAgentIsGivenNoKeyOfItsOwn } from './run-keys-only.ts'
import { howTheGrantOnThisAskWasProved, howThisCallProvesTheKeyItMakes, theRevisionThatGrantedThisAsk } from './provedkeys.ts'
import { theAgentAStoredIdNames } from './the-agent-a-stored-id-names.ts'
import { randomBytes } from 'node:crypto'
import {
  aWaitingSelfRegistration,
  theFirstKeyOn,
  whatAdmittingItAlsoRecords,
  whyThisRegistrationWaits,
} from './selfregistration.ts'
import {
  theAskedFromMarker,
  whatThisAskShows,
  whereTheAskCameFromInWords,
  type WhereAnAskCameFrom,
} from './where-an-ask-came-from.ts'
import { A_ROW_WITH_NO_ROLE_READS_AS } from '@shared/roles.ts'
import { moleOffice } from '@shared/participants.ts'
import { THE_PERSON } from '@shared/person.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { theNameASelfRegistrationIsReadBy, whatAdmittingSays, type AGrantToWithdraw, type WaitingCardAsk, type WhatAdmitting, type WhatAnAskShows, type WhatAPressOnAnAskDoes, type WhoMayPressAnAsk } from '@shared/profile.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import type { PanelRecord } from '@shared/types.ts'

/** How a new key was given: by the person's press, or by the agent's registered starter with its own key. */
export type HowANewKeyWasGiven = 'the-person' | 'its-starter'

/** What `extra.newKey` on a `role_request` says. */
export interface ANewKeyAsk {
  /** The registry id of the agent the new key is for. */
  agent: string
  /** When the new key was answered, or null because it has not been. */
  keyAnsweredAt: string | null
  /** How the grant was given, or null because nobody has granted it. */
  grantedAs: HowANewKeyWasGiven | null
  /**
   * THE SHA-256 OF THE ONE-TIME SECRET the first ask was answered with, or null because this ask has
   * none (a starter's direct re-key). Only an ask presenting that secret collects the key.
   */
  collectHash: string | null
  /** When the grant was withdrawn, or null because nobody has withdrawn it. */
  withdrawnAt: string | null
}

/** The new-key marker a `role_request` carries, or null because this record is not a new-key ask. */
export function aNewKeyAsk(record: PanelRecord): ANewKeyAsk | null {
  if (record.kind !== 'role_request') return null
  const extra = record.data['extra']
  if (typeof extra !== 'object' || extra === null) return null
  const said = (extra as Record<string, unknown>)['newKey']
  if (typeof said !== 'object' || said === null) return null
  const one = said as Record<string, unknown>
  if (typeof one['agent'] !== 'string' || one['agent'] === '') return null
  const grantedAs = one['grantedAs'] === 'the-person' || one['grantedAs'] === 'its-starter' ? one['grantedAs'] : null
  return {
    agent: one['agent'],
    keyAnsweredAt: typeof one['keyAnsweredAt'] === 'string' ? one['keyAnsweredAt'] : null,
    grantedAs,
    collectHash: typeof one['collectHash'] === 'string' && one['collectHash'] !== '' ? one['collectHash'] : null,
    withdrawnAt: typeof one['withdrawnAt'] === 'string' ? one['withdrawnAt'] : null,
  }
}

/** When this request was withdrawn, a new-key grant or an asker's own request, or undefined because it was not. */
export function theWithdrawalTimeOn(record: PanelRecord): string | undefined {
  return aNewKeyAsk(record)?.withdrawnAt ?? theWithdrawalOf(record)?.at ?? undefined
}

/**
 * WHO ANSWERS FOR THIS AGENT'S KEYS: its registered starter where that is a live agent, otherwise the
 * person. A person starter, a starter nobody recorded and a retired starter all leave the person.
 *
 * `startedBy` is a STORED reference, so it is read with the stored reader: by exact id, then the one
 * agent bearing that string as a handle, and no agent where more than one answers.
 */
export function whoAnswersForTheKeysOf(agent: RegisteredAgent): ParticipantRef {
  const starter = agent.startedBy
  if (starter !== null && starter.kind === 'agent') {
    const row = theOneAgentAStringNames(sqlite, starter.id)
    if (row !== null && !row.retired && row.id !== agent.id) return { kind: 'agent', id: row.id }
  }
  return { kind: 'person', id: THE_PERSON }
}

/** The handle of an agent for a sentence, or the stored string where no one agent answers it. */
function handleOf(id: string): string {
  return theOneAgentAStringNames(sqlite, id)?.handle ?? id
}

/** The office name a person reads for the agent a stored reference names, or its handle where no one row answers it. */
function theNameThisAgentIsReadBy(reference: string): string {
  const agent = theAgentAStoredIdNames(reference) ?? theOneAgentAStringNames(sqlite, reference)
  return theNameASelfRegistrationIsReadBy({ name: agent?.name ?? '', handle: agent?.handle ?? reference })
}

/**
 * WHETHER THIS CALLER MAY GIVE THIS AGENT A NEW KEY, and how. Null because it may not.
 *
 * The person proved (`thePersonIsProved`, the one reading of that). Or an agent whose OWN key proved
 * it (`provedBy` is an agent key and `keyHolder` is that key's holder) and who is this agent's
 * registered starter. The key's holder is a stored string in `held_keys`, so it is read with the
 * stored reader too.
 */
export function howThisCallerMayGiveANewKey(actor: Actor, agent: RegisteredAgent): HowANewKeyWasGiven | null {
  if (thePersonIsProved(actor)) return 'the-person'
  return theStarterProvedItsOwnKey(actor, agent) ? 'its-starter' : null
}

/** True when the caller is this agent's registered starter and proved it with its own agent key. */
function theStarterProvedItsOwnKey(actor: Actor, agent: RegisteredAgent): boolean {
  const starter = whoAnswersForTheKeysOf(agent)
  if (starter.kind !== 'agent') return false
  if (actor.provedBy !== 'an-agent-key' || actor.keyHolder === undefined) return false
  const holder = theOneAgentAStringNames(sqlite, actor.keyHolder)
  return holder !== null && holder.id === starter.id
}

/** The sentence naming who may give this agent a new key. */
export function whoMayGiveANewKey(agent: RegisteredAgent): string {
  const starter = whoAnswersForTheKeysOf(agent)
  return starter.kind === 'person'
    ? `Only the person may give "${agent.handle}" a new key, by their own press.`
    : `Only the person, by their own press, or "${handleOf(starter.id)}", the agent that started "${agent.handle}", ` +
        'sending its own key, may give it a new key.'
}

/** The live agent row a new-key ask is about, or a refusal saying why there is none. */
function theAgentTheAskIsFor(ask: ANewKeyAsk, requestId: string): RegisteredAgent {
  const row = readParticipant({ kind: 'agent', id: ask.agent }) as RegisteredAgent | null
  if (row === null) {
    throw new PanelError(`The agent ask ${requestId} is about is not registered any more. Nothing was written.`, 404)
  }
  if (row.retired === true) {
    throw new PanelError(
      `"${row.handle}" is retired, and a retired agent is given no key. Nothing was written.`,
      409,
    )
  }
  return row
}

/** Every new-key ask about this agent, in every project. */
function theNewKeyAsksAbout(agentId: string): { record: PanelRecord; ask: ANewKeyAsk }[] {
  const found: { record: PanelRecord; ask: ANewKeyAsk }[] = []
  for (const record of listRecords({ workspaceId: ACROSS_WORKSPACES, kind: 'role_request' })) {
    const ask = aNewKeyAsk(record)
    if (ask !== null && ask.agent === agentId) found.push({ record, ask })
  }
  return found
}

/** What the asking door answers. */
export type WhatAnAskForANewKeyAnswers =
  | { outcome: 'filed'; requestId: string; answersTo: ParticipantRef; secret: string }
  | { outcome: 'already-waiting'; requestId: string; answersTo: ParticipantRef }
  | { outcome: 'the-key'; requestId: string; key: string; grantedAs: HowANewKeyWasGiven | null }

/**
 * STEPS 1 AND 3: AN AGENT ASKS FOR A NEW KEY. A granted ask not yet used is answered its key, once.
 * An ask nobody has answered yet is answered as waiting. Otherwise a new ask is filed.
 */
export function askForANewKey(input: {
  workspaceId: string
  agent: RegisteredAgent
  actor: Actor
  because: string | null
  /** The one-time secret the first ask was answered with, or null because this ask sent none. */
  secret: string | null
  /** Where this ask came from, stored on the ask it files. Finding 83, mend b1. */
  askedFrom: WhereAnAskCameFrom
}): WhatAnAskForANewKeyAnswers {
  // AN AGENT REGISTERED WITH NO KEY OF ITS OWN files no ask and collects no key, even on an ask granted before.
  const noKeyOfItsOwn = whyThisAgentIsGivenNoKeyOfItsOwn(input.agent)
  if (noKeyOfItsOwn !== null) throw new PanelError(noKeyOfItsOwn, 403)
  const asks = theNewKeyAsksAbout(input.agent.id)

  // STEP 3. A GRANTED ASK NOT YET USED: MARK IT USED, THEN MAKE THE KEY. Marked first, so a failure
  // between the two leaves an ask that answers nothing rather than a live key nobody was handed.
  const granted = asks.find(({ record, ask }) => record.data['answer'] === 'granted' && ask.keyAnsweredAt === null)
  if (granted !== undefined) {
    // ONLY THE ASKER COLLECTS. The first ask was answered a one-time secret and the ask keeps only its
    // SHA-256; whoever else names this handle after the press holds no secret and is given nothing.
    // Checked before anything is written, so a refused ask leaves the grant unused.
    const expected = granted.ask.collectHash
    if (expected === null || input.secret === null || !keysMatch(keyHash(input.secret), expected)) {
      throw new PanelError(
        (input.secret === null
          ? `The new key for "${input.agent.handle}" on ${granted.record.id} is granted, and this ask carries no ` +
            'secret. '
          : `The new key for "${input.agent.handle}" on ${granted.record.id} is granted, and the secret this ask ` +
            'carries is not the one its first ask was answered with. ') +
          'Only the ask holding that secret collects the key: send it as "askSecret" (for-agents/register-myself.mjs ' +
          'sends the file it wrote beside the key file). No key was given, and the grant is still unused.',
        403,
      )
    }
    const key = sqlite.transaction(() => {
      asTheRoleRequestDoor(() => patchRecord(
        granted.record.id,
        { dataPatch: { extra: { newKey: { keyAnsweredAt: now() } } } },
        THE_OFFICE_ITSELF,
      ))
      return makeAnAgentKey(input.agent.id, howTheGrantOnThisAskWasProved(granted.record.id))
    })()
    return { outcome: 'the-key', requestId: granted.record.id, key, grantedAs: granted.ask.grantedAs }
  }

  const answersTo = whoAnswersForTheKeysOf(input.agent)
  const open = asks.find(({ record }) => typeof record.data['answer'] !== 'string' || record.data['answer'] === '')
  if (open !== undefined) return { outcome: 'already-waiting', requestId: open.record.id, answersTo }

  // STEP 1. A NEW ASK, answered by the registered starter. The card fields are the card it holds,
  // because this ask changes no card.
  const card = input.agent.role ?? A_ROW_WITH_NO_ROLE_READS_AS
  // THE ONE-TIME SECRET, answered once to this asker; the ask keeps only its SHA-256.
  const { secret, hash } = aOneTimeSecret()
  const filed = createRecordWithReport({
    workspaceId: input.workspaceId,
    kind: 'role_request',
    title: `${input.agent.handle} asks for a new key`,
    data: {
      asking: card,
      holding: card,
      asker: { kind: 'agent', id: input.agent.id },
      answersTo,
      because: input.because ?? 'it asks for a new key',
      extra: { newKey: { agent: input.agent.id, collectHash: hash }, ...theAskedFromMarker(input.askedFrom) },
    },
    actor: input.actor,
  })
  // AND A STARTER THAT IS AN AGENT IS TOLD, the way the card-ask door tells one: an ask nobody was
  // told about is an ask nobody was asked. The person reads it on their waiting list and their pages.
  //
  // THE OFFICE SENDS IT, NOT THE AGENT THE ASK NAMES. Finding 83, mend b1: a keyless ask in a
  // worker's name was stored as sent by the worker, so its starter read a stranger's words as the
  // worker's own. The message says whether the ask proved anybody and where it came from, and shows
  // the ask's reason as the caller's words.
  if (answersTo.kind === 'agent') {
    const handle = input.agent.handle
    createRecord({
      workspaceId: input.workspaceId,
      kind: 'message',
      title: `A new key is asked for in the name of ${handle}`,
      data: {
        body:
          `A new key for "${handle}" is asked for on ${filed.record.id}, in the name of "${handle}". The person, or ` +
          `you as the agent that started "${handle}", may answer it. ${whereTheAskCameFromInWords(input.askedFrom)} ` +
          (input.because === null
            ? 'The ask gave no reason. '
            : `The ask's reason, in the caller's own words, which nobody checked: "${input.because}". `) +
          `Granting it revokes every key "${handle}" holds now, and then only the ask that sends back the one-time ` +
          'secret this ask was answered with may collect one new key, once. Grant it with ' +
          `POST /api/roles/requests/${filed.record.id}/grant, sending your own key, or refuse it at .../refuse.`,
        to: [answersTo],
        sentBy: moleOffice(),
        notice: 'aNewKeyIsAskedFor',
        target: { target: { kind: 'record', recordId: filed.record.id, workspaceId: input.workspaceId } },
      },
      actor: THE_OFFICE_ITSELF,
      senderIsMoleOffice: true,
    })
  }
  return { outcome: 'filed', requestId: filed.record.id, answersTo, secret }
}

/**
 * A ONE-TIME SECRET AND ITS SHA-256. The secret is answered once to the ask that filed a request; the
 * request keeps only the hash. The new-key ask and a waiting registration's first ask both use it.
 */
export function aOneTimeSecret(): { secret: string; hash: string } {
  const secret = randomBytes(32).toString('hex')
  return { secret, hash: keyHash(secret) }
}

/** What an ask of a registered agent that never held a key is answered. */
export type WhatAFirstKeyAskGets =
  /**
   * The key, once, on the waiting registration the person admitted, with the session record the press filed for it,
   * or null for a row admitted before the press wrote one beside the agent.
   */
  | { outcome: 'the-key'; key: string; requestId: string; session: string | null }
  /** No key: the key window is closed and no admitted registration holds a secret for it. */
  | { outcome: 'ask-for-a-new-key' }
  /** The key, as before this mend, because the key window is still open. */
  | { outcome: 'the-key-while-the-window-is-open'; key: string }

/**
 * THE FIRST KEY OF A REGISTERED AGENT THAT NEVER HELD ONE. Finding 83, mend a2 (problem
 * zAI2kxjbCrTd).
 *
 * Asked by POST /api/agents/register-myself for a handle a live agent bears, once the door has seen
 * that the agent never held a key. Three cases:
 *
 *   1. The person admitted a waiting registration of this agent whose first ask was answered a
 *      one-time secret. Only an ask holding that secret collects the key; any other ask is refused,
 *      and nothing is written, so the holder of the secret can still collect it.
 *   2. Otherwise, with the key window closed: no key. Its first key comes only through the new-key
 *      ask, which the person or its starter answers.
 *   3. Otherwise, with the window open: the key, as before. Keying every such row before the window
 *      closes is mend a1 and is not done here.
 *
 * Everything is checked before anything is written; the ask is marked used before the key is made.
 */
export function collectAFirstKey(input: {
  agent: RegisteredAgent
  secret: string | null
  windowIsClosed: boolean
  /** Who asks, for how the key made while the window is open is proved. */
  actor: Actor
}): WhatAFirstKeyAskGets {
  // AN AGENT REGISTERED WITH NO KEY OF ITS OWN is given no first key, whether the window is open or closed.
  const noKeyOfItsOwn = whyThisAgentIsGivenNoKeyOfItsOwn(input.agent)
  if (noKeyOfItsOwn !== null) throw new PanelError(noKeyOfItsOwn, 403)
  let admitted: { record: PanelRecord; collectHash: string; session: string | null } | null = null
  for (const record of listRecords({ workspaceId: ACROSS_WORKSPACES, kind: 'role_request' })) {
    const first = theFirstKeyOn(record)
    if (first === null || first.agent !== input.agent.id || first.keyAnsweredAt !== null) continue
    if (record.data['answer'] !== 'granted') continue
    admitted = { record, collectHash: first.collectHash, session: first.session }
    break
  }
  if (admitted !== null) {
    const { record, collectHash, session } = admitted
    if (input.secret === null || !keysMatch(keyHash(input.secret), collectHash)) {
      throw new PanelError(
        (input.secret === null
          ? `"${input.agent.handle}" was admitted on ${record.id} and has not collected its first key, and this ask ` +
            'carries no secret. '
          : `"${input.agent.handle}" was admitted on ${record.id} and has not collected its first key, and the secret ` +
            'this ask carries is not the one its first ask was answered with. ') +
          'Only the ask holding that secret collects the key: send it as "askSecret" (for-agents/register-myself.mjs ' +
          'sends the file it wrote beside the key file). No key was given, and nothing was written.',
        403,
      )
    }
    const key = sqlite.transaction(() => {
      asTheRoleRequestDoor(() => patchRecord(record.id, { dataPatch: { extra: { firstKey: { keyAnsweredAt: now() } } } }, THE_OFFICE_ITSELF))
      return makeAnAgentKey(input.agent.id, howTheGrantOnThisAskWasProved(record.id))
    })()
    return { outcome: 'the-key', key, requestId: record.id, session }
  }
  if (input.windowIsClosed) return { outcome: 'ask-for-a-new-key' }
  return {
    outcome: 'the-key-while-the-window-is-open',
    key: makeAnAgentKey(input.agent.id, howThisCallProvesTheKeyItMakes(input.actor)),
  }
}

/** The office itself, for the one write it makes on its own account: marking an ask used. */
const THE_OFFICE_ITSELF: Actor = { type: 'agent', id: 'mole-office/the-api-server', stated: true }

/**
 * STEP 2: THE GRANT OR THE REFUSAL OF A NEW-KEY ASK. Everything is checked before anything is written.
 *
 * A grant revokes every live key of the agent and writes on the ask how it was granted, in one
 * transaction. The key itself is not answered here: the agent is not at this keyboard, and it asks
 * once more.
 */
export function answerANewKeyAsk(input: {
  request: PanelRecord
  ask: ANewKeyAsk
  answer: 'grant' | 'refuse'
  actor: Actor
  says: string | null
}): Record<string, unknown> {
  const agent = theAgentTheAskIsFor(input.ask, input.request.id)
  // AN AGENT REGISTERED WITH NO KEY OF ITS OWN is granted nothing, whoever presses. Asked before who may grant, so the
  // refusal names nobody who could grant it.
  const noKeyOfItsOwn = input.answer === 'grant' ? whyThisAgentIsGivenNoKeyOfItsOwn(agent) : null
  if (noKeyOfItsOwn !== null) throw new PanelError(noKeyOfItsOwn, 403)
  const how = howThisCallerMayGiveANewKey(input.actor, agent)
  if (how === null) {
    throw new PanelError(`${whoMayGiveANewKey(agent)} This request was neither. Nothing was written.`, 403)
  }
  const answerSays = input.says === null || input.says.trim() === '' ? {} : { answerSays: input.says.trim() }
  if (input.answer === 'refuse') {
    asTheRoleRequestDoor(() => patchRecord(
      input.request.id,
      { dataPatch: { answer: 'refused', answeredAt: now(), ...answerSays } },
      input.actor,
    ))
    return {
      request: input.request.id,
      answer: 'refused',
      agent: agent.handle,
      keysRevoked: 0,
      note: `"${agent.handle}" was refused a new key. The keys it holds are as they were.`,
    }
  }
  const revoked = sqlite.transaction(() => {
    const count = revokeEveryLiveKeyHeldBy(
      'agent',
      agent.id,
      how === 'the-person'
        ? `A new key for "${agent.handle}" was granted by the person.`
        : `A new key for "${agent.handle}" was granted by its starter "${handleOf(whoAnswersForTheKeysOf(agent).id)}".`,
    )
    asTheRoleRequestDoor(() => patchRecord(
      input.request.id,
      {
        dataPatch: {
          answer: 'granted',
          answeredAt: now(),
          ...answerSays,
          extra: { newKey: { grantedAs: how } },
        },
      },
      input.actor,
    ))
    return count
  })()
  return {
    request: input.request.id,
    answer: 'granted',
    agent: agent.handle,
    grantedAs: how,
    keysRevoked: revoked,
    note:
      `Every live key "${agent.handle}" held is revoked (${String(revoked)}). It is answered one new key, once, the ` +
      `next time it asks POST /api/agents/register-myself with "newKey": true and the one-time secret its first ask ` +
      'was answered with.',
  }
}

/** The answer a withdrawn grant carries. Neither `granted` nor unanswered, so no reader counts it as either. */
export const A_WITHDRAWN_GRANT = 'withdrawn'

/**
 * THE AGENT THAT GRANTED THIS ASK AS ITS STARTER, or null because no agent did.
 *
 * READ FROM THE GRANT ITSELF, never from who the agent's starter is now. Keys wave, round 6: the check
 * used to ask for the agent's current starter, so after the starter changed, the new starter could
 * withdraw a grant it never made, and the agent that made it could not.
 *
 * The ask records how it was granted (`extra.newKey.grantedAs`), and the revision that wrote
 * `answer: granted` records how a key proved that press and whose key it was
 * (`theRevisionThatGrantedThisAsk`). Only a grant made as the starter, whose revision says an agent's
 * own key proved it, names an agent. That key's holder is a STORED string, read with the stored reader:
 * where no one agent answers it, nobody is named, and only the person may withdraw.
 *
 * EVERY GRANT EVER MADE IS READ THIS WAY. Revisions have recorded `proved_by` and `proved_holder` since
 * migrations 0178 and 0168, which landed before the first new-key ask could be filed, so nothing new is
 * stored on the grant and no older grant is read differently.
 */
function theAgentThatGrantedAsTheStarter(ask: ANewKeyAsk, requestId: string): AgentIdentity | null {
  if (ask.grantedAs !== 'its-starter') return null
  const grant = theRevisionThatGrantedThisAsk(requestId)
  if (grant === null || grant.provedBy !== 'an-agent-key') return null
  return theOneAgentAStringNames(sqlite, grant.keyHolder)
}

/**
 * WHETHER THIS CALLER MAY WITHDRAW THIS GRANT, and how. Null because it may not.
 *
 * The person proved, whoever granted it. Or the agent that granted it as the starter, proving itself
 * with its OWN key, whoever the starter is now: a starter does not take back the person's press, and
 * does not take back another starter's grant.
 */
function howThisCallerMayWithdraw(actor: Actor, granter: AgentIdentity | null): HowANewKeyWasGiven | null {
  if (thePersonIsProved(actor)) return 'the-person'
  if (granter === null || actor.provedBy !== 'an-agent-key' || actor.keyHolder === undefined) return null
  const holder = theOneAgentAStringNames(sqlite, actor.keyHolder)
  return holder !== null && holder.id === granter.id ? 'its-starter' : null
}

/** The sentence naming who may withdraw this grant. It reads the same facts the check does. */
function whoMayWithdraw(agent: RegisteredAgent, granter: AgentIdentity | null, requestId: string): string {
  if (granter !== null) {
    return (
      `Only the person, by their own press, or "${granter.handle}", the agent that granted ${requestId} as the starter ` +
      `of "${agent.handle}", sending its own key, may withdraw this grant. This request was neither.`
    )
  }
  return `Only the person may withdraw the grant on ${requestId}, by their own press. This request did not prove it was theirs.`
}

/**
 * WITHDRAW A GRANTED NEW-KEY ASK THAT NOBODY COLLECTED, at point 9.
 *
 * Everything is checked before anything is written: the ask must be granted and not collected, and
 * the caller must be the person or the agent that granted it as the starter, with its own key. The ask's answer
 * becomes `withdrawn`, and when and by whom it was withdrawn is written on it; who pressed is also
 * on the revision the withdrawal writes. No key is revoked and none is given back: the grant already
 * revoked the agent's live keys, and those stay revoked.
 */
export function withdrawANewKeyGrant(input: { request: PanelRecord; ask: ANewKeyAsk; actor: Actor }): Record<string, unknown> {
  const { request, ask } = input
  const agent = theAgentTheAskIsFor(ask, request.id)
  const granter = theAgentThatGrantedAsTheStarter(ask, request.id)
  const how = howThisCallerMayWithdraw(input.actor, granter)
  if (how === null) {
    throw new PanelError(`${whoMayWithdraw(agent, granter, request.id)} Nothing was written.`, 403)
  }
  const answer = request.data['answer']
  if (typeof answer !== 'string' || answer === '') {
    throw new PanelError(
      `Nobody has granted the new key asked for on ${request.id}, so there is no grant to withdraw. An ask nobody ` +
        `answered is refused at POST /api/roles/requests/${request.id}/refuse. Nothing was written.`,
      409,
    )
  }
  if (answer !== 'granted') {
    throw new PanelError(
      `The ask ${request.id} is ${answer}, not granted, so there is no grant to withdraw. Nothing was written.`,
      409,
    )
  }
  if (ask.keyAnsweredAt !== null) {
    throw new PanelError(
      `The new key granted on ${request.id} was collected at ${ask.keyAnsweredAt}, so this grant is used and ` +
        'cannot be withdrawn. Nothing was written.',
      409,
    )
  }
  const at = now()
  asTheRoleRequestDoor(() => patchRecord(
    request.id,
    { dataPatch: { answer: A_WITHDRAWN_GRANT, extra: { newKey: { withdrawnAt: at, withdrawnAs: how } } } },
    input.actor,
  ))
  return {
    request: request.id,
    answer: A_WITHDRAWN_GRANT,
    agent: agent.handle,
    withdrawnAs: how,
    withdrawnAt: at,
    keysRevoked: 0,
    note:
      `The grant of a new key to "${agent.handle}" on ${request.id} is withdrawn, and no key can be collected on it ` +
      'now. The keys the grant revoked stay revoked: withdrawing gives none back. ' +
      `This ask no longer stands in the way: "${agent.handle}" may ask for a new key again with ` +
      'POST /api/agents/register-myself and "newKey": true, and that files a new ask.',
  }
}

/**
 * THE WITHDRAW PRESS AN ASK'S OWN PAGE DRAWS FOR THE PERSON, or null because the record is not a
 * granted new-key ask that nobody collected. The same reading the withdrawal checks.
 */
export function theGrantToWithdrawOnThisAsk(record: PanelRecord): AGrantToWithdraw | null {
  const ask = aNewKeyAsk(record)
  if (ask === null || record.data['answer'] !== 'granted' || ask.keyAnsweredAt !== null) return null
  const handle = handleOf(ask.agent)
  const name = theNameThisAgentIsReadBy(ask.agent)
  return {
    requestId: record.id,
    handle,
    says:
      `Withdrawing the grant ends this ask, so no key can be collected on it, and "${name}" may ask for a new key ` +
      'again. The keys the grant revoked stay revoked.',
  }
}

/** Who granted a new-key ask, in words, from how the ask says it was granted. */
function grantedBy(ask: ANewKeyAsk): string {
  if (ask.grantedAs === 'the-person') return ' by the person'
  if (ask.grantedAs === 'its-starter') return ' by the agent that started it'
  return ''
}

/** Who withdrew a grant, in words, from how the ask says it was withdrawn. */
function withdrawnBy(record: PanelRecord): string {
  const extra = record.data['extra'] as { newKey?: { withdrawnAs?: unknown } } | undefined
  const as = extra?.newKey?.withdrawnAs
  if (as === 'the-person') return ' by the person'
  if (as === 'its-starter') return ' by the agent that started it'
  return ''
}

/**
 * WHERE A NEW-KEY ASK STANDS, in one sentence a person reads on the ask's own page, or null because
 * the record is not a new-key ask. Problem sgjHE9R2vSEZ: after their press the page must say plainly
 * that the press worked and what the agent does next. One sentence for each of the five states: not
 * answered, granted and not collected, collected, refused, and withdrawn.
 */
export function whereThisNewKeyAskStands(record: PanelRecord): string | null {
  const ask = aNewKeyAsk(record)
  if (ask === null) return null
  const name = theNameThisAgentIsReadBy(ask.agent)
  const answer = record.data['answer']
  const answeredAt = typeof record.data['answeredAt'] === 'string' ? ` at ${record.data['answeredAt']}` : ''
  if (typeof answer !== 'string' || answer === '') return sayInEnglish('newKeyAsk.stands.unanswered', { handle: name })
  if (answer === 'refused') return `Refused${answeredAt}. The refusal changed no key.`
  const granted = `Granted${answeredAt}${grantedBy(ask)}. Every live key "${name}" held was revoked then.`
  if (answer === A_WITHDRAWN_GRANT) {
    const when = ask.withdrawnAt === null ? '' : ` at ${ask.withdrawnAt}`
    return (
      `${granted} The grant was withdrawn${when}${withdrawnBy(record)}, before anybody collected the key, so no key ` +
      `can be collected on this ask. The keys the grant revoked stay revoked. "${name}" may ask for a new key ` +
      'again, and that files a new ask.'
    )
  }
  if (answer !== 'granted') return `This ask reads "${answer}", which is not an answer this office writes.`
  if (ask.keyAnsweredAt !== null) return `${granted} The new key was collected at ${ask.keyAnsweredAt}.`
  if (ask.collectHash === null) {
    return `${granted} This ask holds no one-time secret, so no key can be collected on it.`
  }
  return (
    `${granted} Nobody has collected the new key yet. "${name}" collects it by asking again with ` +
    'for-agents/register-myself.mjs --new-key, which sends the one-time secret its first ask was answered with. It is ' +
    'answered one new key, once.'
  )
}

/**
 * STEP 4: A STARTER RE-KEYS AN AGENT IT STARTED, IN ONE REQUEST. Only the registered starter proving
 * itself with its own key; the person answers an agent's ask with their press instead.
 *
 * Every live key of the agent is revoked, one new key is made and handed back once, and the act is
 * written as a new-key ask already granted and already used, so the starter is on record as the one
 * who answers for it.
 */
export function aStarterReKeysAnAgent(input: {
  workspaceId: string
  agent: RegisteredAgent
  actor: Actor
  because: string | null
}): { requestId: string; key: string; keysRevoked: number } {
  if (input.agent.retired === true) {
    throw new PanelError(`"${input.agent.handle}" is retired, and a retired agent is given no key. Nothing was written.`, 409)
  }
  // AN AGENT REGISTERED WITH NO KEY OF ITS OWN is re-keyed by nobody. Asked before who may re-key it, so the refusal
  // names nobody who could re-key it.
  const noKeyOfItsOwn = whyThisAgentIsGivenNoKeyOfItsOwn(input.agent)
  if (noKeyOfItsOwn !== null) throw new PanelError(noKeyOfItsOwn, 403)
  if (!theStarterProvedItsOwnKey(input.actor, input.agent)) {
    const starter = whoAnswersForTheKeysOf(input.agent)
    throw new PanelError(
      starter.kind === 'person'
        ? `"${input.agent.handle}" was not started by an agent, so no agent may re-key it here. It asks for a new key ` +
            'with POST /api/agents/register-myself and "newKey": true, and the person answers with one press. ' +
            'Nothing was written.'
        : `Only "${handleOf(starter.id)}", the agent that started "${input.agent.handle}", may re-key it here, and ` +
            'only sending its own key. This request was not that. Nothing was written.',
      403,
    )
  }
  const card = input.agent.role ?? A_ROW_WITH_NO_ROLE_READS_AS
  const starter = whoAnswersForTheKeysOf(input.agent)
  return sqlite.transaction(() => {
    const keysRevoked = revokeEveryLiveKeyHeldBy(
      'agent',
      input.agent.id,
      `"${handleOf(starter.id)}", the agent that started "${input.agent.handle}", gave it a new key.`,
    )
    const at = now()
    const filed = createRecordWithReport({
      workspaceId: input.workspaceId,
      kind: 'role_request',
      title: `${handleOf(starter.id)} gave ${input.agent.handle} a new key`,
      data: {
        asking: card,
        holding: card,
        asker: { kind: 'agent', id: input.agent.id },
        answersTo: starter,
        because: input.because ?? 'its starter gave it a new key',
        answer: 'granted',
        answeredAt: at,
        extra: { newKey: { agent: input.agent.id, grantedAs: 'its-starter', keyAnsweredAt: at } },
      },
      actor: input.actor,
    })
    const key = makeAnAgentKey(input.agent.id, howThisCallProvesTheKeyItMakes(input.actor))
    return { requestId: filed.record.id, key, keysRevoked }
  })()
}

/**
 * WHAT ONE PRESS ON A WAITING ASK DOES, in the one sentence every surface reads, or null because the
 * record is not a waiting ask. The needs-you list, the waiting list, the agent's page and the ask's
 * own page all read this, so they cannot come to describe one press differently (invariant 9).
 */
export function whatAPressOnThisAskDoes(record: PanelRecord): { press: WhatAPressOnAnAskDoes; says: string; admits?: WhatAdmitting } | null {
  if (record.kind !== 'role_request') return null
  const answered = record.data['answer']
  if (typeof answered === 'string' && answered !== '') return null
  const asking = typeof record.data['asking'] === 'string' ? record.data['asking'] : ''
  const askerData = record.data['asker'] as { id?: unknown } | undefined
  const asker = typeof askerData?.id === 'string' ? askerData.id : ''
  const newKey = aNewKeyAsk(record)
  if (newKey !== null) {
    return {
      press: 'new-key',
      says:
        `"${theNameThisAgentIsReadBy(newKey.agent)}" asks for a new key. One press revokes every key it holds now, and then it may ` +
        'ask once more and be answered one new key, once.',
    }
  }
  const waiting = aWaitingSelfRegistration(record)
  if (waiting !== null) {
    // THE FACTS GO WITH THE ENGLISH, so a page says the same sentence in its own words from them.
    const admits: WhatAdmitting = { waits: whyThisRegistrationWaits(record), alsoRecords: whatAdmittingItAlsoRecords(waiting) }
    return { press: 'admit', says: whatAdmittingSays(sayInEnglish, theNameASelfRegistrationIsReadBy(waiting), asking, admits), admits }
  }
  return {
    press: 'card',
    says: `"${theNameThisAgentIsReadBy(asker)}" asks for the ${asking} card. An agent cannot give itself a card, so only a press can.`,
  }
}

/**
 * THE PRESS AN ASK'S OWN PAGE DRAWS FOR THE PERSON, or null because the record is not a waiting ask.
 * The same shape the agent's page draws its card ask in, so one component draws both.
 */
export function thePressOnThisAsk(record: PanelRecord, reader: WhoReadsAnAsk = 'the-person'): WaitingCardAsk | null {
  const press = whatAPressOnThisAskDoes(record)
  if (press === null) return null
  // WHO MAY PRESS, said to the reader on an ask that waits for the person: a secretary they raised may answer for
  // them, giving only what its own card may give, and the answer door (src/server/api/roles.ts) is
  // where that is enforced. A new-key ask says nothing here, because nobody has decided who
  // besides them answers one.
  const answersTo = record.data['answersTo'] as { kind?: unknown } | undefined
  const whoMayPress: WhoMayPressAnAsk | null =
    answersTo?.kind !== 'person' || press.press === 'new-key' ? null : reader === 'the-person' ? 'you' : 'you-under-his-raise'
  if (reader !== 'the-person' && whoMayPress === null) return null
  const asking = typeof record.data['asking'] === 'string' ? record.data['asking'] : ''
  const waiting = aWaitingSelfRegistration(record)
  const newKey = aNewKeyAsk(record)
  const askerData = record.data['asker'] as { id?: unknown } | undefined
  const asker = typeof askerData?.id === 'string' ? askerData.id : ''
  const handle = waiting !== null ? waiting.handle : handleOf(newKey !== null ? newKey.agent : asker)
  return {
    requestId: record.id,
    handle,
    name: waiting !== null ? theNameASelfRegistrationIsReadBy(waiting) : theNameThisAgentIsReadBy(newKey !== null ? newKey.agent : asker),
    asking,
    admitsAnAgent: waiting !== null,
    press: press.press,
    says: press.says,
    ...(press.admits === undefined ? {} : { admits: press.admits }),
    ...(whoMayPress === null ? {} : { whoMayPress }),
  }
}

/** Who is reading an ask's page and may press it: the person, or a secretary they raised. Nobody else is asked. */
export type WhoReadsAnAsk = 'the-person' | 'a-raised-secretary'

/**
 * WHAT A KEY ASK'S PAGE AND ITS LINE ON THE WAITING LIST SHOW, or null because the record is neither a
 * new-key ask nor a waiting registration. Finding 83, mend b2: where the ask came from, and when
 * the agent's current key was last used.
 *
 * WHICH AGENT. A new-key ask names its agent by registry id, a STORED reference read with the stored
 * reader. A waiting registration names a handle: the agent the person's press admitted, where the row
 * records one, and otherwise the live agent bearing the handle, or none.
 */
export function whatThisKeyAskShows(record: PanelRecord): WhatAnAskShows | null {
  const newKey = aNewKeyAsk(record)
  if (newKey !== null) {
    const row = theOneAgentAStringNames(sqlite, newKey.agent)
    return whatThisAskShows(record, row === null ? null : row.id, row?.handle ?? newKey.agent)
  }
  const waiting = aWaitingSelfRegistration(record)
  if (waiting === null) return null
  const admitted = theFirstKeyOn(record)?.agent ?? null
  const agentId = admitted ?? agentByHandle(waiting.handle)?.id ?? null
  return whatThisAskShows(record, agentId, waiting.handle)
}

/**
 * USED BY BOTH REGISTRATION DOORS THAT CAN JOIN A LIVE AGENT'S ROW: POST /api/agents/started and
 * POST /api/records with kind `agent`. One sentence, so the two cannot come to say different things.
 *
 * WHAT A REGISTRATION THAT JOINED A LIVE AGENT'S ROW IS TOLD INSTEAD OF A KEY. Keys wave, round 5.
 *
 * Said by either door whenever the handle it was sent already belonged to a live agent,
 * whether or not that agent ever held a key. Every clause holds on both paths: the new-key ask of
 * `askForANewKey` in src/server/lib/newkey.ts is filed for any live agent, keyed or not, and
 * `whoAnswersForTheKeysOf` sends it to the starter only while the starter is a live agent, else to
 * the person, who may always answer it.
 */
export function whatAJoinedRowIsAnsweredInsteadOfAKey(handle: string): string {
  return (
    `"${handle}" is already a live agent, so this registration was joined to its row and no new agent was ` +
    'made. No key is answered to a registration that joins an existing row. If that agent holds no key, or ' +
    'has lost it, it asks for one itself: POST /api/agents/register-myself with "newKey": true (the tool\'s ' +
    '--new-key). The person answers that ask, and so may the live agent recorded as its starter.'
  )
}
