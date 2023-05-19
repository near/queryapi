import { Button, Modal } from "react-bootstrap";
import { Alert } from "react-bootstrap";
import BlockHeightOptions from "../Form/BlockHeightOptionsInputGroup";

export const PublishModal = ({
  showPublishModal,
  setShowPublishModal,
  submit,
  selectedOption,
  handleOptionChange,
  blockHeight,
  setBlockHeight,
  contractFilter,
  handleSetContractFilter,
  isContractFilterValid,
  actionButtonText,
  blockHeightError,
}) => {
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
        <BlockHeightOptions
          selectedOption={selectedOption}
          handleOptionChange={handleOptionChange}
          blockHeight={blockHeight}
          setBlockHeight={setBlockHeight}
          handleSetContractFilter={handleSetContractFilter}
          contractFilter={contractFilter}
          isContractFilterValid={isContractFilterValid}
        />
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
        <Button variant="primary" onClick={() => submit()}>
          {actionButtonText}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
