import { defineConfig } from "drizzle-kit";

// `db:push` invents DDL from a schema diff and is local-only, for a throwaway
// database; production goes through `scripts/migrate.mjs`. `strict: false` is
// required: `strict: true` throws on any `push` run without a TTY.
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://towncenter:towncenter@localhost:5455/towncenter",
  },
  strict: false,
  verbose: true,
});
