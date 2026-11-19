// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createHash } from 'node:crypto'
import { isRung, RUNGS, type Rung } from '../detail.ts'
import type { ChapterNamed, TheChaptersLine } from '../chapters.ts'
import { BACKLOG_ITEM_STATES, type BacklogItemState } from '../backlog.ts'
import type { InsideDelegation, PackageMaterial, PackageParent } from '../delegation.ts'
import type { ParticipantKind, ParticipantRef } from '../participants.ts'
import type { RoundStartPack } from '../round-start-pack.ts'

export const ROUND_CHAPTERS = 'roundChapters'
export const RULE_FILES = ['CODE.md', 'LINE-common.md', 'TERRITORIES.md'] as const
export type RuleFile = typeof RULE_FILES[number]
export interface Section { path: string[]; title: string; text: string; bytes: number }
export interface SavedChapter extends ChapterNamed { text: string; bytes: number }
export interface SavedSource {
  name: RuleFile; path: string; sha256: string; sourceBytes: number
  fullFile: boolean; sections: Section[]; text: string; bytes: number
}
export interface RoundChapters {
  version: 1; kind: string | null; territory: string[] | null; fallback: boolean; notice: string | null
  policy: { path: string; sha256: string }
  brief: { path: string; sha256: string; text: string; bytes: number }
  sources: SavedSource[]; chapters: SavedChapter[]
  /** Absent when the declaration names no line, and the brief is then delivered as it was before backlogs. */
  backlog?: RoundBacklog
  /** What the round start read of its flows' standing stages. Absent on a round started before they were read. */
  standing?: StandingStages
  /** What the round itself was given in place of this selection's text, when TERRITORIES.md names its sandbox. */
  pack?: RoundStartPack
  /** The delegations the declaration names, as the office gave them. Absent when it names none. */
  delegations?: RoundDelegations
}
/** The file a line's items were read from before they were records, which a round reads when the office has none. */
export const REQUIREMENTS_FILE = 'briefs/REQUIREMENTS.md'
/** One item of the line. `state` is absent when the item records none. */
export interface BacklogEntry { id: string; number: string; state?: BacklogItemState; given: boolean }
/**
 * What a round was given of its line's backlog. `named` is the declaration's items, empty when it names none. From
 * `the office`, `items` is the line in its order; from `the file`, the office had none to give, `items` is empty and
 * `text` is the one sentence that says why. No field is ever null, as the record writers drop nested nulls.
 */
export interface RoundBacklog { line: string; named: string[]; from: 'the office' | 'the file'; items: BacklogEntry[]; text: string; bytes: number }
/** One stage a flow marks standing, in the words the flow held when it was read. */
export interface StandingStage { n: number; does: string }
/** A flow with at least one stage marked standing, at the revision it was read at. */
export interface StandingFlow { id: string; title: string; version: string; stages: StandingStage[] }
/**
 * WHAT A START WAS GIVEN OF ITS FLOWS' STANDING STAGES. With flows, `text` is what the start was given and `says` is
 * absent. With none, `text` is empty and `says` is the one sentence that says why: no stage is marked, or the stages
 * were not read. `role` is absent only when the agent's role was not read. No field is ever null.
 */
export interface StandingStages { role?: string; flows: StandingFlow[]; text: string; bytes: number; says?: string }
/** One point of a delegation, in the words its own record holds. `doneWhen` and `files` are absent when it holds none. */
export interface DelegationPoint { id: string; number: string; line: string; why: string; doneWhen?: string; files?: string[] }
/**
 * Where a delegation stood inside the office when the round started. `takenBy` is absent when nobody has taken it, or
 * when the office does not name who did; `answerWords` is the parent's latest answer, held only when it differs.
 */
export interface DelegationStanding { taken: boolean; takenBy?: ParticipantRef; takenAt?: string; alignment: InsideDelegation['alignment']; answerWords?: string }
/** One delegation, as the office gave it: its points in the package's order and its materials as stored. */
export interface DelegationGiven { task: string; title: string; parent: PackageParent; lines: string[]; inside: DelegationStanding; points: DelegationPoint[]; materials: PackageMaterial[] }
/**
 * WHAT A ROUND WAS GIVEN OF THE DELEGATIONS ITS DECLARATION NAMES. `named` is the declaration's task ids and `tasks`
 * is one entry for each, in that order. No field is ever null, as the record writers drop nested nulls.
 */
