// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { sayInEnglish } from './i18n.ts'
import type { PackageMaterial, PackageParent } from './delegation.ts'
import {
  bytes, readRoundChapters, REQUIREMENTS_FILE, roundChaptersGivenText, THE_CHAPTERS_DOOR, THE_REGULATIONS_DOOR,
  type DelegationPoint, type DelegationStanding, type RoundChapters, type RoundDelegations, type SavedSource, type Section,
} from './round-chapters/manifest.ts'

/**
 * WHAT A ROUND IS GIVEN AT ITS START, in place of the saved selection's text, when one heading of TERRITORIES.md names
 * its sandbox: the line's open items as NEXT.md's section 1 lists them, the line's own section of TERRITORIES.md and its
 * fallback rule, the rule chapters at outline, NEXT.md, and LINE-common.md as the saved selection gives it. The full
 * files stay one read away and are named. The manifest's sources stay as they are, so this round's check is given the
 * saved selection as before.
 *
 * `missing` names each part that could not be given, with the reason. No field is ever null, as the record writers drop
 * nested nulls.
 */
export interface RoundStartPack { line: string; missing: string[]; text: string; bytes: number }

/** The words the fallback rule's paragraph of TERRITORIES.md begins with. */
export const THE_FALLBACK_RULE = 'The fallback rule'
/** A round's next plan, in its sandbox. */
export const NEXT_FILE = 'briefs/NEXT.md'
/** The start of the one level-2 heading of NEXT.md whose section lists the line's open items. */
export const THE_OPEN_ITEMS_HEADING = '1.'

function fail(why: string): never { throw new Error(THE_PACK_REFUSAL(why)) }

/** A list in a sentence: "a", "a and b", "a, b and c". */
const and = (list: string[]) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`)
const escaped = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The head of the pack, which says where each of its parts comes from. */
export function theRoundStartPackHead(line: string): string {
  return `THE ROUND-START PACK OF LINE ${line}. This round is given what its line needs at its start: the open items as NEXT.md's section 1 lists them, the line's own section of TERRITORIES.md and its fallback rule, the rule chapters at outline, and NEXT.md, with LINE-common.md as the saved selection gives it.`
}

/**
 * Where each part of the pack came from, said after its head. `chaptersAt` is when the start read the chapters and the
 * person's regulations from the office, and null when CODE.md was read from the file `code`.
 */
export interface WhereThePackCameFrom { chaptersAt: string | null; code: string; heading: string; territories: string; next: string; common: string }

/** The sentence after the pack's head that names where each part came from. */
export function whereEachPartCameFrom(from: WhereThePackCameFrom): string {
  const rules = from.chaptersAt === null
    ? `the rule chapters from the file ${from.code}, and no regulation of the person was read`
    : `the rule chapters from GET ${THE_CHAPTERS_DOOR} and the person's regulations from GET ${THE_REGULATIONS_DOOR}, both read at ${from.chaptersAt}`
  return `Where each part came from: ${rules}; any delegations its declaration names from GET /api/delegation/inside; ` +
    `the line's own section from the heading "${from.heading}" of ${from.territories}, with the fallback rule of the same file; ` +
    `the open items and NEXT.md from ${from.next}; and LINE-common.md from ${from.common}.`
}

/**
 * The sentence that says the full files are still there. A file the sandbox does not have is not named. When the start
 * read the chapters from the office, the sentence names the door that gives them in full.
 */
export function oneReadAway(paths: string[], chaptersFromTheOffice = false): string {
  return `The full files stay one read away, and nothing is refused for reading them: ${and(paths)}.` +
    (chaptersFromTheOffice ? ` The full chapters stay one read away too, at GET ${THE_REGULATIONS_DOOR}.` : '')
}

/** One part that could not be given, as it is written in the pack. */
export function theMissingLine(one: string): string { return `Missing: ${one}.` }

/** Why the open items are missing, when NEXT.md or its section 1 cannot give them. */
export function theOpenItemsMissing(path: string, why: 'unreadable' | 'no-section' | 'two-sections', count = 0, code = ''): string {
  if (why === 'unreadable') return `the open items: ${path} could not be read (${code})`
  if (why === 'no-section') return `the open items: no level-2 heading of ${path} begins with "${THE_OPEN_ITEMS_HEADING}", so this pack cannot tell which section lists them`
  return `the open items: ${count} level-2 headings of ${path} begin with "${THE_OPEN_ITEMS_HEADING}", and this pack does not choose between them`
}

