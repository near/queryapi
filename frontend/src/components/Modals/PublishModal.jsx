import React, { useContext, useState } from "react";
import { Button, Modal, Alert } from "react-bootstrap";
import IndexerConfigOptions from "../Form/IndexerConfigOptionsInputGroup";
import { IndexerDetailsContext } from '../../contexts/IndexerDetailsContext';

export const PublishModal = ({
  registerFunction,
  actionButtonText,
  blockHeightError,
}) => {
  const {
    showPublishModal,
    setShowPublishModal,
  } = useContext(IndexerDetailsContext);
  const [indexerConfig, setIndexerConfig] = useState({ filter: "social.near", startBlockHeight: null })
  const [indexerName, setIndexerName] = useState("")

  const updateConfig = (indexerName, filter, startBlockHeight, option) => {
    if (option === "latestBlockHeight") {
      startBlockHeight = null
    }
    setIndexerConfig({ filter, startBlockHeight })
    setIndexerName(indexerName)
  }

  return (
    <Modal
      centered={true}
      show={showPublishModal}
      onHide={() => setShowPublishModal(false)}
    >
      <Modal.Header closeButton>
        <Modal.Title> Enter Indexer Details</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <IndexerConfigOptions updateConfig={updateConfig} />
      </Modal.Body>
      <Modal.Footer>
        {blockHeightError && (
          <Alert className="px-3 pt-3" variant="danger">
            {blockHeightError}
          </Alert>
        )}

        <Button variant="secondary" onClick={() => setShowPublishModal(false)}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => registerFunction(indexerName, indexerConfig)}>
          {actionButtonText}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
