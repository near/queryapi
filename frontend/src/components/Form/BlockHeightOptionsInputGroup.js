import { InputGroup } from "react-bootstrap";
import Form from "react-bootstrap/Form";
const BlockHeightOptions = ({
  selectedOption,
  handleOptionChange,
  blockHeight,
  setBlockHeight,
  contractFilter,
  handleSetContractFilter,
  isContractFilterValid,
}) => {
  return (
    <>
      <InputGroup size="sm" className="px-1 pt-3 ps-1">
        <InputGroup.Checkbox
          value="latestBlockHeight"
          checked={selectedOption === "latestBlockHeight"}
          onChange={handleOptionChange}
          aria-label="Checkbox for following text input"
        />
        <InputGroup.Text>From Latest Block Height</InputGroup.Text>
      </InputGroup>
      <InputGroup size="sm" className="px-1 pt-3">
        <InputGroup.Checkbox
          value="specificBlockHeight"
          checked={selectedOption === "specificBlockHeight"}
          onChange={handleOptionChange}
          aria-label="Checkbox for following text input"
        />
        <InputGroup.Text>Specific Block Height</InputGroup.Text>
        <Form.Control
          value={blockHeight}
          onChange={(e) => setBlockHeight(parseInt(e.target.value))}
          type="number"
        />
      </InputGroup>
      <InputGroup size="sm" hasValidation={true} className="px-1 pt-3">
        <InputGroup.Text> Contract Filter</InputGroup.Text>
        <Form.Control
          value={contractFilter}
          onChange={handleSetContractFilter}
          type="text"
          placeholder="social.near"
          required={true}
          isValid={isContractFilterValid}
        />
        <Form.Control.Feedback type="invalid">
          Please provide a valid contract name.
        </Form.Control.Feedback>
      </InputGroup>
    </>
  );
};

export default BlockHeightOptions;
