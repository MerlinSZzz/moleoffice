// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GETTING TEXT OUT OF A PAGE AND INTO SOMEBODY'S HANDS, AND SAYING SO WHEN THE BROWSER WILL NOT.
 *
 * ---------------------------------------------------------------------------------------------
 * THE MEASUREMENT THIS FILE EXISTS FOR
 * ---------------------------------------------------------------------------------------------
 *
 * On 7 September 2026, copy was pressed on a bundle from a second machine and nothing arrived.
 * On the machine the office runs on, the same press copied fine.
 *
 * MEASURED, the same day, on one stack served on two addresses at once: on `http://127.0.0.1:<port>`
 * the page is a secure context and `navigator.clipboard` is an object; on
 * `http://<this machine's name>:<port>` — the same page, the same server, plain http — the page is
 * NOT a secure context and `navigator.clipboard` is `undefined`. A browser gives the clipboard only
 * to a page served over https or served from the machine the browser is on. The owner's other machine is
 * neither.
 *
 * `127.0.0.2` cannot stand in for that machine here, and it is worth writing down because it is
 * obvious thing to try: Chromium treats every address in 127.0.0.0/8 as trustworthy, so a page on
 * `http://127.0.0.2:<port>` is a secure context and has a clipboard. Measured the same day.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT WENT WRONG IN THE CODE, AND WHY IT IS ONE FUNCTION NOW
 * ---------------------------------------------------------------------------------------------
 *
 * `await navigator.clipboard.writeText(text)` inside a `try` is not a clipboard write that failed.
 * It is a property read on `undefined`, and what the page then showed a person was
 * *Cannot read properties of undefined (reading 'writeText')* — the browser's words about a
 * variable, in a note at the top of a page, 1,152 pixels above the button that was pressed.
 *
 * So the question *did the clipboard take it, and if not why* is worked out HERE and in one place.
 * A caller gets an answer it can draw, never an exception it has to make words out of.
 */

import { content, t } from '@shared/i18n.ts'

/**
 * EVERY SENTENCE HERE IS READ FROM THE WORD LISTS, in the page's language at the moment of the press.
 * BundlePanel.tsx and TaskPackagePanel.tsx draw what these return, so the words are moved once, here.
 * A file name or the browser's own words inside a sentence are content and are never translated.
 */

/** What a copy press came to. `because` is a sentence for a person, never a browser's message. */
export type ClipboardWrite = { wrote: true } | { wrote: false; because: string }

/**
 * WHY A PAGE ON PLAIN HTTP FROM ANOTHER MACHINE HAS NO CLIPBOARD, said to the person pressing.
 *
 * It names the rule rather than the symptom, because the person reading it is on a machine where
 * the same button works and needs to know what is different about this one.
 */
const NOT_A_SECURE_PAGE = 'frameFiles.clipboard.notSecure'

/** The other way the door can be missing: a browser with no clipboard at all, secure or not. */
const NO_CLIPBOARD_AT_ALL = 'frameFiles.clipboard.noClipboard'

/**
 * Put text on the clipboard, and say what happened.
 *
 * THE TWO FAILURES ARE TOLD APART because they are different facts and only one of them is about
 * the address the page was served on. A page that guessed would tell somebody on an old browser to
 * go and find https.
 */
export async function putOnTheClipboard(text: string): Promise<ClipboardWrite> {
  const door = typeof navigator === 'undefined' ? undefined : (navigator.clipboard as Clipboard | undefined)
  if (door === undefined || typeof door.writeText !== 'function') {
    const secure = typeof window === 'undefined' ? true : window.isSecureContext
    return { wrote: false, because: t(secure ? NO_CLIPBOARD_AT_ALL : NOT_A_SECURE_PAGE) }
  }
  try {
    await door.writeText(text)
    return { wrote: true }
  } catch (err) {
    // THE BROWSER'S OWN WORDS ARE KEPT, after a sentence that says what they are about. A refusal
    // here is a real refusal — the permission was withheld, or the page was not in front — and
    // dropping what it said would leave nobody able to tell which.
    return {
      wrote: false,
      because: t('frameFiles.clipboard.refused', { reason: content(err instanceof Error ? err.message : String(err)) }),
    }
  }
}

/**
 * SELECT A BLOCK OF TEXT ALREADY ON THE PAGE, so the person can copy it with the keyboard.
 *
 * This is the way out that needs nothing from the browser but a selection, which every browser has
 * in every context. It is offered when the clipboard is not there, and it is what makes the promise
 * *you can still have this text* true rather than a suggestion to scroll and drag.
 *
 * IT RUNS ONLY IN A BROWSER. Its one caller is a press on the bundles page, so there is always a
 * document and a window; nothing checks for their absence.
 *
 * @param elementId the id of the element holding the text
 * @returns a sentence for the person, saying what to press or why nothing happened
 */
export function selectTheWholeText(elementId: string): string {
  const holding = document.getElementById(elementId)
  if (holding === null) return t('frameFiles.clipboard.gone')
  const selection = window.getSelection()
  if (selection === null) return t('frameFiles.clipboard.noSelection')
  const range = document.createRange()
  range.selectNodeContents(holding)
  selection.removeAllRanges()
  selection.addRange(range)
  return t('frameFiles.clipboard.selected')
}

/**
 * HAND THE TEXT TO THE BROWSER AS A FILE, which is the other way out and the one that survives a
 * page reload.
 *
 * A download is not gated on a secure context, so this works exactly where the clipboard does not.
 *
 * WHAT IT SAYS IS WHAT IT DID, and no more. The page asks the browser to save a file; whether the
 * browser then saves it, asks first, or refuses, is the browser's own business and this cannot see
 * it. So when the file was handed over this returns no sentence, and the caller draws the file's
 * name on a row of its own that says it was handed over, never that it was saved.
 *
 * THE FILE'S TYPE is plain text unless the caller names another, as a report saved as one HTML file does.
 * THE CONTENTS ARE TEXT OR BYTES, so a report's PDF, which the office answers as bytes, is handed over the same way.
 *
 * @returns the refusal for the person when the browser will not take a file, or null when it was handed one
 */
export function handTheTextToTheBrowserAsAFile(contents: BlobPart, fileName: string, type = 'text/plain;charset=utf-8'): string | null {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return t('frameFiles.clipboard.noFile')
  }
  const address = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement('a')
  link.href = address
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  // THE ADDRESS IS LET GO, but not in the same tick: revoking it before the browser has read it
  // cancels the download in Chromium, silently. A whole context bundle is tens of kilobytes and
  // keeping one alive for a second costs nothing.
  setTimeout(() => URL.revokeObjectURL(address), 1000)
  return null
}
