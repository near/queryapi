declare const Buffer; // ref: https://stackoverflow.com/a/38877890

import { PrismaClient } from '@prisma/client'

import { startStream, types } from '@near-lake/framework';

const lakeConfig: types.LakeConfig = {
  s3BucketName: "near-lake-data-mainnet",
  s3RegionName: "eu-central-1",
  startBlockHeight: 84100119,
};

const SOCIAL_DB = 'social.near';

const prisma = new PrismaClient()

function base64decode(encodedValue: string): object {
  let buff = Buffer.from(encodedValue, 'base64');
  return JSON.parse(buff.toString('utf-8'));
}

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
        try {
          await prisma.posts.create({
            data: {
              account_id: accountId,
              receipt_id: postAction.receiptId,
              block_height: blockHeight,
              block_timestamp: blockTimestamp,
              content: postAction.args.data[accountId].post.main,
            }
          })
          console.log(`Post by ${accountId} has been added to the database`);
        } catch (e) {
          console.error(`Failed to store post by ${accountId} to the database (perhaps it already stored)`);
        }
      } else if (postAction.args.data[accountId].post && 'comment' in postAction.args.data[accountId].post) { // if creates a comment
        const comment = JSON.parse(postAction.args.data[accountId].post.comment);
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
                receipt_id: postAction.receiptId,
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
      } else if ('index' in postAction.args.data[accountId]) {
        // Probably like or unlike action is happening
        if ('like' in postAction.args.data[accountId].index) {
          const like = JSON.parse(postAction.args.data[accountId].index.like);
          const likeAction = like.value;
          const [itemAuthor, _, itemType] = like.key.path.split('/', 3);
          const itemBlockHeight = like.key.blockHeight;
          switch (itemType) {
            case 'main':
              // Post
              try {
                const post = await prisma.posts.findFirstOrThrow({
                  where: {
                    account_id: itemAuthor,
                    block_height: itemBlockHeight,
                  }
                })
                switch (likeAction) {
                  case 'like':
                    try {
                      await prisma.post_likes.create({
                        data: {
                          post_id: post.id,
                          account_id: itemAuthor,
                          block_height: itemBlockHeight,
                          block_timestamp: blockTimestamp,
                        }
                      })
                    } catch (e) {
                      console.error(`Failed to store like to in the database: ${e}`);
                    }
                    break;
                  case 'unlike':
                  default:
                    try {
                      await prisma.post_likes.delete({
                        where: {
                          post_id_account_id: {
                            post_id: post.id,
                            account_id: itemAuthor,
                          },
                        }
                      })
                    } catch (e) {
                      console.error(`Failed to delete like from the database: ${e}`);
                    }
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
      }
    })
  }
}

(async () => {
  await startStream(lakeConfig, handleStreamerMessage);
})();
