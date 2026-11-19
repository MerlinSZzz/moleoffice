// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic native programs only: selected names are generated data, never a model catalog. */
import { spawnSync } from 'node:child_process'
import { randomInt, randomUUID } from 'node:crypto'
import { THE_RUNTIMES_FAST_MODE, LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { aCommandsStartFromTheOffice, aCommandsStartValues, THE_MODELS_START_VALUES, theModelTheOfficeGives } from '../tools/sandbox-common.mjs'
import { prepareDshSettings } from '../tools/dsh-hooks/run-settings.mjs'
import { syntheticDshReader, CAPTURE_DSH_SELECTION } from './dsh-native-stand-in.ts'

const programs = { codex: 'codex', 'claude-code': 'claude', opencode: 'opencode', dsh: 'dsh' } as const
type Runtime = keyof typeof programs
function selection(runtime: Runtime) {
  const key = randomUUID()
  return { runtime, model: `office-${key}`, native: {
    model: `native-${key}`, provider: runtime === 'opencode' || runtime === 'dsh' ? `provider-${key}` : null,
    variant: null as string | null, effort: `effort-${key}` as string | null,
  }, casting: { id: 41, revision: '7' } }
}
const folders: string[] = []
afterEach(() => { vi.unstubAllGlobals(); for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })
const options = (chosen: ReturnType<typeof selection>) => ({ runtime: chosen.runtime, model: chosen.model, selection: chosen })
function captured(command: string[], env: Record<string, string>) {
  const ran = spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify({argv:process.argv.slice(1),effort:process.env.CLAUDE_CODE_EFFORT_LEVEL}))', '--', ...command.slice(1)], {
    encoding: 'utf8', timeout: 10_000, env: { PATH: process.env.PATH, ...env },
  })
  expect(ran.status, ran.stderr).toBe(0)
  return JSON.parse(ran.stdout) as { argv: string[]; effort?: string }
}

// Codex first parses TOML, then treats an invalid TOML expression as the literal string.
function parsedCodexEffort(command: string[]) {
  const field=command.find(word=>word.startsWith('model_reasoning_effort='))!
  const value=field.slice(field.indexOf('=')+1)
  const ran=spawnSync('python3',['-c','import json,sys,tomllib\ntry: value=tomllib.loads("value="+sys.argv[1])["value"]\nexcept tomllib.TOMLDecodeError: value=sys.argv[1]\nprint(json.dumps(value))',value],{encoding:'utf8',timeout:10_000})
  expect(ran.status,ran.stderr).toBe(0)
  return JSON.parse(ran.stdout) as unknown
}
function aLiteral(kind: string) {
  if(kind==='numeric') return String(randomInt(10000,99999))
  if(kind==='boolean') return String(Boolean(randomInt(0,2)))
  return `value-${String.fromCodePoint(0x4e00+randomInt(0,200),0x1f400+randomInt(0,64))}"\\-tail`
}
function parsedDshSettings(text: string): Record<string,Record<string,unknown>> {
  return new Function('text',CAPTURE_DSH_SELECTION+'\nreturn captureDshSelection(text, true)')(text)
}

