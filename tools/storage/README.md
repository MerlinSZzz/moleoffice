# Offline folder and s3 storage

Run with Node and the repository's TypeScript loader:

```
node --import tsx tools/storage/upload.ts --help
node --import tsx tools/storage/upload.ts upload --database /path/to/office.db --destination archive
node --import tsx tools/storage/upload.ts restore --base /archive/base-pack --change /archive/chosen-change --into /new/restore
```

The destination must be saved in the database's storage settings and enabled. A folder and an s3-compatible bucket are uploaded to; an SSH destination is refused. Settings and source SQLite are opened read-only. No office server is needed, and a folder needs no credentials. This command does not configure scheduling: the host's scheduler can run it daily.

Each destination uses `<target>/<sha256-installation-id>/<destination-name>/`. All prior files under this office/destination prefix count toward the held limit. The command never prunes old packs. A new week starts on Sunday (UTC); its first upload creates a base. Subsequent packs are cumulative against the week's latest base. A restore uses that base and one chosen change, regardless of how many daily packs exist. Each pack is an atomically renamed directory containing a scrubbed SQLite snapshot, an indexed SQLite manifest, pack metadata and only its new/changed physical files. The chosen manifest describes the entire restored file set. Files deleted or excluded since the base are absent from the restored target.

The reference host tool was read in full. The shared behavior is Sunday/absent-base full upload, hash comparison against the base, a complete daily target manifest and deletion plus per-file size/SHA256 verification on restore. This implementation deliberately uses directory packs and a disk-backed SQLite manifest instead of tar/zstd and an in-memory JSON map, covers all declared physical stores and adds category selection, link checks and concurrent-change refusal. The reference file has not moved or changed.

Every physical file must already have a durable inventory category and matching size/hash. Unindexed bytes, unexpected missing inventoried bytes, links and changes during the read fail the attempt. A checked backfill is needed for legacy files; uploading never guesses a new category. Avatar image blobs use pictures, while their original manifests and receipt sidecars are separate text files. Returned files participate when inventoried; an absent legacy returned-files directory is explicitly recorded in manifest facts and is never described as copied. Historical backups that never carried those files cannot reconstruct them.

Core contains all schema, all non-session records and report text/blocks, office chat, people/agents, seals, warrants and pinned history. Tables not explicitly optional are preserved as core, including unknown future tables, and every actual table has a classification/count entry in the manifest. Canonical security and legacy backup omissions remain declared. Run-history selection controls agent_runs, tool_uses and test-file results, and ordinary session payloads. Unselected ordinary sessions keep their record identity, title, dates and state so links remain meaningful; sealed/submitted session evidence stays whole. Baseline/current non-session revisions, governing/attributed acts and predecessor/revocation evidence remain core. Structured historical references are followed to closure, including nested target/revision contexts, sealed before/after/dependency pointers, warrant message/comment origins and reader-anchor changes. Remaining revision/change rows follow change-log policy. API-call tables and their related usage logs follow API-log policy. Table row omissions are recorded alongside source/kept counts. Retained historical revisions are never rewritten.

Transcripts use recorded local paths from session discovery stamps and visitor facts. Registry cards determine secretary/supervisor/worker selection; paths do not determine roles. Unknown/ambiguous identities are explicitly excluded. Missing external transcripts are declared unavailable. No runtime home is scanned. Physical media and transcripts obey the saved size threshold. A selected file or transcript whose bytes carry a usable key or token hash of the office, found by the canonical byte search, is left out with the reason `unsafe-source`; it is never cleaned or rewritten. Core does not depend on optional selection or capacity.

Raw database snapshots and filtering occur only in a host-private work folder. The canonical copy scrub removes key/token rows, clears declared visitor hashes and rewrites the copy. A bounded batch search of source hashes checks the resulting bytes. The host secrets file is never copied into a pack; only an s3 destination reads its own line from it, to sign its requests. The source database's change generation and physical file stamps are checked again before publication.

All bytes already held plus new database/files/manifests/metadata enter the optional budget. When they would exceed the saved limit, optional database payloads fall back to core and optional files are omitted. Core continues even if it alone exceeds the limit; the receipt reports its database size and exact omitted paths/table counts. No old destination data is deleted.

The host-only spool uses a 0700 folder under the machine's sandbox directory and 0600 journal/receipt files, partitioned by source database path. Every attempt records status, bytes, held/core sizes, exact file omissions, row counts and failures. A prepared receipt is durable before rename; it says awaiting confirmation if a process ends between publication and the final receipt. Such a pack is complete and can be independently restored, but is not reported as a confirmed successful upload. An injected failure rolls back only that attempt's new pack. A planted lock is never removed; stale lock recovery requires checking that its owner is gone before removing it externally. There is no automatic retry or lock stealing.

