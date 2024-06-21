import type * as borsh_lib_types_types from 'borsh/lib/types/types';
import type * as borsh from 'borsh';
import * as borsher from 'borsher';

function _mergeNamespaces(n, m) {
    m.forEach(function (e) {
        e && typeof e !== 'string' && !Array.isArray(e) && Object.keys(e).forEach(function (k) {
            if (k !== 'default' && !(k in n)) {
                const d = Object.getOwnPropertyDescriptor(e, k);
                Object.defineProperty(n, k, d.get ? d : {
                    enumerable: true,
                    get: function () { return e[k]; }
                });
            }
        });
    });
    return Object.freeze(n);
}

declare class LakeContext {
}

type BlockHeight = number;
interface StreamerMessage {
    block: BlockView;
    shards: Shard[];
}
interface BlockView {
    author: string;
    header: BlockHeaderView;
    chunks: ChunkHeader[];
}
interface BlockHeaderView {
    author: any;
    approvals: (string | null)[];
    blockMerkleRoot: string;
    blockOrdinal: number;
    challengesResult: ChallengeResult[];
    challengesRoot: string;
    chunkHeadersRoot: string;
    chunkMask: boolean[];
    chunkReceiptsRoot: string;
    chunkTxRoot: string;
    chunksIncluded: number;
    epochId: string;
    epochSyncDataHash: string | null;
    gasPrice: string;
    hash: string;
    height: number;
    lastDsFinalBlock: string;
    lastFinalBlock: string;
    latestProtocolVersion: number;
    nextBpHash: string;
    nextEpochId: string;
    outcomeRoot: string;
    prevHash: string;
    prevHeight: number;
    prevStateRoot: string;
    randomValue: string;
    rentPaid: string;
    signature: string;
    timestamp: number;
    timestampNanosec: string;
    totalSupply: string;
    validatorProposals: [];
    validatorReward: string;
}
interface Shard {
    shardId: number;
    chunk?: ChunkView;
    receiptExecutionOutcomes: ExecutionOutcomeWithReceipt[];
    stateChanges: StateChangeWithCauseView[];
}
type ValidatorStakeView = {
    accountId: string;
    publicKey: string;
    stake: string;
    validatorStakeStructVersion: string;
};
type ChallengeResult = {
    accountId: string;
    isDoubleSign: boolean;
};
interface ChunkHeader {
    balanceBurnt: number;
    chunkHash: string;
    encodedLength: number;
    encodedMerkleRoot: string;
    gasLimit: number;
    gasUsed: number;
    heightCreated: number;
    heightIncluded: number;
    outcomeRoot: string;
    outgoingReceiptsRoot: string;
    prevBlockHash: string;
    prevStateRoot: string;
    rentPaid: string;
    shardId: number;
    signature: string;
    txRoot: string;
    validatorProposals: ValidatorProposal[];
    validatorReward: string;
}
type ValidatorProposal = {
    accountId: string;
    publicKey: string;
    stake: string;
    validatorStakeStructVersion: string;
};
interface ChunkView {
    author: string;
    header: ChunkHeader;
    receipts: ReceiptView[];
    transactions: IndexerTransactionWithOutcome[];
}
type ActionReceipt = {
    Action: {
        actions: ActionView[];
        gasPrice: string;
        inputDataIds: string[];
        outputDataReceivers: DataReceiver[];
        signerId: string;
        signerPublicKey: string;
    };
};
type DataReceipt = {
    Data: {
        data: string;
        dataId: string;
    };
};
type ReceiptEnum = ActionReceipt | DataReceipt;
type DataReceiver = {
    dataId: string;
    receiverId: string;
};
type ReceiptView = {
    predecessorId: string;
    receiptId: string;
    receiverId: string;
    receipt: ReceiptEnum;
};
/**
 * `ExecutionStatus` is a simplified representation of the `ExecutionStatusView` from [near-primitives](https://github.com/near/nearcore/tree/master/core/primitives). Represent the execution outcome status for the `Receipt`.
 */
