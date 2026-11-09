alter table public.transfer_requests
  alter column curriculum_id drop not null,
  alter column curriculum_document_id drop not null,
  add column source_major text not null default '',
  add column ocr_text text not null default '';
alter table public.transfer_curriculum_documents
  add column source_institution text not null default '',
  add column source_major text not null default '',
  add column courses jsonb not null default '[]'::jsonb check (jsonb_typeof(courses) = 'array'),
  add column ocr_text text not null default '';

create or replace function public.review_transfer_request(p_request_id uuid,p_reviewer_id uuid,p_decisions jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare
  r public.transfer_requests%rowtype;
  item jsonb;
  decision jsonb;
  reviewed_items jsonb := '[]'::jsonb;
  approved_count integer := 0;
begin
  if not exists(select 1 from public.users where id=p_reviewer_id and role in ('teacher','admin')) then
    raise exception 'FORBIDDEN';
  end if;
  select * into r from public.transfer_requests where id=p_request_id for update;
  if not found then raise exception 'INVALID_REVIEW'; end if;
  if r.status<>'pending' then raise exception 'ALREADY_REVIEWED'; end if;
  if jsonb_typeof(p_decisions) is distinct from 'array' then raise exception 'INVALID_REVIEW'; end if;
  if jsonb_array_length(p_decisions)<>jsonb_array_length(r.items)
    or (select count(distinct d->>'itemId') from jsonb_array_elements(p_decisions) d)<>jsonb_array_length(r.items)
  then raise exception 'INVALID_REVIEW'; end if;
  for item in select * from jsonb_array_elements(r.items) loop
    select d into decision from jsonb_array_elements(p_decisions) d where d->>'itemId'=item->>'id';
    if decision is null or coalesce(decision->>'decision','') not in ('approved','rejected')
      or length(coalesce(decision->>'note',''))>2000
      or (decision->>'decision'='rejected' and length(btrim(coalesce(decision->>'note','')))=0)
    then raise exception 'INVALID_REVIEW'; end if;
    if decision ? 'expectedDocumentId' and (decision->>'expectedDocumentId') is distinct from r.curriculum_document_id::text then raise exception 'CURRICULUM_CHANGED'; end if;
    if decision ? 'match' then
      item := (item - 'previousApproval' - 'matchSource') || jsonb_build_object('match', decision->'match');
    end if;
    if decision->>'decision'='approved' then
      if r.curriculum_id is null or r.curriculum_document_id is null then raise exception 'INVALID_REVIEW'; end if;
      if jsonb_typeof(item->'match') is distinct from 'object'
        or coalesce(item->'match'->>'targetCode','')=''
        or (item->>'credits')::numeric < (item->'match'->>'minCredits')::numeric
      then raise exception 'INVALID_REVIEW'; end if;
      insert into public.transfer_granted_courses(student_id,curriculum_id,target_code,target_name,credits,request_id,reviewed_by)
      values(r.student_id,r.curriculum_id,item->'match'->>'targetCode',item->'match'->>'targetName',(item->'match'->>'targetCredits')::numeric,r.id,p_reviewer_id);
      approved_count := approved_count+1;
    end if;
    reviewed_items := reviewed_items || jsonb_build_array(item || jsonb_build_object('decision',decision->>'decision','note',coalesce(decision->>'note','')));
  end loop;
  update public.transfer_requests set items=reviewed_items, reviewed_by=p_reviewer_id, reviewed_at=now(),
    status=case when approved_count=0 then 'rejected' when approved_count=jsonb_array_length(r.items) then 'approved' else 'partially_approved' end
  where id=r.id;
end;
$$;
revoke all on function public.review_transfer_request(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.review_transfer_request(uuid,uuid,jsonb) to service_role;
