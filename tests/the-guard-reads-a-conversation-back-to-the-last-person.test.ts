// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GUARD READS A CONVERSATION BACK TO THE LAST MESSAGE A PERSON WROTE, AND COUNTS WHAT THE WHOLE CONVERSATION COUNTS.
 *
 * The conversation guard counts the messages agents have written in one conversation since a person
 * last wrote, and holds an agent's message once that count reaches the installation's allowance. It
 * counted over the whole conversation, sorted out of every message the queue's pool holds. It now
 * reads from the newest message back and stops at the newest message a person wrote
 * (`theConversationBackTo` in lib/messages.ts). Nothing before that message can change the count,
 * because that message sets the count back to nothing.
 *
 * Seven cases, on an office of made-up rows this file builds. The first three are for every conversation
 * a delivery row is in and for every group:
 *
 * 1. THE SAME MESSAGES IN THE SAME ORDER. The pool's sort (`theConversationsOfOnePool`) and the read
 *    of one conversation (`conversationBetween` for a pair, `messagesInAGroup` for a group) hold the
 *    same messages in the same order. Read back with nothing to stop at, `theConversationBackTo`
 *    answers that whole list. After the person's message, one message stores the agent by its handle
 *    as its sender and one stores it by its handle in a delivery row, and the three reads are compared
 *    for every conversation those two are in as well.
 * 2. IT STOPS ONLY AT THE LAST PERSON. Read back to a message a person wrote, it answers the whole
 *    list from the last such message on, and the whole list where no person wrote. Office notices,
 *    messages whose sender nobody recorded and group lines that do not name the other side do not
 *    stop it, however many of them there are.
 * 3. THE SAME COUNT. `agentTurnsInTheConversation` answers the count the pool's sort of the whole
 *    conversation gives, which is worked out here and not by the read the guard makes. A person's
 *    message sets it back to nothing. An agent's message counts unless Mole Office or an inspector
 *    wrote it. A message whose sender nobody recorded is neither. A group an inspector opened counts
 *    nothing, although its agents have taken more turns than the allowance. The person and an agent,
 *    and two agents alone, have taken more turns than the allowance as well.
 * 4. A QUIET PAIR OF TWO AGENTS, with no person in it. It holds a few messages of its own, older than
 *    long runs of the two agents' other conversations: their lines to a third agent, Mole Office's
 *    lines and notices to one of them, their group lines and lines with only a typed sender. Read
 *    back from either side, it answers the whole conversation.
 * 5. A MESSAGE FROM EVERY PART OF THE CANDIDATES THE CHAT READS (`theIdsOfOnePair`), in the pair of
 *    an agent and the person: each way, Mole Office to both, the agent's group line naming the person
 *    with no delivery row to the person, the person's group line, a line with only a typed sender,
 *    Mole Office to the agent alone, and a notice to each side about a message of the other. Read
 *    back from either side, it answers the conversation from the person's message on.
 * 6. A LINE MOLE OFFICE HANDED TO ONE SIDE ONLY, to each side of the quiet pair and of the agent and the person. It
 *    is in neither the whole conversation nor the one read back, from either side. It is in Mole Office's own
 *    conversation with that side, whole and read back.
 * 7. A MESSAGE WITH A TYPED `from` LINE AND NO STORED SENDER, from each side to the other, in the same two pairs. It
 *    is in neither the whole conversation nor the one read back, from either side: a read with no list of
 *    participants finds no sender in a typed line.
 *
 * The rows this file adds are long runs at one instant, with ids that sort against the order they
 * were stored in, so the read crosses the edges of its pieces between two messages of one second.
 *
 * On the bytes before the bounded read the first case fails, because lib/messages.ts has no
 * `theConversationBackTo`.
 *
 * Every row here is synthetic, in this file's own temporary test database.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { buildTheChatOffice } from './the-chat-office-of-the-live-shape.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { participantKey } from '../src/shared/messages.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'
import type { WhichConversation } from '../src/server/lib/worker.ts'

let t: TestDb
let built: Awaited<ReturnType<typeof apiApp>>
let M: typeof import('../src/server/lib/messages.ts')
let W: typeof import('../src/server/lib/worker.ts')

