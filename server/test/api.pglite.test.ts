// The API tests again, on real PostgreSQL SQL (PGlite runs Postgres in-process),
// so the database used on the website is checked too.
process.env.TEST_DB = 'pglite';
await import('./api.test');

export {};
