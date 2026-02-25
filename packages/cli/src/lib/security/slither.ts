import { execa } from 'execa'

export interface SlitherResult {
  success: boolean
  findings: SlitherFinding[]
  raw: string
}

export interface SlitherFinding {
  impact: 'High' | 'Medium' | 'Low' | 'Informational' | 'Optimization'
  confidence: 'High' | 'Medium' | 'Low'
  description: string
  check: string
}

export async function runSlither(contractsRoot: string): Promise<SlitherResult> {
  try {
    const result = await execa('slither', ['.', '--json', '-'], {
      cwd: contractsRoot,
      reject: false,
    })

    const output = result.stdout || result.stderr

    try {
      const parsed = JSON.parse(output) as {
        results?: { detectors?: Array<{
          impact: string
          confidence: string
          description: string
          check: string
        }> }
      }
      const detectors = parsed.results?.detectors ?? []

      const findings: SlitherFinding[] = detectors.map((d) => ({
        impact: d.impact as SlitherFinding['impact'],
        confidence: d.confidence as SlitherFinding['confidence'],
        description: d.description,
        check: d.check,
      }))

      const hasHighOrCritical = findings.some((f) => f.impact === 'High')

      return { success: !hasHighOrCritical, findings, raw: output }
    } catch {
      return { success: false, findings: [], raw: output }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (message.includes('ENOENT')) {
      return { success: false, findings: [], raw: 'Slither is not installed. Install with: pip install slither-analyzer' }
    }

    return { success: false, findings: [], raw: `Slither failed: ${message}` }
  }
}
