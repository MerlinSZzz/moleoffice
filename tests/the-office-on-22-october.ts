// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A THROWAWAY OFFICE AT THE LIVE OFFICE'S COUNTS OF 22 OCTOBER 2026, FOR THE TWO TIMERS THAT HELD IT LONGEST. Made-up
 * rows only.
 *
 * On 22 October 2026 the live server's loop watch saw it held for more than a second 2,681 times, about 8,200 s in all,
 * and 4,413 s of that with no request open. Two named timers held most of it: the flow reminders (lib/reminders.ts), about
 * 3.3 s a run, and the presence clock (api/events.ts), up to 4.7 s in one run. The live database's counts were read that
 * evening, with no content. This file builds an office of them, with the builder of tests/the-office-at-the-live-scale.ts,
 * and then gives it the three things that builder does not make at these counts.
 *
 * WHAT WAS COUNTED ON THE LIVE DATABASE THAT DAY, and is built exactly:
 *   - the records of the eleven largest kinds, and the records in all;
 *   - the session records by state: of those still open, 70 say running, 373 orphaned and 11 idle;
 *   - the messages the office itself sent, 22,431, which makes it the busiest sender;
 *   - counted again at 20:13 that evening: the seven secretaries, none retired, and for each the deliveries to it, how
 *     many of those are of the person's messages, and its own messages delivered to the person; and the person's
 *     deliveries, 5,522. The busiest recipient is a secretary, with 17,079 (17,034 earlier that day).
 *
 * WHAT WAS COUNTED AND IS ONLY COME NEAR. The live office had 74,565 rows of `message_delivery` and 952 senders of a
 * message. The builder writes one delivery for each message and two for a group message, and the build says what it
 * made of each (`theOfficeOn22OctoberHas`).
 *
 * WHAT NOBODY COUNTED THAT DAY, AND IS GUESSED. The records of the other kinds share what is left of the 94,344 as those
 * kinds shared theirs on 9 October. The agents' rows are 9 October's share of the agent records. Runs and messages that
 * nobody counted again are 9 October's share of the runs and of the messages, as tests/the-office-at-the-live-scale.ts
 * guesses for its copy of 5 October. The call log, its summaries and the reads of a conversation keep 9 October's counts:
 * the call log holds a week of requests, so it does not grow with the office's records. The groups keep 9 October's
 * count, because nothing says how they grew.
 *
 * HOW THE SECRETARIES AND THE PERSON GET THEIR DELIVERIES. Messages the builder made are given to them, so no count of
 * records changes. Each secretary's share is spread evenly over the history, interleaved with the others'.
 *   - Its messages to the person are messages from another contact to the person, now sent by the secretary. One in
 *     four names a broadcast time of the default setting, 07:00 or 18:00, so it is one of the secretary's broadcasts.
 *   - The person's messages to it are the person's messages to another contact, now to the secretary.
 *   - The rest of its deliveries are the measured agent's messages to the person, as many as take the person down to
 *     5,522, then the office's messages to an agent, then messages between two agents, each now to the secretary.
 *
 * THE RUNS' STAMPS. The builder stamps each run ten minutes after the one before it from 1 August, which at 14,585 runs
 * goes a month past 9 October. Every run is stamped again, evenly from 1 August to ten minutes before the build's `now`,
 * in the same order, and a closed run's close stamp with it. Without that, a third of the runs were written after now,
 * and a reading of the runs changed since its last reading read all of them every minute.
 *
 * WHICH MESSAGES BECOME THE OFFICE'S. The builder gives the office about one message in twenty. The newest messages
 * between two agents, all but the largest, are given to the office until it has sent 22,431, each still delivered to the agent it was
 * delivered to, with the office's title. The office is the sender the two timers ask about: the flow reminders read the
 * lines it has already said, so that none is said twice.
 */
import type Database from 'better-sqlite3'
import { theLiveSessionTookIt } from '../src/shared/handles.ts'
import { MOLE_OFFICE_HANDLE } from '../src/shared/participants.ts'
import { localStamp, parseAnyStamp } from '../src/shared/time.ts'
import type { TheChatOffice } from './the-chat-office-of-the-live-shape.ts'
import { THE_MEASURED_NOW } from './the-office-of-the-slowest-reads.ts'
import { buildTheOfficeAtAScale, THE_LIVE_OFFICE_ON_9_OCTOBER, theSecretaryCard, type AScale } from './the-office-at-the-live-scale.ts'

