import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { EvidencePopover } from '@/components/EvidencePopover';
import { Shell } from '@/components/Shell';
import { Toast } from '@/components/Toast';
import { FieldBoard } from '@/features/field/FieldBoard';
import { WellPage } from '@/features/well/WellPage';
import { ScenarioLab } from '@/features/scenario/ScenarioLab';
import { CycleDesigner } from '@/features/optimize/CycleDesigner';
import { Inbox } from '@/features/inbox/Inbox';
import { RiskCenter } from '@/features/risk/RiskCenter';
import { Backtests } from '@/features/backtests/Backtests';
import { DataQuality } from '@/features/quality/DataQuality';
import { ModelHealth } from '@/features/models/ModelHealth';
import { Admin } from '@/features/admin/Admin';
import { NotFound } from './NotFound';
import { RouteError } from './RouteError';

// three.js is large: load the 3D page only when it is opened
const Well3D = lazy(() => import('@/features/well3d/Well3D'));
const lazyPage = (el: JSX.Element) => <Suspense fallback={<div className="skeleton" style={{ height: 620 }} />}>{el}</Suspense>;

function Root() {
  return (
    <Shell>
      <Outlet />
      <EvidencePopover />
      <Toast />
    </Shell>
  );
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <Navigate to="/field" replace /> },
      { path: '/field', element: <FieldBoard /> },
      { path: '/wells', element: <Navigate to="/field" replace /> },
      { path: '/wells/:wellId', element: <WellPage /> },
      { path: '/wells/:wellId/3d', element: lazyPage(<Well3D />) },
      { path: '/wells/:wellId/scenario-lab', element: <ScenarioLab /> },
      { path: '/wells/:wellId/optimize', element: <CycleDesigner /> },
      { path: '/wells/:wellId/optimize/:runId', element: <CycleDesigner /> },
      { path: '/recommendations', element: <Inbox /> },
      { path: '/risk', element: <RiskCenter /> },
      { path: '/backtests', element: <Backtests /> },
      { path: '/data-quality', element: <DataQuality /> },
      { path: '/models', element: <ModelHealth /> },
      { path: '/admin', element: <Admin /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
