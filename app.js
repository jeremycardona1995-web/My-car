/* Carnet d'entretien — application locale, sans réseau ni compte.
   Tout est en français, y compris les identifiants, pour rester lisible
   par le propriétaire de l'application. */

'use strict';

const VERSION_APPLI = '1.0.0';
const VERSION_FORMAT = 1;
const CLES = {
  vehicule: 'vehiculeV1',
  releves: 'relevesV1',
  interventions: 'interventionsV1',
  regles: 'reglesV1',
  reglages: 'reglagesV1',
};

const CATEGORIES = [
  { cle: 'revision',  libelle: 'Révision',           couleur: '#f0a832' },
  { cle: 'pneus',     libelle: 'Pneus',              couleur: '#60a5fa' },
  { cle: 'depannage', libelle: 'Dépannage',          couleur: '#c084fc' },
  { cle: 'sinistre',  libelle: 'Sinistre',           couleur: '#ef4444' },
  { cle: 'ct',        libelle: 'Contrôle technique', couleur: '#6ee7a8' },
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
  { cle: 'freins',         libelle: 'Plaquettes et disques',           intervalleKm: 0,      intervalleMois: 6, controle: true },
  { cle: 'pneus',          libelle: 'Usure et pression des pneus',     intervalleKm: 0,      intervalleMois: 6, controle: true },
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
};

function chargerEtat() {
  etat.vehicule = lire(CLES.vehicule, null);
  etat.releves = lire(CLES.releves, []);
  etat.interventions = lire(CLES.interventions, []);
  etat.regles = lire(CLES.regles, []);
  etat.reglages = lire(CLES.reglages, {});
  fusionnerRegles();
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
      controle: !!modele.controle,
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
    if (!trouve || i.date > trouve.date) trouve = i;
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
    if (!regle || regle.actif === false) continue;
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
  const verbe = e.regle.controle ? 'À contrôler' : '';
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

  const echeances = calculerEcheances();
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
    sur: { click: () => ouvrirEcheance(e) },
  }, [
    jauge,
    el('span', { classe: 'echeance-texte' }, [
      el('span', { classe: 'echeance-titre', texte: e.regle.libelle }),
      el('span', { classe: 'echeance-etat ' + (e.statut === 'retard' ? 'retard' : e.statut === 'proche' ? 'proche' : ''), texte: e.texte }),
    ]),
  ]);

  enveloppe.appendChild(fond);
  enveloppe.appendChild(corps);
  brancherGlissement(enveloppe, corps, fond, e);
  return enveloppe;
}

/* ─────────────── Vue : Carnet ─────────────── */

let filtreActif = 'tout';

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
}

function categorie(cle) {
  return CATEGORIES.find(c => c.cle === cle) || { cle: 'autre', libelle: 'Autre', couleur: '#8b93a1' };
}

function rendreCarnet() {
  const zone = $('#listeCarnet');
  zone.textContent = '';

  const toutes = etat.interventions.slice().sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  const visibles = filtreActif === 'tout' ? toutes : toutes.filter(i => i.categorie === filtreActif);

  const total = toutes.reduce((s, i) => s + (Number(i.resteACharge) || 0), 0);
  $('#carnetResume').textContent = toutes.length
    ? toutes.length + ' interventions · ' + euros(total) + ' à ma charge'
    : 'Rien pour l\'instant';

  $('#videCarnet').hidden = visibles.length > 0;

  let anneeCourante = null;
  for (const i of visibles) {
    const annee = (i.date || '').slice(0, 4);
    if (annee !== anneeCourante) {
      anneeCourante = annee;
      const totalAnnee = visibles
        .filter(x => (x.date || '').slice(0, 4) === annee)
        .reduce((s, x) => s + (Number(x.resteACharge) || 0), 0);
      zone.appendChild(el('h2', { classe: 'annee' }, [
        el('span', { texte: annee || '—' }),
        el('span', { classe: 'annee-total', texte: totalAnnee ? euros(totalAnnee) : '' }),
      ]));
    }
    zone.appendChild(carteIntervention(i));
  }
}