/** The records of each kind on the live database on 22 October 2026, for the eleven kinds that were counted. */
const THE_KINDS_COUNTED = {
  message: 55_765, session: 14_585, flow_run: 6_918, report: 4_459, sealed_tip: 4_413, problem: 1_593, agent: 1_459,
  merge_entry: 1_337, decision: 1_166, note: 871, task: 470,
} as const

/** The records of every kind on the live database that day. */
const THE_RECORDS_COUNTED = 94_344

/** The session records still open that say they are running, orphaned or idle. */
export const THE_OPEN_RUNS_BY_STATE = { running: 70, orphaned: 373, idle: 11 } as const

/** The messages the office itself sent. */
export const THE_OFFICES_MESSAGES = 22_431

/** The counts that were come near and not built exactly, to say beside what a build made. */
export const THE_COUNTS_COME_NEAR = { messageDelivery: 74_565, senders: 952 } as const

/** One secretary's deliveries as counted. */
export interface ASecretarysDeliveries {
  /** Deliveries to the secretary. */
  deliveries: number
  /** Of those, deliveries of the person's messages. */
  ofThePersonsMessages: number
  /** The secretary's own messages delivered to the person. */
  theirsToThePerson: number
}

/** The seven secretaries at 20:13 that evening, in the order they were counted, the busiest first. */
export const THE_SECRETARIES: readonly ASecretarysDeliveries[] = [
  { deliveries: 17_079, ofThePersonsMessages: 720, theirsToThePerson: 1_191 },
  { deliveries: 1_190, ofThePersonsMessages: 33, theirsToThePerson: 43 },
  { deliveries: 445, ofThePersonsMessages: 28, theirsToThePerson: 64 },
  { deliveries: 3_683, ofThePersonsMessages: 734, theirsToThePerson: 1_228 },
  { deliveries: 5_351, ofThePersonsMessages: 189, theirsToThePerson: 327 },
  { deliveries: 1_297, ofThePersonsMessages: 216, theirsToThePerson: 350 },
  { deliveries: 2_164, ofThePersonsMessages: 165, theirsToThePerson: 303 },
]

/** The deliveries to the person at the same moment. */
export const THE_PERSONS_DELIVERIES = 5_522

/** `counts` scaled to add up to `total`: each rounded down, then one more to the largest remainders, ties by name. */
function inProportion(counts: Readonly<Record<string, number>>, total: number): Record<string, number> {
  const whole = Object.values(counts).reduce((sum, n) => sum + n, 0)
  const exact = Object.entries(counts).map(([name, n]) => ({ name, n: (n * total) / whole }))
  const out = Object.fromEntries(exact.map((one) => [one.name, Math.floor(one.n)]))
  let left = total - Object.values(out).reduce((sum, n) => sum + n, 0)
  for (const one of [...exact].sort((a, b) => b.n - Math.floor(b.n) - (a.n - Math.floor(a.n)) || a.name.localeCompare(b.name))) {
    if (left === 0) break
    out[one.name] = out[one.name]! + 1
    left -= 1
  }
  return out
}

/** The live office of 22 October 2026, from the counts above and the guesses the header names. */
export const THE_LIVE_OFFICE_ON_22_OCTOBER: AScale = (() => {
  const before = THE_LIVE_OFFICE_ON_9_OCTOBER
  const counted = Object.values(THE_KINDS_COUNTED).reduce((sum, n) => sum + n, 0)
  const theOtherKinds = Object.fromEntries(Object.entries(before.records).filter(([kind]) => !(kind in THE_KINDS_COUNTED)))
  const records: Record<string, number> = { ...inProportion(theOtherKinds, THE_RECORDS_COUNTED - counted), ...THE_KINDS_COUNTED }
  const ofRuns = (n: number): number => Math.round((n * records.session!) / before.records.session!)
  const ofMessages = (n: number): number => Math.round((n * records.message!) / before.records.message!)
  const open = THE_OPEN_RUNS_BY_STATE.running + THE_OPEN_RUNS_BY_STATE.orphaned + THE_OPEN_RUNS_BY_STATE.idle
  return {
    ...before,
    records,
    agents: Math.round((before.agents * records.agent!) / before.records.agent!),
    openRuns: ofRuns(before.openRuns),
    runsThatNameTheirAgent: ofRuns(before.runsThatNameTheirAgent),
    runsNamedByACall: ofRuns(before.runsNamedByACall),
    runningRuns: open,
    secretaries: THE_SECRETARIES.length,
    comments: ofMessages(before.comments),
    groupMessages: ofMessages(before.groupMessages),
  }
})()

