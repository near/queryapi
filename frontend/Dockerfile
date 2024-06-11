FROM node:18-alpine as dependencies
WORKDIR ./
COPY package.json package-lock.json ./
RUN npm install 

FROM node:18-alpine as builder
# Set build arguments and environment variables
ARG NEXT_PUBLIC_REGISTRY_CONTRACT_ID
ARG NEXT_PUBLIC_HASURA_ENDPOINT
ENV NEXT_PUBLIC_HASURA_ENDPOINT=$NEXT_PUBLIC_HASURA_ENDPOINT
ENV NEXT_PUBLIC_REGISTRY_CONTRACT_ID=$NEXT_PUBLIC_REGISTRY_CONTRACT_ID

WORKDIR ./
COPY . .
COPY --from=dependencies ./node_modules ./node_modules
RUN npm run build

FROM node:18-alpine as runner
WORKDIR ./
ENV NODE_ENV production

COPY --from=builder ./.next ./.next
COPY --from=builder ./node_modules ./node_modules
COPY --from=builder ./package.json ./package.json

EXPOSE 3000
CMD ["npm", "run", "start"]