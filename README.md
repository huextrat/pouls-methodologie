# Méthodologie Pouls

Moteur public, testable et reproductible utilisé pour agréger les sondages de
la présidentielle française de 2027 dans [Pouls](https://pouls.app).

Ce dépôt publie les règles de calcul, pas seulement leur description :

- validation du flux source ;
- déduplication des hypothèses d’un même sondage ;
- moyenne pondérée par récence et taille d’échantillon ;
- fenêtre glissante adaptative ;
- marge pédagogique et tendance prudente ;
- séries historiques ;
- agrégation des duels de second tour réellement mesurés.

Il ne contient ni l’application mobile, ni le Worker Cloudflare, ni les
notifications, ni aucune donnée utilisateur.

## Reproduire un calcul

Prérequis : Node.js 22 ou plus récent et Corepack.

```bash
corepack enable
yarn install
yarn reproduce --now 2026-08-31 --out resultat.json
```

Sans argument, `reproduce` télécharge le JSON public de
[`MieuxVoter/presidentielle2027`](https://github.com/MieuxVoter/presidentielle2027).
On peut aussi utiliser un fichier local ou une autre URL compatible :

```bash
yarn reproduce ./presidentielle2027.json --now 2026-08-31
```

La date `--now` est volontairement injectable : deux exécutions sur la même
source et à la même date doivent produire les mêmes résultats, hors horodatage
`generatedAt`.

## Règles par défaut

| Paramètre                         |                   Valeur |
| --------------------------------- | -----------------------: |
| Fenêtres essayées                 |    30, 45, puis 60 jours |
| Minimum de sondages distincts     |                        5 |
| Décroissance de récence `τ`       |                 14 jours |
| Poids d’échantillon               |            `√(n / 1000)` |
| Couverture minimale d’un candidat |                     40 % |
| Buckets de tendance               |                 14 jours |
| Historique de tendance            |                365 jours |
| Fenêtres des duels                | 120, 240, puis 540 jours |

La justification complète, les limites et les non-objectifs sont détaillés
dans [METHODOLOGIE.md](METHODOLOGIE.md).

## Utiliser le moteur

```ts
import {
  aggregate,
  buildTrend,
  curateFeed,
  normalizeFirstRound,
  parseFeed,
} from "pouls-methodologie";

const feed = curateFeed(parseFeed(json));
const polls = normalizeFirstRound(feed);
const result = aggregate(polls, new Date("2026-08-31"));
const trend = buildTrend(
  polls,
  new Date("2026-08-31"),
  result.candidates.map((candidate) => candidate.candidateId),
);
```

Les fonctions de calcul sont pures. Le réseau et les écritures de fichiers sont
confinés au script de reproduction.

## Vérifier le dépôt

```bash
yarn check
```

Cette commande vérifie le formatage, les types, les tests et la compilation du
paquet.

## Données et crédits

La source utilisée par Pouls est
[`MieuxVoter/presidentielle2027`](https://github.com/MieuxVoter/presidentielle2027),
publiée sous licence MIT. Aucune copie du jeu complet n’est incluse ici ; le
script de reproduction le télécharge directement depuis son dépôt.

Le code de ce dépôt est publié sous [licence MIT](LICENSE).
