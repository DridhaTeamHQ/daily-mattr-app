# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Supabase is READ-ONLY

This project's Supabase instance is production. **Read from it, never change it.**

Allowed:

- `SELECT` queries and read-only RPCs to inspect data or confirm a schema
- Reading table/column definitions, policies, and function signatures
- Generating TypeScript types from the live schema

Not allowed — do not do these, even if asked to "just quickly" or to unblock a fix.
Report what needs changing and let a human apply it in the Supabase dashboard:

- `INSERT` / `UPDATE` / `DELETE` / `TRUNCATE` on any table
- DDL of any kind: `CREATE` / `ALTER` / `DROP` on tables, columns, views, functions, triggers, RLS policies
- Applying or writing migrations against the remote project
- Deploying, editing, or deleting edge functions
- Storage writes, auth user changes, project settings, branches, pause/restore

With the Supabase MCP server, that means read-only tools only (`list_tables`,
`list_migrations`, `get_advisors`, `get_logs`, `generate_typescript_types`,
`execute_sql` with a bare `SELECT`). Never `apply_migration`, `deploy_edge_function`,
`create_branch`, `merge_branch`, or any `execute_sql` that mutates.

The app's own write paths (`app_add_comment`, `app_toggle_comment_like`,
`app_log_events`, `app_register_push`, `app_seed_topics`) are existing product
behaviour and stay as they are — this rule is about the agent not mutating the
database out of band, not about removing app features.

# Secrets

Supabase credentials live in `.env` (git-ignored; `.env.example` is the tracked
template). Only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
may be read from `src/` — Expo inlines `EXPO_PUBLIC_*` into the shipped bundle.

`SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. Never import it from `src/`, never
give it an `EXPO_PUBLIC_` prefix, and never hardcode any key in source.
