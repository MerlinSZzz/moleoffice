// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ACT'S LABEL SURVIVES AN OFFICE THAT CANNOT BE REACHED. Wave 13k round 43, from wave 13r's message WSfu7efYpNLS.
 *
 * ErrorNote (src/web/components/ui.tsx) drew every unreachable fault as a page that could not be read: the
 * cannot-reach sentence as the heading, and under it error.blank, "Nothing on this page could be read, so it is
 * blank rather than empty". An act's note that passed its fault lost its own label ("Not sent") and said something
 * untrue about the page. Wave 13r worked around it by passing no fault (theFaultANoteDraws, commit 667e3d1d7).
 *
 * WHAT THIS FILE PROVES, in English and in Chinese:
 *   1. a note with a label of its own keeps that label as its heading, says the cannot-reach sentence under it,
 *      and does not say the page is blank;
 *   2. a note with no label, a page that could not be read, is drawn as before: the cannot-reach sentence as the
 *      heading and error.blank under it.
 *
 * MUTATION, after a control run (the commit that added this file names the logs): `pageUnread` is `unreachable`
 * again, whatever the caller passed. Case 1 goes red in both languages; case 2 stays green.
 *
 * The fault is made up: nothing was asked of any server.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import type { Fault } from '../src/web/api.ts'

type UI = typeof import('../src/web/components/ui.tsx')
type I18n = typeof import('../src/shared/i18n.ts')
let ui: UI
let i18n: I18n

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope; this is the smallest stand-in that lets it load.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
  }
  ui = await import('../src/web/components/ui.tsx')
  i18n = await import('../src/shared/i18n.ts')
})

afterAll(() => i18n?.setWordLanguage('en'))

function unreachable(message: string): Fault {
  return { kind: 'unreachable', message, said: null, path: '/api/synthetic-act', status: 0, reason: null, detail: null, stored: null, elsewhere: null } as unknown as Fault
}

/** The heading and the sentence the note draws, with its tags taken out. */
function drawn(props: { label?: string; fault: Fault }): { heading: string | null; sentence: string } {
  const html = renderToStaticMarkup(h(ui.ErrorNote, { message: props.fault.message, ...props }))
  const strip = (s: string) => s.replace(/<[^>]+>/g, '').trim()
  const heading = /<strong>(.*?)<\/strong>/.exec(html)
  const sentence = /<span class="px-error-msg">(.*?)<\/span>/.exec(html)
  return { heading: heading === null ? null : strip(heading[1]!), sentence: strip(sentence?.[1] ?? '') }
}

for (const lang of ['en', 'zh'] as const) {
  const words = createI18n(lang).t

  it(`a note with its own label keeps it, and says only that the office could not be reached (${lang})`, () => {
    i18n.setWordLanguage(lang)
    const cannotReach = words('frameFiles.api.cannotReach')
    const label = words('talk.nothingWritten')
    const seen = drawn({ label, fault: unreachable(cannotReach) })
    expect(seen.heading).toBe(label)
    expect(seen.sentence).toBe(cannotReach)
    expect(seen.sentence).not.toContain(words('error.blank'))
  })

  it(`a note with no label is a page that could not be read, as before (${lang})`, () => {
    i18n.setWordLanguage(lang)
    const cannotReach = words('frameFiles.api.cannotReach')
    const seen = drawn({ fault: unreachable(cannotReach) })
    expect(seen.heading).toBe(cannotReach)
    expect(seen.sentence).toBe(words('error.blank'))
  })
}
