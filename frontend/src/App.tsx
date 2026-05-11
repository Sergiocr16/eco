import { useState } from 'react';
import { motion } from 'motion/react';
import { GradientMesh } from './components/GradientMesh';
import { StatusOrb } from './components/StatusOrb';
import { MessageBubble } from './components/MessageBubble';
import { InputBar } from './components/InputBar';
import type { EcoStatus, Message } from './lib/types';

const DUMMY_MESSAGES: Message[] = [
  {
    id: '1',
    role: 'user',
    text: '¿Qué archivos hay en mi proyecto Aditum?',
    createdAt: Date.now() - 60000,
  },
  {
    id: '2',
    role: 'assistant',
    text: 'Voy a revisar el directorio.',
    toolCalls: [
      {
        id: 't1',
        name: 'LS',
        input: { path: '/Users/sergio/projects/aditum-jh' },
        status: 'success',
        output: 'src/\npackage.json\nREADME.md\npom.xml\nbower.json\nsrc/main/webapp/\nsrc/main/java/\n...',
      },
      {
        id: 't2',
        name: 'Glob',
        input: { pattern: '**/*.ts' },
        status: 'success',
        output: '47 archivos TypeScript encontrados.\n\nsrc/main/webapp/app/...\nsrc/types/...',
      },
    ],
    createdAt: Date.now() - 30000,
  },
  {
    id: '3',
    role: 'assistant',
    text: 'Encontré 47 archivos TypeScript en src/. ¿Querés que te resuma alguno en particular?',
    createdAt: Date.now() - 5000,
  },
];

export function App() {
  const [status, setStatus] = useState<EcoStatus>('idle');
  const [messages, setMessages] = useState<Message[]>(DUMMY_MESSAGES);
  const [listening, setListening] = useState(false);
  const [workspace] = useState('/Users/sergio/projects/aditum-jh');

  function handleSend(text: string) {
    const msg: Message = {
      id: String(Date.now()),
      role: 'user',
      text,
      createdAt: Date.now(),
    };
    setMessages((m) => [...m, msg]);
    setStatus('thinking');
    setTimeout(() => setStatus('idle'), 2400);
  }

  function handleMicToggle() {
    const next = !listening;
    setListening(next);
    setStatus(next ? 'listening' : 'idle');
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[var(--color-eco-bg-deep)]">
      <GradientMesh />

      {/* Brand corner */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        className="absolute top-6 left-7 z-30 select-none"
      >
        <div className="flex items-baseline gap-2">
          <span
            className="text-display text-[15px] text-eco-text/80"
            style={{ letterSpacing: '-0.02em' }}
          >
            Eco
          </span>
          <span className="text-[10px] text-eco-text-faint font-mono tracking-wider uppercase">
            v0.1
          </span>
        </div>
      </motion.div>

      {/* Hero: orb + status */}
      <div className="relative z-10 flex flex-col items-center pt-[10vh] pb-[3vh]">
        <StatusOrb status={status} />
      </div>

      {/* Conversation panel — centered, max width */}
      <div className="relative z-10 mx-auto max-w-3xl px-6 pb-[110px]" style={{ height: 'calc(100vh - 38vh)' }}>
        <div className="h-full overflow-y-auto invisible-scroll">
          <div className="flex flex-col gap-5 pb-6">
            {messages.map((m, i) => (
              <MessageBubble key={m.id} message={m} index={i} />
            ))}
          </div>
        </div>
      </div>

      <InputBar
        workspace={workspace}
        listening={listening}
        onSend={handleSend}
        onMicToggle={handleMicToggle}
        onWorkspaceClick={() => {}}
      />
    </div>
  );
}
