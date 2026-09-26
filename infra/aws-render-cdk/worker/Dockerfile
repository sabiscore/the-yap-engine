FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir boto3

WORKDIR /app
COPY worker.py /app/worker.py

ENV PYTHONUNBUFFERED=1
CMD ["python", "/app/worker.py"]
