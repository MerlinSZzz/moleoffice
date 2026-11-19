// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CORE OF A DECISION, AN AGENT'S HANDLE AND CARD, AND THE DOORS THAT CHANGE THEM: the fields
 * a decision is read by, the checks on an agent's handle, notes and start folder, the chain of
 * starters, the card doors, the retire door and the start-folder door. They were moved out of
 * src/server/lib/records.ts with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`. This file does not import records.ts.
 */
import { DECISION_KIND } from '@shared/decision-kind.ts'
import { decisionCoreFieldKeys } from '@shared/kinds.ts'
import { now } from '@shared/now.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { isARole, theCardOffTheTree, theRoleWordsSaid } from '@shared/roles.ts'
import { theChainUpWith } from '@shared/the-chain-up-with.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import type { PanelRecord, RecordKind } from '@shared/types.ts'
import { theStartFolderAsItIsStored } from '../../../config/start-folder.mjs'
import { agentForRecord } from '../../db/agent-for-record.ts'
import { SESSION_KIND } from '../../db/agent-identity.ts'
import { sqlite } from '../../db/client.ts'
import { readParticipant } from '../../db/read-participant.ts'
import { isJsonObject } from '../../db/the-decision-names-this-fork.ts'
import { whyTheRegistryCannotFollow } from '../../db/why-the-registry-cannot-follow.ts'
import { AGENT_KIND, assertHandleIsFree, messagesStillWaitingFor } from '../inbox.ts'
import { PanelError } from '../panel-error.ts'
import type { AStarter, RegisteredAgent } from '../participants.ts'
import { theCanonicalAgentId } from '../registry-aliases/worker-runs.ts'
import { theRoleCards, theRoleCardsAreRead } from '../roles.ts'
import type { Actor } from './actor.ts'
import { theForkYouWriteInstead, type HumanOnlyVerb } from './human-only.ts'
import { aRaiseCarriesIt } from './own-words.ts'
import { getRecord } from './reading.ts'
import { theCallerIsTheOfficeItself, theProvedPerson } from './served-doors.ts'
import { whoRecordedIt } from './who-recorded-it.ts'

/** Whether a change would move any field that belongs to the decision itself. */
export function theDecisionItselfWouldChange(write: { subject: string; data: unknown; title?: string }): boolean {
  const held = getRecord(write.subject)
  const incoming = isJsonObject(write.data) ? write.data : {}
  if (held !== null && write.title !== undefined && write.title !== held.title) return true
  const before = held !== null && isJsonObject(held.data) ? held.data : {}
  return decisionCoreFieldKeys().some(
    (key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(incoming[key] ?? null),
  )
}

/** Whether this actor is the one the decision records as having written it down. */
export function theDecisionWasRecordedBy(actor: Actor, subject: string): boolean {
  const held = getRecord(subject)
  if (held === null || !isJsonObject(held.data)) return false
  return held.data['recorded_by'] === whoRecordedIt(actor)
}

/** The refusal for an agent that would change a decision it did not make and does not hold the person's authority for. */
export function theCoreOfADecisionIsItsMakers(actor: Actor, subject: string, verb: HumanOnlyVerb): never {
  const held = getRecord(subject)
  const maker = held !== null && isJsonObject(held.data) ? held.data['recorded_by'] : null
  throw new PanelError(
    `Changing a decision is changing the decision itself, and only whoever made it, or the person, may do that. ` +
      `This decision was recorded by ${maker === null ? 'nobody Mole Office can name' : `"${String(maker)}"`}, and ` +
      `this request came from ${actor.type} "${actor.id}". Nothing was written and decision ${subject} is exactly as ` +
      `it was.\n\n` +
      `THE DECISION AND THE NOTES AROUND IT. The decision itself is the option taken, the words why, the title and ` +
      `the words added after the press; only whoever made it, and the person, may change those. The notes around it ` +
      `— when to revisit it, what was rejected, its links and where it came from — may be changed by any agent, and ` +
      `every such change says who and when in the record's history. Change one of those instead, or ask whoever made ` +
      `this decision; if the person has said the words, a warrant carrying them opens this too.\n\n` +
      // AND THE ROUTE THAT IS OPEN TO IT, in the words every other human-only refusal uses. Written
      // by `theForkYouWriteInstead` rather than typed again here: an agent refused a governance act
      // is told the one thing it may write, with the id already filled in, and a second wording of
      // that would be the defect this file keeps finding. Two tests hold it — guard-human-only and
      // patch — and this refusal dropped it when criterion P76 gave decisions a core of their own.
      theForkYouWriteInstead(DECISION_KIND as RecordKind, verb, subject),
    403,
  )
}

