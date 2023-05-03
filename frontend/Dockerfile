FROM node:16-alpine as dependencies
WORKDIR ./
COPY package.json yarn.lock ./
RUN npm install 

# Set build arguments and environment variables
ARG NEXT_PUBLIC_REGISTRY_CONTRACT_ID
ARG NEXT_PUBLIC_HASURA_ENDPOINT
ENV NEXT_PUBLIC_HASURA_ENDPOINT=$NEXT_PUBLIC_HASURA_ENDPOINT
ENV NEXT_PUBLIC_REGISTRY_CONTRACT_ID=$NEXT_PUBLIC_REGISTRY_CONTRACT_ID

FROM node:16-alpine as builder
WORKDIR ./
COPY . .
COPY --from=dependencies ./node_modules ./node_modules
RUN npm run build

FROM node:16-alpine as runner
WORKDIR ./
ENV NODE_ENV production

COPY --from=builder ./.next ./.next
COPY --from=builder ./node_modules ./node_modules
COPY --from=builder ./package.json ./package.json

EXPOSE 3000
CMD ["npm", "run","start"]
