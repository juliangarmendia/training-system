# Data Foundation Plan — desbloquear datos antes del motor

Plan para **desbloquear los datos que faltan** para que Readiness Engine y Hard-Day Budget no se
basen en supuestos. **Esto es un plan, no implementación.** Se deriva de
[`data-sources-audit.md`](./data-sources-audit.md). No tocar código hasta aprobación.

Principio rector: **el motor no debe inventar datos.** Si un dato no se extrae hoy, la regla que
depende de él queda en advisory o bloqueada, nunca automatizada con un proxy falso.

---

## 1. Decoupling / HR drift / pace-to-HR

- **Qué falta hoy:** el app solo extrae `distance, duration, avgHR, maxHR, name` de las actividades
  (`app/app.js` ~4284-4310 y `strava-sync`). No extrae intensidad, zonas ni decoupling.
- **Buena noticia:** **intervals.icu ya computa estos campos** y los devuelve en el endpoint de
  activities (`/api/v1/athlete/{id}/activities`). Campos candidatos a parsear (verificar nombres en
  la respuesta real): `decoupling`, `icu_efficiency`, `pace`/`gap` (grade-adjusted pace),
  `icu_intensity`, `average_speed`. → **No requiere cálculo propio ni nueva API: es parsear campos
  que ya llegan.**
- **Si intervals no trae `decoupling`:** es calculable de los streams (primera mitad vs segunda mitad
  de pace:HR), pero requiere el stream endpoint — más caro. Preferir el campo pre-computado.
- **Desbloquea:** END-005 (medir mejora de Z2 por decoupling y pace-a-HR), parcialmente END-001
  (verificar distribución).
- **Caveat de evidencia:** decoupling como métrica es **metodología de práctica** (Friel), no
  fuertemente validada → la regla END-005 se mantiene `moderate`/advisory, no se automatiza una
  decisión dura sobre ella. Calor de Madrid infla HR/decoupling → anotar condiciones.

## 2. HR zones / intensity distribution

- **Cómo obtener zonas:** intervals.icu mantiene zonas de HR del atleta y devuelve `icu_zone_times`
  (tiempo en cada zona) por actividad. Parsear ese array da la distribución de intensidad real.
- **Riesgo de zonas mal seteadas:** si LTHR/zonas en intervals están mal calibradas, toda la
  distribución se corrompe. **Mitigación:** (a) anclar zonas a un test de campo o LTHR reciente, no a
  fórmulas de edad; (b) mostrar la zona como banda, no como número exacto; (c) cross-check con RPE —
  si zona dice "fácil" pero RPE alto, marcar conflicto (READ-005).
- **Uso:** Cardio Engine (verificar 80/20 semanal, END-001) y Hard-Day Budget (clasificar
  threshold/interval automáticamente en vez de pedirlo manual).
- **Desbloquea:** clasificación fina de sesiones de cardio para el budget; END-001 verificable.

## 3. Coros / Strava / Intervals dedup

- **Problema (confirmado en auditoría):** la misma carrera de Coros entra por Strava (`strava_{id}`)
  y por intervals (`icu_{id}`) con IDs distintos → **doble conteo de volumen de running**. El dedup
  actual es por `source_id`, que no colisiona entre fuentes.
- **Regla de dedup propuesta:** dos actividades son la misma si `|fecha/hora inicio| < 10 min` **y**
  `|distancia| < 0.3 km` **y** tipo = Run. Colapsar a un registro.
- **Fuente canónica:** **intervals.icu** para carreras (trae más campos: zonas, decoupling). Strava
  como fallback solo si intervals no tiene la actividad. Whoop para recovery/sueño. Una sola fuente
  de steps (intervals companion; Shortcut solo si falta).
- **Desbloquea:** volumen de running fiable (END-003), carga semanal correcta para el budget.

## 4. Subjective check-in (lo que más falta)

- **Hoy NO se capturan:** soreness, pain/dolor articular, readiness subjetiva pre-sesión, RIR.
  (energy/hunger sí, en el tab de nutrición.)
