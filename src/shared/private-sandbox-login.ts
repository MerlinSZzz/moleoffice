// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Only fixed states and pool fingerprints may survive a private operation. */
export type PrivateLoginReason = 'Unavailable' | 'Busy' | 'Unsupported' | 'Expired' | 'Binding' | 'InputUsed' | 'Cancelled' | 'PoolUnsafe' | 'PoolChanged' | 'PoolUnsaved' | 'PoolUnknown' | 'PoolFull' | 'PoolDuplicate' | 'Person' | 'Shape'
export interface PrivateLoginCapability { version: 1; available: boolean; code: boolean; generation?: string }
export interface PrivateLoginState {
  attempt: string
  generation: string
  deadline: number
  state: 'waiting' | 'saving' | 'added' | 'cancelled' | 'refused' | 'unknown'
  canOpen: boolean
  code: boolean
  reason?: PrivateLoginReason
  letter?: string
  sha12?: string
}
export interface PrivateLoginReference { binding: string; generation: string; attempt: string }

/** The private route family. Registration and boundary inventories read these paths once. */
export const PRIVATE_LOGIN_ROUTES = [
  { method: 'GET', path: '/office/sandbox-logins/claude/capability', action: 'capability', operation: 'office.private-login-capability' },
  { method: 'POST', path: '/office/sandbox-logins/claude/attempts', action: 'start', operation: 'office.private-login-start' },
  { method: 'GET', path: '/office/sandbox-logins/claude/attempts/:attempt/status', action: 'status', operation: 'office.private-login-status' },
  { method: 'GET', path: '/office/sandbox-logins/claude/attempts/:attempt/sign-in', action: 'sign-in', operation: 'office.private-login-sign-in' },
  { method: 'POST', path: '/office/sandbox-logins/claude/attempts/:attempt/code', action: 'code', operation: 'office.private-login-code' },
  { method: 'POST', path: '/office/sandbox-logins/claude/attempts/:attempt/cancel', action: 'cancel', operation: 'office.private-login-cancel' },
  { method: 'POST', path: '/office/sandbox-logins/claude/attempts/:attempt/disconnect', action: 'disconnect', operation: 'office.private-login-disconnect' },
] as const
