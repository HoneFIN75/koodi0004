# Kilpailuaineiston integraatioraportti

## 1. Lähde ja arkkitehtuuri

Alkuperäinen tiedosto on `public/data/SFL-Kilpailut_lopullinen.json`.
Se sisältää 2 304 kilpailutapahtumaa, joista 64 sisältää useita kuntia.
Vite kopioi tiedoston sellaisenaan polkuun
`dist/data/SFL-Kilpailut_lopullinen.json`; tuotannon URL on sovelluksen
hakemistoon suhteutettu `./data/SFL-Kilpailut_lopullinen.json`.
Kilpailut eivät kuulu `jsondb/seurat.json`-tiedostoon, kuntarajoihin,
väestötiedostoon tai palvelimelle tallennettavaan suunnitelmaan.
PHP-rajapinta, Writer/Admin-oikeudet ja suunnitelman versio eivät muutu.

`competitionRepository.getCompetitions` käyttää yhteistä latauslupausta.
Onnistunut lataus ja normalisointi tehdään kerran; epäonnistunut lataus
vapautetaan nimenomaista uudelleenyritystä varten. Normalisoidut tietueet,
nimi- ja vuosihakemistot sekä malli-, luokitus- ja järjestäjäindeksit
uudelleenkäytetään. `useCompetitions` laskee yhden muistitetun suodatetun
tapahtumajoukon ja sen analyysin nykyiselle reitille. Sama Zustand-kauppa
ylläpitää suodattimia ja tapahtumavalintaa molemmilla reiteillä.
`createCompetitionScopeLookup` rakentaa aktiivisen joukon isäntä- ja
liittymäindeksit kerran ja välimuistittaa kuntajoukkojen unionit.
Kunta-, alue-, skenaario- ja varmuuskopio-osiot eivät selaa koko
kilpailuaineistoa erikseen jokaisella renderöinnillä.

Nykyiset seura-, väestö-, muokkaus- ja karttatasojen suodattimet eivät muutu
kilpailusuodattimiksi. Kilpailuilla on oma, selkeästi nimetty yhteinen
suodatinryhmä; kaikkien **kilpailulukujen** lähde on sama aktiivinen rajaus.
Seuralukuja ei karsita vain siksi, ettei kunnassa ole kilpailua.

## 2. Tiedostoinventaario

### Uudet tiedostot

| Tiedosto | Tehtävä |
|---|---|
| `public/data/SFL-Kilpailut_lopullinen.json` | Muuttumaton erillinen lähdeaineisto |
| `src/models/competition.ts` | Tapahtumien, paikkojen, suodattimien ja indeksien tyypit |
| `src/data/competitionRepository.ts` | Yhteinen lataus, validointi ja uudelleenyritys |
| `src/services/competitionService.ts` | Normalisointi, tunnisteet, kohdistus, indeksit, suodatus, laskenta, päivämäärät ja vuosivärit |
| `src/state/competitionStore.ts` | Reittien yhteinen katselutila ja valinta |
| `src/state/useCompetitions.ts` | Lataustila, virheet, muistitetut tulokset ja analyysi |
| `src/components/CompetitionPanel.tsx` | Kaikki suodattimet, yhteenvedot, kaaviot, luettelo, aineistohuomautukset ja oma vienti |
| `src/components/CompetitionLayerControl.tsx` | Kummankin kartan näkyvyysvalinta ja vuosiväriselite |
| `src/components/CompetitionDetails.tsx` | Kaikki kilpailun tiedot ja radat kunnittain |
| `src/components/CompetitionScope.tsx` | Yhteinen kunta-/alue-/kattavuus-/vertailuosio |
| `src/services/competitionMapService.ts` | Paikallinen SVG-ikoni, turvallinen popup, klusterikerros ja kaikkien kuntien korostus |
| `src/services/competitionExportService.ts` | Erilliset tapahtuma-JSON/CSV sekä Excelin kilpailurivit |
| `src/services/competitionScopeService.ts` | Suodatetun joukon yhteiset paikkaindeksit ja välimuistitetut unionit |
| `src/services/competitionPresentation.ts` | Jaetut suomenkieliset luokkajaon esitystekstit |
| `tests/competitions.test.mjs` | Aineistopalvelun ja laskentasääntöjen yksikkötestit |
| `tests/competition-integration.test.mjs` | Jaetun tilan sekä kilpailu- ja suunnitelmavientien testit |
| `tests/browser/competitions.spec.ts` | Kartat, klusterointi, suodattimet, reittivaihto, haut, virheet, vienti ja saavutettavuus |
| `scripts/audit-competitions.mjs` | Toistettava koko aineiston tarkistus |
| `COMPETITION-DATA-QUALITY.json` | Täydellinen koneellisesti tuotettu laatuliite ja lähteen SHA-256 |
| `COMPETITION-INTEGRATION.md` | Tämä raportti |

