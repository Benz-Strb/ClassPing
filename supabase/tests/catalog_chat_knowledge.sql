-- Run against a disposable migrated database; all test data is rolled back.
begin;
set local role service_role;
do $$
declare
  saved jsonb;
  catalog_id uuid;
  chunks jsonb := jsonb_build_array(jsonb_build_object('content', 'DPU scholarship', 'embedding', to_jsonb(array_fill(0.1::float8, array[256])), 'model', 'mock-trigram-v1'));
  test_source_id uuid;
begin
  if has_function_privilege('anon', 'public.save_catalog_knowledge(uuid,jsonb,jsonb)', 'execute')
    or has_function_privilege('authenticated', 'public.save_catalog_knowledge(uuid,jsonb,jsonb)', 'execute') then
    raise exception 'Client roles may not save catalog knowledge';
  end if;
  if not has_function_privilege('service_role', 'public.save_catalog_knowledge(uuid,jsonb,jsonb)', 'execute') then
    raise exception 'Service role requires execute';
  end if;
  saved := public.save_catalog_knowledge(null, '{"name":"Test FAQ","content":"DPU scholarship","active":true}', chunks);
  catalog_id := (saved->>'id')::uuid;
  select id into test_source_id from public.chat_knowledge_sources where source_key = 'catalog:' || catalog_id;
  if test_source_id is null or not exists (select 1 from public.chat_knowledge_chunks where chat_knowledge_chunks.source_id = test_source_id) then
    raise exception 'Active save did not populate retrieval';
  end if;
  if not exists (select 1 from public.search_chat_knowledge(array_fill(0.1::float8, array[256])::extensions.vector, null, 'mock-trigram-v1') r where r.title = 'Test FAQ') then
    raise exception 'Published source is not available to public retrieval';
  end if;
  perform public.save_catalog_knowledge(catalog_id, '{"name":"Updated FAQ","content":"Updated answer","active":true,"url":"https://www.dpu.ac.th"}',
    jsonb_build_array(jsonb_build_object('content', 'Updated answer', 'embedding', to_jsonb(array_fill(0.1::float8, array[256])), 'model', 'mock-trigram-v1')));
  if (select count(*) from public.chat_knowledge_chunks k where k.source_id = test_source_id) <> 1
    or not exists (select 1 from public.chat_knowledge_sources where id = test_source_id and title = 'Updated FAQ' and url = 'https://www.dpu.ac.th') then
    raise exception 'Update must replace chunks and citation on the same source';
  end if;
  begin
    perform public.save_catalog_knowledge(catalog_id, '{"name":"Must roll back","content":"Invalid vector","active":true}',
      '[{"content":"bad","embedding":[1,2],"model":"mock-trigram-v1"}]');
    raise exception 'Expected invalid vector to fail';
  exception when data_exception then null;
  end;
  if (select name from public.admin_catalog where id = catalog_id) <> 'Updated FAQ'
    or (select content from public.chat_knowledge_chunks k where k.source_id = test_source_id) <> 'Updated answer' then
    raise exception 'Failed indexing must roll back both catalog and chunks';
  end if;
  perform public.save_catalog_knowledge(catalog_id, '{"name":"Updated FAQ","content":"Updated answer","active":false}', '[]');
  if exists (select 1 from public.chat_knowledge_sources where id = test_source_id)
    or exists (select 1 from public.chat_knowledge_chunks k where k.source_id = test_source_id) then
    raise exception 'Disabled content must be removed from retrieval';
  end if;
  perform public.save_catalog_knowledge(catalog_id, '{"name":"Enabled again","content":"DPU scholarship","active":true}', chunks);
  if not exists (select 1 from public.chat_knowledge_sources where source_key = 'catalog:' || catalog_id) then
    raise exception 'Re-enabling must restore retrieval';
  end if;
  if public.save_catalog_knowledge(gen_random_uuid(), '{"name":"Missing","content":"Missing","active":false}', '[]') is not null then
    raise exception 'Missing entries must not be created during update';
  end if;
end;
$$;
rollback;
