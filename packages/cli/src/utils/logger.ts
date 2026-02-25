import pc from 'picocolors'

export const logger = {
  info:    (msg: string) => console.log(`  ${pc.dim('\u25CB')} ${msg}`),
  success: (msg: string) => console.log(`  ${pc.green('\u25CF')} ${msg}`),
  warn:    (msg: string) => console.log(`  ${pc.yellow('\u25CF')} ${msg}`),
  error:   (msg: string) => console.log(`  ${pc.red('\u25CF')} ${msg}`),
  step:    (msg: string) => console.log(`  ${pc.magenta('\u25B8')} ${msg}`),
}
