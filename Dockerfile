# Cloud Run image: builds the static app and serves it with nginx on :8080.
#   gcloud run deploy overturn --source . --region us-central1 --allow-unauthenticated
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Optional demo key baked into the bundle (free-tier key, restrict it by HTTP referrer).
ARG GEMINI_API_KEY=""
ENV GEMINI_API_KEY=$GEMINI_API_KEY
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
