// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLUGIN'S MANIFEST, AND THE READ-ONLY INTERFACE IT MAY NAME, DECLARED ONCE. Wave 13x round 14, steps 1 and 2 of the
 * plugin pipeline udGnc-Bsr15R (blocks N0TWpg5xe6mo and 1DP8abzhUpNb), under the module xMi387tqE4Og.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A PLUGIN IS
 * ---------------------------------------------------------------------------------------
 *
 * A folder under plugins/ in this repository, holding a `plugin.json` that this schema accepts, as choice A of a
 * decision has it. The folder's name is the plugin's id. Each plugin has a switch on the
 * Settings page, off until somebody switches it on. The office reads the folder again on every request, so a plugin
 * added or switched needs no restart.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A PLUGIN MAY READ, AND WHAT IT MAY NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * Version 1 of the interface publishes read views under /api/plugin-read/v1/. A plugin writes nothing in v1. The owner
 * chose A and marked it as not settled. No route under /api/plugin-read/ writes, no view
 * carries the
 * text of a message, and no view carries a key or a field named like one. tests/the-plugin-read-interface-v1.test.ts
 * holds all of this.
 *
 * A PLUGIN'S OWN STORE, IF ONE IS ADDED LATER, IS ADDITIVE. It would be a new optional key in the manifest and routes
 * under a new path. Nothing in the existing views would change shape. The manifest is strict, so a manifest that
 * names a store today is refused rather than half-read.
 */
import { z } from 'zod'

import { EDIT_SEGMENT } from './addresses.ts'
import { sayInEnglish, type WordKey } from './i18n.ts'
import {
  aPluginOnlyChange,
  type APluginOnlyChange,
  NOT_READ_BY_THE_PLUGIN_RULE,
  PLUGIN_BUILT_FOLDER,
  PLUGIN_ID,
  PLUGIN_MANIFEST_FILE,
  PLUGINS_FOLDER,
  type ThePluginRule,
  thePluginRuleOf,
} from './plugin-change.ts'
import { PLUGIN_READ_INTERFACE, PLUGIN_READ_VIEWS, type PluginReadView } from './plugin-read.ts'

/**
 * THE INTERFACE AND ITS VIEWS ARE PUBLISHED IN src/shared/plugin-read.ts, the one file a plugin may import, and
 * are read here from there.
 */
export { PLUGIN_READ_INTERFACE, PLUGIN_READ_VIEWS, type PluginReadView }

/**
 * WHAT A PLUGIN-ONLY CHANGE IS, AND THE NAMES IT IS WORKED OUT FROM, are in src/shared/plugin-change.ts, which imports
 * nothing so the merge tool can read it under plain node. They are read here from there.
 */
export { aPluginOnlyChange, type APluginOnlyChange, NOT_READ_BY_THE_PLUGIN_RULE, PLUGIN_BUILT_FOLDER, PLUGIN_ID, PLUGIN_MANIFEST_FILE, PLUGINS_FOLDER, type ThePluginRule, thePluginRuleOf }

/**
 * THE TIME EACH VIEW MUST ANSWER IN, IN MILLISECONDS: the median of five reads, on a made-up office of 4 projects, 300
 * agents with 4 runs each and 2,000 messages. tests/the-plugin-read-views-answer-in-their-budget.test.ts holds them, in
 * the timing group only (`node tools/run-named-tests.mjs --list timing`): the repository's agreements IIn_6cgXcULg and
 * fHiYFULUPYw_ keep absolute times out of the merge gates.
 *
 * MEASURED ON A BUSY MACHINE, 11 October 2026 (load 24 to 27 on 20 cores, so not a qualified timing run): projects 7 to
 * 10, people 180 to 265, work 170 to 325, talk 60 to 65. people and work were read through the scene of the older
 * built-in map then, which is why they were the slow two. Nobody has measured them on a quiet machine yet. The roster
 * was added in wave 13y round 50 with the budget of projects, because like projects it reads registry rows and works
 * nothing out. online was added in wave 13y round 66 with the budget of people, because it reads the people view's
 * presence readings, as far as the red and green steps of its dots.
 */
export const PLUGIN_READ_BUDGET_MS: Readonly<Record<PluginReadView, number>> = {
  projects: 50,
  people: 400,
  work: 400,
  talk: 200,
  roster: 50,
  online: 400,
  status: 400,
  asleep: 50,
}

