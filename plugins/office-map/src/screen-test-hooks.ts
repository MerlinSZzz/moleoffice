// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Facts } from './contracts.ts'
import type { ActionRuntime } from './action-runtime.ts'
/** Opt-in hooks supplied only by the generated screen fixture shell, before the map loads. */
export interface ScreenTestHooks {
  hold: boolean
  selection: string[]
  candidates?: string[]
  camera?: unknown
  mode?: string
  facts?: Facts
  renderedFacts?: Facts
  release?: () => void
  refresh?: () => void
  /** Made-up screen fixtures can add obstacles to the current navigation geometry. */
  navigation?: () => import('./geometry.ts').Layout | null
  setCamera?: (zoom: number) => void
  idleActors?: import('./walks.ts').IdleActor[]
  /** Every mole's drawn body in the frame of the last idleActors, the ones out on an outing where they are. */
  idleBodies?: { id: string; out: boolean; rect: import('./viewport.ts').Rect }[]
  idleRoute?: unknown
  /** The last idle turn as the page planned it. Its `meeting` is the facility of the current outing, as
   * `{ room, facility }`, or `{ none: <the reason> }`, and is absent while no outing is planned. Its `stays`
   * maps the key of each mole of the turn's group that does not set out to the reason, such as
   * `no way round the desk`; it is empty when every one may go, and absent while no turn is planned. */
  idleDebug?: unknown
  actions?: Pick<ActionRuntime, 'snapshot' | 'evidence'>
  /** Where the map draws a mole that is not walking, its depth, and the action it is bound to, if any:
   * the drawing's own answer, so a picture can be checked against what was drawn and not against a seat. */
  drawnAt?: (key: string) => { point: { x: number; y: number }; depth: number | null; action: string | null; desk?: { x: number; y: number; width: number; height: number; depth: number } | null; facility?: { room: string; index: number; activity: string; pose: string } } | null
  /** The layout the map draws now. While a new one waits for the trips underway, this is the old one. */
  layout?: import('./geometry.ts').Layout
  /** Every mole in the last painted frame, where it was painted, and whether it was painted walking; `body` is the
   * box the motion worker checks for it at that point, null while its bounds are unknown, and `plate` the plate
   * drawn for it in that frame, or null when none is drawn. */
  paintedActors?: { key: string; point: { x: number; y: number }; walking: boolean; body: import('./viewport.ts').Rect | null; plate: import('./viewport.ts').Rect | null }[]
  /** The contact walks in their last frame, as the page handed them to the map. */
  contactActors?: import('./walks.ts').MovingContact[]
  /** False turns idle outings off for a screen test; they are on as the map ships. */
  idleOutings?: boolean
  /** Draws the outings' groups and places from this seed, so a test or a film repeats them. */
  idleSeed?: number
  /** Made-up sleepers for a picture. When set, they replace the office's asleep read, and the page labels them as
   * made up beside the map and on each sleeper's nameplate. */
  asleep?: string[]
}
export function screenTestHooks(): ScreenTestHooks | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as { __officeMapScreenTest?: ScreenTestHooks }).__officeMapScreenTest
}