/** What a build made of the counts it only comes near, read from the database it built. */
export interface WhatTheBuildMade {
  messageDelivery: number
  senders: number
  theBusiestRecipientsDeliveries: number
  thePersonsDeliveries: number
  /** The secretaries, by id, which is the order `THE_SECRETARIES` is built in. */
  secretaries: ASecretarysDeliveries[]
  theOfficesMessages: number
  openRunsByState: Record<string, number>
  /** Runs stamped after the build's `now`; the build leaves none. */
  runsAfterNow: number
}

/** Reads back from `sqlite` what a build made of the counts in `THE_COUNTS_COME_NEAR` and of the ones built exactly. */
export function theOfficeOn22OctoberHas(sqlite: Database.Database, person: string, now: Date = THE_MEASURED_NOW): WhatTheBuildMade {
  const one = (query: string, ...values: unknown[]): number => (sqlite.prepare(query).get(...values) as { n: number }).n
  const office = (sqlite.prepare(`select id from agents where handle = ? and retired = 0`).get(MOLE_OFFICE_HANDLE) as { id: string }).id
  const secretaries = (sqlite.prepare(`select id from agents where role = ? and retired = 0 order by id`).all(theSecretaryCard()) as { id: string }[]).map((row) => row.id)
  return {
    messageDelivery: one(`select count(*) as n from message_delivery`),
    senders: one(`select count(distinct json_extract(data, '$.sentBy.kind') || ':' || json_extract(data, '$.sentBy.id')) as n from records where kind = 'message'`),
    theBusiestRecipientsDeliveries: one(`select max(n) as n from (select count(*) as n from message_delivery group by recipient_kind, recipient_id)`),
    thePersonsDeliveries: one(`select count(*) as n from message_delivery where recipient_kind = 'person' and recipient_id = ?`, person),
    secretaries: secretaries.map((id) => ({
      deliveries: one(`select count(*) as n from message_delivery where recipient_kind = 'agent' and recipient_id = ?`, id),
      ofThePersonsMessages: one(
        `select count(*) as n from message_delivery d join records r on r.id = d.message_id
         where d.recipient_kind = 'agent' and d.recipient_id = ? and json_extract(r.data, '$.sentBy.kind') = 'person'`,
        id,
      ),
      theirsToThePerson: one(
        `select count(*) as n from message_delivery d join records r on r.id = d.message_id
         where d.recipient_kind = 'person' and d.recipient_id = ? and json_extract(r.data, '$.sentBy.kind') = 'agent' and json_extract(r.data, '$.sentBy.id') = ?`,
        person,
        id,
      ),
    })),
    theOfficesMessages: one(`select count(*) as n from records where kind = 'message' and json_extract(data, '$.sentBy.kind') = 'agent' and json_extract(data, '$.sentBy.id') = ?`, office),
    openRunsByState: Object.fromEntries(
      (sqlite.prepare(`select json_extract(data, '$.state') as state, count(*) as n from records where kind = 'session' and json_extract(data, '$.state') <> 'finished' group by 1 order by 1`).all() as { state: string; n: number }[]).map((row) => [row.state, row.n]),
    ),
    runsAfterNow: one(`select count(*) as n from records where kind = 'session' and (created_at > ? or updated_at > ?)`, localStamp(now), localStamp(now)),
  }
}

