# Deploy Status Toasts

## Resumen

Durante el flujo de pago (billing-success-page), el cliente ve una secuencia de
toasts que notifican el estado del despliegue de su empresa en Launch. Antes no
existían: solo había un indicador de carga genérico sin retroalimentación de
progreso.

## Comportamiento

1. Al confirmarse el pago y lanzar el deploy, se muestra un toast inicial de
   carga: `Iniciando despliegue de {empresa}…` (id `deploy-status-start`).
2. El polling de `GET /api/deploy/status` detecta transiciones de estado
   (`pending` → `provisioning` → `ready`). En cada transición se emite un toast
   **nuevo** con id único (uno por estado), en lugar de actualizar el mismo.
3. El toast inicial se descarta (`toast.dismiss`) al recibir el primer estado.

## Estados y toasts

| Estado        | Label (ES)                          | Label (EN)                          | Tipo de toast    |
|---------------|-------------------------------------|-------------------------------------|------------------|
| `pending`     | En cola de despliegue…              | Queued for deploy…                  | `info`           |
| `provisioning`| Aprovisionando infraestructura…     | Provisioning infrastructure…        | `info`           |
| `ready`       | ¡{empresa} está lista!              | {empresa} is ready!                 | `success`        |
| `failed`      | El despliegue falló.                | The deploy failed.                  | `error`          |
| `stale`       | El despliegue quedó obsoleto.       | The deploy is stale.                | `error`          |

- Los toasts `info` de estados intermedios tienen auto-dismiss (`duration: 4000`).
- Los de `failed`/`stale` incluyen el mensaje de error del servidor como
  descripción.

## Fix: Unhandled Runtime Error

`getDeployLaunchTask` usa un single-flight (`deployLaunchTasks` Map) para evitar
que React 18 StrictMode duplique el `POST /api/deploy/launch`. La cadena
`task.finally(() => deployLaunchTasks.delete(sessionId))` devolvía una promise
derivada **sin handler**: si algún `fetch` del `Promise.all` rechazaba (p. ej.
glitch de red o la ruta compilándose en dev), se producía un *Unhandled Promise
Rejection* que Next mostraba como overlay "Unhandled Runtime Error:
TypeError: Failed to fetch".

Se añadió `.catch(() => {})` a la cadena para absorber el rechazo. El flujo
original (la promise consumida por el `useEffect` con su propio `.catch`) no
cambia.

## Archivos

- `components/flows/billing/billing-success-page.tsx` — implementación de toasts
  y fix del single-flight.