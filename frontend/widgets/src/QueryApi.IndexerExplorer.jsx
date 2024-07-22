const myAccountId = context.accountId;

const [selectedTab, setSelectedTab] = useState(props.tab && props.tab !== "all" ? props.tab : "all");
const [myIndexers, setMyIndexers] = useState([]);
const [allIndexers, setAllIndexers] = useState([]);
const [error, setError] = useState(null);
const [indexerMetadata, setIndexerMetaData] = useState(new Map());
const [loading, setLoading] = useState(false);


let graphQLEndpoint = `${REPL_GRAPHQL_ENDPOINT}`;

const fetchGraphQL = (operationsDoc, operationName, variables) => {
  return asyncFetch(`${graphQLEndpoint}/v1/graphql`, {
    method: "POST",
    headers: {
      "x-hasura-role": "dataplatform_near",
    },
    body: JSON.stringify({
      query: operationsDoc,
      variables: variables,
      operationName: operationName,
    }),
  });
}
const tableName = "dataplatform_near_queryapi_indexer_indexers";

const GET_ALL_ACTIVE_INDEXERS = `
query getAllActiveIndexers {
  ${tableName}(where: {is_removed: {_eq: false}}) {
    author_account_id
    indexer_name
  }
}
`;
const fetchIndexerData = () => {
  setLoading(true);
  const allIndexers = [];
  const myIndexers = [];

  fetchGraphQL(GET_ALL_ACTIVE_INDEXERS, 'getAllActiveIndexers', {})
    .then((result) => {
      if (result.status === 200) {
        const data = result?.body?.data?.[tableName];
        if (Array.isArray(data)) {
          data.forEach(({ author_account_id, indexer_name }) => {
            const indexer = {
              accountId: author_account_id,
              indexerName: indexer_name,
            };
            if (author_account_id === myAccountId) myIndexers.push(indexer);
            allIndexers.push(indexer);
          });
        } 
      } else {
        console.error('Failed to fetch data:', result);
      }

      setMyIndexers(myIndexers);
      setAllIndexers(allIndexers);
      setLoading(false);
    })
    .catch((error) => {
      console.error('An error occurred while fetching indexer data:', error);
      setLoading(false);
    });
};


const storeIndexerMetaData = () => {
  const url = `${REPL_QUERY_API_USAGE_URL}`;

  asyncFetch(url)
    .then(response => {
      if (!response.ok) {
        setError('There was an error fetching the data');
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const { data } = JSON.parse(response.body);
      const map = new Map();

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
          map.set(`${indexer_account_id}/${indexer_name}`, indexer);
        });
      });
      setIndexerMetaData(map);
      setError(null);
    })
}

useEffect(() => {
  fetchIndexerData();
  storeIndexerMetaData();
}, []);

const Container = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
`;

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
  padding: 1rem;

  @media (max-width: 1200px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 800px) {
    grid-template-columns: 1fr;
  }
`;

const Item = styled.div`
  background-color: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  transition: transform 0.3s, box-shadow 0.3s;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2);
  }
`;


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


const NavBarContainer = styled.div`
  display: flex;
  align-items: center;
  background-color: #f0f0f0;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid #ccc;
  justify-content: space-between;
`;

const LeftGroup = styled.div`
  display: flex;
  align-items: center;
`;

const NavBarLogo = styled.a`
  display: flex;
  align-items: center;
  color: #333;
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: bold;
  margin-right: 1rem;
  &:hover {
    text-decoration: none;
    color: #333;
  }

`;

const SignUpLink = styled.a`
  color: #0070f3;
  text-decoration: none;
  font-size: 0.75rem;
  margin-left: 1rem;
`;

const ButtonWrapper = styled.div`
  display: flex;
  align-items: center;
`;
const ButtonLink = styled.a`
  display: inline-block;
  padding: 0.5rem 1rem;
  background-color: black;
  color: #fff;
  text-decoration: none;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.3s, color 0.3s, transform 0.2s;

  &:hover {
    background-color: #333;
    color: #fff;
    text-decoration: none;
    outline: none;
  }

  &:focus {
    outline: none;
    text-decoration: none;
  }
`;

