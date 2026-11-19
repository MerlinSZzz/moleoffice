// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { IDENTITY_REFUSAL_CODES } from '@shared/refusal-codes.ts'

const identityRefusal:keyof typeof IDENTITY_REFUSAL_CODES='identityNotProved'
let unpaired=false
const listeners=new Set<()=>void>()

/** Only the office's specific identity refusal can replace the page with pairing. */
export function noteAnUnprovedIdentity(code:unknown):void {
  if(code!==identityRefusal||unpaired)return
  unpaired=true
  for(const listener of listeners)listener()
}
export function thisBrowserNeedsPairing():boolean { return unpaired }
export function watchWhetherThisBrowserNeedsPairing(listener:()=>void):()=>void {
  listeners.add(listener)
  return ()=>{listeners.delete(listener)}
}
