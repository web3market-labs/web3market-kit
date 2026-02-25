#!/usr/bin/env node
import { createCli } from './cli.js'

const args = process.argv.slice(2)

// If no args (or only no-value flags like nothing), show interactive home menu.
// Let --help, --version, and any subcommand fall through to Commander.
if (args.length === 0) {
  const { showHomeMenu } = await import('./menu/home.js')
  await showHomeMenu()
} else {
  const program = createCli()
  program.parse()
}