describe('a complete Casting selection reaches native programs as data', () => {
  it.each(['codex', 'claude-code', 'opencode'] as const)('%s carries an unseen native model and effort, keeping the Office identity', runtime => {
    const chosen = selection(runtime)
    const given = aCommandsStartValues([programs[runtime], 'run', '--', 'synthetic prompt'], options(chosen))
    const seen = captured(given.command, given.env)
    const nativeModel = runtime === 'opencode' ? `${chosen.native.provider}/${chosen.native.model}` : chosen.native.model
    expect(seen.argv).toContain(nativeModel)
    expect(seen.argv).not.toContain(chosen.model)
    expect(given.start).toMatchObject({ model: chosen.model, native: chosen.native, selection: chosen, effort: chosen.native.effort })
    if (runtime === 'codex') expect(parsedCodexEffort(seen.argv)).toBe(chosen.native.effort)
    if (runtime === 'opencode') expect(seen.argv.slice(seen.argv.indexOf('--variant'), seen.argv.indexOf('--variant') + 2)).toEqual(['--variant', chosen.native.effort])
    if (runtime === 'claude-code') expect(seen.effort).toBe(chosen.native.effort)
    expect(given.start.fast).toBe(THE_RUNTIMES_FAST_MODE[runtime])
  })

  it.each(['numeric','boolean','unicode'])('Codex preserves a %s native effort as a string through TOML and a second handoff',kind=>{
    const chosen=selection('codex');chosen.native.effort=aLiteral(kind)
    const given=aCommandsStartValues(['codex','exec'],options(chosen))
    expect(parsedCodexEffort(given.command)).toBe(chosen.native.effort)
    const again=aCommandsStartValues(given.command,{...options(chosen),env:given.env})
    expect(parsedCodexEffort(again.command)).toBe(chosen.native.effort)
  })
  it('Codex normalizes an existing numeric-looking effort option to the selected string',()=>{
    const chosen=selection('codex');chosen.native.effort=aLiteral('numeric')
    const given=aCommandsStartValues(['codex','exec','-c','model_reasoning_effort='+chosen.native.effort],options(chosen))
    expect(parsedCodexEffort(given.command)).toBe(chosen.native.effort)
  })

  it.each(['numeric','boolean','unicode'])('DSH preserves %s native model and effort strings through its scalar parser',async kind=>{
    const chosen=selection('dsh');chosen.native.provider=Object.keys(LAUNCHER_MODEL_COMPATIBILITY.dshProviderNamespaces)[0]!
    chosen.native.model=aLiteral(kind);chosen.native.effort=aLiteral(kind)
    const folder=mkdtempSync(join(tmpdir(),'selection-scalars-'));folders.push(folder)
    const dshDir=join(folder,'dsh');mkdirSync(join(dshDir,'home'),{recursive:true})
    const original='unselected:\n  marker: '+JSON.stringify(aLiteral('unicode'))+'\n'
    writeFileSync(join(dshDir,'home/settings.yaml'),original)
    const patch=await prepareDshSettings({model:chosen.model,effort:chosen.native.effort,selection:chosen,dshDir,scratch:folder,env:{PATH:process.env.PATH,SANDBOX_DSH_NATIVE_READER:syntheticDshReader(folder)},notice:()=>true})
    const parts=JSON.parse(readFileSync(patch,'utf8')), text=readFileSync(parts[0].config.path,'utf8')
    const fields=parsedDshSettings(text)['agent-default-model']!
    expect(fields.model).toBe(chosen.native.model)
    expect(fields.reasoningEffort).toBe(chosen.native.effort)
    expect(text.startsWith(original)).toBe(true)
    expect(parts[1].config).toEqual({provider:chosen.native.provider,model:chosen.native.model})
    const proof=process.env['LAUNCHER_SELECTION_PROOF']
    if(proof) {
      mkdirSync(proof,{recursive:true})
      writeFileSync(join(proof,kind+'.yaml'),readFileSync(parts[0].config.path))
      writeFileSync(join(proof,kind+'.json'),JSON.stringify(chosen.native))
    }
  })

  it('DSH carries the unseen provider and model through the private native settings patch', async () => {
    const chosen = selection('dsh'); chosen.native.provider = 'deepseek-official'
    const folder = mkdtempSync(join(tmpdir(), 'selection-native-')); folders.push(folder)
    const dshDir = join(folder, 'dsh'); mkdirSync(join(dshDir, 'home'), { recursive: true })
    const given = aCommandsStartValues(['dsh', '--profile', 'office'], options(chosen))
    expect(given.start).toMatchObject({ model: chosen.model, native: chosen.native })
    const patch = await prepareDshSettings({ model: chosen.model, effort: chosen.native.effort, selection: chosen,
      dshDir, scratch: folder, env: { PATH: process.env.PATH, SANDBOX_DSH_NATIVE_READER: syntheticDshReader(folder) }, notice: () => true })
    const parts = JSON.parse(readFileSync(patch, 'utf8'))
    expect(parts[1].config).toEqual({ provider: chosen.native.provider, model: chosen.native.model })
    expect(parsedDshSettings(readFileSync(parts[0].config.path,'utf8'))['agent-default-model']!.reasoningEffort).toBe(chosen.native.effort)
  })

  it('OpenCode carries a selected variant independently of an absent effort', () => {
    const chosen = selection('opencode'); chosen.native.effort = null; chosen.native.variant = `variant-${randomUUID()}`
    const given = aCommandsStartValues(['opencode', 'run'], options(chosen))
    expect(given.command.slice(-2)).toEqual(['--variant', chosen.native.variant])
    expect(given.start?.effort).toBeNull()
  })

  it.each(['codex', 'claude-code', 'dsh'] as const)('%s refuses a variant its native adapter cannot carry', runtime => {
    const chosen = selection(runtime); chosen.native.variant = `variant-${randomUUID()}`
    expect(() => aCommandsStartValues([programs[runtime], 'run'], options(chosen))).toThrow(/variant.*cannot|cannot.*variant/i)
  })

  it('OpenCode refuses two distinct values for its single native variant option', () => {
    const chosen = selection('opencode'); chosen.native.variant = `different-${randomUUID()}`
    expect(() => aCommandsStartValues(['opencode', 'run'], options(chosen))).toThrow(/variant.*effort|effort.*variant/i)
  })

  it('an explicit null native effort never borrows a known model effort', () => {
    const chosen = selection('codex'); chosen.native.effort = null
    const given = aCommandsStartValues(['codex', 'exec'], options(chosen))
    expect(given.start).toMatchObject({ model: chosen.model, effort: null })
    expect(given.command.some((word: string) => word.includes('model_reasoning_effort='))).toBe(false)
  })

  it.each(['native model', 'native effort', 'row revision', 'extra field'] as const)('refuses a present malformed selection: %s', field => {
    const chosen: any = selection('codex')
    if (field === 'native model') delete chosen.native.model
    if (field === 'native effort') delete chosen.native.effort
    if (field === 'row revision') chosen.casting.revision = ''
    if (field === 'extra field') chosen.native.secret = 'synthetic value'
    expect(() => aCommandsStartValues(['codex', 'exec'], options(chosen))).toThrow(/selection/i)
  })

  it('a selection for another runtime or Office model is refused', () => {
    const chosen = selection('codex')
    expect(() => aCommandsStartValues(['codex', 'exec'], { ...options(chosen), runtime: 'opencode' })).toThrow(/runtime/i)
    expect(() => aCommandsStartValues(['codex', 'exec'], { ...options(chosen), model: `different/${chosen.model}` })).toThrow(/model/i)
  })

  it('a shell wrapper refuses the selected fields before starting', () => {
    const chosen = selection('codex')
    expect(() => aCommandsStartValues(['sh', '-c', 'synthetic command'], options(chosen))).toThrow(/shell.*cannot|cannot.*shell/i)
  })

  it('a modern Office answer is consumed without borrowing its legacy effort', async () => {
    const chosen = selection('codex')
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ model: chosen.model, effort: 'legacy-value', effortFrom: 'Casting', selection: chosen })))
    const given = await aCommandsStartFromTheOffice(['codex', 'exec'], { api: 'http://synthetic.invalid', agent: 'synthetic-agent', ...options(chosen) })
    expect(given.start).toMatchObject({ selection: chosen, effort: chosen.native.effort })
    expect(given.command).not.toContain('model_reasoning_effort=legacy-value')
  })
})

