import { type ServerUnaryCall, type sendUnaryData, type UntypedHandleCall } from '@grpc/grpc-js';

import { type CheckProvisioningStatusRequest__Output } from '../../../generated/CheckProvisioningStatusRequest';
import { type DataLayerHandlers } from '../../../generated/DataLayer';
import { type ProvisionRequest__Output } from '../../../generated/ProvisionRequest';
import { type ProvisionResponse } from '../../../generated/ProvisionResponse';

export class DataLayerService implements DataLayerHandlers {
  [name: string]: UntypedHandleCall;

  CheckProvisioningStatus (_call: ServerUnaryCall<CheckProvisioningStatusRequest__Output, ProvisionResponse>, _callback: sendUnaryData<ProvisionResponse>): void {
    throw new Error('CheckProvisioningStatus not implemented.');
  }

  Provision (_call: ServerUnaryCall<ProvisionRequest__Output, ProvisionResponse>, _callback: sendUnaryData<ProvisionResponse>): void {
    throw new Error('Provision not implemented.');
  }
}