export interface RoundDelegations { line: string; named: string[]; tasks: DelegationGiven[]; answerRequired?: boolean }
export const bytes = (text: string) => Buffer.byteLength(text, 'utf8')
export const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
function bad(why: string): never { throw new Error(`Saved round chapters: ${why}. No current selection was substituted.`) }

/** Absence alone is legacy. A present but damaged manifest never falls back to a card or today's files. */
export function savedRoundChapters(data: unknown): RoundChapters | null {
  if (!object(data) || !object(data['extra']) || !Object.hasOwn(data['extra'], ROUND_CHAPTERS)) return null
  return readRoundChapters(data['extra'][ROUND_CHAPTERS])
}

export function readRoundChapters(value: unknown): RoundChapters {
  if (!object(value) || value['version'] !== 1) bad('unsupported or missing version')
  // Existing dataPatch writers remove nested nulls; normalize only the three explicitly nullable declaration fields.
  const m = { ...value, kind: value['kind'] ?? null, territory: value['territory'] ?? null, notice: value['notice'] ?? null } as unknown as RoundChapters
  if ((m.kind !== null && (typeof m.kind !== 'string' || !m.kind.trim())) ||
      (m.territory !== null && (!Array.isArray(m.territory) || !m.territory.every(p => typeof p === 'string' && p.trim()))) ||
      typeof m.fallback !== 'boolean' || (!m.fallback && m.kind === null) || (m.notice !== null && typeof m.notice !== 'string') ||
      (m.fallback && !m.notice)) bad('invalid declaration or fallback notice')
  if (!object(m.policy) || typeof m.policy.path !== 'string' || !/^[a-f0-9]{64}$/.test(m.policy.sha256)) bad('invalid policy evidence')
  if (!object(m.brief) || typeof m.brief.path !== 'string' || typeof m.brief.text !== 'string' ||
      m.brief.bytes !== bytes(m.brief.text) || m.brief.sha256 !== hash(m.brief.text)) bad('invalid original brief evidence')
  if (!Array.isArray(m.sources) || m.sources.length !== RULE_FILES.length) bad('the three source entries are required')
  for (const [i, source] of m.sources.entries()) {
    if (!object(source) || source.name !== RULE_FILES[i] || typeof source.path !== 'string' ||
        !/^[a-f0-9]{64}$/.test(source.sha256) || !Number.isSafeInteger(source.sourceBytes) || source.sourceBytes < 0 ||
        typeof source.fullFile !== 'boolean' || !Array.isArray(source.sections) || typeof source.text !== 'string' ||
        source.bytes !== bytes(source.text)) bad(`invalid source ${RULE_FILES[i]}`)
    for (const s of source.sections) {
      if (!object(s) || !Array.isArray(s.path) || !s.path.every(p => typeof p === 'string') ||
          typeof s.title !== 'string' || typeof s.text !== 'string' || s.bytes !== bytes(s.text)) bad(`invalid section of ${source.name}`)
    }
    if (source.sections.map(s => s.text).join('') !== source.text) bad(`section text differs from delivery for ${source.name}`)
    if (source.fullFile && (source.sha256 !== hash(source.text) || source.sourceBytes !== source.bytes)) bad(`full-file evidence differs for ${source.name}`)
    if (m.fallback && !source.fullFile) bad(`fallback omitted part of ${source.name}`)
  }
  if (m.backlog !== undefined) readBacklog(m.backlog)
  if (m.standing !== undefined) readStanding(m.standing)
  if (m.delegations !== undefined) readDelegations(m.delegations)
  if (m.pack !== undefined && (!object(m.pack) || typeof m.pack.line !== 'string' || !Array.isArray(m.pack.missing) || !m.pack.missing.every(one => typeof one === 'string') || typeof m.pack.text !== 'string' || m.pack.bytes !== bytes(m.pack.text))) bad('invalid round-start pack')
  if (!Array.isArray(m.chapters)) bad('missing CODE chapter entries')
  const seen = new Set<number>()
  for (const chapter of m.chapters) {
    if (!object(chapter) || !Number.isSafeInteger(chapter.chapter) || chapter.chapter < 1 || seen.has(chapter.chapter) ||
        !isRung(chapter.level) || typeof chapter.text !== 'string' || chapter.bytes !== bytes(chapter.text)) bad('invalid CODE chapter entry')
    seen.add(chapter.chapter)
  }
  const fromText = codeChapters(m.sources[0]!.sections)
  if (fromText.length !== m.chapters.length || fromText.some((c, i) => c.chapter !== m.chapters[i]!.chapter || c.level !== m.chapters[i]!.level || c.text !== m.chapters[i]!.text)) bad('CODE chapter entries differ from the delivered sections')
  return m
}

