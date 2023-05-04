const accountId = context.accountId;
const [selected_accountId, selected_indexerName] = props.selectedIndexerPath
  ? props.selectedIndexerPath.split("/")
  : [undefined, undefined];

const activeTab = props.view ?? "public-indexers";
const limit = 7;
let totalIndexers = 0;
const registry_contract_id =
  props.registry_contract_id || "queryapi.dataplatform.near";
const APP_OWNER = "roshaan.near";

State.init({
  activeTab: activeTab,
  my_indexers: [],
  all_indexers: [],
  selected_indexer: undefined,
  selected_account: undefined,
});

Near.asyncView(registry_contract_id, "list_indexer_functions").then((data) => {
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

  State.update({
    my_indexers: my_indexers,
    all_indexers: indexers,
    totalIndexers: total_indexers,
  });
});

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

const Wrapper = styled.div`
  margin-top: calc(var(--body-top-padding) * -1);
`;

const NavBarLogo = styled.a`
  padding-top: 0.3125rem;
  padding-bottom: 0.3125rem;
  margin-right: 1rem;
  font-size: 1.25rem;
  text-decoration: none;
  white-space: nowrap;
`;
const Main = styled.div`
  display: grid;
  grid-template-columns: 284px minmax(0, 1fr);
  grid-gap: 16px;
  padding-bottom: 24px;

  @media (max-width: 1200px) {
    display: block;
  }
`;

const Section = styled.div`
  padding-left: 10px;
  padding-top: 24px;
  border-left: ${(p) => (p.primary ? "1px solid #ECEEF0" : "none")};
  border-right: ${(p) => (p.primary ? "1px solid #ECEEF0" : "none")};

  @media (max-width: 1200px) {
    padding-top: 0px;
    border-left: none;
    border-right: none;
    display: ${(p) => (p.active ? "block" : "none")};
    margin: ${(p) => (p.negativeMargin ? "0 -12px" : "0")};
  }
`;

const Tabs = styled.div`
  display: none;
  height: 48px;
  background: #f8f9fa;
  border-top: 1px solid #eceef0;
  border-bottom: 1px solid #eceef0;
  margin-bottom: ${(p) => (p.noMargin ? "0" : p.halfMargin ? "24px" : "24px")};

  @media (max-width: 1200px) {
    display: flex;
    margin-left: -12px;
    margin-right: -12px;

    button {
      flex: 1;
    }
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
  font-size: 12px;
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
  margin: 0 0 24px;
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

const indexerView = (accountId, indexerName, idx, view) => {
  const isSelected =
    (view === "user" &&
      selected_accountId === undefined &&
      selected_indexerName === undefined &&
      idx === 0) ||
    (selected_accountId === accountId && selected_indexerName === indexerName);

  const editUrl = `https://near.org/#/${APP_OWNER}/widget/QueryApi.Dashboard?selectedIndexerPath=${accountId}/${indexerName}&view=editor-window`;
  const statusUrl = `https://near.org/#/${APP_OWNER}/widget/QueryApi.Dashboard?selectedIndexerPath=${accountId}/${indexerName}&view=indexer-status`;
  // const playgroundLink = `https://near.org/#/${APP_OWNER}/widget/QueryApi.Dashboard?selectedIndexerPath=${accountId}/${indexerName}&view=editor-window&tab=playground`;
  const playgroundLink = `https://cloud.hasura.io/public/graphiql?endpoint=https://queryapi-hasura-graphql-24ktefolwq-ew.a.run.app/v1/graphql&header=x-hasura-role%3A${accountId.replaceAll(
    ".",
    "_"
  )}`;

  let removeIndexer = (name) => {
    const gas = 200000000000000;
    Near.call(
      registry_contract_id,
      "remove_indexer_function",
      {
        function_name: name,
      },
      gas
    );
  };
  return (
    <Card selected={isSelected}>
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
        <ButtonLink
          href={statusUrl}
          onClick={() =>
            State.update({
              activeTab: "indexer-status",
            })
          }
        >
          View Status
        </ButtonLink>
        <ButtonLink
          primary
          href={editUrl}
          onClick={() =>
            State.update({
              activeTab: "editor-window",
            })
          }
        >
          {accountId === context.accountId ? "Edit Indexer" : "View Indexer"}
        </ButtonLink>
        <ButtonLink href={playgroundLink} target="_blank">
          View In Playground
        </ButtonLink>
        {view === "user" && (
          <ButtonLink danger onClick={() => removeIndexer(indexerName)}>
            Delete Indexer
          </ButtonLink>
        )}
      </CardFooter>
    </Card>
  );
};

