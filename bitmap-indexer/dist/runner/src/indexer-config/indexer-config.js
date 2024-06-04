"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const log_entry_1 = require("../indexer-meta/log-entry");
class IndexerConfig {
    constructor(redisStreamKey, accountId, functionName, version, code, schema, logLevel) {
        this.redisStreamKey = redisStreamKey;
        this.accountId = accountId;
        this.functionName = functionName;
        this.version = version;
        this.code = code;
        this.schema = schema;
        this.logLevel = logLevel;
        const hash = crypto_1.default.createHash('sha256');
        hash.update(`${accountId}/${functionName}`);
        this.executorId = hash.digest('hex');
    }
    static fromStartRequest(startExecutorRequest) {
        return new IndexerConfig(startExecutorRequest.redisStream, startExecutorRequest.accountId, startExecutorRequest.functionName, parseInt(startExecutorRequest.version), startExecutorRequest.code, startExecutorRequest.schema, log_entry_1.LogLevel.INFO);
    }
    static fromObject(data) {
        return new IndexerConfig(data.redisStreamKey, data.accountId, data.functionName, data.version, data.code, data.schema, data.logLevel);
    }
    toObject() {
        return {
            redisStreamKey: this.redisStreamKey,
            accountId: this.accountId,
            functionName: this.functionName,
            version: this.version,
            code: this.code,
            schema: this.schema,
            logLevel: this.logLevel
        };
    }
    sanitizeNameForDatabase(name) {
        return name
            .replace(/[^a-zA-Z0-9]/g, '_') // Replace all non-alphanumeric characters with underscores
            .replace(/^([0-9])/, '_$1'); // Add underscore if first character is a number
    }
    fullName() {
        return `${this.accountId}/${this.functionName}`;
    }
    hasuraRoleName() {
        return this.sanitizeNameForDatabase(this.accountId);
    }
    hasuraFunctionName() {
        return this.sanitizeNameForDatabase(this.functionName);
    }
    userName() {
        return this.sanitizeNameForDatabase(this.accountId);
    }
    databaseName() {
        return this.sanitizeNameForDatabase(this.accountId);
    }
    schemaName() {
        return this.sanitizeNameForDatabase(this.fullName());
    }
}
exports.default = IndexerConfig;