/** `n` of `list`, spread evenly over it, in its order. */
function evenly<T>(list: readonly T[], n: number, what: string): T[] {
  if (n > list.length) throw new Error(`The build needs ${String(n)} ${what} and has ${String(list.length)}.`)
  return Array.from({ length: n }, (_, k) => list[Math.floor((k * list.length) / n)]!)
}

/** Whose turn each of `sum(wants)` things is, so that each one's share is spread evenly among the others'. */
function inTurn(wants: readonly number[], what: string): number[] {
  const turns: { at: number; who: number }[] = []
  wants.forEach((n, who) => {
    if (n < 0) throw new Error(`Secretary ${String(who + 1)} already has ${String(-n)} ${what} more than were counted.`)
    for (let j = 0; j < n; j++) turns.push({ at: (j + 0.5) / n, who })
  })
  return turns.sort((a, b) => a.at - b.at || a.who - b.who).map((one) => one.who)
}

/** Builds the office of 22 October 2026 in the database `sqlite` holds. Requests in `api_calls` end at `now`. */
export function buildTheOfficeOn22October(sqlite: Database.Database, person: string, now: Date = THE_MEASURED_NOW): TheChatOffice {
  const office = buildTheOfficeAtAScale(sqlite, person, THE_LIVE_OFFICE_ON_22_OCTOBER, now)
  sqlite.transaction(() => {
    // THE RUNS STILL GOING, by state as the live database had them. The builder marks the newest runs running; the
    // oldest of those become orphaned, then idle, and the newest stay running.
    const running = (sqlite.prepare(`select id from records where kind = 'session' and json_extract(data, '$.state') = 'running' order by id`).all() as { id: string }[]).map((one) => one.id)
    const open = THE_OPEN_RUNS_BY_STATE
    if (running.length !== open.running + open.orphaned + open.idle) {
      throw new Error(`The builder left ${String(running.length)} runs running, and the live database had ${String(open.running + open.orphaned + open.idle)} still open.`)
    }
    const setState = sqlite.prepare(`update records set data = json_set(data, '$.state', ?) where id = ?`)
    running.slice(0, open.orphaned).forEach((id) => setState.run('orphaned', id))
    running.slice(open.orphaned, open.orphaned + open.idle).forEach((id) => setState.run('idle', id))

    // THE OFFICE AS THE BUSIEST SENDER. Found by its handle, as the builder finds it.
    const theOffice = (sqlite.prepare(`select id from agents where handle = ? and retired = 0`).get(MOLE_OFFICE_HANDLE) as { id: string }).id
    const already = (sqlite.prepare(`select count(*) as n from records where kind = 'message' and json_extract(data, '$.sentBy.kind') = 'agent' and json_extract(data, '$.sentBy.id') = ?`).get(theOffice) as { n: number }).n
    const toGive = THE_OFFICES_MESSAGES - already
    // The builder made the newest of them the largest message, and it stays between two agents.
    const largest = (sqlite.prepare(`select id from records where kind = 'message' order by length(data) desc limit 1`).get() as { id: string }).id
    const between = (sqlite.prepare(`select id from records where kind = 'message' and title = 'between two agents' and id <> ? order by id desc limit ?`).all(largest, toGive) as { id: string }[]).map((one) => one.id)
    if (between.length !== toGive) throw new Error(`The office needs ${String(toGive)} more messages and the build has ${String(between.length)} between two agents.`)
    const give = sqlite.prepare(`update records set title = 'the office to an agent', data = json_set(data, '$.sentBy', json(?)) where id = ?`)
    const sentBy = JSON.stringify({ kind: 'agent', id: theOffice })
    for (const id of between) give.run(sentBy, id)
  })()
  sqlite.transaction(() => giveTheSecretariesTheirDeliveries(sqlite, person))()
  sqlite.transaction(() => stampTheRunsBefore(sqlite, now))()
  return office
}

