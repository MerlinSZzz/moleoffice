// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN EMERGENCY PUSH TO MAIN (wave 13u round 82, item 16). An emergency fix does not go
 * through the merge queue. Whoever holds the secretary card, or the person, pushes one commit straight to main while the
 * emergency switch is on, and then 13q's emergency release takes it into the stable version. One throw of the switch
 * declares the emergency for both halves, and 13q's rule judges it for both.
 *
 * The push is a mode of the merge tool (tools/merge-tool/emergency-push.mjs), run on the machine the office runs on. The
 * office keeps its record and its lock: the tool asks the push door before it moves main and the end door after, and the
 * record says what git shows. Main has one writer at a time, so a push waits for a landing and a landing waits for a
 * push. A test holds its lane and not main, so neither waits for a test.
 */
import { z } from 'zod'
import { STABLE_EMERGENCY_GATE, type StableEmergencySwitchRow } from './stable-emergency.ts'
import type { StableEmergencyFollowUp, StableUpgradeOriginal } from './stable-upgrade-notices.ts'
import type { ParticipantRef } from './participants.ts'

export const EMERGENCY_PUSH_KIND = 'emergency_push'
/** pushing: the push holds main. pushed: main moved to the commit. stopped: main stayed where it was. */
export const EMERGENCY_PUSH_STATES = ['pushing', 'pushed', 'stopped'] as const
export type EmergencyPushState = (typeof EMERGENCY_PUSH_STATES)[number]
/** How many pushes of a lane the queue's reply carries, the newest first. */
export const EMERGENCY_PUSHES_SHOWN = 20

/**
 * What the tool sends before it moves main. `message` is the chat message that told the owner the commit. `line`, when
 * given, is the handle of the supervisor of the line whose branch the fix came from: a red follow-up in a file the push
 * changed goes back to that line first.
 */
export const emergencyPushRequestSchema = z.strictObject({
  root: z.string().min(1),
  commit: z.string().regex(/^[0-9a-f]{40}$/, 'A commit is named by its 40-character hash.'),
  message: z.strictObject({ id: z.string().min(1), seq: z.literal(1), contentHash: z.string().min(1) }),
  line: z.string().min(1).optional(),
})
export type EmergencyPushRequest = z.infer<typeof emergencyPushRequestSchema>

/** What the tool sends after. `onward` is what pushLanded said, or null when main did not move and nothing went on. */
export const emergencyPushEndSchema = z.strictObject({
  says: z.string().trim().min(1).max(4000),
  onward: z.strictObject({ ok: z.boolean(), says: z.string().max(4000) }).nullable(),
})
export type EmergencyPushEnd = z.infer<typeof emergencyPushEndSchema>

/**
 * What the main suite's job sends when a red whole-suite receipt finds main moved by no landing: the receipt it filed,
 * and the files red in it that it could not trace to a landing. Each file is red in the receipt, and red alone in a
 * receipt of version 2.
 */
export const emergencyPushHandBackSchema = z.strictObject({
  receipt: z.string().min(1),
  files: z.array(z.string().min(1)).min(1).refine((files) => new Set(files).size === files.length, 'Name each file once.'),
})

/** One push a red follow-up went back to: the problem about it, whether this ask filed it, and the files it names. */
export interface EmergencyPushHandedBack {
  push: string
  problem: string
  /** False when an open problem about the push was there already; nobody is told again. */
  filed: boolean
  /** The asked files the push changed. */
  files: string[]
  /** Of those, the files the open problem does not name, when it was there already. */
  unnamedFiles: string[]
}

/** What the hand-back door answers. `notThePushes` are the asked files no push changed, left where a red suite goes. */
export interface EmergencyPushHandBackAnswer {
  handedBack: EmergencyPushHandedBack[]
  notThePushes: string[]
}

