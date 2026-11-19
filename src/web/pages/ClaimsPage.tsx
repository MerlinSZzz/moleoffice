// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT AGENTS HAVE CLAIMED IN THIS PROJECT. Home drew it under the agents and now has a press to this page
 * .
 */
import { t } from '@shared/i18n.ts'
import { useMemo } from 'react'
import { AgentClaims, HOME_SECTIONS_CSS } from '../components/home/HomeSections.tsx'
import { useAsync } from '../components/ui.tsx'
import { useLanguage } from '../lib/language.ts'
import { readWorkspacesOnce } from '../lib/oneread.ts'
import { projectNameOn } from './HomePage.tsx'

export function ClaimsPage() {
  useLanguage()
  const [projects] = useAsync(() => readWorkspacesOnce(), [])
  const projectName = useMemo(() => projectNameOn(projects.status === 'ready' ? projects.value : null), [projects])
  return (
    <div className="page hm-away" data-away-from-home="claims">
      <style href="mole-office-home-sections" precedence="default">{HOME_SECTIONS_CSS}</style>
      {/* THE NAME, TYPED: the same words as the rail row that opens this page. */}
      <h1 className="hm-away-title" data-title-is="its-label">{t('w13w.claimsPage.title')}</h1>
      <AgentClaims projectName={projectName} />
    </div>
  )
}
