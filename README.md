<div align="center">

# Pouls · Méthodologie

**Le moteur ouvert qui transforme les sondages publiés en une lecture agrégée, prudente et reproductible.**

[![CI](https://github.com/huextrat/pouls-methodologie/actions/workflows/ci.yml/badge.svg)](https://github.com/huextrat/pouls-methodologie/actions/workflows/ci.yml)
[![Licence MIT](https://img.shields.io/badge/licence-MIT-3F4650.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg)](https://www.typescriptlang.org/)

[Pouls](https://pouls.app) · [Méthode détaillée](METHODOLOGIE.md) · [Données sources](https://github.com/MieuxVoter/presidentielle2027)

</div>

## Pourquoi ce dépôt ?

Un agrégat de sondages repose sur des choix : fenêtre temporelle, pondération,
traitement des hypothèses, seuil de couverture ou encore représentation de
l’incertitude. Ils doivent pouvoir être compris, discutés et vérifiés.

Ce dépôt publie le moteur utilisé par **Pouls** pour agréger les sondages de la
présidentielle française de 2027. Les règles sont écrites en TypeScript, testées
et accompagnées de leur justification méthodologique.

```text
Flux MieuxVoter
      │
      ▼
validation → normalisation → déduplication des hypothèses
      │
      ├── moyenne pondérée → classement
      ├── relevés historiques → tendances
      └── face-à-face mesurés → duels de second tour
```

## Ce que calcule Pouls

- une moyenne pondérée par **récence × racine de la taille d’échantillon** ;
- une fenêtre glissante de **30 jours**, élargie à 45 puis 60 jours si nécessaire ;
- une seule contribution par enquête et par candidat, même lorsqu’un institut
  publie plusieurs hypothèses ;
- une marge fondée sur la taille moyenne d’un sondage, utilisée comme repère
  pédagogique prudent ;
- une tendance signalée uniquement lorsque l’évolution dépasse cette marge ;
- des duels de second tour issus de face-à-face réellement mesurés, sans
  projection automatique de reports de voix.

Les formules, leurs motivations et leurs limites sont détaillées dans
[`METHODOLOGIE.md`](METHODOLOGIE.md).

## Reproduire un calcul

Prérequis : **Node.js 22+** et **Corepack**.

```bash
git clone https://github.com/huextrat/pouls-methodologie.git
cd pouls-methodologie
corepack enable
yarn install
yarn reproduce --now 2026-08-31 --out resultat.json
```

Par défaut, la commande télécharge le flux public actuel de
[`MieuxVoter/presidentielle2027`](https://github.com/MieuxVoter/presidentielle2027).
Elle accepte également un fichier local ou une URL compatible :

```bash
yarn reproduce ./presidentielle2027.json \
  --now 2026-08-31 \
  --out resultat.json
```

> [!NOTE]
> `--now` fixe la date du calcul, mais la source distante reste sa version
> actuelle. Pour reproduire strictement un résultat historique, utilisez un
> snapshot du flux correspondant à la date recherchée.

À source et date identiques, les résultats numériques sont déterministes. Seul
l’horodatage `generatedAt` varie entre deux exécutions.

## Paramètres par défaut

| Paramètre                         |                   Valeur |
| --------------------------------- | -----------------------: |
| Fenêtres du premier tour          |    30, 45, puis 60 jours |
| Minimum de sondages distincts     |                        5 |
| Décroissance de récence `τ`       |                 14 jours |
| Poids d’échantillon               |            `√(n / 1000)` |
| Couverture minimale d’un candidat |                     40 % |
| Pas des relevés de tendance       |                 14 jours |
| Profondeur de l’historique        |                365 jours |
| Fenêtres des duels                | 120, 240, puis 540 jours |

Tous ces paramètres sont explicites et injectables dans les fonctions du moteur.

## Utiliser le moteur

```ts
import {
  aggregate,
  buildTrend,
  curateFeed,
  normalizeFirstRound,
  parseFeed,
} from "pouls-methodologie";

const asOf = new Date("2026-08-31");
const feed = curateFeed(parseFeed(json));
const polls = normalizeFirstRound(feed);

const firstRound = aggregate(polls, asOf);
const trend = buildTrend(
  polls,
  asOf,
  firstRound.candidates.map((candidate) => candidate.candidateId),
);
```

Les fonctions exportées sont pures : elles reçoivent des données et renvoient
un résultat sans accès réseau ni écriture sur le disque.

## Développement

```bash
yarn check
```

La vérification complète exécute successivement le formatage, le typecheck, les
tests et la compilation du paquet. La même commande est lancée par la CI à
chaque push et chaque pull request.

Les contributions sont bienvenues. Toute modification qui change un résultat
doit être accompagnée d’un test et d’une mise à jour de la méthodologie — voir
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## Données, crédits et licence

Les sondages proviennent du projet
[`MieuxVoter/presidentielle2027`](https://github.com/MieuxVoter/presidentielle2027),
publié sous licence MIT. Le script de reproduction consulte directement cette
source ; le jeu de données complet n’est pas dupliqué dans ce dépôt.

Le moteur Pouls est distribué sous [licence MIT](LICENSE).
