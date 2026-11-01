-- Run with psql -v ON_ERROR_STOP=1 -f supabase/tests/chat_knowledge.sql on LOCAL/TEST only.
-- All fixtures roll back; any failing assertion raises an error.
begin;
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); teacher uuid := gen_random_uuid();
  course uuid := gen_random_uuid(); result_count integer;
  key_prefix text := 'rag-test-' || gen_random_uuid()::text;
  vec extensions.vector := array_fill(1.0::real, array[256])::extensions.vector;
  chunks jsonb;
begin
  if has_function_privilege('anon', 'public.search_chat_knowledge(extensions.vector,uuid,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.replace_chat_knowledge(jsonb,jsonb)', 'EXECUTE') then
    raise exception 'RPC accessible without service role';
  end if;
  if has_table_privilege('anon', 'public.chat_knowledge_chunks', 'SELECT')
    or has_table_privilege('authenticated', 'public.chat_knowledge_sources', 'SELECT') then
    raise exception 'knowledge tables accessible directly';
  end if;
  insert into auth.users(id, email) values (a, a || '@test.invalid'), (b, b || '@test.invalid'), (teacher, teacher || '@test.invalid');
  insert into public.users(id, email, role, student_id) values
    (a, a || '@test.invalid', 'student', '999999999991'),
    (b, b || '@test.invalid', 'student', '999999999992'),
    (teacher, teacher || '@test.invalid', 'teacher', null);
  insert into public.courses(id, code, name, teacher_id) values (course, key_prefix, 'RAG TEST', teacher);
  insert into public.enrollments(course_id, student_code) values (course, '999999999991');
  chunks := jsonb_build_array(jsonb_build_object('content', 'test evidence', 'embedding', vec::text::jsonb, 'model', key_prefix));
  perform public.replace_chat_knowledge(jsonb_build_object('key', key_prefix || '-public', 'title', 'public', 'visibility', 'public'), chunks);
  perform public.replace_chat_knowledge(jsonb_build_object('key', key_prefix || '-private', 'title', 'private', 'visibility', 'private', 'ownerId', a), chunks);
  perform public.replace_chat_knowledge(jsonb_build_object('key', key_prefix || '-course', 'title', 'course', 'visibility', 'course', 'courseId', course), chunks);
  select count(*) into result_count from public.search_chat_knowledge(vec, null, key_prefix);
  if result_count <> 1 then raise exception 'anonymous leaked private/course data'; end if;
  select count(*) into result_count from public.search_chat_knowledge(vec, b, key_prefix);
  if result_count <> 1 then raise exception 'other student leaked private/course data'; end if;
  select count(*) into result_count from public.search_chat_knowledge(vec, a, key_prefix);
  if result_count <> 3 then raise exception 'enrolled owner missing authorized sources'; end if;
  select count(*) into result_count from public.search_chat_knowledge(vec, teacher, key_prefix);
  if result_count <> 2 then raise exception 'teacher course access incorrect'; end if;
  delete from public.enrollments where course_id = course;
  select count(*) into result_count from public.search_chat_knowledge(vec, a, key_prefix);
  if result_count <> 2 then raise exception 'revoked enrollment still authorized'; end if;
  perform public.replace_chat_knowledge(jsonb_build_object('key', key_prefix || '-public', 'title', 'updated', 'visibility', 'public'), chunks);
  select count(*) into result_count from public.chat_knowledge_chunks k join public.chat_knowledge_sources s on s.id = k.source_id where s.source_key = key_prefix || '-public';
  if result_count <> 1 then raise exception 'replacement duplicated chunks'; end if;
  select count(*) into result_count from public.search_chat_knowledge(vec, a, 'different-model');
  if result_count <> 0 then raise exception 'embedding models mixed'; end if;
end;
$$;
rollback;
