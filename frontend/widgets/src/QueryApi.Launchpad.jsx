const { setActiveTab, activeTab, setSelectedIndexer, setWizardContractFilter, setWizardMethods, setWizardEvents } = props;

const NoQueryContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  height: 100%;
`;

const NoQueryText = styled.p`
  margin-top: 16px;
  font-size: 16px;
  font-family: 'Mona Sans', sans-serif;
  color: #A1A09A;
  text-align: center;
`;

const NoQuerySVG = styled.svg`
  height: 100px;
  width: 100%;
  color: #A1A09A;
`;

const CheckboxContainer = styled.div`
  margin-bottom: 10px;
`;

const CheckboxLabel = styled.label`
  font-size: 12px;
  display: flex;
  align-items: center;
  cursor: pointer;
  margin-bottom: 5px;
`;

const SubCheckboxContainer = styled.div`
  margin-left: 20px;
  border-left: 2px solid #ccc;
  padding-left: 10px;
`;

const Checkbox = styled.input`
  cursor: pointer;
  width: 21.6px;
  height: 21.6px;
  border-radius: 5.4px;
  border: 0.9px solid #DBDBD7;
  padding: 5.4px;
  background-color: #FDFDFC;
  box-shadow: 0 0.9px 1.8px 0 rgba(0, 0, 0, 0.1);
  vertical-align: middle;
  margin-right: 7.2px;
  outline: none;
`;

// TOP HALF
const Hero = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 349px;
  width: 100%; 
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
  font-family: 'Mona Sans', sans-serif;
  font-weight: 700;
  width: 369px;
  font-size: 24px;
  line-height: 31.2px;
`;

const Subheadline = styled.p`
  font-family: 'Mona Sans', sans-serif;
  font-weight: 400;
  font-size: 16px;
  line-height: 18.2px;
  color: #717069;
  letter-spacing: 1.5%;
`;

const Container = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
`;

const HeadlineContainer = styled.div`
  width: 364px;
  height: 193px;
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
  margin-top: 183px; /* Gap between WidgetContainer and HeadlineContainer */
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
  color: #7F7E77;
  margin-bottom: 6px;
`;

const Metadata = styled.div`
  display: flex;
  align-items: center;
  font-size: 12px;
  margin-bottom: 8px;
`;
const MetadataTab = styled.div`
  cursor: pointer;
`;

const MetadataText = styled.span`
display: inline-block;
`;

const MetadataIcon = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: normal; 
  width: 23px; 
  height: 17px;
  border-radius: 50px;
  padding: 4px 6px;
  background-color: #F3F3F2;
`;

const SubContainerContent = styled.div`
  height: 260px;
`
const ScrollableDiv = styled.div`
height: 260px;

width: 100%;
overflow-x: auto; 
overflow-y: auto; 


&::-webkit-scrollbar {
  height: 12px;
}

&::-webkit-scrollbar-thumb {
  background-color: #888;
  border-radius: 6px;
}

&::-webkit-scrollbar-thumb:hover {
  background-color: #555; 
}

&::-webkit-scrollbar-track {
  background: #f1f1f1; 
  border-radius: 6px;
}

&::-webkit-scrollbar-track-piece {
  background: #f9f9f9;
}

scrollbar-width: thin;
scrollbar-color: #888 #f1f1f1; 

-ms-overflow-style: -ms-autohiding-scrollbar; 

-ms-scroll-chaining: none;
-ms-scroll-snap-type: mandatory;
-ms-scroll-snap-points-x: snapInterval(0%, 100%);
`;

const GenerateButton = styled.button`
  margin-top: 16px;
  width: 100%;
  background-color: #37CD83;
  border: none;
  border-radius: 6px 6px 6px 6px;
  color: white;
  cursor: pointer;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  position:relative;
  z-index:10;

  &:disabled {
    background-color: #F3F3F2; 
    color: #999; 
    cursor: not-allowed;
  }
`

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

const ContractInputMessage = styled.p`
  margin-top: 8px;
  height: 25px;
  font-size: 10px;
  color: #D95C4A; 
  width: 100%;
`;

const WarningSVG = styled.svg`
  height: 16px;
  width: 16px;
  margin-right: 4px;
`

const SearchButton = styled.button`
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
    `;

  const LoadingSpinnerContainer = styled.div`
      display: flex;
      justify-content: center;
      font-size: 14px;
    `
  return <LoadingContainer> <LoadingSpinnerContainer><div style={spinnerStyle} /> </LoadingSpinnerContainer><>Generating Methods</></LoadingContainer>;
};