/** The secretaries' and the person's deliveries as counted, by giving them messages the builder made. */
function giveTheSecretariesTheirDeliveries(sqlite: Database.Database, person: string): void {
  const ids = (query: string, ...values: unknown[]): string[] => (sqlite.prepare(query).all(...values) as { id: string }[]).map((one) => one.id)
  const count = (query: string, ...values: unknown[]): number => (sqlite.prepare(query).get(...values) as { n: number }).n
  const secretaries = ids(`select id from agents where role = ? and retired = 0 order by id`, theSecretaryCard())
  if (secretaries.length !== THE_SECRETARIES.length) {
    throw new Error(`The build has ${String(secretaries.length)} secretaries, and the live office had ${String(THE_SECRETARIES.length)}.`)
  }
  const aSecretary = `(${secretaries.map(() => '?').join(', ')})`
  const toAgent = sqlite.prepare(`update records set title = ?, data = json_set(data, '$.to', json(?)) where id = ?`)
  const deliveredTo = sqlite.prepare(`update message_delivery set recipient_kind = 'agent', recipient_id = ? where message_id = ?`)
  /** Sends the message `id` to the agent `who` instead, with its one delivery. */
  const redirect = (id: string, who: string, title: string): void => {
    toAgent.run(title, JSON.stringify([{ kind: 'agent', id: who }]), id)
    if (deliveredTo.run(who, id).changes !== 1) throw new Error(`Message ${id} has more than one delivery, so it cannot be given to one agent.`)
  }

  // THE BUILDER'S ONE-TO-ONE MESSAGES BETWEEN THE PERSON AND A SECRETARY go to other contacts first, so each count starts
  // from the group messages alone.
  const theOthers = (query: string): string[] => [...new Set(ids(query, ...secretaries))]
  const otherSenders = theOthers(
    `select json_extract(data, '$.sentBy.id') as id from records where kind = 'message' and title = 'from another contact' and json_extract(data, '$.sentBy.id') not in ${aSecretary} order by id`,
  )
  const sentByOther = sqlite.prepare(`update records set data = json_set(data, '$.sentBy', json(?)) where id = ?`)
  ids(
    `select id from records where kind = 'message' and title = 'from another contact' and json_extract(data, '$.sentBy.id') in ${aSecretary} order by id`,
    ...secretaries,
  ).forEach((id, k) => sentByOther.run(JSON.stringify({ kind: 'agent', id: otherSenders[k % otherSenders.length]! }), id))
  const otherRecipients = theOthers(
    `select d.recipient_id as id from records r join message_delivery d on d.message_id = r.id
     where r.kind = 'message' and r.title = 'to another contact' and d.recipient_id not in ${aSecretary} order by r.id`,
  )
  ids(
    `select r.id from records r join message_delivery d on d.message_id = r.id
     where r.kind = 'message' and r.title = 'to another contact' and d.recipient_id in ${aSecretary} order by r.id`,
    ...secretaries,
  ).forEach((id, k) => redirect(id, otherRecipients[k % otherRecipients.length]!, 'to another contact'))

  // EACH SECRETARY'S MESSAGES TO THE PERSON, one in four of them a broadcast.
  const theirs = (who: string): number =>
    count(
      `select count(*) as n from message_delivery d join records r on r.id = d.message_id
       where d.recipient_kind = 'person' and d.recipient_id = ? and json_extract(r.data, '$.sentBy.id') = ?`,
      person,
      who,
    )
  const theirsWanted = secretaries.map((who, i) => THE_SECRETARIES[i]!.theirsToThePerson - theirs(who))
  const fromAContact = evenly(
    ids(
      `select id from records where kind = 'message' and title = 'from another contact' and json_extract(data, '$.sentBy.id') not in ${aSecretary} order by id`,
      ...secretaries,
    ),
    theirsWanted.reduce((a, b) => a + b, 0),
    'messages from another contact to the person',
  )
  const sendAs = sqlite.prepare(`update records set title = 'a secretary to the person', data = json_set(data, '$.sentBy', json(?), '$.body', ? || json_extract(data, '$.body')) where id = ?`)
  const given = secretaries.map(() => 0)
  inTurn(theirsWanted, 'messages to the person').forEach((who, k) => {
    const n = given[who]!++
    const opening = n % 4 === 0 ? `The ${n % 8 === 0 ? '07:00' : '18:00'} broadcast. ` : ''
    sendAs.run(JSON.stringify({ kind: 'agent', id: secretaries[who]! }), opening, fromAContact[k]!)
  })

  // THE PERSON'S MESSAGES TO EACH SECRETARY.
  const ofThePerson = (who: string): number =>
    count(
      `select count(*) as n from message_delivery d join records r on r.id = d.message_id
       where d.recipient_kind = 'agent' and d.recipient_id = ? and json_extract(r.data, '$.sentBy.kind') = 'person'`,
      who,
    )
  const personWanted = secretaries.map((who, i) => THE_SECRETARIES[i]!.ofThePersonsMessages - ofThePerson(who))
  const toAContact = evenly(
    ids(
      `select r.id from records r join message_delivery d on d.message_id = r.id
       where r.kind = 'message' and r.title = 'to another contact' and d.recipient_id not in ${aSecretary} order by r.id`,
      ...secretaries,
    ),
    personWanted.reduce((a, b) => a + b, 0),
    "of the person's messages to another contact",
  )
  inTurn(personWanted, "deliveries of the person's messages").forEach((who, k) => redirect(toAContact[k]!, secretaries[who]!, 'the person to a secretary'))

  // THE REST OF EACH SECRETARY'S DELIVERIES, the person's surplus first.
  const thePersons = count(`select count(*) as n from message_delivery where recipient_kind = 'person' and recipient_id = ?`, person)
  const surplus = evenly(
    ids(`select id from records where kind = 'message' and title = 'from the measured agent' order by id`),
    thePersons - THE_PERSONS_DELIVERIES,
    "of the measured agent's messages to the person",
  )
  const restWanted = secretaries.map(
    (who, i) => THE_SECRETARIES[i]!.deliveries - count(`select count(*) as n from message_delivery where recipient_kind = 'agent' and recipient_id = ?`, who),
  )
  const more = restWanted.reduce((a, b) => a + b, 0) - surplus.length
  const theLargest = (sqlite.prepare(`select id from records where kind = 'message' order by length(data) desc limit 1`).get() as { id: string }).id
  const others = [
    ...ids(
      `select r.id from records r join message_delivery d on d.message_id = r.id
       where r.kind = 'message' and r.title = 'the office to an agent' and d.recipient_id not in ${aSecretary} order by r.id`,
      ...secretaries,
    ),
    ...ids(
      `select r.id from records r join message_delivery d on d.message_id = r.id
       where r.kind = 'message' and r.title = 'between two agents' and r.id <> ? and d.recipient_id not in ${aSecretary} order by r.id`,
      theLargest,
      ...secretaries,
    ),
  ]
  if (more < 0 || more > others.length) throw new Error(`The secretaries need ${String(more)} more deliveries and the build has ${String(others.length)} to give.`)
  const toGive = [...surplus, ...others.slice(0, more)]
  inTurn(restWanted, 'deliveries').forEach((who, k) => redirect(toGive[k]!, secretaries[who]!, 'to a secretary'))
}

