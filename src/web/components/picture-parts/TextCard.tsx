// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13s. A picture part: a card of text, a title and a text.
import type { PartInput, TextCardData } from '@shared/picture-parts.ts'
import { PartFrame } from './PartFrame.tsx'

/** A title and a text under it, both in the reader's words, wrapped to the part's width. */
export function TextCard({ label, state }: PartInput<TextCardData>) {
  return (
    <PartFrame part="text-card" label={label} state={state} css={TEXT_CARD_CSS}>
      {(data) => (
        <div className="pp-text">
          <strong className="pp-text-title">{data.title}</strong>
          <p className="pp-text-body">{data.text}</p>
        </div>
      )}
    </PartFrame>
  )
}

export const TEXT_CARD_CSS = `
.pp-text {
  display: grid;
  gap: calc(var(--pad) / 2);
  min-inline-size: 0;
}
.pp-text-title {
  font-size: var(--fs-3);
  font-weight: var(--heading-weight);
  line-height: var(--lh-tight);
  color: var(--text);
  overflow-wrap: anywhere;
}
.pp-text-body {
  margin: 0;
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text-2);
  overflow-wrap: anywhere;
  white-space: pre-line;
}
`