const WILD_CARD = '*';
const validateContractId = (accountId) => {
  accountId = accountId.trim();
  // Check if accountId is a wildcard '*'
  if (accountId === WILD_CARD) return true;
  // Check if accountId length is between 2 and 64 characters
  const isLengthValid = accountId.length >= 2 && accountId.length <= 64;
  if (!isLengthValid) return false;
  // Check if accountId starts with '*.' || '*' remove for part verification
  if (accountId.startsWith('*.')) accountId = accountId.slice(2);
  if (accountId.startsWith('*')) accountId = accountId.slice(1);

  const parts = accountId.split('.');
  for (let part of parts) {
    if (!part.match(/^[a-z\d]+([-_][a-z\d]+)*$/)) {
      return false;
    }
  }

  return true;
};

const [methodsData, setMethodsData] = useState([]);
const [checkboxMethods, setCheckboxMethods] = useState({});
const [methodCount, setMethodCount] = useState(0);

const [eventsData, setEventsData] = useState([]);
const [checkboxEvents, setCheckboxEvents] = useState({});
const [eventCount, setEventCount] = useState(0);

const [contractInputMessage, setContractInputMessage] = useState('');
const [inputValue, setInputValue] = useState('');
const [loading, setLoading] = useState(false);

const [selectAllEvents, setSelectAllEvents] = useState(true);
const [selectAllMethods, setSelectAllMethods] = useState(true);

const [tab, setTab] = useState('methods_tab')

const initializeCheckboxState = (data, keyName) => {
  const initialState = {};

  data.forEach(item => {
    initialState[item[keyName]] = true;

    if (item.schema?.properties) {
      Object.keys(item.schema.properties).forEach(property => {
        initialState[`${item[keyName]}::${property}`] = true;
      });
    }
  });

  return initialState;
};

useEffect(() => {
  setCheckboxMethods(initializeCheckboxState(methodsData, 'method_name'));
  setCheckboxEvents(initializeCheckboxState(eventsData, 'event_name'));
}, [methodsData, eventsData]);

const generateMethods = () => {
  const filterData = (data, checkboxState, keyName) => {
    return data
      .map(item => {
        const parentChecked = checkboxState[item[keyName]];

        if (!item.schema) return null;

        const properties = item.schema.properties || {};

        const filteredProperties = Object.entries(properties).reduce((acc, [property, details]) => {
          const childKey = `${item[keyName]}::${property}`;
          if (checkboxState[childKey]) {
            acc[property] = details;
          }
          return acc;
        }, {});

        if (parentChecked || Object.keys(filteredProperties).length > 0) {
          return {
            [keyName]: item[keyName],
            schema: {
              ...item.schema,
              properties: filteredProperties
            }
          };
        }

        return null;
      })
      .filter(item => item !== null);
  };

  const filteredMethods = filterData(methodsData, checkboxMethods, 'method_name');
  const filteredEvents = filterData(eventsData, checkboxEvents, 'event_name');
  setWizardContractFilter(inputValue)
  setWizardMethods(filteredMethods);
  setWizardEvents(filteredEvents);
  setSelectedIndexer(null);
  setActiveTab('launch-new-indexer');
};

const handleFetchCheckboxData = async () => {
  setMethodsData([]);
  setMethodCount(0);

  setEventsData([]);
  setEventCount(0);

  setContractInputMessage('');

  if (!validateContractId(inputValue)) {
    setContractInputMessage('Invalid contract id');
    return;
  }

  setLoading(true);

  const url = 'https://europe-west1-pagoda-data-stack-prod.cloudfunctions.net/queryapi_wizard';
  asyncFetch(url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filter: inputValue,
      }),
    }
  )
    .then(response => {
      if (!response.ok) {
        setError('There was an error fetching the data');
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = response.body;

      if (data.length === 0) {
        setContractInputMessage('No methods found for this contract');
        setLoading(false);
        return;
      };
      setMethodsData(data.methods);
      setMethodCount(data.methods.length);
      setEventsData(data.events);
      setEventCount(data.events.length);
      setLoading(false);
    }).catch(error => {
      setLoading(false);
      setError('There was an error fetching the data');
    });
};

const toggleAllSelection = (action) => {
  const isSelectAll = action === 'select_all';
  const isMethodsTab = tab === 'methods_tab';
  const isEventsTab = tab === 'events_tab';

  const setStateFunction = isMethodsTab ? setCheckboxMethods : isEventsTab ? setCheckboxEvents : null;

  if (setStateFunction) {
    setStateFunction((prevState) =>
      Object.keys(prevState).reduce((acc, key) => {
        acc[key] = isSelectAll;
        return acc;
      }, {})
    );

    if (isMethodsTab) {
      setSelectAllMethods(isSelectAll);
    } else if (isEventsTab) {
      setSelectAllEvents(isSelectAll);
    }
  }
};

