-- ============================================================
-- 20260909_advisors.sql — lo que los advisors de Supabase señalaron el 2026-09-08
-- ============================================================
--
-- Origen: auditoría `docs/audits/2026-09-08-app-audit.md`, hallazgo I-1. Cuatro cosas, ninguna
-- con impacto visible hoy y las cuatro del tipo que sólo se arregla cuando alguien mira:
--
--   1. **`rls_auto_enable()` ejecutable por `anon` y `authenticated`.** Es `SECURITY DEFINER`, o
--      sea que corre con los privilegios de su dueño. Cualquiera con la clave pública podía
--      llamarla. Hoy sólo activa RLS en las tablas nuevas —no filtra datos ni escribe— pero una
--      función `SECURITY DEFINER` expuesta a `anon` es la clase de superficie que un día crece
--      con una línea nueva dentro y nadie vuelve a mirar el `grant`. Se revoca: la llama el
--      trigger de DDL, que corre como el dueño, no como el usuario.
--
--   2. **25 políticas RLS re-evaluando `auth.uid()` por FILA.** `auth.uid()` es `STABLE`, pero
--      escrito suelto en el `USING` el planificador lo mete en el filtro de cada fila en vez de
--      resolverlo una vez en el InitPlan. Envuelto en `(select auth.uid())` se evalúa UNA vez por
--      consulta. Con 4.000 filas de `workouts` la diferencia es real y crece con los datos, que
--      es justo lo que no se nota hasta que ya molesta. La semántica NO cambia: mismo predicado,
--      mismo resultado, un plan mejor.
--
--   3. **`oauth_states.user_id` sin índice** aunque es FK a `auth.users`. Un `delete` de usuario
--      hace un scan completo de la tabla, y el `select` por usuario del flujo OAuth también.
--
--   4. **`integration_events_received_idx` sin usar nunca.** Un índice que nadie lee sigue
--      costando en cada `insert` — y `integration_events` es una tabla de escritura (el webhook
--      de WHOOP escribe ahí). La consulta que lo justificaría no existe.
--
-- La protección de contraseñas filtradas (el otro WARN de seguridad) NO se puede activar por SQL:
-- va en Dashboard › Authentication › Password protection, y es cosa de Julian.
--
-- Verificación: `get_advisors` security → sin `anon_security_definer_function_executable`;
-- `get_advisors` performance → sin `auth_rls_initplan` ni `unindexed_foreign_keys` ni
-- `unused_index`.

-- ── 1 · rls_auto_enable() fuera del alcance de anon/authenticated ─────────────────────
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- ── 2 · Las 25 políticas RLS, a `(select auth.uid())` ─────────────────────────────────
-- Una por una y preservando la semántica exacta: las que tenían `with check` lo mantienen, las
-- que sólo tenían `using` siguen sólo con `using`, y las de `INSERT` siguen sólo con `with check`
-- (Postgres no admite `USING` en una política de INSERT).

alter policy "Users see own bodyweight"        on public.bodyweight        using ((select auth.uid()) = user_id);
alter policy "Users see own coach_reviews"     on public.coach_reviews     using ((select auth.uid()) = user_id);
alter policy "Users see own decisions"         on public.decisions         using ((select auth.uid()) = user_id);
alter policy "Users see own foods"             on public.foods             using ((select auth.uid()) = user_id);
alter policy "Users see own meals"             on public.meals             using ((select auth.uid()) = user_id);
alter policy "Users see own nutrition"         on public.nutrition         using ((select auth.uid()) = user_id);
alter policy "Users see own runs"              on public.runs              using ((select auth.uid()) = user_id);
alter policy "Users see own settings"          on public.settings          using ((select auth.uid()) = user_id);
alter policy "Users see own workouts"          on public.workouts          using ((select auth.uid()) = user_id);
alter policy "Users see own integration_status" on public.integration_status using ((select auth.uid()) = user_id);

-- Las tres `ALL` que además comprueban la escritura.
alter policy "Users manage own exercises" on public.exercises
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "Users manage own plans" on public.plans
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "Users manage own sessions" on public.sessions
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- `mobility_sessions`: cuatro políticas por comando.
alter policy "Users can view own mobility_sessions"   on public.mobility_sessions using ((select auth.uid()) = user_id);
alter policy "Users can update own mobility_sessions" on public.mobility_sessions using ((select auth.uid()) = user_id);
alter policy "Users can delete own mobility_sessions" on public.mobility_sessions using ((select auth.uid()) = user_id);
alter policy "Users can insert own mobility_sessions" on public.mobility_sessions with check ((select auth.uid()) = user_id);

-- `steps`: idem.
alter policy "steps_owner_select" on public.steps using ((select auth.uid()) = user_id);
alter policy "steps_owner_update" on public.steps using ((select auth.uid()) = user_id);
alter policy "steps_owner_delete" on public.steps using ((select auth.uid()) = user_id);
alter policy "steps_owner_insert" on public.steps with check ((select auth.uid()) = user_id);

-- `wellness`: idem, y `wellness_owner_update` es la única que traía `with check` además del
-- `using` — se conserva tal cual.
alter policy "wellness_owner_select" on public.wellness using ((select auth.uid()) = user_id);
alter policy "wellness_owner_delete" on public.wellness using ((select auth.uid()) = user_id);
alter policy "wellness_owner_insert" on public.wellness with check ((select auth.uid()) = user_id);
alter policy "wellness_owner_update" on public.wellness
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ── 3 · El índice que falta ───────────────────────────────────────────────────────────
create index if not exists oauth_states_user_id_idx on public.oauth_states(user_id);

-- ── 4 · El índice que no se usa ───────────────────────────────────────────────────────
drop index if exists public.integration_events_received_idx;
