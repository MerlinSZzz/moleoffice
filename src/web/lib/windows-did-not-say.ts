// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PAGE'S FIRST READS SAY SO WHILE THEY ARE ASKED AGAIN, WHEN WINDOWS DID NOT SAY IN TIME WHO SENT THEM.
 *
 * Inside the installed Windows app the office asks Windows which program sent a request, and waits for the answer only
 * so long (src/server/lib/from-a-sandbox.ts). Just after an install the first answers can take longer, and the office
 * then refuses the request with the code `senderNotReadInTime`. Every request is then asked again, at most
 * ASKED_AGAIN_AT_MOST more times, by the one transport (`askedAgainWhileWindowsIsSlow` in src/web/api.ts).
 * src/web/main.tsx hands its first reads to `askAgainWhileWindowsIsSlow`, so that meanwhile the page says it is waiting
 * for the operating system. When the last ask is refused too, the page says what happened and what to do. Any other
 * failure is shown at once, as before.
 */
import { t } from '@shared/i18n.ts'
import { ApiError, ASKED_AGAIN_AT_MOST, tellMeWhileWindowsIsSlow } from '../api.ts'
import { theStartSays } from './the-start-says.ts'

/** Run `read`, and say on `root` that the page waits for the operating system each time a read is asked again. */
export async function askAgainWhileWindowsIsSlow(read: () => Promise<unknown>, root: HTMLElement): Promise<void> {
  const stopTelling = tellMeWhileWindowsIsSlow(() => theStartSays(root, t('start.waitingForWindows')))
  try {
    await read()
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== 'senderNotReadInTime') throw error
    throw new Error(t('start.windowsDidNotSay', { ...error.values, times: ASKED_AGAIN_AT_MOST + 1 }))
  } finally {
    stopTelling()
  }
}
