// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DOOR THAT WALKS ONE CHAIN OF STARTERS READS ONLY THE AGENTS ON IT, AND ANSWERS AS IT DID WHEN IT READ EVERY AGENT.
 * Wave 13u round 43.
 *
 * Round 42 made the route of one message read only the rows a stored starter can name (`theStarterEachStringNames` in
 * src/server/lib/participants.ts). Seven more callers walked one chain with every agent: they asked `listParticipants`
 * for every person row, every agent row and every agent's runtime, 1,963 rows on a made-up office of 972 agents, to
 * follow two or three starters. A door or a write reaches each of them:
 *
 *   · where a question is (`whereOneQuestionIs`, src/server/lib/confirming.ts), which the reply of every record write
 *     and every record read asks, even of a record that asks nothing; and the two guards on closing a question and on
 *     passing it on (src/server/lib/records.ts);
 *   · the two rules on who may file a session for an agent and who may name a session as a run's parent
 *     (src/server/lib/records.ts), which every run start meets;
 *   · the registration door, POST /api/agents/started (src/server/api/participants.ts);
 *   · the doors that answer about one participant, which draw its chain (src/server/api/participants.ts);
 *   · who is responsible for a task (`responsibleFor`, src/server/lib/delegation.ts), once for each task the
 *     delegation column draws;
 *   · who is told about a credential's mismatch (src/server/lib/credential-mismatch.ts), and who may stop what an ended
 *     run left open (src/server/lib/resources.ts), which called the routing walk with no reader.
 *
 * Each now reads the rows each string names. The roster of every participant and the queue keep the list they read,
 * and the reminders of the main world, a timer step, still read every agent.
 *
 * Every id, handle and sentence written here is made up for this file's throwaway office.
 *
 * WHAT IS PROVED HERE. In each case the answer is compared with the answer the code before this round gave, written
 * out below, and where a reader of every agent still answers the same question, with that answer as well.
 *
 *   1. WHERE A QUESTION IS. Seventeen questions: eleven askers of one chain shape each, three stamps that name two
 *      agents, one agent by its handle and no agent, and three paths a question took. The record door shows the same
 *      reading. A record that asks nothing runs no statement at all, through the reading and through the record door.
 *   2. WHO MAY FILE A SESSION. Five sessions filed by agents, each naming an agent or a parent session, two refused.
 *   3. THE REGISTRATION DOOR. Four starters register an agent: one whose chain reaches the person and three whose
 *      chains do not.
 *   4. ONE PARTICIPANT. Fifteen agents read one at a time, each compared with the roster, which reads every agent. The
 *      profile page draws the same participant.
 *   5. WHO IS RESPONSIBLE FOR A TASK. Ten creators, one of each case the rule has.
 *   6. THE ROUTING WALK'S TWO OTHER CALLERS. Three credentials whose agents' chains differ, and an ended run's container
 *      stopped by an agent on its chain and refused to one off it.
 *   7. THE GUARD. The roster still reads every agent once, and the recorder sees the ids of the agents no chain names.
 *      So the other cases would see them if a door read every agent.
 *
 * In cases 1 to 6, no statement gives back the id of any of the 30 agents no chain names, and the statement that reads
 * every agent runs no time at all, except in the two reads the next paragraph names.
 *
 * LEFT AS IT IS, AND SAID HERE SO NOBODY READS IT AS DONE:
 *   · who holds the secretary card (`whoHoldsTheSecretaryCard` in src/server/lib/inspection.ts) still reads every agent.
 *     The rule for a task falls to it when no live agent is on the chain, so case 5 counts that read once there;
 *   · the profile page lists the agents a participant can write to (`everyAgentById` in src/server/lib/messages.ts), and
 *     that list still reads every agent. So case 4 counts one read of every agent on the profile page, not two.
 *
 * A REGISTRATION THAT IS WRITTEN brings the broadcast schedules in step (`reconcileTheBroadcastSchedules` in
 * src/server/lib/broadcast.ts). It walks no chain. Until wave 13y round 107 it read every agent's id, so case 3 left out
 * the ids that statement gave back. It now reads only the agents a reconciliation can change, so case 3 leaves no
 * statement out, and counts that the read of every agent's id runs no time at all, for every starter.
 *
 * WHAT TURNS EACH RED is written in the commit that changes the code.
 */
import { readFileSync } from 'node:fs'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON_MAY_ALWAYS_CONFIRM } from '../src/shared/delegation.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import type { VisitorCredential } from '../src/shared/visitors.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const PROJECT = 'default'
const at = localStamp(new Date())
/** When a question was passed on: made up and fixed, so the answers written out below hold it. */
const PASSED_AT = '2026-01-02 03:04:05'

/** The statement `listParticipants` reads every agent row with. */
const EVERY_AGENT = 'SELECT * FROM agents ORDER BY handle, rowid'
/** The statement the broadcast schedules were brought in step with until wave 13y round 107: every agent's id. */
const EVERY_AGENT_ID = 'SELECT id FROM agents ORDER BY id'

let t: TestDb
let app: FastifyInstance
let confirming: typeof import('../src/server/lib/confirming.ts')
let delegation: typeof import('../src/server/lib/delegation.ts')
let mismatch: typeof import('../src/server/lib/credential-mismatch.ts')
let resources: typeof import('../src/server/lib/resources.ts')
let roles: typeof import('../src/server/lib/roles.ts')
/** True while a counted call runs. Meanwhile every value a statement gives back is kept, and every statement run. */
let recording = false
/** Each value given back, with every statement that gave it back. */
const gaveBack = new Map<unknown, Set<string>>()
const ran: { text: string; args: unknown[] }[] = []

const TOP = 'made-up-top'
const TOP_HANDLE = 'made-up-top-handle'
const WAITER = 'made-up-waiter'
const SECRETARY = 'made-up-secretary'
const SHARED = 'made-up-shared-string'
const RETIRED = 'made-up-retired'
const BY_ID = 'made-up-by-id'
const TWO_UP = 'made-up-two-up'
const NOBODY_REGISTERED = 'made-up-nobody-registered'
const FILLERS = Array.from({ length: 30 }, (_, i) => `made-up-filler-${String(i + 1).padStart(2, '0')}`)

