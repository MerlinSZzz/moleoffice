// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
export type ActionPose = 'stand' | 'r1' | 'c1' | 'p2' | 'seated' | 'p1' | 'c2' | 'c4'
export type FacilityAction = 'desk' | 'pickup' | 'putdown' | 'garden'
export interface ActionSource { width: number; height: number; sha256: string; rgbaSHA256: string; mask: string; url: string }
export interface ActionObject { width: number; height: number; sha256: string; url: string }
export interface ActionStage { first: number; last: number; action: string; source: ActionPose; origin: number[]; state: string; vignette: string; pinned: boolean; object: { kind: string; position?: number[] } | null }
export interface ActionData {
  version: number; identity: string; fps: number; frames: number; cuts: number[]; recolourApproved: boolean
  sources: Record<string, ActionSource>; objects: Record<string, ActionObject>; pawPixels: Record<string, number[][]>
  composition: { originalWholePoseOrigin: number[]; seatedOrigin: number[]; bookPositions: Record<string, number[]>; paperPositions: Record<string, number[]>; pinPosition: number[] }
  stages: ActionStage[]
}
export class ActionFormatError extends Error {}
export class ActionTransportError extends Error {}
/** This literal delayed import is the only entry to the lazy action assets. */
export const loadTuftActions = async (): Promise<ActionData> => {
  try { return (await import('./tuft-actions.ts')).default as unknown as ActionData }
  catch (error) {
    if (error instanceof TypeError && /fetch dynamically imported|loading dynamically imported|module script failed|network/i.test(error.message)) throw new ActionTransportError(error.message)
    throw new ActionFormatError(String(error))
  }
}
export function canonicalFrame(activity: FacilityAction, elapsed: number): { index: number; terminal: boolean } {
  const frame = Math.max(0, Math.floor(elapsed * 30 / 1000)), count = activity === 'desk' ? 84 : 60, at = Math.min(count - 1, frame)
  return { index: (activity === 'desk' ? 60 : activity === 'garden' ? 204 : activity === 'putdown' ? 144 : 0) + at, terminal: frame >= count - 1 }
}
export const stageAt = (data: ActionData, index: number): ActionStage | undefined => data.stages.find(stage => stage.first <= index && index <= stage.last)
