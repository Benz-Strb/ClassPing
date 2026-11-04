-- Additive module; apply after admin_catalog. No enrollment/attendance changes.
create table public.transfer_curriculum_documents (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references public.admin_catalog(id),
  path text not null unique,
  file_name text not null check (length(file_name) between 1 and 255),
  mime text not null check (mime in ('application/pdf','image/jpeg','image/png')),
  size integer not null check (size between 1 and 10485760),
  created_at timestamptz not null default now(),
  unique(id, curriculum_id)
);
create table public.transfer_mappings (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references public.admin_catalog(id),
  source_institution text not null check (length(source_institution) between 1 and 200),
  source_code text not null check (length(source_code) between 1 and 60),
  source_name text not null check (length(source_name) between 1 and 200),
  min_credits numeric not null check (min_credits between 0.5 and 30 and mod(min_credits,0.5)=0),
  target_code text not null check (length(target_code) between 1 and 60),
  target_name text not null check (length(target_name) between 1 and 200),
  target_credits numeric not null check (target_credits between 0.5 and 30 and mod(target_credits,0.5)=0),
  active boolean not null default true,
  unique(curriculum_id, source_institution, source_code)
);
create table public.transfer_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id),
  curriculum_id uuid not null references public.admin_catalog(id),
  curriculum_document_id uuid not null,
  curriculum_name text not null,
  source_institution text not null,
  document_path text not null unique,
  document_name text not null,
  document_mime text not null check (document_mime in ('application/pdf','image/jpeg','image/png')),
  document_size integer not null check (document_size between 1 and 10485760),
  items jsonb not null check (case when jsonb_typeof(items)='array' then jsonb_array_length(items) between 1 and 50 else false end),
  status text not null default 'pending' check (status in ('pending','approved','partially_approved','rejected')),
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(curriculum_document_id,curriculum_id) references public.transfer_curriculum_documents(id,curriculum_id),
  check ((status='pending' and reviewed_by is null and reviewed_at is null) or (status<>'pending' and reviewed_by is not null and reviewed_at is not null))
);
create index transfer_requests_student_created on public.transfer_requests(student_id,created_at desc);
create table public.transfer_granted_courses (
  student_id uuid not null references public.users(id),
  curriculum_id uuid not null references public.admin_catalog(id),
  target_code text not null,
  target_name text not null,
  credits numeric not null check (credits between 0.5 and 30),
  request_id uuid not null references public.transfer_requests(id),
  reviewed_by uuid not null references public.users(id),
  granted_at timestamptz not null default now(),
  primary key(student_id,curriculum_id,target_code)
);

alter table public.transfer_curriculum_documents enable row level security;
alter table public.transfer_mappings enable row level security;
alter table public.transfer_requests enable row level security;
alter table public.transfer_granted_courses enable row level security;
revoke all on public.transfer_curriculum_documents, public.transfer_mappings, public.transfer_requests, public.transfer_granted_courses from anon, authenticated;
grant all on public.transfer_curriculum_documents, public.transfer_mappings, public.transfer_requests, public.transfer_granted_courses to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('transfer-documents','transfer-documents',false,10485760,array['application/pdf','image/jpeg','image/png']);

create function public.review_transfer_request(p_request_id uuid,p_reviewer_id uuid,p_decisions jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare
  r public.transfer_requests%rowtype;
  item jsonb;
  decision jsonb;
  reviewed_items jsonb := '[]'::jsonb;
  approved_count integer := 0;
begin
  if not exists(select 1 from public.users where id=p_reviewer_id and role='admin') then
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
    if decision->>'decision'='approved' then
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
