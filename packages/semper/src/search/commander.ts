import * as Typesense from 'typesense'
import { CollectionSchema, CollectionUpdateSchema } from 'typesense/lib/Typesense/Collection'
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

const N_CHUNKS = parseInt(process.env.N_CHUNKS) || 1
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 50_000
const chunk = (arr: any[], size: number): any[] => {
  const chunks = []
  while (arr.length) {
    chunks.push(arr.splice(0, size))
  }
  return chunks
}
const addDocumentsToTypesense = async (
  client: any,
  collectionName: string,
  documents: any[],
): Promise<void> => {
  while (documents.length) {
    const batch = documents.splice(0, BATCH_SIZE)
    try {
      const responses = await Promise.all(
        chunk(batch, Math.ceil(batch.length / N_CHUNKS)).map(docChunk => {
          const jsonl = docChunk.map((doc: any) => JSON.stringify(doc)).join('\n')
          logger.info({ size: docChunk.length }, 'IMPORTING BATCH')
          return client
            .collections(collectionName)
            .documents()
            .import(jsonl, { batch_size: docChunk.length })
        }),
      )

      const failedImports = responses.map(data =>
        data
          .split('\n')
          .map((r: string) => JSON.parse(r))
          .filter((item: { success: boolean }) => item.success === false),
      ).flat()

      if (failedImports.length) {
        throw new Error(`Error indexing items ${JSON.stringify(failedImports, null, 2)}`)
      }
    } catch (err) {
      logger.error(err, 'Error importing jsonl documents')
    }
  }
}

const schemas = [collections, nfts]

class Commander {

  client: Typesense.Client
  repositories: db.Repository

  constructor(client: Typesense.Client, repositories: db.Repository) {
    this.client = client
    this.repositories = repositories
  }

  reindexNFTsByContract = async (contractAddr: string): Promise<void> => {
    const nfts = await this.repositories.nft.findAllWithRelationsByContract(contractAddr)
    const collection = await mapCollectionData('nfts', nfts, this.repositories)
    if (collection?.length) {
      await this.client.collections('nfts').documents().delete({ 'filter_by': `contractAddr:=${contractAddr}` })
      try {
        await this.client.collections('nfts').documents().import(collection, { action: 'upsert' })
      } catch (e) {
        logger.error('unable to import collection:', e)
      }
    }
  }

  erase = (): Promise<PromiseSettledResult<CollectionSchema>[]> => {
    return Promise.allSettled(
      collectionNames.map((collection) => {
        return this.client.collections(collection).delete()
      }),
    )
  }

  private _retrieveData = async (name: string, cursor?: string | string[]):
  Promise<[any[], number] | any> => {
    if (name === 'nfts') {
      const cursorContract = cursor ? cursor[0] : undefined
      const cursorId = cursor ? cursor[1] : undefined
      const data = await this.repositories
        .nft.findPageWithCollectionAndWallet(cursorContract, cursorId, 2_000_000)
      const count = parseInt(data[0].total_count)
      return [data, count]
    } else if (name === 'collections') {
      const data = await this.repositories.collection.findPageWithAnNft(cursor as string)
      return [data, parseInt(data[0].total_count)]
    }
    const data = await this.repositories[name.slice(0, -1)].findAll()
    return [data, data.length]
  }

  restore = async (): Promise<void> => {
    for (const schema of schemas) {
      await this.client.collections().create(schema as CollectionCreateSchema)
    }

    for (const name of collectionNames) {
      let retrievedCount = 0,
        totalCount = 0,
        cursor: string | any[]
      do {
        logger.info({ name }, 'COLLECTING DATA')
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [data, count] = await this._retrieveData(name, cursor)
        retrievedCount = data.length
        totalCount = count
        if (name === 'collections') {
          cursor = data[data.length - 1].contract
        } else if (name === 'nfts') {
          cursor = [data[data.length - 1].contract, data[data.length - 1].id]
        }
        logger.info({ retrievedCount, totalCount, cursor })

        logger.info({ name }, 'MAPPING DATA')
        const documents = (
          await mapCollectionData(name, data, this.repositories)
        ).filter(x => x !== undefined)

        if (documents) {
          await addDocumentsToTypesense(this.client, name, documents)
        }
      } while (retrievedCount !== totalCount)
    }
  }

  private _dropFields = (fields: string[]): { name: string; drop: boolean }[] => {
    return fields.map(field => {
      return { name: field, drop: true }
    })
  }
  update = async (collection: string, fields: string[]): Promise<void> => {
    for (const schema of schemas) {
      if (schema.name === collection) {
        const updateSchema = {
          fields: [
            ...this._dropFields(fields),
            ...schema.fields.filter(field => fields.includes(field.name)),
          ],
        }
        await this.client.collections(schema.name).update(updateSchema as CollectionUpdateSchema)
      }
    }
  }

}

export default Commander