const ToggleWrapper = styled.div`
  display: flex;
  align-items: center;
`;

const ToggleButton = styled.button`
  flex: 1;
  padding: 0.5rem;
  border: none;
  border-radius: 20px;
  background-color: ${props => (props.selected ? 'black' : '#e0e0e0')};
  color: ${props => (props.selected ? '#fff' : '#333')};
  font-size: 0.75rem;
  font-weight: ${props => (props.selected ? 'bold' : 'normal')};
  cursor: pointer;
  transition: background-color 0.3s, color 0.3s, transform 0.2s;
  text-align: center;
  min-width: 100px;
  max-width: 150px;
  
  &:not(:last-child) {
    margin-right: 4px;
  }

  &:hover {
    background-color: ${props => (props.selected ? '#333' : '#d0d0d0')};
    color: ${props => (props.selected ? '#fff' : '#000')};
  }

  &:focus {
    outline: none;
  }
`;

const LoadingSpinner = () => {
  const spinnerStyle = {
    width: '40px',
    height: '40px',
    border: '4px solid rgba(0, 0, 0, 0.1)',
    borderLeftColor: 'black',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    textAlign: 'center',
    display: 'flex',
    justifyContent: 'center',
    alignCenter: 'center',
  };

  const LoadingContainer = styled.div`
    text-align: center;
    width: 100%;
    height: 100%;
  `;

  const LoadingSpinnerContainer = styled.div`
    display: flex;
    justify-content: center;
    font-size: 14px;
  `
  return <LoadingContainer>
    <LoadingSpinnerContainer>
      <div style={spinnerStyle} />
    </LoadingSpinnerContainer>
    <>{selectedTab === "my-indexers" ? "Loading Your Indexers" : "Loading All Indexers"}</>
  </LoadingContainer>;
};

return (
  <Wrapper>

    <NavBarContainer>
      <LeftGroup>
        <ToggleWrapper>
          <ToggleButton
            onClick={() => setSelectedTab("my-indexers")}
            selected={selectedTab === "my-indexers"}
          >
            My Indexers
          </ToggleButton>
          <ToggleButton
            onClick={() => setSelectedTab("all")}
            selected={selectedTab === "all"}
          >
            All Indexers
          </ToggleButton>
        </ToggleWrapper>

        <SignUpLink target="_blank" href={`https://docs.near.org/build/data-infrastructure/query-api/intro`}>
          (Documentation)
        </SignUpLink>
      </LeftGroup>

      <ButtonWrapper>
        <ButtonLink
          href={`/${REPL_ACCOUNT_ID}/widget/QueryApi.App/?view=create-new-indexer`}
          onClick={() => {
            setActiveTab("create-new-indexer");
            setSelectedIndexerName("");
            selectTab("create-new-indexer");
          }}
        >
          Create New Indexer
        </ButtonLink>
      </ButtonWrapper>
    </NavBarContainer>

    {error && <Text>{error}</Text>}

    {selectedTab === "all" && (
      <>
        {loading ? (
          <Container>
            <LoadingSpinner />
          </Container>
        ) : (
          <Items>
            {allIndexers.map((indexer, i) => (
              <Item key={i}>
                <Widget
                  src={`${REPL_ACCOUNT_ID}/widget/QueryApi.IndexerCard`}
                  props={{ ...indexer, indexerMetadata }}
                />
              </Item>
            ))}
          </Items>
        )}
      </>
    )}

    {selectedTab === "my-indexers" && (
      <>
        {loading ? (
          <Container>
            <LoadingSpinner />
          </Container>
        ) : myIndexers.length === 0 ? (
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
        ) : (
          <Items>
            {myIndexers.map((indexer, i) => (
              <Item key={i}>
                <Widget
                  src={`${REPL_ACCOUNT_ID}/widget/QueryApi.IndexerCard`}
                  props={{ ...indexer, indexerMetadata }}
                />
              </Item>
            ))}
          </Items>
        )}
      </>
    )}
  </Wrapper >
);
