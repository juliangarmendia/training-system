# Tests

Node puro, sin dependencias, sin framework. **Se ejecutan desde la raíz del repo**, porque
todos leen `app/*.js` por ruta relativa:

```bash
node tests/verify-bloodwork.mjs
node tests/verify-analytics-render.mjs
```

Cero salida y código 0 = verde. Cualquier `FAIL` imprime qué aserción cayó.

## Qué cubre cada uno

| Test | Qué garantiza |
|---|---|
| `verify-bloodwork.mjs` | Que `app/bloodwork.js` y `data/processed/2026-08-20_analitica-puntuada.md` **digan lo mismo**: compara fila a fila valor, fecha y puntaje de la tabla maestra contra lo que produce el código. Más los invariantes de la rúbrica: intervalos anidados, Regla A (ningún 5 sin objetivo publicado), y que todo marcador sin puntaje tenga el motivo escrito |
| `verify-workout-unit.mjs` | Que la unidad de un registro tenga **una sola fuente** (`loggedUnit`): que la ficha de edición y "Copy for WHOOP" no puedan discrepar —el 24-ago-2026 el mismo entrenamiento se veía en kg y se copiaba en lb—, que el transcript etiquete sin convertir nunca, que guardar no reetiquete pesos en lb como kg, y que la calculadora de discos no escriba el ajuste global de unidad |
| `verify-analytics-render.mjs` | Que la vista `view-analytics` renderice de verdad: extrae las funciones de render de `app.js`, las corre con un DOM mínimo y revisa el HTML — nada `undefined`/`NaN`, los avisos de `LONG-003` presentes, los 33 marcadores pintados (incluidos los que no se puntúan), puntaje y antigüedad como elementos separados, y **cero dosis de vitamina D** |

## Por qué existen

Los dos encontraron defectos que leer el código no encontró:

- El de `bloodwork` reveló que **dos filas del documento no cumplían mi propia rúbrica** (TSH
  puntuada 3 con un "óptimo <2,5" que no sale de ninguna guía vigente; urea puntuada 4 estando
  *fuera* del intervalo de referencia). Se corrigió el documento, no el test.
- El de render habría dejado pasar un `undefined` en la vista, que `node --check` no ve.

La regla que se sigue aquí: **cuando el test y el código discrepan, primero se averigua cuál de
los dos está mal.** Un test que se ajusta para que pase no sirve de nada.

## Nota

Hay más verificaciones de sesiones anteriores (`verify-ath003`, `verify-cardio-import`,
`verify-icu-dsl`, `verify-scoring`) que se escribieron en el scratchpad y **nunca se versionaron**,
así que no sobrevivieron. Los nuevos van aquí por eso.
