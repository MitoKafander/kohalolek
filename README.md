# Kohalolek

QR-põhine kohaloleku märkimine tunnis. Õpetaja näitab ekraanil vahetuvat QR-koodi, õpilane skannib
selle telefoniga ja on nimekirjas kohal. Tunni lõpus saab tulemuse ühe klõpsuga Tahvli päevikukande
vormi, kus õpetaja selle üle vaatab ja ise salvestab.

**Seis 27.11.2026:** leht, server ja Tahvli skript (0.3.0) töötavad; 27.11 lisandusid tunnikaupa käsitsi
parandus ja nime lukustamine. Terve klassiga tunni kohta tagasisidet veel ei ole.
Arendust jätkates loe esmalt [RESUME_HERE.md](RESUME_HERE.md); muudatused on [CHANGELOG.md](CHANGELOG.md)-s.

## Osad

| Osa | Kus | Mida teeb |
| :--- | :--- | :--- |
| Õpilase leht | `site/index.html` | Avaneb QR-koodist. Esimesel korral valib õpilane oma nime, edasi telefon mäletab. |
| Õpetaja leht | `site/opetaja/` | Rühmad, tunni alustamine, vahetuv QR, elav nimekiri, käsitsi parandused, eksport. |
| Vahendaja | `supabase/migrations/` | Supabase'i andmebaas ja funktsioonid, mis võtavad skaneeringud vastu. |
| Tahvli skript | `userscript/` | Tampermonkey skript: täidab Tahvli kandes P ja H linnukesed ning märkused. |

## Kuidas tund käib

1. Õpetaja logib õpetaja lehel sisse, valib rühma ja vajutab „Alusta tundi“.
2. Ekraanil on QR-kood, mis vahetub iga 10 sekundi järel. Õpilased skannivad selle telefoni kaameraga.
3. Staatus tuleb skaneerimise ajast (ÕKE p 9.8): õigel ajal = kohal, alla 15 min hiljem = **H**,
   15 min või rohkem = **P**. Tunni algusaega ja „õigeaegne kuni“ minuteid saab muuta ka tagantjärele.
4. Mitme järjestikuse tunni korral (paaristunnid) arvestatakse iga tundi eraldi. Rühmal on kooli
   tunniajad, tunnil „algustund“ ja „tunde“. Näide: 4 tundi, õpilane skannib 3. tunni alguses 8 min
   hiljem → 1. ja 2. tund P, 3. tund H, 4. tund kohal.
   Kui sama aadressi all on tunniplaani leht (`/tunniplaan/data/snap.json`) ja rühma tund parajasti käib,
   võetakse algustund ja tundide arv sealt; muidu pakub leht neid kella ja eelmise korra järgi.
5. Nimel puudutades saab staatust käsitsi muuta (nt tühja telefoniga õpilane): ülemised nupud kogu ploki kohta,
   mitme tunni korral rida „Tunni kaupa“ iga tunni kohta eraldi (nt skannis hilja, aga puudus tegelikult vähem).
   Samas on nupp „Lukusta nimi“: lukus nimega saab telefoni siduda ainult õpetaja loal (nt õpilane, kes koolis
   ei käi). Õpilane saab nime valida, näeb teadet „Pöördu õpetaja poole“ ja õpetaja lehele ilmub „Luba / Keela“.
   Lukk kehtib rühmas ka järgmistes tundides, kuni õpetaja selle avab.
6. „Uus kontroll“ palub kõigil uuesti skannida. Kes jääb skannimata, loetakse sellest tunnist alates
   puudujaks, kuni ta uuesti skannib.
7. „Lõpeta tund“ → „Kopeeri Tahvli jaoks“ → Tahvlis kande aknas „Kleebi kohalolek või märkused“.
   Skript täidab kande päise (liik, maht, kuupäev, algustund, tundide arv; ainult tühjad väljad) ja
   puudumised, vajadusel tunni kaupa (veerg „123?“).

## Kui rühma tuleb uus õpilane

Lisa ta rühma nimekirja: rühmade lehel „Muuda“ → nimi uuele reale → „Salvesta“. Seda võib teha ka tunni ajal
(„← Rühmad“ → „Muuda“ → „Salvesta“ → „Jätka tundi“): tund jookseb edasi, teiste telefonide sidumised ja nimede
lukud jäävad alles ning uus õpilane saab kohe skannida. Olemasolevate nimede kirjapilti samal ajal ära muuda:
muudetud nimi loetakse uueks õpilaseks ja selle õpilase telefoni sidumine kaob.

Kuni teda nimekirjas ei ole:

- skannides ta oma nime ei leia (ja võib ekslikult valida kellegi teise vaba nime);
- Tahvli skript jätab tema rea muutmata ja nimetab ta aruandes real „Tahvli kandes on, andmetes ei ole“.
  Muutmata rida tähendab Tahvlis kohalolijat: kui ta puudus, pane P käsitsi.

