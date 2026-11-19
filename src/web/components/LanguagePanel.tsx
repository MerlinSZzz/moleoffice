// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { settingsControlWord } from '@shared/settings-declaration.ts'
import { LANGUAGES, t, type Language } from '@shared/i18n.ts'
import { api } from '../api.ts'
import { chooseLanguage, readLanguage, useLanguage } from '../lib/language.ts'
import { Panel, useAsync } from './ui.tsx'

export function LanguagePanel() {
  const reading = useLanguage()
  const language = reading.language === 'xx' ? t('settings.language.test') : LANGUAGES[reading.language]
  const waitingLanguage: Language = reading.language === 'xx' ? 'en' : reading.language
  const [waiting] = useAsync(() => api.wordsWaiting(1, waitingLanguage), [waitingLanguage])
  const sourceKey = {
    address: 'settings.language.address', person: 'settings.language.person', browser: 'settings.language.browser',
  } as const

  return (
    <Panel titleIs="label" declares={{ surface: 'settings.language' }} title={t('settings.language.title')}>
      <style href="mole-office-language" precedence="default">{LANGUAGE_CSS}</style>
      <fieldset className="language-options" disabled={reading.status !== 'ready' || reading.saving}>
        <legend>{t(settingsControlWord('settings.language', 'settings.language.choose'))}</legend>
        {(Object.entries(LANGUAGES) as [Language, string][]).map(([value, name]) => (
          <label key={value}>
            <input type="radio" name="page-language" value={value} checked={reading.chosen === value}
              onChange={() => { void chooseLanguage(value) }} />
            <span lang={value}>{name}</span>
          </label>
        ))}
        <label>
          <input type="radio" name="page-language" value="" checked={reading.chosen === null}
            onChange={() => { void chooseLanguage(null) }} />
          {t(settingsControlWord('settings.language', 'settings.language.followBrowser'))}
        </label>
      </fieldset>
      <p className="language-source" role="status">
        {t(sourceKey[reading.source], { language })}
      </p>
      {waiting.status === 'ready' && waiting.value.count > 0 ? (
        <p className="language-waiting" role="status" data-language-waiting={waiting.value.count}>
          {t('settings.language.waiting', { n: waiting.value.count })}
        </p>
      ) : null}
      {reading.status === 'loading' ? <p role="status">{t('settings.language.reading')}</p> : null}
      {reading.status === 'error' ? <p role="alert">{t('settings.language.readFailed')}</p> : null}
      {reading.saving ? <p role="status">{t('settings.language.saving')}</p> : null}
      {reading.status === 'error' ? <button type="button" onClick={() => { void readLanguage(true) }}>{t(settingsControlWord('settings.language', 'settings.language.retry'))}</button> : null}
      {reading.saveFailed ? <p role="alert">{t('settings.language.saveFailed')}</p> : null}
    </Panel>
  )
}

const LANGUAGE_CSS = `
.language-options { display: flex; flex-wrap: wrap; gap: var(--gut); margin: 0; padding: 0; border: 0; min-width: 0; }
.language-options legend { margin-bottom: var(--pad); font-weight: 600; }
.language-options label { display: inline-flex; align-items: center; gap: var(--pad); cursor: pointer; }
.language-source { margin: var(--gut) 0 0; color: var(--text-2); overflow-wrap: anywhere; }
.language-waiting { margin: var(--pad) 0 0; color: var(--text-2); overflow-wrap: anywhere; }
`
