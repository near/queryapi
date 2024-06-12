import RpcClient from './rpc-client';

describe('RPCClient unit tests', () => {
  const rpcClient = RpcClient.fromConfig({
    networkId: 'mainnet',
    nodeUrl: 'https://beta.rpc.mainnet.near.org',
  });
  const testBlockHeight = 121_031_955;

  it('Should make a get_total_staked_balance view call to pool.near', async () => {
    const response = await rpcClient.viewCallJSON(testBlockHeight, 'epic.poolv1.near', 'get_total_staked_balance', {});
    console.log(response);
    expect(response).toBeDefined();
  });

  it('Should return non-empty dataplatform.near.list_by_account', async () => {
    const response = await rpcClient.viewCallJSON(testBlockHeight, 'queryapi.dataplatform.near', 'list_by_account', { account_id: 'dataplatform.near' });
    expect(Object.keys(response).length).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it('Should get_contracts_metadata from sputnik-dao.near', async () => {
    const response = await rpcClient.viewCallJSON(testBlockHeight, 'sputnik-dao.near', 'get_contracts_metadata', {});
    expect(response.length).toBeGreaterThanOrEqual(3);
  });
});
