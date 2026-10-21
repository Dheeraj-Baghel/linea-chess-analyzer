import { useEffect, useState } from 'react';

// Keep the 1440px shell cap. A fourth report column is allowed only when the
// remaining actual CSS-pixel budget still leaves a 480px board + its eval strip.
export function workspaceLayout(width) {
  const content = Math.min(width, 1440) - 48;
  const reportBoardBudget = content - 228 - 260 - 300 - 3 * 16 - 32;
  return { width, desktop: width >= 1024, rail: width >= 1280, tablet: width >= 768 && width < 1024, phone: width < 768, reportColumn: width >= 1600 && reportBoardBudget >= 480, reportBoardBudget };
}
export function useWorkspaceLayout() {
  const [layout, setLayout] = useState(() => workspaceLayout(window.innerWidth));
  useEffect(() => {
    const update = () => setLayout(workspaceLayout(window.innerWidth));
    window.addEventListener('resize', update); return () => window.removeEventListener('resize', update);
  }, []);
  return layout;
}
