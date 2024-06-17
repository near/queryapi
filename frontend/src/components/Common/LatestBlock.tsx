import React, { useState, useEffect } from 'react';
import { calculateBlockTimeDifference } from '@/utils/calculateBlockTimeDifference';

interface LatestBlockProps {
  indexerBlockHeight?: number
}

interface BlockResponse {
  result?: {
    header?: {
      height?: number
    }
  }
  error?: {
    message?: string
  }
}

const LatestBlock: React.FC<LatestBlockProps> = (props) => {
  const [latestFinalBlock, setLatestFinalBlock] = useState<number | null>(null);
  const [errors, setErrors] = useState<string>('');

  useEffect(() => {
    const rpcBlock = async (finality: string): Promise<BlockResponse> => {
      try {
        const response = await fetch('https://rpc.mainnet.near.org', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'dontcare',
            method: 'block',
            params: {
              finality,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        return await response.json();
      } catch (error) {
        return { error: { message: (error as Error).message } };
      }
    };

    const updateFinalBlock = async (): Promise<void> => {
      try {
        const res = await rpcBlock('final');

        if (res?.result?.header?.height) {
          setLatestFinalBlock(res.result.header.height);
        } else {
          setErrors('Failed to fetch final block height');
        }
      } catch (error) {
        setErrors((error as Error).message || 'Error fetching final block height');
      }
    };

    updateFinalBlock()
      .catch(error => {
        console.error('Failed to fetch or process data:', error);
      });

    const intervalId = setInterval(() => {
      updateFinalBlock()
        .catch(error => {
          console.error('Failed to update final block:', error);
        });
    }, 1000);

    return () => { clearInterval(intervalId); };
  }, []);

  return (
    <div>
      {latestFinalBlock !== null && props.indexerBlockHeight !== undefined
        ? `Indexer is ${latestFinalBlock - props.indexerBlockHeight} blocks or ${calculateBlockTimeDifference(latestFinalBlock, props.indexerBlockHeight)} behind the blockchain tip`
        : `Indexer is not yet synced Latest Final Block Height: ${latestFinalBlock as number}`}
      {errors && <div>Error: {errors}</div>}
    </div>
  );
};

export default LatestBlock;
