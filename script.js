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
  const menyKnapp = document.querySelector('.meny-knapp');
  const lesMer = document.querySelector('.les-mer');
  const bunnTeller = document.querySelector('.bunn-teller');
  const n = panels.length;

  // Verktøykortet møter deg først. Det er det eneste kortet i stokken
  // uten opptak, så det virker uansett hva nettleseren mener om
  // autoplay — ringen går, og kortet ser levende ut fra første sekund.
  //
  // Og for å komme videre må du sveipe. Det sveipet er nettopp den
  // håndsopprekningen de andre kortene trenger: et play() som skjer
  // inne i en berøring slipper gjennom der et på egen hånd blir
  // avvist. Så når du kommer til OsloLut, spiller det.
  //
  // Slås opp på id og ikke som et tall, så rekkefølgen i stokken kan
  // endres uten at dette går i stykker.
  let active = Math.max(0, panels.findIndex((p) => p.id === 'verktoy'));

  // 860 px er samme bredde som CSS-en bruker for å gå over til mobil-
  // oppsettet — bunnlinja med «Om prosjektet»-knappen dukker opp der.
  // Måles på nytt hver gang, i stedet for å slås fast ved sideåpning,
  // så et vindu som endrer størrelse forbi grensa følger med.
  const erMobil = () => matchMedia('(max-width: 860px)').matches;
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

  // Bak porten står intro-animasjonene på pause (CSS), og da kommer
  // «animationend» aldri. Ryddingen må derfor vente til man er inne,
  // ellers river tidsavbruddet klassene bort mens animasjonen fortsatt
  // har til gode å spille.
  function startIntro() {
    clearIntro(navWidgets, 'intro-fade', 2000);
    clearIntro(deck, 'deck-intro', 2000);
  }

  // ============================================================
  // Frys driften mens noe er i bevegelse
  //
  // Den dyreste jobben nettleseren gjør her, er å male et kort på nytt
  // for hver frame det flytter seg — og det må den så lenge noe inne i
  // kortet endrer seg. Står innholdet stille, kan det samme kortet
  // skyves som et ferdig bilde. Målt på et kortbytte: 28 ms per frame
  // mot 10.
  //
  // «animation-play-state: paused» løser det ikke. Så lenge en
  // animasjon er festet til elementet, blir laget stående på
  // animasjonssporet, og omtegningen kommer likevel — pause målte
  // 28,7 ms, altså ingenting. Animasjonen må faktisk vekk.
  //
  // Derfor: les av hvor flekken står, skriv det inn som en fast verdi,
  // og ta animasjonen bort. Tidspunktet i animasjonen huskes, så den
  // fortsetter nøyaktig der den slapp når kortet har landet. Ingen
  // hopp — bare et sekunds forsinkelse i en drift som bruker 13–29
  // sekunder på én runde, og som ingen kan se står stille så lenge
  // kortet selv er i fart.
  // ============================================================

  const frosset = [];

  function frysDriften() {
    if (frosset.length) return;
    const flekker = Array.from(document.querySelectorAll('.card-art span, .laste-fyll'));
    // Alle avlesningene først. Leser og skriver vi om hverandre, tvinger
    // hver eneste lesning fram en ny stilberegning — og da koster
    // frysingen mer enn den sparer.
    const stillinger = flekker.map((el) => getComputedStyle(el).transform);
    flekker.forEach((el, i) => {
      let anims = [];
      try { anims = el.getAnimations(); } catch (e) { return; }
      if (!anims.length) return;
      frosset.push({ el, anims, tid: anims.map((a) => a.currentTime) });
      anims.forEach((a) => a.cancel());
      el.style.transform = stillinger[i];
    });
  }

  function slippDriften() {
    frosset.forEach(({ el, anims, tid }) => {
      el.style.removeProperty('transform');
      anims.forEach((a, k) => {
        try {
          a.play();
          a.currentTime = tid[k];
        } catch (e) { /* da begynner den bare på nytt — knapt synlig */ }
      });
    });
    frosset.length = 0;
  }

  // To ting kan kreve frys samtidig: en kortovergang og en
  // vindusendring. Da må begge ha sluppet før driften får gå igjen.
  let flytter = false;
  let endrerStorrelse = false;

  function oppdaterFrys() {
    if (flytter || endrerStorrelse) frysDriften();
    else slippDriften();
  }

  // Kortovergangen varer 0,9 s, men kurven er en kraftig ease-out: etter
  // 0,42 s har kortet gjort 94 % av veien, og resten er en landing så
  // rolig at øyet ikke har noe å følge. Frysen slipper der.
  //
  // Med hele overgangen frosset kom gradienten først i gang et halvt
  // sekund etter at man var framme ved kortet, og da leste den som at
  // den hang etter. De siste 480 millisekundene koster oss noen
  // omtegninger, men på et kort som knapt flytter seg er det ingenting
  // å se — mens en gradient som står død når man kommer fram, ser man.
  const FRYS_MS = 420;

  let flytteTimer = null;

  function markerFlytting() {
    flytter = true;
    oppdaterFrys();
    clearTimeout(flytteTimer);
    flytteTimer = setTimeout(() => {
      flytter = false;
      oppdaterFrys();
    }, FRYS_MS);
  }

  // Er noe løftet ut i fullskjerm akkurat nå? Da hører sveip, hjul og
  // piltaster til fullskjermbildet, ikke til kortstokken bak.
  function iFullskjerm() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

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

    // bunnlinja på mobil hører til et åpnet kort med sider — Kryp og
    // verktøyet har sin egen knapp videre inne i kortet
    document.body.classList.toggle(
      'sider-fremme',
      mode === 'expanded' && panels[active].classList.contains('panel--pages'),
    );

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
    // Et galleri med opptak i skal ikke bla av seg selv: da hadde
    // kapittelet skiftet midt i det man så på.
    const manuell = gal.classList.contains('reel-gallery--manuell');
    // ...og når det skifter, må kortstokken få vite det. Det er den som
    // starter og stopper avspilling.
    const harVideo = !!gal.querySelector('video');
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
      if (manuell || !synlig || roligBevegelse.matches) return;
      timer = setTimeout(() => byttTil(i + 1), TID);
    }

    // Ett sted for alle bytter brukeren eller klokka utløser. «vis»
    // alene brukes bare der updateReel allerede kjører, og der ville et
    // kall herfra gått i ring.
    function byttTil(n) {
      vis(n);
      planlegg();
      if (harVideo) updateReel();
    }

    function bla(steg) {
      byttTil(i + steg);
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
        byttTil(k);
      });
    });

    // Sveip mellom bildene. Retningen låses ved første bevegelse: går
    // fingeren mest sidelengs er det galleriet som skal bla, går den
    // mest opp eller ned er det siden som skal rulle, og da holder
    // galleriet seg unna resten av dragningen.
    let sveipX = null;
    let sveipY = null;
    let retning = null;

    gal.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      sveipX = e.touches[0].clientX;
      sveipY = e.touches[0].clientY;
      retning = null;
    }, { passive: true });

    gal.addEventListener('touchmove', (e) => {
      if (sveipX === null || retning) return;
      const dx = e.touches[0].clientX - sveipX;
      const dy = e.touches[0].clientY - sveipY;
      if (Math.abs(dx) + Math.abs(dy) > 10) retning = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }, { passive: true });

    gal.addEventListener('touchend', (e) => {
      if (sveipX === null) return;
      const dx = e.changedTouches[0].clientX - sveipX;
      // 40 px: nok til å skille et sveip fra et trykk som skled litt
      if (retning === 'x' && Math.abs(dx) > 40) bla(dx < 0 ? 1 : -1);
      sveipX = null;
    }, { passive: true });

    // Ligger kapitlene side om side, er de selv knappene: et klikk på
    // et av dem som ikke spiller gir det ordet. Klikk på det som
    // allerede spiller får boble videre til kortet, som da åpner
    // teksten — samme regel som sidene i en sidestokk følger.
    //
    // Ingen mediespørring her: i det smale oppsettet ligger de andre
    // med «visibility: hidden», og da kan de uansett ikke treffes.
    // Står kapitlene side om side? Vi spør oppsettet i stedet for å
    // gjenta bruddpunktet fra CSS-en her: i det smale oppsettet ligger
    // alle unntatt ett med «visibility: hidden».
    function sideOmSide() {
      return bilder.filter((x) => getComputedStyle(x).visibility !== 'hidden').length > 1;
    }

    bilder.forEach((b, k) => {
      b.addEventListener('click', (e) => {
        if (k === i) return;
        e.stopPropagation();
        byttTil(k);
      });

      // Pekeren over et kapittel gir det ordet, og det begynner forfra
      // hver gang — ikke der det slapp sist. Et opptak som plukker opp
      // midt i en setning gir ingen mening når man akkurat har valgt
      // det.
      //
      // Berøring holdes utenfor: der finnes det ingen «over», og et
      // trykk ville utløst både denne og klikket.
      b.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'touch') return;
        if (!sideOmSide()) return;
        const v = b.querySelector('video');
        if (v) v.currentTime = 0;
        if (k !== i) byttTil(k);
        else if (v && v.paused) start(v);
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

  // En boks kan ha flere opptak: reisen i Knytt-kortet har tre kapitler
  // i samme telefon. Det som ligger fremme i galleriet er det som
  // gjelder — de andre finnes, men skal verken spille eller hentes.
  function synligVideo(item) {
    return item.querySelector('.gal-slide.is-on video') || item.querySelector('video');
  }

  function settLyd(pa) {
    lydPa = pa;
    document.body.classList.toggle('lyd-pa', pa);

    reels.forEach((r) => r.items.forEach((item) => {
      const stum = !pa || !kanHaLyd(item);
      item.querySelectorAll('video').forEach((v) => { v.muted = stum; });
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
      const v = midt && synligVideo(midt);
      if (v && v.paused) start(v);
    });
  });

  // ============================================================
  // Fullskjerm
  // Vi tilbyr den ikke selv — opptakene er pyntestykker uten
  // kontroller — men nettleserne på Android legger en fullskjermknapp
  // oppå alt som spiller, og Samsung Internet tegner den rett på siden.
  // Havner man først der, står man i et bilde uten en eneste knapp, og
  // det leser som at fullskjerm har hengt seg opp.
  //
  // Her får opptaket kontroller så lenge det ER i fullskjerm, og bare
  // da. Det er den veien ut. Når man kommer tilbake stiller vi opp
  // opptakene på nytt, slik at det som skal spille på siden gjør det.
  // ============================================================

  function fullskjermByttet() {
    const el = document.fullscreenElement || document.webkitFullscreenElement || null;
    document.querySelectorAll('video').forEach((v) => {
      if (v === el) v.setAttribute('controls', '');
      else v.removeAttribute('controls');
    });
    if (!el) updateReel();
  }

  ['fullscreenchange', 'webkitfullscreenchange'].forEach((navn) => {
    document.addEventListener(navn, fullskjermByttet);
  });

  // iOS åpner ikke fullskjerm i siden, men i sin egen spiller, og melder
  // fra på selve elementet i stedet for på dokumentet.
  document.querySelectorAll('video').forEach((v) => {
    v.addEventListener('webkitendfullscreen', () => updateReel());
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

    // Sveip gjør det samme på touch, men motsatt vei av hjulet — og det
    // er med vilje. Med en finger tar man i selve ringen, og da må den
    // følge fingeren: drar du mot venstre, skal det som står fremst gå
    // mot venstre. Hjulet er ikke det samme — der tar man ikke i noe, og
    // retningen der er som den var.
    let sveipX = null;
    orbit.addEventListener('touchstart', (e) => { sveipX = e.touches[0].clientX; }, { passive: true });
    orbit.addEventListener('touchmove', (e) => {
      if (sveipX === null || !ringInteraktiv()) return;
      const x = e.touches[0].clientX;
      fart = Math.max(-0.055, Math.min(0.055, fart + (x - sveipX) * 0.0004));
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

  // ============================================================
  // Forhåndslasting av det du er på vei til
  // Opptakene ligger med preload="none" og hentes normalt først når de
  // skal spilles. Det gir en liten venting hver gang man kommer til noe
  // nytt. Her hentes naboen mens du ser på det som står fremme: neste
  // kort i stokken, og siden foran og bak den du leser i et åpnet kort.
  //
  // Bare det ene opptaket naboen faktisk viser — ikke hele sidestokken
  // bak den. Da er det som regel klart før du kommer dit, uten at noen
  // laster ned et arkiv de aldri åpner.
  // ============================================================

  // I to trinn, og ikke med en gang. Forsiden skal bli ferdig først;
  // ellers slåss forhåndslastingen med det man faktisk ser om den samme
  // båndbredden.
  //
  // Trinn 1 er naboene, som er der man havner hvis man blar. Trinn 2 er
  // resten av stokken, for den som hopper rett til et kort med prikkene
  // — uten det trinnet venter man 2,3 sekunder på svak 4G. Til sammen er
  // det 21 MB nå som opptakene er komprimert, og det skjer i bakgrunnen
  // mens man ser på noe annet.
  let forhandsNivaa = 0;   // 0 = av · 1 = naboene · 2 = hele stokken

  // Den som har bedt om å spare data, skal ikke få hentet ned kort de
  // kanskje aldri åpner. Da gjelder bare naboen.
  const sparData = !!(navigator.connection && navigator.connection.saveData);

  setTimeout(() => { forhandsNivaa = 1; updateReel(); }, 3000);
  if (!sparData) setTimeout(() => { forhandsNivaa = 2; updateReel(); }, 9000);

  // ---- køen ----
  // Første utgave ba om alle opptakene på én gang. Det er gratis på
  // bredbånd og ødeleggende på mobil: fem nedlastinger deler linja med
  // den ene som faktisk spiller, og da får den for lite. Målt på
  // 4 Mbps sto opptaket på forsiden stille i 15 av 24 målinger — det
  // spilte sju tideler, frøs i fem sekunder, spilte sju tideler igjen.
  // Uten hentingen: 4 av 20, og de fire var oppstarten.
  //
  // Nå står de i kø, ett om gangen, og køen rører seg bare når det som
  // spiller har nok i banken til å klare seg selv. Hentingen får bruke
  // det som blir til overs, og ikke mer.
  const koen = [];         // opptak som venter på tur
  let henterNa = null;     // det ene som hentes akkurat nå
  let spillerNa = null;    // det som står fremme og skal spille

  function settIKo(video) {
    if (!video || video.preload !== 'none') return;
    if (koen.indexOf(video) === -1) koen.push(video);
  }

  // readyState 4 er nettleserens eget svar på «dette klarer jeg å spille
  // til ende uten å stoppe». Er den ikke der, har den ikke båndbredde
  // å avse, og køen står.
  function harNokIBanken() {
    if (!spillerNa || spillerNa.paused) return true;
    return spillerNa.readyState >= 4;
  }

  function henteTikk() {
    if (henterNa) {
      // networkState 2 = NETWORK_LOADING. Er den ute av den, eller har
      // nok til å spilles gjennom, er turen over.
      if (henterNa.readyState < 4 && henterNa.networkState === 2) return;
      henterNa = null;
    }
    if (!harNokIBanken()) return;
    while (koen.length) {
      const v = koen.shift();
      // den som alt er i gang, eller alt er hentet, trenger ingen tur
      if (!v || v.preload !== 'none' || !v.paused) continue;
      v.preload = 'auto';
      // load() nullstiller et element som spiller, så den er bare for
      // dem som ikke har rørt seg ennå
      if (v.readyState === 0) v.load();
      henterNa = v;
      return;
    }
  }

  setInterval(henteTikk, 900);

  // ============================================================
  // Vaktbikkje på avspillingen
  //
  // Nettleserne på mobil kan nekte å starte et opptak selv om det er
  // dempet. Strømsparing på iOS slår av all autoplay, Samsung Internet
  // har en egen bryter for det, og Android Chrome gjør det samme i
  // datasparemodus. Da blir play() avvist, kortet blir stående på
  // plakatbildet, og det ser ut som om videoen ikke finnes.
  //
  // Regelen kan vi ikke overstyre, men vi kan spørre igjen. Et trykk på
  // skjermen er den håndsopprekningen nettleseren venter på, og et
  // play() som skjer inne i det trykket slipper gjennom der et på egen
  // hånd blir avvist. Vi spør ved hvert trykk, ikke bare det første:
  // har svaret vært nei én gang, kan neste trykk likevel være ja.
  //
  // Vaktbikkja følger i tillegg med på at det som spiller faktisk
  // beveger seg. Står tiden stille mens opptaket påstår at det går, har
  // det satt seg fast, og da ber vi om et nytt forsøk.
  // ============================================================

  let sistTid = -1;
  let stille = 0;

  function purrAvspilling() {
    const v = spillerNa;
    if (!v) { sistTid = -1; stille = 0; return; }
    if (v.paused) { start(v); return; }
    if (v.readyState < 3) { sistTid = v.currentTime; return; }   // laster — ikke vår sak
    if (v.currentTime === sistTid) {
      if (++stille >= 3) { stille = 0; start(v); }
    } else {
      stille = 0;
    }
    sistTid = v.currentTime;
  }

  setInterval(purrAvspilling, 1000);

  // Capture, så vi kommer til før noen stopper hendelsen på veien opp.
  ['pointerdown', 'touchstart', 'keydown'].forEach((navn) => {
    window.addEventListener(navn, () => {
      if (spillerNa && spillerNa.paused) start(spillerNa);
    }, { passive: true, capture: true });
  });

  function updateReel() {
    spillerNa = null;   // settes under, av den som skal spille nå

    reels.forEach((r) => {
      const aktiv = r.panel.classList.contains('is-active');
      const nabo = r.panel.classList.contains('is-left') || r.panel.classList.contains('is-right');
      const apen = mode === 'expanded';

      r.items.forEach((item, i) => {
        // 0 er siden du ser på. Den styrer hvilket opptak som spiller og
        // hvilken flekkanimasjon som får gå — resten er bare avstand.
        item.dataset.pos = String(i - r.aktiv);

        let skalSpille = false;
        if (aktiv && mode === 'deck') skalSpille = i === 0;      // bare den første i kortstokken
        else if (aktiv && apen) skalSpille = i === r.aktiv;      // bare siden du har scrollet til

        // Alt annet enn kapittelet som vises skal stå stille. Uten
        // dette ville et kapittel man bladde bort fra fortsatt spilt
        // bak det man ser på.
        const video = synligVideo(item);
        item.querySelectorAll('video').forEach((v) => {
          if (v !== video && !v.paused) v.pause();
        });

        if (video) {
          if (skalSpille) {
            spillerNa = video;   // køen skal vike for denne
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

        // det du sannsynligvis ser på om et øyeblikk
        if (forhandsNivaa && !skalSpille) {
          const iStokken = mode === 'deck' && i === 0;
          const naboKort = nabo && iStokken;
          const restenAvStokken = forhandsNivaa >= 2 && iStokken;
          const nesteSide = aktiv && apen && Math.abs(i - r.aktiv) === 1;
          if (naboKort || restenAvStokken || nesteSide) settIKo(video);
        }

        // bokser med stillbilder blar bare mens de står i midten, etter
        // nøyaktig samme regel som videoene
        const galleri = gallerier.get(item);
        if (galleri) galleri.forEach((g) => g.spill(skalSpille));
      });

      if (r.teller && apen && aktiv) r.teller.textContent = String(r.aktiv + 1);

      // samme tall i bunnlinja på mobil, som også må vite hvor mange
      // sider akkurat denne stokken har
      if (bunnTeller && apen && aktiv) {
        bunnTeller.querySelector('b').textContent = String(r.aktiv + 1);
        bunnTeller.querySelector('.bunn-sum').textContent = String(r.items.length);
      }
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

  // Klikk på en side du ikke står på ruller dit. Siden du ser på slipper
  // klikket videre til kortet, som på bred skjerm åpner tekstbeskrivelsen
  // — der er «Les om prosjektet»-hintet i hjørnet det eneste som sier
  // fra om det, og selve klikket er den forventede måten å bla videre.
  //
  // På mobil har bunnlinja allerede en egen «Om prosjektet»-knapp for
  // akkurat det. Uten stoppet her hoppet et trykk hvor som helst på
  // opptaket rett til teksten — usynlig og uten forvarsel, siden hintet
  // ikke vises der. Nå er det bare knappen som gjør det.
  reels.forEach((r) => {
    r.items.forEach((item, i) => {
      item.addEventListener('click', (e) => {
        if (mode !== 'expanded') return;
        if (i === r.aktiv) {
          if (erMobil()) e.stopPropagation();
          return;
        }
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

  // Frysen henger på de to som faktisk flytter kort, ikke på render().
  // render() kjøres også én gang ved sideåpning, og da står kortene
  // allerede der de skal — det er bare opasiteten som toner inn. En
  // frys der ga ingen gevinst, men lot gradienten stå død de første
  // 660 millisekundene man så på siden.
  function goTo(i) {
    markerFlytting();
    resetParallax();
    active = ((i % n) + n) % n; // looper begge veier
    render();
  }

  function setMode(next) {
    if (next === mode) return;
    const prev = mode;
    mode = next;

    markerFlytting();
    resetParallax();
    lukkMeny();

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
    if (iFullskjerm()) return;
    const sidestokk = iSidestokk();
    if (mode !== 'deck' && !sidestokk) return; // tekstark og om-siden scroller selv

    // Stokken ligger vannrett, så det er sidelengs som blar den — det
    // er den samme retningen kortene faktisk beveger seg i.
    //
    // Sidestokken i et åpnet kort er motsatt: der ligger sidene under
    // hverandre, og da er loddrett den naturlige. Den tar begge akser,
    // så en trackpad virker uansett hvilken vei man drar.
    const delta = sidestokk
      ? (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY)
      : e.deltaX;

    // Uten dette rekker aldri et sidelengs sveip fram: macOS tolker det
    // som «tilbake» i historikken og tar hendelsen selv. Det er derfor
    // bare opp og ned virket før.
    if (delta) e.preventDefault();
    else if (!sidestokk) return;   // rent loddrett i stokken: la siden være

    // en pause i rullingen nullstiller telleren, så en halvferdig
    // bevegelse ikke ligger og venter på å utløse neste
    clearTimeout(wheelHvile);
    wheelHvile = setTimeout(() => { wheelAcc = 0; }, 220);

    if (coolingDown) return;
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
  // Bare i kortstokken. Sidestokken i et åpnet kort er en ekte
  // scrollflate med snapping, og fingeren ruller den selv; et ekstra
  // programmert steg oppå det kjempet mot bevegelsen som allerede var i
  // gang, og hoppet forbi sider.
  let touchX = null;
  let touchY = null;
  function iSidestokk() {
    return mode === 'expanded' && !!aktivReel();
  }

  window.addEventListener('touchstart', (e) => {
    if (mode !== 'deck' || iFullskjerm()) return;
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  }, { passive: true });

  window.addEventListener('touchend', (e) => {
    if (mode !== 'deck' || touchX === null || iFullskjerm()) return;
    const dx = touchX - e.changedTouches[0].clientX;
    const dy = touchY - e.changedTouches[0].clientY;
    const d = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
    if (Math.abs(d) > 45) goTo(active + (d > 0 ? 1 : -1));
    touchX = null;
    touchY = null;
  }, { passive: true });

  // --- klikk: forstørr, deretter tekst ---
  panels.forEach((panel, i) => {
    const card = panel.querySelector('.card');

    // et nabokort tar deg til seg selv; det aktive åpner seg
    function activate() {
      // et trykk mens noe er i fullskjerm hører til fullskjermbildet
      if (iFullskjerm()) return;
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

  // bunnlinja på mobil: samme steg som et trykk på siden i midten
  if (lesMer) {
    lesMer.addEventListener('click', () => {
      if (mode === 'expanded') setMode('text');
    });
  }

  // ============================================================
  // Menyen bak hodet (mobil). Åpner og lukker på knappen; et trykk
  // hvor som helst utenfor, Esc og ethvert modusbytte lukker den.
  // På bred skjerm finnes ikke knappen, og ingenting av dette kjører.
  // ============================================================

  function lukkMeny() {
    if (!navWidgets || !navWidgets.classList.contains('is-open')) return;
    navWidgets.classList.remove('is-open');
    if (menyKnapp) menyKnapp.setAttribute('aria-expanded', 'false');
  }

  if (menyKnapp && navWidgets) {
    menyKnapp.addEventListener('click', (e) => {
      e.stopPropagation();   // ellers lukker dokument-lytteren den igjen
      const apen = navWidgets.classList.toggle('is-open');
      menyKnapp.setAttribute('aria-expanded', apen ? 'true' : 'false');
    });

    document.addEventListener('click', (e) => {
      if (!navWidgets.contains(e.target)) lukkMeny();
    });

    // et valg lukker den også — LinkedIn åpner i en ny fane, og menyen
    // skal ikke stå og vente når man kommer tilbake
    navWidgets.querySelectorAll('.nav-meny .widget').forEach((w) => {
      w.addEventListener('click', lukkMeny);
    });
  }

  // --- logoen tar deg tilbake til kortstokken ---
  if (brand) {
    brand.addEventListener('click', () => setMode('deck'));
    brand.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMode('deck'); }
    });
  }

  window.addEventListener('keydown', (e) => {
    // fullskjerm er sitt eget lag: Esc der hører til nettleseren, som
    // lukker fullskjermbildet — vi skal ikke i tillegg lukke kortet bak
    if (iFullskjerm()) return;
    if (e.key === 'Escape') {
      // en åpen meny er det nærmeste laget — Esc lukker den først
      if (navWidgets && navWidgets.classList.contains('is-open')) { lukkMeny(); return; }
      back();
      return;
    }
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

  // ============================================================
  // Vindusendring
  // Alle målene her er regnet ut fra vw og vh, så hver piksel vinduet
  // endrer seg flytter kortene. Med overgangene på ble hver av de
  // pikslene starten på en ny 0,9-sekunders animasjon av top, left,
  // width og height — og de fire krever ny layout. Å dra i
  // vindushjørnet ble en kø av overganger som aldri rakk i mål.
  //
  // Under dragingen følger alt med med en gang. 180 ms etter siste
  // endring er overgangene tilbake, i god tid før neste klikk.
  // ============================================================

  let storrelseTimer = null;

  window.addEventListener('resize', () => {
    if (!endrerStorrelse) {
      endrerStorrelse = true;
      document.body.classList.add('endrer-storrelse');
      oppdaterFrys();
    }
    clearTimeout(storrelseTimer);
    storrelseTimer = setTimeout(() => {
      endrerStorrelse = false;
      document.body.classList.remove('endrer-storrelse');
      oppdaterFrys();
    }, 180);
  }, { passive: true });

  // ============================================================
  // Inngangen
  //
  // Nettleserne på telefon lar ikke et opptak begynne før brukeren har
  // rørt skjermen. Porten gjør den regelen om til et trykk vi vet om:
  // ett vipp på bryteren, og siden er på.
  //
  // Det som skjer inne i selve klikket er poenget. Et play() der
  // slipper gjennom, og etterpå regner nettleseren siden som noe
  // brukeren har tatt i — resten av kortene får spille uten å spørre.
  // ============================================================

  const bryter = document.querySelector('.bryter');
  const bakPort = document.documentElement.classList.contains('port');

  function apneSiden() {
    if (!document.documentElement.classList.contains('port')) return;
    if (bryter) bryter.classList.add('er-pa');

    // Her, inne i trykket — det er hele grunnen til at porten finnes.
    if (spillerNa && spillerNa.paused) start(spillerNa);

    // Bryteren får vippe ferdig før teppet går opp. Uten pausen skjer
    // begge deler samtidig, og da rekker man ikke å se at man traff.
    setTimeout(() => {
      document.documentElement.classList.add('apnet');
      startIntro();
    }, 300);
  }

  if (bryter) bryter.addEventListener('click', apneSiden);
  if (!bakPort) startIntro();

  render();
  requestAnimationFrame(tick);
})();
