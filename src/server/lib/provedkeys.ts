// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH KEYS WERE MADE THROUGH A PROVED PATH, AND WHICH LIVE AGENTS HOLD NONE. Point 3 of a decision:
 * the press that closes the key window refuses while a live agent holds no
 * proved key. List SuiA61s5C7KO is the measurement behind it: 222 of the 233 keys agents held
 * had no proved holder.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A KEY RECORDS
 * ---------------------------------------------------------------------------------------
 *
 * When the office makes a key it stores one word on the `held_keys` row (`mint_proved_by`, migration
 * 0180): how the call that made the key was proved. The words are `HowAKeysMintWasProved` below.
 * Every door that makes a key works the word out here, with one of the three functions below, and
 * hands it to keys.ts, which writes it. A key made before migration 0180 holds NULL, which means
 * nobody recorded it. It is read as unproved and never guessed proved.
 *
 * ---------------------------------------------------------------------------------------
 * AN AGENT'S KEY PROVES A NEW KEY ONLY WHEN THAT AGENT'S OWN KEYS ARE PROVED
 * ---------------------------------------------------------------------------------------
 *
 * A starter re-keys its workers with its own key, and a run key is made on a starter's key. If the
 * starter's own key was given by name, a key it makes is no better, and calling it proved would let
 * a key given by name become a proved one in one step. The request does not say WHICH of the
 * starter's live keys it carried, so the rule is exact the only way it can be: the new key is proved
 * when every live key the starter holds is proved. The starter's own proved re-key revokes every key
 * it held before, so a starter that went through a proved path meets this.
 *
 * ---------------------------------------------------------------------------------------
 * A GRANT IS PROVED AS ITS PRESS WAS
 * ---------------------------------------------------------------------------------------
 *
 * A granted new-key ask and an admitted registration hand their key out later, to the agent's own
 * ask. The press that granted it is on the revision that wrote `answer: granted`, and that revision
 * keeps how a key proved the press (`revisions.proved_by`, migration 0178). The key is proved as that
 * press was. It is read from there, the one place the fact is stored, and not written a second time.
 */

import { sqlite } from '../db/client.ts'
import { theOneAgentAStringNames } from './agent-references.ts'
import { thisAgentWasRegisteredWithNoKeyOfItsOwn } from '../db/this-agent-was-registered-with-no-key-of-its-own.ts'
import type { Actor } from './records.ts'
import { isMoleOffice } from '@shared/participants.ts'
import { KEY_MINT_WORDS_RENAMED, nowSaid } from '@shared/renamed-words.ts'
import type {
  AnAgentWithNoProvedKey,
  TheLiveAgentsWithNoProvedKey,
  WhyAnAgentHoldsNoProvedKey,
} from '@shared/keywindow.ts'

/**
 * HOW THE CALL THAT MADE A KEY WAS PROVED. The word `held_keys.mint_proved_by` stores.
 *
 *   the-persons-press       the person's press, made with their key: a new-key grant, an admitted
 *                           registration, a credential they confirmed
 *   the-persons-key         the call carried the person's key
 *   the-offices-key         the call carried the office's own key: a run the office started
 *   a-proved-agents-key     the call carried an agent's key, and every live key that agent held was
 *                           proved: a starter's re-key or registration, a run key, a world's key
 *   an-unproved-agents-key  the call carried an agent's key, and that agent held a key that was not
 *   no-key                  the call carried no key: a registration by name while the window was
 *                           open, or a press made with no key
 *
 * Rows written before 1 October 2026 may hold `his-press` and `his-key`, the earlier words for the first
 * two. `KEY_MINT_WORDS_RENAMED` in src/shared/renamed-words.ts reads them as the new ones.
 */
export type HowAKeysMintWasProved =
  | 'the-persons-press'
  | 'the-persons-key'
  | 'the-offices-key'
  | 'a-proved-agents-key'
  | 'an-unproved-agents-key'
  | 'no-key'

/** The four words that make a key proved. NULL and the other two do not. */
const A_PROVED_MINT: ReadonlySet<string> = new Set<HowAKeysMintWasProved>([
  'the-persons-press',
  'the-persons-key',
  'the-offices-key',
  'a-proved-agents-key',
])

