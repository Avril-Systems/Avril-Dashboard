# Contratos de integración: creación, pago y deploy de empresas

## Propósito

Este documento es la fuente de verdad para integrar:

- el RAG que genera oportunidades curadas;
- Stripe, con un pago independiente por cada empresa desplegada;
- la API que crea una instancia dockerizada de OpenClaw en otro VPS;
- Agent Office, que muestra la sesión de ejecución creada.

La experiencia tiene **dos entradas de producto**, pero **tres caminos técnicos**:

1. `Build from my idea` mediante formulario.
2. `Build from my idea` mediante chat con IA.
3. `Generate opportunities` mediante tres oportunidades curadas.

Los tres caminos deben converger en el mismo pipeline:

```text
captura o selección
  → borrador de empresa
  → intención de deploy
  → checkout individual
  → pago confirmado
  → spawn de OpenClaw
  → Agent Office con ?sessionId=
```

## Regla de negocio no negociable

**Cada empresa desplegada requiere un pago nuevo y exclusivo.**

- Crear Empresa A y pagar no autoriza desplegar Empresa B.
- Volver al Home y crear otra empresa debe abrir un checkout nuevo.
- El pago pertenece a una intención de deploy concreta, no a toda la sesión del navegador.
- Un mismo usuario puede usar los tres caminos y pagar una vez por cada empresa desplegada.
- Reintentar técnicamente el mismo deploy después de un fallo no debe cobrar de nuevo.

Por lo tanto, `session.plan` y `luckIdeaId` no deben considerarse comprobantes reutilizables de pago.

## Identificadores y responsabilidades

No se debe usar un solo ID para representar conceptos distintos.

- `founderIdeaId`: datos capturados o idea elegida por el usuario.
- `chatId`: conversación del intake por IA y su historial.
- `deploymentIntentId` (pendiente de implementar): intento comercial único de desplegar una empresa.
- `stripeCheckoutSessionId` / `stripePaymentIntentId`: evidencia externa del pago.
- `orchestrationSessionId`: sesión operativa creada para Agent Office.
- `vpsRef` / `containerRef`: recursos creados por la API de deploy.

Relación objetivo:

```text
founderIdeaId o chatId
  → deploymentIntentId
  → pago confirmado
  → orchestrationSessionId
  → vpsRef + containerRef
```

La cookie de autenticación puede identificar al usuario y ayudar a reanudar UX, pero no debe ser la fuente de verdad de propiedad ni de pago.

---

## Camino 1: Build from my idea — Form intake

### Estado actual

Ruta:

```text
/start/idea → Form
```

Archivos principales:

- `components/founder/FounderWizard.tsx`
- `components/flows/idea/idea-build-page.tsx`
- `components/flows/luck/deploy-gate.tsx`
- `components/flows/luck/payment-module.tsx`
- `app/api/founder/luck-intake/route.ts`
- `app/api/billing/checkout/route.ts`
- `app/api/orchestration/spawn-from-opportunity/route.ts`

Secuencia actual:

1. El formulario captura nombre, idea, problema, cliente y restricciones.
2. `buildOpportunityFromWizard` convierte las respuestas al tipo interno `Opportunity`.
3. `luck-intake` persiste un `founderIdeas`.
4. `DeployGate` presenta checkout mock o Stripe.
5. `spawn-from-opportunity` crea chat, ignition draft y sesión de orquestación.
6. El frontend navega a `/agents/office?sessionId=...`.

### Estado objetivo

La secuencia se mantiene, pero el checkout debe crear o usar un `deploymentIntentId` nuevo para esa empresa. El endpoint de spawn debe rechazar solicitudes sin una intención pagada y no consumida.

---

## Camino 2: Build from my idea — AI chat intake

### Estado actual

Ruta:

```text
/start/idea → Chat
```

Archivos principales:

