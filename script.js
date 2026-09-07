// ============================================================
// Kai Faiz — portefølje
// Ett viewport, horisontalt oppsett: navbar på toppen og en
// vannrett kortstokk (looper begge veier). Skroll/sveip blar,
// klikk 1 = forstørret visuelt, klikk 2 = tekstbeskrivelse.
// Om meg er en egen «side» i samme viewport (mode-about):
// teksten scroller, figuren er sticky og videoen scrubbes av
// scrollen. Minimer-knappen følger pekeren langs kortkanten
// (kun i forstørret/tekst-modus). Aktivt kort har peker-parallaks.
// ============================================================

(() => {
  const panels = Array.from(document.querySelectorAll('.panel'));
  const headings = Array.from(document.querySelectorAll('.case-heading'));
  const dots = Array.from(document.querySelectorAll('.deck-dots .dot'));
  const closeBtn = document.querySelector('.close-btn');
  const chip = document.querySelector('.edge-chip');
  const aboutToggle = document.querySelector('.about-toggle');
  const aboutView = document.querySelector('.about-view');
  const aboutVideo = document.querySelector('.about-media video');
  const brand = document.querySelector('.brand');
  const navWidgets = document.querySelector('.nav-widgets');
  const deck = document.querySelector('.deck');
  // Flere kort har sin egen sidestokk (OsloLut og Badstulaug), så hver
  // stokk må huske sin egen plass. Bare stokken i det aktive kortet
  // svarer på skroll, sveip og piltaster.
  const reels = Array.from(document.querySelectorAll('.case-reel')).map((el) => ({
    el,
    panel: el.closest('.panel'),
    items: Array.from(el.querySelectorAll('.reel-item')),
    teller: el.closest('.card').querySelector('.reel-count b'),
    aktiv: 0,   // hvilken side som står i midten
  }));
  const aboutId = document.querySelector('.about-id');
  const aboutBack = document.querySelector('.about-back');
  const n = panels.length;

  let active = 0;
  let lydPa = false;   // opptakene starter dempet; knappen slår på lyden
  let mode = 'deck'; // 'deck' | 'expanded' | 'text' | 'about'
  let wheelAcc = 0;
  let coolingDown = false;
  let spotSync = null;   // settes av Kryp-avspilleren lenger ned
  let orbitTikk = null;  // settes av utstyrsringen lenger ned

  // Når intro-animasjonene er ferdige må klassene bort, ellers låser
  // «animation-fill-mode: forwards» opasiteten og modusbyttene får ikke
  // fade elementene ut. Tidsavbruddet er en reserve for tilfeller der
  // animationend aldri kommer (redusert bevegelse, bakgrunnsfane).
  function clearIntro(el, cls, fallback) {
    if (!el) return;
    const done = (e) => {
      if (e && e.target !== el) return; // ignorer bobling fra barn
      el.classList.remove(cls);
      el.removeEventListener('animationend', done);
    };
    el.addEventListener('animationend', done);
    setTimeout(done, fallback);
  }

  clearIntro(navWidgets, 'intro-fade', 2000);
  clearIntro(deck, 'deck-intro', 2000);

  function render() {
    document.body.classList.remove('mode-deck', 'mode-expanded', 'mode-text', 'mode-about');
    document.body.classList.add(`mode-${mode}`);

    panels.forEach((panel, i) => {
      panel.classList.remove('is-active', 'is-left', 'is-right', 'is-back');
      // signert sirkulær avstand: 0 = midten, -1/+1 = naboene, resten
      // parkerer bak midtkortet. Signert avstand gjør at stokken looper
      // like naturlig begge veier.
      let d = (i - active + n) % n;
      if (d > n / 2) d -= n;
      if (d === 0) panel.classList.add('is-active');
      else if (d === -1) panel.classList.add('is-left');
      else if (d === 1) panel.classList.add('is-right');
      else panel.classList.add('is-back');
    });

    headings.forEach((h, i) => h.classList.toggle('is-current', i === active));

    dots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === active);
      dot.setAttribute('aria-selected', i === active ? 'true' : 'false');
    });

    if (mode !== 'expanded' && mode !== 'text') hideChip();

    updateReel();
    if (spotSync) spotSync();
  }

  // ============================================================
  // Sidestokkene i OsloLut- og Badstulaug-kortet
  // Bare det som faktisk er synlig spilles av. Video er dyrt, og tre
  // samtidige avspillinger i et kort som uansett er delvis skjult er
  // ren sløsing — dessuten blokkerer nettleseren autoplay som ikke er
  // dempet, så play() kan avvises og må fanges.
  // ============================================================

  const gallerier = new Map();

  // ============================================================
  // Bildekarusellene
  // Brukes to steder: forarbeidet i Badstulaug-kortet, og de to
  // telefonskjermene med statistikk i Knytt-kortet. De blar av seg selv
  // så lenge boksen står i midten — samme regel som videoene, der bare
  // det du faktisk ser spiller. Prikkene, pilene og pekeren tar over med
  // en gang du rører dem.
  //
  // Én boks kan ha flere karuseller (Knytt har to telefoner ved siden av
  // hverandre), så oppslaget holder en liste per boks og ikke én enkelt.
  // Kontrollene får lov til å ligge utenfor selve karusellen: i telefonen
  // er prikkene under skjermen, ikke oppå den. Da er det .gal-boks som er
  // rammen vi leter i.
  // ============================================================

  const roligBevegelse = matchMedia('(prefers-reduced-motion: reduce)');

  document.querySelectorAll('.reel-gallery').forEach((gal) => {
    const boks = gal.closest('.reel-item');
    const styring = gal.closest('.gal-boks') || gal;
    const bilder = Array.from(gal.querySelectorAll('.gal-slide'));
    const prikker = Array.from(styring.querySelectorAll('.gal-dot'));
    const etikett = styring.querySelector('.gal-label');
    if (!boks || bilder.length < 2) return;

    // to karuseller ved siden av hverandre i takt ser ut som en feil.
    // Ulik lengde lar dem gli fra hverandre av seg selv.
    const TID = Number(gal.dataset.tid) || 4200;
    let i = 0;
    let timer = null;
    let synlig = false;

    function vis(neste) {
      const gn = bilder.length;
      i = ((neste % gn) + gn) % gn;   // looper begge veier, som stokkene
      bilder.forEach((b, k) => b.classList.toggle('is-on', k === i));
      prikker.forEach((d, k) => {
        d.classList.toggle('is-on', k === i);
        d.setAttribute('aria-current', k === i ? 'true' : 'false');
      });
      if (etikett) etikett.textContent = bilder[i].dataset.tittel || '';
    }

    function stopp() {
      clearTimeout(timer);
      timer = null;
    }

    // Neste bilde legges som ett enkelt tidsavbrudd, ikke et intervall:
    // da starter klokka på nytt hver gang noen blar selv, og bildet man
    // nettopp valgte får hele sin tid.
    function planlegg() {
      stopp();
      if (!synlig || roligBevegelse.matches) return;
      timer = setTimeout(() => { vis(i + 1); planlegg(); }, TID);
    }

    function bla(steg) {
      vis(i + steg);
      planlegg();
    }

    // Kontrollene må stoppe klikket selv. Ellers bobler det opp til
    // kortet, som tolker et klikk på midtboksen som «åpne teksten».
    styring.querySelectorAll('.gal-arrow').forEach((knapp) => {
      const steg = knapp.classList.contains('gal-arrow--prev') ? -1 : 1;
      knapp.addEventListener('click', (e) => {
        e.stopPropagation();
        bla(steg);
      });
    });

    prikker.forEach((d, k) => {
      d.addEventListener('click', (e) => {
        e.stopPropagation();
        vis(k);
        planlegg();
      });
    });

    // en skjerm man kan trykke på blar videre selv, som en story
    if (gal.classList.contains('reel-gallery--tap')) {
      gal.addEventListener('click', (e) => {
        e.stopPropagation();
        bla(1);
      });
    }

    // står man og ser på et bilde, skal det ikke bla videre under nesen
    gal.addEventListener('mouseenter', stopp);
    gal.addEventListener('mouseleave', () => { if (synlig) planlegg(); });

    const liste = gallerier.get(boks) || [];
    liste.push({
      spill(pa) {
        if (pa === synlig) return;
        synlig = pa;
        if (pa) {
          planlegg();
        } else {
          stopp();
          vis(0);   // neste gang begynner den forfra, som videoene
        }
      },
    });
    gallerier.set(boks, liste);
  });

  // ============================================================
  // Lyd
  // Nettleseren lar bare dempede opptak starte av seg selv, så alt
  // begynner stumt. Knappen er den håndsopprekningen som gjør lyd lovlig,
  // og valget gjelder resten av besøket — blar du videre, spiller neste
  // boks med lyd uten at du må trykke på nytt. Bare den boksen som står i
  // midten spiller, så det kan aldri komme lyd fra to steder samtidig.
  // ============================================================

  const lydKnapper = Array.from(document.querySelectorAll('.lyd-knapp'));

  // Knappen er fasiten: en boks uten den har ikke noe å høre, og skal
  // holde seg stum selv om lyden er slått på et annet sted. OsloLut er
  // skjermopptak, og der ville lyden bare vært en overraskelse.
  function kanHaLyd(item) {
    return !!item.querySelector('.lyd-knapp');
  }

  function settLyd(pa) {
    lydPa = pa;
    document.body.classList.toggle('lyd-pa', pa);

    reels.forEach((r) => r.items.forEach((item) => {
      const v = item.querySelector('video');
      if (v) v.muted = !pa || !kanHaLyd(item);
    }));

    lydKnapper.forEach((k) => {
      k.setAttribute('aria-pressed', pa ? 'true' : 'false');
      k.setAttribute('aria-label', pa ? 'Slå av lyd' : 'Slå på lyd');
    });
  }

  // Avspilling med lyd kan bli avvist selv etter et klikk — noen nettlesere
  // og strømsparemoduser sier nei uansett. Da er det bedre å gå tilbake til
  // dempet enn å bli stående med et frosset bilde.
  function start(video) {
    video.play().catch(() => {
      if (video.muted) return;
      settLyd(false);
      video.play().catch(() => {});
    });
  }

  lydKnapper.forEach((knapp) => {
    knapp.addEventListener('click', (e) => {
      e.stopPropagation();   // ellers åpner kortet tekstbeskrivelsen
      settLyd(!lydPa);

      // den som allerede spiller skal skifte med en gang, ikke først ved
      // neste boks
      const r = aktivReel();
      if (!r) return;
      const midt = r.items[r.aktiv];
      const v = midt && midt.querySelector('video');
      if (v && v.paused) start(v);
    });
  });

  // ============================================================
  // Kryp — avspilleren i «kommer snart»-kortet
  // Kortet er svart i stokken og blir en avspiller når det åpnes.
  // Ett hørespill, ikke en spilleliste: knappene rundt play hopper
  // 15 sekunder i stedet for å bla til neste spor.
  //
  // Lyden slutter når kortet lukkes. Alternativet — å la den gå videre
  // bak tekstarket eller ute i kortstokken — ville betydd lyd fra et
  // sted man ikke lenger ser, uten noe å trykke pause på.
  // ============================================================

  const spot = document.querySelector('.spot');
  if (spot) {
    const lyd = spot.querySelector('.spot-lyd');
    const spotPanel = spot.closest('.panel');
    const playKnapp = spot.querySelector('.spot-play');
    const scrub = spot.querySelector('.spot-scrub');
    const naFelt = spot.querySelector('.spot-na');
    const lengdeFelt = spot.querySelector('.spot-lengde');
    const statusFelt = spot.querySelector('.spot-status');

    let drar = false;      // fingeren/musa holder i knotten
    let ødelagt = false;

    const klokke = (s) => {
      if (!isFinite(s) || s < 0) return '--:--';
      return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    };

    // linjen fylles med en gradient, ikke med et eget element
    function tegn(andel) {
      const p = Math.min(Math.max(andel, 0), 1);
      scrub.value = String(Math.round(p * 1000));
      scrub.style.setProperty('--p', `${(p * 100).toFixed(2)}%`);
    }

    function visTid() {
      if (drar) return;   // ikke rykk knotten ut av hånden på folk
      naFelt.textContent = klokke(lyd.currentTime);
      if (lyd.duration > 0 && isFinite(lyd.duration)) tegn(lyd.currentTime / lyd.duration);
    }

    // Uten lydfil er det ingenting å spille. Da er det bedre å si det
    // rett ut enn å la folk trykke på en knapp som ikke gjør noe.
    function feilet() {
      if (ødelagt) return;
      ødelagt = true;
      spot.classList.add('spot--tom');
      spot.classList.remove('spiller');
      statusFelt.textContent = 'Lydsporet er ikke lagt ut ennå.';
    }

    // Med flere <source> melder nettleseren fra på hver enkelt, ikke på
    // <audio>. Først når den siste har gitt opp er det virkelig tomt.
    const kilder = Array.from(lyd.querySelectorAll('source'));
    let avslag = 0;
    kilder.forEach((k) => k.addEventListener('error', () => {
      if (++avslag >= kilder.length) feilet();
    }));
    lyd.addEventListener('error', feilet);

    lyd.addEventListener('loadedmetadata', () => {
      lengdeFelt.textContent = klokke(lyd.duration);
    });

    lyd.addEventListener('timeupdate', visTid);

    lyd.addEventListener('play', () => {
      spot.classList.add('spiller');
      playKnapp.setAttribute('aria-label', 'Pause');
    });

    lyd.addEventListener('pause', () => {
      spot.classList.remove('spiller');
      playKnapp.setAttribute('aria-label', 'Spill av');
    });

    // Ferdig spilt: still tilbake til start, så neste trykk begynner
    // forfra. Pausen må komme først — uten den tolker nettleseren
    // tilbakestillingen som et hopp i et spor som fortsatt går, og
    // hørespillet begynner på nytt av seg selv.
    lyd.addEventListener('ended', () => {
      lyd.pause();
      lyd.currentTime = 0;
      naFelt.textContent = '0:00';
      tegn(0);
    });

    // Kortet lytter selv etter Enter og mellomrom, og ville tatt
    // tastetrykket fra knappene under seg — «spill av» ble til «vis
    // tekstbeskrivelsen». Her stopper de før de kommer så langt.
    // «Om prosjektet» er unntaket: den skal nettopp dit, og kommer seg
    // fram via klikket knappen utløser selv.
    spot.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') e.stopPropagation();
    });

    // Klikkene må stoppes her: ellers bobler de opp til kortet, som
    // tolker et trykk i forstørret modus som «vis tekstbeskrivelsen».
    playKnapp.addEventListener('click', (e) => {
      e.stopPropagation();
      if (ødelagt) return;
      if (lyd.paused) {
        lyd.play().catch(() => {
          if (lyd.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) feilet();
        });
      } else {
        lyd.pause();
      }
    });

    spot.querySelectorAll('.spot-hopp').forEach((knapp) => {
      knapp.addEventListener('click', (e) => {
        e.stopPropagation();
        if (ødelagt) return;
        const slutt = isFinite(lyd.duration) ? lyd.duration : Infinity;
        lyd.currentTime = Math.min(Math.max(lyd.currentTime + Number(knapp.dataset.hopp), 0), slutt);
        visTid();
      });
    });

    function settFraScrub() {
      if (!isFinite(lyd.duration) || lyd.duration <= 0) return;
      lyd.currentTime = (Number(scrub.value) / 1000) * lyd.duration;
    }

    scrub.addEventListener('click', (e) => e.stopPropagation());
    scrub.addEventListener('pointerdown', () => { drar = true; });

    scrub.addEventListener('input', () => {
      const andel = Number(scrub.value) / 1000;
      scrub.style.setProperty('--p', `${(andel * 100).toFixed(2)}%`);
      if (isFinite(lyd.duration)) naFelt.textContent = klokke(andel * lyd.duration);
      if (!drar) settFraScrub();   // piltaster hopper med en gang
    });

    // Slippet kan skje hvor som helst på siden, ikke bare oppå linjen.
    // Uten den siste vakten blir «drar» hengende og tiden fryser.
    scrub.addEventListener('change', () => { drar = false; settFraScrub(); });
    window.addEventListener('pointerup', () => {
      if (!drar) return;
      drar = false;
      settFraScrub();
    });

    spotSync = () => {
      const fremme = mode === 'expanded' && spotPanel.classList.contains('is-active');
      if (!fremme && !lyd.paused) lyd.pause();
    };
  }

  // ============================================================
  // Utstyrsringen i verktøykortet
  // Gjenstandene ligger på en sirkel som er vippet mot deg. For hver
  // plass regnes sinus ut til hvor langt til siden den står, og cosinus
  // til hvor nær den er. Nærhet styrer alt annet: størrelse, klarhet og
  // hvem som ligger foran hvem. Det er derfor det leser som en ring og
  // ikke som en rekke som sklir.
  //
  // Bildene er flate utklipp. Med ekte 3D-rotasjon ville de stått på
  // kant og blitt usynlige i sidene, så her flyttes de bare i planet og
  // vender alltid rett mot deg.
  //
  // Ringen ER kortforsiden. Den går allerede mens kortet ligger i
  // stokken, og fortsetter i samme runde når kortet åpnes — ingen
  // omstart, ingen ny animasjon. Navn, hjelpetekst og pekeren er det
  // eneste som kommer til i forstørret visning.
  //
  // Rullehjulet dytter på farten; den siger tilbake til grunnfarten av
  // seg selv. Holder du pekeren over noe, bremser ringen ned og stopper.
  // ============================================================

  const orbit = document.querySelector('.orbit');
  if (orbit) {
    const ring = orbit.querySelector('.orbit-ring');
    const ting = Array.from(orbit.querySelectorAll('.orbit-ting'));
    const navnFelt = orbit.querySelector('.orbit-navn');
    const modellFelt = orbit.querySelector('.orbit-modell');
    const orbitPanel = orbit.closest('.panel');

    const GRUNNFART = roligBevegelse.matches ? 0 : 0.0012;   // ett omløp ≈ 90 s
    const STEG = (Math.PI * 2) / ting.length;

    let vinkel = 0;
    let fart = GRUNNFART;
    let valgt = null;      // gjenstanden pekeren står på
    let vistValg = null;   // hva teksten under ringen sier nå

    // Hver gjenstand har sin egen framhevingsgrad som glir mot 0 eller 1.
    // Uten den ville forstørrelsen hoppet, siden JS overskriver transform
    // hvert bilde og CSS-overganger aldri får noe å gå fra.
    const grad = ting.map(() => 0);

    ting.forEach((el, i) => {
      el.addEventListener('pointerenter', () => { valgt = i; });
      el.addEventListener('pointerleave', () => { if (valgt === i) valgt = null; });
      // Uten dette teller et trykk på en gjenstand som et trykk på kortet,
      // og du blir kastet videre til programvarelista.
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        valgt = valgt === i ? null : i;   // på touch er trykk det eneste «hold over»
      });
    });

    // pekeren ut av hele ringen: slipp taket uansett hvor den forsvant
    orbit.addEventListener('pointerleave', () => { valgt = null; });

    // Lytterne må ligge på .orbit og ikke på gjenstandene: hjulet skal
    // virke uansett hvor i ringen pekeren står. Klikk får fortsatt boble
    // videre til kortet, som tar deg til programvarelista.
    orbit.addEventListener('wheel', (e) => {
      // Bare i åpnet kort. I stokken er hjulet stokkens eget — der blar
      // det til neste prosjekt, og skal ikke også sette fart på ringen.
      if (!ringInteraktiv()) return;
      e.preventDefault();
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      // taket hindrer at én hard rulling sender ringen i spinn
      fart = Math.max(-0.055, Math.min(0.055, fart + d * 0.00016));
    }, { passive: false });

    // sveip gjør det samme på touch
    let sveipX = null;
    orbit.addEventListener('touchstart', (e) => { sveipX = e.touches[0].clientX; }, { passive: true });
    orbit.addEventListener('touchmove', (e) => {
      if (sveipX === null || !ringInteraktiv()) return;
      const x = e.touches[0].clientX;
      fart = Math.max(-0.055, Math.min(0.055, fart + (sveipX - x) * 0.0004));
      sveipX = x;
    }, { passive: true });
    orbit.addEventListener('touchend', () => { sveipX = null; }, { passive: true });

    // pekeren og hjulet virker bare i åpnet kort
    function ringInteraktiv() {
      return mode === 'expanded' && orbitPanel.classList.contains('is-active');
    }

    // ...men selve rotasjonen går også i stokken, så lenge kortet er
    // synlig. Kortet som er parkert bak midten er det ikke.
    function ringSynlig() {
      return (mode === 'deck' || mode === 'expanded')
        && !orbitPanel.classList.contains('is-back');
    }

    orbitTikk = () => {
      // Et kort man ikke ser koster ingenting. Ringen står stille med
      // gjenstandene der de var, og plukker opp igjen der den slapp.
      if (!ringSynlig()) return;
      if (!ringInteraktiv()) valgt = null;   // ellers blir ringen stående frosset

      if (valgt !== null) fart *= 0.78;                       // bremser til stopp
      else fart += (GRUNNFART - fart) * 0.045;                // siger tilbake
      vinkel += fart;

      const rx = ring.clientWidth * 0.36;
      const ry = ring.clientHeight * 0.17;
      // Kortet er lite i stokken og stort når det er åpnet. Gjenstandene
      // må følge med, men å skrive width/height hvert bilde ville tvunget
      // fram ny layout — så størrelsen ganges inn i skalaen i stedet.
      const kortfaktor = ring.clientWidth / 1150;

      ting.forEach((el, i) => {
        const a = vinkel + i * STEG;
        const naer = Math.cos(a);            // 1 = nærmest, -1 = bakerst
        const t = (naer + 1) / 2;            // 0..1

        grad[i] += ((valgt === i ? 1 : 0) - grad[i]) * 0.18;
        const g = grad[i];

        const x = Math.sin(a) * rx;
        const y = naer * ry;                 // det nærmeste ligger lavest
        const skala = (0.42 + t * 0.58) * (1 + g * 0.24) * kortfaktor;

        // Resten dempes når noe er valgt, så blikket har ett sted å gå.
        // Ikke lenger ned enn dette: senkes gulvet mer, tømmer ringen seg
        // og det valgte står igjen i et hvitt intet.
        const demp = valgt === null ? 1 : 0.55 + g * 0.45;
        el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${skala})`;
        el.style.opacity = String((0.16 + t * 0.84) * demp);
        el.style.zIndex = String(Math.round(t * 100) + Math.round(g * 200));
      });

      // teksten skrives bare når valget faktisk endrer seg
      if (valgt !== vistValg) {
        vistValg = valgt;
        orbit.classList.toggle('har-valg', valgt !== null);
        if (valgt !== null) {
          navnFelt.textContent = ting[valgt].dataset.navn;
          modellFelt.textContent = ting[valgt].dataset.modell;
        }
      }
    };
  }

  // stokken i kortet som står fremme — den eneste som skal svare på
  // skroll, sveip og piltaster
  function aktivReel() {
    if (!reels.length) return null;
    return reels.find((r) => r.panel && r.panel.classList.contains('is-active')) || null;
  }

  function updateReel() {
    reels.forEach((r) => {
      const aktiv = r.panel.classList.contains('is-active');
      const apen = mode === 'expanded';

      r.items.forEach((item, i) => {
        // 0 er siden du ser på. Den styrer hvilket opptak som spiller og
        // hvilken flekkanimasjon som får gå — resten er bare avstand.
        item.dataset.pos = String(i - r.aktiv);

        let skalSpille = false;
        if (aktiv && mode === 'deck') skalSpille = i === 0;      // bare den første i kortstokken
        else if (aktiv && apen) skalSpille = i === r.aktiv;      // bare siden du har scrollet til

        const video = item.querySelector('video');
        if (video) {
          if (skalSpille) {
            if (video.paused) {
              // en boks som nettopp er blitt midtboks spiller fra begynnelsen
              if (item.dataset.sett !== '1' && video.currentTime > 0) video.currentTime = 0;
              item.dataset.sett = '1';
              video.muted = !lydPa || !kanHaLyd(item);
              start(video);
            }
          } else {
            item.dataset.sett = '';
            if (!video.paused) video.pause();
          }
        }

        // bokser med stillbilder blar bare mens de står i midten, etter
        // nøyaktig samme regel som videoene
        const galleri = gallerier.get(item);
        if (galleri) galleri.forEach((g) => g.spill(skalSpille));
      });

      if (r.teller && apen && aktiv) r.teller.textContent = String(r.aktiv + 1);
    });
  }

  // Sidene ligger i en rekke man scroller i, så de looper ikke lenger:
  // en rekke har en topp og en bunn. Vi ruller dit og lar scroll-lytteren
  // oppdatere hvilken side som er den aktive.
  function goToReel(r, i) {
    if (!r) return;
    const rn = r.items.length;
    if (!rn) return;
    const neste = Math.min(Math.max(i, 0), rn - 1);
    r.items[neste].scrollIntoView({
      block: 'center',
      behavior: roligBevegelse.matches ? 'auto' : 'smooth',
    });
  }

  // hvilken side ligger nærmest midten av vinduet akkurat nå
  function naermesteSide(r) {
    const midt = r.el.scrollTop + r.el.clientHeight / 2;
    let best = 0;
    let kortest = Infinity;
    r.items.forEach((item, i) => {
      const avstand = Math.abs(item.offsetTop + item.offsetHeight / 2 - midt);
      if (avstand < kortest) { kortest = avstand; best = i; }
    });
    return best;
  }

  // Scrollen er kilden til sannhet. rAF-en holder det til én utregning per
  // bilde — scroll-hendelser kommer mye tettere enn skjermen oppdateres.
  reels.forEach((r) => {
    let planlagt = false;
    r.el.addEventListener('scroll', () => {
      if (planlagt) return;
      planlagt = true;
      requestAnimationFrame(() => {
        planlagt = false;
        const i = naermesteSide(r);
        if (i !== r.aktiv) {
          r.aktiv = i;
          updateReel();
        }
      });
    }, { passive: true });
  });

  function stegReel(retning) {
    const r = aktivReel();
    if (r) goToReel(r, r.aktiv + retning);
  }

  // klikk på en side du ikke står på ruller dit. Siden du ser på slipper
  // klikket videre til kortet, som da åpner tekstbeskrivelsen.
  reels.forEach((r) => {
    r.items.forEach((item, i) => {
      item.addEventListener('click', (e) => {
        if (mode !== 'expanded') return;
        if (i === r.aktiv) return;
        e.stopPropagation();
        goToReel(r, i);
      });
    });
  });


  function resetParallax() {
    panels.forEach((p) => {
      const c = p.querySelector('.card');
      c.style.translate = '';
      c.style.scale = '';
    });
    par.x = 0; par.y = 0; par.s = 1;
    parTarget.x = 0; parTarget.y = 0; parTarget.s = 1;
  }

  function goTo(i) {
    resetParallax();
    active = ((i % n) + n) % n; // looper begge veier
    render();
  }

  function setMode(next) {
    if (next === mode) return;
    const prev = mode;
    mode = next;

    resetParallax();

    if (mode === 'text') {
      const sheet = panels[active].querySelector('.card-text');
      if (sheet) sheet.scrollTop = 0;
    }

    const inn = mode === 'expanded' && prev === 'deck';
    if (inn) {
      const r = aktivReel();
      if (r) r.aktiv = 0;   // alltid inn på side 1
    }

    if (prev === 'about' && aboutId) {
      aboutId.style.opacity = ''; // tilbake til utgangspunktet
      aboutId.classList.remove('is-faded');
    }

    render();

    // etter render(), når sidestokken faktisk har fått høyde å scrolle i
    if (inn) {
      const r = aktivReel();
      if (r) r.el.scrollTop = 0;
    }

    // etter render(), slik at inngangsforsinkelsene i CSS får virke
    if (mode === 'about') {
      // Figuren scrubbes av scrollen og spilles aldri av, så den får
      // aldri det play() som ellers starter nedlastingen. Den ligger med
      // preload="none" for at de tolv megabytene ikke skal hentes for
      // alle som aldri åpner om-siden — her, når noen faktisk gjør det,
      // ber vi om hele fila. Scrubbing trenger den uansett hel.
      if (aboutVideo && aboutVideo.preload === 'none') {
        aboutVideo.preload = 'auto';
        aboutVideo.load();
      }
      aboutView.scrollTop = 0;
      updateAboutScroll();
    }
  }

  // --- skroll blar: i kortstokken mellom prosjekter, i åpent kort mellom sider ---
  // I åpent kort tar vi over hjulet i stedet for å la nettleseren scrolle
  // fritt. Fri scroll lar deg bli stående midt mellom to sider, og ren
  // snapping løser det ikke: et lite hjulklikk rekker ikke forbi
  // midtpunktet og spretter tilbake dit det kom fra. Her flytter én
  // rulling deg nøyaktig én side, samme hvor langt du dro.
  let wheelHvile = null;

  window.addEventListener('wheel', (e) => {
    const sidestokk = iSidestokk();
    if (mode !== 'deck' && !sidestokk) return; // tekstark og om-siden scroller selv
    if (sidestokk) e.preventDefault();

    // en pause i rullingen nullstiller telleren, så en halvferdig
    // bevegelse ikke ligger og venter på å utløse neste
    clearTimeout(wheelHvile);
    wheelHvile = setTimeout(() => { wheelAcc = 0; }, 220);

    if (coolingDown) return;
    // både vanlig hjul og sidelengs trackpad-sveip blar i stokken
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    wheelAcc += delta;
    if (Math.abs(wheelAcc) < 60) return;
    const retning = wheelAcc > 0 ? 1 : -1;
    if (sidestokk) stegReel(retning);
    else goTo(active + retning);
    wheelAcc = 0;
    coolingDown = true;
    setTimeout(() => { coolingDown = false; }, sidestokk ? 620 : 750);
  }, { passive: false });

  // --- sveip på touch (horisontalt først, vertikalt som reserve) ---
  let touchX = null;
  let touchY = null;
  function iSidestokk() {
    return mode === 'expanded' && !!aktivReel();
  }

  window.addEventListener('touchstart', (e) => {
    if (mode !== 'deck' && !iSidestokk()) return;
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  }, { passive: true });

  window.addEventListener('touchend', (e) => {
    if ((mode !== 'deck' && !iSidestokk()) || touchX === null) return;
    const dx = touchX - e.changedTouches[0].clientX;
    const dy = touchY - e.changedTouches[0].clientY;
    const d = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
    if (Math.abs(d) > 45) {
      const retning = d > 0 ? 1 : -1;
      if (iSidestokk()) stegReel(retning);
      else goTo(active + retning);
    }
    touchX = null;
    touchY = null;
  }, { passive: true });

  // --- klikk: forstørr, deretter tekst ---
  panels.forEach((panel, i) => {
    const card = panel.querySelector('.card');

    // et nabokort tar deg til seg selv; det aktive åpner seg
    function activate() {
      if (i !== active) {
        if (mode === 'deck') goTo(i);
        return;
      }
      // Et kort under arbeid har ingenting å vise. Det stoppes først her,
      // etter at nabo-klikket har fått gjøre jobben sin: å klikke det inn
      // til midten er navigasjon i stokken, ikke et forsøk på å åpne det.
      if (card.classList.contains('card--laast')) return;
      if (mode === 'deck') setMode('expanded');
      else if (mode === 'expanded') setMode('text');
    }

    card.addEventListener('click', activate);

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });
  });

  // --- tilbake / lukk ---
  function back() {
    if (mode === 'text') setMode('expanded');
    else if (mode === 'expanded') setMode('deck');
    else if (mode === 'about') setMode('deck');
  }

  if (closeBtn) closeBtn.addEventListener('click', () => setMode('deck'));

  // --- logoen tar deg tilbake til kortstokken ---
  if (brand) {
    brand.addEventListener('click', () => setMode('deck'));
    brand.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMode('deck'); }
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { back(); return; }
    const sidestokk = iSidestokk();
    if (mode !== 'deck' && !sidestokk) return;
    if (e.key === 'ArrowRight' || e.key === 'Right' || e.key === 'ArrowDown' || e.key === 'Down' || e.key === 'PageDown') {
      e.preventDefault();
      if (sidestokk) stegReel(1); else goTo(active + 1);
    }
    if (e.key === 'ArrowLeft' || e.key === 'Left' || e.key === 'ArrowUp' || e.key === 'Up' || e.key === 'PageUp') {
      e.preventDefault();
      if (sidestokk) stegReel(-1); else goTo(active - 1);
    }
  });

  // --- prikker ---
  dots.forEach((dot) => {
    dot.addEventListener('click', () => {
      setMode('deck');
      goTo(Number(dot.dataset.goto));
    });
  });

  // ============================================================
  // Nattmodus. Temaet ligger på <html data-theme>, som allerede er satt
  // av det lille skriptet i <head> — her holder vi bare knappen og
  // lagringen i takt. Har man valgt selv, veier valget tyngre enn
  // systeminnstillingen; ellers følger siden systemet fortløpende.
  // ============================================================

  const rot = document.documentElement;
  const temaKnapp = document.querySelector('.theme-toggle');
  const morkPref = window.matchMedia('(prefers-color-scheme: dark)');

  function settTema(mork, lagre) {
    if (mork) rot.dataset.theme = 'dark';
    else delete rot.dataset.theme;

    if (temaKnapp) {
      temaKnapp.setAttribute('aria-pressed', mork ? 'true' : 'false');
      temaKnapp.setAttribute('aria-label', mork ? 'Bytt til dagmodus' : 'Bytt til nattmodus');
    }

    if (lagre) {
      try { localStorage.setItem('tema', mork ? 'dark' : 'light'); } catch (e) { /* privat modus */ }
    }
  }

  settTema(rot.dataset.theme === 'dark', false);

  if (temaKnapp) {
    temaKnapp.addEventListener('click', () => {
      settTema(rot.dataset.theme !== 'dark', true);
    });
  }

  // systembytte slår bare gjennom så lenge brukeren ikke har valgt selv
  morkPref.addEventListener('change', (e) => {
    let valgt = null;
    try { valgt = localStorage.getItem('tema'); } catch (err) { /* privat modus */ }
    if (!valgt) settTema(e.matches, false);
  });

  // --- om meg-knappen i navbaren → om-siden, tilbake-knappen der → deck ---
  if (aboutToggle) {
    aboutToggle.addEventListener('click', () => setMode('about'));
  }

  if (aboutBack) {
    aboutBack.addEventListener('click', () => setMode('deck'));
  }

  // ============================================================
  // Om meg-siden: videoen scrubbes av scrollen, identiteten fader ut
  // ============================================================

  let scrubTarget = 0;

  function updateAboutScroll() {
    if (!aboutView) return;
    const max = aboutView.scrollHeight - aboutView.clientHeight;
    const p = max > 0 ? aboutView.scrollTop / max : 0;
    if (aboutVideo && aboutVideo.duration) {
      scrubTarget = p * Math.max(0, aboutVideo.duration - 0.05);
      // direkte søk her også, så scrubben virker selv når rAF struper
      if (!aboutVideo.seeking && Math.abs(aboutVideo.currentTime - scrubTarget) > 0.033) {
        aboutVideo.currentTime = scrubTarget;
      }
    }
    if (mode === 'about' && aboutId) {
      const fade = Math.max(0, 1 - aboutView.scrollTop / (window.innerHeight * 0.45));
      aboutId.style.opacity = String(fade);
      aboutId.classList.toggle('is-faded', fade < 0.35);
    }
  }

  if (aboutView) {
    aboutView.addEventListener('scroll', updateAboutScroll, { passive: true });
  }

  if (aboutVideo) {
    aboutVideo.addEventListener('loadedmetadata', updateAboutScroll);
  }

  // ============================================================
  // Peker-parallaks på det aktive kortet (deck-modus)
  // ============================================================

  const par = { x: 0, y: 0, s: 1 };
  const parTarget = { x: 0, y: 0, s: 1 };

  window.addEventListener('mouseleave', () => {
    parTarget.x = 0; parTarget.y = 0; parTarget.s = 1;
  });

  // ============================================================
  // Minimer-knappen: fester seg til nærmeste punkt på kortkanten
  // og glir etter pekeren rundt rammen (forstørret/tekst-modus).
  // ============================================================

  const chipPos = { x: -100, y: -100 };
  const chipTarget = { x: -100, y: -100 };
  let chipOn = false;
  let chipSnapped = false; // første posisjon settes uten glidning

  function showChip() {
    if (!chipOn) {
      chipOn = true;
      chipSnapped = false;
      chip.classList.add('is-on');
    }
  }

  function hideChip() {
    if (chipOn) {
      chipOn = false;
      chip.classList.remove('is-on');
    }
  }

  if (chip) chip.addEventListener('click', back);

  // Boksen knappen skal henge på. I sidestokken er kortet bare en usynlig
  // scene, så da er det midtkortet som er den synlige kanten.
  function chipBoks() {
    const panel = panels[active];
    if (!panel) return null;
    if (mode === 'expanded') {
      const midt = panel.querySelector('.reel-item[data-pos="0"]');
      if (midt) return midt;
    }
    return panel.querySelector('.card');
  }

  // --- felles pekerhåndtering ---
  window.addEventListener('mousemove', (e) => {
    if (mode === 'deck') {
      // parallaks: hvor står pekeren i forhold til det aktive kortet?
      const card = panels[active].querySelector('.card');
      const r = card.getBoundingClientRect();
      const inside =
        e.clientX > r.left && e.clientX < r.right &&
        e.clientY > r.top && e.clientY < r.bottom;
      if (inside) {
        const nx = (e.clientX - (r.left + r.width / 2)) / r.width;   // -0.5..0.5
        const ny = (e.clientY - (r.top + r.height / 2)) / r.height;
        parTarget.x = nx * 20;
        parTarget.y = ny * 20;
        parTarget.s = 1.02;
      } else {
        parTarget.x = 0; parTarget.y = 0; parTarget.s = 1;
      }
      hideChip();
      return;
    }

    if (mode !== 'expanded' && mode !== 'text') { hideChip(); return; }
    if (!chip) return;

    // knappen henger på overkanten av den boksen som faktisk er synlig:
    // midtkortet i sidestokken, ellers selve kortet
    const box = chipBoks();
    if (!box) { hideChip(); return; }
    const r = box.getBoundingClientRect();

    // den glir langs overkanten, og går aldri utenfor hjørnene
    chipTarget.x = Math.min(Math.max(e.clientX, r.left + 26), r.right - 26);
    chipTarget.y = r.top;
    showChip();
  });

  // ============================================================
  // Én animasjonsløkke: chip-glidning, parallaks og video-scrub
  // ============================================================

  function tick() {
    // chip
    if (chipOn) {
      const k = chipSnapped ? 0.3 : 1;
      chipPos.x += (chipTarget.x - chipPos.x) * k;
      chipPos.y += (chipTarget.y - chipPos.y) * k;
      chipSnapped = true;
      chip.style.transform = `translate(${chipPos.x - 22}px, ${chipPos.y - 22}px)`;
    }

    // parallaks: selve boksen følger pekeren (translate/scale ligger
    // utenom transform-egenskapen, så kort-animasjonene forstyrres ikke)
    if (mode === 'deck') {
      par.x += (parTarget.x - par.x) * 0.12;
      par.y += (parTarget.y - par.y) * 0.12;
      par.s += (parTarget.s - par.s) * 0.12;
      const card = panels[active].querySelector('.card');
      if (card) {
        card.style.translate = `${par.x}px ${par.y}px`;
        card.style.scale = String(par.s);
      }
    }

    if (orbitTikk) orbitTikk();

    // scroll-scrub av om meg-videoen
    if (mode === 'about' && aboutVideo && aboutVideo.duration) {
      const cur = aboutVideo.currentTime;
      const delta = scrubTarget - cur;
      if (Math.abs(delta) > 0.033) {
        aboutVideo.currentTime = cur + delta * 0.25;
      }
    }

    requestAnimationFrame(tick);
  }

  render();
  requestAnimationFrame(tick);
})();
