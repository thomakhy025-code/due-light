"use client";

import { useEffect, useState } from "react";
import { FILE_ACCEPT } from "@/lib/document-files";
import { SAMPLE_NOTES } from "@/lib/study-notes";
import type { StudySet } from "@/lib/types";

export default function StudyPanel({
  studies,
  activeId,
  note,
  busy,
  modelLine,
  onSummarise,
  onSelect,
  onRemove,
  onKnown,
}: {
  studies: StudySet[];
  activeId: string | null;
  note: string | null;
  busy: boolean;
  modelLine: string;
  onSummarise: (text: string, file: File | null) => Promise<boolean>;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onKnown: (setId: string, cardId: string) => void;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const active = studies.find((set) => set.id === activeId) ?? null;
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    setCardIndex(0);
    setFlipped(false);
    setOpenQuestion(null);
    setConfirmRemove(false);
  }, [activeId]);

  const card = active?.flashcards[cardIndex] ?? null;

  async function submit() {
    if (busy || (!text.trim() && !file)) return;
    const saved = await onSummarise(text, file);
    if (!saved) return;
    setText("");
    setFile(null);
  }

  return (
    <div className="study-layout" id="study">
      <section className="card study-compose" aria-label="Summarise course material">
        <h2 className="section-label">Course material</h2>
        <p className="model-status" role="status">{modelLine}</p>
        <p className="quiet">Paste notes with headings or bullets, or attach a photo or PDF. The file is read in this browser and is not uploaded.</p>
        <label className="field">
          Course notes
          <textarea
            id="course-notes"
            rows={8}
            value={text}
            placeholder="A heading, then bullet points, or lines like Osmosis: water moves..."
            onChange={(change) => setText(change.target.value)}
          />
        </label>
        {file ? (
          <div className="preview">
            {preview && file.type.startsWith("image/") ? <img src={preview} alt="" /> : null}
            <span>{file.name}</span>
            <button type="button" className="ghost" onClick={() => setFile(null)}>
              Remove file
            </button>
          </div>
        ) : null}
        <div className="row-actions">
          <button type="button" className="ghost" onClick={() => setText(SAMPLE_NOTES)}>
            Use a sample
          </button>
          <label className="icon-btn file-label">
            Add photo or PDF
            <input
              type="file"
              accept={FILE_ACCEPT}
              hidden
              onChange={(change) => setFile(change.target.files?.[0] ?? null)}
            />
          </label>
          <button id="summarise" type="button" className="primary" disabled={busy || (!text.trim() && !file)} onClick={() => void submit()}>
            {busy ? (file ? "Reading…" : "Summarising…") : "Summarise"}
          </button>
        </div>
        {note ? <p className="save-warning" role="status">{note}</p> : null}
        <p className="fine-print">
          Photos, PDFs, and notes stay in this browser. They are not uploaded.
        </p>
        {studies.length > 0 ? (
          <div className="set-list">
            <h3 className="section-label">Saved in this browser</h3>
            {studies.map((set) => (
              <button
                key={set.id}
                type="button"
                className="set-button"
                data-study-id={set.id}
                aria-pressed={set.id === activeId}
                onClick={() => onSelect(set.id)}
              >
                <span>{set.title}</span>
                <span className="meta">{set.points.length} points</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>
      <section className="card study-result" aria-label="Study set">
        {!active ? (
          <p className="quiet">A summary will land here: important points, flashcards, and exam-style questions.</p>
        ) : (
          <>
            <div className="event-head">
              <h2 data-study-title={active.title}>{active.title}</h2>
              {confirmRemove ? (
                <button type="button" className="danger" onClick={() => onRemove(active.id)}>
                  Yes, remove
                </button>
              ) : (
                <button type="button" className="danger" onClick={() => setConfirmRemove(true)}>
                  Remove
                </button>
              )}
            </div>
            <h3 className="section-label">Important points</h3>
            <ul className="point-list">
              {active.points.map((point) => (
                <li key={point} className="point" data-point="true">
                  {point}
                </li>
              ))}
            </ul>
            <h3 className="section-label">Flashcards</h3>
            {card ? (
              <div className="cards">
                <button
                  type="button"
                  className="flip"
                  data-side={flipped ? "back" : "front"}
                  onClick={() => setFlipped((value) => !value)}
                >
                  <span className="meta">{flipped ? "Answer" : "Cue"} · click to flip</span>
                  <strong>{flipped ? card.back : card.front}</strong>
                </button>
                <div className="row-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setCardIndex((index) => (index - 1 + active.flashcards.length) % active.flashcards.length);
                      setFlipped(false);
                    }}
                  >
                    Previous
                  </button>
                  <span className="meta">
                    {cardIndex + 1} of {active.flashcards.length}
                  </span>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setCardIndex((index) => (index + 1) % active.flashcards.length);
                      setFlipped(false);
                    }}
                  >
                    Next
                  </button>
                  <button type="button" className="ghost" aria-pressed={card.known} onClick={() => onKnown(active.id, card.id)}>
                    {card.known ? "Got it" : "Mark as got it"}
                  </button>
                </div>
              </div>
            ) : null}
            <h3 className="section-label">Practice questions</h3>
            <p className="quiet">Each question uses the terms from these notes.</p>
            {active.questions.map((question) => (
              <article key={question.id} className="question" data-question="true">
                <p className="kind kind-test">Apply</p>
                <p className="question-prompt">{question.prompt}</p>
                {openQuestion === question.id ? (
                  <div className="approach">
                    <p className="meta">How to answer</p>
                    <p>{question.approach}</p>
                  </div>
                ) : (
                  <button type="button" className="ghost" onClick={() => setOpenQuestion(question.id)}>
                    Show how to answer
                  </button>
                )}
              </article>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
