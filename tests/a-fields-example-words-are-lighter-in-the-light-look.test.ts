// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FIELD'S EXAMPLE WORDS ARE LIGHTER IN THE LIGHT LOOK.
 *
 * The example words inside an empty field are its placeholder. In the Light look they were drawn in
 * --text-3, and --text-3 is only 1.95:1 from the ink of typed words, so an empty field looked filled.
 * Every placeholder now reads one name, --placeholder. In Light its value is a lighter grey, and it
 * still clears 4.5:1 on every ground a field sits on. Every other look keeps its own --text-3.
 *
 * The first case reads every placeholder rule under src/web. The second reads Light's value out of
 * tokens.css and measures it against Light's own grounds and inks. The third loads tokens.css and the
 * six themes into a browser and reads what each look computes. The hex is read from tokens.css and
 * is never typed here.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THEMES, themeRule } from '../src/shared/themes.ts'
import { contrast } from './helpers/colour-measures.ts'
import { drawInABrowser, type Drawn } from './what-the-browser-draws.ts'

const ROOT = fileURLToPath(new URL('../', import.meta.url))

/** A value this test was told is there. Without it the test cannot measure, so it stops and says what is missing. */
function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`${what}, so this test cannot measure it.`)
  return value
}

/** A rule's selector, up to its opening brace, and its body, up to its closing brace. */
const A_RULE = /([^{}]*)\{([^{}]*)\}/g

// --------------------------------------------------------------------------- the placeholder rules

/** Every .ts, .tsx and .css file under src/web, all the way down. */
function webFiles(dir = join(ROOT, 'src/web')): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...webFiles(path))
    else if (/\.(ts|tsx|css)$/.test(entry)) out.push(path)
  }
  return out
}

/** The colour a rule's body sets, or null when it sets none. A background-color or a border-color is not it. */
function colourIn(body: string): string | null {
  const found = /(?:^|[\s;])color\s*:\s*([^;]+)/.exec(body)
  return found === null ? null : (found[1] as string).trim()
}

/**
 * Every rule under src/web whose selector holds ::placeholder, with the file it is in and the colour it
 * sets. Most stylesheets here are template literals in a .tsx file, so the text before a selector can
 * be a comment or the start of the literal; both are cut off, and what is left is the selector.
 */
function placeholderRules(): { file: string; selector: string; colour: string | null }[] {
  const rules: { file: string; selector: string; colour: string | null }[] = []
  for (const path of webFiles()) {
    const text = readFileSync(path, 'utf8')
    if (!text.includes('::placeholder')) continue
    for (const rule of text.matchAll(A_RULE)) {
      let selector = rule[1] as string
      const commentEnd = selector.lastIndexOf('*/')
      if (commentEnd >= 0) selector = selector.slice(commentEnd + 2)
      selector = selector.slice(selector.lastIndexOf('`') + 1).replace(/\s+/g, ' ').trim()
      if (!selector.includes('::placeholder')) continue
      rules.push({ file: relative(ROOT, path), selector, colour: colourIn(rule[2] as string) })
    }
  }
  return rules
}

// --------------------------------------------------------------------------- tokens.css

