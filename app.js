/* app.js — interface : écrans, feuilles, gestes, navigation
   Application locale, sans réseau ni compte. Identifiants et commentaires
   en français pour rester lisibles par le propriétaire de l'application. */

'use strict';

/* ─────────────── Fabrique d'éléments ─────────────── */

/* On construit le DOM plutôt que d'assembler du HTML : les libellés saisis par
   l'utilisateur passent par textContent et ne peuvent jamais être interprétés. */
function el(balise, attrs, enfants) {
  const n = document.createElement(balise);
  if (attrs) for (const [c, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (c === 'texte') n.textContent = v;
    else if (c === 'classe') n.className = v;
    else if (c === 'sur') for (const [ev, f] of Object.entries(v)) n.addEventListener(ev, f);
    else n.setAttribute(c, v === true ? '' : v);
  }
  if (enfants) for (const e of [].concat(enfants)) {
    if (e === null || e === undefined || e === false) continue;
    n.appendChild(typeof e === 'string' ? document.createTextNode(e) : e);
  }
  return n;
}

function svgEl(balise, attrs, enfants) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', balise);
  if (attrs) for (const [c, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (c === 'texte') n.textContent = v;
    else if (c === 'classe') n.setAttribute('class', v);
    else n.setAttribute(c, v);
  }
  if (enfants) for (const e of [].concat(enfants)) {
    if (e) n.appendChild(typeof e === 'string' ? document.createTextNode(e) : e);
  }
  return n;
}

const $ = s => document.querySelector(s);

let minuterieToast = null;
let sortieToast = null;

function toast(message) {
  const t = $('#toast');
  clearTimeout(minuterieToast);
  clearTimeout(sortieToast);
  t.classList.remove('sort');
  t.textContent = message;
  t.hidden = false;

  minuterieToast = setTimeout(() => {
    if (mouvementReduit()) { t.hidden = true; return; }
    t.classList.add('sort');
    sortieToast = setTimeout(() => { t.hidden = true; t.classList.remove('sort'); }, 190);
  }, 2600);
}

function vibrer(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* iOS */ }
}

/* ─────────────── Vue : Aujourd'hui ─────────────── */

function rendreAujourdhui() {
  const v = etat.vehicule;
  const nom = v ? [v.modele || v.marque, v.immat].filter(Boolean).join(' · ') : 'Aucun véhicule';
  $('#enteteVehiculeNom').textContent = nom || 'Sans nom';

  const actuel = kilometrageActuel();
  $('#compteurValeur').textContent = actuel.km === null ? '—' : nombreKm(actuel.km);
  if (actuel.km === null) {
    $('#compteurDetail').textContent = 'Aucun relevé — appuie sur + pour saisir le compteur';
  } else if (actuel.estime) {
    $('#compteurDetail').textContent = 'estimé · dernier relevé ' + nombreKm(actuel.source.km)
      + ' km le ' + dateCourte(actuel.source.date);
  } else {
    $('#compteurDetail').textContent = 'relevé le ' + dateCourte(actuel.source.date);
  }

  rendrePannes();
  const echeances = calculerEcheances().concat(alertesPneus()).concat(alerteSauvegarde());
  const retard = echeances.filter(e => e.statut === 'retard');
  const proche = echeances.filter(e => e.statut === 'proche');
  const ajour = echeances.filter(e => e.statut === 'ajour');
  const inconnu = echeances.filter(e => e.statut === 'inconnu');

  remplir('#listeRetard', '#blocRetard', retard);
  remplir('#listeBientot', '#blocBientot', proche);
  remplir('#listeAJour', null, ajour);
  remplir('#listeInconnu', null, inconnu);

  $('#blocAJour').hidden = ajour.length === 0;
  $('#repliAJourTexte').textContent = 'À jour (' + ajour.length + ')';
  $('#blocInconnu').hidden = inconnu.length === 0;
  $('#repliInconnuTexte').textContent = 'Jamais renseignés (' + inconnu.length + ')';

  // L'accueil ne s'affiche que tant qu'il n'y a rien à montrer.
  const sansVehicule = !etat.vehicule;
  $('#accueil').hidden = !sansVehicule && (lesInterventions().length > 0 || lesReleves().length > 0);
  $('#btnAccueilVehicule').hidden = !sansVehicule;
  $('#btnTuto').hidden = sansVehicule;
  $('#accueilTexte').textContent = sansVehicule
    ? "Commence par créer ton véhicule : chacun a son carnet, ses échéances et ses pneus."
    : "Commence par relever ton compteur avec le bouton en bas à droite, puis note ce que tu as déjà fait dans le carnet. L'application calcule le reste.";
}

/* Une panne reste visible en tête tant qu'elle n'est pas déclarée résolue. */
function pannesOuvertes() {
  return lesInterventions()
    .filter(i => i && i.categorie === 'panne' && !i.resolueLe)
    .sort((a, b) => a.date < b.date ? 1 : -1);
}

function rendrePannes() {
  const liste = $('#listePannes');
  liste.textContent = '';
  const ouvertes = pannesOuvertes();
  for (const i of ouvertes) {
    const jours = Math.round((aujourdhui().getTime() - versDate(i.date).getTime()) / JOUR);
    liste.appendChild(el('button', {
      classe: 'echeance-corps carte', type: 'button',
      sur: { click: () => ouvrirDetailIntervention(i.id) },
    }, [
      el('span', { classe: 'pastille', style: 'background:' + categorie('panne').couleur }),
      el('span', { classe: 'echeance-texte' }, [
        el('span', { classe: 'echeance-titre', texte: i.titre || 'Panne' }),
        el('span', { classe: 'echeance-etat retard',
          texte: 'signalée ' + (jours <= 0 ? "aujourd'hui" : 'il y a ' + dureeLisible(jours)) }),
      ]),
    ]));
  }
  $('#blocPannes').hidden = ouvertes.length === 0;
}

function remplir(selListe, selBloc, echeances) {
  const liste = $(selListe);
  liste.textContent = '';
  for (const e of echeances) liste.appendChild(carteEcheance(e));
  if (selBloc) $(selBloc).hidden = echeances.length === 0;
}

function carteEcheance(e) {
  const enveloppe = el('div', { classe: 'echeance' });
  const fond = el('div', { classe: 'echeance-fond', texte: 'C\'est fait' });

  const fraction = Math.max(0, Math.min(1, e.fraction || 0));
  const jauge = svgEl('svg', { classe: 'jauge ' + (e.statut === 'retard' ? 'retard' : e.statut === 'proche' ? 'proche' : ''), viewBox: '0 0 40 40' }, [
    svgEl('circle', { classe: 'piste', cx: 20, cy: 20, r: 16 }),
    svgEl('circle', {
      classe: 'part', cx: 20, cy: 20, r: 16,
      'stroke-dasharray': (fraction * 100.53).toFixed(1) + ' 200',
    }),
  ]);

  const corps = el('button', {
    classe: 'echeance-corps',
    type: 'button',
    sur: { click: () => (e.action ? e.action() : ouvrirEcheance(e)) },
  }, [
    jauge,
    el('span', { classe: 'echeance-texte' }, [
      el('span', { classe: 'echeance-titre', texte: e.regle.libelle }),
      el('span', { classe: 'echeance-etat ' + (e.statut === 'retard' ? 'retard' : e.statut === 'proche' ? 'proche' : ''), texte: e.texte }),
    ]),
  ]);

  enveloppe.appendChild(fond);
  enveloppe.appendChild(corps);
  if (!e.action) brancherGlissement(enveloppe, corps, fond, e);
  return enveloppe;
}


/* ─────────────── Vue : Carnet ─────────────── */

let filtreActif = 'tout';
let filtreQui = 'tous';

/* La liste des intervenants se déduit du carnet : « Moi » d'abord, puis les
   garages du plus fréquent au moins fréquent. Les variantes d'orthographe
   d'un même nom sont regroupées sur leur forme la plus employée. */
function intervenants() {
  const groupes = new Map();
  let parMoi = 0, proSansNom = 0, indetermines = 0;

  for (const i of lesInterventions()) {
    if (!i) continue;
    if (i.parQui === 'moi') { parMoi++; continue; }
    const brut = String(i.lieu || '').trim();
    if (!brut) {
      if (i.parQui === 'pro') proSansNom++; else indetermines++;
      continue;
    }
    const cle = sansAccents(brut);
    const g = groupes.get(cle) || { cle, formes: new Map(), nombre: 0, total: 0, derniere: '' };
    g.formes.set(brut, (g.formes.get(brut) || 0) + 1);
    g.nombre++;
    g.total += Number(i.coutTotal) || 0;
    if (i.date > g.derniere) g.derniere = i.date;
    groupes.set(cle, g);
  }

  const garages = [...groupes.values()].map(g => ({
    cle: g.cle,
    nombre: g.nombre,
    total: g.total,
    derniere: g.derniere,
    libelle: [...g.formes.entries()].sort((a, b) => b[1] - a[1])[0][0],
  }));
  garages.sort((a, b) => b.nombre - a.nombre || b.total - a.total);
  return { garages, parMoi, proSansNom, indetermines };
}

function faitPar(i, cle) {
  if (cle === 'tous') return true;
  if (cle === 'moi') return i && i.parQui === 'moi';
  if (cle === 'pro') return i && (i.parQui === 'pro' || String(i.lieu || '').trim() !== '');
  if (cle === 'aucun') return i && !i.parQui && !String(i.lieu || '').trim();
  return i && sansAccents(String(i.lieu || '').trim()) === cle;
}

function rendreFiltres() {
  const zone = $('#filtres');
  zone.textContent = '';
  const options = [{ cle: 'tout', libelle: 'Tout' }].concat(CATEGORIES);
  for (const o of options) {
    zone.appendChild(el('button', {
      classe: 'filtre' + (filtreActif === o.cle ? ' actif' : ''),
      type: 'button',
      texte: o.libelle,
      sur: { click: () => { filtreActif = o.cle; rendreFiltres(); rendreCarnet(); } },
    }));
  }
  rendreFiltresQui();
}

function categorie(cle) {
  return CATEGORIES.find(c => c.cle === cle) || { cle: 'autre', libelle: 'Autre', couleur: '#8b93a1' };
}

/* Rangée de taille fixe : quatre puces, toujours les mêmes, toujours à la même
   place. La liste des garages vit dans une feuille — sans quoi la rangée
   deviendrait un ruban à faire défiler à l'aveugle. */
