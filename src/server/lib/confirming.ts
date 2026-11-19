// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE A QUESTION IS: with the starter of the agent that asked it, or with the person.
 *
 * Criterion P55: a question from an agent goes first to whoever started that agent, who decides
 * whether it is for the person or can be closed there.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, IN ONE PARAGRAPH
 * ---------------------------------------------------------------------------------------
 *
 * An agent writes `whose_move: person`. If that agent has a starter, the question is with the
 * starter and not with the person. The starter passes it on, closes it, or takes the question off
 * the record. Passing it on moves it one rung: to the starter's own starter, until it reaches an
 * agent whose starter is the person, and that agent passing it on is what puts it on the person's
 * list. Only what somebody passed on is in their list, and the record says who did.
 *
 * ---------------------------------------------------------------------------------------
 * A CHAIN THAT CANNOT BE FOLLOWED SENDS THE QUESTION TO THE PERSON, AND SAYS SO
 * ---------------------------------------------------------------------------------------
 *
 * Four things stop the walk: the ledger cannot say who marked it, the marker is not in the registry,
 * nobody recorded who started the marker, or the starters go round in a circle. In all four the
 * question goes to the person exactly as it did before this rule existed, and the reading says which
 * of the four it was.
 *
 * THAT DIRECTION IS DELIBERATE AND IT IS THE SAFE ONE. The other direction — hold the question until
 * a chain appears — loses it: nobody is looking at a list of questions that reached nobody, so the
 * person would simply never be asked, and neither they nor the agent would see anything wrong. Their
 * rule is that a starter should see it first, not that a question with no starter should vanish.
 *
 * IT IS ALSO A HOLE AND IT IS WRITTEN DOWN RATHER THAN PAPERED OVER. An agent that never registers
 * has no starter, so its questions go straight to the person, which is what this criterion is against. The
 * answer to that is the registration rule and not this file, because an unregistered writer is
 * refused a message to them already (chapter 7) and nothing here can invent a starter for one.
 */

import type { PanelRecord } from '@shared/types.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { CONFIRMED_BY, sayWhereTheQuestionIs, type PassedItOn, type WhereTheQuestionFacts, type WhereTheQuestionIs } from '@shared/confirming.ts'
import { createI18n } from '@shared/i18n.ts'
import { type AStarter, type ChainReading } from './participants.ts'
import { theChainUpWith } from '@shared/the-chain-up-with.ts'
import { theStarterEachStringNames } from './the-starter-each-string-names.ts'
// WHICH AGENTS A STORED ACTOR STAMP COULD NAME, read from the one place that answers it.
//
// IT IS NOT `participantForActor`, AND THAT IS THIS FILE'S OWN DEFECT WRITTEN DOWN. That reader is
// the ARRIVING-reference resolver: it raises a 409 when a name means two agents, which is right
// for the live actor on a request and wrong for a string off the revision ledger. Problem
// `1depXfmbfVH9`, and the block on `whereTheQuestionIs` below has the whole account.
//
// IT IS READ FROM THE FILE THAT DECLARES IT, under src/server/db, and not through lib/records.ts, which
// hands it on: reading it there put this file in the largest runtime cycle. The alternative was a second
// copy of "which agents could this stored string mean" living here, free to disagree with the one the
// governance guards ask — which is invariant 9's own defect.
import { everyAgentAStoredStampCouldName } from '../db/every-agent-a-stored-stamp-could-name.ts'
import { whoWroteTheValue } from '../db/who-wrote-the-value.ts'

/** The field, and the value that makes a record a question for the person. */
const WHOSE_MOVE = 'whose_move'
const THE_PERSONS_MOVE = 'person'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A PARTICIPANT KEY, for comparing two references without writing the join twice.
 *
 * IT IS JOINED RATHER THAN INTERPOLATED, and that is not a style choice. A template holding
 * `who.kind` reads to `tests/the-machine-word-gate.test.ts` exactly like a stored word reaching a
 * screen unread, because a text scanner cannot tell a comparison key from a sentence. This is a key
 * and nobody ever sees it, so it is written the way that says so.
 */

/**
 * THE SERVER'S SENTENCE IS THE ENGLISH WORDS, filled with the reading's facts, by the one function the
 * record page calls in its own language (check gfJxVyLI6nvX, invariant 9). So the door, a refusal and
 * the page cannot say different things, and a page in Chinese keeps every name and time.
 */
const IN_ENGLISH = createI18n('en').t
function withItsSentence(reading: Omit<WhereTheQuestionIs, 'says'>): WhereTheQuestionIs {
  return { ...reading, says: sayWhereTheQuestionIs(IN_ENGLISH, reading) }
}

export function participantKey(who: ParticipantRef): string {
  return [who.kind, who.id].join(':')
}

/**
 * THE LIST AS THE RECORD HOLDS IT, with anything unreadable left out rather than guessed at.
 *
 * A stored entry that is not `{who:{kind,id},at}` is dropped: it names nobody, so counting it as a
 * pass would be reading a broken row as a permission that had been exercised.
 */
