// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Canonical bootstrap requests with only the two agreed write shapes. */
import { z } from 'zod'
import { askTheOffice, theRunsIdentity } from '../office-request.mjs'
import {
  STABLE_BOOTSTRAP_PREPARED_TITLE, STABLE_BOOTSTRAP_PREPARED_BODY,
  stableBootstrapPreparedSchema, stableBootstrapNoticeRequestSchema,
} from '../../src/shared/stable-bootstrap-notices.ts'

export const bootstrapPreparedRecordSchema = z.strictObject({
  kind: z.literal('note'), title: z.literal(STABLE_BOOTSTRAP_PREPARED_TITLE),
  data: z.strictObject({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), body: z.literal(STABLE_BOOTSTRAP_PREPARED_BODY),
    extra: z.strictObject({ stableBootstrapPrepared: stableBootstrapPreparedSchema }) }),
})

/** A request's `longestReply` is handed to the request helper and never sent. */
export function bootstrapOfficeRequest(env, timeoutMs, dry = false) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) throw new Error('Bootstrap transport timeout must be from 1 to 15000 milliseconds.')
  const request = async (asked, destination) => {
    const { longestReply, ...input } = asked
    if (input.method !== 'GET') {
      if (dry || input.method !== 'POST') throw new Error('Dry bootstrap permits only GET; real bootstrap has two strict POST shapes.')
      if (input.path === '/api/office/upgrades/notice') stableBootstrapNoticeRequestSchema.parse(input.body)
      else if (input.path === '/api/records') bootstrapPreparedRecordSchema.parse(input.body)
      else throw new Error('Bootstrap refuses every unrelated record or operation write.')
    }
    return askTheOffice(input, {
      env: destination ? { ...env, MOLE_OFFICE_API: destination.api } : env,
      fetchImpl: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) }),
      ...(longestReply === undefined ? {} : { longestReply }),
    })
  }
  const { agent, session, workspace } = theRunsIdentity(env)
  request.identity = { agent, session, project: workspace }
  return request
}
