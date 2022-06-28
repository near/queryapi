## General

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

## Local testing

This will start local "emulator" of the AWS lambda with our lambda deployed

```
$ cargo lambda watch
```

This will invoke the function with predefined test payload

```
$ cargo lambda invoke --data-file test_payload.json
```
