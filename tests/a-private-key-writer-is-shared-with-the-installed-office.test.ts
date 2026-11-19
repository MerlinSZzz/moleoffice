// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { accessRefusal, assertPrivateKeyStorageAvailable, writePrivateKey } from '../src/config/provider-setup/private-key.mjs'

const roots: string[] = []
const sample = 'sample_FAKE_ONLY_37491'
const other = 'sample_FAKE_ONLY_73194'
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'private-key-shared-'))
  roots.push(root)
  return { root, folder: join(root, 'private'), file: join(root, 'private', 'key') }
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const shape = { prefix: 'sample_', min: 12 }

it('saves a private file and needs explicit confirmation before replacement', () => {
  const f = fixture()
  writePrivateKey(f.file, sample, shape)
  expect(readFileSync(f.file, 'utf8') === sample).toBe(true)
  expect(lstatSync(f.folder).mode & 0o7777).toBe(0o700)
  expect(lstatSync(f.file).mode & 0o7777).toBe(0o600)
  let refusal = ''
  try { writePrivateKey(f.file, other, shape) } catch (caught) { refusal = (caught as Error).message }
  expect(refusal).toBeTruthy()
  expect(refusal).not.toBe(accessRefusal().message)
  expect(readFileSync(f.file, 'utf8') === sample).toBe(true)
  const oldInode = lstatSync(f.file).ino
  writePrivateKey(f.file, other, { ...shape, replace: true })
  expect(readFileSync(f.file, 'utf8') === other).toBe(true)
  expect(lstatSync(f.file).ino).not.toBe(oldInode)
})

it('refuses wrong shapes without including the value in the error', () => {
  const f = fixture(), wrong = 'wrong_FAKE_ONLY_34827'
  let error = ''
  try { writePrivateKey(f.file, wrong, shape) } catch (caught) { error = String(caught) }
  expect(error.length).toBeGreaterThan(0)
  expect(error.includes(wrong)).toBe(false)
  expect(existsSync(f.file)).toBe(false)
})

it('refuses unsafe folders and linked destinations even when replacing', () => {
  const f = fixture()
  writePrivateKey(f.file, sample, shape)
  chmodSync(f.folder, 0o755)
  expect(() => writePrivateKey(f.file, other, { ...shape, replace: true })).toThrow()
  chmodSync(f.folder, 0o700)
  const linked = join(f.folder, 'link')
  symlinkSync(f.file, linked)
  expect(() => writePrivateKey(linked, other, { ...shape, replace: true })).toThrow()
  expect(readFileSync(f.file, 'utf8') === sample).toBe(true)
})

it('refuses Windows before writing because private file permissions are not yet verified there', () => {
  expect(() => assertPrivateKeyStorageAvailable('win32')).toThrow(/Windows/)
  expect(() => assertPrivateKeyStorageAvailable('linux')).not.toThrow()
  expect(() => assertPrivateKeyStorageAvailable('darwin')).not.toThrow()
})

it('uses the requested language for an unsafe path refusal', () => {
  const f = fixture()
  writePrivateKey(f.file, sample, shape)
  chmodSync(f.folder, 0o755)
  let error = ''
  try { writePrivateKey(f.file, other, { ...shape, replace: true, lang: 'zh' }) } catch (caught) { error = String(caught) }
  expect(/\p{Script=Han}/u.test(error)).toBe(true)
  expect(error.includes(other)).toBe(false)
})