function rendreFiltresQui() {
  const zone = $('#filtresQui');
  zone.textContent = '';
  const { garages, parMoi, proSansNom, indetermines } = intervenants();
  const nombrePro = garages.reduce((n, g) => n + g.nombre, 0) + proSansNom;

  const utile = parMoi > 0 && nombrePro > 0;
  zone.hidden = !utile;
  if (!utile) { filtreQui = 'tous'; return; }

  // Un garage supprimé du carnet ne doit pas laisser un filtre fantôme actif.
  if (!['tous', 'moi', 'pro', 'aucun'].includes(filtreQui)
      && !garages.some(g => g.cle === filtreQui)) filtreQui = 'tous';

  const garageChoisi = garages.find(g => g.cle === filtreQui);
  // Libellés courts : les quatre puces doivent tenir sur 360 px de large.
  const puces = [
    { cle: 'tous', libelle: 'Tous' },
    { cle: 'moi', libelle: 'Moi · ' + parMoi },
    { cle: 'pro', libelle: 'Garage · ' + nombrePro },
  ];

  for (const p of puces) {
    zone.appendChild(el('button', {
      classe: 'filtre' + (filtreQui === p.cle ? ' actif' : ''),
      type: 'button', texte: p.libelle,
      sur: { click: () => { filtreQui = p.cle; rendreFiltres(); rendreCarnet(); } },
    }));
  }

  const choisi = garageChoisi || (filtreQui === 'aucun' ? { libelle: 'Sans intervenant' } : null);
  zone.appendChild(el('button', {
    classe: 'filtre' + (choisi ? ' actif' : ''),
    type: 'button',
    texte: (choisi ? choisi.libelle : 'Choisir') + ' ▾',
    sur: { click: ouvrirIntervenants },
  }));
}

/* Même feuille depuis le carnet et depuis l'écran Voiture : d'un côté on
   filtre, de l'autre on consulte, mais c'est la même information. */
function ouvrirIntervenants() {
  const { garages, parMoi, proSansNom, indetermines } = intervenants();
  const contenu = [];

  const filtrer = cle => {
    filtreQui = cle;
    fermerFeuille();
    allerA('Carnet');
    rendreFiltres();
    rendreCarnet();
  };

  const ligne = (libelle, nombre, total, derniere, cle) => el('button', {
    classe: 'ligne ligne-bouton', type: 'button', sur: { click: () => filtrer(cle) },
  }, [
    el('span', { classe: 'evenement-texte' }, [
      el('span', { classe: 'evenement-titre', texte: libelle }),
      el('span', { classe: 'evenement-detail',
        texte: [nombre + (nombre > 1 ? ' interventions' : ' intervention'),
          derniere ? 'dernière le ' + dateCourte(derniere) : null].filter(Boolean).join(' · ') }),
    ]),
    el('span', { classe: 'ligne-detail', texte: total ? euros(total) : '—' }),
  ]);

  const carte = el('div', { classe: 'carte' });
  const totalMoi = lesInterventions()
    .filter(i => i.parQui === 'moi').reduce((n, i) => n + (Number(i.coutTotal) || 0), 0);
  const derniereMoi = lesInterventions()
    .filter(i => i.parQui === 'moi').map(i => i.date).sort().pop();

  if (parMoi) carte.appendChild(ligne('Moi', parMoi, totalMoi, derniereMoi, 'moi'));

  const lignesGarages = [];
  for (const g of garages) {
    lignesGarages.push({ noeud: ligne(g.libelle, g.nombre, g.total, g.derniere, g.cle), texte: g.cle });
  }

  // Au-delà de huit garages, on ne parcourt plus une liste : on cherche.
  if (lignesGarages.length > 8) {
    const zone = el('input', {
      type: 'search', inputmode: 'search', autocomplete: 'off', placeholder: 'Chercher un garage',
    });
    const enveloppe = el('div', { classe: 'recherche' }, [zone]);
    zone.addEventListener('input', () => {
      const q = sansAccents(zone.value);
      for (const l of lignesGarages) l.noeud.hidden = q && !l.texte.includes(q);
    });
    contenu.push(enveloppe);
  }
  for (const l of lignesGarages) carte.appendChild(l.noeud);

  if (proSansNom) carte.appendChild(ligne('Professionnel sans nom', proSansNom, 0, '', 'pro'));
  if (indetermines) carte.appendChild(ligne('Pas encore renseigné', indetermines, 0, '', 'aucun'));

  contenu.push(carte);
  contenu.push(bouton('Voir tout le carnet', { action: () => filtrer('tous') }));

  const totalGarages = garages.reduce((n, g) => n + g.total, 0);
  ouvrirFeuille('Qui a fait quoi',
    parMoi
      ? euros(totalGarages) + ' passés en garage, ' + parMoi + (parMoi > 1 ? ' interventions faites' : ' intervention faite') + ' par toi.'
      : euros(totalGarages) + ' passés en garage.',
    contenu);
}

function rendreCarnet() {
  const zone = $('#listeCarnet');
  zone.textContent = '';

  const mots = motsRecherches();
  const toutes = lesInterventions().slice().sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  const visibles = toutes.filter(i =>
    (filtreActif === 'tout' || i.categorie === filtreActif)
    && faitPar(i, filtreQui) && correspond(i, mots));

  const totalVisible = visibles.reduce((s, i) => s + (Number(i.coutTotal) || 0), 0);
  const total = toutes.reduce((s, i) => s + (Number(i.coutTotal) || 0), 0);
  const filtre = mots.length || filtreActif !== 'tout' || filtreQui !== 'tous';

  $('#carnetResume').textContent = !toutes.length
    ? 'Rien pour l\'instant'
    : filtre
      ? visibles.length + (visibles.length > 1 ? ' résultats · ' : ' résultat · ') + euros(totalVisible)
      : toutes.length + ' interventions · ' + euros(total) + ' investis';

  const vide = $('#videCarnet');
  vide.hidden = visibles.length > 0;
  vide.textContent = !toutes.length
    ? 'Aucune intervention. Appuie sur + pour en ajouter une.'
    : mots.length
      ? 'Rien ne correspond à « ' + texteRecherche.trim() + ' »'
      : 'Rien avec ces filtres.';

  let anneeCourante = null;
  for (const i of visibles) {
    const annee = (i.date || '').slice(0, 4);
    if (annee !== anneeCourante) {
      anneeCourante = annee;
      const totalAnnee = visibles
        .filter(x => (x.date || '').slice(0, 4) === annee)
        .reduce((s, x) => s + (Number(x.coutTotal) || 0), 0);
      zone.appendChild(el('h2', { classe: 'annee' }, [
        el('span', { texte: annee || '—' }),
        el('span', { classe: 'annee-total', texte: totalAnnee ? euros(totalAnnee) : '' }),
      ]));
    }
    zone.appendChild(carteIntervention(i, mots));
  }
}

function carteIntervention(i, mots) {
  const cat = categorie(i.categorie);
  const bas = [dateCourte(i.date), cat.libelle, i.km > 0 ? nombreKm(i.km) + ' km' : null, auteur(i) || null]
    .filter(Boolean).join(' · ');
  const surligne = mots && mots.length ? mots : [];

  const facture = Number(i.coutTotal) || 0;
  const charge = Number(i.resteACharge) || 0;

  return el('button', {
    classe: 'evenement', type: 'button',
    sur: { click: () => ouvrirDetailIntervention(i.id) },
  }, [
    el('span', { classe: 'pastille', style: 'background:' + cat.couleur }),
    el('span', { classe: 'evenement-texte' }, [
      el('span', { classe: 'evenement-titre' }, [texteSurligne(i.titre || cat.libelle, surligne)]),
      el('span', { classe: 'evenement-detail' }, [texteSurligne(bas, surligne)]),
    ]),
    facture ? el('span', { classe: 'evenement-cout' }, [
      document.createTextNode(euros(facture)),
      charge < facture ? el('small', { texte: 'dont ' + euros(charge) + ' pour moi' }) : null,
    ]) : null,
  ]);
}

/* ─────────────── Vue : Pneus ─────────────── */

function nombreDecimal(n, unite) {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  return String(Math.round(n * 100) / 100).replace('.', ',') + (unite || '');
}

/* 2 bar se lit mal à côté de 2,4 : une pression garde toujours sa décimale. */
function pressionTexte(n, unite) {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  return n.toFixed(1).replace('.', ',') + (unite || '');
}

function rendrePneus() {
  const etats = positionsVehicule().map(etatPneu);
  rendreSchemaPneus(etats);
  rendreHistoriquePneus(etats);

  const renseignes = etats.filter(e => e.statut !== 'inconnu').length;
  const anormaux = etats.filter(e => e.statut === 'retard').length;
  const surveiller = etats.filter(e => e.statut === 'proche').length;
  $('#pneusResume').textContent = !etat.vehicule
    ? 'Ajoute d\'abord un véhicule'
    : renseignes === 0
    ? 'Appuie sur un pneu pour le renseigner'
    : anormaux ? anormaux + (anormaux > 1 ? ' pneus anormaux' : ' pneu anormal')
    : surveiller ? surveiller + ' à surveiller'
    : 'Les quatre sont corrects';

  $('#btnTousPneus').textContent = etats.length === 2
    ? 'Saisir les deux pressions' : 'Saisir les quatre pressions';
  $('#btnTousPneus').hidden = !etat.vehicule;

  $('#detailPressionsCible').textContent =
    'AV ' + pressionTexte(pressionCible('av')) + ' · AR ' + pressionTexte(pressionCible('ar'), ' bar');
}

