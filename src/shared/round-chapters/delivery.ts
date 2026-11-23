// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bytes, codeChapters, deliveredRoundBrief, hash, hasRoundChaptersAcknowledgement, readableChaptersLine, readRoundChapters, REQUIREMENTS_FILE, roundChaptersAcknowledgement, ROUND_CHAPTERS, RULE_FILES, theChaptersReadAt, type RoundBacklog, type RoundChapters, type RoundDelegations, type RuleFile, type Section, type StandingStages } from './manifest.ts'
import { THE_FALLBACK_RULE, withTheRoundStartPack } from '../round-start-pack.ts'
import type { TheRoundsRules } from '../round-start-rules.ts'

type Selector = { chapter: number; descendants: true } | { path: string[]; descendants?: boolean }
type Selection = '*' | Selector[]
type Mapping = Record<RuleFile, Selection>
interface Policy { version: 1; kinds: Record<string, Mapping>; territories?: Record<string, Partial<Mapping>> }
function fail(why: string): never { throw new Error(`Round chapter delivery: ${why}. Nothing was started.`) }
const object = (x: unknown): x is Record<string, any> => typeof x === 'object' && x !== null && !Array.isArray(x)
const has = (o: object, key: string) => Object.hasOwn(o, key)

/** The words when the sandbox line, fallback rule or explicit selection cannot be trusted. */
export const THE_UNSAFE_TERRITORY_NOTICE = 'The sandbox line, fallback rule or explicit territory selection is unknown, ambiguous or inconsistent; all three rule files are delivered in full.'
/** The words for an absent or unknown kind; `narrowed` says whether the line and fallback rule were identified. */
export function unknownKindNotice(kind: string | null, narrowed: boolean): string {
  return `Unknown or missing round kind ${kind === null ? '(missing)' : JSON.stringify(kind)}; ${narrowed ? 'unclassified is a conservative selection policy, not an inferred work kind. CODE.md and LINE-common.md are delivered in full, with the identified line and fallback rule from TERRITORIES.md' : 'all three rule files are delivered in full'}.`
}
/** The note for an older office whose check has not acknowledged the saved manifest. */
export const THE_LEGACY_OFFICE_NOTE = 'Legacy office: all three rule files were delivered in full. This office has not acknowledged the saved manifest; its legacy chapter check remains until upgrade.'
/** Where a sandbox may put a policy override for its round chapters. */
export const ROUND_CHAPTERS_POLICY_FILE = 'briefs/round-chapters.policy.json'

