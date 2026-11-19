// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Third notice contract; the shared delivery and retained retry journal stay unchanged. */
import { dirname, join } from 'node:path'
import { announceUpgrade, finishUpgradeNotice, retryUpgradeNotice } from './stable-upgrade-notices.mjs'
import { dataFolderMoveBeforeText, dataFolderMoveNoticeRequestSchema, dataFolderMoveNoticeResultSchema, dataFolderMoveNoticeLookupSchema } from '../../src/shared/stable-bootstrap-notices.ts'
import { enWave13q } from '../../src/shared/words/en-wave-13q.ts'

const contract = { requestSchema: dataFolderMoveNoticeRequestSchema, resultSchema: dataFolderMoveNoticeResultSchema,
  lookupSchema: dataFolderMoveNoticeLookupSchema, successState: 'moved', afterFields: { kind: 'data-folder-move' },
  beforeText: a => a.notice, pendingText: enWave13q['move.noticePending'],
  outcomeFor: (result, _evidence, serving) => ({ state: result.state, database: Object.hasOwn(result, 'databaseAt') ? result.databaseAt : result.database ?? serving.database }) }

export async function withDataFolderMoveNotice(target, options) {
  let before, context, path, serving, result
  const officeRequest = options.officeRequest
  const verifyService = options.verifyService ?? (async expected => {
    const response = await fetch(`http://127.0.0.1:${expected.port}/api/health`, { signal: AbortSignal.timeout(5000) })
    const body = await response.json()
    if (!response.ok || !body.ok || body.world?.database !== expected.database || body.world?.repository !== expected.repository || body.world?.port !== expected.port) throw new Error(enWave13q['move.healthRefused'])
  })
  try {
    result = await options.execute(target, { ...options, beforeStop: async c => {
      context = c; path = join(c.recovery, 'notice.jsonl')
      serving = { database: join(c.scope.targetFolder, c.scope.database.split('/').at(-1)), repository: c.scope.checkout, port: c.scope.port }
      const request = { kind: 'data-folder-move', stage: 'before', sendId: c.sendId + '-notice-before', announcement: {
        scope: c.scope, decision: c.decision, reservation: c.reservation, evidence: c.decision, moveSendId: c.sendId, notice: dataFolderMoveBeforeText(c.scope) } }
      before = await announceUpgrade({ path, api: `http://127.0.0.1:${c.scope.port}`, request, serving, afterSendId: c.sendId + '-notice-after', timeoutMs: 15000 }, { officeRequest, contract })
      await options.beforeStop?.(c)
    } })
  } catch (error) {
    if (!before) throw error
    const noStop = error.moveStopped === false
    result = { state: noStop ? 'refused' : 'not-restored', failure: String(error.message), recovery: context.recovery,
      source: dirname(context.scope.database), target: context.scope.targetFolder, databaseAt: noStop ? context.scope.database : null, exitCode: 1 }
  }
  const finished = await finishUpgradeNotice({ path, before, result, evidence: context.decision, serving, sendId: context.sendId + '-notice-after' }, { officeRequest, verifyService, contract })
  return { ...finished, exitCode: finished.notices.state === 'pending' ? 1 : result.exitCode }
}
export function retryDataFolderMoveNotice(path, options) { return retryUpgradeNotice(path, { ...options, contract }) }
