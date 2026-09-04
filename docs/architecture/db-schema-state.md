# DB Schema State & Rollback Caveat

Estado vivo del esquema IndexedDB de la PWA y reglas de rollback seguro. Actualizar al cambiar
`DB_VERSION` o agregar/quitar stores. Crítico para no romper la app en dispositivos ya migrados.

## Estado actual (Nutrición v2, v11.49)

- **DB version actual:** **v11** (`app/app.js` → `const DB_VERSION = 11`).
- **Stores más recientes:** `foods` y `meals` (v11, Nutrición v2). Antes: `sessions` (v10, T1).
- **Estado de `sessions`:** activo. T2a loguea recovery-walk / cardio non-run.
- **Sync:** **CONECTADO (T2b, v11.24)** — tabla Supabase `public.sessions` creada (PK
  `(user_id, record_id)`, RLS por `auth.uid()`, mismo patrón que `wellness`/`steps`) y `sessions`
  agregado a la lista de sync (`app/supabase-sync.js`). `logSession` usa `smartPut` → sincroniza.
  Nota: las sesiones logueadas en T2a (vía `dbPut` local-only) no se empujaron retroactivamente; las
  nuevas sí. Last-write-wins por `_updated_at`.

### Stores IndexedDB (v10)
`workouts` · `runs` · `nutrition` · `settings` · `sync_queue` · `bodyweight` · `trash` · `plans` ·
`exercises` · `mobility_sessions` · `weekly_reviews` · `steps` · `wellness` · **`sessions`** (v10).

Migración: `onupgradeneeded` es **aditivo** (crea cada store solo si no existe). No hay migraciones
destructivas; ningún registro se reescribe.

## v11.35 (2026-08-16) — `plans` y `exercises` existen por fin en Supabase

Ambos stores llevaban desde v11.x en la lista de sync (`app/supabase-sync.js`) **sin tener tabla en
Supabase**. Como `drainSyncQueue()` hacía `break` ante el primer fallo, el upsert de `plans` que
`applyIdealPlan()` generó el **2026-06-30** (v11.28) congeló toda la cola de salida durante siete
semanas. Ningún dato se perdió —IndexedDB es la copia completa— pero nada subió a la nube.

Migración `add_plans_and_exercises_sync_tables`: mismo patrón que `sessions` —
PK `(user_id, record_id)`, `data jsonb`, `updated_at`, FK a `auth.users` con `on delete cascade`,
RLS con una política `for all using (auth.uid() = user_id)`.

**Tablas Supabase (11):** `bodyweight` · `exercises` · `mobility_sessions` · `nutrition` ·
**`plans`** · `runs` · `sessions` · `settings` · `steps` · `wellness` · `workouts`.

Cambios de robustez en el mismo release: la cola ya no se bloquea ante un elemento roto (pasa a
cuarentena tras 5 intentos o ante un error permanente), colapsa upserts superseded del mismo
registro, y el estado real del sync es visible en Settings y en Home.

> **Regla que se desprende:** añadir un store a la lista de sync de `supabase-sync.js` **exige**
> crear su tabla en Supabase en el mismo cambio. `weekly_reviews`, `trash` y `sync_queue` siguen
> siendo deliberadamente locales y **no** están en esa lista.

## v11.49 (2026-09-04) — Nutrición v2: `foods` y `meals`, y `nutrition` pasa a ser derivado

**DB version: v10 → v11.** Dos stores nuevos, aditivos como siempre:

- **`foods`** (keyPath `id`) — biblioteca canónica de alimentos con macros **por 100 g**:
  `{id, name, aliases[], kcal100, protein100, carbs100, fat100, fiber100, alcohol100, nova,
  source, verified}`. Sembrada con 55 alimentos (`FOODS_SEED` en `app/nutrition.js`), todos
  `verified: false`. Sustituye a `PROTEIN_DB`, que tenía 28 alimentos con proteína **por ración
  y sin kcal**: servía para autocompletar un número, no para calcular un día.
- **`meals`** (keyPath `id` = timestamp ISO, índice por `date`) — una fila por comida registrada:
  `{id, date, time, type, photoPath, source, aiNotes, items[]}`, con cada item en **gramos**
  más sus macros ya resueltos.

### `nutrition` NO se sustituyó — es ahora el agregado derivado

Decisión deliberada y la más importante del release. El store `nutrition` (keyPath `date`)
estructuralmente ya era un agregado por día con `protein` y `calories`. En vez de crear un tercer
store `nutrition_days` y repuntar a sus cinco consumidores, `recomputeNutritionDay()`
(`app/nutrition.js`) reescribe esa misma fila desde `meals`:

| Consumidor | Qué lee |
|---|---|
| `renderProteinChart()` | `.protein` |
| Lógica de racha (anillos) | `.protein` |
| Tarjeta de fatiga del coach | `.protein`, `.energy` |
| Anillo de proteína del dashboard | `.protein` |
| `renderNutritionHistory()` | `.protein`, `.calories`, `.mealCount` |

