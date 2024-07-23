import crypto from 'crypto';
import { type StartExecutorRequest__Output } from '../generated/runner/StartExecutorRequest';
import { LogLevel } from '../indexer-meta/log-entry';

class BaseConfig {
  constructor (
    public readonly accountId: string,
    public readonly functionName: string,
  ) {}

  fullName (): string {
    return `${this.accountId}/${this.functionName}`;
  }
}

export class ProvisioningConfig extends BaseConfig {
  constructor (
    public readonly accountId: string,
    public readonly functionName: string,
    public readonly schema: string
  ) {
    super(accountId, functionName);
  }

  private sanitizeNameForDatabase (name: string): string {
    return name
      .replace(/[^a-zA-Z0-9]/g, '_') // Replace all non-alphanumeric characters with underscores
      .replace(/^([0-9])/, '_$1'); // Add underscore if first character is a number
  }

  hasuraRoleName (): string {
    return this.sanitizeNameForDatabase(this.accountId);
  }

  hasuraFunctionName (): string {
    return this.sanitizeNameForDatabase(this.functionName);
  }

  userName (): string {
    return this.sanitizeNameForDatabase(this.accountId);
  }

  databaseName (): string {
    return this.sanitizeNameForDatabase(this.accountId);
  }

  schemaName (): string {
    return this.sanitizeNameForDatabase(this.fullName());
  }
}

interface LocalIndexerConfigData {
  accountId: string
  functionName: string
  code: string
  schema: string
  logLevel: LogLevel
}

export class LocalIndexerConfig extends BaseConfig {
  constructor (
    public readonly accountId: string,
    public readonly functionName: string,
    public readonly code: string,
    public readonly schema: string,
    public readonly logLevel: LogLevel
  ) {
    super(accountId, functionName);
  }

  static fromObject (data: LocalIndexerConfigData): LocalIndexerConfig {
    return new LocalIndexerConfig(
      data.accountId,
      data.functionName,
      data.code,
      data.schema,
      data.logLevel
    );
  }
}

interface IndexerConfigData {
  redisStreamKey: string
  accountId: string
  functionName: string
  version: number
  code: string
  schema: string
  logLevel: LogLevel
}

export default class IndexerConfig extends ProvisioningConfig {
  public readonly executorId: string;

  constructor (
    public readonly redisStreamKey: string,
    public readonly accountId: string,
    public readonly functionName: string,
    public readonly version: number,
    public readonly code: string,
    public readonly schema: string,
    public readonly logLevel: LogLevel
  ) {
    super(accountId, functionName, schema);
    const hash = crypto.createHash('sha256');
    hash.update(`${accountId}/${functionName}`);
    this.executorId = hash.digest('hex');
  }

  static fromStartRequest (startExecutorRequest: StartExecutorRequest__Output): IndexerConfig {
    return new IndexerConfig(
      startExecutorRequest.redisStream,
      startExecutorRequest.accountId,
      startExecutorRequest.functionName,
      parseInt(startExecutorRequest.version),
      startExecutorRequest.code,
      startExecutorRequest.schema,
      LogLevel.INFO
    );
  }

  static fromObject (data: IndexerConfigData): IndexerConfig {
    return new IndexerConfig(
      data.redisStreamKey,
      data.accountId,
      data.functionName,
      data.version,
      data.code,
      data.schema,
      data.logLevel
    );
  }

  toObject (): IndexerConfigData {
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
}
