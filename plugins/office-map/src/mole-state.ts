// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { PixelState } from '../../../src/shared/plugin-read.ts'
import { coherentFacts, workGroup, type Occupant, type WorkRow } from './model.ts'
import type { Standing, StandingLook } from './appearance.ts'
import { gaitFrame, type MovingContact } from './walks.ts'

const priority: PixelState[] = ['attention', 'working', 'handoff', 'paused', 'waiting', 'unknown', 'completed']
export const confirmed = (row: WorkRow): boolean => row.detail === 'completed' && row.runStanding === 'closed'
/** The most actionable supplied work wins; every row remains in the read details.
 * A task declaration or unchecked closure cannot establish the done badge or celebration. */
export function moleGroup(rows: WorkRow[], available = true): PixelState {
  if (!available || !rows.length) return 'unknown'
  const groups = rows.map(row => workGroup(row) === 'completed' && !confirmed(row) ? 'unknown' : workGroup(row))
  return priority.find(group => groups.includes(group)) ?? 'unknown'
}
export const badges = {
  working: { symbol: '●', en: 'Working', zh: '工作', colour: '#5b916b' },
  handoff: { symbol: '◇', en: 'Checking', zh: '交付', colour: '#9b79ae' },
  waiting: { symbol: '△', en: 'Waiting', zh: '等待', colour: '#ba9457' },
  paused: { symbol: 'Ⅱ', en: 'Paused', zh: '暂停', colour: '#81938e' },
  attention: { symbol: '!', en: 'Handle', zh: '处理', colour: '#c76e63' },
  completed: { symbol: '✓', en: 'Done', zh: '完成', colour: '#68a4ae' },
  unknown: { symbol: '?', en: 'Unsure', zh: '待定', colour: '#92939b' },
} as const
export function moleSprite(look: StandingLook, rows: WorkRow[], still: boolean, walk?: MovingContact, wave = false, available = true, place: 'desk' | 'play' | 'sleep' = 'desk', sleepAvailable = false): string {
  if (place === 'sleep') return sleepAvailable || look === 'tuft' ? 'sleep-' + look : 'stand-' + look
  if (still) return 'stand-' + look
  if (walk) return `walk-${look}-${gaitFrame(walk.elapsed)}`
  if (wave) return 'wave-' + look
  const group = moleGroup(rows, available)
  return (group === 'handoff' ? 'carry-' : group === 'completed' ? 'cheer-' : 'stand-') + look
}

/** Missing or incoherent reads cannot establish that an online agent is idle. */
export function idleEligible(occupant: Occupant, workAvailable: boolean): boolean {
  if (!workAvailable || !occupant.facts || !coherentFacts(occupant) || !Number.isSafeInteger(occupant.facts.people.revision) || occupant.facts.people.revision! < 1) return false
  return occupant.work.every(row => !row.executing && (row.runStanding === 'closed' || row.runStanding === 'closed unchecked' || row.runStanding === 'superseded'))
}

/** The two existing cast gestures alternate while a pair is together. */
export function playPose(standing: Standing, phase: number) {
  return { kind: 'play' as const, sprite: `${phase % 2 ? 'cheer' : 'wave'}-${standing.look}`, recipe: standing.recipe, gesture: phase % 2 ? 'cheer' : 'wave' }
}

/** One visible paper bundle travels between the pair on a shallow arc, then returns. */
export function paperExchange(elapsed: number, shift = 0): { x: number; y: number } {
  const step = Math.max(0, elapsed) % 2400 / 1200
  const progress = step <= 1 ? step : 2 - step
  return { x: 24 + shift + 48 * progress, y: -34 - 16 * Math.sin(Math.PI * progress) }
}