### Muutetut tiedostot ja komponentit

| Tiedosto / komponentti | Integraatio |
|---|---|
| `src/App.tsx` / `App` | Julkisen reitin yhteinen kilpailukonteksti ja paneeli |
| `src/components/MapView.tsx` / `MapView` | Kilpailuklusterit ja kuntien korostus; seuratooltipin suodatetut isäntä-/liittymälaskurit |
| `src/components/ClubDetail.tsx` / `ClubDetail` | Seuran kohdistetun kotikunnan kilpailut; ei oletettua järjestäjäsuhdetta |
| `src/components/PopulationExplorer.tsx` / `PopulationExplorer` | Kuntataulukon kilpailut ja asukasluvulla normalisoidut luvut; valittujen kuntien kilpailuvertailu |
| `src/planner/PlannerApp.tsx` / `PlannerApp` | Yhteinen konteksti kaikille suunnittelun näkymille sekä vientiin |
| `src/planner/components/RegionMap.tsx` / `RegionMap` | Sama klusterikerros, kuntien korostus sekä kunta-/aluetooltipit |
| `src/planner/components/RegionList.tsx` / `RegionList` | Alueiden suodatetut ensisijaiset tapahtumaluvut |
| `src/planner/components/RegionDetail.tsx` / `RegionDetail` | Isäntätapahtumat, liittyvät tapahtumat, radat/paikat kilpailun tiedoissa ja väestöön suhteutus |
| `src/planner/components/MunicipalityCard.tsx` / `MunicipalityCard` | Kunnan isäntä- ja liittymälaskenta, vuosijoukko ja kilpailuluettelo |
| `src/planner/components/DashboardView.tsx` / `DashboardView` | Skenaarion kattavuus, alueiden kilpailukaavio ja kilpailut / 10 000 asukasta |
| `src/planner/components/ComparisonView.tsx` / `ComparisonView` | Aluekohtaiset ensisijaiset/liittyvät kilpailut, väestöön suhteutus, kaavio ja alueiden unionin uniikit tapahtumat |
| `src/planner/components/UnassignedView.tsx` / `UnassignedView` | Kohdistamattomien kuntien kilpailukattavuus ja kuntataulukon kilpailuluvut |
| `src/planner/components/ScenarioManager.tsx` / `ScenarioManager` | Jokaisen skenaarion käytössä olevien alueiden kilpailukattavuus |
| `src/planner/components/BackupManager.tsx` / `BackupManager` | Tilannekuvien aluemääritysten kilpailukattavuus nykyisellä viiteaineistolla |
| `src/planner/components/DataManager.tsx` / `DataManager` | Suodatettujen kilpailutietojen vientisisällön selitys |
| `src/services/exportService.ts` | Suunnitelmavientien kilpailuanalyysit, kuntarivit, aluerivit ja erillinen Excel-välilehti |
| `src/styles.css` | Yhteiset teemat, responsiiviset suodattimet/listat, korimerkit ja klusterit |
| `playwright.config.ts` | Uuden data-hakemiston tarjoilu tuotannon alihakemiston selaintesteissä |
| `tests/browser/planner.spec.ts` | Kaikkien näkymien 14 teema-/saavutettavuusauditoinnin testikohtainen aikaraja 60 sekuntia; mitään auditointia ei poistettu |
| `README.md` | Käyttö, katselutilan elinkaari, arkkitehtuuri, tuotanto ja auditointi |