/** One message as the reads hand it out: only who sent it and its id are compared. */
type Said = { id: string; sentBy: ParticipantRef | null }
/** Every conversation a delivery row is in, and every group, by a key of its own. */
const conversations = new Map<string, WhichConversation>()
/** The conversations whose rows this file adds, which the cases check are as long as they need to be. */
const named = { personAndAgent: '', agentsAlone: '', group: '', inspectorsGroup: '', byHandle: '', toHandle: '' }
/** Case 4: the two agents of the quiet pair, its own messages, and how many lines of others' the two agents hold. */
const quiet = { between: [] as ParticipantRef[], own: [] as string[], othersLines: 0 }
/** Messages somebody wrote with aboutMessage: one addressed to the other side, one by a third participant. */
const aboutByAgents = { direct: '', outsider: '' }
/** Case 5: the agent paired with the person, and the added messages that are in their conversation and that are not. */
const everyPart = { agent: null as ParticipantRef | null, members: [] as string[], notMembers: [] as string[] }
/** Cases 6 and 7: Mole Office, its lines handed to one side only with that side, and the lines with only a typed sender. */
const oneSide = { office: null as ParticipantRef | null, lines: [] as { id: string; to: ParticipantRef }[], typedOnly: [] as string[] }
/** The instant every added row carries, later than every row the office builder writes. */
const AT = '2026-10-23 11:00:00'
/** How many lines each long run holds: past the edges of the read's first two pieces. */
const LONG = 200

const person: ParticipantRef = { kind: 'person', id: THE_PERSON }
const agent = (id: string): ParticipantRef => ({ kind: 'agent', id })
const ids = (list: readonly Said[]): string[] => list.map((one) => one.id)
const keyOf = (which: WhichConversation): string => (which.kind === 'group' ? `group ${which.id}` : `pair ${which.id}`)
const pairOf = (a: ParticipantRef, b: ParticipantRef): WhichConversation => ({
  kind: 'pair',
  id: [participantKey(a), participantKey(b)].sort().join('~'),
  between: [a, b],
})

/** The whole conversation, read the way the guard read it when no pool was handed in. */
function theWhole(which: WhichConversation): readonly Said[] {
  return which.kind === 'group'
    ? M.messagesInAGroup(which.id, M.EVERY_PROJECT)
    : M.conversationBetween(which.between[0], which.between[1], M.EVERY_PROJECT, []).messages
}

/** The whole conversation as one sort of the whole pool files it, which is how the queue read it before. */
function inThePool(pool: ReturnType<typeof M.theConversationsOfOnePool>, which: WhichConversation): readonly Said[] {
  return which.kind === 'group' ? pool.inGroup(which.id) : pool.between(which.between[0], which.between[1])
}

/** Where the last message a person wrote sits in a list, or -1 when no person wrote one. */
function theLastPerson(list: readonly Said[]): number {
  for (let i = list.length - 1; i >= 0; i--) if (W.aPersonWroteIt(list[i]!.sentBy)) return i
  return -1
}

/** The count over a whole list: a person sets it back to nothing, and each message the guard counts adds one. */
function theCountOf(list: readonly Said[]): number {
  let turns = 0
  for (const one of list) {
    if (W.aPersonWroteIt(one.sentBy)) turns = 0
    else if (W.thisGuardCountsIt(one.sentBy)) turns += 1
  }
  return turns
}