- `components/ui/animated-ai-chat.tsx`
- `app/api/chat/respond/route.ts`
- `app/api/chat/ignition-draft/route.ts`
- `app/api/orchestration/handoff-openclaw/route.ts`
- `src/lib/runOpenClawSpawn.ts`

Secuencia actual:

1. El chat captura información estructurada progresivamente.
2. Se persisten mensajes y un `chatIgnitionDraft`.
3. Al alcanzar `handoff_ready`, el draft queda `ready`.
4. El botón de handoff llama directamente a `handoff-openclaw`.
5. `handoff-openclaw` llama a `runOpenClawSpawn`.
6. El frontend navega a `/agents/office?sessionId=...`.

### Gap crítico

**Actualmente este camino no pasa por Stripe antes del spawn.**

### Estado objetivo

Cuando el draft esté `ready`:

1. Crear `deploymentIntentId` con `source = "ai_chat"` y `chatId`.
2. Mostrar el mismo módulo de checkout usado por los otros caminos.
3. Confirmar el pago por webhook de Stripe.
4. Habilitar “Deploy” solamente cuando la intención esté pagada.
5. Enviar `deploymentIntentId` a `handoff-openclaw`.
6. Validar y consumir la intención antes de llamar a `runOpenClawSpawn`.

El estado `ready` significa “la empresa está lista para cotizar/pagar”, no “autorizada para desplegar”.

---

## Camino 3: Generate opportunities

### Estado actual

Ruta:

```text
/get-started
```

Archivos principales:

- `components/flows/luck/luck-page.tsx`
- `components/flows/luck/mock-data.ts`
- `components/flows/luck/types.ts`
- `components/flows/luck/deploy-gate.tsx`
- `app/api/founder/luck-intake/route.ts`
- `app/api/orchestration/spawn-from-opportunity/route.ts`

Secuencia actual:

1. `getMockOpportunities` entrega tres oportunidades estáticas.
2. El usuario elige una y revisa su blueprint.
3. La oportunidad elegida se persiste como `founderIdeas`.
4. El usuario pasa por checkout.
5. Se llama a `spawn-from-opportunity`.
6. El frontend navega a `/agents/office?sessionId=...`.

### Punto de integración del RAG

El RAG reemplaza únicamente la fuente estática:

```text
getMockOpportunities(language)
```

No debe controlar Stripe, crear sesiones de Agent Office ni llamar directamente al VPS.

### Contrato de salida del RAG

El Dashboard necesita exactamente tres objetos compatibles con `Opportunity`, definido en:

```text
components/flows/luck/types.ts
```

Ejemplo:

```json
{
  "opportunities": [
    {
      "id": "rag-stable-id",
      "name": "Nombre de empresa",
      "type": "Categoría",
      "idealClient": "ICP",
      "problem": "Problema validado",
      "offer": "Oferta",
      "agents": ["Scout", "Operator"],
      "monetizationSpeed": "2–4 semanas",
      "difficulty": "medium",
      "score": 87,
      "blueprint": {
        "summary": "Resumen",
        "offer": "Oferta detallada",
        "idealCustomer": "Cliente ideal",
        "steps": ["Paso 1", "Paso 2"],
        "agents": ["Scout", "Operator"],
        "risks": ["Riesgo 1"],
        "deployCost": "$999 setup + $199/mes"
      }
    }
  ],
  "generationId": "rag-generation-id",
  "generatedAt": "ISO-8601"
}
```

Requisitos:

- devolver exactamente tres opciones válidas;
- IDs estables dentro de la generación;
- salida JSON validable;
- incluir procedencia/versionado del pipeline RAG para auditoría;
- no incluir secretos ni instrucciones internas en la respuesta al navegador.

Se recomienda implementar un adapter del Dashboard:

```text
POST /api/opportunities/generate
```

Ese adapter autentica, llama al RAG, valida la respuesta y devuelve el contrato de UI.

---

## Pipeline de pago unificado

### Problema actual

