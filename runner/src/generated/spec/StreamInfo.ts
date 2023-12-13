// Original file: protos/runner.proto

import type { Long } from '@grpc/proto-loader';

export interface StreamInfo {
  'streamId'?: (string);
  'startBlockHeight'?: (number | string | Long);
  'indexerName'?: (string);
  'chainId'?: (string);
  'status'?: (string);
}

export interface StreamInfo__Output {
  'streamId': (string);
  'startBlockHeight': (string);
  'indexerName': (string);
  'chainId': (string);
  'status': (string);
}
