# syntax=docker/dockerfile:1

# Comments are provided throughout this file to help you get started.
# If you need more help, visit the Dockerfile reference guide at
# https://docs.docker.com/go/dockerfile-reference/

# Want to help us make this template better? Share your feedback here: https://forms.gle/ybq9Krt8jtBL3iCk7

ARG NODE_VERSION=20.12.0

FROM node:${NODE_VERSION}-alpine

# Install netcat for script
RUN apk add --no-cache wget

# Use production node environment by default.
ENV NODE_ENV production


WORKDIR /usr/src/app

# Copy wait-for-it script
COPY ../scripts/wait-for-es.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/wait-for-es.sh

# Copy only the files needed for dependency installation
COPY ../package.json ../package-lock.json ./

# Download dependencies as a separate step to take advantage of Docker's caching.
# Leverage a cache mount to /root/.npm to speed up subsequent builds.
# Leverage a bind mounts to package.json and package-lock.json to avoid having to copy them into
# into this layer.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

# Run the application as a non-root user.
USER node

# Copy the rest of the source files into the image.
COPY .. .

# Expose the port that the application listens on.
EXPOSE 3000

# Use wait-for-it script to ensure ElasticSearch is ready
CMD /usr/local/bin/wait-for-es.sh elasticsearch 9200 npm start
