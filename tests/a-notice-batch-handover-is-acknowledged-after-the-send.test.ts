// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

async function handover(refuse: boolean) {
  const folder=mkdtempSync(join(tmpdir(),'notice-batch-handover-'))
  const events:string[]=[], appended:string[]=[], acknowledged:string[]=[]
  let complete:()=>void=()=>{}, submitted:()=>void=()=>{}
  const completed=new Promise<void>(resolve=>{complete=resolve}), submission=new Promise<void>(resolve=>{submitted=resolve})
  const messages=[{messageId:'made-up-work',urgent:false},{messageId:'made-up-notice',urgent:false,batchTurn:'handover:made-up-work'}]
  const server=createServer(async(req,res)=>{
    let text='';for await(const chunk of req)text+=String(chunk)
    const body=text ? JSON.parse(text) as Record<string,unknown> : {}, path=new URL(req.url!,'http://fixture').pathname
    let answer:unknown={}
    if(path==='/api/records/made-up-session')answer={id:'made-up-session',kind:'session',workspaceId:'default'}
    else if(path.endsWith('/hold')){res.statusCode=201;answer={hold:{agent:{kind:'agent',id:'made-up-reader'},handle:'batch-reader',session:'made-up-session',state:'fresh'},beatEvery:60,lapsesAfter:120}}
    else if(path.endsWith('/waiting'))answer={waiting:acknowledged.length===messages.length ? [] : messages}
    else if(path.endsWith('/took')){
      events.push((body['prepareOnly'] ? 'preview:' : 'ack:')+String(body['message']))
      if(!body['prepareOnly'])acknowledged.push(String(body['message']))
      answer={whoSentIt:'Made-up sender',writtenIn:{project:'default'}}
      if(acknowledged.length===messages.length)complete()
    } else if(path==='/tui/append-prompt'){events.push('append');appended.push(String(body['text']))}
    else if(path==='/tui/submit-prompt'){events.push('submit');submitted();if(refuse)res.statusCode=503}
    else if(path.startsWith('/api/records/made-up-'))answer={record:{data:{body:'Original '+path.split('/').at(-1)}}}
    else if(path==='/api/messages/groups')answer={summary:{groups:[]},text:''}
    else if(path==='/api/events'){res.writeHead(200,{'content-type':'text/event-stream'});res.write(': fixture\n\n');return}
    res.setHeader('content-type','application/json');res.end(JSON.stringify(answer))
  })
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  const api='http://127.0.0.1:'+String((server.address() as AddressInfo).port)
  const child=spawn(process.execPath,[fileURLToPath(new URL('../for-agents/hold-the-handle.mjs',import.meta.url)),'--agent','batch-reader','--session','made-up-session','--api',api,'--workspace','default','--runtime','opencode','--wake',api,'--kept-by-the-kit'],{cwd:folder,detached:true,env:{PATH:process.env.PATH,HOME:folder,MOLE_OFFICE_API:api,MOLE_AGENT_KEY:'made-up-key'},stdio:['ignore','pipe','pipe']})
  let stderr='',stdout='';child.stdout!.on('data',chunk=>{stdout+=String(chunk)});child.stderr!.on('data',chunk=>{stderr+=String(chunk)})
  const ended = new Promise<never>((_,reject)=>child.once('close',code=>reject(new Error('The waiter ended '+String(code)+': '+stderr+stdout))))
  let cap:NodeJS.Timeout
  const timeout=new Promise<never>((_,reject)=>{cap=setTimeout(()=>reject(new Error('No batch handover: '+stderr)),15_000)})
  try {
    await Promise.race([refuse ? submission : completed,timeout,ended])
    // Wait for the refused response to be processed, through an explicit event instead of a real pause.
    if(refuse)await new Promise<void>(resolve=>setImmediate(resolve))
    return {events,appended,acknowledged}
  } finally {
    clearTimeout(cap!)
    if(child.pid)try{process.kill(-child.pid,'SIGTERM')}catch{}
    if(child.exitCode===null && child.signalCode===null)await new Promise<void>(resolve=>child.once('close',()=>resolve()))
    server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))
    rmSync(folder,{recursive:true,force:true})
  }
}
it('sends all original messages in one prompt and acknowledges them only after the successful send',async()=>{
  const run=await handover(false)
  expect(run.appended).toHaveLength(1)
  expect(run.appended[0]).toContain('Original made-up-work');expect(run.appended[0]).toContain('Original made-up-notice')
  expect(run.events.filter(e=>e==='submit')).toHaveLength(1)
  expect(run.events.indexOf('ack:made-up-notice')).toBeGreaterThan(run.events.indexOf('submit'))
  expect(run.events).toContain('preview:made-up-notice')
  expect(run.acknowledged).toEqual(['made-up-work','made-up-notice'])
},30_000)
it('keeps original deliveries pending when the session refuses the handover',async()=>{
  const run=await handover(true)
  expect(run.acknowledged).toEqual([])
},30_000)
