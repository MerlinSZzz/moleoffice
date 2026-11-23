// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createI18n, t, type WordKey, type WordValues } from './i18n.ts'
import { cardWord } from './card-words.ts'
import { stateWord } from './words.ts'

/**
 * THE SENTENCES THE SERVER WRITES FOR THE DEVELOPER PAGES, EACH DECLARED ONCE WITH ITS VALUES.
 *
 * A page draws its sentences in the page's language, and a reply nobody sees on a page stays
 * English. The runtime, usage and worlds pages draw sentences the
 * server writes. So the server sends each one twice: its English sentence, for agents and logs, and a
 * code with values beside it. The page draws the code from the word lists, under the key
 * `devWords.said.<code>`, the way ErrorNote draws a refusal code (src/shared/refusal-codes.ts).
 *
 * THE ENGLISH IS THE WORD LIST'S ENGLISH. The server writes its sentence with `inEnglish`, from the
 * same entry the page reads, so the two cannot say different things.
 *
 * A value is content: a path, a name, a time or a count. It is never translated. Four values are
 * the exception, because the server fills them with a word of its own rather than with content:
 * `source` (which layer of the settings set something), `where` (which slot of the Settings page's
 * run models), `role` (a card name) and `state` (a run's state). The server sends the stored word,
 * and `valueWord` below reads it in the language being drawn.
 */