## 3. Kartat, käyttöliittymä ja valinta

Molemmat nykyiset karttanäkymät (`MapView`, `RegionMap`) käyttävät
`addCompetitionMapLayer`-toteutusta. Oletuksena yhtään kilpailumerkkiä ei
piirretä. Yksi kelvollisesti kohdistettu ensisijainen kunta tuottaa yhden
päämerkin sen olemassa olevaan `labelPoint`-edustuspisteeseen. Kilpailu ei
tuota sivukuntien päämerkkejä. Ratakoordinaatteja ei aineistossa ole,
eikä niitä tai yhteysviivoja keksitä.

Merkki on paikallinen, kevyt SVG, jossa on frisbeegolfkori ja kiekko,
valkoinen kontrastipohja ja tumma ääriviiva. Vuosi on sekä merkin tekstissä
että tooltipissa, popupissa, saavutettavassa nimessä ja tietopaneelissa.
Karttatasojen selite kertoo väri–vuosi-vastaavuuden molemmissa kartoissa.
Väri ei ole ainoa vuosimerkintä.

Olemassa oleva `leaflet.markercluster` ryhmittelee päämerkit. Klusterin
luku on sen sisältämien yksilöllisten tapahtumamerkkien määrä.
Spiderfying avaa myös samaan kuntapisteeseen sijoittuvat kilpailut;
kunkin avautuvan merkin oma vuosiväri säilyy. Klusterit ja yksittäiset
merkit ovat näppäimistöllä avattavia. Vähennetty liike huomioidaan.
Näkyvyysrajaus välttää piilotettujen merkkien piirtämisen.

Kilpailun valinta kartalta tai tekstiluettelosta käyttää samaa vakaata
tunnistetta. Kaikki kohdistetut ensisijaiset ja muut kunnat korostetaan
erillisellä reunus-/täyttökerroksella. Korostus ei muuta suunnitelman
kuntajäsenyyttä tai alueiden värejä. Vanhat kerrokset, popupsisältö ja
valintakutsut siivotaan suodatuksen tai kartan purkamisen yhteydessä.

`CompetitionDetails` näyttää ensisijaisen kunnan ensin, muut kunnat
erikseen ja jokaisen radan oman kuntansa alla. Lisäksi näytetään nimi,
vuosi, järjestäjä, kilpailumalli, luokkajako, PDGA-luokitus, alku- ja
loppupäivä, mahdollinen kesto sekä aineiston huomautukset.
Tietoja käsitellään tekstinä, ei lähdeaineistosta suoritetuksi HTML:ksi.
Tekstiluettelo tarjoaa kartasta riippumattoman vaihtoehdon ja lisää
tapahtumia erissä; jokainen suodatettu kilpailu on saavutettavissa.

## 4. Yhteiset suodattimet ja vuodet

`competitionStore` sisältää näkyvyyden (`hidden`, `all`, `years`),
vuosijoukon, tekstihakua, kilpailumallia, PDGA-luokitusta, järjestäjää,
kuntaa ja aluetta koskevat arvot sekä valitun tapahtumatunnisteen.
`useCompetitions` käyttää samaa tilaa kummallakin reitillä.

* **Piilota kilpailut:** tyhjä aktiivinen kilpailujoukko ja karttakerros.
* **Kaikki kilpailut / kaikki vuodet:** kaikki aineiston vuosiarvot;
  muut aktiiviset kilpailusuodattimet ovat edelleen voimassa.
