const { parse } = require('csv-parse/sync');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs');
const {
  addIndexCompressedFull,
  decompressToBitmapArray,
  addIndexCompressedLast,
} = require("./bitmap");
const {
  decompressBase64,
  bitmapToString,
  indexArrayFromCompressedBase64,
  indexArrayToBitmapString,
  indexArrayToBitmap,
  bitmapStringToIndexArray,
  strBitmapToBitmap,
  base64BitmapToString,
  compressedBase64ToBitmapString,
  decompressBase64ToBitmapString,
} = require("./helpers");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

const csvFilePath = './QueryApi_Bitmap_Unique_v2.csv';
const csvWriter = createCsvWriter({
  path: csvFilePath,
  header: [
    { id: 'receiverId', title: 'Receiver ID' },
    { id: 'blockDate', title: 'Block Date' },
    { id: 'uniqueFromIndexFiles', title: 'Block Heights not present in Index Files' },
    { id: 'uniqueFromDatabricks', title: 'Block Heights not present in Databricks' },
    { id: 'databricksUnique', title: 'Block Heights unique to Databricks' },
  ]
});
const s3Client = new S3Client({ region: "eu-central-1", credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY } });

const fileContent = fs.readFileSync('./databricks_bitmap_v5_diff_v2.csv', 'utf8');
const records = parse(fileContent);
const toWriteRecords = [];
const missingIndexFileReceivers = new Set();

const getIndexFile = async (receiverId, params) => {
  try {
    const command = new GetObjectCommand(params);
    const data = await s3Client.send(command);

    const streamToString = (stream) =>
      new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      });

    const jsonString = await streamToString(data.Body);

    // Parse the JSON string
    const jsonObject = JSON.parse(jsonString);
    return jsonObject;
  } catch (err) {
    missingIndexFileReceivers.add(receiverId);
    throw err;
  }
};

const checkRecord = async (record) => {
  const blockDate = record[0];
  const receiverId = record[1];
  const databricksStartHeight = parseInt(record[2]);
  const databricksBitmap = record[4];
  const postgresStartHeight = parseInt(record[8]);
  const postgresBitmap = record[9];
  const receiverIndexFilePath = receiverId.split('.').reverse().join('/');

  const databricksArr = indexArrayFromCompressedBase64(databricksBitmap, databricksStartHeight);
  const queryapiArr = indexArrayFromCompressedBase64(postgresBitmap, postgresStartHeight);
  // console.log(`QueryApi array for ${blockDate} ${receiverId}: ${queryapiArr}`);
  
  const queryapiUniqueFromDatabricks = queryapiArr.filter(x => !databricksArr.includes(x));
  const databricksUnique = databricksArr.filter(x => !queryapiArr.includes(x));
  // if (databricksUnique.length > 0) {
    // console.log(`Databricks unique for ${blockDate} ${receiverId}: ${databricksUnique ?? '[]'}`);
    // return;
  // }

  const params = {
    Bucket: 'near-delta-lake',
    Key: `silver/accounts/action_receipt_actions/metadata/${receiverIndexFilePath}/${blockDate}.json`
  };

  try {
    const data = await getIndexFile(receiverId, params);
    const indexFileArr = data.heights;
    const indexFileUnique = indexFileArr.filter(x => !queryapiArr.includes(x));
    const queryapiUniqueFromIndexFiles = queryapiArr.filter(x => !indexFileArr.includes(x));
    if (indexFileUnique.length > 0) {
      console.log(`Index file unique for ${blockDate} ${receiverId}: ${indexFileUnique}`);
      return;
    }
    
    toWriteRecords.push({
      receiverId,
      blockDate,
      uniqueFromIndexFiles: queryapiUniqueFromIndexFiles,
      uniqueFromDatabricks: queryapiUniqueFromDatabricks,
      databricksUnique,
    });
  } catch (err) {
    toWriteRecords.push({
      receiverId,
      blockDate,
      uniqueFromIndexFiles: ["FAILED TO GET INDEX FILE"],
      uniqueFromDatabricks: queryapiUniqueFromDatabricks,
      databricksUnique,
    });
  }
};

const runCode = async () => {
  const processRecords = records.map((record) => {
    return checkRecord(record);
  });

  await Promise.all(processRecords);
  console.log(`Missing index files for receivers: ${Array.from(missingIndexFileReceivers)}`);
  await csvWriter.writeRecords(toWriteRecords);
};

runCode();