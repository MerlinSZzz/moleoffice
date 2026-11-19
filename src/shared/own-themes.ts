// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON'S LOOK AND THE THEMES THEY MADE: THE ONE READING.
 *
 * Migration 0347 keeps it on the person's own row, in `people.themes`, as JSON:
 *
 *   { "chosen": <the id of a look>, "own": [ { "id", "name", "from", "values" }, ... ] }
 *
 * or NULL because nobody has chosen or made one. The office reads every look through `readTheLook`
 * before it stores it, and the page reads it back through the same function, so a look is never
 * stored that this file would not read.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT AN OWN THEME IS
 * ---------------------------------------------------------------------------------------
 *
 * A copy of one of the six shipped themes, or of another own theme, with a value for every one of
 * the 201 style names. Its values are read by the same strict reader as the six (`readThemes` in
 * themes.ts), and then by the one readability check (`whyTheThemeIsHardToRead` in readability.ts).
 * A theme with a pair under its floor is not kept, and the refusal names each pair and its ratio.
 *
 * A SHIPPED THEME IS NEVER CHANGED, only copied. An own theme may not carry a shipped theme's id, so
 * a write that tries to change one in place is refused with a sentence that says to copy it.
 *
 * ---------------------------------------------------------------------------------------
 * THE ID, AND WHY IT HAS THIS SHAPE
 * ---------------------------------------------------------------------------------------
 *
 * `own-` and eight lowercase letters and digits, made at random by `anOwnThemeId` when the copy is
 * made, and never changed by a rename. The prefix keeps it apart from the six shipped ids, which
 * have none, and from auto, light and dark; the eight random characters keep it apart from the
 * person's other own themes, and the reader refuses an id one of them already has. A name is not
 * used as the id, because a rename would then change the id the chosen look points at.
 *
 * ---------------------------------------------------------------------------------------
 * THE NAME, IN BOTH LANGUAGES
 * ---------------------------------------------------------------------------------------
 *
 * One string, the person's own words, kept as they wrote it and shown in every language: Mole
 * Office does not translate a name a person gave. It has at most `LONGEST_OWN_THEME_NAME`
 * characters, no line breaks or control characters, and no space at either end. It is shown as
 * text and is never written into CSS: `themeRule` writes only the id and the values.
 *
 * ---------------------------------------------------------------------------------------
 * THE CHOSEN LOOK
 * ---------------------------------------------------------------------------------------
 *
 * Auto, Light, Dark, one of the six, or one of this person's own themes. Deleting the chosen theme
 * changes the choice in the same write, to the shipped theme the deleted one was copied from:
 * `lookWithout` does that, and the reader refuses a look whose choice names a theme it does not hold.
 */
import { checkReadability, whyTheThemeIsHardToRead } from './readability.ts'
import { STYLE_NAMES, type StyleName } from './theme-style-names.ts'
import {
  LOOKS_IN_TOKENS_CSS,
  ThemeRefused,
  isThemeId,
  readThemes,
  themeById,
  type AnyThemeId,
  type OwnThemeId,
  type Theme,
  type ThemeId,
  type ThemeLook,
} from './themes.ts'

/** The most own themes one person keeps. The one place this number is declared. */
export const MOST_OWN_THEMES = 12
/** The longest name an own theme may have, in characters. The one place this number is declared. */
export const LONGEST_OWN_THEME_NAME = 40

/** One theme a person made, as it is stored. */
export interface OwnTheme {
  readonly id: OwnThemeId
  readonly name: string
  /** The shipped theme this was first copied from. Deleting it while chosen goes back to this one. */
  readonly from: ThemeId
  readonly values: Readonly<Record<StyleName, string>>
}

/** A person's look as it is stored and as the office gives it back to them. */
export interface TheLook {
  readonly chosen: string
  readonly own: readonly OwnTheme[]
}

export type LookReading = { readonly ok: true; readonly look: TheLook } | { readonly ok: false; readonly why: readonly string[] }

/**
 * A LOOK THE ROW HOLDS THAT THIS BUILD'S READER DOES NOT TAKE, with the reader's sentences. It is a
 * third answer beside a look and null, and never null itself: null means nobody set one, and a page
 * that took it for null would write the browser's choice over the themes the person made.
 */
export interface AnUnreadableLook {
  readonly unreadable: readonly string[]
}

/** What the office gives a person back for their look: the look, unreadable with the reasons, or null because nobody set one. */
export type TheStoredLook = TheLook | AnUnreadableLook | null

export function isAnUnreadableLook(held: TheStoredLook | undefined): held is AnUnreadableLook {
  return typeof held === 'object' && held !== null && 'unreadable' in held
}

