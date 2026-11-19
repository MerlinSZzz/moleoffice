# Plugins

A plugin is a page that is built apart from Mole Office and reads the office through a fixed read-only interface.
Each folder here is one plugin. The folder's name is the plugin's id. The plan is the module xMi387tqE4Og and the
pipeline udGnc-Bsr15R in Mole Office.

## What a plugin folder holds

`plugin.json`, the manifest. `src/shared/plugins.ts` is the one place its shape is written down. This one is an
example, not a plugin that exists:

```json
{
  "id": "example",
  "name": { "en": "Example", "zh": "示例" },
  "version": "1.0.0",
  "interface": "office-read/1",
  "pages": [{ "slug": "main", "title": { "en": "Example" } }],
  "reads": ["projects", "people"],
  "budget": { "builtKilobytes": 200 }
}
```

A manifest the office cannot accept is listed as refused, with the reason, and cannot be switched on. So is a plugin
whose own folder is a link to another place. Its `plugin.json` is not read, because the link may lead outside this
folder. A folder that is a link to nothing is listed as refused too, and the other plugins are still listed. So is a
plugin whose `plugin.json` is a link: the file it leads to is not read. So is a plugin whose `plugin.json` is a folder,
or a file the office has no permission to read. So is a plugin whose own folder the office has no permission to look
inside, and one whose `plugin.json` is a named pipe, a socket or a device, which is not opened. Keep `plugin.json` as a
real file in the plugin's own folder, readable by the office.

## Switching a plugin on

Each plugin has a switch on the Settings page, under Plugins. It is off until the owner switches it on. The office
reads this folder on every request, so a plugin added or switched needs no restart.

## What a plugin may read

Interface `office-read/1`: six GET routes under `/api/plugin-read/v1/`: `projects`, `people`, `work`, `talk`,
`roster` and `online`. No route there writes. `talk` says who wrote to whom and when, and never the words. No answer
carries a key.

`roster` is every person and agent, with who each one is and no presence, projects or work. It is quick to read.
`online` is one row for each agent on the roster, `{id, online}`, and nothing else. An agent is online when the people
view draws its dot green in at least one project, or draws it grey with the words "In a terminal". Every other agent is
not online, and neither is a retired one.
`people` and `work` take `?agents=` with up to 500 agent ids joined by commas. They then answer only those agents, in
the order of the whole view, and `notAgents` lists the ids no agent has. `?agents=` with nothing after it answers no
agent and reads nothing heavy.

The slot sends a read's path and query only when they are at most 8,192 bytes, and refuses a longer read itself with
`too-long`. `theTargetOfARead` in `src/shared/plugin-read.ts` builds the path and query as the slot sends them, and
`READ_TARGET_LIMIT` is the limit, so a plugin can split a list before it asks. A comma between ids is sent as `%2C`,
three bytes. 500 of the ids the office makes, which are 12 characters long, are 7,531 bytes on `people`. Of ids 64
characters long, 121 fit and 122 do not. The limit is there because the server refuses a request whose target and
headers are over 16,383 bytes together, with 431 or a closed connection. The slot cannot see every header a browser
sends, so a read inside the limit can still be refused that way, and the page then gets 431 or `could-not-ask`.

A plugin writes nothing in version 1. A plugin's own small store may be added later. It would be new routes under a
new path, and the six views above would keep their shapes.

## A plugin's page

A switched-on plugin's page is at `#/plugin/<id>/<slug>` in the office, inside the office's own frame, and the
sidebar lists the pages of every switched-on plugin. A plugin that is off or refused has no page, and its address
says why in words.

The page is drawn from `plugins/<id>/dist/<slug>.html`, served by `GET /api/plugins/<id>/files/<slug>.html`, in an
iframe with `sandbox="allow-scripts"` and nothing else. So the page has no origin and holds no key: it cannot
read the office's page, its storage or its cookies. Its other files come from the same `files/` address. Every file is
served under a content policy that lets the page load only its own files (scripts, styles, pictures, fonts) and
connect to nothing. Only `.html .js .mjs .css .json .svg .png .jpg .jpeg .gif .webp .woff2` are served.

