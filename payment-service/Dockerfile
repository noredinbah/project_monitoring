# Use official Node.js image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files (if they exist)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the service source code
COPY . .

# Expose service port (change this per service)
EXPOSE 3004

# Default command
CMD ["node", "index.js"]
