// ORIGINAL STYLED COMPONENTS
const Wrapper = styled.div`
  margin-top: calc(var(--body-top-padding) * -1);
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
`;

const accountId = context.accountId;

const [activeTab, setActiveTab] = useState(props.view === "create-new-indexer" ? "create-new-indexer" : props.selectedIndexerPath ? "indexer" : "explore");
const [activeIndexerTabView, setActiveIndexerTabView] = useState(props.activeIndexerView ?? "editor");
const [selectedIndexer, setSelectedIndexer] = useState(props.selectedIndexerPath);

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
    <Tabs>
      <TabsButton
        type="button"
        onClick={() => selectTab("launchpad")}
        selected={activeTab === "launchpad"}
      >
        Launchpad
      </TabsButton>

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
      >
        Indexer ({selectedIndexer})
      </TabsButton>
    </Tabs>


    <Main>
      {activeTab === 'launchpad' && (
        <Section >
          <Widget src={`${REPL_ACCOUNT_ID}/widget/QueryApi.Launchpad`} />
        </Section>
      )}

      {activeTab === 'explore' && (
        <Section>
          <Widget src={`${REPL_ACCOUNT_ID}/widget/QueryApi.IndexerExplorer`} />
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

      {!['launchpad', 'explore', 'indexer', 'create-new-indexer'].includes(activeTab) && (
        <Widget
          src={`${REPL_ACCOUNT_ID}/widget/QueryApi.NotFound`}
          props={{}}
        />
      )}

    </Main>
  </Wrapper >
);




