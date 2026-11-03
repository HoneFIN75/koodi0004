# Sovelluksen esittely

## Yhteenveto

Seurakartta on suomalaisen frisbeegolfseurakentän tarkasteluun ja aluesuunnitteluun tarkoitettu analytiikkasovellus. Se kokoaa seuroja, kilpailuja, kuntia ja väestöä koskevia tietoja karttoihin, vertailuihin ja raportteihin. Sovellus palvelee sekä julkista tiedon tarkastelua että yhteisten edustusalueiden suunnittelua. Sen avulla käyttäjä saa hajallaan olevasta aineistosta helpommin hahmotettavan tilannekuvan ja vertailupohjan.

## Sovelluksen tarkoitus

Sovelluksen tavoitteena on tehdä seurojen toimintaan ja alueelliseen kattavuuteen liittyvä tieto löydettäväksi ja vertailukelpoiseksi. Se yhdistää seurakohtaiset tiedot kuntiin ja karttoihin sekä tarjoaa näkymiä jäsenmääriin, äänivaltaan, kilpailutoimintaan ja väestöön.

Aluesuunnittelussa sovellus auttaa muodostamaan kuntiin perustuvia aluejakoja, vertailemaan vaihtoehtoja ja tunnistamaan kattavuuden aukkoja. Yhteiset skenaariot, automaattinen tallennus ja varmuuskopiot tukevat suunnittelun jatkuvuutta. Sovellus tarjoaa analyysi- ja suunnitteluvälineitä; se ei tee päätöksiä käyttäjän puolesta.

## Kenelle sovellus on tarkoitettu

| Käyttäjäryhmä | Kuvaus |
|---|---|
| Tiedon tarkastelijat | Seurojen, jäsenmäärien, kilpailujen ja alueellisten erojen julkinen tarkastelu ei vaadi kirjautumista. |
| Aluesuunnittelijat | Kirjoittaja- ja Admin-tunnuksilla muokataan yhteisiä alueita ja skenaarioita. Aluesuunnitelman julkinen katselu ei vaadi kirjautumista. |
| Seuratietojen ylläpitäjät | Admin hallinnoi seuratietoja, yhteystietojen näkyvyyttä sekä seurojen arkistointia ja palauttamista. |
| Johto ja sidosryhmät | Kojelaudat, vertailut ja raporttien vienti tarjoavat aineistopohjaa tilannekuvan ja aluevaihtoehtojen käsittelyyn. |
| Kehittäjät ja käyttöönotosta vastaavat | Sovelluksen lähdekoodi- ja aineistokuvaukset sekä tämä esittely tukevat järjestelmän ymmärtämistä ja ylläpitoa. |

Kirjoittaja- ja Admin-tunnukset ovat yhteiskäyttöisiä rooleja, eivät henkilökohtaisia käyttäjätilejä. Adminilla on lisäksi oikeus seurojen hallintaan ja yhteisten tunnusten salasanojen vaihtamiseen.

## Keskeiset ominaisuudet

