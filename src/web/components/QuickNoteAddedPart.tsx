// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT IS INSIDE A PART ADDED TO A QUICK NOTE FROM A PAGE: the line naming the page it came from, with the way back
 * there, and the copy as it was drawn on that page. The note's sheet (QuickNoteSheet.tsx) places the part and draws
 * its frame; this file draws only what is inside, so a part added from a page is drawn in one place.
 */
import { t } from '@shared/i18n.ts'
import type { QuickNoteAdded } from '@shared/kinds/quick-note.ts'
import type { SummaryBlock } from '@shared/types.ts'
import { RouteLink } from './router.tsx'
import { SummaryBlocks } from './SummaryBlocks.tsx'

export function QuickNoteAddedPart({ part }: { part: QuickNoteAdded }) {
  const { copy } = part
  return (
    <>
      <p className="qn-added-from">
        {t('quickNote.addedFrom')} <RouteLink to={part.from.address.replace(/^#/u, '')}>{part.from.name}</RouteLink>
      </p>
      {/* A WHOLE PAGE ADDED IS KEPT AS THE WAY BACK TO IT, so the line above is all of it. */}
      {copy.type === 'blocks' ? (
        <SummaryBlocks blocks={copy.blocks as unknown as SummaryBlock[]} />
      ) : copy.type === 'card' ? (
        <div className="qn-added-card">
          <strong>{copy.title}</strong>
          {copy.summary === undefined ? null : <p>{copy.summary}</p>}
        </div>
      ) : null}
    </>
  )
}