/**
 * ONE SIGNED ITEM DOES NOT CARRY A REGULATION. A signed item is the person's signature on one act an agent carries out,
 * and before each office kept its own list it was refused a regulation as the grant was. The grant's answer about
 * writing a regulation is now the list's (`record:regulation`, src/shared/what-the-grant-carries.ts); a signed item is
 * not the grant, so it keeps this refusal until somebody decides otherwise. The person's quoted words still carry it.
 */
export function aSignedItemDoesNotCarryARegulation(actor: Actor): PanelError {
  return new PanelError(
    `A regulation is the person's alone to write, and "${actor.id}" is carrying out one item the person signed, which does ` +
      'not carry it. Nothing was written. Tell the person what the regulation should say, and they write it.',
    403,
    undefined,
    undefined,
    'A signed item does not carry writing a regulation.',
  )
}

/**
 * THE THIRD GOVERNANCE ACT: TAKING A FORK OUT OF THE QUEUE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY WRITING THE DECISION BEING GUARDED WAS NOT ENOUGH
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/needs-you` is the owner's whole governance queue and it is built from live proposals:
 * `readForks` in lib/forks.ts selects `kind = 'proposal' AND deletedAt IS NULL`. So a soft delete
 * takes a fork out of the queue, and until this rule existed nothing stopped an agent doing it.
 *
 * `proposal` is deliberately not in `HUMAN_ONLY_KINDS` — an agent FILES forks, that is the whole
 * route `humanOnlyRefusal` sends it down — so `assertMayWrite` let a delete through. Writing the
 * decision was refused, pointing a decision at a fork was refused, and removing the question was
 * not. An agent could have answered "nothing is waiting on you" by emptying the list.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS THE NARROWEST RULE THAT COVERS THE ACT
 * ---------------------------------------------------------------------------------------
 *
 * A non-human actor may not delete an UNSETTLED proposal. Three things are left alone on purpose:
 *
 *   · a SETTLED proposal, which a decision the person wrote already answers. It is not in the
 *     queue, so deleting it takes nothing from them;
 *   · the person deleting their own fork, in any state. The queue is theirs;
 *   · every other kind. This is not a permission layer and must not grow into one.
 *
 * A request that sent no actor headers is refused for the same reason `assertMayWrite` refuses one
 * on a decision: an absent header is not evidence that a person made the act.
 *
 * IT DOES NOT GUARD RESTORE, and that is not an oversight. Restoring a fork puts the question back
 * in front of the person, which is the direction this rule protects.
 */
