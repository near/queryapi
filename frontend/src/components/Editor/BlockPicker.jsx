import React, { useState } from "react";
import {
  OverlayTrigger,
  Tooltip,
  Button,
  Badge,
  InputGroup,
  FormControl,
} from "react-bootstrap";

import { XCircle, Play, Plus } from "react-bootstrap-icons";

export const BlockPicker = ({
  heights = [],
  setHeights,
  executeIndexerFunction,
}) => {
  const [inputValue, setInputValue] = useState("");

  const addHeight = () => {
    if (heights.length < 10 && inputValue !== "") {
      setHeights([...heights, inputValue]);
      setInputValue("");
    }
  };

  const removeHeight = (index) => {
    setHeights(heights.filter((_, i) => i !== index));
  };

  return (
    <div>
      <InputGroup className="mb-3">
        <FormControl
          placeholder="Block height"
          aria-label="Block height"
          aria-describedby="basic-addon2"
          type="number"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />
        <InputGroup>
          <Button variant="outline-secondary" onClick={addHeight}>
            <Plus size={24} style={{ cursor: "pointer" }} className="pl-2" />
          </Button>
        </InputGroup>
        <OverlayTrigger
          overlay={<Tooltip>Test Indexer Function In Browser</Tooltip>}
        >
          <Button
            className="mx-2 w-40"
            size="sm"
            variant="primary"
            onClick={() => executeIndexerFunction()}
          >
            <Play size={24} />
          </Button>
        </OverlayTrigger>
      </InputGroup>

      <div>
        {heights.map((height, index) => (
          <Badge pill variant="primary" className="pl-3 mr-2" key={index}>
            {height}
            <XCircle
              size={24}
              style={{ cursor: "pointer" }}
              className="pl-2"
              onClick={() => removeHeight(index)}
            />
          </Badge>
        ))}
      </div>
    </div>
  );
};
