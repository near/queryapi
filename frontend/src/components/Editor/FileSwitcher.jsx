import React, { useContext, useState } from "react";
import { InputGroup, ToggleButtonGroup, ToggleButton } from "react-bootstrap";
import Switch from "react-switch";
import { IndexerDetailsContext } from '../../contexts/IndexerDetailsContext';

export function FileSwitcher({
  fileName,
  setFileName,
  diffView,
  setDiffView,
  v2Toggle,
  setV2Toggle,
}) {
  const { debugMode, setDebugMode, isCreateNewIndexer } = useContext(IndexerDetailsContext);
  return (
    <>
      <ToggleButtonGroup
        type="radio"
        style={{ backgroundColor: "white" }}
        name="options"
        defaultValue={"indexingLogic.js"}
      >
        <ToggleButton
          id="tbg-radio-1"
          style={{
            backgroundColor: fileName === "indexingLogic.js" ? "blue" : "grey",
            borderRadius: "0px",
          }}
          value={"indexingLogic.js"}
          onClick={() => setFileName("indexingLogic.js")}
        >
          indexingLogic.js
        </ToggleButton>
        <ToggleButton
          id="tbg-radio-2"
          style={{
            backgroundColor: fileName === "schema.sql" ? "blue" : "grey",
            borderRadius: "0px",
          }}
          value={"schema.sql"}
          onClick={() => setFileName("schema.sql")}
        >
          schema.sql
        </ToggleButton>
        {!isCreateNewIndexer &&
          <ToggleButton
            id="tbg-radio-3"
            style={{
              backgroundColor: fileName === "GraphiQL" ? "blue" : "grey",
              borderRadius: "0px",
            }}
            value={"GraphiQL"}
            onClick={() => setFileName("GraphiQL")}
          >
            GraphiQL
          </ToggleButton>}
        <InputGroup>
          <InputGroup.Text className="px-3">
            Diff View
            <Switch
              className="px-1"
              checked={diffView}
              onChange={(checked) => {
                setDiffView(checked);
              }}
            />
          </InputGroup.Text>
          <InputGroup.Text className="px-3">
            Debug Mode
            <Switch
              className="px-1"
              checked={debugMode}
              onChange={(checked) => {
                setDebugMode(checked);
              }}
            />
          </InputGroup.Text>
          <InputGroup.Text className="px-3">
            Try V2
            <Switch
              className="px-1"
              checked={v2Toggle}
              onChange={(checked) => {
                setV2Toggle(checked);
              }}
            />
          </InputGroup.Text>
        </InputGroup>
        {/* <InputGroup> */}
        {/*   <InputGroup.Text className="px-3"> */}
        {/*     {" "} */}
        {/*     Block View */}
        {/*     <Switch */}
        {/*       className="px-1" */}
        {/*       checked={blockView} */}
        {/*       onChange={(checked) => { */}
        {/*         setBlockView(checked); */}
        {/*       }} */}
        {/*     /> */}
        {/*   </InputGroup.Text> */}
        {/* </InputGroup> */}
      </ToggleButtonGroup>
    </>
  );
}
