// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE CARD PER PROJECT. Home drew the cards across its foot and now has a press to this
 * page. What waits on the person in each project is the frame's one waiting
 * reading.
 */
import { t } from '@shared/i18n.ts'
import type { AttentionHome } from '../api.ts'
import { useMemo } from 'react'
import { HOME_SECTIONS_CSS, ProjectCards } from '../components/home/HomeSections.tsx'
import { type AsyncState, useAsync } from '../components/ui.tsx'
import { useLanguage } from '../lib/language.ts'
import { readWorkspacesOnce } from '../lib/oneread.ts'
import type { WaitingReply } from '../lib/waiting.ts'
import { projectNameOn } from './HomePage.tsx'

/** `attention` is the frame's reading of the project on screen, which the cards draw rather than read again. */
export function ProjectsPage({ waiting, attention }: { waiting: AsyncState<WaitingReply>; attention: AsyncState<AttentionHome> }) {
  useLanguage()
  const [projects] = useAsync(() => readWorkspacesOnce(), [])
  const projectName = useMemo(() => projectNameOn(projects.status === 'ready' ? projects.value : null), [projects])
  return (
    <div className="page hm-away" data-away-from-home="projects">
      <style href="mole-office-home-sections" precedence="default">{HOME_SECTIONS_CSS}</style>
      {/* THE NAME, TYPED: the same words as the rail row that opens this page. */}
      <h1 className="hm-away-title" data-title-is="its-label">{t('home.projects')}</h1>
      <ProjectCards waiting={waiting} attention={attention} projects={projects} projectName={projectName} />
    </div>
  )
}