function rendreSchemaPneus(etats) {
  const zone = $('#schemaPneus');
  zone.textContent = '';
  const deuxRoues = etats.length === 2;
  const L = 300, H = 300;

  const places = deuxRoues
    ? { av: { x: 141, y: 60, gauche: false }, ar: { x: 141, y: 196, gauche: false } }
    : {
        avg: { x: 74, y: 84, gauche: true },
        avd: { x: 208, y: 84, gauche: false },
        arg: { x: 74, y: 188, gauche: true },
        ard: { x: 208, y: 188, gauche: false },
      };

  const enfants = [
    svgEl('text', { classe: 'pneu-etiquette', x: L / 2, y: 12, 'text-anchor': 'middle', texte: 'AVANT' }),
  ];

  if (deuxRoues) {
    // Vue du dessus également : le guidon suffit à dire où est l'avant.
    enfants.push(svgEl('rect', { classe: 'silhouette', x: 128, y: 40, width: 44, height: 226, rx: 22 }));
    enfants.push(svgEl('rect', { classe: 'vitre', x: 108, y: 74, width: 84, height: 9, rx: 4.5 }));
    enfants.push(svgEl('rect', { classe: 'vitre', x: 136, y: 150, width: 28, height: 46, rx: 12 }));
  } else {
    enfants.push(svgEl('rect', { classe: 'silhouette', x: 96, y: 22, width: 108, height: 262, rx: 32 }));
    enfants.push(svgEl('rect', { classe: 'vitre', x: 112, y: 60, width: 76, height: 30, rx: 11 }));
    enfants.push(svgEl('rect', { classe: 'vitre', x: 112, y: 216, width: 76, height: 26, rx: 10 }));
  }

  for (const e of etats) {
    const p = places[e.position.cle];
    if (!p) continue;
    const ancreX = p.gauche ? 64 : (deuxRoues ? 190 : 236);
    const ancre = p.gauche ? 'end' : 'start';
    const groupe = svgEl('g', { classe: 'pneu-zone ' + e.statut, role: 'button',
      'aria-label': e.position.libelle });

    groupe.appendChild(svgEl('rect', {
      x: p.gauche ? 0 : (deuxRoues ? 120 : 200), y: p.y - 18,
      width: deuxRoues ? 150 : 100, height: 76, fill: 'transparent',
    }));
    groupe.appendChild(svgEl('rect', { classe: 'pneu-forme', x: p.x, y: p.y, width: 18, height: 44, rx: 5 }));
    groupe.appendChild(svgEl('text', { classe: 'pneu-etiquette', x: ancreX, y: p.y + 4,
      'text-anchor': ancre, texte: e.position.nom }));
    groupe.appendChild(svgEl('text', { classe: 'pneu-valeur', x: ancreX, y: p.y + 24,
      'text-anchor': ancre, texte: e.pression ? pressionTexte(e.pression, ' bar') : '— bar' }));
    groupe.appendChild(svgEl('text', { classe: 'pneu-sous', x: ancreX, y: p.y + 41,
      'text-anchor': ancre, texte: e.usure ? nombreDecimal(e.usure, ' mm') : 'usure ?' }));

    groupe.addEventListener('click', () => ouvrirPneu(e.position));
    enfants.push(groupe);
  }

  zone.appendChild(svgEl('svg', { viewBox: '0 0 ' + L + ' ' + H, role: 'img',
    'aria-label': deuxRoues ? 'Les deux roues' : 'Les quatre pneus vus du dessus' }, enfants));
}

function rendreHistoriquePneus(etats) {
  const zone = $('#historiquePneus');
  zone.textContent = '';
  if (!lesPneus().length) {
    zone.appendChild(el('p', { classe: 'vide', texte: 'Aucun relevé pour l’instant.' }));
    return;
  }

  const carte = el('div', { classe: 'carte' });
  for (const e of etats) {
    const usure = e.usure;
    const part = usure ? Math.max(0, Math.min(1, (usure - USURE_LIMITE) / (USURE_NEUF - USURE_LIMITE))) : 0;
    const detail = e.dernier
      ? ['relevé le ' + dateCourte(e.dernier.date),
         e.ecart !== null ? (Math.abs(e.ecart) < 0.05 ? 'à la bonne pression'
           : (e.ecart < 0 ? pressionTexte(-e.ecart, ' bar') + ' en dessous' : pressionTexte(e.ecart, ' bar') + ' au-dessus')) : null,
        ].filter(Boolean).join(' · ')
      : 'jamais renseigné';

    carte.appendChild(el('button', {
      classe: 'pneu-ligne', type: 'button', sur: { click: () => ouvrirPneu(e.position) },
    }, [
      el('span', { classe: 'pneu-ligne-nom', texte: e.position.nom }),
      el('span', { classe: 'pneu-ligne-corps' }, [
        el('span', { classe: 'pneu-ligne-titre',
          texte: (e.pression ? pressionTexte(e.pression, ' bar') : '— bar')
            + ' · ' + (usure ? nombreDecimal(usure, ' mm') : 'usure inconnue') }),
        el('span', { classe: 'pneu-ligne-detail', texte: detail }),
        usure ? el('span', { classe: 'barre-usure ' + (e.statut === 'inconnu' ? '' : e.statut) }, [
          el('span', { style: 'width:' + (part * 100).toFixed(0) + '%' }),
        ]) : null,
      ]),
    ]));
  }
  zone.appendChild(carte);

  const nb = lesPneus().length;
  zone.appendChild(el('p', { classe: 'note', texte: nb + (nb > 1 ? ' relevés enregistrés' : ' relevé enregistré')
    + '. Un pneu neuf fait 8 mm de gomme, la limite légale est à 1,6 mm.' }));
}

function ouvrirPneu(position) {
  const dernier = dernierPneu(position.cle);
  const cible = pressionCible(position.essieu);

  const cPression = champ('pPression', 'Pression (bar)', {
    type: 'text', inputmode: 'decimal', autocomplete: 'off',
    placeholder: pressionTexte(cible),
    value: dernier && dernier.pression ? pressionTexte(dernier.pression) : '',
  }, 'Recommandée : ' + pressionTexte(cible, ' bar') + ', à froid');

  const cUsure = champ('pUsure', 'Gomme restante (mm)', {
    type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '5',
    value: dernier && dernier.usure ? nombreDecimal(dernier.usure) : '',
  }, 'Facultatif. Neuf : 8 mm. Limite légale : 1,6 mm.');

  const cDate = champ('pDate', 'Date', { type: 'date', value: versIso(aujourdhui()) });

  const valider = () => {
    const pression = nombreSaisi(cPression.entree.value);
    const usure = nombreSaisi(cUsure.entree.value);
    if (!pression && !usure) { toast('Saisis au moins une valeur'); return; }
    if (pression && (pression < 0.5 || pression > 5)) { toast('Pression peu vraisemblable'); return; }
    if (usure && (usure < 0 || usure > 12)) { toast('Usure peu vraisemblable'); return; }

    etat.pneus.push({
      id: identifiant(),
      vehiculeId: idActif(),
      date: cDate.entree.value || versIso(aujourdhui()),
      position: position.cle,
      pression: pression || null,
      usure: usure || null,
      km: kilometrageActuel().km,
    });
    enregistrer('pneus');
    fermerFeuille();
    rendreTout();
    vibrer(15);
    toast(position.nom + ' enregistré');
  };

  const contenu = [cPression.bloc, cUsure.bloc, cDate.bloc,
    bouton('Enregistrer', { principal: true, action: valider })];

  const passes = lesPneus().filter(p => p.position === position.cle)
    .sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 6);
  if (passes.length > 1) {
    contenu.push(el('h3', { classe: 'titre-section', texte: 'Relevés précédents' }));
    contenu.push(el('ul', { classe: 'detail-liste' }, passes.map(p => el('li', null, [
      el('span', { texte: dateCourte(p.date) }),
      el('span', { texte: [p.pression ? pressionTexte(p.pression, ' bar') : null,
        p.usure ? nombreDecimal(p.usure, ' mm') : null].filter(Boolean).join(' · ') }),
    ]))));
  }

  ouvrirFeuille(position.libelle, dernier ? 'Dernier relevé le ' + dateCourte(dernier.date) : 'Jamais renseigné', contenu);
}

function nombreSaisi(valeur) {
  const n = parseFloat(String(valeur).replace(',', '.').replace(/[^\d.]/g, ''));
  return isNaN(n) ? 0 : n;
}

/* Le gonflage se fait aux quatre pneus d'affilée : autant les saisir d'un coup. */
function ouvrirQuatrePressions() {
  const champs = positionsVehicule().map(p => {
    const dernier = dernierPneu(p.cle);
    return {
      position: p,
      c: champ('q-' + p.cle, p.nom, {
        type: 'text', inputmode: 'decimal', autocomplete: 'off',
        placeholder: pressionTexte(pressionCible(p.essieu)),
        value: dernier && dernier.pression ? pressionTexte(dernier.pression) : '',
      }),
    };
  });

  const valider = () => {
    const date = versIso(aujourdhui());
    let compte = 0;
    for (const { position, c } of champs) {
      const pression = nombreSaisi(c.entree.value);
      if (!pression) continue;
      if (pression < 0.5 || pression > 5) { toast(position.nom + ' : pression peu vraisemblable'); return; }
      const dernier = dernierPneu(position.cle);
      etat.pneus.push({
        id: identifiant(), vehiculeId: idActif(), date, position: position.cle, pression,
        usure: dernier ? dernier.usure : null,   // l'usure ne change pas en gonflant
        km: kilometrageActuel().km,
      });
      compte++;
    }
    if (!compte) { toast('Aucune pression saisie'); return; }
    enregistrer('pneus');
    fermerFeuille();
    rendreTout();
    vibrer(15);
    toast(compte + (compte > 1 ? ' pressions enregistrées' : ' pression enregistrée'));
  };

  const rangees = [el('div', { classe: 'champ-duo' }, [champs[0].c.bloc, champs[1].c.bloc])];
  if (champs.length > 2) {
    rangees.push(el('div', { classe: 'champ-duo' }, [champs[2].c.bloc, champs[3].c.bloc]));
  }
  ouvrirFeuille('Pressions du jour', 'À froid, avant de rouler.',
    rangees.concat([bouton('Enregistrer', { principal: true, action: valider })]));
}

function ouvrirPressionsCible() {
  const v = etat.vehicule;
  if (!v) { toast('Ajoute d\'abord un véhicule'); return; }

  const cAv = champ('cAv', 'Avant (bar)', { type: 'text', inputmode: 'decimal',
    value: pressionTexte(pressionCible('av')) });
  const cAr = champ('cAr', 'Arrière (bar)', { type: 'text', inputmode: 'decimal',
    value: pressionTexte(pressionCible('ar')) });

  ouvrirFeuille('Pressions recommandées',
    'Pour ' + nomVehicule(v) + '. Sur l\'étiquette de la portière ou du bras oscillant.', [
      el('div', { classe: 'champ-duo' }, [cAv.bloc, cAr.bloc]),
      bouton('Enregistrer', {
        principal: true,
        action: () => {
          const av = nombreSaisi(cAv.entree.value), ar = nombreSaisi(cAr.entree.value);
          if (av < 1 || av > 4 || ar < 1 || ar > 4) { toast('Valeurs peu vraisemblables'); return; }
          // Les pressions appartiennent au véhicule : c'est là que pressionCible() les lit.
          v.pressionAv = av;
          v.pressionAr = ar;
          enregistrer('vehicules');
          fermerFeuille();
          rendreTout();
          toast('Pressions enregistrées');
        },
      }),
    ]);
}

/* Les pneus produisent leurs propres alertes, sans passer par une règle
   périodique : ce qui compte est la mesure, pas la date du dernier contrôle. */
