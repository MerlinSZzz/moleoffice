// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { STABLE_UPGRADE_HISTORY_LIMIT } from '@shared/stable-upgrade-notices.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'
import { enWave13q } from '@shared/words/en-wave-13q.ts'
import { captureStableUpgradeIdentity, fileStableUpgradeNotice, failStableUpgradeHistory, lookupStableUpgradeNotice, stableUpgradeHistory } from '../lib/stable-upgrade-notices.ts'
import { failBootstrapStopAuthority, verifyBootstrapStopAuthority, readDataFolderMoveAuthority, reserveDataFolderMoveAuthority, fileDataFolderMoveNotice, lookupDataFolderMoveNotice } from '../lib/stable-bootstrap-authority.ts'
import { readTheGateListWith } from '../lib/stable/emergency.ts'
import { fileAReceiptJudgement } from '../lib/stable/judgement.ts'
import { gatesReading } from './runtime-settings.ts'

const historyQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(STABLE_UPGRADE_HISTORY_LIMIT).default(STABLE_UPGRADE_HISTORY_LIMIT),
  before: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/).optional(),
})
const lookupQuery = z.strictObject({
  sendId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/), limit: z.coerce.number().pipe(z.literal(1)).optional(),
})

export async function stableUpgradeNoticeRoutes(app: FastifyInstance, options: { webDir: string }): Promise<void> {
  // The emergency check reads the switch through the gates door's own reading; the library cannot import it.
  readTheGateListWith(gatesReading)
  const identity = captureStableUpgradeIdentity(app, options.webDir)
  app.get('/office/bootstrap-stop-authority', route('office.bootstrap-stop-authority', 'remote', enWave13q['move.authorityReadContract']), async req => {
    const query = z.strictObject({ request: z.string().min(1).max(24000) }).safeParse(req.query)
    if (!query.success) return failBootstrapStopAuthority('bootstrapStopShapeRefused', 'Stop authority takes one request JSON query and no other options.', 400)
    let request: unknown
    try { request = JSON.parse(query.data.request) } catch {
      return failBootstrapStopAuthority('bootstrapStopShapeRefused', 'The stop authority request is not complete JSON.', 400)
    }
    if (request && typeof request === 'object' && ('action' in request && request.action === 'stop-to-move-the-data-folder' || 'scope' in request && request.scope && typeof request.scope === 'object' && 'action' in request.scope && request.scope.action === 'stop-to-move-the-data-folder')) {
      return readDataFolderMoveAuthority(workspaceOf(req), request, actorFrom(req))
    }
    return verifyBootstrapStopAuthority(workspaceOf(req), request, actorFrom(req))
  })
  app.post('/office/bootstrap-stop-authority', route('office.bootstrap-stop-authority', 'remote', enWave13q['move.authorityReserveContract']), async (req, reply) => {
    const result = reserveDataFolderMoveAuthority(workspaceOf(req), req.body, actorFrom(req))
    reply.code(201)
    return result
  })
  app.post('/office/upgrades/notice', route('office.upgrade-notice', 'remote', 'File one approved upgrade announcement or verified outcome as an original Mole Office message. Exact send-id retries return the original creation content.'), async (req, reply) => {
    if (req.body && typeof req.body === 'object' && 'kind' in req.body && req.body.kind === 'data-folder-move') {
      const result = fileDataFolderMoveNotice(workspaceOf(req), req.body, actorFrom(req), identity)
      reply.code(result.replayed ? 200 : 201)
      return result
    }
    const result = fileStableUpgradeNotice(workspaceOf(req), req.body, actorFrom(req), identity)
    reply.code(result.replayed ? 200 : 201)
    return result
  })
  app.post('/office/upgrades/judgements', route('office.upgrade-judgement', 'remote', 'Judge a whole-suite receipt that is not green: a verdict for each file that was red, not run or gave no result when run alone. Writes the judgement note, opens a problem for each file and tells the line that owns it.'), async (req, reply) => {
    const result = fileAReceiptJudgement(workspaceOf(req), req.body, actorFrom(req))
    reply.code(201)
    return result
  })
  app.get('/office/upgrades', route('office.upgrade-history', 'remote', 'Read up to 25 original upgrade announcements and their outcomes in this project. Current message edits and deletes are reported separately.'), async req => {
    const actor = actorFrom(req)
    if (req.query !== null && typeof req.query === 'object' && Object.hasOwn(req.query, 'sendId')) {
      const q = parse(lookupQuery, req.query, 'Original notice lookup options')
      return lookupDataFolderMoveNotice(workspaceOf(req), q.sendId, actor) ?? lookupStableUpgradeNotice(workspaceOf(req), q.sendId, actor)
    }
    const q = historyQuery.safeParse(req.query)
    if (!q.success) return failStableUpgradeHistory('Upgrade history takes a limit from 1 to 25 and an optional valid older cursor, with no other options.')
    return stableUpgradeHistory(workspaceOf(req), q.data.limit, q.data.before)
  })
}
