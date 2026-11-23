// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DEPARTMENTS OF A PROJECT, AS THEY ARE READ. Wave 13s round 281, step 1 of departments and posts.
 *
 * Everything here is worked out from the stored records when they are read, and nothing here writes. The guard that
 * writes one is src/server/lib/grant/departments.ts.
 *
 * THE ONE PLACE THE LEVEL, THE TEAM COUNT AND THE LEADER ARE WORKED OUT: `theLevelOf` and `theLeaderOf`. A department with
 * no live sub-department that is not merged is called a team; any other is called a department, and its team count is
 * how many teams are under it at any depth. The leader is the recorded owner of its supervisor, read through
 * `theRecordedOwner`, and when there is none the answer says why and names nobody in its place.
 *
 * THE ONE PLACE A HEAD IS WORKED OUT: `theHeadOf`, from the leaders of the live departments directly under one, beside
 * `theLeaderOf`. The project part and the order of the top departments (O-b) are worked out in
 * `theDepartmentsOf` before the page is cut, so every page agrees. Nothing of either is stored.
 *
 * A CODE NAMES THE DEPARTMENT THAT HOLDS IT: the one holder that is not merged; otherwise each merged holder is followed
 * through mergedInto to its end. `theDepartmentACodeNames` is the one reader of that, which the board asks.
 */
import type { ParticipantRef } from '@shared/participants.ts'
import {
  DEPARTMENT_KIND,
  type AHeadsLeader,
  type BoardDepartment,
  type DepartmentLevel,
  type DepartmentNode,
  type DepartmentRead,
  type DepartmentRevision,
  type DepartmentState,
  type OneDepartment,
  type TheDepartments,
  type TheHead,
  type TheLeader,
  type TheProject,
} from '@shared/departments.ts'
import { isObject } from '@shared/secretary-duties-record.ts'
import { sqlite } from '../db/client.ts'
import { getWorkspace } from '../db/get-workspace.ts'
import { theOfficeOwner } from '../db/the-office-owner.ts'
import { theRecordedOwner } from './agent-owner.ts'
import { listRevisions } from './revisions.ts'
import { theAgentRowAnIdNames } from './the-agent-row-an-id-names.ts'

/** The sentence the list door gives where nobody has filed a department in the project. */
export const NOBODY_HAS_FILED_A_DEPARTMENT =
  'Nobody has filed a department in this project yet. The person files one by their own press on the departments ' +
  "page, or a secretary does with POST /api/departments on the person's words."

/** How many top departments one page of the list door gives, unless it asks for fewer or more. */
export const DEPARTMENTS_ON_A_PAGE = 25

/** How many revisions the one-department door gives. */
export const DEPARTMENT_REVISIONS_SHOWN = 50

/** One stored department, as read from its record. */
interface AStoredDepartment {
  id: string
  title: string
  codes: string[]
  nameEn: string | null
  nameZh: string | null
  doesEn: string | null
  doesZh: string | null
  parent: string | null
  supervisor: ParticipantRef | null
  state: DepartmentState
  mergedInto: string | null
  restsOn: string[]
}

/** A stored string field, or null where none is stored. */
const aString = (data: Record<string, unknown>, key: string): string | null => {
  const value = data[key]
  return typeof value === 'string' ? value : null
}

/** A stored list of strings, or an empty list. */
const strings = (data: Record<string, unknown>, key: string): string[] => {
  const value = data[key]
  return Array.isArray(value) ? value.filter((one: unknown): one is string => typeof one === 'string') : []
}

/** One record's data as a department. A state the guard never writes is a broken assumption, and says so. */
function asStored(row: { id: string; title: string; data: string | null }): AStoredDepartment {
  const parsed: unknown = row.data === null ? null : JSON.parse(row.data)
  const data = isObject(parsed) ? parsed : {}
  const state = data['state']
  if (state !== 'running' && state !== 'resting' && state !== 'merged') {
    throw new Error(`Department ${row.id} stores the state ${JSON.stringify(state)}, which no department is written with.`)
  }
  const supervisor = data['supervisor']
  return {
    id: row.id,
    title: row.title,
    codes: strings(data, 'codes'),
    nameEn: aString(data, 'nameEn'),
    nameZh: aString(data, 'nameZh'),
    doesEn: aString(data, 'doesEn'),
    doesZh: aString(data, 'doesZh'),
    parent: aString(data, 'parent'),
    supervisor:
      isObject(supervisor) && supervisor['kind'] === 'agent' && typeof supervisor['id'] === 'string'
        ? { kind: 'agent', id: supervisor['id'] }
        : null,
    state,
    mergedInto: aString(data, 'mergedInto'),
    restsOn: strings(data, 'restsOn'),
  }
}

