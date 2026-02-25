export type { AppTemplate, AppTemplateFile } from './types.js'
export { collectTemplateParams } from './collect-params.js'
export {
  getAppTemplate,
  listAppTemplates,
  registerAppTemplate,
  ensureTemplatesLoaded,
} from './registry.js'
