// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { drawInABrowser } from './what-the-browser-draws.ts'

const tokens = readFileSync(new URL('../src/web/tokens.css', import.meta.url), 'utf8')
const globalCss = readFileSync(new URL('../src/web/styles.css', import.meta.url), 'utf8').replace(/@import[^;]+;/g, '')
const ui = readFileSync(new URL('../src/web/components/ui.tsx', import.meta.url), 'utf8')
const css = ui.split('export const UI_CSS = `')[1]?.split('\n`')[0]
if (css === undefined) throw new Error('The shared component stylesheet was not found.')

function palette(name: string): Record<string, string> {
  const body = new RegExp(`:root\\[data-theme='${name}'\\] \\{([\\s\\S]*?)\\n\\}`).exec(tokens)?.[1]
  if (body === undefined) throw new Error(`No ${name} look was found.`)
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]?.trim()]))
}

it('draws each look through the components, honours corner overrides and stops lift for reduced motion', async () => {
  const drawn = await drawInABrowser(`<style>${globalCss}\n${css}\n.page-heading { font-weight: 600; }</style>
    <h1 class="page-heading">Page</h1><h2>Section</h2><h2 class="page-heading">A record title</h2><h3 class="page-heading">Heading</h3>
    <section class="px-panel"><div class="px-panel-head"><h2 class="px-panel-title">Panel</h2></div></section>
    <button class="px-btn">Press</button><button class="px-btn" data-variant="primary">Primary</button>
    <input class="px-input"><select class="px-select"><option>Choice</option></select><div class="px-menu">Menu</div>`)
  try {
    for (const theme of ['light', 'dark'] as const) {
      await drawn.palette(theme)
      await drawn.page.evaluate(() => document.documentElement.dataset.radius = 'default')
      const f = theme === 'light'
      for (const selector of ['.px-panel', '.px-btn', '.px-input', '.px-select', '.px-menu']) {
        expect(await drawn.styleOf(selector, 'border-top-width')).toBe(f ? '2px' : '1px')
        expect(await drawn.styleOf(selector, 'border-top-left-radius')).toBe(f ? '8px' : '12px')
      }
      expect(await drawn.styleOf('h1', 'font-weight')).toBe(f ? '900' : '600')
      expect(await drawn.styleOf('h3', 'font-weight')).toBe(f ? '800' : '600')
      expect(await drawn.styleOf('h2', 'font-weight')).toBe(f ? '700' : '600')
      expect(await drawn.styleOf('h2', 'text-transform')).toBe(f ? 'uppercase' : 'none')
      // A classed h2 can hold a record's own title, which is content and keeps its author's case.
      expect(await drawn.styleOf('h2.page-heading', 'text-transform')).toBe('none')
      expect(await drawn.styleOf('h2.page-heading', 'font-weight')).toBe(f ? '700' : '600')
      expect(await drawn.styleOf('.px-panel-head', 'border-bottom-width')).toBe(f ? '2px' : '0px')
      expect(await drawn.styleOf('.px-panel-title', 'font-size')).toBe(f ? '13px' : '19px')
      expect(await drawn.styleOf('.px-panel', 'box-shadow')).toContain(f ? '4px 4px 0px' : '12px 32px')
      expect(await drawn.styleOf('.px-menu', 'box-shadow')).toContain(f ? '8px 8px 0px' : '20px 60px')
      const button = drawn.page.locator('.px-btn').first()
      // THE LIFT IS A TRANSITION, so the exact matrix is there only once it has finished. Problem
      // `HdS0olG48EVg`: a fixed wait of 100 ms, against 80 ms that start on the next frame, left 1 to
      // 40 ms to spare under load. This waits until the button has nothing running instead.
      // getAnimations() brings the styles up to date first, so a transition that is about to start counts.
      const settled = () => drawn.page.waitForFunction(() => document.querySelector('.px-btn')?.getAnimations().length === 0)
      await button.hover()
      await settled()
      expect(await drawn.styleOf('.px-btn', 'transform')).toBe(f ? 'matrix(1, 0, 0, 1, -1, -1)' : 'none')
      await drawn.page.mouse.down()
      await settled()
      expect(await drawn.styleOf('.px-btn', 'transform')).toBe(f ? 'matrix(1, 0, 0, 1, 2, 2)' : 'none')
      expect(await drawn.styleOf('.px-btn', 'box-shadow')).toBe('none')
      await drawn.page.mouse.up()
      await drawn.page.emulateMedia({ reducedMotion: 'reduce' })
      expect(await drawn.styleOf('.px-btn', 'transform')).toBe('none')
      expect(Number.parseFloat(await drawn.styleOf('.px-btn', 'transition-duration'))).toBeLessThanOrEqual(0.000001)
      await drawn.page.emulateMedia({ reducedMotion: 'no-preference' })
      for (const [radius, want] of [['sharp', '2px'], ['soft', '22px']] as const) {
        await drawn.page.evaluate((r) => document.documentElement.dataset.radius = r, radius)
        expect(await drawn.styleOf('.px-btn', 'border-top-left-radius')).toBe(want)
      }
      await drawn.page.evaluate(() => document.documentElement.dataset.radius = 'default')
      await drawn.palette(null)
      await drawn.page.emulateMedia({ colorScheme: theme })
      expect(await drawn.styleOf('.px-btn', 'border-top-left-radius')).toBe(f ? '8px' : '12px')
    }
  } finally {
    await drawn.close()
  }
})
