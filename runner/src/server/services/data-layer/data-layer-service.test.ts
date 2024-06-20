import { type ServerUnaryCall, status } from '@grpc/grpc-js';

import { createDataLayerService, type AsyncTask } from './data-layer-service';
import { TaskStatus } from '../../../generated/data_layer/TaskStatus';
import type Provisioner from '../../../provisioner';

describe('DataLayerService', () => {
  describe('GetTaskStatus', () => {
    it('should return NOT_FOUND if the task does not exist', (done) => {
      const call = {
        request: { taskId: 'id' }
      } as unknown as ServerUnaryCall<any, any>;

      const callback = (error: any): void => {
        expect(error.code).toBe(status.NOT_FOUND);
        expect(error.details).toBe('Provisioning task does not exist');
        done();
      };

      createDataLayerService().GetTaskStatus(call, callback);
    });

    it('should return PENDING if the task is pending', (done) => {
      const tasks = {
        id: { pending: true, completed: false, failed: false } as unknown as AsyncTask
      };
      const call = {
        request: { taskId: 'id' }
      } as unknown as ServerUnaryCall<any, any>;
      const callback = (_error: any, response: any): void => {
        expect(response.status).toBe(TaskStatus.PENDING);
        done();
      };

      createDataLayerService(undefined, tasks).GetTaskStatus(call, callback);
    });

    it('should return COMPLETE if the task is completed', (done) => {
      const tasks = {
        id: { pending: false, completed: true, failed: false } as unknown as AsyncTask
      };
      const call = {
        request: { taskId: 'id' }
      } as unknown as ServerUnaryCall<any, any>;
      const callback = (_error: any, response: any): void => {
        expect(response.status).toBe(TaskStatus.COMPLETE);
        done();
      };

      createDataLayerService(undefined, tasks).GetTaskStatus(call, callback);
    });

    it('should return FAILED if the task has failed', (done) => {
      const tasks = {
        id: { pending: false, completed: false, failed: true } as unknown as AsyncTask
      };
      const call = {
        request: { taskId: 'id' }
      } as unknown as ServerUnaryCall<any, any>;
      const callback = (_error: any, response: any): void => {
        expect(response.status).toBe(TaskStatus.FAILED);
        done();
      };

      createDataLayerService(undefined, tasks).GetTaskStatus(call, callback);
    });
  });

  describe('StartProvisioningTask', () => {
    it('should return the current task if it exists', (done) => {
      const tasks: Record<any, any> = {
        '8291150845651941809f8f3db28eeb7fd8acdfeb422cb07c10178020070836b8': { pending: false, completed: true, failed: false } as unknown as AsyncTask
      };
      const call = {
        request: { accountId: 'testAccount', functionName: 'testFunction', schema: 'schema' }
      } as unknown as ServerUnaryCall<any, any>;
      const callback = (_error: any, response: any): void => {
        expect(tasks[response.taskId]).toBeDefined();
        expect(tasks[response.taskId].completed).toBe(true);
        done();
      };

      createDataLayerService(undefined, tasks).StartProvisioningTask(call, callback);
    });

    it('should start a new provisioning task', (done) => {
      const tasks: Record<any, any> = {};
      const provisioner = {
        provisionUserApi: jest.fn().mockResolvedValue(null)
      } as unknown as Provisioner;
      const call = {
        request: { accountId: 'testAccount', functionName: 'testFunction', schema: 'testSchema' }
      } as unknown as ServerUnaryCall<any, any>;
      const callback = (_error: any, response: any): void => {
        expect(tasks[response.taskId]).toBeDefined();
        expect(tasks[response.taskId].pending).toBe(true);
        done();
      };

      createDataLayerService(provisioner, tasks).StartProvisioningTask(call, callback);
    });
  });

  describe('StartDeprovisioningTask', () => {
    it('should return ALREADY_EXISTS if the task exists', (done) => {
      const tasks = {
        f92a9f97d2609849e6837b483d8210c7b308c6f615a691449087ec00db1eef06: { pending: true, completed: false, failed: false } as unknown as AsyncTask
      };
      const call = {
        request: { accountId: 'testAccount', functionName: 'testFunction', schema: 'schema' }
      } as unknown as ServerUnaryCall<any, any>;
      const callback = (error: any): void => {
        expect(error.code).toBe(status.ALREADY_EXISTS);
        expect(error.details).toBe('Deprovisioning task already exists');
        done();
      };

      createDataLayerService(undefined, tasks).StartDeprovisioningTask(call, callback);
    });

    it('should start a new deprovisioning task', (done) => {
      const tasks: Record<any, any> = {};
      const provisioner = {
        deprovision: jest.fn().mockResolvedValue(null)
      } as unknown as Provisioner;
      const call = {
        request: { accountId: 'testAccount', functionName: 'testFunction', schema: 'testSchema' }
      } as unknown as ServerUnaryCall<any, any>;
      const callback = (_error: any, response: any): void => {
        expect(tasks[response.taskId]).toBeDefined();
        expect(tasks[response.taskId].pending).toBe(true);
        done();
      };

      createDataLayerService(provisioner, tasks).StartDeprovisioningTask(call, callback);
    });
  });
});
