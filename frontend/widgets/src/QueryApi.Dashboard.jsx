const accountId = context.accountId;

const [activeTab, setActiveTab] = useState(props.view === "create-new-indexer" ? "create-new-indexer" : props.selectedIndexerPath ? "indexer" : "explore");
const [activeIndexerTabView, setActiveIndexerTabView] = useState(props.activeIndexerView ?? "editor");

const [allIndexers, setAllIndexers] = useState([]);
const [checkboxState, setCheckboxState] = useState(initialCheckboxState);

const checkBoxData = [
  {
    method_name: 'harvest_meta',
    schema: {
      type: 'object',
    },
  },
  {
    method_name: 'ADD_KEY',
    schema: {
      type: 'object',
    },
  },
  {
    method_name: 'add_authorized_farm_token',
    schema: {
      type: 'object',
      properties: {
        token_id: {
          type: 'string',
        },
      },
      required: ['token_id'],
    },
  },
  {
    method_name: 'add_authorized_user',
    schema: {
      type: 'object',
      properties: {
        accoint_id: {
          type: 'string',
        },
      },
      required: ['accoint_id'],
    },
  },
];

useEffect(() => {
  Near.asyncView(`${REPL_REGISTRY_CONTRACT_ID}`, "list_all").then((data) => {
    const indexers = [];
    Object.keys(data).forEach((accountId) => {
      Object.keys(data[accountId]).forEach((functionName) => {
        indexers.push({
          accountId: accountId,
          indexerName: functionName,
        });
      });
    });
    setAllIndexers(indexers)
  });
}, []);

const initialCheckboxState = checkBoxData.reduce((acc, item) => {
  acc[item.method_name] = false;
  if (item.schema.properties) {
    Object.keys(item.schema.properties).forEach(property => {
      acc[`${item.method_name}::${property}`] = false;
    });
  }
  return acc;
}, {});

const handleParentChange = (methodName) => {
  const newState = { ...checkboxState };
  const isChecked = !checkboxState[methodName];
  newState[methodName] = isChecked;
  checkBoxData.forEach(item => {
    if (item.method_name === methodName && item.schema.properties) {
      Object.keys(item.schema.properties).forEach(property => {
        newState[`${methodName}::${property}`] = isChecked;
      });
    }
  });
  setCheckboxState(newState);
};

const handleChildChange = (childId) => {
  setCheckboxState({
    ...checkboxState,
    [childId]: !checkboxState[childId],
  });
};

const CheckboxContainer = styled.div`
  margin-bottom: 10px;
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  cursor: pointer;
  font-size: 16px;
  margin-bottom: 5px;
`;

const SubCheckboxContainer = styled.div`
  margin-left: 20px;
  border-left: 2px solid #ccc;
  padding-left: 10px;
`;

const Checkbox = styled.input`
  margin-right: 10px;
  cursor: pointer;
`;

// TOP HALF
const Hero = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 349px; /* Static height */
  width: 100%; /* Full width */
  background: linear-gradient(
    268.88deg, 
    rgba(2, 255, 133, 0.2) 1.75%, 
    rgba(2, 133, 255, 0.08) 54.6%, 
    rgba(2, 27, 255, 0.08) 84.31%
  );
  // , url('https://s3-alpha-sig.figma.com/img/f856/12b1/14c8f8fd2894d48314a47b98531b3002?Expires=1720396800&Key-Pair-Id=APKAQ4GOSFWCVNEHN3O4&Signature=iC8KBVqIyZDHU2~xisqW3kuwC8nLk5POGZqHyVGNcAWcLwep3jEocxIrZI9hR5VUfiXwetmD6pXTdHxScqfIMjwvIsccAhEAkzD9t5xasMfuC5vHKel9t96-CGMeMikD3No92ObNZ-eGFdo2QAnrNVNxufsdwhYUKRbXuZSquC2A2qx9kzYxv7pyUjR3QGxg8UkMqhmZiKogoiLL~727aERO3PUIiSlMMH~kRFKVyK4UnJFERuroJ9L3EZTfgBG90EUM5MYTVqLIeeA1gWeYPkfTlYghAWwOx60B2wdLk5WTgmqytRZxbqsCiN8u92ZKZjmBzFcZZcWF9eONAqdDvA__');
  // background-size: 100%;
  // background-position: right;
  // background-repeat: no-repeat;
`;

const Headline = styled.h1`
  font-family: 'FK Grotesk Variable', sans-serif;
  font-weight: 700;
  width: 369px;
  font-size: 24px;
  line-height: 31.2px;
`;

const Subheadline = styled.p`
  font-family: 'Mona Sans', sans-serif;
  font-weight: 400;
  font-size: 14px;
  line-height: 18.2px;
  letter-spacing: 1.5%;
`;

const Container = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
`;