/** Whether a stored word makes its key proved. NULL, nobody recorded it, does not. An earlier word reads as its new one. */
export function aKeyMadeThisWayIsProved(word: string | null): boolean {
  return word !== null && A_PROVED_MINT.has(nowSaid(KEY_MINT_WORDS_RENAMED, word))
}

/**
 * HOW THIS CALL PROVES A KEY IT MAKES NOW. For every door that makes a key on the request in hand:
 * a registration, a starter's re-key, a run key, a first key while the window is open.
 */
export function howThisCallProvesTheKeyItMakes(actor: Actor): HowAKeysMintWasProved {
  if (actor.provedBy === 'the-person-key') return 'the-persons-key'
  if (actor.provedBy === 'the-office-key') return 'the-offices-key'
  if (actor.provedBy === 'an-agent-key') {
    return actor.keyHolder === undefined ? 'an-unproved-agents-key' : howThisAgentsOwnKeyProvesAKey(actor.keyHolder)
  }
  return 'no-key'
}

/**
 * HOW THIS PRESS PROVES A KEY IT MAKES NOW. The same as a call, except that the person's key names
 * their press: the credential confirm, the one press of theirs that binds a key at once.
 */
export function howThisPressProvesTheKeyItMakes(actor: Actor): HowAKeysMintWasProved {
  const how = howThisCallProvesTheKeyItMakes(actor)
  return how === 'the-persons-key' ? 'the-persons-press' : how
}

/** Read the proof on the revision that wrote this message's current start press. */
export function howTheMessageStartWasProved(messageId: string): HowAKeysMintWasProved {
  const press = sqlite.prepare(
    "SELECT v.proved_by FROM revisions v JOIN records r ON r.id = v.record_id " +
    "WHERE r.id = ? AND r.kind = 'message' AND r.deleted_at IS NULL " +
    "AND json_extract(v.data, '$.runWasAskedFor') = json_extract(r.data, '$.runWasAskedFor') " +
    'ORDER BY v.seq LIMIT 1',
  ).get(messageId) as { proved_by: string | null } | undefined
  if (press?.proved_by === 'the-person-key') return 'the-persons-press'
  // The office may ask for its own inspection. An unproved press stays unproved.
  if (press?.proved_by === 'the-office-key') return 'the-offices-key'
  return 'no-key'
}

/**
 * HOW A KEY MADE ON THIS AGENT'S OWN KEY IS PROVED: proved when every live key the agent holds is.
 * `holder` is a stored string, `held_keys.whose_id` or `Actor.keyHolder`, read with the stored reader.
 */
export function howThisAgentsOwnKeyProvesAKey(holder: string): 'a-proved-agents-key' | 'an-unproved-agents-key' {
  const agent = theOneAgentAStringNames(sqlite, holder)
  if (agent === null) return 'an-unproved-agents-key'
  const live = theKeysOfEveryAgent().get(agent.id)?.live ?? []
  return live.length > 0 && live.every(aKeyMadeThisWayIsProved) ? 'a-proved-agents-key' : 'an-unproved-agents-key'
}

/**
 * HOW THE GRANT ON THIS ASK WAS PROVED, for the key the ask hands out after it. Null because no
 * revision of the ask says `answer: granted`, or because the revision that does recorded no key.
 *
 * NULL AND NOT `no-key` WHERE THE REVISION HOLDS NO KEY: a revision written before migration 0178 holds
 * NULL too, and nothing on the row says which it is. So this says nobody recorded it, which is true of
 * both, rather than claiming the press carried no key.
 */
export function howTheGrantOnThisAskWasProved(requestId: string): HowAKeysMintWasProved | null {
  const grant = theRevisionThatGrantedThisAsk(requestId)
  if (grant === null || grant.provedBy === null) return null
  if (grant.provedBy === 'the-person-key') return 'the-persons-press'
  if (grant.provedBy === 'the-office-key') return 'the-offices-key'
  if (grant.provedBy !== 'an-agent-key') return null
  return howThisAgentsOwnKeyProvesAKey(grant.keyHolder)
}

/** What the revision that granted an ask records about who pressed. See `theRevisionThatGrantedThisAsk`. */
export interface TheRevisionThatGranted {
  /** How a key proved the request that wrote it, as `revisions.proved_by` holds it, or null for none recorded. */
  provedBy: string | null
  /**
   * THE KEY'S HOLDER, a STORED string: `proved_holder` where it differs from the name the headers
   * gave, else that name. It names who pressed only where `provedBy` says a key proved the request.
   */
  keyHolder: string
}

