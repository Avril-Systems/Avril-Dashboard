# AVRIL-SWARMY-S00 — Arquitectura, integración y validación (11–13 noviembre 2026)

**Versión:** v0.1.0 (baseline de trabajo). **Estado:** listo para ejecución supervisada; no significa producto liberado.  
**Fuente de verdad:** este documento en `main`; actualizar mediante PR.  
**Responsable de aceptación:** Gerry. **Fecha límite:** viernes 13 nov 2026, 18:00 CDMX.  
**Trello maestro:** https://trello.com/c/AvCAfjRK  
**Equipos de S00:** Dashboard = **Kevin + Alejandro**; Lab/experimentación = **Iván + Valeria**. Las áreas se rotan en ciclos posteriores; la documentación debe permitir el relevo.

## 1. Intención y alcance
Esta semana construiremos un **primer ciclo funcional, autónomo y observable**: un coordinador entrega trabajo acotado a harnesses (OpenClaw, Hermes; DeepSeek Harness puede ser herramienta de desarrollo/prueba), los agentes dejan mensajes y artefactos en un workspace compartido autorizado, y Avril Dashboard permite ver estados, tareas, handoffs, errores y resultados. En paralelo, QA de Avril Lab mide fricción, capacidad y fallos antes de exposición comercial.

**NO** consiste en mantener cuatro runtimes adicionales solo porque hay cuatro alumnos; tampoco es rehacer Convex, Lab ni lanzar un daemon por prospecto. El número de procesos se decide por arquitectura y mediciones, no por cantidad de personas. Los cuatro estudiantes tienen acceso a 1 OpenClaw + 1 Hermes cada uno como herramientas de trabajo/prueba, **no** es obligación activarlos todos ni a la vez.

**Criterio mínimo para el viernes:** una ejecución real y trazable de 2 agentes/harnesses conectados por un orquestador delgado, 1 workspace de prueba, 1 handoff con artefacto, 2 ciclos automáticos limitados, pausa manual efectiva, Dashboard mostrando información persistida tras refrescar, y matriz de pruebas de Lab con defectos priorizados. Si algo es mock, etiquetarlo visiblemente como mock y reportarlo como no logrado.

## 2. Arquitectura acordada y límites

```text
                      AVRIL DASHBOARD (Next.js)
             workspaces | tareas | agentes | timeline
                  controles | aprobaciones | errores
                                |
                       Convex control plane
            tenant/workspace/run/job/event/artifact refs
                                ^
                         ingress autenticado
                                |
                   SWARMY ENGINE (VPS staging)
                  scheduler + queue + supervisor
                idempotencia + límites + kill switch
                      /                   \
               OpenClaw adapter       Hermes adapter
                      \                   /
                workspace-scoped artifacts
              (no compartir $HOME ni credenciales)
                                
         AVRIL LAB (producto aparte: launchers/seats)
         QA y smoke sin afectar clientes ni producción
```

- Dashboard **controla y observa**; no lanza comandos SSH desde el navegador. Se reaprovechan UI Agent Office, modelos/eventos Convex y bridge existente cuando resulten útiles. El Engine **ejecuta** con un coordinador/scheduler ligero en entorno aislado; su ubicación y supervisor final se justifican en el runbook.
- Datos de ejecución: Convex como fuente de estados/auditoría del Dashboard cuando sea viable; artefactos grandes en almacenamiento aislado con referencias y checksums, no secretos ni archivos de clientes en eventos. Si hace falta cola local durable, documentar relación con Convex y estrategia de reconciliación.
- El orquestador no es necesariamente Hermes: separar rol de coordinador y adaptador de harness. No dar por implementado un gateway Hermes/DeepSeek sin probarlo.
- Contrato de handoff `tenantId/workspaceId/runId/taskId/agentId/eventId/idempotencyKey/type/status/timestamp/artifactRef`; autorización por organización, verificación servidor-servidor y mensajes restringidos al workspace. Ejemplo de flujo:
  1. `run.started` → `task.created`;
  2. OpenClaw genera `brief.json` sintético;
  3. coordinador registra `message.sent` y `handoff.created`;
  4. Hermes consume ese artefacto, produce `review.md`, confirma `handoff.acknowledged`;
  5. orquestador registra `task.completed` y métricas;
  6. segundo tick autónomo con fixture nuevo y deduplicación verificada.
