## General

- [**Queue-handler Concept description**](./docs/QUEUE_HANDLER_CONCEPT.md)
- [**Writing a `*-queue-handler`**](./docs/WRITING_QUEUE_HANDLER.md)

Using [`cargo-lambda`](https://github.com/cargo-lambda/cargo-lambda)
```
$ cargo install cargo-lambda
```

## Deploy

the role: `arn:aws:iam::754641474505:role/lambda-alertexer`

```
$ cargo lambda build --release
$ cargo lambda deploy --iam-role arn:aws:iam::754641474505:role/lambda-alertexer
```

It is deployed as [`queue-handler-alertexer` on AWS](https://eu-central-1.console.aws.amazon.com/lambda/home?region=eu-central-1#/functions/queue-handler-alertexer?tab=code)

## Environmental variables required

This lambda will fail without required env vars.

```
DATABASE_URL=postgres://user:pass@host/db
```

`DATABASE_URL` is required to fetch destination settings for specific `AlertRule` and to write to the `triggered_alerts` table (history of Alerts)

```
TELEGRAM_QUEUE_URL=https://sqs.eu-central-1.amazonaws.com/754641474505/alertexer-telegram
WEBHOOK_QUEUE_URL=https://sqs.eu-central-1.amazonaws.com/754641474505/alertexer-webhooks
```
We anticipate the growth of this type of variables. They are used by the lambda to send `AlertRules` further to the relevant queue based on the rule's destination(s)

## Local testing

This will start local "emulator" of the AWS lambda with our lambda deployed

```
$ cargo lambda watch
```

This will invoke the function with predefined test payload

```
$ cargo lambda invoke --data-file test_payload.json
```
