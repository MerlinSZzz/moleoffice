// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TRUSTED VISITOR AND ITS CREDENTIAL: the words both the browser and the server need for them.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A TRUSTED VISITOR IS
 * ---------------------------------------------------------------------------------------
 *
 * An agent running on another machine, before that machine runs a Mole Office of its own. Answer 3
 * in design/permissions/ACCEPTANCE.md section 1.3 is the source. It names a particular computer, and
 * this repository is public, so it is read here rather than copied. What it says:
 *
 * A worker on that machine may read the queue, claim a run and return its result. Until that machine
 * runs a world of its own, its agents register as trusted visitors. Each agent is issued its own
 * credential. The credential records the facts of that agent's run, so a
 * token found by somebody else can be told from the run it was issued to. The person confirms it as
 * administrator at the Embassy, on either machine, and supervises the visitors and the worlds
 * there. Once that machine runs a world, its agents are citizens of
 * it and register with no confirmation, because both worlds are theirs.
 *
 * Criteria P24 to P31 of design/permissions/ACCEPTANCE.md are that sentence measured.
 *
 * ---------------------------------------------------------------------------------------
 * ONE CREDENTIAL PER AGENT, NOT PER MACHINE AND NOT PER WORLD
 * ---------------------------------------------------------------------------------------
 *
 * Each agent is issued its own. Two agents on one other
 * machine get two credentials, and ending one leaves the other working. A credential per machine
 * would mean that ending one agent's access ends everybody's on that machine, which is not
 * supervision.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE IS IN `shared` AND OPENS NOTHING
 * ---------------------------------------------------------------------------------------
 *
 * The browser draws these words and the server stores them, the same reason src/shared/worlds.ts
 * gives. Nothing here reads a file, opens a database or hashes anything: the hash is the server's,
 * because a browser that could compute it would be a browser holding the secret.
 */

import { readStoredWord } from './i18n.ts'
import type { ParticipantRef } from './participants.ts'

// ============================================================================ the three standings

/**
 * WHERE A CREDENTIAL STANDS. Three words and no fourth.
 *
 * `pending` — issued and not yet confirmed by the person. Its requests are refused (criterion P25).
 * `trusted` — the person confirmed it. Its requests are answered.
 * `ended`   — the person ended it, or a world was registered for the machine it came from. Its requests
 *             are refused, and the row is kept: the office does not delete the evidence of how
 *             somebody first got in.
 *
 * THERE IS NO WORD FOR "EXPIRED", and that is deliberate. `endsAt` is a moment, and whether it has
 * passed is a question about the clock, asked on each request. A fourth standing would be the same
 * fact stored twice and free to disagree with the moment beside it.
 */
export const VISITOR_STANDINGS = ['pending', 'trusted', 'ended'] as const

export type VisitorStanding = (typeof VISITOR_STANDINGS)[number]

/** Whether the owner still has an action for this credential. A pending one can be ended. */
export function credentialNeedsOwnerAction(credential: { standing: VisitorStanding }): boolean {
  return credential.standing === 'pending'
}

/**
 * Whether no key works under this credential: it came from a copy without its key and is not ended. Its confirm is
 * refused, so no page offers one. The credential page and the Embassy card both read this.
 */
export function noKeyWorksUnder(credential: { standing: VisitorStanding; tokenRemoved: boolean }): boolean {
  return credential.tokenRemoved && credential.standing !== 'ended'
}

export function isVisitorStanding(value: unknown): value is VisitorStanding {
  return typeof value === 'string' && (VISITOR_STANDINGS as readonly string[]).includes(value)
}

/**
 * A PERSON'S DEVICE ASKS FOR NO CARD, and this is how that is stored.
 *
 * Criterion D2, on P83 point 4 and the ruling on it. A phone, a MacBook or a browser is not an agent:
 * it has no handle it chose, no name it chose and no role card. The `visitor_credentials` table was
 * built for an agent and every one of its three text columns is NOT NULL, so the ask door writes the
 * device's own name into `handle` and `name`, and this empty word into `role`. The empty role is not
 * a card: `isAPersonsDeviceCredential` is what reads it, the confirm does not apply P86's card
 * ceiling to a device, and no agent can reach this shape because the agent ask is refused without a
 * card. A migration adding a column would be a second migration and a decision above this worker.
 */