/** The agents of one chain shape each, with what makes the shape. Case 4 reads each; cases 1 and 5 use them too. */
const SHAPES: readonly { id: string; is: string }[] = [
  { id: BY_ID, is: 'a starter stored by its id' },
  { id: 'made-up-by-handle', is: 'a starter stored by its handle' },
  { id: 'made-up-by-a-shared-handle', is: 'a handle two agents have, one of them retired' },
  { id: 'made-up-by-an-id-and-a-handle', is: "a string that is one agent's id and another agent's handle" },
  { id: 'made-up-through-a-retired', is: 'a chain through a retired agent' },
  { id: 'made-up-in-a-loop', is: 'a loop' },
  { id: 'made-up-unstarted', is: 'no starter' },
  { id: 'made-up-by-nothing', is: 'a starter nothing has as its id or handle' },
  { id: 'made-up-under-a-secretary', is: 'a chain that reaches a secretary' },
  { id: 'made-up-by-an-unknown-kind', is: 'a starter of a kind this build does not know' },
  { id: TWO_UP, is: 'a chain two agents long' },
  { id: 'made-up-retired-addressee', is: 'a retired agent, retired by an agent stored by its id' },
  { id: 'made-up-retired-in-a-loop', is: 'a retired agent in a loop, retired by a handle two agents have' },
  { id: 'made-up-retired-unstarted', is: 'a retired agent nobody started, retired by a handle' },
  { id: TOP, is: 'an agent the person started, with a handle that is not its id' },
]

/**
 * THE ANSWERS THE CODE BEFORE THIS ROUND GAVE, case by case. Printed by this file at commit e9b3a9352, where each of these
 * callers read every agent, with the person's id and the owner's name written as words.
 */
