// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OTHER HALF OF THE TEXT-SIZE PROOF: THE CODE THAT WRITES `data-size`.
 *
 * ---------------------------------------------------------------------------------------
 * THE HOLE THIS FILE EXISTS TO CLOSE, WHICH WAS MEASURED AND NOT GUESSED
 * ---------------------------------------------------------------------------------------
 *
 * `tests/the-text-size-axis.test.ts` is thirteen assertions about what the three text sizes compute
 * to in Chromium, and it is a good test of `src/web/tokens.css`. It is not a test of the product.
 * Its harness, `tests/tokens-in-a-browser.ts`, writes `data-size` onto <html> ITSELF:
 *
 *     if (whichSize === 'default') html.removeAttribute('data-size')
 *     else html.setAttribute('data-size', whichSize as string)
 *
 * So the one function in the app allowed to write that attribute — `PresetBar.applyPresets` — is
 * never called, never imported, and never named outside a comment. Delete the two lines of it that
 * write `data-size` and all thirteen of those assertions stay green while the Text size control
 * does nothing at all on the screen. That was run, and that is what happened.
 *
 * Both halves are needed and both are kept. The stylesheet file answers "what does `data-size`
 * COMPUTE TO"; this file answers "does anything ever WRITE it". Neither answers the other, and the
 * mutation table at the foot of this comment says which one fires for which break.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS TWO PROOFS AND NOT ONE
 * ---------------------------------------------------------------------------------------
 *
 * THE FUNCTION, CALLED. `applyPresets` is handed something with the three methods it uses and asked
 * what it wrote. That is fast, and it runs in the ordinary node environment the suite already has.
 *
 * AND THE WHOLE CHAIN, PRESSED. A person opens `#/settings`, presses `Large` by its name, and the
 * root font size really moves in a real browser running the real app. That covers the click
 * handler, the store write, `applyPresets`, the attribute and the stylesheet in one press. It is
 * slower, and it is the one that would also have caught the accessible-name defect in `b1040aa`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT MAKES WHICH FILE GO RED. Every row below was run on 25 August 2026 and restored.
 * ---------------------------------------------------------------------------------------
 *
 *   delete the `data-size` write in applyPresets
 *     this file 6 of 13 red, the-text-size-axis 13 of 13 GREEN — the defect being closed
 *   `--fs-1: max(13px, 0.8125rem)` -> `--fs-1: 0.8125rem` in tokens.css
 *     the-text-size-axis 2 of 13 red, this file 13 of 13 green
 *   rename `data-size` to `data-textsize` in applyPresets
 *     this file 6 of 13 red: the three direct calls, the drift guard and both presses
 *   add a `:root[data-size='default']` rule to tokens.css
 *     this file 2 of 13 red, both in the drift guard, the-text-size-axis green
 *
 * The first two are the separation this file was written for: a reader seeing one red knows which
 * of the two halves broke without reading either file.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

type Bar = typeof import('../src/web/components/PresetBar.tsx')
/** The five axes and their positions, as the component declares them. */
type Presets = Bar['DEFAULT_PRESETS']

/**
 * What Chromium's own base size is, and therefore what the two percentages come to. The same three
 * numbers `tests/the-text-size-axis.test.ts` holds the stylesheet to, arrived at from the other end.
 */
const EXPECTED_ROOT = { small: 15, default: 16, large: 18 } as const

let bar: Bar

beforeAll(async () => {
  // The runner's environment is `node`, and this component's import graph reaches `src/web/api.ts`,
  // which reads localStorage at module scope. The smallest stand-in for a window goes in first, the
  // way tests/every-appearance-control-says-its-name.test.ts does it. `PresetBar`'s own import-time
  // restore is guarded on `document`, which is still absent, so it takes the default presets and
  // writes nothing anywhere.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  bar = await import('../src/web/components/PresetBar.tsx')
})

/**
 * A stand-in for <html> that remembers what was written to it.
 *
 * It has exactly the three methods `applyPresets` calls and nothing else, which is deliberate: a
 * whole document would let this file drift into measuring a DOM, and the claim here is only about
 * what the function writes. `getAttribute` answering `null` for an absent attribute is the answer a
 * browser gives, and the absence IS the `default` position, so it has to be readable.
 */
function anElementThatRemembers(): { root: HTMLElement; written: Map<string, string> } {
  const written = new Map<string, string>()
  const root = {
    setAttribute: (name: string, value: string) => void written.set(name, value),
    removeAttribute: (name: string) => void written.delete(name),
    getAttribute: (name: string) => written.get(name) ?? null,
  }
  return { root: root as unknown as HTMLElement, written }
}

/**
 * Apply one axis at one named position onto a fresh element, and read that attribute back.
 *
 * The cast is here and nowhere else. `value` arrives as a string because the caller is walking a
 * list read off the component, and the union it belongs to is decided by which axis it came from —
 * which the type system cannot follow through a computed key. The walk below is over the
 * component's own exported lists, so a wrong word is a wrong word in the component.
 */
function attributeAfterApplying(axis: keyof Presets, value: string, attribute: string): string | null {
  const { root } = anElementThatRemembers()
  bar.applyPresets({ ...bar.DEFAULT_PRESETS, [axis]: value } as Presets, root)
  return root.getAttribute(attribute)
}

