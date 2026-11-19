// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { pageLocale, t } from './i18n.ts'

/**
 * HOW A FILE BLOCK'S SIZE IS SAID.
 *
 * A file block is drawn as an attached file: its name, its size and the presses that open and save
 * it. The file's text is never copied into the report, whatever the viewer's media choice is
 * so the name no longer decides a drawing and no list of text-like
 * extensions is kept. What is left is how the size is said.
 */

/**
 * HOW MANY BYTES A FILE IS, IN THE WORDS A READER USES, in the page's language.
 *
 * Exact bytes below a kilobyte, and a rounded size above it. It is the block's own `size`, which is
 * the bytes' own length, so the number on the page is the number the store worked out. The word for
 * bytes and the way the number is written follow the page's language ("44 bytes", "44 字节"); kB, MB,
 * GB and TB are the same in both (wave 13s round 12).
 */
export function sizeSaid(size: number): string {
  if (!Number.isFinite(size) || size < 0) return t('sb.file.bytes', { n: size })
  if (size < 1000) return t('sb.file.bytes', { n: size })
  const units = ['kB', 'MB', 'GB', 'TB']
  let value = size / 1000
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit += 1
  }
  return `${value.toLocaleString(pageLocale(), { maximumFractionDigits: 1 })} ${units[unit] as string}`
}
