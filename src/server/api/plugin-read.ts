// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE READ-ONLY INTERFACE A PLUGIN READS THROUGH, VERSION 1. Wave 13x round 14, step 2 of the plugin pipeline
 * udGnc-Bsr15R (block 1DP8abzhUpNb). The views are built in src/server/lib/plugin-read.ts.
 *
 *   GET /api/plugin-read/v1/projects   every project's id and name
 *   GET /api/plugin-read/v1/people     the people, and the agents with their presence in each project
 *   GET /api/plugin-read/v1/work       the work each agent is doing now
 *   GET /api/plugin-read/v1/talk       who wrote to whom and when, never the words
 *   GET /api/plugin-read/v1/roster     who every person and agent is, and nothing worked out (wave 13y round 50)
 *   GET /api/plugin-read/v1/online     whether each agent is online, and nothing else (wave 13y round 66)
 *
 * PEOPLE AND WORK TAKE ?agents=<id>,<id>,... for only those agents (wave 13y round 50). A page that draws some agents
 * asks for those, so the office works out the presence and the work of those alone.
 *
 * EVERY ROUTE HERE IS A GET, AND NOTHING HERE WRITES. tests/the-plugin-read-interface-v1.test.ts fails when a route
 * under /api/plugin-read/ is not a read, when one changes a table, and when one answers with a key or a field named
 * like one. Each answer has no moment of its own in it, so asking again with the ETag answers 304 when nothing changed.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { AGENTS_LIMIT, PLUGIN_READ_INTERFACE, READ_TARGET_LIMIT, RUN_STANDINGS, TALK_LIMIT } from '../../shared/plugin-read.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import {
  pluginOnlineView,
  pluginPeopleView,
  pluginProjectsView,
  pluginRosterView,
  pluginTalkView,
  pluginWorkView,
} from '../lib/plugin-read.ts'
import { theAgentsAsleepNow } from '../lib/resident-sleep.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { readAgentStatus } from '../lib/messages/status.ts'

const SAME_FOR_EVERY_VIEW =
  `Interface ${PLUGIN_READ_INTERFACE}, read only, and no body is read. The reply starts {interface, view}. It carries ` +
  'no key and no moment of its own, so asking again with If-None-Match answers 304 when nothing changed.'

const PROJECTS_NOTE = `Every project's id and name, as {projects: [{id, name}]}. ${SAME_FOR_EVERY_VIEW}`

const SOME_AGENTS =
  `Query: agents=<id>,<id>,... answers for only those agents, at most ${String(AGENTS_LIMIT.most)} of them, each id of ` +
  `letters, digits, - and _ and at most ${String(AGENTS_LIMIT.idLength)} long. An id named twice is answered once. The ` +
  'answer is what the whole view answers for those agents, in the same order, with notAgents: the ids asked that no ' +
  'agent has, in the order asked. agents= with nothing after it answers no agent. A plugin\'s slot sends a path and ' +
  `query of at most ${String(READ_TARGET_LIMIT)} bytes, built by theTargetOfARead in src/shared/plugin-read.ts, and ` +
  'refuses a longer read itself with too-long. 500 ids of 12 characters are 7,531 bytes on people, and 121 ids of 64 ' +
  'fit. The server refuses a request whose target and headers are over 16,383 bytes together: the asker gets 431, or ' +
  'the connection closes with no answer.'

const PEOPLE_NOTE =
  'The people, as {kind, id, handle, name}, and every agent, as {kind, id, handle, name, role, retired, visitor, ' +
  'startedBy, createdAt, projects, appearance, appearanceChosen, scale, presence: [{project, colour, word}]}. visitor is ' +
  'true for an agent from another office. scale is the map size saved when the agent was registered, as {version, ' +
  `roleAtGeneration, value}, or null when none was saved. ${SOME_AGENTS} The people are every person either way. ` +
  SAME_FOR_EVERY_VIEW

