import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Navbar } from '@/components/Navbar';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MessageCircle, Send, Image, Check, CheckCheck, Bot, Sparkles, Loader2, User } from 'lucide-react';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';

interface Conversation {
  id: string;
  job_id: string | null;
  participant_1: string;
  participant_2: string;
  updated_at: string;
  otherName?: string;
  jobTitle?: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  read: boolean;
  created_at: string;
  image_url?: string | null;
}

interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Typing indicator component
const TypingIndicator = () => (
  <div className="flex justify-start">
    <div className="bg-secondary text-secondary-foreground rounded-2xl rounded-bl-md px-4 py-2.5">
      <div className="flex gap-1 items-center h-4">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  </div>
);

// Notification sound using Web Audio API
const playNotificationSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
};

const AI_CONVO_ID = '__vano_ai_assistant__';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vano-assistant`;

const Messages = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvo, setSelectedConvo] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI assistant state
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const aiEndRef = useRef<HTMLDivElement>(null);

  const isAiChat = selectedConvo === AI_CONVO_ID;

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (selectedConvo && selectedConvo !== AI_CONVO_ID) {
      loadMessages(selectedConvo);
      markAsRead(selectedConvo);
    }
  }, [selectedConvo]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    aiEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages]);

  // Realtime: new messages + read receipt updates
  useEffect(() => {
    if (!selectedConvo || !user || selectedConvo === AI_CONVO_ID) return;
    const channel = supabase
      .channel(`messages-${selectedConvo}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${selectedConvo}`,
      }, (payload) => {
        const newMsg = payload.new as Message;
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        if (newMsg.sender_id !== user.id) {
          playNotificationSound();
          markAsRead(selectedConvo);
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${selectedConvo}`,
      }, (payload) => {
        const updated = payload.new as Message;
        setMessages((prev) => prev.map((m) => m.id === updated.id ? { ...m, read: updated.read } : m));
      })
      .subscribe();

    // Typing broadcast channel
    const typingChannel = supabase
      .channel(`typing-${selectedConvo}`)
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload?.user_id !== user.id) {
          setOtherTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 2500);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(typingChannel);
    };
  }, [selectedConvo, user]);

  const sendTypingEvent = useCallback(() => {
    if (!selectedConvo || !user) return;
    supabase.channel(`typing-${selectedConvo}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: user.id },
    });
  }, [selectedConvo, user]);

  const loadConversations = useCallback(async (userId: string) => {
    const { data: convos } = await supabase
      .from('conversations')
      .select('*')
      .or(`participant_1.eq.${userId},participant_2.eq.${userId}`)
      .order('updated_at', { ascending: false });

    if (!convos || convos.length === 0) { setConversations([]); return; }

    const otherIds = convos.map((c) => c.participant_1 === userId ? c.participant_2 : c.participant_1);
    const { data: profiles } = await supabase.from('profiles').select('user_id, display_name').in('user_id', otherIds);

    const jobIds = convos.filter((c) => c.job_id).map((c) => c.job_id!);
    const { data: jobs } = jobIds.length > 0
      ? await supabase.from('jobs').select('id, title').in('id', jobIds)
      : { data: [] };

    const enriched = convos.map((c) => {
      const otherId = c.participant_1 === userId ? c.participant_2 : c.participant_1;
      return {
        ...c,
        otherName: profiles?.find((p) => p.user_id === otherId)?.display_name || 'User',
        jobTitle: jobs?.find((j) => j.id === c.job_id)?.title || '',
      };
    });
    setConversations(enriched);
  }, []);

  const loadUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate('/auth'); return; }
    setUser(session.user);
    await loadConversations(session.user.id);
    setLoading(false);
  };

  const withOpenParam = searchParams.get('with');
  const draftOpenParam = searchParams.get('draft');

  useEffect(() => {
    if (loading || !user || !withOpenParam || withOpenParam === user.id) return;

    let cancelled = false;

    (async () => {
      const { data: rows } = await supabase
        .from('conversations')
        .select('id')
        .or(`and(participant_1.eq.${user.id},participant_2.eq.${withOpenParam}),and(participant_1.eq.${withOpenParam},participant_2.eq.${user.id})`)
        .limit(1);

      let convoId = rows?.[0]?.id as string | undefined;
      if (!convoId) {
        const { data: ins, error } = await supabase
          .from('conversations')
          .insert({ participant_1: user.id, participant_2: withOpenParam })
          .select('id')
          .single();
        if (error || !ins) {
          if (!cancelled) {
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.delete('with');
              next.delete('draft');
              return next;
            }, { replace: true });
          }
          return;
        }
        convoId = ins.id;
      }

      if (cancelled || !convoId) return;

      setSelectedConvo(convoId);
      if (draftOpenParam) {
        try {
          setNewMessage(decodeURIComponent(draftOpenParam));
        } catch {
          setNewMessage(draftOpenParam);
        }
      }

      await loadConversations(user.id);

      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('with');
        next.delete('draft');
        return next;
      }, { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, user, withOpenParam, draftOpenParam, loadConversations, setSearchParams]);

  const loadMessages = async (convoId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convoId)
      .order('created_at', { ascending: true });
    setMessages(data || []);
  };

  const markAsRead = async (convoId: string) => {
    if (!user) return;
    await supabase
      .from('messages')
      .update({ read: true })
      .eq('conversation_id', convoId)
      .neq('sender_id', user.id);
  };

  const sendMessage = async (imageUrl?: string) => {
    if ((!newMessage.trim() && !imageUrl) || !selectedConvo || !user) return;
    setSending(true);
    const insertData: any = {
      conversation_id: selectedConvo,
      sender_id: user.id,
      content: newMessage.trim() || (imageUrl ? '📷 Image' : ''),
    };
    if (imageUrl) insertData.image_url = imageUrl;

    await supabase.from('messages').insert(insertData);
    await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', selectedConvo);

    // Send push notification to the other participant
    const convo = conversations.find(c => c.id === selectedConvo);
    if (convo) {
      const recipientId = convo.participant_1 === user.id ? convo.participant_2 : convo.participant_1;
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        fetch(`https://${projectId}.supabase.co/functions/v1/notify-new-message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            recipient_id: recipientId,
            message_preview: insertData.content,
          }),
        }).catch(() => {}); // Fire and forget
      }
    }

    setNewMessage('');
    setSending(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !selectedConvo) return;
    setUploadingImage(true);

    const ext = file.name.split('.').pop();
    const path = `${user.id}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from('chat-images').upload(path, file);
    if (error) {
      setUploadingImage(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('chat-images').getPublicUrl(path);
    await sendMessage(urlData.publicUrl);
    setUploadingImage(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    sendTypingEvent();
  };

  // AI chat streaming
  const sendAiMessage = async () => {
    const input = aiInput.trim();
    if (!input || aiLoading) return;

    const userMsg: AiMessage = { role: 'user', content: input };
    const updatedMessages = [...aiMessages, userMsg];
    setAiMessages(updatedMessages);
    setAiInput('');
    setAiLoading(true);

    let assistantContent = '';

    try {
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (!resp.ok || !resp.body) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to get response');
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';

      // Add empty assistant message
      setAiMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              const finalContent = assistantContent;
              setAiMessages(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: 'assistant', content: finalContent };
                return copy;
              });
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              const finalContent = assistantContent;
              setAiMessages(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: 'assistant', content: finalContent };
                return copy;
              });
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err: any) {
      setAiMessages(prev => [...prev.filter(m => m.role !== 'assistant' || m.content), { role: 'assistant', content: `Sorry, I couldn't respond right now. ${err.message || ''}` }]);
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;

  const selectedConversation = conversations.find((c) => c.id === selectedConvo);

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <SEOHead title="Messages – VANO" description="Chat with businesses and students on VANO." />
      <Navbar />
      <div className="max-w-5xl mx-auto px-0 sm:px-4 md:px-8 pt-16 sm:pt-20 pb-0 sm:pb-4">
        <div className="flex h-[calc(100vh-4rem)] sm:h-[calc(100vh-6rem)] border-0 sm:border border-border sm:rounded-2xl overflow-hidden bg-card">
          {/* Conversation list */}
          <div className={`w-full md:w-80 border-r border-border flex flex-col shrink-0 ${selectedConvo ? 'hidden md:flex' : 'flex'}`}>
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold text-lg flex items-center gap-2"><MessageCircle size={20} /> Messages</h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              {/* AI Assistant entry — always at top */}
              <button
                onClick={() => setSelectedConvo(AI_CONVO_ID)}
                className={`w-full text-left px-4 py-3 border-b border-border hover:bg-secondary/50 transition-colors ${selectedConvo === AI_CONVO_ID ? 'bg-secondary' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Sparkles size={16} className="text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">VANO Assistant</p>
                    <p className="text-xs text-muted-foreground truncate">AI-powered help & tips</p>
                  </div>
                </div>
              </button>

              {conversations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12 px-4">No conversations yet. Message someone from a job or a Community listing.</p>
              ) : (
                conversations.map((convo) => (
                  <button
                    key={convo.id}
                    onClick={() => setSelectedConvo(convo.id)}
                    className={`w-full text-left px-4 py-3 border-b border-border hover:bg-secondary/50 transition-colors ${selectedConvo === convo.id ? 'bg-secondary' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm truncate">{convo.otherName}</p>
                      <span className="text-xs text-muted-foreground">{format(new Date(convo.updated_at), 'MMM d')}</span>
                    </div>
                    {convo.jobTitle && <p className="text-xs text-primary truncate mt-0.5">Re: {convo.jobTitle}</p>}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Chat area */}
          <div className={`flex-1 flex flex-col ${!selectedConvo ? 'hidden md:flex' : 'flex'}`}>
            {isAiChat ? (
              <>
                {/* AI chat header */}
                <div className="p-4 border-b border-border flex items-center gap-3">
                  <button onClick={() => setSelectedConvo(null)} className="md:hidden text-muted-foreground hover:text-foreground text-sm">← Back</button>
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles size={16} className="text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">VANO Assistant</p>
                    <p className="text-xs text-muted-foreground">AI-powered help</p>
                  </div>
                </div>

                {/* AI messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {aiMessages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-12">
                      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                        <Bot size={28} className="text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Hi! I'm the VANO Assistant 👋</p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                          Ask me anything about how VANO works, tips for getting gigs, writing better applications, or managing your profile.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2 justify-center">
                        {['How do I get more gigs?', 'How does job matching work?', 'Tips for my profile'].map((q) => (
                          <button
                            key={q}
                            onClick={() => { setAiInput(q); }}
                            className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors text-muted-foreground"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {aiMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-secondary text-secondary-foreground rounded-bl-md'
                      }`}>
                        {msg.role === 'assistant' ? (
                          <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1">
                            <ReactMarkdown>{msg.content || '...'}</ReactMarkdown>
                          </div>
                        ) : (
                          <p>{msg.content}</p>
                        )}
                      </div>
                    </div>
                  ))}

                  {aiLoading && aiMessages[aiMessages.length - 1]?.role !== 'assistant' && <TypingIndicator />}
                  <div ref={aiEndRef} />
                </div>

                {/* AI input */}
                <div className="p-4 border-t border-border">
                  <div className="flex gap-2">
                    <input
                      value={aiInput}
                      onChange={(e) => setAiInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMessage(); } }}
                      placeholder="Ask VANO Assistant..."
                      disabled={aiLoading}
                      className="flex-1 border border-input rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                    />
                    <button
                      onClick={sendAiMessage}
                      disabled={aiLoading || !aiInput.trim()}
                      className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {aiLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                  </div>
                </div>
              </>
            ) : selectedConvo ? (
              <>
                <div className="p-4 border-b border-border flex items-center gap-3">
                  <button onClick={() => setSelectedConvo(null)} className="md:hidden text-muted-foreground hover:text-foreground text-sm">← Back</button>
                  <div>
                    <p className="font-semibold text-sm">{selectedConversation?.otherName}</p>
                    {selectedConversation?.jobTitle && <p className="text-xs text-primary">Re: {selectedConversation.jobTitle}</p>}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm ${
                        msg.sender_id === user?.id
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-secondary text-secondary-foreground rounded-bl-md'
                      }`}>
                        {msg.image_url && (
                          <img
                            src={msg.image_url}
                            alt="Shared image"
                            className="rounded-lg mb-1.5 max-w-full max-h-48 object-cover cursor-pointer"
                            onClick={() => window.open(msg.image_url!, '_blank')}
                          />
                        )}
                        {msg.content && msg.content !== '📷 Image' && <p>{msg.content}</p>}
                        <div className={`flex items-center gap-1 mt-1 ${msg.sender_id === user?.id ? 'justify-end' : ''}`}>
                          <p className={`text-[10px] ${msg.sender_id === user?.id ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                            {format(new Date(msg.created_at), 'HH:mm')}
                          </p>
                          {msg.sender_id === user?.id && (
                            msg.read
                              ? <CheckCheck size={12} className="text-primary-foreground/80" />
                              : <Check size={12} className="text-primary-foreground/50" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {otherTyping && <TypingIndicator />}
                  <div ref={messagesEndRef} />
                </div>
                <div className="p-4 border-t border-border">
                  <div className="flex gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-xl transition-colors disabled:opacity-50"
                      title="Send image"
                    >
                      <Image size={18} />
                    </button>
                    <input
                      value={newMessage}
                      onChange={handleInputChange}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      placeholder="Type a message..."
                      className="flex-1 border border-input rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      onClick={() => sendMessage()}
                      disabled={sending || (!newMessage.trim() && !uploadingImage)}
                      className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                Select a conversation to start chatting
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Messages;