const BEFORE: Record<string, Record<string, unknown>> = {
  questions: {
    'asked by a starter stored by its id': {
      markedBy: { kind: 'agent', id: 'made-up-by-id' },
      with: { kind: 'agent', id: 'made-up-top' },
      confirmedBy: [],
      reachedThePerson: false,
      case: 'waiting-with-agent',
      facts: { asker: 'made-up-by-id', askerKind: 'agent', holder: 'made-up-top-handle', holderKind: 'agent', viaStarters: false },
      says: 'agent "made-up-by-id" said this is the person\'s move, and agent "made-up-top-handle" started it. It is with "made-up-top-handle" until they pass it on, close it, or take the question off the record. It is not on the person\'s list.',
    },
    'asked by a starter stored by its handle': {
      markedBy: { kind: 'agent', id: 'made-up-by-handle' },
      with: { kind: 'agent', id: 'made-up-top' },
      confirmedBy: [],
      reachedThePerson: false,
      case: 'waiting-with-agent',
      facts: { asker: 'made-up-by-handle', askerKind: 'agent', holder: 'made-up-top-handle', holderKind: 'agent', viaStarters: false },
      says: 'agent "made-up-by-handle" said this is the person\'s move, and agent "made-up-top-handle" started it. It is with "made-up-top-handle" until they pass it on, close it, or take the question off the record. It is not on the person\'s list.',
    },
    'asked by a handle two agents have, one of them retired': {
      markedBy: { kind: 'agent', id: 'made-up-by-a-shared-handle' },
      with: null,
      confirmedBy: [],
      reachedThePerson: true,
      case: 'starter-chain-cannot-be-followed',
      facts: { asker: 'made-up-by-a-shared-handle', askerKind: 'agent', chainBreak: 'unregistered', chainAt: 'made-up-twice', chainAtKind: 'agent' },
      says: 'Nothing is registered as the agent "made-up-twice", so the chain of starters stops there and reaches nobody. So the question is with the person, as it would have been before starters were recorded.',
    },
    "asked by a string that is one agent's id and another agent's handle": {
      markedBy: { kind: 'agent', id: 'made-up-by-an-id-and-a-handle' },
      with: { kind: 'agent', id: 'made-up-shared-string' },
      confirmedBy: [],
      reachedThePerson: false,
      case: 'waiting-with-agent',
      facts: { asker: 'made-up-by-an-id-and-a-handle', askerKind: 'agent', holder: 'made-up-x', holderKind: 'agent', viaStarters: false },
      says: 'agent "made-up-by-an-id-and-a-handle" said this is the person\'s move, and agent "made-up-x" started it. It is with "made-up-x" until they pass it on, close it, or take the question off the record. It is not on the person\'s list.',
    },
    'asked by a chain through a retired agent': {
      markedBy: { kind: 'agent', id: 'made-up-through-a-retired' },
      with: { kind: 'agent', id: 'made-up-retired' },
      confirmedBy: [],
      reachedThePerson: false,
      case: 'waiting-with-agent',
      facts: { asker: 'made-up-through-a-retired', askerKind: 'agent', holder: 'made-up-retired', holderKind: 'agent', viaStarters: true },
      says: 'agent "made-up-through-a-retired" said this is the person\'s move, and agent "made-up-retired" started it or started who started it. It is with "made-up-retired" until they pass it on, close it, or take the question off the record. It is not on the person\'s list.',
    },
    'asked by a loop': {
      markedBy: { kind: 'agent', id: 'made-up-in-a-loop' },
      with: null,
      confirmedBy: [],
      reachedThePerson: true,
      case: 'starter-chain-cannot-be-followed',
      facts: { asker: 'made-up-in-a-loop', askerKind: 'agent', chainBreak: 'loops', chainAt: 'made-up-loop-1', chainAtKind: 'agent' },
      says: 'The starters go round: following them up comes back to the agent "made-up-loop-1". A chain that goes round reaches nobody, so nobody answers for what is at the bottom of it. So the question is with the person, as it would have been before starters were recorded.',
    },
    'asked by no starter': {
      markedBy: { kind: 'agent', id: 'made-up-unstarted' },
      with: null,
      confirmedBy: [],
      reachedThePerson: true,
      case: 'asker-has-no-starter',
      facts: { asker: 'made-up-unstarted', askerKind: 'agent' },
      says: 'Nobody recorded who started the agent "made-up-unstarted", so there is nobody to pass this through. The question is with the person, as it would have been before starters were recorded.',
    },
    'asked by a starter nothing has as its id or handle': {
      markedBy: { kind: 'agent', id: 'made-up-by-nothing' },
      with: null,
      confirmedBy: [],
      reachedThePerson: true,
      case: 'starter-chain-cannot-be-followed',
      facts: { asker: 'made-up-by-nothing', askerKind: 'agent', chainBreak: 'unregistered', chainAt: 'made-up-nothing-has-this-name', chainAtKind: 'agent' },
      says: 'Nothing is registered as the agent "made-up-nothing-has-this-name", so the chain of starters stops there and reaches nobody. So the question is with the person, as it would have been before starters were recorded.',
    },
    'asked by a chain that reaches a secretary': {
      markedBy: { kind: 'agent', id: 'made-up-under-a-secretary' },
      with: { kind: 'agent', id: 'made-up-secretary' },
      confirmedBy: [],
      reachedThePerson: false,
      case: 'waiting-with-agent',
      facts: { asker: 'made-up-under-a-secretary', askerKind: 'agent', holder: 'made-up-secretary', holderKind: 'agent', viaStarters: true },
      says: 'agent "made-up-under-a-secretary" said this is the person\'s move, and agent "made-up-secretary" started it or started who started it. It is with "made-up-secretary" until they pass it on, close it, or take the question off the record. It is not on the person\'s list.',
    },
    'asked by a starter of a kind this build does not know': {
      markedBy: { kind: 'agent', id: 'made-up-by-an-unknown-kind' },
      with: null,
      confirmedBy: [],
      reachedThePerson: true,
      case: 'asker-has-no-starter',
      facts: { asker: 'made-up-by-an-unknown-kind', askerKind: 'agent' },
      says: 'Nobody recorded who started the agent "made-up-by-an-unknown-kind", so there is nobody to pass this through. The question is with the person, as it would have been before starters were recorded.',
    },
    'asked by a chain two agents long': {
      markedBy: { kind: 'agent', id: 'made-up-two-up' },
      with: { kind: 'agent', id: 'made-up-by-id' },
      confirmedBy: [],
      reachedThePerson: false,
      case: 'waiting-with-agent',
      facts: { asker: 'made-up-two-up', askerKind: 'agent', holder: 'made-up-by-id', holderKind: 'agent', viaStarters: true },
      says: 'agent "made-up-two-up" said this is the person\'s move, and agent "made-up-by-id" started it or started who started it. It is with "made-up-by-id" until they pass it on, close it, or take the question off the record. It is not on the person\'s list.',
    },
    'asked under a handle two agents have': {
      markedBy: null,
      with: null,
      confirmedBy: [],
      reachedThePerson: true,
      case: 'ambiguous-asker',
      facts: { asker: 'made-up-twice', candidates: ['made-up-twice (made-up-twice)', 'made-up-twice (made-up-twice)'] },
      says: '"made-up-twice" is the name of two agents — made-up-twice (made-up-twice) and made-up-twice (made-up-twice) — so nothing can say which of them asked this, or who started them. The question is with the person.',
    },
    'asked under the handle of an agent the person started': {
      markedBy: { kind: 'agent', id: 'made-up-top' },
      with: null,
      confirmedBy: [],
      reachedThePerson: true,
      case: 'nobody-above-asker',
      facts: {},
      says: 'Nobody is above the agent that asked, so the question is with the person.',
    },
    'asked under a string no agent has': {
      markedBy: null,
      with: null,
      confirmedBy: [],
      reachedThePerson: true,
      case: 'asker-not-registered',
      facts: { asker: 'made-up-nobody-registered', askerKind: 'agent' },
      says: 'Nothing in this installation is registered as the agent "made-up-nobody-registered", so nothing records who started it. The question is with the person.',
    },
    'asked by a chain two agents long, passed on by the first': {
      markedBy: { kind: 'agent', id: 'made-up-two-up' },
      with: { kind: 'agent', id: 'made-up-top' },
      confirmedBy: [{ who: { kind: 'agent', id: 'made-up-by-id' }, at: '2026-01-02 03:04:05' }],
      reachedThePerson: false,
      case: 'waiting-with-agent',
      facts: { asker: 'made-up-two-up', askerKind: 'agent', holder: 'made-up-top-handle', holderKind: 'agent', viaStarters: true },
      says: 'agent "made-up-two-up" said this is the person\'s move, and agent "made-up-top-handle" started it or started who started it. It is with "made-up-top-handle" until they pass it on, close it, or take the question off the record. It is not on the person\'s list.',
    },
    'asked by a chain two agents long, passed on by both': {
      markedBy: { kind: 'agent', id: 'made-up-two-up' },
      with: null,
      confirmedBy: [{ who: { kind: 'agent', id: 'made-up-by-id' }, at: '2026-01-02 03:04:05' }, { who: { kind: 'agent', id: 'made-up-top' }, at: '2026-01-02 03:04:05' }],
      reachedThePerson: true,
      case: 'passed-to-person',
      facts: { passedBy: 'made-up-top-handle', passedByKind: 'agent', passedAt: '2026-01-02 03:04:05' },
      says: 'agent "made-up-top-handle" passed this on to the person on 2026-01-02 03:04:05.',
    },
    'asked by a chain two agents long, passed on by both, the last named by its handle': {
      markedBy: { kind: 'agent', id: 'made-up-two-up' },
      with: null,
      confirmedBy: [
        { who: { kind: 'agent', id: 'made-up-by-id' }, at: '2026-01-02 03:04:05' },
        { who: { kind: 'agent', id: 'made-up-top' }, at: '2026-01-02 03:04:05' },
        { who: { kind: 'agent', id: 'made-up-top-handle' }, at: '2026-01-02 03:04:05' },
      ],
      reachedThePerson: true,
      case: 'passed-to-person',
      facts: { passedBy: 'made-up-top-handle', passedByKind: 'agent', passedAt: '2026-01-02 03:04:05' },
      says: 'agent "made-up-top-handle" passed this on to the person on 2026-01-02 03:04:05.',
    },
  },
  sessions: {
    'the top agent files a run for the agent two below it': 'filed',
    'an agent off the chain files a run for that agent': 'refused: This session names the agent "made-up-two-up", and agent "made-up-waiter" may not file or change a session for it. A session for an agent is filed only by that agent, an agent above it in its chain of starters, the person with their key, or the office itself. To start a run for an agent you did not register, ask a secretary to file it, or register the agent yourself, as its starter. Nothing was written.',
    "an agent on the chain names that agent's run as the parent": 'filed',
    "an agent off the chain names that agent's run as the parent": 'refused: parentAttachment names the session "the parent" ("A made-up parent run"), and "made-up-waiter" has no part in it. A caller may name as a run\'s parent only its own session, a session it filed that serves no agent, a session of an agent it started, or a session of an agent or person above it in its chain of starters. A session header does not make a session the caller\'s own. Nothing was written.',
    "an agent names its top starter's run as the parent": 'filed',
  },
  registrations: {
    'made-up-two-up': { status: 201 },
    'made-up-in-a-loop': {
      status: 403,
      error: 'The starters go round: following them up comes back to the agent "made-up-loop-1". A chain that goes round reaches nobody, so nobody answers for what is at the bottom of it. This registration would have joined that chain, so it is refused: an agent at the bottom of a chain that reaches nobody has nobody answering for it, which is what a starter is for. What it would have joined: agent "made-up-in-a-loop" -> agent "made-up-loop-1" -> agent "made-up-loop-2". A person can set the starter of whichever agent the chain stopped at, which mends every chain through it. Nothing was written.',
    },
    'made-up-by-nothing': {
      status: 403,
      error: 'Nothing is registered as the agent "made-up-nothing-has-this-name", so the chain of starters stops there and reaches nobody. This registration would have joined that chain, so it is refused: an agent at the bottom of a chain that reaches nobody has nobody answering for it, which is what a starter is for. What it would have joined: agent "made-up-by-nothing" -> agent "made-up-nothing-has-this-name". A person can set the starter of whichever agent the chain stopped at, which mends every chain through it. Nothing was written.',
    },
    'made-up-by-a-shared-handle': {
      status: 403,
      error: 'Nothing is registered as the agent "made-up-twice", so the chain of starters stops there and reaches nobody. This registration would have joined that chain, so it is refused: an agent at the bottom of a chain that reaches nobody has nobody answering for it, which is what a starter is for. What it would have joined: agent "made-up-by-a-shared-handle" -> agent "made-up-twice". A person can set the starter of whichever agent the chain stopped at, which mends every chain through it. Nothing was written.',
    },
  },
  participants: {
    'a starter stored by its id': {
      chain: [{ kind: 'agent', id: 'made-up-top' }, { kind: 'person', id: 'the person' }],
      chainReachesThePerson: true,
      chainSays: 'The starters reach the person in 2 steps.',
      retiredByHandle: null,
    },
    'a starter stored by its handle': {
      chain: [{ kind: 'agent', id: 'made-up-top' }, { kind: 'person', id: 'the person' }],
      chainReachesThePerson: true,
      chainSays: 'The starters reach the person in 2 steps.',
      retiredByHandle: null,
    },
    'a handle two agents have, one of them retired': {
      chain: [{ kind: 'agent', id: 'made-up-twice' }],
      chainReachesThePerson: false,
      chainSays: 'Nothing is registered as the agent "made-up-twice", so the chain of starters stops there and reaches nobody.',
      retiredByHandle: null,
    },
    "a string that is one agent's id and another agent's handle": {
      chain: [{ kind: 'agent', id: 'made-up-shared-string' }, { kind: 'person', id: 'the person' }],
      chainReachesThePerson: true,
      chainSays: 'The starters reach the person in 2 steps.',
      retiredByHandle: null,
    },
    'a chain through a retired agent': {
      chain: [{ kind: 'agent', id: 'made-up-retired' }, { kind: 'agent', id: 'made-up-waiter' }, { kind: 'person', id: 'the person' }],
      chainReachesThePerson: true,
      chainSays: 'The starters reach the person in 3 steps.',
      retiredByHandle: null,
    },
    'a loop': {
      chain: [{ kind: 'agent', id: 'made-up-loop-1' }, { kind: 'agent', id: 'made-up-loop-2' }],
      chainReachesThePerson: false,
      chainSays: 'The starters go round: following them up comes back to the agent "made-up-loop-1". A chain that goes round reaches nobody, so nobody answers for what is at the bottom of it.',
      retiredByHandle: null,
    },
    'no starter': { chain: [], chainReachesThePerson: false, chainSays: 'Nobody recorded a starter, so there is no chain to follow.', retiredByHandle: null },
    'a starter nothing has as its id or handle': {
      chain: [{ kind: 'agent', id: 'made-up-nothing-has-this-name' }],
      chainReachesThePerson: false,
      chainSays: 'Nothing is registered as the agent "made-up-nothing-has-this-name", so the chain of starters stops there and reaches nobody.',
      retiredByHandle: null,
    },
    'a chain that reaches a secretary': {
      chain: [{ kind: 'agent', id: 'made-up-secretary' }, { kind: 'agent', id: 'made-up-top' }, { kind: 'person', id: 'the person' }],
      chainReachesThePerson: true,
      chainSays: 'The starters reach the person in 3 steps.',
      retiredByHandle: null,
    },
    'a starter of a kind this build does not know': { chain: [], chainReachesThePerson: false, chainSays: 'Nobody recorded a starter, so there is no chain to follow.', retiredByHandle: null },
    'a chain two agents long': {
      chain: [{ kind: 'agent', id: 'made-up-by-id' }, { kind: 'agent', id: 'made-up-top' }, { kind: 'person', id: 'the person' }],
      chainReachesThePerson: true,
      chainSays: 'The starters reach the person in 3 steps.',
      retiredByHandle: null,
    },
    'a retired agent, retired by an agent stored by its id': {
      chain: [{ kind: 'agent', id: 'made-up-top' }, { kind: 'person', id: 'the person' }],
      chainReachesThePerson: true,
      chainSays: 'The starters reach the person in 2 steps.',
      retiredByHandle: 'made-up-by-id',
    },
    'a retired agent in a loop, retired by a handle two agents have': {
      chain: [{ kind: 'agent', id: 'made-up-loop-1' }, { kind: 'agent', id: 'made-up-loop-2' }],
      chainReachesThePerson: false,
      chainSays: 'The starters go round: following them up comes back to the agent "made-up-loop-1". A chain that goes round reaches nobody, so nobody answers for what is at the bottom of it.',
      retiredByHandle: null,
    },
    'a retired agent nobody started, retired by a handle': {
      chain: [],
      chainReachesThePerson: false,
      chainSays: 'Nobody recorded a starter, so there is no chain to follow.',
      retiredByHandle: 'made-up-top-handle',
    },
    'an agent the person started, with a handle that is not its id': {
      chain: [{ kind: 'person', id: 'the person' }],
      chainReachesThePerson: true,
      chainSays: 'The starters reach the person in 1 step.',
      retiredByHandle: null,
    },
  },
  responsible: {
    'a live agent stored by its id': {
      who: { kind: 'agent', id: 'made-up-two-up' },
      why: `The agent "made-up-two-up" created this task and is still live, so it is responsible for it to the end (rule 3). ${THE_PERSON_MAY_ALWAYS_CONFIRM}`,
    },
    'a live agent stored by its handle': {
      who: { kind: 'agent', id: 'made-up-top' },
      why: `The agent "made-up-top-handle" created this task and is still live, so it is responsible for it to the end (rule 3). ${THE_PERSON_MAY_ALWAYS_CONFIRM}`,
    },
    "a string that is one agent's id and another agent's handle": {
      who: { kind: 'agent', id: 'made-up-shared-string' },
      why: `The agent "made-up-x" created this task and is still live, so it is responsible for it to the end (rule 3). ${THE_PERSON_MAY_ALWAYS_CONFIRM}`,
    },
    'a retired agent whose starter is live': {
      who: { kind: 'agent', id: 'made-up-waiter' },
      why: `The agent "made-up-retired" created this task and is retired or gone, so responsibility passes up its starter chain to "made-up-waiter", the first live agent above it (rule 4). ${THE_PERSON_MAY_ALWAYS_CONFIRM}`,
    },
    'a retired agent under the top agent': {
      who: { kind: 'agent', id: 'made-up-top' },
      why: `The agent "made-up-retired-addressee" created this task and is retired or gone, so responsibility passes up its starter chain to "made-up-top-handle", the first live agent above it (rule 4). ${THE_PERSON_MAY_ALWAYS_CONFIRM}`,
    },
    'a retired agent in a loop': {
      who: { kind: 'agent', id: 'made-up-loop-1' },
      why: `The agent "made-up-retired-in-a-loop" created this task and is retired or gone, so responsibility passes up its starter chain to "made-up-loop-1", the first live agent above it (rule 4). ${THE_PERSON_MAY_ALWAYS_CONFIRM}`,
    },
    'a retired agent nobody started': {
      who: { kind: 'agent', id: 'made-up-secretary' },
      why: `The agent "made-up-retired-unstarted" created this task and the chain of starters above it reaches no live agent, so the secretary "made-up-secretary" is responsible (rule 5). ${THE_PERSON_MAY_ALWAYS_CONFIRM}`,
    },
    'a handle two agents have, one of them retired': {
      who: { kind: 'agent', id: 'made-up-secretary' },
      why: `The agent "made-up-twice" created this task and the chain of starters above it reaches no live agent, so the secretary "made-up-secretary" is responsible (rule 5). ${THE_PERSON_MAY_ALWAYS_CONFIRM}`,
    },
    'a string no agent has': {
      who: { kind: 'agent', id: 'made-up-secretary' },
      why: `The agent "made-up-nobody-registered" created this task and the chain of starters above it reaches no live agent, so the secretary "made-up-secretary" is responsible (rule 5). ${THE_PERSON_MAY_ALWAYS_CONFIRM}`,
    },
    'the person': {
      who: { kind: 'person', id: 'the person' },
      why: `The person "the person" created this task, so the person is responsible for it to the end (rule 2). ${THE_PERSON_MAY_ALWAYS_CONFIRM}`,
    },
  },
  routingWalk: {
    'the credential of made-up-two-up': { to: { kind: 'agent', id: 'made-up-by-id' }, reason: 'you are the nearest agent above that agent in its chain of starters' },
    'the credential of made-up-through-a-retired': { to: { kind: 'agent', id: 'made-up-waiter' }, reason: 'you are the nearest agent above that agent in its chain of starters' },
    'the credential of made-up-under-a-secretary': { to: { kind: 'agent', id: 'made-up-secretary' }, reason: 'you are the nearest agent above that agent in its chain of starters' },
    'the container stopped by made-up-waiter': {
      refused: 'Only made-up-two-up, made-up-by-id, made-up-top-handle, a secretary, or the person may stop container made-up-container after its registering session has ended.',
    },
    'the container stopped by made-up-by-id': { stopped: true },
  },
}

