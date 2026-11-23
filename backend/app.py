"""Saathi: calendar task scheduler with LLM commands and course/video recommendations.

Pipeline (see README): task saved -> queued -> worker extracts keywords ->
recommends Coursera courses (TF-IDF, nudged by user interests) and YouTube videos (yt-dlp).
"""

import json
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy

from courses import get_index
from keywords import extract_keywords
from llm import generate_json, llm_configured
from videos import search_videos

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

INSTANCE_DIR = Path(__file__).resolve().parent / "instance"
INSTANCE_DIR.mkdir(exist_ok=True)
FRONTEND_BUILD = ROOT / "frontend" / "build"

app = Flask(__name__, instance_path=str(INSTANCE_DIR), static_folder=None)
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv(
    "DATABASE_URL", f"sqlite:///{INSTANCE_DIR / 'saathi.db'}")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
CORS(app)
db = SQLAlchemy(app)

# The "task queue" with "task runners" from the paper's architecture.
executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="recommender")


# ---------------------------------------------------------------- models

class Event(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    start = db.Column(db.String(30), nullable=False)
    end = db.Column(db.String(30), nullable=False)
    desc = db.Column(db.String(255), default="")

    def as_dict(self):
        return {"id": self.id, "title": self.title, "start": self.start,
                "end": self.end, "desc": self.desc or ""}


class Recommendation(db.Model):
    """Keywords, courses and videos suggested for one event."""
    event_id = db.Column(db.Integer, db.ForeignKey("event.id"), primary_key=True)
    status = db.Column(db.String(10), default="pending")  # pending|running|done|error
    keywords = db.Column(db.Text, default="[]")
    courses = db.Column(db.Text, default="[]")
    videos = db.Column(db.Text, default="[]")
    error = db.Column(db.String(255), default="")

    def as_dict(self):
        return {"event_id": self.event_id, "status": self.status,
                "keywords": json.loads(self.keywords), "courses": json.loads(self.courses),
                "videos": json.loads(self.videos), "error": self.error or ""}


class Profile(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    interests = db.Column(db.Text, default="[]")

    def as_dict(self):
        return {"interests": json.loads(self.interests)}


def get_profile():
    profile = db.session.get(Profile, 1)
    if profile is None:
        profile = Profile(id=1)
        db.session.add(profile)
        db.session.commit()
    return profile


# ---------------------------------------------------------------- recommendation jobs

def run_recommendation_job(event_id):
    with app.app_context():
        event = db.session.get(Event, event_id)
        rec = db.session.get(Recommendation, event_id)
        if event is None or rec is None:
            return
        try:
            rec.status = "running"
            db.session.commit()
            keywords = extract_keywords(event.title, event.desc or "")
            query = " ".join(keywords)
            interests = json.loads(get_profile().interests)
            rec.keywords = json.dumps(keywords)
            rec.courses = json.dumps(get_index().search(query, 6, interests))
            rec.videos = "[]"
            db.session.commit()  # courses are visible while videos still load
            videos, error = [], ""
            try:
                videos = search_videos(query, 3) if query else []
            except Exception:
                app.logger.exception("Video search failed for %r", query)
                error = "Video suggestions are unavailable right now."
            rec.videos = json.dumps(videos)
            rec.error = error
            rec.status = "done"
        except Exception:
            app.logger.exception("Recommendation job failed for event %s", event_id)
            db.session.rollback()
            rec = db.session.get(Recommendation, event_id)
            if rec is not None:
                rec.status, rec.error = "error", "Could not generate recommendations."
        db.session.commit()


def queue_recommendations(event_id):
    rec = db.session.get(Recommendation, event_id) or Recommendation(event_id=event_id)
    rec.status, rec.error = "pending", ""
    db.session.add(rec)
    db.session.commit()
    executor.submit(run_recommendation_job, event_id)


# ---------------------------------------------------------------- events

def event_fields(data):
    """Validate an event payload and return normalized values or an error."""
    if not isinstance(data, dict):
        return None, "Expected a JSON object."
    title = data.get("title")
    start = data.get("start")
    end = data.get("end")
    desc = data.get("desc", "")
    if not isinstance(title, str) or not title.strip():
        return None, "title is required."
    if not isinstance(desc, str):
        return None, "desc must be a string."
    try:
        start_time = datetime.fromisoformat(start.replace("Z", "+00:00"))
        end_time = datetime.fromisoformat(end.replace("Z", "+00:00"))
    except (AttributeError, TypeError, ValueError):
        return None, "start and end must be ISO 8601 date-times."
    if (start_time.tzinfo is None) != (end_time.tzinfo is None):
        return None, "start and end must use the same timezone format."
    if end_time <= start_time:
        return None, "end must be after start."
    if len(title.strip()) > 100 or len(desc) > 255:
        return None, "title or desc is too long."
    return {"title": title.strip(), "start": start, "end": end, "desc": desc}, None


def create_event(fields):
    event = Event(**fields)
    db.session.add(event)
    db.session.commit()
    queue_recommendations(event.id)
    return event


@app.route("/api/events", methods=["GET", "POST"])
def events():
    if request.method == "GET":
        return jsonify([e.as_dict() for e in Event.query.order_by(Event.id).all()])
    fields, error = event_fields(request.get_json(silent=True))
    if error:
        return jsonify(error=error), 400
    return jsonify(create_event(fields).as_dict()), 201


@app.route("/api/events/<int:event_id>", methods=["PUT", "DELETE"])
def event_detail(event_id):
    event = db.session.get(Event, event_id)
    if event is None:
        return jsonify(error="Event not found."), 404
    if request.method == "DELETE":
        Recommendation.query.filter_by(event_id=event_id).delete()
        db.session.delete(event)
        db.session.commit()
        return jsonify(deleted=event_id)
    fields, error = event_fields(request.get_json(silent=True))
    if error:
        return jsonify(error=error), 400
    topic_changed = (fields["title"], fields["desc"]) != (event.title, event.desc or "")
    for key, value in fields.items():
        setattr(event, key, value)
    db.session.commit()
    if topic_changed:
        queue_recommendations(event.id)
    return jsonify(event.as_dict())


@app.post("/api/process_command")
def process_command():
    """Turn a natural-language sentence (typed or dictated) into one calendar event."""
    data = request.get_json(silent=True) or {}
    command = data.get("command")
    if not isinstance(command, str) or not command.strip():
        return jsonify(error="command is required."), 400
    if not llm_configured():
        return jsonify(error="Set GEMINI_API_KEY to use natural-language commands."), 503
    try:
        fields, error = event_fields(generate_json(
            "Extract one calendar event from the user's command. Return a JSON object "
            "with title, start, end, and desc. Use ISO 8601 date-times with timezone "
            "offsets. Current local time: " + datetime.now().astimezone().isoformat(),
            command,
        ))
    except Exception:
        app.logger.exception("Could not process calendar command")
        return jsonify(error="Could not process the command."), 502
    if error:
        return jsonify(error=error), 422
    return jsonify(create_event(fields).as_dict()), 201


# ---------------------------------------------------------------- recommendations

@app.route("/api/events/<int:event_id>/recommendations", methods=["GET", "POST"])
def event_recommendations(event_id):
    if db.session.get(Event, event_id) is None:
        return jsonify(error="Event not found."), 404
    if request.method == "POST":  # regenerate
        queue_recommendations(event_id)
    rec = db.session.get(Recommendation, event_id)
    if rec is None:
        queue_recommendations(event_id)
        rec = db.session.get(Recommendation, event_id)
    return jsonify(rec.as_dict())


@app.get("/api/courses")
def courses():
    """Search courses by topic (?q=) or find courses similar to one (?similar_to=)."""
    index = get_index()
    similar_to = request.args.get("similar_to", "").strip()
    if similar_to:
        return jsonify(index.similar(similar_to))
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify(error="q or similar_to is required."), 400
    return jsonify(index.search(query, 6, json.loads(get_profile().interests)))


@app.get("/api/videos")
def videos():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify(error="q is required."), 400
    try:
        return jsonify(search_videos(query, 3))
    except Exception:
        app.logger.exception("Video search failed for %r", query)
        return jsonify(error="Video search is unavailable right now."), 502


@app.route("/api/profile", methods=["GET", "PUT"])
def profile():
    profile = get_profile()
    if request.method == "PUT":
        data = request.get_json(silent=True) or {}
        interests = data.get("interests")
        if not isinstance(interests, list) or not all(isinstance(i, str) for i in interests):
            return jsonify(error="interests must be a list of strings."), 400
        cleaned = [i.strip() for i in interests if i.strip()][:20]
        profile.interests = json.dumps(cleaned)
        db.session.commit()
    return jsonify(profile.as_dict())


# ---------------------------------------------------------------- frontend (production build)

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def frontend(path):
    if path.startswith("api/") or not FRONTEND_BUILD.exists():
        return jsonify(error="Not found. For development run the React app (see README)."), 404
    if path and (FRONTEND_BUILD / path).is_file():
        return send_from_directory(FRONTEND_BUILD, path)
    return send_from_directory(FRONTEND_BUILD, "index.html")


with app.app_context():
    db.create_all()
    # Jobs interrupted by a restart would otherwise stay "running" forever.
    Recommendation.query.filter(Recommendation.status.in_(["pending", "running"])).update(
        {"status": "error", "error": "Interrupted; press refresh to regenerate."},
        synchronize_session=False)
    db.session.commit()


if __name__ == "__main__":
    app.run(port=int(os.getenv("API_PORT", "5001")), debug=True)
