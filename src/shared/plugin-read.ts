// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A PLUGIN READS THE OFFICE WITH: INTERFACE office-read/1, PUBLISHED IN THIS ONE FILE, WHICH IMPORTS NOTHING.
 * Wave 13x round 16, gap G2 (report ttQWZUdwBnPa), in the plugin pipeline udGnc-Bsr15R under the plan
 * VlQueUhVQQmi.
 *
 * A plugin may import this file and nothing else under src/ (the plan's fourth slot check). It has no import of its
 * own, so a plugin that imports it bundles no office code and type-checks no office code.
 * A test deleted on 13 November 2026 held that.
 *
 * THE OFFICE READS THE SAME DECLARATIONS. src/server/lib/plugin-read.ts builds the six views with these types.
 * src/shared/pixel-office.ts reads its work catalogue from here, src/shared/releasing.ts its run standings, and
 * src/shared/plugins.ts the interface and its views. Where the office keeps its own type of the same thing (a scale, a
 * participant, a left-out count), src/server/lib/plugin-read.ts fails to compile when the two differ by one field.
 *
 * WITHIN v1 A VIEW MAY ONLY GAIN FIELDS (the plan's read interface). tests/the-plugin-read-interface-v1.test.ts pins
 * every field each view answers with.
 */

// ============================================================================ the interface

/** The one interface a plugin may name today. A later version is a new value, and v1 keeps its shapes. */
export const PLUGIN_READ_INTERFACE = 'office-read/1' as const

/**
 * The read views of interface v1, in the order the manifest names them. The roster came fifth, online sixth, and the
 * requested-agent status view seventh.
 */
export const PLUGIN_READ_VIEWS = ['projects', 'people', 'work', 'talk', 'roster', 'online', 'status', 'asleep'] as const
export type PluginReadView = (typeof PLUGIN_READ_VIEWS)[number]

/** The most messages one answer of `talk` holds, and how many it holds when nobody says. */
export const TALK_LIMIT = { most: 1_000, unsaid: 500 } as const

/**
 * HOW MANY AGENTS ONE `?agents=` OF THE PEOPLE OR WORK VIEW MAY NAME, and how long one id may be. An id is letters, digits,
 * `-` and `_`. The ids the office makes are 12 characters, so 500 of them make a path and query of 7,531 bytes on the
 * people view, inside READ_TARGET_LIMIT. 121 ids of 64 characters fit it, and 122 do not.
 */
export const AGENTS_LIMIT = { most: 500, idLength: 64 } as const

/**
 * THE LONGEST PATH AND QUERY THE SLOT SENDS FOR ONE READ, IN BYTES (wave 13y round 52). A longer read is refused with
 * `too-long` before the office is asked, so a plugin asks for fewer agents at a time. The refusal carries the read's
 * length as `bytes` and this limit as `limit` (round 52's fix).
 *
 * Node refuses a request whose target and headers are over 16,383 bytes together, with 431 or a closed connection. Measured
 * in round 52, headless Chromium sends 540 to 1,232 bytes of headers to the office, so 8,192 bytes of target leave 8,191
 * for the headers. The slot cannot see every header a browser sends, such as the cookies of other programs on the same
 * host, so a read inside this limit can still be refused by Node.
 */
export const READ_TARGET_LIMIT = 8_192

/**
 * THE PATH AND QUERY THE SLOT SENDS FOR A READ OF `view` WITH `query`. The slot measures this against READ_TARGET_LIMIT
 * and sends this, so a plugin that measures it splits a list as the slot counts. Each value is encoded as
 * URLSearchParams encodes it, so a comma is the three bytes %2C.
 */
export function theTargetOfARead(view: string, query?: Readonly<Record<string, string | number>>): string {
  const search = new URLSearchParams(Object.entries(query ?? {}).map(([key, value]) => [key, String(value)]))
  return `/api/plugin-read/v1/${encodeURIComponent(view)}${search.size === 0 ? '' : `?${search.toString()}`}`
}

// ============================================================================ the work catalogue

/**
 * THE SEVEN GROUPS A PIECE OF WORK IS DRAWN IN. They are presentation groups, never new stored workflow states. Each
 * work row of the `work` view carries a `detail`, and its group is `PIXEL_DETAILS[detail].group`.
 */
export const PIXEL_STATES = {
  working: { en: 'Working', zh: '工作', colour: '#5b916b' },
  handoff: { en: 'Review & handoff', zh: '检查与交付', colour: '#9b79ae' },
  waiting: { en: 'Waiting', zh: '等待', colour: '#ba9457' },
  paused: { en: 'Paused', zh: '暂停', colour: '#81938e' },
  attention: { en: 'Needs attention', zh: '需要处理', colour: '#c76e63' },
  completed: { en: 'Completed', zh: '完成', colour: '#68a4ae' },
  unknown: { en: 'Not established', zh: '尚不确定', colour: '#92939b' },
} as const
export type PixelState = keyof typeof PIXEL_STATES

/**
 * THE SIXTEEN DETAILS, EACH IN ONE GROUP. `completed` is said "Confirmed complete", and a run closed unchecked has it
 * too: v1 keeps that value, and the row's `runStanding` is what tells the two apart.
 */
export const PIXEL_DETAILS = {
  executing: { group: 'working', en: 'Process running', zh: '进程运行中' },
  checking: { group: 'working', en: 'Check process running', zh: '检查进程运行中' },
  recorded_work: { group: 'working', en: 'Task recorded in progress', zh: '任务记录为进行中' },
  waiting_check: { group: 'handoff', en: 'Awaiting a check', zh: '等待检查' },
  rebuttal: { group: 'handoff', en: 'Refused; awaiting rework or discussion', zh: '检查未通过，待修改或复议' },
  reporting: { group: 'handoff', en: 'Awaiting supervisor confirmation', zh: '等待上级确认' },
  queued: { group: 'waiting', en: 'Queued', zh: '排队中' },
  idle: { group: 'waiting', en: 'Recorded idle', zh: '记录为空闲' },
  waiting_message: { group: 'waiting', en: 'Waiting for another message', zh: '等待下一条消息' },
  paused: { group: 'paused', en: 'Recorded paused', zh: '记录为暂停' },
  blocked: { group: 'attention', en: 'Recorded blocked', zh: '记录为受阻' },
  failed: { group: 'attention', en: 'Recorded failure', zh: '记录为失败' },
  completed: { group: 'completed', en: 'Confirmed complete', zh: '已确认完成' },
  task_completed: { group: 'completed', en: 'Task recorded complete', zh: '任务记录为完成' },
  work_open: { group: 'unknown', en: 'Work open; execution not established', zh: '工作未关闭，是否正在执行尚不确定' },
  unknown: { group: 'unknown', en: 'No current work established', zh: '尚未确定当前工作' },
} as const satisfies Record<string, { group: PixelState; en: string; zh: string }>
export type PixelDetail = keyof typeof PIXEL_DETAILS

/**
 * WHERE ONE RUN STANDS AFTER IT SAID ITS WORK IS FINISHED. Never stored: src/shared/releasing.ts works it out from the
 * office's own acts every time somebody asks, and says what each one means (RUN_STANDING there).
 */
export const RUN_STANDINGS = ['working', 'inspecting', 'rebuttal', 'reporting', 'closed', 'superseded', 'closed unchecked'] as const
export type RunStanding = (typeof RUN_STANDINGS)[number]

// ============================================================================ what the views are made of

/** A person or an agent, as a message's sender and receivers and an agent's starter name them. */
export interface PluginParticipantRef {
  kind: 'person' | 'agent'
  id: string
}

/**
 * AN AGENT'S SAVED MAP SCALE, drawn once when it was registered and stored apart from its clothes. `value` is a size
 * against the drawing's usual one, within the range of `roleAtGeneration`. It is cosmetic and grants nothing.
 */
export interface PluginScale {
  version: 1
  roleAtGeneration: string | null
  value: number
}

/** How one agent reads in one project: the colour and the word the office draws, and nothing else. */
export interface PluginPresence {
  project: string
  colour: string
  word: string
}

/** Members an answer left out, in one named bucket, with a cause. `ids` is null when the ids are what is withheld. */
export interface PluginLeftOutGroup<Bucket extends string = string> {
  cause: 'selection' | 'budget' | 'permission'
  bucket: Bucket
  count: number
  ids: string[] | null
}

/** What an answer could have held, what it held, and how many it left out. */
export interface PluginLeftOutCounts {
  candidates: number
  carried: number
  /** The sum of every group's `count`. */
  leftOut: number
  /** How many members it held were shortened. */
  shortened: number
  /** True when the read stopped early, so the counts are the least there could be. */
  atLeast?: boolean
}

/**
 * EVERY VIEW STARTS WITH THESE, and every answer the office sends carries `narrowedByPermission`. null means the office
 * looked and permission took nothing off this answer.
 */
interface AView<V extends PluginReadView> {
  interface: typeof PLUGIN_READ_INTERFACE
  view: V
  narrowedByPermission: PluginLeftOutGroup[] | null
}

// ============================================================================ the six views

/** GET /api/plugin-read/v1/projects */
export interface PluginProjectsView extends AView<'projects'> {
  projects: { id: string; name: string }[]
}

/**
 * GET /api/plugin-read/v1/people, and ?agents=<id>,<id>,... for only those agents. `people` is every person either way.
 */
export interface PluginPeopleView extends AView<'people'> {
  people: { kind: 'person'; id: string; handle: string; name: string }[]
  agents: {
    kind: 'agent'; id: string; handle: string; name: string; role: string | null; retired: boolean
    /** True when the agent belongs to another office and is visiting this one. */
    visitor: boolean
    startedBy: PluginParticipantRef | null; createdAt: string
    /** The ids of the projects the agent has a record or a run in. */
    projects: string[]
    /** The agent's look. Its versions are not published in this file yet (gap G14). */
    appearance: unknown; appearanceChosen: boolean
    /** The saved map scale, or null when none was saved. Never drawn again for the read. */
    scale: PluginScale | null
    presence: PluginPresence[]
  }[]
  /** With ?agents= only: the ids asked that no agent has, in the order asked. Absent without ?agents=. */
  notAgents?: string[]
}

/** GET /api/plugin-read/v1/work, and ?agents=<id>,<id>,... for only those agents' rows. */
export interface PluginWorkView extends AView<'work'> {
  work: {
    id: string; project: string; agent: string; title: string
    detail: PixelDetail; recordedState: unknown; doing: string | null
    executing: boolean; association: string; updatedAt: string
    /** Where a run stands, or null when the row is a task or a block rather than a run. */
    runStanding: RunStanding | null
  }[]
  /** With ?agents= only: the ids asked that no agent has, in the order asked. Absent without ?agents=. */
  notAgents?: string[]
}

/**
 * GET /api/plugin-read/v1/roster: every person and every agent, with the fields of the people view that are stored as
 * they are. It works out nothing: no presence, no projects, no look and no scale. Ask the people view with ?agents= for
 * those of the agents you draw.
 */
export interface PluginRosterView extends AView<'roster'> {
  people: PluginPeopleView['people']
  agents: Pick<PluginPeopleView['agents'][number], 'kind' | 'id' | 'handle' | 'name' | 'role' | 'retired' | 'visitor' | 'startedBy' | 'createdAt'>[]
}

/**
 * GET /api/plugin-read/v1/online: of each agent on the roster, whether it is online, and nothing else (wave 13y round 66,
 * item 2). An agent is online when the people view draws its dot green in at least one project, or draws it grey
 * with the words "In a terminal": it is at work in one of the office's terminals. Every other agent is not online, and
 * so is every retired one. The rows are the roster's agents, in the roster's order.
 */
export interface PluginOnlineView extends AView<'online'> {
  agents: { id: string; online: boolean }[]
}

/** GET /api/plugin-read/v1/asleep: every agent asleep now, since when, and nothing else. */
export interface PluginAsleepView extends AView<'asleep'> {
  agents: { id: string; since: string }[]
}

// ============================================================================ requested agents' status

/** A read failure is distinct from an available reading with nothing recorded. Never stored. */
export type PluginStatusReading<T> = { available: true; value: T } | { available: false }

export interface PluginStatusFlow {
  record: { id: string; title: string }
  flow: { id: string; title: string | null } | null
  /** The last appended observation, not a guess at the next step. */
  lastStep: { does: string; outcome: string; at: string; atMs: number | null } | null
}

export interface PluginAgentStatus {
  id: string
  retired: boolean
  personal: { text: string; setAt: string | null; setBy: PluginParticipantRef | null } | null
  presence: PluginStatusReading<{ colour: 'green' | 'grey' | 'red'; word: string; says: string }>
  flow: PluginStatusReading<{
    /** Every unsettled run in the requested project, or with scope=home in the agent's home projects; no run is selected by recency. */
    runs: {
      /** Only recorded start timing. Null is not replaced with the record's creation time. */
      run: { id: string; title: string; startedAt: string | null; startedAtMs: number | null }
      /** The project the run is in, in a read with scope=home. A read of the requested project leaves it out. */
      project?: string
      standing: RunStanding
      flows: PluginStatusFlow[]
    }[]
  }>
}

/** GET /api/plugin-read/v1/status?agents=<id>,… . agents is required; empty explicitly reads nobody. */
export interface PluginStatusView extends AView<'status'> {
  /** The project asked from. With scope=home each agent is read in its home project, and each run names its own. */
  project: string
  agents: PluginAgentStatus[]
  notAgents: string[]
}

/** GET /api/plugin-read/v1/talk */
export interface PluginTalkView extends AView<'talk'> {
  /** Who wrote to whom and when, oldest first. Never the words. */
  messages: { id: string; project: string; at: string; from: PluginParticipantRef; to: PluginParticipantRef[] }[]
  /** Give this as `after` to read the messages that come after these. Null when there are none at all. */
  last: string | null
  /** True when more messages come after `last` than this answer held. */
  more: boolean
  /** What this answer could have held after `after`, what it held, and how many it left out. */
  subtraction: PluginLeftOutCounts
  /** The messages left out beyond the limit, by id. Read on with `after` to get them. */
  leftOutGroups: PluginLeftOutGroup<'message_limit'>[]
  /** Why this caller sees only the messages they sent or were sent, or null when they see every one. */
  refusal: string | null
  /**
   * The messages withdrawn since `withdrawnAfter`, by id, oldest withdrawal first: each one this caller would see were it
   * not withdrawn. Drop each one you hold. Without `withdrawnAfter` none is named, and `last` is where to begin: give
   * it as `withdrawnAfter` on every later read. A message withdrawn and then restored is not named, and is not read
   * again either when it is older than the `last` of the messages.
   */
  withdrawn: {
    ids: string[]
    /** Give this as `withdrawnAfter` to be told of the withdrawals that come after these. */
    last: string
    /** True when more withdrawals come after `last` than this answer named. */
    more: boolean
    /** What this answer could have named after `withdrawnAfter`, what it named, and how many it left out. All 0 without `withdrawnAfter`. */
    subtraction: PluginLeftOutCounts
    /** The withdrawals left out beyond the limit, by id. Read on with `withdrawnAfter` to be told of them. */
    leftOutGroups: PluginLeftOutGroup<'withdrawal_limit'>[]
  }
}

// ============================================================================ the slot's messages

/**
 * WHAT A PLUGIN'S PAGE MAY SAY TO THE SLOT, by window.parent.postMessage(message, '*'). src/shared/plugins.ts checks
 * every message against its schema, `pluginAsksTheSlot`, and says what each one does.
 */
export type PluginAsksTheSlot =
  | { interface: typeof PLUGIN_READ_INTERFACE; ask: 'ready'; answers?: 'bytes' | undefined }
  | {
      interface: typeof PLUGIN_READ_INTERFACE
      ask: 'read'
      id: string
      view: string
      query?: Record<string, string | number> | undefined
      tag?: string | undefined
    }

/** What the slot sends a plugin's page. */
export type TheSlotTellsAPlugin =
  | {
      interface: typeof PLUGIN_READ_INTERFACE
      kind: 'context'
      plugin: string
      page: string
      language: 'en' | 'zh'
      theme: 'light' | 'dark'
      reducedMotion: boolean
      project: string
      answers?: 'bytes' | undefined
    }
  | {
      /** The office answered: status is its HTTP status, body its JSON (null on 304), tag what to send next time. */
      interface: typeof PLUGIN_READ_INTERFACE
      kind: 'answer'
      id: string
      view: string
      status: number
      tag: string | null
      body: unknown
    }
  | {
      /** Wave 13y round 44: the HTTP body is transferred without decoding; only 304 has null bytes and type. */
      interface: typeof PLUGIN_READ_INTERFACE
      kind: 'bytes'
      id: string
      view: string
      status: number
      tag: string | null
      type: string | null
      bytes: ArrayBuffer | null
    }
  | {
      /** The slot did not ask the office, and says why in English. */
      interface: typeof PLUGIN_READ_INTERFACE
      kind: 'refused'
      id: string | null
      view: string | null
      why: 'not-understood' | 'not-a-view' | 'not-in-the-manifest' | 'already-asking' | 'could-not-ask'
      said: string
    }
  | {
      /**
       * The slot did not ask the office, because the read's path and query, as theTargetOfARead builds them, are `bytes`
       * long and the slot sends at most `limit`, which is READ_TARGET_LIMIT. This refusal alone carries `bytes` and
       * `limit` in place of `said` (round 52's fix).
       */
      interface: typeof PLUGIN_READ_INTERFACE
      kind: 'refused'
      id: string
      view: string
      why: 'too-long'
      bytes: number
      limit: number
    }
