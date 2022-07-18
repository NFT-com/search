import * as upath from 'upath'

import * as pulumi from '@pulumi/pulumi'

import { deployInfra, getSharedInfraOutput } from 'nftcom/infra/helper'
import { createEc2Asg } from './ec2_asg'

const pulumiProgram = async (): Promise<Record<string, any> | void> => {
  const config = new pulumi.Config()
  const sharedInfraOutput = getSharedInfraOutput()
  createEc2Asg(config, sharedInfraOutput)
}

export const createTypesenseCluster = (
  preview?: boolean,
): Promise<pulumi.automation.OutputMap> => {
  const stackName = `${process.env.STAGE}.typesense.${process.env.AWS_REGION}`
  const workDir = upath.joinSafe(__dirname, 'stack')
  return deployInfra(stackName, workDir, pulumiProgram, preview)
}