# Swarmy S01 — Extensions & Integrations

## Objetivo
Ampliar el Agent Office existente para que cada agente pueda utilizar herramientas externas reales. Reutilizar el trabajo W46 de Iván y Valeria y los adaptadores, runs y persistencia de S00. No sustituir el runtime ni iniciar otro dashboard.

## Entrega inicial — miércoles 2 de diciembre de 2026
Desde un nodo del Agent Office, seleccionar una extensión, habilitarla para el agente, invocarla mediante el chat, consultar el resultado real en Runs y deshabilitarla. Mostrar el origen del arnés y enlace al código cuando esté disponible.

## Contrato mínimo propuesto
- Registro de extensión: id, nombre, tipo (MCP/API/tool/skill), configuración no secreta, herramientas disponibles y permisos.
- Asignación por tenant/workspace/agente: extensionId, enabled, referencia de credencial opcional.
- Ejecución: tool id, argumentos validados, contexto autorizado del agente y runId; resultado o error real asociado al run. Reutilizar la cola/worker y contratos de S00 donde corresponda.
- MCP: descubrimiento tools/list e invocación tools/call mediante cliente común. API directa cuando resulte más sencilla. Skills aportan instrucciones, no permisos adicionales.
- Secretos solo del lado servidor, alcance mínimo, lectura por defecto y aprobación humana para escrituras externas. No guardar secretos en Git, chat, logs o configuración pública. No instalar código arbitrario desde el navegador.

## Distribución
- Kevin (feat/s01-dashboard): detalle de nodo, Extensions y Runs.
- Alejandro (feat/s01-backend): registro, asignación, puente de ejecución y resultado observable; acordar contrato con el equipo el lunes.
- Iván (feat/s01-tools): reutilizar Fetch y Filesystem (sandbox acotado); GitHub de solo lectura como siguiente integración.
- Valeria (feat/s01-mcp): reutilizar You.com Free; Google Calendar de solo lectura como siguiente integración autenticada.
- Joanna: revisar aislamiento y credenciales con base en W46; concluir documentación pendiente de auto-buy con apoyo del operador, sin sudo ni cambios productivos.

Para el miércoles, priorizar una integración real de Iván y una de Valeria en el flujo común; GitHub/Calendar pueden quedar como siguiente paso si la autorización externa bloquea. No repetir catálogos ni baterías de QA completas.

## Roadmap comercial
GitHub, Trello, Google (Drive/Gmail/Calendar), X, LinkedIn, Meta (WhatsApp/Instagram/Facebook), Venice AI. No se exige implementar todo en S01. Las capacidades de publicación y envío requieren autorización explícita.

## Trabajo y aceptación
Ramas individuales desde feat/swarmy-s01; PRs hacia esa rama, README breve y demo funcional. Avances lunes 30 de noviembre. Desarrollo aislado, sin credenciales productivas ni cambios en launchers, producción o main. Integración a main únicamente tras revisión y aprobación del responsable. Mantener compatibilidad con S00. Los hallazgos W46 son históricos y deben verificarse antes de asumir que siguen vigentes.
