import * as Typesense from 'typesense'
import { CollectionSchema } from 'typesense/lib/Typesense/Collection'
import { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections'

import { _logger } from '@nftcom/shared'
import { db } from '@nftcom/shared'

import { collectionNames, mapCollectionData } from './collections'
import collections from './schemas/collections.json'
import nfts from './schemas/nfts.json'

const logger = _logger.Factory(
  _logger.Context.General,
  _logger.Context.Typesense,
)

const schemas = [collections, nfts]

class Commander {

  client: Typesense.Client
  repositories: db.Repository

  constructor(client: Typesense.Client, repositories: db.Repository) {
    this.client = client
    this.repositories = repositories
  }

  erase = (): Promise<PromiseSettledResult<CollectionSchema>[]> => {
    return Promise.allSettled(
      collectionNames.map((collection) => {
        return this.client.collections(collection).delete()
      }),
    )
  }

  private _retrieveData = async (name: string): Promise<any[]> => {
    if (name === 'nfts') {
      return this.repositories[name.slice(0, -1)].findAllWithRelations()
    } else if (name === 'collections') {
      return this.repositories.collection.findAllWithAnNft()
    }
    return await this.repositories[name.slice(0, -1)].findAll()
  }

  restore = async (): Promise<void> => {
    for (const schema of schemas) {
      await this.client.collections().create(schema as CollectionCreateSchema)
    }

    for (const name of collectionNames) {
      const data = await this._retrieveData(name)
      
      const collection = mapCollectionData(name, data)

      try {
        if (collection) {
          await this.client.collections(name).documents().import(collection)
        }
      } catch (e) {
        logger.error('unable to import collection:', e)
      }
    }
  }

}

export default Commander