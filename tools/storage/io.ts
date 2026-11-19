// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { existsSync as requireExists } from 'node:fs'
import { createHash } from 'node:crypto'
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, opendirSync, readSync, realpathSync, writeSync, fsyncSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
export const IO_BYTES = 64 * 1024
export const MAX_METADATA_BYTES = 256 * 1024
export function safeKey(key:string):string {
 if(!key || key.includes('\\') || key.includes('\0') || isAbsolute(key) || key.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('Unsafe manifest path.')
 return key
}
export function plainPath(path:string):void {
 const absolute=resolve(path)
 if(realpathSync(absolute)!==absolute)throw new Error('A path contains a symbolic link.')
 const s=lstatSync(absolute)
 if(!s.isDirectory()&&(!s.isFile()||s.nlink!==1))throw new Error('A path is not a plain file or is a hard link.')
}
export function directory(path:string,privateMode=false):void {let ancestor=resolve(path);while(!requireExists(ancestor))ancestor=dirname(ancestor);plainPath(ancestor);mkdirSync(path,{recursive:true,mode:privateMode?0o700:0o755});plainPath(path);if(!lstatSync(path).isDirectory())throw new Error('Expected a directory.');if(privateMode&&(lstatSync(path).mode&0o777)!==0o700)throw new Error('The host spool directory must be private (0700).')}
export function inside(root:string,path:string):boolean {const r=relative(resolve(root),resolve(path));return r===''||(!r.startsWith(`..${sep}`)&&r!=='..'&&!isAbsolute(r))}
/** Every plain file under root. `folders` is told each folder's stamp before the folder is read, so an entry added later changes it. */
export function* walk(root:string,prefix='',folders?:(path:string,stamp:string)=>void):Generator<{path:string;key:string;size:number}> {
 plainPath(root);folders?.(root,stamp(lstatSync(root)));const dir=opendirSync(root)
 try{for(let entry=dir.readSync();entry!==null;entry=dir.readSync()){
  const key=prefix?`${prefix}/${entry.name}`:entry.name;safeKey(key);const path=join(root,entry.name);plainPath(path)
  if(entry.isDirectory())yield* walk(path,key,folders);else if(entry.isFile())yield{path,key,size:lstatSync(path).size};else throw new Error('A destination or storage entry is not a plain file.')
 }}finally{dir.closeSync()}
}
export const stamp=(s:ReturnType<typeof fstatSync>):string=>[s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs].join(':')
/** Hash and optionally copy through one fixed buffer, checking the opened inode and the path again. */
export function transfer(path:string,to?:string):{size:number;sha256:string;stamp:string}{
 plainPath(path);const before=lstatSync(path);if(!before.isFile())throw new Error('Expected a plain file.')
 const input=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);let output:number|undefined
 try{
  if(stamp(before)!==stamp(fstatSync(input)))throw new Error('The source changed while opening it.')
  if(to){directory(dirname(to));output=openSync(to,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600)}
  const buffer=Buffer.alloc(IO_BYTES),hash=createHash('sha256');let size=0
  for(;;){const n=readSync(input,buffer,0,buffer.length,null);if(n===0)break;hash.update(buffer.subarray(0,n));size+=n;if(output!==undefined){let at=0;while(at<n)at+=writeSync(output,buffer,at,n-at)}}
  if(output!==undefined)fsyncSync(output)
  plainPath(path)
  if(stamp(before)!==stamp(fstatSync(input))||stamp(before)!==stamp(lstatSync(path)))throw new Error('The source changed while reading it.')
  return{size,sha256:hash.digest('hex'),stamp:stamp(before)}
 }finally{closeSync(input);if(output!==undefined)closeSync(output)}
}
export function durableJSON(file:string,value:unknown):void {const fd=openSync(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{writeSync(fd,JSON.stringify(value)+'\n');fsyncSync(fd)}finally{closeSync(fd)}}
export function syncDirectory(folder:string):void{const fd=openSync(folder,constants.O_RDONLY|constants.O_DIRECTORY);try{fsyncSync(fd)}finally{closeSync(fd)}}
