// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { content, LANGUAGES, t } from '@shared/i18n.ts'
import type { HandbookRead } from '@shared/handbooks.ts'
import { handbookStateKey } from '../pages/HandbookPage.tsx'
import { handbookPath, RouteLink } from './router.tsx'

/**
 * THE HANDBOOKS HUNG ON ONE ROLE CARD, as one line under the card's How it works on the Role cards page. Each links to its own
 * page and says where it stands and the languages it is written in, because a draft and a retired one are listed too and
 * only one in use is sent to an agent that takes the card. A card with none draws nothing.
 */
export function TheHandbooksOnACard({ handbooks }: { handbooks: readonly HandbookRead[] }) {
  if (handbooks.length === 0) return null
  return (
    <p className="rol-handbooks" data-handbooks-on-the-card="">
      <style href="mole-office-handbooks-on-a-card" precedence="default">
        {CSS}
      </style>
      <span className="rol-key">{t('handbookPage.onACard.label')}</span>{' '}
      {handbooks.map((handbook, i) => (
        <span key={handbook.id} className="rol-handbook" data-state={handbook.state ?? 'unknown'}>
          {i === 0 ? null : '; '}
          <RouteLink to={handbookPath(handbook.id)}>{content(handbook.title)}</RouteLink>{' '}
          <span className="rol-handbook-facts">
            {t(handbookStateKey(handbook.state))} ·{' '}
            {handbook.languages.length === 0 ? t('handbookPage.onACard.noText') : handbook.languages.map((one) => LANGUAGES[one]).join(', ')}
          </span>
        </span>
      ))}
    </p>
  )
}

const CSS = `
.rol-handbooks { margin: 0; font-size: var(--fs-2); color: var(--text); overflow-wrap: anywhere; }
.rol-handbook-facts { color: var(--text-2); font-size: var(--fs-1); }
`
