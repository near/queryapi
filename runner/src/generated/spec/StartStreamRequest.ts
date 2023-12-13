// Original file: protos/runner.proto

import type { Long } from '@grpc/proto-loader';

export interface StartStreamRequest {
  'startBlockHeight'?: (number | string | Long);
  'indexerConfig'?: (string);
  'streamId'?: (string);
}

export interface StartStreamRequest__Output {
  'startBlockHeight': (string);
  'indexerConfig': (string);
  'streamId': (string);
}
