// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE OFFICE WRITES INTO EACH OPEN BAG, AND INTO EACH STORED COLUMN THAT IS NOT A RECORD, so the identity reader can
 * read each by its writer's type.
 *
 * kinds.ts declares some fields as `Record<string, unknown>`, because a caller does not write them. The office writes a
 * fixed shape into most of them. An adapter below is that shape, written in the declared type language of kinds.ts and
 * read by its one grammar (`aTypeReaderWith`). Each adapter's keys are bound to the writer's TypeScript type, so tsc
 * refuses an adapter that misses a key of the writer's type or adds one it does not have. The field types are not
 * bound, and the cases in tests/registry-alias-open-bags.test.ts read
 * stored values through them.
 *
 * Where the writer has a strict reader of its own, that reader decides instead, and an identity is never looked for
 * there. A bag nothing here reads blocks whole, with the reason it is not read yet.
 *
 * Every open bag kinds.ts declares is listed in OPEN_BAGS once. The columns outside the records table that hold JSON with
 * an agent in it are listed in STORED_COLUMNS, each with the adapter its writer's type is written in.
 */
import type { RoundChapters, RoundDelegations, DelegationGiven, DelegationStanding } from '@shared/round-chapters/manifest.ts'
import type { ZodType } from 'zod'
import { SHAPE_SPECS, aTypeReaderWith, unionOf, type DeclaredType, type ShapeSpec } from '@shared/kinds.ts'
import type { AgentTag } from '@shared/agent-tags.ts'
import { CASTING_CELLS, type CastingCell, type CastingCellSource, type CastingHold, type CastingImage, type CastingLabelImage, type CastingNative, type CastingSetting, type CastingStoredCell } from '@shared/casting.ts'
import { whyItIsNotACastingRoll } from '@shared/casting-roll.ts'
import { QUIET_CONDITIONS, type Action, type CounterPause, type Follow, type Trigger, type WhoMayAdd } from '@shared/counters.ts'
import { emergencyPushRequestSchema, type EmergencyPushEnd } from '@shared/emergency-push.ts'
import { PIECE_STATES, type FolderReadingPiece } from '@shared/folderreading.ts'
import { forestMapStateSchema, type ForestMapState, type ForestRegion } from '@shared/forest-map.ts'
import { MESSAGE_INTENTS } from '@shared/intent.ts'
import {
  houseRule, mergeClassDecision, repairOfSchema, takeBackOfSchema,
  type FixRoundFact, type HouseRulesDecision, type MergeClassDecision, type RepairFact, type WideRedDecision,
} from '@shared/merge-class.ts'
import {
  BOUNCE_REASONS, FILE_MODES, FILE_OPERATIONS, ON_CONFLICT, RESOLUTION_BOUNCES,
  type AskedToResolve, type AskedToResolveMessage, type Bounce, type Changeset, type DeclaredTestRun, type FileOperation, type FixRoundAsk,
  type IntegrationReceipt, type LinesOfAFile, type MovedFirst, type NobodyStarted, type OwnerContentReminders, type PlaceholderCommits,
  type Resolution, type ResolvedPlace, type Resolving, type ReturnsFirst, type SideOfAPlace, type WaitsForAFixRound,
} from '@shared/merge-queue.ts'
import type { CarriedTo, MessageEdited, RoutedAddressee, RoutedPassedOver, TheOwnerEnding, TheRoutedEnding, TheRoutedLineSaid } from '@shared/messages.ts'
import { SUMMONS_URGENCIES, type ASummonsRead } from '@shared/summons.ts'
import { ACTOR_TYPES, THREAD_MODES, type HowACallerProvedItself, type ProvedHolder } from '@shared/types.ts'
import { THE_CHOICES_FOR_A_DOOR } from '@shared/what-the-grant-carries.ts'
import type { BusCause, WholeSuiteRed } from '@shared/whole-suite-red.ts'

/** A field of an adapter: its key, and its type in the declared type language. */
export interface AdapterField {
  key: string
  type: string
}

export interface AdapterShape {
  name: string
  fields: AdapterField[]
  discriminator?: ShapeSpec['discriminator']
  /** An open adapter reads the keys it declares, and blocks each other key as an open bag. A closed one blocks it as undeclared. */
  open: boolean
}

/** The words for how a key proved a caller. tsc refuses a list that misses one or adds one. */
const HOW_A_KEY_PROVED: Readonly<Record<HowACallerProvedItself, true>> = { 'the-person-key': true, 'the-office-key': true, 'an-agent-key': true, 'his-tool-key': true }

/** Every key of a writer's type, across all the members of a union. */
type KeysOf<T> = T extends unknown ? keyof T & string : never
/** One declared type for each key of the writer's type, and for no other key. */
type TypesOf<T> = { readonly [K in KeysOf<T>]: string }
type TagsOf<T, D extends string> = T extends Record<D, infer Tag extends string> ? Tag : never
/** For each tag of a union: the declared types of the other keys of the members with that tag. */
type Variants<T, D extends string> = { readonly [Tag in TagsOf<T, D>]: Omit<TypesOf<Extract<T, Record<D, Tag>>>, D> }

function shape<T>(name: string, types: TypesOf<T>, open = false): AdapterShape {
  return { name, fields: Object.entries(types as Readonly<Record<string, string>>).map(([key, type]) => ({ key, type })), open }
}

/** A union, as kinds.ts declares one: a shape with a discriminator, and one shape for each tag, named for the union and the tag. */
function union<T, D extends KeysOf<T>>(name: string, key: D, variants: Variants<T, D>): AdapterShape[] {
  const tags = Object.entries(variants as Record<string, Record<string, string>>)
  return [
    { name, fields: [], discriminator: { key, variants: Object.fromEntries(tags.map(([tag]) => [tag, `${name}(${tag})`])) }, open: false },
    ...tags.map(([tag, types]): AdapterShape => ({ name: `${name}(${tag})`, fields: [{ key, type: `'${tag}'` }, ...Object.entries(types).map(([one, type]) => ({ key: one, type }))], open: false })),
  ]
}

const OWNER_ENDINGS: Variants<TheOwnerEnding, 'how'> = {
  'no secretary': { owner: 'string' },
  'nobody reachable': { owner: 'string' },
  'nobody started': { owner: 'string', stoppedAt: 'string' },
  'a name no single agent answers': { owner: 'string' },
  'a loop': { owner: 'string' },
  'the addressee holds the secretary card': { owner: 'string' },
}

const WAS = "'retired' | 'nothing answering'"
const POSITION = unionOf(mergeClassDecision.shape.position.options)
const ORIGINAL = "'original'"
// The grammar reads a union as quoted values only when every part is quoted, so `null` comes first and each side is read alone.
const CONTEXT_STATE = "null | 'there' | 'changed' | 'gone' | 'unknown'"
const A_MAP_REGION = forestMapStateSchema.shape.regions.element.shape
/** The zones a map region may be in, as the map's own schema lists them. */
export const FOREST_ZONES: readonly string[] = A_MAP_REGION.zone.options

/**
 * THE ADAPTERS WHOSE WRITER'S TYPE IS DECLARED IN src/server/lib. This file imports nothing from src/server/lib, so the
 * keys of each adapter here are bound to its writer's type in src/server/lib/registry-aliases/open-shapes.ts, which
 * re-exports this file. tsc refuses there an adapter that misses a key of its writer's type or adds one, as shape<T>
 * refuses one below, and names it. ADAPTER_SHAPES names each of these in its place.
 */
