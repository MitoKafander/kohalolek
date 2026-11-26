# RESUME_HERE — Kohalolek

Loe see enne tööle asumist. Kasutaja vaade on [README.md](README.md), muudatuste ajalugu [CHANGELOG.md](CHANGELOG.md).
Repo on avalik: nimesid, kooli siseasju ega saladusi siia ei kirjutata (need on töökeskkonna mälus).

## Mis ja kus

| Asi | Kus |
| :--- | :--- |
| Õpilase leht | https://mitokafander.github.io/kohalolek/ |
| Õpetaja leht | https://mitokafander.github.io/kohalolek/opetaja/ |
| Tahvli skript (praegu **0.3.0**) | https://mitokafander.github.io/kohalolek/kohalolek-tahvel.user.js |
| Kood | see kaust, oma git-repo → `MitoKafander/kohalolek` |
| Server | Supabase projekt `sxjbrlppcvlmbojxulhh` (eu-west-1, tasuta plaan, organisatsioon „Kohalolek“) |

## Ligipääs ja töövoog

- **Avaldamine:** `git push origin main` → GitHub Actions avaldab kausta `site/` ja skripti umbes minutiga.
  Commit'i autoriks `MitoKafander <MitoKafander@users.noreply.github.com>`.
- **Lehe vahemälu:** GitHub Pages võib vana lehte anda kuni 10 min. Kontrollides lisa aadressile `?v=<aeg>`,
  kasutajale ütle ⌘⇧R.
- **Andmebaas:** võti on failis `~/.config/kohalolek/token.txt` (ainult see projekt). `supabase` CLI on sisse
  logitud teise kontoga, seda siin ei kasuta. SQL käib halduse API kaudu:

  ```bash
  T=$(tr -d '[:space:]' < ~/.config/kohalolek/token.txt)
  curl -s -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
    https://api.supabase.com/v1/projects/sxjbrlppcvlmbojxulhh/database/query \
    -d '{"query":"select count(*) from kohalolek.session"}'      # 201 = õnnestus
  ```

  Uus migratsioon: fail kausta `supabase/migrations/`, sisu samale aadressile (`{"query": <faili sisu>}`), siis
  kontrolli avalikust API-st, et uus funktsioon vastab (vale parooliga peab tulema 200 ja `err: auth`, mitte 404).
- **Näidistööruum** `proov` (rühm NÄIDIS, väljamõeldud nimed) on päris lehe proovimiseks. Parool:
  `~/.config/kohalolek/proov_parool.txt`. Korista enda järelt: kustuta proovitund, eemalda sidumised.
- **Kutsekoodid:** kõik seni tehtud on kasutatud. Uus:
  `insert into kohalolek.invite (code_hash, note) values (encode(sha256(convert_to('KOOD','utf8')),'hex'), 'märkus');`
- **Testid:** `npm test` = andmebaasi loogika (PGlite, 62), läbiv test Chrome'is (69), skript jäljendatud Tahvli
  vormil (11). Ekraanipildid `test/shots/`.
- **Päris Tahvli vormi kontroll** vajab kasutaja sisselogimist. Töövõte: eraldi Chrome
  `--remote-debugging-port=9377 --user-data-dir=<ajutine>` ja `playwright-core` `connectOverCDP`. Reeglid: vormi
  ainult täida, sulge nupuga „Sulge“ (mitte „Salvesta“) ja kontrolli kannete arvu; õpilaste teksti ära tagasta
  (ka skripti aruannet mitte); lõpus logi välja, sulge aken, kustuta profiil.

## Kontrollitud seis (26.11.2026)

- Päris lehel ja serveris näidistööruumis: tööruumi loomine ja sisselogimine teises seadmes, rühm, tund, skannimine,
  telefoni vahetus õpetaja loaga, aegunud kood, käsitsi parandus, uus kontroll, eksport, kaks õpetaja seadet samas
  tunnis, märkused ja kiitused (telefon märgib, arvuti näeb).
- Päris Tahvli vormil (salvestamata): P/H linnukesed, selgitus + „Märkus“, kande päis (liik, maht, kuupäev,
  algustund, tundide arv), tunnikaupa P/H veeru „123?“ kaudu, korduv kleepimine, nimekirja kopeerimise nupp.
