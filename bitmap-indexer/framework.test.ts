import { describe, it, expect } from "@jest/globals";
import IndexerProxy from '../runner/src/indexer-proxy/indexer-proxy';
import { LogLevel } from "../runner/src/indexer-meta/log-entry";
import { newDb, DataType } from "pg-mem";
import PgClient from '../runner/src/pg-client';

describe('framework', () => {
    it('Run framework on three blocks', async () => {
        console.log('Running framework on three blocks');
        const db = newDb();
        const bitmapIndexer = IndexerProxy.from({
            accountId: 'someone.near',
            indexerName: 'bitmap_indexer',
            logLevel: LogLevel.INFO,
            logic: 'code.js',
            schema: 'schema.sql',
            filter: '*'
        }, db);

        // Does work
        const schema = db.createSchema('someone_near');

        // Does not work
        schema.query(`CREATE TABLE
        "receivers" (
          "id" BIGSERIAL NOT NULL PRIMARY KEY,
          "receiver" TEXT NOT NULL
        );`);
        for (const table of schema.listTables()) {
            console.log('table', table);
        }

        // Does work
        schema.declareTable({
            name: 'receivers',
            fields: [{ name: 'id', type: DataType.bigint }, { name: 'receiver', type: DataType.text }],
            constraints: [{ type: 'primary key',  constraintName: { name: 'primary_key_id'} , columns: [{ name: 'id' } ] }]
        });
        console.log(schema.getTable('receivers'));

        // await bitmapIndexer.runOn([115162795, 115151417, 115130289]);
        // const {receiver_id} = (await bitmapIndexer.context.db.Receivers.select({receiver: 'agilevoyce4597263841.u.arkana.near'}))[0];
        // const {first_block_height} = (await bitmapIndexer.context.db.ActionsIndex.select({receiver_id: receiver_id}))[0];
        
        // expect(first_block_height).toBe(115162795);
        // agilevoyce4597263841.u.arkana.near; amplebramble4096123465.u.arkana.near; aurora
    });
});