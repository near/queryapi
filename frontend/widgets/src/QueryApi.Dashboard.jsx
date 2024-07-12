const accountId = context.accountId;
const [selected_accountId, selected_indexerName] = props.selectedIndexerPath ? props.selectedIndexerPath.split("/") : [undefined, undefined];
const limit = 7;

const [activeTab, setActiveTab] = useState(props.view === "create-new-indexer" ? "create-new-indexer" : props.selectedIndexerPath ? "indexer" : "explore");
const [activeIndexerTabView, setActiveIndexerTabView] = useState(props.activeIndexerView ?? "editor");
const [myIndexers, setMyIndexers] = useState([]);
const [allIndexers, setAllIndexers] = useState([]);
const [selectedIndexerName, setSelectedIndexerName] = useState('')
const [checkedItems, setCheckedItems] = useState({});

const CheckboxContainer = styled.div`
  margin-bottom: 16px;
`;

const CheckboxLabel = styled.label`
  display: block;
  margin-bottom: 8px;
`;

const SubCheckboxContainer = styled.div`
  margin-left: 24px;
  margin-top: 8px;
`;

const Checkbox = styled.input`
  margin-right: 8px;
`;

const handleParentChange = (methodName) => {
  setCheckedItems((prevState) => {
    const newState = { ...prevState };
    const parentChecked = !prevState[methodName];

    newState[methodName] = parentChecked;

    // Check/uncheck immediate sub-checkboxes
    if (parentChecked) {
      checkboxData.forEach((item) => {
        if (item.method_name === methodName && item.schema.properties) {
          Object.keys(item.schema.properties).forEach((property) => {
            newState[`${methodName}_${property}`] = true;
          });
        }
      });
    } else {
      // Uncheck all sub-checkboxes if parent is unchecked
      checkboxData.forEach((item) => {
        if (item.method_name === methodName && item.schema.properties) {
          Object.keys(item.schema.properties).forEach((property) => {
            newState[`${methodName}_${property}`] = false;
          });
        }
      });
    }

    return newState;
  });
};

const handleChildChange = (parent, child) => {
  setCheckedItems((prevState) => ({
    ...prevState,
    [`${parent}_${child}`]: !prevState[`${parent}_${child}`],
  }));
};


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

  let my_indexers = indexers.filter(
    (indexer) => indexer.accountId === accountId
  );

  setMyIndexers(my_indexers);
  setAllIndexers(indexers)
});

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
const Subheading = styled.h2`
  display: block;
  margin: 0;
  font-size: 14px;
  line-height: 20px;
  color: ${(p) => (p.bold ? "#11181C !important" : "#687076 !important")};
  font-weight: ${(p) => (p.bold ? "600" : "400")};
  font-size: ${(p) => (p.small ? "12px" : "14px")};
  overflow: ${(p) => (p.ellipsis ? "hidden" : "visible")};
  text-overflow: ${(p) => (p.ellipsis ? "ellipsis" : "unset")};
  white-space: nowrap;
  outline: none;
`;

const Editor = styled.div`
`;
const Status = styled.div`
`;

const Wrapper = styled.div`
  margin-inline: 12px;
  margin-top: calc(var(--body-top-padding) * -1);
`;

const NavBarLogo = styled.a`
  padding-top: 0.3125rem;
  padding-bottom: 0.3125rem;
  margin-right: .01rem;
  font-size: 1.25rem;
  text-decoration: none;
  white-space: nowrap;
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
const Content = styled.div`
  background-color: #f7f7f7;
  padding: 2em;
  border-radius: 5px;
`;

const Title = styled.h1`
  font-size: 1.5em;
  text-align: center;
  color: palevioletred;
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
const H2 = styled.h2`
  font-size: 19px;
  line-height: 22px;
  color: #11181c;
  margin: 0 0 8px;
`;
const Card = styled.div`
  border-radius: 12px;
  background: #fff;
  border: ${(div) => (div.selected ? "1px solid black" : "1px solid #eceef0")};
  box-shadow: 0px 1px 3px rgba(16, 24, 40, 0.1),
    0px 1px 2px rgba(16, 24, 40, 0.06);
`;

const CardBody = styled.div`
  padding: 16px;
  display: flex;
  gap: 16px;
  align-items: center;

  > * {
    min-width: 0;
  }
`;

