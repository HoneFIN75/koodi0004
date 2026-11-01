# Seurahallinnan muutos- ja toteutussuunnitelma

## Tavoite

Lisätään sovellukseen seurojen ylläpito, jolla Admin voi hallita seuratietoja ja niiden julkisuutta sekä tuoda ja viedä tietoja versionoidussa JSON-muodossa. Julkinen kartta, haut, tilastot, aluesuunnittelu ja seuran tietopaneeli käyttävät jatkossakin samaa ajantasaista seuratietoa.

Tämä dokumentti kuvaa suunnitellun muutoksen. Se ei tarkoita, että käyttöliittymä tai palvelinrajapinta olisi jo toteutettu.

## Yhteenveto päätöksistä

- Seurahallinta on oma valikkonsa ja reittinsä, jotka ovat käytettävissä vain Admin-roolilla. Palvelin valvoo samaa oikeutta.
- Seuratiedolla on yksi auktoritatiivinen palvelintallennus. Julkinen sovellus ja aluesuunnittelu lukevat saman palvelun julkaisemaa aktiivista aineistoa.
- Muutoksista tehdään erilliset, toisistaan riippuvat PR:t. Ensin rakennetaan ja validoidaan tallennus sekä lukupolku; hallintakäyttöliittymä ja JSON-työkalut tulevat vasta sen jälkeen.
- Arkistointi korvaa normaalin pysyvän poiston. Yhteystietojen julkisuus on oletusarvoisesti pois päältä.
- JSON-tuonti validoidaan kokonaisuutena ja esikatsellaan ennen tallennusta. Tuonnin oletus ei poista aineistosta puuttuvia seuroja.

## Nykytila ja vaikutukset

- `jsondb/seurat.json` on nykyinen seuratietojen lähde. `src/data/clubRepository.ts` lataa ja validoi aineiston.
- `Club` sisältää seuran nimen, paikkakunnan, koordinaatit, jäsenmäärän ja jäsenmäärästä johdetun äänivallan. Muut skalaariset JSON-kentät säilytetään `details`-kentässä.
- Seuratietoa käytetään kartalla, hakutuloksissa, tilastoissa, seuran tietopaneelissa ja aluesuunnittelussa.
- Aluesuunnittelussa on jo kirjautumisroolit (`writer` ja `admin`) sekä palvelintallennuksen malleja. Seuratietojen hallinta tarvitsee kuitenkin oman tallennuskokonaisuuden ja palvelinpuolen käyttöoikeustarkistukset.
- Staattisen JSON-tiedoston muokkaus käyttöliittymästä ei riitä: tallennus-, julkistus- ja latauspolun on oltava pysyvä ja yhdenmukainen kaikissa näkymissä.

## Käyttöliittymä

### Adminille näkyvä oma valikko

Seurahallinta lisätään omaksi navigaatiovalikokseen. Valikko näkyy vain kirjautuneelle Admin-käyttäjälle. Writer ei näe valikkoa. Myös suora reitti ja kaikki muutos- ja hallintapyyntöjen rajapinnat tarkistavat Admin-oikeuden palvelimella; käyttöliittymän piilotus ei ole käyttöoikeussuoja.

Näkymä sisältää haettavan ja suodatettavan seuraluettelon, selkeän lisäys- ja muokkauslomakkeen, arkistoidut seurat sekä erillisen tuonti- ja vientitoiminnon. Tallennuksesta ilmoitetaan onnistumisena tai virheenä, eikä virheellinen tai tallentumaton muutos näytä onnistuneelta.

### Hallittavat tiedot