* **Valitut vuodet:** yhden tai usean valitun vuoden tapahtumien unioni.
* **Tyhjä vuosivalinta:** tyhjä kilpailujoukko ja karttakerros.

Vuosivaihtoehdot johdetaan aineistosta, ei kovakoodatusta listasta.
Yksittäisen vuosirastin muuttaminen kaikki-vuodet-tilassa aloittaa
valittujen vuosien tilan aineiston koko vuosijoukosta. Haku ja
kuntasuodatin huomioivat myös muut kunnat ja niiden radat.
Aluesuodatin tarkoittaa ensisijaista kuntaa valitulla suunnittelualueella.

Suodattimet päivittävät kartat, selitteet, luettelot, kunta- ja aluetiedot,
vuosi-/malli-/luokitus-/järjestäjäkaaviot, rankingit, vertailut,
kattavuuden sekä viennit. Näkymät ilmoittavat, että kilpailuluvut ovat
suodatettuja. Suunnitteluskenaarion muutos päivittää alueisiin perustuvat
kilpailuluvut. Poistuneeseen alueeseen viittaava suodatin säilyy näkyvänä
mutta ei kohdistu sattumanvaraiseen uuteen alueeseen.

Nykyisten katselusuodattimien tapaan tilaa ei tallenneta suunnitelmaan,
URLiin tai pysyvästi selaimen levytilaan. Kilpailutila säilyy saman
sivuistunnon reittivaihdossa, mutta uudelleenlataus palauttaa turvallisen
piilotetun oletuksen. Seurakartta käyttää jo avattua suunnitteluskenaariota;
aluevaihtoehdot tulevat näkyviin Aluesuunnittelun avaamisen jälkeen.

## 5. Tunnisteet, kunnat ja laskentasäännöt

Tunniste perustuu vakaisiin lähdekenttiin: normalisoitu kilpailunimi,
vuosi, alku- ja loppupäivä, ensisijainen kunta sekä tarvittaessa
järjestäjä ja deterministinen lähdeindeksi. Pelkkää nimeä tai satunnaista
tunnistetta ei käytetä. Mahdollisia samansisältöisiä lähderivejä ei
yhdistetä arvauksella: lähteen jokainen tapahtumarivi säilyy erillisenä.

`getPrimaryMunicipality` hyväksyy ensisijaisen paikan vain, jos
`primary === true` esiintyy täsmälleen kerran. Puuttuvaa tai moniselitteistä
ensisijaista kuntaa ei korvata ensimmäisellä kunnalla.
Kuntanimet linkitetään olemassa oleviin virallisiin kuntakoodeihin
Unicode NFC -normalisoinnilla, suomalaisella kirjainkoon käsittelyllä,
välilyöntien siistimisellä ja suomen-/ruotsinkielisillä nimillä.
Ääkkösiä ei poisteta törmäyksiä aiheuttavalla tavalla.
Epäselvä tai puuttuva linkki säilyy `null`-arvona ja tuottaa huomautuksen.
`COMPETITION_MUNICIPALITY_ALIASES` sisältää 20 varovaista aliasmuotoa
lähteen **nimenomaisille nykykunta–paikallisuus-/maakuntamerkinnöille**:
esimerkiksi `Kuopio (Nilsiä)` ja `Nilsiä (Kuopio)` → Kuopio,
`Lahti (Nastola)` → Lahti, `Raasepori, Karjaa` → Raasepori sekä
`Geta, Åland` → Geta. Kohteen on oltava yksikäsitteisesti olemassa.
Tämä ratkaisee 27 sijaintia, mutta ei arvaa paljasta historiallista
kuntanimeä tai usean nykykunnan listan ensisijaista kuntaa.
Lähdenimi ja tunniste säilyvät; kaikki ratkaisut ovat laatuliitteen
`aliasResolutions`-taulukossa.

