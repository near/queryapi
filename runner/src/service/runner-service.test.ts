import type StreamHandler from '../stream-handler/stream-handler';
import getRunnerService from './runner-service';

describe('Runner gRPC Service', () => {
  let genericStreamHandlerType: typeof StreamHandler;
  beforeEach(() => {
    genericStreamHandlerType = jest.fn().mockImplementation(() => {
      return { updateIndexerConfig: jest.fn() };
    });
  });

  it('starts a stream', () => {
    const service = getRunnerService(genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const request = {
      request: {
        streamId: 'test-stream-id',
      }
    } as unknown as any;
    service.StartStream(request, mockCallback);
    // expect(genericStreamHandlerType).toHaveBeenCalledWith(undefined, undefined);
    expect(mockCallback).toHaveBeenCalledWith({}, { streamId: 'test-stream-id' });
  });
});