/** A name or title a person reads: English always, Chinese when the plugin gives one. */
const wordsForAPerson = z.strictObject({
  en: z.string().trim().min(1, 'en is the English, and it may not be empty.').max(80),
  zh: z.string().trim().min(1).max(80).optional(),
})

/** One page a plugin draws. Its slug is its address inside the plugin. */
const pluginPage = z.strictObject({
  slug: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,39}$/, 'A page slug is lower case, starts with a letter, and has at most 40 characters.')
    // AN ADDRESS ENDING IN /edit IS THE OFFICE'S OWN WORD for writing in a page, so a page called that could never be
    // opened (src/shared/addresses.ts, EDIT_SEGMENT).
    .refine((slug) => slug !== EDIT_SEGMENT, `A page may not be called "${EDIT_SEGMENT}", because the office's addresses end in it when a page is being edited.`),
  title: wordsForAPerson,
})

/** What `plugin.json` must hold. Strict: a key this office does not know is refused, not ignored. */
export const pluginManifestSchema = z.strictObject({
  id: z.string().regex(PLUGIN_ID, 'An id is lower case, starts with a letter, and has 2 to 40 characters.'),
  name: wordsForAPerson,
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'A version is three numbers, such as 1.0.0.'),
  interface: z.literal(PLUGIN_READ_INTERFACE, { error: `interface is "${PLUGIN_READ_INTERFACE}", the only one there is.` }),
  pages: z
    .array(pluginPage)
    .min(1, 'A plugin draws at least one page.')
    .max(20)
    .refine((pages) => new Set(pages.map((p) => p.slug)).size === pages.length, 'Two pages have the same slug.'),
  reads: z
    .array(z.enum(PLUGIN_READ_VIEWS))
    .refine((reads) => new Set(reads).size === reads.length, 'A view is named twice in reads.'),
  budget: z.strictObject({
    builtKilobytes: z.number().int().positive().max(10_240),
  }),
})
export type PluginManifest = z.infer<typeof pluginManifestSchema>

/** One reason a manifest was refused: the field it is about, as a dotted path ('' for the whole file), and why. */
export interface AManifestIssue {
  path: string
  message: string
}

/**
 * WHY A PLUGIN WAS REFUSED, AS DATA A PAGE CAN SAY IN ITS OWN WORDS. It follows 2ofDpr3_ED-D
 * and a decision.
 * `cause` is one word from the closed list below. The causes that carry more say what the office saw: `what` is what
 * a plugin.json turned out to be when it is not a file, `said` is the id a manifest gives when it differs from its
 * folder, and `fields` says where in a manifest each fault this office will not accept is and what is wrong there.
 * The English `refusal` stays beside this for Developer mode, which draws the reader's own text.
 */
export const PLUGIN_REFUSAL_CAUSES = [
  'folder-leads-nowhere',
  'folder-is-a-link',
  'folder-cannot-be-opened',
  'manifest-is-a-link',
  'manifest-is-a-folder',
  'manifest-cannot-be-read',
  'manifest-is-not-a-file',
  'no-manifest',
  'manifest-is-not-json',
  'id-differs',
  'manifest-fields',
] as const
export type PluginRefusalCause = (typeof PLUGIN_REFUSAL_CAUSES)[number]

/** What lstat says a plugin.json is when it is not a file, a folder or a link: one word, so a page can name it. */
export type PluginManifestIsNotAFile = 'named-pipe' | 'socket' | 'character-device' | 'block-device' | 'unknown'

/**
 * THE WORDS TABLE'S NAME FOR EACH OF THOSE THINGS, WRITTEN ONCE. The office's reader of the plugins folder builds
 * the English refusal from these, and a page draws the reason in its own language from them. Two copies could drift
 * with nothing failing (USER.md invariant 9).
 */
export const A_THING_WORD: Readonly<Record<PluginManifestIsNotAFile, WordKey>> = {
  'named-pipe': 'settingsPanel.plugins.thing.namedPipe',
  socket: 'settingsPanel.plugins.thing.socket',
  'character-device': 'settingsPanel.plugins.thing.characterDevice',
  'block-device': 'settingsPanel.plugins.thing.blockDevice',
  unknown: 'settingsPanel.plugins.thing.unknown',
}

/**
 * Why one field of a manifest was refused: the top-level key it is about ('' for the whole file), and what is wrong.
 * A fault inside a field that is there also says where in it: `entry` is the entry of a list (pages, reads), counted
 * from 1 as a person counts, and `inside` is the key below the field or its entry, such as "builtKilobytes", "slug"
 * or "title.en". Each is absent when the fault is not inside it, so `{ field: 'version', problem: 'missing' }` means
 * the file has no version at all (the inspector's refusal zwnmGQMbxUKt).
 */
