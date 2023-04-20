FROM node:16-alpine as dependencies
WORKDIR /frontend
COPY package.json yarn.lock ./
RUN npm install 

FROM node:16-alpine as builder
WORKDIR /frontend
COPY . .
COPY --from=dependencies /frontend/node_modules ./node_modules
RUN npm run build

FROM node:16-alpine as runner
WORKDIR /frontend
ENV NODE_ENV production

COPY --from=builder /frontend/public ./public
COPY --from=builder /frontend/.next ./.next
COPY --from=builder /frontend/node_modules ./node_modules
COPY --from=builder /frontend/package.json ./package.json

EXPOSE 3000
CMD ["npm", "run","start"]