beforeAll(async () => {
  t = await freshDb()
  built = await apiApp()
  await built.app.ready()
  const shape = buildTheChatOffice(t.client.sqlite, THE_PERSON, {
    agents: 12, retired: 4, theConversation: 120, otherContacts: 3, otherPersonMessages: 36, betweenAgents: 200,
    groups: 4, groupsWithThePerson: 2, membersPerGroup: 4, groupMessages: 120, officeLines: 40, sessions: 40, otherRecords: 0,
  })
  M = await import('../src/server/lib/messages.ts')
  W = await import('../src/server/lib/worker.ts')
  const sqlite = t.client.sqlite
  const newest = (sqlite.prepare("SELECT max(created_at) AS at FROM records WHERE kind = 'message'").get() as { at: string }).at
  expect(newest < AT).toBe(true)
  const notice = sqlite.prepare("SELECT json_extract(data, '$.sentBy') AS sender FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutMessage') IS NOT NULL LIMIT 1").get() as { sender: string }
  const office = JSON.parse(notice.sender) as ParticipantRef
  const personHandle = (sqlite.prepare('SELECT handle FROM people WHERE id = ?').get(THE_PERSON) as { handle: string }).handle
  const others = (sqlite.prepare("SELECT id FROM agents WHERE retired = 0 AND id <> ? AND id <> ? ORDER BY rowid").all(shape.theAgent, office.id) as { id: string }[]).map((one) => one.id)
  const a = agent(shape.theAgent)
  const b = agent(others[0]!)
  const c = agent(others[1]!)
  const inspector = agent(others[2]!)
  const d = agent(others[3]!)
  const e = agent(others[4]!)
  const f = agent(others[5]!)
  const g = agent(others[6]!)
  sqlite.prepare("UPDATE agents SET role = 'inspector' WHERE id = ?").run(inspector.id)
  // THE AGENT BY ITS HANDLE, the way a message may store it instead of by its id.
  const aHandle = (sqlite.prepare('SELECT handle FROM agents WHERE id = ?').get(a.id) as { handle: string }).handle
  expect(aHandle).not.toBe(a.id)
  const aByHandle = agent(aHandle)

  const addRecord = sqlite.prepare("INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, 'message-centre', ?, ?, ?, 'message', 'Made-up line', ?, 'fixture')")
  const addDelivery = sqlite.prepare("INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, ?, ?, 'queued', ?)")
  const addGroup = sqlite.prepare("INSERT INTO groups (id, workspace_id, name, opened_by_kind, opened_by_id, opened_because, opened_at, about) VALUES (?, 'default', ?, ?, ?, 'made up for a test', ?, null)")
  const addMember = sqlite.prepare("INSERT INTO group_members (id, group_id, member_kind, member_id, joined_at, joined_because, left_at) VALUES (?, ?, ?, ?, ?, 'made up for a test', null)")
  // IDS COUNT DOWN while the rows are stored in order, so an order by id would disagree with the stored one.
  let n = 99_999
  const say = (sentBy: ParticipantRef | undefined, to: readonly ParticipantRef[], extra: Record<string, unknown> = {}): string => {
    const id = `turns-line-${String(n--)}`
    const data = { body: 'Made-up words.', ...(extra['toGroup'] === undefined ? { to } : {}), writtenIn: { project: 'default' }, ...(sentBy === undefined ? {} : { sentBy }), ...extra }
    addRecord.run(id, THE_TEST_OFFICES_OWNER.id, AT, AT, JSON.stringify(data))
    for (const [i, one] of to.entries()) addDelivery.run(`${id}-to-${String(i)}`, id, one.kind, one.id, AT)
    return id
  }
  const group = (id: string, by: ParticipantRef, members: readonly ParticipantRef[]): void => {
    addGroup.run(id, id, by.kind, by.id, AT)
    for (const [i, one] of members.entries()) addMember.run(`${id}-member-${String(i)}`, id, one.kind, one.id, AT)
  }
  const theGroup = 'turns-group-a-worker-opened'
  const inspectorsGroup = 'turns-group-an-inspector-opened'
  group(theGroup, a, [person, a, b])
  group(inspectorsGroup, inspector, [inspector, b, c])
  const quietGroup = 'turns-group-of-a-quiet-pair'
  const everyPartGroup = 'turns-group-of-every-part'
  group(quietGroup, d, [person, d, e, g])
  group(everyPartGroup, f, [person, f, g])
  const handleOf = (who: ParticipantRef): string => (sqlite.prepare('SELECT handle FROM agents WHERE id = ?').get(who.id) as { handle: string }).handle
  sqlite.transaction(() => {
    // THE PERSON AND AN AGENT: the agent before the person, the person, then a long run of the agent's lines, its
    // group lines that do not name the person, and office notices about one of its lines, newest of all.
    say(a, [person])
    say(person, [a])
    // THE AGENT STORED BY ITS HANDLE after the person's message: as the sender of one message, and in the delivery row
    // of a line from Mole Office, so that the person's message stays the last one a person wrote.
    say(aByHandle, [person])
    say(office, [aByHandle])
    let aLine = ''
    for (let i = 0; i < LONG; i++) aLine = say(a, [person])
    for (let i = 0; i < LONG; i++) say(a, [person, b], { toGroup: theGroup })
    for (let i = 0; i < LONG; i++) say(office, [person], { aboutMessage: aLine })
    // THE GROUP: an agent, the person, a long run nobody recorded the sender of, then agents, some naming the person.
    say(b, [person, a], { toGroup: theGroup })
    say(person, [a, b], { toGroup: theGroup })
    for (let i = 0; i < LONG; i++) say(undefined, [person, a, b], { toGroup: theGroup })
    for (let i = 0; i < LONG; i++) {
      if (i % 2 === 0) say(b, [person, a], { toGroup: theGroup })
      else say(a, [person, b], { toGroup: theGroup, body: `@${personHandle} Made-up words.` })
    }
    // TWO AGENTS WITH NO PERSON, far past any allowance.
    for (let i = 0; i < LONG; i++) say(i % 2 === 0 ? b : c, [i % 2 === 0 ? c : b])
    // THE GROUP AN INSPECTOR OPENED, where agents talk on.
    for (let i = 0; i < 12; i++) say(i % 2 === 0 ? b : c, [inspector, i % 2 === 0 ? c : b], { toGroup: inspectorsGroup })
    // CASE 4, A QUIET PAIR: each way once, Mole Office to both, and a notice to one about a message of the pair. Then,
    // newer, long runs in the two agents' other conversations, none of which is in the pair.
    const dToE = say(d, [e])
    quiet.own.push(dToE, say(e, [d]), say(office, [d, e]), say(office, [e], { aboutMessage: dToE }))
    aboutByAgents.direct = say(d, [e], { aboutMessage: dToE })
    aboutByAgents.outsider = say(g, [d], { aboutMessage: dToE })
    for (let i = 0; i < LONG; i++) {
      const dToG = say(d, [g])
      say(g, [e])
      say(office, [d])
      say(office, [e])
      say(office, [d], { aboutMessage: dToG })
      say(d, [person, e, g], { toGroup: quietGroup, body: `@${personHandle} Made-up words.` })
      say(e, [person, d, g], { toGroup: quietGroup })
      say(undefined, [d, e], { from: handleOf(d) })
    }
    // CASE 5, EVERY PART: the person's message first, so everything after it is read back. The agent's group line
    // names the person but has no delivery row to the person, as for a person who joined the group after it.
    const pToF = say(person, [f])
    const fToP = say(f, [person])
    everyPart.members.push(pToF, fToP, say(office, [f, person]), say(f, [g], { toGroup: everyPartGroup, body: `@${personHandle} Made-up words.` }))
    everyPart.notMembers.push(say(person, [f, g], { toGroup: everyPartGroup }), say(undefined, [person], { from: handleOf(f) }), say(office, [f]))
    everyPart.members.push(say(office, [person], { aboutMessage: fToP }), say(office, [f], { aboutMessage: pToF }))
    // CASES 6 AND 7, newest of all: Mole Office to each side alone, and each side to the other with only a typed sender.
    for (const to of [d, e, f, person]) oneSide.lines.push({ id: say(office, [to]), to })
    for (const [from, to] of [[d, e], [e, d], [f, person], [person, f]] as const) {
      oneSide.typedOnly.push(say(undefined, [to], { from: from === person ? personHandle : handleOf(from) }))
    }
  })()
  quiet.between = [d, e]
  everyPart.agent = f
  oneSide.office = office
  // THE TWO AGENTS' LINES IN OTHER CONVERSATIONS: every message one of them sent or was handed, less the pair's own.
  quiet.othersLines = (sqlite.prepare(`SELECT count(DISTINCT r.id) AS n FROM records r LEFT JOIN message_delivery m ON m.message_id = r.id
    WHERE r.kind = 'message' AND (json_extract(r.data, '$.sentBy.id') IN (?, ?) OR m.recipient_id IN (?, ?))`).get(d.id, e.id, d.id, e.id) as { n: number }).n
  named.personAndAgent = keyOf(pairOf(a, person))
  named.agentsAlone = keyOf(pairOf(b, c))
  named.group = keyOf({ kind: 'group', id: theGroup })
  named.inspectorsGroup = keyOf({ kind: 'group', id: inspectorsGroup })
  named.byHandle = keyOf(pairOf(aByHandle, person))
  named.toHandle = keyOf(pairOf(office, aByHandle))

  // EVERY CONVERSATION A DELIVERY ROW IS IN, asked the way the queue asks it, and every group.
  const entries = new Map(M.everyMessageOfTheProjectsForTheQueue(M.EVERY_PROJECT).map((one) => [one.id, one]))
  const deliveries = sqlite.prepare('SELECT message_id AS id, recipient_kind AS kind, recipient_id AS recipient FROM message_delivery ORDER BY rowid').all() as { id: string; kind: 'agent' | 'person'; recipient: string }[]
  for (const one of deliveries) {
    const entry = entries.get(one.id)
    if (entry === undefined) continue
    const which = W.conversationOf(entry, { kind: one.kind, id: one.recipient })
    if (which !== null && !conversations.has(keyOf(which))) conversations.set(keyOf(which), which)
  }
  for (const { id } of sqlite.prepare('SELECT id FROM groups ORDER BY rowid').all() as { id: string }[]) {
    if (!conversations.has(`group ${id}`)) conversations.set(`group ${id}`, { kind: 'group', id })
  }
  for (const key of Object.values(named)) expect(conversations.has(key)).toBe(true)
}, 120_000)
afterAll(async () => {
  await built?.app.close()
  t?.close()
})