export function passedItOnBy(data: unknown): PassedItOn[] {
  const held = isObject(data) ? data[CONFIRMED_BY] : undefined
  if (!Array.isArray(held)) return []
  const out: PassedItOn[] = []
  for (const one of held) {
    if (!isObject(one)) continue
    const who = one['who']
    if (!isObject(who)) continue
    const kind = who['kind']
    const id = who['id']
    const at = one['at']
    if ((kind !== 'agent' && kind !== 'person') || typeof id !== 'string' || id === '') continue
    out.push({ who: { kind, id }, at: typeof at === 'string' ? at : '' })
  }
  return out
}

/**
 * WHERE THIS QUESTION IS. The one reading; the queue, the guards and the screen all ask it.
 *
 * `theAgentThisNames` is the stored reader the chain is walked with. The queue asks this about every record it is
 * building, so it reads every agent once and gives the reader over that list. A caller that asks about one record
 * gives `theStarterEachStringNames` through `whereOneQuestionIs`, which reads only the rows a string can name. Both
 * answer a string the same way, so both give the same reading.
 */
export function whereTheQuestionIs(
  record: Pick<PanelRecord, 'id' | 'data'>,
  theAgentThisNames: (id: string) => AStarter | null,
): WhereTheQuestionIs {
  const data = isObject(record.data) ? record.data : {}
  const confirmedBy = passedItOnBy(data)

  if (data[WHOSE_MOVE] !== THE_PERSONS_MOVE) {
    return withItsSentence({
      markedBy: null,
      with: null,
      confirmedBy,
      reachedThePerson: false,
      case: 'not-a-question',
      facts: {},
    })
  }

  const asked = whoWroteTheValue(record.id, WHOSE_MOVE, THE_PERSONS_MOVE)
  if (asked === null) {
    return withItsSentence({
      markedBy: null,
      with: null,
      confirmedBy,
      reachedThePerson: true,
      case: 'asker-not-recorded',
      facts: {},
    })
  }
  if (asked.actorType === 'human') {
    return withItsSentence({
      markedBy: { kind: 'person', id: asked.actorId },
      with: null,
      confirmedBy,
      reachedThePerson: true,
      case: 'person-wrote-it',
      facts: {},
    })
  }

  /**
   * WHO ASKED, READ THE WAY A STORED STAMP IS READ AND NOT THE WAY AN ARRIVING NAME IS.
   *
   * ---------------------------------------------------------------------------------------
   * WHAT THIS LINE USED TO BE, AND WHAT IT COST — problem `1depXfmbfVH9`
   * ---------------------------------------------------------------------------------------
   *
   * It was `participantForActor({ type: 'agent', id: asked.actorId })`. `asked.actorId` is a STORED
   * stamp off the revision ledger; `participantForActor` is the ARRIVING-reference resolver, which
   * since piece I-1 RAISES a 409 when a name means two agents. So once piece I-2 freed a handle and
   * somebody took it, a record whose asker stamp was that name answered 409 to everything:
   *
   *   · PATCH, because `assertMayRemoveAnAsk` asks this on every write that touches the ask;
   *   · GET, because the record route serves this reading with every record;
   *   · AND THE OWNER WAS NOT EXEMPT. They could not read the record and could not clear the question.
   *     It dropped off their own page for a reason that was about a name rather than about their record.
   *
   * Nothing was written, so it was fail-closed rather than a hole. It was still a record out of their
   * reach. Measured while piece I-3b stood the collision up in a test; 36 call sites of
   * `participantForActor` in src/ were then swept, and 35 of them pass the LIVE actor off a request,
   * which is what the throwing resolver is for. This was the only one passing a stored stamp.
   *
   * THE RULE IT TEACHES: a stored stamp is never resolved by the arriving-reference resolver.
   *
   * ---------------------------------------------------------------------------------------
   * WHAT IT DOES NOW
   * ---------------------------------------------------------------------------------------
   *
   * Criterion I2's reading of a stored string, which does not throw: an EXACT ID first and it settles
   * it alone, because an id is never reused; failing that, the one agent bearing the string as a
   * handle, live or retired, because the asker may have retired since it asked. Where MORE THAN ONE
   * answers, no agent answers, and the answer falls into the branch that was already here for a stamp
   * nothing bears — with a sentence of its own, because *two agents bear this name* and *nobody bears
   * this name* are different facts and a reader has to be able to tell them.
   *
   * AND THE QUESTION GOES TO THE PERSON, which is the safe direction. A question whose asker cannot
   * be placed is one nobody can be shown to have started, so there is no starter to hold it, and it
   * belongs in their queue rather than out of everybody's reach.
   */
  const couldHaveAsked = everyAgentAStoredStampCouldName(asked.actorId)
  if (couldHaveAsked.length > 1) {
    return withItsSentence({
      markedBy: null,
      with: null,
      confirmedBy,
      reachedThePerson: true,
      case: 'ambiguous-asker',
      facts: { asker: asked.actorId, candidates: couldHaveAsked.map((one) => `${one.name} (${one.handle})`) },
    })
  }
  const marker: ParticipantRef | null =
    couldHaveAsked.length === 1 ? { kind: 'agent', id: couldHaveAsked[0]!.id } : null
  if (marker === null) {
    return withItsSentence({
      markedBy: null,
      with: null,
      confirmedBy,
      reachedThePerson: true,
      case: 'asker-not-registered',
      facts: { asker: asked.actorId, askerKind: 'agent' },
    })
  }

  // THE ASKER'S ROW, by the registry id the stamp was read to, which the reader answers by id.
  const held = theAgentThisNames(marker.id)
  // AN AGENT IN THESE SENTENCES IS NAMED BY THE HANDLE ON ITS ROW, never by a minted id nobody chose
  // (wave 13b, rule 5). Where no row answers, the stored string is shown as it is. A person is named
  // by id, as before. The reader answers a string by id first; where it answers by handle, that handle is the string,
  // so the name is the same as a reading by id alone.
  const nameOf = (who: ParticipantRef): string =>
    who.kind === 'agent' ? (theAgentThisNames(who.id)?.handle ?? who.id) : who.id
  // NOBODY RECORDED WHO STARTED THE ASKER. `theChainUpWith` is handed a null and answers about the
  // chain rather than about the agent, so the sentence is written here where the agent is known:
  // "nobody started it" and "the chain above it goes round" are different facts and a reader has to
  // be able to tell which one sent the question straight to the person.
  if (held === null || held.startedBy === null) {
    return withItsSentence({
      markedBy: marker,
      with: null,
      confirmedBy,
      reachedThePerson: true,
      case: 'asker-has-no-starter',
      facts: { asker: nameOf(marker), askerKind: marker.kind },
    })
  }
  const chain = theChainUpWith(held.startedBy, theAgentThisNames)
  if (!chain.reachesThePerson) {
    return withItsSentence({
      markedBy: marker,
      with: null,
      confirmedBy,
      reachedThePerson: true,
      case: 'starter-chain-cannot-be-followed',
      facts: { asker: nameOf(marker), askerKind: marker.kind, ...whereTheChainBreaks(chain, theAgentThisNames) },
    })
  }

  // THE AGENTS BETWEEN THE ASKER AND THE PERSON, nearest first. The person at the top of the chain
  // is not one of them: the person is who it ends up with, not somebody who passes it on.
  const rungs = chain.chain.filter((one) => one.kind === 'agent')
  const passed = new Set(confirmedBy.map((one) => participantKey(one.who)))
  const next = rungs.find((one) => !passed.has(participantKey(one))) ?? null

  if (next === null) {
    const last = confirmedBy[confirmedBy.length - 1]
    return withItsSentence({
      markedBy: marker,
      with: null,
      confirmedBy,
      reachedThePerson: true,
      case: last === undefined ? 'nobody-above-asker' : 'passed-to-person',
      facts: last === undefined ? {} : { passedBy: nameOf(last.who), passedByKind: last.who.kind, passedAt: last.at },
    })
  }

  return withItsSentence({
    markedBy: marker,
    with: next,
    confirmedBy,
    reachedThePerson: false,
    case: 'waiting-with-agent',
    facts: { asker: nameOf(marker), askerKind: marker.kind, holder: nameOf(next), holderKind: next.kind, viaStarters: rungs.length > 1 },
  })
}


