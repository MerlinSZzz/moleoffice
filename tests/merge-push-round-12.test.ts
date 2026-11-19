// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic repositories, a local bare remote and fake gh. No test sends a byte to GitHub. */
import { LANDED_KEEP_PREFIX, REPLAY_KEEP_PREFIX } from '../src/shared/merge/landed-history.mjs'
import {execFileSync, spawnSync} from 'node:child_process'
import {chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const boundary=vi.hoisted(()=>({folder:'',state:{} as Record<string,any>,steps:[] as {name:string;facts:any}[],logged:[] as string[]}))
vi.mock('../tools/merge-tool/arguments.mjs',async()=>({THE_OFFICE_CONFIGURATION:(await import('../tools/merge-tool/config.mjs')).theOfficeConfiguration({repository:fileURLToPath(new URL('..',import.meta.url)),commitEmail:(await import('./the-test-commit-address.mjs')).THE_MERGE_TOOLS_TEST_ADDRESS}),get WORKDIR(){return join(boundary.folder,'logs')},MIGRATIONS_FOLDER:'drizzle/',SCRIPT_TIMEOUT_MS:30_000,theMainMirrorOf:(await import('../tools/sandbox-common.mjs')).theMainMirrorOf,thePrivateOrigin:(await import('../src/config/settings.mjs')).settingValue.bind(null,'MOLE_OFFICE_PRIVATE_ORIGIN'),GIT_IDENTITY:{GIT_AUTHOR_NAME:'Synthetic queue',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'Synthetic queue',GIT_COMMITTER_EMAIL:'fixture@example.invalid'},chosen:{entry:'synthetic-entry',pinOnly:false,get sandboxes(){return join(boundary.folder,'sandboxes')}}}))
vi.mock('../tools/merge-tool/log-and-state.mjs',()=>({fail:(text:string)=>{throw Error(text)},log:(line:string)=>{boundary.logged.push(line)},stamp:()=>new Date().toISOString(),readState:()=>boundary.state,writeState:(patch:any)=>{boundary.state={...boundary.state,...patch};return boundary.state}}))
// The office runs from the lane's root, so each landing backs up and migrates as before (tools/merge-tool/the-stable-office.mjs).
vi.mock('../tools/merge-tool/office-keeper.mjs',()=>({step:async(name:string,facts:any)=>{boundary.steps.push({name,facts});return {state:'merged',facts}},theOfficesRuntime:async()=>({repository:{path:join(boundary.folder,'repo')}}),waitForHealth:async()=>({says:'Synthetic health passed'}),conflictsAfterLanding:async()=>[]}))
vi.mock('../tools/merge-tool/documents.mjs',()=>({carryPastDocuments:async()=>null,theRecordCarriedForward:()=>{},untilNoOtherLandingOf:async()=>{}}))
import {readSettingHere} from '../src/config/settings.mjs'
import {theMainMirrorOf} from '../tools/sandbox-common.mjs'
import {bringTheMainMirrorForward} from '../tools/sandbox-git.mjs'
import * as officeKeeper from '../tools/merge-tool/office-keeper.mjs'
import {wholeSuiteFixRoundIsOn} from '../src/config/whole-suite-red.mjs'
import {pluginPagesPosition} from '../src/config/integration-guards.mjs'
import {landGit as landGitFixture} from '../tools/merge-tool/land.mjs'
const notReached=(name:string)=>()=>{throw new Error(`Synthetic: ${name} is not reached in this file`)}
const landGit=(entry:any)=>landGitFixture(entry,{replayOnly:true,step:officeKeeper.step,theOfficesRuntime:officeKeeper.theOfficesRuntime,waitForHealth:officeKeeper.waitForHealth,conflictsAfterLanding:officeKeeper.conflictsAfterLanding,ask:notReached('ask'),countAGateMet:notReached('countAGateMet'),theLane:notReached('theLane'),sleep:notReached('sleep'),runInSandbox:notReached('runInSandbox'),theSandbox:notReached('theSandbox'),wholeSuiteFixRoundIsOn,pluginPagesPosition})
const REAL_GIT=execFileSync('which',['git'],{encoding:'utf8'}).trim()
const REPO=fileURLToPath(new URL('..',import.meta.url))
let originalPath:string|undefined
let theOldValue:string|undefined
// THE PRIVATE COPY'S ADDRESS IS THE SETTING MOLE_OFFICE_PRIVATE_ORIGIN, which has no default. Each case sets a made-up
// address in this test process only, never in a .env file; run-named-tests clears every MOLE_OFFICE_ variable first.
// The stand-in for arguments.mjs reads it as arguments.mjs does, through settings.mjs when the push asks.
const PRIVATE_ORIGIN='MOLE_OFFICE_PRIVATE_ORIGIN'
const THE_COPY='git@github.com:quill/a-private-copy.git'
const ANOTHER_COPY='git@github.com:lark/a-private-copy.git'
let theOldOrigin:string|undefined
const git=(root:string,...args:string[])=>execFileSync('git',['-C',root,...args],{encoding:'utf8',env:{...process.env,GIT_ALLOW_PROTOCOL:'file'},stdio:['ignore','pipe','pipe']}).trim()
const commit=(root:string,words:string)=>{git(root,'add','-A');git(root,'commit','-qm',words);return git(root,'rev-parse','HEAD')}
function standIn(...args:string[]){const split=args.indexOf('--');return spawnSync(process.execPath,[join(REPO,'tests/stand-in-sandbox-tool.mjs'),...args.slice(0,split<0?args.length:split),'--sandboxes',join(boundary.folder,'sandboxes'),...args.slice(split<0?args.length:split)],{encoding:'utf8',timeout:30_000})}
function fixture(message='Synthetic entry',visibility='private',origin=THE_COPY){
  const up=standIn('up','merge','--name','synthetic-push','--from',boundary.folder);expect(up.status,up.stderr).toBe(0)
  // The lane's root is outside the sandboxes folder, as the owner's checkout is.
  const root=join(boundary.folder,'repo');mkdirSync(root,{recursive:true})
  const remote=join(boundary.folder,'remote.git');mkdirSync(remote);git(remote,'init','-q','--bare')
  git(root,'init','-qb','main');git(root,'config','user.name','Synthetic fixture');git(root,'config','user.email','fixture@example.invalid')
  writeFileSync(join(root,'value.txt'),'base\n');const base=commit(root,'Synthetic baseline')
  git(root,'remote','add','origin',origin)
  git(root,'push','-q',remote,`${base}:refs/heads/main`)
  writeFileSync(join(root,'value.txt'),'entry\n');const tip=commit(root,message)
  // Exercise a passing scoped stand-in suite on the tree that will land, in a clone in the sandbox folder as the merge
  // tool's suite runs, then let the real landing fast-forward the root.
  const box=join(boundary.folder,'sandboxes/synthetic-push/work/repo');git(root,'clone','-q','--no-checkout',root,box);git(box,'checkout','-q','--detach',tip)
  const suite=standIn('exec','synthetic-push','--cwd',box,'--wait','--plain-env','--timeout','30','--',process.execPath,'-e',"require('node:assert/strict').equal(require('node:fs').readFileSync('value.txt','utf8'),'entry\\n')")
  expect(suite.status,suite.stdout+suite.stderr).toBe(0)
  git(root,'checkout','-q','--detach',base)
  boundary.state={integrated:{M:base,Cfinal:tip,clone:root}}
  const bin=join(boundary.folder,'bin');mkdirSync(bin)
  // The fake gh keeps what it was asked in gh-asked, beside the logs folder, so a case sees which copy was checked.
  writeFileSync(join(bin,'gh'),`#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(join(boundary.folder,'gh-asked'))}\nprintf '%s\\n' '${visibility}'\n`);chmodSync(join(bin,'gh'),0o700)
  // Only the network boundary is synthetic. Git's real get-url sees the address origin was given, unchanged.
  // Every push and ls-remote is redirected by this executable, never by production configuration.
  // It finds the command after `-C <folder>`, wherever git's own options put it: a clone in the sandboxes folder starts
  // with the guard's options (tools/merge-tool/git.mjs).
  writeFileSync(join(bin,'git'),`#!${process.execPath}
const {spawnSync}=require('node:child_process');const args=process.argv.slice(2);const c=args.indexOf('-C');const at=c<0?0:c+2;
if(args[at]==='push'||args[at]==='ls-remote'){const target=args.indexOf('origin',at+1);if(target>=0)args[target]=${JSON.stringify(remote)};}
const r=spawnSync(${JSON.stringify(REAL_GIT)},args,{stdio:'inherit',env:{...process.env,GIT_ALLOW_PROTOCOL:'file'}});process.exit(r.status??1);
`);chmodSync(join(bin,'git'),0o700)
  process.env.PATH=bin+':'+originalPath
  return {root,remote,base,tip,entry:{state:'landing',changeset:{root}}}
}
// THE MIRROR A LANDING PUSHES TO IS THE ONE THE SANDBOX LAUNCHER MAKES: theMainMirrorOf(sandboxes, the lane's root), in
// this case's own sandboxes folder, which the mocked arguments name as the merge tool's (13u round 81, item 18).
const mirrorOf=()=>theMainMirrorOf(join(boundary.folder,'sandboxes'),join(boundary.folder,'repo'))
// THE REMOVED SETTING STILL NAMES A FOLDER IN THIS CASE'S OWN TEMPORARY FOLDER, so a landing that read it would write
// there and never under the home folder. The cases check that nothing is made there.
const REMOVED_SETTING='MOLE_OFFICE_MAIN_MIRROR'
const theOldPlace=()=>join(boundary.folder,'the-removed-setting.git')
beforeEach(()=>{boundary.folder=mkdtempSync(join(tmpdir(),'merge-push-round-12-'));mkdirSync(join(boundary.folder,'logs'));boundary.steps=[];boundary.state={};boundary.logged=[];originalPath=process.env.PATH;theOldValue=process.env[REMOVED_SETTING];process.env[REMOVED_SETTING]=theOldPlace();theOldOrigin=process.env[PRIVATE_ORIGIN];process.env[PRIVATE_ORIGIN]=THE_COPY})
afterEach(()=>{process.env.PATH=originalPath;if(theOldValue===undefined)delete process.env[REMOVED_SETTING];else process.env[REMOVED_SETTING]=theOldValue;if(theOldOrigin===undefined)delete process.env[PRIVATE_ORIGIN];else process.env[PRIVATE_ORIGIN]=theOldOrigin;standIn('down','synthetic-push');rmSync(boundary.folder,{recursive:true,force:true})})
/** The mirror as the sandbox launcher leaves it at `up`, made by the launcher's own function, with its main set back to the base. */
function theLaunchersMirror(f:{root:string;base:string}){const made=bringTheMainMirrorForward(mirrorOf(),f.root,{make:true});expect(made.why).toBeNull();expect(made.made).toBe(true);git(mirrorOf(),'update-ref','refs/heads/main',f.base);expect(mainIn(mirrorOf())).toBe(f.base)}
/** Main in a repository, or null when it has none. */
const mainIn=(repository:string)=>{const r=spawnSync('git',['--git-dir',repository,'rev-parse','--verify','-q','refs/heads/main'],{encoding:'utf8'});return r.status===0?r.stdout.trim():null}
/** A commit on top of the landed one, set up as the next landing, as the queue's integration would leave it. */
function theNextLanding(f:{root:string},from:string){writeFileSync(join(f.root,'value.txt'),'next\n');const next=commit(f.root,'Synthetic next entry');git(f.root,'checkout','-q','--detach',from);boundary.state={integrated:{M:from,Cfinal:next,clone:f.root}};return next}
/** The landing log's own line about the mirror: not the line that starts the push command. */
const mirrorLines=()=>boundary.logged.filter((line)=>line.includes(mirrorOf())&&!line.startsWith('running '))
/** What the fake gh was asked, one line for each time, or nothing when it never ran. */
const asked=()=>existsSync(join(boundary.folder,'gh-asked'))?readFileSync(join(boundary.folder,'gh-asked'),'utf8').split('\n').filter(Boolean):[]
/** Whether a push sentence holds some words, checked without printing the sentence, which may carry what git or gh said. */
const holds=(said:unknown,words:string)=>typeof said==='string'&&said.includes(words)
/**
 * Whether no text the landings left holds any of these words, in any case: the state, the steps, the logged lines and
 * every file in the log folder. It answers yes or no, so a failure prints none of that text.
 */
function nothingNames(words:string[]){
 const folder=join(boundary.folder,'logs')
 const files=(readdirSync(folder,{recursive:true}) as string[]).map((name)=>join(folder,name)).filter((path)=>statSync(path).isFile())
 const texts=[JSON.stringify(boundary.state),JSON.stringify(boundary.steps),...boundary.logged,...files.map((path)=>readFileSync(path,'utf8'))].map((said)=>said.toLowerCase())
 return words.every((word)=>texts.every((said)=>!said.includes(word.toLowerCase())))
}

it('a landing pushes its exact commit to the fake private remote without force',async()=>{
 const f=fixture();theLaunchersMirror(f);const result=await landGit(f.entry)
 expect(result.state).toBe('merged');expect(git(f.root,'rev-parse','HEAD')).toBe(f.tip)
 expect(git(f.remote,'rev-parse','refs/heads/main')).toBe(f.tip)
 expect(boundary.state.landing.pushed.ok).toBe(true);expect(boundary.steps).toHaveLength(1)
 const pushLog=readFileSync(boundary.state.landing.pushed.log,'utf8');expect(pushLog).toContain('main')
 // THE ADDRESS THE PUSH EXPECTS IS THE SETTING'S VALUE: origin is that address, and gh is asked about that copy.
 expect(asked()).toEqual(['api repos/quill/a-private-copy --jq .visibility'])
},60_000)
it('attribution lines stop the push and carry one failure notice in the landing receipt without undoing main',async()=>{
 const lines=['Co-Authored-By: Fixture <fixture@example.invalid>','generated with [claude fixture]','🤖','Claude-Session: fixture']
 const f=fixture('Synthetic entry\n\n'+lines[0])
 for(let i=0;i<lines.length;i++){
  let tip=f.tip
  if(i>0){git(f.root,'checkout','-q','--detach',f.base);writeFileSync(join(f.root,'value.txt'),'entry\n');tip=commit(f.root,'Synthetic entry\n\n'+lines[i]);git(f.root,'checkout','-q','--detach',f.base);boundary.state={integrated:{M:f.base,Cfinal:tip,clone:f.root}}}
  await landGit(f.entry)
  expect(git(f.root,'rev-parse','HEAD')).toBe(tip);expect(git(f.remote,'rev-parse','refs/heads/main')).toBe(f.base)
  expect(boundary.steps).toHaveLength(i+1);expect(holds(boundary.steps[i]!.facts.pushFailure,'forbidden attribution'),'the push failure names a forbidden attribution line').toBe(true)
 }
},60_000)
it('an origin other than the expected one stops the push after landing',async()=>{
 const f=fixture()
 const badURLs=[()=>git(f.root,'remote','set-url','origin',f.remote),
  ()=>{git(f.root,'remote','set-url','origin',THE_COPY);git(f.root,'config',`url.file://${f.remote}.insteadOf`,THE_COPY)},
  ()=>{git(f.root,'config','--unset-all',`url.file://${f.remote}.insteadOf`);git(f.root,'remote','set-url','origin',THE_COPY+' ')},
  ()=>{git(f.root,'remote','set-url','origin',THE_COPY);git(f.root,'config','remote.origin.pushurl',f.remote)}]
 for(let i=0;i<badURLs.length;i++){
  badURLs[i]!();boundary.state={integrated:{M:f.base,Cfinal:f.tip,clone:f.root}};await landGit(f.entry)
  expect(git(f.root,'rev-parse','HEAD')).toBe(f.tip);expect(git(f.remote,'rev-parse','refs/heads/main')).toBe(f.base)
  expect(boundary.steps).toHaveLength(i+1);expect(holds(boundary.steps[i]!.facts.pushFailure,'not exactly'),'the push failure says origin is not exactly the address').toBe(true)
 }
},60_000)
it('a public visibility answer stops the push after landing',async()=>{
 const f=fixture('Synthetic entry','public');theLaunchersMirror(f);await landGit(f.entry)
 expect(git(f.root,'rev-parse','HEAD')).toBe(f.tip);expect(git(f.remote,'rev-parse','refs/heads/main')).toBe(f.base)
 expect(boundary.steps).toHaveLength(1);expect(holds(boundary.steps[0]!.facts.pushFailure,'not private'),'the push failure says the copy is not private').toBe(true)
 // The mirror is pushed all the same: what stops the push to GitHub is about GitHub.
 expect(mainIn(mirrorOf())).toBe(f.tip)
},60_000)
it('a failed push is told once after landing and leaves the landed commit in main',async()=>{
 const f=fixture();writeFileSync(join(f.remote,'hooks/pre-receive'),'#!/bin/sh\nexit 1\n');chmodSync(join(f.remote,'hooks/pre-receive'),0o700)
 await landGit(f.entry)
 expect(git(f.root,'rev-parse','HEAD')).toBe(f.tip);expect(git(f.remote,'rev-parse','refs/heads/main')).toBe(f.base)
 expect(boundary.steps).toHaveLength(1);expect(holds(boundary.steps[0]!.facts.pushFailure,'git push failed'),'the push failure says git push failed').toBe(true)
},60_000)
it('the address the push expects is the value of MOLE_OFFICE_PRIVATE_ORIGIN when the push runs',async()=>{
 const f=fixture();theLaunchersMirror(f);await landGit(f.entry)
 expect(boundary.state.landing.pushed.ok).toBe(true);expect(mainIn(f.remote)).toBe(f.tip)
 // ANOTHER VALUE, set long after the import, is the one the next push checks origin against and asks gh about.
 process.env[PRIVATE_ORIGIN]=ANOTHER_COPY;git(f.root,'remote','set-url','origin',ANOTHER_COPY)
 const next=theNextLanding(f,f.tip);await landGit(f.entry)
 expect(boundary.state.landing.pushed.ok).toBe(true);expect(mainIn(f.remote)).toBe(next)
 expect(asked()).toEqual(['api repos/quill/a-private-copy --jq .visibility','api repos/lark/a-private-copy --jq .visibility'])
 // AN ORIGIN LEFT AT THE OLD ADDRESS no longer passes once the setting names another.
 process.env[PRIVATE_ORIGIN]=THE_COPY
 writeFileSync(join(f.root,'value.txt'),'third\n');const third=commit(f.root,'Synthetic third entry');git(f.root,'checkout','-q','--detach',next)
 boundary.state={integrated:{M:next,Cfinal:third,clone:f.root}};await landGit(f.entry)
 expect(git(f.root,'rev-parse','HEAD')).toBe(third);expect(mainIn(f.remote)).toBe(next);expect(asked()).toHaveLength(2)
 expect(holds(boundary.steps[2]!.facts.pushFailure,'not exactly'),'the push failure says origin is not exactly the address').toBe(true)
},60_000)
it('with MOLE_OFFICE_PRIVATE_ORIGIN not set, a landing lands, says there is no private copy to push to, and still pushes the mirror',async()=>{
 delete process.env[PRIVATE_ORIGIN]
 // A .env that set it would give this case an address, so the case stops before anything lands.
 expect(readSettingHere(PRIVATE_ORIGIN).source,'no .env may set MOLE_OFFICE_PRIVATE_ORIGIN').toBe('nothing set it')
 const f=fixture();theLaunchersMirror(f);const result=await landGit(f.entry)
 expect(result.state).toBe('merged');expect(git(f.root,'rev-parse','HEAD')).toBe(f.tip)
 expect(mainIn(f.remote)).toBe(f.base);expect(asked()).toEqual([])
 const pushed=boundary.state.landing.pushed
 expect(pushed.ok).toBe(false)
 expect(holds(pushed.says,'MOLE_OFFICE_PRIVATE_ORIGIN is not set, so there is no private copy to push to.'),'the push says the setting is not set and there is no private copy').toBe(true)
 expect(holds(pushed.says,'Main was not rolled back.'),'the push says main was not rolled back').toBe(true)
 expect(boundary.steps).toHaveLength(1)
 expect(holds(boundary.steps[0]!.facts.pushFailure,'MOLE_OFFICE_PRIVATE_ORIGIN is not set'),'the landing receipt carries the sentence').toBe(true)
 expect(pushed.mirror.ok).toBe(true);expect(mainIn(mirrorOf())).toBe(f.tip)
},60_000)
it('a value of MOLE_OFFICE_PRIVATE_ORIGIN that is not a GitHub ssh address stops the push after landing, and is not printed',async()=>{
 const f=fixture()
 const notAddresses=['https://github.com/quill/a-private-copy.git','git@github.com:quill/a-private-copy','git@gitlab.com:quill/a-private-copy.git','git@github.com:quill/...git',THE_COPY+' ']
 for(let i=0;i<notAddresses.length;i++){
  process.env[PRIVATE_ORIGIN]=notAddresses[i];boundary.state={integrated:{M:f.base,Cfinal:f.tip,clone:f.root}};await landGit(f.entry)
  expect(git(f.root,'rev-parse','HEAD')).toBe(f.tip);expect(mainIn(f.remote)).toBe(f.base);expect(asked()).toEqual([])
  expect(holds(boundary.steps[i]!.facts.pushFailure,'MOLE_OFFICE_PRIVATE_ORIGIN is not an address of the form git@github.com:<owner>/<name>.git'),`value ${i} is refused as no such address`).toBe(true)
  expect(nothingNames(['quill','a-private-copy']),`value ${i} is printed nowhere`).toBe(true)
 }
},60_000)
it('names neither the setting\'s value nor a configured URL: not in an origin refusal, a failed push, a failed visibility check or a passing push\'s log',async()=>{
 const theValue=[THE_COPY,'quill/a-private-copy','quill']
 const f=fixture('Synthetic entry','private','git@github.com:wren/another-copy.git');theLaunchersMirror(f)
 const again=()=>{boundary.state={integrated:{M:f.base,Cfinal:f.tip,clone:f.root}};return landGit(f.entry)}
 // ORIGIN AT ANOTHER ADDRESS is refused without either address.
 await again()
 expect(mainIn(f.remote)).toBe(f.base)
 expect(holds(boundary.steps[0]!.facts.pushFailure,'not exactly'),'the refusal is the origin check').toBe(true)
 expect(nothingNames([...theValue,'wren/another-copy','wren']),'the refusal names neither address').toBe(true)
 // A FAILED PUSH whose remote answers with the address, its owner and its name, in another case as well.
 git(f.root,'remote','set-url','origin',THE_COPY)
 const hook=join(f.remote,'hooks/pre-receive')
 writeFileSync(hook,'#!/bin/sh\necho "ERROR: Permission to QUILL/A-Private-Copy.git denied to quill." >&2\necho "fatal: could not read from git@github.com:quill/a-private-copy.git" >&2\nexit 1\n');chmodSync(hook,0o700)
 await again()
 expect(mainIn(f.remote)).toBe(f.base)
 const failed=boundary.steps[1]!.facts.pushFailure
 expect(holds(failed,'git push failed'),'the push itself failed').toBe(true)
 expect(holds(failed,'<MOLE_OFFICE_PRIVATE_ORIGIN>'),'what git said is kept, with the address masked').toBe(true)
 expect(nothingNames(theValue),'the failed push names no part of the address').toBe(true)
 // A FAILED VISIBILITY CHECK whose gh names the copy and its owner.
 rmSync(hook)
 const gh=join(boundary.folder,'bin/gh')
 writeFileSync(gh,'#!/bin/sh\necho "HTTP 404: Not Found (https://api.github.com/repos/quill/a-private-copy) for quill" >&2\nexit 1\n')
 await again()
 expect(mainIn(f.remote)).toBe(f.base)
 const unanswered=boundary.steps[2]!.facts.pushFailure
 expect(holds(unanswered,'The repository visibility check failed'),'the visibility check failed').toBe(true)
 expect(holds(unanswered,'<MOLE_OFFICE_PRIVATE_ORIGIN>'),'what gh said is kept, with the copy masked').toBe(true)
 expect(nothingNames(theValue),'the failed visibility check names no part of the address').toBe(true)
 // A PASSING PUSH whose remote says the address: its log keeps the line, masked.
 writeFileSync(gh,"#!/bin/sh\nprintf '%s\\n' 'private'\n")
 writeFileSync(hook,'#!/bin/sh\necho "Received for git@github.com:quill/a-private-copy.git" >&2\n');chmodSync(hook,0o700)
 await again()
 expect(mainIn(f.remote)).toBe(f.tip);expect(boundary.state.landing.pushed.ok).toBe(true)
 expect(readFileSync(boundary.state.landing.pushed.log,'utf8').includes('<MOLE_OFFICE_PRIVATE_ORIGIN>'),'the push log keeps what the remote said, masked').toBe(true)
 expect(nothingNames(theValue),'the passing push names no part of the address').toBe(true)
},60_000)
it('a landing pushes main to the mirror theMainMirrorOf names for its root, so main there is the landed commit, and the next landing pushes again',async()=>{
 const f=fixture();theLaunchersMirror(f)
 const result=await landGit(f.entry)
 expect(result.state).toBe('merged');expect(git(f.root,'rev-parse','HEAD')).toBe(f.tip)
 expect(mainIn(mirrorOf())).toBe(f.tip);expect(mainIn(f.remote)).toBe(f.tip)
 expect(boundary.state.landing.pushed.ok).toBe(true);expect(boundary.steps[0]!.facts.pushFailure).toBeUndefined()
 expect(mirrorLines()).toHaveLength(1);expect(mirrorLines()[0]).toContain(f.tip)
 expect(boundary.steps[0]!.facts.says).toContain(mirrorOf())
 expect(existsSync(theOldPlace())).toBe(false)
 const next=theNextLanding(f,f.tip);await landGit(f.entry)
 expect(git(f.root,'rev-parse','HEAD')).toBe(next);expect(mainIn(mirrorOf())).toBe(next)
 expect(mirrorLines()).toHaveLength(2)
},60_000)
it('with no mirror where theMainMirrorOf names it, a landing makes none and pushes nothing, says so in its log and on the entry, and main stays landed',async()=>{
 const f=fixture()
 const result=await landGit(f.entry)
 expect(result.state).toBe('merged');expect(git(f.root,'rev-parse','HEAD')).toBe(f.tip);expect(mainIn(f.remote)).toBe(f.tip)
 expect(existsSync(dirname(mirrorOf()))).toBe(false);expect(existsSync(theOldPlace())).toBe(false)
 const said=boundary.state.landing.pushed.mirror.says
 expect(boundary.state.landing.pushed.ok).toBe(false);expect(said).toContain(mirrorOf());expect(said).toContain(f.tip)
 expect(mirrorLines()).toEqual([said])
 expect(boundary.steps).toHaveLength(1);expect(boundary.steps[0]!.facts.pushFailure).toContain(said)
 // ONCE THE LAUNCHER HAS MADE IT, the next landing pushes there.
 theLaunchersMirror(f)
 const next=theNextLanding(f,f.tip);await landGit(f.entry)
 expect(mainIn(mirrorOf())).toBe(next);expect(boundary.steps[1]!.facts.pushFailure).toBeUndefined()
},60_000)
it('a failed push to the mirror is said in the log and on the landing, leaves main landed, and the next landing pushes again',async()=>{
 const f=fixture();theLaunchersMirror(f)
 writeFileSync(join(mirrorOf(),'hooks/pre-receive'),'#!/bin/sh\nexit 1\n');chmodSync(join(mirrorOf(),'hooks/pre-receive'),0o700)
 await landGit(f.entry)
 expect(git(f.root,'rev-parse','HEAD')).toBe(f.tip);expect(mainIn(f.remote)).toBe(f.tip);expect(mainIn(mirrorOf())).toBe(f.base)
 expect(boundary.state.landing.pushed.ok).toBe(false)
 expect(boundary.steps).toHaveLength(1);expect(boundary.steps[0]!.facts.pushFailure).toContain(mirrorOf())
 expect(mirrorLines()).toHaveLength(1);expect(mirrorLines()[0]).toBe(boundary.state.landing.pushed.mirror.says)
 expect(boundary.steps[0]!.facts.pushFailure).toContain(boundary.state.landing.pushed.mirror.says)
 rmSync(join(mirrorOf(),'hooks/pre-receive'))
 const next=theNextLanding(f,f.tip);await landGit(f.entry)
 expect(mainIn(mirrorOf())).toBe(next);expect(boundary.steps[1]!.facts.pushFailure).toBeUndefined()
},60_000)
it('a mirror path that holds something other than a bare repository is not written, and the landing says so',async()=>{
 const f=fixture();mkdirSync(mirrorOf(),{recursive:true});writeFileSync(join(mirrorOf(),'somebody-elses.txt'),'Synthetic: not a repository.\n')
 await landGit(f.entry)
 expect(git(f.root,'rev-parse','HEAD')).toBe(f.tip);expect(mainIn(f.remote)).toBe(f.tip)
 expect(readFileSync(join(mirrorOf(),'somebody-elses.txt'),'utf8')).toBe('Synthetic: not a repository.\n')
 expect(boundary.steps[0]!.facts.pushFailure).toContain('not a bare repository')
},60_000)

it('pushes a squashed landing and its retained branch history to both copies', async()=>{
 const f=fixture();theLaunchersMirror(f)
 git(f.root,'update-ref',`${LANDED_KEEP_PREFIX}synthetic-squash`,f.tip)
 git(f.root,'update-ref',`${REPLAY_KEEP_PREFIX}synthetic-squash`,f.tip)
 const message=`Finish a synthetic feature\n\nMole-landing: 1\nEntry: synthetic-squash\nRun: synthetic-run\nSeal: synthetic-seal\nSeal-hash: ${'a'.repeat(64)}\nBranch-tip: ${f.tip}\nReplayed-tip: ${f.tip}`
 const squash=git(f.root,'commit-tree',git(f.root,'rev-parse',`${f.tip}^{tree}`),'-p',f.base,'-m',message)
 boundary.state={integrated:{M:f.base,Cfinal:squash,clone:f.root}}
 await landGit(f.entry)
 for(const repository of [f.remote,mirrorOf()]){
  expect(mainIn(repository)).toBe(squash)
  expect(git(repository,'rev-parse',`${LANDED_KEEP_PREFIX}synthetic-squash`)).toBe(f.tip)
  expect(git(repository,'rev-parse',`${REPLAY_KEEP_PREFIX}synthetic-squash`)).toBe(f.tip)
  expect(git(repository,'show',`${f.tip}:value.txt`)).toBe('entry')
 }
})

it('refuses an original-only attribution trailer hidden by the squash, in both pushes', async()=>{
 const f=fixture('Synthetic original\n\nCo-Authored-By: Fixture <fixture@example.invalid>');theLaunchersMirror(f)
 git(f.root,'update-ref',`${LANDED_KEEP_PREFIX}synthetic-original`,f.tip)
 git(f.root,'update-ref',`${REPLAY_KEEP_PREFIX}synthetic-original`,f.tip)
 const message=`Finish the synthetic feature\n\nMole-landing: 1\nEntry: synthetic-original\nRun: synthetic-run\nSeal: synthetic-seal\nSeal-hash: ${'a'.repeat(64)}\nBranch-tip: ${f.tip}\nReplayed-tip: ${f.tip}`
 const squash=git(f.root,'commit-tree',git(f.root,'rev-parse',`${f.tip}^{tree}`),'-p',f.base,'-m',message)
 boundary.state={integrated:{M:f.base,Cfinal:squash,clone:f.root}}
 await landGit(f.entry)
 expect(git(f.root,'rev-parse','HEAD')).toBe(squash)
 for(const repository of [f.remote,mirrorOf()]) expect(mainIn(repository)).toBe(f.base)
 expect(boundary.state.landing.pushed.says).toContain('forbidden attribution')
})
