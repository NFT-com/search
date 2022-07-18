import * as console from 'console'
import * as process from 'process'

import { createSharedInfra } from 'nftcom/infra/shared'
import { sharedOutToJSONFile } from 'nftcom/infra'
import { createTypesenseCluster } from './typesense'

const main = async (): Promise<any> => {
  const args = process.argv.slice(2)
  const deployShared = args?.[0] === 'deploy:shared' || false
  const deployTypesense = args?.[0] == 'deploy:typesense' || false

  if (deployShared) {
    return createSharedInfra()
      .then(sharedOutToJSONFile)
  }

  if (deployTypesense) {
    return createTypesenseCluster()
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

