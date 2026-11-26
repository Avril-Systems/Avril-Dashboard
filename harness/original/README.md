# Arneses originales (código de los estudiantes)

Este directorio conserva el código original de los cuatro arneses, vendorizado
para que el worker del Dashboard los ejecute **sin reimplementarlos**. No son
código de producción: son prototipos acotados de los estudiantes.

| Arnés | Repo original | Autor | Commit integrado |
|---|---|---|---|
| Prospección | https://github.com/alevarlaz65-afk/agente-de-proespectos-prototipo-corregido | Alejandro Vargas | `966fd63` |
| B2B | https://github.com/valrami-hue/arnes-b2b-avril | Valeria Ramírez | `8854d61` |
| Soporte | https://github.com/Kevin-vk1614/avril-support-harness | Kevin (Sakunahaz-hue) | `c6843c8` |
| Marketing | https://github.com/ivancontreras-m/Asistente | Iván Contreras | `6805fcc` |

Cada subcarpeta tiene un `SOURCE.md` con el detalle y los archivos excluidos
(videos, bases de datos locales, `.env`, salidas generadas, `__pycache__`).

## Cómo los ejecuta el Dashboard

`script/harness-original-adapters.mjs` invoca cada arnés como subproceso en un
directorio temporal y normaliza su salida a `{ summary, items, ... }` para
guardarla en `harnessActivities` y mostrarla en `/agents/swarmy`.

- **Prospección:** `python prototipo.py` (stdlib, GitHub API).
- **B2B:** `python run.py` (modo reglas por defecto; modo modelo opcional).
- **Soporte:** `node src/cli.js -` con un `SupportTicketRecord`.
- **Marketing:** `python agente.py --marketing briefing.json` (NVIDIA NIM).

El worker no guarda secretos ni salidas efímeras en el repo. Los artefactos que
produce cada arnés se leen y se incluyen en el resultado de la actividad; la
carpeta temporal se elimina al terminar.