const renderIndexers = (indexers, view) => {
  return (
    <>
      {indexers.map((indexer, i) => (
        <CardWrapper key={i}>
          {indexerView(indexer.accountId, indexer.indexerName, i, view)}
        </CardWrapper>
      ))}
      {indexers.length === 0 && (
        <Subheading> You have no indexers to show...</Subheading>
      )}
    </>
  );
};

return (
  <Wrapper negativeMargin={state.activeTab === "indexers"}>
    <Tabs
      halfMargin={state.activeTab === "indexers"}
      noMargin={state.activeTab === "indexers"}
    >
      <TabsButton
        type="button"
        onClick={() => State.update({ activeTab: "indexers" })}
        selected={state.activeTab === "indexers"}
      >
        Indexers
      </TabsButton>

      <TabsButton
        type="button"
        onClick={() => State.update({ activeTab: "editor-window" })}
        selected={state.activeTab === "editor-window"}
      >
        Indexer Editor
      </TabsButton>

      <TabsButton
        type="button"
        onClick={() => State.update({ activeTab: "indexer-status" })}
        selected={state.activeTab === "indexer-status"}
      >
        Indexer Status
      </TabsButton>
    </Tabs>

    <Main>
      <Section active={state.activeTab === "indexers"}>
        <NavBarLogo
          href={`https://alpha.near.org/#/${APP_OWNER}/widget/QueryApi.Dashboard`}
          title="QueryApi"
          onClick={() => {
            State.update({
              activeTab: "public-indexers",
            });
          }}
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

        <div>
          <ButtonLink
            href={`/#/${APP_OWNER}/widget/QueryApi.Dashboard/?view=create-new-indexer`}
            style={{ "margin-top": "10px" }}
            onClick={() =>
              State.update({
                activeTab: "create-new-indexer",
                selected_indexer: "",
              })
            }
          >
            Create New Indexer
          </ButtonLink>
          {state.my_indexers.length > 0 && (
            <H2>
              {accountId}'s Indexers
              <span>({state.my_indexers.length})</span>
            </H2>
          )}
          {renderIndexers(state.my_indexers, "user")}
        </div>
      </Section>

      <Section
        negativeMargin
        primary
        active={state.activeTab === "editor-window"}
      >
        {state.activeTab === "indexer-status" && (
          <div>
            {state.indexers.length > 0 &&
              (state.selected_indexer != "" ? (
                <H2>{state.selected_indexer}</H2>
              ) : (
                <H2>{state.indexers[0].indexerName}</H2>
              ))}
            {indexerView(
              selected_accountId ?? state.indexers[0].accountId,
              selected_indexerName ?? state.indexers[0].indexerName
            )}
            <Widget
              src={`${APP_OWNER}/widget/QueryApi.IndexerStatus`}
              props={{
                indexer_name:
                  selected_indexerName ?? state.indexers[0].indexerName,
                accountId: selected_accountId ?? state.indexers[0].accountId,
              }}
            />
          </div>
        )}
        {state.activeTab === "editor-window" && (
          <div>
            {state.indexers.length > 0 &&
              (state.selected_indexer != undefined ? (
                <H2>{state.selected_indexer}</H2>
              ) : (
                <H2>{`${state.indexers[0].accountId}/${state.indexers[0].indexerName}`}</H2>
              ))}
            {indexerView(
              selected_accountId ?? state.indexers[0].accountId,
              selected_indexerName ?? state.indexers[0].indexerName
            )}
            <Widget
              src={`${APP_OWNER}/widget/QueryApi.Editor`}
              props={{
                indexerName:
                  selected_indexerName ?? state.indexers[0].indexerName,
                accountId: selected_accountId ?? state.indexers[0].accountId,
                path: "query-api-editor",
                tab: props.tab,
              }}
            />
          </div>
        )}
        {state.activeTab === "create-new-indexer" && (
          <div>
            {state.indexers.length > 0 &&
              (state.selected_indexer != undefined ? (
                <H2>{state.selected_indexer}</H2>
              ) : (
                <H2>{`${state.indexers[0].accountId}/${state.indexers[0].indexerName}`}</H2>
              ))}
            <Widget
              src={`${APP_OWNER}/widget/QueryApi.Editor`}
              props={{
                indexerName:
                  selected_indexerName ?? state.indexers[0].indexerName,
                accountId: selected_accountId ?? state.indexers[0].accountId,
                path: "create-new-indexer",
              }}
            />
          </div>
        )}
        {state.activeTab === "public-indexers" && (
          <div>
            {state.all_indexers && (
              <div>{renderIndexers(state.all_indexers, "public")}</div>
            )}
          </div>
        )}
      </Section>
    </Main>
  </Wrapper>
);
