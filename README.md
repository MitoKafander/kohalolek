# Kohalolek

QR-põhine kohaloleku märkimine tunnis. Õpetaja näitab ekraanil vahetuvat QR-koodi, õpilane skannib
selle telefoniga ja on nimekirjas kohal. Tunni lõpus saab tulemuse ühe klõpsuga Tahvli päevikukande
vormi, kus õpetaja selle üle vaatab ja ise salvestab.

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
4. Nimel puudutades saab staatust käsitsi muuta (nt tühja telefoniga õpilane).
5. „Uus kontroll“ palub kõigil uuesti skannida, kui on vaja teada, kes vahepeal lahkus.
6. „Lõpeta tund“ → „Kopeeri Tahvli jaoks“ → Tahvlis kande aknas „Kleebi kohalolek või märkused“.

## Andmed ja privaatsus

- Nimed krüpteeritakse õpetaja brauseris enne serverisse saatmist. Võti tuletatakse õpetaja paroolist
  ja serverisse ei jõua. Parooli ei saa taastada.
- Server hoiab juhuslikke kohakoode, telefoni juhusliku seadmekoodi räsi ja skaneerimise kellaaegu.
- Õpilase telefon saab oma rühma nimekirja lahti võtmega, mis on QR-koodis. Seega näeb rühma nimesid
  ainult see, kes on klassis ja koodi skannib.
- Tahvlisse liiguvad andmed õpetaja lõikelaua kaudu. Skript Tahvlis midagi ise ei salvesta.

## Petmise vastu

Kood kehtib kuni 30 sekundit ja iga telefon on seotud ühe nimega, nii et sõbrale saadetud pilt ei
tööta ja teise eest oma telefoniga kohal olla ei saa. Uue telefoni sidumise juba seotud nimega peab
õpetaja lubama. Päris kindel pole ükski QR-süsteem: ekraanil olev „Kohal 23 / 25“ versus pead klassis
jääb õpetaja kontrolliks.

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
npm test        # andmebaasi loogika (PGlite) + läbiv test Chrome'is, ekraanipildid test/shots/
```

Paigaldus: `supabase db push` rakendab migratsiooni, `site/config.js` sisaldab projekti aadressi ja
avalikku võtit, GitHub Pages avaldab kausta `site/` igal `main` push'il. Uue tööruumi loomiseks on
vaja kutsekoodi (tabel `kohalolek.invite`, hoitakse räsina).
