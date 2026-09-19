-- Create projects table
create table public.projects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  code text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Set up Row Level Security (RLS)
alter table public.projects enable row level security;

-- Create policies
create policy "Users can view their own projects"
  on public.projects for select
  using ( auth.uid() = user_id );

create policy "Users can insert their own projects"
  on public.projects for insert
  with check ( auth.uid() = user_id );

create policy "Users can update their own projects"
  on public.projects for update
  using ( auth.uid() = user_id );

create policy "Users can delete their own projects"
  on public.projects for delete
  using ( auth.uid() = user_id );