Los cinco siguen funcionando **sin un solo cambio**: los campos son los mismos, sólo dejaron de
teclearse y empezaron a derivarse. Campos nuevos en la misma fila: `carbs`, `fat`, `fiber`,
`alcoholG`, `nova12Pct`, `mealCount`, `itemCount`, `estimatedItems`, `kcalTarget`, `proteinFloor`,
`trainingDay`, `eee`, `ffm`, `ea`, `loggedV2`.

`energy` **se conserva** y se sigue escribiendo a mano (`nutSaveEnergy`): no hay forma de derivarla
y el motor de fatiga la consume. `recomputeNutritionDay()` hace **merge**, nunca sobreescritura, o
un recálculo la borraría y convertiría la fatiga en un número inventado.

`alcoholG` es un campo **nuevo** a propósito, en gramos. El `alcohol` que ya existía en las filas
antiguas son **número de copas** que teclaba el usuario; pisarlo convertiría "2 copas" en "21 g"
sin avisar a nadie.

**Un solo escritor.** `app.js` ya no escribe en `nutrition` (0 ocurrencias de `smartPut('nutrition'`);
`tests/verify-nutrition-wiring.mjs` lo verifica). Si vuelve a haber dos escritores, los totales
dejan de venir de las comidas.

### Sync y la regla de la tabla previa

Las dos tablas Supabase se crearon **antes** de añadir los stores a la lista de sync, migración
`nutricion_v2_foods_meals`: mismo patrón `(user_id, record_id)` + `data jsonb` + `updated_at` + RLS
`auth.uid() = user_id`, más un índice `(user_id, updated_at)` porque el pull filtra por ahí.
Es exactamente la regla que dejó escrita el incidente de `plans`/`exercises` de v11.35.

**Tablas Supabase (13):** `bodyweight` · `exercises` · **`foods`** · **`meals`** ·
`mobility_sessions` · `nutrition` · `plans` · `runs` · `sessions` · `settings` · `steps` ·
`wellness` · `workouts`.

### Storage (nuevo — antes no se usaba)

Bucket privado **`meal-photos`**, ruta `<user_id>/<fecha>_<ts>.<ext>`, límite 10 MB, tipos
`image/jpeg|png|webp|heic`. Política RLS: el primer segmento de la ruta tiene que ser el uid del
solicitante. La edge function `parse-meal-photo` firma la URL con la **service role**, que ignora
ese RLS, así que además comprueba en código que `photoPath` empiece por el uid del JWT.

### Stores IndexedDB (v11)
`workouts` · `runs` · `nutrition` · `settings` · `sync_queue` · `bodyweight` · `trash` · `plans` ·
`exercises` · `mobility_sessions` · `weekly_reviews` · `steps` · `wellness` · `sessions` (v10) ·
**`foods`** · **`meals`** (v11).

> Sigue en pie el caveat de rollback: **nunca bajar `DB_VERSION`**. Ahora el suelo es **11**.

## Caveat de rollback (IMPORTANTE)

**Revert de commit ≠ rollback limpio una vez que el browser subió la DB.**

IndexedDB lanza **`VersionError`** si el código intenta abrir la base con una versión **menor** que la
ya almacenada en el dispositivo. Concretamente: si el iPhone ya abrió la app con `DB_VERSION = 10`, la
DB local quedó en v10. Si después se despliega código viejo que llama `indexedDB.open(name, 9)`,
`openDB()` falla en `req.onerror` → **la app no inicializa** (pantalla rota / no carga).

`openDB()` (`app/app.js`) no tiene manejo de downgrade: abre con `DB_VERSION` y rechaza en error.

## Estrategia de rollback seguro

1. **Nunca bajar `DB_VERSION`.** Mantener `DB_VERSION >= 11` en todo rollback futuro, aunque se
   desactive el uso de `sessions` u otros stores nuevos.
2. **Para "apagar" una feature (T1/T2):** dejar de escribir/leer su store y ocultar su UI. El store
   vacío es **inerte** y no rompe nada.
3. **No borrar stores** en un downgrade de código (borrar un store también requiere subir versión).
4. **Regla general hacia adelante:** todo cambio de esquema es **aditivo** y `DB_VERSION` es
   **monótona creciente**. Si una fase se revierte, se revierte su *uso*, no su versión de DB.

## Implicación para fases futuras (T2+)

- T2 escribirá en `sessions` y lo conectará al sync (tabla Supabase genérica
  `sessions(id,user_id,record_id,data jsonb,updated_at, unique(user_id,record_id))` + RLS).
- Cualquier store nuevo posterior: mismo patrón aditivo, bump de `DB_VERSION`, y actualizar este doc.
- Rollback de T2: revertir el commit de T2 **manteniendo `DB_VERSION >= 10`** (o el valor que tenga al
  momento); `sessions` puede quedar con datos o vacío sin romper nada.
