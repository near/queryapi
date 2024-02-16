import React, { useContext, useState, useEffect } from "react";
import { InputGroup, Alert, Warn } from "react-bootstrap";
import Form from "react-bootstrap/Form";

import { IndexerDetailsContext } from '../../contexts/IndexerDetailsContext';
import { validateContractIds } from "../../utils/validators";

const  GENESIS_BLOCK_HEIGHT = 9820210;

const IndexerConfigOptions = ({ updateConfig }) => {
  const { indexerDetails, showPublishModal, isCreateNewIndexer, latestHeight } = useContext(IndexerDetailsContext); 
  const [blockHeight, setBlockHeight] = useState("0");
  const [contractFilter, setContractFilter] = useState("social.near");
  const [selectedOption, setSelectedOption] = useState("latestBlockHeight");
  const [isContractFilterValid, setIsContractFilterValid] = useState(true);
  const [indexerNameField, setIndexerNameField] = useState(indexerDetails.indexerName || "");
  const [blockHeightError, setBlockHeightError] = useState(null)

  const handleOptionChange = (event) => {
    setSelectedOption(event.target.value);
    // setBlockHeightError(null);
  };

  useEffect(() => {
    if (indexerDetails.config?.startBlockHeight) {
      setSelectedOption("specificBlockHeight")
      setBlockHeight(indexerDetails.config.startBlockHeight)
    }
    if (indexerDetails.config?.filter) {
      setContractFilter(indexerDetails.config.filter)
    }
  }, [indexerDetails])

  function handleSetContractFilter(e) {
    const contractFilter = e.target.value;
    setContractFilter(contractFilter);
    const isContractFilterValid = validateContractIds(contractFilter);
    setIsContractFilterValid(isContractFilterValid);
  }

  useEffect(() => {
    if (selectedOption == "specificBlockHeight" && blockHeight <= GENESIS_BLOCK_HEIGHT) {
      setBlockHeightError(() => `Choose a block height greater than the Genesis BlockHeight ${GENESIS_BLOCK_HEIGHT}. Latest Block Height is ${latestHeight}`)
      return
    }
    setBlockHeightError(() => null)
    updateConfig(indexerNameField, contractFilter, blockHeight, selectedOption)
    },
    [indexerNameField, contractFilter, selectedOption, blockHeight]
  )

  return (
    <>
      <InputGroup size="sm" >
        <InputGroup.Text> Indexer Name  </InputGroup.Text>
        <Form.Control
          type="text"
          placeholder="indexer_name"
          aria-label="IndexerName"
          value={indexerNameField}
          disabled={!isCreateNewIndexer && showPublishModal}
          onChange={(e) => setIndexerNameField(e.target.value.toLowerCase().trim())}
        />
      </InputGroup>
      <InputGroup size="sm" className="pt-3">
        <InputGroup.Checkbox
          value="latestBlockHeight"
          checked={selectedOption === "latestBlockHeight"}
          onChange={handleOptionChange}
          aria-label="Checkbox for following text input"
        />
        <InputGroup.Text>Start from latest block</InputGroup.Text>
      </InputGroup>
      <InputGroup size="sm" className="px-1 pt-3">
        <InputGroup.Checkbox
          value="specificBlockHeight"
          checked={selectedOption === "specificBlockHeight"}
          onChange={handleOptionChange}
          aria-label="Checkbox for following text input"
        />
        <InputGroup.Text>Start from block height</InputGroup.Text>
        <Form.Control
          value={blockHeight}
          onChange={(e) => setBlockHeight(parseInt(e.target.value))}
          type="number"
        />
        {blockHeightError && (
          <Alert className="px-3 mt-3" variant="danger">
            {blockHeightError}
          </Alert>
        )}
      </InputGroup>
      <InputGroup size="sm" hasValidation={true} className="pt-3">
        <InputGroup.Text>Contract Filter</InputGroup.Text>
        <Form.Control
          value={contractFilter}
          onChange={handleSetContractFilter}
          isValid={isContractFilterValid}
          type="text"
          placeholder="social.near"
          required={true}
        />
        <Form.Control.Feedback type="invalid">
          Please provide a valid contract name.
        </Form.Control.Feedback>
      </InputGroup>
    </>
  );
};

export default IndexerConfigOptions;