/** tokens.css without its comments, so a name written in a comment is not read as declared. */
const TOKENS = readFileSync(join(ROOT, 'src/web/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** The opening of the light block, which is also what a page with no look chosen is drawn in. */
const LIGHT_BLOCK = ":root,\n:root[data-theme='light'] {"

/** Every --name: value; in one body of CSS. */
function declarations(body: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const one of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) found.set(one[1] as string, (one[2] as string).trim())
  return found
}

const LIGHT_START = TOKENS.indexOf(LIGHT_BLOCK)
const LIGHT_END = LIGHT_START < 0 ? -1 : TOKENS.indexOf('\n}', LIGHT_START)

/** The light block's declarations, read once. */
const LIGHT: Map<string, string> =
  LIGHT_START < 0 ? new Map() : declarations(TOKENS.slice(LIGHT_START + LIGHT_BLOCK.length, LIGHT_END))

/**
 * Light's example-word ink: the --placeholder of the first rule after the light block whose selector
 * list holds :root[data-theme='light']. Undefined when no such rule declares one.
 */
function lightsPlaceholder(): string | undefined {
  if (LIGHT_END < 0) return undefined
  for (const rule of TOKENS.slice(LIGHT_END).matchAll(A_RULE)) {
    const selectors = (rule[1] as string).split(',').map((one) => one.trim())
    if (!selectors.includes(":root[data-theme='light']")) continue
    const value = declarations(rule[2] as string).get('--placeholder')
    if (value !== undefined) return value
  }
  return undefined
}

const LIGHT_INK = lightsPlaceholder()?.toLowerCase()

/** The grounds a field is drawn on in Light: the page, the three panels and a refused field. */
const GROUNDS = ['--bg', '--panel', '--panel-2', '--panel-3', '--st-failed-bg'] as const

/** WCAG 2.2 SC 1.4.3, for text. */
const TEXT_FLOOR = 4.5

/** How far example words must stay from typed words, so an empty field does not look filled. */
const APART_FROM_TYPED_WORDS = 2.5

describe("a field's example words", () => {
  it('every placeholder rule in src/web that sets a colour reads var(--placeholder)', () => {
    const coloured = placeholderRules().filter((rule) => rule.colour !== null)
    expect(coloured.length, 'no rule under src/web holds ::placeholder and sets a colour, so this case read nothing').toBeGreaterThan(0)
    const wrong = coloured
      .filter((rule) => rule.colour !== 'var(--placeholder)')
      .map((rule) => `${rule.file}: ${rule.selector} sets color: ${String(rule.colour)}`)
    expect(wrong).toEqual([])
  })

  it("Light's example-word ink keeps 4.5:1 on every ground a field sits on, stays apart from typed words, and is lighter than Light's quiet grey", () => {
    expect(LIGHT_START, 'tokens.css has no light block opening with :root, :root[data-theme=light]').toBeGreaterThanOrEqual(0)
    const ink = must(
      LIGHT_INK,
      "tokens.css has no rule after the light block whose selector list holds :root[data-theme='light'] and that declares --placeholder",
    )
    expect(ink, `Light's --placeholder is ${ink}, which is not a 6-digit hex`).toMatch(/^#[0-9a-f]{6}$/)
    for (const ground of GROUNDS) {
      const paper = must(LIGHT.get(ground), `the light block declares no ${ground}`)
      const ratio = contrast(ink, paper)
      expect(ratio, `Light's --placeholder ${ink} on ${ground} ${paper} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(TEXT_FLOOR)
    }
    const typed = must(LIGHT.get('--text'), 'the light block declares no --text')
    const apart = contrast(ink, typed)
    expect(apart, `Light's --placeholder ${ink} against typed words ${typed} is ${apart.toFixed(2)}:1`).toBeGreaterThanOrEqual(APART_FROM_TYPED_WORDS)
    const panel = must(LIGHT.get('--panel'), 'the light block declares no --panel')
    const quiet = must(LIGHT.get('--text-3'), 'the light block declares no --text-3')
    expect(
      contrast(ink, panel),
      `Light's --placeholder ${ink} on --panel is not lighter than Light's --text-3 ${quiet} on --panel`,
    ).toBeLessThan(contrast(quiet, panel))
  })
})

// --------------------------------------------------------------------------- in a browser

/** One look: the root's attributes, the system's scheme, and which ink its placeholder must be. */
interface Look {
  name: string
  theme: string | null
  boot: 'light' | 'dark' | null
  system: 'light' | 'dark'
  /** Light's lighter ink, or the look's own --text-3. */
  ink: 'light' | 'own'
  /** For Auto on a dark system: its --text-3 must also differ from Light's ink. */
  apartFromLight?: true
  /** For a theme: the --text-3 the theme itself gives. */
  ownText3?: string
}

const LOOKS: readonly Look[] = [
  { name: 'Light chosen', theme: 'light', boot: null, system: 'light', ink: 'light' },
  { name: 'Auto on a light system', theme: null, boot: null, system: 'light', ink: 'light' },
  {
    name: 'Auto before the page starts, on a dark system that the early read took as light',
    theme: null,
    boot: 'light',
    system: 'dark',
    ink: 'light',
  },
  { name: 'Auto on a dark system', theme: null, boot: null, system: 'dark', ink: 'own', apartFromLight: true },
  { name: 'Auto before the page starts, taken as dark, on a light system', theme: null, boot: 'dark', system: 'light', ink: 'own' },
  { name: 'Dark chosen, on a light system', theme: 'dark', boot: null, system: 'light', ink: 'own' },
  ...THEMES.flatMap((theme) =>
    (['light', 'dark'] as const).map((system): Look => ({
      name: `the theme ${theme.id}, on a ${system} system`,
      theme: theme.id,
      boot: null,
      system,
      ink: 'own',
      ownText3: theme.values['--text-3'].trim().toLowerCase(),
    })),
  ),
]

/** The id of the style element holding the six themes' rules. */
const THEMES_ELEMENT = 'the-six-themes'

describe('in a browser', () => {
  let drawn: Drawn | undefined

  beforeAll(async () => {
    drawn = await drawInABrowser(`<style id="${THEMES_ELEMENT}">${THEMES.map(themeRule).join('\n')}</style>`)
    // The app puts the themes' element before every stylesheet in the head, so this page does too.
    await drawn.page.evaluate((id) => {
      const themes = document.getElementById(id)
      if (themes === null) throw new Error('The page holds no element with the six themes.')
      document.head.prepend(themes)
    }, THEMES_ELEMENT)
  })

  afterAll(async () => {
    await drawn?.close()
  })

  it('each look draws its placeholder in the right ink', async () => {
    const page = must(drawn, 'the browser did not open').page
    const faults: string[] = []
    for (const look of LOOKS) {
      await page.evaluate(({ theme, boot }) => {
        const root = document.documentElement
        root.removeAttribute('data-theme')
        root.removeAttribute('data-boot-theme')
        if (theme !== null) root.setAttribute('data-theme', theme)
        if (boot !== null) root.setAttribute('data-boot-theme', boot)
      }, { theme: look.theme, boot: look.boot })
      await page.emulateMedia({ colorScheme: look.system })
      const read = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement)
        return {
          placeholder: style.getPropertyValue('--placeholder').trim().toLowerCase(),
          text3: style.getPropertyValue('--text-3').trim().toLowerCase(),
        }
      })
      if (read.placeholder === '') {
        faults.push(`${look.name}: the root computes no --placeholder`)
        continue
      }
      if (look.ink === 'light' && read.placeholder !== LIGHT_INK) {
        faults.push(`${look.name}: --placeholder is ${read.placeholder}, not Light's ${String(LIGHT_INK)}`)
      }
      if (look.ink === 'own' && read.placeholder !== read.text3) {
        faults.push(`${look.name}: --placeholder is ${read.placeholder}, not the look's own --text-3 ${read.text3}`)
      }
      if (look.apartFromLight === true && read.text3 === LIGHT_INK) {
        faults.push(`${look.name}: --text-3 is ${read.text3}, the same as Light's lighter ink`)
      }
      if (look.ownText3 !== undefined && read.text3 !== look.ownText3) {
        faults.push(`${look.name}: --text-3 is ${read.text3}, not the theme's own ${look.ownText3}`)
      }
    }
    await page.evaluate(() => {
      document.documentElement.removeAttribute('data-theme')
      document.documentElement.removeAttribute('data-boot-theme')
    })
    expect(faults).toEqual([])
  })
})
