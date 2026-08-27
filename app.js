/* Carnet d'entretien — application locale, sans réseau ni compte.
   Tout est en français, y compris les identifiants, pour rester lisible
   par le propriétaire de l'application. */

'use strict';

const VERSION_APPLI = '1.3.0';
const VERSION_FORMAT = 1;
const CLES = {
  vehicule: 'vehiculeV1',
  releves: 'relevesV1',
  interventions: 'interventionsV1',
  regles: 'reglesV1',
  reglages: 'reglagesV1',
  pneus: 'pneusV1',
};

const CATEGORIES = [
  { cle: 'revision',  libelle: 'Révision',           couleur: '#f0a832' },
  { cle: 'pneus',     libelle: 'Pneus',              couleur: '#60a5fa' },
  { cle: 'depannage', libelle: 'Dépannage',          couleur: '#c084fc' },
  { cle: 'sinistre',  libelle: 'Sinistre',           couleur: '#ef4444' },
  { cle: 'ct',        libelle: 'Contrôle technique', couleur: '#6ee7a8' },
  { cle: 'panne',     libelle: 'Panne',              couleur: '#fb7185' },
];

/* Postes suivis. `cle` est l'identifiant stable : le libellé peut changer
   sans rien casser. intervalleKm ou intervalleMois peuvent valoir 0 = non
   applicable. `controle` = poste qu'on vérifie sans forcément le remplacer. */
const REGLES_PAR_DEFAUT = [
  { cle: 'vidange',        libelle: 'Vidange + filtre à huile',        intervalleKm: 20000,  intervalleMois: 12 },
  { cle: 'filtre_air',     libelle: 'Filtre à air',                    intervalleKm: 40000,  intervalleMois: 24 },
  { cle: 'filtre_hab',     libelle: 'Filtre habitacle',                intervalleKm: 20000,  intervalleMois: 12 },
  { cle: 'filtre_carb',    libelle: 'Filtre à carburant',              intervalleKm: 60000,  intervalleMois: 48 },
  { cle: 'liquide_frein',  libelle: 'Liquide de frein',                intervalleKm: 0,      intervalleMois: 24 },
  { cle: 'liquide_refr',   libelle: 'Liquide de refroidissement',      intervalleKm: 0,      intervalleMois: 60 },
  { cle: 'freins',         libelle: 'Plaquettes et disques',           intervalleKm: 0,      intervalleMois: 0, auBesoin: true },
  { cle: 'pneus',          libelle: 'Pneus',                           intervalleKm: 0,      intervalleMois: 0, auBesoin: true },
  { cle: 'distribution',   libelle: 'Distribution + pompe à eau',      intervalleKm: 180000, intervalleMois: 120 },
  { cle: 'courroie_acc',   libelle: "Courroie d'accessoires",          intervalleKm: 120000, intervalleMois: 72 },
  { cle: 'clim',           libelle: 'Climatisation',                   intervalleKm: 0,      intervalleMois: 36 },
  { cle: 'batterie',       libelle: 'Batterie',                        intervalleKm: 0,      intervalleMois: 60 },
  { cle: 'ct',             libelle: 'Contrôle technique',              intervalleKm: 0,      intervalleMois: 24 },
];

/* ─────────────── Stockage : lecture tolérante ─────────────── */

function lire(cle, defaut) {
  try {
    const brut = localStorage.getItem(cle);
    if (brut === null) return defaut;
    const valeur = JSON.parse(brut);
    if (valeur === null || valeur === undefined) return defaut;
    if (Array.isArray(defaut) && !Array.isArray(valeur)) return defaut;
    return valeur;
  } catch (e) {
    return defaut;
  }
}

function ecrire(cle, valeur) {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
  } catch (e) {
    toast('Stockage plein : impossible d\'enregistrer');
  }
}

let etat = {
  vehicule: null,
  releves: [],
  interventions: [],
  regles: [],
  reglages: {},
  pneus: [],          // relevés de pression et d'usure, un par pneu et par date
};

function chargerEtat() {
  etat.vehicule = lire(CLES.vehicule, null);
  etat.releves = lire(CLES.releves, []);
  etat.interventions = lire(CLES.interventions, []);
  etat.regles = lire(CLES.regles, []);
  etat.reglages = lire(CLES.reglages, {});
  etat.pneus = lire(CLES.pneus, []);
  fusionnerRegles();
  migrerPostesAuBesoin();
}

/* Plaquettes et pneus se changent quand ils sont usés, pas à date fixe.
   On ne touche qu'aux réglages restés exactement à l'ancienne valeur par
   défaut : un intervalle modifié à la main est conservé tel quel. */
function migrerPostesAuBesoin() {
  if (etat.reglages.migrationAuBesoin) return;
  for (const r of etat.regles) {
    if ((r.cle === 'freins' || r.cle === 'pneus') && r.intervalleKm === 0 && r.intervalleMois === 6) {
      r.intervalleMois = 0;
      r.auBesoin = true;
      delete r.controle;
      if (r.cle === 'pneus' && r.libelle === 'Usure et pression des pneus') r.libelle = 'Pneus';
    }
  }
  etat.reglages.migrationAuBesoin = true;
  enregistrer('regles');
  enregistrer('reglages');
}

/* Ajoute les postes manquants sans écraser ceux que l'utilisateur a réglés.
   Idempotent : rejouable à chaque démarrage sans effet de bord. */
