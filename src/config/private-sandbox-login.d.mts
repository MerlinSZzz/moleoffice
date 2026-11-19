// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
export const PRIVATE_LOGIN_VERSION: 1
export const PRIVATE_LOGIN_MS: number
export const PRIVATE_LOGIN_MAX_BYTES: number
export const PRIVATE_LOGIN_REASONS: readonly import('../shared/private-sandbox-login.ts').PrivateLoginReason[]
export class PrivateLoginError extends Error { reason: import('../shared/private-sandbox-login.ts').PrivateLoginReason; constructor(reason: string) }
export function privateRequestLogAddress(url: string): string
export function isPrivateLoginRequest(url: string): boolean
export function isPrivateInTheLog(url: string): boolean
