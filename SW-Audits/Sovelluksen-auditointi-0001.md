# Yhteenveto

- **Auditoinnin päivämäärä:** 2026-11-03
- **Repositorion nimi:** `HoneFIN75/koodi0004` (Seurakartta)
- **Auditoinnin versio:** 0001
- **Julkaisurajaus:** raportti sijaitsee `SW-Audits`-hakemistossa repositorion lähdekoodin ulkopuolisessa sisältöpolussa. Deploy-workflow siirtää vain `dist/`-hakemiston, eikä raporttia julkaista www-palvelimelle.
- **Auditoitu lähdekoodin commit:** `62805321a73ea8402b677f7cdacef94586cc3fc9` (PR #81:n sisältö; PR yhdistetty `main`-haaraan auditoinnin aikana)
- **Auditoinnin laajuus:** TypeScript/React-asiakas, PHP-rajapinnat ja CLI-työkalut, data, build- ja deploy-määritykset, testit, dokumentaatio ja riippuvuudet.
- **Kokonaisarvosana:** Tyydyttävä perusta, parannettavaa tuotantovarmuudessa ja tiedon luotettavuudessa.
- **Terveyspisteet:** **70/100**. Arvio on laadullinen, ei staattisen analyysityökalun tulos. Se painottaa tietoturvan, testauksen, julkaisun, ylläpidettävyyden ja tiedonhallinnan näyttöä.

Arvioinnissa tarkastettiin koko jäljitetty lähdekoodipuu, keskeiset aineistot, CI- ja deploy-workflow't, dokumentit sekä testit. Repositorion nykyinen testaus ja tietoturvan peruskontrollit ovat vahvuuksia: TypeScript on strict-tilassa, PHP:n käyttöoikeusrajat ovat palvelimella, seuratietojen kirjoitus validoidaan ja lukitaan, ja testit kattavat laajasti tietojen käsittelyä sekä selaimen käyttäjäpolkuja. `npm audit` ilmoitti auditointihetkellä nolla haavoittuvuutta. Tuotantoriippuvuuksien tila ei kuitenkaan takaa tulevien versioiden turvallisuutta.

**Tärkeimmät korjaustarpeet:** selaintesti epäonnistui paikallisessa toistossa; julkisen seurarajapinnan päivitysaika on pyynnön aika eikä lähdedatan muutos; deploy ei ole kytketty testien onnistumiseen eikä vaihda julkaisuversiota atomisesti; kirjautumisrajoituksen tiedosto voi kasvaa eri IP-osoitteista tulevista yrityksistä; ja kartta-/datasetidokumentaatiossa on vanhentunutta tietoa.

Auditointihetken validointi:

- `npm run build`: onnistui; Vite raportoi 529,01 kB minifioidun etusivun JS-chunkin (160,58 kB gzipattuna), joka ylittää 500 kB:n varoitusrajan.
- `npm test`: **86/86 testiä läpäisi**.
- `npm run test:e2e`: build onnistui, **57/58 selaintestiä läpäisi**. Sama suunnitelman migraatiotesti epäonnistui myös erillisessä toistossa.
- GitHub Actionsin viimeisin `main`-haaran validointiajo auditointihetkellä oli onnistunut. Paikallinen toistotulos ja Actions-tulos poikkeavat, joten testin determinismi pitää korjata eikä vihreää CI-ajokertaa pidä tulkita ristiriidan selvitykseksi.
- `npm audit`: tuotanto- ja kehitysriippuvuuksissa 0 ilmoitettua haavoittuvuutta.
- GitHubin haarasuojausten lukeminen ei onnistunut session käyttöoikeuksilla (HTTP 403). Haarasuojausten olemassaoloa tai vaatimuksia ei siksi päätellä.

**Auditoinnin rajaus:** tuotantopalvelimeen, sen asetuksiin, palautuksiin, verkko-telemetriaan tai tosielämän käyttökuormaan ei ollut pääsyä. Löydökset perustuvat repositorioon, paikalliseen buildiin/testeihin sekä saatavilla olleeseen GitHub Actions -ajohistoriaan. Vakavaa aktiivista hyväksikäyttöhaavoittuvuutta ei vahvistettu.

## Pisteytyksen peruste

| Osa-alue | Pisteet | Peruste |
|---|---:|---|
| Arkkitehtuuri | 74 | Selkeät data-, palvelu-, komponentti- ja tilakerrokset; PlannerApp keskittää silti paljon vastuuta. |
| Koodin laatu | 75 | Strict TypeScript ja palvelurajojen validointi; kartta-/tietoputken osittainen hiljainen hylkäys vaatii parannusta. |
| Tietoturva | 79 | HTTPS, CSRF, roolit, session suojaus, salasanatiivisteet ja JSON-validointi; automaattinen skannaus ja limiterin rajaus puuttuvat. |
| Suorituskyky | 73 | Nykyiset aineistot ovat pieniä ja testit kattavat 600 seuraa; etusivun JS-chunk ylittää Viten varoitusrajan. |
| Testaus | 72 | 86 yksikkö- ja 58 selaintestiä, mutta yksi toistettava paikallinen E2E-epäonnistuminen, yksi selainmoottori ja ei kattavuusraporttia. |
| DevOps/SRE | 55 | CI on olemassa; tuotantodeployltä puuttuvat testigating, atominen julkaisu, smoke check ja rollback. |
| Datahallinta | 64 | Datalähteiden rajauksia kuvataan hyvin; kilpailu- ja väestöaineistojen alkuperä/lisenssi puuttuu ja yksi lähdeaikaleima on väärä. |
| Dokumentaatio | 70 | README ja aineistoraportit ovat laajoja; README sisältää karttakerrosta koskevan vanhentuneen väitteen. |

# Auditoinnin Keskeiset Havainnot

## 1. Executive Summary

Seurakartta on aktiivisesti kehitetty React/Vite-sovellus, jossa on julkinen seurakojelauta, kilpailuanalyysi, väestö- ja kuntatiedot, Leaflet-kartat sekä roolisuojattu aluesuunnittelu. Tuotannon hallitut seuratiedot ja suunnitelmat tallennetaan PHP:n kautta yksityisiin JSON-tiedostoihin. Tässä kokoluokassa ratkaisu on ymmärrettävä ja kohtuullisen kevyt: kartta-aineistossa on 308 kuntaa, kilpailulähteessä 2 292 riviä ja kehitysympäristön seurafiksuurissa 185 seuraa.

Repositoriossa on testejä palveluille, PHP-rajapinnoille ja selainpoluille. Tietoturvan kannalta näkyvissä on useita hyviä kontrollikerroksia: writer/admin-erottelu, CSRF-token, HTTPS-vaatimus kirjoituksissa ja kirjautumisessa, `HttpOnly`/`Secure`/`SameSite=Strict`-istuntoevästeet, salasanatiivisteet ja revision-tarkistus samanaikaisiin kirjoituksiin. Staattinen seurafiksuuri ei sisällä kontaktikenttiä eikä tarkastelluista tiedostoista löytynyt salaisuuksia.

Kokonaisriski painottuu tuotannon palautettavuuteen, julkaisuputken riippumattomuuteen testituloksista, lähdetiedon luotettavuuteen ja ylläpidettävyyteen. Ensin kannattaa palauttaa toistettava vihreä testipohja, korjata väärä päivitysaikaleima sekä rajata kirjautumisyritysten tallennus. Sen jälkeen vahvistetaan CI/deploy-erottelu, atominen julkaisu ja palautusmenettely. Refaktorointi ja skaalautuminen ovat seuraavia vaiheita, eivät tämänhetkisen sovelluskoon vuoksi välittömiä uudelleenkirjoitustarpeita.

## 2. Arkkitehtuurin arviointi

- **Rakenne:** `src/data`, `src/services`, `src/state`, `src/models`, `src/components`, `src/planner` ja `server` erottavat datan, laskennan, käyttöliittymän ja palvelinrajat kohtuullisen hyvin. React on tyypitetty strict-tilassa; Vite rakentaa SPA:n.
- **Näkymät ja navigaatio:** `src/main.tsx` valitsee hash-reitin. Aluesuunnittelu ja datalähdesivu ladataan laiskasti, mutta etusivun analytiikka ja kartta sisältyvät suureen pää-chunkiin.
- **Tilanhallinta:** kilpailuvuodet ja kilpailudata jaetaan Zustand-storella; alueasiakirjan historia ja tallennus ovat keskitettyjä `plannerStore`/`persistenceService`-kerroksessa. Seurakartalla on paikallista näkymätilaa. Rajat ovat tarkoituksenmukaisia, mutta `PlannerApp` kokoaa autentikoinnin, datalatauksen, suodatuksen, analytiikan, kartan, reitit ja tuonnin/viennin samaan komponenttiin.
- **Palvelin:** PHP käsittelee auth-session, CSRF:n, roolit, kirjautumisrajoituksen sekä alue- ja seuratietojen JSON-tallennuksen. Tiedostolukot, revision-tarkistus ja atomiset rename-kirjoitukset estävät useita tavallisia kirjoitusristeymiä. Aluesuunnitelman palvelinvalidointi on kuitenkin paljon asiakkaan normalisointia pintapuolisempi.
- **Laajennettavuus:** kilpailut, seurat, kunnat, väestö, maakunnat ja suunnittelualueet ovat eri aineistoja ja niiden laskentapalvelut ovat pääosin uudelleenkäytettäviä. Kilpailuaineiston kuntaliitos perustuu edelleen nimeen, ei pysyvään kuntakoodiin.
- **Kytkentä:** `PlannerApp.tsx` on keskeisin UI-orchestrator. PHP:n planner-endpoint on myös yhteinen reitti seurapalvelun kautta, joten rajapinnan ylläpidossa pitää säilyttää yhteiset yksityisen hakemiston, HTTPS:n ja session tarkistukset.

## 3. Tietoturvan arviointi

- **Vahvuudet:** roolit tarkistetaan palvelimella; adminin seuramuutokset vaativat HTTPS:n, CSRF:n ja revision; session tunniste uusitaan kirjautumisessa; salasana tallennetaan tiivisteenä; yksityiset tiedostot rajataan web-juuren ulkopuolelle ja tiedosto-oikeudet tarkistetaan. Seurapalvelun payload rajataan 10 MiB:iin ja 10 000 tietueeseen, ja kentät validoidaan.
- **Vahvistettu ongelma:** `login-attempts.json` säilyttää eri IP-/roolitunnisteiden vanhoja yrityksiä pysyvästi, jos niitä ei käydä samalla tunnisteella tyhjentämässä. Pyynnöt lukevat ja kirjoittavat koko tiedoston, jolloin hajautettu yritysliikenne kasvattaa tiedostoa ja kustannusta.
- **Tietojen eheys:** planner-palvelin tarkistaa dokumentista vain version, aktiivisen skenaarion merkkijonon ja ei-tyhjän skenaariotaulukon. Sisäisiä alueita, tunnisteiden viittauksia tai numeerisia rajoja ei validoida samalla tavalla kuin asiakkaan dokumenttinormalisoinnissa.
- **Tietoturva-automaatio:** workflow ei aja riippuvuus- tai staattista tietoturvaskannausta. Auditointipäivän `npm audit` ei löytänyt advisoreita; se on hetkikuva.
- **Salaisuudet ja henkilötiedot:** tarkastetusta tracked-file-listasta ei löytynyt `.env`-/credential-tiedostoja. `jsondb/seurat.json` sisältää 185 kehitysseuraa, eikä näissä riveissä ole kontaktikenttiä. Tuotannon yksityiset yhteystiedot ovat erillisessä palvelinvarastossa README-kuvauksen mukaan; tuotantovarastoa ei auditoitu.
- **Rajaamaton vastuu:** yhteiset Writer/Admin-tunnukset on dokumentoitu. Palvelinmallissa ei tallenneta muutoksen tekijän yksilöivää identiteettiä, joten tapahtumien jäljitettävyys ei ole henkilökohtainen.
- **Arvio:** repositorion perusteella ei vahvistettu kriittistä hyväksikäyttöhaavoittuvuutta. Brute-force-tiedoston kasvu ja syvävalidoinnin puute ovat konkreettiset korjauskohteet.

## 4. Suorituskyvyn arviointi

- Tuotantobuildin pää-chunk on 529,01 kB minifioituna ja 160,58 kB gzipattuna; Vite tuottaa tästä varoituksen. Planner on omassa lazy-chunkissaan, mutta etusivun käyttämät analytiikka- ja karttakomponentit kasvattavat aloituslatausta.
- Kuntaraja-aineisto on noin 190 kB, kilpailu-JSON noin 236 kB, väestödata noin 20 kB ja seurojen kehitysfixture noin 36 kB. Nykyiset aineistot ovat kohtuullisia.
- `tests/browser/dashboard.spec.ts` testaa 600 seuran tilannetta; se ei osoita palvelimen 10 000 seuran ylärajan tai paljon suurempien kilpailuaineistojen suorituskykyä.
- Seurarekisterin API lukee ja validoi koko JSON-tiedoston jokaisessa pyynnössä; jokainen Admin-päivitys kirjoittaa koko tiedoston uudelleen lukon alla. Tämä on nykyisellä 185 kehitysseuran koolla yksinkertainen ratkaisu, mutta kasvu on lineaarisesti sidottu tiedostokokoon ja kirjoitukset sarjallistuvat.
- Kartat käsittelevät kuntageometrioita Leaflet-tasoina. Kilpailukerroksen kuntamäärä on tällä hetkellä rajallinen, mutta layer- ja markkerimäärät tulee mitata ennen uusien suurten kartta-aineistojen lisäämistä.

## 5. Teknisen velan arviointi

- `PlannerApp.tsx` on 651 riviä ja sisältää eri vastuualueita. `ClubsAdmin.tsx` on 414 riviä, `RegionMap.tsx` 318, `App.tsx` 305 sekä globaalit tyylit yhteensä noin 797 riviä kahdessa päätyylitiedostossa. Pelkkä rivimäärä ei todista virhettä; `PlannerApp`-komponentin vastuiden määrä tekee muutosten vaikutusalasta kuitenkin laajan.
- `server/planner.php` sisältää 541 riviä: auth, sessio, rate limit, tallennus ja aluesuunnitelman HTTP-reititys ovat yhdessä tiedostossa. Seurapalvelu on jo erotettu erilliseen `clubs-api.php`-tiedostoon.
- Salasanapolitiikka on toteutettu sekä CLI-alustuksessa että salasananvaihdossa. Säännöt vastaavat toisiaan nyt, mutta niiden erkaneminen voi aiheuttaa käytössä epäjohdonmukaisen rajan.
- `npm`-skripteissä ei ole lint-, formaatti- tai coverage-komentoa. TypeScript-build tarkistaa tyypit ja nimeämättömät symbolit; puuttuva coverage-mittaus jättää testien kattavuuden kehitystrendin tuntemattomaksi.
- Tunnettu vanhentunut dokumentaatio on README:n väite, ettei kilpailutietoa käytetä karttakerroksissa. Muuta selvää käyttämätöntä riippuvuutta ei tässä auditoinnissa vahvistettu.

## 6. Ylläpidettävyyden arviointi

Koodi sisältää nimettyjä palveluita, tyypitettyjä malleja ja laajan joukko testejä. Tietovirtojen periaatteet, kuten puuttuvan väestötiedon käsittely ja kilpailurivien laskenta, on dokumentoitu tavallista tarkemmin. Ylläpidettävyyttä heikentävät monoliittinen PlannerApp, puuttuvat coverage-trendit, tietolähteen epäselvä provenienssi ja havaittu ristiriita käyttöliittymän sekä README:n välillä. Muutosohjeissa tulee säilyttää suomenkielinen käyttöliittymäteksti ja datan lähderajojen näkyvyys.

## 7. Skaalautuvuuden arviointi

Nykyinen staattinen SPA + PHP + JSON-ratkaisu on perusteltu nykyisille aineistomäärille. Rajat ovat eksplisiittisiä (`10 MiB`, enintään `10 000` seurarekisteririviä, plannerissa enintään 10 varmuuskopiota), mutta liikenne-/kokorajojen mitoitusta tai kasvukäyrää ei ole mitattu. Ennen tietokantaan siirtymistä kannattaa lisätä baseline-kuormitustestit ja hälytysrajat. Kuntakoodi kannattaa ottaa mukaan kilpailevien aineistojen liitosavaimeksi, koska nimi voi muuttua tai esiintyä eri kieliasussa.

## 8. Siivousmahdollisuudet

- Päivitä README:n kilpailukerrosta koskeva vanhentunut kappale.
- Älä poista tai siivoa `dist/`, `node_modules/`, `test-results/` tai `tsconfig.tsbuildinfo`: ne ovat `.gitignore`-rajauksissa eivätkä osa seurattua lähdekoodia.
- Riippuvuusluettelosta ei nimetty poistettavia paketteja, koska käyttämättömyyttä ei vahvistettu.
- Säilytä nykyiset datan laadun ja tietosuojan testit; priorisoi pipeline- ja lähdemetadata-puute ennen kosmeettista siivousta.

# Top 25 Findings

Auditoinnissa vahvistui **24 merkityksellistä löydöstä**; listaa ei täydennetä näyttöä vailla olevilla havainnoilla. Severity tarkoittaa vaikutusta tässä repositoriossa: Korkea = korjaa ennen kuin luottaa kyseiseen toimintaan, Keskitaso = priorisoitu parannus, Matala = rajattu ylläpidettävyys-/kasvuriski.

### F-01 — Aluesuunnitelman migraation E2E-testi epäonnistuu paikallisessa toistossa - Status: Done 3.11.2026

- **Severity / kategoria:** Keskitaso — Testaus ja toimitusvarmuus
- **Tarkka sijainti:** `tests/browser/planner.spec.ts:517–545`; `src/App.tsx:128–130`; `src/planner/PlannerApp.tsx:151–153`
- **Kuvaus ja näyttö:** testissä avataan ensin etusivu, jonka `App` alustaa `plannerStore`-storella, ja vasta sen jälkeen lisätään suunnitelma IndexedDB:hen. Store on jo alustettu ennen migraation tunnistusta. Paikallinen koko selaintestiajo epäonnistui rivillä 544, ja testi epäonnistui myös yksittäisenä toistona; GitHub Actionsin viimeisin ajo oli vihreä.
- **Tekninen vaikutus:** testi ei ole ympäristöjen välillä deterministinen eikä luotettavasti varmista migraatiopolun väitettä.
- **Liiketoimintavaikutus:** regressio voi jäädä huomaamatta tai CI:n tuloksiin ei voi luottaa.
- **Korjaus:** rakenna fixture niin, että IndexedDB on alustettu ennen planner-storen ensikäynnistystä; lisää eksplisiittinen odotus/valmiustila ja toista sama testitapa useita kertoja.
- **Arvioitu työmäärä:** 0,5–1 työpäivä.

### F-02 — Seuradatan päivitysaikaleima kuvaa kyselyä, ei aineiston muutosta

- **Severity / kategoria:** Keskitaso — Data ja luotettavuus
- **Tarkka sijainti:** `server/clubs-api.php:216–223`; `src/data/clubRepository.ts:52–56, 125`; `src/services/dataSourceService.ts:23–31`; `src/pages/DataSourcesPage.tsx:33–39`
- **Kuvaus ja näyttö:** API asettaa `metadata.generatedAt`-arvoksi `gmdate('c')` jokaisessa GET-pyynnössä. Asiakas käsittelee arvon lähteen `lastUpdatedAt`-aikana ja käyttöliittymä näyttää sen “Viimeisin päivitys” -kentässä.
- **Tekninen vaikutus:** jokainen luku tuottaa uuden aikaleiman vaikka `clubs.json` ei olisi muuttunut.
- **Liiketoimintavaikutus:** käyttäjä voi tulkita muuttumattoman aineiston juuri päivitetyksi ja tehdä päätöksiä väärän ajantasaisuuskäsityksen pohjalta.
- **Korjaus:** tallenna todellinen lähdeversion päivitysaika kirjoituksen yhteydessä tai palauta tiedoston luotettava muutosmetadata; pidä pyyntöaika ja lähteen päivitysaika eri kenttinä.
- **Arvioitu työmäärä:** 1–2 työpäivää.

### F-03 — Deploy-workflow ei odota testien onnistumista

- **Severity / kategoria:** Keskitaso — DevOps
- **Tarkka sijainti:** `.github/workflows/ci.yml:3–28`; `.github/workflows/deploy.yml:3–7, 39–43`
- **Kuvaus ja näyttö:** CI ja deploy käynnistyvät erillisinä workflow'ina `main`-pushista. Deploy suorittaa `npm ci` ja `npm run build`, mutta ei `npm test`- tai selaintestejä eikä riipu CI-workflow'n onnistumisesta. Haarasuojausten vaatimuksia ei voitu tarkistaa.
- **Tekninen vaikutus:** koodi voidaan lähettää tuotantoon samalla, kun testit ovat käynnissä tai epäonnistuneet; ulkoinen haarasuojaus voi pienentää riskiä, mutta sitä ei vahvistettu.
- **Liiketoimintavaikutus:** testivirhe ei automaattisesti estä tuotantopäivitystä.
- **Korjaus:** tee julkaisu riippuvaiseksi vaaditusta onnistuneesta validointijonosta tai käytä hyväksytyn commitin deploy-workflow'ta; dokumentoi myös haarasuojausten asetukset.
- **Arvioitu työmäärä:** 1–2 työpäivää.

### F-04 — Tuotantojulkaisu kirjoitetaan suoraan aktiiviseen hakemistoon

- **Severity / kategoria:** Keskitaso — SRE ja jatkuvuus
- **Tarkka sijainti:** `.github/workflows/deploy.yml:12–14, 91–111`
- **Kuvaus ja näyttö:** deploy peruuttaa käynnissä olevan saman ryhmän ajon (`cancel-in-progress: true`) ja synkronoi `dist/`-sisällön suoraan tuotantopolkuun `rsync --delete` -valitsimella.
- **Tekninen vaikutus:** keskeytys tai siirron aikainen virhe voi jättää aktiivisen tiedostopuun osittaiseksi; poistot tapahtuvat ennen kuin uusi julkaisu on todettu toimivaksi.
- **Liiketoimintavaikutus:** käyttäjille voi näkyä tilapäinen virhetila ja aiempaan toimivaan versioon palaaminen vaatii manuaalityötä.
- **Korjaus:** rakenna versionoidut julkaisut erilliseen hakemistoon ja vaihda aktiivinen release atomisesti; peruuta vain vanhentunut jonotettu julkaisu, älä käynnissä olevaa aktivointia. Säilytä vähintään yksi edellinen toimiva release.
- **Arvioitu työmäärä:** 3–5 työpäivää.

### F-05 — Deploy ei tarkista tuotannon toimivuutta eikä tarjoa koodattua rollbackia

- **Severity / kategoria:** Keskitaso — SRE ja palautuminen
- **Tarkka sijainti:** `.github/workflows/deploy.yml:91–114`
- **Kuvaus ja näyttö:** onnistunut `rsync` johtaa suoraan ilmoitukseen “Deployment completed successfully.” Workflow ei tee HTTP-smoke checkiä, version tarkistusta tai rollbackia.
- **Tekninen vaikutus:** siirron onnistuminen sekoittuu sovelluksen toimivuuteen; väärä document root, PHP-konfiguraatio tai puuttuva tiedosto jää havaitsematta.
- **Liiketoimintavaikutus:** epäonnistunut deploy voidaan raportoida onnistuneeksi eikä palautumisreitti ole automatisoitu.
- **Korjaus:** tarkista julkaisun version/health-endpointin HTTP-vastaus ja kriittiset API-reitit; palauta edellinen release, jos check ei onnistu.
- **Arvioitu työmäärä:** 2–4 työpäivää.

### F-06 — Kirjautumisrajoituksen JSON voi kasvaa pysyvästi eri IP-osoitteista

- **Severity / kategoria:** Keskitaso — Tietoturva ja resurssien hallinta
- **Tarkka sijainti:** `server/planner.php:379–438`, erityisesti `415–431`
- **Kuvaus ja näyttö:** vanhat aikaleimat suodatetaan vain käsiteltävän fingerprintin listasta. Muille fingerprint-avaimille tehdään vain tyhjän listan poisto. Siksi eri IP-osoitteista tehdyt epäonnistuneet kirjautumiset voivat jäädä tiedostoon, vaikka niiden 15 minuutin aikaraja on umpeutunut.
- **Tekninen vaikutus:** jokainen yritys lukee, dekoodaa, koodaa ja kirjoittaa koko kasvavaa tiedostoa lukon alla.
- **Liiketoimintavaikutus:** hajautettu kirjautumisyritys voi kasvattaa levynkulutusta ja heikentää tai estää kirjautumisen.
- **Korjaus:** poista jokaisesta fingerprintistä vanhat aikaleimat jokaisella kierroksella, rajaa tietueiden kokonaismäärä ja tiedoston koko sekä harkitse palvelimen/verkkoedge-tason rate limit -suojaa.
- **Arvioitu työmäärä:** 1–2 työpäivää.

### F-07 — Planner API:n palvelinvalidointi tarkistaa dokumentista vain ylimmän tason

- **Severity / kategoria:** Keskitaso — Tietojen eheys ja tietoturva
- **Tarkka sijainti:** `server/planner.php:121–128, 495–508`
- **Kuvaus ja näyttö:** `valid_document` tarkistaa vain version, `activeScenarioId`-merkkijonon ja ei-tyhjän `scenarios`-taulukon. Backupin `id` ja `createdAt` tarkistetaan merkkijonoiksi; nested-document validoidaan samalla pintapuolisella tarkistuksella.
- **Tekninen vaikutus:** virheellinen alue-, skenaario- tai kuntarakenne voidaan tallentaa palvelimelle ja palauttaa kaikille asiakkaille, vaikka selain myöhemmin hylkäisi tai normalisoisi sen.
- **Liiketoimintavaikutus:** yhteinen aluesuunnitelma voi rikkoutua yhden virheellisen writer-pyynnön tai ohjelmistovirheen vuoksi.
- **Korjaus:** määritä versionmukainen palvelinpuolen skeema ja rajat kaikille nested-olioille; validoi aktiivisen skenaarion viite, ID-yksikäsitteisyys, kuntakoodit, määrät ja backupien rakenne.
- **Arvioitu työmäärä:** 3–5 työpäivää.

### F-08 — Seurarekisterin atominen tallennus ei itsessään säilytä palautettavaa edeltävää versiota

- **Severity / kategoria:** Keskitaso — Data recovery
- **Tarkka sijainti:** `server/clubs-api.php:157–170, 255–263`; Admin-vientipolku `src/planner/ClubsAdmin.tsx`
- **Kuvaus ja näyttö:** API korvaa nykyisen `clubs.json`-tiedoston atomisesti uudella versiolla. Repositoriossa ei ole tämän kirjoituksen yhteydessä tehtävää palvelinpuolen version snapshotia. Käyttöliittymä edellyttää nykyisen tiedoston viennin ennen täyttä korvausta, mutta se ei muodosta automaattista palvelinpalautusta tavallisille muutoksille.
- **Tekninen vaikutus:** atomisuus estää osittaisen tiedoston, mutta ei virheellisen hyväksytyn muutoksen aiheuttamaa tietosisällön menetystä.
- **Liiketoimintavaikutus:** ylläpitäjävirheen tai väärän tuonnin palautus riippuu aiemmin ladatusta ulkoisesta varmuuskopiosta.
- **Korjaus:** ota ennen kirjoitusta versionoitu palvelinbackup tai varmista dokumentoitu, salattu ja säännöllisesti palautustestattu ulkoinen backup; lisää palautusohje ja säilytysrajat.
- **Arvioitu työmäärä:** 2–4 työpäivää.

### F-09 — CI:ssä ei ole jatkuvaa riippuvuus- tai lähdekooditurvaskannausta

- **Severity / kategoria:** Keskitaso — Tietoturva ja supply chain
- **Tarkka sijainti:** `.github/workflows/ci.yml:11–28`; `package.json:24–42`
- **Kuvaus ja näyttö:** workflow suorittaa linttaamisen sijaan PHP-syntaksitarkistukset, testit ja selaintestit, mutta ei `npm audit`, CodeQL/SAST- tai vastaavaa skannausta. Auditointihetken käsin ajettu `npm audit` ilmoitti nolla haavoittuvuutta.
- **Tekninen vaikutus:** uudet advisories tai staattisesti havaittavat riskit eivät automaattisesti näy PR:n CI:ssä.
- **Liiketoimintavaikutus:** riippuvuusriskin havaitseminen jää manuaalisen seurannan varaan.
- **Korjaus:** lisää lukitustiedostoon perustuva tuotanto- ja kehitysriippuvuuksien tarkistus sekä rajattu SAST/code-scanning-workflow; määritä poikkeusten omistaja ja vanhenemisaika.
- **Arvioitu työmäärä:** 1–3 työpäivää.

### F-10 — Tuotantoajon logit ja health-signaalit eivät ole repositoriossa määriteltyjä

- **Severity / kategoria:** Keskitaso — SRE ja operointi
- **Tarkka sijainti:** `server/planner.php:4–9` ja API-virhepolut; `.github/workflows/deploy.yml:113–114`
- **Kuvaus ja näyttö:** PHP vastaa JSON-virheillä, mutta tarkastetuissa palvelinpoluissa ei ole rakenteista sovelluslokitusta tai request-id:tä. Deploy tulostaa onnistumisviestin, mutta ei lähetä health- tai virhesignaalia.
- **Tekninen vaikutus:** ylläpitäjä näkee käyttöliittymän virheilmoituksen, mutta ei repositorion perusteella pysty jäljittämään syytä, kestoa tai vaikutuksen laajuutta.
- **Liiketoimintavaikutus:** palautumiseen kuluva aika ja toistuvien ongelmien tunnistaminen heikkenevät.
- **Korjaus:** lisää PII:tä/salasanoja sisältämätön rakenteinen virheloki ja request-id sekä palveluntarjoajalle sopiva health/uptime-seuranta. Älä lokita salasanoja, yhteystietoja tai CSRF-tokeneita.
- **Arvioitu työmäärä:** 2–4 työpäivää.

### F-11 — Etusivun tuotanto-JS ylittää Viten 500 kB:n varoitusrajan

- **Severity / kategoria:** Keskitaso — Suorituskyky
- **Tarkka sijainti:** `src/main.tsx:1–14`; tuotantobuild: `assets/index-DJerdOGO.js` 529,01 kB (160,58 kB gzip)
- **Kuvaus ja näyttö:** onnistunut build raportoi yhden 500 kB:n ylittävän chunkin. Planner ja datalähdesivu ovat lazy-loaded, mutta etusivun riippuvuudet ja näkymät ovat päächunkissa.
- **Tekninen vaikutus:** suurempi alkuperäinen siirto ja JavaScriptin jäsennys-/suorituskustannus hitailla laitteilla.
- **Liiketoimintavaikutus:** ensikäynnin viive voi heikentää kartan käytettävyyttä mobiilissa; toteutunutta käyttäjävaikutusta ei mitattu.
- **Korjaus:** mittaa chunk-analyysillä suurimmat moduulit, lazy-loadaa raskaat analyysit/paneelit tarvittaessa ja aseta seurattava kokobudjetti.
- **Arvioitu työmäärä:** 2–4 työpäivää.

### F-12 — PlannerApp sisältää useita toisistaan erillisiä vastuita

- **Severity / kategoria:** Keskitaso — Arkkitehtuuri ja ylläpidettävyys
- **Tarkka sijainti:** `src/planner/PlannerApp.tsx:97–651` (651 riviä)
- **Kuvaus ja näyttö:** sama komponentti hallitsee datahakuja, authia, tallennusta, suodatusta, aluetoimintoja, näkymävalintoja, kartta-asetuksia ja admin-/raporttinäkymiä.
- **Tekninen vaikutus:** muutosten testaus ja paikantaminen vaativat laajan kontekstin; tilan ja sivuvaikutusten regressioriski kasvaa.
- **Liiketoimintavaikutus:** uusien kerrosten ja analyysien lisääminen hidastuu, vaikka nykyinen toiminnallisuus toimii.
- **Korjaus:** erottele ensin datan/tilan hookit ja selkeästi rajatut näkymät (kartta, navigaatio, auth/toiminnot) muuttamatta käyttäytymistä; säilytä yhteiset palvelut.
- **Arvioitu työmäärä:** 1–2 viikkoa.

### F-13 — Kuntageometrian parseri voi hylätä osia hiljaisesti

- **Severity / kategoria:** Keskitaso — GIS ja datan eheys
- **Tarkka sijainti:** `src/data/municipalityRepository.ts:10–28, 34–58`
- **Kuvaus ja näyttö:** virheelliset renkaat poistetaan, MultiPolygonin virheelliset osat suodatetaan, ja puuttuvat/duplikaattiset featuret ohitetaan ilman hylkäyslaskuria tai varoitusta. Parseri epäonnistuu vasta, jos kelvollisia kuntia ei jää yhtään.
- **Tekninen vaikutus:** osittainen aineisto voi tuottaa onnistuneen latauksen, väärän kokonaispinta-alan tai puuttuvia kuntia.
- **Liiketoimintavaikutus:** aluekattavuus ja karttanäkymä voivat olla väärin ilman näkyvää datavirhettä.
- **Korjaus:** erottele hyväksytyt ja hylätyt kohteet, validoi koordinaattirajat/sulkeutuneet renkaat ja vaadi odotettu feature-määrä tai eksplisiittinen hyväksytty poikkeuslista.
- **Arvioitu työmäärä:** 2–4 työpäivää.

### F-14 — Kuntarajojen uudelleenrakennusskripti ei varmista latauksen tai tuotoksen eheyttä ennen kirjoitusta

- **Severity / kategoria:** Keskitaso — Data engineering
- **Tarkka sijainti:** `scripts/build-municipalities.mjs:5–43`
- **Kuvaus ja näyttö:** URL-latauksesta luetaan `.text()` ilman HTTP-status-/aikarajatarkistusta. Skripti suodattaa geometriaa vain tyypin perusteella ja kirjoittaa kohdetiedoston suoraan; odotettua kuntamäärää, koodien yksikäsitteisyyttä tai koordinaattirakennetta ei tarkisteta ennen korvausta.
- **Tekninen vaikutus:** lähdepalvelun virheellinen JSON tai osittainen vastaus voi johtaa epäselvään virheeseen tai huonon generoidun aineiston julkaisuun.
- **Liiketoimintavaikutus:** kartta- ja aluelaskennan lähtötieto voi muuttua huomaamatta.
- **Korjaus:** tarkista status ja timeout, validoi schema/kuntakoodit/geometriat ja odotettu kattavuus, kirjoita ensin väliaikaistiedostoon ja korvaa lopullinen aineisto vasta tarkistusten jälkeen.
- **Arvioitu työmäärä:** 2–3 työpäivää.

### F-15 — Kilpailu- ja väestöaineistojen alkuperä ja lisenssit ovat selvittämättä

- **Severity / kategoria:** Keskitaso — Data governance
- **Tarkka sijainti:** `src/data/dataSources.ts:25–30, 50–55`; `sovelluksen-esittely.md` integraatiotaulukko
- **Kuvaus ja näyttö:** kilpailulähteen alkuperäistä tuottajaa eikä väestölähteen alkuperäistä julkaisijaa/päiväystä ole nimetty. Kuntarajoilla on sen sijaan Tilastokeskus- ja CC BY 4.0 -tiedot.
- **Tekninen vaikutus:** datan oikeuksia, päivityssykliä ja lähteen luotettavuutta ei voi validoida samalla tavalla kuin kuntarajojen.
- **Liiketoimintavaikutus:** julkaisun oikeusperusta ja analyysien ajantasaisuus jäävät epäselviksi käyttäjille.
- **Korjaus:** selvitä omistaja, alkuperäinen lähde, lisenssi/luovutusehto, viitepäivä, päivitysprosessi ja vastuuhenkilö; dokumentoi tuntemattomat arvot tuntemattomina äläkä päättele niitä.
- **Arvioitu työmäärä:** 2–5 työpäivää (selvitystyön saatavuudesta riippuen).

### F-16 — README väittää kilpailudatan olevan käyttämättä karttatasoissa

- **Severity / kategoria:** Matala — Dokumentaatio
- **Tarkka sijainti:** `README.md:47`
- **Kuvaus ja näyttö:** README sanoo, ettei kilpailudataa käytetä karttaväreihin tai -kerroksiin. Nykyinen `MapView` ja `RegionMap` tarjoavat valinnaisen kilpailumäärätason; auditoinnin commitissa on myös `docs/competition-map-ux-plan.md`, joka kuvaa sitä oikein.
- **Tekninen vaikutus:** README antaa väärän kuvan nykyisestä toiminnasta ja suunnitteluperiaatteesta.
- **Liiketoimintavaikutus:** ylläpitäjä tai käyttäjä voi tehdä virheellisiä johtopäätöksiä sovelluksen datavirroista.
- **Korjaus:** päivitä README vastaamaan nykyisiä kahta karttaa, kerroksen hallintaa ja yhteistä vuosirajausta; säilytä aineiston puuttuvia kenttiä koskevat rajaukset.
- **Arvioitu työmäärä:** 0,5 työpäivää.

### F-17 — Testikattavuuden kehitystä ei mitata

- **Severity / kategoria:** Matala — Testaus
- **Tarkka sijainti:** `package.json:5–10`; `.github/workflows/ci.yml:20–28`
- **Kuvaus ja näyttö:** testit suoritetaan Node test runnerilla ja Playwrightilla, mutta coverage-instrumentointia, raporttia tai kattavuusrajaa ei ole määritelty.
- **Tekninen vaikutus:** palvelu-/haara- ja muuttuneen koodin kattavuus jää tuntemattomaksi; testien suuri lukumäärä ei kerro kattavuudesta.
- **Liiketoimintavaikutus:** regressioriskin muutosta on vaikeampi arvioida pitkällä aikavälillä.
- **Korjaus:** valitse Node/TS-ympäristöön sopiva coverage-keräys, julkaise raportti CI:ssä ja aseta rajat vasta mitatun lähtötason jälkeen.
- **Arvioitu työmäärä:** 1–3 työpäivää.

### F-18 — GitHub Actions -riippuvuudet on lukittu tageihin, ei commit-SHA:hin

- **Severity / kategoria:** Matala — Supply chain
- **Tarkka sijainti:** `.github/workflows/ci.yml:15–16`; `.github/workflows/deploy.yml:31–34`
- **Kuvaus ja näyttö:** `actions/checkout@v4` ja `actions/setup-node@v4` viittaavat liikkuviin tageihin.
- **Tekninen vaikutus:** tagin kohde voi muuttua; workflow ei dokumentoi käytetyn action-version muuttumatonta commit-identiteettiä.
- **Liiketoimintavaikutus:** ulkoisen actionin toimitusketjuriski on vaikeampi havaita tai toistaa.
- **Korjaus:** pinnaa actionit täysiin commit-SHA:ihin ja lisää version päivityskäytäntö, esimerkiksi Dependabotin kautta.
- **Arvioitu työmäärä:** 0,5–1 työpäivä.

### F-19 — Kilpailu- ja kuntatiedon liitos perustuu normalisoituun nimeen

- **Severity / kategoria:** Matala — Data ja skaalautuvuus
- **Tarkka sijainti:** `src/services/competitionService.ts:1–3, 25–35`; `src/planner/PlannerApp.tsx:251–257`; `jsondb/SFL-Kilpailut-2019-2026.json`
- **Kuvaus ja näyttö:** kilpailurivi sisältää `Kunta`-tekstin; palvelu indeksoi kuntanimen normalisoituna ja kartta yhdistää sen geometriaan nimen kautta. Nykyiset 161 erillistä kuntaa täsmäävät kuntageometriaan, mutta aineistossa ei ole pysyvää kuntakoodia.
- **Tekninen vaikutus:** kuntanimen muutos, vaihtoehtoinen kielimuoto tai historiallinen nimi vaatii erillisen aliasratkaisun; koodiin perustuva eheys ei ole mahdollinen nykyisestä lähteestä.
- **Liiketoimintavaikutus:** uusi aineisto voi näkyä kokonaismäärissä mutta jäädä pois kartan kuntatason jakaumasta.
- **Korjaus:** suosi lähteessä kuntakoodia; kunnes se on saatavilla, ylläpidä validoitua alias-/nimeämismäppäystä ja näkyvää unmatched-raporttia. Älä arvaa nimiä.
- **Arvioitu työmäärä:** 2–4 työpäivää.

### F-20 — Yhteiset tunnukset estävät muutosten tekijän yksilöinnin

- **Severity / kategoria:** Keskitaso — Hallinta ja audit trail
- **Tarkka sijainti:** `sovelluksen-esittely.md` (yhteiskäyttöiset roolit); `src/planner/PlannerApp.tsx:648`; `src/models/region.ts:Region`
- **Kuvaus ja näyttö:** dokumentaatio kertoo Writer- ja Admin-tunnusten olevan yhteiskäyttöisiä. Planner-dokumentin alue-/skenaariomalli ei sisällä tekijää eikä palvelin tallenna muutoshistoriaa käyttäjäkohtaisesti.
- **Tekninen vaikutus:** palvelin voi tunnistaa roolin, mutta ei yksittäistä toimijaa tai tehdä käyttäjäkohtaista audit trailia.
- **Liiketoimintavaikutus:** muutosten vastuuta, väärinkäytöksiä ja toiminnan jälkiselvitystä ei voi kohdistaa henkilöön.
- **Korjaus:** päätä ensin onko henkilökohtainen jäljitettävyys vaatimus. Jos on, siirry yksilöllisiin tunnuksiin ja tallenna minimoitu tekijä-/aikaleimaloki; jos ei, dokumentoi riskin hyväksyntä ja kompensoivat kontrollit.
- **Arvioitu työmäärä:** 3–8 työpäivää riippuen valitusta identiteettiratkaisusta.

### F-21 — JSON-tiedostojen koko aineiston käsittely rajoittaa kasvua

- **Severity / kategoria:** Matala — Skaalautuvuus
- **Tarkka sijainti:** `server/clubs-api.php:88–154, 157–170, 234–268`; `server/planner.php:495–537`
- **Kuvaus ja näyttö:** seuravarasto validoidaan koko listana joka API-pyynnössä ja tallennetaan koko tiedostona; samanaikaiset kirjoitukset lukitaan. Seuravarastolla on 10 000 rivin ja 10 MiB:n rajat. Plannerin tallennus käsittelee dokumentin ja enintään 10 backupia yhtenä JSON-pakettina.
- **Tekninen vaikutus:** CPU-, I/O- ja lukon pito skaalautuvat payloadin kokoon; tämä ei ole nykyisellä fixture-koolla mitattu ongelma.
- **Liiketoimintavaikutus:** kasvu voi kasvattaa viivettä ja samanaikaisten Admin-päivitysten odotusta ennen kuin dataraja tulee vastaan.
- **Korjaus:** mittaa p95-luku-/kirjoitusajat realistisilla tietomäärillä ja määritä migraatiokynnys tietokantaan/palveluun; älä tee vaihtoa ilman mittaustulosta ja palautussuunnitelmaa.
- **Arvioitu työmäärä:** 2–5 työpäivää baselineen; varsinainen migraatio erillinen hanke.

### F-22 — Salasanapolitiikka on kahdessa PHP-polussa

- **Severity / kategoria:** Matala — Tekninen velka ja tietoturvan ylläpito
- **Tarkka sijainti:** `server/setup-auth.php:62–78`; `server/planner.php:335–349`
- **Kuvaus ja näyttö:** vähimmäispituus, tavuraja ja Argon2id/`PASSWORD_DEFAULT`-fallback tarkistetaan sekä ensialustuksessa että salasananvaihdossa erillisellä koodilla.
- **Tekninen vaikutus:** myöhempi käytäntömuutos voi päivittyä vain toiseen polkuun.
- **Liiketoimintavaikutus:** käyttäjälle voidaan hyväksyä eri salasanat eri toimintoihin.
- **Korjaus:** erota yhteinen PHP-sääntömoduuli tai sopimustestit niin, että molemmat polut validoivat saman käytännön.
- **Arvioitu työmäärä:** 1 työpäivä.

### F-23 — Selaintestit ajetaan vain Chromiumilla

- **Severity / kategoria:** Matala — Testaus ja yhteensopivuus
- **Tarkka sijainti:** `playwright.config.ts:7–10`; `.github/workflows/ci.yml:27–28`
- **Kuvaus ja näyttö:** Playwrightin `browserName` on Chromium, ja workflow asentaa vain Chromiumin.
- **Tekninen vaikutus:** Firefox-/WebKit-erot, erityisesti Leafletin näppäimistö- ja kosketuspoluissa, jäävät CI:n ulkopuolelle.
- **Liiketoimintavaikutus:** muiden selainmoottorien käyttäjien regressio voi päästä julkaisuun.
- **Korjaus:** lisää aikataulutettu tai muutettuihin pintoihin rajattu Firefox/WebKit-ajo; seuraa ajoaikakustannusta ja priorisoi kriittiset kartta-/auth-polut.
- **Arvioitu työmäärä:** 1–3 työpäivää.

### F-24 — Plannerin automaattinen saavutettavuustarkastus sulkee kartan pois

- **Severity / kategoria:** Matala — Saavutettavuus ja testaus
- **Tarkka sijainti:** `tests/browser/planner.spec.ts:482–496`
- **Kuvaus ja näyttö:** kaikkien planner-näkymien axe-tarkastus kutsuu `.exclude('.leaflet-container')`, joten planner-kartan DOM ei kuulu tämän tarkastuksen kohteeseen. README toteaa manuaalisen avustavan teknologian tarkastuksen olevan tarpeen, mutta auditoinnissa ei ollut näyttöä sen suorittamisesta.
- **Tekninen vaikutus:** kartan kohdistus-, nimi-, ohje- tai interaktiovirheet eivät näy tässä automaattisessa portissa.
- **Liiketoimintavaikutus:** osa käyttäjistä voi jäädä kartan suunnittelutoimintojen ulkopuolelle.
- **Korjaus:** lisää saavutettavuustestit kartan hallintaelementeille ja näppäimistöpoluille; dokumentoi manuaalinen ruudunlukijatesti. Leafletin generoiman SVG:n poissulku tulee perustella tarkasti, ei koko interaktiivisen kartta-alueen poissululla.
- **Arvioitu työmäärä:** 2–4 työpäivää.

# Priorisoitu Toteutussuunnitelma

Työt suositellaan aloittamaan vakaudesta, datan oikeellisuudesta ja palvelun palautettavuudesta. Uudelleenkirjoitusta tai tietokantamigraatiota ei suositella ennen mittausta.

| Järjestys | Suunta | Löydökset | Aloituskriteeri |
|---:|---|---|---|
| 1 | Korjaa testi, joka ei toistu luotettavasti | F-01 | Heti |
| 2 | Korjaa lähteen päivitysaikaleiman semantiikka | F-02 | Heti |
| 3 | Rajaa rate limiterin tiedostokasvu | F-06 | Ennen seuraavaa auth-laajennusta |
| 4 | Syvennä planner-tallennuksen palvelinvalidointi | F-07 | Ennen planner-skeeman muutosta |
| 5 | Lisää seurarekisterin palautettava backup | F-08 | Ennen suurempaa Admin-tuontia |
| 6 | Kytke CI:n testit turva-/laatutarkistuksiin | F-09, F-17, F-18 | Kun nykyinen testipohja on vihreä |
| 7 | Kytke julkaisu onnistuneeseen validointiin | F-03 | Ennen seuraavia tuotantopäivityksiä |
| 8 | Tee deploy atomiseksi ja palautettavaksi | F-04, F-05 | Ennen seuraavia tuotantopäivityksiä |
| 9 | Lisää tuotannon diagnoosi ja health-signaalit | F-10 | Ennen käyttölaajennusta |
| 10 | Päivitä README ja lähdemetadata | F-15, F-16 | Pienet, matalariskiset työt |
| 11 | Vahvista GIS-aineiston parsinta ja päivitystyökalu | F-13, F-14 | Ennen kuntarajojen päivitystä |
| 12 | Täydennä testaus selaimille, kattavuudelle ja kartan saavutettavuudelle | F-17, F-23, F-24 | Ennen merkittävää UI-laajennusta |
| 13 | Rajaa komponenttivastuut | F-12 | Kun testit ja rajapintasopimukset ovat vakaat |
| 14 | Pienennä alkuperäistä bundlea mittaamalla | F-11 | Komponenttirajauksen yhteydessä |
| 15 | Vahvista kuntaliitoksen avain ja seuranta | F-19 | Ennen uuden nimimuotoisen datalähteen liittämistä |
| 16 | Päätä identiteettien audit trail -tarve | F-20 | Tuote-/hallintapäätös ennen toteutusta |
| 17 | Mitoita JSON-tallennuksen kasvuraja | F-21 | Kun mittaus tai datakasvu lähestyy rajoja |
| 18 | Yhtenäistä salasanapolitiikan toteutus | F-22 | Ennen auth-muutoksia |

# Epicit

### EPIC-01 — Testien luotettavuus ja laatuportit

- **Tavoite:** Toistettava vihreä testaus sekä kattavuuden ja selain-/saavutettavuusrajojen näkyvyys.
- **Liiketoiminta-arvo:** pienempi regressioriski ja luotettavammat julkaisut.
- **Tekninen arvo:** luotettava lähtötaso muutoksille.
- **Riskit:** selainten lisäajo kasvattaa CI-aikaa; coverage-raja voi aluksi olla harhaanjohtava.
- **Suositeltu ajankohta:** viikko 1–4.
- **Onnistumiskriteerit:** paikallinen ja Actions-ajon E2E-tulos toistuu; coverage-raportti on CI-artifact; kartan kriittiset näppäimistöpolut testataan.
- **Tehtävät:** TASK-001, TASK-015, TASK-016, TASK-017.

### EPIC-02 — Tietoturva, skeemat ja auditointi

- **Tavoite:** rajata kirjautumisrajoitus, vahvistaa palvelinvalidointi, lisätä skannaus ja tehdä identiteetin jäljitettävyydestä tietoinen päätös.
- **Liiketoiminta-arvo:** pienempi palvelunestoon, tietojen rikkoutumiseen ja selvittämättömiin muutoksiin liittyvä riski.
- **Tekninen arvo:** yhtenäiset API-sopimukset ja valvotut auth-kontrollit.
- **Riskit:** liian tiukka skeema voi hylätä vanhoja planner-dokumentteja; versiointi ja migraatiot tarvitaan.
- **Suositeltu ajankohta:** viikko 1–6.
- **Onnistumiskriteerit:** vanhat dokumentit validoituvat määritellyllä migraatiolla; limiterin tila pysyy rajattuna; CI raportoi riippuvuus- ja staattisen skannauksen.
- **Tehtävät:** TASK-003–TASK-006, TASK-023.

### EPIC-03 — Julkaisun ja palautumisen kestävyys

- **Tavoite:** testien onnistuminen ennen tuotantoa, atominen julkaisu, smoke check, rollback ja operatiiviset lokit.
- **Liiketoiminta-arvo:** vähemmän käyttökatkoja ja nopeampi palautus.
- **Tekninen arvo:** julkaisuversio on tunnistettavissa ja toistettavissa.
- **Riskit:** nykyinen palvelin voi vaatia polku-/SSH-sopimuksen muutoksia; testaa erillisessä staging-ympäristössä.
- **Suositeltu ajankohta:** ensimmäinen kuukausi.
- **Onnistumiskriteerit:** epäonnistunut validointi estää deployn; epäonnistunut smoke check palauttaa edellisen version; julkaisuun jää health-tulos.
- **Tehtävät:** TASK-007–TASK-010.

### EPIC-04 — Datan alkuperä ja GIS-laatu

- **Tavoite:** luotettavat päivitysajat, lähde- ja lisenssitiedot, kuntakoodiin nojaava liitos sekä kuntarajojen validoitu päivitys.
- **Liiketoiminta-arvo:** analyysien läpinäkyvyys ja oikeellisuus.
- **Tekninen arvo:** virheelliset ja muuttuneet aineistot pysäytetään ennen tuotantoa.
- **Riskit:** alkuperätietoa ei välttämättä saada; silloin merkitään se avoimesti tuntemattomaksi.
- **Suositeltu ajankohta:** kuukausi 1–2.
- **Onnistumiskriteerit:** lähdekentät eivät koskaan esitä pyyntöaikaa aineiston päivitysaikana; GIS-build validoi 308 kunnan kattavuuden; unmatched-nimet raportoidaan.
- **Tehtävät:** TASK-002, TASK-012–TASK-013, TASK-020.

### EPIC-05 — Ylläpidettävyys ja suorituskyky

- **Tavoite:** pienentää suurimpien UI-vastuiden vaikutusalaa ja etusivun alkuperäistä siirtoa mitattavasti.
- **Liiketoiminta-arvo:** nopeampi ominaisuuskehitys ja parempi mobiilikäyttö.
- **Tekninen arvo:** selkeämpi komponenttijako ja seurattava bundle-budjetti.
- **Riskit:** suuri refaktorointi voi aiheuttaa näkymäregressioita; vaiheista ja pidä E2E-vihreänä.
- **Suositeltu ajankohta:** kuukausi 2–3.
- **Onnistumiskriteerit:** PlannerAppin vastuut ovat rajattuja, testit säilyvät, etusivun main chunk alittaa sovitun budjetin.
- **Tehtävät:** TASK-018–TASK-019.

### EPIC-06 — Skaalautuminen ja käyttöoikeuksien hallinta

- **Tavoite:** määrittää kasvun mittausrajat ja varmistaa, vastaako yhteisten tunnusten jäljitettävyys tuotteen hallintatarvetta.
- **Liiketoiminta-arvo:** vältetään liian aikainen uudelleenrakennus ja tunnistetaan oikea investointikohta.
- **Tekninen arvo:** tiedostotallennuksen kuormarajat ja selkeä migration trigger.
- **Riskit:** yksilöllinen tunnistus on laajempi tietosuoja- ja käyttöönottopäätös.
- **Suositeltu ajankohta:** neljännes 1–2, ennen kasvuinvestointia.
- **Onnistumiskriteerit:** JSON-tallennukselle on mitattu kapasiteettiraja; identiteettimallille on hyväksytty päätös.
- **Tehtävät:** TASK-021–TASK-022.

### EPIC-07 — Dokumentaation ajantasaisuus

- **Tavoite:** pitää README ja datalähdenäkymä vastaavina oikeaa toteutusta.
- **Liiketoiminta-arvo:** käyttäjä ja ylläpitäjä ymmärtävät nykyiset rajat.
- **Tekninen arvo:** vähemmän väärään oletukseen perustuvia muutoksia.
- **Riskit:** lähdetiedon omistajaa/lisenssiä ei saa arvata.
- **Suositeltu ajankohta:** ensimmäinen viikko ja jokaisen lähdemuutoksen yhteydessä.
- **Onnistumiskriteerit:** README vastaa kahden kartan tasoja; lähteen puuttuvat tiedot esitetään eksplisiittisesti.
- **Tehtävät:** TASK-011, TASK-014.

### EPIC-08 — Riippuvuuksien ja GitHub Actionsin toimitusketju

- **Tavoite:** automatisoida riippuvuuksien tarkastus ja tehdä workflow-toiminnot immuuttisiksi.
- **Liiketoiminta-arvo:** pienempi kolmannen osapuolen muutoksen aiheuttama riski.
- **Tekninen arvo:** toistettavat action-versiot ja näkyvä advisory-tilanne.
- **Riskit:** SHA-päivitykset vaativat ylläpitoa ja botin/omistajan.
- **Suositeltu ajankohta:** kuukausi 1.
- **Onnistumiskriteerit:** skannaus on osa PR-prosessia ja kaikki ulkoiset actionit ovat SHA-pinnattuja.
- **Tehtävät:** TASK-006.

# Tehtävälista

Kaikki tehtävät alkavat tilassa **Ei aloitettu**. Työmäärät ovat kalenterityöpäiviä yhdelle kehittäjälle. Riippuvuuksiksi kirjataan vain tekniset tai prosessilliset ennakkoehdot, ei pelkkää prioriteettijärjestystä.

| Tehtävä | Tila | Prioriteetti | Työmäärä | Riippuvuudet |
|---|---|---:|---:|---|
| TASK-001 | Ei aloitettu | P1 | 0,5–1 pv | — |
| TASK-002 | Ei aloitettu | P1 | 1–2 pv | — |
| TASK-003 | Ei aloitettu | P1 | 1–2 pv | — |
| TASK-004 | Ei aloitettu | P1 | 2–4 pv | — |
| TASK-005 | Ei aloitettu | P1 | 1–3 pv | — |
| TASK-006 | Ei aloitettu | P2 | 1–2 pv | — |
| TASK-007 | Ei aloitettu | P1 | 1–2 pv | TASK-001 |
| TASK-008 | Ei aloitettu | P1 | 3–5 pv | TASK-007 |
| TASK-009 | Ei aloitettu | P2 | 1–3 pv | TASK-008 |
| TASK-010 | Ei aloitettu | P2 | 2–4 pv | — |
| TASK-011 | Ei aloitettu | P2 | 0,5 pv | — |
| TASK-012 | Ei aloitettu | P2 | 2–4 pv | — |
| TASK-013 | Ei aloitettu | P2 | 2–3 pv | TASK-012 |
| TASK-014 | Ei aloitettu | P2 | 2–5 pv | — |
| TASK-015 | Ei aloitettu | P2 | 1–3 pv | — |
| TASK-016 | Ei aloitettu | P2 | 1–3 pv | — |
| TASK-017 | Ei aloitettu | P2 | 2–4 pv | — |
| TASK-018 | Ei aloitettu | P2 | 1–2 vk | TASK-001 |
| TASK-019 | Ei aloitettu | P2 | 2–4 pv | — |
| TASK-020 | Ei aloitettu | P3 | 2–4 pv | — |
| TASK-021 | Ei aloitettu | P2 | 3–8 pv | Tuote-/hallintapäätös |
| TASK-022 | Ei aloitettu | P3 | 2–5 pv | — |
| TASK-023 | Ei aloitettu | P2 | 1 pv | — |

## Yksityiskohtaiset toteutustehtävät

### TASK-001 — Vakauta selaimen migraatiotesti

- **Tarkoitus:** Tee vanhan IndexedDB-suunnitelman migraatiotestistä deterministinen.
- **Syy:** Tällä hetkellä testi alustaa planner-storen ennen kuin paikallinen suunnitelma lisätään; testi epäonnistui paikallisesti.
- **Riippuvuudet:** Ei ole.
- **Työmäärä / riski:** 0,5–1 pv / matala.
- **Odotettu tulos:** testi todentaa aidosti käyttäjän vanhan datan siirtymisen.
- **Vaikutettavat tiedostot:** `tests/browser/planner.spec.ts`, tarvittaessa testiharness; älä muuta tuotantokäyttäytymistä ilman erillistä näyttöä.
- **Validointi:** aja testi yksin vähintään 10 kertaa ja koko `npm run test:e2e`.
- **Hyväksymiskriteerit:** kaikki ajot onnistuvat; testi varmistaa, ettei automaattista PUT-kirjoitusta tapahdu ennen vahvistusta ja että siirretty suunnitelma säilyy reloadissa.
- **Valmis Copilot Agent -kehote:**

```text
# Context
This React/Vite application has a Playwright test for migrating an IndexedDB planner document to an empty remote store. The test currently visits the homepage before inserting the legacy record; App initializes the singleton planner store on that visit.

# Objective
Make the migration browser test deterministic and representative without changing production behavior unnecessarily.

# Scope
Inspect the planner store initialization lifecycle, the Playwright fixtures, and the failing test. Fix the test setup or add a narrowly scoped test seam only if required.

# Constraints
Do not weaken assertions, skip the test, or introduce timing sleeps. Preserve the requirement that migration requires explicit user confirmation.

# Files To Review
tests/browser/planner.spec.ts, src/App.tsx, src/planner/PlannerApp.tsx, src/state/plannerStore.ts, playwright.config.ts.

# Detailed Implementation Steps
1. Reproduce the failure and identify the store initialization ordering.
2. Seed IndexedDB before the first planner-store initialization in the test context.
3. Keep assertions for zero pre-confirmation writes, explicit migration, and persistence after reload.
4. Ensure the test remains isolated from other tests and parallel workers.

# Validation Steps
Run the test alone at least 10 consecutive times, then run npm test and npm run test:e2e.

# Acceptance Criteria
The test passes repeatedly without arbitrary waits, still verifies explicit consent, and the full suites pass.

# Deliverables
Minimal test/harness changes and a concise explanation of the root cause.

# Output Format
Summarize files changed, root cause, and exact validation results.
```

### TASK-002 — Erota seuratiedon muutosajankohta kyselyajasta

- **Tarkoitus:** Näytä datalähteelle oikea muutosajankohta.
- **Syy:** API:n `generatedAt` on jokaisen pyynnön kellonaika.
- **Riippuvuudet:** Ei ole.
- **Työmäärä / riski:** 1–2 pv / keskitaso.
- **Odotettu tulos:** pyyntöhetkeä ei esitetä lähteen päivityksenä.
- **Vaikutettavat tiedostot:** `server/clubs-api.php`, `src/data/clubRepository.ts`, `src/data/dataSources.ts`, `src/services/dataSourceService.ts`, niihin liittyvät testit ja README.
- **Validointi:** API-testit kahdelle muuttumattoman tiedoston pyynnölle ja yhdelle kirjoituksen jälkeiselle pyynnölle.
- **Hyväksymiskriteerit:** sama data ei saa uutta päivitysaikaa pelkän GETin vuoksi; puuttuvaa aikaa ei korvata nykyhetkellä.
- **Valmis Copilot Agent -kehote:**

```text
# Context
The public clubs API currently sets metadata.generatedAt to the current request time, while the client displays it as the source's last update time.

# Objective
Represent source modification time separately from request/response time.

# Scope
Trace the clubs file write path, API response contract, source metadata parser, data-source UI, and export metadata.

# Constraints
Never invent an update date. Keep unknown timestamps null/unknown. Do not expose private contact data or credentials.

# Files To Review
server/clubs-api.php, src/data/clubRepository.ts, src/services/dataSourceService.ts, src/pages/DataSourcesPage.tsx, tests/clubs-api.test.mjs, tests/dataSources.test.mjs.

# Detailed Implementation Steps
1. Define a trustworthy persisted source-updated timestamp or derive one from a validated file metadata source.
2. Keep request time under a distinct field only if the UI needs it.
3. Update the typed API contract and UI labels.
4. Add tests proving GET alone does not advance source update time and successful writes do.

# Validation Steps
Run focused API/data-source tests, npm test, and npm run build.

# Acceptance Criteria
The “last updated” UI never reports request time as a data change; unknown timestamps remain unknown.

# Deliverables
Contract, implementation, tests, and directly related documentation updates.

# Output Format
Report the chosen timestamp source, compatibility behavior, changed files, and test results.
```

### TASK-003 — Rajaa kirjautumisyritysten tallennustila

- **Tarkoitus:** Estä `login-attempts.json`-tiedoston kasvaminen vanhoista fingerprint-merkinnöistä.
- **Syy:** eri IP-osoitteiden vanhat yritykset eivät poistu automaattisesti.
- **Riippuvuudet:** Ei ole.
- **Työmäärä / riski:** 1–2 pv / keskitaso.
- **Odotettu tulos:** 15 minuutin historiaraja ja tiedostokokoraja toteutuvat.
- **Vaikutettavat tiedostot:** `server/planner.php`, `tests/planner-api.test.mjs`.
- **Validointi:** testi useilla fingerprint-tunnisteilla ja vanhentuneilla aikaleimoilla; PHP-syntaksitarkistus.
- **Hyväksymiskriteerit:** vanhat aikaleimat poistetaan kaikista merkinnöistä, kokonaismäärä pysyy rajattuna ja rate limit säilyttää nykyisen 10 yritystä / 15 min -käytännön.
- **Valmis Copilot Agent -kehote:**

```text
# Context
server/planner.php stores failed login timestamps in login-attempts.json keyed by an HMAC fingerprint. It prunes only the active fingerprint, leaving expired non-empty entries in the file.

# Objective
Bound rate-limit storage and processing cost without weakening brute-force protection.

# Scope
Update the limiter algorithm and its PHP integration tests.

# Constraints
Preserve private file permissions, locking, HMAC keying, and the existing attempt threshold/window unless tests or documented policy require a deliberate change. Do not log passwords or IP addresses.

# Files To Review
server/planner.php, tests/planner-api.test.mjs, .github/workflows/ci.yml.

# Detailed Implementation Steps
1. Prune expired timestamps for every fingerprint under the existing file lock.
2. Define safe caps for retained fingerprints and file size, with explicit behavior at the cap.
3. Preserve atomic/locked updates and fail closed on corrupt state.
4. Add tests for many unique fingerprints, expiration, and cap behavior.

# Validation Steps
Run planner API tests and PHP lint; run npm test.

# Acceptance Criteria
Expired entries are removed regardless of which client submits the next request, state remains bounded, and rate limiting still blocks excess attempts.

# Deliverables
Minimal code and regression tests.

# Output Format
Explain limits, lock semantics, and validation results.
```

### TASK-004 — Vahvista planner-dokumentin palvelinpuolen skeema

- **Tarkoitus:** Estä virheellisen sisäisen aluerakenteen tallennus.
- **Syy:** PHP:n `valid_document` tarkistaa vain dokumentin ylätason.
- **Riippuvuudet:** Ei ole.
- **Työmäärä / riski:** 2–4 pv / korkea (vanhojen tietojen yhteensopivuus).
- **Odotettu tulos:** API hyväksyy vain versioidun, rajat täyttävän dokumentin ja backupit.
- **Vaikutettavat tiedostot:** `server/planner.php`, `src/services/plannerDocument.ts`, `tests/planner-api.test.mjs`, `tests/planner.test.mjs`.
- **Validointi:** kelvolliset nykyiset fixturet hyväksytään; virheelliset nested-rakenteet hylätään kirjoittamatta.
- **Hyväksymiskriteerit:** skeema ja migraatiopolku dokumentoidaan; virheellinen pyyntö ei muuta revisionia tai tiedostoa.
- **Valmis Copilot Agent -kehote:**

```text
# Context
The planner PHP endpoint validates only document version, activeScenarioId type, and a non-empty scenarios array. Client normalization performs deeper validation.

# Objective
Make server persistence reject malformed nested planner documents and backups.

# Scope
Define and implement server-side validation for the current version, reusing documented invariants without trusting client validation.

# Constraints
Keep public reads available, preserve HTTPS/auth/CSRF/revision checks, and do not silently rewrite or discard existing stored plans. Add an explicit migration path if the schema must change.

# Files To Review
server/planner.php, src/services/plannerDocument.ts, src/models/region.ts, tests/planner-api.test.mjs, tests/planner.test.mjs.

# Detailed Implementation Steps
1. Enumerate required fields and bounds for scenarios, regions, municipality codes, IDs, colors, dates, and backups.
2. Implement defensive PHP validation with size/count limits.
3. Ensure validation runs before acquiring/persisting the new state.
4. Add invalid nested payload and valid legacy fixture tests.

# Validation Steps
Run planner API and document tests, PHP lint, npm test, and npm run build.

# Acceptance Criteria
Malformed nested data receives a client error and cannot change stored bytes/revision; valid current documents round-trip unchanged.

# Deliverables
Versioned validation, regression tests, and concise schema documentation.

# Output Format
Describe invariants, compatibility decisions, changed files, and test results.
```

### TASK-005 — Lisää seurarekisterille palautuskelpoinen varmuuskopiointi

- **Tarkoitus:** Palauta viimeisin kelvollinen seuratietoversio virheellisen Admin-muutoksen jälkeen.
- **Syy:** atominen rename ei säilytä edellistä versiota.
- **Riippuvuudet:** Ei ole.
- **Työmäärä / riski:** 1–3 pv / keskitaso.
- **Odotettu tulos:** ennen uutta kirjoitusta syntyy suojattu palautuspiste tai on varmennettu ulkoinen backup.
- **Vaikutettavat tiedostot:** `server/clubs-api.php`, Admin-hallinta, testit, README/operointiohje.
- **Validointi:** korruptoituneen uuden version simulaatio, restore-testi ja oikeuksien tarkistus.
- **Hyväksymiskriteerit:** backup sisältää private-kontaktit suojatusti, säilytys on rajattu, palautus ei ole julkisen API:n kautta käytettävissä.
- **Valmis Copilot Agent -kehote:**

```text
# Context
The canonical club store is a private JSON file. The API atomically replaces it, but the repository does not create a recoverable server-side snapshot for ordinary writes.

# Objective
Provide a secure, tested recovery point for club-store updates.

# Scope
Choose the smallest viable server backup or externally managed backup integration and document its restore procedure.

# Constraints
Treat backups as containing private personal contact data. Keep them outside the web root, apply restrictive permissions, set retention limits, and never expose them through public routes. Avoid duplicating unbounded data.

# Files To Review
server/clubs-api.php, server/planner.php, server/migrate-clubs.php, src/planner/ClubsAdmin.tsx, README.md, tests/clubs-api.test.mjs.

# Detailed Implementation Steps
1. Decide and document backup boundary, retention, and recovery owner.
2. Create a snapshot before replacing the canonical file, with collision-safe naming and private permissions.
3. Add a constrained restore command/flow with validation and confirmation.
4. Test failure before/after snapshot creation and restore of a known store.

# Validation Steps
Run PHP integration tests, permission checks, PHP lint, and npm test.

# Acceptance Criteria
A failed or mistaken write can be recovered from a validated private snapshot; retention is bounded and restore is tested.

# Deliverables
Backup/restore implementation, tests, and an operational recovery procedure.

# Output Format
State the backup threat model, retention, restore steps, and validation results.
```

### TASK-006 — Lisää turvaskannaus ja pinnaa GitHub Actions -versiot

- **Tarkoitus:** Havaitse advisories ja sovitut staattiset riskit automaattisesti.
- **Syy:** nykyinen CI ei skannaa riippuvuuksia tai lähdekoodia, ja käytössä olevat actionit viittaavat tageihin.
- **Riippuvuudet:** Ei ole.
- **Työmäärä / riski:** 1–2 pv / matala.
- **Odotettu tulos:** PR:issä näkyy auditoitava tietoturvan tarkistustulos.
- **Vaikutettavat tiedostot:** `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, mahdollinen CodeQL-määritys, `package.json`.
- **Validointi:** testaa puhdas nykyinen dependency graph ja tarkoituksellinen dummy-advisory vain turvallisessa workflow-testissä.
- **Hyväksymiskriteerit:** actionit ovat SHA-pinnattuja; poikkeukset ovat perusteltuja, omistettuja ja vanhenevia.
- **Valmis Copilot Agent -kehote:**

```text
# Context
CI runs PHP syntax checks, unit tests, and Chromium browser tests, but no dependency advisory or static security scan. npm audit currently reports no known issues.

# Objective
Add maintainable security scanning and immutable GitHub Action references to pull request and default-branch validation.

# Scope
Use supported GitHub-native or lockfile-based scanning appropriate to this repository.

# Constraints
Use least-privilege workflow permissions, avoid uploading private data, do not add unpinned third-party actions, and do not hide findings with broad allowlists.

# Files To Review
.github/workflows/ci.yml, .github/workflows/deploy.yml, package.json, package-lock.json, server/*.php.

# Detailed Implementation Steps
1. Select dependency and source scanning mechanisms.
2. Pin existing checkout/setup-node actions to full commit SHAs and define update ownership.
3. Add narrow permissions and explicit trigger behavior.
4. Define how findings are triaged and how temporary suppressions expire.
5. Verify the scan on the current clean dependency graph.

# Validation Steps
Run workflow syntax validation where available, npm audit, existing CI commands, and inspect effective permissions.

# Acceptance Criteria
PRs receive actionable scan results; current known issues are accurately reported; external actions are SHA-pinned; no broad or permanent suppression is introduced.

# Deliverables
Workflow/configuration changes and concise triage instructions.

# Output Format
List scanners, permission scope, known results, and validation performed.
```

### TASK-007 — Tee testituloksista tuotantodeployn ennakkoehto

- **Tarkoitus:** Estä tuotantoon vienti, jos validointijono ei ole onnistunut.
- **Syy:** deploy-workflow toimii itsenäisesti `main`-pushissa.
- **Riippuvuudet:** TASK-001.
- **Työmäärä / riski:** 1–2 pv / keskitaso.
- **Odotettu tulos:** ainoastaan testatun commitin voi julkaista.
- **Vaikutettavat tiedostot:** `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`.
- **Validointi:** workflow-tapahtumien ja branch-protection-vaatimusten dokumentointi; epäonnistuneen testin release-eston tarkistus.
- **Hyväksymiskriteerit:** push-/manual deploy ei ohita buildia ja testejä; tarkka deployattu SHA kirjataan.
- **Valmis Copilot Agent -kehote:**

```text
# Context
CI and production deployment are separate workflows triggered by pushes to main. Deployment builds the app but does not wait for unit or browser test results.

# Objective
Ensure production deployment uses a commit that passed the required validation suite.

# Scope
Adjust workflow orchestration and document any GitHub branch/environment setting that cannot be represented in repository YAML.

# Constraints
Do not weaken existing CI. Preserve workflow_dispatch only if it cannot bypass required validation. Do not assume branch protection is configured.

# Files To Review
.github/workflows/ci.yml, .github/workflows/deploy.yml, package.json.

# Detailed Implementation Steps
1. Choose a reliable workflow dependency or validated-commit deployment design.
2. Include PHP lint, npm test, production build, and browser tests in the release gate.
3. Record the deployed commit SHA and make manual deployments obey the same gate.
4. Document required repository/environment protection settings.

# Validation Steps
Use a failing test branch or workflow simulation to verify deployment is blocked; inspect least-privilege permissions.

# Acceptance Criteria
No production sync starts before all required checks pass for the exact commit being deployed.

# Deliverables
Workflow changes and an operator checklist for GitHub settings.

# Output Format
Explain the dependency model, bypass prevention, and validation evidence.
```

### TASK-008 — Julkaise atomisesti ja säilytä rollback-versio

- **Tarkoitus:** Vältä aktiivisen sivuston osittainen korvautuminen.
- **Syy:** rsync kirjoittaa suoraan aktiiviseen polkuun ja deploy voi keskeytyä.
- **Riippuvuudet:** TASK-007.
- **Työmäärä / riski:** 3–5 pv / korkea.
- **Odotettu tulos:** julkaisu aktivoidaan atomisesti ja edellinen versio säilyy.
- **Vaikutettavat tiedostot:** `.github/workflows/deploy.yml`, palvelimen deploy-polku/ohjeet.
- **Validointi:** stagingissa keskeytetty siirto, onnistunut aktivointi ja palautus vanhaan versioon.
- **Hyväksymiskriteerit:** aktiivinen julkaisu pysyy ehjänä siirron aikana; yhtäaikainen uusi ajo ei keskeytä aktivointia; rollback on testattu.
- **Valmis Copilot Agent -kehote:**

```text
# Context
The deployment workflow rsyncs dist/ directly into DEPLOY_PATH with --delete and cancels in-progress runs.

# Objective
Make production releases atomic, interruption-safe, and reversible.

# Scope
Design versioned release directories and a safe activation mechanism compatible with the hosting environment.

# Constraints
Do not assume symlink support or modify production manually. Preserve strict SSH host verification and secret handling. Keep at least one known-good release.

# Files To Review
.github/workflows/deploy.yml, README.md, deployment scripts/configuration in the repository.

# Detailed Implementation Steps
1. Identify deployment filesystem assumptions and document them.
2. Transfer a complete release into a new isolated directory.
3. Verify release contents before atomically switching active version.
4. Retain the prior release and define serialized deployment behavior.
5. Add a tested rollback step.

# Validation Steps
Test on staging with interrupted transfer, concurrent workflow run, normal activation, and rollback.

# Acceptance Criteria
An interrupted transfer never changes active files; rollback restores the previous release without rebuilding it.

# Deliverables
Deployment implementation, tested recovery flow, and updated runbook.

# Output Format
Describe hosting assumptions, activation/rollback protocol, and test results.
```

### TASK-009 — Lisää deployn jälkeinen smoke check

- **Tarkoitus:** Vahvista, että julkaisu toimii siirron jälkeen.
- **Syy:** nykyinen workflow merkitsee onnistumisen rsyncin perusteella.
- **Riippuvuudet:** TASK-008.
- **Työmäärä / riski:** 1–3 pv / keskitaso.
- **Odotettu tulos:** UI/API:n saatavuus varmistuu ja epäonnistuminen käynnistää rollbackin.
- **Vaikutettavat tiedostot:** `.github/workflows/deploy.yml`, mahdollinen health-testiskripti.
- **Validointi:** stagingin HTTP-virhe, puuttuva asset ja toimiva versio.
- **Hyväksymiskriteerit:** smoke check tarkistaa julkaisu-SHA:n ja keskeiset endpointit ilman tunnistetietojen paljastamista.
- **Valmis Copilot Agent -kehote:**

```text
# Context
Deployment currently prints success after rsync without checking the public application or PHP endpoints.

# Objective
Verify the newly activated release and automatically restore the previous release if its health checks fail.

# Scope
Add a bounded post-deployment smoke test for the static app and safe public API availability.

# Constraints
Do not send credentials, mutate production data, or expose private club/planner contents. Use timeouts and avoid retry loops that mask failure.

# Files To Review
.github/workflows/deploy.yml, server/clubs.php, server/planner.php, README.md.

# Detailed Implementation Steps
1. Define non-mutating health checks and expected status/content.
2. Verify the served release identifier matches the deployed commit.
3. Run checks with bounded retries and clear diagnostics.
4. Invoke the tested rollback procedure on failure.

# Validation Steps
Test success, HTTP error, timeout, and rollback in staging.

# Acceptance Criteria
The workflow only reports success after health checks pass; a failed check restores the previous release and fails the run.

# Deliverables
Smoke-check workflow/script and operational description.

# Output Format
List probes, timeout policy, rollback behavior, and validation results.
```

### TASK-010 — Lisää tietosuojaturvallinen palvelinlokitus ja operointiohje

- **Tarkoitus:** Selvitä tuotantovirheet turvallisesti.
- **Syy:** repo ei määritä request-id:tä, rakenteista virhelokia tai uptime-signaalia.
- **Riippuvuudet:** Ei ole.
- **Työmäärä / riski:** 2–4 pv / keskitaso.
- **Odotettu tulos:** virheiden tapahtuma, reitti, korrelaatio ja kesto voidaan diagnosoida ilman henkilötietoja.
- **Vaikutettavat tiedostot:** `server/planner.php`, `server/clubs-api.php`, deploy-workflow ja operointidokumentaatio.
- **Validointi:** testaa virhetilanteet ja varmista, ettei salasanoja, tokeneita tai kontaktitietoja kirjata.
- **Hyväksymiskriteerit:** lokitus toimii valitun hosting-ympäristön kanssa, ja seurannalla on omistaja sekä hälytysraja.
- **Valmis Copilot Agent -kehote:**

```text
# Context
PHP endpoints return user-facing JSON errors, but the repository has no structured server logging, request correlation ID, or production health signal.

# Objective
Add minimal, privacy-safe observability for API and deployment failures.

# Scope
Implement structured error diagnostics and document how operators inspect them; add only health checks that do not reveal data.

# Constraints
Never log passwords, CSRF/session tokens, private contacts, full request bodies, or unredacted IP addresses. Do not add a third-party service without approval.

# Files To Review
server/planner.php, server/clubs-api.php, .github/workflows/deploy.yml, README.md.

# Detailed Implementation Steps
1. Define safe fields and correlation-ID lifecycle.
2. Record unexpected errors and operational failures through the hosting-compatible logger.
3. Keep client responses generic while preserving server diagnostics.
4. Add a health/uptime procedure and operator ownership.

# Validation Steps
Exercise representative errors and inspect captured output for sensitive values.

# Acceptance Criteria
Operators can correlate an API/deploy failure without exposing secrets or personal data; health behavior is documented and tested.

# Deliverables
Logging/health changes, tests, and an operational runbook section.

# Output Format
List logged fields, redactions, monitoring owner, and validation results.
```

### TASK-011 — Päivitä README karttakerrosten nykytilaan

- **Tarkoitus:** Poista ristiriita README:n ja toteutettujen kilpailutasojen välillä.
- **Syy:** README väittää, ettei kilpailu data luo karttakerroksia.
- **Riippuvuudet:** Ei ole.
- **Työmäärä / riski:** 0,5 pv / matala.
- **Odotettu tulos:** käyttäjän ja kehittäjän ohje kuvaa kaksi olemassa olevaa karttaa ja niiden valinnaisen tason.
- **Vaikutettavat tiedostot:** `README.md` ja dokumentaatiotestit, jos sellaisia on.
- **Validointi:** tarkista väitteet toteutusta vasten; hae vanhoja kilpailukarttaa koskevia kohtia.
- **Hyväksymiskriteerit:** ei väitetä erillisen kartan olemassaoloa tai ettei kilpailukerrosta ole.
- **Valmis Copilot Agent -kehote:**

```text
# Context
README.md says competition data is not used for map layers or map colors. The application now exposes an optional competition-count layer on the existing homepage and planning maps.

# Objective
Update repository documentation to reflect the implemented two-map layer architecture.

# Scope
Correct only directly related documentation and verify the described year filter, layer visibility, and conflicting fills against code.

# Constraints
Do not change application code. Preserve source-data limitations and do not claim unsupported competition fields.

# Files To Review
README.md, docs/competition-map-ux-plan.md, src/components/MapView.tsx, src/planner/components/RegionMap.tsx, src/App.tsx, src/planner/PlannerApp.tsx.

# Detailed Implementation Steps
1. Replace the stale statement with the current homepage/planner behavior.
2. Explain shared year filtering and independently controlled visibility.
3. Retain limitations around source-row counts, missing event IDs, and map joins.
4. Search the README for any other directly contradictory map claims.

# Validation Steps
Review every changed statement against the cited source and run git diff --check.

# Acceptance Criteria
Documentation describes two existing maps and no standalone competition map.

# Deliverables
Focused Finnish documentation changes.

# Output Format
Summarize corrected claims and evidence locations.
```

### TASK-012 — Tee kuntageometrian osittaisesta hylkäyksestä näkyvä

- **Tarkoitus:** Älä hyväksy kartta-aineistoa osittain vääränä ilman varoitusta.
- **Syy:** parseri suodattaa virheelliset featuret ja polygoniosat hiljaisesti.
- **Riippuvuudet:** Ei ole.
- **Työmäärä / riski:** 2–4 pv / keskitaso.
- **Odotettu tulos:** datasetin kattavuus ja hylkäyssyyt ovat koneellisesti tarkistettavissa.
- **Vaikutettavat tiedostot:** `src/data/municipalityRepository.ts`, `tests/provinces.test.mjs`, mahdolliset datalaadun testit.
- **Validointi:** virheelliset koordinaatit, avoin rengas, duplikaattikoodi, puuttuva feature ja nykyinen täydellinen aineisto.
- **Hyväksymiskriteerit:** nykyiset 308 kuntaa täsmäävät; uudet virheet tuottavat eksplisiittisen varoituksen tai virheen.
- **Valmis Copilot Agent -kehote:**

```text
# Context
parseMunicipalities filters malformed rings, geometry parts, duplicate municipality codes, and unusable features without reporting how many were rejected.

# Objective
Make partial GIS data loss explicit and validate the municipality dataset's completeness.

# Scope
Improve parser diagnostics and tests; preserve the current valid dataset behavior.

# Constraints
Do not silently invent coordinates, municipality names, codes, or population values. Keep valid GeoJSON Polygon/MultiPolygon support.

# Files To Review
src/data/municipalityRepository.ts, src/services/geoService.ts, src/models/region.ts, public/geo/kunnat.geojson, tests/provinces.test.mjs.

# Detailed Implementation Steps
1. Define acceptable ring/position/coordinate invariants.
2. Track rejected feature and polygon-part reasons.
3. Decide which failures invalidate the whole dataset versus an explicitly reportable partial result.
4. Assert expected 308 municipalities and unique codes for the current source.

# Validation Steps
Run parser tests against malformed fixtures and the complete checked-in GeoJSON; run npm test and npm run build.

# Acceptance Criteria
No malformed portion disappears without a diagnostic; current 308-municipality source remains complete.

# Deliverables
Parser changes, data-quality tests, and concise diagnostic contract.

# Output Format
Document rejection policy, current data counts, and test results.
```

### TASK-013 — Koveta kuntarajojen nouto- ja rakennusskripti

- **Tarkoitus:** Estä virheellisen ulkoisen vastauksen kirjoittaminen lähdeaineistoksi.
- **Syy:** scripti ei tarkista HTTP-statusta, aikarajaa eikä kuntakoodien kattavuutta.
- **Riippuvuudet:** TASK-012:n geometriainvariantit.
- **Työmäärä / riski:** 2–3 pv / keskitaso.
- **Odotettu tulos:** päivitys kirjoittaa tiedoston vasta täydellisen validoinnin jälkeen.
- **Vaikutettavat tiedostot:** `scripts/build-municipalities.mjs`, testit, README.
- **Validointi:** mockaa timeout, HTTP-virhe, väärä JSON, puuttuva kunta, duplikaatti ja kelvollinen aineisto.
- **Hyväksymiskriteerit:** epäonnistuva nouto ei muuta nykyistä tiedostoa.
- **Valmis Copilot Agent -kehote:**

```text
# Context
The municipality builder fetches the Statistics Finland WFS response without checking response.ok or a timeout, filters only geometry types, and writes directly to the target file.

# Objective
Make municipality regeneration validated, failure-safe, and testable.

# Scope
Harden network/file input handling and add tests for the build script.

# Constraints
Keep source attribution/license accurate, do not alter valid source data, and never overwrite the existing output on a failed validation.

# Files To Review
scripts/build-municipalities.mjs, scripts/build-municipality-names.mjs, public/geo/kunnat.geojson, package.json, README.md.

# Detailed Implementation Steps
1. Add request timeout and explicit HTTP status checking.
2. Validate feature shape, unique municipality codes, names, coordinate ranges, and expected coverage.
3. Write to a temporary file and atomically replace output only after validation.
4. Add deterministic tests using local fixtures rather than live network calls.

# Validation Steps
Test timeout, non-2xx, malformed JSON, duplicate/missing codes, and valid fixture; verify existing output is unchanged on failure.

# Acceptance Criteria
Only a fully validated dataset replaces the checked-in geometry; errors state actionable causes.

# Deliverables
Hardened script, tests, and regeneration instructions.

# Output Format
Report validation rules and test cases.
```

### TASK-014 — Dokumentoi aineistojen provenienssi ja oikeudet

- **Tarkoitus:** Tee lähteiden omistaja, lisenssi ja viitepäivä näkyviksi vain varmennetun tiedon perusteella.
- **Syy:** kilpailu- ja väestöaineiston alkuperää ei ole yksilöity.
- **Riippuvuudet:** Ei ole.
- **Työmäärä / riski:** 2–5 pv / matala teknisesti, selvitystyö voi estää.
- **Odotettu tulos:** lähteillä on täydellinen provenienssikenttä tai eksplisiittinen “ei tiedossa”.
- **Vaikutettavat tiedostot:** `src/data/dataSources.ts`, lähdemetadata, `README.md`, `sovelluksen-esittely.md`.
- **Validointi:** tarkista kirjallinen lähde-/lisenssinäyttö; älä lisää oletettua omistajaa.
- **Hyväksymiskriteerit:** jokaisella aineistolla on lähde, omistaja, lisenssi/käyttöehto, viitepäivä ja päivitysvastuu tai merkitty tuntematon.
- **Valmis Copilot Agent -kehote:**

```text
# Context
The competition dataset's original producer and the population dataset's original publisher/license/reference date are not identified in repository metadata. Municipality geometry has documented attribution and license.

# Objective
Establish and publish evidence-backed provenance for each shipped dataset.

# Scope
Audit data files, metadata, existing documentation, and available repository evidence; update metadata only with verified facts.

# Constraints
Do not infer a source, license, owner, or date. If evidence is unavailable, state that it is unknown and identify the required owner decision.

# Files To Review
src/data/dataSources.ts, jsondb/SFL-Kilpailut-2019-2026.json, src/data/municipalities-population-2025.json, public/geo/kunnat.geojson, README.md, sovelluksen-esittely.md.

# Detailed Implementation Steps
1. Create a provenance inventory for each dataset.
2. Verify each claim against primary evidence.
3. Add only confirmed source/license/date/owner fields.
4. Show unknown provenance clearly in Finnish UI/docs and assign an owner for follow-up.

# Validation Steps
Review rendered metadata and run related source/data tests.

# Acceptance Criteria
No unsupported provenance claim is introduced; all unknowns remain explicit.

# Deliverables
Updated metadata and a source inventory with unresolved questions.

# Output Format
List confirmed facts separately from unresolved provenance.
```

### TASK-015 — Lisää testikattavuuden raportointi

- **Tarkoitus:** Seuraa testikattavuutta ilman ennenaikaista prosenttirajaa.
- **Syy:** nykyinen CI ei mittaa palvelu- tai haarakattavuutta.
- **Riippuvuudet:** Ei ole.
- **Työmäärä / riski:** 1–3 pv / matala.
- **Odotettu tulos:** CI julkaisee kattavuusraportin ja baseline on mitattu.
- **Vaikutettavat tiedostot:** `package.json`, `package-lock.json`, `.github/workflows/ci.yml`.
- **Validointi:** testaa Node-testien ja tarvittaessa TypeScript-moduulien instrumentation.
- **Hyväksymiskriteerit:** raportti syntyy toistettavasti; raja asetetaan vasta baselinea vasten eikä sitä voi vahingossa ohittaa.
- **Valmis Copilot Agent -kehote:**

```text
# Context
The repository has substantial Node and Playwright tests but no coverage script, report, or coverage trend.

# Objective
Measure unit/service coverage and publish it in CI.

# Scope
Add a compatible coverage tool and a baseline report; keep browser coverage separate if instrumentation is materially different.

# Constraints
Do not claim coverage from test count. Do not set an arbitrary threshold that makes the build green by excluding files.

# Files To Review
package.json, package-lock.json, .github/workflows/ci.yml, tests/*.test.mjs, tests/browser/*.spec.ts.

# Detailed Implementation Steps
1. Select a tool compatible with Node's native TypeScript test setup.
2. Add deterministic coverage collection and artifact output.
3. Measure the current baseline by production domain.
4. Propose a threshold based on measured results, with an explicit ratchet policy.

# Validation Steps
Run coverage locally and in CI; verify reports include PHP-independent services and do not include generated artifacts.

# Acceptance Criteria
Coverage is reproducible and visible; any threshold is evidence-based and cannot be bypassed by changing file globs silently.

# Deliverables
Scripts/workflow changes and a short coverage policy.

# Output Format
Report baseline, scope, exclusions, and proposed threshold.
```

### TASK-016 — Laajenna selaintestit hallitusti Firefoxiin ja WebKitiin

- **Tarkoitus:** Havaitse Chromiumin ulkopuoliset käyttöliittymäregressiot.
- **Syy:** nykyinen Playwright-config käyttää vain Chromiumia.
- **Riippuvuudet:** Ei ole.
- **Työmäärä / riski:** 1–3 pv / keskitaso.
- **Odotettu tulos:** kriittiset kartta-, suodatus- ja auth-polut tarkistuvat useammalla moottorilla.
- **Vaikutettavat tiedostot:** `playwright.config.ts`, `.github/workflows/ci.yml`, selaintestit.
- **Validointi:** CI-ajo Firefoxilla/WebKitillä; mittaa kesto ja flaky-osuus.
- **Hyväksymiskriteerit:** kriittiset smoke-testit läpäisevät vähintään Chromiumissa ja yhdessä lisämoottorissa; täysi matrix voidaan ajaa ajastetusti.
- **Valmis Copilot Agent -kehote:**

```text
# Context
Playwright is configured for Chromium only, and CI installs only Chromium.

# Objective
Add cost-controlled cross-browser coverage for critical user journeys.

# Scope
Add Firefox and/or WebKit to selected smoke tests or a scheduled matrix.

# Constraints
Keep PR feedback time reasonable, avoid browser-specific test hacks, and preserve Chromium as the required baseline.

# Files To Review
playwright.config.ts, .github/workflows/ci.yml, tests/browser/competitions.spec.ts, tests/browser/planner.spec.ts, tests/browser/dashboard.spec.ts.

# Detailed Implementation Steps
1. Identify critical map, filter, authentication, and save flows.
2. Configure a minimal additional browser matrix.
3. Run and fix genuine portability issues; do not weaken assertions.
4. Record runtime and decide which runs are required versus scheduled.

# Validation Steps
Run selected tests in Chromium and the added browser; run the full Chromium suite.

# Acceptance Criteria
The added browser run is deterministic and covers documented critical paths without materially destabilizing required CI.

# Deliverables
Playwright/CI configuration and a short browser support matrix.

# Output Format
List browsers, selected tests, runtime, and validation results.
```

### TASK-017 — Lisää planner-kartalle kohdennettu saavutettavuustestaus

- **Tarkoitus:** Testaa kartan hallintaelementit ja valintapolut saavutettavuuden kannalta.
- **Syy:** plannerin axe-testi sulkee Leaflet-kartta-alueen kokonaan pois.
- **Riippuvuudet:** Ei ole.
- **Työmäärä / riski:** 2–4 pv / matala.
- **Odotettu tulos:** kartan ohjaimet, kuntapolut ja kilpailutason käyttö ovat testattuja näppäimistöllä.
- **Vaikutettavat tiedostot:** `tests/browser/planner.spec.ts`, tarvittaessa `src/planner/components/RegionMap.tsx`.
- **Validointi:** axe-tarkastus mahdollisimman rajatulla poissululla, tab/nuolinäppäin/Enter/Escape-polut ja ruudunlukijan manuaalinen tarkistus.
- **Hyväksymiskriteerit:** kartan nimi, ohje, fokuksen näkyvyys, valinta ja layer-toggle toimivat ilman hiirtä.
- **Valmis Copilot Agent -kehote:**

```text
# Context
Planner accessibility tests exclude the entire Leaflet container from axe analysis. The map is a primary interactive planning surface.

# Objective
Cover map controls and essential municipality interactions with automated and manual accessibility checks.

# Scope
Test the accessible DOM around the map and keyboard interaction contract; fix only confirmed accessibility issues.

# Constraints
Do not remove the map exclusion by creating noisy tests for irrelevant generated SVG internals. Do not treat axe alone as proof of map accessibility.

# Files To Review
tests/browser/planner.spec.ts, tests/browser/competitions.spec.ts, src/planner/components/RegionMap.tsx, src/components/MapView.tsx, README.md.

# Detailed Implementation Steps
1. Identify keyboard-accessible municipality and layer controls.
2. Add focused axe checks for controls and map-adjacent UI.
3. Add keyboard tests for focus, selection, labels, escape, and competition-layer toggle.
4. Document and perform a screen-reader spot check for the map interaction model.

# Validation Steps
Run planner/browser tests at desktop and mobile widths and inspect axe violations.

# Acceptance Criteria
Critical map tasks work without a pointer and are announced clearly; exclusions are narrow and justified.

# Deliverables
Tests, any minimal accessibility fixes, and a manual verification note.

# Output Format
Describe tested interaction paths, remaining limitations, and results.
```

### TASK-018 — Jaa PlannerApp vastuisiin ilman käyttäytymismuutosta

- **Tarkoitus:** Erota plannerin auth, data, kartta ja näkymän ohjaus selkeisiin yksiköihin.
- **Syy:** 651-rivinen komponentti keskittää monia sivuvaikutuksia.
- **Riippuvuudet:** TASK-001.
- **Työmäärä / riski:** 1–2 vk / korkea.
- **Odotettu tulos:** pienemmät vastuualueet, joiden testit kohdistuvat yksittäisiin toimintoihin.
- **Vaikutettavat tiedostot:** `src/planner/PlannerApp.tsx`, planner-komponentit ja tarvittaessa hookit.
- **Validointi:** E2E/unit/build ennen ja jälkeen; diff-vaiheistus.
- **Hyväksymiskriteerit:** näkyvä käyttäytyminen, oikeudet ja tallennus säilyvät; suurin osa orchestration-logiikasta on nimetyissä hookeissa/komponenteissa.
- **Valmis Copilot Agent -kehote:**

```text
# Context
PlannerApp.tsx currently combines data loading, authentication, planner state, filters, map preferences, route/view selection, and multiple dashboards/admin views.

# Objective
Reduce component responsibility and change risk while preserving all current behavior.

# Scope
Refactor in small, test-backed steps into cohesive hooks/components using existing project patterns.

# Constraints
Do not redesign the UI, change data semantics, alter authorization, or add generic abstraction layers without a concrete reuse case.

# Files To Review
src/planner/PlannerApp.tsx, src/planner/components/*, src/state/plannerStore.ts, src/state/usePlanner.ts, tests/browser/planner.spec.ts.

# Detailed Implementation Steps
1. Identify pure presentation boundaries and side-effect ownership.
2. Extract one cohesive area at a time (for example auth/session or map orchestration).
3. Keep props and state typed; avoid casts and duplicated derived state.
4. Add focused tests only where the new boundary needs them.

# Validation Steps
Run npm test, npm run build, and the full Playwright suite after each coherent extraction.

# Acceptance Criteria
All existing planner journeys and access controls behave identically; component dependencies are simpler and explicit.

# Deliverables
Small refactor commits or coherent file changes with regression validation.

# Output Format
Explain the new responsibility boundaries and evidence that behavior is unchanged.
```

### TASK-019 — Pienennä etusivun bundlea budjetilla

- **Tarkoitus:** Lyhennä ensilatausta mittaamalla ennen ja jälkeen.
- **Syy:** pää-chunk on 529,01 kB ja ylittää Viten rajan.
- **Riippuvuudet:** TASK-018 on suositeltu, ei teknisesti pakollinen.
- **Työmäärä / riski:** 2–4 pv / keskitaso.
- **Odotettu tulos:** raskaat analyysit ladataan tarvittaessa ja build-budjetti estää hiljaisen kasvun.
- **Vaikutettavat tiedostot:** `src/main.tsx`, etusivun analytiikka-/karttakomponentit, `vite.config.ts` tai build-validointi.
- **Validointi:** gzip- ja main-chunk-koot, etusivun ja kartan selaintestit.
- **Hyväksymiskriteerit:** päächunk pienenee sovittuun, perusteltuun rajaan ilman olennaista interaktioviivettä.
- **Valmis Copilot Agent -kehote:**

```text
# Context
The production homepage JavaScript chunk is 529.01 kB minified (160.58 kB gzip), above Vite's 500 kB warning. Planner and data-source routes are already lazy-loaded.

# Objective
Reduce initial homepage JavaScript transfer and execution cost based on measured module contribution.

# Scope
Analyze bundle composition, selectively lazy-load non-critical heavy views, and add a size budget.

# Constraints
Do not split code arbitrarily, defer primary map usability, or change user-visible data behavior. Compare gzip and raw sizes.

# Files To Review
vite.config.ts, src/main.tsx, src/App.tsx, src/components/*, package.json.

# Detailed Implementation Steps
1. Produce a bundle composition report.
2. Identify modules not required for initial viewport/interaction.
3. Add targeted lazy boundaries with accessible loading/error states.
4. Set a documented budget based on measured baseline and desired target.

# Validation Steps
Run production build, compare bundle sizes, and run homepage/data-source/planner browser tests including slow-network behavior if supported.

# Acceptance Criteria
The main chunk is below the agreed budget and primary map/filter controls remain promptly usable.

# Deliverables
Code splitting, bundle budget, and before/after measurements.

# Output Format
Report exact chunk sizes, loaded-on-demand modules, and test results.
```

### TASK-020 — Perusta kuntanimien aliasliitos kuntakoodeihin

- **Tarkoitus:** Tee kilpailuaineiston karttaliitoksesta hallittu ja tarkastettava.
- **Syy:** kilpailulähteessä on nimi mutta ei pysyvää kuntakoodia.
- **Riippuvuudet:** Ei ole. Kuntanimien koodimäppäys voidaan toteuttaa nykyisen kuntarekisterin rajapinnan päälle erillään parserin diagnostiikasta.
- **Työmäärä / riski:** 2–4 pv / keskitaso.
- **Odotettu tulos:** jokainen nimi liitetään validoituun kuntakoodiin tai jää unmatched-listalle.
- **Vaikutettavat tiedostot:** `src/services/competitionService.ts`, `src/services/competitionMapService.ts`, `src/data/municipalityRepository.ts`, kilpailutestit.
- **Validointi:** nykyiset 161 kuntaa ja nimivariaatiot; väärää aliasarvausta ei hyväksytä.
- **Hyväksymiskriteerit:** nykyinen datasetti säilyy muuttumattomana, unmatched-kunnat näkyvät ja nimien muutokset eivät hiljaisesti muuta kartan lukua.
- **Valmis Copilot Agent -kehote:**

```text
# Context
Competition records contain municipality names but no municipality code. Current mapping normalizes names; all 161 present names currently match municipality geometry.

# Objective
Make competition-to-municipality joins explicit and resistant to future name changes.

# Scope
Add a validated alias/code mapping contract and unmatched reporting while preserving raw source records.

# Constraints
Do not infer municipality identities from fuzzy similarity. Do not modify the source competition dataset or silently drop unmatched records.

# Files To Review
src/services/competitionService.ts, src/services/competitionMapService.ts, src/data/municipalityRepository.ts, src/models/competition.ts, tests/competitions.test.mjs.

# Detailed Implementation Steps
1. Define canonical municipality-code mapping and explicit aliases from verified source evidence.
2. Validate mapping uniqueness and coverage.
3. Keep national counts for unmatched source rows and expose an explicit unmatched report.
4. Add tests for aliases, duplicate mappings, unknown names, and all current source municipalities.

# Validation Steps
Run competition/GIS tests, npm test, and npm run build.

# Acceptance Criteria
Every mapped source name resolves deterministically to one code; unmatched names are visible and never guessed.

# Deliverables
Mapping contract, tests, and user-facing unmatched diagnostics.

# Output Format
List confirmed aliases and coverage counts; distinguish unresolved names.
```

### TASK-021 — Päätä yksilöllisen muutostekijän audit trail -tarve

- **Tarkoitus:** Ratkaise, riittävätkö yhteiset roolit yhteisen suunnitelman hallintaan.
- **Syy:** nykyisestä mallista ei voi tunnistaa muutoksen tehnyttä henkilöä.
- **Riippuvuudet:** Tuote-/hallintapäätös.
- **Työmäärä / riski:** 3–8 pv toteutukselle / korkea.
- **Odotettu tulos:** kirjallinen päätös ja tarvittaessa minimoitu käyttäjäkohtainen muutosloki.
- **Vaikutettavat tiedostot:** päätöksen mukaan auth-palvelu, planner-store, PHP-schema, dokumentaatio ja testit.
- **Validointi:** hyväksytty tietosuojan ja käyttöoikeuksien malli; kirjautumis-/muutos-/poistamistestit.
- **Hyväksymiskriteerit:** omistaja, säilytysaika ja audit-tietosisältö on päätetty; koodiin ei jää perusteettomia henkilötietoja.
- **Valmis Copilot Agent -kehote:**

```text
# Context
Writer and Admin credentials are shared. The planner stores no individual actor identity, so changes cannot be attributed to a person.

# Objective
Implement only the approved accountability model for shared planning changes.

# Scope
First inspect existing identity, session, persistence, and privacy documentation. If no approved product decision exists, produce a decision record and do not invent an identity provider.

# Constraints
Minimize personal data, define retention/access, preserve current role authorization, and never log secrets or session tokens.

# Files To Review
server/planner.php, server/setup-auth.php, src/services/authService.ts, src/state/plannerStore.ts, src/models/region.ts, sovelluksen-esittely.md.

# Detailed Implementation Steps
1. Document whether individual attribution is required and who owns the decision.
2. If approved, select the smallest identity mechanism and add actor/time metadata to an append-only audit event.
3. Define retention and restricted access.
4. Test authorization, redaction, and event creation.

# Validation Steps
Run auth/planner tests and review stored events for data minimization.

# Acceptance Criteria
Either an approved decision record explains acceptance of shared-role limitations, or an authorized implementation provides reliable actor attribution without leaking credentials.

# Deliverables
Decision record and, only if approved, implementation, tests, and retention instructions.

# Output Format
State the decision, assumptions, data stored, access, and validation.
```

### TASK-022 — Mitoita JSON-tallennuksen kasvurajat

- **Tarkoitus:** Määritä mittausperusteinen siirtymäraja tiedostotallennukselle.
- **Syy:** koko seuratiedosto validoidaan ja kirjoitetaan jokaisessa muutoksessa.
- **Riippuvuudet:** Ei ole.
- **Työmäärä / riski:** 2–5 pv / matala mittaukselle; migraatio erillinen.
- **Odotettu tulos:** benchmark ja hyväksytyt p95-/payload-rajat.
- **Vaikutettavat tiedostot:** API-testit/benchmarkit, README/operointidokumentti.
- **Validointi:** 185, 1 000, 5 000 ja 10 000 seuran synteettiset aineistot ilman henkilötietoja.
- **Hyväksymiskriteerit:** vasteaika, lukon kesto, tiedostokoko ja muistin käyttö raportoidaan; migraatiota ei aloiteta ilman rajan ylitystä.
- **Valmis Copilot Agent -kehote:**

```text
# Context
The PHP API reads, validates, and serializes the whole club JSON file per request; writes replace the whole file under a lock. The API caps the store at 10,000 records and 10 MiB.

# Objective
Measure current storage scaling and establish evidence-based migration thresholds.

# Scope
Create a reproducible local benchmark using synthetic non-sensitive data; do not migrate storage in this task.

# Constraints
Never use production personal data. Do not weaken validation or lock semantics for benchmark speed.

# Files To Review
server/clubs-api.php, server/planner.php, tests/clubs-api.test.mjs, package.json, README.md.

# Detailed Implementation Steps
1. Generate deterministic synthetic club stores at representative sizes.
2. Measure public GET, validation, write, lock duration, memory, and payload size.
3. Record environment and repeatability limits.
4. Recommend measurable thresholds and a future storage migration trigger.

# Validation Steps
Run benchmark locally multiple times and verify generated fixtures contain no real personal data.

# Acceptance Criteria
Results include 185/1k/5k/10k sizes and clearly identify the point where latency or limits become unacceptable.

# Deliverables
Benchmark harness and a short capacity decision.

# Output Format
Provide measurements, environment, thresholds, and recommendation; make no unmeasured scalability claims.
```

### TASK-023 — Yhtenäistä salasanapolitiikan validointi

- **Tarkoitus:** Varmista, että ensialustus ja Adminin salasananvaihto käyttävät samoja sääntöjä.
- **Syy:** politiikan rinnakkaiset PHP-toteutukset voivat erkaantua.
- **Riippuvuudet:** Ei ole.
- **Työmäärä / riski:** 1 pv / matala.
- **Odotettu tulos:** sama rajatapaustesti kattaa molemmat polut.
- **Vaikutettavat tiedostot:** `server/setup-auth.php`, `server/planner.php`, auth-testit.
- **Validointi:** 11/12 merkkiä, UTF-8, tavuraja ja PHP-algoritmifallback.
- **Hyväksymiskriteerit:** samat inputit hyväksytään/hylätään samalla tavalla molemmissa poluissa.
- **Valmis Copilot Agent -kehote:**

```text
# Context
Initial password setup and Admin password changes independently implement the same minimum length, byte limit, and password algorithm fallback.

# Objective
Prevent password-policy drift between the two PHP code paths.

# Scope
Extract a small shared validation/hash policy or add a contract test if shared loading is not appropriate.

# Constraints
Preserve current 12-character minimum, maximum byte behavior, Argon2id preference, fallback behavior, and generic error responses.

# Files To Review
server/setup-auth.php, server/planner.php, tests/planner-api.test.mjs.

# Detailed Implementation Steps
1. Compare both current rules and edge cases.
2. Centralize the shared policy in a CLI-safe/server-safe helper or write shared contract tests.
3. Verify both setup and password-change paths use identical logic.

# Validation Steps
Run auth tests and PHP lint for all affected files.

# Acceptance Criteria
The same boundary inputs have the same outcome in both flows and no credential is logged or emitted.

# Deliverables
Minimal shared implementation/tests and updated policy documentation.

# Output Format
Summarize shared rules and boundary-test results.
```

# Dependency Analysis

## Riippuvuudet ja kriittinen polku

```text
TASK-001 -> TASK-007 -> TASK-008 -> TASK-009
TASK-012 -> TASK-013
```

- **Kriittinen polku:** TASK-001 → TASK-007 → TASK-008 → TASK-009. Tämä muodostaa toistettavan release-portin, atomisen aktivoinnin ja varmennetun palautuksen.
- **Muita rinnakkaisia polkuja:** TASK-002 (aikaleima), TASK-003 (rate limiter), TASK-004 (API-skeema), TASK-005 (backup), TASK-011 (README) ja TASK-014 (provenienssi) voidaan toteuttaa itsenäisesti.
- **Edellytykset:** TASK-008 edellyttää staging-ympäristön tai vastaavan palautettavan testipolun; TASK-014 edellyttää aineiston omistajan/lähteen selvitystä. TASK-020 ei saa arvata kuntanimiä.
- **Estäjät:** tuotantopalvelimen deploy-tiedostojärjestelmän atomisuus/symlink-tuki on vahvistettava ennen TASK-008:aa. Haarasuojausten asetuksia ei voitu lukea auditointisessiosta.

## Nopeasti toteutettavat ja korkean arvon työt

- **Nopeat voitot:** TASK-001, TASK-002, TASK-011, TASK-023.
- **Korkein riskin vähennys:** TASK-003, TASK-004, TASK-005, TASK-007, TASK-008 ja TASK-009.
- **Korkea arvo kohtuullisella riskillä:** TASK-006 ja TASK-010.
- **Korkean toteutusriskin työt:** TASK-004 (vanhojen dokumenttien yhteensopivuus), TASK-008 (palvelimen julkaisumalli), TASK-018 (laaja refaktorointi), TASK-020 (aliasmäppäys) ja TASK-021 (identiteetti-/tietosuojapäätös).
- **Ei aloiteta ilman näyttöä:** tietokantamigraatio tai suuri infrastruktuuriuudistus. TASK-022 mittaa kapasiteetin ensin.

# Execution Order

## Ensimmäiset 10 tehtävää

1. TASK-001 — korjaa toistettavuus.
2. TASK-002 — korjaa lähteen päivitysaika.
3. TASK-003 — rajaa limiterin kasvuriski.
4. TASK-004 — syvennä planner-skeema.
5. TASK-005 — varmista seuradatan palautettavuus.
6. TASK-006 — lisää tietoturvaskannaus.
7. TASK-007 — estä deploy ilman vihreää validointia.
8. TASK-008 — tee julkaisu atomiseksi ja rollbackattavaksi.
9. TASK-009 — lisää deployn smoke check.
10. TASK-010 — lisää turvallinen operatiivinen observability.

## Ensimmäisen viikonloppujakson suunnitelma

- **Lauantai:** TASK-001:n toistot ja korjaus; TASK-002:n API/UI-aikaleimasopimus ja testit.
- **Sunnuntai:** TASK-003:n limiterin puhdistus ja testit; TASK-011:n README-korjaus. Älä muuta deploy-protokollaa suoraan tuotannossa viikonlopun aikana.
- **Valmis, kun:** yksikkötestit/build ovat vihreät, migraatiotesti toistuu 10 kertaa, API:n päivitysaika on semanttisesti oikein ja README vastaa kerrostoimintaa.

## Ensimmäisen kuukauden suunnitelma

- **Viikko 1:** TASK-001–TASK-006; korjaa datan ja authin ensisijaiset riskit.
- **Viikko 2:** TASK-007–TASK-010 stagingissa; älä julkaise uutta deploy-rakennetta ennen keskeytys-/rollback-testiä.
- **Viikko 3:** TASK-011–TASK-016: dokumentaatio, GIS-laatu, kattavuus ja selaintestit.
- **Viikko 4:** TASK-017–TASK-019: kartan saavutettavuus, PlannerAppin ensimmäinen rajattu refaktorointi ja bundle-mittaus.

## Ensimmäisen neljänneksen suunnitelma

- **Kuukausi 1:** testien, authin, datan ja deployn riskit; kaikki P1-tehtävät.
- **Kuukausi 2:** provenienssi, GIS-päivityskäytäntö, selainten kattavuus, PlannerApp-refaktorointi ja bundle-budjetti.
- **Kuukausi 3:** kuntakoodipohjainen liitos, audit trail -päätös ja JSON-tallennuksen benchmark; tee tietokanta-/identiteettipäätös vain mittaus- ja omistajapäätösten perusteella.

## Solo-kehittäjän suositeltu toteutusjärjestys

Tee yksi tehtävä kerrallaan, mieluiten omaan lyhytikäiseen haaraan. Aloita aina fokustestillä, pidä koodimuutos pienimpänä mahdollisena, aja siihen liittyvät testit sekä `npm run build`, ja päivitä tämän tiedoston tehtävän tila, tulos, muutospäiväkirja ja seuraava suositus samassa PR:ssä. Korkean riskin TASK-004, TASK-008 ja TASK-021 vaativat ensin hyväksytyn suunnittelupäätöksen tai staging-validoinnin.

# Ready-to-Run Copilot Tasks

Alla olevat TASK-001–TASK-023 sisältävät kullekin tehtävälle valmiin englanninkielisen GitHub Copilot Agent -kehotteen. Kopioi yhden tehtävän kehote kerrallaan. Promptien englanninkieliset tekniset osat ovat tarkoituksellisia; sovelluksen näkyvä teksti ja käyttäjädokumentaatio pidetään suomeksi.

# Owner Takeover Plan

Pisteet ovat asteikolla 1–5 järjestyksessä **vaikutus / kiireellisyys / riskin vähennys / ylläpidettävyys / skaalautuvuus**.

## Ensimmäiset 10 toimintoa

1. Korjaa migraatiotestin alustusjärjestys — TASK-001 — **5/5/4/3/2**.
2. Korjaa seuradatan virheellinen päivitysaikaleima — TASK-002 — **4/5/4/3/2**.
3. Rajaa kirjautumisrajoituksen vanhat merkinnät — TASK-003 — **5/5/5/3/3**.
4. Määritä planner-skeeman syvät rajat — TASK-004 — **5/4/5/4/3**.
5. Lisää seurarekisterin palautuspiste — TASK-005 — **5/4/5/3/3**.
6. Lisää PR-tietoturvaskannaus — TASK-006 — **4/4/4/3/3**.
7. Kytke deploy validoinnin tulokseen — TASK-007 — **5/5/5/3/3**.
8. Rakenna atominen release ja rollback — TASK-008 — **5/4/5/4/4**.
9. Lisää deployn jälkeinen smoke check — TASK-009 — **4/4/4/3/3**.
10. Lisää PII-turvallinen operointitelemetria — TASK-010 — **4/3/4/4/3**.

## Ensimmäiset 25 toimintoa

11. Korjaa README:n kilpailukarttaväite — TASK-011 — **3/4/2/3/2**.
12. Tee geometrian osittaisesta hylkäyksestä näkyvä — TASK-012 — **4/3/4/4/3**.
13. Koveta kuntarajojen nouto- ja rakennusskripti — TASK-013 — **4/3/4/4/3**.
14. Selvitä kilpailu- ja väestöaineiston alkuperä — TASK-014 — **4/3/4/3/3**.
15. Ota käyttöön testikattavuuden baseline — TASK-015 — **3/3/3/4/3**.
16. Laajenna valitut testit toiseen selainmoottoriin — TASK-016 — **3/2/3/3/3**.
17. Testaa planner-kartan saavutettavuus — TASK-017 — **4/3/4/4/3**.
18. Erottele PlannerAppin auth- ja orchestration-vastuut — TASK-018 — **4/2/3/5/4**.
19. Pienennä pää-chunkia budjetilla — TASK-019 — **4/3/3/4/4**.
20. Lisää kuntanimi–kuntakoodi-aliasmäppäys — TASK-020 — **4/2/4/4/5**.
21. Päätä yhteistunnusten audit trail -tarve — TASK-021 — **4/2/4/3/3**.
22. Mittaa JSON-tallennuksen skaalautumisraja — TASK-022 — **3/2/3/4/5**.
23. Yhtenäistä salasanapolitiikan koodi — TASK-023 — **3/2/3/4/2**.
24. Tarkista GitHubin branch protection -vaatimukset omistajan oikeuksilla — asetustarkistus — **5/4/5/3/2**.
25. Vahvista tuotantopalvelimen deploy-polku ja rollbackin filesystem-edellytykset stagingissa — TASK-008:n esityö — **5/4/5/4/3**.

## Ensimmäiset 50 toimintoa

26. Lisää release-SHA näkyviin diagnostiikkaan — TASK-009 — **3/3/3/3/2**.
27. Määritä uptime/health-hälytyksen omistaja — TASK-010 — **4/3/4/3/3**.
28. Tee backupin palautusharjoitus erillisessä ympäristössä — TASK-005 — **5/3/5/3/3**.
29. Mittaa deployn keskeytystilanne ja todista vanhan version pysyvyys — TASK-008 — **5/3/5/4/3**.
30. Ota käyttöön SHA-pinnatut Actions-viittaukset — TASK-006/Workflow — **3/2/3/4/2**.
31. Tarkista riippuvuuksien päivitysbotin omistajuus — TASK-006 — **3/2/3/4/3**.
32. Lisää API-skeeman virheellisten payloadien regression corpus — TASK-004 — **4/3/4/4/3**.
33. Mittaa p95-kirjoituslukko 1 000 seuralla — TASK-022 — **3/2/3/4/4**.
34. Mittaa p95-kirjoituslukko 5 000 seuralla — TASK-022 — **3/2/3/4/5**.
35. Hyväksy ja kirjaa JSON→tietokanta-trigger vasta mittauksen jälkeen — TASK-022 — **4/2/4/4/5**.
36. Tarkista kuntarajapäivityksen 308 koodin kattavuus CI:ssä — TASK-013 — **4/3/4/4/3**.
37. Tee kilpailun kuntaliitoksen unmatched-lista käyttäjälle havaittavaksi — TASK-020 — **4/3/4/4/4**.
38. Varmista että lähdeprovenienssin tuntemattomat tiedot pysyvät “ei tiedossa” -arvoina — TASK-014 — **3/2/3/3/3**.
39. Suorita planner-kartan näppäimistöpolku ruudunlukijalla — TASK-017 — **4/3/4/4/3**.
40. Aja kartan selaintestit Firefoxissa tai WebKitissä — TASK-016 — **3/2/3/3/3**.
41. Aseta mitattu ja realistinen coverage-ratchet — TASK-015 — **3/2/3/4/3**.
42. Aseta päätetty bundle-budjetti ja CI-seuranta — TASK-019 — **3/2/3/4/4**.
43. Erota PlannerAppin auth/session-hook — TASK-018 — **4/2/3/5/3**.
44. Erota PlannerAppin kartta-asetukset ja map toolbar — TASK-018 — **3/2/3/4/3**.
45. Erota planner-näkymien navigaatio — TASK-018 — **3/2/3/4/3**.
46. Tarkista PHP-lokien henkilötietojen redaktointi — TASK-010 — **4/3/5/4/2**.
47. Tarkista API:n virhetilanteiden health-hälytys — TASK-010 — **4/3/4/3/3**.
48. Päivitä operointiohje jokaisen deploy-/backup-muutoksen jälkeen — TASK-005/TASK-008/TASK-010 — **3/3/3/4/3**.
49. Tarkista lähdeaineistojen lisenssit ennen merkittävää uudelleenjulkaisua — TASK-014 — **5/3/5/3/2**.
50. Tee neljännesvuosittainen repo-terveyden katselmointi ja päivitä tämä seurantadokumentti — ohjelma — **4/2/4/5/5**.

# Projektin seuranta

## Tehtävätaulukko

| Tehtävä | Tila | Prioriteetti | Työmäärä | Riippuvuudet |
|---|---|---:|---:|---|
| TASK-001 | Ei aloitettu | P1 | 0,5–1 pv | — |
| TASK-002 | Ei aloitettu | P1 | 1–2 pv | — |
| TASK-003 | Ei aloitettu | P1 | 1–2 pv | — |
| TASK-004 | Ei aloitettu | P1 | 2–4 pv | — |
| TASK-005 | Ei aloitettu | P1 | 1–3 pv | — |
| TASK-006 | Ei aloitettu | P2 | 1–2 pv | — |
| TASK-007 | Ei aloitettu | P1 | 1–2 pv | TASK-001 |
| TASK-008 | Ei aloitettu | P1 | 3–5 pv | TASK-007 |
| TASK-009 | Ei aloitettu | P2 | 1–3 pv | TASK-008 |
| TASK-010 | Ei aloitettu | P2 | 2–4 pv | — |
| TASK-011 | Ei aloitettu | P2 | 0,5 pv | — |
| TASK-012 | Ei aloitettu | P2 | 2–4 pv | — |
| TASK-013 | Ei aloitettu | P2 | 2–3 pv | TASK-012 |
| TASK-014 | Ei aloitettu | P2 | 2–5 pv | — |
| TASK-015 | Ei aloitettu | P2 | 1–3 pv | — |
| TASK-016 | Ei aloitettu | P2 | 1–3 pv | — |
| TASK-017 | Ei aloitettu | P2 | 2–4 pv | — |
| TASK-018 | Ei aloitettu | P2 | 1–2 vk | TASK-001 |
| TASK-019 | Ei aloitettu | P2 | 2–4 pv | — |
| TASK-020 | Ei aloitettu | P3 | 2–4 pv | — |
| TASK-021 | Ei aloitettu | P2 | 3–8 pv | Tuote-/hallintapäätös |
| TASK-022 | Ei aloitettu | P3 | 2–5 pv | — |
| TASK-023 | Ei aloitettu | P2 | 1 pv | — |

**Sallitut tilat:** Ei aloitettu, Suunnitteilla, Käynnissä, Testattavana, Valmis, Estynyt, Peruttu.

## Toteutuksen Edistymisen Seuranta

- **Kokonaisvalmistumisaste:** 0 % parannusbacklogista. Auditointi ja baseline-validointi on tehty; niitä ei lasketa toteutustehtäviksi.
- **Valmiit tehtävät:** 0.
- **Käynnissä olevat tehtävät:** 0.
- **Myöhässä olevat tehtävät:** 0 (tehtäville ei ole asetettu eräpäiviä).
- **Estyneet tehtävät:** 0. TASK-014:n provenienssin selvitystulos voi jäädä omistajasta riippuvaksi; merkitse Estynyt vasta kun selvitys on aloitettu ja tarvittava tieto puuttuu.

## Muutosloki

| Päivä | Tehtävä | Muutos | Tulos |
|---|---|---|---|
| 2026-11-03 | AUDIT-0001 | Koko repositorion baseline-auditointi, build/test/npm audit ja GitHub Actions -tilan tarkistus | Raportti ja 23 tehtävän backlog luotu; sovelluskoodia ei muutettu. |

## Päätösloki

| Päivä | Päätös | Peruste | Vaikutus |
|---|---|---|---|
| 2026-11-03 | Säilytetään JSON-tallennus nykyisessä datakoossa ja mitataan kasvukynnys ennen tietokantamigraatiota. | Nykyinen datasetti on pieni, ja repositoriossa on toimivia revision-/lukituskontrolleja; mitoitusdata puuttuu. | Vältetään ennenaikainen uudelleenkirjoitus. |
| 2026-11-03 | Yhteiskäyttöisten tunnusten jatkosta ei päätetä auditoinnissa. | Henkilökohtaisen jäljitettävyyden tarve on tuote-/hallintapäätös. | TASK-021 edellyttää omistajan päätöstä. |
| 2026-11-03 | Auditointi ei muuta tuotantokoodia. | Pyyntö koski analyysiä, suunnitelmaa ja Copilot-tehtäviä. | Ainoastaan tämä raporttitiedosto lisätään. |

## Riskiloki

| Päivä | Riski | Vakavuus | Hallinta |
|---|---|---|---|
| 2026-11-03 | Kirjautumisyritysten JSON kasvaa eri IP-osoitteista eikä vanhene globaalisti. | Keskitaso | TASK-003: globaali vanheneminen ja yläraja. |
| 2026-11-03 | Deploy voi keskeytyä aktiivisen hakemiston osittaisen synkronoinnin aikana. | Keskitaso | TASK-008: staging, release-hakemistot, atominen aktivointi ja rollback. |
| 2026-11-03 | Seuradata näytetään pyynnön aikaleimalla lähteen päivitysaikana. | Keskitaso | TASK-002: erillinen, todennettu lähdeaikaleima. |
| 2026-11-03 | Paikallinen migraatio-E2E epäonnistuu toistossa, vaikka viimeisin Actions-ajo on vihreä. | Keskitaso | TASK-001: korjaa fixture-järjestys ja toistettavuus. |
| 2026-11-03 | Kilpailu- ja väestöaineiston provenienssi/oikeusperusta ei ole täysin tiedossa. | Keskitaso | TASK-014: selvitä omistaja ja merkitse tuntemattomat arvot. |

## Toteutuspäiväkirja

| Päivä | Tehty työ | Tulos |
|---|---|---|
| 2026-11-03 | Tarkastettu lähdekoodi, JSON-aineistot, CI/deploy, testit, dokumentaatio ja riippuvuudet; ajettu build, unit-testit, E2E-testit ja npm audit. | Build ja unit-testit onnistuvat; E2E:ssä yksi paikallisesti toistuva migraatiotestin epäonnistuminen; npm audit raportoi 0 haavoittuvuutta. |

## Opitut Asiat

- Vihreä GitHub Actions -ajo ei yksin osoita paikallisen selaintestin determinismiä; ristiriita pitää sulkea toistolla.
- API:n kentän nimi `generatedAt` ei tee arvosta aineiston päivitysaikaa. Lähde- ja pyyntöajat tulee erottaa sopimuksessa.
- Tiedostojen atominen kirjoitus suojaa osittaiselta tiedostolta, mutta ei korvaa varmuuskopioita eikä atomista julkaisua.
- Kuntien nimipohjainen liitos toimii nykyisille nimille, mutta kuntakoodi olisi vakaampi avain uusille lähdeversioille.
- Nykyinen pieni kuorma ei riitä perustelemaan tietokantamigraatiota; benchmark tulee ennen arkkitehtuurinvaihtoa.

## Teknisen Velan Seuranta

| Velka | Lähtötila | Seurantamittari | Tavoite |
|---|---|---|---|
| PlannerAppin vastuurajat | 651 riviä, auth/data/UI/map useassa vastuualueessa | komponentin/hookien vastuu, muuttuneiden tiedostojen laajuus | erilliset testattavat orchestration- ja näkymärajat |
| Etusivun bundle | 529,01 kB minifioituna | main chunkin minified/gzip-koko | sovittu budjetti alle Viten varoitusrajan |
| Testikattavuus | ei raporttia | coverage per palvelu-/API-alue | mitattu baseline ja asteittainen ratchet |
| Tietolähteiden provenienssi | kilpailu- ja väestölähteillä alkuperätietoja puuttuu | täytetty lähde-/lisenssikenttä | kaikki tunnetut lähteet dokumentoitu, tuntematon merkitty |
| JSON-tallennuksen kapasiteetti | 10 MiB / 10 000 seuraa -raja; suorituskykyä ei mitattu | p95-luku-/kirjoitusaika, lukon kesto | dokumentoitu migraatiokynnys |
| Deploy-palautettavuus | suora `rsync --delete` aktiiviseen hakemistoon | julkaisu-/rollback-testit | atominen julkaisu ja palautusharjoitus |

## Seuraavaksi Suositeltu Tehtävä

**TASK-001 — Vakauta selaimen migraatiotesti.**

- **Miksi seuraavaksi:** se on nopea, konkreettisesti havaittu testivika ja testien vihreys on edellytys turvalliselle CI-gatingille.
- **Odotettu hyöty:** paikalliset ja pilvitulokset ovat vertailukelpoisia, ja plannerin datamigraation tärkeä suojaus voidaan todentaa.
- **Arvioitu työmäärä:** 0,5–1 työpäivä.
- **Riskit:** testin korjaaminen voi paljastaa, että tuotantokoodissa on erillinen todellinen migraatio-ongelma; älä peitä sitä odotuksilla tai ohittamalla testi.

## Projektin Nykytila

Auditoinnin jälkeen sovelluskoodin toteutustila on ennallaan. Kilpailukerros on kahdessa olemassa olevassa kartassa; erillistä kilpailukarttaa ei ole. PR #81:n sisältö on yhdistetty `main`-haaraan. Build ja yksikkötestit läpäisevät; yksi selaimen migraatiotesti epäonnistui paikallisessa täydessä ja yksittäisessä ajossa, vaikka viimeisin GitHub Actions -validointiajo oli onnistunut. `npm audit` ei löytänyt advisoreita.

Seuraavan kehittäjän tulee aloittaa TASK-001:stä, eikä tehdä laajaa refaktorointia ennen kuin testin alustusjärjestys ja baseline ovat vakaat. Tuotantodeployn filesystem-oletukset ja haarasuojausten asetukset ovat vielä vahvistamatta. Tuotantodata-/palvelinpalautusta tai todellista käyttäjäkuormaa ei ole tässä auditoinnissa tarkastettu.