function readBacklog(b: unknown): void {
  const word = (value: unknown) => typeof value === 'string' && value.trim() !== '' && value === value.trim()
  if (!object(b) || !word(b['line']) || !Array.isArray(b['named']) || !b['named'].every(word) ||
      (b['from'] !== 'the office' && b['from'] !== 'the file') || typeof b['text'] !== 'string' || b['bytes'] !== bytes(b['text']) ||
      !Array.isArray(b['items'])) bad('invalid backlog')
  for (const item of b['items'] as unknown[]) {
    if (!object(item) || typeof item['id'] !== 'string' || !word(item['number']) || typeof item['given'] !== 'boolean' ||
        (item['state'] !== undefined && !(BACKLOG_ITEM_STATES as readonly unknown[]).includes(item['state']))) bad('invalid backlog item')
  }
  const items = b['items'] as BacklogEntry[]
  const named = b['named'] as string[]
  if (b['from'] === 'the file' ? items.length > 0 : items.length === 0) bad(`a backlog from ${String(b['from'])} with ${items.length} items`)
  if (b['from'] === 'the office' && items.some(item => item.given !== givesWhole(named, item))) bad('the backlog gives other items whole than its declaration asks')
  if (b['from'] === 'the office' && named.some(number => !items.some(item => item.number === number))) bad('the backlog lacks an item its declaration names')
}

function readStanding(s: unknown): void {
  const words = (value: unknown) => typeof value === 'string' && value.trim() !== ''
  if (!object(s) || !Array.isArray(s['flows']) || typeof s['text'] !== 'string' || s['bytes'] !== bytes(s['text']) ||
      (s['role'] !== undefined && !words(s['role'])) || (s['says'] !== undefined && !words(s['says']))) bad('invalid standing stages')
  for (const flow of s['flows'] as unknown[]) {
    if (!object(flow) || !words(flow['id']) || !words(flow['title']) || !words(flow['version']) || !Array.isArray(flow['stages']) ||
        flow['stages'].length === 0 || !flow['stages'].every((stage: unknown) => object(stage) && Number.isSafeInteger(stage['n']) &&
          Number(stage['n']) >= 1 && words(stage['does']))) bad('invalid standing flow')
  }
  const flows = s['flows'] as StandingFlow[]
  const given = flows.length > 0
    ? s['role'] !== undefined && s['says'] === undefined && s['text'] === standingStagesText(String(s['role']), flows)
    : s['text'] === '' && s['says'] !== undefined
  if (!given) bad('the standing stages\' text is not the text their flows give')
}

/**
 * The words a delegation's fields may hold, here and in the round start's reading of the office's answer. Each is kept
 * in step with its type: a word missing here, or one too many, fails the type check.
 */
export const DELEGATION_WORDS: {
  alignment: Record<InsideDelegation['alignment'], true>; parent: Record<PackageParent['kind'], true>
  material: Record<PackageMaterial['kind'], true>; taker: Record<ParticipantKind, true>
} = {
  alignment: { none: true, waiting: true, aligned: true, differs: true },
  parent: { decision: true, task: true },
  material: { decision: true, point: true, bundle: true, task: true },
  taker: { person: true, agent: true },
}
/** True when the value is one of the words. */
export const oneOfTheWords = (words: Record<string, true>, value: unknown): value is string => typeof value === 'string' && Object.hasOwn(words, value)

