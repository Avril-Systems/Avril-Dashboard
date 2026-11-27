/** Registro único de actividades -> ejecutor real. Originales + adicionales. */
import { runB2B, runMarketing, runProspecting, runSupport } from './harness-adapters.mjs';
import {
  runOriginalB2B,
  runOriginalMarketing,
  runOriginalProspecting,
  runOriginalSupport,
} from './harness-original-adapters.mjs';

export const ACTIVITY_ADAPTERS = {
  // Originales (código vendorizado de los estudiantes)
  github_discovery_original: runOriginalProspecting,
  b2b_intake_original: runOriginalB2B,
  support_ticket_triage: runOriginalSupport,
  marketing_campaign: runOriginalMarketing,
  // Adicionales (capacidades que ya funcionaban en el Dashboard)
  github_discovery: runProspecting,
  account_qualification: runB2B,
  site_audit: runMarketing,
  incident_triage: runSupport,
};
