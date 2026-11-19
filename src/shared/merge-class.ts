// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Main's inventory is data. Neither the tool nor the office imports or executes its text. */
import { z } from 'zod'
import { latestMomentOfStampInZone, momentOfAnInstant, stampInZone } from './time.ts'

export const HOUSE_RULES_PATH = 'tests/house-rules.mjs'
const classes = ['H', 'P', 'S', 'Q', 'F'] as const
const marks = ['mixed', 'borderline'] as const
export const houseRule = z.object({ class: z.enum(classes), kind: z.string().min(1), mark: z.enum(marks).optional() }).strict()
export type HouseRule = z.infer<typeof houseRule>
const fileFact = houseRule.partial().extend({ file: z.string().min(1) }).strict()
export const houseRulesFact = z.object({
  mainAt: z.string().min(1),
  list: z.discriminatedUnion('state', [
    z.object({ state: z.literal('read') }).strict(),
    z.object({ state: z.literal('absent') }).strict(),
    z.object({ state: z.literal('unreadable'), reason: z.string().min(1) }).strict(),
  ]),
  files: z.array(fileFact), class: z.literal(1).nullable(), reason: z.string().min(1),
}).strict()
export type HouseRulesFact = z.infer<typeof houseRulesFact>
export type HouseRulesDecision = HouseRulesFact & { position: 'block' | 'remind' | 'off' }

/** Each declaration entry occupies one whole line. Unknown syntax or words fail with that line. */
export function readHouseRules(text: string | null): Map<string, HouseRule> {
  const found = new Map<string, HouseRule>()
  if (text === null) return found
  let inside = false, ended = false, comment = false
  const lines = text.split(/\r?\n/)
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim()
    const bad = (): never => { throw new Error(`${HOUSE_RULES_PATH} line ${index + 1} cannot be read: ${line}`) }
    if (comment) { if (line.includes('*/')) comment = false; continue }
    if (line.startsWith('/*')) { comment = !line.includes('*/'); continue }
    if (line === '' || line.startsWith('//')) continue
    if (!inside && !ended && /^export const (CLASSES|KINDS|MARKS) = \[[^\]]*\];?$/.test(line)) continue
    if (!inside && !ended && line === 'export const HOUSE_RULES = {') { inside = true; continue }
    if (inside && /^};?$/.test(line)) { inside = false; ended = true; continue }
    if (!inside) bad()
    const entry = /^'([^']+)': \{ class: '([^']+)', kind: '([^']+)'(?:, mark: '([^']+)')? \},?$/.exec(line)
    if (entry === null) bad()
    const [, path, klass, kind, mark] = entry!
    const parsed = houseRule.safeParse({ class: klass, kind, ...(mark === undefined ? {} : { mark }) })
    if (!parsed.success || found.has(path!)) bad()
    found.set(path!, parsed.data!)
  }
  if (!ended || inside || comment) throw new Error(`${HOUSE_RULES_PATH} line ${lines.length} cannot be read: unfinished inventory`)
  return found
}

/** Class one is nonempty and contains only unmarked H files; the first other file explains refusal. */
export function classifyMerge(blamed: readonly string[], list: ReadonlyMap<string, HouseRule>) {
  const files = blamed.map(file => ({ file, ...list.get(file) }))
  for (const one of files) {
    const why = one.class === undefined ? "not on main's list, so a feature test"
      : one.class !== 'H' ? `class ${one.class}` : one.mark !== undefined ? `marked ${one.mark}` : null
    if (why !== null) return { files, class: null, reason: `${one.file} is ${why}.` }
  }
  return files.length === 0 ? { files, class: null, reason: 'No file is blamed.' }
    : { files, class: 1 as const, reason: 'Only plain house rules are red.' }
}

/** Main's list as text and which of the three answers it is; parsing it is the caller's work. */
export type MainHouseRuleList = { state: 'read'; text: string } | { state: 'absent' } | { state: 'unreadable'; reason: string }
export function readMainHouseRuleList(mainAt: string, readGit: (args: string[]) => string): MainHouseRuleList {
  try {
    const present = readGit(['ls-tree', mainAt, '--', HOUSE_RULES_PATH]).trim() !== ''
    return present ? { state: 'read', text: readGit(['cat-file', 'blob', `${mainAt}:${HOUSE_RULES_PATH}`]) } : { state: 'absent' }
  } catch (error) {
    return { state: 'unreadable', reason: error instanceof Error ? error.message : String(error) }
  }
}