it('holds the same messages in the same order in the pool, in the read of one conversation, and read back whole', () => {
  // THE RUNS CROSS THE EDGES OF THE FIRST TWO PIECES, which hold the first piece and four times as many.
  expect(M.THE_FIRST_PIECE_READ_BACK_HOLDS * 5).toBeLessThan(LONG)
  const pool = M.theConversationsOfOnePool(M.everyMessageOfTheProjectsForTheQueue(M.EVERY_PROJECT))
  for (const [key, which] of conversations) {
    const whole = theWhole(which)
    expect(ids(inThePool(pool, which)), key).toEqual(ids(whole))
    expect(ids(M.theConversationBackTo(which, () => false)), key).toEqual(ids(whole))
  }
  expect(theWhole(conversations.get(named.personAndAgent)!).length).toBeGreaterThan(3 * LONG)
})

it('stops reading back only at the last message a person wrote', () => {
  let stoppedEarly = 0
  for (const [key, which] of conversations) {
    const whole = theWhole(which)
    const last = theLastPerson(whole)
    const back = M.theConversationBackTo(which, (one) => W.aPersonWroteIt(one.sentBy))
    expect(ids(back), key).toEqual(ids(last < 0 ? whole : whole.slice(last)))
    if (last > 0) stoppedEarly += 1
  }
  expect(stoppedEarly).toBeGreaterThan(0)
  // NOTICES, LINES NOBODY SIGNED AND GROUP LINES NOT NAMING THE PERSON SIT AFTER THE LAST PERSON, far more of them than a piece holds.
  for (const key of [named.personAndAgent, named.group]) {
    const whole = theWhole(conversations.get(key)!)
    const after = whole.slice(theLastPerson(whole) + 1)
    expect(after.filter((one) => !W.thisGuardCountsIt(one.sentBy)).length, key).toBeGreaterThan(M.THE_FIRST_PIECE_READ_BACK_HOLDS)
    expect(theLastPerson(whole), key).toBeGreaterThan(0)
  }
  const alone = theWhole(conversations.get(named.agentsAlone)!)
  expect(theLastPerson(alone)).toBe(-1)
  expect(alone.length).toBeGreaterThanOrEqual(LONG)
})

