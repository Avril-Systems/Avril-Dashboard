# Scripts demo (NO operativos)

Estos scripts **no** forman parte del flujo operativo del Dashboard. Escriben datos de
demostración y están reservados para demos/QA manual.

| Script | Para qué | Garantía |
|---|---|---|
| `swarmy-mock-cycle.mjs` | Siembra un run MOCK en el Convex de desarrollo (`isMock:true`, `runId` empieza con `run_mock_`). | Se niega a escribir si `CONVEX_DEPLOYMENT` no empieza con `dev:`. |
| `swarmy-staging-worker.mjs` | Worker de staging con eventos predefinidos (demo W46, actividades 4–6). | No ejecuta los arneses reales; es un simulador. |

Flujo operativo real:

```bash
npm run harness:worker        # worker real de los 4 arneses
npm run harness:worker:once   # procesa la cola actual y termina
```

La consola `/agents/swarmy` muestra `MOCK` / `REAL` / `SIN ORIGEN` para que un dato de demo
nunca se confunda con una ejecución real.