/**
 * AN AGENT WITH UNFINISHED MAIL IS NOT DELETED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT PROTECTS, AND WHY IT IS NOT A PERMISSION RULE
 * ---------------------------------------------------------------------------------------
 *
 * A durable agent's inbox is a query over `agent_messages`: every row naming it as recipient. Delete
 * the record and those rows name an id nothing has, so the person's words are addressed to nowhere.
 * They are not gone — the words are still in their conversations — but nothing will ever hand them
 * to anybody, and no screen will say so.
 *
 * IT REFUSES ANYBODY, NOT AN ACTOR TYPE. `assertMayRemoveAFork` above refuses a non-human because
 * the act takes a question out of the PERSON'S queue. This is not that: a person deleting an agent
 * with three comments waiting for it strands them exactly as an agent would. So the rule is about
 * the state of the record and not about who is asking.
 *
 * RETIRING IS THE WAY OUT AND THE REFUSAL SAYS SO, with the request to send. Retiring takes an
 * agent off the recipient picker for NEW messages and changes nothing else: it still resolves, its
 * inbox is still there, and it can be made active again.
 *
 * WITH AN EMPTY INBOX A DELETE IS ALLOWED, and the handled rows keep the id — a broken pointer the
 * delete reply already names in `brokenLinksAt`.
 *
 * THE REFUSAL OFFERS NO SECOND WAY OUT, and that is deliberate. An earlier draft named a route for
 * moving an inbox to another agent. That route does not exist, and it is not a small one: moving a
 * message rewrites who the person's words were addressed to, and whether an agent may correct a
 * person's addressee is a question nobody has answered. A refusal that sends somebody to a 404 at
 * the moment they are blocked is worse than one that offers one real thing to do.
 */
/**
 * THE HANDLE ON A WRITE IS ONE NOBODY ELSE HOLDS, checked before it is stored.
 *
 * `exceptRecordId` is the record being patched, so a write that leaves the handle alone is not
 * refused for colliding with itself.
 */
export function checkAgentHandle(data: unknown, workspaceId: string, exceptRecordId: string | null): void {
  if (!isJsonObject(data)) return
  const handle = data['handle']
  // ABSENT IS `validateRecordData`'S BUSINESS, not this function's: `handle` is a required field and
  // the completeness reader is what names it. Answering a missing field here would say something
  // about uniqueness when the real complaint is that nothing was sent.
  if (handle === undefined) return
  assertHandleIsFree(typeof handle === 'string' ? handle : String(handle), workspaceId, exceptRecordId)
  // AND ACROSS THE INSTALLATION, TWO LIVE AGENTS NEVER SHARE A HANDLE. Criterion I3. A rename onto a
  // handle another live agent bears, or making a retired agent active again while another live agent
  // bears its handle, is refused here in words, before anything is written.
  const refused = whyTheRegistryCannotFollow({ id: exceptRecordId, handle, state: data['state'] })
  if (refused !== null) throw new PanelError(refused, 409)
}

/**
 * WHERE AN AGENT KEEPS ITS NOTES IS AN ABSOLUTE PATH, OR IT IS REFUSED.
 *
 * Criterion H3. The folder is read by the worker, in a process started somewhere else, so a relative
 * path would be resolved against a directory nobody meant and would either read the wrong folder or
 * read none. That is a silent wrong answer rather than a missing one, which is the shape this
 * repository refuses. `~` is refused for the same reason: it is a shell's word and node does not
 * expand it, so a path written that way names a folder called `~` in the current directory.
 *
 * NOTHING IS CHECKED ABOUT WHETHER THE FOLDER EXISTS. It is on the machine the RUN starts on, and a
 * write may be made from anywhere; the bundle says plainly when it could not read it. An existence
 * check here would refuse a correct path written before the folder was made.
 */
export function checkAgentNotes(data: unknown): void {
  if (!isJsonObject(data)) return
  const notes = data['notes']
  if (notes === undefined || notes === null || notes === '') return
  const said = typeof notes === 'string' ? notes : String(notes)
  if (said.startsWith('/')) return
  throw new PanelError(
    `"notes" is ${JSON.stringify(said)}, which is not an absolute path. It says where this agent keeps its own ` +
      'notes, and the folder is read by a run started in some other directory, so a relative path would name a ' +
      'folder nobody meant. Write it from the root, beginning with "/". Nothing was written.',
    400,
  )
}

