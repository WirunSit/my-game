# SciBoom! — one container: the game, the teacher pages, the API and PvP.
# Build: docker build -t sciboom .     Run: docker run -p 8080:8080 -e DATABASE_URL=... sciboom
# Step-by-step hosting guide (Thai): docs/DEPLOY.md
FROM node:24-slim
WORKDIR /app

# Install packages first (cached until a package.json changes). The tools
# workspace (sprite slicer, browser tests) isn't needed on the server.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
COPY tools/package.json tools/
RUN npm ci -w shared -w server -w client --include-workspace-root

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
