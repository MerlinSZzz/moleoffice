// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { createPrivateLogin } from '../src/holder/private-sandbox-login.mjs'
import { PRIVATE_LOGIN_VERSION, PRIVATE_LOGIN_MAX_BYTES, PRIVATE_LOGIN_MS } from '../src/config/private-sandbox-login.mjs'

afterEach(() => vi.restoreAllMocks())
const inventedToken = 'invented-subscription-marker-雪-abcdefghijklmnopqrstuvwxyz'
const inventedCode = 'invented-short-code-9173'
const binding = 'a'.repeat(64)
const generation = 'b'.repeat(32)
const nonce = 'c'.repeat(32)
const request = { version: PRIVATE_LOGIN_VERSION, binding, generation, nonce }

function stand(options: Record<string, unknown> = {}) {
  let clock = 10_000
  let callbacks: any
  const sinks: string[] = []
  const process = { pgid: 987654, identity: 'invented-process-start', matchesIdentity: vi.fn(() => true), signalGroup: vi.fn(), disposeScratch: vi.fn(), writeCode: vi.fn(), clear: vi.fn() }
  const parser = { feed: vi.fn((_channel: string, bytes: Uint8Array) => {
    buffer += Buffer.from(bytes).toString('hex')
    const all = Buffer.from(buffer, 'hex').toString('utf8')
    if (all.endsWith('\n')) { buffer = ''; return [JSON.parse(all)] }
    return []
  }), clear: vi.fn(() => { buffer = '' }) }
  let buffer = ''
  const captured: Buffer[] = []
  const pool = { available: () => true, add: vi.fn(async (value: Buffer) => { captured.push(Buffer.from(value)); return ({ letter: 'E', sha12: createHash('sha256').update(inventedToken).digest('hex').slice(0, 12) }) }) }
  const adapter = { version: 1, executable: '/invented/installed/setup', args: ['setup-token'], verified: { protocol: true, callback: true, code: true, storageIsolation: true, dumpPrevention: true, ownerWatch: true }, allowedSignInOrigins: ['https://signin.invalid'], createParser: () => parser,
    start: vi.fn(async (cb: any) => { callbacks = cb; return process }), ...options }
  const service = createPrivateLogin({ adapter, pool, now: () => clock, schedule: () => () => {}, genericSink: (s: string) => sinks.push(s) })
  const emit = (event: unknown) => callbacks.output('stdout', Buffer.from(JSON.stringify(event) + '\n'))
  return { service, adapter, pool, captured, process, parser, sinks, emit, callbacks: () => callbacks, advance: (ms: number) => { clock += ms; service.expire() } }
}

async function started(options = {}) { const h = stand(options); const state = await h.service.start(request); return { ...h, ref: { ...request, attempt: state.attempt } } }

it('has no production adapter and checks every prerequisite before starting', async () => {
  expect(createPrivateLogin().capability()).toEqual({ version: 1, available: false, code: false })
  for (const field of ['protocol', 'callback', 'storageIsolation', 'dumpPrevention', 'ownerWatch']) {
    const h = stand({ verified: { protocol: true, callback: true, code: true, storageIsolation: true, dumpPrevention: true, ownerWatch: true, [field]: false } })
    await expect(h.service.start(request)).rejects.toMatchObject({ reason: 'Unavailable' })
    expect(h.adapter.start).not.toHaveBeenCalled()
  }
  const h = stand()
  await expect(h.service.start({ ...request, version: 0 })).rejects.toMatchObject({ reason: 'Unavailable' })
  expect(h.adapter.start).not.toHaveBeenCalled()
})

it('captures every earlier fragment privately before any generic sink, on stdout and stderr', async () => {
  const leaked: string[] = []
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => { leaked.push(Buffer.from(chunk).toString('utf8')); return true }) as any)
  vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => { leaked.push(Buffer.from(chunk).toString('utf8')); return true }) as any)
  const frame = Buffer.from(JSON.stringify({ type: 'token', value: inventedToken }) + '\n')
  for (const channel of ['stdout', 'stderr']) for (let at = 1; at < frame.length; at++) {
    const h = await started()
    h.callbacks().output(channel, frame.subarray(0, at))
    expect(h.sinks).toEqual([]); expect(leaked).toEqual([])
    h.callbacks().output(channel, frame.subarray(at))
    h.callbacks().exit(0)
    await h.service.settled()
    expect(h.pool.add).toHaveBeenCalledTimes(1)
    expect(h.captured[0]).toEqual(Buffer.from(inventedToken)); expect(h.pool.add.mock.calls[0]?.[0]).toEqual(Buffer.alloc(Buffer.byteLength(inventedToken)))
    expect(h.sinks).toEqual([]); expect(leaked).toEqual([])
    const state = h.service.status(h.ref)
    expect(state).toMatchObject({ state: 'added', letter: 'E' })
    expect(JSON.stringify(state)).not.toContain('invented-')
    expect(h.process.clear).toHaveBeenCalled()
  }
})

