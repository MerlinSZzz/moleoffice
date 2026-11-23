// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MOVED TO src/server/db/registry-aliases/open-shapes.ts, so the database layer imports nothing from src/server/lib.
 * This path re-exports it, so a reader of this path reads the same module.
 *
 * It also binds what that file cannot, because the types are declared in src/server/lib: the keys of each adapter in
 * CHECKED_IN_LIB to its writer's type, as shape<T> binds the others, and the acts INPUTS_OF_AN_ACT lists to the acts the
 * office knows. tsc refuses a binding that does not hold, and its error names the adapter or the act. All of it is types:
 * nothing here runs.
 */
import type { output } from 'zod'
import type { ARunRequest } from '../agents.ts'
import type { TheDuties } from '../grant/secretary-duties.ts'
import type { MergeEntryReading, SuiteWorkers } from '../merge-queue.ts'
import type { CheckerReport, Deletes, Integration, Press, Reinspected, Reinspection, Stalls, Tested, Verdict } from '../merge-state-machine.ts'
import type { KNOWN_ACTS, KnownActName } from '../one-press.ts'
import type { FilesAreaFolder, ReadsReleasesFromTheCheck } from '../participants.ts'
import type { CHECKED_IN_LIB, INPUTS_OF_AN_ACT } from '../../db/registry-aliases/open-shapes.ts'

export * from '../../db/registry-aliases/open-shapes.ts'

type TheTestedWith = NonNullable<Tested['testedWith']>
type ALoadTimeout = NonNullable<Tested['loadTimeouts']>[number]
type ARunMessage = ARunRequest['messages'][number]
// `quotes` is optional on a run message, so it is read through NonNullable: an Extract on { quotes: unknown } finds no member.
type ARunQuote = NonNullable<ARunMessage['quotes']>[number]
/** What an act asked for one press, or in a signing package, keeps as its inputs. */
type InputsOf<A extends KnownActName> = output<(typeof KNOWN_ACTS)[A]['inputs']>

/** The writer's type of each adapter in CHECKED_IN_LIB. */
interface TheWritersTypes {
  SupervisorAnswered: NonNullable<TheDuties['supervisors']>[number]
  FilesAreaFolder: FilesAreaFolder
  MergeSeal: MergeEntryReading['seal']
  SuiteWorkers: SuiteWorkers
  MergeWithdrawn: NonNullable<MergeEntryReading['withdrawn']>
  MergeSuperseded: NonNullable<MergeEntryReading['superseded']>
  MergeTool: NonNullable<MergeEntryReading['tool']>
  MergeToolWanted: NonNullable<MergeEntryReading['toolWanted']>
  MergeVerdict: Verdict
  MergeChecked: Omit<CheckerReport, 'checked'> & { at: string }
  CheckerDecided: CheckerReport['decided'][number]
  MergeIntegration: Integration
  ReadsOnMain: NonNullable<Integration['reads']>
  KeptByLine: NonNullable<Integration['keptByLine']>
  KeptByLineFile: NonNullable<Integration['keptByLine']>['files'][number]
  Reinspection: Reinspection
  Reinspected: Reinspected
  MergeTested: Tested
  RelatedOnly: NonNullable<Tested['relatedOnly']>
  LeftOutSlow: NonNullable<Tested['relatedOnly']>['leftOutSlow'][number]
  WholeSuiteBecause: NonNullable<Tested['wholeSuiteBecause']>[number]
  OfficeHealth: NonNullable<Tested['officeHealth']>
  TestedWith: TheTestedWith
  ForTheOther: NonNullable<TheTestedWith['forTheOther']>
  BusRider: NonNullable<TheTestedWith['bus']>[number]
  BorrowedFrom: NonNullable<Tested['borrowedFrom']>
  LoadTimeout: ALoadTimeout
  LoadTimeoutHere: ALoadTimeout['here']
  ModalLoadTimeout: ALoadTimeout['modal']
  ModalRun: ALoadTimeout['modal']['entry']
  BuildPassed: NonNullable<Tested['build']>
  MergeStalls: Stalls
  StallsAsked: NonNullable<Stalls['asked']>
  MergeDeletes: Deletes
  PressToLand: Press
  PressedBy: NonNullable<Deletes['confirmed']> | NonNullable<Press['pressed']>
  PressLeftOut: NonNullable<Press['leftOut']>
  RunRequest: ARunRequest
  RunRequestThread: ARunRequest['thread']
  RunRequestRecipient: ARunRequest['recipient']
  RunRequestResume: NonNullable<ARunRequest['resume']>
  RunRequestMessage: ARunMessage
  RunRequestQuote: ARunQuote
  SettingInputs: InputsOf<'change-a-setting'>
  AskAtTheDoorInputs: InputsOf<'answer-an-ask-at-the-door'>
  RuleMarkInputs: InputsOf<'mark-a-rule-only-for-this-office'>
  GrantListInputs: InputsOf<'change-what-the-grant-carries'>
  GrantListChange: InputsOf<'change-what-the-grant-carries'>['changes'][number]
  ReadsReleasesFromTheCheck: ReadsReleasesFromTheCheck
}

/** Every key of a writer's type, across all the members of a union, as shape<T> reads them. */
type KeysOf<T> = T extends unknown ? keyof T & string : never
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Adapters = typeof CHECKED_IN_LIB
/** tsc refuses this with the name it is given, when the name is not never. */
type Refused<Name extends never> = Name

/** Each adapter whose keys are not its writer's keys, and each name that is in only one of the two lists. */
type Unbound =
  | { [N in keyof Adapters]: N extends keyof TheWritersTypes ? (Same<keyof Adapters[N] & string, KeysOf<TheWritersTypes[N]>> extends true ? never : N) : N }[keyof Adapters]
  | Exclude<keyof TheWritersTypes, keyof Adapters>
export type EveryAdapterHereHasItsWritersKeys = Refused<Unbound>

/** Each act the office knows that INPUTS_OF_AN_ACT misses, and each act it names that the office does not know. */
export type EveryActHasItsInputs = Refused<Exclude<KnownActName, keyof typeof INPUTS_OF_AN_ACT> | Exclude<keyof typeof INPUTS_OF_AN_ACT, KnownActName>>