`analyzeCompetitions` pitää seuraavat käsitteet erillään:

| Laskelma | Sääntö |
|---|---|
| Kansallinen yksilöllinen kilpailumäärä | Kukin lähderivi/tunniste kerran, myös ratkaisematon tapahtuma |
| Ensisijaiset kuntaluvut | Tapahtuma vain yksikäsitteisen ensisijaisen kunnan ryhmään |
| Ensisijaiset alueluvut | Ensisijainen kunta kuuluu kyseiseen alueeseen; tapahtuma kerran tässä alueessa |
| Liittyvät kunta-/alueluvut | Ensisijainen tai muu kunta kuuluu joukkoon; sama tapahtuma kerran kussakin joukossa |
| Kattamat kunnat | Kaikkien kohdistettujen kuntakoodien unioni |
| Isäntäkunnat | Kohdistettujen ensisijaisten kuntakoodien unioni |
| Kattavuusväestö | Katettujen kohdistettujen kuntien väestö 2025, kunta kerran |
| Kilpailuradat | Kuntakohtaisesti normalisoitujen ratanimien yksilöllinen joukko |
| Kilpailut / 10 000 asukasta | Ensisijaiset tapahtumat suhteessa koko kunnan/alueen väestöön |
| Vertailu-/skenaario-/kohdistamaton yhteenveto | Valittujen kuntien unioni; liittyvä tapahtuma kerran, ei kuntarivien summaa |

Aluesuunnittelun päällekkäisyys on tarkoituksellinen ominaisuus.
Ensisijainen isäntäkunta voi kuulua kahteen suunnittelualueeseen, jolloin
tapahtuma näkyy kummankin alueen omalla rivillä. Tätä ei muuteta
mielivaltaiseksi yhden alueen valinnaksi. Kansallinen kokonaismäärä ja
alueiden unionin yhteenveto lasketaan tapahtumajoukosta, eivät aluerivien
summasta. Sivukunnat eivät koskaan kasvata kansallista tapahtumamäärää.

## 6. Kaaviot, rankingit, kojelaudat ja raportit

`CompetitionPanel` näyttää vuosittaiset kilpailut, ensisijaisten
isäntäkuntien rankingin, kilpailut / 10 000 asukasta -rankingin,
kilpailumalli-, PDGA- ja järjestäjäjakaumat sekä suunnittelualueiden
ensisijaisten kilpailujen kaavion. Palkilla on aina tekstimuotoinen nimi
ja luku; rankingien rajattu kymmenen rivin esitys ei rajoita luetteloa
tai laskentaa. `PopulationExplorer` yhdistää nykyiseen väestötaulukkoon
ensisijaiset ja kaikki liittyvät kilpailut sekä väestöön suhteutetut luvut.
Kuntavertailun molemmat kuntajoukot käyttävät samoja kilpailusuodattimia.

`DashboardView` lisää aktiivisten alueiden kilpailumäärä- ja
väestöön suhteutettujen kilpailujen kaaviot sekä skenaarion kattavuuden.
`ComparisonView` lisää kilpailusarakkeet ja kilpailukaavion valituille
alueille, ja erillinen unioniyhteenveto välttää päällekkäisyysvirheen.
`UnassignedView` tuo kilpailutoiminnan nykyisten alueiden ulkopuolella
näkyviin. Skenaario- ja varmuuskopiovertailut mittaavat
aluerajausten kattavuutta **nykyisellä** kilpailuaineistolla;
ne eivät väitä kuvaavansa historiallista kilpailu- tai väestötilannetta.

