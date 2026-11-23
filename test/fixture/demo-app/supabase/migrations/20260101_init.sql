create table public.profiles (id uuid primary key, email text, full_name text);
create table public.messages (id bigint primary key, user_id uuid, body text);
alter table public.messages enable row level security;
create policy "anyone reads" on public.messages for select using (true);
