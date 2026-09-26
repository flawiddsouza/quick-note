FROM node:26-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 6943

# apply pending migrations, then serve
CMD ["sh", "-c", "npx ley up && node app.js"]
