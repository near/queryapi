import { withRouter } from 'next/router';
import React, { useContext, useEffect } from 'react';
import { Alert } from 'react-bootstrap';

import Editor from '@/components/Editor/EditorComponents/Editor';
import IndexerLogsContainer from '@/components/Logs/LogsViewContainer/IndexerLogsContainer';
import { IndexerDetailsContext } from '@/contexts/IndexerDetailsContext';

const QueryApiEditorPage = ({ router }) => {
  const { accountId, indexerName } = router.query;
  const { setAccountId, setIndexerName, showLogsView } = useContext(IndexerDetailsContext);

  useEffect(() => {
    if (!accountId || !indexerName) return;
    setAccountId(accountId);
    setIndexerName(indexerName);
  }, [accountId, indexerName]);

  if (!accountId || !indexerName) {
    return (
      <Alert className="px-3 pt-3" variant="info">
        Both accountId and IndexerName need to be specified in the URL.
      </Alert>
    );
  }

  return showLogsView ? <IndexerLogsContainer /> : <Editor />;
};

export default withRouter(QueryApiEditorPage);