const WORK_NOTE =
  'The work each agent is doing now, as the pixel office reads it: {work: [{id, project, agent, title, detail, ' +
  'recordedState, doing, executing, association, updatedAt, runStanding}]}. runStanding is where a run stands (one of ' +
  `${RUN_STANDINGS.join(', ')}), or null for a task or a block. detail "completed" is said "Confirmed complete" and a ` +
  `run closed unchecked has it too, so runStanding is what tells them apart. No map seat is read or saved. ${SOME_AGENTS} ` +
  SAME_FOR_EVERY_VIEW

const ROSTER_NOTE =
  'Who every person and every agent is, and nothing worked out: {people: [{kind, id, handle, name}], agents: [{kind, ' +
  'id, handle, name, role, retired, visitor, startedBy, createdAt}]}, each with the values and in the order of the ' +
  'people view. It reads no presence, project, look or scale; ask the people view with agents= for the agents you ' +
  `draw. ${SAME_FOR_EVERY_VIEW}`

const ONLINE_NOTE =
  'Whether each agent on the roster is online, and nothing else: {agents: [{id, online}]}, one row for each agent of ' +
  'the roster, in its order. online is true when the people view draws the agent\'s dot green in at least one project, ' +
  'or draws it grey with the words "In a terminal". It is false for every other agent, and for every retired one. ' +
  `It carries no presence words, no process and no scale. ${SAME_FOR_EVERY_VIEW}`

const ASLEEP_NOTE =
  'Every agent asleep now, as {agents: [{id, since}]}, one row for each open sleep, and nothing else. since is when the ' +
  'sleep began. It names no machine, address or key.'

const TALK_NOTE =
  'Who wrote to whom and when, oldest first, and never the words: {messages: [{id, project, at, from, to}], last, ' +
  `more, subtraction, leftOutGroups, refusal, withdrawn: {ids, last, more, subtraction, leftOutGroups}}. Query: after=<last of an earlier answer> reads on from there; limit=1..${String(TALK_LIMIT.most)} ` +
  `(${String(TALK_LIMIT.unsaid)} when not given). more is true when more messages come after last. subtraction and ` +
  'leftOutGroups count the messages after `after` and name, by id, the ones left out beyond the limit. refusal says why ' +
  'the caller sees only the messages they sent or were sent, or is null when they see every one. start=latest, given ' +
  'alone, answers no message and the newest last to read on from, so a first read replays nothing. withdrawn.ids names ' +
  'the messages withdrawn since withdrawnAfter=<withdrawn.last of an earlier answer>, oldest withdrawal first and at most ' +
  'limit of them, that the caller could read were they not withdrawn; without withdrawnAfter it names none, and ' +
  'withdrawn.last is where to begin. withdrawn.subtraction and withdrawn.leftOutGroups count the withdrawals after ' +
  'withdrawnAfter, none without it, and name, by id, the ones left out beyond the limit. A message withdrawn and then ' +
  'restored is not named. ' +
  SAME_FOR_EVERY_VIEW

const noQuery = z.strictObject({})

/** One id `agents=` may name. */
const AN_AGENT_ID = new RegExp(`^[A-Za-z0-9_-]{1,${String(AGENTS_LIMIT.idLength)}}$`)

/** `?agents=` of the people and work views: agent ids joined by commas, each counted once, in the order first named. */
const someAgents = z.strictObject({
  agents: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) return undefined
      if (value === '') return []
      const named = [...new Set(value.split(','))]
      const bad = named.find((one) => !AN_AGENT_ID.test(one))
      if (bad !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: `agents names agent ids, each of letters, digits, - and _ and at most ${String(AGENTS_LIMIT.idLength)} long, joined by commas; ${JSON.stringify(bad)} is not one`,
        })
        return z.NEVER
      }
      if (named.length > AGENTS_LIMIT.most) {
        ctx.addIssue({ code: 'custom', message: `agents names ${String(named.length)} agents, and at most ${String(AGENTS_LIMIT.most)} are answered in one read` })
        return z.NEVER
      }
      return named
    }),
})

