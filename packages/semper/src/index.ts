import Typesense from 'typesense'

import { db, helper } from '@nftcom/shared'

import Commander from './search/commander'

const TYPESENSE_HOST = process.env.TYPESENSE_HOST
const TYPESENSE_PORT = parseInt(process.env.TYPESENSE_PORT) || 443
const TYPESENSE_PROTOCOL = process.env.TYPESENSE_PROTOCOL || 'https'
const TYPESENSE_API_KEY = process.env.TYPESENSE_API_KEY

const typesenseClient = new Typesense.Client({
  nodes: [
    {
      host: TYPESENSE_HOST,
      port: TYPESENSE_PORT,
      protocol: TYPESENSE_PROTOCOL,
    },
  ],
  apiKey: TYPESENSE_API_KEY,
  connectionTimeoutSeconds: 3600, // 1 hour... because typesense
})

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  username: process.env.DB_USERNAME || 'app',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_DATABASE || 'app',
  logging: helper.parseBoolean(process.env.DB_LOGGING) || false,
  useSSL: helper.parseBoolean(process.env.DB_USE_SSL),
}

const main = async (): Promise<void> => {
  await db.connect(dbConfig)
  const repositories = db.newRepositories()
  const commander = new Commander(typesenseClient, repositories)
  
  await commander.help()
  // await commander.erase()
  // await commander.restore()
  // await commander.update('collections', ['issuance'])
  // await commander.update('nfts', ['contractAddr'])
  // await commander.reindexNFTsByContract('0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB')

  await db.disconnect()
}

main()
