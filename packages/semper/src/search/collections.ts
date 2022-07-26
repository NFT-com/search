import { BigNumber } from 'ethers'

import { entity } from '@nftcom/shared'

import { NFTDao, ProfileDao } from './model'

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
    result = data.map((collection: entity.Collection) => {
      return {
        id: collection.id,
        contractAddr: collection.contract,
        contractName: collection.name,
        chain: collection.chainId,
        description: '',
        floor: getRandomFloat(0, 5, 2),
      }
    })
    break
  case 'nfts':
    result = data.map((nft: NFTDao) => {
      const traits = nft.metadata.traits.map((trait) => {
        return `${trait.type}:${trait.value}`
      })
      return {
        id: nft.id,
        contractAddr: nft.contract,
        tokenId: BigNumber.from(nft.tokenId).toString(),
        nftName: nft.metadata.name,
        nftType: nft.type,
        listingType: '',
        chain: nft.wallet.chainName,
        status: '',
        marketplace: 'OpenSea',
        contractName: nft.collection?.name || '',
        imageURL: nft.metadata.imageURL,
        listedPx: getRandomFloat(0.3, 2, 2),
        currency: 'ETH',
        traits,
      }
    })
    break
  case 'profiles':
    result = data.map((profile: ProfileDao) => {
      return {
        id: profile.id,
        url: profile.url,
        ownerAddress: profile.wallet?.address,
        photoURL: profile.photoURL,
      }
    })
    break
  case 'wallets':
    result = data.map((wallet: entity.Wallet) => {
      return {
        id: wallet.id,
        chain: wallet.network,
        address: wallet.address,
      }
    })
    break
  default:
    break
  }
  return result
}
