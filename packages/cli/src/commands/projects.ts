import { Command } from 'commander'
import pc from 'picocolors'
import { logger } from '../utils/logger.js'
import { listProjects, removeProject } from '../core/project-store.js'

export function projectsCommand(): Command {
  const cmd = new Command('projects')
    .description('List and manage tracked projects')
    .action(async () => {
      const projects = listProjects()

      if (projects.length === 0) {
        logger.info('No tracked projects.')
        logger.info(`Run ${pc.bold('w3m new <name>')} to create your first project.`)
        return
      }

      console.log('')
      console.log(pc.bold('  Tracked Projects'))
      console.log(pc.dim('  ' + '─'.repeat(60)))
      console.log('')

      for (const project of projects) {
        const ago = timeAgo(project.lastOpenedAt)
        const components = project.components.length > 0
          ? pc.dim(` [${project.components.join(', ')}]`)
          : ''

        console.log(`  ${pc.bold(project.name.padEnd(20))} ${pc.dim(project.path)}`)
        console.log(`  ${''.padEnd(20)} ${pc.dim(ago)}${components}`)
        console.log('')
      }

      console.log(pc.dim(`  ${projects.length} project(s)`))
      console.log('')
    })

  cmd
    .command('remove <name>')
    .description('Remove a project from tracking (does not delete files)')
    .action((name: string) => {
      const removed = removeProject(name)
      if (removed) {
        logger.success(`Removed "${name}" from tracking.`)
      } else {
        logger.error(`Project "${name}" not found in tracking.`)
      }
    })

  return cmd
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks} week${weeks > 1 ? 's' : ''} ago`
  const months = Math.floor(days / 30)
  return `${months} month${months > 1 ? 's' : ''} ago`
}