/** Classifies the blamed files by main's list; with no list at main, no file is on it. A failed read, or text that is not a well-formed list, answers unreadable with no class. */
export function readMainHouseRules(mainAt: string, blamed: readonly string[], readGit: (args: string[]) => string): HouseRulesFact {
  const reading = readMainHouseRuleList(mainAt, readGit)
  try {
    if (reading.state === 'unreadable') throw new Error(reading.reason)
    return { mainAt, list: reading.state === 'read' ? { state: 'read' } : { state: 'absent' }, ...classifyMerge(blamed, readHouseRules(reading.state === 'read' ? reading.text : null)) }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { mainAt, list: { state: 'unreadable', reason }, files: blamed.map(file => ({ file })), class: null, reason: `Could not read main's house-rule list: ${reason}` }
  }
}

/** Only a stored office decision, tied to this exact run, can authorize a red landing. */
export function onlyHouseRulesRedAuthorizesLanding(tested: unknown, tip?: string): boolean {
  return typeof tested === 'object' && tested !== null && ((tested as Record<string, unknown>)['houseRules'] as { class?: unknown } | undefined)?.class === 1
    && redMergeAuthorizesLanding(tested, tip)
}

/** The database folders that disqualify a few-feature-red landing. */
export const DATABASE_FOLDERS = ['drizzle/', 'held-migrations/'] as const
/**
 * A round open to fix a red entry. `fixRound` is there when the run is one the office asked for itself, because the
 * starter had no run going (wave 13u round 90): the agent whose round it is, and whether that is the line or the sheriff.
 * A bounded `reserved` repair has no running run yet; it authorizes landing and starts only on verified landed main.
 */
export interface RoundOpenReading { open: boolean; starter?: string; run?: string; reason?: string; fixRound?: FixRoundFact; reserved?: { holder: string; agent: string; as: 'line' | 'sheriff' } }
const fixRoundFact = z.object({ agent: z.string().min(1), as: z.enum(['line', 'sheriff']) }).strict()
export type FixRoundFact = z.infer<typeof fixRoundFact>
export interface RedMergeInput {
  redTests: readonly string[]
  list: ReadonlyMap<string, HouseRule> | null
  listProblem?: string
  redFiles: readonly string[]
  build?: boolean
  databasePaths: readonly string[] | null
  pathsProblem?: string
  roundOpen?: RoundOpenReading
  fewRedFiles?: number
}
export interface MergeClassification {
  class: 1 | 2 | 3
  cause?: number
  reason: string
  files: { file: string; class?: HouseRule['class']; kind?: string; mark?: HouseRule['mark'] }[]
  featureFiles: string[]
  houseRuleFiles: string[]
  /** Only the tool leaves the office's limit and round unknown; this is a conditional expectation. */
  expectation?: string
}

/** One class reader for tool and office. Class one's original rule precedes the new, ordered causes. */
export function classifyRedMerge(input: RedMergeInput): MergeClassification {
  const { redTests, list, build, databasePaths, roundOpen, fewRedFiles } = input
  const files = redTests.map(file => ({ file, ...list?.get(file) }))
  const houseRuleFiles = files.filter(one => one.class === 'H' && one.mark === undefined).map(one => one.file)
  const featureFiles = files.filter(one => input.redFiles.includes(one.file) && !(one.class === 'H' && one.mark === undefined) && one.class !== 'S' && one.class !== 'P').map(one => one.file)
  const answer = (klass: 1 | 2 | 3, reason: string, cause?: number): MergeClassification => ({ class: klass, files, featureFiles, houseRuleFiles, reason, ...(cause === undefined ? {} : { cause }) })
  if (list !== null && redTests.length > 0 && houseRuleFiles.length === redTests.length) return answer(1, 'Only plain house rules are red.')
  if (build === false) return answer(3, 'The build failed.', 1)
  if (build === undefined) return answer(3, 'The tested report does not say whether the build passed; the office does not guess.', 2)
  const notFiles = redTests.filter(file => !input.redFiles.includes(file))
  if (redTests.length === 0 || notFiles.length > 0) return answer(3, `The tests failed without naming a file${notFiles.length === 0 ? '' : `: ${notFiles.join(', ')}`}.`, 3)
  if (list === null) return answer(3, `The office could not read main's house-rule list${input.listProblem === undefined ? '' : `: ${input.listProblem}`}.`)
  const safety = files.find(one => one.class === 'S')
  if (safety !== undefined) return answer(3, `A safety house-rule test is red: ${safety.file}.`, 4)
  const privacy = files.find(one => one.class === 'P')
  if (privacy !== undefined) return answer(3, `A privacy house-rule test is red: ${privacy.file}.`, 5)
  if (databasePaths === null) return answer(3, `The office could not read the changed paths for this entry's own integration${input.pathsProblem === undefined ? '' : `: ${input.pathsProblem}`}.`)
  if (databasePaths.length > 0) return answer(3, `The entry changes the database: ${databasePaths.join(', ')}.`, 6)
  if (fewRedFiles !== undefined && featureFiles.length > fewRedFiles) return answer(3, `${featureFiles.length} feature test files are red; MOLE_OFFICE_FEW_RED_FILES allows ${fewRedFiles}.`, 7)
  if (roundOpen?.open !== true && roundOpen?.reserved === undefined) {
    const result = answer(3, `Its line has no round open to fix it: ${roundOpen?.reason ?? 'the office has not reported a round open'}.`, 8)
    if (roundOpen === undefined && fewRedFiles === undefined) result.expectation = 'class 2 if the office allows the count and its line has a round open'
    return result
  }
  if (fewRedFiles === undefined || !Number.isSafeInteger(fewRedFiles) || fewRedFiles < 1) return answer(3, 'The office has not reported a valid MOLE_OFFICE_FEW_RED_FILES limit.')
  return answer(2, `${featureFiles.length} feature test ${featureFiles.length === 1 ? 'file is' : 'files are'} red; this is class 2.`)
}