it('an unrelated provider sharing a known basename borrows neither effort nor model identity', () => {
  const known = Object.keys(THE_MODELS_START_VALUES)[0]!
  const model = 'unrelated-provider/' + known
  expect(() => aCommandsStartValues(['codex','exec'],{runtime:'codex',model})).toThrow(/complete native selection|exact legacy compatibility/i)
})

it('a semantically identical recheck accepts reordered JSON fields', async () => {
  const chosen=selection('codex')
  vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({selection:{casting:chosen.casting,native:{effort:chosen.native.effort,variant:chosen.native.variant,provider:chosen.native.provider,model:chosen.native.model},model:chosen.model,runtime:chosen.runtime}})))
  await expect(aCommandsStartFromTheOffice(['codex','exec'],{api:'http://synthetic.invalid',agent:'sample-agent',...options(chosen)})).resolves.toMatchObject({start:{model:chosen.model}})
})
it('an old Office says explicitly that native selection fields were not supplied',async()=>{
  const known=Object.keys(THE_MODELS_START_VALUES)[0]!
  vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({model:known,effort:null,effortFrom:'none'})))
  const given=await aCommandsStartFromTheOffice(['claude','-p'],{api:'http://synthetic.invalid',agent:'sample-agent',runtime:'claude-code',model:known})
  expect(given.compatibilityWords).toMatch(/legacy|older.*selection|native selection.*unavailable/i)
})
it('a present null selection from the model door is malformed rather than legacy',async()=>{
  vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({model:'sample-model',effort:null,effortFrom:'none',selection:null})))
  await expect(aCommandsStartFromTheOffice(['codex','exec'],{api:'http://synthetic.invalid',agent:'sample-agent',runtime:'codex',model:'sample-model'})).rejects.toThrow(/selection/i)
})

it('an older Office missing the selection door keeps legacy data, while a deleted selected row refuses',async()=>{
  const known=Object.keys(THE_MODELS_START_VALUES)[0]!, asked:string[]=[]
  vi.stubGlobal('fetch',async(address: string)=>{
    const path=new URL(address).pathname;asked.push(path)
    return path.includes('/selection') ? new Response(JSON.stringify({error:'Route not found'}),{status:404}) : new Response(JSON.stringify({model:known,from:'the role',says:'Synthetic older Office',casting:{id:41,scope:'every project',decision:null}}))
  })
  const given=await theModelTheOfficeGives('http://synthetic.invalid',{agent:'sample-agent',runtime:'claude-code',workspace:'default',headers:{}})
  expect(given.model).toBe(known)
  expect(given.selection).toBeUndefined()
  expect(asked).toContain('/api/casting/rows/41/selection')
  const chosen=selection('codex')
  await expect(aCommandsStartFromTheOffice(['codex','exec'],{api:'http://synthetic.invalid',agent:'sample-agent',...options(chosen)})).rejects.toThrow(/Casting row.*rechecked/)
})
