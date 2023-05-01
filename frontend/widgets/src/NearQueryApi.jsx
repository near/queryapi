let index = state.index ?? Storage.get("index");

const SmallTitle = styled.h3`
  color: #687076;
  font-weight: 600;
  font-size: 24px;
  line-height: 15px;
  margin-top: 10px;
  text-transform: uppercase;

  @media (max-width: 770px) {
    margin-bottom: 16px;
  }
`;

const SmallText = styled.h3`
  color: #687076;
  font-weight: 400;
  font-size: 18px;
  line-height: 15px;
  margin-top: 10px;

  @media (max-width: 770px) {
    margin-bottom: 16px;
  }
`;

const TextLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #0091FF;
  font-weight: 600;
  font-size: 12px;
  line-height: 15px;
`;
State.init({ signedUp: false });

if (index !== null) {
  index = index || [];

  const lastBlockHeight = index[0].blockHeight || 0;

  const newIndex = Social.index("queryAPIWaitlist", "query-api-waitlist", {
    order: "asc",
    from: lastBlockHeight + 1,
    limit: 10,
    subscribe: true,
  });

  if (newIndex !== null && newIndex.length > 0) {
    index = [...newIndex.reverse(), ...index];
    Storage.set("index", index);
  }

  if ((state.index.length || 0) < (index.length || 0)) {
    State.update({
      index,
    });
  }
}

const waitlist = index;
console.log(waitlist, "waitlist");
const dedupedList = waitlist.filter(
  (obj, index, arr) =>
    index === arr.findIndex((o) => o.accountId === obj.accountId)
);
console.log(dedupedList, "deduped waitlist");
const unique = {};

if (waitlist) {
  waitlist.forEach(({ accountId, value }) => {
    if (accountId === context.accountId) {
      State.update({
        signedUp: true,
      });
    }
    const key = accountId;
    if (key in unique) {
      return;
    }
    unique[key] = true;
  });
}

function renderRecentWaitlist(accountIds) {
  return (
    <div className="d-flex flex-wrap gap-3">
      {accountIds &&
        accountIds.map((accountId, i) => {
          return (
            <div className="position-relative" key={i}>
              <a
                href={`#/mob.near/widget/ProfilePage?accountId=${accountId}`}
                className="text-decoration-none"
              >
                <Widget
                  src="mob.near/widget/ProfileImage"
                  props={{
                    accountId,
                    className: "d-inline-block overflow-hidden",
                  }}
                />
              </a>
            </div>
          );
        })}
    </div>
  );
}

return (
  <div>
    <div className="mb-4">
      <SmallTitle>Near Query API</SmallTitle>

      <SmallText>
        Seamlessly create, manage, and discover indexers. Coming soon Near you.
      </SmallText>
    </div>
    {state.signedUp === false ? (
      <div className="mb-4">
        <CommitButton
          className="btn btn-lg btn-success"
          onCommit={() => {
            State.update({
              signedUp: true,
            });
          }}
          onCancel={() => {
            State.update({
              signedUp: false,
            });
          }}
          data={() => ({
            index: {
              queryAPIWaitlist: JSON.stringify({
                key: "query-api-waitlist",
                value: Date.now(),
              }),
            },
          })}
        >
          Get me on the waitlist 🙋‍♂️
        </CommitButton>
      </div>
    ) : (
      <div className="mb-4">
        <h4>You are already on the waitlist. Hang tight :)</h4>
        <TextLink
          style={{ "font-size": "16px" }}
          href="https://tnobfjyc9vs.typeform.com/to/UCRjFqJe"
          target="_blank"
        >
          Let us know your indexing needs here!{" "}
          <i className="bi bi-box-arrow-up-right"></i>
        </TextLink>
      </div>
    )}

    <div className="mb-4">
      <h4>Recently signed up... </h4>
      <div>
        {dedupedList &&
          renderRecentWaitlist(
            dedupedList.slice(0, 10).map((a) => a.accountId)
          )}
      </div>
    </div>
  </div>
);
