# The backup hand-over tool

`tools/hand-over-a-backup.mjs` hands one complete backup to the lab server through the lab server's
program, the one `HAND_OVER_PROGRAM` names. The office's
backup door (`POST /api/office/backups/hand-over`) files a host job naming this tool and one backup's own
name; the host job runner starts it with that name and nothing else, in the office's data folder.

## The contract with the lab server's movers

These two things are shared with every mover that copies to the lab server, and this tool never invents
a second lock or a second rule.

- **The lock.** The file `HAND_OVER_LOCK` names, by an absolute path, is an exclusive `flock`, held around
  each rsync to the lab server: the snapshot and the checksum dry run. The holder writes its process id, its time and its
  purpose into the file. The wait for the lock is bounded by the job's own two hours.
- **The argv rule.** Before either rsync, and while the lock is not held, the tool reads every process's
  argv (`/proc/<pid>/cmdline`). The server counts as busy while any `rsync` whose argv names the lab
  server runs, or the lab server's program followed by `data` or `git`. The program is any word whose
  base name is the base name `HAND_OVER_PROGRAM` names. Its `remind`, and another program's `data`, do
  not count. The wait is bounded by the job's own two hours, and the answer says how long it waited.

## What one job does

1. It reads the backup's own name, refuses a name of any other shape, and makes
   `<the data folder>/handover-staging/<the backup's id>/`, beside the backups folder and never inside it.
2. It fills that folder with hard links to that backup's `.db`, its files folder and its left-out list,
   and nothing else. A hard link that cannot be made, as across filesystems, fails the job and copies
   nothing.
3. It writes `MANIFEST.json` into the folder: the backup, its id, the job, the server's name, the commit,
   the stable tag, the database's sha256, and each file's size. The manifest is in the snapshot.
4. It writes an fsynced journal, `HANDOVER-JOURNAL.json`, into the runner's own job folder. The journal
   records each staged relative path with its device, inode, size and mtime, and the database's sha256.
5. It waits out the Vault push's copy, 01:00 to 02:45 local time, and says it did.
6. It waits for the lab server by the argv rule, takes the shared lock, and runs the lab server's program
   as `<the program> data <the folder> name=office-handover-<the backup's id> private`. The snapshot is
   read from its last line, which must begin with the program's base name and `data` and name the stamp.
7. It takes the lock again and proves the copy with
   `rsync -a -n -c --itemize-changes <the folder>/ <the server>:<the path>/<the name>/<the stamp>/`.
   Zero file differences passes; directory lines are left aside. A non-zero count keeps the folder and
   says where it is.
8. It checks the database's sha256 before and after the copy, writes `RESULT.json` into the job's output
   folder, and removes the folder it made, with recovery's checks.

The tool never lists or deletes anything on the lab server. Deletion there is one secretary's alone.

## The answer

`RESULT.json` says `ok`, `says`, the backup, its id, the server's name, `snapshotId`, `databaseSha256`,
`fileDifferences`, the file count and bytes, the commit, the stable tag, the Vault and server waits, and
how each rsync was held. A failure says `ok: false`, the sentence, whether a partial copy may exist and
whether its stamp is known, and `folderKept` when a failed proof left the folder for inspection.

## Recovery

The runner calls this same program with `--recover <the job's id>` after a lost job's scope has stopped,
and only then. The journal is read from the runner's job folder, never from a path the journal offers.
The journal's folder must be `<the handing-over root>/<the backup's id>` before anything else is looked
at, so a journal that names a folder under another root is refused and kept even when this root is gone.
The folder must realpath to `<the handing-over root>/<the backup's id>`, with no link on the way; every
staged file must still be the one recorded (device, inode, size, mtime, a regular file, not a link); an
extra file, a replacement, a missing file, a missing or unreadable journal, a path escape or another
job's folder keeps the folder and says which check failed. Only verified links, then empty folders, are
removed. Original names may have been pruned meanwhile; the links are the last names of that data.

## Stand-ins and where the lab's values come from

The runner gives a tool an environment built from nothing. Four settings say where a hand-over goes and
how, and none has a default:

- `HAND_OVER_LAB_SERVER`, the lab server;
- `HAND_OVER_LAB_ROOT`, the folder on it;
- `HAND_OVER_PROGRAM`, the lab server's program, by its name or its path;
- `HAND_OVER_LOCK`, the absolute path of the lock every mover to the lab server holds.

Each is read from the environment first, where an empty value counts as unset, and then from the
office's settings file, `.env` at the root of the checkout. When one is missing, or the lock's path is
not absolute, the tool refuses before the lock, the staging copy, the lab server's program or any rsync.
Its answer names every missing or wrong setting at once and says that it is set in the office's
settings file. It names no value. The process that holds the lock is handed the lock's path, so a lock
named only in the settings file is the one it holds.

A test child may set the four in its own environment, beside the other stand-ins `HAND_OVER_RSYNC` and
`HAND_OVER_PROC`. A real job's request cannot set any of them, and until the office's settings file
names all four a real hand-over refuses.
