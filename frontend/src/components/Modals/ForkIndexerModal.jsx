import { Button, Modal } from "react-bootstrap";
import { Alert } from "react-bootstrap";
import BlockHeightOptions from "../Form/BlockHeightOptionsInputGroup";

export const ForkIndexerModal = ({
  showForkIndexerModal,
  setShowForkIndexerModal,
  submit,
  selectedOption,
  handleOptionChange,
  blockHeight,
  setBlockHeight,
  contractFilter,
  handleSetContractFilter,
  isContractFilterValid,
  actionButtonText,
}) => {
  const [newIndexerName, setNewIndexerName] = useState(indexerNameField);
  const [newStartBlockHeight, setNewStartBlockHeight] = useState(blockHeight);
  const [newContractFilter, setNewContractFilter] = useState(contractFilter);

  const forkIndexer = async () => {
    let start_block_height = blockHeight;
    if (selectedOption == "latestBlockHeight") {
      start_block_height = null;
    }
    request("fork-indexer", {
      indexerName: newIndexerName.replaceAll(" ", "_"),
      code: innerCode,
      schema: formatted_schema,
      blockHeight: start_block_height,
      contractFilter: newContractFilter,
    });
};
    return (
      <Modal
        centered={true}
        show={showForkIndexerModal}
        onHide={() => setShowForkIndexerModal(false)}
      >
        <Modal.Header closeButton>
          <Modal.Title> Enter New Indexer Details</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <BlockHeightOptions
            selectedOption={selectedOption}
            handleOptionChange={handleOptionChange}
            blockHeight={new_start_block_height}
            setBlockHeight={set_new_start_block_height}
            handleSetContractFilter={handleSetContractFilter}
            contractFilter={contractFilter}
            isContractFilterValid={isContractFilterValid}
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowPublishModal(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => submit()}>
            Fork Your Own Indexer
          </Button>
        </Modal.Footer>
      </Modal>
    );
  };