const CardFooter = styled.div`
  display: flex;
  justify-content: space-around;
  flex-wrap: wrap;
  gap: 4px;
  padding: 16px;
  border-top: 1px solid #eceef0;
`;

const TextLink = styled.a`
  display: block;
  margin: 0;
  font-size: 14px;
  line-height: 20px;
  color: ${(p) => (p.bold ? "#11181C !important" : "#687076 !important")};
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

const Thumbnail = styled.a`
  display: block;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border: 1px solid #eceef0;
  border-radius: 8px;
  overflow: hidden;
  outline: none;
  transition: border-color 200ms;

  &:focus,
  &:hover {
    border-color: #d0d5dd;
  }

  img {
    object-fit: cover;
    width: 100%;
    height: 100%;
  }
`;

const CardWrapper = styled.div`
  margin: 0 0 16px;
`;

const sharedButtonStyles = `
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  margin-bottom: 12px;
  height: 32px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 12px;
  line-height: 15px;
  text-align: center;
  cursor: pointer;

  &:hover,
  &:focus {
    text-decoration: none;
    outline: none;
  }

  i {
    color: #7E868C;
  }

  .bi-16 {
    font-size: 16px;
  }
`;

const Button = styled.button`
  ${sharedButtonStyles}
  color: ${(p) => (p.primary ? "#fff" : "#11181C")} !important;
  background: ${(p) => (p.primary ? "#0091FF" : "#FBFCFD")};
  border: ${(p) => (p.primary ? "none" : "1px solid #D7DBDF")};

  &:hover,
  &:focus {
    background: ${(p) => (p.primary ? "#0484e5" : "#ECEDEE")};
  }
