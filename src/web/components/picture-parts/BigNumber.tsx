// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13s. A picture part: one big number with its label and its unit.
import { count } from '@shared/i18n.ts'
import type { BigNumberData, PartInput } from '@shared/picture-parts.ts'
import { PartFrame } from './PartFrame.tsx'

/** One number, large, with its unit after it. A zero is drawn as 0, because a zero is a count somebody made. */
export function BigNumber({ label, state }: PartInput<BigNumberData>) {
  return (
    <PartFrame part="big-number" label={label} state={state} css={BIG_NUMBER_CSS}>
      {(data) => (
        <p className="pp-big">
          <b className="pp-big-value pp-num">{count(data.value)}</b>
          {data.unit === null ? null : <span className="pp-big-unit">{data.unit}</span>}
        </p>
      )}
    </PartFrame>
  )
}

export const BIG_NUMBER_CSS = `
.pp-big {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--pad);
  min-inline-size: 0;
}
.pp-big-value {
  font-size: var(--fs-6);
  line-height: var(--lh-tight);
  color: var(--text);
  overflow-wrap: anywhere;
}
.pp-big-unit {
  font-size: var(--fs-3);
  color: var(--text-2);
  overflow-wrap: anywhere;
}
`
