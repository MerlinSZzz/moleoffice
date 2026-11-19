// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A quiet reading of the newest recorded change to one Settings value. */

import { content, t } from '@shared/i18n.ts'
import type { OfficeSettingChangeName } from '../api.ts'
import { api } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { storedActorName } from './Governance.tsx'
import { ErrorNote, Loading, Stamp, useAsync } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

export function SettingChangedLine({ setting, refreshKey = 0 }: { setting: OfficeSettingChangeName; refreshKey?: number }) {
  const reading = useLanguage()
  const [state] = useAsync(() => api.settingChanges(), [setting, refreshKey])
  const [names] = useProjectAsync(() => api.participants(), [refreshKey])

  if (state.status === 'loading') return <Loading what={t('settingsPanel.changed.loading')} rows={0} />
  if (state.status === 'error') {
    return (
      <div className="scl-error">
        <style href="mole-office-setting-changed-line" precedence="default">
          {SETTING_CHANGED_LINE_CSS}
        </style>
        <ErrorNote message={state.message} fault={state.fault} />
      </div>
    )
  }

  const last = state.value.settings[setting]
  // WHO CHANGED IT, BY THE NAME THE REGISTRY HOLDS (wave 13n round 33). The stored id is drawn only where no single
  // person or agent answers to it, or while the names are still being read.
  const kind = last?.by.type === 'human' ? 'person' : last?.by.type === 'agent' ? 'agent' : undefined
  const who = last === null ? '' : (storedActorName(last.by.id, names.status === 'ready' ? names.value : undefined, kind) ?? last.by.id)
  return (
    <div className="scl">
      <style href="mole-office-setting-changed-line" precedence="default">
        {SETTING_CHANGED_LINE_CSS}
      </style>
      {last === null ? (
        <p className="scl-line">{t('settingsPanel.changed.none')}</p>
      ) : (
        <p className="scl-line">
          {t('settingsPanel.changed.prefix', { who: content(who) })}
          {reading.language === 'zh' ? null : ' '}
          {t('settingsPanel.changed.suffix')}
          <Stamp at={last.at} />
          {t('settingsPanel.changed.ending')}
        </p>
      )}
    </div>
  )
}

const SETTING_CHANGED_LINE_CSS = `
.scl { min-width: 0; }
.scl-line { margin: 0; min-width: 0; overflow-wrap: anywhere; color: var(--text-3); font: var(--fs-1)/var(--lh-tight) var(--font-ui); }
.scl-line .px-stamp { color: inherit; }
.scl-error { min-width: 0; }
`
