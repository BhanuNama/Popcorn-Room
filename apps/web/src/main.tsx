import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { MotionConfig } from 'motion/react';
import { TooltipProvider } from '@/components/ui';
import Landing from '@/pages/Landing';
import RoomPage from '@/pages/RoomPage';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* "user" = respect the OS "reduce motion" setting everywhere */}
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/r/:roomId" element={<RoomPage />} />
            <Route path="*" element={<Landing />} />
          </Routes>
        </BrowserRouter>
        <Toaster
          position="top-center"
          richColors
          closeButton
          toastOptions={{ className: 'font-sans' }}
        />
      </TooltipProvider>
    </MotionConfig>
  </StrictMode>,
);