const OWN_PREFIX = 'own-'
const AN_OWN_ID = /^own-[a-z0-9]{8}$/
const ID_CHARACTERS = 'abcdefghijklmnopqrstuvwxyz0123456789'
// eslint-disable-next-line no-control-regex
const A_CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/
const KEYS_OF_THE_LOOK = ['chosen', 'own'] as const
const KEYS_OF_A_THEME = ['id', 'name', 'from', 'values'] as const

/** Whether a string has the shape of an own theme's id. Whether this person has that theme is `readTheLook`'s question. */
export function isOwnThemeId(id: string): id is OwnThemeId {
  return AN_OWN_ID.test(id)
}

/** A new own theme's id, made at random, that none of `taken` already has. */
export function anOwnThemeId(taken: readonly string[]): OwnThemeId {
  for (;;) {
    const random = crypto.getRandomValues(new Uint8Array(8))
    const id = `${OWN_PREFIX}${[...random].map((byte) => ID_CHARACTERS[byte % ID_CHARACTERS.length]).join('')}` as OwnThemeId
    if (!taken.includes(id)) return id
  }
}

/** An own theme as a theme the page can draw with `themeRule` and the check can measure. */
export function asATheme(own: OwnTheme): Theme<OwnThemeId> {
  return { id: own.id, name: { en: own.name, zh: own.name }, look: own.values['color-scheme'] as ThemeLook, values: own.values }
}

