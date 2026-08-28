# Carnet d'entretien

Application web pour téléphone qui suit l'entretien d'une voiture : ce qui a été
fait, ce que ça a coûté, et surtout ce qui arrive à échéance. Elle fonctionne
sans réseau, sans compte et sans serveur.

Le champ **Nom du garage** propose les garages déjà connus au fur et à mesure de
la frappe, la partie saisie surlignée, et se tait dès que rien ne correspond —
c'est alors un nouveau garage. La liste est construite par l'application plutôt
que par un `<datalist>` natif, dont le rendu et le filtrage varient trop d'un
navigateur mobile à l'autre.

Dans la liste des véhicules, chaque ligne porte deux actions : l'appui choisit
le véhicule à suivre, le bouton à droite ouvre ses actions — le suivre, modifier
sa fiche, le supprimer — sans avoir à basculer dessus au préalable. Supprimer un
véhicule n'emporte que son propre historique ; le dernier véhicule peut être
supprimé lui aussi, l'application repartant alors vide.

L'application suit **plusieurs véhicules**. Chacun a son carnet, ses relevés,
ses postes suivis et ses pneus ; le nom affiché en haut de l'écran du jour sert
de sélecteur. Un véhicule déclare son nombre de roues — deux ou quatre —, ce qui
change le schéma des pneus, et ses pressions recommandées.

## Ce qu'elle fait

- **Aujourd'hui** — le kilométrage du jour (estimé à partir de vos relevés) et
  la liste des postes classés par urgence : en retard, bientôt, à jour, jamais
  renseignés.
- **Carnet** — l'historique complet, groupé par année, filtrable par catégorie
  et par intervenant, et interrogeable par un champ de recherche, avec la distinction entre le
  montant facturé et ce que vous avez réellement payé. La recherche porte sur
  l'intitulé, les notes, le garage, la catégorie, les postes remis à zéro, la
  date et les montants ; elle ignore les accents et la casse, exige que tous
  les mots saisis soient présents, et surligne ce qu'elle a trouvé.
- **Pneus** — les quatre roues vues du dessus ; on appuie sur l'une d'elles pour
  noter sa pression et l'épaisseur de gomme restante, et l'application signale
  un sous-gonflage ou une usure proche de la limite légale.
- **Voiture** — la fiche du véhicule, la courbe du kilométrage, les dépenses par
  an, la liste des postes suivis, l'import assisté par IA et la sauvegarde.

Chaque intervention porte deux informations distinctes : sa **nature** — faite
par soi ou par un professionnel — et, pour un professionnel, le **nom du
garage**. La rangée de filtres du carnet reste donc de taille fixe (tous, moi,
en garage, et une quatrième puce qui ouvre la liste complète), quel que soit le
nombre de garages fréquentés. *Voiture → Intervenants* donne pour chacun le
nombre d'interventions, le total dépensé et la dernière visite.

Une intervention rangée dans la catégorie **Panne** reste affichée en tête de
l'écran du jour tant qu'elle n'a pas été déclarée résolue.

Le kilométrage du jour étant extrapolé entre deux relevés, l'application
réclame le compteur au lancement dès que le dernier relevé a plus d'un mois ;
« Plus tard » repousse la question d'une semaine. Le compteur affiché est
lui-même le bouton de saisie.

Chaque échéance datée peut être envoyée dans l'agenda du téléphone : le fichier
`.ics` produit contient un événement d'une journée avec un rappel une semaine
avant, ou la veille si l'échéance est proche. Une échéance déjà dépassée est
posée trois jours devant, jamais dans le passé.

Certains postes — plaquettes, pneus — sont marqués « au besoin » : ils sont
suivis dans l'historique mais ne déclenchent aucun compte à rebours, puisqu'on
les remplace à l'usure et non à date fixe.

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
L'application le rappelle d'elle-même au bout de trois mois sans export, et la
date du dernier passe en rouge dans l'écran Voiture.

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

