import * as upath from 'upath'

import * as pulumi from '@pulumi/pulumi'

import { deployInfra } from '../helper'
import { createEc2Asg } from './ec2_asg'

const getSharedStackOutputs = async (): Promise<any> => {
  const sharedStack = new pulumi.StackReference(`${process.env.STAGE?.split('-')[0]}.shared.${process.env.AWS_REGION}`)
  return sharedStack.outputs
}

const pulumiProgram = async (): Promise<Record<string, any> | void> => {
  const config = new pulumi.Config()
  const sharedStackOutputs = await getSharedStackOutputs()
  createEc2Asg(config, sharedStackOutputs)
}

export const createTypesenseCluster = (
  preview?: boolean,
): Promise<pulumi.automation.OutputMap> => {
  const stackName = `${process.env.STAGE}.typesense.${process.env.AWS_REGION}`
  const workDir = upath.joinSafe(__dirname, 'stack')
  return deployInfra(stackName, workDir, pulumiProgram, preview)
}