- Controles: timeout, retry/backoff, concurrencia, coste/ciclos por run, heartbeat, parada, recuperación de estado, errores visibles y aprobación humana para toda acción externa. SIN envíos a clientes, pagos, publicaciones, compras de VPS ni acciones sobre producción durante S00.
- **Persistencia por tenant**: nunca compartir llaves/model credentials, historial privado o rutas de agente entre organizaciones. Workspaces compartidos son colaboración lógica autorizada, no un volumen Docker abierto para todos.

## 3. Estado de partida y decisiones de Git (revisión 11 nov)
- `Avril-Dashboard` tiene `main`, `yari-int011-014` y `backup/main-before-yari-int011-014`. El PR #1 desde `yari-int011-014` ya está fusionado en `main`; **no** volverlo a fusionar. Conservar `backup/...` como histórico hasta auditoría posterior.
- El PR #2 `feat/prepare-integration-from-main`, originado en fork `Edwin-Benito/Avril-Dashboard-new`, sigue **abierto, no mergeable y conflictivo**. Decisión S00: **no integrar ni rescatar a ciegas**. Cerrar administrativamente como `not planned` con comentario explicativo; no eliminar commits ni el fork ajeno. Solo reimplementar un cambio concreto si un issue y prueba nueva lo justifican.
- `Lab-Avril-Life` tiene `main` y `feat/rent-agent`; **su default actual es `feat/rent-agent`**, no asumir que `main` contiene las últimas correcciones comerciales. Sin rebase/merge a `main` de Lab esta semana.
- Rama de integración propuesta Dashboard: `feat/swarmy-s00`, creada desde `main` después de publicar este SDD; trabajo de cada autor en `feat/swarmy-s00-kevin` y `feat/swarmy-s00-alejandro` (cada una desde `feat/swarmy-s00`). Los PRs personales apuntan a `feat/swarmy-s00`, luego PR de integración a `main` con revisión humana. Solo Dashboard codifica allí. Iván/Valeria NO crean ramas de Dashboard por QA.
- En Lab, Iván/Valeria **no tocan código productivo por defecto**: entregan reportes en Trello y fixtures aislados. Si hay bugfix autorizado en Lab, crear `fix/swarmy-s00-ivan-<issue>` o `fix/swarmy-s00-valeria-<issue>` **desde la base real `feat/rent-agent`**, PR a esa misma base, review y sin despliegue automático.

### Protocolo Git obligatorio para estudiantes
**Una tarea = una rama = un PR = un propietario**, incluso si se usa DeepSeek Harness como copiloto. Nadie trabaja en la rama del compañero ni empuja directamente a `main` o `feat/swarmy-s00`. Cambios pequeños, preferentemente un módulo/contrato por persona; si ambos necesitan el mismo archivo, primero pactan interfaces, y el segundo espera a que el primer PR se integre y sincroniza.

**Preparación (Kevin/Alejandro, con rama de integración ya creada por líder):**
```bash
git clone git@github.com:Avril-Systems/Avril-Dashboard.git
cd Avril-Dashboard
git fetch origin --prune
git switch feat/swarmy-s00
git pull --ff-only origin feat/swarmy-s00
git switch -c feat/swarmy-s00-<tu-nombre>
```
**Ciclo diario** (sin asumir que un agente hará Git de forma segura):
```bash
git status
git diff --check
git add <solo-archivos-de-tu-tarea>
git commit -m "feat(swarmy): describe cambio concreto"
git push -u origin feat/swarmy-s00-<tu-nombre>
# Abrir PR: tu rama -> feat/swarmy-s00; asignar review al compañero
```
**Cuando entra otro PR en integración**: cerrar o aparcar cambios locales (`git status` debe estar limpio), `git fetch origin`, integrar la nueva base en tu rama con `git merge origin/feat/swarmy-s00` y resolver conflictos conscientemente; volver a correr checks y subir commit de merge normal. Si no sabes resolver conflicto, **detente**, comparte diff y pide revisión; no usar `push --force`, `reset --hard` ni `git checkout --theirs .` como atajos. Nunca commitear `.env`, tokens, claves SSH, credenciales o capturas de secretos.

