// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TELL THE APP WHERE ITS API IS, once, at start.
 *
 * This is the only file that imports `virtual:mole-office-api`, the module `vite.config.ts` makes as
 * it serves the page. That module carries one number: the port the API answers on, out of the same
 * declaration the API server reads. In a build it carries null, because Fastify serves the built
 * page itself and the page's own origin is the API.
 *
 * WHAT THE PAGE WAS SERVED WITH BEATS WHAT IT WAS BUILT WITH. A built page can also be handed out
 * by a server that is not the API — that is `liveApp` in tests/helpers.ts, which gives every browser
 * test its own API and serves it one page built once for the whole run. Such a server writes the
 * port into the page, and `./the-port-written-into-this-page.ts` reads it. It wins because it is the
 * nearer fact: the module was written when the page was built, and the tag was written as this page
 * was handed over. It is the same precedence a port in the environment has over an address in
 * `.env`, and `apiAddressFrom` in src/config/settings.mjs is where that rule is written down.
 *
 * WHY IT IS ITS OWN FILE. A module that imports one Vite makes at serve time can only be loaded by
 * Vite, and `src/web/lib/api-address.ts` is reached from `src/web/api.ts`, which two hundred tests
 * import under plain Node. `src/web/lib/served.ts` is separated from `src/web/lib/world.ts` for
 * exactly this reason and says so. The reading of the tag is a file of its own for the same reason
 * from the other side: it has a test, and a test cannot import this file.
 *
 * `src/web/main.tsx` imports this for the side effect, in the same place and for the same reason it
 * imports `./lib/served.ts`.
 */
import { apiPortInDevelopment } from 'virtual:mole-office-api'
import { theApiIsOnPort } from './api-address.ts'
import { theApiPortWrittenIntoThisPage } from './the-port-written-into-this-page.ts'

const written = theApiPortWrittenIntoThisPage()
theApiIsOnPort(written ?? apiPortInDevelopment)