const HeadlineContainer = styled.div`
  width: 364px;
  height: 168px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  margin-right: 80px; /* Gap between HeadlineContainer and WidgetContainer */
`;

const WidgetContainer = styled.div`
  width: 301px;
  height: 365px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  box-shadow: 0 8.2px 19.92px 0 rgba(0, 0, 0, 0.1), 0 2.34px 2.34px 0 rgba(0, 0, 0, 0.15);
  margin-top: 158px; /* Gap between WidgetContainer and HeadlineContainer */
  background: #fff;
  border-radius: 10px;
`;

const SubContainer = styled.div`
  width: 262.5px;
  height: 330px; //270px later
`;

const SubContainerTitle = styled.h2`
  font-family: 'Product Sans', sans-serif;
  font-weight: 700;
  font-size: 14px;
  line-height: 14.06px;
  color: #333;
  margin: 0;
`;

const SubContainerContent = styled.div` `


const InputWrapper = styled.div`
  display: flex;
  align-items: center;
  width: 364px;
  height: 40px;
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 0;
  overflow: hidden;
`;

const StyledInput = styled.input`
  flex: 1;
  height: 100%;
  border: none;
  outline: none;
  padding: 8px 12px;
  border-radius: 6px 0 0 6px;
`;

const GreenButton = styled.button`
  width: 84px;
  background-color: #37CD83;
  border: none;
  border-radius: 0px 6px 6px 0px;
  color: white;
  cursor: pointer;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

//BOTTOM HALF
const Divider = styled.div`
  height: 40px;
  width: 100%;
`
const ExploreIndexersContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%; /* Static height */
  width: 100%; /* Full width */
`;


const ExploreIndexersHeading = styled.h2`
  font-family: 'FK Grotesk Variable', sans-serif;
  font-size: 20px;
  font-weight: 400;
  line-height: 26px;
  letter-spacing: 0.015em;
  text-align: left;
`;

const ExploreContent = styled.div`
  width: 745px;
  display: flex;
  flex-direction: column;
  gap: 24px;
`

const SearchIndexerContainer = styled.div`
  display: flex;
  align-items: center;
  width: 269px;
  height: 40px;
  padding: 8px 12px;
  gap: 8px;
  border-radius: 50px;
  border: 1px solid #E3E3E0;
  background-color: white;
`;

const SearchInput = styled.input`
  flex: 1;
  border: none;
  outline: none;
  font-family: 'Mona Sans', sans-serif;
  font-weight: 450;
  font-size: 14px;
  line-height: 21px;
  letter-spacing: 2%;
  &::placeholder {
    color: #a9a9a9; /* Example placeholder color */
  }
`;

const SearchIndexerButton = styled.button`
  background-color: transparent;
  border: none;
  color: black;
  padding: 8px 16px;
  cursor: pointer;
  font-family: 'Mona Sans', sans-serif;
  font-weight: 450;
  font-size: 14px;
  line-height: 21px;
  letter-spacing: 2%;
`;

const MagnifyingGlass = styled.span`
  font-size: 14px; /* Adjust as necessary */
  margin-right: 8px; /* Adjust as necessary */
`;

// TABLE

const TableContainer = styled.div`
  width: 745px;
  margin: 0 auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  border-radius: 8px; /* Adjust the border radius as needed */
  overflow: hidden; /* Ensures border radius is applied to the table */
`;

const TableHeader = styled.thead`
  background-color: #F0F0F1;
`;

const TableHeaderCell = styled.th`
  font-family: 'Mona Sans', sans-serif;
  font-weight: 450;
  font-size: 10px;
  line-height: 14px;
  letter-spacing: 2%;
  text-align: left;
  padding: 8px;
`;

const TableRow = styled.tr`
  &:nth-child(even) {
    background-color: #f9f9f9;
  }
`;

const TableCell = styled.td`
  font-family: 'Mona Sans', sans-serif;
  font-weight: 400;
  font-size: 14px;
  line-height: 21px;
  letter-spacing: 2%;
  padding: 8px;
  text-align: left;
`;

const data = allIndexers.map((indexer) => ({
  indexer: indexer.indexerName,
  weeklyRequest: indexer.weeklyRequest || 150,
  lastUpdated: indexer.lastUpdated || '2023-06-25',
  status: indexer.status || 'Active',
}));

