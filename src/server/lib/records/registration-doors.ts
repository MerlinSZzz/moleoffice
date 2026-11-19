// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DOORS THROUGH WHICH AN ID BECOMES A REGISTERED AGENT: `THE_REGISTRATION_DOORS`, the list of the writing
 * routes an unregistered session may still arrive at. It was moved whole out of src/server/lib/records.ts, with
 * no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`, and every caller still imports this name
 * from records.ts.
 *
 * THIS FILE IMPORTS NOTHING FROM records.ts. The list is string literals and a type, so there is no cycle to note,
 * and no import at all is needed.
 */

/**
 * THE DOORS THROUGH WHICH AN ID BECOMES A REGISTERED AGENT.
 *
 * `whyAnUnregisteredAgentMayNotWrite` in unregistered-agent.ts is asked from `actorFrom` in src/server/lib/http.ts,
 * which every writing route passes through. The doors that MAKE an id registered cannot stand
 * behind that rule, or the id could never arrive: a session that is not registered yet has nowhere
 * else to go. This is the one list of those doors, and it is read in the one place the rule is
 * asked.
 *
 * EACH ENTRY IS THE METHOD AND THE REGISTERED PATH, and it is deliberately not a list of operations.
 * `record.write` alone would be too wide: the incident timeline, the incident closing, the notebook
 * doors and two of the records doors all declare it, and sending them through an exemption meant for
 * POST /api/records would reopen exactly the doors the inspector found. A route is named here the
 * way the router names it, so a door added tomorrow is behind the rule by default.
 *
 *   - `POST /api/records` is the second registration door when its `kind` is `agent`, and an
 *     ordinary record write for every other kind. It keeps its own kind-conditional refusal
 *     (`refuseAnUnregisteredAgentActor` in src/server/api/records.ts), which is the one that guards
 *     the other kinds; this list only lifts the blanket refusal in front of it.
 *   - `POST /api/agents/register-myself` is the door an unregistered session registers itself at.
 *   - `POST /api/agents/started` refuses an unregistered starter with its own chain sentence, which
 *     is more specific than the blanket one; this list keeps that sentence in front.
 */
export const THE_REGISTRATION_DOORS: readonly string[] = [
  'POST /api/records',
  'POST /api/agents/register-myself',
  'POST /api/agents/started',
]
