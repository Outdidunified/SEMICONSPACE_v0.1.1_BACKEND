# Base image
FROM node:18

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies with legacy peer deps to avoid version conflicts
RUN npm install --legacy-peer-deps

# Copy all source files
COPY . .

# ✅ Patch: Inject missing crypto import into the typeorm.utils.js file
# ✅ Patch crypto for both NestJS modules
RUN sed -i "1i const crypto = require('crypto');" node_modules/@nestjs/typeorm/dist/common/typeorm.utils.js \
 && sed -i "1i const crypto = require('crypto');" node_modules/@nestjs/schedule/dist/scheduler.orchestrator.js

# Set Node.js memory limit
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Build the project
RUN npm run build

# Expose app port (set to 4051 instead of 3000)
EXPOSE 8005

# Start the app
CMD [ "npm", "run", "start:prod" ]