it('makes links transient and input one-use without typing, quick input or retained lines', async () => {
  const h = await started()
  h.emit({ type: 'sign-in', url: 'https://signin.invalid/authorize?state=invented-native-state' })
  h.emit({ type: 'code' })
  expect(JSON.stringify(h.service.status(h.ref))).not.toContain('https:')
  expect(h.service.signIn(h.ref).url).toContain('signin.invalid')
  expect(() => h.service.signIn(h.ref)).toThrow()
  await h.service.code({ ...h.ref, code: inventedCode })
  expect(h.process.writeCode).toHaveBeenCalledWith(inventedCode)
  await expect(h.service.code({ ...h.ref, code: inventedCode })).rejects.toMatchObject({ reason: 'InputUsed' })
  expect(h.sinks).toEqual([])
  h.service.cancel(h.ref)
  expect(h.process.signalGroup).toHaveBeenCalledWith(987654, 'SIGTERM')
})

it('refuses stale, wrong owner, generation and reused binding before input or another native start', async () => {
  const h = await started()
  expect(await h.service.start(request)).toMatchObject({ attempt: h.ref.attempt })
  await expect(h.service.start({ ...request, nonce: 'd'.repeat(32) })).rejects.toMatchObject({ reason: 'Busy' })
  for (const changed of [{ binding: 'f'.repeat(64) }, { generation: 'f'.repeat(32) }, { attempt: 'ended' }]) {
    expect(() => h.service.status({ ...h.ref, ...changed })).toThrow()
    expect(() => h.service.cancel({ ...h.ref, ...changed })).toThrow()
    await expect(h.service.code({ ...h.ref, ...changed, code: inventedCode })).rejects.toThrow()
  }
  expect(h.process.writeCode).not.toHaveBeenCalled()
  h.advance(PRIVATE_LOGIN_MS)
  expect(h.service.status(h.ref)).toMatchObject({ state: 'refused', reason: 'Expired' })
  await expect(h.service.code({ ...h.ref, code: inventedCode })).rejects.toMatchObject({ reason: 'Expired' })
  await expect(h.service.start(request)).rejects.toMatchObject({ reason: 'Binding' })
  expect(h.adapter.start).toHaveBeenCalledTimes(1)
})

it('keeps raw native exceptions and unknown protocol out of safe errors', async () => {
  const h = await started()
  h.callbacks().error(new Error('invented-raw-error-with-secret'))
  expect(h.service.status(h.ref)).toMatchObject({ state: 'refused', reason: 'Unsupported' })
  expect(JSON.stringify(h.service.status(h.ref))).not.toContain('invented-')
  expect(h.sinks).toEqual([])
  const bad = await started()
  bad.callbacks().output('stderr', Buffer.from('\u001b[2K\runknown invented-secret\n'))
  expect(bad.service.status(bad.ref)).toMatchObject({ state: 'refused', reason: 'Unsupported' })
  expect(bad.pool.add).not.toHaveBeenCalled()
})

it('bounds long output, rejects multiple tokens and waits for successful native exit', async () => {
  for (const scenario of ['overflow', 'multiple', 'exit', 'url']) {
    const h = await started()
    if (scenario === 'overflow') h.callbacks().output('stdout', Buffer.alloc(PRIVATE_LOGIN_MAX_BYTES + 1, 65))
    if (scenario === 'multiple') { h.emit({ type: 'token', value: inventedToken }); h.emit({ type: 'token', value: inventedToken }) }
    if (scenario === 'exit') { h.emit({ type: 'token', value: inventedToken }); h.callbacks().exit(1) }
    if (scenario === 'url') h.emit({ type: 'sign-in', url: 'https://attacker.invalid/authorize' })
    await h.service.settled()
    expect(h.pool.add).not.toHaveBeenCalled()
    expect(h.service.status(h.ref).state).toBe('refused')
    expect(h.sinks).toEqual([])
  }
})

