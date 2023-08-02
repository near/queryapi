const APP_OWNER = props.APP_OWNER || "dataplatform.near";
const GRAPHQL_ENDPOINT =
  props.GRAPHQL_ENDPOINT || "https://near-queryapi.api.pagoda.co";
const sortOption = props.postsOrderOption || "blockHeight"; // following, blockHeight
const LIMIT = 25;
let accountsFollowing =  props.accountsFollowing
const moderatorAccount = props?.moderatorAccount || "bosmod.near";

if (context.accountId && !accountsFollowing) {
  const graph = Social.keys(`${context.accountId}/graph/follow/*`, "final");
  if (graph !== null) {
    accountsFollowing = Object.keys(graph[context.accountId].graph.follow || {});
  }
}

let filterUsersRaw = Social.get(
  `${moderatorAccount}/moderate/users`,
  "optimistic",
  {
    subscribe: true,
  }
);

const selfFlaggedPosts = context.accountId
  ? Social.index("flag", "main", {
      accountId: context.accountId,
    })
  : [];

if (filterUsers === null) {
  // haven't loaded filter list yet, return early
  return "";
}

const filterUsers = filterUsersRaw ? JSON.parse(filterUsersRaw) : [];

// get the full list of posts that the current user has flagged so
// they can be hidden

const shouldFilter = (item) => {
  return (
    filterUsers.includes(item.account_id) ||
    selfFlaggedPosts.find((flagged) => {
      return (
        flagged?.value?.blockHeight === item.block_height &&
        flagged?.value?.path.includes(item.account_id)
      );
    })
  );
};

State.init({
  selectedTab: Storage.privateGet("selectedTab") || "all",
  posts: [],
  postsCountLeft: 0,
  initLoadPosts: false,
  initLoadPostsAll: false
});

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

const createQuery = (sortOption, type) => {
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
switch (type) {
  case "following":
    let queryAccountsString = accountsFollowing.map(account => `"${account}"`).join(", ");
    queryFilter =  `account_id: { _in: [${queryAccountsString}]}`;
    break;
  // More options...
  default:
    queryFilter = "";
}

const indexerQueries = `
query GetPostsQuery($offset: Int, $limit: Int) {
  dataplatform_near_social_feed_posts(order_by: [${querySortOption} { block_height: desc }], offset: $offset, limit: $limit) {
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
  dataplatform_near_social_feed_posts_aggregate(order_by: [${querySortOption} { block_height: desc }], offset: $offset){
    aggregate {
      count
    }
  }
}
query GetFollowingPosts($offset: Int, $limit: Int) {
  dataplatform_near_social_feed_posts(where: {${queryFilter}}, order_by: [${querySortOption} { block_height: desc }], offset: $offset, limit: $limit) {
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
  dataplatform_near_social_feed_posts_aggregate(where: {${queryFilter}}, order_by: [${querySortOption} { block_height: desc }], offset: $offset) {
    aggregate {
      count
    }
  }
}
`;
return indexerQueries
}

const loadMorePosts = () => {
  const queryName = state.selectedTab == "following" && accountsFollowing ? "GetFollowingPosts" : "GetPostsQuery"
  const type = state.selectedTab == "following" && accountsFollowing ? "following" : "all"

  if(state.selectedTab == "following" && accountsSelected && accountsSelected.length == 0) {
    console.log("user has no followers")
    return
  }
  fetchGraphQL(createQuery(sortOption, type), queryName, {
    offset: state.posts.length,
    limit: LIMIT
  }).then((result) => {
    if (result.status === 200 && result.body) {
      if(result.body.errors) {
        console.log('error:', result.body.errors)
        return
      }
      let data = result.body.data;
      if (data) {
        const newPosts = data.dataplatform_near_social_feed_posts;
        const postsCountLeft =
          data.dataplatform_near_social_feed_posts_aggregate.aggregate.count;
        if (newPosts.length > 0) {
          let filteredPosts = newPosts.filter((i) => !shouldFilter(i));
          filteredPosts = filteredPosts.map((post) => {
            const prevComments = post.comments;
            const filteredComments = post.comments.filter(
              (comment) => !shouldFilter(comment)
            );
            post.comments = filteredComments;
            return post;
          });

          State.update({
            posts: [...state.posts, ...filteredPosts],
            postsCountLeft,
          });
        }
      }
    }
  });
};

