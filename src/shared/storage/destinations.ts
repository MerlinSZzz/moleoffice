// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { z } from 'zod'
export const DESTINATION_SETTING = 'storage:destinations'
export const DESTINATION_MAX = 32
export const DEFAULT_UPLOAD_POLICY = Object.freeze({core:true,secretaries:true,supervisors:true,workers:false,runHistory:false,changeLog:false,apiLog:false,reports:true,text:true,pictures:false,videos:false,other:false,thresholdMB:25})
export const DEFAULT_DESTINATION_LIMIT_BYTES = 1_000_000_000
const text = z.string().max(2048).refine(value => !/[\r\n\0]/.test(value))
const absolute = text.min(1).refine(value => /^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(value) && !value.includes('://'))
/** The server's root only: a path would be a second place the bucket's keys could start. */
const endpoint = text.url().refine(value => {
  try { const u=new URL(value); return ['https:','http:'].includes(u.protocol) && !u.username && !u.password && !u.search && !u.hash && u.pathname==='/' }
  catch { return false }
})
/** Required and never guessed: a request signed for the wrong region is refused by the server. */
const region = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/)
/** Empty, or plain parts joined by single slashes with an optional slash at the end. */
const prefix = z.string().max(2048).refine(value => value==='' || value.replace(/\/$/,'').split('/').every(part => /^[A-Za-z0-9._-]+$/.test(part) && part!=='.' && part!=='..'))
export const uploadPolicyShape = z.strictObject({
  core:z.literal(true).default(DEFAULT_UPLOAD_POLICY.core),secretaries:z.boolean().default(DEFAULT_UPLOAD_POLICY.secretaries),supervisors:z.boolean().default(DEFAULT_UPLOAD_POLICY.supervisors),workers:z.boolean().default(DEFAULT_UPLOAD_POLICY.workers),
  runHistory:z.boolean().default(DEFAULT_UPLOAD_POLICY.runHistory),changeLog:z.boolean().default(DEFAULT_UPLOAD_POLICY.changeLog),apiLog:z.boolean().default(DEFAULT_UPLOAD_POLICY.apiLog),
  reports:z.boolean().default(DEFAULT_UPLOAD_POLICY.reports),text:z.boolean().default(DEFAULT_UPLOAD_POLICY.text),pictures:z.boolean().default(DEFAULT_UPLOAD_POLICY.pictures),videos:z.boolean().default(DEFAULT_UPLOAD_POLICY.videos),other:z.boolean().default(DEFAULT_UPLOAD_POLICY.other),
  thresholdMB:z.number().int().min(1).max(1_000_000).default(DEFAULT_UPLOAD_POLICY.thresholdMB),
})
const common={
  name:z.string().regex(/^[a-z][a-z0-9-]{0,47}$/).refine(value=>value!=='vault'),
  policy:uploadPolicyShape.default(DEFAULT_UPLOAD_POLICY),limitBytes:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),enabled:z.boolean(),
}
export const destinationShape = z.discriminatedUnion('kind',[
  z.strictObject({...common,kind:z.literal('folder'),target:z.strictObject({path:absolute})}),
  z.strictObject({...common,kind:z.literal('s3'),target:z.strictObject({endpoint,bucket:z.string().regex(/^[a-z0-9][a-z0-9.-]{0,62}$/),region,prefix})}),
  z.strictObject({...common,kind:z.literal('ssh'),target:z.strictObject({host:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9.:-]{0,252}$/),port:z.number().int().min(1).max(65535),user:z.string().regex(/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,63}$/),path:absolute})}),
])

export type Destination = z.infer<typeof destinationShape>
export type UploadPolicy = z.infer<typeof uploadPolicyShape>
export function destinationWarningBytes(limitBytes: number): number { return limitBytes * 0.8 }
