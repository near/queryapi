import React, { useContext, useState } from 'react';
import { Button, Modal, Alert, InputGroup, Form } from 'react-bootstrap';
import { IndexerDetailsContext } from '@/contexts/IndexerDetailsContext';

export const ForkIndexerModal = ({ forkIndexer }) => {
  const {
    indexerDetails,
    showForkIndexerModal,
    setShowForkIndexerModal,
    setIsCreateNewIndexer,
    setIndexerName,
    setForkedAccountId,
    setForkedIndexerName,
  } = useContext(IndexerDetailsContext);
  const [indexerName, setIndexerNameField] = useState('');
  const [error, setError] = useState(null);

  const fork = async () => {
    if (!indexerName) {
      setError('Please provide an Indexer Name');
      return;
    }

    if (indexerName === indexerDetails.indexerName) {
      setError('Please provide a different Indexer Name than the original Indexer');
      return;
    }

    setError(null);
    setIndexerName(indexerName);
    setForkedAccountId(indexerDetails.accountId);
    setForkedIndexerName(indexerDetails.indexerName);
    setIsCreateNewIndexer(true);
    forkIndexer(indexerName);
    setShowForkIndexerModal(false);
  };

  return (
    <Modal centered show={showForkIndexerModal} onHide={() => setShowForkIndexerModal(false)} className="bg-gray-50">
      <Modal.Header closeButton className="border-b border-gray-300">
        <Modal.Title className="text-lg font-semibold text-gray-800">Enter Indexer Details</Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-4">
        <InputGroup size="sm" className="mb-3">
          <InputGroup.Text className="bg-gray-200 text-gray-700">Indexer Name</InputGroup.Text>
          <Form.Control
            type="text"
            placeholder="indexer_name"
            aria-label="IndexerName"
            value={indexerName}
            onChange={(e) => setIndexerNameField(e.target.value.trim().toLowerCase())}
            className="focus:border-gray-500 focus:ring focus:ring-gray-200 focus:ring-opacity-50"
          />
        </InputGroup>
        {error && (
          <Alert
            variant="danger"
            className="px-4 py-2 mt-3 font-semibold text-red-700 text-sm text-center border border-red-300 bg-red-50 rounded-lg shadow-md"
          >
            {error}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer className="border-t border-gray-300">
        <Button
          variant="secondary"
          onClick={() => setShowForkIndexerModal(false)}
          className="bg-gray-500 text-white hover:bg-gray-600"
        >
          Cancel
        </Button>
        <Button variant="primary" onClick={() => fork()} className="bg-blue-600 text-white hover:bg-blue-700">
          Fork Indexer
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
