// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HAND A ZIP TO THE BROWSER TO SAVE, and say what happened.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS NOT lib/clipboard.ts
 * ---------------------------------------------------------------------------------------
 *
 * `handTheTextToTheBrowserAsAFile` in `src/web/lib/clipboard.ts` already hands a page's text over
 * as a file. A zip is not text: it is bytes the server wrote, and putting them through a string
 * would change them. So this file takes the bytes exactly as they arrived.
 *
 * The sentence it returns is the clipboard module's own `frameFiles.clipboard.handed` word, because
 * a person being handed a file should read one fact the same way whether the file is a text or a
 * zip. `frameFiles.clipboard.noFile` is the same answer for a browser that will not hand a page a
 * file at all.
 *
 * WHAT IT SAYS IS WHAT IT DID. The page asks the browser to save a file; whether the browser then
 * saves it, asks first, or refuses, is the browser's own business and this cannot see it. So the
 * sentence says the file was handed over, never that it was saved. When the browser has no way to
 * take a file at all, `handed` is false and the sentence says only that: a page must not print the
 * handed-over sentence beside that refusal.
 *
 * The address is let go after a second, not in the same tick: revoking it before the browser has
 * read it cancels the download in Chromium, silently.
 */

import { content, t } from '@shared/i18n.ts'

/** What one handover came to: whether the browser took the file, and the one sentence a person reads. */
export interface TheHandover {
  handed: boolean
  said: string
}

/** The bytes of one download, as a Blob. An `ArrayBuffer` is what the transport hands back. */
export function aBlobFor(bytes: ArrayBuffer, type: string): Blob {
  return new Blob([bytes], { type })
}

/**
 * Hand one zip to the browser and say what happened.
 *
 * @param bytes the zip exactly as the server answered it
 * @param fileName the name the server gave the download, from the title and the export number
 * @returns whether the browser took the file, and a sentence for the person
 */
export function theFileCountsSaid(counts: { included: number; missing: number; leftOut: number }): string {
  return t('zipExport.said', {
    went: t('zipExport.went', { n: counts.included }),
    missing: t('zipExport.missing', { n: counts.missing }),
    leftOut: t('zipExport.leftOut', { n: counts.leftOut }),
  })
}

export function handTheZipToTheBrowserAsAFile(bytes: ArrayBuffer, fileName: string): TheHandover {
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
  return { handed: true, said: t('frameFiles.clipboard.handed', { fileName: content(fileName) }) }
}
