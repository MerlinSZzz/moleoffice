// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import Database from 'better-sqlite3'
import { existsSync,lstatSync,realpathSync } from 'node:fs'
import { dirname,join,relative,resolve } from 'node:path'
import { STORAGE_STORES } from '../../../shared/storage/categories.ts'
/** One indexed lookup only. A missing file is called omitted only when a verified restore declared that path. */
export function declaredStorageOmission(database:string,path:string):boolean{
 const root=dirname(resolve(database)),key=relative(root,resolve(path)).split('\\').join('/')
 if(!STORAGE_STORES.some(store=>key.startsWith(store+'/'))||key.split('/').some(p=>p==='..'))return false
 const file=join(root,'storage-omissions.sqlite');if(!existsSync(file))return false
 const s=lstatSync(file);if(!s.isFile()||s.nlink!==1||realpathSync(file)!==resolve(file))throw new Error('The restored omission index is not a plain file.')
 const db=new Database(file,{readonly:true,fileMustExist:true})
 try{return db.prepare("SELECT 1 FROM omissions WHERE path=? AND reason IN ('policy','threshold','limit','unsafe-source') LIMIT 1").get(key)!==undefined}finally{db.close()}
}
