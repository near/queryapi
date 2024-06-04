"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logConsumer = void 0;
const stream_1 = require("stream");
const logConsumer = (stream) => {
    const readable = new stream_1.Readable().wrap(stream);
    readable.on('data', (chunk) => {
        console.log(chunk.toString());
    });
};
exports.logConsumer = logConsumer;
