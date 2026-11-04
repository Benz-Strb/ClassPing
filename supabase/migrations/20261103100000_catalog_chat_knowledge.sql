-- Use an unambiguous local id when replacing chunks.
create or replace function public.replace_chat_knowledge(source jsonb, chunks jsonb)
returns void language plpgsql security invoker set search_path = public, extensions as $$
declare saved_source_id uuid;
begin
  insert into public.chat_knowledge_sources(source_key, title, url, visibility, course_id, owner_id)
  values (source->>'key', source->>'title', source->>'url', source->>'visibility',
    (source->>'courseId')::uuid, (source->>'ownerId')::uuid)
  on conflict (source_key) do update set title = excluded.title, url = excluded.url,
    visibility = excluded.visibility, course_id = excluded.course_id,
    owner_id = excluded.owner_id, updated_at = now()
  returning id into saved_source_id;
  delete from public.chat_knowledge_chunks k where k.source_id = saved_source_id;
  insert into public.chat_knowledge_chunks(source_id, ordinal, content, embedding, model)
  select saved_source_id, (ordinality - 1)::integer, item->>'content',
    (item->'embedding')::text::extensions.vector, item->>'model'
  from jsonb_array_elements(chunks) with ordinality as t(item, ordinality);
end;
$$;

-- Save catalog content and its retrieval index together; failures roll back both.
create function public.save_catalog_knowledge(entry_id uuid, entry jsonb, chunks jsonb)
returns jsonb language plpgsql security invoker set search_path = public, extensions as $$
declare saved public.admin_catalog;
begin
  if coalesce((entry->>'active')::boolean, false) and jsonb_array_length(chunks) = 0 then
    raise exception 'Active knowledge requires chunks';
  end if;
  if entry_id is null then
    insert into public.admin_catalog(kind, name, url, content, active)
    values ('knowledge', entry->>'name', entry->>'url', entry->>'content', (entry->>'active')::boolean)
    returning * into saved;
  else
    update public.admin_catalog
    set name = entry->>'name', url = entry->>'url', content = entry->>'content',
      active = (entry->>'active')::boolean, updated_at = now()
    where id = entry_id and kind = 'knowledge'
    returning * into saved;
    if not found then return null; end if;
  end if;
  if saved.active then
    perform public.replace_chat_knowledge(jsonb_build_object(
      'key', 'catalog:' || saved.id, 'title', saved.name, 'url', saved.url, 'visibility', 'public'
    ), chunks);
  else
    delete from public.chat_knowledge_sources where source_key = 'catalog:' || saved.id;
  end if;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.save_catalog_knowledge(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_catalog_knowledge(uuid, jsonb, jsonb) to service_role;