export interface AManifestFieldProblem {
  field: string
  problem: 'missing' | 'not-known' | 'not-usable'
  entry?: number
  inside?: string
}

/** One reason a plugin was refused: the one-word cause, and the parts of it that cause carries. */
export type PluginRefusedBecause =
  | { cause: 'folder-leads-nowhere' }
  | { cause: 'folder-is-a-link' }
  | { cause: 'folder-cannot-be-opened' }
  | { cause: 'manifest-is-a-link' }
  | { cause: 'manifest-is-a-folder' }
  | { cause: 'manifest-cannot-be-read' }
  | { cause: 'manifest-is-not-a-file'; what: PluginManifestIsNotAFile }
  | { cause: 'no-manifest' }
  | { cause: 'manifest-is-not-json' }
  | { cause: 'id-differs'; said: string }
  | { cause: 'manifest-fields'; fields: AManifestFieldProblem[] }

/** One issue from the schema, as much of it as working out `problem` reads. */
interface AParsedManifestIssue {
  code: string
  path: readonly PropertyKey[]
  keys?: readonly string[]
}

/** Whether the parsed JSON has a value at `path`. A path that runs out of object before its end has none. */
function hasAValueAt(parsed: unknown, path: readonly PropertyKey[]): boolean {
  let at: unknown = parsed
  for (const part of path) {
    if (typeof at !== 'object' || at === null || !Object.hasOwn(at, part)) return false
    at = (at as Record<PropertyKey, unknown>)[part]
  }
  return true
}

/**
 * Where in a manifest each issue is, and what is wrong there, each place and problem once. The place is the path
 * the fault is at: the issue's own path, and for a key this office does not know, that path with the key added.
 * `not-known` is for such a key; `missing` is for a place with no value in the parsed JSON; every other issue is
 * `not-usable`. The first key of the place is the field, a list position after it is the entry, and the keys after
 * that are inside. So `budget: {}` is the budget with no builtKilobytes inside, never the budget missing. An issue
 * about the whole file has the field '', which no page can name.
 */
function theFieldProblems(issues: readonly AParsedManifestIssue[], parsed: unknown): AManifestFieldProblem[] {
  const fields: AManifestFieldProblem[] = []
  const add = (at: readonly PropertyKey[], problem: AManifestFieldProblem['problem']): void => {
    const one: AManifestFieldProblem = { field: at.length === 0 ? '' : String(at[0]), problem }
    let rest = at.slice(1)
    if (typeof rest[0] === 'number') {
      one.entry = rest[0] + 1
      rest = rest.slice(1)
    }
    if (rest.length > 0) one.inside = rest.map(String).join('.')
    const same = (other: AManifestFieldProblem): boolean =>
      other.field === one.field && other.problem === one.problem && other.entry === one.entry && other.inside === one.inside
    if (!fields.some(same)) fields.push(one)
  }
  for (const issue of issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys ?? []) add([...issue.path, key], 'not-known')
      continue
    }
    add(issue.path, hasAValueAt(parsed, issue.path) ? 'not-usable' : 'missing')
  }
  return fields
}

/**
 * THE MANIFEST OF THE PLUGIN `id`, FROM THE TEXT OF ITS plugin.json, OR WHY IT IS REFUSED. `text` is null when the
 * folder has no plugin.json. This is the one reading of a manifest: the office's reader of the plugins folder
 * (src/server/lib/plugins.ts) and the plugin's own check (tools/check-a-plugin.mjs) both ask it. Each issue keeps the
 * path of its field, so the check can tell a view the interface does not have from any other fault.
 *
 * THE ENGLISH OF no-manifest AND id-differs COMES FROM THE WORDS TABLE (`sayInEnglish`), so the same sentence a page
 * draws in the page's language is the one the office answers with. The other reasons keep their reader's own text:
 * what a parser wrote about a file that is not JSON, and the schema's own words about each field, which Developer
 * mode draws and which no word list holds.
 */
