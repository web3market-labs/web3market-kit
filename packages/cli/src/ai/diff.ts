import fs from 'node:fs/promises'
import path from 'node:path'
import pc from 'picocolors'

export interface FileChange {
  path: string
  content: string
  isNew: boolean
}

/**
 * Parse AI response JSON into file changes.
 * Expects a JSON array: [{ "path": "relative/path", "content": "full file content" }]
 */
export function parseAiChanges(aiResponse: string): FileChange[] {
  // Try to extract JSON from the response (may be wrapped in markdown code blocks)
  let jsonStr = aiResponse.trim()

  // Remove markdown code block wrapper if present
  const jsonMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1]!.trim()
  }

  // Try to find JSON array in the response
  const arrayStart = jsonStr.indexOf('[')
  const arrayEnd = jsonStr.lastIndexOf(']')
  if (arrayStart !== -1 && arrayEnd !== -1) {
    jsonStr = jsonStr.slice(arrayStart, arrayEnd + 1)
  }

  try {
    const parsed = JSON.parse(jsonStr)
    if (!Array.isArray(parsed)) {
      throw new Error('Expected a JSON array of file changes')
    }

    return parsed.map((item: { path: string; content: string }) => ({
      path: item.path,
      content: item.content,
      isNew: false, // Will be determined later
    }))
  } catch (error) {
    throw new Error(
      `Could not parse AI response as file changes. Expected JSON array format: [{ "path": "...", "content": "..." }]`,
    )
  }
}

/**
 * Show colored diff preview of changes.
 */
export async function showDiffPreview(changes: FileChange[]): Promise<void> {
  console.log('')
  console.log(pc.bold(`  Changes (${changes.length} file${changes.length === 1 ? '' : 's'}):`))
  console.log('')

  for (const change of changes) {
    const fullPath = path.resolve(process.cwd(), change.path)
    let existingContent = ''
    try {
      existingContent = await fs.readFile(fullPath, 'utf-8')
      change.isNew = false
    } catch {
      change.isNew = true
    }

    if (change.isNew) {
      console.log(`  ${pc.green('+')} ${pc.bold(change.path)} ${pc.dim('(new file)')}`)
      // Show first few lines of new content
      const lines = change.content.split('\n').slice(0, 5)
      for (const line of lines) {
        console.log(`    ${pc.green('+ ' + line)}`)
      }
      if (change.content.split('\n').length > 5) {
        console.log(pc.dim(`    ... (${change.content.split('\n').length} total lines)`))
      }
    } else {
      console.log(`  ${pc.yellow('~')} ${pc.bold(change.path)} ${pc.dim('(modified)')}`)
      // Show a summary of changes
      const oldLines = existingContent.split('\n')
      const newLines = change.content.split('\n')

      const addedCount = Math.max(0, newLines.length - oldLines.length)
      const removedCount = Math.max(0, oldLines.length - newLines.length)
      let changedCount = 0
      const minLen = Math.min(oldLines.length, newLines.length)
      for (let i = 0; i < minLen; i++) {
        if (oldLines[i] !== newLines[i]) changedCount++
      }

      const parts: string[] = []
      if (addedCount > 0) parts.push(pc.green(`+${addedCount}`))
      if (removedCount > 0) parts.push(pc.red(`-${removedCount}`))
      if (changedCount > 0) parts.push(pc.yellow(`~${changedCount}`))
      console.log(`    ${parts.join(', ')} lines`)

      // Show first few changed lines
      let shown = 0
      for (let i = 0; i < minLen && shown < 3; i++) {
        if (oldLines[i] !== newLines[i]) {
          console.log(`    ${pc.red('- ' + (oldLines[i] ?? '').slice(0, 80))}`)
          console.log(`    ${pc.green('+ ' + (newLines[i] ?? '').slice(0, 80))}`)
          shown++
        }
      }
      if (changedCount > shown) {
        console.log(pc.dim(`    ... and ${changedCount - shown} more changes`))
      }
    }

    console.log('')
  }
}

/**
 * Write file changes to disk.
 */
export async function applyChanges(changes: FileChange[]): Promise<void> {
  for (const change of changes) {
    const fullPath = path.resolve(process.cwd(), change.path)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, change.content, 'utf-8')
  }
}
