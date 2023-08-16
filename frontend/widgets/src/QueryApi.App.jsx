const view = props.view;
const path = props.path;
const tab = props.tab;
const selectedIndexerPath = props.selectedIndexerPath;
console.log(`${REPL_ACCOUNT_ID}`, "loaded the account")

return (
  <Widget
    src={`${REPL_ACCOUNT_ID}/widget/QueryApi.Dashboard`}
    props={{
      view,
      path,
      tab,
      selectedIndexerPath,
    }}
  />
);
