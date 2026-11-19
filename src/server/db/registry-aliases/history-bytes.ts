// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Versioned original JSON text beside readable archive values; no identity rewriting or hash replacement. */
import type Database from 'better-sqlite3'
/**
 * The capability an export writes: the text on numbered pages in HISTORY_BYTES_FOLDER, one envelope on each. The
 * first capability held all of it in one envelope in HISTORY_BYTES_FILE, which became longer than the longest string
 * Node can make. An import still reads the first.
 */
export const HISTORY_BYTES_VERSION = 2
export const FIRST_HISTORY_BYTES_VERSION = 1
/** Where the first capability kept its one envelope. An export now removes this file. */
export const HISTORY_BYTES_FILE = 'history-bytes.md'
export const HISTORY_BYTES_FOLDER = 'history-bytes'
/** The path of page `n`, counted from 1. */
export function historyBytesPage(n:number):string {return `${HISTORY_BYTES_FOLDER}/${String(n).padStart(4,'0')}.md`}
/**
 * How much a page holds, in characters: 64 MiB of them. A page takes rows in order while the JSON text of its rows,
 * each written compactly, adds up to no more than this. A row that would take it past this starts the next page, and a
 * page always takes its first row, so a larger row is on a page of its own.
 *
 * It counts characters and not bytes, because a page is made as one string, and the longest string Node can make is
 * counted in characters. On the page each row is spread over indented lines, which adds less than the row's own text,
 * so a page of more than one row is under twice this, far under the longest string (about 512 Mi characters). A
 * character is at most 3 bytes in UTF-8, so any page that can be made at all is under 1.5 GiB on disk, which is under
 * the 2 GiB that a read of the whole file allows.
 */
export const HISTORY_BYTES_PAGE_CHARACTERS = 64*1024*1024
/** The words of the refusals a person or a test may look for. */
export const HISTORY_BYTES_REFUSALS = {
  unsupported:'This archive requires a supported history bytes capability.',
  duplicate:'orphan or duplicate row',
  omitted:'the envelopes omit historical rows',
  offThePages:`an envelope of capability ${String(HISTORY_BYTES_VERSION)} belongs on a page in ${HISTORY_BYTES_FOLDER}/`,
} as const
const COLUMNS: Readonly<Record<string, Readonly<Record<string,string>>>> = {
  records:{data:'data'}, revisions:{data:'data',provedHolder:'proved_holder'}, changes:{provedHolder:'proved_holder'},
}
type Row = Record<string,unknown>
interface ByteRow { region:string; id:string; columns:Record<string,string|null> }
export interface HistoryBytes { version:number; rows:ByteRow[] }
/** One envelope as the archive holds it, and where. */
export interface HistoryBytesEnvelope { value:unknown; path:string; line:number }
/** A refusal of the history bytes, at the place in the archive it is about. */
export class HistoryBytesRefused extends Error {
  constructor(readonly path:string, readonly line:number, message:string) {super(message)}
}
const TEXT = new WeakMap<object,Readonly<Record<string,string|null>>>()
function invalid(reason:string,at:{path:string;line:number}):never { throw new HistoryBytesRefused(at.path,at.line,`Archive history bytes are invalid: ${reason}.`) }
function object(value:unknown):value is Row {return value!==null && typeof value==='object' && !Array.isArray(value)}
function keys(row:Row,expected:readonly string[]):boolean {return Object.keys(row).sort().join(',')===[...expected].sort().join(',')}
/**
 * The stored text of the rows selected, page by page, in the order of COLUMNS and then of id. It reads one stored row
 * at a time and holds only the page it is making. A store with no such row still gives one page, with no row, so an
 * import finds the envelope it requires. The database is still being read while a page is handed out, so whoever takes
 * the pages must not use the database until it has taken the last one.
 */
