import { Building2, Layers, MapPin, Trophy, Users, UsersRound } from 'lucide-react';
import type { DataSourceDefinition } from '../models/dataSource.ts';

export const dataSources: readonly DataSourceDefinition[] = [
  {
    id: 'clubs',
    title: 'Seurat',
    description: 'Seuratoiminnan perustiedot, jäsenmäärät ja äänivalta.',
    icon: Users,
    metadata: {
      sourceSystem: 'Palvelimen yksityinen seuratietokanta ja julkinen seurarajapinta.',
      updateFrequency: 'Ylläpidon tekemien muutosten yhteydessä.',
    },
    sections: [
      { title: 'Sisältö', items: ['nimi', 'kotipaikkakunta', 'karttakoordinaatit', 'jäsenmäärä', 'jäsenmäärästä johdettu äänimäärä', 'mahdolliset lisätiedot', 'yhteystiedot'] },
      { title: 'Alkuperä ja käyttö', text: 'Tuotannossa ensisijainen lähde on palvelimen seuratietokanta. Kehitysympäristössä käytetään repositorion aloitusaineistoa. Tietoja käytetään seurakartassa, jäsen- ja äänivaltatilastoissa, aluevertailuissa ja raporteissa.' },
      { title: 'Huomio', text: 'Mahdolliset yhteystiedot näytetään julkisessa näkymässä vain, jos ne on merkitty julkisiksi. Ylläpidossa voi olla myös yksityisiä yhteystietoja ja arkistointitieto. Tämän sivun seuralukumäärä sisältää vain julkisen rajapinnan aktiiviset seurat.' },
    ],
  },
  {
    id: 'competitions',
    title: 'Kilpailut',
    description: 'Kilpailutoiminta kunnittain ja vuosittain.',
    icon: Trophy,
    metadata: { sourceSystem: 'Sovelluksen kilpailutiedosto: jsondb/SFL-Kilpailut-2019-2026.json.' },
    sections: [
      { title: 'Sisältö', items: ['kilpailun nimi', 'vuosi', 'kunta'] },
      { title: 'Tilastot', items: ['2 292 tietuetta lähtöaineistossa', 'vuodet 2019–2026 lähdetiedoston nimessä'], text: 'Nykyisen ladatun aineiston tietuemäärä ja varsinaiset aineistovuodet näkyvät lähteen metatiedoissa. Tiedoston nimi ei yksin vahvista, että jokaiselta vuodelta on kilpailuja.' },
      { title: 'Alkuperä ja käyttö', text: 'Sovelluksen mukana toimitettu korjattu kilpailuaineisto muodostaa kilpailujen vuositrendit, kuntakohtaiset tilastot, aluevertailut ja raportit. Alkuperäistä tuottajaa ei ole yksilöity aineiston metatiedoissa. Sovellus tarkistaa tiedoston 60 sekunnin välein näkymän ollessa näkyvissä sekä palattaessa sovellukseen; tarkistus ei tarkoita lähdeaineiston päivitystä.' },
      { title: 'Rajoitteet', text: 'Aineistossa ei ole järjestäjätietoa eikä kilpailujen päivämääriä tai päättymistietoa. Osittaisia tai tulevia vuosia ei voi tulkita valmiiksi kilpailukausiksi.' },
    ],
  },
  {
    id: 'municipalities',
    title: 'Kunnat ja kartta',
    description: 'Kuntarajat ja kuntien yhteinen maantieteellinen perusta.',
    icon: MapPin,
    metadata: { sourceSystem: 'Tilastokeskuksen vuoden 2025 kuntarajat, mittakaava 1:1 000 000.', sourceOwner: 'Tilastokeskus (kuntarajojen alkuperäinen tuottaja).' },
    sections: [
      { title: 'Sisältö', items: ['Suomen 308 kuntaa', 'kuntien nimet suomeksi', 'kuntien nimet ruotsiksi', 'kuntakoodi', 'maakunta', 'rajageometria', 'väestötiedot'] },
      { title: 'Alkuperä ja käyttö', text: 'Kuntarajat toimitetaan sovelluksen mukana kartta-aineistona. Niistä muodostuvat karttanäkymät, kuntakohdistukset, aluejaot ja pinta-alat. Väestöluvut liitetään kuntiin erillisestä vuoden 2025 väestöaineistosta.' },
      { title: 'Lisenssi ja taustakartta', text: 'Kuntarajat: © Tilastokeskus, CC BY 4.0. Taustakartan karttatiilet ovat OpenStreetMapista (© OpenStreetMapin tekijät). Taustakartta ei ole seurojen, kilpailujen tai väestötilastojen lähde.' },
    ],
  },
  {
    id: 'population',
    title: 'Väestöaineisto',
    description: 'Kiinteän vertailuvuoden väestöluvut kunnittain.',
    icon: UsersRound,
    metadata: { sourceSystem: 'Sovelluksen kuntakohtainen väestötiedosto: municipalities-population-2025.json.' },
    sections: [
      { title: 'Ajantasaisuus', items: ['Väestöaineisto vuodelta 2025'] },
      { title: 'Alkuperä', text: 'Sovelluksen mukana toimitettu kuntakohtainen aineisto. Alkuperäistä tuottajaa tai tarkkaa päivitysajankohtaa ei ole yksilöity tiedoston metatiedoissa. Kilpailujen vuosivalinta ei muuta väestön vertailuvuotta.' },
      { title: 'Käyttötarkoitus', text: 'Tietoja käytetään yhdessä kuntarajojen kanssa muun muassa:', items: ['pinta-alalaskentoihin liittyviin aluevertailuihin', 'väestötiheyksien laskentaan', 'aluetarkasteluihin', 'raportointiin'] },
      { title: 'Laskentaperiaate', text: 'Pinta-alat lasketaan kuntarajojen geometriasta, eivät väestöluvuista. Väestötietoa käytetään pinta-alaan suhteutettuihin tiheyksiin sekä seura-, jäsen- ja kilpailumääriin 10 000 asukasta kohti.' },
    ],
  },
  {
    id: 'provinces',
    title: 'Maakunnat',
    description: 'Maakuntien tunnisteet ja yhteydet kuntiin.',
    icon: Building2,
    metadata: { sourceSystem: 'Sovelluksen maakuntarekisteri: jsondb/regions.json.' },
    sections: [
      { title: 'Sisältö', items: ['19 maakuntaa', 'tunnisteet', 'nimet', 'värit', 'kuntakytkennät'] },
      { title: 'Alkuperä ja käyttö', text: 'Maakuntarekisteri vastaa kuntaraja-aineiston maakuntatietoja. Maakuntien karttarajat muodostetaan kuntien geometriasta. Seura-, jäsen-, ääni-, kilpailu-, väestö- ja pinta-alatilastot lasketaan maakuntiin kuuluvista kunnista. Maakunnat ovat erillisiä käyttäjän luomista suunnittelualueista.' },
    ],
  },
  {
    id: 'planning',
    title: 'Aluesuunnittelun tiedot',
    description: 'Käyttäjien suunnitelmat, vaihtoehtoiset aluejaot ja varmuuskopiot.',
    icon: Layers,
    metadata: { sourceSystem: 'Aluesuunnittelun yhteinen palvelintallennus; kehitysympäristössä selaintallennus.', updateFrequency: 'Suunnitelmien muutosten yhteydessä automaattitallennuksella.' },
    sections: [
      { title: 'Sisältö', items: ['käyttäjän luomat alueet', 'skenaariot', 'kuntien aluejaot', 'kuvaukset', 'asetukset', 'varmuuskopiot'] },
      { title: 'Alkuperä ja käyttö', text: 'Tiedot syntyvät käyttäjien aluesuunnittelussa. Niitä käytetään vaihtoehtojen vertailuun, kattavuuden tarkasteluun, raportointiin sekä suunnitelmien palauttamiseen. Tuotannossa suunnitelmat tallennetaan yhteisesti palvelimelle, eivätkä ne ole vain tämän selaimen käyttäjän henkilökohtaisia tietoja.' },
      { title: 'Lukumäärän rajaus', text: 'Aluemäärä sisältää kaikkien skenaarioiden alueet, myös käytöstä poistetut. Eri skenaarioihin kopioidut alueet lasketaan erikseen. Varmuuskopioiden alueita ei lisätä lukumäärään.' },
    ],
  },
];
