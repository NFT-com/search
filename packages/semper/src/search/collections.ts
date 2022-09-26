import { BigNumber } from 'ethers'

import { entity } from '@nftcom/shared'

import { CollectionDao, NFTDao } from './model'

const PROFILE_CONTRACT = process.env.TYPESENSE_HOST.startsWith('dev') ?
  '0x9Ef7A34dcCc32065802B1358129a226B228daB4E' : '0x98ca78e89Dd1aBE48A53dEe5799F24cC1A462F2D'

const GK_CONTRACT = process.env.TYPESENSE_HOST.startsWith('dev') ?
  '0xe0060010c2c81A817f4c52A9263d4Ce5c5B66D55' : '0x8fB5a7894AB461a59ACdfab8918335768e411414'

export const collectionNames = ['collections', 'nfts']

const getRandomFloat = (min, max, decimals): number => {
  const str = (Math.random() * (max - min) + min).toFixed(decimals)

  return parseFloat(str)
}

const calculateCollectionScore = (collection: CollectionDao): number => {
  const officialVal = collection.isOfficial ? 1 : 0
  const nftcomVal = [PROFILE_CONTRACT, GK_CONTRACT].includes(collection.contract) ? 1000000 : 0
  return officialVal + nftcomVal
}
export const mapCollectionData = (
  collectionName: string,
  data: any[],
): entity.BaseEntity[] => {
  let result: any[]
  switch (collectionName) {
  case 'collections':
    result = data.filter((collection: CollectionDao) => {
      return !collection.isSpam
    }).map((collection: CollectionDao) => {
      return {
        id: collection.id,
        contractAddr: collection.contract,
        contractName: collection.name,
        chain: collection.chainId,
        description: collection.description || '',
        floor: process.env.TYPESENSE_HOST.startsWith('prod') ? 0.0 : getRandomFloat(0, 5, 2),
        nftType: collection.nft?.type || '',
        score: calculateCollectionScore(collection),
      }
    })
    break
  case 'nfts':
    result = data.filter((nft: NFTDao) => {
      return nft.collection && !nft.collection.isSpam
    }).map((nft: NFTDao) => {
      const tokenId = BigNumber.from(nft.tokenId).toString()
      let traits = []
      if (nft.metadata.traits.length < 100) {
        traits = nft.metadata.traits.map((trait) => {
          return {
            type: trait.type,
            value: `${trait.value}`,
          }
        })
      }
      return {
        id: nft.id,
        nftName: nft.metadata.name || `${nft.collection?.name + ' '|| ''}#${tokenId}`,
        nftType: nft.type,
        tokenId,
        traits,
        imageURL: nft.metadata.imageURL,
        ownerAddr: nft.wallet.address,
        chain: nft.wallet.chainName,
        contractName: nft.collection?.name || '',
        contractAddr: nft.contract,
        marketplace: process.env.TYPESENSE_HOST.startsWith('prod') ? '' : 'OpenSea',
        listingType: '',
        listedPx: process.env.TYPESENSE_HOST.startsWith('prod') ? 0.0 : getRandomFloat(0.3, 2, 2),
        currency: process.env.TYPESENSE_HOST.startsWith('prod') ? '' : 'ETH',
        status: '',
        isProfile: nft.contract === PROFILE_CONTRACT,
      }
    })
    break
  default:
    break
  }
  return result
}
