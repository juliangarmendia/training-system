# DB Schema State & Rollback Caveat

Estado vivo del esquema IndexedDB de la PWA y reglas de rollback seguro. Actualizar al cambiar
`DB_VERSION` o agregar/quitar stores. Crítico para no romper la app en dispositivos ya migrados.

## Estado actual (T1, v11.10)

- **DB version actual:** **v10** (`app/app.js` → `const DB_VERSION = 10`).
- **Store nuevo (T1):** `sessions` (keyPath `id`).
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

## Caveat de rollback (IMPORTANTE)

**Revert de commit ≠ rollback limpio una vez que el browser subió la DB.**

IndexedDB lanza **`VersionError`** si el código intenta abrir la base con una versión **menor** que la
ya almacenada en el dispositivo. Concretamente: si el iPhone ya abrió la app con `DB_VERSION = 10`, la
DB local quedó en v10. Si después se despliega código viejo que llama `indexedDB.open(name, 9)`,
`openDB()` falla en `req.onerror` → **la app no inicializa** (pantalla rota / no carga).

`openDB()` (`app/app.js`) no tiene manejo de downgrade: abre con `DB_VERSION` y rechaza en error.

## Estrategia de rollback seguro

1. **Nunca bajar `DB_VERSION`.** Mantener `DB_VERSION >= 10` en todo rollback futuro, aunque se
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
