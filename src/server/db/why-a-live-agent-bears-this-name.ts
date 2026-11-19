// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `whyALiveAgentBearsThisName` was moved byte for byte out of src/server/lib/agent-names.ts, with no change of behaviour.
 * `theNameAsCompared` was moved byte for byte out of src/server/lib/agent-names.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'

/**
 * The sentence saying which live agent already bears this name, or null because no live agent but `besidesId` does.
 * `besidesId` is the agent being renamed, so an agent may keep its own name in another case.
 */
export function whyALiveAgentBearsThisName(name: string, besidesId: string): string | null {
  const asked = theNameAsCompared(name)
  const rows = sqlite.prepare('SELECT id, handle, name FROM agents WHERE retired = 0 AND id <> ?').all(besidesId) as {
    id: string
    handle: string
    name: string
  }[]
  const bearer = rows.find((row) => theNameAsCompared(row.name) === asked)
  if (bearer === undefined) return null
  return (
    `The live agent "${bearer.name}" (${bearer.handle}) already bears the name "${name.trim()}". Two live agents never share ` +
    'one name, and names that differ only in case or spacing count as one.'
  )
}
/**
 * A name as two names are compared: in Unicode's compatibility form, trimmed, with each run of spaces one space, and in
 * lower case. So "Keel", "keel" and "Ｋｅｅｌ" are one name to this rule; the name is stored as it was written.
 */
export function theNameAsCompared(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()
}