export const CHECKED_IN_LIB = {
  SupervisorAnswered: { agent: 'ParticipantRef', area: 'string' },
  FilesAreaFolder: { written: 'string', resolved: 'string' },
  MergeSeal: { id: 'string', hash: 'string' },
  SuiteWorkers: { count: 'number', by: 'ParticipantRef' },
  MergeWithdrawn: { because: 'string', by: 'ParticipantRef', at: 'string' },
  MergeSuperseded: { by: 'string', because: 'string', at: 'string' },
  MergeTool: { session: 'string', log: 'string', startedAt: 'string', endedAt: 'string', reason: 'string' },
  MergeToolWanted: { since: 'string' },
  MergeVerdict: { run: 'string', by: 'ParticipantRef', at: 'string', time: 'ClockStamp', how: 'string', message: 'string | null' },
  MergeChecked: { at: 'string', tool: 'string', decided: 'CheckerDecided[]', needsJudgment: 'PathThatNeedsJudgment[]' },
  CheckerDecided: { path: 'string', check: 'string', ok: 'boolean', detail: 'string' },
  MergeIntegration: {
    result: 'string', mainAt: 'string', clone: 'string', files: 'Record<string, string>', at: 'string', reads: 'ReadsOnMain', lines: 'LinesOfAFile[]',
    keptByLine: 'KeptByLine', ownerContent: 'OwnerContentReminders', placeholderCommits: 'PlaceholderCommits',
  },
  ReadsOnMain: { tree: 'string', files: 'number', folders: 'number', record: 'string' },
  KeptByLine: { files: 'KeptByLineFile[]', says: 'string' },
  KeptByLineFile: { path: 'string', ranges: 'string' },
  Reinspection: { run: 'string', only: 'string[]', needsJudgment: 'PathThatNeedsJudgment[]', askedAt: 'string', says: 'string' },
  Reinspected: { run: 'string', only: 'string[]', needsJudgment: 'string[]', releasedAt: 'string' },
  MergeTested: {
    relatedOnly: 'RelatedOnly', wholeSuiteBecause: 'WholeSuiteBecause[]', green: 'boolean', redTests: 'string[]', log: 'string', tip: 'string', ran: 'number',
    passed: 'number', says: 'string', officeHealth: 'OfficeHealth', at: 'string', time: 'ClockStamp', testedWith: 'TestedWith', borrowedFrom: 'BorrowedFrom',
    loadTimeouts: 'LoadTimeout[]', plugin: 'APluginOnlyChange', wholeSuiteRed: 'WholeSuiteRed', busCause: 'BusCause', houseRules: 'HouseRulesDecision',
    mergeClass: 'MergeClassDecision', build: 'BuildPassed', repair: 'RepairFact',
  },
  RelatedOnly: { files: 'number', related: 'number', every: 'number', leftOutSlow: 'LeftOutSlow[]', says: 'string' },
  LeftOutSlow: { file: 'string', seconds: 'number' },
  WholeSuiteBecause: { case: 'number', paths: 'string[]', says: 'string' },
  OfficeHealth: {
    samples: 'number', answered: 'number', unanswered: 'number', medianMs: 'number | null', maxMs: 'number | null', over10s: 'number', everySeconds: 'number',
    load1Median: 'number', load1Max: 'number', availableMemoryMiBMedian: 'number', availableMemoryMiBLowest: 'number', cpus: 'number', memoryMiB: 'number',
  },
  TestedWith: {
    entry: 'string', tree: 'string', forTheOther: 'ForTheOther', collision: 'string[]', bus: 'BusRider[]', passedForACheck: 'string[]', passedAlone: 'string[]',
  },
  ForTheOther: { tree: 'string', green: 'boolean', build: 'BuildPassed', redTests: 'string[]', says: 'string' },
  BusRider: { entry: 'string', forTheOther: 'ForTheOther' },
  BorrowedFrom: { entry: 'string', tree: 'string' },
  LoadTimeout: { file: 'string', mainAt: 'string', here: 'LoadTimeoutHere', modal: 'ModalLoadTimeout' },
  LoadTimeoutHere: { entryLog: 'string', mainLog: 'string' },
  ModalLoadTimeout: { entry: 'ModalRun', main: 'ModalRun' },
  ModalRun: { commit: 'string', log: 'string', report: 'string' },
  BuildPassed: { passed: 'boolean' },
  MergeStalls: { runs: 'number', says: 'string', secretary: 'string | null', asked: 'StallsAsked' },
  StallsAsked: { by: 'ParticipantRef', at: 'string', because: 'string', mainAt: 'string' },
  MergeDeletes: { paths: 'string[]', asked: 'string | null', confirmed: 'PressedBy' },
  PressToLand: { paths: 'string[]', asked: 'string | null', pressed: 'PressedBy', leftOut: 'PressLeftOut' },
  PressedBy: { by: 'ParticipantRef', at: 'string', because: 'string' },
  PressLeftOut: { mainAt: 'string', paths: 'string[]' },
  RunRequest: {
    workspaceId: 'string', workspaceTitle: 'string | null', actorId: 'string', agentId: 'string | null', thread: 'RunRequestThread', recipient: 'RunRequestRecipient',
    resume: 'RunRequestResume | null', messages: 'RunRequestMessage[]', contextNote: 'string', assembledAt: 'string', agentKeyId: 'string',
  },
  RunRequestThread: { id: 'string', title: 'string', mode: unionOf(THREAD_MODES) },
  RunRequestRecipient: {
    kind: "'session' | 'new' | 'agent'", sessionRecordId: 'string | null', sessionTitle: 'string | null', said: 'string | null', why: 'string | null',
  },
  RunRequestResume: { runtime: 'string', externalId: 'string' },
  RunRequestMessage: {
    id: 'string', intent: unionOf(MESSAGE_INTENTS), body: 'string', context: 'Context | null', contextSaid: 'string | null', contextState: CONTEXT_STATE,
    quotes: 'RunRequestQuote[]', writtenAt: 'string', writtenBy: 'string',
  },
  RunRequestQuote: { number: 'number', commentId: 'string', context: 'Context | null', contextSaid: 'string | null', contextState: CONTEXT_STATE },
  SettingInputs: { panel: 'string', setting: 'string', value: 'number' },
  AskAtTheDoorInputs: { request: 'string', answer: "'grant' | 'refuse'" },
  RuleMarkInputs: { chapter: 'string', rule: 'string', only: 'boolean' },
  GrantListInputs: { changes: 'GrantListChange[]' },
  GrantListChange: { door: 'string', answer: unionOf(THE_CHOICES_FOR_A_DOOR) },
  ReadsReleasesFromTheCheck: { on: 'boolean', by: 'ParticipantRef', at: 'string', because: 'string' },
} as const

/** An adapter of CHECKED_IN_LIB, made from its keys as shape<T> makes one. */
function checkedInLib(name: keyof typeof CHECKED_IN_LIB, open = false): AdapterShape {
  return { name, fields: Object.entries(CHECKED_IN_LIB[name] as Readonly<Record<string, string>>).map(([key, type]) => ({ key, type })), open }
}

