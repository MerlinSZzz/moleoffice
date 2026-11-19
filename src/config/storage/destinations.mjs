// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Nonsecret settings are readable offline without an office request. No transport runs here.
import { createRequire } from 'node:module'
import { z } from 'zod'
import { DESTINATION_SETTING,DESTINATION_MAX,destinationShape } from '../../shared/storage/destinations.ts'
export { DESTINATION_SETTING,DESTINATION_MAX,DEFAULT_UPLOAD_POLICY,DEFAULT_DESTINATION_LIMIT_BYTES,destinationShape } from '../../shared/storage/destinations.ts'
const listShape=z.array(destinationShape).max(DESTINATION_MAX).refine(rows=>new Set(rows.map(row=>row.name)).size===rows.length)
/** @param {import('better-sqlite3').Database} db */
export function readDestinations(db) {
  const row=/** @type {{value:string}|undefined} */(db.prepare('SELECT CASE WHEN length(CAST(value AS BLOB)) <= 262144 THEN value ELSE NULL END AS value FROM runtime_settings WHERE name = ?').get(DESTINATION_SETTING))
  if(row===undefined)return []
  try { return listShape.parse(JSON.parse(row.value)) } catch { throw new Error('The saved destination settings cannot be read safely.') }
}
/** Read only the one nonsecret settings row. No server or office request, inventory scan or secret read.
 * @param {string} file
 */
export function readDestinationsOffline(file) {
  const Database=createRequire(import.meta.url)('better-sqlite3')
  const db=new Database(file,{readonly:true,fileMustExist:true})
  try{return readDestinations(db)}finally{db.close()}
}
