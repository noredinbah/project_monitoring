#!/bin/sh

# Replace env vars in JS template
envsubst < /usr/share/nginx/html/env.template.js > /usr/share/nginx/html/env.js

# Start Nginx in the foreground
nginx -g "daemon off;"
