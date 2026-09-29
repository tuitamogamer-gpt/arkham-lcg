# Plan poboljšanja — Arkham Chronicle

Datum analize: 28. septembar 2026. Pregledan je kompletan kod (engine, UI, stilovi, testovi, skripte), dokumentacija, produkcijski deploy u browseru (desktop i mobilni prikaz) i ponašanje engine-a pod nasumičnim igranjem (520 automatskih partija).

## Status 29. septembar 2026.

| Stavka | Stanje |
|--------|--------|
| Bug petlje „Choose engagement" + regresija + zaštita od petlje + fuzz test | urađeno |
| Tempo igre (Detailed / Smart / Fast) i Enter za nastavak | urađeno |
| Undo zadnje akcije unutar poteza | urađeno |
| Optimizacija slika (WebP, thumbnail-i) i keširanje | urađeno |
| Više save slotova, statistika zatvorenih slučajeva | urađeno |
| Vjerovatnoća uspjeha prije izvlačenja | urađeno |
| CI (GitHub Actions) sa browser provjerom | urađeno; zaštita grane se uključuje ručno na GitHubu |
| Zastarjeli tekstovi, opis stranice, noindex | urađeno |
| PWA (offline, instalacija), mobilna donja navigacija, zvuk, tutorial | urađeno |
| Registar skripti karata i scenario kao podaci | nije urađeno; ostaje preduslov za nove scenarije |
| Konsolidacija CSS-a | nije urađeno; traži vizuelni pregled svakog ekrana |
| Dexter, Isabelle, Scenario II, nadogradnje, Scenario III | nije urađeno; novi sadržaj, zaseban projekat |
| Prevod interfejsa | nije urađeno |

## Stanje danas

Šta radi dobro:

- Prvi scenario (Spreading Flames) je kompletno skriptovan i rigorozno testiran (165 testova prolazi, build prolazi).
- Pravila su provjerena naspram zvaničnog Grimoire-a; usporedba svih 28 karata scenarija s kodom nije našla odstupanja.
- Vizuelni identitet je na visokom nivou: originalni skenovi, fontovi, fizički sto, animacije, uvod u priču.
- Save/load je robustan: 520 nasumičnih partija bez ijednog pada ili nevažećeg save-a.

Gdje su rupe (rangirano po važnosti):

