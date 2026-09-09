'use strict';
/** Drops the database file and rebuilds an empty schema. */
const fs = require('fs');
const path = require('path');
const { DB_PATH, open, initSchema } = require('./db');

for (const suffix of ['', '-wal', '-shm']) {
  const p = DB_PATH + suffix;
  if (fs.existsSync(p)) { fs.rmSync(p); console.log('removed ' + p); }
}

const db = open();
initSchema(db);
console.log('\n  [OK] Fresh database created at:\n       ' + DB_PATH + '\n');
console.log('  Run "npm run seed" to load demo data.\n');