| Ominaisuus | Mitä se tekee | Käyttäjälle koituva hyöty |
|---|---|---|
| Seurakartta ja haku | Näyttää seurojen sijainnit sekä mahdollistaa haun ja jäsenmäärä- ja äänivaltarajaukset. Seurat, joilta puuttuu kelvollinen sijainti, pysyvät mukana luetteloissa ja tilastoissa. | Seurojen alueellinen sijoittuminen ja suodatetun aineiston rajaus hahmottuvat nopeasti. |
| Jäsen- ja äänivaltatilastot | Kokoaa jäsenmääriä, jakaumia, kuntakohtaisia lukuja ja seurakohtaisia vertailuja. Äänimäärä johdetaan yhteisillä jäsenmäärärajoilla. | Seurojen koko ja sääntöihin perustuva äänivalta ovat vertailtavissa samalla tavalla. |
| Kilpailuanalyysi | Tarjoaa vuosittaisia ja kuntakohtaisia määriä, jakaumia, ranking-listoja ja vuosivertailuja. Vuodet voi valita yhteisestä suodattimesta. | Kilpailutoiminnan alueellisia ja ajallisia eroja voi tutkia ilman, että kilpailuja yhdistetään perusteettomasti järjestäjiin. |
| Väestö- ja kuntatarkastelu | Näyttää kuntien vuoden 2025 väestötietoja sekä väestöluokkia, suodatusta ja kuntien välistä vertailua. | Seura- ja kilpailumääriä voi tarkastella väestön rinnalla. |
| Maakuntavertailu | Vertaa maakuntia muun muassa seurojen, jäsenten, äänien, kilpailujen, väestön, pinta-alan ja tiheyksien avulla. | Laajempien alueiden erot näkyvät yhdessä näkymässä. |
| Aluesuunnittelu | Alueita voi luoda, muokata, kopioida, ottaa käyttöön tai poistaa käytöstä. Kunnat valitaan kartalta tai luettelosta; alueet voivat olla päällekkäisiä. | Useita kuntiin perustuvia aluevaihtoehtoja voi rakentaa ja tarkastella joustavasti. |
| Skenaariot, tarkistukset ja varmuuskopiot | Skenaariot säilyttävät erilliset alueratkaisut. Sovellus näyttää suunnitelman kattavuus- ja tasapainotarkistuksia, tallentaa muutoksia automaattisesti ja tukee palautusta varmuuskopiosta. | Vaihtoehtoja voi vertailla ja kehittää ilman, että aiempi suunnitelma katoaa huomaamatta. |
| Raportit ja tietojen hallinta | Admin voi tuoda aluesuunnitelmia JSON-muodossa ja viedä suunnitelmia ja raportteja JSON-, CSV- ja XLSX-muodoissa sekä tuoda ja viedä seurarekisterin JSON-muodossa. Kilpailuanalyysin CSV-vienti on julkinen. | Tuloksia voi jatkokäsitellä ja seuratietoja ylläpitää sovelluksen omissa hallintatoiminnoissa. |
| Datalähteiden dokumentaatio | Kuvaa aineistojen sisällön, käytön, tunnetun alkuperän ja rajaukset. | Käyttäjä voi arvioida, mistä analyysit muodostuvat ja mitä niistä ei voi päätellä. |

## Mitä sovelluksella voi tehdä

- Etsiä seuraa tai kuntaa ja rajata seurakarttaa jäsenmäärän tai äänivallan mukaan.
- Tarkastella seurakohtaisia tietoja sekä vertailla seuroja ja kuntia tilastojen ja ranking-listojen avulla.
- Tutkia kilpailumääriä, aktiivisia kuntia ja vuosimuutoksia valituilla kilpailuvuosilla.
- Suodattaa, vertailla ja selata kuntien vuoden 2025 väestötietoja.
- Tarkastella seura-, kilpailu-, väestö- ja aluetietoja maakunnittain.
- Luoda vaihtoehtoisia aluejakoja, määrittää niihin kuuluvia kuntia ja nähdä kohdistamattomat kunnat.
- Verrata alueita ja skenaarioita kartalla, taulukoissa ja tunnusluvuilla sekä viedä raportteja.
- Ylläpitää seurojen tietoja Admin-roolilla, hallita yhteystietojen julkisuutta ja arkistoida tai palauttaa seuroja.

## Käyttöprosessi

1. **Aloita tilannekuvasta:** avaa julkinen seurakartta ja hae tai suodata kiinnostavia seuroja ja kuntia.
2. **Tutki lukuja:** tarkastele jäsen- ja äänivaltatilastoja, kilpailutoimintaa, väestöä tai maakuntien välisiä eroja. Kilpailutilastoihin voi valita kaikki vuodet, yksittäisiä vuosia tai vuosivälin.
3. **Siirry suunnitteluun tarvittaessa:** avaa Aluesuunnittelu ja tarkastele nykyistä aluejakoa. Suunnitelman katselu on julkista; muokkaamiseen tarvitaan Kirjoittaja- tai Admin-tunnus.
4. **Rakenna ja arvioi vaihtoehto:** muokkaa alueita, määritä kuntien sijoittuminen ja tarkista kattavuus sekä suunnitelman huomautukset. Tallenna vaihtoehdot omiksi skenaarioikseen.
5. **Jaa tai jatkokäsittele tuloksia:** vertaile alueita. Admin voi viedä suunnitelmia ja raportteja sekä palauttaa aiemman tilanteen varmuuskopiosta. Kilpailuanalyysin CSV-vienti on julkinen.

## Tärkeimmät näkymät ja moduulit

