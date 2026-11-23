"""Minimal Gemini client (REST, no SDK) that returns a JSON object."""

import json
import os
import time
import urllib.error
import urllib.request

API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
# Flash Lite has far higher free-tier limits (15 req/min, 500/day) than the full Flash models (5/min, 20/day).
DEFAULT_MODEL = "gemini-flash-lite-latest"


def llm_configured():
    return bool(os.getenv("GEMINI_API_KEY"))


def _call(model, body, timeout):
    request = urllib.request.Request(
        API_URL.format(model=model), data=json.dumps(body).encode(), method="POST",
        headers={"Content-Type": "application/json", "x-goog-api-key": os.environ["GEMINI_API_KEY"]},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        data = json.load(response)
    return json.loads(data["candidates"][0]["content"]["parts"][0]["text"])


def generate_json(system, user, timeout=30):
    """Ask Gemini for a JSON object. Raises on network, HTTP or parse errors.

    429/503 mean "rate limited / busy": retry once after a short pause.
    """
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"parts": [{"text": user}]}],
        "generationConfig": {"responseMimeType": "application/json"},
    }
    model = os.getenv("GEMINI_MODEL", DEFAULT_MODEL)
    try:
        return _call(model, body, timeout)
    except urllib.error.HTTPError as e:
        if e.code not in (429, 503):
            raise
        time.sleep(3)
        return _call(model, body, timeout)
