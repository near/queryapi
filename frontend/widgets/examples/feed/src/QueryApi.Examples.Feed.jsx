const GRAPHQL_ENDPOINT =
  props.GRAPHQL_ENDPOINT || "https://near-queryapi.api.pagoda.co";
const APP_OWNER = props.APP_OWNER || "dataplatform.near";
const LIMIT = 25;
const accountsFollowing = props.accountsFollowing ?? [];
const sortOption = props.postsOrderOption || "blockHeight"; // following, blockHeight
const filterOption = accountsFollowing.length > 0 ? "following" : ""

State.init({
  posts: [],
  postsCount: 0,
});

const Subheading = styled.h2`
  display: block;
  margin: 0;
  font-size: 14px;
  line-height: 10px;
  color: ${(p) => (p.bold ? "#11181C !important" : "#687076 !important")};
  font-weight: ${(p) => (p.bold ? "600" : "400")};
  font-size: ${(p) => (p.small ? "12px" : "14px")};
  overflow: ${(p) => (p.ellipsis ? "hidden" : "visible")};
  text-overflow: ${(p) => (p.ellipsis ? "ellipsis" : "unset")};
  white-space: nowrap;
  outline: none;
`;

let querySortOption = "";
switch (sortOption) {
  case "recentComments":
    querySortOption = `{ last_comment_timestamp: desc_nulls_last },`;
    break;
  // More options...
  default:
    querySortOption = "";
}

let queryFilter = "";
switch (filterOption) {
  case "following":
    let queryAccountsString = accountsFollowing.map(account => `"${account}"`).join(", ");
    queryFilter =  `account_id: { _in: [${queryAccountsString}]}`;
    break;
  // More options...
  default:
    queryFilter = "";
}


const indexerQueries = `
  query GetPostsQuery($offset: Int) {
  dataplatform_near_feed_indexer_posts(order_by: [${querySortOption} { block_height: desc }], offset: $offset, limit: ${LIMIT}) {
    account_id
    block_height
    block_timestamp
    content
    receipt_id
    accounts_liked
    last_comment_timestamp
    comments(order_by: {block_height: asc}) {
      account_id
      block_height
      block_timestamp
      content
    }
  }
  dataplatform_near_feed_indexer_posts_aggregate {
    aggregate {
      count
    }
  }
}
query GetFollowingPosts($offset: Int) {
  dataplatform_near_feed_indexer_posts(where: {${queryFilter}}, order_by: [${querySortOption} { block_height: desc }], offset: $offset) {
    account_id
    block_height
    block_timestamp
    content
    receipt_id
    accounts_liked
    last_comment_timestamp
    comments(order_by: {block_height: asc}) {
      account_id
      block_height
      block_timestamp
      content
    }
  }
  dataplatform_near_feed_indexer_posts_aggregate {
    aggregate {
      count
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

const Post = styled.div`
  border-bottom: 1px solid #ECEEF0;
  padding: 24px 0 12px;

  @media (max-width: 1200px) {
    padding: 12px 0 0;
  }
`;

const renderItem = (item, i) => {
  if (item.accounts_liked.length !== 0) {
    item.accounts_liked = JSON.parse(item.accounts_liked);
  }
  return (
    <Post className="post" key={item.block_height + "_" + item.account_id}>
      <Widget
        src={`${APP_OWNER}/widget/QueryApi.Examples.Feed.Post`}
        props={{
          accountId: item.account_id,
          blockHeight: item.block_height,
          content: item.content,
          comments: item.comments,
          likes: item.accounts_liked,
          GRAPHQL_ENDPOINT,
          APP_OWNER,
        }}
      />
    </Post>
  );
};

const loadMorePosts = () => {
  const queryName = filterOption == "following" ? "GetFollowingPosts" : "GetPostsQuery"
  fetchGraphQL(indexerQueries, queryName, {
    offset: state.posts.length,
  }).then((result) => {
    if (result.status === 200) {
      let data = result.body.data;
      if (data) {
        const newPosts = data.dataplatform_near_feed_indexer_posts;
        const postsCount =
          data.dataplatform_near_feed_indexer_posts_aggregate.aggregate.count;
        if (newPosts.length > 0) {
          State.update({
            posts: [...state.posts, ...newPosts],
            postsCount: postsCount,
          });
        }
      }
    }
  });
};

const renderedItems = state.posts.map(renderItem);
return (
  <InfiniteScroll
    pageStart={0}
    loadMore={loadMorePosts}
    hasMore={state.posts.length < state.postsCount || state.posts.length == 0}
    loader={
      <div className="loader">
        <span
          className="spinner-grow spinner-grow-sm me-1"
          role="status"
          aria-hidden="true"
        />
        Loading ...
      </div>
    }
  >
    {renderedItems}
  </InfiniteScroll>
);
