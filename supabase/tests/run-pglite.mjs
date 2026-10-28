/** Run migrations and SQL checks in a disposable local database, never the hosted project. */
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

// Windows may exhaust memory when V8 compiles this PostgreSQL WASM module in parallel.
// Keep npm test:db and direct invocations reproducible without caller-specific flags.
if (process.platform === 'win32' && !process.execArgv.includes('--wasm-num-compilation-tasks=1')) {
  const child = spawnSync(process.execPath, [...process.execArgv, '--wasm-num-compilation-tasks=1', ...process.argv.slice(1)], { stdio: 'inherit' });
  if (child.error) console.error('DATABASE TEST FAILED:', child.error.message);
  process.exit(child.status ?? 1);
}

let PGlite, pgcrypto;
try {
  ({ PGlite } = await import('@electric-sql/pglite'));
  ({ pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto'));
} catch {
  ({ PGlite } = await import('../.test-runtime/node_modules/@electric-sql/pglite/dist/index.js'));
  ({ pgcrypto } = await import('../.test-runtime/node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.js'));
}

const db = new PGlite({ extensions: { pgcrypto } });
try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth; create schema storage; create schema extensions;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth,storage,extensions to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
  `);
  const files = (await readdir(new URL('../migrations/', import.meta.url))).filter(f=>f.endsWith('.sql')).sort();
  for (const file of files) {
    const migration = await readFile(new URL('../migrations/'+file,import.meta.url),'utf8');
    if (file === '202610130014_retry_search_inventory.sql') {
      const upgrade = await readFile(new URL('upgrade.sql',import.meta.url),'utf8');
      const results = await db.exec(upgrade.replace('-- __ASCEND_FORWARD_MIGRATION__',()=>migration));
      for (const result of results) if (result.rows?.length) console.log(JSON.stringify(result.rows));
      console.log('PASS upgrade.sql');
    }
    await db.exec(migration);
    console.log('PASS migration '+file);
  }
  for (const file of ['acceptance.sql','rls.sql','whatsapp.sql']) {
    const results = await db.exec(await readFile(new URL(file,import.meta.url),'utf8'));
    for (const result of results) if (result.rows?.length) console.log(JSON.stringify(result.rows));
    console.log('PASS '+file);
  }
  const version = await db.query('select version()');
  console.log('Verified on '+version.rows[0].version);
  console.log('Supabase Auth, HTTP API and signed Storage integrations still require live verification.');
} catch(error) {
  console.error('DATABASE TEST FAILED:',error.message);
  if(error.where) console.error(error.where);
  if(error.query) console.error(error.query.slice(0,1200));
  process.exitCode=1;
} finally { await db.close(); }
