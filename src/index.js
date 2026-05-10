// Public package entry — forwards to implementations in src/core and src/server
export { ensureCodeQL } from "./core/bootstrap.js";
export { createApiServer } from "./server/api-server.js";
export { createScanService } from "./core/scan-service.js";
export { runScan } from "./core/scan.js";
export {
  buildLanguageMenu,
  getCodeQLMode,
  getLanguageProfile,
  listCodeQLModes,
  listSupportedLanguageIds,
  listSupportedLanguageProfiles,
} from "./core/scan-profiles.js";