/**
 * WHO LEADS A DEPARTMENT WITH THIS SUPERVISOR: its recorded owner, read from the registry now. Each other answer says
 * why there is none and names nobody in its place: not the agent's starter, and not the person.
 */
export function theLeaderOf(supervisor: ParticipantRef | null): TheLeader {
  if (supervisor === null) {
    return { state: 'no-supervisor', says: 'No supervisor is recorded for this department, so it has no leader to read.' }
  }
  const row = theAgentRowAnIdNames(supervisor.id)
  if (row === null) {
    return {
      state: 'supervisor-not-in-the-registry',
      says: `No agent in the registry has the id ${supervisor.id}, so its leader cannot be read.`,
    }
  }
  const owner = theRecordedOwner(row)
  if (owner.state === 'absent') {
    return { state: 'owner-not-recorded', says: `Nobody is recorded as the owner of ${row.handle}, so this department's leader is not recorded.` }
  }
  if (owner.state === 'broken') {
    return { state: 'owner-unreadable', says: `The owner stored for ${row.handle} cannot be read, so this department's leader is not known.` }
  }
  const handle = owner.owner.kind === 'agent' ? (theAgentRowAnIdNames(owner.owner.id)?.handle ?? null) : null
  return { state: 'recorded', leader: owner.owner, handle }
}

/** The sentence a head gives where no live department directly under it records a leader. */
export const NO_LINE_HAS_A_LEADER =
  'No live department directly under this one has a recorded leader, so it has no head to read. Each says why in its own leader.'

/**
 * WHO HEADS A DEPARTMENT, from the leaders of the live departments directly under it, given in the order they were
 * filed: null where there are none. Only a recorded leader counts, compared by its kind and id; a department whose
 * leader is not recorded is left out, and shows its own leader state. One leader is agreed, naming the departments it
 * came from; more than one is the lines disagree, each leader in the order it was first read; none is no line has a
 * leader, with the sentence that says so.
 */
export function theHeadOf(lines: readonly { id: string; leader: TheLeader }[]): TheHead | null {
  if (lines.length === 0) return null
  const leaders: AHeadsLeader[] = []
  for (const line of lines) {
    if (line.leader.state !== 'recorded') continue
    const { leader, handle } = line.leader
    const same = leaders.find((one) => one.leader.kind === leader.kind && one.leader.id === leader.id)
    if (same === undefined) leaders.push({ leader, handle, from: [line.id] })
    else same.from.push(line.id)
  }
  const [first] = leaders
  if (first === undefined) return { state: 'no-line-has-a-leader', says: NO_LINE_HAS_A_LEADER }
  if (leaders.length === 1) return { state: 'agreed', ...first }
  return { state: 'the-lines-disagree', leaders }
}

/** What a code names: one department, more than one where merged holders end in different places, or none. */
export type TheDepartmentACodeNames =
  | { state: 'held'; department: DepartmentRead }
  | { state: 'held-by-several'; departments: string[] }
  | { state: 'not-held' }

/** The departments of one project, read once, and everything worked out from them. */
export interface TheDepartmentsRead {
  /** Every live department, in the order they were filed. */
  all: readonly AStoredDepartment[]
  /** One department as the doors read it, or null where it is not a live department of this project. */
  read(id: string): DepartmentRead | null
  /** The live departments directly under one, merged ones too, in the order they were filed. */
  under(id: string): readonly AStoredDepartment[]
  /** The departments at the top: with no parent, or with a parent that is not a live department of this project. */
  top(): readonly AStoredDepartment[]
  /** One department's head, worked out once: null where no live department is directly under it. */
  head(id: string): TheHead | null
  /** How many teams some departments hold between them, each counted as one where it is a team. Merged ones count none. */
  teamsIn(some: readonly AStoredDepartment[]): number
  /** The department a code names. */
  aCodeNames(code: string): TheDepartmentACodeNames
}

/**
 * EVERY LIVE DEPARTMENT OF A PROJECT, READ IN ONE STATEMENT, with the level, team count and leader of each worked out
 * when asked. A loop of parents or of merges is a broken assumption: the guard refuses every write that would make one.
 */