/**
 * A START FOLDER IS STORED IN ONE SPELLING, OR IT IS REFUSED.
 *
 * `theStartFolderAsItIsStored` in src/config/start-folder.mjs is the
 * one rule and the one set of words; this is the record's own write paths asking it. The doors that
 * set the field normalise what they were handed through the same function, so anything reaching a
 * record in another spelling came in some other way and is refused rather than quietly matched.
 *
 * WHY THE SPELLING MATTERS ENOUGH TO REFUSE. The session hook names an agent by comparing this
 * folder with the directory a session started in, on the exact spelling. Two spellings of one folder
 * would make one of them match nothing, silently, and a silent wrong answer is the shape this
 * repository refuses.
 *
 * NOTHING IS CHECKED ABOUT WHETHER THE FOLDER EXISTS, for the reason the sibling check above gives:
 * the folder is on the machine the SESSION starts on, and a write may be made from anywhere.
 */
export function checkAgentStartFolder(data: unknown): void {
  if (!isJsonObject(data)) return
  const said = data['startFolder']
  if (said === undefined || said === null || said === '') return
  const read = theStartFolderAsItIsStored(said)
  if (read.folder !== null && read.folder === said) return
  const why =
    read.because ??
    `Write it as "${String(read.folder)}", which is the one spelling this office stores a folder in.`
  throw new PanelError(`"startFolder" cannot be ${JSON.stringify(said)}. ${why} Nothing was written.`, 400)
}

/**
 * A RUN NAMES ITS AGENT BY THE AGENT'S CANONICAL REGISTRY ID. A run written with an alias filed for an agent in
 * `servingAgentId` is stored with that agent's canonical id. An id the run already stores is left as it is, because it is
 * history: `stored` is that id, and undefined on a create. Both doors call it after `canonicalise`.
 */
export function theRunsAgentByItsCanonicalId<T>(kind: string, data: T, stored: unknown): T {
  if (kind !== SESSION_KIND || !isJsonObject(data)) return data
  const asked = data['servingAgentId']
  if (typeof asked !== 'string' || asked === '' || asked === stored) return data
  const canonical = theCanonicalAgentId(sqlite, asked)
  return canonical === asked ? data : ({ ...data, servingAgentId: canonical } as T)
}

/**
 * THE CHAIN OF STARTERS ABOVE AN AGENT: who started it, who started that one, and so on up, read with `theChainUpWith`
 * from the agent's registry row. Empty for an agent no row answers. Which parent a caller may name
 * (`whyThisCallerMayNotNameThisParent`) and who may file a session for an agent (`whyThisCallerMayNotFileASessionFor`)
 * both ask it, so the two doors read one chain. Each gives `theStarterEachStringNames`, so a run start reads the rows
 * its chains name and not every agent.
 */
export function theChainOfStartersAbove(agent: ParticipantRef, theAgentThisNames: (id: string) => AStarter | null): ParticipantRef[] {
  const row = readParticipant(agent) as RegisteredAgent | null
  return theChainUpWith(row?.startedBy ?? null, theAgentThisNames).chain
}

/**
 * HOW MANY WRITES ARE THE PERSON'S PRESS THAT ADMITS A WAITING REGISTRATION. Opened only by
 * `asTheirPressThatAdmitsARegistration`, after it has checked the press, and closed in a `finally`.
 */
let theirPressIsAdmittingARegistration = 0

/**
 * WHETHER THE PERSON IS THE ONE FILING. Everywhere but one place this is `theProvedPerson`: their key, or the office's
 * own program. The person's press that admits a waiting registration is one of their own acts, so there they are read as their other
 * acts read them (`thePersonIsProved`): that also counts a request with no key that this computer's own program sent
 * while their key window is open.
 */
export function thePersonIsFilingThisSession(actor: Actor): boolean {
  return theirPressIsAdmittingARegistration > 0 ? thePersonIsProved(actor) || aRaiseCarriesIt(actor) : theProvedPerson(actor)
}

