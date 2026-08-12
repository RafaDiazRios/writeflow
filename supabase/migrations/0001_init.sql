-- ════════════════════════════════════════════════════════════════════════
--  WriteFlow — esquema de sincronización
--
--  Espejo del esquema SQLite local. Cada fila pertenece a un usuario y las
--  políticas RLS garantizan que nadie más pueda leerla ni escribirla.
--
--  El contenido del diario y de la terapia narrativa llega YA CIFRADO desde
--  el cliente (AES-256-GCM con clave derivada por Argon2id). Postgres solo
--  ve cadenas opacas con el prefijo `wf1.`; no puede indexarlas ni leerlas.
-- ════════════════════════════════════════════════════════════════════════

-- ─────────────────────────── perfil ───────────────────────────
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  display_name    text,
  -- material público del cifrado: permite reconstruir la clave en un
  -- dispositivo nuevo a partir de la frase de paso del usuario.
  e2e_salt        text,
  e2e_fingerprint text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─────────────────────── columnas comunes ───────────────────────
-- Todas las tablas sincronizadas llevan: id (uuid del cliente), user_id,
-- created_at, updated_at, deleted_at (borrado lógico) y rev (contador de
-- revisión para resolver conflictos).

create table if not exists public.tags (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  color      text not null default '#8b887e',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  rev        integer not null default 1
);

create table if not exists public.journal_entries (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  entry_date   date not null,
  entry_time   text,
  -- ↓ cifrados en el cliente
  title        text,
  content_json text,
  content_text text,
  prompt_text  text,
  place        text,
  weather      text,
  -- ↓ en claro: permiten ordenar, paginar y pintar el calendario sin descifrar
  mood         smallint,
  energy       smallint,
  prompt_id    text,
  word_count   integer not null default 0,
  is_favorite  smallint not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  rev          integer not null default 1
);
create index if not exists journal_entries_user_updated
  on public.journal_entries (user_id, updated_at);
create index if not exists journal_entries_user_date
  on public.journal_entries (user_id, entry_date);

create table if not exists public.projects (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('novel', 'essay')),
  title        text not null default 'Sin título',
  subtitle     text,
  author       text,
  genre        text,
  logline      text,
  synopsis     text,
  template_id  text,
  target_words integer not null default 0,
  deadline     date,
  status       text not null default 'draft',
  color        text not null default '#4573b4',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  rev          integer not null default 1
);
create index if not exists projects_user_updated on public.projects (user_id, updated_at);

create table if not exists public.documents (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  project_id   text not null,
  parent_id    text,
  position     double precision not null default 0,
  kind         text not null default 'scene',
  title        text not null default 'Sin título',
  synopsis     text,
  notes        text,
  guide        text,
  content_json text,
  content_text text,
  label        text,
  status       text,
  pov          text,
  place        text,
  time_frame   text,
  word_count   integer not null default 0,
  target_words integer not null default 0,
  in_compile   smallint not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  rev          integer not null default 1
);
create index if not exists documents_user_updated on public.documents (user_id, updated_at);
create index if not exists documents_project on public.documents (project_id);

create table if not exists public.characters (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  project_id    text not null,
  name          text not null default '',
  alias         text,
  role          text,
  age           text,
  occupation    text,
  appearance    text,
  personality   text,
  goal          text,
  motivation    text,
  conflict      text,
  arc           text,
  backstory     text,
  voice         text,
  secrets       text,
  relationships text,
  notes         text,
  color         text not null default '#6892ca',
  image_path    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  rev           integer not null default 1
);
create index if not exists characters_user_updated on public.characters (user_id, updated_at);

create table if not exists public.places (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  text not null,
  name        text not null default '',
  kind        text,
  description text,
  atmosphere  text,
  history     text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  rev         integer not null default 1
);
create index if not exists places_user_updated on public.places (user_id, updated_at);

create table if not exists public.plot_threads (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  text not null,
  name        text not null default '',
  kind        text not null default 'subplot',
  color       text not null default '#9db8de',
  description text,
  position    double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  rev         integer not null default 1
);
create index if not exists plot_threads_user_updated on public.plot_threads (user_id, updated_at);

create table if not exists public.plot_beats (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  text not null,
  thread_id   text,
  document_id text,
  title       text not null default '',
  description text,
  status      text not null default 'idea',
  position    double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  rev         integer not null default 1
);
create index if not exists plot_beats_user_updated on public.plot_beats (user_id, updated_at);

create table if not exists public.therapy_entries (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- ↓ cifrados en el cliente
  exercise_name text,
  prompt_text   text,
  content_json  text,
  content_text  text,
  followups     text,
  -- ↓ en claro
  exercise_id   text,
  school        text,
  level         smallint not null default 1,
  word_count    integer not null default 0,
  session_date  date not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  rev           integer not null default 1
);
create index if not exists therapy_entries_user_updated on public.therapy_entries (user_id, updated_at);

-- ─────────────────── updated_at automático ───────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','tags','journal_entries','projects','documents','characters',
    'places','plot_threads','plot_beats','therapy_entries'
  ] loop
    execute format(
      'drop trigger if exists touch_%1$s on public.%1$s;
       create trigger touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at();', t);
  end loop;
end $$;

-- ─────────────────── seguridad a nivel de fila ───────────────────
-- Sin estas políticas cualquier usuario autenticado podría leer las filas de
-- los demás. Con ellas, Postgres filtra por auth.uid() en cada consulta.

alter table public.profiles        enable row level security;
alter table public.tags            enable row level security;
alter table public.journal_entries enable row level security;
alter table public.projects        enable row level security;
alter table public.documents       enable row level security;
alter table public.characters      enable row level security;
alter table public.places          enable row level security;
alter table public.plot_threads    enable row level security;
alter table public.plot_beats      enable row level security;
alter table public.therapy_entries enable row level security;

drop policy if exists "perfil propio" on public.profiles;
create policy "perfil propio" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

do $$
declare t text;
begin
  foreach t in array array[
    'tags','journal_entries','projects','documents','characters',
    'places','plot_threads','plot_beats','therapy_entries'
  ] loop
    execute format('drop policy if exists "filas propias" on public.%I;', t);
    execute format(
      'create policy "filas propias" on public.%I
         for all using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);
  end loop;
end $$;

-- ─────────────────── perfil automático al registrarse ───────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────── endurecimiento (linter de Supabase) ───────────────────
-- search_path fijo: evita que un esquema del usuario secuestre la función.
create or replace function public.touch_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- `handle_new_user` es un disparador, no parte de la API: nadie debe poder
-- invocarla desde /rest/v1/rpc.
revoke execute on function public.handle_new_user() from anon, authenticated, public;
