# S.E.M.P.E.R.

Search Engine Maintenance, Provisioning, Erasing, and Restoring

Please see [Notion - Typesense-Website-Search](https://www.notion.so/immutableholdings/Typesense-Website-Search-f8d2656e67d242659f423882042228e0) for details on our use of Typesense.

## Dependencies

This project depends on `NFT-backend/packages/shared`, be sure it has been built before running:

`cd ../../../shared && npm run build`

## Building

This project uses TypeScript and must be transpiled before running:

`npm run build`

## Running

For convenience, `package.json` contains a `start` script to run the commands to clear, rebuild, and insert data into Typesense.

Remember to set up a tunnel if connecting prod. Also, some environment variables may need to be set:
- TYPESENSE_HOST
- TYPESENSE_API_KEY
- DB_HOST
- DB_PORT
- DB_USE_SSL

`npm start`

or

`TYPESENSE_HOST=dev-typesense.nft.com TYPESENSE_API_KEY=F45LvXmQz7Vtu2tgUdEmpPVxY7dVd7K1uXH8N9iMnlV8LW7N DB_HOST=dev-main.cluster-clmsk3iud7e0.us-east-1.rds.amazonaws.com DB_PORT=5432 DB_USE_SSL=true npm start`

if running a typesense docker container locally:

`TYPESENSE_HOST=localhost TYPESENSE_PORT=8108 TYPESENSE_PROTOCOL=http TYPESENSE_API_KEY=Hu52dwsas2AdxdE DB_HOST=dev-main.cluster-clmsk3iud7e0.us-east-1.rds.amazonaws.com DB_PORT=5432 DB_USE_SSL=true npm start`

## Typesense Schemas

Schema files are located in `src/search/schemas/`. Changes to existing files will be picked up automatically on the next run.

When adding a schema file, also import the file in `src/search/commander.ts` and add the new schema to the `const schemas = [ ... ]` array.
