import { Button, Modal } from "react-bootstrap";
export const BlockDetailsModal = ({
  showGetBlockModalInput,
  setShowResetCodeModel,
  getBlockValue,
  setBlock,
  getBlockHeight,
  blockHeight,
}) => {
  return (
    <Modal
      show={showGetBlockModalInput}
      onHide={() => setShowGetBlockModalInput(false)}
    >
      <Modal.Header closeButton>
        <Modal.Title>Select A Blockheight</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <input
          type="number"
          value={getBlockHeight || blockHeight}
          onChange={(e) => setGetBlockHeight(e.value)}
          aria-label="Input blockheight"
        />
      </Modal.Body>
      <Modal.Footer>
        <Button
          variant="secondary"
          onClick={() => setShowResetCodeModel(false)}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() =>
            getBlockValue().then((response) => setBlock(response.data.block))
          }
        >
          Get Block Details
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