/** Every run stamped again, evenly from the first run's stamp to ten minutes before `now`, in the same order. */
function stampTheRunsBefore(sqlite: Database.Database, now: Date): void {
  const runs = sqlite.prepare(`select id, created_at as at from records where kind = 'session' order by id`).all() as { id: string; at: string }[]
  const first = parseAnyStamp(runs[0]!.at)
  if (first === null) throw new Error(`The first run's stamp ${runs[0]!.at} cannot be read.`)
  const last = now.getTime() - 10 * 60_000
  const restamp = sqlite.prepare(
    `update records set created_at = @at, updated_at = @at,
     data = case when json_extract(data, '$.closedAt') is null then data else json_set(data, '$.closedAt', @at) end where id = @id`,
  )
  runs.forEach((run, i) => {
    restamp.run({ id: run.id, at: localStamp(new Date(first.getTime() + Math.floor(((last - first.getTime()) * i) / (runs.length - 1)))) })
  })
}

/**
 * THE MINUTES AFTER A SERVER STARTS, AS THE LIVE OFFICE HAD THEM. Counted on the live database for the 82 minutes after
 * its server started at 18:37 on 22 October 2026: 297 rows of `message_delivery`, 221 of them to an agent with no run and
 * marked delivered or seen, 12 of those of a person's message; 329 records changed; and 1 reminder that a person waits
 * for a reply. The reply reminder reads the deliveries since the start every minute, so its work grows with them.
 */
