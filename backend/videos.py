"""YouTube video suggestions via yt-dlp (no API key needed)."""

import logging
from datetime import timedelta
from functools import lru_cache

import yt_dlp

log = logging.getLogger(__name__)


def _format(entry):
    vid = entry["id"]
    chapters = [f"{i + 1}. {c.get('title', '')}" for i, c in enumerate(entry.get("chapters") or [])]
    return {
        "title": entry.get("title") or "Untitled",
        "channel": entry.get("channel") or entry.get("uploader") or "Unknown channel",
        "views": entry.get("view_count") or 0,
        "duration": str(timedelta(seconds=int(entry.get("duration") or 0))),
        "url": f"https://www.youtube.com/watch?v={vid}",
        "thumbnail": entry.get("thumbnail") or f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
        "chapters": chapters,
    }


@lru_cache(maxsize=128)
def _search(query, n):
    opts = {"quiet": True, "no_warnings": True, "skip_download": True,
            "js_runtimes": {"node": {}}}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"ytsearch{n}:{query}", download=False)
    return tuple(_format(e) for e in (info.get("entries") or []) if e)


def search_videos(query, n=3):
    """Return up to n video dicts for a query. Raises on network/yt-dlp failure."""
    return list(_search(query.strip(), n))