/** Why the fallback rule is missing, when TERRITORIES.md gives none or gives more than one. */
export function theFallbackRuleMissing(path: string, paragraphs: number): string {
  return paragraphs === 0
    ? `the fallback rule: no paragraph of ${path} begins with "${THE_FALLBACK_RULE}"`
    : `the fallback rule: ${paragraphs} paragraphs of ${path} begin with "${THE_FALLBACK_RULE}", and this pack does not choose between them`
}

/** Why NEXT.md is missing, when it cannot be read. */
export function theNextMissing(path: string, code: string): string { return `NEXT.md: ${path} could not be read (${code})` }

/** The sentence before NEXT.md, given whole. */
export function nextWhole(path: string): string { return `NEXT.md, whole (${path}):` }

/** The sentence given in place of NEXT.md when the brief already holds it. */
export function nextIsTheBrief(): string { return "NEXT.md is this round's brief, given whole above." }

/** The words of a refused start. */
export function THE_PACK_REFUSAL(why: string): string { return `Round-start pack: ${why}. Nothing was started.` }

/** Why a start is refused when more than one heading names its sandbox. */
export function twoHeadings(count: number, path: string, sandbox: string): string {
  return `${count} headings of ${path} name sandbox ${sandbox}, so its line cannot be told`
}

/** Why a start is refused when the declaration beside the brief names another line than the heading's. */
export function declaredLineDiffers(declared: string, path: string, sandbox: string, line: string): string {
  return `the declaration beside the brief names line ${declared}, but ${path} gives sandbox ${sandbox} to line ${line}`
}

/** Why a start is refused when its declaration names delegations and no heading names its sandbox, so no pack is made. */
export function noPackForTheDelegations(path: string, sandbox: string): string {
  return `the declaration names delegations, but no heading of ${path} names sandbox ${sandbox}, so no round-start pack can carry them`
}

/** The first sentence of the delegation part. */
export function theDelegationsThisRoundTakes(count: number): string {
  return count === 1 ? 'This round takes 1 delegation.' : `This round takes ${count} delegations.`
}

/** The first instruction, given when at least one delegation asks for a restatement. */
export const THE_FIRST_INSTRUCTION = [
  'Before any other work, restate the points of each delegation below that asks for it, in your own words, with your plan.',
  'Send each restatement through POST /api/delegation/<task>/align with the body {"restated": "…", "plan": "…"}, where <task> is the delegation\'s task id.',
  sayInEnglish('roundStart.startAfterPlan'),
].join(' ')

/** Given in place of the first instruction when no delegation asks for a restatement. */
export const NO_RESTATEMENT_IS_ASKED = 'No delegation below asks for a restatement.'

/** True when a delegation asks for a restatement: nobody has restated it, or the parent's latest answer differs. */
export function asksForARestatement(inside: DelegationStanding): boolean {
  return inside.alignment === 'none' || inside.alignment === 'differs'
}

/** The first line of one delegation. */
export function theDelegationHead(title: string, task: string): string { return `Delegation "${title}", task ${task}.` }

/** Which record a delegation was handed down from. */
export function theDelegationsParent(parent: PackageParent): string { return `Its parent is the ${parent.kind} ${parent.id}.` }

/** The lines a delegation's points are on. */
export function theDelegationsLines(lines: string[]): string { return `It is for ${lines.length === 1 ? 'line' : 'lines'} ${and(lines)}.` }

/** Who took a delegation inside, and when. */
export function whoTookTheDelegation(inside: DelegationStanding): string {
  if (!inside.taken) return 'Nobody has taken it inside yet.'
  if (inside.takenBy === undefined) return `It was taken inside at ${inside.takenAt}, by somebody the office does not name.`
  return `It was taken inside by the ${inside.takenBy.kind} ${inside.takenBy.id} at ${inside.takenAt}.`
}

/** What this round does first for one delegation, from where it stands. */
export function theDelegationsFirstStep(task: string, inside: DelegationStanding, answerRequired = false): string {
  const align = `POST /api/delegation/${task}/align`
  if (!inside.taken) return `It is not taken yet, so the first step is to take it through POST /api/delegation/${task}/take-inside. Then restate it through ${align}.`
  if (inside.alignment === 'none') return `It asks for a restatement. Restate it through ${align}.`
  if (inside.alignment === 'waiting') return answerRequired ? "Its restatement waits for the parent's answer. Do not restate it again before the parent answers." : sayInEnglish('roundStart.answerPending')
  if (inside.alignment === 'differs') return `The parent answered that the restatement differs, in these words:\n${inside.answerWords}\nRestate it again through ${align}.`
  return 'It is aligned with its parent. Do not restate it again.'
}

/** The sentence before a delegation's points. */
export const THE_POINTS_HEAD = "Its points, whole, in the package's order:"

/** Said in place of a point's done-when when its record holds none. */
export const NO_DONE_WHEN = 'No done-when is recorded for this point.'

