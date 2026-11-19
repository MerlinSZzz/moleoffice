// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A fallback cannot start when its switch line cannot be kept. The control socket is a stand-in. */
import { mkdirSync, mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { theRouterControlSocket } from '../src/config/provider-router.mjs'
import { theStartWhenEveryGoSlotIsUsedUp } from '../tools/provider-router-host.mjs'
import { removeThisTestFolder } from './a-test-folder.ts'

it('returns a refusal when the router cannot write the fallback line', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'go-fail-'))
  const socket = theRouterControlSocket(folder)
  mkdirSync(join(folder, '.run', '.provider-router'), { recursive: true, mode: 0o700 })
  const server = createServer((req, res) => {
    req.resume()
    if (req.method === 'GET') res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ providers: { 'opencode-go': { everyUsedUp: true, says: 'All slots reached their limits.' }, deepseek: { slots: [{ id: 'ds' }] } } }))
    else res.writeHead(500, { 'content-type': 'application/json' }).end('{}')
  })
  try {
    await new Promise<void>((done) => server.listen(socket, done))
    const result = await theStartWhenEveryGoSlotIsUsedUp({
      sandboxes: folder, agent: 'made-up-agent', runtime: 'opencode', model: 'opencode-go/model', brief: 'brief', env: { MOLE_OFFICE_PROVIDER_ROUTER: 'on' },
      ask: async (path: string) => ({ status: 200, body: { selection: path.includes('runtime=dsh')
        ? { runtime: 'dsh', model: 'deepseek/model', native: { provider: 'deepseek-official', model: 'model' }, casting: { id: 2 } }
        : { runtime: 'opencode', model: 'opencode-go/model', native: { provider: 'opencode-go', model: 'model' }, casting: { id: 1 } } } }),
    })
    expect(result).toMatchObject({ refusal: expect.any(String) })
    expect(result).not.toHaveProperty('dsh')
  } finally {
    await new Promise<void>((done) => server.close(() => done()))
    removeThisTestFolder(folder)
  }
}, 60_000)
