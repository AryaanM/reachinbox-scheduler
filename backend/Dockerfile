FROM node:22-alpine
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy Prisma schema and generate client
COPY prisma ./prisma/
RUN npm run db:generate

# Copy the rest of the application code
COPY . .

EXPOSE 4000

# Run TypeScript directly using tsx
CMD ["npx", "tsx", "src/index.ts"]