export const A_DEVICE_ASKS_FOR_NO_CARD = ''

/** Whether this credential is a person's device asking to come in rather than an agent. Criterion D2. */
export function isAPersonsDeviceCredential(credential: Pick<VisitorCredential, 'role'>): boolean {
  return credential.role === A_DEVICE_ASKS_FOR_NO_CARD
}

// ============================================================================ the run's own facts

/**
 * THE FACTS OF ONE AGENT RUN, as the credential records them.
 *
 * AT LEAST ONE OF THE FIRST TWO IS REQUIRED and the rest are recorded as they are given. The rule
 * names the two, the conversation's storage path or the agent's start directory, with "or" between
 * them, so either will do and neither is invented when it is missing. `whyTheseFactsAreNotEnough` is
 * the check.
 *
 * NULL MEANS THE CALLER DID NOT SAY. It never means "the same as before" and it is never filled in
 * from somewhere else: a fact this office guessed at could not tell anybody anything about who is
 * asking, which is the entire purpose of storing these.
 */
export interface RunFacts {
  /** Where this run's transcript is written. For Claude Code, the directory it goes in. */
  conversationPath: string | null
  /** The working directory the run began in. */
  startDirectory: string | null
  /** Which runtime serves it, in the caller's own word for it. */
  runtime: string | null
  /** The machine it asked from: a name where one could be read, and an address where none could. */
  machine: string | null
  /** The session record this run filed in Mole Office, or null because it filed none. */
  sessionRecord: string | null
}

/**
 * THE TWO FACTS THAT ARE COMPARED ON EVERY LATER REQUEST, and what a person reads for each.
 *
 * They are the two the rule names. The runtime, the machine and the session record are recorded
 * and are NOT compared: a runtime word can be written two ways by the same run, the machine is
 * measured from the socket rather than said, and a run files its session record after it has already
 * started asking. Comparing those would produce mismatches that mean nothing, which would make the
 * count that does mean something unreadable.
 */
export const FACTS_COMPARED = [
  { key: 'conversationPath', said: 'where the conversation is stored' },
  { key: 'startDirectory', said: 'the directory the run started in' },
] as const satisfies readonly { key: keyof RunFacts; said: string }[]

/** What is wrong with the facts a credential is being asked for, in a sentence, or null. */
export function whyTheseFactsAreNotEnough(facts: Pick<RunFacts, 'conversationPath' | 'startDirectory'>): string | null {
  const conversation = (facts.conversationPath ?? '').trim()
  const directory = (facts.startDirectory ?? '').trim()
  if (conversation === '' && directory === '') {
    return (
      'A credential records the facts of the run it is issued to, and this request named neither of them. Send ' +
      'conversationPath (where this run writes its transcript), or startDirectory (the directory the run began ' +
      'in), or both. Without one of the two there is nothing to compare a later request against, so the ' +
      'credential could not tell the run it was issued to from anything else holding the token.'
    )
  }
  return null
}

/** One fact that was issued one way and sent another. Criterion P27: the row names both. */
export interface FactMismatch {
  /** Which fact, in the word a person reads. */
  said: string
  /** What the credential was issued with. Null because it was issued without this one. */
  issued: string | null
  /** What this request sent. Null because this request did not send it. */
  sent: string | null
}

/**
 * WHICH OF THE COMPARED FACTS DIFFER BETWEEN WHAT WAS ISSUED AND WHAT WAS SENT.
 *
 * A FACT THE CREDENTIAL DOES NOT HOLD IS NOT COMPARED. A credential issued with a start directory
 * and no conversation path is a credential whose conversation path nobody ever said, and calling a
 * request that names one a mismatch would report a difference from a fact that was never there.
 *
 * A FACT THE CREDENTIAL HOLDS AND THE REQUEST DOES NOT SEND **IS** A MISMATCH, and that is the
 * direction that matters: dropping the header is the cheapest way for a token thief to avoid being
 * compared to anything, and silence has to cost the same as a wrong answer.
 */
export function factsThatDiffer(issued: RunFacts, sent: Partial<RunFacts>): FactMismatch[] {
  const out: FactMismatch[] = []
  for (const fact of FACTS_COMPARED) {
    const was = issued[fact.key]
    if (was === null || was === '') continue
    const now = sent[fact.key] ?? null
    if (now === was) continue
    out.push({ said: fact.said, issued: was, sent: now === '' ? null : now })
  }
  return out
}

