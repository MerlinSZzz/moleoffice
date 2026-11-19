// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The preset switcher: five controls that rewrite the token layer at runtime.
 *
 * Everything this component does is set data-attributes on <html>: one for each of five axes,
 * and data-theme-from beside a theme that is one of the six in the data. It never
 * touches a component, never passes a prop down, and never knows what a Panel or a Row is.
 * That is the whole point of the token contract in tokens.css — a theme, a density, a corner
 * radius, a font role and a text size are value swaps, so the app has one component tree
 * instead of one per design direction.
 *
 * WHY THE RESTORE RUNS AT MODULE SCOPE
 * A React effect runs after the first paint, so restoring the stored theme from inside the
 * component would show every dark-theme user a white page for one frame on every load. The
 * restore is therefore a side effect of importing this module, which happens while the module
 * graph is still being evaluated — before React renders anything. This is the one place in the
 * app where import-time work is the correct answer rather than a smell.
 *
 * Until a choice has been made, no data-theme attribute exists at all, and tokens.css follows
 * the operating system through prefers-color-scheme. "Auto" in the theme menu is that state,
 * not a fourteenth palette.
 *
 * Light and Dark are rules in tokens.css. The six other themes are data in src/shared/themes.ts,
 * and this module puts their rules into the page before it first sets the attribute.
 *
 * WHERE THE THEME IS KEPT: IN THE OFFICE, ON THE PERSON'S ROW (migration 0347). src/web/lib/the-look.ts
 * reads it, and `followTheOffice` below draws it, with the person's own themes put into the page by
 * `themeRule` as the six are. The office is written only when the person chooses a theme in the page.
 * A page load never writes it. When the office holds a look, the page draws it, whatever this browser
 * has stored, and stores it too, for the next first frame. When the office holds none, the page draws
 * the browser's stored theme, as it did before the office kept one. The other four axes are still kept
 * in the browser.
 */

