/* donnees.js — stockage, migrations, formats, sauvegarde
   Application locale, sans réseau ni compte. Identifiants et commentaires
   en français pour rester lisibles par le propriétaire de l'application. */

'use strict';

const VERSION_APPLI = '2.4.0';
const VERSION_FORMAT = 1;
const CLES = {
  vehicule: 'vehiculeV1',
  releves: 'relevesV1',
  interventions: 'interventionsV1',
  regles: 'reglesV1',
  reglages: 'reglagesV1',
  pneus: 'pneusV1',
  vehicules: 'vehiculesV1',
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
  vehicules: [],
  vehicule: null,     // pointeur vers l'élément actif de vehicules, jamais une copie
  releves: [],
  interventions: [],
  regles: [],
  reglages: {},
  pneus: [],          // relevés de pression et d'usure, un par pneu et par date
};

function chargerEtat() {
  etat.vehicules = lire(CLES.vehicules, []);
  etat.vehicule = lire(CLES.vehicule, null);
  etat.releves = lire(CLES.releves, []);
  etat.interventions = lire(CLES.interventions, []);
  etat.regles = lire(CLES.regles, []);
  etat.reglages = lire(CLES.reglages, {});
  etat.pneus = lire(CLES.pneus, []);
  migrerVehicules();
  activerVehicule(etat.reglages.vehiculeActif);
  fusionnerRegles();
  migrerPostesAuBesoin();
  migrerParQui();
}

/* ─────────────── Véhicules ─────────────── */

/* Migration volontairement non destructive : « vehiculeV1 » reste en place.
   Si quelque chose tourne mal, l'historique d'origine est toujours là. */
function migrerVehicules() {
  if (etat.reglages.migrationVehicules) return;

  if (!etat.vehicules.length) {
    const ancien = etat.vehicule;
    const quelqueChose = ancien || etat.interventions.length || etat.releves.length;
    if (quelqueChose) {
      const v = Object.assign({}, ancien || {});
      v.id = v.id || identifiant();
      v.roues = 4;
      v.pressionAv = Number(etat.reglages.pressionAv) || 0;
      v.pressionAr = Number(etat.reglages.pressionAr) || 0;
      if (!v.marque && !v.modele) v.modele = 'Ma voiture';
      etat.vehicules = [v];
      etat.reglages.vehiculeActif = v.id;
    }
  }

  const id = etat.reglages.vehiculeActif;
  if (id) {
    for (const liste of [etat.interventions, etat.releves, etat.regles, etat.pneus]) {
      for (const x of liste) if (x && !x.vehiculeId) x.vehiculeId = id;
    }
  }

  etat.reglages.migrationVehicules = true;
  for (const cle of ['vehicules', 'interventions', 'releves', 'regles', 'pneus', 'reglages']) {
    enregistrer(cle);
  }
}

function activerVehicule(id) {
  const trouve = etat.vehicules.find(v => v && v.id === id) || etat.vehicules[0] || null;
  etat.vehicule = trouve;
  if (trouve && etat.reglages.vehiculeActif !== trouve.id) {
    etat.reglages.vehiculeActif = trouve.id;
    enregistrer('reglages');
  }
  return trouve;
}

function idActif() {
  return etat.vehicule ? etat.vehicule.id : null;
}

/* Vues filtrées : le stockage reste global, la lecture est toujours cadrée
   sur le véhicule affiché. */
function duVehicule(liste) {
  const id = idActif();
  if (!id) return [];
  return liste.filter(x => x && x.vehiculeId === id);
}

const lesInterventions = () => duVehicule(etat.interventions);
const lesReleves = () => duVehicule(etat.releves);
const lesRegles = () => duVehicule(etat.regles);
const lesPneus = () => duVehicule(etat.pneus);

