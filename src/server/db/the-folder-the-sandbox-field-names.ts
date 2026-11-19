// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theFolderTheSandboxFieldNames` was moved byte for byte out of src/server/lib/sealed-tip.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { theRowNamesTheFolder } from '../../config/sandbox-folder.mjs'
import { basename, isAbsolute } from 'node:path'
import { sqlite } from './client.ts'

/** The same reading uncounted, for a field that is not a run's own: a new run's field, held against its filer's. */
export function theFolderTheSandboxFieldNames(sandbox: unknown): string | null {
  if (typeof sandbox !== 'object' || sandbox === null || Array.isArray(sandbox)) return null
  const folder = (sandbox as Record<string, unknown>)['folder']
  const container = (sandbox as Record<string, unknown>)['container']
  if (typeof folder !== 'string' || !isAbsolute(folder) || typeof container !== 'string' || container === '') return null
  const row = sqlite.prepare('SELECT type, key, detail FROM session_resources WHERE id = ?').get(container) as { type: string; key: string; detail: string } | undefined
  if (row === undefined || row.type !== 'container' || row.key !== `mole-office-sandbox-${basename(folder)}`) return null
  return theRowNamesTheFolder(row.detail, folder) ? folder : null
}