function alertesPneus() {
  if (!etat.vehicule) return [];   // rien à surveiller tant qu'aucun véhicule n'existe
  const etats = positionsVehicule().map(etatPneu);
  const alertes = [];
  const versPneus = () => allerA('Pneus');

  const gonflage = etats.filter(e => e.ecart !== null && e.ecart <= -0.15)
    .sort((a, b) => a.ecart - b.ecart);
  if (gonflage.length) {
    const pire = gonflage[0];
    alertes.push({
      regle: { cle: 'pneu_pression', libelle: gonflage.length > 1 ? 'Pneus sous-gonflés' : 'Pneu sous-gonflé' },
      statut: pire.ecart <= -0.3 ? 'retard' : 'proche',
      fraction: 1,
      texte: pire.position.nom + ' à ' + pressionTexte(pire.pression, ' bar')
        + ' au lieu de ' + pressionTexte(pressionCible(pire.position.essieu)),
      action: versPneus,
    });
  }

  const uses = etats.filter(e => e.usure && e.usure <= 3).sort((a, b) => a.usure - b.usure);
  if (uses.length) {
    const pire = uses[0];
    alertes.push({
      regle: { cle: 'pneu_usure', libelle: 'Usure des pneus' },
      statut: pire.usure <= USURE_LIMITE ? 'retard' : 'proche',
      fraction: 1,
      texte: pire.position.nom + ' à ' + nombreDecimal(pire.usure, ' mm')
        + ' — limite légale ' + nombreDecimal(USURE_LIMITE, ' mm'),
      action: versPneus,
    });
  }

  const dates = lesPneus().map(p => p.date).filter(Boolean).sort();
  const dernier = dates.length ? dates[dates.length - 1] : null;
  const jours = dernier ? (aujourdhui().getTime() - versDate(dernier).getTime()) / JOUR : null;
  if (!dernier) {
    alertes.push({
      regle: { cle: 'pneu_controle', libelle: 'Pression des pneus' },
      statut: 'inconnu', fraction: 0,
      texte: 'Jamais relevée', action: versPneus,
    });
  } else if (jours > 60 && !gonflage.length) {
    alertes.push({
      regle: { cle: 'pneu_controle', libelle: 'Pression des pneus' },
      statut: jours > 120 ? 'retard' : 'proche',
      fraction: Math.min(1, jours / 60),
      texte: 'Dernier relevé il y a ' + dureeLisible(jours), action: versPneus,
    });
  }
  return alertes;
}

/* ─────────────── Vue : Voiture ─────────────── */

function rendreVoiture() {
  const v = etat.vehicule;
  $('#detailVehicules').textContent = etat.vehicules.length
    ? etat.vehicules.length + (etat.vehicules.length > 1 ? ' véhicules' : ' véhicule')
    : 'aucun';
  $('#ficheTitre').textContent = v && (v.marque || v.modele)
    ? [v.marque, v.modele].filter(Boolean).join(' ')
    : 'Renseigner le véhicule';
  $('#ficheDetail').textContent = v && v.immat
    ? [v.immat, v.dateMiseCirculation ? 'depuis le ' + dateCourte(v.dateMiseCirculation) : null].filter(Boolean).join(' · ')
    : 'Marque, modèle, immatriculation';

  rendreGrapheKm();
  rendreGrapheCout();
  rendreListeRegles();

  const jours = etat.reglages.dernierExport ? joursDepuis(etat.reglages.dernierExport) : null;
  const detail = $('#detailExport');
  detail.textContent = jours === null ? 'jamais'
    : jours <= 0 ? "aujourd'hui" : 'il y a ' + dureeLisible(jours);
  detail.style.color = (jours === null || jours > EXPORT_APRES_JOURS) ? 'var(--danger)' : '';

  const qui = intervenants();
  $('#detailIntervenants').textContent = qui.garages.length
    ? qui.garages.length + (qui.garages.length > 1 ? ' garages' : ' garage')
      + (qui.parMoi ? ' · moi' : '')
    : (qui.parMoi ? 'moi seulement' : 'aucun');

  $('#detailVersion').textContent = VERSION_APPLI;
  $('#noteVersion').textContent = 'Format de données v' + VERSION_FORMAT + ' · application ' + VERSION_APPLI;
}

function rendreGrapheKm() {
  const zone = $('#grapheKm');
  zone.textContent = '';
  const releves = tousLesReleves();
  if (releves.length < 2) {
    zone.appendChild(el('p', { classe: 'graphe-vide', texte: 'Il faut au moins deux relevés pour tracer une courbe.' }));
    return;
  }

  const L = 320, H = 130, marge = { g: 6, d: 6, h: 12, b: 22 };
  const xs = releves.map(r => versDate(r.date).getTime());
  const ys = releves.map(r => r.km);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const px = t => marge.g + (x1 === x0 ? 0 : (t - x0) / (x1 - x0)) * (L - marge.g - marge.d);
  const py = k => H - marge.b - (y1 === y0 ? 0 : (k - y0) / (y1 - y0)) * (H - marge.h - marge.b);

  const d = releves.map((r, n) => (n ? 'L' : 'M') + px(xs[n]).toFixed(1) + ' ' + py(r.km).toFixed(1)).join(' ');
  const actuel = kilometrageActuel();

  const enfants = [svgEl('path', { classe: 'graphe-ligne', d })];
  for (let n = 0; n < releves.length; n++) {
    enfants.push(svgEl('circle', { classe: 'graphe-point', cx: px(xs[n]).toFixed(1), cy: py(releves[n].km).toFixed(1), r: 2.2 }));
  }
  enfants.push(svgEl('text', { classe: 'graphe-axe', x: marge.g, y: H - 6, texte: new Date(x0).getFullYear() }));
  enfants.push(svgEl('text', { classe: 'graphe-axe', x: L - marge.d, y: H - 6, 'text-anchor': 'end', texte: new Date(x1).getFullYear() }));
  enfants.push(svgEl('text', { classe: 'graphe-axe', x: marge.g, y: 9, texte: nombreKm(y1) + ' km' }));

  zone.appendChild(svgEl('svg', { viewBox: '0 0 ' + L + ' ' + H, role: 'img',
    'aria-label': 'Évolution du kilométrage' }, enfants));

  const rythme = Math.round(rythmeKmParJour() * 365.25);
  zone.appendChild(el('p', { classe: 'note', texte: 'Environ ' + nombreKm(rythme) + ' km par an'
    + (actuel.km !== null ? ' · aujourd\'hui ~' + nombreKm(actuel.km) + ' km' : '') }));
}

function rendreGrapheCout() {
  const zone = $('#grapheCout');
  zone.textContent = '';
  const parAnnee = new Map();
  for (const i of lesInterventions()) {
    const annee = (i.date || '').slice(0, 4);
    if (!/^\d{4}$/.test(annee)) continue;
    const acc = parAnnee.get(annee) || { total: 0, charge: 0 };
    acc.total += Number(i.coutTotal) || 0;
    acc.charge += Number(i.resteACharge) || 0;
    parAnnee.set(annee, acc);
  }
  const annees = [...parAnnee.keys()].sort();
  if (!annees.length) {
    zone.appendChild(el('p', { classe: 'graphe-vide', texte: 'Aucun montant enregistré.' }));
    $('#noteCout').textContent = '';
    return;
  }

  const L = 320, H = 130, base = H - 20;
  const max = Math.max(...annees.map(a => parAnnee.get(a).total)) || 1;
  const largeur = Math.min(34, (L - 8) / annees.length - 8);
  const pas = (L - 8) / annees.length;
  const enfants = [];
  annees.forEach((a, n) => {
    const v = parAnnee.get(a);
    const x = 4 + n * pas + (pas - largeur) / 2;
    const hTotal = Math.max(2, (v.total / max) * (base - 10));
    const hCharge = Math.max(0, (v.charge / max) * (base - 10));
    enfants.push(svgEl('rect', { classe: 'graphe-barre', x: x.toFixed(1), y: (base - hTotal).toFixed(1), width: largeur.toFixed(1), height: hTotal.toFixed(1), rx: 4 }));
    if (hCharge > 0) enfants.push(svgEl('rect', { classe: 'graphe-barre-part', x: x.toFixed(1), y: (base - hCharge).toFixed(1), width: largeur.toFixed(1), height: hCharge.toFixed(1), rx: 4 }));
    enfants.push(svgEl('text', { classe: 'graphe-axe', x: (x + largeur / 2).toFixed(1), y: H - 4, 'text-anchor': 'middle', texte: a.slice(2) }));
  });
  zone.appendChild(svgEl('svg', { viewBox: '0 0 ' + L + ' ' + H, role: 'img', 'aria-label': 'Dépenses par an' }, enfants));

  const totalGeneral = annees.reduce((s, a) => s + parAnnee.get(a).total, 0);
  const chargeGenerale = annees.reduce((s, a) => s + parAnnee.get(a).charge, 0);
  $('#noteCout').textContent = 'Barre sombre : total investi dans la voiture (' + euros(totalGeneral)
    + '). Barre pleine : ce qui est sorti de ta poche (' + euros(chargeGenerale) + '), hors part d\'assurance.';
}

function rendreListeRegles() {
  const zone = $('#listeRegles');
  zone.textContent = '';
  for (const e of calculerEcheances().slice().sort((a, b) => a.regle.libelle.localeCompare(b.regle.libelle, 'fr'))) {
    zone.appendChild(el('button', {
      classe: 'ligne ligne-bouton', type: 'button',
      sur: { click: () => ouvrirEcheance(e) },
    }, [
      el('span', { texte: e.regle.libelle }),
      el('span', { classe: 'ligne-detail', texte: e.fait ? dateCourte(e.fait.date) : 'jamais' }),
    ]));
  }
}

/* ─────────────── Feuilles ─────────────── */

/* Un seul endroit pour savoir si l'on a le droit d'animer. */
function mouvementReduit() {
  try {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    return false;
  }
}

function ouvrirFeuille(titre, sousTitre, contenu) {
  const f = $('#feuilleGenerique');
  const enchainement = f.open;
  const zone = $('#feuilleContenu');
  zone.textContent = '';
  if (titre) zone.appendChild(el('h2', { texte: titre }));
  if (sousTitre) zone.appendChild(el('p', { classe: 'sous-titre', texte: sousTitre }));
  for (const c of [].concat(contenu)) if (c) zone.appendChild(c);

  f.classList.remove('ferme', 'revient');
  f.style.transform = '';
  f.style.removeProperty('--voile');
  if (!f.open) {
    f.showModal();
  } else if (!mouvementReduit()) {
    zone.classList.remove('change');
    void zone.offsetWidth;          // redémarre l'animation sur un enchaînement
    zone.classList.add('change');
  }
  f.scrollTop = 0;
}

