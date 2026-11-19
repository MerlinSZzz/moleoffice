// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'

const SOURCE = fileURLToPath(new URL('..', import.meta.url))
let root: string
let dev: string
let stable: string
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'stable-office-runtime-'))
  dev = join(root, 'development'); stable = join(root, 'stable')
  mkdirSync(dev); mkdirSync(stable)
  for (const name of ['src', 'tools', 'for-agents', 'drizzle', 'package.json', 'tsconfig.json']) cpSync(join(SOURCE, name), join(stable, name), { recursive: true })
  symlinkSync(join(SOURCE, 'node_modules'), join(stable, 'node_modules'))
  expect(spawnSync('git', ['init', '--quiet', dev]).status).toBe(0)
  expect(spawnSync('git', ['init', '--quiet', stable]).status).toBe(0)
}, 60_000)
afterAll(() => rmSync(root, { recursive: true, force: true }))

function read(paired: boolean) {
  const env: Record<string, string | undefined> = { ...process.env, HOME: join(root, 'home') }
  for (const key of Object.keys(env)) if (key.startsWith('MOLE_') || key.startsWith('VITEST')) delete env[key]
  const envFolder = paired ? dev : stable
  // Each child migrates a new fixture. No socket is taken; Fastify answers through inject.
  writeFileSync(join(envFolder, '.env'), `MOLE_OFFICE_PORT=41324\nMOLE_OFFICE_DB=data/${paired ? 'paired' : 'ordinary'}.sqlite\n${paired ? `MOLE_OFFICE_STABLE_CHECKOUT=${stable}\n` : ''}`)
  if (paired) env.MOLE_OFFICE_DEVELOPMENT_CHECKOUT = dev
  env.MOLE_OFFICE_OWNER_ID = 'fixture-owner'; env.MOLE_OFFICE_OWNER_NAME = 'Fixture Owner'
  env.MOLE_OFFICE_NO_WATCH = '1'; env.MOLE_OFFICE_MESSAGE_WORKER = 'off'
  const code = `
    const client=await import('./src/server/db/client.ts');
    const m=await import('./src/server/db/migrate.ts'); m.migrateInPlace(client.sqlite);
    const {buildApp}=await import('./src/server/index.ts');
    const built=await buildApp({production:false,webDir:'.',webAppUrl:'http://127.0.0.1:41327',logLevel:false});
    const app=built.app;
    const bound=await import('./src/server/lib/bound-address.ts');
    bound.rememberWhatThisProcessBound({address:()=>({address:'127.0.0.1',port:41324,family:'IPv4'})});
    const world=await import('./src/server/lib/world.ts');
    const health=await import('./src/server/lib/health.ts');
    const response=await app.inject({method:'GET',url:'/api/runtime'});
    const healthResponse=await app.inject({method:'GET',url:'/api/health'});
    const full=world.theWorldThisProcessIsIn();
    const wire=world.theWorldThisProcessAnswersIn();
    const wrong=health.whatIsWrongWithThisServer(full,{verdict:'fresh',staleFor:null,grace:120},41324,null);
    console.log('RESULT:'+JSON.stringify({status:response.statusCode,runtime:response.json(),health:healthResponse.json(),full,wire,wrong}));
    await app.close();client.sqlite.close();
  `
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { cwd: stable, env, encoding: 'utf8', timeout: 120_000 })
  expect(child.status, child.stdout + child.stderr).toBe(0)
  const result = child.stdout.split('\n').find(line => line.startsWith('RESULT:'))
  expect(result, child.stdout + child.stderr).toBeDefined()
  return JSON.parse(result!.slice('RESULT:'.length))
}

it('carries dev in the held world and GET /api/runtime, and is healthy on dev’s declared port', () => {
  const result = read(true)
  expect(result.status).toBe(200)
  expect(result.full.developmentCheckout).toBe(dev)
  expect(result.wire.developmentCheckout).toBe(dev)
  expect(result.runtime.developmentCheckout).toBe(dev)
  expect(result.runtime.settings.envFile).toBe(join(dev, '.env'))
  expect(result.full.database).toBe(join(dev, 'data/paired.sqlite'))
  expect(result.full.repository).toBe(stable)
  expect(result.health.ok).toBe(true)
  expect(result.wrong).toEqual([])
}, 120_000)

it('omits the development field when the setting is absent', () => {
  const result = read(false)
  expect(result.status).toBe(200)
  for (const value of [result.full, result.wire, result.runtime]) expect(value).not.toHaveProperty('developmentCheckout')
  expect(result.health.ok).toBe(true)
  expect(result.wrong).toEqual([])
}, 120_000)
