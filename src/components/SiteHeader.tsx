import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export function SiteHeader({ page = 'dashboard' }: { page?: 'dashboard' | 'dataSources' }) {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('seurakartta-theme') !== 'light');

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    localStorage.setItem('seurakartta-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const onDashboard = page === 'dashboard';
  return (
    <header className="topbar">
      <a className="brand" href={import.meta.env.BASE_URL} aria-label="Seurakartta Suomen frisbeegolfseurat — etusivu">
        <span className="brand-mark"><span /></span>
        <span>SEURA<span className="brand-light">KARTTA</span>{' '}<small>SUOMEN FRISBEEGOLFSEURAT</small></span>
      </a>
      <nav className="top-nav" aria-label="Päänavigaatio">
        <a className={onDashboard ? 'active' : undefined} href="#kartta">Kartta</a>
        <a href="#tilastot">Tilastot</a>
        <a href="#seura-matriisi">Seura matriisi</a>
        <a href="#/alueet"><span className="nav-long">Aluesuunnittelu</span><span className="nav-short">Alueet</span></a>
        <a className={!onDashboard ? 'active' : undefined} aria-current={!onDashboard ? 'page' : undefined} href="#/datalahteet">Datalähteet</a>
      </nav>
      <button className="theme-toggle" onClick={() => setDarkMode((mode) => !mode)} aria-label={darkMode ? 'Vaihda vaaleaan tilaan' : 'Vaihda tummaan tilaan'}>
        {darkMode ? <Sun size={17} /> : <Moon size={17} />}<span>{darkMode ? 'Vaihda vaaleaan tilaan' : 'Vaihda tummaan tilaan'}</span>
      </button>
    </header>
  );
}
