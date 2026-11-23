// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Versioned original JSON text beside readable archive values; no identity rewriting or hash replacement. */
import type Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { theTextBetween, type APlaceInAFile } from '../export-grammar.ts'
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
/** A refusal of the history bytes, at the place in the archive it is about. */
export class HistoryBytesRefused extends Error {
  constructor(readonly path:string, readonly line:number, message:string) {super(message)}
}
/** The page row accepted for a readable row, and its page's file and path, so its texts can be read again to be written. */
const ACCEPTED = new WeakMap<object,{row:AnAcceptableRow;file:string;path:string}>()
/**
 * The original text of each history column of a row, as a digest: of an accepted readable row, and of a stored row. A
 * text is digestOf it, a null is null, and a stored value that is not text is itself. Two rows hold the same original
 * text where these are equal, so the texts are compared without either being held.
 */
const DIGESTS = new WeakMap<object,Readonly<Record<string,unknown>>>()
function invalid(reason:string,at:{path:string;line:number}):never { throw new HistoryBytesRefused(at.path,at.line,`Archive history bytes are invalid: ${reason}.`) }
function object(value:unknown):value is Row {return value!==null && typeof value==='object' && !Array.isArray(value)}
function keys(row:Row,expected:readonly string[]):boolean {return sameKeys(Object.keys(row),expected)}
function sameKeys(list:readonly string[],expected:readonly string[]):boolean {return [...list].sort().join(',')===[...expected].sort().join(',')}
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
// ============================================================================ accepting the pages, a row at a time

/**
 * Where a page row is: the line it starts on, how far into that line it starts, in characters, and the byte just after
 * the line it ends on.
 */
export interface APlaceInAPage extends APlaceInAFile { column:number; end:number }
/** One column's text in a page row, as acceptance needs it: the problem with it, or digests of it and of what it says. */
type AText = {problem:string} | {readable:string; raw:string|null}
/** What acceptance needs of one page row, found as the row is read: its problem, or its key and its texts' digests. */
export type APageRow = {problem:string} | AnAcceptableRow
export interface AnAcceptableRow { key:string; texts:[column:string,text:AText][]; place:APlaceInAPage|undefined }
/**
 * What acceptance needs of one page, and where the page is: whether its value is an object, its keys, its version,
 * and its rows. rows is null when the page's rows are not a list.
 */
export interface APage { path:string; line:number; object:boolean; keys:string[]; version:unknown; rows:APageRow[]|null }

/** A digest of a text, made from its UTF-16 code units, so texts that differ only in a lone surrogate still differ. */
export function digestOf(text:string):string {return createHash('sha256').update(text,'utf16le').digest('base64')}
/** The digests a page row's texts are compared with: of each history column of a readable row, as JSON. */
export function readableDigestsOf(region:string,values:Row):Record<string,string|undefined> {
  return Object.fromEntries(Object.keys(COLUMNS[region]??{}).map(column=>{const text=JSON.stringify(values[column]) as string|undefined;return [column,text===undefined?undefined:digestOf(text)]}))
}
/** Whether a region's rows have history bytes. */
export function hasHistoryBytes(region:string):boolean {return COLUMNS[region]!==undefined}

/**
 * The checks of one page row that need nothing but the row, in the order acceptance makes them. A text is kept only as
 * digests, so a page row costs a small entry and not its text.
 */
export function aPageRow(item:unknown,place:APlaceInAPage|undefined):APageRow {
  if(!object(item)||!keys(item,['region','id','columns'])||typeof item['region']!=='string'||typeof item['id']!=='string'||!object(item['columns'])) return {problem:'malformed row'}
  const columns=COLUMNS[item['region']], raw=item['columns']
  if(!columns||!keys(raw,Object.keys(columns))) return {problem:'unknown region or missing JSON columns'}
  const texts=Object.keys(columns).map((column):[string,AText]=>{
    const text=raw[column]
    if(text!==null&&typeof text!=='string') return [column,{problem:'a stored JSON value is not text or null'}]
    let parsed:unknown
    try {parsed=text===null?null:JSON.parse(text)} catch {return [column,{problem:'a stored JSON value cannot be parsed'}]}
    return [column,{readable:digestOf(JSON.stringify(parsed)),raw:text===null?null:digestOf(text)}]
  })
  return {key:JSON.stringify([item['region'],item['id']]),texts,place}
}

