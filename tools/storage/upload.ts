#!/usr/bin/env -S node --import tsx
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readDestinationsOffline } from '../../src/config/storage/destinations.mjs'
import { settings } from '../../src/config/settings.mjs'
import { uploadFolder,restoreFolder } from './folder.ts'
import { uploadS3,restoreS3 } from './s3.ts'
export const HELP=`Offline folder and s3 storage

  node --import tsx tools/storage/upload.ts upload --database <office.db> --destination <saved-name>
  node --import tsx tools/storage/upload.ts restore --base <base-pack> [--change <one-change-pack>] --into <new-folder>
  node --import tsx tools/storage/upload.ts restore --database <office.db> --destination <saved-s3-name> --base <base-key> [--change <one-change-key>] --into <new-folder>

Upload reads the saved destination policy and database read-only, never a server.
The database defaults to the installation settings when --database is omitted.
A new destination needs a weekly base; daily changes are cumulative against that base.
Restore checks every SHA256/size and SQLite integrity. It needs the base plus only the chosen change.
The destination retains every earlier pack; optional uploads stop at the saved held limit while core continues.
The host-only journal records every attempt and exact omissions.
A folder needs no credentials. An s3 destination's are read from the host secrets file the settings page writes,
and are never printed. Its restore downloads the packs the receipts name into the private spool first.
An SSH destination cannot be uploaded to yet.
Use --help for these instructions. See tools/storage/README.md for the format and recovery limits.
`
async function main(){
 const args=process.argv.slice(2)
 if(args.includes('--help')||args.length===0){process.stdout.write(HELP);return}
 const command=args.shift();const values=new Map<string,string>()
 for(let i=0;i<args.length;i+=2){const key=args[i]!,value=args[i+1];if(!key.startsWith('--')||!value||value.startsWith('--')||values.has(key))throw new Error('Arguments must be unique --name value pairs.');values.set(key,value)}
 if(command==='upload'){
  if([...values.keys()].some(k=>!['--database','--destination'].includes(k)))throw new Error('Upload accepts only --database and --destination.')
  if(!values.get('--destination'))throw new Error('Upload needs --database <office.db> and --destination <saved-name>.')
  const database=values.get('--database')??settings().databasePath,name=values.get('--destination')!
  const destination=readDestinationsOffline(database).find(d=>d.name===name)
  if(!destination)throw new Error('No saved destination has that name.')
  if(destination.kind==='ssh')throw new Error('An SSH destination cannot be uploaded to yet. Nothing was sent.')
  const receipt=destination.kind==='s3'?await uploadS3({database,destination}):await uploadFolder({database,destination});process.stdout.write(JSON.stringify(receipt)+'\n');return
 }
 if(command==='restore'){
  if(values.has('--destination')){
   if([...values.keys()].some(k=>!['--database','--destination','--base','--change','--into'].includes(k))||!values.has('--base')||!values.has('--into'))throw new Error('Restore from s3 needs --destination, --base and --into, with optional --database and --change.')
   const database=values.get('--database')??settings().databasePath,destination=readDestinationsOffline(database).find(d=>d.name===values.get('--destination'))
   if(!destination)throw new Error('No saved destination has that name.')
   if(destination.kind!=='s3')throw new Error('Only an s3 destination is restored by name. A folder is restored from its pack folders without --destination.')
   const result=await restoreS3({database,destination,base:values.get('--base')!,change:values.get('--change'),into:values.get('--into')!});process.stdout.write(JSON.stringify(result)+'\n');return
  }
  if([...values.keys()].some(k=>!['--base','--change','--into'].includes(k))||!values.has('--base')||!values.has('--into'))throw new Error('Restore needs --base and --into, with optional --change.')
  const result=restoreFolder({base:values.get('--base')!,change:values.get('--change'),into:values.get('--into')!});process.stdout.write(JSON.stringify(result)+'\n');return
 }
 throw new Error('Choose upload or restore; --help explains both.')
}
main().catch(error=>{process.stderr.write((error instanceof Error?error.message:'Storage command failed.')+'\n');process.exitCode=1})
