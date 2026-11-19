// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * One rule for the processes holding the office database, one exclusive-lock guard, and one way to hash a file a
 * piece at a time. Importing this module opens no database.
 */
import { createHash } from 'node:crypto'
import { closeSync, existsSync, lstatSync, openSync, readFileSync, readSync, readdirSync, readlinkSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'

const COMPANIONS = ['-wal', '-shm', '-journal']
const GONE = new Set(['ENOENT', 'ESRCH'])
const DESCRIPTOR_GONE = new Set(['ENOENT', 'ESRCH', 'ENXIO'])
const REFUSED = new Set(['EACCES', 'EPERM'])
const THIS_UID = process.getuid?.() ?? -1
const A_PIECE = 1024 * 1024

/**
 * A file's sha256 and its size in bytes, read one MiB at a time. Node will not read a file over 2 GiB whole
 * (ERR_FS_FILE_TOO_LARGE), and an office database and its backup can be larger than that.
 */
export function theFileHash(path, encoding = 'hex') {
  const hash = createHash('sha256'), piece = Buffer.allocUnsafe(A_PIECE), fd = openSync(path, 'r')
  let size = 0
  try {
    for (let count; (count = readSync(fd, piece, 0, A_PIECE, null)) > 0; size += count) hash.update(piece.subarray(0, count))
  } finally { closeSync(fd) }
  return { sha256: hash.digest(encoding), size }
}

function theExistingFiles(database) {
  return [database, ...COMPANIONS.map(suffix => database + suffix)].flatMap(path => {
    try { const stat = lstatSync(path); return [{ path, dev: stat.dev, ino: stat.ino }] }
    catch (error) { if (error.code === 'ENOENT') return []; throw error }
  })
}

/** The same fields bootstrapProcessIdentity reads, from the given /proc root, plus the command name. */
function identityAt(proc, pid) {
  const stat = readFileSync(`${proc}/${pid}/stat`, 'utf8')
  const close = stat.lastIndexOf(')'), open = stat.indexOf('(')
  const name = stat.slice(open + 1, close)
  const fields = stat.slice(close + 2).trim().split(/\s+/)
  return { name, identity: { pid, ppid: Number(fields[1]), pgid: Number(fields[2]), startTime: fields[19], state: fields[0] } }
}

function belongsToThisUser(status) {
  const ids = /^Uid:\s+([\d\s]+)$/m.exec(status)
  return ids ? ids[1].trim().split(/\s+/).map(Number).includes(THIS_UID) : false
}

/**
 * A /proc/locks row, or null for a line this reader does not know. The fields are id, an optional
 * `->` waiter mark, type, advisory mode, operation, pid and major:minor:inode. The inode is decimal
 * and the device fields are hex; a blocked waiter is a row like any other here.
 */
function lockRow(line) {
  const tokens = line.trim().split(/\s+/)
  if (!/^\d+:$/.test(tokens[0] ?? '')) return null
  let at = 1
  if (tokens[at] === '->') at += 1
  const [type, mode, operation, pid, place] = tokens.slice(at, at + 5)
  if (!type || !mode || !operation || pid === undefined || place === undefined) return null
  const parsed = /^([0-9a-fA-F]+):([0-9a-fA-F]+):(\d+)$/.exec(place)
  if (!parsed) return null
  return { line: line.trim(), type, mode, pid: Number(pid), device: `${parsed[1]}:${parsed[2]}`, inode: Number(parsed[3]) }
}

/**
 * Every holder of the database or one of its companions, read from the given /proc root.
 * A lock row is matched by inode number alone. On some filesystems /proc/locks reports a different
 * device number than stat does, so requiring the device would miss a real holder; matching by inode
 * alone can refuse when another filesystem has a file with the same inode number, and never lets a
 * holder pass. A readable process is matched by its fd path or by the device and inode of its fd.
 * A descriptor that has gone since the list holds nothing and is skipped. One whose readlink or stat
 * is refused after the list leaves its process unread, as a refused fd folder does, unless another of
 * its descriptors names the database.
 */
export function theDatabaseHolders(database, proc = '/proc') {
  const files = theExistingFiles(database)
  const paths = new Set(files.map(file => file.path))
  const inodes = new Set(files.map(file => file.ino))
  const devices = new Set(files.map(file => file.dev))
  let lockTable
  try { lockTable = { rows: readFileSync(`${proc}/locks`, 'utf8').split('\n').filter(Boolean).map(lockRow).filter(Boolean), reason: null } }
  catch (error) { lockTable = { rows: [], reason: error.code ?? error.message } }
  const matching = lockTable.rows.filter(row => inodes.has(row.inode))
  const holders = [], setAside = [], unnamedLocks = []
  const unreadable = new Map()
  let otherUsersUnreadable = 0

  for (const entry of readdirSync(proc)) {
    if (!/^\d+$/.test(entry)) continue
    const pid = Number(entry)
    let status
    try { status = readFileSync(`${proc}/${pid}/status`, 'utf8') } catch (error) { if (GONE.has(error.code)) continue; throw error }
    let observed
    try { observed = identityAt(proc, pid) } catch (error) { if (GONE.has(error.code)) continue; throw error }
    if (['Z', 'X'].includes(observed.identity.state)) continue
    let descriptors
    try { descriptors = readdirSync(`${proc}/${pid}/fd`) } catch (error) {
      if (GONE.has(error.code)) continue
      if (!REFUSED.has(error.code)) throw error
      unreadable.set(pid, { ...observed, thisUser: belongsToThisUser(status), what: `process ${pid}` })
      continue
    }
    let held = false
    let refused = null
    for (const fd of descriptors) {
      try {
        const target = readlinkSync(`${proc}/${pid}/fd/${fd}`)
        if ([...paths].some(path => target === path || target === path + ' (deleted)')) { held = true; break }
        if (!target.startsWith('/')) continue
        const stat = statSync(`${proc}/${pid}/fd/${fd}`)
        if (devices.has(stat.dev) && inodes.has(stat.ino)) { held = true; break }
      } catch (error) {
        // A process can change its credentials between the list and the readlink, and then its
        // descriptors are refused. The rest are still read, since one of them may name the database.
        if (DESCRIPTOR_GONE.has(error.code)) continue
        if (!REFUSED.has(error.code)) throw error
        refused ??= fd
      }
    }
    if (held) holders.push({ ...observed.identity, name: observed.name, how: 'fd' })
    else if (refused !== null) unreadable.set(pid, { ...observed, thisUser: belongsToThisUser(status), what: `descriptor ${refused} of process ${pid}` })
  }

  for (const [pid, observed] of unreadable) {
    const rows = matching.filter(row => row.pid === pid)
    if (rows.length) holders.push({ ...observed.identity, name: observed.name, how: rows[0].line })
    else if (!lockTable.reason) {
      if (observed.thisUser) setAside.push({ pid, name: observed.name, startTime: observed.identity.startTime, says: `could not read ${observed.what} (${observed.name}); it holds no lock on the database` })
      else otherUsersUnreadable += 1
    }
  }
  if (unreadable.size && lockTable.reason) {
    const [, observed] = [...unreadable][0]
    const error = new Error(`could not read ${observed.what} (${observed.name}); /proc/locks could not be read (${lockTable.reason})`)
    error.code = 'locksUnreadable'
    throw error
  }
  for (const row of matching) {
    if (row.pid <= 0 || !existsSync(`${proc}/${row.pid}`)) unnamedLocks.push(row.line)
  }
  return { holders, setAside, otherUsersUnreadable, unnamedLocks }
}

function observeTheDatabase(database) {
  const { sha256, size } = theFileHash(database)
  const companion = suffix => {
    const path = database + suffix
    return existsSync(path) ? { exists: true, size: statSync(path).size } : { exists: false, size: null }
  }
  return { sha256, size, wal: companion('-wal'), shm: companion('-shm'), journal: companion('-journal') }
}

/**
 * Take the database's exclusive lock once and let it go. A refusal is returned, never thrown, so the
 * caller's own refusal sentence is the one a person sees.
 */
export async function theExclusiveLockGuard(database) {
  const before = observeTheDatabase(database)
  let db = null
  try {
    const { default: Database } = await import('better-sqlite3')
    db = new Database(database, { fileMustExist: true, timeout: 0 })
    db.pragma('locking_mode = EXCLUSIVE')
    db.prepare('SELECT count(*) FROM sqlite_master').get()
    db.close(); db = null
    return { taken: true, before, after: observeTheDatabase(database) }
  } catch (error) {
    if (db) { try { db.close() } catch { /* The refusal below names the original failure. */ } }
    const code = error.code ?? 'no sqlite code'
    return { taken: false, code, says: `The exclusive database lock could not be taken: ${code}.`, before }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const database = process.argv[2]
  if (process.argv.length !== 3 || typeof database !== 'string' || !isAbsolute(database) || !existsSync(database)) {
    process.stderr.write('usage: node tools/database-holders.mjs <absolute database path>\n')
    process.exitCode = 2
  } else {
    try {
      const result = theDatabaseHolders(database)
      process.stdout.write(JSON.stringify(result) + '\n')
      process.exitCode = result.holders.length || result.unnamedLocks.length ? 1 : 0
    } catch (error) {
      process.stderr.write(String(error.message) + '\n')
      process.exitCode = 1
    }
  }
}