function readDelegations(d: unknown): void {
  const word = (value: unknown) => typeof value === 'string' && value.trim() !== '' && value === value.trim()
  if (!object(d) || !word(d['line']) || !Array.isArray(d['named']) || !d['named'].every(word) || new Set(d['named']).size !== d['named'].length ||
      !Array.isArray(d['tasks']) || d['tasks'].length !== d['named'].length || (d['answerRequired'] !== undefined && typeof d['answerRequired'] !== 'boolean')) bad('invalid delegations')
  for (const [i, task] of (d['tasks'] as unknown[]).entries()) {
    const inside = object(task) ? task['inside'] : undefined
    if (!object(task) || task['task'] !== (d['named'] as string[])[i] || typeof task['title'] !== 'string' ||
        !object(task['parent']) || !oneOfTheWords(DELEGATION_WORDS.parent, task['parent']['kind']) || !word(task['parent']['id']) ||
        !Array.isArray(task['lines']) || !task['lines'].every(word) || !task['lines'].includes(d['line']) ||
        !Array.isArray(task['points']) || task['points'].length === 0 || !Array.isArray(task['materials']) || !object(inside)) bad('invalid delegation')
    const taker = inside['takenBy']
    if (typeof inside['taken'] !== 'boolean' || !oneOfTheWords(DELEGATION_WORDS.alignment, inside['alignment']) ||
        (taker !== undefined && (!object(taker) || !oneOfTheWords(DELEGATION_WORDS.taker, taker['kind']) || !word(taker['id']))) ||
        (inside['taken'] ? typeof inside['takenAt'] !== 'string' : taker !== undefined || inside['takenAt'] !== undefined || inside['alignment'] !== 'none') ||
        (inside['alignment'] === 'differs') !== (typeof inside['answerWords'] === 'string')) bad(`invalid inside state of delegation ${String(task['task'])}`)
    for (const point of task['points'] as unknown[]) {
      if (!object(point) || !word(point['id']) || !word(point['number']) || !word(point['line']) || typeof point['why'] !== 'string' || point['why'].trim() === '' ||
          (point['doneWhen'] !== undefined && typeof point['doneWhen'] !== 'string') ||
          (point['files'] !== undefined && (!Array.isArray(point['files']) || !point['files'].every(one => typeof one === 'string')))) bad(`invalid point of delegation ${String(task['task'])}`)
    }
    for (const material of task['materials'] as unknown[]) {
      if (!object(material) || !oneOfTheWords(DELEGATION_WORDS.material, material['kind']) || typeof material['ref'] !== 'string' || typeof material['says'] !== 'string') bad(`invalid material of delegation ${String(task['task'])}`)
    }
  }
}

/** The items a declaration names are given whole; with none named, every item that is not done or dropped is. */
export function givesWhole(named: string[], item: Pick<BacklogEntry, 'number' | 'state'>): boolean {
  return named.length > 0 ? named.includes(item.number) : item.state !== 'done' && item.state !== 'dropped'
}

/** Only the levels that the exported chapter actually supplies are reported. No missing ladder rungs are invented. */
export function codeChapters(sections: Section[]): SavedChapter[] {
  const out: SavedChapter[] = []
  for (const section of sections) {
    const heading = section.path.find(p => /^Chapter\s+\d+\b/i.test(p))
    if (!heading) continue
    const chapter = Number(/^Chapter\s+(\d+)\b/i.exec(heading)![1])
    let saved = out.find(c => c.chapter === chapter)
    if (!saved) { saved = { chapter, level: 'outline', text: '', bytes: 0 }; out.push(saved) }
    saved.text += section.text; saved.bytes = bytes(saved.text)
  }
  return out
}

const ACKNOWLEDGEMENT_PREFIX = 'Saved round chapters version 1 SHA-256 '

/** Stable across object property order and the existing partial writer's omission of null declaration keys. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  if (object(value)) return '{' + Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}'
  return JSON.stringify(value) ?? 'null'
}
export function roundChaptersAcknowledgement(manifest: RoundChapters): string {
  return ACKNOWLEDGEMENT_PREFIX + hash(canonicalJson(readRoundChapters(manifest)))
}
export function hasRoundChaptersAcknowledgement(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(ACKNOWLEDGEMENT_PREFIX)
}

/** Read the established reply shape before deciding whether it belongs to an older office. */
export function readableChaptersLine(value: unknown): value is TheChaptersLine {
  const list = (items: unknown): boolean => Array.isArray(items) && items.every(one => object(one) &&
    Number.isSafeInteger(one['chapter']) && Number(one['chapter']) > 0 && isRung(one['level']))
  return object(value) && (value['named'] === null || list(value['named'])) && list(value['mustRead']) &&
    (value['from'] === 'the brief' || value['from'] === 'the role card') && (value['says'] === null || typeof value['says'] === 'string')
}