Sept clés versionnées dans `localStorage` : `vehiculesV1`, `vehiculeV1`
(conservée telle quelle depuis la version mono-véhicule), `relevesV1`,
`interventionsV1`, `reglesV1`, `reglagesV1`, `pneusV1`. Interventions, relevés,
règles et relevés de pneus portent l'identifiant de leur véhicule ; la lecture
est toujours cadrée sur le véhicule actif.

La migration vers le parc est volontairement **non destructive** : elle écrit
`vehiculesV1` à côté de `vehiculeV1` sans toucher à cette dernière, afin qu'un
retour en arrière reste possible. Chaque enregistrement porte un
identifiant stable (`crypto.randomUUID()`) ; aucun libellé affiché ne sert de
clé, ce qui permet de renommer un poste sans rien casser. Les postes suivis sont
identifiés par une clé technique (`vidange`, `filtre_air`, …) distincte de leur
libellé.

L'export JSON contient les six clés sans exception, plus un numéro de version
de format.

L'import accepte aussi un **fragment** : un objet portant `"mode":"ajout"`, ou
dépourvu de véhicule et de règles, complète le carnet au lieu de le remplacer.
Un identifiant déjà présent est ignoré, si bien qu'un même fragment importé deux
fois ne crée pas de doublon. C'est ce format que produit le prompt de
*Voiture → Dicter à une IA*.

## Mouvement

Les feuilles montent depuis le bas en 240 ms et redescendent par le même chemin
en 190 ms, le voile suivant. Comme la fermeture d'un `<dialog>` retire l'élément
du flux sans transition possible, `fermerFeuille()` joue la sortie puis ferme,
avec un garde-fou si l'animation ne se déclenche pas ; la touche Échap et le
geste « retour » passent par le même chemin via l'événement `cancel`.

Une feuille se ferme aussi **en la tirant vers le bas**. Le geste est pris
depuis la bande de préhension — poignée, titre, sous-titre — ou depuis le
contenu lorsqu'il est déjà en haut, faute de quoi il volerait le défilement. La
feuille suit le doigt, le voile s'éclaircit à mesure, et elle repart de
l'endroit où le doigt a lâché : au-delà de 110 px, ou de 60 px lancés à plus de
0,5 px/ms, elle s'en va ; en deçà elle revient en place. Un geste horizontal, ou
parti d'un champ de saisie, est ignoré.

Enchaîner deux feuilles ne fait pas resauter la feuille : seul son contenu
change en fondu. Les vues se remplacent en 170 ms, le toast sort en 180 ms.

Sous `prefers-reduced-motion`, tout est coupé — pseudo-éléments compris, le
sélecteur universel ne les couvrant pas — et les fermetures redeviennent
immédiates.

## Développement

Aucune dépendance, aucune compilation, aucun `npm`. Quatre fichiers :

| Fichier | Rôle |
|---|---|
| `index.html` | structure des trois vues |
| `styles.css` | mise en forme |
| `donnees.js` | stockage, migrations, véhicules, formats, sauvegarde |
| `echeances.js` | kilométrage, échéances, pneus, agenda |
| `app.js` | interface : écrans, feuilles, gestes, navigation |
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

Ses requêtes réseau portent `cache: 'no-store'` : sans cela le navigateur peut y
répondre depuis son propre cache HTTP — GitHub Pages le fixe à dix minutes — et
le « réseau d'abord » sert une version périmée sans le savoir. Une application
installée gardant sa page en mémoire, la page se recharge une fois lorsqu'un
service worker fraîchement installé prend la main. En dernier recours, *Voiture
→ Chercher une mise à jour* vide les caches et recharge ; le numéro de version
affiché à côté permet de vérifier ce qui tourne réellement.

## Réglages des échéances

Les intervalles par défaut se trouvent en tête de `app.js`
(`REGLES_PAR_DEFAUT`). Ils correspondent à un diesel courant ; adaptez-les au
carnet du constructeur de votre véhicule. Un poste ajouté à cette liste apparaît
automatiquement au démarrage suivant, sans écraser les réglages existants.