it('uses only the recorded group after identity verification and cleans late process starts', async () => {
  const h = await started()
  h.process.matchesIdentity.mockReturnValue(false)
  h.service.disconnect(h.ref)
  expect(h.process.signalGroup).not.toHaveBeenCalled()
  expect(h.process.disposeScratch).toHaveBeenCalled()
  const ordinary = { signal: vi.fn() }
  const other = await started()
  other.service.close()
  expect(other.process.signalGroup).toHaveBeenCalledTimes(1)
  expect(ordinary.signal).not.toHaveBeenCalled()
})

it('does not claim cancellation undoes a commit and never retries an unknown result', async () => {
  const h = await started()
  let finish!: (x: any) => void
  h.pool.add.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  h.emit({ type: 'token', value: inventedToken }); h.callbacks().exit(0)
  await Promise.resolve()
  expect(h.service.cancel(h.ref)).toMatchObject({ state: 'saving' })
  finish({ letter: 'E', sha12: '123456abcdef' }); await h.service.settled()
  expect(h.service.cancel(h.ref)).toMatchObject({ state: 'added', letter: 'E' })
  const uncertain = await started()
  uncertain.pool.add.mockRejectedValue(Object.assign(new Error('invented-private-error'), { reason: 'PoolUnknown' }))
  uncertain.emit({ type: 'token', value: inventedToken }); uncertain.callbacks().exit(0)
  await uncertain.service.settled()
  expect(uncertain.service.status(uncertain.ref)).toMatchObject({ state: 'unknown', reason: 'PoolUnknown' })
  await expect(uncertain.service.start({ ...request, binding: 'e'.repeat(64), nonce: 'e'.repeat(32) })).rejects.toMatchObject({ reason: 'PoolUnknown' })
  expect(uncertain.pool.add).toHaveBeenCalledTimes(1)
})

it('selects the private operation at the real holder socket and ordinary APIs cannot attach', async () => {
  const { aHolder } = await import('../src/holder/index.mjs')
  const { askTheHolder } = await import('../src/config/the-terminal-holder.mjs')
  const { mkdtempSync, rmSync } = await import('node:fs')
  const headless = (await import('@xterm/headless')).default
  const serialize = (await import('@xterm/addon-serialize')).default
  const home = mkdtempSync('/tmp/invented-private-home-')
  const h = stand()
  const pty = (await import('node-pty')).default
  const ordinaryWrite = vi.fn()
  const spawn = vi.spyOn(pty, 'spawn').mockReturnValue({ pid: 987655, write: ordinaryWrite, resize: vi.fn(), onData: vi.fn(), onExit: vi.fn() } as any)
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
  const screen = vi.spyOn(headless.Terminal.prototype, 'write')
  const snapshot = vi.spyOn(serialize.SerializeAddon.prototype, 'serialize')
  const outputBytes: string[] = []
  const output = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => { outputBytes.push(Buffer.from(chunk).toString('utf8')); return true }) as any)
  const holder = aHolder({ database: home + '/office.db', env: { HOME: home, XDG_CONFIG_HOME: home + '/c' }, privateLogin: h.service })
  try {
    await holder.listen()
    const ordinary: any = await askTheHolder(holder.socketPath, { op:'open', command:'/invented/ordinary', args:[], folder:home, project:'invented-project',cols:80,rows:24,env:{}, keeping:true })
    expect(ordinary.ok,JSON.stringify(ordinary)).toBe(true)
    screen.mockClear(); snapshot.mockClear(); output.mockClear(); outputBytes.length=0
    const hello = await askTheHolder(holder.socketPath, { op: 'hello' })
    expect(hello.understands).toContain('privateLoginV1')
    const state: any = await askTheHolder(holder.socketPath, { op: 'privateLoginStart', ...request })
    expect(state.ok).toBe(true)
    const ref = { ...request, attempt: state.attempt }
    h.emit({type:'code'})
    const accepted = await askTheHolder(holder.socketPath,{op:'privateLoginCode',...ref,code:inventedCode})
    expect(accepted.ok).toBe(true)
    expect(h.process.writeCode).toHaveBeenCalledWith(inventedCode)
    expect(ordinaryWrite).not.toHaveBeenCalled()
    for (const terminal of holder.terminals.values()) expect(JSON.stringify(terminal.typing)).not.toContain(inventedCode)
    h.callbacks().output('stdout', Buffer.from('{"type":"token","value":"invented-'))
    expect((await askTheHolder(holder.socketPath, { op: 'list' })).terminals).toEqual([expect.objectContaining({id:ordinary.terminal.id})])
    for (const op of ['watch','type','typeALine','quickInput','takeLines','resize','close']) {
      const reply = await askTheHolder(holder.socketPath, { op, terminal: state.attempt, data: inventedCode })
      expect(reply.ok, op).toBe(false)
    }
    expect(screen).not.toHaveBeenCalled(); expect(snapshot).not.toHaveBeenCalled()
    expect(outputBytes.join('')).not.toContain('invented-')
    expect(h.sinks).toEqual([])
    await askTheHolder(holder.socketPath, { op: 'privateLoginCancel', ...ref })
  } finally { for (const terminal of holder.terminals.values()) terminal.exit={code:0,signal:null}; await holder.stop(); spawn.mockRestore(); kill.mockRestore(); screen.mockRestore(); snapshot.mockRestore(); output.mockRestore(); rmSync(home, { recursive: true, force: true }) }
})

