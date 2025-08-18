# Use slim Python image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Prevent .pyc files
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install MongoDB driver dependencies
RUN pip install --no-cache-dir --upgrade pip

# Copy requirements first and install them
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ✅ Copy .env to correct place
COPY .env ./app/.env

# Copy application code
COPY . .

# Create app user (non-root)
RUN groupadd -r appuser && useradd -r -g appuser appuser
RUN chown -R appuser:appuser /app
USER appuser

# Expose FastAPI port
EXPOSE 8003
# Run the app with Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8003"]
