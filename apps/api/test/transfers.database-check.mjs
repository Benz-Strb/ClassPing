import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// Pass a scratch installation of PGlite; no production dependency or external DB.
if (!process.argv[2]) throw new Error('Pass path to @electric-sql/pglite/dist/index.js');
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const db = new PGlite();
let checks = 0;
const rejects = async (sql, args, message) => {
  await assert.rejects(db.query(sql, args), (e) => e.message.includes(message));
  checks++;
};
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table public.users(id uuid primary key,role text not null);`);
await db.exec(
  await readFile(
    new URL(
      '../../../supabase/migrations/20261101110000_admin_catalog.sql',
      import.meta.url,
    ),
    'utf8',
  ),
);
await db.exec(
  await readFile(
    new URL(
      '../../../supabase/migrations/20261101140000_transfers.sql',
      import.meta.url,
    ),
    'utf8',
  ),
);
await db.exec(
  await readFile(
    new URL(
      '../../../supabase/migrations/20261108120000_teacher_reviews_transfers.sql',
      import.meta.url,
    ),
    'utf8',
  ),
);
const admin = '10000000-0000-4000-8000-000000000001',
  student = '10000000-0000-4000-8000-000000000002',
  teacher = '10000000-0000-4000-8000-000000000003';
const curriculum = '20000000-0000-4000-8000-000000000001',
  documentId = '30000000-0000-4000-8000-000000000001';
await db.query(
  "insert into public.users values($1,'admin'),($2,'student'),($3,'teacher')",
  [admin, student, teacher],
);
await db.query(
  "insert into public.admin_catalog(id,kind,code,name,year) values($1,'curricula','CS','QA curriculum',2569)",
  [curriculum],
);
await db.query(
  "insert into public.transfer_curriculum_documents(id,curriculum_id,path,file_name,mime,size) values($1,$2,'test/curriculum.pdf','curriculum.pdf','application/pdf',100)",
  [documentId, curriculum],
);
let sequence = 0;
const create = async (items) => {
  sequence++;
  const { rows } = await db.query(
    "insert into public.transfer_requests(student_id,curriculum_id,curriculum_document_id,curriculum_name,source_institution,document_path,document_name,document_mime,document_size,items) values($1,$2,$3,'QA','SCHOOL',$4,'doc.pdf','application/pdf',100,$5) returning id",
    [
      student,
      curriculum,
      documentId,
      `qa/${sequence}.pdf`,
      JSON.stringify(items),
    ],
  );
  return rows[0].id;
};
const item = (id, code, match = true) => ({
  id,
  sourceCode: `S${code}`,
  sourceName: 'test',
  credits: 3,
  grade: 'B',
  match: match
    ? {
        targetCode: code,
        targetName: 'Target',
        targetCredits: 3,
        minCredits: 3,
      }
    : null,
});
const review = 'select public.review_transfer_request($1,$2,$3::jsonb)';
const a = item('item-a', 'IT101'),
  b = item('item-b', 'IT102', false);
const first = await create([a, b]);
await rejects(
  review,
  [
    first,
    admin,
    JSON.stringify([
      { itemId: a.id, decision: 'approved' },
      { itemId: b.id, decision: 'rejected', note: 'No match' },
    ]),
  ],
  'FORBIDDEN',
);
await rejects(review, [first, teacher, '[]'], 'INVALID_REVIEW');
await rejects(
  review,
  [
    first,
    teacher,
    JSON.stringify([
      { itemId: a.id, decision: 'approved' },
      { itemId: a.id, decision: 'approved' },
    ]),
  ],
  'INVALID_REVIEW',
);
await rejects(
  review,
  [
    first,
    teacher,
    JSON.stringify([
      { itemId: a.id, decision: 'approved' },
      { itemId: b.id, decision: 'approved' },
    ]),
  ],
  'INVALID_REVIEW',
);
assert.equal(
  (
    await db.query(
      'select count(*)::int as n from public.transfer_granted_courses',
    )
  ).rows[0].n,
  0,
);
checks++;
await rejects(
  review,
  [
    first,
    teacher,
    JSON.stringify([
      { itemId: a.id, decision: 'approved' },
      { itemId: b.id, decision: 'rejected', note: '' },
    ]),
  ],
  'INVALID_REVIEW',
);
await db.query(review, [
  first,
  teacher,
  JSON.stringify([
    { itemId: a.id, decision: 'approved', note: 'Verified' },
    { itemId: b.id, decision: 'rejected', note: 'No match' },
  ]),
]);
const row = (
  await db.query('select * from public.transfer_requests where id=$1', [first])
).rows[0];
assert.equal(row.status, 'partially_approved');
assert.equal(row.reviewed_by, teacher);
checks++;
assert.equal(row.items[0].note, 'Verified');
assert.equal(row.items[1].decision, 'rejected');
checks += 3;
assert.equal(
  (
    await db.query(
      'select count(*)::int as n from public.transfer_granted_courses',
    )
  ).rows[0].n,
  1,
);
checks++;
await rejects(
  review,
  [
    first,
    teacher,
    JSON.stringify([
      { itemId: a.id, decision: 'approved' },
      { itemId: b.id, decision: 'rejected', note: 'No match' },
    ]),
  ],
  'ALREADY_REVIEWED',
);
const duplicate = await create([item('new', 'IT103'), item('dup', 'IT101')]);
await rejects(
  review,
  [
    duplicate,
    teacher,
    JSON.stringify([
      { itemId: 'new', decision: 'approved' },
      { itemId: 'dup', decision: 'approved' },
    ]),
  ],
  'duplicate key',
);
assert.equal(
  (
    await db.query('select status from public.transfer_requests where id=$1', [
      duplicate,
    ])
  ).rows[0].status,
  'pending',
);
checks++;
assert.equal(
  (
    await db.query(
      "select count(*)::int as n from public.transfer_granted_courses where target_code='IT103'",
    )
  ).rows[0].n,
  0,
);
checks++;
const approved = await create([item('all', 'IT104')]);
await db.query(review, [
  approved,
  teacher,
  JSON.stringify([{ itemId: 'all', decision: 'approved' }]),
]);
assert.equal(
  (
    await db.query('select status from public.transfer_requests where id=$1', [
      approved,
    ])
  ).rows[0].status,
  'approved',
);
checks++;
const rejected = await create([item('no', 'IT105', false)]);
await db.query(review, [
  rejected,
  teacher,
  JSON.stringify([
    { itemId: 'no', decision: 'rejected', note: 'Missing equivalency' },
  ]),
]);
assert.equal(
  (
    await db.query('select status from public.transfer_requests where id=$1', [
      rejected,
    ])
  ).rows[0].status,
  'rejected',
);
checks++;
const permissions = (
  await db.query(
    "select has_function_privilege('authenticated','public.review_transfer_request(uuid,uuid,jsonb)','EXECUTE') as rpc, has_table_privilege('authenticated','public.transfer_requests','SELECT') as direct",
  )
).rows[0];
assert.deepEqual(permissions, { rpc: false, direct: false });
checks++;
assert.equal(
  (
    await db.query(
      "select public from storage.buckets where id='transfer-documents'",
    )
  ).rows[0].public,
  false,
);
checks++;
const result = {
  checks,
  migration: 'passed',
  partialApproval: 'passed',
  rollbackOnDuplicateGrant: 'passed',
  replayDenied: 'passed',
  permissions: 'passed',
  privateBucket: 'passed',
};
console.log(JSON.stringify(result));
await db.close();
