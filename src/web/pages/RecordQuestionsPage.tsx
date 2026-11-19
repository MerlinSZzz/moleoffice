// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE QUESTIONS ABOUT WHAT THE RECORDS SAY: paused, not classified, no state. Home drew them in Developer mode
 * and now has a press to this page there. They are read from the frame's one reading
 * of this project's attention, the one Home's reports read.
 */
import { t } from '@shared/i18n.ts'
import type { AttentionHome } from '../api.ts'
import { QuestionsPanel } from '../components/AttentionPanel.tsx'
import { HOME_SECTIONS_CSS } from '../components/home/HomeSections.tsx'
import { type AsyncState, ErrorNote, Loading } from '../components/ui.tsx'
import { useLanguage } from '../lib/language.ts'

export function RecordQuestionsPage({ attention, onAttentionChanged }: { attention: AsyncState<AttentionHome>; onAttentionChanged: () => void }) {
  useLanguage()
  return (
    <div className="page hm-away" data-away-from-home="recordquestions">
      <style href="mole-office-home-sections" precedence="default">{HOME_SECTIONS_CSS}</style>
      {/* THE NAME, TYPED: the same words as the rail row that opens this page. */}
      <h1 className="hm-away-title" data-title-is="its-label">{t('home.questions')}</h1>
      {attention.status === 'loading' ? <Loading rows={2} /> : null}
      {attention.status === 'error' ? <ErrorNote message={attention.message} fault={attention.fault ?? null} retry={onAttentionChanged} /> : null}
      {attention.status === 'ready' ? <QuestionsPanel questions={attention.value.questions} headed={false} /> : null}
    </div>
  )
}
