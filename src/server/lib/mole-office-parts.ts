// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A PROCESS IS TO MOLE OFFICE, JUDGED FROM ITS COMMAND LINE. THE ONE PLACE THIS IS DECIDED.
 *
 * Two readers need this judgement. src/server/lib/resources.ts uses it for the product's reports of
 * what is running. tools/stray-servers.mjs uses it to sweep the machine when no server may be
 * running at all. Both import it from here (problem zn-9EYTTt7cJ).
 *
 * ITS OWN FILE, IMPORTING NOTHING. tools/stray-servers.mjs runs under plain node, which strips the
 * types from this file when it imports it. Importing resources.ts instead would open the database.
 * So this file uses no path alias and no TypeScript that plain node cannot strip.
 */

/** The file the API server runs. */
const SERVER_ENTRY = 'src/server/index.ts'

/**
 * What a process is to Mole Office. Four parts, named for what each is to a reader.
 *
 * `the server watcher` is the process that starts the API server and starts it again when a
 * source file changes. It is worth its own name because it can be alive with no server under it,
 * which is what a dev stack looks like after its server has crashed, and calling that "the API
 * server" would report a dead server as running.
 */
export const DEV_STACK_PARTS = [
  'the API server',
  'the server watcher',
  'the browser app',
  'the dev supervisor',
] as const
export type DevStackPart = (typeof DEV_STACK_PARTS)[number]

/**
 * What this command line is to Mole Office, or null when it is nothing to do with us.
 *
 * WHOLE ARGUMENTS, NOT SUBSTRINGS. Asking whether the command line CONTAINS `src/server/index.ts`
 * identifies any script that merely mentions the path, and this repository's own tooling mentions
 * it often.
 *
 * A SHELL IS NEVER A PART. `sh -c tsx watch src/server/index.ts` is one argument to a shell, and
 * the shell is not the watcher — the process it goes on to run is, and that one is matched on its
 * own. Counting both would report two watchers where there is one.
 *
 * THE WORKING DIRECTORY IS NOT CONSULTED HERE. This says what a process IS. Whose checkout it is
 * running in is a separate question with a separate answer, and merging them is how a Vite from a
 * deleted worktree became nobody's business and was reported by nothing for two days.
 */
export function moleOfficePartOf(command: string): DevStackPart | null {
  const args = command.trim().split(/\s+/)
  const first = args[0] ?? ''
  if ((first === 'sh' || first === 'bash' || first.endsWith('/sh') || first.endsWith('/bash')) && args[1] === '-c') {
    return null
  }
  const has = (test: (arg: string) => boolean): boolean => args.some(test)
  const named = (name: string) => (arg: string): boolean => arg === name || arg.endsWith(`/${name}`)
  if (has(named(SERVER_ENTRY))) return has(named('tsx')) ? 'the server watcher' : 'the API server'
  if (has(named('vite'))) return 'the browser app'
  if (has(named('concurrently'))) return 'the dev supervisor'
  return null
}
