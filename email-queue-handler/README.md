## General

- [**Queue-handler Concept description**](./docs/QUEUE_HANDLER_CONCEPT.md)
- [**Writing a `*-queue-handler`**](./docs/WRITING_QUEUE_HANDLER.md)

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
$ cargo lambda deploy --iam-role arn:aws:iam::754641474505:role/production-lambda-alertexer production-email-queue-handler
```

It is deployed as [`email-queue-handler` on AWS](https://eu-central-1.console.aws.amazon.com/lambda/home?region=eu-central-1#/functions/email-queue-handler)

## Environmental variables required

This lambda will fail without required env vars.

```
DATABASE_URL=postgres://user:pass@host/db
```

`DATABASE_URL` is required to write to the `triggered_alerts` table (history of Alerts)

`MAILGUN_API_KEY` is required to send emails via Mailgun API

## Local testing

This will start local "emulator" of the AWS lambda with our lambda deployed

```
$ cargo lambda watch
```

This will invoke the function with predefined test payload

```
$ cargo lambda invoke --data-file test_payload.json
```
