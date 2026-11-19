// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A THROWAWAY OFFICE OF THE LIVE OFFICE'S SHAPE, FOR THE CHAT'S TWO READS. Made-up rows only.
 *
 * Round 33 of wave 13n measured GET /api/messages/conversation and GET /api/messages/contacts on
 * this database, and tests/the-chat-reads-only-what-it-needs.test.ts counts what those
 * two reads take out of it. Every row here is invented: no row is copied from any office.
 *
 * WHY THE COUNTS ARE WHAT THEY ARE. The live office answered GET /api/participants on 3 October
 * 2026 with 913 agents, 693 of them retired, and one person. A comment on `theMessagesOfOneReader`
 * in src/server/lib/messages.ts records 10,507 messages on a copy of 26 September 2026, 2,604 of
 * them the person's. The round's brief asks for a conversation of a few thousand messages, an
 * office of several hundred contacts, and tens of thousands of records of other kinds. `LIVE_SHAPE`
 * below is those numbers. A test uses a smaller `Shape` of the same mix, so it runs in seconds.
 *
 * The rows are written straight into the tables in one transaction, because writing tens of
 * thousands of them through the doors would take many minutes. The rows have the shapes the doors
 * write: a message's `data` carries `body`, `to`, `sentBy`, `writtenIn` and `writtenFrom`, and one
 * delivery row for each recipient. Some of the person's messages carry a `routed` list, as a
 * message to an agent nothing answers for does. Some agents' messages name the run they came from.
 * Every number is drawn from a fixed seed, so two builds of one shape give the same rows.
 */
import type Database from 'better-sqlite3'

/** How many rows of each sort to make. */
export interface Shape {
  /** Registered agents, besides the office's own row. */
  agents: number
  /** How many of those agents are retired. */
  retired: number
  /** Messages between the person and the one agent whose conversation is measured. */
  theConversation: number
  /** Other agents the person has written to or heard from. */
  otherContacts: number
  /** Messages between the person and those other agents, spread across them. */
  otherPersonMessages: number
  /** Messages between two agents, the person in neither side. */
  betweenAgents: number
  /** Groups, and how many hold the person. */
  groups: number
  groupsWithThePerson: number
  /** Members in each group, the person included where the group holds the person. */
  membersPerGroup: number
  /** Messages sent to groups, spread across them. */
  groupMessages: number
  /** Lines the office wrote: to agents, to the person, and notices about a message of the measured conversation. */
  officeLines: number
  /** Session records, one per run. */
  sessions: number
  /** Records of other kinds, in turn of `otherKinds`. */
  otherRecords: number
  /** The kinds those records are; tasks, problems and notes when not said. */
  otherKinds?: readonly string[]
  /** The project's own records, which the brief reads; none when not said. */
  project?: ProjectShape
}

/** How many of each record a project holds, and how many of its problems and tasks are still open. */
export interface ProjectShape {
  problems: number
  tasks: number
  decisions: number
  proposals: number
  modules: number
  reports: number
  /** The share of problems and tasks whose state is still open. */
  openShare: number
}

/** The shape of the live office, as the header says. */
export const LIVE_SHAPE: Shape = {
  agents: 912,
  retired: 693,
  theConversation: 3_000,
  otherContacts: 150,
  otherPersonMessages: 1_500,
  betweenAgents: 6_000,
  groups: 30,
  groupsWithThePerson: 15,
  membersPerGroup: 8,
  groupMessages: 1_500,
  officeLines: 500,
  sessions: 6_000,
  otherRecords: 20_000,
}

/**
 * THE LIVE OFFICE'S PROJECT AS WELL AS ITS CHAT, for the brief (round 34 of wave 13n).
 *
 * The live office answered GET /api/records on 3 October 2026 at about 20:55 with, in its main
 * project: 14,837 records, of which 6,512 sessions, 1,620 reports, 1,246 problems, 550 decisions,
 * 394 tasks, 187 proposals and 46 modules. The rest, about 4,300, are records of other kinds and are
 * made here as notes. How many problems and tasks are still open, and how many links there are, it
 * did not say: a quarter open and one or two links a record are this file's guess.
 */
