# Use official Node.js image
FROM node:18

# Set working directory
WORKDIR /user_service

# Copy package.json and package-lock.json
COPY package*.json ./

# Clean npm cache to avoid EEXIST / ENOENT issues
RUN npm cache clean --force

# Install Nest CLI globally
RUN npm install -g @nestjs/cli

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy the rest of the files
COPY . .

# Build the app
RUN npm run build

# Expose port
EXPOSE 8002

# Start the app
CMD ["npm", "run", "start:prod"]
