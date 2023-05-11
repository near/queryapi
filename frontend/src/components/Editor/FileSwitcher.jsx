import { InputGroup, ToggleButtonGroup, ToggleButton } from "react-bootstrap";
import Switch from "react-switch";

export function FileSwitcher({
  fileName,
  setFileName,
  diffView,
  setDiffView,
  blockView,
  setBlockView,
}) {
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
        </ToggleButton>
        <InputGroup>
          <InputGroup.Text className="px-3">
            {" "}
            Diff View
            <Switch
              className="px-1"
              checked={diffView}
              onChange={(checked) => {
                setDiffView(checked);
              }}
            />
          </InputGroup.Text>
        </InputGroup>
        <InputGroup>
          <InputGroup.Text className="px-3">
            {" "}
            Block View
            <Switch
              className="px-1"
              checked={blockView}
              onChange={(checked) => {
                setBlockView(checked);
              }}
            />
          </InputGroup.Text>
        </InputGroup>
      </ToggleButtonGroup>
    </>
  );
}
