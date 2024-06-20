import { withRouter } from 'next/router';
import type { NextRouter } from 'next/router';
import React, { useContext, useEffect } from 'react';
import Alert from '@/components/Common/Alert';
import Editor from '@/components/Editor/Legacy/Editor';
import IndexerLogsContainer from '@/components/Logs/LogsViewContainer/IndexerLogsContainer';
import { IndexerDetailsContext } from '@/contexts/IndexerDetailsContext';

interface QueryApiEditorPageProps {
  router: NextRouter;
}

const QueryApiEditorPage: React.FC<QueryApiEditorPageProps> = ({ router }) => {
  console.log(router);
  const { accountId, indexerName } = router.query;
  const { setAccountId, setIndexerName, showLogsView } = useContext(IndexerDetailsContext);

  useEffect(() => {
    if (!accountId || !indexerName) return;
    setAccountId(accountId as string);
    setIndexerName(indexerName as string);
  }, [accountId, indexerName, setAccountId, setIndexerName]);

  if (!accountId || !indexerName) {
    return (
      <>
        <Alert type="info" message="Both accountId and IndexerName need to be specified in the URL." />
      </>
    );
  }

  return <>{showLogsView ? <IndexerLogsContainer /> : <Editor />}</>;
};

export default withRouter(QueryApiEditorPage);
