// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { enWave14d } from './en-wave-14d.ts'

// The Chinese list's place for wave 14d. It holds the Chinese for the title of the settings panel's flags. Its type lets
// it hold only keys of en-wave-14d.ts.
export const zhWave14d = {
  'settingsPanel.title.chatflags': '你的旗子',
} as const satisfies { readonly [K in keyof typeof enWave14d]?: (typeof enWave14d)[K] extends string ? string : { other: string } }
