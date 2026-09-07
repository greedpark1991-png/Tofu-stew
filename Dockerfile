FROM node:20-alpine
WORKDIR /app
COPY . .
EXPOSE 10000
CMD ["node", "server.js"]
