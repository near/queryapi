const view = props.view;
const path = props.path;
const tab = props.tab;
const selectedIndexerPath = props.selectedIndexerPath;

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
