import React, { useContext, useState, useEffect, ChangeEvent } from "react";
import { IndexerDetailsContext } from '../../../contexts/IndexerDetailsContext';
import { validateContractIds } from "../../../utils/validators";
import PublishFormView from "../ModalsView/PublishFormView";

interface Props {
    updateConfig: (indexerName: string, contractFilter: string, blockHeight: string, startBlock: string) => void;
}

const GENESIS_BLOCK_HEIGHT: number = 9820210;

enum START_BLOCK {
    CONTINUE = "startBlockContinue",
    LATEST = "startBlockLatest",
    HEIGHT = "startBlockHeight",
}

const ViewContainer: React.FC<Props> = ({ updateConfig }) => {
    const { indexerDetails, showPublishModal, isCreateNewIndexer, latestHeight } = useContext(IndexerDetailsContext);
    const [blockHeight, setBlockHeight] = useState("0");
    const [contractFilter, setContractFilter] = useState("social.near");
    const [startBlock, setStartBlock] = useState<START_BLOCK>(START_BLOCK.LATEST);
    const [isContractFilterValid, setIsContractFilterValid] = useState(true);
    const [indexerNameField, setIndexerNameField] = useState<string>(indexerDetails.indexerName || "");
    const [blockHeightError, setBlockHeightError] = useState<string | null>(null);

    useEffect(() => {
        if (indexerDetails.rule?.affected_account_id) {
            setContractFilter(indexerDetails.rule.affected_account_id);
        }

        if (typeof indexerDetails.startBlock === 'object' && indexerDetails.startBlock !== null) {
            const startBlock = indexerDetails.startBlock as { HEIGHT: string };
            if (startBlock.HEIGHT) {
                setStartBlock(START_BLOCK.HEIGHT);
                setBlockHeight(startBlock.HEIGHT);
                return;
            }
        }

        if (indexerDetails.startBlock === "LATEST") {
            setStartBlock(START_BLOCK.LATEST);
            return;
        }

        if (indexerDetails.startBlock === "CONTINUE") {
            setStartBlock(START_BLOCK.CONTINUE);
            return;
        }
    }, [indexerDetails]);

    const onChangeStartBlock = (e: ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value as START_BLOCK;
        setStartBlock(value);

        if (value === START_BLOCK.CONTINUE) {
            handleSetContractFilter(indexerDetails.rule.affected_account_id);
        }
    };

    function handleSetContractFilter(contractFilter: string) {
        setContractFilter(contractFilter);
        const isContractFilterValid = validateContractIds(contractFilter);
        setIsContractFilterValid(isContractFilterValid);
    }

    useEffect(() => {
        if (startBlock === START_BLOCK.HEIGHT && parseInt(blockHeight) <= GENESIS_BLOCK_HEIGHT) {
            setBlockHeightError(`Choose a block height greater than the Genesis BlockHeight ${GENESIS_BLOCK_HEIGHT}. Latest Block Height is ${latestHeight}`);
            return;
        }
        setBlockHeightError(null);
        updateConfig(indexerNameField, contractFilter, blockHeight, startBlock);
    }, [indexerNameField, contractFilter, startBlock, blockHeight, latestHeight, updateConfig]);

    return (
        <PublishFormView
            indexerNameField={indexerNameField}
            isCreateNewIndexer={isCreateNewIndexer}
            showPublishModal={showPublishModal}
            startBlock={startBlock}
            blockHeight={blockHeight}
            contractFilter={contractFilter}
            latestHeight={latestHeight}
            blockHeightError={blockHeightError}
            isContractFilterValid={isContractFilterValid}
            onChangeStartBlock={onChangeStartBlock}
            setIndexerNameField={setIndexerNameField}
            setBlockHeight={setBlockHeight}
            handleSetContractFilter={handleSetContractFilter}
            updateConfig={updateConfig}
            indexerDetails={indexerDetails}
        />
    );
};

export default ViewContainer;
