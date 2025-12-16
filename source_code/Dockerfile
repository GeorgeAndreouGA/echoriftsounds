# Use Node.js 18 Alpine for smaller image size and security
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Install PM2 globally for cluster mode
RUN npm install -g pm2

# Production image, copy all the files and run the app
FROM base AS runner
WORKDIR /app

# Install PM2 globally
RUN npm install -g pm2

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application files
COPY . .

# Create necessary directories and set permissions
RUN mkdir -p /app/music /app/logs && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs


# Start the application with PM2 cluster mode
CMD ["pm2-runtime", "ecosystem.config.js"]