/* La fermeture d'un <dialog> retire l'élément du flux sans transition possible :
   on joue la sortie d'abord, puis on ferme. Un garde-fou évite de rester ouvert
   si l'animation ne se déclenche pas. */
function fermerFeuille() {
  const f = $('#feuilleGenerique');
  if (!f.open || f.classList.contains('ferme')) return;

  if (mouvementReduit()) { f.close(); return; }

  let fait = false;
  const achever = () => {
    if (fait) return;
    fait = true;
    f.removeEventListener('animationend', surFin);
    f.classList.remove('ferme');
    f.style.transform = '';
    f.style.removeProperty('--voile');
    f.close();
  };
  // Le fondu du contenu remonte jusqu'au dialogue : sans ce filtre, il fermerait
  // la feuille avant la fin de sa propre descente.
  const surFin = ev => { if (ev.target === f) achever(); };

  f.addEventListener('animationend', surFin);
  setTimeout(achever, 320);
  f.classList.add('ferme');
}

function bouton(libelle, options) {
  const o = options || {};
  return el('button', {
    classe: 'feuille-bouton' + (o.principal ? ' principal' : '') + (o.danger ? ' danger' : ''),
    type: 'button', texte: libelle, sur: { click: o.action },
  });
}

function champ(id, libelle, attrs, aide) {
  const entree = el(attrs && attrs.balise === 'textarea' ? 'textarea' : (attrs && attrs.balise === 'select' ? 'select' : 'input'),
    Object.assign({ id }, attrs, { balise: null }));
  if (attrs && attrs.balise === 'textarea' && attrs.value) entree.value = attrs.value;
  const bloc = el('div', { classe: 'champ' }, [
    el('label', { for: id, texte: libelle }),
    entree,
    aide ? el('p', { classe: 'aide', texte: aide }) : null,
  ]);
  return { bloc, entree };
}

/* ── Échéance ── */

function ouvrirEcheance(e) {
  const dernier = e.fait
    ? 'Dernière fois : ' + dateCourte(e.fait.date) + (e.fait.km ? ' à ' + nombreKm(e.fait.km) + ' km' : '')
    : 'Aucune trace dans le carnet.';

  ouvrirFeuille(e.regle.libelle, dernier + (e.fait ? ' — ' + e.texte : ''), [
    bouton('C\'est fait', {
      principal: true,
      action: () => { fermerFeuille(); ouvrirIntervention(null, e.regle); },
    }),
    bouton('Me le rappeler dans 1 mois', {
      action: () => {
        e.regle.repousseJusqua = versIso(ajouterMois(aujourdhui(), 1));
        enregistrer('regles');
        fermerFeuille();
        rendreTout();
        toast('Reporté au mois prochain');
      },
    }),
    e.dateEcheance ? bouton('Ajouter à mon agenda', { action: () => ajouterAAgenda(e) }) : null,
    bouton('Ne plus suivre ce poste', {
      danger: true,
      action: () => {
        e.regle.actif = false;
        enregistrer('regles');
        fermerFeuille();
        rendreTout();
        toast(e.regle.libelle + ' n\'est plus suivi');
      },
    }),
  ]);
}

/* ── Compteur ── */

function ouvrirCompteur(options) {
  const o = options || {};
  const actuel = kilometrageActuel();
  const c = champ('saisieKm', 'Compteur', {
    type: 'text', inputmode: 'numeric', enterkeyhint: 'done',
    autocomplete: 'off', placeholder: actuel.km !== null ? String(actuel.km) : '150000',
  }, actuel.km !== null ? 'Estimation actuelle : ' + nombreKm(actuel.km) + ' km' : null);

  const valider = () => {
    const km = parseInt(String(c.entree.value).replace(/[^\d]/g, ''), 10);
    if (!km || km <= 0) { toast('Saisis un nombre de kilomètres'); return; }
    const dernier = dernierReleve();
    if (dernier && km < dernier.km) { toast('Plus bas que le dernier relevé (' + nombreKm(dernier.km) + ' km)'); return; }
    etat.releves.push({ id: identifiant(), vehiculeId: idActif(), date: versIso(aujourdhui()), km, origine: 'saisie' });
    delete etat.reglages.compteurReporteJusqua;
    enregistrer('releves');
    enregistrer('reglages');
    fermerFeuille();
    rendreTout();
    vibrer(15);
    toast('Compteur enregistré');
  };

  c.entree.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); valider(); } });

  ouvrirFeuille(o.titre || 'Relevé du compteur',
    o.sousTitre || 'Aujourd\'hui, ' + dateCourte(versIso(aujourdhui())), [
      c.bloc,
      bouton('Enregistrer', { principal: true, action: valider }),
      o.secondaire || null,
    ]);
  if (!o.secondaire) setTimeout(() => c.entree.focus(), 60);
}

/* ── Intervention : création et modification ── */

function ouvrirIntervention(idExistant, reglePrecochee) {
  const existant = idExistant ? etat.interventions.find(i => i.id === idExistant) : null;
  const actuel = kilometrageActuel();
  const postesChoisis = new Set(existant ? (existant.postes || []) : (reglePrecochee ? [reglePrecochee.cle] : []));

  const cDate = champ('iDate', 'Date', { type: 'date', value: existant ? existant.date : versIso(aujourdhui()) });
  const cTitre = champ('iTitre', 'Intitulé', {
    type: 'text', autocomplete: 'off', enterkeyhint: 'next',
    placeholder: 'Vidange, pneu avant droit…',
    value: existant ? (existant.titre || '') : (reglePrecochee ? reglePrecochee.libelle : ''),
  });

  const cCategorie = champ('iCategorie', 'Catégorie', { balise: 'select' });
  for (const cat of CATEGORIES) {
    cCategorie.entree.appendChild(el('option', { value: cat.cle, texte: cat.libelle }));
  }
  cCategorie.entree.value = existant ? existant.categorie : (reglePrecochee ? deduireCategorie(reglePrecochee.cle) : 'revision');

  const cKm = champ('iKm', 'Compteur', {
    type: 'text', inputmode: 'numeric', autocomplete: 'off',
    placeholder: actuel.km !== null ? String(actuel.km) : '',
    value: existant && existant.km ? String(existant.km) : '',
  }, actuel.km !== null && !existant ? 'Estimé aujourd\'hui : ' + nombreKm(actuel.km) + ' km' : null);

  const cTotal = champ('iTotal', 'Facture totale', {
    type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0',
    value: existant && existant.coutTotal ? String(existant.coutTotal) : '',
  });
  const cCharge = champ('iCharge', 'Payé par moi', {
    type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0',
    value: existant && existant.resteACharge !== undefined && existant.resteACharge !== null ? String(existant.resteACharge) : '',
  });

  const cGarage = champ('iLieu', 'Nom du garage', {
    type: 'text', autocomplete: 'off', placeholder: 'Garage Untel',
    list: 'listeIntervenants',
    value: existant ? (existant.lieu || '') : '',
  });
  const suggestions = $('#listeIntervenants');
  suggestions.textContent = '';
  for (const g of intervenants().garages) suggestions.appendChild(el('option', { value: g.libelle }));

  let parQui = existant ? (existant.parQui || '') : '';
  const puceMoi = el('button', { classe: 'puce', type: 'button', texte: 'Moi' });
  const pucePro = el('button', { classe: 'puce', type: 'button', texte: 'Un professionnel' });

  const majParQui = () => {
    puceMoi.className = 'puce' + (parQui === 'moi' ? ' actif' : '');
    pucePro.className = 'puce' + (parQui === 'pro' ? ' actif' : '');
    cGarage.bloc.hidden = parQui !== 'pro';   // le nom n'a de sens que pour un pro
  };
  const choisir = valeur => {
    parQui = (parQui === valeur) ? '' : valeur;   // réappuyer annule
    if (parQui !== 'pro') cGarage.entree.value = '';
    majParQui();
  };
  puceMoi.addEventListener('click', () => { choisir('moi'); vibrer(8); });
  pucePro.addEventListener('click', () => { choisir('pro'); vibrer(8); });
  majParQui();

  const blocParQui = el('div', { classe: 'champ' }, [
    el('label', { texte: 'Fait par' }),
    el('div', { classe: 'puces' }, [puceMoi, pucePro]),
  ]);
  const cNotes = champ('iNotes', 'Notes', { balise: 'textarea', placeholder: 'Facultatif',
    value: existant ? (existant.notes || '') : '' });
  if (existant && existant.notes) cNotes.entree.value = existant.notes;

  const puces = el('div', { classe: 'puces' });
  for (const r of lesRegles()) {
    const p = el('button', {
      classe: 'puce' + (postesChoisis.has(r.cle) ? ' actif' : ''),
      type: 'button', texte: r.libelle,
    });
    p.addEventListener('click', () => {
      if (postesChoisis.has(r.cle)) postesChoisis.delete(r.cle); else postesChoisis.add(r.cle);
      p.className = 'puce' + (postesChoisis.has(r.cle) ? ' actif' : '');
      vibrer(8);
    });
    puces.appendChild(p);
  }

  const enregistrerIntervention = () => {
    const date = cDate.entree.value;
    if (!versDate(date)) { toast('Choisis une date'); return; }
    const titre = cTitre.entree.value.trim();
    if (!titre) { toast('Donne un intitulé'); return; }

    const nombre = v => {
      const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, ''));
      return isNaN(n) ? 0 : n;
    };
    const total = nombre(cTotal.entree.value);
    const chargeSaisie = cCharge.entree.value.trim();
    const objet = {
      id: existant ? existant.id : identifiant(),
      vehiculeId: existant ? existant.vehiculeId : idActif(),
      date,
      titre,
      categorie: cCategorie.entree.value,
      km: parseInt(String(cKm.entree.value).replace(/[^\d]/g, ''), 10) || 0,
      coutTotal: total,
      resteACharge: chargeSaisie === '' ? total : nombre(chargeSaisie),
      parQui,
      lieu: parQui === 'pro' ? cGarage.entree.value.trim() : '',
      notes: cNotes.entree.value.trim(),
      postes: [...postesChoisis],
      resolueLe: existant ? (existant.resolueLe || null) : null,
    };

    if (existant) {
      etat.interventions = etat.interventions.map(i => i.id === objet.id ? objet : i);
    } else {
      etat.interventions.push(objet);
    }
    // Un poste refait annule le report demandé auparavant.
    for (const r of lesRegles()) if (postesChoisis.has(r.cle) && r.repousseJusqua) delete r.repousseJusqua;
    enregistrer('interventions');
    enregistrer('regles');
    fermerFeuille();
    rendreTout();
    vibrer(15);
    toast(existant ? 'Modifié' : 'Ajouté au carnet');
  };

  ouvrirFeuille(existant ? 'Modifier' : 'Nouvelle intervention', null, [
    cTitre.bloc,
    el('div', { classe: 'champ-duo' }, [cDate.bloc, cKm.bloc]),
    cCategorie.bloc,
    el('div', { classe: 'champ-duo' }, [cTotal.bloc, cCharge.bloc]),
    el('p', { classe: 'aide', texte: 'Laisse « payé par moi » vide si tu as tout payé. En cas de sinistre, mets ta franchise.' }),
    blocParQui,
    cGarage.bloc,
    el('div', { classe: 'champ' }, [
      el('label', { texte: 'Postes remis à zéro' }),
      puces,
      el('p', { classe: 'aide', texte: 'Ce que tu coches ici relance le compte à rebours du poste.' }),
    ]),
    cNotes.bloc,
    bouton('Enregistrer', { principal: true, action: enregistrerIntervention }),
  ]);
}