/** Only a direct declaration describes this round; mentions in instructions or examples do not. */
function kindFromBrief(text: string): string | null {
  let fence: string | null = null
  text = text.split('\n').map(line => {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (fence !== null) {
      if (marker && marker[1]![0] === fence[0] && marker[1]!.length >= fence.length && marker[2]!.trim() === '') fence = null
      return ''
    }
    if (marker && !(marker[1]![0] === '`' && marker[2]!.includes('`'))) { fence = marker[1]!; return '' }
    return /^\s*>/.test(line) ? '' : line
  }).join('\n')
  // A historical section neither declares the round nor asks for work (README.md:13).
  let historical = false
  const current = text.split('\n').filter(line => {
    const heading = /^#{1,3}\s+(.+)/.exec(line)
    if (heading) historical = /\b(?:history|previous|earlier|past|what .+ (?:built|did)|rules)\b/i.test(heading[1]!)
    return !historical
  }).join('\n')
  const kinds = [...current.matchAll(/^(?:round kind|kind of this round):[ \t]*([^\s]+)[ \t]*$/gim)].map(m => m[1]!)
  for (const heading of current.matchAll(/^#\s+(development|code|tests|documents|words|one-plugin) round\s*$/gim)) {
    kinds.push(heading[1]!.toLowerCase() === 'code' ? 'development' : heading[1]!.toLowerCase())
  }
  // Recognize affirmative instructions, not a filename mentioned in history or an instruction to leave it alone.
  const instructions = current
  const sourceInstruction = /^(?:\*\*[^\n]*?\*\*\s*)?(?:change|add|implement|fix|remove|replace|update|build)\b([^\n]*?)\b(?:src|tools)\/[\w./-]+\.(?:ts|tsx|mjs|js)\b/i
  const negation = /\b(?:nothing|no|none|not|never|neither|nor|without|\w+n['’]t)\b/i
  const codeInstruction = instructions.split('\n').some(line => {
    const match = sourceInstruction.exec(line)
    return match !== null && !negation.test(match[1]!)
  }) || /\bThen one code commit (?:taking|adding|changing|removing)\b/i.test(instructions)
  if (codeInstruction && !/\b(?:no code|do not (?:write|change|make|add|commit) (?:any )?code)\b/i.test(instructions)) kinds.push('development')
  return kinds.length > 0 && new Set(kinds).size === 1 ? kinds[0]! : null
}

/** Select only when both the sandbox heading and the fallback paragraph are unambiguous. */
function ownTerritory(text: string, sandbox: string): Section[] | null {
  const sections = markdownSections(text)
  const escaped = sandbox.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = sections.filter(s => new RegExp(`\\(sandbox ${escaped}[;)]`).test(s.title))
  const marker = THE_FALLBACK_RULE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const paragraphs = [...text.matchAll(new RegExp(`(?:^|\\n\\s*\\n)(${marker}[^\\n]*(?:\\n(?!\\s*\\n)[^\\n]*)*)`, 'g'))]
  if (matches.length !== 1 || paragraphs.length !== 1) return null
  const rule = paragraphs[0]![1]!
  const beforeRule = text.slice(0, paragraphs[0]!.index! + paragraphs[0]![0].indexOf(rule))
  // Do not select an example inside a fenced block as the governing paragraph.
  let fence: string | null = null
  for (const line of beforeRule.split('\n')) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (marker && fence === null) fence = marker
    else if (marker && fence && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = null
  }
  if (fence !== null || !rule.startsWith(THE_FALLBACK_RULE)) return null
  const heading = matches[0]!
  const own = sections.filter(s => s === heading || (s.path.length > heading.path.length && heading.path.every((p, i) => s.path[i] === p)))
  if (own.some(s => s.text.includes(rule))) return own
  const paragraph: Section = { path: [], title: THE_FALLBACK_RULE, text: rule + '\n', bytes: bytes(rule + '\n') }
  const index = text.indexOf(rule)
  return index < text.indexOf(heading.text) ? [paragraph, ...own] : [...own, paragraph]
}

/**
 * The rules file a worktree must hold for a round to work in it. prepareRoundChapters reads the chapters from it, in
 * the round's worktree, only when it is given no `rules`; the launcher always gives them, read from the office.
 */
export const A_ROUNDS_RULES = 'src/config/rules/CODE.md'

/** Resolve only inside this sandbox (including symlinks); never search a sibling sandbox or the checkout. */
function inside(root: string, path: string): string {
  const realRoot = realpathSync(root)
  let real: string
  try { real = realpathSync(path) } catch { return fail(`missing file ${path}`) }
  const r = relative(realRoot, real)
  if (r === '..' || r.startsWith('..' + sep) || isAbsolute(r)) fail(`${path} resolves outside this sandbox`)
  return real
}
function json(file: string): any {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch (e) { return fail(`invalid JSON ${file}: ${(e as Error).message}`) }
}

/** ATX and Setext headings, excluding fenced code. Each block owns its body up to the next heading, not its descendants. */
export function markdownSections(text: string): Section[] {
  const lines = [...text.matchAll(/[^\n]*(?:\n|$)/g)].filter(m => m[0] !== '')
  const headings: { start: number; level: number; title: string }[] = []
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
    if (atx) { headings.push({ start: lines[i]!.index!, level: atx[1]!.length, title: (atx[2] ?? '').replace(/[ \t]+#+[ \t]*$/, '').trim() }); continue }
    if (i + 1 < lines.length && /^ {0,3}\S/.test(line) && !/^ {0,3}([-+*>]|\d+[.)])\s/.test(line)) {
      const setext = /^ {0,3}(=+|-+)[ \t]*\r?\n?$/.exec(lines[i + 1]![0])
      if (setext) { headings.push({ start: lines[i]!.index!, level: setext[1]![0] === '=' ? 1 : 2, title: line.trim() }); i++ }
    }
  }
  const out: Section[] = []; const parents: { level: number; title: string }[] = []
  const add = (path: string[], title: string, content: string) => out.push({ path, title, text: content, bytes: bytes(content) })
  const first = headings[0]?.start ?? text.length
  if (first > 0 || headings.length === 0) add([], '(preamble)', text.slice(0, first))
  for (const [i, heading] of headings.entries()) {
    while (parents.length && parents[parents.length - 1]!.level >= heading.level) parents.pop()
    parents.push({ level: heading.level, title: heading.title })
    add(parents.map(p => p.title), heading.title, text.slice(heading.start, headings[i + 1]?.start ?? text.length))
  }
  return out
}

function validateMapping(value: unknown, where: string, partial = false): void {
  if (!object(value)) fail(`invalid policy mapping ${where}`)
  for (const name of Object.keys(value)) if (!(RULE_FILES as readonly string[]).includes(name)) fail(`unknown policy source ${where}.${name}`)
  for (const name of RULE_FILES) {
    if (!has(value, name)) { if (!partial) fail(`missing policy selection ${where}.${name}`); continue }
    const select = value[name]
    if (select === '*') continue
    if (!Array.isArray(select)) fail(`invalid policy selection ${where}.${name}`)
    for (const one of select) {
      if (!object(one) || Object.keys(one).some(k => !['chapter', 'path', 'descendants'].includes(k))) fail(`invalid selector ${where}.${name}`)
      if (has(one, 'chapter')) {
        if (name !== 'CODE.md' || !Number.isSafeInteger(one.chapter) || one.chapter < 1 || one.descendants !== true || has(one, 'path')) fail(`invalid CODE chapter selector ${where}.${name}`)
      } else if (name === 'CODE.md' || !Array.isArray(one.path) || !one.path.length || !one.path.every((p: unknown) => typeof p === 'string' && p.trim()) || (one.descendants !== undefined && typeof one.descendants !== 'boolean')) fail(`invalid heading selector ${where}.${name}`)
    }
  }
}
function readPolicy(file: string): Policy {
  const p = json(file)
  if (!object(p) || p.version !== 1 || !object(p.kinds) || Object.keys(p).some(k => !['version', 'kinds', 'territories'].includes(k)) || (p.territories !== undefined && !object(p.territories))) fail(`invalid policy ${file}`)
  for (const [kind, mapping] of Object.entries(p.kinds)) validateMapping(mapping, `${file}:kind ${kind}`)
  for (const [territory, mapping] of Object.entries(p.territories ?? {})) validateMapping(mapping, `${file}:territory ${territory}`, true)
  return p as Policy
}
function selectSections(name: RuleFile, all: Section[], selection: Selection): Section[] {
  if (selection === '*') return all
  const selected = new Set<Section>()
  for (const selector of selection) {
    const found = all.filter(s => 'chapter' in selector
      ? new RegExp(`^Chapter\\s+${selector.chapter}\\b`, 'i').test(s.title)
      : s.path.length === selector.path.length && s.path.every((p, i) => p === selector.path[i]))
    const label = 'chapter' in selector ? `chapter ${selector.chapter}` : selector.path.join(' / ')
    if (found.length !== 1) fail(`${name}: selected ${label} ${found.length === 0 ? 'does not exist' : 'is ambiguous'}`)
    const section = found[0]!; selected.add(section)
    if (selector.descendants) for (const child of all) {
      if (child.path.length > section.path.length && section.path.every((p, i) => child.path[i] === p)) selected.add(child)
    }
  }
  return all.filter(s => selected.has(s))
}

/**
 * What `<brief>.round.json` declares: the round's kind and territory, and its line, the items of that line it works on
 * and the delegations it takes. Items and delegations need a line. A brief with no file declares nothing.
 *
 * AND THE WORK AREA THE STARTED WORKER IS GIVEN, read by `whyNotADeclaredWorkArea` below. It needs no line. It is read
 * here and never from the brief's own text, and one that is not a work area stops the start before anything is filed.
 */
export function roundDeclaration(brief: string): { file: string; kind: string | null; territory: unknown; line: string | null; items: string[]; delegations: string[]; workArea: string[] | null } {
  const file = theDeclarationOf(brief)
  const declaration = existsSync(file) ? json(file) : {}
  if (!object(declaration) || Object.keys(declaration).some(k => !['kind', 'territory', 'line', 'items', 'delegations', 'workArea'].includes(k))) fail(`invalid declaration ${file}`)
  if (declaration.kind != null && (typeof declaration.kind !== 'string' || !declaration.kind.trim())) fail(`invalid declaration kind in ${file}`)
  const word = (value: unknown) => typeof value === 'string' && value.trim() !== '' && value === value.trim()
  if (declaration.line != null && !word(declaration.line)) fail(`invalid declaration line in ${file}: a line is its name, with no blank around it`)
  if (declaration.items != null && (declaration.line == null || !Array.isArray(declaration.items) || !declaration.items.every(word) ||
      new Set(declaration.items).size !== declaration.items.length)) fail(`invalid declaration items in ${file}: items are a list of the line's item numbers, each once, and need a line`)
  if (declaration.delegations != null && (declaration.line == null || !Array.isArray(declaration.delegations) || !declaration.delegations.every(word) ||
      new Set(declaration.delegations).size !== declaration.delegations.length)) fail(`invalid declaration delegations in ${file}: delegations are a list of task record ids, each once, and need a line`)
  const notAnArea = declaration.workArea == null ? null : whyNotADeclaredWorkArea(declaration.workArea)
  if (notAnArea !== null) fail(`invalid declaration workArea in ${file}: ${notAnArea}`)
  return { file, kind: declaration.kind ?? null, territory: declaration.territory ?? null, line: declaration.line ?? null, items: declaration.items ?? [], delegations: declaration.delegations ?? [], workArea: declaration.workArea ?? null }
}

/**
 * THE ONE CHECK OF A DECLARED WORK AREA. The declaration's reader above, the two doors where a start is asked
 * (src/server/lib/worker-runs.ts and next-round.ts) and the launcher read a declared work area through it, so none of
 * them can take one the others refuse. A work area is a list of one or more paths, each once, each written relative to
 * the repository with `/` between its parts: no blank around it, no empty, `.` or `..` part, no backslash and no drive
 * letter, so it can neither start at a root nor climb out. A path in that plain form is the path the work area door
 * stores, so the area set from a declaration reads back as the declaration. The words why a value is not one, or null.
 */
export function whyNotADeclaredWorkArea(value: unknown): string | null {
  const plain = (path: unknown) => typeof path === 'string' && path === path.trim() && !path.includes('\\') && !/^[a-z]:/i.test(path) &&
    path.split('/').every(part => part !== '' && part !== '.' && part !== '..')
  if (Array.isArray(value) && value.length > 0 && value.every(plain) && new Set(value).size === value.length) return null
  return 'a work area is a list of one or more paths inside the repository, each once, each written relative to it with / between its parts, ' +
    'with no blank around it and no empty, . or .. part'
}

/** The file that holds a brief's declaration: beside the brief, under the brief's own name. */
export function theDeclarationOf(brief: string): string {
  return resolve(brief) + '.round.json'
}

/**
 * THE WORK AREA A BRIEF'S DECLARATION NAMES, AND NOTHING ELSE OF IT, read by the launcher. A brief with no declaration,
 * or one that names no work area, answers null: the rest of the declaration is the launcher's to read
 * (`roundDeclaration`). The two doors where a start is asked read the file themselves, only from inside the sandbox
 * folder, and hand its text to `theWorkAreaInADeclaration`.
 */
export function theWorkAreaDeclaredFor(brief: string): { file: string; workArea: string[] | null } | { file: string; refused: string } {
  const file = theDeclarationOf(brief)
  return existsSync(file) ? theWorkAreaInADeclaration(file, readFileSync(file, 'utf8')) : { file, workArea: null }
}

/**
 * The work area a declaration's text names, or null when it names none. A text that is not JSON may name one, so it
 * answers why instead of a guess, and so does a work area that is not one. The words why quote nothing of the text.
 */
export function theWorkAreaInADeclaration(file: string, text: string): { file: string; workArea: string[] | null } | { file: string; refused: string } {
  let declaration: unknown
  try { declaration = JSON.parse(text) } catch { return { file, refused: `The declaration ${file} cannot be read as JSON, so whether it names a work area is not known.` } }
  if (!object(declaration) || declaration.workArea == null) return { file, workArea: null }
  const notAnArea = whyNotADeclaredWorkArea(declaration.workArea)
  return notAnArea === null ? { file, workArea: declaration.workArea } : { file, refused: `The work area the declaration ${file} names is not one: ${notAnArea}.` }
}

/** WHETHER TWO WORK AREAS NAME THE SAME PATHS, in any order: how the launcher and the next round's door compare an agent's area with a declared one. */
export function theSameWorkArea(one: readonly string[], other: readonly string[]): boolean {
  return one.length === other.length && one.every(path => other.includes(path))
}

/**
 * The single round-start addition. All runtimes consume the returned derived brief. With `rules`, CODE.md is the text
 * the start made from the office's chapters, under the door and the time it read them at, and the person's live
 * regulations are saved and given; without, CODE.md is read from the worktree.
 */
export function prepareRoundChapters(input: { sandboxDir: string; worktree: string; brief: string; territory?: unknown; backlog?: RoundBacklog | null; standing?: StandingStages | null; delegations?: RoundDelegations | null; rules?: TheRoundsRules | null }): { manifest: RoundChapters; brief: string; workArea: string[] | null } {
  const root = realpathSync(input.sandboxDir)
  const original = resolve(input.brief)
  let task: string
  try { task = readFileSync(original, 'utf8') } catch { return fail(`missing task brief ${original}`) }
  const declaration = roundDeclaration(original)
  const declarationFile = declaration.file
  const declaredTerritory = declaration.territory ?? input.territory ?? null
  if (declaredTerritory !== null && (!Array.isArray(declaredTerritory) || !declaredTerritory.every((p: unknown) => typeof p === 'string' && p.trim()))) fail(`invalid territory path list in ${declarationFile}`)
  const kind: string | null = declaration.kind ?? kindFromBrief(task)
  const territory: string[] | null = declaredTerritory
  const backlog = input.backlog ?? null
  if (declaration.line === null && backlog !== null) fail('a backlog reading was given, but the declaration names no line')
  if (declaration.line !== null && backlog === null) fail(`the declaration names line ${declaration.line}, but the round start did not read its backlog`)
  if (backlog !== null && (backlog.line !== declaration.line || JSON.stringify(backlog.named) !== JSON.stringify(declaration.items))) fail('the backlog reading is not the one the declaration names')
  if (backlog?.from === 'the file' && !existsSync(join(root, REQUIREMENTS_FILE))) fail(`the office has no items of line ${backlog.line} to give, and this sandbox has no ${REQUIREMENTS_FILE} to read instead`)
  const delegations = input.delegations ?? null
  if (declaration.delegations.length === 0 && delegations !== null) fail('a delegation reading was given, but the declaration names no delegation')
  if (declaration.delegations.length > 0 && delegations === null) fail(`the declaration names the delegations ${declaration.delegations.join(', ')}, but the round start did not read them`)
  if (delegations !== null && (delegations.line !== declaration.line || JSON.stringify(delegations.named) !== JSON.stringify(declaration.delegations))) fail('the delegation reading is not the one the declaration names')
  const override = join(root, ROUND_CHAPTERS_POLICY_FILE)
  const policyFile = existsSync(override) ? inside(root, override) : fileURLToPath(new URL('./policy.json', import.meta.url))
  const policy = readPolicy(policyFile)
  const unclassified = kind === null || kind === 'unclassified' || !has(policy.kinds, kind)
  let fallback = unclassified
  let mapping = fallback ? null : { ...policy.kinds[kind!]! }
  if (mapping) for (const [prefix, extra] of Object.entries(policy.territories ?? {})) {
    if (!territory?.some(p => p === prefix || p.startsWith(prefix + '/'))) continue
    for (const name of RULE_FILES) {
      const added = extra[name]
      if (added === undefined) continue
      const base = mapping[name]
      mapping[name] = base === '*' || added === '*' ? '*' : [...base, ...added]
    }
  }
  const rules = input.rules ?? null
  const paths: Record<RuleFile, string> = {
    'CODE.md': rules === null ? inside(root, join(input.worktree, A_ROUNDS_RULES)) : theChaptersReadAt(rules.regulations.at),
    'LINE-common.md': inside(root, join(root, 'briefs/LINE-common.md')),
    'TERRITORIES.md': inside(root, join(root, 'briefs/TERRITORIES.md')),
  }
  const territoryText = readFileSync(paths['TERRITORIES.md'], 'utf8')
  const sandboxName = basename(root).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const allTerritories = markdownSections(territoryText)
  const headingsForSandbox = allTerritories.filter(s => new RegExp(`\\(sandbox ${sandboxName}[;)]`).test(s.title))
  let own = ownTerritory(territoryText, basename(root))
  let unsafeTerritory = mapping?.['TERRITORIES.md'] === '*' && own === null
  if (mapping && mapping['TERRITORIES.md'] !== '*') {
    const explicit = selectSections('TERRITORIES.md', allTerritories, mapping['TERRITORIES.md'])
    // A sandbox override is honored only if it describes the same complete own-line selection.
    // An unnamed sandbox keeps the pre-existing explicit policy behavior.
    if (headingsForSandbox.length === 0) own = null
    else if (own === null || explicit.map(s => s.text).join('') !== own.map(s => s.text).join('')) {
      unsafeTerritory = true
      own = null
    }
  }
  if (unsafeTerritory) { fallback = true; mapping = null }
  // The existing server requires every fallback source to be whole. An unclassified policy is not a
  // guessed work kind: its explicit notice says so, and its conservative CODE and common files stay whole.
  if (unclassified && own) fallback = false
  const savedKind = unclassified && own && kind === null ? 'unclassified' : kind
  const sources = RULE_FILES.map(name => {
    const text = rules !== null && name === 'CODE.md' ? rules.code : readFileSync(paths[name], 'utf8')
    const sections = name === 'TERRITORIES.md' && own ? own : selectSections(name, markdownSections(text), mapping?.[name] ?? '*')
    const selected = sections.map(s => s.text).join('')
    return { name, path: paths[name], sha256: hash(text), sourceBytes: bytes(text), fullFile: !(name === 'TERRITORIES.md' && own) && (mapping === null || mapping[name] === '*'), sections, text: selected, bytes: bytes(selected) }
  })
  const chosen = readRoundChapters({ version: 1, kind: savedKind, territory, fallback,
    notice: unsafeTerritory ? THE_UNSAFE_TERRITORY_NOTICE : unclassified ? unknownKindNotice(kind, own !== null) : null,
    policy: { path: policyFile, sha256: hash(readFileSync(policyFile, 'utf8')) },
    brief: { path: original, sha256: hash(task), text: task, bytes: bytes(task) }, sources, chapters: codeChapters(sources[0]!.sections),
    ...(backlog === null ? {} : { backlog }),
    ...(input.standing == null ? {} : { standing: input.standing }),
    ...(delegations === null ? {} : { delegations }),
    ...(rules === null ? {} : { regulations: rules.regulations }),
  })
  // The pack gives CODE.md at outline, with the full chapters one read away, and the line's part of TERRITORIES.md; its
  // check is given the saved selection.
  const manifest = withTheRoundStartPack(chosen, root)
  const folder = theDeliveryFolder(root)
  const stamp = hash(JSON.stringify(manifest))
  const brief = join(folder, `${stamp}.md`)
  if (existsSync(brief)) inside(folder, brief)
  if (existsSync(join(folder, `${stamp}.json`))) inside(folder, join(folder, `${stamp}.json`))
  writeFileSync(brief, deliveredRoundBrief(manifest), { flag: 'w', mode: 0o600 })
  writeFileSync(join(folder, `${stamp}.json`), JSON.stringify(manifest, null, 2) + '\n', { flag: 'w', mode: 0o600 })
  return { manifest, brief, workArea: declaration.workArea }
}

/** This sandbox's out/round-chapters, made if it is missing, with no symlink on the way to it. */
function theDeliveryFolder(root: string): string {
  mkdirSync(join(root, 'out'), { recursive: true })
  const out = inside(root, join(root, 'out'))
  if (out !== join(root, 'out')) fail('out must be this sandbox’s own directory, without a symlink')
  const folder = join(out, 'round-chapters'); mkdirSync(folder, { recursive: true })
  // Check the created path too: an existing link under out must not redirect derived evidence.
  if (inside(root, folder) !== folder) fail('round chapter output directory must not be a symlink')
  return folder
}

/** The words before and after the file a short prompt names. */
const A_SHORT_PROMPT = ['Your brief for this round is the file ', '. Read it whole before you do anything, and follow it.'] as const

/**
 * THE SHORT PROMPT, given to Codex or OpenCode as the command's last word in place of a brief too long for one argument.
 * It names the file that holds the brief, by its path inside the container.
 */
export function theShortPrompt(file: string): string {
  return A_SHORT_PROMPT[0] + file + A_SHORT_PROMPT[1]
}

/** The file a short prompt names, or null when `word` is not a short prompt. */
export function theFileAShortPromptNames(word: string): string | null {
  const [before, after] = A_SHORT_PROMPT
  if (word.length <= before.length + after.length || !word.startsWith(before) || !word.endsWith(after)) return null
  return word.slice(before.length, word.length - after.length)
}

/** Whether `named` is an absolute path to the file `file` is, its links followed; false when either is not there. */
function theSameFile(named: string, file: string): boolean {
  if (!isAbsolute(named)) return false
  try { return realpathSync(named) === realpathSync(file) } catch { return false }
}

/**
 * A WORKER'S BRIEF WITH THE STANDING STAGES BEFORE IT. A worker's brief ends with its own last step, so the stages go
 * first, and the brief follows them unchanged. With no stage to give, the brief and the command are the ones given.
 * Codex and OpenCode take the brief's text as the command's last word, so that word is given the new text. A last word
 * that is the short prompt naming the brief's file is given the short prompt naming the new brief. Any other last word
 * is refused, since the stages could not be put into it.
 */
export function theBriefWithTheStandingStages(input: { sandboxDir: string; brief: string; standing: StandingStages; command?: string[] | null }): { brief: string; command: string[] | null } {
  const command = input.command ?? null
  if (input.standing.flows.length === 0) return { brief: input.brief, command }
  const root = realpathSync(input.sandboxDir)
  const original = resolve(input.brief)
  let task: string
  try { task = readFileSync(original, 'utf8') } catch { return fail(`missing task brief ${original}`) }
  const text = input.standing.text + '\n\n---\n\n' + task
  const folder = theDeliveryFolder(root)
  const brief = join(folder, `${hash(text)}.md`)
  if (existsSync(brief)) inside(folder, brief)
  writeFileSync(brief, text, { flag: 'w', mode: 0o600 })
  const program = command === null || command.length === 0 ? null : basename(command[0]!)
  if (command === null || (program !== 'codex' && program !== 'opencode')) return { brief, command }
  const last = command.at(-1)!
  if (last === task) return { brief, command: [...command.slice(0, -1), text] }
  const named = theFileAShortPromptNames(last)
  if (named === null || !theSameFile(named, original)) {
    fail(`the ${program} command's last word is neither the text of the brief nor the short prompt that names the brief's file, so the standing stages cannot be given to it`)
  }
  return { brief, command: [...command.slice(0, -1), theShortPrompt(brief)] }
}

/** Whether two values are the same JSON, whatever the order of each object's keys. */
function theSameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((one, i) => theSameValue(one, b[i]))
  if (object(a) && object(b)) {
    const keys = Object.keys(a).filter(key => a[key] !== undefined)
    return keys.length === Object.keys(b).filter(key => b[key] !== undefined).length &&
      keys.every(key => has(b, key) && theSameValue(a[key], b[key]))
  }
  return Object.is(a, b)
}

/** Save with the launcher's existing safe request helper. A request that gave up is read back before it is called a refusal; older offices need no new field. */
export async function saveRoundChapters(input: { id: string | null; manifest: RoundChapters; request: (method: string, path: string, body?: any) => Promise<any> }): Promise<string | null> {
  if (!input.id) fail('this helper cannot file a run on the host, so the manifest cannot be saved before start; upgrade the sandbox helper')
  const path = `/api/records/${encodeURIComponent(input.id!)}`
  const before = await input.request('GET', path)
  if (before.status !== 200 || !object(before.body?.record?.data)) fail(`cannot read run ${input.id} before saving chapters (${before.status})`)
  const data = before.body.record.data
  const saved = await input.request('PATCH', path, { dataPatch: {
    extra: { ...(object(data.extra) ? data.extra : {}), [ROUND_CHAPTERS]: input.manifest },
    ...(input.manifest.territory === null ? {} : { territory: input.manifest.territory }),
  } })
  if (saved.status !== null && saved.status !== 200) fail(`cannot save chapter manifest on run ${input.id} (${saved.status}): ${saved.body?.error ?? 'office refused'}`)
  let lateNotice: string | null = null
  if (saved.status === null) {
    const readBack = await input.request('GET', path)
    const readData = readBack.status === 200 && object(readBack.body?.record?.data) ? readBack.body.record.data : null
    const held = readData !== null && object(readData.extra) ? readData.extra[ROUND_CHAPTERS] : undefined
    let sameManifest = false
    if (held !== undefined) {
      try { sameManifest = theSameValue(readRoundChapters(held), readRoundChapters(input.manifest)) } catch { sameManifest = false }
    }
    const sameTerritory = input.manifest.territory === null || theSameValue(readData?.territory, input.manifest.territory)
    if (!sameManifest || !sameTerritory) {
      const readSays = readBack.status === null
        ? `the read of the run did not answer (${readBack.code ?? 'no code'}: ${readBack.why ?? 'no reason given'})`
        : readBack.status !== 200
          ? `the read of the run answered ${readBack.status}`
          : 'the run does not hold the manifest as sent'
      fail(`the office did not answer the chapter save on run ${input.id} (${saved.code ?? 'no code'}: ${saved.why ?? 'no reason given'}), and ${readSays}`)
    }
    lateNotice = `The office did not answer the chapter save on run ${input.id} in time (${saved.code ?? 'no code'}: ${saved.why ?? 'no reason given'}); the run holds the saved manifest, so the round starts.`
  }
  const checked = await input.request('GET', `/api/checks/${encodeURIComponent(input.id!)}`)
  if (checked.status !== 200) fail(`cannot read the chapter acknowledgement for run ${input.id} (${checked.status}): ${checked.body?.error ?? 'office did not answer'}`)
  const acknowledged = checked.body?.chapters
  if (!readableChaptersLine(acknowledged)) fail('the office returned an unreadable chapter reading in its 200 check reply')
  const expected = input.manifest.chapters
  const exactList = Array.isArray(acknowledged?.mustRead) && acknowledged.mustRead.length === expected.length &&
    acknowledged.mustRead.every((one: any, i: number) => one?.chapter === expected[i]!.chapter && one?.level === expected[i]!.level)
  if (acknowledged?.says === roundChaptersAcknowledgement(input.manifest) && exactList) return lateNotice
  const legacy = !hasRoundChaptersAcknowledgement(acknowledged?.says)
  if (legacy && input.manifest.sources.every(source => source.fullFile)) {
    return lateNotice === null ? THE_LEGACY_OFFICE_NOTE : `${lateNotice} ${THE_LEGACY_OFFICE_NOTE}`
  }
  fail('the office did not acknowledge the exact saved chapter list, levels and text hash; upgrade the office before starting a narrowed round')
}
