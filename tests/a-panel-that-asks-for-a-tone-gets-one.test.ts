// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PANEL THAT ASKS FOR A TONE GETS ONE, OR IS TOLD IT WILL NOT.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT
 * ---------------------------------------------------------------------------------------
 *
 * `tone` was applied only at rank 0, and four panels passed one without a rank — including "This is
 * a fork, and settling it is yours", which was therefore drawn with exactly the same chrome as
 * "Stored fields". The one page in Mole Office where a person is REQUIRED looked like a database
 * inspector. The prop was taken, dropped, and never complained.
 *
 * An independent reviewer found this by driving the product. It would not have shown up as a type
 * error, a failing test, or anything a screenshot taken by its author would look wrong in.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS HELD
 * ---------------------------------------------------------------------------------------
 *
 * A tone asked for and not drawn is now a refusal that names the panel and says what to do. A tone
 * asked for at rank 0 is drawn. A rank worked out at render time is still allowed, because six
 * honest call sites do that. And rank 1 still draws no tone, which is why asking for one there was
 * worth refusing rather than quietly honouring.
 *
 * This was one of eight unrelated subjects in the old redesign-shell test. It is here on its own
 * because a file with eight subjects is a file where a weak case is not noticed, which is what
 * happened.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'

type UiModule = typeof import('../src/web/components/ui.tsx')

let ui: UiModule

beforeAll(async () => {
  // The runner's environment is `node` and this project has ruled out jsdom, so a window stand-in
  // is installed before the modules are imported, exactly as tests/shell-nav.test.ts does it.
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
  ui = (await import('../src/web/components/ui.tsx')) as UiModule
})

describe('a Panel that asks for a tone gets one, or is told it will not', () => {
  it('throws when a tone is passed with no rank, naming the panel and what to do', () => {
    expect(() =>
      renderToStaticMarkup(
        h(ui.Panel, { declares: { surface: null }, title: 'A fork', tone: 'ask', children: 'x' } as never),
      ),
    ).toThrow(/A fork.*tone="ask".*rank=\{0\}/s)
  })

  it('draws the tone at rank 0', () => {
    const html = renderToStaticMarkup(
      h(ui.Panel, { declares: { surface: null }, title: 'A fork', rank: 0, tone: 'ask', children: 'x' }),
    )
    expect(html).toContain('data-rank="0"')
    expect(html, 'the ask tokens are not on the panel, so the tint is the alarm colour or none').toContain('--ask')
  })

  it('still allows a rank that is worked out at render time, which six honest call sites do', () => {
    // `rank={broken ? 0 : 1}` with a tone is correct — tinted when something is wrong, plain when
    // it is not. A type that forbade it would push those call sites into casts.
    const broken = false
    expect(() =>
      renderToStaticMarkup(
        h(ui.Panel, {
          declares: { surface: null },
          title: 'Links',
          rank: broken ? 0 : 1,
          tone: 'broken',
          children: 'x',
        }),
      ),
    ).not.toThrow()
  })

  it('does not draw a tone at rank 1, which is why passing one there was worth refusing', () => {
    const html = renderToStaticMarkup(
      h(ui.Panel, { declares: { surface: null }, title: 'Links', rank: 1, tone: 'broken', children: 'x' }),
    )
    expect(html).not.toContain('--px-tone')
  })
})
