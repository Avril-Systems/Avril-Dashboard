# Origen — Arnés de marketing

- Repo: https://github.com/ivancontreras-m/Asistente
- Commit: `6805fcc0e3193252616723022b08fb997704177f`
- Autor: Iván Contreras Martínez
- Integración: copia de `agente.py`, `briefing_ejemplo.json`,
  `briefing_variacion.json`, `requirements.txt` y `README.md`.
- Cambios mínimos de integración:
  - `OpenAI(..., timeout=60.0, max_retries=1)` para que un proveedor lento no
    bloquee el worker; el fallback interno de modelos sigue igual.
  - `ddgs>=9.0.0` agregado a `requirements.txt` (el paquete
    `duckduckgo-search` fue renombrado; el código ya prefiere `ddgs`).
- Excluidos: `usuarios.db`, `.env`, `output_marketing/`, `memory/` y los
  archivos de persona del agente (no participan del pipeline de marketing).
- Ejecución: `python3 agente.py --marketing briefing.json`.
  Requiere `NVIDIA_API_KEY`; `BRAVE_API_KEY` es opcional (DDGS como fallback).
