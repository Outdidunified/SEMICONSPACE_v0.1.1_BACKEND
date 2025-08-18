# This image is based on Debian and includes Node.js 18.x
FROM node:18

# Set working directory inside the container
WORKDIR /search_service

# Copy package.json and package-lock.json (or yarn.lock) and install dependencies
COPY package*.json ./   

# Install application dependencies
RUN npm install

# Copy the rest of the application files (all files in current context to the container)
COPY . .


# Build the NestJS app (if you are using TypeScript and NestJS)
RUN npm run build

# Expose the port that the app will run on
EXPOSE 8004

# Start the app in production mode
CMD ["npm", "run", "start:prod"]
