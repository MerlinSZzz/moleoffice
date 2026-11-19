// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { WordKey } from './i18n.ts'
import type { DetailRow, Rung } from './detail.ts'

/**
 * WHAT EACH ROW IS CALLED. `detailRowName` and `DETAIL_SURFACE_NAMES` in src/web/lib/detailchoice.ts
 * hold the same English; these keys are what the grid draws, so the row names follow the page language.
 */
export const DETAIL_ROW_WORDS = {
  everywhere: 'settingsPanel.detail.row.everywhere',
  home: 'settingsPanel.detail.row.home',
  review: 'settingsPanel.detail.row.review',
  composer: 'settingsPanel.detail.row.composer',
  recipients: 'settingsPanel.detail.row.recipients',
  messages: 'settingsPanel.detail.row.messages',
  reportIndex: 'settingsPanel.detail.row.reportIndex',
  reportContent: 'settingsPanel.detail.row.reportContent',
  moduleCards: 'settingsPanel.detail.row.moduleCards',
  graph: 'settingsPanel.detail.row.graph',
  tables: 'settingsPanel.detail.row.tables',
} as const satisfies Record<DetailRow, WordKey>

/** The accessible phrase for each position. The English is `RUNG_SPECS[rung].phrase`, read by en.ts. */
export const DETAIL_PHRASE_WORDS = {
  label: 'settingsPanel.detail.phrase.label',
  title: 'settingsPanel.detail.phrase.title',
  gist: 'settingsPanel.detail.phrase.gist',
  outline: 'settingsPanel.detail.phrase.outline',
  sketch: 'settingsPanel.detail.phrase.sketch',
  digest: 'settingsPanel.detail.phrase.digest',
  full: 'settingsPanel.detail.phrase.full',
} as const satisfies Record<Rung, WordKey>

export const DETAIL_LEVEL_WORDS = {
  label: 'settingsPanel.detail.level.label',
  title: 'settingsPanel.detail.level.title',
  gist: 'settingsPanel.detail.level.gist',
  outline: 'settingsPanel.detail.level.outline',
  sketch: 'settingsPanel.detail.level.sketch',
  digest: 'settingsPanel.detail.level.digest',
  full: 'settingsPanel.detail.level.full',
} as const satisfies Record<Rung, WordKey>
