import crypto from 'crypto';
import { type StartExecutorRequest__Output } from '../generated/runner/StartExecutorRequest';
import { LogLevel } from '../indexer-meta/log-entry';

export default class IndexerConfig {
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

  private enableAwaitTransform (code: string): string {
    return `
      async function f(){
        ${code}
      };
      f();
    `;
  }

  private transformIndexerFunction (code: string): string {
    return [
      this.enableAwaitTransform,
    ].reduce((acc, val) => val(acc), code);
  }

  private sanitizeNameForDatabase (name: string): string {
    // TODO: Add underscore for accounts with invalid starting character
    return name.replace(/[^a-zA-Z0-9]/g, '_');
  }

  fullName (): string {
    return `${this.accountId}/${this.functionName}`;
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

  transformedCode (): string {
    return this.transformIndexerFunction(this.code);
  }
}
