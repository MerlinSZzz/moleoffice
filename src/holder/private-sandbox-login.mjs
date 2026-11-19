// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { randomBytes } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { theProcessAt } from '../config/session-process.mjs'
import { PRIVATE_LOGIN_VERSION, PRIVATE_LOGIN_MS, PRIVATE_LOGIN_MAX_BYTES, PrivateLoginError } from '../config/private-sandbox-login.mjs'

/**
 * A private operation owns its parser, native process and input. There is no terminal, screen, watcher,
 * serializer, retained line or generic typing object here. Adapter installation is trusted host code;
 * neither the holder protocol nor any setting can supply an executable, parser or storage destination.
 */
export function createPrivateLogin({ adapter = null, pool = null, now = Date.now, schedule = (fn, ms) => { const timer = setTimeout(fn, ms); timer.unref?.(); return () => clearTimeout(timer) } } = {}) {
  const self = theProcessAt(process.pid)
  const holderGroup = self.here ? self.pgid : null
  const attempts = new Map()
  const bindings = new Map()
  let active = null
  let unknown = false
  let closed = false
  let pending = Promise.resolve()
  const available = () => !closed && holderGroup !== null && process.platform === 'linux' && adapter?.version === PRIVATE_LOGIN_VERSION && isAbsolute(adapter.executable ?? '') &&
    Array.isArray(adapter.args) && adapter.args.every(arg => typeof arg === 'string') &&
    ['protocol', 'callback', 'storageIsolation', 'dumpPrevention', 'ownerWatch'].every(key => adapter.verified?.[key] === true) &&
    Array.isArray(adapter.allowedSignInOrigins) && adapter.allowedSignInOrigins.length > 0 &&
    typeof adapter.start === 'function' && typeof adapter.createParser === 'function' && pool?.available() === true
  const capability = () => ({ version: PRIVATE_LOGIN_VERSION, available: available(), code: available() && adapter.verified.code === true })
  const safe = a => ({ attempt: a.id, generation: a.generation, deadline: a.deadline, state: a.state, canOpen: a.state === 'waiting' && a.url !== null, code: a.state === 'waiting' && a.wantsCode && !a.usedCode && adapter.verified.code === true, ...(a.reason ? { reason: a.reason } : {}), ...(a.result ?? {}) })
  const cleanupProcess = a => {
    const child = a.child
    if (!child || a.cleaned) return
    a.cleaned = true
    try { if (holderGroup !== null && child.pgid > 1 && child.pgid !== holderGroup && child.pgid !== process.pid && Number.isSafeInteger(child.pgid) && typeof child.identity === 'string' && child.identity.length > 0 && child.matchesIdentity(child.pgid, child.identity) === true) child.signalGroup(child.pgid, 'SIGTERM') } catch {}
    try { child.clear() } catch {}
    try { child.disposeScratch() } catch {}
    a.child = null
  }
  const clear = a => {
    if (a.token) a.token.fill(0)
    a.token = null; a.url = null; a.wantsCode = false
    try { a.parser?.clear() } catch {}
    a.parser = null
    cleanupProcess(a)
    a.stopTimer?.()
  }
  const end = (a, reason) => {
    if (a.state === 'saving') {
      a.state = 'unknown'; a.reason = 'PoolUnknown'; unknown = true; a.abort.abort(); a.savingToken?.fill(0); clear(a); if (active === a) active = null; return
    }
    if (a.state !== 'waiting') return
    a.abort.abort()
    a.state = reason === 'Cancelled' ? 'cancelled' : 'refused'; a.reason = reason
    clear(a)
    if (active === a) active = null
  }
  const expire = () => { if (active && now() >= active.deadline) end(active, 'Expired') }
  const bound = ref => {
    expire()
    const a = attempts.get(ref.attempt)
    if (ref.version !== PRIVATE_LOGIN_VERSION || !a || a.binding !== ref.binding || a.generation !== ref.generation) throw new PrivateLoginError('Binding')
    return a
  }
  const live = ref => { const a = bound(ref); if (a.state !== 'waiting') throw new PrivateLoginError(a.reason === 'Expired' ? 'Expired' : 'Binding'); return a }
  const event = (a, e) => {
    if (a.state !== 'waiting') return
    if (!e || typeof e !== 'object' || Object.keys(e).sort().join(',') !== ({'sign-in':'type,url',code:'type',token:'type,value',declined:'type'}[e.type] ?? '')) throw new PrivateLoginError('Unsupported')
    if (e.type === 'sign-in' && typeof e.url === 'string' && a.url === null && !a.opened && e.url.length <= 4096) {
      const url = new URL(e.url)
      if (url.protocol !== 'https:' || url.username || url.password || url.hash || !adapter.allowedSignInOrigins.includes(url.origin)) throw new PrivateLoginError('Unsupported')
      a.url = url.href
    } else if (e.type === 'code' && adapter.verified.code === true && !a.usedCode && !a.wantsCode) a.wantsCode = true
    else if (e.type === 'token' && typeof e.value === 'string' && !a.token && e.value.length > 0 && e.value.length <= 8192 && !/[\x00-\x20\x7f]/.test(e.value)) a.token = Buffer.from(e.value)
    else if (e.type === 'declined') end(a, 'Cancelled')
    else throw new PrivateLoginError('Unsupported')
  }
  const output = (a, channel, bytes) => {
    expire()
    if (a.state !== 'waiting') return
    if (!a.child) { end(a, 'Unsupported'); return }
    let chunk
    try {
      if (!['stdout','stderr'].includes(channel) || !(bytes instanceof Uint8Array)) throw new PrivateLoginError('Unsupported')
      a.bytes += bytes.byteLength
      if (a.bytes > PRIVATE_LOGIN_MAX_BYTES) throw new PrivateLoginError('Unsupported')
      chunk = Buffer.from(bytes)
      // This is the first and only raw-output destination; the installed parser is private and bounded.
      const events = a.parser.feed(channel, chunk)
      if (!Array.isArray(events) || events.length > 16) throw new PrivateLoginError('Unsupported')
      for (const e of events) event(a, e)
    } catch { end(a, 'Unsupported') } finally { chunk?.fill(0) }
  }
  const exit = (a, code) => {
    expire()
    if (a.state !== 'waiting') return
    if (code !== 0 || !a.token || !a.child) { end(a, 'Unsupported'); return }
    a.state = 'saving'; a.url = null; a.wantsCode = false
    // Saving is irreversible once handed to the host writer. Cancel reports saving/added/unknown.
    const token = a.token; a.token = null; a.savingToken = token
    cleanupProcess(a)
    try { a.parser?.clear() } catch {}
    a.parser = null
    pending = (async () => {
      try {
        const result = await untilAbort(a, pool.add(token, { deadline: a.deadline, signal: a.abort.signal }))
        if (a.state !== 'saving') return
        if (!/^[A-Z]$/.test(result?.letter ?? '') || !/^[a-f0-9]{12}$/.test(result?.sha12 ?? '')) throw new PrivateLoginError('PoolUnknown')
        a.result = { letter: result.letter, sha12: result.sha12 }; a.state = 'added'
      } catch (err) {
        if (a.state !== 'saving') return
        const reason = ['PoolUnsafe','PoolChanged','PoolUnsaved','PoolDuplicate','PoolFull'].includes(err?.reason) ? err.reason : 'PoolUnknown'
        a.reason = reason; a.state = reason === 'PoolUnknown' ? 'unknown' : 'refused'
        if (a.state === 'unknown') unknown = true
      } finally { token.fill(0); a.savingToken = null; clear(a); if (active === a) active = null }
    })()
  }
  const untilAbort = (a, promise) => new Promise((resolve, reject) => {
    const aborted = () => reject(new PrivateLoginError(a.state === 'saving' ? 'PoolUnknown' : 'Expired'))
    if (a.abort.signal.aborted) { aborted(); return }
    a.abort.signal.addEventListener('abort', aborted, { once: true })
    Promise.resolve(promise).then(resolve, reject).finally(() => a.abort.signal.removeEventListener('abort', aborted))
  })
  const service = {
    capability, expire,
    async start(ref) {
      expire()
      if (ref.version !== PRIVATE_LOGIN_VERSION || !available()) throw new PrivateLoginError('Unavailable')
      if (!/^[a-f0-9]{64}$/.test(ref.binding ?? '') || !/^[a-f0-9]{32}$/.test(ref.generation ?? '') || !/^[a-f0-9]{32}$/.test(ref.nonce ?? '')) throw new PrivateLoginError('Shape')
      if (unknown) throw new PrivateLoginError('PoolUnknown')
      const earlier = bindings.get(ref.binding)
      if (earlier) {
        if (earlier.state === 'waiting' && earlier.nonce === ref.nonce && earlier.generation === ref.generation) return safe(earlier)
        throw new PrivateLoginError(earlier.state === 'waiting' ? 'Busy' : 'Binding')
      }
      if (active || attempts.size >= 1024) throw new PrivateLoginError('Busy')
      const a = { id: randomBytes(16).toString('hex'), binding: ref.binding, generation: ref.generation, nonce: ref.nonce, deadline: now() + PRIVATE_LOGIN_MS, state: 'waiting', url: null, token: null, wantsCode: false, usedCode: false, opened: false, bytes: 0, child: null, parser: null, cleaned: false, abort: new AbortController(), savingToken: null }
      attempts.set(a.id, a); bindings.set(a.binding, a); active = a
      a.stopTimer = schedule(() => end(a, 'Expired'), PRIVATE_LOGIN_MS)
      try {
        a.parser = adapter.createParser()
        const launched = adapter.start({ executable: adapter.executable, args: [...adapter.args], deadline: a.deadline, signal: a.abort.signal, environment: Object.freeze({}), output: (channel, bytes) => output(a, channel, bytes), exit: code => exit(a, code), error: () => end(a, 'Unsupported'), disconnected: () => end(a, 'Cancelled') })
        Promise.resolve(launched).then(child => {
        a.child = child
        if (!child || !Number.isSafeInteger(child.pgid) || child.pgid <= 1 || child.pgid === holderGroup || child.pgid === process.pid || typeof child.identity !== 'string' || child.identity.length === 0 || !['matchesIdentity','signalGroup','disposeScratch','clear','writeCode'].every(key => typeof child[key] === 'function')) end(a, 'Unsupported')
        if (a.state === 'waiting' && child.matchesIdentity(child.pgid, child.identity) !== true) end(a, 'Unsupported')
        if (a.state !== 'waiting') cleanupProcess(a)
        }).catch(() => end(a, 'Unsupported'))
      } catch { end(a, 'Unsupported') }
      return safe(a)
    },
    status(ref) { return safe(bound(ref)) },
    signIn(ref) { const a = live(ref); if (!a.url || a.opened) throw new PrivateLoginError('Binding'); const url = a.url; a.url = null; a.opened = true; return { url } },
    async code(ref) {
      const a = bound(ref)
      if (a.state !== 'waiting') throw new PrivateLoginError(a.reason === 'Expired' ? 'Expired' : 'Binding')
      if (!adapter.verified.code || !a.wantsCode || a.usedCode) throw new PrivateLoginError('InputUsed')
      if (typeof ref.code !== 'string' || ref.code.length < 1 || ref.code.length > 1024 || /[\x00-\x20\x7f]/.test(ref.code)) throw new PrivateLoginError('Shape')
      a.usedCode = true; a.wantsCode = false
      try { await untilAbort(a, a.child.writeCode(ref.code)) } catch { end(a, 'Unsupported') } finally { delete ref.code }
      return safe(a)
    },
    cancel(ref) { const a = bound(ref); if (a.state === 'waiting') end(a, 'Cancelled'); return safe(a) },
    disconnect(ref) { end(bound(ref), 'Cancelled') },
    close() { closed = true; if (active) end(active, 'Cancelled') },
    settled() { return pending },
    async handle(request) {
      try {
        const op = request.op
        if (op === 'privateLoginCapability') return capability()
        if (op === 'privateLoginStart') return await service.start(request)
        if (op === 'privateLoginStatus') return service.status(request)
        if (op === 'privateLoginSignIn') return service.signIn(request)
        if (op === 'privateLoginCode') return await service.code(request)
        if (op === 'privateLoginCancel') return service.cancel(request)
        if (op === 'privateLoginDisconnect') { service.disconnect(request); return { disconnected: true } }
        throw new PrivateLoginError('Shape')
      } catch (err) { throw new PrivateLoginError(err instanceof PrivateLoginError ? err.reason : 'Unsupported') }
    },
  }
  return service
}
