// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORDS A COMPACTION IS STORED UNDER ON A RUN. Wave 13k round 46.
 *
 * tools/session-hook.mjs appends `{ at, what }` to a run's `data.compactions` when Claude Code starts a session with
 * SessionStart source "compact", and `what` is this sentence. It is plain JavaScript because that hook runs on the
 * `node` Claude Code hands it, which cannot read TypeScript; src/server/lib/after-a-compaction.ts reads it from here.
 */
export const A_COMPACTION_REPORTED_BY_CLAUDE_CODE = 'Claude Code reported a compaction (SessionStart source compact)'