function fusionnerRegles() {
  const connues = new Set(etat.regles.map(r => r.cle));
  let change = false;
  for (const modele of REGLES_PAR_DEFAUT) {
    if (connues.has(modele.cle)) continue;
    etat.regles.push({
      id: identifiant(),
      cle: modele.cle,
      libelle: modele.libelle,
      intervalleKm: modele.intervalleKm,
      intervalleMois: modele.intervalleMois,
      auBesoin: !!modele.auBesoin,
      actif: true,
    });
    change = true;
  }
  if (change) enregistrer('regles');
}

function enregistrer(quoi) {
  if (quoi === 'vehicule') ecrire(CLES.vehicule, etat.vehicule);
  if (quoi === 'releves') ecrire(CLES.releves, etat.releves);
  if (quoi === 'interventions') ecrire(CLES.interventions, etat.interventions);
  if (quoi === 'regles') ecrire(CLES.regles, etat.regles);
  if (quoi === 'reglages') ecrire(CLES.reglages, etat.reglages);
  if (quoi === 'pneus') ecrire(CLES.pneus, etat.pneus);
}

function identifiant() {
  try {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
  } catch (e) { /* environnement sans crypto */ }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/* ─────────────── Dates et formats ─────────────── */

const JOUR = 86400000;

function aujourdhui() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function versDate(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.slice(0, 10).split('-');
  if (m.length !== 3) return null;
  const d = new Date(Number(m[0]), Number(m[1]) - 1, Number(m[2]));
  return isNaN(d.getTime()) ? null : d;
}

function versIso(date) {
  const p = n => String(n).padStart(2, '0');
  return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate());
}

function ajouterMois(date, mois) {
  const d = new Date(date.getTime());
  const jour = d.getDate();
  d.setMonth(d.getMonth() + mois);
  if (d.getDate() < jour) d.setDate(0); // 31 janvier + 1 mois → 28/29 février
  return d;
}

function dateCourte(iso) {
  const d = versDate(iso);
  if (!d) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function nombreKm(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Math.round(n).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ');
}

function euros(n) {
  if (!n) return '—';
  const arrondi = Math.round(n * 100) / 100;
  return arrondi.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, ' ') + ' €';
}

/* Durée lisible, en jours / semaines / mois / années selon l'ordre de grandeur. */
function dureeLisible(jours) {
  const j = Math.abs(Math.round(jours));
  if (j === 0) return "aujourd'hui";
  if (j === 1) return '1 jour';
  if (j < 14) return j + ' jours';
  if (j < 60) return Math.round(j / 7) + ' semaines';
  if (j < 730) return Math.max(2, Math.round(j / 30.44)) + ' mois';
  const annees = j / 365.25;
  return (annees < 10 ? annees.toFixed(1).replace('.', ',') : Math.round(annees)) + ' ans';
}

/* ─────────────── Kilométrage : relevés et estimation ─────────────── */

/* Les interventions comportant un compteur valent relevé : on ne demande pas
   deux fois la même information. */
function tousLesReleves() {
  const liste = [];
  for (const r of etat.releves) {
    if (r && r.km > 0 && versDate(r.date)) liste.push({ date: r.date, km: Number(r.km) });
  }
  for (const i of etat.interventions) {
    if (i && i.km > 0 && versDate(i.date)) liste.push({ date: i.date, km: Number(i.km) });
  }
  liste.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return liste;
}

const KM_AN_DEFAUT = 15000;

/* Moindres carrés sur les relevés des 24 derniers mois : un relevé approximatif
   ne fait plus dérailler l'estimation à lui seul. */
function rythmeKmParJour() {
  const releves = tousLesReleves();
  const manuel = Number(etat.reglages.kmParAn);
  if (releves.length < 2) return (manuel > 0 ? manuel : KM_AN_DEFAUT) / 365.25;

  const fin = versDate(releves[releves.length - 1].date).getTime();
  let fenetre = releves.filter(r => fin - versDate(r.date).getTime() <= 730 * JOUR);
  if (fenetre.length < 2) fenetre = releves.slice(-3);

  const origine = versDate(fenetre[0].date).getTime();
  const pts = fenetre.map(r => ({ x: (versDate(r.date).getTime() - origine) / JOUR, y: r.km }));
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let num = 0, den = 0;
  for (const p of pts) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) * (p.x - mx); }
  const pente = den > 0 ? num / den : 0;
  const parAn = pente * 365.25;
  if (parAn < 1000 || parAn > 60000) return (manuel > 0 ? manuel : KM_AN_DEFAUT) / 365.25;
  return pente;
}

function dernierReleve() {
  const releves = tousLesReleves();
  return releves.length ? releves[releves.length - 1] : null;
}

/* Renvoie { km, estime, source } — `estime` distingue toujours le calcul du relevé. */
function kilometrageActuel() {
  const dernier = dernierReleve();
  if (!dernier) return { km: null, estime: true, source: null };
  const jours = (aujourdhui().getTime() - versDate(dernier.date).getTime()) / JOUR;
  if (jours <= 0) return { km: dernier.km, estime: false, source: dernier };
  return { km: Math.round(dernier.km + jours * rythmeKmParJour()), estime: true, source: dernier };
}

/* ─────────────── Échéances ─────────────── */

function dernierFait(cleRegle) {
  let trouve = null;
  for (const i of etat.interventions) {
    if (!i || !Array.isArray(i.postes) || !i.postes.includes(cleRegle)) continue;
    if (!trouve || i.date >= trouve.date) trouve = i;
  }
  if (!trouve) return null;
  return { date: trouve.date, km: trouve.km > 0 ? Number(trouve.km) : null };
}

/* Une échéance = ce qu'il reste avant le prochain passage, en km et en temps.
   La contrainte la plus avancée gagne. */