| # | Propust | Ozbiljnost |
|---|---------|------------|
| 1 | Igra se može trajno zaglaviti (beskonačni izbor „Choose engagement") | Kritično |
| 2 | Previše „Continue" klikova po rundi (do 51 s tri istražitelja) | Visoko |
| 3 | Kampanja se završava nakon prvog scenarija; XP nema gdje potrošiti | Visoko |
| 4 | Karte se učitavaju sporo (58 MB slika, bez optimizacije i keširanja) | Visoko |
| 5 | Kod nije spreman za nove scenarije (karte hardkodirane u jednom fajlu od 4.400 linija) | Visoko |
| 6 | Nema CI provjere prije deploya | Srednje |
| 7 | Dexter i Isabelle nisu igrivi | Srednje |
| 8 | Nema undo, jedan save slot, nema statistike | Srednje |
| 9 | Mobilni prikaz troši trećinu ekrana na bočnu traku | Nisko (desktop je prioritet) |
| 10 | Zastarjeli tekstovi u aplikaciji i README-u | Nisko |

## 1. Kritični bug: beskonačna petlja pri angažovanju neprijatelja

Reproducirano u 3 od 400 nasumičnih partija s tri istražitelja.

Uslovi: tri istražitelja, jedan je poražen (npr. Trish umre u fazi neprijatelja), preostala dva su na istoj lokaciji sa spremnim neprijateljem koji nije angažovan. U fazi upkeep igra pita „Choose engagement" (Joe ili Daniela). Nakon izbora isti dijalog se vrati, u nedogled. Autosave pamti zaglavljeno stanje pa ni reload ne pomaže.

Uzrok (`src/game/engine.ts`, funkcija `drain`): efekti nastali iz izbora dobiju kao „aktera" trenutno fokusiranog igrača, a to je poraženi istražitelj. Engine preskače efekte poraženih igrača osim onih na bijeloj listi. `engagement` jeste na listi, `assignEngagement` nije, pa se dodjela nikad ne izvrši, a provjera angažovanja se ponovo pokrene.

Šta uraditi:

- Efekte nastale iz sistemskih izbora (angažovanje, vatra, red efekata) označiti kao „scenario" aktera ili dodati `assignEngagement` na bijelu listu.
- Dodati regresijski test koji reproducira tačno ovaj scenario.
- Dodati opštu zaštitu: ako se ista odluka pojavi drugi put bez promjene stanja, engine je automatski razriješi ili prijavi grešku umjesto petlje.
- Dodati fuzz test u test paket (nasumične legalne akcije kroz nekoliko stotina partija). Upravo je taj pristup našao ovaj bug, a postojećih 165 ručno pisanih testova nije.
- U UI dodati „sigurnosni izlaz": mogućnost vraćanja na prethodno stanje (vidi Undo u fazi 2).

Procjena: mali posao.

## 2. Tempo igre: manje klikanja

Mjerenje s heurističkim igračem:

| Partija | Continue klikova po rundi | Odluka i akcija po rundi |
|---------|---------------------------|--------------------------|
| Solo (Joe) | 12–23 | 7–15 |
| Tri istražitelja | 22–51 | 38–44 |

Najčešće pauze su trivijalne: „Resources gained", „Card drawn", „Clue contributed", „Enemy engagement". Svaki kliknuti „Continue" prekida tok.

Šta uraditi:

- Dodati postavku „Tempo" s tri nivoa. Detaljno: kao sada. Pametno: pauza samo na napadima, encounter kartama, šteti/hororu, izborima, prelasku priče i poraz/pobjeda. Sitni događaji prolaze automatski uz kratku animaciju i zapis u hroniku. Brzo: pauza samo na izborima i priči.
- Grupisati uzastopne događaje istog tipa u jedan prozor (npr. tri „Card drawn" u jedan prozor „Drawn 3 cards" s listom).
- Zadržati postojeći princip da animacija nikad ne pokreće pravila; samo se mijenja koji događaji traže potvrdu.
- Tastaturna prečica (Space/Enter) za Continue, vidljiva u prozoru.

Procjena: srednji posao. Engine već ima sve podatke o događaju (naslov, ton, promjene), pa je ovo uglavnom prezentacijska odluka.

## 3. Brzina učitavanja slika

Izmjereno na produkciji:

| Stavka | Vrijednost |
|--------|------------|
| Ukupno slika karata | 233 fajla, 58 MB |
| Prosječna karta | 250–350 KB JPEG, 708×1026 px |
| Prikaz ruke pri prvom otvaranju | prazni okviri ~3 sekunde |
| Cache header za /art | `max-age=0, must-revalidate` (svaki posjet ponovo provjerava) |

Šta uraditi:

- Skripta koja iz originala generiše WebP (i po mogućnosti AVIF) u dvije veličine: mini za sto, ruku i arhivu (oko 30–50 KB) i punu za inspekciju karte.
- Komponente koje prikazuju karte koriste mini verziju, a punu tek pri otvaranju detalja.
- U `vercel.json` dodati dugotrajno keširanje za `/art/*` (godinu dana, immutable). Ako se slika ikad zamijeni, promijeniti joj ime fajla.
- Preload slika ruke i aktivnih lokacija odmah nakon učitavanja partije; preload karata iz vrha decka nije dozvoljen (otkrio bi budućnost), pa to ne raditi.
- Miskatonic pozadina (2,4 MB PNG) pretvoriti u WebP.

Procjena: mali do srednji posao. Najveći vidljivi dobitak po uloženom.

## 4. Temelj za nove scenarije: registar skripti karata

Stanje: `src/game/engine.ts` ima 4.402 linije. Karte su prepoznate po brojevima na više od stotinu mjesta u kodu (npr. `C(17)`, `C(35)`, `"12050"`). Skriptovano je 55 od 99 karata igrača i 14 od 92 encounter karte. Svaki novi scenario ili istražitelj traži prekopavanje ovog fajla, s visokim rizikom da se nešto postojeće pokvari.

Šta uraditi:

- Uvesti registar skripti: jedan fajl po kartici ili po encounter setu, sa jasnom strukturom: uslovi, cijena, efekti, reakcije, prozori. Engine samo izvršava opisane efekte.
- Scenario opisati podacima: lokacije, veze, pozicije na mapi, act/agenda pragovi, setup, rezolucije. Danas su Spreading Flames lokacije i pragovi upisani direktno u engine i u `Tabletop.tsx`.
- Refaktor raditi postepeno: prvo izdvojiti karte igrača iz startera, pa encounter set, pa scenario. Nakon svakog koraka svih 165 testova mora proći nepromijenjeno.
- Tek nakon ovoga dodavati Dextera, Isabelle i Scenario II.

Procjena: velik posao, ali preduslov za sve iz odjeljka 6.

## 5. Kvalitet i sigurnost isporuke

Stanje:

| Stavka | Vrijednost |
|--------|------------|
| CI | ne postoji; Vercel deploya svaki push na main bez testova |
| Browser provjere | 13 Playwright skripti, pokreću se ručno |
| Testovi UI komponenti | 0 |
| CSS | 12 fajlova, 14.138 linija, 42 `!important`, 205 KB u buildu |

Slojevi CSS-a prepisuju jedni druge redom učitavanja (styles → arkham-theme → tabletop → refinements → motion → identity → story → chaos-bag → premium-table → chaos-draw). To otežava svaku vizuelnu promjenu.

Šta uraditi:

- GitHub Actions: na svaki push i PR pokrenuti TypeScript provjeru, testove, build i bar jednu dimnu Playwright provjeru. Vercel deploy tek nakon zelenog CI-ja.
- Fuzz test (iz odjeljka 1) kao dio CI-ja.
- Konsolidovati CSS: jedan set tokena (boje, fontovi, razmaci), stilovi po komponenti, ukloniti mrtvi CSS uz pomoć coverage alata. Cilj: ispod 100 KB i bez `!important`.
- Ažurirati zastarjele tekstove: postavke pišu „Spreading Flames / Joe Diamond", vodič kaže da su timing prozori „u razvoju" iako su gotovi, README navodi 142 testa umjesto 165, opis u `index.html` kaže „solo".

Procjena: srednji posao.

## 6. Sadržaj kampanje

Stanje: Brethren of Ash ima tri scenarija, igriv je jedan. Nakon rezolucije kampanjski zapis se čuva, ali nema nastavka. XP i trauma se bilježe, ali XP se nigdje ne troši. Dexter Drake i Isabelle Barnes imaju dosijee, ali ne i igrive startere. 42 karte igrača van tri startera nisu skriptovane (20 na nivou 0, ostatak su nadogradnje).

Redoslijed:

1. Dexter Drake i Isabelle Barnes sa zvaničnim starter deckovima (nove skripte za njihove karte, elder sign efekti, slabosti). Srednji posao nakon refaktora.
2. Scenario II „Smoke and Mirrors" uključujući codex grananja i prenos stanja iz Scenarija I (Armitage, odluke, trauma). Velik posao.
3. Ekran nadogradnje između scenarija: trošenje XP-a na karte višeg nivoa, zamjena karata, poštovanje deckbuilding pravila s poleđine istražitelja. Srednji do velik posao.
4. Scenario III „Queen of Ash" i završetak kampanje s epilozima. Velik posao.
5. Kampanjski dnevnik: pregled svih odluka, trauma i XP po scenariju.

## 7. Iskustvo igranja: manje ali osjetne stvari

- Undo zadnje akcije unutar vlastitog poteza, do trenutka izvlačenja tokena. Stanje je već čist snapshot, treba čuvati zadnjih nekoliko stanja. Ovo je i „sigurnosni izlaz" za buduće bugove. Mali posao.
- Više save slotova i više kampanja umjesto jednog slota koji se prepiše. Mali posao.
- Statistika: pobjede, porazi, XP, trajanje, po istražitelju. Mali posao.
- Prikaz vjerovatnoće uspjeha prije izvlačenja tokena (sadržaj vrećice je javan, izračun je trivijalan). Mali posao, veliki „digitalni" dojam.
- Interaktivni tutorial kroz prvu rundu umjesto statičnog vodiča. Srednji posao.
- Zvuk: umjesto sintetizovanog šuma, pravi ambijent i efekti (izvlačenje tokena, napad, vatra, otkrivanje karte), s glavnim prekidačem. Mali do srednji posao uz nabavku zvukova.
- PWA: instalacija na desktop i telefon, rad bez interneta (aplikacija je već local-first). Mali posao.
- Mobilni: bočna traka u donju navigaciju, veće dodirne površine, dugi dodir umjesto hover pregleda. Srednji posao, po tvojoj odluci nije prioritet.
- Opcioni prevod interfejsa na naš jezik (tekst karata ostaje engleski). Srednji posao.

## 8. Rizici na koje treba obratiti pažnju

- Autorska prava: aplikacija javno hostuje 58 MB originalnih skenova karata FFG-a. Fan projekat s disclaimerom je uobičajen, ali link držati privatnim ili barem dodati `noindex`, bez monetizacije.
- Kompatibilnost save-ova: svaki refaktor engine-a mora zadržati verziju 3 ili dodati migraciju; postojeći testovi za migraciju to pokrivaju.

## Predloženi redoslijed rada

| Faza | Sadržaj | Procjena |
|------|---------|----------|
| 0 | Bug petlje + regresija + fuzz test, zastarjeli tekstovi, cache headeri | mali |
| 1 | Tempo/pametne pauze, undo, optimizacija slika, više save slotova, vjerovatnoća uspjeha | srednji |
| 2 | Registar skripti karata, scenario kao podaci, CI, CSS konsolidacija | velik |
| 3 | Dexter i Isabelle, Scenario II, nadogradnje, Scenario III | vrlo velik |
| 4 | Tutorial, zvuk, PWA, mobilni, prevod | srednji |

Faza 0 i faza 1 daju najveći dobitak za igrača uz najmanji rizik i ne zavise jedna od druge. Faza 2 je preduslov za fazu 3.
