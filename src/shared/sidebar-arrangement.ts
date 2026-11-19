// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from './i18n.ts'
import { RAIL_WORD_KEYS } from './surfaces.ts'
/** The shipped pages are written here once. Every navigation reader uses the effective arrangement. */
export interface SidebarArrangement { groups: readonly { key: string; keys: readonly string[] }[] }
export const SHIPPED_SIDEBAR = {
  groups: [
    { key: 'all', keys: [
      'home',
      'decisions',
      'yourWords',
      'notes',
      'myNotes',
      'work',
      'schedule',
      'resources',
      'plans',
      'horizons',
      'counters',
      'checklists',
      'flows',
      'bundles',
      'records',
    ] },
    { key: 'project', keys: [
      'modules',
      'pipeline',
      'board',
      'mergequeue',
      'findings',
      'ideas',
      'shelved',
    ] },
    { key: 'agents', keys: [
      'working',
      'interrupted',
      'agents',
      'tasksToTake',
      'roles',
      'casting',
      'toolset',
      'honourBoard',
    ] },
    { key: 'office', keys: [
      'embassy',
      'regulations',
      'gates',
      'readiness',
      'signingPackages',
      'versionHistory',
    ] },
    { key: 'developer', keys: [
      'sessions',
      'terminals',
      'usage',
      'queries',
      'worlds',
      'placeholders',
      'sheet',
      'officeControls',
    ] },
  ],
} as const satisfies SidebarArrangement