function calculerEcheances() {
  const actuel = kilometrageActuel();
  const jour0 = aujourdhui();
  const resultat = [];

  for (const regle of etat.regles) {
    if (!regle || regle.actif === false || regle.auBesoin) continue;
    const fait = dernierFait(regle.cle);
    const e = {
      regle,
      fait,
      fraction: 0,
      resteKm: null,
      resteJours: null,
      statut: 'inconnu',
      texte: 'Jamais renseigné',
      dateEcheance: null,
    };

    if (!fait) { resultat.push(e); continue; }

    if (regle.intervalleKm > 0 && fait.km && actuel.km !== null) {
      e.resteKm = (fait.km + regle.intervalleKm) - actuel.km;
      e.fraction = Math.max(e.fraction, (actuel.km - fait.km) / regle.intervalleKm);
    }
    if (regle.intervalleMois > 0) {
      const dateFait = versDate(fait.date);
      if (dateFait) {
        const echeance = ajouterMois(dateFait, regle.intervalleMois);
        e.dateEcheance = versIso(echeance);
        e.resteJours = Math.round((echeance.getTime() - jour0.getTime()) / JOUR);
        const total = (echeance.getTime() - dateFait.getTime()) / JOUR;
        if (total > 0) e.fraction = Math.max(e.fraction, (jour0.getTime() - dateFait.getTime()) / JOUR / total);
      }
    }

    const reporte = regle.repousseJusqua && versDate(regle.repousseJusqua)
      && versDate(regle.repousseJusqua).getTime() > jour0.getTime();

    const kmDepasse = e.resteKm !== null && e.resteKm <= 0;
    const dateDepassee = e.resteJours !== null && e.resteJours <= 0;
    const kmProche = e.resteKm !== null && e.resteKm > 0 && e.resteKm <= 1500;
    const dateProche = e.resteJours !== null && e.resteJours > 0 && e.resteJours <= 45;

    if (reporte) e.statut = 'ajour';
    else if (kmDepasse || dateDepassee) e.statut = 'retard';
    else if (kmProche || dateProche || e.fraction >= 0.9) e.statut = 'proche';
    else e.statut = 'ajour';

    e.texte = texteEcheance(e);
    resultat.push(e);
  }

  resultat.sort((a, b) => rangStatut(a) - rangStatut(b) || b.fraction - a.fraction);
  return resultat;
}

function rangStatut(e) {
  return { retard: 0, proche: 1, inconnu: 2, ajour: 3 }[e.statut];
}

function texteEcheance(e) {
  const verbe = '';
  if (e.statut === 'retard') {
    const parts = [];
    if (e.resteKm !== null && e.resteKm <= 0) parts.push(nombreKm(-e.resteKm) + ' km');
    if (e.resteJours !== null && e.resteJours <= 0) parts.push(dureeLisible(e.resteJours));
    return 'Dépassé de ' + (parts[0] || '—') + (parts[1] ? ' et ' + parts[1] : '');
  }
  const bouts = [];
  if (e.resteKm !== null) bouts.push('dans ' + nombreKm(e.resteKm) + ' km');
  if (e.resteJours !== null) bouts.push('dans ' + dureeLisible(e.resteJours));
  const suite = bouts.length ? bouts.join(' ou ') : 'pas de limite définie';
  return (verbe ? verbe + ' ' : '') + suite;
}


/* ─────────────── Pneus ─────────────── */

const POSITIONS = [
  { cle: 'avg', nom: 'AVG', libelle: 'Avant gauche', essieu: 'av' },
  { cle: 'avd', nom: 'AVD', libelle: 'Avant droit',  essieu: 'av' },
  { cle: 'arg', nom: 'ARG', libelle: 'Arrière gauche', essieu: 'ar' },
  { cle: 'ard', nom: 'ARD', libelle: 'Arrière droit',  essieu: 'ar' },
];

const USURE_NEUF = 8;      // mm de gomme sur un pneu neuf
const USURE_LIMITE = 1.6;  // limite légale
const PRESSION_DEFAUT = 2.4;

function pressionCible(essieu) {
  const v = Number(etat.reglages[essieu === 'av' ? 'pressionAv' : 'pressionAr']);
  return v > 0 ? v : PRESSION_DEFAUT;
}

function dernierPneu(cle) {
  let trouve = null;
  for (const p of etat.pneus) {
    if (!p || p.position !== cle) continue;
    if (!trouve || p.date >= trouve.date) trouve = p;   // à date égale, la dernière saisie gagne
  }
  return trouve;
}

/* État d'un pneu : la plus mauvaise des deux mesures l'emporte. */
function etatPneu(position) {
  const dernier = dernierPneu(position.cle);
  const resultat = { position, dernier, statut: 'inconnu', pression: null, usure: null, ecart: null };
  if (!dernier) return resultat;

  resultat.pression = Number(dernier.pression) || null;
  resultat.usure = Number(dernier.usure) || null;
  let rang = 0;  // 0 correct, 1 à surveiller, 2 anormal

  if (resultat.pression) {
    resultat.ecart = resultat.pression - pressionCible(position.essieu);
    if (resultat.ecart <= -0.3) rang = 2;
    else if (resultat.ecart <= -0.15 || resultat.ecart >= 0.3) rang = Math.max(rang, 1);
  }
  if (resultat.usure) {
    if (resultat.usure <= USURE_LIMITE) rang = 2;
    else if (resultat.usure <= 3) rang = Math.max(rang, 1);
  }
  resultat.statut = (resultat.pression || resultat.usure)
    ? ['ok', 'proche', 'retard'][rang]
    : 'inconnu';
  return resultat;
}


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
function toast(message) {
  const t = $('#toast');
  t.textContent = message;
  t.hidden = false;
  clearTimeout(minuterieToast);
  minuterieToast = setTimeout(() => { t.hidden = true; }, 2600);
}

