// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REFUSAL FOR A REQUEST THAT IS NOT PROVED TO BE THE PERSON. Problem MgIv4-Ic3u06, piece 8 of the
 * keys wave plan (report 7eQG4ZyWuWCv).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Every door that keeps an act for the person wrote its own refusal, and each said the same thing:
 * that the request was made by the owner's id, which was not the person. After the owner closed the key window, the owner's own
 * browser without a key read exactly that. A person cannot tell from it that only the key is missing,
 * or what to do next. The same words went to an agent, to a request that named nobody, and to a
 * request whose key belonged to somebody else, although the way on is different for each.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS
 * ---------------------------------------------------------------------------------------
 *
 * Three functions, and every such refusal is written by them, so the words are worked out in one
 * place (invariant 9):
 *
 *   - `whatThisRequestShowed` reads the facts of one request: what its headers claimed, whose key it
 *     carried, where it arrived from, whether the key window is open, and whether this is a test
 *     world and who may act in it.
 *   - `theRefusalForSomebodyNotProvedThePerson` writes the refusal from those facts. It keeps the
 *     door's own first clause (which act was refused, and that nothing was done) and the door's own
 *     words about who may do the act.
 *   - `theRefusalForAWriteWithNoKey` writes the refusal of any write a listener carried with no key
 *     after they closed the key window. For an agent's name it says the agent's own key is missing;
 *     for their name or no name it is the refusal above.
 *
 * It does not decide who may act. The doors still ask `thePersonIsProved` and the test world's
 * authority first; this file is only asked once a door has already refused.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES NOT SAY
 * ---------------------------------------------------------------------------------------
 *
 * It says nothing about how safe their machine or their network is, because that is out of scope.
 * It never tells a program to read their key from the key file, because chapter 8 rule 3
 * is that nobody asks in their name; the ways on it names are the two presses a browser has.
 */
import type { FastifyRequest } from 'fastify'

import { KEY_HEADER } from '../../config/key-header.mjs'
import { ACTOR_HEADERS } from '@shared/request-headers.ts'
import { callerAddressOf } from './caller-address-of.ts'
import { theHandleOfTheAgentAKeyProves } from './the-handle-of-the-agent-a-key-proves.ts'
import { theHashOfTheKeyOnThisRequest } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import { theKeyWindowIsClosed } from '../db/the-key-window-is-closed.ts'
import { whomThisComputerFinds, type WhomThisComputerFinds } from './from-a-sandbox.ts'
import type { Actor } from './records.ts'
import { thisOfficeTrusts } from './trustedmachines.ts'
import { whoMayDoThePersonsActsHere } from './worldauthority.ts'

/**
 * What the identity headers of a request said. `not read` is a keyed request whose headers were not
 * in hand: without the request, a key sent with no headers and a key sent under the office's own
 * name leave the same actor behind, so the words then say only what the key proved.
 */
export type WhatTheHeadersClaimed =
  | { kind: 'nobody' }
  | { kind: 'not read' }
  | { kind: 'a person'; id: string }
  | { kind: 'an agent'; id: string }

/**
 * Whose key the request carried, as the one key reader in keys.ts worked it out.
 *
 * `nobody` is a key that proves nothing here, or no key at all. `presented` says which: true when the
 * request carried a key that proves nobody, false when it carried none, and null when this was not
 * read because the caller had no request in hand.
 */
export type WhoseKeyItCarried =
  | { kind: 'nobody'; presented: boolean | null }
  | { kind: 'the office' }
  /**
   * `handle` is the agent's name for a sentence. `sameAsTheHeaders` is true when the key proves the
   * very agent the headers named, which `actorFrom` compared as agents and not as characters.
   */
  | { kind: 'an agent'; handle: string; sameAsTheHeaders: boolean }

/**
 * Where the request arrived from, as the listener that accepted it recorded.
 *
 * `no listener` is an in-process caller: a script, a migration, `app.inject()`. `another machine`
 * with `trusted: null` means the machine's address was not read, because the caller had no request
 * in hand.
 */
export type WhereItArrived =
  | { kind: 'no listener' }
  | { kind: 'this machine' }
  | { kind: 'another machine'; trusted: boolean | null }