/**
 * THE REVISION THAT GRANTED THIS ASK, or null because no revision of it says `answer: granted`.
 *
 * IT IS THE FIRST SUCH REVISION. An answer is written once (the answer doors refuse a second press), so
 * the first revision saying granted is the grant; later ones saying it are the office marking the key
 * collected. Both the mint's proof above and the withdrawal check in src/server/lib/newkey.ts read the
 * grant here, so the two cannot find different grants.
 */
export function theRevisionThatGrantedThisAsk(requestId: string): TheRevisionThatGranted | null {
  const row = sqlite
    .prepare(
      "SELECT proved_by, proved_holder, actor_id FROM revisions WHERE record_id = ? AND json_extract(data, '$.answer') = 'granted' " +
        'ORDER BY seq LIMIT 1',
    )
    .get(requestId) as { proved_by: string | null; proved_holder: string | null; actor_id: string } | undefined
  if (row === undefined) return null
  let keyHolder = row.actor_id
  if (row.proved_holder !== null) {
    const said = JSON.parse(row.proved_holder) as { id?: unknown }
    if (typeof said.id === 'string' && said.id !== '') keyHolder = said.id
  }
  return { provedBy: row.proved_by, keyHolder }
}

/** Every agent's keys, by the agent's registry id: the words of its live keys, and whether it ever held one. */
function theKeysOfEveryAgent(): Map<string, { live: (string | null)[]; everHeld: boolean }> {
  const rows = sqlite
    .prepare("SELECT whose_id, mint_proved_by, revoked_at FROM held_keys WHERE whose_kind = 'agent'")
    .all() as { whose_id: string; mint_proved_by: string | null; revoked_at: string | null }[]
  // A KEY'S HOLDER IS A STORED STRING. It is an agent id since criterion I5 and a handle on older rows,
  // so each is read with the stored reader, once per distinct string. A string that names no one agent
  // is nobody's key here.
  const named = new Map<string, string | null>()
  const byAgent = new Map<string, { live: (string | null)[]; everHeld: boolean }>()
  for (const row of rows) {
    if (!named.has(row.whose_id)) named.set(row.whose_id, theOneAgentAStringNames(sqlite, row.whose_id)?.id ?? null)
    const id = named.get(row.whose_id) ?? null
    if (id === null) continue
    const held = byAgent.get(id) ?? { live: [], everHeld: false }
    held.everHeld = true
    if (row.revoked_at === null) held.live.push(row.mint_proved_by === null ? null : nowSaid(KEY_MINT_WORDS_RENAMED, row.mint_proved_by))
    byAgent.set(id, held)
  }
  return byAgent
}

/** Why an agent with these keys holds no proved key, or null because it holds one. */
function whyNoProvedKey(keys: { live: (string | null)[]; everHeld: boolean } | undefined): WhyAnAgentHoldsNoProvedKey | null {
  if (keys === undefined || !keys.everHeld) return 'never-held-a-key'
  if (keys.live.length === 0) return 'every-key-revoked'
  if (keys.live.some(aKeyMadeThisWayIsProved)) return null
  const kinds = new Set(keys.live)
  if (kinds.size > 1) return 'only-unproved-keys-of-several-kinds'
  const only = keys.live[0] ?? null
  if (only === null) return 'only-keys-whose-proof-nobody-recorded'
  if (only === 'no-key') return 'only-keys-given-without-a-key'
  return 'only-keys-given-on-an-unproved-key'
}

/**
 * EVERY LIVE AGENT THAT HOLDS NO PROVED KEY, BY HANDLE, WITH WHY. The one reader of that question.
 *
 * A live agent is a registry row that is not retired. A key counts when it is not revoked. An empty
 * list means every live agent holds at least one proved key.
 *
 * MOLE OFFICE'S OWN ROW IS NOT AN AGENT (`isMoleOffice`), and it is left out. It sits in the agent
 * registry so its system lines have a name, and the office's own processes prove themselves with the
 * office's key from the key file, which is never a `held_keys` row.
 */