| Tieto | Käsittely |
|---|---|
| Seuran tunniste | Pysyvä, järjestelmän luoma ID; ei muokattavissa |
| Seuran nimi | Pakollinen |
| Paikkakunta | Pakollinen |
| Leveys- ja pituusaste | Valinnainen; karttavalinta ja numeerinen syöttö, rajat validoidaan |
| Jäsenmäärä | Valinnainen tai tuntematon; nolla ei tarkoita puuttuvaa tietoa |
| Äänivalta | Johdetaan nykyisellä `membershipRules`-säännöllä, ei itsenäisesti muokattavissa |
| Yhteyshenkilön nimi, sähköposti, puhelinnumero | Valinnaiset yhteystiedot |
| Verkkosivu, Instagram, TikTok | Valinnaiset URL-osoitteet |
| Nykyiset lisätiedot | Esimerkiksi piiri, alue ja perustamisvuosi säilytetään |
| Julkisuus | Yhteystietojen julkisuus valitaan erikseen; oletuksena henkilön yhteystiedot eivät ole julkisia |
| Tila | Aktiivinen tai arkistoitu; arkistoidun voi palauttaa |

Arkistointi on ensisijainen poistotapa. Arkistoitu seura ei osallistu julkisiin hakuihin, karttaan, tilastoihin tai aluesuunnittelun seuralukuihin, mutta tiedot jäävät Adminin palautettaviksi. Käyttöliittymän arkistointivahvistus kertoo vaikutuksesta. Pysyvä poisto ei kuulu tavanomaiseen ylläpitoon.

Yhteystietojen julkisuus toteutetaan tässä suunnitelmassa yhtenä selkeästi nimettynä yhteystietojen julkisuusasetuksena (`contact.public`). Oletusarvo on `false`. Julkinen rajapinta palauttaa yhteystietokentät vain, kun asetus on päällä. Adminin koko aineiston vienti voi sisältää myös yksityiset tiedot, ja käyttöliittymän tulee varoittaa tästä ennen vientiä.

### Julkinen seuran tietopaneeli

Yhteystiedot esitetään seuran tietopaneelissa omana **Yhteystiedot**-osionaan nimen, sijainnin ja jäsenlukujen jälkeen. Vain täytetyt ja julkisiksi merkityt tiedot näytetään. Sähköposti käyttää `mailto:`-linkkiä, puhelin `tel:`-linkkiä ja verkkosivu sekä some avautuvat turvallisina HTTP(S)-linkkeinä. Hakutulos- ja karttakortit pidetään tiiviinä.

## JSON-vienti ja -tuonti

### Tiedostomuoto

Suositus on dokumentoitu, versionumeroitu envelope-rakenne. Vienti on UTF-8-koodattua JSONia, jossa on tiedostomuodon versio, vientiaika, sovelluksen tunniste ja seurojen taulukko. Tuonti käsittelee koko tiedoston ennen tallennusta.

```json
{
  "format": "seurakartta-clubs",
  "version": 1,
  "exportedAt": "2026-11-01T12:00:00.000Z",
  "clubs": [
    {
      "id": "club_01J...",
      "seura": "Esimerkkiseura ry",
      "paikkakunta": "Helsinki",
      "latitude": 60.1699,
      "longitude": 24.9384,
      "jasenmaara": 42,
      "aanimaara": 10,
      "contact": {
        "name": "Etunimi Sukunimi",
        "email": "yhteys@example.fi",
        "phone": "+358 40 123 4567",
        "website": "https://example.fi",
        "instagram": "https://www.instagram.com/esimerkkiseura/",
        "tiktok": "https://www.tiktok.com/@esimerkkiseura",
        "public": false
      },
      "details": {
        "district": "Esimerkkipiiri"
      },
      "archived": false
    }
  ]
}
```

`id` on pysyvä tunniste ja ensisijainen täsmäytysavain. `aanimaara` mukana viennissä on johdettu yhteensopivuustieto: tuonnissa se lasketaan aina jäsenmäärästä sovelluksen nykyisillä säännöillä. Vanhoista aineistoista puuttuville ID-tunnisteille annetaan tunniste hallitussa migraatiossa. Tunnisteettoman tuontitietueen varovainen täsmäytys voi käyttää normalisoitua seuran nimeä ja paikkakuntaa; epäselvä täsmäytys näytetään ratkaistavaksi eikä sitä arvata.

`details` säilyttää nykyiset ja tulevat tuntemattomat lisäkentät, jotta tuonti ja vienti eivät hävitä tietoa. Tunnetut yhteystiedot tallennetaan nimettyihin kenttiin, ei vapaatekstiin. `null` tai puuttuva lukumäärä tarkoittaa tuntematonta; `0` on todellinen nolla.

