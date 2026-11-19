// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Real art files, with synthetic fetch and decode timing. No server or browser is started. */
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/web/api.ts', () => ({ moleOfficeHeaders: () => ({}) }))
// Read the loader's external-store snapshot without mounting a component.
vi.mock('react', () => ({
  useEffect: () => {},
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
}))

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

let attributes: Map<string, string>
let heldImage: ReturnType<typeof deferred>
let heldCatalog: ReturnType<typeof deferred>
let holdCatalog: boolean
let failCatalog: boolean
let failImage: boolean
let decodingHeldImage: boolean
let assets: typeof import('../src/web/components/pixel-office/CForestAssets.ts')
let ready: typeof import('../src/web/lib/ready.ts')

const heldSprite = '/office-map/c-environments/high-rise/ground/high-rise-stone-0.png'

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  attributes = new Map()
  heldImage = deferred(); heldCatalog = deferred()
  holdCatalog = false; failCatalog = false; failImage = false; decodingHeldImage = false
  vi.stubGlobal('document', { documentElement: {
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => { attributes.set(name, value) },
    removeAttribute: (name: string) => { attributes.delete(name) },
  } })
  vi.stubGlobal('window', { location: { hash: '#/working' }, addEventListener: () => {} })
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.endsWith('/c-forest/sprites.json')) {
      if (holdCatalog) await heldCatalog.promise
      if (failCatalog) return new Response('Synthetic catalog failure', { status: 503 })
    }
    return new Response(readFileSync('public' + url, 'utf8'), { status: 200 })
  })
  vi.stubGlobal('Image', class {
    src = ''
    naturalWidth = 0
    naturalHeight = 0
    async decode() {
      if (this.src === heldSprite) {
        decodingHeldImage = true
        await heldImage.promise
        if (failImage) throw new Error('Synthetic image decode failure')
      }
      const png = readFileSync('public' + this.src)
      this.naturalWidth = png.readUInt32BE(16)
      this.naturalHeight = png.readUInt32BE(20)
    }
  })
  ready = await import('../src/web/lib/ready.ts')
  assets = await import('../src/web/components/pixel-office/CForestAssets.ts')
  ready.theShellDrewTheAddress()
  await vi.advanceTimersByTimeAsync(61)
  expect(attributes.get(ready.READY_ATTRIBUTE)).toBe('#/working')
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const mark = () => attributes.get(ready.READY_ATTRIBUTE) ?? null

describe('the Working page waits for its office art', () => {
  it('removes an existing ready mark while the catalog and then a sprite are still loading', async () => {
    holdCatalog = true
    const loading = assets.loadCForestAssets()
    expect(mark()).toBeNull()
    await vi.advanceTimersByTimeAsync(100)
    expect(mark()).toBeNull()
    heldCatalog.resolve()
    await vi.waitFor(() => expect(decodingHeldImage).toBe(true))
    await vi.advanceTimersByTimeAsync(100)
    expect(mark()).toBeNull()
    expect(assets.useCForestAssets().status).toBe('loading')
    heldImage.resolve()
    await loading
    await vi.advanceTimersByTimeAsync(61)
    expect(mark()).toBe('#/working')
    const loaded = assets.useCForestAssets()
    expect(loaded.status).toBe('ready')
    expect(Object.values(loaded.environments).every(environment => environment.status === 'ready')).toBe(true)
    expect(loaded.images.size).toBeGreaterThan(200)
    expect(loaded.errors.size).toBe(0)
  })

  it('counts concurrent callers once and holds a forced retry until its art is published', async () => {
    const loading = assets.loadCForestAssets()
    expect(assets.loadCForestAssets()).toBe(loading)
    expect(assets.loadCForestAssets(true)).toBe(loading)
    heldImage.resolve()
    await loading
    await vi.advanceTimersByTimeAsync(61)
    expect(mark()).toBe('#/working')
    await assets.loadCForestAssets()
    expect(mark()).toBe('#/working')
    heldImage = deferred(); decodingHeldImage = false
    const retry = assets.loadCForestAssets(true)
    await vi.waitFor(() => expect(decodingHeldImage).toBe(true))
    await vi.advanceTimersByTimeAsync(100)
    expect(mark()).toBeNull()
    heldImage.resolve()
    await retry
    await vi.advanceTimersByTimeAsync(61)
    expect(mark()).toBe('#/working')
  })

  it('finishes drawing an image failure with the missing art still named', async () => {
    failImage = true
    const loading = assets.loadCForestAssets()
    await vi.waitFor(() => expect(decodingHeldImage).toBe(true))
    expect(mark()).toBeNull()
    heldImage.resolve()
    await loading
    await vi.advanceTimersByTimeAsync(61)
    expect(mark()).toBe('#/working')
    const failed = assets.useCForestAssets().environments['high-rise']
    expect(failed.status).toBe('failed')
    expect(failed.missingImages).toContain('high-rise-stone-0')
    expect(assets.useCForestAssets().environments.woodland.status).toBe('ready')
  })

  it('releases readiness after a catalog failure and can load again', async () => {
    failCatalog = true
    await assets.loadCForestAssets()
    await vi.advanceTimersByTimeAsync(61)
    expect(mark()).toBe('#/working')
    expect(assets.useCForestAssets().status).toBe('failed')
    expect(assets.useCForestAssets().error).toContain('HTTP 503')
    failCatalog = false
    heldImage.resolve()
    await assets.loadCForestAssets(true)
    await vi.advanceTimersByTimeAsync(61)
    expect(mark()).toBe('#/working')
    expect(assets.useCForestAssets().status).toBe('ready')
  })
})