/** Whether a registered agent holds the inspector card: the card off the tree of cards, as `whoHoldsTheInspectorCard` reads it. */
export function holdsTheInspectorCard(agent: ParticipantRef): boolean {
  if (agent.kind !== 'agent' || !theRoleCardsAreRead()) return false
  const card = theCardOffTheTree(theRoleCards())
  if (card === null) return false
  const row = readParticipant(agent) as RegisteredAgent | null
  return row !== null && row.role === card.name
}

/**
 * THE PERSON'S PRESS THAT ADMITS A WAITING REGISTRATION, CHECKED BEFORE IT WRITES ANYTHING. The press writes the agent,
 * its card message and then a session for it (`registerTheSessionItself` in lib/selfregistration.ts). The session is
 * filed for the agent the press admits, so the filing door is asked first, here: a refusal after the agent record was
 * written would leave a half-made registration. Only the person, read as their other acts read them, a secretary they raised
 * or the office itself may press.
 */
export function asTheirPressThatAdmitsARegistration<T>(actor: Actor, write: () => T): T {
  theirPressIsAdmittingARegistration += 1
  try {
    if (!thePersonIsFilingThisSession(actor) && !theCallerIsTheOfficeItself(actor)) {
      throw new PanelError(
        "Admitting a registration files a session for the agent it admits, so it is the person's own press: with their key, " +
          "or while their key window is open, from this computer's own program, or by a secretary they raised. This press " +
          'was none of those. Nothing was written.',
        403,
      )
    }
    return write()
  } finally {
    theirPressIsAdmittingARegistration -= 1
  }
}

/** The `parentAttachment` a session's data gives, or null when it gives none. An empty string gives none. */
export function theParentADataGives(data: unknown): string | null {
  if (!isJsonObject(data)) return null
  const said = data['parentAttachment']
  return typeof said === 'string' && said !== '' ? said : null
}

/**
 * THE ROLE ON A WRITE IS ONE OF THE WORDS A ROLE CARD DECLARES, checked before it is stored.
 *
 * The words live in `design/permissions/roles.json` and nowhere else, so this asks that file rather
 * than keeping a list of its own. A word no card holds is a permission nothing can enforce: it would
 * sit on a registry row, be drawn on a page, and refuse nothing, which is the shape this repository
 * calls a fake success.
 *
 * IT IS SILENT WHEN NOTHING HAS READ THE CARDS. A write made inside a test that never started a
 * server has no declaration to check against, and refusing there would refuse a write for a reason
 * about this process rather than about the record. What guarantees the cards are readable at all is
 * the boot, which fails loudly and does not serve.
 */
/**
 * THE CREDENTIAL ON AN AGENT RECORD IS MEASURED AT THE DOOR AND NEVER PATCHED. Criterion P69.
 *
 * The registration doors read it off the socket the request arrived on and write it; a patch that
 * could change it would let any caller claim the credential the owner confirmed for somebody else,
 * which turns the field from a measurement into a claim. A patch that carries the value already
 * stored is left alone, because sending a record back unchanged is an ordinary edit.
 */
export function checkNobodyIsWritingTheirOwnCredential(next: unknown, before: unknown): void {
  if (!isJsonObject(next)) return
  const asked = next['credential']
  const held = isJsonObject(before) ? before['credential'] : undefined
  if (asked === undefined || asked === held) return
  throw new PanelError(
    'The credential on an agent is measured when it registers, from the connection the registration arrived on, ' +
      'and no write can change it afterwards. A caller that could write this field could name the credential the ' +
      'owner confirmed for somebody else, which is what the field exists to make impossible. Nothing was written. ' +
      `The row holds ${held === undefined ? 'no credential, which means it registered on this machine' : JSON.stringify(held)}.`,
    403,
  )
}