export function readTheDepartments(workspaceId: string): TheDepartmentsRead {
  const all = (
    sqlite
      .prepare('SELECT id, title, data FROM records WHERE workspace_id = ? AND kind = ? AND deleted_at IS NULL ORDER BY created_at, id')
      .all(workspaceId, DEPARTMENT_KIND) as { id: string; title: string; data: string | null }[]
  ).map(asStored)
  const byId = new Map(all.map((one) => [one.id, one]))
  const children = new Map<string, AStoredDepartment[]>()
  for (const one of all) {
    if (one.parent === null || !byId.has(one.parent)) continue
    children.set(one.parent, [...(children.get(one.parent) ?? []), one])
  }
  const under = (id: string): readonly AStoredDepartment[] => children.get(id) ?? []

  const liveUnder = (id: string): readonly AStoredDepartment[] => under(id).filter((one) => one.state !== 'merged')

  // THE LEVEL AND TEAM COUNT, worked out once for each department. A merged one under it is not counted.
  const levels = new Map<string, { level: DepartmentLevel; teams: number | null }>()
  const theTeamsIn = (some: readonly AStoredDepartment[], path: ReadonlySet<string>): number =>
    some.filter((one) => one.state !== 'merged').reduce((sum, one) => sum + (theLevelOf(one.id, path).teams ?? 1), 0)
  const theLevelOf = (id: string, path: ReadonlySet<string> = new Set()): { level: DepartmentLevel; teams: number | null } => {
    const known = levels.get(id)
    if (known !== undefined) return known
    if (path.has(id)) throw new Error(`Department ${id} is under itself: its stored parents make a loop.`)
    const live = liveUnder(id)
    const worked: { level: DepartmentLevel; teams: number | null } =
      live.length === 0 ? { level: 'team', teams: null } : { level: 'department', teams: theTeamsIn(live, new Set([...path, id])) }
    levels.set(id, worked)
    return worked
  }

  // THE LEADER AND THE HEAD, each worked out once for each department.
  const leaders = new Map<string, TheLeader>()
  const theLeaderOfOne = (one: AStoredDepartment): TheLeader => {
    const known = leaders.get(one.id)
    if (known !== undefined) return known
    const worked = theLeaderOf(one.supervisor)
    leaders.set(one.id, worked)
    return worked
  }
  const heads = new Map<string, TheHead | null>()
  const head = (id: string): TheHead | null => {
    if (heads.has(id)) return heads.get(id) ?? null
    const worked = theHeadOf(liveUnder(id).map((one) => ({ id: one.id, leader: theLeaderOfOne(one) })))
    heads.set(id, worked)
    return worked
  }

  const read = (id: string): DepartmentRead | null => {
    const one = byId.get(id)
    if (one === undefined) return null
    const { level, teams } = theLevelOf(id)
    const handle = one.supervisor === null ? null : (theAgentRowAnIdNames(one.supervisor.id)?.handle ?? null)
    return {
      id: one.id,
      title: one.title,
      codes: one.codes,
      name: { en: one.nameEn, zh: one.nameZh },
      does: { en: one.doesEn, zh: one.doesZh },
      parent: one.parent,
      supervisor: one.supervisor === null ? null : { ...one.supervisor, handle },
      state: one.state,
      mergedInto: one.mergedInto,
      restsOn: one.restsOn,
      level,
      teams,
      leader: theLeaderOfOne(one),
      head: head(one.id),
    }
  }

  // WHERE A MERGED DEPARTMENT ENDED: followed through mergedInto while the next is a live department here.
  const theEndOf = (start: AStoredDepartment): AStoredDepartment => {
    const seen = new Set<string>()
    let at = start
    while (at.state === 'merged' && at.mergedInto !== null) {
      if (seen.has(at.id)) throw new Error(`Department ${start.id} was merged in a loop: its stored merges come back to ${at.id}.`)
      seen.add(at.id)
      const next = byId.get(at.mergedInto)
      if (next === undefined) break
      at = next
    }
    return at
  }

  const aCodeNames = (code: string): TheDepartmentACodeNames => {
    const holders = all.filter((one) => one.codes.includes(code))
    const live = holders.filter((one) => one.state !== 'merged')
    const ends = live.length > 0 ? live : holders.map(theEndOf)
    const ids = [...new Set(ends.map((one) => one.id))]
    if (ids.length === 0) return { state: 'not-held' }
    if (ids.length > 1) return { state: 'held-by-several', departments: ids }
    const department = read(ids[0] as string)
    if (department === null) throw new Error(`Department ${String(ids[0])} holds the code ${code} and could not be read.`)
    return { state: 'held', department }
  }

  return {
    all,
    read,
    under,
    top: () => all.filter((one) => one.parent === null || !byId.has(one.parent)),
    head,
    teamsIn: (some) => theTeamsIn(some, new Set()),
    aCodeNames,
  }
}

/** The department a code names in a project, read now. */
export function theDepartmentACodeNames(workspaceId: string, code: string): TheDepartmentACodeNames {
  return readTheDepartments(workspaceId).aCodeNames(code)
}

/** What a code names, as the board shows it beside a line. */
export function theBoardDepartment(named: TheDepartmentACodeNames): BoardDepartment {
  if (named.state === 'not-held') return { state: 'not-held' }
  if (named.state === 'held-by-several') return { state: 'held-by-several', ids: named.departments }
  const { id, name, level, teams } = named.department
  return { state: 'held', id, name, level, teams }
}

