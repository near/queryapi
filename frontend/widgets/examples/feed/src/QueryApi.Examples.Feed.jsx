const APP_OWNER = props.APP_OWNER || "dataplatform.near";
const loadMorePosts = props.loadMorePosts;
const hasMore = props.hasMore || false;
const posts = props.posts || [];

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

const renderedItems = posts.map(renderItem);

const Loader = () => {
return(        
  <div className="loader">
    <span
      className="spinner-grow spinner-grow-sm me-1"
      role="status"
      aria-hidden="true"
    />
    Loading ...
  </div>)
}

if (!posts) return(<Loader/>)

return (
  <InfiniteScroll
    pageStart={0}
    loadMore={loadMorePosts}
    hasMore={hasMore}
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