/** One point of a delegation, whole. */
export function theDelegationsPoint(point: DelegationPoint): string {
  return [
    `Point ${point.number} of line ${point.line} (record ${point.id}):`,
    point.why,
    point.doneWhen === undefined ? NO_DONE_WHEN : `Done when: ${point.doneWhen}`,
    ...(point.files === undefined ? [] : [`Files: ${point.files.join(', ')}`]),
  ].join('\n')
}

/** The sentence before a delegation's materials. */
export const THE_MATERIALS_HEAD = 'Its materials, as the package stores them:'

/** Said in place of the materials when the package stores none. */
export const NO_MATERIALS = 'The package stores no materials for it.'

/** One material of a delegation, as the package stores it. */
export function theDelegationsMaterial(material: PackageMaterial): string { return `- ${material.kind} ${material.ref}: ${material.says}` }

/**
 * THE DELEGATION PART of the pack: how many delegations the round takes, the first instruction, and each delegation
 * with where it stands, its points whole and its materials.
 */
export function theDelegationPart(reading: RoundDelegations): string {
  return [
    theDelegationsThisRoundTakes(reading.tasks.length),
    reading.tasks.some(one => asksForARestatement(one.inside)) ? (reading.answerRequired ? THE_FIRST_INSTRUCTION.replace(sayInEnglish('roundStart.startAfterPlan'), sayInEnglish('roundStart.waitForAnswer')) : THE_FIRST_INSTRUCTION) : NO_RESTATEMENT_IS_ASKED,
    ...reading.tasks.map(one => [
      [theDelegationHead(one.title, one.task), theDelegationsParent(one.parent), theDelegationsLines(one.lines), whoTookTheDelegation(one.inside), theDelegationsFirstStep(one.task, one.inside, reading.answerRequired)].join('\n'),
      THE_POINTS_HEAD,
      ...one.points.map(theDelegationsPoint),
      one.materials.length === 0 ? NO_MATERIALS : [THE_MATERIALS_HEAD, ...one.materials.map(theDelegationsMaterial)].join('\n'),
    ].join('\n\n')),
  ].join('\n\n')
}

/** One heading outside fenced code, with its level and the span it owns up to the next heading of any level. */
interface Heading { level: number; title: string; start: number; end: number }

