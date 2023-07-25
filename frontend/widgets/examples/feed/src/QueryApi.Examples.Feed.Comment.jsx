const GRAPHQL_ENDPOINT =
  props.GRAPHQL_ENDPOINT || "https://near-queryapi.api.pagoda.co";
const APP_OWNER = props.APP_OWNER || "dataplatform.near";
const accountId = props.accountId;
const blockHeight =
  props.blockHeight === "now" ? "now" : parseInt(props.blockHeight);

State.init({
  content: JSON.parse(props.content) ?? undefined,
  notifyAccountId: undefined,
});

// const parentItem = content.item;
const highlight = !!props.highlight;

const extractNotifyAccountId = (parentItem) => {
  if (!parentItem || parentItem.type !== "social" || !parentItem.path) {
    return undefined;
  }
  const accountId = parentItem.path.split("/")[0];
  return `${accountId}/post/main` === parentItem.path ? accountId : undefined;
};

const commentUrl = `https://alpha.near.org/#/${APP_OWNER}/widget/QueryApi.Examples.Feed.PostPage?accountId=${accountId}&commentBlockHeight=${blockHeight}`;

if (!state.content && accountId && blockHeight !== "now") {
  const commentQuery = `
query CommentQuery {
  dataplatform_near_social_feed_comments(
    where: {_and: {account_id: {_eq: "${accountId}"}, block_height: {_eq: ${blockHeight}}}}
  ) {
    content
    block_timestamp
    receipt_id
    post {
      account_id
    }
  }
}
`;

  function fetchGraphQL(operationsDoc, operationName, variables) {
    return asyncFetch(
     `${GRAPHQL_ENDPOINT}/v1/graphql`, 
      {
        method: "POST",
        headers: { "x-hasura-role": "dataplatform_near" },
        body: JSON.stringify({
          query: operationsDoc,
          variables: variables,
          operationName: operationName,
        }),
      }
    );
  }

  fetchGraphQL(commentQuery, "CommentQuery", {}).then((result) => {
    if (result.status === 200) {
      if (result.body.data) {
        const comments = result.body.data.dataplatform_near_social_feed_comments;
        if (comments.length > 0) {
          const comment = comments[0];
          let content = JSON.parse(comment.content);
          State.update({
            content: content,
            notifyAccountId: comment.post.accountId,
          });
        }
      }
    }
  });
}

const Comment = styled.div`
  position: relative;

  &::before {
    content: '';
    display: block;
    position: absolute;
    left: 15px;
    top: 44px;
    bottom: 12px;
    width: 2px;
    background: ${props.highlight ? "#006ADC" : "#ECEEF0"};
  }
`;

const Header = styled.div`
  display: inline-flex;
  margin-bottom: 0;
`;

const Body = styled.div`
  padding-left: 44px;
  padding-bottom: 1px;
`;

const Content = styled.div`
  img {
    display: block;
    max-width: 100%;
    max-height: 80vh;
    margin: 0 0 12px;
  }
`;

const Text = styled.p`
  display: block;
  margin: 0;
  font-size: 14px;
  line-height: 20px;
  font-weight: 400;
  color: #687076;
  white-space: nowrap;
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin: -6px -6px 6px;
`;

return (
  <Comment>
    <Header>
      <Widget
        src="calebjacob.near/widget/AccountProfile"
        props={{
          accountId,
          avatarSize: "32px",
          hideAccountId: true,
          inlineContent: (
            <>
              <Text as="span">･</Text>
              {blockHeight === "now" ? (
                "now"
              ) : (
                <Text>
                  <Widget
                    src="mob.near/widget/TimeAgo"
                    props={{ blockHeight }}
                  />{" "}
                  ago
                </Text>
              )}
            </>
          ),
        }}
      />
    </Header>

    <Body>
      <Content>
        {state.content.text && (
          <Widget
            src="calebjacob.near/widget/SocialMarkdown"
            props={{ text: state.content.text }}
          />
        )}

        {state.content.image && (
          <Widget
            src="mob.near/widget/Image"
            props={{
              image: state.content.image,
            }}
          />
        )}
      </Content>

      {blockHeight !== "now" && (
        <Actions>
          <Widget
            src={`mob.near/widget/LikeButton`}
            props={{
              item: {
                type: "social",
                path: `${accountId}/post/comment`,
                blockHeight,
              },
              notifyAccountId: state.notifyAccountId,
            }}
          />
          <Widget
            src="calebjacob.near/widget/CommentButton"
            props={{
              hideCount: true,
              onClick: () => State.update({ showReply: !state.showReply }),
            }}
          />
          <Widget
            src="calebjacob.near/widget/CopyUrlButton"
            props={{
              url: commentUrl,
            }}
          />
        </Actions>
      )}

      {state.showReply && (
        <div className="mb-2">
          <Widget
            src="calebjacob.near/widget/Comments.Compose"
            props={{
              initialText: `@${accountId}, `,
              notifyAccountId: state.notifyAccountId,
              item: parentItem,
              onComment: () => State.update({ showReply: false }),
            }}
          />
        </div>
      )}
    </Body>
  </Comment>
);