- **Campos mínimos propuestos** (1 tap cada uno, 1-5 salvo nota):
  - **Obligatorios (diarios o pre-sesión):** `subjective_readiness` (1-5), `soreness` (1-5),
    `energy` (1-5, ya existe).
  - **Condicionales:** `pain` (0=no / localización+1-5 si hay) — solo si el usuario marca que hay.
  - **Opcionales:** `motivation` (1-5), `RIR` por set (solo si el usuario quiere; el sistema ya tiene
    RPE — RIR es redundante salvo que se prefiera).
- **Cómo evitar que sea pesado:** un solo widget de 3 toques al abrir la app o al iniciar sesión;
  defaults razonables; nunca bloquea el flujo; si no se llena, degrada con gracia (usa wearable +
  rendimiento).
- **Desbloquea:** READ-002/005 (confirmación multi-señal con subjetivo), READ-007 (día rojo),
  modificadores de carga por soreness/pain, LOAD-003 (dolor lumbar).

## 5. Bodyweight / body composition

- **Forward-fills:** Apple Health rellena días sin pesaje; el app los marca `measured:false`. **Regla:
  ignorar forward-fills para tendencia**; usar solo `measured:true`.
- **Media 7d:** usar siempre media móvil 7d para rate-of-loss (REC-002), nunca el valor diario
  (hidratación/sodio/glucógeno lo mueven ±1-2 kg).
- **Body fat (Wyze):** **solo tendencia**, nunca valor absoluto para decisiones; ruido alto.
- **Weigh-in manual = fuente más fiable.** Recomendar 4-7 pesajes/semana en ayunas (ya señalado en
  weekly reviews). El manual sobrescribe el forward-fill.
- **Desbloquea:** rate-of-loss fiable → REC-002 (dial de déficit gobernado por tendencia real).

## 6. Hard-Day Budget v1 — qué se puede hoy

- **Calculable hoy:** clasificación gruesa — gym (upper/lower de exerciseIds+movementPattern), run
  (km + duración), RPE como proxy de intensidad, flag pierna pesada (lower+compound+RPE alto), CTL/ATL
  de contexto. Sumar pesos (BUD-002) y avisar si excede el cap (BUD-001).
- **Coarse classification (aceptable v1):** "duro" vs "fácil" por RPE/duración/tipo, sin distinguir
  threshold vs interval automáticamente.
- **Requiere metadata futura:** clasificación automática threshold/interval (necesita zonas, §2),
  flag híbrido (necesita un tipo de sesión híbrida en el log), modificadores de soreness (§4).
- **No automatizar todavía:** decisiones de deload basadas en el budget — solo **advisory** ("vas en
  6.5/6 esta semana, considera mover el interval"), el usuario confirma.

## 7. Readiness Engine v1 — clasificación de inputs

- **Ya listos (usable_now):** sleep duration + score, RHR (tendencia), recovery flag, CTL/ATL,
  sesiones completadas + tipo, RPE medio, hard sessions/semana.
- **Derivados (usable_if_derived):** HRV rolling 7d (de la serie diaria), TSB = CTL−ATL, hard-day
  points, rate-of-loss (de peso measured + media 7d).
- **Ruidosos (solo señal, no dosis):** HRV día único, recovery score como número, body fat diario,
  peso diario.
- **Fuera de v1 (bloqueados por dato):** decoupling/pace-to-HR (§1), distribución de zonas (§2),
  soreness/pain/readiness subjetiva (§4, hasta capturarlos).

---

## Secuencia de desbloqueo recomendada (orden de menor esfuerzo / mayor valor)

1. **Parsear campos que YA llegan de intervals** (decoupling, zonas, intensidad) — esfuerzo bajo,
   desbloquea END-005, distribución y clasificación fina del budget. (§1, §2)
2. **Dedup de carreras** por fecha+distancia, intervals canónico — esfuerzo bajo, arregla volumen. (§3)
3. **Subjective check-in mínimo** (3 campos) — esfuerzo medio, desbloquea readiness fino + modificadores. (§4)
4. **Disciplina de pesaje manual** — esfuerzo cero de código, mejora rate-of-loss. (§5)

Tras §1-§4, Readiness Engine y Hard-Day Budget pasan de "coarse + advisory" a "fino + parcialmente
automatizable", sin supuestos. **Ninguno requiere tocar el generador.**
