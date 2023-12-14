// Original file: protos/runner.proto


export interface StartStreamRequest {
  'streamId'?: (string);
  'redisStream'?: (string);
  'indexerConfig'?: (string);
}

export interface StartStreamRequest__Output {
  'streamId': (string);
  'redisStream': (string);
  'indexerConfig': (string);
}
