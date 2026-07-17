# Etape 1 : build de l'application avec Node et pnpm.
FROM node:24-alpine AS build

WORKDIR /app

RUN npm install -g pnpm@10.30.0

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# Etape 2 : service des fichiers statiques via nginx.
FROM nginx:1.29-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
