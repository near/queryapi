// fetch test blocks from block server
import fetch from 'node-fetch';
import fs from 'fs';

class TestBlockFetcher {
    constructor() {
        this.blockServerUrl = "https://70jshyr5cb.execute-api.eu-central-1.amazonaws.com/block/";
        this.testBlocks = [92476362, 93085141];
    }

    async fetchBlocks() {
        this.testBlocks.forEach(blockNumber => {
            this.fetchBlock(blockNumber)
        })
    }

    async fetchBlock(blockNumber) {
        // request block
        const url = this.blockServerUrl + blockNumber + '?snake_case=true';
        const response = await fetch(url);
        const block = await response.json();

        // write to file
        const fileName = blockNumber + ".json";
        const filePath = "./blocks/" + fileName;
        try {
            fs.writeFileSync(filePath, JSON.stringify(block));
        } catch (err) {
            console.error(err);
        }
    }
}

await new TestBlockFetcher().fetchBlocks();