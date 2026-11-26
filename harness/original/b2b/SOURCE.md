# Origen — Arnés B2B

- Repo: https://github.com/valrami-hue/arnes-b2b-avril
- Commit: `8854d61b4fc662672a087fb2a6767647d08743ef`
- Autor: Valeria Ramírez Olvera
- Integración: copia del código (`arnes/`, `run.py`, `config/`, `data/`,
  `docs/`, `skills/`, `tests/`, `README.md`, `requirements.txt`).
- Excluidos: `crm/`, `crm_modelo/` y `evidencias/` (salidas/evidencia locales);
  el adapter escribe el CRM en un directorio temporal.
- Ejecución: `python3 run.py --config ... --solicitudes ... --salida ...`.
  El modo `modelo` es opcional y requiere `ANTHROPIC_API_KEY`.
