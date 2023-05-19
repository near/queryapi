import React, { useState } from "react";
import {
  OverlayTrigger,
  Tooltip,
  Button,
  Badge,
  InputGroup,
  FormControl,
} from "react-bootstrap";

import { Play, Plus } from "react-bootstrap-icons";

export const BlockPicker = ({
  heights = [],
  setHeights,
  executeIndexerFunction,
  latestHeight,
}) => {
  const [inputValue, setInputValue] = useState(String(latestHeight));

  const addHeight = () => {
    if (heights.length < 10 && inputValue !== "") {
      setHeights([...heights, inputValue]);
      setInputValue("");
    }
  };

  return (
    <div>
      <div className="w-100 flex">
        <InputGroup className="fit-content">
          <FormControl
            placeholder="Block height"
            aria-label="Block height"
            aria-describedby="basic-addon2"
            type="number"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <Button variant="outline-secondary" onClick={addHeight}>
            <Plus size={24} style={{ cursor: "pointer" }} />
          </Button>
          <OverlayTrigger
            placement="bottom"
            overlay={<Tooltip>Test Indexer Function In Browser</Tooltip>}
          >
            <Button
              className="mx-2"
              size="sm"
              variant="primary"
              onClick={() => executeIndexerFunction()}
            >
              <Play size={24} />
            </Button>
          </OverlayTrigger>
        </InputGroup>
      </div>
    </div>
  );
};