| Näkymä tai moduuli | Tarkoitus | Käyttäjät |
|---|---|---|
| Seurakartta | Seurojen kartta, haku, suodattimet ja seurakohtaiset tiedot. | Kaikki kävijät |
| Tilastot | Jäsenmäärät, äänivalta, jakaumat, rankingit ja kuntakohtaiset vertailut. | Kaikki kävijät |
| Kilpailutoiminnan analyysi | Kilpailujen vuosittainen ja kunnittainen yhteenveto sekä vertailut. | Kaikki kävijät |
| Kuntien väestöanalyysi | Vuoden 2025 väestötilastot, kuntavertailu ja suodattimet. | Kaikki kävijät |
| Seura matriisi | Seurojen suodatettava ja järjestettävä taulukko, johon voidaan liittää skenaario- ja kilpailutietoja. | Kaikki kävijät |
| Aluesuunnittelun kartta ja alueet | Kuntien, seurojen ja suunniteltujen alueiden yhteinen karttanäkymä sekä alueiden muokkaus. | Kaikki näkevät; Kirjoittaja ja Admin muokkaavat |
| Aluesuunnittelun kojelauta ja vertailu | Skenaarion tunnusluvut, suunnitelman tarkistukset ja alueiden vertailu. | Kaikki näkevät; Kirjoittaja ja Admin muokkaavat |
| Kohdistamattomat kunnat | Näyttää kunnat, jotka eivät kuulu yhteenkään käytössä olevaan alueeseen. | Kaikki näkevät; Kirjoittaja ja Admin muokkaavat |
| Skenaariot | Vaihtoehtoisten aluesuunnitelmien hallinta. | Kaikki näkevät; muokkaamiseen Kirjoittaja tai Admin |
| Varmuuskopiot | Aiempien suunnittelutilanteiden vertailu ja palauttaminen. | Admin |
| Tuonti ja vienti | Aluesuunnitelmien JSON-tuonti ja raporttien vienti JSON-, CSV- ja XLSX-muodoissa. | Admin |
| Seurahallinta | Seuratietojen ja yhteystietojen ylläpito sekä rekisterin tuonti ja vienti. | Admin |
| Sovellus ja datalähteet | Sovelluksen yleiskuva sekä aineistojen alkuperän, sisällön ja rajoitteiden kuvaus. | Kaikki kävijät |

## Tietojen hallinta

Sovellus käsittelee seuraavia keskeisiä tietokokonaisuuksia:

- **Seura:** nimi, kotipaikkakunta, koordinaatit, jäsenmäärä, johdettu äänimäärä, mahdolliset lisätiedot ja yhteystiedot. Julkisessa seuranäkymässä näytetään vain julkisiksi merkityt yhteystiedot; ylläpidossa voi olla myös yksityisiä yhteystietoja ja arkistotietoja.
- **Kilpailu:** kilpailun nimi, vuosi ja kunta. Aineisto ei sisällä kilpailun järjestäjää, päivämääriä, osallistujamääriä tai tietoa kilpailun toteutumisesta.
- **Kunta ja väestö:** kuntatunniste, suomen- ja ruotsinkieliset nimet, maakunta, karttaraja, pinta-ala ja erillisestä vuoden 2025 aineistosta liitetty väestö.
- **Maakunta:** tunniste, nimi, väri ja vastaavuus kuntien maakuntatietoon. Maakuntien karttarajat muodostuvat kuntarajoista.
- **Alue ja skenaario:** käyttäjän luoma alue sisältää esimerkiksi nimen, kuvauksen ja kuntaluettelon. Skenaario sisältää oman aluejakonsa; kuntien päällekkäinen kuuluminen eri alueisiin on sallittua.
- **Varmuuskopio:** aikaleimallinen aiempi aluesuunnitelman tilannekuva.

Seura-, kilpailu-, väestö- ja aluetilastot muodostetaan yhdistämällä tietoja kuntiin ja alueisiin. Maakuntakohtaiset luvut johdetaan kuntien maakuntatiedoista; niitä ei tallenneta erillisinä seuratietueina. Tuntemattomia tai puuttuvia lukuja ei käsitellä automaattisesti nollina.

Tuotannossa seuratiedot ja aluesuunnitelmat luetaan sovelluksen palvelinrajapinnoista. Aluesuunnitelman muokkaus vaatii Writer- tai Admin-roolin; seuratietojen hallinta on Admin-roolille. Kehitysympäristön aluesuunnitelma käyttää selaintallennusta. Julkisia yhteystietoja lukuun ottamatta yksityisiä seurayhteystietoja ei tarjoilla julkisessa seuradatassa.