const previousSelectedTab = Storage.privateGet("selectedTab");
if (previousSelectedTab && previousSelectedTab !== state.selectedTab) {
  State.update({
    selectedTab: previousSelectedTab,
  });
}

function selectTab(selectedTab) {
  Storage.privateSet("selectedTab", selectedTab);
  State.update({
    posts: [],
    postsCountLeft: 0,
    selectedTab 
  });
  loadMorePosts()
}

const H2 = styled.h2`
  font-size: 19px;
  line-height: 22px;
  color: #11181C;
  margin: 0 0 24px;
  padding: 0 24px;

  @media (max-width: 1200px) {
    display: none;
  }
`;

const Content = styled.div`
  @media (max-width: 1200px) {
    > div:first-child {
      border-top: none;
    }
  }
`;

const ComposeWrapper = styled.div`
  border-top: 1px solid #ECEEF0;
`;

const FilterWrapper = styled.div`
  border-top: 1px solid #ECEEF0;
  padding: 24px 24px 0;

  @media (max-width: 1200px) {
    padding: 12px;
  }
`;

const PillSelect = styled.div`
  display: inline-flex;
  align-items: center;

  @media (max-width: 600px) {
    width: 100%;

    button {
      flex: 1;
    }
  }
`;

const PillSelectButton = styled.button`
  display: block;
  position: relative;
  border: 1px solid #E6E8EB;
  border-right: none;
  padding: 3px 24px;
  border-radius: 0;
  font-size: 12px;
  line-height: 18px;
  color: ${(p) => (p.selected ? "#fff" : "#687076")};
  background: ${(p) => (p.selected ? "#006ADC !important" : "#FBFCFD")};
  font-weight: 600;
  transition: all 200ms;

  &:hover {
    background: #ECEDEE;
    text-decoration: none;
  }

  &:focus {
    outline: none;
    border-color: #006ADC !important;
    box-shadow: 0 0 0 1px #006ADC;
    z-index: 5;
  }

  &:first-child {
    border-radius: 6px 0 0 6px;
  }
  &:last-child {
    border-radius: 0 6px 6px 0;
    border-right: 1px solid #E6E8EB;
  }
`;

const FeedWrapper = styled.div`
  .post {
    padding-left: 24px;
    padding-right: 24px;

    @media (max-width: 1200px) {
      padding-left: 12px;
      padding-right: 12px;
    }
  }
`;

const hasMore = state.postsCountLeft != state.posts.length

if (!state.initLoadPostsAll && selfFlaggedPosts && filterUsers) {
  loadMorePosts();
  State.update({ initLoadPostsAll: true });
}

if(state.initLoadPostsAll == true && !state.initLoadPosts && accountsFollowing) {
  if (accountsFollowing.length > 0 && state.selectedTab == "following") {
     selectTab("following")
  }
  State.update({initLoadPosts: true})
}

return (
  <>
    <H2>Posts</H2>

    <Content>
      {context.accountId && (
        <>
          <ComposeWrapper>
            <Widget src="calebjacob.near/widget/Posts.Compose" />
          </ComposeWrapper>

          <FilterWrapper>
            <PillSelect>
              <PillSelectButton
                type="button"
                onClick={() => selectTab("all")}
                selected={state.selectedTab === "all"}
              >
                All
              </PillSelectButton>

            <PillSelectButton
                type="button"
                onClick={() => selectTab("following")}
                selected={state.selectedTab === "following"}
              >
                Following
              </PillSelectButton>
            </PillSelect>
          </FilterWrapper>
        </>
      )}

      <FeedWrapper>
        <Widget
          src={`${APP_OWNER}/widget/QueryApi.Examples.Feed`}
          props={{
            hasMore,
            loadMorePosts,
            posts: state.posts,
          }}
        />
      </FeedWrapper>
    </Content>
  </>
);
