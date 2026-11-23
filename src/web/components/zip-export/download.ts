// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HAND A ZIP TO THE BROWSER TO SAVE, and say whether it was taken.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS NOT lib/clipboard.ts
 * ---------------------------------------------------------------------------------------
 *
 * `handTheTextToTheBrowserAsAFile` in `src/web/lib/clipboard.ts` already hands a page's text over
 * as a file. A zip is not text: it is bytes the server wrote, and putting them through a string
 * would change them. So this file takes the bytes exactly as they arrived.
 *
 * When the browser takes the file, this returns no sentence: the page draws the file's name on a
 * row of its own, the way the clipboard module's caller does for a text. When the browser will not
 * hand a page a file at all, the sentence is the clipboard module's own `frameFiles.clipboard.noFile`
 * word, so a person reads that refusal the same way whether the file is a text or a zip.
 *
 * WHAT IT SAYS IS WHAT IT DID. The page asks the browser to save a file; whether the browser then
 * saves it, asks first, or refuses, is the browser's own business and this cannot see it. So the row
 * says the file was handed over, never that it was saved. When the browser has no way to take a
 * file at all, `handed` is false and the sentence says only that: a page must not draw the
 * handed-over row beside that refusal.
 *
 * The address is let go after a second, not in the same tick: revoking it before the browser has
 * read it cancels the download in Chromium, silently.
 */

import { t } from '@shared/i18n.ts'

/** What one download came to: the browser took the file, or it would not, with the one sentence a person reads. */
export type TheDownload = { handed: true } | { handed: false; said: string }

/** The bytes of one download, as a Blob. An `ArrayBuffer` is what the transport hands back. */
export function aBlobFor(bytes: ArrayBuffer, type: string): Blob {
  return new Blob([bytes], { type })
}

/**
 * Hand one zip to the browser and say whether it was taken.
 *
 * @param bytes the zip exactly as the server answered it
 * @param fileName the name the server gave the download, from the title and the export number
 * @returns whether the browser took the file, and the refusal for the person when it would not
 */
export function theFileCountsSaid(counts: { included: number; missing: number; leftOut: number }): string {
  return t('zipExport.said', {
    went: t('zipExport.went', { n: counts.included }),
    missing: t('zipExport.missing', { n: counts.missing }),
    leftOut: t('zipExport.leftOut', { n: counts.leftOut }),
  })
}

export function handTheZipToTheBrowserAsAFile(bytes: ArrayBuffer, fileName: string): TheDownload {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return { handed: false, said: t('frameFiles.clipboard.noFile') }
  }
  const address = URL.createObjectURL(aBlobFor(bytes, 'application/zip'))
  const link = document.createElement('a')
  link.href = address
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(address), 1000)
  return { handed: true }
}
