import path from 'node:path'
import { readAllDeployments } from './deployments.js'
import { getChainById, getContractUrl, getTxUrl } from '../../utils/chains.js'

export interface DeploymentRecord {
  chainId: number
  chain: string
  contractName: string
  address: string
  txHash: string
  deployedAt: string
  explorerUrl: string | null
  txUrl: string | null
  template?: string
}

export interface ProjectDeployments {
  deployments: DeploymentRecord[]
  chains: number[]
  lastDeployedAt: string | null
}

export async function getProjectDeployments(projectRoot: string): Promise<ProjectDeployments> {
  const deploymentsDir = path.join(projectRoot, 'deployments')
  const rawDeployments = await readAllDeployments(deploymentsDir)

  const records: DeploymentRecord[] = []
  const chainSet = new Set<number>()
  let lastDeployedAt: string | null = null

  for (const deployment of rawDeployments) {
    chainSet.add(deployment.chainId)
    const chainInfo = getChainById(deployment.chainId)
    const chainName = deployment.chain ?? chainInfo?.name ?? `Chain ${deployment.chainId}`

    for (const contract of Object.values(deployment.contracts)) {
      const record: DeploymentRecord = {
        chainId: deployment.chainId,
        chain: chainName,
        contractName: contract.contractName || contract.address,
        address: contract.address,
        txHash: contract.txHash,
        deployedAt: contract.deployedAt,
        explorerUrl: getContractUrl(deployment.chainId, contract.address),
        txUrl: contract.txHash ? getTxUrl(deployment.chainId, contract.txHash) : null,
        template: deployment.template,
      }
      records.push(record)

      if (!lastDeployedAt || new Date(contract.deployedAt) > new Date(lastDeployedAt)) {
        lastDeployedAt = contract.deployedAt
      }
    }
  }

  // Sort by deployedAt descending
  records.sort((a, b) => new Date(b.deployedAt).getTime() - new Date(a.deployedAt).getTime())

  return {
    deployments: records,
    chains: Array.from(chainSet),
    lastDeployedAt,
  }
}
