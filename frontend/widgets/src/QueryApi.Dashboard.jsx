const Wrapper = styled.div`
  margin-top: calc(var(--body-top-padding) * -1);
`;

const Banner = styled.div`
  background-color: #f8d7da; /* Light red background color */
  color: #721c24; /* Dark red text color */
  padding: 5px; /* Padding around the text */
  text-align: center; /* Center the text */
  border-radius: 4px; /* Rounded corners */
`;

const Main = styled.div`
  display: block;
`;

const Section = styled.div`
  padding-top: 0px;
  border-left: none;
  border-right: none;
`;

const Tabs = styled.div`
  display: flex;
  border-bottom: 2px solid #ccc;
  background-color: #f0f0f0;
`;

const TabsButton = styled.button`
  flex: 1;
  padding: 1rem;
  border: none;
  background: ${props => (props.selected ? '#3acd83' : 'transparent')};
  color: ${props => (props.selected ? '#fff' : '#333')};
  font-family: 'Mona Sans', sans-serif;
  font-size: 1rem;
  font-weight: ${props => (props.selected ? 'bold' : 'normal')};
  cursor: pointer;
  transition: background-color 0.3s, color 0.3s;

  &:hover {
    background: #e0e0e0;
  }

  &:disabled {
    color: #999;
    cursor: not-allowed;
  }
`;

const IS_DEV = `${REPL_EXTERNAL_APP_URL}` === "https://queryapi-frontend-vcqilefdcq-ew.a.run.app" || `${REPL_EXTERNAL_APP_URL}` === "http://localhost:3000";
const accountId = context.accountId;
const [activeTab, setActiveTab] = useState(props.view === "create-new-indexer" ? "create-new-indexer" : props.selectedIndexerPath ? "indexer" : "explore");
const [activeIndexerTabView, setActiveIndexerTabView] = useState(props.activeIndexerView ?? "editor");
const [selectedIndexer, setSelectedIndexer] = useState(props.selectedIndexerPath);

const [wizardEvents, setWizardEvents] = useState({});
const [wizardMethods, setWizardMethods] = useState({});
const [wizardContractFilter, setWizardContractFilter] = useState('');


const selectTab = (tabName) => {
  Storage.privateSet("queryapi:activeTab", tabName);
  setActiveTab(tabName);
};

const selectIndexerPage = (viewName) => {
  Storage.privateSet("queryapi:activeIndexerTabView", viewName);
  setActiveIndexerTabView(viewName);
};

return (
  <Wrapper>
    <Banner>
      <p>QueryApi is being decommissioned by Dec 9, 2024. New Indexer creation has been disabled. Please refer to <a href="https://docs.near.org/build/data-infrastructure/data-apis">documentation</a> for alternatives. </p>
    </Banner>

    <Tabs>
      {IS_DEV && (
        <TabsButton
          type="button"
          onClick={() => selectTab("launchpad")}
          selected={activeTab === "launchpad"}
        >
          Launchpad
        </TabsButton>
      )}

      <TabsButton
        type="button"
        onClick={() => selectTab("explore")}
        selected={activeTab === "explore"}
      >
        Explore Indexers
      </TabsButton>

      <TabsButton
        type="button"
        onClick={() => selectTab("indexer")}
        selected={activeTab === "indexer"}
        disabled={!selectedIndexer}
      >
        {(!selectedIndexer && activeTab === "create-new-indexer")
          ? "Indexer Creation"
          : (!selectedIndexer && activeTab === "launch-new-indexer")
            ? "Indexer Creation (Launchpad)"
            : (!selectedIndexer)
              ? "Select an Indexer"
              : `Indexer (${selectedIndexer})`}
      </TabsButton>
    </Tabs>

    <Main>
      {activeTab === 'launchpad' && IS_DEV && (
        <Section >
          <Widget
            src={`${REPL_ACCOUNT_ID}/widget/QueryApi.Launchpad`}
            props={{
              activeTab: activeTab,
              setActiveTab: setActiveTab,
              setSelectedIndexer: setSelectedIndexer,
              setWizardContractFilter: setWizardContractFilter,
              setWizardMethods: setWizardMethods,
              setWizardEvents: setWizardEvents,
            }}
          />
        </Section>
      )}

      {activeTab === 'explore' && (
        <Section>
          <Widget src={`${REPL_ACCOUNT_ID}/widget/QueryApi.IndexerExplorer`} />
        </Section>
      )}

      {activeTab === 'launch-new-indexer' && (
        <Section>
          {/* Modify the href post click explorer indexer */}
          <Widget
            src={`${REPL_ACCOUNT_ID}/widget/QueryApi.Editor`}
            props={{
              indexerName: selectedIndexer ? selectedIndexer.split('/')[1] : '',
              accountId: selectedIndexer ? selectedIndexer.split('/')[0] : '',
              path: "create-new-indexer",
              wizardContractFilter: wizardContractFilter,
              wizardMethods: wizardMethods,
              wizardEvents: wizardEvents,
            }}
          />
        </Section>
      )}

      {activeTab === "create-new-indexer" && (
        <Section>
          <Widget
            src={`${REPL_ACCOUNT_ID}/widget/QueryApi.Editor`}
            props={{
              indexerName: selectedIndexer ? selectedIndexer.split('/')[1] : '',
              accountId: selectedIndexer ? selectedIndexer.split('/')[0] : '',
              path: "create-new-indexer",
            }}
          />
        </Section>
      )}

      {activeTab === 'indexer' && (
        <Section>
          <Widget
            src={`${REPL_ACCOUNT_ID}/widget/QueryApi.Editor`}
            props={{
              indexerName: selectedIndexer ? selectedIndexer.split('/')[1] : '',
              accountId: selectedIndexer ? selectedIndexer.split('/')[0] : '',
              path: "query-api-editor",
              tab: props.tab,
              activeView: activeIndexerTabView
            }}
          />
        </Section>
      )}


      {!['launchpad', 'explore', 'indexer', 'create-new-indexer', 'launch-new-indexer'].includes(activeTab) && (
        <Widget
          src={`${REPL_ACCOUNT_ID}/widget/QueryApi.NotFound`}
          props={{}}
        />
      )}

    </Main>
  </Wrapper >
);




