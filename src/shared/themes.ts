// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SIX THEMES, READ STRICTLY, AND THE ONE CSS RULE EACH BECOMES.
 *
 * Light, Dark and Auto are not here: they live in src/web/tokens.css. A theme here is a value for
 * every one of the 201 style names (theme-style-names.ts), and its id goes on the root element as
 * data-theme. Every theme in theme-values.ts passes through readThemes when this module loads.
 * If one of them is wrong, the module does not load, and the error names each fault.
 *
 * The reader refuses:
 * - a style name that is missing, or that is not on the list;
 * - a value longer than 200 characters;
 * - a character other than an ASCII letter, a digit, a space or one of # % . , ( ) ' " / + * -;
 * - a function other than var, max, min, calc, rgb, rgba, translate and rotate;
 * - a var() that names neither a style name nor a name tokens.css declares;
 * - an id that is used twice, or that is already Auto, Light or Dark;
 * - an id that is not lowercase letters and digits joined by hyphens;
 * - a color-scheme other than light or dark, because that is how the page knows the theme's look;
 * - a value with a slash and a star side by side, either way round, which would open or close a
 *   CSS comment and hide the rules after it;
 * - a value whose ' or " quotes do not pair, which would run a CSS string into the next rule.
 *
 * A PERSON'S OWN THEME IS READ BY THIS SAME READER (src/shared/own-themes.ts), with the same checks
 * in the same order. What is widened for it is only the id's type: a shipped theme's id is one of
 * the six literal ids in theme-values.ts, `ThemeId`, and an own theme's is `own-` and eight
 * lowercase letters and digits, `OwnThemeId`, which own-themes.ts makes and checks before it calls
 * this reader. `Theme` takes either; `THEMES` is typed with the six, so a place that names a shipped
 * theme cannot be handed an own one.
 */
import type { PageLanguage } from './i18n.ts'
import { STYLE_NAMES, TOKENS_CSS_NAMES, type StyleName } from './theme-style-names.ts'
import { THEMES_AS_WRITTEN } from './theme-values.ts'

export type ThemeId = (typeof THEMES_AS_WRITTEN)[number]['id']
/** The id of a theme a person made. own-themes.ts makes it and says why it has this shape. */
export type OwnThemeId = `own-${string}`
/** Any theme's id: one of the six, or a person's own. */
export type AnyThemeId = ThemeId | OwnThemeId
export type ThemeLook = 'light' | 'dark'

export interface Theme<Id extends AnyThemeId = AnyThemeId> {
  readonly id: Id
  readonly name: { readonly en: string; readonly zh: string }
  /** The theme's own look, read from its color-scheme. */
  readonly look: ThemeLook
  readonly values: Readonly<Record<StyleName, string>>
}

/** A theme as somebody wrote it, before the reader has looked at it. */
export interface WrittenTheme {
  readonly id: string
  readonly name: { readonly en: string; readonly zh: string }
  readonly values: Readonly<Record<string, string>>
}

