FROM python:3.11-slim

# Install ffmpeg (required by whisperx for audio processing)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install PyTorch CPU first (smaller image, no CUDA)
# For GPU support override with CUDA base image
RUN pip install --no-cache-dir torch torchaudio \
    --index-url https://download.pytorch.org/whl/cpu

# Install remaining deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create model cache dir
RUN mkdir -p /app/models

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "1"]