- Tunniplaanist eeltäitmine päris tunniplaani andmetega (õiged algustunnid ja tundide arvud mitmel päeval).
- Säilitustähtaeg: kõigil tööruumidel 7 päeva, `cron.job` „kohalolek-cleanup“ iga öö 01:23 UTC (aktiivne),
  käsitsi käivitus töötab. Esimest päris kustutamist pole veel näinud (ühtegi nii vana tundi ei ole).
- Kasutaja on päris telefoniga skanninud ning loonud oma tööruumi ja rühma; serveris on 3 tööruumi.

## Proovimata

- Päris tund: terve klass korraga, kooli Wi-Fi, iPhone'id, mitmetunnine päev algusest lõpuni.
- „Kiitus“ linnuke ja kinnitatud tõendiga õpilane (P → V) päris Tahvlis: ainult jäljendatud vormil.
- Vivaldi brauser (teisel õpetajal ei ilmunud nimekirjanupp; pärast 0.1.1 parandust tagasisidet pole).

## Järgmised sammud

1. Esimese päris tunni tagasiside ja sellest tulenevad parandused.
2. Kasutajalt vastuseta: kas tuua siia perioodi kokkuvõte rühmajuhendajale (Tunnimärkmetes oli) ja kas teha
   tunniplaanist eeltäitmine ka teise õpetaja tundidele (praegu ainult ühe õpetaja tunniplaan).
3. Andmebaasi võti aegub kunagi: siis palu uus samade õigustega ja lase kleepida tühja faili (`open -e`).
4. Ideed, mida pole küsitud: tunnikaupa staatuse käsitsi muutmine õpetaja lehel, asenduste arvestamine
   tunniplaanis, lisaandmete aatomne salvestus serveris, kooli Microsofti konto õpilase tuvastamiseks.

## Komistuskivid

- **`koh_session_state` ja `koh_ws_login`** on mitmes migratsioonis uuesti defineeritud. Kehtib kõige uuema
  migratsiooni variant; muutes kopeeri sealt.
- **Vahetuv kood:** 10 s aken ja sama arvutus peab klappima SQL-is (`kohalolek.token`) ja JS-is (`KOH.token`).
- **Tööruumi nime teisendus** (`normCode`) peab olema loomisel ja sisselogimisel sama, sest nimi on võtme sool.
  Parool ei ole taastatav.
- **Tahvli skript:** iga muudatusega tõsta `@version`, muidu Tampermonkey ei uuenda. Liigi ja mahu valikud
  leitakse eestikeelse teksti järgi („Tund“, „Auditoorne õpe“); muu keelega Tahvlis jäävad need täitmata ja
  aruanne ütleb seda. Kuupäev: `input` + `InputEvent` + Enter (lihtsalt väärtuse seadmine ei jää külge).
- **Lisaandmete salvestus** (`saveMeta`) loeb enne värske seisu ja kirjutab siis terve objekti: kaks seadet samal
  sekundimurdosal võivad teineteist üle kirjutada.
- **Tunniplaanist eeltäitmine** sõltub naaberlehe failist `/tunniplaan/data/snap.json`; rühma nimi peab klappima
  EduPage'i rühma koodiga. Testides annab selle võltsandmetega `test/shim.mjs`.
- **Pages'i töövoog:** üleslaadimine ja avaldamine peavad olema eraldi töödes (samas töös „0 artifacts“).
- **Tasuta Supabase** uinub 7 päeva jõudeoleku järel; `.github/workflows/keepalive.yml` teeb päringu E ja N
  ning käivitab varuks `koh_cleanup`. Uinunud projektis `pg_cron` ei jookse.
- **Kustutamine** eemaldab ainult tunnid (kaskaadiga skaneeringud, parandused, märkmed). Nimekirjad ja
  sidumised jäävad; kui neile on vaja tähtaega, tuleb see eraldi teha.
- **iPhone'i Safari** kustutab 7 päeva kasutamata saidi andmed: pärast vaheaega võib telefoni sidumine kaduda,
  siis küsib õpilane nime uuesti ja õpetaja vajutab „Luba“.