export const THE_82_MINUTES_AFTER_A_START = {
  minutes: 82, deliveries: 297, toAnAgentWithNoRun: 221, ofAPersonsMessage: 12, recordsChanged: 329, repliesAwaited: 1,
} as const

/** Writes what one minute after a start writes. `minute` counts from 1, and each minute is written once, in order. */
export type TheMinuteAfterAStart = (minute: number) => void

/**
 * The writer of the minutes after a server started at `start`, in the office of 22 October that `sqlite` holds.
 *
 * EACH MINUTE WRITES ITS SHARE OF THE 82 MINUTES' COUNTS, spread evenly: the person's messages to an agent, the agents'
 * messages to each other, the messages to the person and the runs that changed. Every message is written as
 * `buildTheOfficeAtAScale` writes one, about 1,300 bytes, with its delivery rows at the minute it was sent.
 *   - The person sends 12 messages in 82 minutes, to an agent of their contacts that is not retired. One message in six
 *     goes to the group holding the person and the most agents not retired, delivered to each of those agents.
 *   - The agent answers two minutes later, in the same conversation; in a group each of those agents answers. One message in
 *     twelve gets no answer, so the office reminds its agent once, after the reply reminder's minutes.
 *   - A delivery to an agent is marked delivered, or seen with the live session's hand-over sentence, in turn.
 *   - One message in three between agents is the office's.
 * What this makes of the 82 minutes is near the counts above and not equal to them: the group messages add deliveries,
 * and the reminder pass run beside it adds its own lines. A caller reads back what was made.
 */