### Vientitoiminnot

- Oletusvienti sisältää kaikki aktiiviset seurat. Admin voi erikseen valita arkistoidut mukaan.
- Vienti on täydellinen JSON-varmuuskopio; yksityisten yhteystietojen mukanaolo näytetään ja vahvistetaan ennen latausta.
- Tiedosto sisältää tuontiin tarvittavat ID:t ja arkistointitilan. Vientiä ei sidota käyttöliittymän hakusuodattimeen vahingossa.
- Tiedostonimi sisältää päivämäärän, esimerkiksi `seurakartta-seurat-2026-11-01.json`.

### Tuonnin työnkulku

1. Admin valitsee JSON-tiedoston.
2. Sovellus tarkistaa tiedostomuodon ja version, rakenteen, tietuetyypit, pakolliset kentät, rajat, linkkien sallitut protokollat ja päällekkäisyydet. Jäsenmäärä on ei-negatiivinen kokonaisluku tai tuntematon. Nimi, paikkakunta ja URL-osoitteet validoidaan.
3. Käyttöliittymä näyttää esikatselun: lisättävät, päivitettävät, ennallaan säilyvät, arkistoitavat/palautettavat ja hylättävät tietueet sekä kenttäkohtaiset virheet ja varoitukset. Tuonti ei tallenna osittaista tulosta, jos tiedostossa on virheitä.
4. Admin valitsee toimintatavan:
   - **Yhdistä ja päivitä**: ID:tä vastaavat seurat päivitetään, uudet lisätään; tiedostosta puuttuvia seuroja ei poisteta eikä arkistoida.
   - **Lisää vain uudet**: olemassa olevaan tunnisteeseen tai yksiselitteiseen nimi–paikkakunta-pariin osuvat tietueet ohitetaan ja raportoidaan.
   - **Korvaa koko aineisto**: tarjotaan vain erillisellä, uudelleen vahvistettavalla toiminnolla. Esikatselu kertoo vaikutukset, nykytilasta otetaan palautuskelpoinen varmuuskopio, ja rajapinta hyväksyy operaation vain Adminilta.
5. Tuonti tallentuu yhtenä atomisena muutoksena. Onnistumisen jälkeen sovelluksen kaikki näkymät lataavat saman uuden tietolähteen; epäonnistumisesta näytetään syy ja nykyinen aineisto säilyy muuttumattomana.

Tuonnin lokiin tai kuittaukseen tallennetaan vähintään aika, tekijän rooli/tunniste jos käytettävissä, toimintatapa ja tietuemäärät. Arkaluonteisia yhteystietoja ei kirjoiteta sovelluslokeihin.

## Tallennus ja käyttöoikeudet

Seuratiedot tallennetaan erillään aluesuunnittelun dokumentista, jotta seurojen muutokset eivät riko skenaarioita, varmuuskopioita tai niiden versiota. Palvelin on auktoritatiivinen lähde. Yksityiset yhteystiedot säilytetään web-juuren ulkopuolisessa tallennuksessa. Julkinen lukupolku palauttaa aktiiviset seurat sekä vain julkisiksi merkityt yhteystiedot; Adminin hallintapolku palauttaa täydet tiedot kirjautuneelle Adminille.

Kaikki kirjoitus-, tuonti-, vientiarkisto- ja palautustoiminnot tarkistetaan palvelimella Admin-roolilla, CSRF-suojauksella ja olemassa olevan kirjautumismallin mukaisesti. Samanaikaisten muokkausten ylikirjoitus estetään versiotarkistuksella. Tallennus on atominen ja virheellinen pyyntö hylätään kokonaan. Writer-roolille ei anneta hallinnan tietoja tai rajapinnan kirjoitusoikeuksia.

Koska nykyinen julkinen näkymä lukee staattista `jsondb/seurat.json`-tiedostoa, käyttöönotossa on muutettava lukupolku palvelimen julkiseen seurarajapintaan tai toteutettava muu automaattinen julkaisu samasta auktoritatiivisesta tallennuksesta. Pelkkä Admin-rajapinta staattisen aineiston rinnalla tuottaisi vanhentunutta dataa. Käyttöönotto edellyttää PHP:tä ja pysyvää, web-juuren ulkopuolista palvelintallennusta, kuten nykyisen aluesuunnittelun palvelintallennus.

