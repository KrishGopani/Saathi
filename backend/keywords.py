"""Keyword extraction for calendar tasks: Gemini when configured, heuristic otherwise."""

import logging
import re

from llm import generate_json, llm_configured

log = logging.getLogger(__name__)

STOPWORDS = set("""a an and are as at be but by for from have has i if in into is it its me my of on or
our so that the their then there these this to up us was we what when where which will with you your
have to need needs want meeting meet submit finish complete work working today tomorrow tonight morning
evening afternoon monday tuesday wednesday thursday friday saturday sunday week weekend day days
implement do doing make learn mini project task tasks study""".split())


def heuristic_keywords(text, limit=4):
    words = re.findall(r"[A-Za-z][A-Za-z+#.\-]{1,}", text)
    seen, out = set(), []
    for w in words:
        lw = w.lower().strip(".-")
        if lw in STOPWORDS or lw in seen or len(lw) < 3:
            continue
        seen.add(lw)
        out.append(lw)
    return out[:limit]


def extract_keywords(title, desc="", limit=4):
    text = f"{title}. {desc}".strip(". ")
    if llm_configured():
        try:
            data = generate_json(
                f"Extract up to {limit} short learning-topic keywords from this calendar "
                'task. Return JSON like {"keywords": ["..."]}. Prefer subjects someone '
                "could study (e.g. 'flask', 'machine learning'), not dates or filler.",
                text,
            )
            words = [w.strip() for w in data.get("keywords", []) if isinstance(w, str) and w.strip()]
            if words:
                return words[:limit]
        except Exception:
            log.exception("LLM keyword extraction failed; using heuristic")
    return heuristic_keywords(text, limit)
