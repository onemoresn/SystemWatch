FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY api/package.json ./api/
RUN npm install -w api
COPY api ./api
COPY sites ./sites
COPY beacon ./beacon
RUN npm run build -w api

FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY api/package.json ./api/
RUN npm install -w api --omit=dev
COPY --from=build /app/api/dist ./api/dist
COPY sites ./sites
COPY beacon ./beacon
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["node", "api/dist/index.js"]
