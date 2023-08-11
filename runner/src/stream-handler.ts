import Indexer from './indexer';
import RedisClient from './redis-client';
import * as metrics from './metrics';

const indexer = new Indexer('mainnet');

export default class StreamHandler {
  private readonly errors: Error[] = [];
  private process = true;

  constructor (
    public readonly indexerName: string,
    private readonly redis: RedisClient = new RedisClient(),
  ) {}

  start (): void {
    this.processStream(this.indexerName).catch(console.error);
  }

  stop (): void {
    // expose 'up' metric
    this.process = false;
  }

  private async runFunction (indexerName: string, blockHeight: string): Promise<void> {
    const { account_id: accountId, function_name: functionName, code, schema } = await this.redis.getIndexerData(
      indexerName,
    );

    const functions = {
      [indexerName]: {
        account_id: accountId,
        function_name: functionName,
        code,
        schema,
        provisioned: false,
      },
    };

    await indexer.runFunctions(Number(blockHeight), functions, false, {
      provision: true,
    });
  };

  private async processStream (indexerName: string): Promise<void> {
    while (this.process) {
      try {
        const startTime = performance.now();

        const lastProcessedId = await this.redis.getLastProcessedId(indexerName);
        const messages = await this.redis.getMessagesFromStream(
          indexerName,
          lastProcessedId,
          1,
        );

        if (messages == null) {
          continue;
        }

        const [{ id, message }] = messages;

        await this.runFunction(indexerName, message.block_height);

        await this.redis.setLastProcessedId(indexerName, id);

        const endTime = performance.now();

        metrics.EXECUTION_DURATION.labels({ indexer: indexerName }).set(endTime - startTime);

        const unprocessedMessages = await this.redis.getUnprocessedMessages(indexerName, lastProcessedId);
        metrics.UNPROCESSED_STREAM_MESSAGES.labels({ indexer: indexerName }).set(unprocessedMessages?.length ?? 0);

        console.log(`Success: ${indexerName}`);
      } catch (err) {
        this.errors.push(err as Error);
        console.log(`Failed: ${indexerName}`, err);
      }
    }

    // expose stopped state to user: Indexer.setState('error');
    console.log(`Stopped ${indexerName}`);
  };

  version (): string {
    return 'block height';
  }

  healthy (): boolean {
    // if 5 errros on same block
    return this.errors.length < 5;
  }
}
