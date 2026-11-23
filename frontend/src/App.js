import React, { useCallback, useEffect, useRef, useState } from "react";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "./App.css";
import { api } from "./api";
import CommandBar from "./components/CommandBar";
import EventModal from "./components/EventModal";
import InterestsEditor from "./components/InterestsEditor";
import RecommendationsPanel, { CourseList, Tabs, VideoList } from "./components/Recommendations";

moment.updateLocale("en", { week: { dow: 1 } }); // weeks start on Monday
const localizer = momentLocalizer(moment);
const COLORS = ["#4f46e5", "#0891b2", "#059669", "#d97706", "#db2777", "#7c3aed"];

export default function App() {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // event being created or edited
  const [selectedId, setSelectedId] = useState(null);
  const [rec, setRec] = useState(null);
  const [reloadKey, setReloadKey] = useState(0); // bump to refetch recommendations
  const [busy, setBusy] = useState(false);
  const [interests, setInterests] = useState([]);
  const [explore, setExplore] = useState({ q: "", heading: "", courses: [], videos: [], loading: false, tab: "courses" });
  const autoSelected = useRef(false);

  const loadEvents = useCallback(() =>
    api.listEvents()
      .then((data) => {
        const valid = data.map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end) }))
          .filter((e) => !isNaN(e.start) && !isNaN(e.end) && e.end > e.start);
        setEvents(valid);
        setError("");
        if (!autoSelected.current && valid.length) {
          // Start with the next upcoming task selected so the side panel is never empty.
          autoSelected.current = true;
          const upcoming = valid.filter((e) => e.end >= new Date()).sort((a, b) => a.start - b.start);
          setSelectedId((upcoming[0] || valid[0]).id);
        }
      })
      .catch((e) => setError(e.message)), []);

  useEffect(() => {
    loadEvents();
    api.getProfile().then((p) => setInterests(p.interests)).catch(() => {});
  }, [loadEvents]);

  // Load recommendations for the selected event; poll while the background job runs.
  useEffect(() => {
    if (!selectedId) return undefined;
    let cancelled = false;
    let timer;
    const poll = () =>
      api.getRecommendations(selectedId).then((r) => {
        if (cancelled) return;
        setRec(r);
        if (r.status === "pending" || r.status === "running") timer = setTimeout(poll, 2000);
      }).catch((e) => !cancelled && setError(e.message));
    setRec(null);
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [selectedId, reloadKey]);

  const selected = events.find((e) => e.id === selectedId) || null;

  const save = async (fields) => {
    const saved = editing.id ? await api.updateEvent(editing.id, fields) : await api.createEvent(fields);
    setEditing(null);
    await loadEvents();
    setSelectedId(saved.id);
    setReloadKey((k) => k + 1);
  };

  const remove = async () => {
    try {
      await api.deleteEvent(editing.id);
      if (editing.id === selectedId) setSelectedId(null);
      setEditing(null);
      await loadEvents();
    } catch (e) {
      setError(e.message);
    }
  };

  const runCommand = async (command) => {
    setBusy(true);
    try {
      const created = await api.runCommand(command);
      await loadEvents();
      setSelectedId(created.id);
      setReloadKey((k) => k + 1);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const refresh = () => api.refreshRecommendations(selectedId)
    .then(() => setReloadKey((k) => k + 1))
    .catch((e) => setError(e.message));

  const changeInterests = (next) => {
    setInterests(next);
    api.saveProfile(next).then((p) => setInterests(p.interests)).catch((e) => setError(e.message));
  };

  const searchExplore = async (e) => {
    e.preventDefault();
    const q = explore.q.trim();
    if (!q) return;
    setExplore((s) => ({ ...s, heading: `Results for “${q}”`, courses: [], videos: [], loading: true, tab: "courses" }));
    const [courses, videos] = await Promise.allSettled([api.searchCourses(q), api.searchVideos(q)]);
    setExplore((s) => ({
      ...s, loading: false,
      courses: courses.status === "fulfilled" ? courses.value : [],
      videos: videos.status === "fulfilled" ? videos.value : [],
    }));
  };

  const showSimilar = (name) =>
    api.similarCourses(name)
      .then((courses) => {
        setExplore((s) => ({ ...s, heading: `Courses similar to “${name}”`, courses, videos: [], tab: "courses" }));
        document.getElementById("explore")?.scrollIntoView({ behavior: "smooth" });
      })
      .catch((e) => setError(e.message));

  const eventProps = (event) => ({
    className: event.id === selectedId ? "evt selected" : "evt",
    style: { "--evt": COLORS[event.id % COLORS.length] },
  });

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="logo" aria-hidden="true">S</span><h1>Saathi</h1></div>
        <InterestsEditor interests={interests} onChange={changeInterests} />
      </header>

      <CommandBar onSubmit={runCommand} busy={busy} />
      {error && (
        <div role="alert" className="banner">
          <span>{error}</span>
          <button className="icon" onClick={() => setError("")} aria-label="Dismiss">×</button>
        </div>
      )}

      <main>
        <section className="card-surface calendar">
          <Calendar
            localizer={localizer}
            events={events}
            views={["month", "week", "day", "agenda"]}
            defaultView="month"
            selectable
            popup
            style={{ height: 660 }}
            eventPropGetter={eventProps}
            onSelectSlot={(slot) => setEditing({ start: slot.start, end: slot.end })}
            onSelectEvent={(event) => setSelectedId(event.id)}
            onDoubleClickEvent={(event) => setEditing(event)}
          />
          <p className="hint">Click a day to add a task · click a task for recommendations · double-click to edit</p>
        </section>

        <aside className="card-surface side">
          <RecommendationsPanel event={selected} rec={rec} onRefresh={refresh}
            onEdit={() => setEditing(selected)} onSimilar={showSimilar} />
        </aside>
      </main>

      <section id="explore" className="card-surface explore">
        <h2>Explore a topic</h2>
        <form onSubmit={searchExplore} className="search">
          <input value={explore.q} onChange={(e) => setExplore({ ...explore, q: e.target.value })}
            placeholder="Search courses and videos, e.g. machine learning" aria-label="Topic" />
          <button type="submit" className="primary" disabled={explore.loading || !explore.q.trim()}>
            {explore.loading ? "Searching…" : "Search"}
          </button>
        </form>
        {explore.heading && (
          <>
            <h3 className="explore-heading">{explore.heading}</h3>
            <Tabs active={explore.tab} onChange={(tab) => setExplore((s) => ({ ...s, tab }))} tabs={[
              { id: "courses", label: "Courses", count: explore.courses.length },
              { id: "videos", label: "Videos", count: explore.videos.length },
            ]} />
            {explore.loading && <p className="muted">Searching…</p>}
            {!explore.loading && explore.tab === "courses" && <CourseList courses={explore.courses} onSimilar={showSimilar} />}
            {!explore.loading && explore.tab === "videos" && <VideoList videos={explore.videos} />}
          </>
        )}
      </section>

      {editing && <EventModal event={editing} onSave={save} onDelete={remove} onClose={() => setEditing(null)} />}
    </div>
  );
}