export const ADAPTER_SHAPES: readonly AdapterShape[] = [
  // A message's routed entries, carries, ask to resolve, edit mark, reminder and summons.
  shape<RoutedAddressee>('RoutedAddressee', {
    for: 'ParticipantRef', because: 'string', to: 'ParticipantRef | null', passedOver: 'RoutedPassedOver[]', line: 'string', said: 'TheRoutedLineSaid', inSummary: 'string',
  }),
  shape<RoutedPassedOver>('RoutedPassedOver', { who: 'ParticipantRef', because: 'string' }),
  shape<TheRoutedLineSaid>('TheRoutedLineSaid', { addressee: 'string', was: WAS, passedOver: 'RoutedNameWas[]', ending: 'TheRoutedEnding', sweptAt: 'string' }),
  shape<TheRoutedLineSaid['passedOver'][number]>('RoutedNameWas', { name: 'string', was: WAS }),
  ...union<TheRoutedEnding, 'how'>('TheRoutedEnding', 'how', {
    'no owner can receive': {},
    'the owner is a person': {},
    'an ownerless addressee': {},
    'an interrupted ownership chain': { stoppedAt: 'string' },
    'an owner': { reached: 'string' },
    'an owner whose reach is uncertain': { reached: 'string' },
    'an owner waiting': { reached: 'string' },
    'the owner sent it': {},
    'a starter': { reached: 'string' },
    'a starter it could not tell about': { reached: 'string' },
    'the sender': {},
    ...OWNER_ENDINGS,
    'the owner is the sender': { ending: 'TheOwnerEnding' },
    'the dead-letter secretary instead of the owner': { reached: 'string', ending: 'TheOwnerEnding' },
    'the dead-letter secretary': { reached: 'string' },
  }),
  ...union<TheOwnerEnding, 'how'>('TheOwnerEnding', 'how', OWNER_ENDINGS),
  shape<CarriedTo>('CarriedTo', { from: 'string', fromHandle: 'string', to: 'string', toHandle: 'string', copy: 'string | null', at: 'string' }),
  shape<AskedToResolveMessage>('AskedToResolveMessage', { entry: 'string', files: 'string[]', red: 'string[]', brief: 'string | null', agent: 'string | null', until: 'string' }),
  shape<MessageEdited>('MessageEdited', { at: 'string', by: 'ParticipantRef | null', original: 'MessageEditedOriginal' }),
  shape<MessageEdited['original']>('MessageEditedOriginal', { title: 'string | null', body: 'string | null' }),
  shape<{ backAsYouAsked: unknown }>('MessageExtra', { backAsYouAsked: 'BackAsYouAsked' }, true),
  shape<{ remindAt: string; from: unknown }>('BackAsYouAsked', { remindAt: 'string', from: 'ParticipantRef | null' }),
  shape<Pick<ASummonsRead, 'who' | 'urgency' | 'title'>>('Summons', { who: 'string', urgency: unionOf(SUMMONS_URGENCIES), title: 'string' }),
  // A run's pause, resume and opener. The pause and the resume are written inline, so their keys are written here by hand.
  shape<{ at: string; time: unknown; by: unknown; because: string }>('SessionPaused', { at: 'string', time: 'ClockStamp', by: 'ParticipantRef | null', because: 'string' }),
  shape<{ askedBy: unknown; askedAt: unknown; startedAs: string; startedAt: string; failed: unknown }>('SessionResume', {
    askedBy: 'ParticipantRef | null', askedAt: 'string | null', startedAs: 'string', startedAt: 'string', failed: 'string | null',
  }),
  shape<{ openedBy: unknown; roundChapters: unknown }>('SessionExtra', { openedBy: 'SessionOpenedBy', roundChapters: 'RemintRoundChapters' }, true),
  shape<Pick<RoundChapters, 'delegations'>>('RemintRoundChapters', { delegations: 'RemintRoundDelegations' }, true),
  shape<Pick<RoundDelegations, 'tasks'>>('RemintRoundDelegations', { tasks: 'RemintRoundDelegation[]' }, true),
  shape<Pick<DelegationGiven, 'inside'>>('RemintRoundDelegation', { inside: 'RemintRoundDelegationStanding' }, true),
  shape<Pick<DelegationStanding, 'takenBy'>>('RemintRoundDelegationStanding', { takenBy: 'ParticipantRef' }, true),
  shape<{ type: unknown; id: string; underTheGrant: string }>('SessionOpenedBy', { type: unionOf(ACTOR_TYPES), id: 'string', underTheGrant: 'string' }),
  // A counter's parts.
  shape<WhoMayAdd>('WhoMayAdd', { anyone: 'boolean', who: 'ParticipantRef[]' }),
  ...union<Follow, 'event'>('CounterFollow', 'event', {
    landing: { lane: 'string', paths: 'string[]' },
    'run-finished': { pipeline: 'string' },
    'group-message': { group: 'string' },
  }),
  ...union<Trigger, 'kind'>('CounterTrigger', 'kind', {
    count: { n: 'number' },
    amount: { m: 'number' },
    quiet: { condition: unionOf(QUIET_CONDITIONS), lane: 'string', minutes: 'number' },
    every: { hours: 'number', from: 'string' },
  }),
  ...union<Action, 'kind'>('CounterAction', 'kind', {
    message: { to: 'ParticipantRef[]', group: 'string' },
    task: { title: 'string' },
    job: { job: 'string' },
  }),
  shape<CounterPause>('CounterPause', { at: 'string', by: 'ParticipantRef', because: 'string' }),
  // A secretary's supervisors, an agent's files area, the notice of a seal, and the end of an emergency push.
  checkedInLib('SupervisorAnswered'),
  checkedInLib('FilesAreaFolder'),
  shape<{ to: unknown; because: string }>('TheStarterNotice', { to: 'ParticipantRef', because: 'string' }),
  shape<EmergencyPushEnd & { at: string; mainAfter: string }>('EmergencyPushEnded', { at: 'string', mainAfter: 'string', says: 'string', onward: 'EmergencyPushOnward | null' }),
  shape<NonNullable<EmergencyPushEnd['onward']>>('EmergencyPushOnward', { ok: 'boolean', says: 'string' }),
  // A merge entry's seal, changeset, submitter, workers, withdrawal, move, successor and tool run.
  checkedInLib('MergeSeal'),
  ...union<Changeset, 'adapter'>('MergeChangeset', 'adapter', {
    git: { root: 'string', repository: 'string', branch: 'string | null', commit: 'string', base: 'string' },
    files: { root: 'string', stagedAt: 'string', onConflict: unionOf(ON_CONFLICT), operations: 'MergeFileOperation[]' },
  }),
  shape<FileOperation>('MergeFileOperation', {
    op: unionOf(FILE_OPERATIONS), path: 'string', from: 'string', before: 'string', after: 'string', mode: unionOf(FILE_MODES), source: 'string', record: 'string',
  }),
  checkedInLib('SuiteWorkers'),
  checkedInLib('MergeWithdrawn'),
  shape<MovedFirst>('MovedFirst', { by: 'ParticipantRef', at: 'string', because: 'string', turn: 'number', underARaise: 'string' }),
  shape<ReturnsFirst>('ReturnsFirst', { run: 'string', at: 'string', turn: 'number' }),
  checkedInLib('MergeSuperseded'),
  checkedInLib('MergeTool'),
  checkedInLib('MergeToolWanted'),
  // Its verdict, the checker's report, the integration and the reinspection. The report is kept without what it checked.
  checkedInLib('MergeVerdict'),
  checkedInLib('MergeChecked'),
  checkedInLib('CheckerDecided'),
  checkedInLib('MergeIntegration'),
  checkedInLib('ReadsOnMain'),
  shape<LinesOfAFile>('LinesOfAFile', { path: 'string', held: 'boolean', ranges: 'string', why: 'string' }),
  checkedInLib('KeptByLine'),
  checkedInLib('KeptByLineFile'),
  shape<OwnerContentReminders>('OwnerContentReminders', { reminded: 'number', byPattern: 'Record<string, number>', says: 'string', log: 'string' }),
  shape<PlaceholderCommits>('PlaceholderCommits', { position: "'remind'", domain: 'string', commits: 'PlaceholderCommit[]', log: 'string' }),
  shape<PlaceholderCommits['commits'][number]>('PlaceholderCommit', { commit: 'string', author: 'string | null', committer: 'string | null' }),
  checkedInLib('Reinspection'),
  checkedInLib('Reinspected'),
  // What its suite found.
  checkedInLib('MergeTested'),
  checkedInLib('RelatedOnly'),
  checkedInLib('LeftOutSlow'),
  checkedInLib('WholeSuiteBecause'),
  checkedInLib('OfficeHealth'),
  checkedInLib('TestedWith'),
  checkedInLib('ForTheOther'),
  checkedInLib('BusRider'),
  checkedInLib('BorrowedFrom'),
  checkedInLib('LoadTimeout'),
  checkedInLib('LoadTimeoutHere'),
  checkedInLib('ModalLoadTimeout'),
  checkedInLib('ModalRun'),
  checkedInLib('BuildPassed'),
  shape<WholeSuiteRed>('WholeSuiteRed', { outcome: "'admitted-for-fix-round'", build: 'WholeSuiteRedBuild', affected: 'WholeSuiteRedAffected', suite: 'WholeSuiteRedSuite' }),
  shape<WholeSuiteRed['build']>('WholeSuiteRedBuild', { source: ORIGINAL, tip: 'string', tree: 'string', log: 'string', exit: 'number' }),
  shape<WholeSuiteRed['affected']>('WholeSuiteRedAffected', {
    source: ORIGINAL, tip: 'string', tree: 'string', log: 'string', selection: "'complete'", exit: 'number', files: 'string[]', ran: 'number', passed: 'number', report: 'string',
  }),
  shape<WholeSuiteRed['suite']>('WholeSuiteRedSuite', {
    source: ORIGINAL, tip: 'string', tree: 'string', log: 'string', complete: 'boolean', exit: 'number', ran: 'number', passed: 'number', redTests: 'string[]', report: 'string',
  }),
  shape<BusCause>('BusCause', { mainAt: 'string', suite: 'BusCauseSuite', order: 'BusCauseRider[]', pairDecided: 'BusPairDecided' }),
  shape<BusCause['suite']>('BusCauseSuite', { commit: 'string', tree: 'string' }),
  shape<BusCause['order'][number]>('BusCauseRider', { entry: 'string', commit: 'string', tree: 'string', commits: 'string[]' }),
  shape<BusCause['pairDecided']>('BusPairDecided', { still: 'string[]', brokeBy: 'Record<string, number>', runsAlone: 'number', without: 'BusWithout' }),
  // The schema keeps what tools/merge-tool/pairs.mjs decided without the riders as unknown, so its keys are written here by hand.
  shape<{ tip: string; green: unknown; brokenAt: unknown }>('BusWithout', { tip: 'string', green: 'boolean | null', brokenAt: 'BusBrokenAt | null' }),
  shape<{ entry: string; why: string }>('BusBrokenAt', { entry: 'string', why: 'string' }),
  shape<HouseRulesDecision>('HouseRulesDecision', { mainAt: 'string', list: 'HouseRulesList', files: 'HouseRuleFile[]', class: 'number | null', reason: 'string', position: POSITION }),
  ...union<HouseRulesDecision['list'], 'state'>('HouseRulesList', 'state', { read: {}, absent: {}, unreadable: { reason: 'string' } }),
  shape<HouseRulesDecision['files'][number]>('HouseRuleFile', {
    file: 'string', class: unionOf(houseRule.shape.class.options), kind: 'string', mark: unionOf(houseRule.shape.mark.unwrap().options),
  }),
  // A red class of 2 or 3. The declared type language has no number or `true` literal, so those are read as a number and a boolean.
  shape<MergeClassDecision | WideRedDecision>('MergeClassDecision', {
    class: 'number', cause: 'number', mainAt: 'string', files: 'HouseRuleFile[]', featureFiles: 'string[]', houseRuleFiles: 'string[]', reason: 'string', build: 'boolean',
    databasePaths: 'string[]', roundOpen: 'RoundOpen', fewRedFiles: 'number', position: POSITION, houseRulesPosition: POSITION, fewFeatureRedsPosition: POSITION,
  }),
  shape<MergeClassDecision['roundOpen'] | WideRedDecision['roundOpen']>('RoundOpen', {
    open: 'boolean', starter: 'string', run: 'string', fixRound: 'FixRoundFact', reason: 'string', reserved: 'RoundOpenReserved',
  }),
  shape<FixRoundFact>('FixRoundFact', { agent: 'string', as: unionOf(mergeClassDecision.shape.roundOpen.options[0].shape.fixRound.unwrap().shape.as.options) }),
  // A repair reserved for after the entry lands: its agent, how it was asked, and the run the ask is kept on.
  shape<Extract<MergeClassDecision['roundOpen'], { open: false }>['reserved']>('RoundOpenReserved', {
    agent: 'string', as: unionOf(mergeClassDecision.shape.roundOpen.options[1].shape.reserved.shape.as.options), holder: 'string',
  }),
  shape<RepairFact>('RepairFact', { problem: 'string', files: 'RepairedFile[]' }),
  shape<RepairFact['files'][number]>('RepairedFile', { file: 'string', passed: 'boolean' }),
  // Its stalls, its waits, the red on main it found, and the presses it needs.
  checkedInLib('MergeStalls'),
  checkedInLib('StallsAsked'),
  // The state machine writes the wait for room, the files red on main, the documents and what it told inline, so their keys are written here by hand.
  shape<{ since: string; at: string; says: string; message: unknown; toldAt: unknown; toldTime: unknown }>('WaitingForRoom', {
    since: 'string', at: 'string', says: 'string', message: 'string | null', toldAt: 'string | null', toldTime: 'ClockStamp',
  }),
  shape<WaitsForAFixRound>('WaitsForAFixRound', {
    since: 'string', time: 'ClockStamp', until: 'string', dueAt: 'string', timeZone: 'string', minutes: 'number', asks: 'FixRoundAsk[]', opened: 'FixRoundOpened',
    reserved: 'FixRoundReserved',
  }),
  shape<FixRoundAsk>('FixRoundAsk', {
    for: "'line' | 'sheriff'", agent: 'string', at: 'string', brief: 'string', status: 'number', said: 'string', holder: 'string', started: 'FixRoundStarted', ended: 'FixRoundEnded',
  }),
  shape<NonNullable<FixRoundAsk['started']>>('FixRoundStarted', { at: 'string', run: 'string' }),
  shape<NonNullable<FixRoundAsk['ended']>>('FixRoundEnded', { at: 'string', says: 'string' }),
  shape<NonNullable<WaitsForAFixRound['opened']>>('FixRoundOpened', { at: 'string', for: "'line' | 'sheriff' | 'starter'", agent: 'string', run: 'string' }),
  shape<NonNullable<WaitsForAFixRound['reserved']>>('FixRoundReserved', { at: 'string', for: "'line' | 'sheriff'", agent: 'string', holder: 'string' }),
  shape<{ file: string; mainAt: string; log: string; problem: string; at: string }>('RedOnMain', { file: 'string', mainAt: 'string', log: 'string', problem: 'string', at: 'string' }),
  checkedInLib('MergeDeletes'),
  checkedInLib('PressToLand'),
  checkedInLib('PressedBy'),
  checkedInLib('PressLeftOut'),
  shape<{ tree: string; files: string[] }>('MergeDocuments', { tree: 'string', files: 'string[]' }),
  shape<{ submitter: string[]; secretary: unknown; says: string }>('MergeTold', { submitter: 'string[]', secretary: 'string | null', says: 'string' }),
  // Its bounce, the conflict it waits to have resolved, and the resolution.
  shape<Bounce>('Bounce', {
    reason: unionOf(BOUNCE_REASONS), at: 'string', files: 'string[]', redTests: 'string[]', changedTheirAnswer: 'string[]', log: 'string', mainAt: 'string',
    resolution: unionOf(RESOLUTION_BOUNCES), cannot: 'BounceCannot', says: 'string',
  }),
  shape<NonNullable<Bounce['cannot']>>('BounceCannot', { by: 'ParticipantRef', said: 'string' }),
  shape<Resolving>('Resolving', {
    files: 'string[]', log: 'string', mainAt: 'string', says: 'string', since: 'string', timeZone: 'string', minutes: 'number', nobodyStarted: 'NobodyStarted',
    asked: 'AskedToResolve', resolvedBefore: 'ResolvedBefore', red: 'ResolvingRed', replays: 'ResolvingReplays',
  }),
  shape<NobodyStarted>('NobodyStarted', { by: 'ParticipantRef', at: 'string', status: 'number', said: 'string' }),
  shape<AskedToResolve>('AskedToResolve', { agent: 'string', brief: 'string', noBrief: 'string', message: 'string', noMessage: 'string', round: 'AskedToResolveRound' }),
  shape<NonNullable<AskedToResolve['round']>>('AskedToResolveRound', { at: 'string', status: 'number', said: 'string', run: 'string' }),
  shape<NonNullable<Resolving['resolvedBefore']>>('ResolvedBefore', { files: 'string[]', commit: 'string', mainAt: 'string' }),
  shape<NonNullable<Resolving['red']>>('ResolvingRed', { tests: 'string[]' }),
  shape<NonNullable<Resolving['replays']>>('ResolvingReplays', { ref: 'string', commit: 'string' }),
  shape<Resolution>('MergeResolution', {
    commit: 'string', workingDirectory: 'string', mainAt: 'string', files: 'ResolvedFile[]', by: 'ParticipantRef', at: 'string', tests: 'DeclaredTestRun',
    refused: 'ResolutionRefused', checked: 'ResolutionChecked',
  }),
  shape<Resolution['files'][number]>('ResolvedFile', { path: 'string', hash: 'string | null', mode: 'string | null' }),
  shape<DeclaredTestRun>('DeclaredTestRun', { commit: 'string', exit: 'number', counts: 'TestCounts', log: 'string', by: 'ParticipantRef', at: 'string' }),
  shape<DeclaredTestRun['counts']>('TestCounts', { passed: 'number', failed: 'number' }),
  shape<NonNullable<Resolution['refused']>>('ResolutionRefused', { at: 'string', says: 'string', message: 'string', noMessage: 'string' }),
  shape<NonNullable<Resolution['checked']>>('ResolutionChecked', { at: 'string', ref: 'string', places: 'ResolvedPlace[]', morePlaces: 'number', fixed: 'string[]' }),
  shape<ResolvedPlace>('ResolvedPlace', {
    path: 'string', at: 'number', entryCommit: 'string', resolvedIn: 'string | null', ancestor: 'SideOfAPlace', main: 'SideOfAPlace', entry: 'SideOfAPlace',
    resolution: 'SideOfAPlace', mainCommits: 'MainCommit[]', mainBy: "'lines' | 'file'", ambiguous: 'boolean',
  }),
  shape<SideOfAPlace>('SideOfAPlace', { lines: 'string[]', more: 'number' }),
  shape<ResolvedPlace['mainCommits'][number]>('MainCommit', { commit: 'string', entry: 'string | null' }),
  // A landing's receipt, which the merge entry and the run that landed both keep.
  shape<IntegrationReceipt>('IntegrationReceipt', {
    entry: 'string', mainBefore: 'string', mainAfter: 'string', rebasedTip: 'string | null', sealId: 'string', carriedVerdict: 'CarriedVerdict', reinspected: 'Reinspected[]',
    tests: 'IntegrationTests', ownerContent: 'OwnerContentReminders', placeholderCommits: 'PlaceholderCommits', at: 'string', time: 'ClockStamp',
  }),
  shape<IntegrationReceipt['carriedVerdict']>('CarriedVerdict', { run: 'string', by: 'ParticipantRef', at: 'string', how: 'string', paths: 'number', says: 'string' }),
  shape<NonNullable<IntegrationReceipt['tests']>>('IntegrationTests', {
    ran: 'number', passed: 'number', log: 'string', plugin: 'APluginOnlyChange', green: 'boolean', wholeSuiteRed: 'WholeSuiteRed', busCause: 'BusCause',
    houseRules: 'HouseRulesDecision', mergeClass: 'MergeClassDecision', build: 'BuildPassed', repair: 'RepairFact',
  }),
  // The stores that are not records. A run's request, as the dispatch wrote it.
  checkedInLib('RunRequest'),
  checkedInLib('RunRequestThread'),
  checkedInLib('RunRequestRecipient'),
  checkedInLib('RunRequestResume'),
  checkedInLib('RunRequestMessage'),
  checkedInLib('RunRequestQuote'),
  // The office map's layout.
  shape<ForestMapState>('ForestMapState', {
    version: 'number', seed: 'string', grouping: unionOf(forestMapStateSchema.shape.grouping.options), regions: 'ForestRegion[]',
    assignments: 'Record<string, ForestAssignment>', roads: 'ForestPoint[][]',
  }),
  shape<ForestRegion>('ForestRegion', {
    id: 'string', groupKey: 'string', zone: unionOf(FOREST_ZONES), workspaceId: 'string | null', teamId: 'string | null', origin: 'ForestPoint',
    profile: unionOf(A_MAP_REGION.profile.options), cells: 'ForestPoint[]', slots: 'ForestPoint[]', door: 'ForestPoint',
  }),
  shape<ForestMapState['assignments'][string]>('ForestAssignment', { regionId: 'string', slot: 'number', groupKey: 'string', workspaceId: 'string | null', active: 'boolean' }),
  shape<ForestRegion['origin']>('ForestPoint', { x: 'number', y: 'number' }),
  // A folder reading's pieces. A piece's data is read by the kind the piece names (DATA_OF_A_KIND).
  shape<FolderReadingPiece>('FolderReadingPiece', {
    id: 'string', kind: 'string', title: 'string', summary: 'string | null', data: 'Record<string, unknown>', from: 'string[]', quote: 'string', state: unionOf(PIECE_STATES),
    recordId: 'string | null', decidedAt: 'string | null', decidedBy: 'string | null', rejectionUndo: 'FolderPieceUndoOffer', lastRejectionUndo: 'FolderPieceUndone',
  }),
  shape<NonNullable<FolderReadingPiece['rejectionUndo']>>('FolderPieceUndoOffer', { token: 'string', atMs: 'number', fingerprint: 'string' }),
  shape<NonNullable<FolderReadingPiece['lastRejectionUndo']>>('FolderPieceUndone', { at: 'string', by: 'string' }),
  // The inputs of each act that may be asked for one press or in a signing package.
  checkedInLib('SettingInputs'),
  checkedInLib('AskAtTheDoorInputs'),
  checkedInLib('RuleMarkInputs'),
  checkedInLib('GrantListInputs'),
  checkedInLib('GrantListChange'),
  // A casting image, as a casting history row keeps it before and after a change: the cells side by side, then the mark and the native state.
  // An image written before migration 0349 holds the cell work_group, and no labels or Out until.
  shape<Record<CastingCell, CastingStoredCell> & Omit<CastingImage, 'cells' | 'workGroup'> & { work_group?: CastingStoredCell }>('CastingImage', {
    ...(Object.fromEntries(CASTING_CELLS.map((cell) => [cell, 'CastingStoredCell'])) as Record<CastingCell, string>),
    work_group: 'CastingStoredCell',
    marked: 'boolean | null', native: 'CastingNative | null', selectionRevision: 'string', hold: 'CastingHold | null',
  }),
  shape<CastingStoredCell>('CastingStoredCell', { value: 'string | null', from: 'CastingCellSource | null' }),
  // A Casting label, as a label's history row keeps it before and after a change.
  shape<CastingLabelImage>('CastingLabelImage', { name: 'string', meaning: 'CastingStoredCell' }),
  // decisionWords is present only on a source a migration set from a decision's words; this list cannot mark a field that may be absent.
  shape<CastingCellSource>('CastingCellSource', { at: 'string', by: 'CastingWriter', decision: 'CastingDecision | null', decisionWords: 'string', moved: 'boolean', copied: 'boolean' }),
  // A cell's writer is an actor, or the migration that set the value: 0318 sets each work group as the migration.
  shape<CastingCellSource['by']>('CastingWriter', { kind: unionOf([...ACTOR_TYPES, 'migration']), id: 'string' }),
  shape<NonNullable<CastingCellSource['decision']>>('CastingDecision', { id: 'string', project: 'string' }),
  // settings is present only on a row that has some, and providerRow only on a row that names a provider row. A setting's
  // value is any JSON its writer gives the program, so the setting's shape is open: its name is read, and its value blocks
  // as an open bag that nothing reads.
  shape<CastingNative>('CastingNative', { model: 'string', provider: 'string | null', variant: 'string | null', providerRow: 'string', settings: 'CastingSetting[]' }),
  shape<Pick<CastingSetting, 'name'>>('CastingSetting', { name: 'string' }, true),
  shape<CastingHold>('CastingHold', { revision: 'string', run: 'string', refusal: 'CastingHoldRefusal', at: 'string' }),
  shape<CastingHold['refusal']>('CastingHoldRefusal', { kind: "'model' | 'option'", code: 'string', said: 'string' }),
  // Who a key proved, beside the name the request's headers gave, as a change row and a revision keep it.
  shape<ProvedHolder>('ProvedHolder', { id: 'string', how: unionOf(Object.keys(HOW_A_KEY_PROVED)), claimed: 'string' }),
  checkedInLib('ReadsReleasesFromTheCheck'),
  // A person's own tag, as the tags door keeps it: its agents are registry ids.
  shape<AgentTag>('AgentTag', { name: 'string', colour: 'string', agents: 'string[]' }),
]

