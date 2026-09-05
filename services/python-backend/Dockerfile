FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN useradd --create-home --uid 10001 appuser

COPY pyproject.toml README.md ./
COPY app ./app

RUN pip install --upgrade pip && pip install .

USER appuser

EXPOSE 8090

HEALTHCHECK --interval=10s --timeout=3s --retries=10 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8090/health/live')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8090"]