`;

const ButtonLink = styled.a`
  ${sharedButtonStyles}
  color: ${(p) => {
    if (p.primary) return "#fff";
    else if (p.danger) return "#fff";
    else return "#11181C";
  }} !important;
  background: ${(p) => {
    if (p.primary) return "#0091FF";
    else if (p.danger) return "#dc3545";
    else return "#FBFCFD";
  }};
  border: ${(p) => (p.primary ? "none" : "1px solid #D7DBDF")};

  &:hover,
  &:focus {
    background: ${(p) => {
    if (p.primary) return "#0484e5";
    else if (p.danger) return "#b22b38";
    else return "#ECEDEE";
  }}
`;

const SignUpLink = styled.a`
  --blue: RGBA(13, 110, 253, 1);
  display: ${({ hidden }) => (hidden ? "none" : "inline-block")};
  font-size: 14px;
  cursor: pointer;
  color: var(--blue);
  text-decoration: none;
  margin-left: 0.1em;
  padding: 0;
  white-space: nowrap;

  &:hover {
    color: var(--blue);
    text-decoration: none;
  }

  &:visited {
    color: var(--blue);
    text-decoration: none;
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

const indexerView = (accountId, indexerName) => {
  const editUrl = `https://dev.near.org/${REPL_ACCOUNT_ID}/widget/QueryApi.App?selectedIndexerPath=${accountId}/${indexerName}`;
  const statusUrl = `https://dev.near.org/${REPL_ACCOUNT_ID}/widget/QueryApi.App?selectedIndexerPath=${accountId}/${indexerName}&view=indexer&activeIndexerView=status`;
  const playgroundLink = `https://cloud.hasura.io/public/graphiql?endpoint=${REPL_GRAPHQL_ENDPOINT}/v1/graphql&header=x-hasura-role%3A${accountId.replaceAll(
    ".",
    "_"
  )}`;

  return (
    <Card>
      <CardBody>
        <Thumbnail>
          <Widget
            src="mob.near/widget/Image"
            props={{
              image: metadata.image,
              fallbackUrl:
                "https://upload.wikimedia.org/wikipedia/commons/8/86/Database-icon.svg",
              alt: "Near QueryApi indexer",
            }}
          />
        </Thumbnail>

        <div>
          <TextLink as="a" bold ellipsis>
            {indexerName}
          </TextLink>
          <TextLink as="a" ellipsis>
            @{accountId}
          </TextLink>
        </div>
      </CardBody>

      <CardFooter className="flex justify-center items-center">
        <ButtonLink onClick={() => selectIndexerPage("status")}>
          View Status
        </ButtonLink>
        <ButtonLink primary onClick={() => selectIndexerPage("editor")}>
          {accountId === context.accountId ? "Edit Indexer" : "View Indexer"}
        </ButtonLink>
        <ButtonLink href={playgroundLink} target="_blank">
          View In Playground
        </ButtonLink>
      </CardFooter>
    </Card>
  );
};


return (
  <Wrapper negativeMargin={activeTab === "explore"}>
    <Tabs>
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
    </Tabs>


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
                            onChange={() => handleParentChange(item.method_name)}
                            type="checkbox" id={item.method_name} />
                          {item.method_name}
                        </CheckboxLabel>
                        {item.schema.properties && (
                          <SubCheckboxContainer>
                            {Object.keys(item.schema.properties).map((property, subIndex) => (
                              <CheckboxLabel key={subIndex}>
                                <Checkbox type="checkbox" id={`${item.method_name}_${property}`}
                                  onChange={() => handleChildChange(item.method_name, property)}
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


        {/* <NavBarLogo
          href={`https://dev.near.org/${REPL_ACCOUNT_ID}/widget/QueryApi.App`}
          title="QueryApi"
          onClick={() => selectTab("explore")}
        >
          <Widget
            src="mob.near/widget/Image"
            props={{
              className: "d-inline-block align-text-top me-2",
              image: metadata.image,
              style: { height: "24px" },
              fallbackUrl:
                "https://upload.wikimedia.org/wikipedia/commons/8/86/Database-icon.svg",
              alt: "the queryapi logo",
            }}
          />
          QueryApi
        </NavBarLogo>

        <SignUpLink target="_blank" href={`https://docs.near.org/build/data-infrastructure/query-api/intro`}>
          (Documentation)
        </SignUpLink>
        <div>
          <ButtonLink
            href={`/${REPL_ACCOUNT_ID}/widget/QueryApi.App/?view=create-new-indexer`}
            style={{ "margin-top": "10px" }}
            onClick={() => {
              setSelectedIndexerName("");
              State.update({
                activeTab: "create-new-indexer",
              });
              selectTab("create-new-indexer");
            }}
          >
            Create New Indexer
          </ButtonLink>
          {myIndexers.length > 0 && (
            <H2>
              {accountId}'s Indexers
              <span>({myIndexers.length})</span>
            </H2>
          )}
          <Widget
            src={`${REPL_ACCOUNT_ID}/widget/QueryApi.IndexerExplorer`}
          />
        </div> */}
      </Section>













      <Section
        negativeMargin
        primary
        active={activeTab === "create-new-indexer"}
      >
        {activeTab === "create-new-indexer" && (
          <div>
            <Widget
              src={`${REPL_ACCOUNT_ID}/widget/QueryApi.Editor`}
              props={{
                indexerName:
                  selected_indexerName ?? state.indexers[0].indexerName,
                accountId: selected_accountId ?? state.indexers[0].accountId,
                path: "create-new-indexer",
              }}
            />
          </div>
        )}
      </Section>
      <Section negativeMargin primary active={activeTab === "indexer"}>
        <Editor>
          {state.indexers.length > 0 &&
            (selectedIndexerName ? (
              <H2>{selectedIndexerName}</H2>
            ) : (
              <H2>{`${state.indexers[0].accountId}/${state.indexers[0].indexerName}`}</H2>
            ))}
          <Widget
            src={`${REPL_ACCOUNT_ID}/widget/QueryApi.Editor`}
            props={{
              indexerName:
                selected_indexerName ?? state.indexers[0].indexerName,
              accountId: selected_accountId ?? state.indexers[0].accountId,
              path: "query-api-editor",
              tab: props.tab,
              activeView: activeIndexerView
            }}
          />
        </Editor>
        {activeTab === "create-new-indexer" && (
          <div>
            {state.indexers.length > 0 &&
              (selectedIndexerName ? (
                <H2>{selectedIndexerName}</H2>
              ) : (
                <H2>{`${state.indexers[0].accountId}/${state.indexers[0].indexerName}`}</H2>
              ))}
            <Widget
              src={`${REPL_ACCOUNT_ID}/widget/QueryApi.Editor`}
              props={{
                indexerName:
                  selected_indexerName ?? state.indexers[0].indexerName,
                accountId: selected_accountId ?? state.indexers[0].accountId,
                path: "create-new-indexer",
              }}
            />
          </div>
        )}
      </Section>
    </Main>
  </Wrapper>
);