/**
 * HOW ONE OPEN BAG IS READ. `type` reads it by an adapter type. `check` asks the writer's own reader whether the value
 * is what the writer writes; such a bag holds no agent identity. `encoded` is read by a reader of its own in
 * ./historical-reader.ts. `nothing` blocks it whole.
 */
export type OpenBag =
  | { reads: 'type'; type: string; writer: string }
  | { reads: 'check'; writer: string; check: (value: unknown) => string | null }
  | { reads: 'encoded'; writer: string }
  | { reads: 'nothing'; because: string }

const aCastingRoll = (writer: string): OpenBag => ({ reads: 'check', writer, check: whyItIsNotACastingRoll })
/** A bag the writer reads back through a zod schema of its own: the schema decides, and its refusal is the reason. */
const throughTheSchema = (writer: string, schema: ZodType): OpenBag => ({
  reads: 'check',
  writer,
  check: (value) => {
    const read = schema.safeParse(value)
    return read.success ? null : read.error.message
  },
})
const MERGE_QUEUE = 'src/server/lib/merge-queue.ts'
const MERGE_STATE_MACHINE = 'src/server/lib/merge-state-machine.ts'
const byTheQueue = (type: string): OpenBag => ({ reads: 'type', type, writer: MERGE_QUEUE })
const byTheStateMachine = (type: string): OpenBag => ({ reads: 'type', type, writer: MERGE_STATE_MACHINE })
const AUTHORED: OpenBag = { reads: 'nothing', because: 'Its keys are declared nowhere, and whoever writes the record may write any of them.' }
const A_CHECK: OpenBag = { reads: 'nothing', because: "The check of a sealed run writes it, and its writers' types are not declared here yet." }
const notYet = (writes: string): OpenBag => ({ reads: 'nothing', because: `${writes}, and its writer's type is not declared here yet.` })