// ============================================================================ what is handed back

/**
 * ONE CREDENTIAL, as the Embassy holds it and as the API hands it back.
 *
 * IT CARRIES NEITHER THE TOKEN NOR ITS HASH. The token is shown once, at issue, in the one reply
 * below, and stored as a hash the office cannot reverse — so the office cannot hand it back either,
 * and this shape is what every read after that answers with.
 */
export interface VisitorCredential {
  id: string
  /** The handle the visitor writes under. Permanent, like every handle here. */
  handle: string
  /** What a reader sees. */
  name: string
  /** The role card it was issued against. A visitor's role is granted by the person, not a starter. */
  role: string
  /**
   * The world it says it belongs to, or null — which is what makes it a visitor rather than a
   * citizen. A database identity, said by the caller, never checked.
   */
  world: string | null
  /** The machine it asked from, as `writtenFrom` measured it, or null because nobody could tell. */
  machine: string | null
  /** How that machine was arrived at: its own name, or the address it was reached at. */
  machineHow: string
  /** The facts of the run this credential was issued to. */
  facts: RunFacts
  standing: VisitorStanding
  /** Who confirmed it and when. Null while it is pending. */
  confirmedBy: ParticipantRef | null
  confirmedAt: string | null
  /** When it expires without being renewed. */
  endsAt: string
  /** When it was ended and why, in one plain sentence. Null exactly when it has not been ended. */
  endedAt: string | null
  endedBecause: string | null
  issuedAt: string
  /** How many requests have been made under it, how many wrote, and how many did not match. */
  requests: number
  writes: number
  mismatches: number
  /** When the last request under it arrived, or null because none has. */
  lastAskedAt: string | null
  /**
   * WHETHER THIS OFFICE HOLDS NO TOKEN HASH FOR IT. True when the row came from a copy that leaves
   * token hashes out, such as a backup: the column then holds a note saying the hash was
   * removed. No token matches it, so no request can arrive under it and it cannot be
   * confirmed. To work here again the visitor asks for a new credential.
   */
  tokenRemoved: boolean
}

/**
 * THE ONE REPLY THAT CARRIES THE TOKEN. Criterion P24: *the token is shown once and stored as a hash.*
 *
 * Nothing else in this product ever returns it. A caller that loses it asks for another credential
 * and the person confirms that one; there is no route that hands this back, because a route that could would
 * make every reader of the Embassy able to act as everybody on it.
 */
export interface CredentialIssued {
  credential: VisitorCredential
  /** The secret. This is the only time it exists outside the visitor's own memory. */
  token: string
  /** What to do with it, in the reply, because a token with no instructions is a token nobody uses. */
  says: string
}

/** One request made under a credential, as the Embassy shows it. */
export interface VisitorRequestRow {
  id: string
  credential: string
  at: string
  method: string
  /** The route, as Fastify matched it, so two requests to two records read as one route. */
  route: string
  /** The act the route declared, or null for a route outside the API. */
  operation: string | null
  /** Whether this act writes. Read off the operation's own declaration, never guessed from the verb. */
  wrote: boolean
  /** What was refused, in one sentence, or null because it was answered. */
  refusedBecause: string | null
  /** The facts that did not match, or an empty list because they all did. */
  mismatch: FactMismatch[]
}

// ============================================================================ what it cannot prove

/**
 * WHAT A CREDENTIAL CANNOT PROVE, said on the page where it is granted. Criterion P28.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THESE SENTENCES ARE IN THE PRODUCT AND NOT ONLY IN A DESIGN DOCUMENT
 * ---------------------------------------------------------------------------------------
 *
 * The fifth invariant of USER.md: absence beats a guess, and a mechanism that cannot tell one
 * thing from another says so where a person reads it. A decision already accepted
 * that nothing here authenticates anybody. A page that showed a mismatch count and said nothing
 * else would be read as proof of impersonation, and a page that showed none would be read as proof there
 * was none. Neither is true, so both are said.
 *
 * THEY ARE FOUR SENTENCES AND NOT A PARAGRAPH because a person acts on each one differently.
 */
const CREDENTIAL_LIMIT_KEYS = [
  'g4.credential.limit1', 'g4.credential.limit2', 'g4.credential.limit3', 'g4.credential.limit4',
] as const