export function savedChaptersLine(manifest: RoundChapters): TheChaptersLine {
  const named = manifest.chapters.map(({ chapter, level }) => ({ chapter, level }))
  return { named, mustRead: named, from: 'the brief', says: roundChaptersAcknowledgement(manifest) }
}

export function roundChaptersList(manifest: RoundChapters): string {
  return roundChaptersListGiven(manifest, null)
}

const THE_SAVED_SELECTION_HOLDS_CODE_IN_FULL = 'The saved selection holds CODE.md in full; this text gives it at outline.'

/** The list a start is given, with the code source at outline when `outline` is given, and the saved selection as stored. */
function roundChaptersListGiven(manifest: RoundChapters, outline: string | null): string {
  const code = manifest.sources[0]!
  return [
    `Round kind: ${manifest.kind ?? '(missing)'}. Territory: ${manifest.territory?.join(', ') ?? '(missing)'}.`,
    ...(manifest.notice ? [manifest.notice, ...(outline !== null && code.fullFile ? [THE_SAVED_SELECTION_HOLDS_CODE_IN_FULL] : [])] : []),
    ...(manifest.backlog ? [backlogLine(manifest.backlog)] : []),
    ...(manifest.standing ? [standingStagesLine(manifest.standing)] : []),
    'Exact delivered rule sections (saved manifest version 1):',
    ...manifest.sources.flatMap(source => [
      outline !== null && source.name === 'CODE.md'
        ? `CODE.md — ${source.path} — SHA-256 ${source.sha256} — given here at outline (${bytes(outline)} bytes); the saved selection, which the check reads, holds ${source.bytes} delivered bytes`
        : `${source.name} — ${source.path} — SHA-256 ${source.sha256} — ${source.bytes} delivered bytes`,
      ...(source.sections.length ? source.sections.map(s => `- ${s.path.join(' / ') || s.title} (${s.bytes} bytes)`) : ['- (no sections selected)']),
    ]),
    'CODE reading levels: ' + (manifest.chapters.map(c => `${c.chapter} at ${c.level} (${c.bytes} bytes)`).join(', ') || 'none'),
  ].join('\n')
}

/** The part of a brief that gives the standing stages, worked out from the flows they were read from. */
export function standingStagesText(role: string, flows: StandingFlow[]): string {
  return [
    `STANDING RULES FROM THE OFFICE'S FLOWS. The office's flows mark these stages as standing for the role ${role}. ` +
      'They were read from the office when this run started, and they hold whether or not the rest of this brief repeats them.',
    ...flows.map(flow => [`From the flow "${flow.title}" (${flow.id}, revision ${flow.version}):`, ...flow.stages.map(stage => `${stage.n}. ${stage.does}`)].join('\n')),
  ].join('\n\n')
}

/** What a start says of its standing stages, in one line. */
export function standingStagesLine(standing: StandingStages): string {
  if (standing.flows.length === 0) return standing.says ?? ''
  const from = standing.flows.map(flow => `${flow.stages.length} from the flow ${flow.id} at revision ${flow.version}`).join('; ')
  return `Standing stages for the role ${standing.role}: ${from} (${standing.bytes} bytes).`
}