const position = z.enum(['block', 'remind', 'off'])
export const mergeClassDecision = z.object({
  class: z.literal(2), mainAt: z.string().min(1), files: z.array(fileFact).min(1),
  featureFiles: z.array(z.string().min(1)).min(1), houseRuleFiles: z.array(z.string().min(1)), reason: z.string().min(1),
  build: z.literal(true), databasePaths: z.array(z.string()).length(0),
  roundOpen: z.discriminatedUnion('open', [
    z.object({ open: z.literal(true), starter: z.string().min(1), run: z.string().min(1), fixRound: fixRoundFact.optional() }).strict(),
    z.object({ open: z.literal(false), starter: z.string().min(1), reason: z.string().min(1), reserved: fixRoundFact.extend({ holder: z.string().min(1) }).strict() }).strict(),
  ]),
  fewRedFiles: z.number().int().positive().safe(), position, houseRulesPosition: position,
}).strict()
export type MergeClassDecision = z.infer<typeof mergeClassDecision>

/** The wide-red switch governs only causes whose facts the office could read. */
export const wideRedDecision = z.object({
  class: z.literal(3), cause: z.union([z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8)]),
  mainAt: z.string().min(1), files: z.array(fileFact).min(1),
  featureFiles: z.array(z.string().min(1)), houseRuleFiles: z.array(z.string().min(1)), reason: z.string().min(1),
  build: z.literal(true), databasePaths: z.array(z.string().min(1)),
  roundOpen: z.discriminatedUnion('open', [
    z.object({ open: z.literal(true), starter: z.string().min(1), run: z.string().min(1) }).strict(),
    z.object({ open: z.literal(false), reason: z.string().min(1) }).strict(),
  ]),
  fewRedFiles: z.number().int().positive().safe(), position, houseRulesPosition: position, fewFeatureRedsPosition: position,
}).strict().refine(one => one.cause === 6 ? one.databasePaths.length > 0 : one.databasePaths.length === 0)
export type WideRedDecision = z.infer<typeof wideRedDecision>

/**
 * Hand-back facts are kept on the problem. `deadline` is the due time on the wall clock of `timeZone`, for people to
 * read; `dueAt` is the same moment with its offset (wave 13u round 73), because on the night the clocks go back a wall
 * time names two moments. A hand-back filed before round 73 has no `dueAt`.
 */
export const handBackFacts = z.object({
  entry: z.string().min(1), repository: z.string().min(1), files: z.array(z.string().min(1)).min(1), commits: z.array(z.string().min(1)).min(1),
  line: z.object({ agent: z.string().nullable(), starter: z.string().min(1), run: z.string().min(1).nullable(), fixRound: fixRoundFact.optional() }).strict(),
  landedAt: z.string().min(1), deadline: z.string().min(1), timeZone: z.string().min(1), hours: z.number().int().positive().safe(),
  dueAt: z.string().refine(words => momentOfAnInstant(words) !== null, 'dueAt must be an instant with its offset').optional(),
}).strict()
export type HandBackFacts = z.infer<typeof handBackFacts>

/**
 * THE MOMENT A HAND-BACK IS DUE, an entry's or an emergency push's, or null when its facts cannot say. With `dueAt`, that moment, so long as the stored wall
 * time names it. Without, the later of the moments the wall time names (problem NHn0l-D7qvys): nobody stored which one
 * was meant, and the later never takes a change back early.
 */
