import { MessageCircle, Users, ListVideo, ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useRoom, type PanelTab } from '@/store/room';
import { ChatTab } from './ChatTab';
import { PeopleTab } from './PeopleTab';
import { QueueTab } from './QueueTab';
import { cn } from '@/lib/utils';
import { softSpring } from './ui';

export function RightPanel() {
  const panelOpen = useRoom((s) => s.ui.panelOpen);
  const activeTab = useRoom((s) => s.ui.tab);
  const unread = useRoom((s) => s.unread);
  const peopleCount = useRoom((s) => s.people.length);
  const queueCount = useRoom((s) => s.queue.length);

  const setTab = (tab: PanelTab) => {
    useRoom.getState().setUi({ tab, panelOpen: true });
  };

  const closePanel = () => {
    useRoom.getState().setUi({ panelOpen: false });
  };

  return (
    <AnimatePresence>
      {panelOpen && (
        <>
          {/* Mobile backdrop dimmer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closePanel}
            className="fixed inset-0 z-30 bg-black/55 backdrop-blur-[2px] lg:hidden"
          />

          <motion.aside
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={softSpring}
            className={cn(
              'flex flex-col glass-strong border border-white/10 shadow-float overflow-hidden',
              // Mobile: comfortable bottom drawer keeping video visible above
              'fixed inset-x-2 bottom-2 z-40 h-[62dvh] rounded-3xl',
              // Desktop: roomier docked right column
              'lg:static lg:z-20 lg:h-full lg:w-[344px] xl:w-[372px] lg:rounded-3xl shrink-0',
            )}
          >
            {/* Mobile Drag Handle */}
            <div className="flex justify-center pt-2 pb-1 lg:hidden">
              <div className="h-1 w-10 rounded-full bg-white/20" />
            </div>

            {/* Tabs Header */}
            <div className="flex items-center justify-between gap-1 border-b border-white/10 px-2.5 py-2 bg-black/25">
              <div className="flex items-center gap-1 min-w-0">
                <TabButton
                  active={activeTab === 'chat'}
                  onClick={() => setTab('chat')}
                  icon={MessageCircle}
                  label="Chat"
                  badge={unread > 0 ? unread : undefined}
                />
                <TabButton
                  active={activeTab === 'people'}
                  onClick={() => setTab('people')}
                  icon={Users}
                  label="People"
                  badge={peopleCount}
                />
                <TabButton
                  active={activeTab === 'queue'}
                  onClick={() => setTab('queue')}
                  icon={ListVideo}
                  label="Queue"
                  badge={queueCount > 0 ? queueCount : undefined}
                />
              </div>

              {/* Close Button */}
              <button
                onClick={closePanel}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-white/50 hover:bg-white/10 hover:text-white transition"
                title="Collapse panel"
              >
                <ChevronRight size={18} className="hidden lg:block" />
                <X size={16} className="lg:hidden" />
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden">
              {activeTab === 'chat' && <ChatTab />}
              {activeTab === 'people' && <PeopleTab />}
              {activeTab === 'queue' && <QueueTab />}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition shrink-0',
        active ? 'text-white' : 'text-white/55 hover:text-white/90',
      )}
    >
      {active && (
        <motion.span
          layoutId="rightPanelTabPill"
          transition={softSpring}
          className="absolute inset-0 rounded-xl bg-white/12 ring-1 ring-white/15 shadow-sm"
        />
      )}
      <Icon size={13} className={cn('relative z-10', active ? 'text-coral-300' : '')} />
      <span className="relative z-10">{label}</span>
      {badge !== undefined && (
        <span
          className={cn(
            'relative z-10 rounded-full px-1.5 py-0.2 text-[10px] font-bold',
            active ? 'bg-coral-500 text-white' : 'bg-white/10 text-white/65',
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
