// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useSyncExternalStore } from 'react'
import { t } from '@shared/i18n.ts'
import { useLanguage } from '../lib/language.ts'
import { theMove, theMoveWasMarked, watchTheMove } from '../lib/the-old-cookie.ts'

/**
 * WHAT THE MOVE OF THE OLD COOKIE DID, SAID ONCE. Item 7 of SEC-2's design. It says the browser moved when it moved in
 * this load, or when the load before left the mark (lib/the-old-cookie.ts), and why it did not when the move failed.
 * It draws nothing otherwise.
 */
export function TheMoveNotice() {
  useLanguage()
  const move = useSyncExternalStore(watchTheMove, theMove, theMove)
  if (move.state === 'moved' || (move.state === 'not tried' && theMoveWasMarked())) return <p role="status">{t('w13s.pairing.moved')}</p>
  if (move.state === 'not moved') return <p role="status" className="px-error">{t('w13s.pairing.notMoved', { reason: move.reason })}</p>
  return null
}
