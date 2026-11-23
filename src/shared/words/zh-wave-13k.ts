// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { enWave13k } from './en-wave-13k.ts'

export const zhWave13k = {
  "g7b.PipelineFlow.the_next_step_in_the_stored_order": "按这条流水线保存步骤的顺序，下一步。",
} as const satisfies { readonly [K in keyof typeof enWave13k]?: (typeof enWave13k)[K] extends string ? string : { other: string } }
