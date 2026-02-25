import { Command } from 'commander'
import { authCommand } from './commands/auth.js'
import { newCommand } from './commands/new.js'
import { addCommand } from './commands/add.js'
import { deployCommand } from './commands/deploy.js'
import { devCommand } from './commands/dev.js'
import { generateCommand } from './commands/generate.js'
import { testCommand } from './commands/test.js'
import { publishCommand } from './commands/publish.js'
import { myProductsCommand } from './commands/my-products.js'
import { templatesCommand } from './commands/templates.js'
import { auditCommand } from './commands/audit.js'
import { projectsCommand } from './commands/projects.js'
import { statusCommand } from './commands/status.js'
import { deploymentsCommand } from './commands/deployments.js'
import { aiCommand } from './commands/ai.js'
import { fixCommand } from './commands/fix.js'
import { chatCommand } from './commands/chat.js'

export function createCli(): Command {
  const program = new Command()

  program
    .name('w3m')
    .description('Web3 Market — build, deploy, and publish Web3 projects')
    .version('0.2.0')

  // Authentication
  program.addCommand(authCommand())

  // Project lifecycle
  const cmd = newCommand()
  cmd.aliases(['init', 'create'])
  program.addCommand(cmd)
  program.addCommand(addCommand())
  program.addCommand(devCommand())
  program.addCommand(generateCommand())
  program.addCommand(testCommand())
  program.addCommand(deployCommand())
  program.addCommand(deploymentsCommand())

  // Marketplace
  program.addCommand(templatesCommand())
  program.addCommand(publishCommand())

  // Products (renamed from my-products, keep alias)
  const productsCmd = myProductsCommand()
  productsCmd.name('products').alias('my-products')
  program.addCommand(productsCmd)

  // AI customization
  program.addCommand(aiCommand())
  program.addCommand(fixCommand())
  program.addCommand(chatCommand())

  // Security
  program.addCommand(auditCommand())

  // Project tracking & status
  program.addCommand(projectsCommand())
  program.addCommand(statusCommand())

  return program
}