/**
 * THE DOOR THAT IS ALLOWED TO WRITE A CARD OR A GRANT ONTO AN AGENT RECORD.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A MARKER AND NOT A FIELD ON THE PATCH
 * ---------------------------------------------------------------------------------------
 *
 * The rule below has to tell an appointment apart from an agent editing its own record, and the two
 * arrive at `patchRecord` looking identical: same body shape, same actor, same record. Anything that
 * said "this one is allowed" INSIDE the patch would be a key a caller could send, which is the
 * refusal writing itself a way past. So the doors that appoint and elevate open this marker around
 * their own write, and nothing a request carries can open it.
 *
 * IT COUNTS RATHER THAN FLAGS, so a door calling another door leaves it open until both are done. It
 * is closed in a `finally`, so a refusal inside the door does not leave it open for the next caller.
 * Every write in this product is synchronous — better-sqlite3 has no other kind — so there is no
 * moment when another request could be inside one of these.
 */
let theCardDoorIsOpen = 0

/**
 * Run one write as the door that appoints, elevates or registers. `src/server/api/roles.ts`,
 * `src/server/api/participants.ts` and `src/server/lib/claims.ts` are the only callers.
 */
export function throughTheCardDoor<T>(run: () => T): T {
  theCardDoorIsOpen += 1
  try {
    return run()
  } finally {
    theCardDoorIsOpen -= 1
  }
}

// Only synchronous office writers open this mark. Request data cannot open it.
export let theRetireDoorIsOpen = 0

/** Run a checked or automatic retirement write as its office door; restore the mark even on refusal. */
export function throughTheRetireDoor<T>(write: () => T): T {
  theRetireDoorIsOpen += 1
  try {
    return write()
  } finally {
    theRetireDoorIsOpen -= 1
  }
}

/** Which of the two fields this write is changing on an agent record, in the order it names them. */
const A_CARD_AND_A_GRANT = ['role', 'elevation'] as const

/** Which door writes each of them, so a refusal says where the act is done instead. */
const WHERE_EACH_IS_WRITTEN: Readonly<Record<string, string>> = {
  role: 'POST /api/roles/card/<handle>, which appoints',
  elevation: 'POST /api/roles/elevation/<handle>, which is the press that lets a secretary act for you',
}

/**
 * NOBODY WRITES THEIR OWN CARD, OR THEIR OWN RIGHT TO ACT FOR THE PERSON.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, 8 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A worker registered with no card patched its own agent record with `role: "secretary"` (200),
 * patched an elevation grant onto the same record (200), and then wrote a `decision` with no
 * authority at all (201). A plain worker asking for that last request is refused 403. So the card
 * and the grant it had written for itself were read back as the person's own authority.
 *
 * The reading is not the defect and neither is the copy: `keepTheAgentRegistryInStep` copies both
 * fields down to the registry row because that is what makes an appointment take effect, and
 * `theElevationHeldBy` reads the row because that is where a refusal looks. What was missing is the
 * one question nobody asked: WHO may put those two words there. `checkAgentRole` beside this asked
 * only whether the word was a card this installation declares.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * A change to `role` or `elevation` on an agent record is refused unless the person is asking, or
 * the write is coming through the door that does that act. The doors are unchanged and still decide
 * for themselves who may: appointing asks the card tree, and only the person elevates.
 *
 * A WRITE THAT LEAVES THE VALUE ALONE IS NOT A CHANGE. A whole-object edit carries every field the
 * record holds, including the card, and refusing those would refuse every ordinary edit an agent
 * makes to its own record. The comparison is on the value: same card, nothing refused.
 *
 * NOTHING HERE READS THE REGISTRY. Whether the write is allowed is a question about the actor and
 * the door, and the row it would be copied to has no view on it.
 */
