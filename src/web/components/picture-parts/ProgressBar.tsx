// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13s. A picture part: a progress bar, done out of total.
import { count, t } from '@shared/i18n.ts'
import type { PartInput, ProgressData } from '@shared/picture-parts.ts'
import { Counted } from '../home/Counted.tsx'
import { PartFrame } from './PartFrame.tsx'

/**
 * HOW MANY ARE DONE OUT OF HOW MANY IN ALL: a bar filled as far as the done part, and the two numbers in words under
 * it. With nothing in all the bar is empty and the words say 0 of 0. More done than in all fills the bar, and the words
 * still say both numbers as they are.
 */
export function ProgressBar({ label, state }: PartInput<ProgressData>) {
  return (
    <PartFrame part="progress" label={label} state={state} css={PROGRESS_BAR_CSS}>
      {({ done, total }) => (
        <div className="pp-progress">
          <span className="pp-progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
            <span className="pp-progress-fill" style={{ inlineSize: `${total > 0 ? Math.min(done / total, 1) * 100 : 0}%` }} />
          </span>
          <p className="pp-progress-words"><Counted text={t('pictureParts.doneOf', { done: count(done), total: count(total) })} /></p>
        </div>
      )}
    </PartFrame>
  )
}

export const PROGRESS_BAR_CSS = `
.pp-progress {
  display: grid;
  gap: calc(var(--pad) / 2);
  min-inline-size: 0;
}
.pp-progress-track {
  display: block;
  block-size: 0.75rem;
  background: var(--panel-2);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.pp-progress-fill {
  display: block;
  block-size: 100%;
  background: var(--st-done);
}
.pp-progress-words {
  margin: 0;
  font-size: var(--fs-2);
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
`
