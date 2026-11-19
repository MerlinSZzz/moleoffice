# The s3-compatible destination

Old: a destination of kind s3 can be saved with its endpoint, bucket, prefix and credentials, but nothing uploads to it. Its target has no region, so a signed request could not name one. The endpoint may carry a path, and the prefix may hold any text up to 2,048 characters.

New: the offline storage command uploads to an enabled s3 destination. It builds the same packs as the folder destination, through the same steps, and only the place they are kept differs. A weekly base and cumulative daily changes, the held limit, core beyond the limit, the omissions, the receipts and the journal all behave as they do for a folder.

The target names its region. The region is required and is never guessed from the endpoint or set by default. The endpoint is the server's root: http or https, with no path, user, password, query or fragment. The prefix is empty or one or more plain path parts ending in an optional slash. A part is letters, digits, dots, dashes and underscores, and is never `.` or `..`.

Every request is signed with AWS Signature Version 4 for the service `s3`, with the saved region. The signature covers the host, the date and the SHA-256 of the body. A session token, when saved, is sent and signed. Requests use path-style addresses: `<endpoint>/<bucket>/<key>`. The signing date is the real clock, not the date a test names for the pack.

Credentials are read only from the host secrets file the settings page writes, in the line the page writes for that destination. The command reads them without the office and never prints, stores or sends them anywhere but the signature and the token header. A destination with no credentials line is refused before any request, and the attempt is journalled as failed.

Keys are `<prefix><sha256 of the installation id>/<destination name>/<pack name>/<file>`. Every object under `<prefix><office>/<name>/` counts toward the held bytes, whoever put it there. Listing follows every continuation page. A pack exists once its `pack.json` exists. Objects without one count toward the held bytes but are not a base.

A pack is staged in the host's private work folder. Every staged file is uploaded in order of its key, and `pack.json` is uploaded last. A prepared receipt is journalled before `pack.json` is sent. If any request fails, the command deletes `pack.json` first and then every object the attempt sent. The journal says the attempt failed, the held bytes stay as they were before it, and the error names the request and its status, never a response body or a key.

A change pack is built against the week's latest base, read from the bucket. Its manifest is downloaded into the work folder and checked against the size and SHA-256 its `pack.json` declares before any file is compared with it.

A restore downloads the base and the chosen change into the private work folder and then checks and restores them exactly as a folder restore does. It takes the pack keys the receipts name.

One uploader runs per destination on this host. The lock is a folder in the host's private spool, so two hosts uploading the same office to the same bucket are not prevented from running at once. There is no retry and no multipart upload. An object over 5 GiB is refused. A request that sends or receives nothing for 60 seconds fails.

An SSH destination is still refused by the command, saying so.

Why: the test destination for the week beside the Vault is an s3-compatible bucket. The uploader built for the folder destination already decides what a pack holds, so the bucket reuses it and adds only the transport. A region is needed to sign. A wrong one is refused by the server, so a default would be a guess that fails later. The tighter endpoint and prefix keep a saved target from naming more than one place.

Proof: tests/storage-s3.test.ts runs a stand-in s3 server inside the test process, on a made-up office with made-up credentials. The stand-in checks every signature itself with a signer that first reproduces AWS's four published Signature Version 4 examples. It pages its listings at two keys and can be told to refuse one upload. No real credential, bucket or backup store is used. tests/storage-destinations.test.ts adds the region to saved s3 targets and refuses a missing or malformed region, an endpoint with a path and an unsafe prefix. tests/storage-destinations-page.test.ts fills the region on the settings page. Each criterion is run red before the code, with a control run beside it, then turned red again by a mutation of the code and green after the restore.
