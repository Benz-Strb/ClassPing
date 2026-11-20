-- เอาแชทบอทออกจากโครงงาน: ลบดัชนีความรู้ แหล่งความรู้ในแคตตาล็อก และคอลัมน์ url ที่ใช้เฉพาะแหล่งความรู้
drop function if exists public.save_catalog_knowledge(uuid, jsonb, jsonb);
drop function if exists public.replace_chat_knowledge(jsonb, jsonb);
drop function if exists public.search_chat_knowledge(extensions.vector, uuid, text);
drop table if exists public.chat_knowledge_chunks;
drop table if exists public.chat_knowledge_sources;

delete from public.admin_catalog where kind = 'knowledge';
alter table public.admin_catalog drop constraint admin_catalog_kind_check;
alter table public.admin_catalog drop constraint admin_catalog_check;
alter table public.admin_catalog drop column url;
alter table public.admin_catalog add constraint admin_catalog_kind_check check (kind in ('curricula', 'reference'));
alter table public.admin_catalog add constraint admin_catalog_check check (
  (kind = 'curricula' and code is not null and year is not null and year between 1900 and 3000 and category is null)
  or (kind = 'reference' and code is not null and year is null and category is not null and length(btrim(category)) between 1 and 100)
);
