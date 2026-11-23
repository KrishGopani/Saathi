import React, { useState } from "react";
import moment from "moment";

const compact = new Intl.NumberFormat("en", { notation: "compact" });

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={active === t.id}
          className={active === t.id ? "tab active" : "tab"} onClick={() => onChange(t.id)}>
          {t.label}{t.count > 0 && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

function Skeleton({ rows = 3 }) {
  return (
    <ul className="cards" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <li key={i} className="card skeleton" />)}
    </ul>
  );
}

const LEVEL_CLASS = { Beginner: "good", Intermediate: "warn", Advanced: "hard" };

export function CourseList({ courses, onSimilar }) {
  if (!courses.length) return <p className="empty">No matching courses.</p>;
  return (
    <ul className="cards">
      {courses.map((c) => (
        <li key={c.url} className="card course">
          <a href={c.url} target="_blank" rel="noopener noreferrer" className="card-title">{c.name}</a>
          <div className="meta">
            <span className={`badge ${LEVEL_CLASS[c.level] || ""}`}>{c.level}</span>
            <span>★ {c.rating}</span>
            <span className="truncate">{c.university}</span>
          </div>
          {onSimilar && (
            <button className="link" onClick={() => onSimilar(c.name)}>Find similar courses →</button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function VideoList({ videos }) {
  if (!videos.length) return <p className="empty">No videos found.</p>;
  return (
    <ul className="cards">
      {videos.map((v) => (
        <li key={v.url} className="card video">
          <a href={v.url} target="_blank" rel="noopener noreferrer" className="thumb" aria-label={`Watch ${v.title}`}>
            <img src={v.thumbnail} alt="" loading="lazy" />
            <span className="duration">{v.duration.replace(/^0:/, "")}</span>
          </a>
          <div className="video-body">
            <a href={v.url} target="_blank" rel="noopener noreferrer" className="card-title clamp">{v.title}</a>
            <div className="meta">
              <span className="truncate">{v.channel}</span>
              <span>{compact.format(v.views)} views</span>
            </div>
            {v.chapters.length > 0 && (
              <details>
                <summary>{v.chapters.length} chapters</summary>
                <ol className="chapters">{v.chapters.map((c) => <li key={c}>{c.replace(/^\d+\.\s*/, "")}</li>)}</ol>
              </details>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function RecommendationsPanel({ event, rec, onRefresh, onEdit, onSimilar }) {
  const [tab, setTab] = useState("courses");
  if (!event) {
    return (
      <div className="placeholder">
        <div className="placeholder-icon" aria-hidden="true">✨</div>
        <p><strong>Pick a task</strong></p>
        <p className="muted">Select any task on the calendar to see courses and videos picked for it.</p>
      </div>
    );
  }
  const working = !rec || rec.status === "pending" || rec.status === "running";
  const courses = rec ? rec.courses : [];
  const videos = rec ? rec.videos : [];
  return (
    <div>
      <div className="panel-head">
        <div>
          <h3 className="task-title">{event.title}</h3>
          <p className="muted">{moment(event.start).format("ddd, MMM D · h:mm A")} – {moment(event.end).format("h:mm A")}</p>
        </div>
        <div className="icon-actions">
          <button className="icon" onClick={onEdit} title="Edit task" aria-label="Edit task">✎</button>
          <button className="icon" onClick={onRefresh} disabled={working} title="Regenerate recommendations" aria-label="Regenerate recommendations">↻</button>
        </div>
      </div>
      {rec && rec.keywords.length > 0 && (
        <div className="chips">{rec.keywords.map((k) => <span key={k} className="chip">{k}</span>)}</div>
      )}
      {rec && rec.status === "error" && <p role="alert" className="inline-error">{rec.error}</p>}
      <Tabs active={tab} onChange={setTab} tabs={[
        { id: "courses", label: "Courses", count: courses.length },
        { id: "videos", label: "Videos", count: videos.length },
      ]} />
      {tab === "courses" && (courses.length ? <CourseList courses={courses} onSimilar={onSimilar} />
        : working ? <Skeleton /> : <p className="empty">No matching courses.</p>)}
      {tab === "videos" && (videos.length ? <VideoList videos={videos} />
        : working || (rec && rec.status === "pending") ? <Skeleton rows={2} />
        : <p className="empty">{rec && rec.error ? rec.error : "No videos found."}</p>)}
    </div>
  );
}
