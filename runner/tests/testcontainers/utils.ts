import { Readable } from 'stream';

export const logConsumer = (stream: Readable): void => {
  const readable = new Readable().wrap(stream);
  readable.on('data', (chunk) => {
    console.log(chunk.toString());
  });
};
