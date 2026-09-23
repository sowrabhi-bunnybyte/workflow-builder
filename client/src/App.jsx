import React, { useEffect, useRef, useState, useCallback } from 'react';
import Header from './components/Header.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import BlueprintPanel from './components/BlueprintPanel.jsx';
import { createSession, sendMessage, resetSession } from './lib/api.js';

export default function App() {
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [engineState, setEngineState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [mobileTab, setMobileTab] = useState('chat'); // 'chat' | 'blueprint'
  const bootstrapped = useRef(false);

  const boot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await createSession();
      setSessionId(data.sessionId);
      setMessages([{ role: 'assistant', content: data.greeting, ts: Date.now() }]);
      setEngineState(data.state);
    } catch (err) {
      setError(
        'Could not reach the workflow-planning server. Make sure the backend is running (see README → Running Locally).'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    boot();
  }, [boot]);

  const handleSend = useCallback(
    async (text) => {
      if (!sessionId || !text.trim() || sending) return;
      setMessages((m) => [...m, { role: 'user', content: text, ts: Date.now() }]);
      setSending(true);
      setError(null);
      try {
        const data = await sendMessage(sessionId, text);
        setMessages((m) => [...m, { role: 'assistant', content: data.reply, ts: Date.now() }]);
        setEngineState(data.state);
        if (data.state?.status === 'generated') setMobileTab('blueprint');
      } catch (err) {
        setError('That message failed to send. Check your connection and try again.');
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: "I couldn't process that — please try sending it again.", ts: Date.now(), isError: true },
        ]);
      } finally {
        setSending(false);
      }
    },
    [sessionId, sending]
  );

  const handleReset = useCallback(async () => {
    if (!sessionId) return boot();
    setLoading(true);
    try {
      const data = await resetSession(sessionId);
      setSessionId(data.sessionId);
      setMessages([{ role: 'assistant', content: data.greeting, ts: Date.now() }]);
      setEngineState(data.state);
      setMobileTab('chat');
    } finally {
      setLoading(false);
    }
  }, [sessionId, boot]);

  return (
    <div className="flex h-screen flex-col">
      <Header
        status={engineState?.status}
        llmAvailable={engineState?.llmAvailable}
        onReset={handleReset}
        mobileTab={mobileTab}
        onMobileTabChange={setMobileTab}
        hasWorkflow={Boolean(engineState?.generatedWorkflow)}
      />

      {error && (
        <div className="border-b border-wire-rose/20 bg-wire-rose/10 px-4 py-2 text-center text-sm text-wire-rose sm:px-6">
          {error}
        </div>
      )}

      <main className="flex min-h-0 flex-1">
        <section className={`min-h-0 flex-1 flex-col sm:flex ${mobileTab === 'chat' ? 'flex' : 'hidden'}`}>
          <ChatPanel messages={messages} onSend={handleSend} sending={sending} loading={loading} />
        </section>
        <aside
          className={`min-h-0 w-full flex-col border-ink-600 sm:flex sm:w-[420px] sm:border-l lg:w-[480px] ${
            mobileTab === 'blueprint' ? 'flex' : 'hidden'
          }`}
        >
          <BlueprintPanel engineState={engineState} loading={loading} />
        </aside>
      </main>
    </div>
  );
}
