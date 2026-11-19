// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
import { currentMode } from '../../lib/mode.ts'
import { projectName } from '../../lib/projects.ts'

/** G8: a missing project title does not expose its identifier in normal presentation. */
export function planProjectName(id: string, title?: string | null): string {
  return title || currentMode() === 'inspect' ? projectName(id, title) : t('absence.mark')
}
