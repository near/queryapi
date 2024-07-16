const accountId = context.accountId;
const santizedAccountId = accountId.replaceAll(".", "_");

const [selectedTab, setSelectedTab] = useState(props.tab && props.tab !== "all" ? props.tab : "all");
const [myIndexers, setMyIndexers] = useState([]);
const [allIndexers, setAllIndexers] = useState([]);
const [error, setError] = useState(null);

const fetchIndexerData = () => {
  const url = `${REPL_QUERY_API_USAGE_URL}`;

  asyncFetch(url)
    .then(response => {
      if (!response.ok) {
        setError('There was an error fetching the data');
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const { data } = JSON.parse(response.body);
      const allIndexers = [];
      const myIndexers = [];

      data.forEach(entry => {
        const { indexer_account_id, indexers } = entry;

        indexers.forEach(({ indexer_name, last_deployment_date, num_deployements, num_queries, original_deployment_date }) => {
          const indexer = {
            accountId: indexer_account_id,
            indexerName: indexer_name,
            lastDeploymentDate: last_deployment_date,
            numDeployements: num_deployements,
            numQueries: num_queries,
            originalDeploymentDate: original_deployment_date
          };

          if (indexer_account_id === santizedAccountId) myIndexers.push(indexer);
          allIndexers.push(indexer);
        });
      });

      setMyIndexers(myIndexers);
      setAllIndexers(allIndexers);
      setError(null);
    })
}


useEffect(() => {
  fetchIndexerData();
}, []);

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
  min-width: 200px;
  max-width: 500px;
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

const TextLink = styled.a`
  margin: 0;
  font-size: 14px;
  line-height: 20px;
  font-weight: ${(p) => (p.bold ? "600" : "400")};
  font-size: ${(p) => (p.small ? "12px" : "14px")};
  overflow: ${(p) => (p.ellipsis ? "hidden" : "visible")};
  text-overflow: ${(p) => (p.ellipsis ? "ellipsis" : "unset")};
  white-space: nowrap;
  outline: none;

  &:focus,
  &:hover {
    text-decoration: underline;
  }
`;

return (
  <Wrapper className="container-xl">
    <Tabs>
      <TabsButton
        onClick={() => setSelectedTab("my-indexers")}
        selected={selectedTab === "my-indexers"}
      >
        My Indexers
      </TabsButton>
      <TabsButton
        onClick={() => setSelectedTab("all")}
        selected={selectedTab === "all"}
      >
        All
      </TabsButton>
    </Tabs>
    {error && <Text>{error}</Text>}
    {selectedTab === "all" && (
      <>
        <Items>
          {allIndexers.map((indexer, i) => (
            <Item key={i}>
              <Widget
                src={`${REPL_ACCOUNT_ID}/widget/QueryApi.IndexerCard`}
                props={{ ...indexer }}
              />
            </Item>
          ))}
        </Items>
      </>
    )}
    {selectedTab === "my-indexers" && myIndexers.length === 0 && (
      <Header>
        <H2>You don't have any indexers yet.</H2>
        <H2>
          QueryAPI streamlines the process of querying specific data from the Near Blockchain. Explore new Indexers and fork them to try it out!
        </H2>
        <H2>
          To learn more about QueryAPI, visit
          <TextLink target="_blank" href="https://docs.near.org/build/data-infrastructure/query-api/indexers" as="a" bold>
            QueryAPI Docs
          </TextLink>
        </H2>
      </Header>
    )}
    <Items>
      {selectedTab === "my-indexers" && (
        <>
          {myIndexers.map((indexer, i) => (
            <Item key={i}>
              <Widget
                src={`${REPL_ACCOUNT_ID}/widget/QueryApi.IndexerCard`}
                props={{ ...indexer }}
              />
            </Item>
          ))}
        </>
      )}
    </Items>
  </Wrapper>
);