function vibrer(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* iOS */ }
}

/* ─────────────── Vue : Aujourd'hui ─────────────── */

function rendreAujourdhui() {
  const v = etat.vehicule;
  const nom = v ? [v.modele || v.marque, v.immat].filter(Boolean).join(' · ') : 'Ta voiture';
  $('#enteteVehicule').textContent = nom || 'Ta voiture';

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
  const echeances = calculerEcheances().concat(alertesPneus());
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
  $('#accueil').hidden = etat.interventions.length > 0 || etat.releves.length > 0;
}

/* Une panne reste visible en tête tant qu'elle n'est pas déclarée résolue. */
function pannesOuvertes() {
  return etat.interventions
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

/* ─────────────── Recherche ─────────────── */

let texteRecherche = '';

/* Normalisation à longueur constante : les positions trouvées dans le texte
   sans accents restent valables dans le texte affiché, ce qui permet de
   surligner sans décalage. Une boucle sur les unités UTF-16, et non sur les
   points de code, pour qu'un emoji ne décale rien non plus. */
function sansAccents(texte) {
  const t = String(texte === null || texte === undefined ? '' : texte);
  let sortie = '';
  for (let i = 0; i < t.length; i++) sortie += t[i].normalize('NFD')[0].toLowerCase();
  return sortie;
}

function motsRecherches() {
  return sansAccents(texteRecherche).split(/\s+/).filter(Boolean);
}

/* Tout ce dans quoi on peut chercher : intitulé, notes, garage, catégorie,
   postes remis à zéro, date sous ses deux formes, kilométrage. */
function indexIntervention(i) {
  const postes = (i.postes || [])
    .map(c => (etat.regles.find(r => r.cle === c) || {}).libelle)
    .filter(Boolean);
  return sansAccents([
    i.titre, i.notes, i.lieu, categorie(i.categorie).libelle,
    postes.join(' '), i.date, dateCourte(i.date),
    i.km ? nombreKm(i.km) + ' km ' + i.km : '',
    i.coutTotal ? euros(i.coutTotal) + ' ' + i.coutTotal : '',
  ].filter(Boolean).join(' '));
}

function correspond(i, mots) {
  if (!mots.length) return true;
  const index = indexIntervention(i);
  return mots.every(m => index.includes(m));
}

/* Renvoie un fragment où chaque mot cherché est encadré d'un <mark>. */
function texteSurligne(texte, mots) {
  const brut = String(texte === null || texte === undefined ? '' : texte);
  const fragment = document.createDocumentFragment();
  if (!mots.length || !brut) { fragment.appendChild(document.createTextNode(brut)); return fragment; }

  const plat = sansAccents(brut);
  const zones = [];
  for (const m of mots) {
    let depart = 0;
    while (depart <= plat.length - m.length) {
      const trouve = plat.indexOf(m, depart);
      if (trouve === -1) break;
      zones.push([trouve, trouve + m.length]);
      depart = trouve + m.length;
    }
  }
  if (!zones.length) { fragment.appendChild(document.createTextNode(brut)); return fragment; }

  zones.sort((a, b) => a[0] - b[0]);
  const fusion = [zones[0]];
  for (const z of zones.slice(1)) {
    const derniere = fusion[fusion.length - 1];
    if (z[0] <= derniere[1]) derniere[1] = Math.max(derniere[1], z[1]);
    else fusion.push(z);
  }

  let curseur = 0;
  for (const [debut, fin] of fusion) {
    if (debut > curseur) fragment.appendChild(document.createTextNode(brut.slice(curseur, debut)));
    fragment.appendChild(el('mark', { texte: brut.slice(debut, fin) }));
    curseur = fin;
  }
  if (curseur < brut.length) fragment.appendChild(document.createTextNode(brut.slice(curseur)));
  return fragment;
}

/* ─────────────── Vue : Carnet ─────────────── */

let filtreActif = 'tout';
let filtreQui = 'tous';

/* La liste des intervenants se déduit du carnet : « Moi » d'abord, puis les
   garages du plus fréquent au moins fréquent. Les variantes d'orthographe
   d'un même nom sont regroupées sur leur forme la plus employée. */
function intervenants() {
  const groupes = new Map();
  let sansLieu = 0;
  for (const i of etat.interventions) {
    const brut = String((i && i.lieu) || '').trim();
    if (!brut) { sansLieu++; continue; }
    const cle = sansAccents(brut);
    const g = groupes.get(cle) || { cle, formes: new Map(), nombre: 0 };
    g.formes.set(brut, (g.formes.get(brut) || 0) + 1);
    g.nombre++;
    groupes.set(cle, g);
  }
  const liste = [...groupes.values()].map(g => ({
    cle: g.cle,
    nombre: g.nombre,
    libelle: [...g.formes.entries()].sort((a, b) => b[1] - a[1])[0][0],
  }));
  liste.sort((a, b) => (a.cle === 'moi' ? -1 : b.cle === 'moi' ? 1 : 0) || b.nombre - a.nombre);
  if (sansLieu) liste.push({ cle: 'aucun', nombre: sansLieu, libelle: 'Non renseigné' });
  return liste;
}

function faitPar(i, cle) {
  if (cle === 'tous') return true;
  const brut = String((i && i.lieu) || '').trim();
  return cle === 'aucun' ? !brut : sansAccents(brut) === cle;
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

function rendreFiltresQui() {
  const zone = $('#filtresQui');
  zone.textContent = '';
  const liste = intervenants();

  // Une seule main sur la voiture : la rangée n'apporterait rien.
  const utile = liste.filter(x => x.cle !== 'aucun').length >= 2;
  zone.hidden = !utile;
  if (!utile) {
    if (filtreQui !== 'tous') { filtreQui = 'tous'; }
    return;
  }
  if (!liste.some(x => x.cle === filtreQui) && filtreQui !== 'tous') filtreQui = 'tous';

  for (const o of [{ cle: 'tous', libelle: 'Par tous' }].concat(liste)) {
    zone.appendChild(el('button', {
      classe: 'filtre' + (filtreQui === o.cle ? ' actif' : ''),
      type: 'button',
      texte: o.nombre ? o.libelle + ' · ' + o.nombre : o.libelle,
      sur: { click: () => { filtreQui = o.cle; rendreFiltres(); rendreCarnet(); } },
    }));
  }
}

function categorie(cle) {
  return CATEGORIES.find(c => c.cle === cle) || { cle: 'autre', libelle: 'Autre', couleur: '#8b93a1' };
}

function rendreCarnet() {
  const zone = $('#listeCarnet');
  zone.textContent = '';

  const mots = motsRecherches();
  const toutes = etat.interventions.slice().sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
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
  const bas = [dateCourte(i.date), cat.libelle, i.km > 0 ? nombreKm(i.km) + ' km' : null, i.lieu || null]
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
  const etats = POSITIONS.map(etatPneu);
  rendreSchemaPneus(etats);
  rendreHistoriquePneus(etats);

  const renseignes = etats.filter(e => e.statut !== 'inconnu').length;
  const anormaux = etats.filter(e => e.statut === 'retard').length;
  const surveiller = etats.filter(e => e.statut === 'proche').length;
  $('#pneusResume').textContent = renseignes === 0
    ? 'Appuie sur un pneu pour le renseigner'
    : anormaux ? anormaux + (anormaux > 1 ? ' pneus anormaux' : ' pneu anormal')
    : surveiller ? surveiller + ' à surveiller'
    : 'Les quatre sont corrects';

  $('#detailPressionsCible').textContent =
    'AV ' + pressionTexte(pressionCible('av')) + ' · AR ' + pressionTexte(pressionCible('ar'), ' bar');
}

function rendreSchemaPneus(etats) {
  const zone = $('#schemaPneus');
  zone.textContent = '';
  const L = 300, H = 300;

  // Les valeurs se lisent à l'extérieur de la carrosserie : au centre, les
  // colonnes gauche et droite se chevauchaient.
  const places = {
    avg: { x: 74, y: 84, gauche: true },
    avd: { x: 208, y: 84, gauche: false },
    arg: { x: 74, y: 188, gauche: true },
    ard: { x: 208, y: 188, gauche: false },
  };

  const enfants = [
    svgEl('text', { classe: 'pneu-etiquette', x: L / 2, y: 12, 'text-anchor': 'middle', texte: 'AVANT' }),
    svgEl('rect', { classe: 'silhouette', x: 96, y: 22, width: 108, height: 262, rx: 32 }),
    svgEl('rect', { classe: 'vitre', x: 112, y: 60, width: 76, height: 30, rx: 11 }),
    svgEl('rect', { classe: 'vitre', x: 112, y: 216, width: 76, height: 26, rx: 10 }),
  ];

  for (const e of etats) {
    const p = places[e.position.cle];
    const ancreX = p.gauche ? 64 : 236;
    const ancre = p.gauche ? 'end' : 'start';
    const groupe = svgEl('g', { classe: 'pneu-zone ' + e.statut, role: 'button',
      'aria-label': e.position.libelle });

    groupe.appendChild(svgEl('rect', {
      x: p.gauche ? 0 : 200, y: p.y - 18, width: 100, height: 76, fill: 'transparent',
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
    'aria-label': 'Les quatre pneus vus du dessus' }, enfants));
}

function rendreHistoriquePneus(etats) {
  const zone = $('#historiquePneus');
  zone.textContent = '';
  if (!etat.pneus.length) {
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

  const nb = etat.pneus.length;
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

  const passes = etat.pneus.filter(p => p.position === position.cle)
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
  const champs = POSITIONS.map(p => {
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
        id: identifiant(), date, position: position.cle, pression,
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

  ouvrirFeuille('Pressions du jour', 'À froid, avant de rouler.', [
    el('div', { classe: 'champ-duo' }, [champs[0].c.bloc, champs[1].c.bloc]),
    el('div', { classe: 'champ-duo' }, [champs[2].c.bloc, champs[3].c.bloc]),
    bouton('Enregistrer', { principal: true, action: valider }),
  ]);
}

function ouvrirPressionsCible() {
  const cAv = champ('cAv', 'Avant (bar)', { type: 'text', inputmode: 'decimal',
    value: pressionTexte(pressionCible('av')) });
  const cAr = champ('cAr', 'Arrière (bar)', { type: 'text', inputmode: 'decimal',
    value: pressionTexte(pressionCible('ar')) });

  ouvrirFeuille('Pressions recommandées', 'Relève-les sur l’étiquette de la portière conducteur.', [
    el('div', { classe: 'champ-duo' }, [cAv.bloc, cAr.bloc]),
    bouton('Enregistrer', {
      principal: true,
      action: () => {
        const av = nombreSaisi(cAv.entree.value), ar = nombreSaisi(cAr.entree.value);
        if (av < 1 || av > 4 || ar < 1 || ar > 4) { toast('Valeurs peu vraisemblables'); return; }
        etat.reglages.pressionAv = av;
        etat.reglages.pressionAr = ar;
        enregistrer('reglages');
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
  const etats = POSITIONS.map(etatPneu);
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

  const dates = etat.pneus.map(p => p.date).filter(Boolean).sort();
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
  $('#ficheTitre').textContent = v && (v.marque || v.modele)
    ? [v.marque, v.modele].filter(Boolean).join(' ')
    : 'Renseigner le véhicule';
  $('#ficheDetail').textContent = v && v.immat
    ? [v.immat, v.dateMiseCirculation ? 'depuis le ' + dateCourte(v.dateMiseCirculation) : null].filter(Boolean).join(' · ')
    : 'Marque, modèle, immatriculation';

  rendreGrapheKm();
  rendreGrapheCout();
  rendreListeRegles();
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
  for (const i of etat.interventions) {
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

function ouvrirFeuille(titre, sousTitre, contenu) {
  const zone = $('#feuilleContenu');
  zone.textContent = '';
  if (titre) zone.appendChild(el('h2', { texte: titre }));
  if (sousTitre) zone.appendChild(el('p', { classe: 'sous-titre', texte: sousTitre }));
  for (const c of [].concat(contenu)) if (c) zone.appendChild(c);
  const f = $('#feuilleGenerique');
  if (!f.open) f.showModal();
  f.scrollTop = 0;
}

function fermerFeuille() {
  const f = $('#feuilleGenerique');
  if (f.open) f.close();
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

function ouvrirCompteur() {
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
    etat.releves.push({ id: identifiant(), date: versIso(aujourdhui()), km, origine: 'saisie' });
    enregistrer('releves');
    fermerFeuille();
    rendreTout();
    vibrer(15);
    toast('Compteur enregistré');
  };

  c.entree.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); valider(); } });

  ouvrirFeuille('Relevé du compteur', 'Aujourd\'hui, ' + dateCourte(versIso(aujourdhui())), [
    c.bloc,
    bouton('Enregistrer', { principal: true, action: valider }),
  ]);
  setTimeout(() => c.entree.focus(), 60);
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

  const cLieu = champ('iLieu', 'Fait par', {
    type: 'text', autocomplete: 'off', placeholder: 'Moi, ou le nom du garage',
    list: 'listeIntervenants',
    value: existant ? (existant.lieu || '') : '',
  });
  const suggestions = $('#listeIntervenants');
  suggestions.textContent = '';
  for (const x of intervenants()) {
    if (x.cle !== 'aucun') suggestions.appendChild(el('option', { value: x.libelle }));
  }
  const cNotes = champ('iNotes', 'Notes', { balise: 'textarea', placeholder: 'Facultatif',
    value: existant ? (existant.notes || '') : '' });
  if (existant && existant.notes) cNotes.entree.value = existant.notes;

  const puces = el('div', { classe: 'puces' });
  for (const r of etat.regles) {
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
      date,
      titre,
      categorie: cCategorie.entree.value,
      km: parseInt(String(cKm.entree.value).replace(/[^\d]/g, ''), 10) || 0,
      coutTotal: total,
      resteACharge: chargeSaisie === '' ? total : nombre(chargeSaisie),
      lieu: cLieu.entree.value.trim(),
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
    for (const r of etat.regles) if (postesChoisis.has(r.cle) && r.repousseJusqua) delete r.repousseJusqua;
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
    cLieu.bloc,
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
    .map(c => (etat.regles.find(r => r.cle === c) || {}).libelle)
    .filter(Boolean);

  const lignes = el('ul', { classe: 'detail-liste' }, [
    el('li', null, [el('span', { texte: 'Date' }), el('span', { texte: dateCourte(i.date) })]),
    el('li', null, [el('span', { texte: 'Catégorie' }), el('span', { texte: cat.libelle })]),
    i.km > 0 ? el('li', null, [el('span', { texte: 'Compteur' }), el('span', { texte: nombreKm(i.km) + ' km' })]) : null,
    i.coutTotal ? el('li', null, [el('span', { texte: 'Facture' }), el('span', { texte: euros(i.coutTotal) })]) : null,
    (i.resteACharge || i.coutTotal) ? el('li', null, [el('span', { texte: 'Payé par moi' }), el('span', { texte: euros(i.resteACharge) })]) : null,
    i.lieu ? el('li', null, [el('span', { texte: 'Fait par' }), el('span', { texte: i.lieu })]) : null,
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
  const v = etat.vehicule || {};
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

  ouvrirFeuille('Ta voiture', 'Ces informations restent sur ce téléphone.',
    champs.map(c => c.bloc).concat([
      bouton('Enregistrer', {
        principal: true,
        action: () => {
          const nouveau = Object.assign({ id: (etat.vehicule && etat.vehicule.id) || identifiant() }, etat.vehicule);
          for (const c of champs) nouveau[c.cle] = c.entree.value.trim();
          etat.vehicule = nouveau;
          enregistrer('vehicule');
          fermerFeuille();
          rendreTout();
          toast('Fiche enregistrée');
        },
      }),
    ]));
}

/* ─────────────── Export et import ─────────────── */

/* L'export contient toutes les clés, sans exception : c'est la seule sauvegarde
   qui survit à un effacement du stockage par le système. */
function construireExport() {
  return {
    application: 'carnet-entretien',
    versionFormat: VERSION_FORMAT,
    exporteLe: new Date().toISOString(),
    vehicule: etat.vehicule,
    releves: etat.releves,
    interventions: etat.interventions,
    regles: etat.regles,
    reglages: etat.reglages,
    pneus: etat.pneus,
  };
}

function nomFichier(extension) {
  return 'carnet-' + versIso(aujourdhui()) + '.' + extension;
}

async function partagerOuTelecharger(contenu, nom, type) {
  const blob = new Blob([contenu], { type: type + ';charset=utf-8' });
  try {
    const fichier = new File([blob], nom, { type });
    if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
      await navigator.share({ files: [fichier], title: nom });
      return true;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return true;
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: nom });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch (e) {
    return false;
  }
}

async function exporterJson() {
  const contenu = JSON.stringify(construireExport(), null, 2);
  const ok = await partagerOuTelecharger(contenu, nomFichier('json'), 'application/json');
  if (ok) toast('Sauvegarde exportée');
  else afficherTexteBrut(contenu);
}

function echapperCsv(valeur) {
  const s = String(valeur === null || valeur === undefined ? '' : valeur);
  return '"' + s.replace(/"/g, '""') + '"';
}

async function exporterCsv() {
  const entetes = ['Date', 'Titre', 'Catégorie', 'Kilomètre', 'Facture', 'Payé par moi', 'Fait par', 'Postes', 'Notes'];
  const lignes = etat.interventions
    .slice().sort((a, b) => a.date < b.date ? -1 : 1)
    .map(i => [
      i.date, i.titre, categorie(i.categorie).libelle, i.km || '',
      i.coutTotal || '', i.resteACharge || '', i.lieu || '',
      (i.postes || []).join(' ; '), i.notes || '',
    ].map(echapperCsv).join(','));
  const contenu = '﻿' + [entetes.map(echapperCsv).join(',')].concat(lignes).join('\r\n');
  const ok = await partagerOuTelecharger(contenu, nomFichier('csv'), 'text/csv');
  if (ok) toast('Carnet exporté');
  else afficherTexteBrut(contenu);
}

function afficherTexteBrut(contenu) {
  const zone = el('textarea', { classe: 'zone-export', readonly: true, rows: 8 });
  zone.value = contenu;
  ouvrirFeuille('Copie manuelle', 'Le téléchargement a échoué. Sélectionne tout et copie.', [
    el('div', { classe: 'champ' }, [zone]),
    bouton('Fermer', { action: fermerFeuille }),
  ]);
}

function ouvrirImport() {
  ouvrirFeuille('Importer une sauvegarde', 'Un fichier exporté depuis cette application, ou son contenu collé.', [
    bouton('Choisir un fichier', { principal: true, action: () => $('#fichierImport').click() }),
    bouton('Coller le texte', { action: ouvrirCollage }),
  ]);
}

function ouvrirCollage() {
  const zone = el('textarea', { classe: 'zone-export', placeholder: 'Colle ici le contenu du fichier, en entier.', rows: 6 });
  ouvrirFeuille('Coller la sauvegarde', 'Le texte commence par une accolade et finit par une accolade.', [
    el('div', { classe: 'champ' }, [zone]),
    bouton('Importer', { principal: true, action: () => analyserImport(zone.value, 'le texte collé') }),
  ]);
}

/* Un import qui échoue doit dire ce qu'il a lu : sans cela, « fichier illisible »
   n'aide personne à retrouver le bon fichier. */
function analyserImport(texte, origine) {
  const brut = String(texte || '').replace(/^\uFEFF/, '').trim();

  if (!brut) { echecImport('Rien à lire', origine + ' est vide.'); return; }
  if (brut.startsWith('[InternetShortcut]') || brut.startsWith('URL=')) {
    echecImport('Ce n\'est pas la sauvegarde',
      'C\'est un raccourci internet de quelques octets, pas le fichier. Retourne le télécharger, puis choisis le fichier enregistré.');
    return;
  }
  if (brut.startsWith('<')) {
    echecImport('Ce n\'est pas la sauvegarde',
      'C\'est une page web. Le téléchargement a sans doute renvoyé une page de connexion au lieu du fichier.');
    return;
  }
  if (!brut.startsWith('{')) {
    echecImport('Format inattendu',
      'Une sauvegarde commence par une accolade. Celle-ci commence par : ' + brut.slice(0, 40));
    return;
  }

  let donnees;
  try {
    donnees = JSON.parse(brut);
  } catch (e) {
    echecImport('Contenu incomplet',
      'Le texte est reconnu comme une sauvegarde mais s\'arrête en chemin — il manque probablement la fin. Détail : ' + e.message);
    return;
  }
  if (!donnees || typeof donnees !== 'object') { echecImport('Format inattendu', 'Le contenu n\'est pas une sauvegarde.'); return; }

  const nb = Array.isArray(donnees.interventions) ? donnees.interventions.length : 0;
  const nbReleves = Array.isArray(donnees.releves) ? donnees.releves.length : 0;
  if (!nb && !nbReleves && !donnees.vehicule) {
    echecImport('Sauvegarde vide', 'Ce fichier ne contient ni intervention, ni relevé, ni véhicule.');
    return;
  }

  // Une sauvegarde complète remplace ; un fragment (mode ajout, ou ni véhicule ni règles) complète.
  const fragment = donnees.mode === 'ajout' || (!donnees.vehicule && !Array.isArray(donnees.regles));
  const actions = [];
  if (fragment) {
    actions.push(bouton('Ajouter au carnet', {
      principal: true,
      action: () => { ajouterAuCarnet(donnees); fermerFeuille(); },
    }));
  }
  actions.push(bouton('Remplacer tout', {
    principal: !fragment,
    danger: fragment,
    action: () => { appliquerImport(donnees); fermerFeuille(); },
  }));
  actions.push(bouton('Annuler', { action: fermerFeuille }));

  ouvrirFeuille('Importer', nb + ' interventions et ' + nbReleves + ' relevés dans ce fichier.'
    + (fragment ? '' : ' Une sauvegarde complète remplace ce que contient l\'application.'), actions);
}

/* Ajout : on complète sans rien perdre. Un identifiant déjà connu est ignoré,
   pour qu'un même fichier importé deux fois ne crée pas de doublons. */
function signature(i) {
  return (i.date || '') + '|' + String(i.titre || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function ajouterAuCarnet(donnees) {
  const connus = new Set(etat.interventions.map(i => i.id));
  const signatures = new Set(etat.interventions.map(signature));
  let ajoutees = 0, ignorees = 0;
  for (const i of (Array.isArray(donnees.interventions) ? donnees.interventions : [])) {
    if (!i || !versDate(i.date)) continue;
    // Une IA ne produit pas d'identifiant : sans signature, le même texte importé
    // deux fois se dédoublerait silencieusement.
    if ((i.id && connus.has(i.id)) || signatures.has(signature(i))) { ignorees++; continue; }
    signatures.add(signature(i));
    etat.interventions.push({
      id: i.id || identifiant(),
      date: i.date,
      titre: String(i.titre || 'Sans titre'),
      categorie: CATEGORIES.some(c => c.cle === i.categorie) ? i.categorie : 'depannage',
      km: parseInt(i.km, 10) > 0 ? parseInt(i.km, 10) : 0,
      coutTotal: Number(i.coutTotal) || 0,
      resteACharge: (i.resteACharge === undefined || i.resteACharge === null)
        ? (Number(i.coutTotal) || 0) : (Number(i.resteACharge) || 0),
      lieu: String(i.lieu || ''),
      notes: String(i.notes || ''),
      postes: Array.isArray(i.postes) ? i.postes.filter(p => etat.regles.some(r => r.cle === p)) : [],
      resolueLe: i.resolueLe || null,
    });
    ajoutees++;
  }
  for (const r of (Array.isArray(donnees.releves) ? donnees.releves : [])) {
    if (r && r.km > 0 && versDate(r.date)) {
      etat.releves.push({ id: r.id || identifiant(), date: r.date, km: Number(r.km), origine: 'import' });
    }
  }
  enregistrer('interventions');
  enregistrer('releves');
  rendreTout();
  const dit = ajoutees ? ajoutees + (ajoutees > 1 ? ' entrées ajoutées' : ' entrée ajoutée') : 'Rien de nouveau';
  toast(ignorees ? dit + ', ' + ignorees + ' déjà présente' + (ignorees > 1 ? 's' : '') : dit);
}

function echecImport(titre, explication) {
  ouvrirFeuille(titre, explication, [
    bouton('Réessayer', { principal: true, action: ouvrirImport }),
    bouton('Fermer', { action: fermerFeuille }),
  ]);
}

function importerFichier(fichier) {
  const lecteur = new FileReader();
  lecteur.onload = () => analyserImport(lecteur.result, 'ce fichier (' + fichier.size + ' octets)');
  lecteur.onerror = () => echecImport('Lecture impossible', 'Le téléphone n\'a pas pu ouvrir ce fichier.');
  lecteur.readAsText(fichier);
}

/* Accepte les formats antérieurs : chaque clé absente retombe sur une valeur
   par défaut plutôt que de faire échouer l'import entier. */
function appliquerImport(donnees) {
  etat.vehicule = donnees.vehicule || null;
  etat.releves = Array.isArray(donnees.releves) ? donnees.releves : [];
  etat.interventions = Array.isArray(donnees.interventions) ? donnees.interventions : [];
  etat.regles = Array.isArray(donnees.regles) ? donnees.regles : [];
  etat.reglages = (donnees.reglages && typeof donnees.reglages === 'object') ? donnees.reglages : {};
  etat.pneus = Array.isArray(donnees.pneus) ? donnees.pneus : [];

  for (const i of etat.interventions) {
    if (!i.id) i.id = identifiant();
    if (!Array.isArray(i.postes)) i.postes = [];
    if (i.resteACharge === undefined || i.resteACharge === null) i.resteACharge = Number(i.coutTotal) || 0;
  }
  for (const r of etat.releves) if (!r.id) r.id = identifiant();

  fusionnerRegles();
  for (const cle of Object.keys(CLES)) enregistrer(cle);
  rendreTout();
  toast('Sauvegarde importée');
}

function confirmerEffacement() {
  ouvrirFeuille('Tout effacer ?', 'Le véhicule, le carnet et les relevés seront perdus. Exporte d\'abord si tu hésites.', [
    bouton('Effacer définitivement', {
      danger: true,
      action: () => {
        try { for (const cle of Object.values(CLES)) localStorage.removeItem(cle); } catch (e) { /* stockage indisponible */ }
        etat = { vehicule: null, releves: [], interventions: [], regles: [], reglages: {}, pneus: [] };
        fusionnerRegles();
        fermerFeuille();
        rendreTout();
        toast('Tout est effacé');
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
  const postes = etat.regles.map(r => r.cle).join(', ');
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
    '  "lieu":"nom du garage ou Moi", "notes":"détails, hypothèses, pièces à vérifier",',
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
    if (ev.target === feuille) feuille.close();
  });
}

function demarrer() {
  chargerEtat();
  rendreFiltres();
  brancherInterface();
  rendreTout();
  allerA('Aujourdhui');

  if (!etat.reglages.tutoVu && etat.interventions.length === 0) {
    setTimeout(ouvrirTutoriel, 500);
  }

  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  } catch (e) { /* non supporté */ }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => { /* hors ligne indisponible */ });
    });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
else demarrer();