it('counts what the pool counts for the whole conversation, and nothing in a group an inspector opened', () => {
  const pool = M.theConversationsOfOnePool(M.everyMessageOfTheProjectsForTheQueue(M.EVERY_PROJECT))
  const allowance = W.howFarAConversationMayGo()
  let resetMatters = 0
  for (const [key, which] of conversations) {
    const whole = inThePool(pool, which)
    const expected = key === named.inspectorsGroup ? 0 : theCountOf(whole)
    expect(W.agentTurnsInTheConversation(which, 'default'), key).toBe(expected)
    if (whole.filter((one) => W.thisGuardCountsIt(one.sentBy)).length > expected && expected > 0) resetMatters += 1
  }
  expect(resetMatters).toBeGreaterThan(0)
  // MORE TURNS THAN THE ALLOWANCE: in the group an inspector opened, which counts none, and in the two below.
  expect(LONG).toBeGreaterThan(allowance)
  expect(theCountOf(inThePool(pool, conversations.get(named.inspectorsGroup)!))).toBeGreaterThan(allowance)
  expect(W.agentTurnsInTheConversation(conversations.get(named.personAndAgent)!, 'default')).toBeGreaterThanOrEqual(LONG)
  // THE OFFICE BUILDER'S OWN LINES BETWEEN THESE TWO COUNT AS WELL.
  expect(W.agentTurnsInTheConversation(conversations.get(named.agentsAlone)!, 'default')).toBeGreaterThanOrEqual(LONG)
})