export type SidebarGroupKey = (typeof SHIPPED_SIDEBAR.groups)[number]['key']
export const SIDEBAR_CAPTION_KEYS = { all: 'nav.allProjects', project: 'nav.thisProject', agents: 'nav.group.agents', office: 'nav.group.office', developer: 'nav.group.developer' } as const
/** The seven page keys whose surface names differ are written here once and checked against the rail. */
export function sidebarSurface(key: string): string {
  const exceptions: Record<string, string> = { tasksToTake: 'rail.tasks', yourWords: 'rail.yourwords', honourBoard: 'rail.honour', signingPackages: 'rail.signingpackages', versionHistory: 'rail.versionhistory', officeControls: 'rail.officecontrols', myNotes: 'rail.mynotes' }
  return exceptions[key] ?? 'rail.' + key
}
/** Problems and reminders name the page or group with the same editable word its rail draws. */
export function sidebarName(key: string, group = false): string {
  if (group && Object.hasOwn(SIDEBAR_CAPTION_KEYS, key)) return t(SIDEBAR_CAPTION_KEYS[key as SidebarGroupKey])
  const surface = sidebarSurface(key)
  return Object.hasOwn(RAIL_WORD_KEYS, surface) ? t(RAIL_WORD_KEYS[surface as keyof typeof RAIL_WORD_KEYS]) : key
}
/** These reasons are shared by the check and the visible explanation of a narrowed picker. */
export const SIDEBAR_RULE_REASONS = {
  get all() { return t('sidebarSetting.ruleReason.all') },
  get project() { return t('sidebarSetting.ruleReason.project') },
  get developer() { return t('sidebarSetting.ruleReason.developer') },
}
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
/** Preview, Apply and recovery share this check. Reminders never stop a valid edit. */
export function problemsWithTheArrangement(arrangement: unknown): { problems: string[]; reminders: string[] } {
  const problems: string[] = [], reminders: string[] = []
  if (!isObject(arrangement) || Object.keys(arrangement).some(key => key !== 'groups') || !Array.isArray(arrangement.groups)) {
    return { problems: ['The sidebar arrangement must contain only its list of groups.'], reminders }
  }
  const groups: { key: string; keys: string[] }[] = []
  for (const [place, group] of arrangement.groups.entries()) {
    if (!isObject(group) || Object.keys(group).some(key => key !== 'key' && key !== 'keys') || typeof group.key !== 'string' || !Array.isArray(group.keys) || group.keys.some(key => typeof key !== 'string')) {
      problems.push(`Sidebar group ${place + 1} must name its group and its list of page keys only.`)
    } else groups.push(group as { key: string; keys: string[] })
  }
  if (groups.length !== arrangement.groups.length) return { problems, reminders }
  if (JSON.stringify(groups.map(group => group.key)) !== JSON.stringify(SHIPPED_SIDEBAR.groups.map(group => group.key))) {
    problems.push(`Keep the five sidebar groups in this order: ${SHIPPED_SIDEBAR.groups.map(group => sidebarName(group.key, true)).join(', ')}.`)
  }
  const original = new Map(SHIPPED_SIDEBAR.groups.flatMap(group => group.keys.map(key => [key, group.key] as const))) as ReadonlyMap<string, string>
  const counts = new Map<string, number>()
  for (const group of groups) {
    for (const key of group.keys) {
      counts.set(key, (counts.get(key) ?? 0) + 1)
      const home = original.get(key)
      if (home === undefined) problems.push(key === 'settings' || key === 'messages'
        ? `${sidebarName(key)} stands in no sidebar group and cannot be placed in ${sidebarName(group.key, true)}.`
        : `${sidebarName(key)} is not a shipped sidebar page and cannot be placed in ${sidebarName(group.key, true)}.`)
      // A page may leave All projects and come back, but a page shipped elsewhere may not come in: its caption says it
      // reads every project. The top bar reads each page's own mark, not this group, as decided in wave 13r
      // round 5.
      if (home !== undefined && home !== 'all' && group.key === 'all') {
        problems.push(`${sidebarName(key)} cannot move into ${sidebarName('all', true)}. ${SIDEBAR_RULE_REASONS.all}`)
      }
      if (home !== undefined && home !== 'project' && group.key === 'project') {
        problems.push(`${sidebarName(key)} cannot move to ${sidebarName('project', true)}. ${SIDEBAR_RULE_REASONS.project}`)
      }
      if (home === 'developer' && group.key !== 'developer') problems.push(`${sidebarName(key)} must stay in ${sidebarName('developer', true)}. ${SIDEBAR_RULE_REASONS.developer}`)
      if (home !== undefined && home !== 'developer' && group.key === 'developer') reminders.push(`${sidebarName(key)} will be in ${sidebarName('developer', true)}. Normal mode will not show it.`)
    }
    if (group.keys.length === 0) reminders.push(`${sidebarName(group.key, true)} will be empty. Its caption and category page will have no pages.`)
  }
  for (const key of original.keys()) {
    if (!counts.has(key)) problems.push(`${sidebarName(key)} is required in the sidebar and cannot be left out.`)
  }
  for (const [key, count] of counts) if (count > 1) problems.push(`${sidebarName(key)} appears ${count} times. Each sidebar page must appear exactly once.`)
  return { problems, reminders }
}
export interface SidebarPlace { group: string; place: number }
export interface SidebarMove { key: string; from: SidebarPlace; to: SidebarPlace }
/** Places start at one, as the person reads them. A shift caused by another page is a move too. */
export function movesBetween(before: SidebarArrangement, after: unknown): SidebarMove[] {
  // A structurally unreadable preview still returns its problems, with no invented places.
  if (!isObject(after) || !Array.isArray(after.groups) || after.groups.some(group => !isObject(group) || typeof group.key !== 'string' || !Array.isArray(group.keys) || group.keys.some(key => typeof key !== 'string'))) return []
  const locations = (value: SidebarArrangement) => new Map(value.groups.flatMap(group => group.keys.map((key, index) => [key, { group: group.key, place: index + 1 }] as const)))
  const previous = locations(before), next = locations(after as unknown as SidebarArrangement)
  return [...next].flatMap(([key, to]) => {
    const from = previous.get(key)
    return from !== undefined && (from.group !== to.group || from.place !== to.place) ? [{ key, from, to }] : []
  })
}