El estado de pago se guarda parcialmente en la cookie (`session.plan`, `luckIdeaId`). Esto permite que un pago anterior afecte una empresa nueva y no modela adecuadamente:

- varios deploys del mismo usuario;
- tres caminos de intake;
- webhooks y conciliación;
- reintentos sin doble cobro;
- propiedad y auditoría.

Además, en el modo Stripe actual:

- `/api/billing/checkout` escribe `session.plan` al crear la sesión de Checkout, antes de recibir confirmación de pago;
- `/billing/success` verifica la sesión, pero no reanuda el spawn correspondiente;
- por lo tanto, iniciar checkout puede dejar una autorización prematura y completar checkout puede dejar la empresa sin desplegar.

Estos comportamientos son válidos únicamente como scaffolding de demo. No deben habilitarse para cobros reales.

### Modelo recomendado

Agregar una entidad persistente `deploymentIntents` (nombre provisional):

```text
id
organizationId
founderUserId / founderWallet
source: form_intake | chat_intake | rag_opportunity
founderIdeaId?
chatId?
opportunityId?
companyName
status: draft | checkout_pending | paid | spawning | deployed | failed | cancelled
planId
stripeCheckoutSessionId?
stripePaymentIntentId?
orchestrationSessionId?
createdAt
updatedAt
paidAt?
consumedAt?
```

Reglas:

- cada clic válido de “Deploy esta empresa” crea una intención nueva;
- Stripe recibe `deploymentIntentId` en metadata;
- el webhook, no el redirect del navegador, marca `paid`;
- crear una sesión de Stripe no modifica permisos ni marca el intent como pagado;
- `/billing/success` presenta el resultado y reanuda el flujo consultando el intent persistido, pero no sustituye al webhook;
- spawn requiere `status = paid`;
- al iniciar spawn, la intención pasa a `spawning` de forma atómica;
- un reintento del mismo intent usa idempotencia y no genera otro cobro;
- para otra empresa se crea otro intent y otro checkout.

### Gap actual que debe corregirse

En `DeployGate`, la rama que usa `session.plan` puede saltarse el checkout para empresas posteriores. Debe eliminarse cuando se implemente `deploymentIntents`.

En el camino AI Chat debe agregarse checkout antes de `handoff-openclaw`.

---

## Contrato de la API de deploy dockerizado

### Responsabilidad del Dashboard

1. Verificar autenticación.
2. Verificar y consumir una intención de deploy pagada.
3. Crear `orchestrationSessionId`.
4. Construir el ignition prompt y guardrails.
5. Llamar a la API de deploy con idempotencia.
6. Guardar referencias y estados.
7. Redirigir a Agent Office.

### Responsabilidad del servicio de deploy

1. Crear o reutilizar una instancia por idempotency key.
2. Levantar la imagen Docker autorizada.
3. Inyectar configuración sin exponer secretos al navegador.
4. Ejecutar health checks.
5. Devolver IDs operativos.
6. Emitir callback/eventos de estado verificables.

### Request recomendado

```json
{
  "idempotencyKey": "deploymentIntentId",
  "orchestrationSessionId": "convex-session-id",
  "companyName": "ClinicFlow",
  "source": "generated_opportunity",
  "image": "registry/openclaw:version-fija",
  "ignitionPrompt": "prompt con guardrails",
  "callbackUrl": "https://dashboard/api/deployments/callback",
  "metadata": {
    "founderIdeaId": "optional",
    "chatId": "optional",
    "opportunityId": "optional"
  }
}
```

### Respuesta recomendada

Aceptado:

```json
{
  "ok": true,
  "deploymentId": "external-id",
  "status": "queued",
  "vpsRef": "vps-id",
  "containerRef": null
}
```

Activo:

```json
{
  "ok": true,
  "deploymentId": "external-id",
  "status": "active",
  "vpsRef": "vps-id",
  "containerRef": "container-id",
  "endpointUrl": "https://runtime.example"
}
```

Todos los errores deben incluir `code`, `message` y `retryable`.

