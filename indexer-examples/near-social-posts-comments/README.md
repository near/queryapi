# NEAR Social Posts & Comments Indexer

This is an example of the indexer that follows the NEAR Social contract and stores the posts and comments into a database (PostgresSQL).

- [x] Store Posts
- [x] Store Comments
- [ ] Handle Likes to Posts
- [ ] Handle Likes to Comments

## Changelog

### Feb 2, 2022

Initial version that stores Posts and Comments to the PostgreSQL database (using Prisma ORM).

At the moment it's impossible to just lunch this indexer because it depends on the future `1.1` version of Lake Framework that is under development. The only way to make it work was to use `file:` in `package.json`.

But overall you can have a look at the initial logic and judge about the interfaces. The idea about introducing some helpers dedicated to NEAR Social seems to be a must.
