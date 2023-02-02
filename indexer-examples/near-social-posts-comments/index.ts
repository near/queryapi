declare const Buffer; // ref: https://stackoverflow.com/a/38877890

import { PrismaClient } from '@prisma/client'

import { startStream, types } from 'near-lake-framework';

const lakeConfig: types.LakeConfig = {
  s3BucketName: "near-lake-data-mainnet",
  s3RegionName: "eu-central-1",
  startBlockHeight: 83951394,
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
          args: base64decode(functionCallOperation.args)
        }))
        .filter(functionCall =>
          'post' in functionCall.args.data[action.predecessorId]
        )
    );

  if (nearSocialPosts.length > 0) {
    const blockHeight = block.blockHeight;
    console.log(blockHeight);
    console.dir(nearSocialPosts, { depth: null })
    nearSocialPosts.forEach(async postAction => {
      const accountId = Object.keys(postAction.args.data)[0];

      // if creates a post
      if ('main' in postAction.args.data[accountId].post) {
        await prisma.posts.create({
          data: {
            account_id: accountId,
            block_height: blockHeight,
            content: postAction.args.data[accountId].post.main,
          }
        })
        console.log(`Post by ${accountId} has been added to the database`);
      } else if ('comment' in postAction.args.data[accountId].post) { // if creates a comment
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
          delete comment["item"];
          await prisma.comments.create({
            data: {
              post_id: post.id,
              account_id: accountId,
              block_height: blockHeight,
              content: JSON.stringify(comment),
            }
          })
          console.log(`Comment by ${accountId} has been added to the database`);
        } catch (e) {
          console.warn(`Failed to store comment to the post ${postAuthor}/${postBlockHeight} because we don't have the post in DB`);
        }
      }
    })
  }
}

(async () => {
  await startStream(lakeConfig, handleStreamerMessage);
})();
