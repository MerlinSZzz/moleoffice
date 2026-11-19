// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A LIST DRAWS FOR A RUN WAITING MORE THAN AN HOUR ON A USAGE LIMIT, in place of "running".
 *
 * src/config/a-long-wait.mjs decides which wait is long, once, from the mark the launcher writes. The sessions page, All
 * records, an agent's runs and a run's workers draw such a run with these words, at its next try in the reader's local
 * time. The stored state stays `running`, so the drawing and the counts do not change.
 */
import { t } from '@shared/i18n.ts'
import { drawnStamp, localStamp, parseAnyStamp } from '@shared/time.ts'

/** The words for a run waiting on a usage limit until `nextTryAt`, which is drawn as written when it is no time. */
export function waitingOnALimitUntil(nextTryAt: string): string {
  const at = parseAnyStamp(nextTryAt)
  return t('w13q.longWait.until', { time: at === null ? nextTryAt : drawnStamp(localStamp(at)) })
}
