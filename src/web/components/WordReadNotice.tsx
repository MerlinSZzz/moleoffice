// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useLanguage } from '../lib/language.ts'
import { wordReadFailure } from '@shared/word-settings.ts'
import { t } from '@shared/i18n.ts'

/** A missed settings refresh is visible, while the page retains its last confirmed words. */
export function WordReadNotice() {
  useLanguage()
  const reason = wordReadFailure()
  return reason === null ? null : <p role="status" className="px-error">{t('wordTable.readFailed', { reason })}</p>
}