const statusQuery = someAgents.required().extend({
  scope: z.literal('home', { error: 'scope is "home", which reads each agent in its home project; left out, the agents are read in this project.' }).optional(),
})

const talkQuery = z.strictObject({
  start: z.literal('latest', { error: 'start is "latest", the one place a first read may begin.' }).optional(),
  after: z.string().min(3).max(200).optional(),
  withdrawnAfter: z.string().max(20).optional(),
  limit: z.coerce.number({ error: 'limit is a whole number of messages.' }).int().min(1).max(TALK_LIMIT.most).optional(),
})

export async function pluginReadRoutes(app: FastifyInstance): Promise<void> {
  app.get('/plugin-read/v1/status', route('plugin-read.status', 'remote',
    'Presence, personal words with their setter, and every unsettled run in the requested project with its observed flow logs and last appended step. ' +
    'A read with available:false is unavailable; no run or flow log means not recorded. Closed, superseded and closed-unchecked runs are history. ' +
    'agents is required, including agents= to read nobody. Only requested ids are answered, once each in the order asked, with missing ids in notAgents. ' +
    'It uses the people/work id selection limits and syntax. No profile is assembled and no message body or credential field is returned. ' +
    'With scope=home each agent is read in its home projects, as the chat reads it from any project: the project of its own record, the project of the session holding its handle, ' +
    'and each project where a run of it has not ended, or carries a message to hand over and is still inside its wait. ' +
    'Its presence and its unsettled runs are read there, and each run names the project it is in. Only a registered agent with no home project is read in every project. ' + SAME_FOR_EVERY_VIEW), async (req) => {
    const query = parse(statusQuery, req.query ?? {}, 'The status view')
    return readAgentStatus(workspaceOf(req), actorFrom(req), query.agents, query.scope ?? 'workspace')
  })
  app.get('/plugin-read/v1/projects', route('plugin-read.projects', 'remote', PROJECTS_NOTE), async (req) => {
    parse(noQuery, req.query ?? {}, 'The projects view')
    return pluginProjectsView()
  })

  app.get('/plugin-read/v1/people', route('plugin-read.people', 'remote', PEOPLE_NOTE), async (req) => {
    const query = parse(someAgents, req.query ?? {}, 'The people view')
    return pluginPeopleView(workspaceOf(req), actorFrom(req), query.agents)
  })

  app.get('/plugin-read/v1/work', route('plugin-read.work', 'remote', WORK_NOTE), async (req) => {
    const query = parse(someAgents, req.query ?? {}, 'The work view')
    return pluginWorkView(workspaceOf(req), actorFrom(req), query.agents)
  })

  app.get('/plugin-read/v1/talk', route('plugin-read.talk', 'remote', TALK_NOTE), async (req) => {
    const query = parse(talkQuery, req.query ?? {}, 'The talk view')
    return pluginTalkView(actorFrom(req), { start: query.start, after: query.after, withdrawnAfter: query.withdrawnAfter }, query.limit ?? TALK_LIMIT.unsaid)
  })

  app.get('/plugin-read/v1/roster', route('plugin-read.roster', 'remote', ROSTER_NOTE), async (req) => {
    parse(noQuery, req.query ?? {}, 'The roster')
    return pluginRosterView()
  })

  app.get('/plugin-read/v1/online', route('plugin-read.online', 'remote', ONLINE_NOTE), async (req) => {
    parse(noQuery, req.query ?? {}, 'The online view')
    return pluginOnlineView(workspaceOf(req), actorFrom(req))
  })

  app.get('/plugin-read/v1/asleep', route('plugin-read.asleep', 'remote', ASLEEP_NOTE), async (req) => {
    parse(noQuery, req.query ?? {}, 'The asleep view')
    return theAgentsAsleepNow()
  })
}