export const DEV_SAYINGS = {
  // ---- wave 13k round 36: profile world notes
  profileWorldNamedByOffice: { at: 'string' },
  profileWorldMissingFromOffice: { at: 'string' },
  profileWorldListUnread: { why: 'string' },
  // ---- #/runtime: who started this server
  runtimeNobodyRegistered: {},
  runtimeRegisteredBy: { who: 'string', at: 'string' },
  runtimeRegisteredByEnded: { who: 'string', at: 'string' },
  runtimeRegisteredByMaybeEnded: { who: 'string', at: 'string' },
  // ---- #/runtime: why it is a scratch server
  runtimeScratchWorktree: { path: 'string' },
  runtimeScratchDatabase: { path: 'string', canonical: 'string' },
  runtimeScratchTestRunner: {},
  runtimeScratchPort: { port: 'string', declared: 'string' },
  // ---- #/runtime: its address
  runtimeAddressDiffers: { api: 'string', declared: 'string' },
  // ---- #/runtime: how long it has run
  runtimeAgeSeconds: { n: 'number' },
  runtimeAgeMinutes: { n: 'number' },
  runtimeAgeHours: { n: 'number' },
  runtimeAgeDays: { n: 'number' },
  // ---- #/runtime: how new its code is
  runtimeFreshnessUnknown: {},
  runtimeFreshnessOlder: { loaded: 'string', n: 'number', file: 'string', changed: 'string' },
  runtimeFreshnessCurrent: { loaded: 'string', n: 'number', file: 'string', changed: 'string' },
  // ---- #/runtime: the database file
  databaseUnreadable: { path: 'string' },
  databaseDeleted: { path: 'string' },
  databaseReplaced: { path: 'string' },
  // ---- #/runtime: the message worker
  workerNothingTried: {},
  workerOff: {},
  workerUnderATestRunner: {},
  workerCannotStartAProcess: {},
  workerStarted: { pid: 'string', group: 'string', log: 'string' },
  workerDidNotStart: { because: 'string' },
  workerRunGoing: { handle: 'string', runtime: 'string', at: 'string' },
  workerRunWaitOver: { handle: 'string', runtime: 'string', until: 'string' },
  workerRunWaiting: { handle: 'string', runtime: 'string', n: 'number', until: 'string' },
  workerLastRun: { handle: 'string', state: 'string', at: 'string' },
  // ---- #/runtime: which runs go where
  placeConversation: {},
  placeBuilder: { card: 'string' },
  placeCheck: {},
  placeConversationNote: {},
  placeBuilderNote: {},
  placeNotices: {},
  runtimeOfACheck: { runtime: 'string' },
  runtimeAskedFor: { runtime: 'string' },
  runtimeOnTheAgentRecord: {},
  runtimeOnTheSettingsPage: { where: 'string' },
  runtimeNobodyNamesABuilders: {},
  runtimeBuilderNobodyNames: {},
  runtimeBuilderOnTheCasting: {},
  runtimeOnTheCasting: { role: 'string' },
  settingNobodySetChoreRuntime: { setting: 'string' },
  settingNobodySetChoreModel: { setting: 'string' },
  settingNobodySetChoreVariant: { setting: 'string' },
  settingNobodySetTheModel: { setting: 'string' },
  settingSaysSo: { setting: 'string', source: 'string' },
  modelNotPassed: { runtime: 'string' },
  modelChosenInTheHarness: { runtime: 'string' },
  modelCodexNeedsItsRow: { agent: 'string', role: 'string' },
  castingNoRowInForce: { role: 'string' },
  castingRowNoProgram: { row: 'string' },
  castingRowForAnotherProgram: { row: 'string', program: 'string' },
  castingRowNoModel: { row: 'string' },
  castingRowNoNativeModel: { row: 'string' },
  castingRowNoEffort: { row: 'string' },
  modelCodexFillInTheRow: { role: 'string' },
  modelCodexNoCard: { agent: 'string' },
  modelCodexTakesTheAgentsRow: {},
  modelNamedByCaller: { model: 'string' },
  modelNameMatchesRowsOfDifferentModels: { name: 'string', rows: 'string' },
  effortFromAgent: { effort: 'string' },
  effortFromAgentInPlaceOfTheRow: { effort: 'string', row: 'string', rowEffort: 'string' },
  effortFromCasting: { effort: 'string', role: 'string' },
  effortFromCastingRoll: { effort: 'string', row: 'string' },
  effortFromTheNamedRow: { effort: 'string', row: 'string', name: 'string' },
  effortFromRule: { effort: 'string' },
  effortNoneForModel: { model: 'string' },
  effortNoModel: {},
  effortTheRunIsRefused: {},
  effortCastingModelDiffers: { model: 'string', asked: 'string' },
  roundKeepsThePreviousModel: { card: 'string', project: 'string', model: 'string', run: 'string' },
  roundKeepsTheUnmatchedRun: { row: 'number', card: 'string', program: 'string', runtime: 'string', model: 'string', run: 'string' },
  roundRowCastsAnotherRuntime: { row: 'number', card: 'string', program: 'string', model: 'string', run: 'string', runtime: 'string' },
  modelTheAgentsOwn: { model: 'string' },
  modelTheAgentsOwnEffortDropped: { model: 'string', effort: 'string' },
  modelTheAgentsOwnIsForAnother: { model: 'string', its: 'string', this: 'string' },
  modelTheCastingNamesNone: { role: 'string' },
  modelOnTheCasting: { model: 'string', role: 'string' },
  modelOnTheCastingEffortDropped: { model: 'string', role: 'string', effort: 'string' },
  modelOnTheCastingNoProgram: { model: 'string', role: 'string' },
  modelOnTheCastingForAnother: { model: 'string', role: 'string', its: 'string', this: 'string' },
  modelNothingOnTheCasting: {},
  modelOnTheSettingsPage: { model: 'string', where: 'string' },
  modelOnTheSettingsPageForAnother: { model: 'string', where: 'string', its: 'string', this: 'string' },
  modelNothingOnTheSettingsPage: {},
  modelOfTheCheck: { model: 'string', source: 'string' },
  modelOnlyClaudeCodeBuilders: { runtime: 'string' },
  settingNobodySetAModel: { setting: 'string' },
  modelNoneSoNoBuilder: {},
  modelNoneSoNoCheck: {},
  modelNoneSoNoConversation: {},
  effortOpencodeOnly: {},
  effortWithTheModel: {},
  effortNoBuilder: {},
  effortNoCheck: {},
  // ---- #/usage
  usagePatternChain: {},
  usagePatternBloat: {},
  usagePatternRefused: {},
  usagePatternGapLacks: {},
  usagePatternGapUnfound: {},
  usagePatternPolling: {},
  usageRefused400: {},
  usageRefused401: {},
  usageRefused403: {},
  usageRefused404: {},
  usageRefused405: {},
  usageRefused409: {},
  usageRefused413: {},
  usageRefused422: {},
  usageRefused429: {},
  usageRefusedOther: { status: 'string' },
  usageNotDeclared: {},
  priceNoTable: {},
  priceUnpricedModel: { model: 'string' },
  priceUnpricedRow: {},
  priceNotEnoughNumbers: {},
  priceNothingToPrice: {},
  // ---- an agent's profile: who is answering as it (src/shared/handles.ts, whoIsAnsweringLine; wave 13k round 35)
  answeringWaitingRunTheOffice: { until: 'string' },
  answeringWaitingRun: { until: 'string' },
  answeringOwnConversation: {},
  answeringLiveSessionTerminal: {},
  answeringLiveSession: { runtime: 'string', machine: 'string' },
  answeringLiveSessionUnread: { runtime: 'string', machine: 'string' },
  answeringRunInASandbox: { sandbox: 'string' },
  answeringRunTheOffice: {},
  answeringRun: {},
  answeringNobody: {},
  // ---- an agent's profile: the compactions summed over its runs (src/server/lib/agent-runs.ts; wave 13k round 52, P91)
  agentCompactionsRecorded: { n: 'number' },
  agentCompactionsNoneRecorded: {},
  agentCompactionsCover: { n: 'number' },
  agentCompactionsOnlyClaudeCode: {},
  agentCompactionsNoClaudeCodeRun: {},
  agentCompactionsOtherRuntime: { n: 'number' },
  agentCompactionsNoRuntime: { n: 'number' },
  // ---- #/worlds
  worldsTestRunnerReadsNoMirror: {},
  worldsTheMainWorldWrites: { file: 'string' },
} as const

