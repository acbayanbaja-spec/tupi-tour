"use client";

import {
  Bot,
  Copy,
  MessageCircle,
  Send,
  Sparkles,
  User,
  X,
  ChevronDown,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";

type Msg = { role: "user" | "assistant"; content: string; timestamp?: string };

const SUGGESTIONS = [
  "🍓 Best fruit picking spots in Kablon",
  "⛰️ 1-Day Mount Matutum & SG Farm tour",
  "🚗 How to commute to Tupi from Gensan / Marbel",
  "☕ Top coffee shops with mountain views",
];

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Kumusta! I’m **Tupi Guide**, your local AI assistant for Tupi, South Cotabato. Ask me about travel times, tricycle fares, strawberry farms, fruit parks, or best mountain viewpoints!",
      timestamp: "Just now",
    },
  ]);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  async function handleSend(textToSend?: string) {
    const text = (textToSend || input).trim();
    if (!text || busy) return;

    const history = messages.map(({ role, content }) => ({ role, content }));
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    setMessages((m) => [...m, { role: "user", content: text, timestamp: now }]);
    setInput("");
    setBusy(true);

    try {
      const data = await api<{ reply: string; source: string }>("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: text, history }),
      });
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: data.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "I couldn't reach the live AI endpoint, but here is local advice: Start at Poblacion for breakfast, head toward Kablon Fruit Park for fresh fruit preserves, and visit SG Farm in Glandang before the afternoon fog rolls in.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function copyText(content: string) {
    navigator.clipboard.writeText(content);
    toast.success("Copied to clipboard!");
  }

  return (
    <>
      {/* Floating Toggle Button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 z-40 flex h-14 items-center gap-2.5 rounded-full bg-forest px-4 text-cream shadow-lift transition hover:scale-105 hover:bg-forest-800 md:bottom-6 md:right-6"
          aria-label="Open Tupi Guide AI Chat"
        >
          <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gold text-forest font-bold">
            <Sparkles size={16} />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-forest" />
          </div>
          <span className="text-xs font-bold tracking-wide hidden sm:inline">Ask Tupi Guide</span>
        </button>
      )}

      {/* Chat Window Modal */}
      {open && (
        <div className="fixed bottom-4 right-4 z-50 flex h-[min(600px,85vh)] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-forest/15 bg-white shadow-2xl md:bottom-6 md:right-6">
          {/* Header */}
          <div className="flex items-center justify-between bg-forest px-5 py-4 text-cream">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gold text-forest shadow">
                <Bot size={22} />
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-forest" />
              </div>
              <div>
                <h3 className="font-serif text-base font-bold leading-tight">Tupi Guide AI</h3>
                <p className="text-[11px] text-cream/70">Local South Cotabato Intelligence</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full p-1.5 text-cream/70 hover:bg-white/10 hover:text-cream"
              aria-label="Close chat"
            >
              <X size={18} />
            </button>
          </div>

          {/* Quick Prompt Starters */}
          <div className="flex gap-2 overflow-x-auto border-b border-forest/10 bg-cream/50 px-3 py-2 text-[11px] scrollbar-none">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSend(s)}
                className="whitespace-nowrap rounded-full border border-forest/10 bg-white px-2.5 py-1 text-forest/80 hover:bg-forest hover:text-cream transition"
              >
                {s}
              </button>
            ))}
          </div>

          {/* Messages Body */}
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4 text-xs scrollbar-thin">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex gap-2.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role === "assistant" && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gold text-forest mt-0.5">
                    <Sparkles size={14} />
                  </div>
                )}
                <div
                  className={`group relative max-w-[82%] rounded-2xl p-3.5 leading-relaxed shadow-sm ${
                    m.role === "user"
                      ? "bg-forest text-cream rounded-tr-sm"
                      : "bg-[#f5f1e8] text-forest rounded-tl-sm border border-forest/10"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>

                  <div
                    className={`mt-1.5 flex items-center justify-between text-[10px] ${
                      m.role === "user" ? "text-cream/60" : "text-forest/50"
                    }`}
                  >
                    <span>{m.timestamp}</span>
                    {m.role === "assistant" && (
                      <button
                        type="button"
                        onClick={() => copyText(m.content)}
                        className="opacity-0 group-hover:opacity-100 hover:text-forest transition"
                        title="Copy text"
                      >
                        <Copy size={11} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {busy && (
              <div className="flex items-center gap-2 text-xs text-forest/60 p-2">
                <span className="flex h-2 w-2 rounded-full bg-forest animate-ping" />
                <span>Tupi Guide is thinking…</span>
              </div>
            )}
          </div>

          {/* Input Form */}
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2 border-t border-forest/10 bg-white p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about Tupi…"
              className="flex-1 rounded-full border border-forest/15 bg-cream/40 px-4 py-2.5 text-xs text-forest placeholder:text-forest/40 focus:border-forest focus:bg-white focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-forest text-cream transition hover:bg-forest-800 disabled:opacity-50"
              aria-label="Send message"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
