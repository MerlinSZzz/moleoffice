// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PAGE LANGUAGES, in a file of their own: LANGUAGES names each language a page speaks, and Language is its code.
 * src/shared/i18n.ts imports them and exports them again, so every caller stays as it was. They live here because a
 * tool that must not load every word list can read the list of page languages from this file alone; nothing here
 * imports anything.
 */

/**
 * The account and the pages share this declaration. The test language is never stored. The six languages after
 * Chinese are named in their own language, as a person choosing one expects to read it.
 */
export const LANGUAGES = { en: 'English', zh: '中文', el: 'Ελληνικά', es: 'Español', it: 'Italiano', ko: '한국어', pt: 'Português', th: 'ไทย' } as const
export type Language = keyof typeof LANGUAGES
