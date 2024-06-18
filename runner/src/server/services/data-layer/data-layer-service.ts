import crypto from 'crypto';

import { type ServerUnaryCall, type sendUnaryData, status, StatusBuilder } from '@grpc/grpc-js';

import Provisioner from '../../../provisioner';
import { ProvisioningConfig } from '../../../indexer-config/indexer-config';
import parentLogger from '../../../logger';

import { type GetTaskStatusRequest__Output } from '../../../generated/data_layer/GetTaskStatusRequest';
import { type GetTaskStatusResponse } from '../../../generated/data_layer/GetTaskStatusResponse';
import { type DataLayerHandlers } from '../../../generated/data_layer/DataLayer';
import { type StartTaskResponse } from '../../../generated/data_layer/StartTaskResponse';
import { type ProvisionRequest__Output } from '../../../generated/data_layer/ProvisionRequest';
import { TaskStatus } from '../../../generated/data_layer/TaskStatus';

export class AsyncTask {
  public failed: boolean;
  public pending: boolean;
  public completed: boolean;

  constructor (
    public readonly promise: Promise<void>
  ) {
    promise.then(() => {
      this.completed = true;
    }).catch((error) => {
      this.failed = true;
      return error;
    }).finally(() => {
      this.pending = false;
    });

    this.failed = false;
    this.pending = true;
    this.completed = false;
  }
}

type AsyncTasks = Record<string, AsyncTask | undefined>;

const hash = (...args: string[]): string => {
  const hash = crypto.createHash('sha256');
  hash.update(args.join(':'));
  return hash.digest('hex');
};

const createLogger = (config: ProvisioningConfig): typeof parentLogger => {
  const logger = parentLogger.child({
    accountId: config.accountId,
    functionName: config.functionName,
    service: 'DataLayerService'
  });

  return logger;
};

export function createDataLayerService (
  provisioner: Provisioner = new Provisioner(),
  tasks: AsyncTasks = {}
): DataLayerHandlers {
  return {
    GetTaskStatus (call: ServerUnaryCall<GetTaskStatusRequest__Output, GetTaskStatusResponse>, callback: sendUnaryData<GetTaskStatusResponse>): void {
      const task = tasks[call.request.taskId];

      if (!task) {
        const notFound = new StatusBuilder()
          .withCode(status.NOT_FOUND)
          .withDetails('Provisioning task does not exist')
          .build();
        callback(notFound);

        return;
      }

      if (task.completed) {
        callback(null, { status: TaskStatus.COMPLETE });
        return;
      }

      if (task.failed) {
        callback(null, { status: TaskStatus.FAILED });
        return;
      }

      callback(null, { status: TaskStatus.PENDING });
    },

    StartProvisioningTask (call: ServerUnaryCall<ProvisionRequest__Output, StartTaskResponse>, callback: sendUnaryData<StartTaskResponse>): void {
      const { accountId, functionName, schema } = call.request;

      const provisioningConfig = new ProvisioningConfig(accountId, functionName, schema);

      const logger = createLogger(provisioningConfig);

      const taskId = hash(accountId, functionName, schema);

      const task = tasks[taskId];

      if (task) {
        const exists = new StatusBuilder()
          .withCode(status.ALREADY_EXISTS)
          .withDetails('Provisioning task already exists')
          .build();
        callback(exists);

        return;
      };

      logger.info('Starting provisioning task');

      tasks[taskId] = new AsyncTask(
        provisioner
          .provisionUserApi(provisioningConfig)
          .then(() => {
            logger.info('Successfully provisioned Data Layer');
          })
          .catch((err) => {
            logger.error('Failed to provision Data Layer', err);
            throw err;
          })
      );

      callback(null, { taskId });
    }
  };
}