beforeAll(async () => {
  t = await freshDb()
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  // THE RECORDER GOES IN BEFORE THE SERVER IS MADE, so no statement the server keeps is prepared without it.
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    for (const method of ['all', 'get', 'iterate', 'run'] as const) {
      const run = statement[method] as ((...args: unknown[]) => unknown) | undefined
      if (typeof run !== 'function') continue
      statement[method] = function (this: unknown, ...args: unknown[]) {
        const answer = run.apply(this, args)
        if (!recording) return answer
        const said = text.replace(/\s+/g, ' ').trim()
        ran.push({ text: said, args })
        if (method === 'run') return answer
        if (method === 'iterate') return keepingEach(answer as Iterable<unknown>, said)
        for (const row of method === 'all' ? (answer as unknown[]) : [answer]) keepTheValuesOf(row, said)
        return answer
      }
    }
    return statement
  }
  app = (await apiApp()).app
  await app.ready()
  confirming = await import('../src/server/lib/confirming.ts')
  delegation = await import('../src/server/lib/delegation.ts')
  mismatch = await import('../src/server/lib/credential-mismatch.ts')
  resources = await import('../src/server/lib/resources.ts')
  roles = await import('../src/server/lib/roles.ts')
  expect(roles.theRoleCardsAreRead(), 'the role cards are read, so a secretary can be one').toBe(true)
  const card = theSecretaryCard()

  const person = { kind: 'person', id: THE_PERSON }
  const agent = (id: string) => ({ kind: 'agent', id })
  anAgent(TOP, TOP_HANDLE, person)
  anAgent(WAITER, WAITER, person)
  anAgent(SECRETARY, SECRETARY, agent(TOP), { role: card })
  // THE STRING THAT IS AN ID AND A HANDLE. The id answers it; the agent with it as a handle is under a secretary, so an
  // answer by handle would end the walk somewhere else.
  anAgent(SHARED, 'made-up-x', person)
  anAgent('made-up-y', SHARED, agent(SECRETARY))
  // ONE HANDLE, TWO AGENTS: one retired, as the index on live handles allows.
  anAgent('made-up-twice-old', 'made-up-twice', agent(TOP), { retired: 1 })
  anAgent('made-up-twice-new', 'made-up-twice', agent(WAITER))
  anAgent(RETIRED, RETIRED, agent(WAITER), { retired: 1 })
  anAgent('made-up-loop-1', 'made-up-loop-1', agent('made-up-loop-2'))
  anAgent('made-up-loop-2', 'made-up-loop-2', agent('made-up-loop-1'))

  anAgent(BY_ID, BY_ID, agent(TOP))
  anAgent('made-up-by-handle', 'made-up-by-handle', agent(TOP_HANDLE))
  anAgent('made-up-by-a-shared-handle', 'made-up-by-a-shared-handle', agent('made-up-twice'))
  anAgent('made-up-by-an-id-and-a-handle', 'made-up-by-an-id-and-a-handle', agent(SHARED))
  anAgent('made-up-through-a-retired', 'made-up-through-a-retired', agent(RETIRED))
  anAgent('made-up-in-a-loop', 'made-up-in-a-loop', agent('made-up-loop-1'))
  anAgent('made-up-unstarted', 'made-up-unstarted', null)
  anAgent('made-up-by-nothing', 'made-up-by-nothing', agent('made-up-nothing-has-this-name'))
  anAgent('made-up-under-a-secretary', 'made-up-under-a-secretary', agent(SECRETARY))
  anAgent('made-up-by-an-unknown-kind', 'made-up-by-an-unknown-kind', { kind: 'made-up-kind', id: TOP })
  anAgent(TWO_UP, TWO_UP, agent(BY_ID))
  anAgent('made-up-retired-addressee', 'made-up-retired-addressee', agent(TOP), { retired: 1 })
  anAgent('made-up-retired-in-a-loop', 'made-up-retired-in-a-loop', agent('made-up-loop-1'), { retired: 1 })
  anAgent('made-up-retired-unstarted', 'made-up-retired-unstarted', null, { retired: 1 })
  // WHO RETIRED THEM: an agent by its id, a handle two agents have, and a handle one agent has.
  const retiredBy = t.client.sqlite.prepare("UPDATE agents SET retired_by_kind = 'agent', retired_by_id = ? WHERE id = ?")
  retiredBy.run(BY_ID, 'made-up-retired-addressee')
  retiredBy.run('made-up-twice', 'made-up-retired-in-a-loop')
  retiredBy.run(TOP_HANDLE, 'made-up-retired-unstarted')

  // THE AGENTS NO CHAIN NAMES. The first has the top agent's handle in upper case; a few are retired.
  FILLERS.forEach((id, i) => anAgent(id, i === 0 ? TOP_HANDLE.toUpperCase() : `${id}-handle`, person, { retired: i % 7 === 3 ? 1 : 0 }))
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

function theSecretaryCard(): string {
  return (JSON.parse(readFileSync(roles.theRoleCardsFile(), 'utf8')) as { elevation: { onlyThisCardCanHoldIt: string } }).elevation.onlyThisCardCanHoldIt
}

/** One registry row and its avatar, written at the table as tests/a-message-route-reads-only-the-starters-on-its-chain.test.ts writes one. */
function anAgent(id: string, handle: string, startedBy: { kind: string; id: string } | null, more: { retired?: number; role?: string } = {}): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, 'generated')",
    )
    .run(`avatar-default-agent-${id}`, at)
  t.client.sqlite
    .prepare(
      'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, retired_at, created_at, started_by_kind, started_by_id, role) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(id, handle, handle, `avatar-default-agent-${id}`, more.retired ?? 0, more.retired === 1 ? at : null, at, startedBy?.kind ?? null, startedBy?.id ?? null, more.role ?? null)
}

