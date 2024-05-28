import { type ServerUnaryCall, type sendUnaryData } from '@grpc/grpc-js';

import Provisioner from '../../../provisioner';
import IndexerConfig from '../../../indexer-config';

import { type CheckProvisioningStatusRequest__Output } from '../../../generated/CheckProvisioningStatusRequest';
import { type DataLayerHandlers } from '../../../generated/DataLayer';
import { type ProvisionRequest__Output } from '../../../generated/ProvisionRequest';
import { type ProvisionResponse } from '../../../generated/ProvisionResponse';
import { ProvisioningStatus } from '../../../generated/ProvisioningStatus';

export function createDataLayerService (
  provisioner: Provisioner = new Provisioner()
): DataLayerHandlers {
  return {
    CheckProvisioningStatus (_call: ServerUnaryCall<CheckProvisioningStatusRequest__Output, ProvisionResponse>, callback: sendUnaryData<ProvisionResponse>): void {
      console.log('CheckProvisioningStatus called');

      callback(null, { status: ProvisioningStatus.PENDING });
    },

    Provision (call: ServerUnaryCall<ProvisionRequest__Output, ProvisionResponse>, callback: sendUnaryData<ProvisionResponse>): void {
      console.log('Provision called');

      const indexerConfig = new IndexerConfig(
        'redisStreamKey',
        call.request.accountId,
        call.request.functionName,
        0,
        'code',
        call.request.schema,
        5
      );

      provisioner.provisionUserApi(indexerConfig).then(() => {
        callback(null, { status: ProvisioningStatus.COMPLETE });
      }).catch((error) => {
        callback(error, null);
      });
    }
  };
}