import { useSyncExternalStore } from 'react'
import { content, t, wordLanguage, type WordKey } from '@shared/i18n.ts'
import { settingsControlWord } from '@shared/settings-declaration.ts'
import { PRESET_WORDS } from '@shared/preset-choice-words.ts'
import { isThemeId, themeById, themeName, themeRule, THEME_IDS, THEMES, type AnyThemeId, type OwnThemeId, type ThemeId } from '@shared/themes.ts'
import { asATheme, isOwnThemeId, type OwnTheme } from '@shared/own-themes.ts'
import { DRAWS_THE_NAME } from './agent/pointing.ts'
import { declaredAttributes, type Declares } from './declares.ts'
import { useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'
import { clearStored, readStored, writeStored } from '../lib/store.ts'
import { keepTheLook, theLookInTheOffice, whenTheLookInTheOfficeChanges } from '../lib/the-look.ts'

// ---------------------------------------------------------------------------- the five axes

/** Auto follows the browser; the two named looks are F (light) and H (dark). The six after them are the themes in src/shared/themes.ts. */
export const THEME_CHOICES = ['auto', 'light', 'dark', ...THEME_IDS] as const
export type ThemeChoice = (typeof THEME_CHOICES)[number]
/** Auto, Light and Dark: the choices tokens.css draws and the words name. */
type BuiltInTheme = Exclude<ThemeChoice, ThemeId>
/** What a person may have chosen: one of THEME_CHOICES, or one of their own themes, which the office keeps. */
export type ThemeChosen = ThemeChoice | OwnThemeId

export const DENSITY_CHOICES = ['compact', 'default', 'comfortable'] as const
export type Density = (typeof DENSITY_CHOICES)[number]

export const RADIUS_CHOICES = ['sharp', 'default', 'soft'] as const
export type RadiusPreset = (typeof RADIUS_CHOICES)[number]

export const FONT_CHOICES = ['ui', 'mono', 'read'] as const
export type FontRole = (typeof FONT_CHOICES)[number]

/**
 * How big the text is. `default` is the ABSENCE of the data-size attribute, so the app follows
 * whatever base size the browser is set to; `small` and `large` scale the root by a percentage
 * and every rem size in tokens.css follows. See the TEXT SIZE block in tokens.css.
 */
export const SIZE_CHOICES = ['small', 'default', 'large'] as const
export type SizeChoice = (typeof SIZE_CHOICES)[number]

export interface Presets {
  theme: ThemeChosen
  density: Density
  radius: RadiusPreset
  font: FontRole
  size: SizeChoice
}

export const DEFAULT_PRESETS: Presets = {
  theme: 'auto',
  density: 'default',
  radius: 'default',
  font: 'ui',
  size: 'default',
}

/** Human labels. Kept next to the values so a new preset cannot be added without naming it. */
export const THEME_LABELS = PRESET_WORDS.theme satisfies Record<BuiltInTheme, WordKey>

/** A theme choice's name in the page's language: a word for Auto, Light and Dark, and the theme's own name for the six. */
export function themeChoiceName(choice: ThemeChoice): string {
  return isThemeId(choice) ? themeName(themeById(choice), wordLanguage()) : t(THEME_LABELS[choice])
}

// A decision removed these looks. Keep the saved word until a new choice is saved.
export const RETIRED_THEMES = [
  { value: 'coffee', label: 'settingsPanel.look.retiredCoffee', replacement: 'dark' },
  { value: 'futuristic', label: 'settingsPanel.look.retiredFuturistic', replacement: 'dark' },
  { value: 'mono', label: 'settingsPanel.look.retiredMono', replacement: 'light' },
  { value: 'muted', label: 'settingsPanel.look.retiredMuted', replacement: 'light' },
] as const satisfies readonly { value: string; label: WordKey; replacement: BuiltInTheme }[]

// 'hc' WAS HIGH CONTRAST'S SAVED WORD, and High contrast is one of the six themes now, so a saved 'hc'
// opens it rather than being told the look is gone.
const RENAMED_THEMES = [{ value: 'hc', now: 'high-contrast' }] as const satisfies readonly { value: string; now: ThemeChoice }[]

const DENSITY_LABELS = PRESET_WORDS.density satisfies Record<Density, WordKey>

const RADIUS_LABELS = PRESET_WORDS.radius satisfies Record<RadiusPreset, WordKey>

const FONT_LABELS = PRESET_WORDS.font satisfies Record<FontRole, WordKey>

/**
 * WHAT SMALL ACTUALLY BUYS, SO THE CONTROL DOES NOT OVERPROMISE. The three reading sizes hold a
 * floor of 13/14/15px, so Small does not shrink a sentence — it shrinks the headings above one
 * and fits more page on a screen. Large is the one that answers "these labels are too small":
 * it takes them from 13px to 14.6px.
 */
const SIZE_LABELS = PRESET_WORDS.size satisfies Record<SizeChoice, WordKey>

/** Every axis's option words, so a fault can name the position it went back to. The six themes' names are data, not words. */
const AXIS_LABELS: { readonly [K in keyof Presets]: Readonly<Record<Exclude<Presets[K], AnyThemeId>, WordKey>> } = {
  theme: THEME_LABELS,
  density: DENSITY_LABELS,
  radius: RADIUS_LABELS,
  font: FONT_LABELS,
  size: SIZE_LABELS,
}

/** The axis names are the surface names the server also reads; en.ts reads them from SURFACES. */
const AXIS_NAMES = {
  theme: 'settingsPanel.look.theme',
  density: 'settingsPanel.look.density',
  radius: 'settingsPanel.look.corners',
  font: 'settingsPanel.look.type',
  size: 'settingsPanel.look.size',
} as const satisfies Record<keyof Presets, WordKey>

// ------------------------------------------------------------------------------- persistence

export const STORAGE_PREFIX = 'mole-office.preset.'

/**
 * What went wrong while reading or writing a preset. Rendered in the bar, never swallowed.
 * It holds what happened, not a sentence, so the bar can say it in the page's language.
 */
export type PresetFault =
  | { axis: 'storage'; kind: 'read' | 'write'; reason: string }
  | { axis: 'theme'; kind: 'retired'; retired: WordKey; replacement: BuiltInTheme }
  | { axis: keyof Presets; kind: 'unknown'; value: string; fallback: string }
  /** The office did not keep a choice: the door's own sentence. The choice is still drawn on this page. */
  | { axis: 'theme'; kind: 'office'; reason: string }
  /** The look kept in the office could not be read: the reader's sentences. Auto is drawn and nothing is written over it. */
  | { axis: 'theme'; kind: 'unreadable'; why: readonly string[] }
  /** This browser last drew one of the person's own themes, and the office does not give it to this page. Auto is drawn. */
  | { axis: 'theme'; kind: 'ownNotHere' }

/** A notice in the page language. Developer mode adds the browser's own reason. */
export function presetFaultSentence(f: PresetFault, developer: boolean): string {
  if (f.kind === 'retired') return t('settingsPanel.look.retiredNow', { label: t(f.retired), replacement: t(THEME_LABELS[f.replacement]) })
  // The office's sentences are its own words, so they are content and are not translated.
  if (f.kind === 'office') return t('settingsPanel.look.officeDidNotKeep', { reason: content(f.reason) })
  if (f.kind === 'unreadable') return t('settingsPanel.look.unreadable', { why: content(f.why.join(' ')) })
  if (f.kind === 'ownNotHere') return t('settingsPanel.look.ownNotHere')
  if (f.kind === 'unknown') {
    if (developer) return t('settingsPanel.look.ignoredSaved', { axis: f.axis, value: f.value, fallback: f.fallback })
    const options: Readonly<Record<string, WordKey>> = AXIS_LABELS[f.axis]
    const word = Object.hasOwn(options, f.fallback) ? options[f.fallback] : undefined
    // The fallback is always the axis's default, which is never one of the six themes, so it always has a word.
    if (word === undefined) throw new Error(`PresetBar: no word for the ${f.axis} choice "${f.fallback}"`)
    const fallback = t(word)
    return t('settingsPanel.look.ignoredSavedPlain', { axis: t(AXIS_NAMES[f.axis]), fallback })
  }
  // The browser's own reason can name its storage, which is machinery, so only Developer shows it.
  if (f.kind === 'read') {
    return developer ? t('settingsPanel.look.cannotRemember', { reason: f.reason }) : t('settingsPanel.look.cannotRememberPlain')
  }
  return developer ? t('settingsPanel.look.cannotKeep', { reason: f.reason }) : t('settingsPanel.look.cannotKeepPlain')
}

function faultKey(f: PresetFault): string {
  return JSON.stringify(f)
}

/**
 * ONE PLACE TOUCHES THE BROWSER'S STORE, AND IT IS NOT THIS FILE.
 *
 * These three used to be hand-written copies of `readStored`, `writeStored` and `clearStored` in
 * src/web/lib/store.ts — the same three try/catch blocks, with the same reasoning written out again
 * above them. That is the defect CLAUDE.md names at the top: one fact worked out in two places. They
 * are now the shared ones with this bar's key prefix put on, so a change to how storage is reached
 * reaches every caller. Why storage throws at all, and what the honest answer to it is, is written
 * once, in that file.
 */
function readStorage(key: string): { ok: true; value: string | null } | { ok: false; reason: string } {
  return readStored(STORAGE_PREFIX + key)
}

function writeStorage(key: string, value: string): { ok: true } | { ok: false; reason: string } {
  return writeStored(STORAGE_PREFIX + key, value)
}

function clearStorage(key: string): void {
  clearStored(STORAGE_PREFIX + key)
}

/**
 * Read one axis, and refuse to guess.
 *
 * A stored value this build does not recognise means either a downgrade or a hand-edited
 * localStorage. Quietly substituting the default would leave the user looking at a theme they
 * did not pick with no idea why, so the bad key is dropped and the swap is announced.
 */
function readAxis<T extends string>(
  axis: keyof Presets,
  allowed: readonly T[],
  fallback: T,
  faults: PresetFault[],
): T {
  const read = readStorage(axis)
  if (!read.ok) {
    faults.push({ axis: 'storage', kind: 'read', reason: read.reason })
    return fallback
  }
  if (read.value === null) return fallback

  if (axis === 'theme') {
    const retired = RETIRED_THEMES.find((theme) => theme.value === read.value)
    const replacement = allowed.find((theme) => theme === retired?.replacement)
    if (retired !== undefined && replacement !== undefined) {
      faults.push({ axis: 'theme', kind: 'retired', retired: retired.label, replacement: retired.replacement })
      return replacement
    }
    const renamed = RENAMED_THEMES.find((theme) => theme.value === read.value)
    const now = allowed.find((theme) => theme === renamed?.now)
    if (now !== undefined) return now
  }

  const found = allowed.find((candidate) => candidate === read.value)
  if (found === undefined) {
    faults.push({ axis, kind: 'unknown', value: read.value, fallback })
    clearStorage(axis)
    return fallback
  }
  return found
}

// ------------------------------------------------------------------------ applying to <html>

/**
 * Write the presets onto the document element. This is the only function in the app allowed
 * to touch these attributes.
 */
export function applyPresets(presets: Presets, root: HTMLElement): void {
  // 'auto' is the ABSENCE of the attribute, which is what lets the prefers-color-scheme block
  // in tokens.css win. Setting data-theme="auto" would match no theme block at all and leave
  // the app on the light palette forever, which is the failure this line exists to avoid.
  if (presets.theme === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', presets.theme)
  // data-theme-from="data" says the theme is one of the six or a person's own copy of one, so the
  // rules that draw only for those themes apply. Under Auto, Light and Dark it is absent, and the
  // page is drawn as it always was.
  if (isThemeId(presets.theme) || isOwnThemeId(presets.theme)) root.setAttribute('data-theme-from', 'data')
  else root.removeAttribute('data-theme-from')

  root.setAttribute('data-density', presets.density)
  root.setAttribute('data-radius', presets.radius)
  root.setAttribute('data-font', presets.font)

  // Same shape as theme's 'auto': 'default' is the absence of the attribute, so the root keeps
  // whatever base size the browser is set to and a reader who raised that keeps their choice.
  if (presets.size === 'default') root.removeAttribute('data-size')
  else root.setAttribute('data-size', presets.size)
}

/**
 * THE LOOK SHOWING NOW, light or dark, worked out here and nowhere else. `applyPresets` writes the attribute this reads,
 * and with no attribute the page follows the operating system. One of the six themes has its own look, whatever the
 * system's. The shortcut that switches the look and the plugin slot, which tells a plugin's page the look, both ask this.
 */
export function theLookShowing(): 'light' | 'dark' {
  const held = document.documentElement.getAttribute('data-theme')
  if (held === 'light' || held === 'dark') return held
  if (held !== null && isThemeId(held)) return themeById(held).look
  const own = held === null ? undefined : OWN.find((theme) => theme.id === held)
  if (own !== undefined) return asATheme(own).look
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Call `listener` whenever the look showing may have changed: a choice in any control, or the operating
 * system's own switch. Returns what stops it. A component that only has to draw again when the look
 * changes, and cannot hold the look in state because it is also drawn on a server, listens with this.
 */
export function whenTheLookMayChange(listener: () => void): () => void {
  const system = window.matchMedia('(prefers-color-scheme: dark)')
  system.addEventListener('change', listener)
  const stop = subscribePresets(listener)
  return () => {
    system.removeEventListener('change', listener)
    stop()
  }
}

/** The look showing, kept up to date with a choice in any control and with the operating system's own switch. */
export function useTheLookShowing(): 'light' | 'dark' {
  return useSyncExternalStore(whenTheLookMayChange, theLookShowing)
}

/** Read the stored presets and apply them. Returns what was applied and anything that failed. */
export function restorePresets(root: HTMLElement): { presets: Presets; faults: PresetFault[] } {
  const faults: PresetFault[] = []
  const presets: Presets = {
    theme: readTheStoredTheme(faults),
    density: readAxis('density', DENSITY_CHOICES, DEFAULT_PRESETS.density, faults),
    radius: readAxis('radius', RADIUS_CHOICES, DEFAULT_PRESETS.radius, faults),
    font: readAxis('font', FONT_CHOICES, DEFAULT_PRESETS.font, faults),
    size: readAxis('size', SIZE_CHOICES, DEFAULT_PRESETS.size, faults),
  }
  applyPresets(presets, root)

  // One storage-is-unavailable message, not four identical ones.
  const seen = new Set<string>()
  const deduped = faults.filter((f) => (seen.has(faultKey(f)) ? false : (seen.add(faultKey(f)), true)))
  return { presets, faults: deduped }
}

/**
 * THE STORED THEME, which may be one of the person's own: this browser stores the id the office last
 * gave it. Its rule comes with the office's answer, and `followTheOffice` draws it then.
 */
function readTheStoredTheme(faults: PresetFault[]): ThemeChosen {
  const read = readStorage('theme')
  if (read.ok && read.value !== null && isOwnThemeId(read.value)) return read.value
  return readAxis('theme', THEME_CHOICES, DEFAULT_PRESETS.theme, faults)
}

/**
 * THE SIX THEMES' RULES, AND THE PERSON'S OWN, IN ONE STYLE ELEMENT BEFORE EVERY STYLESHEET IN THE HEAD.
 *
 * A theme's rule, `:root[data-theme='<id>']`, weighs the same as the rule tokens.css gives a page
 * that asks for more contrast, and less than its rules for a page in Chinese. Coming first, the
 * themes lose to both, so those rules still apply under a theme. The element has its own
 * data-precedence, so React puts the style elements it adds after it and not before.
 */
export const THEMES_STYLE_ID = 'mole-office-themes'

/** The page's stylesheets in the head, the first of which the themes' style element goes before. */
export const A_STYLESHEET = 'link[rel~="stylesheet"], style'

/**
 * THE ELEMENT IS MADE BY THE PAGE'S OWN DOCUMENT, so the whole document is the argument rather than
 * the head alone. A real page's head and document are the same page, but a Node test that imports a
 * page hands it a head-shaped stand-in and does not give that stand-in an ownerDocument, so asking
 * the head for its document throws there. Nothing is skipped: the one guard is `typeof document`
 * below, for Node, where there is genuinely no page. A page with no head throws here rather than
 * drawing without the six themes.
 */
function putTheThemesInThePage(page: Document): void {
  const head: HTMLHeadElement | null = page.head
  if (head === null) throw new Error('This page has no head to hold the six themes, and they are not optional.')
  const style = page.createElement('style')
  style.id = THEMES_STYLE_ID
  style.setAttribute('data-precedence', THEMES_STYLE_ID)
  // An own theme is drawn by the same rule as the six. Its id and values passed the theme reader
  // before the office kept them, and its name is never written into the rule.
  style.textContent = [...THEMES, ...OWN.map(asATheme)].map(themeRule).join('\n')
  // A module run a second time, as the dev server does after an edit, replaces the element rather than adding one.
  head.querySelector(`style#${THEMES_STYLE_ID}`)?.remove()
  head.insertBefore(style, head.querySelector(A_STYLESHEET))
}

/**
 * THE IMPORT-TIME RESTORE. See the note at the top of the file.
 *
 * Guarded on `document` so the module can also be imported by a Node test, where there is no
 * document to restore onto. That is not a fallback hiding a failure: outside a browser there
 * are genuinely no presets to apply, and the component is never rendered. Inside a browser the
 * document is the page, and the themes go into it whole, or the call above throws.
 */
/** The person's own themes, as the office last gave them. Empty until it has. */
let OWN: readonly OwnTheme[] = []
if (typeof document !== 'undefined') putTheThemesInThePage(document)
let BOOT: { presets: Presets; faults: PresetFault[] } =
  typeof document === 'undefined'
    ? { presets: DEFAULT_PRESETS, faults: [] }
    : restorePresets(document.documentElement)

// ------------------------------------------------------------------ the one store of the choices

/**
 * THE CHOICES AND THEIR NOTICES ARE HELD HERE ONCE, and every control that shows one reads them from
 * here. The bar on the Settings page and the light or dark switch at the sidebar's foot are two
 * controls over the same stored theme, and the switch follows a decision. A
 * choice made in one shows in the other at once, and both write it through `choosePreset`, so there
 * is no second store (invariant 9).
 */
const presetListeners = new Set<() => void>()

function subscribePresets(listener: () => void): () => void {
  presetListeners.add(listener)
  return () => {
    presetListeners.delete(listener)
  }
}

function presetsNow(): { presets: Presets; faults: PresetFault[] } {
  return BOOT
}

/** The applied choices and their notices, kept up to date with every change from any control. */
export function usePresets(): { presets: Presets; faults: PresetFault[] } {
  return useSyncExternalStore(subscribePresets, presetsNow, presetsNow)
}

/**
 * Apply first, then persist. The visible result of a press must not depend on whether the browser
 * let us save it: if storage is refusing writes, the look still changes and the notice says the
 * change will not survive a reload.
 */
export function choosePreset<K extends keyof Presets>(axis: K, value: Presets[K]): void {
  const next: Presets = { ...BOOT.presets, [axis]: value }
  applyPresets(next, document.documentElement)

  const written = writeStorage(axis, value)
  // A look the office could not read keeps its notice until the person keeps a new look in its place.
  const nextFaults = BOOT.faults.filter((f) => f.axis !== 'storage' && f.kind !== 'office' && (f.kind === 'unreadable' || !written.ok || f.axis !== axis))
  if (!written.ok) {
    nextFaults.push({ axis: 'storage', kind: 'write', reason: written.reason })
  }
  BOOT = { presets: next, faults: nextFaults }
  for (const listener of presetListeners) listener()
  if (axis === 'theme') void keepTheChoiceInTheOffice(next.theme)
}

/**
 * A THEME CHOSEN HERE IS KEPT IN THE OFFICE, with the person's own themes as the office last gave
 * them. Nothing is written while the office's look cannot be read: writing would put this choice over
 * the person's own themes, and keeping a new look in its place is the person's choice, made in the
 * Looks tab. Nothing is written either where no office keeps the look; the browser keeps it there.
 */
async function keepTheChoiceInTheOffice(chosen: ThemeChosen): Promise<void> {
  const office = theLookInTheOffice()
  if (office.status !== 'none' && office.status !== 'set') return
  const kept = await keepTheLook({ chosen, own: OWN })
  if (kept.ok) return
  BOOT = { presets: BOOT.presets, faults: [...BOOT.faults.filter((f) => f.kind !== 'office'), { axis: 'theme', kind: 'office', reason: kept.why }] }
  for (const listener of presetListeners) listener()
}

/**
 * DRAW WHAT THE OFFICE KEEPS, each time its answer changes. Nothing here writes to the office.
 *
 *   set          its own themes go into the page and its choice is drawn, and this browser stores the
 *                choice for the next first frame. The office wins over what this browser had stored.
 *   none         the browser's stored choice is drawn, as it was before the office kept a look.
 *   unreadable   Auto is drawn, nothing is written to the office, and the reader's sentences are shown.
 *   elsewhere    the browser keeps the look, as it did before the office could.
 *   loading      nothing changes yet.
 *
 * Under none and elsewhere the page has no own themes, so a stored own theme cannot be drawn. Auto is
 * drawn and the notice says so. The stored id is left as it is, and nothing is written.
 */
function followTheOffice(): void {
  const office = theLookInTheOffice()
  if (office.status === 'set') {
    OWN = office.look.own
    putTheThemesInThePage(document)
    // The office keeps only a choice its reader took: one of THEME_CHOICES or one of these own themes.
    const chosen = office.look.chosen as ThemeChosen
    const next: Presets = { ...BOOT.presets, theme: chosen }
    applyPresets(next, document.documentElement)
    const written = writeStorage('theme', chosen)
    const faults = BOOT.faults.filter((f) => f.axis !== 'theme')
    if (!written.ok && !faults.some((f) => f.axis === 'storage')) faults.push({ axis: 'storage', kind: 'write', reason: written.reason })
    BOOT = { presets: next, faults }
  } else if (office.status === 'none' || office.status === 'elsewhere') {
    OWN = []
    putTheThemesInThePage(document)
    const faults = BOOT.faults.filter((f) => f.kind !== 'unreadable' && f.kind !== 'ownNotHere')
    if (isOwnThemeId(BOOT.presets.theme)) {
      const next: Presets = { ...BOOT.presets, theme: DEFAULT_PRESETS.theme }
      applyPresets(next, document.documentElement)
      BOOT = { presets: next, faults: [...faults, { axis: 'theme', kind: 'ownNotHere' }] }
    } else {
      BOOT = { presets: BOOT.presets, faults }
    }
  } else if (office.status === 'unreadable') {
    OWN = []
    putTheThemesInThePage(document)
    const next: Presets = { ...BOOT.presets, theme: DEFAULT_PRESETS.theme }
    applyPresets(next, document.documentElement)
    BOOT = { presets: next, faults: [...BOOT.faults.filter((f) => f.axis !== 'theme'), { axis: 'theme', kind: 'unreadable', why: office.why }] }
  } else {
    return
  }
  for (const listener of presetListeners) listener()
}

if (typeof document !== 'undefined') {
  whenTheLookInTheOfficeChanges(followTheOffice)
  followTheOffice()
}

/** The person's own themes as the office last gave them, for the Looks tab and the theme menu. */
export function ownThemesNow(): readonly OwnTheme[] {
  return OWN
}

// ----------------------------------------------------------------------------- the component

/** One axis of the bar, drawn as a segmented control: one border, N positions. */
function Segmented<T extends string>(props: {
  /** WHAT THIS CONTROL IS. Required, for the reason `Panel.declares` is. */
  declares: Declares
  label: string
  values: readonly T[]
  labels: Readonly<Record<T, WordKey>>
  value: T
  onChange: (next: T) => void
}) {
  /**
   * THE ID IS BUILT FROM THE SURFACE NAME AND NOT FROM THE LABEL, and that is not tidiness.
   *
   * `aria-labelledby` takes a SPACE-SEPARATED LIST of ids. Built from the label, the first
   * two-word control in this bar — `Text size` — produced `aria-labelledby="preset-Text size"`,
   * which a browser reads as two ids, `preset-Text` and `size`, neither of which exists. The group
   * then has no accessible name at all: a screen reader announces an unlabelled group of three
   * buttons, and Playwright cannot find it by role and name either, which is how this was caught.
   * Surface names are lower case with dots and never contain a space.
   */
  const named = 'surface' in props.declares && props.declares.surface !== null ? props.declares.surface : null
  const labelId = `preset-${named ?? props.label.replace(/\s+/g, '-')}`
  return (
    <div className="presetbar-group" {...declaredAttributes(props.declares)}>
      <span className="presetbar-label" id={labelId} {...DRAWS_THE_NAME}>
        {props.label}
      </span>
      <div className="presetbar-seg" role="group" aria-labelledby={labelId}>
        {props.values.map((v) => (
          <button
            key={v}
            type="button"
            // aria-pressed rather than a class, so a screen reader hears which position is
            // active without the styling having to be described to it.
            aria-pressed={v === props.value}
            onClick={() => props.onChange(v)}
          >
            {t(props.labels[v])}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Which way round the bar is laid out.
 *
 * 'row' is what it has always been: the controls side by side across the top of the app.
 * 'column' is for a narrow place — the sidebar's foot — where each label sits above its control
 * and the segments share the width equally.
 *
 * IT IS A LAYOUT AND NOTHING ELSE. Both forms are the same five controls writing the same five
 * attributes to the same store; there is no second copy of a setting here. The product has
 * already been bitten once by a second set of theme and radius controls under different names in
 * the component sheet, out of step with these.
 */
export type PresetLayout = 'row' | 'column'

/**
 * The bar itself. Drop it anywhere in the app chrome; it needs no props and owns no app state.
 *
 * WHERE IT NOW LIVES, AND WHY IT MOVED. These controls used to sit above the content on
 * every page. At 390px they filled the first screen before anything you came to read — measured
 * at roughly 240px of an 844px phone, on every page, for settings chosen once. They are now at
 * the bottom of the sidebar behind a closed disclosure, which costs no first-screen pixels on
 * either the desk or the phone and keeps every one of them reachable.
 */
export function PresetBar({ layout = 'row' }: { layout?: PresetLayout } = {}) {
  useLanguage()
  const developer = useInspect()
  const { presets, faults } = usePresets()
  const change = choosePreset
  // Read on each drawing: `followTheOffice` tells the presets' listeners when the own themes change.
  const own = ownThemesNow()
  const waiting = isOwnThemeId(presets.theme) && !own.some((theme) => theme.id === presets.theme)

  return (
    <div className="presetbar" data-layout={layout}>
      <style href="mole-office-presetbar-column" precedence="default">
        {COLUMN_CSS}
      </style>
      <div className="presetbar-group" {...declaredAttributes({ surface: 'settings.theme' })}>
        <label className="presetbar-label" htmlFor="preset-theme" {...DRAWS_THE_NAME}>
          {t(settingsControlWord('settings.look', 'settingsPanel.look.theme'))}
        </label>
        {/* Auto follows the browser; Light and Dark select a named look; the six are the themes. */}
        <select
          id="preset-theme"
          className="presetbar-select"
          value={presets.theme}
          onChange={(e) => {
            const picked = THEME_CHOICES.find((choice) => choice === e.target.value) ?? own.find((theme) => theme.id === e.target.value)?.id
            // The option list is built from THEME_CHOICES and the own themes, so a value outside them
            // means the two have fallen out of step in code. Say so rather than quietly picking one.
            if (picked === undefined) throw new Error(`PresetBar: unknown theme "${e.target.value}"`)
            change('theme', picked)
          }}
        >
          {THEME_CHOICES.map((choice) => (
            <option key={choice} value={choice}>
              {themeChoiceName(choice)}
            </option>
          ))}
          {/* The person's own themes, named as they named them. */}
          {own.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {content(theme.name)}
            </option>
          ))}
          {/* While the office has not answered, a stored own theme is shown as waiting, not as Auto. */}
          {waiting && (
            <option value={presets.theme} disabled>
              {t('settingsPanel.look.ownWaiting')}
            </option>
          )}
        </select>
      </div>

      <Segmented
        declares={{ surface: 'settings.density' }}
        label={t(settingsControlWord('settings.look', 'settingsPanel.look.density'))}
        values={DENSITY_CHOICES}
        labels={DENSITY_LABELS}
        value={presets.density}
        onChange={(v) => change('density', v)}
      />
      <Segmented
        declares={{ surface: 'settings.corners' }}
        label={t(settingsControlWord('settings.look', 'settingsPanel.look.corners'))}
        values={RADIUS_CHOICES}
        labels={RADIUS_LABELS}
        value={presets.radius}
        onChange={(v) => change('radius', v)}
      />
      <Segmented
        declares={{ surface: 'settings.type' }}
        label={t(settingsControlWord('settings.look', 'settingsPanel.look.type'))}
        values={FONT_CHOICES}
        labels={FONT_LABELS}
        value={presets.font}
        onChange={(v) => change('font', v)}
      />
      <Segmented
        declares={{ surface: 'settings.size' }}
        label={t(settingsControlWord('settings.look', 'settingsPanel.look.size'))}
        values={SIZE_CHOICES}
        labels={SIZE_LABELS}
        value={presets.size}
        onChange={(v) => change('size', v)}
      />

      {faults.map((f) => (
        <p key={faultKey(f)} className="presetbar-fault" role="status">
          {/* ONE TREATMENT IN BOTH PLACES, which is what role 9 of the colour role register asks
              for. This drew a warning triangle while the same refusal one panel below drew nothing
              at all; --st-failed-glyph is the token the state already carries and it is a ✕. */}
          <span aria-hidden="true">{'\u2715'}</span>
          {presetFaultSentence(f, developer)}
        </p>
      ))}
    </div>
  )
}

/**
 * The column form's rules.
 *
 * They live here rather than in styles.css because the row form's rules are already there and
 * that file belongs to somebody else; adding to it from this side would be two agents editing one
 * stylesheet. React 19 hoists a `<style href>` into <head> and de-duplicates by href, so this is
 * one element however many bars are rendered. Every value is a token.
 */
const COLUMN_CSS = `
.presetbar[data-layout="column"] {
  flex-direction: column;
  align-items: stretch;
  gap: var(--pad);
}
.presetbar[data-layout="column"] .presetbar-group {
  flex-direction: column;
  align-items: stretch;
  gap: 3px;
}
/* Equal columns rather than content width: four themes' worth of labels at their natural sizes
   would make a ragged stack of controls in a 248px column. */
.presetbar[data-layout="column"] .presetbar-seg {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
}
.presetbar[data-layout="column"] .presetbar-seg button {
  padding: 0 4px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.presetbar[data-layout="column"] .presetbar-select { width: 100%; }
.presetbar[data-layout="column"] .presetbar-fault { max-width: none; }
`
