import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

import { useUiStore } from './stores/ui-store';
import { tauriApi } from './lib/tauri';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

if (import.meta.env.DEV) {
  (window as any).__QUERY_CLIENT__ = queryClient;
  (window as any).__UI_STORE__ = useUiStore;
  (window as any).useUiStore = useUiStore;
  (window as any).tauriApi = tauriApi;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
