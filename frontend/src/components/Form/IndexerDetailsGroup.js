
import {
  Form,
  InputGroup,
} from 'react-bootstrap';

const IndexerDetailsGroup = ({ accountId, indexerNameField, setIndexerNameField, isCreateNewIndexerPage }) => {
  console.log(accountId, "accountID from indexer detail group")
  return (<><InputGroup className="px-3 w-100">
    <InputGroup className="w-30">
      <InputGroup.Text id="btnGroupAddon">AccountID:</InputGroup.Text>
      <Form.Control
        type="text"
        value={accountId}
        disabled
        aria-label="Registered Indexer Name"
        aria-describedby="btnGroupAddon"
      />
    </InputGroup>
    <InputGroup className="px-3 w-40">
      <InputGroup.Text id="btnGroupAddon">Indexer Name: </InputGroup.Text>
      <Form.Control
        type="text"
        value={indexerNameField}
        onChange={(e) => setIndexerNameField(e.target.value)}
        disabled={!isCreateNewIndexerPage}
        aria-label="Registered Indexer Name"
        aria-describedby="btnGroupAddon"
      />
    </InputGroup>
  </InputGroup></>);
}

export default IndexerDetailsGroup
