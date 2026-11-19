// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The real pinned native codec and all its runtime packages load from a copied install folder. */
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { theNoticesFor } from '../scripts/third-party-notices.mjs'
import { avatarPng } from './avatar-upload-fixtures.ts'

let folder:string
let copied:{folders:string[];packages:string[]}
beforeAll(async()=>{
  folder=mkdtempSync(join(tmpdir(),'avatar-package-test-'))
  const {copyAvatarCodecInto}=await import('../scripts/avatar-codec-in-a-bundle.mjs')
  copied=copyAvatarCodecInto(folder)
},60_000)
afterAll(()=>{if(folder)rmSync(folder,{recursive:true,force:true})})

describe('the native avatar codec ships with the office',()=>{
 it('pins one exact version and locks its npm-distributed native packages',()=>{
  const pkg=JSON.parse(readFileSync('package.json','utf8'))
  const lock=JSON.parse(readFileSync('package-lock.json','utf8'))
  const manifests=copied.folders.map(folder=>JSON.parse(readFileSync(join(folder,'package.json'),'utf8')))
  const installed=manifests.find(pkg=>pkg.name==='sharp')
  expect(pkg.dependencies.sharp).toBe(installed.version)
  expect(lock.packages['node_modules/sharp'].version).toBe(pkg.dependencies.sharp)
  expect(copied.packages).toContain('sharp')
  expect(copied.packages.some(p=>p.startsWith('@img/sharp-'))).toBe(true)
  expect(copied.packages.some(p=>p.startsWith('@img/sharp-libvips-'))).toBe(true)
 })
 it('loads and encodes with copied native binaries and includes every copied package in licence notices',()=>{
  const entry=createRequire(join(folder,'probe.cjs')).resolve('sharp')
  const result=execFileSync(process.execPath,['-e','const sharp=require(process.argv[1]);sharp.cache(false);sharp.concurrency(1);sharp({create:{width:2,height:2,channels:4,background:"#33669988"}}).png().toBuffer().then(b=>console.log(JSON.stringify({bytes:b.length,vips:sharp.versions.vips})))',entry],{encoding:'utf8',timeout:30_000,env:{PATH:process.env.PATH}})
  const answer=JSON.parse(result)
  expect(answer.bytes).toBeGreaterThan(0)
  expect(answer.vips).toBeTruthy()
  const notices=theNoticesFor(copied.folders)
  expect(notices.packages).toBe(copied.packages.length)
  expect(notices.text).toContain('sharp@')
  expect(notices.text).toContain('@img/sharp-libvips-')
  expect(notices.withoutAFile).toEqual([])
 },60_000)
 it('imports the packaged orchestration and returns explicit unchanged bytes with absent or unloadable native packages',()=>{
  writeFileSync(join(folder,'package.json'),JSON.stringify({type:'module'}))
  copyFileSync('src/server/lib/avatar-compression.ts',join(folder,'codec.ts'))
  // Keep the copied orchestration's real probe; only native package availability changes here.
  writeFileSync(join(folder,'os-probe.ts'),`export { osProbe } from ${JSON.stringify(resolve('src/server/lib/os-probe.ts'))}`)
  const bytes=avatarPng(50)
  writeFileSync(join(folder,'input.png'),bytes)
  const require=createRequire(import.meta.url)
  const probe='import{readFileSync,writeFileSync}from"node:fs";await import(process.argv[4]);const codec=await import(process.argv[1]);const input=readFileSync(process.argv[2]);const result=codec.compressAvatar(input,"image/png");writeFileSync(process.argv[3],JSON.stringify({disposition:result.disposition,unchanged:result.bytes.equals(input)}))'
  const run=()=>{execFileSync(process.execPath,['--import',require.resolve('tsx/esm'),'--input-type=module','-e',probe,join(folder,'codec.ts'),join(folder,'input.png'),join(folder,'result.json'),resolve('src/server/lib/resources.ts')],{encoding:'utf8',timeout:30_000,env:{PATH:process.env.PATH,MOLE_OFFICE_DB:join(folder,'fixture.db'),TSX_TSCONFIG_PATH:resolve('tsconfig.json')}});return JSON.parse(readFileSync(join(folder,'result.json'),'utf8'))}
  renameSync(join(folder,'node_modules/sharp'),join(folder,'native-disabled'))
  const absent=run()
  expect(absent.unchanged).toBe(true)
  expect(absent.disposition).toBe('codec unavailable')
  mkdirSync(join(folder,'node_modules/sharp'))
  writeFileSync(join(folder,'node_modules/sharp/package.json'),JSON.stringify({name:'sharp',main:'index.cjs'}))
  writeFileSync(join(folder,'node_modules/sharp/index.cjs'),'throw new Error("native binding cannot load")')
  expect(run()).toEqual(absent)
 },60_000)
})
