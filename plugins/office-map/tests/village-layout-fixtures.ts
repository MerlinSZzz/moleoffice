// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { VillageRoster } from '../src/village-layout.ts'

const time = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 1000).toISOString()
/** Generated data only. The first sixteen people occupy six recorded groups.
 * Later arrivals include both new groups and growth of old groups.
 */
export function villageRoster(count: number, mode: 'mixed' | 'singletons' | 'one-team' = 'mixed'): VillageRoster {
  const people: VillageRoster['people'][number][] = [], groups = new Map<string, VillageRoster['groups'][number]>()
  const first = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]
  const names = ['Team A', 'Team B', 'Review', 'Leadership', 'Secretary', 'Welcome']
  for (let i = 0; i < count; i++) {
    const n = mode === 'singletons' ? i : mode === 'one-team' ? 0 : i < 16 ? first[i]! : i % 31 === 0 ? 0 : 6 + Math.floor((i - 16) / 12)
    const group = `group-${n}`
    if (!groups.has(group)) groups.set(group, { id: group, label: mode === 'singletons' ? `Team ${n + 1}` : names[n] ?? `Team ${n + 1}`, createdAt: time(i) })
    people.push({ id: `person-${String(i).padStart(5, '0')}`, group, createdAt: time(i) })
  }
  return { groups: [...groups.values()], people }
}

/** Construct a team that is enclosed before its next member arrives. */
export function overflowRoster(count = 100): VillageRoster {
  const input = structuredClone(villageRoster(count, 'singletons'))
  const groups = [...input.groups], people = [...input.people]
  // Four early members fill the first A03. Unrelated groups fill every other
  // home before the final member arrives and needs an annex.
  for (const i of [1, 2, 3, count - 1]) people[i] = { ...people[i]!, group: 'group-0' }
  return { groups: groups.filter(g => people.some(p => p.group === g.id)), people }
}
