// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TWO FILES A FORWARD STABLE UPGRADE ASKS IN ITS CANDIDATE, MADE UP for the synthetic upgrade fixtures: the word
 * counter and the notice contract (tools/stable/upgrade-stable.criteria.md, item 15 (d)). This module starts nothing
 * and has no hooks, so any fixture may import it.
 */
import { join } from 'node:path'

/**
 * A made-up tools/stable/untranslated-words.mjs. It counts what the file `untranslated-count` in `folder` says, 0 when
 * there is none, and throws while `untranslated-count.fails` is there.
 */
export const aMadeUpWordCounter = (folder: string) => `import{existsSync,readFileSync}from'node:fs';
export function translationStatus(){if(existsSync(${JSON.stringify(join(folder, 'untranslated-count.fails'))}))throw Error('The made-up word list cannot be read.');const n=existsSync(${JSON.stringify(join(folder, 'untranslated-count'))})?Number(readFileSync(${JSON.stringify(join(folder, 'untranslated-count'))},'utf8')):0;return{englishCount:10,untranslatedCount:n,missing:[],sourceReviewCount:0,sourceReviews:[]}}
`
/**
 * A made-up src/shared/stable-upgrade-notices.ts with the two outcome contracts the upgrade asks. Each takes a count, and
 * drops it while the file `notice-door-refuses-a-count` is in `folder`, as a version written before the count would.
 */
export const aMadeUpNoticeContract = (folder: string) => `import{existsSync}from'node:fs';
const contract={safeParse(value:any){if(value===null||typeof value!=='object'||value.state!=='completed')return{success:false,error:{message:'not a completed outcome'}};if(!existsSync(${JSON.stringify(join(folder, 'notice-door-refuses-a-count'))}))return{success:true,data:value};const{untranslatedWords,...rest}=value;return{success:true,data:rest}}};
export const stableUpgradeOutcomeSchema=contract;export const stableEmergencyOutcomeSchema=contract;
`
