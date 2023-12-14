import runnerClient from './service/runner-client';

void (async function main () {
  let count = 0;
  while (count < 6) {
    console.log('count: ', count);
    if (count === 3) {
      runnerClient.StartStream({
        streamId: 'flatirons.near/demo_blockheight:real_time:stream',
        redisStream: 'flatirons.near/demo_blockheight:real_time:stream',
      }, (err, response) => {
        if (err) {
          console.error('error: ', err);
        } else {
          console.log('response: ', response);
        }
      });
    }

    runnerClient.ListStreams({}, (err, response) => {
      if (err) {
        console.error('error: ', err);
      } else {
        console.log('response: ', response);
      }
    });
    await new Promise((resolve) =>
      setTimeout(resolve, 1000),
    );
    count++;
  }
})();