const LONGEST_VALUE = 200
const ON_THE_LIST: ReadonlySet<string> = new Set(STYLE_NAMES)
const A_VAR_MAY_NAME: ReadonlySet<string> = new Set([...STYLE_NAMES, ...TOKENS_CSS_NAMES])
const FUNCTIONS: ReadonlySet<string> = new Set(['var', 'max', 'min', 'calc', 'rgb', 'rgba', 'translate', 'rotate'])
/** The three looks tokens.css draws. No theme may take one of their ids. */
export const LOOKS_IN_TOKENS_CSS = ['auto', 'light', 'dark'] as const
const BUILT_IN_LOOKS: ReadonlySet<string> = new Set(LOOKS_IN_TOKENS_CSS)
const NOT_ALLOWED = /[^A-Za-z0-9 #%.,()'"/+*-]/
const AN_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Every fault in one value, each as a sentence. */
function faultsInValue(id: string, name: string, value: string): string[] {
  const faults: string[] = []
  if (value.length > LONGEST_VALUE) {
    faults.push(`The theme "${id}" gives ${name} a value of ${value.length} characters; a value may have at most ${LONGEST_VALUE}.`)
  }
  const character = NOT_ALLOWED.exec(value)
  if (character) {
    faults.push(`The theme "${id}" gives ${name} a value with the character ${JSON.stringify(character[0])}, which a theme may not use.`)
  }
  for (const call of value.matchAll(/([A-Za-z0-9-]+)\(/g)) {
    const fn = call[1] ?? ''
    if (!FUNCTIONS.has(fn.toLowerCase())) {
      faults.push(`The theme "${id}" gives ${name} a value that calls ${fn}(), which is not one of var, max, min, calc, rgb, rgba, translate and rotate.`)
    }
  }
  for (const call of value.matchAll(/var\(\s*([^\s,)]*)/gi)) {
    const named = call[1] ?? ''
    if (!A_VAR_MAY_NAME.has(named)) {
      faults.push(`The theme "${id}" gives ${name} a value that reads var(${named}), which is neither a style name nor a name tokens.css declares.`)
    }
  }
  // A COMMENT MARK WOULD HIDE THE REST OF THE RULE. `/` and `*` are each allowed above, for calc()
  // and font stacks, but side by side they open or close a CSS comment.
  const comment = /\/\*|\*\//.exec(value)
  if (comment) {
    faults.push(`The theme "${id}" gives ${name} a value with ${comment[0]}, which a theme may not use: it opens or closes a CSS comment.`)
  }
  // AN UNPAIRED QUOTE WOULD RUN ON INTO THE NEXT LINE OF THE RULE, and take that line with it.
  for (const quote of [`'`, `"`]) {
    if (value.split(quote).length % 2 === 0) {
      faults.push(`The theme "${id}" gives ${name} a value with a ${quote} that is not closed; quotes in a value must come in pairs.`)
    }
  }
  return faults
}

/**
 * WHY THE READER REFUSED, one sentence for each fault in each theme. The message is the sentences
 * joined by line breaks, so a caller that only shows the message shows every one.
 */
export class ThemeRefused extends Error {
  readonly faults: readonly string[]
  constructor(faults: readonly string[]) {
    super(faults.join('\n'))
    this.faults = faults
  }
}

/**
 * Reads written themes strictly. It returns them only if every one passes; otherwise it throws one
 * `ThemeRefused` whose message has a sentence for each fault in each theme.
 *
 * `calledIn` is what a sentence calls a theme: its id for the six, and the name a person gave it for
 * an own theme, because a person knows their theme by the name they gave it.
 */
export function readThemes<Id extends AnyThemeId = ThemeId>(
  written: readonly WrittenTheme[],
  calledIn: (theme: WrittenTheme) => string = (theme) => theme.id,
): Theme<Id>[] {
  const faults: string[] = []
  const seen = new Set<string>()
  for (const theme of written) {
    const id = calledIn(theme)
    if (!AN_ID.test(theme.id)) faults.push(`The theme "${id}" has an id that is not lowercase letters and digits joined by hyphens.`)
    if (BUILT_IN_LOOKS.has(theme.id)) faults.push(`The theme "${id}" has the id of a look tokens.css already draws.`)
    if (seen.has(theme.id)) faults.push(`The theme "${id}" is listed twice; each theme needs its own id.`)
    seen.add(theme.id)
    for (const name of STYLE_NAMES) {
      if (!Object.hasOwn(theme.values, name)) faults.push(`The theme "${id}" has no value for ${name}.`)
    }
    for (const [name, value] of Object.entries(theme.values)) {
      if (!ON_THE_LIST.has(name)) {
        faults.push(`The theme "${id}" sets ${name}, which is not one of the style names a theme may set.`)
        continue
      }
      faults.push(...faultsInValue(id, name, value))
    }
    const scheme = theme.values['color-scheme']
    if (scheme !== undefined && scheme !== 'light' && scheme !== 'dark') {
      faults.push(`The theme "${id}" gives color-scheme the value "${scheme}"; it must be light or dark.`)
    }
  }
  if (faults.length > 0) throw new ThemeRefused(faults)
  // Every check above passed, so each id is a theme's own and each value is there and allowed. The
  // caller says which ids it read: the six for theme-values.ts, own ids for own-themes.ts.
  return written.map((theme) => ({
    id: theme.id as Id,
    name: { en: theme.name.en, zh: theme.name.zh },
    look: theme.values['color-scheme'] as ThemeLook,
    values: theme.values as Readonly<Record<StyleName, string>>,
  }))
}

export const THEMES: readonly Theme<ThemeId>[] = readThemes(THEMES_AS_WRITTEN)
export const THEME_IDS: readonly ThemeId[] = THEMES.map((theme) => theme.id)

export function isThemeId(value: string): value is ThemeId {
  return (THEME_IDS as readonly string[]).includes(value)
}

export function themeById(id: ThemeId): Theme<ThemeId> {
  const theme = THEMES.find((one) => one.id === id)
  if (!theme) throw new Error(`There is no theme with the id "${id}".`)
  return theme
}

/**
 * A theme's name in the page's language. A theme has English and Chinese names; any other language
 * shows the English. An own theme has one name, the person's own words, in both.
 */
export function themeName(theme: Theme, language: PageLanguage): string {
  return language === 'zh' ? theme.name.zh : theme.name.en
}

/** The CSS rule the page loads for one theme: every style name, in the list's order. */
export function themeRule(theme: Theme): string {
  const lines = STYLE_NAMES.map((name) => `  ${name}: ${theme.values[name]};`)
  return `:root[data-theme='${theme.id}'] {\n${lines.join('\n')}\n}`
}
