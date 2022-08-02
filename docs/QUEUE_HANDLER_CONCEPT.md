# Queue Handler Concept

According to our design an [`alertexer` (indexer)](../alertexer) instance sends `AlertQueueMessage` to the main queue ([`queue-handler`](../queue-handler))


### `AlertQueueMessage`

Here's the structure definition. The struct itself and all underlying structs derive [Borsh seialization](https://github.com/near/borsh-rs), [serde serialization](https://serde.rs/), `Clone`, and `Debug`

The structs defined in the [`shared`](../shared) crate. `use shared::types::primitives;`

```rust
pub struct AlertQueueMessage {
    pub chain_id: ChainId,
    pub alert_rule_id: i32,
    pub alert_name: String,
    pub payload: AlertQueueMessagePayload,
}

pub enum ChainId {
    Mainnet,
    Testnet,
}

pub enum AlertQueueMessagePayload {
    Actions {
        block_hash: BlockHashString,
        receipt_id: ReceiptIdString,
        transaction_hash: TransactionHashString,
    },
    Events {
        block_hash: BlockHashString,
        receipt_id: ReceiptIdString,
        transaction_hash: TransactionHashString,
    },
    StateChanges {
        block_hash: BlockHashString,
        receipt_id: Option<ReceiptIdString>,
        transaction_hash: TransactionHashString,
    },
}
```

Every instance of `AlertQueueMessage` sent to an SQS is a [base64 encoded](https://docs.rs/base64/0.13.0/base64/fn.encode.html) borsh serialized data. (First borsh-serialized, then base64 encoded, then the string is sent to SQS).

Queue handler has to
- retrieve enabled destinations for the `AlertRule`
- write information about the `AlertRule` has been triggered to the database
- build an `AlertDeliveryTask` struct and sends it further to a relevant queue (based on the delivery channel)

### `AlertDeliveryTask`

Here's a definition of the struct. The struct itself and all underlying structs derive [Borsh seialization](https://github.com/near/borsh-rs), [serde serialization](https://serde.rs/), `Clone`, and `Debug`

The structs defined in the [`shared`](../shared) crate. `use shared::types::primitives;`

```rust
pub struct AlertDeliveryTask {
    pub triggered_alert_id: i32,
    pub destination_config: DestinationConfig,
    pub alert_message: AlertQueueMessage,
}

pub enum DestinationConfig {
    Webhook {
        destination_id: i32,
        url: String,
        secret: String,
    },
    Telegram {
        destination_id: i32,
        chat_id: f64,
    },
}
```

The same, it is sent to a next SQS queue being borsh serialized, base64 encoded string.

## Concept

We use one main queue and separate ones for each delivery channel. Every SQS queue is backed by a lambda function.

- [`alertexer-queue`](https://eu-central-1.console.aws.amazon.com/sqs/v2/home?region=eu-central-1#/queues/https%3A%2F%2Fsqs.eu-central-1.amazonaws.com%2F754641474505%2Falertexer-queue) Main queue. Backed by [`queue-handler`](../queue-handler)
- [`alertexer-webhook`](https://eu-central-1.console.aws.amazon.com/sqs/v2/home?region=eu-central-1#/queues/https%3A%2F%2Fsqs.eu-central-1.amazonaws.com%2F754641474505%2Falertexer-webhooks) Webhook delivery channel queue. Backed by [`webhook-queue-handler`](../webhook-queue-handler)
- [`alertexer-telegram`](https://eu-central-1.console.aws.amazon.com/sqs/v2/home?region=eu-central-1#/queues/https%3A%2F%2Fsqs.eu-central-1.amazonaws.com%2F754641474505%2Falertexer-telegram) Telegram delivery channel queue. Backed by [`telegram-queue-handler`](../telegram-queue-handler)

Every `*-queue-handler` is supposed to write the response from the delivery channel to the Database. See [Writing the *-queue-handler](WRITING_QUEUE_HANDLER.md)
