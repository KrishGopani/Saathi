import React, { useEffect, useState } from "react";
import moment from "moment";

const FORMAT = "YYYY-MM-DDTHH:mm";

export default function EventModal({ event, onSave, onDelete, onClose }) {
  const [title, setTitle] = useState(event.title || "");
  const [desc, setDesc] = useState(event.desc || "");
  const [start, setStart] = useState(moment(event.start).format(FORMAT));
  const [end, setEnd] = useState(moment(event.end).format(FORMAT));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    const s = new Date(start);
    const en = new Date(end);
    if (!title.trim()) return setError("Enter a title.");
    if (isNaN(s) || isNaN(en)) return setError("Choose a start and end time.");
    if (en <= s) return setError("End time must be after start time.");
    setSaving(true);
    try {
      await onSave({ title: title.trim(), desc, start: s.toISOString(), end: en.toISOString() });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal" role="dialog" aria-modal="true" aria-label={event.id ? "Edit task" : "New task"}
        onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{event.id ? "Edit task" : "New task"}</h2>
        {error && <p role="alert" className="inline-error">{error}</p>}
        <label>Title<input value={title} maxLength={100} autoFocus onChange={(e) => setTitle(e.target.value)} /></label>
        <label>Notes<textarea value={desc} maxLength={255} rows={3} onChange={(e) => setDesc(e.target.value)}
          placeholder="Details help find better courses and videos" /></label>
        <div className="row">
          <label>Starts<input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label>Ends<input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        </div>
        <div className="actions">
          {event.id && <button type="button" className="danger" onClick={onDelete}>Delete</button>}
          <span className="spacer" />
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}
