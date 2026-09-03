import { useState } from "react";

export type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
};

export function ChatPanel({
  open,
  messages,
  characterName,
  disabled,
  onSend,
  onClose,
}: {
  open: boolean;
  messages: ChatMessage[];
  characterName: string;
  disabled: boolean;
  onSend: (text: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const visibleMessages = messages.slice(-2);

  const submit = async () => {
    const text = value.trim();
    if (!text || sending || disabled) return;
    setSending(true);
    try {
      await onSend(text);
      setValue("");
    } catch {
      // App owns the user-facing error notice. Keep the draft for an explicit retry
      // and absorb the rejection so click/Enter handlers do not leak it globally.
    } finally {
      setSending(false);
    }
  };

  return (
    <aside className={`chat-panel ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="chat-compact-head">
        <strong>{characterName}와 채팅</strong>
        <button className="chat-close" onClick={onClose} aria-label="채팅 닫기">×</button>
      </div>
      <div className="chat-messages" aria-live="polite">
        {visibleMessages.length === 0
          ? <p className="chat-empty">텍스트로 이야기해 보세요.</p>
          : visibleMessages.map((message) => (
            <div key={message.id} className={`chat-message ${message.role}`}>
              <span>{message.role === "user" ? "나" : characterName}</span>
              <p>{message.text}</p>
            </div>
          ))}
      </div>
      <div className="chat-composer">
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          disabled={disabled || sending}
          placeholder={disabled ? "Live 연결 후 채팅할 수 있어요" : "메시지를 입력하세요"}
          rows={1}
        />
        <button onClick={() => void submit()} disabled={!value.trim() || disabled || sending}>{sending ? "…" : "전송"}</button>
      </div>
    </aside>
  );
}