export function* historyBytesPages(db:Database.Database,selection:Iterable<readonly [string,readonly Row[]]>):Generator<HistoryBytes> {
  const selected=new Map(selection)
  let rows:ByteRow[]=[], characters=0, given=0
  for(const [region,columns] of Object.entries(COLUMNS)) {
    const ids=(selected.get(region)??[]).map(row=>String(row['id']))
    const read=db.prepare(`SELECT id,${Object.values(columns).join(',')} FROM ${region} WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id`)
    for(const row of read.iterate(JSON.stringify(ids)) as Iterable<Row>) {
      const byteRow={region,id:String(row['id']),columns:Object.fromEntries(Object.entries(columns).map(([name,sql])=>[name,row[sql] as string|null]))}
      const size=JSON.stringify(byteRow).length
      if(rows.length>0 && characters+size>HISTORY_BYTES_PAGE_CHARACTERS) {
        yield {version:HISTORY_BYTES_VERSION,rows}
        given+=1; rows=[]; characters=0
      }
      rows.push(byteRow); characters+=size
    }
  }
  if(rows.length>0 || given===0) yield {version:HISTORY_BYTES_VERSION,rows}
}
/**
 * The envelopes, of the capability the manifest names, must between them cover exactly the readable historical rows
 * and agree with them before any raw bytes can be bound. The first capability has one envelope, anywhere in the
 * archive; the second has one on each page in HISTORY_BYTES_FOLDER and none elsewhere.
 */
export function acceptHistoryBytes(envelopes:readonly HistoryBytesEnvelope[],version:number,selection:Iterable<readonly [string,readonly {values:Row}[]]>):void {
  const expected=new Map<string,Row>()
  for(const [region,rows] of selection) if(COLUMNS[region]) for(const row of rows) expected.set(JSON.stringify([region,row.values['id']]),row.values)
  const seen=new Set<string>()
  for(const envelope of envelopes) {
    const value=envelope.value
    if(version===HISTORY_BYTES_VERSION && !envelope.path.startsWith(`${HISTORY_BYTES_FOLDER}/`)) invalid(HISTORY_BYTES_REFUSALS.offThePages,envelope)
    if(!object(value)||!keys(value,['version','rows'])||value['version']!==version||!Array.isArray(value['rows'])) invalid('unknown envelope shape or version',envelope)
    for(const item of value['rows']) {
      if(!object(item)||!keys(item,['region','id','columns'])||typeof item['region']!=='string'||typeof item['id']!=='string'||!object(item['columns'])) invalid('malformed row',envelope)
      const columns=COLUMNS[item['region']], raw=item['columns']
      if(!columns||!keys(raw,Object.keys(columns))) invalid('unknown region or missing JSON columns',envelope)
      const key=JSON.stringify([item['region'],item['id']]), row=expected.get(key)
      if(!row||seen.has(key)) invalid(HISTORY_BYTES_REFUSALS.duplicate,envelope)
      seen.add(key)
      for(const column of Object.keys(columns)) {
        const text=raw[column]
        if(text!==null&&typeof text!=='string') invalid('a stored JSON value is not text or null',envelope)
        let parsed:unknown
        try {parsed=text===null?null:JSON.parse(text)} catch {invalid('a stored JSON value cannot be parsed',envelope)}
        if(JSON.stringify(parsed)!==JSON.stringify(row[column])) invalid('stored text disagrees with the readable payload',envelope)
      }
      TEXT.set(row,raw as Record<string,string|null>)
    }
  }
  if(seen.size!==expected.size) invalid(HISTORY_BYTES_REFUSALS.omitted,version===HISTORY_BYTES_VERSION?{path:`${HISTORY_BYTES_FOLDER}/`,line:0}:envelopes[0]!)
}
export function keepStoredHistoryText(region:string,row:Row,raw:Row):void {
  const columns=COLUMNS[region]
  if(columns) TEXT.set(row,Object.fromEntries(Object.entries(columns).map(([name,sql])=>[name,raw[sql] as string|null])))
}
export function historyText(row:Row,column:string):string|null|undefined {return TEXT.get(row)?.[column]}
