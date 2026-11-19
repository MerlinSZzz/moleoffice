// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic commit histories in a real temporary repository. No office or remote is used. */
import {execFileSync, spawnSync} from 'node:child_process'
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {expect, it} from 'vitest'
import {probeWaitingEntries} from '../tools/merge-tool/early-conflicts.mjs'

it('warns once about an intermediate replay conflict even when the tips merge cleanly, without moving refs or files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'synthetic-replay-'))
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], {encoding:'utf8'}).trim()
  const commit = (message: string) => {git('add','-A');git('commit','-qm',message);return git('rev-parse','HEAD')}
  try {
    git('init','-qb','main');git('config','user.name','Synthetic fixture');git('config','user.email','fixture@example.invalid')
    writeFileSync(join(root,'registry.txt'),'old list\n');commit('Synthetic base')
    git('checkout','-qb','entry');writeFileSync(join(root,'registry.txt'),'split list\n');const split=commit('Synthetic intermediate split')
    writeFileSync(join(root,'registry.txt'),'old list\n');writeFileSync(join(root,'own.txt'),'entry only\n');const tip=commit('Synthetic final tree restores list')
    git('checkout','main');writeFileSync(join(root,'registry.txt'),'new main list\n');const main=commit('Synthetic main adds registry entries')
    expect(spawnSync('git',['-C',root,'merge-tree','--write-tree',main,tip]).status).toBe(0)
    const before=git('show-ref');const beforeFiles=git('status','--porcelain');const beforeText=readFileSync(join(root,'registry.txt'),'utf8')
    const sent: any[]=[];const logs: string[]=[];const remembered: string[]=[]
    const probe=(cwd: string,args: string[]) => {const r=spawnSync('git',['-C',cwd,...args],{encoding:'utf8'});return {status:r.status,stdout:r.stdout,stderr:r.stderr}}
    const check=()=>probeWaitingEntries({root,main,entries:[{id:'synthetic-entry',run:'synthetic-run',state:'judged',changeset:{adapter:'git',root,commit:tip}}],probe,notify:async(warning: any)=>sent.push(warning),remembered,remember:()=>{},log:(line: string)=>logs.push(line),tryTheRebase:()=>{throw Error('the early rebase is tried only for a conflict in migration or list files, and this one is in neither')}})
    await check();await check()
    expect(sent,logs.join('\n')).toEqual([{entry:'synthetic-entry',tip,files:['registry.txt'],commit:split,lines:[{path:'registry.txt',ranges:'1-5'}]}])
    expect(git('show-ref')).toBe(before);expect(git('status','--porcelain')).toBe(beforeFiles);expect(readFileSync(join(root,'registry.txt'),'utf8')).toBe(beforeText)
  } finally {rmSync(root,{recursive:true,force:true})}
})
