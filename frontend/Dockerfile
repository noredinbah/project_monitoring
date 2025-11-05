FROM nginx:alpine

# Copy your HTML frontend to nginx html folder
COPY . /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
