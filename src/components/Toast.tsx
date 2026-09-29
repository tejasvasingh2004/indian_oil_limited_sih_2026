import { useUi } from '@/store/ui';

export function Toast() {
  const toast = useUi((s) => s.toast);
  if (!toast) return null;
  return <div className="toast card strong" role="status">{toast}</div>;
}