/**
 * EVERY OPEN BAG KINDS.TS DECLARES, by its site: the kind or shape, a dot, and the field. Where kinds.ts declares a
 * list of bags, the type is the type of one entry, and where it declares a bag or null, it is the type of the bag.
 */
export const OPEN_BAGS: Readonly<Record<string, OpenBag>> = {
  'message.routed': { reads: 'type', type: 'RoutedAddressee', writer: 'src/server/lib/messages.ts and src/server/lib/deadletters.ts' },
  'message.carriedTo': { reads: 'type', type: 'CarriedTo', writer: 'src/server/lib/messages.ts' },
  'message.askedToResolve': { reads: 'type', type: 'AskedToResolveMessage', writer: 'src/server/lib/merge-state-machine.ts' },
  'message.edited': { reads: 'type', type: 'MessageEdited', writer: 'src/server/lib/records.ts' },
  'message.extra': { reads: 'type', type: 'MessageExtra', writer: 'src/server/lib/remind-me-later.ts' },
  'message.summons': { reads: 'type', type: 'Summons', writer: 'src/server/lib/summons.ts' },
  'message.deadLetterSweep': { reads: 'encoded', writer: 'src/server/lib/deadletters.ts' },
  'session.paused': { reads: 'type', type: 'SessionPaused', writer: 'src/server/lib/pausing.ts' },
  'session.resume': { reads: 'type', type: 'SessionResume', writer: 'src/server/lib/interrupted.ts' },
  'session.extra': { reads: 'type', type: 'SessionExtra', writer: 'src/server/lib/terminal-agents.ts' },
  'session.castingRoll': aCastingRoll('src/server/lib/casting-roll.ts'),
  'WorkerRun.castingRoll': aCastingRoll('src/server/lib/worker-runs.ts'),
  'WorkerRunStarting.castingRoll': aCastingRoll('src/server/lib/worker-runs.ts'),
  'counter.createdBy': { reads: 'type', type: 'ParticipantRef', writer: 'src/server/lib/counters.ts' },
  'counter.mayAdd': { reads: 'type', type: 'WhoMayAdd', writer: 'src/server/lib/counters.ts' },
  'counter.follows': { reads: 'type', type: 'CounterFollow', writer: 'src/server/lib/counters.ts' },
  'counter.triggers': { reads: 'type', type: 'CounterTrigger', writer: 'src/server/lib/counters.ts' },
  'counter.action': { reads: 'type', type: 'CounterAction', writer: 'src/server/lib/counters.ts' },
  'counter.pause': { reads: 'type', type: 'CounterPause', writer: 'src/server/lib/counters.ts' },
  'secretary_duties.supervisors': { reads: 'type', type: 'SupervisorAnswered', writer: 'src/server/lib/grant/secretary-duties.ts' },
  'agent.filesArea': { reads: 'type', type: 'FilesAreaFolder', writer: 'src/server/lib/participants.ts' },
  'sealed_tip.starterNotice': { reads: 'type', type: 'TheStarterNotice', writer: 'src/server/lib/sealed-tip.ts' },
  'emergency_push.by': { reads: 'type', type: 'ParticipantRef', writer: 'src/server/lib/emergency-push.ts' },
  'emergency_push.line': { reads: 'type', type: 'ParticipantRef', writer: 'src/server/lib/emergency-push.ts' },
  'emergency_push.ended': { reads: 'type', type: 'EmergencyPushEnded', writer: 'src/server/lib/emergency-push.ts' },
  'emergency_push.message': throughTheSchema('src/server/lib/emergency-push.ts', emergencyPushRequestSchema.shape.message),

  'merge_entry.seal': byTheQueue('MergeSeal'),
  'merge_entry.changeset': byTheQueue('MergeChangeset'),
  'merge_entry.submittedBy': byTheQueue('ParticipantRef'),
  'merge_entry.submittedTime': byTheQueue('ClockStamp'),
  'merge_entry.suiteWorkers': byTheQueue('SuiteWorkers'),
  'merge_entry.withdrawn': byTheQueue('MergeWithdrawn'),
  'merge_entry.movedFirst': byTheStateMachine('MovedFirst'),
  'merge_entry.returnsFirst': byTheStateMachine('ReturnsFirst'),
  'merge_entry.superseded': byTheQueue('MergeSuperseded'),
  'merge_entry.tool': byTheQueue('MergeTool'),
  'merge_entry.toolWanted': byTheQueue('MergeToolWanted'),
  'merge_entry.judged': byTheStateMachine('Record<string, string>'),
  'merge_entry.handedOn': byTheStateMachine('Record<string, string>'),
  'merge_entry.verdict': byTheStateMachine('MergeVerdict'),
  'merge_entry.checked': byTheStateMachine('MergeChecked'),
  'merge_entry.integration': byTheStateMachine('MergeIntegration'),
  'merge_entry.reinspection': byTheStateMachine('Reinspection'),
  'merge_entry.reinspected': byTheStateMachine('Reinspected'),
  'merge_entry.takeBackOf': throughTheSchema(MERGE_QUEUE, takeBackOfSchema),
  'merge_entry.repairOf': throughTheSchema(MERGE_QUEUE, repairOfSchema),
  'merge_entry.tested': byTheStateMachine('MergeTested'),
  'merge_entry.stalls': byTheStateMachine('MergeStalls'),
  'merge_entry.waitingForRoom': byTheStateMachine('WaitingForRoom'),
  'merge_entry.waitsForAFixRound': byTheStateMachine('WaitsForAFixRound'),
  'merge_entry.redOnMain': byTheStateMachine('RedOnMain'),
  'merge_entry.deletes': byTheStateMachine('MergeDeletes'),
  'merge_entry.pressToLand': byTheStateMachine('PressToLand'),
  'merge_entry.documents': byTheStateMachine('MergeDocuments'),
  'merge_entry.bounced': byTheStateMachine('Bounce'),
  'merge_entry.resolving': byTheStateMachine('Resolving'),
  'merge_entry.resolution': byTheStateMachine('MergeResolution'),
  'merge_entry.integrated': byTheStateMachine('IntegrationReceipt'),
  'merge_entry.told': byTheStateMachine('MergeTold'),
  'session.integrated': byTheStateMachine('IntegrationReceipt'),

  'Release.judged': A_CHECK,
  'Release.traced': A_CHECK,
  'Release.standard': A_CHECK,
  'Refusal.traced': A_CHECK,
  'TheCheckTheOfficeAskedFor.execution': A_CHECK,
  'TheCheckTheOfficeAskedFor.eligibility': A_CHECK,
  'TheCheckTheOfficeAskedFor.yeses': { reads: 'nothing', because: 'Checks asked by an earlier revision of the office may hold it. Nothing writes or reads it now.' },
  'NextRoundAtTheSeal.brief': notYet('The seal writes the brief it read'),
  'AtTheSeal.yeses': { reads: 'nothing', because: 'Runs sealed by an earlier revision of the office may hold it. Nothing writes or reads it now.' },

  'session.submission': notYet('The run writes what it submits'),
  'session.worldsStop': notYet('The office writes what became of the test worlds when the run was confirmed'),
  'session.sandbox': notYet('The office writes the sandbox the run happened in'),
  'session.cutFromCommit': notYet('The filing tool writes the commit the run was cut from'),
  'session.aCheckNothingStarts': notYet('The office writes the mark of a check nothing in the office would start'),
  'session.conversationSync': notYet("The conversation sync writes the scrubbed copy of the run's own conversation file"),
  'sealed_tip.seal': notYet('The office writes the seal'),
  'emergency_push.switch': notYet("The push door writes the emergency switch's gate row as it judged it"),
  'role_card.card': notYet('The office writes the whole card as it reads it'),
  'StableOfficeNoticeEvent.request': notYet('The upgrade notice door writes a request whose version selects its contract'),

  'module.extra': AUTHORED,
  'pipeline.extra': AUTHORED,
  'block.extra': AUTHORED,
  'problem.extra': AUTHORED,
  'task.extra': AUTHORED,
  'purchase.extra': AUTHORED,
  'obligation.extra': AUTHORED,
  'claim.extra': AUTHORED,
  'proposal.extra': AUTHORED,
  'decision.extra': AUTHORED,
  'idea.extra': AUTHORED,
  'direction.extra': AUTHORED,
  'wanna_try.extra': AUTHORED,
  'note.extra': AUTHORED,
  'report.extra': AUTHORED,
  'criticism.extra': AUTHORED,
  'draft.extra': AUTHORED,
  'draft.turn': notYet("Only Mole Office writes it, when it holds a run's words for their readers"),
  'annotation.extra': AUTHORED,
  'agent.extra': AUTHORED,
  'stopping_point.extra': AUTHORED,
  'placeholder.extra': AUTHORED,
  'ran_instead.extra': AUTHORED,
  'work_domain.extra': AUTHORED,
  'trajectory.extra': AUTHORED,
  'planned_state.extra': AUTHORED,
  'context_bundle.extra': AUTHORED,
  'role_card.extra': AUTHORED,
  'role_card_words.extra': AUTHORED,
  'role_request.extra': AUTHORED,
  'notebook.extra': AUTHORED,
  'incident.extra': AUTHORED,
  'regulation.extra': AUTHORED,
  'goal.extra': AUTHORED,
  'flow.extra': AUTHORED,
  'flow_run.extra': AUTHORED,
  'tool_category.extra': AUTHORED,
  'tool.extra': AUTHORED,
  'secretary_duties.extra': AUTHORED,
  'department.extra': AUTHORED,
  'watch.extra': AUTHORED,
  'backlog_item.extra': AUTHORED,
  'host_job.arguments': notYet('The host job door writes the named values asked with, each of the shape its tool declares'),
  'host_job.askedBy': notYet('The host job door writes the caller in one of two shapes: the run that asked, proved by its run key, and its agent; or the person or secretary as {kind, id}'),
  'host_job.outputs': notYet("The host job runner's finish writes each declared output as it found it"),
  'host_job.extra': { reads: 'nothing', because: 'Only the host job doors write a host job, and none of them writes this field.' },
  'pack.counts': { reads: 'nothing', because: 'The counts hold numbers describing the pack.' },
  'pack.previous': { reads: 'nothing', because: 'The link holds a pack file name and a fingerprint.' },
  'pack.base': { reads: 'nothing', because: 'The link holds a pack file name and a fingerprint.' },
  'pack.extra': { reads: 'nothing', because: 'Only the pack filing function writes a pack record, and it writes no extra field.' },
  'handbook.extra': AUTHORED,
  'design.extra': AUTHORED,
}

