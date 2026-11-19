// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { LANGUAGES, t, wordCheck, type Language, type WordKey } from '@shared/i18n.ts'
import { api } from '../api.ts'
import { useEveryLanguagesWords, useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'
import { ErrorNote, Loading, Panel, useAsync } from './ui.tsx'
import { WordTable } from './WordTable.tsx'

/** How many waiting words the panel names; the count above them is of all of them. */
const WAITING_SHOWN = 50

/**
 * Counts include previous pages in this visit, even after the language changes.
 *
 * The missing counts and the fallbacks carry their own names, data-words-missing and data-word-fallbacks, because
 * the waiting list below is a list of its own: a test that read every list in the panel counted it as a fallback
 * whenever words waited (check yujhLhEzMZSN).
 */
export function WordCheckPanel() {
  useLanguage()
  const developer = useInspect()
  // THE COUNTS READ EVERY LANGUAGE'S LIST. A page brings a language's words only when it is drawn in that language
  // (src/web/lib/language.ts), so developer mode brings the others before it counts.
  const every = useEveryLanguagesWords(developer)
  const check = developer && every.here ? wordCheck() : null
  return (
    <Panel titleIs="label" declares={{ surface: 'settings.words' }} title={t('settings.words.title')}>
      <WordTable />
      {developer ? <>
      {every.didNotCome !== null
        ? <ErrorNote message={t('language.wordsNotCounted', { language: LANGUAGES[every.didNotCome] })} retry={every.again} />
        : check === null ? <Loading what={t('language.everyLanguagesWords')} /> : <>
      <p>{t('settings.words.total', { n: check.total })}</p>
      <ul data-words-missing="">
        {(Object.entries(LANGUAGES) as [Language, string][]).map(([language, name]) => (
          <li key={language}>{t('settings.words.missing', { language: name, n: check.missingByLanguage[language].length })}</li>
        ))}
      </ul>
      <h3>{t('settings.words.fallbacks')}</h3>
      {/* A WORD KEY HAS NO PLACE TO BREAK, so this list and the waiting list below break one anywhere inside the card. */}
      {check.fallbacks.length === 0 ? <p data-word-fallbacks="">{t('settings.words.none')}</p> : (
        <ul data-word-fallbacks="" style={{ overflowWrap: 'anywhere' }}>{check.fallbacks.map(({ key, count }) => <li key={key}>{t('settings.words.count', { key, n: count })}</li>)}</ul>
      )}
      </>}
      <WordsWaiting />
      </> : null}
    </Panel>
  )
}

/**
 * THE WORDS WAITING FOR TRANSLATION, as GET /api/words/waiting works them out from the word
 * lists. The translation round before a version works from the same list.
 */
function WordsWaiting() {
  const reading = useLanguage()
  const language: Language = reading.language === 'xx' ? 'en' : reading.language
  const name = LANGUAGES[language]
  const [said] = useAsync(() => api.wordsWaiting(WAITING_SHOWN, language), [language])
  return (
    <section data-words-waiting="" data-words-waiting-language={language} style={{ overflowWrap: 'anywhere' }}>
      <h3>{t('settings.words.waiting.for', { language: name })}</h3>
      {said.status === 'loading' ? <Loading what={t('settings.words.waiting.asking')} /> : null}
      {said.status === 'error' ? <ErrorNote message={said.message} fault={said.fault} /> : null}
      {said.status === 'ready' ? (
        <>
          <p data-words-waiting-count={said.value.count}>
            {said.value.count === 0
              ? t('settings.words.waiting.noneFor', { language: name })
              : t('settings.words.waiting.countFor', { n: said.value.count, language: name })}
          </p>
          {said.value.words.length > 0 ? (
            <ul>
              {said.value.words.map(({ key, reason }) => (
                <li key={key}>{t('settings.words.waiting.line', { key, reason: t(`settings.words.waiting.reason.${reason}` as WordKey) })}</li>
              ))}
            </ul>
          ) : null}
          {said.value.count > said.value.words.length ? <p>{t('settings.words.waiting.more', { n: said.value.count - said.value.words.length })}</p> : null}
          {('translationRemoved' in said.value ? said.value.translationRemoved : said.value.chineseRemoved).length > 0
            ? <p>{t('settings.words.waiting.removedFor', {
              n: ('translationRemoved' in said.value ? said.value.translationRemoved : said.value.chineseRemoved).length,
              language: name,
            })}</p>
            : null}
        </>
      ) : null}
    </section>
  )
}