/** The ATX headings of a markdown text, ignoring fenced code, as the round's own rules reader finds them. */
function headings(text: string): Heading[] {
  const lines = [...text.matchAll(/[^\n]*(?:\n|$)/g)].filter(m => m[0] !== '')
  const found: { level: number; title: string; start: number }[] = []
  let fence: { char: string; size: number } | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]![0].replace(/\r?\n$/, '')
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (fence) {
      if (marker && marker[1]![0] === fence.char && marker[1]!.length >= fence.size && marker[2]!.trim() === '') fence = null
      continue
    }
    if (marker && !(marker[1]![0] === '`' && marker[2]!.includes('`'))) { fence = { char: marker[1]![0]!, size: marker[1]!.length }; continue }
    const atx = /^ {0,3}(#{1,6})(?:[ \t]+(.*?)|[ \t]*)$/.exec(line)
    if (atx) found.push({ level: atx[1]!.length, title: (atx[2] ?? '').replace(/[ \t]+#+[ \t]*$/, '').trim(), start: lines[i]!.index! })
  }
  return found.map((heading, i) => ({ ...heading, end: found[i + 1]?.start ?? text.length }))
}

/**
 * THE LINE'S OPEN ITEMS, as the one level-2 heading of NEXT.md whose text begins "1." lists them. That heading and
 * everything under it, up to the next heading of level 2 or higher, are given whole, in the file's order and words.
 * Nothing is read from REQUIREMENTS.md and no backlog is asked: an item's state is not recorded in either.
 */
function theOpenItems(nextFile: string, text: string | null, code: string): { given: string[] } | { missing: string } {
  if (text === null) return { missing: theOpenItemsMissing(nextFile, 'unreadable', 0, code) }
  const all = headings(text)
  const sections = all.filter(h => h.level === 2 && h.title.startsWith(THE_OPEN_ITEMS_HEADING))
  if (sections.length === 0) return { missing: theOpenItemsMissing(nextFile, 'no-section') }
  if (sections.length > 1) return { missing: theOpenItemsMissing(nextFile, 'two-sections', sections.length) }
  const heading = sections[0]!
  const next = all.find(h => h.start > heading.start && h.level <= 2)
  return { given: [text.slice(heading.start, next?.start ?? text.length)] }
}

/**
 * THE LINE'S PART OF A WHOLE TERRITORIES.md: its own section, which is the heading that names the sandbox and everything
 * under it, and the one paragraph that begins with the fallback rule, in the file's order. The paragraph is not added
 * again when the own section holds it, and it is left out when the file holds none or more than one.
 */
function theLinesOwnTerritory(territories: SavedSource, own: Section[], rule: string | null): Section[] {
  if (rule === null || own.some(s => s.text.includes(rule))) return own
  const paragraph: Section = { path: [], title: `the paragraph that begins with "${THE_FALLBACK_RULE}"`, text: rule + '\n', bytes: bytes(rule + '\n') }
  return territories.text.indexOf(rule) < territories.text.indexOf(own[0]!.text) ? [paragraph, ...own] : [...own, paragraph]
}

/**
 * THE ROUND-START PACK. A round whose sandbox one heading of TERRITORIES.md names is given its line's open items, the
 * line's own section of TERRITORIES.md and the fallback rule, the rule chapters at outline, and NEXT.md, with
 * LINE-common.md as the saved selection gives it. Its head names where each part came from, and the full files are named
 * one read away. The delegations the declaration names come right after that, before everything else. When the saved
 * selection holds TERRITORIES.md whole, as a fallback does, the round is still given only its line's part of it. The
 * manifest's sources stay as they are, so this round's check is given the saved selection as before. With no heading
 * naming the sandbox, the line is not known, and the manifest is returned unchanged; a manifest with delegations is then
 * refused, as nothing else would carry them.
 */
export function withTheRoundStartPack(manifest: RoundChapters, sandboxDir: string): RoundChapters {
  const [code, common, territories] = manifest.sources as [RoundChapters['sources'][number], RoundChapters['sources'][number], RoundChapters['sources'][number]]
  const sandbox = basename(sandboxDir)
  const found = territories.sections.filter(s => new RegExp(`\\(sandbox ${escaped(sandbox)}[;)]`).test(s.title))
  if (found.length === 0 && manifest.delegations) fail(noPackForTheDelegations(territories.path, sandbox))
  if (found.length === 0) return manifest
  if (found.length > 1) fail(twoHeadings(found.length, territories.path, sandbox))
  const heading = found[0]!
  const line = /^(.+?)(?:,|\s+\(sandbox )/.exec(heading.title)![1]!
  if (manifest.backlog && manifest.backlog.line !== line) fail(declaredLineDiffers(manifest.backlog.line, territories.path, sandbox, line))
  const missing: string[] = []
  const nextFile = join(sandboxDir, NEXT_FILE)
  let next: string | null = null
  let nextCode = ''
  try { next = readFileSync(nextFile, 'utf8') } catch (e) { nextCode = (e as NodeJS.ErrnoException).code ?? (e as Error).message }
  const items = theOpenItems(nextFile, next, nextCode)
  if ('missing' in items) missing.push(items.missing)
  if (next === null) missing.push(theNextMissing(nextFile, nextCode))

  const own = territories.sections.filter(s => s === heading || (s.path.length > heading.path.length && heading.path.every((p, i) => s.path[i] === p)))
  const rules = territories.text.split(/\n[ \t]*\n/).filter(paragraph => paragraph.startsWith(THE_FALLBACK_RULE))
  if (rules.length !== 1) missing.push(theFallbackRuleMissing(territories.path, rules.length))
  // A selection that is not whole is already the line's own section and its fallback rule, as the delivery chose them.
  const territory = territories.fullFile ? theLinesOwnTerritory(territories, own, rules.length === 1 ? rules[0]! : null) : null

  const fromTheOffice = manifest.regulations !== undefined
  const requirements = join(sandboxDir, REQUIREMENTS_FILE)
  const away = [...(existsSync(requirements) ? [requirements] : []), territories.path, ...(fromTheOffice ? [] : [code.path]), common.path, ...(next === null ? [] : [nextFile])]
  const from = { chaptersAt: manifest.regulations?.at ?? null, code: code.path, heading: heading.title, territories: territories.path, next: nextFile, common: common.path }
  const text = [
    `${theRoundStartPackHead(line)} ${whereEachPartCameFrom(from)}`,
    oneReadAway(away, fromTheOffice),
    ...(manifest.delegations ? [theDelegationPart(manifest.delegations)] : []),
    ...missing.map(theMissingLine),
    ...('given' in items ? items.given : []),
    ...(next !== null && next === manifest.brief.text ? [nextIsTheBrief()] : []),
    roundChaptersGivenText(manifest, territory),
    ...(next === null || next === manifest.brief.text ? [] : [`${nextWhole(nextFile)}\n\n${next}`]),
  ].join('\n\n')
  return readRoundChapters({ ...manifest, pack: { line, missing, text, bytes: bytes(text) } })
}