/**
 * A RECORD THE PERSON WROTE, THEN STAMPED AS ONE AGENT'S, at the table: its create row and its revisions. The stamp may
 * be a retired agent, a handle or a string no agent has, which no write of an agent's own could leave.
 */
function aRecordStampedAs(stamp: string, kind: 'problem' | 'task', title: string, data: Record<string, unknown>): string {
  const id = t.api.createRecord({ workspaceId: PROJECT, kind, title, data, actor: t.api.HUMAN }).id
  t.client.sqlite.prepare("UPDATE changes SET actor_type = 'agent', actor_id = ? WHERE record_id = ?").run(stamp, id)
  t.client.sqlite.prepare("UPDATE revisions SET actor_type = 'agent', actor_id = ? WHERE record_id = ?").run(stamp, id)
  return id
}

/** Keep each value of one row, with the statement that gave it back. */
function keepTheValuesOf(row: unknown, text: string): void {
  const values = Array.isArray(row) ? row : typeof row === 'object' && row !== null ? Object.values(row) : [row]
  for (const value of values) {
    const by = gaveBack.get(value)
    if (by === undefined) gaveBack.set(value, new Set([text.slice(0, 200)]))
    else by.add(text.slice(0, 200))
  }
}

function* keepingEach(rows: Iterable<unknown>, text: string): Generator<unknown> {
  for (const row of rows) {
    keepTheValuesOf(row, text)
    yield row
  }
}

