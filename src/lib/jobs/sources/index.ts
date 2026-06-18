// Public barrel + adapter registration. Importing this module is the
// canonical way for any other code to ensure adapters are registered before
// they're looked up.
//
// New adapters land in v3.0/<name>-adapter branches and add their register()
// call here. Adapters with side-effecting init (MCP clients, Apify HTTP) must
// remain factory-lazy via registry.register() so an unavailable adapter
// doesn't crash the module load.

import { createAdzunaAdapter } from "./adzuna";
import { createApifyAdapter } from "./apify";
import { createArbeitnowAdapter } from "./arbeitnow";
import { createAshbyAdapter } from "./ashby";
import { createBundesagenturAdapter } from "./bundesagentur";
import { createCompanySitesAdapter } from "./company-sites";
import { createDiceMcpAdapter } from "./dice-mcp";
import { createGlassdoorAdapter } from "./glassdoor-apify";
import { createGreenhouseAdapter } from "./greenhouse";
import { createHimalayasAdapter } from "./himalayas";
import { createIndeedMcpAdapter } from "./indeed-mcp";
import { createJobicyAdapter } from "./jobicy";
import { createJobSpyAdapter } from "./jobspy";
import { createJSearchAdapter } from "./jsearch";
import { createLeverAdapter } from "./lever";
import { createLinkedInAdapter } from "./linkedin";
import { createPasteAdapter } from "./paste";
import { createReedAdapter } from "./reed";
import { createRemoteOkAdapter } from "./remoteok";
import { createRemotiveAdapter } from "./remotive";
import { createSmartRecruitersAdapter } from "./smartrecruiters";
import { createWorkableAdapter } from "./workable";
import { createWorkdayAdapter } from "./workday";
import { register } from "./registry";

let registered = false;

export function ensureAdaptersRegistered(): void {
  if (registered) return;
  registered = true;
  register("jsearch", createJSearchAdapter);
  register("linkedin", createLinkedInAdapter);
  register("paste", createPasteAdapter);
  register("jobspy", createJobSpyAdapter);
  register("adzuna", createAdzunaAdapter);
  register("greenhouse", createGreenhouseAdapter);
  register("lever", createLeverAdapter);
  register("workday", createWorkdayAdapter);
  register("apify", createApifyAdapter);
  register("indeed", createIndeedMcpAdapter);
  register("dice", createDiceMcpAdapter);
  register("glassdoor", createGlassdoorAdapter);
  register("reed", createReedAdapter);
  register("workable", createWorkableAdapter);
  register("ashby", createAshbyAdapter);
  register("smartrecruiters", createSmartRecruitersAdapter);
  register("company_sites", createCompanySitesAdapter);
  register("arbeitnow", createArbeitnowAdapter);
  register("bundesagentur", createBundesagenturAdapter);
  register("remotive", createRemotiveAdapter);
  register("jobicy", createJobicyAdapter);
  register("remoteok", createRemoteOkAdapter);
  register("himalayas", createHimalayasAdapter);
}

// Re-exports for ergonomics — anything importing this module gets the full
// adapter framework public surface from a single barrel.
export { get, has, knownSources } from "./registry";
export { budget } from "./budget";
export { dedupeHash } from "./dedupe";
export { normalizeForInsert } from "./normalize";
export { estimatedCostFor, getPricing, monthlyCapFor, dailyCallCapFor } from "./pricing";
export {
  SourceBudgetError,
  SourcePermanentError,
  SourceTransientError,
  wrapUnknownError,
} from "./errors";
export type {
  AvailabilityResult,
  JobSource,
  JobSourceId,
  RawJob,
  RawLocation,
  RawSalary,
  RemoteMode,
  SalaryPeriod,
  SearchParams,
  SourceSighting,
} from "./types";
export type { BudgetKey, PricingEntry } from "./pricing";
