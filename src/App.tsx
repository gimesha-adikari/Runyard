import { CommandPalette } from './components/CommandPalette';
import { ToastContainer } from './components/ToastContainer';
import { DesktopLayout } from './components/DesktopLayout';

export default function App() {
  return (
    <div className="flex h-screen w-full bg-zinc-950 text-zinc-100 overflow-hidden font-sans selection:bg-emerald-500/30">
      <DesktopLayout />
      <CommandPalette />
      <ToastContainer />
    </div>
  );
}