Teiste õpilaste read ei nihku, sest skript viib read kokku nime järgi, mitte järjekorra järgi. Suur- ja
väiketähed ning ees- ja perekonnanime järjekord ei loe, kirjapilt peab klappima.

## Märkused ja kiitused

Tunni vaates on teine vahekaart „Märkmed“: tabel õpilane × tüüp (Telefon, Räägib, Segab, Magab, Klapid,
Ei tööta, Tubli, Aitas). Puudutus lisab märke kellaajaga; „Võta tagasi“ ja „Kustuta“ eemaldavad. Märgetest
tehakse lause, nt „Kasutas tunnis telefoni ilma õpetaja loata (2 korda, kell 09.12, 09.40; ÕKE p 23.4.10).“,
mis läheb koos kohalolekuga Tahvli kande selgituse lahtrisse linnukesega „Märkus“ või „Kiitus“. Kui õpilasel
on samas tunnis nii märkus kui kiitus, lähevad mõlemad laused teksti ja linnuke on „Märkus“ (Tahvel lubab
ainult ühe). Tüüpe ja lauseid saab muuta rühmade lehel („Märkuste ja kiituste tüübid“).

## Andmed ja privaatsus

- Nimed krüpteeritakse õpetaja brauseris enne serverisse saatmist. Võti tuletatakse õpetaja paroolist
  ja serverisse ei jõua. Parooli ei saa taastada.
- Server hoiab juhuslikke kohakoode, telefoni juhusliku seadmekoodi räsi ja skaneerimise kellaaegu.
- Märkused ja kiitused (kes, mille eest) ning tüüpide laused on samuti krüpteeritud. Server näeb ainult
  seda, mitu märget tunnis on ja millal need tehti.
- Õpilase telefon saab oma rühma nimekirja lahti võtmega, mis on QR-koodis. Seega näeb rühma nimesid
  ainult see, kes on klassis ja koodi skannib.
- Tunnid koos skaneeringute ja märkmetega kustutatakse serverist 7 päeva pärast tundi (tööruumi seade).
  Ametlik kirje on Tahvlis; siin on ainult tööks vajalik koopia.
- Tahvlisse liiguvad andmed õpetaja lõikelaua kaudu. Skript Tahvlis midagi ise ei salvesta.

## Enne kasutuselevõttu koolis

See on tööriist, mitte kooli infosüsteem. Andmekaitse Inspektsiooni 2026. a ringkiri koolidele ütleb, et kasutada
tuleb rakendusi, mille haridusasutus on hinnanud ja heaks kiitnud, ning inspektsiooni 2024. a ettekanne, et
keskkondade valiku otsustab kool, mitte iga õpetaja eraldi. Enne päris õpilastega kasutamist tuleb seega koolis
kokku leppida vähemalt: kes rakenduse heaks kiidab, leping teenusepakkujaga (andmebaas on Supabase'is, leht
GitHub Pages'is, mis logib külastaja IP-aadressi), kuidas õpilasi teavitatakse ja kui kaua andmeid hoitakse.
Krüpteeritud andmed on endiselt isikuandmed.

## Petmise vastu

Kood kehtib kuni 30 sekundit ja iga telefon on seotud ühe nimega, nii et sõbrale saadetud pilt ei
tööta. Uue telefoni sidumise juba seotud või lukustatud nimega peab õpetaja lubama.

Teadaolev nõrk koht: brauser, mille andmed on kustutatud (või privaatne aken, teine brauser), on serveri
jaoks uus telefon ja saab valida iga vaba, lukustamata nime. Nii võib üks telefon märkida kohale ka
puuduva kaaslase. Seda saab kitsendada puudujate nimede lukustamisega; ekraanil olev „Kohal 23 / 25“
versus pead klassis jääb õpetaja kontrolliks.

## Tahvli skript

1. Paigalda brauserisse [Tampermonkey](https://www.tampermonkey.net/).
2. Ava `https://mitokafander.github.io/kohalolek/kohalolek-tahvel.user.js` ja vajuta „Install“.
3. Tahvlis päeviku lehel on nüüd nupp „Kopeeri nimekiri kohaloleku lehele“ ja kande aknas
   „Kleebi kohalolek või märkused“.

Skript loeb kahte sisendit: kohaloleku lehe „Kopeeri Tahvli jaoks“ ja Tunnimärkmete
„Kopeeri kõik nimedega“ (read kujul `Nimi: tekst` lähevad selgituse lahtrisse linnukesega „Märkus“).

## Arendus

```bash
npm install
npm test        # andmebaasi loogika (PGlite) + läbiv test Chrome'is + Tahvli skript jäljendatud vormil;
                # ekraanipildid test/shots/
```

Paigaldus: migratsioonid kaustas `supabase/migrations/` käivitatakse Supabase'i halduse API kaudu (vt
RESUME_HERE.md), `site/config.js` sisaldab projekti aadressi ja avalikku võtit, GitHub Pages avaldab kausta
`site/` igal `main` push'il. Uue tööruumi loomiseks on vaja kutsekoodi (tabel `kohalolek.invite`, hoitakse räsina).