A page may start one kind of worker: a dedicated worker from a `blob:` address the page made itself, such as
`new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })))`. The worker keeps the frame's limits.
It has the page's origin, which is none, and the page's content policy, so it connects to nothing and has no storage.
It talks only to the page that started it, by `postMessage`. A worker from any other address is refused, whether it
is a `data:` address or one of the plugin's own files. Stop a worker with `terminate()` when its work is no longer
wanted, such as when newer work replaces it.

Files are served only from a real `plugins/<id>/dist` folder. When `dist` is a link to another place, none of the
plugin's files are served. When a path leads, through a link, to a file outside the plugin's own `dist` folder, that
file is not served. Each of these is refused with a 403 that says why. A plugin whose own folder is a link is refused
before any of this is asked, so none of its files are served either.

The page asks the office by `window.parent.postMessage(message, '*')`, and every message carries
`"interface": "office-read/1"`:

- `{ "ask": "ready" }` — the page is ready. The office answers
  `{ "kind": "context", "plugin", "page", "language", "theme", "reducedMotion", "project" }`, and sends it again
  whenever one of these changes. `reducedMotion` is true when the browser asks for less motion. For the office map
  plugin it is also true while the office map's motion is switched off, in that plugin's row on the Settings page. A
  page that does not say it is ready within 10 seconds is shown as not answering.
  The office cannot see inside the frame, so a page that stopped with an error, or a script file that is missing,
  shows this way too.
- `{ "ask": "ready", "answers": "bytes" }` — the page asks for HTTP bodies as bytes.
  The context gains `"answers": "bytes"`, including each context sent after a theme or other context change.
  `"bytes"` is the only value accepted for `answers`.
- `{ "ask": "read", "id", "view", "query"?, "tag"? }` — read one view the manifest names. The answer is
  `{ "kind": "answer", "id", "view", "status", "tag", "body" }`. Send the `tag` back to be told `304` with no body
  when nothing changed. The office reads the view as the person looking at the page, and one view has at most one
  read in flight. A read it will not make is answered `{ "kind": "refused", "id", "view", "why", "said" }`.
  A read that is too long is answered `{ "kind": "refused", "id", "view", "why": "too-long", "bytes", "limit" }`.

Each accepted ready chooses the form of reads asked after it.
A ready without `answers` chooses object answers again and sends a context without `answers`.
A read already asked keeps the form it was asked in.
A refused ready decides nothing, so the form stays what the last accepted ready chose.
A frame opened again starts not ready, with no form chosen.

Object answers keep today's shape: `{ "kind": "answer", "id", "view", "status", "tag", "body" }`.
The body is parsed as JSON, or kept as text when it is not JSON.
A 304 has `body: null`.

In bytes mode the answer is `{ "kind": "bytes", "id", "view", "status", "tag", "type", "bytes" }`.
The `bytes` field is an ArrayBuffer holding the HTTP body exactly as the office sent it.
The slot neither decodes nor parses it.
The buffer is posted in the transfer list, so the slot's buffer is detached afterwards and the slot keeps no copy.
The `type` field is the response's Content-Type header exactly as the office sent it, or null when no header was sent.
A 304 has `bytes: null` and `type: null`, and nothing is transferred.
Every other status carries an ArrayBuffer, which may be empty.
The different kind and the different body field keep the two answer forms distinct.

An office error, such as 400, 403, 404 or 500, uses the form the page asked for too.
Object mode carries its parsed body or its text.
Bytes mode carries its unchanged body bytes and its Content-Type.
The HTTP status never chooses the form.

The slot's refusals have the same shape in both modes.
Their `why` is `not-understood`, `not-a-view`, `not-in-the-manifest`, `too-long`, `already-asking` or `could-not-ask`.
`too-long` is the one a page can mend by asking for less.
`too-long` alone carries `bytes` and `limit` instead of `said`.
`bytes` is the length of the read's path and query as the slot would send them, and `limit` is `READ_TARGET_LIMIT`.
An office that cannot be reached is `could-not-ask` in either mode.
One read per view may be in flight in either mode.

