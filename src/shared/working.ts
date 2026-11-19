// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT HOME'S AGENTS AT WORK MAY ASK THE ROSTER DOOR FOR, shared by the door and the page so the two cannot disagree.
 *
 * Round 31b of wave 13k: a group Home opens reads the doing lines of its own agents,
 * `GET /api/working?shape=home&doing=<id>,<id>` (src/server/api/working.ts). The door refuses more ids than this
 * at once, and the page asks a larger group in reads of at most this many (src/web/components/home/AgentGroups.tsx).
 *
 * A HUNDRED, because a group on an office of the live shape holds about thirty agents (tests/an-office-of-the-live-shape.ts)
 * and the person's largest starter had about forty, so one opening is one read; and a hundred ids of twelve letters is a
 * query of about 1.3 KB, well inside what a browser and the server take in one line.
 */
export const DOING_ASKED_AT_ONCE = 100

/**
 * THE SHAPE OF AN AGENT RECORD'S ID THE DOOR TAKES: the letters a record id is made of (nanoid's), one to sixty-four
 * of them. Anything else in the list is refused by the query's own shape, not looked up.
 */
export const AGENT_ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/
