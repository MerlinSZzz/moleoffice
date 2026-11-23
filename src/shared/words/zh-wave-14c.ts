// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { enWave14c } from './en-wave-14c.ts'

// The Chinese list's place for wave 14c. It holds the Chinese for the three words of wave 14c that a page draws: one on
// the pipeline page and two on the embassy page. Its type lets it hold only keys of en-wave-14c.ts.
export const zhWave14c = {
  'pipelinePage.aBlockCameWithoutItsReason': '此流水线的一个步骤返回时没有带上它列入关注列表的原因。',
  'embassyPage.showMore': '显示更多',
  'embassyPage.readingMore': '正在读取后面的行…',
} as const satisfies { readonly [K in keyof typeof enWave14c]?: (typeof enWave14c)[K] extends string ? string : { other: string } }
