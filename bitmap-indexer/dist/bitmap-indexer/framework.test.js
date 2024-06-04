"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const indexer_proxy_1 = __importDefault(require("../runner/src/indexer-proxy/indexer-proxy"));
const log_entry_1 = require("../runner/src/indexer-meta/log-entry");
const pg_mem_1 = require("pg-mem");
(0, globals_1.describe)('framework', () => {
    (0, globals_1.it)('Run framework on three blocks', async () => {
        const db = (0, pg_mem_1.newDb)();
        const bitmapIndexer = indexer_proxy_1.default.from({
            accountId: 'someone.near',
            indexerName: 'bitmap_indexer',
            logLevel: log_entry_1.LogLevel.INFO,
            logic: 'code.js',
            schema: 'schema.sql',
            filter: '*'
        }, db);
        db.createSchema('someone_near');
        const schema = db.getSchema('someone_near');
        schema.query('CREATE TABLE actions (receiver_id INT, receiver TEXT, first_block_height INT);');
        for (const table of schema.listTables()) {
            console.log(table);
        }
        // await bitmapIndexer.runOn([115162795, 115151417, 115130289]);
        // const {receiver_id} = (await bitmapIndexer.context.db.Receivers.select({receiver: 'agilevoyce4597263841.u.arkana.near'}))[0];
        // const {first_block_height} = (await bitmapIndexer.context.db.ActionsIndex.select({receiver_id: receiver_id}))[0];
        // expect(first_block_height).toBe(115162795);
        // agilevoyce4597263841.u.arkana.near; amplebramble4096123465.u.arkana.near; aurora
    });
});
