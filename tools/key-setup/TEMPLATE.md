# Guided key setup

A decision follows problem __4iR4FkFAGS: a key pasted into chat was stored in the office database and backups. Every new key or account binding must use an adaptation of this guided setup. The pattern comes from the news desk’s `tools/publish/SETUP-PATTERN.md`.

Run a real setup on the person’s own computer, in their terminal. The person opens the provider’s pages and pastes each key into hidden input. Sandbox tests use invented keys, piped answers, a temporary HOME and a loopback server. Never give a sandbox access to a real key folder.

## Adapt the example

Copy `setup-example.sh`. Keep the common helpers sourced from `common.sh`; do not copy them into another script. Set these parameters at the top:

- `ME`: the absolute script path, used in the quoted restart command.
- `titles` and `minutes`: parallel arrays, one title and rough time per step.
- `LANGUAGE`: `en` or `zh`, the language the person reads.
- `CRED`: a private folder outside the project, defaulting to `$HOME/.config/<tool>` with a `KEY_SETUP_CRED_DIR` override.
- `FILE`: one stable file name per key, inside that folder.
- `PREFIX` and `MIN`: the provider’s expected prefix and a conservative minimum length. They check shape, not whether the key works.

`KEY_SETUP_NODE` selects Node, and `KEY_SETUP_CONTACT` names the person to ask if the provider page differs from the instructions; `common.sh` holds both defaults. Provider-specific scopes, expiry, pages and trial details belong in the provider table. See `setup-digitalocean.sh`, `setup-resend.sh` and `setup-openai.sh` for the existing adaptations and their particular steps.

Each step says what to do, waits, checks what it can, then reports one plain sentence. Call `head_of N` first; its time comes from `minutes`, or can be supplied as a second argument. Use `go` for Enter, `yes_no` for a question about the page, and `stop N "why"` for a failure. `stop`, `q` and end of input all print how to resume with `--from N`. End of input exits with failure and never means yes. `--list` prints the numbered titles and times without touching any folder or key; `--from N` runs that step and all the following steps. Every step must check its own prerequisites so that resuming is safe.

When `--from` skips the save step and no key exists, the script explains why and returns to the save step. At start it clears only the stale temporary files the checker itself names, regular files of the person's own, after checking the private folder, and says how many it removed. It leaves other names, links and folders alone (3glux5orTv2k; PFXqjfLKEsqi).

Keep four steps for a pasted key:

1. Prepare the private folder, after waiting for Enter.
2. Explain exactly which account and page to open, what to click, the minimum scopes or domain binding, and expiry if offered. Ask the person to confirm what the page shows. Say that page names come from provider documentation and were not checked by logging in; cite that documentation and say whom to ask if it differs.
3. Explain that the pasted value is hidden. Call `save_secret "key name"`. It checks the folder and any existing file, asks before replacing a valid existing file, reads the value with `read_secret`, pipes it through the shell’s builtin `printf` to `keycheck write`, clears the variable, and checks the saved file. A refused existing file is not silently repaired or replaced.
4. Run a trial that changes nothing at the provider. Explain exactly what it checks and what it cannot prove. Always check the saved file’s shape, ownership and permissions before reading it for the trial.

## Private files and checks

`node keycheck.mjs folder DIR` creates missing folders at mode 700 or checks an existing folder. It refuses a wrong mode, wrong owner, a non-directory or a symbolic link at the key folder itself. An ancestor link is accepted only if it resolves to a folder owned by the current user or root that no other user can write. Existing modes are not repaired silently. A mode refusal gives the repair command; an owner refusal asks its owner to repair it (3glux5orTv2k; PFXqjfLKEsqi).

`node keycheck.mjs write FILE --prefix P --min N` reads only stdin. A single trailing line terminator is removed; spaces are not trimmed away. Empty values, whitespace, quotes, angle brackets, any other character outside printable ASCII, wrong prefixes and short values are refused without displaying the value. The checker creates an exclusive temporary file in the destination folder at mode 600, sets that mode before writing any byte, then flushes and renames it atomically. No temporary file remains after a normal success or handled failure. The file contains only the value, with no newline. An existing destination must already pass the private-file checks.

`node keycheck.mjs file FILE` checks a regular file owned by the current user, mode 600, in a mode-700 folder owned by that user; the key file and its folder must not be links. Ancestor links follow the folder rule above. Success reports the path and byte length, never contents. Operating-system errors are replaced with a fixed refusal so a stack or diagnostic cannot disclose a value. Paths in checker sentences are quoted with control characters escaped.

Folder mode 700 means only its owner can enter it; file mode 600 means only its owner can read and write it. Mode checks include special permission bits. Run as the person, not through sudo. Consumers must read a key only through `readKey(file, { prefix })` from `readkey.mjs`; it checks the private file and value on every read and throws the checker's refusal with its repair instruction. An optional `min` sets the minimum length. The checker accepts `--lang zh`; the scripts pass `KEY_SETUP_LANG=zh` for Chinese or `KEY_SETUP_LANG=en` for English to both the checker and reader. The reader also accepts a `lang` option. English is the default.

## Secret rules

- Never put a key on a command line, in a URL, or in an exported environment variable. Use stdin when writing and read the private file when making a request. The command line may carry the file path.
- Never put a key in chat, a message, the office database, a project file, git or a log.
- Never print a key, including in a refusal, debug output, a stack or the provider’s response. Do not enable shell tracing. `common.sh` disables tracing before any input is read.
- Never replace a stored key without asking. `q` at any prompt, including a secret prompt, leaves with a restart command.
- Never make the final trial create, update, delete, bind, send or otherwise change anything at the provider. A request uses a header built inside Node from the private file, or `curl -H @file`; the key itself must never become an argument. Refuse redirects that could forward a header elsewhere.

Provider facts shared by the guided command and the existing adaptations live in `src/config/provider-setup/providers.json`. The guided command `setup-provider.sh` reads that table; the adaptations keep any steps specific to their particular setup. `trial.mjs` and `provider-data.mjs` make read-only trials and never print provider responses. Each trial's official address is the table's; the only override is an IPv4 loopback HTTP server for isolated tests. This guide repeats no provider-specific values (UeBcSpDnIqFW; Ki0xPUTAgE6M).

The person’s clipboard and a short-lived shell variable still hold the key. Hidden input and private files do not erase the clipboard or make the key inaccessible to other processes running as the same user. The scripts do not print or log that memory. Tests must use an environment containing only PATH, locale and explicit test parameters, never the real HOME or a real credential.
