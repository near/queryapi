import { type ServerUnaryCall, type sendUnaryData, status, StatusBuilder } from '@grpc/grpc-js';

import Provisioner from '../../../provisioner';
import IndexerConfig from '../../../indexer-config';

import { type CheckProvisioningStatusRequest__Output } from '../../../generated/CheckProvisioningStatusRequest';
import { type DataLayerHandlers } from '../../../generated/DataLayer';
import { type ProvisionRequest__Output } from '../../../generated/ProvisionRequest';
import { type ProvisionResponse } from '../../../generated/ProvisionResponse';
import { ProvisioningStatus } from '../../../generated/ProvisioningStatus';

class ProvisioningTask {
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

export function createDataLayerService (
  provisioner: Provisioner = new Provisioner(),
  tasks: ProvisioningTasks = {}
): DataLayerHandlers {
  return {
    CheckProvisioningStatus (call: ServerUnaryCall<CheckProvisioningStatusRequest__Output, ProvisionResponse>, callback: sendUnaryData<ProvisionResponse>): void {
      const { accountId, functionName } = call.request;
      const task = tasks[`${accountId}/${functionName}`];

      if (!task) {
        const notFound = new StatusBuilder().withCode(status.NOT_FOUND).withDetails('Provisioning task does not exist').build();
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
      // TODO exit if already provisioned

      const indexerConfig = new IndexerConfig(
        'redisStreamKey',
        call.request.accountId,
        call.request.functionName,
        0,
        'code',
        call.request.schema,
        5
      );

      tasks[indexerConfig.fullName()] = new ProvisioningTask(provisioner.provisionUserApi(indexerConfig));

      callback(null, { status: ProvisioningStatus.PENDING });
    }
  };
}