/** The facts of one request that the refusal is written from. */
export interface WhatThisRequestShowed {
  claimed: WhatTheHeadersClaimed
  key: WhoseKeyItCarried
  arrived: WhereItArrived
  /** Whether a claim with no key still counts from this machine and the trusted machines. */
  windowOpen: boolean
  /**
   * In a test world, the sentence worldauthority.ts writes naming who may act there (criterion P84).
   * Null in the office, which is never a test world.
   */
  whoMayActInThisTestWorld: string | null
  /**
   * WHO SENT A CLAIM TO BE THE PERSON THAT DID NOT COUNT BECAUSE OF WHO SENT IT, or null. Nothing that comes
   * from a sandbox is the person, so the window does not count such a claim (lib/from-a-sandbox.ts).
   */
  sentFrom: string | null
}

/**
 * READ THE FACTS OF ONE REQUEST. `req` is null only where the caller holds the actor and not the
 * request (the goal guard, which the record write path calls); then whether a key proved nobody and
 * whether another machine is trusted are not read, and the words say only what holds either way.
 */
export function whatThisRequestShowed(actor: Actor, req: FastifyRequest | null): WhatThisRequestShowed {
  return {
    claimed: whatTheHeadersClaimed(actor, req),
    key: whoseKeyItCarried(actor, req),
    arrived: whereItArrived(actor, req),
    windowOpen: !theKeyWindowIsClosed(),
    whoMayActInThisTestWorld: whoMayDoThePersonsActsHere(),
    sentFrom: actor.sentFrom ?? null,
  }
}

function whatTheHeadersClaimed(actor: Actor, req: FastifyRequest | null): WhatTheHeadersClaimed {
  // THE HEADERS SAID NOTHING when none was sent. Without the request, `stated: false` is the one mark
  // `actorFrom` leaves for that, and it is left only on a request that also carried no key.
  if (req === null) {
    if (actor.stated === false) return { kind: 'nobody' }
    // A KEY WITH NO NAME BESIDE IT. `actorFrom` sets `keyHolder` on every agent-keyed request that
    // sent headers and `provedHolder` wherever the key and the headers differ; a keyed actor with
    // neither may have sent no headers at all.
    if (actor.provedBy !== undefined && actor.keyHolder === undefined && actor.provedHolder === undefined) {
      return { kind: 'not read' }
    }
  } else if (req.headers[ACTOR_HEADERS.type] === undefined) {
    return { kind: 'nobody' }
  }
  // A KEY THAT PROVED SOMEBODY ELSE keeps the name the headers gave in `claimed`. Only the person's
  // key replaces the actor's id, and that key is never refused here.
  const id = actor.provedHolder?.claimed ?? actor.id
  return actor.type === 'human' ? { kind: 'a person', id } : { kind: 'an agent', id }
}

function whoseKeyItCarried(actor: Actor, req: FastifyRequest | null): WhoseKeyItCarried {
  if (actor.provedBy === 'the-office-key') return { kind: 'the office' }
  if (actor.provedBy === 'an-agent-key') {
    // `keyHolder` is the agent's id where the headers named somebody; with no headers the id is the
    // actor's own. Either way it is an id, and a sentence names the agent by its handle. A supervisor's
    // run key acting for a run its holder started proves the agent the headers named, and the key was
    // still its holder's: `provedHolder` names that holder (lib/acting-for.ts), so it is read first.
    const holder = actor.provedHolder?.id ?? actor.keyHolder ?? actor.id
    return {
      kind: 'an agent',
      handle: theHandleOfTheAgentAKeyProves(holder),
      sameAsTheHeaders: actor.type === 'agent' && actor.provedHolder === undefined,
    }
  }
  // THE PERSON'S KEY IS NEVER REFUSED, so what is left is a key that proved nothing, or none.
  return { kind: 'nobody', presented: req === null ? null : theHashOfTheKeyOnThisRequest(req) !== null }
}

function whereItArrived(actor: Actor, req: FastifyRequest | null): WhereItArrived {
  if (actor.from === undefined) return { kind: 'no listener' }
  if (actor.from === 'this machine') return { kind: 'this machine' }
  return { kind: 'another machine', trusted: req === null ? null : thisOfficeTrusts(callerAddressOf(req)) }
}

/** What one door says around the words this file writes. */
export interface WhatTheDoorSays {
  /** The act that was refused, as one sentence with no stop: "Trusting a machine is the owner's own act". */
  refused: string
  /**
   * That nothing was done, as one sentence: "Nothing was changed." Null where the words are drawn on
   * a page before anybody pressed anything, so nothing was asked and the sentence would say nothing.
   */
  nothingWasDone: string | null
  /** The door's own words about who may do the act and what an agent may do instead. */
  whoMay: string
}

