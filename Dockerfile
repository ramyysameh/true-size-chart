FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY . .
RUN npm ci && npm run build && npm prune --omit=dev

FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3000
CMD ["npm", "run", "docker-start"]