function deduireCategorie(clePoste) {
  if (clePoste === 'ct') return 'ct';
  if (clePoste === 'pneus') return 'pneus';
  return 'revision';
}

function ouvrirDetailIntervention(id) {
  const i = etat.interventions.find(x => x.id === id);
  if (!i) return;
  const cat = categorie(i.categorie);
  const postes = (i.postes || [])
    .map(c => (lesRegles().find(r => r.cle === c) || {}).libelle)
    .filter(Boolean);

  const lignes = el('ul', { classe: 'detail-liste' }, [
    el('li', null, [el('span', { texte: 'Date' }), el('span', { texte: dateCourte(i.date) })]),
    el('li', null, [el('span', { texte: 'Catégorie' }), el('span', { texte: cat.libelle })]),
    i.km > 0 ? el('li', null, [el('span', { texte: 'Compteur' }), el('span', { texte: nombreKm(i.km) + ' km' })]) : null,
    i.coutTotal ? el('li', null, [el('span', { texte: 'Facture' }), el('span', { texte: euros(i.coutTotal) })]) : null,
    (i.resteACharge || i.coutTotal) ? el('li', null, [el('span', { texte: 'Payé par moi' }), el('span', { texte: euros(i.resteACharge) })]) : null,
    auteur(i) ? el('li', null, [el('span', { texte: 'Fait par' }), el('span', { texte: auteur(i) })]) : null,
    postes.length ? el('li', null, [el('span', { texte: 'Postes' }), el('span', { texte: postes.join(', ') })]) : null,
    i.categorie === 'panne' ? el('li', null, [el('span', { texte: 'État' }),
      el('span', { texte: i.resolueLe ? 'résolue' : 'en cours' })]) : null,
    i.notes ? el('li', null, [el('span', { texte: 'Notes' }), el('span', { texte: i.notes })]) : null,
  ]);

  const actions = [lignes];
  if (i.categorie === 'panne') {
    actions.push(i.resolueLe
      ? bouton('Rouvrir cette panne', {
          action: () => {
            i.resolueLe = null;
            enregistrer('interventions');
            fermerFeuille(); rendreTout(); toast('Panne rouverte');
          },
        })
      : bouton('Marquer comme résolue', {
          principal: true,
          action: () => {
            i.resolueLe = versIso(aujourdhui());
            enregistrer('interventions');
            fermerFeuille(); rendreTout(); toast('Panne résolue');
          },
        }));
  }
  actions.push(bouton('Modifier', {
    principal: i.categorie !== 'panne' || !!i.resolueLe,
    action: () => { fermerFeuille(); ouvrirIntervention(i.id); },
  }));
  actions.push(bouton('Supprimer', { danger: true, action: () => confirmerSuppression(i) }));

  ouvrirFeuille(i.titre || cat.libelle, i.resolueLe ? 'Résolue le ' + dateCourte(i.resolueLe) : null, actions);
}

function confirmerSuppression(i) {
  ouvrirFeuille('Supprimer ?', (i.titre || '') + ' — ' + dateCourte(i.date), [
    bouton('Oui, supprimer', {
      danger: true,
      action: () => {
        etat.interventions = etat.interventions.filter(x => x.id !== i.id);
        enregistrer('interventions');
        fermerFeuille();
        rendreTout();
        toast('Supprimé');
      },
    }),
    bouton('Annuler', { action: fermerFeuille }),
  ]);
}

/* ── Fiche véhicule ── */

function ouvrirFiche() {
  const v = etat.vehicule;
  if (!v) { ouvrirNouveauVehicule(); return; }

  const champs = [
    ['marque', 'Marque', 'text'],
    ['modele', 'Modèle', 'text'],
    ['immat', 'Immatriculation', 'text'],
    ['dateMiseCirculation', 'Première immatriculation', 'date'],
    ['energie', 'Carburant', 'text'],
    ['vin', 'Numéro de série (VIN)', 'text'],
  ].map(([cle, libelle, type]) => {
    const c = champ('v-' + cle, libelle, { type, autocomplete: 'off', value: v[cle] || '' });
    return { cle, entree: c.entree, bloc: c.bloc };
  });

  let roues = Number(v.roues) === 2 ? 2 : 4;
  const puceQuatre = el('button', { classe: 'puce', type: 'button', texte: '4 roues' });
  const puceDeux = el('button', { classe: 'puce', type: 'button', texte: '2 roues' });
  const majRoues = () => {
    puceQuatre.className = 'puce' + (roues === 4 ? ' actif' : '');
    puceDeux.className = 'puce' + (roues === 2 ? ' actif' : '');
  };
  puceQuatre.addEventListener('click', () => { roues = 4; majRoues(); vibrer(8); });
  puceDeux.addEventListener('click', () => { roues = 2; majRoues(); vibrer(8); });
  majRoues();

  // Les pressions se règlent dans l'onglet Pneus, la suppression depuis la liste
  // des véhicules : la fiche ne porte que l'identité du véhicule.
  ouvrirFeuille(nomVehicule(v), 'Ces informations restent sur ce téléphone.',
    champs.map(c => c.bloc).concat([
      el('div', { classe: 'champ' }, [
        el('label', { texte: 'Nombre de roues' }),
        el('div', { classe: 'puces' }, [puceQuatre, puceDeux]),
      ]),
      bouton('Enregistrer', {
        principal: true,
        action: () => {
          for (const c of champs) v[c.cle] = c.entree.value.trim();
          v.roues = roues;
          enregistrer('vehicules');
          fermerFeuille();
          rendreTout();
          toast('Fiche enregistrée');
        },
      }),
    ]));
}

/* ─────────────── Plusieurs véhicules ─────────────── */

function compterPour(id) {
  return etat.interventions.filter(i => i && i.vehiculeId === id).length;
}

function ouvrirVehicules() {
  const carte = el('div', { classe: 'carte' });
  for (const v of etat.vehicules) {
    const actif = etat.vehicule && v.id === etat.vehicule.id;
    const nb = compterPour(v.id);

    // Deux boutons côte à côte : un bouton dans un bouton n'existe pas en HTML,
    // et il faut pouvoir agir sur un véhicule sans avoir à basculer dessus.
    const choisir = el('button', {
      classe: 'ligne-choix', type: 'button',
      sur: {
        click: () => {
          activerVehicule(v.id);
          fusionnerRegles();
          fermerFeuille();
          rendreFiltres();
          rendreTout();
          allerA('Aujourdhui');
          toast(nomVehicule(v));
        },
      },
    }, [
      el('span', { classe: 'evenement-texte' }, [
        el('span', { classe: 'evenement-titre', texte: nomVehicule(v) }),
        el('span', { classe: 'evenement-detail',
          texte: [v.immat || null, nb + (nb > 1 ? ' interventions' : ' intervention'),
            Number(v.roues) === 2 ? '2 roues' : null].filter(Boolean).join(' · ') }),
      ]),
      el('span', { classe: 'ligne-detail', texte: actif ? '✓' : '' }),
    ]);

    const actions = el('button', {
      classe: 'ligne-actions', type: 'button',
      'aria-label': 'Actions sur ' + nomVehicule(v),
      sur: { click: () => ouvrirActionsVehicule(v) },
    });
    actions.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">'
      + '<circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>';

    carte.appendChild(el('div', { classe: 'ligne ligne-vehicule' }, [choisir, actions]));
  }

  ouvrirFeuille('Mes véhicules',
    etat.vehicules.length > 1 ? 'Choisis celui que tu veux suivre.' : null,
    [
      etat.vehicules.length ? carte : null,
      bouton('Ajouter un véhicule', { principal: true, action: ouvrirNouveauVehicule }),
      etat.vehicule ? bouton('Modifier « ' + nomVehicule(etat.vehicule) + ' »',
        { action: () => { fermerFeuille(); setTimeout(ouvrirFiche, 60); } }) : null,
    ]);
}

/* Agir sur un véhicule sans l'activer : sinon supprimer la moto obligerait à
   basculer dessus, aller dans Voiture, ouvrir la fiche, puis supprimer. */
function ouvrirActionsVehicule(v) {
  const nb = compterPour(v.id);
  const actif = etat.vehicule && v.id === etat.vehicule.id;

  ouvrirFeuille(nomVehicule(v),
    [v.immat || null, nb + (nb > 1 ? ' interventions' : ' intervention'),
      Number(v.roues) === 2 ? '2 roues' : '4 roues'].filter(Boolean).join(' · '), [
      actif ? null : bouton('Suivre ce véhicule', {
        principal: true,
        action: () => {
          activerVehicule(v.id);
          fusionnerRegles();
          fermerFeuille();
          rendreFiltres();
          rendreTout();
          allerA('Aujourdhui');
          toast(nomVehicule(v));
        },
      }),
      bouton('Modifier la fiche', {
        principal: actif,
        action: () => {
          activerVehicule(v.id);
          fusionnerRegles();
          rendreTout();
          ouvrirFiche();
        },
      }),
      bouton('Supprimer ce véhicule', { danger: true, action: () => confirmerSuppressionVehicule(v) }),
      bouton('Retour', { action: ouvrirVehicules }),
    ]);
}