function creerVehicule(champs, reprendreDe) {
  const v = Object.assign({ id: identifiant(), roues: 4, pressionAv: 0, pressionAr: 0 }, champs || {});
  etat.vehicules.push(v);
  enregistrer('vehicules');
  activerVehicule(v.id);

  // Les postes suivis appartiennent au véhicule : une moto n'a pas les
  // intervalles d'un diesel. On recopie seulement sur demande explicite.
  const modeles = reprendreDe
    ? etat.regles.filter(r => r.vehiculeId === reprendreDe)
    : REGLES_PAR_DEFAUT;
  for (const m of modeles) {
    etat.regles.push({
      id: identifiant(), vehiculeId: v.id, cle: m.cle, libelle: m.libelle,
      intervalleKm: m.intervalleKm, intervalleMois: m.intervalleMois,
      auBesoin: !!m.auBesoin, actif: m.actif !== false,
    });
  }
  enregistrer('regles');
  return v;
}

function supprimerVehicule(id) {
  etat.vehicules = etat.vehicules.filter(v => v && v.id !== id);
  etat.interventions = etat.interventions.filter(x => x.vehiculeId !== id);
  etat.releves = etat.releves.filter(x => x.vehiculeId !== id);
  etat.regles = etat.regles.filter(x => x.vehiculeId !== id);
  etat.pneus = etat.pneus.filter(x => x.vehiculeId !== id);
  for (const cle of ['vehicules', 'interventions', 'releves', 'regles', 'pneus']) enregistrer(cle);
  activerVehicule(etat.vehicules.length ? etat.vehicules[0].id : null);
  if (!etat.vehicules.length) { etat.vehicule = null; etat.reglages.vehiculeActif = null; }
  enregistrer('reglages');
}

function nomVehicule(v) {
  if (!v) return 'Aucun véhicule';
  return [v.marque, v.modele].filter(Boolean).join(' ') || v.immat || 'Sans nom';
}

/* « Fait par » servait à la fois à dire « moi » et à nommer un garage : un même
   champ pour deux informations, et « moi-même » créait un second intervenant.
   On sépare la nature — moi ou un professionnel — du nom du garage. */
const MOTS_MOI = ['moi', 'moi meme', 'moi-meme', 'perso', 'personnel', 'soi', 'maison'];

function migrerParQui() {
  if (etat.reglages.migrationParQui) return;
  for (const i of etat.interventions) {
    if (!i || i.parQui) continue;
    const brut = String(i.lieu || '').trim();
    if (!brut) { i.parQui = ''; continue; }
    if (MOTS_MOI.includes(sansAccents(brut).replace(/\s+/g, ' '))) {
      i.parQui = 'moi';
      i.lieu = '';
    } else {
      i.parQui = 'pro';
    }
  }
  etat.reglages.migrationParQui = true;
  enregistrer('interventions');
  enregistrer('reglages');
}

/* Ce qu'on affiche dans le carnet à la place de l'ancien champ libre. */
function auteur(i) {
  if (!i) return '';
  if (i.parQui === 'moi') return 'Moi';
  const nom = String(i.lieu || '').trim();
  if (nom) return nom;
  return i.parQui === 'pro' ? 'Un professionnel' : '';
}

/* Plaquettes et pneus se changent quand ils sont usés, pas à date fixe.
   On ne touche qu'aux réglages restés exactement à l'ancienne valeur par
   défaut : un intervalle modifié à la main est conservé tel quel. */
