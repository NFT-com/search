import * as console from 'console'
import * as process from 'process'
import * as upath from 'upath'
import * as pulumi from '@pulumi/pulumi'

import { sharedOutToJSONFile } from 'nftcom-infra'
import { createTypesenseCluster } from './typesense'

const getSharedStackReference = async (): Promise<any> => {
  const sharedStack = new pulumi.StackReference( `${process.env.STAGE}.shared.${process.env.AWS_REGION}`);
  return sharedStack.outputs
}

export const deployInfra = async (
  stackName: string,
  workDir: string,
  pulumiFn: pulumi.automation.PulumiFn,
  preview?: boolean,
): Promise<pulumi.automation.OutputMap> => {
  const args: pulumi.automation.InlineProgramArgs = {
    stackName,
    projectName: 'inlineNode',
    program: pulumiFn,
  }

  const stack = await pulumi.automation.LocalWorkspace.createOrSelectStack(args, { workDir })

  await stack.workspace.installPlugin('aws', 'v4.29.0')

  if (preview) {
    await stack.preview({ onOutput: console.info })
  }

  const result = await stack.up({ onOutput: console.info })
  // console.log('Update summary', JSON.stringify(result.summary))
  return result.outputs
}

const pulumiProgram = async (): Promise<Record<string, any> | void> => {
  return getSharedStackReference()
}

export const getSharedInfra = (
  preview?: boolean,
): Promise<pulumi.automation.OutputMap> => {
  const stackName = `${process.env.STAGE}.typesense.${process.env.AWS_REGION}`
  const workDir = upath.joinSafe(__dirname, 'typesense', 'stack')
  return deployInfra(stackName, workDir, pulumiProgram, preview)
}

const main = async (): Promise<any> => {
  const args = process.argv.slice(2)
  const deployTypesense = args?.[0] == 'deploy:typesense' || false

  if (deployTypesense) {
    return getSharedInfra()
      .then(sharedOutToJSONFile)
      .then(() => createTypesenseCluster())
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