export function aManifestFrom(
  id: string,
  text: string | null,
): { manifest: PluginManifest } | { refusal: string; issues: AManifestIssue[]; refusedBecause: PluginRefusedBecause } {
  if (text === null) {
    const refusal = sayInEnglish('settingsPanel.plugins.why.noManifest')
    return { refusal, issues: [{ path: '', message: refusal }], refusedBecause: { cause: 'no-manifest' } }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return {
      refusal: `${PLUGIN_MANIFEST_FILE} is not JSON: ${(error as Error).message}`,
      issues: [{ path: '', message: `${PLUGIN_MANIFEST_FILE} is not JSON: ${(error as Error).message}` }],
      refusedBecause: { cause: 'manifest-is-not-json' },
    }
  }
  const checked = pluginManifestSchema.safeParse(parsed)
  if (!checked.success) {
    const issues = checked.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message }))
    const said = issues.map((issue) => `${issue.path || 'the manifest'}: ${issue.message}`)
    return {
      refusal: `${PLUGIN_MANIFEST_FILE} is not a manifest this office accepts. ${said.join(' ')}`,
      issues,
      refusedBecause: { cause: 'manifest-fields', fields: theFieldProblems(checked.error.issues, parsed) },
    }
  }
  if (checked.data.id !== id) {
    return {
      refusal: sayInEnglish('settingsPanel.plugins.why.idDiffers', { said: checked.data.id, id }),
      issues: [{ path: 'id', message: sayInEnglish('settingsPanel.plugins.why.idDiffers', { said: checked.data.id, id }) }],
      refusedBecause: { cause: 'id-differs', said: checked.data.id },
    }
  }
  return { manifest: checked.data }
}

/** The one file under src/ a plugin may import: the published read types. */
export const THE_PUBLISHED_READ_TYPES = 'src/shared/plugin-read.ts'

/** One plugin as GET /api/plugins answers it. */
export interface PluginReading {
  /** The folder's name. */
  id: string
  /**
   * on and off are the switch; refused is a manifest this office could not accept, a plugin.json that is a link, a
   * folder, a named pipe, a socket or a device, or that this office has no permission to read, or a plugin folder that
   * is a link, to another place or to nothing, or that this office has no permission to look inside, and it cannot be
   * switched on.
   */
  state: 'on' | 'off' | 'refused'
  /** True when nobody has switched this plugin, and then it is off. */
  nobodyChose: boolean
  /** The manifest as accepted, or null when it was refused. */
  manifest: PluginManifest | null
  /**
   * Why the plugin was refused, in English: the office's reader's own text. The Settings panel and a plugin's own page
   * draw it in Developer mode only, and only where `theRawTextSaysMore` (src/web/lib/plugin-reason.ts) says it adds to
   * the plain words.
   */
  refusal: string | null
  /** The same reason as data, for a page to say in the page's language, or null when the plugin was not refused. */
  refusedBecause: PluginRefusedBecause | null
}

/** GET /api/plugins. */
export interface PluginsReading {
  /** False when there is no plugins/ folder in this install, which is not the same as an empty one. */
  folderFound: boolean
  interface: typeof PLUGIN_READ_INTERFACE
  plugins: PluginReading[]
}

/*
 * ---------------------------------------------------------------------------------------
 * THE SLOT: WHERE A PLUGIN'S PAGE IS DRAWN, AND HOW IT ASKS THE OFFICE (wave 13x round 15, step 3, block 3nJsBlPlYhcl)
 * ---------------------------------------------------------------------------------------
 *
 * A switched-on plugin's page is at #/plugin/<id>/<slug>, inside the office's frame. The office draws it in an iframe
 * with sandbox="allow-scripts" and nothing else, so the page has no origin of its own: it cannot read the office's
 * storage or cookies, open a window, or move the office's page. The files come from GET /api/plugins/<id>/files/, which
 * serves them only while the plugin is on, under a content policy that lets the page load its own files and connect to
 * nothing. A worker the page starts from a blob: address it made is held to the same policy. So the page's one way to
 * the office is to ask the slot, by postMessage, and the slot reads only the views of interface v1 that the plugin's
 * manifest names, as the person reading the page.
 */

/** The file a page is drawn from, inside the built folder. */
export function pluginPageFile(slug: string): string {
  return `${slug}.html`
}

/** Where the office serves the plugin `id`'s files: GET /api/plugins/<id>/files/<path under dist/>. */
export function pluginFileAddress(id: string, path = ''): string {
  return `/api/plugins/${encodeURIComponent(id)}/files/${path}`
}

/** A plugin's name or a page's title in the page's language: the Chinese when the manifest gives one, else English. */
export function pluginWordsIn(words: { en: string; zh?: string | undefined }, language: string): string {
  return language === 'zh' && words.zh !== undefined ? words.zh : words.en
}

