// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `TOOL_KIND` was moved byte for byte out of src/server/lib/toolset.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

export const TOOL_KIND = 'tool'