An older host refuses a ready with `answers` as `not-understood`, with `id: null` and `view: null`, and sends no context.
That tells the page that this host does not send bytes.
A page can say so visibly and send a plain ready to use objects, with no mixing of forms.
A host supporting bytes always accepts `answers: "bytes"` on a valid ready.
Every message above still carries `"interface": "office-read/1"`.
The views keep their existing bytes.

`src/shared/plugin-read.ts` publishes the message types without importing office code.
`src/shared/plugins.ts` checks the asks against those shapes.

If a page is loaded into the frame a second time, the office stops answering and closes the frame. That is so when the
page moves to another page and when it reloads itself. A page can still send what it read to another site by opening
that site in its own frame. The sandbox and the content policy do not stop that. So a plugin is trusted only as far as
its source in this repository is read. The inspector does not read a change inside one plugin's folder that leaves its
manifest alone (see below). Whether that is enough is the owner's question, and it is not answered here.

## Checking a plugin

`node tools/check-a-plugin.mjs <id>` checks one plugin and never runs the office's suite. It runs seven steps, and
every step that can run does, so one run names every fault it finds:

- `manifest`: the office accepts `plugin.json`.
- `views`: every view the manifest reads is a view of the interface it names.
- `imports`: no file imports anything outside the plugin's folder except `src/shared/plugin-read.ts` and packages.
- `types`: the type check finds no error, with the office's strictness.
- `tests`: the tests under `plugins/<id>/tests` pass, and there is at least one.
- `build`: each page is built into `plugins/<id>/dist`, where the office serves it from.
- `size`: what was built fits the manifest's `builtKilobytes`.

It exits 0 when every step passed and 1 when any did not. `--json` ends its output with the whole answer on one line.

## How a change to a plugin is merged

A change whose every file is inside one plugin's folder is tested by three commands in the merge queue, and not by
the office's suite:

1. `node tools/check-a-plugin.mjs <id>`, the steps above.
2. `node tools/secret-scan.mjs plugins/<id>`, which looks for a key in the folder.
3. The privacy gate, `tests/the-owners-project-is-not-in-the-source.test.ts`.

All three run even when one fails, and the entry goes back to its author if any of them fails. The office records that
a plugin's check tested it, and says so on the entry. A change to a plugin and to anything else, or to two plugins, or
to this README, is tested by the office's suite as before.

The inspector reads such a change only when it changes `plugins/<id>/plugin.json`.
The interface, `src/shared/plugin-read.ts`, is outside every plugin's folder, so a change to it is never
plugin-only and is always read. The secret scan and the privacy gate run either way. Every check says which way this
rule went.

`dist/` is not kept in git, so a landing that changes a plugin's folder builds the plugin's pages. This happens in both
lanes, whether the entry was tested by the plugin's check or by the office's suite. The build runs before main moves,
in the entry's sandbox, in the clone that is about to land, because building runs the plugin's own code. Only plain
files and folders are copied out of it, and they are put in `plugins/<id>/dist` after main moves. The landing's step
says, for each plugin, whether its page was built. A build that fails does not stop the landing, and
`plugins/<id>/dist` keeps the last good page. Nothing is built for a plugin whose `dist` is kept in git. When git
keeps it as a link, the landing's step also says that the office serves no file of that plugin.

`node tools/build-a-plugin.mjs <id>` is the same build, by hand. It builds into a staging folder first, so a build that
fails changes nothing in `plugins/<id>/dist`.

## Not here yet

- A plugin that reaches main other than through the merge queue is not built. It has no page until
  `node tools/build-a-plugin.mjs <id>` is run in that checkout. A page that was never built shows as failed to load,
  with the office's reason.
- The bundle (`scripts/bundle.mjs`) does not carry this folder yet.
