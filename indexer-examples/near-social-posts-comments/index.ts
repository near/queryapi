declare const Buffer; // ref: https://stackoverflow.com/a/38877890

import { PrismaClient, Prisma } from '@prisma/client'

import { startStream, types } from '@near-lake/framework';

const lakeConfig: types.LakeConfig = {
  s3BucketName: "near-lake-data-mainnet",
  s3RegionName: "eu-central-1",
  startBlockHeight: 84109467,
};

const SOCIAL_DB = 'social.near';

const prisma = new PrismaClient()

async function handleStreamerMessage(
  block: types.Block,
  ctx: types.LakeContext,
): Promise<void> {
  const nearSocialPosts = block
    .actions()
    .filter(action => action.receiverId === SOCIAL_DB)
    .flatMap(action =>
      action
        .operations
        .map(operation => operation['FunctionCall'])
        .filter(operation => operation?.methodName === 'set')
        .map(functionCallOperation => ({
          ...functionCallOperation,
          args: base64decode(functionCallOperation.args),
          receiptId: action.receiptId, // providing receiptId as we need it
        }))
        .filter(functionCall => {
          const accountId = Object.keys(functionCall.args.data)[0];
          return 'post' in functionCall.args.data[accountId]
          || 'index' in functionCall.args.data[accountId];
        })
    );

  if (nearSocialPosts.length > 0) {
    const blockHeight = block.blockHeight;
    const blockTimestamp = block.header().timestampNanosec;
    console.log(blockHeight);
    console.dir(nearSocialPosts, { depth: null })
    nearSocialPosts.forEach(async postAction => {
      const accountId = Object.keys(postAction.args.data)[0];
      console.log(`ACCOUNT_ID: ${accountId}`);
      // if creates a post
      if (postAction.args.data[accountId].post && 'main' in postAction.args.data[accountId].post) {
        await handlePostCreation(
          accountId,
          blockHeight,
          blockTimestamp,
          postAction.receiptId,
          postAction.args.data[accountId].post.main
        );
      } else if (postAction.args.data[accountId].post && 'comment' in postAction.args.data[accountId].post) { // if creates a comment
        await handleCommentCreation(
          accountId,
          blockHeight,
          blockTimestamp,
          postAction.receiptId,
          postAction.args.data[accountId].post.comment
        );
      } else if ('index' in postAction.args.data[accountId]) {
        // Probably like or unlike action is happening
        if ('like' in postAction.args.data[accountId].index) {
          await handleLike(
            accountId,
            blockHeight,
            blockTimestamp,
            postAction.receiptId,
            postAction.args.data[accountId].index.like,
          );

        }
      }
    })
  }
}

function base64decode(encodedValue: string): object {
  let buff = Buffer.from(encodedValue, 'base64');
  return JSON.parse(buff.toString('utf-8'));
}

async function handlePostCreation(
  accountId: string,
  blockHeight: number,
  blockTimestamp: string,
  receiptId: string,
  content: string,
): Promise<void> {
  try {
    await prisma.posts.create({
      data: {
        account_id: accountId,
        receipt_id: receiptId,
        block_height: blockHeight,
        block_timestamp: blockTimestamp,
        content,
      }
    })
    console.log(`Post by ${accountId} has been added to the database`);
  } catch (e) {
    console.error(`Failed to store post by ${accountId} to the database (perhaps it already stored)`);
  }
}

async function handleCommentCreation(
  accountId: string,
  blockHeight: number,
  blockTimestamp: string,
  receiptId: string,
  commentString: string,
): Promise<void> {
  const comment = JSON.parse(commentString);
  const postAuthor = comment.item.path.split("/")[0];
  const postBlockHeight = comment.item.blockHeight;

  // find post to retrieve Id or print a warning that we don't have it
  try {
    const post = await prisma.posts.findFirstOrThrow({
      where: {
        account_id: postAuthor,
        block_height: postBlockHeight,
      }
    })
    try {
      delete comment["item"];
      await prisma.comments.create({
        data: {
          post_id: post.id,
          account_id: accountId,
          receipt_id: receiptId,
          block_height: blockHeight,
          block_timestamp: blockTimestamp,
          content: JSON.stringify(comment),
        }
      })
      console.log(`Comment by ${accountId} has been added to the database`);
    } catch (e) {
      console.warn(`Failed to store comment to the post ${postAuthor}/${postBlockHeight} by ${accountId} perhaps it has already been stored.`);
    }
  } catch (e) {
    console.warn(`Failed to store comment to the post ${postAuthor}/${postBlockHeight} as we don't have the post stored.`);
  }
}