**Mensajes Conventional Commits:** `feat(dashboard): ...`, `fix(orchestrator): ...`, `test(lab): ...`, `docs(swarmy): ...`, `chore(git): ...`. Un commit = cambio coherente, no `final2` ni `update`. PR incluye motivo, archivos, cómo probar, resultados, riesgos, vínculo a Trello, captura/log sanitizado y rollback. Revisar `npm run typecheck`, tests relevantes y `npm run build` donde aplique. Etiqueta de versión `v0.1.0-s00` **solo tras aceptación del owner y merge**; commits y PRs identifican iteraciones antes de ello. No crear tags ni releases por tarea.

**Prohibiciones:** no force-push, no cherry-pick masivo del PR #2, no merge automáticos entre repos, no editar historia ajena, no borrar ramas de respaldo hasta revisión. Habilitar branch protection (PR + 1 review + checks + no direct push) cuando el owner tenga controles disponibles. Si faltan permisos de GitHub para un estudiante, un operador crea rama y el estudiante usa fork/PR; no compartir tokens.

## 4. Equipo Kevin + Alejandro — Dashboard (código, integración y observabilidad)
**Kevin — control panel y estados:** revisar vistas existentes de Agent Office, establecer la pantalla `workspace → run → tareas/agentes`; mostrar estados reales `queued/running/blocked/completed/failed/stopped`, errores y botón de stop/pause mediante API autenticada; fixtures claramente marcados. Cambios en PR propio.

**Alejandro — trazas y contratos:** mapear modelo Convex actual, bridge y esquema de eventos; implementar ingest autenticado, timeline de handoffs y referencias a artefactos. Verificar que refresh no pierde historia y un `eventId` repetido no duplica una ejecución; test de autorización entre dos tenants sintéticos. PR propio. Coordinar tipos con Kevin **antes de editar schema/API compartidos**.

**Revisión entre pares:** Kevin revisa PR Alejandro y viceversa. Ninguno integra su PR sin feedback del otro. Entregar capturas, dos runs con runIds, README corto de ejecución, contratos/eventos y errores conocidos. Si la ejecución VPS aún no está autorizada, el Dashboard muestra estado real desde un worker local aislado y etiqueta el impedimento de VPS.

## 5. Equipo Iván + Valeria — Lab QA / autonomía experimental
**Iván — flujo/harness:** sobre Lab `feat/rent-agent`, reproducir happy path OpenClaw y Hermes en entorno autorizado de prueba; usar DeepSeek Harness local como asistente de código/QA y NVIDIA Nemotron como opción cuando sus credenciales de inferencia autorizadas lo permitan. Probar un flujo corto de colaboración end-to-end con el coordinador; entregar inputs/outputs sintéticos, fallos y pasos de reproducción. No convertir seats de venta en daemons persistentes.

**Valeria — QA, stress progresivo y fricción:** recorrido de usuario Lab, wizard, estados ready/error, claves, reintentos y caducidad; carga incremental `1 → 2 → 4` **solo si la capacidad disponible y el entorno aislado lo permiten**. Medir RAM/CPU/latencia/costo y errores, sin asumir que 4 instancias caben en el VPS. Simular caída del proveedor, 429, timeout, duplicados, reinicio, aislamiento y `kill switch`. Registrar defectos `P0` seguridad/pago/datos; `P1` flujo roto; `P2` UX/cosmética, con evidencia y reproducción.

**Entregables:** `AVRIL-SWARMY-S00-QA.md`, tabla de 8–12 casos, capturas/redacted logs, al menos 3 bugs o mejoras bien sustentados **si existen** (no inventarlos), sugerencia go/no-go y revisión cruzada del demo Dashboard. Reportar si una prueba no se pudo realizar. No tocar Stripe Live, Caddy, puertos, compras Contabo, contenedores comerciales o los datos reales.

