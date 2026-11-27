# Muudatuste ajalugu

## 2026-11-27

### Tunnikaupa käsitsi parandus
- Õpetaja lehel saab mitmetunnise ploki puhul iga tunni staatust (K/H/P) eraldi muuta: puuduta nime, rida
  „Tunni kaupa“. Värviline nupp on kehtiv staatus, alumine triip näitab käsitsi pandut; sama nupu teistkordne
  vajutus võtab paranduse maha. Kogu ploki nupud („Kohal“, „Hilines“, „Puudub“, „Automaatne“) tühistavad
  tunnikaupa parandused.
- Parandus jõuab nimekirja, tekstieksporti ja Tahvli eksporti (`per`). Töötab ka lõpetatud tunnis.
- Serverit ei muudetud: parandus salvestatakse krüpteeritult samasse hoidlasse kus märkmed (tüüp `~per`).

### Parandus
- Silt „uus sidumine“ kaob, kui telefoni sidumine eemaldatakse (varem jäi tunni lõpuni alles). Skaneering ise
  jääb tunni andmetesse.

### Leitud nõrkused (lahendamata)
- Tundmatu brauser saab valida iga vaba nime, nii et üks telefon võib märkida mitu inimest.
- iPhone'i Safari võib telefoni sidumise umbes nädalaga kustutada, sest korduv skannimine ei sisalda puudutust.
- Mõlema kirjeldus ja võimalikud lahendused: RESUME_HERE, „Komistuskivid“.

## 2026-11-26 — esimene versioon

### Põhisüsteem
- Õpilase leht: QR-koodist avanev kinnitus, esimesel korral nime valik, telefon jääb nimega seotuks.
- Õpetaja leht: tööruum (nimi + parool + kutsekood), rühmad, vahetuv QR, elav nimekiri, käsitsi parandus,
  uus kontroll, ajalugu, eksport Tahvli jaoks ja tekstina.
- Server (Supabase): tabelid privaatses skeemis, kogu ligipääs `koh_*` funktsioonide kaudu; nimed ja rühmade
  nimekirjad krüpteeritakse brauseris.
- Tahvli skript: nupp „Kopeeri nimekiri kohaloleku lehele“ ja kande aknas „Kleebi kohalolek või märkused“.
- GitHub Pages'i avaldamine ja Supabase'i ärkvelhoidja.

### Mitmetunnine plokk ja kande päis
- Rühmal tunniajad (Kesklinn / Mustamäe), tunnil algustund ja tundide arv; staatus arvutatakse iga tunni kohta.
- Kontrollis skannimata jäänu on sellest tunnist alates puuduja, kuni skannib uuesti.
- Algustund ja tundide arv eeltäidetakse tunniplaani andmetest, kui rühma tund parajasti käib.
- Skript täidab kande päise (liik, maht, kuupäev, algustund, tundide arv) ja puudumised tunni kaupa („123?“).
- Skript arvestab, et Tahvel muudab kinnitatud tõendiga õpilase P ise V-ks.

### Märkused ja kiitused
- Vahekaart „Märkmed“: õpilane × tüüp, märge kellaajaga, tagasivõtmine; laused lähevad eksporti.
- Tüübid ja laused tööruumi seadetes; märkmed ja seaded krüpteeritud.
- Skript paneb linnukese „Märkus“ või „Kiitus“.

### Parandused samal päeval
- Sisselogimise vorm ei tühjenda vea korral välju; tööruumi nimi tühiku ja täpitähtedega teisendatakse.
- „Lõpeta tund“ ei jää enam vana vaate peale (seisupäringud käivad järjekorras).
- Teises seadmes tehtud muudatused jõuavad päise väljadele ka siis, kui seal on väli valitud.
- Nimekirjanupp ei sõltu Tahvli nuppude tekstist.

### Otsused
- Õpilase tuvastus ei sõltu koolist: nimi valitakse esimesel korral, telefon jääb seotuks.
- Skript ainult täidab Tahvli vormi; salvestab õpetaja ise. Päises täidetakse ainult tühjad väljad.
- Hilinemine alla 15 min = H, muidu P (ÕKE p 9.8); „õigeaegne kuni“ vaikimisi 5 min.
- Kui samas tunnis on nii märkus kui kiitus, lähevad mõlemad laused teksti ja linnuke on „Märkus“.
- Server ei hoia nimesid ega märkmeid loetaval kujul.

### Lahtised asjad
- Päris tunnis proovimata; „Kiitus“ linnuke ja V-juhtum päris Tahvlis proovimata.
- Perioodi kokkuvõte rühmajuhendajale ja teise õpetaja tunniplaani eeltäitmine: otsustamata.

### Säilitustähtaeg (hiljem samal päeval)
- Tunnid koos skaneeringute, käsitsi paranduste ja märkmetega kustutatakse serverist 7 päeva pärast tundi
  (tööruumi seade, muudetav rühmade lehel). Kustutamine käib andmebaasis igal ööl; GitHubi töövoog käivitab
  sama koristuse varuks kaks korda nädalas.
- Õpilase leht ütleb tähtaja välja; ajalugu näitab iga tunni kustumise kuupäeva.
- Rühmade nimekirjad ja telefonide sidumised jäävad alles, kuni õpetaja rühma kustutab.

### Vastavuse kontroll (hiljem samal päeval)
- Kontrollitud kooli kordade, ÕKE ja Andmekaitse Inspektsiooni juhiste vastu. Sisuliselt on lahendus kooskõlas
  (päevik jääb Tahvlisse, õpetaja salvestab ise, andmed krüpteeritud ja EL-is), kuid kasutuselevõtt vajab kooli
  heakskiitu. README-sse lisatud jaotis „Enne kasutuselevõttu koolis“.
- Lahendatud: säilitustähtaeg (vt eelmine jaotis).
- Lahti: kooli heakskiit, leping teenusepakkujaga, õpilaste teavitustekst.
