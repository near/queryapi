// EditorButtons.jsx

import React from "react";
import {
  ButtonToolbar,
  ButtonGroup,
  OverlayTrigger,
  Tooltip,
  Button,
} from "react-bootstrap";
import {
  ArrowCounterclockwise,
  Justify,
  BugFill,
  SendFill,
} from "react-bootstrap-icons";
import IndexerDetailsGroup from "../Form/IndexerDetailsGroup";
import BlockHeightOptions from "../Form/BlockHeightOptionsInputGroup";

const EditorButtons = ({
  accountId,
  indexerNameField,
  setIndexerNameField,
  options,
  selectedOption,
  handleOptionChange,
  blockHeight,
  setBlockHeight,
  setShowResetCodeModel,
  handleFormating,
  executeIndexerFunction,
  currentUserAccountId,
  getActionButtonText,
  submit,
}) => (
  <>
    <ButtonToolbar
      className="pt-3 pb-1 flex-col"
      aria-label="Actions for Editor"
    >
      <IndexerDetailsGroup
        accountId={accountId}
        indexerNameField={indexerNameField}
        setIndexerNameField={setIndexerNameField}
        isCreateNewIndexerPage={options.create_new_indexer}
      />
      <BlockHeightOptions
        selectedOption={selectedOption}
        handleOptionChange={handleOptionChange}
        blockHeight={blockHeight}
        setBlockHeight={setBlockHeight}
      />
    </ButtonToolbar>
    <ButtonToolbar className="py-1 flex-col" aria-label="Actions for Editor">
      <ButtonGroup className="inline-block" aria-label="Action Button Group">
        <OverlayTrigger overlay={<Tooltip>Reset Changes To Code</Tooltip>}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowResetCodeModel(true)}
          >
            <ArrowCounterclockwise size={24} />
          </Button>
        </OverlayTrigger>

        <OverlayTrigger overlay={<Tooltip>Format Code</Tooltip>}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleFormating()}
          >
            <Justify size={24} />
          </Button>
        </OverlayTrigger>
        <OverlayTrigger
          overlay={<Tooltip>Test Indexer Function In Browser</Tooltip>}
        >
          <Button
            className="w-40"
            size="sm"
            variant="secondary"
            onClick={() => executeIndexerFunction(91243919)}
          >
            <BugFill size={24} />
          </Button>
        </OverlayTrigger>
        {currentUserAccountId && (
          <OverlayTrigger overlay={<Tooltip>{getActionButtonText()}</Tooltip>}>
            <Button variant="primary" className="px-3" onClick={() => submit()}>
              {getActionButtonText()}
            </Button>
          </OverlayTrigger>
        )}
      </ButtonGroup>
    </ButtonToolbar>
  </>
);

export default EditorButtons;