const FOLDER_READINGS = 'src/server/lib/folderreading.ts'
const CASTING = 'src/server/lib/casting.ts, and migration 0190, which copied the older history into it'
const CASTING_LABELS = 'src/server/lib/casting-labels.ts, and migration 0349, which made the first labels'
const THE_FIRST_CASTING = 'migration 0189, and src/server/lib/casting.ts until migration 0190; nothing writes it now'
/** The four cells of the casting table of migration 0189, which has kept them as they were since migration 0190. */
const THE_FIRST_CASTINGS_CELLS = ['program', 'model', 'effort', 'why'] as const satisfies readonly CastingCell[]
const THE_AGENT_RECORD = "src/server/lib/participants.ts, which copies it from the agent record's data"
const THE_LEDGERS = "src/server/lib/records.ts, which writes a change row and its revision from one actor"

/**
 * A FIELD THAT HOLDS A RECORD'S DATA, read by the kind its holder names in `kindIn`. `marks` are the keys the writer adds
 * to the kind's own fields, each with its declared type.
 */
export interface DataOfAKind {
  kindIn: string
  marks: Readonly<Record<string, string>>
  writer: string
}

/** Every adapter field that holds a record's data, by its site. */
export const DATA_OF_A_KIND: Readonly<Record<string, DataOfAKind>> = {
  'FolderReadingPiece.data': { kindIn: 'kind', marks: { editedBeforeAccepting: 'boolean' }, writer: FOLDER_READINGS },
}