type ExecutionStatus = {
    /**
     * Execution succeeded with a value, value is represented by `Uint8Array` and can be anything.
     */
    SuccessValue: Uint8Array;
} | {
    /**
     * Execution succeeded and a result of the execution is a new `Receipt` with the id.
     */
    SuccessReceiptId: string;
} | {
    /**
     * Execution failed with an error represented by a `String`.
     */
    Failure: string;
} | "Postponed";
type ExecutionProof = {
    direction: string;
    hash: string;
};
type ExecutionOutcomeWithReceipt = {
    executionOutcome: {
        blockHash: string;
        id: string;
        outcome: {
            executorId: string;
            gasBurnt: number;
            logs: string[];
            metadata: {
                gasProfile: string | null;
                version: number;
            };
            receiptIds: string[];
            status: ExecutionStatus;
            tokensBurnt: string;
        };
        proof: ExecutionProof[];
    };
    receipt: ReceiptView;
};
type IndexerTransactionWithOutcome = {
    transaction: Transaction$1;
    outcome: ExecutionOutcomeWithReceipt;
};
type Transaction$1 = {
    signerId: string;
    publicKey: string;
    nonce: number;
    receiverId: string;
    actions: ActionView[];
    signature: string;
    hash: string;
};
type DeployContractAction = {
    DeployContract: {
        code: string;
    };
};
type FunctionCallAction = {
    FunctionCall: {
        methodName: string;
        args: string;
        gas: number;
        deposit: string;
    };
};
type TransferAction = {
    Transfer: {
        deposit: string;
    };
};
type StakeAction = {
    Stake: {
        stake: number;
        publicKey: string;
    };
};
type AddKeyAction = {
    AddKey: {
        publicKey: string;
        accessKey: AccessKey$1;
    };
};
interface AccessKey$1 {
    nonce: number;
    permission: string | AccessKeyFunctionCallPermission$1;
}
interface AccessKeyFunctionCallPermission$1 {
    FunctionCall: {
        allowance: string;
        receiverId: string;
        methodNames: string[];
    };
}
type DeleteKeyAction = {
    DeleteKey: {
        publicKey: string;
    };
};
type DeleteAccountAction = {
    DeleteAccount: {
        beneficiaryId: string;
    };
};
type DelegateAction = {
    Delegate: {
        delegateAction: {
            senderId: string;
            receiverId: string;
            actions: NonDelegateAction[];
            nonce: number;
            maxBlockHeight: number;
            publicKey: string;
        };
    };
    signature: string;
};
type NonDelegateAction = "CreateAccount" | DeployContractAction | FunctionCallAction | TransferAction | StakeAction | AddKeyAction | DeleteKeyAction | DeleteAccountAction;
type ActionView = "CreateAccount" | DeployContractAction | FunctionCallAction | TransferAction | StakeAction | AddKeyAction | DeleteKeyAction | DeleteAccountAction | DelegateAction;
type StateChangeWithCauseView = {
    change: {
        accountId: string;
        keyBase64: string;
        valueBase64: string;
    };
    cause: {
        receiptHash: string;
        type: string;
    };
    value: {
        accountId: string;
        keyBase64: string;
        valueBase64: string;
    };
    type: string;
};

type Log = {
    log: string;
    relatedReceiptId: string;
};
/**
 * This structure is an ephemeral entity to provide access to the [Events Standard](https://github.com/near/NEPs/blob/master/neps/nep-0297.md) structure and keep data about the related `Receipt` for convenience.
 *
 * #### Interface for Capturing Data About an Event in `handleStreamerMessage()`
 *
 * The interface to capture data about an event has the following arguments:
 *  - `standard`: name of standard, e.g. nep171
 *  - `version`: e.g. 1.0.0
 *  - `event`: type of the event, e.g. `nft_mint`
 *  - `data`: associate event data. Strictly typed for each set {standard, version, event} inside corresponding NEP
 */
