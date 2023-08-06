FROM node:18.17 AS builder
WORKDIR /usr/src/app
COPY . .
RUN npm install
RUN npm run build

FROM node:18.17
WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/package*.json ./
RUN npm install --omit=dev
COPY --from=builder /usr/src/app/dist ./dist
CMD [ "npm", "run", "start:docker" ]
