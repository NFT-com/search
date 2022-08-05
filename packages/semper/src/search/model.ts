import { entity } from '@nftcom/shared'

export type NFTDao = entity.NFT & {
  collection: entity.Collection
  wallet: entity.Wallet
}

export type CollectionDao = entity.Collection & {
  nft: entity.NFT
}