function CustomTable() {
  return (
    <TableContainer>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Indexer</TableHeaderCell>
            <TableHeaderCell>Weekly Request</TableHeaderCell>
            <TableHeaderCell>Last Updated</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <tbody>
          {data.map((row, index) => (
            <TableRow key={index}>
              <TableCell>{row.indexer}</TableCell>
              <TableCell>{row.weeklyRequest}</TableCell>
              <TableCell>{row.lastUpdated}</TableCell>
              <TableCell>{row.status}</TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
    </TableContainer>
  );
}

// BELOW IS ORIGINAL STYLED COMPONENTS
const Wrapper = styled.div`
  margin-inline: 12px;
  margin-top: calc(var(--body-top-padding) * -1);
`;

const Main = styled.div`
  display: block;
`;

const Section = styled.div`
  padding-top: 0px;
  border-left: none;
  border-right: none;
  display: ${(p) => (p.active ? "block" : "none")};
  margin: ${(p) => (p.negativeMargin ? "0 -12px" : "0")};
`;

const Tabs = styled.div`
  display: none;
  height: 48px;
  background: #f8f9fa;
  border-top: 1px solid #eceef0;
  border-bottom: 1px solid #eceef0;
  margin-bottom: ${(p) => (p.noMargin ? "0" : p.halfMargin ? "24px" : "24px")};

  display: flex;
  margin-left: -12px;
  margin-right: -12px;

  button {
    flex: 1;
  }
`;


const TabsButton = styled.button`
  font-weight: 600;
  font-size: 14px;
  line-height: 16px;
  padding: 0 12px;
  position: relative;
  color: ${(p) => (p.selected ? "#11181C" : "#687076")};
  background: none;
  border: none;
  outline: none;
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
    background: #0091ff;
  }
`;


const selectTab = (tabName) => {
  Storage.privateSet("queryapi:activeTab", tabName);
  setActiveTab(tabName);
};

const selectIndexerPage = (viewName) => {
  Storage.privateSet("queryapi:activeIndexerTabView", viewName);
  setActiveIndexerTabView(viewName);
};

return (
  <Wrapper negativeMargin={activeTab === "explore"}>
    {/* <Tabs>
      <TabsButton
        type="button"
        onClick={() => selectTab("explore")}
        selected={activeTab === "explore"}
      >
        Explore Indexers
      </TabsButton>
      {activeTab == "create-new-indexer" && (
        <TabsButton
          type="button"
          onClick={() => selectTab("create-new-indexer")}
          selected={activeTab === "create-new-indexer"}
        >
          Create New Indexer
        </TabsButton>
      )}

      {props.selectedIndexerPath && (
        <>
          <TabsButton
            type="button"
            onClick={() => selectTab("indexer")}
            selected={activeTab === "indexer"}
          >
            Indexer ({props.selectedIndexerPath})
          </TabsButton>
        </>
      )}
    </Tabs> */}


    <Main>
      <Section active={activeTab === "explore"}>

        <Hero>
          <Container>
            <HeadlineContainer>
              <Headline>Launch an indexer in minutes</Headline>
              <Subheadline>Get a working indexer exportable to your Near react application faster than ever. Extract on-chain data, and easily query it using GraphQL endpoints and subscriptions.</Subheadline>
              <InputWrapper>
                <StyledInput placeholder="yoursmartcontract.pool.near" />
                <GreenButton>Start</GreenButton>
              </InputWrapper>
            </HeadlineContainer>
            <WidgetContainer>
              <SubContainer>
                <SubContainerTitle>Customize indexer</SubContainerTitle>
                <SubContainerContent>
                  <div>
                    {checkBoxData.map((item, index) => (
                      <CheckboxContainer key={index}>
                        <CheckboxLabel>
                          <Checkbox
                            type="checkbox"
                            id={item.method_name}
                            checked={checkboxState[item.method_name]}
                            onChange={() => handleParentChange(item.method_name)}
                          />
                          {item.method_name}
                        </CheckboxLabel>
                        {item.schema.properties && (
                          <SubCheckboxContainer>
                            {Object.keys(item.schema.properties).map((property, subIndex) => (
                              <CheckboxLabel key={subIndex}>
                                <Checkbox
                                  type="checkbox"
                                  id={`${item.method_name}::${property}`}
                                  checked={checkboxState[`${item.method_name}::${property}`]}
                                  onChange={() => handleChildChange(`${item.method_name}::${property}`)}
                                />
                                {property}: {item.schema.properties[property].type}
                              </CheckboxLabel>
                            ))}
                          </SubCheckboxContainer>
                        )}
                      </CheckboxContainer>
                    ))}
                  </div>
                </SubContainerContent>
              </SubContainer>
            </WidgetContainer>
          </Container>
        </Hero>
        <Divider />
        <ExploreIndexersContainer>
          <ExploreContent>
            <ExploreIndexersHeading>Explore indexers on Near</ExploreIndexersHeading>
            <SearchIndexerContainer>
              <MagnifyingGlass>🔍</MagnifyingGlass>
              <SearchInput placeholder="Search indexers" />
              <SearchIndexerButton>{"➡️"}</SearchIndexerButton>
            </SearchIndexerContainer>
            {CustomTable()}
          </ExploreContent>
        </ExploreIndexersContainer>


      </Section>
    </Main>
  </Wrapper>
);