/**
 * WHY THE CHAIN OF STARTERS ABOVE THE ASKER REACHES NOBODY, as facts. `theChainUpWith` says the same in
 * one English sentence for its other readers; this is the reading a page in any language can say. An
 * agent is named by the handle on its row; where no row answers, by the stored string. The walk has already put the
 * registry id in place of every string the reader answers, and a string it left is one the reader answers with nobody.
 */
function whereTheChainBreaks(chain: ChainReading, theAgentThisNames: (id: string) => AStarter | null): Pick<WhereTheQuestionFacts, 'chainBreak' | 'chainAt' | 'chainAtKind'> {
  const row = (at: ParticipantRef) => (at.kind === 'agent' ? theAgentThisNames(at.id) : null)
  if (chain.loopAt !== null) return { chainBreak: 'loops', chainAt: row(chain.loopAt)?.handle ?? chain.loopAt.id, chainAtKind: chain.loopAt.kind }
  if (chain.stopsAt !== null) {
    const held = row(chain.stopsAt)
    return held === null
      ? { chainBreak: 'unregistered', chainAt: chain.stopsAt.id, chainAtKind: chain.stopsAt.kind }
      : { chainBreak: 'no-starter', chainAt: held.handle, chainAtKind: chain.stopsAt.kind }
  }
  return { chainBreak: 'no-chain' }
}

/**
 * THE SAME READING, FOR ONE RECORD, reading only the rows the asker's chain names. The reader reads nothing until it is
 * asked, so a record that asks nothing reads no agent. Every record read and every record write asks this for its reply.
 */
export function whereOneQuestionIs(record: Pick<PanelRecord, 'id' | 'data'>): WhereTheQuestionIs {
  return whereTheQuestionIs(record, theStarterEachStringNames())
}