/** How long a plugin's page has to say it is ready before the slot says it is not answering. */
export const PLUGIN_READY_WITHIN_MS = 10_000

/**
 * THE OFFICE MAP PLUGIN'S ID, the name of its folder, plugins/office-map (wave 13y round 119). The office stores one
 * setting for it, whether the map moves. Its row on the Settings page folds open to that setting
 * (src/web/components/PluginSwitches.tsx), and its page is told reduced motion while the setting is off
 * (src/web/pages/PluginPage.tsx).
 */
export const OFFICE_MAP_PLUGIN = 'office-map'

/** Why a plugin, or one page of it, has no page in this office. */
export type WhyAPluginHasNoPage =
  | { why: 'no-folder' }
  | { why: 'unknown' }
  | { why: 'refused'; refusal: string }
  | { why: 'off'; nobodyChose: boolean }
  | { why: 'no-such-page' }

/**
 * WHETHER A PLUGIN HAS A PAGE, WORKED OUT HERE AND NOWHERE ELSE. The slot asks it for one page, and the file door asks
 * it with no page, for the plugin as a whole. null means the page may be drawn. Only a plugin that is switched on has
 * one.
 */
export function whyAPluginHasNoPage(reading: PluginsReading, id: string, slug: string | null): WhyAPluginHasNoPage | null {
  if (!reading.folderFound) return { why: 'no-folder' }
  const plugin = reading.plugins.find((one) => one.id === id)
  if (plugin === undefined) return { why: 'unknown' }
  if (plugin.manifest === null) return { why: 'refused', refusal: plugin.refusal ?? '' }
  if (plugin.state !== 'on') return { why: 'off', nobodyChose: plugin.nobodyChose }
  if (slug !== null && !plugin.manifest.pages.some((page) => page.slug === slug)) return { why: 'no-such-page' }
  return null
}

/**
 * WHAT A PLUGIN'S PAGE MAY SAY TO THE SLOT, by window.parent.postMessage(message, '*'). Every message names the
 * interface. Anything else that reaches the slot is not answered.
 *
 *   {interface, ask: 'ready', answers?: 'bytes'}
 *       The page is ready. The slot answers with a context message, and sends it again whenever the language, the
 *       theme, reduced motion or the project changes. Wave 13y round 44: answers: 'bytes' asks for transferred HTTP
 *       bodies; leaving it out chooses object answers for later reads.
 *   {interface, ask: 'read', id, view, query?, tag?}
 *       Read one view. id is the page's own name for this asking, and comes back on the answer. query is passed to the
 *       view as it is, and the view refuses what it does not take (talk takes after and limit). Each value is at most
 *       200 characters, except agents, whose length this schema does not limit (wave 13y round 52). The slot refuses a
 *       read whose path and query, as theTargetOfARead builds them, are over READ_TARGET_LIMIT bytes, with too-long,
 *       the read's id and view, and the bytes and the limit (round 52's fix); src/web/pages/PluginPage.tsx does that
 *       after the manifest and before already-asking.
 *       tag is the tag of an earlier answer, and the answer is status 304 with no body when nothing changed.
 */

export const pluginAsksTheSlot = z.discriminatedUnion('ask', [
  z.strictObject({ interface: z.literal(PLUGIN_READ_INTERFACE), ask: z.literal('ready'), answers: z.literal('bytes').optional() }),
  z.strictObject({
    interface: z.literal(PLUGIN_READ_INTERFACE),
    ask: z.literal('read'),
    id: z.string().min(1).max(64),
    view: z.string().min(1).max(40),
    query: z
      .record(z.string().max(40), z.union([z.string(), z.number()]))
      .superRefine((query, ctx) => {
        for (const [key, value] of Object.entries(query)) {
          if (key !== 'agents' && typeof value === 'string' && value.length > 200) {
            ctx.addIssue({ code: 'custom', path: [key], message: `${key} is ${String(value.length)} characters, and at most 200 are passed on` })
          }
        }
      })
      .optional(),
    tag: z.string().min(1).max(200).optional(),
  }),
])
/**
 * WHAT IT ACCEPTS IS PUBLISHED AS `PluginAsksTheSlot`, AND WHAT THE SLOT SENDS BACK AS `TheSlotTellsAPlugin`, in
 * src/shared/plugin-read.ts. src/server/lib/plugin-read.ts fails to compile when this schema and that type differ.
 */
export type { PluginAsksTheSlot, TheSlotTellsAPlugin } from './plugin-read.ts'