/**
 * The adapter of each act's inputs. src/server/lib/registry-aliases/open-shapes.ts binds its keys to the acts the office
 * knows, so tsc refuses there a list that misses an act or names one the office does not know.
 */
export const INPUTS_OF_AN_ACT = {
  'change-a-setting': 'SettingInputs',
  'answer-an-ask-at-the-door': 'AskAtTheDoorInputs',
  'mark-a-rule-only-for-this-office': 'RuleMarkInputs',
  'change-what-the-grant-carries': 'GrantListInputs',
} as const satisfies Readonly<Record<string, string>>

/**
 * HOW ONE STORED COLUMN THAT IS NOT A RECORD'S DATA IS READ. `type` reads it by one adapter type. `by-act` reads it by the
 * type of the act its row names in the column `act`.
 */
export type StoredColumn =
  | { reads: 'type'; type: string; writer: string }
  | { reads: 'by-act'; types: typeof INPUTS_OF_AN_ACT; writer: string }
  /** Read by one type, and the re-mint gives each old registry id the reader finds in it its new id (remint-plain.ts). */
  | { reads: 'type'; type: string; writer: string; remint: 'rewrites-each-registry-id' }

/** EVERY COLUMN OUTSIDE THE RECORDS TABLE THAT THE IDENTITY READER READS, by its table, a dot, and the column. */
export const STORED_COLUMNS: Readonly<Record<string, StoredColumn>> = {
  'agent_runs.request': { reads: 'type', type: 'RunRequest', writer: 'src/server/lib/agents.ts' },
  'office_map_layouts.data': { reads: 'type', type: 'ForestMapState', writer: 'src/server/lib/forest-map.ts until wave 13y round 119; nothing writes it now' },
  'folder_readings.pieces': { reads: 'type', type: 'FolderReadingPiece[]', writer: FOLDER_READINGS },
  'one_press_requests.inputs': { reads: 'by-act', types: INPUTS_OF_AN_ACT, writer: 'src/server/lib/one-press.ts' },
  'signing_package_items.inputs': { reads: 'by-act', types: INPUTS_OF_AN_ACT, writer: 'src/server/lib/signing-packages.ts' },
  'casting_changes.before': { reads: 'type', type: 'CastingImage', writer: THE_FIRST_CASTING },
  'casting_changes.after': { reads: 'type', type: 'CastingImage', writer: THE_FIRST_CASTING },
  'casting_row_changes.before': { reads: 'type', type: 'CastingImage', writer: CASTING },
  'casting_row_changes.after': { reads: 'type', type: 'CastingImage', writer: CASTING },
  ...theCastingSources('casting_rows', CASTING_CELLS, CASTING),
  'casting_rows.work_group_from': { reads: 'type', type: 'CastingCellSource', writer: 'migration 0318; nothing writes it since 0349' },
  'casting_labels.meaning_from': { reads: 'type', type: 'CastingCellSource', writer: CASTING_LABELS },
  'casting_label_changes.before': { reads: 'type', type: 'CastingLabelImage', writer: CASTING_LABELS },
  'casting_label_changes.after': { reads: 'type', type: 'CastingLabelImage', writer: CASTING_LABELS },
  ...theCastingSources('casting', THE_FIRST_CASTINGS_CELLS, THE_FIRST_CASTING),
  'agents.card_chosen_by': { reads: 'type', type: 'WhoChoseTheCard', writer: THE_AGENT_RECORD },
  'agents.elevation': { reads: 'type', type: 'Elevation[]', writer: THE_AGENT_RECORD },
  'agents.reads_releases_from_the_check': { reads: 'type', type: 'ReadsReleasesFromTheCheck', writer: 'src/server/lib/participants.ts' },
  'changes.elevation': { reads: 'type', type: 'Elevation', writer: THE_LEDGERS },
  'changes.proved_holder': { reads: 'type', type: 'ProvedHolder', writer: THE_LEDGERS },
  'revisions.elevation': { reads: 'type', type: 'Elevation', writer: THE_LEDGERS },
  'revisions.proved_holder': { reads: 'type', type: 'ProvedHolder', writer: THE_LEDGERS },
  'people.agent_tags': { reads: 'type', type: 'AgentTag[]', writer: 'src/server/lib/agent-tags.ts', remint: 'rewrites-each-registry-id' },
}

