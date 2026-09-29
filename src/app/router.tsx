import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { EvidencePopover } from '@/components/EvidencePopover';
import { Toast } from '@/components/Toast';
import { FieldBoard } from '@/features/field/FieldBoard';
import { WellConsole } from '@/features/well/WellConsole';
import { ScenarioLab } from '@/features/scenario/ScenarioLab';
import { CycleDesigner } from '@/features/optimize/CycleDesigner';
import { Inbox } from '@/features/inbox/Inbox';
import { RiskCenter } from '@/features/risk/RiskCenter';
import { Backtests } from '@/features/backtests/Backtests';
import { NotFound } from './NotFound';

function Root() {
  return (
    <>
      <Outlet />
      <EvidencePopover />
      <Toast />
    </>
  );
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <Navigate to="/field" replace /> },
      { path: '/field', element: <FieldBoard /> },
      { path: '/wells', element: <Navigate to="/field" replace /> },
      { path: '/wells/:wellId', element: <WellConsole /> },
      { path: '/wells/:wellId/scenario-lab', element: <ScenarioLab /> },
      { path: '/wells/:wellId/optimize', element: <CycleDesigner /> },
      { path: '/wells/:wellId/optimize/:runId', element: <CycleDesigner /> },
      { path: '/recommendations', element: <Inbox /> },
      { path: '/risk', element: <RiskCenter /> },
      { path: '/backtests', element: <Backtests /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
