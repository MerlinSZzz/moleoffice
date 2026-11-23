// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DEPARTMENT, AS THE SERVER AND THE PAGE BOTH READ IT. Wave 13s round 281, step 1 of departments and posts.
 *
 * A department is a record of the kind `department`. The person files and changes it by their own press, or a secretary
 * does on the person's words (src/server/lib/grant/departments.ts). A department may sit under another of its project,
 * and a sub-department may have its own, to any depth.
 *
 * THE LEVEL WORD IS WORKED OUT, NEVER STORED. A department with no live sub-department that is not merged is called a
 * team; any other is called a department. In code every one is a department: team is only the word it is called by, and
 * how many of them a department holds (src/server/lib/departments.ts works both out in one place).
 *
 * THE LEADER IS WORKED OUT, NEVER STORED: it is the recorded owner of the supervisor, read from the registry when the
 * department is read.
 *
 * THE HEAD AND THE PROJECT PART ARE WORKED OUT, NEVER STORED. A department's head is worked out
 * from the leaders of the live departments directly under it; the project part from the workspace, the office owner
 * and the departments as they are read.
 */
import type { WordKey } from './i18n.ts'
import type { ParticipantRef } from './participants.ts'
import type { PanelRecord } from './types.ts'

export const DEPARTMENT_KIND = 'department'

/** A department's states. A merged one names the department it was merged into. */
export const DEPARTMENT_STATES = ['running', 'resting', 'merged'] as const
export type DepartmentState = (typeof DEPARTMENT_STATES)[number]

/** The two words a department is called by: team with no live, unmerged sub-department, department otherwise. */
export const DEPARTMENT_LEVELS = ['department', 'team'] as const
export type DepartmentLevel = (typeof DEPARTMENT_LEVELS)[number]

/**
 * THE FIELDS A DEPARTMENT IS WRITTEN WITH, in the order a warrant's binding writes them. A write through the department
 * door replaces these and keeps every other key the record holds.
 */
export const DEPARTMENT_FIELDS = ['codes', 'nameEn', 'nameZh', 'doesEn', 'doesZh', 'parent', 'supervisor', 'state', 'mergedInto', 'restsOn'] as const
export type DepartmentField = (typeof DEPARTMENT_FIELDS)[number]

/** The longest code, in characters. */
export const A_CODE_AT_MOST = 100

/** The longest name, in characters. A name is one line. */
export const A_NAME_AT_MOST = 200

/** The longest description of what a department does, in characters. */
export const WHAT_IT_DOES_AT_MOST = 2000

/**
 * THE MOST TOP DEPARTMENTS ONE PAGE OF GET /api/departments GIVES. The door refuses a larger limit, and the departments
 * page asks for this many when it offers the departments a department may sit under.
 */
export const DEPARTMENTS_ON_A_PAGE_AT_MOST = 100

/** A department's fields as stored. */
export interface DepartmentData {
  codes?: string[]
  nameEn?: string
  nameZh?: string
  doesEn?: string
  doesZh?: string
  parent?: string
  supervisor?: ParticipantRef
  state: DepartmentState
  mergedInto?: string
  restsOn?: string[]
}

/** The word a level is called by, in the reader's language. */
export function theLevelWord(level: DepartmentLevel): WordKey {
  return level === 'team' ? 'department.level.team' : 'department.level.department'
}

/**
 * WHO LEADS A DEPARTMENT: the recorded owner of its supervisor. Each other state says why there is none, and names
 * nobody in its place.
 */
export type TheLeader =
  | { state: 'recorded'; leader: ParticipantRef; handle: string | null }
  | { state: 'no-supervisor'; says: string }
  | { state: 'supervisor-not-in-the-registry'; says: string }
  | { state: 'owner-not-recorded'; says: string }
  | { state: 'owner-unreadable'; says: string }

/** One leader a head names, with the departments directly under it that it was read from, in the order they were filed. */
export interface AHeadsLeader {
  leader: ParticipantRef
  handle: string | null
  from: string[]
}

/**
 * WHO HEADS A DEPARTMENT, worked out from the leaders of the live departments directly under it. Only a recorded leader
 * counts: one whose leader is not recorded is left out, and shows its own leader state. Agreed where every one with a
 * recorded leader shares it; the lines disagree where they name more than one, each with the departments behind it, in
 * the order each was first read; and no line has a leader where none of them records one.
 */
export type TheHead =
  | ({ state: 'agreed' } & AHeadsLeader)
  | { state: 'the-lines-disagree'; leaders: AHeadsLeader[] }
  | { state: 'no-line-has-a-leader'; says: string }

/**
 * THE PROJECT, as the departments page draws it above the top departments: the workspace's title, the office owner, how
 * many top departments are not merged, and how many teams they hold, each counted as one team where it is one.
 */
export interface TheProject {
  title: string
  owner: { kind: 'person'; id: string }
  departments: number
  teams: number
}

/** One department as the doors read it. */
export interface DepartmentRead {
  id: string
  title: string
  codes: string[]
  /** Each name in its own language, or null where none is recorded. One is never made from the other. */
  name: { en: string | null; zh: string | null }
  does: { en: string | null; zh: string | null }
  parent: string | null
  supervisor: (ParticipantRef & { handle: string | null }) | null
  state: DepartmentState
  mergedInto: string | null
  restsOn: string[]
  level: DepartmentLevel
  /** How many teams are under it at any depth, or null for a team. */
  teams: number | null
  leader: TheLeader
  /** Null where no live department is directly under it. */
  head: TheHead | null
}

/** One department in the tree, with the departments under it. */
export interface DepartmentNode extends DepartmentRead {
  subDepartments: DepartmentNode[]
}

/**
 * What GET /api/departments answers: one page of the top departments, each with its tree, or that none is filed, and the
 * project they belong to, the same on every page and answered whether or not one is filed.
 */
export interface TheDepartments {
  project: TheProject
  departments: DepartmentNode[] | null
  /** Null where a department is filed; otherwise the sentence that nobody has filed one in this project. */
  nobodyFiled: string | null
  /** How many top departments there are, on every page. */
  total: number
  offset: number
  limit: number
}

/** One change of a department, as its history shows it. */
export interface DepartmentRevision {
  seq: number
  op: string
  at: string
  who: { actorType: string; actorId: string; agent: string | null }
  /** The person's words the change was made on, or null where it was made without them. */
  onTheWordsOf: { words: string; saidBy: string; when: string } | null
}

/** What GET /api/departments/:id answers. */
export interface OneDepartment {
  department: DepartmentRead
  subDepartments: DepartmentRead[]
  history: { count: number; revisions: DepartmentRevision[]; truncated: boolean }
}

/**
 * What POST /api/departments and PUT /api/departments/:id answer: the department as GET /api/departments/:id reads it,
 * what the write did, and the record. `nothingWritten` says why a write that changed nothing stored nothing.
 */
export interface ADepartmentWritten extends OneDepartment {
  written: 'created' | 'changed' | 'nothing changed'
  record: PanelRecord
  nothingWritten?: string
}

/**
 * THE DEPARTMENT A LINE'S CODE NAMES, on the project board: held, with the department's id, names, level and team count;
 * held by more than one merged department that ended in different places; or held by none.
 */
export type BoardDepartment =
  | { state: 'held'; id: string; name: { en: string | null; zh: string | null }; level: DepartmentLevel; teams: number | null }
  | { state: 'held-by-several'; ids: string[] }
  | { state: 'not-held' }