/**
 * WHY A CLAIM TO BE THE PERSON FROM THIS COMPUTER DID NOT COUNT, WHEN IT WAS WHO SENT IT. The window counts a
 * keyless claim to be them from this machine only when this computer's own program sent it, and it names the
 * program it found instead, so the reader learns what the office saw rather than that it was not
 * them.
 * It ends with how the person acts on the system this office runs on (`whoActs` below).
 */
function whyAClaimFromThereIsNotThem(sentFrom: string): string {
  return (
    `It claimed to be the person from this computer with no key, and it came from ${sentFrom}. Nothing that comes from a ` +
    "sandbox is the person, and a program Mole Office cannot find is not taken for one of " +
    `theirs, so the key window does not count this claim. ${theWayToPairOnThisComputer().whoActs}`
  )
}

/**
 * THE WHOLE REFUSAL: the door's act, that nothing was done, why this request is not them and the way
 * on for its kind of caller, who may act in a test world, and the door's own words about who may.
 */
export function theRefusalForSomebodyNotProvedThePerson(facts: WhatThisRequestShowed, door: WhatTheDoorSays): string {
  return [
    `${door.refused}.`,
    ...(door.nothingWasDone === null ? [] : [door.nothingWasDone]),
    facts.sentFrom === null ? whyThisRequestIsNotThem(facts) : whyAClaimFromThereIsNotThem(facts.sentFrom),
    ...(facts.whoMayActInThisTestWorld === null ? [] : [facts.whoMayActInThisTestWorld]),
    door.whoMay,
  ].join(' ')
}

/**
 * THE REFUSAL FOR A WRITE WITH NO KEY, AFTER THE PERSON CLOSED THE KEY WINDOW. Findings 79
 * and 82; `refuseAKeylessWriteAfterTheClose` in lib/http.ts is its one caller.
 *
 * Every write a listener carried needs a key once the window is closed. What is missing depends on
 * whom the request named:
 *
 *   - AN AGENT: the agent's own key. Its registration answered one, and an agent that does not hold
 *     it asks its starter or the person for a new one. Nothing
 *     is said about the person here, because the request did not ask to be them.
 *   - THE PERSON, OR NOBODY: their key, and the way on is the one `whyThisRequestIsNotThem` already writes for
 *     where the request came from.
 *
 * It is only asked when the window is closed and no key proved the caller, so a key that proves an
 * agent or the office cannot reach it. If one does, that is a broken assumption and it is thrown
 * rather than put into words.
 */
export function theRefusalForAWriteWithNoKey(facts: WhatThisRequestShowed): string {
  if (facts.windowOpen || facts.key.kind !== 'nobody') {
    throw new Error('a write was refused for want of a key while the window was open or a key proved the caller')
  }
  const refused = 'This write needs a key. Nothing was written.'
  if (facts.claimed.kind === 'an agent') {
    return [
      refused,
      facts.key.presented === true
        ? `${theNameItGave(facts.claimed)}, and the key it carried proves nobody here.`
        : `${theNameItGave(facts.claimed)} and carried no key.`,
      "The key window is closed, so an agent's name counts only with that agent's own key.",
      `Send the key the agent's registration answered, as the ${KEY_HEADER} header.`,
      'An agent that does not hold its own key asks its starter or the person for a new one.',
      ...(facts.whoMayActInThisTestWorld === null ? [] : [facts.whoMayActInThisTestWorld]),
    ].join(' ')
  }
  return theRefusalForSomebodyNotProvedThePerson(facts, {
    refused: 'This write needs a key',
    nothingWasDone: 'Nothing was written.',
    whoMay: 'An agent writes with its own key.',
  })
}

/**
 * THE REFUSAL FOR A REGISTRATION AFTER THE CLOSE THAT NAMES NO AGENT AND PROVES NOBODY.
 *
 * `POST /api/agents/register-myself` is one of the doors a caller with no key uses to get one, so it
 * is open after the close. It writes a waiting row under the caller's actor. A keyless request that
 * named the person, or named nobody, is the person's claim, so that row would be written as their act.
 * The inspector measured that on 26 September 2026 (check session ozoWwczc7wcT). So after the close
 * the door takes a keyless registration only under an agent's name, and refuses the other two here.
 *
 * Reached only after the close, with no key that proves anybody, and with a claim that is not an
 * agent's. Any other facts are a broken assumption and are thrown rather than put into words.
 */