it('reads a quiet pair of two agents to its end, through the many lines of their other conversations', () => {
  const [d, e] = quiet.between as [ParticipantRef, ParticipantRef]
  const whole = theWhole(pairOf(d, e))
  expect(theLastPerson(whole)).toBe(-1)
  expect(ids(whole)).toEqual(expect.arrayContaining(quiet.own))
  // A FEW MESSAGES OF ITS OWN, AND FAR MORE THAN THE READ'S FIRST TWO PIECES HOLD IN THE TWO AGENTS' OTHER CONVERSATIONS.
  expect(whole.length).toBeLessThan(M.THE_FIRST_PIECE_READ_BACK_HOLDS)
  expect(quiet.othersLines - whole.length).toBeGreaterThan(M.THE_FIRST_PIECE_READ_BACK_HOLDS * 5)
  for (const which of [pairOf(d, e), pairOf(e, d)]) {
    expect(ids(M.theConversationBackTo(which, (one) => W.aPersonWroteIt(one.sentBy)))).toEqual(ids(whole))
  }
})

it('finds a message of the pair from every part of the candidates the chat reads, from either side', () => {
  const f = everyPart.agent!
  for (const which of [pairOf(f, person), pairOf(person, f)]) {
    const whole = theWhole(which)
    expect(ids(whole)).toEqual(expect.arrayContaining(everyPart.members))
    for (const id of everyPart.notMembers) expect(ids(whole)).not.toContain(id)
    const last = theLastPerson(whole)
    expect(whole[last]!.id).toBe(everyPart.members[0])
    expect(ids(M.theConversationBackTo(which, (one) => W.aPersonWroteIt(one.sentBy)))).toEqual(ids(whole.slice(last)))
    expect(ids(M.theConversationBackTo(which, () => false))).toEqual(ids(whole))
  }
})

/** The two pairs of cases 6 and 7, from either side. */
function theTwoPairs(): WhichConversation[] {
  const [d, e] = quiet.between as [ParticipantRef, ParticipantRef]
  const f = everyPart.agent!
  return [pairOf(d, e), pairOf(e, d), pairOf(f, person), pairOf(person, f)]
}

it('leaves out a line Mole Office handed to one side only, and finds it in Mole Office\'s conversation with that side', () => {
  for (const which of theTwoPairs()) {
    const whole = ids(theWhole(which))
    const back = ids(M.theConversationBackTo(which, () => false))
    for (const { id } of oneSide.lines) {
      expect(whole, which.id).not.toContain(id)
      expect(back, which.id).not.toContain(id)
    }
  }
  for (const { id, to } of oneSide.lines) {
    const withTheOffice = pairOf(oneSide.office!, to)
    expect(ids(theWhole(withTheOffice))).toContain(id)
    expect(ids(M.theConversationBackTo(withTheOffice, () => false))).toContain(id)
  }
})

it('leaves out a message with a typed sender and no stored one, from either side', () => {
  for (const which of theTwoPairs()) {
    const whole = ids(theWhole(which))
    const back = ids(M.theConversationBackTo(which, () => false))
    for (const id of oneSide.typedOnly) {
      expect(whole, which.id).not.toContain(id)
      expect(back, which.id).not.toContain(id)
    }
  }
})

it('leaves office-only pair candidates out of the count while preserving turns and the fallback', () => {
  const [d, e] = quiet.between as [ParticipantRef, ParticipantRef]
  for (const which of [pairOf(d, e), pairOf(e, d)]) {
    const full = M.theConversationBackTo(which, (one) => W.aPersonWroteIt(one.sentBy))
    const counted = M.theConversationBackTo(which, (one) => W.aPersonWroteIt(one.sentBy), 'the count')
    // These are an office line handed to both sides and a notice handed to one about their pair.
    expect(ids(full)).toEqual(expect.arrayContaining(quiet.own))
    expect(ids(counted)).toEqual(expect.arrayContaining(quiet.own.slice(0, 2)))
    expect(ids(counted)).not.toContain(quiet.own[2])
    expect(ids(counted)).not.toContain(quiet.own[3])
    expect(ids(counted)).toContain(aboutByAgents.direct)
    expect(ids(counted)).not.toContain(aboutByAgents.outsider)

    // A caller that counts office messages needs the complete conversation, including both lines.
    const officeCounts = () => false
    let expected = 0
    for (const one of full) {
      if (W.aPersonWroteIt(one.sentBy)) expected = 0
      else if (W.thisGuardCountsIt(one.sentBy, officeCounts)) expected += 1
    }
    expect(expected).toBeGreaterThan(theCountOf(full))
    expect(W.agentTurnsInTheConversation(which, 'default', officeCounts)).toBe(expected)
  }
  for (const [key, which] of conversations) {
    // The whole read includes notices, group replies, aliases, and messages from before the last person.
    expect(theCountOf(M.theConversationBackTo(which, (one) => W.aPersonWroteIt(one.sentBy), 'the count')), key).toBe(theCountOf(theWhole(which)))
  }
})
