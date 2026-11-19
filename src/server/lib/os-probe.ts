// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The one installed OS probe, without importing the database-backed implementation. */
import type { OsProbe } from './resources.ts'

let installed: OsProbe | undefined

/** resources.ts installs the platform probe and keeps the process-table reader in step with it. */
export function installOsProbe(probe: OsProbe): void {
  installed = probe
}

export function osProbe(): OsProbe {
  if (installed === undefined) throw new Error('No operating-system probe has been installed for the avatar codec.')
  return installed
}
