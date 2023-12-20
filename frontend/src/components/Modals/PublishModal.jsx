import React, { useContext, useState } from "react";
import { Button, Modal, Alert } from "react-bootstrap";
import IndexerConfigOptions from "../Form/IndexerConfigOptionsInputGroup";
import { IndexerDetailsContext } from '../../contexts/IndexerDetailsContext';
import { validateContractIds } from "../../utils/validators";

export const PublishModal = ({
  registerFunction,
  actionButtonText,
}) => {
  const {
    showPublishModal,
    setShowPublishModal,
  } = useContext(IndexerDetailsContext);
  const [indexerConfig, setIndexerConfig] = useState({ filter: "social.near", startBlockHeight: null })
  const [indexerName, setIndexerName] = useState("")
  const [error, setError] = useState(null)

  const updateConfig = (indexerName, filter, startBlockHeight, option) => {
    if (option === "latestBlockHeight") {
      startBlockHeight = null
    }
    setIndexerConfig({ filter, startBlockHeight })
    setIndexerName(indexerName)
  }

  const register = async () => {
    if (indexerName === undefined || indexerName === "") {
      setError( () => "Please provide an Indexer Name")
      return
    }

    if (!validateContractIds(indexerConfig.filter)) {
      setError( () => "Please provide a valid contract name")
      return
    }
    setError(null)
    registerFunction(indexerName, indexerConfig)
    setShowPublishModal(false)
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
        {error && (
          <Alert className="px-3 mt-3" variant="danger">
            {error}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>

        <Button variant="secondary" onClick={() => setShowPublishModal(false)}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => register()}>
          {actionButtonText}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
