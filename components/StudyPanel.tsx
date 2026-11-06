"use client";

import { useEffect, useRef, useState } from "react";
import { ProposalCard } from "@/components/ChatPanel";
import { FILE_ACCEPT } from "@/lib/document-files";
import { SAMPLE_NOTES } from "@/lib/study-notes";
import type { ChatMessage, Proposal, StudySet } from "@/lib/types";

const SUGGESTIONS = [
  { label: "Read the cell notes", text: SAMPLE_NOTES },
  { label: "Why no oxygen?", text: "Why doesn't glycolysis need oxygen?" },
  { label: "What is photosynthesis?", text: "What is photosynthesis?" },
];

export default function StudyPanel({
  messages,
  studies,
  activeId,
  modelLine,
  onSend,
  onUpdateProposal,
  onAdd,
  onDiscard,
  onSelect,
  onRemove,
  onKnown,
}: {
  messages: ChatMessage[];
  studies: StudySet[];
  activeId: string | null;
  modelLine: string;
  onSend: (text: string, file: File | null) => Promise<void>;
  onUpdateProposal: (messageId: string, proposalId: string, patch: Partial<Proposal>) => void;
  onAdd: (messageId: string, proposalId: string) => void;
  onDiscard: (messageId: string, proposalId: string) => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onKnown: (setId: string, cardId: string) => void;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const active = studies.find((set) => set.id === activeId) ?? null;
  const card = active?.flashcards[cardIndex] ?? null;

  useEffect(() => {
    setFlipped(false);
    setCardIndex(0);
    setOpenQuestion(null);
    setConfirmRemove(false);
  }, [activeId]);

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
    const node = logRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  async function submit(nextText: string, nextFile: File | null) {
    if (busy) return;
    if (!nextText.trim() && !nextFile) return;
    setBusy(true);
    try {
      await onSend(nextText, nextFile);
      setText("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="study-layout">
      <section className="card study-chat" id="study" aria-label="Study desk">
        <h2 className="section-label">Study</h2>
        <p className="model-status" role="status" data-model-line="true">
          {modelLine}
        </p>
        {studies.length > 0 ? (
          <div className="set-list" aria-label="Saved study sets">
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
        <div className="messages" ref={logRef}>
          {messages.length === 0 ? (
            <p className="empty-chat">
              Paste a passage, attach a photo or PDF, or start from a suggestion. A follow-up stays on the notes you already gave.
            </p>
          ) : (
            messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="msg-user" data-role="user">
                  <p>{message.text || "Photo"}</p>
                  {message.imageName ? <span className="photo-name">File: {message.imageName}</span> : null}
                </div>
              ) : (
                <div key={message.id} className="msg-assistant" data-role="assistant" data-kind={message.kind ?? ""}>
                  {message.kind ? <p className="desk-kind">{kindLabel(message.kind)}</p> : null}
                  <p>{message.text}</p>
                  {message.proposals?.map((proposal) => (
                    <ProposalCard
                      key={proposal.id}
                      proposal={proposal}
                      onChange={(patch) => onUpdateProposal(message.id, proposal.id, patch)}
                      onAdd={() => onAdd(message.id, proposal.id)}
                      onDiscard={() => onDiscard(message.id, proposal.id)}
                    />
                  ))}
                </div>
              ),
            )
          )}
        </div>
        <div className="chips" aria-label="Suggestions">
          {SUGGESTIONS.map((suggestion) => (
            <button key={suggestion.label} type="button" className="chip" onClick={() => void submit(suggestion.text, null)}>
              {suggestion.label}
            </button>
          ))}
        </div>
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(text, file);
          }}
        >
          <label className="field">
            Message
            <textarea
              aria-label="Study note"
              value={text}
              rows={3}
              placeholder="Ask about the notes, or paste a passage"
              onChange={(change) => setText(change.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submit(text, file);
                }
              }}
            />
          </label>
          {file ? (
            <div className="preview">
              {preview && file.type.startsWith("image/") ? <img src={preview} alt="" /> : null}
              <span>{file.name}</span>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                Remove file
              </button>
            </div>
          ) : null}
          <div className="composer-actions">
            <button type="button" className="icon-btn" onClick={() => fileRef.current?.click()}>
              Add photo or PDF
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={FILE_ACCEPT}
              hidden
              onChange={(change) => setFile(change.target.files?.[0] ?? null)}
            />
            <button type="submit" className="primary" disabled={busy || (!text.trim() && !file)}>
              {busy ? "Reading…" : "Send"}
            </button>
          </div>
        </form>
        <p className="fine-print">
          Notes stay in this browser. If a question is not in them, Due Light may ask Wikipedia, and only that question is sent.
        </p>
      </section>
      <section className="card study-result" aria-label="Study set">
        {!active ? (
          <p className="quiet">A summary will land here: important points, flashcards, and practice questions.</p>
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
                <button type="button" className="flip" data-side={flipped ? "back" : "front"} onClick={() => setFlipped((value) => !value)}>
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
                <p className="meta">Practice</p>
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

function kindLabel(kind: NonNullable<ChatMessage["kind"]>): string {
  if (kind === "deadline") return "Deadline";
  if (kind === "notes") return "Course notes";
  if (kind === "followup") return "Follow-up";
  return "Question";
}
