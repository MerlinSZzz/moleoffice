Avatar upload acceptance

The sharing, codec and packaging tests in this criterion are written before production changes.
The reviewed policy replaces the earlier lossless-only draft: a static PNG, JPEG or WebP above
twice the largest avatar drawn by the product is resized in its own format. No image is enlarged.
Smaller inputs and animations are stored unchanged, with an explicit disposition. Native codec
unavailability is also explicit. If the codec cannot finish for any reason, the upload boundary
stores the exact original bytes with a disposition naming the known reason, or an honest unknown
reason. Original and stored hashes and byte counts then agree, and bytes saved is zero. The pure
codec may still throw. Type, empty-input, byte-limit and storage-integrity refusals remain.
Exact pixel comparisons and product pictures at 1440 and 390, light and dark, must reach the
reviewer before any production commit. Any visible change stops that commit.

Production files: src/server/lib/avatars.ts, src/server/lib/avatar-compression.ts,
src/server/api/participants.ts, package.json, package-lock.json, scripts/bundle.mjs and
scripts/avatar-codec-in-a-bundle.mjs. There are no UI edits, settings or migrations.
The package helper also carries scripts/avatar-codec-licences.txt: unmodified LGPLv3 and GPLv3
licence texts, combined with the native package's upstream library/licence list in its notices.

New tests and fixture: tests/avatar-uploads-share-stored-pictures.test.ts,
tests/avatar-compression.test.ts, tests/avatar-codec-packaging.test.ts,
tests/avatar-codec-lifecycle.test.ts and
tests/avatar-upload-fixtures.ts. Changed neighbours: tests/avatars.test.ts (complete small PNG and
the row's stored path), tests/agents-given-the-default-picture-share-one-stored-copy.test.ts
(real legacy rows/files, new copies compare with the codec's stored output),
tests/a-test-world-says-why-the-faces-differ.test.ts (complete small PNG), and
tests/the-pictures-and-a-residents-file-are-sent-from-the-file.test.ts (the asset route streams the
whole stored output instead of requiring that compression did not happen). Unchanged neighbour:
tests/a-chat-setting-follows-the-person.test.ts. These are the exact named-test sweep; no gates,
build or whole suite are run by this worker.

One immutable manifest per original SHA256 records original and stored hashes and byte counts,
disposition and bytes saved. One immutable file per resulting SHA256 holds the encoded image.
Every upload appends a separate durable receipt, including repeated originals. Repeat originals
avoid the native codec. Same-provenance participants share one asset row and URL; chosen and given
rows may share the image file but cannot share the fact of somebody having chosen it. Existing
rows and files are neither updated nor deleted. Exclusive writes and content checks prevent an
existing hash path from being overwritten. A corrupt manifest is reported before any row write.

The codec loads lazily in a bounded synchronous child, preserving existing synchronous callers.
Cache is off, native concurrency is one, input pixels are capped, and elapsed time plus both output
buffers are bounded. The pinned npm dependency and its native/transitive packages must load from
the copied package directory with no ambient module path. Package and bundled-library licence
texts join the existing notices. Installation proof uses npm-distributed binaries with scripts
disabled, without a source build or postinstall network download.
The codec stays in its server's process group, ends after each upload, and watches its parent so
it also ends after the server is killed. Both existing stable-upgrade topology readers must accept
the actual child while it runs. Their current descendant rule should need no source change.
The lifecycle and packaging tests use the existing child_process starter and explicit hook/case
budgets; no new process-starter name is needed.

Planned public refusals, inventoried in this criterion: the existing hash-named avatar file does
not match its bytes, or the stored upload description is invalid. Both leave conflicting files
untouched. Codec failure is an original-byte storage disposition, never an upload refusal. File,
manifest and receipt write failures still propagate; they are outside the codec fallback catch.

Fallback regression files: tests/avatar-codec-fallback.test.ts,
tests/avatar-uploads-share-stored-pictures.test.ts and tests/avatar-picture-identity.test.ts.
Deterministic slow/failing child stand-ins and probe results cover the unchanged time, pixel and
output bounds, child exit, launch failure, incomplete/invalid results and unknown failures. Every
case checks exact original bytes served, a durable immutable manifest, zero savings and separate
receipts on repeats without another codec attempt. Public upload and registration must succeed.
Chosen/given provenance and existing receipt identities stay intact. Successful native PNG, JPEG
and WebP output is compared byte for byte before and after, with normal asset-read timings. The
encoder policy and read paths do not change; this comparison makes no new screenshot claim.

Evidence: green control, deliberate production mutations for each added/changed guard, green
restore, and the exact named neighbours through tools/run-named-tests.mjs. Upload measurements
separate first/distinct inputs from repeat originals on the same made-up office, with JPEG, WebP,
offered art/photo/alpha PNG and a valid image near the existing byte limit. Record parent RSS and
the codec child's peak RSS separately. Read regressions greater than a few milliseconds stop the
task. Screenshots show the actual chat list, conversation headings and profile, with contacts in
view; source and resulting avatars are also compared at each drawn pixel size. Logs and images
stay outside the worktree. Production waits for explicit picture approval.