export const THE_LIVE_OFFICE: Shape = {
  ...LIVE_SHAPE,
  sessions: 6_500,
  otherRecords: 4_300,
  otherKinds: ['note'],
  project: { problems: 1_246, tasks: 394, decisions: 550, proposals: 187, modules: 46, reports: 1_620, openShare: 0.25 },
}

/** What the build made, so a caller can address the measured conversation and say what it holds. */
export interface TheChatOffice {
  /** The agent whose conversation with the person is measured. */
  theAgent: string
  /** Every count, by table and by sort. */
  counts: Record<string, number>
}

/** A fixed sequence of numbers, so the same shape always gives the same rows. */
function numbersFrom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 4_294_967_296
  }
}

/** A local wall-clock stamp, `minutes` after the first day of the made-up history. */
function stampAt(minutes: number): string {
  const at = new Date(2026, 7, 1, 8, 0, 0)
  at.setMinutes(at.getMinutes() + minutes)
  const two = (n: number): string => String(n).padStart(2, '0')
  return `${String(at.getFullYear())}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())}`
}

/**
 * Builds the office in the database `sqlite` holds, which must already be migrated and hold the
 * person `person`. Writes in one transaction.
 */
export function buildTheChatOffice(sqlite: Database.Database, person: string, shape: Shape): TheChatOffice {
  const random = numbersFrom(20_261_003)
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!
  const personHandle = (sqlite.prepare('select handle from people where id = ?').get(person) as { handle: string } | undefined)?.handle ?? person
  const home = sqlite.prepare(`select id, avatar_asset_id, home_world, home_installation from agents where handle = 'mole-office' and retired = 0`).get() as
    | { id: string; avatar_asset_id: string; home_world: string | null; home_installation: string | null }
    | undefined
  const officeId = home?.id ?? 'mole-office'
  const counts: Record<string, number> = {}
  const count = (what: string): void => {
    counts[what] = (counts[what] ?? 0) + 1
  }

  const addAgent = sqlite.prepare(
    `insert into agents (id, name, handle, avatar_asset_id, retired, retired_at, retired_because, created_at, started_by_kind, started_by_id, role, home_world, home_installation, citizen_since)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'worker', ?, ?, ?)`,
  )
  const addRecord = sqlite.prepare(
    `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     values (?, ?, 'owner', ?, ?, ?, ?, null, ?, null, 'fixture')`,
  )
  const addDelivery = sqlite.prepare(
    `insert into message_delivery (id, message_id, recipient_kind, recipient_id, mark, at, because, run, inferred_by)
     values (?, ?, ?, ?, ?, ?, null, null, null)`,
  )
  const addGroup = sqlite.prepare(
    `insert into groups (id, workspace_id, name, opened_by_kind, opened_by_id, opened_because, opened_at, about)
     values (?, 'default', ?, 'person', ?, 'made up for a measurement', ?, null)`,
  )
  const addMember = sqlite.prepare(
    `insert into group_members (id, group_id, member_kind, member_id, joined_at, joined_because, left_at)
     values (?, ?, ?, ?, ?, 'made up for a measurement', null)`,
  )

  let next = 0
  const idOf = (prefix: string): string => `${prefix}${(next++).toString(36).padStart(10, '0')}`
  // A BODY OF 60 TO 1,500 CHARACTERS, as the office's messages run from one line to a long report.
  const SENTENCE = 'These words were made up for a measurement and say nothing. '
  const wordsOf = (what: string): string => `${what}: ${SENTENCE.repeat(1 + Math.floor(random() * 24))}`
  let minute = 0
  // NOUGHT TO TWO MINUTES APART, so some messages share a stamp, as many do in the office.
  const later = (): string => stampAt((minute += Math.floor(random() * 3)))

  const build = sqlite.transaction(() => {
    // THE AGENTS. The first is the measured one, started by the person. Then the person's other
    // contacts, then agents nobody has spoken to, a quarter of them started by another agent.
    const agentIds: string[] = []
    for (let i = 0; i < shape.agents; i++) {
      const id = idOf('ag')
      const handle = i === 0 ? 'the-measured-agent' : `made-up-agent-${String(i)}`
      const retired = i > shape.agents - 1 - shape.retired
      const startedByAgent = i > shape.otherContacts && random() < 0.25 && agentIds.length > 0
      addAgent.run(
        id,
        handle,
        handle,
        home?.avatar_asset_id ?? null,
        retired ? 1 : 0,
        retired ? stampAt(i) : null,
        retired ? 'made up for a measurement' : null,
        stampAt(i),
        startedByAgent ? 'agent' : 'person',
        startedByAgent ? pick(agentIds.slice(0, Math.min(agentIds.length, 40))) : person,
        home?.home_world ?? null,
        home?.home_installation ?? null,
        stampAt(i),
      )
      agentIds.push(id)
      count('agents')
      if (retired) count('agents retired')
    }
    const theAgent = agentIds[0]!
    const contacts = agentIds.slice(1, 1 + shape.otherContacts)
    const workers = agentIds.slice(1)

    // THE RUNS, so a message can name the run it came out of.
    const sessionIds: string[] = []
    for (let i = 0; i < shape.sessions; i++) {
      const id = idOf('se')
      const at = stampAt(i * 10)
      addRecord.run(
        id,
        'default',
        at,
        at,
        'session',
        `made-up run ${String(i)}`,
        JSON.stringify({
          runtime: random() < 0.8 ? 'claude-code' : 'codex',
          state: 'finished',
          agent: pick(workers),
          doing: 'made up for a measurement',
          // ONE TO TEN KILOBYTES, as the office's session records run from a bare start to a sealed run. In `extra`,
          // because the session kind has no field `notes`, and a PATCH of a run holding one was refused.
          extra: { notes: SENTENCE.repeat(15 + Math.floor(random() * 150)) },
          // TWO RUNS IN FIVE ARE RUNS THE OFFICE STARTED TO HAND AN AGENT A MESSAGE, and say so.
          ...(i % 5 < 2 ? { deliveringMessage: `made-up-message-${String(i)}`, servingAgentId: pick(workers), providerSession: `made-up-${String(i)}` } : {}),
        }),
      )
      sessionIds.push(id)
      count('records: session')
    }

    // EVERYTHING ELSE THE OFFICE HOLDS, which no chat read needs.
    const kinds = shape.otherKinds ?? (['task', 'problem', 'note'] as const)
    for (let i = 0; i < shape.otherRecords; i++) {
      const at = stampAt(i * 3)
      const kind = kinds[i % kinds.length]!
      addRecord.run(idOf('re'), 'default', at, at, kind, `made-up ${kind} ${String(i)}`, JSON.stringify({ body: SENTENCE.repeat(8), state: 'open' }))
      count(`records: ${kind}`)
    }


    // THE PROJECT'S OWN RECORDS, for the brief: problems, tasks, decisions, proposals, modules and
    // reports, with the links a project's records carry. Only when the shape asks for them.
    const project = shape.project
    if (project !== undefined) {
      const addLink = sqlite.prepare(
        `insert into links (id, workspace_id, owner_id, from_id, to_id, type, inferred, created_by, created_by_type, created_at, updated_at)
         values (?, 'default', 'owner', ?, ?, ?, 0, 'made-up', 'agent', ?, ?)`,
      )
      const link = (from: string, to: string, type: string, at: string): void => {
        addLink.run(idOf('li'), from, to, type, at, at)
        count('links')
      }
      const add = (kind: string, title: string, data: Record<string, unknown>, at: string): string => {
        const id = idOf(kind.slice(0, 2))
        addRecord.run(id, 'default', at, at, kind, title, JSON.stringify(data))
        count(`records: ${kind}`)
        return id
      }
      const moduleIds: string[] = []
      for (let i = 0; i < project.modules; i++) {
        moduleIds.push(add('module', `Made-up module ${String(i)}`, { state: 'active', context: SENTENCE.repeat(6), summaryBlocks: [{ id: 'r-1', type: 'text', heading: 'What it does', text: SENTENCE.repeat(12) }] }, stampAt(i)))
      }
      const workIds: string[] = []
      for (let i = 0; i < project.problems; i++) {
        const at = stampAt(i * 7)
        const id = add(
          'problem',
          `Made-up problem ${String(i)}`,
          {
            symptom: SENTENCE.repeat(6),
            cause: SENTENCE.repeat(4),
            why_it_hurts: SENTENCE.repeat(3),
            how_to_tell_it_is_back: SENTENCE.repeat(2),
            state: random() < project.openShare ? 'open' : 'closed',
            whose_move: random() < 0.5 ? 'agent' : 'person',
            found_by: 'made up for a measurement',
          },
          at,
        )
        workIds.push(id)
        if (random() < 0.6) link(id, pick(moduleIds), 'about', at)
      }
      for (let i = 0; i < project.tasks; i++) {
        const at = stampAt(i * 11)
        const id = add('task', `Made-up task ${String(i)}`, { state: random() < project.openShare ? 'todo' : 'done', source: SENTENCE.repeat(2) }, at)
        workIds.push(id)
        if (random() < 0.6) link(id, pick(moduleIds), 'about', at)
      }
      const proposalIds: string[] = []
      for (let i = 0; i < project.proposals; i++) {
        proposalIds.push(
          add(
            'proposal',
            `Made-up proposal ${String(i)}`,
            { question: SENTENCE.repeat(2), options: [SENTENCE.repeat(3), SENTENCE.repeat(3)], recommendation: SENTENCE, because: SENTENCE.repeat(5), who_settles_it: 'the owner' },
            stampAt(i * 13),
          ),
        )
      }
      for (let i = 0; i < project.decisions; i++) {
        const at = stampAt(i * 9)
        const id = add(
          'decision',
          `Made-up decision ${String(i)}`,
          { option_taken: SENTENCE.repeat(8), because: SENTENCE.repeat(3), decided_by: 'the owner', decided_on: at.slice(0, 10), authority: 'the owner said so', replaces: [] },
          at,
        )
        // MOST PROPOSALS ARE SETTLED by a decision that came out of them.
        if (i < proposalIds.length * 0.8) link(id, proposalIds[i]!, 'derived_from', at)
      }
      for (let i = 0; i < project.reports; i++) {
        const at = stampAt(i * 5)
        const id = add(
          'report',
          `Made-up report ${String(i)}`,
          { for: 'made up', date: at.slice(0, 10), blocks: Array.from({ length: 6 }, (_, b) => ({ id: `b-${String(b)}`, type: 'text', heading: 'A part', text: SENTENCE.repeat(1 + Math.floor(random() * 40)) })) },
          at,
        )
        link(id, pick(workIds), 'about', at)
      }
    }

    const machine = { how: 'this machine', machine: 'made-up-machine' }
    const routedLine = (to: string) => [
      {
        for: { kind: 'agent', id: to },
        because: 'Nothing is answering as this agent right now.',
        to: null,
        passedOver: [],
        line: 'This agent could not be reached when this was sent.',
        said: { addressee: to, was: 'nothing answering', passedOver: [], ending: { how: 'the owner is the sender', ending: { how: 'no secretary', owner: 'made up' } } },
      },
    ]
    /** One message from `from` to the one participant `to`, with its delivery row. */
    const oneToOne = (from: { kind: string; id: string }, to: { kind: string; id: string }, what: string, mark: string, extra: Record<string, unknown> = {}): string => {
      const id = idOf('me')
      const at = later()
      const data: Record<string, unknown> = { body: wordsOf(what), to: [to], writtenIn: { project: 'default' }, writtenFrom: machine, sentBy: from, ...extra }
      addRecord.run(id, 'message-centre', at, at, 'message', what, JSON.stringify(data))
      addDelivery.run(idOf('de'), id, to.kind, to.id, mark, at)
      count('records: message')
      count('message_delivery')
      return id
    }
    const thePerson = { kind: 'person', id: person }
    const anAgent = (id: string) => ({ kind: 'agent', id })
    const fromARun = (): Record<string, unknown> => (random() < 0.5 ? { fromRun: pick(sessionIds) } : {})

    // THE MEASURED CONVERSATION, both ways, every line seen by whoever it reached.
    const measured: string[] = []
    for (let i = 0; i < shape.theConversation; i++) {
      if (i % 2 === 0) measured.push(oneToOne(anAgent(theAgent), thePerson, 'from the measured agent', 'seen', fromARun()))
      else measured.push(oneToOne(thePerson, anAgent(theAgent), 'to the measured agent', 'seen', random() < 0.2 ? { routed: routedLine(theAgent) } : {}))
      count('messages in the measured conversation')
    }
    // THE PERSON'S OTHER CONVERSATIONS. The last few lines from each agent are still unread.
    for (let i = 0; i < shape.otherPersonMessages; i++) {
      const other = contacts[i % contacts.length]!
      const unread = i >= shape.otherPersonMessages - contacts.length
      if (i % 3 === 0) oneToOne(thePerson, anAgent(other), 'to another contact', 'seen')
      else oneToOne(anAgent(other), thePerson, 'from another contact', unread ? 'delivered' : 'seen', fromARun())
    }
    // CONVERSATIONS BETWEEN TWO AGENTS, the person in neither.
    for (let i = 0; i < shape.betweenAgents; i++) {
      const a = pick(workers)
      let b = pick(workers)
      if (b === a) b = theAgent
      oneToOne(anAgent(a), anAgent(b), 'between two agents', pick(['queued', 'delivered', 'seen']), fromARun())
    }
    // GROUPS, half of them holding the person, each with its members and its messages.
    const groupMembers: { group: string; members: { kind: string; id: string }[] }[] = []
    for (let g = 0; g < shape.groups; g++) {
      const group = idOf('gr')
      const at = stampAt(g)
      addGroup.run(group, `made-up group ${String(g)}`, person, at)
      count('groups')
      const members: { kind: string; id: string }[] = g < shape.groupsWithThePerson ? [thePerson] : []
      if (g % 3 === 0) members.push(anAgent(theAgent))
      while (members.length < shape.membersPerGroup) {
        const one = anAgent(pick(workers))
        if (!members.some((m) => m.id === one.id)) members.push(one)
      }
      for (const one of members) {
        addMember.run(idOf('gm'), group, one.kind, one.id, at)
        count('group_members')
      }
      groupMembers.push({ group, members })
    }
    for (let i = 0; i < shape.groupMessages; i++) {
      const { group, members } = groupMembers[i % groupMembers.length]!
      // ONE LINE IN FOUR, IN A GROUP HOLDING BOTH, IS THE MEASURED AGENT NAMING THE PERSON, which puts
      // the line in their conversation as well.
      const namesThePerson =
        i % 4 === 0 && members.some((m) => m.kind === 'person') && members.some((m) => m.kind === 'agent' && m.id === theAgent)
      const from = namesThePerson ? anAgent(theAgent) : pick(members)
      const body = namesThePerson ? `@${personHandle} ${wordsOf('in a group')}` : wordsOf('in a group')
      const id = idOf('me')
      const at = later()
      addRecord.run(id, 'message-centre', at, at, 'message', 'in a group', JSON.stringify({ body, toGroup: group, writtenIn: { project: 'default' }, writtenFrom: machine, sentBy: from }))
      count('records: message')
      count('messages to a group')
      if (namesThePerson) count('group lines of the measured agent naming the person')
      for (const one of members) {
        if (one.id === from.id && one.kind === from.kind) continue
        addDelivery.run(idOf('de'), id, one.kind, one.id, i >= shape.groupMessages - 20 ? 'delivered' : 'seen', at)
        count('message_delivery')
      }
    }
    // LINES THE OFFICE WROTE: to agents, to the person, and notices about a measured message.
    const theOffice = anAgent(officeId)
    for (let i = 0; i < shape.officeLines; i++) {
      if (i % 10 === 0) oneToOne(theOffice, thePerson, 'a notice about a message', 'seen', { aboutMessage: pick(measured), saidInFull: 'made up for a measurement' })
      else if (i % 10 === 1) oneToOne(theOffice, thePerson, 'the office to the person', 'seen')
      else oneToOne(theOffice, anAgent(pick(workers)), 'the office to an agent', 'queued', { saidInFull: 'made up for a measurement' })
      count('lines the office wrote')
    }
    return theAgent
  })
  const theAgent = build()
  return { theAgent, counts }
}