export function whenAHandBackIsDue(facts: Pick<HandBackFacts, 'deadline' | 'timeZone' | 'dueAt'>): number | null {
  if (facts.dueAt === undefined) return latestMomentOfStampInZone(facts.deadline, facts.timeZone)
  const due = momentOfAnInstant(facts.dueAt)
  try { return due !== null && stampInZone(due, facts.timeZone) === facts.deadline.replace('T', ' ') ? due : null } catch (error) {
    // A zone Intl cannot read is a RangeError: the facts cannot say, as latestMomentOfStampInZone says of one.
    if (error instanceof RangeError) return null
    throw error
  }
}
export const repairOfSchema = z.object({ problem: z.string().min(1), files: z.array(z.string().min(1)).min(1) }).strict()
export type RepairOf = z.infer<typeof repairOfSchema>
export const repairFact = z.object({ problem: z.string().min(1), files: z.array(z.object({ file: z.string().min(1), passed: z.boolean() }).strict()) }).strict()
export type RepairFact = z.infer<typeof repairFact>

/** All red classes use the same exact-run and exact-name checks. Current positions are the office's alone. */
export function redMergeAuthorizesLanding(tested: unknown, tip?: string, positions?: { fewFeatureReds?: string; houseRules?: string; wideRed?: string }): boolean {
  if (typeof tested !== 'object' || tested === null) return false
  const run = tested as Record<string, unknown>
  if (run['green'] !== false || typeof run['tip'] !== 'string' || (tip !== undefined && run['tip'] !== tip) || !Array.isArray(run['redTests'])) return false
  const exact = (files: string[]) => files.length > 0 && new Set(files).size === files.length && run['redTests'] instanceof Array && new Set(run['redTests']).size === files.length && run['redTests'].length === files.length && files.every(file => (run['redTests'] as unknown[]).includes(file))
  if (run['houseRules'] !== undefined && run['houseRules'] !== null) {
    const parsed = houseRulesFact.extend({ position }).safeParse(run['houseRules'])
    if (parsed.success && parsed.data.class === 1 && parsed.data.list.state === 'read' && parsed.data.position !== 'block' && positions?.houseRules !== 'block' && parsed.data.files.every(one => one.class === 'H' && one.mark === undefined) && exact(parsed.data.files.map(one => one.file))) return true
  }
  const parsed = z.union([mergeClassDecision, wideRedDecision]).safeParse(run['mergeClass'])
  if (!parsed.success) return false
  const decision = parsed.data
  if (decision.class === 3 && (decision.position === 'block' || positions?.wideRed === 'block' || (decision.featureFiles.length > 0 && (decision.fewFeatureRedsPosition === 'block' || positions?.fewFeatureReds === 'block')))) return false
  if ((decision.class === 2 && (decision.position === 'block' || positions?.fewFeatureReds === 'block')) || (decision.houseRuleFiles.length > 0 && (decision.houseRulesPosition === 'block' || positions?.houseRules === 'block')) || !exact(decision.files.map(one => one.file))) return false
  const list = new Map<string, HouseRule>()
  for (const one of decision.files) {
    if (one.class === undefined) continue
    const rule = houseRule.safeParse({ class: one.class, kind: one.kind, ...(one.mark === undefined ? {} : { mark: one.mark }) })
    if (!rule.success) return false
    list.set(one.file, rule.data)
  }
  const reading = classifyRedMerge({ redTests: decision.files.map(one => one.file), list, redFiles: decision.files.map(one => one.file), build: decision.build, databasePaths: decision.databasePaths, roundOpen: decision.roundOpen, fewRedFiles: decision.fewRedFiles })
  const same = (a: string[], b: string[]) => a.length === b.length && new Set(b).size === b.length && a.every(file => b.includes(file))
  return (decision.class === 2 ? reading.class === 2 : reading.class === 3 && reading.cause === decision.cause && [4, 5, 6, 7, 8].includes(reading.cause)) && same(reading.featureFiles, decision.featureFiles) && same(reading.houseRuleFiles, decision.houseRuleFiles)
}

/** Both the commit and the entry name the hours stored at the original landing. */
export function takeBackTitle(title: string, hours: number): string {
  return `Taken back: ${title}, not fixed in ${hours} ${hours === 1 ? 'hour' : 'hours'}`
}
export const takeBackOfSchema = z.object({ problem: z.string().min(1), entry: z.string().min(1), commits: z.array(z.string().min(1)).min(1), paths: z.array(z.string().min(1)), hours: z.number().int().positive() }).strict()
export type TakeBackOf = z.infer<typeof takeBackOfSchema>