function migrerPostesAuBesoin() {
  if (etat.reglages.migrationAuBesoin) return;
  for (const r of etat.regles) {
    if (!r) continue;
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
  const id = idActif();
  if (!id) return;
  const connues = new Set(lesRegles().map(r => r.cle));
  let change = false;
  for (const modele of REGLES_PAR_DEFAUT) {
    if (connues.has(modele.cle)) continue;
    etat.regles.push({
      id: identifiant(),
      vehiculeId: id,
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
  // « vehicule » désigne l'élément actif du tableau : c'est le tableau qu'on écrit.
  if (quoi === 'vehicule' || quoi === 'vehicules') ecrire(CLES.vehicules, etat.vehicules);
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
    .map(c => (lesRegles().find(r => r.cle === c) || {}).libelle)
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


/* ─────────────── Export et import ─────────────── */

/* L'export contient toutes les clés, sans exception : c'est la seule sauvegarde
   qui survit à un effacement du stockage par le système. */
function construireExport() {
  return {
    application: 'carnet-entretien',
    versionFormat: VERSION_FORMAT,
    exporteLe: new Date().toISOString(),
    vehicules: etat.vehicules,
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
  if (ok) {
    etat.reglages.dernierExport = versIso(aujourdhui());
    enregistrer('reglages');
    rendreTout();
    toast('Sauvegarde exportée');
  } else {
    afficherTexteBrut(contenu);
  }
}

function echapperCsv(valeur) {
  const s = String(valeur === null || valeur === undefined ? '' : valeur);
  return '"' + s.replace(/"/g, '""') + '"';
}

async function exporterCsv() {
  const entetes = ['Date', 'Titre', 'Catégorie', 'Kilomètre', 'Facture', 'Payé par moi', 'Fait par', 'Postes', 'Notes'];
  const lignes = lesInterventions()
    .slice().sort((a, b) => a.date < b.date ? -1 : 1)
    .map(i => [
      i.date, i.titre, categorie(i.categorie).libelle, i.km || '',
      i.coutTotal || '', i.resteACharge || '', auteur(i),
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
  const connus = new Set(lesInterventions().map(i => i.id));
  const signatures = new Set(lesInterventions().map(signature));
  let ajoutees = 0, ignorees = 0;
  for (const i of (Array.isArray(donnees.interventions) ? donnees.interventions : [])) {
    if (!i || !versDate(i.date)) continue;
    // Une IA ne produit pas d'identifiant : sans signature, le même texte importé
    // deux fois se dédoublerait silencieusement.
    if ((i.id && connus.has(i.id)) || signatures.has(signature(i))) { ignorees++; continue; }
    signatures.add(signature(i));
    etat.interventions.push({
      id: i.id || identifiant(),
      vehiculeId: idActif(),
      date: i.date,
      titre: String(i.titre || 'Sans titre'),
      categorie: CATEGORIES.some(c => c.cle === i.categorie) ? i.categorie : 'depannage',
      km: parseInt(i.km, 10) > 0 ? parseInt(i.km, 10) : 0,
      coutTotal: Number(i.coutTotal) || 0,
      resteACharge: (i.resteACharge === undefined || i.resteACharge === null)
        ? (Number(i.coutTotal) || 0) : (Number(i.resteACharge) || 0),
      lieu: i.parQui === 'moi' ? '' : String(i.lieu || ''),
      parQui: i.parQui === 'moi' || i.parQui === 'pro' ? i.parQui
        : (MOTS_MOI.includes(sansAccents(String(i.lieu || '').trim())) ? 'moi'
          : (String(i.lieu || '').trim() ? 'pro' : '')),
      notes: String(i.notes || ''),
      postes: Array.isArray(i.postes) ? i.postes.filter(p => lesRegles().some(r => r.cle === p)) : [],
      resolueLe: i.resolueLe || null,
    });
    ajoutees++;
  }
  for (const r of (Array.isArray(donnees.releves) ? donnees.releves : [])) {
    if (r && r.km > 0 && versDate(r.date)) {
      etat.releves.push({ id: r.id || identifiant(), vehiculeId: idActif(),
        date: r.date, km: Number(r.km), origine: 'import' });
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
  etat.vehicules = Array.isArray(donnees.vehicules) ? donnees.vehicules : [];
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

  // Un fichier d'avant les véhicules multiples repasse par la migration.
  delete etat.reglages.migrationVehicules;
  migrerVehicules();
  activerVehicule(etat.reglages.vehiculeActif);
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
        etat = { vehicules: [], vehicule: null, releves: [], interventions: [],
          regles: [], reglages: {}, pneus: [] };
        fusionnerRegles();
        fermerFeuille();
        rendreTout();
        toast('Tout est effacé');
      },
    }),
    bouton('Annuler', { action: fermerFeuille }),
  ]);
}
