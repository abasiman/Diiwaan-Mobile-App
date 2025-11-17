// db/db.web.ts

export const db = null as any;

export function initDb() {
  // This app does not use SQLite on web.
  // If web entry ever runs this, at least it won't crash at build-time.
  console.warn('initDb() called on web – offline SQLite is not supported.');
}