declare class Event {
    readonly relatedReceiptId: string;
    readonly rawEvent: RawEvent;
    constructor(relatedReceiptId: string, rawEvent: RawEvent);
    static fromLog: (log: string) => Event;
}
/**
 * This structure is a copy of the [JSON Events](https://github.com/near/NEPs/blob/master/neps/nep-0297.md) structure representation.
 */
declare class RawEvent {
    readonly event: string;
    readonly standard: string;
    readonly version: string;
    readonly data: JSON | undefined;
    constructor(event: string, standard: string, version: string, data: JSON | undefined);
    static isEvent: (log: string) => boolean;
    static fromLog: (log: string) => RawEvent;
}
type Events = {
    events: Event[];
};

/**
 * This field is a simplified representation of the `ReceiptView` structure from [near-primitives](https://github.com/near/nearcore/tree/master/core/primitives).
 */
declare class Receipt implements Events {
    /**
     * Defined the type of the `Receipt`: `Action` or `Data` representing the `ActionReceipt` and `DataReceipt`.
     */
    readonly receiptKind: ReceiptKind;
    /**
     * The ID of the `Receipt` of the `CryptoHash` type.
     */
    readonly receiptId: string;
    /**
     * The receiver account id of the `Receipt`.
     */
    readonly receiverId: string;
    /**
     * The predecessor account id of the `Receipt`.
     */
    readonly predecessorId: string;
    /**
     * Represents the status of `ExecutionOutcome` of the `Receipt`.
     */
    readonly status: ExecutionStatus;
    /**
     * The id of the `ExecutionOutcome` for the `Receipt`. Returns `null` if the `Receipt` isn’t executed yet and has a postponed status.
     */
    readonly executionOutcomeId?: string | undefined;
    /**
     * The original logs of the corresponding `ExecutionOutcome` of the `Receipt`.
     *
     * **Note:** not all of the logs might be parsed as JSON Events (`Events`).
     */
    readonly logs: string[];
    constructor(
        /**
         * Defined the type of the `Receipt`: `Action` or `Data` representing the `ActionReceipt` and `DataReceipt`.
         */
        receiptKind: ReceiptKind,
        /**
         * The ID of the `Receipt` of the `CryptoHash` type.
         */
        receiptId: string,
        /**
         * The receiver account id of the `Receipt`.
         */
        receiverId: string,
        /**
         * The predecessor account id of the `Receipt`.
         */
        predecessorId: string,
        /**
         * Represents the status of `ExecutionOutcome` of the `Receipt`.
         */
        status: ExecutionStatus,
        /**
         * The id of the `ExecutionOutcome` for the `Receipt`. Returns `null` if the `Receipt` isn’t executed yet and has a postponed status.
         */
        executionOutcomeId?: string | undefined,
        /**
         * The original logs of the corresponding `ExecutionOutcome` of the `Receipt`.
         *
         * **Note:** not all of the logs might be parsed as JSON Events (`Events`).
         */
        logs?: string[]);
    /**
     * Returns an Array of `Events` for the `Receipt`, if any. This might be empty if the `logs` field is empty or doesn’t contain JSON Events compatible log records.
     */
    get events(): Event[];
    static fromOutcomeWithReceipt: (outcomeWithReceipt: ExecutionOutcomeWithReceipt) => Receipt;
}
/**
 * `ReceiptKind` a simple `enum` to represent the `Receipt` type: either `Action` or `Data`.
 */
declare enum ReceiptKind {
    Action = "Action",
    Data = "Data"
}
/**
 * `Action` is the structure with the fields and data relevant to an `ActionReceipt`.
 *
 * Basically, `Action` is the structure that indexer developers will be encouraged to work the most in their action-oriented indexers.
 */
