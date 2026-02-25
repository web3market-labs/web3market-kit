/**
 * Core types shared between CLI and future Electron app.
 */

export interface ProgressReporter {
  step(message: string): void
  success(message: string): void
  warn(message: string): void
  error(message: string): void
}

export class AuthError extends Error {
  constructor(
    public code: 'NOT_AUTHENTICATED' | 'INVALID_KEY' | 'EXPIRED_KEY',
    message: string,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}