/** Pages read again when their language changes; server readings stay in English. */
export function whatACredentialCannotProve(): readonly string[] {
  return CREDENTIAL_LIMIT_KEYS.map((key) => readStoredWord(key))
}

export const WHAT_A_CREDENTIAL_CANNOT_PROVE = whatACredentialCannotProve()

/**
 * WHAT A WORLD'S CLAIM TO BE THE PERSON'S IS WORTH, said in the row a person reads. Criterion P31.
 *
 * The citizen path rests on both worlds being ones the same person logged into. That is true of the
 * person's own other computer and it is a CLAIM in every case: Mole Office cannot tell the person's
 * machine from anybody else's that says the same thing, in exactly the way chapter 8's third rule
 * says it cannot tell them from a program here that sends their name.
 */
export const A_WORLDS_OWNER_IS_A_CLAIM =
  'This is what that world said about itself. Mole Office did not check it and cannot: a world names its own owner, ' +
  'and any other machine could say the same.'

/**
 * THE HOST OUT OF AN ADDRESS, so a machine name can be compared with a world's address.
 *
 * `http://a-machine.example:8787` and `a-machine.example` are the same machine said
 * two ways: a world registers where it can be reached and a credential records the machine it asked
 * from, and only the host part of the first is ever the second. Lowercased, because a hostname is
 * not case-sensitive and a comparison that thought so would fail on a machine somebody typed in
 * capitals.
 *
 * IT INVENTS NOTHING. A string with no host in it comes back as null, and `theSameMachine` below
 * answers false for a null — an unknown is never treated as a match.
 */
export function hostOf(address: string | null): string | null {
  if (address === null) return null
  const said = address.trim().toLowerCase()
  if (said === '') return null
  const withoutScheme = said.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  const withoutPath = withoutScheme.split('/')[0] ?? ''
  // A BRACKETED ADDRESS IS AN IPv6 ONE and its colons are part of the address rather than a port.
  const bracketed = /^\[([^\]]+)\]/.exec(withoutPath)
  if (bracketed !== null) return bracketed[1] ?? null
  const host = withoutPath.split(':')[0] ?? ''
  return host === '' ? null : host
}

/**
 * WHETHER A CREDENTIAL'S MACHINE AND A WORLD'S ADDRESS NAME THE SAME MACHINE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS CAN AND CANNOT ANSWER, SAID HERE RATHER THAN ASSUMED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P30's last line is *its earlier visitor rows are kept and marked ended*. A credential
 * issued BEFORE that machine ran a world names no world, because there was none to name — so the only
 * thing linking that row to the world that has just appeared is the machine it asked from.
 *
 * IT ANSWERS FALSE WHEREVER IT CANNOT TELL, and the row then stays open and stays on the Embassy.
 * That is the honest direction: a credential wrongly ended stops an agent that was working, and a
 * credential left open is a row the person can see and end themselves in one press. Measured on 7 September
 * 2026 with two isolated stacks, where a world registering by loopback matched nothing at all.
 */
export function theSameMachine(credentialMachine: string | null, worldAddress: string | null): boolean {
  const one = hostOf(credentialMachine)
  const other = hostOf(worldAddress)
  if (one === null || other === null) return false
  return one === other
}

/**
 * THE ADDRESS SEGMENT ONE CREDENTIAL'S PAGE LIVES UNDER: `#/visitor/<id>`.
 *
 * IN `shared` FOR THE REASON `PROFILE_SEGMENT` IS. The browser builds the address, and a refusal
 * written on the server names it — `pendingRefusal` below tells a visitor where to go. Two spellings
 * of one segment is the ninth invariant, and the one that drifts is the one nobody presses.
 *
 * The word is what the thing IS to a reader — a visitor — rather than "credential", which is what
 * the row is called in the store. Chapter 6's fourth rule.
 */
export const VISITOR_SEGMENT = 'visitor'

/** The credential page's address, shared by browser links and the office's message leads. */
export function credentialPagePath(id: string): string {
  return `/${VISITOR_SEGMENT}/${encodeURIComponent(id)}`
}