declare class Action {
    /**
     * The id of the corresponding `Receipt`
     */
    readonly receiptId: string;
    /**
     * The predecessor account id of the corresponding `Receipt`.
     * This field is a piece of denormalization of the structures (`Receipt` and `Action`).
     */
    readonly predecessorId: string;
    /**
     * The receiver account id of the corresponding `Receipt`.
     * This field is a piece of denormalization of the structures (`Receipt` and `Action`).
     */
    readonly receiverId: string;
    /**
     * The signer account id of the corresponding `Receipt`
     */
    readonly signerId: string;
    /**
     * The signer’s PublicKey for the corresponding `Receipt`
     */
    readonly signerPublicKey: string;
    /**
     * An array of `Operation` for this `ActionReceipt`
     */
    readonly operations: Operation[];
    constructor(
        /**
         * The id of the corresponding `Receipt`
         */
        receiptId: string,
        /**
         * The predecessor account id of the corresponding `Receipt`.
         * This field is a piece of denormalization of the structures (`Receipt` and `Action`).
         */
        predecessorId: string,
        /**
         * The receiver account id of the corresponding `Receipt`.
         * This field is a piece of denormalization of the structures (`Receipt` and `Action`).
         */
        receiverId: string,
        /**
         * The signer account id of the corresponding `Receipt`
         */
        signerId: string,
        /**
         * The signer’s PublicKey for the corresponding `Receipt`
         */
        signerPublicKey: string,
        /**
         * An array of `Operation` for this `ActionReceipt`
         */
        operations: Operation[]);
    static isActionReceipt: (receipt: ReceiptView) => boolean;
    static fromReceiptView: (receipt: ReceiptView) => Action | null;
}
declare class DeployContract {
    readonly code: Uint8Array;
    constructor(code: Uint8Array);
}
declare class FunctionCall {
    readonly methodName: string;
    readonly args: Uint8Array;
    readonly gas: number;
    readonly deposit: string;
    constructor(methodName: string, args: Uint8Array, gas: number, deposit: string);
}
declare class Transfer {
    readonly deposit: string;
    constructor(deposit: string);
}
declare class Stake {
    readonly stake: number;
    readonly publicKey: string;
    constructor(stake: number, publicKey: string);
}
declare class AddKey {
    readonly publicKey: string;
    readonly accessKey: AccessKey;
    constructor(publicKey: string, accessKey: AccessKey);
}
declare class DeleteKey {
    readonly publicKey: string;
    constructor(publicKey: string);
}
declare class DeleteAccount {
    readonly beneficiaryId: string;
    constructor(beneficiaryId: string);
}
/**
 * A representation of the original `ActionView` from [near-primitives](https://github.com/near/nearcore/tree/master/core/primitives).
 */
type Operation = 'CreateAccount' | DeployContract | FunctionCall | Transfer | Stake | AddKey | DeleteKey | DeleteAccount;
declare class AccessKey {
    readonly nonce: number;
    readonly permission: string | AccessKeyFunctionCallPermission;
    constructor(nonce: number, permission: string | AccessKeyFunctionCallPermission);
}
declare class AccessKeyFunctionCallPermission {
    readonly allowance: string;
    readonly receiverId: string;
    readonly methodNames: string[];
    constructor(allowance: string, receiverId: string, methodNames: string[]);
}

/**
 * A representation of the `IndexerTransactionWithOutcome` from `near-indexer-primitives` which is an ephemeral structure combining `SignedTransactionView` from [near-primitives](https://github.com/near/nearcore/tree/master/core/primitives) and `IndexerExecutionOutcomeWithOptionalReceipt` from `near-indexer-primitives`.
 *
 * This structure is very similar to `Receipt`. Unlike `Receipt`, a `Transaction` has a few additional fields like `signerId`, `signature`, and `operations`.
 */