export function checkNobodyIsWritingTheirOwnCard(next: unknown, before: unknown, actor: Actor): void {
  // THE PERSON MAY. Mole Office authenticates nobody, so this is chapter 8's routing rule rather
  // than a check: an act asked in the person's name is taken at its word, and the rule is on the asker.
  if (actor.type === 'human') return
  // AND INSIDE A TEST WORLD, ITS STARTER AND THE SECRETARY, who hold the person's authority there (criterion P84).
  // The change row still names the agent that wrote it.
  if (actor.theOwnersAuthority?.holds === true) return
  if (theCardDoorIsOpen > 0) return
  if (!isJsonObject(next)) return
  const held = isJsonObject(before) ? before : {}
  const changing = A_CARD_AND_A_GRANT.filter(
    (field) => next[field] !== undefined && JSON.stringify(next[field]) !== JSON.stringify(held[field]),
  )
  if (changing.length === 0) return
  throw new PanelError(
    `${changing.map((one) => JSON.stringify(one)).join(' and ')} on an agent record ${changing.length === 1 ? 'is' : 'are'} ` +
      'written by the person, or by the door that does that act, and this request is neither. ' +
      `${changing.map((one) => WHERE_EACH_IS_WRITTEN[one] ?? one).join('; ')}. ` +
      'A card an agent could write for itself is not a permission: this exact write was measured on ' +
      '8 September 2026 giving a worker the secretary card and a grant to act for the person, after which it ' +
      `wrote a decision it may not write. This request was made by "${actor.id}". ` +
      'Nothing was written.',
    403,
  )
}

/**
 * NOBODY WRITES A RUN'S RAISES BUT THE PERSON'S PRESS. The start and the end of a raise are recorded on the
 * secretary's run as well as on its agent record. The run's `raises` grants nothing, since a refusal reads the agent's
 * registry row, but a run that could write its own would carry a record of a raise the person never pressed, which is the same
 * lie the card door exists to stop, and a run that could take one off would hide a raise they did
 * press. So it is written the way a grant is: by the person, or through the card door their press opens. A write that
 * leaves it as it was is not a change; one that adds it, changes it or drops it is, the way the office-only run fields
 * are compared (lib/office-only-run-fields.ts).
 */
export function checkNobodyIsWritingTheirOwnRaise(next: unknown, before: unknown, actor: Actor): void {
  // THE PERSON, BY THEIR KEY, as their press asks: a claim to be the person with no key, which the one-version window counts for other
  // acts, does not write a raise onto a run either.
  if (actor.type === 'human' && actor.provedBy === 'the-person-key') return
  if (theCardDoorIsOpen > 0) return
  const now = isJsonObject(next) ? next['raises'] : undefined
  const was = isJsonObject(before) ? before['raises'] : undefined
  if (JSON.stringify(now) === JSON.stringify(was)) return
  throw new PanelError(
    '"raises" on a session record is written by the person\'s press, POST /api/roles/elevation/<handle>, and its end, and ' +
      'this request is neither. A run that could write its own raise would carry one the person never made, and one that could ' +
      `take a raise off would hide one they did. This request was made by "${actor.id}"` +
      (actor.type === 'human' ? " without the person's key, which a raise is written with. " : '. ') +
      'Nothing was written.',
    403,
  )
}

/**
 * THE DOOR THAT CHANGES A START FOLDER, open around its own write and nothing else.
 *
 * The same marker `theCardDoorIsOpen` is, for the same reason and with the same counting; the header
 * above it says why a marker inside the patch would be the refusal writing itself a way past. It is
 * separate from the card door on purpose: a door allowed to write a card must not thereby be allowed
 * to write a start folder, and the other way round.
 */
let theStartFolderDoorIsOpen = 0

/** Run one write as the door that changes a start folder. `changeStartFolder` is the only caller. */
export function throughTheStartFolderDoor<T>(run: () => T): T {
  theStartFolderDoorIsOpen += 1
  try {
    return run()
  } finally {
    theStartFolderDoorIsOpen -= 1
  }
}

