// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A scan compares made-up API keys by hash, reporting their locations without disclosing them. */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'

const repo = fileURLToPath(new URL('..', import.meta.url))
const inside = join(repo, 'tools/key-router/scan-inside.mjs')
const host = join(repo, 'tools/key-router/scan.mjs')
const roots: string[] = []
const scratch = () => { const root = mkdtempSync(join(tmpdir(), 'mo-scan-')); roots.push(root); return root }
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const keys = ['made-up-env-key-8726', 'made-up-json-key-7319', 'made-up-config-key-5941', 'made-up-process-key-2184']
const marks = keys.map((key) => `sha256:${hash(key).slice(0, 12)}`)
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

it('finds made-up keys in files and readable process environments by location and mark, and reports a clean tree', () => {
  const root = scratch(), tree = join(root, 'tree'), proc = join(root, 'proc')
  mkdirSync(join(tree, 'home', '.codex'), { recursive: true })
  mkdirSync(join(tree, 'etc'), { recursive: true })
  mkdirSync(join(proc, '123'), { recursive: true })
  const files = [join(tree, 'home', 'values.env'), join(tree, 'home', '.codex', 'auth.json'), join(tree, 'etc', 'service.conf')]
  writeFileSync(files[0]!, `OPENAI_API_KEY=${keys[0]}\n`)
  writeFileSync(files[1]!, JSON.stringify({ OPENAI_API_KEY: keys[1] }))
  writeFileSync(files[2]!, `provider_key = "${keys[2]}"\n`)
  writeFileSync(join(proc, '123', 'environ'), `A_KEY=${keys[3]}\0OTHER=ordinary\0`)
  const scan = () => spawnSync(process.execPath, [inside, '--root', tree, '--proc', proc], { input: JSON.stringify(keys.map(hash)), encoding: 'utf8' })
  const found = scan()
  expect(found.status).toBe(1)
  for (const file of files) expect(found.stdout).toContain(file)
  for (const mark of marks) expect(found.stdout).toContain(mark)
  expect(found.stdout).toContain('123')
  expect(found.stdout).toContain('A_KEY')
  for (const key of keys) expect((found.stdout + found.stderr).includes(key)).toBe(false)
  for (const file of files) writeFileSync(file, 'ordinary content')
  writeFileSync(join(proc, '123', 'environ'), 'OTHER=ordinary\0')
  const clean = scan()
  expect(clean.status).toBe(0)
  expect(clean.stdout).toBe('')
})

it('hashes the slots and host secrets before passing them to the container', () => {
  const root = scratch(), folder = join(root, 'slots'), bin = join(root, 'bin')
  mkdirSync(folder, { mode: 0o700 }); mkdirSync(bin)
  const slots = join(folder, 'slots.json'), secrets = join(root, 'secrets.env'), received = join(root, 'received.json')
  writeFileSync(slots, JSON.stringify({ version: 1, slots: [{ id: 'one', provider: 'openai', label: 'One', key: keys[0] }] }), { mode: 0o600 })
  writeFileSync(secrets, `OPENAI_API_KEY=${keys[1]}\nCODEX_API_KEY=${keys[2]}\nOTHER=${keys[3]}\n`, { mode: 0o600 })
  writeFileSync(join(bin, 'docker'), `#!${process.execPath}\nlet data='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>data+=x);process.stdin.on('end',()=>require('fs').writeFileSync(${JSON.stringify(received)},JSON.stringify({args:process.argv.slice(2),data})));\n`, { mode: 0o755 })
  const ran = spawnSync(process.execPath, [host, '--slots', slots, '--secrets', secrets, '--container', 'made-up-sandbox'], { env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` }, encoding: 'utf8' })
  expect(ran.status).toBe(0)
  const sent = JSON.parse(readFileSync(received, 'utf8')) as { args: string[]; data: string }
  const hashes = JSON.parse(sent.data) as string[]
  for (const key of keys.slice(0, 3)) expect(hashes).toContain(hash(key))
  expect(hashes).not.toContain(hash(keys[3]!))
  for (const key of keys) expect((ran.stdout + ran.stderr + JSON.stringify(sent)).includes(key)).toBe(false)
})
