-- Mock vectors are for wiring only. A real embedding model requires reindexing.
create table public.chat_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  title text not null,
  url text,
  visibility text not null check (visibility in ('public', 'course', 'private')),
  course_id uuid references public.courses(id) on delete cascade,
  owner_id uuid references public.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  check ((visibility = 'public' and course_id is null and owner_id is null)
    or (visibility = 'course' and course_id is not null and owner_id is null)
    or (visibility = 'private' and owner_id is not null and course_id is null))
);
create table public.chat_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.chat_knowledge_sources(id) on delete cascade,
  ordinal integer not null,
  content text not null,
  embedding extensions.vector(256) not null,
  model text not null,
  unique(source_id, ordinal)
);
alter table public.chat_knowledge_sources enable row level security;
alter table public.chat_knowledge_chunks enable row level security;
revoke all on public.chat_knowledge_sources, public.chat_knowledge_chunks from anon, authenticated;
grant all on public.chat_knowledge_sources, public.chat_knowledge_chunks to service_role;

-- Filter access inside retrieval BEFORE ordering/limiting; never accept viewer_id from HTTP body.
create function public.search_chat_knowledge(query_embedding extensions.vector(256), viewer_id uuid, embedding_model text)
returns table(id uuid, title text, content text, url text, score double precision)
language sql stable security invoker set search_path = public, extensions as $$
  select k.id, s.title, k.content, s.url, 1 - (k.embedding <=> query_embedding) as score
  from public.chat_knowledge_chunks k
  join public.chat_knowledge_sources s on s.id = k.source_id
  where k.model = embedding_model
    and 1 - (k.embedding <=> query_embedding) >= 0.2
    and (s.visibility = 'public' or (viewer_id is not null and (
      (s.visibility = 'private' and s.owner_id = viewer_id)
      or (s.visibility = 'course' and exists (
        select 1 from public.users u where u.id = viewer_id and (
          exists (select 1 from public.courses c where c.id = s.course_id and c.teacher_id = u.id)
          or exists (select 1 from public.enrollments e where e.course_id = s.course_id and e.student_code = u.student_id)
        )
      ))
    )))
  order by k.embedding <=> query_embedding limit 4;
$$;

-- One transaction and a source row lock prevent partial replacement/concurrent duplicate chunks.
create function public.replace_chat_knowledge(source jsonb, chunks jsonb)
returns void language plpgsql security invoker set search_path = public, extensions as $$
declare source_id uuid;
begin
  insert into public.chat_knowledge_sources(source_key, title, url, visibility, course_id, owner_id)
  values (source->>'key', source->>'title', source->>'url', source->>'visibility',
    (source->>'courseId')::uuid, (source->>'ownerId')::uuid)
  on conflict (source_key) do update set title = excluded.title, url = excluded.url,
    visibility = excluded.visibility, course_id = excluded.course_id,
    owner_id = excluded.owner_id, updated_at = now()
  returning id into source_id;
  delete from public.chat_knowledge_chunks k where k.source_id = replace_chat_knowledge.source_id;
  insert into public.chat_knowledge_chunks(source_id, ordinal, content, embedding, model)
  select source_id, (ordinality - 1)::integer, item->>'content',
    (item->'embedding')::text::extensions.vector, item->>'model'
  from jsonb_array_elements(chunks) with ordinality as t(item, ordinality);
end;
$$;
revoke all on function public.search_chat_knowledge(extensions.vector, uuid, text) from public, anon, authenticated;
revoke all on function public.replace_chat_knowledge(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.search_chat_knowledge(extensions.vector, uuid, text) to service_role;
grant execute on function public.replace_chat_knowledge(jsonb, jsonb) to service_role;
