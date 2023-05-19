const path = props.path || "query-api-editor";
const tab = props.tab || "";
const REGISTRY_CONTRACT_ID =
  props.REGISTRY_CONTRACT_ID || "queryapi.dataplatform.near";
let accountId = props.accountId || context.accountId;
let externalAppUrl =
  props.EXTERNAL_APP_URL || "https://queryapi-frontend-24ktefolwq-ew.a.run.app";
externalAppUrl += `/${path}?accountId=${accountId}`;
// let externalAppUrl = `http://localhost:3000/${path}?accountId=${accountId}`;

if (props.indexerName) {
  externalAppUrl += `&indexerName=${props.indexerName}`;
}
const initialViewHeight = 1000;
if (!context.accountId) {
  return "Please sign in to use this widget.";
}

const initialPayload = {
  height: Near.block("optimistic").header.height,
  selectedTab: tab,
  currentUserAccountId: context.accountId,
};

const registerFunctionHandler = (request, response) => {
  const gas = 200000000000000;
  const { indexerName, code, schema, blockHeight, contractFilter } =
    request.payload;

  const jsonFilter = `{"indexer_rule_kind":"Action","matching_rule":{"rule":"ACTION_ANY","affected_account_id":"${contractFilter || "social.near"}","status":"SUCCESS"}}`

  Near.call(
    REGISTRY_CONTRACT_ID,
    "register_indexer_function",
    {
      function_name: indexerName,
      code,
      schema,
      start_block_height: blockHeight,
      filter_json: jsonFilter 
    },
    gas
  );
};

let deleteIndexer = (request) => {
  const { indexerName } = request.payload;
  const gas = 200000000000000;
  Near.call(
    REGISTRY_CONTRACT_ID,
    "remove_indexer_function",
    {
      function_name: indexerName,
    },
    gas
  );
};
/**
 * Request Handlers here
 */
const requestHandler = (request, response) => {
  switch (request.type) {
    case "register-function":
      registerFunctionHandler(request, response);
      break;
    case "delete-indexer":
      deleteIndexer(request, response);
      break;
    case "default":
      console.log("default case");
  }
};

// NearSocialBridgeCore widget is the core that makes all the "magic" happens
return (
  <Widget
    src={"wendersonpires.near/widget/NearSocialBridgeCore"}
    props={{
      externalAppUrl,
      path,
      initialViewHeight,
      initialPayload,
      requestHandler,
    }}
  />
);
