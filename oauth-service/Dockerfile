FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY app.js ./app.js
USER node
EXPOSE 8080
CMD ["node", "app.js"]
