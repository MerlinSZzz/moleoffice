// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { DEVICE_HALF_REFUSAL_CODES, IDENTITY_REFUSAL_CODES } from '@shared/refusal-codes.ts'

const identityRefusal:keyof typeof IDENTITY_REFUSAL_CODES='identityNotProved'
/** A browser that sent one half of a device key holds no key it can use, so it is led to pairing too. */
const oneHalfRefusal:keyof typeof DEVICE_HALF_REFUSAL_CODES='oneHalfOfADeviceKey'
let unpaired=false
const listeners=new Set<()=>void>()

/** Only the office's two specific identity refusals can replace the page with pairing. */
export function noteAnUnprovedIdentity(code:unknown):void {
  if((code!==identityRefusal&&code!==oneHalfRefusal)||unpaired)return
  unpaired=true
  for(const listener of listeners)listener()
}
export function thisBrowserNeedsPairing():boolean { return unpaired }
export function watchWhetherThisBrowserNeedsPairing(listener:()=>void):()=>void {
  listeners.add(listener)
  return ()=>{listeners.delete(listener)}
}