## PR- ja toteutusjärjestys

PR:t pidetään tarkoituksella rajattuina. Jokaisen PR:n tulee sisältää toteutukseen liittyvät palvelu- ja käyttöliittymätestit sekä dokumentaatiopäivitykset. Seuraava vaihe aloitetaan vasta, kun edellisen vaiheen hyväksymiskriteerit täyttyvät.

### PR 1 — Seuratietojen malli ja palvelinrajapinta

Lisää pysyvät ID:t, yhteystiedot, julkisuus- ja arkistointitiedot, migraatio nykyisestä `jsondb/seurat.json`-aineistosta sekä erillinen palvelintallennus. Toteuta julkinen suodatettu lukurajapinta ja Admin-suojatut luku- ja kirjoitustoiminnot. Säilytä tuntemattomat lisäkentät sekä jäsenmäärästä johdetun äänivallan nykyinen sääntö.

**Hyväksyntä:** migraatio säilyttää kaikki nykyiset seurat ja lisäkentät; julkinen lukupolku ei paljasta yksityisiä yhteystietoja; vain Admin voi muuttaa aineistoa; tallennus on atominen ja versiotarkistettu; Writerin ja kirjautumattoman käyttäjän muutosyritykset hylätään palvelimella.

### PR 2 — Yhteinen seuratietolähde

Vaihda dashboard ja aluesuunnittelu lukemaan samaa palvelimen julkaisemaa aineistoa. Päivitä arkistoitujen seurojen suodatus kaikissa seuralaskentaa käyttävissä näkymissä. Lisää latausvirheiden näkyvä käsittely, uudelleenyritys ja aineiston päivitys tallennuksen jälkeen.

**Hyväksyntä:** kartta, listat, tilastot, kilpailu-/kunta-analyysien seuraluvut ja aluesuunnittelu käyttävät samaa aktiivisten seurojen aineistoa. Arkistointi ja palautus vaikuttavat johdonmukaisesti eikä aiempia käyttäjän suunnitteludokumentteja muuteta.

### PR 3 — Adminin Seurahallinta

Lisää Adminille näkyvä oma valikko ja reitti, seuraluettelo hakuineen, lisäys- ja muokkauslomake, arkistointi ja palautus. Toteuta lomakevalidointi, tallennustilat, vahvistukset ja saavutettava virhe-/onnistumispalaute. Lisää yhteystieto-osio julkiseen seuran tietopaneeliin, turvalliset `mailto:`, `tel:` ja HTTP(S)-linkit sekä julkisuusasetuksen mukainen näyttö.

**Hyväksyntä:** Admin pystyy hallitsemaan kaikkia määriteltyjä kenttiä; Writer ei näe valikkoa eikä voi avata reittiä tai käyttää rajapintaa; julkiset yhteystiedot näkyvät vain julkisuusasetuksen ollessa päällä.

### PR 4 — JSON-tuonti ja -vienti

Toteuta tässä dokumentissa määritelty version 1 tiedostomuoto, täysi JSON-vienti, tuontitiedoston validointi ja esikatselu, yhdistämis- ja lisää vain uudet -toiminnot sekä erikseen vahvistettava koko aineiston korvaus. Sisällytä tulosraportti, yksityistietojen vientivaroitus, varmuuskopiointi ja atominen tallennus.

**Hyväksyntä:** saman aineiston vienti ja tuonti säilyttävät ID:t, yhteystiedot, tuntemattomat lisäkentät, puuttuvat arvot ja arkistointitilan. Virheellinen tai tuntemattoman version tiedosto ei muuta tallennusta; esikatselu vastaa toteutunutta muutosta.

### PR 5 — Käyttöönotto ja ylläpidon viimeistely