function carteIntervention(i) {
  const cat = categorie(i.categorie);
  const bas = [dateCourte(i.date), cat.libelle, i.km > 0 ? nombreKm(i.km) + ' km' : null, i.lieu || null]
    .filter(Boolean).join(' · ');

  const cout = Number(i.resteACharge) || 0;
  const facture = Number(i.coutTotal) || 0;

  return el('button', {
    classe: 'evenement', type: 'button',
    sur: { click: () => ouvrirDetailIntervention(i.id) },
  }, [
    el('span', { classe: 'pastille', style: 'background:' + cat.couleur }),
    el('span', { classe: 'evenement-texte' }, [
      el('span', { classe: 'evenement-titre', texte: i.titre || cat.libelle }),
      el('span', { classe: 'evenement-detail', texte: bas }),
    ]),
    (cout || facture) ? el('span', { classe: 'evenement-cout' }, [
      document.createTextNode(euros(cout)),
      facture > cout ? el('small', { texte: 'sur ' + euros(facture) }) : null,
    ]) : null,
  ]);
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
  $('#noteCout').textContent = 'Barre pleine : ce que tu as payé (' + euros(chargeGenerale)
    + '). Barre sombre : montant total facturé (' + euros(totalGeneral) + '), assurance comprise.';
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
    bouton(e.regle.controle ? 'Contrôlé, c\'est bon' : 'C\'est fait', {
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
    value: existant ? (existant.lieu || '') : '',
  });
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
    i.notes ? el('li', null, [el('span', { texte: 'Notes' }), el('span', { texte: i.notes })]) : null,
  ]);

  ouvrirFeuille(i.titre || cat.libelle, null, [
    lignes,
    bouton('Modifier', { principal: true, action: () => { fermerFeuille(); ouvrirIntervention(i.id); } }),
    bouton('Supprimer', { danger: true, action: () => confirmerSuppression(i) }),
  ]);
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

  ouvrirFeuille('Importer', nb + ' interventions et ' + nbReleves + ' relevés. Cela remplace ce que contient l\'application.', [
    bouton('Remplacer mes données', {
      principal: true,
      action: () => { appliquerImport(donnees); fermerFeuille(); },
    }),
    bouton('Annuler', { action: fermerFeuille }),
  ]);
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
        etat = { vehicule: null, releves: [], interventions: [], regles: [], reglages: {} };
        fusionnerRegles();
        fermerFeuille();
        rendreTout();
        toast('Tout est effacé');
      },
    }),
    bouton('Annuler', { action: fermerFeuille }),
  ]);
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
  ['Surveille la page du jour', 'En rouge ce qui est dépassé, en orange ce qui approche. Appuie sur une ligne pour agir.'],
  ['Raccourci', 'Sur une ligne, glisse vers la droite : c\'est la même chose que « c\'est fait ».'],
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
  for (const v of ['Aujourdhui', 'Carnet', 'Voiture']) {
    $('#vue' + v).hidden = v !== nom;
  }
  for (const b of document.querySelectorAll('.nav-bouton')) {
    const actif = b.dataset.vue === nom;
    b.classList.toggle('actif', actif);
    if (actif) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  const fab = $('#fab');
  fab.hidden = nom === 'Voiture';
  fab.innerHTML = nom === 'Aujourdhui' ? ICONE_COMPTEUR : ICONE_PLUS;
  fab.setAttribute('aria-label', nom === 'Aujourdhui' ? 'Relever le compteur' : 'Nouvelle intervention');
  window.scrollTo(0, 0);
}

function rendreTout() {
  rendreAujourdhui();
  rendreCarnet();
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

  $('#ouvrirFiche').addEventListener('click', ouvrirFiche);
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
