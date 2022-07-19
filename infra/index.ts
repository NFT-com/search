import * as console from 'console'
import * as process from 'process'
import * as pulumi from '@pulumi/pulumi'

import { sharedOutToJSONFile } from 'nftcom/infra'
import { createTypesenseCluster } from './typesense'

const getSharedInfra = async (): Promise<any> => {
  const sharedStack = new pulumi.StackReference( `${process.env.STAGE}.shared.${process.env.AWS_REGION}`);
  return sharedStack.outputs
}

const main = async (): Promise<any> => {
  const args = process.argv.slice(2)
  const deployTypesense = args?.[0] == 'deploy:typesense' || false

  getSharedInfra().then(sharedOutToJSONFile)

  if (deployTypesense) {
    return createTypesenseCluster()
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

