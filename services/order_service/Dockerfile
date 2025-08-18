# Use the official Node.js image

# This image is based on Debian and includes Node.js 18.x
FROM node:18

# Set working directory inside the container
WORKDIR /search_service

# Copy package.json and package-lock.json (or yarn.lock)
COPY package*.json ./

# Install NestJS CLI globally (to fix 'nest: Permission denied' during build)
RUN npm install -g @nestjs/cli

# Install application dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Build the NestJS app
RUN npm run build

# Expose the port that the app will run on
EXPOSE 8006

# Start the app in production mode
CMD ["npm", "run", "start:prod"]