export function theRefusalForARegistrationThatNamesNoAgent(facts: WhatThisRequestShowed): string {
  if (facts.windowOpen || facts.key.kind !== 'nobody' || facts.claimed.kind === 'an agent') {
    throw new Error('a registration was refused for naming no agent while the window was open, a key proved the caller, or it named an agent')
  }
  return [
    'This registration was not written.',
    facts.key.presented === true
      ? 'The key window is closed, and the key this request carried proves nobody here.'
      : 'The key window is closed, and this request carried no key.',
    'A registration in the person\'s name, or in nobody\'s, would then be written as their act, so it is refused.',
    'A session registering itself names the agent it registers: send x-mole-office-actor-type "agent" and',
    'x-mole-office-actor-id with the agent\'s handle, and the registration waits for the person\'s press.',
    ...(facts.whoMayActInThisTestWorld === null ? [] : [facts.whoMayActInThisTestWorld]),
  ].join(' ')
}

/**
 * THE REFUSAL FOR A REQUEST THAT CARRIED NO KEY AND IS NOT ANSWERED AS ANYBODY,
 * on problem VTzfQgA0ZgP4; `refuseARequestNobodyProved` in lib/http.ts is its one caller.
 *
 * Three kinds of request reach it, and all came through a listener with no key that proves anybody:
 *
 *   - ONE THAT NAMED NOBODY, which is answered as the person only while the key window is open, from this computer's
 *     own program or from a machine this office trusts. Anything else is refused here: after the close, from a
 *     program in a sandbox, from a program the office cannot find, and from a machine the office does not trust.
 *   - A READ UNDER AN AGENT'S NAME AFTER THE CLOSE, which used to be answered as a request that named nobody.
 *   - ONE THAT NAMED THE PERSON, on the same condition as one that named nobody, at item 1.
 *
 * Any other facts are a broken assumption and are thrown rather than put into words.
 */
export function theRefusalForARequestNobodyProved(facts: WhatThisRequestShowed): string {
  const { claimed, key, arrived } = facts
  if (key.kind !== 'nobody' || arrived.kind === 'no listener' || claimed.kind === 'not read') {
    throw new Error('a request was refused as proving nobody while a key proved it or no listener carried it')
  }
  if (claimed.kind === 'an agent' && facts.windowOpen) {
    throw new Error("an agent's name with no key was refused while the key window was open")
  }
  const carried = key.presented === true ? 'the key it carried proves nobody here' : 'it carried no key'
  const why =
    claimed.kind === 'an agent'
      ? [
          `${theNameItGave(claimed)}, and ${carried}.`,
          "The key window is closed, so an agent's name counts only with that agent's own key.",
        ]
      : claimed.kind === 'a person'
        ? [`This request named the person, and ${carried}.`, ...whyNobodyIsNotAnswered(facts, 'names the person')]
        : [`This request named nobody, and ${carried}.`, ...whyNobodyIsNotAnswered(facts, 'names nobody')]
  return [
    'Mole Office does not know who sent this request, so it was not answered. Nothing was read or written.',
    ...why,
    ...(facts.whoMayActInThisTestWorld === null ? [] : [facts.whoMayActInThisTestWorld]),
    `An agent sends its own key in the ${KEY_HEADER} header, with its name in ${ACTOR_HEADERS.type} and ${ACTOR_HEADERS.id}.`,
    "A program of the office sends the office's key the same way.",
    ...(arrived.kind === 'this machine'
      ? [theWayToPairOnThisComputer().pairHere]
      : arrived.trusted === false
        ? [TRUST_THE_MACHINE_FIRST, ASK_FROM_ANOTHER_MACHINE]
        : [ASK_FROM_ANOTHER_MACHINE]),
  ].join(' ')
}

/**
 * Why a request with no key that named nobody, or named the person, is not answered as the person, from where it came
 * and the window. The two follow one rule, so one function says it.
 */
