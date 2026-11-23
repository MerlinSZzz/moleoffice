// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW MANY AGENTS ONE ASK OF THE DOING LINES MAY NAME, shared by the door and its tests so the two cannot disagree.
 *
 * `GET /api/working?shape=home&doing=<id>,<id>` (src/server/api/working.ts) answers what the runs serving those agents
 * say they are doing. Any reader of the API may ask it. Home does not, because each row of its roster already names the
 * run serving the agent. The door refuses more ids than this at once.
 *
 * A HUNDRED, because the person's largest starter had about forty agents, so one ask names all of them; and a hundred
 * ids of twelve letters is a query of about 1.3 KB, well inside what a browser and the server take in one line.
 */
export const DOING_ASKED_AT_ONCE = 100

/**
 * THE SHAPE OF AN AGENT RECORD'S ID THE DOOR TAKES: the letters a record id is made of (nanoid's), one to sixty-four
 * of them. Anything else in the list is refused by the query's own shape, not looked up.
 */
export const AGENT_ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/