The canonical office's ordinary minute job ingests receipt reports idempotently, a retained C-class capacity note at 80%, and one quiet line to its secretary. If no secretary is registered, the line remains pending in the spool. The uploader itself never contacts the office. Settings reads only the bounded last receipt for each destination and fixed local category totals.

Restore refuses an existing target, verifies base/chosen database and manifest hashes, reconstructs only manifest-selected files into a new temporary folder, checks every file's size/SHA256, SQLite integrity/foreign keys and selected table counts, then renames the target. The restored omission index lets report file/image/video/audio renderers explain declared policy/threshold/limit/unsafe-source exclusions. Unexpected absence remains a missing-file error. Retained inventory describes original installation files; local category measurements still declare incomplete/external-edit coverage until a checked snapshot/backfill.

I/O uses fixed buffers and one file or SQLite row at a time. Manifests and pins live on disk. History/transcript JSON parsing refuses a row above the declared 4 MiB reader bound rather than silently truncating it. The database engine streams snapshot creation; no request-time corpus scan is added. Publication assumes the folder filesystem provides atomic same-filesystem directory rename and durable file synchronization.

## An s3-compatible bucket

```
node --import tsx tools/storage/upload.ts upload --database /path/to/office.db --destination trial
node --import tsx tools/storage/upload.ts restore --database /path/to/office.db --destination trial --base <base key> --change <change key> --into /new/restore
```

An s3 destination is saved with its endpoint, bucket, region and prefix. The endpoint is the server's address only, with no path. The region is required and is never guessed, because a request signed for the wrong region is refused. The prefix is put in front of every key exactly as saved, so end it with a slash to make it a folder. Its credentials are an access key id, a secret access key and, when the provider gives one, a session token. They are set on the settings page, which writes them as one line of the host secrets file. The command reads that line on the host and uses it only to sign. The sandbox templates do not declare the line, so the launcher never passes it into a sandbox. A destination with no line is refused before any request.

The pack is built exactly as for a folder, through the same steps, and only where it is kept differs. Keys are `<prefix><sha256-installation-id>/<destination-name>/<pack>/<file>`. Every object under `<prefix><sha256-installation-id>/<destination-name>/` counts toward the held limit, whoever put it there, and every page of the listing is read. A pack exists once its `pack.json` exists. A change pack downloads the week's base manifest into the private work folder and checks its size and SHA-256 against the base's `pack.json` before comparing any file.

The pack is staged in the private work folder. A prepared receipt is journalled first. Then every file is uploaded in the order of its key, and `pack.json` goes last. If any request fails, the command deletes `pack.json` first and then every object the attempt sent. The receipt says the attempt failed, and the held bytes stay as they were. If a deletion fails too, the error says so. The objects left have no `pack.json`, so they are never a base, but they count toward the held limit until they are removed by hand. An error names the request and its status, never a response body or a key.

Each request is signed with AWS Signature Version 4 on the real clock, and goes to `<endpoint>/<bucket>/<key>`. There is no retry and no multipart upload. A file over 5 GiB is refused, and a request that sends and receives nothing for 60 seconds fails. The lock is a folder in this host's private spool, so it stops a second upload of the same office and destination on this host only. A restore takes the pack keys the receipts name. It downloads them into the private spool, then checks and restores them exactly as a folder restore does.

The tests prove this against a stand-in s3 server inside the test process, with made-up credentials. No sandbox ever uses a real bucket or a real credential.

### Setting up the test destination on the host

This is done by the host's owner, on the host itself, never from a sandbox.

1. In the backup store, choose a small folder for the trial, such as `mole-office-trial/`. If the store can limit a credential to one folder, make one for that folder only.
2. On the settings page, choose Add destination, name it `trial` and pick S3-compatible bucket. Give it the store's endpoint, bucket and region, and the trial folder as its prefix. Keep the default upload list, set a small total limit and tick Enabled for future uploads. Choose Replace credentials, fill them in, and choose Save destination.
3. Run the upload command once by hand. The receipt it prints should say `uploaded` and `base`.
4. Run the restore command with that receipt's `pack` as `--base`, into a new folder. It should finish without an error.
5. Add a daily run of the upload command to the host's scheduler, beside the Vault's own run, and leave both running for a week.
6. After the week, compare the receipts with the Vault's runs. Only then is the Vault moved onto this destination, as a separate step.