/**
 * NOBODY CHANGES A START FOLDER BY AN ORDINARY WRITE, AND NO AGENT CHANGES ITS OWN.
 *
 * Following the work-area
 * rule, a start folder is changed by the owner, the agent's starter or a secretary, with a reason,
 * through its own door, and never by the agent itself. Which of those three is asking is decided at
 * that door by `whoMayChangeItsAreas`; this is the other half of the rule, and without it the door
 * would be one route to the field among two.
 *
 * WHY THE FIELD IS WORTH A GUARD. An agent that could point its own start folder anywhere could
 * point it at the folder the owner works in, and the hook would then file the owner's own sessions under that
 * agent's name and say "You are answering as" in it. Risk 9 of the measurement.
 *
 * THIS IS THE CHANGE PATH ONLY, AND THAT IS DELIBERATE. A session registering itself names its own
 * start folder — that is what `--start-folder` is for — so a create carrying one is the ordinary way
 * the field is first written, and only `checkAgentStartFolder` has a view on it. Changing one
 * afterwards is the act with the consequence above, so it is the act that is guarded.
 *
 * A WRITE THAT LEAVES THE VALUE ALONE IS NOT A CHANGE, exactly as with a card: a whole-object edit
 * carries every field the record holds, and refusing those would refuse every ordinary edit.
 */
export function checkNobodyIsChangingAStartFolder(next: unknown, before: unknown, actor: Actor): void {
  // THE PERSON MAY. Mole Office authenticates nobody, so this is chapter 8's routing rule rather than
  // a check: an act asked in the person's name is taken at its word, and the rule is on the asker.
  if (actor.type === 'human') return
  if (theStartFolderDoorIsOpen > 0) return
  if (!isJsonObject(next)) return
  const held = isJsonObject(before) ? before : {}
  if (next['startFolder'] === undefined) return
  if (JSON.stringify(next['startFolder']) === JSON.stringify(held['startFolder'])) return
  throw new PanelError(
    '"startFolder" on an agent record is changed by the person, or by the door that does that act, and this request ' +
      'is neither. The door is POST /api/participants/agent/<handle>/start-folder {"startFolder":…,"because":…}, ' +
      'which the owner, the agent that started it or a holder of the secretary card may use, and which records who ' +
      'changed it and why. An agent that could point its own start folder anywhere could point it at the folder the ' +
      `owner works in, and the session hook would then file the owner's sessions under that agent's name. This request was ` +

      `made by "${actor.id}". Nothing was written.`,
    403,
  )
}

export function checkAgentRole(data: unknown): void {
  if (!isJsonObject(data)) return
  const role = data['role']
  if (role === undefined || role === null) return
  if (!theRoleCardsAreRead()) return
  const cards = theRoleCards()
  if (isARole(cards, role)) return
  throw new PanelError(
    `"role" is ${JSON.stringify(role)}, and no role card holds that word. The roles are ` +
      `${theRoleWordsSaid(cards)}. A word no card holds is a permission nothing can enforce. The cards are in ` +
      'src/config/roles.json, and a role added there takes effect on the next start with no code change. ' +
      'Nothing was written.',
    400,
  )
}

export function assertMayRemoveAnAgent(record: Pick<PanelRecord, 'id' | 'kind' | 'title'>): void {
  if (record.kind !== AGENT_KIND) return
  const waiting = messagesStillWaitingFor(record.id)
  if (waiting === 0) return
  throw new PanelError(
    `${String(waiting)} message${waiting === 1 ? ' is' : 's are'} waiting for "${record.title}" and nothing else ` +
      `is holding ${waiting === 1 ? 'it' : 'them'}. Deleting this agent would leave ` +
      `${waiting === 1 ? 'it' : 'them'} addressed to a record that is gone, where nothing will ever hand ` +
      `${waiting === 1 ? 'it' : 'them'} to anybody. Nothing was written. Retire it instead, which leaves the ` +
      `inbox alone: POST /api/participants/agent/${agentForRecord(record.id)?.id ?? '<id>'}/retire {"because":"…"}. A retired agent still ` +
      `resolves, still has its inbox, and can be made active again.`,
    409,
  )
}
