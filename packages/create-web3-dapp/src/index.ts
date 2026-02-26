#!/usr/bin/env node

import { createCli } from '@web3marketlabs/cli'

/**
 * create-web3-dapp — thin wrapper around @web3marketlabs/cli
 *
 * Usage:
 *   npx create-web3-dapp my-dapp
 *   npx create-web3-dapp (interactive)
 *
 * Equivalent to running `w3m new [name]`
 */
const program = createCli()

// When invoked as `create-web3-dapp`, default to the `new` command
const args = process.argv.slice(2)

if (args.length === 0 || !args[0]!.startsWith('-')) {
  // No subcommand provided — run new with remaining args
  process.argv = [process.argv[0]!, process.argv[1]!, 'new', ...args]
}

program.parse()
