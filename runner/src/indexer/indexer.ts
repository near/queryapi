import { VM } from 'vm2';
import * as lakePrimitives from '@near-lake/primitives';
import { Parser } from 'node-sql-parser';
import { trace, type Span } from '@opentelemetry/api';
import VError from 'verror';

import logger from '../logger';
import LogEntry from '../indexer-meta/log-entry';
import type IndexerConfig from '../indexer-config';
import { IndexerStatus } from '../indexer-meta';
import { type IndexerMetaInterface } from '../indexer-meta/indexer-meta';
import type ContextBuilder from '../context';

interface Dependencies {
  contextBuilder: ContextBuilder
  indexerMeta: IndexerMetaInterface
  parser?: Parser
};

export interface TableDefinitionNames {
  tableName: string
  originalTableName: string
  originalColumnNames: Map<string, string>
}

export default class Indexer {
  IS_FIRST_EXECUTION: boolean = true;
  tracer = trace.getTracer('queryapi-runner-indexer');

  private readonly logger: typeof logger;
  private readonly deps: Required<Dependencies>;
  private currentStatus?: string;

  constructor (
    private readonly indexerConfig: IndexerConfig,
    deps: Dependencies,
  ) {
    this.logger = logger.child({ accountId: indexerConfig.accountId, functionName: indexerConfig.functionName, service: this.constructor.name });

    this.deps = {
      parser: new Parser(),
      ...deps
    };
  }

  async execute (
    block: lakePrimitives.Block,
  ): Promise<void> {
    this.logger.debug('Executing block', { blockHeight: block.blockHeight });

    const blockHeight: number = block.blockHeight;

    const lag = Date.now() - Math.floor(Number(block.header().timestampNanosec) / 1000000);

    const simultaneousPromises: Array<Promise<any>> = [];
    const logEntries: LogEntry[] = [];

    try {
      const runningMessage = `Running function ${this.indexerConfig.fullName()} on block ${blockHeight}, lag is: ${lag?.toString()}ms from block timestamp`;
      logEntries.push(LogEntry.systemInfo(runningMessage, blockHeight));

      const resourceCreationSpan = this.tracer.startSpan('prepare vm and context to run indexer code');
      simultaneousPromises.push(this.setStatus(IndexerStatus.RUNNING).catch((e: Error) => {
        this.logger.error('Failed to set status to RUNNING', e);
      }));
      const vm = new VM({ allowAsync: true });
      const context = this.deps.contextBuilder.buildContext(blockHeight, logEntries);

      vm.freeze(block, 'block');
      vm.freeze(lakePrimitives, 'primitives');
      vm.freeze(context, 'context');
      vm.freeze(context, 'console'); // provide console.log via context.log
      resourceCreationSpan.end();

      await this.tracer.startActiveSpan('run indexer code', async (runIndexerCodeSpan: Span) => {
        try {
          const transformedCode = this.transformIndexerFunction();
          await vm.run(transformedCode);
        } catch (e) {
          const error = e as Error;
          logEntries.push(LogEntry.systemError(`Error running IndexerFunction: ${error.message}`, blockHeight));

          throw new VError(error, 'Execution error');
        } finally {
          runIndexerCodeSpan.end();
        }
      });
      simultaneousPromises.push(this.deps.indexerMeta.updateBlockHeight(blockHeight).catch((e: Error) => {
        this.logger.error('Failed to update block height', e);
      }));
    } catch (e) {
      // TODO: Prevent unnecesary reruns of set status
      simultaneousPromises.push(await this.setStatus(IndexerStatus.FAILING).catch((e: Error) => {
        this.logger.error('Failed to set status to FAILING', e);
      }));
      throw e;
    } finally {
      const results = await Promise.allSettled([(this.deps.indexerMeta).writeLogs(logEntries), ...simultaneousPromises]);
      if (this.IS_FIRST_EXECUTION && results[0].status === 'rejected') {
        this.logger.error('Failed to write logs after executing on block:', results[0].reason);
      }
      this.IS_FIRST_EXECUTION = false;
    }
  }

  async setStatus (status: IndexerStatus): Promise<any> {
    if (this.currentStatus === status) {
      return;
    }

    this.currentStatus = status;

    // Metadata table possibly unprovisioned when called, so I am not validating indexerMeta yet
    await this.deps.indexerMeta?.setStatus(status);
  }

  private enableAwaitTransform (code: string): string {
    return `
      async function f(){
        ${code}
      };
      f();
    `;
  }

  transformIndexerFunction (): string {
    return [
      this.enableAwaitTransform,
    ].reduce((acc, val) => val(acc), this.indexerConfig.code);
  }
}
