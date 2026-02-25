import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execa } from 'execa'

export interface Snapshot {
  hash: string
  fullHash: string
  message: string
  timestamp: string
}

const DEFAULT_GITIGNORE = `node_modules/
.next/
out/
cache/
broadcast/
.env
`

/**
 * Ensure projectRoot is a git repo with at least one commit.
 * Writes a default .gitignore if one doesn't exist.
 */
export async function ensureGitRepo(projectRoot: string): Promise<void> {
  const gitDir = path.join(projectRoot, '.git')
  if (!existsSync(gitDir)) {
    await execa('git', ['init'], { cwd: projectRoot, stdio: 'pipe' })
  }

  // Write default .gitignore if missing
  const gitignorePath = path.join(projectRoot, '.gitignore')
  if (!existsSync(gitignorePath)) {
    await fs.writeFile(gitignorePath, DEFAULT_GITIGNORE, 'utf-8')
  }

  // Check if there are any commits
  try {
    await execa('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, stdio: 'pipe' })
  } catch {
    // No commits yet — create initial commit
    await execa('git', ['add', '.'], { cwd: projectRoot, stdio: 'pipe' })
    await execa('git', ['commit', '-m', 'Initial project snapshot'], {
      cwd: projectRoot,
      stdio: 'pipe',
      env: { ...process.env, GIT_AUTHOR_NAME: 'w3m', GIT_COMMITTER_NAME: 'w3m', GIT_AUTHOR_EMAIL: 'w3m@local', GIT_COMMITTER_EMAIL: 'w3m@local' },
    })
  }
}

/**
 * Create a snapshot (git commit) of the current project state.
 * Returns null if there are no changes to commit.
 */
export async function createSnapshot(projectRoot: string, message: string): Promise<Snapshot | null> {
  await execa('git', ['add', '.'], { cwd: projectRoot, stdio: 'pipe' })

  // Check if there are staged changes
  try {
    await execa('git', ['diff', '--cached', '--quiet'], { cwd: projectRoot, stdio: 'pipe' })
    // Exit 0 means no changes
    return null
  } catch {
    // Exit 1 means there ARE changes — commit them
  }

  await execa('git', ['commit', '-m', message], {
    cwd: projectRoot,
    stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_NAME: 'w3m', GIT_COMMITTER_NAME: 'w3m', GIT_AUTHOR_EMAIL: 'w3m@local', GIT_COMMITTER_EMAIL: 'w3m@local' },
  })

  const { stdout } = await execa('git', ['log', '--format=%h|%H', '-1'], {
    cwd: projectRoot,
    stdio: 'pipe',
  })

  const [hash, fullHash] = stdout.trim().split('|')
  return { hash: hash!, fullHash: fullHash!, message, timestamp: new Date().toISOString() }
}

/**
 * List recent snapshots.
 */
export async function listSnapshots(projectRoot: string, count = 10): Promise<Snapshot[]> {
  try {
    const { stdout } = await execa('git', ['log', `--format=%h|%H|%s|%aI`, `-n`, String(count)], {
      cwd: projectRoot,
      stdio: 'pipe',
    })

    if (!stdout.trim()) return []

    return stdout
      .trim()
      .split('\n')
      .map((line) => {
        const [hash, fullHash, message, timestamp] = line.split('|')
        return { hash: hash!, fullHash: fullHash!, message: message!, timestamp: timestamp! }
      })
  } catch {
    return []
  }
}

/**
 * Revert the working tree to a previous snapshot.
 * Uses checkout + new commit to preserve full history.
 */
export async function revertToSnapshot(projectRoot: string, hash: string): Promise<Snapshot> {
  // Get the original message for the target commit
  const { stdout: originalMessage } = await execa(
    'git',
    ['log', '--format=%s', '-1', hash],
    { cwd: projectRoot, stdio: 'pipe' },
  )

  // Checkout all files from that commit
  await execa('git', ['checkout', hash, '--', '.'], { cwd: projectRoot, stdio: 'pipe' })

  // Commit the revert
  const message = `Reverted to: ${originalMessage.trim()}`
  await execa('git', ['add', '.'], { cwd: projectRoot, stdio: 'pipe' })
  await execa('git', ['commit', '-m', message], {
    cwd: projectRoot,
    stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_NAME: 'w3m', GIT_COMMITTER_NAME: 'w3m', GIT_AUTHOR_EMAIL: 'w3m@local', GIT_COMMITTER_EMAIL: 'w3m@local' },
  })

  const { stdout } = await execa('git', ['log', '--format=%h|%H', '-1'], {
    cwd: projectRoot,
    stdio: 'pipe',
  })

  const [newHash, fullHash] = stdout.trim().split('|')
  return { hash: newHash!, fullHash: fullHash!, message, timestamp: new Date().toISOString() }
}

/**
 * Get the hash of the latest commit, or null if no commits exist.
 */
export async function getLatestHash(projectRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execa('git', ['log', '--format=%h', '-1'], {
      cwd: projectRoot,
      stdio: 'pipe',
    })
    return stdout.trim() || null
  } catch {
    return null
  }
}
