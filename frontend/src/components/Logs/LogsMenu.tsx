import React, { useState, useEffect, useContext } from 'react';
import { useQuery, gql } from '@apollo/client';
import { Button, Navbar, Container, ButtonGroup, Spinner } from 'react-bootstrap';
import { ArrowCounterclockwise, Code } from 'react-bootstrap-icons';
import { IndexerDetailsContext } from '@/contexts/IndexerDetailsContext';
import LatestBlock from '../Common/LatestBlock';

interface LogsMenuProps {
  currentUserAccountId: string
  heights: any[]
  setHeights: React.Dispatch<React.SetStateAction<any[]>>
  latestHeight: string
  isUserIndexer: boolean
  accountId: string
  reloadData: () => void
  functionName: string
}

const LogsMenu: React.FC<LogsMenuProps> = ({
  currentUserAccountId,
  heights,
  setHeights,
  latestHeight,
  isUserIndexer,
  accountId,
  reloadData: reloadDataProp,
  functionName,
}) => {
  const { indexerName, indexerDetails, debugMode, setShowLogsView, showLogsView } = useContext(IndexerDetailsContext);
  const hasuraRole = accountId.replace(/[^a-zA-Z0-9]/g, '_').replace(/^([0-9])/, '_$1');
  const queryName = `${functionName.replace(/[^a-zA-Z0-9]/g, '_')}_sys_metadata`;

  const GET_METADATA = gql`
    query getMetadata {
      ${queryName} {
        attribute
        value
      }
    }
  `;

  const { loading, error, data, refetch } = useQuery(GET_METADATA, {
    context: {
      headers: {
        'x-hasura-role': hasuraRole,
      },
    },
  });

  const [blockHeight, setBlockHeight] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [attributeMap, setAttributeMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!loading && data) {
      const newAttributeMap = new Map<string, string>(data[queryName].map((item: any) => [item.attribute, item.value]));
      setAttributeMap(newAttributeMap);
    }
  }, [data, queryName, loading]);

  useEffect(() => {
    if (attributeMap.has('LAST_PROCESSED_BLOCK_HEIGHT')) {
      setBlockHeight(attributeMap.get('LAST_PROCESSED_BLOCK_HEIGHT') ?? 'N/A');
    }
    if (attributeMap.has('STATUS')) {
      setStatus(attributeMap.get('STATUS') ?? 'UNKNOWN');
    }
  }, [attributeMap]);

  useEffect(() => {
    const fetchBlockHeight = async (): Promise<void> => {
      try {
        const { data: fetchedData } = await refetch();
        if (fetchedData?.[queryName]) {
          const newAttributeMap = new Map<string, string>(fetchedData[queryName].map((item: any) => [item.attribute, item.value]));
          setAttributeMap(newAttributeMap);
          if (newAttributeMap.has('LAST_PROCESSED_BLOCK_HEIGHT')) {
            setBlockHeight(newAttributeMap.get('LAST_PROCESSED_BLOCK_HEIGHT') ?? 'N/A');
          }
          if (newAttributeMap.has('STATUS')) {
            setStatus(newAttributeMap.get('STATUS') ?? 'UNKNOWN');
          }
        }
      } catch (error) {
        console.error('Error fetching block height:', error);
      }
    };

    const intervalId = setInterval(() => {
      fetchBlockHeight()
        .catch(error => {
          console.error('Failed to update indexer block:', error);
        });
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [refetch, queryName]);

  const handleReload = async (): Promise<void> => {
    try {
      const { data: refetchedData } = await refetch();
      if (refetchedData) {
        const newAttributeMap = new Map<string, string>(refetchedData[queryName].map((item: any) => [item.attribute, item.value]));
        setAttributeMap(newAttributeMap);
      }
      reloadDataProp();
    } catch (error) {
      console.error('Error reloading data:', error);
    }
  };

  return (
    <Navbar bg="white" variant="light" className="shadow-sm p-3 mb-4 bg-white rounded">
      <Container fluid className="d-flex flex-wrap justify-content-between align-items-center">
        <div className="d-flex flex-wrap align-items-center">
          <span className="me-4 font-weight-bold text-secondary text-sm">
            Indexer: {functionName}
          </span>
          <span className="me-4 font-weight-bold text-secondary text-sm">
            Filter: {indexerDetails.rule.affected_account_id}
          </span>
          <span className="me-4 text-secondary text-sm">
            Status:  <strong>{loading ? <Spinner animation="border" size="sm" /> : status ?? 'UNKNOWN'}</strong>
          </span>
          <span className="me-4 text-secondary text-sm">
            Height: <strong>{loading ? <Spinner animation="border" size="sm" /> : blockHeight ?? 'N/A'}</strong>
          </span>
          {!loading && blockHeight && latestHeight && (
            <div className="bg-gray-100 border border-gray-300 rounded p-1 text-xs text-gray-700">
              <span className="text-secondary">
                <LatestBlock indexerBlockHeight={Number(blockHeight)} />
              </span>
            </div>
          )}
        </div>
        <ButtonGroup className="mt-3 mt-md-0">
          {/* eslint-disable-next-line */}
          <Button size="sm" variant="outline-primary" className="d-flex align-items-center" onClick={handleReload}>
            <ArrowCounterclockwise className="me-2" size={20} />
            Reload
          </Button>
          <Button size="sm" variant="outline-primary" className="d-flex align-items-center" onClick={() => { setShowLogsView(); }}>
            <Code className="me-2" size={20} />
            Go To Editor
          </Button>
        </ButtonGroup>
      </Container>
    </Navbar >
  );
};

export default LogsMenu;
