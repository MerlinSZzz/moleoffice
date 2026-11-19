// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Report media in a local sandbox or worktree needs a store that survives that folder. */
import { createI18n } from './i18n.ts'

export interface AReportFileReminder {
  code: 'reportFileInWorktree'
  blocks: {
    id: string
    type: 'image' | 'video' | 'audio'
    /** The path exactly as the block stores it. */
    path: string
    folder: 'sandboxes' | 'worktrees'
  }[]
  /** English for an agent. A page can name the same word by the code and fill in the block ids. */
  says: string
}

const english = createI18n('en')

/** Name every block in the reminder, without changing the report that holds them. */
export function theReportFileReminder(blocks: AReportFileReminder['blocks']): AReportFileReminder {
  return {
    code: 'reportFileInWorktree',
    blocks,
    says: english.t('report.fileReminder', { blocks: blocks.map((block) => `"${block.id}"`).join(', ') }),
  }
}
