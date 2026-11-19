// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Pure refusal boundary. No journal, reservation, signal or file writer is available here. */
import { isAbsolute, resolve, sep } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { dataFolderMoveStopScopeSchema } from '../../src/shared/stable-bootstrap-notices.ts'
import { enWave13q as words } from '../../src/shared/words/en-wave-13q.ts'

const namedHolder = holder => typeof holder === 'number' ? `process ${holder}` : `process ${holder.pid}${holder.name ? ` (${holder.name})` : ''}`
export function moveFail(code, word, options = {}) {
  let says = words[word]
  for (const [name, value] of Object.entries(options.values ?? {})) says = says.split(`{${name}}`).join(String(value))
  const error = new Error(says)
  error.code = code
  if (options.facts !== undefined) error.facts = options.facts
  throw error
}
export const inside = (root, path) => path === root || path.startsWith(root + sep)
export function requireMoveTarget(target) {
  if (typeof target !== 'string' || !isAbsolute(target) || resolve(target) !== target || /[\r\n\0]/.test(target)) moveFail('moveTargetRequired', 'move.targetRequired')
  return target
}
export function checkMoveFacts(target, f) {
  requireMoveTarget(target)
  if (!f.scope) moveFail('moveActMissing', 'move.actMissing')
  if (f.state !== 'available') moveFail('moveActUnavailable', 'move.actUnavailable')
  if (!dataFolderMoveStopScopeSchema.safeParse(f.scope).success || !isDeepStrictEqual(f.scope, f.observed) || f.scope.targetFolder !== target) moveFail('moveScopeDiffers', 'move.scopeDiffers')
  if (!f.backupExists) moveFail('moveBackupMissing', 'move.backupMissing')
  if (f.backupSha256 !== f.scope.backup.sha256) moveFail('moveBackupHashDiffers', 'move.backupHashDiffers')
  if (!f.targetEmpty) moveFail('moveTargetNotEmpty', 'move.targetNotEmpty')
  if (f.parentDevice !== f.sourceDevice) moveFail('moveDifferentFilesystem', 'move.differentFilesystem')
  if ([resolve(f.home, 'PROJECTS'), ...f.sandboxRoots, ...f.checkouts].some(root => inside(root, target)) || /(?:^|\/)sandboxes(?:\/|$)/.test(target)) moveFail('moveTargetForbidden', 'move.targetForbidden')
  if (f.foreignHolders.length) moveFail('moveForeignHolder', 'move.foreignHolder', { facts: { processes: f.foreignHolders.map(namedHolder) } })
  if ((f.unnamedLocks ?? []).length) moveFail('moveUnnamedLock', 'move.unnamedLock', { values: { locks: f.unnamedLocks.join('; ') }, facts: { locks: f.unnamedLocks } })
  if (!f.envDefinitions.length) moveFail('moveEnvMissing', 'move.envMissing')
  if (f.envDefinitions.length !== 1) moveFail('moveEnvRepeated', 'move.envRepeated')
  if (resolve(f.scope.checkout, f.envDefinitions[0]) !== f.scope.database) moveFail('moveScopeDiffers', 'move.scopeDiffers')
  return f.scope
}
