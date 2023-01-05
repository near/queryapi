## General

A Queue handler for Aggregation destinations. 
Development Status: Prints arguments for debugging, needs real functionality added to invoke aggregation functions pulled from contract.

- [**Queue-handler Concept description**](../docs/QUEUE_HANDLER_CONCEPT.md)

Using [`cargo-lambda`](https://github.com/cargo-lambda/cargo-lambda)
```
$ cargo install cargo-lambda
```

## Deploy

the roles:
- Staging `arn:aws:iam::754641474505:role/lambda-alertexer`
- Production `arn:aws:iam::754641474505:role/production-lambda-alertexer`

```
$ cargo lambda build --release
```

**Staging:**
```
$ cargo lambda deploy --iam-role arn:aws:iam::754641474505:role/lambda-alertexer
```

**Production:**
```
$ cargo lambda deploy --iam-role arn:aws:iam::754641474505:role/production-lambda-alertexer production-aggregation-queue-handler
```

It is deployed as [`aggregation-queue-handler` on AWS](https://eu-central-1.console.aws.amazon.com/lambda/home?region=eu-central-1#/functions/aggregation-queue-handler)

## Environmental variables required

This lambda will fail without required env vars.

```
DATABASE_URL=postgres://user:pass@host/db
```

`DATABASE_URL` is required to write to the `triggered_alerts` table (history of Alerts)

## Local testing

This will start local "emulator" of the AWS lambda with our lambda deployed

```
$ cargo lambda watch
```

This will invoke the function with predefined test payload

```
$ cargo lambda invoke --data-file test_payload.json
```
