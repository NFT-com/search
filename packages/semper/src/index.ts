import Typesense from 'typesense'

import { db, helper } from '@nftcom/shared'

import Commander from './search/commander'

const TYPESENSE_HOST = process.env.TYPESENSE_HOST
const TYPESENSE_API_KEY = process.env.TYPESENSE_API_KEY

const typesenseClient = new Typesense.Client({
  nodes: [
    {
      host: TYPESENSE_HOST,
      port: 443,
      protocol: 'https',
    },
  ],
  apiKey: TYPESENSE_API_KEY,
  connectionTimeoutSeconds: 180,
})

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USERNAME || 'app',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_DATABASE || 'app',
  logging: helper.parseBoolean(process.env.DB_LOGGING) || false,
  useSSL: helper.parseBoolean(process.env.DB_USE_SSL),
}

const main = async (): Promise<void> => {
  await db.connect(dbConfig)
  const repositories = db.newRepositories()
  const commander = new Commander(typesenseClient, repositories)

  await commander.erase()
  await commander.restore()

  await db.disconnect()
}

main()
