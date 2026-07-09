FROM node:20-slim AS frontend-builder

WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build
# Output: /web/dist

FROM python:3.11-slim AS app-api

RUN apt-get update && apt-get install -y curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Copy built React app from frontend stage
COPY --from=frontend-builder /web/dist ./web/dist

# Create shared dirs (will be overridden by volume mount)
RUN mkdir -p /shared/uploads /shared/outputs

EXPOSE 5001

CMD ["python", "app.py"]
