# Local office answer fields

`fields` changes only the body shown after the ordinary authenticated office request.
It never enters the URL, headers or request body, and needs no support in the office.
The full reply is key-masked before projection, then the existing display limit applies.

1. A nonempty list selects exactly the named dotted object paths from the JSON body.
   Selected ancestors retain their object and array shape; arrays traverse every member.
   A missing leaf in any member refuses the projection. An empty array cannot validate
   a deeper path, so that request is refused; selecting the array itself is allowed.
   Segments are object keys beginning with a letter or underscore, followed by letters,
   digits, underscores or hyphens. Numeric indices, whitespace, empty segments, bracket
   notation, wildcards, prototype keys, duplicate paths and overlapping paths are refused.
   Invalid option syntax is refused before any request, including writes and file uploads.
2. `short` recursively replaces full record objects (own `id`, `kind`, `title`, object
   `data`) with `id`, `kind`, `title`, `summary`, and `shortForms` from `data.shortForms`.
   The title and summary are the stored reading levels 2 and 3. Stored forms, including
   their provenance and parts, survive unchanged. No snippets or data bodies are generated.
   Absent forms become `shortForms: null` with an explicit notice outside the body.
   Envelopes and operational metadata survive. Message readings, schema/help, checks,
   and other operational answers without full record objects stay unchanged; `short`
   does not interpret those API-specific answers or invent short forms for them.
3. Interactive MCP and dsh default to `short`; explicit `whole` returns the previous
   whole answer, preserving body text and the visible cutoff. Internal `askTheOffice`
   callers with no `fields` retain the previous whole-answer contract.
4. Unknown paths refuse visibly and expose no partial selection. Projection errors
   preserve status, Location and receipt notices in the tool envelope. After a write,
   they explicitly say the write was already sent and may be stored, and require reading
   it back before resending. They never call that write refused or retry it.
5. HTTP refusals and redirects keep their body and Location regardless of fields.
   Existing refused-write instructions remain. Successful non-JSON bodies are refused
   by name in list/short modes, including malformed JSON; whole preserves their text.
   A cut or unreadable source cannot be presented as a valid projection.
6. Projection uses the full source before the response cutoff: a narrow leaf remains
   readable even when the original body exceeds the limit. Key masking, authenticated
   identity, manual redirects, timeouts and seal receipts keep their existing behavior.
   Uploaded file size and hash are checked against the full answer before rendering
   projected fields. Invalid fields cannot bypass that check or send another request.
7. Both adapters advertise the real optional union (nonempty string array, `short`,
   `whole`) in tools/list and defineTool. Behavioral tests call their execute/render
   entry points with stand-in fetch/environment. Picture tools retain their own contract.
8. `projectOfficeAnswer(answer, fields, { write })` is a pure replay entry point:
   it accepts a saved answer envelope with body text, needs no office or environment,
   and leaves its input unchanged. The caller supplies a complete, already masked source.

The behavioral checks are in `tests/office-answer-fields.test.ts`. Existing adapter,
upload and seal-receipt checks are named neighbours because they share these entry points.