it('bounds hung saving and late completion with the original deadline; close reports unknown', async () => {
  for (const stop of ['expiry','close']) {
    const h = await started()
    let late!: (value: any) => void
    h.pool.add.mockImplementation(() => new Promise(resolve => { late = resolve }))
    h.emit({ type:'token', value: inventedToken }); h.callbacks().exit(0)
    const captured = h.pool.add.mock.calls[0]![0]!
    if (stop === 'expiry') h.advance(PRIVATE_LOGIN_MS); else h.service.close()
    await h.service.settled()
    expect(h.service.status(h.ref)).toMatchObject({ state:'unknown', reason:'PoolUnknown' })
    expect(captured).toEqual(Buffer.alloc(captured.length))
    late({letter:'E',sha12:'123456abcdef'}); await Promise.resolve()
    expect(h.service.status(h.ref)).toMatchObject({state:'unknown'})
  }
})
it('bounds a stalled protected input write and clears its owned request', async () => {
  const h = await started(); h.emit({type:'code'})
  h.process.writeCode.mockImplementation(() => new Promise(() => {}))
  const input = { ...h.ref, code: inventedCode }
  const reply = h.service.code(input)
  h.advance(PRIVATE_LOGIN_MS)
  expect(await reply).toMatchObject({state:'refused',reason:'Expired'})
  expect(Object.hasOwn(input,'code')).toBe(false)
})
it('returns bounded start progress and cleans a native process that arrives after expiry', async () => {
  let launch!: (value:any) => void
  const h = stand({start:vi.fn(() => new Promise(resolve => {launch=resolve}))})
  const state = await h.service.start(request)
  h.advance(PRIVATE_LOGIN_MS); launch(h.process); await Promise.resolve()
  expect(h.service.status({...request,attempt:state.attempt})).toMatchObject({reason:'Expired'})
  expect(h.process.signalGroup).toHaveBeenCalledTimes(1)
})
it('never signals group one, its own group, an invalid group or an empty identity', async () => {
  const { theProcessAt } = await import('../src/config/session-process.mjs')
  const self = theProcessAt(process.pid)
  for (const group of [1,0,-3,process.pid,self.here ? self.pgid : 0]) {
    const h = await started(); h.process.pgid = group ?? 0; h.service.cancel(h.ref)
    expect(h.process.signalGroup).not.toHaveBeenCalled()
  }
  const h = await started(); h.process.identity=''; h.service.cancel(h.ref)
  expect(h.process.signalGroup).not.toHaveBeenCalled()
})
it('unknown ANSI/redraw/echo/long-line fragments never reach an ordinary sink', async () => {
  for (const text of ['\u001b[2Kinvented-secret\rredraw\n','invented-echo-code\n','{"type":"progress","message":"invented-native-error"}\n','x'.repeat(1000)+'\n']) {
    const bytes = Buffer.from(text)
    for (const at of [1,2,Math.floor(bytes.length/2),bytes.length-1]) {
      const h = await started(); h.callbacks().output('stderr',bytes.subarray(0,at)); expect(h.sinks).toEqual([])
      h.callbacks().output('stderr',bytes.subarray(at)); expect(h.sinks).toEqual([])
      expect(h.pool.add).not.toHaveBeenCalled()
      expect(h.service.status(h.ref)).toMatchObject({state:'refused',reason:'Unsupported'})
    }
  }
})
it('does not authorize again or reattach a raw stream after holder or server generation restart', async () => {
  const h=await started();h.service.close()
  const replacement=stand()
  expect(()=>replacement.service.status(h.ref)).toThrow()
  expect(replacement.adapter.start).not.toHaveBeenCalled()
  expect(()=>h.service.status({...h.ref,generation:'9'.repeat(32)})).toThrow()
  expect(h.process.signalGroup).toHaveBeenCalledTimes(1)
})
