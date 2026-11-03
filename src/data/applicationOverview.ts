import { BarChart3, Building2, ClipboardList, Database, Download, Layers, MapPin, Search, ShieldCheck, Trophy, Users, type LucideIcon } from 'lucide-react';

interface OverviewCard {
  title: string;
  description: string;
  icon: LucideIcon;
}

interface FeatureCard extends OverviewCard {
  benefit: string;
}

interface ModuleCard extends OverviewCard {
  audience: string;
}

export const applicationOverview = {
  summary: 'Seurakartta on suomalaisen frisbeegolfseurakentän tarkasteluun ja aluesuunnitteluun tarkoitettu analytiikkasovellus.',
  introduction: 'Se kokoaa seuroja, kilpailuja, kuntia ja väestöä koskevia tietoja karttoihin, vertailuihin ja raportteihin.',
  audience: 'Seuroille, aluesuunnittelijoille, ylläpitäjille, johdolle ja muille sidosryhmille.',
  value: 'Yhteinen tilannekuva, vertailukelpoiset luvut ja perustellut aluevaihtoehdot samassa sovelluksessa.',
  purpose: [
    'Sovelluksen tavoitteena on tehdä seurojen toimintaan ja alueelliseen kattavuuteen liittyvä tieto löydettäväksi ja vertailukelpoiseksi.',
    'Aluesuunnittelussa sovellus auttaa muodostamaan kuntiin perustuvia aluejakoja, vertailemaan vaihtoehtoja ja tunnistamaan kattavuuden aukkoja.',
  ],
  roleNote: 'Julkinen tarkastelu ei vaadi kirjautumista. Kirjoittaja- ja Admin-tunnukset ovat yhteiskäyttöisiä rooleja, eivät henkilökohtaisia käyttäjätilejä. Sovellus tukee päätöksentekoa, mutta ei tee päätöksiä käyttäjän puolesta.',
  audiences: [
    { title: 'Tiedon tarkastelijat', description: 'Seurojen, jäsenmäärien, kilpailujen ja alueellisten erojen julkinen tarkastelu ei vaadi kirjautumista.', icon: Search },
    { title: 'Aluesuunnittelijat', description: 'Kirjoittaja- ja Admin-tunnuksilla muokataan yhteisiä alueita ja skenaarioita. Aluesuunnitelman julkinen katselu ei vaadi kirjautumista.', icon: Layers },
    { title: 'Seuratietojen ylläpitäjät', description: 'Admin hallinnoi seuratietoja, yhteystietojen näkyvyyttä sekä seurojen arkistointia ja palauttamista.', icon: ShieldCheck },
    { title: 'Johto ja sidosryhmät', description: 'Kojelaudat, vertailut ja raporttien vienti tarjoavat aineistopohjaa tilannekuvan ja aluevaihtoehtojen käsittelyyn.', icon: BarChart3 },
    { title: 'Kehittäjät ja käyttöönotosta vastaavat', description: 'Sovelluksen lähdekoodi- ja aineistokuvaukset sekä tämä esittely tukevat järjestelmän ymmärtämistä ja ylläpitoa.', icon: ClipboardList },
  ] satisfies OverviewCard[],
  features: [
    { title: 'Seurakartta ja haku', description: 'Etsi seuroja ja kuntia kartalta sekä rajaa näkymää jäsenmäärän ja äänivallan mukaan.', benefit: 'Seurojen alueellinen sijoittuminen hahmottuu nopeasti.', icon: MapPin },
    { title: 'Jäsen- ja äänivaltatilastot', description: 'Tarkastele jäsenmääriä, jakaumia, kuntakohtaisia lukuja ja jäsenmäärästä johdettua äänivaltaa.', benefit: 'Seurat ovat vertailtavissa yhdenmukaisilla säännöillä.', icon: Users },
    { title: 'Kilpailuanalyysi', description: 'Tutki kilpailujen vuositrendejä, kuntakohtaisia määriä ja ranking-listoja valituilta vuosilta.', benefit: 'Kilpailutoiminnan alueelliset ja ajalliset erot tulevat näkyviin.', icon: Trophy },
    { title: 'Väestö- ja maakuntavertailu', description: 'Vertaa kuntien vuoden 2025 väestöä sekä maakuntien seura-, kilpailu- ja aluetietoja.', benefit: 'Lukumäärille saa alueellisen ja väestöön suhteutetun vertailupohjan.', icon: Building2 },
    { title: 'Alueet ja skenaariot', description: 'Muodosta kuntiin perustuvia aluejakoja ja säilytä vaihtoehdot omina skenaarioinaan. Alueet voivat olla päällekkäisiä.', benefit: 'Vaihtoehtoja voi arvioida muuttamatta kaikkia suunnitelmia kerralla.', icon: Layers },
    { title: 'Ylläpito ja raportit', description: 'Admin ylläpitää seuroja, käyttää varmuuskopioita sekä tuo aluesuunnitelmia JSONina ja vie raportteja JSON-, CSV- ja XLSX-muodoissa.', benefit: 'Tiedot pysyvät hallittavina ja tulokset ovat jatkokäytettävissä.', icon: Download },
  ] satisfies FeatureCard[],
  capabilities: [
    'Etsiä seuraa tai kuntaa ja rajata seurakarttaa jäsenmäärän tai äänivallan mukaan.',
    'Tarkastella seurakohtaisia tietoja sekä vertailla seuroja ja kuntia tilastojen ja ranking-listojen avulla.',
    'Tutkia kilpailumääriä, aktiivisia kuntia ja vuosimuutoksia valituilla kilpailuvuosilla.',
    'Suodattaa, vertailla ja selata kuntien vuoden 2025 väestötietoja.',
    'Tarkastella seura-, kilpailu-, väestö- ja aluetietoja maakunnittain.',
    'Luoda vaihtoehtoisia aluejakoja, määrittää niihin kuuluvia kuntia ja nähdä kohdistamattomat kunnat.',
    'Verrata alueita ja skenaarioita kartalla, taulukoissa ja tunnusluvuilla sekä viedä raportteja.',
    'Ylläpitää seurojen tietoja Admin-roolilla, hallita yhteystietojen julkisuutta ja arkistoida tai palauttaa seuroja.',
  ],
  steps: [
    { title: 'Aloita tilannekuvasta', description: 'Avaa julkinen seurakartta ja hae tai suodata kiinnostavia seuroja ja kuntia.' },
    { title: 'Tutki lukuja', description: 'Tarkastele jäsen- ja äänivaltatilastoja, kilpailutoimintaa, väestöä tai maakuntien välisiä eroja.' },
    { title: 'Siirry suunnitteluun', description: 'Avaa Aluesuunnittelu. Katselu on julkista; alueiden muokkaaminen vaatii Kirjoittaja- tai Admin-tunnuksen.' },
    { title: 'Rakenna ja arvioi vaihtoehto', description: 'Muokkaa alueita, määritä kuntien sijoittuminen ja tarkista kattavuus sekä suunnitelman huomautukset. Tallenna vaihtoehdot omiksi skenaarioikseen.' },
    { title: 'Jaa ja jatkokäsittele', description: 'Admin voi viedä suunnitelmia ja raportteja sekä palauttaa aiemman tilanteen varmuuskopiosta. Kilpailuanalyysin CSV-vienti on julkinen.' },
  ],
  modules: [
    { title: 'Seurakartta', description: 'Seurojen kartta, haku, suodattimet ja seurakohtaiset tiedot.', audience: 'Kaikki kävijät', icon: MapPin },
    { title: 'Tilastot', description: 'Jäsenmäärät, äänivalta, jakaumat, rankingit ja kuntakohtaiset vertailut.', audience: 'Kaikki kävijät', icon: BarChart3 },
    { title: 'Kilpailutoiminnan analyysi', description: 'Kilpailujen vuosittainen ja kunnittainen yhteenveto sekä vertailut.', audience: 'Kaikki kävijät', icon: Trophy },
    { title: 'Kuntien väestöanalyysi', description: 'Vuoden 2025 väestötilastot, kuntavertailu ja suodattimet.', audience: 'Kaikki kävijät', icon: Users },
    { title: 'Seura matriisi', description: 'Seurojen suodatettava ja järjestettävä taulukko, johon voidaan liittää skenaario- ja kilpailutietoja.', audience: 'Kaikki kävijät', icon: ClipboardList },
    { title: 'Aluesuunnittelun kartta ja alueet', description: 'Kuntien, seurojen ja suunniteltujen alueiden yhteinen karttanäkymä sekä alueiden muokkaus.', audience: 'Kaikki näkevät; Kirjoittaja ja Admin muokkaavat', icon: Layers },
    { title: 'Aluesuunnittelun kojelauta ja vertailu', description: 'Skenaarion tunnusluvut, suunnitelman tarkistukset ja alueiden vertailu.', audience: 'Kaikki kävijät', icon: BarChart3 },
    { title: 'Kohdistamattomat kunnat', description: 'Näyttää kunnat, jotka eivät kuulu yhteenkään käytössä olevaan alueeseen.', audience: 'Kaikki näkevät; Kirjoittaja ja Admin kohdistavat', icon: MapPin },
    { title: 'Skenaariot', description: 'Vaihtoehtoisten aluesuunnitelmien tarkastelu ja hallinta.', audience: 'Kaikki näkevät; Kirjoittaja ja Admin muokkaavat', icon: Layers },
    { title: 'Varmuuskopiot', description: 'Aiempien suunnittelutilanteiden vertailu ja palauttaminen.', audience: 'Admin', icon: ShieldCheck },
    { title: 'Tuonti ja vienti', description: 'Aluesuunnitelmien JSON-tuonti ja raporttien vienti JSON-, CSV- ja XLSX-muodoissa.', audience: 'Admin', icon: Download },
    { title: 'Seurahallinta', description: 'Seuratietojen ja yhteystietojen ylläpito sekä rekisterin JSON-tuonti ja -vienti.', audience: 'Admin', icon: Users },
    { title: 'Sovellus ja datalähteet', description: 'Sovelluksen yleiskuva sekä aineistojen alkuperän, sisällön ja rajoitteiden kuvaus.', audience: 'Kaikki kävijät', icon: Database },
  ] satisfies ModuleCard[],
  benefits: [
    { title: 'Parempi näkyvyys', description: 'Seura-, kilpailu- ja kuntatiedot ovat löydettävissä kartalta, taulukoista ja tilastoista.', icon: Search },
    { title: 'Vertailukelpoisuus', description: 'Yhteiset jäsenmäärästä johdetun äänivallan säännöt, vuodet ja kuntapohjaiset rajaukset tukevat yhdenmukaista tarkastelua.', icon: BarChart3 },
    { title: 'Päätöksenteon tuki', description: 'Alueiden kattavuutta, päällekkäisyyksiä, kuntajakoa, seuroja ja väestöä voi tarkastella rinnakkain.', icon: Layers },
    { title: 'Yhteistyö ja automaatio', description: 'Skenaariot, automaattinen palvelintallennus ja varmuuskopiot tukevat suunnittelun jatkuvuutta.', icon: Users },
    { title: 'Raportointi ja jatkokäyttö', description: 'CSV-, XLSX- ja JSON-viennit helpottavat tulosten raportointia ja suunnitelmien siirtämistä.', icon: Download },
    { title: 'Läpinäkyvyys', description: 'Datalähteiden kuvaukset kertovat, mitä aineistot sisältävät ja mitä niiden perusteella ei voi päätellä.', icon: Database },
  ] satisfies OverviewCard[],
  benefitNote: 'Sovelluksen automaatio vähentää manuaalisia laskenta- ja vertailuvaiheita, mutta käytettävissä olevista lähteistä ei ole mitattua tietoa säästyneestä työajasta tai muusta euromääräisestä hyödystä.',
  integrations: [
    { title: 'Tilastokeskuksen kuntarajat', description: 'Kuntien vuoden 2025 geometriat ja maakuntatiedot kartta- ja aluelaskentoihin; lähteen lisenssi on CC BY 4.0.' },
    { title: 'OpenStreetMap', description: 'Julkiset karttatiilet karttojen taustakarttana.' },
    { title: 'Sovelluksen PHP-rajapinnat', description: 'Julkinen seuratietojen luku, aluesuunnitelman tallennus sekä roolisuojatut kirjautumis- ja Admin-toiminnot.' },
    { title: 'GitHub Actions ja käyttöönoton palvelin', description: 'Testien ja tuotantoon viennin automatisointi. Tuotantoon vienti tapahtuu projektin määrittämään SSH-palvelimeen.' },
  ],
  integrationNote: 'Kirjautuminen käyttää sovelluksen omaa yhteisten Writer- ja Admin-tunnusten järjestelmää; kolmannen osapuolen kirjautumispalvelua ei ole määritelty. Koodista ja dokumentaatiosta ei löydy maksu- tai sähköpostipalveluintegraatioita.',
};