/**
 * The pages, of the capability the manifest names, must between them cover exactly the readable historical rows and
 * agree with them before any raw bytes can be bound. The first capability has one envelope, anywhere in the archive;
 * the second has one on each page in HISTORY_BYTES_FOLDER and none elsewhere. `expected` holds readableDigestsOf of
 * each readable row, by its key. Each row is handed to `accepted` as soon as it is accepted, so a refusal leaves the
 * rows before it accepted. The first problem met is thrown.
 */
export function acceptThePages(pages:Iterable<APage>,version:number,expected:ReadonlyMap<string,Readonly<Record<string,string|undefined>>>,accepted:(row:AnAcceptableRow)=>void):void {
  const seen=new Set<string>()
  let first:APage|undefined
  for(const page of pages) {
    first??=page
    if(version===HISTORY_BYTES_VERSION && !page.path.startsWith(`${HISTORY_BYTES_FOLDER}/`)) invalid(HISTORY_BYTES_REFUSALS.offThePages,page)
    if(!page.object||!sameKeys(page.keys,['version','rows'])||page.version!==version||page.rows===null) invalid('unknown envelope shape or version',page)
    for(const row of page.rows) {
      if('problem' in row) invalid(row.problem,page)
      const want=expected.get(row.key)
      if(!want||seen.has(row.key)) invalid(HISTORY_BYTES_REFUSALS.duplicate,page)
      seen.add(row.key)
      for(const [column,text] of row.texts) {
        if('problem' in text) invalid(text.problem,page)
        if(text.readable!==want[column]) invalid('stored text disagrees with the readable payload',page)
      }
      accepted(row)
    }
  }
  if(seen.size!==expected.size) invalid(HISTORY_BYTES_REFUSALS.omitted,version===HISTORY_BYTES_VERSION?{path:`${HISTORY_BYTES_FOLDER}/`,line:0}:first!)
}

/**
 * The pages, each as readAPage read it from `file`, accepted as acceptThePages accepts them. As soon as a row is
 * accepted, its readable row is given the digests of its texts, for comparing, and the page row, for reading them again.
 */
export function acceptHistoryBytes(pages:readonly {page:APage;file:string}[],version:number,selection:Iterable<readonly [string,readonly {values:Row}[]]>):void {
  const expected=new Map<string,Row>(), digests=new Map<string,Record<string,string|undefined>>()
  for(const [region,rows] of selection) if(COLUMNS[region]) for(const row of rows) {
    const key=JSON.stringify([region,row.values['id']])
    expected.set(key,row.values); digests.set(key,readableDigestsOf(region,row.values))
  }
  /** The page being accepted: its rows are handed to the callback before the next page is asked for. */
  let at:{page:APage;file:string}|undefined
  function* read():Generator<APage> {for(const one of pages) {at=one; yield one.page}}
  acceptThePages(read(),version,digests,row=>{
    const values=expected.get(row.key)!
    ACCEPTED.set(values,{row,file:at!.file,path:at!.page.path})
    DIGESTS.set(values,Object.fromEntries(row.texts.map(([column,text])=>[column,'raw' in text?text.raw:undefined])))
  })
}

// ============================================================================ reading a page forward