async function handleLike(
  accountId: string,
  blockHeight: number,
  blockTimestamp: string,
  receiptId: string,
  likeContent: string,
): Promise<void> {
  const like = JSON.parse(likeContent);
  const likeAction = like.value.type; // like or unlike
  const [itemAuthor, _, itemType] = like.key.path.split('/', 3);
  const itemBlockHeight = like.key.blockHeight;
  switch (itemType) {
    case 'main':
      try {
        const post = await prisma.posts.findFirstOrThrow({
          where: {
            account_id: itemAuthor,
            block_height: itemBlockHeight,
          }
        })
        console.log('LIKE_ACTION', likeAction);
        switch (likeAction) {
          case 'like':
            await _handlePostLike(post.id, accountId, blockHeight, blockTimestamp);
            break;
          case 'unlike':
          default:
            await _handlePostUnlike(post.id, accountId);
            break;


        }
      } catch (e) {
        console.warn(`Failed to store like to post ${itemAuthor}/${itemBlockHeight} as we don't have it stored in the first place.`);
      }
      break;
    case 'comment':
      // Comment
      console.warn(`Likes to comments are not supported yet. Skipping`);
      break;
    default:
      // something else
      console.warn(`Got unsupported like type "${itemType}". Skipping...`);
      break;
  }
}

async function _handlePostLike(
  postId: number,
  likeAuthorAccountId: string,
  likeBlockHeight: number,
  blockTimestamp: string,
): Promise<void> {
  try {
    const post = await prisma.posts.findUnique({
      where: {
        id: postId,
      }
    });
    let accountsLiked = post.accounts_liked as Prisma.JsonArray;

    // it's a hacky workaround since Prims.JsonArray can't be converted into a Set
    // and back. There is old related issue https://github.com/prisma/prisma/issues/3219
    if (accountsLiked.indexOf(likeAuthorAccountId) === -1) {
      accountsLiked.push(likeAuthorAccountId);
    }

    await prisma.posts.update({
      where: {
        id: postId,
      },
      data: {
        accounts_liked: accountsLiked,
      }
    });

    await prisma.post_likes.create({
      data: {
        post_id: postId,
        account_id: likeAuthorAccountId,
        block_height: likeBlockHeight,
        block_timestamp: blockTimestamp,
      }
    })


  } catch (e) {
    console.error(`Failed to store like to in the database: ${e}`);
  }
}

async function _handlePostUnlike(
  postId: number,
  likeAuthorAccountId: string,
): Promise<void> {
  try {
    const post = await prisma.posts.findUnique({
      where: {
        id: postId,
      }
    });
    let accountsLiked = post.accounts_liked as Prisma.JsonArray;
    let indexOfLikeAuthorAccountIdInPost = accountsLiked.indexOf(likeAuthorAccountId);
    if (indexOfLikeAuthorAccountIdInPost >= -1) {
      delete accountsLiked[indexOfLikeAuthorAccountIdInPost];
      await prisma.posts.update({
        where: {
          id: postId
        },
        data: {
          accounts_liked: accountsLiked,
        }
      });
    }

    await prisma.post_likes.delete({
      where: {
        post_id_account_id: {
          post_id: postId,
          account_id: likeAuthorAccountId,
        },
      }
    })
  } catch (e) {
    console.error(`Failed to delete like from the database: ${e}`);
  }
}

(async () => {
  await startStream(lakeConfig, handleStreamerMessage);
})();