## 6. Entorno, seguridad, uso de DeepSeek
- Control estricto de permisos: no SSH ni sudo dentro de agentes, no secretos en prompts, repos, logs o chat; las llaves NVIDIA/alternativas viven en el entorno seguro de cada alumno y se rotan por configuración sin copiar entre personas.
- Para coordinar worker en VPS se necesita **aprobación del operador**: staging aislado, volúmenes dedicados, healthcheck, reinicio, logs, límites CPU/RAM, presupuesto y `kill switch` verificable. No repetir clon `LaunchEnterprise` que provocó colisiones de puertos y referencias prohibidas.
- La máquina `vps-avril01` fue auditada en el backlog como host mixto de **8 GB**, no asumir 24 GB ni disponibilidad para 8 nuevos agentes. Hacer preflight y documentar cuál VPS está realmente asignado antes de cualquier prueba de carga.
- DeepSeek Harness es herramienta complementaria local; NO prometer adaptador de ejecución nativo sin validarlo. Si un proveedor sufre rate limit, registrar fallo y usar un fallback permitido/configurado, no automatizar abuso o evasión de límites.

## 7. Plan miércoles-viernes y gates

| Momento CDMX | Kevin/Alejandro | Iván/Valeria |
|---|---|---|
| Mié 11 13:00 | Leer SDD, acordar interfaces y owner por archivo, crear ramas, primer evento en UI | Inventario real Lab/harness, preflight permisos/recursos, plan de QA |
| Jue 12 mediodía | 1 run completo, timeline, auth e idempotencia; PRs pequeños | Smoke OpenClaw/Hermes, fallos provocados, prueba gradual condicionada |
| Jue 12 17:00 | Revisar hallazgos Lab y ajustar P0 | Reproducir demo y revisar PR/flujo |
| Vie 13 16:00 | Congelar código, runbook y captura demo | Repetir defectos críticos y consolidar matriz |
| Vie 13 18:00 | Demostración + PRs para revisión final | Reporte, bugs priorizados, go/no-go |

**DoD / GO interno:** escenario de dos harnesses comprobado con eventos reales; stop, autorización e idempotencia probados; dos ticks sin intervención; persistencia tras refresco; QA Lab reproducible; cero incidentes sobre producción; y documentación suficiente para rotación de equipos. Si el VPS o un adaptador no está listo, entrega parcial honesta con blockers y plan siguiente, no considerar completado.

**No se exige esta semana:** autonomía comercial 24/7 en producción, 4 agentes simultáneos, outreach automático, contratos de clientes ni facturación real. `DRY_RUN` no autoriza permanencia indefinida.

## 8. Documentación que sobrevive a la rotación
Conservar en `docs/Specs/`: este SDD, `AVRIL-SWARMY-S00-CONTRACTS.md` (esquemas definitivos y decisiones), `AVRIL-SWARMY-S00-RUNBOOK.md` (setup, start, stop, recuperación, rollback), `AVRIL-SWARMY-S00-TEST-REPORT.md` (escenarios y evidencias). Puede entregarse una sola pieza combinada si los encabezados permiten ubicarlo todo. Trello gestiona responsables/fechas; GitHub gestiona fuente/versionado, no duplicar el texto canónico en cada tarjeta.

**Cambio de alcance:** cualquier modificación a la arquitectura, permisos, branches, VPS o producción se propone en PR al SDD y requiere validación de Gerry. Las tarjetas de ciclos anteriores que prohibían tocar repos/VPS quedan reemplazadas **solo para el desarrollo en ramas y QA aislada explícitamente autorizados aquí**; operaciones productivas siguen reservadas al operador.

**Referencias:** README/ARCHITECTURE/BRIDGE_CONTRACT y Convex de Avril-Dashboard; C2 SDD y e2e Lab; PR #1 fusionado; PR #2 conflictivo; Trello S00, EGE-02/03 y C3 QA.
