# Carnet d'entretien

Application web pour téléphone qui suit l'entretien d'une voiture : ce qui a été
fait, ce que ça a coûté, et surtout ce qui arrive à échéance. Elle fonctionne
sans réseau, sans compte et sans serveur.

## Ce qu'elle fait

- **Aujourd'hui** — le kilométrage du jour (estimé à partir de vos relevés) et
  la liste des postes classés par urgence : en retard, bientôt, à jour, jamais
  renseignés.
- **Carnet** — l'historique complet, groupé par année, filtrable par catégorie,
  avec la distinction entre le montant facturé et ce que vous avez réellement
  payé.
- **Voiture** — la fiche du véhicule, la courbe du kilométrage, les dépenses par
  an, la liste des postes suivis et la sauvegarde.

Cocher un poste dans une intervention relance son compte à rebours. Les
échéances se calculent sur deux critères, le kilométrage et le temps : la
contrainte la plus proche l'emporte.

## Vie privée

Toutes les données sont enregistrées dans le `localStorage` du navigateur, sur
l'appareil. Aucun appel réseau applicatif, aucun serveur, aucune mesure
d'audience. Ce dépôt ne contient que du code : il ne doit jamais recevoir
d'immatriculation, de numéro de série, de facture ni de kilométrage. Le
`.gitignore` est là pour ça.

Le stockage d'un navigateur peut être vidé par le système, notamment sur iPhone
quand une application installée reste plusieurs semaines sans être ouverte.
**Exportez régulièrement** : c'est la seule sauvegarde qui survit à tout.

## Installation sur le téléphone

1. Ouvrez l'adresse de l'application dans le navigateur du téléphone.
2. Menu du navigateur → « Ajouter à l'écran d'accueil ».
3. Lancez-la depuis l'icône : elle s'ouvre en plein écran et fonctionne hors
   réseau.

## Reprendre un historique existant

L'onglet **Voiture → Importer une sauvegarde** accepte un fichier JSON au format
d'export. L'import remplace intégralement le contenu de l'application ; les
clés absentes d'un fichier plus ancien retombent sur leurs valeurs par défaut.

## Format des données

Cinq clés versionnées dans `localStorage` : `vehiculeV1`, `relevesV1`,
`interventionsV1`, `reglesV1`, `reglagesV1`. Chaque enregistrement porte un
identifiant stable (`crypto.randomUUID()`) ; aucun libellé affiché ne sert de
clé, ce qui permet de renommer un poste sans rien casser. Les postes suivis sont
identifiés par une clé technique (`vidange`, `filtre_air`, …) distincte de leur
libellé.

L'export JSON contient les cinq clés sans exception, plus un numéro de version
de format.

## Développement

Aucune dépendance, aucune compilation, aucun `npm`. Quatre fichiers :

| Fichier | Rôle |
|---|---|
| `index.html` | structure des trois vues |
| `styles.css` | mise en forme |
| `app.js` | données, calcul des échéances, rendu, import/export |
| `sw.js` | mise en cache hors ligne, réseau d'abord |

Pour travailler dessus, servez le dossier en local :

```
python3 -m http.server 8000
```

puis ouvrez `http://localhost:8000` dans un navigateur réduit à 375 × 812.

Vérifications avant publication :

```
node --check app.js
node --check sw.js
python3 -c "import json; json.load(open('manifest.webmanifest'))"
```

Le service worker sert le réseau en priorité et retombe sur le cache. **Si vous
modifiez la liste `FICHIERS` de `sw.js`, incrémentez la constante `CACHE`**,
sinon les téléphones conservent l'ancienne version.

## Réglages des échéances

Les intervalles par défaut se trouvent en tête de `app.js`
(`REGLES_PAR_DEFAUT`). Ils correspondent à un diesel courant ; adaptez-les au
carnet du constructeur de votre véhicule. Un poste ajouté à cette liste apparaît
automatiquement au démarrage suivant, sans écraser les réglages existants.
