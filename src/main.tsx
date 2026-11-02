import React, { Suspense, lazy, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { startCompetitionRefresh } from './state/competitionStore';

const PlannerApp = lazy(() => import('./planner/PlannerApp'));
const isPlannerRoute = () => window.location.hash.startsWith('#/alueet');

function Root() {
  useEffect(startCompetitionRefresh, []);
  const [planner, setPlanner] = useState(isPlannerRoute);
  useEffect(() => {
    let previousRoute = isPlannerRoute();
    const onChange = () => {
      const nextRoute = isPlannerRoute();
      setPlanner(nextRoute);
      if (nextRoute !== previousRoute) window.scrollTo(0, 0);
      previousRoute = nextRoute;
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  useEffect(() => { document.title = planner ? 'Aluesuunnittelu — Suomen frisbeegolfseurat' : 'Seurakartta — Suomen frisbeegolfseurat'; }, [planner]);
  if (!planner) return <App />;
  return (
    <Suspense fallback={<div className="loading-state" role="status"><span className="loading-spinner" />Ladataan aluesuunnittelua…</div>}>
      <PlannerApp />
    </Suspense>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
