import { BigNumber } from 'ethers'

import { entity } from '@nftcom/shared'

import { CollectionDao, NFTDao } from './model'

export const collectionNames = ['collections', 'nfts', 'profiles', 'wallets']

const getRandomFloat = (min, max, decimals): number => {
  const str = (Math.random() * (max - min) + min).toFixed(decimals)

  return parseFloat(str)
}

export const mapCollectionData = (
  collectionName: string,
  data: any[],
): entity.BaseEntity[] => {
  let result: any[]
  switch (collectionName) {
  case 'collections':
    result = data.map((collection: CollectionDao) => {
      return {
        id: collection.id,
        contractAddr: collection.contract,
        contractName: collection.name,
        chain: collection.chainId,
        description: '',
        floor: getRandomFloat(0, 5, 2),
        nftType: collection.nft?.type || '',
      }
    })
    break
  case 'nfts':
    result = data.map((nft: NFTDao) => {
      const tokenId = BigNumber.from(nft.tokenId).toString()
      const traits = nft.metadata.traits.map((trait) => {
        return `${trait.type}:${trait.value}`
      })
      const profileContract = process.env.TYPESENSE_HOST.startsWith('dev') ?
        '0x9Ef7A34dcCc32065802B1358129a226B228daB4E' : '0x98ca78e89Dd1aBE48A53dEe5799F24cC1A462F2D'
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
        marketplace: 'OpenSea',
        listingType: '',
        listedPx: getRandomFloat(0.3, 2, 2),
        currency: 'ETH',
        status: '',
        isProfile: nft.contract === profileContract,
      }
    })
    break
  default:
    break
  }
  return result
}