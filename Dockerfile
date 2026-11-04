# OCI Capacity Coach: the Flask API and the Astro site in one image (ghcr.io/arielletolome/everytown-oci).
# It still needs AWS: Bedrock for Claude and the everytown-oci-db Aurora stack (RDS Data API). See README "Container".

FROM node:20-slim AS site
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn==23.0.0
COPY app.py pipeline.py report.py db.py observability.py serve.py schema.sql ./
COPY features features
COPY engine engine
COPY utils utils
COPY data data
COPY benchmark benchmark
COPY resources resources
COPY evals/__init__.py evals/checks.py evals/
COPY frontend/public/fonts frontend/public/fonts
COPY --from=site /src/frontend/dist frontend/dist
USER nobody
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
# One worker: the AI pipeline runs in a background thread of the process that accepted the report.
CMD ["gunicorn", "--workers", "1", "--threads", "8", "--timeout", "120", "--bind", "0.0.0.0:8000", "serve:app"]
