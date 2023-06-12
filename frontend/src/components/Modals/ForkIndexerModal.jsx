import React, { useContext, useState } from "react";
import { Button, Modal, Alert } from "react-bootstrap";
import IndexerConfigOptions from "../Form/IndexerConfigOptionsInputGroup";
import { IndexerDetailsContext } from '../../contexts/IndexerDetailsContext';

export const ForkIndexerModal = ({
  registerFunction,
}) => {
  const {
    showForkIndexerModal,
    setShowForkIndexerModal,
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
      show={showForkIndexerModal}
      onHide={() => setShowForkIndexerModal(false)}
    >
      <Modal.Header closeButton>
        <Modal.Title> Enter Indexer Details</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <IndexerConfigOptions updateConfig={updateConfig} />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={() => setShowPublishModal(false)}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => registerFunction(indexerName,indexerConfig)}>
          Fork Your Own Indexer
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
