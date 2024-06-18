import { type ServerUnaryCall, type sendUnaryData, status, StatusBuilder } from '@grpc/grpc-js';

import Provisioner from '../../../provisioner';
import { ProvisioningConfig } from '../../../indexer-config/indexer-config';
import parentLogger from '../../../logger';

import { type CheckProvisioningTaskStatusRequest__Output } from '../../../generated/data_layer/CheckProvisioningTaskStatusRequest';
import { type DataLayerHandlers } from '../../../generated/data_layer/DataLayer';
import { type ProvisionRequest__Output } from '../../../generated/data_layer/ProvisionRequest';
import { type ProvisionResponse } from '../../../generated/data_layer/ProvisionResponse';
import { ProvisioningStatus } from '../../../generated/data_layer/ProvisioningStatus';

export class ProvisioningTask {
  public failed: boolean;
  public pending: boolean;
  public completed: boolean;

  constructor (public readonly promise: Promise<void>) {
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

type ProvisioningTasks = Record<string, ProvisioningTask>;

const generateTaskId = (accountId: string, functionName: string): string => `${accountId}:${functionName}`;

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
  tasks: ProvisioningTasks = {}
): DataLayerHandlers {
  return {
    CheckProvisioningTaskStatus (call: ServerUnaryCall<CheckProvisioningTaskStatusRequest__Output, ProvisionResponse>, callback: sendUnaryData<ProvisionResponse>): void {
      const { accountId, functionName } = call.request;

      const task = tasks[generateTaskId(accountId, functionName)];

      if (!task) {
        const notFound = new StatusBuilder()
          .withCode(status.NOT_FOUND)
          .withDetails('Provisioning task does not exist')
          .build();
        callback(notFound);

        return;
      }

      if (task.completed) {
        callback(null, { status: ProvisioningStatus.COMPLETE });
        return;
      }

      if (task.failed) {
        callback(null, { status: ProvisioningStatus.FAILED });
        return;
      }

      callback(null, { status: ProvisioningStatus.PENDING });
    },

    StartProvisioningTask (call: ServerUnaryCall<ProvisionRequest__Output, ProvisionResponse>, callback: sendUnaryData<ProvisionResponse>): void {
      const { accountId, functionName, schema } = call.request;

      const provisioningConfig = new ProvisioningConfig(accountId, functionName, schema);

      const logger = createLogger(provisioningConfig);

      const task = tasks[generateTaskId(accountId, functionName)];

      if (task) {
        const exists = new StatusBuilder()
          .withCode(status.ALREADY_EXISTS)
          .withDetails('Provisioning task already exists')
          .build();
        callback(exists);

        return;
      };

      logger.info('Starting provisioning task');

      provisioner.fetchUserApiProvisioningStatus(provisioningConfig).then((isProvisioned) => {
        if (isProvisioned) {
          callback(null, { status: ProvisioningStatus.COMPLETE });

          return;
        }

        logger.info('Provisioning Data Layer');

        tasks[generateTaskId(accountId, functionName)] = new ProvisioningTask(
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

        callback(null, { status: ProvisioningStatus.PENDING });
      }).catch((error) => {
        const internalError = new StatusBuilder()
          .withCode(status.INTERNAL)
          .withDetails(error.message)
          .build();
        callback(internalError);
      });
    }
  };
}
