# T1 Validation Report (iPhone, v11.10)

Validación de T1 (taxonomía + adapter + store `sessions` + DB v10) en la PWA live. Resultado: **PASA —
sin regresión de T1/D1.**

| Item | Esperado | Observado (iPhone) |
|---|---|---|
| Versión cargada | v11.10 | ✅ v11.10 |
| Home / week-strip / activity feed se ven igual | idéntico | ✅ igual |
| Abrir workout/run/mobility viejos | OK | ✅ abre bien |
| Loggear workout/run/mobility | OK | ✅ funciona |
| Offline | OK | ✅ funciona |
| Items de consola (DB v10, sessions vacío, dataAvailability/validateRunDedup, errores) | — | ⬜ pendiente (requiere Safari Web Inspector vía Mac) |

Conclusión: T1 no rompió nada en uso real. Los items de consola quedan pendientes de verificación con
Web Inspector, pero el comportamiento visible y funcional es correcto.

## Known UI issues (pre-existentes, NO introducidos por T1/D1)

Detectados durante la validación; vienen de la migración visual de hace semanas.

### BUG-UI-1 — Cancel (X)/timer del entreno bajo la barra de estado → (X) no clickeable
- **Síntoma:** en la pantalla de entreno activo, la (X) de cancelar queda bajo el reloj y el timer
  bajo la batería; la (X) no es alcanzable. Pasa **desde ambos entry points** (Home y Gym).
- **Workaround del usuario:** abrir la barra vieja de Settings desde Home reserva espacio arriba y baja
  la X lo suficiente para tocarla.
- **Causa raíz:** `#view-workout .view-scroll` (y `#view-mobility-active .view-scroll`) no reservaban
  `--safe-area-inset-top`; la pantalla es inmersiva (el `wo-topbar` es su header) y arrancaba en y=0.
- **Estado:** **ARREGLADO en v11.11** — `padding-top: calc(var(--safe-top) + 8px)` en esos dos
  contenedores (`app/style.css`, sección WORKOUT). Pendiente de confirmar en iPhone.

### BUG-UI-2 — Los 3 íconos del header de Home abren la misma barra vieja de Settings
- **Síntoma:** en Home, la campana de notificaciones, el ícono de Settings y el de "JG" **abren los
  tres la misma barra antigua de Settings** (deberían hacer cosas distintas / o no existir esa barra
  vieja "on top").
- **Estado:** **ABIERTO** — bug distinto del anterior. No tocado en v11.11. A diagnosticar/arreglar
  por separado con OK del usuario (probable markup/handler legacy de header duplicado).