/** One department in the tree, with every department under it. */
function asNode(departments: TheDepartmentsRead, id: string): DepartmentNode {
  const read = departments.read(id)
  if (read === null) throw new Error(`Department ${id} is in the tree and could not be read.`)
  return { ...read, subDepartments: departments.under(id).map((one) => asNode(departments, one.id)) }
}

/**
 * WHERE A TOP DEPARTMENT SITS IN THE ORDER O-b: first an agreed head, then a head whose lines disagree, then no head,
 * which is a department with nothing live under it or none of whose lines records a leader.
 */
function theRankOf(head: TheHead | null): number {
  if (head === null || head.state === 'no-line-has-a-leader') return 2
  return head.state === 'agreed' ? 0 : 1
}

/**
 * TWO AGREED HEADS BY THE HEAD'S HANDLE, compared without case. A head with no handle, such as the person, comes after
 * every head with one. Equal handles, and two heads that are not both agreed, are a tie.
 */
function byTheHeadsHandle(a: TheHead | null, b: TheHead | null): number {
  if (a?.state !== 'agreed' || b?.state !== 'agreed') return 0
  if (a.handle === null || b.handle === null) return a.handle === b.handle ? 0 : a.handle === null ? 1 : -1
  const [left, right] = [a.handle.toLowerCase(), b.handle.toLowerCase()]
  return left < right ? -1 : left > right ? 1 : 0
}

/**
 * THE TOP DEPARTMENTS IN THE ORDER O-b: by the rank of their head, agreed heads by the head's handle, and each tie in
 * the order filed. The sort is stable, so the order filed holds every tie.
 */
function theTopInOrder(departments: TheDepartmentsRead): AStoredDepartment[] {
  return [...departments.top()].sort((a, b) => {
    const [left, right] = [departments.head(a.id), departments.head(b.id)]
    return theRankOf(left) - theRankOf(right) || byTheHeadsHandle(left, right)
  })
}

/**
 * THE PROJECT THE DEPARTMENTS BELONG TO: the workspace's title, the office owner, and how many top departments are not
 * merged and how many teams they hold. A project the door was asked about that is not in the office is a broken
 * assumption, and says so.
 */
function theProjectOf(workspaceId: string, departments: TheDepartmentsRead): TheProject {
  const workspace = getWorkspace(workspaceId)
  if (workspace === null) throw new Error(`The project ${workspaceId} is not in this office's registry, and its departments were read.`)
  const live = departments.top().filter((one) => one.state !== 'merged')
  return { title: workspace.title, owner: { kind: 'person', id: theOfficeOwner().id }, departments: live.length, teams: departments.teamsIn(live) }
}

/** One page of the top departments of a project in the order O-b, each with its tree, or that nobody has filed one. */
export function theDepartmentsOf(workspaceId: string, page: { offset: number; limit: number }): TheDepartments {
  const departments = readTheDepartments(workspaceId)
  const project = theProjectOf(workspaceId, departments)
  if (departments.all.length === 0) {
    return { project, departments: null, nobodyFiled: NOBODY_HAS_FILED_A_DEPARTMENT, total: 0, offset: page.offset, limit: page.limit }
  }
  const top = theTopInOrder(departments)
  return {
    project,
    departments: top.slice(page.offset, page.offset + page.limit).map((one) => asNode(departments, one.id)),
    nobodyFiled: null,
    total: top.length,
    offset: page.offset,
    limit: page.limit,
  }
}

/** One department, the departments directly under it, and its history: each revision, who wrote it and on whose words. */
export function oneDepartment(workspaceId: string, id: string): OneDepartment {
  const departments = readTheDepartments(workspaceId)
  const department = departments.read(id)
  if (department === null) throw new Error(`Department ${id} is not a live department of ${workspaceId}, and the door found it there.`)
  const listing = listRevisions(id, DEPARTMENT_REVISIONS_SHOWN)
  const revisions = listing.revisions.map(
    (one): DepartmentRevision => ({
      seq: one.seq,
      op: one.op,
      at: one.at,
      who: { actorType: one.who.actorType, actorId: one.who.actorId, agent: one.who.resolvedAgentId },
      onTheWordsOf: one.warrant === null ? null : { words: one.warrant.words, saidBy: one.warrant.saidBy, when: one.warrant.when },
    }),
  )
  return {
    department,
    subDepartments: departments
      .under(id)
      .map((one) => departments.read(one.id))
      .filter((one): one is DepartmentRead => one !== null),
    history: { count: listing.count, revisions, truncated: listing.truncated },
  }
}
