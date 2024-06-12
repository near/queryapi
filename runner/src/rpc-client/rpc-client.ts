import { type NearConfig } from '@near-js/wallet-account/lib/near';
import { connect, type Near } from 'near-api-js';
import { type CodeResult } from '@near-js/types/lib/provider/response';

type RpcViewCallArgs = Record<string, string | number | object>;

export interface IRpcClient {
  viewCallRaw: (blockHeight: number, contractId: string, methodName: string, args: RpcViewCallArgs) => Promise<CodeResult>
  viewCallJSON: (blockHeight: number, contractId: string, methodName: string, args: RpcViewCallArgs) => Promise<any>
}

export default class RpcClient implements IRpcClient {
  #near: Near | undefined;

  private constructor (private readonly config: NearConfig) {}

  async nearConnection (): Promise<Near> {
    if (!this.#near) {
      this.#near = await connect(this.config);
    }
    return this.#near;
  }

  async viewCallRaw (blockHeight: number, contractId: string, methodName: string, args: RpcViewCallArgs = {}): Promise<CodeResult> {
    const near = await this.nearConnection();
    return await near.connection.provider.query({
      request_type: 'call_function',
      blockId: blockHeight,
      account_id: contractId,
      method_name: methodName,
      args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
    });
  }

  async viewCallJSON (blockHeight: number, contractId: string, methodName: string, args: RpcViewCallArgs = {}): Promise<any> {
    const response: CodeResult = await this.viewCallRaw(blockHeight, contractId, methodName, args);
    return JSON.parse(Buffer.from(response.result).toString('ascii'));
  }

  static fromConfig (config: NearConfig): IRpcClient {
    return new RpcClient(config);
  }

  static fromEnv (): IRpcClient {
    if (!process.env.RPC_URL) {
      throw new Error('Missing RPC_URL env var for RpcClient');
    }
    return RpcClient.fromConfig({
      networkId: 'mainnet',
      nodeUrl: process.env.RPC_URL,
    });
  }
}