function ouvrirNouveauVehicule() {
  const cMarque = champ('n-marque', 'Marque', { type: 'text', autocomplete: 'off', placeholder: 'Citroën' });
  const cModele = champ('n-modele', 'Modèle', { type: 'text', autocomplete: 'off', placeholder: 'DS4' });
  const cImmat = champ('n-immat', 'Immatriculation', { type: 'text', autocomplete: 'off' });

  let roues = 4;
  const puceQuatre = el('button', { classe: 'puce actif', type: 'button', texte: '4 roues' });
  const puceDeux = el('button', { classe: 'puce', type: 'button', texte: '2 roues' });
  const majRoues = () => {
    puceQuatre.className = 'puce' + (roues === 4 ? ' actif' : '');
    puceDeux.className = 'puce' + (roues === 2 ? ' actif' : '');
  };
  puceQuatre.addEventListener('click', () => { roues = 4; majRoues(); });
  puceDeux.addEventListener('click', () => { roues = 2; majRoues(); });

  // Reprendre les postes d'un véhicule existant fait gagner du temps entre deux
  // voitures semblables, et n'a aucun sens entre une auto et une moto.
  let reprendre = null;
  const pucesReprise = el('div', { classe: 'puces' });
  for (const v of etat.vehicules) {
    const p = el('button', { classe: 'puce', type: 'button', texte: nomVehicule(v) });
    p.addEventListener('click', () => {
      const etaitChoisi = reprendre === v.id;
      for (const autre of pucesReprise.children) autre.className = 'puce';
      reprendre = etaitChoisi ? null : v.id;
      if (reprendre) p.className = 'puce actif';
    });
    pucesReprise.appendChild(p);
  }

  const contenu = [cMarque.bloc, cModele.bloc, cImmat.bloc,
    el('div', { classe: 'champ' }, [
      el('label', { texte: 'Nombre de roues' }),
      el('div', { classe: 'puces' }, [puceQuatre, puceDeux]),
    ])];

  if (etat.vehicules.length) {
    contenu.push(el('div', { classe: 'champ' }, [
      el('label', { texte: 'Reprendre les postes suivis de' }),
      pucesReprise,
      el('p', { classe: 'aide', texte: "Sinon, les intervalles par défaut s'appliquent." }),
    ]));
  }

  contenu.push(bouton('Créer', {
    principal: true,
    action: () => {
      const marque = cMarque.entree.value.trim();
      const modele = cModele.entree.value.trim();
      if (!marque && !modele) { toast('Donne au moins une marque ou un modèle'); return; }
      creerVehicule({ marque, modele, immat: cImmat.entree.value.trim(), roues }, reprendre);
      fermerFeuille();
      rendreFiltres();
      rendreTout();
      allerA('Aujourdhui');
      toast('Véhicule créé');
    },
  }));

  ouvrirFeuille('Nouveau véhicule', 'Chaque véhicule a son carnet, ses échéances et ses pneus.', contenu);
}

function confirmerSuppressionVehicule(v) {
  const nb = compterPour(v.id);
  const dernier = etat.vehicules.length <= 1;
  const perte = nb
    ? nb + (nb > 1 ? ' interventions seront perdues' : ' intervention sera perdue')
      + ', avec les relevés et les pneus.'
    : 'Ce véhicule n\'a aucune intervention enregistrée.';

  ouvrirFeuille('Supprimer ' + nomVehicule(v) + ' ?',
    perte + (dernier ? ' C\'est ton dernier véhicule : l\'application repartira vide.' : '')
      + (nb ? " Exporte d'abord si tu hésites." : ''), [
      bouton('Supprimer définitivement', {
        danger: true,
        action: () => {
          supprimerVehicule(v.id);
          fusionnerRegles();
          fermerFeuille();
          rendreFiltres();
          rendreTout();
          allerA('Aujourdhui');
          toast('Véhicule supprimé');
        },
      }),
      bouton('Annuler', { action: fermerFeuille }),
    ]);
}

/* ─────────────── Dicter à une IA ─────────────── */

/* Le prompt embarque le contexte de la voiture et le vocabulaire exact de
   l'application : sans cela, l'IA invente des catégories et des postes que
   l'import devrait deviner. Ni immatriculation ni numéro de série : ils ne
   servent à rien pour un diagnostic. */
function construirePrompt() {
  const v = etat.vehicule || {};
  const actuel = kilometrageActuel();
  const postes = lesRegles().map(r => r.cle).join(', ');
  const cats = CATEGORIES.map(c => '"' + c.cle + '"').join(', ');
  const identite = [v.marque, v.modele,
    v.dateMiseCirculation ? 'de ' + v.dateMiseCirculation.slice(0, 4) : null,
    v.energie].filter(Boolean).join(' ') || 'voiture';

  return [
    'Tu es mécanicien automobile. Je vais te décrire ce que j\'ai fait sur ma voiture,',
    'ou le problème que je rencontre.',
    '',
    'Réponds UNIQUEMENT par un objet JSON, sans aucun texte avant ni après, sans balise',
    'de code, exactement à ce format :',
    '',
    '{"application":"carnet-entretien","mode":"ajout","interventions":[{',
    '  "date":"AAAA-MM-JJ", "titre":"court, en français",',
    '  "categorie":' + cats + ',',
    '  "km":entier, "coutTotal":nombre, "resteACharge":nombre,',
    '  "parQui":"moi" ou "pro", "lieu":"nom du garage, vide si c\'est moi",',
    '  "notes":"détails, hypothèses, pièces à vérifier",',
    '  "postes":[liste parmi : ' + postes + ']',
    '}]}',
    '',
    'Règles :',
    '- Aujourd\'hui : ' + versIso(aujourdhui()) + '. Utilise cette date si je n\'en donne pas.',
    '- Compteur estimé : ' + (actuel.km || 0) + ' km. Mets 0 si je ne parle pas de kilométrage.',
    '- "resteACharge" vaut "coutTotal" sauf si je précise une part d\'assurance.',
    '- "postes" ne contient que des postes réellement remplacés ou vidangés. Sinon, liste vide.',
    '- Si je décris un problème non résolu, mets "categorie":"panne" et range tes hypothèses',
    '  de diagnostic dans "notes", de la plus probable à la moins probable, avec le contrôle',
    '  à faire pour trancher.',
    '- Plusieurs interventions dans un même récit donnent plusieurs objets.',
    '',
    'Ma voiture : ' + identite + '.',
    '',
    'Voici ma demande : ',
  ].join('\n');
}

function ouvrirImportIA() {
  ouvrirFeuille('Dicter à une IA', 'Copie ce prompt, colle-le dans l\'IA de ton choix, décris ce que tu as fait ou ce qui ne va pas, puis rapporte sa réponse ici.', [
    bouton('Copier le prompt', { principal: true, action: () => copierTexte(construirePrompt(), 'Prompt copié') }),
    bouton('Coller la réponse', { action: ouvrirCollage }),
    bouton('Voir le prompt', { action: () => afficherTexteBrut(construirePrompt()) }),
    el('p', { classe: 'aide', texte: 'Le prompt contient la marque, le modèle, l\'année et le kilométrage. Ni immatriculation, ni numéro de série.' }),
  ]);
}

async function copierTexte(texte, message) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(texte);
      toast(message);
      return;
    }
  } catch (e) { /* refusé hors contexte sécurisé */ }
  afficherTexteBrut(texte);
}

/* ─────────────── Fermer une feuille au doigt ─────────────── */

const SEUIL_FERMETURE = 110;      // px parcourus vers le bas
const VITESSE_FERMETURE = 0.5;    // px/ms : un geste vif ferme plus tôt
const VOILE_PLEIN = 0.62;

/* Ferme en repartant de l'endroit où le doigt a lâché, sans saut. */
function fermerFeuilleDepuis(decalage) {
  const f = $('#feuilleGenerique');
  if (!f.open || f.classList.contains('ferme')) return;

  const hauteur = f.getBoundingClientRect().height || 600;
  const achever = () => {
    f.classList.remove('ferme');
    f.style.transform = '';
    f.style.removeProperty('--voile');
    f.close();
  };

  if (mouvementReduit()) { achever(); return; }

  f.classList.add('ferme');   // le voile s'efface par sa propre animation
  const reste = Math.max(0, 1 - decalage / hauteur);
  const animation = f.animate(
    [{ transform: 'translateY(' + decalage.toFixed(1) + 'px)' },
     { transform: 'translateY(100%)' }],
    { duration: Math.max(110, Math.round(190 * reste)), easing: 'cubic-bezier(.4,0,.9,.5)', fill: 'forwards' });

  let fait = false;
  const fin = () => { if (fait) return; fait = true; animation.cancel(); achever(); };
  animation.onfinish = fin;
  setTimeout(fin, 320);
}

function brancherGlissementFeuille() {
  const f = $('#feuilleGenerique');
  let depart = null, decalage = 0, verrou = null, debut = 0, engage = false;

  const zonePrise = cible => !!(cible && cible.closest
    && cible.closest('.prise, dialog.feuille > #feuilleContenu > h2, dialog.feuille .sous-titre'));
  const champDeSaisie = cible => !!(cible && cible.closest && cible.closest('input, textarea, select'));

  f.addEventListener('pointerdown', ev => {
    if (f.classList.contains('ferme')) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (champDeSaisie(ev.target)) return;
    // Depuis le contenu, le geste n'est pris que si l'on est déjà en haut :
    // sinon on volerait le défilement.
    const prise = zonePrise(ev.target);
    if (!prise && f.scrollTop > 0) return;

    depart = { x: ev.clientX, y: ev.clientY, prise };
    debut = Date.now();
    decalage = 0;
    verrou = null;
    engage = false;
  });

  f.addEventListener('pointermove', ev => {
    if (!depart) return;
    const dx = ev.clientX - depart.x;
    const dy = ev.clientY - depart.y;

    if (verrou === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      verrou = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
      if (verrou === 'x') { depart = null; return; }   // geste horizontal : on rend la main
      try { f.setPointerCapture(ev.pointerId); } catch (e) { /* capture refusée */ }
    }

    // Le contenu a pu se remettre à défiler entre-temps.
    if (!depart.prise && f.scrollTop > 0) { annuler(); return; }

    decalage = dy > 0 ? dy : dy / 4;   // vers le haut, la feuille résiste
    engage = true;
    if (ev.cancelable) ev.preventDefault();

    f.style.transform = 'translateY(' + Math.max(0, decalage).toFixed(1) + 'px)';
    const hauteur = f.getBoundingClientRect().height || 600;
    const part = Math.max(0, Math.min(1, Math.max(0, decalage) / hauteur));
    f.style.setProperty('--voile', (VOILE_PLEIN * (1 - part * 0.85)).toFixed(3));
  }, { passive: false });

  function annuler() {
    depart = null;
    verrou = null;
    if (!engage) return;
    engage = false;
    f.classList.add('revient');
    f.style.transform = '';
    f.style.removeProperty('--voile');
    setTimeout(() => f.classList.remove('revient'), 220);
  }

  const relacher = () => {
    if (!depart) return;
    const parcouru = decalage;
    const vitesse = parcouru / Math.max(1, Date.now() - debut);
    // 60 px minimum même sur un geste vif : sous ce seuil c'est un frôlement.
    const partant = parcouru > SEUIL_FERMETURE
      || (parcouru > 60 && vitesse > VITESSE_FERMETURE);

    depart = null;
    verrou = null;
    if (!engage) return;
    engage = false;

    if (partant) {
      f.classList.remove('revient');
      fermerFeuilleDepuis(parcouru);
    } else {
      f.classList.add('revient');
      f.style.transform = '';
      f.style.removeProperty('--voile');
      setTimeout(() => f.classList.remove('revient'), 220);
    }
  };

  f.addEventListener('pointerup', relacher);
  f.addEventListener('pointercancel', annuler);
  // Un geste ne doit pas déclencher le bouton sous le doigt.
  f.addEventListener('click', ev => {
    if (Math.abs(decalage) > 6) { ev.preventDefault(); ev.stopPropagation(); decalage = 0; }
  }, true);
}