declare class Transaction {
    /**
     * Returns the hash of the `Transaction` in `CryptoHash`.
     */
    readonly transactionHash: string;
    /**
     * Returns the signer account id of the `Transaction`.
     */
    readonly signerId: string;
    /**
     * Returns the `PublicKey` of the signer of the `Transaction`.
     */
    readonly signerPublicKey: string;
    /**
     * Returns the `Signature` the `Transaction` was signed with.
     */
    readonly signature: string;
    /**
     * Returns the receiver account id of the `Transaction`.
     */
    readonly receiverId: string;
    /**
     * Returns the status of the `Transaction` as `ExecutionStatus`.
     */
    readonly status: ExecutionStatus;
    /**
     * Returns the id of the `ExecutionOutcome` for the `Transaction`.
     */
    readonly executionOutcomeId: string;
    /**
     * Returns an Array of `Operation` for the `Transaction`.
     */
    readonly operations: Operation[];
    constructor(
        /**
         * Returns the hash of the `Transaction` in `CryptoHash`.
         */
        transactionHash: string,
        /**
         * Returns the signer account id of the `Transaction`.
         */
        signerId: string,
        /**
         * Returns the `PublicKey` of the signer of the `Transaction`.
         */
        signerPublicKey: string,
        /**
         * Returns the `Signature` the `Transaction` was signed with.
         */
        signature: string,
        /**
         * Returns the receiver account id of the `Transaction`.
         */
        receiverId: string,
        /**
         * Returns the status of the `Transaction` as `ExecutionStatus`.
         */
        status: ExecutionStatus,
        /**
         * Returns the id of the `ExecutionOutcome` for the `Transaction`.
         */
        executionOutcomeId: string,
        /**
         * Returns an Array of `Operation` for the `Transaction`.
         */
        operations: Operation[]);
}

/**
 * This structure is almost an identical copy of the `StateChangeWithCauseView` from [near-primitives](https://github.com/near/nearcore/tree/master/core/primitives) with a propagated additional field `affectedAccountId`.
 */
declare class StateChange {
    /**
     * Returns the `cause` of the `StateChange`.
     */
    readonly cause: StateChangeCause;
    /**
     * Returns the `value` of the `StateChange`.
     */
    readonly value: StateChangeValue;
    constructor(
        /**
         * Returns the `cause` of the `StateChange`.
         */
        cause: StateChangeCause,
        /**
         * Returns the `value` of the `StateChange`.
         */
        value: StateChangeValue);
    /**
     * Returns the account id of the `StateChange`.
     */
    get affectedAccountId(): string;
    /**
     * Returns the `StateChange` from the `StateChangeWithCauseView`. Created for backward compatibility.
     */
    static fromStateChangeView(stateChangeView: StateChangeWithCauseView): StateChange;
}
type TransactionProcessingCause = {
    txHash: string;
};
type ActionReceiptProcessingStartedCause = {
    receiptHash: string;
};
type ActionReceiptGasRewardCause = {
    receiptHash: string;
};
type ReceiptProcessingCause = {
    receiptHash: string;
};
type PostponedReceiptCause = {
    receiptHash: string;
};
type StateChangeCause = 'NotWritableToDisk' | 'InitialState' | TransactionProcessingCause | ActionReceiptProcessingStartedCause | ActionReceiptGasRewardCause | ReceiptProcessingCause | PostponedReceiptCause | 'UpdatedDelayedReceipts' | 'ValidatorAccountsUpdate' | 'Migration' | 'Resharding';
declare class AccountUpdateValue {
    readonly accountId: string;
    readonly account: Account;
    constructor(accountId: string, account: Account);
}
declare class AccountDeletionValue {
    readonly accountId: string;
    constructor(accountId: string);
}
declare class AccountKeyUpdateValue {
    readonly accountId: string;
    readonly publicKey: string;
    readonly accessKey: AccessKey;
    constructor(accountId: string, publicKey: string, accessKey: AccessKey);
}
declare class AccessKeyDeletionValue {
    readonly accountId: string;
    readonly publicKey: string;
    constructor(accountId: string, publicKey: string);
}
declare class DataUpdateValue {
    readonly accountId: string;
    readonly key: Uint8Array;
    readonly value: Uint8Array;
    constructor(accountId: string, key: Uint8Array, value: Uint8Array);
}
declare class DataDeletionValue {
    readonly accountId: string;
    readonly key: Uint8Array;
    constructor(accountId: string, key: Uint8Array);
}
declare class ContractCodeUpdateValue {
    readonly accountId: string;
    readonly code: Uint8Array;
    constructor(accountId: string, code: Uint8Array);
}
declare class ContractCodeDeletionValue {
    readonly accountId: string;
    constructor(accountId: string);
}
type StateChangeValue = AccountUpdateValue | AccountDeletionValue | AccountKeyUpdateValue | AccessKeyDeletionValue | DataUpdateValue | DataDeletionValue | ContractCodeUpdateValue | ContractCodeDeletionValue;
declare class Account {
    readonly amount: number;
    readonly locked: number;
    readonly codeHash: string;
    readonly storageUsage: number;
    readonly storagePaidAt: number;
    constructor(amount: number, locked: number, codeHash: string, storageUsage: number, storagePaidAt: number);
}

