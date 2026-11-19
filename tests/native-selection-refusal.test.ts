// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Native output shapes inspected locally; fixtures are synthetic and no installed runtime is executed. */
import { describe, expect, it } from 'vitest'
import { nativeRefusalWithCode, theNativeSelectionRefusal } from '../src/config/launcher-selection.mjs'

const message = 'Synthetic native model or option refusal.'
const fixtures = [
  {runtime:'codex',kind:'model',text:JSON.stringify({type:'turn.failed',error:{code:'model_not_found',message}})},
  {runtime:'claude-code',kind:'model',text:JSON.stringify({type:'result',is_error:true,subtype:'error_during_execution',errors:['API Error: 404 '+JSON.stringify({error:{type:'not_found_error',message:'model: sample-native'}})]})},
  {runtime:'opencode',kind:'model',text:JSON.stringify({type:'error',error:{name:'ProviderModelNotFoundError',data:{providerID:'sample-provider',modelID:'sample-native',suggestions:[]}}})},
  {runtime:'dsh',kind:'option',text:'dsh: UNSUPPORTED_REASONING_EFFORT: provider "sample-provider" model "sample-native" does not support reasoning effort "sample-effort"\n'},
] as const

describe('only this runtime’s native refusal shape holds a selected row',()=>{
  it('OpenCode carries a provider API model refusal in error.type',()=>{
    const text=JSON.stringify({type:'error',error:{name:'APIError',data:{responseBody:JSON.stringify({error:{type:'not_found_error',message:'model: sample-native'}})}}})
    expect(theNativeSelectionRefusal('opencode',text)).toMatchObject({kind:'model',code:'not_found_error'})
  })
  it('a provider not-found error about another resource never holds the model row',()=>{
    expect(nativeRefusalWithCode('not_found_error','workspace: sample-workspace')).toBeNull()
    for(const runtime of ['codex','opencode']) {
      const error={code:'not_found_error',message:'workspace: sample-workspace'}
      const text=JSON.stringify(runtime==='codex'?{type:'turn.failed',error}:{type:'error',error:{name:'APIError',data:{responseBody:JSON.stringify({error})}}})
      expect(theNativeSelectionRefusal(runtime,text)).toBeNull()
    }
  })
  it.each(fixtures)('$runtime reads its own model or option refusal',sample=>{
    expect(theNativeSelectionRefusal(sample.runtime,Buffer.from(sample.text))).toMatchObject({kind:sample.kind,code:expect.any(String),said:expect.any(String)})
  })
  it.each(fixtures)('$runtime ignores another runtime’s refusal envelope',sample=>{
    const other=sample.runtime==='dsh'?'codex':'dsh'
    expect(theNativeSelectionRefusal(other,sample.text)).toBeNull()
  })
  it.each(['codex','claude-code','opencode','dsh'])('%s never treats agent prose, capacity or quota as a model refusal',runtime=>{
    for(const text of [JSON.stringify({type:'agent_message',message:'model_not_found: '+message}),JSON.stringify({type:'turn.failed',error:{code:'usage_limit_exceeded',message}}),JSON.stringify({type:'turn.failed',error:{message:'Selected model is at capacity. Please try a different model.'}}),'dsh: QUOTA_EXCEEDED: Synthetic quota']) {
      expect(theNativeSelectionRefusal(runtime,text)).toBeNull()
    }
  })
  it('bounds and masks native diagnostics before row words are stored',()=>{
    const text=JSON.stringify({type:'turn.failed',error:{code:'model_not_found',message:'TOKEN=synthetic-private-value '+ 'native diagnostic '.repeat(300)}})
    const refusal=theNativeSelectionRefusal('codex',text)
    expect(refusal?.said).not.toContain('synthetic-private-value')
    expect(refusal?.said.length).toBeLessThanOrEqual(2000)
  })
})