/** A page whose text the row reader cannot follow. Its file is then read whole by the grammar, for its words. */
export class APageNotReadRowByRow extends Error {
  constructor() {super('This history-bytes page is not JSON the row reader can follow.')}
}
const QUOTE=0x22, BACKSLASH=0x5c, COMMA=0x2c, COLON=0x3a, OPEN_OBJECT=0x7b, CLOSE_OBJECT=0x7d, OPEN_LIST=0x5b, CLOSE_LIST=0x5d
/** JSON's whitespace, and nothing else: JSON.parse accepts no other. */
const SPACE=new Set([0x20,0x09,0x0a,0x0d])
const STRING_STOP=/["\\]/g
function parsed(text:string):unknown {try {return JSON.parse(text) as unknown} catch {throw new APageNotReadRowByRow()}}

/**
 * The text of a JSON block, `lines.join('\n')`, read forward a line at a time, so a page can be taken one value at a
 * time. Where a value ends is found from its strings and brackets alone, and JSON.parse reads each value, so what it
 * reads is what JSON.parse reads of the whole text. What it cannot follow is thrown as APageNotReadRowByRow, and any
 * text it throws for is text that JSON.parse refuses too.
 */
class Forward {
  private line:ALine={text:'',start:undefined,end:0}
  private at=0
  /** The line after this one: undefined while not looked at, null when there is none. */
  private ahead:ALine|null|undefined
  /** Where the value read last is, when the lines come with their places. */
  last:APlaceInAPage|undefined
  constructor(private readonly lines:Iterator<string>,private readonly where:APlaceInAFile|undefined,column=0) {
    const first=this.pull()
    if(first===null) this.ahead=null
    else {this.line=first; this.at=column}
  }
  private get text():string {return this.line.text}
  private pull():ALine|null {
    const start=this.where===undefined?undefined:{offset:this.where.offset,line:this.where.line}
    const step=this.lines.next()
    return step.done===true?null:{text:step.value,start,end:this.where?.offset??0}
  }
  /** Go on to the next line, or say there is none. */
  private nextLine():boolean {
    if(this.ahead===undefined) this.ahead=this.pull()
    if(this.ahead===null) return false
    this.line=this.ahead; this.at=0; this.ahead=undefined
    return true
  }
  /** The next character's code, a line's end reading as a newline; undefined at the end of the text. */
  peek():number|undefined {
    if(this.at<this.text.length) return this.text.charCodeAt(this.at)
    if(this.ahead===undefined) this.ahead=this.pull()
    return this.ahead===null?undefined:0x0a
  }
  take():void {if(this.at<this.text.length) this.at+=1; else if(!this.nextLine()) throw new APageNotReadRowByRow()}
  space():void {for(let c=this.peek();c!==undefined&&SPACE.has(c);c=this.peek()) this.take()}
  expect(code:number):void {if(this.peek()!==code) throw new APageNotReadRowByRow(); this.take()}
  /** The text of the one JSON value that starts here, not yet parsed. Its place is then `last`. */
  value():string {
    const start=this.line.start, column=this.at
    const parts:string[]=[]
    let from=this.at, depth=0, inString=false
    const first=this.text.charCodeAt(this.at)
    const scalar=first!==QUOTE&&first!==OPEN_OBJECT&&first!==OPEN_LIST
    for(;;) {
      if(this.at>=this.text.length) {
        if(scalar) break
        // JSON has no line end inside a string, and a value that does not end before the text does is not JSON.
        if(inString) throw new APageNotReadRowByRow()
        parts.push(this.text.slice(from))
        if(!this.nextLine()) throw new APageNotReadRowByRow()
        from=0
        continue
      }
      if(inString) {
        STRING_STOP.lastIndex=this.at
        const stop=STRING_STOP.exec(this.text)
        if(stop===null) {this.at=this.text.length; continue}
        if(this.text.charCodeAt(stop.index)===BACKSLASH) {this.at=stop.index+2; continue}
        inString=false; this.at=stop.index+1
        if(depth===0) break
        continue
      }
      const c=this.text.charCodeAt(this.at)
      if(scalar) {if(c===COMMA||c===CLOSE_OBJECT||c===CLOSE_LIST||SPACE.has(c)) break}
      else if(c===QUOTE) inString=true
      else if(c===OPEN_OBJECT||c===OPEN_LIST) depth+=1
      else if(c===CLOSE_OBJECT||c===CLOSE_LIST) {depth-=1; if(depth===0) {this.at+=1; break}}
      this.at+=1
    }
    parts.push(this.text.slice(from,this.at))
    this.last=start===undefined?undefined:{...start,column,end:this.line.end}
    return parts.join('\n')
  }
}
/** A line of a page, with where it starts and the byte after it, when the lines come with their places. */
interface ALine { text:string; start:APlaceInAFile|undefined; end:number }

/**
 * One page, read from the lines of its JSON block one row at a time: what acceptance needs of it, with each row's place
 * when `where` is the place linesOf moves on. Only the row being read is held. A key given twice counts as JSON.parse
 * counts it, the last time.
 */
export function readAPage(body:Iterable<string>,at:{path:string;line:number},where?:APlaceInAFile):APage {
  const text=new Forward(body[Symbol.iterator](),where)
  text.space()
  if(text.peek()!==OPEN_OBJECT) {
    parsed(text.value())
    text.space()
    if(text.peek()!==undefined) throw new APageNotReadRowByRow()
    return {...at,object:false,keys:[],version:undefined,rows:null}
  }
  text.take()
  const keys=new Set<string>()
  let version:unknown, rows:APageRow[]|null=null
  text.space()
  if(text.peek()===CLOSE_OBJECT) text.take()
  else for(;;) {
    if(text.peek()!==QUOTE) throw new APageNotReadRowByRow()
    const key=parsed(text.value()) as string
    text.space(); text.expect(COLON); text.space()
    keys.add(key)
    if(key==='rows'&&text.peek()===OPEN_LIST) {
      rows=[]
      text.take(); text.space()
      if(text.peek()===CLOSE_LIST) text.take()
      else for(;;) {
        const item=parsed(text.value())
        rows.push(aPageRow(item,text.last))
        text.space()
        if(text.peek()===CLOSE_LIST) {text.take(); break}
        text.expect(COMMA); text.space()
      }
    } else {
      const value=parsed(text.value())
      if(key==='rows') rows=null
      if(key==='version') version=value
    }
    text.space()
    if(text.peek()===CLOSE_OBJECT) {text.take(); break}
    text.expect(COMMA); text.space()
  }
  text.space()
  if(text.peek()!==undefined) throw new APageNotReadRowByRow()
  return {...at,object:true,keys:[...keys],version,rows}
}

/**
 * The texts of an accepted page row, read again from the bytes of its lines in `file`, after a check that it is the
 * row the first reading accepted. A row that is not is thrown, never written. The bytes are cut at line ends, so they
 * decode to the lines the first reading read. `path` is the page's path in the archive, for the message.
 */
export function theTextsOf(row:AnAcceptableRow,file:string,path:string):Readonly<Record<string,string|null>> {
  const place=row.place
  if(place===undefined) throw new Error(`The history-bytes row ${row.key} was read with no place, so it cannot be read again.`)
  let item:unknown
  try {item=parsed(new Forward(theTextBetween(file,place.offset,place.end).split('\n').values(),undefined,place.column).value())}
  catch(err) {if(!(err instanceof APageNotReadRowByRow)) throw err}
  if(item===undefined||JSON.stringify(aPageRow(item,place))!==JSON.stringify(row)) {
    throw new Error(`${path}:${String(place.line)} — the history-bytes row ${row.key} read again is not the row the first reading accepted, so the import writes nothing.`)
  }
  return (item as ByteRow).columns
}

/** The original texts of a readable row whose page row was accepted, read again from its page; undefined for any other row. */
export function historyTextsOf(values:Row):Readonly<Record<string,string|null>>|undefined {
  const accepted=ACCEPTED.get(values)
  return accepted===undefined?undefined:theTextsOf(accepted.row,accepted.file,accepted.path)
}
/** A stored original text as DIGESTS keeps it: digestOf a text, and anything else as it is. */
export function rawDigestOf(text:unknown):unknown {return typeof text==='string'?digestOf(text):text}
/** Keep the digests of a stored row's original texts, read from `raw`, the row as SQLite gave it. */
export function keepStoredHistoryDigests(region:string,row:Row,raw:Row):void {
  const columns=COLUMNS[region]
  if(columns) DIGESTS.set(row,Object.fromEntries(Object.entries(columns).map(([name,sql])=>[name,rawDigestOf(raw[sql])])))
}
/** The digest of a row's original text in one column: undefined where the row has none kept. */
export function historyDigest(row:Row,column:string):unknown {return DIGESTS.get(row)?.[column]}
