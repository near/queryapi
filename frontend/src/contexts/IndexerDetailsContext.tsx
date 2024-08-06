import { useInitialPayload } from 'near-social-bridge';
import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';

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
  setIndexerDetails: (details: IndexerDetails) => void;
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
  firstSeenHeight: number;
  setFirstSeenHeight: (height: number) => void;
  isCreateNewIndexer: boolean;
  setIsCreateNewIndexer: (bool: boolean) => void;
  isLaunchPadIndexer: boolean;
  setIsLaunchPadIndexer: (bool: boolean) => void;
  accountId?: string;
  setAccountId: (accountId?: string) => void;
  indexerName?: string;
  setIndexerName: (indexerName?: string) => void;
  forkedAccountId?: string;
  setForkedAccountId: (accountId?: string) => void;
  forkedIndexerName?: string;
  setForkedIndexerName: (indexerName?: string) => void;
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
  setIndexerDetails: () => { },
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
  firstSeenHeight: 0,
  setFirstSeenHeight: () => { },
  isCreateNewIndexer: false,
  setIsCreateNewIndexer: () => { },
  isLaunchPadIndexer: false,
  setIsLaunchPadIndexer: () => { },
  setAccountId: () => { },
  setIndexerName: () => { },
  setForkedAccountId: () => { },
  setForkedIndexerName: () => { },
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
    rule: { affected_account_id: '' },
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
  const [firstSeenHeight, setFirstSeenHeight] = useState(0);
  const [isCreateNewIndexer, setIsCreateNewIndexer] = useState(false);
  const [isLaunchPadIndexer, setIsLaunchPadIndexer] = useState(false);

  const activeView = useInitialPayload<string>();

  useEffect(() => {
    if (activeView === 'status') setShowLogsView(true);
  }, [activeView]);

  const requestIndexerDetails = useCallback(async (): Promise<IndexerDetails | undefined> => {
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
  }, [accountId, indexerName]);

  useEffect(() => {
    const fetchData = async () => {
      const latestHeight = await getLatestBlockHeight();
      setLatestHeight(latestHeight);
    };
    fetchData();
    setFirstSeenHeight(124000000); //static here
  }, []);

  useEffect(() => {
    const isNewIndexer = isCreateNewIndexer || !accountId || !indexerName;
    const isFromLaunchPad = isLaunchPadIndexer;

    if (isFromLaunchPad) {
      console.log('we got a launchpad indexer here...');
      setIndexerDetails((prevDetails) => ({
        ...prevDetails,
        rule: { affected_account_id: 'doggie' },
        accountId,
        indexerName,
        forkedAccountId: forkedAccountId ?? null,
        forkedIndexerName: forkedIndexerName ?? null,
      }));
      console.log('Default condition for launchpad indexer');
    } else if (isNewIndexer) {
      console.log('we got a new indexer here...')
      setIndexerDetails((prevDetails) => ({
        ...prevDetails,
        accountId,
        indexerName,
        forkedAccountId: forkedAccountId ?? null,
        forkedIndexerName: forkedIndexerName ?? null,
      }));
      console.log('Default condition for new indexer');
    } else {
      (async () => {
        try {
          const indexer = await requestIndexerDetails();
          if (indexer) setIndexerDetails(indexer);
        } catch (error) {
          console.error('Failed to fetch indexer details', error);
        }
      })();
    }
  }, [
    accountId,
    indexerName,
    forkedAccountId,
    forkedIndexerName,
    isCreateNewIndexer,
    isLaunchPadIndexer,
    requestIndexerDetails,
    setIndexerDetails,
  ]);

  const contextValue = useMemo(
    () => ({
      accountId,
      indexerName,
      setAccountId,
      setIndexerName,
      setForkedAccountId,
      setForkedIndexerName,
      indexerDetails,
      setIndexerDetails,
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
      firstSeenHeight,
      setFirstSeenHeight,
      isCreateNewIndexer,
      setIsCreateNewIndexer,
      isLaunchPadIndexer,
      setIsLaunchPadIndexer,
      showLogsView,
      setShowLogsView,
    }),
    [
      accountId,
      indexerName,
      setAccountId,
      setIndexerName,
      setForkedAccountId,
      setForkedIndexerName,
      indexerDetails,
      setIndexerDetails,
      showResetCodeModel,
      setShowResetCodeModel,
      showPublishModal,
      setShowPublishModal,
      showForkIndexerModal,
      setShowForkIndexerModal,
      debugMode,
      setDebugMode,
      latestHeight,
      firstSeenHeight,
      isCreateNewIndexer,
      isLaunchPadIndexer,
      showLogsView,
    ],
  );

  return <IndexerDetailsContext.Provider value={contextValue}>{children}</IndexerDetailsContext.Provider>;
};
