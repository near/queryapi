import { type ServerUnaryCall, type sendUnaryData, status, StatusBuilder } from '@grpc/grpc-js';

import Provisioner from '../../../provisioner';
import { ProvisioningConfig } from '../../../indexer-config/indexer-config';

import { type CheckProvisioningStatusRequest__Output } from '../../../generated/CheckProvisioningStatusRequest';
import { type DataLayerHandlers } from '../../../generated/DataLayer';
import { type ProvisionRequest__Output } from '../../../generated/ProvisionRequest';
import { type ProvisionResponse } from '../../../generated/ProvisionResponse';
import { ProvisioningStatus } from '../../../generated/ProvisioningStatus';

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

export function createDataLayerService (
  provisioner: Provisioner = new Provisioner(),
  tasks: ProvisioningTasks = {}
): DataLayerHandlers {
  return {
    CheckProvisioningStatus (call: ServerUnaryCall<CheckProvisioningStatusRequest__Output, ProvisionResponse>, callback: sendUnaryData<ProvisionResponse>): void {
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

    Provision (call: ServerUnaryCall<ProvisionRequest__Output, ProvisionResponse>, callback: sendUnaryData<ProvisionResponse>): void {
      const { accountId, functionName, schema } = call.request;

      const provisioningConfig = new ProvisioningConfig(accountId, functionName, schema);

      const task = tasks[generateTaskId(accountId, functionName)];

      if (task?.pending) {
        const exists = new StatusBuilder()
          .withCode(status.ALREADY_EXISTS)
          .withDetails('Provisioning task already exists')
          .build();
        callback(exists);

        return;
      };

      provisioner.fetchUserApiProvisioningStatus(provisioningConfig).then((isProvisioned) => {
        if (isProvisioned) {
          const exists = new StatusBuilder()
            .withCode(status.ALREADY_EXISTS)
            .withDetails('Provisioning task has already completed')
            .build();
          callback(exists);

          return;
        }

        tasks[generateTaskId(accountId, functionName)] = new ProvisioningTask(provisioner.provisionUserApi(provisioningConfig));

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
