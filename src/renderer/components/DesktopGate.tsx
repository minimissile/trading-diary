import type { PropsWithChildren } from 'react';

export function DesktopGate({ children }: PropsWithChildren): React.JSX.Element {
  if (typeof window.desktop === 'undefined') {
    return (
      <main className="renderer-fatal">
        <h1>桌面 API 未就绪</h1>
        <p>preload 脚本可能未正确加载。请关闭应用后重新运行 `npm run dev`。</p>
      </main>
    );
  }

  return <>{children}</>;
}
