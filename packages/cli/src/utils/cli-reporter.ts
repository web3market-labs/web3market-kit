import { logger } from './logger.js'
import type { ProgressReporter } from '../core/types.js'

export const cliReporter: ProgressReporter = {
  step: (msg) => logger.step(msg),
  success: (msg) => logger.success(msg),
  warn: (msg) => logger.warn(msg),
  error: (msg) => logger.error(msg),
}
