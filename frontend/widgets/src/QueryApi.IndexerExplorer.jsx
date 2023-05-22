const limitPerPage = 5;
const REGISTRY_CONTRACT_ID =
  props.REGISTRY_CONTRACT_ID || "queryapi.dataplatform.near";
let APP_OWNER = props.APP_OWNER || "dev-queryapi.dataplatform.near";
const GRAPHQL_ENDPOINT =
  props.GRAPHQL_ENDPOINT ||
  "https://queryapi-hasura-graphql-24ktefolwq-ew.a.run.app";
let totalIndexers = 0;
const accountId = context.accountId;
State.init({
  currentPage: 0,
  selectedTab: props.tab || "all",
  total_indexers: 0,
  my_indexers: [],
  all_indexers: [],
});

if (props.tab && props.tab !== state.selectedTab) {
  State.update({
    selectedTab: props.tab,
  });
}

Near.asyncView(REGISTRY_CONTRACT_ID, "list_indexer_functions").then((data) => {
  const indexers = [];
  const total_indexers = 0;
  Object.keys(data.All).forEach((accountId) => {
    Object.keys(data.All[accountId]).forEach((functionName) => {
      indexers.push({
        accountId: accountId,
        indexerName: functionName,
      });
      total_indexers += 1;
    });
  });

  let my_indexers = indexers.filter(
    (indexer) => indexer.accountId === accountId
  );
  // const results = indexers.slice(
  //   0,
  //   state.currentPage * limitPerPage + limitPerPage
  // );
  State.update({
    my_indexers: my_indexers,
    all_indexers: indexers,
    total_indexers: total_indexers,
  });
});

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding-bottom: 4px;
  padding-top: 4px;
`;

const Header = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const H1 = styled.h1`
  font-weight: 600;
  font-size: 32px;
  line-height: 39px;
  color: #11181c;
  margin: 0;
`;

const H2 = styled.h2`
  font-weight: 400;
  font-size: 20px;
  line-height: 24px;
  color: #687076;
  margin: 0;
`;

const Text = styled.p`
  margin: 0;
  line-height: 1.5rem;
  color: ${(p) => (p.bold ? "#11181C" : "#687076")} !important;
  font-weight: ${(p) => (p.bold ? "600" : "400")};
  font-size: ${(p) => (p.small ? "12px" : "14px")};
  overflow: ${(p) => (p.ellipsis ? "hidden" : "")};
  text-overflow: ${(p) => (p.ellipsis ? "ellipsis" : "")};
  white-space: ${(p) => (p.ellipsis ? "nowrap" : "")};
  overflow-wrap: anywhere;

  b {
    font-weight: 600;
    color: #11181c;
  }

  &[href] {
    display: inline-flex;
    gap: 0.25rem;

    &:hover,
    &:focus {
      text-decoration: underline;
    }
  }
`;

const Items = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;

  @media (max-width: 1200px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 800px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const Item = styled.div``;

const Button = styled.button`
  display: block;
  width: 100%;
  padding: 8px;
  height: 32px;
  background: #fbfcfd;
  border: 1px solid #d7dbdf;
  border-radius: 50px;
  font-weight: 600;
  font-size: 12px;
  line-height: 15px;
  text-align: center;
  cursor: pointer;
  color: #11181c !important;
  margin: 0;

  &:hover,
  &:focus {
    background: #ecedee;
    text-decoration: none;
    outline: none;
  }

  span {
    color: #687076 !important;
  }
`;

const Tabs = styled.div`
  display: flex;
  height: 48px;
  border-bottom: 1px solid #eceef0;
  overflow: auto;
  scroll-behavior: smooth;

  @media (max-width: 1200px) {
    background: #f8f9fa;
    border-top: 1px solid #eceef0;
    margin-left: -12px;
    margin-right: -12px;

    > * {
      flex: 1;
    }
  }
`;

const TabsButton = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-weight: 600;
  font-size: 12px;
  padding: 0 12px;
  position: relative;
  color: ${(p) => (p.selected ? "#11181C" : "#687076")};
  background: none;
  border: none;
  outline: none;
  text-align: center;
  text-decoration: none !important;
  pointer: cursor;
  &:hover {
    color: #11181c;
  }

  &::after {
    content: "";
    display: ${(p) => (p.selected ? "block" : "none")};
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: #59e692;
  }
`;

return (
  <Wrapper className="container-xl">
    {state.selectedTab == "my-indexers" && state.my_indexers.length == 0 && (
      <Header>
        <H1>
          You currently have no indexers. Explore new Indexers and fork them!
        </H1>
      </Header>
    )}
    <Tabs>
      <TabsButton
        onClick={() => State.update({ selectedTab: "my-indexers" })}
        selected={state.selectedTab === "my-indexers"}
      >
        My Indexers
      </TabsButton>
      <TabsButton
        onClick={() => State.update({ selectedTab: "all" })}
        selected={state.selectedTab === "all"}
      >
        All
      </TabsButton>
    </Tabs>

    {state.selectedTab === "all" && (
      <>
        <Items>
          {state.all_indexers.map((indexer, i) => (
            <Item>
              <Widget
                src="dev-queryapi.dataplatform.near/widget/QueryApi.IndexerCard"
                props={{
                  accountId: indexer.accountId,
                  indexerName: indexer.indexerName,
                  APP_OWNER: APP_OWNER,
                  GRAPHQL_ENDPOINT,
                  appPath: props.appPath,
                }}
              />
            </Item>
          ))}
        </Items>
      </>
    )}
    <Items>
      {state.selectedTab == "my-indexers" && (
        <>
          {state.my_indexers.map((indexer, i) => (
            <Item>
              <Widget
                src="dev-queryapi.dataplatform.near/widget/QueryApi.IndexerCard"
                props={{
                  accountId: indexer.accountId,
                  indexerName: indexer.indexerName,
                  APP_OWNER: APP_OWNER,
                  GRAPHQL_ENDPOINT,
                  appPath: props.appPath,
                }}
              />
            </Item>
          ))}
        </>
      )}
    </Items>
  </Wrapper>
);
