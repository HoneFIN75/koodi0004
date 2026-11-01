# Seuratiedoston JSON-muoto

Tämä dokumentti määrittää Seurakartan seuratietojen version 1 vienti- ja tuontimuodon. Tiedostoa voi käyttää varmuuskopiona tai siirtoon; se voi sisältää yksityisiksi merkittyjä henkilötietoja.

## Rakenne

Tiedosto on UTF-8-koodattua JSONia. Juuren rakenne:

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

Jokaisessa seuratietueessa ovat yllä olevat kentät. `id` on pysyvä, uniikki 1–100 ASCII-merkin tunniste, joka sisältää vain kirjaimia, numeroita, alaviivoja ja yhdysmerkkejä. Tuonti säilyttää tunnisteen. Seuran nimi ja paikkakunta ovat pakollisia, enintään 200 UTF-8-tavua. Koordinaatit ovat numero tai `null`; leveysasteen rajat ovat -90–90 ja pituusasteen -180–180. Jäsenmäärä on ei-negatiivinen kokonaisluku tai `null`.

`aanimaara` on mukana yhteensopivuutta varten, mutta tuonnissa sovellus laskee sen aina jäsenmäärästä. Ristiriitainen arvo korjataan ja siitä näytetään huomautus. Äänimäärän säännöt ovat: 0 jäsentä = 0 ääntä, 1–99 = 10, 100–299 = 15, 300–499 = 20 ja vähintään 500 = 25. Puuttuvalle jäsenmäärälle äänivalta on `null`.

`contact` sisältää kaikki yllä luetellut kentät. Tekstiarvot voivat olla tyhjiä. Sähköposti validoidaan; verkkosivun ja sosiaalisen median osoitteiden tulee olla kelvollisia HTTP(S)-URL-osoitteita. `public` määrittää, saako julkinen seurarajapinta näyttää yhteystiedot. `details` säilyttää tulevat tai sovelluskohtaiset lisätiedot; sen enimmäiskoko on 100 avain-arvo-paria, arvot ovat enintään 2000 merkin merkkijonoja tai äärellisiä numeroita. Arkistointi on boolean.

Tiedoston suurin sallittu koko on 10 MiB ja seuratietueiden enimmäismäärä 10 000. Tuntematon tiedostomuoto, versio, kenttä, virheellinen tietue tai toistuva ID hylkää koko tiedoston ennen tallennusta. Tuonnissa ei tallenneta osittaisia tuloksia.

## Tuontitavat

- **Yhdistä ja päivitä:** sama ID päivittää nykyisen tietueen; uusi ID lisätään. Tiedostosta puuttuvat nykyiset seurat säilyvät. Nimi–paikkakunta-törmäys eri ID:llä keskeyttää esikatselun.
- **Lisää vain uudet:** nykyiseen ID:hen tai jo olemassa olevaan yksiselitteiseen nimi–paikkakunta-pariin osuvat tietueet ohitetaan. Jos nimeä ja paikkakuntaa vastaa useampi nykyinen seura, tuonti keskeytetään eikä kohdetta arvata.
- **Korvaa koko aineisto:** tallennettavaksi ehdotetaan vain tiedoston seuroja. Käyttöliittymä edellyttää nykyisen aineiston JSON-varmuuskopion lataamista ja erillistä korvausvahvistusta.

Kaikki tuontitavat näyttävät ennen tallennusta esikatselun tietuemääristä: lisätyt, päivitetyt, ennallaan, ohitetut, arkistoidut, palautetut ja korvaamisessa poistuvat. Tallennus tehdään yhtenä Admin-rajapinnan revision- ja CSRF-suojattuna atomisena päivityksenä. Ristiriitainen versio hylätään; tällöin ylläpitäjä lataa uusimman aineiston ja muodostaa esikatselun uudelleen.

## Vienti ja henkilötiedot

Vienti ei seuraa hakusuodatinta. Oletuksena se sisältää aktiiviset seurat; ylläpitäjä voi valita arkistoidut mukaan. Tiedosto sisältää myös yksityisiksi merkityt yhteystiedot ja niiden julkisuusasetuksen. Käyttöliittymä vaatii yksityisyysvahvistuksen ennen vientiä ja varoittaa erikseen koko aineiston varmuuskopion yhteydessä.

Säilytä vientitiedosto suojatussa paikassa ja jaa se vain henkilöille, joilla on oikeus nähdä kaikki sen sisältämät yhteystiedot. Tiedostossa on vientiaika, mutta ei vientiä tehneen henkilön tietoja.
