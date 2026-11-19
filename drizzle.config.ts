// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Config } from 'drizzle-kit'
import { settings } from './src/config/settings.mjs'

export default {
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  // The database and its default come from src/config/settings.mjs. This line used to carry its own
  // `?? './data/panelx.db'`, which was the fifth copy of that path in the repository.
  dbCredentials: { url: settings().databasePath },
} satisfies Config
