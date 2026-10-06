# EEO community instance: generates the brand-card site from the dataset,
# then serves it statically. No API keys required.
#
#   docker build -t eeo-community .
#   docker run -p 8080:80 eeo-community
#   open http://localhost:8080

FROM node:20-alpine AS generate
WORKDIR /app
COPY datasets/ ./datasets/
COPY tools/ ./tools/
COPY LICENSE ./
RUN node tools/gen-site.cjs datasets/brands-1k.json --out site/

FROM nginx:1.27-alpine
COPY --from=generate /app/site/ /usr/share/nginx/html/
EXPOSE 80