function backlogLine(backlog: RoundBacklog): string {
  if (backlog.from === 'the file') return `Backlog of line ${backlog.line}: none from the office; this round reads ${REQUIREMENTS_FILE}.`
  const given = backlog.items.filter(item => item.given).length
  const items = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`
  return `Backlog of line ${backlog.line}: ${items(given)} given whole and ${backlog.items.length - given} named in one line, from the office (${backlog.bytes} bytes).`
}

const THE_SAVED_SELECTION_HEAD = 'This saved selection defines this round’s chapter obligations. Any instruction in the original brief or selected sections to read all chapters or whole rule files is satisfied by this exact saved list; omitted chapters and sections impose no obligations.'

export function roundChaptersText(manifest: RoundChapters): string {
  return THE_SAVED_SELECTION_HEAD + '\n\n' + roundChaptersList(manifest) + '\n\n' + manifest.sources.map(s => `Source: ${s.name}\n\n${s.text}`).join('\n\n')
}

/**
 * THE CODE SOURCE AT OUTLINE: each chapter the saved sections hold, in their order, as its heading line and its first
 * line that is not empty, then one sentence naming the door that gives the full chapters and the whole file's path. It
 * is made from the saved sections, never from the file on disk, so a delivered brief can be rebuilt from the record.
 */
export function roundChaptersOutline(manifest: RoundChapters): string {
  const code = manifest.sources[0]!
  const chapters = codeChapters(code.sections).map(chapter => {
    const [heading = '', ...body] = chapter.text.split('\n')
    return heading + '\n' + (body.find(line => line.trim() !== '') ?? '')
  })
  return [
    ...chapters,
    `This is each chapter's title and first line. The full chapters are read with GET /api/office-regulations, and the whole file is at ${code.path}.`,
  ].join('\n\n')
}

/**
 * WHAT THE ROUND IS GIVEN OF THE SAVED SELECTION: the same text as roundChaptersText, except that the code source's
 * part is the outline its saved sections make. The list says CODE.md is given here at outline, with the outline's
 * bytes, and that the saved selection, which the check reads, holds its stated bytes. Where the saved notice says
 * CODE.md is delivered in full, one sentence beside it says the saved selection holds it in full and this text gives
 * it at outline. The saved manifest itself is unchanged.
 */
export function roundChaptersGivenText(manifest: RoundChapters): string {
  const outline = roundChaptersOutline(manifest)
  return THE_SAVED_SELECTION_HEAD + '\n\n' + roundChaptersListGiven(manifest, outline) + '\n\n' + manifest.sources.map(s => `Source: ${s.name}\n\n${s.name === 'CODE.md' ? outline : s.text}`).join('\n\n')
}

/**
 * What every launched round is told about finding code, between its brief and its rules. It names the lookup
 * only for where a name is defined or which file a name is, with every name of that search in one command, so
 * the names the index cannot answer are said in one line; any other search is left as the round would do it.
 * It tells; nothing stops a round that searches first.
 */
export const WHERE_A_NAME_IS_DEFINED =
  'Only to find where a name is defined, or which file a name is, run node tools/source-lookup.mjs <names> -- <paths you would search> instead of a search. ' +
  'Put all the names in that one command. ' +
  'For any other search, such as every use of a name, search as you would.'

/**
 * A round's standing stages and its line's items go between its brief and the rest, in that order. A round given no
 * standing stage, or with no line declared, gets no part for them.
 */
export function deliveredRoundBrief(manifest: RoundChapters): string {
  const standing = manifest.standing?.text ? manifest.standing.text + '\n\n---\n\n' : ''
  const backlog = manifest.backlog ? manifest.backlog.text + '\n\n---\n\n' : ''
  return manifest.brief.text + '\n\n---\n\n' + standing + backlog + WHERE_A_NAME_IS_DEFINED + '\n\n' + (manifest.pack?.text ?? roundChaptersGivenText(manifest))
}

/** Bounds chapter claims without rewriting the inspector's actual reported levels. */
export function checkSavedChapterClaims(manifest: RoundChapters, check: { chaptersRead: ChapterNamed[]; says: { chapter?: number | null; precedent?: string | null } | null }): void {
  const held = new Map(manifest.chapters.map(c => [c.chapter, c.level]))
  for (const claim of check.chaptersRead) {
    const at = held.get(claim.chapter)
    if (!at || RUNGS.indexOf(claim.level) > RUNGS.indexOf(at)) bad(`chapter ${claim.chapter} at ${claim.level} was not delivered`)
  }
  if (check.says?.chapter != null && !held.has(check.says.chapter)) bad(`judgment cites undelivered CODE chapter ${check.says.chapter}`)
  if (check.says?.precedent != null) bad('no precedent was delivered by this manifest; cite a delivered chapter or an invariant')
}