/** The source beside each cell of a casting table's row, which holds the writer of the cell's value. */
function theCastingSources<T extends string, C extends CastingCell>(table: T, cells: readonly C[], writer: string): Record<`${T}.${C}_from`, StoredColumn> {
  const out = {} as Record<`${T}.${C}_from`, StoredColumn>
  for (const cell of cells) out[`${table}.${cell}_from`] = { reads: 'type', type: 'CastingCellSource', writer }
  return out
}

/** A reader of the declared type language that also knows the adapters. It throws when an adapter takes a name kinds.ts uses. */
export const typeOf: (expr: string) => DeclaredType = aTypeReaderWith(new Set(ADAPTER_SHAPES.map((one) => one.name)))

/** A shape as the identity reader walks it: one of kinds.ts or an adapter. */
export type AShape = Pick<AdapterShape, 'fields' | 'discriminator' | 'open'>

const SHAPES: ReadonlyMap<string, AShape> = new Map<string, AShape>([
  ...Object.values(SHAPE_SPECS).map((spec): [string, AShape] => [spec.name, { fields: spec.fields, discriminator: spec.discriminator, open: false }]),
  ...ADAPTER_SHAPES.map((one): [string, AShape] => [one.name, one]),
])

/** The shape by that name, of kinds.ts or an adapter, or undefined because neither declares it. */
export function theShapeNamed(name: string): AShape | undefined {
  return SHAPES.get(name)
}
