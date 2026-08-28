"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { sendMessage } from "@/app/messages/actions";
import {
  CHAT_BUCKET,
  extForMime,
  validateImageFile,
  MAX_MESSAGE_LENGTH,
} from "@/lib/chat";
import { ChatImage } from "@/components/chat/chat-image";
import type { Message } from "@/types";

export function ChatThread({
  conversationId,
  currentUserId,
  initialMessages,
}: {
  conversationId: string;
  currentUserId: string;
  initialMessages: Message[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Append helper that de-dupes by id (own send + realtime echo).
  function addMessage(m: Message) {
    setMessages((prev) =>
      prev.some((x) => x.id === m.id) ? prev : [...prev, m],
    );
  }

  // Realtime: new messages in this conversation (RLS-filtered server-side).
  useEffect(() => {
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => addMessage(payload.new as Message),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, conversationId]);

  // Keep pinned to the newest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0] ?? null;
    if (f) {
      const err = validateImageFile(f);
      if (err) {
        setError(err);
        e.target.value = "";
        return;
      }
    }
    setFile(f);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body = text.trim();
    if (!body && !file) return;
    setSending(true);

    try {
      let imagePath: string | null = null;

      if (file) {
        // Client-side type/size already checked; Storage also enforces
        // allowed_mime_types + size server-side.
        const ext = extForMime(file.type);
        const path = `${conversationId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(CHAT_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          setError("Image upload failed. Please try again.");
          setSending(false);
          return;
        }
        imagePath = path;
      }

      const res = await sendMessage({ conversationId, body, imagePath });
      if (res.error) {
        setError(res.error);
      } else {
        if (res.message) addMessage(res.message);
        setText("");
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Messages (oldest -> newest) */}
      <div className="flex-1 space-y-3 py-4">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-faint">
            No messages yet. Say hello.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === currentUserId;
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    mine ? "bg-primary text-white" : "bg-surface text-content"
                  }`}
                >
                  {m.image_url ? (
                    <div className={m.body ? "mb-2" : ""}>
                      <ChatImage path={m.image_url} />
                    </div>
                  ) : null}
                  {m.body ? (
                    <p className="wrap-anywhere whitespace-pre-wrap">{m.body}</p>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSend}
        className="safe-bottom sticky bottom-0 border-t border-hairline bg-app pt-3"
      >
        {file ? (
          <div className="mb-2 flex items-center gap-2 text-xs text-muted">
            <span className="truncate">📎 {file.name}</span>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="text-danger"
            >
              remove
            </button>
          </div>
        ) : null}

        {error ? (
          <p className="mb-2 text-xs text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex items-end gap-2 pb-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={onPickFile}
            className="hidden"
            id="chat-image-input"
          />
          <label
            htmlFor="chat-image-input"
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-surface text-muted"
            title="Attach image"
            aria-label="Attach image"
          >
            🖼️
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend(e as unknown as React.FormEvent);
              }
            }}
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder="Type a message…"
            className="input max-h-32 flex-1 resize-none py-2"
          />
          <button
            type="submit"
            disabled={sending || (!text.trim() && !file)}
            className="btn btn-primary shrink-0 px-4"
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
