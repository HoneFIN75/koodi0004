import { ArrowDown, ArrowRight, BookOpen } from 'lucide-react';
import { applicationOverview as overview } from '../data/applicationOverview';

function goToSection(id: string) {
  const heading = document.getElementById(id);
  heading?.scrollIntoView({ block: 'start' });
  heading?.focus({ preventScroll: true });
}

export function ApplicationIntro() {
  return (
    <>
      <section className="hero data-sources-intro" aria-labelledby="application-title">
        <div className="hero-copy">
          <div className="eyebrow">SEURAKARTTA · TILANNEKUVASTA SUUNNITTELUUN</div>
          <h1 id="application-title">Sovellus ja datalähteet</h1>
          <p>{overview.summary} {overview.introduction}</p>
          <p className="application-value">{overview.value}</p>
          <div className="application-actions">
            <a href="#kartta">Tutustu seurakarttaan <ArrowRight size={16} aria-hidden="true" /></a>
            <button type="button" onClick={() => goToSection('data-sources-title')}>Siirry datalähteisiin <ArrowDown size={16} aria-hidden="true" /></button>
          </div>
        </div>
        <aside className="application-hero-aside">
          <BookOpen size={24} aria-hidden="true" />
          <h2>Yhteinen näkymä seurakenttään</h2>
          <p>{overview.audience}</p>
          <span>Julkinen tarkastelu ilman kirjautumista</span>
        </aside>
      </section>
      <nav className="application-section-nav" aria-label="Sivun sisältö">
        {[['application-overview-title', 'Yleiskuva'], ['application-workflows-title', 'Käyttöprosessi'], ['application-modules-title', 'Moduulit'], ['application-benefits-title', 'Hyödyt'], ['data-sources-title', 'Datalähteet']].map(([id, label]) => (
          <button type="button" key={id} onClick={() => goToSection(id)}>{label}</button>
        ))}
      </nav>
    </>
  );
}

export function ApplicationOverview() {
  return (
    <div className="application-overview">
      <section className="application-section" aria-labelledby="application-overview-title">
        <div className="section-heading"><div><div className="eyebrow">MIKÄ JA KENELLE</div><h2 id="application-overview-title" tabIndex={-1}>Sovelluksen yleiskuva</h2></div></div>
        <div className="application-purpose panel">
          <div><h3>Yhteenveto</h3><p>{overview.summary} {overview.introduction}</p></div>
          <div><h3>Sovelluksen tarkoitus</h3>{overview.purpose.map((text) => <p key={text}>{text}</p>)}</div>
        </div>
        <h3 className="application-subheading">Kohderyhmät</h3>
        <div className="application-card-grid">
          {overview.audiences.map(({ title, description, icon: Icon }) => (
            <article className="panel application-card" key={title}><span className="section-icon"><Icon size={20} aria-hidden="true" /></span><h4>{title}</h4><p>{description}</p></article>
          ))}
        </div>
        <p className="application-note">{overview.roleNote}</p>
        <h3 className="application-subheading">Keskeiset ominaisuudet</h3>
        <div className="application-card-grid">
          {overview.features.map(({ title, description, benefit, icon: Icon }) => (
            <article className="panel application-card" key={title}><span className="section-icon"><Icon size={20} aria-hidden="true" /></span><h4>{title}</h4><p>{description}</p><p className="application-card-benefit">{benefit}</p></article>
          ))}
        </div>
      </section>

      <section className="application-section" aria-labelledby="application-workflows-title">
        <div className="section-heading"><div><div className="eyebrow">TUTKI, VERTAA JA SUUNNITTELE</div><h2 id="application-workflows-title" tabIndex={-1}>Mitä sovelluksella voi tehdä</h2><p>Julkisesta tilannekuvasta yhteisen aluesuunnitelman arviointiin.</p></div></div>
        <div className="panel application-capabilities"><h3>Käytännön mahdollisuudet</h3><ul>{overview.capabilities.map((text) => <li key={text}>{text}</li>)}</ul></div>
        <h3 className="application-subheading">Käyttöprosessi</h3>
        <ol className="application-process">
          {overview.steps.map((step, index) => <li className="panel" key={step.title}><span className="application-step" aria-hidden="true">{index + 1}</span><div><h4>{step.title}</h4><p>{step.description}</p></div></li>)}
        </ol>
      </section>

      <section className="application-section" aria-labelledby="application-modules-title">
        <div className="section-heading"><div><div className="eyebrow">SOVELLUKSEN RAKENNE</div><h2 id="application-modules-title" tabIndex={-1}>Keskeiset moduulit</h2><p>Keskeiset näkymät ja niiden käyttäjät tuotantoympäristössä.</p></div></div>
        <div className="application-card-grid application-module-grid">
          {overview.modules.map(({ title, description, audience, icon: Icon }) => (
            <article className="panel application-card" key={title}><span className="section-icon"><Icon size={20} aria-hidden="true" /></span><h3>{title}</h3><p>{description}</p><p className="application-audience"><strong>Käyttäjäryhmä</strong><span>{audience}</span></p></article>
          ))}
        </div>
      </section>

      <section className="panel application-benefits application-section" aria-labelledby="application-benefits-title">
        <div className="section-heading"><div><div className="eyebrow">KÄYTTÄJÄLLE TUOTETTAVA ARVO</div><h2 id="application-benefits-title" tabIndex={-1}>Hyödyt käyttäjälle</h2><p>Vähemmän erillisiä laskentavaiheita, enemmän yhteistä ymmärrystä.</p></div></div>
        <div className="application-card-grid">
          {overview.benefits.map(({ title, description, icon: Icon }) => (
            <article className="application-card" key={title}><span className="section-icon"><Icon size={20} aria-hidden="true" /></span><h3>{title}</h3><p>{description}</p></article>
          ))}
        </div>
        <p className="application-note">{overview.benefitNote}</p>
      </section>
    </div>
  );
}

export function ApplicationIntegrations() {
  return (
    <section className="panel application-integrations" aria-labelledby="application-integrations-title">
      <h3 id="application-integrations-title">Integraatiot ja palvelut</h3>
      <dl>{overview.integrations.map((item) => <div key={item.title}><dt>{item.title}</dt><dd>{item.description}</dd></div>)}</dl>
      <p className="application-note">{overview.integrationNote}</p>
    </section>
  );
}