export function theMinutesAfterAStart(sqlite: Database.Database, person: string, start: Date): TheMinuteAfterAStart {
  const ids = (query: string, ...values: unknown[]): string[] => (sqlite.prepare(query).all(...values) as { id: string }[]).map((one) => one.id)
  const theOffice = (sqlite.prepare(`select id from agents where handle = ? and retired = 0`).get(MOLE_OFFICE_HANDLE) as { id: string }).id
  const working = ids(`select id from agents where retired = 0 and handle <> ? order by id`, MOLE_OFFICE_HANDLE)
  // THE PERSON'S CONTACTS: the agents not retired that the person has already written to.
  const contacts = ids(
    `select distinct d.recipient_id as id from message_delivery d join records r on r.id = d.message_id join agents a on a.id = d.recipient_id
     where d.recipient_kind = 'agent' and a.retired = 0 and json_extract(r.data, '$.sentBy.id') = ? order by 1`,
    person,
  )
  const group = sqlite
    .prepare(
      `select g.id as id, group_concat(m.member_id) as agents from groups g join group_members m on m.group_id = g.id and m.member_kind = 'agent'
       join agents a on a.id = m.member_id and a.retired = 0
       where exists (select 1 from group_members p where p.group_id = g.id and p.member_kind = 'person' and p.member_id = ?)
       group by g.id order by count(*) desc, g.id limit 1`,
    )
    .get(person) as { id: string; agents: string } | undefined
  const running = ids(`select id from records where kind = 'session' and json_extract(data, '$.state') = 'running' order by id`)
  if (contacts.length === 0 || group === undefined || working.length < 2 || running.length === 0) {
    throw new Error('The office of 22 October has no contact, no group of the person with a working agent, or no running run, so its minutes cannot be written.')
  }
  const groupAgents = group.agents.split(',').sort()

  const addRecord = sqlite.prepare(
    `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     values (?, 'message-centre', 'owner', ?, ?, 'message', ?, null, ?, null, 'fixture')`,
  )
  const addDelivery = sqlite.prepare(
    `insert into message_delivery (id, message_id, recipient_kind, recipient_id, mark, because, at, run, inferred_by) values (?, ?, ?, ?, ?, ?, ?, null, null)`,
  )
  const touchARun = sqlite.prepare(`update records set updated_at = ?, data = json_set(data, '$.lastOutputAt', ?) where id = ?`)
  let next = 0
  const idOf = (prefix: string): string => `${prefix}${(next++).toString(36).padStart(10, '0')}`
  const SENTENCE = 'These words were made up for a measurement and say nothing. '
  const machine = { how: 'this machine', machine: 'made-up-machine' }
  const stampOf = (minute: number, second: number): string => localStamp(new Date(start.getTime() + minute * 60_000 + second * 1_000))
  type Who = { kind: 'person' | 'agent'; id: string }
  const thePerson: Who = { kind: 'person', id: person }
  const anAgent = (id: string): Who => ({ kind: 'agent', id })
  /** One message, and a delivery row for each recipient. */
  const send = (at: string, title: string, from: Who, to: Who | { group: string; members: Who[] }, mark: (n: number) => [string, string | null]): void => {
    const id = idOf('mx')
    const toWhom = 'group' in to ? { toGroup: to.group } : { to: [to] }
    addRecord.run(id, at, at, title, JSON.stringify({ body: `${title}: ${SENTENCE.repeat(18)}`, ...toWhom, writtenIn: { project: 'default' }, writtenFrom: machine, sentBy: from }))
    const recipients = 'group' in to ? to.members.filter((one) => one.kind !== from.kind || one.id !== from.id) : [to]
    recipients.forEach((one, n) => addDelivery.run(idOf('dx'), id, one.kind, one.id, ...mark(n), at))
  }
  const delivered = (n: number): [string, string | null] => (n % 2 === 0 ? ['delivered', null] : ['seen', theLiveSessionTookIt(running[n % running.length]!)])
  const seen = (): [string, string | null] => ['seen', null]
  const inTheGroup = { group: group.id, members: [thePerson, ...groupAgents.map(anAgent)] }
  /** How many of `n` things in 82 minutes fall in `minute`, spread evenly. */
  const share = (n: number, minute: number): number => Math.floor((minute * n) / 82) - Math.floor(((minute - 1) * n) / 82)
  const answers = new Map<number, (() => void)[]>()
  let written = 0
  let personMessages = 0
  let betweenAgents = 0
  let toThePerson = 0
  let runsTouched = 0

  return (minute) => {
    if (minute !== written + 1) throw new Error(`Minute ${String(minute)} was asked for after minute ${String(written)}. The minutes are written once each, in order.`)
    written = minute
    let second = 0
    const at = (): string => stampOf(minute - 1, (second += 1))
    for (let i = share(THE_82_MINUTES_AFTER_A_START.ofAPersonsMessage, minute); i > 0; i--) {
      const k = personMessages++
      const inAGroup = k % 6 === 4
      const contact = contacts[k % contacts.length]!
      send(at(), 'to an agent', thePerson, inAGroup ? inTheGroup : anAgent(contact), (n) => delivered(k + n))
      if (k % 12 === 5) continue
      const later = answers.get(minute + 2) ?? []
      if (inAGroup) for (const agent of groupAgents) later.push(() => send(at(), 'an answer in a group', anAgent(agent), inTheGroup, seen))
      else later.push(() => send(at(), 'an answer', anAgent(contact), thePerson, seen))
      answers.set(minute + 2, later)
    }
    for (const answer of answers.get(minute) ?? []) answer()
    answers.delete(minute)
    for (let i = share(THE_82_MINUTES_AFTER_A_START.toAnAgentWithNoRun - THE_82_MINUTES_AFTER_A_START.ofAPersonsMessage, minute); i > 0; i--) {
      const k = betweenAgents++
      const to = working[(k * 7 + 3) % working.length]!
      const from = k % 3 === 0 ? theOffice : working[(k * 7) % working.length] === to ? working[(k * 7 + 1) % working.length]! : working[(k * 7) % working.length]!
      send(at(), k % 3 === 0 ? 'the office to an agent' : 'between two agents', anAgent(from), anAgent(to), () => delivered(k))
    }
    for (let i = share(65, minute); i > 0; i--) {
      const k = toThePerson++
      send(at(), k % 2 === 0 ? 'the office to the person' : 'from another contact', anAgent(k % 2 === 0 ? theOffice : contacts[k % contacts.length]!), thePerson, seen)
    }
    for (let i = share(32, minute); i > 0; i--) {
      const stamp = at()
      touchARun.run(stamp, stamp, running[runsTouched++ % running.length]!)
    }
  }
}
