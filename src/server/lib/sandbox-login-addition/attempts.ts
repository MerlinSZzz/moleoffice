// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createHash, randomBytes } from 'node:crypto'
import { PrivateLoginError, PRIVATE_LOGIN_VERSION, PRIVATE_LOGIN_REASONS } from '../../../config/private-sandbox-login.mjs'

export interface PrivateLoginContext { person: boolean; permittedReach: boolean; owner: string; device: string; session: string }
type Action = 'capability' | 'start' | 'status' | 'sign-in' | 'code' | 'cancel' | 'disconnect'
const operations: Record<Action, string> = { capability: 'privateLoginCapability', start: 'privateLoginStart', status: 'privateLoginStatus', 'sign-in': 'privateLoginSignIn', code: 'privateLoginCode', cancel: 'privateLoginCancel', disconnect: 'privateLoginDisconnect' }

/** A server restart invalidates the interactive generation. No raw stream or authorization is reattached. */
export function privateLoginDoors({ transport, generation = randomBytes(16).toString('hex'), allowedOrigins = [] }: { transport: (request: Record<string, unknown>) => Promise<Record<string, any>>; generation?: string; allowedOrigins?: readonly string[] }) {
  return {
    generation,
    async act(action: Action, context: PrivateLoginContext, headers: Record<string, unknown>, body: unknown, attempt?: string): Promise<any> {
      if (!context.person || !context.permittedReach) throw new PrivateLoginError('Person')
      const origin = headers['origin']
      if (typeof origin !== 'string' || !allowedOrigins.includes(origin)) throw new PrivateLoginError('Binding')
      const view = headers['x-private-login-binding']
      if (typeof view !== 'string' || !/^[a-f0-9]{32}$/.test(view) || !context.device || !context.session) throw new PrivateLoginError('Binding')
      if (action !== 'capability' && headers['x-private-login-generation'] !== generation) throw new PrivateLoginError('Binding')
      const binding = createHash('sha256').update(JSON.stringify([context.owner, context.device, context.session, origin, view])).digest('hex')
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new PrivateLoginError('Shape')
      const fields = body as Record<string, unknown>
      const keys = Object.keys(fields)
      if (action === 'start') {
        if (keys.length !== 1 || typeof fields['nonce'] !== 'string' || !/^[a-f0-9]{32}$/.test(fields['nonce'])) throw new PrivateLoginError('Shape')
      } else if (action === 'code') {
        if (keys.length !== 1 || typeof fields['code'] !== 'string' || fields['code'].length < 1 || fields['code'].length > 1024 || /[\x00-\x20\x7f]/.test(fields['code'])) throw new PrivateLoginError('Shape')
      } else if (keys.length !== 0) throw new PrivateLoginError('Shape')
      if (!['capability','start'].includes(action) && !/^[a-f0-9]{32}$/.test(attempt ?? '')) throw new PrivateLoginError('Binding')
      if (action === 'start' || action === 'capability') {
        let capability
        try { capability = await transport({ op: operations.capability, version: PRIVATE_LOGIN_VERSION }) } catch { capability = null }
        if (action === 'capability') return { version: PRIVATE_LOGIN_VERSION, available: capability?.version === PRIVATE_LOGIN_VERSION && capability.available === true, code: capability?.version === PRIVATE_LOGIN_VERSION && capability.available === true && capability.code === true, generation }
        if (capability?.version !== PRIVATE_LOGIN_VERSION || capability.available !== true) throw new PrivateLoginError('Unavailable')
      }
      try {
        const answer = await transport({ op: operations[action], version: PRIVATE_LOGIN_VERSION, binding, generation, ...(attempt ? { attempt } : {}), ...fields })
        if (action === 'sign-in') {
          if (typeof answer['url'] !== 'string' || answer['url'].length > 4096) throw new PrivateLoginError('Unsupported')
          const url = new URL(answer['url'])
          if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new PrivateLoginError('Unsupported')
          return { url: url.href }
        }
        if (action === 'disconnect') return { disconnected: answer['disconnected'] === true }
        if (!/^[a-f0-9]{32}$/.test(answer['attempt'] ?? '') || answer['generation'] !== generation || !Number.isFinite(answer['deadline']) || answer['deadline'] <= 0 || !['waiting','saving','added','cancelled','refused','unknown'].includes(answer['state'])) throw new PrivateLoginError('Unsupported')
        const reason = answer['reason']
        if (reason !== undefined && !PRIVATE_LOGIN_REASONS.includes(reason)) throw new PrivateLoginError('Unsupported')
        if (answer['state'] === 'added' && (!/^[A-Z]$/.test(answer['letter'] ?? '') || !/^[a-f0-9]{12}$/.test(answer['sha12'] ?? ''))) throw new PrivateLoginError('Unsupported')
        return { attempt: answer['attempt'], generation, deadline: answer['deadline'], state: answer['state'], canOpen: answer['state'] === 'waiting' && answer['canOpen'] === true, code: answer['state'] === 'waiting' && answer['code'] === true, ...(reason === undefined ? {} : { reason }), ...(answer['state'] === 'added' ? { letter: answer['letter'], sha12: answer['sha12'] } : {}) }

      } catch (err) { throw err instanceof PrivateLoginError ? err : new PrivateLoginError('Unsupported') }
    },
  }
}
