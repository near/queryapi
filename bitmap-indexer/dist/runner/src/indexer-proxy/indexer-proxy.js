"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const indexer_config_1 = __importDefault(require("../indexer-config/indexer-config"));
class IndexerProxy {
    constructor(config, db) {
        this.db = db;
        this.indexerConfig = new indexer_config_1.default('', config.accountId, config.indexerName, 0, config.logic, config.schema, config.logLevel);
        this.pgClient = {
            end: () => { },
            query: async (schemaName) => {
                var _a;
                const schema = db.getSchema(schemaName);
                return (_a = schema === null || schema === void 0 ? void 0 : schema.listTables()) !== null && _a !== void 0 ? _a : [];
            }
        };
    }
    static from(indexerConfig, db) {
        return new IndexerProxy(indexerConfig, db);
    }
    async runOn(blocks) {
        console.log('Running indexer on blocks', blocks);
    }
    async executeOnBlock(block) {
    }
    async provision() {
        // const userName = this.indexerConfig.userName();
        // const databaseName = this.indexerConfig.databaseName();
        // const schemaName = this.indexerConfig.schemaName();
        // Create DB if new (public DB)
        // Create schema and tables if new
    }
}
exports.default = IndexerProxy;
