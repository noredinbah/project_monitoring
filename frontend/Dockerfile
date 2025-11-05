FROM nginx:alpine

# Copy your app files
COPY . /usr/share/nginx/html

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose port
EXPOSE 80

# Start Nginx after substituting env variables
ENTRYPOINT ["/docker-entrypoint.sh"]
