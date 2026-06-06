import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, X, Send } from 'lucide-react';

const FAQS = [
  {
    chip: 'Is it safe?',
    q: 'Is it safe to have a student in my home?',
    a: 'Every student is ID-verified before their first job. You see their photo, name and rating before they arrive — and you can rate them afterwards.',
  },
  {
    chip: 'How does payment work?',
    q: 'How does payment work?',
    a: 'You pay by card at checkout. The price is agreed upfront and locked in — no surprise charges after the job.',
  },
  {
    chip: 'Which cities?',
    q: 'Which cities do you cover?',
    a: 'We currently cover Galway city and the surrounding areas. More cities are on the way — drop us a WhatsApp if yours isn\'t listed yet.',
  },
  {
    chip: 'What if I\'m not happy?',
    q: 'What if I\'m not satisfied?',
    a: 'Tell us within 24 hours. We\'ll make it right — either re-do the job or give you a refund. Your satisfaction is guaranteed.',
  },
  {
    chip: 'How fast can I book?',
    q: 'How quickly can someone arrive?',
    a: 'Most jobs are confirmed within a few hours. For urgent requests, message us on WhatsApp and we\'ll do our best to sort something same-day.',
  },
];

interface Message {
  id: number;
  from: 'bot' | 'user';
  text: string;
}

const GREETING: Message = {
  id: 0,
  from: 'bot',
  text: 'Hi! 👋 I\'m here to answer your questions about VANO. Pick one below or type your own.',
};

let _id = 1;
function nextId() { return _id++; }

export const ChatFAQ: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [usedChips, setUsedChips] = useState<Set<string>>(new Set());
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const availableChips = FAQS.filter(f => !usedChips.has(f.chip));
  const allAnswered = availableChips.length === 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  function ask(chipLabel: string, questionText: string, answerText: string) {
    if (usedChips.has(chipLabel)) return;
    setUsedChips(prev => new Set([...prev, chipLabel]));
    const userMsg: Message = { id: nextId(), from: 'user', text: questionText };
    setMessages(prev => [...prev, userMsg]);
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages(prev => [...prev, { id: nextId(), from: 'bot', text: answerText }]);
    }, 600);
  }

  function sendFreeText() {
    const text = input.trim();
    if (!text) return;
    setInput('');
    const userMsg: Message = { id: nextId(), from: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages(prev => [...prev, {
        id: nextId(), from: 'bot',
        text: 'Great question! For anything not covered here, our team is just a WhatsApp message away — we usually reply within minutes. 💬',
      }]);
    }, 700);
  }

  return (
    <section className="py-14 px-4 flex flex-col items-center">
      <p className="eyebrow mb-3 text-center">Got questions?</p>
      <h2 className="display-lg text-foreground text-center mb-10">Ask away</h2>

      {/* Arrow + button row */}
      <div className="relative flex items-center gap-4">
        {/* Animated arrow */}
        <motion.div
          className="flex items-center gap-1"
          animate={{ x: [0, 6, 0] }}
          transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
        >
          <span className="text-2xl select-none" aria-hidden>👉</span>
        </motion.div>

        {/* Pulsing chat circle */}
        <div className="relative">
          <motion.div
            className="absolute inset-0 rounded-full bg-primary/30"
            animate={{ scale: [1, 1.55, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          />
          <motion.button
            onClick={() => setOpen(true)}
            whileTap={{ scale: 0.93 }}
            className="relative w-16 h-16 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Open chat"
          >
            <MessageCircle className="w-7 h-7 text-white" />
          </motion.button>
        </div>

        {/* Callout label */}
        <AnimatePresence>
          {!open && (
            <motion.div
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              className="bg-white border border-border/30 rounded-2xl px-3 py-2 shadow-sm text-sm text-foreground/80 whitespace-nowrap"
            >
              Chat with us ✨
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="chat"
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 w-full max-w-sm rounded-2xl border border-border bg-card shadow-xl overflow-hidden flex flex-col"
            style={{ maxHeight: '70vh' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-primary">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-white" />
                <span className="text-white text-sm font-semibold">VANO Chat</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-white/80 hover:text-white transition-colors"
                aria-label="Close chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0">
              {messages.map(msg => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22 }}
                  className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[82%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                    msg.from === 'user'
                      ? 'bg-primary text-white rounded-tr-sm'
                      : 'bg-secondary/50 text-foreground rounded-tl-sm'
                  }`}>
                    {msg.text}
                  </div>
                </motion.div>
              ))}

              {/* Typing indicator */}
              <AnimatePresence>
                {typing && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex justify-start"
                  >
                    <div className="bg-secondary/50 rounded-2xl rounded-tl-sm px-3 py-2.5 flex gap-1 items-center">
                      {[0, 1, 2].map(i => (
                        <motion.span
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 block"
                          animate={{ y: [0, -4, 0] }}
                          transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* WhatsApp CTA when all questions used */}
              <AnimatePresence>
                {allAnswered && !typing && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start"
                  >
                    <div className="bg-secondary/50 rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-foreground/80">
                      Still have questions?{' '}
                      <a
                        href="https://wa.me/353894466350"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-primary underline underline-offset-2"
                      >
                        Message us on WhatsApp →
                      </a>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={bottomRef} />
            </div>

            {/* Chips */}
            <AnimatePresence>
              {availableChips.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="px-3 pt-1 pb-2 flex flex-wrap gap-1.5"
                >
                  {availableChips.map(f => (
                    <button
                      key={f.chip}
                      onClick={() => ask(f.chip, f.q, f.a)}
                      className="text-xs border border-primary/40 text-primary rounded-full px-3 py-1 bg-primary/5 hover:bg-primary/15 transition-colors"
                    >
                      {f.chip}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input */}
            <div className="border-t border-border px-3 py-2 flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendFreeText(); }}
                placeholder="Type a question…"
                className="flex-1 text-sm bg-transparent placeholder:text-muted-foreground/50 focus:outline-none"
              />
              <button
                onClick={sendFreeText}
                disabled={!input.trim()}
                className="text-primary disabled:opacity-30 transition-opacity"
                aria-label="Send"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};