function whyNobodyIsNotAnswered(facts: WhatThisRequestShowed, named: 'names nobody' | 'names the person'): string[] {
  if (!facts.windowOpen) {
    return [`The key window is closed, so a request that ${named} is answered only with a key.`]
  }
  if (facts.sentFrom !== null) {
    return [
      `It came from ${facts.sentFrom}. While the key window is open, a request that ${named} counts as the person's only ` +
        "when one of this computer's own programs sent it. Nothing that comes from a sandbox is the person.",
    ]
  }
  return ['This office does not trust the machine this request came from, so from it only a key counts.']
}

/** Why this request is not them, and the way on for its kind of caller. */
function whyThisRequestIsNotThem(facts: WhatThisRequestShowed): string {
  const { claimed, key } = facts

  if (key.kind === 'an agent') {
    const whose = `the key of the agent "${key.handle}"`
    const said =
      claimed.kind === 'not read'
        ? `The key this request carried is ${whose}.`
        : claimed.kind === 'an agent' && key.sameAsTheHeaders
          ? `${theNameItGave(claimed)}, and its key proves that agent.`
          : `${theNameItGave(claimed)}, but the key it carried is ${whose}.`
    return `${said} An agent's key never proves the person.`
  }
  if (key.kind === 'the office') {
    const said =
      claimed.kind === 'not read'
        ? "The key this request carried is the office's own key"
        : `${theNameItGave(claimed)}, and the key it carried is the office's own key`
    return `${said}, which the office's own programs use. That key never proves the person.`
  }
  const provedNobody = key.presented === true ? [A_REQUEST_WITH_NO_NAME_SAYS.aKeyThatProvesNoOne] : []
  if (claimed.kind === 'an agent') {
    return [`${theNameItGave(claimed)}.`, ...provedNobody, 'An agent is never the person.'].join(' ')
  }
  // `not read` IS ONLY EVER A KEYED REQUEST, and both keys that prove somebody other than the person
  // were answered above; the person's key is never refused. So what is left named them or nobody, and
  // anything else is a broken assumption that must not be put into words.
  if (claimed.kind === 'not read') {
    throw new Error('a refusal was asked for a keyed request whose key proved neither an agent nor the office')
  }
  return [
    claimed.kind === 'a person'
      ? `${theNameItGave(claimed)}, but it carried no key that proves the person.`
      : A_REQUEST_WITH_NO_NAME_SAYS.noNameAndNoKey,
    ...provedNobody,
    ...theWayOnForThem(facts),
  ].join(' ')
}

/**
 * THE WORDS FOR A REQUEST THAT CARRIED NO NAME, and for a key that proves no agent or person here, said once.
 * Exported so that a test reads them here rather than writing them out (round 130).
 */
export const A_REQUEST_WITH_NO_NAME_SAYS = {
  noName: 'This request carried no name',
  noNameAndNoKey: 'This request carried no name and no key that proves the person.',
  aKeyThatProvesNoOne: 'The key it carried proves no agent or person here.',
} as const

/** The name the headers gave, as the start of a sentence. */
function theNameItGave(claimed: Exclude<WhatTheHeadersClaimed, { kind: 'not read' }>): string {
  if (claimed.kind === 'a person') return `This request named "${claimed.id}"`
  if (claimed.kind === 'an agent') return `This request named the agent "${claimed.id}"`
  return A_REQUEST_WITH_NO_NAME_SAYS.noName
}

/** The words for "the window", said once so every sentence below calls it the same thing. */
const THE_WINDOW = "the window in which a request without the person's key still counts as theirs"

/**
 * WHO PAIRS WITH ONE PRESS ON THIS COMPUTER, AND WHO ACTS, in the four sentences that say it. `pairHere` is the way on
 * in a refusal. `whoPairs` ends the pairing press's own refusal (POST /api/office/pairing in api/office.ts). `whoActs`
 * ends the refusal of a keyless claim to be the person that did not count because of who sent it. `onTheOfficesMachine`
 * ends the ask door's refusal of a machine this office does not trust (POST /api/office/pairing/ask in api/office.ts).
 * All four are chosen by whom this computer finds (lib/from-a-sandbox.ts), as GET /api/office/pairing's `offered` is,
 * so none can disagree with another.
 *
 * Inside the installed app the page cannot tell whether it runs in the app's window or in a browser, so a browser is
 * shown the press too. The sentence says that it is refused when it presses.
 */
const NOTHING_PAIRS_HERE =
  'On this computer Mole Office cannot tell which program sent a request. So nothing here pairs with one press, and a ' +
  "request counts as the person's only with the person's key."

