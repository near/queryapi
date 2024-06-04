"use strict";
const { decompressToBitmapArray } = require("./bitmap");
function bitmapToString(buffer) {
    return buffer.reduce((r, b) => r + b.toString(2).padStart(8, "0"), "");
}
function compressedBase64ToBitmapString(base64) {
    return bitmapToString(Buffer.from(base64, "base64"));
}
function decompressBase64ToBitmapString(base64) {
    return bitmapToString(decompressToBitmapArray(Buffer.from(base64, "base64")));
}
function base64BitmapToString(base64) {
    const buffer = Buffer.from(base64, "base64");
    return buffer.reduce((r, b) => r + b.toString(2).padStart(8, "0"), "");
}
function decompressBitmapString(compressedStrBit) {
    let target = compressedStrBit[0];
    let result = "";
    let remainder = compressedStrBit.slice(1);
    while (remainder.length) {
        const { x, len } = decodeEliasGammaFirstEntry(remainder);
        result += target.repeat(x);
        target = target === "0" ? "1" : "0";
        remainder = remainder.slice(len);
        if (len === 0)
            break; // we won't find any Elias gamma here, exiting
        //console.log(`remainder=${remainder}, len=${len}`)
    }
    return result;
}
function decompressBase64(compressedBase64) {
    if (!compressedBase64 || compressedBase64 === "") {
        return "";
    }
    const bitmap = bitmapToString(Buffer.from(compressedBase64, "base64"));
    return decompressBitmapString(bitmap);
}
// bit packing: converts array of indexes to a bitmap packed into Uint8Array
// example: [0,1,6] -> "11000010" -> [194]
function indexArrayToBitmap(arr) {
    const lastItem = arr[arr.length - 1];
    return arr.reduce((bytes, idx) => {
        bytes[Math.floor(idx / 8)] |= 1 << (7 - (idx % 8));
        return bytes;
    }, new Uint8Array(Math.floor(lastItem / 8) + 1));
}
// example: [0,1,6] -> "11000010"
function indexArrayToBitmapString(arr) {
    return bitmapToString(indexArrayToBitmap(arr));
}
// example: "0101" -> [1,3]
function bitmapStringToIndexArray(strBits, startBlockHeight) {
    const result = [];
    for (let i = 0; i < strBits.length; i++) {
        if (strBits[i] === "1") {
            result.push(i + startBlockHeight);
        }
    }
    return result;
}
function indexArrayFromCompressedBase64(compressedBase64, startBlockHeight = 0) {
    const decompressedBase64 = decompressBase64(compressedBase64);
    return bitmapStringToIndexArray(decompressedBase64, startBlockHeight);
}
// returns first number x and corresponding coded string length of the first occurrence of
// Elias gamma coding. E.g. for "0101" returns {x:2,len:3}
function decodeEliasGammaFirstEntry(strBits) {
    if (strBits === "")
        return { x: 0, len: 0 };
    const N = strBits.indexOf("1");
    if (N < 0) {
        return { x: 0, len: strBits.length };
    }
    const remainder = strBits.slice(N + 1, 2 * N + 1);
    return { x: 2 ** N + (parseInt(remainder, 2) || 0), len: 2 * N + 1 };
}
function strBitmapToBitmap(strBits) {
    const bytes = new Uint8Array(Math.ceil(strBits.length / 8));
    for (let bit = 0; bit < strBits.length; bit++) {
        if (strBits[bit] === "1") {
            bytes[Math.floor(bit / 8)] |= 1 << (7 - (bit % 8));
        }
    }
    return bytes;
}
module.exports = {
    base64BitmapToString,
    compressedBase64ToBitmapString,
    indexArrayToBitmap,
    strBitmapToBitmap,
    decompressBase64,
    bitmapToString,
    indexArrayToBitmapString,
    bitmapStringToIndexArray,
    indexArrayFromCompressedBase64,
    decompressBase64ToBitmapString,
};