/* ─────────────── Glissement sur une échéance ─────────────── */

const SEUIL_GLISSEMENT = 68;

/* Raccourci facultatif : glisser vers la droite marque le poste comme fait.
   Tout reste accessible par l'appui, seul geste indispensable. */
function brancherGlissement(enveloppe, corps, fond, echeance) {
  let depart = null, decale = 0, verrou = null, aGlisse = false;

  const finir = () => {
    enveloppe.classList.add('anime');
    corps.style.transform = '';
    fond.style.opacity = '0';
    depart = null; decale = 0; verrou = null;
  };

  corps.addEventListener('pointerdown', ev => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    depart = { x: ev.clientX, y: ev.clientY };
    verrou = null;
    enveloppe.classList.remove('anime');
  });

  corps.addEventListener('pointermove', ev => {
    if (!depart) return;
    const dx = ev.clientX - depart.x;
    const dy = ev.clientY - depart.y;

    if (verrou === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      verrou = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';  // le défilement vertical garde la priorité
      if (verrou === 'y') { depart = null; return; }
      try { corps.setPointerCapture(ev.pointerId); } catch (e) { /* capture refusée */ }
    }

    // Vers la gauche il n'y a rien à atteindre : la ligne résiste au quart.
    decale = dx > 0 ? dx : dx / 4;
    corps.style.transform = 'translateX(' + decale.toFixed(1) + 'px)';
    fond.style.opacity = String(Math.min(1, Math.max(0, decale / SEUIL_GLISSEMENT)));
  });

  const relacher = () => {
    const parcouru = Math.abs(decale);
    const declenche = decale >= SEUIL_GLISSEMENT;
    finir();
    if (parcouru > 6) {
      aGlisse = true;                       // le clic qui suit le geste ne doit rien ouvrir
      setTimeout(() => { aGlisse = false; }, 300);
    }
    if (declenche) { vibrer(15); ouvrirIntervention(null, echeance.regle); }
  };

  corps.addEventListener('pointerup', relacher);
  corps.addEventListener('pointercancel', finir);
  corps.addEventListener('click', ev => {
    if (aGlisse) { ev.preventDefault(); ev.stopPropagation(); }
  }, true);
}

/* ─────────────── Mode d'emploi ─────────────── */

const ETAPES = [
  ['Relève ton compteur', 'Le bouton en bas à droite. Deux relevés suffisent pour que tout le reste se calcule.'],
  ['Note ce que tu fais', 'Onglet Carnet, bouton +. Coche les postes concernés : leur compte à rebours repart de zéro.'],
  ['Surveille la page du jour', 'Rouge : dépassé. Orange : ça approche. Appuie sur une ligne, ou glisse-la vers la droite pour dire que c\'est fait.'],
  ['Suis tes pneus', 'Onglet Pneus : appuie sur une roue pour noter sa pression et sa gomme restante.'],
  ['Sauvegarde', 'Onglet Voiture, Exporter. Tes données ne quittent ce téléphone que si tu le demandes.'],
];

function ouvrirTutoriel() {
  const liste = el('ul', { classe: 'etapes' }, ETAPES.map(([titre, detail], n) =>
    el('li', null, [
      el('span', { classe: 'etape-num', texte: String(n + 1) }),
      el('span', { classe: 'etape-texte' }, [
        el('span', { classe: 'etape-titre', texte: titre }),
        el('span', { classe: 'etape-detail', texte: detail }),
      ]),
    ])
  ));
  ouvrirFeuille('Comment ça marche', null, [
    liste,
    bouton('C\'est compris', { principal: true, action: () => {
      etat.reglages.tutoVu = true;
      enregistrer('reglages');
      fermerFeuille();
    } }),
  ]);
}

/* ─────────────── Navigation ─────────────── */

let vueCourante = 'Aujourdhui';

const ICONE_COMPTEUR = '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<path d="M4.5 17a8.5 8.5 0 1 1 15 0"/><path d="M12 14.5l4-4"/></svg>';
const ICONE_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

function allerA(nom) {
  vueCourante = nom;
  for (const v of ['Aujourdhui', 'Carnet', 'Pneus', 'Voiture']) {
    $('#vue' + v).hidden = v !== nom;
  }
  for (const b of document.querySelectorAll('.nav-bouton')) {
    const actif = b.dataset.vue === nom;
    b.classList.toggle('actif', actif);
    if (actif) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  const fab = $('#fab');
  fab.hidden = nom === 'Voiture' || nom === 'Pneus';
  fab.innerHTML = nom === 'Aujourdhui' ? ICONE_COMPTEUR : ICONE_PLUS;
  fab.setAttribute('aria-label', nom === 'Aujourdhui' ? 'Relever le compteur' : 'Nouvelle intervention');
  window.scrollTo(0, 0);
}

function rendreTout() {
  rendreAujourdhui();
  rendreFiltres();
  rendreCarnet();
  rendrePneus();
  rendreVoiture();
}

/* ─────────────── Démarrage ─────────────── */

function brancherInterface() {
  for (const b of document.querySelectorAll('.nav-bouton')) {
    b.addEventListener('click', () => allerA(b.dataset.vue));
  }

  $('#fab').addEventListener('click', () => {
    if (vueCourante === 'Aujourdhui') ouvrirCompteur();
    else ouvrirIntervention(null, null);
  });

  for (const [bouton, cible] of [['#repliAJour', '#listeAJour'], ['#repliInconnu', '#listeInconnu']]) {
    const b = $(bouton);
    b.addEventListener('click', () => {
      const liste = $(cible);
      const ouvert = !liste.hidden;
      liste.hidden = ouvert;
      b.setAttribute('aria-expanded', String(!ouvert));
    });
  }

  $('#btnTuto').addEventListener('click', ouvrirTutoriel);
  $('#btnTuto2').addEventListener('click', ouvrirTutoriel);

  const champRecherche = $('#rechercheCarnet');
  champRecherche.addEventListener('input', () => {
    texteRecherche = champRecherche.value;
    $('#viderRecherche').hidden = !texteRecherche;
    rendreCarnet();
  });
  champRecherche.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); champRecherche.blur(); }
  });
  $('#viderRecherche').addEventListener('click', () => {
    champRecherche.value = '';
    texteRecherche = '';
    $('#viderRecherche').hidden = true;
    rendreCarnet();
    champRecherche.focus();
  });

  $('#blocCompteur').addEventListener('click', () => ouvrirCompteur());
  $('#enteteVehicule').addEventListener('click', ouvrirVehicules);
  $('#btnVehicules').addEventListener('click', ouvrirVehicules);
  $('#btnAccueilVehicule').addEventListener('click', ouvrirNouveauVehicule);
  $('#btnMiseAJour').addEventListener('click', forcerMiseAJour);
  $('#btnIntervenants').addEventListener('click', ouvrirIntervenants);
  $('#ouvrirFiche').addEventListener('click', ouvrirFiche);
  $('#btnTousPneus').addEventListener('click', ouvrirQuatrePressions);
  $('#btnPressionsCible').addEventListener('click', ouvrirPressionsCible);
  $('#btnImportIA').addEventListener('click', ouvrirImportIA);
  $('#btnExport').addEventListener('click', exporterJson);
  $('#btnExportCsv').addEventListener('click', exporterCsv);
  $('#btnEffacer').addEventListener('click', confirmerEffacement);
  $('#btnImport').addEventListener('click', ouvrirImport);
  $('#fichierImport').addEventListener('change', ev => {
    const f = ev.target.files && ev.target.files[0];
    if (f) importerFichier(f);
    ev.target.value = '';
  });

  // Fermeture de la feuille par appui hors de son contenu.
  const feuille = $('#feuilleGenerique');
  feuille.addEventListener('click', ev => {
    if (ev.target === feuille) fermerFeuille();
  });
  brancherGlissementFeuille();

  // Échap et le geste « retour » ferment nativement, donc sans animation.
  feuille.addEventListener('cancel', ev => {
    ev.preventDefault();
    fermerFeuille();
  });
}

function demarrer() {
  chargerEtat();
  rendreFiltres();
  brancherInterface();
  rendreTout();
  allerA('Aujourdhui');

  if (!etat.reglages.tutoVu && lesInterventions().length === 0) {
    setTimeout(ouvrirTutoriel, 500);
  } else if (doitReclamerCompteur()) {
    setTimeout(reclamerCompteur, 700);
  }

  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  } catch (e) { /* non supporté */ }

  brancherServiceWorker();
}

/* Une application installée garde sa page en mémoire : le nouveau code peut être
   téléchargé sans jamais s'afficher. On recharge une fois, et une seule, quand un
   service worker fraîchement installé prend la main — sauf à la toute première
   installation, où il n'y a rien à remplacer. */
function brancherServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const premiereFois = !navigator.serviceWorker.controller;
  let recharge = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (premiereFois || recharge) return;
    recharge = true;
    location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(enregistrement => {
        enregistrement.update();
        // Une application ouverte des jours durant ne repasse jamais par « load ».
        setInterval(() => enregistrement.update(), 3600000);
      })
      .catch(() => { /* hors ligne indisponible */ });
  });
}

/* Dernier recours quand un téléphone reste bloqué sur une vieille version. */
async function forcerMiseAJour() {
  toast('Recherche d\'une mise à jour…');
  try {
    if ('caches' in window) {
      const noms = await caches.keys();
      await Promise.all(noms.map(n => caches.delete(n)));
    }
    if ('serviceWorker' in navigator) {
      const enregistrements = await navigator.serviceWorker.getRegistrations();
      await Promise.all(enregistrements.map(e => e.unregister()));
    }
  } catch (e) { /* stockage indisponible */ }
  setTimeout(() => location.reload(true), 400);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
else demarrer();
