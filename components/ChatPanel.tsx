import { useEffect, useRef, useState } from "react";
import { REMINDER_OPTIONS } from "@/lib/reminders";
import { isIsoDate } from "@/lib/shanghai";
import type { ChatMessage, Kind, Proposal, ReminderChoice } from "@/lib/types";

const EXAMPLES = ["Math homework due Nov 14", "Biology quiz Friday 10:00", "Essay due tomorrow"];

export default function ChatPanel({
  messages,
  onSend,
  onUpdateProposal,
  onAdd,
  onDiscard,
  onAddAll,
  onOpenStudy,
}: {
  messages: ChatMessage[];
  onSend: (text: string, file: File | null) => Promise<void>;
  onUpdateProposal: (messageId: string, proposalId: string, patch: Partial<Proposal>) => void;
  onAdd: (messageId: string, proposalId: string) => void;
  onDiscard: (messageId: string, proposalId: string) => void;
  onAddAll: (messageId: string) => void;
  onOpenStudy: (studySetId: string) => void;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const latest = [...messages].reverse().find((message) => message.role === "assistant")?.text ?? "";

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
    <section className="card chat" id="chat" aria-label="Deadline chat">
      <h2 className="section-label">Add a deadline</h2>
      <div className="messages" ref={logRef}>
        {messages.length === 0 ? (
          <div className="empty-chat">
            <p>Tell me a due date, or attach a photo of the sheet. Nothing is saved until you confirm it. To revise notes, open Study, or ask me to summarise them.</p>
            <div className="examples">
              {EXAMPLES.map((example) => (
                <button key={example} type="button" className="example" onClick={() => void submit(example, null)}>
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((message) =>
          message.role === "user" ? (
            <div key={message.id} className="msg-user" data-role="user">
              <p>{message.text || "Photo"}</p>
              {message.imageName ? <span className="photo-name">Photo: {message.imageName}</span> : null}
            </div>
          ) : (
            <div key={message.id} className="msg-assistant" data-role="assistant">
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
              {message.proposals && message.proposals.filter((proposal) => proposal.status === "pending").length > 1 ? (
                <div className="row-actions">
                  <button type="button" className="primary" onClick={() => onAddAll(message.id)}>
                    Add all
                  </button>
                </div>
              ) : null}
              {message.studySetId ? (
                <div className="row-actions">
                  <button type="button" className="primary" onClick={() => onOpenStudy(message.studySetId!)}>
                    Open study set
                  </button>
                </div>
              ) : null}
            </div>
          ),
        )}
      </div>
      <p className="sr-only" aria-live="polite">{latest}</p>
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(text, file);
        }}
      >
        <label className="field">
          Deadline note
          <textarea
            value={text}
            rows={2}
            placeholder="Essay due Nov 14, or quiz Friday 10am"
            onChange={(change) => setText(change.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit(text, file);
              }
            }}
          />
        </label>
        {file && preview ? (
          <div className="preview">
            <img src={preview} alt="" />
            <span>{file.name}</span>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setFile(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
            >
              Remove photo
            </button>
          </div>
        ) : null}
        <div className="composer-actions">
          <button type="button" className="icon-btn" onClick={() => fileRef.current?.click()}>
            Add photo
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            hidden
            onChange={(change) => setFile(change.target.files?.[0] ?? null)}
          />
          <button type="submit" className="primary" disabled={busy || (!text.trim() && !file)}>
            {busy ? "Reading…" : "Mark dates"}
          </button>
        </div>
        <p className="fine-print">
          A clear typed date stays in this browser. Photos, and notes without a clear date, are sent to OpenAI only when a key is set, and are not stored.
        </p>
      </form>
    </section>
  );
}

function ProposalCard({
  proposal,
  onChange,
  onAdd,
  onDiscard,
}: {
  proposal: Proposal;
  onChange: (patch: Partial<Proposal>) => void;
  onAdd: () => void;
  onDiscard: () => void;
}) {
  if (proposal.status !== "pending") {
    return (
      <div className="proposal" data-status={proposal.status}>
        <p>
          {proposal.status === "added" ? "On the calendar" : "Discarded"}: {proposal.title}
        </p>
      </div>
    );
  }
  const ready = proposal.title.trim().length > 0 && isIsoDate(proposal.date);
  return (
    <div className="proposal" data-status="pending">
      <p className={`kind kind-${proposal.kind}`}>{proposal.kind === "test" ? "Test" : "Homework"}</p>
      {proposal.sourceText ? <p className="source">Read as: {proposal.sourceText}</p> : null}
      <div className="fields">
        <label className="field wide">
          Title
          <input value={proposal.title} onChange={(change) => onChange({ title: change.target.value })} />
        </label>
        <label className="field">
          Date
          <input type="date" value={proposal.date} onChange={(change) => onChange({ date: change.target.value })} />
        </label>
        <label className="field">
          Time
          <input
            type="time"
            value={proposal.time ?? ""}
            onChange={(change) => onChange({ time: change.target.value || null })}
          />
        </label>
        <div className="field wide">
          <span>Kind</span>
          <div className="segment">
            {(["homework", "test"] as Kind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                data-kind={kind}
                aria-pressed={proposal.kind === kind}
                onClick={() => onChange({ kind })}
              >
                {kind === "test" ? "Test" : "Homework"}
              </button>
            ))}
          </div>
        </div>
        <label className="field wide">
          Reminder
          <select
            value={proposal.reminder}
            onChange={(change) => onChange({ reminder: change.target.value as ReminderChoice })}
          >
            {REMINDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row-actions">
        <button type="button" className="primary" disabled={!ready} onClick={onAdd}>
          Add to calendar
        </button>
        <button type="button" className="ghost" onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  );
}
