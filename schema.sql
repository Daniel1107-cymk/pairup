-- Run once against your Neon / Vercel Postgres database.
create table if not exists sessions (
  id          serial primary key,
  date        date not null,
  venue       text not null,
  court_count int  not null check (court_count between 1 and 20)
);

create table if not exists players (
  id           serial primary key,
  session_id   int  not null references sessions(id) on delete cascade,
  name         text not null,
  skill_rating int  check (skill_rating between 1 and 5)
);

create table if not exists rounds (
  id           serial primary key,
  session_id   int not null references sessions(id) on delete cascade,
  round_number int not null,
  unique (session_id, round_number)
);

-- ponytail: player ids stored as int arrays, no join table. Query by round, not by player.
create table if not exists matches (
  id             serial primary key,
  round_id       int   not null references rounds(id) on delete cascade,
  court_number   int   not null,
  team_a_players int[] not null,
  team_b_players int[] not null
);

alter table matches add column if not exists finished_at timestamptz;
create index if not exists matches_active on matches (round_id) where finished_at is null;
alter table rounds add column if not exists created_at timestamptz not null default now();
alter table players add column if not exists resting boolean not null default false;