/** The four sentences about pairing and acting on one system. */
interface TheWayToPair {
  pairHere: string
  whoPairs: string
  whoActs: string
  onTheOfficesMachine: string
}

const THE_WAY_TO_PAIR: Record<WhomThisComputerFinds, TheWayToPair> = {
  "any program of this server's user": {
    pairHere: "A browser on this computer gets the person's key at #/pairing, with one press.",
    whoPairs: 'The person pairs from their own browser on this computer.',
    whoActs: 'The person acts from their own browser, or with their key.',
    onTheOfficesMachine: 'On the machine that runs the office, a browser can be paired directly from the pairing page instead.',
  },
  "only the installed app's own window": {
    pairHere:
      "Only the Mole Office window on this computer gets the person's key at #/pairing, with one press. A browser on " +
      'this computer is shown the press and refused.',
    whoPairs: 'The person pairs from the Mole Office window on this computer.',
    whoActs: 'The person acts from the Mole Office window on this computer, or with their key.',
    onTheOfficesMachine:
      'On the machine that runs the office, only the Mole Office window can be paired directly from the pairing page. ' +
      'A browser there cannot.',
  },
  'no program': {
    pairHere: NOTHING_PAIRS_HERE,
    whoPairs: NOTHING_PAIRS_HERE,
    whoActs: 'On this computer Mole Office cannot tell which program sent a request, so the person acts only with their key.',
    onTheOfficesMachine:
      'On the machine that runs the office nothing can be paired directly, because Mole Office there cannot tell which ' +
      'program sent a request.',
  },
}

/** The four sentences about pairing and acting that are true on the system this office runs on. */
export function theWayToPairOnThisComputer(): TheWayToPair {
  return THE_WAY_TO_PAIR[whomThisComputerFinds()]
}

const ASK_FROM_ANOTHER_MACHINE =
  "A browser on another machine asks for the person's key at #/pairing, with one press. The person then confirms " +
  'it at the Embassy, from a paired browser on the computer that runs the office.'

const TRUST_THE_MACHINE_FIRST =
  'The person can add a machine to the trusted list on the Worlds page on the computer that runs the office.'

/**
 * THE WAY ON FOR A REQUEST THAT WANTS TO BE THE PERSON and carried no key that proves them. It depends on
 * where the request came from and on the window, and on nothing else.
 */
function theWayOnForThem(facts: WhatThisRequestShowed): string[] {
  const { arrived, windowOpen, key } = facts
  // IN-PROCESS: only a request that named nobody is refused here, and naming them is enough.
  if (arrived.kind === 'no listener') {
    return ["A request made inside the office's own program counts as the person's when its headers name the person."]
  }
  if (arrived.kind === 'this machine') {
    if (windowOpen) return [`From this computer, a request whose headers name the person counts as theirs while ${THE_WINDOW} is open.`]
    return [`${capital(THE_WINDOW)} is closed.`, theWayToPairOnThisComputer().pairHere]
  }
  const waiting =
    key.kind === 'nobody' && key.presented === true ? ['A browser that has asked at #/pairing holds a key like that until the person confirms it.'] : []
  if (arrived.trusted === true) {
    if (windowOpen) {
      return [`From this machine, which this office trusts, a request whose headers name the person counts as theirs while ${THE_WINDOW} is open.`]
    }
    return [`${capital(THE_WINDOW)} is closed.`, ASK_FROM_ANOTHER_MACHINE, ...waiting]
  }
  if (arrived.trusted === false) {
    return [
      "This office does not trust the machine this request came from, so from it only the person's key counts.",
      TRUST_THE_MACHINE_FIRST,
      ASK_FROM_ANOTHER_MACHINE,
    ]
  }
  // THE MACHINE'S TRUST WAS NOT READ: say both cases, each with its condition.
  return [
    windowOpen
      ? `From a machine this office trusts, a request whose headers name the person counts as theirs while ${THE_WINDOW} is open. From any other machine only the person's key counts.`
      : `${capital(THE_WINDOW)} is closed.`,
    ASK_FROM_ANOTHER_MACHINE,
    TRUST_THE_MACHINE_FIRST,
  ]
}

function capital(sentence: string): string {
  return sentence.charAt(0).toUpperCase() + sentence.slice(1)
}
