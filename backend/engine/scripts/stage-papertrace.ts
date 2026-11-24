import { resolve } from 'node:path'
import { materializeStagedLinks, deduplicateStagedWorkspacePackages } from './build-exe-for-python-sdk-staging.ts'

const target = resolve(process.argv[2])
await materializeStagedLinks(target)
await deduplicateStagedWorkspacePackages(target, target)
