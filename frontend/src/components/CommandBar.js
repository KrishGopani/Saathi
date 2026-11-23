import React, { useRef, useState } from "react";

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const EXAMPLES = [
  "Study machine learning tomorrow at 10am for 2 hours",
  "Guitar practice on Friday evening at 6pm",
  "Finish the Flask project report on Sunday 4pm",
];

export default function CommandBar({ onSubmit, busy }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const recognizer = useRef(null);

  const submit = (e) => {
    e.preventDefault();
    if (text.trim()) onSubmit(text.trim()).then((ok) => ok && setText(""));
  };

  const dictate = () => {
    if (listening) return recognizer.current.stop();
    recognizer.current = new Recognition();
    recognizer.current.lang = "en-US";
    recognizer.current.onresult = (e) => setText(e.results[0][0].transcript);
    recognizer.current.onend = () => setListening(false);
    recognizer.current.start();
    setListening(true);
  };

  return (
    <div className="command">
      <form className="command-bar" onSubmit={submit}>
        <span className="command-icon" aria-hidden="true">✨</span>
        <input value={text} onChange={(e) => setText(e.target.value)} disabled={busy}
          placeholder="Tell Saathi what's on your plate…" aria-label="Natural-language command" />
        {Recognition && (
          <button type="button" className={listening ? "icon recording" : "icon"} onClick={dictate}
            aria-pressed={listening} aria-label={listening ? "Stop dictation" : "Dictate"} title="Dictate">
            {listening ? "■" : "🎙"}
          </button>
        )}
        <button type="submit" className="primary" disabled={busy || !text.trim()}>{busy ? "Adding…" : "Add task"}</button>
      </form>
      <div className="examples">
        {EXAMPLES.map((ex) => <button key={ex} type="button" className="example" onClick={() => setText(ex)}>{ex}</button>)}
      </div>
    </div>
  );
}
