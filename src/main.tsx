import React, { Suspense, lazy, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { startCompetitionRefresh } from './state/competitionStore';

const PlannerApp = lazy(() => import('./planner/PlannerApp'));
const DataSourcesPage = lazy(() => import('./pages/DataSourcesPage'));
const getRoute = () => window.location.hash.startsWith('#/alueet') ? 'planner'
  : window.location.hash === '#/datalahteet' ? 'dataSources' : 'dashboard';

function Root() {
  useEffect(startCompetitionRefresh, []);
  const [route, setRoute] = useState(getRoute);
  useEffect(() => {
    let previousRoute = getRoute();
    const onChange = () => {
      const nextRoute = getRoute();
      setRoute(nextRoute);
      if (nextRoute !== previousRoute) window.scrollTo(0, 0);
      previousRoute = nextRoute;
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  useEffect(() => {
    const title = route === 'planner' ? 'Aluesuunnittelu' : route === 'dataSources' ? 'Sovellus ja datalähteet' : 'Seurakartta';
    document.title = `${title} — Suomen frisbeegolfseurat`;
  }, [route]);
  if (route === 'dashboard') return <App />;
  return (
    <Suspense fallback={<div className="loading-state" role="status"><span className="loading-spinner" />{route === 'planner' ? 'Ladataan aluesuunnittelua…' : 'Ladataan sovelluksen esittelyä ja datalähteitä…'}</div>}>
      {route === 'planner' ? <PlannerApp /> : <DataSourcesPage />}
    </Suspense>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