/** Run one call with the recorder on, from nothing kept. */
function counted<T>(call: () => T): T {
  gaveBack.clear()
  ran.length = 0
  recording = true
  try {
    return call()
  } finally {
    recording = false
  }
}

/** The same, for a request through the server. */
async function countedRequest<T>(call: () => Promise<T>): Promise<T> {
  gaveBack.clear()
  ran.length = 0
  recording = true
  try {
    return await call()
  } finally {
    recording = false
  }
}

/**
 * What one counted call read: how often every agent was read, and the agents no chain names whose ids came back, each
 * with the first statement that gave it back. A statement named in `leftOut` is not counted as giving any id back.
 */
function whatWasRead(leftOut?: string): { everyAgent: number; offTheChain: string[] } {
  const offTheChain: string[] = []
  for (const id of FILLERS) {
    const by = [...(gaveBack.get(id) ?? [])].filter((text) => text !== leftOut)
    if (by.length > 0) offTheChain.push(`${id} from ${by[0]!}`)
  }
  return { everyAgent: ran.filter((one) => one.text === EVERY_AGENT).length, offTheChain }
}

/** The person's id and the owner's name said as words, so the answers written out above name nobody. */
function inWords(answer: unknown): unknown {
  const owner = (t.client.sqlite.prepare('SELECT name FROM people WHERE id = ?').get(THE_PERSON) as { name: string }).name
  expect(owner, "the owner's name").not.toBe('')
  return JSON.parse(JSON.stringify(answer).replaceAll(owner, 'the owner').replaceAll(THE_PERSON, 'the person')) as unknown
}

function headersOf(actor: { type: 'human' | 'agent'; id: string }): Record<string, string> {
  return { 'x-mole-office-workspace': PROJECT, 'x-mole-office-actor-type': actor.type, 'x-mole-office-actor-id': actor.id, 'content-type': 'application/json' }
}

