# Muudatuste ajalugu

## 2026-11-28

### Dokumentatsioon
- README: uus jaotis „Kui rühma tuleb uus õpilane“ (mis juhtub, kuni teda rühma nimekirjas ei ole, ja kuidas
  ta lisada, ka tunni ajal); seisu lause ajakohastatud.
- RESUME_HERE: kasutaja otsust ootavad parandused on nüüd „Järgmistes sammudes“, mitte ainult komistuskivides.

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

### Nime lukustamine (hiljem samal päeval)
- Õpetaja lehel nimel puudutades nupp „Lukusta nimi“ / „Ava nime lukk“; lukus nime kõrval silt „lukus“, rühma
  kaardil „N nime lukus“. Lukk kuulub rühmale ja kehtib ka järgmistes tundides.
- Lukus nime saab õpilane valida, aga sidumine jääb ootele: õpilane näeb „Selle nimega saab telefoni siduda
  ainult õpetaja loal. Pöördu õpetaja poole.“, õpetaja lehele ilmub „nimi on lukus, telefon tahab selle nimega
  siduda“ nuppudega „Luba“ ja „Keela“. Juba seotud telefoni lukk ei puuduta.
- Õpilase ootelehel nupp „Valisin vale nime“, mis viib tagasi nimede juurde (ka telefoni vahetuse ootel).
- Server: uus migratsioon `…_lock.sql` (`grp.locked`, `koh_lock`; `koh_bind` vastuses `why: locked | taken`).

### Parandused (hiljem samal päeval)
- Õpetaja lehe allservas oli kogu aeg näha tühi teateriba nupuga „Võta tagasi“ (`.toast` stiil tühistas
  atribuudi `hidden`).
- Kui telefon küsis esmalt hõivatud nime ja sidus end siis teise, vaba nimega, jäi esimene soov õpetaja
  lehele rippuma; nüüd kustub see sidumisel.
- Testi võltstunniplaan läks pärast kella 22.20 üle südaöö ja üks test kukkus; plokk lõpeb nüüd hiljemalt 23.59.

**Otsused**
- Lukus nimi jääb õpilase nimekirja nähtavale (ei peideta), nagu tellija soovis: valida saab, aga tuleb teade.
- Õpetaja luba ei ava lukku: lukku muudab ainult õpetaja nupust.

### Testid (hiljem samal päeval)
Koodi ei muudetud: need käitumised olid olemas, nüüd on need testiga kaetud.
- Lõpetatud tunni vaatest pandud lukk kehtib rühma järgmises tunnis (läbiv test).
- Õpilane, kes on Tahvli kandes, aga mitte andmetes: teiste read ei nihku, tema rida jääb muutmata ja aruanne
  nimetab ta (skripti test jäljendatud vormil; päris Tahvlis proovimata).
- Rühma muutmine tunni ajal: uus nimi ilmub käimasolevasse tundi, sidumised ja lukud jäävad, uus õpilane saab
  samas tunnis skannida (läbiv test).

### Leitud nõrkused (lahendamata)
- Tundmatu brauser saab valida iga vaba nime, nii et üks telefon võib märkida mitu inimest. Lukustamine
  kitsendab seda ainult lukku pandud nimede osas.
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
