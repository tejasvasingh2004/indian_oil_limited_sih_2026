import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { detectMode } from './api/client';
import { connectEvents } from './api/events';
import './styles/tokens.css';
import './styles/app.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
});

// Pick live backend or browser twin before the first query runs.
detectMode().then((mode) => {
  if (mode === 'live') connectEvents(queryClient);
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </React.StrictMode>,
  );
});