Päivitä README ja palvelimen käyttöönotto-ohjeet. Tee tuotantomigraatio ensin varmuuskopiosta, varmista palvelimen tallennusoikeudet ja PHP-konfiguraatio sekä käy läpi palautusmenettely. Poista vanha staattinen lukupolku vasta, kun uusi palvelinlähde toimii tuotannossa.

**Hyväksyntä:** käyttöönotto- ja palautusohjeet on käyty läpi; tuotannon Admin-kirjautuminen, käyttöoikeudet, julkinen rajapinta, tuonti/vienti ja vanhojen näkymien toiminta on testattu.

## Käyttöönoton riskit ja hallinta

| Riski | Hallintakeino |
|---|---|
| Tuotantopalvelin ei tue PHP:tä tai pysyvää web-juuren ulkopuolista tallennusta | Varmista infrastruktuurin tuki ennen PR 1:n tuotantoon vientiä; jos tuki puuttuu, päätä tallennusratkaisu ennen käyttöliittymätyötä. |
| Migraatio kadottaa seuroja tai tuntemattomia lisäkenttiä | Ota alkuperäisestä JSONista palautettava varmuuskopio; vertaa tietuemääriä ja kenttiä migraation jälkeen. |
| Yhteystiedot julkaistaan vahingossa | Oletus `contact.public: false`; testaa julkinen rajapinta ja käyttöliittymä ilman Admin-istuntoa. |
| Hallintaoikeus tarkistetaan vain selaimessa | Testaa Admin-, Writer- ja kirjautumattoman käyttäjän pyynnöt suoraan rajapintaa vasten. |
| Tuonti ylikirjoittaa tai poistaa vääriä tietoja | Käytä esikatselua, vakaata ID:tä, atomista kirjoitusta ja oletuksena säilyttävää yhdistämistä; vaadi erillinen vahvistus korvaamiselle. |
| Sovelluksen näkymät näyttävät eri aineistoja | Siirry yhteiseen lähteeseen yhtenä PR:nä ja testaa kaikki seuroja käyttävät näkymät ennen vanhan lukupolun poistoa. |

### Julkaisun portit ja palautus

Tuotantoon siirtymisen edellytykset ovat: tallennuspalvelun saatavuus ja oikeudet tarkistettu, migraation varmuuskopio tehty, migraation tietuemäärä täsmää, julkisten/ylläpitäjän API-testien läpäisy, Actions-testien onnistuminen ja palautusmenettelyn dokumentointi. Jos julkaisu epäonnistuu, palauta aiempi sovellusversio ja migraatiota edeltävä tietokantatiedosto; älä aja uutta migraatiota vanhan päälle ilman ensin tehtyä tilannearviota.

## Testaus- ja hyväksymiskriteerit

- Admin näkee valikon ja voi hallita tietoja; Writer ei näe valikkoa eikä voi käyttää suoraa reittiä tai rajapintaa.
- Seuran nimi, paikkakunta, jäsenmäärä ja koordinaatit päivittyvät oikein karttaan, hakuihin, tilastoihin ja aluesuunnitteluun.
- Äänivalta lasketaan aina nykyisestä jäsenmäärästä, ja tuntematon jäsenmäärä pysyy tuntemattomana.
- Yhteystiedot näkyvät julkisesti vain julkaistavaksi merkittyinä; vaaralliset tai virheelliset URL:t eivät muutu linkeiksi.
- Arkistointi poistaa seuran kaikista julkisista laskennoista ja palautus tuo sen takaisin.
- JSON-vienti voidaan tuoda takaisin ilman tietojen häviämistä, mukaan lukien ID:t, tuntemattomat lisäkentät ja arkistointitila.
- Virheellinen, tuntemattoman version tai epäselviä duplikaatteja sisältävä tuonti ei muuta tallennettua aineistoa.
- Tuonnin esikatselu vastaa toteutuneita muutoksia; täysi korvaus vaatii selkeän vahvistuksen ja varmuuskopion.
- Samanaikaiset muutokset eivät hiljaisesti ylikirjoita toisiaan, ja tallennusvirhe säilyttää aiemman aineiston.
- Hallintanäkymä toimii mobiilissa, näppäimistöllä ja saavutettavuuden kannalta sovelluksen nykyisten käytäntöjen mukaisesti.
