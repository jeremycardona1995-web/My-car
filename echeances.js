/* echeances.js — kilométrage, échéances, pneus, agenda
   Application locale, sans réseau ni compte. Identifiants et commentaires
   en français pour rester lisibles par le propriétaire de l'application. */

'use strict';

/* ─────────────── Kilométrage : relevés et estimation ─────────────── */

/* Les interventions comportant un compteur valent relevé : on ne demande pas
   deux fois la même information. */
function tousLesReleves() {
  const liste = [];
  for (const r of lesReleves()) {
    if (r && r.km > 0 && versDate(r.date)) liste.push({ date: r.date, km: Number(r.km) });
  }
  for (const i of lesInterventions()) {
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
  for (const i of lesInterventions()) {
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

  for (const regle of lesRegles()) {
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

const POSITIONS_QUATRE = [
  { cle: 'avg', nom: 'AVG', libelle: 'Avant gauche', essieu: 'av' },
  { cle: 'avd', nom: 'AVD', libelle: 'Avant droit',  essieu: 'av' },
  { cle: 'arg', nom: 'ARG', libelle: 'Arrière gauche', essieu: 'ar' },
  { cle: 'ard', nom: 'ARD', libelle: 'Arrière droit',  essieu: 'ar' },
];

const POSITIONS_DEUX = [
  { cle: 'av', nom: 'AV', libelle: 'Roue avant',   essieu: 'av' },
  { cle: 'ar', nom: 'AR', libelle: 'Roue arrière', essieu: 'ar' },
];

function positionsVehicule() {
  return (etat.vehicule && Number(etat.vehicule.roues) === 2) ? POSITIONS_DEUX : POSITIONS_QUATRE;
}

/* Un pneu sain perd environ 0,1 bar par mois. Au-delà de 0,25 il fuit, et
   l'écart de température fausse la mesure d'environ 0,1 bar pour 10 °C : le
   seuil est volontairement large pour ne pas crier au loup en hiver. */
const PERTE_NORMALE = 0.10;
const PERTE_SUSPECTE = 0.25;
const DELAI_MINIMAL = 20;      // jours : en dessous, la mesure ne veut rien dire

/* Ce que le pneu a perdu depuis le dernier gonflage : la pression laissée la
   fois d'avant, moins celle relevée avant de regonfler. */
function perteMensuelle(clePosition) {
  const releves = lesPneus()
    .filter(p => p && p.position === clePosition && versDate(p.date))
    .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

  for (let i = releves.length - 1; i >= 1; i--) {
    const apres = Number(releves[i].pressionAvant);
    const avant = Number(releves[i - 1].pression);
    if (!(apres > 0) || !(avant > 0)) continue;

    const jours = (versDate(releves[i].date).getTime() - versDate(releves[i - 1].date).getTime()) / JOUR;
    if (jours < DELAI_MINIMAL) continue;

    const perte = Math.max(0, avant - apres);
    return {
      parMois: perte / (jours / 30.44),
      perte,
      jours: Math.round(jours),
      depuis: releves[i - 1].date,
      le: releves[i].date,
    };
  }
  return null;
}

function statutPerte(parMois) {
  if (parMois > PERTE_SUSPECTE) return 'retard';
  if (parMois > PERTE_NORMALE * 1.5) return 'proche';
  return 'ok';
}

const USURE_NEUF = 8;      // mm de gomme sur un pneu neuf
const USURE_LIMITE = 1.6;  // limite légale
const PRESSION_DEFAUT = 2.4;

/* Les pressions recommandées appartiennent au véhicule, pas à l'application :
   une moto et un break n'ont rien à voir. */
function pressionCible(essieu) {
  const v = etat.vehicule ? Number(etat.vehicule[essieu === 'av' ? 'pressionAv' : 'pressionAr']) : 0;
  return v > 0 ? v : PRESSION_DEFAUT;
}

function dernierPneu(cle) {
  let trouve = null;
  for (const p of lesPneus()) {
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



/* ─────────────── Relevé réclamé et sauvegarde ─────────────── */

const RELEVE_APRES_JOURS = 30;     // au-delà, l'estimation commence à dériver
const EXPORT_APRES_JOURS = 90;

function joursDepuis(iso) {
  const d = versDate(iso);
  if (!d) return null;
  return Math.round((aujourdhui().getTime() - d.getTime()) / JOUR);
}

function aDesDonnees() {
  return lesInterventions().length > 0 || lesReleves().length > 0;
}

/* La question ne se pose qu'une fois par semaine si on l'a repoussée : mieux
   vaut un relevé donné de bon cœur qu'une boîte qu'on apprend à fermer. */
function doitReclamerCompteur() {
  if (!aDesDonnees()) return false;
  const reporte = etat.reglages.compteurReporteJusqua;
  if (reporte && versDate(reporte) && versDate(reporte).getTime() > aujourdhui().getTime()) return false;
  const dernier = dernierReleve();
  if (!dernier) return true;
  return joursDepuis(dernier.date) >= RELEVE_APRES_JOURS;
}

function reclamerCompteur() {
  const dernier = dernierReleve();
  const jours = dernier ? joursDepuis(dernier.date) : null;
  const sous = dernier
    ? 'Dernier relevé il y a ' + dureeLisible(jours) + '. Depuis, tout est estimé.'
    : 'Aucun relevé : les échéances kilométriques ne peuvent pas se calculer.';

  ouvrirCompteur({
    titre: 'Où en est le compteur ?',
    sousTitre: sous,
    secondaire: bouton('Plus tard', {
      action: () => {
        etat.reglages.compteurReporteJusqua = versIso(ajouterJours(aujourdhui(), 7));
        enregistrer('reglages');
        fermerFeuille();
      },
    }),
  });
}

function ajouterJours(date, n) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + n);
  return d;
}

/* La sauvegarde vieillit comme une échéance : elle en prend la forme. */
function alerteSauvegarde() {
  if (!aDesDonnees() || lesInterventions().length < 3) return [];
  const dernier = etat.reglages.dernierExport;
  const jours = dernier ? joursDepuis(dernier) : null;
  if (jours !== null && jours < EXPORT_APRES_JOURS) return [];

  return [{
    regle: { cle: 'sauvegarde', libelle: 'Sauvegarde' },
    statut: jours === null ? 'proche' : (jours > EXPORT_APRES_JOURS * 2 ? 'retard' : 'proche'),
    fraction: 1,
    texte: jours === null
      ? 'Jamais exportée — le téléphone peut vider ce stockage'
      : 'Dernier export il y a ' + dureeLisible(jours),
    action: () => { allerA('Voiture'); setTimeout(exporterJson, 250); },
  }];
}

/* ─────────────── Agenda ─────────────── */

function echapperIcs(texte) {
  return String(texte || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function dateIcs(date) {
  const p = n => String(n).padStart(2, '0');
  return date.getFullYear() + p(date.getMonth() + 1) + p(date.getDate());
}

/* Événement d'une journée entière, avec un rappel une semaine avant : sans
   notifications, l'agenda du téléphone est le seul à pouvoir prévenir. */
function construireIcs(titre, description, dateIso, identifiantEvenement) {
  const brute = versDate(dateIso);
  if (!brute) return null;
  // Une échéance déjà dépassée ne se note pas dans le passé : on la pose devant.
  const minimum = ajouterJours(aujourdhui(), 3);
  const debut = brute.getTime() < minimum.getTime() ? minimum : brute;
  const fin = ajouterJours(debut, 1);
  const joursAvant = Math.round((debut.getTime() - aujourdhui().getTime()) / JOUR);
  const rappel = joursAvant > 8 ? '-P7D' : '-P1D';
  const horodatage = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const lignes = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Carnet d\'entretien//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + identifiantEvenement + '@carnet-entretien',
    'DTSTAMP:' + horodatage,
    'DTSTART;VALUE=DATE:' + dateIcs(debut),
    'DTEND;VALUE=DATE:' + dateIcs(fin),
    'SUMMARY:' + echapperIcs(titre),
    'DESCRIPTION:' + echapperIcs(description),
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'TRIGGER:' + rappel,
    'ACTION:DISPLAY',
    'DESCRIPTION:' + echapperIcs(titre),
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n') + '\r\n';

  return { contenu: lignes, date: versIso(debut) };
}

async function ajouterAAgenda(echeance) {
  const v = etat.vehicule || {};
  const voiture = [v.marque, v.modele].filter(Boolean).join(' ') || 'Voiture';
  const titre = voiture + ' — ' + echeance.regle.libelle;
  const description = [
    echeance.texte,
    echeance.fait ? 'Dernière fois : ' + dateCourte(echeance.fait.date)
      + (echeance.fait.km ? ' à ' + nombreKm(echeance.fait.km) + ' km' : '') : null,
    'Ajouté depuis le carnet d\'entretien.',
  ].filter(Boolean).join('\n');

  const evenement = construireIcs(titre, description, echeance.dateEcheance,
    (etat.vehicule && etat.vehicule.id ? etat.vehicule.id : 'carnet') + '-' + echeance.regle.cle);
  if (!evenement) { toast('Cette échéance n\'a pas de date'); return; }

  const nom = 'echeance-' + echeance.regle.cle + '.ics';
  const ok = await partagerOuTelecharger(evenement.contenu, nom, 'text/calendar');
  if (ok) toast('Rendez-vous au ' + dateCourte(evenement.date) + ' : ouvre le fichier');
  else afficherTexteBrut(evenement.contenu);
}