describe('a door that walks one chain of starters reads only the agents on it', () => {
  it('1. where a question is: each asker as before, and a record that asks nothing runs no statement', async () => {
    const answers: Record<string, unknown> = {}
    const reads: Record<string, unknown> = {}
    const askers: { is: string; stamp: string; passedBy?: string[] }[] = [
      ...SHAPES.filter((one) => one.id !== TOP && !one.id.startsWith('made-up-retired-')).map((one) => ({ is: `asked by ${one.is}`, stamp: one.id })),
      { is: 'asked under a handle two agents have', stamp: 'made-up-twice' },
      { is: 'asked under the handle of an agent the person started', stamp: TOP_HANDLE },
      { is: 'asked under a string no agent has', stamp: NOBODY_REGISTERED },
      { is: 'asked by a chain two agents long, passed on by the first', stamp: TWO_UP, passedBy: [BY_ID] },
      { is: 'asked by a chain two agents long, passed on by both', stamp: TWO_UP, passedBy: [BY_ID, TOP] },
      { is: 'asked by a chain two agents long, passed on by both, the last named by its handle', stamp: TWO_UP, passedBy: [BY_ID, TOP, TOP_HANDLE] },
    ]
    for (const { is, stamp, passedBy } of askers) {
      const id = aRecordStampedAs(stamp, 'problem', `A made-up question ${is}`, { whose_move: 'person' })
      if (passedBy !== undefined) {
        const path = passedBy.map((who) => ({ who: { kind: 'agent', id: who }, at: PASSED_AT }))
        t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.confirmed_by', json(?)) WHERE id = ?").run(JSON.stringify(path), id)
      }
      const record = t.api.getRecord(id)!
      const where = counted(() => confirming.whereOneQuestionIs(record))
      reads[is] = whatWasRead()
      answers[is] = inWords(where)
      // THE RECORD DOOR SHOWS THE SAME READING.
      const reply = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: headersOf({ type: 'human', id: THE_PERSON }) })
      expect(reply.statusCode, is).toBe(200)
      // The door leaves the reading out where the question is with nobody and never reached the person.
      expect((reply.json() as { whereTheQuestionIs?: unknown }).whereTheQuestionIs, is).toEqual(where.with === null && !where.reachedThePerson ? undefined : where)
    }
    expect(answers).toEqual(BEFORE['questions'])
    expect(reads).toEqual(Object.fromEntries(askers.map(({ is }) => [is, { everyAgent: 0, offTheChain: [] }])))

    // A RECORD THAT ASKS NOTHING, through the reading and through the record door.
    const nothing = t.api.createRecord({ workspaceId: PROJECT, kind: 'problem', title: 'A made-up problem that asks nothing', data: { whose_move: 'agent' }, actor: t.api.HUMAN })
    const asksNothing = counted(() => confirming.whereOneQuestionIs(nothing))
    expect(asksNothing.case).toBe('not-a-question')
    expect(ran.map((one) => one.text), 'the statements the reading of a record that asks nothing ran').toEqual([])
    const read = await countedRequest(() => app.inject({ method: 'GET', url: `/api/records/${nothing.id}`, headers: headersOf({ type: 'human', id: THE_PERSON }) }))
    expect(read.statusCode).toBe(200)
    expect(whatWasRead(), 'the record door, reading a record that asks nothing').toEqual({ everyAgent: 0, offTheChain: [] })
  })

  it('2. who may file a session: each filing as before, and no agent off the chain read', () => {
    const answers: Record<string, unknown> = {}
    const reads: Record<string, unknown> = {}
    const aSession = (by: string, data: Record<string, unknown>): string => {
      try {
        t.api.createRecord({ workspaceId: PROJECT, kind: 'session', title: 'A made-up run', data: { state: 'running', runtime: 'claude-code', ...data }, actor: { type: 'agent', id: by } })
        return 'filed'
      } catch (error) {
        return `refused: ${(error as Error).message}`
      }
    }
    const servesTwoUp = t.api.createRecord({ workspaceId: PROJECT, kind: 'session', title: 'A made-up parent run', data: { state: 'running', runtime: 'claude-code', servingAgent: TWO_UP }, actor: t.api.HUMAN }).id
    const servesTop = t.api.createRecord({ workspaceId: PROJECT, kind: 'session', title: 'A made-up parent run', data: { state: 'running', runtime: 'claude-code', servingAgent: TOP }, actor: t.api.HUMAN }).id
    const filings: { is: string; by: string; data: Record<string, unknown> }[] = [
      { is: 'the top agent files a run for the agent two below it', by: TOP, data: { servingAgentId: TWO_UP } },
      { is: 'an agent off the chain files a run for that agent', by: WAITER, data: { servingAgentId: TWO_UP } },
      { is: "an agent on the chain names that agent's run as the parent", by: BY_ID, data: { parentAttachment: servesTwoUp } },
      { is: "an agent off the chain names that agent's run as the parent", by: WAITER, data: { parentAttachment: servesTwoUp } },
      { is: "an agent names its top starter's run as the parent", by: TWO_UP, data: { parentAttachment: servesTop } },
    ]
    for (const { is, by, data } of filings) {
      const said = counted(() => aSession(by, data))
      reads[is] = whatWasRead()
      answers[is] = inWords(said.replaceAll(servesTwoUp, 'the parent').replaceAll(servesTop, 'the parent'))
    }
    expect(answers).toEqual(BEFORE['sessions'])
    expect(reads).toEqual(Object.fromEntries(filings.map(({ is }) => [is, { everyAgent: 0, offTheChain: [] }])))
  })

  it('3. the registration door: each starter as before, and no agent off the chain read', async () => {
    const answers: Record<string, unknown> = {}
    const reads: Record<string, unknown> = {}
    const starters = [TWO_UP, 'made-up-in-a-loop', 'made-up-by-nothing', 'made-up-by-a-shared-handle']
    for (const [n, starter] of starters.entries()) {
      const reply = await countedRequest(() =>
        app.inject({ method: 'POST', url: '/api/agents/started', headers: headersOf({ type: 'agent', id: starter }), payload: JSON.stringify({ handle: `made-up-new-agent-${n}`, name: `A made-up new agent ${n}` }) }),
      )
      // A REGISTRATION THAT IS WRITTEN brings the broadcast schedules in step, and reads only the agents that can change
      // for it. No statement is left out, and the read of every agent's id is counted for every starter.
      reads[starter] = { ...whatWasRead(), everyAgentId: ran.filter((one) => one.text === EVERY_AGENT_ID).length }
      answers[starter] = inWords(reply.statusCode === 201 ? { status: 201 } : { status: reply.statusCode, error: (reply.json() as { error: string }).error })
    }
    expect(answers).toEqual(BEFORE['registrations'])
    const written = (one: string): boolean => (BEFORE['registrations']![one] as { status: number }).status === 201
    expect(starters.filter(written), 'the registrations that are written').toEqual([TWO_UP])
    expect(reads).toEqual(Object.fromEntries(starters.map((one) => [one, { everyAgent: 0, offTheChain: [], everyAgentId: 0 }])))
  })

  it('4. one participant: each agent as the roster draws it and as before, and no agent off the chain read', async () => {
    const roster = await app.inject({ method: 'GET', url: '/api/participants', headers: headersOf({ type: 'human', id: THE_PERSON }) })
    expect(roster.statusCode).toBe(200)
    const theRoster = new Map((roster.json() as { agents: Record<string, unknown>[] }).agents.map((one) => [String(one['id']), one]))
    const chainOf = (one: Record<string, unknown> | undefined) => ({ chain: one?.['chain'], chainReachesThePerson: one?.['chainReachesThePerson'], chainSays: one?.['chainSays'], retiredByHandle: one?.['retiredByHandle'] })
    const answers: Record<string, unknown> = {}
    const reads: Record<string, unknown> = {}
    for (const { id, is } of SHAPES) {
      const reply = await countedRequest(() => app.inject({ method: 'GET', url: `/api/participants/agent/${id}`, headers: headersOf({ type: 'human', id: THE_PERSON }) }))
      reads[is] = whatWasRead()
      expect(reply.statusCode, is).toBe(200)
      const one = chainOf((reply.json() as { participant: Record<string, unknown> }).participant)
      expect(one, `${is}: the one-participant door and the roster`).toEqual(chainOf(theRoster.get(id)))
      answers[is] = inWords(one)
    }
    expect(answers).toEqual(BEFORE['participants'])
    expect(reads).toEqual(Object.fromEntries(SHAPES.map(({ is }) => [is, { everyAgent: 0, offTheChain: [] }])))
    // THE PROFILE PAGE draws the same participant, and reads every agent only for the list of whom it can write to.
    const profile = await countedRequest(() => app.inject({ method: 'GET', url: `/api/participants/agent/${TWO_UP}/profile`, headers: headersOf({ type: 'human', id: THE_PERSON }) }))
    expect(profile.statusCode).toBe(200)
    expect(inWords(chainOf((profile.json() as { participant: Record<string, unknown> }).participant))).toEqual(answers['a chain two agents long'])
    expect(whatWasRead().everyAgent, 'the reads of every agent on the profile page').toBe(1)
  })

  it('5. who is responsible for a task: each creator as before, and every agent read only where the secretary answers', () => {
    const answers: Record<string, unknown> = {}
    const reads: Record<string, unknown> = {}
    // `bySecretary`: the chain reaches no live agent, so the secretary answers (rule 5).
    const creators: { is: string; stamp: string; bySecretary?: true }[] = [
      { is: 'a live agent stored by its id', stamp: TWO_UP },
      { is: 'a live agent stored by its handle', stamp: TOP_HANDLE },
      { is: "a string that is one agent's id and another agent's handle", stamp: SHARED },
      { is: 'a retired agent whose starter is live', stamp: RETIRED },
      { is: 'a retired agent under the top agent', stamp: 'made-up-retired-addressee' },
      { is: 'a retired agent in a loop', stamp: 'made-up-retired-in-a-loop' },
      { is: 'a retired agent nobody started', stamp: 'made-up-retired-unstarted', bySecretary: true },
      { is: 'a handle two agents have, one of them retired', stamp: 'made-up-twice', bySecretary: true },
      { is: 'a string no agent has', stamp: NOBODY_REGISTERED, bySecretary: true },
      { is: 'the person', stamp: '' },
    ]
    for (const { is, stamp, bySecretary } of creators) {
      const title = `A made-up task by ${is}`
      const id = stamp === '' ? t.api.createRecord({ workspaceId: PROJECT, kind: 'task', title, data: {}, actor: t.api.HUMAN }).id : aRecordStampedAs(stamp, 'task', title, {})
      const responsible = counted(() => delegation.responsibleFor(id))
      const read = whatWasRead()
      expect(responsible.why.includes('(rule 5)'), `${is}: the secretary answers`).toBe(bySecretary === true)
      // THE SECRETARY'S RULE STILL READS EVERY AGENT, through `whoHoldsTheSecretaryCard`, and that read gives back the
      // agents no chain names. So where it answers, only the number of reads of every agent is compared.
      reads[is] = bySecretary === true ? { everyAgent: read.everyAgent } : read
      answers[is] = inWords(responsible)
    }
    expect(answers).toEqual(BEFORE['responsible'])
    expect(reads).toEqual(Object.fromEntries(creators.map(({ is, bySecretary }) => [is, bySecretary === true ? { everyAgent: 1 } : { everyAgent: 0, offTheChain: [] }])))
  })

  it("6. the routing walk's two other callers: each as before, and no agent off the chain read", async () => {
    const answers: Record<string, unknown> = {}
    const reads: Record<string, unknown> = {}
    // WHO IS TOLD ABOUT A CREDENTIAL'S MISMATCH: the nearest live agent above the credential's own.
    for (const holder of [TWO_UP, 'made-up-through-a-retired', 'made-up-under-a-secretary']) {
      const credential = `made-up-credential-of-${holder}`
      t.client.sqlite.prepare('UPDATE agents SET credential = ? WHERE id = ?').run(credential, holder)
      const told = counted(() => mismatch.whoIsToldAboutACredentialMismatch({ id: credential, role: 'worker' } as VisitorCredential))
      reads[`the credential of ${holder}`] = whatWasRead()
      answers[`the credential of ${holder}`] = inWords(told)
    }
    // WHO MAY STOP A CONTAINER AN ENDED RUN LEFT OPEN: the run's agent and its chain, a secretary, or the person.
    resources.useOsProbe(Object.assign(Object.create(resources.LINUX_PROBE) as typeof resources.LINUX_PROBE, {
      containers: () => ({ available: true, containers: [{ id: 'made-up-container-id', name: 'made-up-container', image: 'made-up-image', status: 'running' }] }),
      stopContainer: () => undefined,
    }))
    try {
      for (const by of [WAITER, BY_ID]) {
        const run = t.api.createRecord({ workspaceId: PROJECT, kind: 'session', title: 'A made-up run', data: { state: 'running', runtime: 'claude-code', servingAgent: TWO_UP }, actor: t.api.HUMAN }).id
        const row = resources.registerResource({ workspaceId: PROJECT, sessionRecordId: run, type: 'container', key: 'made-up-container', actor: t.api.HUMAN })
        t.api.patchRecord(run, { dataPatch: { state: 'finished', submission: { kind: 'records', records: [run] } } }, t.api.HUMAN)
        const stopped = await countedRequest(() =>
          resources.releaseResource(row.id, { actor: { type: 'agent', id: by } }, PROJECT).then(
            (done) => ({ stopped: done.resource.releasedAt !== null }),
            (error: Error) => ({ refused: error.message }),
          ),
        )
        reads[`the container stopped by ${by}`] = whatWasRead()
        answers[`the container stopped by ${by}`] = inWords(stopped)
      }
    } finally {
      resources.useOsProbe(resources.LINUX_PROBE)
    }
    expect(answers).toEqual(BEFORE['routingWalk'])
    expect(reads).toEqual(Object.fromEntries(Object.keys(answers).map((is) => [is, { everyAgent: 0, offTheChain: [] }])))
  })

  it('7. the guard: the roster reads every agent once, and the recorder sees the agents no chain names', async () => {
    const roster = await countedRequest(() => app.inject({ method: 'GET', url: '/api/participants', headers: headersOf({ type: 'human', id: THE_PERSON }) }))
    expect(roster.statusCode).toBe(200)
    const read = whatWasRead()
    expect(read.everyAgent, 'the reads of every agent for the roster').toBe(1)
    expect(read.offTheChain.length, 'the agents no chain names that the roster read').toBe(FILLERS.length)
  })
})