const handleParentChange = (propertyName) => {
  const isMethodsTab = tab === 'methods_tab';
  const isEventsTab = tab === 'events_tab';

  if (propertyName === 'select_all' || propertyName === 'unselect_all') {
    toggleAllSelection(propertyName);
    return;
  }

  if (!isMethodsTab && !isEventsTab) {
    console.log('handleParentChange tab not found');
    return;
  }

  const setCheckboxState = isMethodsTab ? setCheckboxMethods : setCheckboxEvents;
  const data = isMethodsTab ? methodsData : eventsData;
  const findItem = item => (isMethodsTab ? item.method_name : item.event_name) === propertyName;

  setCheckboxState(prevState => {
    const isParentChecked = !prevState[propertyName];
    const updatedState = { ...prevState, [propertyName]: isParentChecked };

    if (!isParentChecked) {
      Object.keys(updatedState).forEach(key => {
        if (key.startsWith(`${propertyName}::`)) {
          updatedState[key] = false;
        }
      });
    } else {
      const item = data.find(findItem);
      const properties = item?.schema.properties || {};
      Object.keys(properties).forEach(property => {
        const childKey = `${propertyName}::${property}`;
        updatedState[childKey] = true;
      });
    }
    return updatedState;
  });
};

const handleChildChange = (key) => {
  const isMethodsTab = tab === 'methods_tab';
  const isEventsTab = tab === 'events_tab';

  if (!isMethodsTab && !isEventsTab) {
    console.log('handleChildChange tab not found');
    return;
  }

  const setCheckboxState = isMethodsTab ? setCheckboxMethods : setCheckboxEvents;
  const parentName = key.split('::')[0];

  setCheckboxState(prevState => {
    const isChecked = !prevState[key];
    const updatedState = { ...prevState, [key]: isChecked };

    const anyChildChecked = Object.keys(updatedState).some(childKey =>
      childKey.startsWith(`${parentName}::`) && updatedState[childKey]
    );
    updatedState[parentName] = anyChildChecked;

    return updatedState;
  });
};

const hasSelectedValues = (checkboxMethods) => {
  return Object.values(checkboxMethods).some(value => value === true);
}

const MetadataComponent = ({ methodsData, eventsData, setTab }) => {
  const methodCount = methodsData.length;
  const eventCount = eventsData.length;

  const tabs = (
    <Metadata>
      {methodsData.length > 0 && (
        <MetadataTab
          onClick={() => setTab('methods_tab')}
        >
          Methods <MetadataText><MetadataIcon>{methodCount}</MetadataIcon></MetadataText>
        </MetadataTab>
      )}

      {methodsData.length > 0 && eventsData.length > 0 && (
        <span style={{ margin: '0 5px' }}>|</span>
      )}

      {eventsData.length > 0 && (
        <MetadataTab
          onClick={() => setTab('events_tab')}
        >
          Events <MetadataText><MetadataIcon>{eventCount}</MetadataIcon></MetadataText>
        </MetadataTab>
      )}
    </Metadata>
  );

  return tabs;
};

