// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PAGE OF A WAITING SELF-REGISTRATION READS IN CHINESE IN A CHINESE OFFICE.
 *
 * A session that registers itself while nothing proves who sent it, or while the one-version window is closed, files a
 * role request that waits for the person's press. In a Chinese office its page drew two things in English:
 *
 *   1. THE SENTENCE ABOVE THE PRESS, which says why it waits and what the press does. The page builds it with
 *      `whatAdmittingSays` (src/shared/profile.ts) from the word keys `cardAsk.admit.unproved` and
 *      `cardAsk.admit.windowClosed`, and neither key had Chinese, so the Chinese page fell back to the English.
 *   2. THE PAGE'S HEADING AND ITS BREADCRUMB. `titleToDraw` (src/web/pages/RecordPage.tsx) redraws the stored title
 *      "<handle> registers itself" under the registration's office name, and it wrote the English words itself. Home's
 *      row says the same thing through the word key `decisions.selfRegistrationRow`, which has Chinese.
 *
 * On main's code, cases 1 and 2 fail: the sentence reads "registered itself" and the title "registers itself" on the
 * Chinese page. Case 3 is the English control and passes on main's code as well: the English words stay as they were,
 * and a title somebody wrote is drawn as stored.
 *
 * Every name here is made up.
 */

import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { sayInEnglish, setWordLanguage, t } from '../src/shared/i18n.ts'
import { whatAdmittingSays, type WhatAdmitting } from '../src/shared/profile.ts'

type RecordPage = typeof import('../src/web/pages/RecordPage.tsx')

let recordPage: RecordPage

beforeAll(async () => {
  // The record page reaches src/web/api.ts and src/web/lib/mode.ts, both of which touch `window` at module scope.
  // The smallest stand-in that lets them load; nothing in it is under test.
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
  recordPage = await import('../src/web/pages/RecordPage.tsx')
})

afterEach(() => {
  setWordLanguage('en')
})

const NAME = '小助手'
const HANDLE = 'made-up-asker'
const CARD = '工作者'

/** A waiting self-registration as the record page reads it, with the title the door stores. */
function aWaitingSelfRegistration(title = `${HANDLE} registers itself`): { kind: string; title: string; data: unknown } {
  return { kind: 'role_request', title, data: { extra: { selfRegistration: { name: NAME, handle: HANDLE } } } }
}

const WAITS: readonly WhatAdmitting['waits'][] = ['nothing-proved-who-asked', 'the-window-is-closed']

describe('the page of a waiting self-registration in a Chinese office', () => {
  for (const waits of WAITS) {
    it(`1. (${waits}) the sentence above the press is in Chinese: without its Chinese words the page draws the English`, () => {
      setWordLanguage('zh')
      const said = whatAdmittingSays(t, NAME, CARD, { waits, alsoRecords: null })
      const english = whatAdmittingSays(sayInEnglish, NAME, CARD, { waits, alsoRecords: null })
      expect(said, 'the Chinese page draws the English sentence').not.toBe(english)
      expect(said, 'the Chinese page draws the English sentence').not.toContain('registered itself')
      // The same words Home's row uses for a registration.
      expect(said).toContain('注册了自己')
      expect(said, 'the sentence lost the name it is read by').toContain(NAME)
      expect(said, 'the sentence lost the card it asks for').toContain(CARD)
    })
  }

  it("2. the heading and the breadcrumb read Home's Chinese words: written out in English, the title stays English", () => {
    setWordLanguage('zh')
    const drawn = recordPage.titleToDraw(aWaitingSelfRegistration())
    expect(drawn, 'the Chinese page draws the English title').not.toContain('registers itself')
    expect(drawn).toBe(t('decisions.selfRegistrationRow', { name: NAME }))
    expect(drawn).toContain('注册了自己')
    expect(drawn, 'the title draws the stored handle').not.toContain(HANDLE)
  })

  it('3. in English the title and the sentence are as before, and a title somebody wrote is drawn as stored', () => {
    setWordLanguage('en')
    expect(recordPage.titleToDraw(aWaitingSelfRegistration())).toBe(`${NAME} registers itself`)
    expect(recordPage.titleToDraw(aWaitingSelfRegistration('A title the person wrote'))).toBe('A title the person wrote')
    expect(whatAdmittingSays(t, NAME, CARD, { waits: 'the-window-is-closed', alsoRecords: null })).toBe(
      sayInEnglish('cardAsk.admit.windowClosed', { handle: NAME, card: CARD }),
    )
  })
})
