import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATA_DIR ? `${process.env.DATA_DIR}/briefings.db` : "./data/briefings.db",
  },
});