/** Why a name may not be an own theme's name, or null because it may. */
export function whyTheNameIsRefused(name: string): string | null {
  if (name.trim() === '') return 'A theme needs a name.'
  if (name !== name.trim()) return `The name "${name}" begins or ends with a space; write it without.`
  if ([...name].length > LONGEST_OWN_THEME_NAME) {
    return `The name "${name}" has ${[...name].length} characters; a theme's name may have at most ${LONGEST_OWN_THEME_NAME}.`
  }
  if (A_CONTROL_CHARACTER.test(name)) return 'A theme\'s name may not hold a line break or a control character.'
  return null
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * READ A LOOK STRICTLY. It returns the look only if every part passes; otherwise every sentence
 * that says what is wrong, so a refusal names each fault at once. Nothing here guesses: a part it
 * cannot read is refused, never dropped.
 */
export function readTheLook(written: unknown): LookReading {
  const why: string[] = []
  if (!isObject(written)) return { ok: false, why: ['A look is an object with chosen and own.'] }
  for (const key of Object.keys(written)) {
    if (!(KEYS_OF_THE_LOOK as readonly string[]).includes(key)) why.push(`A look has chosen and own, and nothing else; it does not have ${key}.`)
  }
  const chosen = written['chosen']
  const own = written['own']
  if (typeof chosen !== 'string') why.push('A look\'s chosen must be the id of a look, as a string.')
  if (!Array.isArray(own)) return { ok: false, why: [...why, 'A look\'s own must be a list of themes.'] }
  if (own.length > MOST_OWN_THEMES) {
    why.push(`A person may keep at most ${MOST_OWN_THEMES} own themes, and this look has ${own.length}.`)
  }

  // EACH THEME'S SHAPE, NAME, ID AND ORIGIN, before its values are read.
  const readable: OwnTheme[] = []
  const ids = new Map<string, string>()
  own.forEach((theme: unknown, index) => {
    const at = `The theme at place ${index + 1}`
    if (!isObject(theme)) {
      why.push(`${at} is not an object with id, name, from and values.`)
      return
    }
    const faults: string[] = []
    for (const key of Object.keys(theme)) {
      if (!(KEYS_OF_A_THEME as readonly string[]).includes(key)) faults.push(`${at} has ${key}, which a theme does not have; it has id, name, from and values.`)
    }
    const { id, name, from, values } = theme
    const called = typeof name === 'string' ? `The theme "${name}"` : at
    if (typeof name !== 'string') faults.push(`${at} has no name.`)
    else {
      const refused = whyTheNameIsRefused(name)
      if (refused !== null) faults.push(refused)
    }
    if (typeof id !== 'string') faults.push(`${called} has no id.`)
    else if (isThemeId(id)) {
      faults.push(`${called} has the id ${id}, which is ${themeById(id).name.en}, one of the six shipped themes. A shipped theme cannot be changed, only copied: copy it to make your own.`)
    } else if ((LOOKS_IN_TOKENS_CSS as readonly string[]).includes(id)) {
      faults.push(`${called} has the id ${id}, which is the look ${id[0]!.toUpperCase()}${id.slice(1)}. A theme's id may not be one of Auto, Light and Dark.`)
    } else if (!AN_OWN_ID.test(id)) {
      faults.push(`${called} has the id "${id}", which is not ${OWN_PREFIX} followed by eight lowercase letters and digits.`)
    } else if (ids.has(id)) {
      faults.push(`${called} has the id ${id}, which ${ids.get(id)!} already has. Each theme needs its own id.`)
    }
    if (typeof from !== 'string' || !isThemeId(from)) {
      faults.push(`${called} says it was copied from "${String(from)}", which is not one of the six shipped themes.`)
    }
    if (!isObject(values) || !Object.values(values).every((value) => typeof value === 'string')) {
      faults.push(`${called} needs its values as an object of style names and strings.`)
    }
    if (typeof id === 'string' && !ids.has(id)) ids.set(id, called.replace('The theme', 'the theme'))
    why.push(...faults)
    if (faults.length === 0) {
      readable.push({ id: id as OwnThemeId, name: name as string, from: from as ThemeId, values: values as Record<StyleName, string> })
    }
  })

  // THE VALUES, BY THE SAME READER AS THE SIX, and then the one check.
  for (const theme of readable) {
    try {
      readThemes<OwnThemeId>([{ id: theme.id, name: { en: theme.name, zh: theme.name }, values: theme.values }], () => theme.name)
    } catch (error) {
      if (!(error instanceof ThemeRefused)) throw error
      why.push(...error.faults)
      continue
    }
    why.push(...whyTheThemeIsHardToRead(asATheme(theme), theme.name).sentences)
  }

  if (typeof chosen === 'string' && !isALookThisPersonHas(chosen, [...ids.keys()])) {
    why.push(`The chosen look "${chosen}" is none of Auto, Light, Dark, the six shipped themes and this person's own themes.`)
  }
  if (why.length > 0) return { ok: false, why }
  return {
    ok: true,
    // Written again key by key, in the stored order, so what is kept is only what was read.
    look: {
      chosen: chosen as string,
      own: readable.map((theme) => ({
        id: theme.id, name: theme.name, from: theme.from,
        values: Object.fromEntries(STYLE_NAMES.map((name) => [name, theme.values[name]])) as Record<StyleName, string>,
      })),
    },
  }
}

/** Whether a chosen look is one of the three, one of the six, or one of these own ids. */
export function isALookThisPersonHas(chosen: string, ownIds: readonly string[]): boolean {
  return (LOOKS_IN_TOKENS_CSS as readonly string[]).includes(chosen) || isThemeId(chosen) || ownIds.includes(chosen)
}

/**
 * A COPY OF A THEME, as a new own theme with a new id. Copying an own theme keeps the shipped theme
 * it was first copied from, so `from` always names one of the six.
 */
export function aCopyOf(source: Theme | OwnTheme, look: TheLook, name: string): OwnTheme {
  const from = isThemeId(source.id) ? source.id : look.own.find((one) => one.id === source.id)?.from
  if (from === undefined) throw new Error(`There is no theme with the id "${source.id}" to copy.`)
  return { id: anOwnThemeId(look.own.map((one) => one.id)), name, from, values: { ...source.values } }
}

/**
 * THE LOOK WITH ONE OWN THEME DELETED. When it was the chosen one, the choice becomes the shipped
 * theme it was copied from, in the same write, and `chosenBecame` says which so the page can tell
 * the person; otherwise the choice stays and `chosenBecame` is null.
 */
export function lookWithout(look: TheLook, id: OwnThemeId): { look: TheLook; chosenBecame: ThemeId | null } {
  const deleted = look.own.find((one) => one.id === id)
  if (deleted === undefined) throw new Error(`There is no own theme with the id "${id}" to delete.`)
  const own = look.own.filter((one) => one.id !== id)
  if (look.chosen !== id) return { look: { chosen: look.chosen, own }, chosenBecame: null }
  return { look: { chosen: deleted.from, own }, chosenBecame: deleted.from }
}

/** Every measurement of an own theme, for the page's list of pairs. The same function the check asks. */
export function measureOwnTheme(own: OwnTheme): ReturnType<typeof checkReadability> {
  return checkReadability(asATheme(own))
}

/** Any theme by id among the six and these own themes, or null because neither holds it. */
export function anyThemeById(id: string, own: readonly OwnTheme[]): Theme | null {
  if (isThemeId(id)) return themeById(id)
  const found = own.find((one) => one.id === id)
  return found === undefined ? null : asATheme(found)
}

export type { AnyThemeId }