/**
 * The `Block` type is used to represent a block in the NEAR Lake Framework.
 *
 * **Important Notes on `Block`:**
 * - All the entities located on different shards were merged into one single list without differentiation.
 * - `Block` is not the fairest name for this structure either. NEAR Protocol is a sharded blockchain, so its block is actually an ephemeral structure that represents a collection of real blocks called chunks in NEAR Protocol.
 */
declare class Block {
    /**
     * Low-level structure for backward compatibility.
     * As implemented in previous versions of [`near-lake-framework`](https://www.npmjs.com/package/near-lake-framework).
     */
    readonly streamerMessage: StreamerMessage;
    private executedReceipts;
    /**
     * Receipts included on the chain but not executed yet marked as “postponed”: they are represented by the same structure `Receipt` (see the corresponding section in this doc for more details).
     */
    readonly postponedReceipts: Receipt[];
    /**
     * List of included `Transactions`, converted into `Receipts`.
     *
     * **_NOTE_:** Heads up! You might want to know about `Transactions` to know where the action chain has begun. Unlike Ethereum, where a Transaction contains everything you may want to know about a particular interaction on  the Ethereum blockchain, Near Protocol because of its asynchronous nature converts a `Transaction` into a `Receipt` before executing it. Thus, On NEAR, `Receipts` are more important for figuring out what happened on-chain as a result of a Transaction signed by a user. Read more about [Transactions on Near](https://nomicon.io/RuntimeSpec/Transactions) here.
     *
     */
    readonly transactions: Transaction[];
    private _actions;
    private _events;
    private _stateChanges;
    constructor(
        /**
         * Low-level structure for backward compatibility.
         * As implemented in previous versions of [`near-lake-framework`](https://www.npmjs.com/package/near-lake-framework).
         */
        streamerMessage: StreamerMessage, executedReceipts: Receipt[],
        /**
         * Receipts included on the chain but not executed yet marked as “postponed”: they are represented by the same structure `Receipt` (see the corresponding section in this doc for more details).
         */
        postponedReceipts: Receipt[],
        /**
         * List of included `Transactions`, converted into `Receipts`.
         *
         * **_NOTE_:** Heads up! You might want to know about `Transactions` to know where the action chain has begun. Unlike Ethereum, where a Transaction contains everything you may want to know about a particular interaction on  the Ethereum blockchain, Near Protocol because of its asynchronous nature converts a `Transaction` into a `Receipt` before executing it. Thus, On NEAR, `Receipts` are more important for figuring out what happened on-chain as a result of a Transaction signed by a user. Read more about [Transactions on Near](https://nomicon.io/RuntimeSpec/Transactions) here.
         *
         */
        transactions: Transaction[], _actions: Map<string, Action>, _events: Map<string, Event[]>, _stateChanges: StateChange[]);
    /**
     * Returns the block hash. A shortcut to get the data from the block header.
     */
    get blockHash(): string;
    /**
     * Returns the previous block hash. A shortcut to get the data from the block header.
     */
    get prevBlockHash(): string;
    /**
     * Returns the block height. A shortcut to get the data from the block header.
     */
    get blockHeight(): number;
    /**
     * Returns a `BlockHeader` structure of the block
     * See `BlockHeader` structure sections for details.
     */
    header(): BlockHeader;
    /**
     * Returns a slice of `Receipts` executed in the block.
     * Basically is a getter for the `executedReceipts` field.
     */
    receipts(): Receipt[];
    /**
     * Returns an Array of `Actions` executed in the block.
     */
    actions(): Action[];
    /**
     * Returns `Events` emitted in the block.
     */
    events(): Event[];
    /**
     * Returns raw logs regardless of the fact that they are standard events or not.
     */
    logs(): Log[];
    /**
     * Returns an Array of `StateChange` occurred in the block.
     */
    stateChanges(): StateChange[];
    /**
     * Returns `Action` of the provided `receipt_id` from the block if any. Returns `undefined` if there is no corresponding `Action`.
     *
     * This method uses the internal `Block` `action` field which is empty by default and will be filled with the block’s actions on the first call to optimize memory usage.
     *
     * The result is either `Action | undefined` since there might be a request for an `Action` by `receipt_id` from another block, in which case this method will be unable to find the `Action` in the current block. In the other case, the request might be for an `Action` for a `receipt_id` that belongs to a `DataReceipt` where an action does not exist.
     */
    actionByReceiptId(receipt_id: string): Action | undefined;
    /**
     * Returns an Array of Events emitted by `ExecutionOutcome` for the given `receipt_id`. There might be more than one `Event` for the `Receipt` or there might be none of them. In the latter case, this method returns an empty Array.
     */
    eventsByReceiptId(receipt_id: string): Event[];
    /**
     * Returns an Array of Events emitted by `ExecutionOutcome` for the given `account_id`. There might be more than one `Event` for the `Receipt` or there might be none of them. In the latter case, this method returns an empty Array.
     */
    eventsByAccountId(account_id: string): Event[];
    private buildActionsHashmap;
    private buildEventsHashmap;
    static fromStreamerMessage(streamerMessage: StreamerMessage): Block;
}
/**
 * Replacement for `BlockHeaderView` from [near-primitives](https://github.com/near/nearcore/tree/master/core/primitives). Shrunken and simplified.
 *
 * **Note:** the original `BlockHeaderView` is still accessible via the `.streamerMessage` attribute.
 */
