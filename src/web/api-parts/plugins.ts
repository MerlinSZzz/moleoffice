// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13y, pages and speed. The browser's doors to the plugin slot. Wave 13y's round 68 moved them here out
// of the one `api` object in src/web/api.ts; a line adds its new doors to its own part, and src/web/api-parts/join.ts
// joins every part into `api`.
import { request } from '../api.ts'

export const pluginsDoors = {

  /** The plugins in the install's plugins/ folder, and whether each is switched on (wave 13x round 14). */
  plugins: () => request<import('@shared/plugins.ts').PluginsReading>('/api/plugins'),

  /** Switch one plugin on or off, or take the choice away with null. The reply is the plugin as it now stands. */
  switchAPlugin: (id: string, on: boolean | null) =>
    request<import('@shared/plugins.ts').PluginReading>(`/api/plugins/${encodeURIComponent(id)}/switch`, {
      method: 'POST',
      body: JSON.stringify({ on }),
    }),
}
