FROM node:18.17

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --only=production

RUN npm run build

COPY ./dist ./dist

CMD [ "npm", "run", "start:docker" ]
