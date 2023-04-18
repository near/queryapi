import {
  InputGroup,
} from 'react-bootstrap';

const BlockHeightOptions = ({ selectedOption, handleOptionChange, blockHeight, setBlockHeight }) => {
  return (<>
    <InputGroup className="px-3 pt-3">
      <InputGroup.Checkbox value="latestBlockHeight" checked={selectedOption === "latestBlockHeight"}
        onChange={handleOptionChange} aria-label="Checkbox for following text input" />
      <InputGroup.Text>From Latest Block Height</InputGroup.Text>
    </InputGroup>
    <InputGroup className="px-3 pt-3">
      <InputGroup.Checkbox value="specificBlockHeight" checked={selectedOption === "specificBlockHeight"}
        onChange={handleOptionChange} aria-label="Checkbox for following text input" />
      <InputGroup.Text>Specific Block Height</InputGroup.Text>
      <input
        type="number"
        value={blockHeight}
        onChange={(e) => setBlockHeight(parseInt(e.target.value))}
        aria-label="Text input with checkbox" />
    </InputGroup>
  </>)

}

export default BlockHeightOptions;
