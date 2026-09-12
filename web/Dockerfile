# RouteWise web — build with Vite, serve static with nginx (SPA fallback)
# Base images are pulled from the AWS ECR Public mirror of Docker Official
# Images to avoid intermittent Docker Hub (registry-1.docker.io) pull timeouts
# on the CI/build network.
FROM public.ecr.aws/docker/library/node:20-alpine AS build
WORKDIR /app/web

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG VITE_API_URL=http://localhost:8000/api/v1
ARG VITE_WS_URL=ws://localhost:8000/ws
ARG VITE_DEMO_MODE=true
ENV VITE_API_URL=${VITE_API_URL} \
    VITE_WS_URL=${VITE_WS_URL} \
    VITE_DEMO_MODE=${VITE_DEMO_MODE}
RUN npm run build

FROM public.ecr.aws/docker/library/nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf.template
COPY start.sh /start.sh
COPY --from=build /app/web/dist /usr/share/nginx/html
RUN chmod +x /start.sh
EXPOSE 8080
CMD ["/start.sh"]