Kilpailupaneelin oma JSON/CSV-vienti säilyttää yhden rivin/tietueen per
tapahtuma, vakaat tunnisteet, kaikki kunnat, radat ja virhehuomautukset.
JSON sisältää myös aktiiviset suodattimet ja lähdeselosteen.
Suunnitelman JSON-vienti sisältää johdetut kilpailuanalyysit erillään
`document`-osiosta, ei kilpailutietueita suunnitelmassa.
CSV-kuntavienti lisää ensisijaiset/liittyvät luvut, väestöön suhteutuksen
ja suodatinmetatiedot. Excel sisältää aluerivien kilpailuluvut,
kuntarivit, suodatinmetatiedot ja erillisen `Kilpailut`-välilehden.
Tekstisolujen kaavainjektio estetään kilpailu-CSV-viennissä.

## 7. Aineiston laatu ja tarkistus

Koko aineiston toteutunut tarkistus:

| Tarkistus | Tulos |
|---|---|
| Lähdetapahtumat / lopulliset yksilölliset tunnisteet | 2 304 / 2 304 |
| Lopullisten johdettujen tunnisteiden törmäykset | 0 |
| Normalisoitujen tunnistepohjien törmäykset | 8 paria / 16 tietuetta; deterministiset suffiksit säilyttävät kaikki rivit |
| Täsmälleen samat NFC-normalisoidut lähdekentät | 6 paria; erillään välimerkit/ääkköset siistivän tunnistepohjan törmäyksistä |
| Monikuntatapahtumat | 64 |
| Täsmälleen yksi ensisijainen paikka | Kaikissa 2 304 tapahtumassa |
| Karttakelpoiset ensisijaiset tapahtumat | 2 151 |
| Ratkaisemattomat ensisijaiset tapahtumat | 153; säilyvät haussa, luettelossa ja kansallisissa luvuissa |
| Ratkaisemattomat sijaintimerkinnät / lähdenimimuodot | 162 / 110 |
| Nimenomaisilla aliasmerkinnöillä ratkaistut sijainnit | 27 |
| Katetut kohdistetut kunnat | 164 |
| Katettujen kohdistettujen kuntien väestö 2025 | 5 003 971 |
| Yksilölliset kuntakohtaiset ratanimet | 965 |
| Käänteiset päivämäärävälit | 68 |
| Virheelliset ISO-/kalenteripäivämäärät / vuoden ristiriidat | 0 / 0 |
| Puuttuvat ratatiedot | 38 kuntakohtaista merkintää |
| Epästandardit PDGA-tasomerkinnät | 13 huomautusta |
| Ristiriitainen pro-/amatööriluokkajako | 1 tietue; ristiriita näytetään luokkajaon esityksessä |
| Kaikki huomautukset yhteensä | 281 |

Ratkaisemattomiin nimiin kuuluu esimerkiksi `Vampula`, `Karjaa`,
`Juankoski`, `Kylmäkoski`, `HML`, `Littoinen`, `Valekeakoski`,
maakunta-/yleisnimet ja usean kunnan listat kuten `Espoo, Kirkkonummi`.
Niille ei keksitä koordinaatteja tai ensisijaista nykykuntaa.
Kaikki 110 lähdenimimuotoa ja niitä käyttävät tapahtumaindeksit ovat
laatuliitteen `unresolvedMunicipalities`-taulukossa.
Esimerkiksi lähdeindeksin 1569 kilpailun
`Junioreiden SM- karsinta Karkkila.` päiväjakso on
2025-03-05–2024-04-05; se säilyy sellaisenaan eikä saa laskettua kestoa.

| Kilpailuvuosi | Tapahtumia | Yhteinen merkkiväri |
|---|---|---|
| 2019 | 1 | `#E69F00` |
| 2020 | 235 | `#56B4E9` |
| 2021 | 262 | `#009E73` |
| 2022 | 303 | `#F0E442` |
| 2023 | 369 | `#0072B2` |
| 2024 | 399 | `#D55E00` |
| 2025 | 413 | `#CC79A7` |
| 2026 | 322 | `#000000` |

