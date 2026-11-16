import { MessageCircle, Users, ListVideo, ChevronRight, X } from 'lucide-react';
import { useRoom, type PanelTab } from '@/store/room';
import { ChatTab } from './ChatTab';
import { PeopleTab } from './PeopleTab';
import { QueueTab } from './QueueTab';
import { cn } from '@/lib/utils';

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

  if (!panelOpen) return null;

  return (
    <aside className="relative flex h-full w-80 lg:w-88 flex-col rounded-3xl glass-strong border border-white/10 shadow-float overflow-hidden z-20">
      {/* Tabs Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 bg-ink-950/40">
        <div className="flex items-center gap-1">
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
          className="grid h-8 w-8 place-items-center rounded-xl text-white/50 hover:bg-white/10 hover:text-white transition"
          title="Collapse panel"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'chat' && <ChatTab />}
        {activeTab === 'people' && <PeopleTab />}
        {activeTab === 'queue' && <QueueTab />}
      </div>
    </aside>
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
        'relative flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition',
        active
          ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/10'
          : 'text-white/50 hover:bg-white/5 hover:text-white/80',
      )}
    >
      <Icon size={14} className={active ? 'text-coral-400' : ''} />
      <span>{label}</span>
      {badge !== undefined && (
        <span
          className={cn(
            'ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold',
            active ? 'bg-coral-500 text-white' : 'bg-white/10 text-white/60',
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
