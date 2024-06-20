import React, { createContext, useEffect, useState } from 'react';
import { useInitialPayload } from 'near-social-bridge';
import { getLatestBlockHeight } from '@/utils/getLatestBlockHeight';
import { queryIndexerFunctionDetails } from '@/utils/queryIndexerFunction';
import { wrapCode } from '../utils/formatters';

interface IndexerDetails {
  code?: string;
  schema?: string;
  rule: { affected_account_id: string };
  startBlock: string;
  accountId?: string;
  indexerName?: string;
  forkedAccountId: string | null;
  forkedIndexerName: string | null;
}

interface IndexerDetailsContextProps {
  indexerDetails: IndexerDetails;
  showResetCodeModel: boolean;
  setShowResetCodeModel: (bool: boolean) => void;
  showPublishModal: boolean;
  setShowPublishModal: (bool: boolean) => void;
  showForkIndexerModal: boolean;
  setShowForkIndexerModal: (bool: boolean) => void;
  debugMode: boolean;
  setDebugMode: (mode: boolean) => void;
  latestHeight: number;
  setLatestHeight: (height: number) => void;
  isCreateNewIndexer: boolean;
  setIsCreateNewIndexer: (bool: boolean) => void;
  accountId?: string;
  setAccountId: (accountId?: string) => void;
  indexerName?: string;
  setIndexerName: (indexerName?: string) => void;
  forkedAccountId?: string;
  setForkedAccountId: (accountId?: string) => void;
  forkedIndexerName?: string;
  setForkedIndexerName: (indexerName?: string) => void;
  setIndexerDetails: (details: IndexerDetails) => void;
  showLogsView: boolean;
  setShowLogsView: (showLogsView: boolean) => void;
}

export const IndexerDetailsContext = createContext<IndexerDetailsContextProps>({
  indexerDetails: {
    code: undefined,
    schema: undefined,
    rule: { affected_account_id: 'social.near' },
    startBlock: 'LATEST',
    accountId: undefined,
    indexerName: undefined,
    forkedAccountId: null,
    forkedIndexerName: null,
  },
  showResetCodeModel: false,
  setShowResetCodeModel: () => { },
  showPublishModal: false,
  setShowPublishModal: () => { },
  showForkIndexerModal: false,
  setShowForkIndexerModal: () => { },
  debugMode: false,
  setDebugMode: () => { },
  latestHeight: 0,
  setLatestHeight: () => { },
  isCreateNewIndexer: false,
  setIsCreateNewIndexer: () => { },
  setAccountId: () => { },
  setIndexerName: () => { },
  setForkedAccountId: () => { },
  setForkedIndexerName: () => { },
  setIndexerDetails: () => { },
  showLogsView: false,
  setShowLogsView: () => { },
});

interface IndexerDetailsProviderProps {
  children: React.ReactNode;
}

export const IndexerDetailsProvider: React.FC<IndexerDetailsProviderProps> = ({ children }) => {
  const [accountId, setAccountId] = useState<string | undefined>(undefined);
  const [indexerName, setIndexerName] = useState<string | undefined>(undefined);
  const [forkedAccountId, setForkedAccountId] = useState<string | undefined>(undefined);
  const [forkedIndexerName, setForkedIndexerName] = useState<string | undefined>(undefined);
  const [indexerDetails, setIndexerDetails] = useState<IndexerDetails>({
    code: undefined,
    schema: undefined,
    rule: { affected_account_id: 'social.near' },
    startBlock: 'LATEST',
    accountId,
    indexerName,
    forkedAccountId: forkedAccountId ?? null,
    forkedIndexerName: forkedIndexerName ?? null,
  });
  const [showResetCodeModel, setShowResetCodeModel] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showForkIndexerModal, setShowForkIndexerModal] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [showLogsView, setShowLogsView] = useState(false);
  const [latestHeight, setLatestHeight] = useState(0);
  const [isCreateNewIndexer, setIsCreateNewIndexer] = useState(false);

  const activeView = useInitialPayload<string>(); // Adjust the type according to what useInitialPayload returns

  useEffect(() => {
    if (activeView === 'status') setShowLogsView(true);
  }, [activeView]);

  const requestIndexerDetails = async (): Promise<IndexerDetails | undefined> => {
    if (!accountId || !indexerName) return undefined;
    const data = await queryIndexerFunctionDetails(accountId, indexerName);
    if (data) {
      const details: IndexerDetails = {
        accountId,
        indexerName,
        forkedAccountId: data.forked_from?.account_id ?? null,
        forkedIndexerName: data.forked_from?.function_name ?? null,
        code: wrapCode(data.code),
        schema: data.schema,
        startBlock: data.start_block,
        rule: data.rule,
      };
      return details;
    }
  };

  useEffect(() => {
    (async () => {
      const latestHeight = await getLatestBlockHeight();
      setLatestHeight(latestHeight);
    })();
  }, []);

  useEffect(() => {
    if (isCreateNewIndexer || !accountId || !indexerName) {
      setIndexerDetails((prevDetails) => ({
        ...prevDetails,
        accountId,
        indexerName,
        forkedAccountId: forkedAccountId ?? null,
        forkedIndexerName: forkedIndexerName ?? null,
      }));
      return;
    }
    (async () => {
      const indexer = await requestIndexerDetails();
      if (indexer) {
        setIndexerDetails(indexer);
      }
    })();
  }, [accountId, indexerName, forkedAccountId, forkedIndexerName, isCreateNewIndexer]);

  return (
    <IndexerDetailsContext.Provider
      value={{
        accountId,
        indexerName,
        setAccountId,
        setIndexerName,
        setForkedAccountId,
        setForkedIndexerName,
        indexerDetails,
        showResetCodeModel,
        setShowResetCodeModel,
        showPublishModal,
        setShowPublishModal,
        showForkIndexerModal,
        setShowForkIndexerModal,
        debugMode,
        setDebugMode,
        latestHeight,
        setLatestHeight,
        isCreateNewIndexer,
        setIsCreateNewIndexer,
        setIndexerDetails,
        showLogsView,
        setShowLogsView,
      }}
    >
      {children}
    </IndexerDetailsContext.Provider>
  );
};