// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { ENV_FILE, mergedEnvironment, theEnvFileSuppliedThis } from '../../config/settings.mjs'

/**
 * THE ENVIRONMENT THE INSTALLED SERVICE'S RESTART HANDS THE NEW SERVER.
 *
 * The server loads `.env` into its own environment when it starts, and that environment is what a
 * child process inherits. The restart press used to pass `mergedEnvironment({ ...process.env })`,
 * so the values `.env` had at the last start were handed to the new server. The new server reads
 * `.env` itself and does not overwrite a name that is already set: a changed value was not applied,
 * a removed name came back, and only a newly added name took effect.
 *
 * SO THE NAMES THE LAST `.env` LOAD SUPPLIED ARE LEFT OUT OF WHAT THE CHILD INHERITS, and the current
 * file is merged in their place. A name the shell set, which no `.env` load supplied, is kept as it
 * is. Stored runtime choices are not flattened into the environment here: the replacement reads its
 * own database, as the restart manager's own note says.
 *
 * `file` and `processEnv` are taken so a test can hand in a made-up `.env` and a made-up
 * environment; production calls it with neither.
 */
export function theEnvironmentTheRestartHandsTheService(
  processEnv: Record<string, string | undefined> = process.env,
  file: string = ENV_FILE,
): Record<string, string | undefined> {
  const inherited: Record<string, string | undefined> = {}
  for (const [name, value] of Object.entries(processEnv)) {
    if (!theEnvFileSuppliedThis(name, file)) inherited[name] = value
  }
  return mergedEnvironment(inherited, file)
}
