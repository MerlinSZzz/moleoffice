// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A missing throwaway cwd isolates spawn failure; no Office or service starts. */
import { afterEach, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { theFoldersThisFileMakes } from './stable-bootstrap-test-folder.ts'

const folders = theFoldersThisFileMakes()
afterEach(() => { folders.removeEveryOne() })
const implementation = new URL('../tools/stable/stable-bootstrap-processes.mjs', import.meta.url).href

it('reports a missing-cwd gate spawn once without an unhandled child error or starting a group', () => {
  const folder = folders.make('missing-cwd'), script = join(folder, 'probe.mjs')
  writeFileSync(script, `import{startGatedBootstrapGroup}from${JSON.stringify(implementation)};const owned=[];let refused=null;try{await startGatedBootstrapGroup({name:'synthetic-missing-cwd',cwd:${JSON.stringify(join(folder, 'missing-never-created'))},command:process.execPath,args:['-e','process.exit(0)'],env:{PATH:process.env.PATH,HOME:${JSON.stringify(folder)}},log:${JSON.stringify(join(folder, 'spawn.log'))},journal:{async step(name,action){return action()},append(){}},owned})}catch(error){refused=String(error.message)}await new Promise(setImmediate);process.stdout.write(JSON.stringify({refused,groups:owned.length}));\n`, { mode: 0o600 })
  const result = spawnSync(process.execPath, [script], { cwd: folder, env: { PATH: process.env.PATH, HOME: folder, TMPDIR: folder, LANG: 'C', TZ: 'UTC' }, encoding: 'utf8', timeout: 5000 })
  writeFileSync(join(folder, 'probe-result.json'), JSON.stringify({ status: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr, error: result.error?.message }, null, 2), { mode: 0o600 })
  expect(result.error).toBeUndefined(); expect(result.status, result.stderr).toBe(0)
  expect(result.stderr).not.toMatch(/Unhandled 'error' event/)
  const observed = JSON.parse(result.stdout)
  expect(observed.refused).toMatch(/spawn|could not start/i); expect(observed.groups).toBe(0)
})
