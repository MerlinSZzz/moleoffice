// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createHash, randomBytes } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { PrivateLoginError, PRIVATE_LOGIN_MS } from '../../../config/private-sandbox-login.mjs'

/**
 * The installed host tool is the sole writer. This module never opens a pool directory or an active login.
 * Its trusted adapter must verify the tool, private transport and cross-file recovery before installation.
 * No installed adapter has been certified here; production constructs this with no adapter.
 */
export function privatePool({ tool = null } = {}) {
  const available = () => tool !== null && tool.version === 1 && isAbsolute(tool.executable ?? '') &&
    Array.isArray(tool.prefixArgs) && tool.prefixArgs.every(arg => typeof arg === 'string') &&
    typeof tool.by === 'string' && /^[a-zA-Z0-9 ._-]{1,100}$/.test(tool.by) &&
    ['installed', 'privateStdin', 'noDiagnostics', 'isolation', 'flock', 'recovery', 'dumpPrevention', 'ownerWatch', 'processIdentity'].every(key => tool.verified?.[key] === true) &&
    typeof tool.execute === 'function' && typeof tool.reconcile === 'function'
  const confirmed = (result, sha12) => result?.outcome === 'added' && result.confirmed === true && /^[A-Z]$/.test(result.letter ?? '') && result.sha12 === sha12
  return {
    available,
    async add(value, { deadline = Date.now() + PRIVATE_LOGIN_MS, signal } = {}) {
      if (!available()) throw new PrivateLoginError('Unavailable')
      if (signal?.aborted || !Number.isFinite(deadline) || deadline <= Date.now() || deadline > Date.now() + PRIVATE_LOGIN_MS) throw new PrivateLoginError('Expired')
      if (!Buffer.isBuffer(value) || value.length === 0 || value.length > 8192 || /[\x00-\x20\x7f]/.test(value.toString('utf8'))) throw new PrivateLoginError('PoolUnsaved')
      const sha12 = createHash('sha256').update(value).digest('hex').slice(0, 12)
      const operationId = randomBytes(16).toString('hex')
      const input = Buffer.concat([value, Buffer.from('\n')])
      let result
      const controller = new AbortController()
      let rejectBound
      const boundedEnd = new Promise((_, reject) => { rejectBound = reject })
      const stop = () => { controller.abort(); input.fill(0); rejectBound(new PrivateLoginError('PoolUnknown')) }
      const timer = setTimeout(stop, Math.max(0, Math.min(PRIVATE_LOGIN_MS, deadline - Date.now())))
      timer.unref?.()
      signal?.addEventListener('abort', stop, { once: true })
      if (signal?.aborted) stop()
      try {
        result = await Promise.race([boundedEnd, tool.execute({ executable: tool.executable, args: [...tool.prefixArgs, 'add-stdin', tool.by], input, operationId, deadline, signal: controller.signal })])
      } catch {
        // Recovery receives metadata only, never a second value copy or a second authorization.
        try { if (controller.signal.aborted) throw new PrivateLoginError('PoolUnknown'); result = await Promise.race([boundedEnd, tool.reconcile({ operationId, sha12, deadline, signal: controller.signal })]) } catch { result = null }
      } finally { input.fill(0); clearTimeout(timer); signal?.removeEventListener('abort', stop) }
      if (confirmed(result, sha12)) return { letter: result.letter, sha12 }
      if (result?.outcome === 'refused' && ['PoolUnsafe', 'PoolChanged', 'PoolUnsaved', 'PoolFull', 'PoolDuplicate'].includes(result.reason)) throw new PrivateLoginError(result.reason)
      throw new PrivateLoginError('PoolUnknown')
    },
  }
}