return (
  <>
    <Hero>
      <Container>
        <HeadlineContainer>
          <Headline>Launch an indexer in minutes</Headline>
          <Subheadline>Get a working indexer exportable to your Near react application faster than ever. Extract on-chain data, and easily query it using GraphQL endpoints and subscriptions.</Subheadline>
          <InputWrapper>
            <StyledInput
              placeholder="*.pool.near, *.poolv1.near"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(event) => event.key === 'Enter' && handleFetchCheckboxData()}
            />
            <SearchButton onClick={handleFetchCheckboxData} tabIndex={0}>Start</SearchButton>
          </InputWrapper>
          <ContractInputMessage>{contractInputMessage ?? <><WarningSVG xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="none" /><path d="M142.41,40.22l87.46,151.87C236,202.79,228.08,216,215.46,216H40.54C27.92,216,20,202.79,26.13,192.09L113.59,40.22C119.89,29.26,136.11,29.26,142.41,40.22Z" fill="none" stroke="red" stroke-linecap="round" stroke-linejoin="round" stroke-width="16" /><line x1="128" y1="144" x2="128" y2="104" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16" /><circle cx="128" cy="180" fill="red" r="12" /></WarningSVG> {contractInputMessage}</>}</ContractInputMessage>

        </HeadlineContainer>
        <WidgetContainer>
          <SubContainer>
            <SubContainerTitle>Customize indexer</SubContainerTitle>
            <SubContainerContent>
              {loading ? (
                <Container>
                  <LoadingSpinner />
                </Container>
              ) : (methodsData.length === 0) ?
                <>
                  <NoQueryContainer>
                    <NoQuerySVG
                      xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="none" /><line x1="144" y1="224" x2="112" y2="224" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16" /><circle cx="128" cy="100" r="12" fill="#A1A09A" /><path d="M94.81,192C37.52,95.32,103.87,32.53,123.09,17.68a8,8,0,0,1,9.82,0C152.13,32.53,218.48,95.32,161.19,192Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16" /><path d="M183.84,110.88l30.31,36.36a8,8,0,0,1,1.66,6.86l-12.36,55.63a8,8,0,0,1-12.81,4.51L161.19,192" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16" /><path d="M72.16,110.88,41.85,147.24a8,8,0,0,0-1.66,6.86l12.36,55.63a8,8,0,0,0,12.81,4.51L94.81,192" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16" />
                    </NoQuerySVG>
                    <NoQueryText>No smart contract address entered</NoQueryText>
                  </NoQueryContainer>
                </>
                : (
                  <SubContainerContent>
                    {MetadataComponent({ methodsData, eventsData, setTab })}
                    < ScrollableDiv >
                      {methodsData.length > 0 && tab === 'methods_tab' && (
                        <>
                          <CheckboxContainer>
                            <CheckboxLabel>
                              <Checkbox
                                type="checkbox"
                                id="select_all"
                                onChange={() => toggleAllSelection('select_all')}
                                checked={selectAllMethods}
                              />
                              Select All
                            </CheckboxLabel>
                            <CheckboxLabel>
                              <Checkbox
                                type="checkbox"
                                id="unselect_all"
                                onChange={() => toggleAllSelection('unselect_all')}
                                checked={!selectAllMethods}
                              />
                              Unselect All
                            </CheckboxLabel>
                          </CheckboxContainer>

                          {methodsData.map((item, index) => (
                            <CheckboxContainer key={index}>
                              <CheckboxLabel>
                                <Checkbox
                                  type="checkbox"
                                  id={item.method_name}
                                  checked={checkboxMethods[item.method_name]}
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
                                        checked={checkboxMethods[`${item.method_name}::${property}`]}
                                        onChange={() => handleChildChange(`${item.method_name}::${property}`)}
                                      />
                                      {property}: {item.schema.properties[property].type}
                                    </CheckboxLabel>
                                  ))}
                                </SubCheckboxContainer>
                              )}
                            </CheckboxContainer>
                          ))}
                        </>
                      )
                      }
                      {eventsData.length > 0 && tab === 'events_tab' && (
                        <>
                          <CheckboxContainer>
                            <CheckboxLabel>
                              <Checkbox
                                type="checkbox"
                                id="select_all_events"
                                onChange={() => toggleAllSelection('select_all')}
                                checked={selectAllEvents}
                              />
                              Select All Events
                            </CheckboxLabel>
                            <CheckboxLabel>
                              <Checkbox
                                type="checkbox"
                                id="unselect_all_events"
                                onChange={() => toggleAllSelection('unselect_all')}
                                checked={!selectAllEvents}
                              />
                              Unselect All Events
                            </CheckboxLabel>
                          </CheckboxContainer>

                          {eventsData.map((item, index) => (
                            <CheckboxContainer key={index}>
                              <CheckboxLabel>
                                <Checkbox
                                  type="checkbox"
                                  id={item.event_name}
                                  checked={checkboxEvents[item.event_name]}
                                  onChange={() => handleParentChange(item.event_name)}
                                />
                                {item.event_name}
                              </CheckboxLabel>
                              {item.schema.properties && (
                                <SubCheckboxContainer>
                                  {Object.keys(item.schema.properties).map((property, subIndex) => (
                                    <CheckboxLabel key={subIndex}>
                                      <Checkbox
                                        type="checkbox"
                                        id={`${item.event_name}::${property}`}
                                        checked={checkboxEvents[`${item.event_name}::${property}`]}
                                        onChange={() => handleChildChange(`${item.event_name}::${property}`)}
                                      />
                                      {property}: {item.schema.properties[property].type}
                                    </CheckboxLabel>
                                  ))}
                                </SubCheckboxContainer>
                              )}
                            </CheckboxContainer>
                          ))}
                        </>
                      )
                      }

                    </ScrollableDiv>
                  </SubContainerContent>
                )}
              <GenerateButton onClick={generateMethods} disabled={(!checkboxMethods || !hasSelectedValues(checkboxMethods)) && (!checkboxEvents || !hasSelectedValues(checkboxEvents))}>Generate</GenerateButton>
            </SubContainerContent>
          </SubContainer>
        </WidgetContainer>
      </Container>
    </Hero>
  </>
)
