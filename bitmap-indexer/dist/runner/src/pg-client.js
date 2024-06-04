"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const pg_format_1 = __importDefault(require("pg-format"));
const logger_1 = __importDefault(require("./logger"));
class PgClient {
    constructor(connectionParams, poolConfig, PgPool, pgFormat, onError) {
        var _a;
        if (poolConfig === void 0) { poolConfig = { max: Number((_a = process.env.MAX_PG_POOL_SIZE) !== null && _a !== void 0 ? _a : 10), idleTimeoutMillis: 3000 }; }
        if (PgPool === void 0) { PgPool = pg_1.Pool; }
        if (pgFormat === void 0) { pgFormat = pg_format_1.default; }
        if (onError === void 0) { onError = (err) => { this.logger.error(err); }; }
        this.logger = logger_1.default.child({ service: 'PgClient' });
        this.pgPool = new PgPool({
            user: connectionParams.user,
            password: connectionParams.password,
            host: connectionParams.host,
            port: Number(connectionParams.port),
            database: connectionParams.database,
            ...poolConfig,
        });
        this.pgPool.on('error', onError);
        this.format = pgFormat;
    }
    async end() {
        await this.pgPool.end();
    }
    async query(query, params = []) {
        // Automatically manages client connections to pool
        return await this.pgPool.query(query, params);
    }
}
exports.default = PgClient;