/**
 * THE SEGMENT UNDER THE PERSON'S CARD THAT NAMES ONE OF THEIR BROWSERS: `#/who/person/<id>/browser/<credential>`.
 * Design C of early idea B9. The router builds the address from it and the address reader reads it
 * back, so the two cannot spell it differently.
 */
export const HIS_BROWSER_SEGMENT = 'browser'

/**
 * WHERE THE PRESSES ON THE PERSON'S BROWSERS AND MACHINES ARE MADE, AS A REFUSAL SAYS IT. Design C of early idea
 * B9: the person's own card is the one place for them. The refusals of confirm, end, revoke and undo for
 * a browser, and of trusting or removing a machine, say this; an agent's credential is not the person's browser,
 * and its refusals still name the Embassy.
 */
export const ON_HIS_OWN_CARD = 'on the owner\'s own person card, in its part for browsers and machines'

// ============================================================================ the refusals

/** Why a request under a credential nothing here holds is refused. */
export function noSuchCredentialRefusal(): string {
  return (
    'This request carried a visitor credential that no credential here matches. Nothing was done. A credential is ' +
    'issued by POST /api/office/visitors and its token is shown once, at issue; if you have lost it, ask for another ' +
    'and have it confirmed at the Embassy. The credentials this office holds are listed at #/embassy.'
  )
}

/** Why a pending credential's request is refused. Criterion P25. */
export function pendingRefusal(credential: { id: string; handle: string; machine: string | null }): string {
  return (
    `The credential "${credential.handle}" is waiting to be confirmed, so this request was refused and nothing it ` +
    'sent was stored. A visiting agent works once the owner has confirmed its credential as administrator at the ' +
    `Embassy, on either machine: open #/embassy, open the credential ${credential.id}, and press Confirm. ` +
    (credential.machine === null
      ? 'Nobody could tell which machine it asked from.'
      : `It asked from ${credential.machine}.`)
  )
}

/** Why an ended credential's request is refused. Criterion P29: the refusal names it and when it ended. */
export function endedRefusal(credential: {
  id: string
  handle: string
  endedAt: string | null
  endedBecause: string | null
}): string {
  return (
    `The credential "${credential.handle}" (${credential.id}) was ended` +
    (credential.endedAt === null ? '' : ` at ${credential.endedAt}`) +
    ', so this request was refused and nothing it sent was stored. ' +
    (credential.endedBecause === null ? '' : `${credential.endedBecause} `) +
    'A new credential is issued by POST /api/office/visitors and the owner confirms it at the Embassy.'
  )
}

/** Why a credential whose moment has passed is refused. */
export function expiredRefusal(credential: { id: string; handle: string; endsAt: string }): string {
  return (
    `The credential "${credential.handle}" (${credential.id}) ran out at ${credential.endsAt}, so this request was ` +
    'refused and nothing it sent was stored. Ask for another with POST /api/office/visitors and have the owner ' +
    'confirm it at the Embassy.'
  )
}

/**
 * Why a working visitor's request for an act no visitor may ask for is refused. The rest of the sentence is the
 * act's own `refusedToVisitors` mark in src/shared/ops.ts.
 */
export function actRefusedToVisitorsRefusal(
  credential: { id: string; handle: string },
  refusedToVisitors: string,
): string {
  return `The credential "${credential.handle}" (${credential.id}) is a visitor's, and ${refusedToVisitors}`
}

/**
 * WHAT A MISMATCH DOES TO THE REQUEST IT WAS FOUND ON, TODAY, said where a person reads it.
 *
 * ---------------------------------------------------------------------------------------
 * THE FACTS HALF OF Q2 IS ANSWERED; THE UNTRUSTED-MACHINE HALF IS STILL OPEN
 * ---------------------------------------------------------------------------------------
 *
 * The facts half of Q2 is answered: a mismatch does not refuse the request.
 * It is recorded and counted, and the agent's superior is told once per different
 * mismatch. Criterion P27 still measures the record on answered and refused requests alike.
 *
 * Whether a request from a machine the office does not trust is refused is still open (proposal
 * b0CW38puqgff). The decided facts rule is said on the credential's own page so nobody mistakes
 * that remaining question for an unanswered question about a mismatch.
 */
export function whatAMismatchDoesToday(): string {
  return readStoredWord('g4.credential.mismatchPolicy')
}

export const WHAT_A_MISMATCH_DOES_TODAY = whatAMismatchDoesToday()
