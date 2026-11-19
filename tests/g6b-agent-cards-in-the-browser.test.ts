// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync, readFileSync } from 'node:fs'
import { build } from 'esbuild'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { notWaitingForTranslation } from './words-waiting-for-translation.ts'

// Plan 7FEOshq3mBGG; the tiers are in a decision.
// Content in the fixtures is deliberately made up.
let app: LiveApp
let page: Page
const shots = process.env.G6B_SHOTS
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const pages = ['person', 'agent', 'your-card', 'their-card', 'roles', 'notebook', 'toolset', 'manual'] as const

beforeAll(async () => {
  app = await liveApp({ name: 'g6b-cards', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const registered = await fetch(`${app.api}/api/agents/started`, { method: 'POST', headers, body: JSON.stringify({ handle: 'rowan-test', name: 'Rowan Vale', runtime: 'codex', role: 'secretary' }) })
  expect(registered.status, await registered.clone().text()).toBe(201)
  const profile = await fetch(`${app.api}/api/participants/agent/rowan-test/profile`, { headers }).then(r => r.json())
  const roles = await fetch(`${app.api}/api/roles`, { headers }).then(r => r.json())
  const notebook = await fetch(`${app.api}/api/agents/rowan-test/notebook`, { headers }).then(r => r.json())
  const bundle = await build({ stdin: { sourcefile: 'g6b-browser.tsx', resolveDir: process.cwd(), loader: 'tsx', contents: `import './tests/a-page-of-a-test-office.ts';
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { flushSync } from 'react-dom';
    import { setWordLanguage, wordCheck } from './src/shared/i18n.ts';
    import { setMode } from './src/web/lib/mode.ts';
    import { theApiIsOnPort } from './src/web/lib/api-address.ts';
    import { api, setActor } from './src/web/api.ts';
    import { ProfilePage, PROFILE_CSS } from './src/web/pages/ProfilePage.tsx';
    import { YourCard } from './src/web/components/YourCard.tsx';
    import { TheirCard, TheCardAsk } from './src/web/components/TheirCard.tsx';
    import { RolesPage, ROLES_CSS } from './src/web/pages/RolesPage.tsx';
    import { NotebookPage, TheNotebook, NOTEBOOK_CSS } from './src/web/pages/NotebookPage.tsx';
    import { ToolsetPage, TOOLSET_CSS } from './src/web/pages/ToolsetPage.tsx';
    import { UI_CSS } from './src/web/components/ui.tsx';
    theApiIsOnPort(${app.apiPort});
    setActor({type:'human',id:'test-reader'});
    const original=${JSON.stringify(profile)};
    const roles=${JSON.stringify(roles)};
    const note=${JSON.stringify(notebook)};
    const stamp='2026-09-26 12:00:00';
    const stats={entries:1,byThePerson:0,byTheSecretary:1,changedByThePerson:0,lastWritten:{at:stamp,byKind:'agent',byId:'ID_SENTINEL'}};
    const entry={id:'ENTRY_SENTINEL',entryKind:'a-summary',text:'The greenhouse roof is ready.',writtenByKind:'agent',writtenById:'ID_SENTINEL',at:stamp};
    const held={...original.theCardTheyHold,role:'Cartographer',readAs:'Cartographer',says:null,chosenBy:null,chosenByHandle:null,cardsOnOffer:['Cartographer'],card:{name:'Cartographer',portrait:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="teal"/></svg>',rung:1,duties:'Cares for the greenhouse.',flow:'Collect notes before planning.'},elevation:{...original.theCardTheyHold.elevation,holding:null,period:{grant:{},holds:false,acts:[]}},notebook:{agent:'ID_SENTINEL',isThere:true,recordId:'NOTE_SENTINEL',statistics:stats}};
    const profile={...original,participant:{...original.participant,id:'ID_SENTINEL',handle:'HANDLE_SENTINEL',name:'Rowan Vale',state:null,createdAt:stamp,avatarUrl:held.card.portrait,workArea:['/PATH_SENTINEL'],credential:'KEY_SENTINEL',retired:false,broadcast:null},
      presence:{...original.presence,word:'Online',says:'RUN_SENTINEL on PORT_SENTINEL',colour:'green'},
      citizenOf:{databaseIdentity:'DATABASE_SENTINEL',name:null,kind:'home'},citizenshipSays:'DATABASE_SENTINEL',
      answering:{how:'RUN_SENTINEL',says:'BRANCH_SENTINEL'},seenFrom:[{address:'PORT_SENTINEL',lastSeen:stamp,calls:1}],seenFromSays:'PORT_SENTINEL',
      group:null,visits:[],visitsSay:'Empty visits sentence',filedLately:[],filedLatelySays:'Empty filed sentence',proposedName:null,
      mayInject:null,injectedToThem:null,theCardTheyHold:null,cardAsk:null,mayRetire:{may:true,whyNot:null},admittedBeforeP88:null};
    for(const card of [...roles.cards,...roles.personCards]) { card.duties='Cares for the greenhouse.';card.flow='Collect notes before planning.';card.howItWorks={en:'**In one line:** Cares for the greenhouse.\\n\\n1. Collect notes before planning.\\n2. Water the beds.',zh:'**一句话：** 照看温室。\\n\\n1. 先收集笔记，再做计划。\\n2. 给苗床浇水。'};card.powers=['Fixture power'];if(card.standing)card.standing='Fixture standing'; }
    roles.madeHere=[];roles.notebooks=[];roles.theCopyGrantsNothing='Fixture card explanation.';roles.nothingEnforcesACardMadeHere='Fixture card explanation.';roles.elevation.rule.whatItIs='Fixture permission explanation.';
    const row={id:'TOOL_SENTINEL',name:'Garden planner',slug:'garden-planner',does:'Plans a greenhouse.',forWhom:'users',state:'built',kept:'in this repository',location:'/PATH_SENTINEL',locationFound:true};
    const toolset={workspaceId:'default',who:null,says:'RAW_FIELD_SENTINEL',categories:[{id:'CAT_SENTINEL',name:'Gardening',says:null,confirmed:true,tools:[row]}],withoutACategory:[],partsOfTheOffice:[]};
    const manual={tool:row,category:{id:'CAT_SENTINEL',name:'Gardening',found:true},items:[
      {n:1,name:'RAW_FIELD_SENTINEL',holds:{title:row.name,does:row.does}}, {n:2,name:'RAW_FIELD_SENTINEL',holds:{forWhom:'users'}},
      {n:4,name:'RAW_FIELD_SENTINEL',holds:{whenToUse:'Plan a garden.',whenNotToUse:null}},
      {n:6,name:'RAW_FIELD_SENTINEL',holds:{howToCall:'DOOR_SENTINEL',example:'PORT_SENTINEL'}},
      {n:9,name:'RAW_FIELD_SENTINEL',holds:{eachUseRecords:'DATABASE_SENTINEL'}},
      {n:10,name:'RAW_FIELD_SENTINEL',holds:{version:'BRANCH_SENTINEL',copyOf:'/PATH_SENTINEL'}}]};
    const root=createRoot(document.getElementById('test'));
    const calls=[];
    api.answerACardRequest=async(id,answer)=>{calls.push({id,answer});return {}};
    api.retireThisAgent=async(handle,why)=>{calls.push({handle,why});return {}};
    api.getRecord=async()=>{throw new Error('Fixture record unavailable')};
    api.removeANotebookEntry=async(handle,id)=>{calls.push({handle,id});return {}};
    api.notebook=async()=>({...note,agent:'ID_SENTINEL',isThere:true,recordId:'NOTE_SENTINEL',entries:[entry],statistics:stats,kinds:['a-summary']});
    window.g6b={calls,check:wordCheck,draw(which,language='en',empty=false,inspect=false){
      setWordLanguage(language);setMode(inspect?'inspect':'normal');
      const said={...profile,participant:{...profile.participant,kind:which==='person'?'person':'agent',...(which==='agent'&&empty?{retired:true,retiredBy:{kind:'agent',id:'ID_SENTINEL'},retiredByHandle:'HANDLE_SENTINEL',retiredBecause:null}:{})},mayRetire:which==='person'?null:profile.mayRetire};
      let child;
      api.profile=async()=>said;
      api.roles=async()=>({...roles,cards:empty?[]:roles.cards,personCards:empty?[]:roles.personCards});
      api.portraits=async()=>({roles:{},custom:{}});
      api.readToolset=async()=>empty?{...toolset,categories:[]}:toolset;
      api.readManualPage=async()=>manual;
      if(which==='agent'||which==='person')child=<ProfilePage kind={said.participant.kind} id={said.participant.id}/>;
      if(which==='your-card')child=<YourCard said={{...said,participant:{...said.participant,role:empty?null:'Cartographer',occupation:empty?null:'Greenhouse keeper',portrait:null}}} onChanged={()=>{}}/>;
      if(which==='their-card')child=<TheirCard said={{...said,theCardTheyHold:{...held,elevation:empty?{...held.elevation,holding:{actingFor:'Morgan Vale',endsWhen:'when a piece of work ends',until:'ID_SENTINEL',untilInWords:'ID_SENTINEL is finished',reason:'Garden survey'}}:held.elevation,notebook:{...held.notebook,isThere:!empty,statistics:empty?null:stats}}}} onChanged={()=>{}}/>;
      if(which==='roles')child=<RolesPage/>;
      if(which==='notebook')child=empty?<TheNotebook said={{...note,isThere:false,entries:[],statistics:null,kinds:['a-summary']}} handle="ID_SENTINEL" onChanged={()=>{}}/>:<NotebookPage kind="agent" id="ID_SENTINEL"/>;
      if(which==='toolset')child=<ToolsetPage/>;
      if(which==='manual')child=<ToolsetPage slug='garden-planner'/>;
      if(which.startsWith('ask-'))child=<TheCardAsk ask={{requestId:'REQUEST_SENTINEL',handle:'HANDLE_SENTINEL',asking:'Cartographer',press:which.slice(4),admitsAnAgent:which==='ask-admit',says:'Rowan Vale requests admission to the garden team.'}} onChanged={()=>{}}/>;
      flushSync(()=>root.render(<div key={which+language+empty+inspect} className={which==='your-card'||which==='their-card'||which.startsWith('ask-')?'page prof':''}><style>{UI_CSS+PROFILE_CSS+ROLES_CSS+NOTEBOOK_CSS+TOOLSET_CSS}</style>{child}</div>));
    }};
    window.g6b.draw('agent');
  ` }, loader: { '.css': 'empty' }, write: false, bundle: true, format: 'esm', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' } })
  page = await app.browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.route('**/g6b-browser', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body><main id="test"></main></body></html>' }))
  await page.goto(`${app.site}/g6b-browser`)
  await page.addStyleTag({ content: readFileSync('src/web/tokens.css','utf8') + readFileSync('src/web/styles.css','utf8').replace(/@import[^;]+;/g,'') })
  await page.addScriptTag({ type: 'module', content: bundle.outputFiles[0]!.text })
  await page.waitForFunction(() => Boolean((window as any).g6b))
  if(shots)mkdirSync(shots,{recursive:true})
}, 180_000)

afterAll(async () => { await page?.close(); await app?.stop() })
async function draw(which: string, language = 'en', empty = false, inspect = false) {
  await page.evaluate(({which,language,empty,inspect})=>(window as any).g6b.draw(which,language,empty,inspect),{which,language,empty,inspect})
  if(which==='notebook'&&!empty)await page.locator('.nb-entry').waitFor()
  if(which==='person'||which==='agent')await page.locator('.prof-head').waitFor()
  if(which==='roles')await page.locator('.rol-group').first().waitFor()
  if(which==='toolset')await page.locator('.tls-none,.tls-category').first().waitFor()
  if(which==='manual')await page.locator('.tls-manual').waitFor()
}

// Only authored content and shared children outside this piece are exempt from the test-language scan.
// .hiw is a card's How it works, the card's own handbook text from roles.json: content in
// its own two languages. The card's flow is no longer drawn anywhere, so its fixture text is not exempt: drawn, it
// would be English on a test-language page and this scan would name it (wave 13k round 17).
// .tc-chosen-by is the sentence whoChoseTheCardSays in src/shared/roles.ts builds, which the server reads too: a named
// shared remainder still in English, drawn in both modes because who gave a card is not machinery (wave 13k round 11).
// THE SENTENCES THE PROFILE PAGE DRAWS IN PLACE OF A DASH. Decision WdlQ2ADlhZUu: the agent's page says in words what
// is not there, through Absence's `say`. A person's page is the same src/web/pages/ProfilePage.tsx, so the person case
// meets the same sentences. Before that decision every gap here was the dash, and this test expected the dash; the
// expectation followed the decision in wave 13k round 41b. Every other gap on these pages is still the dash. Control
// .scratch/r41b/p2-control-b.log; a said gap drawn with a full stop added turns the person and agent cases red (p2-m3);
// restore p2-restore.
const SAID_GAPS = ['g6b.profile.noStatus', 'g6b.profile.noRuntime', 'g6b.profile.noGroup', 'g6b.profile.noWorld', 'g6b.profile.noCredential', 'g6b.profile.nothingFiled', 'g6b.profile.noMachines', 'g6b.profile.noVisits', 'g6b.profile.retiredNothingSaid', 'g6b.profile.noWorkArea'] as const
const saidIn = (language: 'en' | 'zh' | 'xx') => SAID_GAPS.map((key) => createI18n(language).t(key))
// THE CARDS SAY THEIR GAPS TOO. Your card and their card (src/web/components/YourCard.tsx, TheirCard.tsx) pass `say` to
// Absence since wave 13q round 41, following the same decision WdlQ2ADlhZUu; before it this test expected no said gap on
// either, and that expectation followed the decision. Each card says only its own sentences.
const SAID_ON_A_CARD = {
  'your-card': ['g6b.yourCard.noCardSays', 'g6b.yourCard.noOccupationSays', 'g6b.yourCard.noPictureSays', 'g6b.yourCard.noPicturesSays'],
  'their-card': ['g6b.notebook.noNotebook', 'g6b.cardUnchosen', 'g6b.profile.periodNothingYet'],
} as const
const saidOnACard = (which: keyof typeof SAID_ON_A_CARD, language: 'en' | 'zh' | 'xx') => SAID_ON_A_CARD[which].map((key) => createI18n(language).t(key))
const contentSelectors = '.tc-chosen-by,.prof-name,.prof-when,.tc-card-name,.tc-card-duties,.tc-value,.yc-value,.nb-words,.nb-when,.rol-name,.rol-for,.hiw,.rol-power,.rol-says,.rol-elev-says,.rol-tree-name,.rol-node-name,.rol-tree-acts,.tls-name,.tls-does,.tls-title:not([data-title-is]),.tls-facts,.tls-fact-value,.tls-category-name,.tls-jump,.tls-category-says,.tls-part-text,.tls-part,.tls-developer-field dd,.tls-how-list,.px-panel-title:not([data-title-is]),.px-avatar,.avatar,.rol-tree-note,.rol-standing'
it.each(pages)('%s passes the four page checks in Chinese and the test language, including ordinary gaps', async (which) => {
  for(const empty of [false,true])for(const language of ['zh','xx'] as const) {
    await draw(which,language,empty)
    const visible=await page.locator('#test').evaluate(root=>{const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const words=[];while(walker.nextNode()){const el=walker.currentNode.parentElement;if(el&&!el.closest('style,script,.px-sr')&&el.checkVisibility({checkVisibilityCSS:true}))words.push(walker.currentNode.textContent)}return words.join(' ')})
    expect(visible,which).not.toMatch(/(?:ID|HANDLE|PATH|KEY|RUN|PORT|DATABASE|BRANCH|RAW_FIELD|DOOR|ENTRY|NOTE|TOOL|CAT|REQUEST)_SENTINEL/)
    // Only a word waiting for its Chinese may fall back, as the coded-refusal and decisions tests read
    // it. This expected no fallback at all until wave 13u round 21, when the
    // agent page's Quick inputs part
    // brought English-only words to a Chinese page.
    const fallbacks:{key:string}[]=await page.evaluate(()=>(window as any).g6b.check().fallbacks)
    expect(notWaitingForTranslation(fallbacks.map(one=>one.key)),which).toEqual([])
    const ordinary=await page.locator('.px-absent:not(.px-absent-said)').evaluateAll(nodes=>nodes.map(node=>Array.from(node.childNodes).filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').trim()))
    for(const mark of ordinary)expect(mark,which).toBe(language==='xx'?'⟦—·⟧':'—')
    // A said gap is one of the profile page's own sentences, in the page's language; in the test language, its
    // test-language form. The profile page and the two cards say their gaps; an empty card says at least one.
    const said=await page.locator('.px-absent-said').evaluateAll(nodes=>nodes.map(node=>(node.textContent??'').trim()))
    if(which==='person'||which==='agent'){
      expect(said.length,which).toBeGreaterThan(0)
      for(const sentence of said)expect(saidIn(language as 'en'|'zh'|'xx'),`${which} ${language}`).toContain(sentence)
    }else if(which==='your-card'||which==='their-card'){
      if(empty)expect(said.length,`${which} ${language}, drawn empty`).toBeGreaterThan(0)
      for(const sentence of said)expect(saidOnACard(which,language as 'en'|'zh'|'xx'),`${which} ${language}`).toContain(sentence)
    }else expect(said,which).toEqual([])
    // 'nothing in this project' left this list with decision WdlQ2ADlhZUu: it is g6b.profile.nothingFiled, which the
    // profile page now says in place of the dash. The server's own sentences for the same gaps stay out of Normal mode.
    expect(visible,which).not.toMatch(/Empty visits sentence|Empty filed sentence|no tools listed|Nothing is written in this notebook yet|nobody has painted one yet|尚无图片/)
    if(language==='xx'){
      const unmarked=await page.locator('#test').evaluate((root,excluded)=>{
        const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const bad=[];
        while(walker.nextNode()){
          const node=walker.currentNode;const el=node.parentElement;const text=node.textContent?.trim()??'';
          if(!el||el.closest('style,script,option,.px-sr,'+excluded)||!el.checkVisibility({checkVisibilityCSS:true}))continue;
          if(!/[A-Za-z\u3400-\u9fff]/.test(text.replace(/⟦[^⟧]*⟧/g,'').replace('Morgan Vale','')))continue;
          // Values supplied as content, including role names from the declaration.
          if(['Cartographer','Greenhouse keeper','Agent','Person','Garden survey'].includes(text))continue;
          bad.push({text,tag:el.className});
        }return bad;
      },contentSelectors)
      expect(unmarked,which).toEqual([])
    }
  }
},120_000)

it('asks before retirement, every kind of refusal and notebook removal; cancel sends nothing', async () => {
  for(const which of ['ask-card','ask-admit','ask-new-key','agent','notebook']) {
    await draw(which)
    const before=await page.evaluate(()=>(window as any).g6b.calls.length)
    let button=page.getByRole('button',{name:en['g6b.ask.refuse'],exact:true})
    if(which==='agent'){
      await page.getByRole('button',{name:en['g6b.profile.retire'],exact:true}).click()
      const form=page.locator('.prof-retire')
      expect(await form.getByRole('button',{name:en['g6b.profile.retire'],exact:true}).isDisabled()).toBe(true)
      await form.getByRole('textbox').fill('The garden survey is complete.')
      button=form.getByRole('button',{name:en['g6b.profile.retire'],exact:true})
    }
    if(which==='notebook')button=page.getByRole('button',{name:en['g6b.notebook.removePress'],exact:true})
    await button.click()
    expect(await page.evaluate(()=>(window as any).g6b.calls.length)).toBe(before)
    const dialog=page.getByRole('dialog')
    await dialog.waitFor()
    expect(await dialog.locator('blockquote').innerText()).toContain(which==='notebook'?'The greenhouse roof is ready.':'Rowan Vale')
    expect(await page.evaluate(()=>(window as any).g6b.calls.length)).toBe(before)
    await dialog.getByRole('button').first().click()
    expect(await page.evaluate(()=>(window as any).g6b.calls.length)).toBe(before)
    await button.click()
    await page.getByRole('dialog').getByRole('button').last().click()
    await page.waitForFunction(before=>(window as any).g6b.calls.length===before+1,before)
    if(which==='agent')expect(await page.evaluate(()=>(window as any).g6b.calls.at(-1))).toEqual({handle:'HANDLE_SENTINEL',why:'The garden survey is complete.'})
  }
})

it('fits at 1440, 660 and 390 in light and keeps Chinese at 1440 readable', async () => {
  for(const which of pages)for(const language of ['en','zh'])for(const theme of ['light'] as const)for(const width of language==='zh'?[1440]:[1440,660,390]) {
    await page.setViewportSize({width,height:1000})
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme)
    await draw(which,language)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),`${which} ${width}`).toBeLessThanOrEqual(1)
    if(which==='toolset'&&width===660)expect(await page.locator('.tls-does').evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(160)
  }
  if(shots)for(const which of pages)for(const language of ['en','zh'])for(const theme of ['light','dark'] as const)for(const width of language==='zh'?[1440]:[1440,990,660,390]) {
    await page.setViewportSize({width,height:1000})
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme)
    await draw(which,language)
    await page.screenshot({path:`${shots}/${which}-${width}-${theme}-${language}.png`,fullPage:true})
  }
},120_000)
