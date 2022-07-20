export const sharedOutputFileName = 'shared-out.json'

export type SharedInfraOutput = {
  assetBucket: string
  assetBucketRole: string
  dbHost: string
  deployAppBucket: string
  publicSubnets: string[]
  redisHost: string
  vpcId: string
  typesenseSGId: string
  webSGId: string
  webEcsSGId: string
  gqlECRRepo: string
}