`COMPETITION-DATA-QUALITY.json` on tämän raportin täydellinen laatuliite.
Se sisältää lähdetiedoston SHA-256-tarkistussumman, vuosien määrät ja
täsmälliset HEX-värit, karttakelpoisten tapahtumien määrän, katetut kunnat
ja väestön, puuttuvat vuodet, kaikki kuntakohdistuksen poikkeamat,
ensisijaisen kunnan poikkeamat sekä jokaisen normalisointihuomautuksen
tapahtumatunnisteella ja nollapohjaisella lähdeindeksillä.
Käyttöliittymän rivi on lähdeindeksi + 1, ei JSONin fyysinen rivinumero.

Tarkistus ajetaan:

```sh
node scripts/audit-competitions.mjs
```

Validointi tarkistaa juuren ja taulukon, tietueiden rakenteen, nimen,
vuoden, molemmat ISO-päivämäärät ja niiden kalenterikelpoisuuden,
päiväjärjestyksen, kunnat, täsmälleen yhden ensisijaisen paikan, kuntanimet,
ratataulukot, johdetut tunnisteet ja maantieteelliset linkit.
Virheellisiä tietueita ei hiljaisesti hylätä. Latauksen rakennevirhe
näkyy virheenä ja uudelleenyrityksenä; tietuekohtaiset ongelmat
nähdään tietopaneelissa ja aineistohuomautuksissa.

Lähteessä on käänteisiä päiväjaksoja ja epästandardeja PDGA-luokitusarvoja.
Alkuperäistä päivämäärää, vuotta tai luokitusta ei korjata nimen tai
oletetun kirjoitusvirheen perusteella. Virheellinen/käänteinen jakso
ei tuota kestoa. Vuoden lähdekenttä on ensisijainen, ei nimessä oleva vuosi.
Laatuliitteen täydellinen huomautusluettelo yksilöi korjausta tarvitsevat
rivit; myös kilpailun oma JSON-vienti säilyttää huomautukset.

Vuosivärit tuotetaan ainoastaan `getCompetitionYearColor`-palvelussa
värinäön poikkeamia huomioivasta paletista ja deterministisestä
laajennuksesta. Aineiston kahdeksan vuotta ovat 2019–2026, mutta
käyttöliittymä ei kovakoodaa niitä. Tarkka vastaavuus on laatuliitteen
`years`-taulukossa; saman vuoden väri ei riipu aktiivisesta rajauksesta.

Käyttäjän toimittama aineisto ei ilmoita alkuperäistä julkaisijaa,
täsmällistä viitepäivää tai lisenssiä. Tämä rajaus näkyy
lähdemetatiedoissa; toimitettua aineistoa ei pidä tulkita
automaattisesti viralliseksi täydelliseksi kilpailurekisteriksi.

## 8. Testit ja tietoiset rajaukset

`tests/competitions.test.mjs` kattaa aineiston latauksen ja välimuistin,
normalisoinnin, vakaat ja törmäävät tunnisteet, ensisijaiset ja muut
kunnat, monikuntatapahtumat, kaikki/yksi/useita/ei vuosia, Unicode- ja
aliasnimet, ratkaisemattomat kohdistukset, laskennan, kattavuuden,
päivämäärät sekä vuosivärit.

`tests/competition-integration.test.mjs` tarkistaa yhteisen tilan,
valinnan nollautumisen suodatusmuutoksessa, vientien uniikit rivit,
kaavainjektion eston, aktiivisen rajauksen ja sen, etteivät kilpailut
siirry suunnitelmadokumenttiin.

