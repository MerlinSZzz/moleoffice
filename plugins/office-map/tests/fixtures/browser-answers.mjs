// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
const common={interface:'office-read/1',narrowedByPermission:null}
const projects={...common,view:'projects',projects:[{id:'garden',name:'Example Garden'},{id:'library',name:'Example Library'}]}
export const names=['tuft','fringe','bun','fan','crest','helmet','waves','part','beret','knit','raincoat','apron','bowtie','backpack','roll','flower']
function hash(v){let h=2166136261;for(const c of v){h^=c.codePointAt(0);h=Math.imul(h,16777619)}return h>>>0}
// Deliberately choose synthetic ids that exercise all sixteen fallback looks in catalogue order.
export const ids=names.map((_,i)=>{for(let n=0;;n++){const id='sample-'+i+'-'+n;if(hash(JSON.stringify(['agent',id]))%16===i)return id}})
function roster(count){
 const agents=Array.from({length:count},(_,i)=>({kind:'agent',id:ids[i]??'sample-'+i,handle:'example-'+i,name:'Example '+String(i+1).padStart(2,'0'),role:i%16===0?'supervisor':i%16===4?'supervisor':[8,9].includes(i%16)?'inspector':[10,11].includes(i%16)?'secretary':[12,13].includes(i%16)?null:'worker',retired:false,visitor:[14,15].includes(i%16),startedBy:null,createdAt:'2026-01-01 10:'+String(i).padStart(2,'0')+':00',projects:[i%2?'library':'garden'],appearance:{version:99,fixture:'standing-catalogue'},appearanceChosen:true,scale:{version:1,roleAtGeneration:'worker',value:.85},presence:[{project:i%2?'library':'garden',colour:'green',word:'Available'}]}))
 for(let i=0;i<agents.length;i++)if(agents[i].role==='worker')agents[i].startedBy={kind:'agent',id:agents[i%16<4?0:4]?.id??agents[0].id}
 return {...common,view:'people',people:[{kind:'person',id:'reader',handle:'reader',name:'Example Reader'}],agents}
}
export let people=roster(16)
export function setPeople(count){people=roster(count)}
const details=['executing','checking','recorded_work','waiting_check','rebuttal','reporting','queued','idle','waiting_message','paused','blocked','failed','completed','task_completed','work_open','unknown']
function work(){return {...common,view:'work',work:people.agents.map((a,i)=>({id:'work-'+i,project:i%2?'library':'garden',agent:a.id,title:'Example work '+String(i+1).padStart(2,'0'),detail:details[i%16],recordedState:{state:'fixture'},doing:'Example activity',executing:i<2,association:'explicit synthetic work',updatedAt:'2026-10-15 08:00:00',runStanding:i%16===12?'closed':i%16===13?'closed unchecked':'working'}))}}
const zero={candidates:0,carried:0,leftOut:0,shortened:0}
export let talk={...common,view:'talk',messages:[],last:null,more:false,subtraction:zero,leftOutGroups:[],refusal:null,withdrawn:{ids:[],last:'0',more:false,subtraction:zero,leftOutGroups:[]}}
export function setTalk(value){talk=value}
// Keep the query rules shared by browser and synthetic measurement worlds.
// This function is also serialized into the synthetic shell, so it has no closure dependencies.
export function answerViews(view, query = {}, views) {
 const { projects, people, work, talk } = views
 const selected = new Set((query.agents ?? '').split(',').filter(Boolean))
 const known = new Set(people.agents.map(agent => agent.id))
 const notAgents = [...selected].filter(id => !known.has(id))
 switch (view) {
  case 'projects': return projects
  case 'roster': return { ...people, view: 'roster' }
  case 'people': return { ...people, agents: people.agents.filter(agent => selected.has(agent.id)), notAgents }
  case 'work': return { ...work, work: work.work.filter(row => selected.has(row.agent)), notAgents }
  case 'talk': return talk
  case 'online': return { interface: 'office-read/1', narrowedByPermission: null, view: 'online', agents: people.agents.map(agent => ({ id: agent.id, online: true })) }
  case 'asleep': return { interface: 'office-read/1', narrowedByPermission: null, view: 'asleep', agents: [] }
  default: return null
 }
}
export function browserAnswer(view, query = {}) {
 return answerViews(view, query, { projects, people, work: view === 'work' ? work() : null, talk })
}