declare class BlockHeader {
    readonly height: number;
    readonly hash: string;
    readonly prevHash: string;
    readonly author: string;
    readonly timestampNanosec: string;
    readonly epochId: string;
    readonly nextEpochId: string;
    readonly gasPrice: string;
    readonly totalSupply: string;
    readonly latestProtocolVersion: number;
    readonly randomValue: string;
    readonly chunksIncluded: number;
    readonly validatorProposals: ValidatorStakeView[];
    constructor(height: number, hash: string, prevHash: string, author: string, timestampNanosec: string, epochId: string, nextEpochId: string, gasPrice: string, totalSupply: string, latestProtocolVersion: number, randomValue: string, chunksIncluded: number, validatorProposals: ValidatorStakeView[]);
    static fromStreamerMessage(streamerMessage: StreamerMessage): BlockHeader;
}

declare const fromBorsh: (schema: borsh.Schema, encoded: Uint8Array) => borsh_lib_types_types.DecodeTypes;

const fromBorsh$1 = /*#__PURE__*/_mergeNamespaces({
    __proto__: null,
    fromBorsh: fromBorsh
}, [borsher]) as { fromBorsh: typeof fromBorsh };

export { Block, type BlockHeaderView, type BlockHeight, type BlockView, Event, LakeContext, Receipt, type Shard, StateChange, type StreamerMessage, Transaction, fromBorsh$1 as borsh };