export type DevSayingCode = keyof typeof DEV_SAYINGS
export type DevSayingValues<C extends DevSayingCode> = {
  readonly [K in keyof (typeof DEV_SAYINGS)[C]]: (typeof DEV_SAYINGS)[C][K] extends 'number'
    ? Extract<WordValues[string], number>
    : Extract<WordValues[string], string>
}
export type DevSaying = { [C in DevSayingCode]: { code: C; values: DevSayingValues<C> } }[DevSayingCode]

/** The word-list key a code is drawn from. */
export function keyOfSaying(code: DevSayingCode): WordKey {
  return `devWords.said.${code}`
}

/** One sentence the server writes, as a code with its values. */
export function saying<C extends DevSayingCode>(code: C, values: DevSayingValues<C>): DevSaying {
  return { code, values } as DevSaying
}

type Reader = (key: WordKey, values?: WordValues) => string

/** Which layer of the settings set something, as src/config/settings.mjs names it. '.env' is a file. */
const SOURCE_WORDS: Readonly<Record<string, WordKey>> = {
  'the environment': 'devWords.source.environment',
  'the built-in default': 'devWords.source.builtIn',
  'nothing set it': 'devWords.source.nothing',
}

/**
 * THE FOUR VALUES THAT ARE THE SERVER'S OWN WORDS, read in the language being drawn. A word this
 * table does not know is drawn as it was sent: it is then a name, not one of these words.
 */
function valueWord(name: string, value: string | number, read: Reader): string | number {
  if (typeof value !== 'string') return value
  if (name === 'source') {
    const key = SOURCE_WORDS[value]
    return key === undefined ? value : read(key)
  }
  if (name === 'where') {
    if (value === 'conversation') return read('settingsPanel.runModels.slot.conversation')
    return value
  }
  if (name === 'role') return cardWord(value, read)
  if (name === 'state') return stateWord(value).text
  return value
}

function drawn(said: DevSaying, read: Reader): string {
  const values = Object.fromEntries(
    Object.entries(said.values as Readonly<Record<string, string | number>>).map(([name, value]) => [name, valueWord(name, value, read)]),
  )
  return read(keyOfSaying(said.code), values)
}

/** The English every server reply carries, read from the same entry the page reads. */
const english = createI18n('en')
export function inEnglish(said: DevSaying): string {
  return drawn(said, english.t)
}

/** Several sentences in English, one after another, the way the server always joined them. */
export function allInEnglish(said: readonly DevSaying[]): string {
  return said.map(inEnglish).join(' ')
}

/**
 * READ A CODE OFF THE WIRE, or null.
 *
 * An unknown code, or values of the wrong shape, give null, and the page then draws the server's
 * English sentence as it arrived. That keeps a page served by a newer build readable against an
 * older server, and the test in the test language is what finds a sentence that has no code.
 */
export function readSaying(value: unknown): DevSaying | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const { code, values } = value as { code?: unknown; values?: unknown }
  if (typeof code !== 'string' || !Object.hasOwn(DEV_SAYINGS, code)) return null
  const expected = DEV_SAYINGS[code as DevSayingCode] as Readonly<Record<string, string>>
  if (typeof values !== 'object' || values === null || Array.isArray(values)) return null
  if (Object.keys(values).length !== Object.keys(expected).length) return null
  for (const [key, type] of Object.entries(expected)) {
    if (!Object.hasOwn(values, key)) return null
    const one = (values as Record<string, unknown>)[key]
    if (typeof one !== type || (typeof one === 'number' && !Number.isFinite(one))) return null
  }
  return value as DevSaying
}

/** A list of codes off the wire, or null when any one of them cannot be read. */
export function readSayings(value: unknown): DevSaying[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const read = value.map(readSaying)
  return read.every((one) => one !== null) ? (read as DevSaying[]) : null
}

/**
 * WHAT A PAGE DRAWS: the code in the page's language, or the server's own sentence when no code
 * could be read.
 */
export function saidOnThePage(said: unknown, english: string): string {
  const one = readSaying(said)
  if (one !== null) return drawn(one, t)
  const many = readSayings(said)
  if (many !== null) return many.map((each) => drawn(each, t)).join(t('devWords.sentenceGap'))
  return english
}