### Compatibilidad temporal

Hoy `runOpenClawSpawn` envía:

```json
{ "message": "ignition prompt" }
```

La integración nueva puede:

- evolucionar el bridge actual para aceptar el contrato recomendado; o
- agregar un adapter en el Dashboard y mantener `runOpenClawSpawn` como interfaz interna.

No se recomienda que los componentes React llamen directamente a la API del VPS.

---

## Propiedad de empresas y visibilidad

### Demo actual

Agent Office lista sesiones de la organización compartida. Esto permite enseñar todas las empresas al equipo.

### Producción objetivo

- cada empresa debe estar vinculada al usuario/wallet que creó su `deploymentIntent`;
- las queries de Agent Office y Chats deben filtrar por usuario o membresía autorizada;
- conocer un `sessionId` no debe dar acceso sin autorización;
- el historial de chat y la empresa deben persistir al cerrar sesión y reaparecer al iniciar sesión con la misma identidad;
- otros usuarios no deben verlos salvo que exista membresía/permiso compartido.

Ver también:

```text
src/lib/orchestrationDemoScope.ts
```

---

## Orden recomendado de implementación

### Fase 0 — Alineación y demo

- mantener las tres oportunidades estáticas;
- demostrar ambos entry points y los tres caminos;
- usar este documento como contrato;
- no presentar el aislamiento multiusuario como terminado.

### Fase 1 — Pago correcto por empresa

- agregar `deploymentIntents`;
- asociar Stripe a cada intención;
- implementar webhook e idempotencia;
- quitar el uso de `session.plan` como autorización global;
- insertar checkout en AI Chat;
- exigir intención pagada en ambos endpoints de spawn.

Esta fase debe completarse antes de producción o de cobrar dinero real.

### Fase 2 — Integración RAG

- implementar `/api/opportunities/generate`;
- validar respuesta;
- reemplazar `getMockOpportunities`;
- mantener fallback mock solo bajo una flag explícita de demo.

### Fase 3 — API de deploy dockerizado

- acordar request/response final;
- conectar adapter server-to-server;
- agregar idempotencia, callback y health checks;
- persistir `vpsRef`, `containerRef` y errores.

Las fases 2 y 3 pueden desarrollarse en paralelo después de congelar sus contratos.

### Fase 4 — Multiusuario

- filtrar empresas y chats por usuario/membresía;
- migrar registros históricos si es necesario;
- agregar pruebas de acceso cruzado.

---

## Criterios de aceptación end-to-end

### Form intake

- nombre y datos capturados correctamente;
- checkout nuevo para la empresa;
- pago confirmado;
- un solo spawn idempotente;
- redirect con `?sessionId=`;
- empresa visible en Agent Office.

### AI chat intake

- draft llega a `ready`;
- no hay spawn antes del pago;
- checkout nuevo para esa empresa;
- historial queda vinculado;
- handoff crea una sola sesión;
- redirect con `?sessionId=`.

### Generate opportunities

- RAG devuelve tres opciones o mock bajo flag de demo;
- la selección queda vinculada al usuario;
- checkout nuevo para la opción elegida;
- spawn usa nombre y blueprint correctos;
- redirect con `?sessionId=`.

### Segunda empresa del mismo usuario

- volver al Home y crear otra empresa abre otro checkout;
- el pago anterior no autoriza la nueva empresa;
- ambas empresas permanecen separadas;
- reintentar un deploy fallido no cobra otra vez.

---

## Owners sugeridos

- Equipo RAG: generación, ranking, procedencia y contrato `Opportunity[]`.
- Equipo Billing: `deploymentIntents`, Stripe Checkout, webhook e idempotencia.
- Equipo Runtime/VPS: imagen Docker, deploy API, callbacks y health.
- Equipo Dashboard: adapters, UX de los tres caminos, autorización y Agent Office.

Antes de modificar un contrato, actualizar este documento y acordar el cambio entre los owners afectados.
