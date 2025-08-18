FROM node:18-alpine

WORKDIR /app

# Set timezone to Asia/Kolkata
ENV TZ=Asia/Kolkata
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/$TZ /etc/localtime && \
    echo $TZ > /etc/timezone

# Install latest compatible npm for Node 18
RUN npm install -g npm@10.8.2

COPY package*.json ./
RUN npm install

COPY . .

RUN chown -R node:node /app

USER node

EXPOSE 8000

CMD ["npm", "start"]