/** One push as the office reads it back. `followUp` is worked out on read, and only for a push that moved main. */
export interface EmergencyPushReading {
  id: string
  state: EmergencyPushState
  root: string
  repository: string
  commit: string
  mainBefore: string
  message: StableUpgradeOriginal
  switch: StableEmergencySwitchRow
  by: ParticipantRef
  /** The supervisor of the line the fix came from, as the push named it, or null when it named none. */
  line: ParticipantRef | null
  /** The handle the queue page shows for `by`, or null when the office cannot name it. */
  who: string | null
  /** The handle of `line`, or null when the push named none or the office cannot name it. */
  lineWho: string | null
  startedAt: string
  ended: { at: string; mainAfter: string; says: string; onward: { ok: boolean; says: string } | null } | null
  followUp: StableEmergencyFollowUp | null
}

// ------------------------------------------------------------------------------------------------ what it is refused with

export const ONLY_THE_PERSON_OR_THE_SECRETARY_PUSHES =
  'Only the person, or the agent holding the secretary card, may push to main in an emergency. Nothing was written.'
export function aPushNeedsTheSwitch(why: string): string {
  return `An emergency push to main needs the emergency switch, the office gate ${STABLE_EMERGENCY_GATE}, on. ${why} Nothing was written.`
}
export function aPushNeedsTheMessage(why: string): string {
  return `An emergency push to main needs the secretary's chat message that told the owner alone which commit goes to main. ${why} Nothing was written.`
}
export function aLandingHoldsMain(entry: string, root: string): string {
  return `Merge entry ${entry} lands in ${root} now, and main moves one writer at a time. Ask again once it has landed. Nothing was written.`
}
export function aPushHoldsMain(push: string, root: string): string {
  return `Emergency push ${push} moves main in ${root} now, and main moves one writer at a time. Ask again once it has ended. Nothing was written.`
}
export function notACheckoutTheOfficeKnows(root: string): string {
  return `${root} is not the checkout of a repository this project registered, so the office cannot tell whose main it is. Nothing was written.`
}
export function mainUnread(root: string, why: string): string {
  return `Main in ${root} could not be read: ${why} Nothing was written.`
}
export function notACommitIn(commit: string, root: string): string {
  return `${commit} is not a commit in ${root}. Nothing was written.`
}
export function mainIsThereAlready(commit: string, root: string): string {
  return `Main in ${root} is at ${commit} already, so there is nothing to push. Nothing was written.`
}
export function notAfterMain(commit: string, main: string, root: string): string {
  return `${commit} does not come after main in ${root}, which is at ${main}. An emergency push moves main forward only. Nothing was written.`
}
export function aPushHasEnded(id: string, state: Exclude<EmergencyPushState, 'pushing'>): string {
  const how = state === 'pushed' ? 'main moved to its commit' : 'main stayed where it was'
  return `Emergency push ${id} has ended already: ${how}. Nothing was written.`
}
export function mainAtNeither(id: string, root: string, at: string, commit: string, before: string): string {
  return `Main in ${root} is at ${at}. That is neither ${commit}, the commit emergency push ${id} pushes, nor ${before}, main before it. ` +
    'Find out who moved main before the push is ended. Nothing was written.'
}
export function aPushNamesNoLine(line: string): string {
  return `${line} is not the handle of a registered agent, so the push cannot name it as the line the fix came from. Nothing was written.`
}
export function aStoppedPushPushedNothing(id: string): string {
  return `Main did not move, so emergency push ${id} pushed nothing on. End it with no onward push. Nothing was written.`
}
export function notAnEmergencyPush(id: string): string {
  return `Record ${id} is not an emergency push.`
}
/** The refusal every other write path gives the kind. The record names who pushed, and only its doors know that. */
export const A_PUSH_IS_WRITTEN_BY_ITS_DOORS =
  'An emergency push record is written only by the emergency push doors, so that it names who pushed. Nothing was written.'
export const THE_PUSH_DOORS =
  'Start with POST /api/merge-queue/emergency-pushes and end with POST /api/merge-queue/emergency-pushes/<id>/end. ' +
  'GET /api/merge-queue reads them, and GET /api/merge-queue/emergency-pushes/<id> reads one. The merge tool asks both doors: node tools/the-merger.mjs --emergency-push. ' +
  'The main suite hands a red follow-up back with POST /api/merge-queue/emergency-pushes/hand-back-from-the-main-suite.'
