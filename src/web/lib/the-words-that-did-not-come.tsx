// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORDS OF THE PAGE'S LANGUAGE DID NOT COME.
 *
 * The built page carries English and Chinese, and fetches the words of the other six languages when the page is to be
 * drawn in one of them (src/web/lib/language.ts). When that fetch fails, the page stays in the language it had, and
 * this says so above every page, the first-run guide too, with a press that asks again.
 */
import { LANGUAGES, t, wordLanguage } from '@shared/i18n.ts'
import { ErrorNote } from '../components/ui.tsx'
import { bringTheMissingWordsAgain, useLanguage } from './language.ts'

export function TheWordsThatDidNotCome() {
  const { wordsMissing } = useLanguage()
  if (wordsMissing === null) return null
  const drawn = wordLanguage()
  return (
    <div className="words-did-not-come">
      <ErrorNote
        message={t('language.wordsDidNotCome', { language: LANGUAGES[wordsMissing], shown: drawn === 'xx' ? t('settings.language.test') : LANGUAGES[drawn] })}
        retry={bringTheMissingWordsAgain}
      />
    </div>
  )
}
