import * as console from 'console'
import * as process from 'process'

import { createTypesenseCluster } from './typesense'

const main = async (): Promise<any> => {
  const args = process.argv.slice(2)
  const deployTypesense = args?.[0] == 'deploy:typesense' || false

  if (deployTypesense) {
    return createTypesenseCluster()
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

