# Use the official Node.js 20 LTS (Alpine) image for smaller size and better security
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S relayer -u 1001

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy the application code
COPY . .

# Create necessary directories and set proper ownership
RUN mkdir -p /app/views && \
    chown -R relayer:nodejs /app

# Switch to non-root user
USER relayer

# Expose the port the app runs on
EXPOSE 8001

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8001/health || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8001

# Start the application
CMD ["npm", "start"]