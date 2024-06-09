import { type ServerUnaryCall, status } from '@grpc/grpc-js';

import { createDataLayerService, type ProvisioningTask } from './data-layer-service';
import { ProvisioningStatus } from '../../../generated/data_layer/ProvisioningStatus';
import type Provisioner from '../../../provisioner';

describe('DataLayerService', () => {
  describe('CheckProvisioningTaskStatus', () => {
    it('should return NOT_FOUND if the task does not exist', (done) => {
      const call = {
        request: { accountId: 'testAccount', functionName: 'testFunction' }
      } as unknown as ServerUnaryCall<any, any>;

      const callback = (error: any): void => {
        expect(error.code).toBe(status.NOT_FOUND);
        expect(error.details).toBe('Provisioning task does not exist');
        done();
      };

      createDataLayerService().CheckProvisioningTaskStatus(call, callback);
    });

    it('should return PENDING if the task is pending', (done) => {
      const tasks = {
        'testAccount:testFunction': { pending: true, completed: false, failed: false } as unknown as ProvisioningTask
      };
      const call = {
        request: { accountId: 'testAccount', functionName: 'testFunction' }
      } as unknown as ServerUnaryCall<any, any>;
      const callback = (_error: any, response: any): void => {
        expect(response.status).toBe(ProvisioningStatus.PENDING);
        done();
      };

      createDataLayerService(undefined, tasks).CheckProvisioningTaskStatus(call, callback);
    });

    it('should return COMPLETE if the task is completed', (done) => {
      const tasks = {
        'testAccount:testFunction': { pending: false, completed: true, failed: false } as unknown as ProvisioningTask
      };
      const call = {
        request: { accountId: 'testAccount', functionName: 'testFunction' }
      } as unknown as ServerUnaryCall<any, any>;
      const callback = (_error: any, response: any): void => {
        expect(response.status).toBe(ProvisioningStatus.COMPLETE);
        done();
      };

      createDataLayerService(undefined, tasks).CheckProvisioningTaskStatus(call, callback);
    });

    it('should return FAILED if the task has failed', (done) => {
      const tasks = {
        'testAccount:testFunction': { pending: false, completed: false, failed: true } as unknown as ProvisioningTask
      };
      const call = {
        request: { accountId: 'testAccount', functionName: 'testFunction' }
      } as unknown as ServerUnaryCall<any, any>;
      const callback = (_error: any, response: any): void => {
        expect(response.status).toBe(ProvisioningStatus.FAILED);
        done();
      };

      createDataLayerService(undefined, tasks).CheckProvisioningTaskStatus(call, callback);
    });
  });

  describe('Provision', () => {
    it('should return ALREADY_EXISTS if the task is already pending', (done) => {
      const tasks = {
        'testAccount:testFunction': { pending: true, completed: false, failed: false } as unknown as ProvisioningTask
      };
      const call = {
        request: { accountId: 'testAccount', functionName: 'testFunction', schema: 'schema' }
      } as unknown as ServerUnaryCall<any, any>;
      const callback = (error: any): void => {
        expect(error.code).toBe(status.ALREADY_EXISTS);
        expect(error.details).toBe('Provisioning task already exists');
        done();
      };

      createDataLayerService(undefined, tasks).Provision(call, callback);
    });

    it('should return ALREADY_EXISTS if the task has already completed', (done) => {
      const provisioner = {
        fetchUserApiProvisioningStatus: jest.fn().mockResolvedValue(true)
      } as unknown as Provisioner;
      const call = {
        request: { accountId: 'testAccount', functionName: 'testFunction', schema: 'testSchema' }
      } as unknown as ServerUnaryCall<any, any>;
      const callback = (error: any): void => {
        expect(error.code).toBe(status.ALREADY_EXISTS);
        expect(error.details).toBe('Provisioning task has already completed');
        done();
      };

      createDataLayerService(provisioner).Provision(call, callback);
    });

    it('should start a new provisioning task and return PENDING', (done) => {
      const tasks: Record<any, any> = {};
      const provisioner = {
        fetchUserApiProvisioningStatus: jest.fn().mockResolvedValue(false),
        provisionUserApi: jest.fn().mockResolvedValue(null)
      } as unknown as Provisioner;
      const call = {
        request: { accountId: 'testAccount', functionName: 'testFunction', schema: 'testSchema' }
      } as unknown as ServerUnaryCall<any, any>;
      const callback = (_error: any, response: any): void => {
        expect(response.status).toBe(ProvisioningStatus.PENDING);
        expect(tasks['testAccount:testFunction']).toBeDefined();
        expect(tasks['testAccount:testFunction'].pending).toBe(true);
        done();
      };

      createDataLayerService(provisioner, tasks).Provision(call, callback);
    });

    it('should return INTERNAL error if checking provisioning status fails', (done) => {
      const tasks: Record<any, any> = {};
      const provisioner = {
        fetchUserApiProvisioningStatus: jest.fn().mockRejectedValue(new Error('boom'))
      } as unknown as Provisioner;
      const call = {
        request: { accountId: 'testAccount', functionName: 'testFunction', schema: 'testSchema' }
      } as unknown as ServerUnaryCall<any, any>;
      const callback = (error: any): void => {
        expect(error.code).toBe(status.INTERNAL);
        expect(error.details).toBe('boom');
        done();
      };

      createDataLayerService(provisioner, tasks).Provision(call, callback);
    });
  });
});