export function theLiveAgentsWithNoProvedKey(): AnAgentWithNoProvedKey[] {
  const agents = sqlite
    .prepare('SELECT id, handle FROM agents WHERE retired = 0 ORDER BY handle, id')
    .all() as { id: string; handle: string }[]
  const keys = theKeysOfEveryAgent()
  const found: AnAgentWithNoProvedKey[] = []
  for (const agent of agents) {
    if (isMoleOffice({ kind: 'agent', id: agent.id })) continue
    const why = whyNoProvedKey(keys.get(agent.id))
    if (why !== null) found.push({
      id: agent.id,
      handle: agent.handle,
      why,
      registeredWithNoKeyOfItsOwn: thisAgentWasRegisteredWithNoKeyOfItsOwn(agent.id),
    })
  }
  return found
}

/** Whether the live agent with this registry id holds a proved key. */
export function thisLiveAgentHoldsAProvedKey(agentId: string): boolean {
  return whyNoProvedKey(theKeysOfEveryAgent().get(agentId)) === null
}

/**
 * HOW MANY AGENTS THE SENTENCE NAMES. List SuiA61s5C7KO counted 287 live agents, 54 of which
 * never held a key, and 222 of the 233 keys held had no proved holder; every key made before migration
 * 0180 reads as unproved here. So on the office the list starts at hundreds of agents. A sentence naming
 * all of them is a page of names nobody can act on at once, so it names the first 20 by handle and
 * says how many more there are. The reply's `agents` list is
 * always whole, for a tool that works through them.
 */
export const THE_SENTENCE_NAMES_AT_MOST = 20

/** The words for each reason, inside the sentence. */
const WHY_IN_WORDS: Record<WhyAnAgentHoldsNoProvedKey, string> = {
  'never-held-a-key': 'never held a key',
  'every-key-revoked': 'every key it held is revoked',
  'only-keys-given-without-a-key': 'its keys were given to a request that carried no key',
  'only-keys-whose-proof-nobody-recorded': 'nobody recorded how its keys were given',
  'only-keys-given-on-an-unproved-key': "its keys were given on an agent's key that was not proved",
  'only-unproved-keys-of-several-kinds': 'none of its keys was given through a proved path',
}

/**
 * WHY THE KEY WINDOW MAY NOT CLOSE YET, or null because every live agent holds a proved key. The
 * press refuses with `says`, and GET /api/office/key-window answers it so the person's page shows it first.
 */
export function whyTheKeyWindowMayNotCloseYet(): TheLiveAgentsWithNoProvedKey | null {
  const agents = theLiveAgentsWithNoProvedKey()
  if (agents.length === 0) return null
  const count = agents.length
  const namedAgents = agents.slice(0, THE_SENTENCE_NAMES_AT_MOST)
  const named = namedAgents
    .map((agent) => `"${agent.handle}" (${WHY_IN_WORDS[agent.why]})`)
    .join(', ')
  const more = count - Math.min(count, THE_SENTENCE_NAMES_AT_MOST)
  const marked = agents.filter((agent) => agent.registeredWithNoKeyOfItsOwn)
  const markedAmongNamed = marked.filter((agent) => namedAgents.includes(agent))
  const waysOut = markedAmongNamed.map((agent) =>
    `"${agent.handle}" was registered with no key of its own, so only retiring it clears it for good.`,
  )
  const markedNotNamed = marked.length - markedAmongNamed.length
  if (markedNotNamed > 0) {
    waysOut.push(markedNotNamed === 1
      ? `1 of the ${String(more)} not named was registered with no key of its own, so only retiring it clears it for good.`
      : `${String(markedNotNamed)} of the ${String(more)} not named were registered with no key of their own, so only retiring them clears them for good.`)
  }
  const unmarked = count - marked.length
  if (unmarked > 0) {
    const recipient = marked.length === 0
      ? count === 1 ? 'it' : 'each one'
      : unmarked === 1 ? 'the other one' : `each of the other ${String(unmarked)}`
    waysOut.push(
      `Give ${recipient} a key through a proved path: the person's press on its new-key ask, or a re-key by the agent ` +
      'that started it, sending its own proved key. Or retire it.',
    )
  }
  const says =
    `The window cannot be closed yet: ${String(count)} live ${count === 1 ? 'agent holds' : 'agents hold'} no proved key. ` +
    (count === 1 ? `It is ${named}. ` : more === 0 ? `They are ${named}. ` : `The first ${String(THE_SENTENCE_NAMES_AT_MOST)} are ${named}, and ${String(more)} more. `) +
    waysOut.join(' ')
  return { count, agents, says }
}