describe('the text-size control writes the attribute the stylesheet is keyed on', () => {
  it('really loaded the function, so a file that imported nothing cannot pass quietly', () => {
    expect(typeof bar.applyPresets, 'PresetBar no longer exports applyPresets').toBe('function')
    expect([...bar.SIZE_CHOICES]).toEqual(['small', 'default', 'large'])
  })

  it('writes data-size="large" when the control is at Large', () => {
    expect(
      attributeAfterApplying('size', 'large', 'data-size'),
      "nothing wrote data-size, so :root[data-size='large'] in tokens.css can never match and the Large " +
        'position of the Text size control does nothing on the screen',
    ).toBe('large')
  })

  it('writes data-size="small" when the control is at Small', () => {
    expect(
      attributeAfterApplying('size', 'small', 'data-size'),
      'nothing wrote data-size, so the Small position of the Text size control does nothing on the screen',
    ).toBe('small')
  })

  it('leaves no data-size at Default, so a raised browser base size survives', () => {
    // `default` is the ABSENCE of the attribute. Writing the word `default` would match no rule in
    // tokens.css and would be dead markup; the drift guard below forbids it either way.
    expect(
      attributeAfterApplying('size', 'default', 'data-size'),
      'Default wrote a data-size, and no rule in tokens.css matches one',
    ).toBeNull()
  })

  it('takes data-size off again when a reader goes back to Default from Large', () => {
    // The same element twice, because this is the failure a setAttribute-only implementation has:
    // the attribute sticks, and Default silently keeps whatever was pressed before it.
    const { root, written } = anElementThatRemembers()
    bar.applyPresets({ ...bar.DEFAULT_PRESETS, size: 'large' }, root)
    expect(root.getAttribute('data-size'), 'Large did not write the attribute in the first place').toBe('large')
    bar.applyPresets({ ...bar.DEFAULT_PRESETS, size: 'default' }, root)
    expect(
      root.getAttribute('data-size'),
      `going back to Default left data-size="${String(root.getAttribute('data-size'))}" on the element, so the ` +
        `control has a position it cannot return from`,
    ).toBeNull()
    // And the other axes were still written, so removing one did not clear the element. `auto` is
    // the theme default and is itself an absence, which is why data-theme is not in this list.
    expect([...written.keys()].sort()).toEqual(['data-density', 'data-font', 'data-radius'])
  })
})

// --------------------------------------------------------------------------- the whole chain

/**
 * PRESSING THE CONTROL IN THE RUNNING APP.
 *
 * Everything above is the function. This is a person: the real page, the real bar, the button found
 * by the name a screen reader would read, and the root font size read back out of Chromium.
 * Nothing here reaches past the product into a component or writes an attribute itself.
 */
describe('pressing Text size in the running app moves the root font size', () => {
  let app: LiveApp
  let page: Page

  beforeAll(async () => {
    app = await liveApp({ name: 'text-size-control', viewport: { width: 1440, height: 1000 } })
    page = app.page
    await page.goto(`${app.site}/#/settings/look`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    // WAIT FOR THE PAGE, NEVER FOR THE THING UNDER TEST. Waiting here for the Text size group by
    // name would turn "the control lost its accessible name" into a sixty-second hook timeout with
    // every test below reported as skipped. Waiting for the page's own heading instead lets the
    // first test say what is wrong, by name, in a second. Run: with `aria-labelledby` deleted from
    // the segmented control this file failed in 60s naming a locator, and now fails in 1s naming
    // the control.
    await page.getByRole('heading', { level: 1, name: 'Settings' }).waitFor({ state: 'visible', timeout: 60_000 })
  }, 300_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  /** Press one position of the Text size control and read what the document became. */
  async function press(position: string): Promise<{ attribute: string | null; root: number }> {
    const group = page.getByRole('group', { name: 'Text size' })
    await group.getByRole('button', { name: position, exact: true }).click({ timeout: 15_000 })
    return page.evaluate(() => {
      const html = document.documentElement
      return {
        attribute: html.getAttribute('data-size'),
        root: Math.round(Number.parseFloat(getComputedStyle(html).fontSize) * 100) / 100,
      }
    })
  }

  it('found one Text size control, by the name a screen reader reads', async () => {
    // If this fails and the presses below fail too, the defect is the accessible name and not the
    // attribute — which is a real thing that shipped once, and is what commit b1040aa repaired.
    const found = await page.getByRole('group', { name: 'Text size' }).count()
    expect(found, 'the settings page has no group a screen reader would call "Text size"').toBe(1)
  }, 120_000)

  it('starts with no data-size at all, because Default is the absence of it', async () => {
    const before = await page.evaluate(() => document.documentElement.getAttribute('data-size'))
    expect(before, 'a fresh browser already carried a data-size, so the presses below prove nothing').toBeNull()
  }, 120_000)

  it('takes the root from 16px to 18px at Large, and puts it back at Default', async () => {
    const large = await press('Large')
    expect(
      large.attribute,
      `pressing Large left data-size=${String(large.attribute)} on <html>. The stylesheet is keyed on ` +
        `:root[data-size='large'] and nothing wrote it, so the control does nothing on the screen.`,
    ).toBe('large')
    expect(large.root, `the root is ${String(large.root)}px after pressing Large`).toBe(EXPECTED_ROOT.large)

    const back = await press('Default')
    expect(back.attribute, 'Default did not clear data-size, so the control cannot be returned').toBeNull()
    expect(back.root, `the root is ${String(back.root)}px after pressing Default`).toBe(EXPECTED_ROOT.default)
  }, 120_000)

  it('takes the root from 16px to 15px at Small', async () => {
    const small = await press('Small')
    expect(small.attribute, `pressing Small left data-size=${String(small.attribute)} on <html>`).toBe('small')
    expect(small.root, `the root is ${String(small.root)}px after pressing Small`).toBe(EXPECTED_ROOT.small)
    // Left as it was found, so nothing after this file inherits a Small root.
    await press('Default')
  }, 120_000)
})