`tests/browser/competitions.spec.ts` tarkistaa yhden pyynnön reittien yli,
piilotetun oletuksen, vuosirajaukset, alue-/malli-/PDGA-/järjestäjä-/
kuntasuodattimet, muut kunnat haussa, kummankin reitin laskennan,
klusterit ja näppäimistöspiderfyingin, vuositekstit, kaikkien kuntien
korostuksen, tietopaneelin, turvallisen lähdetekstin, virheelliset
jaksot, uudelleenyrityksen, suodatetun viennin sekä mobiilin teema- ja
WCAG-tarkistukset. Lisäksi koko tuotantoaineiston 2 151 päämerkkiä
varmistetaan klusterilukujen ja yksittäisten merkkien summasta;
kaikkien kilpailujen avaamisen on valmistuttava alle viidessä sekunnissa.
2023 + 2025 -rajaus tuottaa täsmälleen 782 tapahtumaa.
Nykyiset seura-, väestö-, suunnitelma- ja PHP-testit
säilyvät regressiokattavuutena.

Toteutuksen lopputarkistus: `npm test` — 63 hyväksyttyä yksikkö-/
API-testiä; `npm run test:e2e` — 25 hyväksyttyä selaintestiä sekä
onnistunut TypeScript-/tuotantokäännös. Lähdetiedoston tavuntarkka
samaisuus toimitettuun tiedostoon ja `git diff --check` on varmistettu.
Vite ilmoittaa noin 524 kB:n pääpaketin kokovaroituksen;
se ei estä käännöstä. Koko kilpailukerros läpäisee alle viiden
sekunnin avaamisrajan paikallisessa tuotantoselaintestissä.

Tunnistepohjien täydellinen luettelo lähdeindekseineen on
laatuliitteen `identifierBaseCollisions`-taulukossa. Se käyttää samaa
`getCompetitionIdentifierBase`-funktiota kuin varsinaiset tunnisteet,
ei auditointiin uudelleen kirjoitettua välimerkkien siistimisalgoritmia.
`repeatedIdentityFields` kuvaa erikseen kuutta NFC-normalisoitujen
lähdekenttien identtistä paria; kahden lisäparin nimivälimerkit
eroavat (`ODFL(...)` / `ODFL (...)` ja `Karkkila Open 2024` /
`Karkkila Open #2024`). `normalizeCompetition` tarjoaa saman
normalisoinnin yksittäiselle tietueelle annetulla lähdeindeksillä.

Kilpailuja ei lisätty seuraäänestyksen tai jäsenmääräjakauman
nimittäjiin, seuraorganisaation lähdekenttiin, suunnitelman muokkaus-
ja tuontirakenteeseen, autentikointiin tai kirjautumisen hallintaan:
ne mittaavat eri asioita tai muuttavat käyttäjän tallennettua sisältöä.
Nykyistä julkisen seuranäkymän likimääräistä koordinaattialuejakoa
ei käytetä kilpailujen virallisena aluejakona; kilpailualueet ovat
nimenomaisia suunnitteluskenaarion kuntajoukkoja.
Ratamerkkejä, uusia väestökarttoja tai raskasta erillistä
ikonikirjastoa ei lisätty ilman luotettavia koordinaatteja tai
käytettävyystarvetta.

## 9. Jatkokehityssuositukset

Varmista aineiston alkuperäinen lähde, lisenssi ja päivityskäytäntö.
Korjaa päivämäärät ja epästandardit luokitukset lähteen ylläpitäjän kanssa,
ei käyttöliittymässä arvaamalla. Varmista historiallisten kunta-/kylänimien
kohdistukset dokumentoidusta virallisesta muutosrekisteristä.
Lähteen pysyvät tapahtumatunnisteet poistaisivat identtisten rivien
indeksisuffiksin tarpeen. Varmistetut ratakoordinaatit mahdollistaisivat
ratamerkit saman tapahtumatunnisteen alla. Osallistujamäärät ja
asuinkunnat mahdollistaisivat todelliset osallistumis- ja
tavoittavuusmittarit; nykyiset väestöluvut kuvaavat vain paikkakuntia.
Tarvittaessa katselusuodattimille voidaan suunnitella ja testata
jaettavat URLit tai pysyvä tallennus erikseen.