## Integraatiot

| Järjestelmä tai palvelu | Käyttö |
|---|---|
| Tilastokeskuksen kuntarajat | Kuntien vuoden 2025 geometriat ja maakuntatiedot kartta- ja aluelaskentoihin; lähteen lisenssi on CC BY 4.0. |
| OpenStreetMap | Julkiset karttatiilet karttojen taustakarttana. |
| Sovelluksen PHP-rajapinnat | Julkinen seuratietojen luku, aluesuunnitelman tallennus sekä roolisuojatut kirjautumis- ja Admin-toiminnot. |
| GitHub Actions ja käyttöönoton palvelin | Testien ja tuotantoon viennin automatisointi. Tuotantoon vienti tapahtuu projektin määrittämään SSH-palvelimeen. |
| Kilpailu- ja väestöaineistot | Sovelluksen mukana toimitettavat aineistot. Kilpailuaineiston alkuperäistä tuottajaa ja väestöaineiston alkuperäistä julkaisijaa ei ole dokumentoitu. |

Kirjautuminen käyttää sovelluksen omaa yhteisten Writer- ja Admin-tunnusten järjestelmää; kolmannen osapuolen kirjautumispalvelua ei ole määritelty. Koodista ja dokumentaatiosta ei löydy maksu- tai sähköpostipalveluintegraatioita.

## Käyttäjälle tuotettava arvo

- **Parempi näkyvyys:** seura-, kilpailu- ja kuntatiedot ovat löydettävissä kartalta, taulukoista ja tilastoista.
- **Vertailukelpoisuus:** yhteiset jäsenmäärästä johdetun äänivallan säännöt, vuodet ja kuntapohjaiset rajaukset tukevat yhdenmukaista tarkastelua.
- **Tietoon perustuva suunnittelu:** alueiden kattavuutta, päällekkäisyyksiä, kuntajakoa, seuroja ja väestöä voi tarkastella rinnakkain.
- **Sujuvampi yhteistyö:** skenaariot, yhteinen palvelintallennus ja palautettavat varmuuskopiot tukevat suunnitelmien jatkotyöstämistä.
- **Jatkokäyttö:** CSV-, XLSX- ja JSON-viennit helpottavat tulosten raportointia ja suunnitelmien siirtämistä.
- **Läpinäkyvyys:** datalähteiden sivu kertoo, mitä aineistot sisältävät ja mitä niiden perusteella ei voi päätellä.

Sovelluksen automaatio vähentää manuaalisia laskenta- ja vertailuvaiheita, mutta käytettävissä olevista lähteistä ei ole mitattua tietoa säästyneestä työajasta tai muusta euromääräisestä hyödystä.

## Yhteenveto ominaisuuksista

| Osa-alue | Kuvaus |
|---|---|
| Tarkoitus | Suomen frisbeegolfseurojen, kilpailutoiminnan ja kuntiin perustuvan aluejaon tarkastelu ja suunnittelu. |
| Kohderyhmä | Tiedon tarkastelijat, aluesuunnittelijat, seuratietojen ylläpitäjät, johto ja muut sidosryhmät. |
| Keskeiset ominaisuudet | Kartta, haku ja suodattimet, seura- ja kilpailutilastot, väestö- ja maakuntavertailut, alueiden suunnittelu, skenaariot, varmuuskopiot ja raporttiviennit. |
| Päähyödyt | Selkeämpi tilannekuva, yhdenmukainen vertailu, aluevaihtoehtojen arviointi sekä tulosten jatkokäyttö. |
| Integraatiot | Tilastokeskuksen kuntarajat, OpenStreetMap-karttatiilet, sovelluksen omat PHP-rajapinnat sekä GitHub Actions -testaus ja käyttöönotto. |

## Lyhyt hissipuhe

Seurakartta kokoaa frisbeegolfseurojen, kilpailujen, kuntien ja väestön tiedot kartalle ja vertailtaviksi tilastoiksi. Sen avulla käyttäjät voivat tarkastella seurakenttää ja suunnitella kuntiin perustuvia aluejakoja yhdessä, läpinäkyvästi ja palautettavasti.
