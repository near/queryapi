import React, { useContext, useState } from "react";
import { Button, Modal, Alert } from "react-bootstrap";
import PublishFormContainer from "./ModalsContainer/PublishFormContainer"
import { IndexerDetailsContext } from '../../contexts/IndexerDetailsContext';
import { validateContractIds } from "../../utils/validators";

export const PublishModal = ({
  registerFunction,
  actionButtonText,
}) => {
  const {
    indexerDetails,
    showPublishModal,
    setShowPublishModal,
  } = useContext(IndexerDetailsContext);
  const [indexerConfig, setIndexerConfig] = useState({ filter: "social.near", startBlockHeight: null })
  const [indexerName, setIndexerName] = useState("")
  const [error, setError] = useState(null)

  const updateConfig = (indexerName, filter, height, startBlock) => {
    setIndexerConfig({ filter, startBlock, height })
    setIndexerName(indexerName)
  }

  const register = async () => {
    if (indexerName === undefined || indexerName === "") {
      setError(() => "Please provide an Indexer Name")
      return
    }

    if (!validateContractIds(indexerConfig.filter)) {
      setError(() => "Please provide a valid contract name")
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
      className="bg-gray-50"
    >
      <Modal.Header closeButton className="border-b border-gray-300">
        <Modal.Title className="text-lg font-semibold text-gray-800">
          Enter Indexer Details
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-4">
        <PublishFormContainer updateConfig={updateConfig} />
        {error && (
          <Alert
            className="px-4 py-2 mt-3 font-semibold text-red-700 text-sm text-center border border-red-300 bg-red-50 rounded-lg shadow-md"
            variant="danger"
          >
            {error}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer className="border-t border-gray-300">
        <Button
          variant="secondary"
          onClick={() => setShowPublishModal(false)}
          className="bg-gray-500 text-white hover:bg-gray-600"
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() => register()}
          className="bg-blue-600 text-white hover:bg-blue-700"
        >
          {actionButtonText}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};