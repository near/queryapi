const GRAPHQL_ENDPOINT =
  props.GRAPHQL_ENDPOINT || "https://near-queryapi.api.pagoda.co";
const APP_OWNER = props.APP_OWNER || "dataplatform.near";
const item = props.item;

const likes = JSON.parse(props.likes?.length ? props.likes : "[]") ?? [];

State.init({ likes: props.likes });

if (!item) {
  return "";
}

const dataLoading = likes === null;

const likesByUsers = {};

(state.likes || []).forEach((account_id) => {
  likesByUsers[account_id] = true;
});

if (state.hasLike === true) {
  likesByUsers[context.accountId] = {
    accountId: context.accountId,
  };
} else if (state.hasLike === false) {
  delete likesByUsers[context.accountId];
}

const accountsWithLikes = Object.keys(likesByUsers);
const hasLike = context.accountId && !!likesByUsers[context.accountId];
const hasLikeOptimistic =
  state.hasLikeOptimistic === undefined ? hasLike : state.hasLikeOptimistic;
const totalLikes =
  accountsWithLikes.length +
  (hasLike === false && state.hasLikeOptimistic === true ? 1 : 0) -
  (hasLike === true && state.hasLikeOptimistic === false ? 1 : 0);

const LikeButton = styled.button`
  border: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #687076;
  font-weight: 400;
  font-size: 14px;
  line-height: 17px;
  cursor: pointer;
  background: none;
  padding: 6px;
  transition: color 200ms;

  i {
    font-size: 16px;
    transition: color 200ms;

    &.bi-heart-fill {
      color: #E5484D !important;
    }
  }

  &:hover, &:focus {
    outline: none;
    color: #11181C;
  }
`;

const likeClick = () => {
  if (state.loading) {
    return;
  }

  State.update({
    loading: true,
    hasLikeOptimistic: !hasLike,
  });

  const data = {
    index: {
      like: JSON.stringify({
        key: item,
        value: {
          type: hasLike ? "unlike" : "like",
        },
      }),
    },
  };

  if (!hasLike && props.notifyAccountId) {
    data.index.notify = JSON.stringify({
      key: props.notifyAccountId,
      value: {
        type: "like",
        item,
      },
    });
  }
  Social.set(data, {
    onCommit: () => State.update({ loading: false, hasLike: !hasLike }),
    onCancel: () =>
      State.update({
        loading: false,
        hasLikeOptimistic: !state.hasLikeOptimistic,
      }),
  });
};

const title = hasLike ? "Unlike" : "Like";

return (
  <LikeButton
    disabled={state.loading || dataLoading || !context.accountId}
    title={title}
    onClick={likeClick}
  >
    <i className={`${hasLikeOptimistic ? "bi-heart-fill" : "bi-heart"}`} />
    {totalLikes}
  </LikeButton>
);
